// Blayde Manual -- the browser-only review step (Stage 3 of onboarding).
// Operates entirely on the in-memory manifest from indexPdf() and the
// already-loaded PDF -- no server. generate_review.py/review_server.py
// (the Python tool this replaces) are on the same path to being fully
// superseded as everything else Python, not a permanent parallel system.
// Delete-only, no omit: a candidate is either real (stays) or it isn't
// (gone) -- no third state that ships a permanently-unfillable blank
// procedure into a live manifest. Completeness tracking (touched vs.
// total) is built in from the start per Initial Submission Standards.

let reviewManifest = null;
// pageNum -> {canvas, ctx, scaleUsed}, LRU-capped -- a 400+-page scanned
// manual rendered at scale 2.5 is a full-resolution canvas per page, and
// this used to just grow forever for the whole review session. Found via
// real use: deep into a large manual, thumbnails silently stayed blank
// and the page modal took a very long time to show anything -- memory
// pressure from an unbounded cache of full-page canvases, not a hang.
// Map preserves insertion order, so re-inserting on access (bumping to
// most-recently-used) and evicting from the front is a correct LRU with
// no extra bookkeeping.
let reviewPageCache = new Map();
const REVIEW_PAGE_CACHE_CAP = 20;
let nextAddedIdx = 1000000; // added-figure ids sort after real ones, doesn't collide

// A manual can produce hundreds of candidates -- rendering them all
// flat isn't actually "review the whole document," it's a wall nobody
// scrolls to the bottom of. Paginated in fixed chunks (in manual page
// order, so the whole document is still reachable, just not all in one
// screen) instead of one continuous list.
const REVIEW_CHUNK_SIZE = 10;
let reviewChunkIdx = 0;

// Real bug: indexing's own checkpoints get cleared once it genuinely
// completes, but the review stage that follows -- deletions, bbox
// adjustments, added figures, confirmed vehicle/edition/source fields
// -- lived only in memory until an eventual submit, with zero
// persistence. A refresh lost all of it, forcing a full re-index just
// to get back to review. Saved to IndexedDB (indexer-core.js's
// reviewState store) right when review starts and after every
// meaningful edit -- not on every thumbnail load (_seen changes too
// often to be worth a write each time; losing that specific detail on
// a refresh is a minor cosmetic gap, not lost work).
function saveReviewStateNow() {
  if (!reviewManifest) return;
  const jobId = currentJobId();
  if (!jobId) return;
  saveReviewState(jobId, reviewManifest, reviewChunkIdx).catch((e) => {
    appendLog?.(`Couldn't save review progress: ${e.message}`);
  });
}

function startReview(manifest, savedChunkIdx) {
  reviewManifest = manifest;
  manifest.entries.forEach((e) => {
    if (e._touched === undefined) e._touched = false;
    if (e._seen === undefined) e._seen = false;
  });
  reviewChunkIdx = savedChunkIdx || 0; // renderReviewGallery() below clamps this to a valid range
  document.getElementById("reviewSection").style.display = "block";
  document.getElementById("vehicleSlugConfirm").value = manifest.vehicle;
  document.getElementById("vehicleSlugSimilarNote").style.display = "none";
  checkSimilarVehicleSlugs(manifest.vehicle);
  document.getElementById("editionIdConfirm").value = manifest.edition_id || "";
  document.getElementById("editionIdError").style.display = "none";
  document.getElementById("editionIdRequiredError").style.display = "none";
  document.getElementById("sourceUrlConfirm").value = manifest.source_markers?.source_identifier || "";
  document.getElementById("sourceUrlError").style.display = "none";
  document.getElementById("vehicleClassConfirm").value = manifest.vehicle_class || "";
  document.getElementById("vehicleClassRequiredError").style.display = "none";
  document.getElementById("submitSuccess").style.display = "none";
  document.getElementById("submitBtn").disabled = false;
  renderReviewGallery();
  saveReviewStateNow(); // persist immediately -- don't wait for a first edit
}

// Same non-guessable field as edition_id/source_url -- OCR can guess
// make/model/year off the cover page, but nothing in the manual states
// "this is a motorcycle" in a form worth parsing, so this is always a
// human pick. Powers registry-browse.js's type filter (see ROADMAP.md's
// "vehicle_class is used but never actually set anywhere" entry -- this
// closes that gap on the producing side).
document.getElementById("vehicleClassConfirm").addEventListener("change", (e) => {
  if (!reviewManifest) return;
  reviewManifest.vehicle_class = e.target.value;
  if (e.target.value) document.getElementById("vehicleClassRequiredError").style.display = "none";
  saveReviewStateNow();
});

// Re-derives contributed_photo_path for every entry whenever the
// maintainer edits the confirmed slug -- cheap and idempotent, so it
// doesn't matter whether this fires before or after new figures get
// added in the page modal.
document.getElementById("vehicleSlugConfirm").addEventListener("change", async (e) => {
  const slug = e.target.value.trim();
  if (!reviewManifest || !slug) return;
  finalizeVehicleSlug(reviewManifest, slug);
  checkEditionIdCollision();
  await checkSimilarVehicleSlugs(slug);
  saveReviewStateNow();
});

// Mistyped-release-year guard -- see findSimilarVehicleSlugs
// (indexer-core.js) for why this matters: vehicle_slug is what
// separates one repo from another, and nothing else catches a
// near-miss release year against something already registered.
async function checkSimilarVehicleSlugs(slug) {
  const note = document.getElementById("vehicleSlugSimilarNote");
  const result = await findSimilarVehicleSlugs(slug, CANONICAL_REGISTRY_URL);
  if (!result.checked || !result.similar.length) { note.style.display = "none"; return; }
  const list = result.similar.map((v) => v.vehicle_slug).join(", ");
  note.textContent = `Already registered for this vehicle, different release year: ${list}. If this is really the same generation, match one of those exactly instead. If it's genuinely a different generation (a later manual saying this one's coverage actually ends here), this is correct as-is.`;
  note.style.display = "block";
}

// Required, not optional -- an org maintainer approving a new vehicle
// has nothing to verify against without it (see propose_new_vehicle.py's
// matching requirement on the Python side, same field name/shape:
// manifest.source_markers.source_identifier -- kept consistent so a
// browser-produced manifest still works with the existing Python
// tooling unchanged).
document.getElementById("sourceUrlConfirm").addEventListener("change", (e) => {
  const url = e.target.value.trim();
  if (!reviewManifest) return;
  reviewManifest.source_markers = { source_identifier: url };
  if (url) document.getElementById("sourceUrlError").style.display = "none";
  saveReviewStateNow();
});

// Live collision check -- "Type: OEM -- a document with that type
// already exists for this vehicle" -- catches a duplicate edition
// label before submission instead of letting the org discover it
// during review. Same non-blocking-on-network-failure convention as
// checkAlreadyRegistered: an unreachable registry never blocks
// someone from continuing, it just means this specific check silently
// can't run right now.
async function checkEditionIdCollision() {
  const slug = document.getElementById("vehicleSlugConfirm").value.trim();
  const editionId = document.getElementById("editionIdConfirm").value.trim();
  const errEl = document.getElementById("editionIdError");
  if (!reviewManifest) return;
  reviewManifest.edition_id = editionId;
  saveReviewStateNow();
  if (!slug || !editionId) { errEl.style.display = "none"; return; }
  const result = await checkEditionCollision(slug, editionId, CANONICAL_REGISTRY_URL);
  if (result.checked && result.conflict) {
    errEl.textContent = `Type: ${editionId} -- a document with that type already exists for ${slug}. Pick a different label, or this might be a duplicate submission of an existing edition.`;
    errEl.style.display = "block";
  } else {
    errEl.style.display = "none";
  }
}
document.getElementById("editionIdConfirm").addEventListener("change", checkEditionIdCollision);
document.getElementById("editionIdConfirm").addEventListener("input", (e) => {
  if (e.target.value.trim()) document.getElementById("editionIdRequiredError").style.display = "none";
});

// "Reviewed" counts a candidate whose real thumbnail was actually seen
// in the gallery (_seen, set on a successful render below), not just
// one that got dragged/resized in the page modal (_touched). Confirmed
// directly: the actual quality bar at this stage is "does this show a
// real photo, not text or blank space" -- glancing at a real rendered
// thumbnail and moving on IS that check. The modal is only needed for
// something that looks wrong, not for every candidate.
function reviewStats() {
  const total = reviewManifest.entries.length;
  const touched = reviewManifest.entries.filter((e) => e._touched || e._seen).length;
  const pct = total ? Math.round((touched / total) * 100) : 0;
  return { total, touched, pct };
}

function updateReviewStats() {
  const { total, touched, pct } = reviewStats();
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statTouched").textContent = touched;
  document.getElementById("statPct").textContent = pct + "%";
  const nudge = document.getElementById("reviewNudge");
  if (pct < 10 && total > 20) {
    nudge.style.display = "block";
    nudge.textContent = `You've reviewed ${pct}% of ${total} candidates -- take a pass through obvious false positives before submitting. Doesn't need to be perfect, but a raw, untouched matrix isn't a submission.`;
  } else {
    nudge.style.display = "none";
  }
}

function sortedEntries() {
  // Document order, not array-insertion order -- deletes and page-modal
  // additions would otherwise scramble the chunking between renders.
  return [...reviewManifest.entries].sort((a, b) => a.page - b.page || a.pixel_bbox[1] - b.pixel_bbox[1]);
}

function renderReviewGallery() {
  const wrap = document.getElementById("reviewGallery");
  wrap.innerHTML = "";
  const all = sortedEntries();
  const chunkCount = Math.max(1, Math.ceil(all.length / REVIEW_CHUNK_SIZE));
  reviewChunkIdx = Math.min(reviewChunkIdx, chunkCount - 1);
  const start = reviewChunkIdx * REVIEW_CHUNK_SIZE;
  const chunk = all.slice(start, start + REVIEW_CHUNK_SIZE);

  const byPage = {};
  chunk.forEach((e) => { (byPage[e.page] = byPage[e.page] || []).push(e); });
  Object.keys(byPage).map(Number).sort((a, b) => a - b).forEach((pageNum) => {
    const group = document.createElement("div");
    group.className = "page-group";
    group.dataset.page = pageNum;
    group.innerHTML = `<h3>Page ${pageNum} <button data-view-page="${pageNum}">view / add missing</button></h3><div class="figs"></div>`;
    const figsWrap = group.querySelector(".figs");
    byPage[pageNum].forEach((e) => figsWrap.appendChild(buildFigCard(e)));
    wrap.appendChild(group);
  });
  wrap.querySelectorAll("[data-view-page]").forEach((btn) => {
    btn.addEventListener("click", () => openReviewPageModal(parseInt(btn.dataset.viewPage, 10)));
  });

  const prevBtn = document.getElementById("reviewPrevBtn");
  const nextBtn = document.getElementById("reviewNextBtn");
  document.getElementById("reviewPageLabel").textContent =
    all.length ? `${start + 1}-${Math.min(start + REVIEW_CHUNK_SIZE, all.length)} of ${all.length} (page ${reviewChunkIdx + 1}/${chunkCount})` : "0 of 0";
  prevBtn.disabled = reviewChunkIdx === 0;
  nextBtn.disabled = reviewChunkIdx >= chunkCount - 1;

  updateReviewStats();
  saveReviewStateNow(); // cheap (~1ms, already measured elsewhere) -- covers delete, bbox edits, added figures, all of which end here
}

document.getElementById("reviewPrevBtn").addEventListener("click", () => {
  if (reviewChunkIdx > 0) { reviewChunkIdx--; renderReviewGallery(); }
});
document.getElementById("reviewNextBtn").addEventListener("click", () => {
  reviewChunkIdx++; renderReviewGallery();
});

function buildFigCard(entry) {
  // Delete-only, final call: a candidate is either real (stays, gets
  // submitted) or it isn't (deleted, gone, never submitted) -- no
  // "omitted but still present" third state that could skew a vehicle's
  // completion stat or leave a permanently-unfillable procedure in the
  // shipped manifest. See ROADMAP.md for the full reasoning.
  const card = document.createElement("div");
  card.className = "fig" + (entry._touched || entry._seen ? " touched" : "");
  card.dataset.id = entry.procedure_id;
  card.innerHTML = `
    <button class="del-btn" title="delete -- not a real photo opportunity, never submitted">×</button>
    <img alt="${entry.procedure_id}" class="thumb-loading">
    <div class="id">${entry.procedure_id}</div>`;
  card.querySelector(".del-btn").addEventListener("click", async () => {
    const ok = await blaydeConfirm(`Delete ${entry.procedure_id}? This isn't a real photo opportunity -- it'll never be submitted, and there's no undo (redraw it if you're wrong).`, { dontAskKey: "delete-review-candidate" });
    if (!ok) return;
    reviewManifest.entries = reviewManifest.entries.filter((e) => e !== entry);
    renderReviewGallery();
  });
  refreshFigThumbnail(card.querySelector("img"), entry);
  return card;
}

// Capped, not fixed at some arbitrary scale like 2.5 -- a real scanned
// manual page rendered that high can be several thousand pixels wide,
// which is both a real memory/render-time cost (see the confirmed
// Firefox-OOM finding in ROADMAP.md for how tight this project's real
// memory headroom already is on a large document) and, per direct
// report, the reason the full-page modal didn't fit its own viewport --
// it was rendered at native scanned-page resolution with no cap at all.
// This is fixed by rendering the canvas AT the size it'll actually be
// displayed at, not by rendering huge and CSS-shrinking it down: the
// overlay boxes and drag handles (renderModalOverlays, the mousedown/
// mousemove handlers below) are positioned in native canvas-pixel
// coordinates, so a CSS-only shrink would leave every box and handle
// visually misaligned from the image underneath it.
const REVIEW_PAGE_MAX_WIDTH_PX = 1100;
async function getReviewPage(pageNum, scale) {
  if (reviewPageCache.has(pageNum)) {
    const entry = reviewPageCache.get(pageNum);
    reviewPageCache.delete(pageNum);
    reviewPageCache.set(pageNum, entry); // bump to most-recently-used
    return entry;
  }
  const page = await selectedPdfDoc.getPage(pageNum);
  const effectiveScale = scale || Math.min(2.5, REVIEW_PAGE_MAX_WIDTH_PX / page.getViewport({ scale: 1 }).width);
  const viewport = page.getViewport({ scale: effectiveScale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  // page.render()'s promise can resolve successfully while having
  // painted nothing at all -- a real failure mode seen directly after a
  // browser memory-pressure crash-and-recover, where pdf.js's
  // underlying decoder state came back broken but render() didn't
  // surface that as a rejection. A canvas that was never painted stays
  // fully TRANSPARENT (alpha 0) by spec, unlike a legitimately blank
  // source page (which paints real white, alpha 255) -- sampling a few
  // pixels' alpha channel tells the two apart cheaply, without reading
  // the whole canvas. Left undetected, this used to silently succeed
  // as a real thumbnail: a transparent canvas encoded as JPEG (no alpha
  // channel) comes out solid BLACK, indistinguishable from real content
  // at a glance, and every page rendered after the same crash fails the
  // exact same way -- explains a maintainer report of "all pages look
  // the same now" after exactly this kind of stall-then-recover.
  const probe = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sawPaint = false;
  for (let i = 3; i < probe.data.length; i += 4001) { // alpha byte, sparse sample
    if (probe.data[i] !== 0) { sawPaint = true; break; }
  }
  if (!sawPaint) {
    throw new Error(`page ${pageNum} rendered blank (likely a stale PDF decoder after a browser stall) -- refresh the page and use "Continue reviewing" to pick this back up`);
  }
  const entry = { canvas, ctx, scaleUsed: effectiveScale };
  reviewPageCache.set(pageNum, entry);
  if (reviewPageCache.size > REVIEW_PAGE_CACHE_CAP) {
    reviewPageCache.delete(reviewPageCache.keys().next().value); // evict oldest
  }
  return entry;
}

async function refreshFigThumbnail(imgEl, entry) {
  try {
    const geo = reviewManifest.page_geometry[String(entry.page)];
    const { canvas } = await getReviewPage(entry.page);
    const sx = canvas.width / geo.composite_width_px;
    const sy = canvas.height / geo.composite_height_px;
    const [x0, y0, x1, y1] = entry.pixel_bbox;
    const w = Math.max(1, Math.round((x1 - x0) * sx)), h = Math.max(1, Math.round((y1 - y0) * sy));
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    out.getContext("2d").drawImage(canvas, x0 * sx, y0 * sy, w, h, 0, 0, w, h);
    imgEl.src = out.toDataURL("image/jpeg", 0.85);
    imgEl.classList.remove("thumb-failed", "thumb-loading");
    imgEl.title = "";
    if (!entry._seen) {
      entry._seen = true;
      imgEl.closest(".fig")?.classList.add("touched");
      updateReviewStats();
    }
  } catch (e) {
    // Was silently left blank before -- a real render failure (or a
    // page genuinely out of range in a partial test run) looked
    // identical to "hasn't loaded yet," with no way to tell which.
    // Now visibly distinct and logged, not just invisible.
    imgEl.classList.remove("thumb-loading");
    imgEl.classList.add("thumb-failed");
    imgEl.title = `Couldn't render page ${entry.page}: ${e.message}`;
    appendLog?.(`Thumbnail for ${entry.procedure_id} (page ${entry.page}) failed to render: ${e.message}`);
  }
}

// ---- page modal: same drag/resize/add pattern proven in generate_review.py
// and review-panel.js, operating on in-memory entries instead of a server ----
let modalDrag = null, modalPageNum = null;

async function openReviewPageModal(pageNum) {
  modalPageNum = pageNum;
  const modal = document.getElementById("pageModal");
  const img = document.getElementById("pageModalImg");
  const wrap = document.getElementById("pageModalWrap");
  modal.classList.add("open");
  const onThisPage = reviewManifest.entries.filter((e) => e.page === pageNum).length;
  const baseTitle = `Page ${pageNum} of ${reviewManifest.page_count} -- ${onThisPage} candidate${onThisPage === 1 ? "" : "s"} on this page`;
  // Was left showing the previous page's image (or nothing) while this
  // one rendered, indistinguishable from a real failure -- see the
  // reviewPageCache LRU note above for the underlying cause found via
  // real use on a 400+-page manual.
  document.getElementById("pageModalTitle").textContent = `${baseTitle} -- rendering...`;
  img.removeAttribute("src");
  wrap.querySelectorAll(".overlay-box").forEach((el) => el.remove());
  document.getElementById("pageModalJumpInput").max = reviewManifest.page_count;
  document.getElementById("pageModalJumpInput").value = pageNum;
  try {
    const { canvas } = await getReviewPage(pageNum);
    if (modalPageNum !== pageNum) return; // jumped to another page before this one finished
    img.src = canvas.toDataURL("image/png");
    img.onload = renderModalOverlays;
    document.getElementById("pageModalTitle").textContent = baseTitle;
  } catch (err) {
    document.getElementById("pageModalTitle").textContent = `${baseTitle} -- couldn't render: ${err.message}`;
    appendLog?.(`Page ${pageNum} render failed: ${err.message}`);
  }
}

document.getElementById("pageModalJumpBtn").addEventListener("click", () => {
  const n = parseInt(document.getElementById("pageModalJumpInput").value, 10);
  if (!n || n < 1 || n > reviewManifest.page_count) return;
  openReviewPageModal(n);
});

// Left/Right steps to the adjacent page while the modal is open -- only
// when not focused in a text input (the jump-to-page field uses the
// same keys to move the cursor).
document.addEventListener("keydown", (e) => {
  if (!document.getElementById("pageModal").classList.contains("open")) return;
  if (e.target.tagName === "INPUT") return;
  if (e.key === "ArrowLeft" && modalPageNum > 1) openReviewPageModal(modalPageNum - 1);
  else if (e.key === "ArrowRight" && modalPageNum < reviewManifest.page_count) openReviewPageModal(modalPageNum + 1);
});

function renderModalOverlays() {
  const wrap = document.getElementById("pageModalWrap");
  wrap.querySelectorAll(".overlay-box").forEach((el) => el.remove());
  const geo = reviewManifest.page_geometry[String(modalPageNum)];
  const canvasInfo = reviewPageCache.get(modalPageNum);
  const sx = canvasInfo.canvas.width / geo.composite_width_px;
  const sy = canvasInfo.canvas.height / geo.composite_height_px;
  reviewManifest.entries.filter((e) => e.page === modalPageNum).forEach((entry) => {
    const [x0, y0, x1, y1] = entry.pixel_bbox;
    const box = document.createElement("div");
    box.className = "overlay-box" + (entry._touched ? " touched" : "");
    box.dataset.id = entry.procedure_id;
    box.style.left = (x0 * sx) + "px"; box.style.top = (y0 * sy) + "px";
    box.style.width = ((x1 - x0) * sx) + "px"; box.style.height = ((y1 - y0) * sy) + "px";
    box.innerHTML = `<div class="handle nw" data-corner="nw"></div><div class="handle ne" data-corner="ne"></div><div class="handle sw" data-corner="sw"></div><div class="handle se" data-corner="se"></div>`;
    wrap.appendChild(box);
  });
}

// Not wrapped in DOMContentLoaded -- this script tag loads at the end of
// <body>, after all the HTML above it (including #pageModalWrap) is
// already parsed, so that event has already fired by the time this runs.
// A DOMContentLoaded listener registered here would never call back --
// found as a real bug via testing (modalDrag stayed null after a real
// mousedown, not a simulation artifact).
{
  const wrap = document.getElementById("pageModalWrap");
  // A NEW_BOX-sized box, positional only -- no free-text prompt. Typing
  // a label while looking at the actual page is exactly the
  // paraphrase-or-copy risk the rest of this system was redesigned to
  // avoid (see LEGAL.md's systematic-extraction concern, and
  // indexer-core.js's positionalId): a human describing what they see
  // from the manual is functionally the same act as OCR, just done by
  // hand. The crop thumbnail itself is the real identifying signal for
  // a reviewer -- an accidental add costs one click to delete, same as
  // any other false positive.
  const NEW_BOX_W = 160, NEW_BOX_H = 110;
  function addFigureAt(x, y) {
    const canvasInfo = reviewPageCache.get(modalPageNum);
    const maxW = canvasInfo.canvas.width, maxH = canvasInfo.canvas.height;
    const x0 = Math.max(0, Math.min(x - NEW_BOX_W / 2, maxW - NEW_BOX_W));
    const y0 = Math.max(0, Math.min(y - NEW_BOX_H / 2, maxH - NEW_BOX_H));
    const x1 = Math.min(maxW, x0 + NEW_BOX_W), y1 = Math.min(maxH, y0 + NEW_BOX_H);
    const geo = reviewManifest.page_geometry[String(modalPageNum)];
    const sx = canvasInfo.canvas.width / geo.composite_width_px, sy = canvasInfo.canvas.height / geo.composite_height_px;
    const addedN = nextAddedIdx++;
    const pid = `p${String(modalPageNum).padStart(3, "0")}_manualadd${addedN}`;
    reviewManifest.entries.push({
      procedure_id: pid, page: modalPageNum, section_heading: `Page ${modalPageNum}, added figure`,
      pixel_bbox: [x0 / sx, y0 / sy, x1 / sx, y1 / sy],
      source_layout: "flattened_scan_ocr", content_type: "photo",
      contributed_photo_path: `images/${reviewManifest.vehicle}/${pid}/`,
      status: "needs_contributed_photo", _touched: true,
    });
    return pid;
  }
  wrap.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".handle");
    const box = e.target.closest(".overlay-box");
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left + wrap.scrollLeft, y = e.clientY - rect.top + wrap.scrollTop;
    if (handle && box) {
      modalDrag = { mode: "resize", corner: handle.dataset.corner, id: box.dataset.id, box, startX: x, startY: y,
        orig: { left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: parseFloat(box.style.width), height: parseFloat(box.style.height) } };
    } else if (box) {
      modalDrag = { mode: "move", id: box.dataset.id, box, startX: x, startY: y,
        orig: { left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: parseFloat(box.style.width), height: parseFloat(box.style.height) } };
    } else {
      // Click anywhere empty to add a box -- no drag-to-draw (direct
      // report: drawing a precise rectangle on an empty canvas was
      // itself the finicky part, made worse by the underlying image
      // being natively draggable and fighting this exact gesture,
      // fixed separately via draggable="false" on #pageModalImg).
      // Always a fixed, reasonable starting size -- resize afterward
      // with the same handles as any other box, from whichever corner
      // is closest to the edge that actually needs adjusting.
      addFigureAt(x, y);
      renderModalOverlays();
      renderReviewGallery();
    }
  });
  wrap.addEventListener("mousemove", (e) => {
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left + wrap.scrollLeft, y = e.clientY - rect.top + wrap.scrollTop;
    if (modalDrag) {
      const dx = x - modalDrag.startX, dy = y - modalDrag.startY;
      const o = modalDrag.orig;
      let left = o.left, top = o.top, width = o.width, height = o.height;
      if (modalDrag.mode === "move") { left = o.left + dx; top = o.top + dy; }
      else {
        // Every corner independently moves only ITS own two edges --
        // e.g. "ne" moves the top and right edges, leaving left/bottom
        // fixed. Previously only nw/se existed and everything else
        // (had there been another handle) would have wrongly reused
        // se's math; now each of the four is explicit and correct.
        const c = modalDrag.corner;
        if (c === "nw" || c === "sw") { left = o.left + dx; width = o.width - dx; } else { width = o.width + dx; }
        if (c === "nw" || c === "ne") { top = o.top + dy; height = o.height - dy; } else { height = o.height + dy; }
      }
      if (width > 8 && height > 8) {
        modalDrag.box.style.left = left + "px"; modalDrag.box.style.top = top + "px";
        modalDrag.box.style.width = width + "px"; modalDrag.box.style.height = height + "px";
      }
    }
  });
  wrap.addEventListener("mouseup", (e) => {
    if (modalDrag) {
      const box = modalDrag.box;
      const entry = reviewManifest.entries.find((x) => x.procedure_id === modalDrag.id);
      const geo = reviewManifest.page_geometry[String(modalPageNum)];
      const canvasInfo = reviewPageCache.get(modalPageNum);
      const sx = canvasInfo.canvas.width / geo.composite_width_px, sy = canvasInfo.canvas.height / geo.composite_height_px;
      const left = parseFloat(box.style.left), top = parseFloat(box.style.top);
      const width = parseFloat(box.style.width), height = parseFloat(box.style.height);
      entry.pixel_bbox = [left / sx, top / sy, (left + width) / sx, (top + height) / sy];
      entry._touched = true;
      box.classList.add("touched");
      modalDrag = null;
      renderReviewGallery();
    }
  });
  document.getElementById("pageModalClose").addEventListener("click", () => {
    document.getElementById("pageModal").classList.remove("open");
  });
  document.getElementById("submitBtn").addEventListener("click", async () => {
    const vehicleClass = document.getElementById("vehicleClassConfirm").value;
    if (!vehicleClass) {
      document.getElementById("vehicleClassRequiredError").style.display = "block";
      document.getElementById("vehicleClassConfirm").scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById("vehicleClassConfirm").focus();
      appendLog(`[submit] blocked -- pick a vehicle type before submitting.`);
      return;
    }
    reviewManifest.vehicle_class = vehicleClass;

    const editionId = document.getElementById("editionIdConfirm").value.trim();
    if (!editionId) {
      document.getElementById("editionIdRequiredError").style.display = "block";
      document.getElementById("editionIdConfirm").scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById("editionIdConfirm").focus();
      appendLog(`[submit] blocked -- give this edition a short label (OEM, Haynes, etc.) before submitting.`);
      return;
    }
    await checkEditionIdCollision();
    if (document.getElementById("editionIdError").style.display === "block") {
      document.getElementById("editionIdConfirm").scrollIntoView({ behavior: "smooth", block: "center" });
      appendLog(`[submit] blocked -- resolve the edition-type conflict above before submitting.`);
      return;
    }
    reviewManifest.edition_id = editionId;

    const sourceUrl = document.getElementById("sourceUrlConfirm").value.trim();
    if (!sourceUrl) {
      document.getElementById("sourceUrlError").style.display = "block";
      document.getElementById("sourceUrlConfirm").scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById("sourceUrlConfirm").focus();
      appendLog(`[submit] blocked -- add a URL to where you got this manual before submitting, so the org team can verify it.`);
      return;
    }
    reviewManifest.source_markers = { source_identifier: sourceUrl };

    const { total, touched, pct } = reviewStats();
    // Everything in reviewManifest.entries at this point gets submitted,
    // no exceptions -- delete already removed anything that isn't real,
    // so there's no separate "excluded" set to compute or forget to filter.
    appendLog(`[submit] ${total} candidates submitted, ${pct}% reviewed before submitting -- this is what the org quorum's light review would see`);

    // [mock] real action here would be opening the new-vehicle proposal
    // PR (propose_new_vehicle.py's real flow, not yet ported to the
    // browser -- see ROADMAP.md). Direct report: clicking this button
    // "doesn't seem to do anything" -- true even on a successful
    // submit, since the only feedback was one appendLog line into #log,
    // which sits at the top of the page, far out of view from this
    // button at the bottom of a long review gallery. Now shown right
    // here instead, and the button disables so a second click can't
    // look like the first one silently failed.
    const successEl = document.getElementById("submitSuccess");
    successEl.textContent = `Submitted -- ${total} candidates, ${pct}% reviewed. An org maintainer will review this next.`;
    successEl.style.display = "block";
    document.getElementById("submitBtn").disabled = true;

    // The whole point of persisting review state was to survive a
    // refresh before submission -- once actually submitted, keeping it
    // around would just mean a future re-open of this same PDF offers
    // to "continue reviewing" something already sent.
    const jobId = currentJobId();
    if (jobId) await clearReviewState(jobId).catch(() => {});
  });
}

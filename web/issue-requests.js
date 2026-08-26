// Blayde Manual -- Issue Requests. Reuses the actual patcher mechanism
// instead of inventing a fourth "load the current version" renderer:
// pick a repo, pick your own copy of that exact document, patch it
// against the current approved photos, and browse the real result page
// by page. Any box you adjust (move/resize an existing photo, draw a
// new one on empty space) becomes the issue -- no separate form. Right-
// click an existing photo for a lighter action (flag a problem, or
// just leave a comment).
//
// Issues funnel into the exact same review queue and review tool as
// any photo submission (MOCK_PRS / review-panel.js's accept/reject
// compare tool) -- confirmed directly: a maintainer reviewing an issue
// should be doing the same thing they already do for a photo request,
// not learning a second review UI. See ROADMAP.md's Issue Requests
// entry for the full reasoning.

let issueRepoUrl = null;
let issueManifest = null;
let issuePhotos = null; // Map filename -> Uint8Array/bytes-like
let issuePdfDoc = null;
let issuePageCache = {};
let issuePageNum = 1;
let pendingIssues = []; // {kind, procedure_id, page, bbox, note, label}

function issueLog(msg) {
  const el = document.getElementById("issueLog");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

// Same filename convention patcher.js's parsePhotoFilename uses
// (<procedure_id>__by_<username>.ext) -- not importing patcher.js
// itself here, since its top-level code binds to index.html's own
// DOM elements and would throw on a page that doesn't have them.
function issueParsePhotoFilename(filename) {
  const stem = filename.replace(/\.(jpe?g|png|webp)$/i, "");
  const [procedureId] = stem.split("__by_");
  return procedureId;
}

function populateIssueRepoSelect() {
  const select = document.getElementById("issueRepoSelect");
  select.innerHTML = "";
  const approved = (typeof maintainedApprovedRepos === "function" ? maintainedApprovedRepos() : MOCK_MAINTAINER.reposmaintained);
  const seen = new Set();
  approved.forEach((repoUrl) => {
    const editions = MOCK_REGISTRY.vehicles.filter((v) => v.repo_url === repoUrl);
    (editions.length ? editions : [{ vehicle_slug: mockVehicleSlugForRepo(repoUrl), edition_id: null }]).forEach((e) => {
      const key = repoUrl + "::" + e.edition_id;
      if (seen.has(key)) return;
      seen.add(key);
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${e.vehicle_slug} -- ${e.edition_id || "(edition not set)"}`;
      select.appendChild(opt);
    });
  });
  updateIssueSourceNote();
}

function currentIssueSelection() {
  const [repoUrl, editionId] = document.getElementById("issueRepoSelect").value.split("::");
  return { repoUrl, editionId };
}

function updateIssueSourceNote() {
  const note = document.getElementById("issueSourceNote");
  const { repoUrl } = currentIssueSelection();
  if (!repoUrl) { note.textContent = ""; return; }
  note.innerHTML = `Ensure you're using this exact document -- checking the repo's own source link once you open the editor.`;
  issueRepoUrl = repoUrl;
}

document.getElementById("issueRepoSelect").addEventListener("change", updateIssueSourceNote);

document.getElementById("issuePdfPicker").addEventListener("change", (e) => {
  document.getElementById("issueOpenEditorBtn").disabled = !e.target.files[0];
});

// Real fetch first (works once a repo is actually live); a small,
// realistic mock fallback otherwise -- same convention as every other
// tool this session, so the flow is genuinely testable before a real
// registry exists (see LEGAL.md's standing pin).
async function loadIssueManifestAndPhotos(repoUrl) {
  try {
    return await fetchManifestAndPhotos(repoUrl);
  } catch (e) {
    return {
      manifest: {
        vehicle: mockVehicleSlugForRepo(repoUrl),
        page_count: 40,
        source_markers: { source_identifier: "https://www.manualslib.com/manual/example" },
        page_geometry: { "40": { composite_width_px: 2544, composite_height_px: 3276, page_width_pt: 612, page_height_pt: 792 }, "28": { composite_width_px: 2544, composite_height_px: 3276, page_width_pt: 612, page_height_pt: 792 } },
        entries: [
          { procedure_id: "p040_2-10-periodic-maintenance_fig1", page: 40, section_heading: "PERIODIC MAINTENANCE", pixel_bbox: [1466, 222, 2326, 795] },
          { procedure_id: "p040_extra_fig2", page: 40, section_heading: "PERIODIC MAINTENANCE (cont.)", pixel_bbox: [1466, 900, 2326, 1400] },
          { procedure_id: "p028_chain-slack-adjustment_fig2", page: 28, section_heading: "CHAIN SLACK ADJUSTMENT", pixel_bbox: [900, 1400, 2100, 2600] },
        ],
      },
      photos: new Map([
        ["p040_2-10-periodic-maintenance_fig1__by_gsxr_greg.jpg", null],
      ]),
    };
  }
}

document.getElementById("issueOpenEditorBtn").addEventListener("click", async () => {
  const file = document.getElementById("issuePdfPicker").files[0];
  if (!file) return;
  document.getElementById("issueLog").textContent = "";
  issueLog(`loading ${file.name}...`);
  const buf = await file.arrayBuffer();
  issuePdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  issuePageCache = {};
  pendingIssues = [];
  renderPendingIssues();

  const { repoUrl } = currentIssueSelection();
  issueLog(`patching against ${repoUrl}'s current approved photos...`);
  const result = await loadIssueManifestAndPhotos(repoUrl);
  issueManifest = result.manifest;
  issuePhotos = result.photos;
  issueLog(`ready -- ${issueManifest.entries.length} tracked procedures, ${issuePhotos.size} approved photo(s)`);

  document.getElementById("issueEditorArea").style.display = "block";
  document.getElementById("issueJumpInput").max = issueManifest.page_count;
  await openIssuePage(issueManifest.entries[0]?.page || 1);
});

document.getElementById("issueJumpBtn").addEventListener("click", () => {
  const n = parseInt(document.getElementById("issueJumpInput").value, 10);
  if (!n || n < 1 || (issueManifest && n > issueManifest.page_count)) return;
  openIssuePage(n);
});

async function getIssuePage(pageNum, scale = 2.0) {
  if (issuePageCache[pageNum]) return issuePageCache[pageNum];
  const page = await issuePdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  issuePageCache[pageNum] = { canvas };
  return issuePageCache[pageNum];
}

async function openIssuePage(pageNum) {
  issuePageNum = pageNum;
  document.getElementById("issueJumpInput").value = pageNum;
  const onThisPage = issueManifest.entries.filter((e) => e.page === pageNum).length;
  document.getElementById("issueEditorTitle").textContent =
    `Page ${pageNum} of ${issueManifest.page_count} -- ${onThisPage} tracked procedure${onThisPage === 1 ? "" : "s"} here`;
  const { canvas } = await getIssuePage(pageNum);
  const img = document.getElementById("issuePageImg");
  img.src = canvas.toDataURL("image/png");
  img.onload = () => {
    // #issuePageInner sits at the page's native pixel size -- the same
    // space entry.pixel_bbox and every drag/resize/new-box computation
    // already use -- then gets CSS-scaled down as one unit. Scaling img
    // and the overlay boxes together this way means "fit to page" (like
    // review-panel.js's compare canvas) never needs the bbox math itself
    // to change, only mouse coordinates get divided by the same factor.
    const inner = document.getElementById("issuePageInner");
    inner.style.width = canvas.width + "px";
    inner.style.height = canvas.height + "px";
    applyIssueDisplayScale();
    renderIssueOverlays();
  };
}

function applyIssueDisplayScale() {
  const wrap = document.getElementById("issuePageWrap");
  const inner = document.getElementById("issuePageInner");
  const canvasInfo = issuePageCache[issuePageNum];
  if (!canvasInfo) return;
  const scale = Math.min(1, wrap.clientWidth / canvasInfo.canvas.width);
  inner.style.transform = `scale(${scale})`;
  // The transform shrinks the box visually but not its layout size --
  // margin-bottom pulls the wrap's own height back down to match what's
  // actually visible, so the footer below doesn't float in blank space.
  wrap.style.height = (canvasInfo.canvas.height * scale) + "px";
}

function issueDisplayScale() {
  const canvasInfo = issuePageCache[issuePageNum];
  if (!canvasInfo) return 1;
  return Math.min(1, document.getElementById("issuePageWrap").clientWidth / canvasInfo.canvas.width);
}

function findPhotoFor(procedureId) {
  for (const filename of issuePhotos.keys()) {
    if (issueParsePhotoFilename(filename) === procedureId) return filename;
  }
  return null;
}

function renderIssueOverlays() {
  const wrap = document.getElementById("issuePageInner");
  wrap.querySelectorAll(".overlay-box").forEach((el) => el.remove());
  const geo = issueManifest.page_geometry[String(issuePageNum)];
  if (!geo) return;
  const canvasInfo = issuePageCache[issuePageNum];
  const sx = canvasInfo.canvas.width / geo.composite_width_px;
  const sy = canvasInfo.canvas.height / geo.composite_height_px;
  issueManifest.entries.filter((e) => e.page === issuePageNum).forEach((entry) => {
    const [x0, y0, x1, y1] = entry.pixel_bbox;
    const box = document.createElement("div");
    box.className = "overlay-box";
    box.dataset.id = entry.procedure_id;
    box.style.left = (x0 * sx) + "px"; box.style.top = (y0 * sy) + "px";
    box.style.width = ((x1 - x0) * sx) + "px"; box.style.height = ((y1 - y0) * sy) + "px";
    const photoFilename = findPhotoFor(entry.procedure_id);
    box.innerHTML = `<div class="handle nw" data-corner="nw"></div><div class="handle se" data-corner="se"></div>`;
    if (photoFilename) {
      const img = document.createElement("img");
      const bytes = issuePhotos.get(photoFilename);
      // Real fetched bytes -> real blob URL. Mock fallback has no real
      // bytes (nothing's live yet, see LEGAL.md) -- a stand-in demo
      // image so the "load the current version" view still shows
      // something real-looking rather than a blank box.
      img.src = bytes ? URL.createObjectURL(new Blob([bytes])) : "images/hero-after.jpg";
      box.appendChild(img);
    }
    box.addEventListener("contextmenu", (e) => { e.preventDefault(); openIssueRightClickMenu(e, entry, photoFilename); });
    wrap.appendChild(box);
  });
}

// ---- drag to move/resize an existing box, or draw a new one on empty
// space -- same interaction pattern as indexer-review.js's page modal,
// reused rather than reinvented. The difference: touching a box here
// doesn't edit an in-progress manifest, it queues an issue. ----
let issueDrag = null, issueNewDrag = null;
const issueWrap = document.getElementById("issuePageWrap");
issueWrap.addEventListener("mousedown", (e) => {
  if (!issueManifest) return;
  const handle = e.target.closest(".handle");
  const box = e.target.closest(".overlay-box");
  const rect = issueWrap.getBoundingClientRect();
  const scale = issueDisplayScale();
  const x = (e.clientX - rect.left + issueWrap.scrollLeft) / scale, y = (e.clientY - rect.top + issueWrap.scrollTop) / scale;
  if (handle && box) {
    issueDrag = { mode: "resize", corner: handle.dataset.corner, id: box.dataset.id, box, startX: x, startY: y,
      orig: { left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: parseFloat(box.style.width), height: parseFloat(box.style.height) } };
  } else if (box) {
    issueDrag = { mode: "move", id: box.dataset.id, box, startX: x, startY: y,
      orig: { left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: parseFloat(box.style.width), height: parseFloat(box.style.height) } };
  } else {
    issueNewDrag = { startX: x, startY: y };
  }
});
issueWrap.addEventListener("mousemove", (e) => {
  const rect = issueWrap.getBoundingClientRect();
  const scale = issueDisplayScale();
  const x = (e.clientX - rect.left + issueWrap.scrollLeft) / scale, y = (e.clientY - rect.top + issueWrap.scrollTop) / scale;
  if (issueDrag) {
    const dx = x - issueDrag.startX, dy = y - issueDrag.startY;
    const o = issueDrag.orig;
    let left = o.left, top = o.top, width = o.width, height = o.height;
    if (issueDrag.mode === "move") { left = o.left + dx; top = o.top + dy; }
    else {
      if (issueDrag.corner === "nw") { left = o.left + dx; top = o.top + dy; width = o.width - dx; height = o.height - dy; }
      else { width = o.width + dx; height = o.height + dy; }
    }
    if (width > 8 && height > 8) {
      issueDrag.box.style.left = left + "px"; issueDrag.box.style.top = top + "px";
      issueDrag.box.style.width = width + "px"; issueDrag.box.style.height = height + "px";
      issueDrag.box.classList.add("touched");
    }
  }
});
issueWrap.addEventListener("mouseup", async (e) => {
  if (issueDrag) {
    const entry = issueManifest.entries.find((x) => x.procedure_id === issueDrag.id);
    queueStructureIssue(entry, issueDrag.box);
    issueDrag = null;
    return;
  }
  if (issueNewDrag) {
    const rect = issueWrap.getBoundingClientRect();
    const scale = issueDisplayScale();
    const x = (e.clientX - rect.left + issueWrap.scrollLeft) / scale, y = (e.clientY - rect.top + issueWrap.scrollTop) / scale;
    const x0 = Math.min(x, issueNewDrag.startX), x1 = Math.max(x, issueNewDrag.startX);
    const y0 = Math.min(y, issueNewDrag.startY), y1 = Math.max(y, issueNewDrag.startY);
    issueNewDrag = null;
    if (x1 - x0 < 15 || y1 - y0 < 15) return;
    const label = await blaydePrompt("What should be here? (short label)");
    if (label === null) return;
    const box = document.createElement("div");
    box.className = "overlay-box new-slot";
    box.style.left = x0 + "px"; box.style.top = y0 + "px";
    box.style.width = (x1 - x0) + "px"; box.style.height = (y1 - y0) + "px";
    issueWrap.appendChild(box);
    queueNewSlotIssue(label, box);
  }
});

function boxToPixelBbox(box) {
  const geo = issueManifest.page_geometry[String(issuePageNum)];
  const canvasInfo = issuePageCache[issuePageNum];
  const sx = geo.composite_width_px / canvasInfo.canvas.width, sy = geo.composite_height_px / canvasInfo.canvas.height;
  const left = parseFloat(box.style.left), top = parseFloat(box.style.top);
  const width = parseFloat(box.style.width), height = parseFloat(box.style.height);
  return [left * sx, top * sy, (left + width) * sx, (top + height) * sy].map((v) => Math.round(v));
}

function queueStructureIssue(entry, box) {
  const existing = pendingIssues.find((i) => i.kind === "structure" && i.procedure_id === entry.procedure_id);
  const bbox = boxToPixelBbox(box);
  if (existing) { existing.bbox = bbox; } else {
    pendingIssues.push({ kind: "structure", procedure_id: entry.procedure_id, page: entry.page, section_heading: entry.section_heading, bbox });
  }
  renderPendingIssues();
}

function queueNewSlotIssue(label, box) {
  const bbox = boxToPixelBbox(box);
  const pid = `p${String(issuePageNum).padStart(3, "0")}_${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}_issueadd${Date.now()}`;
  pendingIssues.push({ kind: "new-slot", procedure_id: pid, page: issuePageNum, section_heading: label, bbox });
  renderPendingIssues();
}

function queueCommentIssue(entry, note) {
  pendingIssues.push({ kind: "comment", procedure_id: entry.procedure_id, page: entry.page, section_heading: entry.section_heading, note });
  renderPendingIssues();
}

function renderPendingIssues() {
  const card = document.getElementById("issuePendingCard");
  const list = document.getElementById("issuePendingList");
  card.style.display = pendingIssues.length ? "block" : "none";
  list.innerHTML = "";
  const labels = { structure: "Reposition/resize", "new-slot": "Missing/wrong slot", comment: "Comment" };
  pendingIssues.forEach((issue) => {
    const row = document.createElement("div");
    row.className = "issue-pending-row";
    row.innerHTML = `<span>PG. ${issue.page} &mdash; ${labels[issue.kind]}: ${issue.section_heading}${issue.note ? ` &mdash; &ldquo;${issue.note}&rdquo;` : ""}</span>`;
    list.appendChild(row);
  });
}

// ---- right-click menu on an existing photo: a lighter action than
// editing the box -- flag a problem (routes to the real submit flow,
// already scoped, no new mechanism) or just leave a comment. ----
function openIssueRightClickMenu(e, entry, photoFilename) {
  const menu = document.getElementById("issueRightClickMenu");
  menu.style.left = e.clientX + "px";
  menu.style.top = e.clientY + "px";
  menu.innerHTML = `
    <button id="rcProblem">Problem with this photo &rarr;</button>
    <button id="rcComment">Add a comment</button>
  `;
  menu.style.display = "block";
  document.getElementById("rcProblem").addEventListener("click", () => {
    menu.style.display = "none";
    const url = `contribute.html?repo=${encodeURIComponent(issueRepoUrl)}&procedure=${encodeURIComponent(entry.procedure_id)}`;
    window.open(url, "_blank");
    issueLog(`opened the Contributor Portal for ${entry.procedure_id} -- a replacement photo there resolves this the normal way, no separate issue mechanism needed.`);
  });
  document.getElementById("rcComment").addEventListener("click", async () => {
    menu.style.display = "none";
    const note = await blaydePrompt(`Comment on ${entry.section_heading}:`, "");
    if (note) queueCommentIssue(entry, note);
  });
  const closeMenu = () => { menu.style.display = "none"; document.removeEventListener("click", closeMenu); };
  setTimeout(() => document.addEventListener("click", closeMenu), 0);
}

// ---- submit: every pending issue lands in the exact same queue and
// review tool as a photo submission (MOCK_PRS / review-panel.js) --
// no second review UI. issue_type distinguishes it for the accept
// handler (a structure/new-slot issue has no new photo to merge). ----
document.getElementById("issueSubmitAllBtn").addEventListener("click", () => {
  const prs = loadMockPrs(MOCK_PRS_SEED);
  const { editionId } = currentIssueSelection();
  pendingIssues.forEach((issue) => {
    const number = nextMockPrNumber(prs);
    prs.push({
      number,
      title: issue.kind === "comment" ? `Issue: comment on ${issue.section_heading}` : `Issue: ${issue.section_heading}`,
      author: "you",
      repo_url: issueRepoUrl,
      edition_id: editionId,
      procedure_id: issue.procedure_id,
      page: issue.page,
      section_heading: issue.section_heading,
      issue_type: issue.kind,
      issue_note: issue.note || null,
      original_bbox: issue.bbox || null,
      composite_width_px: issueManifest.page_geometry[String(issue.page)]?.composite_width_px,
      composite_height_px: issueManifest.page_geometry[String(issue.page)]?.composite_height_px,
      page_width_pt: issueManifest.page_geometry[String(issue.page)]?.page_width_pt,
      page_height_pt: issueManifest.page_geometry[String(issue.page)]?.page_height_pt,
    });
  });
  saveMockPrs(prs);
  issueLog(`[mock] submitted ${pendingIssues.length} issue(s) -- they'll show up in Review Photo Requests, reviewed the same way as any photo submission.`);
  pendingIssues = [];
  renderPendingIssues();
});

function initIssuesTab() {
  populateIssueRepoSelect();
}

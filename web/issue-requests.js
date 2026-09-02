// Blayde Manual -- Propose a photo location fix (Contributor Portal).
// Reuses the actual patcher mechanism instead of inventing a fourth
// "load the current version" renderer: pick a manual, pick your own
// copy of that exact document, patch it against the current approved
// photos, and browse the real result page by page. Any box you adjust
// (move/resize an existing photo, draw a new one on empty space, or
// right-click to flag one as wrong entirely) becomes a proposed
// manifest change -- no separate form.
//
// Any signed-in contributor can use this, not just a manual's own
// maintainers (see contribute.js's updateManifestFixVisibility) --
// proposals go through the same fork+PR+review pattern as a photo or a
// recategorization, reviewed by a real maintainer via the Worker's
// /accept-manifest-change gate, never applied directly.

let issueRepoUrl = null;
let issueEditionId = null;
let issueManifest = null;
let issuePhotos = null; // Map filename -> Uint8Array/bytes-like
let issuePdfDoc = null;
let issuePdfIsPatchedOutput = false;
let issuePageCache = {};
let issuePageNum = 1;
let pendingIssues = []; // {kind, procedure_id, page, bbox, section_heading}
let issueRegistryEntries = []; // real approved registry.json rows, populated once
const ISSUE_ENTRY_RENDER_CAP = 100;

// Local record of this browser's own proposals -- not the source of
// truth for whether one exists or was acted on (the real PR is), just
// enough to show a persistent "you proposed these" list with live
// status, same "don't let a submission disappear the moment you look
// away" reasoning as My Reviewables.
const MANIFEST_FIX_REQUESTS_KEY = "blayde_manifest_fix_requests_v1";
function loadManifestFixRequests() {
  try {
    const raw = localStorage.getItem(MANIFEST_FIX_REQUESTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* best-effort */ }
  return [];
}
function saveManifestFixRequests() {
  try { localStorage.setItem(MANIFEST_FIX_REQUESTS_KEY, JSON.stringify(manifestFixRequests)); } catch (e) { /* best-effort */ }
}
let manifestFixRequests = loadManifestFixRequests();

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

// Same category-filter + live-search shape as contribute.js's own
// recategorization picker (populateRecatEntrySelect) -- a flat <select>
// over every approved registry entry doesn't scale, for the same
// reason it didn't there.
async function populateIssueEntrySelect() {
  const registryData = await loadRegistry(CANONICAL_REGISTRY_URL).catch(() => ({ vehicles: [] }));
  issueRegistryEntries = (registryData.vehicles || []).filter((v) => v.status === "approved");
  await populateIssueFilterCategoryOptions();
  renderIssueEntryOptions();
}

async function populateIssueFilterCategoryOptions() {
  const select = document.getElementById("issueFilterCategory");
  const manualTypes = await loadRegistry(MANUAL_TYPES_URL).catch(() => null);
  select.innerHTML = '<option value="">All categories</option>';
  (manualTypes?.categories || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    select.appendChild(opt);
  });
}

function issueEntryMatchesSearch(entry, q) {
  if (!q) return true;
  const hay = `${entry.vehicle_display_name || ""} ${entry.vehicle_slug || ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderIssueEntryOptions() {
  const select = document.getElementById("issueEntrySelect");
  const hint = document.getElementById("issueEntryHint");
  const categoryFilter = document.getElementById("issueFilterCategory").value;
  const query = document.getElementById("issueSearchInput").value.trim();

  const matches = [];
  issueRegistryEntries.forEach((entry, i) => {
    if (categoryFilter && entry.category !== categoryFilter) return;
    if (!issueEntryMatchesSearch(entry, query)) return;
    matches.push({ entry, originalIndex: i });
  });

  select.innerHTML = '<option value="" disabled selected>Choose one&hellip;</option>';
  matches.slice(0, ISSUE_ENTRY_RENDER_CAP).forEach(({ entry, originalIndex }) => {
    const opt = document.createElement("option");
    opt.value = originalIndex;
    opt.textContent = `${entry.vehicle_display_name || entry.vehicle_slug} (${entry.edition_id})`;
    select.appendChild(opt);
  });

  if (!matches.length) {
    hint.textContent = query || categoryFilter ? "No matches. Try a different search or category." : "";
  } else if (matches.length > ISSUE_ENTRY_RENDER_CAP) {
    hint.textContent = `Showing the first ${ISSUE_ENTRY_RENDER_CAP} of ${matches.length} matches -- search or pick a category to narrow this down.`;
  } else {
    hint.textContent = "";
  }
}

document.getElementById("issueFilterCategory").addEventListener("change", renderIssueEntryOptions);
document.getElementById("issueSearchInput").addEventListener("input", renderIssueEntryOptions);

let issueVehicleLabel = null;

document.getElementById("issueEntrySelect").addEventListener("change", (e) => {
  const entry = issueRegistryEntries[parseInt(e.target.value, 10)];
  issueRepoUrl = entry.repo_url;
  issueEditionId = entry.edition_id;
  // Captured now, not looked up later from repoUrl+editionId -- a
  // proposed-fixes row needs to keep reading correctly even if the
  // registry entry it came from is later recategorized or removed.
  issueVehicleLabel = `${entry.vehicle_display_name || entry.vehicle_slug} (${entry.edition_id})${entry.category ? ` -- ${recatCategoryLabel(entry.category)}${entry.manual_type ? "/" + entry.manual_type : ""}` : ""}`;
  document.getElementById("issuePickerArea").style.display = "block";
});

function currentIssueSelection() {
  return { repoUrl: issueRepoUrl, editionId: issueEditionId };
}

document.getElementById("issuePdfPicker").addEventListener("change", (e) => {
  document.getElementById("issueOpenEditorBtn").disabled = !e.target.files[0];
});

document.getElementById("issueOpenEditorBtn").addEventListener("click", async () => {
  const file = document.getElementById("issuePdfPicker").files[0];
  if (!file) return;
  document.getElementById("issueLog").textContent = "";
  issueLog(`loading ${file.name}...`);
  const buf = await file.arrayBuffer();
  issuePdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  // Shared with every other viewer that does this same local-context
  // render -- see registry.js's resolvePageForLocalPdf for why. Checked
  // once per PDF load here (not per page), since getIssuePage renders
  // many pages from the same file as someone jumps around.
  ({ isPatchedOutput: issuePdfIsPatchedOutput } = await resolvePageForLocalPdf(issuePdfDoc, 0));
  if (issuePdfIsPatchedOutput) {
    issueLog("This looks like an already-patched Blayde Manual, not the original scan -- adjusting for its extra cover page.");
  }
  issuePageCache = {};
  pendingIssues = [];
  renderPendingIssues();

  const { repoUrl, editionId } = currentIssueSelection();
  issueLog(`patching against ${repoUrl}'s current approved photos...`);
  const result = await fetchManifestAndPhotos(repoUrl, editionId);
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

// Same &larr; Prev / Next &rarr; convention as review-panel.js's and
// org-approval.js's own page viewers -- was the one genuinely different
// nav pattern among the three (jump-only), not a design choice, just
// downstream of this tab not having real data to page through yet.
document.getElementById("issuePrevBtn").addEventListener("click", () => {
  if (issueManifest && issuePageNum > 1) openIssuePage(issuePageNum - 1);
});
document.getElementById("issueNextBtn").addEventListener("click", () => {
  if (issueManifest && issuePageNum < issueManifest.page_count) openIssuePage(issuePageNum + 1);
});

async function getIssuePage(pageNum, scale = 2.0) {
  if (issuePageCache[pageNum]) return issuePageCache[pageNum];
  const page = await issuePdfDoc.getPage(pageNum + (issuePdfIsPatchedOutput ? 1 : 0));
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
    if (pendingIssues.some((i) => i.kind === "remove" && i.procedure_id === entry.procedure_id)) {
      box.classList.add("queued-remove");
    }
    box.innerHTML = `<div class="handle nw" data-corner="nw"></div><div class="handle ne" data-corner="ne"></div><div class="handle sw" data-corner="sw"></div><div class="handle se" data-corner="se"></div>`;
    if (photoFilename) {
      const img = document.createElement("img");
      img.draggable = false;
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

// ---- click empty space to add a fixed-size box, drag an existing box
// to move it, drag its corner to resize -- same interaction pattern as
// indexer-review.js's page modal (see that file's own addFigureAt for
// the full reasoning), reused rather than reinvented. Two real,
// confirmed bugs this fixes, found via direct testing: (1) the
// underlying page image had no draggable="false", so starting a drag
// on empty space was indistinguishable from the browser's own native
// image-drag, not a rectangle draw -- indexer-review.js hit this exact
// bug first and fixed it the same way (see contribute.html's
// #issuePageImg). (2) Drag-to-draw plus a free-text label prompt was
// also just the wrong interaction entirely once indexer-review.js
// dropped both for the exact same reason LEGAL.md gives: a human
// describing what they see from the manual is functionally the same
// act as OCR, just done by hand, and a fixed-size click-to-add box
// (resizable after, with the same handles as any other box) is both
// easier to place precisely and never asks for a description. The
// difference from indexer-review.js's version: touching a box here
// doesn't edit an in-progress manifest, it queues an issue. ----
const ISSUE_NEW_BOX_W = 160, ISSUE_NEW_BOX_H = 110;
let issueDrag = null;
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
    const canvasInfo = issuePageCache[issuePageNum];
    const maxW = canvasInfo.canvas.width, maxH = canvasInfo.canvas.height;
    const x0 = Math.max(0, Math.min(x - ISSUE_NEW_BOX_W / 2, maxW - ISSUE_NEW_BOX_W));
    const y0 = Math.max(0, Math.min(y - ISSUE_NEW_BOX_H / 2, maxH - ISSUE_NEW_BOX_H));
    const newBox = document.createElement("div");
    newBox.className = "overlay-box new-slot touched";
    newBox.style.left = x0 + "px"; newBox.style.top = y0 + "px";
    newBox.style.width = ISSUE_NEW_BOX_W + "px"; newBox.style.height = ISSUE_NEW_BOX_H + "px";
    newBox.innerHTML = `<div class="handle nw" data-corner="nw"></div><div class="handle ne" data-corner="ne"></div><div class="handle sw" data-corner="sw"></div><div class="handle se" data-corner="se"></div>`;
    // Real, confirmed bug fixed here, 2026-09-03: every OTHER overlay
    // box lives inside #issuePageInner -- the element that actually
    // carries the CSS transform:scale() this whole editor uses to fit a
    // full-resolution page render into the visible width (same pattern
    // as contribute.js's own crop editor, see cssScale() there for the
    // reconciled reference). Appending here instead to #issuePageWrap
    // (the untransformed outer container) put this one box in the wrong
    // coordinate space entirely: its left/top/width/height are canvas-
    // pixel values like every other box's, but with no scale transform
    // applied to it, a screen-space mouse delta divided down to canvas-
    // pixel space (see the resize math above) landed on an unscaled
    // box and grew it by 1/scale too much -- confirmed via direct
    // measurement (a 50px real drag grew the box 169px on a 0.295
    // scale page, matching 1/0.295 almost exactly). One-line fix:
    // append to the same transformed container everything else uses.
    document.getElementById("issuePageInner").appendChild(newBox);
    newBox.addEventListener("contextmenu", (e) => { e.preventDefault(); openNewSlotRightClickMenu(e, newBox); });
    queueNewSlotIssue(newBox);
  }
});
issueWrap.addEventListener("mousemove", (e) => {
  if (!issueDrag) return;
  const rect = issueWrap.getBoundingClientRect();
  const scale = issueDisplayScale();
  const x = (e.clientX - rect.left + issueWrap.scrollLeft) / scale, y = (e.clientY - rect.top + issueWrap.scrollTop) / scale;
  const dx = x - issueDrag.startX, dy = y - issueDrag.startY;
  const o = issueDrag.orig;
  let left = o.left, top = o.top, width = o.width, height = o.height;
  if (issueDrag.mode === "move") { left = o.left + dx; top = o.top + dy; }
  else {
    // Every corner independently moves only its own two edges -- "ne"
    // moves the top and right edges, leaving left/bottom fixed, etc.
    // Previously only nw/se existed and any other corner would have
    // wrongly reused se's math; now each of the four is explicit and
    // correct, matching indexer-review.js's own fix for this.
    const c = issueDrag.corner;
    if (c === "nw" || c === "sw") { left = o.left + dx; width = o.width - dx; } else { width = o.width + dx; }
    if (c === "nw" || c === "ne") { top = o.top + dy; height = o.height - dy; } else { height = o.height + dy; }
  }
  if (width > 8 && height > 8) {
    issueDrag.box.style.left = left + "px"; issueDrag.box.style.top = top + "px";
    issueDrag.box.style.width = width + "px"; issueDrag.box.style.height = height + "px";
    issueDrag.box.classList.add("touched");
  }
});
issueWrap.addEventListener("mouseup", () => {
  if (!issueDrag) return;
  if (issueDrag.box.classList.contains("new-slot")) {
    updateNewSlotIssueBbox(issueDrag.box);
  } else {
    const entry = issueManifest.entries.find((x) => x.procedure_id === issueDrag.id);
    queueStructureIssue(entry, issueDrag.box);
  }
  issueDrag = null;
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

// No label/description asked here, on purpose -- same reasoning as
// indexer-review.js's own addFigureAt: describing what's in the manual
// by hand is functionally the same act as OCR, and the crop thumbnail
// itself (visible in the review queue once a maintainer opens this)
// is the real identifying signal, not a free-text guess typed here.
function queueNewSlotIssue(box) {
  const bbox = boxToPixelBbox(box);
  const pid = `p${String(issuePageNum).padStart(3, "0")}_issueadd${Date.now()}`;
  box.dataset.id = pid;
  pendingIssues.push({ kind: "new-slot", procedure_id: pid, page: issuePageNum, section_heading: "New photo slot", bbox });
  renderPendingIssues();
}

// Fires on every subsequent move/resize of a just-added new-slot box --
// queueNewSlotIssue only runs once, at the initial click-to-add, so a
// drag afterward needs its own path back to the same pendingIssues
// entry (matched via box.dataset.id, set above) rather than pushing a
// second, duplicate issue.
function updateNewSlotIssueBbox(box) {
  const issue = pendingIssues.find((i) => i.kind === "new-slot" && i.procedure_id === box.dataset.id);
  if (issue) issue.bbox = boxToPixelBbox(box);
  renderPendingIssues();
}

function queueRemoveIssue(entry) {
  const existing = pendingIssues.find((i) => i.kind === "remove" && i.procedure_id === entry.procedure_id);
  if (existing) return;
  pendingIssues.push({ kind: "remove", procedure_id: entry.procedure_id, page: entry.page, section_heading: entry.section_heading, bbox: entry.pixel_bbox });
  renderPendingIssues();
  renderIssueOverlays();
}

function renderPendingIssues() {
  const card = document.getElementById("issuePendingCard");
  const list = document.getElementById("issuePendingList");
  card.style.display = pendingIssues.length ? "block" : "none";
  list.innerHTML = "";
  const labels = { structure: "Reposition/resize", "new-slot": "Missing/wrong slot", remove: "Remove this slot" };
  pendingIssues.forEach((issue) => {
    const row = document.createElement("div");
    row.className = "issue-pending-row";
    row.innerHTML = `<span>PG. ${issue.page} &mdash; ${labels[issue.kind]}: ${issue.section_heading}</span>`;
    list.appendChild(row);
  });
}

// ---- right-click menu on an existing photo: a lighter action than
// editing the box -- flag a problem (routes to the real submit flow,
// already scoped, no new mechanism) or mark the slot itself as wrong,
// not just its photo. ----
function openIssueRightClickMenu(e, entry, photoFilename) {
  const menu = document.getElementById("issueRightClickMenu");
  menu.style.left = e.clientX + "px";
  menu.style.top = e.clientY + "px";
  menu.innerHTML = `
    <button id="rcProblem">Problem</button>
    <button id="rcRemove">Delete</button>
  `;
  menu.style.display = "block";
  document.getElementById("rcProblem").addEventListener("click", () => {
    menu.style.display = "none";
    const url = `contribute.html?repo=${encodeURIComponent(issueRepoUrl)}&edition=${encodeURIComponent(issueEditionId)}&procedure=${encodeURIComponent(entry.procedure_id)}`;
    window.open(url, "_blank");
    issueLog(`opened the Contributor Portal for ${entry.procedure_id} -- a replacement photo there resolves this the normal way, no separate issue mechanism needed.`);
  });
  document.getElementById("rcRemove").addEventListener("click", () => {
    menu.style.display = "none";
    queueRemoveIssue(entry);
  });
  const closeMenu = () => { menu.style.display = "none"; document.removeEventListener("click", closeMenu); };
  setTimeout(() => document.addEventListener("click", closeMenu), 0);
}

// A just-added new-slot box has no manifest entry behind it -- nothing
// to "flag a problem with" or "remove a tracked slot" from, it's a
// mistake to undo. Real gap this closes: there was no way at all to
// get rid of one after adding it, direct feedback, 2026-09-03.
function openNewSlotRightClickMenu(e, box) {
  const menu = document.getElementById("issueRightClickMenu");
  menu.style.left = e.clientX + "px";
  menu.style.top = e.clientY + "px";
  menu.innerHTML = `<button id="rcDeleteNewSlot">Delete</button>`;
  menu.style.display = "block";
  document.getElementById("rcDeleteNewSlot").addEventListener("click", () => {
    menu.style.display = "none";
    deleteNewSlotIssue(box);
  });
  const closeMenu = () => { menu.style.display = "none"; document.removeEventListener("click", closeMenu); };
  setTimeout(() => document.addEventListener("click", closeMenu), 0);
}

function deleteNewSlotIssue(box) {
  pendingIssues = pendingIssues.filter((i) => !(i.kind === "new-slot" && i.procedure_id === box.dataset.id));
  box.remove();
  renderPendingIssues();
}

// Fork-based, same shape as contribute.js's submitRecategorizationProposal
// -- an arbitrary contributor doesn't have push access on a vehicle
// repo they don't maintain, so this proposes the change via a PR
// instead of writing directly. Reviewed by a real maintainer through
// the Worker's /accept-manifest-change gate, which independently
// re-validates the diff before merging; this function only proposes.
async function submitManifestChange(repoUrl, editionId, issue) {
  const session = BlaydeAuth.getSession();
  if (!session) throw new Error("Not signed in.");
  const [owner, repo] = ownerRepo(repoUrl);

  let defaultBranch = null, upstreamSha = null;
  for (const branch of ["main", "master"]) {
    try {
      const ref = await githubApi(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, session.token);
      defaultBranch = branch; upstreamSha = ref.object.sha; break;
    } catch (e) { /* try next */ }
  }
  if (!defaultBranch) throw new Error(`Could not find a main or master branch on ${owner}/${repo}.`);

  await githubApi(`/repos/${owner}/${repo}/forks`, session.token, { method: "POST" });
  const forkOwner = session.username;
  const forkRef = await waitForForkRef(forkOwner, repo, defaultBranch, session.token);

  const branchName = `manifest-fix/${issue.kind}-${issue.procedure_id}-${Date.now()}`;
  await githubApi(`/repos/${forkOwner}/${repo}/git/refs`, session.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: forkRef.object.sha }),
  });

  const manifestFile = await githubApi(`/repos/${forkOwner}/${repo}/contents/${editionId}/manifest.json?ref=${branchName}`, session.token);
  const manifestData = JSON.parse(base64ToUtf8(manifestFile.content));
  const entries = manifestData.entries || [];
  let summary, prTitle;
  if (issue.kind === "remove") {
    const idx = entries.findIndex((e) => e.procedure_id === issue.procedure_id);
    if (idx === -1) throw new Error(`Couldn't find ${issue.procedure_id} in the manifest -- it may have changed since this page loaded.`);
    entries.splice(idx, 1);
    summary = `Removes \`${issue.procedure_id}\` (${issue.section_heading}) -- flagged as not a real photo opportunity.`;
    prTitle = `Remove tracked slot: ${issue.section_heading}`;
  } else if (issue.kind === "structure") {
    const entry = entries.find((e) => e.procedure_id === issue.procedure_id);
    if (!entry) throw new Error(`Couldn't find ${issue.procedure_id} in the manifest -- it may have changed since this page loaded.`);
    entry.pixel_bbox = issue.bbox;
    summary = `Repositions \`${issue.procedure_id}\` (${issue.section_heading}).`;
    prTitle = `Reposition: ${issue.section_heading}`;
  } else {
    entries.push({
      procedure_id: issue.procedure_id,
      page: issue.page,
      section_heading: issue.section_heading,
      pixel_bbox: issue.bbox,
      content_type: "photo",
      source_layout: "contributor_added",
      status: "needs_contributed_photo",
    });
    summary = `Adds a new tracked slot: \`${issue.procedure_id}\` (${issue.section_heading}).`;
    prTitle = `Add missed photo slot: ${issue.section_heading}`;
  }
  manifestData.entries = entries;

  await githubApi(`/repos/${forkOwner}/${repo}/contents/${editionId}/manifest.json`, session.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Manifest change: ${issue.kind} ${issue.procedure_id}`,
      content: utf8ToBase64(JSON.stringify(manifestData, null, 2) + "\n"),
      sha: manifestFile.sha,
      branch: branchName,
    }),
  });

  const prBody = [
    summary,
    ``,
    `Submitted via the Contributor Portal's "Propose a photo location fix" action.`,
    ``,
    `---`,
    `<!-- blaydemanifestchange -->`,
  ].join("\n");
  const pr = await githubApi(`/repos/${owner}/${repo}/pulls`, session.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: prTitle,
      head: `${forkOwner}:${branchName}`,
      base: defaultBranch,
      body: prBody,
    }),
  });
  return { number: pr.number, url: pr.html_url };
}

document.getElementById("issueSubmitAllBtn").addEventListener("click", async () => {
  const btn = document.getElementById("issueSubmitAllBtn");
  btn.disabled = true;
  const { repoUrl, editionId } = currentIssueSelection();
  const toSubmit = pendingIssues.slice();
  let opened = 0;
  const failures = [];
  for (const issue of toSubmit) {
    try {
      const pr = await submitManifestChange(repoUrl, editionId, issue);
      issueLog(`Proposed: ${pr.url}`);
      manifestFixRequests.push({
        kind: issue.kind, procedureId: issue.procedure_id, sectionHeading: issue.section_heading,
        vehicleLabel: issueVehicleLabel, repoUrl, editionId, prNumber: pr.number, prUrl: pr.url,
        proposedAt: new Date().toISOString().slice(0, 10),
      });
      pendingIssues = pendingIssues.filter((i) => i !== issue);
      opened++;
    } catch (e) {
      failures.push(issue.section_heading);
      issueLog(`Couldn't propose "${issue.section_heading}": ${e.message}`);
    }
  }
  saveManifestFixRequests();
  renderPendingIssues();
  renderIssueOverlays();
  renderManifestFixRequests();
  btn.disabled = false;
  if (opened) {
    // Direct request: the full-page editor is done its job once
    // everything queued is actually proposed -- closing it (rather
    // than leaving it open with only a scrollable text log to notice)
    // matches how a successful photo submission elsewhere on this page
    // collapses its own editor and confirms with a toast, not just a
    // log line easy to miss.
    document.getElementById("issueEditorArea").style.display = "none";
    showToast(`${opened} change${opened === 1 ? "" : "s"} proposed${failures.length ? `, ${failures.length} failed` : ""}. A maintainer of this manual will review ${opened === 1 ? "it" : "them"}.`);
  }
});

// Reuses fetchPrReviewStatus/reviewStatusText from contribute.js (same
// page, loaded first) rather than a second copy -- same live approval/
// changes-requested/checks feedback My Reviewables already shows for
// photo PRs, applied here to manifest-fix proposals.
const manifestFixStatusCache = new Map();

function renderManifestFixRequests() {
  const card = document.getElementById("issueRequestsCard");
  const list = document.getElementById("issueRequestsList");
  const summary = document.getElementById("issueRequestsSummary");
  if (!manifestFixRequests.length) { card.style.display = "none"; return; }
  card.style.display = "block";
  summary.textContent = `Your proposed fixes (${manifestFixRequests.length})`;
  list.innerHTML = "";
  // Direct feedback: this used to be a big, spaced-out block per entry
  // (bold vehicle name, several stacked lines) -- collapsed into a
  // details/summary + scrollable list, same tight two-line-per-row
  // density as My Reviewables' own .upload-row, not colored or fancy.
  manifestFixRequests.slice().reverse().forEach((req) => {
    const key = `${req.repoUrl}#${req.prNumber}`;
    const statusId = `manifestfixstatus-${key.replace(/[^a-zA-Z0-9]/g, "")}`;
    // Older local records predate vehicleLabel -- falls back to
    // repoUrl+editionId rather than rendering blank.
    const vehicleLabel = req.vehicleLabel || `${req.repoUrl} (${req.editionId})`;
    const row = document.createElement("div");
    row.className = "upload-row";
    row.style.padding = "6px 0";
    row.innerHTML = `
      <div>
        <div class="upload-title" style="font-size:0.88rem;">${vehicleLabel} <span class="sub">&mdash; ${req.sectionHeading} (${req.kind})</span></div>
        <div class="upload-meta"><a href="${req.prUrl}" target="_blank" rel="noopener" class="pr-link">Request #${req.prNumber}</a> &middot; <span id="${statusId}">${reviewStatusText(manifestFixStatusCache.get(key))}</span></div>
      </div>
    `;
    list.appendChild(row);
  });
  manifestFixRequests
    .filter((req) => !manifestFixStatusCache.has(`${req.repoUrl}#${req.prNumber}`))
    .forEach((req) => {
      const key = `${req.repoUrl}#${req.prNumber}`;
      fetchPrReviewStatus(req.repoUrl, req.prNumber).then((status) => {
        manifestFixStatusCache.set(key, status);
        const el = document.getElementById(`manifestfixstatus-${key.replace(/[^a-zA-Z0-9]/g, "")}`);
        if (el) el.innerHTML = reviewStatusText(status);
      });
    });
}

populateIssueEntrySelect().catch((e) => issueLog(`Couldn't load the registry: ${e.message}`));
renderManifestFixRequests();

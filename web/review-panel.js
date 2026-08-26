// Blayde Manual -- maintainer review panel.
// Everything GitHub-shaped here is mock data standing in for the real
// API, in the same shape the real API would return it -- there's no
// live vehicle repo to review yet (see LEGAL.md) and no deployed OAuth
// proxy. Swapping in real fetch() calls to github.com/api.github.com
// is meant to be a small, mechanical change once both exist, not a
// rewrite of anything below.

// Persisted via localStorage (mock-pr-store.js), not just an in-memory
// array -- this is what lets contribute.html's Contributor Portal (a
// genuinely separate page/session) hand new photo requests to this
// exact review queue, real enough to verify end-to-end in the browser
// (submit on one page, reload this one, see it appear) even though
// nothing here touches a real GitHub API yet. Seed data (MOCK_PRS_SEED)
// lives in mock-pr-store.js, not here -- contribute.js needs the same
// seed available on first-ever load too, regardless of which of the two
// pages someone happens to open first.

// Spans two different repos on purpose -- a maintainer can hold write
// access on more than one vehicle at once (MOCK_MAINTAINER.reposmaintained
// is an array for exactly this reason), so this list has to show
// requests grouped by vehicle, not assume there's only ever one.
const MOCK_PRS = loadMockPrs(MOCK_PRS_SEED);

// ---- repo scope guard -- this tool authenticates with the maintainer's
// OWN GitHub token, which has whatever access their real account has,
// completely unrelated to this project. Being "one generic app,
// parameterized by repo_url" is exactly what makes it possible to craft
// a link pointing this tool at some other repo the maintainer happens
// to have write access to -- so repo_url is never trusted just because
// it's in the URL. It's checked against the registry (same one the
// patcher already reads) before this tool ever calls the GitHub API
// against it. Mock here, same as the PR list, since there's no deployed
// registry.json yet -- the real version calls loadRegistry() from
// registry.js against the canonical registry URL, not a hardcoded list.
// One repo per vehicle now (see ROADMAP.md's multi-manual correction,
// 2026-08-25) -- a vehicle can have more than one edition entry here,
// all sharing the same repo_url, distinguished by edition_id.
const MOCK_REGISTRY = {
  vehicles: [
    {
      vehicle_slug: "suzuki-sv650-1999-2002",
      edition_id: "OEM",
      repo_url: "https://github.com/BlaydeManual/suzuki-sv650-1999-2002",
      status: "approved",
    },
    {
      vehicle_slug: "suzuki-sv650-1999-2002",
      edition_id: "Haynes",
      repo_url: "https://github.com/BlaydeManual/suzuki-sv650-1999-2002",
      status: "approved",
    },
    {
      vehicle_slug: "kawasaki-kx250-1998-2000",
      edition_id: "OEM",
      repo_url: "https://github.com/BlaydeManual/kawasaki-kx250-1998-2000",
      status: "approved",
    },
  ],
};

function isRegisteredRepo(repoUrl) {
  const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
  return MOCK_REGISTRY.vehicles.some(
    (v) => norm(v.repo_url) === norm(repoUrl) && v.status === "approved"
  );
}

function vehicleSlugForRepo(repoUrl) {
  const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
  return MOCK_REGISTRY.vehicles.find((v) => norm(v.repo_url) === norm(repoUrl))?.vehicle_slug || repoUrl;
}

// A `?repo=` URL param overrides the mock maintained-repos list for
// local testing (simulate reviewing a repo other than the two hardcoded
// mock ones) -- this was here before the multi-repo grouping work and
// should never have dropped out during that refactor. Restored. Doesn't
// weaken the actual guard below: an overridden repo still has to pass
// isRegisteredRepo() like any other, it just changes which repo(s) get
// checked, not whether the check happens.
function reposToCheck() {
  const override = new URLSearchParams(window.location.search).get("repo");
  return override ? [override] : MOCK_MAINTAINER.reposmaintained;
}

// Every repo the maintainer claims to maintain still gets checked against
// the registry individually -- same guard as before, just applied per
// repo instead of to a single hardcoded one, since a maintainer can hold
// more than one at once.
function maintainedApprovedRepos() {
  return reposToCheck().filter(isRegisteredRepo);
}

let currentPR = null;
let pdfDoc = null;
let renderScale = 2.0; // CSS px per PDF point -- fixed, keeps the compare view a manageable size
let box = null; // {x0,y0,x1,y1} in canvas-pixel space, live during drag
let dragState = null;
let submittedPhotoImg = null;

function log(msg) {
  const el = document.getElementById("prLog");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

// ---- mock "submitted photo": a portrait placeholder, deliberately
// mismatched against the (landscape) original box, so the live-fit
// editor has something real to demonstrate -- see ROADMAP.md's
// "maintainer live-adjust to fit" design ----
function buildMockSubmittedPhoto() {
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 800; // portrait 3:4, vs. the original box's ~1.5:1 landscape
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1d9e75";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#085041";
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(Math.random() * c.width, Math.random() * c.height,
                 40 + Math.random() * 60, 40 + Math.random() * 60, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return c.toDataURL("image/jpeg", 0.85);
}

// ---- repo scope check, run once the portal-level sign-in has already
// happened (see maintainer-portal.js) -- this is a separate concern from
// authentication itself, just parameterized to run right after it ----
function initReviewTab() {
  // Re-sync from storage every time this tab is entered, not just once at
  // sign-in -- Issue Requests writes into the same store from this same
  // page session (pick a repo, patch, submit), and MOCK_PRS being a
  // page-load-time const would otherwise mean a maintainer has to reload
  // the whole portal to see their own just-submitted issue show up here.
  MOCK_PRS.length = 0;
  MOCK_PRS.push(...loadMockPrs(MOCK_PRS_SEED));

  const statusEl = document.getElementById("repoScopeStatus");
  const approved = maintainedApprovedRepos();
  const refused = reposToCheck().filter((r) => !approved.includes(r));
  if (!approved.length) {
    statusEl.textContent = `No maintained repos passed the registry check -- this tool only ever acts on repos it finds there, never on a claimed repo alone.`;
    statusEl.style.color = "#ff6b6b";
    return;
  }
  statusEl.textContent = refused.length
    ? `repo scope check passed for ${approved.length} repo(s); REFUSED ${refused.length} not found in the registry: ${refused.join(", ")}`
    : `repo scope check passed for ${approved.length} repo(s)`;
  statusEl.style.color = refused.length ? "#ffcc66" : "";
  document.getElementById("prListCard").style.display = "block";
  renderPRList(approved);
}

// Grouped by vehicle, then by edition within it -- a vehicle repo can
// hold more than one edition now (see ROADMAP.md's multi-manual
// correction, 2026-08-25), so "which vehicle" alone is one tier too
// shallow. A maintainer with requests waiting on more than one repo
// needs to see which vehicle each one belongs to; within a vehicle,
// which edition each request is against. "Open requests for X" is
// redundant once every group already lives under a "Photo requests"
// card.
function renderPRList(approvedRepos) {
  const wrap = document.getElementById("prList");
  wrap.innerHTML = "";
  approvedRepos.forEach((repoUrl) => {
    // Only what's actually still waiting -- an accepted/rejected request
    // stays in MOCK_PRS (so contribute.js can look up its outcome), it
    // just no longer belongs in the "open" queue a maintainer works from.
    // Sorted by page -- a maintainer working through a vehicle's queue
    // wants to move through the manual in order, not in submission order.
    const prs = MOCK_PRS.filter((pr) => pr.repo_url === repoUrl && !pr.status)
      .sort((a, b) => a.page - b.page);
    if (!prs.length) return;
    const group = document.createElement("div");
    group.style.marginBottom = "16px";
    // Full-bleed light-grey bar (breaks out of .card's own padding via
    // negative margin) as a clear separator between vehicles -- bigger
    // and louder than a plain steel-colored label, on purpose.
    group.innerHTML = `<h3 class="vehicle-bar">${vehicleSlugForRepo(repoUrl)}</h3>`;

    const byEdition = new Map();
    prs.forEach((pr) => {
      const key = pr.edition_id || "(edition not set)";
      if (!byEdition.has(key)) byEdition.set(key, []);
      byEdition.get(key).push(pr);
    });
    byEdition.forEach((editionPrs, editionId) => {
      const editionHeading = document.createElement("h4");
      editionHeading.className = "edition-bar";
      editionHeading.textContent = editionId;
      group.appendChild(editionHeading);
      const editionWrap = document.createElement("div");
      editionPrs.forEach((pr) => {
        const row = document.createElement("div");
        row.className = "pr-row";
        // Page leads the title, not buried in the meta line -- easy to miss
        // there, and it's the thing a maintainer orients around first.
        row.innerHTML = `
          <div>
            <div class="pr-title">PG. ${pr.page} &mdash; ${pr.title}</div>
            <div class="pr-meta">@${pr.author} &middot; ${pr.photo_filename || pr.procedure_id} &middot; Request #${pr.number}</div>
          </div>
          <button data-pr="${pr.number}">Review</button>
        `;
        editionWrap.appendChild(row);
      });
      group.appendChild(editionWrap);
    });
    wrap.appendChild(group);
  });
  wrap.querySelectorAll("button[data-pr]").forEach(btn => {
    btn.addEventListener("click", () => openPR(parseInt(btn.dataset.pr, 10)));
  });
}

// ---- opening a PR ----
function openPR(number) {
  currentPR = MOCK_PRS.find(p => p.number === number);
  box = null;
  pdfDoc = null;
  document.getElementById("prLog").textContent = "";
  document.getElementById("reviewArea").classList.add("open");
  document.getElementById("reviewTitle").textContent = `PG. ${currentPR.page} -- Request #${currentPR.number} -- ${currentPR.title}`;
  document.getElementById("reviewMeta").textContent =
    `${currentPR.section_heading} (${currentPR.procedure_id}) -- submitted by @${currentPR.author}`;
  document.getElementById("compareWrap").style.display = "none";
  document.getElementById("acceptBtn").disabled = true;
  document.getElementById("rejectBtn").disabled = false;
  document.getElementById("resetBoxBtn").disabled = true;
  submittedPhotoImg = buildMockSubmittedPhoto();
  log(`opened request #${currentPR.number} -- pick your own copy of the manual to render real page context`);
}

// ---- the local-context rule in action: nothing renders until the
// maintainer supplies their own PDF, same as any other role ----
document.getElementById("pdfPicker").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !currentPR) return;
  log(`loading ${file.name}...`);
  const buf = await file.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  await renderPage();
});

async function renderPage() {
  const page = await pdfDoc.getPage(currentPR.page);
  const viewport = page.getViewport({ scale: renderScale });
  const canvas = document.getElementById("pageCanvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  // A comment issue has no bbox to compare/adjust -- it's a note on an
  // existing procedure, not a photo position or a new manifest entry.
  // Skip the box editor entirely rather than crash on a null bbox.
  if (currentPR.issue_type === "comment") {
    document.getElementById("compareWrap").style.display = "none";
    log(`page ${currentPR.page} loaded for context. This is a comment, not a bbox change -- "${currentPR.issue_note}"`);
    document.getElementById("acceptBtn").disabled = false;
    return;
  }

  document.getElementById("compareWrap").style.display = "block";
  resetBox();
  log(`rendered page ${currentPR.page} at ${canvas.width}x${canvas.height} -- drag the box or its corners to fit the submitted photo`);
  document.getElementById("acceptBtn").disabled = false;
  document.getElementById("resetBoxBtn").disabled = false;
}

// ---- bbox <-> canvas-pixel conversion, same math as patcher.js's
// scale_x/scale_y (composite_px / page_pt), just going the other
// direction (composite px -> render canvas px) ----
function bboxToCanvas(bbox) {
  const canvas = document.getElementById("pageCanvas");
  const sx = canvas.width / currentPR.composite_width_px;
  const sy = canvas.height / currentPR.composite_height_px;
  const [x0, y0, x1, y1] = bbox;
  return { x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy };
}

function canvasToBbox(rect) {
  const canvas = document.getElementById("pageCanvas");
  const sx = currentPR.composite_width_px / canvas.width;
  const sy = currentPR.composite_height_px / canvas.height;
  return [rect.x0 * sx, rect.y0 * sy, rect.x1 * sx, rect.y1 * sy].map(v => Math.round(v));
}

function resetBox() {
  box = bboxToCanvas(currentPR.original_bbox);
  paintBox();
}

document.getElementById("resetBoxBtn").addEventListener("click", () => {
  resetBox();
  log("box reset to the original submission bbox");
});

function paintBox() {
  const el = document.getElementById("targetBox");
  el.style.left = box.x0 + "px";
  el.style.top = box.y0 + "px";
  el.style.width = (box.x1 - box.x0) + "px";
  el.style.height = (box.y1 - box.y0) + "px";
  document.getElementById("submittedPhotoImg").src = submittedPhotoImg;
  updateFitReadout();
}

function updateFitReadout() {
  const boxW = box.x1 - box.x0, boxH = box.y1 - box.y0;
  const boxRatio = boxW / boxH;
  const photoRatio = 600 / 800; // the mock photo's native aspect ratio
  const pct = 100 * Math.min(boxRatio, photoRatio) / Math.max(boxRatio, photoRatio);
  document.getElementById("fitReadout").innerHTML =
    `box ratio <b>${boxRatio.toFixed(2)}</b> vs. photo ratio <b>${photoRatio.toFixed(2)}</b> -- `
    + `<b>${pct.toFixed(0)}%</b> fit (100% = no letterboxing when patched)`;
}

// ---- drag to move / resize, same interaction pattern as
// generate_review.py's crop editor ----
const wrap = document.getElementById("compareWrap");
wrap.addEventListener("mousedown", (e) => {
  if (!box) return;
  const rect = wrap.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const handle = e.target.closest(".handle");
  if (handle) {
    dragState = { mode: "resize", corner: handle.dataset.corner, startX: x, startY: y, orig: { ...box } };
  } else if (e.target.closest("#targetBox")) {
    dragState = { mode: "move", startX: x, startY: y, orig: { ...box } };
  }
});
wrap.addEventListener("mousemove", (e) => {
  if (!dragState) return;
  const rect = wrap.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const dx = x - dragState.startX, dy = y - dragState.startY;
  const o = dragState.orig;
  if (dragState.mode === "move") {
    const w = o.x1 - o.x0, h = o.y1 - o.y0;
    box = { x0: o.x0 + dx, y0: o.y0 + dy, x1: o.x0 + dx + w, y1: o.y0 + dy + h };
  } else {
    box = { ...o };
    if (dragState.corner.includes("w")) box.x0 = o.x0 + dx;
    if (dragState.corner.includes("e")) box.x1 = o.x1 + dx;
    if (dragState.corner.includes("n")) box.y0 = o.y0 + dy;
    if (dragState.corner.includes("s")) box.y1 = o.y1 + dy;
  }
  if (box.x1 - box.x0 > 10 && box.y1 - box.y0 > 10) paintBox();
});
window.addEventListener("mouseup", () => { dragState = null; });

// ---- accept / reject: both stubbed, both log exactly what the real
// GitHub API calls would be, since neither can run for real yet ----
// Accept/reject persist for real (into the shared mock-pr-store), not
// just a log line -- otherwise a contributor's "submitted" status would
// never change, forever, with no way to ever see the outcome. A note is
// optional either way but asked for on both paths, not just rejection --
// "nice work, exactly what was needed" is as worth saying as a reason
// for turning something down.
document.getElementById("acceptBtn").addEventListener("click", () => {
  const note = prompt("Optional note for the contributor (e.g. \"looks great, thanks!\"):", "") || "";
  log(`[mock] ACCEPT request #${currentPR.number}:`);
  // A comment issue has no bbox at all -- it's a note about a procedure,
  // not a photo position or a new manifest entry, so there's nothing to
  // update or merge. Just acknowledge it.
  if (currentPR.issue_type === "comment") {
    log(`  1. mark comment on ${currentPR.procedure_id} resolved -- no manifest change`);
    currentPR.status = "accepted";
    currentPR.maintainerNote = note;
    saveMockPrs(MOCK_PRS);
    document.getElementById("acceptBtn").disabled = true;
    document.getElementById("rejectBtn").disabled = true;
    initReviewTab();
    return;
  }
  const finalBbox = canvasToBbox(box);
  log(`  1. update ${currentPR.procedure_id}.pixel_bbox to ${JSON.stringify(finalBbox)} in manifest.json`);
  // An issue raised via Issue Requests (structure/new-slot) has no new
  // photo attached -- it's a maintainer's own correction to the existing
  // manifest, not a photo submission, so there's nothing to merge. A
  // real photo submission still merges the photo in.
  if (!currentPR.issue_type) {
    log(`  2. merge the submitted photo in`);
  } else if (currentPR.issue_type === "new-slot") {
    log(`  2. add ${currentPR.procedure_id} as a new tracked procedure -- still needs a photo, now that the slot's confirmed real`);
  }
  log(`  (original bbox was ${JSON.stringify(currentPR.original_bbox)}, adjusted by the maintainer above)`);
  currentPR.status = "accepted";
  currentPR.maintainerNote = note;
  currentPR.finalBbox = finalBbox;
  saveMockPrs(MOCK_PRS);
  document.getElementById("acceptBtn").disabled = true;
  document.getElementById("rejectBtn").disabled = true;
  initReviewTab();
});

document.getElementById("rejectBtn").addEventListener("click", () => {
  const note = prompt("Reason for the contributor (helps them fix it and resubmit):", "") || "";
  log(`[mock] REJECT request #${currentPR.number}:`);
  log(`  1. close request #${currentPR.number}`);
  currentPR.status = "rejected";
  currentPR.maintainerNote = note;
  saveMockPrs(MOCK_PRS);
  document.getElementById("acceptBtn").disabled = true;
  document.getElementById("rejectBtn").disabled = true;
  document.getElementById("resetBoxBtn").disabled = true;
  initReviewTab();
});

// Blayde Manual -- maintainer review panel. Real GitHub API calls as
// of 2026-08-26: lists open photo-submission PRs on a maintainer's
// registered repos, lets them compare the submitted photo against the
// real manual page, and accept (merge, plus a manifest.json bbox
// fixup if they adjusted it) or reject (close + comment) for real.
//
// Scoped to real photo-submission PRs only (the ones contribute.js's
// submitPhotoToGitHub creates) -- "comment"/"new-slot" style structural
// issues from issue-requests.js/org-approval.js are a different, still
// mock flow, not covered by this pass. A PR whose diff doesn't add a
// file under images/ is silently skipped here, not shown as broken.

// ---- repo scope guard -- this tool authenticates with the maintainer's
// OWN GitHub token, which has whatever access their real account has,
// completely unrelated to this project. Being "one generic app,
// parameterized by repo_url" is exactly what makes it possible to craft
// a link pointing this tool at some other repo the maintainer happens
// to have write access to -- so repo_url is never trusted just because
// it's in the URL. It's checked against the real registry (same one
// the patcher already reads) before this tool ever calls the GitHub
// API against it.
async function isRegisteredRepo(repoUrl) {
  try {
    const registryData = await loadRegistry(CANONICAL_REGISTRY_URL_FOR_REVIEW);
    const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
    return (registryData.vehicles || []).some(
      (v) => norm(v.repo_url) === norm(repoUrl) && v.status === "approved"
    );
  } catch (e) {
    return false; // registry unreachable -- fail closed, never act on an unverified repo
  }
}

// Same canonical URL convention as indexer-core.js/patcher.js --
// hardcoded, not user-editable, to close off a spoofing vector.
const CANONICAL_REGISTRY_URL_FOR_REVIEW = "https://raw.githubusercontent.com/BlaydeManual/registry/main/registry.json";

async function vehicleSlugForRepo(repoUrl) {
  try {
    const registryData = await loadRegistry(CANONICAL_REGISTRY_URL_FOR_REVIEW);
    const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
    return registryData.vehicles?.find((v) => norm(v.repo_url) === norm(repoUrl))?.vehicle_slug || repoUrl;
  } catch (e) {
    return repoUrl;
  }
}

// A `?repo=` URL param overrides the maintained-repos list for local
// testing. Doesn't weaken the actual guard: an overridden repo still
// has to pass isRegisteredRepo() like any other.
function reposToCheck() {
  const override = new URLSearchParams(window.location.search).get("repo");
  return override ? [override] : maintainedRepos.map((r) => r.repoUrl);
}

let currentPR = null;
let currentPRs = []; // last loaded batch, across all maintained repos
let pdfDoc = null;
let renderScale = 2.0; // CSS px per PDF point -- fixed, keeps the compare view a manageable size
let box = null; // {x0,y0,x1,y1} in canvas-pixel space, live during drag
let dragState = null;
let submittedPhotoImg = null;
let submittedPhotoAspect = 1;

function log(msg) {
  const el = document.getElementById("prLog");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

// ---- repo scope check, run once the portal-level sign-in has already
// happened (see maintainer-portal.js) -- this is a separate concern from
// authentication itself, just parameterized to run right after it ----
async function initReviewTab() {
  const statusEl = document.getElementById("repoScopeStatus");
  const candidates = reposToCheck();
  const checks = await Promise.all(candidates.map(async (r) => [r, await isRegisteredRepo(r)]));
  const approved = checks.filter(([, ok]) => ok).map(([r]) => r);
  const refused = checks.filter(([, ok]) => !ok).map(([r]) => r);

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
  document.getElementById("prList").innerHTML = `<p class="sub">Loading open photo requests...</p>`;

  const perRepo = await Promise.all(approved.map((repoUrl) =>
    loadOpenPhotoPRs(repoUrl).catch((e) => { log(`Couldn't load requests for ${repoUrl}: ${e.message}`); return []; })
  ));
  currentPRs = perRepo.flat();
  await renderPRList(approved);
}

// Real open PRs on this repo, filtered to ones that actually add a
// photo under <edition>/images/ (contribute.js's convention) -- anything
// else (a manifest-only PR, a docs tweak) is out of this pass's scope
// and silently skipped, not shown as a broken row. One bad/unreadable
// PR is isolated per-item, never breaks the whole list.
async function loadOpenPhotoPRs(repoUrl) {
  const session = BlaydeAuth.getSession();
  const [owner, repo] = ownerRepo(repoUrl);
  const prs = await githubApi(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`, session.token);

  // Keyed by edition_id, not one shared promise -- a repo can hold more
  // than one edition, and different PRs in the same repo can target
  // different ones, each needing its own manifest.json fetched from its
  // own edition folder.
  const manifestPromises = new Map();
  function getManifest(editionId) {
    if (!manifestPromises.has(editionId)) manifestPromises.set(editionId, fetchManifest(repoUrl, editionId));
    return manifestPromises.get(editionId);
  }

  const results = await Promise.all(prs.map(async (pr) => {
    try {
      const files = await githubApi(`/repos/${owner}/${repo}/pulls/${pr.number}/files`, session.token);
      const photoFile = files.find((f) => f.status === "added" && /^[^/]+\/images\//.test(f.filename));
      if (!photoFile) return null;
      // edition_id comes from the photo's own path, not from the
      // manifest's own field -- authoritative and available before the
      // manifest fetch even happens, since it's which folder the file
      // physically landed in.
      const pathMatch = /^([^/]+)\/images\/(.+)$/.exec(photoFile.filename);
      const editionId = pathMatch[1];
      const filename = pathMatch[2];
      const { procedureId, contributor } = parsePhotoFilename(filename);
      const { manifest, branch } = await getManifest(editionId);
      const entry = (manifest.entries || []).find((e) => e.procedure_id === procedureId);
      const geo = entry && manifest.page_geometry?.[String(entry.page)];
      if (!entry || !geo) return null; // photo doesn't match a known procedure -- shouldn't happen if checker.py ran, skip defensively
      if (!pr.head?.repo) return null; // contributor's fork was deleted after opening the PR -- can't fetch the photo
      return {
        // contributor (parsed from the photo's own filename convention)
        // takes priority over pr.user?.login -- real bug, caught live:
        // for a Public (direct-contribute) submission, the GitHub App's
        // installation token is what actually opens the PR, so GitHub's
        // own "opened by" field is always the App's bot identity, never
        // the real person. contributor is reliable for BOTH submission
        // paths (fork-based Private PRs use the same filename
        // convention), so it's the one real signal here, not a fallback.
        number: pr.number, title: pr.title, author: contributor || pr.user?.login || "unknown",
        repo_url: repoUrl, edition_id: editionId,
        procedure_id: procedureId, page: entry.page, section_heading: entry.section_heading,
        photo_raw_url: `https://raw.githubusercontent.com/${pr.head.repo.full_name}/${pr.head.ref}/${photoFile.filename}`,
        original_bbox: entry.pixel_bbox,
        composite_width_px: geo.composite_width_px, composite_height_px: geo.composite_height_px,
        page_width_pt: geo.page_width_pt, page_height_pt: geo.page_height_pt,
        base_branch: branch,
        // Relative (0-100) vector annotations already on this entry, if
        // any -- carried through so re-opening a PR shows prior
        // annotation work instead of silently discarding it.
        original_annotations: entry.annotations || [],
      };
    } catch (e) {
      return null;
    }
  }));
  return results.filter(Boolean);
}

// Grouped by vehicle, then by edition within it -- a vehicle repo can
// hold more than one edition, so "which vehicle" alone is one tier too
// shallow.
async function renderPRList(approvedRepos) {
  const wrap = document.getElementById("prList");
  wrap.innerHTML = "";
  for (const repoUrl of approvedRepos) {
    const prs = currentPRs.filter((pr) => pr.repo_url === repoUrl).sort((a, b) => a.page - b.page);
    if (!prs.length) continue;
    const group = document.createElement("div");
    group.style.marginBottom = "16px";
    const vehicleSlug = await vehicleSlugForRepo(repoUrl);
    group.innerHTML = `<h3 class="vehicle-bar">${vehicleSlug}</h3>`;

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
        row.innerHTML = `
          <div>
            <div class="pr-title">${formatProcedureLabel(pr.procedure_id, pr.page, pr.section_heading)}</div>
            <div class="pr-meta">@${pr.author} &middot; Request #${pr.number}</div>
          </div>
          <button data-pr="${pr.number}">Review</button>
        `;
        editionWrap.appendChild(row);
      });
      group.appendChild(editionWrap);
    });
    wrap.appendChild(group);
  }
  if (!wrap.children.length) wrap.innerHTML = `<p class="sub">No open photo requests right now.</p>`;
  wrap.querySelectorAll("button[data-pr]").forEach(btn => {
    btn.addEventListener("click", () => openPR(parseInt(btn.dataset.pr, 10)));
  });
}

// ---- real review/merge status: 0/2 approved, who's approved, who's
// requested changes, required-check state -- so a maintainer sees why
// Accept is disabled instead of finding out only when a real merge
// attempt fails. reviewStatus is null while loading/unknown, an object
// with `.error` if the status check itself failed (treated the same as
// "not ready" -- fail closed, never let a failed status read silently
// enable a merge attempt), or the real status object otherwise. ----
let reviewStatus = null;

async function loadReviewStatus() {
  const pr = currentPR;
  reviewStatus = null;
  renderReviewStatusLine();
  updateAcceptButtonState();
  try {
    const session = BlaydeAuth.getSession();
    const resp = await fetch(
      `${BlaydeAuth.AUTH_WORKER_URL}pr-review-status?repo_url=${encodeURIComponent(pr.repo_url)}&pr_number=${pr.number}`,
      { headers: { Authorization: `Bearer ${session.token}` } }
    );
    const result = await resp.json().catch(() => ({}));
    if (currentPR !== pr) return; // maintainer moved to a different PR while this was in flight
    if (!resp.ok || result.error) throw new Error(result.error || `status check failed (${resp.status})`);
    reviewStatus = result;
  } catch (e) {
    if (currentPR !== pr) return;
    reviewStatus = { error: e.message };
  }
  renderReviewStatusLine();
  updateAcceptButtonState();
}

function renderReviewStatusLine() {
  const el = document.getElementById("reviewStatusLine");
  if (!reviewStatus) { el.textContent = "Checking review/merge status..."; return; }
  if (reviewStatus.error) { el.textContent = `Couldn't check review status: ${reviewStatus.error}`; return; }
  const parts = [];
  parts.push(
    `Reviews: ${reviewStatus.approved_count}/${reviewStatus.required_approvals} approved` +
    (reviewStatus.approved_by.length ? ` (${reviewStatus.approved_by.map((u) => "@" + u).join(", ")})` : "")
  );
  if (reviewStatus.changes_requested_by.length) {
    parts.push(`changes requested by ${reviewStatus.changes_requested_by.map((u) => "@" + u).join(", ")}`);
  }
  if (reviewStatus.checks.length) {
    parts.push("Checks: " + reviewStatus.checks.map((c) =>
      `${c.name} ${c.conclusion === "success" ? "✓" : c.conclusion ? "✗" : "…"}`
    ).join(", "));
  }
  el.textContent = parts.join(" · ");
}

// Single source of truth for whether Accept can actually do anything --
// combines "has the compare view loaded" (the old, pre-existing gate)
// with "is this PR actually mergeable right now" (the new one). Called
// from every place either input changes, so the button's label always
// reflects the real, current reason it's disabled, not a stale one.
// Also drives Approve's own state (see updateApproveButtonState below) --
// one call site updates both buttons together, so nothing can update
// one and forget the other.
function updateAcceptButtonState() {
  const btn = document.getElementById("acceptBtn");
  if (!submittedPhotoImg) { btn.disabled = true; btn.textContent = "Accept & merge"; updateApproveButtonState(); return; }
  if (!reviewStatus) { btn.disabled = true; btn.textContent = "Checking review status..."; updateApproveButtonState(); return; }
  if (reviewStatus.error) { btn.disabled = true; btn.textContent = "Couldn't verify review status"; updateApproveButtonState(); return; }
  if (reviewStatus.changes_requested_by.length) {
    btn.disabled = true;
    btn.textContent = `Changes requested by @${reviewStatus.changes_requested_by[0]}`;
    updateApproveButtonState();
    return;
  }
  if (!reviewStatus.checks_passing) {
    const blocking = reviewStatus.checks.find((c) => c.conclusion !== "success");
    btn.disabled = true;
    btn.textContent = blocking ? `Waiting on "${blocking.name}" check` : "Waiting on required checks";
    updateApproveButtonState();
    return;
  }
  if (reviewStatus.approved_count < reviewStatus.required_approvals) {
    const remaining = reviewStatus.required_approvals - reviewStatus.approved_count;
    btn.disabled = true;
    btn.textContent = `Needs ${remaining} more approval${remaining === 1 ? "" : "s"} (${reviewStatus.approved_count}/${reviewStatus.required_approvals})`;
    updateApproveButtonState();
    return;
  }
  btn.disabled = false;
  btn.textContent = "Accept & merge";
  updateApproveButtonState();
}

// Approve is real GitHub review submission, under the maintainer's OWN
// token -- never the Worker's installation token, which would attribute
// every approval to the App's bot identity and never count toward a
// human-reviewer requirement at all. Gated the same way Accept's first
// gate is (the submitted photo has to have actually loaded) so no one
// can approve blind before anything's rendered; further gated on not
// having already approved, since GitHub happily accepts a second
// APPROVE review from the same person but it's just noise once cast.
function updateApproveButtonState() {
  const btn = document.getElementById("approveBtn");
  if (!submittedPhotoImg || !reviewStatus || reviewStatus.error) {
    btn.disabled = true;
    btn.textContent = "Approve";
    return;
  }
  const myLogin = BlaydeAuth.getSession()?.username;
  if (myLogin && reviewStatus.approved_by.includes(myLogin)) {
    btn.disabled = true;
    btn.textContent = "You approved ✓";
    return;
  }
  btn.disabled = false;
  btn.textContent = "Approve";
}

document.getElementById("approveBtn").addEventListener("click", async () => {
  const session = BlaydeAuth.getSession();
  const [owner, repo] = ownerRepo(currentPR.repo_url);
  const btn = document.getElementById("approveBtn");
  btn.disabled = true;
  btn.textContent = "Approving...";
  try {
    log(`approving request #${currentPR.number}...`);
    await githubApi(`/repos/${owner}/${repo}/pulls/${currentPR.number}/reviews`, session.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "APPROVE" }),
    });
    log(`approved.`);
    showToast("Approved.");
    await loadReviewStatus(); // refreshes the status line and both buttons' real state
  } catch (e) {
    log(`approve failed: ${e.message}`);
    updateApproveButtonState();
  }
});

// ---- opening a PR: fetch the real submitted photo, not a mock one ----
async function openPR(number) {
  currentPR = currentPRs.find(p => p.number === number);
  box = null;
  pdfDoc = null;
  submittedPhotoImg = null;
  reviewStatus = null;
  // Deep-cloned, not a reference into currentPR/currentPRs -- dragging
  // shapes around during review must never mutate the cached list that
  // renderPRList/loadOpenPhotoPRs already built, the same reasoning
  // original_bbox vs. box already follows for the crop position.
  annotations = JSON.parse(JSON.stringify(currentPR.original_annotations || []));
  annoTool = null;
  document.querySelectorAll("#annoToolbar [data-anno-tool]").forEach((b) => b.classList.remove("active"));
  document.getElementById("annoNextNumberRow").style.display = "none";
  document.getElementById("annoTextEditRow").style.display = "none";
  annoNextNumber = (annotations.filter((a) => a.type === "number").reduce((max, a) => Math.max(max, a.value || 0), 0)) + 1;
  document.getElementById("annoNextNumberInput").value = annoNextNumber;
  renderAnnotations();
  document.getElementById("prLog").textContent = "";
  document.getElementById("reviewArea").classList.add("open");
  document.getElementById("reviewTitle").textContent =
    `${formatProcedureLabel(currentPR.procedure_id, currentPR.page, currentPR.section_heading)} - Request #${currentPR.number}`;
  document.getElementById("reviewMeta").textContent = `Submitted by @${currentPR.author}`;
  document.getElementById("compareWrap").style.display = "none";
  updateAcceptButtonState();
  renderReviewStatusLine();
  document.getElementById("rejectBtn").disabled = false;
  document.getElementById("resetBoxBtn").disabled = true;
  loadReviewStatus(); // fires in parallel with the photo fetch below, not awaited

  log(`opened request #${currentPR.number} -- fetching the submitted photo...`);
  try {
    const resp = await fetch(currentPR.photo_raw_url);
    if (!resp.ok) throw new Error(`photo fetch failed (${resp.status})`);
    const blob = await resp.blob();
    submittedPhotoImg = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("couldn't read the photo"));
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("couldn't read the photo's dimensions"));
      img.src = submittedPhotoImg;
    });
    submittedPhotoAspect = dims.w / dims.h;
    log(`photo loaded (${dims.w}x${dims.h}) -- pick your own copy of the manual to render real page context`);
  } catch (e) {
    log(`couldn't load the submitted photo: ${e.message}`);
  }
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
  // Shared with every other viewer that does this same local-context
  // render -- see registry.js's resolvePageForLocalPdf for why.
  const { targetPage, isPatchedOutput } = await resolvePageForLocalPdf(pdfDoc, currentPR.page);
  if (isPatchedOutput) {
    log("This looks like an already-patched Blayde Manual, not the original scan -- adjusting for its extra cover page.");
  }
  const page = await pdfDoc.getPage(targetPage);
  const viewport = page.getViewport({ scale: renderScale });
  const canvas = document.getElementById("pageCanvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  document.getElementById("compareWrap").style.display = "block";
  resetBox();
  log(`rendered page ${currentPR.page} at ${canvas.width}x${canvas.height} -- drag the box or its corners to fit the submitted photo`);
  updateAcceptButtonState();
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

// ---- annotation editor -- arrows/circles/numbers/lines/short text
// callouts, stored as relative (0-100) vector shapes on the manifest
// entry (entry.annotations), not baked into the photo's own pixels.
// Rendering these into the actual patched PDF output is a deliberate,
// separate follow-up (patcher.js) -- this is the editor half only.
//
// Every shape is drawn with a black-outlined color stroke ("cased"/
// haloed, the same technique road casings on maps use) so it stays
// legible over any photo regardless of what's directly behind it --
// two overlapping strokes, wider black one first, narrower white one
// on top, rather than relying on a single color to contrast correctly
// against a background nobody controls.
let annotations = [];
let annoTool = null; // 'arrow' | 'line' | 'circle' | 'number' | 'text' | null
let annoLabelMode = "icon"; // 'icon' | 'word' -- shared toggle, not per-button
let annoDrag = null;
let annoNextNumber = 1;
let annoEditingTextId = null;
const ANNO_MAX_LEN = 30; // % of the box's own size -- no single shape needs to be bigger than this to be useful
const ANNO_NS = "http://www.w3.org/2000/svg";
const ANNO_TOOL_META = {
  arrow: { icon: "↗", word: "Arrow" },
  line: { icon: "―", word: "Line" },
  circle: { icon: "○", word: "Circle" },
  number: { icon: "①", word: "Number" },
  text: { icon: "✎", word: "Text" },
};

function annoLabel(tool) {
  const m = ANNO_TOOL_META[tool];
  return annoLabelMode === "word" ? m.word : `${m.icon} ${m.word}`;
}

function annoPointFromEvent(e) {
  const svg = document.getElementById("annotationLayer");
  const rect = svg.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: ((t.clientX - rect.left) / rect.width) * 100, y: ((t.clientY - rect.top) / rect.height) * 100 };
}

function annoClamp01(v) { return Math.max(0, Math.min(100, v)); }

// Caps a shape's own extent at ANNO_MAX_LEN without changing its
// anchor point -- direct spec: "no reason to have any single line
// bigger than that."
function annoClampLen(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len <= ANNO_MAX_LEN || len === 0) return { x1, y1 };
  const s = ANNO_MAX_LEN / len;
  return { x1: x0 + dx * s, y1: y0 + dy * s };
}

function annoEl(tag, attrs) {
  const el = document.createElementNS(ANNO_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// The actual halo: identical geometry drawn twice, black wider stroke
// first, white narrower stroke on top. `extra` lets a caller (the
// arrowhead) reuse the exact same two-pass pattern for a second piece
// of geometry that belongs to the same shape.
function annoHaloed(tag, attrs, groupAttrs) {
  const g = annoEl("g", groupAttrs || {});
  g.appendChild(annoEl(tag, { ...attrs, stroke: "#000", "stroke-width": 2.4, fill: attrs.fill === "none" || !attrs.fill ? "none" : "#000" }));
  g.appendChild(annoEl(tag, { ...attrs, stroke: "#fff", "stroke-width": 1.1, fill: attrs.fill === "none" || !attrs.fill ? "none" : attrs.fill }));
  return g;
}

function annoHandle(cx, cy, extraAttrs) {
  return annoEl("circle", { cx, cy, r: 1.6, class: "anno-handle", ...extraAttrs });
}

function renderAnnotations() {
  const svg = document.getElementById("annotationLayer");
  svg.innerHTML = "";
  annotations.forEach((a) => {
    const g = annoEl("g", { class: "anno-shape", "data-anno-id": a.id });
    // A thick, fully transparent stroke under the visible halo -- makes
    // a thin line/arrow genuinely clickable instead of requiring a
    // pixel-perfect hit on its 1-2 unit visible width.
    if (a.type === "arrow" || a.type === "line") {
      g.appendChild(annoEl("line", { x1: a.x0, y1: a.y0, x2: a.x1, y2: a.y1, stroke: "transparent", "stroke-width": 6 }));
      g.appendChild(annoHaloed("line", { x1: a.x0, y1: a.y0, x2: a.x1, y2: a.y1, "stroke-linecap": "round" }));
      if (a.type === "arrow") {
        const angle = Math.atan2(a.y0 - a.y1, a.x0 - a.x1);
        const hl = 3.4, spread = 0.5;
        const p1x = a.x0 - hl * Math.cos(angle - spread), p1y = a.y0 - hl * Math.sin(angle - spread);
        const p2x = a.x0 - hl * Math.cos(angle + spread), p2y = a.y0 - hl * Math.sin(angle + spread);
        g.appendChild(annoHaloed("polyline", { points: `${p1x},${p1y} ${a.x0},${a.y0} ${p2x},${p2y}`, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }));
      }
    } else if (a.type === "circle" || a.type === "number") {
      g.appendChild(annoEl("circle", { cx: a.cx, cy: a.cy, r: a.r, stroke: "transparent", "stroke-width": 6, fill: "none" }));
      g.appendChild(annoHaloed("circle", { cx: a.cx, cy: a.cy, r: a.r, fill: "none" }));
      if (a.type === "number") {
        const fontSize = Math.max(2, a.r * 1.1);
        g.appendChild(annoEl("text", {
          x: a.cx, y: a.cy, "font-size": fontSize, "text-anchor": "middle", "dominant-baseline": "central",
          "font-weight": "700", fill: "#fff", stroke: "#000", "stroke-width": fontSize * 0.12, "paint-order": "stroke fill",
        })).textContent = a.value;
      }
    } else if (a.type === "text") {
      g.appendChild(annoHaloed("rect", { x: a.x, y: a.y, width: a.w, height: a.h, fill: "none", rx: 0.6 }));
      const fontSize = Math.max(2.5, a.h * 0.6);
      g.appendChild(annoEl("text", {
        x: a.x + a.w / 2, y: a.y + a.h / 2, "font-size": fontSize, "text-anchor": "middle", "dominant-baseline": "central",
        "font-weight": "700", fill: "#fff", stroke: "#000", "stroke-width": fontSize * 0.12, "paint-order": "stroke fill",
      })).textContent = a.content || "";
    }
    svg.appendChild(g);

    // Move/edit handles only show for whichever tool is currently
    // active, scoped to shapes of that exact type -- direct spec:
    // "whenever selected, the move/edit tags show of all components
    // [the active tool owns], otherwise hide." Not a per-shape click-
    // to-select state; the active TOOL is what shows or hides them.
    if (annoTool === a.type) {
      if (a.type === "arrow" || a.type === "line") {
        svg.appendChild(annoHandle(a.x0, a.y0, { "data-anno-id": a.id, "data-anno-handle": "p0" }));
        svg.appendChild(annoHandle(a.x1, a.y1, { "data-anno-id": a.id, "data-anno-handle": "p1" }));
      } else if (a.type === "circle" || a.type === "number") {
        svg.appendChild(annoHandle(a.cx + a.r, a.cy, { "data-anno-id": a.id, "data-anno-handle": "radius" }));
      } else if (a.type === "text") {
        svg.appendChild(annoHandle(a.x + a.w, a.y + a.h, { "data-anno-id": a.id, "data-anno-handle": "resize" }));
        const pencil = annoEl("text", {
          x: a.x, y: a.y - 1.2, "font-size": 4, fill: "var(--red)", "data-anno-id": a.id, "data-anno-handle": "edit", style: "cursor:pointer;",
        });
        pencil.textContent = "✎";
        svg.appendChild(pencil);
      }
    }
  });
}

function annoNewShapeFor(tool, x, y) {
  const id = `a${Date.now()}${Math.floor(Math.random() * 1000)}`;
  if (tool === "arrow" || tool === "line") return { id, type: tool, x0: x, y0: y, x1: x, y1: y };
  if (tool === "circle") return { id, type: "circle", cx: x, cy: y, r: 0.1 };
  if (tool === "number") return { id, type: "number", cx: x, cy: y, r: 0.1, value: annoNextNumber };
  if (tool === "text") return { id, type: "text", x, y, w: Math.min(8, ANNO_MAX_LEN), h: Math.min(6, ANNO_MAX_LEN), content: "" };
  return null;
}

document.getElementById("annotationLayer").addEventListener("mousedown", (e) => annoPointerDown(e));
document.getElementById("annotationLayer").addEventListener("touchstart", (e) => { e.preventDefault(); annoPointerDown(e); }, { passive: false });
document.addEventListener("mousemove", (e) => annoPointerMove(e));
document.addEventListener("touchmove", (e) => { if (annoDrag) e.preventDefault(); annoPointerMove(e); }, { passive: false });
document.addEventListener("mouseup", annoPointerUp);
document.addEventListener("touchend", annoPointerUp);

function annoPointerDown(e) {
  const handleId = e.target.dataset?.annoHandle;
  const shapeId = e.target.dataset?.annoId;
  const p = annoPointFromEvent(e);
  if (handleId === "edit") {
    annoOpenTextEditor(shapeId);
    return;
  }
  if (shapeId) {
    const shape = annotations.find((a) => a.id === shapeId);
    if (!shape) return;
    annoDrag = { mode: handleId ? "handle" : "move", id: shapeId, handle: handleId, startX: p.x, startY: p.y, orig: { ...shape } };
    return;
  }
  if (!annoTool) return; // no tool active -- clicking empty space does nothing
  const shape = annoNewShapeFor(annoTool, p.x, p.y);
  annotations.push(shape);
  annoDrag = { mode: "create", id: shape.id, startX: p.x, startY: p.y, orig: { ...shape } };
  renderAnnotations();
}

function annoPointerMove(e) {
  if (!annoDrag) return;
  const p = annoPointFromEvent(e);
  const shape = annotations.find((a) => a.id === annoDrag.id);
  if (!shape) return;
  const o = annoDrag.orig;
  const dx = p.x - annoDrag.startX, dy = p.y - annoDrag.startY;

  if (shape.type === "arrow" || shape.type === "line") {
    if (annoDrag.mode === "move") {
      shape.x0 = annoClamp01(o.x0 + dx); shape.y0 = annoClamp01(o.y0 + dy);
      shape.x1 = annoClamp01(o.x1 + dx); shape.y1 = annoClamp01(o.y1 + dy);
    } else {
      // "create" and dragging the tail handle ("p1") both extend the
      // same endpoint; dragging the head handle ("p0") moves the head
      // instead -- matches the spec's "first click-down starts the
      // HEAD, dragging extends the tail" for a fresh arrow, while still
      // letting either end be adjusted afterward once it exists.
      if (annoDrag.mode === "handle" && annoDrag.handle === "p0") {
        shape.x0 = annoClamp01(p.x); shape.y0 = annoClamp01(p.y);
      } else {
        const clamped = annoClampLen(shape.x0, shape.y0, annoClamp01(p.x), annoClamp01(p.y));
        shape.x1 = clamped.x1; shape.y1 = clamped.y1;
      }
    }
  } else if (shape.type === "circle" || shape.type === "number") {
    if (annoDrag.mode === "move") {
      shape.cx = annoClamp01(o.cx + dx); shape.cy = annoClamp01(o.cy + dy);
    } else {
      const r = Math.min(ANNO_MAX_LEN / 2, Math.hypot(p.x - shape.cx, p.y - shape.cy));
      shape.r = shape.type === "number" ? Math.max(annoMinNumberRadius(shape.value), r) : Math.max(0.1, r);
    }
  } else if (shape.type === "text") {
    if (annoDrag.mode === "move") {
      shape.x = annoClamp01(o.x + dx); shape.y = annoClamp01(o.y + dy);
    } else {
      shape.w = Math.max(3, Math.min(ANNO_MAX_LEN, o.w + dx));
      shape.h = Math.max(2.5, Math.min(ANNO_MAX_LEN, o.h + dy));
    }
  }
  renderAnnotations();
}

// Derived from real font metrics at render time, not a hardcoded pixel
// guess -- measures the digit(s) at the size renderAnnotations will
// actually draw them at, so the minimum stays correct regardless of
// how many digits `value` ends up being (1-12, per the real use case).
function annoMinNumberRadius(value) {
  const probe = document.createElementNS(ANNO_NS, "text");
  probe.setAttribute("font-size", 4);
  probe.setAttribute("font-weight", "700");
  probe.setAttribute("visibility", "hidden");
  probe.textContent = String(value ?? 1);
  document.getElementById("annotationLayer").appendChild(probe);
  let width = 3;
  try { width = probe.getBBox().width || width; } catch (e) { /* not yet in a laid-out document -- fall back */ }
  probe.remove();
  return Math.max(2, (width / 1.1) * 0.68 + 0.8);
}

function annoPointerUp() {
  if (!annoDrag) return;
  const wasCreate = annoDrag.mode === "create";
  const shape = annotations.find((a) => a.id === annoDrag.id);
  annoDrag = null;
  if (!shape) return;
  if (shape.type === "number" && wasCreate) {
    annoNextNumber += 1;
    document.getElementById("annoNextNumberInput").value = annoNextNumber;
  }
  if (shape.type === "text" && wasCreate) {
    annoOpenTextEditor(shape.id);
  }
  renderAnnotations();
}

function annoOpenTextEditor(shapeId) {
  const shape = annotations.find((a) => a.id === shapeId);
  if (!shape) return;
  annoEditingTextId = shapeId;
  const row = document.getElementById("annoTextEditRow");
  const input = document.getElementById("annoTextInput");
  input.value = shape.content || "";
  row.style.display = "flex";
  input.focus();
}

document.getElementById("annoTextDoneBtn").addEventListener("click", () => {
  const shape = annotations.find((a) => a.id === annoEditingTextId);
  if (shape) shape.content = document.getElementById("annoTextInput").value.slice(0, 3);
  document.getElementById("annoTextEditRow").style.display = "none";
  annoEditingTextId = null;
  renderAnnotations();
});

document.getElementById("annoLabelToggle").addEventListener("click", () => {
  annoLabelMode = annoLabelMode === "icon" ? "word" : "icon";
  document.querySelectorAll("#annoToolbar [data-anno-tool]").forEach((b) => { b.textContent = annoLabel(b.dataset.annoTool); });
});

document.querySelectorAll("#annoToolbar [data-anno-tool]").forEach((btn) => {
  btn.textContent = annoLabel(btn.dataset.annoTool);
  btn.addEventListener("click", () => {
    const tool = btn.dataset.annoTool;
    annoTool = annoTool === tool ? null : tool;
    document.querySelectorAll("#annoToolbar [data-anno-tool]").forEach((b) => b.classList.toggle("active", b.dataset.annoTool === annoTool));
    document.getElementById("annoNextNumberRow").style.display = annoTool === "number" ? "inline-flex" : "none";
    renderAnnotations();
  });
});

document.getElementById("annoNextNumberInput").addEventListener("change", (e) => {
  annoNextNumber = parseInt(e.target.value, 10) || 1;
});

function paintBox() {
  const el = document.getElementById("targetBox");
  el.style.left = box.x0 + "px";
  el.style.top = box.y0 + "px";
  el.style.width = (box.x1 - box.x0) + "px";
  el.style.height = (box.y1 - box.y0) + "px";
  if (submittedPhotoImg) document.getElementById("submittedPhotoImg").src = submittedPhotoImg;
  updateFitReadout();
}

function updateFitReadout() {
  const boxW = box.x1 - box.x0, boxH = box.y1 - box.y0;
  const boxRatio = boxW / boxH;
  const photoRatio = submittedPhotoAspect;
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
    // Anchored on the box's own center, not the opposite corner: the
    // dragged edge moves with the mouse and the opposite edge mirrors
    // it, so the box grows/shrinks around a fixed point instead of
    // sliding sideways every time its ratio changes. Direct feedback:
    // corner-anchored resize made the box visibly drift off the part
    // it was pointing at while adjusting it to fit the photo's shape.
    box = { ...o };
    if (dragState.corner.includes("w")) { box.x0 = o.x0 + dx; box.x1 = o.x1 - dx; }
    if (dragState.corner.includes("e")) { box.x1 = o.x1 + dx; box.x0 = o.x0 - dx; }
    if (dragState.corner.includes("n")) { box.y0 = o.y0 + dy; box.y1 = o.y1 - dy; }
    if (dragState.corner.includes("s")) { box.y1 = o.y1 + dy; box.y0 = o.y0 - dy; }
  }
  if (box.x1 - box.x0 > 10 && box.y1 - box.y0 > 10) paintBox();
});
window.addEventListener("mouseup", () => { dragState = null; });

// ---- accept: merge the PR for real, then a follow-up commit fixing
// up manifest.json's pixel_bbox IF the maintainer adjusted it. Not
// pushed onto the PR's own branch before merge -- that branch lives on
// the contributor's fork, which this maintainer's token generally
// doesn't have write access to unless "Allow edits from maintainers"
// was enabled, not something to depend on. A separate commit directly
// on the base branch (which the maintainer/org does have write access
// to) sidesteps that entirely -- two clearly-attributed commits
// instead of one that might silently fail. ----
document.getElementById("acceptBtn").addEventListener("click", async () => {
  const note = (await blaydePrompt("Optional note for the contributor (e.g. \"looks great, thanks!\"):", "")) || "";
  const session = BlaydeAuth.getSession();
  const [owner, repo] = ownerRepo(currentPR.repo_url);
  document.getElementById("acceptBtn").disabled = true;
  document.getElementById("acceptBtn").textContent = "Merging...";
  document.getElementById("rejectBtn").disabled = true;
  try {
    log(`checking and merging request #${currentPR.number}...`);
    // Routed through the Worker, not merged directly with this
    // maintainer's own token -- it independently re-verifies real
    // permission, re-checks the PR changes exactly one real contributed
    // photo (nothing else riding along), re-validates and scans that
    // photo's actual current bytes for embedded metadata, and only then
    // merges (pinned to the exact commit it just checked). None of that
    // is something this page's own UI can guarantee on its own, since a
    // maintainer's browser has no way to stop a fork owner from having
    // changed the branch's content in ways this page never re-fetched.
    const acceptResp = await fetch(`${BlaydeAuth.AUTH_WORKER_URL}accept-photo-pr`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ repo_url: currentPR.repo_url, pr_number: currentPR.number, commit_title: `Merge #${currentPR.number}: ${currentPR.title}` }),
    });
    const acceptResult = await acceptResp.json().catch(() => ({}));
    if (!acceptResp.ok || acceptResult.error) throw new Error(acceptResult.error || `Accept failed (${acceptResp.status}).`);
    log(`merged.`);

    const finalBbox = canvasToBbox(box);
    const bboxChanged = JSON.stringify(finalBbox) !== JSON.stringify(currentPR.original_bbox);
    const annotationsChanged = JSON.stringify(annotations) !== JSON.stringify(currentPR.original_annotations || []);
    if (bboxChanged || annotationsChanged) {
      const parts = [bboxChanged && "position", annotationsChanged && "annotations"].filter(Boolean).join(" and ");
      log(`updating ${currentPR.procedure_id}'s ${parts} in manifest.json (adjusted during review)...`);
      const manifestFile = await githubApi(`/repos/${owner}/${repo}/contents/${currentPR.edition_id}/manifest.json?ref=${currentPR.base_branch}`, session.token);
      const manifestData = JSON.parse(base64ToUtf8(manifestFile.content.replace(/\n/g, "")));
      const entry = manifestData.entries.find((e) => e.procedure_id === currentPR.procedure_id);
      if (entry) {
        if (bboxChanged) entry.pixel_bbox = finalBbox;
        // Vector shapes only, in relative (0-100) coordinates -- never
        // baked into the photo's own pixels, so a later re-crop or a
        // viewer's color preference (see ROADMAP.md) can still apply
        // cleanly. Rendering these into the actual patched PDF is a
        // separate, not-yet-built step (patcher.js); this only commits
        // the editor's own data.
        if (annotationsChanged) entry.annotations = annotations;
        await githubApi(`/repos/${owner}/${repo}/contents/${currentPR.edition_id}/manifest.json`, session.token, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Adjust ${currentPR.procedure_id}'s ${parts} (reviewed in #${currentPR.number})`,
            content: utf8ToBase64(JSON.stringify(manifestData, null, 2)),
            sha: manifestFile.sha,
            branch: currentPR.base_branch,
          }),
        });
        log(`manifest.json updated.`);
      } else {
        log(`WARNING: ${currentPR.procedure_id} not found in manifest.json anymore -- skipped the position/annotation update.`);
      }
    }

    if (note) {
      await githubApi(`/repos/${owner}/${repo}/issues/${currentPR.number}/comments`, session.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: note }),
      });
    }
    log(`request #${currentPR.number} accepted.`);
    // Closes the viewer and gives a real, hard-to-miss confirmation --
    // direct request, matching org-approval.js's Approve, which already
    // does this same close-out on its own success path.
    document.getElementById("reviewArea").classList.remove("open");
    showToast("Accepted! Photo merged into the manual.");
    initReviewTab();
  } catch (e) {
    log(`accept failed: ${e.message}`);
    // Re-check rather than just re-enabling -- a failed merge attempt
    // often means the real state moved out from under the button (a
    // review got dismissed, a check re-ran and failed) since it was
    // last loaded, and blindly re-enabling would just invite the same
    // failure again with a stale "ready" label.
    document.getElementById("rejectBtn").disabled = false;
    loadReviewStatus();
  }
});

document.getElementById("rejectBtn").addEventListener("click", async () => {
  const note = (await blaydePrompt("Reason for the contributor (helps them fix it and resubmit):", "")) || "";
  const session = BlaydeAuth.getSession();
  const [owner, repo] = ownerRepo(currentPR.repo_url);
  document.getElementById("acceptBtn").disabled = true;
  document.getElementById("rejectBtn").disabled = true;
  try {
    log(`closing request #${currentPR.number}...`);
    if (note) {
      await githubApi(`/repos/${owner}/${repo}/issues/${currentPR.number}/comments`, session.token, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: note }),
      });
    }
    await githubApi(`/repos/${owner}/${repo}/pulls/${currentPR.number}`, session.token, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: "closed" }),
    });
    log(`request #${currentPR.number} closed.`);
    // Same close-out as Accept's success path -- without this the card
    // was left sitting on screen with its buttons disabled and a stale
    // log, even once the request list above it had already refreshed
    // to "No open photo requests."
    document.getElementById("reviewArea").classList.remove("open");
    showToast(note ? "Rejected. The contributor's been notified." : "Rejected. Request closed.");
    initReviewTab();
  } catch (e) {
    log(`reject failed: ${e.message}`);
    updateAcceptButtonState();
    document.getElementById("rejectBtn").disabled = false;
  }
});

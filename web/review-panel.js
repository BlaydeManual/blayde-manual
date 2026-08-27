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
// photo under images/ (contribute.js's convention) -- anything else
// (a manifest-only PR, a docs tweak) is out of this pass's scope and
// silently skipped, not shown as a broken row. One bad/unreadable PR
// is isolated per-item, never breaks the whole list.
async function loadOpenPhotoPRs(repoUrl) {
  const session = BlaydeAuth.getSession();
  const [owner, repo] = ownerRepo(repoUrl);
  const prs = await githubApi(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`, session.token);

  let manifestPromise = null;
  function getManifest() {
    if (!manifestPromise) manifestPromise = fetchManifest(repoUrl);
    return manifestPromise;
  }

  const results = await Promise.all(prs.map(async (pr) => {
    try {
      const files = await githubApi(`/repos/${owner}/${repo}/pulls/${pr.number}/files`, session.token);
      const photoFile = files.find((f) => f.status === "added" && /^images\//.test(f.filename));
      if (!photoFile) return null;
      const filename = photoFile.filename.replace(/^images\//, "");
      const { procedureId, contributor } = parsePhotoFilename(filename);
      const { manifest, branch } = await getManifest();
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
        repo_url: repoUrl, edition_id: manifest.edition_id || "(edition not set)",
        procedure_id: procedureId, page: entry.page, section_heading: entry.section_heading,
        photo_raw_url: `https://raw.githubusercontent.com/${pr.head.repo.full_name}/${pr.head.ref}/${photoFile.filename}`,
        original_bbox: entry.pixel_bbox,
        composite_width_px: geo.composite_width_px, composite_height_px: geo.composite_height_px,
        page_width_pt: geo.page_width_pt, page_height_pt: geo.page_height_pt,
        base_branch: branch,
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

// ---- opening a PR: fetch the real submitted photo, not a mock one ----
async function openPR(number) {
  currentPR = currentPRs.find(p => p.number === number);
  box = null;
  pdfDoc = null;
  submittedPhotoImg = null;
  document.getElementById("prLog").textContent = "";
  document.getElementById("reviewArea").classList.add("open");
  document.getElementById("reviewTitle").textContent =
    `${formatProcedureLabel(currentPR.procedure_id, currentPR.page, currentPR.section_heading)} - Request #${currentPR.number}`;
  document.getElementById("reviewMeta").textContent = `Submitted by @${currentPR.author}`;
  document.getElementById("compareWrap").style.display = "none";
  document.getElementById("acceptBtn").disabled = true;
  document.getElementById("rejectBtn").disabled = false;
  document.getElementById("resetBoxBtn").disabled = true;

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
  document.getElementById("acceptBtn").disabled = !submittedPhotoImg;
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
    box = { ...o };
    if (dragState.corner.includes("w")) box.x0 = o.x0 + dx;
    if (dragState.corner.includes("e")) box.x1 = o.x1 + dx;
    if (dragState.corner.includes("n")) box.y0 = o.y0 + dy;
    if (dragState.corner.includes("s")) box.y1 = o.y1 + dy;
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
  document.getElementById("rejectBtn").disabled = true;
  try {
    log(`merging request #${currentPR.number}...`);
    await githubApi(`/repos/${owner}/${repo}/pulls/${currentPR.number}/merge`, session.token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commit_title: `Merge #${currentPR.number}: ${currentPR.title}` }),
    });
    log(`merged.`);

    const finalBbox = canvasToBbox(box);
    const bboxChanged = JSON.stringify(finalBbox) !== JSON.stringify(currentPR.original_bbox);
    if (bboxChanged) {
      log(`updating ${currentPR.procedure_id}'s photo position in manifest.json (adjusted during review)...`);
      const manifestFile = await githubApi(`/repos/${owner}/${repo}/contents/manifest.json?ref=${currentPR.base_branch}`, session.token);
      const manifestData = JSON.parse(base64ToUtf8(manifestFile.content.replace(/\n/g, "")));
      const entry = manifestData.entries.find((e) => e.procedure_id === currentPR.procedure_id);
      if (entry) {
        entry.pixel_bbox = finalBbox;
        await githubApi(`/repos/${owner}/${repo}/contents/manifest.json`, session.token, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Adjust ${currentPR.procedure_id}'s photo position (reviewed in #${currentPR.number})`,
            content: utf8ToBase64(JSON.stringify(manifestData, null, 2)),
            sha: manifestFile.sha,
            branch: currentPR.base_branch,
          }),
        });
        log(`manifest.json updated.`);
      } else {
        log(`WARNING: ${currentPR.procedure_id} not found in manifest.json anymore -- skipped the position update.`);
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
    initReviewTab();
  } catch (e) {
    log(`accept failed: ${e.message}`);
    document.getElementById("acceptBtn").disabled = false;
    document.getElementById("rejectBtn").disabled = false;
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
    document.getElementById("resetBoxBtn").disabled = true;
    initReviewTab();
  } catch (e) {
    log(`reject failed: ${e.message}`);
    document.getElementById("acceptBtn").disabled = false;
    document.getElementById("rejectBtn").disabled = false;
  }
});

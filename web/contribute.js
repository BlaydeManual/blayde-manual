// Blayde Manual -- Contributor Portal. Browsing/proposing a photo never
// requires an account; signing in only happens at the moment something
// needs to persist beyond this one visit (saving to "My uploads," or
// submitting). See ROADMAP.md's Contributor Portal section for the full
// reasoning, and FEATURE_REQUESTS.md for why a fully offline/anonymous
// path (no identity, ever, even across devices) isn't what's built.

const UPLOADS_STORAGE_KEY = "blayde_my_uploads_v1";
const MAINTAINER_REQUESTS_KEY = "blayde_maintainer_requests_v1";
const REMOVAL_REQUESTS_KEY = "blayde_removal_requests_v1";
// Real GitHub sign-in (auth.js) as of 2026-08-25 -- currentUsername
// comes from the actual signed-in account, not a fixed mock identity.

// No live registry.json/manifest.json exists yet (nothing's been pushed
// anywhere, see LEGAL.md) -- this mirrors the two real seed procedures
// in mock-pr-store.js's MOCK_PRS_SEED so the whole flow, including the
// local-context PDF crop compare, can be genuinely tested end-to-end
// against the real local test manual, not just against fabricated data.
const MOCK_MANIFEST_CONTEXT = {
  "p040_2-10-periodic-maintenance_fig1": {
    section_heading: "PERIODIC MAINTENANCE", page: 40,
    pixel_bbox: [1466, 222, 2326, 795],
    composite_width_px: 2544, composite_height_px: 3276,
    page_width_pt: 612.0, page_height_pt: 792.0,
    vehicle_slug: "suzuki-sv650-1999-2002", edition_id: "OEM",
  },
  "p028_chain-slack-adjustment_fig2": {
    section_heading: "CHAIN SLACK ADJUSTMENT", page: 28,
    pixel_bbox: [900, 1400, 2100, 2600],
    composite_width_px: 2544, composite_height_px: 3276,
    page_width_pt: 612.0, page_height_pt: 792.0,
    vehicle_slug: "suzuki-sv650-1999-2002", edition_id: "Haynes",
  },
  // Matches mock-pr-store.js's third seed PR (#5) -- kept in sync so the
  // demo covers the same procedures on both sides, not just the two
  // suzuki ones.
  "p012_front-brake-caliper_fig1": {
    section_heading: "FRONT BRAKE CALIPER", page: 12,
    pixel_bbox: [300, 500, 1400, 1800],
    composite_width_px: 2200, composite_height_px: 2900,
    page_width_pt: 612.0, page_height_pt: 792.0,
    vehicle_slug: "kawasaki-kx250-1998-2000", edition_id: "OEM",
  },
};

const params = new URLSearchParams(location.search);
// A real (repo, procedure) pair only ever arrives via an in-PDF QR
// code -- .has(), not the fallback values below, so a general nav
// link (no params at all) is distinguishable from a real QR visit.
const hasProcedureContext = params.has("repo") && params.has("procedure");
const repoUrl = params.get("repo") || "https://github.com/BlaydeManual/suzuki-sv650-1999-2002";
const procedureId = params.get("procedure") || "p040_2-10-periodic-maintenance_fig1";

let signedIn = false;
let currentUsername = null;
let pendingAction = null; // "draft" | "submit" -- what to actually do once sign-in completes
let pendingMaintainRequest = null; // vehicle key -- same deferred-sign-in pattern, separate action
let context = null;
let selectedPhotoDataUrl = null;
let selectedPhotoFilename = null;
let uploads = loadUploads();
let maintainerRequests = loadMaintainerRequests();

function loadUploads() {
  try {
    const raw = localStorage.getItem(UPLOADS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* best-effort */ }
  return [];
}
function saveUploads() {
  try { localStorage.setItem(UPLOADS_STORAGE_KEY, JSON.stringify(uploads)); } catch (e) { /* best-effort */ }
}

// Mock stand-in for the real mechanism designed in ROADMAP.md's
// maintainer-succession entry: a visible request aimed at the current
// maintainer(s) and the org quorum, timed out against the same
// active/quiet signal my-vehicles.js already computes. The real
// version needs a live repo (a scheduled GitHub Action, run centrally
// from the org's own registry repo) to actually evaluate the grace
// period -- this is the UI half only, same convention as every other
// mocked action on this page.
function loadMaintainerRequests() {
  try {
    const raw = localStorage.getItem(MAINTAINER_REQUESTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* best-effort */ }
  return [];
}
function saveMaintainerRequests() {
  try { localStorage.setItem(MAINTAINER_REQUESTS_KEY, JSON.stringify(maintainerRequests)); } catch (e) { /* best-effort */ }
}
function hasRequestedMaintain(vehicleKey) {
  return maintainerRequests.some((r) => r.vehicleKey === vehicleKey && r.requestedBy === currentUsername);
}

// The "gitless" answer to "can I revoke a photo I contributed" (see
// docs/faq.html): a photo's CC-BY 4.0 license is irrevocable once
// granted -- copies already patched into other people's manuals can't
// be reached -- but removal from the repo's own active images/ folder
// going forward is always available on request, no git knowledge
// needed. This is that request button, real mock persistence, same
// convention as every other action here.
let removalRequests = loadRemovalRequests();
function loadRemovalRequests() {
  try {
    const raw = localStorage.getItem(REMOVAL_REQUESTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* best-effort */ }
  return [];
}
function saveRemovalRequests() {
  try { localStorage.setItem(REMOVAL_REQUESTS_KEY, JSON.stringify(removalRequests)); } catch (e) { /* best-effort */ }
}
function hasRequestedRemoval(uploadId) {
  return removalRequests.some((r) => r.uploadId === uploadId);
}
function requestRemoval(uploadId) {
  if (hasRequestedRemoval(uploadId)) return;
  const upload = uploads.find((u) => u.id === uploadId);
  removalRequests.push({ uploadId, procedureId: upload?.procedureId, requestedBy: currentUsername, requestedAt: new Date().toISOString().slice(0, 10) });
  saveRemovalRequests();
  log(`[mock] requested removal of ${upload?.photoFilename || uploadId} -- the repo maintainer(s) take it out of the active images/ folder. It stops being offered to anyone from that point forward; copies already patched into someone else's manual aren't reachable (see the FAQ on why).`);
  renderUploads();
}

function log(msg) {
  const el = document.getElementById("log");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

// ---- context lookup: try the real manifest first (works once a repo
// actually exists), fall back to the mock context, so browsing never
// dead-ends just because nothing's deployed yet ----
async function loadContext() {
  try {
    const { manifest } = await fetchManifest(repoUrl);
    const entry = (manifest.entries || []).find((e) => e.procedure_id === procedureId);
    const geo = entry && manifest.page_geometry && manifest.page_geometry[String(entry.page)];
    if (entry && geo) {
      return {
        section_heading: entry.section_heading, page: entry.page, pixel_bbox: entry.pixel_bbox,
        composite_width_px: geo.composite_width_px, composite_height_px: geo.composite_height_px,
        page_width_pt: geo.page_width_pt, page_height_pt: geo.page_height_pt,
        vehicle_slug: manifest.vehicle, real: true,
      };
    }
  } catch (e) { /* repo unreachable -- fall through to mock context */ }
  if (MOCK_MANIFEST_CONTEXT[procedureId]) return { ...MOCK_MANIFEST_CONTEXT[procedureId], real: false };
  return null;
}

// A session set by a previous sign-in this tab (auth.js, sessionStorage)
// survives a page reload without forcing sign-in again -- only closing
// the tab clears it.
const existingSession = window.BlaydeAuth ? BlaydeAuth.getSession() : null;
if (existingSession) {
  signedIn = true;
  currentUsername = existingSession.username;
}

// Two arrival paths: a real (repo, procedure) pair means someone
// scanned a QR code inside a patched PDF, straight into that one
// procedure's photo picker. No params means the site's own
// "Contributors" nav link -- there's no procedure to show a picker
// for, so sign in first (same pattern as the Maintainer Portal) and
// land on "My uploads" instead.
if (hasProcedureContext) {
  document.getElementById("procedureFlow").style.display = "block";
  (async () => {
    context = await loadContext();
    const titleEl = document.getElementById("contextTitle");
    const metaEl = document.getElementById("contextMeta");
    if (context) {
      titleEl.textContent = context.section_heading || procedureId;
      metaEl.textContent = `${context.vehicle_slug} · page ${context.page}` +
        (context.real ? "" : " (repo not reachable yet -- showing what's known locally)");
    } else {
      titleEl.textContent = procedureId;
      metaEl.textContent = "Couldn't load extra context for this one -- you can still propose a photo for it.";
    }
  })();
} else {
  document.getElementById("procedureFlow").style.display = "none";
  document.getElementById("landingSignIn").style.display = signedIn ? "none" : "block";
}

// Shared by both sign-in buttons -- one real GitHub OAuth flow, not two
// separate implementations that could drift.
async function performSignIn() {
  try {
    const session = await BlaydeAuth.signInWithGitHub();
    signedIn = true;
    currentUsername = session.username;
    log(`Signed in with GitHub as @${currentUsername}.`);
    return true;
  } catch (err) {
    log(`Sign-in failed: ${err.message}`);
    return false;
  }
}

document.getElementById("landingSignInBtn").addEventListener("click", async () => {
  if (await performSignIn()) {
    document.getElementById("landingSignIn").style.display = "none";
    renderUploads();
  }
});

renderUploads();

// ---- photo picker ----
// EXIF (GPS location, camera/phone model, timestamp) is stripped here,
// before the photo is stored anywhere -- even a draft that never gets
// submitted. A server-side check (e.g. checker.py in CI) runs after a
// photo is already committed to a branch; it can catch a leak, it can't
// undo one, since the data's already technically public by then. The
// load-bearing check has to be client-side, before the first save --
// see ROADMAP.md's finding on this exact point. Re-encoding through a
// canvas is the standard technique: canvas.toDataURL() never carries the
// source file's metadata forward, so there's no EXIF field to parse or
// allowlist -- the whole block is simply never in the output.
document.getElementById("photoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const saveBtn = document.getElementById("saveDraftBtn"), submitBtn = document.getElementById("submitNowBtn");
  const consentRow = document.getElementById("consentRow");
  const ownCheck = document.getElementById("consentOwnPhoto"), licenseCheck = document.getElementById("consentLicense");
  if (!file) { saveBtn.disabled = true; submitBtn.disabled = true; consentRow.style.display = "none"; return; }
  selectedPhotoFilename = file.name;

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  selectedPhotoDataUrl = canvas.toDataURL(outputType, 0.92);

  const thumb = document.getElementById("previewThumb");
  thumb.src = selectedPhotoDataUrl;
  thumb.style.display = "block";
  // A new photo means fresh consent, never carried over from whatever
  // was picked (and possibly already attested to) before it -- an
  // unticked box on a new file is the safe default, not an inherited
  // yes from a different photo.
  ownCheck.checked = false;
  licenseCheck.checked = false;
  consentRow.style.display = "block";
  updateSubmitEnabled();
  log(`${file.name}: re-encoded locally to strip EXIF metadata (GPS, camera model, timestamp) before saving -- happens now, not after this reaches a server.`);
});

// Real consent capture, not just a PR template checkbox nobody's forced
// to fill in truthfully -- see ROADMAP.md's direct-to-git contribution
// audit. Both boxes are required before either save action enables,
// same two attestations the PR template already asks for, just actually
// gating the action here instead of living only as decoration.
function updateSubmitEnabled() {
  const hasPhoto = !!selectedPhotoDataUrl;
  const consented = document.getElementById("consentOwnPhoto").checked && document.getElementById("consentLicense").checked;
  document.getElementById("saveDraftBtn").disabled = !(hasPhoto && consented);
  document.getElementById("submitNowBtn").disabled = !(hasPhoto && consented);
}
document.getElementById("consentOwnPhoto").addEventListener("change", updateSubmitEnabled);
document.getElementById("consentLicense").addEventListener("change", updateSubmitEnabled);

document.getElementById("saveDraftBtn").addEventListener("click", () => requestAction("draft"));
document.getElementById("submitNowBtn").addEventListener("click", () => requestAction("submit"));

function requestAction(action) {
  if (!signedIn) {
    pendingAction = action;
    document.getElementById("signInPrompt").style.display = "block";
    return;
  }
  performAction(action);
}

document.getElementById("promptSignInBtn").addEventListener("click", async () => {
  if (!(await performSignIn())) return;
  document.getElementById("signInPrompt").style.display = "none";
  if (pendingAction) { performAction(pendingAction); pendingAction = null; }
  if (pendingMaintainRequest) { performMaintainRequest(pendingMaintainRequest); pendingMaintainRequest = null; }
});

function requestToMaintain(vehicleKey) {
  if (!signedIn) {
    pendingMaintainRequest = vehicleKey;
    document.getElementById("signInPrompt").style.display = "block";
    return;
  }
  performMaintainRequest(vehicleKey);
}

function performMaintainRequest(vehicleKey) {
  if (hasRequestedMaintain(vehicleKey)) return;
  maintainerRequests.push({ vehicleKey, requestedBy: currentUsername, requestedAt: new Date().toISOString().slice(0, 10) });
  saveMaintainerRequests();
  log(`[mock] requested to help maintain ${vehicleKey} -- notifies the current maintainer(s) and the org quorum. If there's no response within the grace period, it escalates automatically.`);
  renderUploads();
}

async function performAction(action) {
  const upload = {
    id: `${procedureId}_${Date.now()}`,
    repoUrl, procedureId,
    vehicleSlug: context?.vehicle_slug || null,
    editionId: context?.edition_id || null,
    sectionHeading: context?.section_heading || procedureId,
    page: context?.page || null,
    pixelBbox: context?.pixel_bbox || null,
    compositeWidthPx: context?.composite_width_px || null,
    compositeHeightPx: context?.composite_height_px || null,
    pageWidthPt: context?.page_width_pt || null,
    pageHeightPt: context?.page_height_pt || null,
    photoDataUrl: selectedPhotoDataUrl,
    photoFilename: selectedPhotoFilename,
    author: currentUsername,
    status: "draft",
    // Real attestation, captured at the moment of action, not assumed
    // from a PR template checkbox nobody was forced to actually tick --
    // see ROADMAP.md's direct-to-git contribution audit. Both are
    // already required to be true before this function is even
    // reachable (updateSubmitEnabled gates it), recorded here for the
    // traceable record now carried in the real PR body too.
    consentOwnPhoto: true,
    consentLicenseCcBy4: true,
  };

  if (action === "submit") {
    log(`Opening a pull request on ${repoUrl}...`);
    try {
      const pr = await submitPhotoToGitHub(upload);
      upload.status = "submitted";
      upload.prNumber = pr.number;
      upload.prUrl = pr.url;
      log(`Submitted -- pull request #${pr.number} opened: ${pr.url}`);
    } catch (err) {
      log(`Submit failed: ${err.message} -- saved as a draft instead, try Submit again from My uploads.`);
    }
  } else {
    log(`Saved to your uploads -- not submitted yet.`);
  }

  uploads.push(upload);
  saveUploads();
  renderUploads();
}

// ---- real submission: fork the vehicle repo into the contributor's own
// account, push the photo there, open a cross-repo PR back to the
// vehicle repo. A signed-in contributor essentially never has push
// access to BlaydeManual/<vehicle> directly -- only collaborators do --
// so pushing straight to it would only work for maintainers testing
// their own repos. Fork-then-PR is the actual standard GitHub pattern
// for this (the same one GitHub's own "propose changes" UI uses), not
// a shortcut. Verified against GitHub's REST API docs before building
// this, not assumed from memory: POST .../forks is async (202,
// "may have to wait a short period" -- github.com/en/rest/repos/forks),
// and a cross-repo PR's `head` must be "username:branch"
// (github.com/en/rest/pulls/pulls). ----
// ownerRepo() and githubApi() are shared with review-panel.js -- see
// registry.js, one implementation instead of one per page.
function dataUrlToBase64(dataUrl) {
  return dataUrl.split(",")[1];
}

// Polls the fork for its default branch ref, since fork creation is
// async on GitHub's side -- the fork can 200 on a plain GET before its
// git refs are actually queryable. GitHub says up to 5 minutes in rare
// cases; 30s/1.5s-interval covers the overwhelming majority without
// hanging the UI indefinitely on the rare slow one.
async function waitForForkRef(forkOwner, repo, branch, token) {
  for (let i = 0; i < 20; i++) {
    try {
      return await githubApi(`/repos/${forkOwner}/${repo}/git/ref/heads/${branch}`, token);
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`Fork of ${repo} is still being created on GitHub's side -- try submitting again in a minute.`);
}

async function submitPhotoToGitHub(upload) {
  const session = BlaydeAuth.getSession();
  if (!session) throw new Error("Not signed in.");
  const [owner, repo] = ownerRepo(upload.repoUrl);
  const ext = (upload.photoFilename.match(/\.(jpe?g|png|webp)$/i)?.[0] || ".jpg").toLowerCase();

  let defaultBranch = null, upstreamSha = null;
  for (const branch of ["main", "master"]) {
    try {
      const ref = await githubApi(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, session.token);
      defaultBranch = branch;
      upstreamSha = ref.object.sha;
      break;
    } catch (e) { /* try next */ }
  }
  if (!defaultBranch) throw new Error(`Could not find a main or master branch on ${owner}/${repo}.`);

  // POST is safe to call even if a fork already exists from a previous
  // submission -- GitHub just returns the existing one.
  await githubApi(`/repos/${owner}/${repo}/forks`, session.token, { method: "POST" });
  const forkOwner = session.username;
  const forkRef = await waitForForkRef(forkOwner, repo, defaultBranch, session.token);

  const branchName = `contribute/${upload.procedureId}-${Date.now()}`;
  await githubApi(`/repos/${forkOwner}/${repo}/git/refs`, session.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: forkRef.object.sha }),
  });

  // <procedure_id>__by_<username>[__altN].ext -- the exact convention
  // patcher.js's parsePhotoFilename expects. Alt-numbering only kicks
  // in if this same contributor already has a photo at this exact path
  // (a genuine resubmission), not on any other kind of failure.
  const content = dataUrlToBase64(upload.photoDataUrl);
  let path = `images/${upload.procedureId}__by_${forkOwner}${ext}`;
  for (let altN = 2; ; altN++) {
    try {
      await githubApi(`/repos/${forkOwner}/${repo}/contents/${path}`, session.token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Add photo for ${upload.procedureId}`, content, branch: branchName }),
      });
      break;
    } catch (e) {
      if (e.status === 422 && altN <= 5) {
        path = `images/${upload.procedureId}__by_${forkOwner}__alt${altN}${ext}`;
        continue;
      }
      throw e;
    }
  }

  const prBody = [
    `Photo for \`${upload.procedureId}\` (${upload.sectionHeading}).`,
    ``,
    `Submitted via the Contributor Portal. Both required attestations were checked before this was allowed to submit:`,
    `- This is the contributor's own photo, not sourced from elsewhere.`,
    `- Licensed CC-BY 4.0.`,
  ].join("\n");

  const pr = await githubApi(`/repos/${owner}/${repo}/pulls`, session.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `Add photo: ${upload.sectionHeading}`,
      head: `${forkOwner}:${branchName}`,
      base: defaultBranch,
      body: prBody,
    }),
  });

  return { number: pr.number, url: pr.html_url };
}

async function markSubmitted(uploadId) {
  const upload = uploads.find((u) => u.id === uploadId);
  if (!upload || upload.status === "submitted") return;
  log(`Opening a pull request on ${upload.repoUrl}...`);
  try {
    const pr = await submitPhotoToGitHub(upload);
    upload.status = "submitted";
    upload.prNumber = pr.number;
    upload.prUrl = pr.url;
    saveUploads();
    renderUploads();
    log(`Submitted -- pull request #${pr.number} opened: ${pr.url}`);
  } catch (err) {
    log(`Submit failed: ${err.message}`);
  }
}

// Submissions are real pull requests now (submitPhotoToGitHub), so
// there's nothing in the local mock PR store to look an outcome up
// against anymore -- this always reads as "still pending" until
// review-panel.js/org-approval.js go real too and can report an actual
// accept/reject back here. upload.prUrl (set at submit time) is the
// honest interim answer: a direct link to check status on GitHub.
function outcomeFor(upload) {
  return null;
}

// ---- My uploads -- grouped by vehicle (collapsible, since this list
// grows across every procedure/vehicle someone's ever contributed to,
// not just the one the QR pointed at this time), sorted by page within
// each group so it reads in manual order, not submission order. ----
function renderUploads() {
  const section = document.getElementById("uploadsSection");
  const list = document.getElementById("uploadsList");
  const empty = document.getElementById("uploadsEmpty");
  // Arriving via a QR code, browsing past uploads never required
  // signing in again (see the top-of-file comment) -- but arriving via
  // the landing page's sign-in gate and seeing "My uploads" appear
  // BEFORE actually signing in reads as broken, since the gate just
  // told you sign-in was required to get here. Once signed in, both
  // paths behave the same.
  const canShow = signedIn || (hasProcedureContext && uploads.length > 0);
  section.style.display = canShow ? "block" : "none";
  empty.style.display = uploads.length ? "none" : "block";
  list.innerHTML = "";

  const byVehicle = new Map();
  uploads.forEach((u) => {
    const key = u.vehicleSlug || u.repoUrl;
    if (!byVehicle.has(key)) byVehicle.set(key, []);
    byVehicle.get(key).push(u);
  });

  byVehicle.forEach((group, vehicleKey) => {
    group.sort((a, b) => (a.page || 0) - (b.page || 0));
    const details = document.createElement("details");
    details.open = true;
    details.className = "vehicle-group";
    const summary = document.createElement("summary");
    summary.className = "vehicle-bar";
    summary.textContent = `${vehicleKey} (${group.length})`;
    details.appendChild(summary);

    // One tier down from vehicle -- a vehicle repo can hold more than
    // one edition now (see ROADMAP.md's multi-manual correction,
    // 2026-08-25), so uploads need vehicle -> edition -> upload, not
    // just vehicle -> upload.
    const byEdition = new Map();
    group.forEach((u) => {
      const key = u.editionId || "(edition not set)";
      if (!byEdition.has(key)) byEdition.set(key, []);
      byEdition.get(key).push(u);
    });
    byEdition.forEach((editionUploads, editionId) => {
      const editionHeading = document.createElement("h4");
      editionHeading.className = "edition-bar";
      editionHeading.textContent = editionId;
      details.appendChild(editionHeading);

      editionUploads.forEach((u) => {
        const outcome = outcomeFor(u); // null while pending -- {status, note} once a maintainer's acted on it
        const displayStatus = outcome ? outcome.status : u.status;
        const pageLabel = u.page != null ? `PG. ${u.page} &mdash; ` : "";
        const row = document.createElement("div");
        row.className = "upload-row";
        row.innerHTML = `
          <div class="upload-left">
            <img class="upload-thumb" src="${u.photoDataUrl}" alt="">
            <div>
              <div class="upload-title">${pageLabel}${u.sectionHeading}<span class="upload-status ${displayStatus}">${displayStatus}</span></div>
              <div class="upload-meta">${u.procedureId}${u.prNumber != null ? ` &middot; ${u.prUrl ? `<a href="${u.prUrl}" target="_blank" rel="noopener" style="color:inherit;">Request #${u.prNumber}</a>` : `Request #${u.prNumber}`}` : ""}</div>
              ${outcome && outcome.note ? `<div class="upload-note">&ldquo;${outcome.note}&rdquo; &mdash; maintainer note</div>` : ""}
            </div>
          </div>
          <div class="upload-actions">
            <button class="secondary" data-view="${u.id}">View</button>
            ${u.status === "draft" ? `<button data-submit="${u.id}">Submit</button>` : ""}
            ${u.status !== "draft" ? (
              hasRequestedRemoval(u.id)
                ? `<span class="sub" style="margin:0 0 0 6px; color:var(--mint);">Removal requested</span>`
                : `<button class="secondary" data-remove="${u.id}">Request removal</button>`
            ) : ""}
          </div>
        `;
        details.appendChild(row);
      });
    });

    const maintainRow = document.createElement("div");
    maintainRow.className = "maintain-request-row";
    maintainRow.innerHTML = hasRequestedMaintain(vehicleKey)
      ? `<span class="sub" style="margin:0; color:var(--mint);">Requested to help maintain -- the current maintainer(s) and org team have been notified.</span>`
      : `<button class="secondary" data-maintain="${vehicleKey}">Request to help maintain this vehicle</button>`;
    details.appendChild(maintainRow);

    list.appendChild(details);
  });

  list.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => openCompare(btn.dataset.view));
  });
  list.querySelectorAll("[data-maintain]").forEach((btn) => {
    btn.addEventListener("click", () => requestToMaintain(btn.dataset.maintain));
  });
  list.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => requestRemoval(btn.dataset.remove));
  });
  list.querySelectorAll("[data-submit]").forEach((btn) => {
    btn.addEventListener("click", () => markSubmitted(btn.dataset.submit));
  });
}

// ---- view/compare: local-context rule -- the original scan can only
// ever be rendered from the viewer's own already-loaded PDF, in their
// own session, same rule every other tool in this project follows.
// Crop is the default view (best for the actual "does this match"
// judgment, already framed comparably to the proposed photo); "view
// whole page" is an add-on toggle, not a replacement -- useful when
// reviewing more than one procedure from the same page in one sitting,
// worse for the tight photo-to-photo comparison itself. Both render
// from one cached canvas so toggling between them is instant, no
// second PDF re-render. ----
let compareUpload = null;
let lastRenderedPageCanvas = null; // cache -- avoids re-rendering when toggling crop <-> whole page

function openCompare(uploadId) {
  compareUpload = uploads.find((u) => u.id === uploadId);
  if (!compareUpload) return;
  lastRenderedPageCanvas = null;
  document.getElementById("compareArea").style.display = "block";
  document.getElementById("compareTitle").textContent = compareUpload.sectionHeading;
  document.getElementById("compareGrid").style.display = "none";
  document.getElementById("compareToggleRow").style.display = "none";
  document.getElementById("wholePageArea").style.display = "none";
  document.getElementById("comparePhoto").src = compareUpload.photoDataUrl;
  document.getElementById("compareArea").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.getElementById("comparePdfPicker").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !compareUpload || !compareUpload.pixelBbox) {
    log(!compareUpload?.pixelBbox ? "No page geometry known for this upload -- can't render a crop to compare against." : "");
    return;
  }
  const buf = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdfDoc.getPage(compareUpload.page);
  const scale = 2.5;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  lastRenderedPageCanvas = canvas;

  const sx = canvas.width / compareUpload.compositeWidthPx;
  const sy = canvas.height / compareUpload.compositeHeightPx;
  const [x0, y0, x1, y1] = compareUpload.pixelBbox;
  const w = Math.max(1, Math.round((x1 - x0) * sx)), h = Math.max(1, Math.round((y1 - y0) * sy));
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  out.getContext("2d").drawImage(canvas, x0 * sx, y0 * sy, w, h, 0, 0, w, h);

  document.getElementById("compareOriginal").src = out.toDataURL("image/jpeg", 0.9);
  document.getElementById("compareGrid").style.display = "flex";
  document.getElementById("compareToggleRow").style.display = "block";
});

document.getElementById("viewWholePageBtn").addEventListener("click", () => {
  const wholeArea = document.getElementById("wholePageArea");
  const showing = wholeArea.style.display === "block";
  if (showing) {
    wholeArea.style.display = "none";
    document.getElementById("viewWholePageBtn").textContent = "View whole page";
    return;
  }
  if (!lastRenderedPageCanvas || !compareUpload?.pixelBbox) return;
  const canvas = lastRenderedPageCanvas;
  document.getElementById("wholePageImg").src = canvas.toDataURL("image/jpeg", 0.85);
  const [x0, y0, x1, y1] = compareUpload.pixelBbox;
  const pctLeft = (x0 / compareUpload.compositeWidthPx) * 100;
  const pctTop = (y0 / compareUpload.compositeHeightPx) * 100;
  const pctW = ((x1 - x0) / compareUpload.compositeWidthPx) * 100;
  const pctH = ((y1 - y0) / compareUpload.compositeHeightPx) * 100;
  const hl = document.getElementById("wholePageHighlight");
  hl.style.left = pctLeft + "%"; hl.style.top = pctTop + "%";
  hl.style.width = pctW + "%"; hl.style.height = pctH + "%";
  wholeArea.style.display = "block";
  document.getElementById("viewWholePageBtn").textContent = "Hide whole page";
});

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

const CANONICAL_REGISTRY_URL = "https://raw.githubusercontent.com/BlaydeManual/registry/main/registry.json";
const MANUAL_TYPES_URL = "https://raw.githubusercontent.com/BlaydeManual/registry/main/manual-types.json";

const params = new URLSearchParams(location.search);
// A real context only ever arrives via an in-PDF QR code -- .has(),
// not the fallback values below, so a general nav link (no params at
// all) is distinguishable from a real QR visit. Two param shapes:
// `v=<vehicle_slug>` (current) resolves to a repo_url via the
// registry below; `repo=<full repo URL>` (legacy) is used directly,
// so a QR already printed into someone's patched manual before this
// change keeps working without needing a re-patch.
const vehicleSlug = params.get("v");
const legacyRepoUrl = params.get("repo");
// Required alongside v= now, not inferred -- a vehicle repo can hold
// more than one edition, each with its own manifest.json/images/, so
// vehicle_slug alone no longer picks a unique registry row. Every real
// link into this page (patcher.js's QR codes, issue-requests.js's
// "problem with this photo") passes edition explicitly as of this
// change. Legacy repo= links predate multi-edition repos entirely (a
// repo that could still be resolved by URL alone never had a second
// edition to be ambiguous about), so they don't need this param to
// stay unambiguous.
const editionParam = params.get("edition");
const hasProcedureContext = (params.has("v") || params.has("repo")) && params.has("procedure");
let repoUrl = legacyRepoUrl || "https://github.com/BlaydeManual/suzuki-sv650-1999-2002";
const procedureId = params.get("procedure") || "p040_2-10-periodic-maintenance_fig1";

// registry.json is the only place edition_id lives (a real vehicle's
// manifest.json has no such field -- edition is a registry-level
// concept). Without this, every real upload against a live manifest --
// as opposed to the MOCK_MANIFEST_CONTEXT fixtures above, which
// hardcode edition_id -- got "(edition not set)" in My uploads: a real,
// live bug, not a display quirk. Defaults to editionParam so a broken/
// offline registry still lets a real QR-code visit (which always
// carries edition=) work with the edition it already knows, rather
// than losing it entirely.
let resolvedEditionId = editionParam || null;

// Resolves `v=<vehicle_slug>` to a real repo_url via registry.json --
// the same lookup registry-browse.js already does per vehicle, just
// for one slug instead of the whole list. Matches on edition_id too
// when editionParam is present (the normal case now) so a vehicle with
// two editions resolves to the RIGHT one, not just whichever registry
// row happens to come first. For the legacy `repo=` path, repoUrl is
// already known, so this looks the entry up by repo_url instead,
// purely to still recover edition_id. Falls back silently (matching
// every other real-repo-unreachable fallback on this page) if the
// registry or the match can't be found, so a broken/offline registry
// degrades to "showing what's known locally" instead of a dead end.
async function resolveRepoUrl() {
  if (!vehicleSlug && !legacyRepoUrl) return;
  try {
    const registryData = await loadRegistry(CANONICAL_REGISTRY_URL);
    const match = (registryData.vehicles || []).find((v) =>
      v.status === "approved" && (vehicleSlug
        ? v.vehicle_slug === vehicleSlug && (!editionParam || v.edition_id === editionParam)
        : v.repo_url === legacyRepoUrl));
    if (match) {
      if (vehicleSlug) repoUrl = match.repo_url;
      resolvedEditionId = match.edition_id || null;
    }
  } catch (e) { /* registry unreachable -- fall through to the default mock repo */ }
}

let signedIn = false;
let currentUsername = null;
let pendingMaintainRequest = null; // {vehicleKey, repoUrl} -- deferred-sign-in pattern for "help maintain"
// Real bug, caught live: two identical pull requests opened for the
// same photo from one click, because nothing stopped a second click
// (or a second call through the deferred-sign-in path) from starting
// a second real submission while the first was still in flight.
// review-panel.js's Accept/Reject and org-approval.js's Approve
// already guard this by disabling their own button immediately; this
// is the same guard, just keyed by uploadId since multiple upload rows
// can legitimately submit independently of each other.
let actionInFlight = false;
const submittingIds = new Set();
let context = null;
let selectedPhotoDataUrl = null;
let selectedPhotoFilename = null;
let uploads = loadUploads();
let maintainerRequests = loadMaintainerRequests();
// Real GitHub state, not device-local -- see syncRealSubmissions.
// uploads (above) is purely localStorage, so a submission made from a
// different browser/device (or from before this browser's localStorage
// existed) was completely invisible here even though it's a real,
// live PR -- exactly the gap a maintainer confirmed live ("has a
// pending submission with 1/2 approvals... contributor site only shows
// one approved submission"). Kept separate from `uploads` rather than
// merged into it, so a server-fetched record never accidentally gets
// persisted back to localStorage as if it were a local draft.
let remoteUploads = [];

// Real review/merge status (approvals, changes-requested, checks) for a
// still-open PR -- same shape and same /pr-review-status endpoint
// review-panel.js already uses for maintainers, reused here so a
// contributor sees actual progress inline instead of having to click
// "View on GitHub" just to find out why nothing's happened yet.
// Keyed by `${repoUrl}#${prNumber}` so a re-render doesn't refetch a
// row that's already loaded.
const reviewStatusCache = new Map();

async function fetchPrReviewStatus(repoUrl, prNumber) {
  try {
    const session = BlaydeAuth.getSession();
    const resp = await fetch(
      `${BlaydeAuth.AUTH_WORKER_URL}pr-review-status?repo_url=${encodeURIComponent(repoUrl)}&pr_number=${prNumber}`,
      { headers: { Authorization: `Bearer ${session.token}` } }
    );
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || result.error) throw new Error(result.error || `status check failed (${resp.status})`);
    return result;
  } catch (e) {
    return { error: e.message };
  }
}

// Mirrors review-panel.js's renderReviewStatusLine wording exactly, so
// a contributor and a maintainer looking at the same PR see the same
// language for the same state.
function reviewStatusText(status) {
  if (!status) return "Checking review status&hellip;";
  if (status.error) return `Couldn't check review status: ${status.error}`;
  const parts = [];
  parts.push(
    `Reviews: ${status.approved_count}/${status.required_approvals} approved` +
    (status.approved_by.length ? ` (${status.approved_by.map((u) => "@" + u).join(", ")})` : "")
  );
  if (status.changes_requested_by.length) {
    parts.push(`changes requested by ${status.changes_requested_by.map((u) => "@" + u).join(", ")}`);
  }
  if (status.checks.length) {
    parts.push("Checks: " + status.checks.map((c) =>
      `${c.name} ${c.conclusion === "success" ? "&check;" : c.conclusion ? "&cross;" : "&hellip;"}`
    ).join(", "));
  }
  return parts.join(" &middot; ");
}

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

// Purely a local "don't let this browser spam the same request twice"
// guard -- NOT the source of truth for whether a request exists or was
// acted on. The real request is the GitHub issue submitMaintainRequest
// opens; my-vehicles.js's renderJoinRequests reads real open issues
// directly, independent of this.
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
  return maintainerRequests.find((r) => r.vehicleKey === vehicleKey && r.requestedBy === currentUsername) || null;
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

// Draft-only, on purpose: once a draft is actually submitted (status
// "submitted"/"forked"), real GitHub state exists for it (a PR, a
// branch on the contributor's own fork) that deleting the local record
// wouldn't touch at all -- silently deleting the local row would just
// make an already-real submission look like it vanished. Removing a
// draft never had that problem, since a draft has never left the
// browser -- so it's the one status this can safely just erase outright,
// no maintainer-facing removal request needed for something no one else
// has ever seen.
async function deleteDraftUpload(uploadId) {
  const upload = uploads.find((u) => u.id === uploadId);
  if (!upload || upload.status !== "draft") return;
  const ok = await blaydeConfirm(`Delete this draft (${upload.sectionHeading || upload.procedureId})? This can't be undone.`);
  if (!ok) return;
  uploads = uploads.filter((u) => u.id !== uploadId);
  saveUploads();
  if (compareUpload?.id === uploadId) {
    compareUpload = null;
    document.getElementById("compareArea").style.display = "none";
  }
  log(`Deleted draft for ${upload.procedureId}.`);
  renderUploads();
}

function log(msg) {
  const el = document.getElementById("log");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

// showToast() now lives in registry.js -- shared with review-panel.js
// and org-approval.js, which need the exact same "this real milestone
// just happened" confirmation, not just this page.

// ---- context lookup: try the real manifest first (works once a repo
// actually exists), fall back to the mock context, so browsing never
// dead-ends just because nothing's deployed yet ----
async function loadContext() {
  try {
    const { manifest } = await fetchManifest(repoUrl, resolvedEditionId);
    const entry = (manifest.entries || []).find((e) => e.procedure_id === procedureId);
    const geo = entry && manifest.page_geometry && manifest.page_geometry[String(entry.page)];
    if (entry && geo) {
      return {
        section_heading: entry.section_heading, page: entry.page, pixel_bbox: entry.pixel_bbox,
        composite_width_px: geo.composite_width_px, composite_height_px: geo.composite_height_px,
        page_width_pt: geo.page_width_pt, page_height_pt: geo.page_height_pt,
        vehicle_slug: manifest.vehicle, edition_id: resolvedEditionId, real: true,
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
  // Fire-and-forget -- renderUploads() below already shows whatever
  // this device knows locally immediately; this fills in anything real
  // that only exists on GitHub once the search completes, then
  // re-renders.
  syncRealSubmissions();
}
BlaydeAuth?.renderAuthStatus(handleLoggedOut);
updateRecatVisibility();

function handleLoggedOut() {
  signedIn = false;
  currentUsername = null;
  remoteUploads = []; // scoped to whoever was signed in -- stale otherwise if a different account signs in next
  if (!hasProcedureContext) document.getElementById("landingSignIn").style.display = "block";
  updateRecatVisibility();
  renderUploads();
}

// Recategorizing opens a real PR under the signed-in contributor's own
// account, so the form only makes sense to show once a real session
// exists -- same reasoning as gating "My Reviewables" on sign-in.
function updateRecatVisibility() {
  document.getElementById("recategorizeSection").style.display = signedIn ? "block" : "none";
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
    await resolveRepoUrl();
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
    BlaydeAuth.renderAuthStatus(handleLoggedOut);
    log(`Signed in with GitHub as @${currentUsername}.`);
    syncRealSubmissions();
    return true;
  } catch (err) {
    log(`Sign-in failed: ${err.message}`);
    return false;
  }
}

document.getElementById("landingSignInBtn").addEventListener("click", async () => {
  if (await performSignIn()) {
    document.getElementById("landingSignIn").style.display = "none";
    updateRecatVisibility();
    renderUploads();
  }
});

renderUploads();

// Real bug, caught live while auditing whether this actually meets the
// "zero data, only pixels" standard checker.py/accept-photo-pr now
// enforce: it does NOT, for JPEG specifically. The comment this
// replaces claimed canvas.toDataURL() "never carries the source file's
// metadata forward" -- true for the ORIGINAL file's EXIF/GPS (confirmed
// gone), false for what the browser itself adds back: Chrome injects a
// real ~470-byte APP2 ICC color profile into every JPEG canvas.toDataURL()
// produces, confirmed by decoding real output and finding it. That means
// every photo submitted through this real site's real upload flow would
// have been hard-rejected by the very checks meant to validate a
// legitimate submission -- not a contributor's mistake, not a bypass,
// the sanctioned path itself failing its own standard. PNG output was
// separately confirmed clean (IHDR/IDAT/IEND only, no ancillary chunks)
// -- this only affects the JPEG path.
function stripJpegAuxSegments(bytes) {
  const keep = [bytes.subarray(0, 2)]; // SOI
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xd9) { keep.push(bytes.subarray(offset, offset + 2)); offset += 2; break; }
    // Start-of-scan: everything from here on is entropy-coded image data,
    // not a marker stream -- 0xFF bytes inside it are always followed by
    // 0x00 stuffing or a restart marker, never a real segment to parse.
    // Copy the rest verbatim rather than risk corrupting it.
    if (marker === 0xda) { keep.push(bytes.subarray(offset)); offset = bytes.length; break; }
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    // Drop every APPn segment except APP0 (JFIF -- harmless container
    // bookkeeping, matches checker.py's own allowlist) and any comment
    // marker. This is where APP1 (Exif/XMP), APP2 (ICC profile -- the
    // real, confirmed offender), and APP13 (Photoshop/IPTC) all live.
    const isDroppableAppn = marker >= 0xe1 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!(isDroppableAppn || isComment)) {
      keep.push(bytes.subarray(offset, offset + 2 + segmentLength));
    }
    offset += 2 + segmentLength;
  }
  if (offset < bytes.length) keep.push(bytes.subarray(offset)); // malformed-input safety net
  const out = new Uint8Array(keep.reduce((n, a) => n + a.length, 0));
  let pos = 0;
  for (const chunk of keep) { out.set(chunk, pos); pos += chunk.length; }
  return out;
}

function dataUrlToBytes(dataUrl) {
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToDataUrl(bytes, mimeType) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

// ---- photo picker ----
// EXIF (GPS location, camera/phone model, timestamp) is stripped here,
// before the photo is stored anywhere -- even a draft that never gets
// submitted. A server-side check (e.g. checker.py in CI) runs after a
// photo is already committed to a branch; it can catch a leak, it can't
// undo one, since the data's already technically public by then. The
// load-bearing check has to be client-side, before the first save --
// see ROADMAP.md's finding on this exact point.
// Sized to THIS procedure's own destination, not one flat number for
// every photo -- most bboxes are far smaller than the rare full-page
// figure a flat cap has to accommodate, so a flat cap wastes real space
// on the common case. TARGET_DPI is print-quality; HEADROOM covers a
// maintainer enlarging the box during review (center-anchored resize,
// see review-panel.js) without ever needing the photo re-uploaded --
// direct call: a reviewer growing a box past 2x a good-quality
// contributor photo's original framing is realistically unlikely, so
// this is real headroom, not a token gesture. Never exceeds the
// previous flat cap (large boxes don't regress) and never goes below a
// sane floor (protects against a degenerate/near-zero bbox); falls
// back to that same flat cap whenever the destination isn't known yet
// (repo unreachable, mock context) so an upload is never worse off
// than before this existed. Checked against the real suzuki-sv650-1999
// manifest before picking these numbers: projects to ~107MB for all
// 918 photos fully populated, versus ~400-575MB for the flat cap this
// replaces -- only the largest ~2% of entries (near-full-page figures)
// even reach the ceiling.
const FALLBACK_MAX_DIMENSION_PX = 2000;
const TARGET_DPI = 200;
const HEADROOM = 2.0;
const MIN_DIMENSION_PX = 300;

function computeTargetLongEdge(ctx) {
  if (!ctx || !ctx.pixel_bbox || !ctx.composite_width_px || !ctx.composite_height_px || !ctx.page_width_pt || !ctx.page_height_pt) {
    return FALLBACK_MAX_DIMENSION_PX;
  }
  const scaleX = ctx.composite_width_px / ctx.page_width_pt;
  const scaleY = ctx.composite_height_px / ctx.page_height_pt;
  const [x0, y0, x1, y1] = ctx.pixel_bbox;
  const widthPt = (x1 - x0) / scaleX, heightPt = (y1 - y0) / scaleY;
  const longEdgePt = Math.max(widthPt, heightPt);
  const targetPx = (longEdgePt / 72) * TARGET_DPI * HEADROOM;
  return Math.round(Math.min(FALLBACK_MAX_DIMENSION_PX, Math.max(MIN_DIMENSION_PX, targetPx)));
}

// ---- crop/rotate editor -- direct request: a contributor's phone
// photo rarely matches the manual's own bbox aspect ratio, and the
// only feedback loop before this was the compare view in My
// Reviewables, which shows the mismatch but gives no way to fix it
// without leaving the site. Same drag-box visual language as the
// maintainer portal's compare-wrap/targetBox (review-panel.js), so a
// contributor and a maintainer see one consistent interaction pattern,
// not two different ones for what's conceptually the same action. ----
let originalBitmap = null; // the raw picked file, never resized/rotated -- final crop always renders from this, not the display canvas, so output quality is never capped by whatever size is comfortable to drag
let selectedPhotoIsPng = false;
let rotationDeg = 0; // 0/90/180/270, clockwise
let cropBox = null; // {x0,y0,x1,y1} in the display canvas's own pixel-buffer space
let cropDrag = null;
let cropBufferScale = 1; // ratio of the display canvas's pixel buffer to the full-resolution rotated image

const CROP_DISPLAY_MAX_PX = 520; // interactive dragging stays smooth regardless of the source photo's real megapixel count
const MIN_CROP_PX = 24;

// The box defaults to match the manual's own destination shape, not a
// square or the photo's own aspect -- the whole point is showing the
// contributor what will actually fit, before they submit rather than
// after a maintainer points it out.
function destinationAspectRatio() {
  if (!context?.pixel_bbox) return null;
  const [x0, y0, x1, y1] = context.pixel_bbox;
  const w = x1 - x0, h = y1 - y0;
  return w > 0 && h > 0 ? w / h : null;
}

function renderCropCanvas() {
  const canvas = document.getElementById("cropCanvas");
  const rotated90 = rotationDeg === 90 || rotationDeg === 270;
  const bw = originalBitmap.width, bh = originalBitmap.height;
  const fullW = rotated90 ? bh : bw, fullH = rotated90 ? bw : bh;
  cropBufferScale = Math.min(1, CROP_DISPLAY_MAX_PX / Math.max(fullW, fullH));
  canvas.width = Math.round(fullW * cropBufferScale);
  canvas.height = Math.round(fullH * cropBufferScale);
  const ctx = canvas.getContext("2d");
  const dw = bw * cropBufferScale, dh = bh * cropBufferScale;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.drawImage(originalBitmap, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function resetCropBox() {
  const canvas = document.getElementById("cropCanvas");
  const destAspect = destinationAspectRatio();
  let boxW, boxH;
  if (destAspect) {
    // Largest centered box matching the destination's own shape that
    // still fits inside the (possibly differently-shaped) photo.
    if (canvas.width / canvas.height > destAspect) { boxH = canvas.height; boxW = boxH * destAspect; }
    else { boxW = canvas.width; boxH = boxW / destAspect; }
  } else {
    boxW = canvas.width; boxH = canvas.height; // no known destination shape -- default to the whole photo, uncropped
  }
  const x0 = (canvas.width - boxW) / 2, y0 = (canvas.height - boxH) / 2;
  cropBox = { x0, y0, x1: x0 + boxW, y1: y0 + boxH };
  paintCropBox();
}

function paintCropBox() {
  // cropBox lives in the canvas's own pixel-BUFFER space; the overlay
  // div is positioned in whatever CSS pixels the canvas actually
  // renders at (max-width:100% can shrink it on a narrow phone
  // screen) -- cssScale() below is what bridges the two, here and in
  // every mouse handler that touches cropBox.
  const { sx, sy } = cssScale();
  const box = document.getElementById("cropBox");
  box.style.left = (cropBox.x0 / sx) + "px";
  box.style.top = (cropBox.y0 / sy) + "px";
  box.style.width = ((cropBox.x1 - cropBox.x0) / sx) + "px";
  box.style.height = ((cropBox.y1 - cropBox.y0) / sy) + "px";
}

// Canvas pixel-buffer size vs. its actual on-screen CSS size -- distinct
// from cropBufferScale above (that's original-photo vs. display-canvas;
// this is display-canvas vs. however small a phone screen renders it).
function cssScale() {
  const canvas = document.getElementById("cropCanvas");
  const rect = canvas.getBoundingClientRect();
  return { sx: canvas.width / rect.width, sy: canvas.height / rect.height };
}

function cropPointFromClient(clientX, clientY) {
  const canvas = document.getElementById("cropCanvas");
  const rect = canvas.getBoundingClientRect();
  const { sx, sy } = cssScale();
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}

// Shared by both mouse and touch input -- real report: on a phone, the
// crop box couldn't be dragged at all, because only mouse events were
// ever wired up here. A touch-drag with no touch listeners just looks
// like a page-scroll gesture to the browser, which wins by default.
function startCropDrag(clientX, clientY, targetEl) {
  const handle = targetEl.closest(".handle");
  const p = cropPointFromClient(clientX, clientY);
  cropDrag = { mode: handle ? "resize" : "move", corner: handle?.dataset.corner, startX: p.x, startY: p.y, orig: { ...cropBox } };
}
function moveCropDrag(clientX, clientY) {
  if (!cropDrag) return;
  const canvas = document.getElementById("cropCanvas");
  const p = cropPointFromClient(clientX, clientY);
  const dx = p.x - cropDrag.startX, dy = p.y - cropDrag.startY;
  const o = cropDrag.orig;
  if (cropDrag.mode === "move") {
    const w = o.x1 - o.x0, h = o.y1 - o.y0;
    const x0 = Math.max(0, Math.min(o.x0 + dx, canvas.width - w));
    const y0 = Math.max(0, Math.min(o.y0 + dy, canvas.height - h));
    cropBox = { x0, y0, x1: x0 + w, y1: y0 + h };
  } else {
    let { x0, y0, x1, y1 } = o;
    const c = cropDrag.corner;
    if (c === "nw" || c === "sw") x0 = Math.max(0, Math.min(o.x0 + dx, x1 - MIN_CROP_PX));
    else x1 = Math.min(canvas.width, Math.max(o.x1 + dx, x0 + MIN_CROP_PX));
    if (c === "nw" || c === "ne") y0 = Math.max(0, Math.min(o.y0 + dy, y1 - MIN_CROP_PX));
    else y1 = Math.min(canvas.height, Math.max(o.y1 + dy, y0 + MIN_CROP_PX));
    cropBox = { x0, y0, x1, y1 };
  }
  paintCropBox();
}
function endCropDrag() { cropDrag = null; }

document.getElementById("cropBox").addEventListener("mousedown", (e) => {
  e.preventDefault();
  startCropDrag(e.clientX, e.clientY, e.target);
});
document.addEventListener("mousemove", (e) => moveCropDrag(e.clientX, e.clientY));
document.addEventListener("mouseup", endCropDrag);

// touch-action:none on #cropBox/.handle (see contribute.html) already
// stops the browser's own default touch handling on them, so these can
// stay passive; the document-level touchmove below is the one that
// needs {passive:false} + preventDefault, since without it the page
// would still scroll out from under an active drag once the finger
// moves past the box's own edges.
document.getElementById("cropBox").addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  startCropDrag(t.clientX, t.clientY, e.target);
}, { passive: true });
document.addEventListener("touchmove", (e) => {
  if (!cropDrag) return;
  e.preventDefault();
  const t = e.touches[0];
  moveCropDrag(t.clientX, t.clientY);
}, { passive: false });
document.addEventListener("touchend", endCropDrag);

document.getElementById("rotateLeftBtn").addEventListener("click", () => {
  rotationDeg = (rotationDeg + 270) % 360;
  renderCropCanvas();
  resetCropBox();
});
document.getElementById("rotateRightBtn").addEventListener("click", () => {
  rotationDeg = (rotationDeg + 90) % 360;
  renderCropCanvas();
  resetCropBox();
});
document.getElementById("resetCropBtn").addEventListener("click", resetCropBox);

document.getElementById("useCropBtn").addEventListener("click", () => {
  // Full-resolution rotated render, cropped against THIS, not the
  // display canvas -- see cropBufferScale's own comment above.
  const rotated90 = rotationDeg === 90 || rotationDeg === 270;
  const bw = originalBitmap.width, bh = originalBitmap.height;
  const fullW = rotated90 ? bh : bw, fullH = rotated90 ? bw : bh;
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = fullW; fullCanvas.height = fullH;
  const fctx = fullCanvas.getContext("2d");
  fctx.save();
  fctx.translate(fullW / 2, fullH / 2);
  fctx.rotate((rotationDeg * Math.PI) / 180);
  fctx.drawImage(originalBitmap, -bw / 2, -bh / 2, bw, bh);
  fctx.restore();

  const s = 1 / cropBufferScale;
  const cx0 = cropBox.x0 * s, cy0 = cropBox.y0 * s;
  const cw = Math.round((cropBox.x1 - cropBox.x0) * s), ch = Math.round((cropBox.y1 - cropBox.y0) * s);
  const cropped = document.createElement("canvas");
  cropped.width = cw; cropped.height = ch;
  cropped.getContext("2d").drawImage(fullCanvas, cx0, cy0, cw, ch, 0, 0, cw, ch);

  finalizeSelectedPhoto(cropped);
});

// Shared tail end of photo selection -- resize to the destination's own
// target resolution, strip metadata, show the small thumbnail, and open
// up consent. Runs after crop/rotate is confirmed, operating on the
// ALREADY-cropped canvas, not the raw picked file.
function finalizeSelectedPhoto(sourceCanvas) {
  const MAX_DIMENSION_PX = computeTargetLongEdge(context);
  const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(sourceCanvas.width, sourceCanvas.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceCanvas.width * scale);
  canvas.height = Math.round(sourceCanvas.height * scale);
  canvas.getContext("2d").drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  const outputType = selectedPhotoIsPng ? "image/png" : "image/jpeg";
  // 0.85, not 0.92: Google's own PageSpeed guidance puts 85 as the real
  // diminishing-returns line for JPEG quality -- "with quality larger
  // than 85, the image becomes larger quickly, while the visual
  // improvement is little." Confirmed against a real already-contributed
  // photo (resized to this file's own 2000px cap): 92 -> 643KB, 85 ->
  // 453KB, a real 30% smaller for the same visual result, not a
  // hypothetical saving.
  let outDataUrl = canvas.toDataURL(outputType, 0.85);
  // JPEG only -- confirmed live that canvas.toDataURL() injects a real
  // ICC color profile into JPEG output (PNG output was separately
  // confirmed already clean). See stripJpegAuxSegments' own comment.
  if (outputType === "image/jpeg") {
    outDataUrl = bytesToDataUrl(stripJpegAuxSegments(dataUrlToBytes(outDataUrl)), outputType);
  }
  selectedPhotoDataUrl = outDataUrl;

  document.getElementById("cropEditor").style.display = "none";
  const thumb = document.getElementById("previewThumb");
  thumb.src = selectedPhotoDataUrl;
  thumb.style.display = "block";

  const consentRow = document.getElementById("consentRow");
  // A new photo means fresh consent, never carried over from whatever
  // was picked (and possibly already attested to) before it -- an
  // unticked box on a new file is the safe default, not an inherited
  // yes from a different photo.
  document.getElementById("consentOwnPhoto").checked = false;
  document.getElementById("consentLicense").checked = false;
  consentRow.style.display = "block";
  updateSubmitEnabled();
  log(`${selectedPhotoFilename}: cropped and re-encoded locally to strip EXIF metadata (GPS, camera model, timestamp) before saving -- happens now, not after this reaches a server.`);
}

document.getElementById("photoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const saveBtn = document.getElementById("saveDraftBtn");
  const consentRow = document.getElementById("consentRow");
  if (!file) {
    saveBtn.disabled = true;
    consentRow.style.display = "none";
    document.getElementById("cropEditor").style.display = "none";
    document.getElementById("previewThumb").style.display = "none";
    return;
  }
  selectedPhotoFilename = file.name;
  selectedPhotoIsPng = file.type === "image/png";
  selectedPhotoDataUrl = null;
  rotationDeg = 0;
  originalBitmap = await createImageBitmap(file);

  saveBtn.disabled = true;
  consentRow.style.display = "none";
  document.getElementById("previewThumb").style.display = "none";
  document.getElementById("cropEditor").style.display = "block";
  renderCropCanvas();
  resetCropBox();
  updateSubmitEnabled();
});

// Real consent capture, not just a PR template checkbox nobody's forced
// to fill in truthfully -- see ROADMAP.md's direct-to-git contribution
// audit. Both boxes are required before Save enables, same two
// attestations the PR template already asks for, just actually gating
// the action here instead of living only as decoration.
function updateSubmitEnabled() {
  const hasPhoto = !!selectedPhotoDataUrl;
  const consented = document.getElementById("consentOwnPhoto").checked && document.getElementById("consentLicense").checked;
  document.getElementById("saveDraftBtn").disabled = !(hasPhoto && consented);
}
document.getElementById("consentOwnPhoto").addEventListener("change", updateSubmitEnabled);
document.getElementById("consentLicense").addEventListener("change", updateSubmitEnabled);

// No sign-in gate here at all, by design -- direct correction: saving a
// draft is purely local (localStorage, this browser, this device), so
// there's nothing that actually needs a GitHub identity yet. The two
// consent checkboxes above (ownership, CC-BY license) are the real gate
// on this action; a real GitHub identity only gets attached later, at
// the moment something is actually about to become a real, public
// submission -- see markSubmitted's own sign-in gate below, which is
// the one place this flow ever needs an account.
document.getElementById("saveDraftBtn").addEventListener("click", () => performAction("draft"));

// The only remaining use of the page-level sign-in prompt: "help
// maintain" is a separate, occasional action, not something worth
// building its own inline sign-in flow for the way markSubmitted does
// (see markSubmitted's own comment on why that one just signs in
// inline instead).
document.getElementById("promptSignInBtn").addEventListener("click", async () => {
  if (!(await performSignIn())) return;
  document.getElementById("signInPrompt").style.display = "none";
  updateRecatVisibility();
  if (pendingMaintainRequest) { performMaintainRequest(pendingMaintainRequest.vehicleKey, pendingMaintainRequest.repoUrl); pendingMaintainRequest = null; }
});

function requestToMaintain(vehicleKey, repoUrl) {
  if (!signedIn) {
    pendingMaintainRequest = { vehicleKey, repoUrl };
    document.getElementById("signInPrompt").style.display = "block";
    return;
  }
  performMaintainRequest(vehicleKey, repoUrl);
}

async function performMaintainRequest(vehicleKey, repoUrl) {
  if (hasRequestedMaintain(vehicleKey) || !repoUrl) return;
  log(`Asking to join as a maintainer on ${vehicleKey}...`);
  try {
    const issue = await submitMaintainRequest(repoUrl);
    maintainerRequests.push({
      vehicleKey, repoUrl, requestedBy: currentUsername,
      requestedAt: new Date().toISOString().slice(0, 10), issueUrl: issue.url,
    });
    saveMaintainerRequests();
    log(`Request sent: ${issue.url}`);
  } catch (e) {
    log(`Couldn't send the request: ${e.message}`);
  }
  renderUploads();
}

// Opens a real GitHub issue on the vehicle's own repo, using this
// contributor's own token -- same trust level as any public-repo issue,
// no privileged Worker call needed. The marker (same pattern as
// syncRealSubmissions' Public-path search) is what lets
// my-vehicles.js's renderJoinRequests find these reliably without
// depending on a label existing on every vehicle repo, which would
// require write access this contributor doesn't have yet.
async function submitMaintainRequest(repoUrl) {
  const session = BlaydeAuth.getSession();
  if (!session) throw new Error("Not signed in.");
  const [owner, repo] = ownerRepo(repoUrl);
  const body = [
    `@${currentUsername} would like to help maintain this manual.`,
    ``,
    `Submitted from the Contributor Portal. Accepting this doesn't grant anything on its own -- a current maintainer needs to use the Maintainer Portal's My Vehicles tab to actually invite \`${currentUsername}\`, which is the real step that grants access.`,
    ``,
    `<!-- blaydemaintainerrequest -->`,
  ].join("\n");
  const issue = await githubApi(`/repos/${owner}/${repo}/issues`, session.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `Request to join as a maintainer: @${currentUsername}`, body }),
  });
  return { number: issue.number, url: issue.html_url };
}

// Only ever called with "draft" now -- direct correction: nobody
// submits anywhere from this screen anymore, so there's no mode to
// thread through here at all. Submitting is a separate, later decision
// made from My Reviewables (see markSubmitted), the one place this
// flow ever asks Public vs. Private or needs a GitHub identity.
async function performAction(action) {
  actionInFlight = true;
  document.getElementById("saveDraftBtn").disabled = true;
  try {
    await performActionInner(action);
  } finally {
    actionInFlight = false;
    updateSubmitEnabled();
  }
}

async function performActionInner(action) {
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
    // Not the real signed-in identity -- nobody's necessarily signed in
    // yet at this point, by design. Whichever real GitHub session is
    // live at actual submit time (markSubmitted) is what ends up
    // attributed to the real commit/PR; this field is purely
    // informational display, never read by either submit path.
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

  log(`Saved for review -- nothing submitted yet.`);
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

// Private path: fork + commit only, stops SHORT of opening the PR --
// per direct request, this is what makes it genuinely "operate on your
// own": the photo lands on the contributor's own fork, under their own
// account, and nothing is proposed to anyone until they separately choose
// to open the PR (openPrFromFork, below), whenever they want, or never.
async function submitPhotoPrivate(upload) {
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

  // <edition>/images/<procedure_id>__by_<username>[__altN].ext -- the
  // exact convention registry.js's parsePhotoFilename expects, scoped
  // under the edition this photo was actually shot against (a repo can
  // hold more than one edition, each with its own images/ folder --
  // see scaffold/CONTRIBUTING.md). Alt-numbering only kicks in if this
  // same contributor already has a photo at this exact path (a genuine
  // resubmission), not on any other kind of failure.
  const content = dataUrlToBase64(upload.photoDataUrl);
  let path = `${upload.editionId}/images/${upload.procedureId}__by_${forkOwner}${ext}`;
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
        path = `${upload.editionId}/images/${upload.procedureId}__by_${forkOwner}__alt${altN}${ext}`;
        continue;
      }
      throw e;
    }
  }

  return { forkOwner, branchName, defaultBranch };
}

// The deferred half of the Private path -- opens the PR from a fork+
// branch that submitPhotoPrivate already pushed, whenever the
// contributor actually decides to. Same PR body/title either path ends
// up with, so review-panel.js sees no difference once a PR exists.
async function openPrFromFork(upload) {
  const session = BlaydeAuth.getSession();
  if (!session) throw new Error("Not signed in.");
  const [owner, repo] = ownerRepo(upload.repoUrl);
  const prBody = [
    `Photo for \`${upload.procedureId}\` (${upload.sectionHeading}).`,
    ``,
    `Submitted via the Contributor Portal's Private path. Both required attestations were checked before this was allowed to submit:`,
    `- This is the contributor's own photo, not sourced from elsewhere.`,
    `- Licensed CC-BY 4.0.`,
    ``,
    `---`,
    // Direct instruction: point back to the portal without telling
    // anyone to ignore GitHub's own notifications -- GitHub's PR/review
    // emails always link straight into github.com with no way for an
    // App or repo owner to redirect that (a real platform limit, not a
    // setting we're missing), so this is the one thing we DO control:
    // once someone lands on the PR, offer the easier path, not a
    // demand to stop using the platform they're already on.
    `_Track this anytime from [My Reviewables](https://blaydemanual.com/contribute.html)._`,
  ].join("\n");
  const pr = await githubApi(`/repos/${owner}/${repo}/pulls`, session.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `Add photo: ${upload.sectionHeading}`,
      head: `${upload.forkOwner}:${upload.branchName}`,
      base: upload.defaultBranch,
      body: prBody,
    }),
  });
  return { number: pr.number, url: pr.html_url };
}

// Public path: no fork, no personal copy -- the Worker's own GitHub App
// installation token creates a branch directly on the upstream repo and
// opens the PR immediately. The browser never touches that credential;
// it only sends the contributor's own App user-to-server token (proves a
// real signed-in person is asking, and provides the login for
// attribution), the same shape as indexer-review.js's submitNewVehicleProposal.
async function submitPhotoPublic(upload) {
  const session = BlaydeAuth.getAppSession();
  if (!session) throw new Error(`Sign in for Public submit first.`);
  const resp = await fetch(`${BlaydeAuth.AUTH_WORKER_URL}direct-contribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({
      repo_url: upload.repoUrl,
      // The Worker builds the actual commit path server-side -- this
      // tells it which edition's images/ folder the photo belongs
      // under, same as the fork-based path above now does client-side.
      // Not yet consumed there as of this change; see ROADMAP.md.
      edition_id: upload.editionId,
      procedure_id: upload.procedureId,
      section_heading: upload.sectionHeading,
      photo_data_url: upload.photoDataUrl,
      photo_filename: upload.photoFilename,
    }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok || result.error) throw new Error(result.error || `Submit failed (${resp.status}).`);
  return { prUrl: result.prUrl, prNumber: result.prNumber };
}

// A saved draft carries no memory of which radio was checked when it
// was saved -- Public/Private is only ever read at the moment of an
// actual submit, never at save time (see performActionInner's "draft"
// branch, which never even looks at `mode`). So submitting a draft from
// this list has to ask again, right here, rather than silently
// defaulting to one -- direct correction, live: a submit is the one
// moment something stops being private, and that deserves a real,
// conscious choice each time, not a default picked once and forgotten.
async function markSubmitted(uploadId) {
  const upload = uploads.find((u) => u.id === uploadId);
  if (!upload || upload.status !== "draft") return;
  // Real bug, caught live: two identical PRs opened for the same photo
  // from what should have been one click. See submittingIds' own
  // comment above for why this is keyed by id.
  if (submittingIds.has(uploadId)) return;

  // The one and only sign-in gate in this whole flow -- saving a draft
  // never needs an account, so this is the first moment identity
  // actually matters. Inline, not the deferred prompt-div pattern
  // "help maintain" uses below (requestToMaintain) -- this function is
  // itself already a click handler, so a popup opened here still counts
  // as user-gesture-triggered, same as the inline App sign-in a few
  // lines down for the Public path. No reason to make someone click
  // twice (once to reveal a prompt, again to actually sign in) when
  // once already works.
  if (!signedIn) {
    log(`Signing in to submit...`);
    if (!(await performSignIn())) return;
  }

  const goPublic = await blaydeConfirm(
    `Submit "${upload.sectionHeading || upload.procedureId}" as Public (opens a real pull request immediately, no personal copy kept) or Private (pushes to your own fork first -- nothing is proposed until you open the pull request yourself, whenever you're ready)?`,
    { okLabel: "Public", cancelLabel: "Private" }
  );
  submittingIds.add(uploadId);
  document.querySelectorAll(`[data-submit="${uploadId}"]`).forEach((btn) => { btn.disabled = true; });
  try {
    if (goPublic) {
      if (!BlaydeAuth.getAppSession()) {
        log(`Signing in for Public submit...`);
        try {
          await BlaydeAuth.signInWithGitHubApp();
        } catch (err) {
          log(`Sign-in failed: ${err.message}`);
          return;
        }
      }
      log(`Submitting publicly on ${upload.repoUrl} (opens the pull request immediately)...`);
      try {
        const pr = await submitPhotoPublic(upload);
        upload.status = "submitted";
        upload.prUrl = pr.prUrl;
        upload.prNumber = pr.prNumber;
        saveUploads();
        renderUploads();
        log(`Submitted -- pull request opened: ${pr.prUrl}`);
        // A completed submission is a real milestone -- a scrolling log
        // line among dozens of others doesn't read as one. Also collapses
        // the compare viewer if it's still open for this exact upload;
        // it's done its job once the submission is in.
        showToast("Submitted! Your photo is now a real pull request.");
        if (compareUpload?.id === uploadId) {
          document.getElementById("compareArea").style.display = "none";
        }
      } catch (err) {
        log(`Submit failed: ${err.message}`);
      }
    } else {
      log(`Pushing privately to your own copy of ${upload.repoUrl}...`);
      try {
        const forked = await submitPhotoPrivate(upload);
        upload.status = "forked";
        upload.forkOwner = forked.forkOwner;
        upload.branchName = forked.branchName;
        upload.defaultBranch = forked.defaultBranch;
        saveUploads();
        renderUploads();
        log(`Pushed to your own fork -- nothing proposed yet. Open the pull request from My Reviewables whenever you're ready.`);
        showToast("Pushed privately. Open the pull request whenever you're ready.");
      } catch (err) {
        log(`Push failed: ${err.message}`);
      }
    }
  } finally {
    submittingIds.delete(uploadId);
    document.querySelectorAll(`[data-submit="${uploadId}"]`).forEach((btn) => { btn.disabled = false; });
  }
}

// The deferred half of a Private submission -- pushes were already made
// to the contributor's own fork at submit time; this is the separate,
// explicit action that actually proposes it to reviewers, whenever the
// contributor decides they're ready (or never, if they'd rather not).
async function openPrForUpload(uploadId) {
  const upload = uploads.find((u) => u.id === uploadId);
  if (!upload || upload.status !== "forked") return;
  log(`Opening a pull request on ${upload.repoUrl}...`);
  try {
    const pr = await openPrFromFork(upload);
    upload.status = "submitted";
    upload.prNumber = pr.number;
    upload.prUrl = pr.url;
    saveUploads();
    renderUploads();
    log(`Submitted -- pull request #${pr.number} opened: ${pr.url}`);
  } catch (err) {
    log(`Opening the pull request failed: ${err.message}`);
  }
}

// A local record's status is only ever set once, at submit/push time,
// and nothing else in this file ever touches it again -- so it stays
// frozen at "submitted" even after the real PR is merged or closed on
// GitHub. GitHub is the one real source of truth for what happens to a
// PR after that, so once a local record has a real PR attached
// (prNumber + repoUrl), defer to whatever syncRealSubmissions() most
// recently learned from the API instead of trusting the stale local
// guess. Returns null while there's nothing to defer to yet (no PR, or
// the API hasn't been checked/found this one) -- the local status
// stands unchanged in that case.
function outcomeFor(upload) {
  if (upload.prNumber == null || !upload.repoUrl) return null;
  const remote = remoteUploads.find((r) => r.prNumber === upload.prNumber && r.repoUrl === upload.repoUrl);
  if (!remote || remote.status === upload.status) return null;
  return { status: remote.status, note: null };
}

// ---- real GitHub sync for "My Reviewables" -- finds every open OR
// closed PR the signed-in user has actually submitted across
// BlaydeManual's public vehicle repos, regardless of which device
// submitted it. Two GitHub Search API queries, since a photo PR's real
// author differs by path:
//  - Private (fork-based): the contributor's own account opens the PR
//    directly, so `author:<login>` finds it.
//  - Public (direct-contribute): the GitHub App's bot identity opens
//    the PR, never the contributor -- but handleDirectContribute's own
//    PR body always includes the literal phrase "Submitted by
//    @<login>", which IS full-text searchable.
// Both are real, cheap Search API calls (no per-repo enumeration
// needed) against public repos, so this works with the contributor's
// own basic OAuth token -- no App/installation credential required.
async function syncRealSubmissions() {
  if (!signedIn || !currentUsername) return;
  const token = BlaydeAuth.getSession()?.token;
  if (!token) return;
  try {
    const [privateResults, publicResults] = await Promise.all([
      githubApi(`/search/issues?q=${encodeURIComponent(`type:pr org:BlaydeManual author:${currentUsername}`)}`, token),
      // A quoted phrase search here used to include the apostrophe in
      // "Portal's Public path" -- confirmed directly against the real
      // API that GitHub's search silently returns zero matches for a
      // quoted phrase containing that apostrophe, even when the exact
      // substring exists verbatim in real PR bodies. handleDirectContribute
      // now stamps a punctuation-free marker word into every Public-path
      // PR body specifically so this query never has to survive a
      // phrase-search quirk (or a future copy-editing pass) again --
      // two required plain terms, no quotes, no punctuation.
      githubApi(`/search/issues?q=${encodeURIComponent(`type:pr org:BlaydeManual blaydepublicsubmission ${currentUsername} in:body`)}`, token),
    ]);
    const found = [
      ...(privateResults.items || []).map((pr) => ({ pr, isPrivate: true })),
      ...(publicResults.items || []).map((pr) => ({ pr, isPrivate: false })),
    ];
    const built = await Promise.all(found.map(({ pr, isPrivate }) => buildRemoteUpload(pr, isPrivate)));
    remoteUploads = built.filter(Boolean);
  } catch (e) {
    log(`Couldn't check GitHub for your existing submissions: ${e.message}`);
  }
  renderUploads();
}

// repository_url looks like https://api.github.com/repos/OWNER/REPO.
async function buildRemoteUpload(pr, isPrivate) {
  try {
    const token = BlaydeAuth.getSession()?.token;
    const m = /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)$/.exec(pr.repository_url);
    if (!m) return null;
    const [, owner, repo] = m;
    const repoUrlReal = `https://github.com/${owner}/${repo}`;
    const files = await githubApi(`/repos/${owner}/${repo}/pulls/${pr.number}/files`, token);
    const photoFile = files.find((f) => f.status === "added" && /^[^/]+\/images\//.test(f.filename));
    if (!photoFile) return null; // not a photo PR (or the photo path doesn't match the known convention) -- skip rather than show a broken row
    const pathMatch = /^([^/]+)\/images\/(.+)$/.exec(photoFile.filename);
    const editionId = pathMatch[1];
    const { procedureId } = parsePhotoFilename(pathMatch[2]);

    let page = null, sectionHeading = procedureId;
    try {
      const { manifest } = await fetchManifest(repoUrlReal, editionId);
      const entry = (manifest.entries || []).find((e) => e.procedure_id === procedureId);
      if (entry) { page = entry.page; sectionHeading = entry.section_heading || procedureId; }
    } catch (e) { /* manifest unreachable -- still show the row with just the procedure id */ }

    // pr.pull_request.merged_at only appears on a PR that's actually
    // merged, distinct from a real state:closed rejection -- reuses the
    // exact status vocabulary (and CSS) local uploads already have,
    // rather than inventing a fourth state just for remote ones.
    const status = pr.state === "open" ? "submitted" : pr.pull_request?.merged_at ? "accepted" : "rejected";

    return {
      id: `remote:${owner}/${repo}#${pr.number}`,
      remote: true,
      status,
      repoUrl: repoUrlReal,
      vehicleSlug: repo,
      editionId,
      page,
      procedureId,
      sectionHeading,
      // A plain https URL works fine as an <img src> -- doesn't need to
      // be a data: URI the way a locally-held draft's photo does.
      photoDataUrl: photoFile.raw_url,
      prNumber: pr.number,
      prUrl: pr.html_url,
      forkOwner: isPrivate ? currentUsername : undefined,
    };
  } catch (e) {
    return null; // one bad PR shouldn't hide every other real submission
  }
}

// ---- My uploads -- grouped by vehicle (collapsible, since this list
// grows across every procedure/vehicle someone's ever contributed to,
// not just the one the QR pointed at this time), sorted by page within
// each group so it reads in manual order, not submission order. ----
// Which of the three visibility buckets an upload belongs in. Derived,
// not stored -- forkOwner is only ever set by the Private path
// (submitPhotoPrivate), and stays set once a Private draft's PR is
// later opened (openPrForUpload never clears it), so its presence
// alone distinguishes "submitted via Private" from "submitted via
// Public" without needing a new field.
function visibilityBucketFor(u) {
  if (u.status === "draft") return "draft";
  if (u.forkOwner) return "private";
  return "public";
}

// Builds the existing vehicle -> edition -> row tree for one visibility
// bucket's uploads, appending it into `container`. Extracted out of
// renderUploads so the same tree structure can render three times (one
// per colored section) instead of once -- direct request: pull public
// and private submissions into a list, not lump every status together
// undifferentiated the way this used to.
// categoryByVehicleKey: Map from the same key renderUploadGroup groups
// vehicles by (u.vehicleSlug || u.repoUrl) to its registry category id
// (or null) -- prefetched once per renderUploads() call, not looked up
// per-row, since it's the same handful of registry lookups review-
// panel.js/my-vehicles.js already do for their own category tier.
function renderUploadGroup(uploadList, container, maintainRowShown, categoryByVehicleKey) {
  const byCategory = new Map();
  uploadList.forEach((u) => {
    const vehicleKey = u.vehicleSlug || u.repoUrl;
    const key = categoryByVehicleKey.get(vehicleKey) || null;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(u);
  });
  const orderedCategoryKeys = [...CATEGORY_ORDER.filter((c) => byCategory.has(c)), ...(byCategory.has(null) ? [null] : [])];
  // Always shown, even with just one category -- see review-panel.js's
  // matching comment: the color/icon system should flow through
  // consistently, not pop in only once someone crosses a second
  // category.
  const showCategoryHeadings = orderedCategoryKeys.length > 0;

  orderedCategoryKeys.forEach((categoryKey) => {
    const categoryUploads = byCategory.get(categoryKey);
    let categoryContainer = container;
    if (showCategoryHeadings) {
      const categoryGroup = document.createElement("details");
      categoryGroup.open = true;
      categoryGroup.className = "category-group";
      if (categoryKey) categoryGroup.style.setProperty("--accent", CATEGORY_STYLE[categoryKey].accent);
      const label = categoryKey ? categoryKey[0].toUpperCase() + categoryKey.slice(1) : "Uncategorized";
      const icon = categoryKey ? categoryIconSvg(categoryKey) : "";
      const heading = document.createElement("summary");
      heading.className = "category-bar";
      heading.innerHTML = `${icon}${label} (${categoryUploads.length})`;
      categoryGroup.appendChild(heading);
      container.appendChild(categoryGroup);
      categoryContainer = categoryGroup;
    }

    const byVehicle = new Map();
    categoryUploads.forEach((u) => {
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
    summary.textContent = `${vehicleKey} : Total Uploads = ${group.length}`;
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
        // The badge's CSS class stays the real internal status value
        // (.draft/.forked/.submitted etc. -- see contribute.html), but
        // "draft" reads as unfinished/lesser to a contributor, when it's
        // really just "saved, ready whenever you are" -- the visible
        // text says that instead, without needing to rename the
        // internal status value everywhere it's checked elsewhere.
        const statusLabel = { draft: "Reviewable" }[displayStatus] || displayStatus;
        const pageLabel = u.page != null ? `PG. ${u.page} &mdash; ` : "";
        const row = document.createElement("div");
        row.className = "upload-row";
        row.innerHTML = `
          <div class="upload-left">
            <img class="upload-thumb" src="${u.photoDataUrl}" alt="">
            <div>
              <div class="upload-title">${pageLabel}${u.sectionHeading}<span class="upload-status ${displayStatus}">${statusLabel}</span></div>
              <div class="upload-meta">${u.procedureId}${u.prNumber != null ? ` &middot; ${u.prUrl ? `<a href="${u.prUrl}" target="_blank" rel="noopener" class="pr-link">Request #${u.prNumber}</a>` : `Request #${u.prNumber}`}` : ""}</div>
              ${outcome && outcome.note ? `<div class="upload-note">&ldquo;${outcome.note}&rdquo; &mdash; maintainer note</div>` : ""}
              ${displayStatus === "submitted" && u.prNumber != null ? `<div class="sub review-status-line" id="reviewstatus-${u.id}" style="margin-top:4px;">${reviewStatusText(reviewStatusCache.get(`${u.repoUrl}#${u.prNumber}`))}</div>` : ""}
            </div>
          </div>
          <div class="upload-actions">
            ${u.remote ? (
              // This is the gitless front-end -- a contributor
              // shouldn't need a GitHub-branded button at all now that
              // the review-status line above gives the same real
              // approval/changes-requested/checks feedback a maintainer
              // sees in the Maintainer Portal. "Request #N" above (a
              // plain small link, not a button) already covers the rare
              // case someone actually wants the raw diff or comments.
              ``
            ) : `
            <button class="secondary" data-view="${u.id}">View</button>
            ${u.status === "draft" ? `<button data-submit="${u.id}">Submit</button>` : ""}
            ${u.status === "draft" ? `<button class="secondary" data-delete="${u.id}">Delete</button>` : ""}
            ${u.status === "forked" ? `<button data-openpr="${u.id}">Submit for review</button>` : ""}
            ${u.status !== "draft" && u.status !== "forked" ? (
              hasRequestedRemoval(u.id)
                ? `<span class="sub" style="margin:0 0 0 6px; color:var(--mint);">Removal requested</span>`
                : `<button class="secondary" data-remove="${u.id}">Request removal</button>`
            ) : ""}
            `}
          </div>
        `;
        details.appendChild(row);
      });
    });

    // A vehicle can appear in more than one visibility section (a
    // public photo and a private draft for the same vehicle, say) --
    // the maintain-request offer only needs to show once per vehicle
    // overall, not once per section it happens to appear in.
    if (!maintainRowShown.has(vehicleKey)) {
      maintainRowShown.add(vehicleKey);
      const maintainRow = document.createElement("div");
      maintainRow.className = "maintain-request-row";
      // Opens a real GitHub issue on the vehicle's own repo
      // (submitMaintainRequest, this contributor's own token), which the
      // Maintainer Portal's My Vehicles tab reads directly and can act
      // on with a real Invite/Decline (see my-vehicles.js's
      // renderJoinRequests).
      const localRecord = hasRequestedMaintain(vehicleKey);
      maintainRow.innerHTML = localRecord
        ? `<span class="sub" style="margin:0; color:var(--mint);">Request sent${localRecord.issueUrl ? ` -- <a href="${localRecord.issueUrl}" target="_blank" rel="noopener" class="pr-link">view it</a>` : ""}. The current maintainers will see it in the Maintainer Portal.</span>`
        : `<button class="secondary" data-maintain="${vehicleKey}" data-repo="${group[0]?.repoUrl || ""}">Ask to join as a maintainer</button>`;
      details.appendChild(maintainRow);
    }

    categoryContainer.appendChild(details);
    });
  });
}

async function renderUploads() {
  const section = document.getElementById("uploadsSection");
  const list = document.getElementById("uploadsList");
  const empty = document.getElementById("uploadsEmpty");
  // openCompare() below reparents the one shared #compareArea node to
  // sit right after whichever row's View was clicked -- a descendant of
  // `list` (inside that row's own <details> group), not a direct child
  // of it, so a plain parentElement === list check misses it. Real bug,
  // caught live: rebuilding `list` via innerHTML="" on any later render
  // (saving a second draft, deleting one, anything) then deletes
  // #compareArea along with it -- not just hides it, actually removes it
  // from the document -- so every View click afterward silently no-ops
  // forever (openCompare's getElementById returns null, throws before
  // ever showing anything). Moving it back out to its original parent
  // before the rebuild keeps it alive across renders; openCompare
  // re-parents it again next time it's actually needed.
  const compareAreaEl = document.getElementById("compareArea");
  if (compareAreaEl && list.contains(compareAreaEl)) section.insertBefore(compareAreaEl, list.nextSibling);
  // Arriving via a QR code, browsing past uploads never required
  // signing in again (see the top-of-file comment) -- but arriving via
  // the landing page's sign-in gate and seeing "My uploads" appear
  // BEFORE actually signing in reads as broken, since the gate just
  // told you sign-in was required to get here. Once signed in, both
  // paths behave the same.
  // Remote entries are dropped if a local record already covers the
  // exact same PR (same repo + number) -- this device already knows
  // about it in full, no need to show a second, thinner row for it.
  const allUploads = [
    ...uploads,
    ...remoteUploads.filter((r) => !uploads.some((u) => u.prNumber === r.prNumber && u.repoUrl === r.repoUrl)),
  ];

  const canShow = signedIn || (hasProcedureContext && uploads.length > 0);
  section.style.display = canShow ? "block" : "none";
  empty.style.display = allUploads.length ? "none" : "block";
  list.innerHTML = "";

  const byBucket = { public: [], private: [], draft: [] };
  allUploads.forEach((u) => byBucket[visibilityBucketFor(u)].push(u));

  // Category as a grouping tier, never a filter -- same reasoning as
  // review-panel.js/my-vehicles.js's categoryForRepo: a contributor
  // covering a vehicle in Garage and an appliance in Home needs both
  // in one scroll. Looked up by vehicleSlug (falling back to repoUrl,
  // matching renderUploadGroup's own grouping key) since a draft
  // upload may not have a repoUrl yet.
  const registryData = await loadRegistry(CANONICAL_REGISTRY_URL).catch(() => ({ vehicles: [] }));
  const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
  const categoryByVehicleKey = new Map();
  allUploads.forEach((u) => {
    const key = u.vehicleSlug || u.repoUrl;
    if (categoryByVehicleKey.has(key)) return;
    const entry = (registryData.vehicles || []).find(
      (v) => v.vehicle_slug === u.vehicleSlug || (u.repoUrl && norm(v.repo_url) === norm(u.repoUrl))
    );
    categoryByVehicleKey.set(key, entry?.category || null);
  });

  // Local, not module-level -- renderUploads() runs once at load time
  // (see the bottom of this file) before a top-level const declared
  // later in the file would be initialized, so this has to be created
  // fresh on every call rather than hoisted-and-shared.
  const visibilitySections = [
    { key: "public", cls: "is-public", icon: "🌍", title: "Public", desc: "Public-facing submission requests. Status shown below for each one. No personal copy kept." },
    { key: "private", cls: "is-private", icon: "🔒", title: "Private", desc: "Saved to your own personal copy. Nothing proposed to reviewers until you choose to submit it." },
    { key: "draft", cls: "is-draft", icon: "📝", title: "Drafts", desc: "Only ever lived on this device. Not submitted anywhere yet." },
  ];

  const maintainRowShown = new Set();
  visibilitySections.forEach(({ key, cls, icon, title, desc }) => {
    const bucketUploads = byBucket[key];
    if (!bucketUploads.length) return;
    const wrap = document.createElement("div");
    wrap.className = `visibility-section ${cls}`;
    wrap.innerHTML = `
      <div class="visibility-section-title">${icon} ${title} <span class="sub" style="margin:0; font-weight:400;">(${bucketUploads.length})</span></div>
      <p class="visibility-section-desc">${desc}</p>
    `;
    renderUploadGroup(bucketUploads, wrap, maintainRowShown, categoryByVehicleKey);
    list.appendChild(wrap);
  });

  list.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => openCompare(btn.dataset.view, btn));
  });
  list.querySelectorAll("[data-maintain]").forEach((btn) => {
    btn.addEventListener("click", () => requestToMaintain(btn.dataset.maintain, btn.dataset.repo));
  });
  list.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => requestRemoval(btn.dataset.remove));
  });
  list.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteDraftUpload(btn.dataset.delete));
  });
  list.querySelectorAll("[data-submit]").forEach((btn) => {
    btn.addEventListener("click", () => markSubmitted(btn.dataset.submit));
  });
  list.querySelectorAll("[data-openpr]").forEach((btn) => {
    btn.addEventListener("click", () => openPrForUpload(btn.dataset.openpr));
  });
  loadReviewStatusLines(allUploads);
}

// Fire-and-forget, one fetch per still-open PR actually shown this
// render, skipping anything already cached from a prior render -- a
// row whose real state has since changed (a new review came in) still
// only refreshes on the next full renderUploads() call, same staleness
// window syncRealSubmissions() already accepts elsewhere on this page.
function loadReviewStatusLines(allUploads) {
  allUploads
    .filter((u) => {
      const outcome = outcomeFor(u);
      const displayStatus = outcome ? outcome.status : u.status;
      return displayStatus === "submitted" && u.prNumber != null && !reviewStatusCache.has(`${u.repoUrl}#${u.prNumber}`);
    })
    .forEach((u) => {
      const key = `${u.repoUrl}#${u.prNumber}`;
      fetchPrReviewStatus(u.repoUrl, u.prNumber).then((status) => {
        reviewStatusCache.set(key, status);
        const el = document.getElementById(`reviewstatus-${u.id}`);
        if (el) el.innerHTML = reviewStatusText(status);
      });
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

function openCompare(uploadId, triggerBtn) {
  compareUpload = uploads.find((u) => u.id === uploadId);
  if (!compareUpload) return;
  lastRenderedPageCanvas = null;
  const compareArea = document.getElementById("compareArea");
  // The panel is one shared DOM node (its own file picker, canvas cache,
  // etc. -- one instance is enough since only one upload is ever being
  // viewed at a time), reparented next to whichever row triggered it
  // instead of staying wherever it last was in markup order. Fixes it
  // always appearing after every vehicle group and "request to
  // maintain" row, at the bottom of the whole list, no matter which
  // upload -- possibly the very first one -- was actually clicked.
  const row = triggerBtn ? triggerBtn.closest(".upload-row") : null;
  if (row) row.insertAdjacentElement("afterend", compareArea);
  compareArea.style.display = "block";
  document.getElementById("compareTitle").textContent = compareUpload.sectionHeading;
  document.getElementById("compareGrid").style.display = "none";
  document.getElementById("compareToggleRow").style.display = "none";
  document.getElementById("wholePageArea").style.display = "none";
  document.getElementById("comparePhoto").src = compareUpload.photoDataUrl;
  compareArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.getElementById("comparePdfPicker").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !compareUpload || !compareUpload.pixelBbox) {
    log(!compareUpload?.pixelBbox ? "No page geometry known for this upload -- can't render a crop to compare against." : "");
    return;
  }
  const buf = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  // Shared with every other viewer that does this same local-context
  // render -- see registry.js's resolvePageForLocalPdf for why.
  const { targetPage, isPatchedOutput } = await resolvePageForLocalPdf(pdfDoc, compareUpload.page);
  if (isPatchedOutput) {
    log("This looks like an already-patched Blayde Manual, not the original scan -- adjusting for its extra cover page.");
  }
  const page = await pdfDoc.getPage(targetPage);
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

// ---- Propose a recategorization -- ROADMAP.md's "Other, and how
// something gets out of it" design: "Anyone (not just that item's own
// maintainer) can file a recategorization from the Contributor side,
// same 'requesting is always Contributor, reviewing is always
// Maintainer' rule as everything else on this site." The Worker-side
// merge-gate for this (handleAcceptRecategorization, auth-worker's
// POST /accept-recategorization) already existed; this is the missing
// other half -- actually generating one of these PRs, rather than only
// being able to gate a PR someone opened by hand. ----

let recatManualTypesData = null;
let recatRegistryEntries = []; // real approved registry.json rows, populated once
let recatSelectedEntry = null;

function recatLog(msg) {
  const el = document.getElementById("recatLog");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

function recatCategoryLabel(id) {
  return id[0].toUpperCase() + id.slice(1);
}

// A flat <select> with one <option> per approved registry entry
// doesn't scale to a large registry -- slow to render, unusable to
// scroll on mobile, no way to find one entry among many without
// already knowing its exact position in an unsorted list. Category
// (already a hard filter, cheap since manual-types.json's category
// list is small and fixed) plus a live text search over just the
// filtered subset -- same matchesSearch-by-name shape registry-
// browse.js already uses -- keeps what's actually rendered small
// regardless of how big the registry gets. RECAT_ENTRY_RENDER_CAP is a
// second, independent backstop: even an unfiltered "All categories"
// view never dumps the whole registry into the DOM at once.
const RECAT_ENTRY_RENDER_CAP = 100;

async function populateRecatEntrySelect() {
  const registryData = await loadRegistry(CANONICAL_REGISTRY_URL).catch(() => ({ vehicles: [] }));
  recatRegistryEntries = (registryData.vehicles || []).filter((v) => v.status === "approved");
  populateRecatFilterCategoryOptions();
  renderRecatEntryOptions();
}

function populateRecatFilterCategoryOptions() {
  const select = document.getElementById("recatFilterCategory");
  select.innerHTML = '<option value="">All categories</option>';
  (recatManualTypesData?.categories || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    select.appendChild(opt);
  });
}

function recatEntryMatchesSearch(entry, q) {
  if (!q) return true;
  const hay = `${entry.vehicle_display_name || ""} ${entry.vehicle_slug || ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderRecatEntryOptions() {
  const select = document.getElementById("recatEntrySelect");
  const hint = document.getElementById("recatEntryHint");
  const categoryFilter = document.getElementById("recatFilterCategory").value;
  const query = document.getElementById("recatSearchInput").value.trim();

  const matches = [];
  recatRegistryEntries.forEach((entry, i) => {
    if (categoryFilter && entry.category !== categoryFilter) return;
    if (!recatEntryMatchesSearch(entry, query)) return;
    matches.push({ entry, originalIndex: i });
  });

  select.innerHTML = '<option value="" disabled selected>Choose one&hellip;</option>';
  matches.slice(0, RECAT_ENTRY_RENDER_CAP).forEach(({ entry, originalIndex }) => {
    const opt = document.createElement("option");
    opt.value = originalIndex;
    const current = entry.category ? `${recatCategoryLabel(entry.category)} / ${entry.manual_type || "(no type)"}` : "uncategorized";
    opt.textContent = `${entry.vehicle_display_name || entry.vehicle_slug} (${entry.edition_id}) -- currently ${current}`;
    select.appendChild(opt);
  });

  if (!matches.length) {
    hint.textContent = query || categoryFilter ? "No matches. Try a different search or category." : "";
  } else if (matches.length > RECAT_ENTRY_RENDER_CAP) {
    hint.textContent = `Showing the first ${RECAT_ENTRY_RENDER_CAP} of ${matches.length} matches -- search or pick a category to narrow this down.`;
  } else {
    hint.textContent = "";
  }
}

document.getElementById("recatFilterCategory").addEventListener("change", renderRecatEntryOptions);
document.getElementById("recatSearchInput").addEventListener("input", renderRecatEntryOptions);

function populateRecatCategoryOptions() {
  const select = document.getElementById("recatCategorySelect");
  select.innerHTML = '<option value="" disabled selected>Choose one&hellip;</option>';
  (recatManualTypesData?.categories || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    select.appendChild(opt);
  });
}

function recatPopulateManualTypeOptions(categoryId, selectedTypeId) {
  const select = document.getElementById("recatManualTypeSelect");
  const category = recatManualTypesData?.categories.find((c) => c.id === categoryId);
  if (!category) {
    select.innerHTML = '<option value="" disabled selected>Choose a category first&hellip;</option>';
    select.disabled = true;
    return;
  }
  select.innerHTML = '<option value="" disabled selected>Choose one&hellip;</option>';
  category.types.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    select.appendChild(opt);
  });
  select.disabled = false;
  if (selectedTypeId && category.types.some((t) => t.id === selectedTypeId)) select.value = selectedTypeId;
}

// Submit only makes sense once the proposal actually differs from the
// entry's current category/manual_type -- same "nothing to approve"
// check the Worker-side gate itself makes, checked here too so a
// contributor sees why Submit is disabled instead of finding out only
// after a failed PR.
function updateRecatSubmitState() {
  const categorySel = document.getElementById("recatCategorySelect");
  const typeSel = document.getElementById("recatManualTypeSelect");
  const btn = document.getElementById("recatSubmitBtn");
  const category = categorySel.value, manualType = typeSel.value;
  const changed = recatSelectedEntry && (category !== (recatSelectedEntry.category || "") || manualType !== (recatSelectedEntry.manual_type || ""));
  btn.disabled = !(recatSelectedEntry && category && manualType && changed);
}

document.getElementById("recatEntrySelect").addEventListener("change", (e) => {
  recatSelectedEntry = recatRegistryEntries[parseInt(e.target.value, 10)];
  const info = document.getElementById("recatCurrentInfo");
  info.style.display = "block";
  info.textContent = recatSelectedEntry.category
    ? `Currently: ${recatCategoryLabel(recatSelectedEntry.category)} / ${recatSelectedEntry.manual_type || "(no type)"}`
    : "Currently: uncategorized";
  const categorySel = document.getElementById("recatCategorySelect");
  categorySel.disabled = false;
  categorySel.value = recatSelectedEntry.category || "";
  recatPopulateManualTypeOptions(recatSelectedEntry.category, recatSelectedEntry.manual_type);
  updateRecatSubmitState();
});

document.getElementById("recatCategorySelect").addEventListener("change", (e) => {
  recatPopulateManualTypeOptions(e.target.value);
  updateRecatSubmitState();
});

document.getElementById("recatManualTypeSelect").addEventListener("change", updateRecatSubmitState);

// Same fork -> branch -> commit -> PR sequence submitPhotoPrivate
// already uses for a vehicle repo (verified against GitHub's REST API
// docs when that was built -- POST .../forks is async, a cross-repo
// PR's head must be "username:branch"), aimed at BlaydeManual/registry
// instead. The one real difference: EDITING registry.json's existing
// content (fetch current file + sha, change only this one entry's
// category/manual_type, write back with the same sha) rather than
// ADDING a new file -- matching exactly what the Worker-side merge-gate
// (handleAcceptRecategorization) validates: one file, modified, one
// entry, only those two fields differing.
async function submitRecategorizationProposal(entry, newCategory, newManualType) {
  const session = BlaydeAuth.getSession();
  if (!session) throw new Error("Not signed in.");
  const owner = "BlaydeManual", repo = "registry";

  let defaultBranch = null, upstreamSha = null;
  for (const branch of ["main", "master"]) {
    try {
      const ref = await githubApi(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, session.token);
      defaultBranch = branch; upstreamSha = ref.object.sha; break;
    } catch (e) { /* try next */ }
  }
  if (!defaultBranch) throw new Error(`Could not find a main or master branch on ${owner}/${repo}.`);

  // POST is safe even if a fork already exists from a previous
  // proposal -- GitHub just returns the existing one.
  await githubApi(`/repos/${owner}/${repo}/forks`, session.token, { method: "POST" });
  const forkOwner = session.username;
  const forkRef = await waitForForkRef(forkOwner, repo, defaultBranch, session.token);

  const branchName = `recategorize/${entry.vehicle_slug}-${entry.edition_id}-${Date.now()}`;
  await githubApi(`/repos/${forkOwner}/${repo}/git/refs`, session.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: forkRef.object.sha }),
  });

  const registryFile = await githubApi(`/repos/${forkOwner}/${repo}/contents/registry.json?ref=${branchName}`, session.token);
  const registryData = JSON.parse(base64ToUtf8(registryFile.content));
  const target = (registryData.vehicles || []).find(
    (v) => v.vehicle_slug === entry.vehicle_slug && v.edition_id === entry.edition_id
  );
  if (!target) throw new Error("Couldn't find that entry in the registry -- it may have changed since this page loaded. Try reloading and proposing again.");
  const oldCategory = target.category, oldManualType = target.manual_type;
  target.category = newCategory;
  target.manual_type = newManualType;

  await githubApi(`/repos/${forkOwner}/${repo}/contents/registry.json`, session.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Recategorize ${entry.vehicle_slug} (${entry.edition_id})`,
      content: utf8ToBase64(JSON.stringify(registryData, null, 2) + "\n"),
      sha: registryFile.sha,
      branch: branchName,
    }),
  });

  const prBody = [
    `Proposes changing \`${entry.vehicle_slug}\` (${entry.edition_id})'s category/manual_type:`,
    ``,
    `- category: \`${oldCategory || "(none)"}\` -> \`${newCategory}\``,
    `- manual_type: \`${oldManualType || "(none)"}\` -> \`${newManualType}\``,
    ``,
    `Submitted via the Contributor Portal's "Propose a recategorization" action. Only this one entry's category/manual_type changed -- nothing else in registry.json was touched.`,
    ``,
    `---`,
    `_Track this anytime from the [Contributor Portal](https://blaydemanual.com/contribute.html)._`,
  ].join("\n");
  const pr = await githubApi(`/repos/${owner}/${repo}/pulls`, session.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `Recategorize ${entry.vehicle_slug} (${entry.edition_id}) to ${newCategory}/${newManualType}`,
      head: `${forkOwner}:${branchName}`,
      base: defaultBranch,
      body: prBody,
    }),
  });
  return { number: pr.number, url: pr.html_url };
}

document.getElementById("recatSubmitBtn").addEventListener("click", async () => {
  if (!BlaydeAuth.getSession()) {
    recatLog("Signing in...");
    if (!(await performSignIn())) return;
  }
  const category = document.getElementById("recatCategorySelect").value;
  const manualType = document.getElementById("recatManualTypeSelect").value;
  const btn = document.getElementById("recatSubmitBtn");
  btn.disabled = true;
  recatLog(`Proposing ${recatSelectedEntry.vehicle_slug} (${recatSelectedEntry.edition_id}) -> ${category}/${manualType}...`);
  try {
    const { url } = await submitRecategorizationProposal(recatSelectedEntry, category, manualType);
    recatLog(`Opened: ${url}`);
    recatLog(`An org-level maintainer will review and merge it -- the same bar as approving a new manual.`);
  } catch (e) {
    recatLog(`Couldn't open the proposal: ${e.message}`);
  }
  updateRecatSubmitState();
});

(async () => {
  recatManualTypesData = await loadRegistry(MANUAL_TYPES_URL).catch((e) => {
    recatLog(`Couldn't load manual-types.json: ${e.message}`);
    return null;
  });
  populateRecatCategoryOptions();
  await populateRecatEntrySelect().catch((e) => recatLog(`Couldn't load the registry: ${e.message}`));
})();

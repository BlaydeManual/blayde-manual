// Blayde Manual -- browser-side registry lookup and repo fetch.
// Ports registry.py + fetch_repo.py's logic to run client-side: given a
// PDF's fingerprint, find its approved vehicle repo in the registry, and
// pull that repo's manifest.json + images/ folder via unauthenticated
// public reads (raw.githubusercontent.com + the GitHub contents API --
// same as the Python side, no account tied to anything).

// Shared by every viewer that renders an original PDF page for local
// comparison (contribute.js, review-panel.js, org-approval.js,
// issue-requests.js, indexer-review.js) -- a real bug caught live:
// picking an already-patched Blayde Manual output instead of the
// original scan silently rendered the wrong page, since patcher.js
// always inserts exactly one cover page at position 0, shifting every
// subsequent page by +1. Must match patcher.js's own EMBED_NAME.
// Detected via pdf.js's own getAttachments() -- deterministic (the
// file either carries this exact attachment or it doesn't), no OCR
// guesswork, no network round-trip.
const PATCHED_STATE_ATTACHMENT = "blayde_manual_state.json";

// pdfDoc is a pdf.js PDFDocumentProxy (from pdfjsLib.getDocument().promise).
// Returns the page number to actually fetch, plus whether a correction
// was applied, so every caller can log it consistently.
async function resolvePageForLocalPdf(pdfDoc, page) {
  let isPatchedOutput = false;
  try {
    const attachments = await pdfDoc.getAttachments();
    isPatchedOutput = !!(attachments && attachments[PATCHED_STATE_ATTACHMENT]);
  } catch (e) { /* no attachments at all -- treat as an original scan */ }
  return { targetPage: page + (isPatchedOutput ? 1 : 0), isPatchedOutput };
}

// A human-readable label built from real, structured data (page
// number, section heading) -- never the raw internal procedure_id
// (e.g. "p003_proc1_fig1"), which nobody outside the codebase needs to
// see. Parses the id's own procN/figN convention when present (real
// for every current submission) for the more specific "Procedure N --
// FIG N" form; falls back to the section heading alone for older/
// differently-shaped ids rather than showing the raw string either way.
function formatProcedureLabel(procedureId, page, sectionHeading) {
  const match = /^p\d+_proc(\d+)_fig(\d+)$/.exec(procedureId || "");
  if (match) return `PG. ${page} - Procedure ${match[1]} - FIG ${match[2]}`;
  return `PG. ${page} - ${sectionHeading || procedureId}`;
}

// A distinct, hard-to-miss confirmation for a real milestone (a
// completed submission, an accepted photo, an approved vehicle) --
// separate from a page's own plain scrolling log, which a real
// completion shouldn't have to compete with. Shared across
// contribute.js, review-panel.js, and org-approval.js, all of which
// need the same "this real thing just happened" moment; each page
// must have a `#toast` element with the matching CSS (see
// contribute.html/maintainer.html) for this to have anywhere to
// render into. Restarting the animation on a re-trigger, rather than
// letting an in-progress one keep playing, means a second completion
// shortly after the first still gets its own visible pop instead of
// silently reusing the tail end of the first one.
function showToast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.innerHTML = `<span class="toast-icon">&#9989;</span><span>${message}</span>`;
  el.classList.remove("show");
  void el.offsetWidth; // force reflow so removing+re-adding the class actually restarts the animation
  el.classList.add("show");
}

// Custom confirm/prompt -- native confirm()/alert()/prompt() have a
// real, user-triggerable failure mode: after several appear in a short
// time, Chromium offers a "Prevent this page from creating additional
// dialogs" checkbox. Checking it -- a completely reasonable thing to
// do after deleting several review candidates in a row -- silently
// makes every confirm()/prompt() on the page a no-op from then on,
// with zero visible error. Confirmed as the real cause of "delete
// stopped working" during a live review pass. A custom, in-page
// dialog can't be suppressed this way. Styles are injected once, on
// first use, and read this page's own --black-2/--steel-dark/--red/
// --text custom properties (inherited at paint time, so it doesn't
// matter that this file loads before each page's own <style> block).
let blaydeDialogStylesInjected = false;
function ensureBlaydeDialogStyles() {
  if (blaydeDialogStylesInjected) return;
  blaydeDialogStylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .blayde-dialog-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 1000;
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .blayde-dialog {
      background: var(--black-2, #16181c); border: 1px solid var(--steel-dark, #666c76);
      border-left: 3px solid var(--red, #c8102e); border-radius: 8px;
      padding: 18px 20px; max-width: 420px; width: 100%;
      color: var(--text, #e8e8ea); font: inherit; font-size: 0.88rem; line-height: 1.5;
    }
    .blayde-dialog p { margin: 0 0 14px; }
    .blayde-dialog-input {
      width: 100%; padding: 8px; margin-bottom: 14px; background: #000;
      color: var(--text, #e8e8ea); border: 1px solid var(--steel-dark, #666c76);
      border-radius: 4px; font-size: 0.85rem; box-sizing: border-box;
    }
    .blayde-dialog-dontask {
      display: flex; align-items: center; gap: 6px; margin: -4px 0 14px;
      font-size: 0.8rem; color: var(--steel, #8a8f98); cursor: pointer;
    }
    .blayde-dialog-dontask input { margin: 0; cursor: pointer; }
    .blayde-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .blayde-dialog-actions button {
      background: var(--red, #c8102e); color: #fff; border: none; padding: 8px 16px;
      font-size: 0.85rem; font-weight: 700; border-radius: 6px; cursor: pointer; margin: 0;
    }
    .blayde-dialog-actions button.secondary { background: var(--steel-dark, #666c76); }
  `;
  document.head.appendChild(style);
}

// dontAskKey scopes a real, working "don't ask me again" to ONE specific
// call site (e.g. "delete-review-candidate"), stored in localStorage --
// deliberately per-action, not a single global flag, so dismissing
// friction on a low-stakes, repetitive action (deleting an obvious OCR
// false positive) can never silently suppress a genuinely different,
// higher-stakes confirm (like removing a maintainer) that happens to
// reuse this same function. Real, not the native-browser version of
// this that silently broke every future confirm() on the page (see the
// file-level comment above) -- this only ever affects confirms that
// were explicitly opted into the same dontAskKey.
function blaydeConfirm(message, { dontAskKey, okLabel, cancelLabel } = {}) {
  if (dontAskKey && localStorage.getItem(`blayde-dontask-${dontAskKey}`)) {
    return Promise.resolve(true);
  }
  ensureBlaydeDialogStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "blayde-dialog-overlay";
    overlay.innerHTML = `
      <div class="blayde-dialog">
        <p></p>
        ${dontAskKey ? `<label class="blayde-dialog-dontask"><input type="checkbox"> Don't ask me again</label>` : ""}
        <div class="blayde-dialog-actions">
          <button class="secondary" data-action="cancel">${cancelLabel || "Cancel"}</button>
          <button data-action="ok">${okLabel || "OK"}</button>
        </div>
      </div>`;
    overlay.querySelector("p").textContent = message; // textContent, not innerHTML -- message may contain real procedure IDs/user text
    document.body.appendChild(overlay);
    const okBtn = overlay.querySelector('[data-action="ok"]');
    // Focus the dialog's own OK button, not left on whatever triggered
    // it -- real bug found via direct report: a native <button> (the
    // delete "x" behind this dialog) activates on Space by default, so
    // if focus stays there while this overlay is open, pressing Space
    // re-clicks THAT button, opening a second stacked confirm on top of
    // this one, cascading with every further Space press. Focusing OK
    // here means Space activates OK instead, via ordinary button
    // semantics -- no custom keydown handling needed for that part.
    okBtn.focus();
    function finish(ok) {
      if (ok && dontAskKey && overlay.querySelector(".blayde-dialog-dontask input")?.checked) {
        localStorage.setItem(`blayde-dontask-${dontAskKey}`, "1");
      }
      overlay.remove();
      resolve(ok);
    }
    overlay.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (action) finish(action === "ok");
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") finish(false);
    });
  });
}

function blaydePrompt(message, defaultValue = "") {
  ensureBlaydeDialogStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "blayde-dialog-overlay";
    overlay.innerHTML = `
      <div class="blayde-dialog">
        <p></p>
        <input type="text" class="blayde-dialog-input">
        <div class="blayde-dialog-actions">
          <button class="secondary" data-action="cancel">Cancel</button>
          <button data-action="ok">OK</button>
        </div>
      </div>`;
    overlay.querySelector("p").textContent = message;
    const input = overlay.querySelector(".blayde-dialog-input");
    input.value = defaultValue;
    document.body.appendChild(overlay);
    input.focus();
    input.select();
    function finish(action) {
      const value = action === "ok" ? input.value : null;
      overlay.remove();
      resolve(value);
    }
    overlay.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (action) finish(action);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish("ok");
      if (e.key === "Escape") finish("cancel");
    });
  });
}

async function loadRegistry(registryUrl) {
  const resp = await fetch(registryUrl);
  if (!resp.ok) throw new Error(`could not load registry (${resp.status})`);
  return resp.json();
}

function findByFingerprint(registryData, sha256) {
  return (registryData.vehicles || []).find(e => e.source_pdf_sha256 === sha256) || null;
}

// A previously-patched Blayde Manual output has different bytes
// entirely from the original PDF it was patched from (an extra cover
// page, drawn overlays, an embedded state attachment) -- its
// fingerprint can never match source_pdf_sha256, which is the
// ORIGINAL's hash. Matching by the repo_url already stored in that
// output's own embedded state sidesteps fingerprinting entirely for
// this case. See patcher.js's pdfInput handler for where this applies.
//
// Matches on edition_id too, not just repo_url -- a vehicle repo can
// hold more than one edition now (own manifest.json, own images/ folder
// per edition), so repo_url alone no longer identifies a unique
// registry row once a vehicle has a second edition. editionId comes
// from the same embedded state that supplies repoUrl (patcher.js writes
// both together), so an old file predating that field would pass
// undefined here -- there's no real installed base of those yet to
// carry forward compatibly.
function findByRepoUrl(registryData, repoUrl, editionId) {
  return (registryData.vehicles || []).find(e => e.repo_url === repoUrl && e.edition_id === editionId) || null;
}

function ownerRepo(repoUrl) {
  const parts = repoUrl.replace(/\/$/, "").split("/");
  return [parts[parts.length - 2], parts[parts.length - 1]];
}

// <procedure_id>.ext or <procedure_id>__by_<username>[__altN].ext --
// see CONTRIBUTING.md's filename convention. Shared with patcher.js
// (picking which photo to embed) and review-panel.js (identifying
// which procedure a submitted PR's photo is for).
function parsePhotoFilename(filename) {
  const stem = filename.replace(/\.(jpe?g|png|webp)$/i, "");
  const [procedureId, rest] = stem.split("__by_");
  const contributor = rest ? rest.split("__alt")[0] : null;
  return { procedureId, contributor };
}

// Shared authenticated GitHub REST call -- used by anything that acts
// on a repo with a signed-in maintainer/contributor's own token
// (contribute.js's submission flow, review-panel.js's accept/reject).
// One implementation, not one per page, so the two don't drift.
async function githubApi(path, token, options = {}) {
  const resp = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    const err = new Error(body.message || `GitHub API error (${resp.status})`);
    err.status = resp.status;
    throw err;
  }
  return resp.status === 204 ? null : resp.json();
}

// UTF-8-safe base64 for arbitrary text (e.g. re-encoding manifest.json
// after an edit) -- distinct from a data: URL's already-base64 image
// payload, which is just the substring after the comma.
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

// editionId is required, not optional -- manifest.json lives under its
// own edition's folder (own coordinate space, can't be shared across
// editions), never at repo root anymore.
async function fetchManifest(repoUrl, editionId) {
  const [owner, repo] = ownerRepo(repoUrl);
  for (const branch of ["main", "master"]) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${editionId}/manifest.json`;
    const resp = await fetch(url);
    if (resp.ok) return { manifest: await resp.json(), branch };
  }
  throw new Error(`could not fetch ${editionId}/manifest.json from ${repoUrl} (tried main, master)`);
}

async function listRepoImages(repoUrl, editionId, branch) {
  const [owner, repo] = ownerRepo(repoUrl);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${editionId}/images?ref=${branch}`;
  const resp = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!resp.ok) {
    if (resp.status === 404) return []; // no images/ folder yet, nothing contributed
    throw new Error(`GitHub contents API error (${resp.status})`);
  }
  const entries = await resp.json();
  // Every images/ folder carries a standing README.md placeholder
  // (patcher.js only ever embeds .jpg/.jpeg/.png -- see embedJpg/
  // embedPng below) -- filtering by type === "file" alone counted it as
  // an "available photo", a real, confirmed bug: it inflated the
  // "N photo(s) available" count in patcher.js's log by one on every
  // single vehicle, and wasted a fetch + MAX_PHOTO_BYTES check on a
  // file that could never actually patch into anything.
  return entries.filter(e => e.type === "file" && /\.(jpe?g|png)$/i.test(e.name));
}

// A contributed photo this large is not a real submission -- checker.py
// enforces a 15MB cap server-side before merge, so any fetched file well
// past that is either a bug or a compromised/malicious repo entry. Reject
// before it ever reaches embedJpg/embedPng, don't just trust the extension.
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

// Parallel photo fetch -- same fix as indexer-core.js's worker pool for
// OCR, applied to network I/O instead of CPU work. No actual Web Workers
// needed here (fetch() is already non-blocking), just a concurrency cap
// so requests overlap instead of paying full round-trip latency one file
// at a time -- a manual with a few hundred contributed photos was taking
// low minutes patching, entirely from this loop being sequential, not
// from the (cheap, local) embed/draw work. Sized the same way indexer's
// pool is (capped to hardwareConcurrency), for the same reason: enough
// to overlap latency without opening more connections than useful.
async function fetchManifestAndPhotos(repoUrl, editionId, onProgress) {
  const { manifest, branch } = await fetchManifest(repoUrl, editionId);
  const files = await listRepoImages(repoUrl, editionId, branch);
  const photos = new Map(); // filename -> Uint8Array
  const poolSize = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));

  let nextIdx = 0, completed = 0;
  function claimNextIdx() { return nextIdx < files.length ? nextIdx++ : -1; }

  async function fetchOne(f) {
    if (f.size && f.size > MAX_PHOTO_BYTES) {
      console.warn(`skipping ${f.name}: ${f.size} bytes exceeds the ${MAX_PHOTO_BYTES}-byte cap`);
      return;
    }
    const resp = await fetch(f.download_url);
    if (!resp.ok) return;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.length > MAX_PHOTO_BYTES) {
      console.warn(`skipping ${f.name}: downloaded ${bytes.length} bytes exceeds the ${MAX_PHOTO_BYTES}-byte cap`);
      return;
    }
    photos.set(f.name, bytes);
  }

  async function worker() {
    while (true) {
      const idx = claimNextIdx();
      if (idx < 0) return;
      const f = files[idx];
      try {
        await fetchOne(f);
      } catch (err) {
        // One bad/dropped connection isn't the whole batch's problem --
        // same per-item isolation principle as patcher.js's embed loop.
        console.warn(`skipping ${f.name}: ${err.message}`);
      }
      completed++;
      if (onProgress) onProgress(completed, files.length, f.name);
    }
  }

  await Promise.all(Array.from({ length: Math.min(poolSize, files.length) }, worker));
  return { manifest, photos, branch };
}

/** Resolve a loaded PDF's fingerprint against the registry, and if
 * there's an approved match, fetch its manifest + photos. Returns
 * {entry, manifest, photos} or throws with a clear message otherwise --
 * mirrors patch_pdf.py's resolve_via_registry. */
async function resolveEntry(entry, notFoundMessage, onProgress) {
  if (!entry) {
    const err = new Error(notFoundMessage);
    // Distinguished from other failures (network error, still-pending
    // status) so the patcher UI can offer a "become a maintainer" CTA
    // specifically here, not on every kind of registry lookup failure.
    err.reason = "not_registered";
    throw err;
  }
  if (entry.status !== "approved") {
    throw new Error(`Found '${entry.vehicle_display_name}' (${entry.edition_id}) but it's still ` +
      `${entry.status}, not approved yet.`);
  }
  const { manifest, photos } = await fetchManifestAndPhotos(entry.repo_url, entry.edition_id, onProgress);
  return { entry, manifest, photos };
}

async function resolveViaRegistry(pdfFingerprint, registryUrl, onProgress) {
  const registryData = await loadRegistry(registryUrl);
  const entry = findByFingerprint(registryData, pdfFingerprint);
  return resolveEntry(entry, `No registry entry for this PDF (fingerprint ${pdfFingerprint.slice(0, 16)}...). Not registered yet.`, onProgress);
}

// For a PDF that's already a Blayde Manual output (detected via its
// embedded state attachment, which stores its own repo_url + edition_id)
// -- see findByRepoUrl's comment for why fingerprint matching can't work
// here.
async function resolveViaRepoUrl(repoUrl, editionId, registryUrl, onProgress) {
  const registryData = await loadRegistry(registryUrl);
  const entry = findByRepoUrl(registryData, repoUrl, editionId);
  return resolveEntry(entry, `No registry entry for repo ${repoUrl} edition '${editionId}' (from this file's own embedded state).`, onProgress);
}

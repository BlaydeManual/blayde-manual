// Blayde Manual -- browser-side registry lookup and repo fetch.
// Ports registry.py + fetch_repo.py's logic to run client-side: given a
// PDF's fingerprint, find its approved vehicle repo in the registry, and
// pull that repo's manifest.json + images/ folder via unauthenticated
// public reads (raw.githubusercontent.com + the GitHub contents API --
// same as the Python side, no account tied to anything).

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
    .blayde-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .blayde-dialog-actions button {
      background: var(--red, #c8102e); color: #fff; border: none; padding: 8px 16px;
      font-size: 0.85rem; font-weight: 700; border-radius: 6px; cursor: pointer; margin: 0;
    }
    .blayde-dialog-actions button.secondary { background: var(--steel-dark, #666c76); }
  `;
  document.head.appendChild(style);
}

function blaydeConfirm(message) {
  ensureBlaydeDialogStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "blayde-dialog-overlay";
    overlay.innerHTML = `
      <div class="blayde-dialog">
        <p></p>
        <div class="blayde-dialog-actions">
          <button class="secondary" data-action="cancel">Cancel</button>
          <button data-action="ok">OK</button>
        </div>
      </div>`;
    overlay.querySelector("p").textContent = message; // textContent, not innerHTML -- message may contain real procedure IDs/user text
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      overlay.remove();
      resolve(action === "ok");
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

function ownerRepo(repoUrl) {
  const parts = repoUrl.replace(/\/$/, "").split("/");
  return [parts[parts.length - 2], parts[parts.length - 1]];
}

async function fetchManifest(repoUrl) {
  const [owner, repo] = ownerRepo(repoUrl);
  for (const branch of ["main", "master"]) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/manifest.json`;
    const resp = await fetch(url);
    if (resp.ok) return { manifest: await resp.json(), branch };
  }
  throw new Error(`could not fetch manifest.json from ${repoUrl} (tried main, master)`);
}

async function listRepoImages(repoUrl, branch) {
  const [owner, repo] = ownerRepo(repoUrl);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/images?ref=${branch}`;
  const resp = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!resp.ok) {
    if (resp.status === 404) return []; // no images/ folder yet, nothing contributed
    throw new Error(`GitHub contents API error (${resp.status})`);
  }
  const entries = await resp.json();
  return entries.filter(e => e.type === "file");
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
async function fetchManifestAndPhotos(repoUrl, onProgress) {
  const { manifest, branch } = await fetchManifest(repoUrl);
  const files = await listRepoImages(repoUrl, branch);
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
async function resolveViaRegistry(pdfFingerprint, registryUrl, onProgress) {
  const registryData = await loadRegistry(registryUrl);
  const entry = findByFingerprint(registryData, pdfFingerprint);
  if (!entry) {
    const err = new Error(`No registry entry for this PDF (fingerprint ${pdfFingerprint.slice(0, 16)}...). ` +
      `Not registered yet.`);
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
  const { manifest, photos } = await fetchManifestAndPhotos(entry.repo_url, onProgress);
  return { entry, manifest, photos };
}

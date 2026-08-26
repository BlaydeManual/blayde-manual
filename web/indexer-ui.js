let selectedPdfDoc = null;
let selectedPdfHash = null;
let selectedPdfFilename = null;
let lastManifest = null;
let pendingResume = null; // {jobId, completedPages, totalPages} when a resumable job is found and not yet decided
// The "picked up from the patcher" greeting (carried fingerprint via a
// URL param) is now shown once at the portal level -- see
// maintainer-portal.js -- since sign-in itself moved there too.

function currentJobId() {
  return makeJobId(selectedPdfHash);
}

// Opt-in only -- the shared default stays single-threaded (see
// indexer-core.js) until real indexing_metrics data from real devices
// says otherwise. This just lets someone knowingly take on more load
// on their own machine. Capped at 30% of the device's own core count,
// with a hard ceiling on top -- 30% alone would still allow 9-10
// workers on a high-core-count workstation, close to the scale that
// caused the actual lockup this is designed around.
const MAX_ADVANCED_CONCURRENCY = 6;
const concurrencyInput = document.getElementById("concurrencyInput");
const concurrencyValue = document.getElementById("concurrencyValue");
const concurrencyMaxLabel = document.getElementById("concurrencyMax");
const concurrencySpeedLabel = document.getElementById("concurrencySpeedLabel");
const advancedConcurrencyCap = Math.max(1, Math.min(MAX_ADVANCED_CONCURRENCY, Math.floor((navigator.hardwareConcurrency || 4) * 0.3)));
concurrencyInput.max = advancedConcurrencyCap;
concurrencyMaxLabel.textContent = advancedConcurrencyCap;

// Plain-language read on what the number actually means, not just a
// raw worker count -- 1 is always "Normal" (the safe default), the top
// of this device's own cap is "Turbo," anything between is "Faster."
function speedLabelFor(value) {
  if (value <= 1) return "Normal";
  if (value >= advancedConcurrencyCap) return "Turbo";
  return "Faster";
}
function updateConcurrencyLabel() {
  concurrencyValue.textContent = concurrencyInput.value;
  concurrencySpeedLabel.textContent = speedLabelFor(parseInt(concurrencyInput.value, 10));
}
concurrencyInput.addEventListener("input", updateConcurrencyLabel);
updateConcurrencyLabel();

document.getElementById("pdfInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  // Hash BEFORE handing the buffer to pdf.js -- getDocument() can
  // transfer/detach it for performance, so hashing afterward silently
  // hashes an empty buffer (real bug, caught during testing: the
  // resulting fingerprint was SHA-256 of nothing, not the file).
  selectedPdfHash = await pdfFingerprint(buf);
  selectedPdfFilename = file.name;
  selectedPdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  await checkResumeState();
});

async function checkResumeState() {
  const card = document.getElementById("resumeCard");
  const runBtn = document.getElementById("runBtn");
  pendingResume = null;
  if (!selectedPdfDoc) { runBtn.disabled = true; card.style.display = "none"; return; }

  const total = selectedPdfDoc.numPages;
  const jobId = currentJobId();
  const job = await findResumableJob(jobId, total);

  if (!job) {
    card.style.display = "none";
    runBtn.disabled = false;
    runBtn.textContent = "Index it";
    return;
  }

  // Found a paused job -- before offering to resume, check whether this
  // exact PDF got registered by someone else while it sat paused. No
  // point resuming toward a registration that's now pointless.
  card.style.display = "block";
  card.textContent = "checking whether this manual was registered by someone else while paused...";
  const check = await checkAlreadyRegistered(selectedPdfHash, null, CANONICAL_REGISTRY_URL);

  if (check.checked && check.conflict) {
    card.innerHTML = `<b style="color:#ff6b6b;">Stop -- ${check.reason}.</b><br>`
      + `Resuming this paused run (${job.completedPages}/${job.totalPages} pages already done) would likely be wasted effort. `
      + `Check the registry entry before continuing.<br>`
      + `<button id="startFreshBtn" style="margin-top:8px;">Discard paused progress and start fresh anyway</button>`;
    runBtn.disabled = true;
    document.getElementById("startFreshBtn").addEventListener("click", async () => {
      await clearJob(jobId, buildPageRange(selectedPdfDoc.numPages));
      await checkResumeState();
    });
    return;
  }

  const registryNote = check.checked
    ? "(checked: not registered elsewhere)"
    : `(couldn't check the registry: ${check.reason} -- proceeding anyway)`;
  card.innerHTML = `Found a paused run: <b>${job.completedPages}/${job.totalPages}</b> pages already indexed ${registryNote}.<br>`
    + `<button id="resumeBtn" style="margin-top:8px;">Resume</button> `
    + `<button id="startFreshBtn2" style="margin-top:8px;">Start fresh instead</button>`;
  runBtn.disabled = true;
  document.getElementById("resumeBtn").addEventListener("click", () => { pendingResume = job; runIndexing(true); });
  document.getElementById("startFreshBtn2").addEventListener("click", async () => {
    await clearJob(jobId, buildPageRange(selectedPdfDoc.numPages));
    await checkResumeState();
  });
}

function buildPageRange(numPages) {
  const out = [];
  for (let p = 1; p <= numPages; p++) out.push(p);
  return out;
}

function setProgress(current, total, label, timing) {
  const pct = total ? Math.round((current / total) * 100) : 0;
  const filled = Math.round(pct / 10);
  const bar = "[" + "#".repeat(filled) + ".".repeat(10 - filled) + "]";
  document.getElementById("progressBar").textContent = `${bar} ${pct}% -- ${label}`;
  // Live ETA from the very first samples, not just a raw count -- the
  // whole point of showing this early is catching a run that's headed
  // somewhere bad before it finishes, the same way the manual full-run
  // test caught the sequential pipeline being ~21 min from two samples.
  let etaText = "";
  if (timing?.etaSec != null) {
    const m = Math.floor(timing.etaSec / 60), s = timing.etaSec % 60;
    etaText = ` -- ETA ~${m}m ${s}s`;
  }
  document.getElementById("progressLabel").textContent = `${current} / ${total}${etaText}`;
}

function appendLog(msg) {
  const el = document.getElementById("log");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

document.getElementById("runBtn").addEventListener("click", () => runIndexing(false));

// Doesn't replace the resume system -- reduces how often it's actually
// needed, by cutting down on accidental loss (an accidental tab close,
// a browser update) in the first place.
function warnBeforeUnload(e) {
  e.preventDefault();
  e.returnValue = "";
}

// Real risk for a 10-20 minute run on a real device: a laptop or phone
// that sleeps mid-job pauses JS execution entirely. Wake Lock stops
// that; gracefully no-ops (try/catch) on browsers that don't support
// it or that deny the request (e.g. low battery).
let wakeLockSentinel = null;
async function acquireWakeLock() {
  try {
    wakeLockSentinel = await navigator.wakeLock?.request("screen");
  } catch (e) { /* unsupported or denied -- indexing still works, just no wake lock */ }
}
async function releaseWakeLock() {
  try {
    await wakeLockSentinel?.release();
  } catch (e) { /* already released or gone */ }
  wakeLockSentinel = null;
}

let pauseRequested = false;
const pauseBtn = document.getElementById("pauseBtn");
pauseBtn.addEventListener("click", () => {
  pauseRequested = true;
  pauseBtn.disabled = true;
  pauseBtn.textContent = "Pausing...";
  // A worker already mid-page finishes that page before stopping --
  // no clean mid-recognize abort -- so this can take a few seconds,
  // not instant.
  appendLog(`Pausing -- letting whatever's already in progress finish first...`);
});

async function runIndexing(resume) {
  if (!selectedPdfDoc) return;
  pauseRequested = false;
  let pausedThisRun = false;
  document.getElementById("runBtn").disabled = true;
  document.getElementById("resumeCard").style.display = "none";
  document.getElementById("progressWrap").style.display = "block";
  document.getElementById("log").textContent = "";
  concurrencyInput.disabled = true;
  pauseBtn.style.display = "inline-block";
  pauseBtn.disabled = false;
  pauseBtn.textContent = "Pause";

  const jobId = currentJobId();
  const concurrency = parseInt(concurrencyInput.value, 10) || 1;

  window.addEventListener("beforeunload", warnBeforeUnload);
  await acquireWakeLock();
  try {
    // Vehicle slug isn't known yet -- it's derived from the manual's own
    // content after indexing and confirmed by the maintainer (see
    // indexer-review.js). This placeholder gets replaced by
    // finalizeVehicleSlug() below, before the review step is shown.
    const t0 = performance.now();
    const result = await indexPdf(selectedPdfDoc, "pending", {
      onProgress: setProgress,
      onLog: appendLog,
      jobId, resume, concurrency,
      shouldPause: () => pauseRequested,
    });

    if (result.paused) {
      // Checkpoints are already saved -- this just surfaces the same
      // Resume/Start Fresh card the crash-recovery path uses, so
      // whatever new speed setting was picked takes effect on Resume.
      // checkResumeState() owns runBtn's disabled state from here --
      // it correctly disables it whenever it shows that card, which
      // the unconditional reset in finally below would otherwise undo.
      pausedThisRun = true;
      await checkResumeState();
      return;
    }

    const manifest = result;
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    appendLog(`DONE in ${secs}s -- ${manifest.entries.length} entries across ${Object.keys(manifest.page_geometry).length} page(s)`);
    appendLog(`It's up to the community to keep going. Thank you for contributing.`);

    appendLog(`Reading the manual's own cover page to guess the vehicle...`);
    const slugGuess = await suggestVehicleSlug(selectedPdfDoc, selectedPdfFilename);
    finalizeVehicleSlug(manifest, slugGuess);

    lastManifest = manifest;
    document.getElementById("downloadBtn").style.display = "inline-block";
    startReview(manifest);
  } finally {
    window.removeEventListener("beforeunload", warnBeforeUnload);
    await releaseWakeLock();
    concurrencyInput.disabled = false;
    pauseBtn.style.display = "none";
    if (!pausedThisRun) document.getElementById("runBtn").disabled = false;
  }
}

document.getElementById("downloadBtn").addEventListener("click", () => {
  if (!lastManifest) return;
  const blob = new Blob([JSON.stringify(lastManifest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "manifest.json";
  a.click();
  URL.revokeObjectURL(url);
});

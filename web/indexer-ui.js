let selectedPdfDoc = null;
let selectedPdfHash = null;
let lastManifest = null;
let pendingResume = null; // {jobId, completedPages, totalPages} when a resumable job is found and not yet decided
// The "picked up from the patcher" greeting (carried fingerprint via a
// URL param) is now shown once at the portal level -- see
// maintainer-portal.js -- since sign-in itself moved there too.

function currentJobId() {
  return makeJobId(selectedPdfHash);
}

document.getElementById("pdfInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  // Hash BEFORE handing the buffer to pdf.js -- getDocument() can
  // transfer/detach it for performance, so hashing afterward silently
  // hashes an empty buffer (real bug, caught during testing: the
  // resulting fingerprint was SHA-256 of nothing, not the file).
  selectedPdfHash = await pdfFingerprint(buf);
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

async function runIndexing(resume) {
  if (!selectedPdfDoc) return;
  document.getElementById("runBtn").disabled = true;
  document.getElementById("resumeCard").style.display = "none";
  document.getElementById("progressWrap").style.display = "block";
  document.getElementById("log").textContent = "";

  const jobId = currentJobId();

  // Vehicle slug isn't known yet -- it's derived from the manual's own
  // content after indexing and confirmed by the maintainer (see
  // indexer-review.js). This placeholder gets replaced by
  // finalizeVehicleSlug() below, before the review step is shown.
  const t0 = performance.now();
  const manifest = await indexPdf(selectedPdfDoc, "pending", {
    onProgress: setProgress,
    onLog: appendLog,
    jobId, resume,
  });
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  appendLog(`DONE in ${secs}s -- ${manifest.entries.length} entries across ${Object.keys(manifest.page_geometry).length} page(s)`);
  appendLog(`It's up to the community to keep going. Thank you for contributing.`);

  finalizeVehicleSlug(manifest, suggestVehicleSlug(manifest));

  lastManifest = manifest;
  document.getElementById("downloadBtn").style.display = "inline-block";
  document.getElementById("runBtn").disabled = false;
  startReview(manifest);
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

// Blayde Manual -- the PDF indexer. Runs entirely in-browser: reads a
// manual, finds where photos belong, and produces a manifest.json.
// Figure detection and OCR heading extraction were verified separately
// against real pages before being wired together here (see ROADMAP.md
// "Browser-based indexer port"). Scope note: manuals with a real text
// layer (rather than flattened scans) aren't handled yet -- detected and
// logged, not silently mishandled, since the real test manual is
// entirely flattened scans and that's the path needed first.

// Hardcoded, not user-editable -- same reasoning as web/index.html's
// registry URL: closes off a spoofing vector (tricking a maintainer
// into pointing this at a fake registry) by never exposing the field.
const CANONICAL_REGISTRY_URL = "https://raw.githubusercontent.com/BlaydeManual/registry/main/registry.json";

// ---- resumability (IndexedDB) -- spiked 2026-08-24, real numbers:
// DB open ~17ms one-time, a 50-page checkpoint write batch ~1.2ms total,
// read-back ~0.6ms -- functionally free against OCR's 0.3-3s/page cost.
// Job identity is just the PDF's own content hash now -- vehicle_slug
// isn't known until after indexing (it's derived from the manual
// itself, then confirmed), and there's no page range anymore (always
// the full document, required for a consistent fingerprint), so the
// hash alone is both necessary and sufficient to identify a resumable
// run of this exact file. ----

const IDB_NAME = "blayde-indexer";
const IDB_VERSION = 2;

function openIndexerDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("pages")) {
        db.createObjectStore("pages", { keyPath: "key" }); // key = `${jobId}:${pageNum}`
      }
      if (!db.objectStoreNames.contains("jobs")) {
        db.createObjectStore("jobs", { keyPath: "jobId" });
      }
      // Real bug found via direct use: indexing finishes, its own
      // checkpoints get cleared (clearJob, below) since that pass
      // genuinely completed -- but the review stage that follows
      // (deletions, bbox adjustments, added figures, the confirmed
      // vehicle/edition/source fields) lived only in memory, with zero
      // persistence, until an eventual real submit. A refresh or
      // accidental navigation lost all of it, forcing a full re-index
      // (minutes, single-threaded) just to get back to review. This
      // store persists the review-stage manifest itself, separate from
      // per-page OCR checkpoints, cleared only once the maintainer
      // actually downloads or submits.
      if (!db.objectStoreNames.contains("reviewState")) {
        db.createObjectStore("reviewState", { keyPath: "jobId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// reviewChunkIdx travels with the manifest -- direct report: resuming
// always landed back on chunk 1, forcing a maintainer deep into a large
// document to click through dozens of "Next" pages just to get back
// where they were, which also re-triggers a real, potentially-slow page
// render for every chunk passed through along the way. Saving where
// they actually were means a resume is a real resume, not just a
// re-download of the same starting point.
async function saveReviewState(jobId, manifest, reviewChunkIdx = 0) {
  const db = await openIndexerDb();
  const tx = db.transaction("reviewState", "readwrite");
  tx.objectStore("reviewState").put({ jobId, manifest, reviewChunkIdx, updatedAt: Date.now() });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
}

async function loadReviewState(jobId) {
  const db = await openIndexerDb();
  const tx = db.transaction("reviewState", "readonly");
  const result = await new Promise((resolve, reject) => {
    const req = tx.objectStore("reviewState").get(jobId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result ? { manifest: result.manifest, reviewChunkIdx: result.reviewChunkIdx || 0 } : null;
}

async function clearReviewState(jobId) {
  const db = await openIndexerDb();
  const tx = db.transaction("reviewState", "readwrite");
  tx.objectStore("reviewState").delete(jobId);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
}

async function pdfFingerprint(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function makeJobId(pdfHash) {
  return pdfHash.slice(0, 16);
}

// Checks for an existing, incomplete run of this exact file/slug/range --
// returns {jobId, completedPages, totalPages} or null. Called before a
// run starts so the UI can offer resume-vs-fresh-start, not silently.
async function findResumableJob(jobId, totalPages) {
  const db = await openIndexerDb();
  const job = await new Promise((resolve, reject) => {
    const req = db.transaction("jobs", "readonly").objectStore("jobs").get(jobId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!job || job.completedPages >= totalPages) return null;
  return job;
}

// Checked at the resume prompt specifically, not just at first-run --
// a job can sit paused for real time (closed tab, came back days later),
// and someone else may have gotten this exact vehicle approved in the
// interim. No point resuming toward a registration that's now pointless.
// Reuses registry.js's loadRegistry()/findByFingerprint() as-is -- no
// new network pattern, this project already fetches registry.json this
// same way elsewhere (the patcher's registry lookup).
async function checkAlreadyRegistered(pdfHash, vehicleSlug, registryUrl) {
  let registryData;
  try {
    registryData = await loadRegistry(registryUrl);
  } catch (e) {
    return { checked: false, reason: e.message }; // registry unreachable -- don't block resuming on a network hiccup
  }
  const exactMatch = findByFingerprint(registryData, pdfHash);
  if (exactMatch) {
    return { checked: true, conflict: true, entry: exactMatch, reason: "this exact PDF is already registered" };
  }
  const sameVehicle = (registryData.vehicles || []).find((v) => v.vehicle_slug === vehicleSlug);
  if (sameVehicle) {
    return { checked: true, conflict: true, entry: sameVehicle, reason: "this vehicle_slug already has a registered edition (a different scan, not necessarily this exact file)" };
  }
  return { checked: true, conflict: false };
}

// Same non-blocking-on-network-failure convention as above -- an
// unreachable registry shouldn't stop someone from continuing their
// submission, the org's real content review is the actual backstop
// either way. Case-insensitive on edition_id so "OEM" and "oem" count
// as the same collision, not two different labels.
async function checkEditionCollision(vehicleSlug, editionId, registryUrl) {
  if (!vehicleSlug || !editionId) return { checked: false, reason: "nothing to check yet" };
  let registryData;
  try {
    registryData = await loadRegistry(registryUrl);
  } catch (e) {
    return { checked: false, reason: e.message };
  }
  const norm = (s) => (s || "").trim().toLowerCase();
  const collision = (registryData.vehicles || []).find(
    (v) => norm(v.vehicle_slug) === norm(vehicleSlug) && norm(v.edition_id) === norm(editionId)
  );
  return collision ? { checked: true, conflict: true, entry: collision } : { checked: true, conflict: false };
}

// The list of what's already in a vehicle's repo, for an org reviewer
// judging whether a submission is a genuinely new edition or a
// duplicate of one that's already there ("this vehicle has 10
// documents, does 'OEMManual2' actually fit, or is it the same as one
// of the other ten?"). Same registry read as the checks above.
async function listExistingEditions(vehicleSlug, registryUrl) {
  let registryData;
  try {
    registryData = await loadRegistry(registryUrl);
  } catch (e) {
    return { checked: false, reason: e.message, editions: [] };
  }
  const editions = (registryData.vehicles || []).filter((v) => v.vehicle_slug === vehicleSlug);
  return { checked: true, editions };
}

// Catches a mistyped release year before it becomes a second, wrong
// repo for the same vehicle -- vehicle_slug is what determines which
// repo a manual's content goes into, so a typed "...2003" against an
// already-registered "...1999" creates a genuinely separate, duplicate
// vehicle with no warning otherwise (checkEditionCollision only
// catches an EXACT slug match). Strips the trailing -YYYY release
// year to compare on make-model alone, so "suzuki-sv650-1999" and
// "suzuki-sv650-2003" both surface as "same vehicle family, different
// release year -- is this really a different generation?" without the
// project needing to know or store any real generation-boundary data
// itself. One trailing year now, not a range: see ROADMAP.md's
// naming-convention note -- a repo is keyed by its own release year
// alone, since a manual can only ever state when ITS generation
// started, never when it ends.
function vehicleSlugPrefix(slug) {
  return (slug || "").replace(/-\d{4}$/, "");
}
async function findSimilarVehicleSlugs(vehicleSlug, registryUrl) {
  let registryData;
  try {
    registryData = await loadRegistry(registryUrl);
  } catch (e) {
    return { checked: false, reason: e.message, similar: [] };
  }
  const prefix = vehicleSlugPrefix(vehicleSlug);
  if (!prefix) return { checked: true, similar: [] };
  const seen = new Set();
  const similar = (registryData.vehicles || [])
    .filter((v) => v.vehicle_slug !== vehicleSlug && vehicleSlugPrefix(v.vehicle_slug) === prefix)
    .filter((v) => (seen.has(v.vehicle_slug) ? false : (seen.add(v.vehicle_slug), true)));
  return { checked: true, similar };
}

async function clearJob(jobId, pageNumbers) {
  const db = await openIndexerDb();
  const tx = db.transaction(["pages", "jobs"], "readwrite");
  tx.objectStore("jobs").delete(jobId);
  const pagesStore = tx.objectStore("pages");
  for (const p of pageNumbers) pagesStore.delete(`${jobId}:${p}`);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
}

async function loadJobPages(jobId, pageNumbers) {
  const db = await openIndexerDb();
  const tx = db.transaction("pages", "readonly");
  const store = tx.objectStore("pages");
  const out = {};
  await Promise.all(pageNumbers.map((p) => new Promise((resolve, reject) => {
    const req = store.get(`${jobId}:${p}`);
    req.onsuccess = () => { if (req.result) out[p] = req.result.result; resolve(); };
    req.onerror = () => reject(req.error);
  })));
  db.close();
  return out; // { pageNum: resultObject }
}

async function saveJobPage(jobId, pageNum, resultObject, completedPages, totalPages) {
  const db = await openIndexerDb();
  const tx = db.transaction(["pages", "jobs"], "readwrite");
  tx.objectStore("pages").put({ key: `${jobId}:${pageNum}`, result: resultObject });
  tx.objectStore("jobs").put({ jobId, completedPages, totalPages, updatedAt: Date.now() });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
}

function slugify(text, maxlen = 40) {
  let s = text.toLowerCase().replace(/[^\w\s-]/g, "");
  s = s.replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
  return (s.slice(0, maxlen).replace(/^-+|-+$/g, "")) || "section";
}

// Vehicle slug isn't typed in upfront anymore -- it's guessed, then a
// maintainer confirms or corrects it. Falls back to the PDF's own
// filename when OCR can't find a usable guess (see suggestVehicleSlug
// below for why the filename alone isn't good enough on its own).
function suggestVehicleSlugFromFilename(filename) {
  if (!filename) return "manual";
  const stem = filename.replace(/\.pdf$/i, "");
  return slugify(stem, 60);
}

// One-off OCR of the manual's own cover/title page(s), used only to
// seed a vehicle_slug suggestion -- a deliberate, narrower exception
// to the OCR'd-text decision in LEGAL.md, not a reversal of it. That
// decision was about entries[].section_heading carrying real manual
// text hundreds of times into the public manifest -- in aggregate,
// systematic reproduction of the manual's own structure. A vehicle's
// make/model/year is a fact, not the manual's expression --
// copyright doesn't protect facts, short phrases, or names/titles at
// all, and this project still has to categorize every manual by that
// same fact regardless of whether it's OCR'd or typed by hand. The raw
// OCR'd text here is used once, in this browser, to build a slug
// guess, then discarded -- never written to the manifest or anywhere
// else, the same "compute it, use it, don't store it" pattern already
// used for section-boundary detection (sectionText, never persisted).
async function ocrTitlePageForSlug(pdfDoc) {
  const candidatePages = [1, 2, 3].filter((p) => p <= pdfDoc.numPages);
  let worker = null;
  try {
    worker = await Tesseract.createWorker("eng");
    for (const pageNum of candidatePages) {
      const page = await pdfDoc.getPage(pageNum);
      const { canvas } = await renderPageToImageData(page, 3.0);
      const { data } = await worker.recognize(canvas.toDataURL("image/png"));
      const guess = guessVehicleSlugFromText(data.text || "");
      if (guess) return guess;
    }
    return null;
  } catch (e) {
    return null; // best-effort -- suggestVehicleSlugFromFilename covers this
  } finally {
    if (worker) { try { await worker.terminate(); } catch (e) { /* already gone */ } }
  }
}

// Heuristic only, not a claim of accuracy -- the maintainer confirms
// or corrects the result either way, same as the filename guess did.
//
// Verified against a real manual (sv650.pdf, real Tesseract OCR of the
// actual page 1, not a guess): the previous single-regex-over-the-
// whole-blob approach broke two ways at once. First, it matched the
// WRONG line -- a ManualsLib source watermark ("Manuals / Brands /
// Suzuki Manuals / Motorcycle / 1999 SV650 / Service manual / PDF")
// also contains a year, and being earlier in the text, it won over the
// real title, producing "pdf-suzuki-1999-1999". Second, even matching
// the right line, the "words immediately before the year = make/model"
// assumption breaks on a real title like "SUZUKI 1999 SV650 SERVICE
// MANUAL" -- the year sits BETWEEN make and model here, not after both.
//
// Fixed by scoring whole LINES instead of one regex over a flattened
// blob: strip known watermark lines outright (this ManualsLib pattern,
// plus the "downloaded from ... manuals search engine" one already
// found), keep only lines that contain a year, prefer the shortest
// remaining one (a real title page reads like a short banner, not a
// paragraph), then strip the year and generic words like
// "service"/"manual" from THAT line specifically, wherever the year
// actually sits in it.
//
// Real, separate limit found in the same test: this document's actual
// cover text says "SUZUKI 1999 SV650 SERVICE MANUAL" -- one year, no
// range at all. That's actually the correct shape now: per this
// project's naming-convention change (see ROADMAP.md), a repo is
// keyed by its own release year alone, since a manual can only ever
// state when ITS generation started, never when it ends -- a NEW
// manual starting some later year is a different generation with its
// own repo, not evidence this one's range should extend to cover it.
// So this always takes the FIRST year found, even out of a printed
// range like "1999-2002" (which really just means this manual's own
// content spans those years, not that suzuki-sv650-1999 is meant to
// cover 2002 as well).
function guessVehicleSlugFromText(text) {
  const isNoiseLine = (line) =>
    /manualslib\.com/i.test(line) ||
    /downloaded from.*manuals search engine/i.test(line) ||
    /^manuals\s*\//i.test(line) || /\/\s*brands\s*\//i.test(line);

  const candidates = text.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !isNoiseLine(l) && /(?:19|20)\d{2}/.test(l));
  if (!candidates.length) return null;

  candidates.sort((a, b) => a.length - b.length);
  const best = candidates[0];

  // A printed range (YYYY-YYYY) still has to be matched and stripped
  // as ONE unit -- matching only the first year and leaving the
  // second (plus its dash) behind in the line was a real regression
  // caught by re-testing against a range-format title after this fix.
  // Only the first year of it is ever used for the slug.
  const rangeMatch = best.match(/(?:19|20)\d{2}\s*-\s*(?:19|20)\d{2}/);
  let year, matchedSpan;
  if (rangeMatch) {
    matchedSpan = rangeMatch[0];
    year = matchedSpan.match(/(?:19|20)\d{2}/)[0];
  } else {
    matchedSpan = best.match(/(?:19|20)\d{2}/)[0];
    year = matchedSpan;
  }

  const words = best
    .replace(matchedSpan, " ")
    .replace(/\bservice\b|\bmanual\b|\bowners?\b|\brepair\b|\bworkshop\b/gi, " ")
    .trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return slugify(`${words.join(" ")} ${year}`, 60);
}

// Public entry point: OCR guess first, filename guess as the fallback
// when OCR finds nothing usable (a badly scanned cover page, a cover
// page that isn't page 1-3, etc.).
async function suggestVehicleSlug(pdfDoc, filename) {
  try {
    const ocrGuess = await ocrTitlePageForSlug(pdfDoc);
    if (ocrGuess) return ocrGuess;
  } catch (e) { /* fall through to filename */ }
  return suggestVehicleSlugFromFilename(filename);
}

// contributed_photo_path is derived, not stored-then-forgotten -- it's
// recomputed from the current slug every time this is called, so it's
// always safe to call again after the maintainer edits the confirm
// field, no matter how many entries were added in between.
function finalizeVehicleSlug(manifest, slug) {
  manifest.vehicle = slug;
  manifest.entries.forEach((e) => {
    e.contributed_photo_path = `images/${slug}/${e.procedure_id}/`;
  });
}

function currentSectionForY(headings, y, fallback) {
  let best = fallback;
  for (const [text, hy] of headings) {
    if (hy <= y) best = text; else break;
  }
  return best;
}

// ---- density-based figure detection, verified against real pages
// (2026-08-24) -- see ROADMAP.md for the comparison ----
function segmentFigures(imgData, width, height, minGapPx = 8, minFigureHPx = 40) {
  const isContent = new Uint8Array(height);
  for (let y = 0; y < height; y++) {
    let rowMin = 255;
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = base + x * 4;
      const lum = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
      if (lum < rowMin) rowMin = lum;
      if (rowMin < 245) break;
    }
    isContent[y] = rowMin < 245 ? 1 : 0;
  }
  const bands = [];
  let inBand = false, start = 0, blankRun = 0;
  for (let y = 0; y < height; y++) {
    if (isContent[y]) {
      if (!inBand) { inBand = true; start = y; }
      blankRun = 0;
    } else if (inBand) {
      blankRun++;
      if (blankRun >= minGapPx) {
        const end = y - blankRun;
        if (end - start >= minFigureHPx) bands.push([start, end]);
        inBand = false;
      }
    }
  }
  if (inBand) bands.push([start, height]);
  return bands;
}

function findFigureColumns(imgData, width, y0, y1, opts = {}) {
  const darkThresh = opts.darkThresh ?? 0.28;
  const minWidthFrac = opts.minWidthFrac ?? 0.12;
  const mergeGapFrac = opts.mergeGapFrac ?? 0.02;
  const minHeightPx = opts.minHeightPx ?? 150;
  const padFrac = opts.padFrac ?? 0.02;
  if (y1 - y0 < minHeightPx) return [];

  const colDark = new Float64Array(width);
  const bandH = y1 - y0;
  for (let x = 0; x < width; x++) {
    let darkCount = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
      if (lum < 200) darkCount++;
    }
    colDark[x] = darkCount / bandH;
  }

  const minWidthPx = Math.floor(width * minWidthFrac);
  const mergeGapPx = Math.max(1, Math.floor(width * mergeGapFrac));
  const runs = [];
  let inRun = false, start = 0, gap = 0;
  for (let x = 0; x < width; x++) {
    const dense = colDark[x] > darkThresh;
    if (dense) {
      if (!inRun) { inRun = true; start = x; }
      gap = 0;
    } else if (inRun) {
      gap++;
      if (gap > mergeGapPx) {
        const end = x - gap;
        if (end - start >= minWidthPx) runs.push([start, end]);
        inRun = false;
      }
    }
  }
  if (inRun) runs.push([start, width]);

  const padX = Math.floor(width * padFrac);
  return runs.map(([s, e]) => [Math.max(0, s - padX), Math.min(width, e + padX)]);
}

// ---- OCR heading extraction, verified against a real page (2026-08-24) ----
function extractHeadings(tesseractData) {
  const headings = [];
  for (const line of tesseractData.lines) {
    const text = line.text.trim();
    if (!text) continue;
    const letters = text.replace(/[^A-Za-z]/g, "");
    if (!letters) continue;
    const upperFrac = [...letters].filter(c => c === c.toUpperCase() && c !== c.toLowerCase()).length / letters.length;
    const height = line.bbox.y1 - line.bbox.y0;
    if (text.length >= 3 && text.length <= 60 && (upperFrac > 0.7 || height > 18)) {
      headings.push([text, line.bbox.y0]);
    }
  }
  headings.sort((a, b) => a[1] - b[1]);
  return headings;
}

async function isFlattenedScanPage(page) {
  const textContent = await page.getTextContent();
  const text = textContent.items.map(i => i.str).join(" ").trim();
  const realText = text.replace(/downloaded from.*manuals search engine/i, "").trim();
  return realText.length <= 20;
}

async function renderPageToImageData(page, scale) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { canvas, ctx, imgData: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}

// Phase 1 (parallel): render + OCR + figure-detect each page independently
// -- this is the actual bottleneck (OCR), and nothing about it depends on
// page order. A pool of Tesseract workers, sized to the device's real core
// count, pulls pages off a shared queue -- verified 2026-08-24 that a
// sequential run of the full 415-page manual takes ~21 minutes; this is
// the fix, not a rewrite of the (already-verified) detection logic itself.
//
// Phase 2 (sequential): assemble manifest entries in page order. This
// CANNOT be parallelized -- the running section heading carries forward
// from one page to the next, and procedure_id's
// per-page dedup counters need a stable, deterministic order. Splitting
// the expensive part (phase 1) from the order-dependent part (phase 2) is
// what makes both correctness and speed possible at the same time.

async function indexPdf(pdfDoc, vehicleSlug, {
  startPage, endPage, scale = 3.0, onProgress, onLog, concurrency,
  jobId = null, resume = false, shouldPause = null,
} = {}) {
  const first = startPage || 1;
  const last = endPage || pdfDoc.numPages;
  const pageNumbers = [];
  for (let p = first; p <= last; p++) pageNumbers.push(p);

  // A machine genuinely locked up hard enough to need a power-cycle
  // running this at hardwareConcurrency-1 (up to 8) -- see CHANGELOG.md.
  // Tesseract workers are WASM-heavy (real memory + CPU footprint each,
  // not lightweight threads), so "one worker per free core" is the wrong
  // heuristic for this specific task even though it's fine for cheap
  // parallel work. Single-threaded until there's real performance data
  // (across real devices, not just this one machine) to size a safe
  // concurrency default from -- no evidence yet on whether a lower
  // parallel count (e.g. 2-3) is actually safe, so this isn't a tuned
  // number, it's the only value with zero contention risk.
  const poolSize = concurrency || 1;

  const results = new Array(pageNumbers.length);
  let completed = 0;
  let completedThisRun = 0;

  if (jobId) {
    if (resume) {
      const saved = await loadJobPages(jobId, pageNumbers);
      pageNumbers.forEach((pageNum, idx) => {
        if (saved[pageNum]) { results[idx] = saved[pageNum]; completed++; }
      });
      onLog?.(`resuming: ${completed}/${pageNumbers.length} page(s) already done, ${pageNumbers.length - completed} remaining`);
    } else {
      await clearJob(jobId, pageNumbers);
    }
  }

  onLog?.(`indexing ${pageNumbers.length - completed} page(s) with ${poolSize} parallel worker(s)`);
  const t0 = performance.now();
  // Worker creation hanging silently is worse than it failing loudly --
  // found during testing that it can stall indefinitely on some repeated
  // same-tab runs (root cause not fully pinned down yet, see
  // ROADMAP.md). A hard timeout plus per-worker error isolation means a
  // stuck attempt surfaces as a real error instead of a frozen-looking
  // page with zero feedback -- exactly the failure mode flagged as the
  // actual UX killer in the resumability research.
  const CREATE_WORKER_TIMEOUT_MS = 15000;
  function createWorkerWithTimeout(i) {
    return Promise.race([
      Tesseract.createWorker("eng"),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`worker ${i + 1}/${poolSize} took over ${CREATE_WORKER_TIMEOUT_MS / 1000}s to start`)),
        CREATE_WORKER_TIMEOUT_MS,
      )),
    ]);
  }
  const workerAttempts = await Promise.allSettled(
    Array.from({ length: poolSize }, (_, i) => createWorkerWithTimeout(i))
  );
  const workers = workerAttempts.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const failedCount = workerAttempts.length - workers.length;
  if (failedCount > 0) {
    onLog?.(`WARNING: ${failedCount}/${poolSize} worker(s) failed to start, continuing with ${workers.length}`);
  }
  if (workers.length === 0) {
    throw new Error("no OCR workers could be started -- see log for details");
  }

  let nextIdx = 0;
  function claimNextIdx() {
    // Checked here, not mid-page -- a worker always finishes the page
    // it's already on (Tesseract has no clean mid-recognize abort) and
    // just stops claiming new work. Simpler and safer than live-killing
    // a worker, and the checkpoint already saved after every page means
    // nothing in flight is lost either way.
    if (shouldPause?.()) return -1;
    while (nextIdx < pageNumbers.length && results[nextIdx] !== undefined) nextIdx++;
    return nextIdx < pageNumbers.length ? nextIdx++ : -1;
  }

  async function workerLoop(worker) {
    while (true) {
      const idx = claimNextIdx();
      if (idx < 0) return;
      const pageNum = pageNumbers[idx];
      const page = await pdfDoc.getPage(pageNum);

      let result;
      if (!(await isFlattenedScanPage(page))) {
        result = { pageNum, skipped: true };
      } else {
        const { canvas, imgData } = await renderPageToImageData(page, scale);
        const viewport = page.getViewport({ scale: 1.0 });
        const { data } = await worker.recognize(canvas.toDataURL("image/png"));
        const headings = extractHeadings(data);
        const bands = segmentFigures(imgData, canvas.width, canvas.height);
        const figureBoxes = [];
        for (const [bandY0, bandY1] of bands) {
          for (const [x0, x1] of findFigureColumns(imgData, canvas.width, bandY0, bandY1)) {
            figureBoxes.push([x0, bandY0, x1, bandY1]);
          }
        }
        result = {
          pageNum, skipped: false, headings, figureBoxes,
          composite_width_px: canvas.width, composite_height_px: canvas.height,
          page_width_pt: viewport.width, page_height_pt: viewport.height,
        };
      }
      results[idx] = result;

      completed++;
      completedThisRun++;
      if (jobId) await saveJobPage(jobId, pageNum, result, completed, pageNumbers.length);

      // Rate/ETA use only work done in *this* run -- pages loaded from a
      // resumed job finished before t0 started and would otherwise skew
      // the rate artificially high.
      const elapsed = (performance.now() - t0) / 1000;
      const remaining = pageNumbers.length - completed;
      const etaSec = elapsed > 0 && completedThisRun > 0
        ? Math.round(remaining / (completedThisRun / elapsed)) : null;
      onProgress?.(completed, pageNumbers.length, `page ${pageNum}`, { elapsedSec: elapsed, etaSec });
    }
  }

  try {
    await Promise.all(workers.map(workerLoop));
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }

  // Stopped early via shouldPause, not naturally exhausted -- every
  // completed page's checkpoint is already saved (saveJobPage runs
  // after each one), so this is safe to just stop and hand back to the
  // caller. Do NOT clearJob here -- that would delete the very
  // checkpoints a resume needs.
  if (completed < pageNumbers.length) {
    onLog?.(`paused: ${completed}/${pageNumbers.length} page(s) done`);
    return { paused: true, completed, total: pageNumbers.length };
  }

  if (jobId) await clearJob(jobId, pageNumbers); // completed successfully -- no need to keep checkpoints

  // Real performance data, decentralized -- every vehicle repo's own
  // manifest.json carries how long its own indexing run actually took,
  // on what hardware, at what pool size. No telemetry pipeline, nothing
  // sent anywhere -- just what's already public in the repo, the same
  // way everything else in this project works. Lets a future concurrency
  // decision be based on real numbers across real devices instead of
  // one incident (see the pool-size hotfix note above).
  const indexingMetrics = {
    elapsed_sec: Math.round((performance.now() - t0) / 10) / 100,
    pages_indexed: pageNumbers.length,
    pool_size: poolSize,
    hardware_concurrency: navigator.hardwareConcurrency || null,
  };

  const manifest = {
    vehicle: vehicleSlug,
    source_manual: "browser-indexed",
    page_count: pdfDoc.numPages,
    generated_by: "shop-manual-indexer (browser)",
    indexing_metrics: indexingMetrics,
    page_geometry: {},
    entries: [],
  };
  let runningSection = "front-matter";
  // Procedure IDs and section_heading are positional only -- page number
  // and a per-page sequential index, never derived from or containing the
  // manual's own words. sectionText (the real OCR'd heading) is still used
  // to detect where one procedure ends and the next begins -- that's a
  // real, useful signal -- it just never gets slugified into a stored ID
  // or persisted as a label. See LEGAL.md's systematic-extraction concern:
  // this removes the risk instead of just shrinking it, and a wrong
  // synthetic label costs nothing since the live compare view is the real
  // verification either way.
  const pageGroups = {};      // "page|sectionText" -> group index on that page
  const pageGroupCounts = {}; // page -> next group index to assign
  const groupFigCounts = {};  // "page|sectionText" -> figs seen so far in that group

  function positionalId(pageNum, sectionText) {
    const key = `${pageNum}|${sectionText}`;
    if (!(key in pageGroups)) {
      pageGroupCounts[pageNum] = (pageGroupCounts[pageNum] || 0) + 1;
      pageGroups[key] = pageGroupCounts[pageNum];
    }
    const groupIndex = pageGroups[key];
    const n = (groupFigCounts[key] || 0) + 1;
    groupFigCounts[key] = n;
    return {
      procedureId: `p${String(pageNum).padStart(3, "0")}_proc${groupIndex}_fig${n}`,
      sectionHeading: `Page ${pageNum}, procedure ${groupIndex}`,
    };
  }

  for (const r of results) {
    if (r.skipped) {
      onLog?.(`page ${r.pageNum}: text-layer page, skipped (not handled yet)`);
      continue;
    }
    manifest.page_geometry[String(r.pageNum)] = {
      composite_width_px: r.composite_width_px,
      composite_height_px: r.composite_height_px,
      page_width_pt: r.page_width_pt,
      page_height_pt: r.page_height_pt,
    };
    if (r.headings.length) runningSection = r.headings[r.headings.length - 1][0];

    let nFigsThisPage = 0;
    for (const [x0, bandY0, x1, bandY1] of r.figureBoxes) {
      const sectionText = currentSectionForY(r.headings, bandY0, runningSection);
      const { procedureId, sectionHeading } = positionalId(r.pageNum, sectionText);

      manifest.entries.push({
        procedure_id: procedureId,
        page: r.pageNum,
        section_heading: sectionHeading,
        pixel_bbox: [x0, bandY0, x1, bandY1],
        source_layout: "flattened_scan_ocr",
        content_type: "photo",
        contributed_photo_path: `images/${vehicleSlug}/${procedureId}/`,
        status: "needs_contributed_photo",
      });
      nFigsThisPage++;
    }
    onLog?.(`page ${r.pageNum}: ${r.headings.length} heading(s), ${nFigsThisPage} figure(s)`);
  }

  return manifest;
}

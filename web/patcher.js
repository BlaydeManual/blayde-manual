// Blayde Manual -- PDF patcher.
// Ports patch_pdf.py's coordinate math, embedded-state versioning, and
// cover page rendering to run entirely client-side via @cantoo/pdf-lib
// (a maintained fork of pdf-lib with getAttachments() support, needed
// to read back the embedded state for idempotent re-patching).
//
// Two modes:
//  - Registry mode (registry.js): give it just a PDF + a registry.json
//    URL, it fingerprints, looks up the approved repo, fetches the
//    manifest + every contributed photo, and patches everything it can
//    -- zero other input, the actual point of this tool.
//  - Manual test mode: no registry, pick one photo yourself, patched
//    into a single hardcoded test page/bbox. Only for local testing
//    without a published registry to point at.
//
// Not yet ported: the photomosaic and stylization filter (mosaic.py /
// stylize.py) -- the cover page here is text/stats only, no mosaic
// image. That's a real, separate, larger port, not done here.

const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFString, PDFArray } = PDFLib;

const EMBED_NAME = "blayde_manual_state.json";
// Not exposed as a UI field -- see ROADMAP.md, this was a dev-only
// input that ended up implying visitors need to know what a registry
// URL even is. One published registry, hardcoded.
const DEFAULT_REGISTRY_URL = "https://raw.githubusercontent.com/BlaydeManual/registry/main/registry.json";
const RED = rgb(0.784, 0.063, 0.114);
const BLACK = rgb(0.047, 0.051, 0.059);
const STEEL = rgb(0.541, 0.561, 0.596);
const WHITE = rgb(0.91, 0.91, 0.92);

const log = document.getElementById("log");
const pdfInput = document.getElementById("pdfInput");
const patchBtn = document.getElementById("patchBtn");
const contributorPrefWrap = document.getElementById("contributorPrefWrap");
const contributorList = document.getElementById("contributorList");
const progressBar = document.getElementById("progressBar");
const progressLabel = document.getElementById("progressLabel");

function appendLog(line) {
  log.textContent += "\n" + line;
  log.scrollTop = log.scrollHeight;
}

const BAR_WIDTH = 30;
function setProgress(current, total, label) {
  const frac = total > 0 ? Math.min(1, current / total) : 0;
  const filled = Math.round(frac * BAR_WIDTH);
  const bar = "#".repeat(filled) + ".".repeat(BAR_WIDTH - filled);
  const pct = Math.round(frac * 100);
  progressBar.textContent = `[${bar}] ${pct}%`;
  progressLabel.textContent = label;
}

// Contributor preference used to be a free-text "comma-separated handles"
// field shown before any file was even picked -- asking a visitor to
// already know who's contributed to a manual they haven't matched yet.
// Now it only appears after a registry match, populated from the actual
// photos that came back, ranked by how much each person has contributed
// to THIS vehicle -- not a global leaderboard, just this repo's photos.
function computeContributorCounts(photos) {
  const counts = new Map();
  for (const filename of photos.keys()) {
    const { contributor } = parsePhotoFilename(filename);
    if (!contributor) continue;
    counts.set(contributor, (counts.get(contributor) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([handle, count]) => ({ handle, count }));
}

// The whole list IS the priority order, drag-reorderable -- not an
// opt-in checkbox set. Default order (most contributions to this
// vehicle first) is already the useful signal; dragging just lets
// someone override it, e.g. to favor a friend's photos even if they've
// contributed fewer.
function renderContributorList(counts) {
  contributorList.innerHTML = "";
  if (counts.length === 0) {
    contributorPrefWrap.style.display = "none";
    return;
  }
  for (const { handle, count } of counts) {
    const row = document.createElement("div");
    row.className = "contributor-row";
    row.draggable = true;
    row.dataset.handle = handle;
    row.innerHTML = `
      <span class="contributor-rank"></span>
      <span class="drag-handle" aria-hidden="true">&#8942;&#8942;</span>
      <span class="contributor-handle">@${handle}</span>
      <span class="contributor-count">${count} photo${count === 1 ? "" : "s"}</span>
    `;
    contributorList.appendChild(row);
  }
  attachContributorDragHandlers();
  refreshContributorRanks();
  contributorPrefWrap.style.display = "block";
}

function refreshContributorRanks() {
  contributorList.querySelectorAll(".contributor-row").forEach((row, i) => {
    row.querySelector(".contributor-rank").textContent = i + 1;
  });
}

// Native HTML5 drag-and-drop, reordering DOM nodes directly -- the DOM
// order IS the data, read back by getPriorityList(). No library, this
// is a short enough list that a full drag library would be overkill.
let draggedRow = null;
function attachContributorDragHandlers() {
  for (const row of contributorList.querySelectorAll(".contributor-row")) {
    row.addEventListener("dragstart", () => {
      draggedRow = row;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      draggedRow = null;
      refreshContributorRanks();
    });
  }
}
contributorList.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (!draggedRow) return;
  const after = rowAfterPoint(e.clientY);
  if (after == null) contributorList.appendChild(draggedRow);
  else contributorList.insertBefore(draggedRow, after);
});

function rowAfterPoint(y) {
  const rows = [...contributorList.querySelectorAll(".contributor-row:not(.dragging)")];
  return rows.reduce((closest, row) => {
    const box = row.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    return offset < 0 && offset > closest.offset ? { offset, element: row } : closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function getPriorityList() {
  return [...contributorList.querySelectorAll(".contributor-row")].map(r => r.dataset.handle);
}

async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256HexShort(bytes) {
  return (await sha256Hex(bytes.buffer || bytes)).slice(0, 16);
}

// parsePhotoFilename() moved to registry.js -- review-panel.js needs it
// too (maintainer.html doesn't load patcher.js), one implementation.

/** Given all candidate photos for one procedure and an ordered priority
 * list of preferred contributor handles, pick one. Falls back to a
 * random candidate if none of the priority list covered this procedure
 * -- deliberately not a global "winner" system, see ROADMAP.md
 * "Contributor competition and rivalry." This choice belongs to the
 * person patching their own copy, not to the project. */
function pickPhoto(candidates, priorityList) {
  for (const handle of priorityList) {
    const match = candidates.find(c => c.contributor === handle);
    if (match) return match;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

let pdfBytes = null;
let pdfFingerprint = null;
let registryResolution = null; // { entry, manifest, photos } once resolved

// Carries the already-computed fingerprint over to the maintainer portal
// as a URL param -- greeting copy only, never trusted as a substitute
// for the portal re-hashing whatever file actually gets re-selected
// there. Avoids the page feeling like it forgot what the visitor just
// did, without weakening the "always verify the real bytes" invariant.
function showMaintainerCta(fingerprint) {
  const card = document.getElementById("maintainerCta");
  if (!card) return;
  card.style.display = "block";
  // By ID, not the card's first <a> -- the 5-step card also has a
  // secondary "share this instead" link, and querySelector("a") would
  // silently grab whichever one happens to come first in the markup.
  document.getElementById("maintainerCtaLink").href = `maintainer.html?hash=${fingerprint}`;
}

// The deliberate second exit for someone who found the gap but doesn't
// want the responsibility -- see ROADMAP.md's Persona A design. Copies
// this exact page's own URL (the one already carrying this manual's
// context) so whoever it's sent to lands on the same offer.
document.getElementById("outLink")?.addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    await navigator.clipboard.writeText(location.href);
    document.getElementById("outConfirm").classList.add("show");
  } catch (err) {
    appendLog(`Couldn't copy the link automatically -- copy it from the address bar instead.`);
  }
});

pdfInput.addEventListener("change", async () => {
  const file = pdfInput.files[0];
  if (!file) return;
  pdfBytes = new Uint8Array(await file.arrayBuffer());
  registryResolution = null;
  renderContributorList([]);
  log.textContent = "";
  setProgress(0, 1, "fingerprinting...");
  appendLog(`Loaded ${file.name} (${(pdfBytes.length / 1e6).toFixed(1)} MB)`);

  pdfFingerprint = await sha256Hex(pdfBytes.buffer);
  appendLog(`SHA-256: ${pdfFingerprint}`);
  appendLog("Computed locally -- nothing was uploaded.");

  setProgress(0, 1, "checking the registry...");
  appendLog(`\nChecking the registry...`);
  try {
    registryResolution = await resolveViaRegistry(pdfFingerprint, DEFAULT_REGISTRY_URL,
      (i, total, name) => setProgress(i, total, `fetching ${name} (${i}/${total})`));
    const { entry, manifest, photos } = registryResolution;
    appendLog(`Found: ${entry.vehicle_display_name} (${entry.edition_id}) -> ${entry.repo_url}`);
    appendLog(`Manifest: ${manifest.entries.length} indexed figures, ${photos.size} photo(s) available.`);
    renderContributorList(computeContributorCounts(photos));
    setProgress(1, 1, "ready to patch");
  } catch (err) {
    appendLog(`Registry resolution failed: ${err.message}`);
    setProgress(0, 1, "registry lookup failed");
    if (err.reason === "not_registered") showMaintainerCta(pdfFingerprint);
  }
  maybeEnable();
});

function maybeEnable() {
  patchBtn.disabled = !(pdfBytes && registryResolution);
}

async function readEmbeddedState(doc) {
  // @cantoo/pdf-lib has no way to remove/replace an attachment, so
  // writeEmbeddedState's repeated attach() calls accumulate duplicates
  // by the same name rather than overwriting (verified directly).
  // Always take the LAST match, the most recent write.
  try {
    const atts = await doc.getAttachments();
    const matches = atts.filter(a => a.name === EMBED_NAME);
    if (matches.length === 0) return null;
    return JSON.parse(new TextDecoder().decode(matches[matches.length - 1].data));
  } catch (e) {
    return null;
  }
}

async function writeEmbeddedState(doc, state) {
  await doc.attach(new TextEncoder().encode(JSON.stringify(state, null, 2)), EMBED_NAME, {
    mimeType: "application/json",
    description: "Blayde Manual identity/version record -- do not edit",
  });
}

function nextVersion(priorState) {
  if (!priorState) return "1.0";
  const [major, minor] = (priorState.version || "1.0").split(".");
  const nextMinor = parseInt(minor, 10) + 1;
  return isNaN(nextMinor) ? "1.1" : `${major}.${nextMinor}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function drawImageAt(page, image, pageGeometry, pixelBbox) {
  const { composite_width_px, composite_height_px, page_width_pt, page_height_pt } = pageGeometry;
  const scaleX = composite_width_px / page_width_pt;
  const scaleY = composite_height_px / page_height_pt;
  const [x0, y0, x1, y1] = pixelBbox;
  const ptX0 = x0 / scaleX, ptY0Top = y0 / scaleY, ptX1 = x1 / scaleX, ptY1Top = y1 / scaleY;
  const width = ptX1 - ptX0, height = ptY1Top - ptY0Top;
  const yBottom = page_height_pt - ptY1Top;
  page.drawImage(image, { x: ptX0, y: yBottom, width, height });
  return { x: ptX0, y: yBottom, width, height };
}

// Contributor credit, drawn fresh on every patch from the photo's own
// filename convention -- never burned into the stored photo file
// itself (direct request: styling/placement needs to stay changeable
// later without anyone re-uploading anything). A flat horizontal tag
// flush in the photo's own bottom-right corner -- NOT a diagonal
// ribbon: these photos exist for instructional purposes and a
// diagonal cut eats into the image well past the corner itself,
// which risks covering the actual subject matter. A flat corner tag
// only ever touches the corner. Skipped entirely below a size floor
// where a legible tag has no room to exist without becoming the
// dominant thing in a small photo.
async function drawCreditTab(page, box, contributor, font) {
  if (!contributor || box.width < 60 || box.height < 40) return;
  const label = `@${contributor}`;
  const fontSize = Math.max(7, Math.min(11, box.height * 0.05));
  const padX = fontSize * 0.6;
  const tabH = fontSize + padX;
  const measuredWidth = font.widthOfTextAtSize(label, fontSize);
  const maxTabW = box.width * 0.6;
  const tabW = Math.min(measuredWidth + padX * 2, maxTabW);
  // Shrinks further only if even the capped tab width can't fit the
  // label -- a real check against measured text width, not a guess.
  const finalSize = measuredWidth + padX * 2 > maxTabW ? fontSize * ((maxTabW - padX * 2) / measuredWidth) : fontSize;
  const tabX = box.x + box.width - tabW;
  const tabY = box.y;
  page.drawRectangle({ x: tabX, y: tabY, width: tabW, height: tabH, color: RED });
  page.drawText(label, {
    x: tabX + padX, y: tabY + tabH * 0.28, size: finalSize, font, color: WHITE, maxWidth: tabW - padX * 2,
  });
}

// ---- in-PDF contribute markers -- the wireframed "footer note" piece,
// made real: a still-missing procedure gets a scannable QR (+ short URL,
// for anyone typing it by hand) drawn where its photo would have gone,
// instead of staying blank. Someone flipping through their own patched
// manual later -- on the bike, not at a computer -- sees exactly where
// they could help, no need to come back to the site first. Points at
// contribute.html?repo=...&procedure=..., a lightweight page scoped to
// that one procedure -- see contribute.html for what happens there.
function contributeUrl(repoUrl, procedureId) {
  return new URL(`contribute.html?repo=${encodeURIComponent(repoUrl)}&procedure=${encodeURIComponent(procedureId)}`, location.href).href;
}

// qrcode.js (vendored) only emits a GIF data URL -- pdf-lib embeds PNG/
// JPG, not GIF -- so this round-trips through a canvas to get real PNG
// bytes. Fully local, no network.
async function qrPngBytes(text, cellSize) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const gifDataUrl = qr.createDataURL(cellSize, 0);
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = gifDataUrl; });
  const canvas = document.createElement("canvas");
  canvas.width = img.width; canvas.height = img.height;
  canvas.getContext("2d").drawImage(img, 0, 0);
  const pngDataUrl = canvas.toDataURL("image/png");
  const binary = atob(pngDataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Makes `rect` (in the same page-point space as drawRectangle/drawText)
// tappable in a real PDF viewer -- confirmed working via a standalone
// Node reproduction outside the browser: pdf-lib compresses small
// objects like this into a Flate-compressed object stream (ObjStm) by
// default, so a plain text/regex search over saved PDF bytes will
// never find it even when the annotation is really there. Verified for
// real by reloading a saved PDF through pdf-lib and resolving the
// Annots ref, not by text-searching the output.
function addLinkAnnotation(page, rect, url) {
  const ctx = page.doc.context;
  const link = ctx.register(
    ctx.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Link"),
      Rect: ctx.obj([rect.x, rect.y, rect.x + rect.width, rect.y + rect.height]),
      Border: ctx.obj([0, 0, 0]),
      A: ctx.obj({ Type: PDFName.of("Action"), S: PDFName.of("URI"), URI: PDFString.of(url) }),
    })
  );
  const existing = page.node.lookup(PDFName.of("Annots"), PDFArray);
  if (existing) existing.push(link);
  else page.node.set(PDFName.of("Annots"), ctx.obj([link]));
}

async function drawContributeMarker(doc, page, pageGeometry, pixelBbox, url, font) {
  // Same pixel_bbox -> PDF-point math as drawImageAt, since this box is
  // exactly where a real photo would have been drawn.
  const { composite_width_px, composite_height_px, page_width_pt, page_height_pt } = pageGeometry;
  const scaleX = composite_width_px / page_width_pt, scaleY = composite_height_px / page_height_pt;
  const [px0, py0, px1, py1] = pixelBbox;
  const ptX0 = px0 / scaleX, ptY1Top = py1 / scaleY, ptX1 = px1 / scaleX, ptY0Top = py0 / scaleY;
  const boxW = ptX1 - ptX0, boxH = ptY1Top - ptY0Top;
  const boxY = page_height_pt - ptY1Top;

  page.drawRectangle({
    x: ptX0, y: boxY, width: boxW, height: boxH,
    borderColor: STEEL, borderWidth: 0.75, borderDashArray: [3, 2],
  });

  // QR sits in the box's own bottom-right corner (matching the credit
  // tab's placement convention for contributed photos), leaving the
  // top-left free for the caption/URL text below.
  const qrSize = Math.max(24, Math.min(72, boxW * 0.9, boxH * 0.75));
  const margin = Math.min(4, boxW * 0.05, boxH * 0.08);
  if (boxW >= 20 && boxH >= 20) {
    const qrBytes = await qrPngBytes(url, 4);
    const qrImage = await doc.embedPng(qrBytes);
    const qrX = ptX0 + boxW - qrSize - margin;
    const qrY = boxY + margin;
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  }
  if (boxH >= 44 && font) {
    page.drawText("photo needed -- scan or tap to add one", {
      x: ptX0 + 4, y: boxY + boxH - 12, size: Math.min(7, boxW / 22), font, color: STEEL, maxWidth: boxW - 8,
    });
    // A URL has no spaces to wrap on, so drawText's maxWidth can't stop
    // it running under the QR the way word-wrap does for the caption
    // above -- shrink the font to actually fit the available width
    // instead (same measure-then-scale approach as the credit tab).
    const urlAreaWidth = boxW - qrSize - margin - 8;
    const urlBaseSize = Math.min(6, boxW / 30);
    const urlMeasured = font.widthOfTextAtSize(url, urlBaseSize);
    const urlSize = urlMeasured > urlAreaWidth ? urlBaseSize * (urlAreaWidth / urlMeasured) : urlBaseSize;
    if (urlAreaWidth > 20) {
      page.drawText(url, { x: ptX0 + 4, y: boxY + 4, size: urlSize, font, color: STEEL });
    }
  }
  // Real clickable link over the whole box -- not just the QR image --
  // so tapping anywhere in a PDF viewer (not only scanning with a
  // second device) opens the contribute page directly.
  addLinkAnnotation(page, { x: ptX0, y: boxY, width: boxW, height: boxH }, url);
}

async function buildCoverPage(doc, { vehicleDisplayName, version, nPatched, totalFigures, repoUrl }) {
  const page = doc.insertPage(0, [612, 792]);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: BLACK });
  page.drawRectangle({ x: 0, y: 782, width: 612, height: 10, color: RED });
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 10, color: RED });

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helv = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText("BLAYDE", { x: 56, y: 692, size: 34, font: bold, color: WHITE });
  page.drawText("MANUAL", { x: 56, y: 656, size: 34, font: bold, color: RED });
  page.drawText((vehicleDisplayName || "").toUpperCase(), { x: 250, y: 682, size: 14, font: bold, color: WHITE, maxWidth: 300 });
  page.drawText("COMMUNITY-MAINTAINED SERVICE MANUAL", {
    x: 250, y: 662, size: 8, font: helv, color: STEEL,
  });
  page.drawLine({ start: { x: 56, y: 644 }, end: { x: 556, y: 644 }, thickness: 1, color: STEEL });

  const stats = [
    ["VERSION", version],
    ["PHOTOS CONTRIBUTED", `${nPatched} / ${totalFigures}`],
    ["GENERATED", todayStr()],
  ];
  let x = 56;
  for (const [label, value] of stats) {
    page.drawRectangle({ x, y: 566, width: 4, height: 26, color: RED });
    page.drawText(label, { x: x + 14, y: 584, size: 8, font: helv, color: STEEL });
    page.drawText(String(value), { x: x + 14, y: 568, size: 13, font: bold, color: WHITE });
    x += 170;
  }

  page.drawLine({ start: { x: 56, y: 540 }, end: { x: 556, y: 540 }, thickness: 0.5, color: STEEL });
  page.drawText("Source repo:", { x: 56, y: 518, size: 9, font: helv, color: STEEL });
  page.drawText(repoUrl || "(unknown)", { x: 56, y: 504, size: 10, font: helv, color: RED });

  const disclaimer = "Independent, community-run documentation project. Not affiliated with, " +
    "endorsed by, or sponsored by the original manufacturer. This is informational, community-sourced " +
    "documentation. Use it at your own risk, and verify safety-critical specs (torque, brake/fuel " +
    "system procedures) against an authoritative source before relying on them. This document was " +
    "generated entirely in-browser. Nothing about it was uploaded anywhere.";
  page.drawText(disclaimer, { x: 56, y: 90, size: 8, font: helv, color: STEEL, maxWidth: 500, lineHeight: 11 });

  return page;
}

async function patchViaRegistry(doc, priorState, priorityList) {
  const { entry, manifest, photos } = registryResolution;
  const geometry = manifest.page_geometry || {};
  const activeEntries = (manifest.entries || []).filter(e =>
    e.status !== "excluded_false_positive" && (e.content_type === undefined || e.content_type === null || e.content_type === "photo"));

  const patchedFigures = { ...((priorState && priorState.patched_figures) || {}) };
  let nPatched = 0, nSkippedUnchanged = 0, nNoPhoto = 0;
  const helvFont = await doc.embedFont(StandardFonts.Helvetica);
  const creditFont = await doc.embedFont(StandardFonts.HelveticaBold);

  // Group every candidate photo by procedure_id -- there can be more
  // than one (alternate angles, multiple contributors), never just the
  // last one seen. See parsePhotoFilename / pickPhoto above.
  const photosByProcedure = new Map();
  for (const [filename, bytes] of photos) {
    const { procedureId, contributor } = parsePhotoFilename(filename);
    if (!photosByProcedure.has(procedureId)) photosByProcedure.set(procedureId, []);
    photosByProcedure.get(procedureId).push({ filename, bytes, contributor });
  }

  let i = 0;
  for (const e of activeEntries) {
    i++;
    setProgress(i, activeEntries.length, `checking ${e.procedure_id}`);
    const candidates = photosByProcedure.get(e.procedure_id);
    if (!candidates || candidates.length === 0) {
      nNoPhoto++;
      const missingGeo = geometry[String(e.page)];
      if (missingGeo && e.pixel_bbox) {
        try {
          const page = doc.getPage(e.page - 1);
          const url = contributeUrl(entry.repo_url, e.procedure_id);
          await drawContributeMarker(doc, page, missingGeo, e.pixel_bbox, url, helvFont);
        } catch (err) {
          appendLog(`  couldn't draw contribute marker for ${e.procedure_id}: ${err.message}`);
        }
      }
      continue;
    }
    const photo = pickPhoto(candidates, priorityList);

    const photoHash = await sha256HexShort(photo.bytes);
    const prior = patchedFigures[e.procedure_id];
    if (prior && prior.photo_sha256_16 === photoHash) {
      nSkippedUnchanged++;
      continue;
    }

    const geo = geometry[String(e.page)];
    if (!geo) continue;

    // One malformed/corrupted photo (a bad file from a compromised repo,
    // or just a bad upload that slipped past review) must not abort the
    // whole batch -- every other procedure's valid photo still deserves
    // to get patched. Isolate per-photo, log and move on.
    try {
      const isPng = photo.filename.toLowerCase().endsWith(".png");
      const image = isPng ? await doc.embedPng(photo.bytes) : await doc.embedJpg(photo.bytes);
      const page = doc.getPage(e.page - 1);
      const box = drawImageAt(page, image, geo, e.pixel_bbox);
      await drawCreditTab(page, box, photo.contributor, creditFont);
      patchedFigures[e.procedure_id] = {
        photo_sha256_16: photoHash, patched_at: todayStr(),
        contributor: photo.contributor,
      };
      nPatched++;
    } catch (err) {
      appendLog(`  skipped ${photo.filename}: ${err.message}`);
      nNoPhoto++;
    }
  }

  appendLog(`Patched ${nPatched} new/changed, ${nSkippedUnchanged} already up to date, ${nNoPhoto} still need a photo.`);
  return { patchedFigures, totalFigures: activeEntries.length, vehicleDisplayName: entry.vehicle_display_name, repoUrl: entry.repo_url, sourceIdentifier: manifest.source_markers?.source_identifier };
}

patchBtn.addEventListener("click", async () => {
  patchBtn.disabled = true;
  appendLog("\nPatching, entirely client-side...");
  try {
    const doc = await PDFDocument.load(pdfBytes);
    const priorState = await readEmbeddedState(doc);
    if (priorState) {
      appendLog(`Recognized existing Blayde Manual file: v${priorState.version}. Applying only what's new or changed.`);
      doc.removePage(0); // finding valid state IS the proof page 0 is our cover
    } else {
      appendLog("No embedded state found -- treating as a pristine input.");
    }

    const priorityList = getPriorityList();
    if (priorityList.length) appendLog(`Contributor priority: ${priorityList.join(" > ")} (random otherwise)`);

    const result = await patchViaRegistry(doc, priorState, priorityList);

    const version = nextVersion(priorState);
    const nPatchedTotal = Object.keys(result.patchedFigures).length;
    setProgress(1, 1, "building cover page...");
    await buildCoverPage(doc, {
      vehicleDisplayName: result.vehicleDisplayName, version,
      nPatched: nPatchedTotal, totalFigures: result.totalFigures, repoUrl: result.repoUrl,
    });

    await writeEmbeddedState(doc, {
      source_identifier: result.sourceIdentifier,
      repo_url: result.repoUrl,
      version,
      generated_at: new Date().toISOString(),
      patched_figures: result.patchedFigures,
    });

    setProgress(1, 1, "saving...");
    const outBytes = await doc.save();
    appendLog(`v${version}: patched PDF built in-memory (${(outBytes.length / 1e6).toFixed(1)} MB)`);
    setProgress(1, 1, `done -- v${version}`);

    const blob = new Blob([outBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BlaydeManual_v${version}.pdf`;
    a.click();
    appendLog("Download triggered. Feed this file back in as the input to test incremental re-patching.");
  } catch (err) {
    appendLog(`ERROR: ${err.message}`);
    console.error(err);
  }
  patchBtn.disabled = false;
});

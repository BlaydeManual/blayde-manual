// Blayde Manual -- org-level "Approve New Vehicles" review.
// Reuses the *pattern* proven in indexer-review.js (paginated,
// page-grouped gallery; live-cropped thumbnails from a cached rendered
// PDF page) without sharing its module-level state (reviewManifest,
// selectedPdfDoc, reviewPageCache, ...) -- two review sessions open on
// different portal tabs at once must not be able to clobber each other.
// See ROADMAP.md "Maintainer Portal" for the full reasoning.
//
// Read-only for everyone: this view never edits candidates (that
// already happened in the submitter's own Stage 3 review) -- it exists
// so any signed-in maintainer can see what's pending (useful before
// starting to index a vehicle that's already in the queue) and so an
// org maintainer can approve or reject the submission as a whole. Mock
// data standing in for what a real pending-registrations API would
// return, same convention as review-panel.js's MOCK_PRS.

const MOCK_PENDING_VEHICLES = [
  {
    vehicle_slug: "yamaha-yz250f-2003-2005",
    edition_id: "OEM",
    submitted_by: "dirtbike_dana",
    submitted_at: "2026-08-20",
    pdf_sha256: "9f1c2a...(mock)",
    manifest: {
      vehicle: "yamaha-yz250f-2003-2005",
      page_count: 6,
      source_markers: { source_identifier: "https://www.manualslib.com/manual/000000/Yamaha-Yz250f.html" },
      entries: [
        { procedure_id: "p001_specifications_fig1", page: 1, section_heading: "SPECIFICATIONS", pixel_bbox: [120, 400, 900, 1100], contributed_photo_path: "images/yamaha-yz250f-2003-2005/p001_specifications_fig1/" },
        { procedure_id: "p002_periodic-maintenance_fig1", page: 2, section_heading: "PERIODIC MAINTENANCE", pixel_bbox: [200, 300, 1000, 900], contributed_photo_path: "images/yamaha-yz250f-2003-2005/p002_periodic-maintenance_fig1/" },
        { procedure_id: "p003_engine-removal_fig1", page: 3, section_heading: "ENGINE REMOVAL", pixel_bbox: [150, 350, 950, 1050], contributed_photo_path: "images/yamaha-yz250f-2003-2005/p003_engine-removal_fig1/" },
      ],
      page_geometry: {
        "1": { composite_width_px: 1700, composite_height_px: 2200, page_width_pt: 612, page_height_pt: 792 },
        "2": { composite_width_px: 1700, composite_height_px: 2200, page_width_pt: 612, page_height_pt: 792 },
        "3": { composite_width_px: 1700, composite_height_px: 2200, page_width_pt: 612, page_height_pt: 792 },
      },
    },
    completeness: { total: 58, touched: 41, pct: 71 },
  },
  // A genuinely new edition of an already-registered vehicle (see
  // MOCK_REGISTRY in review-panel.js -- suzuki-sv650-1999-2002 already
  // has OEM + Haynes). Exercises the "this vehicle already has a repo"
  // path, not just the brand-new-vehicle one.
  {
    vehicle_slug: "suzuki-sv650-1999-2002",
    edition_id: "Chilton",
    submitted_by: "wrench_kate",
    submitted_at: "2026-08-24",
    pdf_sha256: "7c3af0...(mock)",
    manifest: {
      vehicle: "suzuki-sv650-1999-2002",
      page_count: 4,
      source_markers: { source_identifier: "https://www.chiltonlibrary.com/suzuki-sv650" },
      entries: [
        { procedure_id: "p001_valve-clearance_fig1", page: 1, section_heading: "VALVE CLEARANCE", pixel_bbox: [140, 380, 920, 1080], contributed_photo_path: "images/suzuki-sv650-1999-2002/chilton/p001_valve-clearance_fig1/" },
        { procedure_id: "p002_carb-sync_fig1", page: 2, section_heading: "CARBURETOR SYNC", pixel_bbox: [180, 320, 980, 960], contributed_photo_path: "images/suzuki-sv650-1999-2002/chilton/p002_carb-sync_fig1/" },
      ],
      page_geometry: {
        "1": { composite_width_px: 1700, composite_height_px: 2200, page_width_pt: 612, page_height_pt: 792 },
        "2": { composite_width_px: 1700, composite_height_px: 2200, page_width_pt: 612, page_height_pt: 792 },
      },
    },
    completeness: { total: 22, touched: 18, pct: 82 },
  },
];

const ORG_CHUNK_SIZE = 10;
let orgManifest = null;
let orgPdfDoc = null;
let orgPageCache = {};
let orgChunkIdx = 0;
let orgCurrentEntry = null;

function initApproveTab() {
  renderPendingList();
}

function renderPendingList() {
  const wrap = document.getElementById("pendingList");
  wrap.innerHTML = "";
  const existingSlugs = new Set((typeof MOCK_REGISTRY !== "undefined" ? MOCK_REGISTRY.vehicles : []).map((v) => v.vehicle_slug));
  MOCK_PENDING_VEHICLES.forEach((v, idx) => {
    const isNewEdition = existingSlugs.has(v.vehicle_slug);
    const row = document.createElement("div");
    row.className = "pr-row";
    row.innerHTML = `
      <div>
        <div class="pr-title">${v.vehicle_slug} -- ${v.edition_id}${isNewEdition ? ` <span class="sub" style="color:#ffcc66;">(new edition, vehicle exists)</span>` : ""}</div>
        <div class="pr-meta">submitted by @${v.submitted_by} on ${v.submitted_at} &middot; ${v.manifest.page_count} pages &middot; ${v.completeness.touched}/${v.completeness.total} reviewed (${v.completeness.pct}%)</div>
      </div>
      <button data-idx="${idx}">Review</button>
    `;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll("button[data-idx]").forEach((btn) => {
    btn.addEventListener("click", () => openPendingVehicle(parseInt(btn.dataset.idx, 10)));
  });
}

function openPendingVehicle(idx) {
  // Indexed, not keyed by vehicle_slug -- now that a vehicle can have
  // more than one edition in the queue at once, vehicle_slug alone
  // isn't unique across pending submissions.
  const entry = MOCK_PENDING_VEHICLES[idx];
  orgCurrentEntry = entry;
  orgManifest = entry.manifest;
  orgPdfDoc = null;
  orgPageCache = {};
  orgChunkIdx = 0;
  document.getElementById("orgReviewArea").classList.add("open");
  document.getElementById("orgReviewTitle").textContent = `${entry.vehicle_slug} -- ${entry.edition_id}`;
  document.getElementById("orgReviewMeta").textContent =
    `submitted by @${entry.submitted_by} -- ${entry.completeness.touched}/${entry.completeness.total} candidates reviewed by the submitter (${entry.completeness.pct}%)`;

  const sourceUrl = entry.manifest.source_markers?.source_identifier;
  const sourceLink = document.getElementById("orgSourceLink");
  sourceLink.href = sourceUrl || "#";
  sourceLink.textContent = sourceUrl || "(no source URL on this submission -- shouldn't happen, flag it)";

  // The comparison this whole thing exists for: "this vehicle already
  // has N documents -- does this new one actually fit, or is it a
  // near-duplicate of one already there?" Read from the same
  // MOCK_REGISTRY review-panel.js already treats as the source of
  // truth for what's actually registered.
  const existing = (typeof MOCK_REGISTRY !== "undefined" ? MOCK_REGISTRY.vehicles : [])
    .filter((v) => v.vehicle_slug === entry.vehicle_slug);
  const existingWrap = document.getElementById("orgExistingEditions");
  if (existing.length) {
    document.getElementById("orgExistingEditionsSummary").textContent =
      `This vehicle already has ${existing.length} document${existing.length === 1 ? "" : "s"}. Does "${entry.edition_id}" actually fit, or is it the same as one of these?`;
    document.getElementById("orgExistingEditionsList").innerHTML = existing
      .map((v) => `<div class="sub" style="margin:2px 0;">&middot; <b style="color:var(--text);">${v.edition_id}</b> -- ${v.repo_url}</div>`)
      .join("");
    existingWrap.style.display = "block";
    document.getElementById("orgApproveBtn").textContent = "Approve & add edition";
  } else {
    existingWrap.style.display = "none";
    document.getElementById("orgApproveBtn").textContent = "Approve & create repo";
  }

  document.getElementById("orgGallery").innerHTML = "";
  document.getElementById("orgPdfPicker").value = "";
  const isOrg = MOCK_MAINTAINER.isOrgMaintainer;
  document.getElementById("orgApproveBtn").disabled = true; // stays disabled until a PDF is loaded, even for org maintainers
  document.getElementById("orgRejectBtn").disabled = !isOrg;
  document.getElementById("orgReadOnlyNote").style.display = isOrg ? "none" : "block";
}

document.getElementById("orgPdfPicker").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !orgCurrentEntry) return;
  const buf = await file.arrayBuffer();
  orgPdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  orgChunkIdx = 0;
  renderOrgGallery();
  if (MOCK_MAINTAINER.isOrgMaintainer) document.getElementById("orgApproveBtn").disabled = false;
});

function orgSortedEntries() {
  return [...orgManifest.entries].sort((a, b) => a.page - b.page || a.pixel_bbox[1] - b.pixel_bbox[1]);
}

function renderOrgGallery() {
  const wrap = document.getElementById("orgGallery");
  wrap.innerHTML = "";
  const all = orgSortedEntries();
  const chunkCount = Math.max(1, Math.ceil(all.length / ORG_CHUNK_SIZE));
  orgChunkIdx = Math.min(orgChunkIdx, chunkCount - 1);
  const start = orgChunkIdx * ORG_CHUNK_SIZE;
  const chunk = all.slice(start, start + ORG_CHUNK_SIZE);

  const byPage = {};
  chunk.forEach((e) => { (byPage[e.page] = byPage[e.page] || []).push(e); });
  Object.keys(byPage).map(Number).sort((a, b) => a - b).forEach((pageNum) => {
    const group = document.createElement("div");
    group.className = "page-group";
    group.innerHTML = `<h3>Page ${pageNum}</h3><div class="figs"></div>`;
    const figsWrap = group.querySelector(".figs");
    byPage[pageNum].forEach((e) => figsWrap.appendChild(buildOrgFigCard(e)));
    wrap.appendChild(group);
  });

  document.getElementById("orgPageLabel").textContent =
    all.length ? `${start + 1}-${Math.min(start + ORG_CHUNK_SIZE, all.length)} of ${all.length} (page ${orgChunkIdx + 1}/${chunkCount})` : "0 of 0";
  document.getElementById("orgPrevBtn").disabled = orgChunkIdx === 0;
  document.getElementById("orgNextBtn").disabled = orgChunkIdx >= chunkCount - 1;
}

document.getElementById("orgPrevBtn").addEventListener("click", () => {
  if (orgChunkIdx > 0) { orgChunkIdx--; renderOrgGallery(); }
});
document.getElementById("orgNextBtn").addEventListener("click", () => {
  orgChunkIdx++; renderOrgGallery();
});

// Read-only -- no delete/edit button, this view only ever looks.
function buildOrgFigCard(entry) {
  const card = document.createElement("div");
  card.className = "fig";
  card.innerHTML = `<img alt="${entry.procedure_id}"><div class="id">${entry.procedure_id}</div>`;
  refreshOrgThumbnail(card.querySelector("img"), entry);
  return card;
}

async function getOrgPage(pageNum, scale = 2.5) {
  if (orgPageCache[pageNum]) return orgPageCache[pageNum];
  const page = await orgPdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  orgPageCache[pageNum] = { canvas, scaleUsed: scale };
  return orgPageCache[pageNum];
}

async function refreshOrgThumbnail(imgEl, entry) {
  try {
    const geo = orgManifest.page_geometry[String(entry.page)];
    const { canvas } = await getOrgPage(entry.page);
    const sx = canvas.width / geo.composite_width_px;
    const sy = canvas.height / geo.composite_height_px;
    const [x0, y0, x1, y1] = entry.pixel_bbox;
    const w = Math.max(1, Math.round((x1 - x0) * sx)), h = Math.max(1, Math.round((y1 - y0) * sy));
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    out.getContext("2d").drawImage(canvas, x0 * sx, y0 * sy, w, h, 0, 0, w, h);
    imgEl.src = out.toDataURL("image/jpeg", 0.85);
  } catch (e) { /* leave blank -- picked PDF might not match the submission */ }
}

// The approval action branches on whether the vehicle already exists
// (see ROADMAP.md's multi-manual correction, 2026-08-25) -- the org
// review itself doesn't change, but a new edition merges into the
// existing repo and joins the existing maintainer pool instead of
// creating a new repo and a new first maintainer.
document.getElementById("orgApproveBtn").addEventListener("click", () => {
  if (!MOCK_MAINTAINER.isOrgMaintainer) return;
  const existing = (typeof MOCK_REGISTRY !== "undefined" ? MOCK_REGISTRY.vehicles : [])
    .some((v) => v.vehicle_slug === orgCurrentEntry.vehicle_slug);
  log_org(`[mock] APPROVE ${orgCurrentEntry.vehicle_slug} -- ${orgCurrentEntry.edition_id}:`);
  if (existing) {
    log_org(`  1. merge this edition into: ${orgCurrentEntry.vehicle_slug} (no new repo created)`);
    log_org(`  2. POST /repos/BlaydeManual/registry/.../registry.json -- add edition_id entry, status: approved`);
    log_org(`  3. add @${orgCurrentEntry.submitted_by} as a maintainer of the whole vehicle repo, joining the existing pool`);
  } else {
    log_org(`  1. create the vehicle repo, fork the scaffold`);
    log_org(`  2. POST /repos/BlaydeManual/registry/.../registry.json -- add entry, status: approved`);
    log_org(`  3. notify @${orgCurrentEntry.submitted_by} they're now the first maintainer`);
  }
});
document.getElementById("orgRejectBtn").addEventListener("click", () => {
  if (!MOCK_MAINTAINER.isOrgMaintainer) return;
  log_org(`[mock] REJECT ${orgCurrentEntry.vehicle_slug} -- ${orgCurrentEntry.edition_id}: notify @${orgCurrentEntry.submitted_by} with a reason`);
});

function log_org(msg) {
  const el = document.getElementById("orgLog");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

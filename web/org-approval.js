// Blayde Manual -- org-level "Approve New Vehicles" review. Real as of
// this pass: the pending queue, the three verification checks, and the
// approve action itself all talk to the Worker's real endpoints
// (/pending-vehicles, /approve-vehicle), which use the GitHub App's own
// installation token to read private repos and perform the actual
// privileged write -- never this page's own signed-in token, which only
// ever proves a real person is asking. See ROADMAP.md's GitHub App
// migration entry for the full reasoning, and auth-worker/src/index.js
// for the checks themselves (kept server-side deliberately: the UI's
// pre-check and the real approve action run the EXACT same code via
// dry_run, so "Approve is enabled" and "Approve actually works" can
// never disagree).
//
// Reject stays a mock/logged action for now, deliberately -- unlike
// approve, a real reject would mean deleting a real GitHub repo, which
// is a genuinely destructive, hard-to-reverse action not in scope for
// this pass. A real "leave it private and notify the submitter" or "ask
// the submitter to fix and resubmit" reject flow is real, future work.
//
// Reuses the *pattern* proven in indexer-review.js (paginated,
// page-grouped gallery; live-cropped thumbnails from a cached rendered
// PDF page) without sharing its module-level state (reviewManifest,
// selectedPdfDoc, reviewPageCache, ...) -- two review sessions open on
// different portal tabs at once must not be able to clobber each other.

const ORG_CHUNK_SIZE = 10;
let orgPending = []; // [{name, html_url, manifest, submitted_by, submitted_at}] from /pending-vehicles
let orgManifest = null;
let orgPdfDoc = null;
let orgPdfIsPatchedOutput = false;
let orgPageCache = {};
let orgChunkIdx = 0;
let orgCurrentEntry = null;

function initApproveTab() {
  updateOrgSignInUI();
}

// Separate from the page's main sign-in (classic OAuth) -- viewing and
// approving both read private BlaydeManual repos, which needs the
// GitHub App session specifically, same pattern as indexer-review.js's
// submit gate.
function updateOrgSignInUI() {
  const signedInToApp = !!BlaydeAuth.getAppSession();
  document.getElementById("orgAppSignInPrompt").style.display = signedInToApp ? "none" : "block";
  document.getElementById("pendingListCard").style.display = signedInToApp ? "block" : "none";
  if (signedInToApp) renderPendingList();
}
document.getElementById("orgAppSignInBtn").addEventListener("click", async () => {
  try {
    await BlaydeAuth.signInWithGitHubApp();
    updateOrgSignInUI();
  } catch (e) {
    log_org(`Sign-in failed: ${e.message}`);
  }
});

async function fetchPendingVehicles() {
  const session = BlaydeAuth.getAppSession();
  const resp = await fetch(`${BlaydeAuth.AUTH_WORKER_URL}pending-vehicles`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok || result.error) throw new Error(result.error || `Couldn't load the pending list (${resp.status}).`);
  return result.pending;
}

async function renderPendingList() {
  const wrap = document.getElementById("pendingList");
  wrap.innerHTML = `<p class="sub">Loading...</p>`;
  try {
    orgPending = await fetchPendingVehicles();
  } catch (e) {
    wrap.innerHTML = `<p class="sub" style="color:#ff6b6b;">${e.message}</p>`;
    return;
  }
  wrap.innerHTML = "";
  if (!orgPending.length) {
    wrap.innerHTML = `<p class="sub">Nothing pending right now.</p>`;
    return;
  }
  // Existing editions comes from the real, public registry.json -- same
  // read every other real page already uses, no auth needed for this part.
  const registryData = await loadRegistry(CANONICAL_REGISTRY_URL).catch(() => ({ vehicles: [] }));
  const existingSlugs = new Set((registryData.vehicles || []).map((v) => v.vehicle_slug));
  orgPending.forEach((v, idx) => {
    const isNewEdition = existingSlugs.has(v.manifest.vehicle);
    const total = v.manifest.entries.length;
    const touched = v.manifest.entries.filter((e) => e._touched || e._seen).length;
    const pct = total ? Math.round((touched / total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "pr-row";
    row.innerHTML = `
      <div>
        <div class="pr-title">${v.manifest.vehicle} -- ${v.manifest.edition_id || "(edition not set)"}${isNewEdition ? ` <span class="sub" style="color:#ffcc66;">(new edition, vehicle exists)</span>` : ""}</div>
        <div class="pr-meta">submitted by ${v.submitted_by ? `@${v.submitted_by}` : "(unknown -- see verification below)"}${v.submitted_at ? ` on ${v.submitted_at.slice(0, 10)}` : ""} &middot; ${total} candidates, ${touched}/${total} reviewed (${pct}%)</div>
      </div>
      <button data-idx="${idx}">Review</button>
    `;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll("button[data-idx]").forEach((btn) => {
    btn.addEventListener("click", () => openPendingVehicle(parseInt(btn.dataset.idx, 10)));
  });
}

async function openPendingVehicle(idx) {
  const entry = orgPending[idx];
  orgCurrentEntry = entry;
  orgManifest = entry.manifest;
  orgPdfDoc = null;
  orgPdfIsPatchedOutput = false;
  orgPageCache = {};
  orgChunkIdx = 0;
  // Clears any leftover inline display:none from a previous approval's
  // summary swap -- an inline style outranks the .open class's own
  // display:block, so without this a second pending vehicle would stay
  // stuck hidden after the first one was approved.
  document.getElementById("orgReviewArea").style.display = "";
  document.getElementById("orgApproveSummaryCard").style.display = "none";
  document.getElementById("orgReviewArea").classList.add("open");
  document.getElementById("orgReviewTitle").textContent = `${entry.manifest.vehicle} -- ${entry.manifest.edition_id || "(edition not set)"}`;
  const total = entry.manifest.entries.length;
  const touched = entry.manifest.entries.filter((e) => e._touched || e._seen).length;
  document.getElementById("orgReviewMeta").textContent =
    `${entry.submitted_by ? `submitted by @${entry.submitted_by}` : "submitter unknown"} -- ${touched}/${total} candidates reviewed by the submitter`;

  const sourceUrl = entry.manifest.source_markers?.source_identifier;
  const sourceLink = document.getElementById("orgSourceLink");
  sourceLink.href = sourceUrl || "#";
  sourceLink.textContent = sourceUrl || "(no source URL on this submission -- shouldn't happen, flag it)";

  const registryData = await loadRegistry(CANONICAL_REGISTRY_URL).catch(() => ({ vehicles: [] }));
  const existing = (registryData.vehicles || []).filter((v) => v.vehicle_slug === entry.manifest.vehicle);
  const existingWrap = document.getElementById("orgExistingEditions");
  if (existing.length) {
    document.getElementById("orgExistingEditionsSummary").textContent =
      `This vehicle already has ${existing.length} document${existing.length === 1 ? "" : "s"}. Does "${entry.manifest.edition_id}" actually fit, or is it the same as one of these?`;
    document.getElementById("orgExistingEditionsList").innerHTML = existing
      .map((v) => `&middot; <b style="color:var(--text);">${v.edition_id}</b> -- ${v.repo_url}`)
      .join("<br>");
    existingWrap.style.display = "block";
    document.getElementById("orgApproveBtn").textContent = "Approve & add edition";
  } else {
    existingWrap.style.display = "none";
    document.getElementById("orgApproveBtn").textContent = "Approve & create repo";
  }

  document.getElementById("orgGallery").innerHTML = "";
  document.getElementById("orgPdfPicker").value = "";
  document.getElementById("orgRejectBtn").disabled = false;
  document.getElementById("orgReadOnlyNote").style.display = "none"; // real org-role check happens server-side; no reliable client-side signal worth showing here
  renderOrgGallery();
  runOrgChecks();
}

// Runs the EXACT same checks the real Approve action does (dry_run),
// server-side, using the installation token -- not a lighter
// client-side approximation. Approve stays disabled until this comes
// back clean.
async function runOrgChecks() {
  const listEl = document.getElementById("orgChecksList");
  const approveBtn = document.getElementById("orgApproveBtn");
  approveBtn.disabled = true;
  listEl.textContent = "Checking file contents, notarization, and manifest shape...";
  try {
    const session = BlaydeAuth.getAppSession();
    const resp = await fetch(`${BlaydeAuth.AUTH_WORKER_URL}approve-vehicle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ repo_name: orgCurrentEntry.name, dry_run: true }),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || result.error) {
      listEl.innerHTML = `<span style="color:#ff6b6b;">${result.error || `Check failed (${resp.status}).`}</span>`;
      approveBtn.disabled = true;
      return;
    }
    listEl.innerHTML = `<span style="color:#1d9e75;">All checks passed -- exact file contents, notarization hash, and manifest shape all verified independently.</span>`;
    approveBtn.disabled = false;
  } catch (e) {
    listEl.innerHTML = `<span style="color:#ff6b6b;">Couldn't run checks: ${e.message}</span>`;
    approveBtn.disabled = true;
  }
}

document.getElementById("orgPdfPicker").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !orgCurrentEntry) return;
  const buf = await file.arrayBuffer();
  orgPdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  // Shared with every other viewer that does this same local-context
  // render -- see registry.js's resolvePageForLocalPdf for why. Checked
  // once per PDF load here (not per page), since getOrgPage renders
  // many pages from the same file across the gallery.
  ({ isPatchedOutput: orgPdfIsPatchedOutput } = await resolvePageForLocalPdf(orgPdfDoc, 0));
  if (orgPdfIsPatchedOutput) {
    log_org("This looks like an already-patched Blayde Manual, not the original scan -- adjusting for its extra cover page.");
  }
  orgPageCache = {};
  orgChunkIdx = 0;
  renderOrgGallery();
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
  const page = await orgPdfDoc.getPage(pageNum + (orgPdfIsPatchedOutput ? 1 : 0));
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
  } catch (e) { /* leave blank -- picked PDF might not match the submission, or none picked yet */ }
}

document.getElementById("orgApproveBtn").addEventListener("click", async () => {
  const btn = document.getElementById("orgApproveBtn");
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Approving...";
  try {
    const session = BlaydeAuth.getAppSession();
    const resp = await fetch(`${BlaydeAuth.AUTH_WORKER_URL}approve-vehicle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ repo_name: orgCurrentEntry.name, edition_id: orgCurrentEntry.manifest.edition_id }),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || result.error) throw new Error(result.error || `Approve failed (${resp.status}).`);
    log_org(`APPROVED ${orgCurrentEntry.manifest.vehicle} -- ${orgCurrentEntry.manifest.edition_id}: repo is now public (${result.repoUrl}), registry.json updated.`);
    // Same treatment as the self-review gallery's submit -- close out
    // the review pane on a real approval, replace it with a summary,
    // instead of leaving the just-approved gallery sitting on screen.
    document.getElementById("orgReviewArea").style.display = "none";
    showToast("Approved! Vehicle repo is now public.");
    const summaryCard = document.getElementById("orgApproveSummaryCard");
    // branchProtectionApplied surfaced explicitly, not assumed -- this
    // repo requires a second real maintainer before ANY photo PR can
    // merge (dual-approval, enforced by GitHub itself), so a maintainer
    // needs to know right away if that's not actually active yet.
    const dualApprovalNote = result.branchProtectionApplied
      ? `Dual-approval is active on this repo -- it needs a second real maintainer before any photo PR can merge.`
      : `<span style="color:#ffcc66;">Could not confirm dual-approval branch protection was applied -- check this repo's branch protection settings directly.</span>`;
    document.getElementById("orgApproveSummaryText").innerHTML = `${orgCurrentEntry.manifest.vehicle} -- ${orgCurrentEntry.manifest.edition_id}. `
      + `<a href="${result.repoUrl}" target="_blank" rel="noopener">Repo</a> is now public. ${dualApprovalNote}`;
    summaryCard.style.display = "block";
    renderPendingList();
  } catch (e) {
    log_org(`Approve failed: ${e.message}`);
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

// Still mock -- see file-header comment for why a real reject (deleting
// a real repo) is deliberately out of scope for this pass.
document.getElementById("orgRejectBtn").addEventListener("click", () => {
  log_org(`[mock] REJECT ${orgCurrentEntry.manifest.vehicle} -- ${orgCurrentEntry.manifest.edition_id}: notify the submitter with a reason. Real version needs a real decision on what happens to the private repo itself (leave it, delete it, ask for a fix) -- not built yet.`);
});

function log_org(msg) {
  const el = document.getElementById("orgLog");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

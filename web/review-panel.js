// Blayde Manual -- maintainer review panel. Real GitHub API calls as
// of 2026-08-26: lists open photo-submission PRs on a maintainer's
// registered repos, lets them compare the submitted photo against the
// real manual page, and accept (merge, plus a manifest.json bbox
// fixup if they adjusted it) or reject (close + comment) for real.
//
// Scoped to real photo-submission PRs only (the ones contribute.js's
// submitPhotoToGitHub creates) -- "comment"/"new-slot" style structural
// issues from issue-requests.js/org-approval.js are a different, still
// mock flow, not covered by this pass. A PR whose diff doesn't add a
// file under images/ is silently skipped here, not shown as broken.

// ---- repo scope guard -- this tool authenticates with the maintainer's
// OWN GitHub token, which has whatever access their real account has,
// completely unrelated to this project. Being "one generic app,
// parameterized by repo_url" is exactly what makes it possible to craft
// a link pointing this tool at some other repo the maintainer happens
// to have write access to -- so repo_url is never trusted just because
// it's in the URL. It's checked against the real registry (same one
// the patcher already reads) before this tool ever calls the GitHub
// API against it.
async function isRegisteredRepo(repoUrl) {
  try {
    const registryData = await loadRegistry(CANONICAL_REGISTRY_URL_FOR_REVIEW);
    const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
    return (registryData.vehicles || []).some(
      (v) => norm(v.repo_url) === norm(repoUrl) && v.status === "approved"
    );
  } catch (e) {
    return false; // registry unreachable -- fail closed, never act on an unverified repo
  }
}

// Same canonical URL convention as indexer-core.js/patcher.js --
// hardcoded, not user-editable, to close off a spoofing vector.
const CANONICAL_REGISTRY_URL_FOR_REVIEW = "https://raw.githubusercontent.com/BlaydeManual/registry/main/registry.json";

async function vehicleSlugForRepo(repoUrl) {
  try {
    const registryData = await loadRegistry(CANONICAL_REGISTRY_URL_FOR_REVIEW);
    const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
    return registryData.vehicles?.find((v) => norm(v.repo_url) === norm(repoUrl))?.vehicle_slug || repoUrl;
  } catch (e) {
    return repoUrl;
  }
}

// Category is a grouping tier here, never a filter -- direct
// architecture decision (see ROADMAP.md's "Category expansion"
// section): a maintainer covering a vehicle in Garage and an appliance
// in Home needs both in one scroll, not a global filter to flip.
// null (not "other") covers a repo whose registry entries predate the
// category field entirely -- genuinely uncategorized, distinct from a
// real "other" manual_type choice a submitter made on purpose.
async function categoryForRepo(repoUrl) {
  try {
    const registryData = await loadRegistry(CANONICAL_REGISTRY_URL_FOR_REVIEW);
    const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
    return registryData.vehicles?.find((v) => norm(v.repo_url) === norm(repoUrl))?.category || null;
  } catch (e) {
    return null;
  }
}

// A `?repo=` URL param overrides the maintained-repos list for local
// testing. Doesn't weaken the actual guard: an overridden repo still
// has to pass isRegisteredRepo() like any other.
function reposToCheck() {
  const override = new URLSearchParams(window.location.search).get("repo");
  return override ? [override] : maintainedRepos.map((r) => r.repoUrl);
}

let currentPR = null;
let currentPRs = []; // last loaded batch, across all maintained repos
let pdfDoc = null;
let renderScale = 2.0; // CSS px per PDF point -- fixed, keeps the compare view a manageable size
let box = null; // {x0,y0,x1,y1} in canvas-pixel space, live during drag
let dragState = null;
let submittedPhotoImg = null;
let submittedPhotoAspect = 1;

function log(msg) {
  const el = document.getElementById("prLog");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

// ---- repo scope check, run once the portal-level sign-in has already
// happened (see maintainer-portal.js) -- this is a separate concern from
// authentication itself, just parameterized to run right after it ----
async function initReviewTab() {
  const statusEl = document.getElementById("repoScopeStatus");
  const candidates = reposToCheck();
  const checks = await Promise.all(candidates.map(async (r) => [r, await isRegisteredRepo(r)]));
  const approved = checks.filter(([, ok]) => ok).map(([r]) => r);
  const refused = checks.filter(([, ok]) => !ok).map(([r]) => r);

  if (!approved.length) {
    statusEl.textContent = `No maintained repos passed the registry check -- this tool only ever acts on repos it finds there, never on a claimed repo alone.`;
    statusEl.style.color = "#ff6b6b";
    return;
  }
  statusEl.textContent = refused.length
    ? `repo scope check passed for ${approved.length} repo(s); REFUSED ${refused.length} not found in the registry: ${refused.join(", ")}`
    : `repo scope check passed for ${approved.length} repo(s)`;
  statusEl.style.color = refused.length ? "#ffcc66" : "";
  document.getElementById("prListCard").style.display = "block";
  document.getElementById("prList").innerHTML = `<p class="sub">Loading open requests...</p>`;

  const perRepo = await Promise.all(approved.map((repoUrl) =>
    Promise.all([
      loadOpenPhotoPRs(repoUrl).catch((e) => { log(`Couldn't load photo requests for ${repoUrl}: ${e.message}`); return []; }),
      loadOpenManifestChangePRs(repoUrl).catch((e) => { log(`Couldn't load manifest-fix requests for ${repoUrl}: ${e.message}`); return []; }),
    ]).then(([photos, manifestChanges]) => [...photos, ...manifestChanges])
  ));
  currentPRs = perRepo.flat();
  await renderPRList(approved);
}

// Real open PRs on this repo, filtered to ones that actually add a
// photo under <edition>/images/ (contribute.js's convention) -- anything
// else (a manifest-only PR, a docs tweak) is out of this pass's scope
// and silently skipped, not shown as a broken row. One bad/unreadable
// PR is isolated per-item, never breaks the whole list.
async function loadOpenPhotoPRs(repoUrl) {
  const session = BlaydeAuth.getSession();
  const [owner, repo] = ownerRepo(repoUrl);
  const prs = await githubApi(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`, session.token);

  // Keyed by edition_id, not one shared promise -- a repo can hold more
  // than one edition, and different PRs in the same repo can target
  // different ones, each needing its own manifest.json fetched from its
  // own edition folder.
  const manifestPromises = new Map();
  function getManifest(editionId) {
    if (!manifestPromises.has(editionId)) manifestPromises.set(editionId, fetchManifest(repoUrl, editionId));
    return manifestPromises.get(editionId);
  }

  const results = await Promise.all(prs.map(async (pr) => {
    try {
      const files = await githubApi(`/repos/${owner}/${repo}/pulls/${pr.number}/files`, session.token);
      const photoFile = files.find((f) => f.status === "added" && /^[^/]+\/images\//.test(f.filename));
      if (!photoFile) return null;
      // edition_id comes from the photo's own path, not from the
      // manifest's own field -- authoritative and available before the
      // manifest fetch even happens, since it's which folder the file
      // physically landed in.
      const pathMatch = /^([^/]+)\/images\/(.+)$/.exec(photoFile.filename);
      const editionId = pathMatch[1];
      const filename = pathMatch[2];
      const { procedureId, contributor } = parsePhotoFilename(filename);
      const { manifest, branch } = await getManifest(editionId);
      const entry = (manifest.entries || []).find((e) => e.procedure_id === procedureId);
      const geo = entry && manifest.page_geometry?.[String(entry.page)];
      if (!entry || !geo) return null; // photo doesn't match a known procedure -- shouldn't happen if checker.py ran, skip defensively
      if (!pr.head?.repo) return null; // contributor's fork was deleted after opening the PR -- can't fetch the photo
      return {
        // contributor (parsed from the photo's own filename convention)
        // takes priority over pr.user?.login -- real bug, caught live:
        // for a Public (direct-contribute) submission, the GitHub App's
        // installation token is what actually opens the PR, so GitHub's
        // own "opened by" field is always the App's bot identity, never
        // the real person. contributor is reliable for BOTH submission
        // paths (fork-based Private PRs use the same filename
        // convention), so it's the one real signal here, not a fallback.
        number: pr.number, title: pr.title, author: contributor || pr.user?.login || "unknown",
        repo_url: repoUrl, edition_id: editionId,
        procedure_id: procedureId, page: entry.page, section_heading: entry.section_heading,
        photo_raw_url: `https://raw.githubusercontent.com/${pr.head.repo.full_name}/${pr.head.ref}/${photoFile.filename}`,
        original_bbox: entry.pixel_bbox,
        composite_width_px: geo.composite_width_px, composite_height_px: geo.composite_height_px,
        page_width_pt: geo.page_width_pt, page_height_pt: geo.page_height_pt,
        base_branch: branch,
        // Relative (0-100) vector annotations already on this entry, if
        // any -- carried through so re-opening a PR shows prior
        // annotation work instead of silently discarding it.
        original_annotations: entry.annotations || [],
      };
    } catch (e) {
      return null;
    }
  }));
  return results.filter(Boolean);
}

// Real open PRs on this repo that propose a manifest.json change
// instead of adding a photo -- issue-requests.js's Contributor Portal
// proposals. Diffed client-side the same way handleAcceptManifestChange
// validates server-side, but only for DISPLAY here; the Worker gate
// independently re-verifies everything again at accept time, this
// never substitutes for that. A PR whose diff doesn't match one of the
// three real shapes (one add, one remove, one reposition) is silently
// skipped, same "isolate one bad item, don't break the list" rule as
// loadOpenPhotoPRs.
async function loadOpenManifestChangePRs(repoUrl) {
  const session = BlaydeAuth.getSession();
  const [owner, repo] = ownerRepo(repoUrl);
  const prs = await githubApi(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`, session.token);
  const results = await Promise.all(prs.map(async (pr) => {
    try {
      const files = await githubApi(`/repos/${owner}/${repo}/pulls/${pr.number}/files`, session.token);
      if (files.length !== 1 || files[0].status !== "modified" || !/^[^/]+\/manifest\.json$/.test(files[0].filename)) return null;
      const manifestPath = files[0].filename;
      const editionId = manifestPath.split("/")[0];
      const [baseFile, headFile] = await Promise.all([
        githubApi(`/repos/${owner}/${repo}/contents/${manifestPath}?ref=${pr.base.sha}`, session.token),
        githubApi(`/repos/${owner}/${repo}/contents/${manifestPath}?ref=${pr.head.sha}`, session.token),
      ]);
      const baseData = JSON.parse(base64ToUtf8(baseFile.content));
      const headData = JSON.parse(base64ToUtf8(headFile.content));
      const baseByKey = new Map((baseData.entries || []).map((e) => [e.procedure_id, e]));
      const headByKey = new Map((headData.entries || []).map((e) => [e.procedure_id, e]));
      const added = [...headByKey.keys()].filter((k) => !baseByKey.has(k));
      const removed = [...baseByKey.keys()].filter((k) => !headByKey.has(k));
      const modified = [...baseByKey.keys()].filter(
        (k) => headByKey.has(k) && JSON.stringify(baseByKey.get(k)) !== JSON.stringify(headByKey.get(k))
      );

      let kind, procedureId, entry, oldBbox = null, newBbox = null;
      if (added.length === 1 && !removed.length && !modified.length) {
        kind = "new-slot"; procedureId = added[0]; entry = headByKey.get(procedureId); newBbox = entry.pixel_bbox;
      } else if (removed.length === 1 && !added.length && !modified.length) {
        kind = "remove"; procedureId = removed[0]; entry = baseByKey.get(procedureId); oldBbox = entry.pixel_bbox;
      } else if (modified.length === 1 && !added.length && !removed.length) {
        kind = "structure"; procedureId = modified[0]; entry = headByKey.get(procedureId);
        oldBbox = baseByKey.get(procedureId).pixel_bbox; newBbox = entry.pixel_bbox;
      } else {
        return null; // not a real single-change shape -- the accept gate will refuse it regardless, not this list's job to explain why
      }

      const geo = headData.page_geometry?.[String(entry.page)] || baseData.page_geometry?.[String(entry.page)];
      return {
        isManifestChange: true,
        number: pr.number, repo_url: repoUrl, edition_id: editionId,
        kind, procedure_id: procedureId, page: entry.page, section_heading: entry.section_heading,
        oldBbox, newBbox,
        // Always fork-based (see submitManifestChange), so pr.user.login
        // is already the real proposer -- no bot-authored path exists
        // for this PR type the way it does for Public-path photos.
        author: pr.user?.login || "unknown",
        composite_width_px: geo?.composite_width_px, composite_height_px: geo?.composite_height_px,
        page_width_pt: geo?.page_width_pt, page_height_pt: geo?.page_height_pt,
        base_branch: pr.base.ref,
      };
    } catch (e) {
      return null;
    }
  }));
  return results.filter(Boolean);
}

// Grouped by vehicle, then by edition within it -- a vehicle repo can
// hold more than one edition, so "which vehicle" alone is one tier too
// shallow.
// Real review/merge status per row, not just in the single-PR detail
// view -- direct request: the list should always show X/2 so a
// maintainer can see at a glance which ones still need reviewing,
// colored by whether it's actually actionable for THEM specifically
// (the same "can't approve your own PR" logic GitHub itself applies),
// not just "has anyone approved yet."
function prStatusInfo(pr, status, myLogin) {
  if (!status) return { state: "loading", label: "Checking review status…" };
  if (status.error) return { state: "loading", label: "Review status unavailable" };
  const count = `${status.approved_count}/${status.required_approvals}`;
  if (status.ready_to_merge) return { state: "ready", label: `${count} ✓ Ready to merge` };
  if (status.changes_requested_by.length) return { state: "changes", label: `${count} · Changes requested` };
  const isContributor = myLogin && pr.author === myLogin;
  const alreadyApproved = myLogin && status.approved_by.includes(myLogin);
  if (isContributor || alreadyApproved) return { state: "waiting", label: `${count} · Waiting on others` };
  return { state: "needsYou", label: `${count} · Needs your review` };
}

async function renderPRList(approvedRepos) {
  const wrap = document.getElementById("prList");
  wrap.innerHTML = "";
  const myLogin = BlaydeAuth.getSession()?.username;

  // Fetched once per PR, in parallel, up front -- sorting (below)
  // needs each row's state known before rows are built, not patched in
  // after the fact.
  const statusByNumber = new Map();
  await Promise.all(currentPRs.map(async (pr) => {
    statusByNumber.set(pr.number, await fetchReviewStatus(pr));
  }));

  // Category is a grouping tier here, never a filter (see
  // categoryForRepo's comment) -- resolved per repo up front, in
  // parallel, same shape as the status prefetch above.
  const categoryByRepo = new Map();
  await Promise.all(approvedRepos.map(async (repoUrl) => {
    categoryByRepo.set(repoUrl, await categoryForRepo(repoUrl));
  }));

  const reposByCategory = new Map();
  for (const repoUrl of approvedRepos) {
    if (!currentPRs.some((pr) => pr.repo_url === repoUrl)) continue;
    const key = categoryByRepo.get(repoUrl) || null;
    if (!reposByCategory.has(key)) reposByCategory.set(key, []);
    reposByCategory.get(key).push(repoUrl);
  }
  // Fixed narrative order (same as the public category tabs), then any
  // uncategorized repos last -- there's no real usage data to rank by,
  // same reasoning ROADMAP.md gives for the tab order.
  const orderedCategoryKeys = [...CATEGORY_ORDER.filter((c) => reposByCategory.has(c)), ...(reposByCategory.has(null) ? [null] : [])];
  // Always shown, even with just one category -- direct instruction:
  // the color/icon system should flow through consistently regardless
  // of how many categories a maintainer happens to cover today, not
  // pop in only once they cross a second one.
  const showCategoryHeadings = orderedCategoryKeys.length > 0;

  for (const categoryKey of orderedCategoryKeys) {
    const repoUrlsInCategory = reposByCategory.get(categoryKey);
    let categoryWrap = wrap;
    if (showCategoryHeadings) {
      const categoryGroup = document.createElement("details");
      categoryGroup.open = true;
      categoryGroup.className = "category-group";
      if (categoryKey) categoryGroup.style.setProperty("--accent", CATEGORY_STYLE[categoryKey].accent);
      const totalPrs = repoUrlsInCategory.reduce((sum, r) => sum + currentPRs.filter((pr) => pr.repo_url === r).length, 0);
      const label = categoryKey ? categoryKey[0].toUpperCase() + categoryKey.slice(1) : "Uncategorized";
      const icon = categoryKey ? categoryIconSvg(categoryKey) : "";
      const heading = document.createElement("summary");
      heading.className = "category-bar";
      heading.innerHTML = `${icon}${label} (${totalPrs})`;
      categoryGroup.appendChild(heading);
      wrap.appendChild(categoryGroup);
      categoryWrap = categoryGroup;
    }

    for (const repoUrl of repoUrlsInCategory) {
      // Page order here decides which edition heading appears first and
      // which PR within an edition is seen first, before the
      // needs-attention/waiting split below reorders within each
      // edition's own list.
      const prs = currentPRs.filter((pr) => pr.repo_url === repoUrl).sort((a, b) => a.page - b.page);
      if (!prs.length) continue;
      // <details>, not a plain div -- direct request: with real volume
      // (dozens of photos across several manuals), a flat unfoldable list
      // is what doesn't scale, so each tier collapses independently. Open
      // by default so nothing hides on first load; the count in the
      // summary stays informative even collapsed.
      const group = document.createElement("details");
      group.open = true;
      group.style.marginBottom = "16px";
      const vehicleSlug = await vehicleSlugForRepo(repoUrl);
      group.innerHTML = `<summary class="vehicle-bar">${vehicleSlug} (${prs.length})</summary>`;

      const byEdition = new Map();
      prs.forEach((pr) => {
        const key = pr.edition_id || "(edition not set)";
        if (!byEdition.has(key)) byEdition.set(key, []);
        byEdition.get(key).push(pr);
      });
      byEdition.forEach((editionPrs, editionId) => {
        const editionGroup = document.createElement("details");
        editionGroup.open = true;
        const editionHeading = document.createElement("summary");
        editionHeading.className = "edition-bar";
        editionHeading.textContent = `${editionId} (${editionPrs.length})`;
        editionGroup.appendChild(editionHeading);
        group.appendChild(editionGroup);
        const editionWrap = document.createElement("div");
        // Page order within two tiers, not one flat page order -- direct
        // spec: rows waiting on someone else (not actionable for you)
        // sink to the bottom, so what you can actually act on floats to
        // the top. Array.sort is stable (guaranteed since ES2019), so
        // page order survives within each tier without sorting on it
        // explicitly.
        editionPrs
          .map((pr) => ({ pr, info: prStatusInfo(pr, statusByNumber.get(pr.number), myLogin) }))
          .sort((a, b) => (a.info.state === "waiting" ? 1 : 0) - (b.info.state === "waiting" ? 1 : 0))
          .forEach(({ pr, info }) => {
            const row = document.createElement("div");
            row.className = "pr-row";
            const manifestKindLabel = { "new-slot": "Add", remove: "Remove", structure: "Reposition" };
            const title = pr.isManifestChange
              ? `${manifestKindLabel[pr.kind]}: ${formatProcedureLabel(pr.procedure_id, pr.page, pr.section_heading)}`
              : formatProcedureLabel(pr.procedure_id, pr.page, pr.section_heading);
            row.innerHTML = `
              <div>
                <div class="pr-title">${title}</div>
                <div class="pr-meta">@${pr.author} &middot; Request #${pr.number}</div>
              </div>
              <div class="pr-row-actions">
                <span class="pr-status-badge status-${info.state}">${info.label}</span>
                <button data-pr="${pr.number}">Review</button>
              </div>
            `;
            editionWrap.appendChild(row);
          });
        editionGroup.appendChild(editionWrap);
      });
      categoryWrap.appendChild(group);
    }
  }
  if (!wrap.children.length) wrap.innerHTML = `<p class="sub">No open photo requests right now.</p>`;
  wrap.querySelectorAll("button[data-pr]").forEach(btn => {
    btn.addEventListener("click", () => openPR(parseInt(btn.dataset.pr, 10)));
  });
}

// ---- real review/merge status: 0/2 approved, who's approved, who's
// requested changes, required-check state -- so a maintainer sees why
// Accept is disabled instead of finding out only when a real merge
// attempt fails. reviewStatus is null while loading/unknown, an object
// with `.error` if the status check itself failed (treated the same as
// "not ready" -- fail closed, never let a failed status read silently
// enable a merge attempt), or the real status object otherwise. ----
let reviewStatus = null;

// Shared by the single-PR detail view (loadReviewStatus) and the list
// view's per-row badges (renderPRList) -- both need the exact same
// approved_count/required_approvals/approved_by/changes_requested_by/
// checks_passing/ready_to_merge shape, just rendered differently.
// Returns the real result object, or {error} on any failure -- never
// throws, since a list of N rows fetching this in parallel shouldn't
// let one bad response break the others.
async function fetchReviewStatus(pr) {
  try {
    const session = BlaydeAuth.getSession();
    const resp = await fetch(
      `${BlaydeAuth.AUTH_WORKER_URL}pr-review-status?repo_url=${encodeURIComponent(pr.repo_url)}&pr_number=${pr.number}`,
      { headers: { Authorization: `Bearer ${session.token}` } }
    );
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || result.error) throw new Error(result.error || `status check failed (${resp.status})`);
    return result;
  } catch (e) {
    return { error: e.message };
  }
}

async function loadReviewStatus() {
  const pr = currentPR;
  reviewStatus = null;
  renderReviewStatusLine();
  updateAcceptButtonState();
  const result = await fetchReviewStatus(pr);
  if (currentPR !== pr) return; // maintainer moved to a different PR while this was in flight
  reviewStatus = result;
  renderReviewStatusLine();
  updateAcceptButtonState();
}

function renderReviewStatusLine() {
  const el = document.getElementById("reviewStatusLine");
  if (!reviewStatus) { el.textContent = "Checking review/merge status..."; return; }
  if (reviewStatus.error) { el.textContent = `Couldn't check review status: ${reviewStatus.error}`; return; }
  const parts = [];
  parts.push(
    `Reviews: ${reviewStatus.approved_count}/${reviewStatus.required_approvals} approved` +
    (reviewStatus.approved_by.length ? ` (${reviewStatus.approved_by.map((u) => "@" + u).join(", ")})` : "")
  );
  if (reviewStatus.changes_requested_by.length) {
    parts.push(`changes requested by ${reviewStatus.changes_requested_by.map((u) => "@" + u).join(", ")}`);
  }
  if (reviewStatus.checks.length) {
    parts.push("Checks: " + reviewStatus.checks.map((c) =>
      `${c.name} ${c.conclusion === "success" ? "✓" : c.conclusion ? "✗" : "…"}`
    ).join(", "));
  }
  el.textContent = parts.join(" · ");
}

// Single source of truth for whether Accept can actually do anything --
// combines "has the compare view loaded" (the old, pre-existing gate)
// with "is this PR actually mergeable right now" (the new one). Called
// from every place either input changes, so the button's label always
// reflects the real, current reason it's disabled, not a stale one.
// Also drives Approve's own state (see updateApproveButtonState below) --
// one call site updates both buttons together, so nothing can update
// one and forget the other.
function updateAcceptButtonState() {
  const btn = document.getElementById("acceptBtn");
  // A manifest-change review has no photo to load at all -- gating on
  // submittedPhotoImg here would leave Accept permanently disabled for
  // every one of these regardless of real review status.
  if (!currentPR?.isManifestChange && !submittedPhotoImg) { btn.disabled = true; btn.textContent = "Accept & merge"; updateApproveButtonState(); return; }
  if (!reviewStatus) { btn.disabled = true; btn.textContent = "Checking review status..."; updateApproveButtonState(); return; }
  if (reviewStatus.error) { btn.disabled = true; btn.textContent = "Couldn't verify review status"; updateApproveButtonState(); return; }
  if (reviewStatus.changes_requested_by.length) {
    btn.disabled = true;
    btn.textContent = `Changes requested by @${reviewStatus.changes_requested_by[0]}`;
    updateApproveButtonState();
    return;
  }
  if (!reviewStatus.checks_passing) {
    const blocking = reviewStatus.checks.find((c) => c.conclusion !== "success");
    btn.disabled = true;
    btn.textContent = blocking ? `Waiting on "${blocking.name}" check` : "Waiting on required checks";
    updateApproveButtonState();
    return;
  }
  if (reviewStatus.approved_count < reviewStatus.required_approvals) {
    const remaining = reviewStatus.required_approvals - reviewStatus.approved_count;
    btn.disabled = true;
    btn.textContent = `Needs ${remaining} more approval${remaining === 1 ? "" : "s"} (${reviewStatus.approved_count}/${reviewStatus.required_approvals})`;
    updateApproveButtonState();
    return;
  }
  btn.disabled = false;
  btn.textContent = "Accept & merge";
  updateApproveButtonState();
}

// Approve is real GitHub review submission, under the maintainer's OWN
// token -- never the Worker's installation token, which would attribute
// every approval to the App's bot identity and never count toward a
// human-reviewer requirement at all. Gated the same way Accept's first
// gate is (the submitted photo has to have actually loaded) so no one
// can approve blind before anything's rendered; further gated on not
// having already approved, since GitHub happily accepts a second
// APPROVE review from the same person but it's just noise once cast.
function updateApproveButtonState() {
  const btn = document.getElementById("approveBtn");
  if (!submittedPhotoImg || !reviewStatus || reviewStatus.error) {
    btn.disabled = true;
    btn.textContent = "Approve";
    return;
  }
  const myLogin = BlaydeAuth.getSession()?.username;
  // The server already excludes a self-review from ever counting (see
  // the Worker's resolveRealSubmitter), but letting the button submit
  // one anyway reads as "that worked" when it silently didn't --
  // disabled here so the UI doesn't lie about what a click will do.
  if (myLogin && reviewStatus.real_submitter && myLogin === reviewStatus.real_submitter) {
    btn.disabled = true;
    btn.textContent = "You submitted this";
    return;
  }
  if (myLogin && reviewStatus.approved_by.includes(myLogin)) {
    btn.disabled = true;
    btn.textContent = "You approved ✓";
    return;
  }
  btn.disabled = false;
  btn.textContent = "Approve";
}

document.getElementById("approveBtn").addEventListener("click", async () => {
  const session = BlaydeAuth.getSession();
  const [owner, repo] = ownerRepo(currentPR.repo_url);
  const btn = document.getElementById("approveBtn");
  btn.disabled = true;
  btn.textContent = "Approving...";
  try {
    log(`approving request #${currentPR.number}...`);
    await githubApi(`/repos/${owner}/${repo}/pulls/${currentPR.number}/reviews`, session.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "APPROVE" }),
    });
    log(`approved.`);
    showToast("Approved.");
    await loadReviewStatus(); // refreshes the status line and both buttons' real state
  } catch (e) {
    log(`approve failed: ${e.message}`);
    updateApproveButtonState();
  }
});

// ---- opening a PR: fetch the real submitted photo, not a mock one ----
async function openPR(number) {
  currentPR = currentPRs.find(p => p.number === number);
  box = null;
  pdfDoc = null;
  submittedPhotoImg = null;
  reviewStatus = null;
  document.getElementById("prLog").textContent = "";
  document.getElementById("reviewArea").classList.add("open");
  document.getElementById("rejectBtn").disabled = false;

  if (currentPR.isManifestChange) {
    openManifestChangeReview();
    return;
  }
  // Coming back from a manifest-change review needs these restored to
  // their normal defaults -- openManifestChangeReview hides them, and
  // nothing else in the photo path ever re-shows them since they're
  // visible by default.
  document.getElementById("manifestDiffArea").style.display = "none";
  document.getElementById("annoToolbar").style.display = "";
  document.getElementById("resetBoxBtn").style.display = "";
  // A leftover "showing original" state from whatever PR was open
  // before would otherwise start this one with its own real photo
  // hidden, or the button reading the wrong label.
  document.getElementById("submittedPhotoImg").style.opacity = "1";
  document.getElementById("targetBoxBacking").style.opacity = "1";
  document.getElementById("annotationLayer").style.opacity = "1";
  document.getElementById("toggleOriginalBtn").style.display = "none";
  document.getElementById("toggleOriginalBtn").textContent = "Show original page";
  document.getElementById("toggleOriginalBtn").classList.remove("active");
  // Deep-cloned, not a reference into currentPR/currentPRs -- dragging
  // shapes around during review must never mutate the cached list that
  // renderPRList/loadOpenPhotoPRs already built, the same reasoning
  // original_bbox vs. box already follows for the crop position.
  annotations = JSON.parse(JSON.stringify(currentPR.original_annotations || []));
  annoTool = null;
  annoLastInteractedId = null;
  annoHistory = []; // a new PR's undo history starts clean -- never carries a previous photo's edits
  document.querySelectorAll("#annoToolbar [data-anno-tool]").forEach((b) => b.classList.remove("active"));
  document.getElementById("annoNextNumberRow").style.display = "none";
  document.getElementById("annoTextFrameRow").style.display = "none";
  document.getElementById("annoTextEditRow").style.display = "none";
  annoNextNumber = (annotations.filter((a) => a.type === "number").reduce((max, a) => Math.max(max, a.value || 0), 0)) + 1;
  document.getElementById("annoNextNumberInput").value = annoNextNumber;
  annoRenderHelp();
  renderAnnotations();
  document.getElementById("reviewTitle").textContent =
    `${formatProcedureLabel(currentPR.procedure_id, currentPR.page, currentPR.section_heading)} - Request #${currentPR.number}`;
  document.getElementById("reviewMeta").textContent = `Submitted by @${currentPR.author}`;
  document.getElementById("zoomViewport").style.display = "none";
  document.getElementById("viewModeRow").style.display = "none";
  setReviewViewMode("zoomed");
  updateAcceptButtonState();
  renderReviewStatusLine();
  document.getElementById("resetBoxBtn").disabled = true;
  loadReviewStatus(); // fires in parallel with the photo fetch below, not awaited

  log(`opened request #${currentPR.number} -- fetching the submitted photo...`);
  try {
    const resp = await fetch(currentPR.photo_raw_url);
    if (!resp.ok) throw new Error(`photo fetch failed (${resp.status})`);
    const blob = await resp.blob();
    submittedPhotoImg = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("couldn't read the photo"));
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("couldn't read the photo's dimensions"));
      img.src = submittedPhotoImg;
    });
    submittedPhotoAspect = dims.w / dims.h;
    log(`photo loaded (${dims.w}x${dims.h}) -- pick your own copy of the manual to render real page context`);
  } catch (e) {
    log(`couldn't load the submitted photo: ${e.message}`);
  }
}

// ---- the local-context rule in action: nothing renders until the
// maintainer supplies their own PDF, same as any other role ----
document.getElementById("pdfPicker").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !currentPR) return;
  log(`loading ${file.name}...`);
  const buf = await file.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  if (currentPR.isManifestChange) await renderManifestDiffPage();
  else await renderPage();
});

// ---- manifest-change review: full page, color-coded, read-only --
// bbox review only makes sense against real page context (same
// reasoning issue-requests.js's own editor follows), and unlike a
// photo there's no crop box to drag here, just a diff to look at. ----
function openManifestChangeReview() {
  document.getElementById("manifestDiffArea").style.display = "block";
  document.getElementById("annoToolbar").style.display = "none";
  document.getElementById("resetBoxBtn").style.display = "none";
  document.getElementById("zoomViewport").style.display = "none";
  document.getElementById("viewModeRow").style.display = "none";
  const kindLabel = { "new-slot": "Add", remove: "Remove", structure: "Reposition" }[currentPR.kind];
  document.getElementById("reviewTitle").textContent =
    `${kindLabel}: ${formatProcedureLabel(currentPR.procedure_id, currentPR.page, currentPR.section_heading)} - Request #${currentPR.number}`;
  document.getElementById("reviewMeta").textContent = `Proposed by @${currentPR.author}`;
  document.getElementById("manifestDiffLegend").textContent = {
    "new-slot": "Blue box: the newly proposed photo slot.",
    remove: "Blue box with an X: this tracked slot is proposed for removal.",
    structure: "Green box: current position. Blue box: proposed new position.",
  }[currentPR.kind] || "";
  updateAcceptButtonState();
  renderReviewStatusLine();
  loadReviewStatus();
  log(`opened request #${currentPR.number} -- pick your own copy of the manual to render the real page.`);
}

async function renderManifestDiffPage() {
  const { targetPage, isPatchedOutput } = await resolvePageForLocalPdf(pdfDoc, currentPR.page);
  if (isPatchedOutput) {
    log("This looks like an already-patched Blayde Manual, not the original scan -- adjusting for its extra cover page.");
  }
  const page = await pdfDoc.getPage(targetPage);
  const viewport = page.getViewport({ scale: renderScale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

  const inner = document.getElementById("manifestDiffPageInner");
  inner.innerHTML = `<img id="manifestDiffPageImg" alt="" style="display:block; max-width:100%;">`;
  const img = document.getElementById("manifestDiffPageImg");
  img.src = canvas.toDataURL();
  img.onload = () => {
    // Scale from the manifest's own composite_width_px/height_px (the
    // space pixel_bbox coordinates are actually in) to this <img>'s
    // real displayed size -- same conversion issue-requests.js's own
    // boxToPixelBbox does in reverse.
    const sx = img.clientWidth / (currentPR.composite_width_px || canvas.width);
    const sy = img.clientHeight / (currentPR.composite_height_px || canvas.height);
    const addBox = (bbox, className) => {
      if (!bbox) return;
      const [x0, y0, x1, y1] = bbox;
      const el = document.createElement("div");
      el.className = `overlay-box ${className}`;
      el.style.left = (x0 * sx) + "px";
      el.style.top = (y0 * sy) + "px";
      el.style.width = ((x1 - x0) * sx) + "px";
      el.style.height = ((y1 - y0) * sy) + "px";
      inner.appendChild(el);
    };
    if (currentPR.kind === "new-slot") addBox(currentPR.newBbox, "diff-proposed");
    else if (currentPR.kind === "remove") addBox(currentPR.oldBbox, "diff-remove");
    else if (currentPR.kind === "structure") { addBox(currentPR.oldBbox, "touched"); addBox(currentPR.newBbox, "diff-proposed"); }
  };
  log(`rendered page ${currentPR.page} at ${canvas.width}x${canvas.height}.`);
  updateAcceptButtonState();
}

async function renderPage() {
  // Shared with every other viewer that does this same local-context
  // render -- see registry.js's resolvePageForLocalPdf for why.
  const { targetPage, isPatchedOutput } = await resolvePageForLocalPdf(pdfDoc, currentPR.page);
  if (isPatchedOutput) {
    log("This looks like an already-patched Blayde Manual, not the original scan -- adjusting for its extra cover page.");
  }
  const page = await pdfDoc.getPage(targetPage);
  const viewport = page.getViewport({ scale: renderScale });
  const canvas = document.getElementById("pageCanvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  document.getElementById("zoomViewport").style.display = "block";
  document.getElementById("viewModeRow").style.display = "flex";
  resetBox();
  log(`rendered page ${currentPR.page} at ${canvas.width}x${canvas.height} -- annotate here, or switch to the full page to adjust the box's position`);
  updateAcceptButtonState();
  document.getElementById("resetBoxBtn").disabled = false;
  // Only useful once the original page is actually rendered underneath
  // -- before that there's nothing real to compare against yet.
  document.getElementById("toggleOriginalBtn").style.display = "inline-block";
}

// ---- two view modes on the same underlying canvas/box/annotations,
// direct spec: a big zoomed view (padded around the box, magnified)
// is the default working view for annotating and judging fit; "View
// in full page" is a separate mode purely for dragging/resizing the
// box itself, always showing the new photo (no before/after toggle
// there -- "no comparison in the full-page view"). Annotations stay
// visible in both, but only editable in the zoomed view.
let reviewViewMode = "zoomed";

function setReviewViewMode(mode) {
  reviewViewMode = mode;
  const vp = document.getElementById("zoomViewport");
  vp.classList.toggle("mode-zoomed", mode === "zoomed");
  vp.classList.toggle("mode-full", mode === "full");
  document.getElementById("viewFullPageBtn").style.display = mode === "zoomed" ? "inline-block" : "none";
  document.getElementById("viewZoomedBtn").style.display = mode === "full" ? "inline-block" : "none";
  document.getElementById("toggleOriginalBtn").style.display = mode === "zoomed" && box ? "inline-block" : "none";
  document.getElementById("annoToolbar").style.display = mode === "zoomed" ? "flex" : "none";
  document.getElementById("annoHelp").style.display = mode === "zoomed" ? "block" : "none";
  document.getElementById("fitReadout").style.display = mode === "full" ? "block" : "none";
  document.getElementById("resetBoxBtn").style.display = mode === "full" ? "inline-block" : "none";
  if (mode === "full") {
    // Full page always shows the real, new content -- no comparison
    // toggle there -- and no live tool interaction while a shape's
    // handles wouldn't even be visible (mode-zoomed hides .handle,
    // not the annotation handles, so this also closes any open text
    // editor left over from the zoomed view).
    document.getElementById("submittedPhotoImg").style.opacity = "1";
    document.getElementById("targetBoxBacking").style.opacity = "1";
    document.getElementById("annotationLayer").style.opacity = "1";
    document.getElementById("toggleOriginalBtn").textContent = "Show original page";
    document.getElementById("toggleOriginalBtn").classList.remove("active");
    document.querySelectorAll("#annoToolbar [data-anno-tool]").forEach((b) => b.classList.remove("active"));
    annoTool = null;
    document.getElementById("annoNextNumberRow").style.display = "none";
    document.getElementById("annoTextFrameRow").style.display = "none";
    document.getElementById("annoTextEditRow").style.display = "none";
    annoEditingTextId = null;
    renderAnnotations();
  }
  applyZoom();
}

document.getElementById("viewFullPageBtn").addEventListener("click", () => setReviewViewMode("full"));
document.getElementById("viewZoomedBtn").addEventListener("click", () => setReviewViewMode("zoomed"));

// Scales/translates #compareWrap (not #pageCanvas directly) so the
// canvas + box + annotation layer all zoom together as one unit --
// the box's own padding-relative math stays in canvasDisplaySize's
// pre-transform pixel space (offsetWidth/offsetHeight), so this can
// run independently of bboxToCanvas/paintBox without circularity.
function applyZoom() {
  const compare = document.getElementById("compareWrap");
  if (reviewViewMode !== "zoomed" || !box) {
    compare.style.transform = "none";
    return;
  }
  const vp = document.getElementById("zoomViewport");
  const vpW = vp.clientWidth, vpH = vp.clientHeight;
  if (!vpW || !vpH) { compare.style.transform = "none"; return; }
  const boxW = box.x1 - box.x0, boxH = box.y1 - box.y0;
  if (boxW <= 0 || boxH <= 0) { compare.style.transform = "none"; return; }
  const PAD = 1.4; // room around the box so surrounding page context is still visible
  const scale = Math.min(vpW / (boxW * PAD), vpH / (boxH * PAD));
  const boxCx = (box.x0 + box.x1) / 2, boxCy = (box.y0 + box.y1) / 2;
  const tx = vpW / 2 - boxCx * scale;
  const ty = vpH / 2 - boxCy * scale;
  compare.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

// Direct request: annotating (an arrow, a circled letter) needs to
// reference where the ORIGINAL manual actually had it, not just the
// replacement photo in isolation -- and the original page is already
// rendered on pageCanvas, directly underneath #targetBox at the exact
// same position/size the submitted photo occupies. A toggle just needs
// to get the new photo out of the way, not fetch or render anything
// new. The annotation layer is a sibling drawn after the photo either
// way, so it (and drawing on it) keeps working while the original
// shows through.
document.getElementById("toggleOriginalBtn").addEventListener("click", () => {
  const img = document.getElementById("submittedPhotoImg");
  const backing = document.getElementById("targetBoxBacking");
  const annoLayer = document.getElementById("annotationLayer");
  const btn = document.getElementById("toggleOriginalBtn");
  const showingOriginal = img.style.opacity === "0";
  // The white backing AND the annotation layer fade with the photo,
  // not independently -- direct feedback: annotations drawn on top of
  // the new photo obscured the original page underneath, defeating
  // the point of comparing against it. The backing exists to match
  // patcher.js's own solid backing behind the real photo, not to block
  // this comparison either.
  img.style.opacity = backing.style.opacity = annoLayer.style.opacity = showingOriginal ? "1" : "0";
  btn.textContent = showingOriginal ? "Show original page" : "Show new photo";
  btn.classList.toggle("active", !showingOriginal);
});

// ---- bbox <-> canvas-pixel conversion, same math as patcher.js's
// scale_x/scale_y (composite_px / page_pt), just going the other
// direction (composite px -> on-screen canvas px) ----
//
// Deliberately uses the canvas's own CSS-RENDERED size
// (offsetWidth/offsetHeight), not canvas.width/height. Those two only
// match when the page happens to be wider than the render buffer
// (pdf.js renders at renderScale=2.0, so a Letter page alone is
// ~1224px) -- #pageCanvas has max-width:100% and this layout's <main>
// caps at 960px, so the buffer is shrunk on essentially every real
// window, not just mobile. #targetBox is positioned in absolute CSS
// px against .compare-wrap, which is exactly as wide as the SHRUNK
// canvas -- using the unshrunk buffer size here put the box in the
// wrong pixel space entirely, worse the wider the actual render was.
// Real bug, found live: the box rendered nowhere near the photo it
// was supposed to mark.
//
// offsetWidth/offsetHeight, not getBoundingClientRect: .compare-wrap
// (the canvas's parent) gets a CSS `transform: scale()` applied while
// the zoomed view is active, and getBoundingClientRect reflects
// geometry AFTER that transform -- which would make box's own units
// depend on whether zoom happens to be applied, a circular mess.
// offsetWidth/offsetHeight are the pre-transform layout size, exactly
// the reference frame #targetBox's own left/top/width/height (set in
// paintBox) are actually interpreted in.
function canvasDisplaySize() {
  const canvas = document.getElementById("pageCanvas");
  return { w: canvas.offsetWidth, h: canvas.offsetHeight };
}

function bboxToCanvas(bbox) {
  const { w, h } = canvasDisplaySize();
  const sx = w / currentPR.composite_width_px;
  const sy = h / currentPR.composite_height_px;
  const [x0, y0, x1, y1] = bbox;
  return { x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy };
}

function canvasToBbox(rect) {
  const { w, h } = canvasDisplaySize();
  const sx = currentPR.composite_width_px / w;
  const sy = currentPR.composite_height_px / h;
  return [rect.x0 * sx, rect.y0 * sy, rect.x1 * sx, rect.y1 * sy].map(v => Math.round(v));
}

// Keeps the box correct if the window resizes mid-review -- since box
// lives in display-CSS-px, a resize that shrinks/grows the (already
// shrunk) canvas would otherwise leave it pointing at stale
// coordinates, the same failure mode this whole fix targets.
window.addEventListener("resize", () => {
  if (!box) return;
  const { w, h } = canvasDisplaySize();
  if (!lastDisplaySize || w === lastDisplaySize.w && h === lastDisplaySize.h) { lastDisplaySize = { w, h }; return; }
  const sx = w / lastDisplaySize.w, sy = h / lastDisplaySize.h;
  box = { x0: box.x0 * sx, y0: box.y0 * sy, x1: box.x1 * sx, y1: box.y1 * sy };
  lastDisplaySize = { w, h };
  paintBox();
});
let lastDisplaySize = null;

function resetBox() {
  box = bboxToCanvas(currentPR.original_bbox);
  lastDisplaySize = canvasDisplaySize();
  paintBox();
}

document.getElementById("resetBoxBtn").addEventListener("click", () => {
  resetBox();
  log("box reset to the original submission bbox");
});

// ---- annotation editor -- arrows/circles/numbers/lines/short text
// callouts, stored as relative (0-100) vector shapes on the manifest
// entry (entry.annotations), not baked into the photo's own pixels.
// Rendering these into the actual patched PDF output is a deliberate,
// separate follow-up (patcher.js) -- this is the editor half only.
//
// Every shape is drawn with a black-outlined color stroke ("cased"/
// haloed, the same technique road casings on maps use) so it stays
// legible over any photo regardless of what's directly behind it --
// two overlapping strokes, wider black one first, narrower white one
// on top, rather than relying on a single color to contrast correctly
// against a background nobody controls.
let annotations = [];
let annoTool = null; // 'arrow' | 'line' | 'circle' | 'number' | 'text' | null
let annoDrag = null;
let annoNextNumber = 1;
let annoEditingTextId = null;
// The shape a keyboard Delete/Backspace acts on -- there's no
// click-to-select model here (handles show for every shape a tool
// owns at once, not one at a time), so "the thing you just touched"
// is what Delete removes, updated on every create/move/resize.
let annoLastInteractedId = null;
let annoHistory = [];
const ANNO_HISTORY_MAX = 20;
const ANNO_MAX_LEN = 30; // % of the box's own size -- no single shape needs to be bigger than this to be useful
const ANNO_TEXT_MAXLEN = 3;
const ANNO_NS = "http://www.w3.org/2000/svg";
// Which backing shape a freshly-placed Text label gets -- circle by
// default (direct request: match Number's look, not the old
// rectangle), rectangle on demand via the toolbar toggle. Session-
// level, not per-PR -- a maintainer's preference here, not review data.
let annoTextFrame = "circle";
const ANNO_TOOL_META = {
  arrow: { icon: "↗", word: "Arrow" },
  line: { icon: "―", word: "Line" },
  circle: { icon: "○", word: "Circle" },
  number: { icon: "①", word: "Number" },
  text: { icon: "✎", word: "Text" },
};

// Direct feedback: a separate icon/word toggle didn't add anything --
// just always show both together.
function annoLabel(tool) {
  const m = ANNO_TOOL_META[tool];
  return `${m.icon} ${m.word}`;
}

function annoPointFromEvent(e) {
  const svg = document.getElementById("annotationLayer");
  const rect = svg.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: ((t.clientX - rect.left) / rect.width) * 100, y: ((t.clientY - rect.top) / rect.height) * 100 };
}

function annoClamp01(v) { return Math.max(0, Math.min(100, v)); }

// Caps a shape's own extent at ANNO_MAX_LEN without changing its
// anchor point -- direct spec: "no reason to have any single line
// bigger than that."
function annoClampLen(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len <= ANNO_MAX_LEN || len === 0) return { x1, y1 };
  const s = ANNO_MAX_LEN / len;
  return { x1: x0 + dx * s, y1: y0 + dy * s };
}

function annoEl(tag, attrs) {
  const el = document.createElementNS(ANNO_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// The actual halo: identical geometry drawn twice, black wider stroke
// first, white narrower stroke on top. `scale` lets a caller thin the
// whole halo down proportionally -- Number's own ring uses half scale,
// since up to 12 of them can share one photo and a full-weight ring
// per number reads as visual noise the arrow/line/plain-circle tools
// don't have to deal with.
function annoHaloed(tag, attrs, groupAttrs, scale) {
  const s = scale || 1;
  const g = annoEl("g", groupAttrs || {});
  g.appendChild(annoEl(tag, { ...attrs, stroke: "#000", "stroke-width": 2.4 * s, fill: attrs.fill === "none" || !attrs.fill ? "none" : "#000" }));
  g.appendChild(annoEl(tag, { ...attrs, stroke: "#fff", "stroke-width": 1.1 * s, fill: attrs.fill === "none" || !attrs.fill ? "none" : attrs.fill }));
  return g;
}

// White fill + red border, matching the handle convention every major
// design tool (Figma, Sketch, Google Slides) actually uses -- confirmed
// by direct research after "handles... look broken instead of grab
// here." The visible dot stays modest, but the actual clickable/
// touchable area is a separate, much larger invisible circle
// (pointer-events:all so it's hittable despite being unpainted) --
// WCAG 2.5.8 wants a real 24px+ target, Apple's HIG recommends 44px;
// the old handle's visible-only hit area was under 10px on a typical
// box size, which is exactly why it felt unreliable to grab.
function annoHandle(cx, cy, extraAttrs, cursor) {
  const g = annoEl("g", { ...extraAttrs, style: `cursor:${cursor || "grab"};` });
  g.appendChild(annoEl("circle", { cx, cy, r: 4.2, fill: "transparent", "pointer-events": "all" }));
  g.appendChild(annoEl("circle", { cx, cy, r: 1.8, class: "anno-handle" }));
  return g;
}

// The SVG's viewBox is a square 0-100 grid, but #targetBox almost never
// is (bboxes are rarely square) -- preserveAspectRatio="none" stretches
// X and Y by different amounts to fill it, so a plain <circle> renders
// as a visible oval, not a circle. Real question, confirmed live: a
// 636x476 box rendered a "circle" at 120x90px. Every circle/number
// below draws as an <ellipse> instead, with ry inflated by this exact
// ratio to cancel the stretch back out -- computed fresh per render,
// never baked into stored data, since the box's own aspect can change
// (a maintainer resizing it) between saves.
function annoBoxAspect() {
  const rect = document.getElementById("annotationLayer").getBoundingClientRect();
  return rect.height > 0 ? rect.width / rect.height : 1;
}

function renderAnnotations() {
  annoRenderAttribution();
  const aspect = annoBoxAspect();
  const svg = document.getElementById("annotationLayer");
  svg.innerHTML = "";
  annotations.forEach((a) => {
    const g = annoEl("g", { class: "anno-shape", "data-anno-id": a.id });
    // Every shape gets a generously-sized, fully transparent hit area
    // UNDER its visible geometry -- pointer-events:all so it's
    // clickable/touchable despite being unpainted. Real report: without
    // this, clicking anywhere but the thin visible stroke (the whole
    // interior of a circle/number, most of a text box) missed the
    // shape entirely and fell through to "create a new one" instead of
    // selecting the existing one to move.
    if (a.type === "arrow" || a.type === "line") {
      g.appendChild(annoEl("line", { x1: a.x0, y1: a.y0, x2: a.x1, y2: a.y1, stroke: "transparent", "stroke-width": 6, "pointer-events": "all" }));
      g.appendChild(annoHaloed("line", { x1: a.x0, y1: a.y0, x2: a.x1, y2: a.y1, "stroke-linecap": "round" }));
      if (a.type === "arrow") {
        const angle = Math.atan2(a.y0 - a.y1, a.x0 - a.x1);
        const hl = 3.4, spread = 0.5;
        const p1x = a.x0 - hl * Math.cos(angle - spread), p1y = a.y0 - hl * Math.sin(angle - spread);
        const p2x = a.x0 - hl * Math.cos(angle + spread), p2y = a.y0 - hl * Math.sin(angle + spread);
        g.appendChild(annoHaloed("polyline", { points: `${p1x},${p1y} ${a.x0},${a.y0} ${p2x},${p2y}`, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }));
      }
    } else if (a.type === "circle" || a.type === "number") {
      const ry = a.r * aspect;
      // A filled disc, not just a wide ring -- clicking anywhere inside
      // a circle/number (not only right on its edge) should grab it.
      g.appendChild(annoEl("ellipse", { cx: a.cx, cy: a.cy, rx: a.r, ry, fill: "transparent", "pointer-events": "all" }));
      // Number's own ring renders at half weight (scale 0.5) -- direct
      // feedback: up to a dozen of these can share one photo, and a
      // full-weight ring on every one reads as clutter the arrow/line/
      // plain-circle tools don't have to deal with.
      g.appendChild(annoHaloed("ellipse", { cx: a.cx, cy: a.cy, rx: a.r, ry, fill: "none" }, null, a.type === "number" ? 0.5 : 1));
      if (a.type === "number") {
        const fontSize = Math.max(2, a.r * 1.1);
        g.appendChild(annoEl("text", {
          x: a.cx, y: a.cy, "font-size": fontSize, "text-anchor": "middle", "dominant-baseline": "central",
          "font-weight": "700", fill: "#fff", stroke: "#000", "stroke-width": fontSize * 0.12, "paint-order": "stroke fill", "pointer-events": "none",
        })).textContent = a.value;
      }
    } else if (a.type === "text" && a.frame === "circle") {
      // Same treatment as Number -- aspect-corrected ellipse so it
      // reads as a real circle regardless of the box's own shape,
      // full-weight ring since (unlike Number) these don't tend to
      // stack a dozen to a photo.
      const ry = a.r * aspect;
      g.appendChild(annoEl("ellipse", { cx: a.cx, cy: a.cy, rx: a.r, ry, fill: "transparent", "pointer-events": "all" }));
      g.appendChild(annoHaloed("ellipse", { cx: a.cx, cy: a.cy, rx: a.r, ry, fill: "none" }));
      const fontSize = Math.max(2, a.r * 1.1);
      g.appendChild(annoEl("text", {
        x: a.cx, y: a.cy, "font-size": fontSize, "text-anchor": "middle", "dominant-baseline": "central",
        "font-weight": "700", fill: "#fff", stroke: "#000", "stroke-width": fontSize * 0.12, "paint-order": "stroke fill", "pointer-events": "none",
      })).textContent = a.content || "";
    } else if (a.type === "text") { // frame === "rect"
      g.appendChild(annoEl("rect", { x: a.x, y: a.y, width: a.w, height: a.h, fill: "transparent", "pointer-events": "all" }));
      g.appendChild(annoHaloed("rect", { x: a.x, y: a.y, width: a.w, height: a.h, fill: "none", rx: 0.6 }));
      const fontSize = Math.max(2.5, a.h * 0.6);
      g.appendChild(annoEl("text", {
        x: a.x + a.w / 2, y: a.y + a.h / 2, "font-size": fontSize, "text-anchor": "middle", "dominant-baseline": "central",
        "font-weight": "700", fill: "#fff", stroke: "#000", "stroke-width": fontSize * 0.12, "paint-order": "stroke fill", "pointer-events": "none",
      })).textContent = a.content || "";
    }
    svg.appendChild(g);

    // Move/edit handles only show for whichever tool is currently
    // active, scoped to shapes of that exact type -- direct spec:
    // "whenever selected, the move/edit tags show of all components
    // [the active tool owns], otherwise hide." Not a per-shape click-
    // to-select state; the active TOOL is what shows or hides them.
    if (annoTool === a.type) {
      if (a.type === "arrow" || a.type === "line") {
        svg.appendChild(annoHandle(a.x0, a.y0, { "data-anno-id": a.id, "data-anno-handle": "p0" }, "grab"));
        svg.appendChild(annoHandle(a.x1, a.y1, { "data-anno-id": a.id, "data-anno-handle": "p1" }, "grab"));
      } else if (a.type === "circle" || a.type === "number") {
        svg.appendChild(annoHandle(a.cx + a.r, a.cy, { "data-anno-id": a.id, "data-anno-handle": "radius" }, "ew-resize"));
      } else if (a.type === "text" && a.frame === "circle") {
        svg.appendChild(annoHandle(a.cx + a.r, a.cy, { "data-anno-id": a.id, "data-anno-handle": "radius" }, "ew-resize"));
        const pencilCx = a.cx, pencilCy = a.cy - a.r * aspect - 3;
        const pencil = annoEl("g", { "data-anno-id": a.id, "data-anno-handle": "edit", style: "cursor:pointer;" });
        pencil.appendChild(annoEl("circle", { cx: pencilCx, cy: pencilCy, r: 3.2, fill: "transparent", "pointer-events": "all" }));
        const pencilIcon = annoEl("text", {
          x: pencilCx, y: pencilCy, "font-size": 4, "text-anchor": "middle", "dominant-baseline": "central",
          fill: "#fff", stroke: "#000", "stroke-width": 0.5, "paint-order": "stroke fill",
        });
        pencilIcon.textContent = "✎";
        pencil.appendChild(pencilIcon);
        svg.appendChild(pencil);
      } else if (a.type === "text") { // frame === "rect"
        // Same corner-resize cursor already used for the crop-box/bbox
        // corner handles elsewhere on this page -- one consistent
        // convention for "this drags to resize," not a different one
        // invented for this tool.
        svg.appendChild(annoHandle(a.x + a.w, a.y + a.h, { "data-anno-id": a.id, "data-anno-handle": "resize" }, "nwse-resize"));
        const pencil = annoEl("g", { "data-anno-id": a.id, "data-anno-handle": "edit", style: "cursor:pointer;" });
        pencil.appendChild(annoEl("circle", { cx: a.x - 0.2, cy: a.y - 2.2, r: 3.2, fill: "transparent", "pointer-events": "all" }));
        const pencilIcon = annoEl("text", {
          x: a.x - 0.2, y: a.y - 2.2, "font-size": 4, "text-anchor": "middle", "dominant-baseline": "central",
          fill: "#fff", stroke: "#000", "stroke-width": 0.5, "paint-order": "stroke fill",
        });
        pencilIcon.textContent = "✎";
        pencil.appendChild(pencilIcon);
        svg.appendChild(pencil);
      }
    }
  });
}

function annoNewShapeFor(tool, x, y) {
  const id = `a${Date.now()}${Math.floor(Math.random() * 1000)}`;
  // Real attribution, not assumed -- same reasoning the photo-credit
  // tag already applies to a contributor's own photo (patcher.js's
  // drawCreditTab): who added a specific arrow/circle/number/label is
  // worth knowing later, the same way whose photo it is already is.
  const annotatedBy = BlaydeAuth.getSession()?.username || null;
  if (tool === "arrow" || tool === "line") return { id, type: tool, x0: x, y0: y, x1: x, y1: y, annotatedBy };
  if (tool === "circle") return { id, type: "circle", cx: x, cy: y, r: 0.1, annotatedBy };
  // Starts at its real minimum size immediately, not 0.1 -- direct
  // report: the very first rendered frame (before any drag movement
  // reaches the clamp in annoPointerMove) showed a near-invisible dot,
  // "looks like a dog[dot] on first press." A number needs to be
  // legible the instant it's placed, drag or no drag.
  if (tool === "number") return { id, type: "number", cx: x, cy: y, r: annoMinNumberRadius(annoNextNumber), value: annoNextNumber, annotatedBy };
  if (tool === "text") {
    if (annoTextFrame === "circle") {
      return { id, type: "text", frame: "circle", cx: x, cy: y, r: annoMinTextRadius(""), content: "", annotatedBy };
    }
    return { id, type: "text", frame: "rect", x, y, w: Math.min(8, ANNO_MAX_LEN), h: Math.min(6, ANNO_MAX_LEN), content: "", annotatedBy };
  }
  return null;
}

document.getElementById("annotationLayer").addEventListener("mousedown", (e) => annoPointerDown(e));
document.getElementById("annotationLayer").addEventListener("touchstart", (e) => { e.preventDefault(); annoPointerDown(e); }, { passive: false });
document.addEventListener("mousemove", (e) => annoPointerMove(e));
document.addEventListener("touchmove", (e) => { if (annoDrag) e.preventDefault(); annoPointerMove(e); }, { passive: false });
document.addEventListener("mouseup", annoPointerUp);
document.addEventListener("touchend", annoPointerUp);

function annoPointerDown(e) {
  // .closest(), not a direct dataset read off e.target -- real bug,
  // caught live: both handles and shape hit-areas are wrapped in a <g>
  // that actually carries data-anno-id/data-anno-handle, but a click
  // lands on whichever inner element (a circle, a line) is directly
  // under the cursor, which never had those attributes itself. Every
  // click that wasn't precisely on the outermost element fell through
  // to "empty space," which with a tool still active meant a new shape
  // instead of grabbing the existing one.
  const handleEl = e.target.closest?.("[data-anno-handle]");
  const shapeEl = e.target.closest?.("[data-anno-id]");
  const handleId = handleEl?.dataset.annoHandle;
  const shapeId = handleEl?.dataset.annoId || shapeEl?.dataset.annoId;
  const p = annoPointFromEvent(e);
  if (handleId === "edit") {
    annoOpenTextEditor(shapeId);
    return;
  }
  if (shapeId) {
    const shape = annotations.find((a) => a.id === shapeId);
    if (!shape) return;
    annoLastInteractedId = shapeId;
    annoSnapshot(); // before this drag mutates it, so Ctrl+Z reverts the whole gesture, not one intermediate frame
    annoDrag = { mode: handleId ? "handle" : "move", id: shapeId, handle: handleId, startX: p.x, startY: p.y, orig: { ...shape } };
    return;
  }
  if (!annoTool) return; // no tool active -- clicking empty space does nothing
  annoSnapshot();
  const shape = annoNewShapeFor(annoTool, p.x, p.y);
  annotations.push(shape);
  annoLastInteractedId = shape.id;
  annoDrag = { mode: "create", id: shape.id, startX: p.x, startY: p.y, orig: { ...shape } };
  renderAnnotations();
}

// One snapshot per whole gesture (a full create/move/resize, not every
// intermediate mousemove frame), so Ctrl+Z undoes "that drag," not one
// pixel of it. Capped so a very long review session can't grow this
// unbounded.
function annoSnapshot() {
  annoHistory.push(JSON.parse(JSON.stringify(annotations)));
  if (annoHistory.length > ANNO_HISTORY_MAX) annoHistory.shift();
}

function annoUndo() {
  if (!annoHistory.length) return;
  annotations = annoHistory.pop();
  annoLastInteractedId = null;
  renderAnnotations();
}

function annoDeleteLastInteracted() {
  if (!annoLastInteractedId || !annotations.some((a) => a.id === annoLastInteractedId)) return;
  annoSnapshot();
  annotations = annotations.filter((a) => a.id !== annoLastInteractedId);
  annoLastInteractedId = null;
  renderAnnotations();
}

document.addEventListener("keydown", (e) => {
  // Never hijack Delete/Backspace while actually typing -- deleting a
  // character in the text-label editor shouldn't also delete the whole
  // shape underneath it.
  const typing = document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);
  if (typing) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    annoDeleteLastInteracted();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    annoUndo();
  }
});

function annoPointerMove(e) {
  if (!annoDrag) return;
  const p = annoPointFromEvent(e);
  const shape = annotations.find((a) => a.id === annoDrag.id);
  if (!shape) return;
  const o = annoDrag.orig;
  const dx = p.x - annoDrag.startX, dy = p.y - annoDrag.startY;

  if (shape.type === "arrow" || shape.type === "line") {
    if (annoDrag.mode === "move") {
      shape.x0 = annoClamp01(o.x0 + dx); shape.y0 = annoClamp01(o.y0 + dy);
      shape.x1 = annoClamp01(o.x1 + dx); shape.y1 = annoClamp01(o.y1 + dy);
    } else {
      // "create" and dragging the tail handle ("p1") both extend the
      // same endpoint; dragging the head handle ("p0") moves the head
      // instead -- matches the spec's "first click-down starts the
      // HEAD, dragging extends the tail" for a fresh arrow, while still
      // letting either end be adjusted afterward once it exists.
      if (annoDrag.mode === "handle" && annoDrag.handle === "p0") {
        shape.x0 = annoClamp01(p.x); shape.y0 = annoClamp01(p.y);
      } else {
        const clamped = annoClampLen(shape.x0, shape.y0, annoClamp01(p.x), annoClamp01(p.y));
        shape.x1 = clamped.x1; shape.y1 = clamped.y1;
      }
    }
  } else if (shape.type === "circle" || shape.type === "number" || (shape.type === "text" && shape.frame === "circle")) {
    if (annoDrag.mode === "move") {
      shape.cx = annoClamp01(o.cx + dx); shape.cy = annoClamp01(o.cy + dy);
    } else {
      const r = Math.min(ANNO_MAX_LEN / 2, Math.hypot(p.x - shape.cx, p.y - shape.cy));
      shape.r = shape.type === "number" ? Math.max(annoMinNumberRadius(shape.value), r)
        : shape.type === "text" ? Math.max(annoMinTextRadius(shape.content), r)
        : Math.max(0.1, r);
    }
  } else if (shape.type === "text") { // frame === "rect"
    if (annoDrag.mode === "move") {
      shape.x = annoClamp01(o.x + dx); shape.y = annoClamp01(o.y + dy);
    } else {
      shape.w = Math.max(3, Math.min(ANNO_MAX_LEN, o.w + dx));
      shape.h = Math.max(2.5, Math.min(ANNO_MAX_LEN, o.h + dy));
    }
  }
  renderAnnotations();
}

// Derived from real font metrics at render time, not a hardcoded pixel
// guess -- measures the digit(s) at the size renderAnnotations will
// actually draw them at, so the minimum stays correct regardless of
// how many digits `value` ends up being (1-12, per the real use case).
// Shared by Number and circle-frame Text -- both render as a haloed
// ellipse with centered text, so both need their minimum radius
// measured off the actual string they'll show, at the same font-size
// they'll actually render at (see renderAnnotations' fontSize = r*1.1
// below) -- an old, smaller probe font-size undersold the real
// legible size. Direct report: "much bigger... looks like a dot on
// first press."
function annoMinRadiusFor(str) {
  const probe = document.createElementNS(ANNO_NS, "text");
  probe.setAttribute("font-size", 7);
  probe.setAttribute("font-weight", "700");
  probe.setAttribute("visibility", "hidden");
  probe.textContent = str;
  document.getElementById("annotationLayer").appendChild(probe);
  let width = 5;
  try { width = probe.getBBox().width || width; } catch (e) { /* not yet in a laid-out document -- fall back */ }
  probe.remove();
  // Generous padding around the content, not a tight fit around it.
  return Math.max(5, width * 0.9 + 2);
}

function annoMinNumberRadius(value) {
  return annoMinRadiusFor(String(value ?? 1));
}

// Empty content (a freshly-placed label, before typing) probes the
// same "1" Number's own default uses -- direct spec: Text's circle
// should default to the SAME size as Number's, not a bigger one sized
// for a worst-case 3-character string (measured "WWW" at ~20 units vs.
// "1" at ~5 -- four times the radius, nowhere near "same default
// size"). If real content ends up wider than that once typed,
// annoSaveTextEdit grows the radius to fit rather than clipping it.
function annoMinTextRadius(content) {
  return annoMinRadiusFor(content && content.length ? content : "1");
}

function annoPointerUp() {
  if (!annoDrag) return;
  const wasCreate = annoDrag.mode === "create";
  const shape = annotations.find((a) => a.id === annoDrag.id);
  annoDrag = null;
  if (!shape) return;
  if (shape.type === "number" && wasCreate) {
    annoNextNumber += 1;
    document.getElementById("annoNextNumberInput").value = annoNextNumber;
  }
  if (shape.type === "text" && wasCreate) {
    annoOpenTextEditor(shape.id);
  }
  renderAnnotations();
}

function annoOpenTextEditor(shapeId) {
  const shape = annotations.find((a) => a.id === shapeId);
  if (!shape) return;
  annoEditingTextId = shapeId;
  const row = document.getElementById("annoTextEditRow");
  const input = document.getElementById("annoTextInput");
  input.value = shape.content || "";
  row.style.display = "flex";
  input.focus();
}

function annoSaveTextEdit() {
  const shape = annotations.find((a) => a.id === annoEditingTextId);
  if (shape) {
    annoSnapshot();
    shape.content = document.getElementById("annoTextInput").value.slice(0, ANNO_TEXT_MAXLEN);
    // A circle-frame label sized for empty content could otherwise
    // clip its own text once real characters go in.
    if (shape.frame === "circle") shape.r = Math.max(shape.r, annoMinTextRadius(shape.content));
    annoLastInteractedId = shape.id;
  }
  document.getElementById("annoTextEditRow").style.display = "none";
  annoEditingTextId = null;
  renderAnnotations();
}
document.getElementById("annoTextDoneBtn").addEventListener("click", annoSaveTextEdit);
// Enter saves, same as clicking Save -- a 3-character label doesn't
// need a mouse trip just to confirm it.
document.getElementById("annoTextInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); annoSaveTextEdit(); }
});

// Short, tool-specific guidance -- direct request: keep it friendly and
// concise, and change what it says depending on what's actually
// selected, rather than one static block of instructions up front that
// a maintainer has to remember five tools' worth of at once.
const ANNO_TOOL_HELP = {
  arrow: "Click to plant the arrowhead, drag to the tail, release.",
  line: "Click to start the line, drag to the other end, release.",
  circle: "Click for the center, drag out to set the radius.",
  number: "Click to drop the next number. Change “Next number” first if you need to skip ahead.",
  text: "Click to place a short label (3 characters max), then use its pencil to edit.",
};

// Real, visible attribution -- who actually drew what's on this photo,
// same "who did this" question the contributor's own photo credit
// already answers. Shown whenever at least one shape carries it,
// listing each distinct annotator once (usually one maintainer, but
// more than one could touch the same PR over separate sessions).
function annoRenderAttribution() {
  const el = document.getElementById("annoAttribution");
  if (!el) return;
  const logins = [...new Set(annotations.map((a) => a.annotatedBy).filter(Boolean))];
  if (!logins.length) { el.style.display = "none"; return; }
  el.textContent = `Annotated by: ${logins.map((l) => "@" + l).join(", ")}`;
  el.style.display = "block";
}

function annoRenderHelp() {
  const el = document.getElementById("annoHelp");
  if (!el) return;
  if (annoTool) {
    el.innerHTML = `<strong>${ANNO_TOOL_META[annoTool].word}:</strong> ${ANNO_TOOL_HELP[annoTool]} Click an existing one (its handles are showing) to move or resize it.`;
  } else {
    el.innerHTML = `Pick a tool above to start. <kbd>Delete</kbd> removes whatever you last touched; <kbd>Ctrl</kbd>+<kbd>Z</kbd> (<kbd>&#8984;</kbd>+<kbd>Z</kbd> on Mac) undoes.`;
  }
}

document.querySelectorAll("#annoToolbar [data-anno-tool]").forEach((btn) => {
  btn.textContent = annoLabel(btn.dataset.annoTool);
  btn.addEventListener("click", () => {
    const tool = btn.dataset.annoTool;
    annoTool = annoTool === tool ? null : tool;
    document.querySelectorAll("#annoToolbar [data-anno-tool]").forEach((b) => b.classList.toggle("active", b.dataset.annoTool === annoTool));
    document.getElementById("annoNextNumberRow").style.display = annoTool === "number" ? "inline-flex" : "none";
    document.getElementById("annoTextFrameRow").style.display = annoTool === "text" ? "inline-flex" : "none";
    // Real bug, caught live: switching tools (including turning Text
    // off) left the label editor sitting open with no way to close it
    // short of clicking Save. Any tool click closes it -- an
    // in-progress, unsaved label is discarded, same as clicking away
    // from an editor anywhere else discards it.
    document.getElementById("annoTextEditRow").style.display = "none";
    annoEditingTextId = null;
    annoRenderHelp();
    renderAnnotations();
  });
});

document.getElementById("annoNextNumberInput").addEventListener("change", (e) => {
  annoNextNumber = parseInt(e.target.value, 10) || 1;
});

// Which backing shape the NEXT Text label gets -- doesn't retroactively
// change labels already placed, same as annoNextNumber only affecting
// the next Number placed, not existing ones.
document.querySelectorAll("#annoTextFrameRow [data-anno-frame]").forEach((btn) => {
  btn.addEventListener("click", () => {
    annoTextFrame = btn.dataset.annoFrame;
    document.querySelectorAll("#annoTextFrameRow [data-anno-frame]").forEach((b) => b.classList.toggle("active", b.dataset.annoFrame === annoTextFrame));
  });
});

annoRenderHelp();

function paintBox() {
  const el = document.getElementById("targetBox");
  el.style.left = box.x0 + "px";
  el.style.top = box.y0 + "px";
  el.style.width = (box.x1 - box.x0) + "px";
  el.style.height = (box.y1 - box.y0) + "px";
  if (submittedPhotoImg) document.getElementById("submittedPhotoImg").src = submittedPhotoImg;
  updateFitReadout();
  applyZoom();
}

function updateFitReadout() {
  const boxW = box.x1 - box.x0, boxH = box.y1 - box.y0;
  const boxRatio = boxW / boxH;
  const photoRatio = submittedPhotoAspect;
  const pct = 100 * Math.min(boxRatio, photoRatio) / Math.max(boxRatio, photoRatio);
  document.getElementById("fitReadout").innerHTML =
    `box ratio <b>${boxRatio.toFixed(2)}</b> vs. photo ratio <b>${photoRatio.toFixed(2)}</b> -- `
    + `<b>${pct.toFixed(0)}%</b> fit (100% = no letterboxing when patched)`;
}

// ---- drag to move / resize, same interaction pattern as
// generate_review.py's crop editor ----
const wrap = document.getElementById("compareWrap");
wrap.addEventListener("mousedown", (e) => {
  // Box position/size only adjusts in the full-page view -- direct
  // spec: the zoomed view is for annotating and judging fit, not
  // repositioning, and #zoomViewport.mode-zoomed hides the handles.
  if (!box || reviewViewMode !== "full") return;
  const rect = wrap.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const handle = e.target.closest(".handle");
  if (handle) {
    dragState = { mode: "resize", corner: handle.dataset.corner, startX: x, startY: y, orig: { ...box } };
  } else if (e.target.closest("#targetBox")) {
    dragState = { mode: "move", startX: x, startY: y, orig: { ...box } };
  }
});
wrap.addEventListener("mousemove", (e) => {
  if (!dragState) return;
  const rect = wrap.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const dx = x - dragState.startX, dy = y - dragState.startY;
  const o = dragState.orig;
  if (dragState.mode === "move") {
    const w = o.x1 - o.x0, h = o.y1 - o.y0;
    box = { x0: o.x0 + dx, y0: o.y0 + dy, x1: o.x0 + dx + w, y1: o.y0 + dy + h };
  } else {
    // Anchored on the box's own center, not the opposite corner: the
    // dragged edge moves with the mouse and the opposite edge mirrors
    // it, so the box grows/shrinks around a fixed point instead of
    // sliding sideways every time its ratio changes. Direct feedback:
    // corner-anchored resize made the box visibly drift off the part
    // it was pointing at while adjusting it to fit the photo's shape.
    box = { ...o };
    if (dragState.corner.includes("w")) { box.x0 = o.x0 + dx; box.x1 = o.x1 - dx; }
    if (dragState.corner.includes("e")) { box.x1 = o.x1 + dx; box.x0 = o.x0 - dx; }
    if (dragState.corner.includes("n")) { box.y0 = o.y0 + dy; box.y1 = o.y1 - dy; }
    if (dragState.corner.includes("s")) { box.y1 = o.y1 + dy; box.y0 = o.y0 - dy; }
  }
  if (box.x1 - box.x0 > 10 && box.y1 - box.y0 > 10) paintBox();
});
window.addEventListener("mouseup", () => { dragState = null; });

// ---- manifest-change accept: no photo, no bbox fixup commit needed --
// the proposed change already IS the manifest.json diff, so this is
// just "run the Worker's real validation, then merge." ----
async function acceptManifestChangePR() {
  const session = BlaydeAuth.getSession();
  document.getElementById("acceptBtn").disabled = true;
  document.getElementById("acceptBtn").textContent = "Merging...";
  document.getElementById("rejectBtn").disabled = true;
  try {
    log(`checking and merging request #${currentPR.number}...`);
    const resp = await fetch(`${BlaydeAuth.AUTH_WORKER_URL}accept-manifest-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ repo_url: currentPR.repo_url, pr_number: currentPR.number }),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || result.error) throw new Error(result.error || `Accept failed (${resp.status}).`);
    log(`merged: ${result.summary}`);
    document.getElementById("reviewArea").classList.remove("open");
    showToast("Accepted! Change merged into the manual.");
    initReviewTab();
  } catch (e) {
    log(`accept failed: ${e.message}`);
    document.getElementById("acceptBtn").disabled = false;
    document.getElementById("acceptBtn").textContent = "Accept & merge";
    document.getElementById("rejectBtn").disabled = false;
    loadReviewStatus();
  }
}

// ---- accept: merge the PR for real, then a follow-up commit fixing
// up manifest.json's pixel_bbox IF the maintainer adjusted it. Not
// pushed onto the PR's own branch before merge -- that branch lives on
// the contributor's fork, which this maintainer's token generally
// doesn't have write access to unless "Allow edits from maintainers"
// was enabled, not something to depend on. A separate commit directly
// on the base branch (which the maintainer/org does have write access
// to) sidesteps that entirely -- two clearly-attributed commits
// instead of one that might silently fail. ----
document.getElementById("acceptBtn").addEventListener("click", async () => {
  if (currentPR.isManifestChange) return acceptManifestChangePR();
  const note = (await blaydePrompt("Optional note for the contributor (e.g. \"looks great, thanks!\"):", "")) || "";
  const session = BlaydeAuth.getSession();
  const [owner, repo] = ownerRepo(currentPR.repo_url);
  document.getElementById("acceptBtn").disabled = true;
  document.getElementById("acceptBtn").textContent = "Merging...";
  document.getElementById("rejectBtn").disabled = true;
  try {
    log(`checking and merging request #${currentPR.number}...`);
    // Routed through the Worker, not merged directly with this
    // maintainer's own token -- it independently re-verifies real
    // permission, re-checks the PR changes exactly one real contributed
    // photo (nothing else riding along), re-validates and scans that
    // photo's actual current bytes for embedded metadata, and only then
    // merges (pinned to the exact commit it just checked). None of that
    // is something this page's own UI can guarantee on its own, since a
    // maintainer's browser has no way to stop a fork owner from having
    // changed the branch's content in ways this page never re-fetched.
    const acceptResp = await fetch(`${BlaydeAuth.AUTH_WORKER_URL}accept-photo-pr`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ repo_url: currentPR.repo_url, pr_number: currentPR.number, commit_title: `Merge #${currentPR.number}: ${currentPR.title}` }),
    });
    const acceptResult = await acceptResp.json().catch(() => ({}));
    if (!acceptResp.ok || acceptResult.error) throw new Error(acceptResult.error || `Accept failed (${acceptResp.status}).`);
    log(`merged.`);

    const finalBbox = canvasToBbox(box);
    const bboxChanged = JSON.stringify(finalBbox) !== JSON.stringify(currentPR.original_bbox);
    const annotationsChanged = JSON.stringify(annotations) !== JSON.stringify(currentPR.original_annotations || []);
    if (bboxChanged || annotationsChanged) {
      const parts = [bboxChanged && "position", annotationsChanged && "annotations"].filter(Boolean).join(" and ");
      log(`updating ${currentPR.procedure_id}'s ${parts} in manifest.json (adjusted during review)...`);
      const manifestFile = await githubApi(`/repos/${owner}/${repo}/contents/${currentPR.edition_id}/manifest.json?ref=${currentPR.base_branch}`, session.token);
      const manifestData = JSON.parse(base64ToUtf8(manifestFile.content.replace(/\n/g, "")));
      const entry = manifestData.entries.find((e) => e.procedure_id === currentPR.procedure_id);
      if (entry) {
        if (bboxChanged) entry.pixel_bbox = finalBbox;
        // Vector shapes only, in relative (0-100) coordinates -- never
        // baked into the photo's own pixels, so a later re-crop or a
        // viewer's color preference (see ROADMAP.md) can still apply
        // cleanly. Rendering these into the actual patched PDF is a
        // separate, not-yet-built step (patcher.js); this only commits
        // the editor's own data.
        if (annotationsChanged) entry.annotations = annotations;
        // Real attribution in the commit history itself, not just on
        // the shapes in manifest.json -- same "who did this" question
        // a contributor's own photo credit already answers, applied to
        // whoever drew the arrows/circles/labels on top of it.
        const annotatedByNote = annotationsChanged ? ` (annotated by @${session.username})` : "";
        await githubApi(`/repos/${owner}/${repo}/contents/${currentPR.edition_id}/manifest.json`, session.token, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Adjust ${currentPR.procedure_id}'s ${parts} (reviewed in #${currentPR.number})${annotatedByNote}`,
            content: utf8ToBase64(JSON.stringify(manifestData, null, 2)),
            sha: manifestFile.sha,
            branch: currentPR.base_branch,
          }),
        });
        log(`manifest.json updated.`);
      } else {
        log(`WARNING: ${currentPR.procedure_id} not found in manifest.json anymore -- skipped the position/annotation update.`);
      }
    }

    if (note) {
      await githubApi(`/repos/${owner}/${repo}/issues/${currentPR.number}/comments`, session.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: note }),
      });
    }
    log(`request #${currentPR.number} accepted.`);
    // Closes the viewer and gives a real, hard-to-miss confirmation --
    // direct request, matching org-approval.js's Approve, which already
    // does this same close-out on its own success path.
    document.getElementById("reviewArea").classList.remove("open");
    showToast("Accepted! Photo merged into the manual.");
    initReviewTab();
  } catch (e) {
    log(`accept failed: ${e.message}`);
    // Re-check rather than just re-enabling -- a failed merge attempt
    // often means the real state moved out from under the button (a
    // review got dismissed, a check re-ran and failed) since it was
    // last loaded, and blindly re-enabling would just invite the same
    // failure again with a stale "ready" label.
    document.getElementById("rejectBtn").disabled = false;
    loadReviewStatus();
  }
});

document.getElementById("rejectBtn").addEventListener("click", async () => {
  const note = (await blaydePrompt("Reason for the contributor (helps them fix it and resubmit):", "")) || "";
  const session = BlaydeAuth.getSession();
  const [owner, repo] = ownerRepo(currentPR.repo_url);
  document.getElementById("acceptBtn").disabled = true;
  document.getElementById("rejectBtn").disabled = true;
  try {
    log(`closing request #${currentPR.number}...`);
    if (note) {
      await githubApi(`/repos/${owner}/${repo}/issues/${currentPR.number}/comments`, session.token, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: note }),
      });
    }
    await githubApi(`/repos/${owner}/${repo}/pulls/${currentPR.number}`, session.token, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: "closed" }),
    });
    log(`request #${currentPR.number} closed.`);
    // Same close-out as Accept's success path -- without this the card
    // was left sitting on screen with its buttons disabled and a stale
    // log, even once the request list above it had already refreshed
    // to "No open photo requests."
    document.getElementById("reviewArea").classList.remove("open");
    showToast(note ? "Rejected. The contributor's been notified." : "Rejected. Request closed.");
    initReviewTab();
  } catch (e) {
    log(`reject failed: ${e.message}`);
    updateAcceptButtonState();
    document.getElementById("rejectBtn").disabled = false;
  }
});

// Blayde Manual -- "My Vehicles": each vehicle you maintain, its
// roster, and how active each maintainer's been.
//
// Listing the roster (fetchRoster) uses the maintainer's own OAuth
// token -- GitHub allows any push-or-better collaborator to list
// collaborators. Inviting/removing needs repo Admin, which a maintainer
// here never holds (see auth-worker's handleApproveVehicle), so those
// two go through the Worker's /manage-collaborator instead, using the
// installation token and re-checking the caller's real permission
// server-side.
//
// Repo list comes from maintainer-portal.js's discoverMaintainedRepos()
// (maintainedRepos), filtered to push-or-better + registry-approved.

function ghHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
}

function ownerRepoFromUrl(repoUrl) {
  const [owner, repo] = new URL(repoUrl).pathname.replace(/^\//, "").split("/");
  return { owner, repo };
}

// GitHub's collaborator permissions come back as a set of booleans, not
// one label -- pick the highest for a single, readable roster line.
function highestPermission(perms) {
  if (!perms) return "?";
  if (perms.admin) return "admin";
  if (perms.maintain) return "maintain";
  if (perms.push) return "write";
  if (perms.triage) return "triage";
  if (perms.pull) return "read";
  return "?";
}

// Every real maintainer grant this app makes is permission: "push",
// so "write" maps to "Maintainer" here. admin/maintain stay distinct
// (a real org owner, or a repo transferred outside this app's flow,
// could show one of those). triage/read/"?" are fallbacks that
// shouldn't occur given discoverMaintainedRepos()'s own push-or-better
// filter.
function permissionLabel(permission) {
  return {
    admin: "Admin", maintain: "Maintainer", write: "Maintainer",
    triage: "Limited access", read: "Read-only", "?": "Unknown access",
  }[permission] || permission;
}

function initVehiclesTab() {
  renderVehicleTeams();
}

async function renderVehicleTeams() {
  const wrap = document.getElementById("vehicleTeams");
  wrap.innerHTML = "";
  if (!maintainedRepos.length) {
    wrap.innerHTML = `<p class="sub">No maintained repos passed the registry check.</p>`;
    return;
  }

  // Category is a grouping tier, never a filter -- a maintainer
  // covering a vehicle in Garage and an appliance in Home needs both
  // in one scroll.
  const categoryByRepo = new Map();
  await Promise.all(maintainedRepos.map(async ({ repoUrl }) => {
    categoryByRepo.set(repoUrl, await categoryForRepo(repoUrl));
  }));
  const reposByCategory = new Map();
  maintainedRepos.forEach((entry) => {
    const key = categoryByRepo.get(entry.repoUrl) || null;
    if (!reposByCategory.has(key)) reposByCategory.set(key, []);
    reposByCategory.get(key).push(entry);
  });
  const orderedCategoryKeys = [...CATEGORY_ORDER.filter((c) => reposByCategory.has(c)), ...(reposByCategory.has(null) ? [null] : [])];
  // Shown even with just one category, so the color/icon system stays
  // consistent rather than appearing only once a second category shows up.
  const showCategoryHeadings = orderedCategoryKeys.length > 0;

  for (const categoryKey of orderedCategoryKeys) {
    const reposInCategory = reposByCategory.get(categoryKey);
    let categoryWrap = wrap;
    if (showCategoryHeadings) {
      const categoryGroup = document.createElement("details");
      categoryGroup.open = true;
      categoryGroup.className = "category-group";
      if (categoryKey) categoryGroup.style.setProperty("--accent", CATEGORY_STYLE[categoryKey].accent);
      const label = categoryKey ? categoryKey[0].toUpperCase() + categoryKey.slice(1) : "Uncategorized";
      const icon = categoryKey ? categoryIconSvg(categoryKey) : "";
      const heading = document.createElement("summary");
      heading.className = "category-bar";
      heading.innerHTML = `${icon}${label} (${reposInCategory.length})`;
      categoryGroup.appendChild(heading);
      wrap.appendChild(categoryGroup);
      categoryWrap = categoryGroup;
    }
    for (const { repoUrl, permissions } of reposInCategory) {
      // A vehicle repo can hold more than one edition -- maintainer
      // authority is vehicle-wide, so the roster stays one per repo,
      // but the card names which editions that covers.
      const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
      const registryData = await loadRegistry(CANONICAL_REGISTRY_URL_FOR_REVIEW).catch(() => ({ vehicles: [] }));
      const editions = (registryData.vehicles || [])
        .filter((v) => norm(v.repo_url) === norm(repoUrl))
        .map((v) => v.edition_id);
      const vehicleSlug = await vehicleSlugForRepo(repoUrl);
      // <details>, not a plain div -- collapsible per vehicle, same as
      // the Review Photo Requests list, so a maintainer covering
      // several repos can collapse the ones they're not managing right
      // now. Open by default.
      const card = document.createElement("details");
      card.open = true;
      card.className = "card";
      card.innerHTML = `<summary class="vehicle-bar">${vehicleSlug}</summary>
        <p class="sub" style="margin:0 0 10px;">Covers ${editions.length} edition${editions.length === 1 ? "" : "s"}: ${editions.join(", ")}</p>
        <div class="roster"><p class="sub" style="margin:0;">Loading roster&hellip;</p></div>
        <div class="join-requests" style="margin-top:12px;"></div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <input type="text" class="invite-input" placeholder="GitHub handle to invite" style="flex:1; width:auto; margin:0;">
          <button class="invite-btn" style="margin:0; flex-shrink:0;">Invite</button>
        </div>
        <p class="sub invite-status" style="margin:6px 0 0;"></p>`;
      const rosterEl = card.querySelector(".roster");
      renderRoster(rosterEl, repoUrl);
      const joinRequestsEl = card.querySelector(".join-requests");
      renderJoinRequests(joinRequestsEl, rosterEl, repoUrl);
      const statusEl = card.querySelector(".invite-status");
      card.querySelector(".invite-btn").addEventListener("click", async () => {
        const input = card.querySelector(".invite-input");
        const handle = input.value.trim().replace(/^@/, "");
        if (!handle) return;
        statusEl.textContent = `Inviting @${handle}…`;
        try {
          await inviteCollaborator(repoUrl, handle);
          statusEl.textContent = "";
          input.value = "";
          renderRoster(rosterEl, repoUrl);
        } catch (e) {
          statusEl.textContent = `Couldn't invite @${handle}: ${e.message}`;
        }
      });
      categoryWrap.appendChild(card);
    }
  }
}

// Merges accepted collaborators with still-pending invitations --
// GitHub's collaborator list only contains people who already
// accepted. affiliation=direct excludes org members who only have the
// org's default repository permission, not an explicit grant on this
// repo.
async function fetchRoster(repoUrl) {
  const { owner, repo } = ownerRepoFromUrl(repoUrl);
  const token = BlaydeAuth.getSession().token;
  const [collabResp, inviteResp] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}/collaborators?affiliation=direct&per_page=100`, { headers: ghHeaders(token) }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/invitations?per_page=100`, { headers: ghHeaders(token) }),
  ]);
  const collaborators = collabResp.ok ? await collabResp.json() : [];
  const invitations = inviteResp.ok ? await inviteResp.json() : [];
  return [
    ...collaborators.map((c) => ({ handle: c.login, permission: highestPermission(c.permissions), pending: false })),
    ...invitations.map((i) => ({ handle: i.invitee?.login || "(pending)", permission: i.permissions, pending: true, invitationId: i.id })),
  ];
}

// Reads maintainer-stats.json from the vehicle repo's own root --
// auth-worker's recordMaintainerActivity() keeps it updated server-side
// on every merge/review, so this is one file read here instead of the
// many API calls it'd take to derive the same numbers from PR history
// directly. Fetched the same way as manifest.json/registry.json
// (raw.githubusercontent.com, unauthenticated, tried main then master).
//
// Returns null when the file doesn't exist yet (not backfilled), which
// is distinct from an empty Map (file exists, no entries) -- the
// caller uses null to offer the backfill action instead of showing
// "no activity."
async function fetchMaintainerStats(repoUrl) {
  const { owner, repo } = ownerRepoFromUrl(repoUrl);
  for (const branch of ["main", "master"]) {
    const resp = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/maintainer-stats.json`);
    if (resp.ok) {
      const raw = await resp.json();
      return new Map(Object.entries(raw).map(([handle, s]) => [handle, { merged: s.merged || 0, reviews: s.reviews || 0, lastActive: s.last_active || null }]));
    }
    if (resp.status !== 404) throw new Error(`stats fetch failed (${resp.status})`);
  }
  return null;
}

// One-time historical seed for a vehicle with no maintainer-stats.json
// yet -- see auth-worker's handleBackfillMaintainerStats for the scan
// this triggers server-side.
async function backfillMaintainerStats(repoUrl) {
  const session = BlaydeAuth.getSession();
  const resp = await fetch(`${BlaydeAuth.AUTH_WORKER_URL}backfill-maintainer-stats`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ repo_url: repoUrl }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok || result.error) throw new Error(result.error || `Backfill failed (${resp.status}).`);
  return result;
}

function formatLastActive(dateStr) {
  if (!dateStr) return null;
  const days = Math.floor((Date.parse(new Date().toISOString()) - Date.parse(dateStr)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

async function renderRoster(rosterEl, repoUrl) {
  let members;
  try {
    members = await fetchRoster(repoUrl);
  } catch (e) {
    rosterEl.innerHTML = `<p class="sub" style="margin:0; color:#ff6b6b;">Couldn't load the roster: ${e.message}</p>`;
    return;
  }
  rosterEl.innerHTML = "";
  if (!members.length) {
    rosterEl.innerHTML = `<p class="sub" style="margin:0;">No maintainers yet -- invite someone below.</p>`;
    return;
  }
  // Fire-and-forget -- stats patch into each row once resolved, without
  // the roster (names, permissions, Remove buttons) waiting on it.
  fetchMaintainerStats(repoUrl).then((stats) => {
    if (stats === null) {
      // One button for the whole roster -- backfilling is per-vehicle,
      // not per-maintainer.
      rosterEl.querySelectorAll("[data-stats-for]").forEach((el) => { el.textContent = ""; });
      const prompt = document.createElement("p");
      prompt.className = "sub";
      prompt.style.margin = "4px 0 0";
      prompt.innerHTML = `Activity stats aren't set up for this vehicle yet. <button class="secondary backfill-stats-btn" style="margin:0; padding:4px 10px; font-size:0.82rem;">Backfill activity stats</button>`;
      rosterEl.appendChild(prompt);
      prompt.querySelector(".backfill-stats-btn").addEventListener("click", async (e) => {
        e.target.disabled = true;
        e.target.textContent = "Backfilling…";
        try {
          await backfillMaintainerStats(repoUrl);
          renderRoster(rosterEl, repoUrl);
        } catch (err) {
          prompt.innerHTML = `<span style="color:#ff6b6b;">Backfill failed: ${err.message}</span>`;
        }
      });
      return;
    }
    stats.forEach((s, handle) => {
      const el = rosterEl.querySelector(`[data-stats-for="${CSS.escape(handle)}"]`);
      if (!el) return; // not a current collaborator -- no row to patch
      const lastActive = formatLastActive(s.lastActive);
      const parts = [`${s.merged} merged`, `${s.reviews} review${s.reviews === 1 ? "" : "s"}`];
      if (lastActive) parts.push(`last active ${lastActive}`);
      el.textContent = parts.join(" · ");
    });
  }).catch(() => { /* best-effort -- roster itself already rendered fine without this */ });
  members.forEach((m) => {
    const row = document.createElement("div");
    row.className = "pr-row";
    row.innerHTML = `
      <div>
        <div class="pr-title">@${m.handle} ${m.pending ? `<span style="font-size:0.7rem; font-weight:700; color:#8a8f98;">&#9679; invite pending</span>` : ""}</div>
        <div class="pr-meta">${permissionLabel(m.permission)}</div>
        <div class="pr-meta" data-stats-for="${m.handle}" style="margin-top:2px;">${m.pending ? "" : "Loading activity&hellip;"}</div>
      </div>
      <button class="secondary remove-btn" data-handle="${m.handle}" data-pending="${m.pending}" data-invitation-id="${m.invitationId || ""}">Remove</button>
    `;
    rosterEl.appendChild(row);
  });
  rosterEl.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const vehicleSlug = await vehicleSlugForRepo(repoUrl);
      const isPending = btn.dataset.pending === "true";
      if (!(await blaydeConfirm(`Remove @${btn.dataset.handle} as a maintainer of ${vehicleSlug}?`))) return;
      try {
        if (isPending) await cancelInvitation(repoUrl, btn.dataset.invitationId);
        else await removeCollaborator(repoUrl, btn.dataset.handle);
        renderRoster(rosterEl, repoUrl);
      } catch (e) {
        alert(`Couldn't remove @${btn.dataset.handle}: ${e.message}`);
      }
    });
  });
}

// Finds open "join as a maintainer" issues via an unquoted, single-word
// marker -- a quoted phrase can silently fail GitHub's search
// tokenizer.
async function fetchJoinRequests(repoUrl) {
  const { owner, repo } = ownerRepoFromUrl(repoUrl);
  const token = BlaydeAuth.getSession().token;
  const resp = await fetch(
    `https://api.github.com/search/issues?q=${encodeURIComponent(`type:issue state:open repo:${owner}/${repo} blaydemaintainerrequest in:body`)}`,
    { headers: ghHeaders(token) }
  );
  if (!resp.ok) throw new Error(`GitHub search API error (${resp.status})`);
  const result = await resp.json();
  return (result.items || []).map((issue) => ({ number: issue.number, url: issue.html_url, handle: issue.user.login }));
}

async function closeJoinRequest(repoUrl, issueNumber) {
  const { owner, repo } = ownerRepoFromUrl(repoUrl);
  const token = BlaydeAuth.getSession().token;
  await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: "PATCH",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ state: "closed" }),
  });
}

async function renderJoinRequests(el, rosterEl, repoUrl) {
  let requests;
  try {
    requests = await fetchJoinRequests(repoUrl);
  } catch (e) {
    el.innerHTML = "";
    return;
  }
  if (!requests.length) { el.innerHTML = ""; return; }
  el.innerHTML = `<p class="sub" style="margin:0 0 6px; font-weight:700;">Requests to join (${requests.length})</p>`;
  requests.forEach((req) => {
    const row = document.createElement("div");
    row.className = "pr-row";
    row.innerHTML = `
      <div class="pr-title">@${req.handle} <a href="${req.url}" target="_blank" rel="noopener" class="pr-link" style="font-weight:400;">view request</a></div>
      <div>
        <button class="invite-request-btn" data-handle="${req.handle}" data-number="${req.number}" style="margin:0;">Invite</button>
        <button class="secondary decline-request-btn" data-number="${req.number}" style="margin:0 0 0 6px;">Decline</button>
      </div>
    `;
    el.appendChild(row);
  });
  el.querySelectorAll(".invite-request-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await inviteCollaborator(repoUrl, btn.dataset.handle);
        await closeJoinRequest(repoUrl, btn.dataset.number);
        renderRoster(rosterEl, repoUrl);
        renderJoinRequests(el, rosterEl, repoUrl);
      } catch (e) {
        btn.disabled = false;
        alert(`Couldn't invite @${btn.dataset.handle}: ${e.message}`);
      }
    });
  });
  el.querySelectorAll(".decline-request-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await closeJoinRequest(repoUrl, btn.dataset.number);
        renderJoinRequests(el, rosterEl, repoUrl);
      } catch (e) {
        btn.disabled = false;
        alert(`Couldn't decline: ${e.message}`);
      }
    });
  });
}

// Invite/remove/cancel go through the Worker's /manage-collaborator
// (installation token), which re-checks the caller's real permission
// on this repo server-side -- the caller's own token here only proves
// who's asking.
async function callManageCollaborator(body) {
  const token = BlaydeAuth.getSession().token;
  const resp = await fetch(`${BlaydeAuth.AUTH_WORKER_URL}manage-collaborator`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok || result.error) throw new Error(result.error || `Request failed (${resp.status}).`);
  return result;
}

async function inviteCollaborator(repoUrl, handle) {
  await callManageCollaborator({ repo_url: repoUrl, handle, action: "invite" });
}

async function removeCollaborator(repoUrl, handle) {
  await callManageCollaborator({ repo_url: repoUrl, handle, action: "remove" });
}

async function cancelInvitation(repoUrl, invitationId) {
  await callManageCollaborator({ repo_url: repoUrl, invitation_id: invitationId, action: "cancel_invitation" });
}

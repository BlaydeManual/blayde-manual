// Blayde Manual -- "My Vehicles": each vehicle you maintain and who
// else has real write access to it.
//
// Listing the roster (fetchRoster) uses the maintainer's own classic
// OAuth token directly -- GitHub allows any push-or-better collaborator
// to list collaborators, so no privileged credential is needed just to
// look. Inviting/removing is different: GitHub only allows collaborator
// management at repo Admin (confirmed against GitHub's own repository-
// roles docs -- Maintain, one level down, does NOT include it), and
// Admin also carries real, unrelated blast radius (delete the repo,
// transfer it, flip it back private, rename it and silently break
// registry.json's repo_url pointer) that a maintainer who just needs to
// invite a contributor has no reason to hold. Those two actions go
// through the Worker's /manage-collaborator instead, using the
// installation token, re-checking the caller's real permission
// server-side rather than trusting anything this page claims -- the
// same "zero trust, bare minimum for the app's own functions" floor as
// the automatic grant on approval, so every real maintainer stays at
// `push`, never Admin, on their own repos.
//
// Repo list comes from maintainer-portal.js's discoverMaintainedRepos()
// (maintainedRepos -- real GET /user/repos, filtered to push-or-better
// + registry-approved), not a mock -- everything in that list already
// qualifies to manage its own roster, since push-or-better is exactly
// what /manage-collaborator itself requires.

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

  // Category as a grouping tier, never a filter -- same reasoning as
  // review-panel.js's categoryForRepo: a maintainer covering a vehicle
  // in Garage and an appliance in Home needs both in one scroll.
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
  const showCategoryHeadings = orderedCategoryKeys.length > 1;

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
      // This vehicle no longer implies one manual (see ROADMAP.md's
      // multi-manual correction) -- the roster below is correctly still
      // one per repo (maintainer authority is vehicle-wide), but it's
      // worth naming which editions that authority actually covers.
      const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
      const registryData = await loadRegistry(CANONICAL_REGISTRY_URL_FOR_REVIEW).catch(() => ({ vehicles: [] }));
      const editions = (registryData.vehicles || [])
        .filter((v) => norm(v.repo_url) === norm(repoUrl))
        .map((v) => v.edition_id);
      const vehicleSlug = await vehicleSlugForRepo(repoUrl);
      // Anything reaching this point already passed discoverMaintainedRepos()'s
      // own push-or-better filter, which is exactly what /manage-collaborator
      // itself requires server-side -- no separate client-side gate needed,
      // unlike the old admin-only design.
      // <details>, not a plain div -- direct request: collapsible per
      // level, same as the Review Photo Requests list, so a maintainer
      // covering several unrelated repos can collapse the ones they're
      // not actively managing right now instead of scrolling past them.
      // Open by default so nothing hides on first load.
      const card = document.createElement("details");
      card.open = true;
      card.className = "card";
      card.innerHTML = `<summary class="vehicle-bar">${vehicleSlug}</summary>
        <p class="sub" style="margin:0 0 10px;">Covers ${editions.length} edition${editions.length === 1 ? "" : "s"}: ${editions.join(", ")}</p>
        <div class="roster"><p class="sub" style="margin:0;">Loading roster&hellip;</p></div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <input type="text" class="invite-input" placeholder="GitHub handle to invite" style="flex:1; width:auto; margin:0;">
          <button class="invite-btn" style="margin:0; flex-shrink:0;">Invite</button>
        </div>
        <p class="sub invite-status" style="margin:6px 0 0;"></p>`;
      const rosterEl = card.querySelector(".roster");
      renderRoster(rosterEl, repoUrl);
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

// Merges accepted collaborators (GET .../collaborators) with still-
// pending invitations (GET .../invitations) -- GitHub's collaborator
// list only ever contains people who already accepted, so a roster
// built from that alone would make someone just invited look like the
// invite silently did nothing.
//
// affiliation=direct is required, not the default -- confirmed live:
// without it, GitHub's default (affiliation=all) also returns every
// org member who merely has the org's default repository permission
// (read-only for this org), not just people with a real, explicit
// grant on THIS repo. Every BlaydeManual member would otherwise show
// up on every vehicle's roster as a phantom "read" maintainer.
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
  members.forEach((m) => {
    const row = document.createElement("div");
    row.className = "pr-row";
    row.innerHTML = `
      <div>
        <div class="pr-title">@${m.handle} ${m.pending ? `<span style="font-size:0.7rem; font-weight:700; color:#8a8f98;">&#9679; invite pending</span>` : ""}</div>
        <div class="pr-meta">${m.permission} access</div>
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

// Invite/remove/cancel all go through the Worker's /manage-collaborator
// (installation token) instead of calling GitHub directly -- GitHub
// only allows collaborator management at repo Admin, which this app
// deliberately never grants a maintainer just to let them invite a
// contributor (see the file header). The Worker re-checks the caller's
// real permission on this specific repo server-side before doing
// anything; the caller's own OAuth token here only proves who's asking.
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

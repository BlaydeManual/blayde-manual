// Blayde Manual -- "My Vehicles": each vehicle you maintain and who
// else has real write access to it. Real GitHub collaborator API calls
// as of this pass, using the maintainer's OWN classic OAuth token --
// managing collaborators on a repo you already have admin rights to is
// exactly the kind of action SECURITY.md's "two trust models" section
// describes as belonging to the caller's own token, not the Worker: no
// privileged installation credential is involved, because none is
// needed -- GitHub itself enforces that only a real repo admin can add
// or remove a collaborator, the same way it already enforces who can
// merge a PR in review-panel.js.
//
// Repo list comes from maintainer-portal.js's discoverMaintainedRepos()
// (maintainedRepos -- real GET /user/repos, filtered to push-or-better
// + registry-approved), not a mock. Per-repo "can I manage this
// roster" is the real `permissions.admin` GitHub already returned for
// that repo -- someone with push but not admin sees a read-only roster,
// same as GitHub's own UI would show them.

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
  for (const { repoUrl, permissions } of maintainedRepos) {
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
    const canManage = !!permissions?.admin; // GitHub itself would refuse add/remove without this -- gate the controls to match, not just the calls
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h3 class="vehicle-bar">${vehicleSlug}</h3>
      <p class="sub" style="margin:0 0 10px;">Covers ${editions.length} edition${editions.length === 1 ? "" : "s"}: ${editions.join(", ")}</p>
      <div class="roster"><p class="sub" style="margin:0;">Loading roster&hellip;</p></div>
      ${canManage ? `<div style="display:flex; gap:8px; margin-top:12px;">
        <input type="text" class="invite-input" placeholder="GitHub handle to invite" style="flex:1; width:auto; margin:0;">
        <button class="invite-btn" style="margin:0; flex-shrink:0;">Invite</button>
      </div>
      <p class="sub invite-status" style="margin:6px 0 0;"></p>` : `<p class="sub" style="margin:12px 0 0;">You have ${highestPermission(permissions)} access here -- only a repo admin can manage its collaborators.</p>`}`;
    const rosterEl = card.querySelector(".roster");
    renderRoster(rosterEl, repoUrl, canManage);
    if (canManage) {
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
          renderRoster(rosterEl, repoUrl, canManage);
        } catch (e) {
          statusEl.textContent = `Couldn't invite @${handle}: ${e.message}`;
        }
      });
    }
    wrap.appendChild(card);
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

async function renderRoster(rosterEl, repoUrl, canManage) {
  let members;
  try {
    members = await fetchRoster(repoUrl);
  } catch (e) {
    rosterEl.innerHTML = `<p class="sub" style="margin:0; color:#ff6b6b;">Couldn't load the roster: ${e.message}</p>`;
    return;
  }
  rosterEl.innerHTML = "";
  if (!members.length) {
    rosterEl.innerHTML = `<p class="sub" style="margin:0;">No maintainers yet${canManage ? " -- invite someone below." : "."}</p>`;
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
      ${canManage ? `<button class="secondary remove-btn" data-handle="${m.handle}" data-pending="${m.pending}" data-invitation-id="${m.invitationId || ""}">Remove</button>` : ""}
    `;
    rosterEl.appendChild(row);
  });
  if (!canManage) return;
  rosterEl.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const vehicleSlug = await vehicleSlugForRepo(repoUrl);
      const isPending = btn.dataset.pending === "true";
      if (!(await blaydeConfirm(`Remove @${btn.dataset.handle} as a maintainer of ${vehicleSlug}?`))) return;
      try {
        if (isPending) await cancelInvitation(repoUrl, btn.dataset.invitationId);
        else await removeCollaborator(repoUrl, btn.dataset.handle);
        renderRoster(rosterEl, repoUrl, canManage);
      } catch (e) {
        alert(`Couldn't remove @${btn.dataset.handle}: ${e.message}`);
      }
    });
  });
}

// "push" (GitHub's write role), not "admin" -- enough to merge photo
// PRs and manage a vehicle's day-to-day, without also handing out the
// ability to manage the repo's OWN collaborators or settings. Someone
// who genuinely needs that can be granted it directly on github.com by
// an existing repo admin -- this tool only ever grants the level a
// maintainer actually needs for the job described here.
async function inviteCollaborator(repoUrl, handle) {
  const { owner, repo } = ownerRepoFromUrl(repoUrl);
  const token = BlaydeAuth.getSession().token;
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/collaborators/${handle}`, {
    method: "PUT",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ permission: "push" }),
  });
  if (resp.status === 404) throw new Error(`no GitHub user named "${handle}"`);
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.message || `GitHub API error (${resp.status})`);
  }
  // 201 = invitation sent (outside user); 204 = added directly (already
  // an org member) -- both are success, nothing else to do here.
}

async function removeCollaborator(repoUrl, handle) {
  const { owner, repo } = ownerRepoFromUrl(repoUrl);
  const token = BlaydeAuth.getSession().token;
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/collaborators/${handle}`, {
    method: "DELETE",
    headers: ghHeaders(token),
  });
  if (!resp.ok && resp.status !== 204) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.message || `GitHub API error (${resp.status})`);
  }
}

async function cancelInvitation(repoUrl, invitationId) {
  const { owner, repo } = ownerRepoFromUrl(repoUrl);
  const token = BlaydeAuth.getSession().token;
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/invitations/${invitationId}`, {
    method: "DELETE",
    headers: ghHeaders(token),
  });
  if (!resp.ok && resp.status !== 204) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.message || `GitHub API error (${resp.status})`);
  }
}

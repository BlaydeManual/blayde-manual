// Blayde Manual -- "My Vehicles": each vehicle you maintain, who else
// is on it, and how active they've been. Scoped strictly to
// MOCK_MAINTAINER.reposmaintained, same as Review Photo Requests -- no
// special-casing for org roles (see ROADMAP.md's security-review
// section: an org role in this app's mock model never implies repo
// access, that's a real GitHub permission this app doesn't grant).
// Invite/remove are both mock, same convention as accept/reject
// elsewhere -- logged as what the real GitHub collaborator API call
// would be, since there's no live OAuth to actually call it with yet.

// Per-repo roster -- mock data standing in for what a real GitHub
// collaborators + this-repo's-own request history would return. Stats
// are scoped to THIS repo specifically (a maintainer active on one
// vehicle and quiet on another should read differently per vehicle,
// not get one blended global number).
const MOCK_VEHICLE_TEAMS = {
  "https://github.com/BlaydeManual/suzuki-sv650-1999-2002": [
    { handle: "gsxr_greg", requests_reviewed: 34, requests_total: 40, joined: "2026-02-10", last_active: "2026-08-22" },
    { handle: "haynes_hank", requests_reviewed: 5, requests_total: 6, joined: "2026-07-01", last_active: "2026-08-20" },
  ],
  "https://github.com/BlaydeManual/kawasaki-kx250-1998-2000": [
    { handle: "kx_kelly", requests_reviewed: 12, requests_total: 12, joined: "2026-05-15", last_active: "2026-06-01" },
  ],
};

const ACTIVE_WITHIN_DAYS = 30; // quick, honest signal -- not a real engagement-scoring system

function daysAgo(dateStr) {
  return Math.round((new Date() - new Date(dateStr)) / 86400000);
}

function tenureText(dateStr) {
  const days = daysAgo(dateStr);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function initVehiclesTab() {
  renderVehicleTeams();
}

function renderVehicleTeams() {
  const wrap = document.getElementById("vehicleTeams");
  wrap.innerHTML = "";
  const approved = MOCK_MAINTAINER.reposmaintained.filter(isRegisteredRepo); // same guard as Review Photo Requests
  if (!approved.length) {
    wrap.innerHTML = `<p class="sub">No maintained repos passed the registry check.</p>`;
    return;
  }
  approved.forEach((repoUrl) => {
    // This vehicle no longer implies one manual (see ROADMAP.md's
    // multi-manual correction) -- the roster below is correctly still
    // one per repo (maintainer authority is vehicle-wide), but it's
    // worth naming which editions that authority actually covers.
    const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
    const editions = MOCK_REGISTRY.vehicles
      .filter((v) => norm(v.repo_url) === norm(repoUrl))
      .map((v) => v.edition_id);
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h3 class="vehicle-bar">${vehicleSlugForRepo(repoUrl)}</h3>
      <p class="sub" style="margin:0 0 10px;">Covers ${editions.length} edition${editions.length === 1 ? "" : "s"}: ${editions.join(", ")}</p>
      <div class="roster"></div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <input type="text" class="invite-input" placeholder="GitHub handle to invite" style="flex:1; width:auto; margin:0;">
        <button class="invite-btn" style="margin:0; flex-shrink:0;">Invite</button>
      </div>`;
    const rosterEl = card.querySelector(".roster");
    renderRoster(rosterEl, repoUrl);
    card.querySelector(".invite-btn").addEventListener("click", () => {
      const input = card.querySelector(".invite-input");
      const handle = input.value.trim().replace(/^@/, "");
      if (!handle) return;
      MOCK_VEHICLE_TEAMS[repoUrl] = MOCK_VEHICLE_TEAMS[repoUrl] || [];
      MOCK_VEHICLE_TEAMS[repoUrl].push({
        handle, requests_reviewed: 0, requests_total: 0,
        joined: new Date().toISOString().slice(0, 10), last_active: new Date().toISOString().slice(0, 10),
      });
      input.value = "";
      renderRoster(rosterEl, repoUrl);
      // [mock] real call: PUT /repos/{owner}/{repo}/collaborators/{handle}
    });
    wrap.appendChild(card);
  });
}

function renderRoster(rosterEl, repoUrl) {
  const members = MOCK_VEHICLE_TEAMS[repoUrl] || [];
  rosterEl.innerHTML = "";
  if (!members.length) {
    rosterEl.innerHTML = `<p class="sub" style="margin:0;">No maintainers yet -- invite someone below.</p>`;
    return;
  }
  members.forEach((m) => {
    const active = daysAgo(m.last_active) <= ACTIVE_WITHIN_DAYS;
    const row = document.createElement("div");
    row.className = "pr-row";
    row.innerHTML = `
      <div>
        <div class="pr-title">@${m.handle} <span style="font-size:0.7rem; font-weight:700; color:${active ? "#1d9e75" : "#8a8f98"};">&#9679; ${active ? "active" : "quiet"}</span></div>
        <div class="pr-meta">${m.requests_reviewed}/${m.requests_total} requests reviewed &middot; on this vehicle ${tenureText(m.joined)} &middot; last active ${daysAgo(m.last_active)}d ago</div>
      </div>
      <button class="secondary remove-btn" data-handle="${m.handle}">Remove</button>
    `;
    rosterEl.appendChild(row);
  });
  rosterEl.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm(`Remove @${btn.dataset.handle} as a maintainer of ${vehicleSlugForRepo(repoUrl)}?`)) return;
      MOCK_VEHICLE_TEAMS[repoUrl] = MOCK_VEHICLE_TEAMS[repoUrl].filter((m) => m.handle !== btn.dataset.handle);
      renderRoster(rosterEl, repoUrl);
      // [mock] real call: DELETE /repos/{owner}/{repo}/collaborators/{handle}
    });
  });
}

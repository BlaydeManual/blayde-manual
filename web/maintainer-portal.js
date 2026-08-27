// Blayde Manual -- maintainer portal shell.
// One sign-in, one page, tabs for each thing a maintainer might do.
// Roles aren't exclusive -- the same person can be a repo-scoped
// maintainer on one or more vehicles AND on the org team that approves
// new vehicles, so tabs are gated by capability, not by picking an
// identity at sign-in. Approve New Vehicles still carries an ORG badge
// since that action's authority is worth flagging explicitly; the
// per-repo tabs dropped their REPO badges once that distinction no
// longer needed spelling out. org-approval.js gates the actual
// approve/reject actions on a real org-admin check via the Worker
// (BlaydeAuth.getAppSession() + /approve-vehicle's own server-side
// membership check), not on anything in this file -- this portal only
// ever controls tab VISIBILITY, never authority.
// Sign-in is real (auth.js, GitHub OAuth). Which repos someone actually
// maintains is real too, as of this pass: discoverMaintainedRepos()
// below replaces the old fixed two-repo mock with a live GET /user/repos
// call, filtered to repos this person has real push/admin access to AND
// the real registry lists as approved -- see SECURITY.md's "maintaining
// a repo is a separate designation from org membership" note for why
// both checks matter (a real GitHub permission, not an org role, is
// what actually governs repo access).
const MOCK_MAINTAINER = {
  isOrgMaintainer: false, // flip to true locally to see the ORG tab enabled -- unrelated to repo maintainership, still a stand-in
};

// {repoUrl, permissions}[] -- populated by discoverMaintainedRepos() once
// per sign-in. permissions is the real GitHub permissions object for
// that repo ({admin, maintain, push, triage, pull}), kept around (not
// just the URL) so my-vehicles.js can decide whether THIS signed-in
// person should see collaborator-management controls on THAT repo
// without a second round-trip.
let maintainedRepos = [];

// Real repo discovery -- GET /user/repos with affiliation=collaborator
// covers both ways someone can legitimately have write access to a
// vehicle repo: being a BlaydeManual org member with an explicit
// collaborator grant, or being an outside collaborator who was invited
// without ever joining the org at all. Filtered to push-or-better (pull
// alone can't merge a PR or manage collaborators, so it doesn't make
// someone a maintainer here) and cross-checked against the real,
// public registry -- the same repo-scope guard review-panel.js already
// applies, since "GitHub says I can push here" and "this is actually a
// registered Blayde Manual vehicle repo" are two different questions.
async function discoverMaintainedRepos() {
  const session = BlaydeAuth.getSession();
  if (!session) return [];
  try {
    const resp = await fetch("https://api.github.com/user/repos?affiliation=collaborator&per_page=100", {
      headers: { Authorization: `Bearer ${session.token}`, Accept: "application/vnd.github+json" },
    });
    if (!resp.ok) return [];
    const repos = await resp.json();
    const candidates = repos.filter((r) => r.owner?.login === "BlaydeManual" && r.permissions?.push);
    const checks = await Promise.all(candidates.map(async (r) => [r, await isRegisteredRepo(r.html_url)]));
    return checks.filter(([, ok]) => ok).map(([r]) => ({ repoUrl: r.html_url, permissions: r.permissions }));
  } catch (e) {
    return []; // fail closed -- an unreachable GitHub/registry means no discovered repos, not a broken portal
  }
}

const carriedOverHash = new URLSearchParams(location.search).get("hash");
if (carriedOverHash) {
  const note = document.getElementById("carriedOverNote");
  note.textContent = `Picking up from the patcher -- you already checked a manual isn't registered yet (fingerprint ${carriedOverHash.slice(0, 16)}...). Sign in, then select the same PDF on Index a New Vehicle to start indexing.`;
  note.style.display = "block";
}

// Async now -- discovering real maintained repos is a network call, and
// tab enablement below has to wait for it rather than judging an
// always-populated mock array synchronously.
async function enterPortal() {
  document.getElementById("signInCard").style.display = "none";
  document.getElementById("portalBody").style.display = "block";

  maintainedRepos = await discoverMaintainedRepos();

  const reviewTabBtn = document.querySelector('.tab-btn[data-tab="review"]');
  const vehiclesTabBtn = document.querySelector('.tab-btn[data-tab="vehicles"]');
  if (maintainedRepos.length) {
    initReviewTab(); // review-panel.js -- repo-scope check + PR list
    initVehiclesTab(); // my-vehicles.js -- per-vehicle rosters
    initIssuesTab(); // issue-requests.js -- needs a repo to issue against
  } else {
    reviewTabBtn.disabled = true;
    vehiclesTabBtn.disabled = true;
    document.querySelector('.tab-btn[data-tab="issues"]').disabled = true;
    // Nothing to maintain yet -- landing on Review Photo Requests (its
    // default position) would just show a disabled tab. The one thing
    // a not-yet-active maintainer can actually do here is index a new
    // vehicle, so that's where they land instead.
    activateTab("index");
  }

  // Approve New Vehicles is visible and readable by every maintainer --
  // useful before starting to index a vehicle that's already pending.
  initApproveTab();
}

// A session from a previous sign-in this tab (auth.js, sessionStorage)
// survives a page reload -- only closing the tab clears it.
const existingSession = window.BlaydeAuth ? BlaydeAuth.getSession() : null;
if (existingSession) enterPortal();
// A full reload on logout, not a piecemeal reset -- this portal has
// real state spread across several tabs (loaded PRs, vehicle rosters);
// starting clean is simpler and safer than trying to unwind all of it.
BlaydeAuth?.renderAuthStatus(() => location.reload());

document.getElementById("portalSignInBtn").addEventListener("click", async () => {
  try {
    await BlaydeAuth.signInWithGitHub();
    BlaydeAuth.renderAuthStatus(() => location.reload());
    enterPortal();
  } catch (err) {
    const note = document.getElementById("carriedOverNote");
    note.textContent = `Sign-in failed: ${err.message}`;
    note.style.display = "block";
  }
});

function activateTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add("active");
  document.getElementById(`tab-${tabName}`).classList.add("active");
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    activateTab(btn.dataset.tab);
    // Review Photo Requests re-syncs from storage on every visit, not just
    // at sign-in -- Issue Requests can add a new request to the same queue
    // from this same page session (see review-panel.js's initReviewTab).
    if (btn.dataset.tab === "review" && maintainedRepos.length) {
      initReviewTab();
    }
  });
});

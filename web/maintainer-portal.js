// Blayde Manual -- maintainer portal shell.
// One sign-in, one page, tabs for each thing a maintainer might do.
// Roles aren't exclusive -- the same person can be a repo-scoped
// maintainer on one or more vehicles AND on the org team that approves
// new vehicles, so tabs are gated by capability, not by picking an
// identity at sign-in. Approve New Vehicles still carries an ORG badge
// since that action's authority is worth flagging explicitly; the
// per-repo tabs dropped their REPO badges once that distinction no
// longer needed spelling out.
const MOCK_MAINTAINER = {
  // Two repos on purpose -- demonstrates Review Photo Requests grouping
  // requests by vehicle instead of assuming a maintainer only ever has one.
  reposmaintained: [
    "https://github.com/BlaydeManual/suzuki-sv650-1999-2002",
    "https://github.com/BlaydeManual/kawasaki-kx250-1998-2000",
  ],
  isOrgMaintainer: false, // flip to true locally to see the ORG tab enabled
};

const carriedOverHash = new URLSearchParams(location.search).get("hash");
if (carriedOverHash) {
  const note = document.getElementById("carriedOverNote");
  note.textContent = `Picking up from the patcher -- you already checked a manual isn't registered yet (fingerprint ${carriedOverHash.slice(0, 16)}...). Sign in, then select the same PDF on Index a New Vehicle to start indexing.`;
  note.style.display = "block";
}

document.getElementById("portalSignInBtn").addEventListener("click", () => {
  document.getElementById("signInCard").style.display = "none";
  document.getElementById("portalBody").style.display = "block";

  const reviewTabBtn = document.querySelector('.tab-btn[data-tab="review"]');
  const vehiclesTabBtn = document.querySelector('.tab-btn[data-tab="vehicles"]');
  if (MOCK_MAINTAINER.reposmaintained.length) {
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
  // useful before starting to index a vehicle that's already pending --
  // org-approval.js itself gates the actual approve/reject actions on
  // MOCK_MAINTAINER.isOrgMaintainer, not tab visibility.
  initApproveTab();
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
    if (btn.dataset.tab === "review" && MOCK_MAINTAINER.reposmaintained.length) {
      initReviewTab();
    }
  });
});

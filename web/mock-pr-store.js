// Blayde Manual -- shared mock photo-request store, backed by
// localStorage instead of an in-memory array. This is what lets two
// genuinely separate pages/sessions -- the Contributor Portal
// (contribute.html) and the maintainer's Review Photo Requests
// (maintainer.html/review-panel.js) -- hand data to each other for
// real, verifiable in the browser (submit on one page, reload the
// other, see it appear), without either one touching a real GitHub API
// yet. Loaded by both pages; neither owns it.

const MOCK_PRS_STORAGE_KEY = "blayde_mock_prs_v1";

// Fallback for whichever page (review-panel.js or contribute.js) happens
// to touch storage first -- keeping this here, not in review-panel.js,
// is what avoids a real ordering bug: if contribute.html were the first
// page ever opened and wrote its own submission straight into storage,
// review-panel.js would later find storage non-empty and skip seeding
// its defaults entirely, silently losing them.
const MOCK_PRS_SEED = [
  {
    number: 42,
    title: "Add photo: periodic maintenance panel",
    author: "gsxr_greg",
    repo_url: "https://github.com/BlaydeManual/suzuki-sv650-1999-2002",
    edition_id: "OEM",
    procedure_id: "p040_2-10-periodic-maintenance_fig1",
    page: 40,
    section_heading: "PERIODIC MAINTENANCE",
    photo_filename: "p040_2-10-periodic-maintenance_fig1__by_gsxr_greg.jpg",
    original_bbox: [1466, 222, 2326, 795],
    composite_width_px: 2544,
    composite_height_px: 3276,
    page_width_pt: 612.0,
    page_height_pt: 792.0,
  },
  {
    number: 17,
    title: "Add photo: chain slack adjustment",
    author: "haynes_hank",
    repo_url: "https://github.com/BlaydeManual/suzuki-sv650-1999-2002",
    edition_id: "Haynes",
    procedure_id: "p028_chain-slack-adjustment_fig2",
    page: 28,
    section_heading: "CHAIN SLACK ADJUSTMENT",
    photo_filename: "p028_chain-slack-adjustment_fig2__by_haynes_hank.jpg",
    original_bbox: [900, 1400, 2100, 2600],
    composite_width_px: 2544,
    composite_height_px: 3276,
    page_width_pt: 612.0,
    page_height_pt: 792.0,
  },
  {
    number: 5,
    title: "Add photo: front brake caliper",
    author: "kx_kelly",
    repo_url: "https://github.com/BlaydeManual/kawasaki-kx250-1998-2000",
    edition_id: "OEM",
    procedure_id: "p012_front-brake-caliper_fig1",
    page: 12,
    section_heading: "FRONT BRAKE CALIPER",
    photo_filename: "p012_front-brake-caliper_fig1__by_kx_kelly.jpg",
    original_bbox: [300, 500, 1400, 1800],
    composite_width_px: 2200,
    composite_height_px: 2900,
    page_width_pt: 612.0,
    page_height_pt: 792.0,
  },
];

function loadMockPrs(seed) {
  try {
    const raw = localStorage.getItem(MOCK_PRS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage unavailable/corrupt -- fall through to seed */ }
  return (seed || []).slice();
}

function saveMockPrs(prs) {
  try { localStorage.setItem(MOCK_PRS_STORAGE_KEY, JSON.stringify(prs)); } catch (e) { /* best-effort */ }
}

function nextMockPrNumber(prs) {
  return prs.reduce((max, pr) => Math.max(max, pr.number), 0) + 1;
}

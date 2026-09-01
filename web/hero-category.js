// Blayde Manual -- the public hero's category-tab mechanism. Direct
// vision: "explained in one picture" (the existing hero diagram)
// answers WHAT this does; "but what kind of manual?" is the very next
// real decision, not an afterthought bolted onto Browse alone. Picking
// a category here is the site's actual front door -- it re-themes this
// page (via --accent, the same custom-property pattern registry-
// browse.html's glass tray already uses), swaps the hero's before/
// after example toward that category once a real one exists, and
// carries through as a URL param into Browse and the Maintainer
// Portal so the choice isn't asked twice.
//
// CATEGORY_STYLE/CATEGORY_ORDER come from category-style.js (shared
// with registry-browse.js/review-panel.js/my-vehicles.js/contribute.js).

// Real examples only -- no fabricated "before/after" content for a
// category without one. null means "example coming soon," rendered as
// a real placeholder (see oldCardPlaceholder/newCardPlaceholder in
// index.html), never a fake photo pretending to be real. Garage's
// entry is the same real motorcycle example the hero has always used.
const HERO_EXAMPLES = {
  garage: {
    heading: "ENGINE TUNING",
    before: { fig1: "images/hero-before-fig1.png", fig2: "images/hero-before-fig2.png" },
    after: { fig1: "images/hero-after.jpg", fig2: "images/hero-after-fig2.jpg", credit1: "@THEBLAYDE", credit2: "@YOU" },
  },
  marina: null,
  hangar: null,
  farm: null,
  home: null,
  hobby: null,
};

let activeHeroCategory = null; // null = "All" = default (Garage's real example, no re-theme)

function categoryLabel(id) {
  return id[0].toUpperCase() + id.slice(1);
}

// Real WCAG contrast math, not a guess -- the active tab is a SOLID
// fill in the category's own accent (unlike registry-browse.html's
// tinted-20%-into-black active state, which stays safe with light text
// regardless of hue). A fixed white-on-accent choice, checked here
// rather than assumed, turned out to fail badly on the brighter
// categories: white-on-Farm (#e2e636) measures 1.35:1, white-on-Home
// (#36e6e6) measures 1.54:1 -- both far below WCAG's 4.5:1 AA floor
// for normal text, nearly unreadable in practice. Computing both
// candidates' real contrast ratio per category and picking whichever
// wins means this stays correct even if a category's color ever
// changes, instead of a hardcoded per-category color lookup drifting
// out of sync with ROADMAP.md's locked-in hex values.
function relativeLuminance(hex) {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1), l2 = relativeLuminance(hex2);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}
function readableTextOn(accentHex) {
  const white = contrastRatio(accentHex, "#ffffff");
  const black = contrastRatio(accentHex, "#0c0d0f");
  return white > black ? "#ffffff" : "#0c0d0f";
}

function renderHeroCategoryTabs() {
  const wrap = document.getElementById("heroCategoryTabs");
  if (!wrap) return;
  wrap.innerHTML = "";

  const makeTab = (id, label, style) => {
    const tab = document.createElement("div");
    const isActive = activeHeroCategory === id;
    tab.className = "cat-tab" + (isActive ? " active" : "");
    if (style) {
      tab.style.setProperty("--tab-accent", style.accent);
      if (isActive) tab.style.setProperty("--tab-text", readableTextOn(style.accent));
    }
    tab.innerHTML = style
      ? `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${style.icon}</svg><span>${label}</span>`
      : `<span>${label}</span>`;
    tab.addEventListener("click", () => applyHeroCategory(id));
    wrap.appendChild(tab);
  };

  // No "All" tab here, unlike registry-browse.html's tabs -- this is a
  // one-shot choice (which category is this manual?), not a filter
  // someone needs to clear back to a neutral state.
  CATEGORY_ORDER.forEach((id) => makeTab(id, categoryLabel(id), CATEGORY_STYLE[id]));
}

// Swaps the hero's before/after example -- a real one if this category
// has one, otherwise the real "coming soon" placeholder (never a fake
// photo). Whole-card swap, not per-photo: a category with no example
// yet never shows a mismatched heading/bullets next to a placeholder
// photo (see index.html's oldCardContent/oldCardPlaceholder comment).
function renderHeroExample(categoryId) {
  const example = categoryId ? HERO_EXAMPLES[categoryId] : HERO_EXAMPLES.garage;

  const oldContent = document.getElementById("oldCardContent");
  const oldPlaceholder = document.getElementById("oldCardPlaceholder");
  const newContent = document.getElementById("newCardContent");
  const newPlaceholder = document.getElementById("newCardPlaceholder");
  if (!oldContent) return; // hero diagram isn't on this page

  if (example) {
    oldContent.style.display = "";
    oldPlaceholder.style.display = "none";
    newContent.style.display = "";
    newPlaceholder.style.display = "none";
    document.getElementById("oldCardHeading").textContent = example.heading;
    document.getElementById("newCardHeading").textContent = example.heading;
    document.getElementById("oldFig1Image").setAttribute("href", example.before.fig1);
    document.getElementById("oldFig2Image").setAttribute("href", example.before.fig2);
    document.getElementById("newFig1Image").setAttribute("href", example.after.fig1);
    document.getElementById("newFig2Image").setAttribute("href", example.after.fig2);
    document.getElementById("newFig1CreditText").textContent = example.after.credit1;
    document.getElementById("newFig2CreditText").textContent = example.after.credit2;
    document.getElementById("newFig1Credit").style.display = "";
    document.getElementById("newFig2Credit").style.display = "";
  } else {
    oldContent.style.display = "none";
    oldPlaceholder.style.display = "";
    newContent.style.display = "none";
    newPlaceholder.style.display = "";
  }
}

// Updates the two real cross-page links that carry the choice through
// rather than asking again: Browse (registry-browse.html's own tabs,
// pre-activated via ?category=) and the Maintainer Portal's indexer
// (Category dropdown pre-selected the same way). Exposed on window so
// patcher.js -- which sets the Maintainer CTA link's base href once a
// PDF's fingerprint isn't recognized, at its own unpredictable time --
// can re-apply the current category on top of it without this file
// needing to know anything about patcher.js's own logic.
function updateCategoryLinks() {
  const browseLink = document.getElementById("browseLink");
  if (browseLink) {
    browseLink.href = activeHeroCategory ? `registry-browse.html?category=${activeHeroCategory}` : "registry-browse.html";
    browseLink.textContent = activeHeroCategory ? `Browse ${categoryLabel(activeHeroCategory)} manuals →` : "Browse registered vehicles →";
  }
  applyCategoryToMaintainerLink();
}

function applyCategoryToMaintainerLink() {
  const link = document.getElementById("maintainerCtaLink");
  const heading = document.getElementById("maintainerCtaHeading");
  if (!link) return;
  const url = new URL(link.href, location.href);
  if (activeHeroCategory) url.searchParams.set("category", activeHeroCategory);
  else url.searchParams.delete("category");
  link.href = url.href;
  if (heading) {
    heading.textContent = activeHeroCategory
      ? `We don't have this ${categoryLabel(activeHeroCategory)} manual yet. Want to be first?`
      : "We don't have this one yet. Want to be first?";
  }
}
window.applyCategoryToMaintainerLink = applyCategoryToMaintainerLink;

function applyHeroCategory(categoryId) {
  activeHeroCategory = categoryId;
  const style = categoryId ? CATEGORY_STYLE[categoryId] : null;
  if (style) document.documentElement.style.setProperty("--accent", style.accent);
  else document.documentElement.style.removeProperty("--accent");
  renderHeroExample(categoryId);
  updateCategoryLinks();
  renderHeroCategoryTabs();
}

renderHeroCategoryTabs();
renderHeroExample(null);
updateCategoryLinks();

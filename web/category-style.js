// Blayde Manual -- shared category styling data (color + icon), used
// by every page that renders a category tab/heading/badge:
// registry-browse.js (public browse tabs), review-panel.js/my-
// vehicles.js/contribute.js (maintainer/contributor grouping headings).
// One copy, not four -- these are the same CVD-verified colors and
// Tabler (MIT) icons locked in in ROADMAP.md's "Category expansion"
// section; a second hand-copied table would drift the moment one of
// them changes.

const CATEGORY_ORDER = ["garage", "marina", "hangar", "farm", "home", "hobby"];

const CATEGORY_STYLE = {
  garage: { accent: "#e06b1d", icon: '<path d="M2 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M16 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M7.5 14h5l4 -4h-10.5m1.5 4l4 -4" /><path d="M13 6h2l1.5 3l2 4" />' },
  marina: { accent: "#317be5", icon: '<path d="M2 20a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1" /><path d="M4 18l-1 -3h18l-1 3" /><path d="M11 12h7l-7 -9v9" /><path d="M8 7l-2 5" />' },
  hangar: { accent: "#c953a0", icon: '<path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3l4 7" />' },
  farm: { accent: "#e2e636", icon: '<path d="M3 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M7 15l0 .01" /><path d="M17 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M10.5 17l6.5 0" /><path d="M20 15.2v-4.2a1 1 0 0 0 -1 -1h-6l-2 -5h-6v6.5" /><path d="M18 5h-1a1 1 0 0 0 -1 1v4" />' },
  home: { accent: "#36e6e6", icon: '<path d="M5 12l-2 0l9 -9l9 9l-2 0" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /><path d="M10 12h4v4h-4l0 -4" />' },
  hobby: { accent: "#a134c5", icon: '<path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25" /><path d="M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />' },
};

// Inline 16px icon markup for a category id, or "" for an unknown/null
// category (an entry pre-dating the category field, or one still
// legitimately uncategorized).
function categoryIconSvg(categoryId) {
  const style = CATEGORY_STYLE[categoryId];
  if (!style) return "";
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${style.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px; vertical-align:-3px; margin-right:4px;">${style.icon}</svg>`;
}

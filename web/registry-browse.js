// Blayde Manual -- registry browse page, real data as of this pass.
// Previously 100% mock (MOCK_REGISTRY_BROWSE, four fabricated vehicles)
// -- confirmed live this was never wired up at all, not a regression.
//
// One card per real vehicle_slug (a real repo), each holding its own
// list of real editions -- registry.json already supports multiple
// entries sharing one vehicle_slug (see org-approval.js's "add
// edition" path), so that part of the original design is real. What's
// dropped: grouping multiple GENERATIONS of the same make+model under
// one heading, and filtering/sorting by make/model/year_range --
// registry.json has no such fields today (only vehicle_slug,
// vehicle_display_name, vehicle_class, edition_id, repo_url,
// source_pdf_sha256, status). Reintroducing that grouping needs those
// fields captured for real at submit time first; logged in ROADMAP.md
// rather than faked here with slug-parsing guesswork.
//
// Per-edition stats are real too: total_procedures / photos_covered
// come from fetching each vehicle's actual manifest.json and images/
// listing (registry.js's fetchManifest/listRepoImages/
// parsePhotoFilename, already shared with the patcher), matched by the
// same filename convention the patcher uses to pick which photo to
// embed -- not the manifest entries' own `status` field, which is
// written once at indexing time and never updated afterward.

const CANONICAL_REGISTRY_URL_FOR_BROWSE = "https://raw.githubusercontent.com/BlaydeManual/registry/main/registry.json";
const MANUAL_TYPES_URL_FOR_BROWSE = "https://raw.githubusercontent.com/BlaydeManual/registry/main/manual-types.json";

// Real, CVD-verified colors + Tabler (MIT) icons -- see ROADMAP.md's
// "Category expansion" section for the accessibility research behind
// these exact values. Kept as a literal table here rather than fetched,
// same reasoning as everything else styling-related: color/icon choice
// is a design decision, not registry data, so it doesn't belong in
// manual-types.json alongside the actual taxonomy.
const CATEGORY_STYLE = {
  garage: { accent: "#e06b1d", icon: '<path d="M2 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M16 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M7.5 14h5l4 -4h-10.5m1.5 4l4 -4" /><path d="M13 6h2l1.5 3l2 4" />' },
  marina: { accent: "#317be5", icon: '<path d="M2 20a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1" /><path d="M4 18l-1 -3h18l-1 3" /><path d="M11 12h7l-7 -9v9" /><path d="M8 7l-2 5" />' },
  hangar: { accent: "#c953a0", icon: '<path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3l4 7" />' },
  farm: { accent: "#e2e636", icon: '<path d="M3 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M7 15l0 .01" /><path d="M17 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M10.5 17l6.5 0" /><path d="M20 15.2v-4.2a1 1 0 0 0 -1 -1h-6l-2 -5h-6v6.5" /><path d="M18 5h-1a1 1 0 0 0 -1 1v4" />' },
  home: { accent: "#36e6e6", icon: '<path d="M5 12l-2 0l9 -9l9 9l-2 0" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /><path d="M10 12h4v4h-4l0 -4" />' },
  hobby: { accent: "#a134c5", icon: '<path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25" /><path d="M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />' },
};

let allVehicles = []; // populated once, real data, filtered/searched client-side
let manualTypesData = null; // manual-types.json, fetched once
let activeCategory = ""; // "" = All (default, per ROADMAP -- never a forced choice)

// Manual-type options scoped to the active category. With "All" active
// there's no single category's list to show -- id collisions across
// categories (every category has its own "other"; "generator" exists
// in both Farm and Home) make a merged list ambiguous, so the type
// filter is simply hidden until a real category tab is picked.
function typesForActiveCategory() {
  if (!activeCategory) return [];
  return manualTypesData?.categories.find((c) => c.id === activeCategory)?.types || [];
}

function pct(edition) {
  return edition.total_procedures ? Math.round((edition.photos_covered / edition.total_procedures) * 100) : 0;
}

function matchesSearch(v, q) {
  if (!q) return true;
  const hay = `${v.vehicle_display_name} ${v.vehicle_slug}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

// Real coverage for one edition -- same "does a matching file exist in
// images/" signal the patcher itself relies on, not anything stored in
// the manifest. A manifest fetch failure (repo gone, network hiccup)
// degrades to "stats unavailable" for that one edition rather than
// breaking the whole page.
async function computeEditionStats(repoUrl, editionId) {
  try {
    const { manifest, branch } = await fetchManifest(repoUrl, editionId);
    const files = await listRepoImages(repoUrl, editionId, branch);
    const covered = new Set();
    files.forEach((f) => {
      const parsed = parsePhotoFilename(f.name);
      if (parsed) covered.add(parsed.procedureId);
    });
    const realEntries = (manifest.entries || []).filter(
      (e) => e.status !== "excluded_false_positive" && (e.content_type === undefined || e.content_type === null || e.content_type === "photo")
    );
    const photosCovered = realEntries.filter((e) => covered.has(e.procedure_id)).length;
    return { total_procedures: realEntries.length, photos_covered: photosCovered, source_url: manifest.source_markers?.source_identifier || null };
  } catch (e) {
    return { total_procedures: null, photos_covered: null, source_url: null, error: e.message };
  }
}

async function loadRealRegistry() {
  const registryData = await loadRegistry(CANONICAL_REGISTRY_URL_FOR_BROWSE).catch(() => ({ vehicles: [] }));
  const approved = (registryData.vehicles || []).filter((v) => v.status === "approved");

  const byVehicle = new Map();
  approved.forEach((v) => {
    if (!byVehicle.has(v.vehicle_slug)) {
      byVehicle.set(v.vehicle_slug, {
        vehicle_slug: v.vehicle_slug,
        vehicle_display_name: v.vehicle_display_name || v.vehicle_slug,
        vehicle_class: v.vehicle_class || null,
        category: v.category || null,
        manual_type: v.manual_type || null,
        editions: [],
      });
    }
    byVehicle.get(v.vehicle_slug).editions.push({ id: v.edition_id, repo_url: v.repo_url });
  });

  allVehicles = [...byVehicle.values()];
  // Real stats fetched in parallel across every edition of every
  // vehicle -- same pattern registry.js's own photo-fetch pool uses,
  // fine at this scale (a handful of vehicles), worth revisiting if
  // the registry grows into the hundreds.
  await Promise.all(
    allVehicles.flatMap((v) =>
      v.editions.map(async (e) => {
        const stats = await computeEditionStats(e.repo_url, e.id);
        Object.assign(e, stats);
      })
    )
  );
}

function render() {
  const q = document.getElementById("searchInput").value.trim();
  const typeFilter = document.getElementById("classFilter").value;
  const results = document.getElementById("results");
  const empty = document.getElementById("emptyState");
  results.innerHTML = "";

  const filtered = allVehicles
    .filter((v) => matchesSearch(v, q))
    .filter((v) => !activeCategory || v.category === activeCategory)
    .filter((v) => !typeFilter || v.manual_type === typeFilter)
    .sort((a, b) => a.vehicle_slug.localeCompare(b.vehicle_slug));

  if (!filtered.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  // Grouped by whichever dimension is still varying in the filtered
  // set, sorted by vehicle_slug within each group -- not by make/model
  // (registry.json has no such fields, see the file header). Sorting by
  // slug happens to cluster same-make vehicles together anyway, since a
  // slug's own naming convention starts with the make ("suzuki-...",
  // "yamaha-...") -- a real, useful side effect of the sort order, not
  // a separate grouping mechanism pretending to be one.
  //
  // With a category tab active, manual_type is the meaningful grouping
  // (category itself is already a hard filter, so it can't vary here).
  // With "All" active, category is the meaningful grouping instead,
  // since manual_type ids collide across categories (every category
  // has its own "other") and would be a confusing heading on their
  // own. Either way, the heading is only shown when more than one
  // group is actually present -- redundant otherwise.
  const groupLabel = activeCategory
    ? (v) => typesForActiveCategory().find((t) => t.id === v.manual_type)?.label || v.manual_type || "(type not set)"
    : (v) => manualTypesData?.categories.find((c) => c.id === v.category)?.label || "(category not set)";

  const byGroup = new Map();
  filtered.forEach((v) => {
    const key = groupLabel(v);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(v);
  });
  const showTypeHeadings = byGroup.size > 1;

  [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([className, vehicles]) => {
    if (showTypeHeadings) {
      const heading = document.createElement("div");
      heading.className = "model-heading";
      heading.style.margin = "18px 0 6px";
      heading.textContent = className[0].toUpperCase() + className.slice(1);
      results.appendChild(heading);
    }
    vehicles.forEach((v) => {
      const group = document.createElement("div");
      group.className = "model-group";

      const row = document.createElement("div");
      row.className = "gen-row";
      row.style.marginTop = "8px";

      const header = document.createElement("div");
      header.className = "gen-header";
      header.innerHTML = `
        <a class="gen-title-link" href="index.html?vehicle=${encodeURIComponent(v.vehicle_slug)}">
          ${v.vehicle_display_name}
        </a>
      `;
      row.appendChild(header);

      const editionsWrap = document.createElement("div");
      editionsWrap.className = "gen-editions";
      v.editions.forEach((e) => {
        const editionRow = document.createElement("div");
        editionRow.className = "edition-row";
        const statLabel = e.total_procedures == null
          ? `<span class="edition-pct" style="color:var(--steel);">stats unavailable</span>`
          : `<span class="edition-pct">${pct(e)}% of ${e.total_procedures}</span>`;
        editionRow.innerHTML = `
          <span class="edition-name">${e.id || "(edition not set)"}</span>
          ${e.source_url ? `<a class="edition-link" href="${e.source_url}" target="_blank" rel="noopener">${e.source_url}</a>` : `<span class="edition-link"></span>`}
          ${statLabel}
        `;
        editionsWrap.appendChild(editionRow);
      });
      row.appendChild(editionsWrap);

      group.appendChild(row);
      results.appendChild(group);
    });
  });
}

// Rebuilds the Manual Type select for the active category. Hidden
// entirely on "All" (see typesForActiveCategory()'s reasoning) rather
// than shown-but-empty, so there's nothing there to misread as "no
// types exist yet."
function populateTypeFilter() {
  const select = document.getElementById("classFilter");
  const types = typesForActiveCategory();
  select.style.display = activeCategory ? "" : "none";
  select.innerHTML = `<option value="">All types</option>`;
  types.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    select.appendChild(opt);
  });
}

// The tab bar itself -- "All" plus one tab per manual-types.json
// category, in the same narrative order the taxonomy design settled on
// (Garage -> Marina -> Hangar -> Farm -> Home -> Hobby). Each tab's
// icon/accent come from CATEGORY_STYLE, not manual-types.json -- that
// file is taxonomy data, this is a styling decision layered on top.
function renderCategoryTabs() {
  const wrap = document.getElementById("categoryTabs");
  wrap.innerHTML = "";
  const cats = manualTypesData?.categories || [];

  const makeTab = (id, label, style) => {
    const tab = document.createElement("div");
    tab.className = "cat-tab" + (activeCategory === id ? " active" : "");
    if (style) tab.style.setProperty("--accent", style.accent);
    tab.innerHTML = style
      ? `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${style.icon}</svg><span>${label}</span>`
      : `<span>${label}</span>`;
    tab.addEventListener("click", () => {
      activeCategory = id;
      populateTypeFilter();
      updateTrayStyle();
      renderCategoryTabs();
      render();
    });
    wrap.appendChild(tab);
  };

  makeTab("", "All", null);
  cats.forEach((c) => makeTab(c.id, c.label, CATEGORY_STYLE[c.id]));
}

// The glass tray's accent follows the active tab -- unset (plain
// background, per ROADMAP's "never a forced choice" default) on "All."
function updateTrayStyle() {
  const tray = document.getElementById("browseTray");
  const style = CATEGORY_STYLE[activeCategory];
  if (style) {
    tray.style.setProperty("--accent", style.accent);
    tray.classList.add("tray-active");
  } else {
    tray.classList.remove("tray-active");
  }
}

document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("classFilter").addEventListener("change", render);

// A `?vehicle=<slug>` param arrives from two real, currently-dead
// links elsewhere -- this page's own vehicle-title links
// (`index.html?vehicle=...`, pointed at a per-vehicle page that
// doesn't exist) and the patcher's cover page (`registry-browse.html?
// vehicle=...`, added so someone reading a patched PDF can jump
// straight to "how much is left" for their own vehicle). Neither
// needs a real per-vehicle page -- prefilling the existing search box
// with the slug already narrows the list to just that vehicle, since
// matchesSearch() matches against vehicle_slug too.
const prefillSlug = new URLSearchParams(location.search).get("vehicle");
if (prefillSlug) document.getElementById("searchInput").value = prefillSlug;

(async () => {
  const results = document.getElementById("results");
  results.innerHTML = `<p class="sub">Loading real registry data&hellip;</p>`;
  manualTypesData = await loadRegistry(MANUAL_TYPES_URL_FOR_BROWSE).catch(() => null);
  await loadRealRegistry();
  renderCategoryTabs();
  populateTypeFilter();
  render();
})();

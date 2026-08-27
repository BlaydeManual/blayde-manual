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

let allVehicles = []; // populated once, real data, filtered/searched client-side

function classesInData() {
  return [...new Set(allVehicles.map((v) => v.vehicle_class).filter(Boolean))].sort();
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
async function computeEditionStats(repoUrl) {
  try {
    const { manifest, branch } = await fetchManifest(repoUrl);
    const files = await listRepoImages(repoUrl, branch);
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
        const stats = await computeEditionStats(e.repo_url);
        Object.assign(e, stats);
      })
    )
  );
}

function render() {
  const q = document.getElementById("searchInput").value.trim();
  const classFilter = document.getElementById("classFilter").value;
  const results = document.getElementById("results");
  const empty = document.getElementById("emptyState");
  results.innerHTML = "";

  const filtered = allVehicles
    .filter((v) => matchesSearch(v, q))
    .filter((v) => !classFilter || v.vehicle_class === classFilter)
    .sort((a, b) => a.vehicle_slug.localeCompare(b.vehicle_slug));

  if (!filtered.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  // Grouped by real vehicle_class (Type), sorted by vehicle_slug within
  // each group -- not by make/model (registry.json has no such fields,
  // see the file header). Sorting by slug happens to cluster same-make
  // vehicles together anyway, since a slug's own naming convention
  // starts with the make ("suzuki-...", "yamaha-...") -- a real,
  // useful side effect of the sort order, not a separate grouping
  // mechanism pretending to be one. The type heading itself is only
  // shown when more than one type is present in the filtered set --
  // with a class filter already narrowing to one type, or a registry
  // that's all one type, repeating that as a heading adds nothing.
  const byClass = new Map();
  filtered.forEach((v) => {
    const key = v.vehicle_class || "(type not set)";
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(v);
  });
  const showTypeHeadings = byClass.size > 1;

  [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([className, vehicles]) => {
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

function populateClassFilter() {
  const select = document.getElementById("classFilter");
  select.innerHTML = `<option value="">All types</option>`;
  classesInData().forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c[0].toUpperCase() + c.slice(1);
    select.appendChild(opt);
  });
}

document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("classFilter").addEventListener("change", render);

(async () => {
  const results = document.getElementById("results");
  results.innerHTML = `<p class="sub">Loading real registry data&hellip;</p>`;
  await loadRealRegistry();
  populateClassFilter();
  render();
})();

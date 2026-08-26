// Blayde Manual -- registry browse page. See ROADMAP.md's
// "GitHub-invisible UX" section: a filterable list (type/make/model,
// plus search) of registered vehicles, each edition showing its own
// source link and its own coverage stat -- deliberately not merged
// into one vehicle-level number, since photos don't carry over between
// editions (a Haynes manual and an OEM manual for the same vehicle are
// laid out completely differently, so "62% done" would only ever be
// true of one specific document, never the vehicle as a whole).
//
// Mock data standing in for a real registry.json read -- no live
// registry exists yet (nothing's been pushed anywhere, see LEGAL.md).
// One entry per VEHICLE REPO (not per edition), each holding its own
// list of editions -- a browsing visitor needs "does my vehicle exist,
// and which of its manuals are worth grabbing," which is a per-edition
// question, not a per-repo one.
const MOCK_REGISTRY_BROWSE = [
  {
    vehicle_slug: "suzuki-sv650-1999-2002",
    make: "Suzuki", model: "SV650", year_range: "1999-2002",
    vehicle_class: "motorcycle",
    passive: false,
    editions: [
      { id: "OEM", source_url: "https://www.manualslib.com/manual/example-suzuki-sv650-oem", total_procedures: 720, photos_covered: 98 },
      { id: "Haynes", source_url: "https://www.manualslib.com/manual/example-suzuki-sv650-haynes", total_procedures: 252, photos_covered: 20 },
    ],
  },
  {
    vehicle_slug: "suzuki-sv650-2003-2010",
    make: "Suzuki", model: "SV650", year_range: "2003-2010",
    vehicle_class: "motorcycle",
    passive: false,
    editions: [
      { id: "OEM", source_url: "https://www.manualslib.com/manual/example-suzuki-sv650-2003-oem", total_procedures: 840, photos_covered: 40 },
    ],
  },
  {
    vehicle_slug: "kawasaki-kx250-1998-2000",
    make: "Kawasaki", model: "KX250", year_range: "1998-2000",
    vehicle_class: "motorcycle",
    // Every maintainer on this vehicle quiet past the 30-day signal --
    // see my-vehicles.js's ACTIVE_WITHIN_DAYS. Not "broken" or
    // "abandoned," the repo stays fully usable regardless -- just
    // means contributors might want to step up (see ROADMAP.md).
    passive: true,
    editions: [
      { id: "OEM", source_url: "https://www.manualslib.com/manual/example-kawasaki-kx250-oem", total_procedures: 320, photos_covered: 320 },
    ],
  },
  {
    vehicle_slug: "yamaha-yz250f-2003-2005",
    make: "Yamaha", model: "YZ250F", year_range: "2003-2005",
    vehicle_class: "motorcycle",
    passive: false,
    editions: [
      { id: "OEM", source_url: "https://www.manualslib.com/manual/example-yamaha-yz250f-oem", total_procedures: 58, photos_covered: 41 },
    ],
  },
];

function classesInData() {
  return [...new Set(MOCK_REGISTRY_BROWSE.map((v) => v.vehicle_class))].sort();
}

function pct(edition) {
  return edition.total_procedures ? Math.round((edition.photos_covered / edition.total_procedures) * 100) : 0;
}

function matchesSearch(v, q) {
  if (!q) return true;
  const hay = `${v.make} ${v.model} ${v.year_range} ${v.vehicle_slug}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

// Grouped by make+model for *finding*, never merged into one row --
// each generation (year_range) keeps its own stats, its own passive
// indicator, its own editions (see ROADMAP.md's generations-stay-
// separate decision). A search for "SV650" surfaces both generations
// under one heading without implying they're the same repo or
// community.
function render() {
  const q = document.getElementById("searchInput").value.trim();
  const classFilter = document.getElementById("classFilter").value;
  const results = document.getElementById("results");
  const empty = document.getElementById("emptyState");
  results.innerHTML = "";

  const filtered = MOCK_REGISTRY_BROWSE
    .filter((v) => matchesSearch(v, q))
    .filter((v) => !classFilter || v.vehicle_class === classFilter);

  if (!filtered.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const byModel = new Map();
  filtered.forEach((v) => {
    const key = `${v.make} ${v.model}`;
    if (!byModel.has(key)) byModel.set(key, []);
    byModel.get(key).push(v);
  });

  [...byModel.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([modelName, vehicles]) => {
    vehicles.sort((a, b) => a.year_range.localeCompare(b.year_range));
    const group = document.createElement("div");
    group.className = "model-group";
    if (vehicles.length > 1) {
      const heading = document.createElement("div");
      heading.className = "model-heading";
      heading.textContent = `${modelName} -- ${vehicles.length} generations`;
      group.appendChild(heading);
    }
    vehicles.forEach((v) => {
      const row = document.createElement("div");
      row.className = "gen-row";

      const header = document.createElement("div");
      header.className = "gen-header";
      header.innerHTML = `
        <a class="gen-title-link" href="index.html?vehicle=${encodeURIComponent(v.vehicle_slug)}">
          ${modelName} (${v.year_range})${v.passive ? `<span class="passive-badge">passive</span>` : ""}
        </a>
      `;
      row.appendChild(header);

      const editionsWrap = document.createElement("div");
      editionsWrap.className = "gen-editions";
      v.editions.forEach((e) => {
        const editionRow = document.createElement("div");
        editionRow.className = "edition-row";
        editionRow.innerHTML = `
          <span class="edition-name">${e.id}</span>
          <a class="edition-link" href="${e.source_url}" target="_blank" rel="noopener">${e.source_url}</a>
          <span class="edition-pct">${pct(e)}% of ${e.total_procedures}</span>
        `;
        editionsWrap.appendChild(editionRow);
      });
      row.appendChild(editionsWrap);

      group.appendChild(row);
    });
    results.appendChild(group);
  });
}

function populateClassFilter() {
  const select = document.getElementById("classFilter");
  classesInData().forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c[0].toUpperCase() + c.slice(1);
    select.appendChild(opt);
  });
}

document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("classFilter").addEventListener("change", render);
populateClassFilter();
render();

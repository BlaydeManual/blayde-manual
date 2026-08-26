# Blayde Manual -- shop manual indexer

Revives out-of-print OEM service manuals with community-contributed photos,
without ever redistributing the manual's own copyrighted content. Point it
at a PDF you legally own; it indexes structure only (page numbers, section
headings, figure locations) and publishes *that*. Photos are contributed
locally and patched back into your own copy of the PDF -- the public repo
never contains a single pixel of the original manual.

Read [LEGAL.md](LEGAL.md) before anything here goes near a public repo --
there's a pin at the top of that file for a reason.
Open design questions and features we've deliberately deferred live in
[ROADMAP.md](ROADMAP.md).

## How this is structured

Each vehicle gets its own repo, with its own maintainers and its own
pace -- the org above them only ever approves a *new* vehicle joining
the registry, once, not the ongoing photo review. And no matter which
repo holds a copy of your photo, it's still yours:

![Blayde Manual org structure and photo ownership](docs/org-structure.svg)

New here and not sure this is worth your time? [docs/faq.html](docs/faq.html)
answers the questions people actually ask, in plain language -- no git
knowledge required.

## The pipeline, in order

Every script below does one job and hands off to the next. Run them in
this order the first time; after that, only the human-review step
(`review_server.py`) is a regular loop.

```
 1. indexer.py            PDF -> manifest.json + local reference crops
 2. add_page_geometry.py  (only if upgrading an older manifest -- backfills
                            the page_geometry patch_pdf.py needs)
 3. review_server.py +    human review: kill false positives, add missed
    generate_review.py    figures, fix crop boundaries
 4. apply_exclusions.py   fold review-gallery omissions into manifest.json
    apply_additions.py    fold manually-found figures into manifest.json
    apply_bbox_edits.py   fold crop corrections into manifest.json
 5. checker.py            validate a contributed photo before it's accepted
 6. patch_pdf.py          manifest.json + approved photos -> a real PDF,
                            with a branded cover page and embedded version state
```

### 1. Index a manual

```bash
./.venv/bin/python indexer.py <path-to-pdf> <output-dir> <vehicle-slug>
```

Example:
```bash
./.venv/bin/python indexer.py local_pdfs/ServiceManual.pdf output/suzuki-sv650 suzuki-sv650-1999-2002
```

This is the slow step (OCR runs on every page of a scanned manual --
~415 pages took ~17 min). Produces:
- `<output-dir>/manifest.json` -- the structure-only, publishable artifact.
  Each entry has a `procedure_id`, page number, OCR'd section heading, and
  `pixel_bbox` (figure location in the page's native scan resolution).
  Also carries `page_geometry` per page (composite raster size vs. PDF
  point size) -- this is what lets `patch_pdf.py` place a replacement
  photo without ever re-inspecting the input PDF's image layout, which
  matters once a PDF has already been patched once (see step 6).
- `<output-dir>/local_extracted_images/` -- reference crops for **local
  review only**. Never publish this directory; it's the copyrighted
  source manual's own pixels. See LEGAL.md.

Copy the source PDF to local disk first if it lives on a network/cloud-sync
mount (Google Drive, etc.) -- indexing and patching both do heavy random
I/O against the PDF, and a synced mount can turn a sub-second operation
into a multi-minute one for no algorithmic reason.

### 2. `add_page_geometry.py` -- only needed once

If you have a manifest generated before `page_geometry` was added to the
indexer, backfill it without re-running the (slow) OCR pass:

```bash
./.venv/bin/python add_page_geometry.py <path-to-pdf> <output-dir>/manifest.json
```

### 3. Review: kill false positives, find what was missed, fix crops

```bash
./.venv/bin/python generate_review.py <output-dir>/manifest.json
./.venv/bin/python review_server.py <output-dir> <path-to-pdf>
```

Open `http://127.0.0.1:8791/review.html`. The PDF path is optional but
needed for the "view full page" / add-missing-figure / crop-editing
features -- without it you only get the plain candidate gallery.

What you can do here:
- **Hover a card -> click the red pill to omit** a false positive (number
  strips, logos, anything the detector shouldn't have caught). Writes to
  `exclusions.json`.
- **"View full page / add missing"** on any page header, or **jump to
  page** in the toolbar for a page with zero detected figures -- browse
  the actual scanned page and drag-select anything the auto-detector
  missed entirely. Writes to `additions.json`.
- In that same full-page view, **existing figures render as labeled,
  draggable, resizable overlay boxes** -- drag the body to move a crop,
  drag a corner handle to resize it, if the auto-detected boundary is off.
  Writes to `bbox_edits.json`.
- `Esc` closes the page-view modal. `Zoom: Fit/100%` toggles between
  fit-to-screen and native resolution for precise placement. `Labels:
  On/Off` at the bottom of the modal hides the overlay tags when they're
  in the way.

All three sidecar files (`exclusions.json`, `additions.json`,
`bbox_edits.json`) are diffs, not direct manifest edits -- review them like
you would any other change before folding them in.

### 4. Fold review decisions into the manifest

```bash
./.venv/bin/python apply_exclusions.py <output-dir>
./.venv/bin/python apply_additions.py <output-dir>
./.venv/bin/python apply_bbox_edits.py <output-dir>
```

Excluded entries are kept with `status: excluded_false_positive`, not
deleted -- the manifest stays an honest record of what the detector found
and what a human overruled. Manually-added entries carry
`source: manually_added`; bbox-corrected entries carry `bbox_edited: true`.
Re-run `generate_review.py` afterward to see the cleaned-up gallery.

### 5. Validate a contributed photo

```bash
./.venv/bin/python checker.py <photo.jpg> --manifest <output-dir>/manifest.json
```

Same script runs locally (contributor's own pre-flight check, before
opening a PR) and in CI (confirms what they already saw -- no surprise
rejections). Checks resolution, blur/focus score, EXIF/GPS stripped, and
that the filename matches a real `procedure_id`. `--fix` strips EXIF in
place. `--json` for machine-readable output.

### 6. Patch photos into an actual PDF

```bash
./.venv/bin/python patch_pdf.py \
  --input <your-pdf> \
  --manifest <output-dir>/manifest.json \
  --photos-dir <folder-of-approved-procedure_id.jpg-files> \
  --output <output>.pdf \
  --repo-url https://github.com/<org>/<vehicle-repo>
```

Produces a real PDF: every approved photo pixel-swapped into its exact
original location, a branded cover page (version, contribution stats,
non-affiliation disclaimer), and an embedded identity record inside the
PDF itself.

That embedded record is what makes this **safe to run again on its own
output**: feed a previously-patched PDF back in as `--input`, and the tool
recognizes it, skips the fingerprint check against a pristine file you may
no longer have, and patches only what's new or changed since -- auto-
bumping the version (`v1.0` -> `v1.1`). You never need to keep the
original pristine PDF around after the first run.

## Directory layout

```
indexer.py              step 1
add_page_geometry.py     step 2 (rare)
generate_review.py       step 3 (static HTML generator)
review_server.py         step 3 (local API + page image server)
apply_exclusions.py      step 4
apply_additions.py       step 4
apply_bbox_edits.py      step 4
checker.py                step 5
patch_pdf.py              step 6
LEGAL.md                  read first, pinned review before anything goes public
ROADMAP.md                deferred features and open design problems
local_pdfs/                local copies of source PDFs (never commit these)
output/<vehicle-slug>/     manifest.json, local_extracted_images/, review.html,
                           exclusions.json, additions.json, bbox_edits.json,
                           page_cache/ (page-view modal's rendered page images)
```

`local_pdfs/`, `local_extracted_images/`, and `page_cache/` all contain the
source manual's own copyrighted pixels -- none of them are ever meant to
leave this machine. See LEGAL.md for the full reasoning.

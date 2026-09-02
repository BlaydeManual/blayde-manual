# Changelog

All notable changes to this project are logged here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/); versioning is
milestone-based rather than strict SemVer while pre-1.0.0 (see
ROADMAP.md for the planned path to v1.0.0).

As of 2026-08-25, this project is public at
`github.com/BlaydeManual/blayde-manual` -- see LEGAL.md for the pre-push
legal review that gated that. Everything before that date describes work
done locally, pre-push; entries after it describe the live, public
project.

This is the *what changed* record. For *who steered what* -- which
decisions originated with the project owner versus Claude's synthesis,
and corrections in both directions -- see
`ledgers/TheBlayde_AILedger.md`, kept alongside this file.

## [Unreleased]

- **Moved photo-location-fix proposals to the Contributor Portal** (PR
  #92): any signed-in contributor, not just a manual's own maintainers,
  can propose a box reposition, a missed photo slot, or flag one for
  removal -- a real fork+PR, reviewed through a new
  `/accept-manifest-change` Worker gate, matching the site's own
  "requesting is Contributor, reviewing is Maintainer" rule already
  used for photos and recategorizations. The maintainer-only tool this
  started as (direct-write, no review step) was reverted before
  shipping -- see SECURITY-TESTING.md's Tier 8 and ROADMAP.md for the
  reasoning. Also closed a real, confirmed self-approval gap across all
  three accept/merge gates (photo, recategorization, manifest change):
  GitHub's website hides the Approve/merge controls for a PR's own
  author, but the REST API this app uses does not enforce that. See
  SECURITY.md's "Self-approval is blocked" section.
- **Added tabs to the Contributor Portal** (My Reviewables /
  Recategorize / Photo Location Fix) (PR #93), plus real submit-to-toast
  feedback and a live-status tracking list for proposed fixes -- these
  had been three separate real actions stacked as one long scroll of
  cards.
- **Built the Maintainer Portal's review UI for manifest-change
  proposals** (PR #95): a full-page, color-coded diff view (proposed =
  blue, current position = green, a removal = blue with a
  corner-to-corner X) instead of the photo compare/annotate canvas,
  wired to the same Accept/Reject actions as a photo request.
- **Fixed: a local upload's status could never be corrected if the real
  submission was made under a different account, or an earlier browser
  session on a shared device** (PR #94) -- switched from a search
  scoped to whoever's currently signed in to a direct per-PR state
  check, which works regardless of who submitted it. Also fixed the "we
  don't have this manual yet" CTA never clearing after a later
  successful match, and tightened the proposed-fixes list into a
  collapsible, compact list.
- **Fixed the recategorization picker rendering one `<option>` per
  approved registry entry with no limit** (PR #91) -- added a category
  filter and live search, capped at 100 rendered options regardless of
  registry size; the same picker pattern was reused for the
  photo-location-fix feature above.
- **Restored a review-status feature that had silently never reached
  `main`** (PR #90) despite being reported as shipped -- a merge
  commit's second parent turned out to be an earlier sibling commit,
  not the one adding the feature. Replaced "View on GitHub" with an
  inline review-status line reusing the same endpoint the Maintainer
  Portal already used, and fixed submitted/accepted sharing the exact
  same badge color.
- **Fixed three real bugs in the reviewables/patching pipeline** (PR
  #89): the Public-path submission search silently found nothing on
  every request (GitHub's Search API doesn't handle a quoted phrase
  containing an apostrophe -- confirmed directly against the live API),
  a locally-saved upload's status never updated once the real PR was
  merged or closed on GitHub, and `images/README.md` was being counted
  as an "available photo" in the patcher's own log.
- **Fixed: "Propose a recategorization" was visible to signed-out
  visitors** (PR #88), inviting them to fill out a form that would only
  hit a sign-in wall at Submit.
- **Fixed a real factual error in the FAQ's repo-ownership answer, then
  audited and corrected four more real drifts found by a full pass**
  (PRs #86-87): a background research pass found the org-approval-quorum,
  local-draft-storage, "passive" maintainer label, and photo-removal
  answers all describing something the code never built or had since
  moved past. Also rewrote every double-dash clause connector in the
  FAQ into full sentences, and generalized its diagram/copy for the
  category expansion.
- **Fixed a real gap where every PR/review notification email GitHub
  sends links straight into raw github.com, with no way back to the
  site** (PR #85): every real PR body this project's own code
  constructs now ends with a link back to the Contributor Portal.
  Logged an in-portal notification feed as a ROADMAP.md stretch goal,
  explicitly scoped to stay read-only with no new user data storage.
- **Added a photo annotation editor to the PR review panel** (PRs #62-64):
  five tools (Arrow, Line, Circle, Number, Text) for drawing callouts on
  a submitted photo during review, stored as relative (0-100) vector
  shapes on `entry.annotations`. Not yet wired into `patcher.js`'s
  actual PDF output -- see ROADMAP.md's "Callout/annotation overlays"
  section for that remaining work. Iterated live against a real pending
  photo PR throughout.
- **Fixed: the review box was positioned using the canvas's raw render-
  buffer size instead of its CSS-rendered size** (PR #63), landing it
  nowhere near the submitted photo on any window narrower than the
  page's full render width -- effectively every real desktop window,
  not just mobile as an earlier note assumed. Also split the review
  pane into a zoomed annotate view and a separate full-page position-
  adjust view.
- **Added a solid white backing behind every patched photo**, in both
  `patcher.js`'s real output and the review preview (PR #64) -- closes
  a real gap where a contributor's photo with any transparency could
  let the original scanned photo bleed through in the final PDF.
- **Added real review-status badges** to the photo-request list on both
  the Maintainer Portal (PR #65) and the Contributor Portal (PR #67),
  sorted so rows needing the viewer's own action float to the top.
- **Accessibility pass on the three tool pages** (`maintainer.html`,
  `contribute.html`, `registry-browse.html`): root font-size and every
  existing `rem`-based font-size bumped up, after confirming these pages
  never adopted the larger root `index.html` already used (PR #66).
  Same PR redesigned the review-status badges above with solid,
  contrast-checked fills.
- **Contributor Portal's "My Reviewables" split into colored Public/
  Private/Draft sections** (PR #67), and fixed a real bug where it only
  ever reflected this device's own `localStorage`, so a submission made
  from a different browser or device was invisible even though it was a
  real, live PR (PR #68) -- now synced against GitHub directly via the
  Search API.
- **Implemented the edition-subdirectory model designed on 2026-08-25.**
  A vehicle repo can now genuinely hold multiple editions (OEM, Haynes,
  etc.) side by side, each in its own `<edition_id>/manifest.json` +
  `<edition_id>/images/` folder with its own coordinate space, instead
  of the flat one-manifest-per-repo layout the design had specified but
  the code never actually implemented. Shipped in three PRs:
  - PR #55 (Phase 1, scaffold/CI): `scaffold/images/` moved to
    `scaffold/{{EDITION_ID}}/images/`; both CI workflows and
    `CONTRIBUTING.md`/`README.md`/the PR template updated to match.
  - PR #55 (Phase 2, web app): `registry.js`, `patcher.js`,
    `contribute.js`, `registry-browse.js`, `issue-requests.js`, and
    `review-panel.js` thread `edition_id` through every
    manifest/photo path; `registry.json` rows are matched on
    `(repo_url, edition_id)` together, since multiple edition-rows can
    now share one `repo_url`.
  - PR #56 (Phase 3, auth-worker): `handleDirectSubmit` detects an
    already-approved vehicle and routes a new edition through a
    disposable staging repo instead of minting a new named repo;
    `handleApproveVehicle` copies a new edition's files into the
    existing target repo (rather than always flipping a staging repo
    public) and derives `edition_id` from the repo's own real
    directory structure, never from the request body. The
    file-allowlist check now walks the full recursive git tree so it
    catches an unexpected file at any depth, not just two levels.
  See ROADMAP.md's "Edition-subdirectory implementation" section for
  the full before/after and the permanent "second edition vs. second
  fingerprint" distinction.

- **Fix: figure detection was wrongly skipped on every page with a real
  embedded text layer, not just pages needing OCR.** Caught live on a
  factory manual indexed to 0 entries across 1200+ pages. Figure
  detection is pure pixel-density analysis on the rendered page and has
  nothing to do with whether the page also carries real embedded text;
  it was gated behind the same check used to decide whether OCR is
  worth running for headings, so any manual with genuine text on most
  pages (unlike the flattened-scan test manuals this was first
  validated against) found close to nothing. Figure detection now runs
  on every page regardless. Heading extraction still only runs OCR on
  pages with no reliable text layer; a text-layer page's real heading
  text isn't read directly yet (tracked in ROADMAP.md), so it falls
  back to whatever heading carried forward from the last page that had
  one, same as any page with zero detected headings.

- **Made the missing-photo QR marker's visible code opt-in, off by
  default.** Direct feedback: at some figures' actual size, the QR
  drawn inside `drawContributeMarker`'s box was large enough to make
  the marker unusable rather than just visible. Added a checkbox in
  `index.html` ("Draw scannable QR codes on still-missing photos"),
  wired through `patchViaRegistry`, that controls whether the QR image
  is drawn at all; unchecked by default. The box stays fully tappable
  in any PDF viewer via its existing link annotation regardless of the
  setting, so turning the QR off costs nothing on the device used to
  patch. Real per-side placement (QR beside the figure instead of
  inside it) is logged as a follow-up in FEATURE_REQUESTS.md, not
  solved by this change.

- **Review-flow hardening and a real merge-time trust gate for photo
  PRs (PR #34, merged).**
  - Page-offset bug (picking an already-patched manual instead of the
    original scan silently renders the wrong page) fixed everywhere it
    applied: `contribute.js`, `review-panel.js`, `org-approval.js`,
    `issue-requests.js`, via one shared helper in `registry.js`.
  - PR attribution bug: Public (direct-contribute) submissions showed
    the GitHub App's bot identity as the requester instead of the real
    contributor. Fixed by preferring the filename-parsed contributor
    over GitHub's own "opened by" field.
  - Double-submit guard added to `contribute.js`'s Submit/Save actions
    (a real duplicate-PR bug, caught live) -- `review-panel.js`'s
    Accept/Reject and `org-approval.js`'s Approve already had the same
    guard.
  - New Worker endpoint `POST /accept-photo-pr`: independently
    re-verifies the caller's permission, then re-checks the PR's
    current state (exactly one photo, no other files, real image
    validation, metadata scan) before merging, pinned to the exact
    commit checked. Closes a real TOCTOU gap (a fork owner could swap
    a photo's content between review and merge) and a bypass gap (a
    contributor pushing straight to their fork skips
    `contribute.js`'s sanitizing re-encode entirely).
  - `BlaydeManual/vehicle-scaffold` (a real, previously-unwired GitHub
    template repo) is now applied to every vehicle repo at approval
    time, and its `checker.py` job is a required GitHub branch-
    protection status check -- closes the remaining gap the Worker
    endpoint alone couldn't: a native `git`/github.com merge bypassing
    application logic entirely. Verified live against a real vehicle
    repo, including that a normal merge attempt against a failing
    check is genuinely rejected by GitHub, no override.
  - **Real gap found and fixed, live, after the above was already
    built**: contribute.js's canvas re-encode was assumed to produce
    zero-metadata output; it didn't. Chrome injects a real ICC color
    profile into JPEG output that the original code never accounted
    for, which meant a real photo submitted through the site's own
    sanctioned upload flow would have failed the very checks meant to
    validate it. Fixed with a real client-side JPEG marker-stripping
    step, verified against the real `checker.py`; a matching blind spot
    in the Worker's own metadata scanner (same APP2/ICC segment) fixed
    alongside it.
  - `SECURITY.md` rewritten in step with each of the above as they
    landed; caught and corrected once for going stale (described the
    required-CI-check as unbuilt one commit after it was actually
    built and verified).

- **GitHub App migration, security audit, and org hardening (PR #21, merged).**
  - Two logins: existing classic OAuth App (`public_repo`), plus a new
    GitHub App for "submit directly" and contribute's Public path.
    `POST /direct-submit` creates a new vehicle repo private, under
    BlaydeManual, via the App's installation credential -- the
    submitter never gets write access. A notarization entry (manifest
    sha256, submitter, timestamp) is committed to
    `BlaydeManual/submission-log`. `contribute.js` has a real
    Public (App, immediate PR, no fork) / Private (fork, PR opened
    later) choice. `org-approval.js` is a real implementation: four
    server-side checks (file allowlist, notarization hash match,
    manifest schema, real org-admin role check) gate
    `POST /approve-vehicle`.
  - Security audit found and fixed 4 issues: missing repo-scope
    validation on `/direct-contribute` (installation token could target
    `registry`/`submission-log` directly), unvalidated `procedure_id`
    (path traversal risk), `/pending-vehicles` readable by any signed-in
    account (not just org members), notarization log keyed on raw
    client input instead of GitHub's echoed repo name. `SECURITY.md`
    rewritten.
  - `SECURITY-TESTING.md` added: 4-tier live testing plan (anonymous /
    non-member / member / admin).
  - Three bugs found via live testing, fixed and confirmed live: missing
    `User-Agent` header on all Worker->GitHub calls (403s); PKCS#1 vs
    PKCS#8 private key mismatch (JWT signing never worked); missing
    `Members` App permission caused `getOrgMembership` to swallow the
    real error and report a permission failure as "not a member."
  - Org settings corrected: member repo creation disabled, org-wide 2FA
    required, App permissions corrected (added Members read, removed
    unused Issues write). `enforce_admins` and `submission-log`'s lack
    of branch protection reviewed and kept as documented tradeoffs.
  - `my-vehicles.js` maintainer/collaborator roster is now real:
    `GET/PUT/DELETE .../collaborators` and `GET/DELETE .../invitations`
    with the caller's own OAuth token. Repo list now comes from live
    `GET /user/repos` discovery (`discoverMaintainedRepos()`), replacing
    a hardcoded two-repo mock; `review-panel.js`'s repo-scope candidate
    list uses the same source.

- **Real GitHub sign-in went live, and broke two things the first pass
  didn't catch until testing against the actual deployed site.**
  1. **The popup-to-opener handoff.** The original implementation told
     the tab that started sign-in about a successful login only via
     `window.opener.postMessage(...)`. In production, that reference
     doesn't reliably survive the popup's round trip through
     `github.com` and back -- some browsers sever it even on a
     same-origin landing. The symptom: the popup would show "signed
     in," and the original tab would just sit there. Fixed by moving
     the primary handoff to `localStorage` plus the `storage` event
     (which fires in every other same-origin window watching it,
     independent of any opener reference), keeping `postMessage` only
     as a secondary path.
  2. **The site's build output directory is `web/`, not the repo
     root.** Every link built as `../docs/faq.html`, `../LEGAL.md`,
     `../README.md`, `../ROADMAP.md` was reaching for a `../` that
     doesn't exist on the live site -- Cloudflare Pages' SPA-style
     fallback silently served the homepage instead of a 404, so this
     wasn't obvious until someone actually clicked "More in the FAQ."
     Fixed by moving `docs/` inside `web/` (so it deploys with
     everything else) and pointing the three `.md` file links at their
     real GitHub-hosted URLs instead of a local path that was never
     part of the deployed site.

- **Accessibility review, ahead of the real domain going live.** Three
  real fixes, one already-good pattern confirmed rather than assumed:
  1. The missing `<meta name="viewport">` tag, see the SEO entry below
     -- every page was rendering at desktop width and scaling down on
     a real phone, forcing pinch-zoom. This is a genuine accessibility
     failure (WCAG 1.4.10, reflow), not just an SEO gap.
  2. The red-on-black text halo, see below -- a real optical effect
     (chromostereopsis), not just a stylistic preference.
  3. Verified white text on the brand's red (`#c8102e`) actually meets
     WCAG AA contrast (5.88:1) rather than assuming it did or didn't
     -- see below.
  4. Audited every page's images for real `alt` text instead of
     assuming it was fine: `hero-before.jpg`/`hero-after.jpg` and every
     photo preview/compare view in `contribute.html`/`maintainer.html`
     already carry specific, real descriptions, not generic
     placeholders -- nothing to fix there. The two `alt=""` instances
     found (`indexer-review.js`'s page-render canvas, `maintainer.html`'s
     page modal) are the live PDF-page surfaces the in-browser box
     editor draws onto -- a defensible, if imperfect, choice for a
     feature that is fundamentally a mouse-driven visual tool with no
     real screen-reader-usable equivalent, left as-is rather than
     papered over with a description that wouldn't actually help.
- Added a soft dark halo (`--red-halo`, a tight `text-shadow`) behind
  every instance of red text on a dark background, across all five
  public pages. Direct request: the red-on-black brand text was
  described as painful to look at. This is a real optical effect, not
  just a stylistic preference. Saturated red against near-black causes
  measurable chromostereopsis, where the eye's own chromatic
  aberration makes the edge appear to shimmer. Evaluated four real
  options first (soft halo, hard 4-direction outline,
  `-webkit-text-stroke`, a grounding drop shadow) with live rendered
  examples using the actual palette and copy before picking this one:
  the smallest intervention that fixes the actual edge-instability
  problem without changing the brand red itself or reading as a
  "designed" effect. Applied only where red text actually sits on a
  dark background. `docs/faq.html` uses a light body with only its
  header on dark, so only the header's red text got the halo. The
  rest of that page was deliberately left untouched.
- Confirmed white text on the brand's red (`#c8102e`, e.g. the "Sign
  in with GitHub" buttons) is not the accessibility problem it can
  look like at a glance. Computed the real WCAG contrast ratio rather
  than going by instinct: 5.88:1, clearing the 4.5:1 AA requirement
  for normal text with real margin. The instinct that white-on-red is
  often a mistake is correct for pure red (`#ff0000`, which only
  reaches 4.0:1 and fails AA) -- this brand's red is deliberately
  darker and less saturated, which is exactly what buys back the
  contrast margin. No change needed.
- Baseline SEO and mobile-usability pass across all five public pages
  (`web/index.html`, `web/contribute.html`, `web/maintainer.html`,
  `web/registry-browse.html`, `docs/faq.html`), done ahead of the real
  domain going live. None of this existed before this pass. Most
  significant finding: there was no `<meta name="viewport">` tag
  anywhere on the site at all. This isn't just an SEO gap. It means
  every page was rendering at desktop width and scaling down on a real
  phone, forcing a visitor to pinch-zoom. Verified live at 375px width:
  the page now properly reflows into a single column instead. Added,
  per page: a real meta description, a canonical URL, Open Graph and
  Twitter Card tags (so a shared link actually previews correctly in
  Slack, Discord, or social apps instead of showing nothing), and a
  favicon (`web/favicon.svg`, a simple placeholder monogram, not a
  final logo). Also added `web/robots.txt` and `web/sitemap.xml` at
  the site root. All canonical/`og:url` values assume the eventual
  deploy keeps the current relative folder structure (`docs/faq.html`
  living at `blaydemanual.com/docs/faq.html`, everything else at the
  root) -- worth confirming once real hosting is decided, since that's
  an assumption, not a confirmed fact.
- `web/patcher.js`: the generated cover page said "COMMUNITY-MAINTAINED
  SERVICE MANUAL, BROWSER EDITION." The manual isn't a distinct
  "edition" just because the tool that generated it runs in a browser.
  That's a fact about the tool, not the document. Dropped the
  "BROWSER EDITION" suffix entirely. Also found the same page's
  disclaimer text didn't actually carry the safety-verification
  language LEGAL.md itself requires ("use at your own risk, verify
  safety-critical specs against an authoritative source") while
  reviewing the same content. Added it, and rewrote the whole
  disclaimer as full sentences instead of dash-joined clauses.
- `web/index.html`: the file-picker label still said "fingerprinted
  locally," missed by an earlier pass that softened the same jargon
  elsewhere on this page ("fingerprint it" became "identify it" in
  the lead sentence, but this separate label was never touched).
  Reworded to match, as full sentences.
- `web/contribute.html`, `web/contribute.js`: real consent capture
  before a photo can be saved or submitted, not just a PR template
  checkbox nobody's forced to fill in truthfully. Two required
  checkboxes appear once a photo is picked ("this is my own photo,"
  "I license this under CC-BY 4.0") -- both must be checked before
  Save/Submit enable, verified live via real clicks. Resets to
  unchecked on every new photo pick, so consent never silently carries
  over from a previously-attested file. Recorded on the upload record
  itself for a traceable attestation once real PRs carry this in their
  body. Closes the gap ROADMAP.md's direct-to-git contribution audit
  already flagged as real but not bypass-specific.
- `LICENSE`, `scaffold/LICENSE` (new): replaced the placeholder AGPL-3.0
  notice with the full, canonical license text fetched verbatim from
  gnu.org and byte-diff-confirmed against the download -- closes the
  TODO the placeholder itself had been carrying. `scaffold/LICENSE` is
  new; every vehicle repo forked from scaffold previously had no actual
  license file of its own at all, only `LICENSE.md`'s explainer
  pointing at a `LICENSE` file that lived in a completely different
  repo from the fork's perspective.
- `scaffold/README.md`, `scaffold/LICENSE.md`: fixed two broken "the
  parent project's LEGAL.md" references -- a forked vehicle repo has no
  such relative file, so both now link the real tooling-repo URL
  directly. Also added a redirect note at the top of
  `scaffold/README.md`: someone landing on a vehicle repo directly (a
  search hit, a curious dev) previously had zero pointer back to
  blaydemanual.com, the actual GitHub-invisible entry point this whole
  project is built around.
- `web/index.html`: the before/after hero images now share a fixed
  `aspect-ratio: 4/3` box with `object-fit: cover`, instead of each
  rendering at its own source image's native ratio. The two photos are
  deliberately shot on different cameras/angles (not a matched pair),
  so their native ratios were never going to line up on their own --
  this also means a future photo swap never needs manual re-cropping
  to match its pair again.
- `web/contribute.html`, `web/maintainer.html`, `web/registry-browse.html`,
  `docs/faq.html`: a "BlaydeManual Home" pill, top-right, on every
  non-home page -- matching the existing Contributors/Maintainers pill
  style on `registry-browse.html`/`index.html`, added fresh (new
  `.top-nav`/`.pill-link` CSS) on `contribute.html`/`maintainer.html`,
  which had no top nav at all before this. `docs/faq.html` uses its own
  light-page-with-dark-header visual system, so its pill is a distinct
  glassy style positioned on the dark header band rather than the
  other pages' solid pill, to actually read correctly against that
  background.
- `web/images/hero-after.jpg`: replaced with a new photo -- tighter
  crop on the timing chain/sprocket detail, a stronger "into THIS!"
  shot than the previous wider one. `hero-before.jpg` intentionally
  untouched -- the two are meant to be different cameras/angles to
  fully showcase the contrast, not a matched before/after pair. EXIF
  stripped and resized to 1400px wide before committing, same
  discipline as every other image this project ships.

- `web/contribute.js`: the photo picker now strips EXIF metadata (GPS
  location, camera/phone model, timestamp) client-side, before a photo
  is ever stored anywhere -- including a draft that never gets
  submitted. Closes a real gap ROADMAP.md already flagged: a CI-side
  check (`checker.py`) runs *after* a photo is committed to a branch,
  so it can catch a leak but can't undo one -- the load-bearing check
  has to happen before the first save. Implemented by re-encoding the
  picked file through a canvas (`createImageBitmap` -> draw -> 
  `toDataURL`) -- canvas pixel data carries no metadata channel at all,
  so there's no EXIF field to parse or allowlist, the whole block is
  simply never in the output. Verified at the byte level: output JPEG
  header is `FF D8 FF E0` (JFIF marker only), no `FF E1` (EXIF marker)
  present. Directly prompted by finding real GPS EXIF in this session's
  own hero images before they were caught and stripped (see this file's
  `v0.9.9 pre-push gate` entry).
- **The original Python CLI toolchain is retired, moved local-only.**
  `indexer.py`, `generate_review.py`, `review_server.py`,
  `apply_additions.py`, `apply_bbox_edits.py`, `apply_exclusions.py`,
  `add_page_geometry.py`, `patch_pdf.py`, `check_registry.py`,
  `propose_new_vehicle.py`, `approve_registry_entry.py`,
  `fetch_repo.py`, `init_repo.py`, and `registry.py` move to
  `legacy-python-local/` (gitignored -- kept on disk for reference,
  never enters the public repo's history). `checker.py` is the one
  exception: it's not a superseded prototype, it's live infrastructure
  the real CI workflow calls directly, so it moves to `scaffold/`
  instead, where it ships into every forked vehicle repo. `mosaic.py`
  and `stylize.py` also stay -- confirmed still needed, not yet ported
  (see ROADMAP.md's photomosaic section).

  Worth being honest about what this move actually represents, since
  it's easy to describe as a straightforward "port" and that would be
  the wrong word for it. This project started as a Python CLI tool
  because that was the fastest way to prove the core idea worked at
  all -- OCR a scanned manual, find the figures, let a human review
  and patch them. The move to a browser implementation happened purely
  for convenience -- so a contributor or maintainer never needs Python,
  a venv, or a terminal installed at all, just a browser. The browser
  version matches the *function* of the Python original at every step
  (indexing, review, patching, registry/org-approval flows), but the
  actual solution underneath is fundamentally different code, written
  independently against a different runtime and constraints (pdf.js
  instead of PyMuPDF, in-browser Canvas instead of PIL, client-side
  fetch/GitHub-API calls instead of a local server) -- there's no
  meaningful line-by-line diff between the two to point to, and no
  attempt was made to force one. This is a rewrite that happens to
  match behavior, not a port, and shouldn't be read or tracked as one.

- `web/patcher.js`: manual test mode now fails with a clear log message
  instead of a raw pdf-lib bounds exception when the loaded PDF is
  shorter than the reference page it's hardcoded to draw onto. Found
  during a full end-to-end functional demo (index an unknown vehicle
  through org approval, a contributor's photo through maintainer
  review, then a cold-start patch) run against a small 10-page test
  slice -- manual test mode is intentionally pinned to the original
  40-page reference manual it was measured against (`TEST_PAGE_INDEX`,
  `TEST_PIXEL_BBOX`), not meant to generalize to arbitrary documents,
  so the fix is a clear refusal, not a rewrite of the fallback's scope.
  Every other stage of the demo (real client-side fingerprinting, real
  indexer page detection, org compare/approve, contributor submission,
  maintainer review/accept, registry-browse discovery, and the real
  patch-compositing step itself against the actual reference manual)
  worked as designed, no other code changes needed.

- `web/registry-browse.html`, `web/registry-browse.js`: reworked each
  vehicle row to list its editions individually instead of one merged
  "N editions: OEM, Haynes" line with a single aggregate percentage.
  Each edition (`OEM`, `Haynes`, etc.) now shows its own source
  document link (so a visitor can download and patch it themselves,
  no account needed) and its own coverage stat -- correcting a real
  design flaw in the first pass: photos don't carry over between
  editions of the same vehicle (they're different documents with
  different layouts), so a single merged percentage was actively
  misleading, not just less detailed, whenever a vehicle had more than
  one manual.
- `web/registry-browse.html`, `web/registry-browse.js` (new): standalone
  registry browse/discovery page, linked from `web/index.html`'s file
  picker ("Don't have your PDF handy? Browse registered vehicles").
  Groups entries by make+model into cards, each generation (separate
  repo, per the generations-stay-separate decision) as its own row
  linking to `index.html?vehicle=...`; search box, a `vehicle_class`
  filter, and an inline "passive" badge for vehicles flagged quiet in
  the registry.
- `web/issue-requests.js` (new), `web/maintainer.html`,
  `web/maintainer-portal.js`, `web/review-panel.js`: **Issue Requests**
  built, closing out the tab that had been scoped-but-pinned. Reuses
  the actual patcher mechanism as the editor instead of inventing a
  fourth "load the current version" renderer -- pick a repo/edition,
  pick your own copy of the manual, patch against the current approved
  photos, browse page by page. Dragging an existing box queues a
  reposition/resize issue; drawing a new box on empty space prompts for
  a label and queues a missing-slot issue; right-clicking an existing
  photo offers "problem with this photo" (opens the Contributor Portal
  for that procedure -- no new mechanism) or "add a comment" (no bbox
  at all). Every queued issue submits into the exact same `MOCK_PRS`
  queue and `review-panel.js` accept/reject tool a photo submission
  already uses, distinguished only by `issue_type`. The page image now
  fits its container width on open (matching review-panel.js's compare
  canvas), with overlay boxes and drag math left in the page's native
  pixel space inside a CSS-scaled wrapper, plus a footer instructions
  bar matching the indexer's own page editor -- both added for
  consistency with the two existing page-editor UIs, per direct
  request. Two real bugs caught and fixed while verifying end to end:
  a comment issue has no bbox, which crashed `review-panel.js`'s
  `renderPage()`/`resetBox()` on a null destructure -- fixed by
  special-casing `issue_type === "comment"` to skip the compare/box UI
  entirely; and `MOCK_PRS` being a page-load-time snapshot meant an
  issue submitted from this same page session didn't show up in Review
  Photo Requests without a full reload -- fixed by re-syncing from
  storage both at sign-in and whenever the Review Photo Requests tab is
  opened.
- `web/maintainer.html`, `web/contribute.html`: `.edition-bar` is now a
  full-bleed bar (same negative-margin technique as `.vehicle-bar`),
  one shade darker than `.vehicle-bar`'s grey, so the two grouping
  tiers read as visually nested instead of a plain label under a bar.
- `web/review-panel.js`, `web/contribute.js`, `web/my-vehicles.js`,
  `web/maintainer.html`, `web/contribute.html`: the edition tier
  confirmed missing during the multi-manual architecture correction is
  now built across all three flagged screens. **Review Photo
  Requests** and **My uploads** both now group vehicle -> edition ->
  item (new `.edition-bar` sub-heading, one tier down from
  `.vehicle-bar`) instead of vehicle -> item; **My Vehicles** now
  states which editions each vehicle's roster actually covers ("Covers
  2 editions: OEM, Haynes"). `mock-pr-store.js`'s seed data and
  `contribute.js`'s `MOCK_MANIFEST_CONTEXT` both got real `edition_id`
  values (one seed request switched to the Haynes edition, matching
  its `haynes_hank` author, to actually exercise the new grouping
  instead of every seed item defaulting to one edition). Caught and
  fixed a real bug while building this: the first draft of
  `renderPRList()`'s edition grouping mixed `innerHTML +=` with
  `appendChild` in the same loop, which would have silently destroyed
  previously-appended rows on each new edition group -- rewritten to
  build every element via `createElement`. Verified live end to end:
  submitted photos against two different editions of the same vehicle,
  confirmed both Review Photo Requests and My uploads render the
  correct nested groups.
- `web/maintainer.html`: top subheading and sign-in card copy reworked
  to match the plain-language pattern already set for the Contributor
  Portal -- "Thank you for maintaining. Everything is in one place
  here." replaces a functional description, and the sign-in card now
  states plainly what's behind it ("Sign in to review photo
  submissions, manage your vehicle's team, approve new manuals, and
  index one of your own.") instead of "this page only works for a
  signed-in maintainer."
- `web/org-approval.js`: the approve-action log now names the
  destination vehicle explicitly ("merge this edition into:
  suzuki-sv650-1999-2002") instead of just "the existing vehicle
  repo," direct feedback that the reviewer shouldn't have to infer the
  destination from context.
- `docs/faq.html`: two answers corrected to match the multi-manual
  architecture decisions from this session. "Does a small team have to
  approve every single photo?" now says the org reviews every manual
  *submission* (new vehicle or a new manual for an existing one), not
  "approves a new vehicle once" -- what differs is the outcome
  (new repo vs. join an existing one), not the review itself. "What if
  my vehicle has more than one manual?" now correctly says editions of
  the same generation share one repo and one maintainer team (not
  separate repos, the old wrong answer), and adds the distinction that
  was missing entirely: generations of the same model name (SV650
  Gen1 vs. Gen2) stay separate repos, since they're mechanically
  different vehicles sharing a name, not two books about the same one.
- `web/indexer-core.js` / `indexer-review.js` / `maintainer.html`:
  new "What kind of manual is this?" field in the indexer's Stage 3
  review, direct answer to the multi-manual architecture correction --
  a submitter names their edition (OEM, Haynes, Chilton...), checked
  live against the registry for a same-vehicle-same-edition collision
  ("Type: OEM -- a document with that type already exists for
  suzuki-sv650-1999-2002"), blocking submission until resolved, same
  pattern as the existing required-source-URL check. New
  `checkEditionCollision()` / `listExistingEditions()` in
  `indexer-core.js`, same non-blocking-on-network-failure convention
  as the existing `checkAlreadyRegistered()`.
- `web/org-approval.js` / `maintainer.html` / `review-panel.js`: the
  "Approve New Vehicles" flow now distinguishes a brand-new-vehicle
  submission from a new-edition-of-an-existing-vehicle one, per the
  corrected governance model. For an existing vehicle, the reviewer
  now sees exactly what was asked for -- "This vehicle already has N
  documents. Does '<edition>' actually fit, or is it the same as one
  of these?" with the existing editions listed -- and the approve
  button and its mock action log branch accordingly (create repo +
  first maintainer, vs. merge into the existing repo + add the
  submitter to its existing maintainer pool). `MOCK_REGISTRY` in
  `review-panel.js` now models a vehicle with two real editions
  (`suzuki-sv650-1999-2002`: OEM + Haynes) instead of implying one
  edition per vehicle. Verified live: both the new-vehicle and
  new-edition approval paths render and log correctly; the collision
  check correctly flags a same-vehicle-same-edition match and passes a
  different edition through.
- `web/contribute.js` / `.html`: two new mocked actions in "My
  uploads," both real UI answers to design questions asked directly.
  **"Request to help maintain this vehicle"** -- per vehicle group,
  the UI half of the maintainer-succession mechanism designed in
  ROADMAP.md; persists a mock request (localStorage-backed, same
  convention as every other mocked action here), logs what it would
  actually notify, shows a confirmation once requested instead of the
  button. **"Request removal"** -- per submitted/accepted upload, the
  concrete button behind the FAQ's existing "ask to have it removed"
  answer, which never had a real UI before. Both verified live.
- `web/index.html`: the 5-step "we don't have this one yet" stepper
  now shows a rough time estimate per step (indexing ~20 min
  automatic, quick pass ~15 min, submit-and-wait days mostly waiting,
  ongoing maintenance marked "ongoing"), and a new line before the
  CTA -- "These 5 steps seem reasonable? Read the maintainer
  guidance..." -- linking to a new `docs/faq.html#for-maintainers`
  section before presenting the sign-in/refer-someone choice. Step 5's
  copy also updated to name the actual ongoing job ("review photo
  submissions and steer quality -- that's the whole job").
- `docs/faq.html`: new "For Maintainers" section -- what's actually
  expected (photo review only, explicitly not repo size/scaling/
  project success/legal architecture), what happens if a maintainer
  goes quiet (reassurance, not obligation, points at the "passive"
  registry label), and the 2-5 maintainer-count guidance. Also
  corrected "Do I have to share my photos publicly?" -- the old answer
  overclaimed "entirely on your own device"; the accurate version
  distinguishes patching (genuinely device-only) from an unshared
  draft (still account-linked, not device-only) from a fully offline
  no-account path (not built, a real logged feature request).
- `web/index.html`: trust-chip icons -- direct feedback that the
  earlier all-neutral treatment left four identical grey tiles with no
  visual break. Icon glyph color changed to `--red` while keeping the
  tile background neutral grey (not a red-tinted background) --
  enough accent to break up the row without reintroducing the
  alarm-color problem the neutral pass fixed. Chip titles bumped from
  0.82rem to 0.95rem. Also corrected "100% local" chip copy -- "No PDF
  content is uploaded anywhere" instead of "Nothing is uploaded
  anywhere," which overclaimed given contributed photos obviously do
  get uploaded.
- `web/indexer-ui.js`: indexing completion now closes with "It's up to
  the community to keep going. Thank you for contributing." right
  after the "DONE in Xs -- N entries across M page(s)" line -- a
  community-framed closing note instead of ending on a bare stat line.
  First draft leaned on "now it's yours to finish" (individual
  ownership); corrected directly to the community framing above.
  Verified live against a real indexing run.
- `web/maintainer.html` / `indexer-review.js`: the indexer review
  modal ("view / add missing" per page) was missing a header and a
  go-to-page jump control that `generate_review.py`'s original review
  gallery had -- caught directly during an end-to-end walkthrough
  test. Added both: a header showing "Page N of M -- X candidates on
  this page," and a "jump to page: [#] [Open page]" control, bounds-
  checked against the manual's real page count. Omit-vs-delete was
  deliberately NOT ported to match the old tool -- `indexer-review.js`
  already documents why this modal is delete-only on purpose (no
  unfillable "omitted" procedure ships in a live manifest), so that
  gap is a considered decision, not something this fix reversed.
  Verified live: real page render, real jump between pages, an
  out-of-range page number correctly rejected.
- `web/contribute.html`: "skips checking your framing... -- you can
  also save it" -- em-dash run-on, direct feedback that the second
  half is a separate sentence, not a continuation. Split into two
  proper sentences.

- `web/contribute.js`: real inconsistency caught directly -- the
  landing sign-in gate (`#landingSignIn`) and "My uploads" were both
  showing at once when arriving with no procedure context, because
  `renderUploads()`'s visibility check only looked at `uploads.length`,
  ignoring whether the visitor had actually signed in on this path.
  Fixed: uploads only show once signed in when arriving via the
  landing page (no `repo`/`procedure` params); arriving via a real QR
  code still shows uploads without requiring sign-in, unchanged, since
  that's the original documented behavior ("browsing never requires an
  account"). Verified both paths directly.
- `web/index.html`: `--red-text` (the brighter red used for small text
  on dark backgrounds) read as pink, not red -- direct feedback.
  Root cause: it kept the same hue as `--red` but pushed lightness up
  with a green channel mixed in, which reads as coral/pink at high
  lightness. Fixed to `#ff002b` -- zero green, same hue, more black
  mixed out instead of more light mixed in -- clean red, still clears
  4.89:1 contrast (comfortably past the 4.5:1 AA minimum).
- `web/contribute.html`: two paragraphs simplified, direct feedback
  that neither was plain language. The landing sign-in card's
  paragraph explained *why* you're seeing a sign-in prompt (QR vs. nav
  link) -- unnecessary since anyone who clicked "Contributors" already
  has their own reason to be here; replaced with a plain one-line
  description of what's behind the sign-in ("Review your saved
  uploads, send them for approval, manage issues"). With that in
  place, the top intro line under the header no longer needs to
  function-describe anything either -- the sign-in card covers what's
  about to happen, and once inside, that's just what's happening.
  Replaced with a plain welcome: "Thank you for contributing. We hope
  you enjoy."
- `web/index.html`: two more trust chips added below the existing pair
  -- "Free & open source" and "Community-run" -- direct feedback that
  the page never actually said either of those things, and a visitor
  landing cold would have no way to know. Same treatment: icon, bold
  title, short subtext.
- `web/index.html`: added a footer with links to `README.md`,
  `LEGAL.md`, and `ROADMAP.md`, reusing the exact pattern already
  established on `docs/faq.html` rather than inventing a new one.
- **Color scheme review, prompted directly by "those icons look
  terrifying when red" and "I don't love mint" -- measured against
  WCAG contrast minimums, not just re-picked by eye:**
  - All four trust-chip icons switched from red/mint to one neutral
    treatment (`--text` on a faint steel tint). These are reassurance
    messages, not alerts -- red signaling danger was a real semantic
    mismatch, not just a color visitors didn't like.
  - Found two real AA contrast failures: `--red` (#c8102e) on black
    measures ~3.3:1, below the 4.5:1 minimum for text under 18.67px
    bold. Affected the hero eyebrow (14.4px bold) and the "THIS!"
    label (16px bold) -- both were failing, not just "could be
    better." Added `--red-text: #ff2e4f` (5.33:1) for small red text
    on dark backgrounds; `--red` unchanged for buttons/pills where
    it's paired with white text (already 5.88:1) and the h1 accent
    (large bold text, clears the 3:1 large-text minimum).
  - Found `--steel-dark` (#4a4f57, used for card/divider borders)
    measuring ~2.36:1 against black, below the 3:1 non-text UI
    contrast minimum -- card boundaries were genuinely hard to
    perceive, not just subtle by design. Updated to `#666c76`
    (3.68:1). Propagated to `web/maintainer.html` and
    `web/contribute.html` too, since they share the same token and the
    same border-visibility problem; `docs/faq.html` uses its own
    separate token set and wasn't touched.
  - All contrast numbers computed directly (WCAG relative-luminance
    formula), not eyeballed -- verified before and after.
- `web/index.html`: "Pick your manual PDF" -> "Pick your PDF manual"
  in both spots (lead sentence and file-picker card heading) -- word
  order was already fixed on `maintainer.html`'s indexer field, just
  never propagated here. Also "patch in real photos" -> "patch in
  contributed photos" (implied the *other* photos weren't real) and
  dropped the trailing "-- all right here" (the file-picker card right
  below already says that).
- `web/index.html`: merged the intro sentence into the hero block
  itself instead of a separate plain-text line above it -- a small red
  uppercase eyebrow ("THE WHOLE IDEA, IN ONE PICTURE") plus a bold
  white explainer sentence, sitting directly above the "Turn this /
  into THIS!" photos, same energy as `docs/faq.html`'s emoji flyer
  band. First pass included two emoji in the eyebrow, removed per
  direct feedback; eyebrow font size bumped up after.
- `web/index.html`: moved the "100% local" / "No AI" trust-chip strip
  from directly under the header down to just above the file-picker
  card (after the tagline) -- now the last thing a visitor sees is the
  local/no-AI reassurance right before they're asked to pick a file,
  not before they've even seen what the tool does.
- `web/index.html`: the two plain-grey trust-line paragraphs under the
  header ("Nothing is uploaded..." / "No AI runs here...") reworked
  into a two-badge `.trust-strip` -- icon (padlock, crossed-out chip)
  + bold title + short subtext, side by side on desktop, stacking on
  mobile. Same information, real visual weight instead of looking like
  filler text ahead of the tool, and less total vertical height than
  the two stacked paragraphs it replaced. Lead sentence above it also
  reworded ("fingerprint it" -> "identify it" -- same meaning, reads
  less like surveillance jargon to a general audience); the
  file-picker card's own "fingerprinted locally" label left as-is,
  flagged for a consistency pass if wanted.
- `web/index.html`: hero subheading "Revive your old manuals." ->
  "Revive your old vehicle manuals." -- the old copy didn't say what
  kind of manual this covers, which was apparently vague enough to
  raise the question of scope again from scratch. Scope was already
  settled (see ROADMAP.md's per-vehicle-class template plan --
  motorcycles now, cars/boats/etc. next via `vehicle_class`), just
  never actually said on the page.
- `web/contribute.html` / `contribute.js`: the "Contributors" nav pill
  landed on a hardcoded default procedure card before this (flagged as
  a known gap last commit) -- now, arriving with no `repo`/`procedure`
  params shows a sign-in gate first (`#landingSignIn`, same pattern as
  the Maintainer Portal's `#signInCard`), and lands on "My uploads"
  after signing in instead of a procedure-specific card. Arriving via
  a real in-PDF QR code (both params present) is unchanged -- procedure
  context and photo picker still show immediately, sign-in still
  deferred to save/submit. Verified both paths directly: no-params
  shows the sign-in gate then "My uploads" on click; both-params still
  shows the procedure card immediately, untouched.
- `web/index.html`: top nav replaced the single "Already a maintainer?"
  text link with two pill links -- "Contributors" (light grey,
  `contribute.html`) and "Maintainers" (red, `maintainer.html`).
  Landing page had no contributor entry point at all before this.
  Known gap surfaced while testing, not fixed here: `contribute.html`
  was built to be reached only via a QR code scoped to one specific
  procedure, so following the new nav pill with no `repo`/`procedure`
  params lands on a hardcoded default procedure card instead of a
  general landing state. "My uploads" below it still works correctly
  regardless. Considered adding the halftone-clearing animated
  explainer strip here too, decided against -- that was already cut
  from the hero once (commit `9a7c93e`) for implying gradual AI
  enhancement rather than a straight photo replacement; the existing
  static hero already covers the explainer job.
- `web/index.html` / `patcher.js`: contributor preference reworked
  from independent checkboxes to a drag-and-drop-reorderable priority
  list -- raised directly, checkboxes implied "pick who's included,"
  not "pick the order I want them tried in." The whole list is now
  always the priority order (no opt-in/opt-out), native HTML5
  drag-and-drop, DOM order read back directly by `getPriorityList()`.
  Default order stays contribution-count descending (kept over a
  random default -- real signal, and dragging is right there for
  anyone who wants something different). Verified: simulated reorder,
  confirmed `getPriorityList()` reflects the new order and the visible
  rank numbers update.
- `web/index.html`: hero label's red "this" -> "THIS!" ("Into THIS!"),
  more emphatic against the grey "this" of "Turn this" on the left.
  "Into" lowercased to "into" right after, so the capitalization only
  lands on THIS!, not the lead-in word.
- `web/index.html`: reworded the 5-step "we don't have this one yet"
  card -- most of its copy leaned on "--" to stitch together fragments
  instead of writing complete sentences. Rewritten in plain, properly
  punctuated language throughout (colons, periods, "and" where a
  sentence actually needed one), same information and tone, no
  fragments.
- `web/index.html` / `patcher.js`: two real gaps caught on review of the
  just-wired landing page. (1) The raw `registry.json` URL text field
  is gone -- it was a dev-only knob a real visitor had no business
  seeing or editing; the URL is now a hardcoded constant
  (`DEFAULT_REGISTRY_URL`). (2) "Prefer a specific contributor's
  photos?" is no longer a free-text comma-separated-handles field
  shown before any file is even picked -- it now only appears after a
  registry match, populated from that match's actual photos
  (`computeContributorCounts()`), rendered as a checkbox list default-
  ordered by contribution count to this specific vehicle (not a global
  leaderboard). Checking one or more opts them into the existing
  priority-list behavior in `pickPhoto()`, in the order shown --
  checking multiple preserves count-desc order regardless of click
  order, verified directly. Verified the list also correctly clears
  and hides again on a fresh file pick and on a no-match result.
- `web/index.html`: wired the previously-standalone wireframes (hero
  before/after photo comparison with "Turn this / Into this" labels,
  five-step maintainer-onboarding stepper) into the real product page,
  replacing the old placeholder no-match card. Real photo files added
  at `web/images/hero-before.jpg` / `hero-after.jpg` (not inlined
  base64, unlike the shareable Artifact versions used earlier).
  `web/patcher.js`'s `showMaintainerCta()` now targets
  `#maintainerCtaLink` by ID instead of `card.querySelector("a")`,
  since the card now holds two `<a>` tags (the primary CTA and the
  "share this instead" out-link) and the old selector would have
  silently grabbed whichever came first. Added the `#outLink` click
  handler (mock "copy link" confirmation). Verified live: hero graphic
  renders correctly, the no-match path shows the stepper with all 5
  steps and step 5's self-approval warning flag, the CTA link carries
  the correct fingerprint hash to the Maintainer Portal, and the
  out-link's confirmation text displays on click.
- `web/patcher.js`: verified the in-PDF QR code end-to-end, not just
  unit-tested -- ran `drawContributeMarker()` against a real
  `@cantoo/pdf-lib` document, saved and re-parsed the output PDF to
  confirm it's genuinely valid, then rendered it to a real image
  (`pdftoppm`) and visually confirmed a real, well-formed QR pattern
  plus the placeholder box and label text, not just "didn't throw."
- `web/review-panel.js`: accept/reject now persist a real outcome
  (`status` + optional `maintainerNote`) via `saveMockPrs()` instead of
  only logging -- previously a contributor's "submitted" status never
  changed, forever, regardless of what a maintainer did. An accepted/
  rejected request drops out of the open queue but stays in storage so
  `contribute.js` can look up the outcome. Both actions prompt for an
  optional note, acceptance included, not just rejection.
  `contribute.js`'s "My uploads" now shows the live outcome (looked up
  by the PR number stashed at submit time) plus the note when there is
  one. Verified end-to-end: accept with a note, reload the Contributor
  Portal, see "accepted" and the note.
- `web/review-panel.js`: open requests within each vehicle group are
  now sorted by page (was submission order) and the row format leads
  with the page number ("PG. 28 -- Add photo: ...") instead of burying
  it in the meta line; the meta line now shows the actual contributed
  filename (`photo_filename`, threaded through from `contribute.js`'s
  file picker) instead of repeating the procedure_id.
- `web/contribute.js`: "My uploads" is now grouped by vehicle
  (collapsible `<details>`/`<summary>`, same `.vehicle-bar` visual
  language as Review Photo Requests) and sorted by page within each
  group, since the list grows across every vehicle someone's ever
  contributed to, not just whichever QR they scanned this time.
- Caught and fixed a real mock-data inconsistency during this pass:
  `mock-pr-store.js`'s seed data had one section heading with a stray
  chapter-number prefix the other two didn't, and the Kawasaki seed
  entry had no matching context in `contribute.js`'s
  `MOCK_MANIFEST_CONTEXT`, so its Contributor Portal card showed with
  no page or heading at all. Both fixed; the two mock data sources
  describe the same three seed procedures and need to stay in sync.
- `web/index.html` / `patcher.js`: dropped the "open your browser's
  network tab and watch nothing leave" copy -- developer-facing
  verification instruction that doesn't mean anything to most visitors,
  per direct feedback. Simplified to a plain trust statement.
- `ROADMAP.md`: logged maintainer note-writing guidance topics ("be
  polite, but honest," modified/aftermarket parts in frame, what's
  acceptable in the background, multiple valid photos per procedure)
  and a backlogged localization-priority question (which language
  first, with a lightly-reasoned but unresearched hypothesis about the
  product's likely year-range scope) -- both logged as open, not
  decided.
- `web/contribute.html` + `contribute.js` (new): Contributor Portal --
  the destination for the in-PDF contribute QR codes. Anonymous
  browsing/viewing always; sign-in deferred to "save" or "submit," the
  latest point identity can be avoided given batching across devices
  is structurally impossible without it (two browsers never share
  storage). "My uploads," a "View" comparing the exact procedure crop
  against the proposed photo (local-context rule, own PDF only) plus a
  "View whole page" toggle for reviewing several procedures from one
  page at once, and submit that feeds directly into `review-panel.js`'s
  existing approval queue -- no parallel review system. Verified
  end-to-end live: submit here, reload `maintainer.html`, the request
  appears in the existing queue; whole-page highlight box position
  matches the known bbox math exactly.
- `web/mock-pr-store.js` (new): the localStorage-backed mock PR store
  (seed data + load/save helpers) extracted out of `review-panel.js`
  so both it and `contribute.html` share one source of truth -- fixes
  a real ordering bug where `contribute.html` submitting first would
  have silently dropped the seed data forever.
- `web/patcher.js`: still-missing procedures now get a real QR code +
  short URL drawn where the photo would have gone (`drawContributeMarker`),
  linking to `contribute.html?repo=&procedure=`. `web/qrcode.js` (new,
  vendored) -- kazuhikoarase/qrcode-generator, MIT, fetched directly
  rather than CDN-loaded per this project's supply-chain stance.
- `FEATURE_REQUESTS.md` (new): first entry is the fully anonymous,
  offline-capable contribution path that was considered and not built,
  with the storage-model reasoning for why, framed for public voting
  once this repo is actually live.
- `web/maintainer.html`/`maintainer-portal.js`: dropped the ORG badge
  from Approve New Vehicles per direct feedback; a signed-in user with
  no maintained repos now lands on Index a New Vehicle by default
  instead of a disabled Review Photo Requests tab.
- Landing-page hero graphic, three follow-up rounds after the initial
  stage-1/stage-10 fix: (1) stopped using red for the "before"/bad side
  -- red is this project's brand/action color everywhere else, tying
  it to "bad" fought the rest of the page; (2) the first replacement
  (mint on the "after" side) was itself wrong -- mint was never
  actually decided as a brand color, just a utility accent for
  monospace log text and status dots, promoting it to headline weight
  overstated it; (3) restructured per direct instruction to a label
  over each photo instead of one shared headline -- "Turn this" over
  the original scan (steel on "this"), "Into this" over the
  contributed photo (red on "this"), connecting words plain white,
  tagline moved below as its own block ("Revive your old manuals." /
  "Powered by the community."). Also enhanced the demo photo itself
  with a standard (non-AI) ImageMagick pass -- auto white balance, mild
  contrast, unsharp mask, slight saturation lift -- since the source
  photo was phone-camera quality; logged a future to-do about whether
  the real contribution flow should offer similar basic touch-up
  assistance to contributors. Verified live after each round (label
  text/colors, image dimensions, no console errors).
- Landing-page hero graphic corrected: the 10-generation clarify
  animation read as AI photo enhancement (a single photo gradually
  sharpening), which is false and conflicts with this project's own
  "no AI runs here" copy elsewhere on the same page -- patching is a
  hard replacement, not an improvement of the original. Replaced with
  a simple stage-1/stage-10 side-by-side, no animation: "Turn this
  into this. Revive your old manuals." / "Powered by community-
  contributed photos." The 10-generation build isn't wasted -- still
  the right fit for the live patch-progress screen, just not for a
  landing-page explainer. Wireframed and sent for review, not yet
  wired into `web/index.html`.
- `web/registry.js`: **Fixed** -- `fetchManifestAndPhotos()`'s photo
  download loop was fully sequential (one `await fetch()` at a time,
  no concurrency), estimated to cost low minutes for a fully-covered
  manual with a few hundred contributed photos, almost entirely
  latency. Same problem class `indexer-core.js`'s OCR loop had before
  its worker pool, never applied here. Fixed with a concurrency-capped
  async pool (`min(8, hardwareConcurrency - 1)`, no actual Web Workers
  needed since `fetch()` is already non-blocking), plus per-file error
  isolation so one dropped/thrown fetch doesn't abort the batch.
  Verified with a mocked 20-file test: ~6.6x wall-clock speedup,
  max-8-concurrent confirmed live, all four skip paths (oversized
  pre-check/post-download, failed response, thrown error) and
  monotonic per-file progress still correct.
- Patcher-page progress wireframe (`web/index.html` concept, kept
  outside the repo in scratch) rebuilt from 3 discrete stages to a real
  10-generation sequence -- the project owner's own cam chain tensioner
  photo run through ImageMagick's ordered-dither halftone presets
  (`h8x8o`/`h6x6o`/`h4x4o`) blended toward the clean photo with
  `-compose Dissolve` at ten strengths, instead of jumping between three
  fixed frames. Dissolve's blend-percentage direction was checked
  empirically since it's easy to get backwards. Verified in a fresh
  browser tab: all ten generations render distinctly, the slider and
  autoplay both track and stop correctly at generation 10, and a
  completion message appears only at generation 10, never earlier.
- **Corrected same day:** the completion message shipped in the commit
  above ("Thank you for saving this vehicle.") was wrong for this page
  -- that mission language belongs on the *indexer*, not the patcher
  (see ROADMAP.md). Patching's own copy, since it's the mock user
  benefiting from work the community already did, not the one doing
  the rescuing: "Thank you for visiting. This was made possible by
  contributors around the world. Thank you for contributing." Fixed in
  the wireframe and republished to the same artifact URL.
- **Fixed:** `web/index.html`'s "Become the first maintainer" CTA had a
  dead static `href="indexer.html"` -- `indexer.html` was deleted when
  the Maintainer Portal absorbed it, and the JS-set dynamic href
  (`maintainer.html?hash=...`) only overwrote it once the CTA actually
  triggered, so the stale link sat there as dead markup either way.
  Fixed to `maintainer.html`. Also added a persistent "Already a
  maintainer? Go to the Maintainer Portal" link at the top of the
  landing page -- previously the only way in was picking a PDF that
  happened to come back unregistered, with no direct path for a maintainer
  who already knows where they're going.
- Testing-methodology note, worth keeping: the browser preview tool's
  own caching layer served stale `.js` content across tab closes,
  hard-reloads (Ctrl+Shift+R), and full server restarts during this
  verification -- confirmed via raw `curl` against the running server
  that the actual served bytes were correct the whole time, so the
  staleness was entirely in the browser tool's layer, not the app.
  Workaround: `fetch('/file.js?bust=' + Date.now())` and `eval()` the
  result to force genuinely fresh code into the page for testing.
- `web/my-vehicles.js` (new): built "My Vehicles" -- scoped strictly to
  `MOCK_MAINTAINER.reposmaintained` (same guard as Review Photo
  Requests, no special-casing for org roles). Per vehicle: a roster with
  per-repo stats (requests reviewed/total, tenure on this vehicle, days
  since last active) and an active/quiet signal at a 30-day threshold;
  invite by GitHub handle and remove, both mock, logged as the real
  collaborator API calls they'd become. Verified live: invite adds a
  member immediately, remove takes them out, stats/activity render
  correctly per vehicle.
- `web/maintainer.html`: reordered tabs to Review Photo Requests -> My
  Vehicles -> Approve New Vehicles -> Issue Requests -> Index a New
  Vehicle, per direct instruction. Dropped the REPO scope badge from
  every per-repo tab -- kept only on Approve New Vehicles, since ORG is
  the one still worth flagging explicitly.
- `web/review-panel.js` / `maintainer.html`: extracted the full-bleed
  light-grey vehicle-separator styling (built for Review Photo Requests)
  into a shared `.vehicle-bar` CSS class, reused by both Review Photo
  Requests and My Vehicles instead of duplicating the inline style.
- ROADMAP.md: "Org Team Membership" struck entirely -- decided against,
  not just pinned. Managing who's on the org-level new-vehicle-approval
  quorum would just duplicate GitHub's own People/Teams page for a tiny,
  rarely-changing group; that stays on GitHub directly, permanently.
- ROADMAP.md: recorded a real security finding from design review, not
  just an assumption -- this project never stores or proxies a GitHub
  token for maintainer actions, every write is meant to run through the
  signed-in maintainer's own token, so GitHub's own permission system is
  the real authority and this app's client-side role flags/badges are UX
  only, not a security boundary. Stated the caveat plainly: that's the
  target architecture once real OAuth replaces the mock -- today's build
  has zero real security, `MOCK_MAINTAINER` is a plain editable JS
  object, by design, since there's no live OAuth yet.
- **Fixed:** `web/index.html`'s title/heading still said "Browser
  Patcher" -- missed during the earlier "Browser Indexer" -> "PDF
  Indexer" rename, same reasoning applies (browser is where it runs, not
  what it does). Now "PDF Patcher"; `patcher.js`'s header comment
  updated to match.
- **Fixed:** the `?repo=` URL param that let a maintainer test against a
  repo other than the two hardcoded mock ones was accidentally dropped
  during the multi-repo grouping refactor. Restored as `reposToCheck()`
  -- an override still has to pass `isRegisteredRepo()` like any other
  repo, so this doesn't weaken the anti-spoofing guard, it only changes
  which repo(s) get checked. Verified live: an override to the
  registered kawasaki repo scopes the list down to just that vehicle; an
  override to an unregistered repo is still correctly refused.
- Vehicle group headers in Review Photo Requests are now a full-bleed,
  light-grey separator bar (bigger, high-contrast) between vehicles
  instead of a small steel-colored label, per direct feedback.
- `web/review-panel.js` / `maintainer-portal.js`: Review Photo Requests
  now groups requests by vehicle instead of assuming one repo -- each
  `MOCK_PRS` entry carries a `repo_url`, `MOCK_MAINTAINER.reposmaintained`
  has two mock repos, and `initReviewTab()`/`renderPRList()` check every
  maintained repo against the registry individually (same guard as
  before, applied per repo) and render one heading per vehicle. Dropped
  the "Open photo requests for X" wording per direct feedback -- the
  vehicle name alone is enough once it's already under a "Photo requests"
  card, no need to restate what the list obviously is.
- `web/maintainer.html` / `review-panel.js`: replaced user-visible "PR"
  terminology with plain language -- "Review Photo PRs" -> "Review Photo
  Requests", "Open PRs for..." -> "Open photo requests for...", row/log
  text "#42 -- ..." -> "Request #42 -- ...". The user base isn't assumed
  to know GitHub jargon. Internal identifiers (`currentPR`, `MOCK_PRS`,
  `.pr-row`, `openPR()`) left as-is -- not user-visible, renaming them is
  a bigger refactor for no user-facing benefit.
- `web/indexer-review.js` / `org-approval.js` / `maintainer.html`: closed
  a real gap -- the browser onboarding flow never asked for a source URL
  (where the maintainer got the manual), even though
  `propose_new_vehicle.py` already requires one on the Python side. Added
  a required "Where can we find this manual?" field to Stage 3 review,
  hard-blocking submit if empty; stored as
  `manifest.source_markers.source_identifier`, the exact path the
  existing Python tooling already reads, so no schema divergence. The
  submitter's source URL now renders as a real link in the Approve New
  Vehicles tab, placed directly above the PDF-picker browse button.
  Verified live: submit blocked with no URL, unblocked once filled, link
  renders correctly for a pending vehicle.
- `web/org-approval.js` (new): built the "Approve New Vehicles" tab --
  fresh functions and fresh state (`orgManifest`/`orgPdfDoc`/
  `orgPageCache`), reusing indexer-review.js's paginated-gallery/
  live-crop-thumbnail *pattern* without sharing its globals, per
  ROADMAP.md's plan. Verified live that the two tabs' state stays
  independent. Visible and readable (pending-vehicle list + gallery) to
  every signed-in maintainer, not just org maintainers -- decided before
  building, see ROADMAP.md's "read-only, not hidden" reasoning. Approve/
  reject are gated on `MOCK_MAINTAINER.isOrgMaintainer`; a non-org
  maintainer sees the identical view with a plain note instead of the
  actions.
- `web/maintainer.html` (new) / `maintainer-portal.js` (new): built the
  Maintainer Portal -- one shared mock sign-in gating tabs for Index a
  New Vehicle and Review Photo PRs, instead of each tool having its own
  sign-in. `web/indexer.html` and `web/review.html` retired (deleted,
  content moved into the portal's tab panels); `indexer-core.js`/
  `indexer-ui.js`/`indexer-review.js`/`review-panel.js` reused as-is
  apart from removing each one's own now-redundant sign-in gate.
  `review-panel.js`'s repo-scope check is preserved, decoupled into its
  own `initReviewTab()` called once by the portal right after sign-in.
  Tabs are gated by capability (`reposmaintained`, `isOrgMaintainer`),
  not identity -- a maintainer can hold both roles at once, so every
  tab carries a REPO or ORG `.scope-badge` rather than relying on which
  tab you're on to say which authority an action uses. "Approve New
  Vehicles" (org-level) and "Issue Requests" ship as pinned/disabled
  placeholders -- the former's real build is scoped separately (reusing
  indexer-review.js's rendering *pattern*, not its literal shared-global
  functions, to avoid two simultaneous review sessions colliding on
  state) per ROADMAP.md.
- `web/index.html` / `patcher.js` / `registry.js`: added a "become the
  first maintainer" CTA shown specifically when a PDF's fingerprint has
  no registry entry (distinguished via a new `err.reason ===
  "not_registered"` on the thrown error, not conflated with other
  lookup failures like a network error). Links to
  `maintainer.html?hash=<fingerprint>`, which shows a greeting
  referencing the already-computed fingerprint -- cosmetic only, the
  portal always re-hashes whatever file actually gets re-selected there
  rather than trusting the carried-over value.
- `web/indexer.html`: rewrote the copy under the PDF picker (full
  document, up to ~20 min, keeps running if you switch tabs, resumable
  if you close the tab by accident -- grounded in the actual verified
  behavior: Web Workers are exempt from background-tab throttling, and
  resumability was already built). "Confirm the vehicle" now names the
  naming convention inline. "Quick look before you submit" renamed to
  "Review photo identification for initial submission," now naming
  Maintainer Standards and three concrete data-quality reminders instead
  of vague "doesn't need to be perfect" copy alone.
- `web/indexer-review.js`: the review gallery is now paginated (10
  candidates per chunk, real document-page order via a fresh sort every
  render, not array-insertion order) with prev/next controls, instead of
  rendering the entire manifest as one long scroll -- verified against
  an 84-entry manifest that pagination, delete-triggered chunk refill,
  and chunk-count clamping after a delete on the last page all work.

- ROADMAP.md: confirmed a maintainer can never approve their own
  contribution (PR author != approver, always) -- with the real
  consequence that a solo maintainer is stuck contributing their own
  photos until a second maintainer exists. Not yet enforced (review
  panel is still mock data), needs a real check once wired to GitHub.
- ROADMAP.md: pinned a "Read and agree to Maintainer Expectations" gate
  (explicitly non-binding) before indexing starts, and Initial
  Submission Standards with a concrete completeness signal (how many
  auto-detected candidates were actually touched before submitting) --
  shown to the submitter as a self-check and to org reviewers as what
  their light review actually looks at, instead of a vague "try your
  best."
- `web/indexer-review.js`: built Stage 3 of onboarding -- the browser-only
  review step between indexing and submission, previously missing (the
  local `generate_review.py`/`review_server.py` tool needs a server and
  was never meant to be part of the real, zero-install flow). Operates
  entirely on the in-memory manifest from `indexPdf()`: page-grouped
  gallery with live-cropped thumbnails, a delete-only action per
  candidate, and a page modal reusing the drag/resize/add-figure pattern
  already proven in `generate_review.py`/`review-panel.js`. Delete-only
  per ROADMAP.md's resolved reasoning -- omit was removed entirely, not
  kept alongside delete, because a soft-omitted candidate that's still
  present but never fillable was found to actually skew a vehicle's
  completion stat (nothing ever stripped it from the real manifest
  before submission -- a real bug, not just a UX call).
  Completeness tracking (touched/total/pct, with a soft nudge below 10%
  coverage on 20+ candidates) built in from the start.
- **Fixed:** the page-modal's drag/resize/add-figure listeners were
  registered inside a `DOMContentLoaded` handler in a script tag that
  loads at the end of `<body>` -- that event has already fired by then,
  so the handler never ran (found via testing: a real mousedown left
  `modalDrag` null, not a simulation artifact). Fixed by dropping the
  wrapper and running the setup as a plain top-level block.
- `web/indexer.html` / `indexer-core.js` / `indexer-ui.js`: renamed
  "Browser Indexer" to "PDF Indexer" (the tool indexes PDFs; "browser" is
  where it runs, not what it does) and relabeled the file field "PDF
  Manual" (avoiding the "Manual PDF" adjective misread). Removed the
  vehicle-slug text input, page-range inputs, and editable registry-URL
  field entirely -- vehicle slug is now derived from the manual's own
  content (`suggestVehicleSlug()`) and confirmed by the maintainer after
  indexing rather than typed in beforehand; indexing is always the full
  document (a partial index would produce an inconsistent fingerprint,
  which registry lookups depend on being complete); the registry URL is
  hardcoded (`CANONICAL_REGISTRY_URL`) for the same spoofing-vector
  reason `web/index.html`'s registry URL already is. Added a mock
  sign-in gate matching `review-panel.js`'s pattern, since this page
  only makes sense for an already-authenticated maintainer. Removed all
  `indexer.py` references from code comments -- the browser version is
  the real implementation now, not a port being compared against a
  Python original. See ROADMAP.md "PDF Indexer flow corrections" for the
  full reasoning per change.

- **Fixed:** a real, third instance of the stale-crop bug class -- an
  edited box's thumbnail could survive in `bbox_edits.json` for over an
  hour without the corresponding crop file ever being regenerated,
  caught via file timestamps (the edit was genuinely newer than the
  crop on disk). Root-fixed rather than patched again: card thumbnails
  now come from a live `review_server.py` endpoint
  (`/api/crop/<id>.png`), computed on-demand from the current
  `bbox_edits.json`, never a pre-baked file -- the same principle the
  future PR review panel already follows by never persisting a derived
  crop at all. `generate_review.py`'s `build()` no longer needs a PDF
  path or any crop-generation logic. Verified live: a fresh edit posted
  via the API shows up in the crop endpoint immediately, no
  regeneration step, no lag.
- LEGAL.md: re-confirmed the short-phrases/merger-doctrine analysis on
  `section_heading` values, prompted by a direct question about a real
  example ("Replace every 18000 miles"). Still holds, with one nuance
  named but not resolved -- systematic extraction of every heading across
  a whole manual edges toward a compilation-copyright question, distinct
  from any single phrase's protectability -- flagged for the full
  deliberate LEGAL.md review rather than assumed settled here.

- `web/indexer-core.js`: built the IndexedDB resumability spiked earlier
  -- job identity is the PDF's own SHA-256 content hash + vehicle slug +
  page range, checkpoints written per-page during the existing parallel
  loop, a registry conflict check (reusing `registry.js` as-is) runs
  before offering to resume so a maintainer doesn't waste time resuming
  toward a vehicle someone else already got approved in the interim.
- **Fixed:** `pdfFingerprint()` was being called on the file's
  ArrayBuffer *after* handing it to `pdfjsLib.getDocument()`, which can
  transfer/detach the buffer -- the resulting hash was silently
  SHA-256("") every time, not the actual file. Caught because the hash
  matched the well-known empty-string digest exactly. Fixed by hashing
  before handoff.
- Hit a real, only-partially-explained hang during testing: a resumed
  run's worker-pool creation stalled indefinitely in one specific
  browser tab after several rapid reload/reinject cycles. Added a hard
  timeout + per-worker error isolation (`Promise.allSettled`, not
  `Promise.all`) so a stuck attempt fails loudly with a real error
  instead of freezing silently -- kept as a permanent safeguard
  regardless of root cause. Re-tested the exact same scenario in a
  fresh tab and it completed cleanly (104/121 resumed to 121/121, full
  valid manifest, 333 entries) -- strong evidence the hang was specific
  to that one tab's automation/reload history, not the resume logic
  itself, though not root-caused with full certainty.
- ROADMAP.md: backlogged a real governance question -- who approves a
  new *edition* of an already-registered vehicle (e.g. adding a Haynes
  manual for a car whose OEM manual is already approved and maintained).
  Concluded the vehicle's own existing maintainers should decide, not
  the org quorum, consistent with the org gating new-vehicle-onboarding
  only. Flagged the one real technical wrinkle (registry.json is a
  single shared file) with two resolution options, leaning toward a
  CI-enforced scoped-write-access check over a human rubber-stamp step.

- ROADMAP.md: confirmed the resumability design stays fully in-browser
  with no manual downloading or cleanup, checked against the actual
  design rather than assumed -- writes/reads/cleanup are automatic, the
  only interaction is a single resume-vs-fresh-start choice. Flagged
  that `web/indexer-ui.js`'s manual download button is a test-harness
  convenience, not the intended real flow, which pushes the finished
  manifest straight to GitHub via the API.

- `web/indexer-core.js`: rewrote `indexPdf()` around a parallel worker
  pool (sized to `navigator.hardwareConcurrency`) for the render/OCR/
  figure-detect phase, with a separate sequential assembly pass to
  preserve the section-heading carry-over logic and stable procedure_id
  ordering that can't be parallelized. Verified correctness (identical
  output to the sequential version on the same page range) and speed
  (~2.15 pages/sec on a 61-page range, a ~6.5x speedup) against the real
  test manual. Full 415-page run showed the same "later pages are
  heavier" pattern seen in the sequential test -- rate held under 5
  minutes through 60% completion before slowing; run stopped there by
  request rather than letting it finish unmonitored.
- `web/indexer-ui.js`: progress display now shows a live ETA and
  pages/sec rate from the first samples, not just a raw count -- the
  same early-signal principle used to catch the sequential pipeline's
  ~21-minute problem from two samples.
- ROADMAP.md: researched (not assumed) whether a multi-minute, tab-must-
  stay-open one-time operation is acceptable at this stage. Real
  technical finding: Web Workers are exempt from background-tab
  throttling, so the actual constraint is "don't close the tab," not
  "keep it focused." Conclusion: acceptable, conditioned on a real
  data-backed time estimate in the UI (not a guess) and making the
  operation resumable across a closed/crashed tab. Weighed git-
  incremental-commit checkpointing against IndexedDB and picked
  IndexedDB for intermediate progress (git stays the finished-manifest
  mechanism, not a checkpoint log) -- then spiked it for real: DB open
  ~17ms, 50-page-checkpoint write 1.2ms total, read-back 0.6ms,
  functionally free against OCR's per-page cost. A light lift (~40-60
  lines), scoped and ready whenever prioritized.

- Ran a real full 415-page indexing pass, aborted per instruction once
  it was clearly going to exceed 5 minutes. Two progress samples (28
  pages/31.6s, then 45 pages/83.8s) show the interval rate (~3.07s/page)
  is much slower than the first reading -- front-matter pages are
  unusually sparse. Extrapolated ~21 minutes for the full manual,
  consistent with the earlier isolated spike's own sequential estimate
  (~26 min). Confirms worker-parallelism (already proven separately,
  never wired into the real pipeline) is required, not optional polish.
- ROADMAP.md: logged performance telemetry as a feature request, then
  corrected the scoping after a direct question -- indexing only ever
  runs for Persona A (already signed in, about to push a new vehicle
  repo), so neither objection initially raised actually applies to it:
  no anonymous-user problem, no "nothing leaves your device" promise to
  contradict (that promise targets the patcher/Persona B specifically).
  Split into two genuinely different cases: indexing metrics (low-
  friction, no new infra, committable through the maintainer's own
  session) vs. patching metrics (the real hard case -- anonymous by
  design, needs explicit opt-in and a lightweight anonymous endpoint).

- `web/indexer.html` / `indexer-core.js` / `indexer-ui.js`: wired the
  verified figure-detection and OCR-heading ports into a real,
  schema-correct `manifest.json` output -- procedure_id generation
  (slugify + dedup counters), section-heading-to-figure mapping
  (`currentSectionForY`), and `page_geometry` recording, matching
  `indexer.py`'s output shape exactly. Verified end-to-end against the
  real 415-page test manual (pages 40-41): valid entries produced,
  structurally correct, with the same class of OCR noise in heading text
  already established as acceptable and human-correctable. Text-layer
  PDF pages (indexer.py's other code path) are detected and logged, not
  silently mishandled -- not ported yet, the real test manual doesn't
  need that path.

- **Fixed:** `web/review-panel.js` never validated `repo_url` before
  acting on it -- since the tool authenticates with the maintainer's own
  GitHub token (which has access to whatever repos their real account
  does), a crafted link could point it at an unrelated repo and risk a
  mistaken merge/close there. Added a registry check (same registry the
  patcher reads) that refuses to proceed unless the repo is a
  registered, approved vehicle repo. Verified both directions for real:
  an unrelated repo is refused, the actual vehicle repo passes.

- `web/review-panel.js`: finished the maintainer review panel's core
  logic -- mock PR list (real procedure_id/bbox from the actual Suzuki
  manifest), the local-context prompt-for-your-own-PDF step, live
  box-adjustment (drag/resize, reused from `generate_review.py`'s
  pattern) with a real-time fit readout comparing box vs. submitted-
  photo aspect ratio, and accept/reject actions that log the exact
  GitHub API calls the real version would make. Verified end-to-end
  against the real manual and real manifest data: bbox-to-canvas scaling
  checked out exactly, and an adjusted box round-trips correctly back to
  composite-pixel space in the logged accept action.
- ROADMAP.md: corrected the `checker.py` inventory entry -- it was
  overstated as a permanent CI-only trust boundary. The strongest reason
  (stripping EXIF GPS before a photo becomes public) actually argues for
  client-side validation *before* the commit, not a CI check that runs
  after the push already happened. Reframed as "load-bearing copy
  belongs in the upload function," with a CI-side copy now a smaller,
  deferred defense-in-depth question, not a settled requirement.

- ROADMAP.md: verified the OCR heading port against a real page using
  the same corrected bar as figure detection -- real headings ("2-10
  PERIODIC MAINTENANCE," "TAPPET CLEARANCE ADJUSTMENT," "NOTE:") came
  through correctly; one miss ("A CAUTION") and some diagram-noise, but
  the same class of imperfection Python's own version already has, not
  a JS regression. Both core indexer-port pieces (figure detection, OCR)
  are now verified fit for purpose.

- ROADMAP.md: corrected the browser indexer port's verification bar --
  chasing pixel-identical output against `patch_pdf.py`'s Python
  reference was solving a problem the architecture doesn't have (every
  submission gets human-reviewed before registration, and the crop tools
  built this session make a rough detection fully correctable). Verified
  visually instead: the ported figure detector lands tightly and
  accurately on a real photo on a real page; the one false positive
  found is the same class of error the Python detector already makes,
  not a JS regression.
- ROADMAP.md: full Python-file inventory against the actual repo --
  what's superseded (`fetch_repo.py`), what's load-bearing as a
  reference (`patch_pdf.py`), what's still planned (`mosaic.py`/
  `stylize.py`, `init_repo.py`, the registry write-side scripts,
  `generate_review.py`/`review_server.py`), what disappears by design
  rather than getting ported (the `apply_*.py` fold-in scripts), and
  what should permanently stay non-browser on purpose (`checker.py`,
  a CI trust boundary). Answered the "exclude Python from the real
  repos" question: mostly yes once superseded, archived not deleted,
  with `checker.py` as the one permanent exception -- and nothing is
  actually ready to archive yet except `fetch_repo.py`.

- **Fixed:** delete was only ever available for manually-added figures --
  an auto-detected false positive could only be soft-omitted. Extended
  `/api/remove-figure` to also hard-delete real indexed entries directly
  from `manifest.json`, giving reviewers the actual choice per-candidate
  (omit = tracked with a reason, delete = gone, no forced bookkeeping).
- **Fixed:** the delete confirm dialog always claimed permanent,
  unrecoverable loss, which is false for anything already committed to
  git. Added a real git-history check (`committed_procedure_ids()`) so
  the warning tells the truth: recoverable via `git show`/`git checkout`
  for a committed entry, genuinely gone only for one that never was.
  Verified end-to-end against this repo's own history -- deleted a real
  committed entry via the live API, restored it with `git checkout
  HEAD`, confirmed it came back.

- ROADMAP.md: pinned live box-adjustment to the maintainer review-panel
  design -- verified via a real test that PyMuPDF's `insert_image`
  already preserves aspect ratio (letterboxes, never distorts), so the
  real problem is fit/polish, not correctness. Decided against tying
  this to contributor submission requirements (no single aspect ratio
  to enforce across procedures, real friction for no benefit) in favor
  of reusing the crop-editor mechanism already built this session,
  pointed at fitting a known submitted photo instead of the detector's
  guess -- including showing the actual photo live inside the box while
  resizing.

- **Fixed:** the "4th box never shows up" report turned out to be a real
  omitted candidate, not a bug -- but nothing in the page-modal overlay
  distinguished an excluded box from a normal one, so it read as broken.
  `entries_for_page()` now flags `excluded` (checking `exclusions.json`
  directly, since `apply_exclusions.py` no longer bakes it into
  `manifest.json`'s status) and the overlay renders a dashed/hatched box
  with an "OMITTED --" label. Verified live against the real server.
- **Fixed:** `review_server.py` never sent `Cache-Control`, so a browser
  could serve a stale `review.html` after a regeneration -- this
  directory changes constantly during a live session, so now nothing it
  serves is cacheable (`Cache-Control: no-store` on every response).

- **Fixed:** `generate_review.py`'s `build()` never read `additions.json`
  or `bbox_edits.json` -- a manually-added figure never appeared in a
  fresh regeneration, and an edited crop stayed stale, in every session,
  not a one-off. Found by investigating a real user report ("page 24's
  third box never shows up"). `build()` now folds both in and generates
  real crop thumbnails for them, reusing `indexer.py`'s own crop step.
- `apply_exclusions.py`: excluded entries are now actually removed from
  the shipped `manifest.json` rather than permanently flagged in place --
  the audit trail lives in `exclusions.json` (already git-tracked)
  instead of permanently bloating the file every downstream tool parses.
- `generate_review.py`/`review_server.py`: added a delete control for
  manually-added figures (distinct from omit, which is for auto-detected
  candidates) -- `/api/remove-figure`, server-guarded to only ever touch
  `additions.json`, verified to correctly reject removing a real indexed
  entry.

- `generate_review.py`: added Prev/Next page buttons and left/right
  arrow-key navigation to the page modal, so reviewing a run of pages no
  longer requires closing the modal and re-jumping each time.
- ROADMAP.md: pinned the future maintainer review panel's concrete
  workflow (sign in -> see your PRs -> prompted for your own manual copy
  -> before/after rendered from that file) and confirmed it reuses
  `generate_review.py`/`review_server.py`'s actual rendering layer rather
  than building a second viewer. The prompt-for-your-own-PDF step is a
  direct application of LEGAL.md's local-context rule to maintainers,
  verified to hold for that role too, not just contributors.
- Raised, not yet decided: whether `apply_exclusions.py` should keep
  permanently retaining rejected candidates in the shipped
  `manifest.json` (current documented behavior, an audit trail baked
  into the operational file) or actually remove them, relying on the
  already-separate `exclusions.json` + git history as the audit trail
  instead -- lean file either way, same record, pending confirmation.

- `ledgers/TheBlayde_AILedger.md`: corrected a real misattribution --
  the "it's good enough we tried" quote was about versioning/CHANGELOG,
  not acceptance of the security review's completeness. Left visible per
  the ledger's own standard rather than silently fixed.
- ROADMAP.md: recorded the security review's actual current status --
  the first pass's 4 findings are closed, but its scope was narrow
  (browser patcher + registry fetch only); the OAuth proxy, browser
  indexer, and in-PDF links are all still design, not code, and a real
  review is owed once the proxy specifically gets built, given it's the
  first server-side component holding a secret.
- ROADMAP.md: proposed (not built) a per-photo "show original" toggle --
  weighed regenerate-with-exclusions (zero new risk, reuses existing
  re-patch machinery) against real PDF layers/OCGs (more capable, two
  real unverified unknowns: pdf-lib support and inconsistent viewer
  support). Recommended the former for v1, logged the latter as a
  stretch. Neither touches the existing patch mechanism.
- ROADMAP.md: added vehicle-type scope boundary + org/per-repo Maintainer
  Guidance as real, sequenced work -- explicitly ordered before further
  website changes, per the project owner's direct instruction, not a
  scheduling guess.
- ROADMAP.md: named the two-lens IA principle -- website is "just get
  this done" (GitHub invisible), the GitHub repo itself is "show me
  what's going on" (real flowcharts, GitHub/Git fundamentals explained).
  A sorting test for future doc decisions, not just a one-off idea.

- `ledgers/TheBlayde_AILedger.md`: brought current through this entire
  design session -- six new sections covering version discipline, the
  manual security review, the trust/content-verification questions, the
  quality-bar constraint, the full contribution/review architecture
  (wireframe-first process, the four-tier persona ladder, the
  local-context rule, the in-PDF link pivot), the OAuth reversal, and the
  browser-indexer-port override, in the same honest style as the rest of
  the document -- corrections named in both directions, including two
  cases this session of the user overturning Claude's own prior
  recommendation. Cross-linked with this file going forward: CHANGELOG
  is the what-changed record, the ledger is the who-steered-what record,
  update both together.

- ROADMAP.md: made the pure-browser indexer explicit as a decision, not
  a default -- "nothing to download, ever" is the non-negotiable part;
  worker-count tuning, timing, and resumability all stay open for
  optimization. If it's ever too painful in practice, the fix is making
  the browser path better, not reopening a local-install fallback.

- Ran a real feasibility spike for the browser indexer port: extracted 8
  real pages from the project's 415-page test manual, timed Tesseract.js
  5 OCR sequentially and in parallel across 8 Web Workers. Sequential:
  ~26 min extrapolated. Parallel: ~4.6 min extrapolated, under the
  5-minute target -- with honest caveats logged (single test machine,
  hardcoded worker count, OCR-only, small sample) rather than treating
  the number as a guarantee.
- ROADMAP.md: designed multi-part manual support (one edition split
  across several physical PDF files, e.g. one file per chapter) --
  `source_pdf_sha256` becomes a list of `{part_id, sha256}` pairs
  sharing one manifest, each manifest entry tagged with its part.
  Composes with the existing fingerprint-matching design, no redesign
  needed elsewhere.
- ROADMAP.md: logged multi-language support -- a `language` field on
  registry entries (trivial), plus a bounded future i18n pass for the
  small set of user-touched UI screens, with a flag that licensing/
  consent copy needs native-speaker review, not just translation.

- ROADMAP.md: added "Browser-based indexer port" as its own milestone,
  not folded into the onboarding form. Rejected asking Persona A to
  install Python locally -- they don't retain ownership of the result,
  so local-software friction is a worse trade than it looks. Weighed
  feasibility honestly: no missing primitive (PDF.js + Tesseract.js
  cover it), but every heuristic needs re-proving against the Python
  reference (same discipline already used for the patcher port), and a
  several-hundred-page manual's OCR is plausibly 15-30+ minutes of
  client-side processing, a real UX problem, not a detail.
- ROADMAP.md: settled clickable links as required, not optional, once
  professional-camera contributors are a real persona (they're on
  desktop, not phone -- QR alone doesn't reach them). Three layers:
  printed auto-linking URL text (needs no new capability), QR (the
  cross-device case), true link annotation (real risk, unverified,
  enhancement not blocker).

- ROADMAP.md: resolved the token-expiry question -- enable GitHub's
  expiring tokens. Verified the lifetimes aren't configurable (fixed 8h
  access / 6mo refresh, silent refresh in between), which means an
  active contributor never sees a repeat sign-in prompt, only resurfacing
  after 6 months of total inactivity -- better than the weekly prompt
  originally asked about, while still capping a leaked token's window.
  Correction: the proxy needs a second small endpoint (refresh exchange),
  not just the one-time code exchange.
- Wireframe copy pass: reworded the no-match section to read as plain
  instructions rather than a jokey pitch, and expanded the footer note
  into a real CTA making the case for contributing (free forever, builds
  for every future owner, the whole ask is one link or QR code away).

- ROADMAP.md: resolved the open PAT-vs-OAuth question for Persona A --
  dropped PAT entirely, OAuth+proxy covers both personas. Verified
  `public_repo` also covers `POST /user/repos` (new vehicle repo
  creation), so the one already-specced OAuth flow needs no changes to
  handle onboarding too, no second auth path to build or maintain.
- Refreshed the patcher landing page wireframe (in-conversation, not yet
  built) to match: no-match onboarding now says "sign in with GitHub,"
  never "generate a token"; the cut teaser strip is replaced by a footer
  note pointing to the in-PDF contribute links/QR codes as the real
  contribute surface.

- ROADMAP.md: reversed the earlier PAT-first lean for casual contributors
  -- OAuth + a small serverless proxy is the call now that "scan a QR,
  take a photo, done" is a core feature, not a later nice-to-have.
  Verified against GitHub's docs: a single `public_repo` OAuth scope
  covers fork + push + PR, simpler than the PAT's three fine-grained
  permissions, not just smoother UX. Specced the full handshake (one
  proxy function, touched once per sign-in, holds the client secret and
  nothing else).
- ROADMAP.md: settled a four-tier contributor ladder (anonymous → hidden
  contributor → credited contributor → maintainer) replacing the earlier
  binary local-vs-PR framing, with a naming correction -- a fork of a
  public repo is itself public, so the "hidden" tier is "unlisted," not
  cryptographically private.
- Cut two wireframed pieces after review: the post-patch missing-
  procedures screen (superseded by contribute links/QR codes embedded
  directly in the generated PDF, near each missing procedure) and the
  landing-page contribute teaser strip (redundant with the same).

- ROADMAP.md: settled two architecture rules for the not-yet-built
  contribution/review web apps -- a contributor never needs a GitHub
  account to browse what's missing, only at the moment of upload; a
  maintainer's review panel is one generic app parameterized by repo,
  not duplicated per vehicle repo. No code yet, design only.
- Wireframed the patcher landing page redesign (in-conversation, not yet
  built): hero + "what goes in / how, lightly / what comes out" strip
  above the existing file picker, a reframed no-registry-match state
  ("we don't have this one yet, want to be first?" walking through
  starting a new vehicle repo in plain language), and an always-visible
  contribute teaser strip with the destination intentionally left
  undefined pending the review-panel design above.
- LEGAL.md: added "the local-context rule" -- page-level manual content
  can only ever be shown from a viewer's own already-loaded PDF, in their
  own session, never from anything stored/shared. Resolves a real
  concern raised in design review about a registry-browsing feature
  drifting toward showing manual content it structurally shouldn't have.
- ROADMAP.md: settled two contributor personas (direct maintainer of a
  new vehicle vs. anonymous patcher prompted for GitHub auth only at
  upload time) and scoped registry browsing down to aggregate stats only
  ("12% of 972 procedures have a photo" per vehicle, no per-procedure
  detail) -- confirmed in review that a bare `section_heading` isn't
  reliable enough context for a stranger, so granular missing-procedure
  browsing only happens post-patch, against the contributor's own file.

- `propose_new_vehicle.py`: require a non-empty `source_identifier`
  rather than silently defaulting to `"unknown"`; surface it in both the
  `--live` PR body and the local-mode printed instructions, alongside an
  explicit prompt for maintainers to skim `manifest.json`'s
  `section_heading` strings before approving a new vehicle.
- ROADMAP.md: logged two new open design problems -- source-content
  verification (can a maintainer tell a submitted PDF is what it claims
  to be, without ever seeing its actual content) and quality standards
  for both contributors and repo-scoped maintainers.
- `docs/faq.html`: new entry ("Is AI doing something when it patches my
  manual?") clarifying that build-time AI use (Claude, writing the code)
  is unrelated to runtime, which is plain deterministic image-processing
  and local OCR, no model or server call while patching.
- `web/index.html`: matching one-line note under the patcher's "nothing
  uploaded" sub-line, linking to the FAQ for more.
- `scaffold/CONTRIBUTING.md`: added a short, Reddit-sidebar-length
  "quality bar" bullet list for contributors (show the thing, in focus,
  your own photo, review it like you'd want yours reviewed) and a mirror
  of the same bar restated for reviewers in "What review looks like" --
  deliberately not a policy document; the standing design goal is that a
  first-time reader can size up the bar in seconds.

## [v0.3.0] - 2026-08-21

Security-hardening pass over the browser patcher and registry fetch
paths, done manually after the `security-review` skill tool failed to
load in this sandboxed environment. 4 findings, all fixed:

- **Fixed:** unbounded photo download size in both `fetch_repo.py` and
  `web/registry.js` -- added a 20MB cap (checked against both the
  API-reported size and the actual downloaded byte count), matching
  `checker.py`'s existing contribution limit.
- **Fixed:** one malformed/corrupted photo aborting an entire patch batch
  in `web/patcher.js`'s `patchViaRegistry()` -- wrapped per-photo
  embed/draw in try/catch so one bad file is skipped and logged, not
  fatal to the run.
- **Fixed:** `@cantoo/pdf-lib` loaded from a CDN with no version pin and
  no Subresource Integrity hash -- pinned to `2.9.1`, added a real SHA-384
  `integrity` attribute, verified the pinned+SRI'd script still loads.
- **Confirmed safe (no change needed):** `validate-photo.yml` triggers on
  plain `pull_request`, not `pull_request_target` -- a forked contributor's
  CI run never gets repo secrets or a write-scoped token by default.

Also added this release:
- `web/index.html`: contributor priority list input (comma-separated
  GitHub handles), an old-school `[####......]` patching-progress readout,
  and a hardcoded default registry URL (closes a registry-spoofing vector
  where a user could otherwise be tricked into pointing at a fake one),
  both tucked behind an "Advanced" `<details>` disclosure.
- `web/patcher.js` / `web/registry.js`: `parsePriorityList()` /
  `pickPhoto()` for priority-then-random photo selection when multiple
  contributors have covered the same procedure; `setProgress()` wired
  through each phase of the patch flow.

## [v0.2.0] - browser patcher core

- Ported `patch_pdf.py`'s coordinate math, embedded-state read/write, and
  cover-page rendering to `web/patcher.js` / `web/registry.js` --
  verified byte-for-byte-equivalent fingerprint and coordinate output
  against the Python reference implementation.
- Switched from `pdf-lib` to `@cantoo/pdf-lib` (a maintained fork) after
  discovering the original library can write embedded-file attachments
  but not read them back -- verified via direct round-trip testing before
  committing to the switch.
- Fixed: `@cantoo/pdf-lib`'s `attach()` accumulates duplicate-named
  attachments instead of replacing them -- fixed by always reading the
  *last* matching attachment, not the first.
- Fixed: a page-count-based cover-page-detection heuristic broke on small
  synthetic test PDFs -- replaced with a stronger invariant ("valid
  embedded state found" implies "page 0 is the cover," since the tool
  always writes both together), eliminating the heuristic entirely.
- Wired the browser patcher to the registry: `resolveViaRegistry()`
  fingerprints a loaded PDF client-side, looks it up against
  `registry.json`, and fetches the matching vehicle repo's manifest +
  approved photos via unauthenticated public GitHub reads -- zero upload,
  zero backend, zero account required to use.

## [v0.1.0] - registry and governance foundation

- `registry.py` / `check_registry.py` / `propose_new_vehicle.py` /
  `approve_registry_entry.py`: fingerprint-to-repo registry with a
  2-of-N org-maintainer approval quorum for new *vehicle* onboarding
  (one-time, per vehicle) -- explicitly separate from each vehicle repo's
  own dedicated, ongoing photo-review maintainer pool, corrected after an
  earlier design pass conflated the two and would have made the small
  org-level group a bottleneck on every photo across every vehicle.
  `--live` paths documented as acting under whichever account `gh` is
  currently authenticated as, with an explicit warning never to run them
  under an unintended identity.
- `docs/org-structure.svg` + `docs/faq.html`: public-facing governance
  and trust diagram (real example vehicles, per-repo maintainer pools
  distinguished by shape, approval-quorum pairs shown per vehicle) and a
  21-entry FAQ written for a non-technical reader, including an explicit
  "was AI used in the making of this" entry.
- `ledgers/TheBlayde_AILedger.md`: AI-collaboration ledger tracking how
  much of the design was steered by the project owner vs. proposed by the
  assistant, including a self-correction where the ledger initially
  misattributed the photomosaic concept's origin.
- Licensing settled: CC-BY 4.0 (not CC-BY-SA) for contributed photos, to
  preserve future monetization optionality; AGPL (not MIT) for code, to
  prevent a well-funded fork from closing the source while still leaving
  hobbyist/individual use unrestricted.

## [v0.0.1] - initial commit

- `indexer.py`: PDF -> `manifest.json` + local reference crops. Density-
  based figure detection (dark-pixel-fraction column analysis), OCR'd
  section headings, `source_markers` for source-identity tracking.
  Fixed during development: raster strips double-counted as separate
  figures (fixed via page stitching before detection), under-cropped
  bounding boxes leaving a visible sliver around the real figure (fixed
  via 2% padding).
- `checker.py`: automated contribution validation (resolution, blur
  floor, EXIF/GPS check, filename-matches-procedure_id).
- `patch_pdf.py`: local PDF patcher, idempotent re-patching via embedded
  PDF-attachment state, no need to keep the pristine original around
  separately.
- `generate_review.py` / `review_server.py`: local review gallery for
  omitting false-positive figures, adding missed ones, and editing crop
  boundaries before publishing an index.
- `mosaic.py` / `stylize.py`: original-concept photomosaic cover art
  (5-zone motorcycle silhouette, tile-fill-by-contribution-percentage).
- `LEGAL.md`: the core architecture decision this entire project rests
  on -- index only structure (page numbers, figure locations,
  fingerprints) publicly, never redistribute the source manual's own
  pixels or text. Contains the standing pin: nothing gets pushed,
  published, or posted anywhere off this computer until a full
  deliberate review of this file happens again.

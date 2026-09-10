# Roadmap / open design problems

## Repo-size math behind the photo downscale cap (reference, not open)

**Closed 2026-08-28**, logged here as the reasoning behind a real number
in the code, not an open question. Raised directly: at an assumed 5MB
per contributed photo (realistic for a modern phone's full-resolution
JPEG, since nothing was downscaling them), `suzuki-sv650-1999`'s 918
photo slots fully filled would run about 4.5GB -- right against
GitHub's own "under 5GB strongly recommended" per-repo guidance, from
one motorcycle manual, before counting replaced-photo history that git
never reclaims or any `__altN` alternate-angle uptake.

Checked against the real manifest before picking a fix: bbox sizes
(converted from pixel_bbox through the same scale math patcher.js
already uses) have a median of ~196x121pt, needing only ~820x500px for
full 300dpi print quality; the largest (a rare full-page figure,
612x792pt) needs ~2550x3300px at 300dpi. `contribute.js`'s photo-picker
now caps the long edge at 2000px before its existing metadata-strip
step -- comfortable headroom over the median case, and still ~235dpi at
the largest, easily sharp for a reference photo viewed on screen or
printed. Cuts typical raw phone-camera resolution (12-48MP) several-fold
with no visible quality loss for this use case.

Things we've deliberately scoped out of the current build, with our best
thinking on each so a future contributor isn't starting from zero. If you
have a better idea than what's written here, that's the point -- open an
issue.

## GitHub-invisible UX, before v1.0.0

**The goal, stated plainly:** someone should be able to find a guide,
patch their manual, and even contribute a photo without ever needing to
know what GitHub is, while still having the real thing underneath for
anyone who *does* want to see it. Right now the browser patcher is a
functional proof of concept, not something you'd hand a stranger --
closing that gap is real, planned work before v1.0.0, not a nice-to-have.

Concrete pieces:
- **Progressive disclosure of GitHub itself.** A visitor should be able
  to land on a page, recognize their vehicle, and download an enhanced
  manual without the word "repository" ever being load-bearing to their
  experience. Power users who want to see the source, browse contributor
  history, or open a PR by hand should still be able to, one click
  deeper, not hidden, just not the default surface.
- **A guide-discovery flow** -- browse/search by make, model, year range
  (see "Multiple manuals for the same vehicle" below) rather than
  expecting anyone to know a repo name or a registry URL.
- **An old-school "patching..." progress readout** -- already started
  in the browser patcher (a literal `[####......] 42%` bar with a status
  line), the instinct being that watching visible progress, including
  during steps like resolving the registry or fetching photos, builds
  confidence that something real is happening, the same reason classic
  installer progress bars work even when the underlying task is fast.
  Worth extending this same visual language to registry-side actions
  (proposing a new vehicle, waiting on approval) once those have a UI at
  all, not just the CLI scripts that exist today.

**Two contributor personas, settled in design review -- the actual main
characters this UX has to serve:**
- **Persona A, direct maintainer.** Their manual isn't in the registry.
  Onboarding is quick and covers three things, not just repo setup: the
  5-step process (see the wireframed no-match state below), a pointer to
  where the quality standards live (`CONTRIBUTING.md`'s quality bar), and
  how to bring in co-maintainers as their vehicle's community grows.
  There's a deliberate second exit here too: "not me -- share this with
  someone who'd be great at it" (a copy-link action), so someone who
  finds the gap but doesn't want the responsibility isn't funneled into
  becoming a maintainer by default.
- **Persona B, anonymous contributor.** Patches their own manual with no
  account, ever, up to that point. The results screen lists which
  procedures came back with no photo, shown against pages rendered from
  *their own already-loaded PDF* -- real page-level context, allowed
  specifically because it's their own file in their own session (see
  LEGAL.md's "local-context rule"). GitHub auth (the self-service token
  path above) only gets asked for the first time they click "add a
  photo" on one of those -- never before.

**Registry browsing, for people who haven't patched anything yet:** a
filterable list (type/make/model, plus search) of registered vehicles,
each row showing only an aggregate stat -- "Suzuki SV650 (1999-2002) --
12% of 972 procedures have a photo" -- and nothing more granular than
that. This is a deliberate scope limit, not a missing feature: a bare
`section_heading` string was confirmed in design review to not reliably
tell a stranger what a procedure actually needs (e.g. many manuals reuse
generic headings), so per-procedure browsing only becomes meaningful once
someone has patched their own copy and can see real context (persona B,
above). The registry page's job is discovery ("does my vehicle exist
yet, how far along is it"), not need-identification.

**"Passive" indicator, added to that same row -- raised directly
alongside the maintainer-succession mechanism above, and it's the
"Option B" from that discussion made real, not a separate feature.**
When every maintainer on a vehicle is quiet (the same signal
`my-vehicles.js` already computes), the registry row shows it plainly
-- something like "Suzuki SV650 (1999-2002) -- 12% of 972 procedures
have a photo -- passive." Small, not alarming: a badge or a muted
label, not a warning color. The point is honest visibility, not a
red flag. **Explicitly not "broken" or "abandoned"** -- the repo stays
exactly as usable forever regardless (it's static files in a real git
repo; patching someone's own copy never depended on a maintainer being
present). "Passive" means exactly one thing: some contributors might
want to step up. Nothing more is implied, and nothing stops working.

## Two-lens information architecture: the website vs. the GitHub repo itself

**A real, clean principle worth stating once rather than re-deriving per
screen.** Confirmed in review: this project needs exactly two distinct
reading modes, not one interface trying to serve both.
- **The website is the "just get this done" lens.** Task-focused,
  GitHub deliberately invisible by default -- this is the same spirit as
  the "GitHub-invisible UX" goal above, now named as one half of a
  two-sided principle rather than a standalone goal.
- **The GitHub repo itself is the "show me what's actually going on"
  lens.** For anyone who wants the technical layer: real flowcharts and
  guides living in the repo, not the website, that translate what
  GitHub's own concepts (a fork, a commit, a PR) actually mean in plain
  language, plus genuine Git/GitHub fundamentals for maintainers who
  want to understand what the built tooling is doing on their behalf,
  or who need to do something the tooling doesn't cover yet.

Every future doc decision can be sorted by this test: does it help
someone get a task done fast (website), or does it help someone
understand the mechanism (repo)? A doc trying to do both usually serves
neither well.

## Security review, before v1.0.0

See `SECURITY.md` for the current security model and closed findings, and
`SECURITY-TESTING.md` for the live test coverage -- both are more current
than restating that reasoning here would be.

**Still genuinely open, not captured in either doc:**
- Untrusted fetched images (a malicious/corrupted contributed photo)
  reaching `embedJpg`/`embedPng` or `checker.py`'s `PIL.Image.open` --
  format validation rejects anything structurally invalid, but a
  maliciously crafted *valid* image exploiting a parser bug is a
  residual risk inherent to processing untrusted uploads. Mitigation is
  routine dependency updates (Pillow, `@cantoo/pdf-lib`), a recurring
  check, not a one-time fix.
- `validate-photo.yml` has no explicit minimal `permissions:` block,
  relying only on the `pull_request` trigger's default restriction.
  Worth adding belt-and-suspenders as the workflow grows.

## Source-content verification -- can a maintainer tell a submission is real?

Considered adequately solved: `org-approval.js`'s `orgPdfPicker` lets an
org reviewer render their own copy of the claimed manual next to the
submission for a real visual check, the same local-context pattern used
everywhere else in this project. Leaving it here pending real-world
feedback, not reopening it speculatively.

## Quality standards -- for maintainers and for contributors, before v1.0.0

**Design constraint, stated explicitly by the project owner:** the first
person who lands on this project has to be able to read the quality bar
in a few seconds and think "that's easy, I'm in" -- or they bounce.
Reddit-sidebar length, not a policy document. Ad-nauseam documentation is
a worse failure mode here than being slightly under-specified.

**Contributor-side (photo quality): done, lightweight, as of the
`Unreleased` changes.** `checker.py` still enforces the objective stuff
(resolution/blur/EXIF-GPS/filename-format) automatically. The subjective
bar -- framing, legibility, "is this actually your own photo" -- now has
a short bullet list in `scaffold/CONTRIBUTING.md` ("The quality bar, the
short version"): show the thing, in focus, your own photo, review it like
you'd want yours reviewed. Four bullets, on purpose.

**Maintainer-side (what to look for when reviewing): done, same
lightweight bar, mirrored back at reviewers** in `CONTRIBUTING.md`'s
"What review looks like" section -- reasonable judgment, not a checklist.

**Maintainer inactivity / succession -- resolved, 2026-08-25.**
Raised directly: what happens when a repo's maintainer(s) go quiet and
a contributor wants to step up? Addition of a *new* co-maintainer by
an *active, responsive* existing maintainer stays informal ("the
existing maintainer said yes") -- that part was never actually the
hard case. The hard case is a maintainer who's gone silent, which
needed a real mechanism, not just a policy sentence.

**The mechanism, settled:**
- **A contributor-visible "Request to help maintain" action** on a
  vehicle, distinct from a normal photo submission. It opens a real,
  visible request (same shape as the existing photo-request flow)
  addressed to both the current maintainer(s) and the org quorum, not
  a private DM to one person.
- **A grace period built on data the app already computes** --
  `my-vehicles.js`'s existing `ACTIVE_WITHIN_DAYS = 30` active/quiet
  signal (currently only shown to other maintainers on that repo)
  becomes the same clock this request waits out. No new staleness
  concept, reuse what's already tracked.
- **Escalation to the org quorum uses the same 2-of-5 approval
  pattern already established for new-vehicle approval** -- an
  unresponsive maintainer doesn't get silently overridden by one
  person, in either direction. This mirrors the existing
  org-vs-repo-maintainer authority split rather than inventing a new
  one.
- **The timeout runs as a real GitHub mechanism, not a custom
  server:** a scheduled GitHub Actions workflow checking open
  maintainer-request issues' `created_at` against the grace period,
  consistent with this project's "no server, GitHub is the actual
  authority" architecture (see the Maintainer Portal security finding
  above).
- **Real gotcha caught before building around it:** GitHub disables
  scheduled Actions on a repo after 60 days of no repo activity --
  and an abandoned-maintainer repo is exactly the kind of repo likely
  to go quiet that long, which would silently disable the very
  automation meant to catch it. **Fix: the scheduled check does NOT
  live in each vehicle repo.** It runs once, in the org's own
  registry repo (which gets real traffic from every other org action
  already, so it won't go dormant), and scans across all vehicle
  repos' request issues via the API from that one central job. One
  clock for every vehicle, not N clocks that can each independently
  go dark -- also just cheaper than N schedules.

**Not yet built:** the actual workflow YAML, the "Request to help
maintain" UI action, and the org-repo scaffold it would live in (only
the per-vehicle repo scaffold exists today, at `scaffold/`). This
entry is the design answer, not the implementation -- simply not
built yet, not gated on anything else at this point (LEGAL.md's
pre-push review, which this used to be gated on, is done -- see its
cleared pin). Priority relative to v1.0.0: not explicitly re-sequenced
yet -- worth deciding in the same pass as the rest of the pre-launch
cut line, not assumed here.

## Possible revenue streams -- logged for reaction, not decided

Not committing to any of these. Writing them down because silence isn't
neutral, it's just undecided without ever having asked. If the community
hates all of them, that's useful information too.

- **Donations/sponsorship** (GitHub Sponsors, Open Collective). Lowest
  friction, most aligned with the free-core commitment, doesn't touch
  anything else.
- **Affiliate/commerce links** next to a procedure -- real parts, real
  tools, the iFixit model. Doesn't require exclusivity over anything,
  doesn't touch the free core.
- **An optional paid convenience tier for shops/dealers** -- bulk
  generation, hosting, support. Individual use stays free regardless;
  this would be selling convenience to businesses, not access to
  individuals.
- **Sponsored/branded parts placement.** Listed specifically to flag the
  real risk in it, not to endorse it: this is the one that could
  compromise trust if a sponsor's part gets preferential treatment over
  a better one. Any real version of this would need a hard, visible rule
  that sponsorship never influences which photo or which part gets
  shown, before it's ever considered.
- **A future data-partnership conversation**, years out, only if the
  community/corpus itself becomes genuinely large (see the earlier
  "how could this ever make money" discussion, the Waze parallel) --
  not something to design toward now, just the honest long shot.

## Contributor competition and rivalry -- avoiding a vote-driven "winner"

**The risk:** with real content creators contributing, and real audiences
attached to some of them, anything that picks a single "winning" photo
per procedure risks becoming a status contest, especially if the pick is
driven by public votes. A creator's fanbase brigading to make their
submission "win" over a rival's is a predictable failure mode the moment
votes decide anything, not a hypothetical one.

**Why this is mostly already solved:** multiple accepted photos can
coexist per `procedure_id` -- nothing is overwritten or deleted when a
better photo comes in, so there's no "loser" whose work gets destroyed.
That alone removes most of the actual stakes that turn into rivalry.

**The one open piece: how the patcher picks which photo renders by
default when several exist.** Explicitly not votes. Two reasonable
options, not mutually exclusive: (a) a small maintainer quorum
designates a "featured" pick, the same 2-of-N pattern already used for
onboarding approval, a judgment call by a few trusted people rather than
a popularity contest; (b) skip "featured" entirely and have the patcher
pick from all valid accepted photos (first match, random, or eventually
user-selectable per patch run). Either way, every accepted photo keeps
its own permanent credit line regardless of whether it's the one that
rendered in a given copy, so losing the "featured" slot never means
losing the credit.

## Comments on a procedure -- scoped narrowly, deliberately

**Idea:** in addition to photos, allow comments on a procedure ("this
angle doesn't show the bolt clearly," "this looks like a different model
year's part").

**The scope constraint, stated explicitly so it isn't lost:** this
project's founding premise is replacing forums, not rebuilding one inside
itself. If this ever gets built, comments must stay narrowly about
photo/procedure quality, never general discussion, never a place for
factual disputes or arguments to play out. The moment comments become a
discussion thread rather than quality feedback on a specific photo, this
has quietly become the exact thing it set out to replace. Any real design
for this feature should include an explicit answer to "what stops this
from turning into a forum" before it ships, not after.

## Multiple manuals for the same vehicle

**The technical wall, stated plainly, and still true:** every
`pixel_bbox` in a manifest is calibrated to one specific scan's raster
dimensions. A different scan of the *literal same edition* -- different
DPI, different re-compression -- shifts every coordinate. There's no way
to "just reuse" existing coordinate data for a new PDF, even when a
human would call it the same manual. Real constraint, not a shortcut
skipped.

**Resolved, 2026-08-25 -- corrects the design that was here before.**
The original answer modeled editions as fully independent sibling
repos, each with its own maintainer pool (`suzuki-sv650-1999-2002-oem`,
`suzuki-sv650-1999-2002-haynes`, separately owned). Raised directly and
overturned: **that's the wrong shape.** Not because the technical wall
above is wrong -- it isn't, coordinates genuinely can't be shared -- but
because splitting the *community*, not just the coordinate data, was
never actually required by that constraint. Keeping coordinates
separate only needs separate manifests/folders, not separate repos.

**The corrected model: one repo per VEHICLE, one maintainer pool per
vehicle, editions as subdirectories inside it.** `suzuki-sv650-1999-2002`
is one repo. The OEM manual and the Haynes manual both live inside it --
own `manifest.json`, own `images/` folder, own coordinate space each,
but under one roof, reviewed and maintained by one community. Why this
wins over splitting, weighed directly rather than assumed:
- **Expertise attaches to the vehicle, not the document.** Someone who
  knows an SV650 cold doesn't stop being qualified to judge a photo just
  because it illustrates the Haynes layout instead of the OEM one --
  same bike, same procedures, different book. Splitting communities per
  edition fragments the same pool of qualified people for no real
  reason.
- **It collapses problems that would otherwise need solving twice.** The
  maintainer-count guidance (2-5 active, see the quality-standards
  entry above) means one clear thing per vehicle instead of an ambiguous
  "2-5 per edition, so 4-10 total?" question. The succession mechanism
  and the "passive" registry indicator each get one signal per vehicle
  instead of a fragmented one per edition. Cross-edition photo sharing
  (below) becomes an internal conversation in one repo instead of
  coordination between two communities that may not even talk to each
  other.
- **The real cost, named on purpose, not glossed over:** a contributor
  who does a solid job indexing a *second* edition becomes a full
  maintainer of the *whole* repo -- including the original edition, which
  they may have zero track record on. **Accepted as a reasonable risk,
  not a flaw to design around further:** this project is fundamentally
  community-driven and built on being restorable, not on preventing
  every possible bad outcome up front. A maintainer added this way can
  be removed. The org quorum retains override authority over any vehicle
  repo if something goes wrong -- the real GitHub permission model never
  actually leaves org ownership, so this isn't a hypothetical safety
  net, it's the same authority structure already in place for every
  other repo action. Worth a real removal-for-cause path (distinct from
  the inactivity-based succession flow above, which is for *quiet*
  maintainers, not bad-faith ones) -- not designed further here, just
  flagged as the piece that makes "acceptable risk" actually true rather
  than just asserted.

**Governance, corrected to match:** the org quorum reviews *every*
manual submission's content -- source verifiable, indexing looks real,
someone gave it an honest first pass -- every single time, whether it
turns out to be a brand-new vehicle or a second edition of an existing
one. That's not the org re-litigating "is this vehicle in scope" (the
old framing was wrong to treat that as a one-time gate); it's the org
doing the one job it's always done, manual-content review, which has no
reason to stop just because the vehicle already exists. **What changes
is the org's approval *action*, not the review itself:**
- **New vehicle** -- the familiar path: fork the submitter's scaffold
  into the org, submitter becomes the vehicle's first maintainer.
- **Existing vehicle, new edition** -- no new repo gets created. The
  org's approval merges what the submitter indexed into the *existing*
  vehicle repo as a new edition folder, and adds the submitter as a
  maintainer of that whole repo, joining the existing pool with full
  authority (the accepted risk above).

This also resolves the earlier open "registry.json bottleneck" question
without needing either of the two options that used to be listed here --
since the org already touches every submission's approval unconditionally
now, folding the registry.json update into that same action isn't a
second bottleneck to design around, it's the same one action it already
was.

**Near-term fix, cheap, matters more under this model than it did
before:** the "check registry" onboarding step currently only checks
for an *exact fingerprint match* (and only during the resume-a-paused-
job flow, not on a normal fresh index -- a real, separate gap, confirmed
by reading the actual code, not assumed). It should search by
`vehicle_slug` on every fresh index, not just on resume, and tell a
submitter up front when their vehicle already has a repo -- "this
vehicle's already registered; your work will be reviewed and merged in
as a new edition, not create a new repo" -- so nobody indexes an entire
manual before finding out it's joining an existing community, not
starting one.

**Still real, still applies, now easier since it's one repo instead of
two:** what *can* be shared across editions isn't pixel coordinates,
it's the photos and the human-reviewed knowledge that a given photo is
correct for a given real-world procedure. A scan-independent concept
layer -- each edition's manifest maps its own local `procedure_id`s onto
a shared tag like `"front-brake-pad-replacement"` -- lets a photo
contributed against one edition be *proposed* for another, not blindly
applied to it:

- **Human-in-the-loop validation on every cross-edition match, always.**
  When a new edition is indexed and has no photos of its own yet, the
  system should proactively surface candidates from other editions of the
  same vehicle -- "we don't have a photo for this procedure in this
  edition yet, but here's one from the Haynes manual that might match --
  want to review and confirm it?" -- using the same accept/confirm pattern
  already built for the review gallery's omit/add flow. Never auto-apply:
  a running production change, a regional part difference, or a
  model-year revision can make two "the same procedure" actually
  different under the hood, and only a human looking at both knows for
  sure.
- **Selectable compatible series**, so matching doesn't get noisy at
  scale. Rather than proposing every photo from every edition against
  every other edition (a Haynes-manual photo suggested for an unrelated
  OEM-manual page is just noise), a maintainer curates which editions --
  or which model-year ranges within a vehicle -- are actually compatible
  for cross-matching at all (e.g. "1999-2002 and 2003-2004 SV650 share an
  identical front brake assembly, propose across both; the fuel injection
  years don't share anything with the carbureted years, don't propose
  across that line"). This scopes the candidate pool before a human ever
  has to look at it, so the validation step above stays fast and
  trustworthy instead of turning into a wall of irrelevant suggestions.

## Generations of the same model name -- stay separate repos, decided 2026-08-25

**Raised directly, right after the edition-unification correction
above, and worth being precise about the difference:** many vehicles
have real mechanical generations under one model name -- an SV650
Gen1 (1999-2002, carbureted) and Gen2 (2003-2010ish, fuel-injected)
are the same nameplate but not remotely the same machine. Does the
unified-repo model above mean generations should share a repo too?

**No -- generations stay separate repos, unaffected by the edition
fix.** The reasoning that justified unifying editions doesn't extend
here, and the distinction matters:
- **Editions describe the identical physical machine** -- OEM and
  Haynes are two books about the same bike. Unifying them keeps
  coordinate data separate (still can't be shared) while correctly
  recognizing the *knowledge* is the same knowledge.
- **Generations are a different machine that happens to share a
  name.** A Gen1 carb-sync photo has zero reuse value for Gen2 --
  this project's own cross-edition-sharing design already said as
  much before this question was even asked ("the fuel injection years
  don't share anything with the carbureted years, don't propose
  across that line," a few paragraphs up). Folding generations into
  one repo would reintroduce the "full authority granted without full
  track record" risk accepted for editions, but for a case that risk
  wasn't actually sized for -- a genuine Gen1 expert isn't necessarily
  qualified to judge Gen2 photos the way an OEM-manual maintainer
  *is* qualified to judge a Haynes photo of the exact same bike.
- **The naming convention already gets this right, and it was never a
  bug.** `vehicle_slug` is "make-model-year-range" specifically so
  Gen1 and Gen2 land as different slugs, different fingerprints,
  different repos -- exactly like any two unrelated vehicles. Nothing
  needs fixing here; the "different names because the year's off" was
  the system working as designed, not a discrepancy.

**Confirmed, not just asserted -- this doesn't cost real usability,
because of a piece that's already built:** a maintainer already sees
every vehicle they're on in one place (**My Vehicles**), so "generations
are separate repos" doesn't mean a maintainer juggling both is stuck
without a unified view -- they have one. It also means a maintainer who
only owns and knows Gen1 never gets pulled into approving Gen2
submissions they have no business judging, which a shared-repo model
would have forced on them.

**What still needs to happen, so this reads as a decision, not a
side effect a visitor has to infer:** the still-unbuilt registry
browse page needs to group/search by model name across year-ranges
("SV650" surfaces both generations' repos in one search, without
merging their communities or authority), and `docs/faq.html` needs to
say plainly that generations are separate repos while editions of the
same generation aren't -- the two are easy to conflate from the
outside and the FAQ should resolve that on sight, not leave it
implicit.

## Edition-subdirectory implementation: what's designed vs. what's real, and the fingerprint distinction (2026-08-29, built 2026-08-29/30)

**Status: shipped.** The "one repo per vehicle, editions as subdirectories" model (resolved 2026-08-25, above) is now real in every code path, including the live deployment (both real vehicle repos migrated, the live `vehicle-scaffold` template updated, `edition_id` normalized to lowercase). See CHANGELOG.md for what shipped and which PRs.

Below is the original design note this was built against, kept for context on the reasoning, not as an open task list.

**A second, easily-conflated concept, raised the same day and worth keeping permanently distinct from the above:** a *second fingerprint of the same edition* is not a new edition, and must not be handled by the subdirectory mechanism above.
- **Second edition** (OEM vs. Haynes): a genuinely different document -- different pagination, different procedures, different photos. Needs its own `manifest.json` + `images/` subdirectory, per the design above.
- **Second fingerprint, same edition**: someone's independently-scanned copy of the *exact same* OEM manual, differing from the original only in front-matter length (an extra cover sheet, a blank separator page) -- not a different document at all. The fix here is narrower and cheaper: OCR the first ~10 pages of the new PDF, and if it looks like an already-indexed vehicle's front matter, offer the submitter a match; if confirmed, a human tunes a constant page offset (+/- one page at a time) until the existing manifest's positional data lines up with the new scan, then that PDF's hash gets registered as a **second recognized fingerprint pointing at the same manifest** -- not a new manifest, not a new `images/` folder, not a fork. Same photos, same coordinates, just a second known-good hash and an offset. This only fixes front-matter-length differences; a different printing with pages genuinely added or removed mid-document still needs real re-indexing, and that boundary should stay explicit rather than silently assumed to work.

Not yet designed further than this paragraph -- the mechanism above is the theorized shape, not an implementation plan. Flagging the distinction now so whoever builds the edition-subdirectory work above doesn't accidentally fold this into it: a second fingerprint should never trigger a new subdirectory.

## Mosaic cover page (mosaic.py / stylize.py) -- consolidated

**Status: `mosaic.py`/`stylize.py` remain fully unported and motorcycle-only.**
`patcher.js`'s cover page is text/stats only today -- no photomosaic image.
Both the progress-indicator idea and the per-vehicle-class template problem
below are one piece of unbuilt work, not two.

**The idea:** the cover page's completion stat becomes a literal
photomosaic -- a target image divided into tiles, one per `procedure_id`,
each showing a color-matched crop of that procedure's contributed photo
once accepted, positioned to roughly match the procedure's physical
location on the vehicle. Must target an *original* Blayde Manual image
(a stylized silhouette, or a filtered community-contributed "hero" photo),
never an OEM press photo -- photomosaics of copyrighted images have real
litigation history, and small transformed tiles don't save you if the
assembled whole is still recognizable as the original.

**Why it's motorcycle-only today:** `mosaic.py`'s `ZONES`/`ZONE_KEYWORDS`
are hardcoded to a motorcycle's two-wheel side profile and service
vocabulary, even though `stylize.py`'s edge/body extraction is genuinely
vehicle-agnostic. Pointed at a car or any other vehicle class, the
zone-fill logic scatters tiles onto nonsensical regions.

**The fix, scoped:** a small per-`vehicle_class` (now `category`/
`manual_type`) template library (`templates/motorcycle.json`,
`templates/car.json`, etc.), each with its own zone rectangles + keyword
vocabulary -- O(number of classes), not O(number of vehicles). Until it
exists, treat the mosaic as motorcycle-only and gate it off (or fall back
to a flat, class-agnostic outline with no zone-fill) for every other
category.

## Multi-part manuals (one edition split across several physical files)

**Real, not hypothetical** -- some manuals ship as one PDF per
chapter/section rather than one combined file. Functionally still one
manual/edition, just physically split -- distinct from "Multiple manuals
for the same vehicle" above, which is about genuinely different editions
(OEM vs. Haynes), not one edition in pieces.

**The fix composes cleanly with what already exists, no redesign
needed:** `source_pdf_sha256` on a registry entry becomes a list --
one fingerprint per physical file, each tagged with a `part_id` (e.g.
"brakes," "engine") -- all pointing at one shared `manifest.json`. Each
manifest entry gets that same `part_id` alongside its existing page
number (already relative to one file's own numbering, never a "virtual
full manual" page count, so nothing changes there). When someone loads
their own PDF, the patcher fingerprints it, finds which part that
matches, and only touches entries tagged with that part -- entries for
chapters they don't have open are simply never in scope. `indexer.py`
needs one new capability: an append/merge mode so indexing a second part
adds to the existing `manifest.json` instead of overwriting it.

## Multi-language manuals and UI

**Data:** a `language` field on the registry entry, next to `edition_id`
(a localized manual is functionally its own edition, not a property of
the vehicle).

**UI:** the user-touched surface is small by design (landing page,
onboarding, contribute flow, FAQ), so a real i18n pass is bounded, not a
sprawling effort. Casual UI copy is low-stakes to machine-translate;
`CONTRIBUTING.md`'s CC-BY licensing/consent language specifically needs
native-speaker review, not just a translation pass.

**Which language first, and what year range this targets -- backlogged,
not decided.** Genuinely needs real data (forum activity by locale,
registration statistics, who's actually using this) not available in
this session. Working hypothesis, not researched externally: the target
vehicle age is roughly 1970s-early 2000s (the printed-manual-to-digital
transition window), but that's a supply-side guess about which manuals
exist only as bad scans -- it says nothing about demand-side language
priority, which needs real research (enthusiast forums/communities for
older vehicles) before deciding.

**Session-scoped contribution checklist -- still open, unrelated to
language, kept here only because it lived in the same tangled section
before.** Contributing several photos in one sitting has no "what have I
already done" view. Fix: scope the contribute landing page to the whole
manual *section* a figure belongs to (already extracted from OCR'd
headings), showing a live checklist of that section's figures with
what's captured this session checked off.

## Callout/annotation overlays: Phase 2, wiring into the actual patched PDF

Phase 1 (drawing arrows/circles/numbers/text on a photo during review,
stored as relative vector shapes on `entry.annotations`) shipped -- see
CHANGELOG.md. **Phase 2 is still not built:** `patcher.js` never reads
`entry.annotations` at all, so a patched manual today shows the plain
photo with no callouts, no matter how many were drawn during review.
Needs: teach `patcher.js` to draw them (same pdf-lib vector path already
used for the cover page/QR overlays), and decide a real annotation color
for the patcher output specifically (the review editor only ever shipped
white). Blocked on having real approved photos with real annotations to
render and check against.

## Editable section_heading labels (feature request, not built)

**The gap:** `section_heading` is auto-derived from whatever OCR'd
heading text sits nearest the figure, which describes the *page
section*, not necessarily the specific photo. Real example that
surfaced this: a figure tagged "REPLACE EVERY 18,000KM" (a maintenance-
interval heading) that's actually a photo of an air filter -- correct
provenance, misleading label. Worth being precise about what this does
and doesn't affect: `section_heading` is a human-facing hint (shown in
the review gallery, used to build the `procedure_id` slug) -- it has no
bearing on `pixel_bbox` or the patch mechanism itself, so a bad label is
a clarity problem, not a functional bug. But clarity matters here
specifically because it's the main signal a contributor uses to know
what photo to actually take -- a misleading label could mean a real
procedure gets skipped or the wrong part gets photographed.

**The fix, scoped:** let a reviewer edit the label text for any entry
(indexed or added), the same way `bbox_edits.json` already lets them
edit the crop -- a small, parallel addition (a `label_edits.json` or
folding into the same edit record), reusing the "prompt for a label"
pattern already built for adding a missing figure. Not built yet, logged
per an explicit request to track it rather than build it now.

## Line diagram indexing

The photo detector (density-based) reliably catches halftone photos but
structurally can't distinguish sparse line art (e.g. the TDC cam-position
diagram on manual page 38) from dense body text -- both have similar ink
density; only halftone photos have the sustained ~50%+ density that makes
the current threshold approach work. A real fix likely needs a different
detection pass (edge/connected-component based, not density based) rather
than tuning the current one further. Line diagrams are also a different
"replaceable" question than photos -- you don't photograph a TDC diagram,
you'd redraw or vectorize it -- so this may end up as a separate contribution
type, not just an extension of the photo pipeline.

## Video guide links

Contributors should be able to attach a permanent video URL to a
`procedure_id` (e.g. "here's a 4-minute clip of this exact procedure") as
a lighter-weight alternative/companion to a still photo. Needs: a link-rot
mitigation story (dead YouTube links are a real failure mode for this kind
of thing over a 10+ year manual lifespan -- maybe archive.org snapshot on
submission), and a decision on whether it lives in `manifest.json` next to
the photo path or as its own sidecar file.

## Performance telemetry (feature request, not built)

Two different scopes, not one feature. **Indexing metrics (Persona A):**
low-friction -- everyone running the indexer is already authenticated and
about to push a repo, so a small anonymized timing record (page count,
duration, concurrency) can just commit through their own session. **Patching
metrics (Persona B):** the real open question -- Persona B is often
anonymous and the patcher's explicit promise is "nothing leaves your
device," so this needs to be opt-in, clearly disclosed, and not depend on
being signed in. Not designed further than this.

## Docs-drift enforcement (revisit once core scripts stabilize)

Idea floated: tie documentation to a fingerprint of the function/file it
describes, so a code change auto-files an issue against stale docs.
That's a known pattern (some orgs gate PRs on "did you also touch
CHANGELOG.md"), but it's heavyweight for where this project is now --
the core scripts are still changing shape daily, so a fingerprint-diff
gate would mostly generate noise. Right sized for now: a "last verified
against [date/commit]" marker per README section, human-maintained. If
this gets built later, the more elegant target is doctest-style docs --
runnable examples in the README that fail as a test when the documented
behavior actually changes -- rather than a bot that files an issue on any
diff.

## Registry / multi-vehicle scaling

Outstanding items only -- the governance model itself (org approves new
vehicles/editions, repo-scoped maintainers handle day-to-day review,
storage limits are per-repo not org-wide) is built and live:

- **Repo rename or consolidation.** Renaming/migrating a repo is low-risk
  (fingerprints are a stable anchor) but `registry.json`'s `repo_url`
  never auto-updates -- updating the registry entry must be a required
  step of the rename itself, not a separate cleanup task someone can
  forget before GitHub's redirect eventually expires.
- **A public-facing ownership/trust diagram** for the README, so
  contributors can see the structure is sound without reading this file.

## Wait-time engagement, floated 2026-08-24 -- not designed yet

**Idea 1: an interactive game while indexing runs (Google's offline
dinosaur, something legally original).** Indexing can take up to ~20
minutes for a large manual -- floated as something to fill that wait
with, rather than a static progress bar alone. Not designed -- needs its
own pass (what game, built from scratch so there's no IP question,
how it doesn't compete with CPU/OCR workers for main-thread cycles
given the earlier-documented finding that heavy work already contends
with the main thread).

**Idea 2: make the progress bar itself the payoff, not just a number.**
An 8-bit/Atari-style pixel motorcycle (or car, matched to the vehicle
being indexed) at a starting line, rendered in black-and-white -- as
indexing progresses toward 100%, it gains color, and at completion it's
the fully-colored, "patched" version. Ties the wait directly to the
actual outcome (a fully restored manual) rather than an abstract
percentage.

**Wireframe built, 2026-08-24, then revised same day per direct
feedback -- standalone concept demo, not wired into `web/indexer-ui.js`
yet.** First pass was a single sprite cross-fading grayscale-to-color.
Corrected: the real ask is a side-profile rider ON the bike (not a bare
vehicle silhouette), progressing through actual visual *eras* as
indexing runs -- 1985 8-bit, 1995 16-bit, a 2010 HD remaster, today's
full color -- the same bike getting more resolved through the decades,
not a smooth blend. Also corrected: doesn't need to be smooth/60fps,
stop-motion jumps between stages is fine and arguably reads better as
distinct eras rather than a continuous animation.

Built as one shared vector drawing (canvas arcs/bezier curves, not hand
SVG path data) rasterized four different ways so every era is
*provably* the same underlying silhouette, not four unrelated
illustrations: 1985 renders it onto a tiny offscreen canvas and scales
that up with smoothing off (genuine blockiness from real
downsampling, not a blur filter standing in for it), 1995 doubles that
offscreen resolution with a fuller palette, 2010 switches to smooth
vector at full size in flat color, and today's finish adds a gloss
gradient on the tank, a rim-light stroke, and a soft ground shadow on
top of the same shapes. A brief flicker marks crossing an era boundary
instead of a crossfade, matching the stop-motion direction. Kept the
existing `[####......] 42%` monospace readout underneath unchanged --
a visual companion, not a replacement. Uses the project's own color
tokens so it matches the real product rather than introducing a new
palette.

**Not yet decided:** whether this ships as the real progress UI or
stays a demo -- and if it ships, needs a car/truck variant of the same
four-era treatment to match whatever vehicle's actually being indexed,
not just the motorcycle shown in the concept.

**Scrapped, 2026-08-24 -- the vector rider+bike approach entirely,
replaced by a real photo of the project owner's own engine.** Raised
directly: procedural vector art was never going to read as an actual
motorcycle, and the fix isn't a better illustration, it's not
illustrating at all. New direction -- a real photo (the project owner's
own engine, so there's zero rights/licensing question, consistent with
this whole project's discipline around only ever using content someone
actually owns) gets cropped, then run through the same underlying
technique already proven in the vector version (downsample-then-scale
for a genuinely pixelated early state, native resolution for the
finished state) plus a grayscale-to-color ramp, standing in for
"indexing progress" the same way the vector eras did. Blocked on the
actual photo file -- nothing further to build here until it's
provided.

**Aesthetic reference nailed down, same day: the real test manual's own
Tappet Clearance section (page 38), not retro game pixel art.** Pulled
up that exact page to check -- high-contrast, blown-out highlights,
crushed shadows, a visible halftone dot-screen texture from
photocopying a photocopy. That's the actual target for the low-progress
state, not an 8-bit look. This reframes the whole concept for the
better: it's not decorative retro styling anymore, it's dramatizing the
literal problem this project exists to fix -- a degraded OEM scan
clarifying into a real, sharp, full-color contributed photo as
indexing completes. Likely implementation: real halftone dot-screen
rendering (sample local brightness per grid cell, draw a circle sized
to darkness, same technique real photocopiers/newsprint use) at coarse
resolution + crushed contrast + desaturation for low progress, dots
fining down and color/contrast normalizing toward the unmodified photo
by 100% -- continuous, not staged eras, since it's now one concept
(bad scan -> real photo) rather than four decades. Still blocked on
the actual photo file.

**Built against a real photo, 2026-08-24 -- the project owner's own
cam chain tensioner shot, cropped, run through a genuine halftone
dot-screen renderer (samples average brightness/color per grid cell,
draws an ink dot sized to darkness -- the actual halftone-printing
technique, not a blur filter standing in for it) at two settings for
"Rough scan" and "Cleaning up," with the unprocessed photo itself as
"Your photo." Verified live against the reference from the Tappet
Clearance page: matches -- aged paper tone, crushed contrast, visible
dot structure. One honest limitation surfaced during testing: this
particular crop is mostly bare metal (silver/black), so the color
reveal between stages is subtle rather than dramatic; a crop including
the visible colored wiring would demonstrate it better if a punchier
demo is wanted.

**Redirected, same day: this belongs on the patcher page
(`web/index.html`), not the indexer.** Raised directly -- the halftone-
clearing-to-real-photo effect isn't a metaphor for *indexing* progress,
it's a near-literal depiction of what *patching* actually does: replace
a degraded OEM scan with a real contributed photo, procedure by
procedure. Two uses on that page: (1) an explainer graphic for the
landing page itself, showing a visitor what the product does before
they even pick a PDF; (2) the actual patch-progress screen, since
patching already iterates per-procedure the same way this demo does per
stage. Not wasted work -- the halftone renderer and the settle-cue
pattern both carry over directly, just to the other page. **Indexing
still needs its own distinct concept** -- floated but not designed: a
scanning-sweep motif (a beam/highlight moving across a page, boxes
lighting up as figures are detected) would fit indexing's actual nature
(discovery across many pages) better than a before/after photo pair,
since indexing finds photo *opportunities*, it doesn't replace photos
at all. Open design problem.

**Wireframe rebuilt to a real 10-generation sequence, 2026-08-24 -- up
from the earlier 3 discrete stages (Rough scan / Cleaning up / Your
photo).** Same cam chain tensioner photo, same halftone renderer, now
run at ten strengths instead of two so the slider and the "Simulate
patching" autoplay both have real intermediate frames to show instead
of jumping between three fixed points. Pipeline uses ImageMagick's
ordered-dither presets (`h8x8o`/`h6x6o`/`h4x4o`, coarsest to finest
across the run) layered with `-compose Dissolve` to blend the
dot-screened version back toward the clean photo at each generation's
strength -- worth flagging that Dissolve's blend-percentage semantics
are easy to get backwards (which operand's opacity is which), so this
was checked empirically against actual output rather than assumed from
the option name. Verified rendering correctly in a fresh browser tab:
all ten generations show a visibly distinct image, the "GENERATION N /
10" label and readout track the slider at every step, autoplay runs
gen 1 through gen 10 and stops cleanly on its own, and a completion
message appears only once gen 10 is reached -- never earlier.

**Corrected same day: the completion message itself was wrong.**
Shipped as "Thank you for saving this vehicle." -- that's the mission
language ("Save the vehicles. Save the knowledge... Let's find the
index... Thank you for saving this vehicle") the project owner gave
for the *indexer's* completion screen specifically, not the patcher.
Misapplied here because the patcher wireframe was what was in flight
when that language arrived. The two screens earn different sentiment:
indexing is the act of rescuing a manual that would otherwise stay
lost, patching is benefiting from work contributors already did --
so patching's real copy is gratitude toward them, not a "you saved
this" claim aimed at the visitor: "Thank you for visiting. This was
made possible by contributors around the world. Thank you for
contributing." Fixed in the wireframe, republished to the same
artifact URL. The indexer's own completion screen still needs this
mission language properly designed in -- open, not yet built (see the
scanning-sweep concept above). A specific "archivist"-themed wording
given earlier for this same screen was lost to compaction and never
recovered by searching transcripts/scratchpad files -- needs restating
from wherever it's actually saved, if still wanted.

## QR codes: shipped, three real gaps still open

In-PDF contribute QR codes + the Contributor Portal are built and live --
see CHANGELOG.md. Still open:

- **QR links open in the same window/tab as the manual**, losing the
  reader's place. Standard PDF `/Link` annotations have no
  `target="_blank"` equivalent; this is up to the viewer, not something
  `patcher.js` can force. Not pursued further until a real viewer-side
  workaround surfaces.
- **A real short/opaque ID on the registry entry**, used in the QR instead
  of `vehicle_slug` when present, so a long real vehicle name (e.g. "Alfa
  Romeo Giulietta Quadrifoglio") doesn't undo the QR-payload shrinking
  that today's short slugs happen to get for free. A redirect/short-link
  layer was considered and rejected as unneeded infrastructure. Not
  scoped further until vehicle names longer than today's actually show up.

## Registry URL field and contributor preference, corrected (2026-08-24)

Two real gaps in the just-wired landing page, both caught in direct
review, not by me:

- The "Advanced: registry URL / manual test mode" details block
  exposed a raw `registry.json` URL as an editable text field. That's
  a dev-only knob from before the real registry existed -- no real
  visitor should ever need to know what a registry URL is, let alone
  edit one. It's now a hardcoded `DEFAULT_REGISTRY_URL` constant in
  `patcher.js`; the "Advanced" block collapses down to just the
  manual-test-mode photo picker, itself a dev-only fallback for
  testing the patch-drawing math without a published registry/repo to
  point at.
- "Prefer a specific contributor's photos?" was a free-text
  comma-separated-handles field shown before any file was even picked
  -- asking a visitor to already know who's contributed to a manual
  they haven't matched yet, an impossible ask. It now only renders
  after a registry match succeeds, built from that match's actual
  `images/` folder contents, and shown as a checkbox list default-
  ordered by contribution count *to this vehicle* (not a global
  leaderboard across the whole project). DOM order is the priority
  order `pickPhoto()` already consumes -- no separate reordering UI
  needed, checking a box just opts that person into the count-based
  order already shown.

## Standard: dev-only scaffolding stays only until superseded

Project-wide standing rule, not a one-time task: anything built as a
stand-in for real infrastructure that isn't live yet (mock data, a
manual test-mode bypass, etc.) is fine to leave in place while the real
thing doesn't exist. Once the real thing is wired up and covers the same
ground, the stand-in comes out -- ship the trigger, remove the trigger,
don't let it linger past its purpose.

## Contributor Portal follow-up fixes: real bug + two copy corrections (2026-08-24)

**Real bug, caught directly: "why does it show sign in and also my
uploads?"** `renderUploads()`'s visibility logic only checked
`uploads.length`, never `signedIn`, so leftover local uploads from
testing rendered underneath the sign-in gate regardless of whether the
visitor had actually signed in -- directly undermining the gate's own
promise. Fixed by gating uploads visibility on `signedIn` when arriving
via the landing page (no procedure context); the QR-scoped path keeps
its original, deliberate behavior (browsing never requires an
account), since that's a different, correct case. This is exactly the
kind of inconsistency worth catching before it ships further.

**`--red-text` corrected: read as pink, not red.** Direct feedback.
The AA-contrast fix a few entries up (`--red-text: #ff2e4f`) technically
passed WCAG math but visually leaned coral/pink -- the fix kept `--red`'s
hue but raised lightness while a small green channel stayed mixed in,
and high-lightness-plus-green-tint is exactly what reads as pink rather
than red. Corrected to `#ff002b` -- zero green, same hue as `--red`,
contrast gained by pulling black out rather than mixing light in.
Still clears 4.89:1, same AA fix, just actually looks like red now.

**Two `contribute.html` paragraphs plain-language-corrected, direct
feedback.** The top intro line pre-explained account requirements
before a visitor had asked; and the landing sign-in card's paragraph
explained the QR-vs-nav-link distinction, information nobody needs in
the moment -- "if you're here you have another agenda" was the exact
framing. Both shortened to state what the page/gate actually does,
nothing more.

## HARD GATE: no outside code contributions to the tooling repo until a CLA/DCO exists (2026-08-25)

A real-world comparison against Mastodon, Home Assistant, and iNaturalist surfaced a gap specific to code contributions, separate from the photo-consent work already built this session. Home Assistant's CLA.md exists to protect the same thing LEGAL.md already argues for: as sole copyright holder today, before any outside contributor's code lands, dual-licensing stays available later as a real option. That protection only holds if every contributor's rights to their own contribution are actually attested to somewhere. Right now nothing captures that at all for code, the way the new checkboxes in contribute.js now capture it for photos.

This is a hard gate, not a nice-to-have-eventually item. This project must not accept a code pull request from anyone other than the sole author until a CLA or DCO (Developer Certificate of Origin, the lighter-weight sign-off convention many projects use instead of a full CLA) exists and is actually required before a PR can merge.

Confirmed with the project owner: with a single author today, there is no real gap yet. Nobody else's rights need attesting to when there is no one else contributing. This only becomes load-bearing the moment a second person's code is proposed, which is exactly why it belongs on the roadmap now, decided in advance, rather than being improvised under pressure the first time someone actually opens a code PR.

## Branch protection: current state, and the one real gap left (2026-09-09)

Branch protection no longer needs to be configured by hand per new vehicle repo -- `handleApproveVehicle` sets it explicitly at approval time. Current live state, confirmed via the GitHub API: `suzuki-sv650-1999`, `blayde-manual-2026`, and `royal-lexon-s20` each require 2 approving reviews plus both the `checker` and `validate` status checks (the manifest-validation job is now wired into `required_status_checks`, closing the earlier gap); `vehicle-scaffold` (the template repo) carries its own separate protection (2 reviews + code-owner review), which does not propagate to repos generated from it -- real vehicle repos get their protection from `handleApproveVehicle`, not from the template. `submission-log` is locked down differently since only the GitHub App writes there directly: `enforce_admins: true`, force pushes and deletions blocked, linear history required, and `restrictions` scoped to only the App's own installation (no human, including an org admin, can push directly).

**Still open:** an org-level Ruleset (rather than per-repo branch protection) would apply automatically to every new repo matching a pattern without needing `handleApproveVehicle` to set it explicitly, but creating one needs `admin:org` scope, which the current token doesn't have.

## OAuth App registered; expire-user-access-tokens deferred until the worker handles refresh (2026-08-25)

OAuth App registered under the BlaydeManual org. Client ID: `Ov23lijpNHggDgWfwxWa` (public, not sensitive -- safe to record here). Client secret is not recorded anywhere in this repo; it belongs only in the Cloudflare Worker's secret bindings once that worker exists.

Two registration settings decided, checked against GitHub's real OAuth App docs rather than assumed:

- **Device Flow: off.** That flow is for browserless/limited-input devices (CLI tools, smart TVs) authorizing without a redirect URL. Blayde Manual is a browser web app with a real callback URL, so it doesn't apply.
- **Expire user access tokens: still off.** The Cloudflare Worker now exists and handles the GitHub App's own short-lived installation tokens, but the classic OAuth App's token-exchange path has no refresh-token logic. Turning this on would mean classic-OAuth tokens silently expire with no way to refresh. **Flip this on once the classic-OAuth path gets refresh-token handling** -- GitHub calls expiring tokens the preferred long-term posture, this is a temporary deferral, not a permanent decision.

## Backlog: speed slider should show discrete stops, not read as a continuous bar (2026-08-26)

The Advanced: speed control (indexer-ui.js/maintainer.html) already snaps to whole numbers (default `step="1"` on the range input), but visually it looks like a smooth 0-100% bar with no indication of where the real stops (1, 2, 3... up to the device's cap) actually are. Flagged directly: should visually show the discrete selectable positions, not read as a continuous slider. Likely fix is a `<datalist>` with tick marks matching the cap, not a functional change to the underlying value logic. Not urgent -- logged to come back to, not fixed in the moment.

## Real evidence: even 2 workers OOM-killed Firefox on Linux (2026-08-26)

Direct report while testing the Advanced: speed control: Firefox on Linux was killed by the kernel's OOM killer at only 2 concurrent OCR workers -- not the higher settings, just "Faster." Same machine, same manual, run in Vivaldi (Chromium-based) at the same setting: no issue. Confirms the pool-size hotfix's own reasoning was correct to be conservative -- "no evidence yet on whether 2-3 is actually safe" turned out to mean genuinely not safe, at least on this real combination of OS and browser engine.

Real, useful data point for whenever indexing_metrics accumulates enough real manifests to inform a safer default: browser engine (Firefox/Gecko vs. Chromium) may matter as much as raw core count or RAM. Not asking for a code change from this alone -- one data point, not a pattern yet -- but worth remembering when that future concurrency decision actually gets made, and a real argument for keeping the single-threaded default conservative in the meantime.

## Backlog: pre-fetch the next review chunk's pages, not just cache what's already been rendered (2026-08-26)

Direct suggestion after watching the blank/slow-thumbnail issue in real use: "can we pre-chunk the doc and switch chunks and clear out old chunk?" Checked what already exists before treating this as new work: a rolling window is already there at two levels -- the gallery only ever renders REVIEW_CHUNK_SIZE (10) candidates' pages at once, and getReviewPage's own cache (reviewPageCache) is LRU-capped at 20 pages, oldest evicted automatically as new ones render. What's genuinely missing is PRE-fetching: the next chunk's pages only start rendering once the maintainer actually clicks "Next," not before, so there's still a real wait right at the moment they land on a new chunk even though the system could have used the idle time before that click to get a head start.

Real fix would be: after renderReviewGallery() finishes the current chunk, kick off (low-priority, non-blocking) getReviewPage() calls for the pages in the NEXT chunk, so by the time "Next" is actually clicked those renders are already done or in flight. Interacts with the existing LRU cache correctly by construction -- prefetched pages just become the most-recently-used entries, evicting genuinely old ones the same way already-viewed pages do now. Not built in this pass -- deliberately backlogged, logged directly per request, pick up as its own change.

## GitHub App migration: still-open pieces (see CHANGELOG.md for what shipped)

The GitHub App migration (locked direct-submit repos, real org-approval checks, real image validation, `/manage-collaborator`) is live -- see CHANGELOG.md and SECURITY.md. Two pieces remain deliberately unbuilt:

- **A real REJECT action for direct-submit vehicle proposals.** Unlike approve, rejecting one means deciding what happens to a real, already-created private GitHub repo (delete it? leave it? ask for a fix?) -- a genuinely destructive, hard-to-reverse decision. Reject stays a logged/mock action for now.
- **The personal-account submission path's "propose -> approve -> transfer" flow.** Still needs a human to actually initiate the GitHub-side repo transfer, since no org-side credential can pull a repo out of someone else's account without their cooperation, regardless of auth model. Only the direct-submit path's full loop is real end-to-end.

## Backlog: the indexer's "Download manifest.json" button has no matching way back in (2026-08-27)

Direct question, raised while a real vehicle was being indexed: "you can download the index, but you can't re-upload it later as a savepoint... so why download the index?" Checked the actual code rather than assuming an answer -- `indexer-ui.js`'s `downloadBtn` exports the in-memory manifest as a plain file download once indexing finishes, with no explanatory comment anywhere for what it's for. There is a real, separate resume system already (`indexer-core.js`'s job-based resume, checkpointed to IndexedDB), but it only resumes the SAME browser tab/profile's own stored job -- it has no import path that accepts a manifest.json file at all. So today: downloading the manifest produces a file that cannot be fed back into the indexer, the reviewer, or anything else in this codebase. Its only real use right now is as a raw artifact for manual inspection or an external backup copy, not a savepoint in any functional sense -- and nothing in the UI says that's all it's for, which is exactly what prompted the question.

Not fixed in this pass, logged directly per request. Two real directions, not decided yet: (1) build a real "load manifest.json" import path so the download genuinely functions as a portable savepoint (works across browsers/devices, unlike the IndexedDB-only resume); or (2) if the button was only ever meant as a raw-data escape hatch, say so in the UI rather than leaving it looking like a savepoint feature it isn't.

## Backlog: persist which vehicle/edition is expanded in the review list (2026-09-10)

Direct request: working through several requests on one vehicle (e.g. sv650) means re-browsing the whole category tree from scratch every time the list re-renders or the page reloads -- everything currently defaults back to fully expanded, with no memory of which vehicle a maintainer was actually focused on.

**Light** -- client-side only, no schema change, no new endpoint. `renderPRList`'s `<details>` expand/collapse state isn't persisted anywhere today; save it to `localStorage` (per-maintainer UI convenience, not shared state) on every toggle, and re-apply it right after the tree rebuilds. Rough scope: one small persisted object keyed by vehicle/edition, a save on toggle, a restore after render -- no design decisions to resolve first.

## Backlog: three real gaps found reviewing the real `blayde-manual-2026` panes (2026-08-27)

The review-gallery layout inconsistency (Prev/Next below a variable-height thumbnail grid) is fixed -- see CHANGELOG.md. Three findings from the same pass are not:

1. **Per-maintainer activity metrics (requests reviewed, last active) are gone** from the real `my-vehicles.js` roster, by design -- GitHub's collaborator API doesn't expose them, and computing them for real would mean iterating every merged PR per collaborator. Acknowledged simplification, not a regression to fix.
2. **My Vehicles and Issue Requests disagree on `blayde-manual-2026`'s edition** ("Covers 1 edition: OEM" vs. "(edition not set)") because `issue-requests.js` still reads `MOCK_REGISTRY.vehicles` instead of the real registry.
3. **Issue Requests' own page viewer has no Prev/Next**, only a "jump to page" input -- a third, different navigation pattern. Downstream of #2; needs real data to page through first.

**Also resolved, no code change needed:** whether a reviewer can correct a wrong source URL without rejecting a submission. The notarization hash only has to hold at the moment of approval; a wrong `source_identifier` gets fixed by approving as-is, then having the vehicle's real maintainer commit the correction to `manifest.json` directly, post-approval, same as any other ordinary write. This does depend on a real REJECT action existing for the case where a submission is too broken to approve as-is at all -- see the GitHub App migration entry above.

## Backlog: sign-in state isn't consolidated -- reported as "why do I have to authorize twice" (2026-08-27)

Direct report: signed in and shown as such at the top of the page, but the indexer's own submit button still read "Sign in to submit." Checked the actual code, not assumed -- this is exactly the two-session-slot design working as built, not a bug in the strict sense, but the user is right that it's a real UX problem worth rethinking, not just explaining away.

**Root cause, precisely:** `web/auth.js` deliberately keeps TWO separate sessions in two separate `sessionStorage` slots -- classic OAuth (`getSession()`) and the GitHub App's user-to-server login (`getAppSession()`) -- because a maintainer can legitimately need both live at once (classic OAuth to browse/review, the App session only for the moment they submit directly). The top-of-page auth status (`renderAuthStatus`) shows "signed in" if EITHER session exists. But `indexer-review.js`'s `updateSubmitSignInUI()` (line ~60) specifically checks `getAppSession()` alone, since `/direct-submit` is GitHub-App-only by design (see the GitHub App migration entry above) -- so someone signed in via classic OAuth only sees "signed in" at the top and "Sign in to submit" right below it, which reads as broken even though both are behaving exactly as coded.

**Second confirmed instance, same day:** the "Approve New Vehicles" tab hits the identical pattern -- `@TheBlayde` shown signed-in at the top of the maintainer portal, while the tab itself shows "Sign in to view pending vehicles." Root cause is the same function shape in a different file: `org-approval.js`'s `updateOrgSignInUI()` (line ~42) also gates on `getAppSession()` alone, since viewing/approving pending vehicles reads private repos under BlaydeManual and needs the App session specifically. Two separate tabs, two separate call sites, same underlying design decision -- this is a pervasive pattern across the portal, not a one-off in the indexer.

**The user's own framing is the right question, not just a complaint**: "I feel we have to authorize the app multiple times rather than one sign in" -- correct, and worth a real design pass, not a quick patch here. GitHub does not allow merging a classic OAuth App and a GitHub App into a single token/authorization (confirmed earlier in this project's own research into the App migration) -- they are fundamentally separate registrations with separate consent screens. So "one sign-in" would mean either (a) dropping the classic OAuth path entirely and using the App for everything, accepting whatever that costs the flows that currently rely on the user's own broader `public_repo` access, or (b) chaining the two consent screens into what LOOKS like one sign-in flow to the person using it (App auth first, silently followed by classic OAuth, or vice versa) even though two real GitHub authorizations still happen underneath, or (c) some other reframing not yet considered.

**Explicitly scoped as its own PR, not folded into this one** -- per direct instruction, this needs its own think-through on the actual sign-in architecture rather than a quick UI patch on top of the current two-slot design.

## Backlog: quorum-style dual-approval on new-vehicle approval itself

Dual-approval is now real for photo contributions (GitHub-enforced branch protection, see CHANGELOG.md). Extending the same quorum model to the vehicle-approval action itself is deliberately deferred until a second real org admin exists -- not decided against, just not yet relevant with only one admin today.
## Backlog: Browse doesn't group generations by model name or filter by make/model/year

**Still genuinely open, checked against the real code (2026-09-10):**
`registry-browse.js`'s substring search over `vehicle_display_name`/
`vehicle_slug` does let "SV650" surface both generations' repos today,
which covers the original discovery goal. But `registry.json` still has
no make/model/year_range fields (only `vehicle_slug`/
`vehicle_display_name`/`vehicle_class`/`edition_id`/`repo_url`/
`source_pdf_sha256`/`status`/`category`/`manual_type`) -- the code's own
comment says so directly. Grouping multiple generations under one
heading, and real filter/sort by make/model/year, both need those fields
captured at submit time first; not worth faking via slug-parsing.

## Personal/private contribution paths: two future directions, deliberately not built (2026-08-27)

Raised directly, then explicitly scoped back out: "nobody is asking for that today, so let's keep aligned to 'We are contributing.'" Recorded here so the thinking isn't lost, not because either is in progress.

**The real gap named:** today, contributing a photo always means it becomes part of the shared, canonical registry (or nothing) -- there's no way for someone to patch their own manual using only their own photos, kept private, without going through the shared-contribution path at all.

**Two shapes this could take, if it's ever actually asked for:**
1. **A real update/replace slot on an already-contributed photo.** Cheaper than it sounds: the patcher already resolves "which photo fills this procedure" by finding a real file in the repo's `images/` directory matching the `<procedure_id>__by_<username>.ext` convention (see `registry.js`'s `parsePhotoFilename`), so a second contributor's photo for the same procedure is already just another PR against the same slot -- review-panel.js's existing accept/reject is what actually picks a winner. An explicit "replace this photo" affordance would mostly be a UI/workflow layer over a data model that already supports it, not a new capability. The alternative -- handling it via a plain issue/feedback report ("this photo isn't great") -- is also already a valid, lower-effort path and needs nothing new built.
2. **A personal photo override, scoped to photos only -- corrected from an earlier, bigger framing.** First pass on this idea (sign in, patch from a personal fork with its own manifest, a full second data path through the patcher) was over-scoped; the real, narrower version, per direct correction: keep using the official manifest exactly as-is (entries, page geometry, procedure list -- none of that changes), and add ONE thing -- a second repo, pointed to by the person patching, holding photos in the same `<procedure_id>__by_<username>.ext` naming convention `registry.js`'s `parsePhotoFilename` already parses. At patch time, that personal repo's `images/` gets scanned the same way the canonical repo's already is, with higher priority on conflict -- a personal photo for a procedure wins over the canonical one if both exist, and the missing-photo QR still shows for anything neither repo covers. Concretely: `patchViaRegistry`'s existing single-repo `listRepoImages()` call becomes two calls (canonical, then personal-override-if-provided), merged by procedure_id with the personal repo winning ties, before the existing per-procedure candidate-selection logic runs unchanged. A real, materially smaller lift than the original framing -- no second manifest, no parallel patch path, just a second photo source layered onto the lookup that already exists. Still not scoped further than this until it's a real ask.

**Related, from the same "offline with your own repo" idea**: Contributor Portal's Save-for-Review redesign (PR #59, see CHANGELOG.md) already makes drafting 100% local/accountless -- the missing piece is exporting a saved Reviewable to a file and re-loading it later against a personal repo, entirely without a GitHub account. Not designed or built, noted so it isn't lost.

## Registry repo's schema doc has real drift from what the code actually writes

Re-checked 2026-09-10 against the live `BlaydeManual/registry` repo: the
`vehicle_class` gap is now fixed (the README documents it as deprecated,
superseded by `category`/`manual_type`). **Real drift remains**: the
README's example still shows `source_identifier` and `submitted_by`
fields that none of the 3 live registry entries actually have. Needs its
own PR against `BlaydeManual/registry` directly (this repo has no write
access to that one's docs).

## Periodic cleanup: auto-reject stale/malformed photo PRs (proposed, not built)

Raised directly alongside the `/accept-photo-pr` merge-gate work (see SECURITY.md's "Real merge-time validation" section): that gate closes what happens when a maintainer clicks Accept on THIS site, but does nothing for a PR nobody ever acts on at all -- one that would fail the same checks (extra files, embedded EXIF, corrupt image) but just sits open indefinitely instead of being explicitly rejected. This is explicitly a **complementary** idea, not a substitute for the required-CI-status-check fix SECURITY.md's new gap entry calls for -- that one stops a bad merge from ever completing, native or not; this one only cleans up what's left open, after the fact.

**Shape of it:** a scheduled GitHub Actions workflow (`on: schedule`, e.g. daily), most naturally living in a small tooling context with access to the registry (either a new workflow in this repo or a dedicated one, not decided). For each approved vehicle repo in `registry.json`, list open photo PRs and run them through the exact same two checks `/accept-photo-pr` already has (negative file-allowlist, image validation + metadata scan) -- reusing that logic, not reimplementing it. A PR that fails, and has been open past a grace period (something like 48-72 hours, so a maintainer who just hasn't gotten to it yet isn't punished for a PR that would actually pass), gets auto-closed with a comment naming the specific failure, not a generic rejection:

- Extra files: "This pull request includes changes beyond a single contributed photo and can't be automatically accepted. Please use the Contributor Portal at blaydemanual.com/contribute.html, which handles this for you automatically."
- Embedded metadata: "The submitted photo still contains metadata (location, camera, or timestamp info) that needs to be removed first. The Contributor Portal at blaydemanual.com/contribute.html strips this automatically -- please resubmit through there."
- Invalid/corrupt image: "The submitted photo couldn't be validated as a real image file. Please resubmit through the Contributor Portal at blaydemanual.com/contribute.html."

Common thread in all three, matching the direct framing this was proposed with: point back at the official channel rather than just saying no. A PR that passes both checks is left alone either way -- this is a backstop for genuinely malformed/abandoned submissions, not a replacement for human review of legitimate ones.

**Open questions, not yet decided:** where this workflow should live (this repo vs. a dedicated tooling repo, given it needs to act across every vehicle repo, not just one); what credential it runs as (likely the same GitHub App installation token, via a machine-to-machine auth path the Worker would need to expose, since Actions runners don't have interactive sign-in); and the exact grace period. Not scoped further than this until it's actually built.
## In-portal notification feed (stretch goal, not built) -- deferred from the GitHub-email gap (2026-09-01)

**The gap:** every PR/review/merge in the direct-submit and direct-contribute chains ends with GitHub sending its own transactional email to the recipient, which links straight into github.com, not blaydemanual.com. That's a hard platform limit, not a missing setting: GitHub generates that email itself from the recipient's own notification preferences, and neither a repo owner nor a GitHub App can customize or redirect it.

**What's shipped now** ([auth-worker/src/index.js](auth-worker/src/index.js), [web/contribute.js](web/contribute.js)): every real PR body the project's own code constructs (Private-path photo PR, Public-path photo PR, registry recategorization PR) ends with a short "track this from the portal" line pointing back to the Contributor Portal. This is the one thing actually within reach: once someone lands on the PR itself, offer the easier path, without telling anyone to ignore the platform they're already using.

**What's explicitly NOT being built now, logged as a stretch goal only:** an in-portal notification feed -- something that shows a signed-in user their own open PRs/reviews/approvals inside the site itself, so they don't need the GitHub email at all to know something changed. **Direct instruction, 2026-09-01: this must stay read-only and poll GitHub's existing API on demand (or on page load), never store any new user data to make it work** -- no collecting email addresses, no webhook subscriber lists, no push-notification infrastructure. That would cut against the project's existing data-minimization model (accountless local drafts, no server-side user records beyond what GitHub itself already holds). If ever built: likely a small addition to the Contributor/Maintainer portal's own landing view, driven by `GET /notifications` or per-repo PR/review list calls against the signed-in user's own token, rendered live, never persisted server-side.

## Photo-location-fix proposals: backlog remainder

The core feature shipped (PR #92, see CHANGELOG.md and SECURITY-TESTING.md
Tier 8). A "comment" issue kind (no bbox) was deliberately dropped, not
deferred -- no real use case surfaced. **Still backlogged, not started:**
proposing a correction to a manual's source URL specifically, likely the
same shape (Contributor proposes, Maintainer reviews, single-field diff
gate) -- parked to avoid scope creep, pick up on real need.

## "Remove this photo spot" shortcut from a deep-linked photo page (2026-09-01, idea only, not started)

**The idea:** `contribute.html`'s existing deep-link landing (arriving with a `procedure` in the URL, e.g. clicking a photo link straight out of a rendered manual page) already lands pre-formed on that one specific slot's upload flow. Add a second option right there, alongside the existing upload picker: "Request this picture zone be removed" -- skip the portal navigation and the "search for the right entry" step from the standalone editor, and go straight into the same remove-issue flow this slot would otherwise need `issue-requests.js`'s picker to even locate.

**Real constraint, not a blocker but worth designing around:** the removal flow's blue-box-with-an-X preview (see the photo-location-fix diff view shipped above) only exists because the manual's own pages get rendered locally from a contributor-supplied PDF -- the repo itself never stores them. That step doesn't go away just because the entry is already known from the URL; the "faster" part is skipping the portal login-and-search, not skipping the PDF pick. Recommend NOT gating the whole shortcut on that PDF pick being done first -- let a contributor without their PDF handy on this pass still submit a real removal request with a plain-text confirmation ("Remove the photo slot for `<procedure_id>`?") instead of forcing the rendered preview, and offer the rendered preview as a nicer confirmation when they do have the PDF loaded. Keeps the actual time saved (no login, no search) honest without overselling a preview that isn't actually free.

**Not designed further than this paragraph** -- reasonable options logged so the idea isn't lost: a small addition to the existing deep-link landing UI in `contribute.js`/`contribute.html`, reusing `queueRemoveIssue`/`submitManifestChange` from `issue-requests.js` rather than a separate code path. Pick up once there's a real, specific request for it.

## Credits page appended to the patched PDF (idea only, 2026-09-04)

**The idea:** now that `maintainer-stats.json` persists real, permanent per-maintainer activity (merged contributions, reviews given, last active -- see the "Persisted maintainer activity stats" entry above), `patcher.js` could append a page (or a few) at the very end of the patched output crediting everyone who's ever contributed to that vehicle's manual: real merge counts, real review counts, maybe even a tally of real annotation work (arrows/circles/numbers drawn during review -- a separate, not-yet-tracked metric this idea would also need). A real, permanent "credits roll" for a document that otherwise has no natural place to put one.

**Why this is only possible because of the persistence decision already made:** the whole point of never deleting an entry from `maintainer-stats.json` when someone's removed as a maintainer is that their real historical credit outlives their current access -- someone who contributed 200 reviews and later stepped away (or was removed) keeps that credit forever, in the one place (this file) that would ever feed a page like this. A live-rescan-based stats system (the very first cut of this feature, before the persisted-file redesign) couldn't have supported this at all, since it only ever reflected CURRENT collaborators querying CURRENT PR history live -- a removed contributor's own past work would have had nowhere to be read from once they were gone.

**Not designed further than this paragraph** -- real open questions before this is buildable: what "annotation contribution" would even mean as a tracked metric (arrows/circles drawn during review aren't currently counted anywhere, unlike merges/reviews which now are), how many maintainers before a credits page needs its own pagination, and whether this belongs as a fixed template page in `patcher.js` or something more dynamic. Pick up once there's a real, specific request for it -- not blocking anything shipped now.

## Backlogged: move `maintainer-stats.json` into `submission-log` (2026-09-10)

**The gap:** `maintainer-stats.json` lives in each vehicle's own repo, updated server-side by `recordMaintainerActivity()` via the installation token -- but the file itself isn't protected from a human write. Any maintainer with push access on that repo can open a normal PR against it and get it merged by another real collaborator (2 approvals, same as any other change there), padding their own merge/review counts.

**Assessed as low priority, not undone:** this is cosmetic today -- a number on a page only that vehicle's own maintainers see -- and hard to pull off quietly (needs a second real collaborator's approval, shows up permanently under the faker's own GitHub identity, trivially reverted). Not worth building for its own sake right now.

**The fix, when it's picked up:** `submission-log` already exists and is already locked down the right way for this (App-only write via `restrictions`, `enforce_admins: true`, no human write path at all -- not even via PR). Move each vehicle's stats file there as `maintainer-stats/<repo-name>.json`, mirroring the existing `submissions/<repo-name>.json` notarization convention. Update `recordMaintainerActivity()`/`handleBackfillMaintainerStats()` (`auth-worker/src/index.js`) and `fetchMaintainerStats()` (`web/my-vehicles.js`) to target it instead of the vehicle's own repo. Keep one file per vehicle, not one combined file, to avoid write contention (no retry-on-409 logic exists anywhere in this codebase). Small, mechanical change once someone's on it -- no new repo, no new App permission needed.

**Real trigger to reprioritize:** the credits-page idea above. Once merge/review counts get printed into an actual public manual instead of sitting on a dashboard, a padded number stops being cosmetic and becomes a permanent, public, false claim -- that's the point this stops being optional.

# Roadmap / open design problems

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

**Grouping by model name across generations, needed once the
generations-stay-separate-repos decision landed (2026-08-25).** Since
`suzuki-sv650-1999-2002` and `suzuki-sv650-2003-2010` are genuinely
separate repos with separate maintainer teams, a visitor searching
"SV650" needs to find both without the page implying they're the same
community. Search/filter should group by model name for discovery
(one search surfaces every generation's repo), while each row stays
its own vehicle_slug with its own stats, its own passive indicator,
and its own link -- grouped for *finding*, never merged into one row
or one stat. This is the piece that makes "generations stay separate"
cost nothing in practice: the separation is real underneath, but a
visitor never has to already know which generation they own before
they can find it.

**Wireframed in conversation, not yet built:** the redesigned patcher
landing page (hero, "what goes in / how, lightly / what comes out"
strip, reframed no-registry-match state walking through the 5 maintainer
setup steps, always-visible contribute teaser), the two-persona flow
above, and the registry browse page. All three are design-only.

## Vehicle-type scope, and Maintainer Guidance -- sequenced before more website work

**Real gap, raised directly: nothing states what's actually in scope.**
The whole design so far assumes "car/motorcycle/boat/truck manuals," but
that's never been written down as an explicit boundary, anywhere a
maintainer or a visitor would see it. Two things needed, kept distinct
from `CONTRIBUTING.md`'s lightweight contributor-facing quality bar:

- **A stated scope boundary**, enforced at the one point that actually
  gates new content entering the system: org-maintainer approval of a
  new vehicle. Ties directly into the source-content-verification work
  above -- `vehicle_class` should be checked against an accepted list at
  proposal time, not accepted as free text, the same spirit as requiring
  `source_identifier`.
- **Org-level maintainer guidance**, formalizing what currently only
  exists as instructions embedded in `propose_new_vehicle.py`'s PR body
  text (skim `section_heading`, check `source_identifier`, now also
  confirm scope fit) into an actual reference doc the org-level quorum
  can point to, not something they have to already know.
- **Per-repo maintainer guidance**, distinct from the org-level one --
  day-to-day photo review expectations for a specific vehicle's
  maintainer pool. `CONTRIBUTING.md`'s "What review looks like" section
  partially covers this today but is written for contributors, not
  maintainers; this elevates the "still genuinely open" maintainer-
  standards item from the Quality standards section above into real,
  sequenced work rather than a someday note.

**Explicit sequencing, stated by the project owner, not a scheduling
guess:** maintainer guidance gets nailed down first. Only after that's
solid does the website wireframe get revisited again, specifically to
verify it stays aligned with whatever guidance says, in plain language,
with real infographics showing what's actually happening rather than
prose alone. Building more website polish before this exists risks
having to rework it once real boundaries and expectations are written
down.

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

Explicit real milestone, not just "eventually." First manual pass done
2026-08-21 (see CHANGELOG.md v0.3.0): oversized-fetch caps, per-photo
error isolation in the browser patcher's patch loop, pinned + SRI'd
`@cantoo/pdf-lib`, and confirmation that `validate-photo.yml` triggers on
plain `pull_request` (not `pull_request_target`) so a forked PR's CI run
never gets repo secrets or a write token.

**Status as of 2026-08-24, stated plainly:** those 4 findings are closed
and verified, no known open holes in what's actually built. But that
review's scope was the browser patcher and registry fetch paths only --
everything designed since (the OAuth+proxy flow, the browser indexer
port, in-PDF links, multi-part manifests) is still design in this file,
not code, so none of it has been reviewed because there's nothing to
review yet. **A real review pass is owed once the OAuth proxy gets
built, before it's trusted** -- it's the first server-side component
this project takes on (holds a client secret, does token exchange and
refresh), a materially different risk category than anything reviewed
so far: CSRF `state` validation on the callback, where/how the refresh
token gets stored, and rate-limiting the proxy against abuse all need
real scrutiny, not assumed-safe-by-design the way the client-only pieces
have been so far.

**No stored credentials -- confirmed architectural property, raised and
reasoned through directly in design review 2026-08-24, worth recording
since it's a real finding, not just an assumption.** This project never
stores or proxies a GitHub token on the maintainer's behalf for any
write action (accepting/rejecting a photo request, approving a new
vehicle, managing a vehicle's maintainer roster). Every such action is
meant to call GitHub's API directly with the signed-in maintainer's OWN
token, whatever real access their own GitHub account actually has --
this project holds none of it. The practical consequence: **GitHub's own
permission system is the real authority, not any role/flag in this
app's client-side JS.** The portal's REPO/ORG badges, disabled buttons,
and tab visibility (`MOCK_MAINTAINER.reposmaintained`/`isOrgMaintainer`)
are UX conveniences, not a security boundary -- even a mis-shown enabled
button can't grant unauthorized access, since the underlying GitHub API
call would simply be refused (403) by GitHub itself for a token that
doesn't actually have that access. There is no path by which this app's
own UI state lets someone "escape" into a capability their real GitHub
account doesn't have, because this app was never the thing deciding
that in the first place -- `review-panel.js`'s repo-scope guard already
lives by this same logic (never trust a `repo_url` from a URL param,
always check it against the registry before acting on it).

**Update, 2026-08-26: this property is now real, not just a target.**
Real GitHub OAuth (auth.js), the real repo-scope-guarded review/approval
flows, and -- as of today -- real `GET/PUT/DELETE .../collaborators`
calls in `my-vehicles.js` (replacing `MOCK_MAINTAINER.reposmaintained`
with `discoverMaintainedRepos()`'s live `GET /user/repos` discovery)
mean every one of this app's role/capability signals is now backed by an
actual GitHub API call authenticated with the signed-in person's own
token, checked against the real registry and real GitHub permissions,
not a client-side flag. `MOCK_MAINTAINER.isOrgMaintainer` is the one
remaining mock flag (org-approval.js's tab-visibility convenience only
-- its actual Approve/Reject authority already goes through the Worker's
real org-admin check, per SECURITY.md); everything else described in
this section is live.

**The actual governance gate, worth naming explicitly: who gets GitHub
org membership / repo collaborator access in the first place.** This
app enforces nothing on its own -- the real boundary is entirely
GitHub's, which means the org's own member-invitation process (who gets
added to BlaydeManual, who gets added as a collaborator on a given
vehicle repo) IS the actual security control, not a detail to handle
carelessly later.

**"Org Team Membership" struck entirely, 2026-08-24 -- not pinned, not
built, decided against.** Originally floated as a future portal tab
(who gets to be on the org-level new-vehicle-approval quorum), then
reconsidered directly: since this app never holds its own credentials
and GitHub's own permissions are already the real authority (see
above), org membership management would just be re-building a worse
version of GitHub's own People/Teams page for a tiny, rarely-changing
group -- pure duplication with no real benefit. That responsibility
stays on GitHub directly, permanently, not "for now."

Remaining/ongoing items from the first pass:
- Untrusted fetched content (a malicious/corrupted "photo" from a
  compromised repo) reaching `embedJpg`/`embedPng`, or `PIL.Image.open`
  server-side in `checker.py` -- format validation now rejects anything
  that isn't a structurally real image, but a maliciously crafted *valid*
  image exploiting a parser bug (libjpeg/libpng/Pillow have had real CVEs
  historically) is a residual risk inherent to any system that processes
  untrusted image uploads, not something this project can uniquely solve.
  Mitigation is routine dependency updates (Pillow, `@cantoo/pdf-lib`),
  not a one-time fix -- worth a recurring "are these pinned versions
  still current" check, not just a pre-1.0.0 checkbox.
- Registry URL trust boundary -- the browser patcher now hardcodes the
  canonical registry URL by default specifically to close off a
  spoofing vector (tricking a user into pointing at a fake registry);
  worth confirming that holds once the advanced/override field is
  actually exposed to real users.
- Supply-chain: **corrected 2026-08-26** -- `@cantoo/pdf-lib` was checked
  directly against the live `web/index.html` and is already pinned to
  an exact version (`2.9.1`) with a verified SRI hash; this entry was
  stale, the gap it described was already closed and just never
  marked as such. `tesseract.js` is the real remaining gap: loaded via
  `@5`, a floating major-version tag rather than a pinned exact
  version, with no SRI hash. A compromised or malicious CDN release
  under that tag would run in every visitor's browser with no version
  pin or hash to catch it. Fix: pin the exact version (currently
  resolves to `5.1.1`), add SRI, or self-host, matching the pattern
  pdf-lib already uses.
- The `--live` paths in `propose_new_vehicle.py` / `approve_registry_entry.py`
  already use list-form `subprocess.run` (no shell injection surface),
  worth re-confirming once those paths actually get exercised for real.
- CI workflow permissions -- `validate-photo.yml` should keep an explicit
  minimal `permissions:` block (read-only) as it grows, rather than
  relying only on the `pull_request` trigger's default restriction; belt
  and suspenders once the workflow does more than run `checker.py`.

## Source-content verification -- can a maintainer tell a submission is real?

**The gap, raised directly in design review:** the registry deliberately
never stores the source PDF's actual pixels/text publicly (see LEGAL.md).
That's the right call for copyright, but it means an org maintainer
approving a *new vehicle* onboarding never sees what the manual actually
looks like -- nothing today stops someone from registering an unrelated
or fabricated PDF (a hypothetical "rooster collection PDF") under a false
`vehicle_display_name`/`vehicle_class`, since those fields are currently
self-reported by the submitter with no cross-check enforced.

**What already exists that helps, underused:** `indexer.py` OCRs real
`section_heading` text straight off the source PDF into the manifest as
part of `source_markers` -- this is evidence a submitter can't easily
fake at scale, since faking it convincingly requires actually having
matching real content to OCR from in the first place. A rooster-photo PDF
run through the real indexer would produce OCR gibberish or wildly
off-topic headings for whatever `vehicle_class` was claimed; a genuine
service manual produces headings that read like real procedures for that
vehicle class. This was real but implicit -- as of the v0.3.0 changes,
`propose_new_vehicle.py` now requires a non-empty `source_identifier` and
both its `--live` PR body and its local-mode printed instructions
explicitly tell maintainers to skim `section_heading` strings before
approving, so this is a stated step now, not something a maintainer has
to think to do on their own.

**Resolved, 2026-08-25 -- the core question actually has an answer
already, confirmed directly.** "Can a maintainer tell a submission is
real?" Yes: `org-approval.js`'s `orgPdfPicker` (built the same day as
the multi-manual work) lets the org reviewer pick their *own*
legally-owned copy of the claimed manual and renders real thumbnails
straight from it to compare against the submission -- the exact same
local-context-rule pattern already used everywhere else in this
project (photo review, the Contributor Portal's page compare). A
fabricated "rooster collection PDF" claiming to be a Ferrari Enzo
manual fails this immediately and visibly: the reviewer's own real PDF
simply won't match what's on screen. This isn't a new mechanism built
for this problem -- it's the same one, doing the same job, one level
up (org reviewing a manual submission instead of a maintainer
reviewing a photo submission).

**The one real limit, worth naming, not a blocker:** this only works
if the reviewing org maintainer happens to own a copy of that specific
manual. For an obscure vehicle, no single quorum member might. That's
an acceptable gap, not a gap in the mechanism -- it's the same
constraint every other role in this project already accepts (nobody's
expected to own everything), and the community itself is the backstop:
someone flags it if a "verified" submission turns out fabricated,
using the same removal/override authority already established for bad
-faith maintainers.

**Still real, still open, but smaller now -- a lighter-weight fallback
for the "nobody on the quorum happens to own a copy" case:** a
lightweight automated plausibility flag -- not a hard gate, consistent
with the "human review is the real gate, automation assists" pattern
used elsewhere -- e.g. a keyword-overlap heuristic that warns (doesn't
block) when `section_heading` text has near-zero overlap with
`vehicle_class`'s expected vocabulary, surfaced as "worth a closer
look." Also still open: whether the mandatory `source_identifier` link
should get a live-reachability check at proposal time, vs. staying a
free-text field a maintainer manually spot-checks. Neither is a
pre-1.0.0 blocker anymore -- the core verification question is
answered; these are refinements on top of an already-real mechanism.

This is explicitly *not* solved by requiring the actual source PDF be
shared with maintainers even privately/out-of-band -- that would
reintroduce exactly the copyrighted-content-exposure risk the whole
architecture is built to avoid, just moved to a smaller audience
instead of eliminated.

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

## Mosaic zone templates per vehicle class (currently motorcycle-only)

**The problem:** `mosaic.py`'s `ZONES` (5 hardcoded rectangles positioned
to match a motorcycle's two-wheel side-profile) and `ZONE_KEYWORDS`
(motorcycle service vocabulary -- swingarm, carburetor, tappet) are not
actually vehicle-agnostic, even though `stylize.py`'s edge/body extraction
genuinely is. Point this at a car manual today and `stylize.py` still
produces a clean outline of the car, but the zone-fill logic scatters
tiles onto nonsensical regions -- a car's silhouette has four wheels at
the corners, an engine bay only up front, and a large cabin/interior
region that doesn't exist on a bike at all. First real test case: a car
manual, whenever that gets added.

**The fix, scoped right:** neither per-vehicle tuning (doesn't scale --
O(every model)) nor one universal layout (doesn't work, per above). A
small library of per-vehicle-class templates instead --
`templates/motorcycle.json`, `templates/car.json`, `templates/boat.json`,
etc. -- each defining its own zone rectangles + keyword vocabulary,
selected by a `vehicle_class` field. That field is already implied by the
generic-silhouette-fallback idea in the photomosaic section above, so this
reuses the same piece of registry metadata rather than inventing a new
one. Cost is O(number of vehicle classes that ever get added) -- realistically
a handful of templates, ever -- not O(number of vehicles), which is the
actual scaling question. Once this layer exists, "commit a hero image,
zero other input, it just works" becomes true for any vehicle in an
already-templated class, not just motorcycles.

**What ships without it, honestly:** today, the mosaic feature should be
treated as motorcycle-only. Either gate it off for non-motorcycle vehicle
repos until a template exists, or ship the flat outline (no zone-based
fill logic at all) as a class-agnostic fallback -- outline-only still
looks good and is 100% generic; it's specifically the *tile-fill-by-zone*
mechanic that isn't.

**`vehicle_class` connects to a second consumer, confirmed 2026-08-25 --
one field, not two.** Raised directly: is `vehicle_class`
(motorcycle/car/truck/plane/boat) load-bearing anywhere else, and does
it need its own hierarchy tier? Answer: it's already required for the
mosaic template selection above, and it's *also* exactly the "type" the
still-unbuilt registry browse page's filter design already names
("filterable list (type/make/model)," logged earlier in this file) --
that was gesturing at the same field without either section naming it
explicitly as the same one. One `vehicle_class` field on each registry
entry serves both: mosaic template selection and registry-browse
filtering, not two separate fields invented independently. **Flat, not
hierarchical** -- unlike `edition_id` (which needed a real tier, since
editions share coordinate data, maintainer authority, and a repo),
`vehicle_class` doesn't need structural nesting anywhere. A motorcycle
and a car never share a repo, and there's no cross-class content-
sharing use case the way cross-edition sharing was -- it's a filterable
attribute on each vehicle_slug entry, not a path segment or a
governance boundary. Queued for whenever the mosaic-template work or
the registry browse page actually gets built, not designed further
here.

## Zero-install browser-based patcher ("ESPHome Web flasher" model)

**Status: built.** This is no longer a proposal -- `web/index.html` +
`web/patcher.js` + `web/registry.js` are exactly this, live: pick a
PDF, it identifies and checks it client-side, pulls the manifest +
approved photos, patches entirely in-browser, nothing uploaded, nothing
installed. Leaving the original idea below as the design record for
*why* it's built this way, not as an open item.

**The idea:** ESPHome's web flasher does the whole flash-a-device flow
entirely in-browser via WebSerial -- no install, pick a file, done. Same
shape fits here: instead of "download patch_pdf.py, run it locally,"
a web page where you pick your PDF, it fingerprints and recognizes it
client-side, pulls the manifest + approved photos from the vehicle repo,
and patches the PDF entirely in-browser -- download the result, nothing
ever uploaded, nothing installed. This is the natural end-state of the
"web app, not native app" decision made earlier in the project.

**Feasibility:** genuinely buildable, not hand-wavy -- `pdf-lib.js` (or
similar WASM-backed PDF library) can open a PDF, embed/replace images,
and re-save, all client-side, no server round-trip of the user's file.
The real cost is that `patch_pdf.py`'s coordinate math, embedded-state
read/write, and cover-page rendering all need a JS port -- a real rewrite,
not a wrapper. Worth doing once the Python version's behavior (including
the incremental re-patch logic) is fully proven and stable, so there's a
known-correct reference implementation to port against rather than
designing both at once.

## Browser-based indexer port -- Persona A's real prerequisite

**Decided, 2026-08-23: pure browser, no local install, full stop.** This
isn't a default picked for lack of a better option -- it's the actual
goal. "Nothing to download, ever" is the non-negotiable part of this
project's identity, the same principle behind the patcher and every
other zero-install decision already made. What's genuinely still open is
everything *around* that constraint: worker-count scaling, exact timing,
whether onboarding needs a resumable/backgroundable indexing step -- all
fair game to tune once this is actually built and used for real. If
indexing turns out to be too painful in practice even after tuning, the
conversation to have then is about *making the browser path faster or
smarter*, not about reopening a local-install fallback -- the one-time
nature of indexing (it happens once per new vehicle, not per patch, not
per contribution) is exactly why this pain is worth absorbing here rather
than pushing it onto casual contributors elsewhere in the system.

**Why this is its own milestone, not a line in the onboarding form.**
Persona A's onboarding wireframe (step 4, "add a few details") assumed a
`manifest.json` already exists. It doesn't, the first time -- someone has
to actually index the PDF, and `indexer.py` today is a local Python CLI
(PyMuPDF + Tesseract), not something that runs in a browser at all.
Considered and rejected: asking Persona A to install Python locally as a
one-time step. Rejected specifically because they don't retain ownership
of the result -- it becomes a community-managed repo the moment it's
approved -- so asking for local-software friction in exchange for a
custodial role, not personal ownership, is a worse trade than it looks.
The browser port is the real answer.

**Feasibility, weighed rather than assumed:** no primitive is missing.
PDF.js renders pages to canvas (figure-detection density math is just
`getImageData()` + the same threshold logic already proven in Python) and
exposes text-layer content for non-scanned PDFs, matching what PyMuPDF
gives today. Tesseract.js is a real, long-established WASM OCR port, not
experimental, runs in a Web Worker so it doesn't block the page. Two real
costs, not glossed over:
- **Every heuristic gets re-implemented, not translated** -- the heading-
  classification logic, density thresholds, and the strip-stitching fix
  already found once in Python all need re-proving against a different
  API shape.

  **Correction, 2026-08-24: the right bar is "reasonable starting point
  a human can correct," not "matches patch_pdf.py's exact output."**
  First attempt at this chased pixel-identical coordinates against the
  Python reference and found a real mismatch (different band count,
  ~6% different extents) -- traceable to `stitch_page()` manually
  concatenating raster strips (removing inter-strip gaps) versus PDF.js's
  `page.render()` rendering the full page as laid out, two genuinely
  different rasterization pipelines with no reason to agree pixel-for-
  pixel. That chase was solving a problem the architecture doesn't
  actually have: every submission already goes through human review
  before it's ever registered, and the crop-editing tools (move, resize,
  add, delete) built earlier this session mean a rough detection is
  fully correctable in seconds. Verified visually instead (page 40's
  real photo, overlaid on the actual rendered page): the detected box
  lands tightly and accurately on the real figure. The one false
  positive found (dense body text flagged as a candidate) is the same
  class of error the *Python* detector already makes -- not a JS-
  specific regression, and exactly what the review tools exist to catch.
  Byte-for-byte matching only mattered for the patcher (no human ever
  reviews a single patch run before it downloads), not here.
- **Performance is a different kind of problem, not a detail.** OCR
  across a several-hundred-page manual is plausibly 15-30+ minutes of
  continuous client-side processing, nothing like the patcher's few
  seconds. Needs real per-page progress ("indexing page 142 of 380"),
  and likely needs to be resumable rather than requiring one unbroken
  sitting -- a materially bigger UX problem than the existing progress
  bar, worth designing deliberately rather than assuming it'll be fine.

**OCR heading port verified 2026-08-24, same corrected bar.** Ported
`ocr_headings()`'s heuristic to JS against Tesseract.js on the same real
page as the figure-detection check above: the real section headings
("2-10 PERIODIC MAINTENANCE," "TAPPET CLEARANCE ADJUSTMENT," "NOTE:")
all came through correctly. One real miss ("A CAUTION" wasn't caught)
and some OCR noise from diagram content read as garbled text -- but
Python's own version has the same class of noise (it flags plain body
sentences as headings too), so this isn't a JS-specific regression,
same conclusion as the figure detector. 4.1s for this one page, tracking
with the earlier full-manual timing spike. Both core detection pieces of
the indexer port are now verified fit for purpose; remaining work is
wiring detected figures + headings into a real manifest.json-shaped
output and the per-page progress UI already scoped above.

**Wired into a real pipeline 2026-08-24** (`web/indexer.html` /
`indexer-core.js` / `indexer-ui.js`) -- produces schema-correct
`manifest.json` output, verified against real pages.

**Full 415-page run attempted, aborted per instruction ("if it looks
like longer than 5 minutes, abort and reassess"), and it does.** The
current pipeline is sequential -- the worker-parallelism proven in the
2026-08-23 spike below was never wired into the real `indexPdf()`, it
was only ever an isolated proof. Measured two real progress samples on
the actual full run: 28 pages in 31.6s, then 45 pages in 83.8s -- the
*interval* rate between those samples (17 pages in 52.2s, ~3.07s/page)
is far more representative than the first reading, since early front-
matter pages are unusually sparse. Extrapolated: **~21 minutes for the
full manual**, consistent with the 2026-08-23 spike's own sequential
estimate (~26 min) -- the two independent measurements agree, which is
reassuring about the estimate even though the result itself is bad.
**Conclusion: parallelism isn't optional polish, it's required to hit
the 5-minute target** -- the concrete next step is wiring the already-
proven 8-worker-pool approach into `indexPdf()` itself, scaled to
`navigator.hardwareConcurrency` as already specced above, not building
it from scratch.

**Resumability spike, 2026-08-24 -- market research + a real IndexedDB
test, not just an idea.** Full-manual timing is real (see above), still
a multi-minute one-time cost even parallelized, and it requires the tab
to stay open. Researched whether that's acceptable at this stage rather
than assuming: a real technical finding first -- Web Workers are exempt
from Chrome's background-tab throttling (only the main thread gets
clamped), so since all the OCR work runs in Tesseract.js workers,
indexing keeps running at full speed even if the tab is backgrounded.
The actual constraint is "don't close the tab," not "keep it focused" --
softer than it first looked. General UX research on wait tolerance
(9s abandonment without a progress indicator, ~22.6s with one) doesn't
map cleanly onto this case -- Persona A is a self-selected, invested
user doing a known one-time technical setup, closer to the "npm install"
context (where the real pain point research surfaced was a process
*looking frozen*, not duration itself) than a casual consumer flow.
Conclusion: acceptable at this stage, conditioned on (a) stating a real,
data-backed time estimate in the UI up front, not a guess -- which is
exactly why the indexing-telemetry feature logged above matters, and
(b) making the operation resumable across a closed/crashed tab, not
just tolerant of a backgrounded one.

Considered git-incremental-commit checkpointing first, since Persona A
is already authenticated and about to push a real repo anyway -- rejected
for intermediate checkpoints specifically: a network round-trip per
checkpoint slows the actual hot loop, needs a checkpoint-interval
tradeoff (415 pages is either too many commits or too coarse an
interval), and depends on a real repo already existing, which may not
be true yet depending on onboarding sequencing. IndexedDB avoids all
three for the common case (this tab crashed or got closed, same
device) at the cost of not surviving a switch to a different device --
git remains what it already is, the mechanism for pushing the
*finished* manifest once, not a running checkpoint log.

Spiked IndexedDB directly rather than estimating the lift: opening a DB
is a ~17ms one-time cost; writing 50 real-shaped page-checkpoint records
took 1.2ms total (~24us/page); reading them all back to compute what's
already done took 0.6ms; a resume check correctly identified 50 done /
10 remaining out of 60. Against OCR's 0.3-3s per page, this overhead is
functionally free. **Conclusion: a light lift, not a heavy one** --
roughly 40-60 lines added to the existing worker loop (write each page's
result to IndexedDB as it completes, check for an incomplete job at
start and only enqueue what's missing, offer resume-vs-fresh-start on
load, clear records on successful completion), no new dependencies, no
architecture change. Scoped and ready to build whenever prioritized.

**Where it actually lives, precisely:** not the browser's HTTP/network
cache -- IndexedDB is a separate, persistent, on-disk database, scoped
per-origin (only the indexer's own domain can read it). Survives a
closed tab or browser restart, which is the case this exists for. Real
limits worth stating in the UI copy when this ships: a user manually
clearing site data for that domain wipes it, private/incognito clears it
on session end, and severe device storage pressure can in principle
evict it (mitigated by requesting persistent storage via
`navigator.storage.persist()`, not guaranteed). Same device-bound
limitation as already noted above versus git -- this is "resumable if
this browser stays as-is," not a backup.

**Confirmed, 2026-08-24: this stays fully in-browser, no manual
downloading or cleanup, checked against the design rather than assumed.**
Writes/reads/cleanup are all automatic; the only user-facing interaction
is a single resume-vs-fresh-start choice, shown only when an incomplete
job actually exists -- a decision, not file management. Worth flagging
precisely: today's `web/indexer-ui.js` test harness has a manual
"Download manifest.json" button, but that's a convenience for this
standalone spike tool, not the intended real flow -- the actual Persona A
onboarding design pushes the finished manifest straight to GitHub via
the API as part of repo creation, no download or manual re-upload step
at any point.

**Feasibility spike run 2026-08-23, real numbers, not estimates.**
Extracted 8 real pages (300 DPI) from the project's actual 415-page test
manual (`local_pdfs/ServiceManual.pdf`), ran Tesseract.js 5 against them
in a browser via a local test harness. Sequential: ~26 min extrapolated
for all 415 pages, confirming the estimate above. Parallel (8 concurrent
Web Worker instances): 5.3s wall-clock for the 8-page batch, ~4.6 min
extrapolated for the full manual -- under the 5-minute target. Real
caveats, not glossed over:
- Ran on one dev machine; observed speedup was 5.6x, not the naive 8x,
  from CPU contention -- a weaker or lower-core device would see less
  speedup and a longer real time.
- 8 sample pages isn't the full 415; page content varies (dense text vs.
  mostly diagrams) enough that the true average could shift either way.
- Measures OCR only -- doesn't include PDF.js page-rendering or the
  figure-detection density pass layered on top of it.
- Worker count was hardcoded at 8 for the test; the real version must
  scale to `navigator.hardwareConcurrency` so a 4-core device gets 4
  workers, not 8 contending for 4 cores.

**Conclusion: the target is achievable, not just hoped-for, but "4.6 min
on this machine" isn't "under 5 min for everyone."** Build worker-count
scaling in from the start, and treat the 5-minute figure as a design
target communicated as a live estimate in the UI ("about 4 minutes
left"), not a fixed promise -- a promise breaks the first time it runs on
someone's older laptop; an honest live estimate doesn't.

## Python inventory -- what's still local-only, and what ships where

**Full inventory, checked against the actual files, not memory.**

Fully superseded by a working browser equivalent already:
- `fetch_repo.py` -> `web/registry.js`'s `fetchManifestAndPhotos`

Superseded for the real end-user flow, but still load-bearing as the
proven reference the browser version was verified against -- not safe
to archive yet, archiving it would remove the thing future changes get
checked against:
- `patch_pdf.py` -> `web/patcher.js` (byte-for-byte verified against it
  once; keep until there's less reason to re-verify)

In progress, this session:
- `indexer.py` -> browser port underway (figure detection visually
  verified above; OCR next)

Planned but not started -- real remaining work, not prototyping debt:
- `mosaic.py` / `stylize.py` -> confirmed still needed: `patcher.js`'s
  cover page is explicitly text/stats only today (see its own comment,
  "Not yet ported: the photomosaic and stylization filter")
- `init_repo.py` -> needs a browser equivalent (create-repo + push-
  scaffold via the GitHub API) for Persona A's onboarding to be real
- `propose_new_vehicle.py` / `approve_registry_entry.py` /
  `check_registry.py` -> the registry *write* side (propose/approve)
  has no browser equivalent yet; only reads are ported
- `generate_review.py` / `review_server.py` -> `web/review.html` is
  meant to replace this (started this session), not finished

Not "porting candidates" at all -- these exist only because the current
Python workflow uses local JSON side-files that need a manual fold-in
step. A browser-based review flow (writing straight to a repo via the
GitHub API) has no equivalent step to port; it just won't exist:
- `apply_exclusions.py`, `apply_additions.py`, `apply_bbox_edits.py`,
  `add_page_geometry.py`

**Correction, 2026-08-24: `checker.py` was overstated as a permanent
CI-only trust boundary -- pushed back on directly, and the pushback is
right.** The strongest reason to keep a server-side copy was privacy: a
submitted photo's EXIF GPS data becomes technically public the moment
it's pushed to a branch, whether or not the PR ever merges. But a CI
check runs *after* that push -- it can catch the problem, it can't undo
an already-public leak. The check that actually matters is client-side,
*before* the upload function ever calls the GitHub API to commit the
file: validate, strip EXIF, then commit -- not commit, then hope CI
catches it in time. That reframes this from "must stay Python/CI" to
"the load-bearing copy belongs in the upload function itself." Whether
a secondary CI-side copy is still worth keeping (defense-in-depth
against someone bypassing the tool entirely via raw git/`gh`) is a real
but smaller, secondary question -- deliberately deferred to when the
actual upload/contribution function gets built, where the validate ->
strip -> commit ordering is a concrete design detail, not an abstract one.

**On not uploading the Python to the real repos -- mostly yes, one
correction.** Worth being precise about *which* repo, since "the git
repo" isn't one thing: the Python tools were never architecturally
meant to live inside a vehicle repo or the registry repo (they build
those repos' contents, they don't ship alongside them) -- so that part
of the instinct was never really in question. The real question is
whether *this toolchain repo* excludes Python once superseded. Given
the project's own AGPL/transparency values (and this ledger's whole
premise -- showing the real process, not a cleaned-up version of it), I'd
push back gently on excluding it entirely: keep it, organized into a
clearly-labeled folder (e.g. `legacy-python/`) with a short README
explaining "prototyped here, proven, then ported" once each piece is
actually superseded -- not deleted, not hidden, just organized. `checker.py`
is the one file that should never move there, since it stays live.
**Nothing is actually ready to move yet** -- per the inventory above,
only `fetch_repo.py` is fully redundant today; everything else is either
still in active local use this session or not yet ported. Archiving
happens incrementally as each real port lands and gets verified, not as
one batch move now.

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

**Data side, trivial:** a `language` field on the registry entry --
it's a property of a specific edition/scan (a language-localized OEM
manual is functionally its own edition), not the vehicle, so it sits
next to `edition_id`, not `vehicle_slug`.

**UI side, real but genuinely bounded** -- confirmed in review: this
project's user-touched surface is small by design (landing page,
onboarding, the contribute flow, the FAQ), since the whole point is
"just pictures, nothing else matters." Worth a real i18n pass before
non-English rollout, but not a sprawling effort given how few screens
exist. One distinction worth keeping when that work happens: casual UI
copy is low-stakes to machine-translate and iterate on, but the CC-BY
licensing/consent language in `CONTRIBUTING.md` is exactly the kind of
text where a mistranslation could misrepresent what someone's actually
agreeing to -- that piece specifically needs native-speaker review, not
just a translation pass.

**Local-only contributions, with real identity.** Today, local-only
patching already works with zero GitHub interaction at all -- name a file
`<procedure_id>__by_<username>.jpg`, run `patch_pdf.py`, done, nothing
ever leaves the machine. The web app should keep that same freedom but
add one thing the CLI can't: require actual GitHub auth even for
local-only use, so `@username` is a verified identity rather than
self-typed text, with an explicit choice surfaced right after auth --
"push this to share with the community" vs. "keep this on my device
only." Someone who only wants their own bike's photos in their own copy
never has to push anything; someone who authenticated can still trivially
upgrade a local-only contribution into a real PR later without re-doing
the tagging, since the identity was already real the whole time.

**Phone-side contribution auth, without any backend at all.** Considered
during design: could a contributor's existing github.com browser session
(they're already logged in) just be reused directly? No -- browsers
isolate cookies per-origin (same-origin policy), so a third-party app's
JavaScript can never read github.com's session cookie; that's a load-
bearing web security boundary, not a GitHub-specific gap. Two real paths
forward, worth weighing against each other rather than picking blind:
- **Self-service fine-grained Personal Access Token**: the contributor
  generates their own token in GitHub's own settings (scoped to one repo,
  "contents: write" only, with an expiration), pastes it into the app
  once, stored locally on their device from then on. Genuinely zero
  infrastructure -- not even a stateless proxy function. Tradeoff:
  clunkier one-time setup than a polished login button.
- **OAuth + a tiny stateless serverless proxy**: GitHub doesn't support
  PKCE, so a public client (a phone browser) can't complete OAuth alone --
  some server has to hold the token exchange. The proven pattern for this
  (see Decap CMS / git-gateway) is a small always-on serverless function
  (Cloudflare Worker, Vercel Edge Function) that does *only* the token
  exchange; every actual git operation after that happens straight from
  the phone via GitHub's REST API. This is not "a live PC someone keeps
  on" -- it's managed cloud infra nobody babysits -- but it is a real
  piece of infrastructure to build and keep running, unlike the PAT path.

**Reversed in design review, 2026-08-23: OAuth+proxy is the call for
casual contributors, not PAT.** The PAT path requires generating a
fine-grained token scoped to "All repositories" under your own account
(so it covers a fork that doesn't exist yet) with three specific write
permissions (Administration, Contents, Pull requests) -- a developer-
grade ritual no mainstream consumer photo-upload flow asks for (checked:
Wikimedia Commons, iNaturalist, Reddit all use one-click OAuth, not
manual token generation). Now that "scan a QR code, take a photo, done"
is a stated core feature rather than a later nice-to-have, that friction
is disqualifying for the casual/anonymous persona. Verified against
GitHub's own docs: OAuth's `public_repo` scope alone covers fork + push +
commit + PR for public repos -- simpler than the PAT's three permissions,
not just smoother UX. The one real cost is genuine: a small always-on
serverless function (Cloudflare Worker or equivalent) to do the token
exchange, since GitHub OAuth has no PKCE support for public clients --
this is the one piece of real infrastructure the project takes on.
**Resolved, 2026-08-23: PAT is dropped entirely, OAuth+proxy for both
personas.** The only reason PAT was ever attractive was avoiding a
backend -- but Persona B already forces the proxy to exist. Once it does,
PAT buys nothing further, it would just mean maintaining two separate
auth code paths for a strictly worse UX. Verified against GitHub's docs:
`public_repo` also covers `POST /user/repos` (creating the new vehicle
repo itself), the same single scope already confirmed for fork/push/PR
-- so the one OAuth flow above, unmodified, covers Persona A's onboarding
too, no separate auth path needed at all.

**The OAuth handshake, specced:** "Sign in with GitHub" appears only at
the moment of contributing (never before) → browser redirects to
`github.com/login/oauth/authorize` with `scope=public_repo` and a CSRF
`state` → user approves on GitHub's real consent screen → GitHub
redirects back with a `code` → browser sends `code` to the one proxy
function → proxy exchanges `code` + the client secret for an access
token server-side (the only place the secret ever exists) → token
returned to the browser, stored, used directly for every subsequent
fork/commit/PR call.

**Resolved, 2026-08-23: enable expiring tokens.** Checked GitHub's docs
directly rather than guess at durations -- the lifetimes aren't
configurable, they're fixed: an 8-hour access token and a 6-month refresh
token, with silent refresh in between (the proxy exchanges the refresh
token for a new pair without the user seeing anything). Net effect: an
occasional contributor never sees a repeat sign-in prompt at all -- it
only resurfaces after six full months of *no* activity, which beats a
literal weekly prompt while still capping a leaked access token's
usefulness to 8 hours. Correction to the flow above: the proxy isn't
touched exactly once per sign-in after all -- it needs a second, equally
small endpoint (refresh_token → new token pair, same shape as the first,
still the only place the client secret exists) to make the silent
refresh work.

**Four-tier contributor ladder, settled in the same review, replacing
the earlier binary "local-only vs. real PR" framing:**
1. **Anonymous** -- no account, ever. Photo saved and patched locally,
   data lives on their device alone. Doesn't solve durability on its
   own -- the "resync later" plan is just: they still have the file,
   and can run it through tier 2 or 3 whenever they're ready, same as
   starting fresh. Nothing is destroyed by local patching, so nothing
   needs a special resync mechanism.
2. **Hidden contributor** -- signs in once (the OAuth flow above), which
   creates/uses their own fork; the photo commits to a branch there.
   This is the tier that actually solves durability -- reachable from any
   device by signing in again, unlike tier 1. Naming correction, worth
   getting right in the actual UI copy: a fork of a public repo is itself
   public on GitHub -- there's no real access control here, so call this
   tier "unlisted" or "not yet shared," not "private." Nothing points at
   it, but it isn't cryptographically hidden.
3. **Credited contributor** -- same fork, same branch, same photo, no
   new upload -- the only new action is opening the PR against the
   vehicle repo. This is the point they become visible and credited.
4. **Maintainer** -- contributes their own photos exactly like tier 3, no
   shortcut ("even maintainers have to contribute like contributors" --
   confirmed, this is a deliberate non-special-case). The only addition
   is review-panel access: merge or close *other people's* PRs on repos
   they maintain, via the separate generic review app already scoped
   above.

**Confirmed, 2026-08-24: a maintainer can never approve their own
contribution -- PR author and approver must always be different
people.** Real, hard consequence worth stating plainly rather than
discovering later: a *solo* maintainer is structurally stuck the moment
they try to contribute their own photo -- it sits unapproved until a
second maintainer exists. That's not a small print detail, it needs to
be part of the onboarding gate (see "Read and agree" below), not a
surprise. Not yet enforced anywhere -- the review panel is still mock
data, so this needs a real check (PR author != approver) once it's
wired to the actual GitHub API.

**Pinned, 2026-08-24: a "Read and agree to Maintainer Expectations"
checkbox gates onboarding, explicitly non-binding, before indexing
starts.** Not a legal document -- a plain-language confirmation that the
person understands three things before they commit to being first
maintainer: (1) the self-approval rule above, and that finding a
co-maintainer isn't optional busywork, it's required before their own
contributions can ever be merged; (2) the photo quality bar (already
written, `CONTRIBUTING.md`'s quality bar -- linked, not restated); (3)
Initial Submission Standards, below.

**Pinned, 2026-08-24: Initial Submission Standards, with a concrete
completeness signal, not a vague "try your best."** Raised directly:
"it's a first pass, doesn't need to be perfect" cannot mean "submit
whatever the raw detector produced, untouched" -- the org quorum's
light review needs *something* concrete to check, not blind trust. The
cheap, real signal: track how many auto-detected candidates were
actually touched (omitted, deleted, or edited) before submission. Shown
to the submitter as a self-check before they submit ("you've reviewed
4% of 916 candidates, are you sure?" -- a soft nudge, not a hard block,
consistent with "doesn't need to be perfect") and shown to the org
reviewers alongside the submission as the actual thing their light
review looks at. Build this into the review step itself as a natural
byproduct of the omit/delete/edit interactions already being ported
there, not bolted on separately afterward.

**Resolved, 2026-08-24: Stage 3's review step is delete-only, no omit,
and the full reasoning is worth keeping since it took three passes to
land.** (1) First instinct: carry over the local Python review tool's
omit/delete split (omit = soft, reversible, tracked with a reason;
delete = permanent, git-recoverable) unchanged. (2) Caught that this was
wrong: git-recoverability doesn't apply at Stage 3, nothing is committed
yet, so re-scoped to "keep omit for review-session decluttering,
recommend dropping delete." (3) Corrected directly: that reasoning had
it backwards for the real risk -- an *omitted* false positive (something
that will never be a real photo opportunity) was only excluded from the
review UI's display, nothing guaranteed it was actually stripped before
a real submission. A body-text false positive left in the shipped
manifest forever would permanently skew that vehicle's completion stat
and waste a future contributor's time hunting for a photo that was never
real. Tried a middle position (omit means "flag as uncertain for
reviewer attention," still submitted, not hidden) -- **rejected outright**:
still skews the numbers, and a permanently-blank, can't-ever-be-filled
procedure sitting in a live manifest is confusing to contributors
regardless of whether a human meant to flag it or not. **Final call:
delete or don't, nothing in between.** If a candidate is real, it stays,
full stop. If it's not, it's gone, full stop -- no third state that
quietly ships confusion into the product's real data. `generate_review.py`'s
local Python tool still has the old omit/exclusions.json mechanism --
it's on the same path to being fully superseded as everything else
Python (see the Python inventory above), not a permanent parallel
design, so it should get this same delete-only treatment eventually, not
kept as a deliberately different system. Not done in the same pass as
the browser-side fix -- logged as real, scoped follow-up work, not
forgotten.

**QR codes are a cross-device bridge, not a same-device mechanic.** A QR
code only does something useful when it's carrying you *from* the device
you're reading on *to* your phone's camera -- reading the manual on a
desktop or a garage-mounted tablet and scanning with your phone makes
sense; scanning a QR shown on your own phone's screen with that same
phone doesn't, there's no bridge to make. If the manual's being read on
the phone itself, the contribute action should just be a direct tap, no
QR involved.

**Clickable links are required, not optional, once professional-camera
contributors are a real persona.** Raised directly in review: someone
shooting with a real camera has the photo on their computer, not their
phone -- the QR-to-phone-camera flow doesn't reach them at all, so the
desktop path has to actually work, not just exist as a fallback. Three
layers, in order of how proven each is:
1. **Printed URL as visible text.** Most mainstream readers (Acrobat,
   Preview, Chrome's built-in viewer, most mobile apps) auto-detect and
   hyperlink plain URL-looking text with no special PDF object needed --
   `patcher.js` already draws text on pages, so this needs no new
   capability. Degrades gracefully even where auto-linking doesn't
   happen: worst case, it's still readable and typeable.
2. **QR code**, for the cross-device case above -- already just another
   drawn image, same `drawImageAt` pipeline used for photos.
3. **A true PDF link annotation**, for readers that support clicking but
   don't auto-linkify plain text. Real implementation risk, unverified --
   `@cantoo/pdf-lib` has no documented high-level API for it; possible via
   low-level manual construction of a `/Annots` link dictionary, a known
   community workaround, not first-class. Treat as an enhancement once
   layers 1-2 ship, not a blocker -- and validate all three with a real
   test PDF opened in 2-3 actual readers before considering this settled.

**Session-scoped completion checklist -- the actual UX gap worth solving.**
Real pain point raised in design: contributing several photos in one
session (Engine Pic 1, then 2, then 4 -- wait, did I do 3 yet?) with no
way to see where you left off. Fix: the landing page a QR/tap opens
shouldn't scope to a single `procedure_id` in isolation -- it should scope
to the whole *section* that figure belongs to (the same section grouping
`indexer.py` already extracts from OCR'd headings), and show a live
checklist of every figure in that section with what's already
captured this session checked off. This is really just a UI layer over
the same local contribution queue described above (IndexedDB-stored,
pre-push) filtered to "everything in this section" instead of one
procedure at a time -- the data already needs to exist for the local-only
flow, this is mostly a matter of scoping what's displayed, not new
storage or new sync logic.

## Cover page photomosaic progress indicator

**The idea:** the cover page's completion stat ("2/911 photos contributed")
becomes a literal photomosaic instead of a number. A target image is
divided into tiles; each tile corresponds to one `procedure_id`. An
unfilled tile shows a stock-color placeholder; a filled tile shows a
small color-matched crop of that procedure's actual contributed photo.
Overall completion % is just "how many tiles are real photos vs.
placeholder" -- so the cover art itself visibly resolves into focus as
the manual fills in. Tile *position* in the mosaic isn't a raster grid --
it's mapped to the procedure's approximate physical location on the
vehicle (engine-area procedures cluster where the engine is in the target
image, wheel procedures cluster at the wheel, etc.), so the completed
mosaic is spatially meaningful, not just visually neat.

**The catch, and why it matters more than usual:** the natural instinct is
to target Suzuki's actual OEM cover/press photo. Don't. Every other
copyright question in this project is about *structure* (page numbers,
figure locations) which is a comfortable distance from the original
creative work. This one is different -- the explicit design goal is
visual recognizability of a *specific* copyrighted photo, reassembled from
tiles. Photomosaics of copyrighted images have actually been litigated on
exactly this basis; small transformed tiles don't save you if the
assembled whole is still substantially similar to the original. See
LEGAL.md for the general framing -- this feature is the sharpest edge case
so far, worth flagging explicitly rather than assuming the same reasoning
that covers the manifest also covers this.

**The fix costs nothing:** target an *original* image made for Blayde
Manual itself -- a stylized red/black/steel silhouette/line-art bike,
not a reskin of Suzuki's marketing photo. Same mechanic, same payoff
(the cover art still resolves into focus as the community contributes),
zero copyright exposure, and it ends up more on-brand anyway -- it becomes
Blayde Manual's own mark rather than someone else's photo wearing a
costume.

**Scaling the target image across many vehicles:** hand-drawing a
silhouette per vehicle doesn't scale. Better: a "stylization filter" --
ours, original, house-style (edge-detect / posterize / recolor into the
red-black-steel palette) -- applied to a **community-contributed photo**,
not an OEM one. Day one, before any photo exists for a given vehicle, fall
back to a generic parametric silhouette by vehicle class (sportbike,
cruiser, dirt bike, etc.). Once a contributor's photo is accepted as that
vehicle's "hero shot," run it through the filter to generate a bespoke
mosaic target for that specific model, replacing the generic fallback.
Every image in that chain is either fully original (the filter) or
CC-BY-licensed community content -- nothing OEM enters the pipeline at any
point, so the same clean legal footing holds at any scale.

**What's needed to build it:**
- The stylization filter itself (original, ours) + the generic per-class
  fallback silhouettes
- A region map (which pixel regions correspond to which physical area of
  the vehicle -- engine, wheels, chassis, etc.), likely re-derivable
  automatically from the same filter pass rather than hand-authored per
  vehicle
- A `procedure_id` -> physical-region tag, likely inferred from the
  manual's own chapter/section structure (a "Chassis" chapter's figures
  map to the wheel/frame region, an "Engine" chapter's figures map to the
  engine region) with manual override for edge cases
- Tile rendering at patch/generate time: crop + color-match each
  contributed photo into its tile's slot in the mosaic, blend the
  remaining tiles from the stock placeholder palette
- This is squarely a `patch_pdf.py` / cover-page-generation extension,
  same PyMuPDF vector/image drawing path already used for the current
  cover page -- the hard part is the region-mapping data, not the
  rendering.

## Per-photo "show me the original" toggle

**Proposed, not built -- reviewed for fit against the existing
architecture per an explicit ask not to break what's already working.**
The idea: let someone see the original OEM page for a specific
procedure even after patching, on a per-photo basis, in case they want
to compare or just don't trust a given contribution.

Two ways to do it, weighed rather than defaulted to the first idea:
- **Regenerate with exclusions (recommended for v1).** Deselect specific
  procedures before patching, so those pages are simply never overlaid
  -- whatever the original PDF already had renders untouched. Zero new
  technical risk: this is the existing idempotent re-patch machinery,
  unchanged, with a smaller selection. The cost is UX shape, not risk --
  it's a regenerate action (new file), not a live toggle inside a file
  you already have open.
- **Real PDF layers (Optional Content Groups), as a stretch goal.**
  Acrobat's native Layers panel can toggle named content groups live in
  one file, no regeneration. Two real unknowns, same category of gap as
  the link-annotation question elsewhere in this doc: whether
  `@cantoo/pdf-lib` actually supports writing OCGs (unverified, would
  need the same low-level-object-manipulation approach if not), and
  viewer support is inconsistent -- most mobile/lightweight PDF viewers
  don't expose a layers UI at all, so this would silently not work for a
  real share of readers even if built.

Neither option touches or risks the existing patch/re-patch mechanism --
option A is purely a selection change on what already works.

## Callout/annotation overlays (arrows, circled letters, numbered pointers)

**The problem:** OEM manual photos often carry instructional annotations
baked into the pixels -- an arrow pointing at one specific bolt, a circled
"A"/"B" marking which cylinder. A contributor's raw phone photo replaces
the photo but loses that pointer, even though the pointer was often the
whole instructional value of the image.

**Current best idea:** don't ask contributors to draw on their own photos
(inconsistent, most people won't bother). Instead store callouts as
structured vector data per `procedure_id`, in relative (0-1) coordinates so
they scale to any photo:

```json
{
  "callouts": [
    {"type": "arrow", "from": [0.62, 0.31], "to": [0.71, 0.38]},
    {"type": "circle_label", "center": [0.40, 0.50], "radius": 0.04, "label": "A"}
  ]
}
```

A maintainer places these once per procedure (looking at the original
photo), and `patch_pdf.py` draws them on top of whatever photo is currently
approved -- same PyMuPDF vector-drawing path already used for the cover
page, so the plumbing to *render* this already exists. What's missing is
the authoring UI: a click-to-place-arrow/circle tool against the reference
crop, most naturally as a companion mode to the review gallery
(`generate_review.py` / `review_server.py`).

Why vector data instead of copying the original annotation pixels:
recreating the *functional position* of a pointer is a much cleaner
copyright position than reproducing Suzuki's actual drawn arrow graphic --
consistent with the rest of this project's "structure is public, pixels
are local/contributed" split (see LEGAL.md).

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

## Procedure-scoped contributions + live accept/reject review

**Confirmed direction, settled in design review:** neither contributors
nor maintainers should ever need GitHub's own UI. Today they do --
contributing means a real PR, reviewing means GitHub's PR page or `gh`
CLI -- that's the current state, not the target. Two rules to build
toward, both explicit answers to "when does someone need a GitHub
account":
- **A contributor never needs an account to browse.** Seeing what's
  missing for a vehicle is a public, unauthenticated read (same pattern
  as the patcher reading `manifest.json`). GitHub auth (a self-service
  token, see "Zero-install browser-based patcher" above) only gets asked
  for at the moment they actually upload a photo, not before.
- **A maintainer's review panel is one generic web app, not one per
  repo.** Same shape as the patcher taking a registry URL: this tool
  takes a `repo_url` and authenticates with the maintainer's own token to
  call the GitHub API directly (list PRs, diff, merge, close). It does
  not get duplicated into every vehicle repo's own GitHub Pages site --
  one app, parameterized, reused everywhere, so a new vehicle never means
  shipping a new copy of the same tool.

**Fixed, 2026-08-24: `repo_url` is never trusted just because it's in
the URL.** Raised directly: this tool authenticates with the
*maintainer's own* GitHub token, which has whatever access their real
account has -- completely unrelated repos included. Being generic and
parameterized is exactly what makes it possible to craft a link pointing
the tool at some other repo the maintainer happens to have write access
to, and get them to merge or close something there by mistake. Fixed by
checking `repo_url` against the registry (the same one the patcher
already reads) before ever calling the GitHub API against it -- refuses
outright if the repo isn't a registered, approved vehicle repo. Verified
both directions for real: an unrelated repo is refused with a clear
message, the actual registered repo passes.

**Pinned, 2026-08-24: reuse `generate_review.py`/`review_server.py`'s
actual rendering and interaction layer as this panel's foundation,
rather than building a second viewer from scratch.** The concrete
workflow, worth recording precisely rather than reconstructing later:
a maintainer gets notified they have photos to review -> signs in with
GitHub on the review page (the already-specced OAuth flow) -> sees their
open PRs for that vehicle -> opens one -> **is prompted for their own
copy of the manual**, because the repo never has the source pixels to
show them, the same as anyone else -> the page renders fresh, combining
the repo's current merged state with the proposed PR's photo, real
before/after, generated from that locally-supplied file in that session.

That prompt-for-your-own-PDF step is a direct, confirmed application of
LEGAL.md's local-context rule to a case it hadn't been checked against
before: a *maintainer* reviewing a submission never sees the manual's
pixels from the repo either, exactly like a contributor or an anonymous
patcher. The rule holds for all three roles without needing a special
case for maintainers, which is worth having actually verified rather
than assumed.

**Decided, 2026-08-24: "reuse the same work" means the same principle,
not the same code.** Checked directly, prompted by a real bug in
`generate_review.py`'s gallery (a stale crop thumbnail surviving an
edit): the review panel's single-item comparison never had this failure
mode to begin with, because it never persists a separate crop artifact
at all -- it recomputes live from the loaded page + current box state,
every time. That's the actual lesson, not "share the Python code" (the
review panel has no server, by design). Applied the same principle back
into `generate_review.py`'s gallery: card thumbnails now come from a
live `/api/crop/<id>.png` endpoint in `review_server.py`, computed
on-demand from current `bbox_edits.json`, never a pre-baked file --
removing the failure mode outright rather than fixing the same class of
staleness bug a third time. Verified for real: a fresh edit posted via
the API is reflected in the crop endpoint's output immediately, zero
regeneration step, zero lag.

**Pinned, 2026-08-24: the maintainer can live-adjust the target box to
fit the submitted photo, not just accept/reject it as-is.** Verified
first rather than assumed: `page.insert_image()` (PyMuPDF) already
preserves aspect ratio by default -- a mismatched photo letterboxes
inside the box, it doesn't distort. So the real problem isn't
correctness, it's fit and polish: a box sized for the original OEM
photo rarely matches a contributor's actual framing, leaving visible
empty space around an otherwise-good photo. Deliberately NOT solved by
constraining contributors -- every procedure's box has a different
aspect ratio, so there's no single ratio to enforce, and rejecting good
photos over framing is real friction for no benefit. Instead: reuse the
exact drag/resize/live-persist mechanism already built and proven in
`generate_review.py`'s crop editor, pointed at a different job here --
adjusting a box to match a *known, already-submitted* photo instead of
matching what the detector found. One addition worth building in from
the start: show the actual submitted photo live inside the box while
resizing, not an empty rectangle, so the maintainer sees real fit as
they drag -- the same live-feedback principle as the rest of this
session's fixes, not a new pattern.

**The problem:** as contribution volume grows, a maintainer reviewing raw
PR diffs of binary image files doesn't scale, and a PR that bundles many
photos across many procedures is hard to partially accept -- one bad photo
in a 20-photo PR blocks the other 19.

**Current best idea:** enforce that a PR/commit touches exactly one
`procedure_id` (CI check: reject a PR whose diff spans more than one
`images/<procedure_id>/` path). That keeps every unit of review small and
independently mergeable -- no more "which of these 20 photos was the bad
one." Then give maintainers a purpose-built review queue: a third mode on
the same gallery this project already has (alongside omit-false-positive
and add-missing-figure) that renders a live current-vs-proposed overlay
per incoming contribution -- old photo and new photo in the same
comparison view we already use for crop editing -- with per-procedure
Accept/Reject buttons wired to the GitHub API (merge that one file's PR,
or close it with a reason). GitHub's own PR UI already does a
before/after image diff natively; the value-add here is (a) the
one-procedure-per-PR scoping rule and (b) a review surface tuned for
"fast yes/no on one photo" instead of general-purpose code review, using
infrastructure (the overlay/compare rendering) this project already built
for a different purpose.

## Performance telemetry (feature request, not built) -- two genuinely different scopes

**The need is real:** manual spike-testing against one test manual (see
"Browser-based indexer port" above) doesn't scale to knowing how
indexing actually performs across real users' real devices -- the
5-minute target was verified once, on one machine, not measured in
production. Two different flows could each want this, and they're not
the same problem -- worth keeping split rather than solved as one
generic "telemetry" feature.

**Indexing metrics (Persona A) -- genuinely low-friction, no new
infrastructure needed.** Corrected after a direct question: indexing
only ever runs for Persona A, a maintainer already signed in and about
to push a brand-new vehicle repo -- Persona B never touches the indexer
at all, since patching only happens against an already-indexed vehicle.
That removes both objections that apply to the general case: there's no
anonymous-user problem (everyone running this flow already has a real
authenticated GitHub session), and there's no "nothing leaves your
device" promise to contradict (that promise was made specifically about
the *patcher*, aimed at Persona B -- the indexing flow already pushes
the manifest to GitHub as its entire point, it was never silent). A
small anonymized timing record (page count, total duration, device
concurrency -- no manual content, no PII) can just be committed through
the maintainer's own already-authenticated session as part of the
onboarding flow itself, into a shared metrics location. Real, buildable,
no design tension left to resolve.

**Patching metrics (Persona B) -- the actual hard case, still open.**
This is where the original tension lives: Persona B is often anonymous,
by design, and the patcher's explicit public promise ("nothing ever
leaves your device, open your network tab and watch") is aimed squarely
at that persona. Any telemetry here needs to be opt-in and clearly
disclosed, not silently on by default, and needs a mechanism that
doesn't depend on being signed in (most patchers aren't) -- a lightweight
anonymous endpoint (e.g. a Cloudflare Worker route reusing the
infrastructure already planned for the OAuth proxy, writing to KV/D1
rather than git) is the more realistic mechanism here, with periodic
aggregated summaries committed to the repo rather than raw per-run data.
Not decided, logged for when this gets designed for real -- and now
correctly scoped to the flow that actually needs it, not conflated with
indexing metrics.

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

Master registry repo mapping PDF fingerprint -> vehicle repo, gated by a
pending-approval review step for new vehicle submissions (same PR-review
pattern as photo contributions, one level up). Designed in conversation,
not yet built.

**Governance scope, corrected here after an earlier design mistake --
update: also now superseded by the multi-manual correction further
down (2026-08-25), see that entry for the current, accurate version.**
The org-level maintainer team does NOT review every photo PR across every
vehicle -- that doesn't scale and was never the intent, just an earlier
imprecise description. Their job is narrow and rare: approve whether a
*new vehicle* gets added to the registry at all -- ~~a one-time gate per
vehicle, not an ongoing one~~ (no longer accurate as stated: the org
reviews every manual submission's content, new vehicle or new edition
alike; what's actually one-time is the *repo-creation* decision, not
the review itself -- see "Multiple manuals for the same vehicle"
below for the full, current answer). Once a vehicle repo is forked into the org,
it gets its **own repo-scoped maintainers** -- a real GitHub feature
(repo collaborators/teams), not something to build -- who handle the
day-to-day photo review for just that one vehicle. That's the actual
subcommunity-per-vehicle model: each vehicle can be as active or as quiet
as its own community makes it, without ever bottlenecking on the small
org-level team. A vehicle with 5 maintainers and a vehicle with 1 both
work fine; neither depends on the other.

**Storage/size limits are per-repository, not shared across the org.**
GitHub doesn't impose a combined ceiling across every repo in an org --
each vehicle repo is independently bounded, so the compress-on-ingest
discipline from early in the project (see LEGAL.md-adjacent chat history)
just needs to hold per-repo, and adding more vehicles never makes an
existing one closer to a limit. The one thing that genuinely IS shared
account-wide on GitHub's free tier is Actions minutes (the CI runtime
`checker.py` uses) -- a real but much smaller concern, since the checker
is lightweight and free-tier minutes are generous; a cheap paid-tier
upgrade if it's ever actually the bottleneck, not an architecture problem.

**Needs a public-facing diagram, not just an internal design doc** -- see
the ownership/trust diagram work below. Most contributors will never read
this section; they need to *see*, in the README, that the structure is
sound and that they keep their own rights wherever their photo ends up.

**Can a repo be renamed or migrated later? Yes, but `registry.json`
has to be kept in sync -- not left to resolve itself, decided
2026-08-25.** Raised directly: fingerprints are a stable anchor either
way (a PDF's SHA-256 never changes regardless of what the repo's
called), so the instinct that renaming is low-risk is mostly right.
The real nuance: GitHub does redirect a renamed repo for git/web/API
operations for a good while, but that redirect isn't permanent or
guaranteed -- if the old repo name is later claimed by an unrelated
repo (anyone, anywhere on GitHub), the redirect breaks and silently
starts pointing somewhere wrong instead of just failing loudly. Worth
verifying the exact current redirect behavior against GitHub's own
docs before this is treated as fully settled, rather than relying on
general recollection of how it works. **The safe design, decided:**
`registry.json`'s `repo_url` is a stored string, not something that
auto-updates -- renaming or migrating a repo must always include
updating its registry entry as part of the same action, a required
step of the rename itself, not a separate cleanup task someone might
forget and only discover was missed once the old redirect quietly
expires.

## PDF Indexer flow corrections (2026-08-24)

A round of naming and ordering fixes to `web/indexer.html` /
`indexer-core.js` / `indexer-ui.js`, each with a reason worth keeping so
the old shape doesn't drift back in:

- **"PDF Indexer," not "Browser Indexer."** "Browser" describes *where*
  it runs, not *what* it does -- and this project already treats
  browser-only as the non-negotiable baseline everywhere else, not a
  feature worth naming the tool after. The tool indexes PDFs; that's the
  name.
- **"PDF Manual," not "Manual PDF."** Word-order ambiguity -- "Manual
  PDF" reads as "manual" the adjective (non-automatic), not the noun
  (the document).
- **Vehicle slug is no longer typed in before indexing -- it's derived
  from the manual's own content, then confirmed.** The old flow asked a
  maintainer to name the vehicle before the tool had read a single page,
  which is backwards: the manual itself is the authority on what it
  covers. `suggestVehicleSlug()` in `indexer-core.js` slugifies the
  earliest section heading found as a starting guess; the maintainer
  confirms or corrects it in a `#vehicleSlugConfirm` field shown after
  indexing completes, right where the review step already lives.
  `contributed_photo_path` is never baked in permanently during
  indexing -- `finalizeVehicleSlug()` recomputes it (and `manifest.vehicle`)
  from the current confirm-field value every time it's called, so editing
  the slug after the fact, or adding a new figure via the page modal
  before or after confirming, both just work without a separate backfill
  step to remember.
- **No page-range option, full document only.** A partial index would
  produce an inconsistent PDF fingerprint -- registry lookups depend on
  the fingerprint corresponding to the *complete* document, so a
  page-range control was a way to silently corrupt that invariant, not a
  convenience worth keeping.
- **Registry URL is hardcoded (`CANONICAL_REGISTRY_URL` in
  indexer-core.js), never shown as an editable field.** Same reasoning as
  `web/index.html`'s existing pattern: an editable registry URL is a
  spoofing vector (tricking a maintainer into pointing this at a fake
  registry to fabricate a "not yet claimed" result). Closing it off by
  never exposing the field beats validating it after the fact.
- **The page is locked behind a mock sign-in gate.** By the time a
  maintainer reaches this step in the onboarding journey they're already
  assumed to be signed in via GitHub -- showing the indexing UI to an
  anonymous visitor doesn't match the flow and just adds a state to
  reason about for no benefit.
- **All `indexer.py` references removed from code comments across the
  web/ files.** The browser version is the real implementation now, not
  a port being compared against a Python original -- comments that kept
  citing indexer.py as if it were still the reference implementation
  were actively misleading about which file is authoritative. This is
  the same "it's all going to browser" correction already applied to
  `generate_review.py`/`review_server.py` above -- every Python tool in
  this project is on the same path to being superseded, not a
  permanently-parallel design.
- **Review copy rewritten for real content, not placeholder text:**
  "Quick look before you submit" -> "Review photo identification for
  initial submission," with a line naming Maintainer Standards directly
  and three concrete reminders (delete non-figures like wording/running
  headers, when unsure leave it -- a false positive costs a click,
  a missed real one costs nothing since the org does a real check).
  The "Confirm the vehicle" field now names the actual naming convention
  (`make-model-year-range`) inline, since there's no dedicated
  naming-convention doc yet to link to -- flagged as a real gap, not
  silently worked around: a `docs/naming-convention.md` (or a FAQ
  section) should exist so this can become a real link instead of an
  inline pattern example.
- **Review gallery is paginated (10 candidates per chunk, in document
  page order), not one long scroll.** A several-hundred-candidate
  manifest rendered flat isn't "review the whole document," it's a wall
  nobody scrolls to the bottom of -- chunking with prev/next keeps the
  whole document reachable while keeping each screen small enough to
  actually look at. Entries are re-sorted by (page, y-position) on every
  render rather than relying on array-insertion order, since deletes and
  page-modal additions would otherwise scramble which chunk a candidate
  falls into between renders.

## Maintainer Portal (2026-08-24) -- one gated shell, not one gate per tool

**The gate moved from the individual tool page to a shared portal shell.**
Originally `indexer.html` had its own mock sign-in, and `review.html` had
a separate one. Raised directly: instead of gating each tool, build a
`web/maintainer.html` portal where indexing, PR review, and (eventually)
org-level new-vehicle approval are tabs behind ONE sign-in -- because a
maintainer doing several of these in one sitting shouldn't re-prove who
they are per tool, and a signed-in maintainer wanting to onboard a
second vehicle later should be able to jump straight to the indexing tab
without re-routing through the public patcher's discovery flow at all.
`web/indexer.html` and `web/review.html` are retired (deleted, not left
as stale parallel entry points) -- their markup and logic moved into
`maintainer.html`'s tab panels, reusing `indexer-core.js` / `indexer-ui.js`
/ `indexer-review.js` / `review-panel.js` unchanged except for removing
each one's own now-redundant sign-in gate. `review-panel.js`'s repo-scope
check (never trust a `repo_url` param without checking it against the
registry) is preserved but decoupled from "sign in" into its own
`initReviewTab()`, called by the portal once, right after its shared
sign-in succeeds -- the check is a real, separate concern from
authentication, not something that should ride along inside a click
handler named for something else.

**Roles aren't exclusive, so tabs are gated by capability, not identity.**
Raised directly: it's entirely plausible for the same person to be both a
repo-scoped maintainer on one or more vehicles AND on the small org team
that approves brand-new vehicle registrations (see the registry
governance section above -- these were already modeled as two distinct,
independently-held responsibilities, this just makes the portal UI match
that). `maintainer-portal.js`'s mock user object (`MOCK_MAINTAINER`) has
two independent flags -- `reposmaintained` (array, could be empty, one,
or several) and `isOrgMaintainer` (bool) -- neither implies or excludes
the other. Both tabs are visible-but-disabled if the signed-in mock user
doesn't hold that capability, per the earlier "PRs are disabled if they
aren't a current maintainer, but still there" instruction -- visible so
the existence of the capability is discoverable, disabled so it can't be
used without it.

**Every action is labeled REPO or ORG, not just the tab it lives in.**
Raised directly: since one person can hold both roles, the UI has to make
which authority a given action is using obvious in the moment, not rely
on "well you're on the Review tab so obviously this is repo-scoped."
Small colored `.scope-badge` elements (`repo` = blue, `org` = pink) sit
directly on each tab button now. This convention should carry forward
into any actual buttons/rows added inside the Approve New Vehicles tab
when it's built for real, not just live on the tab label.

**"Approve New Vehicles" (org-level) is pinned, deliberately not built in
this pass, even though the reuse argument for it is real and correct.**
Raised directly: org maintainers approving a new vehicle registration
need to browse a submitted PDF + its candidate manifest page-by-page --
that's the exact same shape of work as indexer-review.js's Stage-3
self-review (page-grouped, paginated gallery; live-cropped thumbnails
rendered from a cached PDF page; a page modal for closer inspection).
**But** indexer-review.js's rendering functions close over module-level
globals (`reviewManifest`, `selectedPdfDoc`, `reviewPageCache`,
`nextAddedIdx`) -- reusing those exact functions for a second,
independent "browse a manifest against a PDF" session on the same portal
page (a maintainer with both an in-progress indexing job on one tab and
an org-approval review open on another) would silently let switching
tabs clobber one session's state with the other's, since both would be
writing into the same variables. This is the same "reuse the same
principle, not the same code" lesson already learned once this session
(see the stale-crop-bug fix in the Docs-drift section above, where
generate_review.py's fix reused review-panel.js's *principle* --
recompute live, never persist a derived artifact -- without sharing its
literal code). The right build here is a second, small file
(`org-approval.js` or similar) that reuses the same rendering *pattern*
against its own independently-scoped state, not a direct call into
indexer-review.js's existing functions. Scoped as the next real piece of
work, not because the idea is wrong -- it's right -- but because doing it
by sharing mutable global state would plant a real, hard-to-notice bug
for the sake of a shortcut.

**Built, 2026-08-24: `org-approval.js`, per the plan above.** Fresh
functions (`orgSortedEntries`, `renderOrgGallery`, `getOrgPage`,
`refreshOrgThumbnail`, ...) and fresh state (`orgManifest`, `orgPdfDoc`,
`orgPageCache`, `orgChunkIdx`) -- same paginated, page-grouped-gallery,
live-cropped-thumbnail pattern as indexer-review.js, zero shared
variables. Verified live: opening a pending vehicle, loading a PDF, and
approving it in this tab left `indexer-review.js`'s `reviewManifest`
global completely untouched (checked directly in the console) -- the
collision this design was meant to prevent doesn't happen.

**Visibility question, asked and answered before building: hide the tab
from non-org-maintainers, or show it read-only?** Read-only, not hidden
-- raised directly and reasoned through before writing any code. Three
reasons, not just "stay consistent for its own sake": (1) it's genuinely
useful even without approve/reject access -- a repo-scoped maintainer
about to spend up to 20 minutes indexing a new vehicle can check this
tab first and see it's already pending, avoiding duplicate work, the
same kind of registry-conflict check already built elsewhere in this
project just surfaced earlier; (2) it matches the convention already
committed to for Review Photo PRs ("disabled if they aren't a current
maintainer, but still there") -- same shape of access-tier decision,
kept consistent rather than inventing a second pattern (hide) for a
structurally identical case; (3) what's exposed is low-risk metadata
(vehicle slug, submitter, page count, completeness stat), not contributed
photo content or anything license-sensitive, so there's no real privacy
cost to showing it. Implementation: the tab itself is never hidden or
disabled; `org-approval.js` renders the full pending list and gallery to
everyone, and gates only the Approve/Reject buttons themselves on
`MOCK_MAINTAINER.isOrgMaintainer`, with a plain-language note
("You're not an org maintainer -- read-only view of what's pending")
shown instead of pretending the actions don't exist.

## Source URL requirement, end-to-end (2026-08-24)

**Was missing from the browser flow entirely, caught by direct review.**
The Python side (`propose_new_vehicle.py`) already requires a non-empty
`source_identifier` before a submission can be proposed -- "maintainers
can't sanity-check a submission against nothing" -- but the browser
onboarding flow built this session never asked for one, and the org
approval tab had nothing to show even if it had. Closed on both ends:

- `web/indexer-review.js`: a required "Where can we find this manual?"
  field (`#sourceUrlConfirm`) sits in the Stage 3 review, right after
  vehicle-slug confirmation -- a URL to where the maintainer got the
  PDF (ManualsLib, a forum, wherever), not the file itself. Submit is
  hard-blocked (not just nudged, unlike the completeness signal) if it's
  empty -- scrolls to the field, focuses it, logs why. Stored as
  `manifest.source_markers.source_identifier`, matching the exact field
  path `propose_new_vehicle.py` already reads, so a browser-produced
  manifest works with the existing Python tooling unchanged, no schema
  divergence between the two paths.
- `web/org-approval.js` / `maintainer.html`: the submitter's source URL
  now renders as a real link in the Approve New Vehicles tab, placed
  directly above the PDF-picker's browse button per direct instruction
  -- an org maintainer sees where to go verify the manual before they
  even pick their own copy to render the gallery against.

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
scanning-sweep concept above).

## Patcher photo-download loop was sequential, fixed (2026-08-24)

**Asked directly: how fast does patching actually run for a fully
covered manual?** Read the real code rather than guessing. The
embed/hash/draw loop in `patcher.js` is cheap and local -- single-digit
seconds even for hundreds of photos. The real cost was
`registry.js`'s `fetchManifestAndPhotos()`: a plain sequential `for`
loop, one `await fetch()` at a time, no concurrency at all -- the exact
same problem class `indexer-core.js`'s OCR loop had before it got a
worker pool, just never fixed here. Estimated low minutes for a
few-hundred-photo manual, almost entirely latency from downloading one
file at a time.

**Fixed the same day, same pattern as indexing's pool** (no actual Web
Workers needed here, unlike OCR -- `fetch()` is already non-blocking,
so this is just a concurrency-capped async pool): sized to
`min(8, hardwareConcurrency - 1)`, matching indexer's pool sizing for
the same reason. Per-file error isolation added as part of the same
change -- a thrown/dropped fetch for one photo no longer aborts the
whole batch, mirroring the per-item isolation principle `patcher.js`'s
embed loop already used. Verified with a mocked 20-file fetch test
(real timing, not just correctness): ~6.6x wall-clock speedup at pool
size 8, max-8-concurrent confirmed via a live counter, all four skip
paths (oversized pre-check, oversized post-download, failed response,
thrown error) still isolate correctly, progress callback still fires
once per file monotonically.

## Landing-page hero graphic settled: stage 1/10, no animation (2026-08-24)

**Real problem, raised directly: the 10-generation clarify animation
reads as AI photo enhancement, which is false and conflicts with this
project's own "no AI runs here" stance stated elsewhere on the same
page.** A single photo gradually sharpening looks exactly like an AI
restoration/upscale tool -- but that's not what patching does. Patching
is a hard replacement: a bad scan crop gets covered by a *different*
photo a real person took, procedure by procedure. Nothing about the
original photo ever improves; it's swapped out, instantly, not
gradually.

**Resolved to the simplest fix, not the most elaborate one:** no
animation, no slider, no ten steps -- just stage 1 (the halftone-
degraded scan) next to stage 10 (the real contributed photo), side by
side, with a hard visual cut between them. "Turn this into this.
Revive your old manuals." / caption: "Powered by community-contributed
photos." Removes any implication of gradual improvement entirely,
since there's nothing gradual shown at all. The ten-generation build
and the halftone renderer aren't wasted -- they're still the right fit
for the *live* patch-progress screen (where procedures really do get
replaced one at a time as patching runs, a real multi-item process,
not a single photo "enhancing"), just not the right shape for a
landing-page explainer graphic. **Update: wired into `web/index.html`
for real since this was written** -- the before/after pair now lives
above the file-picker card, replacing the wireframe. The wording since
evolved past this paragraph too (see the entries below from later the
same day): "Turn this / into THIS!" per-photo labels instead of one
shared headline, and the intro sentence now merged directly above the
photos as an emoji eyebrow + bold explainer rather than a separate
plain-text line.

**Longer-term alternative, logged but not built:** a grid of several
procedure photos flipping from bad-scan to real-photo one at a time as
progress advances (reusing the review-gallery visual pattern already
built elsewhere in this app) would represent the real "replacement at
scale across a manual" mechanic even more precisely than a single
before/after pair, with zero risk of an enhancement reading since
nothing ever shows as clarifying. Worth revisiting if the landing page
becomes more than this one graphic.

**Follow-up corrections, same day, three passes to land on the final
layout.** (1) The before/after headline used red for the "before"
(bad) word -- red is this project's brand/action color (every button,
the logo accent), used everywhere else for good things, so tying it to
"bad" fought the rest of the page rather than supporting it. (2) First
fix reached for mint on the "after" word -- corrected directly: **mint
was never actually decided as a brand color**, it's a utility accent
that crept in for monospace log/progress text and "active/success"
status dots, never a deliberate second-color choice; promoting it to
headline weight overstated it as official branding it never earned.
(3) Settled, per direct instruction, on a different structure entirely
-- not one shared headline, but a short label sitting directly over
each photo ("Turn this" over the original scan, "Into this" over the
contributed photo), with only the word "this" carrying color per side
(steel on the scan, red on the contributed photo) and the connecting
word ("Turn"/"Into") staying plain white -- color marks the subject,
not the whole phrase. The tagline moved below the photos as its own
two-line block: "Revive your old manuals." / "Powered by the
community."

**Photo quality -- flagged as an ongoing area, not fully solved.** The
demo photo (project owner's own, admittedly "not the greatest camera")
got a manual ImageMagick pass for the landing graphic specifically --
auto white balance, mild contrast, unsharp mask, slight saturation
lift -- standard non-AI photo editing, the same kind of touch-up anyone
would do before posting their own photo, not something the product
does automatically (stays consistent with "no AI runs here"). **Future
to-do, logged per direct request:** consider whether the contribution
flow itself should offer basic (explicitly non-AI, clearly labeled)
photo touch-up assistance -- white balance/sharpen/contrast, the exact
techniques used here -- to help contributors whose cameras aren't
great get a usable result, rather than leaving quality entirely up to
whatever phone they own. Not designed, not scoped, just pinned so it
isn't lost.

**Pinned, not resolved: the "after" demo photo still isn't quite
right** -- project owner's read is it's something about the engine's
own sheen/reflectiveness, not necessarily fixable with more levels/
contrast tuning on this exact source photo. Revisit with either a
different edit pass or a different source shot; not blocking the
layout work above.

## In-PDF contribute QR codes + Contributor Portal, built end to end (2026-08-24)

**Closed the last real gap in the wireframed patcher landing page:** a
still-missing procedure now gets a real, scannable QR code (+ short
URL) drawn where its photo would have gone, instead of staying blank
-- `patcher.js`'s `drawContributeMarker()`, using `qrcode.js` (vendored
locally, not CDN-loaded, per this project's supply-chain stance --
kazuhikoarase/qrcode-generator, MIT). Someone flipping through their
own patched manual later, away from a computer, sees exactly where
they could help.

**Design discussion, worth keeping the reasoning for:** the QR needed
somewhere real to point, which raised the actual hard question --
how does someone contribute more than one photo without either (a)
re-authenticating with GitHub every single time, or (b) requiring an
account just to look at what's needed. Three options were laid out
(anonymous one-at-a-time, client-side/device-local batching, full
sign-in-up-front) and the deciding fact, not a preference: **batching
across devices is structurally impossible without identity-anchored
storage.** The concrete scenario that proved it -- a guide open on one
screen, scanned with a phone out of band -- means two genuinely
separate browser storage contexts that can never share
IndexedDB/localStorage. Landed on: browsing/viewing stays fully
anonymous (matches the original Persona B design), sign-in is deferred
to the latest point the storage model allows -- wanting something to
persist beyond one visit ("save this" or "submit this"), not landing
on the page.

**Built as `contribute.html`/`contribute.js`, a small Contributor
Portal:**
- Lands scoped to one procedure (`?repo=&procedure=`), fetches real
  manifest context when a repo exists, falls back to known mock
  context (matching `mock-pr-store.js`'s seed data) so the whole flow
  is genuinely testable against the real local test manual today, not
  just against fabricated data.
- "My uploads" -- procedure-scoped list of what this identity has
  proposed, persisted via `localStorage`.
- "View" -- same local-context rule as everywhere else in this
  project (`review-panel.js`, `org-approval.js`, `indexer-review.js`):
  the original scan can only ever render from the viewer's own
  already-loaded PDF. Renders a crop of the exact procedure by
  default (best for the actual "does this match" judgment, already
  framed comparably to the proposed photo); a "View whole page"
  toggle (added per direct request, for reviewing several procedures
  from the same page in one sitting) shows the full page with the
  target region highlighted, from the same cached render -- no second
  PDF re-render to toggle between them.
- **Submit reuses the maintainer's existing approval mechanism, not a
  parallel one** -- a submitted photo becomes a `MOCK_PRS`-shaped
  entry, reviewed through the exact same accept/reject flow
  `review-panel.js` already has. The seed data and the
  localStorage-backed load/save helpers moved into a new shared file,
  `mock-pr-store.js`, loaded by both pages -- verified end-to-end in
  the browser (submit on `contribute.html`, reload `maintainer.html`,
  the new request appears in the existing queue).
- **"Submit now" isn't gated behind viewing first, on purpose.**
  Raised directly: since the maintainer reviews (and can
  reposition/resize) every submission anyway, is contributor-side
  self-review actually required, or just nice? Landed on not gating
  it -- the real quality gate is the maintainer's review, and forcing
  an extra step before submit would fight the reassurance already
  shown in the compare view ("the maintainer will have an opportunity
  to position and resize this upon approval"). Kept as a soft nudge
  instead (text note, "Save" visually primary over "Submit now"),
  matching the same nudge-not-block pattern already used for Stage 3's
  completeness signal.
- **Crediting is mostly a non-issue** -- every real GitHub write
  happens through *someone's* actual OAuth token, so credit is always
  attached at the moment of the real submit, in every option
  considered. The one genuinely fuzzy case (a shared device, one
  person's batch containing photos someone else took) is a known,
  low-stakes limitation, not solved.

**Logged as a feature request, not built:** a fully anonymous,
offline-capable path (no identity, ever, even across devices) --
`FEATURE_REQUESTS.md`, with the same cross-device storage reasoning as
the "why" so it doesn't get re-litigated from scratch. First entry in
what's meant to become a real, votable public list once this repo is
actually live.

**Testing note, refines the earlier caching-artifact entry:** hit the
same browser-tool staleness again, but this time root-caused further
-- a fresh page load can leave an *old* cached script's event listener
attached to a button, and later `eval()`-ing fresh code onto the same
page adds a *second* listener rather than replacing the first, so both
fire on click. Diagnosed by stripping listeners via
`node.cloneNode(true)` + `replaceChild` before re-`eval`ing, which
isolated the fresh listener and confirmed the app code was correct the
whole time. The most reliable fix remains what's already
documented: a genuinely fresh `preview_start` + new tab, not
same-tab workarounds.

**Accept/reject now persist for real, not just log.** Raised directly:
if a maintainer accepts or rejects, does the contributor ever actually
learn the outcome? They didn't -- `MOCK_PRS` entries never got a
status, so "submitted" was the permanent, final state a contributor's
upload would show, forever, regardless of what a maintainer did.
Fixed: `review-panel.js`'s accept/reject now set `status` +
`maintainerNote` on the PR object and persist via `saveMockPrs()`; an
accepted/rejected request drops out of the open queue (it stays in
storage so the outcome is still look-up-able) but never disappears
from history. Both actions prompt for an optional note -- not just
rejection, acceptance too, since "exactly what was needed" is worth
saying as much as a reason for turning something down. `contribute.js`
looks the outcome up live by the PR number stashed at submit time and
shows it -- status badge (draft/submitted/accepted/rejected) plus the
maintainer's note when there is one. Verified end-to-end: submit,
accept with a note as the maintainer, reload the Contributor Portal,
see "accepted" and the note.

**Review list re-sorted and reformatted, page-first, per direct
feedback.** Page number was previously buried in the meta line;
promoted to lead the title ("PG. 28 -- Add photo: ...") since it's what
a maintainer orients around first, and the open queue within each
vehicle group is now sorted by page instead of submission order --
moving through a vehicle's queue should follow the manual, not the
order requests happened to arrive in. Also surfaced the actual
contributed filename in the meta line (`photo_filename`, threaded
through from `contribute.js`'s file picker) in place of the redundant
procedure_id repeat. Mock seed data (`mock-pr-store.js`) and mock
context (`contribute.js`) were also caught with a genuine inconsistency
during this pass -- one seed heading had a stray chapter-number prefix
("2-10 PERIODIC MAINTENANCE") the other two didn't, and the Kawasaki
seed PR had no matching mock context entry at all, so its Contributor
Portal card showed with no page or heading. Both fixed; the two mock
data sources are meant to describe the same three seed procedures and
should be kept in sync going forward.

**"My uploads" grouped by vehicle, collapsible.** Raised directly --
once someone's contributed across more than one vehicle, a flat list
stops working. Grouped the same way Review Photo Requests already
groups (shared `.vehicle-bar` visual language), as a native
`<details>/<summary>` so it's collapsible without custom toggle JS,
sorted by page within each group.

**Maintainer note-writing guidance -- topics pinned for a future
rubric, not built as UI yet.** The accept/reject notes above are free
text today; the actual guidance for what a maintainer *should* say
isn't written anywhere. Core principle, stated directly: **be polite,
but honest** -- a rejection note exists to help a contributor fix
something and resubmit, not to soften a "no" into mush they can't act
on. Topics a real rubric needs to take a position on, each because
they're genuinely ambiguous without one:
- **Modified/aftermarket parts in frame.** Does a photo showing a
  non-stock part (a different exhaust, aftermarket levers) still count
  as valid for a stock procedure, or does it get rejected as
  potentially misleading to someone following the manual on an
  unmodified bike? Probably: usable if the modified part isn't the
  actual subject of the procedure and doesn't obscure/misrepresent
  what's being shown, rejected if it is the subject -- but this is a
  real judgment call worth writing down, not leaving to each
  maintainer's private instinct.
- **What's acceptable in frame *around* the subject.** Background
  clutter, other tools, hands/fingers, a visible face -- where's the
  line between "real garage photo, that's the point" and "distracting/
  unprofessional, ask for a retake"? The quality bar already in
  `CONTRIBUTING.md` ("show the thing, in focus") implies an answer but
  doesn't state one explicitly for this specific question.
- **Multiple valid photos for the same procedure.** Already has a
  mechanism (`pickPhoto()`'s priority-list logic in `patcher.js`), but
  no stated *review* stance on whether a maintainer should accept more
  than one alternate-angle submission for the same procedure, or only
  ever the best one.
- **A single contributor covering most or all of a manual: default to
  accepting.** Raised directly, prompted by the new drag-to-reorder
  contributor priority list on the landing page (see below) -- someone
  who shoots their entire vehicle's worth of procedures in one pass is
  functionally offering "use my photos for this whole manual," which a
  visitor can now act on directly by dragging that person to the top
  of their priority list. The recommended rubric position: a
  contributor who's covered a large share of a manual's procedures
  should be accepted generously by default, not held to the same
  photo-by-photo skepticism as a single one-off submission. Good faith,
  volume work like that is exactly what the project needs and should
  be treated as a strong positive signal, not extra scrutiny.
- **Finding a co-maintainer -- reassurance, not pressure.** Framed
  directly: a maintainer should try to find a replacement or a
  co-maintainer if they're stepping back or expect to go quiet, but
  it's not a personal obligation they need to stress about. If it
  doesn't happen, that's fine -- the "passive" indicator above and the
  succession mechanism above handle it without anyone having had to
  personally recruit their own replacement under pressure. The actual
  message to put in front of maintainers: *"Try to find someone to
  hand things off to if you're stepping back. If you can't, don't
  worry about it -- there are mechanisms for that."* Directly
  contradicts any framing (accidental or otherwise) that finding a
  successor is solely on the outgoing maintainer's shoulders.
- **How many maintainers is too many?** Real question, needed a real
  answer, not left open. Too few (one) is the known risk step 5 of the
  landing page's onboarding already names -- a single point of
  failure, no redundancy, the whole reason "find a co-maintainer" is
  framed as the first real task, not an afterthought. Too many has a
  different failure mode: responsibility diffuses (everyone assumes
  someone else will review, nobody actually does), and review-quorum
  coordination gets slower, not more thorough, past a certain size.
  **Recommended range: 2-5 active maintainers per vehicle repo** --
  enough for real redundancy and coverage across time zones/
  schedules, not so many that ownership feels distributed to nobody
  in particular. Past ~5 on one already-well-staffed vehicle, the
  better move is directing a new volunteer's energy at a different,
  understaffed or unclaimed vehicle instead of stacking them onto one
  that doesn't need more hands -- spreads maintainer capacity across
  the project rather than concentrating it.
- **Scope framing: "your only real job is deciding whether a photo is
  good."** Raised directly, on top of the above -- maintainers need to
  hear explicitly what's *not* on them, not just infer it. **This one
  shipped as real copy, not just a design note** -- see
  `scaffold/CONTRIBUTING.md`'s "What review looks like" section:
  repo size, project-wide scaling, whether the project succeeds, and
  the legal/copyright architecture are all named explicitly as the
  Blayde Manual team's concern, not a repo maintainer's.
Not designed further than this -- the point of logging it now is so
"be polite, but honest" and these specific ambiguous cases don't get
re-discovered piecemeal, one contributor complaint at a time, once
this is real.

## Backlogged: language/localization priority (2026-08-24)

**The question, as raised:** if/when this gets translated, which
language first -- keyed to vehicle manufacturer's home market, or to
wherever has the highest concentration of older vehicles still on the
road that this project would actually help? Backlogged, not decided --
genuinely needs real data (forum activity by locale, registration
statistics by country, survey of who's actually using this) that
isn't available inside this session. Stated here so it isn't lost, not
answered.

**Sub-task requested: what year range is this product actually
targeting?** Reasoned from what's already true of this project rather
than researched externally (no live market data available here) --
worth treating as a hypothesis to validate, not a stated fact:
- The one real test manual in this project is a 1999-2002 Suzuki
  SV650 OEM service manual -- not chosen as a deliberate scope
  boundary, just what was on hand, but a real data point of one.
- The underlying problem this project solves ("out of print, only
  exists as a bad scan") has a rough natural window: manufacturers
  broadly moved from printed shop manuals to digital/online service
  information through the 2000s-2010s, so vehicles from roughly the
  1970s through the early 2000s are the likeliest to have a printed
  manual that's actually gone out of print and hard to find *clean*
  scans of, rather than manufacturer-hosted digital service info still
  being maintained.
- That's a hypothesis about the *supply* side (which manuals exist
  only as bad scans) -- it says nothing about the *demand* side (who's
  actually trying to fix a vehicle that old, and in what language),
  which is the actual question the localization decision depends on.
  Real answer needs real research -- language forums/communities for
  specific older-vehicle enthusiast scenes would be a reasonable place
  to start, not guessed at here.

## Issue Requests -- built and verified (2026-08-24, built 2026-08-25)

**The maintainer portal's still-pinned "Issue Requests" tab, scoped in
design discussion.** A "load the current [approved/merged] version"
view, rendered as an overlay you can right-click on -- but read-only
against the manifest itself, no direct edits. Two right-click targets
turned out to collapse to one genuinely new capability:

- **Right-click an existing photo, "problem with this photo"** --
  decided this needs *no new mechanism at all*. It's the same
  Contributor Portal submit flow, for a procedure that already has a
  photo. `patcher.js`'s `pickPhoto()` already handles multiple
  candidates per procedure via a priority list; a proposed replacement
  is not a different case from a first submission.
- **Right-click empty space that isn't a tracked procedure at all,
  "request a new slot"** -- this is the one real new piece: proposing
  a manifest *structure* change (the indexer missed a real photo
  opportunity), not a photo submission. Needs the same accept/reject-
  and-persist mechanism `review-panel.js` already has for photo
  requests, generalized to cover "approve a new manifest entry."

**Resolved, 2026-08-25: real scanned pages as a backdrop, not a
synthetic layout map.** Asked directly; the answer given cuts right to
why the synthetic option was wrong despite being architecturally
tidier: a right-click issue request needs real context to be
meaningful at all -- judging whether an empty area is a genuine missed
photo opportunity, or reasonably blank, requires seeing what's
actually on the page around it. A box floating with nothing underneath
can't support that judgment. This also means no new rendering pattern
is needed -- it reuses the exact same maintainer's-own-PDF + local-
context-rule approach already built three times (review-panel.js,
org-approval.js, contribute.js), not a fourth, different one.

**Status: built, same day.** `web/issue-requests.js` -- pick a repo/
edition, pick your own copy of the manual, patch against the current
approved photos, browse page by page with real overlay boxes (the
approved photo where one exists, a demo stand-in where the mock
fallback has no real bytes yet). Dragging an existing box queues a
"structure" issue; drawing a new box on empty space prompts for a
label and queues a "new-slot" issue; right-clicking an existing photo
offers "problem with this photo" (opens the Contributor Portal for
that procedure, no new mechanism) or "add a comment" (queues a
"comment" issue with no bbox at all). Submitting funnels every queued
issue into the exact same `MOCK_PRS` store and `review-panel.js`
accept/reject tool a photo submission uses -- `issue_type` branches the
accept log line (no photo to merge for structure/new-slot; comment
issues skip the compare/box UI entirely, since there's no bbox to show
against). The page image fits its container width on open, matching
review-panel.js's compare canvas -- overlay boxes and drag math live in
the page's native pixel space inside a CSS-scaled wrapper, so "fit to
page" never required touching the bbox conversions themselves, only
converting mouse screen-deltas by the same scale factor. Verified live
end to end, including a same-page-session bug where a just-submitted
issue didn't show up in Review Photo Requests without a full reload
(`MOCK_PRS` was a page-load-time snapshot) -- fixed by re-syncing from
storage both on tab-open and whenever the Review Photo Requests tab is
clicked.

## Landing page wired up end to end (2026-08-24)

The hero graphic and five-step maintainer-onboarding stepper had both
been designed and verified as standalone wireframe Artifacts earlier
in this stretch; this closes the loop by wiring the finished designs
into the real `web/index.html`, replacing the old placeholder
no-match card.

Concretely: the hero before/after photo pair (with the "Turn this /
Into this" word-level coloring settled through several direct
corrections -- see the hero-graphic entry above) now sits between the
trust-line copy and the file-picker card. The old one-line "want to
be first?" placeholder is replaced by the full 5-step stepper (sign
in, index, quick pass, submit and wait, you're the maintainer -- with
the self-approval-rule warning flag on step 5), plus the "not me, but
I know someone" out-link.

One small real fix fell out of wiring this in for real rather than as
a demo: the CTA card now holds two `<a>` tags (the primary sign-in CTA
and the out-link), so `patcher.js`'s `showMaintainerCta()` needed to
target the primary link by ID (`#maintainerCtaLink`) instead of
`card.querySelector("a")`, which would have silently grabbed whichever
link happened to come first in the DOM.

Verified live in-browser, not just read back: the hero images load and
render correctly, the no-match path (mocked empty registry response)
shows all 5 steps with correct step-5 flag styling, the CTA link
carries the right fingerprint hash through to the Maintainer Portal,
and the out-link's "link copied" confirmation displays on click.

Real photo files now live at `web/images/hero-before.jpg` and
`hero-after.jpg` -- unlike the standalone wireframe Artifacts (which
inlined base64 for portability), the real product page references
them as normal project assets.

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

## Standard: dev-only scaffolding stays only until superseded (2026-08-24)

Explicit instruction, applies project-wide, not just to manual test
mode: anything built as a stand-in for a piece of real infrastructure
that isn't live yet -- manual test mode standing in for a real
GitHub/registry connection, mock data standing in for a real backend,
etc. -- is fine to leave in place while the real thing doesn't exist
yet. Once the real thing is wired up and covers the same ground, the
stand-in comes out. Not a "maybe clean up later" -- a standard: ship
the trigger, remove the trigger, don't let it linger past its purpose.

`web/patcher.js`'s manual test mode (skip the registry, pick one
photo yourself) is the concrete instance right now -- it stays because
there's no live GitHub-backed registry yet to test the real match path
against. Remove it once patching against a real, published registry +
repo is actually possible end to end.

## Top-nav pill links, and the halftone-strip question revisited (2026-08-24)

Two asks, one resolved, one deliberately declined:

**Contributors/Maintainers pill links -- built.** The landing page had
no contributor entry point at all, only "Already a maintainer? Go to
the Maintainer Portal." Replaced with two pill-shaped links, top
right: "Contributors" (light grey, links to `contribute.html`) and
"Maintainers" (red, links to `maintainer.html`).

**Real gap surfaced while testing this, not fixed yet:**
`contribute.html` was built to be reached only via an in-PDF QR code
scoped to one specific procedure (`?repo=...&procedure=...`). Clicking
the new nav pill with neither param falls back to a hardcoded default
procedure card (Suzuki SV650, periodic maintenance) instead of a real
"no specific procedure, browse your uploads or pick a vehicle" landing
state. "My uploads" below it still renders correctly either way, so
this isn't broken, just an odd top card for a general entry point.
Worth a real landing state for `contribute.html` when someone arrives
with no procedure context -- not built here.

**Halftone-clearing explainer strip -- declined, not built.** Asked
directly whether to add this to the landing page. It's the same piece
that was already cut from the hero earlier this session (commit
`9a7c93e`, "replacement, not enhancement") for visually implying a
gradual AI-style improvement rather than what actually happens (a bad
scan getting swapped for a real photo someone else took). Given the
choice again directly, decided to skip it -- the existing static
"Turn this / into THIS!" hero already does the explainer job without
that implication risk. The 10-generation halftone render work still
stays earmarked for the actual patch-progress screen, where photos
really do swap in procedure-by-procedure, not for a landing explainer.

## Contributors nav landing state, built (2026-08-24)

Resolves the gap flagged in the entry above. `contribute.html` arriving
with no `repo`/`procedure` params (the new nav pill, not a QR scan) now
shows a sign-in gate first, matching the Maintainer Portal's own
`#signInCard` pattern, and lands on "My uploads" after signing in --
no attempt to show a procedure card when there's no procedure to show
one for. Arriving via a real QR code (both params present) is
untouched: procedure context and the photo picker still show
immediately, sign-in still only happens at save/submit. Distinguished
by `params.has(...)`, not the existing fallback values, since the
fallbacks exist specifically to keep old bookmarked/shared QR links
with partial params from breaking and would otherwise mask a
genuinely-absent param as present.

## Landing-page scope question, re-asked and re-confirmed (2026-08-24)

Directly re-asked: is this project's scope vehicles, or literally any
kind of manual? Already decided once, in the photomosaic per-vehicle-
class template discussion -- **vehicles**, not arbitrary objects.
Motorcycles today; cars, boats, and other vehicle classes next,
whenever there's an actual manual to test against, via the
`templates/motorcycle.json` / `car.json` / `boat.json` library keyed
off a `vehicle_class` field the registry already needs (see the
per-vehicle-class template entry earlier in this file). The entire
fork/PR contribution model, procedure-scoped manifests, and the
copyright-safe local-context rule are all built around "a manual for
something you fix," not generic documents.

The re-ask traced back to the hero subheading itself: "Revive your old
manuals." never actually said *what kind* of manual, vague enough that
it re-opened a question that was already settled. Fixed to "Revive
your old vehicle manuals." -- the answer was already decided, it just
wasn't on the page.

## ROADMAP reconciliation pass, and more landing-page polish (2026-08-24)

Asked directly to reconcile this file against what's actually live on
`web/index.html`. Found and fixed two stale entries that still read as
open when the work was done: "Zero-install browser-based patcher"
was written as a proposal and is now marked **Status: built**, pointing
at `index.html`/`patcher.js`/`registry.js`; the landing-page hero
graphic entry's "not yet wired into `web/index.html`" line got an
update note since that's no longer true.

Same pass, several more direct copy/layout corrections landed:
- **"Pick your manual PDF" -> "Pick your PDF manual"**, both spots.
  Confirmed via the transcript that this exact correction was already
  given once and applied to `maintainer.html`'s indexer field -- it
  just never made it to `index.html`. Word order matters here per
  direct feedback: "manual PDF" reads as "not automatic."
- **"patch in real photos" -> "patch in contributed photos"** --
  "real" implied the alternative (OEM scans) isn't real, when the
  actual distinction is who took the photo, not its legitimacy.
  Dropped the trailing "-- all right here" too, redundant with the
  file-picker card immediately below.
- **Intro sentence merged into the hero block**, not left as a
  separate plain-text line -- a red uppercase eyebrow + bold white
  explainer directly above the "Turn this / into THIS!" photos, same
  register as `docs/faq.html`'s emoji flyer band (built earlier this
  project, at `🧑‍🔧📕 You bring your manual -> 🔍 Scanned, locally ->
  👥📸 Matched with real photos -> ✨📗 Your manual, enhanced`). First
  pass carried two emoji into the eyebrow to match that energy;
  removed per direct feedback, eyebrow sized up after.
- **Trust-chip strip relocated** from directly under the header to
  just above the file-picker card -- the reasoning given directly:
  the local/no-AI reassurance should be the last thing seen right
  before picking a file, not the first thing before a visitor even
  knows what the tool does.

## Two more trust chips, a footer, and a real color-contrast pass (2026-08-24)

**Two more trust chips added, directly requested:** "Free & open
source" and "Community-run," below the existing "100% local"/"No AI"
pair. The page never actually said either of those things anywhere --
a real gap for a cold visitor trying to understand what this even is.

**Footer added**, reusing `docs/faq.html`'s existing pattern
(`README.md` / `LEGAL.md` / `ROADMAP.md` links) rather than inventing
a new one -- `index.html` was the one page in the whole site missing
this.

**Color scheme review, done with real measurements, not re-picked by
eye.** Prompted by direct feedback ("those icons look terrifying when
red," "I don't love mint"), which led to computing actual WCAG
contrast ratios for the palette rather than just swapping colors on
taste:
- **Icon semantics were actually wrong, not just disliked.** All four
  trust chips are reassurances ("100% local," "free & open source,"
  etc.), and red conventionally signals danger/warning -- that
  mismatch is exactly why it read as alarming. Switched all four to
  one neutral treatment (light icon on a faint steel tint), no
  per-chip color coding, since none of these are actually different
  *categories* of information.
- **Two real AA failures found and fixed.** `--red` (#c8102e) on black
  measures ~3.3:1; text under 18.67px bold needs 4.5:1. The hero
  eyebrow and the red "THIS!" label were both failing this, not just
  "a little dim." Added `--red-text: #ff2e4f` (5.33:1) for small red
  text on dark backgrounds specifically; kept `--red` for buttons/
  pills (white text on it already clears 5.88:1) and the large bold h1
  accent (clears the 3:1 large-text minimum).
- **Card/divider borders were also failing.** `--steel-dark`
  (#4a4f57) on black measures ~2.36:1 against the 3:1 non-text UI
  minimum -- card boundaries were genuinely hard to perceive for
  low-vision users, not merely subtle by design intent. Updated to
  `#666c76` (3.68:1 on black, 3.36:1 on the card background).
- **Propagated to `web/maintainer.html` and `web/contribute.html`**
  since they share the identical `--steel-dark` token and the same
  border-visibility problem -- checked both first for any small
  red-on-dark text like index.html's (none found, so `--red-text`
  wasn't needed there, just the border fix). `docs/faq.html` keeps its
  own separate token set and wasn't touched -- worth the same pass if
  it's revisited.

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

## Review modal port gap: header, go-to-page, omit-vs-delete missing (2026-08-24)

Caught directly during an end-to-end walkthrough test: `maintainer.html`'s
`#pageModal` (the "view / add missing" review popup in the Index a New
Vehicle flow) is a much thinner port of `generate_review.py`'s original
review gallery than it should be. The original has a real header
(omitted count, bulk "omit selected," a "hide omitted" toggle), a
"missed a photo? jump to page: [#] [Open page]" navigator, and omit
vs. delete as two distinct actions -- omit marks a false positive with
a reason, recoverable; delete is permanent, no history. The browser
modal today is just the page image, the drag-to-add/move/resize
gesture, and a bare Close button; the grid's small "x" buttons read as
straight delete, no omit-with-reason path at all.

Not fixed yet -- noted directly, continuing other work first. Worth
porting the missing pieces over before this flow is considered done,
since "recoverable reject with a reason" vs. "gone forever" is a real
behavioral difference a maintainer should have, not just a UI nicety.

## Review modal reconciled: header + go-to-page added (2026-08-25)

Direct feedback from an end-to-end walkthrough test: the Maintainer
Portal's indexer review modal (`#pageModal` in `maintainer.html`,
logic in `indexer-review.js`) was missing pieces the original
`generate_review.py` gallery had. Checked both side by side rather
than guessing:

- **Genuinely missing, now added:** a header showing which page you're
  on and how many candidates are on it ("Page 5 of 10 -- 5 candidates
  on this page"), and a "jump to page: [#] [Open page]" control so a
  maintainer can open any page directly instead of only the ones
  visible in the current 10-candidate chunk. Verified live: opened
  page 1, jumped to page 5, got real rendered content and an updated
  header both times; an out-of-range page number (35, on a 10-page
  manual) was correctly rejected.
- **Deliberately NOT ported: omit vs. delete.** `indexer-review.js`'s
  own header comment already explains why this modal is delete-only,
  no "omitted but still present" third state -- a candidate is either
  real (stays, gets submitted) or it isn't (deleted, gone, no
  unfillable blank procedure ships in a live manifest). That's a
  considered decision already on record, not an oversight, so it
  wasn't reversed just because the older Python tool worked
  differently. Noting this explicitly so it isn't rediscovered as a
  "gap" again without the context of why it's not one.

## End-to-end walkthrough test, 2026-08-25 -- real gaps found

Ran a full walkthrough as a genuinely new visitor: landing page ->
"not registered yet" -> Maintainer Portal sign-in -> indexed a real
10-page slice of the actual Suzuki manual (pages 90-99, treated as a
throwaway test vehicle, `suzuki-testslice-1999-2002`) -> reviewed
boxes (added one, deleted one) -> submitted -> approved as an org
maintainer -> invited 3 people as repo maintainer -> submitted 4 real
photos as a separate contributor (1 accepted, 1 rejected with notes,
2 left pending) -> patched a PDF. Every step used real data (real
OCR'd headings, real figure detection, real fit-ratio math, real
mock-log output) end to end -- see CHANGELOG for the modal fix that
came out of it. Test PDF and any generated manifest fragments were
cleaned out of `web/` afterward; the only lasting change was the
review modal fix above.

**Real gaps found along the way, not yet fixed -- flagged for
tomorrow's pass, not fixed today per direct instruction to reconcile
just the editor/viewer and stop there for the day:**

- **Several portal tabs don't auto-refresh after data changes.**
  Review Photo Requests, Approve New Vehicles, and My Vehicles each
  render their list once (at sign-in / first tab activation) and never
  re-read their backing mock arrays again. A new photo request, a
  newly-submitted vehicle, or a newly-added team member added after
  that point doesn't appear until something explicitly calls the
  render function again. In production this would be "no live
  refetch," which is a real UX gap, not just a mock-testing artifact.
- **Three-plus disconnected mock data stores that don't actually wire
  together.** `MOCK_PENDING_VEHICLES` (org-approval.js),
  `MOCK_REGISTRY` (review-panel.js), `MOCK_VEHICLE_TEAMS`
  (my-vehicles.js), and `MOCK_MAINTAINER.reposmaintained`
  (maintainer-portal.js) are four separate hardcoded structures.
  Approving a pending vehicle in the "Approve New Vehicles" tab logs a
  real, correct-looking mock action ("create the vehicle repo... POST
  .../registry.json... notify @you they're now the first maintainer")
  but doesn't actually touch any of the other three -- the newly
  approved vehicle doesn't show up anywhere else in the portal without
  manually patching each store. Fine for a mock demo once you know to
  do that; a real gap if these are meant to simulate one coherent
  backend. Worth deciding whether to keep them genuinely separate
  (documenting why) or wire a shared mock "backend" object they all
  read/write.
- **Index submission has no visible outcome.** Clicking "Looks good,
  submit it" in the indexer review only appends a log line
  (`[submit] N candidates submitted...`) -- there's no visible
  "submitted, waiting for approval" state change in the indexer UI
  itself, and nothing about a real submission reaching the Approve New
  Vehicles queue without the same manual bridging noted above. Same
  root cause as the disconnected-stores point.
- **Two native dialogs (`prompt()`, `confirm()`) get silently
  auto-dismissed in automated/headless testing contexts** (the page
  modal's "add a missed photo" label prompt, and the gallery's delete
  confirmation) -- worth knowing next time something "silently doesn't
  work" during automated testing, not necessarily a product bug. Real
  users in a real browser see and answer these normally.

**Explicitly deferred to tomorrow, not attempted today:** reviewing
this ROADMAP file as a whole and paring down remaining goals ahead of
a legal review and v1.0.0 launch. That's the stated plan for the next
session, not something to pre-empt here.

## Indexing completion copy, and two open threads (2026-08-25)

**Closing line added, direct request:** indexing completion now ends
with "It's up to the community to keep going. Thank you for
contributing." right after the DONE stat line -- community-framed,
not individual ("yours to finish" was the first draft, corrected
directly).

**Two threads raised, not resolved yet:**
- **"Archivist" indexing-progress messaging, referenced but not
  recovered.** Directly recalled as specific wording given earlier
  during progress-bar wireframing, likely lost when an earlier session
  got auto-compacted (compaction summarizes, it doesn't preserve exact
  wording). Searched every available session transcript and every
  scratchpad wireframe file for "archivist"/"uncovering"/
  "revitalizing"/"support knowledge" -- no match anywhere. Not
  recoverable from this side; needs to be restated directly if it's
  still wanted, from wherever it's actually saved.
- **Registry browse page / per-vehicle stat line, sequencing
  question.** Already fully designed (see "GitHub-invisible UX, before
  v1.0.0" above -- one line per vehicle, e.g. "Suzuki SV650
  (1999-2002) -- 12% of 972 procedures have a photo," filterable by
  type/make/model, nothing more granular). Asked directly when this
  gets built; answered that it belongs in tomorrow's ROADMAP-paring
  session ahead of legal review/v1.0.0, not decided in isolation here.

## Confirmed follow-on: every vehicle-grouped UI needs an edition tier (2026-08-25)

**Status: built, same day.** All three flagged screens (Review Photo
Requests, My uploads, My Vehicles) now have the edition tier described
below -- see CHANGELOG.md's entry. Leaving the original catch below as
the design record.

Direct, correct catch immediately after the unified-vehicle-repo
correction above: since a vehicle repo can now hold more than one
edition, every screen that currently groups by vehicle only is now
one level too shallow. Confirmed across the actual files, not assumed:

- **Review Photo Requests** (`review-panel.js`) -- groups by
  `repo_url`/vehicle only today. Needs vehicle -> edition -> request.
- **My uploads** (`contribute.js`) -- same gap, vehicle -> edition ->
  upload. The "Request to help maintain this vehicle" button built
  today stays correctly vehicle-scoped as-is (maintainer authority is
  vehicle-wide under the corrected model, not per-edition) -- no
  change needed there specifically.
- **My Vehicles** (`my-vehicles.js`) -- roster is per-vehicle already
  (correct, maintainers are vehicle-wide now); needs to additionally
  show which edition(s) that vehicle actually covers, since "this
  vehicle" no longer implies "this one manual."
- **Approve New Vehicles** (`org-approval.js`) -- needs to distinguish
  a brand-new-vehicle submission from a new-edition-of-an-existing-
  vehicle submission explicitly, since the org's approval *action*
  now branches on that (create repo + first maintainer, vs. merge into
  existing repo + add maintainer to the existing pool) per the
  corrected governance model above.

**Edition labeling, decided:** community-proposed, not a controlled
vocabulary -- the submitter names their edition at indexing time
(short, human-readable: "OEM," "Haynes," "Chilton"), checked by the
org for sanity as part of the same content review they already do
("does the name follow convention" already applies to `vehicle_slug`;
this extends the same light check to `edition_id`). A fixed enum can't
work -- there's no bounded universe of manual publishers across every
vehicle that will ever exist. `edition_id` already exists as a real
field precedent (`patcher.js`/`registry.js` already display it
alongside `vehicle_slug`, e.g. "Found: Suzuki SV650
(oem-manualslib)"), just never modeled as a UI grouping tier before
today.

Logged here so it isn't lost before the next testing pass -- fix
starts immediately after this entry, same session.

## PINNED, v0.9.9: intentional per-file copyright check as the gate before anything leaves this computer (2026-08-25)

**Direct instruction, standing until explicitly cleared:** before any
code from this project is uploaded to the new GitHub repo -- the first
time this project's own source ever leaves this computer -- every file
being pushed gets checked, intentionally, for copyrighted content. Not
a spot-check, not "the tooling code is obviously fine so skip it": the
actual gate is reading each file's own history for how it got there,
since this project's specific risk isn't "did Claude write something
infringing," it's "did a demo/test step pull in real copyrighted manual
content and leave it sitting in a tracked file or a committed asset."

This session's demo work is exactly the shape of risk this pin exists
for: `web/_test_assets/DemoManual10pg.pdf` (10 real pages sliced from
`local_pdfs/ServiceManual.pdf`, a real copyrighted service manual) was
created to make the end-to-end demo testable, and lived inside `web/`
specifically so the dev server and browser could fetch it. Anything
placed there during testing must be deleted before a push, not just
excluded via `.gitignore` -- a gitignored file sitting in the working
tree is still a file someone could accidentally `git add -f`, ship as
a zip, or forget about entirely. The standing pattern going forward:
test fixtures that touch real manual content get cleaned up
immediately after the test that needed them, not left for a future
cleanup pass.

**Concretely, the check before any push:**
- Diff every file being added/changed against what's already known to
  be safe (project source, scaffold templates, mock/synthetic data,
  this project's own documentation) versus anything that could be, or
  could contain fragments of, a real manual's actual content --
  scanned pages, extracted text, extracted images, OCR output, or a
  fingerprint/hash log that embeds more than the hash itself.
- Specifically distrust anything created as a testing convenience
  during a session (test PDFs, test images, cached fetch responses,
  screenshots of a real manual page) -- these are exactly the files
  that get created for a good reason, verified working, and then
  forgotten instead of deleted.
- `local_pdfs/` and any `web/_test_assets/`-style scratch directory are
  the known danger zones already established this session -- confirm
  neither is tracked and neither has ever been staged, not just that
  `.gitignore` currently lists them.
- This is in addition to, not a replacement for, `LEGAL.md`'s existing
  "local-context rule" review of the architecture itself -- that
  review covers whether the *design* ever transmits manual content;
  this gate covers whether any *actual file* sitting in the repo at
  push time does, regardless of design intent.

**First real execution, 2026-08-25: two findings, both fixed.** See
CHANGELOG.md's entry -- manual-text-derived `procedure_id`/
`section_heading` eliminated (not shortened) in favor of purely
positional IDs, `page_text_excerpt` dropped entirely, GPS EXIF stripped
from the public hero images. Re-run this gate before every future push,
not just the first one -- it caught real issues on the very first pass,
so it isn't a one-time formality.

## Designed, not yet built: metadata corrections (edition label, source URL) as Issue Requests (2026-08-25)

**Raised directly, evaluating a real gap:** `registry.json`'s
`repo_url` already has a defined resilience story (see "Can a repo be
renamed or migrated later?" above -- fingerprints anchor everything, a
required registry-sync step on any move). A vehicle's `source_identifier`
(the manual's *original* source link -- ManualsLib, a forum post,
wherever a submitter found it) never got the same treatment. If that
link goes dead, nothing technical breaks -- matching and patching are
fingerprint-based, never URL-based -- but it does quietly erode the one
thing a stranger or an org reviewer uses to verify a listing is real.

**Resolved design: both this and an edition mislabel (OEM tagged as
something it isn't) become new Issue Requests types**, not a new
mechanism -- `edition-relabel` and `source-url-update`, flowing into
the exact same `MOCK_PRS` queue and `review-panel.js` accept/reject
tool every other issue already uses. Neither has a bbox (vehicle/
edition-level facts, not page/procedure-level) -- same family as the
existing bbox-less `comment` issue type, so the "no bbox" guard in
`review-panel.js`'s `renderPage()` needs broadening from
`issue_type === "comment"` to the whole non-bbox family rather than
one more special case bolted on. Raised from a small "something wrong
with this vehicle's info?" action near wherever a maintainer currently
sees the source URL/edition label -- most naturally My Vehicles, not
the box editor (wrong scope entirely -- these aren't page-level
corrections). Not yet built -- logged here so it isn't lost before the
next implementation pass.

## Direct-to-git contribution -- what's actually enforced vs. just a nicer path (2026-08-25)

**Raised directly, evaluating a real gap:** every review/approval flow
built this session (the org compare tool, `review-panel.js`'s
accept/reject, the 2-distinct-approver quorum) assumes someone goes
through the browser tool. What happens if a contributor or maintainer
just uses `git`/`gh`/GitHub's own web UI directly -- a hand-written PR,
a direct edit, a manual merge?

**Explicit product decision: this must stay fully supported, not
locked out.** GitHub-native contribution is a first-class path, not a
bypass to prevent -- the browser tool is a convenience aimed at this
project's target audience (mainstream, non-developer vehicle owners),
not the only sanctioned interface. Anyone who's comfortable with git
should be able to use it exactly as they would on any other open-source
project. The actual question isn't "how do we stop this," it's "does
skipping the tool actually break anything or let something bad through
unnoticed" -- and the honest answer split into three parts once checked
against the real files, not assumed:

**Already safe regardless of path, confirmed:**
- `checker.py` triggers in CI on any PR touching `images/**`, tool-made
  or hand-written alike -- resolution, blur, file size, EXIF GPS,
  filename-matches-a-real-`procedure_id` all still enforced.
- A maintainer's review context (page, bbox, composite dimensions) can
  always be looked up from `manifest.json` by the submitted filename's
  `procedure_id` -- not dependent on which tool created the PR.
- The actual human visual compare (maintainer picks their own PDF,
  looks) is manual either way -- there was never an automated version
  of this step to skip.

**Real gap #1: CI validation is scoped to photos only.**
`scaffold/.github/workflows/validate-photo.yml` triggers on
`paths: images/**` alone -- a PR touching only `manifest.json` (a moved
bbox, a changed status, an edited edition label) gets zero automated
checking today, tool-made or hand-written. No check that a hand-edited
bbox is even within the page's bounds. This is a bigger risk than a bad
photo, since `manifest.json` is the one file every other review/patch
tool trusts completely. **Needed:** a second CI job validating manifest
structure (bbox sanity against `page_geometry`, no orphaned/duplicate
`procedure_id`s) -- not yet written.

**Real gap #2, the bigger one: none of the review/approval UX is
technically enforced today, regardless of who's using what.** The
compare tool, the quorum -- all of it is a UI convention right now, not
a technical gate. Nothing stops a maintainer with merge rights from
clicking Merge on GitHub's own PR page without ever opening the tool.
Client-side JS cannot enforce this at all -- it has to be configured at
the GitHub repo level or it's advisory only, and nothing in this
project has configured it yet. **Needed:**
- Branch protection + required status checks, set up once as an
  **org-level ruleset** (applies automatically to every repo matching a
  pattern, so a new vehicle repo inherits it without per-repo setup) --
  require `validate-photo.yml` (and the new manifest-validation job
  above) to pass, require at least one approving review, block direct
  pushes to `main`.
- For the registry repo specifically: required reviewers/CODEOWNERS
  enforcing the real 2-distinct-approver quorum as a GitHub-enforced
  rule, not just what the tool's own UI happens to ask for.

**Extension, 2026-08-25: the same gap applies inside every vehicle
repo, not just at the registry level -- a maintainer's write access
covers every file the repo ships with, not just the two they actually
need.** Raised directly: does a maintainer need edit access to
everything scaffold/ forks in, or just their real job? Checked file by
file against what routine maintaining actually requires:

- **Needs routine write access -- this is the job:** `manifest.json`
  (accepting a photo, adjusting a bbox, adding a confirmed missing
  slot) and `images/**` (the merged contributed photos themselves).
- **Should require org-team review, not single-maintainer discretion:**
  - `checker.py` and `.github/workflows/validate-photo.yml` -- these
    *are* the validation gate. Freely editable, a maintainer could
    silently weaken or entirely disable the resolution/blur/GPS/
    filename checks this session's client-side EXIF-strip work assumed
    would stay backing it up.
  - `LICENSE`, `LICENSE.md` -- legal terms, already decided above.
  - `.github/PULL_REQUEST_TEMPLATE.md` -- the CC-BY/ownership consent
    language lives here; freely editable, a maintainer could strip it
    from their own repo, removing even the soft attestation trail.
  - `CONTRIBUTING.md` is the one borderline case -- lower stakes than
    the above, but "Maintainer Standards" is meant to be an org-wide
    floor, not something one repo can quietly water down on its own.
  - `README.md`/`images/README.md` are genuinely fine at normal
    maintainer discretion -- informational copy, no security or legal
    exposure either way.

**Needed:** a `CODEOWNERS` rule scoped to those specific paths
(`/LICENSE`, `/LICENSE.md`, `/checker.py`, `/.github/**`, arguably
`/CONTRIBUTING.md`), requiring the org team's review specifically for
changes there -- layered on top of the general branch-protection
ruleset above, which still applies to everything else (including
`manifest.json`/`images/**`) at the normal one-approving-review bar.
Same org-level-ruleset mechanism, just with a narrower, stricter
CODEOWNERS carve-out for the files that are infrastructure/governance
rather than routine maintaining.

**Also found in the same pass, fixed same session:** `scaffold/README.md`
and `scaffold/LICENSE.md` both referenced "the parent project's
`LEGAL.md`" -- a relative reference that's already broken today, since
a forked vehicle repo has no such file. Fixed to link the real
tooling-repo URL directly. `scaffold/README.md` also had zero mention
of blaydemanual.com anywhere -- someone landing on a vehicle repo
directly (a search hit, a curious dev) had no pointer back to the
actual GitHub-invisible entry point this whole project is built around.
Added a redirect note at the top: patch your manual at blaydemanual.com,
this repo is the data behind it, useful for the source/history/manual-PR
path specifically.

**One thing checked and confirmed *not* a differential gap, but real on
its own:** the CC-BY 4.0 license grant and "this is my own photo"
attestation currently live only in the PR template checklist --
`contribute.js` has no actual consent-capture step in the tool itself.
Equally weak whether someone uses the browser tool or opens a raw PR,
since GitHub doesn't enforce checkbox completion without a status check
backing it. Not a bypass-specific issue, but worth its own fix.

**Sequencing:** branch protection setup belongs in Stage 1 of the
GitHub migration (repo/org creation), happening *with* each repo's
creation, not as a later hardening pass -- a vehicle repo that exists
even briefly without it is a real window, not a theoretical one.

## HARD GATE: no outside code contributions to the tooling repo until a CLA/DCO exists (2026-08-25)

A real-world comparison against Mastodon, Home Assistant, and iNaturalist surfaced a gap specific to code contributions, separate from the photo-consent work already built this session. Home Assistant's CLA.md exists to protect the same thing LEGAL.md already argues for: as sole copyright holder today, before any outside contributor's code lands, dual-licensing stays available later as a real option. That protection only holds if every contributor's rights to their own contribution are actually attested to somewhere. Right now nothing captures that at all for code, the way the new checkboxes in contribute.js now capture it for photos.

This is a hard gate, not a nice-to-have-eventually item. This project must not accept a code pull request from anyone other than the sole author until a CLA or DCO (Developer Certificate of Origin, the lighter-weight sign-off convention many projects use instead of a full CLA) exists and is actually required before a PR can merge.

Confirmed with the project owner: with a single author today, there is no real gap yet. Nobody else's rights need attesting to when there is no one else contributing. This only becomes load-bearing the moment a second person's code is proposed, which is exactly why it belongs on the roadmap now, decided in advance, rather than being improvised under pressure the first time someone actually opens a code PR.

## Two real gaps in the branch-protection rollout (2026-08-26)

Both `blayde-manual`, `registry`, and `vehicle-scaffold` now have CODEOWNERS and branch protection (1 required code-owner-approved review, admins exempt so the sole author can still push directly). Two things this did not solve:

1. **Branch protection does not carry over when a new vehicle repo is generated from the `vehicle-scaffold` template.** GitHub's "generate from template" copies files, not repo settings. Every new vehicle repo needs branch protection configured as its own explicit step, or this needs an org-level Ruleset instead of per-repo branch protection -- rulesets can apply automatically to every repo matching a pattern, but creating one needs `admin:org` scope, which the current token does not have (`gh auth refresh -h github.com -s admin:org` would add it).
2. **The `manifest.json` CI-validation job still does not exist.** `scaffold/checker.py`'s CI workflow only validates photos (`paths: images/**`). A PR touching only `manifest.json` -- a moved bbox, a changed status, an edited edition label -- gets zero automated checking today, in `vehicle-scaffold` or in any repo generated from it. This is the same gap already logged in the "Direct-to-git contribution" audit above; repeating it here because the branch-protection rollout made it concrete on a real repo instead of a hypothetical one.

## OAuth App registered; expire-user-access-tokens deferred until the worker handles refresh (2026-08-25)

OAuth App registered under the BlaydeManual org. Client ID: `Ov23lijpNHggDgWfwxWa` (public, not sensitive -- safe to record here). Client secret is not recorded anywhere in this repo; it belongs only in the Cloudflare Worker's secret bindings once that worker exists.

Two registration settings decided, checked against GitHub's real OAuth App docs rather than assumed:

- **Device Flow: off.** That flow is for browserless/limited-input devices (CLI tools, smart TVs) authorizing without a redirect URL. Blayde Manual is a browser web app with a real callback URL, so it doesn't apply.
- **Expire user access tokens: off, for now.** GitHub's own guidance is to disable this only if the app's authentication code hasn't yet been updated to handle short-lived tokens -- exactly this project's situation, since the Cloudflare Worker that will do the token exchange doesn't exist yet and has no refresh-token logic. Turning this on today would mean tokens silently expire once real sign-in ships, logging people out with no way to refresh. **Flip this on once the worker is built with refresh-token handling** -- GitHub calls expiring tokens the preferred long-term posture, this is a temporary deferral, not a permanent decision.

## GitHub App migration -- real repo-scoped auth, not just app-level trust (2026-08-26)

The current OAuth App uses the `public_repo` scope. Checked against GitHub's own docs (docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps): that scope grants "read/write access to code, commit statuses, repository projects, collaborators, and deployment statuses for public repositories and organizations" -- every public repo the signed-in person can act on, not just BlaydeManual's. Classic OAuth Apps have no mechanism to scope a token to specific repos or orgs at all.

What actually keeps this site from touching anything outside BlaydeManual today is application-level, not auth-level: the repo-scope validation already built into `review-panel.js`/`org-approval.js` checks any `repo_url` against the registry before making a mutating API call. That's real and it works, but it's "our code chooses not to," not "the token literally can't." A bug in that check, or a leaked token, could act on any public repo the signed-in user can write to.

**Decision: migrate to a GitHub App, installed only on the BlaydeManual org, once there's time for it.** Confirmed with the project owner this is worth doing for real, not just meeting the baseline ("I want 'the best' not just what the standards are") -- GitHub Apps use installation-scoped tokens tied to the specific repos the app was installed on, so the restriction becomes structural instead of app-level. This is real, non-trivial work, not a config toggle: a different auth flow (installation tokens instead of user-authorization tokens), different token lifecycle, likely different permission model for what "signing in as a contributor" even means under an App-based flow. Not blocking the current OAuth App rollout -- logged here as the next real hardening step, not a redo of what just shipped.

**Sequencing decision (2026-08-26): a real hardening item to get to soon, not first.** Checked GitHub's own guidance and real precedent before deciding the order:
- GitHub's docs are unambiguous that GitHub Apps are "preferred to OAuth apps because they use fine-grained permissions, give more control over which repositories the app can access, and use short-lived tokens" (docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps) -- naming exactly the three gaps flagged above.
- Confirmed the actual access mechanism: "A user access token only has access to a resource if both the user and the app have that access" -- sign-in and installation are separate steps, so a person can authorize without the App being installed anywhere, but the resulting token only works on repos where the App is *also* installed. Since every Blayde Manual target repo lives under the BlaydeManual org, one org-wide installation covers everything with no per-contributor friction -- the friction that trips up projects whose target repos are scattered across contributors' own forks.
- Checked real precedent: Decap CMS (formerly Netlify CMS), the closest real analog -- a browser tool that signs someone in and lets them commit content changes to a repo -- documents a classic OAuth App plus a small server-side token-exchange proxy, the exact pattern already built here. Not a GitHub App. GitHub's "preferred" guidance is aspirational, not yet what the ecosystem has converged on for this specific use case.

**Decided not to do this first, for three real reasons:** GitHub App tokens are short-lived by design, so the Worker would need real refresh-token handling immediately, not later -- more surface area right after two real sign-in bugs were just found and fixed on the current flow (see CHANGELOG's "[Unreleased]" entry, 2026-08-26). The flow that just shipped needs to prove stable in the wild before being rebuilt on a different auth model -- two auth rewrites back to back is how a second, subtler bug slips through under time pressure. And the org-owned-repo structure means most of the security benefit is available later without urgency now: the token-scope gap is real but mitigated today by the app-level check, not wide open. Revisit once the current OAuth flow has run clean for a while.

## Backlog: speed slider should show discrete stops, not read as a continuous bar (2026-08-26)

The Advanced: speed control (indexer-ui.js/maintainer.html) already snaps to whole numbers (default `step="1"` on the range input), but visually it looks like a smooth 0-100% bar with no indication of where the real stops (1, 2, 3... up to the device's cap) actually are. Flagged directly: should visually show the discrete selectable positions, not read as a continuous slider. Likely fix is a `<datalist>` with tick marks matching the cap, not a functional change to the underlying value logic. Not urgent -- logged to come back to, not fixed in the moment.

## Real evidence: even 2 workers OOM-killed Firefox on Linux (2026-08-26)

Direct report while testing the Advanced: speed control: Firefox on Linux was killed by the kernel's OOM killer at only 2 concurrent OCR workers -- not the higher settings, just "Faster." Same machine, same manual, run in Vivaldi (Chromium-based) at the same setting: no issue. Confirms the pool-size hotfix's own reasoning was correct to be conservative -- "no evidence yet on whether 2-3 is actually safe" turned out to mean genuinely not safe, at least on this real combination of OS and browser engine.

Real, useful data point for whenever indexing_metrics accumulates enough real manifests to inform a safer default: browser engine (Firefox/Gecko vs. Chromium) may matter as much as raw core count or RAM. Not asking for a code change from this alone -- one data point, not a pattern yet -- but worth remembering when that future concurrency decision actually gets made, and a real argument for keeping the single-threaded default conservative in the meantime.

## Bug: vehicle_class is used but never actually set anywhere (2026-08-26)

Direct question: "don't we need to determine vehicle type at submission? That field isn't ringing a bell." Checked and confirmed a real gap. `registry-browse.js` reads `vehicle_class` (e.g. "motorcycle") off every entry to power its type filter dropdown, but that field only exists in that file's own `MOCK_REGISTRY_BROWSE` stand-in data. The real registry entry schema, as actually read/written by `org-approval.js`, `registry.js`, `patcher.js`, and the manifest itself, is `vehicle_slug` / `edition_id` / `repo_url` / `vehicle_display_name` / `source_pdf_sha256` / `status` -- no vehicle type or class anywhere in it. The "Confirm the vehicle" step in `maintainer.html` (`vehicleSlugConfirm` / `editionIdConfirm` / `sourceUrlConfirm`) never asks for one either.

Net effect: nothing breaks today only because `registry-browse.js` still runs entirely on mock data. The moment that page gets wired to the real registry, its type filter has nothing to filter on. Needs: (1) a field on the confirm-the-vehicle step to capture vehicle type/class (motorcycle/car/ATV/etc., likely a select with a short fixed list rather than free text, to keep the browse filter's option list from fragmenting), (2) it flows through into the manifest and the real registry entry alongside `vehicle_slug`/`edition_id`, (3) `registry-browse.js` reads it from real entries instead of only ever seeing its own mock rows. Not fixed in the moment -- surfaced during the review-state-persistence work, logged to pick up as its own change.

Update: this dropdown shipped in the same PR as the review-state-persistence fix (see maintainer.html's Vehicle type field, indexer-review.js) -- the confirm-the-vehicle step now captures it and it flows into the manifest. `registry-browse.js` itself still reads only its own mock data, so wiring it to the real registry remains open.

## Bug: stale JS served for up to 4 hours after a deploy (2026-08-26)

Direct report: "Vivaldi WONT let go of this old site... I don't want other people hitting this issue." Real, not browser-specific -- confirmed via `curl -I` against the live site that Cloudflare Pages was serving every JS file with its own default `Cache-Control: public, max-age=14400, must-revalidate` (4 hours), on plain unhashed filenames (`review-panel.js`, not a content-hashed name). This project ships multiple PRs a day, so any returning maintainer/contributor loading the site inside that 4-hour window after a deploy got stale JS with zero indication anything was wrong -- confirmed live: the maintainer portal was rendering `mock-pr-store.js`'s mock PR data, which `review-panel.js` (PR #14) replaced with real GitHub PRs weeks ago.

Fixed with `web/_headers` (Cloudflare Pages' native headers config, no build step needed) setting a blanket `Cache-Control: no-cache` across the whole site -- still lets the browser cache, just forces a conditional revalidation (ETag) on every load instead of trusting the multi-hour window. Deliberately simple/blunt per direct instruction: this is a low-traffic page where freshness matters far more than shaving a revalidation round-trip, "if this is something we dial in later that's fine." The more targeted long-term answer (content-hashed filenames + long immutable caching on those, no-cache only on HTML) would be more bandwidth-efficient but needs a build step, which conflicts with this project's stated no-build-step design (README.md) -- not worth it at this project's current size/traffic. Revisit only if traffic or build tooling assumptions change.

Update: `_headers` alone didn't fix it -- deployed, but `curl -I` still showed `max-age=14400` on JS files. Root cause had two layers: the `blaydemanual.com` zone had its own Cache Rule (separate from the Pages project entirely) with an Edge Cache TTL set to override/ignore the origin's own `Cache-Control` header -- 14400 seconds (exactly 4 hours) is a classic Cloudflare Page Rule/Cache Rule preset value, not something Pages' own default asset caching produces, which was the tell. Confirmed via Cloudflare's own docs that a Cache Rule set to "ignore cache-control header and use this TTL" does exactly that, at the edge, regardless of what the origin (or `web/_headers`) sends. Fixed by switching that zone-level Cache Rule to "Respect existing headers" in the Cloudflare dashboard (Caching -> Cache Rules) -- a dashboard/infra setting, not something fixable from the repo alone. Worth remembering for any FUTURE cache-behavior bug on this domain: check zone-level Cache Rules/Page Rules first, since they silently override anything `web/_headers` says.

## Naming convention change: vehicle_slug is a release year, not a year range (2026-08-26)

Direct, deliberate decision, not a bug fix: `make-model-year-year` (a range, e.g. `suzuki-sv650-1999-2002`) is being replaced with `make-model-year` (a single release year, e.g. `suzuki-sv650-1999`). Reasoning, direct quote: "we never 'truly' know the end date without research... When suzuki-sv650-2003 is scanned, that is the start of GEN2 (implied) by the NEW manual starting in 2003. So fundamentally we no longer have a year RANGE we only have a year START." This lines up with the generation-boundary insight already logged above (a manual states its own start year, never its end) -- the old range format was always asking maintainers to guess at a fact no single manual can state about itself; the new format just doesn't ask for that fact at all. A vehicle's repo is keyed by when ITS manual's coverage begins; a later manual for the same model gets its own repo by definition, not a range extension.

Checked the real (non-mock) code before changing anything, since this is a naming-convention change with real blast radius if something downstream assumed the old shape: `vehicle_slug` is treated as an opaque string everywhere except two spots in `indexer-core.js` -- `guessVehicleSlugFromText` (built a `year1-year2` slug) and `vehicleSlugPrefix`/`findSimilarVehicleSlugs` (stripped a trailing `-YYYY-YYYY` to compare same-family slugs for the generation-typo guard). Both fixed and re-verified: the OCR guess now always takes the FIRST year, even out of a printed range on the manual's own cover (that range describes what the source document covers, not what the repo's naming should claim); the generation guard now strips a single trailing `-YYYY`, so e.g. `suzuki-sv650-1999` and `suzuki-sv650-2003` still correctly surface as "same vehicle family, different release year" without any change to its actual logic. `registry.js`/`patcher.js`/`contribute.js` never parse `vehicle_slug`'s internal structure at all, so nothing there needed to change. Also updated `indexer-review.js`'s near-miss note text and `maintainer.html`'s "Confirm the vehicle" copy to match.

Explicitly NOT touched: mock example data across `mock-pr-store.js`, `org-approval.js`, `my-vehicles.js`, `maintainer-portal.js`, `contribute.js`, `registry-browse.js` (all still reference the old `-1999-2002`/`-1998-2000` style names). Confirmed via `gh repo view` that neither example ever existed as a real GitHub repo -- purely fictional placeholder data, not something a rename could break. Left alone per direct instruction: this mock data is getting replaced with real data in an upcoming PR, so touching it now would just be wasted, overwritten work.

## Bug: several real, live review-session issues found during an actual large-manual pass (2026-08-26)

Direct testing against a real 900+ page manual (857-914 candidates depending on the pass), the first real end-to-end review session this deep into a real document. Several real, distinct bugs found and fixed in the same pass:

- **Thumbnails/full-page modal looked blank.** Two separate, real causes, not one bug: (1) a real page render can legitimately take a long time on a large scanned page -- confirmed directly, it does eventually complete -- and a plain blank thumbnail during that wait was indistinguishable from broken, so a pulsing loading placeholder was added (distinct from the existing thumb-failed error state). (2) Separately, after a real browser stall-and-recover (reported directly: page hung ~10s then self-refreshed), every subsequent render came back as a fully TRANSPARENT canvas that had never actually been painted -- `page.render()`'s promise resolved successfully without pdf.js actually drawing anything, a known real failure mode after renderer memory pressure. A transparent canvas encoded as JPEG (no alpha channel) comes out solid BLACK, indistinguishable from real content at a glance, and explains "all pages look the same now" after the stall -- every page hit the same broken decoder state. Fixed by sampling the rendered canvas's alpha channel right after render() and treating an all-transparent result as a real failure (throws, surfaces as thumb-failed with a message pointing at the actual fix: refresh and use "Continue reviewing").
- **Full-page modal didn't fit its own viewport.** `getReviewPage` rendered at a fixed scale=2.5 regardless of the source page's real size, so a real scanned page could be several thousand pixels wide with nothing capping it to the modal's own dimensions. Capped to a max render width instead -- also fixes the overlay-box/drag-handle math staying exact, since a CSS-only shrink would have misaligned them from the underlying image.
- **Resuming always landed back on chunk 1**, forcing whoever resumed a big review to click "Next" repeatedly just to get back where they were -- which also re-triggers a real page render for every chunk passed through along the way. Fixed by persisting `reviewChunkIdx` alongside the manifest in the same `reviewState` IndexedDB record, restored on "Continue reviewing."
- **Space bar with a delete-confirm dialog open stacked a new dialog on top of the last one, repeatedly.** Root cause: nothing moved focus into the custom confirm dialog on open, so the native delete "x" button underneath (which activates on Space by default) stayed focused and kept re-triggering itself. Fixed by focusing the dialog's own OK button on open. Also added a real, working "don't ask me again" (scoped per call site via a dontAskKey, stored in localStorage) to the delete-candidate confirm specifically.
- **Adding a new figure by dragging on an empty canvas was reported as finicky, "tries to move the canvas."** Root cause: the modal's `<img>` had no `draggable="false"`, so a mousedown-drag could also trigger the browser's own native image-drag, fighting the intended box-drawing gesture. Fixed, and per direct follow-up request, drag-to-draw itself was removed entirely -- clicking anywhere empty now places a fixed reasonably-sized box immediately, resized afterward with the same handles as any other box. Those handles also only ever supported nw/se corners; ne/sw were added so any corner can be dragged, not just the diagonal pair.
- **"Looks good, submit it" looked like it did nothing, even on success.** The only feedback was one appendLog line into the indexing log at the top of the page, far out of view from the submit button at the bottom of a long review gallery. Now shown as a visible success message right next to the button itself, and the button disables after a successful submit so a maintainer can't wonder whether a second click is needed. Note for later: the actual submit action here is still a stub (logs and clears local state, matching the `[mock]` convention used elsewhere in this codebase) -- there's no real GitHub PR-creation flow for a brand-new vehicle proposal yet, unlike review-panel.js's real accept/reject for photo-submission PRs. `propose_new_vehicle.py`'s real flow is the Python-side equivalent this eventually needs to port to the browser. Not done in this pass -- flagged so the visible-feedback fix isn't mistaken for that larger, separate feature actually shipping.

## Backlog: pre-fetch the next review chunk's pages, not just cache what's already been rendered (2026-08-26)

Direct suggestion after watching the blank/slow-thumbnail issue in real use: "can we pre-chunk the doc and switch chunks and clear out old chunk?" Checked what already exists before treating this as new work: a rolling window is already there at two levels -- the gallery only ever renders REVIEW_CHUNK_SIZE (10) candidates' pages at once, and getReviewPage's own cache (reviewPageCache) is LRU-capped at 20 pages, oldest evicted automatically as new ones render. What's genuinely missing is PRE-fetching: the next chunk's pages only start rendering once the maintainer actually clicks "Next," not before, so there's still a real wait right at the moment they land on a new chunk even though the system could have used the idle time before that click to get a head start.

Real fix would be: after renderReviewGallery() finishes the current chunk, kick off (low-priority, non-blocking) getReviewPage() calls for the pages in the NEXT chunk, so by the time "Next" is actually clicked those renders are already done or in flight. Interacts with the existing LRU cache correctly by construction -- prefetched pages just become the most-recently-used entries, evicting genuinely old ones the same way already-viewed pages do now. Not built in this pass -- deliberately backlogged, logged directly per request, pick up as its own change.

## GitHub App migration: locked direct-submit repos, real org-approval checks (2026-08-27)

Direct request: "put in the actual PR so we can create a real repo... so the submit button works," which surfaced a real question worth answering carefully before building anything -- what actually stops someone from manipulating org approval through the web interface, or bypassing it entirely by hand-crafting a fake submission?

**The constraint that shaped everything:** researched GitHub Apps properly before committing (docs + live search, not memory) -- a GitHub App's tokens only work on repos the App is explicitly installed on, and installations don't auto-extend to a brand-new repo or a contributor's personal fork created on the fly. Fine for BlaydeManual-owned repos (one "all repositories" org install covers everything, present and future); not fine for a contributor's own fork or a maintainer's own newly-created personal repo, which would need every contributor/maintainer to separately install the App on their own account too -- real friction on the site's highest-traffic flow for uncertain benefit.

**The design that came out of working through this together:** two submission flows get different treatment based on what each actually needs, not a uniform migration:

- **Indexing a new vehicle (submitNewVehicleProposal) -- GitHub App only, no alternative.** There's no meaningful "keep it personal" case for a manual someone just spent real effort indexing -- the point is for it to become the org's public record. Submit now always goes through the App's own installation credential (never the maintainer's own token) straight into BlaydeManual as a PRIVATE repo. The maintainer never gets write access to it. This closes a real security gap for free: because the submitter can't write to it afterward, there's no time-of-check-to-time-of-use window where they could edit the manifest after submitting but before an approver looks at it. A sha256 of the manifest is committed to a separate, App-only-writable public log (`BlaydeManual/submission-log`) at submit time, so approval can later prove the manifest it's looking at hasn't been swapped.
- **Contributing a photo (contribute.js) -- both paths, contributor's choice.** Unlike indexing, photos come from many different people over a vehicle's lifetime, and this project's stated philosophy is "your photos are always yours" -- contributors legitimately care about retaining personal control. Public (GitHub App): branch created directly on the upstream repo, PR opens immediately, no fork, no personal copy. Private (classic OAuth, existing fork flow): pushes to the contributor's own fork same as before, but the PR-opening step is now separate and deferred -- nothing is proposed to anyone until the contributor explicitly opens it themselves later from My Uploads, whenever they want, or never.

**Real answer to "what stops a manipulated approval":** `org-approval.js`'s real implementation (replacing the `MOCK_PENDING_VEHICLES` mock) never trusts anything the browser claims about a submission -- every check re-verifies independently, server-side, using the installation token, at the moment of action:
1. **Negative file-allowlist**: a direct-submit repo must contain EXACTLY `{README.md, manifest.json}` and exactly one branch. Anything else (most dangerously a `.github/workflows/*.yml`, which would execute with the org's own permissions the moment the repo goes public) is a hard, automatic block -- not a warning a human can click through.
2. **Notarization check**: the manifest's current sha256 must match what was logged at submission time. A mismatch means it was edited after submitting, or never went through the real site's submit flow at all (someone hand-crafted a fake private repo hoping it'd get approved).
3. **Manifest schema validation**: has to have the real shape (`entries[]`, `page_geometry`, a `vehicle` slug) -- garbage gets rejected before anything privileged happens.
4. **Real org-role check on the approver**: verified against GitHub's own membership API (`role === "admin"`) using the installation token, not a client-side flag -- a maintainer's own page state can never fake being an org admin.

The UI's Approve button runs these same four checks via a `dry_run` flag on the same endpoint the real approval uses -- not a lighter client-side approximation -- so "Approve is enabled" and "Approve actually works" can never disagree.

**Deliberately NOT built in this pass:** a real REJECT action. Unlike approve, rejecting a direct-submit proposal would mean deciding what happens to a real, already-created private GitHub repo (delete it? leave it? ask for a fix?) -- a genuinely destructive, hard-to-reverse decision not part of the original ask. Reject stays a logged/mock action for now. Also not built: making the personal-account submission path's "propose -> approve -> transfer" flow real (still needs a human to actually initiate the GitHub-side transfer, since no org-side credential can pull a repo out of someone else's account without their cooperation regardless of auth model) -- only the direct-submit path's full loop is real end-to-end.

**Manual setup still needed (can't self-provision credentials):** register the actual GitHub App (permissions: contents/pull_requests/issues/administration read-write, metadata read; installed on BlaydeManual, all repositories; user-to-server auth enabled with token expiry left OFF for now to avoid needing refresh-token handling in this first cut -- the exact objection that shelved this migration the first time it was considered); generate its private key and a client ID/secret, add all of it as Wrangler secrets on `auth-worker`; create the `BlaydeManual/submission-log` repo. Everything in this pass was verified by mocking `fetch`/`githubApi` in-browser and testing the exact request sequences/payloads and pass/fail check paths through the real click handlers -- not a real end-to-end test against actual GitHub, which needs those credentials provisioned first and should get one real live pass (a real direct-submit, a real Public contribute, a real approval) once they are.

## Backlog: the indexer's "Download manifest.json" button has no matching way back in (2026-08-27)

Direct question, raised while a real vehicle was being indexed: "you can download the index, but you can't re-upload it later as a savepoint... so why download the index?" Checked the actual code rather than assuming an answer -- `indexer-ui.js`'s `downloadBtn` exports the in-memory manifest as a plain file download once indexing finishes, with no explanatory comment anywhere for what it's for. There is a real, separate resume system already (`indexer-core.js`'s job-based resume, checkpointed to IndexedDB), but it only resumes the SAME browser tab/profile's own stored job -- it has no import path that accepts a manifest.json file at all. So today: downloading the manifest produces a file that cannot be fed back into the indexer, the reviewer, or anything else in this codebase. Its only real use right now is as a raw artifact for manual inspection or an external backup copy, not a savepoint in any functional sense -- and nothing in the UI says that's all it's for, which is exactly what prompted the question.

Not fixed in this pass, logged directly per request. Two real directions, not decided yet: (1) build a real "load manifest.json" import path so the download genuinely functions as a portable savepoint (works across browsers/devices, unlike the IndexedDB-only resume); or (2) if the button was only ever meant as a raw-data escape hatch, say so in the UI rather than leaving it looking like a savepoint feature it isn't.

## Backlog: review-gallery layout is inconsistent across viewers, and the layout shifts under the reviewer (2026-08-27)

Direct feedback, not fixed in this pass -- explicitly deferred so the Reviewer pane (its own dedicated look) can be reviewed next, separately:

1. **Move Prev/Next (and the page-range indicator) to the TOP of the gallery**, directly under the candidates/reviewed/coverage stats bar, above the thumbnail grid -- currently at the bottom, under the last row of thumbnails. Both `indexer-review.js`'s self-review gallery (`reviewPrevBtn`/`reviewNextBtn` in `maintainer.html`) and `org-approval.js`'s approval gallery (`orgPrevBtn`/`orgNextBtn`, same layout shape) have this same structure and need the same fix -- not a one-off, a shared pattern both viewers copied.
2. **The reason, stated directly**: a variable-height page/thumbnail area sitting BELOW the pagination controls means the controls themselves move up and down the page depending on how many thumbnails happen to render that chunk -- and worse, thumbnails can "hang" off the bottom of the visible area with nothing anchoring where the page actually ends. Moving Prev/Next above the thumbnail grid fixes both: the controls stay in a fixed position regardless of content height, and the thumbnail area becomes the part that's allowed to vary.
3. **Submit (`submitBtn` in `indexer-review.js`, `orgApproveBtn` in `org-approval.js`) should close out the viewer pane and show a summary**, not stay sitting at the bottom of a long scrollable gallery the way it does today (also true of `orgApproveBtn`, likely the same fix once Reviewer pane feedback is folded in).

Deliberately not scoped further yet -- the user wants to look at the Reviewer pane next for additional feedback before any of this gets built, since a single pass across all three affected views (self-review, org-approval, and whatever the Reviewer pane review turns up) is preferable to fixing this piecemeal per view.

## Backlog: sign-in state isn't consolidated -- reported as "why do I have to authorize twice" (2026-08-27)

Direct report: signed in and shown as such at the top of the page, but the indexer's own submit button still read "Sign in to submit." Checked the actual code, not assumed -- this is exactly the two-session-slot design working as built, not a bug in the strict sense, but the user is right that it's a real UX problem worth rethinking, not just explaining away.

**Root cause, precisely:** `web/auth.js` deliberately keeps TWO separate sessions in two separate `sessionStorage` slots -- classic OAuth (`getSession()`) and the GitHub App's user-to-server login (`getAppSession()`) -- because a maintainer can legitimately need both live at once (classic OAuth to browse/review, the App session only for the moment they submit directly). The top-of-page auth status (`renderAuthStatus`) shows "signed in" if EITHER session exists. But `indexer-review.js`'s `updateSubmitSignInUI()` (line ~60) specifically checks `getAppSession()` alone, since `/direct-submit` is GitHub-App-only by design (see the GitHub App migration entry above) -- so someone signed in via classic OAuth only sees "signed in" at the top and "Sign in to submit" right below it, which reads as broken even though both are behaving exactly as coded.

**The user's own framing is the right question, not just a complaint**: "I feel we have to authorize the app multiple times rather than one sign in" -- correct, and worth a real design pass, not a quick patch here. GitHub does not allow merging a classic OAuth App and a GitHub App into a single token/authorization (confirmed earlier in this project's own research into the App migration) -- they are fundamentally separate registrations with separate consent screens. So "one sign-in" would mean either (a) dropping the classic OAuth path entirely and using the App for everything, accepting whatever that costs the flows that currently rely on the user's own broader `public_repo` access, or (b) chaining the two consent screens into what LOOKS like one sign-in flow to the person using it (App auth first, silently followed by classic OAuth, or vice versa) even though two real GitHub authorizations still happen underneath, or (c) some other reframing not yet considered.

**Explicitly scoped as its own PR, not folded into this one** -- per direct instruction, this needs its own think-through on the actual sign-in architecture rather than a quick UI patch on top of the current two-slot design.

# TheBlayde's AI Ledger

A record of how this project was actually built: what Claude generated,
what the user (GitHub: @TheBlayde) steered or corrected, and an honest
accounting of who shaped the final product. Written to be read by anyone
curious how much of this was "AI did it" versus "a person drove this the
whole way" -- the real answer is neither extreme, and this document is
more useful for saying specifically where each mattered than for a vague
ratio.

If other contributors keep their own ledger of their AI-assisted work on
this project, it lives here too, named the same way: `ledgers/<your
github handle>_AILedger.md`. This one covers the founding build and
every design session since.

**Kept alongside `CHANGELOG.md`, not instead of it.** CHANGELOG.md is
the chronological record of *what* changed, entry by entry. This file is
the record of *who steered what* across the same work -- update both
together when a session produces real design decisions, not just code.
CHANGELOG.md's header points back here for the same reason.

## How to read this

Each section covers one area of the project and notes, concretely,
which decisions originated with the user (steering, correction, creative
direction) versus which were Claude's synthesis or execution once given
a direction. Corrections are called out explicitly, including Claude's
own mistakes -- this ledger is not a highlight reel.

## Project origin and framing

**User-originated, entirely.** The core idea -- index a copyrighted shop
manual's structure, keep the manual's own pixels out of any public repo,
crowd-source replacement photos, patch them back into a personal copy --
was the user's from the first message. Claude's first real contribution
was identifying the legal shape that made it viable (structure-only
public index, never redistribute source pixels) and building the
indexer against a real 415-page PDF to prove it worked at all.

## Photo detection and the review gallery

**Mixed, with Claude's early technical misses caught through iteration.**
Claude built the density-based photo detector, and it was wrong more than
once before it worked: it initially treated every strip of a tiled scan
as a separate "photo" (7,955 false positives on the first pass), then
under-cropped real photos leaving slivers of the original image visible
during a patch test -- both were things Claude found through its own
verification passes, not things the user had to catch. The user's real
steering here was **product-level**, not technical: after seeing the
first review pass, the user specifically asked for a way to correct
false positives *without* punishing contributors for the detector's
mistakes ("I don't want someone's terrible photos, but if someone's doing
the hard work I don't want to set them up for rejection either") -- that
framing is what shaped the omit/undo/multi-select UI, the "needs
manual review" language, and later the missing-figure and crop-editing
modes. The specific UI polish requests (pill-shaped omit badge with
"OMITTED ×" text, pinned lighter toolbar, Esc-to-close, zoom fit/100%
toggle, label visibility toggle) were all direct user asks after seeing
a working version -- Claude built first drafts, the user redirected
each one based on actually using it.

## The photomosaic and stylization filter

**Correction, made after the user caught it:** an earlier draft of this
ledger credited the photomosaic concept itself to Claude. That was wrong,
and worth leaving visible here rather than quietly fixing, since getting
attribution wrong in a document about attribution is exactly the kind of
mistake this ledger exists to catch.

**The concept was the user's, in specific and unprompted detail.** The
user proposed, unprompted: digitally recreate the manual's own title
image; the cover page's completion stat becomes that recreated image
filling in tile by tile as contributions come in; the fill positions map
to the *physical, three-dimensional location* of each procedure on the
actual vehicle, not a flat grid or a heatmap. That is the entire core
mechanic of what shipped. Claude's contributions were downstream of that
idea, not the source of it: catching that using the manual's actual OEM
cover photo as the target image was a sharper copyright risk than
anything else in the project (a photomosaic's whole point is
recognizable resemblance to a specific image, which is a different legal
shape than the structure-only indexing everywhere else), and proposing
community hero-photo-as-target with a generic silhouette as a bootstrap
fallback. Claude then executed that fallback badly, a hand-drawn
silhouette the user correctly called amateurish ("why does it look like
a 3 year old drew it"), and the user pushed back a second time, both on
the weak execution and on the idea of using anything not actually tied
to the real manual ("no reason to arbitrarily create a motorcycle that
has nothing to do with the manual"). The fix that actually shipped, a
stylization filter run against a real community photo instead of a
hand-drawn placeholder, was the user's proposal. So was the "vector
outline until filled, not a flat grey fill" redesign, a real improvement
over what Claude had built. Claude's real contribution here was
execution: the working filter (`stylize.py`), the zone/tile rendering
(`mosaic.py`), and the copyright catch. The idea, twice refined, was the
user's the whole way through.

## Licensing and legal architecture

**Claude drafted the initial position, the user's question caught a real
mistake in it.** Claude wrote the first LEGAL.md, including a
recommendation of CC-BY-SA for contributed photos. When the user later
asked directly "how do I make sure I don't lose rights by going open,"
answering that question honestly required admitting CC-BY-SA was the
wrong call -- its copyleft clause would have permanently blocked any
future commercial or dual-licensing path, which conflicts with what the
user actually wants preserved. That correction (to CC-BY 4.0) was made
in direct response to the user's question, not caught proactively by
Claude beforehand. The AGPL-vs-MIT decision for the code followed the
same shape: Claude built the side-by-side comparison the user asked for,
but the user made the final call, and the reasoning that mattered most
(preserving a future dual-licensing lever) came directly out of the
user's stated goal of eventually stepping back from the project.

## Registry and governance model

**The user's corrections were the most consequential technical steering
in the whole project.** Claude's first governance design was genuinely
wrong: it implied the same small org-level maintainer team would review
every photo PR across every vehicle, which does not scale and was never
actually the intent -- just an imprecise first pass. The user caught this
directly ("that's insane if true") and the fix (org maintainers gate
*new vehicle onboarding only*, each vehicle repo gets its own
independent maintainer pool) reshaped the entire registry design. The
user also pushed a factual question Claude hadn't verified yet -- whether
GitHub's storage limits apply per-repo or across a whole org -- which
turned out to matter enormously for whether the "many vehicles" design
was viable at all. The two-tier registry model (vehicle -> multiple
independent manual editions), the human-in-the-loop requirement on any
cross-edition photo matching, and the "selectable compatible series"
idea were all the user's, built out from a single sharp question ("what
if there are different manuals for the same vehicle").

## The phone contribution flow

**User-originated concept, Claude's job was mostly finding out what's
actually true.** The QR-in-the-PDF idea, the local-only-contribution
idea, and the session-scoped completion checklist ("did I do Engine Pic
3 yet?") were all the user's. Claude's contribution was research, not
design: verifying (via web search, not assumption) that GitHub doesn't
support PKCE and that a truly zero-server phone-to-GitHub flow isn't
possible, then finding the real-world precedent (Decap CMS's proxy
pattern) that got closest to what the user wanted. When the user pushed
back on that -- "if I'm already logged into GitHub in my phone browser,
doesn't that solve it?" -- the honest answer required explaining a real
browser security boundary (cross-origin cookie isolation) the user
hadn't hit before, and that pushback is *specifically* what surfaced the
self-service Personal Access Token option as a genuinely zero-
infrastructure alternative Claude hadn't offered in the first pass.

## Diagrams (org structure, governance, ownership)

**Almost entirely user-directed through iteration.** Claude built the
first version of the org-structure diagram from the registry design
already agreed on, but nearly every subsequent change was a direct user
correction: swap the placeholder vehicles (Ford F-150, Toyota Corolla)
for the user's real three (Suzuki SV650, Nissan 300ZX, Datsun 620);
visualize multiple manual editions per vehicle; fix "own maintainers"
reading as awkward and replace it; show the 5-org-maintainer approval
pool with real quorum numbers, not just an abstract governance
description; vary the maintainer-count visualization per vehicle instead
of repeating the same shape three times. Twice, Claude placed caption
text directly across the diagram's connector lines and the user caught
it both times ("you put grey text in those lines again") -- the second
occurrence after Claude had already "fixed" the first one elsewhere in
the same diagram, which is a real repeated execution mistake, not just a
one-off.

## Naming

**User's call, straightforwardly.** "Blayde's Manual" to "Blayde
Manual" was a direct instruction, executed as a clean rename across
code, docs, and the rendered PDF cover page.

## Version discipline and the manual security review

**User-originated process, Claude-executed content.** The user asked
directly for version tagging and a real `CHANGELOG.md` going forward --
a process decision, not a design one. Separately, Claude attempted to
run the `security-review` skill and it failed to load correctly in this
sandboxed environment (a working-directory detection issue the skill
itself couldn't resolve); rather than give up or fake a result, Claude
conducted the review manually and found 4 real issues (unbounded fetch
sizes, one bad photo aborting a whole patch batch, an unpinned CDN
dependency, and confirmed the CI workflow's trigger type was already
safe) -- all fixed, all verified.

**Correction, caught by the user on 2026-08-24:** the paragraph above
originally read the user's "it's good enough we tried" as acceptance of
the manual-review substitute process. That was wrong -- the user has
confirmed that line was about the versioning/CHANGELOG decision in the
same message, not an endorsement of the security review's completeness,
and had not weighed heavily on that list at all. Left here rather than
silently fixed, same standard as the photomosaic misattribution above:
this ledger is not exempt from the mistakes it exists to catch. The
actual, separate question of whether the security review has open holes
is addressed on its own terms below, not inferred from that quote.

## Trust and content-verification questions

**Almost entirely user-originated, and among the sharpest catches in the
project.** In one message, the user raised five real gaps at once: could
a malicious file exploit the contribution pipeline; could someone
register an unrelated PDF ("a rooster collection") as a vehicle manual
since maintainers never see the source content; what's actually running
under the hood when a manual is patched; should a PR require a link to
where the source manual came from; and what quality bar applies to
maintainers, not just contributors. The rooster-PDF question in
particular is a genuine architecture blind spot the user found, not
something Claude had flagged -- the registry's "structure only, never
pixels" design (correctly protecting copyright) had the side effect of
giving maintainers no way to verify a submission's content at all.
Claude's job was verifying real answers rather than reassuring: checking
the CI workflow's actual trigger type against GitHub's docs, confirming
the shipped tool runs no AI at request time (deterministic
image-processing and local OCR only, verified against the actual code,
not asserted from memory), and designing the fix for the rooster-PDF gap
-- requiring `source_identifier` on every vehicle proposal and pointing
maintainers at `manifest.json`'s OCR'd `section_heading` strings as the
one signal that's hard to fake without real matching content to index.

## Quality bar and marketing copy

**User set a hard creative constraint, Claude wrote to it.** Asked to
define quality standards for contributors and maintainers, the user gave
an explicit, specific brief rather than leaving it open: "the very first
person who reads this needs to either say 'that's easy, I'm in' or they
move on... reddit threads... reasonable quality," with an explicit
rejection of "ad nauseam documentation." That constraint directly shaped
what shipped -- a four-bullet quality bar in `CONTRIBUTING.md`, not a
policy document -- and Claude's own first instinct (a fuller maintainer
succession/removal policy) got explicitly re-scoped down to "before it's
load-bearing," not a v1.0.0 requirement, once the user's framing made
clear that heavier documentation would work against the project's actual
goal. The FAQ's AI-transparency entries (the AI-at-build-time vs.
AI-at-runtime distinction) were a direct execution of the user's ask,
tagged explicitly for "marketing review, light but informative."

## The contribution and review architecture

**The user set the process discipline first, then originated the core
architecture, unprompted, in specific detail -- the same pattern as the
photomosaic and registry sections above.** Before any of this was
designed, the user set a hard rule: "I want that entire solution
wireframed before you work it" -- every subsequent screen in this
project went through a wireframe pass before any code changed, at the
user's insistence, not Claude's default process.

Within that process, the user's own sharp question -- "are contributors
reading the PDF in a browser session, or is OCR data landing the
overlays, where's the line" -- surfaced a real problem Claude had not
caught: a bare `section_heading` string isn't reliable context for a
stranger deciding what photo to take, and worse, a naive "browse what's
missing" feature could accidentally drift toward showing manual content
publicly that the architecture was built specifically to keep local.
Claude's contribution was resolving that concern precisely rather than
vaguely: writing "the local-context rule" into `LEGAL.md` (page content
can only ever be shown from a viewer's own already-loaded file, in their
own session) as the actual test any future feature has to pass.

The four-tier contributor ladder (anonymous -> hidden contributor ->
credited contributor -> maintainer) was the user's design, proposed
unprompted and in specific detail, including the resync question ("this
data is useless though because it can't be resynced later, right?") that
turned out to correctly distinguish tier 1 from tier 2. Claude's real
contribution here was a correction the user hadn't caught: the "hidden"
tier isn't actually private -- a fork of a public GitHub repo is itself
public -- so the ledger and the design now call it "unlisted," not
"private," a distinction that matters for anyone reading the eventual
UI copy literally.

The pivot to contribute links/QR codes embedded directly in the
generated PDF, replacing an earlier browser-session-based design, was
the user's idea, triggered by a clarifying question about how the
patched PDF is actually delivered (a download, not an in-browser view --
Claude verified this against the real code rather than assuming). The
user then pushed further, unprompted, on why this needed to be a *core*
feature rather than a later one, and separately caught that a real
camera-based contributor needs a genuinely clickable link, not just a
QR code -- Claude's job there was research: checking `@cantoo/pdf-lib`'s
actual documented capabilities (no native link-annotation support found)
and proposing a three-layer fallback (auto-linking printed URL text, QR,
true annotation as a stretch) rather than either overclaiming feasibility
or abandoning the requirement.

## Auth: reversing Claude's own PAT-first recommendation

**The user's instinct was right, and it overturned Claude's own earlier
design.** Claude had originally recommended a self-service Personal
Access Token as the "zero-infrastructure" path for casual contributors,
reasoned through carefully at the time but never checked against what
comparable consumer products actually do. The user pushed back with a
plain, correct instinct: "I think that's asking too much, do other sites
ask that much?" That question is what triggered the actual research --
checking that Wikimedia Commons, iNaturalist, and Reddit all use one-tap
OAuth, never manual token generation, and separately verifying against
GitHub's own docs that a single `public_repo` OAuth scope covers
everything the PAT's three fine-grained permissions did (fork, push,
create a repo, open a PR). The reversal from PAT-first to OAuth-first was
Claude's design correction, but it happened only because the user's
skepticism was the thing that made checking worthwhile in the first
place -- Claude's original PAT recommendation would have shipped
unquestioned otherwise.

## The browser indexer port: the user overruled Claude's own scoping call

**A direct, and correct, override of Claude's own recommendation.** Faced
with the fact that onboarding a new vehicle requires running `indexer.py`
(PyMuPDF + Tesseract, a local Python CLI) at least once, Claude's first
instinct was to recommend keeping that as a one-time local script rather
than porting the whole indexing pipeline to the browser -- a reasonable-
sounding scope-reduction call. The user rejected it directly: "I need you
to weight them more... that one-time function is superfluous because
they don't even own the end result, they just manage it after it's
approved... I'd love the browser version." That's a sharper argument than
Claude's own reasoning had produced -- the asymmetry between what's being
asked of Persona A (local software) and what they actually get back
(custodial responsibility, not ownership) is what tipped the real
decision, and it came from the user catching a weakness in Claude's own
proposed scope-down, not the other way around. Claude's job after that
was verifying it was actually buildable rather than just agreeing:
confirming PDF.js and Tesseract.js cover every primitive PyMuPDF and
Tesseract provide today, then running a real feasibility spike (not
another estimate) against the project's actual 415-page test manual,
timing sequential versus 8-worker-parallel OCR with real numbers. The
5-minute ceiling and the "can we chunk it and run processes
simultaneously" idea were the user's; the ~4.6-minute extrapolated
result, with its caveats stated plainly rather than oversold, was
Claude's verification of whether that idea actually worked. Multi-part
manuals (one edition split across several physical files) and
multi-language support were both raised by the user, unprompted, as
things to "be ready for" -- Claude's contribution was the concrete
schema design (a list of `{part_id, sha256}` pairs sharing one manifest)
that fit the existing fingerprint-matching architecture without a
redesign. The user's final framing -- "this is what we wanted... it's a
one-time pain... we just don't want you to have to download anything" --
is what turned the browser port from a tentative default into a stated,
firm project value, written into `ROADMAP.md` as a decision rather than
an option still on the table.

## The Maintainer Portal, role-based gating, and a real security finding

**Structure was mostly user-directed, in rapid, specific corrections
after seeing each pass.** The idea of consolidating indexing, photo-
request review, vehicle-team management, and org-level approval behind
one shared sign-in (rather than a gate per tool) was the user's,
prompted directly by noticing the batching problem an earlier per-tool
design created. Tab order, dropping the REPO scope badge while keeping
ORG, defaulting a not-yet-active maintainer to "Index a New Vehicle"
instead of a disabled tab, the full-bleed light-grey vehicle-separator
treatment, "Turn/Into this" label styling -- all specific, immediate
user corrections after seeing a first draft, not open-ended requests.
Claude's execution included one real piece of independent design
reasoning worth naming: when asked to build "Approve New Vehicles" for
org-level maintainers, Claude flagged on its own (before being asked)
that reusing `indexer-review.js`'s rendering functions directly would
create a real bug -- two review sessions sharing mutable global state
could silently clobber each other if both tabs were used in one
sitting -- and built a separate file with the same rendering *pattern*
instead. That diagnosis and the fix were Claude's, unprompted.

**The tab-visibility question was posed by the user as an open choice,
not answered by them.** "Would you recommend hiding that tab if they
in fact aren't an ORG manager? OR... read only?" -- both options were
the user's framing, but which one to build was left to Claude's
judgment, with reasons requested. Claude's recommendation (read-only,
not hidden -- useful before starting duplicate work, consistent with
an existing "disabled but visible" pattern, low information-sensitivity
of what's shown) was accepted as given.

**A real security property was found through the user's own question,
not asserted by Claude first.** Asked directly whether an org-level
role would let someone "escape" into repo-scoped actions they don't
actually have, Claude's answer -- that this app never stores
credentials, so GitHub's own permission system is the actual authority
and client-side role flags are UX only, not a security boundary -- was
verified against the existing code (`review-panel.js`'s repo-scope
guard already worked this way) rather than invented, and the honest
caveat (today's mock build has *zero* real security, `MOCK_MAINTAINER`
is a plain editable object) was stated alongside it rather than left
implied. This became a real, logged finding in `ROADMAP.md`'s security-
review section, prompted entirely by the user's question.

## The landing-page hero graphic: five corrections in a row

**Worth recording precisely because Claude's own choices needed
correcting repeatedly here, more than in most other stretches of this
project.** The sequence: (1) Claude's first progress-visualization
concept was a hand-drawn vector rider on a motorcycle, cycling through
four pixel-art "eras" -- the user rejected the whole approach ("we are
ditching the bike idea, scrap it") and redirected to using a real photo
of their own engine instead, with a specific aesthetic reference (the
manual's own halftone-scanned Tappet Clearance page) that Claude had to
go find and actually look at, not assume. (2) Once built against the
real photo with a 10-generation clarify animation, the user caught a
real conceptual problem Claude had missed: a single photo gradually
sharpening reads as AI photo enhancement, directly contradicting this
project's own "no AI runs here" claim stated elsewhere on the same
page -- patching is a hard replacement, not an improvement of the
original. (3) The fix (a static stage-1/stage-10 pair, no animation)
was proposed by the user, not Claude. (4) Claude then picked red for
the "before" (bad) word in the resulting headline -- the user pointed
out red is this project's brand/action color, used for good things
everywhere else, so tying it to "bad" fought the rest of the page.
Claude's fix (mint for "after") was *also* wrong, caught by the user a
message later: mint was never actually decided as a brand color, just
a utility accent for monospace log text, and promoting it to headline
weight overstated it as branding it hadn't earned. (5) The user then
specified the final label structure directly, word by word ("Turn
(white) THIS (grey)... into (white) THIS (red)"), which Claude
implemented as given. Net: the concept, the color corrections, and the
final structure were all the user catching or directing something
Claude had gotten wrong or hadn't thought through -- Claude's real
contribution in this stretch was mostly technical execution (the
ImageMagick halftone/level pipeline, and finding + fixing its own bug
in the compose-blend direction, verified empirically rather than
assumed from the option name) plus one piece of image-editing follow-
through the user asked for directly (white-balance/contrast/unsharp
pass on the demo photo itself, since "I don't have the greatest
camera").

## The Contributor Portal and the batching architecture

**A genuine back-and-forth where the user's questions changed Claude's
own recommendation, not just approved it.** Once QR codes needed a real
destination, Claude laid out three architecture options (anonymous
one-at-a-time, client-side/device-local batching, full sign-in-up-
front) and initially recommended the middle one, reasoning that it
preserved the project's existing "no account until the moment of real
commitment" principle. The user's two follow-up questions -- how
credit works for anonymous uploads, and specifically "I have a screen
with this guide and I want to scan the QR with my phone out of band" --
exposed a hard technical wall in that recommendation: two devices never
share browser storage, so device-local batching cannot work for the
exact scenario (scan on your phone, guide open elsewhere) that QR
codes in a printed/digital manual exist to serve. Claude's
recommendation reversed to the third option as a result, but reframed
to keep as much of the original principle intact as the storage model
actually allows (anonymous browsing always, sign-in deferred to the
moment something needs to persist, not to landing on the page) -- this
is the same shape of correction the ledger already has one example of
(the PAT-vs-OAuth reversal earlier in this project): not "Claude got a
fact wrong," but "the user's question forced a more rigorous pass over
Claude's own reasoning, and the reasoning didn't survive it."

**A real product gap was found by the user asking a direct question,
not by Claude noticing it first.** "Should they be able to see their
submissions or rejections? Will maintainers be able to leave notes?"
-- Claude checked the actual code rather than assuming, confirmed
accept/reject only ever logged a message and never persisted any
outcome (a contributor's status would show "submitted," permanently,
regardless of what a maintainer did), and fixed it. This is a case
worth naming plainly: the gap existed in code Claude itself had written
earlier in the same session, and Claude did not catch it until asked.

**Smaller corrections in the same stretch, each user-driven:**
grouping "My uploads" by collapsible vehicle, sorting both review and
upload lists by page instead of submission order, surfacing the actual
contributed filename instead of the redundant procedure ID, adding a
"view whole page" option alongside the crop compare, and catching that
one mock section heading had an inconsistent chapter-number prefix the
others didn't. All were the user reviewing a working version and
pointing at something specific, not Claude proactively refining its
own output.

## Honest summary

The big architectural bets -- crowd-sourced photo replacement on a
structure-only public index, per-vehicle self-governing repos, QR/phone
contribution, the photomosaic-as-progress-metaphor -- originated with the
user. Claude's largest independent contributions were technical: turning
those ideas into working code (the indexer, the patcher's coordinate
math and idempotent re-patch logic, the review gallery's interaction
model, the stylization filter), catching some of its own mistakes
through verification before they shipped (the false-positive detector,
the under-cropped bboxes, the invalid-XML comment bug), and doing real
research rather than guessing when a design question turned on an
external fact (GitHub's OAuth and storage-limit behavior). But on
several of the moments that mattered most -- the photomosaic's copyright
risk, the CC-BY-SA licensing mistake, the governance-scaling error, the
diagrams' repeated line-collision bug -- the correction came from the
user noticing something Claude had gotten wrong or hadn't fully thought
through, not from Claude catching it first. This was a genuinely steered
collaboration, not a one-shot generation the user lightly reviewed.

One more data point worth including precisely because of what it is: an
earlier draft of this ledger itself misattributed the photomosaic's core
concept to Claude, when the user had proposed it first, unprompted, in
specific detail. The user caught that too. A document about who steered
what got its own attribution wrong and needed the same correction as
everything else in it -- which is a reasonable thing to sit with when
weighing how much independent judgment to place in anything Claude
writes, including this file.

**The pattern held through the design-heavy session that produced the
sections above, and sharpened in one specific way.** The rooster-PDF
verification gap, the four-tier contributor ladder, and the "weight
these more, that one-time function is superfluous" override of Claude's
own indexer-scoping call were all the user finding a real problem or a
real weakness in Claude's own prior reasoning, not the reverse. What's
different from earlier in the project: several of this session's Claude
contributions were reversals of Claude's *own* recommendations under
user pressure to check rather than assume (PAT-first flipped to
OAuth-first only after the user's "do other sites ask that much"
question forced a real comparison; the local-install indexer scope-down
flipped to a full browser port only after the user rejected the
reasoning behind it directly), which is a slightly different shape than
earlier corrections -- less "Claude got a fact wrong," more "Claude's
own scope-reduction instinct was the wrong call, and the user's appetite
for doing this properly was higher than Claude's first draft assumed."

**The pattern held again through the Maintainer Portal / Contributor
Portal stretch, with one new wrinkle worth naming.** The security-
architecture finding, the batching-storage wall, and the missing
accept/reject persistence were all real things Claude got right *once
asked the right question* -- the user's questions did the work of
surfacing what to check, and Claude's contribution was answering
rigorously rather than reassuringly once asked. The landing-page hero
graphic stretch is the clearer counter-example, though: five real
corrections in a row, on a single piece of work, most of them things a
harder look before shipping the first draft might have caught (the
AI-enhancement implication, tying red to "bad" on a page whose whole
brand is red, promoting an undecided utility color to headline
weight). That density of correction on one deliverable, more than
almost anything else in this project's history, is worth sitting with
plainly rather than folding into the general pattern above.

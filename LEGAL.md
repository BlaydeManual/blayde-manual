# Legal notes for Blayde Manual

Not legal advice. This is a working list of the actual legal exposure in this
project's design, so decisions get made with eyes open instead of by accident.
Talk to an actual IP/copyright lawyer before a public launch with any traction.

**PIN: nothing from this project (code, repo, or any output) leaves this
computer -- no push, no publish, no posting anywhere -- until this whole
document has been reviewed again, deliberately, in one pass.** Not because
anything here is currently wrong, but because licensing choices made before
outside contributions land are cheap to get right and expensive to undo
after the fact (see the CC-BY-SA correction below for a live example of
exactly that).

## The core risk: copyright on the OEM manual

Suzuki (or whoever holds rights to the manual text/photos/diagrams) owns that
content. That's true whether it's the original printing or a manualslib
re-scan. This applies to:
- The scanned page images themselves
- The instructional diagrams (hand-drawn line art, torque diagrams, etc.)
- The written procedure text

**What this repo must never contain:** the manual's own images or copied
text, in any branch, in any commit history (deleting a file later does NOT
remove it from git history -- a takedown would still be triggered by history
that still has it).

**Why the architecture already avoids this:** the indexer runs locally
against a PDF the user already owns, and only `manifest.json` (page numbers,
inferred section labels, OCR'd headings, pixel coordinates) goes into the
public repo. Structural facts like "there is a photo at this location, on
this page, in this edition" are not themselves creative expression -- that's
the same legal footing as a published TV/movie episode guide or an index of
Bible verses: cataloguing where things are is different from reproducing them.
This is a reasonable position, not a guaranteed one -- see below.

**The local-context rule.** Raised directly in design review, worth
stating as a standing rule rather than a one-off decision: the public
repo/registry can never show *page-level* content -- not a rendered
page, not a crop, nothing beyond the structural facts above -- because
it never has that content to show. The one place page-level context is
allowed to exist at all is inside a single person's own browser session,
rendered from a PDF *they* already loaded, that they already own, that
never left that tab. Showing someone page 42 of their own file, back to
them, in their own session, isn't distribution in any copyright sense --
it's just their file. Any future feature (a post-patch "here's what your
copy is still missing, want to add a photo" screen, for example) is fine
exactly to the extent it only ever pulls page content from the viewer's
own already-loaded file, and never from a stored/shared source. The
moment a feature would need to show page content to someone who *hasn't*
loaded that specific PDF into that specific session, it's crossed back
into the public-repo restriction above and can't happen.

## Where the reasonable position gets shakier

- **OCR'd heading/section text -- resolved, 2026-08-25: eliminated, not
  shortened.** The compilation/selection-and-arrangement nuance named
  below (never fully resolved) turned out to have a cleaner fix than
  capping or dropping individual fields: `procedure_id` and
  `section_heading` are now purely positional (`p155_proc2_fig1`,
  "Page 155, procedure 2"), generated from page number and a per-page
  sequential counter -- never from the manual's own extracted text.
  `page_text_excerpt` is removed entirely, not capped. The real OCR'd
  heading text is still *used* internally, during indexing, to detect
  where one procedure ends and the next begins -- that's a genuinely
  useful signal -- it's just never *persisted* anywhere. This isn't a
  smaller version of the short-phrases argument, it sidesteps the
  argument: there's no expressive text left in the manifest to classify
  as a short phrase or a systematic compilation of them, so the question
  this section originally raised no longer applies. A wrong synthetic
  label also costs nothing a wrong text-derived one didn't already risk
  costing -- the live compare view (patcher/review tools rendering the
  maintainer's own copy) is the actual verification mechanism; the label
  was never load-bearing. Applied to both real generation paths
  (`indexer.py` and `web/indexer-core.js`) and to the already-generated
  `output/suzuki-sv650/manifest.json` + its sidecar files, remediated in
  place with a consistent old-id -> new-id remapping.
  **Original finding, 2026-08-24** (kept for the record): short phrases
  ("TAPPET CLEARANCE", "Inspect every 24 000 km") were almost certainly
  fine on their own (facts/short phrases aren't copyrightable, and a
  maintenance interval has essentially one natural phrasing under the
  merger doctrine), but the `page_text_excerpt` field pulled up to 400
  characters of real body text on text-layer PDFs, and a *systematic*
  extraction of near-verbatim sentence fragments across an entire
  manual (confirmed in practice: up to 60 characters per heading, 916
  of them, including the manual's own copyright notice slugified
  verbatim into a tracked filename) edged toward a thinner, different
  category of protection than any single phrase.
- **Vehicle-specific spec numbers** (torque values, clearances, fluid
  capacities): numeric facts generally aren't copyrightable on their own,
  but wholesale reproduction of an OEM spec table might still draw a
  complaint even if it wouldn't hold up. Cheap to sidestep: keep the public
  manifest to "there's a spec box here for X" rather than the actual numbers.

## Trademark (separate from copyright)

"Suzuki," "SV650," the model name, and any logos are trademarks. Using them
to accurately describe *which vehicle this documentation is for* is
nominative fair use (same as saying "compatible with iPhone" on third-party
gear) -- fine. The line not to cross: nothing that implies Suzuki made,
endorsed, or is affiliated with this project. Put a disclaimer on every
repo's README: *"Blayde Manual is an independent, community-run project.
Not affiliated with, endorsed by, or sponsored by [manufacturer]."*

## Contributed photos: license clearly, up front

Every photo a contributor submits needs an explicit license grant at
submission time (PR template checkbox, not buried in CONTRIBUTING.md).
This also needs a statement that the contributor is submitting their own
photo (not one lifted from a forum post or someone else's Instagram) --
same copyright problem one layer down.

**License choice: CC-BY 4.0, not CC-BY-SA.** (Corrected here -- this doc
originally said CC-BY-SA, which was wrong for what the project owner wants
to preserve.) CC-BY-SA is copyleft: "share-alike" means anything built on
top of contributed photos -- including a future commercial or dual-licensed
version -- would also have to be released free and open. That permanently
forecloses any future monetization or data-licensing path (see project
chat: the "should this stay free, and does that cost me future options"
discussion). CC-BY keeps the same spirit -- attribution required, freely
usable by anyone -- without that lock-in.

**Why this matters more than most license choices:** you (as the original
author) can always relicense your *own* code later, because you hold that
copyright outright. You cannot unilaterally relicense *someone else's*
contribution after the fact without going back and getting their
permission -- tracking down every past contributor to renegotiate terms is
exactly the mess several real open-source projects have gone through
(MongoDB, Redis, HashiCorp all did contested relicensing fights rooted in
this same problem). The fix is free right now, before any outside
contributions exist: pick the right terms once, up front.

## Code license: AGPL-3.0, not MIT

Same "decide before outside contributions exist" logic as the photo
license above, applied to the code itself. MIT would let a well-resourced
fork take this code, close it, and run it as their own paid hosted
service with zero obligation to give anything back -- legally, that's
exactly the "Chilton digitizes it, closes it, resells it" scenario from
the ownership/liability discussion. AGPL keeps the code just as free for
every actual hobbyist contributor (identical experience for them either
way) while adding one real obligation: anyone who runs a *modified*
version of this code as a network service has to publish their
modifications too. That closes the closed-fork-as-a-service path without
touching the photo licensing at all -- those are two separate axes.

It also keeps a real monetization option open that MIT would foreclose:
as sole copyright holder (true today, before outside code contributions
land), dual-licensing is available later -- selling a company a
non-AGPL commercial license so they can embed the code without copyleft
obligations, the same model MongoDB and others built actual revenue on.
MIT gives everything away for free, permanently, with no lever left to
pull; AGPL keeps that lever.

## Liability: this is a *repair manual*

People will use this to work on a machine that can kill them or someone else
if a torque spec or procedure is wrong. That's a materially different risk
profile than a photo gallery. Needs, at minimum:
- A visible disclaimer on every page/repo: informational/community-sourced,
  use at your own risk, verify safety-critical specs (torque, brake/fuel
  system procedures) against an authoritative source.
- No warranty language in the repo license (standard MIT/CC boilerplate
  already covers this, but say it plainly too, not just cite the license).

## DMCA process

Once this is public, someone will eventually file a takedown notice, valid
or not. Decide in advance:
- A named point of contact / process for responding to takedown requests
  (GitHub has a formal DMCA process for repos, independent of anything set
  up below -- a notice can hit either path)
- A fast path to strip a specific contested file/commit range if needed,
  without nuking the whole project

**Decided, 2026-08-25: `legal@blaydemanual.com`**, not a generic `info@` --
a purpose-specific address reads as intentional to someone hunting for
where to file, and doesn't get missed in general support traffic. A
published address alone gets a documented process, but does not by
itself grant DMCA safe-harbor legal protection -- that requires actually
designating this address as the DMCA agent with the U.S. Copyright
Office's directory (dmca.copyright.gov/osp, ~$6, renews every 3 years).
The real exposure this covers isn't the manuals themselves (never
hosted here, see the architecture above) -- it's contributor-submitted
photos, genuine user-generated content this project does host.
**TODO once the domain is live:** register `legal@blaydemanual.com` as
the official DMCA agent. Targeting the same day as the rest of the
GitHub/OAuth/domain migration, not a separate later pass.

## Bottom line for now

At current scale (one repo, not yet public, no contributors), none of this
blocks continuing to build locally. The concrete pre-launch action items:
1. ~~Shorten/remove `page_text_excerpt` in the manifest before anything goes
   public~~ -- done, see indexer.py
2. Add the non-affiliation disclaimer + CC-BY 4.0 contributor photo-license
   checkbox to the repo scaffold before opening it to outside contributors
3. **Do a final, deliberate re-read of this whole document before anything
   is pushed, published, or posted anywhere off this computer** -- see the
   pin at the top. Treat that review as its own explicit step, not something
   that happens implicitly while doing something else.

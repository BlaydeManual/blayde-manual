# Legal notes for Blayde Manual

Not legal advice. Talk to an actual IP/copyright lawyer before a public
launch with any real traction.

## The core risk: copyright on the OEM manual

Suzuki (or whoever holds rights to the manual text/photos/diagrams) owns:
- The scanned page images themselves
- The instructional diagrams (hand-drawn line art, torque diagrams, etc.)
- The written procedure text

**What this repo never contains:** the manual's own images or copied
text, in any branch, in any commit history.

**How the architecture avoids this:** the indexer runs locally against
a PDF the user already owns. Only `manifest.json` (page numbers,
positional procedure markers, pixel coordinates) goes into the public
repo. Cataloguing where things are is not the same as reproducing them.

**The local-context rule:** the public repo/registry never shows
page-level content. Page-level rendering only ever happens inside a
single person's own browser session, from a PDF they already loaded,
that never left that tab. A feature may only ever pull page content
from the viewer's own already-loaded file, never from a stored or
shared source.

## Where the reasonable position gets shakier

- **OCR'd heading/section text.** Nothing from the manual's own words
  is collected or stored anywhere. `procedure_id` and `section_heading`
  are purely positional markers (`p155_proc2_fig1`, "Page 155,
  procedure 2") -- a page number and a counter, generated fresh from
  content that only ever exists in the user's own browser.
- **Vehicle-specific spec numbers** (torque values, clearances, fluid
  capacities): keep the public manifest to "there's a spec box here for
  X," not the actual numbers.

## Trademark (separate from copyright)

"Suzuki," "SV650," the model name, and any logos are trademarks. Naming
the vehicle a manual documents is nominative fair use. Every repo's
README carries: *"Blayde Manual is an independent, community-run
project. Not affiliated with, endorsed by, or sponsored by
[manufacturer]."*

## Contributed photos

Every photo submission requires, at submission time: an explicit
CC-BY 4.0 license grant, and a statement that the photo is the
contributor's own (not lifted from a forum post or someone else's
Instagram). Built into `contribute.js` as two required checkboxes, not
buried in `CONTRIBUTING.md` or left as an unenforced PR-template line.

**License: CC-BY 4.0, not CC-BY-SA.** CC-BY-SA's copyleft would force
anything built on top of contributed photos, including a future
commercial or dual-licensed version, to also be free and open. CC-BY
keeps attribution required without that lock-in.

## Code license: AGPL-3.0, not MIT

AGPL, not MIT. MIT would let a well-resourced fork close the code and
run it as a paid hosted service with no obligation to give anything
back. AGPL keeps it free for every hobbyist contributor while requiring
anyone running a modified version as a network service to publish
their modifications too. It also keeps dual-licensing available later,
as sole copyright holder, which MIT would foreclose permanently.

## Liability: this is a repair manual

A wrong torque spec or procedure can hurt someone. Minimum bar:
- A visible disclaimer on every page/repo: informational,
  community-sourced, use at your own risk, verify safety-critical
  specs (torque, brake/fuel system procedures) against an
  authoritative source.
- No warranty language in the repo license.

## DMCA process

- Contact: `legal@blaydemanual.com`.
- **TODO once the domain is live:** register that address as the
  official DMCA agent with the U.S. Copyright Office
  (dmca.copyright.gov/osp, ~$6, renews every 3 years) -- a published
  address alone doesn't grant safe-harbor protection on its own.
- GitHub also runs its own independent DMCA process for repos.
- Keep a fast path to strip a specific contested file/commit range
  without taking down the whole project.

## Status

Public at `github.com/BlaydeManual/blayde-manual` as of 2026-08-25.

**Still open:**
- Register the DMCA agent (see above).
- CLA/DCO for outside *code* contributions -- hard gate, blocks
  accepting any code PR until it exists. Not yet needed with a single
  author.
- Org-level Ruleset so branch protection auto-applies to every new
  vehicle repo generated from `vehicle-scaffold` -- needs `admin:org`
  scope not currently granted. Branch protection/CODEOWNERS on the
  three org repos themselves is already configured.

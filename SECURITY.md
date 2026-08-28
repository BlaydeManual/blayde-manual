# Security

## Reporting a vulnerability

Email `security@blaydemanual.com`, or open a
[GitHub security advisory](https://github.com/BlaydeManual/blayde-manual/security/advisories/new).
Don't file a public issue for a real vulnerability -- give us time to fix
it first.

## What this project actually is, security-wise

No database, and almost no server-side backend -- one small Cloudflare
Worker (`auth-worker/`) does everything that genuinely can't run in the
browser. Three things do all the work:

- **The browser.** Fingerprinting (SHA-256), indexing (pattern-matching,
  OCR), and patching (PDF compositing) all run entirely client-side. A
  manual you load never leaves your browser tab.
- **GitHub's own API**, called directly from the browser with your own
  token, for anything that acts on a repo you already have real access
  to: fetching a manifest, forking a repo to contribute privately,
  reviewing a photo-submission PR. GitHub is the backend for these.
- **The Worker**, for the handful of actions that specifically need to
  happen WITHOUT the requesting person retaining write access to the
  result -- see "Two logins, two trust models" below. This is real,
  load-bearing infrastructure now, not just a token-exchange proxy.

## Two logins, two trust models

Two separate GitHub apps exist side by side, deliberately, not as a
staged migration from one to the other:

**Classic OAuth App** (`public_repo` scope). Used for "create under my
own account first" (a maintainer indexing a vehicle who wants to keep a
personal copy before proposing a transfer) and the contribute flow's
Private path (a photo contribution that stays on the contributor's own
fork until they explicitly open the PR). The access token lives in the
browser for that session only, and is used directly against GitHub's
API with the signed-in person's own real permissions -- if they can
already fork and PR a repo with their own account, this lets them do
exactly that from this site, nothing more.

**GitHub App** (installation-based). Used for "submit directly" (a new
vehicle proposal) and the contribute flow's Public path (an immediate
photo PR with no fork). The browser NEVER holds this app's installation
credential -- it only ever holds a short-lived user-to-server token that
proves a real, currently-signed-in GitHub identity is asking, sent to
the Worker as a Bearer token. The Worker independently exchanges its
OWN private key (a Wrangler secret, never in source, never sent to the
browser) for a fresh installation access token per request, and that
token -- scoped to exactly the repos the App is installed on
(BlaydeManual, all repositories) -- does the actual privileged write.

This split exists for a real reason, not just organizational tidiness:
a repo the App's installation writes to on someone's behalf is a repo
that person can never write to afterward. For a brand-new vehicle
proposal, that's not a limitation, it's the point -- see "Locked
direct-submit repos" below.

## Locked direct-submit repos, and how approval verifies them

Indexing a new vehicle always goes through the GitHub App, with no
personal-account alternative (unlike contribute.js's genuine choice) --
there's no meaningful "keep it personal" case for a manual that needs
to become the org's public record. `POST /direct-submit` on the Worker:

1. Creates the repo **private**, directly under BlaydeManual, using the
   installation token. The submitting maintainer never gets write
   access to it -- only an org approval action (below) can ever change
   it again.
2. Pushes `manifest.json` as the repo's only real content (alongside
   the `README.md` a fresh repo gets automatically).
3. Commits a **notarization entry** -- `sha256(manifest.json)`, the real
   submitter's GitHub login, and a timestamp -- to a separate, public,
   installation-token-only-writable log repo (`BlaydeManual/submission-
   log`). Because only the Worker's own credential can write there, and
   the log itself is public and append-only, a submitter can't forge
   their own entry, and anyone can audit the log later.

**A locked repo closes a real time-of-check-to-time-of-use gap for
free**: since the submitter never has write access to it, there's no
window between submitting and an org approver reviewing it where the
manifest could be quietly edited.

`org-approval.js`'s real implementation, and the Worker's
`POST /approve-vehicle` endpoint it calls, never trust anything the
browser claims about a pending submission -- every check below
re-verifies independently, server-side, with the installation token, at
the moment of approval, and the UI's Approve button is disabled until a
`dry_run` call confirms all four pass (the SAME code path the real
approval uses, not a lighter client-side approximation, so "enabled"
and "actually works" can't disagree):

1. **File allowlist.** A direct-submit repo must contain EXACTLY
   `{README.md, manifest.json}` and exactly one branch. Anything
   else -- most dangerously a `.github/workflows/*.yml`, which would
   execute with the org's own permissions the moment the repo goes
   public -- is a hard, automatic block.
2. **Notarization match.** The manifest's current sha256 must match
   its logged entry. A mismatch means it was edited after submitting,
   or the repo never really went through `/direct-submit` at all.
3. **Manifest schema.** Has to have the real expected shape
   (`entries[]`, `page_geometry`, a `vehicle` slug) before anything
   privileged happens.
4. **Real org-admin check on the approver**, via GitHub's own
   membership API (`role === "admin"`, `state === "active"`) with the
   installation token -- never a client-side flag a maintainer's own
   page state could fake.

A repo name matching one of BlaydeManual's own reserved repos
(`registry`, `submission-log`, `blayde-manual`, `vehicle-scaffold`) is
refused outright before any of the above runs, as an explicit rule
rather than something that happens to fall out of the file-allowlist
check.

**Identity chain, submit to grant.** On approval, the original submitter
is granted real `push` access to their own newly-public repo -- the
only way anyone becomes a maintainer of it. That identity is never
re-derived or client-supplied: it's the same GitHub login captured by
`requireRealUser` at submit time (verified against GitHub's own `/user`
endpoint, not request-body input), written once into the notarization
entry, and reused unmodified for the grant. The grant only runs after
checks 1-4 above pass, so a tampered or forged submission is rejected
before anyone is ever added as a collaborator.

**Viewing** the pending queue (`GET /pending-vehicles`) requires real,
active BlaydeManual org membership, not just any signed-in GitHub
account -- without that, a stranger with a throwaway GitHub account
could otherwise enumerate every private repo under the org that happens
to contain a `manifest.json`, including ones never meant to be part of
the public review queue.

**Deliberately not built:** a real REJECT action. Approving is a
one-way, narrowly-scoped set of API calls (flip visibility, append a
registry entry); rejecting would mean deciding what happens to a real,
already-created private repo (delete it? leave it indefinitely? ask the
submitter to fix and resubmit?) -- a genuinely destructive,
hard-to-reverse decision this project hasn't made yet. Reject still
just logs an intended action for now.

## Repo-scope validation

Every tool that acts on a `repo_url` -- the maintainer review panel,
`my-vehicles.js`, and now the Worker's `/direct-contribute` endpoint --
checks it against the real, public registry.json before calling the
GitHub API against it, requiring `status: "approved"`. This closes a
real attack that matters more now than it used to: `/direct-contribute`
runs on the installation token, which has write access to every repo
under BlaydeManual, not just the vehicle repos an ordinary caller has
any business touching. Without this check, a crafted `repo_url` could
point the endpoint at `BlaydeManual/registry` or
`BlaydeManual/submission-log` itself and get the Worker's own
privileged credential to create a branch, commit, and PR there. A repo
not found in the registry, approved, is refused outright, not just
warned about.

`procedure_id` (used to build the photo's file path and branch name on
`/direct-contribute`) is validated against a strict pattern before use,
for the same reason: an unvalidated value there could otherwise attempt
to write outside the intended `images/` directory via a crafted value
containing `../` segments. `vehicle_slug` (used as the new repo's name
on `/direct-submit`) gets the equivalent check.

`photo_data_url` is independently re-validated as real image content,
not just a well-formed data URL: real magic-byte checks per format
(JPEG/PNG/WEBP), and real dimensions extracted by parsing each format's
own header (PNG's IHDR chunk, JPEG's SOF marker, WEBP's VP8/VP8L/VP8X
chunk) -- no full pixel decode, no dependency. Rejects corrupt/near-empty
uploads and absurd dimensions before a branch is ever created on the
upstream repo. Deliberately no minimum file-size check: confirmed live
against a real, validly-encoded 800x600 WEBP that compressed under 1KB
-- byte size varies too much by content and format to be a reliable
signal on its own, so dimension checking is the real floor.

## Dual-approval on photo contributions, enforced by GitHub, not app logic

`POST /approve-vehicle` sets real branch protection
(`required_approving_review_count: 2`) on a vehicle's default branch at
the moment of approval, using the installation token. This is
deliberately GitHub's own enforcement, not a check inside
`review-panel.js`: a maintainer with real `push` access can always
merge a PR directly via `git`/github.com, bypassing anything this app's
own UI would check -- app-level "requires 2 approvals" would be exactly
as bypassable as no check at all. Branch protection is the one version
that can't be. `enforce_admins` stays `false`, matching the same
deliberate org-wide escape-hatch decision already made for the main
tooling repos.

**Real, immediate operational consequence, stated plainly**: a vehicle
repo with only one real maintainer -- which is every vehicle, right
after approval, since the automatic grant above just created its
first -- cannot merge ANY photo PR until a second real maintainer is
added. This is intentional (one person approving their own photo isn't
dual anything), not a bug, but it means a freshly-approved vehicle has
zero contribution throughput until staffed with a second maintainer.
Applied going forward only, not retroactively to vehicles approved
before this existed -- those need a second maintainer added first,
same as any new one, before branch protection can be turned on for
them without immediately freezing their existing review flow.

## Real merge-time validation for photo contributions

`review-panel.js`'s Accept no longer merges a PR directly with the
maintainer's own token. It calls `POST /accept-photo-pr`, which
independently re-verifies the caller's real permission (same pattern
as `/manage-collaborator`), then re-checks the PR's *current* state
with the installation token, then merges:

1. **Negative file allowlist.** The PR's diff must be exactly one
   `added` file under `images/` matching the real contributed-photo
   naming convention. Anything else -- most seriously a modified
   `.github/workflows/*.yml` riding along with the photo, which merged
   into an org-owned repo means real code execution in this org's CI --
   is a hard block.
2. **Content re-validated at the current commit, not a cached one.**
   The same magic-byte/dimension check `/direct-contribute` already
   does, plus a new scan for embedded metadata (JPEG APP1/APP13, PNG
   eXIf/tEXt/zTXt/iTXt, WEBP EXIF/XMP chunks) -- presence-only, not
   full parsing. This exists specifically for the Private (fork-based)
   path: a contributor can bypass the site entirely and push straight
   to their own fork, skipping `contribute.js`'s canvas re-encode --
   the actual thing that strips EXIF/GPS/camera metadata. A hash of
   "sanitized" content can't catch that case: the Worker never sees
   Private-path bytes at submission time, so there's nothing
   trustworthy to hash against. Scanning the real bytes right before
   merge is the one check that works regardless of how the file
   arrived.
3. **Merge pinned to the SHA just checked**, closing the gap a fork
   owner otherwise has for as long as their branch stays open: nothing
   previously stopped them swapping the photo's content, or the file
   set, between when a maintainer looked and when they clicked Accept.

Both are hard blocks, matching the vehicle-approval checks above, not
a warning a human can click past. Verified with a local, uncommitted
test script that mocked `fetch` and drove this logic with a real
RSA test key for the App-JWT signing path (not a checked-in test
suite -- `auth-worker/` doesn't export individual handlers for one):
a clean single-photo PR merges; an extra file, an EXIF-carrying photo,
and an under-permissioned caller are each rejected with a specific,
real error.

**The gap this alone would NOT have closed, and how it's actually closed now:**
these checks only run when Accept is clicked through this site. Someone
with real push access could still merge the same PR natively --
github.com's own merge button, or `git`/the API directly -- skipping
application logic entirely, since it isn't something GitHub itself
enforces on its own. Closed for real by wiring the equivalent checks
into `BlaydeManual/vehicle-scaffold` (a real, live GitHub template repo,
copied into every vehicle repo at approval time -- see "vehicle-scaffold:
the same checks, enforced by GitHub itself" below) and making that
workflow's job a **required status check** in branch protection,
alongside the existing `required_approving_review_count: 2`. A required
check is GitHub's own enforcement, applied no matter which UI initiates
the merge -- verified live: a normal merge attempt against a failing
check is genuinely rejected ("the base branch policy prohibits the
merge"), no override, nothing bypassed.

## vehicle-scaffold: the same checks, enforced by GitHub itself

`BlaydeManual/vehicle-scaffold` is a real GitHub template repo
(`is_template: true`). `handleApproveVehicle` copies its real file tree
into a vehicle repo right after that repo flips public -- deliberately
AFTER approval, never at submit time, since the file-allowlist check
above requires a pre-approval repo to be EXACTLY `{README.md,
manifest.json}`; applying the scaffold earlier would fail every future
submission against its own future self. It reads the live template
directly rather than duplicating its contents in this Worker, so
editing the scaffold later never requires touching this code or any
already-created vehicle repo.

The scaffold's `checker.py`, run by a workflow on every PR touching
`images/`, now hard-fails on:
- **Any non-pixel data**, not just EXIF GPS. `img.getexif()` alone
  isn't enough -- confirmed empirically that it returns an empty dict
  for a real JPEG carrying an ICC profile or a comment marker, both
  real, inspectable data it simply doesn't look at. Checks `img.info`
  broadly instead (the real surface PIL exposes for all of it), against
  an allowlist of the exact JFIF fields confirmed present on any
  freshly re-saved, already-clean image -- not guessed.
- **More than one file changing**, or any file outside `images/` --
  the same negative-allowlist rule `/accept-photo-pr` enforces,
  independently, in the one other place a merge can actually happen.

Branch protection's `required_status_checks` names that workflow's real
job (`checker`) as required. This is the fix that closes the native-
merge gap above for real, not just through this site's own Accept
button -- and it comes with the same honest caveat as the review-count
requirement it sits beside: `enforce_admins` stays `false` (see "Known
gaps" below), so an org admin can still force a merge straight past it.
Confirmed live, not theoretical -- caught during verification when a
`gh pr merge --admin` call did exactly that, force-merging a test photo
with embedded EXIF straight into `main`; reverted via a follow-up PR,
not a direct push, once caught.

Still tracked in ROADMAP.md, as a separate, complementary idea, not a
substitute for the above: a periodic job auto-closing stale/malformed
open PRs that nobody ever acts on -- that one cleans up what's left
sitting open, it doesn't stop a bad merge from completing, which is
what the required check now does.

## What's never collected or stored

No analytics, no tracking, no server-side logs of what anyone patches
or contributes beyond the notarization log entries described above
(a hash and a login, not photo content). EXIF metadata (GPS, camera
model, timestamp) is stripped from every contributed photo
client-side, before it's ever saved, not just checked afterward.

**Real gap found and closed, 2026-08-28**: direct question ("are we
stripping everything down to pixels?") led to actually checking rather
than trusting a comment that claimed canvas re-encoding "never carries
the source file's metadata forward." True for the original file's own
EXIF/GPS -- false for what the browser adds back: Chrome injects a real
~470-byte ICC color profile into every JPEG `canvas.toDataURL()`
produces (a JPEG APP2 segment), confirmed by decoding real output and
finding it. That meant every photo submitted through this site's own
real upload flow would have been hard-rejected by the very checks meant
to validate a legitimate submission -- not a bypass, the sanctioned path
itself failing its own standard. PNG output was separately confirmed
already clean (`IHDR`/`IDAT`/`IEND` only). Fixed with a real client-side
strip (`stripJpegAuxSegments` in `contribute.js`, JPEG only) applied
right after re-encoding, verified by decoding the real output and
running it through the real `checker.py`. A second, related gap found
in the same pass: `auth-worker`'s own `jpegHasMetadata` (the
`/accept-photo-pr` merge-time scan) only ever checked APP1/APP13 --
same ICC blind spot, independently. Now flags any APPn except APP0,
matching `checker.py`'s allowlist and the new client-side strip
exactly, instead of three places quietly disagreeing on the same rule.

## Maintaining a vehicle repo is a separate designation from org membership

BlaydeManual **org membership** (member/admin) governs two things only:
viewing the pending-vehicle queue, and approving a new vehicle (admin
only). No write access to any vehicle repo. **Maintaining** a specific
vehicle repo is a separate, per-repo GitHub collaborator grant -- a
maintainer need not be an org member at all.

`my-vehicles.js` implements this with real GitHub calls: repo list from
`GET /user/repos` (`discoverMaintainedRepos()`), filtered to push-or-
better access + registry-approved. Listing the roster uses the caller's
own OAuth token directly (GitHub allows any push-or-better collaborator
to list collaborators). Inviting/removing does not: GitHub only allows
collaborator management at repo **Admin** -- confirmed against GitHub's
own repository-roles docs, `Maintain` does not include it -- and Admin
carries real, unrelated blast radius (delete the repo, transfer it,
flip it back private, rename it and silently break `registry.json`'s
`repo_url` pointer) that a maintainer inviting a contributor has no
reason to hold. Those two actions instead go through the Worker's
`POST /manage-collaborator`, using the installation token: the caller's
own real permission on that specific repo is re-checked server-side
(`GET .../collaborators/{login}/permission`, requiring `admin`,
`maintain`, or `write`) before anything happens, and any invite this
endpoint performs always grants `push`, never higher -- the same floor
as the automatic grant on approval. No maintainer ever needs to hold
real repo Admin to manage who else is on their vehicle.

## Repo-level protection

`blayde-manual`, `registry`, and `vehicle-scaffold` all require a
code-owner-approved review before merging to `main` for anyone other
than the project owner. `CODEOWNERS` in each scopes that specifically
to infrastructure and legal files (license, CI config, the photo/
manifest checkers) -- routine maintaining (`manifest.json`, `images/**`)
stays at normal review, not gated the same way.

## Known gaps, not yet closed

See `SECURITY-TESTING.md` for the active testing plan covering the
GitHub App migration -- what's been verified live vs. synthetically vs.
still pending deploy, organized by caller identity (anonymous,
authenticated non-member, member, admin). Required reading before
treating any of the direct-submit/direct-contribute/approve-vehicle
controls as proven in production, not just in a mocked test.

- **Closed, 2026-08-27**: GitHub App registered, installed (all
  repositories), credentials provisioned as Wrangler secrets. Three bugs
  found via live testing, fixed and confirmed live: missing
  `User-Agent` header (every GitHub call was rejected), PKCS#1-vs-PKCS#8
  private key mismatch (JWT signing never worked), and `getOrgMembership`
  swallowing a missing-permission error as "not a member." Org
  configuration audited and corrected: member repo creation disabled,
  org-wide 2FA required, App permission set corrected (added Members
  read, removed unused Issues write). Detail and live evidence:
  `SECURITY-TESTING.md`.
- **Deliberate, not an oversight**: `enforce_admins` is `false` on
  `blayde-manual`/`registry`/`vehicle-scaffold` -- the sole admin can
  bypass required review. Kept as an escape hatch while there is exactly
  one admin; revisit once a co-maintainer team exists. `submission-log`
  has no branch protection -- its append-only property depends on write
  access being limited to the App's installation token and org admins,
  not on anything GitHub enforces, since the App writes
  directly to `main` by design and a PR requirement would need the App
  exempted from its own rule anyway.
- Token expiry is currently disabled at the App level for the
  user-to-server flow, to avoid needing refresh-token handling in the
  first cut -- a real, deliberate tradeoff (see ROADMAP.md), not an
  oversight. Revisit once this flow has run clean for a while.
- `POST /direct-submit` has no rate limiting and is reachable by any
  real signed-in GitHub account, not just trusted maintainers --
  matches this project's "anyone can propose" philosophy (nothing
  becomes public or registered without a real org-admin approval), but
  an attacker could still spam junk private repos under the org to
  consume quota or clutter the approval queue. Not a data-integrity
  risk given the approval gate holds, but a known, accepted annoyance
  risk.
- The classic OAuth App's `public_repo` scope grants write access to
  every public repo the signed-in person can already touch, not just
  BlaydeManual's -- what actually keeps this site from acting outside
  BlaydeManual on that token is the repo-scope validation above
  ("our code chooses not to," not "the token literally can't"). The
  GitHub App path doesn't have this gap (installation-scoped by
  construction), which is part of why direct-submit/direct-contribute
  moved to it; migrating the remaining classic-OAuth call sites is
  real, deferred work, not done in this pass.
- Branch protection does not carry over automatically when a new
  vehicle repo is generated -- each one needs it configured as its own
  step today (a direct-submit repo additionally starts private, which
  is its own form of protection until approval).
- **Closed, 2026-08-27**: photo-PR file-allowlist and metadata scan
  previously only ran through this site's own Accept button, skippable
  by a native GitHub merge. Closed via `vehicle-scaffold`'s required
  `checker` status check -- see "vehicle-scaffold: the same checks,
  enforced by GitHub itself" above. `enforce_admins: false` still means
  an org admin can force past it, same escape hatch as the
  review-count requirement immediately below; confirmed live, not
  theoretical (see that section for what happened and how it was
  caught and reverted).
- CI validates contributed photos; it does not yet validate a
  `manifest.json` change on its own (a moved bbox, an edited status).
  (`validate_manifest.py`/`validate-manifest.yml` exist in
  `vehicle-scaffold` and get copied into every vehicle repo the same
  way `checker.py` does, but aren't yet wired into `required_status_checks`
  the way `checker` is -- not done in this pass.)
- No CLA/DCO exists yet for outside *code* contributions to the
  tooling repo -- this is a hard gate: no such contribution is
  accepted until one does.

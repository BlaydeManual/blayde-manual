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

## What's never collected or stored

No analytics, no tracking, no server-side logs of what anyone patches
or contributes beyond the notarization log entries described above
(a hash and a login, not photo content). EXIF metadata (GPS, camera
model, timestamp) is stripped from every contributed photo
client-side, before it's ever saved, not just checked afterward.

## Repo-level protection

`blayde-manual`, `registry`, and `vehicle-scaffold` all require a
code-owner-approved review before merging to `main` for anyone other
than the project owner. `CODEOWNERS` in each scopes that specifically
to infrastructure and legal files (license, CI config, the photo/
manifest checkers) -- routine maintaining (`manifest.json`, `images/**`)
stays at normal review, not gated the same way.

## Known gaps, not yet closed

- The GitHub App itself needs to actually be registered and its
  credentials provisioned (App ID, private key, client ID/secret, as
  Wrangler secrets on `auth-worker`) before any of the direct-submit/
  direct-contribute/approve-vehicle flows work against real GitHub --
  see ROADMAP.md's GitHub App migration entry for the exact setup
  steps. Everything described above has been verified by unit-testing
  the validation logic in isolation and mocking the network layer
  through the real client-side call sites, not against live GitHub.
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
- CI validates contributed photos; it does not yet validate a
  `manifest.json` change on its own (a moved bbox, an edited status).
- No CLA/DCO exists yet for outside *code* contributions to the
  tooling repo -- this is a hard gate: no such contribution is
  accepted until one does.

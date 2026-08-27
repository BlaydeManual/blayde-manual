# Active security testing plan -- GitHub App migration (PR #21)

Companion to SECURITY.md, not a replacement for it. That file describes
the architecture and what each control is *supposed* to do; this one is
the checklist for actually proving each control does that, against the
real, live infrastructure -- run through before merging, and again
after each deploy step, not written once and forgotten.

## What's already been verified, and how

Two different kinds of verification happened before this document
existed, and neither substitutes for the other:

- **Synthetic**: the Worker's actual exported handler functions, run in
  Node against a mocked `fetch` layer standing in for GitHub's API.
  Proves the *logic* is correct (right checks, right order, right
  error on the right input) without needing real GitHub state.
- **Live-anonymous**: real `curl` calls against the actually-deployed
  `https://auth.blaydemanual.com` and real, unauthenticated GitHub API
  calls, run directly from this environment. Proves what's *actually
  running in production right now* behaves as expected -- which,
  critically, is **not yet this PR's code** (see below).

## Ground truth as of this pass (checked live, 2026-08-26)

Checked directly, not assumed:

- **The deployed Worker is still the OLD code.** `POST /app-token`,
  `POST /direct-submit`, and `GET /pending-vehicles` all responded with
  the OLD single-handler's exact error shapes (`"missing code"` for a
  POST without a `code` field, `"method not allowed"` for a GET) --
  none of this PR's new routing or endpoints are live. Merging this PR
  alone does **not** deploy it; a separate `wrangler deploy` is
  required (see auth-worker/README.md).
- **No GitHub App is registered yet.** `gh api orgs/BlaydeManual/installations`
  shows exactly one installation: Cloudflare's own Pages/Workers
  deploy integration. The App this PR's code expects doesn't exist.
- **`BlaydeManual/submission-log` doesn't exist yet** (`404` on a
  direct check).
- **`BlaydeManual` has exactly one member** (`TheBlayde`, role
  `admin`). There is currently no second real account to test
  "authenticated non-member" or "member-but-not-admin" against with a
  genuinely different permission level in the same org.
- **registry.json is live and real, currently empty** (`{"vehicles":
  []}`) -- no vehicles registered yet at all.
- **The deployed site's `auth.js` doesn't have `signInWithGitHubApp`
  either** -- the Pages deploy hasn't picked up this branch.

**What this means:** almost everything below cannot be executed for
real until (1) this PR is merged AND deployed to Pages, (2) the Worker
is redeployed via `wrangler deploy` with the new secrets provisioned,
and (3) the GitHub App is actually registered and installed. Each item
below says explicitly whether it was checked live already, checked
synthetically only, or can't be checked at all until deploy.

## Already checked live, today, against real infrastructure

These don't depend on this PR's new code and were verified directly:

| Check | Result |
|---|---|
| CORS holds `https://blaydemanual.com` regardless of request `Origin` (tried `https://evil.example.com`) | PASS -- header never reflects an arbitrary origin |
| Worker returns clean JSON errors on malformed body, no stack trace/secret leak | PASS -- `{"error":"invalid JSON body"}`, nothing else |
| Worker returns clean JSON on a request missing required fields, no `env` content echoed | PASS |
| Anonymous read of `registry.json` works (by design -- it's meant to be public) | PASS |
| A nonexistent repo path returns a real 404, not a 200 with fake data (control test) | PASS |
| `blayde-manual`, `registry`, `vehicle-scaffold` are genuinely public repos today | Confirmed |

## The testing plan, by identity tier

Four tiers, matching what different real callers can actually prove
about themselves: nothing, a real GitHub identity, real org
membership, and real org-admin membership. Each row: the call, the
expected result, and whether it's checked already (and how) or still
pending deploy.

Endpoints are all on the Worker (`https://auth.blaydemanual.com`)
unless noted. "Synthetic" means verified via the Node/mocked-fetch
tests in this PR; "Live" means run for real against deployed
infrastructure; "Pending" means it genuinely cannot be run until the
Worker is redeployed and the GitHub App exists.

### Tier 1: Anonymous (no Authorization header, no cookies, nothing)

| # | Call | Expected | Status |
|---|---|---|---|
| 1.1 | `POST /` with a garbage `code` | `400`, clean error, no leak | **Live, PASS** |
| 1.2 | `POST /app-token` with a garbage `code` | `400`, clean error | Pending (endpoint not deployed) |
| 1.3 | `POST /direct-submit` with no `Authorization` header | `400`/`500`, `"Not signed in."` | Synthetic (implied by `requireRealUser`'s missing-token branch, not separately isolated) -- **re-run live after deploy** |
| 1.4 | `POST /direct-contribute` with no `Authorization` header | Same as 1.3 | Pending |
| 1.5 | `GET /pending-vehicles` with no `Authorization` header | Same as 1.3 | Pending |
| 1.6 | `POST /approve-vehicle` with no `Authorization` header | Same as 1.3 | Pending |
| 1.7 | `Authorization: Bearer garbage-not-a-real-token` on any of the above | Rejected at `requireRealUser`'s `GET /user` check (GitHub itself 401s) | Pending |
| 1.8 | Once a direct-submit repo exists: `GET https://api.github.com/repos/BlaydeManual/<slug>` with no token | `404` (private repos aren't visible to anonymous requests -- this is GitHub's own ACL, not our code, but worth confirming it actually holds) | Pending (no direct-submit repo exists yet) |
| 1.9 | OPTIONS preflight from an arbitrary origin | CORS doesn't reflect it | **Live, PASS** |

### Tier 2: Authenticated, real GitHub account, NOT a BlaydeManual member

**Needs a second real GitHub account** -- a personal secondary account, or ask a teammate/friend to run these with their own login. `TheBlayde` (the only account available in this environment) is already an org admin and can't represent this tier.

| # | Call | Expected | Status |
|---|---|---|---|
| 2.1 | Sign in via classic OAuth (`signInWithGitHub`) | Succeeds -- `public_repo` doesn't require org membership | Needs a real browser session; not automatable from here |
| 2.2 | Sign in via the GitHub App (`signInWithGitHubApp`) | Succeeds -- any real GitHub identity passes `requireRealUser` | Needs App registered + real browser session |
| 2.3 | `POST /direct-submit` as this identity, real manifest | **Succeeds** -- by design, anyone can propose (see SECURITY.md's accepted-risk note on this) | Pending |
| 2.4 | `GET /pending-vehicles` as this identity, right after 2.3 | **Rejected** -- not a member, even though they just submitted something | Pending -- **this is the fix from the security-audit pass, must be confirmed live, not just trusted from the synthetic test** |
| 2.5 | `POST /direct-contribute` targeting a real, approved vehicle repo | Succeeds -- branch + PR created on the upstream repo, no fork | Pending |
| 2.6 | `POST /direct-contribute` targeting `BlaydeManual/registry` (or any repo NOT in registry.json with `status: approved`) | **Rejected** -- `"isn't a registered, approved vehicle repo"` | Pending -- **this is the critical fix, the single most important live test in this whole plan** |
| 2.7 | `POST /direct-contribute` with `procedure_id: "../../../.github/workflows/evil"` against a real approved repo | **Rejected** -- `400`, shape validation | Pending |
| 2.8 | `POST /approve-vehicle` as this identity, any `repo_name` | **Rejected** -- not a member at all | Pending |
| 2.9 | Directly query `GET https://api.github.com/repos/BlaydeManual/<their-own-direct-submit-repo>` with their own real OAuth token | `404` -- they don't have collaborator access to a repo the App's installation created on their behalf; the repo is genuinely locked | Pending |

### Tier 3: Authenticated, real BlaydeManual member, role `member` (not `admin`)

**Needs someone invited to the org as `member` role specifically** -- create a real second test account, invite it, run these, then remove it (or keep a permanent low-privilege test account around for future passes).

| # | Call | Expected | Status |
|---|---|---|---|
| 3.1 | `GET /pending-vehicles` | **Succeeds** -- real member, sees the real queue | Pending |
| 3.2 | `POST /approve-vehicle` (dry_run or real) on any pending repo | **Rejected** -- `"isn't an active admin"` | Pending -- confirms the admin bar is a real, separate check from plain membership |
| 3.3 | Everything from Tier 2 | Same results as Tier 2 (membership doesn't grant contribute/submit privileges beyond what any real account already has) | Pending |

### Tier 4: Authenticated, real BlaydeManual org admin (maintainer)

Available now via `TheBlayde` for the parts that don't need a real pending submission; needs at least one real direct-submit repo to exist for the approval-specific rows.

| # | Call | Expected | Status |
|---|---|---|---|
| 4.1 | `gh api orgs/BlaydeManual/memberships/TheBlayde` | `role: admin, state: active` | **Live, confirmed** (this is how the audit found the account's real role) |
| 4.2 | `GET /pending-vehicles` | Succeeds, shows real pending repos | Pending |
| 4.3 | `POST /approve-vehicle` `dry_run: true` on a genuine, untampered pending submission | All 4 checks pass, `{"checked": true}` | Synthetic only so far -- **needs a real direct-submit repo to re-run live** |
| 4.4 | Manually push an extra file (e.g. a dummy `.github/workflows/x.yml`) to a pending repo, then `dry_run: true` | **Rejected** -- file-allowlist check | Synthetic only -- **this is the scenario the file-allowlist exists for, worth a real live confirmation, not just trust in the mock** |
| 4.5 | Manually edit `manifest.json` on a pending repo (any change), then `dry_run: true` | **Rejected** -- notarization hash mismatch | Synthetic only -- same, worth a real live confirmation |
| 4.6 | `POST /approve-vehicle` with `repo_name: "registry"` (or `submission-log`, `blayde-manual`, `vehicle-scaffold`) | **Rejected** -- reserved-name check, before any GitHub calls happen | Synthetic, **PASS** -- low-risk to also confirm live since it's a pure string check with no GitHub side effects even if it somehow didn't reject |
| 4.7 | `POST /approve-vehicle` (real, not dry-run) on a genuine, clean submission | Repo flips public, `registry.json` gets a real new entry -- verify BOTH independently afterward (`gh api repos/BlaydeManual/<slug> --jq .private` should be `false`; re-fetch `registry.json` and confirm the entry) | Pending -- **this is the actual end-to-end proof the whole feature works**, do this LAST, after everything else, since it's the one truly hard-to-reverse live action in this whole plan (a real repo goes public) |
| 4.8 | Try `/approve-vehicle` a second time on the same, already-approved repo | Should fail gracefully (file-allowlist or org-repos-type=private listing will no longer include it once public) -- confirms no double-registration | Pending |

## Sequencing (do these in order, not all at once)

1. Merge this PR (code only -- confirmed above this does NOT deploy anything by itself).
2. Deploy the site (Cloudflare Pages picks up the branch automatically per existing setup, or trigger manually) -- re-run the Tier 1 anonymous checks against the new Worker routes to confirm the deploy actually happened (repeat the "ground truth" check at the top of this doc; the error shapes should change to match the NEW code, e.g. `/direct-submit` with no auth should now say `"Not signed in."` instead of `"missing code"`).
3. Register the GitHub App, install on BlaydeManual (all repos), provision all four Wrangler secrets, create `BlaydeManual/submission-log`, `wrangler deploy` the Worker.
4. Re-run Tier 1 in full (all anonymous checks against the real, new endpoints).
5. Run Tier 2 with a real second account -- **stop and fix before continuing if 2.4 or 2.6 don't behave as expected**, since those are exactly the two fixes from the security audit.
6. Run Tier 3 with a real member-role account.
7. Run Tier 4 items 4.1-4.6 (everything except the real approve) using one throwaway real direct-submit repo created via 2.3.
8. Only once 4.1-4.6 all pass cleanly: run 4.7 (the real approval) and 4.8, on a real, intentionally-throwaway test vehicle -- not a real manual -- since this is the one step in the whole plan that makes a real repo public and writes to the real registry.
9. Clean up: remove the test account from the org if one was added just for this, and decide whether to keep or delete the throwaway approved test-vehicle repo/registry entry.

## What this plan does NOT cover

- Load/rate-limit behavior of `/direct-submit` under real spam (SECURITY.md's known-gap note) -- worth a dedicated pass later, not blocking this merge.
- The classic OAuth path's existing real flows (contribute.js fork+PR, review-panel.js accept/reject) -- unchanged by this PR, already live and working, out of scope for re-testing here.
- Anything requiring GitHub's own infrastructure to misbehave (e.g., a genuinely compromised GitHub Apps platform) -- out of scope for a project like this.

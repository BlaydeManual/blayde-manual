# Active security testing plan -- GitHub App migration (PR #21)

Companion to SECURITY.md, not a replacement for it. That file describes
the architecture and what each control is *supposed* to do; this one is
the checklist for actually proving each control does that, against the
real, live infrastructure -- run through before merging, and again
after each deploy step, not written once and forgotten.

**Real bug found and fixed during this live pass, not caught by any
synthetic test**: every GitHub API call the Worker makes was missing a
`User-Agent` header, which GitHub's API rejects outright (403) --
confirmed against GitHub's own docs, not guessed. This silently broke
every single authenticated flow (`requireRealUser`, installation-token
creation, and everything routed through the shared `ghApi` helper --
which is all four privileged endpoints). Caught only because a live
token, verified working directly against GitHub, still failed through
this Worker specifically -- exactly the scenario this whole document
exists to catch, and exactly why "the mocked test suite passes" was
never treated as equivalent to "this actually works." Fixed; **needs
one more manual redeploy** (same dashboard-paste process as before)
before any Tier 2+ test below can produce a real result.

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

## Ground truth as of this pass (checked live, 2026-08-26, updated twice same day)

Checked directly, not assumed -- three passes so far:

- **The Worker's new code is now live and confirmed working**, deployed
  via a manual paste into the Cloudflare dashboard's code editor (not
  yet `wrangler deploy` -- see the follow-up note at the bottom of this
  section). Re-ran the Tier 1 anonymous checks below and all four
  privileged endpoints now correctly return `{"error":"Not signed in."}`
  instead of the old handler's error shapes. Also confirmed the auth
  check runs BEFORE any other validation (e.g. a `vehicle_slug:
  "registry"` reserved-name attempt with no auth still just says "Not
  signed in.," not "collides with a reserved repo name" -- no internal
  validation rules leak to an anonymous caller).
- **The GitHub App (`blayde-manual-direct`) is registered and
  installed** on BlaydeManual (`gh api orgs/BlaydeManual/installations`
  shows it alongside Cloudflare's own integration). Its Client ID is in
  `web/auth.js`.
- **`BlaydeManual/submission-log` exists** (public, as intended).
- **`hypnolope` has ACCEPTED the invitation** (`role: member, state:
  active`, confirmed live) -- `BlaydeManual` now has two active
  members. This closed the window to test true Tier 2
  ("authenticated, not yet a member") against that specific account;
  see Tier 2's note below -- backlogged, needs a third account, not
  blocking. Tier 3 (member) is ready to run with hypnolope's account
  now.
- **registry.json is live and real, currently empty** (`{"vehicles":
  []}`) -- no vehicles registered yet at all.
- **The deployed site's `auth.js` doesn't have `signInWithGitHubApp`
  yet** -- the Pages deploy hasn't picked up this branch. Needed before
  any real browser-based sign-in test (Tier 2.1/2.2) can run, even once
  hypnolope accepts.

**Follow-up, not blocking**: the Worker was updated via a manual paste
into the dashboard editor, not `wrangler deploy` -- fine for getting
unblocked now, but means the NEXT code change to this file needs the
same manual step again unless `wrangler deploy` (or a git-connected
Cloudflare Workers Build) gets set up properly. Worth doing before this
becomes a recurring manual chore.

**What's still blocking a full pass:** (1) the User-Agent fix above
needs redeploying, (2) this PR needs merging and the site needs to
actually deploy to Pages (for `signInWithGitHubApp` to exist
client-side). Everything else required for Tier 1 is now done and
confirmed. Each item below states explicitly whether it's checked live,
checked only synthetically, or still pending one of these two things.

## Already checked live, today, against real infrastructure

Cross-cutting checks that don't fit neatly into one tier row, verified
directly (Tier 1's own table below has the endpoint-by-endpoint detail,
now that the new code is confirmed deployed):

| Check | Result |
|---|---|
| CORS holds `https://blaydemanual.com` regardless of request `Origin` (tried `https://evil.example.com`) | PASS -- header never reflects an arbitrary origin |
| Worker returns clean JSON errors on malformed body, no stack trace/secret leak | PASS -- `{"error":"invalid JSON body"}`, nothing else |
| Worker returns clean JSON on a request missing required fields, no `env` content echoed | PASS |
| Anonymous read of `registry.json` works (by design -- it's meant to be public) | PASS |
| A nonexistent repo path returns a real 404, not a 200 with fake data (control test) | PASS |
| `blayde-manual`, `registry`, `vehicle-scaffold` are genuinely public repos today | Confirmed |
| Auth check runs before ANY other validation (reserved-name check, shape checks) on every privileged endpoint | PASS -- an anonymous reserved-name attempt still just gets "Not signed in.," no internal rule leaks pre-auth |

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
| 1.2 | `POST /app-token` with a garbage `code` | `400`, clean error | **Live, PASS** -- routes correctly, real GitHub error surfaced (`"The code passed is incorrect or expired."`) |
| 1.3 | `POST /direct-submit` with no `Authorization` header | `500`, `{"error":"Not signed in."}` | **Live, PASS** |
| 1.4 | `POST /direct-contribute` with no `Authorization` header | Same as 1.3 | **Live, PASS** |
| 1.5 | `GET /pending-vehicles` with no `Authorization` header | Same as 1.3 | **Live, PASS** |
| 1.6 | `POST /approve-vehicle` with no `Authorization` header | Same as 1.3 | **Live, PASS** |
| 1.6b | `POST /direct-submit` with no auth AND `vehicle_slug: "registry"` (a reserved name) | Still just `"Not signed in."` -- auth check must run before any other validation, so no internal rule ever leaks to an unauthenticated caller | **Live, PASS** |
| 1.7 | `Authorization: Bearer garbage-not-a-real-token` on any of the above | Rejected at `requireRealUser`'s `GET /user` check (GitHub itself 401s) | **Live, PASS** -- `{"error":"Could not verify signed-in user."}` |
| 1.8 | Once a direct-submit repo exists: `GET https://api.github.com/repos/BlaydeManual/<slug>` with no token | `404` (private repos aren't visible to anonymous requests -- this is GitHub's own ACL, not our code, but worth confirming it actually holds) | Pending (no direct-submit repo exists yet -- needs a real Tier 2 submission first) |
| 1.9 | OPTIONS preflight from an arbitrary origin | CORS doesn't reflect it | **Live, PASS** |

### Tier 2: Authenticated, real GitHub account, NOT a BlaydeManual member

**Backlogged -- the window to test this with hypnolope's account is gone.** hypnolope accepted the pending org invitation before this tier could be run against it (confirmed live: `role: member, state: active` as of this check), so it can no longer represent "authenticated, not yet a member." Needs a **third** real GitHub account, used once and specifically NOT invited to the org, to actually cover the membership-gate rows (2.4, 2.8). Not blocking the rest of this plan:
- **2.6, the critical repo-scope fix, is unaffected by membership** -- `requireRegisteredRepo` doesn't check who's asking, only what `repo_url` is, so this still needs live verification but can run as part of Tier 3 with hypnolope's account just as validly as it could have run here.
- **2.1, 2.2, 2.3, 2.5, 2.7, 2.9** are also unaffected by membership and can run under Tier 3 instead.
- **2.4 and 2.8 specifically** (proving a non-member gets rejected from the queue/approval) are what's genuinely lost until a third account exists -- logged here as backlog, not silently dropped.

`TheBlayde` (admin) still can't stand in for any of this tier either way.

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

**Ready now** -- hypnolope is a real, active member (not admin). Run these against that account once the User-Agent fix is redeployed.

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

1. ~~Register the GitHub App, install on BlaydeManual (all repos), provision the four secrets, create `BlaydeManual/submission-log`~~ -- **done**.
2. ~~Deploy the Worker's new code~~ -- **done** (via manual dashboard paste; see the follow-up note above about setting up `wrangler deploy` properly before the next change).
3. ~~Re-run Tier 1 in full~~ -- **done, all PASS** (see the Tier 1 table above).
4. ~~Have hypnolope accept the org invitation~~ -- **done** (`role: member, state: active`, confirmed live). This closed the window to run true Tier 2 (non-member) tests against that account -- **backlogged**, see Tier 2's note; needs a third, never-invited account later, not blocking.
5. Merge this PR and confirm the site deploys to Pages -- check `https://blaydemanual.com/auth.js` contains `signInWithGitHubApp` afterward as the deploy signal.
6. Run Tier 3 in full with hypnolope's account (now a real member). This also creates the real direct-submit repo Tier 4 needs. **Stop and fix before continuing if 2.6/repo-scope validation doesn't behave as expected** (run as part of this tier now) -- that's the critical fix from the security audit.
7. Run Tier 4 items 4.1-4.6 (everything except the real approve) using the repo created in step 6.
8. Only once 4.1-4.6 all pass cleanly: run 4.7 (the real approval) and 4.8, on a real, intentionally-throwaway test vehicle -- not a real manual -- since this is the one step in the whole plan that makes a real repo public and writes to the real registry.
9. Clean up: decide whether to keep or delete the throwaway approved test-vehicle repo/registry entry.
10. **Backlog item**: run a real Tier 2 pass with a third, never-invited GitHub account, specifically for rows 2.4 and 2.8 (the membership-gate rejections) -- the only two checks in this whole plan that genuinely require someone who has never had any standing in the org.

## What this plan does NOT cover

- Load/rate-limit behavior of `/direct-submit` under real spam (SECURITY.md's known-gap note) -- worth a dedicated pass later, not blocking this merge.
- The classic OAuth path's existing real flows (contribute.js fork+PR, review-panel.js accept/reject) -- unchanged by this PR, already live and working, out of scope for re-testing here.
- Anything requiring GitHub's own infrastructure to misbehave (e.g., a genuinely compromised GitHub Apps platform) -- out of scope for a project like this.

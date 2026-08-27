# Active security testing plan -- GitHub App migration (PR #21)

Companion to SECURITY.md, not a replacement for it. That file describes
the architecture and what each control is *supposed* to do; this one is
the checklist for actually proving each control does that, against the
real, live infrastructure -- run through before merging, and again
after each deploy step, not written once and forgotten.

**Four real bugs found during this live pass, none caught by any
synthetic test -- each one only surfaced by actually calling the
deployed Worker with a real token, exactly the scenario this whole
document exists to catch. First three fixed, redeployed, confirmed live
2026-08-27; fourth found later the same day via 4.8, fixed, not yet
redeployed:**

1. **Missing `User-Agent` header** on every GitHub API call the Worker
   makes -- GitHub's API rejects outright (403), confirmed against
   GitHub's own docs. Broke every authenticated flow (`requireRealUser`,
   installation-token creation, the shared `ghApi` helper -- all four
   privileged endpoints). Fixed, deployed, confirmed live.
2. **PKCS#1 vs PKCS#8 private key mismatch.** GitHub Apps issue their
   private key as PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`); the
   Worker's `pemToDer()` only handled PKCS#8, so `crypto.subtle.importKey`
   failed with a raw `atob()` error on every JWT signing attempt --
   meaning `getInstallationToken()` never worked at all, on any
   endpoint, regardless of what secret was pasted. Fixed by detecting
   PKCS#1 and wrapping it in a proper PKCS#8 `PrivateKeyInfo` DER
   structure before import; verified against a real generated RSA
   keypair (Web Crypto signs, Node's own `crypto.createVerify`
   independently confirms the signature). **Redeployed and confirmed
   live** -- `getInstallationToken()` now succeeds.
3. **`getOrgMembership` silently swallowed the real error.** GitHub
   requires the App's own "Members" organization permission (read) to
   call `GET /orgs/{org}/memberships/{username}` -- confirmed via
   GitHub's permissions-required-for-apps reference -- which was never
   granted. The resulting 403/404 was caught and mapped to `null`,
   indistinguishable from "genuinely not a member." Worse: confirmed
   live that GitHub returns the *identical* `{"message":"Not Found"}`
   for both a real non-member and a permission-denied caller, so no
   message-based heuristic can tell them apart -- the fix now throws a
   clear, distinct error instead of guessing. **Members permission
   added to the App (with a separate, easy-to-miss "approve updated
   permissions on the installation" step -- editing the App's own
   permission checkboxes alone does NOT take effect until the
   installation owner separately approves them; confirmed live that the
   installation kept using the OLD permission set for a while after the
   App-side edit alone), and redeployed.** Live-confirmed working:
   `GET /pending-vehicles` with a real admin token now returns
   `{"pending":[]}` cleanly end-to-end (empty because no vehicle repos
   exist yet, not because of an error).
4. **No guard against re-approving an already-approved vehicle.**
   Found via 4.8: after the real `suzuki-sv650-1999` approval (4.7),
   `dry_run: true` on the SAME repo still returned `{"checked":true}` --
   none of the four checks reference whether a repo was already
   approved. A second real (non-dry-run) call would have pushed a
   duplicate entry into `registry.json`'s `vehicles` array. Fixed by
   checking the repo's current `private` status before running the
   other checks -- a direct-submit repo starts private and only this
   endpoint ever flips it public, so already-public means already
   approved. **Needs a redeploy** before 4.8 can be re-confirmed live.

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

## Ground truth as of this pass (checked live, 2026-08-26 through 2026-08-27, updated across four passes)

Checked directly, not assumed:

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
- **PR #21 merged 2026-08-27, Pages deploy confirmed live** -- `curl
  https://blaydemanual.com/auth.js` contains `signInWithGitHubApp`.
  Real browser-based sign-in (Tier 2.1/2.2, Tier 3) can now run against
  the live site.

- **Org-level configuration reviewed live, 2026-08-26, all real gaps
  now fixed and reconfirmed live 2026-08-27:**
  - `members_can_create_repositories`/`..._public_repositories`/
    `..._private_repositories` were all `true` -- any org member could
    create a repo directly under BlaydeManual, completely bypassing
    `/direct-submit`'s locking/notarization (the one org-setting gap
    that actually undermined the security model, not just hardening).
    **Fixed** -- all three now `false`, confirmed live.
  - `two_factor_requirement_enabled` was `false` org-wide. **Fixed** --
    now `true`, confirmed live.
  - The App's granted permissions were `{administration: write,
    contents: write, issues: write, metadata: read, pull_requests:
    write}` -- `Members` (read) missing (bug #3), `Issues` granted but
    unused. **Fixed** -- now `{administration: write, contents: write,
    members: read, metadata: read, pull_requests: write}`, confirmed
    live. No org-level `organization_administration` key present --
    confirmed the Administration permission granted is repo-level only,
    correct as-is, no change needed.
  - `enforce_admins: false` on `blayde-manual`/`registry`/
    `vehicle-scaffold`'s branch protection, and `submission-log` having
    no branch protection at all -- both reviewed and **kept as
    deliberate decisions, not gaps**: `enforce_admins` stays `false`
    for now (an intentional escape hatch while the project is small,
    revisit once more admins exist -- see SECURITY.md), and
    `submission-log` stays unprotected since the App writes straight to
    `main` by design and a PR requirement would need the App exempted
    from its own rule anyway.
- **Real per-repo maintainer/collaborator management shipped,
  2026-08-26.** `my-vehicles.js` now makes real `GET/PUT/DELETE
  .../collaborators` and `GET/DELETE .../invitations` calls with the
  signed-in maintainer's own OAuth token (never the installation
  credential -- see SECURITY.md's new "Maintaining a vehicle repo is a
  separate designation from org membership" section). Verified so far
  only via a synthetic mocked-`fetch` browser test (real code paths,
  fabricated GitHub responses) -- **no real vehicle repo exists yet
  to test this live against** (`registry.json` is still empty); blocked
  on Tier 4's 4.7 creating the first one. See Tier 5 below.

**Follow-up, not blocking**: the Worker was updated via a manual paste
into the dashboard editor, not `wrangler deploy` -- fine for getting
unblocked now, but means the NEXT code change to this file needs the
same manual step again unless `wrangler deploy` (or a git-connected
Cloudflare Workers Build) gets set up properly. Worth doing before this
becomes a recurring manual chore.

**Where this stands, 2026-08-27 (later same day):** a real vehicle
(`suzuki-sv650-1999`, hypnolope's real 415-page indexing job) went
through the full flow live -- submit, dry-run approve, real approve --
and passed 2.6, 2.7, 4.1, 4.2, 4.3, 4.6, and 4.7 cleanly. 4.8 caught bug
#4 above (missing re-approval guard), now fixed but **needs a
redeploy** before it can be reconfirmed. 4.4/4.5 (tamper checks) were
deliberately NOT run against `suzuki-sv650-1999` since it's a real
submission, not a throwaway -- still need a dedicated disposable test
vehicle. Tier 5 (collaborator management) still needs its own live pass
now that a real, public vehicle repo exists. Each item below states
explicitly whether it's checked live, checked only
synthetically, or still pending one of these.

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
| 4.2 | `GET /pending-vehicles` | Succeeds, shows real pending repos | **Live, PASS** -- returns `{"pending":[]}` correctly (empty because no vehicle repos exist yet, confirmed separately via `gh api orgs/BlaydeManual/repos?type=private`); re-run once a real pending repo exists to confirm it's actually listed, not just that empty works |
| 4.3 | `POST /approve-vehicle` `dry_run: true` on a genuine, untampered pending submission | All 4 checks pass, `{"checked": true}` | Synthetic only so far -- **needs a real direct-submit repo to re-run live** |
| 4.4 | Manually push an extra file (e.g. a dummy `.github/workflows/x.yml`) to a pending repo, then `dry_run: true` | **Rejected** -- file-allowlist check | Synthetic only -- **this is the scenario the file-allowlist exists for, worth a real live confirmation, not just trust in the mock** |
| 4.5 | Manually edit `manifest.json` on a pending repo (any change), then `dry_run: true` | **Rejected** -- notarization hash mismatch | Synthetic only -- same, worth a real live confirmation |
| 4.6 | `POST /approve-vehicle` with `repo_name: "registry"` (or `submission-log`, `blayde-manual`, `vehicle-scaffold`) | **Rejected** -- reserved-name check, before any GitHub calls happen | **Live, PASS** -- confirmed with a real admin token: `{"error":"\"registry\" is a reserved repo, not a pending vehicle proposal."}` |
| 4.7 | `POST /approve-vehicle` (real, not dry-run) on a genuine, clean submission | Repo flips public, `registry.json` gets a real new entry | **Live, PASS, 2026-08-27** -- real 415-page `suzuki-sv650-1999` manual (indexed by hypnolope, approved by TheBlayde via the real browser UI). Commit `c0175ec5` "Approve suzuki-sv650-1999 (OEM)"; `registry.json` has the correct entry (`status: approved`, correct `repo_url`, correct notarized `source_pdf_sha256`); repo confirmed `private: false`. Note: verify via `gh api repos/.../contents/registry.json`, NOT `raw.githubusercontent.com` -- the latter lagged behind the real commit by several minutes on this check (CDN cache, not a bug) |
| 4.8 | Try `/approve-vehicle` a second time on the same, already-approved repo | Should fail gracefully -- confirms no double-registration | **Live, FAILED, then fixed -- bug #4 above.** `dry_run: true` on the already-public `suzuki-sv650-1999` incorrectly returned `{"checked":true}` instead of rejecting. Fix applied, not yet redeployed; re-run after redeploy to confirm PASS |

### Tier 5: Vehicle-repo maintainer management (`my-vehicles.js`, direct GitHub calls, no Worker involved)

Unlike everything above, these calls never touch the Worker or the
installation credential at all -- they run with the maintainer's own
classic OAuth token directly against GitHub, which is why they're
organized by real GitHub *repo* permission level rather than org
membership tier. All of them are blocked until at least one real
vehicle repo exists (Tier 4's 4.7) -- there is nothing to manage a
roster on yet.

| # | Call | Expected | Status |
|---|---|---|---|
| 5.1 | Sign in as a real repo **admin** on a vehicle repo, load My Vehicles | Roster loads real collaborators + pending invitations; invite input and Remove buttons are shown | Pending -- needs a real vehicle repo |
| 5.2 | Same account, `PUT .../collaborators/{a-real-github-handle}` via the Invite button | `201` (outside user, invitation sent) or `204` (already an org member, added directly) -- both surface as success, roster re-renders and shows the new row | Pending |
| 5.3 | Invite a handle that doesn't exist | Clean error shown inline (`no GitHub user named "..."`), not a raw GitHub error dump | Pending |
| 5.4 | Remove an already-accepted collaborator | `DELETE .../collaborators/{handle}`, row disappears | Pending |
| 5.5 | Cancel a still-pending invitation | `DELETE .../invitations/{id}` (NOT the collaborators endpoint), row disappears | Pending -- confirms the two removal paths are actually distinguished, not just in the synthetic test |
| 5.6 | Sign in as someone with **push but not admin** on the same repo, load My Vehicles | Read-only roster -- no invite input, no Remove buttons, a note explaining why | Pending -- needs a second real account with push-only access, or a repo where `TheBlayde` isn't the only collaborator |
| 5.7 | That push-only account tries the invite/remove calls directly (bypassing the hidden UI, e.g. via curl with their own token) | GitHub itself rejects with `403` -- confirms the UI gate isn't the only thing standing between push access and roster control | Pending |
| 5.8 | A repo the signed-in account has NO access to at all | Doesn't appear in `discoverMaintainedRepos()`'s result, no card rendered | Pending -- implicitly covered by 5.1's `GET /user/repos` only ever returning repos with real access, but worth a direct look |

## Sequencing (do these in order, not all at once)

1. ~~Register the GitHub App, install on BlaydeManual (all repos), provision the four secrets, create `BlaydeManual/submission-log`~~ -- **done**.
2. ~~Deploy the Worker's new code~~ -- **done** (via manual dashboard paste; see the follow-up note above about setting up `wrangler deploy` properly before the next change).
3. ~~Re-run Tier 1 in full~~ -- **done, all PASS** (see the Tier 1 table above).
4. ~~Have hypnolope accept the org invitation~~ -- **done** (`role: member, state: active`, confirmed live). This closed the window to run true Tier 2 (non-member) tests against that account -- **backlogged**, see Tier 2's note; needs a third, never-invited account later, not blocking.
5. ~~Add the GitHub App's `Members` (read) permission; remove the unused `Issues` permission. Re-accept the updated permissions on the BlaydeManual installation~~ -- **done, confirmed live 2026-08-27** (the "re-approve" step turned out to be a real, separate action from editing the App's own checkboxes -- confirmed live that the installation kept the old permission set until that second step happened).
6. ~~Redeploy the Worker~~ -- **done, confirmed live 2026-08-27** (`/pending-vehicles` with a real admin token now returns `{"pending":[]}` cleanly).
7. ~~Fix the org-settings gaps~~ -- **done, confirmed live 2026-08-27**: member repo creation off (all three sub-toggles `false`), org-wide 2FA required (`true`). `enforce_admins` and `submission-log`'s branch protection reviewed and kept as deliberate decisions (escape hatch retained for now; append-only-by-permission-economics accepted) -- documented in SECURITY.md, not left as unstated gaps.
8. ~~Merge this PR and confirm the site deploys to Pages~~ -- **done, confirmed live 2026-08-27** (merged, `https://blaydemanual.com/auth.js` contains `signInWithGitHubApp`).
9. **In progress**: Run Tier 3 in full with hypnolope's account (a real member). hypnolope is currently indexing a real vehicle document -- submitting it creates the real direct-submit repo Tier 4 and Tier 5 both need. **Stop and fix before continuing if 2.6/repo-scope validation doesn't behave as expected** (run as part of this tier now) -- that's the critical fix from the security audit.
10. Run Tier 4 items 4.3-4.5 and 4.7-4.8 (4.1, 4.2, 4.6 already live-confirmed above) using the repo created in step 9.
11. Only once 4.3-4.6 all pass cleanly: run 4.7 (the real approval) and 4.8, on a real, intentionally-throwaway test vehicle -- not a real manual -- since this is the one step in the whole plan that makes a real repo public and writes to the real registry.
12. Run Tier 5 (maintainer/collaborator management) against the now-public test vehicle repo from step 11 -- this is the first point any of it can run live.
13. Clean up: decide whether to keep or delete the throwaway approved test-vehicle repo/registry entry (and any test collaborators added in step 12).
14. **Backlog item**: run a real Tier 2 pass with a third, never-invited GitHub account, specifically for rows 2.4 and 2.8 (the membership-gate rejections) -- the only two checks in this whole plan that genuinely require someone who has never had any standing in the org.

## What this plan does NOT cover

- Load/rate-limit behavior of `/direct-submit` under real spam (SECURITY.md's known-gap note) -- worth a dedicated pass later, not blocking this merge.
- The classic OAuth path's existing real flows (contribute.js fork+PR, review-panel.js accept/reject) -- unchanged by this PR, already live and working, out of scope for re-testing here.
- Anything requiring GitHub's own infrastructure to misbehave (e.g., a genuinely compromised GitHub Apps platform) -- out of scope for a project like this.

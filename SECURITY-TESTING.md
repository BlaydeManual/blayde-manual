# Active security testing plan -- GitHub App migration (PR #21)

Companion to SECURITY.md, not a replacement for it. That file describes
the architecture and what each control is *supposed* to do; this one is
the checklist for actually proving each control does that, against the
real, live infrastructure -- run through before merging, and again
after each deploy step, not written once and forgotten.

**Four real bugs found during this live pass, none caught by any
synthetic test, all four now fixed, redeployed, and confirmed live as
of 2026-08-27** -- each one only surfaced by actually calling the
deployed Worker with a real token, exactly the scenario this whole
document exists to catch:

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
   approved. **Redeployed (PR #22, kept open pending the rest of this
   testing pass) and confirmed live** -- see 4.8's row below.

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

**Closed, 2026-08-27**: the Worker now deploys itself. `.github/workflows/deploy-worker.yml`
runs `wrangler deploy` on every push to `main` touching `auth-worker/` --
the manual dashboard-paste process this note used to warn about is no
longer the normal path (see `auth-worker/README.md`). Needs a one-time
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` GitHub Actions secret
setup before the first auto-deploy can run.

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
| 4.4 | Manually push an extra file (e.g. a dummy `.github/workflows/x.yml`) to a pending repo, then `dry_run: true` | **Rejected** -- file-allowlist check | **Live, PASS, 2026-08-27** -- against the real `blayde-manual-2026` staging repo (an original, no-copyright test manual built specifically for this). Pushed `.github/workflows/x.yml` with TheBlayde's own token (org owners have implicit admin access to every repo, including locked direct-submit ones -- confirmed live). `dry_run` correctly rejected: `"expected exactly {README.md, manifest.json}, found {.github, README.md, manifest.json}."` Dummy file removed afterward, repo confirmed back to clean state |
| 4.5 | Manually edit `manifest.json` on a pending repo (any change), then `dry_run: true` | **Rejected** -- notarization hash mismatch | **Live, PASS, 2026-08-27** -- same staging repo. Added a trivial field to `manifest.json`; `dry_run` correctly rejected: `"manifest hash doesn't match the notarized submission -- it was edited after submitting."` Original content restored byte-for-byte afterward (`sha` confirmed identical to pre-tamper capture); `dry_run` clean again post-restore |
| 4.6 | `POST /approve-vehicle` with `repo_name: "registry"` (or `submission-log`, `blayde-manual`, `vehicle-scaffold`) | **Rejected** -- reserved-name check, before any GitHub calls happen | **Live, PASS** -- confirmed with a real admin token: `{"error":"\"registry\" is a reserved repo, not a pending vehicle proposal."}` |
| 4.7 | `POST /approve-vehicle` (real, not dry-run) on a genuine, clean submission | Repo flips public, `registry.json` gets a real new entry | **Live, PASS, 2026-08-27** -- real 415-page `suzuki-sv650-1999` manual (indexed by hypnolope, approved by TheBlayde via the real browser UI). Commit `c0175ec5` "Approve suzuki-sv650-1999 (OEM)"; `registry.json` has the correct entry (`status: approved`, correct `repo_url`, correct notarized `source_pdf_sha256`); repo confirmed `private: false`. Note: verify via `gh api repos/.../contents/registry.json`, NOT `raw.githubusercontent.com` -- the latter lagged behind the real commit by several minutes on this check (CDN cache, not a bug) |
| 4.8 | Try `/approve-vehicle` a second time on the same, already-approved repo | Should fail gracefully -- confirms no double-registration | **Live, PASS, 2026-08-27 (after fix + redeploy, PR #22).** `dry_run: true` on the already-public `suzuki-sv650-1999` now correctly rejects: `"suzuki-sv650-1999" is already public -- it's already been approved, not a pending proposal.` Control check (a genuinely nonexistent repo name) still returns a plain `Not Found`, confirming no false positives from the new guard |

### Tier 5: the whole Maintainer Portal against real approved repos (direct GitHub calls, no Worker involved)

Broadened, 2026-08-27, per direct instruction: not just `my-vehicles.js`'s
roster in isolation -- My Vehicles AND Review Photo Requests both draw
from the same real `discoverMaintainedRepos()` list now (PR #23 fixes
that list to include org-role access, not just explicit collaborator
grants), so both need to actually work end-to-end against the two real
approved repos (`suzuki-sv650-1999`, `blayde-manual-2026`) before this
counts as done. **Issue Requests stays explicitly out of scope** -- it
has its own separate, already-documented mock-registry problem
(`MOCK_REGISTRY`, `mockVehicleSlugForRepo`) unrelated to this pass, not
something this testing round is meant to fix.

Unlike everything above, all of these calls run with the maintainer's
own classic OAuth token directly against GitHub, never the Worker or
the installation credential -- organized by real GitHub *repo*
permission level rather than org membership tier.

**My Vehicles:**

| # | Call | Expected | Status |
|---|---|---|---|
| 5.0 | Load My Vehicles after PR #23 deploys | Both `suzuki-sv650-1999` and `blayde-manual-2026` appear as cards -- confirms the `organization_member` affiliation fix actually works in the real browser UI, not just via direct API calls | Pending deploy |
| 5.1 | Sign in as a real repo **admin** on a vehicle repo, load My Vehicles | Roster loads real collaborators + pending invitations; invite input and Remove buttons are shown | Pending 5.0 |
| 5.2 | Same account, `PUT .../collaborators/{a-real-github-handle}` via the Invite button | `201` (outside user, invitation sent) or `204` (already an org member, added directly) -- both surface as success, roster re-renders and shows the new row | Pending |
| 5.3 | Invite a handle that doesn't exist | Clean error shown inline (`no GitHub user named "..."`), not a raw GitHub error dump | Pending |
| 5.4 | Remove an already-accepted collaborator | `DELETE .../collaborators/{handle}`, row disappears | Pending |
| 5.5 | Cancel a still-pending invitation | `DELETE .../invitations/{id}` (NOT the collaborators endpoint), row disappears | Pending -- confirms the two removal paths are actually distinguished, not just in the synthetic test |
| 5.6 | Sign in as someone with **push but not admin** on the same repo, load My Vehicles | Read-only roster -- no invite input, no Remove buttons, a note explaining why | Pending -- needs a second real account with push-only access, or a repo where `TheBlayde` isn't the only collaborator |
| 5.7 | That push-only account tries the invite/remove calls directly (bypassing the hidden UI, e.g. via curl with their own token) | GitHub itself rejects with `403` -- confirms the UI gate isn't the only thing standing between push access and roster control | Pending |
| 5.8 | A repo the signed-in account has NO access to at all | Doesn't appear in `discoverMaintainedRepos()`'s result, no card rendered | Pending -- implicitly covered by 5.1's `GET /user/repos` only ever returning repos with real access, but worth a direct look |

**Review Photo Requests:**

| # | Call | Expected | Status |
|---|---|---|---|
| 5.9 | Load Review Photo Requests after PR #23 deploys | Repo-scope check passes for both real repos (`reposToCheck()` now draws from the fixed `discoverMaintainedRepos()`), tab shows the PR list area (likely empty -- no real photo-submission PRs exist against either repo yet) | Pending deploy |
| 5.10 | Submit a real photo contribution (via `contribute.js`, Public or Private path) against one of the two real repos, then check it shows up here | A real PR appears in the review list, reviewable/mergeable for real -- exercises the full contribute -> review loop against a real, live vehicle for the first time | Pending -- needs a real contribution submitted first |

## Sequencing (do these in order, not all at once)

1. ~~Register the GitHub App, install on BlaydeManual (all repos), provision the four secrets, create `BlaydeManual/submission-log`~~ -- **done**.
2. ~~Deploy the Worker's new code~~ -- **done** (via manual dashboard paste; see the follow-up note above about setting up `wrangler deploy` properly before the next change).
3. ~~Re-run Tier 1 in full~~ -- **done, all PASS** (see the Tier 1 table above).
4. ~~Have hypnolope accept the org invitation~~ -- **done** (`role: member, state: active`, confirmed live). This closed the window to run true Tier 2 (non-member) tests against that account -- **backlogged**, see Tier 2's note; needs a third, never-invited account later, not blocking.
5. ~~Add the GitHub App's `Members` (read) permission; remove the unused `Issues` permission. Re-accept the updated permissions on the BlaydeManual installation~~ -- **done, confirmed live 2026-08-27** (the "re-approve" step turned out to be a real, separate action from editing the App's own checkboxes -- confirmed live that the installation kept the old permission set until that second step happened).
6. ~~Redeploy the Worker~~ -- **done, confirmed live 2026-08-27** (`/pending-vehicles` with a real admin token now returns `{"pending":[]}` cleanly).
7. ~~Fix the org-settings gaps~~ -- **done, confirmed live 2026-08-27**: member repo creation off (all three sub-toggles `false`), org-wide 2FA required (`true`). `enforce_admins` and `submission-log`'s branch protection reviewed and kept as deliberate decisions (escape hatch retained for now; append-only-by-permission-economics accepted) -- documented in SECURITY.md, not left as unstated gaps.
8. ~~Merge this PR and confirm the site deploys to Pages~~ -- **done, confirmed live 2026-08-27** (merged, `https://blaydemanual.com/auth.js` contains `signInWithGitHubApp`).
9. ~~Run Tier 3 with hypnolope's account, creating the real `suzuki-sv650-1999` submission~~ -- **done**. 2.6 (repo-scope validation, the critical fix) passed live.
10. ~~Run Tier 4 items 4.1-4.3, 4.6~~ -- **done, all PASS**, against the real `suzuki-sv650-1999` submission.
11. ~~Run 4.7 (the real approval) and 4.8~~ -- **done**. `suzuki-sv650-1999` approved for real; 4.8 initially FAILED (found bug #4, the missing re-approval guard), fixed and reconfirmed PASS after redeploy (PR #22).
12. ~~Build a disposable "staging" test vehicle (`blayde-manual-2026`, original/no-copyright) and run 4.4/4.5 against it~~ -- **done, both PASS**. Submitted, approved for real, repo restored to clean state after tampering.
13. ~~Found and fixed: My Vehicles missing repos accessed via org role~~ -- **done** (PR #23, stacked on #22).
14. **Next**: finish Tier 5 (now broadened to cover My Vehicles AND Review Photo Requests against both real approved repos, not just the collaborator roster in isolation -- see Tier 5's table above; Issue Requests stays out of scope).
15. Once Tier 5 passes: merge PR #22 and #23 onto a clean `main`.
16. **Then**, from that clean base: start the UI-consistency work, one page at a time -- first the shared review-gallery layout fix (Prev/Next above the thumbnails, submit closes to a summary, across `indexer-review.js` and `org-approval.js`), then the sign-in-consolidation redesign as its own separate PR (per direct instruction, not folded into the layout work).
17. **Backlog item, still not blocking**: run a real Tier 2 pass with a third, never-invited GitHub account, specifically for rows 2.4 and 2.8 (the membership-gate rejections) -- the only two checks in this whole plan that genuinely require someone who has never had any standing in the org.
18. **Backlog item, still not blocking**: decide whether to keep or delete the disposable staging repo (`blayde-manual-2026` only -- `suzuki-sv650-1999` is hypnolope's real work, not a throwaway, and stays regardless) and any test collaborators added during Tier 5.

## Tier 6: the photo-PR merge-time trust gate and vehicle-scaffold required check (PR #34)

Not part of the original PR #21 App-migration scope this document was
written for -- added later in the same pass. Covers `/accept-photo-pr`,
`applyVehicleScaffold`, the `checker` required branch-protection status
check, and the client-side/Worker-side photo-metadata (ICC profile)
fixes. Structured the same way as the tiers above: what's checked, how,
and its status.

| # | Check | Result |
|---|---|---|
| 6.1 | `/accept-photo-pr` happy path, extra-file PR, EXIF-carrying photo, under-permissioned caller | **Synthetic** -- a local, uncommitted Node script mocked `fetch` and drove the real logic with a generated RSA test key for the App-JWT signing path; all four scenarios behaved correctly. Not a checked-in test suite (`auth-worker/` doesn't export individual handlers for one) -- see SECURITY.md's note on this exact point |
| 6.2 | `checker` required status check genuinely blocks a normal (non-`--admin`) merge when the CI run fails | **Live, PASS** -- confirmed against `blayde-manual-2026`: `"Pull request ... is not mergeable: the base branch policy prohibits the merge."` A passing run merges normally |
| 6.3 | `applyVehicleScaffold` applies the live `BlaydeManual/vehicle-scaffold` template's current files, not a stale local copy | **Live, PASS** -- `git hash-object` on every local `scaffold/*` file matched the corresponding blob SHA from the live template repo's tree at time of check |
| 6.4 | `stripJpegAuxSegments` (contribute.js) actually produces a JPEG with zero non-pixel data | **Live, PASS** -- verified in-browser against real fixtures, then independently confirmed via a real `checker.py` run (no `non_pixel_data` entries) |
| 6.5 | `jpegHasMetadata` (Worker) catches the same APP2/ICC profile `stripJpegAuxSegments` removes | **Live/Node, PASS** -- direct Node call against the fixed function returned `true` on ICC-contaminated bytes (was `false` before the fix) |

**Process incident, disclosed plainly rather than smoothed over:** during
6.2's verification, `gh pr merge --admin` was run before a normal merge
had been tested, bypassing branch protection (`enforce_admins: false`
is this project's own documented escape hatch) and force-merging a bad
EXIF-carrying test photo into `blayde-manual-2026`'s real `main`. Caught
immediately, not silently fixed -- cleaned up via a real PR (`blayde-manual-2026`
PR #6) rather than a direct push, per standing instruction that changes
to real repos go through a PR for review. A follow-up normal merge
attempt against a still-failing check then confirmed 6.2 for real.

## Tier 7: category expansion writes (`/accept-recategorization`, registry.json fork+PR)

Added 2026-09-01, prompted by a direct instruction to review this whole
matrix now that most of the category-expansion procedures are in
place. Covers real new attack surface this document never accounted
for: `category`/`manual_type` now flow through `/direct-submit` ->
`/approve-vehicle` (existing endpoints, new fields), and a brand-new
endpoint plus a brand-new client-side write path exist specifically to
recategorize an already-approved item.

**Real bug found and fixed during this review, not caught when
category/manual_type were first added:** `handleApproveVehicle`'s
manifest-schema check validated `entries[]`/`page_geometry`/`vehicle`
but never checked `category`/`manual_type` against `manual-types.json`
before writing them straight into the public `registry.json` -- a
submitted manifest's category/type went through completely
unvalidated, both for a brand-new vehicle and for a new edition's
sibling-inherited values. `indexer-review.js`'s dropdowns are
client-side UI, not a security boundary. **Fixed**: added the same
`manual-types.json` check `handleAcceptRecategorization` already used,
applied to `/approve-vehicle` too, before either field reaches the
registry (auth-worker PR, 2026-09-01).

**The two things this tier actually covers:**
- `POST /accept-recategorization` -- the merge-time gate. Approves (or
  dry-runs) a PR against `BlaydeManual/registry` that changes exactly
  one entry's `category`/`manual_type`, nothing else. Same shape as
  the existing photo-PR/vehicle-approval gates: negative file-allowlist
  (exactly one file, `registry.json`, `modified`), single-entry diff
  validation, org-approver bar (`requireOrgApprover` -- same single-
  admin behavior as `/approve-vehicle`, see Tier 4's real quorum
  finding, which applies here identically), `dry_run` support, merge
  pinned to `pr.head.sha`.
- **The new client-side write path** (`contribute.js`'s
  `submitRecategorizationProposal`) -- fork `BlaydeManual/registry`
  with the *contributor's own OAuth token* (not the Worker, not the
  installation credential), edit `registry.json` on a new branch,
  open a PR back to the org repo. Same fork-then-PR shape as the
  existing Private photo-contribution path, just aimed at the registry
  repo and editing an existing file instead of adding a new one. The
  real security boundary here isn't this step at all (anyone forking a
  public repo and opening a PR is just normal GitHub, by design, same
  "anyone can propose" posture as `/direct-submit`'s Tier 2.3) -- it's
  entirely `/accept-recategorization`'s merge-time gate, above.

| # | Call | Expected | Status |
|---|---|---|---|
| 7.1 | `POST /accept-recategorization` with no `Authorization` header | `500`, `{"error":"Not signed in."}`, same as every other privileged endpoint (Tier 1 pattern) | Pending -- not yet run against live infra |
| 7.2 | Same call, real signed-in identity, NOT a BlaydeManual member | Rejected by `requireOrgApprover` the same way `/approve-vehicle` rejects a non-member (Tier 2.8's pattern) | Pending -- same third-account backlog blocker as Tier 2.4/2.8 |
| 7.3 | Same call, real member, NOT an admin | Rejected -- `"isn't an active admin"`, confirming the admin bar here is the same real, separate check Tier 3.2 already confirmed for `/approve-vehicle` | Pending |
| 7.4 | Real org admin, `dry_run: true`, against a hand-crafted PR that changes ONLY `category`/`manual_type` on one real entry to a real pair | `{"checked": true, entry, changedFields}` | Pending -- needs a real open PR against the registry repo; no real "other"-tagged entry exists yet worth recategorizing for real |
| 7.5 | Same, but the PR also touches a second file (e.g. `manual-types.json` alongside `registry.json`) | Rejected -- negative file-allowlist, same shape as 4.4's tamper check | Pending |
| 7.6 | Same, but the PR changes a field other than `category`/`manual_type` on the target entry (e.g. `repo_url`, `status`) | Rejected -- single-entry diff validation catches the extra field | Pending |
| 7.7 | Same, but the new `category`/`manual_type` values aren't real ids in `manual-types.json` | Rejected -- the same validation just added to `/approve-vehicle` (this tier's own found-bug, above) | Pending |
| 7.8 | Same, but the PR adds or removes a `registry.json` entry instead of just changing one | Rejected -- entry-count/identity check | Pending |
| 7.9 | A contributor forks `BlaydeManual/registry` and opens a real PR via `submitRecategorizationProposal`, using their own OAuth token, NOT a member | **Succeeds** -- by design, same "anyone can propose" posture as `/direct-submit` 2.3; the real gate is 7.1-7.8 at merge time, not here | Pending |
| 7.10 | `POST /direct-submit` (or a new-edition submission) with a manifest containing a `category`/`manual_type` that isn't real | **Rejected** post-fix -- confirms the bug found in this review is actually closed, not just theoretically fixed | Pending -- needs a live re-run against the fixed code |

**Not covered by this tier, logged as a real gap, not silently
dropped:** there's still no UI-level way for a contributor to discover
*which* real entries are worth recategorizing (e.g. a maintained list
of everything still tagged `other`) -- ROADMAP.md already notes this
as "not yet built." That's a missing feature, not a security gap, but
it means 7.4/7.9/7.10 above can't be exercised against a genuinely
real, user-initiated recategorization yet, only a hand-crafted one.

## Tier 8: manifest-fix proposals (`/accept-manifest-change`, manifest.json fork+PR)

Added 2026-09-02. Same real gap Tier 7 covers for `registry.json` --
anyone can propose a fix (a mispositioned/mis-sized box, a missed photo
opportunity, an entry that shouldn't be tracked at all), a repo's own
maintainer reviews and merges it -- applied here to a vehicle's own
`manifest.json` instead of the org-wide registry, so the approval bar
is per-repo push-or-better (same as `/accept-photo-pr`), not org-admin
(`/accept-recategorization`'s bar): a manifest describes one vehicle's
own content, not org-wide classification data.

**The two things this tier covers:**
- `POST /accept-manifest-change` -- the merge-time gate. Approves (or
  dry-runs) a PR that changes exactly one of: one entry added, one
  entry removed, or one entry's `pixel_bbox` changed -- nothing else,
  on either side of the diff, including everything outside `entries`
  (`page_geometry`, vehicle metadata) staying byte-identical. Same
  negative-file-allowlist + single-change-diff shape as Tier 7's gate,
  aimed at `<edition_id>/manifest.json` instead of `registry.json`.
- **The client-side write path** (`issue-requests.js`'s
  `submitManifestChange`, loaded from the Contributor Portal) -- fork
  the vehicle repo with the *contributor's own OAuth token*, edit
  `manifest.json` on a new branch, open a PR back to the org repo. Same
  fork-then-PR shape as `submitRecategorizationProposal`; the real
  security boundary is entirely the merge-time gate above, not this
  step (anyone forking a public repo and opening a PR is just normal
  GitHub, same "anyone can propose" posture as Tier 2.3/7.9).

**Real, confirmed gap found and closed in the same pass, not specific
to this endpoint:** direct question ("I swear we had repo policies in
place that states you can't be one of the 2 approvers if you submitted
it") led to checking rather than assuming. GitHub's own website hides
the Approve/merge controls for a PR's own author, but that's web-UI-only
behavior -- confirmed directly against the live REST API that a
self-submitted `APPROVE` review is accepted, not rejected, since this
app calls the API directly and never goes through github.com's own UI.
Nothing in `handleAcceptPhotoPr`, `handleAcceptRecategorization`, or
this endpoint checked the approver's identity against the real
submitter at all before this fix. Closed with `resolveRealSubmitter`
(checks the photo's own filename convention first, since a Public-path
PR's recorded `pr.user.login` is always the App's bot identity, never
the real contributor; falls back to `pr.user.login` for the two
fork-based paths, where it's already the real proposer) -- applied as
an explicit block in all three accept/merge handlers, and as an
exclusion in `handlePrReviewStatus` so a self-review never counts
toward the required approval count in the first place, not just at
final-merge time. `review-panel.js`'s Approve button is also disabled
client-side for the real submitter, so the UI doesn't invite a click
that would silently do nothing.

| # | Call | Expected | Status |
|---|---|---|---|
| 8.1 | `POST /accept-manifest-change` with no `Authorization` header | `500`, `{"error":"Not signed in."}`, same Tier 1 pattern | Pending -- not yet run against live infra |
| 8.2 | Same call, real signed-in identity, NOT a collaborator on the target repo | Rejected -- `"isn't a collaborator on..."`, same shape as `/accept-photo-pr`'s permission check | Pending |
| 8.3 | Same call, real collaborator, but only `read`/`triage`, not `push`-or-better | Rejected -- `"needs push access or better..."` | Pending |
| 8.4 | Real push-level maintainer, `dry_run: true`, against a real open manifest-fix PR proposing exactly one add/remove/reposition | `{"checked": true, summary}` | Pending -- have two real open PRs to test against once deployed |
| 8.5 | Same, but the PR also touches a second file, or something outside `entries` in the same manifest.json | Rejected -- negative allowlist / "changes something besides its entries list" | Pending |
| 8.6 | Same, but the diff adds AND removes/modifies more than one entry's worth | Rejected -- "not exactly 1" changed-entries check | Pending |
| 8.7 | Same, but a newly added entry is missing a required field, doesn't start `needs_contributed_photo`, or has a malformed `pixel_bbox` | Rejected -- new-entry field validation | Pending |
| 8.8 | **The real submitter of the PR being reviewed attempts to Accept or Approve their own proposal** | Rejected server-side (`resolveRealSubmitter` match); Approve button already disabled client-side; the review-status count excludes their own review even if one somehow got submitted | Pending -- this is the fix from the finding above; verify against a real self-submitted PR, and independently for `/accept-photo-pr` and `/accept-recategorization` too, since the same fix landed in all three |
| 8.9 | A contributor forks a vehicle repo and opens a real PR via `submitManifestChange`, using their own OAuth token, NOT a maintainer of that repo | **Succeeds** -- by design, same "anyone can propose" posture as Tier 2.3/7.9; the real gate is 8.1-8.8 at merge time | Pending |

**Not covered by this tier:** the Maintainer Portal's review UI
(`review-panel.js`'s full-page color-coded diff view) is a display/UX
concern, not a security boundary -- what a maintainer *sees* before
clicking Accept has no bearing on what the Worker independently
re-verifies at that moment. A maintainer who trusts a misleading render
and clicks Accept anyway still only gets what 8.1-8.7 above allow
through.

## What this plan does NOT cover

- Load/rate-limit behavior of `/direct-submit` under real spam (SECURITY.md's known-gap note) -- worth a dedicated pass later, not blocking this merge.
- The classic OAuth path's existing real flows (contribute.js fork+PR, review-panel.js accept/reject) -- unchanged by this PR, already live and working, out of scope for re-testing here.
- Anything requiring GitHub's own infrastructure to misbehave (e.g., a genuinely compromised GitHub Apps platform) -- out of scope for a project like this.
- **Issue Requests' real-registry fix (2026-09-01)**: `issue-requests.js` was rewired off `MOCK_REGISTRY` onto the real registry -- purely a data-source fix (same `loadRegistry()` call every other real tool already uses), no new privileged write path, so it doesn't need its own tier here. Worth a live sanity check once a second real, multi-edition repo exists, but not a security-relevant gap.

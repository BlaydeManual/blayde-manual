# Blayde Auth Worker

Two jobs now: trades a GitHub OAuth `code` for an access token (both
the classic OAuth App and the GitHub App's user-to-server flow), and
performs the small set of privileged actions (direct-submit,
direct-contribute, pending-vehicles, approve-vehicle) using the GitHub
App's own installation credential -- one the browser never holds. See
`SECURITY.md` and `SECURITY-TESTING.md` at the repo root for how this
fits into the rest of the architecture and how to verify it actually
works once deployed.

## Deploy

**As of 2026-08-27, this deploys automatically.** `.github/workflows/deploy-worker.yml`
runs `wrangler deploy` on every push to `main` that touches `auth-worker/`
-- merging a PR that changes this Worker's code is the whole deploy, no
manual dashboard paste needed anymore. One-time setup, not something to
repeat per change:

1. Cloudflare dashboard -> My Profile -> API Tokens -> Create Token ->
   use the **"Edit Cloudflare Workers"** template, scoped to this
   account. Copy the token (shown once).
2. Cloudflare dashboard -> any page showing your account -> copy the
   **Account ID** from the right-hand sidebar.
3. GitHub repo -> Settings -> Secrets and variables -> Actions -> add
   two **repository secrets** (these are GitHub's own secrets store,
   separate from the Worker's own Cloudflare secrets below):
   - `CLOUDFLARE_API_TOKEN` -- the token from step 1.
   - `CLOUDFLARE_ACCOUNT_ID` -- the ID from step 2.

Once both exist, every future `auth-worker/` change deploys itself on
merge. The manual `wrangler deploy` steps below still work and are
useful for a one-off local deploy (e.g. testing a change before
opening a PR), but are no longer required for normal changes.

## Manual deploy (fallback, not the normal path anymore)

1. Install wrangler if you don't have it: `npm install -g wrangler`
2. `cd auth-worker`
3. `wrangler login`
4. Set all five secrets -- `wrangler secret put <NAME>`, paste the
   value when prompted, for each of:
   - `GITHUB_CLIENT_SECRET` -- classic OAuth App's client secret.
   - `GITHUB_APP_ID` -- the GitHub App's numeric App ID.
   - `GITHUB_APP_CLIENT_ID` -- the GitHub App's Client ID (also hardcoded
     client-side in `web/auth.js`'s `GITHUB_APP_CLIENT_ID` -- that's
     public by design, same as the classic OAuth App's client ID).
   - `GITHUB_APP_CLIENT_SECRET` -- the GitHub App's client secret.
   - `GITHUB_APP_PRIVATE_KEY` -- the full, unmodified contents of the
     `.pem` file GitHub generates for the App, including its
     `-----BEGIN/END ... PRIVATE KEY-----` lines. GitHub issues these as
     PKCS#1 (`RSA PRIVATE KEY`), not PKCS#8 -- the Worker detects and
     converts this automatically (`pemToDer`/`pkcs1ToPkcs8` in
     `src/index.js`), so paste the file exactly as downloaded, no manual
     conversion needed.

   None of these are written to disk or committed anywhere in this
   repo. Secrets set via the Cloudflare dashboard (Workers & Pages ->
   this worker -> Settings -> Variables) work identically -- either
   path is fine, but **setting a secret alone does not redeploy the
   Worker's code** (step 5 below is still required after any code
   change, including this migration).
5. `wrangler deploy`

This publishes to `auth.blaydemanual.com` (the route in
`wrangler.toml`). Since `blaydemanual.com`'s DNS already runs through
Cloudflare, that route attaches automatically -- no separate DNS
record needed.

## GitHub app settings

Classic OAuth App and the GitHub App both need their Authorization/
Callback URL set to:

```
https://blaydemanual.com/auth/callback.html
```

The GitHub App additionally needs to be installed on the BlaydeManual
org with "All repositories" access, and its permissions set to:
Contents (read/write), Pull requests (read/write), Administration
(read/write -- the **repository-level** permission, not the separate
organization-level "Administration" entry, which this project doesn't
use), Members (read -- organization permission), and Metadata
(read-only). See `SECURITY.md` for why each is needed; `Issues` is
deliberately NOT granted (unused -- zero `/issues` calls anywhere in
this Worker).

**Editing an already-installed App's permissions is a two-step
process, confirmed live**: changing the checkboxes on the App's own
settings page does not by itself change what an existing installation
is granted -- a separate approval step on the installation (Organization
settings -> GitHub Apps -> this app -> there's a pending-update prompt)
is required before the new permission set actually takes effect.

## Redeploying after a secret rotation

Re-run the relevant `wrangler secret put` command with the new value,
then `wrangler deploy` again to pick it up.

# Blayde Auth Worker

Does exactly one thing: trades a GitHub OAuth `code` for an access
token, using the client secret, which never leaves this Worker. See
`SECURITY.md` at the repo root for how this fits into the rest of the
architecture.

## Deploy

1. Install wrangler if you don't have it: `npm install -g wrangler`
2. `cd auth-worker`
3. `wrangler login`
4. `wrangler secret put GITHUB_CLIENT_SECRET` -- paste the client
   secret from the GitHub OAuth App settings page when prompted. This
   never gets written to disk or committed anywhere in this repo.
5. `wrangler deploy`

This publishes to `auth.blaydemanual.com` (the route in
`wrangler.toml`). Since `blaydemanual.com`'s DNS already runs through
Cloudflare, that route attaches automatically -- no separate DNS
record needed.

## GitHub OAuth App setting

The Authorization callback URL on the OAuth App must be set to:

```
https://blaydemanual.com/auth/callback.html
```

## Redeploying after a client secret rotation

Re-run step 4 with the new value, then `wrangler deploy` again to pick
it up.

# Security

## Reporting a vulnerability

Email `security@blaydemanual.com`, or open a
[GitHub security advisory](https://github.com/BlaydeManual/blayde-manual/security/advisories/new).
Don't file a public issue for a real vulnerability -- give us time to fix
it first.

## What this project actually is, security-wise

No server-side backend, no database. Two things do all the work:

- **The browser.** Fingerprinting (SHA-256), indexing (pattern-matching,
  OCR), and patching (PDF compositing) all run entirely client-side. A
  manual you load never leaves your browser tab.
- **GitHub's own API**, called directly from the browser with your own
  OAuth token, for everything collaborative: fetching a manifest,
  submitting a photo, opening or reviewing a PR. GitHub is the backend.

**The one real exception:** GitHub OAuth has no PKCE support for a
public client, so a small stateless Cloudflare Worker exists solely to
exchange an OAuth code for a token. It holds the OAuth client secret.
It never sees file content, never stores anything, and has no state
between requests.

## OAuth

**Design, not yet live.** The OAuth App and token-exchange proxy exist;
real sign-in is not yet wired into the web app, which currently uses a
mock sign-in for testing. This section describes the target, so it's
accurate once that wiring lands, not a claim about the current build.

- Scope: `public_repo`. Covers fork, push, commit, PR, and repo creation
  for public repos -- nothing broader.
- "Sign in with GitHub" only appears at the moment of actually
  contributing, never before.
- The access token lives in the browser for that session only. It is
  never sent anywhere except GitHub's own API and the token-exchange
  proxy above.

## Repo-scope validation

Every tool that acts on a `repo_url` (the maintainer review panel,
the org-approval tool) checks it against the registry before calling
the GitHub API against it. This closes a real attack: a crafted link
could otherwise point the tool at some other repo the signed-in
maintainer happens to have write access to, unrelated to this project,
and get them to merge or close something there by mistake. A repo not
found in the registry is refused outright, not just warned about.

## What's never collected or stored

No analytics, no tracking, no server-side logs of what anyone
patches or contributes. EXIF metadata (GPS, camera model, timestamp)
is stripped from every contributed photo client-side, before it's
ever saved, not just checked afterward.

## Repo-level protection

`blayde-manual`, `registry`, and `vehicle-scaffold` all require a
code-owner-approved review before merging to `main` for anyone other
than the project owner. `CODEOWNERS` in each scopes that specifically
to infrastructure and legal files (license, CI config, the photo/
manifest checkers) -- routine maintaining (`manifest.json`, `images/**`)
stays at normal review, not gated the same way.

## Known gaps, not yet closed

- Branch protection does not carry over automatically when a new
  vehicle repo is generated from the `vehicle-scaffold` template --
  each one needs it configured as its own step today.
- CI validates contributed photos; it does not yet validate a
  `manifest.json` change on its own (a moved bbox, an edited status).
- No CLA/DCO exists yet for outside *code* contributions to the
  tooling repo -- this is a hard gate: no such contribution is
  accepted until one does.

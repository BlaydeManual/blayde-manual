// Blayde Manual -- auth + privileged-write Worker. Two kinds of job now:
// (1) trade an OAuth `code` for an access token (classic OAuth App, or the
// GitHub App's user-to-server flow) using a client secret that lives only
// in this Worker's secret bindings and never enters the browser, the repo,
// or any other part of this project; (2) perform the small number of
// actions that need the GitHub App's own INSTALLATION credential -- one
// the maintainer/contributor never holds -- because the whole point of
// those actions is that the submitter shouldn't retain write access to
// what they just submitted. See SECURITY.md and ROADMAP.md's GitHub App
// migration entry for the full reasoning.
//
// Two logins exist side by side, deliberately, not as a staged migration:
// - Classic OAuth App (public_repo scope): "create under my own account
//   first" / the Private contribute path -- keeps a real, personally-owned
//   copy, matching this project's "your photos are always yours" stance.
// - This GitHub App (user-to-server, for sign-in; installation, for the
//   privileged actions below): "submit directly" / the Public contribute
//   path -- fastest, no fork, no personal copy, because a locked/pending
//   repo the submitter can't write to also closes a real
//   time-of-check-to-time-of-use gap (see /direct-submit below).

const GITHUB_CLIENT_ID = "Ov23lijpNHggDgWfwxWa"; // classic OAuth App -- public, not sensitive
const ALLOWED_ORIGIN = "https://blaydemanual.com";
const REGISTRY_OWNER = "BlaydeManual";
const REGISTRY_REPO = "registry";
const SUBMISSION_LOG_REPO = "submission-log";
// GitHub's REST API rejects any request with no User-Agent header --
// 403, not a helpful error naming the real cause -- confirmed live: a
// verified-good token, that authenticates fine everywhere else, still
// failed every real-user check on this Worker specifically until this
// was added. Cloudflare's fetch() doesn't set one automatically the way
// curl/most HTTP clients do.
const GITHUB_USER_AGENT = "blayde-manual-auth-worker";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const { pathname } = new URL(request.url);
    try {
      if (request.method === "POST" && pathname === "/") return await handleOAuthExchange(request, env);
      if (request.method === "POST" && pathname === "/app-token") return await handleAppTokenExchange(request, env);
      if (request.method === "POST" && pathname === "/direct-submit") return await handleDirectSubmit(request, env);
      if (request.method === "POST" && pathname === "/direct-contribute") return await handleDirectContribute(request, env);
      if (request.method === "GET" && pathname === "/pending-vehicles") return await handlePendingVehicles(request, env);
      if (request.method === "POST" && pathname === "/approve-vehicle") return await handleApproveVehicle(request, env);
      if (request.method === "POST" && pathname === "/manage-collaborator") return await handleManageCollaborator(request, env);
    } catch (e) {
      // Any unexpected throw (a malformed GitHub response, a crypto
      // error, etc.) still needs to come back as JSON with CORS headers --
      // an uncaught exception in a Worker returns a bare 500 with no
      // headers at all, which the browser's fetch() reports as an opaque
      // network failure, indistinguishable from every other kind of
      // failure.
      return json({ error: e.message || "internal error" }, 500);
    }
    return json({ error: "not found" }, 404);
  },
};

// ---- classic OAuth App exchange (unchanged behavior, existing endpoint) ----
async function handleOAuthExchange(request, env) {
  const body = await parseJson(request);
  if (!body.code) return json({ error: "missing code" }, 400);
  return exchangeCodeForToken(body.code, GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET);
}

// ---- GitHub App user-to-server exchange (new, same shape) ----
async function handleAppTokenExchange(request, env) {
  const body = await parseJson(request);
  if (!body.code) return json({ error: "missing code" }, 400);
  return exchangeCodeForToken(body.code, env.GITHUB_APP_CLIENT_ID, env.GITHUB_APP_CLIENT_SECRET);
}

async function exchangeCodeForToken(code, clientId, clientSecret) {
  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!tokenResp.ok) return json({ error: "GitHub token exchange failed" }, 502);
  const tokenData = await tokenResp.json();
  if (tokenData.error) return json({ error: tokenData.error_description || tokenData.error }, 400);
  return json({ access_token: tokenData.access_token });
}

// ---- privileged actions (GitHub App installation token, never the caller's own token) ----

// Confirms the caller is a real, currently-signed-in person before doing
// anything privileged -- NOT to use their token for the actual write
// (that's what the installation token below is for), only to prove a real
// GitHub identity is asking, and to get that identity for attribution.
async function requireRealUser(request) {
  const auth = request.headers.get("Authorization") || "";
  const userToken = auth.replace(/^Bearer\s+/i, "");
  if (!userToken) throw new Error("Not signed in.");
  const resp = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${userToken}`, Accept: "application/vnd.github+json", "User-Agent": GITHUB_USER_AGENT },
  });
  if (!resp.ok) throw new Error("Could not verify signed-in user.");
  const user = await resp.json();
  return user.login;
}

// RS256 JWT signed with the App's own private key -- the credential GitHub
// requires to ask for an installation access token. Cloudflare Workers'
// native Web Crypto (crypto.subtle) does this without any npm dependency,
// consistent with this project's no-build-step design elsewhere.
async function makeAppJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  // exp capped at 10 minutes by GitHub's own limit; iat backdated 60s to
  // tolerate clock drift between this Worker and GitHub's servers.
  const payload = { iat: now - 60, exp: now + 600, iss: env.GITHUB_APP_ID };
  const encoder = new TextEncoder();
  const toSign = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(encoder.encode(JSON.stringify(payload)))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(env.GITHUB_APP_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(toSign));
  return `${toSign}.${base64url(new Uint8Array(signature))}`;
}

// GitHub Apps hand out their private key as PKCS#1 ("-----BEGIN RSA
// PRIVATE KEY-----") by default, not PKCS#8 -- confirmed live: the secret
// pasted from GitHub's own download is PKCS#1, and Web Crypto's
// importKey("pkcs8", ...) below rejects that outright. Detect and wrap it
// rather than requiring whoever sets the secret to convert the file by
// hand first (a step nothing here would warn them to take).
function pemToDer(pem) {
  const isPkcs1 = /-----BEGIN RSA PRIVATE KEY-----/.test(pem);
  const b64 = pem.replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, "").replace(/-----END (RSA )?PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return (isPkcs1 ? pkcs1ToPkcs8(bytes) : bytes).buffer;
}

// Wraps a PKCS#1 RSAPrivateKey DER blob in the minimal PKCS#8
// PrivateKeyInfo structure Web Crypto requires: SEQUENCE { version,
// AlgorithmIdentifier(rsaEncryption), OCTET STRING(pkcs1) }. The
// AlgorithmIdentifier bytes are a fixed, well-known DER encoding of
// { OID 1.2.840.113549.1.1.1, NULL } -- constant regardless of key size.
function pkcs1ToPkcs8(pkcs1) {
  const algId = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const privateKeyOctet = concatBytes(new Uint8Array([0x04, ...derLength(pkcs1.length)]), pkcs1);
  const body = concatBytes(version, algId, privateKeyOctet);
  return concatBytes(new Uint8Array([0x30, ...derLength(body.length)]), body);
}

function derLength(len) {
  if (len < 0x80) return [len];
  const bytes = [];
  let n = len;
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return [0x80 | bytes.length, ...bytes];
}

function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function base64url(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// One installation token per request, not cached -- this fires rarely
// enough (a new vehicle proposal, a photo contribution) that the extra
// round-trip is a non-issue, and it avoids any state/expiry bookkeeping
// in a Worker that's otherwise entirely stateless.
async function getInstallationToken(env) {
  const jwt = await makeAppJwt(env);
  const instResp = await fetch(`https://api.github.com/orgs/${REGISTRY_OWNER}/installation`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "User-Agent": GITHUB_USER_AGENT },
  });
  if (!instResp.ok) throw new Error(`Could not find the App's installation on ${REGISTRY_OWNER} (${instResp.status}).`);
  const installation = await instResp.json();
  const tokenResp = await fetch(`https://api.github.com/app/installations/${installation.id}/access_tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "User-Agent": GITHUB_USER_AGENT },
  });
  if (!tokenResp.ok) throw new Error(`Could not create an installation access token (${tokenResp.status}).`);
  const tokenData = await tokenResp.json();
  return tokenData.token;
}

async function ghApi(path, installationToken, options = {}) {
  const resp = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${installationToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": GITHUB_USER_AGENT,
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    const err = new Error(body.message || `GitHub API error (${resp.status})`);
    err.status = resp.status;
    throw err;
  }
  return resp.status === 204 ? null : resp.json();
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Indexing a new vehicle -- GitHub-App-only, no personal-account
// alternative (see ROADMAP.md): a maintainer just did real, substantial
// work that needs to become the org's real public record, and there's no
// meaningful "keep it personal" case for that. The repo is created
// PRIVATE, directly under BlaydeManual, using the App's OWN installation
// token -- the submitting maintainer never gets write access to it. That's
// not just architecturally simpler than the old fork-then-transfer
// design, it closes a real security gap for free: nobody but an org
// approver (via the real org-approval.js flow, which flips it public) can
// ever change this repo's content again. A notarization entry (the
// manifest's sha256) is committed to a separate, App-only-writable public
// log at the same time, so org-approval can later prove the manifest it's
// looking at hasn't been swapped after the fact.
async function handleDirectSubmit(request, env) {
  const login = await requireRealUser(request);
  const body = await parseJson(request);
  const { vehicle_slug: repoName, manifest } = body;
  if (!repoName || !manifest) return json({ error: "missing vehicle_slug or manifest" }, 400);
  if (!/^[a-z0-9][a-z0-9-]{2,90}$/.test(repoName)) {
    return json({ error: "vehicle_slug doesn't match the expected make-model-year shape -- refusing rather than create a repo with an unexpected name." }, 400);
  }
  // A repo named exactly like one of BlaydeManual's own critical repos
  // would be refused by GitHub's own "name already exists" check anyway,
  // but that's relying on a side effect, not stating the actual rule --
  // explicit here, so it stays true even if one of these were ever
  // renamed or the registry/submission-log repos moved.
  if ([REGISTRY_REPO, SUBMISSION_LOG_REPO, "blayde-manual", "vehicle-scaffold"].includes(repoName.toLowerCase())) {
    return json({ error: `"${repoName}" collides with a reserved repo name.` }, 400);
  }

  const installationToken = await getInstallationToken(env);

  let repo;
  try {
    repo = await ghApi(`/orgs/${REGISTRY_OWNER}/repos`, installationToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: repoName,
        description: `${repoName} service manual photos -- submitted by @${login}, pending org review.`,
        private: true,
        auto_init: true,
      }),
    });
  } catch (e) {
    if (e.status === 422) throw new Error(`A repo named "${repoName}" already exists under ${REGISTRY_OWNER} -- if this is a resubmission, the vehicle slug needs to change, or an org approver needs to resolve the existing one first.`);
    throw e;
  }

  const manifestText = JSON.stringify(manifest, null, 2);
  await ghApi(`/repos/${REGISTRY_OWNER}/${repo.name}/contents/manifest.json`, installationToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Add manifest.json", content: utf8ToBase64(manifestText), branch: repo.default_branch }),
  });

  // repo.name (GitHub's own echoed, canonical name), not the raw
  // repoName the client sent -- if GitHub ever normalizes a submitted
  // name differently than what was requested, using the raw value here
  // would notarize under a filename that doesn't match the repo
  // handleApproveVehicle later looks up, wrongly rejecting a real
  // submission as "never notarized."
  const manifestHash = await sha256Hex(manifestText);
  await ghApi(`/repos/${REGISTRY_OWNER}/${SUBMISSION_LOG_REPO}/contents/submissions/${repo.name}.json`, installationToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Notarize ${repo.name}`,
      content: utf8ToBase64(JSON.stringify({ repo_url: repo.html_url, manifest_sha256: manifestHash, github_login: login, timestamp: new Date().toISOString() }, null, 2)),
    }),
  });

  return json({ repoUrl: repo.html_url });
}

// Real, not just app-level: the SAME repo-scope validation review-panel.js/
// my-vehicles.js already apply to the maintainer's own token applies here
// too, and matters MORE here -- the installation token behind this
// endpoint has write access to every BlaydeManual repo, not just the
// ones the calling browser has any business touching. Without this, a
// crafted repo_url could point this endpoint at BlaydeManual/registry or
// BlaydeManual/submission-log itself and get a branch/commit/PR created
// there using the App's own privileged credential. Checked against the
// real, public registry.json -- a repo not found there, approved, is
// refused outright, not just warned about.
async function requireRegisteredRepo(repoUrl) {
  const norm = (u) => (u || "").replace(/\/$/, "").toLowerCase();
  let registryData;
  try {
    const resp = await fetch("https://raw.githubusercontent.com/BlaydeManual/registry/main/registry.json");
    if (!resp.ok) throw new Error(`registry unreachable (${resp.status})`);
    registryData = await resp.json();
  } catch (e) {
    throw new Error(`Could not verify ${repoUrl} against the registry: ${e.message}`);
  }
  const found = (registryData.vehicles || []).some((v) => norm(v.repo_url) === norm(repoUrl) && v.status === "approved");
  if (!found) throw new Error(`${repoUrl} isn't a registered, approved vehicle repo.`);
}

// Photo contribution's "Public" path -- App creates a branch directly on
// the upstream vehicle repo (no fork) and opens the PR immediately. The
// commit's author is set to the real contributor for attribution even
// though the App's own token performed the write.
async function handleDirectContribute(request, env) {
  const login = await requireRealUser(request);
  const body = await parseJson(request);
  const { repo_url: repoUrl, procedure_id: procedureId, section_heading: sectionHeading, photo_data_url: photoDataUrl, photo_filename: photoFilename } = body;
  if (!repoUrl || !procedureId || !photoDataUrl) return json({ error: "missing repo_url, procedure_id, or photo_data_url" }, 400);
  if (!/^[a-z0-9][a-z0-9_-]{0,120}$/i.test(procedureId)) {
    return json({ error: "procedure_id has an unexpected shape -- refusing rather than risk writing outside images/." }, 400);
  }

  // Real content validation, not just a data-URL shape check -- catches
  // accidental garbage (corrupt uploads, near-empty files, absurd
  // dimensions) before it ever lands in a repo, the same way vehicle
  // approval independently re-verifies rather than trusting the
  // client's claim. Checked before touching GitHub at all: no point
  // creating a real branch on the upstream repo for a file that's
  // about to be rejected anyway.
  const dataUrlMatch = photoDataUrl.match(/^data:image\/(?:jpeg|png|webp);base64,(.+)$/);
  if (!dataUrlMatch) return json({ error: "photo_data_url isn't a recognized image data URL." }, 400);
  const content = dataUrlMatch[1];
  const photoValidation = validatePhoto(base64ToBytes(content));
  if (!photoValidation.valid) return json({ error: `Rejected: ${photoValidation.error}` }, 400);

  await requireRegisteredRepo(repoUrl);

  const [owner, repo] = new URL(repoUrl).pathname.replace(/^\//, "").split("/");
  const installationToken = await getInstallationToken(env);

  let defaultBranch = null, upstreamSha = null;
  for (const branch of ["main", "master"]) {
    try {
      const ref = await ghApi(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, installationToken);
      defaultBranch = branch;
      upstreamSha = ref.object.sha;
      break;
    } catch (e) { /* try next */ }
  }
  if (!defaultBranch) throw new Error(`Could not find a main or master branch on ${owner}/${repo}.`);

  const branchName = `contribute/${procedureId}-${Date.now()}`;
  await ghApi(`/repos/${owner}/${repo}/git/refs`, installationToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: upstreamSha }),
  });

  const ext = (photoFilename?.match(/\.(jpe?g|png|webp)$/i)?.[0] || ".jpg").toLowerCase();
  let path = `images/${procedureId}__by_${login}${ext}`;
  for (let altN = 2; ; altN++) {
    try {
      await ghApi(`/repos/${owner}/${repo}/contents/${path}`, installationToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Add photo for ${procedureId}`,
          content,
          branch: branchName,
          author: { name: login, email: `${login}@users.noreply.github.com`, date: new Date().toISOString() },
        }),
      });
      break;
    } catch (e) {
      if (e.status === 422 && altN <= 5) { path = `images/${procedureId}__by_${login}__alt${altN}${ext}`; continue; }
      throw e;
    }
  }

  const pr = await ghApi(`/repos/${owner}/${repo}/pulls`, installationToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // Matches the fork-based (Private) path's own PR title convention
      // -- the raw procedure_id has no reason to be user-facing; it's
      // still in the PR body below for anyone diagnosing on GitHub itself.
      title: `Add photo: ${sectionHeading || procedureId}`,
      head: branchName,
      base: defaultBranch,
      body: [
        `Photo for \`${procedureId}\`${sectionHeading ? ` (${sectionHeading})` : ""}.`,
        ``,
        `Submitted by @${login} via the Contributor Portal's Public path. Both required attestations were checked before this was allowed to submit:`,
        `- This is the contributor's own photo, not sourced from elsewhere.`,
        `- Licensed CC-BY 4.0.`,
      ].join("\n"),
    }),
  });

  return json({ prUrl: pr.html_url });
}

// Approving a submission is a higher trust bar than submitting one --
// "a real signed-in person" (requireRealUser) isn't enough, this needs
// "a real BlaydeManual org admin," checked against GitHub's own
// membership record with the installation token (never the caller's own
// token, which has no way to prove this either way).
async function requireOrgApprover(login, installationToken) {
  const membership = await getOrgMembership(login, installationToken);
  if (!membership || membership.role !== "admin") {
    throw new Error(`@${login} isn't an active admin of ${REGISTRY_OWNER} -- only org admins can approve.`);
  }
}

async function getOrgMembership(login, installationToken) {
  try {
    const membership = await ghApi(`/orgs/${REGISTRY_OWNER}/memberships/${login}`, installationToken);
    return membership.state === "active" ? membership : null;
  } catch (e) {
    // Deliberately NOT treated as "not a member" -- confirmed live that
    // GitHub returns the exact same 404 {"message":"Not Found"} both for
    // a real non-member AND for a caller lacking the "Members" org
    // permission (it doesn't distinguish, to avoid leaking who's a member
    // to an unauthorized caller). Silently mapping this to null previously
    // made a missing App permission indistinguishable from a real
    // non-member. Surfacing it instead means a real non-member now sees
    // this error too (Tier 2 test rows 2.4/2.8 in SECURITY-TESTING.md
    // need to account for that), but that's honest -- "we can't tell" is
    // the true state until the App has the Members permission.
    throw new Error(`Could not verify @${login}'s org membership (${e.status || "?"}: ${e.message}) -- if @${login} IS an active member, confirm the GitHub App has the "Members" organization permission (read).`);
  }
}

// Lists private repos under BlaydeManual that look like pending
// direct-submit vehicle proposals (private, has a manifest.json) -- the
// installation token can see these; an approver's own token generally
// can't, since they're not a collaborator on a repo that was never
// theirs to begin with. Gated on real org membership, not just "any
// signed-in GitHub user" -- without this, literally anyone with a
// GitHub account could enumerate every private BlaydeManual repo that
// happens to contain a manifest.json, including ones never meant to be
// part of the public review queue.
async function handlePendingVehicles(request, env) {
  const login = await requireRealUser(request);
  const installationToken = await getInstallationToken(env);
  if (!(await getOrgMembership(login, installationToken))) {
    throw new Error(`@${login} isn't a member of ${REGISTRY_OWNER} -- only members can view the pending queue.`);
  }
  const repos = await ghApi(`/orgs/${REGISTRY_OWNER}/repos?type=private&per_page=100`, installationToken);
  const pending = [];
  for (const repo of repos) {
    let manifestFile, manifest;
    try {
      manifestFile = await ghApi(`/repos/${REGISTRY_OWNER}/${repo.name}/contents/manifest.json`, installationToken);
      manifest = JSON.parse(base64ToUtf8(manifestFile.content));
    } catch (e) { continue; } // no manifest.json (or unparseable) -- not a pending vehicle proposal, some other private repo
    let submittedBy = null, submittedAt = null;
    try {
      const logFile = await ghApi(`/repos/${REGISTRY_OWNER}/${SUBMISSION_LOG_REPO}/contents/submissions/${repo.name}.json`, installationToken);
      const logEntry = JSON.parse(base64ToUtf8(logFile.content));
      submittedBy = logEntry.github_login;
      submittedAt = logEntry.timestamp;
    } catch (e) { /* no notarization entry -- handleApproveVehicle will reject this one, still worth listing so an approver can see why */ }
    pending.push({ name: repo.name, html_url: repo.html_url, manifest, submitted_by: submittedBy, submitted_at: submittedAt });
  }
  return json({ pending });
}

// The real approval action: independently re-verifies everything (never
// trusts whatever the browser claims about a submission) before doing
// anything privileged, then flips the repo public and adds the
// registry.json entry. See ROADMAP.md's GitHub App migration entry for
// the full reasoning on why each of these three checks exists.
// dryRun runs all three checks (and the org-approver check) without the
// two mutating calls at the end -- lets the UI disable Approve and show
// the exact reason BEFORE anyone clicks it, not just after a failed
// attempt. Both paths run the SAME checks, not a lighter client-side
// approximation of them, so "Approve is enabled" and "Approve actually
// works" can never disagree.
async function handleApproveVehicle(request, env) {
  const login = await requireRealUser(request);
  const body = await parseJson(request);
  const { repo_name: repoName, edition_id: editionId, dry_run: dryRun } = body;
  if (!repoName) return json({ error: "missing repo_name" }, 400);
  // The file-allowlist check below would reject any of BlaydeManual's
  // own real repos anyway (they all have far more than two files) --
  // this states that rule explicitly instead of relying on it as a side
  // effect, so it stays true even if one of these repos were ever
  // reduced to something that could coincidentally pass.
  if ([REGISTRY_REPO, SUBMISSION_LOG_REPO, "blayde-manual", "vehicle-scaffold"].includes(repoName.toLowerCase())) {
    return json({ error: `"${repoName}" is a reserved repo, not a pending vehicle proposal.` }, 400);
  }

  const installationToken = await getInstallationToken(env);
  await requireOrgApprover(login, installationToken);

  // Confirmed live, 2026-08-27: none of the checks below reference
  // whether this repo was already approved, so a second real approval
  // of the same repo would silently push a DUPLICATE entry into
  // registry.json's vehicles array. A direct-submit repo starts private
  // and only this endpoint ever flips it public -- already-public means
  // already approved (or approved outside this flow entirely), either
  // way not a pending proposal anymore.
  const repoInfo = await ghApi(`/repos/${REGISTRY_OWNER}/${repoName}`, installationToken);
  if (!repoInfo.private) {
    throw new Error(`Rejected: "${repoName}" is already public -- it's already been approved, not a pending proposal.`);
  }

  // 1. Negative file-allowlist: exactly {README.md, manifest.json}, one branch.
  const contents = await ghApi(`/repos/${REGISTRY_OWNER}/${repoName}/contents/`, installationToken);
  const filenames = contents.map((f) => f.name).sort();
  const expected = ["README.md", "manifest.json"];
  if (filenames.length !== expected.length || !filenames.every((f, i) => f === expected[i])) {
    throw new Error(`Rejected: expected exactly {README.md, manifest.json}, found {${filenames.join(", ")}}.`);
  }
  const branches = await ghApi(`/repos/${REGISTRY_OWNER}/${repoName}/branches`, installationToken);
  if (branches.length !== 1) {
    throw new Error(`Rejected: expected exactly one branch, found ${branches.length}.`);
  }

  // 2. Notarization: the manifest's current hash must match what was
  // logged at submission time -- a mismatch means it was edited after
  // submitting (or never really went through /direct-submit at all).
  const manifestFile = await ghApi(`/repos/${REGISTRY_OWNER}/${repoName}/contents/manifest.json`, installationToken);
  const manifestText = base64ToUtf8(manifestFile.content);
  const currentHash = await sha256Hex(manifestText);
  let logEntry;
  try {
    const logFile = await ghApi(`/repos/${REGISTRY_OWNER}/${SUBMISSION_LOG_REPO}/contents/submissions/${repoName}.json`, installationToken);
    logEntry = JSON.parse(base64ToUtf8(logFile.content));
  } catch (e) {
    throw new Error(`Rejected: no notarization entry found for ${repoName} -- this wasn't submitted through the real site, or the log entry is missing.`);
  }
  if (logEntry.manifest_sha256 !== currentHash) {
    throw new Error(`Rejected: manifest hash doesn't match the notarized submission -- it was edited after submitting.`);
  }

  // 3. Manifest schema: has to look like a real manifest, not garbage.
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (e) {
    throw new Error(`Rejected: manifest.json isn't valid JSON.`);
  }
  if (!Array.isArray(manifest.entries) || typeof manifest.page_geometry !== "object" || !manifest.vehicle) {
    throw new Error(`Rejected: manifest.json doesn't have the expected shape (entries[], page_geometry, vehicle).`);
  }

  if (dryRun) return json({ checked: true });

  // All three passed -- flip public, add the registry entry.
  await ghApi(`/repos/${REGISTRY_OWNER}/${repoName}`, installationToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ private: false }),
  });

  // Grant the original submitter real, explicit maintainer access to
  // their own now-public repo -- deliberately at APPROVAL time, never
  // at submit time, since granting it earlier would undo the entire
  // point of the locked-repo design (the submitter can't touch the
  // manifest between submitting and this exact check passing). This is
  // also deliberately the ONLY way anyone becomes a maintainer here --
  // an org admin approving a vehicle does NOT become its maintainer
  // just by approving it, and org membership/ownership never implies
  // repo access on its own (see SECURITY.md's "maintaining a vehicle
  // repo is a separate designation from org membership"). Best-effort:
  // a failure here shouldn't undo an otherwise-valid approval, since
  // `logEntry.github_login` is always a real, already-verified GitHub
  // identity from submit time, not user input that could be malformed.
  try {
    await ghApi(`/repos/${REGISTRY_OWNER}/${repoName}/collaborators/${logEntry.github_login}`, installationToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission: "push" }),
    });
  } catch (e) { /* approval itself already succeeded; a maintainer can always be added manually via My Vehicles */ }

  // Real dual-approval on photo contributions, enforced by GitHub itself
  // (branch protection), not app logic -- a maintainer with real push
  // access can always merge directly via git/GitHub, bypassing anything
  // review-panel.js alone would check, so app-level "requires 2 reviews"
  // would be exactly as bypassable as no check at all. This is the only
  // version that can't be. enforce_admins stays false, matching the
  // same deliberate org-wide escape-hatch decision already made for the
  // main tooling repos. Real operational consequence, not hidden: a
  // vehicle with only ONE real maintainer (every vehicle, right after
  // this exact approval, since the auto-grant above just created its
  // first) cannot merge ANY photo PR until a second real maintainer is
  // added -- by design, since one person approving their own photo
  // isn't dual anything. Best-effort like the grant above; failure here
  // doesn't undo the approval, but is worth actually checking, not just
  // assuming succeeded.
  let branchProtectionApplied = false;
  try {
    await ghApi(`/repos/${REGISTRY_OWNER}/${repoName}/branches/${repoInfo.default_branch}/protection`, installationToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        required_status_checks: null,
        enforce_admins: false,
        required_pull_request_reviews: { required_approving_review_count: 2 },
        restrictions: null,
      }),
    });
    branchProtectionApplied = true;
  } catch (e) { /* approval itself already succeeded; surfaced in the response either way, not silently swallowed */ }

  const registryFile = await ghApi(`/repos/${REGISTRY_OWNER}/${REGISTRY_REPO}/contents/registry.json`, installationToken);
  const registryData = JSON.parse(base64ToUtf8(registryFile.content));
  registryData.vehicles = registryData.vehicles || [];
  registryData.vehicles.push({
    vehicle_slug: manifest.vehicle,
    edition_id: editionId || manifest.edition_id,
    vehicle_display_name: manifest.vehicle,
    vehicle_class: manifest.vehicle_class || null,
    repo_url: `https://github.com/${REGISTRY_OWNER}/${repoName}`,
    // manifest.source_pdf_sha256, not logEntry.manifest_sha256 -- real,
    // live bug found and fixed here: this previously stored the
    // MANIFEST's own hash (used for notarization/tamper-detection),
    // which is a completely different value from the actual source
    // PDF's hash the main page's Choose File fingerprint check compares
    // against. The two were guaranteed to never match, for any vehicle.
    // Falls back to null for a manifest submitted before indexer-ui.js
    // started setting this field (nothing to recover after the fact --
    // the original PDF's real hash isn't derivable from anything else
    // on hand at approval time).
    source_pdf_sha256: manifest.source_pdf_sha256 || null,
    status: "approved",
  });
  await ghApi(`/repos/${REGISTRY_OWNER}/${REGISTRY_REPO}/contents/registry.json`, installationToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Approve ${manifest.vehicle} (${editionId || manifest.edition_id})`,
      content: utf8ToBase64(JSON.stringify(registryData, null, 2)),
      sha: registryFile.sha,
    }),
  });

  return json({ approved: true, repoUrl: `https://github.com/${REGISTRY_OWNER}/${repoName}`, branchProtectionApplied });
}

// Lets a real vehicle maintainer manage their own repo's collaborators
// without ever holding real GitHub repo Admin themselves -- GitHub only
// allows collaborator management at the Admin role (confirmed against
// GitHub's own repository-roles docs; Maintain, one level down, does
// NOT include it), and Admin also carries real, unrelated blast radius
// this app doesn't want to hand out just to let someone invite a
// contributor: deleting the repo, transferring it out of the org,
// flipping it back private, renaming it (which would silently break
// registry.json's repo_url pointer -- nothing re-syncs that
// automatically). Routing through the installation token instead keeps
// every maintainer at `push`, the same "zero trust, bare minimum for
// the app's own functions" floor as the automatic grant on approval.
async function handleManageCollaborator(request, env) {
  const login = await requireRealUser(request);
  const body = await parseJson(request);
  const { repo_url: repoUrl, handle, action, invitation_id: invitationId } = body;
  if (!repoUrl || !action) return json({ error: "missing repo_url or action" }, 400);
  if (!["invite", "remove", "cancel_invitation"].includes(action)) {
    return json({ error: `unknown action "${action}"` }, 400);
  }
  if ((action === "invite" || action === "remove") && !handle) return json({ error: "missing handle" }, 400);
  if (action === "cancel_invitation" && !invitationId) return json({ error: "missing invitation_id" }, 400);

  await requireRegisteredRepo(repoUrl);
  const [owner, repo] = new URL(repoUrl).pathname.replace(/^\//, "").split("/");
  const installationToken = await getInstallationToken(env);

  // Never trust the browser's own claim about its permission on this
  // repo -- re-checked here, independently, with the installation
  // token, the same "server re-verifies, never trusts the client"
  // principle as every other privileged action in this Worker.
  let callerPermission;
  try {
    const permData = await ghApi(`/repos/${owner}/${repo}/collaborators/${login}/permission`, installationToken);
    callerPermission = permData.permission;
  } catch (e) {
    throw new Error(`@${login} isn't a collaborator on ${repoUrl}.`);
  }
  if (!["admin", "maintain", "write"].includes(callerPermission)) {
    throw new Error(`@${login} needs push access or better on ${repoUrl} to manage its collaborators (has: ${callerPermission}).`);
  }

  if (action === "invite") {
    // Always "push", never anything higher -- a maintainer inviting
    // someone else grants exactly what this app's own functions need,
    // the same floor as the automatic grant on approval, never an
    // escalation path to Admin.
    await ghApi(`/repos/${owner}/${repo}/collaborators/${handle}`, installationToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission: "push" }),
    });
    return json({ invited: true });
  }
  if (action === "remove") {
    await ghApi(`/repos/${owner}/${repo}/collaborators/${handle}`, installationToken, { method: "DELETE" });
    return json({ removed: true });
  }
  // cancel_invitation
  await ghApi(`/repos/${owner}/${repo}/invitations/${invitationId}`, installationToken, { method: "DELETE" });
  return json({ cancelled: true });
}

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function base64ToBytes(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---- real, dependency-free image validation for /direct-contribute --
// magic bytes + real header-parsed dimensions, no full pixel decode
// needed. Verified against real generated JPEG/PNG/WEBP fixtures
// (flat-color and photo-like-noise, to confirm compression-size
// variance doesn't cause false rejections) before shipping. ----
const PHOTO_MIN_DIMENSION = 200; // below this, not a real "photo of the machine"
const PHOTO_MAX_DIMENSION = 8000; // above this, almost certainly not a real camera photo
const PHOTO_MAX_BYTES = 20 * 1024 * 1024; // generous, but bounds storage abuse
// Deliberately no minimum byte size -- confirmed live against a real,
// validly-encoded 800x600 WEBP that compressed to under 1KB: byte size
// varies too much by content/format to be a reliable "too small" signal
// on its own. Dimension checking below is the real floor.

function detectImageFormat(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  return null;
}

function readUint32BE(bytes, offset) {
  return (bytes[offset] << 24 | bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]) >>> 0;
}
function readUint16BE(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}
function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

// PNG: fixed-offset IHDR chunk -- signature(8) + length(4) + "IHDR"(4) + width(4) + height(4).
function pngDimensions(bytes) {
  if (bytes.length < 24) return null;
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
}

// JPEG: scan markers for a Start-Of-Frame segment (0xC0-0xCF, excluding
// 0xC4 DHT / 0xC8 JPG / 0xCC DAC, which aren't real SOF markers).
function jpegDimensions(bytes) {
  let offset = 2; // skip the initial FFD8
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    if (marker === 0xd9) break; // EOI, no SOF found
    const segmentLength = readUint16BE(bytes, offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: readUint16BE(bytes, offset + 5), width: readUint16BE(bytes, offset + 7) };
    offset += 2 + segmentLength;
  }
  return null;
}

// WEBP: three sub-formats inside the RIFF container, each encodes
// dimensions differently.
function webpDimensions(bytes) {
  const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (fourcc === "VP8X") {
    // 24-bit width-1 / height-1, little-endian, at a fixed offset within the chunk.
    return {
      width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
      height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
    };
  }
  if (fourcc === "VP8 ") {
    // Lossy: 3-byte frame tag, 3-byte start code (9d 01 2a), then two
    // 16-bit little-endian fields -- lower 14 bits are the dimension.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return { width: readUint16LE(bytes, 26) & 0x3fff, height: readUint16LE(bytes, 28) & 0x3fff };
  }
  if (fourcc === "VP8L") {
    // Lossless: 1-byte signature (0x2F), then a 32-bit little-endian field
    // packing 14-bit width-1 and 14-bit height-1.
    if (bytes[20] !== 0x2f) return null;
    const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
    return { width: (((b1 & 0x3f) << 8) | b0) + 1, height: (((b3 & 0x0f) << 10) | (b2 << 2) | (b1 >> 6)) + 1 };
  }
  return null;
}

// Returns { valid: true, format, width, height } or { valid: false, error }.
function validatePhoto(bytes) {
  if (bytes.length > PHOTO_MAX_BYTES) return { valid: false, error: `file is ${(bytes.length / 1024 / 1024).toFixed(1)}MB -- larger than allowed` };

  const format = detectImageFormat(bytes);
  if (!format) return { valid: false, error: "not a real JPEG, PNG, or WEBP file (magic bytes don't match)" };

  let dims;
  try {
    dims = format === "png" ? pngDimensions(bytes) : format === "jpeg" ? jpegDimensions(bytes) : webpDimensions(bytes);
  } catch (e) {
    return { valid: false, error: `couldn't read ${format} dimensions: ${e.message}` };
  }
  if (!dims || !dims.width || !dims.height) return { valid: false, error: `couldn't determine ${format} image dimensions -- file may be corrupt` };
  if (dims.width < PHOTO_MIN_DIMENSION || dims.height < PHOTO_MIN_DIMENSION) {
    return { valid: false, error: `image is only ${dims.width}x${dims.height} -- too small to be a useful photo` };
  }
  if (dims.width > PHOTO_MAX_DIMENSION || dims.height > PHOTO_MAX_DIMENSION) {
    return { valid: false, error: `image is ${dims.width}x${dims.height} -- larger than allowed` };
  }
  return { valid: true, format, width: dims.width, height: dims.height };
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("invalid JSON body");
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// Blayde Manual -- shared real GitHub sign-in. Popup + postMessage, not
// a full-page redirect, so a page mid-draft (e.g. contribute.js's
// selected photo, which can't survive a navigation since it's an
// in-memory File/canvas, not something serializable to storage) never
// gets torn down by leaving the page and coming back.
//
// One real GitHub sign-in for everyone, everywhere: the GitHub App
// user-to-server session below covers browsing, reviewing, approving,
// maintaining, and "Public" submit -- every privileged action already
// runs through App-installed repos, so one App session is enough for
// all of it. The classic OAuth App still exists, but scoped down to
// exactly one rare, contextual case: the Contributor Portal's "Private"
// submit path, which forks the vehicle repo into the CONTRIBUTOR's own
// account -- something an App token can't do (the App isn't installed
// on a fork that doesn't exist yet). That path prompts for its own
// sign-in only at the moment someone actually picks Private, never
// upfront -- see contribute.js's submitPhotoPrivate/openPrFromFork.
//
// Session lives in localStorage, not sessionStorage: it needs to
// survive opening a new tab (a GitHub notification email always links
// into a new tab) and closing/reopening the browser, not just reloading
// the current tab. Never sent anywhere except back to GitHub's own API
// and this project's own auth Worker. See SECURITY.md.

const GITHUB_CLIENT_ID = "Ov23lijpNHggDgWfwxWa"; // classic OAuth App -- Private-submit path only, see above
const GITHUB_APP_CLIENT_ID = "Iv23liGTA0ruM1Phtz8k"; // GitHub App -- everything else
const REDIRECT_URI = "https://blaydemanual.com/auth/callback.html";
const AUTH_WORKER_URL = "https://auth.blaydemanual.com/";
const SESSION_KEY = "blayde_session_v2";
const PRIVATE_SESSION_KEY = "blayde_private_session_v2";
const STATE_KEY = "blayde_oauth_state_v1";
const HANDOFF_KEY = "blayde_auth_handoff_v1";
// How long before expiry to refresh proactively -- big enough that a
// privileged action started right before expiry still gets a fresh
// token first, small enough not to refresh needlessly on every load.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

// Kept as an alias, not a second session -- every existing caller
// (org-approval.js, indexer-review.js, contribute.js's Public path)
// already gates on "is the App session live," which is just "is the
// person signed in at all" now that there's only one everyday session.
function getAppSession() {
  return getSession();
}

function getPrivateSession() {
  const raw = localStorage.getItem(PRIVATE_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setPrivateSession(session) {
  localStorage.setItem(PRIVATE_SESSION_KEY, JSON.stringify(session));
}

// Signs out of both -- a page-level "Logout" is one clearly understood
// action. The rare Private-fork session is cleared too, since leaving
// it behind under a possibly-different next signed-in identity would be
// a stale-credential surprise, not a convenience.
function signOut() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PRIVATE_SESSION_KEY);
}

// Shows "@username Logout" in a page's #authStatus element when signed
// in, and the single shared #authSignInBtn (see the wiring at the
// bottom of this file) when signed out -- one implementation every
// page calls rather than each building its own version, so there is
// exactly one sign-in control anywhere on the site. onLoggedOut is
// optional -- most pages just want to reflect signed-out state, but a
// page mid-flow (e.g. the maintainer portal) may need to actually reset
// its own UI, not just hide this element. Remembered across calls
// (lastOnLoggedOut) so the shared sign-in button below can re-render
// after a fresh sign-in without needing to know each page's own reset
// logic -- it just calls renderAuthStatus() with no argument and this
// keeps using whatever the page originally registered.
let lastOnLoggedOut = null;
function renderAuthStatus(onLoggedOut) {
  if (onLoggedOut !== undefined) lastOnLoggedOut = onLoggedOut;
  const session = getSession();
  const signInBtn = document.getElementById("authSignInBtn");
  if (signInBtn) signInBtn.style.display = session ? "none" : "inline-flex";
  const el = document.getElementById("authStatus");
  if (!el) return;
  if (!session) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  el.style.display = "inline-flex";
  el.innerHTML = `<span class="auth-username">@${session.username}</span> <a href="#" id="authLogoutLink">Logout</a>`;
  document.getElementById("authLogoutLink").addEventListener("click", (e) => {
    e.preventDefault();
    signOut();
    renderAuthStatus();
    lastOnLoggedOut?.();
  });
}

// Checks the unified session's expiry and silently trades a stale
// access token for a fresh one via the Worker's refresh endpoint,
// entirely in the background -- no popup, no user action. A session
// with no expiresAt at all (the App's "expire user authorization
// tokens" setting off, or the rare Private/classic session, which
// never expires this way) is left untouched: nothing to refresh.
// Meant to be called once per page load, right after reading the
// existing session, before anything renders gated-on-signed-in UI.
async function ensureFreshSession() {
  const session = getSession();
  if (!session?.expiresAt || !session.refreshToken) return session;
  if (Date.now() < session.expiresAt - REFRESH_SKEW_MS) return session;
  try {
    const resp = await fetch(`${AUTH_WORKER_URL}app-token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error || "refresh failed");
    const refreshed = { ...session, ...tokenExpiryFields(data) };
    setSession(refreshed);
    return refreshed;
  } catch (e) {
    // The refresh token itself is what's actually expired/revoked here
    // (~6 months unused, or the person revoked the App's access) --
    // the stale access token would just fail the next real request
    // anyway, so drop the session now and let the page's normal
    // signed-out UI take over, rather than surfacing a confusing
    // "signed in" state that's about to fail on first use.
    signOut();
    return null;
  }
}

// Turns GitHub's token-exchange/refresh response into absolute
// timestamps this file can compare against Date.now() later --
// GitHub returns durations (expires_in, seconds), not deadlines.
// Undefined durations (classic OAuth, or the App with token expiry
// still off) fall through as undefined fields, which ensureFreshSession
// and startSignIn both already treat as "never expires."
function tokenExpiryFields(data) {
  return {
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    refreshExpiresAt: data.refresh_token_expires_in ? Date.now() + data.refresh_token_expires_in * 1000 : undefined,
  };
}

// Opens the GitHub authorize popup, resolves {username, token} once the
// callback page reports back. Rejects on a blocked popup, an early
// close, or an error GitHub/the callback reports.
//
// The handoff from the popup runs on localStorage + the "storage" event,
// not postMessage/window.opener. A popup that navigates through a
// different origin (github.com) and back can come home with
// window.opener already severed -- some browsers drop it on that hop --
// which would leave the popup showing "signed in" while this window
// never hears about it. localStorage writes fire a "storage" event on
// every OTHER same-origin window watching it (never the one that wrote
// it), so it doesn't depend on that reference surviving at all.
// postMessage is kept as a secondary path in case a browser partitions
// storage between the popup and this window.
function signInWithGitHubApp() {
  return startSignIn({ clientId: GITHUB_APP_CLIENT_ID, scope: null, authType: "githubapp" });
}

// Classic OAuth sign-in -- deliberately NOT the default anymore. Only
// contribute.js's Private submit path calls this, and only at the
// moment someone actually picks Private, since that's the one real
// action here (forking into your own account) that needs a broader,
// separate grant from everything else. See the file-top comment.
function signInWithGitHubPrivate() {
  return startSignIn({ clientId: GITHUB_CLIENT_ID, scope: "public_repo", authType: "oauth" });
}

function startSignIn({ clientId, scope, authType }) {
  return new Promise((resolve, reject) => {
    const state = `${authType}:${crypto.randomUUID()}`;
    sessionStorage.setItem(STATE_KEY, state);
    localStorage.removeItem(HANDOFF_KEY); // clear any stale attempt

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    if (scope) authorizeUrl.searchParams.set("scope", scope);
    authorizeUrl.searchParams.set("state", state);

    const popup = window.open(authorizeUrl.toString(), "blayde-github-signin", "width=600,height=700");
    if (!popup) {
      reject(new Error("Popup blocked -- allow popups for this site and try again."));
      return;
    }

    let settled = false;

    function handleHandoff(payload) {
      if (!payload || payload.state !== state) return; // not ours, or stale
      localStorage.removeItem(HANDOFF_KEY);
      if (payload.error) {
        finish(null, new Error(payload.error));
        return;
      }
      const session = { username: payload.username, token: payload.token, authType: payload.authType, ...tokenExpiryFields(payload) };
      if (payload.authType === "githubapp") setSession(session); else setPrivateSession(session);
      finish(session, null);
    }

    function onStorage(event) {
      if (event.key !== HANDOFF_KEY || !event.newValue) return;
      handleHandoff(JSON.parse(event.newValue));
    }
    window.addEventListener("storage", onStorage);

    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.source !== "blayde-auth-callback") return;
      handleHandoff(event.data);
    }
    window.addEventListener("message", onMessage);

    // Some browser/embedded-webview combinations don't fire "storage"
    // reliably even though the write itself lands -- polling is the
    // fallback for those, cheap enough at this interval either way.
    const pollTimer = setInterval(() => {
      const raw = localStorage.getItem(HANDOFF_KEY);
      if (raw) handleHandoff(JSON.parse(raw));
    }, 400);

    const closeCheck = setInterval(() => {
      if (settled) return;
      if (popup.closed && !localStorage.getItem(HANDOFF_KEY)) {
        finish(null, new Error("Sign-in window closed before completing."));
      }
    }, 500);

    function finish(session, err) {
      if (settled) return;
      settled = true;
      clearInterval(closeCheck);
      clearInterval(pollTimer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
      try { if (!popup.closed) popup.close(); } catch (e) { /* cross-origin, ignore */ }
      if (err) reject(err); else resolve(session);
    }
  });
}

window.BlaydeAuth = {
  signInWithGitHubApp, signInWithGitHubPrivate, signOut,
  getSession, getAppSession, getPrivateSession, ensureFreshSession,
  renderAuthStatus, AUTH_WORKER_URL, STATE_KEY,
};

// The one shared sign-in control every portal page's top-nav carries
// (#authSignInBtn, next to #authStatus) -- wired here, once, instead of
// each page repeating its own "Sign in with GitHub" button and click
// handler. A page that needs to react to a fresh sign-in (load its own
// data, switch its own UI) listens for "blayde:signedin" rather than
// auth.js needing to know what that reaction is; "blayde:signinerror"
// carries the Error on a failed/cancelled attempt. auth.js loads before
// every page's own script (see contribute.html/maintainer.html's
// <script> order), so #authSignInBtn already exists in the DOM by the
// time this runs.
document.getElementById("authSignInBtn")?.addEventListener("click", async function () {
  this.disabled = true;
  try {
    const session = await signInWithGitHubApp();
    renderAuthStatus();
    window.dispatchEvent(new CustomEvent("blayde:signedin", { detail: session }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent("blayde:signinerror", { detail: err }));
  } finally {
    this.disabled = false;
  }
});

// Best-effort proactive refresh right at page load -- fire-and-forget,
// not awaited, since a classic <script> can't top-level-await and every
// page's own script (which reads getSession() synchronously) is about
// to run immediately after this one. Worst case on a truly-expired
// token, a privileged call in the next few seconds 401s before this
// finishes and updates storage; every real write already goes through
// the Worker, which independently re-verifies the token itself, so
// nothing unsafe happens either way -- this is purely about not making
// someone see a stale "signed in" state that's about to fail.
ensureFreshSession();

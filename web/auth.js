// Blayde Manual -- shared real GitHub sign-in. Popup + postMessage, not
// a full-page redirect, so a page mid-draft (e.g. contribute.js's
// selected photo, which can't survive a navigation since it's an
// in-memory File/canvas, not something serializable to sessionStorage)
// never gets torn down by leaving the page and coming back.
//
// Session lives in sessionStorage only: cleared when the tab closes,
// never sent anywhere except back to GitHub's own API and this
// project's own auth Worker. See SECURITY.md.

const GITHUB_CLIENT_ID = "Ov23lijpNHggDgWfwxWa";
// GitHub App client ID -- provisioned separately from the classic OAuth
// App above. Both logins exist side by side deliberately (see
// ROADMAP.md's GitHub App migration entry): this one is for "submit
// directly" / the Public contribute path, where the App's own
// installation credential (never this token) does the actual write, so
// the submitter never retains write access to what they just submitted.
const GITHUB_APP_CLIENT_ID = "REPLACE_WITH_REAL_GITHUB_APP_CLIENT_ID";
const REDIRECT_URI = "https://blaydemanual.com/auth/callback.html";
const AUTH_WORKER_URL = "https://auth.blaydemanual.com/";
// Two SEPARATE storage keys, not one shared slot with an authType field --
// a maintainer plausibly needs both sessions live at once in the same
// portal visit (classic OAuth to browse/review/approve, the App session
// only for the moment they hit "submit directly"). A single shared slot
// would mean signing in via the App silently clobbers the OAuth session
// everything else on the page depends on, logging the maintainer out of
// their own review queue mid-task. getSession()/setSession() keep their
// original names and behavior for the classic path, since every existing
// real caller (review-panel.js, my-vehicles.js, the future org-approval.js)
// already expects that shape untouched.
const SESSION_KEY = "blayde_session_v1";
const APP_SESSION_KEY = "blayde_app_session_v1";
const STATE_KEY = "blayde_oauth_state_v1";
const HANDOFF_KEY = "blayde_auth_handoff_v1";

function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function getAppSession() {
  const raw = sessionStorage.getItem(APP_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setAppSession(session) {
  sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(session));
}

// Signs out of BOTH sessions -- a page-level "Logout" is one clearly
// understood action, not two separate controls a person has to remember
// to use. Anything that specifically needs to drop just the App session
// (e.g. after a submit, if that's ever desired) can call
// sessionStorage.removeItem directly rather than going through here.
function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(APP_SESSION_KEY);
}

// Shows "@username Logout" in a page's #authStatus element when
// signed in, hides it otherwise -- one implementation both contribute.js
// and maintainer-portal.js call, rather than each page building its own
// version. onLoggedOut is optional -- most pages just want to reflect
// signed-out state, but a page mid-flow (e.g. the maintainer portal)
// may need to actually reset its own UI, not just hide this element.
function renderAuthStatus(onLoggedOut) {
  const el = document.getElementById("authStatus");
  if (!el) return;
  const session = getSession();
  const appSession = getAppSession();
  if (!session && !appSession) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  el.style.display = "inline-flex";
  // Either or both can be active at once (see the two-session-slot note
  // above) -- shown as one identity with an extra note when the App
  // session is ALSO signed in, since that's the less-common addition that
  // changes what "submit directly" actually does.
  const primary = session || appSession;
  const appNote = appSession && session ? ` <span class="auth-mode">(direct submit ready)</span>` : appSession && !session ? ` <span class="auth-mode">(direct submit)</span>` : "";
  el.innerHTML = `<span class="auth-username">@${primary.username}</span>${appNote} <a href="#" id="authLogoutLink">Logout</a>`;
  document.getElementById("authLogoutLink").addEventListener("click", (e) => {
    e.preventDefault();
    signOut();
    renderAuthStatus(onLoggedOut);
    onLoggedOut?.();
  });
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
function signInWithGitHub() {
  return startSignIn({ clientId: GITHUB_CLIENT_ID, scope: "public_repo", authType: "oauth" });
}

// GitHub App user-to-server sign-in -- no `scope` param (a GitHub App's
// permissions are fixed at installation, not requested per sign-in).
// Same popup/handoff mechanism as the classic flow; callback.html reads
// the "app:" prefix this puts on `state` to know which Worker endpoint
// to exchange the code against and which authType to tag the session
// with -- state is the only value GitHub round-trips unmodified, so it
// carries that choice through the whole redirect dance.
function signInWithGitHubApp() {
  return startSignIn({ clientId: GITHUB_APP_CLIENT_ID, scope: null, authType: "githubapp" });
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
      const session = { username: payload.username, token: payload.token, authType: payload.authType };
      if (payload.authType === "githubapp") setAppSession(session); else setSession(session);
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

window.BlaydeAuth = { signInWithGitHub, signInWithGitHubApp, signOut, getSession, getAppSession, renderAuthStatus, AUTH_WORKER_URL, STATE_KEY };

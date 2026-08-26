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
const REDIRECT_URI = "https://blaydemanual.com/auth/callback.html";
const AUTH_WORKER_URL = "https://auth.blaydemanual.com/";
const SESSION_KEY = "blayde_session_v1";
const STATE_KEY = "blayde_oauth_state_v1";
const HANDOFF_KEY = "blayde_auth_handoff_v1";

function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
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
  return new Promise((resolve, reject) => {
    const state = crypto.randomUUID();
    sessionStorage.setItem(STATE_KEY, state);
    localStorage.removeItem(HANDOFF_KEY); // clear any stale attempt

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authorizeUrl.searchParams.set("scope", "public_repo");
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
      const session = { username: payload.username, token: payload.token };
      setSession(session);
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

window.BlaydeAuth = { signInWithGitHub, signOut, getSession, AUTH_WORKER_URL, STATE_KEY };

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
// callback page posts it back. Rejects on a blocked popup, an early
// close, or an error GitHub/the callback reports.
function signInWithGitHub() {
  return new Promise((resolve, reject) => {
    const state = crypto.randomUUID();
    sessionStorage.setItem(STATE_KEY, state);

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

    const closeCheck = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Sign-in window closed before completing."));
      }
    }, 500);

    function cleanup() {
      clearInterval(closeCheck);
      window.removeEventListener("message", onMessage);
    }

    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.source !== "blayde-auth-callback") return;
      cleanup();
      popup.close();
      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }
      const session = { username: event.data.username, token: event.data.token };
      setSession(session);
      resolve(session);
    }
    window.addEventListener("message", onMessage);
  });
}

window.BlaydeAuth = { signInWithGitHub, signOut, getSession, AUTH_WORKER_URL, STATE_KEY };

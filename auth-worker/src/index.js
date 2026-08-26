// Blayde Manual -- auth token-exchange Worker. Does exactly one job:
// trade a GitHub OAuth `code` for an access token using the client
// secret, which lives only in this Worker's secret bindings and never
// enters the browser, the repo, or any other part of this project.
// See SECURITY.md for why this is the one piece of real server-side
// infrastructure the whole system needs.

const GITHUB_CLIENT_ID = "Ov23lijpNHggDgWfwxWa"; // public, not sensitive
const ALLOWED_ORIGIN = "https://blaydemanual.com";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    const code = body.code;
    if (!code || typeof code !== "string") {
      return json({ error: "missing code" }, 400);
    }

    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenResp.ok) {
      return json({ error: "GitHub token exchange failed" }, 502);
    }

    const tokenData = await tokenResp.json();
    if (tokenData.error) {
      return json({ error: tokenData.error_description || tokenData.error }, 400);
    }

    return json({ access_token: tokenData.access_token });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

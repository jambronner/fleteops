function jsonForInlineScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildSupabaseImplicitCallbackBridgeHtml(nextPath: string) {
  const sessionPayload = jsonForInlineScript({ next: nextPath });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Finishing sign in</title>
  </head>
  <body>
    <p>Finishing sign in...</p>
    <script>
      (async function finishSupabaseSignIn() {
        const payload = ${sessionPayload};
        const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        window.history.replaceState(null, "", window.location.pathname + window.location.search);

        if (!accessToken || !refreshToken) {
          window.location.replace("/login?error=invalid");
          return;
        }

        try {
          const response = await fetch("/api/auth/supabase/session", {
            body: JSON.stringify({ ...payload, accessToken, refreshToken }),
            cache: "no-store",
            headers: { "content-type": "application/json" },
            method: "POST"
          });
          const completion = await response.json().catch(function () { return {}; });

          window.location.replace(completion.redirectTo || "/login?error=invalid");
        } catch {
          window.location.replace("/login?error=invalid");
        }
      })();
    </script>
  </body>
</html>`;
}

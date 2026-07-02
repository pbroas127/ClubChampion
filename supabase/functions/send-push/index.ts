// ============================================================================
// CLUB CHAMPION  send-push
// ----------------------------------------------------------------------------
// Called by public.notify_push() (schema-shop.sql, via pg_net) whenever a
// game invite lands, a daily "still Bronze" nudge fires, or a new shop drop
// is announced. Looks up the target user's registered iOS device token(s)
// and delivers a real APNs push - no third-party push service needed, just
// your own Apple Developer APNs Auth Key.
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt
//   (--no-verify-jwt: called by Postgres via pg_net with our own shared
//   secret, not a Supabase user JWT)
//
// One-time Apple setup (do this from your Mac, in the Apple Developer portal):
//   Certificates, IDs & Profiles -> Keys -> + -> enable "Apple Push
//   Notifications service (APNs)" -> download the .p8 file (you only get ONE
//   download, save it) -> note its Key ID and your Team ID (top-right of the
//   portal).
//
// Env vars (supabase secrets set ...):
//   APNS_KEY_ID       - the 10-char Key ID for the .p8 you downloaded
//   APNS_TEAM_ID       - your Apple Developer Team ID
//   APNS_BUNDLE_ID     - com.clubchampion.app (must match capacitor.config.json's appId)
//   APNS_PRIVATE_KEY   - full contents of the .p8 file, including the
//                        -----BEGIN/END PRIVATE KEY----- lines
//   APNS_ENV           - "production" for TestFlight/App Store builds,
//                        "sandbox" for a local Xcode debug build
//   SEND_PUSH_SECRET   - a random string; must match what you set for
//                        app.settings.send_push_secret in Postgres (see the
//                        one-time setup comment above notify_push() in
//                        schema-shop.sql)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - auto-injected
// ============================================================================
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { create as createJwt } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const SEND_PUSH_SECRET = Deno.env.get("SEND_PUSH_SECRET") ?? "";
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.clubchampion.app";
const APNS_HOST = Deno.env.get("APNS_ENV") === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// APNs auth tokens are valid up to an hour - cache across invocations within
// the same warm isolate instead of re-signing on every single push.
let cachedToken: { jwt: string; exp: number } | null = null;

function pemToCryptoKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function apnsToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedToken.exp - 300) return cachedToken.jwt;
  const key = await pemToCryptoKey(Deno.env.get("APNS_PRIVATE_KEY") ?? "");
  const jwt = await createJwt(
    { alg: "ES256", kid: APNS_KEY_ID, typ: undefined },
    { iss: APNS_TEAM_ID, iat: now },
    key
  );
  cachedToken = { jwt, exp: now + 3000 };
  return jwt;
}

async function sendOne(token: string, title: string, body: string, data: Record<string, unknown>) {
  const jwt = await apnsToken();
  const payload = { aps: { alert: { title, body }, sound: "default" }, ...data };
  const res = await fetch(`https://${APNS_HOST}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("APNs send failed:", res.status, text, "token:", token.slice(0, 8) + "…");
    // 410 Gone / BadDeviceToken - the token is dead (app uninstalled, etc.);
    // clean it up so future sends don't keep hitting it.
    if (res.status === 410 || text.includes("BadDeviceToken")) {
      await admin.from("device_tokens").delete().eq("token", token);
    }
  }
}

serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!SEND_PUSH_SECRET || auth !== `Bearer ${SEND_PUSH_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const { user_id, type, title, body, data } = await req.json();
    if (!user_id || !title) return new Response("Bad request", { status: 400 });

    const { data: tokens, error } = await admin
      .from("device_tokens")
      .select("token, platform")
      .eq("user_id", user_id)
      .eq("platform", "ios"); // Android would go through FCM instead - not wired up (no Android build yet)
    if (error) throw error;
    if (!tokens || !tokens.length) return new Response("ok (no device)", { status: 200 });

    await Promise.all(tokens.map((t) => sendOne(t.token, title, body || "", { type, ...(data || {}) })));
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("send-push error:", err);
    return new Response("Internal error", { status: 500 });
  }
});

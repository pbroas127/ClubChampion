// ============================================================================
// CLUB CHAMPION  create-checkout-session
// ----------------------------------------------------------------------------
// Called by js/supabase.js's shop.buy() via client.functions.invoke(), which
// forwards the signed-in user's JWT in the Authorization header automatically.
// Looks up the item's Stripe Price, creates a Checkout Session, and returns
// its URL for the client to redirect to. Never grants anything itself - the
// actual entitlement is only written by stripe-webhook after Stripe confirms
// payment, so a client can never "buy" something for free by calling this
// directly with a forged response.
//
// Deploy:  supabase functions deploy create-checkout-session
// Env vars (supabase secrets set ...):
//   STRIPE_SECRET_KEY        - sk_live_... / sk_test_...
//   SUPABASE_URL              - auto-injected by the platform
//   SUPABASE_SERVICE_ROLE_KEY - auto-injected by the platform
//   SITE_URL                  - e.g. https://clubchampion.app (no trailing slash)
// ============================================================================
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2023-10-16" });
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://clubchampion.app").replace(/\/$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    // Anon-key client bound to the caller's JWT - used only to verify who's
    // asking and read the catalog (both RLS-safe). The actual entitlement
    // write happens later, in the webhook, using the service role key.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: CORS });
    }
    const user = userData.user;

    const { item_id, platform } = await req.json();
    if (!item_id || typeof item_id !== "string") {
      return new Response(JSON.stringify({ error: "item_id required" }), { status: 400, headers: CORS });
    }
    // Web returns to our own domain (WKAppBoundDomains-safe navigation isn't
    // a concern there). Native opens Checkout in an SFSafariViewController
    // (see js/shop.js buy()), which isn't restricted by app-bound domains,
    // but redirecting back to https://SITE_URL wouldn't hand control back to
    // the app - so on iOS/Android we redirect to a custom URL scheme instead,
    // which js/native.js catches via @capacitor/app's appUrlOpen listener.
    const isNative = platform === "ios" || platform === "android";
    const successUrl = isNative ? "clubchampion://checkout-success" : `${SITE_URL}/?checkout=success`;
    const cancelUrl = isNative ? "clubchampion://checkout-cancel" : `${SITE_URL}/?checkout=cancel`;

    const { data: item, error: itemErr } = await supabase
      .from("shop_items")
      .select("id, name, price_cents, stripe_price_id, active")
      .eq("id", item_id)
      .maybeSingle();
    if (itemErr || !item || !item.active) {
      return new Response(JSON.stringify({ error: "Unknown item" }), { status: 404, headers: CORS });
    }
    if (item.price_cents <= 0) {
      return new Response(JSON.stringify({ error: "Item is free - buy() shouldn't be called for it" }), { status: 400, headers: CORS });
    }
    if (!item.stripe_price_id) {
      return new Response(JSON.stringify({ error: "Item has no Stripe price configured yet" }), { status: 500, headers: CORS });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: item.stripe_price_id, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      // metadata is what the webhook trusts to know WHO bought WHAT - never
      // taken from the client at grant time, only from Stripe's own record.
      metadata: { user_id: user.id, item_id: item.id },
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return new Response(JSON.stringify({ error: "Checkout failed" }), { status: 500, headers: CORS });
  }
});

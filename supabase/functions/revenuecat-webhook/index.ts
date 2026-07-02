// ============================================================================
// CLUB CHAMPION  revenuecat-webhook
// ----------------------------------------------------------------------------
// Grants entitlements for native iOS purchases (App Store IAP via RevenueCat).
// This exists because Apple requires real IAP for anything purchased inside
// the iOS app (App Review guideline 3.1.1) - Stripe Checkout only runs for
// web purchases (see js/shop.js buy(), which branches by platform). Same
// trust model as supabase/functions/stripe-webhook: this is the ONLY code
// path (alongside that one) that can ever write to public.entitlements,
// gated by a shared secret instead of a client session.
//
// Deploy:  supabase functions deploy revenuecat-webhook --no-verify-jwt
//
// One-time RevenueCat setup (do this from the RevenueCat dashboard once
// products are configured - see the Mac-to-submission guide):
//   Project Settings -> Integrations -> Webhooks -> Add webhook
//     URL: https://dpvucqmskwzxlgonasbs.supabase.co/functions/v1/revenuecat-webhook
//     Authorization header value: same random string as REVENUECAT_WEBHOOK_SECRET below
//
// Env vars (supabase secrets set ...):
//   REVENUECAT_WEBHOOK_SECRET  - random string, must match the header RevenueCat sends
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - auto-injected
// ============================================================================
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// Events that mean "the user now owns this product." Our shop items are all
// non-consumable (buy once, own forever) or one-time non-renewing items, so
// INITIAL_PURCHASE covers the normal case; NON_RENEWING_PURCHASE covers how
// RevenueCat labels some one-time product configurations. Everything else
// (renewals, cancellations, refunds informational events, etc.) is ignored -
// there's nothing to grant or revoke for a cosmetic that's already owned.
const GRANT_EVENTS = new Set(["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"]);
// Apple/RevenueCat can reverse a purchase (refund or chargeback) - pull the
// entitlement back in that case so a refunded item doesn't stay equippable.
const REVOKE_EVENTS = new Set(["CANCELLATION", "REFUND", "REVOCATION"]);

serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!REVENUECAT_WEBHOOK_SECRET || auth !== `Bearer ${REVENUECAT_WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const event = body?.event;
    if (!event || !event.type) return new Response("ok (no event)", { status: 200 });

    // appUserID was set to our own Supabase user id at Purchases.configure()
    // time (see js/iap.js) - no separate id-mapping table needed.
    const userId = event.app_user_id;
    const productId = event.product_id;
    if (!userId || !productId) return new Response("ok (missing ids)", { status: 200 });

    const { data: item, error: itemErr } = await admin
      .from("shop_items")
      .select("id, category")
      .eq("revenuecat_product_id", productId)
      .maybeSingle();
    if (itemErr || !item) {
      console.error("revenuecat-webhook: unknown product_id", productId);
      return new Response("ok (unknown product)", { status: 200 });
    }

    if (GRANT_EVENTS.has(event.type)) {
      if (item.category === "bundle") {
        const { error } = await admin.rpc("grant_bundle_entitlements", { p_user_id: userId, p_bundle_id: item.id, p_source: "revenuecat" });
        if (error) throw error;
      } else {
        const { error } = await admin
          .from("entitlements")
          .upsert({ user_id: userId, item_id: item.id, source: "revenuecat" }, { onConflict: "user_id,item_id" });
        if (error) throw error;
      }
    } else if (REVOKE_EVENTS.has(event.type)) {
      const { error } = await admin.from("entitlements").delete().eq("user_id", userId).eq("item_id", item.id);
      if (error) throw error;
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("revenuecat-webhook error:", err);
    return new Response("Internal error", { status: 500 });
  }
});

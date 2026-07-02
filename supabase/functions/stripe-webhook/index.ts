// ============================================================================
// CLUB CHAMPION  stripe-webhook
// ----------------------------------------------------------------------------
// Receives checkout.session.completed from Stripe and grants the purchased
// item(s) as entitlements, using the SERVICE ROLE key (bypasses RLS). This is
// the ONLY code path that can ever write to public.entitlements - see the
// comment on that table in schema-shop.sql. Signature verification is what
// stops anyone but Stripe from hitting this and granting themselves items.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
//   (--no-verify-jwt is required: Stripe calls this with no Supabase JWT at
//   all, only its own signature in the Stripe-Signature header)
// Then in the Stripe Dashboard: Developers -> Webhooks -> Add endpoint ->
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Events to send: checkout.session.completed
// Env vars (supabase secrets set ...):
//   STRIPE_SECRET_KEY         - same as create-checkout-session
//   STRIPE_WEBHOOK_SIGNING_SECRET - whsec_... shown when you add the endpoint above
//   SUPABASE_URL               - auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  - auto-injected
// ============================================================================
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2023-10-16" });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET") ?? "";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("missing signature");
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, Stripe.createSubtleCryptoProvider());
  } catch (err) {
    console.error("stripe-webhook: signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const itemId = session.metadata?.item_id;
      if (!userId || !itemId) {
        console.error("stripe-webhook: session missing user_id/item_id metadata", session.id);
        return new Response("ok", { status: 200 }); // ack anyway - retrying won't fix missing metadata
      }

      const { data: item, error: itemErr } = await admin
        .from("shop_items")
        .select("id, category")
        .eq("id", itemId)
        .maybeSingle();
      if (itemErr || !item) {
        console.error("stripe-webhook: unknown item_id", itemId);
        return new Response("ok", { status: 200 });
      }

      if (item.category === "bundle") {
        const { error } = await admin.rpc("grant_bundle_entitlements", { p_user_id: userId, p_bundle_id: itemId });
        if (error) throw error;
      } else {
        const { error } = await admin
          .from("entitlements")
          .upsert({ user_id: userId, item_id: itemId, source: "stripe" }, { onConflict: "user_id,item_id" });
        if (error) throw error;
      }
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("stripe-webhook: handler error:", err);
    // 500 so Stripe retries - we want a transient DB error to be retried,
    // not silently swallowed (would mean a paid customer gets nothing).
    return new Response("Internal error", { status: 500 });
  }
});

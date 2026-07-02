/* ============================================================================
 * CLUB CHAMPION  Native in-app purchases (RevenueCat / StoreKit)
 * ----------------------------------------------------------------------------
 * Apple requires real IAP for anything purchased inside the iOS app (App
 * Review guideline 3.1.1) - a WebView redirect to Stripe would get the app
 * rejected. This module is the native purchase path; js/shop.js buy()
 * branches to it when running inside the iOS app shell and falls back to
 * Stripe Checkout everywhere else (web on desktop or mobile browser).
 *
 * Entitlements are granted server-side by supabase/functions/revenuecat-
 * webhook after RevenueCat validates the receipt with Apple - this module
 * never writes an entitlement itself, same trust boundary as the Stripe path.
 *
 * No-ops everywhere this isn't wired up yet (web, or REVENUECAT_IOS_KEY left
 * blank in js/config.js) so it's always safe to load.
 * ========================================================================== */
(function (root) {
  "use strict";

  function native() { return root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform(); }
  function plugin() { return native() && root.Capacitor.Plugins && root.Capacitor.Plugins.Purchases; }
  function configured() { return !!(root.CC_CONFIG && root.CC_CONFIG.REVENUECAT_IOS_KEY); }

  var ready = false;

  // Call once a signed-in user id is known (app.js onAuth). appUserID = our
  // own Supabase user id, so the RevenueCat webhook's app_user_id IS that id
  // directly - no separate mapping table needed on our side.
  function init(userId) {
    var P = plugin();
    if (!P || !configured() || !userId) return Promise.resolve();
    return P.configure({ apiKey: root.CC_CONFIG.REVENUECAT_IOS_KEY, appUserID: userId })
      .then(function () { ready = true; })
      .catch(function (e) { console.warn("RevenueCat configure failed:", e && e.message); });
  }

  function isReady() { return native() && configured() && ready; }

  // Buys a specific App Store product id directly (our catalog maps 1:1 to
  // products - see shop_items.revenuecat_product_id - so RevenueCat's
  // "offerings" merchandising layer, built for subscription paywalls with
  // multiple tiers, would be unused complexity here).
  function buy(productId) {
    var P = plugin();
    if (!P || !isReady()) return Promise.reject(new Error("Purchases not ready"));
    return P.getProducts({ productIdentifiers: [productId] }).then(function (r) {
      var product = r && r.products && r.products[0];
      if (!product) throw new Error("Product not found in App Store Connect yet");
      return P.purchaseStoreProduct({ product: product });
    }).then(function () {
      // Entitlement lands via the webhook, usually within a second or two.
      // The caller (js/shop.js) polls myLocker() shortly after this resolves.
      return { native: true };
    }).catch(function (e) {
      if (e && (e.userCancelled || e.code === "PURCHASE_CANCELLED_ERROR")) {
        var cancelErr = new Error("cancelled");
        cancelErr.userCancelled = true;
        throw cancelErr;
      }
      throw new Error((e && e.message) || "Purchase failed");
    });
  }

  // Apple requires a Restore Purchases affordance for any app selling IAP -
  // re-syncs entitlements for a user who reinstalled or is on a new device.
  function restore() {
    var P = plugin();
    if (!P || !isReady()) return Promise.reject(new Error("Purchases not ready"));
    return P.restorePurchases().then(function () { return true; });
  }

  root.CC_IAP = { isNative: native, isConfigured: configured, isReady: isReady, init: init, buy: buy, restore: restore };
})(window);

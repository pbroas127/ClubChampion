/* ============================================================================
 * CLUB CHAMPION  Native shell bridge
 * ----------------------------------------------------------------------------
 * Thin, always-safe wrapper around the Capacitor plugins used by the iOS/
 * Android app shell (haptics, status bar, splash screen). Every call is a
 * no-op on the web (window.Capacitor is undefined there), so this file is
 * safe to load unconditionally alongside the rest of the app.
 * ========================================================================== */
(function (root) {
  "use strict";

  function native() { return root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform(); }
  function plugin(name) { return native() && root.Capacitor.Plugins && root.Capacitor.Plugins[name]; }

  function init() {
    if (!native()) return;
    var StatusBar = plugin("StatusBar");
    if (StatusBar) { StatusBar.setStyle({ style: "DARK" }).catch(function () {}); StatusBar.setBackgroundColor({ color: "#0a1f14" }).catch(function () {}); }
    // Hide the launch splash once the app shell has actually rendered, rather
    // than relying solely on the fixed launchShowDuration in capacitor.config.
    var Splash = plugin("SplashScreen");
    if (Splash) Splash.hide().catch(function () {});

    // Catches the clubchampion:// redirect Stripe Checkout lands on after a
    // native purchase (see js/shop.js buy() + create-checkout-session's
    // platform branch). Closes the in-app Safari view and refreshes the Shop.
    var App = plugin("App"), Browser = plugin("Browser");
    if (App) {
      App.addListener("appUrlOpen", function (data) {
        var url = (data && data.url) || "";
        if (url.indexOf("clubchampion://checkout-success") !== 0 && url.indexOf("clubchampion://checkout-cancel") !== 0) return;
        if (Browser) Browser.close().catch(function () {});
        if (url.indexOf("checkout-success") !== -1 && root.CC_SHOP && root.CC_SHOP.onReturnFromCheckout) {
          root.CC_SHOP.onReturnFromCheckout();
        }
      });
    }
  }

  // style: "light" | "medium" | "heavy" | "success" | "warning" | "error"
  function haptic(style) {
    var Haptics = plugin("Haptics");
    if (!Haptics) return;
    try {
      if (style === "success" || style === "warning" || style === "error") {
        Haptics.notification({ type: style.toUpperCase() }).catch(function () {});
      } else {
        Haptics.impact({ style: (style || "light").toUpperCase() }).catch(function () {});
      }
    } catch (e) {}
  }

  // Ask for push permission and register this device's APNs token with our
  // backend. Safe to call more than once (e.g. every sign-in) - both the OS
  // permission prompt and the device_tokens upsert are idempotent. No-op on
  // web or if the push plugin wasn't bundled into this build.
  var pushWired = false;
  function registerPush() {
    var Push = plugin("PushNotifications");
    if (!Push) return;
    if (!pushWired) {
      pushWired = true;
      Push.addListener("registration", function (token) {
        var BE = root.CC_BACKEND;
        if (BE && BE.profile && BE.profile.registerDeviceToken) {
          var platform = (root.Capacitor.getPlatform && root.Capacitor.getPlatform()) || "ios";
          BE.profile.registerDeviceToken(token.value, platform);
        }
      });
      Push.addListener("registrationError", function (err) { console.error("Push registration failed:", err); });
      // Tapping a notification while the app is backgrounded/closed - route to
      // the relevant tab. Payload shape matches notify_push()'s p_data in
      // schema-shop.sql (type: "invite" | "nudge" | "drop").
      Push.addListener("pushNotificationActionPerformed", function (action) {
        try {
          var data = (action && action.notification && action.notification.data) || {};
          if (!root.CC_APP || !root.CC_APP.setTab) return;
          if (data.type === "drop") root.CC_APP.setTab("shop");
          else if (data.type === "invite" || data.type === "nudge") root.CC_APP.setTab("play");
        } catch (e) {}
      });
    }
    Push.requestPermissions().then(function (res) {
      if (res && res.receive === "granted") return Push.register();
    }).catch(function () {});
  }

  root.CC_NATIVE = { isNative: native, haptic: haptic, init: init, registerPush: registerPush };
})(window);

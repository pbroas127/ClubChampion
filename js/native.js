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

  root.CC_NATIVE = { isNative: native, haptic: haptic, init: init };
})(window);

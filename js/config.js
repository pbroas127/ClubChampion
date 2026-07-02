/* ============================================================================
 * CLUB CHAMPION  Public configuration
 * ----------------------------------------------------------------------------
 * Paste your Supabase project's URL and ANON (public) key below to switch on
 * accounts, friends, cloud-saved stats, and (later) ranked. These two values
 * are safe to commit  the anon key is meant to ship in the browser; Row Level
 * Security (see supabase/schema.sql) is what actually protects your data.
 *
 * Where to find them: Supabase dashboard → Project Settings → API.
 * Leaving them blank keeps the game fully playable in OFFLINE mode (stats are
 * saved locally in the browser; friends/ranked are disabled).
 * ==========================================================================*/
window.CC_CONFIG = {
  SUPABASE_URL: "https://dpvucqmskwzxlgonasbs.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwdnVjcW1za3d6eGxnb25hc2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNTc0NDIsImV4cCI6MjA5NzgzMzQ0Mn0.Ep_iI_nRtUJRKGuwNjAoeYamy-duGWkv0bpPYt2SoAw",

  // RevenueCat's PUBLIC iOS SDK key (safe to ship in the browser/app bundle -
  // it's the client counterpart to a Stripe *publishable* key, not a secret).
  // Only used inside the native iOS app (js/iap.js is a no-op on web, where
  // purchases go through Stripe instead). Get it from the RevenueCat
  // dashboard -> Project Settings -> API keys -> Apple App Store, after
  // completing the RevenueCat setup phase in the Mac-to-submission guide.
  REVENUECAT_IOS_KEY: "",
};

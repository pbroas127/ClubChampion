/* ============================================================================
 * CLUB CHAMPION — Public configuration
 * ----------------------------------------------------------------------------
 * Paste your Supabase project's URL and ANON (public) key below to switch on
 * accounts, friends, cloud-saved stats, and (later) ranked. These two values
 * are safe to commit — the anon key is meant to ship in the browser; Row Level
 * Security (see supabase/schema.sql) is what actually protects your data.
 *
 * Where to find them: Supabase dashboard → Project Settings → API.
 * Leaving them blank keeps the game fully playable in OFFLINE mode (stats are
 * saved locally in the browser; friends/ranked are disabled).
 * ==========================================================================*/
window.CC_CONFIG = {
  SUPABASE_URL: "",       // e.g. "https://abcd1234.supabase.co"
  SUPABASE_ANON_KEY: "",  // e.g. "eyJhbGciOi...."
};

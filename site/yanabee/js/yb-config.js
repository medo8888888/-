/* Yanabee backend connection (Supabase). Empty = "backend not connected" mode.
   The anon key is public by design: it only opens what the database policies allow.
   NEVER put the service_role key here or anywhere else in the site. */
window.YB_CONFIG = { url: '', anonKey: '' };

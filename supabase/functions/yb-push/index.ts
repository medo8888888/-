// yb-push: the Yanabee phone-notification sender (Supabase Edge Function, Deno). See handler.js.
// Deployed with "verify JWT" off: the POST is checked against the secret in yb_push_config, and the GET only ever
// returns the public VAPID key. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the Edge runtime.
import { makeHandler } from './handler.js';

const handle = makeHandler({
  url: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  subject: Deno.env.get('YB_PUSH_SUBJECT') ?? 'https://dhjmdiqausbcyhrguinl.supabase.co',
});

Deno.serve(handle);

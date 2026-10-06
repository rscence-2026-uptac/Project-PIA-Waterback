// sms-webhook: inbound SMS keywords (STATUS, THANKS implemented). Deploy with --no-verify-jwt; protected by ?token=SMS_WEBHOOK_SECRET.
// Logic is in ../_shared (pure TS, vitest-tested); this file is only the Deno + Supabase wrapper.
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkWebhookSecret, handleInbound, readInbound } from "../_shared/sms_inbound.ts";
import { serve } from "../_shared/spec06_http.ts";
import { supabaseStore } from "../_shared/spec06_supabase.ts";
import { smsConfigFromEnv } from "../_shared/sms_send.ts";
const store = supabaseStore(createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
}));
Deno.serve((req) => serve(req, "sms-webhook", async (_b, r) => {
  const sms = smsConfigFromEnv((k) => Deno.env.get(k));
  checkWebhookSecret(r.url, Deno.env.get("SMS_WEBHOOK_SECRET"), sms.live);
  return handleInbound({ store, sms, now: new Date() }, await readInbound(r));
}, { parseBody: false }));

// notify-residents (spec 06): POST NotificationPayload[] -> `notified` events (= PWA delivery) + Semaphore SMS (dry-run unless SMS_LIVE=true).
// Logic is in ../_shared (pure TS, vitest-tested); this file is only the Deno + Supabase wrapper.
import { createClient } from "npm:@supabase/supabase-js@2";
import { notifyResidents } from "../_shared/notify.ts";
import { serve } from "../_shared/spec06_http.ts";
import { supabaseStore } from "../_shared/spec06_supabase.ts";
import { smsConfigFromEnv } from "../_shared/sms_send.ts";
const store = supabaseStore(createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
}));
Deno.serve((req) => serve(req, "notify-residents", (body) =>
  notifyResidents({ store, sms: smsConfigFromEnv((k) => Deno.env.get(k)), now: new Date() }, body)));

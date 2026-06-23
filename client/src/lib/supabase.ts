import { createClient, SupabaseClient } from "@supabase/supabase-js";

export let supabase: SupabaseClient;

export function initSupabase(url: string, key: string) {
  supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });
}

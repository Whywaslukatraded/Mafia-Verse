import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | undefined;

export function initSupabase(url: string, key: string) {
  _supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });
}

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    throw new Error("Supabase client not initialized. Call initSupabase first.");
  }
  return _supabase;
}

export function isSupabaseReady(): boolean {
  return !!_supabase;
}

/** Re-export for convenience - only works after initSupabase */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string) {
    if (!_supabase) {
      throw new Error("Supabase client not initialized. Call initSupabase first.");
    }
    return (_supabase as any)[prop];
  },
});

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | undefined;

export function initSupabase(url: string, key: string) {
  _supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      flowType: "pkce",
      // Bug fix: Supabase auto-detects window.localStorage, but that
      // detection can silently fail in some bundler/build setups and fall
      // back to an in-memory-only store instead. That's invisible within a
      // single page — session state and the PKCE verifier both still
      // "work" — but a real browser navigation (e.g. clicking a
      // confirmation link, which fully reloads the page rather than doing
      // a client-side route change) wipes it completely, since nothing was
      // ever actually written to persistent storage. Passing this
      // explicitly removes the guesswork.
      storage: window.localStorage,
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

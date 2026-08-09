import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | undefined;

export function initSupabase(url: string, key: string) {
  _supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // Bug fix: the implicit flow (default) puts a raw, immediately-valid
      // access_token directly in the confirmation/recovery/email-change
      // link's URL. Many email clients (Gmail notably) automatically
      // pre-visit links in incoming mail to scan them for phishing/malware
      // BEFORE the user ever clicks — which silently consumes that token,
      // so the link looks "invalid" or "expired" the moment the real user
      // clicks it, even seconds after the email arrived. PKCE fixes this:
      // the link instead carries a one-time `code` that only redeems
      // successfully when exchanged from the SAME browser that initiated
      // the flow (matched against a `code_verifier` stored in that
      // browser's localStorage) — a scanner bot's pre-visit fails
      // harmlessly since it has no verifier, leaving the code still valid
      // for the actual user.
      flowType: "pkce",
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

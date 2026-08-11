import { getSupabase, isSupabaseReady } from "@/lib/supabase";

// Feature: Friends list. Every /api/friends* endpoint identifies the caller
// via a verified Supabase bearer token server-side (never a client-supplied
// id) — this mirrors the exact pattern already established in use-game.ts's
// useCreateRoom/useJoinRoom, just factored out since Friends.tsx and Room.tsx
// both need it in several places.

// Bug fix: getSession() is *supposed* to auto-refresh an expired access
// token before returning, but that only happens reliably if Supabase's
// in-memory refresh timer actually fired — which it can miss after a
// backgrounded/throttled tab, a long-idle session, or a page restored from
// bfcache. In those cases getSession() still resolves successfully (a
// session object exists), but the access_token inside it is already
// expired. The server's token check (getVerifiedSupabaseUserId, via
// supabaseAdmin.auth.getUser()) validates against Supabase directly and
// correctly rejects that expired token — which looked, from the outside,
// like "the server randomly doesn't think I'm signed in" even though the
// client-side login gate (a separate, simpler check) still showed logged
// in. Checking expiry ourselves and forcing a refresh closes that gap
// instead of trusting whatever getSession() happens to hand back.
async function getFreshAccessToken(forceRefresh = false): Promise<string | undefined> {
  if (!isSupabaseReady()) return undefined;
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return undefined;

  const expiresAt = session.expires_at; // unix seconds
  const isExpiringSoon = typeof expiresAt === "number" && expiresAt * 1000 - Date.now() < 60_000; // <60s left

  if (forceRefresh || isExpiringSoon) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed.session) return refreshed.session.access_token;
    // Refresh failed (e.g. truly logged out elsewhere) — fall back to
    // whatever we had; the request will correctly 401 rather than silently
    // sending nothing.
  }
  return session.access_token;
}

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const accessToken = await getFreshAccessToken();

  const doFetch = (token: string | undefined) => fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const res = await doFetch(accessToken);

  // Safety net: if the server still says 401 even after our own expiry
  // check, force one real refresh and retry exactly once, rather than
  // surfacing a confusing "sign in required" for someone who very much is
  // signed in. Only retries on 401 specifically, and only once, so a
  // genuinely logged-out caller still fails fast instead of looping.
  if (res.status === 401 && isSupabaseReady()) {
    const refreshedToken = await getFreshAccessToken(true);
    if (refreshedToken && refreshedToken !== accessToken) {
      return doFetch(refreshedToken);
    }
  }

  return res;
}

export async function authFetchJson<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await authFetch(path, options);
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch { /* not JSON */ }
    throw new Error(message);
  }
  return res.json();
}

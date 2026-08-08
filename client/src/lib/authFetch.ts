import { getSupabase, isSupabaseReady } from "@/lib/supabase";

// Feature: Friends list. Every /api/friends* endpoint identifies the caller
// via a verified Supabase bearer token server-side (never a client-supplied
// id) — this mirrors the exact pattern already established in use-game.ts's
// useCreateRoom/useJoinRoom, just factored out since Friends.tsx and Room.tsx
// both need it in several places.
export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let accessToken: string | undefined;
  if (isSupabaseReady()) {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token;
  }

  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers || {}),
    },
  });
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

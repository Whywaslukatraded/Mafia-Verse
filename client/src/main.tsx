import { createRoot } from "react-dom/client";
import App from "./App";
import { initSupabase } from "./lib/supabase";
import "./lib/i18n";
import "./index.css";

// This app uses hash-based routing (wouter's useHashLocation — see App.tsx),
// which treats *everything* after "#" in the URL as the current route.
// Supabase's email confirmation / password reset / email change links also
// put their session tokens directly in the hash (implicit grant flow), e.g.
// "yoursite.com/auth/callback#access_token=...&type=signup&...". Without
// this, the router never sees "/auth/callback" at all — it tries to match
// the raw token string as a route path, finds nothing, and (there's no
// error boundary anywhere in this app) can render a blank white screen
// instead of the intended page.
//
// Fix: before the router ever mounts, detect that shape of hash, stash it
// somewhere AuthCallback.tsx (or ResetPassword.tsx, etc.) can still read it
// from, then rewrite the hash to a normal route using the real path the
// browser actually navigated to (window.location.pathname is untouched by
// hash routing, so this works for any redirect target, not just
// /auth/callback).
function normalizeSupabaseAuthHash() {
  const hash = window.location.hash;
  const looksLikeSupabaseAuthHash = !!hash && /(^#?access_token=)|(&access_token=)|(^#?error_description=)|(&error_description=)/.test(hash);

  // Bug fix: PKCE-flow links (see supabase.ts) redirect to a plain query
  // string — "yoursite.com/auth/callback?type=signup&code=xxx" — with NO
  // hash fragment at all. This app's router only ever looks at
  // location.hash, so with an empty hash it falls back to the home route
  // and AuthCallback.tsx never mounts; the code param just sits unused in
  // location.search forever. Detected separately from the implicit-flow
  // case above since there's nothing to stash here — query strings aren't
  // touched by rewriting the hash, so AuthCallback can read `code` straight
  // off window.location.search once it mounts.
  const looksLikePkceCallback = !!window.location.search && /(^\?code=)|(&code=)/.test(window.location.search);

  if (!looksLikeSupabaseAuthHash && !looksLikePkceCallback) return;

  if (looksLikeSupabaseAuthHash) {
    try {
      sessionStorage.setItem("mafia_auth_hash", hash);
    } catch {
      // If sessionStorage is unavailable, the page falling through to a
      // themed 404 is still far better than the previous blank white screen.
    }
  }
  window.location.hash = "#" + (window.location.pathname || "/auth/callback");
}
normalizeSupabaseAuthHash();

async function bootstrap() {
  // Fetch Supabase config from backend (anon key is public-safe)
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      let url = data.supabaseUrl ?? "";
      // Strip /rest/v1 suffix if present
      if (url.endsWith("/rest/v1/") || url.endsWith("/rest/v1")) {
        url = url.replace(/\/rest\/v1\/?$/, "");
      }
      const key = data.supabaseAnonKey ?? "";
      if (url && key) {
        initSupabase(url, key);
      }
    }
  } catch {
    // server not ready yet
  }

  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
}

bootstrap();

// Register Service Worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.log("Service Worker registration failed:", err));
  });
}

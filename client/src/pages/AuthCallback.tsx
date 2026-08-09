import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader as Loader2 } from "lucide-react";

export default function AuthCallback() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  // Bug fix: the effect below depends on `toast` and `t`, which aren't
  // guaranteed to be stable references across renders — if either changes
  // identity (a re-render triggered from inside this same effect, e.g. via
  // setError/setLocation/toast itself), the whole effect re-runs, calling
  // exchangeCodeForSession a SECOND time with the same code. The first
  // call already consumed the code and verifier and genuinely created a
  // session (so you actually do end up logged in) — but the second call's
  // "verifier not found" failure is what visibly renders, and since that
  // runs down the error branch, the 2FA-forcing redirect in
  // finishSignupAuth() never fires, even though a real session exists.
  // This ref ensures the exchange (and the whole handler) only ever
  // actually runs once per page load, no matter how many times the effect
  // itself re-fires.
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    // Shared post-signup-auth logic: claim any pending referral now that a
    // real session/token exists, then route to 2FA setup/verify as needed.
    // Used by both the new PKCE path and the old implicit-flow fallback
    // below, so they can't drift apart.
    async function finishSignupAuth(supabaseId: string | undefined, accessToken: string | undefined) {
      toast({
        title: t("authCallback.emailVerified"),
        description: t("authCallback.welcomeMessage"),
      });

      const pendingRefCode = (() => { try { return localStorage.getItem("mafia_pending_referral"); } catch { return null; } })();
      if (pendingRefCode && accessToken) {
        try {
          await fetch("/api/rewards/referral/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ code: pendingRefCode }),
          });
        } catch {
          // Non-fatal — referral crediting shouldn't block login.
        } finally {
          try { localStorage.removeItem("mafia_pending_referral"); } catch {}
        }
      }

      if (supabaseId && accessToken) {
        try {
          const res = await fetch(`/api/auth/2fa/status?supabaseUserId=${supabaseId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const status = await res.json();
          if (status.isEnabled) {
            setLocation("/2fa-verify");
            return;
          }
          setLocation("/2fa-setup");
          return;
        } catch {
          setLocation("/");
          return;
        }
      }
      setLocation("/");
    }

    // Security fix: PKCE flow (see supabase.ts) — Supabase now redirects
    // here with a plain "?code=..." query string instead of a token
    // sitting directly in the URL. Checked first since PKCE is now this
    // app's default for every new confirmation/recovery/email-change link;
    // the hash-based branches below only matter for any old-style links
    // already sent out before this change, or if PKCE is ever disabled.
    const searchParams = new URLSearchParams(window.location.search);
    const pkceCode = searchParams.get("code");
    const pkceType = searchParams.get("type");
    const pkceErrorDescription = searchParams.get("error_description");

    if (pkceErrorDescription) {
      setError(pkceErrorDescription);
      toast({ title: t("authCallback.authFailed"), description: pkceErrorDescription, variant: "destructive" });
      setTimeout(() => setLocation("/"), 3000);
      return;
    }

    if (pkceCode) {
      const supabase = getSupabase();
      // Clean the one-time code out of the visible URL/history immediately
      // — it's already been handed to exchangeCodeForSession below, no
      // reason to leave it sitting in the address bar or back button.
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      } catch {}

      supabase.auth.exchangeCodeForSession(pkceCode).then(async ({ data, error }) => {
        if (error) {
          setError(error.message);
          toast({
            title: pkceType === "email_change" ? t("authCallback.emailChangeFailed") : t("authCallback.emailVerificationFailed"),
            description: error.message,
            variant: "destructive",
          });
          setTimeout(() => setLocation("/"), 3000);
          return;
        }

        if (pkceType === "recovery") {
          setLocation("/reset-password");
          return;
        }
        if (pkceType === "email_change") {
          toast({ title: t("authCallback.emailUpdated"), description: t("authCallback.emailUpdatedDescription") });
          setLocation("/");
          return;
        }
        // Default to the signup path (matches the previous behavior, and
        // covers a bare ?code= with no ?type= — e.g. if some other trigger
        // point hasn't been updated yet to tag its redirect URL).
        await finishSignupAuth(data.session?.user?.id, data.session?.access_token);
      });
      return;
    }

    // --- Fallback: old implicit-flow handling (access_token in the hash).
    // Kept for any already-sent links using the previous flow; new links
    // all go through the PKCE branch above.
    // main.tsx stashes the real Supabase auth hash in sessionStorage before
    // the hash router mounts (see the comment there) and rewrites
    // window.location.hash to a normal "#/auth/callback" route — so by the
    // time this component renders, the tokens live here, not in the URL.
    const hash = (() => {
      try {
        const stashed = sessionStorage.getItem("mafia_auth_hash");
        if (stashed) {
          sessionStorage.removeItem("mafia_auth_hash");
          return stashed;
        }
      } catch {}
      return window.location.hash;
    })();
    const params = new URLSearchParams(hash.replace("#", "?"));
    const type = params.get("type");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const errorDescription = params.get("error_description");

    if (errorDescription) {
      setError(errorDescription);
      toast({
        title: t("authCallback.authFailed"),
        description: errorDescription,
        variant: "destructive",
      });
      setTimeout(() => setLocation("/"), 3000);
      return;
    }

    if (type === "signup" && accessToken) {
      const supabase = getSupabase();
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || "",
      }).then(async ({ data, error }) => {
        if (error) {
          setError(error.message);
          toast({
            title: t("authCallback.emailVerificationFailed"),
            description: error.message,
            variant: "destructive",
          });
          setTimeout(() => setLocation("/"), 3000);
        } else {
          await finishSignupAuth(data.session?.user?.id, data.session?.access_token);
        }
      });
    } else if (type === "recovery" && accessToken) {
      // Password reset — handled by /reset-password page
      setLocation("/reset-password");
    } else if (type === "email_change" && accessToken) {
      const supabase = getSupabase();
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || "",
      }).then(({ error }) => {
        if (error) {
          setError(error.message);
          toast({
            title: t("authCallback.emailChangeFailed"),
            description: error.message,
            variant: "destructive",
          });
        } else {
          toast({
            title: t("authCallback.emailUpdated"),
            description: t("authCallback.emailUpdatedDescription"),
          });
          setLocation("/");
        }
      });
    } else {
      // No valid auth params — just redirect home
      setLocation("/");
    }
  }, [setLocation, toast, t]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-red-500 font-semibold">{error}</p>
          <p className="text-muted-foreground">{t("authCallback.redirecting")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground">{t("authCallback.processingLogin")}</p>
      </div>
    </div>
  );
}

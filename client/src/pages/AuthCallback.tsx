import { useEffect, useState } from "react";
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

  useEffect(() => {
    const hash = window.location.hash;
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
          toast({
            title: t("authCallback.emailVerified"),
            description: t("authCallback.welcomeMessage"),
          });
          const supabaseId = data.session?.user?.id;
          const accessToken = data.session?.access_token;

          // Fix (#4): Signup.tsx couldn't claim a pending referral because no
          // session/token existed yet at that point (email confirmation was
          // still pending) — the server requires a real Bearer token now, so
          // finish that claim here where one actually exists.
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

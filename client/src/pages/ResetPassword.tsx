import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { Search, KeyRound, Eye, EyeOff, CircleCheck as CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { containsProfanity } from "@/lib/profanity";

export default function ResetPassword() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState(true);

  useEffect(() => {
    // Security fix: PKCE flow (see lib/supabase.ts) — checked first since
    // it's now this app's default for new recovery links. See
    // AuthCallback.tsx for the fuller explanation of why (email link
    // scanners consuming implicit-flow tokens before the real user clicks).
    const searchParams = new URLSearchParams(window.location.search);
    const pkceCode = searchParams.get("code");
    if (pkceCode) {
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      } catch {}
      const supabase = getSupabase();
      supabase.auth.exchangeCodeForSession(pkceCode).then(({ error }) => {
        if (error) {
          setValidSession(false);
          toast({
            title: t("resetPassword.invalidLinkTitle"),
            description: t("resetPassword.expiredLinkDescription"),
            variant: "destructive",
          });
        }
      });
      return;
    }

    // --- Fallback: old implicit-flow handling (access_token in the hash).
    // main.tsx stashes the real Supabase auth hash in sessionStorage before
    // the hash router mounts (see the comment there) and rewrites
    // window.location.hash to a normal "#/reset-password" route — so by the
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
    // Check if we have a valid recovery session from the URL
    const params = new URLSearchParams(hash.replace("#", "?"));
    const type = params.get("type");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (type === "recovery" && accessToken) {
      // Set the session from the recovery URL
      const supabase = getSupabase();
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || "",
      }).then(({ error }) => {
        if (error) {
          setValidSession(false);
          toast({
            title: t("resetPassword.invalidLinkTitle"),
            description: t("resetPassword.expiredLinkDescription"),
            variant: "destructive",
          });
        }
      });
    } else if (!accessToken) {
      setValidSession(false);
      toast({
        title: t("resetPassword.invalidLinkTitleShort"),
        description: t("resetPassword.missingTokensDescription"),
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({
        title: t("signup.passwordTooShortTitle"),
        description: t("signup.passwordTooShortDescription"),
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: t("resetPassword.mismatchTitle"),
        description: t("resetPassword.mismatchDescription"),
        variant: "destructive",
      });
      return;
    }
    if (containsProfanity(password)) {
      toast({
        title: t("signup.inappropriatePasswordTitle"),
        description: t("signup.inappropriatePasswordDescription"),
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const supabase = getSupabase();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({
        title: t("resetPassword.failedTitle"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      setSuccess(true);
      toast({
        title: t("resetPassword.successTitle"),
        description: t("resetPassword.successDescription"),
      });
      setTimeout(() => setLocation("/login"), 2000);
    }
  };

  if (!validSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="inline-flex items-center justify-center p-4 bg-red-500/10 rounded-full">
            <KeyRound className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold">{t("resetPassword.invalidOrExpired")}</h1>
          <p className="text-muted-foreground">{t("resetPassword.invalidOrExpiredDescription")}</p>
          <Button onClick={() => setLocation("/login")} className="mt-4">{t("resetPassword.goToLogin")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10 flex flex-col items-center gap-6"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center p-4 bg-card border-2 border-border rounded-full mb-4">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black font-serif uppercase tracking-tight text-foreground">{t("resetPassword.title")}</h1>
          <p className="text-muted-foreground text-xs uppercase tracking-widest mt-1">{t("resetPassword.subtitle")}</p>
        </div>

        {success ? (
          <div className="w-full bg-card border border-border rounded-xl p-6 text-center space-y-4">
            <div className="inline-flex items-center justify-center p-4 bg-emerald-500/10 rounded-full">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold">{t("resetPassword.updated")}</h2>
            <p className="text-muted-foreground">{t("resetPassword.redirecting")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full space-y-4 bg-card border border-border rounded-xl p-6">
            <div className="space-y-2">
              <Label htmlFor="password">{t("resetPassword.newPassword")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("signup.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("resetPassword.confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder={t("resetPassword.retypePassword")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <KeyRound className="w-4 h-4 mr-2" />
              {loading ? t("resetPassword.updating") : t("resetPassword.title")}
            </Button>
          </form>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/login")}
          className="text-muted-foreground hover:text-foreground"
        >
          ← {t("resetPassword.backToLogin")}
        </Button>
      </motion.div>
    </div>
  );
}

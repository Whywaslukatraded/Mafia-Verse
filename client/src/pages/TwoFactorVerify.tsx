import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Shield, Lock, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabase, isSupabaseReady } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";

export default function TwoFactorVerify() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [method, setMethod] = useState<"totp" | "email">("totp");
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    async function init() {
      if (!isSupabaseReady()) return;
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const id = sessionData.session?.user?.id;
      const token = sessionData.session?.access_token;
      if (!id || !token) return;
      setSupabaseUserId(id);
      setAccessToken(token);

      try {
        const res = await authFetch(`/api/auth/2fa/status?supabaseUserId=${id}`);
        if (!res.ok) {
          // Bug fix: this used to fall through silently on any non-2xx
          // response — status.method would just be undefined, defaulting
          // to the TOTP UI even for an account actually set up for email
          // 2FA. That left no code-send button and no code in an
          // authenticator app that was never set up, with zero indication
          // anything had gone wrong.
          const body = await res.json().catch(() => null);
          console.error("2FA status check failed:", res.status, body);
          toast({ title: body?.message || t("twoFactor.statusCheckFailed", "Couldn't check your 2FA method — try refreshing the page."), variant: "destructive" });
          return;
        }
        const status = await res.json();
        const userMethod = status.method === "email" ? "email" : "totp";
        setMethod(userMethod);
        if (userMethod === "email") {
          await sendLoginCode(id, token);
        }
      } catch (err) {
        console.error("2FA status check errored:", err);
        toast({ title: t("twoFactor.statusCheckFailed", "Couldn't check your 2FA method — try refreshing the page."), variant: "destructive" });
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendLoginCode = async (id: string, token: string) => {
    setSendingCode(true);
    try {
      const res = await authFetch("/api/auth/2fa/send-login-code", {
        method: "POST",
        body: JSON.stringify({ supabaseUserId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || t("twoFactor.emailSendFailed"), variant: "destructive" });
      } else {
        setCodeSent(true);
      }
    } catch {
      toast({ title: t("twoFactor.emailSendFailed"), variant: "destructive" });
    }
    setSendingCode(false);
  };

  const verifyCode = async () => {
    if (code.length !== 6) {
      toast({ title: t("twoFactor.enterSixDigit"), variant: "destructive" });
      return;
    }
    if (!isSupabaseReady()) {
      toast({ title: t("twoFactor.authNotReady"), variant: "destructive" });
      return;
    }
    setVerifying(true);
    const supabase = getSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    const supabaseId = sessionData.session?.user?.id;
    try {
      const res = await authFetch("/api/auth/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ supabaseUserId: supabaseId, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || t("twoFactor.invalidCode"), variant: "destructive" });
        setVerifying(false);
        return;
      }
      // Security fix (#1/#3): this used to be a client-only flag that no
      // server code ever checked, so it provided no real protection. This is
      // now a short-lived, server-signed token that requireVerifiedUser()
      // on the backend actually validates for accounts with 2FA enabled.
      if (data.mfaToken) {
        localStorage.setItem("mafia_mfa_token", data.mfaToken);
      }
      localStorage.setItem("mafia_2fa_passed", "true");
      toast({ title: t("twoFactor.welcomeBack") });
      // Bug fix: this always went home, so a caller that sent someone here
      // specifically to refresh their MFA token (e.g. Settings, when
      // disabling 2FA fails because the stored token is stale/missing) lost
      // them back to the homepage instead of returning to what they were
      // doing. returnTo is only ever a same-origin app path we set
      // ourselves (see Settings.tsx), never taken from anywhere untrusted.
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo");
      setLocation(returnTo && returnTo.startsWith("/") ? returnTo : "/");
    } catch (e) {
      toast({ title: t("twoFactor.verificationFailed"), variant: "destructive" });
      setVerifying(false);
    }
  };

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
            {method === "email" ? <Mail className="w-8 h-8 text-amber-500" /> : <Lock className="w-8 h-8 text-emerald-500" />}
          </div>
          <h1 className="text-3xl font-black font-serif uppercase tracking-tight text-foreground">{t("twoFactor.title")}</h1>
          <p className="text-muted-foreground text-xs uppercase tracking-widest mt-1">
            {method === "email" ? t("twoFactor.checkYourEmail") : t("twoFactor.verifySubtitle")}
          </p>
        </div>

        <div className="w-full bg-card border border-border rounded-xl p-6 space-y-4">
          {method === "email" && (
            <p className="text-xs text-muted-foreground text-center">
              {sendingCode ? t("twoFactor.sendingCode") : codeSent ? t("twoFactor.codeSentCheckInbox") : ""}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="code">{t("twoFactor.sixDigitCode")}</Label>
            <Input
              id="code"
              type="text"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl tracking-widest font-mono"
              data-testid="input-2fa-code"
              autoFocus
            />
          </div>
          <Button
            className="w-full"
            onClick={verifyCode}
            disabled={verifying || code.length !== 6}
            data-testid="button-verify-2fa"
          >
            <Shield className="w-4 h-4 mr-2" />
            {verifying ? t("twoFactor.verifying") : t("twoFactor.verify")}
          </Button>
          {method === "email" && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => supabaseUserId && accessToken && sendLoginCode(supabaseUserId, accessToken)}
              disabled={sendingCode}
            >
              {t("twoFactor.resendCode")}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

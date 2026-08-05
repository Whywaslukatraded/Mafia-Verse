import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Shield, Check, Smartphone, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabase, isSupabaseReady } from "@/lib/supabase";

type Method = "choose" | "totp" | "email";

export default function TwoFactorSetup() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [method, setMethod] = useState<Method>("choose");
  const [step, setStep] = useState<"loading" | "qr" | "email-entry" | "verify">("loading");
  const [qrUri, setQrUri] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    async function init() {
      let attempts = 0;
      while (!isSupabaseReady() && attempts < 50) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      if (!isSupabaseReady()) {
        toast({ title: t("twoFactor.authNotReady"), variant: "destructive" });
        return;
      }
      const supabase = getSupabase();
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error || !sessionData?.session?.user) {
        toast({ title: t("twoFactor.pleaseLogInFirst"), variant: "destructive" });
        setLocation("/login");
        return;
      }
      setSupabaseUserId(sessionData.session.user.id);
      setAccessToken(sessionData.session.access_token);
      setEmail(sessionData.session.user.email || "");
      setStep("qr"); // placeholder state until a method is chosen; "choose" screen shows first
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTotpSetup = async () => {
    if (!supabaseUserId) return;
    setMethod("totp");
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ supabaseUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || t("twoFactor.setupFailed"), variant: "destructive" });
        return;
      }
      setQrUri(data.qrCodeUri);
      setSecret(data.secret);
      setStep("qr");
    } catch {
      toast({ title: t("twoFactor.setupFailedRetry"), variant: "destructive" });
    }
  };

  const chooseEmailMethod = () => {
    setMethod("email");
    setStep("email-entry");
  };

  const sendEmailCode = async () => {
    if (!supabaseUserId || !email.trim()) return;
    setSendingEmail(true);
    try {
      const res = await fetch("/api/auth/2fa/setup-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ supabaseUserId, email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || t("twoFactor.emailSendFailed"), variant: "destructive" });
        setSendingEmail(false);
        return;
      }
      toast({ title: t("twoFactor.codeSentTitle"), description: t("twoFactor.codeSentDescription", { email: email.trim() }) });
      setStep("verify");
    } catch {
      toast({ title: t("twoFactor.emailSendFailed"), variant: "destructive" });
    }
    setSendingEmail(false);
  };

  const verifyCode = async () => {
    if (code.length !== 6 || !supabaseUserId) {
      toast({ title: t("twoFactor.enterSixDigit"), variant: "destructive" });
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ supabaseUserId, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || t("twoFactor.invalidCode"), variant: "destructive" });
        setVerifying(false);
        return;
      }
      localStorage.setItem("mafia_2fa_passed", "true");
      toast({ title: t("twoFactor.enabledSuccess") });
      setLocation("/");
    } catch {
      toast({ title: t("twoFactor.verificationFailed"), variant: "destructive" });
      setVerifying(false);
    }
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        <p className="text-sm text-muted-foreground">{t("twoFactor.loadingSetup")}</p>
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
            <Shield className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-black font-serif uppercase tracking-tight text-foreground">{t("twoFactor.secureAccount")}</h1>
          <p className="text-muted-foreground text-xs uppercase tracking-widest mt-1">{t("twoFactor.required")}</p>
        </div>

        {method === "choose" && (
          <div className="w-full bg-card border border-border rounded-xl p-6 space-y-3">
            <p className="text-sm text-muted-foreground text-center mb-2">{t("twoFactor.chooseMethod")}</p>
            <button
              onClick={startTotpSetup}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/50 hover:bg-muted transition-colors text-left"
              data-testid="button-method-totp"
            >
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-base font-black text-foreground">{t("twoFactor.authenticatorApp")}</p>
                <p className="text-xs text-muted-foreground">{t("twoFactor.authenticatorAppDescription")}</p>
              </div>
            </button>
            <button
              onClick={chooseEmailMethod}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/50 hover:bg-muted transition-colors text-left"
              data-testid="button-method-email"
            >
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{t("twoFactor.emailCode")}</p>
                <p className="text-xs text-muted-foreground">{t("twoFactor.emailCodeDescription")}</p>
              </div>
            </button>
          </div>
        )}

        {method === "totp" && step === "qr" && (
          <div className="w-full bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">{t("twoFactor.scanQrCode")}</p>
              <div className="flex justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                  alt="2FA QR Code"
                  className="rounded-lg border border-border"
                  data-testid="img-qr-code"
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("twoFactor.cantScan")}</p>
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono text-foreground">{secret}</code>
            </div>
            <Button className="w-full" onClick={() => setStep("verify")}>
              <Check className="w-4 h-4 mr-2" />
              {t("twoFactor.scannedIt")}
            </Button>
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setMethod("choose")}>
              ← {t("twoFactor.chooseDifferentMethod")}
            </Button>
          </div>
        )}

        {method === "email" && step === "email-entry" && (
          <div className="w-full bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email2fa">{t("twoFactor.sendCodeToEmail")}</Label>
              <Input
                id="email2fa"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-2fa-email"
              />
            </div>
            <Button className="w-full" onClick={sendEmailCode} disabled={sendingEmail || !email.trim()}>
              <Mail className="w-4 h-4 mr-2" />
              {sendingEmail ? t("twoFactor.sendingCode") : t("twoFactor.sendCode")}
            </Button>
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setMethod("choose")}>
              ← {t("twoFactor.chooseDifferentMethod")}
            </Button>
          </div>
        )}

        {step === "verify" && (
          <div className="w-full bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">
                {method === "email" ? t("twoFactor.enterEmailCodeLabel") : t("twoFactor.enterCodeLabel")}
              </Label>
              <Input
                id="code"
                type="text"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-2xl tracking-widest font-mono"
                data-testid="input-2fa-code"
              />
            </div>
            <Button
              className="w-full"
              onClick={verifyCode}
              disabled={verifying || code.length !== 6}
              data-testid="button-verify-2fa"
            >
              <Check className="w-4 h-4 mr-2" />
              {verifying ? t("twoFactor.verifying") : t("twoFactor.verifyAndEnable")}
            </Button>
            {method === "email" && (
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={sendEmailCode} disabled={sendingEmail}>
                {t("twoFactor.resendCode")}
              </Button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

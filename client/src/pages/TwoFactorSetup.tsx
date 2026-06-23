import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Shield, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/lib/supabase";

export default function TwoFactorSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"loading" | "qr" | "verify">("loading");
  const [qrUri, setQrUri] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    async function startSetup() {
      try {
        const supabase = getSupabase();
        const { data: sessionData, error } = await supabase.auth.getSession();
        if (error || !sessionData?.session?.user) {
          toast({ title: "Please log in first", variant: "destructive" });
          setLocation("/login");
          return;
        }
        const supabaseId = sessionData.session.user.id;
        const res = await fetch("/api/auth/2fa/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supabaseUserId: supabaseId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast({ title: data.message || "Setup failed", variant: "destructive" });
          return;
        }
        setQrUri(data.qrCodeUri);
        setSecret(data.secret);
        setStep("qr");
      } catch (e) {
        console.error("2FA setup error:", e);
        toast({ title: "Setup failed. Please try again.", variant: "destructive" });
      }
    }
    startSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyCode = async () => {
    if (code.length !== 6) {
      toast({ title: "Enter 6-digit code", variant: "destructive" });
      return;
    }
    setVerifying(true);
    try {
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const supabaseId = sessionData.session?.user?.id;
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supabaseUserId: supabaseId, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Invalid code", variant: "destructive" });
        setVerifying(false);
        return;
      }
      localStorage.setItem("mafia_2fa_passed", "true");
      toast({ title: "2FA enabled! Your account is secure." });
      setLocation("/");
    } catch (e) {
      toast({ title: "Verification failed", variant: "destructive" });
      setVerifying(false);
    }
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
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
          <h1 className="text-3xl font-black font-serif uppercase tracking-tight text-foreground">Secure Your Account</h1>
          <p className="text-muted-foreground text-xs uppercase tracking-widest mt-1">Two-factor authentication required</p>
        </div>

        {step === "qr" && (
          <div className="w-full bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Scan this QR code with Google Authenticator</p>
              <div className="flex justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                  alt="2FA QR Code"
                  className="rounded-lg border border-border"
                  data-testid="img-qr-code"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Can't scan? Enter this code manually:
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono text-foreground">{secret}</code>
            </div>
            <Button className="w-full" onClick={() => setStep("verify")}>
              <Check className="w-4 h-4 mr-2" />
              I've scanned it
            </Button>
          </div>
        )}

        {step === "verify" && (
          <div className="w-full bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Enter the 6-digit code from your authenticator</Label>
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
              {verifying ? "Verifying..." : "Verify & Enable"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => setStep("qr")}
            >
              ← Back to QR code
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

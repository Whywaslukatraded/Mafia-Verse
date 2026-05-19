import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, Copy, CheckCircle, QrCode } from "lucide-react";

export default function TwoFactorSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"setup" | "verify">("setup");
  const [secret, setSecret] = useState("");
  const [qrUri, setQrUri] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);

  const userId = localStorage.getItem("mafia_userId");

  const startSetup = async () => {
    if (!userId) {
      toast({ title: "Error", description: "Please login first", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(userId) }),
      });
      const data = await res.json();
      if (res.ok) {
        setSecret(data.secret);
        setQrUri(data.qrCodeUri);
        setStep("verify");
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Setup failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!userId || !code.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(userId), code: code.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.enabled) {
        setDone(true);
        toast({ title: "2FA Enabled!", description: "Your account is now protected." });
      } else {
        toast({ title: "Error", description: data.message || "Invalid code", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Verification failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Secret copied!" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-destructive/10 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <Button variant="ghost" size="sm" onClick={() => setLocation("/settings")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Settings
        </Button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-card border-2 border-border rounded-full mb-6">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-foreground mb-2">Two-Factor Auth</h1>
          <p className="text-muted-foreground text-sm">
            {step === "setup" ? "Add an extra layer of security." : "Enter the code from your authenticator app."}
          </p>
        </div>

        <Card className="bg-card/80 backdrop-blur-xl ring-1 ring-border p-6">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <p className="text-sm font-bold text-foreground">2FA is now enabled!</p>
              <Button className="w-full mt-2" onClick={() => setLocation("/settings")}>
                Back to Settings
              </Button>
            </div>
          ) : step === "setup" ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                We'll generate a secret key. Scan it with Google Authenticator, Authy, or any TOTP app.
              </p>
              <Button onClick={startSetup} disabled={loading} className="w-full">
                {loading ? "Generating..." : "Generate Secret"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 mb-2">
                <QrCode className="w-12 h-12 text-primary" />
                <p className="text-xs text-muted-foreground text-center">
                  Scan this QR code with your authenticator app, or copy the secret manually.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted p-2 rounded text-xs break-all text-foreground">{secret}</code>
                <Button size="sm" variant="outline" onClick={copySecret} className="shrink-0">
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>

              <div>
                <Label className="text-xs">6-Digit Code</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  disabled={loading}
                  className="mt-1 text-center text-lg tracking-widest"
                  data-testid="input-2fa-code"
                />
              </div>

              <Button
                onClick={verifyCode}
                disabled={loading || code.length !== 6}
                className="w-full"
                data-testid="button-2fa-verify"
              >
                {loading ? "Verifying..." : "Verify & Enable"}
              </Button>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

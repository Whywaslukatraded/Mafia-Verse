import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Shield, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/lib/supabase";

export default function TwoFactorVerify() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const verifyCode = async () => {
    if (code.length !== 6) {
      toast({ title: "Enter 6-digit code", variant: "destructive" });
      return;
    }
    setVerifying(true);
    const supabase = getSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    const supabaseId = sessionData.session?.user?.id;
    try {
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
      // Mark 2FA as passed
      localStorage.setItem("mafia_2fa_passed", "true");
      toast({ title: "Welcome back!" });
      setLocation("/");
    } catch (e) {
      toast({ title: "Verification failed", variant: "destructive" });
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
            <Lock className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-black font-serif uppercase tracking-tight text-foreground">Two-Factor Authentication</h1>
          <p className="text-muted-foreground text-xs uppercase tracking-widest mt-1">Enter the code from your authenticator</p>
        </div>

        <div className="w-full bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">6-digit code</Label>
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
            {verifying ? "Verifying..." : "Verify"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

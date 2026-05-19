import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, CheckCircle } from "lucide-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) setToken(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      toast({ title: "Error", description: "Reset token is required", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        setDone(true);
        toast({ title: "Success", description: data.message });
      } else {
        toast({ title: "Error", description: data.message || "Reset failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
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
        <Button variant="ghost" size="sm" onClick={() => setLocation("/login")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Login
        </Button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-card border-2 border-border rounded-full mb-6">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-foreground mb-2">Reset Password</h1>
          <p className="text-muted-foreground text-sm">Enter your new password below.</p>
        </div>

        <Card className="bg-card/80 backdrop-blur-xl ring-1 ring-border p-6">
          {!done ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-xs">Reset Token</Label>
                <Input
                  type="text"
                  placeholder="paste your reset token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={loading}
                  className="mt-1"
                  data-testid="input-reset-token"
                />
              </div>
              <div>
                <Label className="text-xs">New Password</Label>
                <Input
                  type="password"
                  placeholder="min 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  className="mt-1"
                  data-testid="input-reset-password"
                />
              </div>
              <div>
                <Label className="text-xs">Confirm Password</Label>
                <Input
                  type="password"
                  placeholder="repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="mt-1"
                  data-testid="input-reset-confirm"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full" data-testid="button-reset-submit">
                {loading ? "..." : "Reset Password"}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <p className="text-sm font-bold text-foreground">Password Updated!</p>
              <Button className="w-full mt-2" onClick={() => setLocation("/login")}>
                Go to Login
              </Button>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

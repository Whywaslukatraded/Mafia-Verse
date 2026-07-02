import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Search, LogIn, KeyRound, Mail, ArrowLeft, Loader as Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (error) {
      toast({
        title: "Reset failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setResetSent(true);
      toast({
        title: "Reset link sent",
        description: "Check your email for a password reset link.",
      });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    if (data.session) {
      // Check if 2FA is required (only redirect if user has enabled it)
      const supabaseId = data.session.user.id;
      try {
        const res = await fetch(`/api/auth/2fa/status?supabaseUserId=${supabaseId}`);
        const status = await res.json();
        if (status.isEnabled) {
          // 2FA is enabled → verify it
          setLocation("/2fa-verify");
          return;
        }
        // 2FA not enabled → go to home (optional setup in Settings)
        setLocation("/");
        return;
      } catch {
        // Fallback to home
        setLocation("/");
      }
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
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black font-serif uppercase tracking-tight text-foreground">Mafia Verse</h1>
          <p className="text-muted-foreground text-xs uppercase tracking-widest mt-1">Sign in to continue</p>
        </div>

        <AnimatePresence mode="wait">
          {showReset ? (
            <motion.div
              key="reset"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full space-y-4 bg-card border border-border rounded-xl p-6"
            >
              <div className="flex items-center gap-2 mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReset(false)}
                  className="h-8 px-2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">Reset Password</h2>
                  <p className="text-xs text-muted-foreground">We'll send you a recovery link</p>
                </div>
              </div>
              {resetSent ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
                  <Mail className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-foreground">Check your email!</p>
                  <p className="text-xs text-muted-foreground mt-1">A reset link has been sent to {resetEmail}</p>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="resetEmail">Email</Label>
                    <Input
                      id="resetEmail"
                      type="email"
                      placeholder="you@example.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      disabled={resetLoading}
                      data-testid="input-reset-email"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={resetLoading}
                    data-testid="button-reset-send"
                  >
                    {resetLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4 mr-2" />
                        Send Reset Link
                      </>
                    )}
                  </Button>
                </form>
              )}
            </motion.div>
          ) : (
            <motion.form
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleLogin}
              className="w-full space-y-4 bg-card border border-border rounded-xl p-6"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                data-testid="button-signin"
              >
                <LogIn className="w-4 h-4 mr-2" />
                {loading ? "Signing in..." : "Sign In"}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setShowReset(true)}
                  className="text-muted-foreground hover:text-primary hover:underline transition-colors"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </button>
                <div className="text-muted-foreground">
                  No account?{" "}
                  <button
                    type="button"
                    onClick={() => setLocation("/signup")}
                    className="text-primary hover:underline font-medium"
                    data-testid="link-signup"
                  >
                    Sign up
                  </button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="text-muted-foreground hover:text-foreground"
          data-testid="link-back-home"
        >
          ← Back to Home
        </Button>
      </motion.div>
    </div>
  );
}

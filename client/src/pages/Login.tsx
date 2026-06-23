import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Search, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
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
      // Check if 2FA is required
      const supabaseId = data.session.user.id;
      try {
        const res = await fetch(`/api/auth/2fa/status?supabaseUserId=${supabaseId}`);
        const status = await res.json();
        if (status.isEnabled) {
          // 2FA is enabled → verify it
          setLocation("/2fa-verify");
          return;
        }
        // 2FA not enabled → set it up
        setLocation("/2fa-setup");
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

        <form onSubmit={handleLogin} className="w-full space-y-4 bg-card border border-border rounded-xl p-6">
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

          <div className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => setLocation("/signup")}
              className="text-primary hover:underline font-medium"
              data-testid="link-signup"
            >
              Sign up
            </button>
          </div>
        </form>

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

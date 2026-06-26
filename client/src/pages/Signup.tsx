import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Search, UserPlus, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getReferralCodeFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("ref") || "";
}

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const refCode = getReferralCodeFromURL();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });
    setLoading(false);
    if (error) {
      toast({
        title: "Signup failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    if (data.user) {
      // Create profile with referral code
      const myCode = generateReferralCode();
      try {
        await supabase.from("profiles").insert({
          supabase_user_id: data.user.id,
          referral_code: myCode,
          referred_by: refCode || null,
          credits: 25,
        });
        // If referral code was used, record the referral
        if (refCode) {
          await supabase.from("referrals").insert({
            referred_id: data.user.id,
            referrer_id: refCode,
            credits_awarded: 0,
          });
        }
        // Award signup bonus
        toast({
          title: "Account created!",
          description: "Check your email to confirm, then log in. You earned 25 free credits!",
        });
      } catch (e) {
        toast({
          title: "Account created!",
          description: "Check your email to confirm, then log in.",
        });
      }
      setLocation("/login");
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
          <p className="text-muted-foreground text-xs uppercase tracking-widest mt-1">Create your account</p>
        </div>

        <form onSubmit={handleSignup} className="w-full space-y-4 bg-card border border-border rounded-xl p-6">
          {refCode && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-2">
              <Gift className="w-4 h-4 text-emerald-500" />
              <p className="text-sm text-emerald-500">Referral code applied: <strong>{refCode}</strong></p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              placeholder="Your mafia handle"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              data-testid="input-display-name"
            />
          </div>
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
              placeholder="At least 6 characters"
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
            data-testid="button-signup"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {loading ? "Creating..." : "Create Account"}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="text-primary hover:underline font-medium"
              data-testid="link-login"
            >
              Sign in
            </button>
          </div>
        </form>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="text-muted-foreground hover:text-foreground"
          data-testid="link-back-home-signup"
        >
          ← Back to Home
        </Button>
      </motion.div>
    </div>
  );
}

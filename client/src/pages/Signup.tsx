import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Search, UserPlus, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { containsProfanity } from "@/lib/profanity";

function getReferralCodeFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("ref") || "";
}

function claimReferralReward(refCode: string) {
  if (!refCode) return;
  const stats = JSON.parse(localStorage.getItem("mafia_referral_stats") || "{}");
  // Only process once per referral code
  const processed = new Set(JSON.parse(localStorage.getItem("mafia_referrals_processed") || "[]"));
  if (processed.has(refCode)) return;
  processed.add(refCode);
  localStorage.setItem("mafia_referrals_processed", JSON.stringify(Array.from(processed)));
  // Award 25 credits to the referrer
  const referrerId = localStorage.getItem(`mafia_referral_owner_${refCode}`);
  if (referrerId) {
    // Award credits to referrer
    const referrerStats = JSON.parse(localStorage.getItem("mafia_referral_stats") || "{}");
    referrerStats.claimed = (referrerStats.claimed || 0) + 1;
    referrerStats.totalCredits = (referrerStats.totalCredits || 0) + 25;
    localStorage.setItem("mafia_referral_stats", JSON.stringify(referrerStats));
  }
  // Also give 25 credits to the new user
  const s = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
  s.credits = (s.credits || 0) + 25;
  localStorage.setItem("mafia_stats", JSON.stringify(s));
  window.dispatchEvent(new Event("storage"));
}

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [refCode] = useState(getReferralCodeFromURL);

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
    if (containsProfanity(displayName)) {
      toast({
        title: "Inappropriate display name",
        description: "Your display name contains inappropriate language.",
        variant: "destructive",
      });
      return;
    }
    if (containsProfanity(password)) {
      toast({
        title: "Inappropriate password",
        description: "Your password contains inappropriate language. Please choose a different password.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
        },
      });
      if (error) {
        toast({
          title: "Signup failed",
          description: error.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      if (data.user) {
        // Claim referral bonus if applicable
        claimReferralReward(refCode);
        toast({
          title: "Account created!",
          description: "Check your email to confirm, then log in.",
        });
        setLocation("/login");
      }
    } catch (err: any) {
      toast({
        title: "Connection error",
        description: err?.message || "Unable to connect. Please try again.",
        variant: "destructive",
      });
    }
    setLoading(false);
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

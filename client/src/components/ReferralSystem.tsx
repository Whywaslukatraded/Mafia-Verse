import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Copy, CheckCircle2, Gift, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface ReferralStats {
  code: string;
  invited: number;
  claimed: number;
  totalCredits: number;
}

export function ReferralSystem({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const supabase = getSupabase();
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) {
          setLoading(false);
          return;
        }
        const userId = session.session.user.id;

        // Get my profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("referral_code, credits")
          .eq("supabase_user_id", userId)
          .maybeSingle();

        // Get my referrals count
        const { data: referrals } = await supabase
          .from("referrals")
          .select("credits_awarded")
          .eq("referrer_id", userId);

        const invited = referrals?.length || 0;
        const claimed = referrals?.filter((r) => r.credits_awarded > 0).length || 0;
        const totalCredits = referrals?.reduce((sum, r) => sum + (r.credits_awarded || 0), 0) || 0;

        setStats({
          code: profile?.referral_code || "",
          invited,
          claimed,
          totalCredits,
        });
      } catch (e) {
        console.error("Referral stats error:", e);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const copyCode = useCallback(() => {
    if (!stats?.code) return;
    const link = `${window.location.origin}/?ref=${stats.code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [stats]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-card border border-border rounded-2xl p-8">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="relative bg-card border border-border rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-emerald-500/20 via-green-500/10 to-emerald-500/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Invite Friends</h2>
                <p className="text-xs text-muted-foreground">Earn credits for every player</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-muted/30 rounded-xl p-4 text-center space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Your Referral Link</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground truncate">
                {window.location.origin}/?ref={stats?.code || "..."}
              </div>
              <Button size="sm" variant="outline" onClick={copyCode} className="shrink-0" disabled={!stats?.code}>
                {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-foreground">{stats?.invited || 0}</p>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Invited</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-foreground">{stats?.claimed || 0}</p>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Played</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-emerald-500">{stats?.totalCredits || 0}</p>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Credits</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
            <Gift className="w-5 h-5 text-emerald-500" />
            <div>
              <p className="text-sm font-bold text-foreground">25 Credits per friend</p>
              <p className="text-xs text-muted-foreground">When they complete their first game</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
            <CreditCard className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-sm font-bold text-foreground">Your Balance</p>
              <p className="text-xs text-muted-foreground">
                {stats?.totalCredits || 0} credits earned from referrals
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Copy, CheckCircle2, Gift, Loader2, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { getSupabase, isSupabaseReady } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";

const REWARD_PER_INVITE = 25;

export function ReferralSystem({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState({ invited: 0, totalCredits: 0, pending: 0 });
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // The referral code and invite/credit counts live server-side, tied to the
  // signed-in account — a code generated in localStorage never told the
  // server anything, so two real accounts playing a game together did
  // nothing. This now reads the real per-account link and stats.
  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      let attempts = 0;
      while (!isSupabaseReady() && attempts < 30) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      if (!isSupabaseReady() || cancelled) { setCheckingAuth(false); setLoadingStats(false); return; }
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user?.id || null;
      const token = data.session?.access_token || null;
      if (cancelled) return;
      setSupabaseUserId(id);
      setCheckingAuth(false);

      if (id && token) {
        fetch(`/api/rewards/referral?supabaseUserId=${encodeURIComponent(id)}&deviceId=${encodeURIComponent(getDeviceId())}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(r => r.json())
          .then(data => {
            if (cancelled) return;
            setCode(data.code ?? null);
            setStats({ invited: data.joined ?? data.invited ?? 0, totalCredits: data.totalCredits ?? 0, pending: data.pending ?? 0 });
          })
          .catch(() => { if (!cancelled) setErrorMsg(t("referralSystem.loadFailed")); })
          .finally(() => { if (!cancelled) setLoadingStats(false); });
      } else {
        setLoadingStats(false);
      }
    }
    loadSession();
    return () => { cancelled = true; };
  }, [t]);

  const copyCode = useCallback(() => {
    if (!code) return;
    const link = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

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
                <h2 className="text-lg font-bold text-foreground">{t("referralSystem.title")}</h2>
                <p className="text-xs text-muted-foreground">{t("referralSystem.subtitle")}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {checkingAuth || loadingStats ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : !supabaseUserId ? (
            <div className="text-center py-6 space-y-4">
              <UserPlus className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-bold text-foreground">Sign up to get your referral link</p>
              <p className="text-xs text-muted-foreground">Your invite link and credits are tied to your account, so guests can't refer friends.</p>
              <Button className="w-full" onClick={() => setLocation("/signup")}>
                Sign Up
              </Button>
            </div>
          ) : (
            <>
              <div className="bg-muted/30 rounded-xl p-4 text-center space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">{t("referralSystem.yourReferralLink")}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground truncate">
                    {window.location.origin}/?ref={code}
                  </div>
                  <Button size="sm" variant="outline" onClick={copyCode} className="shrink-0">
                    {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {errorMsg && (
                <p className="text-xs text-red-400 text-center">{errorMsg}</p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/30 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-foreground">{stats.invited}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("referralSystem.joined")}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-emerald-500">{stats.totalCredits}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("referralSystem.credits")}</p>
                </div>
              </div>
              {stats.pending > 0 && (
                <p className="text-[10px] text-center text-amber-500">
                  {stats.pending} friend{stats.pending === 1 ? "" : "s"} pending — credits unlock once they've played a couple of real games.
                </p>
              )}

              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                <Gift className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-bold text-foreground">{t("referralSystem.creditsPerFriend", { count: REWARD_PER_INVITE })}</p>
                  <p className="text-xs text-muted-foreground">{t("referralSystem.theyJoinYouGetRewarded")}</p>
                </div>
              </div>
              <p className="text-[10px] text-center text-muted-foreground px-2">
                Both you and your friend need to be signed up to earn the credits — and your friend needs to actually play a couple of real games (chatting and voting) before the credits unlock. This stops people from farming free credits with accounts that never play.
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

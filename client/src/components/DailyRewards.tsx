import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Coins, Flame, Calendar, ChevronRight, Sparkles, Loader2, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSupabase, isSupabaseReady } from "@/lib/supabase";

interface RewardDay {
  day: number;
  credits: number;
  bonus?: boolean;
}

const REWARDS: RewardDay[] = [
  { day: 1, credits: 5 },
  { day: 2, credits: 7 },
  { day: 3, credits: 10 },
  { day: 4, credits: 5 },
  { day: 5, credits: 7 },
  { day: 6, credits: 10 },
  { day: 7, credits: 15, bonus: true },
];

function mirrorCreditsLocally(totalCredits: number | undefined) {
  if (totalCredits === undefined) return;
  try {
    const s = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
    s.credits = totalCredits;
    localStorage.setItem("mafia_stats", JSON.stringify(s));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

export function DailyRewards({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  // The streak and "already claimed today" state live on the server, keyed to
  // the signed-in account — not localStorage — so clearing the browser (or
  // faking the system clock) can't be used to re-claim the same day.
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [streak, setStreak] = useState({ current: 0, longest: 0, canClaim: false });
  const [claimingDay, setClaimingDay] = useState<number | null>(null);
  const [showClaimAnim, setShowClaimAnim] = useState(false);
  const [lastClaimedReward, setLastClaimedReward] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      let attempts = 0;
      while (!isSupabaseReady() && attempts < 30) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      if (!isSupabaseReady() || cancelled) { setCheckingAuth(false); return; }
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user?.id || null;
      if (cancelled) return;
      setSupabaseUserId(id);
      setCheckingAuth(false);
      if (id) await refreshStatus(id);
    }
    loadSession();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshStatus = async (id: string) => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`/api/rewards/daily/status?supabaseUserId=${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setStreak({ current: data.current, longest: data.longest, canClaim: data.canClaim });
      }
    } catch {
      // leave defaults
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleClaim = useCallback(async (dayNum: number) => {
    if (!supabaseUserId || !streak.canClaim || dayNum !== streak.current + 1 || claimingDay) return;
    setClaimingDay(dayNum);
    setErrorMsg("");
    try {
      const res = await fetch("/api/rewards/daily/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supabaseUserId, day: dayNum }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Could not claim reward.");
        setClaimingDay(null);
        return;
      }
      setStreak({ current: data.current, longest: data.longest, canClaim: false });
      setLastClaimedReward(data.creditsAwarded);
      mirrorCreditsLocally(data.totalCredits);
      setShowClaimAnim(true);
      setTimeout(() => setShowClaimAnim(false), 2000);
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setClaimingDay(null);
    }
  }, [supabaseUserId, streak, claimingDay]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="relative bg-card border border-border rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Gift className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{t("dailyRewards.title")}</h2>
                <p className="text-xs text-muted-foreground">{t("dailyRewards.subtitle")}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {checkingAuth || loadingStatus ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : !supabaseUserId ? (
            <div className="text-center py-6 space-y-4">
              <UserPlus className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-bold text-foreground">Sign up to claim daily rewards</p>
              <p className="text-xs text-muted-foreground">Your streak is tied to your account so it can't be reset by clearing your browser.</p>
              <Button className="w-full" onClick={() => setLocation("/signup")}>
                Sign Up
              </Button>
            </div>
          ) : (
            <>
              {errorMsg && <p className="text-xs text-red-400 text-center">{errorMsg}</p>}

              <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span className="text-sm text-muted-foreground">{t("dailyRewards.currentStreak")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-orange-500">{t("dailyRewards.dayStreak", { count: streak.current })}</span>
                </div>
                {streak.longest > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30">
                    <Flame className="w-3 h-3 text-primary" />
                    <span className="text-xs font-bold text-primary">{t("dailyRewards.best", { count: streak.longest })}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {REWARDS.map((reward) => {
                  const isClaimed = streak.current >= reward.day && !streak.canClaim;
                  const isNext = streak.canClaim && reward.day === streak.current + 1;
                  const isFuture = reward.day > streak.current + 1;

                  return (
                    <motion.button
                      key={reward.day}
                      whileHover={isNext ? { scale: 1.05 } : {}}
                      whileTap={isNext ? { scale: 0.95 } : {}}
                      onClick={() => handleClaim(reward.day)}
                      disabled={!isNext}
                      className={cn(
                        "relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all",
                        isClaimed
                          ? "bg-green-500/10 border-green-500/30 opacity-60"
                          : isNext
                            ? "bg-amber-500/10 border-amber-500/50 cursor-pointer hover:bg-amber-500/20"
                            : isFuture
                              ? "bg-muted/30 border-border opacity-50"
                              : "bg-primary/10 border-primary/30 opacity-60"
                      )}
                    >
                      <span className={cn(
                        "text-xs font-bold",
                        isClaimed ? "text-green-500" : isNext ? "text-amber-500" : "text-muted-foreground"
                      )}>
                        {reward.day}
                      </span>
                      <Calendar className={cn(
                        "w-4 h-4",
                        isClaimed ? "text-green-500" : isNext ? "text-amber-500" : "text-muted"
                      )} />
                      {isClaimed && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center"
                        >
                          <span className="text-[8px] text-white font-bold">✓</span>
                        </motion.div>
                      )}
                      {claimingDay === reward.day && (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 0.8 }}
                          className="absolute inset-0 flex items-center justify-center bg-card/80 rounded-xl"
                        >
                          <Sparkles className="w-4 h-4 text-amber-500" />
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {REWARDS.map((reward) => {
                  const isNext = streak.canClaim && reward.day === streak.current + 1;
                  const isClaimed = streak.current >= reward.day && !streak.canClaim;

                  return (
                    <div
                      key={reward.day}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border transition-all",
                        isNext ? "bg-amber-500/5 border-amber-500/20" : "bg-muted/30 border-border"
                      )}
                    >
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {t("dailyRewards.dayN", { day: reward.day })}
                          {reward.bonus && <span className="ml-2 text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded">{t("dailyRewards.bonus")}</span>}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-amber-500 flex items-center gap-1">
                            <Coins className="w-3 h-3" /> {t("dailyRewards.plusCredits", { count: reward.credits })}
                          </span>
                        </div>
                      </div>

                      {isClaimed ? (
                        <span className="text-xs text-green-500 font-bold">{t("dailyRewards.claimed")}</span>
                      ) : isNext ? (
                        <button
                          onClick={() => handleClaim(reward.day)}
                          className="text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors"
                        >
                          {t("dailyRewards.claim")}
                        </button>
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted" />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <AnimatePresence>
          {showClaimAnim && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10"
            >
              <motion.div
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                exit={{ scale: 1.2, opacity: 0 }}
                className="bg-card border border-amber-500/30 rounded-2xl p-8 text-center"
              >
                <Gift className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                <p className="text-lg font-bold">{t("dailyRewards.rewardClaimed")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("dailyRewards.plusCredits", { count: lastClaimedReward })}
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Coins, Flame, Calendar, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface RewardDay {
  day: number;
  wins: number;
  credits: number;
  bonus?: boolean;
}

const REWARDS: RewardDay[] = [
  { day: 1, wins: 0, credits: 5 },
  { day: 2, wins: 0, credits: 7 },
  { day: 3, wins: 0, credits: 10 },
  { day: 4, wins: 0, credits: 5 },
  { day: 5, wins: 0, credits: 7 },
  { day: 6, wins: 0, credits: 10 },
  { day: 7, wins: 0, credits: 15, bonus: true },
];

function getStreakData() {
  try {
    const raw = localStorage.getItem("mafia_streak");
    if (!raw) return { current: 0, lastClaim: null, longest: 0 };
    return JSON.parse(raw);
  } catch {
    return { current: 0, lastClaim: null, longest: 0 };
  }
}

function saveStreak(data: any) {
  localStorage.setItem("mafia_streak", JSON.stringify(data));
}

function getStats() {
  try {
    const raw = localStorage.getItem("mafia_stats");
    if (!raw) return { wins: 0, gamesPlayed: 0, achievements: [], credits: 0 };
    return JSON.parse(raw);
  } catch {
    return { wins: 0, gamesPlayed: 0, achievements: [], credits: 0 };
  }
}

function saveStats(stats: any) {
  localStorage.setItem("mafia_stats", JSON.stringify(stats));
  window.dispatchEvent(new Event("storage"));
}

export function DailyRewards({ onClose }: { onClose: () => void }) {
  const [streak, setStreak] = useState(getStreakData);
  const [stats, setStats] = useState(getStats);
  const [claimedToday, setClaimedToday] = useState(false);
  const [showClaimAnim, setShowClaimAnim] = useState(false);
  const [claimingDay, setClaimingDay] = useState<number | null>(null);

  const today = new Date().toDateString();
  const canClaim = streak.lastClaim !== today;

  const handleClaim = useCallback((dayNum: number) => {
    if (!canClaim || dayNum !== streak.current + 1) return;

    const reward = REWARDS[dayNum - 1];
    if (!reward) return;

    setClaimingDay(dayNum);

    setTimeout(() => {
      const newStats = {
        ...stats,
        credits: (stats.credits || 0) + reward.credits,
      };
      saveStats(newStats);
      setStats(newStats);

      const newStreak = {
        current: dayNum,
        lastClaim: today,
        longest: Math.max(streak.longest || 0, dayNum),
      };
      if (dayNum >= 7) {
        newStreak.current = 0; // reset after week
      }
      saveStreak(newStreak);
      setStreak(newStreak);
      setClaimedToday(true);
      setShowClaimAnim(true);
      setClaimingDay(null);

      setTimeout(() => setShowClaimAnim(false), 2000);
    }, 600);
  }, [canClaim, streak, stats, today]);

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
                <h2 className="text-lg font-bold text-foreground">Daily Rewards</h2>
                <p className="text-xs text-muted-foreground">Come back every day</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Current Streak</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-orange-500">{streak.current} day streak</span>
            </div>
            {streak.longest > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30">
                <Flame className="w-3 h-3 text-primary" />
                <span className="text-xs font-bold text-primary">Best: {streak.longest}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {REWARDS.map((reward) => {
              const isClaimed = streak.current >= reward.day && streak.lastClaim === today;
              const isNext = canClaim && reward.day === streak.current + 1;
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
              const isNext = canClaim && reward.day === streak.current + 1;
              const isClaimed = streak.current >= reward.day && streak.lastClaim === today;

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
                      Day {reward.day}
                      {reward.bonus && <span className="ml-2 text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded">BONUS</span>}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-amber-500 flex items-center gap-1">
                        <Coins className="w-3 h-3" /> +{reward.credits} Credits
                      </span>
                    </div>
                  </div>

                  {isClaimed ? (
                    <span className="text-xs text-green-500 font-bold">Claimed</span>
                  ) : isNext ? (
                    <button
                      onClick={() => handleClaim(reward.day)}
                      className="text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors"
                    >
                      Claim
                    </button>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted" />
                  )}
                </div>
              );
            })}
          </div>
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
                <p className="text-lg font-bold">Reward Claimed!</p>
                <p className="text-sm text-muted-foreground">
                  +{REWARDS[streak.current - 1]?.credits || 0} Credits
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

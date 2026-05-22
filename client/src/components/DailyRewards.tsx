import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Coins, Flame, Calendar, ChevronRight, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface RewardDay {
  day: number;
  wins: number;
  credits: number;
  bonus?: boolean;
}

const REWARDS: RewardDay[] = [
  { day: 1, wins: 1, credits: 10 },
  { day: 2, wins: 1, credits: 15 },
  { day: 3, wins: 2, credits: 20 },
  { day: 4, wins: 1, credits: 15 },
  { day: 5, wins: 2, credits: 25 },
  { day: 6, wins: 1, credits: 20 },
  { day: 7, wins: 5, credits: 100, bonus: true },
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
        wins: (stats.wins || 0) + reward.wins,
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
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative bg-card border border-border rounded-2xl max-w-md w-full shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Gift className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Daily Rewards</h2>
                <p className="text-xs text-muted-foreground">Claim every day to keep your streak</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>

          {/* Streak badge */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/30">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-bold text-orange-500">{streak.current} day streak</span>
            </div>
            {streak.longest > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30">
                <Trophy className="w-3 h-3 text-primary" />
                <span className="text-xs font-bold text-primary">Best: {streak.longest}</span>
              </div>
            )}
          </div>
        </div>

        {/* Rewards grid */}
        <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
          {REWARDS.map((reward) => {
            const isClaimed = streak.current > reward.day || (streak.current === reward.day && !canClaim);
            const isNext = canClaim && reward.day === streak.current + 1;
            const isLocked = !isClaimed && !isNext;

            return (
              <motion.button
                key={reward.day}
                whileHover={isNext ? { scale: 1.02 } : {}}
                whileTap={isNext ? { scale: 0.98 } : {}}
                onClick={() => isNext && handleClaim(reward.day)}
                disabled={!isNext}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                  isClaimed
                    ? "bg-green-500/5 border-green-500/20 opacity-60"
                    : isNext
                      ? "bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20 cursor-pointer shadow-lg shadow-amber-500/10"
                      : "bg-muted/30 border-border opacity-40 cursor-not-allowed"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0",
                  isClaimed ? "bg-green-500/20 text-green-500" : isNext ? "bg-amber-500/20 text-amber-500" : "bg-muted text-muted-foreground"
                )}>
                  {isClaimed ? "✓" : reward.day}
                </div>

                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">
                    Day {reward.day}
                    {reward.bonus && <span className="ml-2 text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded">BONUS</span>}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Trophy className="w-3 h-3" /> +{reward.wins} Wins
                    </span>
                    <span className="text-xs text-amber-500 flex items-center gap-1">
                      <Coins className="w-3 h-3" /> +{reward.credits} Credits
                    </span>
                  </div>
                </div>

                {isNext && (
                  <ChevronRight className="w-4 h-4 text-amber-500" />
                )}
                {claimingDay === reward.day && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/30">
          <p className="text-[10px] text-muted-foreground text-center">
            Claim rewards daily. Miss a day and your streak resets. Day 7 gives a massive bonus!
          </p>
        </div>

        {/* Claim animation overlay */}
        <AnimatePresence>
          {showClaimAnim && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-10"
            >
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                className="bg-card border border-amber-500/30 rounded-2xl p-8 text-center shadow-2xl"
              >
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <Gift className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                </motion.div>
                <p className="text-lg font-bold text-foreground">Reward Claimed!</p>
                <p className="text-sm text-muted-foreground mt-1">Come back tomorrow for more</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

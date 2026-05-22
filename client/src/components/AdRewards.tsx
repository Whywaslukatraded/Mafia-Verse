import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tv, Coins, Clock, CheckCircle2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

function getAdStats() {
  try {
    const raw = localStorage.getItem("mafia_ad_stats");
    return raw ? JSON.parse(raw) : { watchedToday: 0, lastDate: null, totalWatched: 0 };
  } catch {
    return { watchedToday: 0, lastDate: null, totalWatched: 0 };
  }
}

function saveAdStats(s: any) {
  localStorage.setItem("mafia_ad_stats", JSON.stringify(s));
}

function addCredits(amount: number) {
  try {
    const raw = localStorage.getItem("mafia_stats");
    const stats = raw ? JSON.parse(raw) : { wins: 0, gamesPlayed: 0, achievements: [], credits: 0 };
    stats.credits = (stats.credits || 0) + amount;
    localStorage.setItem("mafia_stats", JSON.stringify(stats));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

const MAX_ADS_PER_DAY = 5;
const REWARD_PER_AD = 5;

export function AdRewards({ onClose }: { onClose: () => void }) {
  const today = new Date().toDateString();
  const [stats, setStats] = useState(() => {
    const s = getAdStats();
    if (s.lastDate !== today) {
      s.watchedToday = 0;
      s.lastDate = today;
      saveAdStats(s);
    }
    return s;
  });
  const [watching, setWatching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  const startWatch = useCallback(() => {
    const current = statsRef.current;
    if (current.watchedToday >= MAX_ADS_PER_DAY) return;

    setWatching(true);
    setProgress(0);
    setClaimed(false);

    let p = 0;
    const interval = setInterval(() => {
      p += 2;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setWatching(false);
        setClaimed(true);

        const updated = {
          watchedToday: current.watchedToday + 1,
          totalWatched: (current.totalWatched || 0) + 1,
          lastDate: today,
        };
        saveAdStats(updated);
        setStats(updated);
        addCredits(REWARD_PER_AD);
      }
    }, 60);
  }, [today]);

  const remaining = MAX_ADS_PER_DAY - stats.watchedToday;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="relative bg-card border border-border rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-blue-500/20 via-indigo-500/10 to-blue-500/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Tv className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Free Credits</h2>
                <p className="text-xs text-muted-foreground">Watch ads, earn rewards</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Reward per ad</span>
            </div>
            <span className="text-sm font-bold text-amber-500">+{REWARD_PER_AD} Credits</span>
          </div>

          <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Available today</span>
            </div>
            <span className="text-sm font-bold">{remaining} / {MAX_ADS_PER_DAY}</span>
          </div>

          <AnimatePresence mode="wait">
            {claimed ? (
              <motion.div
                key="claimed"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center py-4"
              >
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="font-bold text-foreground">+{REWARD_PER_AD} Credits Earned!</p>
                <p className="text-xs text-muted-foreground">You can watch {remaining} more today</p>
                {remaining > 0 && (
                  <Button size="sm" variant="outline" className="mt-3" onClick={startWatch}>
                    Watch Another
                  </Button>
                )}
              </motion.div>
            ) : watching ? (
              <motion.div
                key="watching"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="bg-muted rounded-xl p-6 text-center">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    <Tv className="w-10 h-10 text-blue-500 mx-auto mb-2" />
                  </motion.div>
                  <p className="text-sm font-bold text-foreground">Watching ad...</p>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="ready"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Button
                  className="w-full gap-2"
                  disabled={remaining <= 0}
                  onClick={startWatch}
                >
                  <Sparkles className="w-4 h-4" />
                  {remaining > 0 ? `Watch Ad (+${REWARD_PER_AD} Credits)` : "Daily Limit Reached"}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}


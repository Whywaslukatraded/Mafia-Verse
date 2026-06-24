import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tv, Coins, Clock, CircleCheck as CheckCircle2, Sparkles, X, TriangleAlert as AlertTriangle, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_ADS_PER_DAY = 5;
const REWARD_PER_AD = 5;
const COUNTDOWN_SECONDS = 15;

const BILLBOARD_ADS = [
  {
    id: "item_shop",
    emoji: "🔥",
    title: "GEAR UP IN THE SHOP!",
    body: "Check out the Item Shop right now to unlock exclusive limited-edition mystery costumes and special rare items before they fly off the shelves!",
    gradient: "from-orange-500/20 via-amber-500/10 to-orange-600/20",
    border: "border-orange-500/30",
    accent: "text-orange-400",
    dot: "bg-orange-500",
  },
  {
    id: "buy_credits",
    emoji: "💼",
    title: "NO MORE WAITING",
    body: "Need credits right now for a rare item? Skip the daily limit and visit our store page to instantly buy bundles of credits securely powered by Stripe!",
    gradient: "from-emerald-500/20 via-teal-500/10 to-emerald-600/20",
    border: "border-emerald-500/30",
    accent: "text-emerald-400",
    dot: "bg-emerald-500",
  },
  {
    id: "referral",
    emoji: "📣",
    title: "GROW YOUR CREW",
    body: "Want even more rewards? Use our Referral System to invite your friends! Share your unique invite link with your crew to earn a massive 25 bonus credits together when they join.",
    gradient: "from-blue-500/20 via-indigo-500/10 to-blue-600/20",
    border: "border-blue-500/30",
    accent: "text-blue-400",
    dot: "bg-blue-500",
  },
  {
    id: "security",
    emoji: "🔒",
    title: "BACKUP SECURED",
    body: "Your game profile is protected. Ensure your account is fully secure by linking your login profile with Google 2-Step Authentication via Supabase.",
    gradient: "from-red-500/20 via-rose-500/10 to-red-600/20",
    border: "border-red-500/30",
    accent: "text-red-400",
    dot: "bg-red-500",
  },
];

interface AdRewardsProps {
  onClose: () => void;
  sessionId?: string;
  roomCode?: string;
}

export function AdRewards({ onClose, sessionId: propSessionId, roomCode }: AdRewardsProps) {
  const sessionId = propSessionId || localStorage.getItem("mafia_session_current") || `anon_${Math.random().toString(36).slice(2, 10)}`;

  const selectedAd = useMemo(() => BILLBOARD_ADS[Math.floor(Math.random() * BILLBOARD_ADS.length)], []);

  const [claimsToday, setClaimsToday] = useState(0);
  const [remaining, setRemaining] = useState(MAX_ADS_PER_DAY);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [watching, setWatching] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [claimed, setClaimed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load status from server
  useEffect(() => {
    fetch(`/api/ad-claim/status?sessionId=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(data => {
        setClaimsToday(data.claimsToday ?? 0);
        setRemaining(data.remaining ?? MAX_ADS_PER_DAY);
      })
      .catch(() => {})
      .finally(() => setLoadingStatus(false));
  }, [sessionId]);

  const startWatch = useCallback(() => {
    if (locked || watching || remaining <= 0) return;
    setLocked(true);
    setWatching(true);
    setCountdown(COUNTDOWN_SECONDS);
    setClaimed(false);
    setErrorMsg("");

    let secs = COUNTDOWN_SECONDS;
    intervalRef.current = setInterval(() => {
      secs -= 1;
      setCountdown(secs);
      if (secs <= 0) {
        clearInterval(intervalRef.current!);
        // Award via server
        fetch("/api/ad-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, roomCode }),
        })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              setClaimed(true);
              setClaimsToday(data.claimsToday);
              setRemaining(data.remaining);
              // Mirror to localStorage for UI reactivity
              try {
                const s = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
                s.credits = (s.credits || 0) + REWARD_PER_AD;
                localStorage.setItem("mafia_stats", JSON.stringify(s));
                window.dispatchEvent(new Event("storage"));
              } catch {}
            } else {
              setErrorMsg(data.message || "Could not award credits.");
            }
          })
          .catch(() => setErrorMsg("Network error. Please try again."))
          .finally(() => {
            setWatching(false);
            setLocked(false);
          });
      }
    }, 1000);
  }, [locked, watching, remaining, sessionId, roomCode]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const progressPct = watching ? Math.round(((COUNTDOWN_SECONDS - countdown) / COUNTDOWN_SECONDS) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if (!watching) onClose(); }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative bg-card border border-border rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500/20 via-indigo-500/10 to-blue-500/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Tv className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Free Credits</h2>
                <p className="text-xs text-muted-foreground">Watch & earn — 5 credits per stream</p>
              </div>
            </div>
            {!watching && (
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-muted-foreground">Per stream</span>
              </div>
              <span className="text-sm font-bold text-amber-500">+{REWARD_PER_AD}</span>
            </div>
            <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Today</span>
              </div>
              <span className="text-sm font-bold">{loadingStatus ? "..." : `${claimsToday}/${MAX_ADS_PER_DAY}`}</span>
            </div>
          </div>

          {/* Countdown timer bar above billboard */}
          <div className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all",
            watching ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/30 border-border"
          )}>
            <Timer className={cn("w-4 h-4", watching ? "text-amber-500 animate-spin" : "text-muted-foreground")} />
            <span className="text-xs font-mono font-bold flex-1">
              {watching ? `Streaming... ${countdown}s remaining` : "Ready to Stream"}
            </span>
            {watching && (
              <span className="text-xs font-black text-amber-500">{countdown}s</span>
            )}
          </div>

          {/* Premium Billboard */}
          <div className={cn(
            "relative rounded-2xl overflow-hidden border shadow-lg transition-all duration-300",
            selectedAd.border,
            `bg-gradient-to-br ${selectedAd.gradient}`,
            watching && "ring-2 ring-amber-500/40 shadow-amber-500/10"
          )}>
            {/* Billboard chrome */}
            <div className="flex items-center gap-2 px-4 pt-3 pb-1 border-b border-white/10">
              <div className={cn("w-2 h-2 rounded-full animate-pulse", selectedAd.dot)} />
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Sponsored</span>
              <div className="ml-auto flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
              </div>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none mt-0.5">{selectedAd.emoji}</span>
                <div>
                  <h3 className={cn("text-sm font-black uppercase tracking-tight", selectedAd.accent)}>
                    {selectedAd.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    {selectedAd.body}
                  </p>
                </div>
              </div>
            </div>
            {/* Progress bar */}
            {watching && (
              <div className="h-1 bg-white/10 mx-4 mb-3 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-amber-500 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            )}
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-400">{errorMsg}</p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {claimed ? (
              <motion.div key="claimed" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center py-2 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                <p className="font-bold text-foreground">+{REWARD_PER_AD} Credits Earned!</p>
                <p className="text-xs text-muted-foreground">{remaining} stream{remaining !== 1 ? "s" : ""} remaining today</p>
                {remaining > 0 && (
                  <Button size="sm" variant="outline" onClick={() => { setClaimed(false); setLocked(false); }} className="mt-1">
                    Watch Another
                  </Button>
                )}
              </motion.div>
            ) : (
              <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Button
                  className="w-full gap-2 font-bold"
                  disabled={locked || remaining <= 0 || loadingStatus}
                  onClick={startWatch}
                >
                  {watching ? (
                    <><Timer className="w-4 h-4 animate-spin" /> Streaming... ({countdown}s)</>
                  ) : remaining <= 0 ? (
                    <><AlertTriangle className="w-4 h-4" /> Daily Limit Reached</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Activate Stream (+{REWARD_PER_AD} Credits)</>
                  )}
                </Button>
                {remaining <= 0 && (
                  <p className="text-[10px] text-center text-muted-foreground mt-2">Resets at midnight. Check back tomorrow.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

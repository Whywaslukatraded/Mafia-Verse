import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tv, Coins, Clock, CircleCheck as CheckCircle2, Sparkles, X, TriangleAlert as AlertTriangle, Timer, Loader2, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSupabase, isSupabaseReady } from "@/lib/supabase";

const MAX_ADS_PER_DAY = 5;
const REWARD_PER_AD = 5;
const COUNTDOWN_SECONDS = 15;

const BILLBOARD_ADS_META = [
  {
    id: "item_shop",
    emoji: "🔥",
    gradient: "from-orange-500/20 via-amber-500/10 to-orange-600/20",
    border: "border-orange-500/30",
    accent: "text-orange-400",
    dot: "bg-orange-500",
  },
  {
    id: "buy_credits",
    emoji: "💼",
    gradient: "from-emerald-500/20 via-teal-500/10 to-emerald-600/20",
    border: "border-emerald-500/30",
    accent: "text-emerald-400",
    dot: "bg-emerald-500",
  },
  {
    id: "referral",
    emoji: "📣",
    gradient: "from-blue-500/20 via-indigo-500/10 to-blue-600/20",
    border: "border-blue-500/30",
    accent: "text-blue-400",
    dot: "bg-blue-500",
  },
  {
    id: "security",
    emoji: "🔒",
    gradient: "from-red-500/20 via-rose-500/10 to-red-600/20",
    border: "border-red-500/30",
    accent: "text-red-400",
    dot: "bg-red-500",
  },
];

interface AdRewardsProps {
  onClose: () => void;
  roomCode?: string;
}

export function AdRewards({ onClose, roomCode }: AdRewardsProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  // The 5/day limit is enforced server-side against the signed-in account, not
  // a client-generated sessionId — a sessionId resets the moment someone clears
  // localStorage or opens a new incognito tab, which was the actual loophole.
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const BILLBOARD_ADS = useMemo(() => BILLBOARD_ADS_META.map(ad => ({
    ...ad,
    title: t(`adRewards.billboards.${ad.id}.title`),
    body: t(`adRewards.billboards.${ad.id}.body`),
  })), [t]);
  const pickAdIndex = useCallback((excludeIndex?: number) => {
    if (BILLBOARD_ADS.length <= 1) return 0;
    let next = Math.floor(Math.random() * BILLBOARD_ADS.length);
    while (next === excludeIndex) {
      next = Math.floor(Math.random() * BILLBOARD_ADS.length);
    }
    return next;
  }, [BILLBOARD_ADS.length]);

  const [adIndex, setAdIndex] = useState(() => Math.floor(Math.random() * BILLBOARD_ADS.length));
  const selectedAd = BILLBOARD_ADS[adIndex];

  const [claimsToday, setClaimsToday] = useState(0);
  const [remaining, setRemaining] = useState(MAX_ADS_PER_DAY);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [watching, setWatching] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [claimed, setClaimed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      let attempts = 0;
      while (!isSupabaseReady() && attempts < 30) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      if (!isSupabaseReady() || cancelled) { setCheckingAuth(false); setLoadingStatus(false); return; }
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user?.id || null;
      const token = data.session?.access_token || null;
      if (cancelled) return;
      setSupabaseUserId(id);
      setAccessToken(token);
      setCheckingAuth(false);

      if (id && token) {
        fetch(`/api/ad-claim/status?supabaseUserId=${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(r => r.json())
          .then(data => {
            if (cancelled) return;
            setClaimsToday(data.claimsToday ?? 0);
            setRemaining(data.remaining ?? MAX_ADS_PER_DAY);
          })
          .catch(() => {})
          .finally(() => { if (!cancelled) setLoadingStatus(false); });
      } else {
        setLoadingStatus(false);
      }
    }
    loadSession();
    return () => { cancelled = true; };
  }, []);

  const startWatch = useCallback(() => {
    if (locked || watching || remaining <= 0 || !supabaseUserId || !accessToken) return;
    setAdIndex((prev) => pickAdIndex(prev));
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
        fetch("/api/ad-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ roomCode }),
        })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              setClaimed(true);
              setClaimsToday(data.claimsToday);
              setRemaining(data.remaining);
              if (data.totalCredits !== undefined) {
                try {
                  const s = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
                  s.credits = data.totalCredits;
                  localStorage.setItem("mafia_stats", JSON.stringify(s));
                  window.dispatchEvent(new Event("storage"));
                } catch {}
              }
            } else {
              setErrorMsg(data.message || t("adRewards.couldNotAward"));
            }
          })
          .catch(() => setErrorMsg(t("adRewards.networkError")))
          .finally(() => {
            setWatching(false);
            setLocked(false);
          });
      }
    }, 1000);
  }, [locked, watching, remaining, supabaseUserId, accessToken, roomCode, t, pickAdIndex]);

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
                <h2 className="text-lg font-bold text-foreground">{t("adRewards.title")}</h2>
                <p className="text-xs text-muted-foreground">{t("adRewards.subtitle", { count: REWARD_PER_AD })}</p>
              </div>
            </div>
            {!watching && (
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label={t("common.close")}>
                <X className="w-5 h-5" />
              </button>
            )}
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
              <p className="text-sm font-bold text-foreground">Sign up to watch and claim</p>
              <p className="text-xs text-muted-foreground">The daily limit is tied to your account so it can't be reset by clearing your browser.</p>
              <Button className="w-full" onClick={() => setLocation("/signup")}>
                Sign Up
              </Button>
            </div>
          ) : (
            <>
              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-500" />
                    <span className="text-xs text-muted-foreground">{t("adRewards.perStream")}</span>
                  </div>
                  <span className="text-sm font-bold text-amber-500">+{REWARD_PER_AD}</span>
                </div>
                <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <span className="text-xs text-muted-foreground">{t("adRewards.today")}</span>
                  </div>
                  <span className="text-sm font-bold">{`${claimsToday}/${MAX_ADS_PER_DAY}`}</span>
                </div>
              </div>

              {/* Countdown timer bar above billboard */}
              <div className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl border",
                watching ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/30 border-border"
              )}>
                <Timer className={cn("w-4 h-4", watching ? "text-amber-500 animate-spin" : "text-muted-foreground")} />
                <span className="text-xs font-mono font-bold flex-1">
                  {watching ? t("adRewards.streamingRemaining", { count: countdown }) : t("adRewards.readyToStream")}
                </span>
                {watching && (
                  <span className="text-xs font-black text-amber-500">{countdown}s</span>
                )}
              </div>

              {/* Premium Billboard */}
              <div className={cn(
                "relative rounded-2xl overflow-hidden border shadow-lg",
                selectedAd.border,
                `bg-gradient-to-br ${selectedAd.gradient}`,
                watching && "ring-2 ring-amber-500/40 shadow-amber-500/10"
              )}>
                {/* Billboard chrome */}
                <div className="flex items-center gap-2 px-4 pt-3 pb-1 border-b border-white/10">
                  <div className={cn("w-2 h-2 rounded-full animate-pulse", selectedAd.dot)} />
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">{t("adRewards.sponsored")}</span>
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
                      className="h-full w-full bg-amber-500 rounded-full origin-left"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: progressPct / 100 }}
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
                    <p className="font-bold text-foreground">{t("adRewards.creditsEarned", { count: REWARD_PER_AD })}</p>
                    <p className="text-xs text-muted-foreground">{t("adRewards.streamsRemaining", { count: remaining })}</p>
                    {remaining > 0 && (
                      <Button size="sm" variant="outline" onClick={() => { setClaimed(false); setLocked(false); }} className="mt-1">
                        {t("adRewards.watchAnother")}
                      </Button>
                    )}
                    {remaining <= 0 && (
                      <a
                        href="https://discord.gg/j5Vmfr5GF"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 mt-2 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                      >
                        🎉 {t("adRewards.discordPrompt")}
                      </a>
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
                        <><Timer className="w-4 h-4 animate-spin" /> {t("adRewards.streamingCountdown", { count: countdown })}</>
                      ) : remaining <= 0 ? (
                        <><AlertTriangle className="w-4 h-4" /> {t("adRewards.dailyLimitReached")}</>
                      ) : (
                        <><Sparkles className="w-4 h-4" /> {t("adRewards.activateStream", { count: REWARD_PER_AD })}</>
                      )}
                    </Button>
                    {remaining <= 0 && (
                      <p className="text-[10px] text-center text-muted-foreground mt-2">{t("adRewards.resetsAtMidnight")}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

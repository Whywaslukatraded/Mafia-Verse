import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Trophy, Target, Skull, TrendingUp, Flame, Settings, Users, Crown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSupabase, isSupabaseReady } from "@/lib/supabase";

const ACHIEVEMENTS = [
  { id: 'first_win', icon: '🩸' },
  { id: 'mafia_master', icon: '🍷' },
  { id: 'savior', icon: '💉' },
  { id: 'truth_seeker', icon: '🔍' },
  { id: 'survivor', icon: '🛡️' },
  { id: 'quick_thinker', icon: '⚡' },
  { id: 'ghost_whisperer', icon: '👻' },
  { id: 'night_owl', icon: '🦉' },
  { id: 'fashionista', icon: '👗' },
];

export default function Profile() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const safeParse = (key: string, fallback: any) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      if (typeof fallback === 'object' && fallback !== null) return JSON.parse(raw);
      return raw;
    } catch { return fallback; }
  };

  const [name] = useState(() => safeParse("mafia_profile_name", t("profile.unknownAgent")));
  // Bug fix: this page showed `name` from localStorage only, which never
  // reflects a logged-in account's actual name — it's just whatever was
  // typed into a room join form on this device, so a real account showed
  // "Unknown Agent" here even while properly signed in. dbName holds the
  // real synced name from the server (see sync-profile call below) and
  // takes priority over the localStorage fallback whenever we have one.
  const [dbName, setDbName] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (!isSupabaseReady()) return;
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      try {
        // POST, not a plain GET — this endpoint also upserts the users row
        // (see routes.ts), which is exactly what we want here too: it
        // keeps the row in sync even for someone who's been sitting on
        // this page since before a display-name change, not just at login.
        const res = await fetch("/api/auth/sync-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        if (typeof body.name === "string" && body.name) setDbName(body.name);
      } catch {}
    })();
  }, []);
  const [avatar] = useState(() => safeParse("mafia_profile_avatar", "👤"));
  const [config] = useState(() => safeParse("mafia_profile_config", { accessory: "None", clothing: "None", bg: "bg-primary/10" }));
  const [stats, setStats] = useState(() => {
    const raw = safeParse("mafia_stats", { wins: 0, gamesPlayed: 0, achievements: [], currentStreak: 0, bestStreak: 0 });
    return raw && typeof raw === "object" ? raw : { wins: 0, gamesPlayed: 0, achievements: [], currentStreak: 0, bestStreak: 0 };
  });
  const [dbCredits, setDbCredits] = useState<number | null>(null);

  // Bug fix: this page used to show `stats.wins` straight from localStorage,
  // which is only ever updated by the specific room/session that wrote it —
  // it doesn't reflect wins from other rooms or devices. The shop page shows
  // a DIFFERENT number on purpose (a spendable balance that goes down as you
  // buy win-gated cosmetics), which is correct for a currency but wrong for
  // a career stat, so this fetches the server's separate, never-decreasing
  // lifetime total instead of reusing that spendable one.
  const [dbTotalWins, setDbTotalWins] = useState<number | null>(null);
  const [dbGamesPlayed, setDbGamesPlayed] = useState<number | null>(null);
  const [dbMvpCount, setDbMvpCount] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      if (!isSupabaseReady()) return;
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch("/api/account/wins", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const body = await res.json();
        if (typeof body.totalWins === "number") setDbTotalWins(body.totalWins);
        if (typeof body.gamesPlayed === "number") setDbGamesPlayed(body.gamesPlayed);
        if (typeof body.mvpCount === "number") setDbMvpCount(body.mvpCount);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const onStorage = () => {
      const saved = localStorage.getItem("mafia_stats");
      if (saved) setStats(JSON.parse(saved));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Fetch credits from DB if we have a session
  useEffect(() => {
    const roomCodes = Object.keys(localStorage).filter(k => k.startsWith("mafia_session_"));
    if (roomCodes.length === 0) return;
    const lastRoom = roomCodes[roomCodes.length - 1];
    const roomCode = lastRoom.replace("mafia_session_", "");
    const sessionId = localStorage.getItem(lastRoom);
    if (!sessionId || !roomCode) return;
    fetch(`/api/players/${encodeURIComponent(sessionId)}/credits?roomCode=${roomCode}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && typeof data.credits === "number") setDbCredits(data.credits); })
      .catch(() => {});
  }, []);

  const credits = dbCredits !== null ? dbCredits : (stats.credits || 0);
  const displayWins = dbTotalWins !== null ? dbTotalWins : (stats.wins || 0);
  const displayGamesPlayed = dbGamesPlayed !== null ? dbGamesPlayed : (stats.gamesPlayed || 0);
  const losses = Math.max(0, displayGamesPlayed - displayWins);
  const winRate = displayGamesPlayed > 0 ? Math.round((displayWins / displayGamesPlayed) * 100) : 0;
  const mvpCount = dbMvpCount ?? 0;
  const earnedAchievements = new Set(stats.achievements || []);

  const ROLE_STATS = [
    { role: t("home.roles.mafias"), emoji: "🍷", statWins: "mafia_wins", statGames: "mafia_games", color: "text-red-400" },
    { role: t("home.roles.detectives"), emoji: "🔍", statWins: "detective_wins", statGames: "detective_games", color: "text-blue-400" },
    { role: t("home.roles.doctors"), emoji: "💉", statWins: "doctor_wins", statGames: "doctor_games", color: "text-green-400" },
    { role: t("home.roles.civilians"), emoji: "🛡️", statWins: "civilian_wins", statGames: "civilian_games", color: "text-yellow-400" },
    { role: t("home.roles.bodyguards"), emoji: "🥊", statWins: "bodyguard_wins", statGames: "bodyguard_games", color: "text-slate-300" },
    { role: t("home.roles.vigilantes"), emoji: "🔫", statWins: "vigilante_wins", statGames: "vigilante_games", color: "text-orange-400" },
    { role: t("home.roles.mayors"), emoji: "🎩", statWins: "mayor_wins", statGames: "mayor_games", color: "text-amber-400" },
    { role: t("home.roles.jesters"), emoji: "🃏", statWins: "jester_wins", statGames: "jester_games", color: "text-purple-400" },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-black font-serif uppercase tracking-wider text-foreground">{t("profile.title")}</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/friends")} className="rounded-full" data-testid="button-friends-nav">
              <Users className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setLocation("/settings")} className="rounded-full">
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Avatar Card */}
          <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 flex items-center gap-6">
            <div className={cn(
              "w-28 h-28 rounded-full border-2 border-primary/20 flex items-center justify-center text-5xl shadow-2xl shadow-primary/10 relative overflow-hidden flex-shrink-0",
              config.bg
            )}>
              <span className="relative z-10">{avatar}</span>
              {config.accessory !== "None" && <span className="absolute top-3 text-2xl z-30">{config.accessory}</span>}
              {config.clothing !== "None" && <span className="absolute bottom-3 text-2xl z-20 opacity-90">{config.clothing}</span>}
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight text-foreground">{dbName || name}</h2>
              <p className="text-muted-foreground text-sm font-mono uppercase tracking-widest mt-1">
                {t("profile.badgesCount", { earned: earnedAchievements.size, total: ACHIEVEMENTS.length })}
              </p>
              <div className="flex gap-2 mt-3">
                {winRate >= 60 && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t("profile.elite")}</span>}
                {stats.gamesPlayed >= 5 || displayGamesPlayed >= 5 ? <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t("profile.veteran")}</span> : null}
                {earnedAchievements.size >= 5 && <span className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t("profile.collector")}</span>}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Trophy, label: t("profile.wins"), value: displayWins, color: "text-yellow-500" },
              { icon: Skull, label: t("profile.losses"), value: losses, color: "text-red-500" },
              { icon: Target, label: t("profile.games"), value: displayGamesPlayed, color: "text-blue-500" },
              { icon: TrendingUp, label: t("profile.winPercent"), value: `${winRate}%`, color: "text-emerald-500" },
              { icon: Flame, label: t("profile.credits"), value: credits, color: "text-amber-500" },
              { icon: Crown, label: t("profile.mvpCount", "MVPs"), value: mvpCount, color: "text-yellow-400" },
            ].map(stat => (
              <div key={stat.label} className="bg-card/80 ring-1 ring-border rounded-xl p-3 flex flex-col items-center gap-1.5">
                <stat.icon className={cn("w-4 h-4", stat.color)} />
                <span className="text-2xl font-black font-mono">{stat.value}</span>
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Role Performance */}
          {displayGamesPlayed > 0 && (
            <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t("profile.rolePerformance")}</h3>
              <div className="grid grid-cols-2 gap-3">
                {ROLE_STATS.map(role => {
                  const roleWins = (stats as any)[role.statWins] || 0;
                  const roleGames = (stats as any)[role.statGames] || 0;
                  const roleWinRate = roleGames > 0 ? Math.round((roleWins / roleGames) * 100) : null;
                  return (
                    <div key={role.role} className="bg-muted/50 border border-border rounded-xl p-3 flex items-center gap-2">
                      <span className="text-2xl">{role.emoji}</span>
                      <div className="flex-1">
                        <p className={cn("text-sm font-bold", role.color)}>{role.role}</p>
                        {roleGames > 0 ? (
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {t("profile.roleRecord", { wins: roleWins, games: roleGames, rate: roleWinRate })}
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground/50 italic font-mono">{t("profile.roleNotPlayed")}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Streaks */}
          {((stats.currentStreak || 0) > 0 || (stats.bestStreak || 0) > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div className={cn("bg-card/80 ring-1 rounded-xl p-4 flex items-center gap-3",
                (stats.currentStreak || 0) >= 3 ? "ring-orange-500/40 bg-orange-950/20" : "ring-border")}>
                <motion.div animate={stats.currentStreak >= 3 ? { scale: [1, 1.2, 1] } : {}} transition={{ repeat: Infinity, duration: 1.5 }}>
                  <Flame className={cn("w-6 h-6", (stats.currentStreak || 0) >= 3 ? "text-orange-400" : "text-muted-foreground")} />
                </motion.div>
                <div>
                  <p className="text-2xl font-black font-mono">{stats.currentStreak || 0}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{t("profile.currentStreak")}</p>
                </div>
              </div>
              <div className="bg-card/80 ring-1 ring-border rounded-xl p-4 flex items-center gap-3">
                <Flame className="w-6 h-6 text-yellow-500" />
                <div>
                  <p className="text-2xl font-black font-mono">{stats.bestStreak || 0}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{t("profile.bestStreak")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Achievement Hall — 9 Badges */}
          <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t("profile.achievementHall")}</h3>
              <span className="text-[10px] font-bold text-muted-foreground font-mono">{earnedAchievements.size}/{ACHIEVEMENTS.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {ACHIEVEMENTS.map(ach => {
                const earned = earnedAchievements.has(ach.id);
                const achName = t(`home.achievements.${ach.id}.name`);
                const achDescription = t(`home.achievements.${ach.id}.description`);
                return (
                  <motion.div
                    key={ach.id}
                    whileHover={{ scale: 1.05 }}
                    className={cn(
                      "relative rounded-xl p-3 flex flex-col items-center gap-2 border transition-all cursor-default group",
                      earned
                        ? "bg-yellow-500/10 border-yellow-500/40 shadow-lg shadow-yellow-500/5"
                        : "bg-muted/30 border-border opacity-40 grayscale"
                    )}
                  >
                    <span className="text-3xl">{ach.icon}</span>
                    <div className="text-center">
                      <p className={cn("text-[10px] font-black uppercase tracking-tight leading-tight",
                        earned ? "text-yellow-400" : "text-muted-foreground")}>{achName}</p>
                    </div>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 p-2 bg-popover border border-border rounded-lg text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                      <p className={cn("font-bold uppercase mb-0.5", earned ? "text-yellow-400" : "text-muted-foreground")}>{achName}</p>
                      <p className="text-muted-foreground leading-tight">{achDescription}</p>
                      {!earned && <p className="text-muted-foreground/50 mt-1 italic">{t("profile.notYetUnlocked")}</p>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>
            {t("common.backToHome")}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

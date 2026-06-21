import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Trophy, Target, Skull, TrendingUp, Flame, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACHIEVEMENTS = [
  { id: 'first_win', name: 'First Blood', description: 'Win your first game', icon: '🩸' },
  { id: 'mafia_master', name: 'Don of the City', description: 'Win 5 games as Mafia', icon: '🍷' },
  { id: 'savior', name: 'Life Saver', description: 'Save 3 players as Doctor', icon: '💉' },
  { id: 'truth_seeker', name: 'Eagle Eye', description: 'Find 3 Mafia as Detective', icon: '🔍' },
  { id: 'survivor', name: 'Final Stand', description: 'Win as the last Civilian alive', icon: '🛡️' },
  { id: 'quick_thinker', name: 'Quick Thinker', description: 'Win a game with short phase durations', icon: '⚡' },
  { id: 'ghost_whisperer', name: 'Ghost Whisperer', description: 'Chat 50 times in spectator chat', icon: '👻' },
  { id: 'night_owl', name: 'Night Owl', description: 'Play 10 games during the night phase', icon: '🦉' }
];

export default function Profile() {
  const [, setLocation] = useLocation();

  const safeParse = (key: string, fallback: any) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      if (typeof fallback === 'object' && fallback !== null) return JSON.parse(raw);
      return raw;
    } catch { return fallback; }
  };

  const [name] = useState(() => safeParse("mafia_profile_name", "Unknown Agent"));
  const [avatar] = useState(() => safeParse("mafia_profile_avatar", "👤"));
  const [config] = useState(() => safeParse("mafia_profile_config", { accessory: "None", clothing: "None", bg: "bg-primary/10" }));
  const [stats, setStats] = useState(() => {
    const raw = safeParse("mafia_stats", { wins: 0, gamesPlayed: 0, achievements: [], currentStreak: 0, bestStreak: 0, credits: 0 });
    if (raw && typeof raw === "object") {
      raw.credits = 0;
      return raw;
    }
    return { wins: 0, gamesPlayed: 0, achievements: [], currentStreak: 0, bestStreak: 0, credits: 0 };
  });

  useEffect(() => {
    const onStorage = () => {
      const saved = localStorage.getItem("mafia_stats");
      if (saved) {
        const parsed = JSON.parse(saved);
        parsed.credits = 0;
        setStats(parsed);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const losses = Math.max(0, (stats.gamesPlayed || 0) - (stats.wins || 0));
  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
  const earnedAchievements = new Set(stats.achievements || []);

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
            <h1 className="text-2xl font-black font-serif uppercase tracking-wider text-foreground">Agent Profile</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setLocation("/settings")} className="rounded-full">
            <Settings className="w-5 h-5" />
          </Button>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Avatar Card */}
          <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 flex items-center gap-6">
            <div className={cn(
              "w-28 h-28 rounded-full border-2 border-primary/20 flex items-center justify-center text-5xl shadow-2xl shadow-primary/10 relative overflow-hidden flex-shrink-0",
              config.bg
            )}>
              <span className="relative z-10">{avatar}</span>
              {config.accessory !== "None" && (
                <span className="absolute top-3 text-2xl z-30">{config.accessory}</span>
              )}
              {config.clothing !== "None" && (
                <span className="absolute bottom-3 text-2xl z-20 opacity-90">{config.clothing}</span>
              )}
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight text-foreground">{name}</h2>
              <p className="text-muted-foreground text-sm font-mono uppercase tracking-widest mt-1">
                {earnedAchievements.size}/{ACHIEVEMENTS.length} Badges
              </p>
              <div className="flex gap-2 mt-3">
                {winRate >= 60 && (
                  <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Elite</span>
                )}
                {stats.gamesPlayed >= 5 && (
                  <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Veteran</span>
                )}
                {earnedAchievements.size >= 5 && (
                  <span className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Collector</span>
                )}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { icon: Trophy, label: "Wins", value: stats.wins || 0, color: "text-yellow-500" },
              { icon: Skull, label: "Losses", value: losses, color: "text-red-500" },
              { icon: Target, label: "Games", value: stats.gamesPlayed || 0, color: "text-blue-500" },
              { icon: TrendingUp, label: "Win %", value: `${winRate}%`, color: "text-emerald-500" },
              { icon: Flame, label: "Credits", value: stats.credits || 0, color: "text-amber-500" },
            ].map(stat => (
              <div key={stat.label} className="bg-card/80 ring-1 ring-border rounded-xl p-3 flex flex-col items-center gap-1.5">
                <stat.icon className={cn("w-4 h-4", stat.color)} />
                <span className="text-2xl font-black font-mono">{stat.value}</span>
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Role Statistics */}
          {stats.gamesPlayed > 0 && (
            <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Role Performance</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { role: "Mafia", emoji: "🍷", stat: "mafia_wins", color: "text-red-400" },
                  { role: "Detective", emoji: "🔍", stat: "detective_wins", color: "text-blue-400" },
                  { role: "Doctor", emoji: "💉", stat: "doctor_wins", color: "text-green-400" },
                  { role: "Civilian", emoji: "🛡️", stat: "civilian_wins", color: "text-yellow-400" },
                ].map(role => {
                  const roleWins = (stats as any)[role.stat] || 0;
                  return (
                    <div key={role.role} className="bg-muted/50 border border-border rounded-xl p-3 flex items-center gap-2">
                      <span className="text-2xl">{role.emoji}</span>
                      <div className="flex-1">
                        <p className={cn("text-sm font-bold", role.color)}>{role.role}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{roleWins} wins</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Feature 8: Streaks */}
          {((stats.currentStreak || 0) > 0 || (stats.bestStreak || 0) > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div className={cn(
                "bg-card/80 ring-1 rounded-xl p-4 flex items-center gap-3",
                (stats.currentStreak || 0) >= 3 ? "ring-orange-500/40 bg-orange-950/20" : "ring-border"
              )}>
                <motion.div
                  animate={stats.currentStreak >= 3 ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <Flame className={cn("w-6 h-6", (stats.currentStreak || 0) >= 3 ? "text-orange-400" : "text-muted-foreground")} />
                </motion.div>
                <div>
                  <p className="text-2xl font-black font-mono">{stats.currentStreak || 0}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Current Streak</p>
                </div>
              </div>
              <div className="bg-card/80 ring-1 ring-border rounded-xl p-4 flex items-center gap-3">
                <Flame className="w-6 h-6 text-yellow-500" />
                <div>
                  <p className="text-2xl font-black font-mono">{stats.bestStreak || 0}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Best Streak</p>
                </div>
              </div>
            </div>
          )}

          {/* Achievements */}
          <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Achievement Hall</h3>
            <div className="grid grid-cols-3 gap-3">
              {ACHIEVEMENTS.map(ach => {
                const earned = earnedAchievements.has(ach.id);
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
                      <p className={cn("text-[10px] font-black uppercase tracking-tight leading-tight", earned ? "text-yellow-400" : "text-muted-foreground")}>{ach.name}</p>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 p-2 bg-popover border border-border rounded-lg text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                      <p className={cn("font-bold uppercase mb-0.5", earned ? "text-yellow-400" : "text-muted-foreground")}>{ach.name}</p>
                      <p className="text-muted-foreground leading-tight">{ach.description}</p>
                      {!earned && <p className="text-muted-foreground/50 mt-1 italic">Not yet unlocked</p>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>
            Back to Home
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

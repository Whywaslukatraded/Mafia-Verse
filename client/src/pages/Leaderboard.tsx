import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Trophy, Target, TrendingUp, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface LeaderboardEntry {
  name: string;
  avatar: string | null;
  avatarConfig: any;
  wins: number;
  gamesPlayed: number;
  winRate: number;
}

export default function Leaderboard() {
  const [, setLocation] = useLocation();

  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard"],
  });

  const rankColor = (i: number) => {
    if (i === 0) return "text-yellow-400";
    if (i === 1) return "text-slate-300";
    if (i === 2) return "text-amber-600";
    return "text-muted-foreground";
  };

  const rankBg = (i: number) => {
    if (i === 0) return "ring-yellow-500/40 bg-yellow-500/5";
    if (i === 1) return "ring-slate-400/30 bg-slate-500/5";
    if (i === 2) return "ring-amber-600/30 bg-amber-600/5";
    return "ring-white/5";
  };

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-yellow-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-900/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black font-serif uppercase tracking-wider text-white">Hall of Infamy</h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-medium">Global Leaderboard</p>
          </div>
        </div>

        {/* Top 3 Podium */}
        {!isLoading && entries.length >= 3 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-center gap-3 mb-8">
            {/* 2nd */}
            <div className="flex flex-col items-center gap-2">
              <div className={cn("w-16 h-16 rounded-full flex items-center justify-center text-3xl border-2 border-slate-400/30 relative overflow-hidden", entries[1]?.avatarConfig?.bg || "bg-white/5")}>
                <span>{entries[1]?.avatar || "👤"}</span>
              </div>
              <div className="bg-slate-700/50 ring-1 ring-slate-400/30 rounded-xl px-3 py-2 text-center w-24 h-20 flex flex-col items-center justify-center">
                <span className="text-slate-300 font-black text-lg">2nd</span>
                <span className="text-xs font-bold text-white/80 truncate w-full text-center">{entries[1]?.name}</span>
                <span className="text-[10px] text-muted-foreground">{entries[1]?.wins}W</span>
              </div>
            </div>
            {/* 1st */}
            <div className="flex flex-col items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-400" />
              <div className={cn("w-20 h-20 rounded-full flex items-center justify-center text-4xl border-2 border-yellow-500/50 shadow-lg shadow-yellow-500/20 relative overflow-hidden", entries[0]?.avatarConfig?.bg || "bg-white/5")}>
                <span>{entries[0]?.avatar || "👤"}</span>
              </div>
              <div className="bg-yellow-500/10 ring-1 ring-yellow-500/40 rounded-xl px-3 py-2 text-center w-28 h-24 flex flex-col items-center justify-center">
                <span className="text-yellow-400 font-black text-xl">1st</span>
                <span className="text-sm font-bold text-white truncate w-full text-center">{entries[0]?.name}</span>
                <span className="text-[10px] text-yellow-400/70">{entries[0]?.wins}W · {entries[0]?.winRate}%</span>
              </div>
            </div>
            {/* 3rd */}
            <div className="flex flex-col items-center gap-2">
              <div className={cn("w-16 h-16 rounded-full flex items-center justify-center text-3xl border-2 border-amber-600/30 relative overflow-hidden", entries[2]?.avatarConfig?.bg || "bg-white/5")}>
                <span>{entries[2]?.avatar || "👤"}</span>
              </div>
              <div className="bg-amber-600/10 ring-1 ring-amber-600/30 rounded-xl px-3 py-2 text-center w-24 h-20 flex flex-col items-center justify-center">
                <span className="text-amber-600 font-black text-lg">3rd</span>
                <span className="text-xs font-bold text-white/80 truncate w-full text-center">{entries[2]?.name}</span>
                <span className="text-[10px] text-muted-foreground">{entries[2]?.wins}W</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Full Rankings */}
        <div className="space-y-2">
          <div className="grid grid-cols-4 px-3 mb-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold col-span-2">Player</span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold text-center flex items-center justify-center gap-1"><Trophy className="w-3 h-3" />Wins</span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold text-center flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" />Rate</span>
          </div>

          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))
          ) : entries.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-bold uppercase tracking-wider">No games played yet</p>
              <p className="text-sm mt-1 opacity-60">Play your first game to appear here!</p>
            </div>
          ) : (
            entries.map((entry, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl ring-1 transition-all",
                  rankBg(i)
                )}
              >
                <span className={cn("text-lg font-black w-6 text-center font-mono", rankColor(i))}>
                  {i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                </span>
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 relative overflow-hidden",
                  entry.avatarConfig?.bg || "bg-white/5"
                )}>
                  <span>{entry.avatar || "👤"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{entry.name}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Target className="w-3 h-3" /> {entry.gamesPlayed} games
                  </p>
                </div>
                <div className="text-center w-14">
                  <p className={cn("text-lg font-black font-mono", rankColor(i))}>{entry.wins}</p>
                </div>
                <div className="text-center w-14">
                  <p className="text-sm font-bold text-emerald-400">{entry.winRate}%</p>
                </div>
              </motion.div>
            ))
          )}
        </div>

        <Button variant="outline" className="w-full mt-6" onClick={() => setLocation("/")}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}

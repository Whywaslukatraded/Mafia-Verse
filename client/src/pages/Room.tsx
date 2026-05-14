import { useEffect, useState, useRef, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { Share2, LogOut, Timer, Volume2, VolumeX, Settings2, Plus, History, Ghost, Shield, User, Skull, Eye, CheckCircle2, Flame, Sparkles, Users, RotateCcw } from "lucide-react";
import { useGameSocket } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { PhaseIndicator } from "@/components/PhaseIndicator";
import { PlayerCard } from "@/components/PlayerCard";
import { RoleBadge } from "@/components/RoleBadge";
import { ChatWindow } from "@/components/ChatWindow";
import { MafiaHandbook } from "@/components/MafiaHandbook";
import { GameAudio } from "@/components/GameAudio";
import { useToast } from "@/hooks/use-toast";
import type { GameAction } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// --- Confetti ---
const CONFETTI_COLORS = ["#ffd700", "#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7", "#ff9ff3", "#54a0ff"];
function ConfettiPiece({ x, color, delay, duration, size, isRect }: any) {
  return (
    <motion.div
      style={{ position: "absolute", left: `${x}%`, top: -20, width: size, height: isRect ? size * 0.5 : size, backgroundColor: color, borderRadius: isRect ? 2 : "50%" }}
      initial={{ y: -20, rotate: 0, opacity: 1 }}
      animate={{ y: "110vh", rotate: 720, opacity: [1, 1, 1, 0] }}
      transition={{ duration, delay, ease: "linear" }}
    />
  );
}
function ConfettiEffect() {
  const pieces = useMemo(() => Array.from({ length: 100 }).map((_, i) => ({
    id: i, x: Math.random() * 100,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 2.5, duration: 2.5 + Math.random() * 2,
    size: 6 + Math.random() * 10, isRect: Math.random() > 0.5
  })), []);
  return (
    <div className="fixed inset-0 pointer-events-none z-[300] overflow-hidden">
      {pieces.map(p => <ConfettiPiece key={p.id} {...p} />)}
    </div>
  );
}

const DEATH_STORIES = [
  "{name} was skiing down the mountain and fell into a crevasse never to be seen again.",
  "As {name} was skydiving, his or her parachute didn't deploy and they were dead.",
  "{name} went for a swim in shark-infested waters and became a midnight snack.",
  "{name} tried to pet a stray 'cat' that turned out to be a very hungry mountain lion.",
  "{name} accidentally joined a high-stakes underground drag race with a golf cart.",
  "{name} mistook a high-voltage transformer for a public phone booth.",
  "While hunting for ghosts, {name} tripped and fell into a deep, forgotten well.",
  "{name} decided to challenge a professional wrestler to a 'friendly' match.",
  "A giant grand piano fell from the third floor, landing exactly on {name}.",
  "{name} tried to recreate a famous fire-breathing trick with high-proof rum.",
  "During a safari, {name} forgot that windows should stay rolled up around lions.",
  "{name} entered a pie-eating contest against a grizzly bear and lost spectacularly.",
  "A freak bowling accident sent {name} sliding down the lane and into the machinery.",
  "{name} thought they could outrun a swarm of angry hornets by jumping into a cactus.",
  "While taking a selfie on a cliff edge, {name} lost their balance and their phone.",
  "{name} tried to use a lawnmower to trim their hedges, with disastrous results.",
  "A experimental weather balloon landed directly on {name}'s tent during the night.",
  "{name} discovered that 'danger' signs on construction sites are not suggestions.",
  "While exploring an old cave, {name} woke up a colony of very territorial bats.",
  "{name} attempted to surf a tsunami on a piece of plywood."
];

export default function Room() {
  const [, params] = useRoute("/room/:code");
  const [, setLocation] = useLocation();
  const code = params?.code || null;
  const { toast } = useToast();

  const sessionId = localStorage.getItem(`mafia_session_${code}`);
  const { gameState, isConnected, sendAction, startGame } = useGameSocket(code, sessionId);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("mafia_sound_enabled");
    return saved !== null ? JSON.parse(saved) : true;
  });
  useEffect(() => {
    const syncSound = () => {
      const saved = localStorage.getItem("mafia_sound_enabled");
      setSoundEnabled(saved !== null ? JSON.parse(saved) : true);
    };
    syncSound();
    window.addEventListener("storage", syncSound);
    return () => window.removeEventListener("storage", syncSound);
  }, []);

  const [showRoleReveal, setShowRoleReveal] = useState(false);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [pendingNightAction, setPendingNightAction] = useState<{ targetId: number; targetName: string; actionType: string } | null>(null);
  const [lockedIn, setLockedIn] = useState(false);
  const [eliminationOverlay, setEliminationOverlay] = useState<{ name: string; role: string | null; avatar: string; deathStory?: string } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | undefined>(undefined);
  const [phaseStartTime, setPhaseStartTime] = useState<number>(Date.now());

  const prevPlayersRef = useRef<Record<number, boolean>>({});
  const prevWinsRef = useRef<number | null>(null);
  const shownEliminationsRef = useRef<Set<number>>(new Set());

  const me = gameState?.me;
  const room = gameState?.room;
  const players = gameState?.players || [];
  // Stable hash: only changes when alive states actually change (not on every broadcast)
  const aliveHash = players.map(p => `${p.id}:${p.isAlive ? 1 : 0}`).join(',');
  const isHost = me?.isHost;
  const isSpectator = me?.isSpectator;

  // Feature 6: Count watchers (spectators + dead players)
  const watcherCount = players.filter(p => p.isSpectator || !p.isAlive).length;

  // Background style based on phase
  const getBackgroundStyle = () => {
    if (!room) return "";
    if (room.status === "lobby") return "bg-background";
    if (room.status === "ended") return "bg-background";
    if (room.status === "night") {
      if (room.phase === "mafia") return "bg-[hsl(var(--bg-mafia))] transition-colors duration-1000";
      if (room.phase === "doctor") return "bg-[hsl(var(--bg-doctor))] transition-colors duration-1000";
      if (room.phase === "detective") return "bg-[hsl(var(--bg-detective))] transition-colors duration-1000";
      return "bg-[hsl(var(--bg-night))] transition-colors duration-1000";
    }
    return "bg-background transition-colors duration-1000";
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link copied!", description: "Send it to your friends." });
  };

  // Session check
  useEffect(() => {
    if (gameState && !sessionId && gameState.room.status === "lobby") {
      toast({ title: "Session not found", variant: "destructive" });
      setLocation("/");
    }
  }, [sessionId, setLocation, toast, gameState]);

  // Feature 8: Streak tracking + stats sync on game end
  useEffect(() => {
    if (gameState?.room.status === "ended" && me) {
      const currentWins = me.wins || 0;
      const stats = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
      const prevWins = prevWinsRef.current ?? stats.wins ?? 0;
      const won = currentWins > prevWins;

      const currentStreak = won ? ((stats.currentStreak || 0) + 1) : 0;
      const bestStreak = Math.max(stats.bestStreak || 0, currentStreak);

      const newStats = {
        wins: currentWins,
        gamesPlayed: me.gamesPlayed || 0,
        achievements: (me as any).achievements || [],
        currentStreak,
        bestStreak,
        mafia_wins: (stats.mafia_wins || 0) + (won && me.role === "mafia" ? 1 : 0),
        detective_wins: (stats.detective_wins || 0) + (won && me.role === "detective" ? 1 : 0),
        doctor_wins: (stats.doctor_wins || 0) + (won && me.role === "doctor" ? 1 : 0),
        civilian_wins: (stats.civilian_wins || 0) + (won && me.role === "civilian" ? 1 : 0),
      };
      localStorage.setItem("mafia_stats", JSON.stringify(newStats));
      window.dispatchEvent(new Event("storage"));
      prevWinsRef.current = currentWins;

      // Feature 10: Confetti for winners
      if (won && !showConfetti) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      }
    }
  }, [gameState?.room.status, me]);

  // Clear reactions when returning to lobby (game ended/replayed)
  useEffect(() => {
    if (gameState?.room.status === "lobby") {
      localStorage.removeItem("mafia_reactions");
      shownEliminationsRef.current.clear();
      prevPlayersRef.current = {}; // Reset alive tracking for fresh game
      setPendingNightAction(null);
    }
  }, [gameState?.room.status]);

  // Role reveal on first night (if enabled)
  useEffect(() => {
    if (room?.status === "night" && room?.turn === 1 && !hasRevealed && me?.role && (room.settings as any).showRoleReveal !== false) {
      setShowRoleReveal(true);
      setHasRevealed(true);
      setTimeout(() => setShowRoleReveal(false), 4000);
    }
  }, [room?.status, room?.turn, me?.role, hasRevealed, room?.settings]);

  // Reset night action state when phase changes
  useEffect(() => {
    setLockedIn(false);
    setPhaseStartTime(Date.now());
    // Only clear pending action when moving away from night phases, not when entering them
    if (room?.status !== "night") {
      setPendingNightAction(null);
    }
    // Dismiss elimination overlay when voting starts so players can vote
    if (room?.phase === "voting") {
      setEliminationOverlay(null);
    }
  }, [room?.phase, room?.status]);

  // Timer countdown
  useEffect(() => {
    if (!room || room.status === "lobby" || room.status === "ended") return;

    const getDuration = () => {
      const settings = room.settings as any;
      if (room.status === "night") {
        if (room.phase === "mafia") return settings.mafiaDuration || 30;
        if (room.phase === "doctor") return settings.doctorDuration || 15;
        if (room.phase === "detective") return settings.detectiveDuration || 20;
        return settings.phaseDuration || 30;
      }
      return settings.phaseDuration || 30;
    };

    const duration = getDuration();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - phaseStartTime) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      setTimeRemaining(remaining);
    }, 100);

    return () => clearInterval(interval);
  }, [room?.status, room?.phase, room?.settings, phaseStartTime]);

  // Feature 7: Detect eliminations (only show once per player per game)
  // Uses aliveHash so this only fires when alive states actually change, not on every broadcast
  useEffect(() => {
    if (!room || room.status === "lobby" || room.status === "ended") return;

    for (const p of players) {
      // First time we see this player — initialize without triggering overlay
      if (!(p.id in prevPlayersRef.current)) {
        prevPlayersRef.current[p.id] = p.isAlive;
        continue;
      }
      const wasAlive = prevPlayersRef.current[p.id];
      if (wasAlive && !p.isAlive && !shownEliminationsRef.current.has(p.id)) {
        shownEliminationsRef.current.add(p.id);
        const story = DEATH_STORIES[Math.floor(Math.random() * DEATH_STORIES.length)];
        const deathStory = story.replace("{name}", p.name);
        
        toast({
          title: `${p.name} has been eliminated`,
          description: deathStory,
          variant: "destructive",
        });

        setEliminationOverlay({
          name: p.name,
          role: p.role,
          avatar: p.avatar || "👤",
          deathStory,
        });
      }
      prevPlayersRef.current[p.id] = p.isAlive;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aliveHash]);

  // Auto-dismiss elimination overlay after 5 seconds or when voting starts
  useEffect(() => {
    if (!eliminationOverlay) return;
    const timeout = setTimeout(() => {
      setEliminationOverlay(null);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [eliminationOverlay]);

  // Dismiss overlay immediately when voting phase starts or game ends
  useEffect(() => {
    if ((room?.status === "day" && room?.phase === "voting") || room?.status === "ended") {
      setEliminationOverlay(null);
    }
  }, [room?.phase, room?.status]);

  if (!gameState || !room || !me) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-foreground">Connecting...</div>;
  }

  const getNightActionLabel = () => {
    if (room?.phase === "mafia") return { verb: "Kill", action: "killing" };
    if (room?.phase === "doctor") return { verb: "Protect", action: "protecting" };
    if (room?.phase === "detective") return { verb: "Investigate", action: "investigating" };
    return { verb: "Act", action: "acting" };
  };

  const isMyNightTurn = (room?.status === "night" && me.isAlive && (
    (room?.phase === "mafia" && me.role === "mafia") ||
    (room?.phase === "doctor" && me.role === "doctor") ||
    (room?.phase === "detective" && me.role === "detective")
  )) || false;

  const getPlayerButtonState = (targetId: number): { label: string; variant: any; action: GameAction; isNight: boolean } | null => {
    if (room?.status === "day" && room?.phase === "voting") {
      const hasVoted = (gameState as any)?.gameActions?.some((a: GameAction) => a.type === "vote" && (a as any).targetId === targetId);
      const isVoted = hasVoted;
      return {
        label: isVoted ? "Voted" : "Vote",
        variant: isVoted ? "secondary" : "default",
        action: { type: "vote", targetId } as GameAction,
        isNight: false,
      };
    }

    if (room?.status === "night") {
      if (room?.phase === "mafia" && me?.role === "mafia") {
        // Cannot kill fellow mafia members
        const target = players.find(p => p.id === targetId);
        if (target?.role === "mafia") return null;
        const isTargeted = pendingNightAction?.targetId === targetId;
        return {
          label: isTargeted ? "Selected" : "Select",
          variant: isTargeted ? "secondary" : "destructive",
          action: { type: "kill", targetId } as GameAction,
          isNight: true,
        };
      }
      if (room.phase === "doctor" && me.role === "doctor") {
        const isSelected = pendingNightAction?.targetId === targetId;
        return {
          label: isSelected ? "Selected" : "Select",
          variant: isSelected ? "secondary" : "default",
          action: { type: "heal", targetId } as GameAction,
          isNight: true,
        };
      }
      if (room.phase === "detective" && me.role === "detective") {
        const isSelected = pendingNightAction?.targetId === targetId;
        return {
          label: isSelected ? "Selected" : "Select",
          variant: isSelected ? "secondary" : "default",
          action: { type: "check", targetId } as GameAction,
          isNight: true,
        };
      }
    }
    return null;
  };

  const handleLockIn = () => {
    if (!pendingNightAction) return;
    const actionTypeMap: Record<string, GameAction["type"]> = { mafia: "kill", doctor: "heal", detective: "check" };
    const type = actionTypeMap[room.phase || ""] as GameAction["type"];
    if (!type) return;
    sendAction({ type, targetId: pendingNightAction.targetId } as GameAction);
    setLockedIn(true);
    toast({ title: "Action locked in!", description: `${getNightActionLabel().verb}ing ${pendingNightAction.targetName}...` });
  };

  const roomName = room.settings?.roomName;

  return (
    <div className={cn("min-h-screen pb-24 relative overflow-hidden transition-colors duration-1000", getBackgroundStyle())}>
      {/* Animated Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ opacity: room?.status === "night" ? 0.3 : 0.1, scale: room?.status === "night" ? 1.2 : 1 }}
          className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{ opacity: room?.status === "night" ? 0.2 : 0.05 }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/20 rounded-full blur-[120px]"
        />
      </div>

      {/* Confetti */}
      {showConfetti && <ConfettiEffect />}

      {/* Elimination Overlay */}
      <AnimatePresence>
        {room?.status === "ended" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-xl pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.8, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center max-w-2xl px-6 py-8"
            >
              {(() => {
                const aliveMafia = players.filter(p => p.isAlive && p.role === "mafia").length;
                const aliveCivilians = players.filter(p => p.isAlive && p.role !== "mafia").length;
                const mafiaWon = aliveMafia > 0;
                
                return (
                  <>
                    <div className={`text-8xl font-black mb-2 ${mafiaWon ? "text-red-500" : "text-green-500"}`}>
                      {mafiaWon ? "🔴 MAFIA" : "✨ CIVILIANS"}
                    </div>
                    <div className="text-5xl font-black mb-6 text-foreground">WINS!</div>
                    <div className="mb-8 text-muted-foreground text-lg font-semibold">
                      {mafiaWon 
                        ? `The Mafia took over with ${aliveMafia} member${aliveMafia !== 1 ? 's' : ''} remaining` 
                        : `The town eliminated all mafia!`}
                    </div>
                    
                    <div className="bg-muted/50 border border-border rounded-lg p-6 mb-6">
                      <h3 className="text-foreground font-black mb-4 uppercase tracking-wider text-sm">Final Roles Revealed</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {players.map((p) => (
                          <div key={p.id} className={`flex items-center gap-2 p-2 rounded-lg ${p.isAlive ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
                            <span className="text-2xl">{p.avatar || "👤"}</span>
                            <div className="text-left flex-1">
                              <div className="text-foreground font-bold text-sm">{p.name}</div>
                              <div className={`text-xs font-bold uppercase tracking-wider ${p.role === "mafia" ? "text-red-400" : p.role === "detective" ? "text-blue-400" : p.role === "doctor" ? "text-yellow-400" : "text-muted-foreground"}`}>
                                {p.role || "civilian"}
                              </div>
                            </div>
                            {!p.isAlive && <span className="text-red-500 font-black">✕</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    <Button 
                      onClick={() => sendAction({ type: "replay" } as any)} 
                      className="gap-2 px-10 py-4 text-lg font-black bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 border-2 border-purple-400 shadow-lg shadow-purple-500/50 animate-pulse"
                    >
                      <RotateCcw className="w-6 h-6" />
                      Play Again
                    </Button>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {eliminationOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 backdrop-blur-xl pointer-events-auto"
            onClick={() => setEliminationOverlay(null)}
          >
            <motion.div
              initial={{ scale: 0.5, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center max-w-xl px-6"
            >
              <div className="text-8xl mb-4">{eliminationOverlay.avatar}</div>
              <div className="text-sm font-black uppercase tracking-[0.4em] text-red-400 mb-2">Eliminated</div>
              <h2 className="text-4xl font-black text-foreground mb-2">{eliminationOverlay.name}</h2>
              {eliminationOverlay.role && (
                <div className="inline-block bg-muted/50 border border-border px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider text-muted-foreground capitalize mb-4">
                  was {eliminationOverlay.role}
                </div>
              )}
              {eliminationOverlay.deathStory && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-sm italic text-muted-foreground mt-4 leading-relaxed"
                >
                  {eliminationOverlay.deathStory}
                </motion.p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Role Reveal */}
      <AnimatePresence>
        {showRoleReveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-xl"
          >
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} className="text-center">
              <div className="mb-4 text-sm font-bold uppercase tracking-[0.4em] text-muted-foreground/60">Your Secret Identity</div>
              <motion.div
                animate={{ scale: [1, 1.1, 1], rotateY: [0, 360] }}
                transition={{ duration: 1.5 }}
              >
                <RoleBadge role={me?.role} className="text-4xl px-12 py-6 border-2 shadow-[0_0_50px_rgba(var(--primary),0.5)]" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="mt-8 text-xl font-serif text-muted-foreground max-w-xs mx-auto italic"
              >
                {me?.role === "mafia" ? "Operate in the shadows. Eliminate everyone else." :
                 me?.role === "detective" ? "Seek the truth. Find the Mafia." :
                 me?.role === "doctor" ? "Protect the innocent. Save a life tonight." :
                 "Stay vigilant. Survive the night."}
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {soundEnabled && <GameAudio phase={room.phase || ""} status={room.status} />}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              {/* Feature 9: Room name */}
              {roomName ? (
                <div>
                  <h1 className="font-serif font-bold text-lg tracking-wider text-primary leading-tight truncate">{roomName}</h1>
                  <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Room: {room.code}</p>
                </div>
              ) : (
                <h1 className="font-serif font-bold text-2xl tracking-wider text-primary">ROOM: {room.code}</h1>
              )}
            </div>
            <div className={`w-3 h-3 rounded-full flex-shrink-0 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${isConnected ? "bg-green-500 shadow-green-500/50" : "bg-red-500 shadow-red-500/50"}`} />
            {/* Feature 6: Spectator count */}
            {watcherCount > 0 && (
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-[10px] font-bold text-muted-foreground flex-shrink-0">
                <Eye className="w-3 h-3" />
                <span>{watcherCount}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setSoundEnabled(!soundEnabled)}>
              {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-400" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
            </Button>
            <MafiaHandbook />
            <Button variant="outline" size="sm" onClick={copyLink} className="gap-2">
              <Share2 className="w-3 h-3" />
              Share
            </Button>
            {isHost && room?.status === "lobby" && (
              <Button
                onClick={() => startGame()}
                disabled={players.length < 6}
                className="gap-2"
              >
                <Sparkles className="w-3 h-3" />
                Start Game
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="ml-auto">
              <LogOut className="w-4 h-4 text-red-400" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <PhaseIndicator status={room.status} phase={room.phase || ""} turn={room.turn || 1} timeRemaining={timeRemaining} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          <div className="lg:col-span-2 space-y-8">
            {room.status === "lobby" && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Waiting for Players
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">{players.length} / 6+ players</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {players.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 p-2 bg-muted/80 rounded-lg">
                        <span className="text-lg">{p.avatar}</span>
                        <span className="text-xs font-bold truncate">{p.name}</span>
                        {p.isHost && <span className="text-[10px] bg-primary/20 text-primary px-1 rounded">HOST</span>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {room?.status !== "lobby" && room?.status !== "ended" && (
              <div className="space-y-4">
                <div className="grid grid-cols-auto gap-3">
                  {players.map((p) => {
                    const buttonState = getPlayerButtonState(p.id);
                    return (
                      <PlayerCard
                        key={p.id}
                        player={p}
                        isMe={p.id === me?.id}
                        canInteract={!!buttonState && (me?.isAlive ?? false) && !isSpectator}
                        interactionLabel={buttonState?.label}
                        interactionVariant={buttonState?.variant}
                        onInteract={() => {
                          if (buttonState?.isNight) {
                            setPendingNightAction({
                              targetId: p.id,
                              targetName: p.name,
                              actionType: room?.phase || "",
                            });
                          } else if (buttonState?.action) {
                            sendAction(buttonState.action);
                          }
                        }}
                        revealedRole={room?.status === "ended" ? p.role : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Night Action Lock-In Section */}
            {room?.status !== "ended" && room?.status !== "lobby" && (
              <div className="sticky bottom-0 z-40 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent pt-6 pb-4 -mx-4 px-4">
                <AnimatePresence mode="wait">
                  {isMyNightTurn && !lockedIn ? (
                    <motion.div
                      key="lock-in-btn"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="flex gap-2"
                    >
                      <Button
                        onClick={() => setPendingNightAction(null)}
                        variant="outline"
                        className="flex-1"
                        disabled={!pendingNightAction}
                      >
                        Reset
                      </Button>
                      <Button
                        onClick={handleLockIn}
                        disabled={!pendingNightAction}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      >
                        Lock In
                      </Button>
                    </motion.div>
                  ) : isMyNightTurn && lockedIn ? (
                    <motion.div
                      key="locked-in"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-3"
                    >
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="text-emerald-400"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </motion.div>
                      <div>
                        <p className="text-sm font-black text-emerald-400 uppercase tracking-wider">Action Locked In</p>
                        <p className="text-xs text-muted-foreground">Waiting for other players...</p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="default-bar"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-muted-foreground hidden sm:block">Your Role</div>
                        <RoleBadge role={me.role} className="text-lg px-4 py-1.5" />
                      </div>
                      <div className="text-sm font-medium text-right">
                        {isSpectator && <span className="text-blue-400">Spectating...</span>}
                        {!isSpectator && room.status === "day" && room.phase === "voting" && "Vote to eliminate!"}
                        {!isSpectator && room.status === "night" && me.isAlive && "Night phase in progress..."}
                        {!isSpectator && !me.isAlive && <span className="text-red-500">You have been eliminated.</span>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {room.status === "ended" && (
              <>
                {isHost && (
                  <div className="flex gap-3 mb-6 justify-center">
                    <Button 
                      onClick={() => sendAction({ type: "replay" } as any)} 
                      className="gap-3 px-8 py-6 text-lg font-black bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 border-2 border-purple-400 shadow-lg hover:shadow-purple-500/50 animate-pulse"
                    >
                      <RotateCcw className="w-6 h-6" />
                      Play Again
                    </Button>
                  </div>
                )}
                <Card className="bg-slate-900/50 border-slate-800 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-xl font-serif">
                        <History className="w-5 h-5 text-primary" />
                        Game Chronicle
                      </CardTitle>
                      {(room.settings as any).showVoteResults !== false && (
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Vote Results visible</div>
                      )}
                    </div>
                  </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-6">
                      {(me as any)?.gameHistory?.map((entry: any, i: number) => (
                        <div key={i} className="space-y-3 p-4 bg-card/80 rounded-xl border border-border">
                          {entry.type === "game_end" ? (
                            <>
                              <h4 className="text-sm font-black uppercase tracking-widest text-yellow-400">
                                🎮 Game Ended - {entry.winner === 'mafia' ? '🔴 MAFIA WINS!' : '✨ CIVILIANS WIN!'}
                              </h4>
                              <div className="space-y-2 text-sm">
                                <div className="text-muted-foreground italic">Final Roles:</div>
                                {entry.roles?.map((role: any, j: number) => (
                                  <div key={j} className="flex items-center gap-2">
                                    <span className="font-bold text-foreground">{role.name}</span>
                                    <span className="text-muted-foreground">was</span>
                                    <span className={role.role === 'mafia' ? "text-red-400 font-bold" : "text-green-400 font-bold"}>
                                      {role.role}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <>
                              <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                                {entry.type === "night" ? `Night ${entry.turn}` : `Day ${entry.turn}`}
                              </h4>
                              <div className="space-y-2">
                                {entry.type === "vote" ? (
                                  (room.settings as any).showVoteResults !== false ? (
                                    entry.results.map((res: any, j: number) => (
                                      <div key={j} className="text-sm flex items-center gap-2">
                                        <User className="w-3 h-3 text-blue-400" />
                                        <span className="font-bold text-foreground">{res.voterName}</span>
                                        <span className="text-muted-foreground italic">voted for</span>
                                        <span className="font-bold text-red-400">{res.targetName}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-sm text-muted-foreground italic">Vote results hidden</div>
                                  )
                                ) : (
                                  entry.events.map((ev: any, j: number) => (
                                    <div key={j} className="text-sm flex items-center gap-2">
                                      {ev.type === "mafia_kill" ? <Skull className="w-3 h-3 text-red-500" /> :
                                       ev.type === "mafia_attempt" && ev.saved ? <Shield className="w-3 h-3 text-green-500" /> :
                                       <History className="w-3 h-3 text-blue-400" />}
                                      <span>
                                        {ev.type === "mafia_kill" ? `${ev.target} was eliminated.` :
                                         ev.type === "mafia_attempt" && ev.saved ? `${ev.target} was protected.` :
                                         ev.type === "detective_check" ? `The detective investigated ${ev.target}.` : ""}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
                </Card>
              </>
            )}
          </div>

          <div className="space-y-6">
            <ChatWindow
              messages={gameState?.messages || []}
              onSendMessage={(content) => sendAction({ type: "chat", content } as any)}
              currentPlayerId={me?.id || 0}
              isSpectator={isSpectator ?? false}
              players={players}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

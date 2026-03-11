import { useEffect, useState, useRef, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { Share2, LogOut, Timer, Volume2, VolumeX, Settings2, Plus, History, Ghost, Shield, User, Skull, Eye, CheckCircle2, Flame, Sparkles } from "lucide-react";
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

export default function Room() {
  const [, params] = useRoute("/room/:code");
  const [, setLocation] = useLocation();
  const code = params?.code || null;
  const { toast } = useToast();

  const sessionId = localStorage.getItem(`mafia_session_${code}`);
  const { gameState, isConnected, sendAction, startGame } = useGameSocket(code, sessionId);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showRoleReveal, setShowRoleReveal] = useState(false);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [pendingNightAction, setPendingNightAction] = useState<{ targetId: number; targetName: string; actionType: string } | null>(null);
  const [lockedIn, setLockedIn] = useState(false);
  const [eliminationOverlay, setEliminationOverlay] = useState<{ name: string; role: string | null; avatar: string } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const prevPlayersRef = useRef<Record<number, boolean>>({});
  const prevWinsRef = useRef<number | null>(null);

  const me = gameState?.me;
  const room = gameState?.room;
  const players = gameState?.players || [];
  const isHost = me?.isHost;
  const isSpectator = me?.isSpectator;

  // Feature 6: Count watchers (spectators + dead players)
  const watcherCount = players.filter(p => p.isSpectator || !p.isAlive).length;

  // Background style based on phase
  const getBackgroundStyle = () => {
    if (!room) return "";
    if (room.status === "lobby") return "bg-slate-950";
    if (room.status === "ended") return "bg-slate-950";
    if (room.status === "night") {
      if (room.phase === "mafia") return "bg-[hsl(var(--bg-mafia))] transition-colors duration-1000";
      if (room.phase === "doctor") return "bg-[hsl(var(--bg-doctor))] transition-colors duration-1000";
      if (room.phase === "detective") return "bg-[hsl(var(--bg-detective))] transition-colors duration-1000";
      return "bg-[hsl(var(--bg-night))] transition-colors duration-1000";
    }
    return "bg-slate-900 transition-colors duration-1000";
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

  // Role reveal on first night
  useEffect(() => {
    if (room?.status === "night" && room?.turn === 1 && !hasRevealed && me?.role) {
      setShowRoleReveal(true);
      setHasRevealed(true);
      setTimeout(() => setShowRoleReveal(false), 4000);
    }
  }, [room?.status, room?.turn, me?.role, hasRevealed]);

  // Reset night action state when phase changes
  useEffect(() => {
    setPendingNightAction(null);
    setLockedIn(false);
  }, [room?.phase, room?.status]);

  // Feature 7: Detect eliminations
  useEffect(() => {
    if (!room || room.status === "lobby" || room.status === "ended") return;
    const prev = prevPlayersRef.current;
    players.forEach(p => {
      if (prev[p.id] === true && p.isAlive === false) {
        setEliminationOverlay({ name: p.name, role: p.role, avatar: p.avatar || "👤" });
        setTimeout(() => setEliminationOverlay(null), 4000);
      }
    });
    const newMap: Record<number, boolean> = {};
    players.forEach(p => { newMap[p.id] = p.isAlive ?? true; });
    prevPlayersRef.current = newMap;
  }, [players, room?.status]);

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground animate-pulse">
        Connecting to game server...
      </div>
    );
  }

  const isMyNightTurn =
    room.status === "night" &&
    me?.isAlive &&
    !isSpectator &&
    ((room.phase === "mafia" && me.role === "mafia") ||
     (room.phase === "doctor" && me.role === "doctor") ||
     (room.phase === "detective" && me.role === "detective"));

  const getNightActionLabel = () => {
    if (room.phase === "mafia") return { verb: "Eliminate", icon: "🔪", color: "text-red-400" };
    if (room.phase === "doctor") return { verb: "Protect", icon: "💊", color: "text-emerald-400" };
    return { verb: "Investigate", icon: "🔍", color: "text-blue-400" };
  };

  const getInteraction = (targetId: number) => {
    if (!me || !room || !me.isAlive || me.id === targetId || isSpectator) return null;

    if (room.status === "day" && room.phase === "voting") {
      const isVoted = (me as any).currentAction?.vote === targetId;
      return {
        label: isVoted ? "Voted" : "Vote",
        variant: isVoted ? "secondary" : "default",
        action: { type: "vote", targetId } as GameAction,
        isNight: false,
      };
    }

    if (room.status === "night") {
      if (room.phase === "mafia" && me.role === "mafia") {
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
          animate={{ opacity: room?.status === "night" ? 0.3 : 0.1, scale: room?.status === "night" ? 1.2 : 1 }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/20 rounded-full blur-[120px]"
        />
        {room?.status === "night" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.05 }}
            className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"
          />
        )}
      </div>

      {/* Feature 10: Confetti */}
      <AnimatePresence>{showConfetti && <ConfettiEffect />}</AnimatePresence>

      {/* Feature 10: Win Banner */}
      <AnimatePresence>
        {showConfetti && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[350] text-center pointer-events-none"
          >
            <div className="bg-yellow-500/90 backdrop-blur-xl rounded-2xl px-8 py-4 shadow-2xl shadow-yellow-500/30 border border-yellow-400">
              <div className="text-4xl mb-1">🏆</div>
              <p className="text-black font-black text-2xl uppercase tracking-tight">Victory!</p>
              <p className="text-black/70 text-sm font-semibold">You won this round</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feature 7: Elimination Overlay */}
      <AnimatePresence>
        {eliminationOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-lg pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.7, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.7, opacity: 0 }}
              className="text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1], rotate: [0, -2, 2, 0] }}
                transition={{ duration: 0.8, repeat: 2 }}
                className="text-8xl mb-4"
              >{eliminationOverlay.avatar}</motion.div>
              <div className="text-sm font-black uppercase tracking-[0.4em] text-red-400 mb-2">Eliminated</div>
              <h2 className="text-4xl font-black text-white mb-2">{eliminationOverlay.name}</h2>
              {eliminationOverlay.role && (
                <div className="inline-block bg-white/10 border border-white/20 px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider text-white/80 capitalize">
                  was {eliminationOverlay.role}
                </div>
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
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl"
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
                className="mt-8 text-xl font-serif text-white/80 max-w-xs mx-auto italic"
              >
                {me?.role === "mafia" ? "Operate in the shadows. Eliminate everyone else." :
                 me?.role === "detective" ? "Seek the truth. Find the imposters." :
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
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Invite</span>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setLocation("/")} className="gap-2" data-testid="button-leave-room">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Leave</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <PhaseIndicator status={room.status} phase={room.phase || ""} turn={room.turn || 1} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          <div className="lg:col-span-2 space-y-8">
            {room.status === "lobby" && (
              <div className="text-center py-8">
                <div className="mb-8">
                  {/* Feature 9: Room name in lobby */}
                  {roomName && (
                    <div className="inline-block bg-primary/10 border border-primary/20 rounded-xl px-4 py-2 mb-4">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Room</p>
                      <p className="font-black text-xl text-primary font-serif">{roomName}</p>
                    </div>
                  )}
                  <h2 className="text-3xl font-bold mb-2">Waiting for players...</h2>
                  <p className="text-muted-foreground">{players.length} joined so far</p>
                </div>

                {isHost && (
                  <div className="mt-8 p-4 bg-white/5 rounded-xl border border-white/10 space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Timer className="w-4 h-4" /> Game Settings
                    </h3>
                    <div className="flex items-center justify-between text-sm">
                      <span>Phase Duration</span>
                      <span className="font-mono bg-black/40 px-2 py-0.5 rounded">{room.settings?.phaseDuration || 30}s</span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg border border-white/5">
                      <div className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-primary" />
                        <span className="font-bold">Custom Host Bar</span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => sendAction({ type: "skip" })}>Advance Phase</Button>
                        <Button variant="secondary" size="sm" onClick={() => sendAction({ type: "add_bots" })} className="gap-2">
                          <Plus className="w-4 h-4" /> Add Bots
                        </Button>
                      </div>
                    </div>
                    <Button size="lg" onClick={startGame} disabled={players.length < 6} className="w-full py-6 text-xl font-bold shadow-lg shadow-primary/20">
                      Start Game
                    </Button>
                    <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest">Host Controls Only</p>
                  </div>
                )}
              </div>
            )}

            {room.status === "ended" && (
              <Card className="bg-slate-900/50 border-slate-800 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl font-serif">
                    <History className="w-5 h-5 text-primary" />
                    Game Chronicle
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-6">
                      {(me as any)?.gameHistory?.map((entry: any, i: number) => (
                        <div key={i} className="space-y-3 p-4 bg-black/40 rounded-xl border border-white/5">
                          <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                            {entry.type === "night" ? `Night ${entry.turn}` : `Day ${entry.turn}`}
                          </h4>
                          <div className="space-y-2">
                            {entry.type === "vote" ? (
                              entry.results.map((res: any, j: number) => (
                                <div key={j} className="text-sm flex items-center gap-2">
                                  <User className="w-3 h-3 text-blue-400" />
                                  <span className="font-bold text-white/90">{res.voterName}</span>
                                  <span className="text-muted-foreground italic">voted for</span>
                                  <span className="font-bold text-red-400">{res.targetName}</span>
                                </div>
                              ))
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
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {room.status === "ended" && isHost && (
              <div className="mt-8 px-4">
                <Button size="lg" onClick={() => sendAction({ type: "replay" })} className="w-full py-6 text-xl font-bold bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20 animate-in fade-in zoom-in duration-300" data-testid="button-replay">
                  Play Again
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {players.map((player) => {
                const interaction = getInteraction(player.id);
                const isNightInteract = interaction?.isNight;
                return (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    isMe={player.id === me?.id}
                    canInteract={!!interaction}
                    interactionLabel={interaction?.label}
                    interactionVariant={interaction?.variant as any}
                    onInteract={() => {
                      if (!interaction) return;
                      if (isNightInteract) {
                        setPendingNightAction({ targetId: player.id, targetName: player.name, actionType: room.phase || "" });
                        setLockedIn(false);
                      } else {
                        sendAction(interaction.action);
                      }
                    }}
                    onRemove={() => sendAction({ type: "remove_bot", playerId: player.id })}
                    revealedRole={
                      room.status === "ended" || !player.isAlive
                        ? player.role
                        : (me?.role === "mafia" && player.role === "mafia" ? "Mafia" :
                           (me?.role === "detective" && (me as any).currentAction?.check === player.id ? (player.role === "mafia" ? "Mafia" : "Innocent") : null))
                    }
                  />
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-1">
            <ChatWindow
              messages={gameState.messages || []}
              onSendMessage={(content) => sendAction({ type: "chat", content })}
              currentPlayerId={me?.id}
              isSpectator={isSpectator || (me && !me.isAlive)}
              players={players}
            />
          </div>
        </div>
      </main>

      {/* Bottom Bar */}
      {me && room.status !== "lobby" && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border/50 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-40">
          <div className="max-w-5xl mx-auto px-4 py-3">
            {/* Feature 5: Night Action Confirmation */}
            <AnimatePresence mode="wait">
              {isMyNightTurn && !lockedIn ? (
                <motion.div
                  key="night-action"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex items-center gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn("text-xs font-black uppercase tracking-widest", getNightActionLabel().color)}>
                        {getNightActionLabel().icon} {getNightActionLabel().verb}
                      </span>
                    </div>
                    {pendingNightAction ? (
                      <p className="text-sm text-white font-semibold">
                        Target: <span className="text-primary">{pendingNightAction.targetName}</span>
                        <span className="text-muted-foreground text-xs ml-2">— select another player to change</span>
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Select a player from the grid above</p>
                    )}
                  </div>
                  {pendingNightAction && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300 }}>
                      <Button
                        onClick={handleLockIn}
                        className={cn(
                          "gap-2 font-black uppercase tracking-wider shadow-lg px-6",
                          room.phase === "mafia" ? "bg-red-600 hover:bg-red-500 shadow-red-500/30" :
                          room.phase === "doctor" ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/30" :
                          "bg-blue-600 hover:bg-blue-500 shadow-blue-500/30"
                        )}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Lock In
                      </Button>
                    </motion.div>
                  )}
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
        </div>
      )}
    </div>
  );
}

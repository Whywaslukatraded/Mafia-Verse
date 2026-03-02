import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Share2, Copy, LogOut, Timer, Volume2, VolumeX, Settings2, Plus, History, Ghost, Shield, User, Skull } from "lucide-react";
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

export default function Room() {
  const [, params] = useRoute("/room/:code");
  const [, setLocation] = useLocation();
  const code = params?.code || null;
  const { toast } = useToast();
  
  const sessionId = localStorage.getItem(`mafia_session_${code}`);
  const { gameState, isConnected, sendAction, startGame } = useGameSocket(code, sessionId);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link copied!", description: "Send it to your friends." });
  };

  useEffect(() => {
    if (gameState && !sessionId && gameState.room.status === 'lobby') {
      toast({ title: "Session not found", variant: "destructive" });
      setLocation("/");
    }
  }, [sessionId, setLocation, toast, gameState]);

  useEffect(() => {
    if (gameState?.room.status === 'ended' && me) {
      const stats = {
        wins: me.wins || 0,
        gamesPlayed: me.gamesPlayed || 0
      };
      localStorage.setItem("mafia_stats", JSON.stringify(stats));
      // Dispatch storage event for other tabs
      window.dispatchEvent(new Event('storage'));
    }
  }, [gameState?.room.status, me]);

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground animate-pulse">
        Connecting to game server...
      </div>
    );
  }

  const { room, players, me } = gameState;
  const isHost = me?.isHost;
  const isSpectator = me?.isSpectator;

  const [showRoleReveal, setShowRoleReveal] = useState(false);
  const [hasRevealed, setHasRevealed] = useState(false);

  useEffect(() => {
    if (room.status === 'night' && room.turn === 1 && !hasRevealed && me?.role) {
      setShowRoleReveal(true);
      setHasRevealed(true);
      setTimeout(() => setShowRoleReveal(false), 4000);
    }
  }, [room.status, room.turn, me?.role]);

  const getInteraction = (targetId: number) => {
    if (!me || !me.isAlive || me.id === targetId || isSpectator) return null;

    if (room.status === "day" && room.phase === "voting") {
      const isVoted = (me as any).currentAction?.vote === targetId;
      return { 
        label: isVoted ? "Voted" : "Vote", 
        variant: isVoted ? "secondary" : "default",
        action: { type: "vote", targetId } as GameAction 
      };
    }

    if (room.status === "night") {
      if (room.phase === "mafia" && me.role === "mafia") {
        const isTargeted = (me as any).currentAction?.kill === targetId;
        return { 
          label: isTargeted ? "Targeted" : "Eliminate", 
          variant: isTargeted ? "secondary" : "destructive",
          action: { type: "kill", targetId } as GameAction 
        };
      }
      if (room.phase === "doctor" && me.role === "doctor") {
        const isProtected = (me as any).currentAction?.heal === targetId;
        return { 
          label: isProtected ? "Protected" : "Heal", 
          variant: isProtected ? "secondary" : "default",
          action: { type: "heal", targetId } as GameAction 
        };
      }
      if (room.phase === "detective" && me.role === "detective") {
        return { 
          label: "Investigate", 
          variant: "default",
          action: { type: "check", targetId } as GameAction 
        };
      }
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AnimatePresence>
        {showRoleReveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center"
            >
              <div className="mb-4 text-sm font-bold uppercase tracking-[0.4em] text-muted-foreground/60">Your Secret Identity</div>
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                  rotateY: [0, 360],
                }}
                transition={{ duration: 1.5, repeat: 0 }}
              >
                <RoleBadge role={me?.role} className="text-4xl px-12 py-6 border-2 shadow-[0_0_50px_rgba(var(--primary),0.5)]" />
              </motion.div>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="mt-8 text-xl font-serif text-white/80 max-w-xs mx-auto italic"
              >
                {me?.role === 'mafia' ? "Operate in the shadows. Eliminate everyone else." : 
                 me?.role === 'detective' ? "Seek the truth. Find the imposters." :
                 me?.role === 'doctor' ? "Protect the innocent. Save a life tonight." :
                 "Stay vigilant. Survive the night."}
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {soundEnabled && <GameAudio phase={room.phase || ""} status={room.status} />}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-serif font-bold text-2xl tracking-wider text-primary">ROOM: {room.code}</h1>
            <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] ${isConnected ? "bg-green-500 shadow-green-500/50" : "bg-red-500 shadow-red-500/50"}`} />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSoundEnabled(!soundEnabled)} className="hover-elevate">
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
                        <Button variant="outline" size="sm" onClick={() => sendAction({ type: 'skip' })}>Advance Phase</Button>
                        <Button variant="secondary" size="sm" onClick={() => sendAction({ type: 'add_bots' })} className="gap-2">
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
                            {entry.type === 'night' ? `Night ${entry.turn}` : `Day ${entry.turn}`}
                          </h4>
                          <div className="space-y-2">
                            {entry.type === 'vote' ? (
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
                                  {ev.type === 'mafia_kill' ? <Skull className="w-3 h-3 text-red-500" /> : 
                                   ev.type === 'mafia_attempt' && ev.saved ? <Shield className="w-3 h-3 text-green-500" /> :
                                   <History className="w-3 h-3 text-blue-400" />}
                                  <span>
                                    {ev.type === 'mafia_kill' ? `${ev.target} was eliminated.` :
                                     ev.type === 'mafia_attempt' && ev.saved ? `An attempt was made on ${ev.target}, but they were protected.` :
                                     ev.type === 'detective_check' ? `The detective investigated ${ev.target}.` : ''}
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
                <Button size="lg" onClick={() => sendAction({ type: 'replay' })} className="w-full py-6 text-xl font-bold bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20 animate-in fade-in zoom-in duration-300" data-testid="button-replay">
                  Play Again
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {players.map((player) => {
                const interaction = getInteraction(player.id);
                return (
                    <PlayerCard
                      key={player.id}
                      player={player}
                      isMe={player.id === me?.id}
                      canInteract={!!interaction}
                      interactionLabel={interaction?.label}
                      interactionVariant={interaction?.variant as any}
                      onInteract={() => interaction && sendAction(interaction.action)}
                      onRemove={() => sendAction({ type: 'remove_bot', playerId: player.id })}
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
              onSendMessage={(content) => sendAction({ type: 'chat', content })} 
              currentPlayerId={me?.id} 
              isSpectator={isSpectator || (me && !me.isAlive)}
            />
          </div>
        </div>
      </main>

      {me && room.status !== "lobby" && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border/50 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-40">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground hidden sm:block">Your Role</div>
              <RoleBadge role={me.role} className="text-lg px-4 py-1.5" />
            </div>
            <div className="text-sm font-medium text-right">
              {isSpectator && <span className="text-blue-400">Spectating...</span>}
              {!isSpectator && room.status === "day" && room.phase === "voting" && "Vote to eliminate!"}
              {!isSpectator && room.status === "night" && me.isAlive && "Wait for night actions..."}
              {!isSpectator && !me.isAlive && <span className="text-red-500">You have been eliminated.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

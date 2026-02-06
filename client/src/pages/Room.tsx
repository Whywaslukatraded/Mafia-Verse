import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Share2, Copy, LogOut, Timer, Volume2, VolumeX, Settings2, Plus } from "lucide-react";
import { useGameSocket } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { PhaseIndicator } from "@/components/PhaseIndicator";
import { PlayerCard } from "@/components/PlayerCard";
import { RoleBadge } from "@/components/RoleBadge";
import { ChatWindow } from "@/components/ChatWindow";
import { MafiaHandbook } from "@/components/MafiaHandbook";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GameAction } from "@shared/schema";

export default function Room() {
  const [, params] = useRoute("/room/:code");
  const [, setLocation] = useLocation();
  const code = params?.code || null;
  const { toast } = useToast();
  
  // Get session from storage
  const sessionId = localStorage.getItem(`mafia_session_${code}`);
  
  const { gameState, isConnected, sendAction, startGame } = useGameSocket(code, sessionId);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link copied!", description: "Send it to your friends." });
  };

  // Redirect if missing session
  useEffect(() => {
    if (gameState && !sessionId && gameState.room.status === 'lobby') {
      toast({ title: "Session not found", variant: "destructive" });
      setLocation("/");
    }
  }, [sessionId, setLocation, toast, gameState]);

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

  // Interaction Logic
  const getInteraction = (targetId: number) => {
    if (!me || !me.isAlive || me.id === targetId || isSpectator) return null;

    // Day Voting
    if (room.status === "day" && room.phase === "voting") {
      return { label: "Vote", action: { type: "vote", targetId } as GameAction };
    }

    // Night Actions
    if (room.status === "night") {
      if (room.phase === "mafia" && me.role === "mafia") {
        return { label: "Eliminate", action: { type: "kill", targetId } as GameAction };
      }
      if (room.phase === "doctor" && me.role === "doctor") {
        // Doctors can self-heal usually, but logic depends on rules. Assume they can target anyone for now.
        return { label: "Heal", action: { type: "heal", targetId } as GameAction };
      }
      if (room.phase === "detective" && me.role === "detective") {
        return { label: "Investigate", action: { type: "check", targetId } as GameAction };
      }
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-serif font-bold text-2xl tracking-wider text-primary">ROOM: {room.code}</h1>
            <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] ${isConnected ? "bg-green-500 shadow-green-500/50" : "bg-red-500 shadow-red-500/50"}`} />
          </div>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="hover-elevate"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-blue-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
            <MafiaHandbook />
            <Button variant="outline" size="sm" onClick={copyLink} className="gap-2">
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Invite</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Game Phase Header */}
        <PhaseIndicator status={room.status} phase={room.phase || ""} turn={room.turn || 1} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          {/* Main Game Area */}
          <div className="lg:col-span-2 space-y-8">
            {/* Lobby Controls */}
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
                    <Button 
                      size="lg" 
                      onClick={startGame}
                      disabled={players.length < 6}
                      className="w-full py-6 text-xl font-bold shadow-lg shadow-primary/20"
                    >
                      Start Game
                    </Button>
                    <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest">Host Controls Only</p>
                  </div>
                )}
              </div>
            )}

            {/* Player Grid */}
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
                    onInteract={() => interaction && sendAction(interaction.action)}
                    onRemove={() => sendAction({ type: 'remove_bot', playerId: player.id })}
                    revealedRole={
                      room.status === "ended" || !player.isAlive 
                        ? player.role 
                        : (me?.role === "mafia" && player.role === "mafia" ? "Mafia" : null)
                    }
                  />
                );
              })}
            </div>
          </div>

          {/* Chat Sidebar */}
          <div className="lg:col-span-1">
            <ChatWindow 
              messages={gameState.messages || []} 
              onSendMessage={(content) => sendAction({ type: 'chat', content })}
              currentPlayerId={me?.id}
            />
          </div>
        </div>
      </main>

      {/* Bottom Floating Bar - My Role */}
      {me && room.status !== "lobby" && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border/50 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-40">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground hidden sm:block">Your Role</div>
              <RoleBadge role={me.role} className="text-lg px-4 py-1.5" />
            </div>
            
            {/* Status Message */}
            <div className="text-sm font-medium text-right">
              {isSpectator && <span className="text-blue-400">Spectating...</span>}
              {!isSpectator && room.status === "day" && room.phase === "voting" && "Vote to eliminate!"}
              {!isSpectator && room.status === "night" && me.isAlive && "Wait for night actions..."}
              {!isSpectator && !me.isAlive && <span className="text-red-500">You are eliminated.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

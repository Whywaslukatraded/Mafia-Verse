import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessageSquare, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const QUICK_MESSAGES = [
  "I suspect {name}...",
  "I am innocent!",
  "Who is the Mafia?",
  "I trust {name}.",
  "Don't vote me!",
  "Let's skip.",
  "I have a bad feeling...",
  "Look at the evidence!"
];

const REACTION_EMOTES = ["😂", "🤔", "👀", "😱", "👍", "❤️", "🎉", "🔥"];

interface ChatWindowProps {
    messages: Message[];
    onSendMessage: (content: string) => void;
    currentPlayerId?: number;
    isSpectator?: boolean;
    players?: any[];
}

type Reactions = Record<number, Record<string, Set<number>>>;

export function ChatWindow({ messages, onSendMessage, currentPlayerId, isSpectator, players = [] }: ChatWindowProps) {
    const [input, setInput] = useState("");
    const [messageCount, setMessageCount] = useState(0);
    const [reactions, setReactions] = useState<Reactions>({});
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastSentRef = useRef<HTMLDivElement>(null);

    const filteredMessages = messages.filter(msg => {
        if (isSpectator) return true;
        return !msg.isSpectator;
    });

    // Persist reactions in localStorage to survive state updates
    useEffect(() => {
        if (Object.keys(reactions).length > 0) {
            localStorage.setItem("mafia_reactions", JSON.stringify(reactions));
        }
    }, [reactions]);

    // Restore reactions from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem("mafia_reactions");
        if (saved) {
            try {
                const restored = JSON.parse(saved);
                setReactions(restored);
            } catch (e) {
                console.error("Failed to restore reactions", e);
            }
        }
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [filteredMessages]);

    // Smooth scroll to last sent message
    useEffect(() => {
        if (lastSentRef.current) {
            lastSentRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }, [filteredMessages.length]);

    const getPlayerColor = (playerId: number) => {
        const player = players.find(p => p.id === playerId);
        if (!player) return "text-primary/80";
        if (!player.isAlive) return "text-gray-500";
        if (player.role === "mafia") return "text-red-400";
        if (player.role === "detective") return "text-blue-400";
        if (player.role === "doctor") return "text-green-400";
        return "text-primary/80";
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim()) {
            onSendMessage(input);
            setInput("");
            
            if (isSpectator) {
                const newCount = messageCount + 1;
                setMessageCount(newCount);
                if (newCount === 50) {
                    const stats = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
                    const achievements = new Set(stats.achievements || []);
                    if (!achievements.has('ghost_whisperer')) {
                        achievements.add('ghost_whisperer');
                        localStorage.setItem("mafia_stats", JSON.stringify({ ...stats, achievements: Array.from(achievements) }));
                        window.dispatchEvent(new Event('storage'));
                    }
                }
            }
        }
    };

    const handleQuickMessage = (msg: string) => {
      onSendMessage(msg);
    };

    const addReaction = (messageId: number, emote: string) => {
      setReactions(prev => {
        const newReactions = { ...prev };
        if (!newReactions[messageId]) {
          newReactions[messageId] = {};
        }
        if (!newReactions[messageId][emote]) {
          newReactions[messageId][emote] = new Set();
        }
        newReactions[messageId][emote].add(currentPlayerId || 0);
        return newReactions;
      });
    };

    const removeReaction = (messageId: number, emote: string) => {
      setReactions(prev => {
        const newReactions = { ...prev };
        if (newReactions[messageId]?.[emote]) {
          newReactions[messageId][emote].delete(currentPlayerId || 0);
          if (newReactions[messageId][emote].size === 0) {
            delete newReactions[messageId][emote];
          }
        }
        return newReactions;
      });
    };

    const toggleReaction = (messageId: number, emote: string) => {
      if (reactions[messageId]?.[emote]?.has(currentPlayerId || 0)) {
        removeReaction(messageId, emote);
      } else {
        addReaction(messageId, emote);
      }
    };

    return (
        <div className="flex flex-col h-[400px] border rounded-lg bg-card overflow-hidden">
            <div className="p-3 border-b bg-muted/50 font-semibold text-sm uppercase tracking-wider flex justify-between items-center">
                <span>{isSpectator ? "Spectator Chat" : "Room Chat"}</span>
                {isSpectator && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">SECRET</span>}
            </div>
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                    {filteredMessages.map((msg, idx) => (
                        <div
                            key={msg.id}
                            ref={idx === filteredMessages.length - 1 && msg.playerId === currentPlayerId ? lastSentRef : null}
                            className={`flex flex-col group ${
                                msg.playerId === currentPlayerId ? "items-end" : "items-start"
                            }`}
                        >
                            <div className={`flex items-center gap-2 mb-1 ${
                                msg.playerId === currentPlayerId ? "flex-row-reverse" : "flex-row"
                            }`}>
                                <span className={cn(
                                    "text-[10px] font-black uppercase tracking-tighter bg-white/5 px-1.5 py-0.5 rounded border border-white/5 group-hover:bg-white/10 transition-colors",
                                    msg.isSpectator ? "text-blue-400 border-blue-400/20" : getPlayerColor(msg.playerId)
                                )}>
                                    {msg.playerName} {msg.isSpectator && "👻"}
                                    {!msg.isSpectator && (
                                        <span className="ml-1 text-[9px] opacity-60">
                                            {(() => {
                                                const p = players.find(pl => pl.id === msg.playerId);
                                                if (!p) return "";
                                                if (!p.isAlive) return "🪦";
                                                if (p.role === "mafia") return "🍷";
                                                if (p.role === "detective") return "🔍";
                                                if (p.role === "doctor") return "💉";
                                                return "🛡️";
                                            })()}
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className={`flex items-end gap-2 ${msg.playerId === currentPlayerId ? "flex-row-reverse" : "flex-row"}`}>
                              <div
                                  className={cn(
                                      "px-3 py-2 rounded-2xl max-w-[85%] text-sm shadow-sm transition-transform group-hover:scale-[1.02]",
                                      msg.playerId === currentPlayerId
                                          ? (msg.isSpectator ? "bg-blue-600 text-white rounded-tr-none" : "bg-primary text-primary-foreground rounded-tr-none")
                                          : (msg.isSpectator ? "bg-slate-800 text-blue-200 rounded-tl-none border border-blue-500/20" : "bg-muted text-muted-foreground rounded-tl-none border border-white/5")
                                  )}
                              >
                                  {msg.content}
                              </div>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                  >
                                    <Smile className="w-3.5 h-3.5" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-fit p-2 bg-slate-900 border-slate-800 shadow-2xl z-50" side="top">
                                  <div className="flex gap-1">
                                    {REACTION_EMOTES.map(emote => (
                                      <button
                                        key={emote}
                                        onClick={() => toggleReaction(msg.id, emote)}
                                        className="text-lg hover:scale-125 transition-transform p-1"
                                      >
                                        {emote}
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                            {reactions[msg.id] && Object.keys(reactions[msg.id]).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5 px-1">
                                {Object.entries(reactions[msg.id]).map(([emote, reactors]) => (
                                  <button
                                    key={emote}
                                    onClick={() => toggleReaction(msg.id, emote)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs transition-colors group"
                                    title={`Reacted by ${reactors.size} player${reactors.size !== 1 ? 's' : ''}`}
                                  >
                                    <span>{emote}</span>
                                    {reactors.size > 0 && <span className="text-[10px] text-muted-foreground font-semibold">{reactors.size}</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>
                    ))}
                </div>
            </ScrollArea>
      <div className="p-3 border-t bg-muted/30 flex flex-col gap-2">
        <form onSubmit={handleSubmit} className="flex gap-2" title={isSpectator || !currentPlayerId ? "The dead cannot speak" : ""}>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="shrink-0 h-10 w-10" disabled={isSpectator || !currentPlayerId}>
                <MessageSquare className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2 bg-slate-900 border-slate-800 shadow-2xl z-50" side="top" align="start">
              <div className="grid grid-cols-1 gap-1">
                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-white/5 mb-1">Tactical Comms</div>
                {QUICK_MESSAGES.map((msg) => (
                  <Button
                    key={msg}
                    variant="ghost"
                    size="sm"
                    className="justify-start h-8 text-xs font-medium hover:bg-primary/20 hover:text-primary transition-colors truncate"
                    onClick={() => {
                      if (msg.includes("{name}")) {
                        // For messages needing a name, we just pick a random alive player for simplicity in the quick wheel
                        // but usually a sub-menu would be better. For MVP fast-mode, we'll just use the base string
                        // or pick a random alive opponent
                        const targets = players.filter(p => p.id !== currentPlayerId && p.isAlive);
                        const target = targets[Math.floor(Math.random() * targets.length)];
                        handleQuickMessage(msg.replace("{name}", target?.name || "someone"));
                      } else {
                        handleQuickMessage(msg);
                      }
                    }}
                  >
                    {msg.replace("{name}", "...")}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isSpectator || !currentPlayerId ? "Dead players cannot speak..." : "Type a message..."}
            className="bg-background h-10"
            disabled={isSpectator || !currentPlayerId}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || isSpectator || !currentPlayerId} className="shrink-0 h-10 w-10">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

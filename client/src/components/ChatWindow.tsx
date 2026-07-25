import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessageSquare, Smile, Ghost } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Message } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { containsProfanity } from "@/lib/profanity";
import { useToast } from "@/hooks/use-toast";

const REACTION_EMOTES = ["😂", "🤔", "👀", "😱", "👍", "❤️", "🎉", "🔥"];

interface ChatWindowProps {
    messages: Message[];
    onSendMessage: (content: string) => void;
    currentPlayerId?: number;
    isSpectator?: boolean;
    players?: any[];
    notify?: (title: string, options?: NotificationOptions) => void;
}

type Reactions = Record<number, Record<string, Set<number>>>;

export function ChatWindow({ messages, onSendMessage, currentPlayerId, isSpectator, players = [], notify }: ChatWindowProps) {
    const { t } = useTranslation();
    // Quick chat templates live in translation files so the messages sent match
    // whichever language the sender has selected.
    const QUICK_MESSAGES = t("chat.quickMessages", { returnObjects: true }) as string[];

    const [input, setInput] = useState("");
    const [messageCount, setMessageCount] = useState(0);
    const [reactions, setReactions] = useState<Reactions>({});
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastSentRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();
    // isSpectator here means "in the graveyard" (dead OR joined as a true
    // spectator) — Room.tsx passes true for both. They see the living
    // chat read-only plus their own private graveyard chat they can post to.
    const [activeTab, setActiveTab] = useState<"game" | "graveyard">("game");

    const gameMessages = messages.filter(msg => !msg.isSpectator);
    const graveyardMessages = messages.filter(msg => msg.isSpectator);
    const filteredMessages = isSpectator
        ? (activeTab === "graveyard" ? graveyardMessages : gameMessages)
        : gameMessages;

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

    // Track previous message count for notifications
    const prevMessagesRef = useRef<Message[]>([]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        // Notify on new messages from other players
        const prevIds = new Set(prevMessagesRef.current.map(m => m.id));
        const newMessages = filteredMessages.filter(m => !prevIds.has(m.id) && m.playerId !== currentPlayerId && !m.isSpectator);
        if (newMessages.length > 0 && notify) {
            const latest = newMessages[newMessages.length - 1];
            notify(`${latest.playerName}: ${latest.content.length > 40 ? latest.content.slice(0, 40) + "..." : latest.content}`);
        }
        prevMessagesRef.current = filteredMessages;
    }, [filteredMessages, currentPlayerId, notify]);

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
        const trimmed = input.trim();
        if (!trimmed) return;
        if (containsProfanity(trimmed)) {
            toast({
                title: t("chat.messageBlocked"),
                description: t("chat.inappropriateLanguage"),
                variant: "destructive",
            });
            return;
        }
        onSendMessage(trimmed);
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
    };

    const handleQuickMessage = (msg: string) => {
        if (containsProfanity(msg)) {
            toast({
                title: t("chat.messageBlocked"),
                description: t("chat.inappropriateLanguage"),
                variant: "destructive",
            });
            return;
        }
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
            <div className="border-b bg-muted/50">
                {isSpectator ? (
                    <div className="flex">
                        <button
                            type="button"
                            onClick={() => setActiveTab("game")}
                            className={cn(
                                "flex-1 p-3 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors border-b-2",
                                activeTab === "game" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                            {t("chat.roomChat")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("graveyard")}
                            className={cn(
                                "flex-1 p-3 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors border-b-2",
                                activeTab === "graveyard" ? "border-blue-400 text-blue-400" : "border-transparent text-muted-foreground hover:text-blue-400"
                            )}
                        >
                            <Ghost className="w-3.5 h-3.5" />
                            {t("chat.graveyardChat")}
                            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{t("chat.secret")}</span>
                        </button>
                    </div>
                ) : (
                    <div className="p-3 font-semibold text-sm uppercase tracking-wider flex justify-between items-center">
                        <span>{t("chat.roomChat")}</span>
                    </div>
                )}
            </div>
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                    {isSpectator && activeTab === "graveyard" && (
                        <a
                            href="https://discord.gg/j5Vmfr5GF"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                        >
                            👻 {t("chat.graveyardDiscordPrompt")}
                        </a>
                    )}
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
                                    "text-[10px] font-black uppercase tracking-tighter bg-muted px-1.5 py-0.5 rounded border border-border group-hover:bg-muted/80 transition-colors",
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
                                          ? (msg.isSpectator ? "bg-blue-600 text-primary-foreground rounded-tr-none" : "bg-primary text-primary-foreground rounded-tr-none")
                                          : (msg.isSpectator ? "bg-muted text-blue-500 rounded-tl-none border border-blue-500/20" : "bg-muted text-muted-foreground rounded-tl-none border border-border")
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
                                <PopoverContent className="w-fit p-2 bg-card border-border shadow-2xl z-50" side="top">
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
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted hover:bg-muted/80 border border-border text-xs transition-colors group"
                                    title={t("chat.reactedBy", { count: reactors.size })}
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
        {isSpectator && activeTab === "game" && (
            <p className="text-[10px] text-muted-foreground text-center uppercase tracking-wider">{t("chat.gameChatReadOnly")}</p>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="shrink-0 h-10 w-10" disabled={(isSpectator && activeTab === "game") || !currentPlayerId}>
                <MessageSquare className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2 bg-card border-border shadow-2xl z-50" side="top" align="start">
              <div className="grid grid-cols-1 gap-1">
                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border mb-1">{t("chat.tacticalComms")}</div>
                {QUICK_MESSAGES.map((msg) => (
                  <Button
                    key={msg}
                    variant="ghost"
                    size="sm"
                    className="justify-start h-8 text-xs font-medium hover:bg-primary/20 hover:text-primary transition-colors truncate"
                    onClick={() => {
                      if (msg.includes("{name}")) {
                        const targets = players.filter(p => p.id !== currentPlayerId && p.isAlive);
                        const target = targets[Math.floor(Math.random() * targets.length)];
                        handleQuickMessage(msg.replace("{name}", target?.name || t("chat.someone")));
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
            placeholder={
                isSpectator
                    ? (activeTab === "game" ? t("chat.gameChatReadOnly") : t("chat.typeAMessage"))
                    : (!currentPlayerId ? t("chat.deadPlayersCannotSpeak") : t("chat.typeAMessage"))
            }
            className="bg-background h-10"
            disabled={(isSpectator && activeTab === "game") || !currentPlayerId}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || (isSpectator && activeTab === "game") || !currentPlayerId} className="shrink-0 h-10 w-10">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

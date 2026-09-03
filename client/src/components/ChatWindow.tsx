import { useState, useEffect, useRef, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessageSquare, Smile, Ghost, Skull } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Message } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { containsProfanity } from "@/lib/profanity";
import { useToast } from "@/hooks/use-toast";

const REACTION_EMOTES = ["😂", "🤔", "👀", "😱", "👍", "❤️", "🎉", "🔥"];

interface ChatWindowProps {
    messages: Message[];
    onSendMessage: (content: string, channel?: "game" | "mafia") => void;
    currentPlayerId?: number;
    isSpectator?: boolean;
    players?: any[];
    notify?: (title: string, options?: NotificationOptions) => void;
    mafiaChatAvailable?: boolean;
    // Feature: graveyard chat opens to everyone once the game is over —
    // room.status === 'ended' on the Room.tsx side. Kept as its own prop
    // rather than folding into isSpectator so "can view the graveyard" and
    // "was actually in the graveyard" stay distinguishable below (a
    // survivor can look, but never gets to post into it).
    gameEnded?: boolean;
    // Feature: synced chat message reactions. Server-owned state (see
    // messageReactionsByRoom in routes.ts) — messageId -> emote -> array of
    // player IDs who reacted. Passed down from Room.tsx's gameState rather
    // than kept locally, so every player in the room sees the same
    // reactions instead of each client only ever seeing its own.
    reactions?: Record<number, Record<string, number[]>>;
    onToggleReaction?: (messageId: number, emote: string) => void;
}

export function ChatWindow({ messages, onSendMessage, currentPlayerId, isSpectator, players = [], notify, mafiaChatAvailable, gameEnded, reactions = {}, onToggleReaction }: ChatWindowProps) {
    const { t } = useTranslation();
    // Quick chat templates live in translation files so the messages sent match
    // whichever language the sender has selected.
    const QUICK_MESSAGES = (t("chat.quickMessages", { returnObjects: true }) as string[]) || [];
    const MAFIA_QUICK_MESSAGES = (t("chat.mafiaQuickMessages", { returnObjects: true }) as string[]) || [];

    const [input, setInput] = useState("");
    const [messageCount, setMessageCount] = useState(0);
    // When a quick-chat preset contains "{name}" (e.g. "I believe {name} is
    // mafia"), we no longer pick a random target and send immediately —
    // we hold the template here and show a player list so the sender picks
    // who they mean.
    const [pendingPresetMsg, setPendingPresetMsg] = useState<string | null>(null);
    const [presetPopoverOpen, setPresetPopoverOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastSentRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();
    // isSpectator here means "in the graveyard" (dead OR joined as a true
    // spectator) — Room.tsx passes true for both. They see the living
    // chat read-only plus their own private graveyard chat they can post to.
    // mafiaChatAvailable means "alive mafia, with at least one living
    // teammate" — Room.tsx only sets this true under those conditions, so a
    // lone mafia never sees a self-only channel that would out their role.
    const [activeTab, setActiveTab] = useState<"game" | "graveyard" | "mafia">("game");

    const gameMessages = useMemo(() => messages.filter(msg => !msg.isSpectator && !(msg as any).isMafiaChat), [messages]);
    const graveyardMessages = useMemo(() => messages.filter(msg => msg.isSpectator), [messages]);
    const mafiaMessages = useMemo(() => messages.filter(msg => (msg as any).isMafiaChat), [messages]);
    // Can VIEW the graveyard tab: actual spectators/eliminated players any
    // time, or anyone at all once the game has ended. Only real spectators
    // can POST into it — checked separately below wherever posting is
    // gated, so a survivor looking back after the game can read it but
    // never write into what was, at the time, a conversation they weren't
    // part of.
    const canViewGraveyard = !!isSpectator || !!gameEnded;
    const filteredMessages = useMemo(() => (
        mafiaChatAvailable && activeTab === "mafia"
            ? mafiaMessages
            : canViewGraveyard
                ? (activeTab === "graveyard" ? graveyardMessages : gameMessages)
                : gameMessages
    ), [mafiaChatAvailable, activeTab, mafiaMessages, canViewGraveyard, graveyardMessages, gameMessages]);

    // Track previous message count for notifications
    const prevMessagesRef = useRef<Message[]>([]);

    useEffect(() => {
        // ScrollArea (Radix) renders the actual scrollable element as an inner
        // "viewport" div, not the node our ref points to — setting scrollTop
        // on the outer wrapper was a no-op, which is why this never worked.
        const viewport = scrollRef.current?.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]');
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
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
        const channel = mafiaChatAvailable && activeTab === "mafia" ? "mafia" : undefined;
        onSendMessage(trimmed, channel);
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
        const channel = mafiaChatAvailable && activeTab === "mafia" ? "mafia" : undefined;
        onSendMessage(msg, channel);
    };

    // Posting is blocked on the game tab for actual spectators (read-only,
    // pre-existing rule), and on the graveyard tab for anyone who ISN'T an
    // actual spectator — a survivor can look back at graveyard chat once
    // gameEnded, but never gets to post into a conversation they weren't
    // part of at the time.
    const canPostHere = !((isSpectator && activeTab === "game") || (activeTab === "graveyard" && !isSpectator));

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
                ) : gameEnded ? (
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
                        </button>
                    </div>
                ) : mafiaChatAvailable ? (
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
                            onClick={() => setActiveTab("mafia")}
                            className={cn(
                                "flex-1 p-3 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors border-b-2",
                                activeTab === "mafia" ? "border-red-500 text-red-400" : "border-transparent text-muted-foreground hover:text-red-400"
                            )}
                        >
                            <Skull className="w-3.5 h-3.5" />
                            {t("chat.mafiaChat")}
                            <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">{t("chat.secret")}</span>
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
                            href="https://discord.gg/9fRxpUyjD4"
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
                                    msg.isSpectator ? "text-blue-400 border-blue-400/20" : (msg as any).isMafiaChat ? "text-red-400 border-red-400/20" : getPlayerColor(msg.playerId)
                                )}>
                                    {msg.playerName} {msg.isSpectator && "👻"} {(msg as any).isMafiaChat && "🍷"}
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
                                          ? (msg.isSpectator ? "bg-blue-600 text-primary-foreground rounded-tr-none" : (msg as any).isMafiaChat ? "bg-red-700 text-primary-foreground rounded-tr-none" : "bg-primary text-primary-foreground rounded-tr-none")
                                          : (msg.isSpectator ? "bg-muted text-blue-500 rounded-tl-none border border-blue-500/20" : (msg as any).isMafiaChat ? "bg-muted text-red-500 rounded-tl-none border border-red-500/20" : "bg-muted text-muted-foreground rounded-tl-none border border-border")
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
                                        onClick={() => onToggleReaction?.(msg.id, emote)}
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
                                    onClick={() => onToggleReaction?.(msg.id, emote)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted hover:bg-muted/80 border border-border text-xs transition-colors group"
                                    title={t("chat.reactedBy", { count: reactors.length })}
                                  >
                                    <span>{emote}</span>
                                    {reactors.length > 0 && <span className="text-[10px] text-muted-foreground font-semibold">{reactors.length}</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>
                    ))}
                </div>
            </ScrollArea>
      <div className="p-3 border-t bg-muted/30 flex flex-col gap-2">
        {!canPostHere && (
            <p className="text-[10px] text-muted-foreground text-center uppercase tracking-wider">{t("chat.gameChatReadOnly")}</p>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Popover open={presetPopoverOpen} onOpenChange={(open) => { setPresetPopoverOpen(open); if (!open) setPendingPresetMsg(null); }}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="shrink-0 h-10 w-10" disabled={!canPostHere || !currentPlayerId}>
                <MessageSquare className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2 bg-card border-border shadow-2xl z-50" side="top" align="start">
              {pendingPresetMsg ? (
                <div className="grid grid-cols-1 gap-1">
                  <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border mb-1 flex items-center justify-between">
                    <span>{t("chat.selectTarget")}</span>
                    <button type="button" className="underline normal-case tracking-normal font-medium" onClick={() => setPendingPresetMsg(null)}>
                      {t("common.back")}
                    </button>
                  </div>
                  {(mafiaChatAvailable && activeTab === "mafia"
                    ? players.filter(p => p.id !== currentPlayerId && p.isAlive && p.role !== "mafia")
                    : players.filter(p => p.id !== currentPlayerId && p.isAlive)
                  ).map((p) => (
                    <Button
                      key={p.id}
                      variant="ghost"
                      size="sm"
                      className={cn("justify-start h-8 text-xs font-medium transition-colors truncate",
                        mafiaChatAvailable && activeTab === "mafia" ? "hover:bg-red-500/20 hover:text-red-400" : "hover:bg-primary/20 hover:text-primary")}
                      onClick={() => {
                        handleQuickMessage(pendingPresetMsg.replace("{name}", p.name));
                        setPendingPresetMsg(null);
                        setPresetPopoverOpen(false);
                      }}
                    >
                      {p.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1">
                  <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
                    {mafiaChatAvailable && activeTab === "mafia" ? t("chat.mafiaTacticalComms") : t("chat.tacticalComms")}
                  </div>
                  {(mafiaChatAvailable && activeTab === "mafia" ? MAFIA_QUICK_MESSAGES : QUICK_MESSAGES).map((msg) => (
                    <Button
                      key={msg}
                      variant="ghost"
                      size="sm"
                      className={cn("justify-start h-8 text-xs font-medium transition-colors truncate",
                        mafiaChatAvailable && activeTab === "mafia" ? "hover:bg-red-500/20 hover:text-red-400" : "hover:bg-primary/20 hover:text-primary")}
                      onClick={() => {
                        if (msg.includes("{name}")) {
                          setPendingPresetMsg(msg);
                        } else {
                          handleQuickMessage(msg);
                          setPresetPopoverOpen(false);
                        }
                      }}
                    >
                      {msg.replace("{name}", "...")}
                    </Button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
                mafiaChatAvailable && activeTab === "mafia"
                    ? t("chat.mafiaTypeAMessage")
                    : !canPostHere
                        ? t("chat.gameChatReadOnly")
                        : (!currentPlayerId ? t("chat.deadPlayersCannotSpeak") : t("chat.typeAMessage"))
            }
            className="bg-background h-10"
            disabled={!canPostHere || !currentPlayerId}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || !canPostHere || !currentPlayerId} className="shrink-0 h-10 w-10">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

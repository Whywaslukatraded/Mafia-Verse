import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import type { Message } from "@shared/schema";

interface ChatWindowProps {
    messages: Message[];
    onSendMessage: (content: string) => void;
    currentPlayerId?: number;
    isSpectator?: boolean;
}

export function ChatWindow({ messages, onSendMessage, currentPlayerId, isSpectator }: ChatWindowProps) {
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);

    const filteredMessages = messages.filter(msg => {
        // If I am a spectator, I see everything.
        // If I am alive, I only see non-spectator messages.
        if (isSpectator) return true;
        return !msg.isSpectator;
    });

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [filteredMessages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim()) {
            onSendMessage(input);
            setInput("");
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
                    {filteredMessages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex flex-col group ${
                                msg.playerId === currentPlayerId ? "items-end" : "items-start"
                            }`}
                        >
                            <div className={`flex items-center gap-2 mb-1 ${
                                msg.playerId === currentPlayerId ? "flex-row-reverse" : "flex-row"
                            }`}>
                                <span className={cn(
                                    "text-[10px] font-black uppercase tracking-tighter bg-white/5 px-1.5 py-0.5 rounded border border-white/5 group-hover:bg-white/10 transition-colors",
                                    msg.isSpectator ? "text-blue-400 border-blue-400/20" : "text-primary/80"
                                )}>
                                    {msg.playerName} {msg.isSpectator && "👻"}
                                </span>
                            </div>
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
                        </div>
                    ))}
                </div>
            </ScrollArea>
      <form onSubmit={handleSubmit} className="p-3 border-t bg-muted/30 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="bg-background"
        />
        <Button type="submit" size="icon" disabled={!input.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}

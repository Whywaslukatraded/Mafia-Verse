import { motion } from "framer-motion";
import { User, Skull, Crown, Ghost, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Player } from "@shared/schema";
import { Button } from "@/components/ui/button";

interface PlayerCardProps {
  player: Player;
  isMe: boolean;
  canInteract: boolean;
  interactionLabel?: string;
  interactionVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  onInteract?: () => void;
  onRemove?: () => void;
  revealedRole?: string | null; // For detective check or game end
}

export function PlayerCard({ 
  player, 
  isMe, 
  canInteract, 
  interactionLabel,
  interactionVariant = "default",
  onInteract,
  onRemove,
  revealedRole 
}: PlayerCardProps) {
  
  return (
    <motion.div
      whileHover={canInteract && player.isAlive ? { scale: 1.02, y: -2 } : {}}
      className={cn(
        "relative w-full aspect-[3/4] rounded-xl overflow-hidden border transition-all duration-300 flex flex-col items-center justify-center p-4 group",
        // Dead state
        !player.isAlive && "bg-slate-900/50 border-slate-800 grayscale opacity-70",
        // Alive state
        player.isAlive && "bg-card/50 backdrop-blur-sm border-white/10 shadow-lg",
        // Me state
        isMe && "border-primary/50 ring-1 ring-primary/20"
      )}
    >
      {/* Remove Bot Button */}
      {player.isBot && onRemove && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 left-2 h-6 w-6 rounded-full bg-destructive/20 text-destructive opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="w-3 h-3" />
        </Button>
      )}

      {/* Status Icons */}
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        {player.isHost && (
          <div className="p-1 bg-yellow-500/20 rounded-full text-yellow-500" title="Host">
            <Crown className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Avatar */}
      <div className={cn(
        "w-20 h-20 rounded-full mb-4 flex items-center justify-center text-4xl font-bold border-2 transition-colors relative overflow-hidden",
        !player.isAlive ? "bg-slate-800 border-slate-700 opacity-50" : (player.avatarConfig as any)?.bg || "bg-white/5 border-primary/20 shadow-lg shadow-primary/5"
      )}>
        {player.isAlive ? (
          <>
            <span className="relative z-10">{player.avatar || player.name.charAt(0).toUpperCase()}</span>
            {(player.avatarConfig as any)?.clothing && (player.avatarConfig as any).clothing !== "None" && (
              <span className="absolute bottom-0 text-xl z-20 opacity-80">{(player.avatarConfig as any).clothing}</span>
            )}
            {(player.avatarConfig as any)?.accessory && (player.avatarConfig as any).accessory !== "None" && (
              <span className="absolute top-2 text-xl z-20">{(player.avatarConfig as any).accessory}</span>
            )}
          </>
        ) : (
          <Ghost className="w-10 h-10 text-slate-500" />
        )}
      </div>

      {/* Name */}
      <div className="text-center w-full">
        <h3 className={cn(
          "font-bold truncate px-2 text-lg flex items-center justify-center gap-1",
          !player.isAlive && "line-through text-muted-foreground"
        )}>
          {player.name}
          {player.isBot && <span className="text-[10px] bg-white/10 px-1 rounded text-muted-foreground font-normal">BOT</span>}
          {isMe && <span className="ml-1 text-xs text-muted-foreground font-normal">(You)</span>}
        </h3>
        
        {/* Revealed Role or Status */}
        <div className="mt-2 min-h-[20px] text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {!player.isAlive ? "Eliminated" : revealedRole || (isMe && player.role) || "Unknown"}
        </div>
      </div>

      {/* Action Overlay */}
      {canInteract && player.isAlive && (
        <Button
          variant={interactionVariant}
          onClick={(e) => {
            e.stopPropagation();
            if (onInteract) onInteract();
          }}
          className="absolute inset-x-0 bottom-0 py-3 text-xs font-bold uppercase tracking-widest opacity-100 transition-opacity flex items-center justify-center rounded-none z-20"
        >
          {interactionLabel}
        </Button>
      )}
    </motion.div>
  );
}

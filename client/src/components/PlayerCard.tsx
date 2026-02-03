import { motion } from "framer-motion";
import { User, Skull, Crown, Ghost } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Player } from "@shared/schema";

interface PlayerCardProps {
  player: Player;
  isMe: boolean;
  canInteract: boolean;
  interactionLabel?: string;
  onInteract?: () => void;
  revealedRole?: string | null; // For detective check or game end
}

export function PlayerCard({ 
  player, 
  isMe, 
  canInteract, 
  interactionLabel, 
  onInteract,
  revealedRole 
}: PlayerCardProps) {
  
  return (
    <motion.button
      whileHover={canInteract && player.isAlive ? { scale: 1.02, y: -2 } : {}}
      whileTap={canInteract && player.isAlive ? { scale: 0.98 } : {}}
      disabled={!canInteract || !player.isAlive}
      onClick={onInteract}
      className={cn(
        "relative w-full aspect-[3/4] rounded-xl overflow-hidden border transition-all duration-300 flex flex-col items-center justify-center p-4",
        // Dead state
        !player.isAlive && "bg-slate-900/50 border-slate-800 grayscale opacity-70 cursor-not-allowed",
        // Alive state
        player.isAlive && "bg-card/50 backdrop-blur-sm border-white/10 shadow-lg",
        // Interactive state
        canInteract && player.isAlive && "hover:border-primary/50 hover:shadow-primary/20 cursor-pointer ring-offset-2 ring-offset-background focus:outline-none focus:ring-2 focus:ring-primary",
        // Me state
        isMe && "border-primary/50 ring-1 ring-primary/20"
      )}
    >
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
        "w-20 h-20 rounded-full mb-4 flex items-center justify-center text-3xl font-bold border-2 transition-colors",
        !player.isAlive ? "bg-slate-800 border-slate-700 text-slate-500" : "bg-primary/10 border-primary/20 text-primary"
      )}>
        {player.isAlive ? (
          player.name.charAt(0).toUpperCase()
        ) : (
          <Ghost className="w-10 h-10" />
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
        <div className="absolute inset-x-0 bottom-0 py-2 bg-primary/90 text-primary-foreground text-xs font-bold uppercase tracking-widest opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
          {interactionLabel}
        </div>
      )}
    </motion.button>
  );
}

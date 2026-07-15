import { motion } from "framer-motion";
import { Heart, Skull, Crown, Ghost, X, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  revealedRole?: string | null;
}

const ROLE_COSMETICS_META: Record<string, { border: string; glow: string; bg: string; icon: any; iconColor: string; labelKey: string }> = {
  mafia: {
    border: "border-red-500/60",
    glow: "shadow-[0_0_20px_rgba(239,68,68,0.25)]",
    bg: "bg-red-950/30",
    icon: Skull,
    iconColor: "text-red-400",
    labelKey: "mafia"
  },
  detective: {
    border: "border-blue-500/60",
    glow: "shadow-[0_0_20px_rgba(59,130,246,0.25)]",
    bg: "bg-blue-950/30",
    icon: Shield,
    iconColor: "text-blue-400",
    labelKey: "detective"
  },
  doctor: {
    border: "border-emerald-500/60",
    glow: "shadow-[0_0_20px_rgba(16,185,129,0.25)]",
    bg: "bg-emerald-950/30",
    icon: Heart,
    iconColor: "text-emerald-400",
    labelKey: "doctor"
  },
  civilian: {
    border: "border-white/20",
    glow: "",
    bg: "bg-card/50",
    icon: null,
    iconColor: "text-muted-foreground/40",
    labelKey: "civilian"
  },
};

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
  const { t } = useTranslation();
  // Determine which role cosmetic to apply
  // Server sends real roles for: self, teammates, dead players, ended games; 'unknown' for hidden roles
  const knownRole = revealedRole?.toLowerCase()
    || (player.role && player.role !== "unknown" ? player.role.toLowerCase() : null);
  const cosmeticMeta = knownRole && ROLE_COSMETICS_META[knownRole] ? ROLE_COSMETICS_META[knownRole] : null;
  const cosmetic = cosmeticMeta ? { ...cosmeticMeta, label: t(`playerCard.roleLabels.${cosmeticMeta.labelKey}`) } : null;
  const RoleIcon = cosmetic?.icon;

  const displayRole = revealedRole || (player.role && player.role !== "unknown" ? player.role : null);
  const displayRoleLabel = displayRole ? t(`playerCard.roleLabels.${displayRole.toLowerCase()}`, displayRole) : t("playerCard.unknown");

  return (
    <motion.div
      whileHover={canInteract && player.isAlive ? { scale: 1.02, y: -2 } : {}}
      className={cn(
        "relative w-full aspect-[3/4] rounded-xl overflow-hidden border transition-all duration-300 flex flex-col items-center justify-center p-4 group",
        !player.isAlive && "bg-muted border-muted-foreground/20 grayscale opacity-70",
        player.isAlive && !cosmetic && "bg-card/50 backdrop-blur-sm border-border shadow-lg",
        player.isAlive && cosmetic && `${cosmetic.bg} backdrop-blur-sm ${cosmetic.border} ${cosmetic.glow}`,
        isMe && !cosmetic && "border-primary/50 ring-1 ring-primary/20"
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
          <div className="p-1 bg-yellow-500/20 rounded-full text-yellow-500" title={t("playerCard.host")}>
            <Crown className="w-4 h-4" />
          </div>
        )}
        {RoleIcon && player.isAlive && (
          <div className={cn("p-1 rounded-full bg-muted/80", cosmetic?.iconColor)} title={cosmetic?.label}>
            <RoleIcon className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Avatar */}
      <div className={cn(
        "w-20 h-20 rounded-full mb-4 flex items-center justify-center text-4xl font-bold border-2 transition-colors relative overflow-hidden",
        !player.isAlive ? "bg-muted border-muted-foreground/30 opacity-50" : (player.avatarConfig as any)?.bg || "bg-card border-primary/20 shadow-lg shadow-primary/5"
      )}>
        {player.isAlive ? (
          <>
            <span className="relative z-10">{player.avatar || player.name.charAt(0).toUpperCase()}</span>
            {(player.avatarConfig as any)?.accessory && (player.avatarConfig as any).accessory !== "None" && (
              <span className="absolute top-2 text-xl z-30">{(player.avatarConfig as any).accessory}</span>
            )}
            {(player.avatarConfig as any)?.clothing && (player.avatarConfig as any).clothing !== "None" && (
              <span className="absolute bottom-2 text-xl z-20 opacity-90">{(player.avatarConfig as any).clothing}</span>
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
          {player.isBot && <span className="text-[10px] bg-muted px-1 rounded text-muted-foreground font-normal">{t("playerCard.bot")}</span>}
          {isMe && <span className="ml-1 text-xs text-muted-foreground font-normal">{t("playerCard.you")}</span>}
        </h3>
        
        {/* Revealed Role or Status */}
        <div className="mt-2 min-h-[20px] text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {!player.isAlive
            ? (player.role && player.role !== "unknown" ? t("playerCard.roleEliminated", { role: t(`playerCard.roleLabels.${player.role.toLowerCase()}`, player.role) }) : t("playerCard.eliminated"))
            : displayRoleLabel}
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

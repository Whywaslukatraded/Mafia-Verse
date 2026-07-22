import { motion } from "framer-motion";
import { Heart, Skull, Crown, Ghost, X, Shield, ShieldCheck, Crosshair, Landmark, Drama } from "lucide-react";
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
  // Shown only on the current player's own card, when relevant to their role.
  myBulletsLeft?: number;
  myMayorRevealed?: boolean;
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
  bodyguard: {
    border: "border-slate-400/60",
    glow: "shadow-[0_0_20px_rgba(148,163,184,0.25)]",
    bg: "bg-slate-800/30",
    icon: ShieldCheck,
    iconColor: "text-slate-300",
    labelKey: "bodyguard"
  },
  vigilante: {
    border: "border-orange-500/60",
    glow: "shadow-[0_0_20px_rgba(249,115,22,0.25)]",
    bg: "bg-orange-950/30",
    icon: Crosshair,
    iconColor: "text-orange-400",
    labelKey: "vigilante"
  },
  mayor: {
    border: "border-purple-500/60",
    glow: "shadow-[0_0_20px_rgba(168,85,247,0.25)]",
    bg: "bg-purple-950/30",
    icon: Landmark,
    iconColor: "text-purple-400",
    labelKey: "mayor"
  },
  jester: {
    border: "border-pink-500/60",
    glow: "shadow-[0_0_20px_rgba(236,72,153,0.25)]",
    bg: "bg-pink-950/30",
    icon: Drama,
    iconColor: "text-pink-400",
    labelKey: "jester"
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
  revealedRole,
  myBulletsLeft,
  myMayorRevealed,
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
        "relative w-full aspect-[3/4] rounded-lg overflow-hidden border transition-[background-color,border-color,box-shadow] duration-300 flex flex-col items-center justify-center p-1.5 sm:p-2 group",
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
          className="absolute top-1 left-1 h-5 w-5 rounded-full bg-destructive/20 text-destructive opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="w-2.5 h-2.5" />
        </Button>
      )}

      {/* Status Icons */}
      <div className="absolute top-1 right-1 flex flex-col gap-0.5">
        {player.isHost && (
          <div className="p-0.5 bg-yellow-500/20 rounded-full text-yellow-500" title={t("playerCard.host")}>
            <Crown className="w-3 h-3" />
          </div>
        )}
        {RoleIcon && player.isAlive && (
          <div className={cn("p-0.5 rounded-full bg-muted/80", cosmetic?.iconColor)} title={cosmetic?.label}>
            <RoleIcon className="w-3 h-3" />
          </div>
        )}
      </div>

      {/* Avatar */}
      <div className={cn(
        "w-10 h-10 sm:w-12 sm:h-12 rounded-full mb-1.5 flex items-center justify-center text-lg sm:text-xl font-bold border-2 transition-colors relative overflow-hidden",
        !player.isAlive ? "bg-muted border-muted-foreground/30 opacity-50" : (player.avatarConfig as any)?.bg || "bg-card border-primary/20 shadow-lg shadow-primary/5"
      )}>
        {player.isAlive ? (
          <>
            <span className="relative z-10">{player.avatar || player.name.charAt(0).toUpperCase()}</span>
            {(player.avatarConfig as any)?.accessory && (player.avatarConfig as any).accessory !== "None" && (
              <span className="absolute top-0.5 text-[10px] sm:text-xs z-30">{(player.avatarConfig as any).accessory}</span>
            )}
            {(player.avatarConfig as any)?.clothing && (player.avatarConfig as any).clothing !== "None" && (
              <span className="absolute bottom-0.5 text-[10px] sm:text-xs z-20 opacity-90">{(player.avatarConfig as any).clothing}</span>
            )}
          </>
        ) : (
          <Ghost className="w-5 h-5 text-slate-500" />
        )}
      </div>

      {/* Name */}
      <div className="text-center w-full">
        <h3 className={cn(
          "font-bold px-1 text-xs sm:text-sm flex items-center justify-center gap-1 flex-wrap leading-tight",
          !player.isAlive && "line-through text-muted-foreground"
        )}>
          <span className="break-words line-clamp-2">{player.name}</span>
          {player.isBot && <span className="text-[8px] bg-muted px-1 rounded text-muted-foreground font-normal">{t("playerCard.bot")}</span>}
          {isMe && <span className="ml-0.5 text-[10px] text-muted-foreground font-normal">{t("playerCard.you")}</span>}
          {isMe && typeof myBulletsLeft === "number" && (
            <span className="ml-0.5 text-[8px] bg-orange-500/20 text-orange-400 px-1 py-0.5 rounded-full font-bold">
              🔫 {myBulletsLeft}/2
            </span>
          )}
          {isMe && myMayorRevealed && (
            <span className="ml-0.5 text-[8px] bg-purple-500/20 text-purple-400 px-1 py-0.5 rounded-full font-bold">
              {t("playerCard.revealed")}
            </span>
          )}
        </h3>
        
        {/* Revealed Role or Status */}
        <div className="mt-0.5 min-h-[14px] text-[9px] sm:text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate px-1">
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
          className="absolute inset-x-0 bottom-0 py-1.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest opacity-100 transition-opacity flex items-center justify-center rounded-none z-20"
        >
          {interactionLabel}
        </Button>
      )}
    </motion.div>
  );
}

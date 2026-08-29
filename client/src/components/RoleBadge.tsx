import { Shield, Eye, Skull, User, Crown, ShieldCheck, Crosshair, Landmark, Drama } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getRoleColors } from "@/lib/roleColors";
import { useColorblindMode } from "@/hooks/use-colorblind-mode";

interface RoleBadgeProps {
  role?: string | null;
  className?: string;
  showLabel?: boolean;
}

const ROLE_ICONS: Record<string, any> = {
  mafia: Skull,
  detective: Eye,
  doctor: Shield,
  civilian: User,
  bodyguard: ShieldCheck,
  vigilante: Crosshair,
  mayor: Landmark,
  jester: Drama,
};

export function RoleBadge({ role, className, showLabel = true }: RoleBadgeProps) {
  const { t } = useTranslation();
  const colorblindMode = useColorblindMode();
  if (!role) return null;

  const normalizedRole = (role.toLowerCase() in ROLE_ICONS ? role.toLowerCase() : "civilian") as keyof typeof ROLE_ICONS;
  const Icon = ROLE_ICONS[normalizedRole];
  const label = t(`roleBadge.${normalizedRole}`);
  const badgeClass = getRoleColors(normalizedRole, colorblindMode)?.badgeClass || "text-slate-400 bg-slate-500/10 border-slate-500/20";

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium uppercase tracking-wider",
      badgeClass,
      className
    )}>
      <Icon className="w-3.5 h-3.5" />
      {showLabel && <span>{label}</span>}
    </div>
  );
}

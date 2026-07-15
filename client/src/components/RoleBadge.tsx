import { Shield, Eye, Skull, User, Crown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface RoleBadgeProps {
  role?: string | null;
  className?: string;
  showLabel?: boolean;
}

export function RoleBadge({ role, className, showLabel = true }: RoleBadgeProps) {
  const { t } = useTranslation();
  if (!role) return null;

  const config = {
    mafia: { icon: Skull, label: t("roleBadge.mafia"), color: "text-red-500 bg-red-500/10 border-red-500/20" },
    detective: { icon: Eye, label: t("roleBadge.detective"), color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
    doctor: { icon: Shield, label: t("roleBadge.doctor"), color: "text-green-500 bg-green-500/10 border-green-500/20" },
    civilian: { icon: User, label: t("roleBadge.civilian"), color: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
  };

  const normalizedRole = role.toLowerCase() as keyof typeof config;
  const RoleConfig = config[normalizedRole] || config.civilian;
  const Icon = RoleConfig.icon;

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium uppercase tracking-wider",
      RoleConfig.color,
      className
    )}>
      <Icon className="w-3.5 h-3.5" />
      {showLabel && <span>{RoleConfig.label}</span>}
    </div>
  );
}

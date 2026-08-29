// Feature: Colorblind-safe roles (toggle). Two full palettes per role,
// selected by useColorblindMode() below — the icons already used everywhere
// roles appear (Skull, Shield, Heart, etc.) never change, since role
// identity was already never color-only. This only swaps which hues are
// used, so someone with red-green colorblindness isn't relying on hue
// alone to tell mafia (currently red) apart from doctor (currently green)
// at a glance.
//
// The "colorblind" variant uses the Okabe-Ito palette — the standard
// scientifically-verified colorblind-safe 8-color set (safe under
// deuteranopia, protanopia, and tritanopia) — mapped one-for-one to the
// 8 roles instead of picking colors ad hoc:
//   Vermillion #D55E00, Blue #0072B2, Bluish Green #009E73,
//   Sky Blue #56B4E9, Orange #E69F00, Reddish Purple #CC79A7,
//   Yellow #F0E442, plus black/gray for the neutral civilian role.

export type RoleColorSet = {
  // For PlayerCard's card chrome
  border: string;
  glow: string;
  bg: string;
  iconColor: string;
  // For RoleBadge's single combined className
  badgeClass: string;
};

const DEFAULT_PALETTE: Record<string, RoleColorSet> = {
  mafia: {
    border: "border-red-500/60",
    glow: "shadow-[0_0_20px_rgba(239,68,68,0.25)]",
    bg: "bg-red-950/30",
    iconColor: "text-red-400",
    badgeClass: "text-red-500 bg-red-500/10 border-red-500/20",
  },
  detective: {
    border: "border-blue-500/60",
    glow: "shadow-[0_0_20px_rgba(59,130,246,0.25)]",
    bg: "bg-blue-950/30",
    iconColor: "text-blue-400",
    badgeClass: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  },
  doctor: {
    border: "border-emerald-500/60",
    glow: "shadow-[0_0_20px_rgba(16,185,129,0.25)]",
    bg: "bg-emerald-950/30",
    iconColor: "text-emerald-400",
    badgeClass: "text-green-500 bg-green-500/10 border-green-500/20",
  },
  civilian: {
    border: "border-white/20",
    glow: "",
    bg: "bg-card/50",
    iconColor: "text-muted-foreground/40",
    badgeClass: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  },
  bodyguard: {
    border: "border-slate-400/60",
    glow: "shadow-[0_0_20px_rgba(148,163,184,0.25)]",
    bg: "bg-slate-800/30",
    iconColor: "text-slate-300",
    badgeClass: "text-slate-300 bg-slate-400/10 border-slate-400/20",
  },
  vigilante: {
    border: "border-orange-500/60",
    glow: "shadow-[0_0_20px_rgba(249,115,22,0.25)]",
    bg: "bg-orange-950/30",
    iconColor: "text-orange-400",
    badgeClass: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  },
  mayor: {
    border: "border-purple-500/60",
    glow: "shadow-[0_0_20px_rgba(168,85,247,0.25)]",
    bg: "bg-purple-950/30",
    iconColor: "text-purple-400",
    badgeClass: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
  jester: {
    border: "border-pink-500/60",
    glow: "shadow-[0_0_20px_rgba(236,72,153,0.25)]",
    bg: "bg-pink-950/30",
    iconColor: "text-pink-400",
    badgeClass: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  },
};

// Arbitrary-value Tailwind classes (bg-[#hex]) — same technique already
// used elsewhere in this codebase (e.g. Room.tsx's bg-[hsl(var(--bg-mafia))]
// phase backgrounds), so this doesn't need any new Tailwind config.
const COLORBLIND_PALETTE: Record<string, RoleColorSet> = {
  mafia: {
    border: "border-[#D55E00]/60",
    glow: "shadow-[0_0_20px_rgba(213,94,0,0.3)]",
    bg: "bg-[#D55E00]/10",
    iconColor: "text-[#D55E00]",
    badgeClass: "text-[#D55E00] bg-[#D55E00]/10 border-[#D55E00]/30",
  },
  detective: {
    border: "border-[#0072B2]/60",
    glow: "shadow-[0_0_20px_rgba(0,114,178,0.3)]",
    bg: "bg-[#0072B2]/10",
    iconColor: "text-[#0072B2]",
    badgeClass: "text-[#0072B2] bg-[#0072B2]/10 border-[#0072B2]/30",
  },
  doctor: {
    border: "border-[#009E73]/60",
    glow: "shadow-[0_0_20px_rgba(0,158,115,0.3)]",
    bg: "bg-[#009E73]/10",
    iconColor: "text-[#009E73]",
    badgeClass: "text-[#009E73] bg-[#009E73]/10 border-[#009E73]/30",
  },
  civilian: {
    border: "border-white/20",
    glow: "",
    bg: "bg-card/50",
    iconColor: "text-muted-foreground/40",
    badgeClass: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  },
  bodyguard: {
    border: "border-[#56B4E9]/60",
    glow: "shadow-[0_0_20px_rgba(86,180,233,0.3)]",
    bg: "bg-[#56B4E9]/10",
    iconColor: "text-[#56B4E9]",
    badgeClass: "text-[#56B4E9] bg-[#56B4E9]/10 border-[#56B4E9]/30",
  },
  vigilante: {
    border: "border-[#E69F00]/60",
    glow: "shadow-[0_0_20px_rgba(230,159,0,0.3)]",
    bg: "bg-[#E69F00]/10",
    iconColor: "text-[#E69F00]",
    badgeClass: "text-[#E69F00] bg-[#E69F00]/10 border-[#E69F00]/30",
  },
  mayor: {
    border: "border-[#CC79A7]/60",
    glow: "shadow-[0_0_20px_rgba(204,121,167,0.3)]",
    bg: "bg-[#CC79A7]/10",
    iconColor: "text-[#CC79A7]",
    badgeClass: "text-[#CC79A7] bg-[#CC79A7]/10 border-[#CC79A7]/30",
  },
  jester: {
    // Uses the true, unmodified Okabe-Ito yellow (#F0E442) rather than a
    // darkened variant — verified via dichromacy simulation (see commit
    // notes) that darkening this toward gold for contrast made it drift
    // too close to mafia's vermillion under protanopia/deuteranopia,
    // undermining the whole point of this palette. Contrast against light
    // surfaces is handled with a border/background instead of dimming the
    // color itself.
    border: "border-[#F0E442]/70",
    glow: "shadow-[0_0_20px_rgba(240,228,66,0.3)]",
    bg: "bg-[#F0E442]/10",
    iconColor: "text-[#F0E442] drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]",
    badgeClass: "text-[#F0E442] bg-[#F0E442]/10 border-[#F0E442]/40 [text-shadow:0_1px_1px_rgba(0,0,0,0.5)]",
  },
};

export function getRoleColors(role: string | null | undefined, colorblindMode: boolean): RoleColorSet | null {
  if (!role) return null;
  const palette = colorblindMode ? COLORBLIND_PALETTE : DEFAULT_PALETTE;
  return palette[role.toLowerCase()] || null;
}

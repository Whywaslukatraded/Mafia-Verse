import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, Lock, Check, Crown, Diamond, Flame, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSupabase, isSupabaseReady } from "@/lib/supabase";
import { LOOT_ITEMS, TIER_COLORS as LOOT_TIER_COLORS, TIER_BG as LOOT_TIER_BG } from "@/components/LootCrate";

// Loot-crate cosmetics (non-credit items only) — same catalog LootCrate.tsx
// rolls from, filtered to the types this page can actually display. `emote`
// and `title` types aren't rendered as equippable cards elsewhere in this
// file yet, so they're intentionally left out here rather than bolting on
// unproven new preview UI for them in this pass.
//
// Bug fix: LOOT_ITEMS entries only ever had { id, type, tier, weight } —
// no `preview` field, unlike every hand-authored item below. That's why
// the preview area rendered empty specifically for loot-crate items: the
// hero preview JSX reads `cosmetic.preview` directly, which was always
// undefined here. Derive a preview from each item's id/color segment
// instead. Class strings are written out in full (not template-built —
// e.g. never `` `border-${color}-500/50` ``) because Tailwind's build only
// generates CSS for class names it can see literally in the source.
const LOOT_BORDER_PREVIEW: Record<string, string> = {
  grey: "border-slate-500/50 bg-slate-500/5",
  olive: "border-lime-500/50 bg-lime-500/5",
  tan: "border-amber-500/50 bg-amber-500/5",
  navy: "border-blue-500/50 bg-blue-500/5",
  teal: "border-teal-500/50 bg-teal-500/5",
  mint: "border-emerald-500/50 bg-emerald-500/5",
  lav: "border-violet-500/50 bg-violet-500/5",
  coral: "border-orange-500/50 bg-orange-500/5",
  peach: "border-rose-500/50 bg-rose-500/5",
  ink: "border-zinc-500/50 bg-zinc-500/5",
  gold: "border-yellow-500/50 bg-yellow-500/5",
  silver: "border-slate-400/50 bg-slate-400/5",
  bronze: "border-orange-700/50 bg-orange-700/5",
  ruby: "border-red-500/50 bg-red-500/5",
  sapphire: "border-blue-600/50 bg-blue-600/5",
  emerald: "border-emerald-600/50 bg-emerald-600/5",
  amethyst: "border-purple-500/50 bg-purple-500/5",
  amber: "border-amber-500/50 bg-amber-500/5",
  jade: "border-green-600/50 bg-green-600/5",
  onyx: "border-zinc-800/50 bg-zinc-800/5",
};

const LOOT_NAME_PREVIEW: Record<string, string> = {
  grey: "text-slate-400",
  olive: "text-lime-400",
  tan: "text-amber-400",
  navy: "text-blue-400",
  teal: "text-teal-400",
  mint: "text-emerald-400",
  lav: "text-violet-400",
  coral: "text-orange-400",
  peach: "text-rose-400",
  ink: "text-zinc-400",
  gold: "text-yellow-400",
  silver: "text-slate-300",
  bronze: "text-orange-600",
  ruby: "text-red-400",
  sapphire: "text-blue-400",
  emerald: "text-emerald-400",
  amethyst: "text-purple-400",
  amber: "text-amber-400",
  jade: "text-green-400",
  onyx: "text-zinc-500",
};

// Ring styling for avatar_frame previews. Keyed by the frame's material
// name (the `lc_frame_<name>` id suffix). Anything not listed here falls
// through to the same default gold ring the hardcoded frame_crown item
// already relies on, further down in the render JSX.
export const FRAME_RING_STYLES: Record<string, string> = {
  diamond: "border-cyan-400/60 shadow-[0_0_20px_rgba(34,211,238,0.3)]",
  fire: "border-orange-500/60 shadow-[0_0_20px_rgba(249,115,22,0.3)]",
  ice: "border-sky-300/60 shadow-[0_0_20px_rgba(125,211,252,0.3)]",
  shadow: "border-zinc-500/60 shadow-[0_0_20px_rgba(113,113,122,0.3)]",
  void: "border-purple-900/60 shadow-[0_0_20px_rgba(88,28,135,0.3)]",
  neon: "border-pink-400/60 shadow-[0_0_20px_rgba(244,114,182,0.3)]",
  ghost: "border-slate-300/60 shadow-[0_0_20px_rgba(203,213,225,0.3)]",
  moon: "border-indigo-300/60 shadow-[0_0_20px_rgba(165,180,252,0.3)]",
  sun: "border-amber-400/60 shadow-[0_0_20px_rgba(251,191,36,0.3)]",
};
const DEFAULT_FRAME_RING = "border-yellow-400/60 shadow-[0_0_20px_rgba(250,204,21,0.3)]";

const LOOT_COSMETICS_META = LOOT_ITEMS.filter(
  (i) => i.type === "chat_border" || i.type === "name_color" || i.type === "avatar_frame"
).map((i) => {
  if (i.type === "chat_border") {
    const colorKey = i.id.replace("lc_border_", "");
    return { ...i, preview: LOOT_BORDER_PREVIEW[colorKey] || LOOT_BORDER_PREVIEW.grey };
  }
  if (i.type === "name_color") {
    const colorKey = i.id.replace("lc_name_", "");
    return { ...i, preview: LOOT_NAME_PREVIEW[colorKey] || LOOT_NAME_PREVIEW.grey };
  }
  // avatar_frame — preview carries the material name itself; the render
  // JSX below looks it up in FRAME_RING_STYLES for the actual ring class.
  return { ...i, preview: i.id.replace("lc_frame_", "") };
});

const WIN_COSMETICS_META = [
  { id: "border_gold", type: "chat_border", cost: 5, currency: "wins", preview: "border-yellow-500/50 bg-yellow-500/5" },
  { id: "border_red", type: "chat_border", cost: 3, currency: "wins", preview: "border-red-500/50 bg-red-500/5" },
  { id: "border_blue", type: "chat_border", cost: 3, currency: "wins", preview: "border-blue-500/50 bg-blue-500/5" },
  { id: "name_color_gold", type: "name_color", cost: 5, currency: "wins", preview: "text-yellow-400" },
  { id: "name_color_red", type: "name_color", cost: 3, currency: "wins", preview: "text-red-400" },
  { id: "name_color_cyan", type: "name_color", cost: 3, currency: "wins", preview: "text-cyan-400" },
  { id: "frame_diamond", type: "avatar_frame", cost: 10, currency: "wins", preview: "diamond" },
  { id: "frame_fire", type: "avatar_frame", cost: 8, currency: "wins", preview: "fire" },
  { id: "frame_crown", type: "avatar_frame", cost: 7, currency: "wins", preview: "crown" },
];

const SYNDICATE_COSMETICS_META = [
  { id: "synd_acc_mask", type: "accessory", tier: "gold", preview: "🪇" },
  { id: "synd_acc_cigar", type: "accessory", tier: "gold", preview: "🚬" },
  { id: "synd_acc_scar", type: "accessory", tier: "silver", preview: "⚔️" },
  { id: "synd_acc_chain", type: "accessory", tier: "silver", preview: "📿" },
  { id: "synd_cloak", type: "clothing", tier: "gold", preview: "🧫" },
  { id: "synd_suit", type: "clothing", tier: "gold", preview: "🥑" },
  { id: "synd_trench", type: "clothing", tier: "silver", preview: "🪓" },
  { id: "synd_hoodie", type: "clothing", tier: "silver", preview: "🎭" },
  { id: "synd_bg_smoke", type: "background", tier: "gold", preview: "bg-stone-800" },
  { id: "synd_bg_vault", type: "background", tier: "gold", preview: "bg-yellow-900/20" },
  { id: "synd_bg_neon", type: "background", tier: "silver", preview: "bg-purple-900/20" },
  { id: "synd_bg_cell", type: "background", tier: "silver", preview: "bg-zinc-800" },
  { id: "synd_banner_kingpin", type: "banner", tier: "gold", preview: "👑" },
  { id: "synd_banner_mercenary", type: "banner", tier: "gold", preview: "🛡️" },
  { id: "synd_banner_informant", type: "banner", tier: "silver", preview: "💬" },
  { id: "synd_banner_cleaner", type: "banner", tier: "silver", preview: "🧹" },
  { id: "synd_persona_godfather", type: "persona", tier: "legendary", preview: "👴" },
  { id: "synd_persona_fixer", type: "persona", tier: "legendary", preview: "🎭" },
  { id: "synd_persona_enforcer", type: "persona", tier: "gold", preview: "🛡️" },
  { id: "synd_persona_snitch", type: "persona", tier: "gold", preview: "👨‍🕵️" },
];

export default function Cosmetics() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const TIER_CONFIG = {
    legendary: { label: t("cosmetics.tiers.legendary"), icon: Crown, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", ring: "ring-yellow-500/60" },
    gold: { label: t("cosmetics.tiers.gold"), icon: Star, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/30", ring: "ring-amber-500/60" },
    silver: { label: t("cosmetics.tiers.silver"), icon: Diamond, color: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/30", ring: "ring-slate-500/60" },
  };

  const WIN_COSMETICS = WIN_COSMETICS_META.map(c => ({
    ...c,
    name: t(`cosmetics.items.${c.id}.name`),
    description: t(`cosmetics.items.${c.id}.description`),
  }));
  const SYNDICATE_COSMETICS = SYNDICATE_COSMETICS_META.map(c => ({
    ...c,
    name: t(`cosmetics.items.${c.id}.name`),
    description: t(`cosmetics.items.${c.id}.description`),
  }));

  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem("mafia_stats");
    return saved ? JSON.parse(saved) : { wins: 0 };
  });
  const [owned, setOwned] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("mafia_cosmetics");
    return new Set(saved ? JSON.parse(saved) : []);
  });
  const [equipped, setEquipped] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("mafia_equipped_cosmetics");
    return saved ? JSON.parse(saved) : {};
  });
  const [hasPass, setHasPass] = useState(() => {
    // Fast-paint cache only — always reconciled against the server below.
    return localStorage.getItem("mafia_syndicate_pass") === "true";
  });

  // Security fix (#8): wins used to come straight from localStorage
  // (`mafia_stats`), which handleBuy below also freely decremented on every
  // purchase — pure client state, unlockable for free via devtools. This
  // fetches the real, server-computed lifetime win total (sum of `wins`
  // across every room this account has ever played, from `players`).
  const [serverWins, setServerWins] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseReady()) return;
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch("/api/account/wins", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok || cancelled) return;
        const { wins } = await res.json();
        if (typeof wins === "number") setServerWins(wins);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Merge in server-authoritative loot-crate ownership (see LootCrate.tsx —
  // opening a crate is now a real server transaction, not a localStorage
  // write). Additive only: never removes anything already in `owned`.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseReady()) return;
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch("/api/account/cosmetics-owned", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok || cancelled) return;
        const { owned: serverOwned } = await res.json();
        if (Array.isArray(serverOwned) && serverOwned.length > 0) {
          setOwned((prev) => new Set([...Array.from(prev), ...serverOwned]));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Security fix (#7): hasPass must reflect the server-authoritative record,
  // not just a localStorage flag that any purchase attempt (successful or
  // not) used to set directly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseReady()) return;
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch("/api/account/syndicate-pass", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok || cancelled) return;
        const { active } = await res.json();
        setHasPass(!!active);
        localStorage.setItem("mafia_syndicate_pass", active ? "true" : "false");
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onStorage = () => {
      const savedStats = localStorage.getItem("mafia_stats");
      if (savedStats) setStats(JSON.parse(savedStats));
      const savedCosmetics = localStorage.getItem("mafia_cosmetics");
      if (savedCosmetics) setOwned(new Set(JSON.parse(savedCosmetics)));
      const savedEquipped = localStorage.getItem("mafia_equipped_cosmetics");
      if (savedEquipped) setEquipped(JSON.parse(savedEquipped));
      setHasPass(localStorage.getItem("mafia_syndicate_pass") === "true");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const [buyingId, setBuyingId] = useState<string | null>(null);

  const handleBuy = async (cosmetic: any) => {
    if (owned.has(cosmetic.id) || userWins < cosmetic.cost || buyingId) return;
    setBuyingId(cosmetic.id);
    try {
      if (!isSupabaseReady()) return;
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/account/cosmetics/buy-with-wins", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemId: cosmetic.id }),
      });
      if (res.ok) {
        const newOwned = new Set(owned);
        newOwned.add(cosmetic.id);
        setOwned(newOwned);
      }
    } catch {
      // Non-fatal — the item just stays locked and can be retried.
    }
    setBuyingId(null);
  };

  const handleEquip = (cosmetic: any) => {
    const newEquipped = { ...equipped };
    if (newEquipped[cosmetic.type] === cosmetic.id) {
      delete newEquipped[cosmetic.type];
    } else {
      newEquipped[cosmetic.type] = cosmetic.id;
    }
    setEquipped(newEquipped);
    localStorage.setItem("mafia_equipped_cosmetics", JSON.stringify(newEquipped));
    window.dispatchEvent(new Event("storage"));
  };

  // Security fix (#8): was `stats.wins || 0` — the same localStorage value
  // handleBuy used to spend down. Now sourced from the server-computed
  // lifetime total above; falls back to the local cache only until that
  // fetch resolves, purely to avoid a 0 flash on first paint.
  const userWins = serverWins !== null ? serverWins : (stats.wins || 0);

  const renderCosmeticCard = (cosmetic: any, isSyndicate: boolean = false) => {
    const isOwned = isSyndicate && hasPass ? true : owned.has(cosmetic.id);
    const isEquipped = equipped[cosmetic.type] === cosmetic.id;
    const canAfford = userWins >= (cosmetic.cost || 0);
    const tier = isSyndicate ? TIER_CONFIG[cosmetic.tier as keyof typeof TIER_CONFIG] : null;
    const TierIcon = tier?.icon;

    const borderGlow = isEquipped
      ? isSyndicate && tier
        ? tier.border
        : "border-yellow-500/50"
      : isOwned
        ? "border-primary/30"
        : isSyndicate && !hasPass
          ? "border-border opacity-50"
          : "border-border/60 hover:border-primary/30";

    const bgGlow = isEquipped
      ? isSyndicate && tier
        ? tier.bg
        : "bg-yellow-500/5"
      : isOwned
        ? "bg-primary/5"
        : "bg-card/90";

    return (
      <motion.div
        key={cosmetic.id}
        whileHover={{ scale: 1.03, y: -4 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 p-0 transition-all",
          borderGlow,
          bgGlow
        )}
      >
        {/* Shimmer effect for legendary */}
        {isSyndicate && cosmetic.tier === "legendary" && (
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-amber-500/10 animate-pulse pointer-events-none" />
        )}

        {/* Top bar with badge */}
        <div className="relative flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            {tier && (
              <div className={cn("px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border", tier.bg, tier.color, tier.border)}>
                {TierIcon && <TierIcon className="w-3 h-3" />}
                {tier.label}
              </div>
            )}
            {isEquipped && (
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] font-black uppercase"
              >
                <Check className="w-3 h-3" /> {t("cosmetics.equipped")}
              </motion.div>
            )}
            {isOwned && !isEquipped && (
              <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase">{t("cosmetics.owned")}</span>
            )}
          </div>
        </div>

        {/* Hero preview area */}
        <div className="relative px-4 pb-4">
          <div className={cn(
            "rounded-xl flex items-center justify-center min-h-[110px] border border-border/50 overflow-hidden",
            cosmetic.type === "background" && isSyndicate ? cosmetic.preview : "bg-gradient-to-b from-muted/30 to-muted/10"
          )}>
            {cosmetic.type === "chat_border" && (
              <div className={cn("p-3 rounded-lg text-sm font-bold text-foreground border-2 w-[90%] text-center shadow-sm", cosmetic.preview)}>
                🔥 {t("cosmetics.chatBorderPreview")}
              </div>
            )}
            {cosmetic.type === "name_color" && (
              <div className="text-center">
                <div className={cn("text-3xl font-black tracking-tight", cosmetic.preview)}>AGENT_47</div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("cosmetics.usernamePreview")}</span>
              </div>
            )}
            {cosmetic.type === "avatar_frame" && (
              <div className="relative">
                <div className="text-5xl relative z-10">🕵️</div>
                <div className={cn(
                  "absolute -inset-3 rounded-full border-[3px] animate-pulse",
                  FRAME_RING_STYLES[cosmetic.preview] || DEFAULT_FRAME_RING
                )} />
              </div>
            )}
            {isSyndicate && cosmetic.type === "accessory" && (
              <div className="text-center">
                <div className="text-5xl drop-shadow-lg">{cosmetic.preview}</div>
                <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("cosmetics.types.accessory")}</div>
              </div>
            )}
            {isSyndicate && cosmetic.type === "clothing" && (
              <div className="text-center">
                <div className="text-5xl drop-shadow-lg">{cosmetic.preview}</div>
                <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("cosmetics.types.clothing")}</div>
              </div>
            )}
            {isSyndicate && cosmetic.type === "background" && (
              <div className="text-center">
                <div className="text-4xl drop-shadow-lg">🏠</div>
                <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-white/60">{t("cosmetics.types.background")}</div>
              </div>
            )}
            {isSyndicate && cosmetic.type === "banner" && (
              <div className="text-center">
                <div className="text-5xl drop-shadow-lg">{cosmetic.preview}</div>
                <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("cosmetics.types.banner")}</div>
              </div>
            )}
            {isSyndicate && cosmetic.type === "persona" && (
              <div className="text-center">
                <div className="text-5xl drop-shadow-lg">{cosmetic.preview}</div>
                <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("cosmetics.types.persona")}</div>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="px-4 pb-2">
          <h3 className="font-black text-sm text-foreground tracking-tight">{cosmetic.name}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{cosmetic.description}</p>
        </div>

        {/* Action bar */}
        <div className="px-4 pb-4 pt-2">
          {isSyndicate && !hasPass ? (
            <Button disabled variant="secondary" className="w-full text-xs font-black h-10 opacity-60">
              <Lock className="w-4 h-4 mr-2" />
              {t("cosmetics.requiresPass")}
            </Button>
          ) : !isOwned ? (
            <Button
              onClick={() => handleBuy(cosmetic)}
              disabled={!canAfford || buyingId === cosmetic.id}
              className={cn(
                "w-full text-xs font-black h-10 transition-all",
                canAfford
                  ? "bg-gradient-to-r from-yellow-500 to-amber-500 text-black hover:from-yellow-400 hover:to-amber-400 shadow-lg shadow-yellow-500/20"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {t("cosmetics.unlockForWins", { count: cosmetic.cost || 0 })}
            </Button>
          ) : (
            <Button
              onClick={() => handleEquip(cosmetic)}
              variant={isEquipped ? "default" : "outline"}
              className={cn(
                "w-full text-xs font-black h-10",
                isEquipped && "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              )}
            >
              {isEquipped ? t("cosmetics.equippedClickToUnequip") : t("cosmetics.equipItem")}
            </Button>
          )}
        </div>
      </motion.div>
    );
  };

  const renderLootCosmeticCard = (item: typeof LOOT_COSMETICS_META[0]) => {
    const isOwned = owned.has(item.id);
    const isEquipped = equipped[item.type] === item.id;
    const tierColor = LOOT_TIER_COLORS[item.tier] || LOOT_TIER_COLORS.common;
    const tierBg = LOOT_TIER_BG[item.tier] || LOOT_TIER_BG.common;
    const ringColor = tierColor.replace("text-", "border-");
    const name = t(`lootCrate.items.${item.id}`, item.id);

    return (
      <motion.div
        key={item.id}
        whileHover={isOwned ? { scale: 1.03, y: -4 } : {}}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 p-0 transition-all",
          isEquipped ? ringColor : isOwned ? "border-primary/30" : "border-border/60 opacity-70"
        )}
      >
        <div className="relative flex items-center justify-between px-4 pt-4 pb-2">
          <div className={cn("px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border", tierBg, tierColor)}>
            {t(`lootCrate.tiers.${item.tier}`, item.tier)}
          </div>
          {isEquipped && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] font-black uppercase">
              <Check className="w-3 h-3" /> {t("cosmetics.equipped")}
            </span>
          )}
          {isOwned && !isEquipped && (
            <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase">{t("cosmetics.owned")}</span>
          )}
        </div>

        <div className="relative px-4 pb-4">
          <div className={cn("rounded-xl flex items-center justify-center min-h-[110px] border border-border/50", isOwned ? tierBg : "bg-gradient-to-b from-muted/30 to-muted/10")}>
            {item.type === "chat_border" && (
              <div className={cn("p-3 rounded-lg text-sm font-bold text-foreground border-2 w-[90%] text-center shadow-sm", isOwned ? item.preview : "border-border")}>
                🔥 {t("cosmetics.chatBorderPreview")}
              </div>
            )}
            {item.type === "name_color" && (
              <div className="text-center">
                <div className={cn("text-3xl font-black tracking-tight", isOwned ? item.preview : "text-muted-foreground")}>AGENT_47</div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("cosmetics.usernamePreview")}</span>
              </div>
            )}
            {item.type === "avatar_frame" && (
              <div className="relative">
                <div className="text-5xl relative z-10">🕵️</div>
                <div className={cn("absolute -inset-3 rounded-full border-[3px]", isOwned ? cn(FRAME_RING_STYLES[item.preview] || DEFAULT_FRAME_RING, "animate-pulse") : "border-border")} />
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pb-2">
          <h3 className="font-black text-sm text-foreground tracking-tight">{name}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{t("cosmetics.lootCrateOnly", "Only available from Loot Crates.")}</p>
        </div>

        <div className="px-4 pb-4 pt-2">
          {!isOwned ? (
            <Button disabled variant="secondary" className="w-full text-xs font-black h-10 opacity-60">
              <Lock className="w-4 h-4 mr-2" />
              {t("cosmetics.notYetUnlocked", "Not Yet Unlocked")}
            </Button>
          ) : (
            <Button
              onClick={() => handleEquip(item)}
              variant={isEquipped ? "default" : "outline"}
              className={cn("w-full text-xs font-black h-10", isEquipped && "bg-primary text-primary-foreground shadow-lg shadow-primary/20")}
            >
              {isEquipped ? t("cosmetics.equippedClickToUnequip") : t("cosmetics.equipItem")}
            </Button>
          )}
        </div>
      </motion.div>
    );
  };

  const SECTIONS = [
    { title: t("cosmetics.sections.personas"), icon: "🎭", items: SYNDICATE_COSMETICS.filter(c => c.type === "persona") },
    { title: t("cosmetics.sections.accessories"), icon: "🎧", items: SYNDICATE_COSMETICS.filter(c => c.type === "accessory") },
    { title: t("cosmetics.sections.clothing"), icon: "🪑", items: SYNDICATE_COSMETICS.filter(c => c.type === "clothing") },
    { title: t("cosmetics.sections.backgrounds"), icon: "🎨", items: SYNDICATE_COSMETICS.filter(c => c.type === "background") },
    { title: t("cosmetics.sections.banners"), icon: "🏛️", items: SYNDICATE_COSMETICS.filter(c => c.type === "banner") },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-destructive/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-black font-serif uppercase tracking-wider text-foreground">{t("cosmetics.title")}</h1>
        </div>

        {/* Wins Balance */}
        <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{t("cosmetics.availableWins")}</p>
              <p className="text-4xl font-black font-mono text-yellow-400">{userWins}</p>
            </div>
            <Sparkles className="w-12 h-12 text-yellow-400" />
          </div>
        </div>

        {/* THE SYNDICATE PASS */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <Crown className="w-6 h-6 text-amber-500" />
            <h2 className="text-lg font-black uppercase tracking-widest text-foreground">{t("store.syndicatePassName")}</h2>
            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">{t("cosmetics.premium")}</span>
          </div>

          {!hasPass && (
            <div className="bg-card/80 backdrop-blur ring-1 ring-amber-500/20 rounded-2xl p-6 mb-6 border border-amber-500/10">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="text-6xl">🎩</div>
                <div className="flex-1 text-center md:text-left">
                  <h3 className="text-xl font-black text-foreground mb-2">{t("cosmetics.unlockPassTitle")}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("cosmetics.unlockPassDescription")}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-500 text-xs font-bold">{t("cosmetics.twoLegendaryPersonas")}</span>
                    <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-500 text-xs font-bold">{t("cosmetics.eightGoldItems")}</span>
                    <span className="px-2 py-1 rounded bg-slate-500/10 text-slate-400 text-xs font-bold">{t("cosmetics.tenSilverItems")}</span>
                  </div>
                  <Button
                    className="bg-amber-500 hover:bg-amber-600 text-black font-black"
                    onClick={async () => {
                      if (!isSupabaseReady()) {
                        return;
                      }
                      const supabase = getSupabase();
                      const { data } = await supabase.auth.getSession();
                      const token = data.session?.access_token;
                      if (!token) return;
                      try {
                        const res = await fetch("/api/stripe/syndicate-checkout", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                            ...(localStorage.getItem("mafia_mfa_token") ? { "x-mfa-token": localStorage.getItem("mafia_mfa_token")! } : {}),
                          },
                        });
                        const data2 = await res.json();
                        if (res.ok && data2.url) {
                          window.location.href = data2.url;
                        }
                        // No fallback here on purpose — a real purchase only ever
                        // completes through the Stripe redirect above, then gets
                        // confirmed by the webhook against account_syndicate_pass.
                        // Granting the pass locally on any failure would let anyone
                        // get it for free just by blocking this request.
                      } catch {
                        // Same as above — no local fallback.
                      }
                    }}
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    {t("cosmetics.unlockPassButton")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {hasPass && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6 flex items-center gap-3">
              <Crown className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-bold text-amber-500">{t("cosmetics.passActiveAllUnlocked")}</span>
            </div>
          )}

          {/* Syndicate Items by Category */}
          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">{section.title}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.items.map((item) => renderCosmeticCard(item, true))}
              </div>
            </div>
          ))}
        </div>

        {/* Regular Win-Unlockable Cosmetics */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-black uppercase tracking-widest text-foreground">{t("cosmetics.winUnlockables")}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {WIN_COSMETICS.map((cosmetic) => renderCosmeticCard(cosmetic, false))}
          </div>
        </div>

        {/* Loot Crate Collection — earned via LootCrate.tsx, ownership is
            server-authoritative (see the useEffect near the top of this file) */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Diamond className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-black uppercase tracking-widest text-foreground">{t("cosmetics.lootCrateCollection", "Loot Crate Collection")}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {LOOT_COSMETICS_META.map((item) => renderLootCosmeticCard(item))}
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>
          {t("common.backToHome")}
        </Button>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, Lock, Check, Crown, Diamond, Flame, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    return localStorage.getItem("mafia_syndicate_pass") === "true";
  });

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

  const handleBuy = (cosmetic: any) => {
    if (stats.wins >= cosmetic.cost) {
      const newOwned = new Set(owned);
      newOwned.add(cosmetic.id);
      setOwned(newOwned);
      localStorage.setItem("mafia_cosmetics", JSON.stringify(Array.from(newOwned)));

      const newStats = { ...stats, wins: stats.wins - cosmetic.cost };
      setStats(newStats);
      localStorage.setItem("mafia_stats", JSON.stringify(newStats));
      window.dispatchEvent(new Event("storage"));
    }
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

  const userWins = stats.wins || 0;

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
                  cosmetic.preview === "diamond" ? "border-cyan-400/60 shadow-[0_0_20px_rgba(34,211,238,0.3)]" :
                  cosmetic.preview === "fire" ? "border-orange-500/60 shadow-[0_0_20px_rgba(249,115,22,0.3)]" :
                  "border-yellow-400/60 shadow-[0_0_20px_rgba(250,204,21,0.3)]"
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
              disabled={!canAfford}
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
                      try {
                        const res = await fetch("/api/stripe/syndicate-checkout", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                        });
                        const data = await res.json();
                        if (res.ok && data.url) {
                          window.location.href = data.url;
                        } else {
                          // Fallback: demo mode — unlock locally
                          localStorage.setItem("mafia_syndicate_pass", "true");
                          setHasPass(true);
                        }
                      } catch {
                        // Fallback: demo mode — unlock locally
                        localStorage.setItem("mafia_syndicate_pass", "true");
                        setHasPass(true);
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

        <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>
          {t("common.backToHome")}
        </Button>
      </div>
    </div>
  );
}

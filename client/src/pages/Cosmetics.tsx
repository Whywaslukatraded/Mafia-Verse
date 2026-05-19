import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, Lock, Check, Crown, Diamond, Flame, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WIN_COSMETICS = [
  { id: "border_gold", name: "Golden Chat Border", type: "chat_border", cost: 5, currency: "wins", preview: "border-yellow-500/50 bg-yellow-500/5", description: "Luxurious gold border for your chat messages" },
  { id: "border_red", name: "Red Chat Border", type: "chat_border", cost: 3, currency: "wins", preview: "border-red-500/50 bg-red-500/5", description: "Menacing red border - perfect for Mafia role" },
  { id: "border_blue", name: "Blue Chat Border", type: "chat_border", cost: 3, currency: "wins", preview: "border-blue-500/50 bg-blue-500/5", description: "Detective's signature blue" },
  { id: "name_color_gold", name: "Gold Name Color", type: "name_color", cost: 5, currency: "wins", preview: "text-yellow-400", description: "Stand out with golden text" },
  { id: "name_color_red", name: "Red Name Color", type: "name_color", cost: 3, currency: "wins", preview: "text-red-400", description: "Menacing red username" },
  { id: "name_color_cyan", name: "Cyan Name Color", type: "name_color", cost: 3, currency: "wins", preview: "text-cyan-400", description: "Futuristic cyan" },
  { id: "frame_diamond", name: "Diamond Avatar Frame", type: "avatar_frame", cost: 10, currency: "wins", preview: "diamond", description: "Premium diamond frame for your avatar" },
  { id: "frame_fire", name: "Fire Avatar Frame", type: "avatar_frame", cost: 8, currency: "wins", preview: "fire", description: "Burning hot avatar frame" },
  { id: "frame_crown", name: "Crown Avatar Frame", type: "avatar_frame", cost: 7, currency: "wins", preview: "crown", description: "Royal crown frame" },
];

const SYNDICATE_COSMETICS = [
  // Accessories
  { id: "synd_acc_mask", name: "Phantom Mask", type: "accessory", tier: "gold", preview: "🪇", description: "A mysterious mask worn only by the inner circle" },
  { id: "synd_acc_cigar", name: "Boss Cigar", type: "accessory", tier: "gold", preview: "🚬", description: "Smoke of authority" },
  { id: "synd_acc_scar", name: "Battle Scar", type: "accessory", tier: "silver", preview: "⚔️", description: "Earned in the streets" },
  { id: "synd_acc_chain", name: "Gold Chain", type: "accessory", tier: "silver", preview: "📿", description: "Solid gold, no cap" },
  // Clothing
  { id: "synd_cloak", name: "Shadow Cloak", type: "clothing", tier: "gold", preview: "🧫", description: "Melt into the night" },
  { id: "synd_suit", name: "Don Suit", type: "clothing", tier: "gold", preview: "🥑", description: "Three-piece respect" },
  { id: "synd_trench", name: "Trench Coat", type: "clothing", tier: "silver", preview: "🪓", description: "Detective noir vibes" },
  { id: "synd_hoodie", name: "Syndicate Hoodie", type: "clothing", tier: "silver", preview: "🎭", description: "Rep the family" },
  // Backgrounds
  { id: "synd_bg_smoke", name: "Cigar Smoke", type: "background", tier: "gold", preview: "bg-stone-800", description: "Thick smoke in a backroom" },
  { id: "synd_bg_vault", name: "Vault Gold", type: "background", tier: "gold", preview: "bg-yellow-900/20", description: "Stacks of gold bars" },
  { id: "synd_bg_neon", name: "Neon Alley", type: "background", tier: "silver", preview: "bg-purple-900/20", description: "Rain-slicked neon streets" },
  { id: "synd_bg_cell", name: "The Cell", type: "background", tier: "silver", preview: "bg-zinc-800", description: "Concrete walls, dim light" },
  // Banners
  { id: "synd_banner_kingpin", name: "Kingpin Banner", type: "banner", tier: "gold", preview: "👑", description: "Crown the king of the city" },
  { id: "synd_banner_mercenary", name: "Mercenary Banner", type: "banner", tier: "gold", preview: "🛡️", description: "Hired muscle, feared by all" },
  { id: "synd_banner_informant", name: "Informant Banner", type: "banner", tier: "silver", preview: "💬", description: "Whispers in the dark" },
  { id: "synd_banner_cleaner", name: "Cleaner Banner", type: "banner", tier: "silver", preview: "🧹", description: "No evidence, no problem" },
  // Personas
  { id: "synd_persona_godfather", name: "The Godfather", type: "persona", tier: "legendary", preview: "👴", description: "Respect is everything. Silence is power." },
  { id: "synd_persona_fixer", name: "The Fixer", type: "persona", tier: "legendary", preview: "🎭", description: "Problems disappear. Questions don't." },
  { id: "synd_persona_enforcer", name: "The Enforcer", type: "persona", tier: "gold", preview: "🛡️", description: "Loyalty through strength." },
  { id: "synd_persona_snitch", name: "The Snitch", type: "persona", tier: "gold", preview: "👨‍🕵️", description: "Information is currency." },
];

const TIER_CONFIG = {
  legendary: { label: "LEGENDARY", icon: Crown, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", ring: "ring-yellow-500/60" },
  gold: { label: "GOLD", icon: Star, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/30", ring: "ring-amber-500/60" },
  silver: { label: "SILVER", icon: Diamond, color: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/30", ring: "ring-slate-500/60" },
};

export default function Cosmetics() {
  const [, setLocation] = useLocation();
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
      const saved = localStorage.getItem("mafia_stats");
      if (saved) setStats(JSON.parse(saved));
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
    const isOwned = owned.has(cosmetic.id);
    const isEquipped = equipped[cosmetic.type] === cosmetic.id;
    const canAfford = userWins >= (cosmetic.cost || 0);
    const tier = isSyndicate ? TIER_CONFIG[cosmetic.tier as keyof typeof TIER_CONFIG] : null;
    const TierIcon = tier?.icon;

    return (
      <motion.div
        key={cosmetic.id}
        whileHover={{ scale: 1.02 }}
        className={cn(
          "bg-card/80 backdrop-blur ring-1 rounded-xl p-4 transition-all relative overflow-hidden",
          isOwned ? "ring-primary/40 bg-primary/5" : isSyndicate && !hasPass ? "ring-border opacity-60" : "ring-border",
          isEquipped && (tier ? tier.ring : "ring-2 ring-yellow-500/60")
        )}
      >
        {/* Tier Badge */}
        {tier && (
          <div className={cn("absolute top-2 right-2 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider flex items-center gap-1", tier.bg, tier.color, tier.border, "border")}>
            {TierIcon && <TierIcon className="w-3 h-3" />}
            {tier.label}
          </div>
        )}

        <div className="flex items-start justify-between mb-3 pr-16">
          <div>
            <h3 className="font-bold text-foreground">{cosmetic.name}</h3>
            <p className="text-[10px] text-muted-foreground mt-1">{cosmetic.description}</p>
          </div>
          {isEquipped && !isSyndicate && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <Check className="w-5 h-5 text-yellow-400" />
            </motion.div>
          )}
          {isEquipped && isSyndicate && tier && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <Check className={cn("w-5 h-5", tier.color)} />
            </motion.div>
          )}
        </div>

        {/* Preview */}
        <div className="mb-4 p-3 bg-muted/50 rounded-lg border border-border flex items-center justify-center min-h-[48px]">
          {cosmetic.type === "chat_border" && (
            <div className={cn("p-2 rounded text-sm text-foreground border w-full", cosmetic.preview)}>
              Sample message
            </div>
          )}
          {cosmetic.type === "name_color" && (
            <div className={cn("text-xl font-bold", cosmetic.preview)}>
              {cosmetic.name.split(" ")[0]}
            </div>
          )}
          {cosmetic.type === "avatar_frame" && (
            <div className="text-3xl">✨ {cosmetic.preview === "diamond" ? "💎" : cosmetic.preview === "fire" ? "🔥" : "👑"}</div>
          )}
          {isSyndicate && (cosmetic.type === "accessory" || cosmetic.type === "clothing" || cosmetic.type === "background" || cosmetic.type === "banner" || cosmetic.type === "persona") && (
            <div className="text-center">
              <div className="text-3xl mb-1">{cosmetic.preview}</div>
              <span className="text-[10px] text-muted-foreground uppercase">{cosmetic.type}</span>
            </div>
          )}
        </div>

        {/* Action */}
        <div className="flex gap-2">
          {isSyndicate && !hasPass ? (
            <Button disabled variant="secondary" className="flex-1 text-xs font-bold">
              <Lock className="w-3 h-3 mr-1" />
              Syndicate Pass Required
            </Button>
          ) : !isOwned ? (
            <Button
              onClick={() => handleBuy(cosmetic)}
              disabled={!canAfford}
              className="flex-1 text-xs font-bold"
              variant={canAfford ? "default" : "secondary"}
            >
              <Sparkles className="w-3 h-3 mr-1" />
              {cosmetic.cost || 0}
            </Button>
          ) : (
            <Button
              onClick={() => handleEquip(cosmetic)}
              variant={isEquipped ? "default" : "outline"}
              className="flex-1 text-xs font-bold"
            >
              {isEquipped ? "Equipped" : "Equip"}
            </Button>
          )}
        </div>
      </motion.div>
    );
  };

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
          <h1 className="text-2xl font-black font-serif uppercase tracking-wider text-foreground">Cosmetics Shop</h1>
        </div>

        {/* Wins Balance */}
        <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Available Wins</p>
              <p className="text-4xl font-black font-mono text-yellow-400">{userWins}</p>
            </div>
            <Sparkles className="w-12 h-12 text-yellow-400" />
          </div>
        </div>

        {/* THE SYNDICATE PASS */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <Crown className="w-6 h-6 text-amber-500" />
            <h2 className="text-lg font-black uppercase tracking-widest text-foreground">The Syndicate Pass</h2>
            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">Premium</span>
          </div>

          {!hasPass && (
            <div className="bg-card/80 backdrop-blur ring-1 ring-amber-500/20 rounded-2xl p-6 mb-6 border border-amber-500/10">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="text-6xl">🎩</div>
                <div className="flex-1 text-center md:text-left">
                  <h3 className="text-xl font-black text-foreground mb-2">Unlock The Syndicate Pass</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Get access to 20+ exclusive cosmetics including legendary personas,
                    gold-tier accessories, and syndicate-only backgrounds.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-500 text-xs font-bold">2 Legendary Personas</span>
                    <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-500 text-xs font-bold">8 Gold Items</span>
                    <span className="px-2 py-1 rounded bg-slate-500/10 text-slate-400 text-xs font-bold">10 Silver Items</span>
                  </div>
                  <Button
                    className="bg-amber-500 hover:bg-amber-600 text-black font-black"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/stripe/checkout-session", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                        });
                        const data = await res.json();
                        if (res.ok && data.url) {
                          window.location.href = data.url;
                        } else {
                          // Fallback: if Stripe isn't connected yet, unlock locally for demo
                          localStorage.setItem("mafia_syndicate_pass", "true");
                          setHasPass(true);
                        }
                      } catch {
                        // Fallback: unlock locally for demo
                        localStorage.setItem("mafia_syndicate_pass", "true");
                        setHasPass(true);
                      }
                    }}
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    Unlock Pass ($4.99)
                  </Button>
                </div>
              </div>
            </div>
          )}

          {hasPass && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6 flex items-center gap-3">
              <Crown className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-bold text-amber-500">Syndicate Pass Active — All Items Unlocked</span>
            </div>
          )}

          {/* Syndicate Items by Category */}
          {[
            { title: "Personas", icon: "🎭", items: SYNDICATE_COSMETICS.filter(c => c.type === "persona") },
            { title: "Accessories", icon: "🎧", items: SYNDICATE_COSMETICS.filter(c => c.type === "accessory") },
            { title: "Clothing", icon: "🪑", items: SYNDICATE_COSMETICS.filter(c => c.type === "clothing") },
            { title: "Backgrounds", icon: "🎨", items: SYNDICATE_COSMETICS.filter(c => c.type === "background") },
            { title: "Banners", icon: "🏛️", items: SYNDICATE_COSMETICS.filter(c => c.type === "banner") },
          ].map((section) => (
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
            <h2 className="text-lg font-black uppercase tracking-widest text-foreground">Win Unlockables</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {WIN_COSMETICS.map((cosmetic) => renderCosmeticCard(cosmetic, false))}
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}

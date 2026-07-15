import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Coins, Sparkles, X, Gift, Star, Diamond, Crown, Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  100+ ITEMS — 5 RARITY TIERS                                       */
/* ------------------------------------------------------------------ */

const RARITY_WEIGHTS = {
  common:    45,
  rare:      25,
  epic:      15,
  legendary: 10,
  mythic:     5,
};

// Item names are translated via lootCrate.items.<id> in the locale files;
// credit items compute their display name dynamically instead of storing
// "N Credits" as a literal string.
const LOOT_ITEMS = [
  /* ---------- COMMON (chat borders + name colours) ---------- */
  { id: "lc_border_grey",   type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_olive",  type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_tan",    type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_navy",   type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_teal",   type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_mint",   type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_lav",    type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_coral",  type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_peach",  type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_ink",    type: "chat_border",  tier: "common", weight: 5 },

  { id: "lc_name_grey",     type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_olive",    type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_tan",      type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_navy",     type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_teal",     type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_mint",     type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_lav",      type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_coral",    type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_peach",    type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_ink",      type: "name_color",   tier: "common", weight: 5 },

  { id: "lc_1c",  credits: 1,  type: "credits", tier: "common", weight: 10 },
  { id: "lc_2c",  credits: 2,  type: "credits", tier: "common", weight: 8 },
  { id: "lc_3c",  credits: 3,  type: "credits", tier: "common", weight: 6 },
  { id: "lc_4c",  credits: 4,  type: "credits", tier: "common", weight: 4 },
  { id: "lc_5c",  credits: 5,  type: "credits", tier: "common", weight: 3 },

  /* ---------- RARE (chat borders + name colours + avatar frames) ---------- */
  { id: "lc_border_gold",     type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_silver",   type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_bronze",   type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_ruby",     type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_sapphire", type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_emerald",  type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_amethyst", type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_amber",    type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_jade",     type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_onyx",     type: "chat_border",  tier: "rare", weight: 4 },

  { id: "lc_name_gold",       type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_silver",     type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_bronze",     type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_ruby",       type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_sapphire",   type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_emerald",    type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_amethyst",   type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_amber",      type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_jade",       type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_onyx",       type: "name_color",   tier: "rare", weight: 4 },

  { id: "lc_frame_steel",     type: "avatar_frame", tier: "rare", weight: 3 },
  { id: "lc_frame_bronze",    type: "avatar_frame", tier: "rare", weight: 3 },
  { id: "lc_frame_silver",    type: "avatar_frame", tier: "rare", weight: 3 },
  { id: "lc_frame_wood",      type: "avatar_frame", tier: "rare", weight: 3 },
  { id: "lc_frame_ivy",       type: "avatar_frame", tier: "rare", weight: 3 },

  { id: "lc_6c",  credits: 6,  type: "credits", tier: "rare", weight: 4 },
  { id: "lc_7c",  credits: 7,  type: "credits", tier: "rare", weight: 3 },
  { id: "lc_8c",  credits: 8,  type: "credits", tier: "rare", weight: 2 },
  { id: "lc_10c", credits: 10, type: "credits", tier: "rare", weight: 2 },

  /* ---------- EPIC (avatar frames + emotes) ---------- */
  { id: "lc_frame_diamond",   type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_fire",      type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_crown",     type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_ice",       type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_shadow",    type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_neon",      type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_goldleaf",  type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_cyber",     type: "avatar_frame", tier: "epic", weight: 3 },

  { id: "lc_emote_gun",       type: "emote", tier: "epic", weight: 2 },
  { id: "lc_emote_hood",      type: "emote", tier: "epic", weight: 2 },
  { id: "lc_emote_cigar",     type: "emote", tier: "epic", weight: 2 },
  { id: "lc_emote_glass",     type: "emote", tier: "epic", weight: 2 },
  { id: "lc_emote_ring",      type: "emote", tier: "epic", weight: 2 },

  { id: "lc_12c", credits: 12, type: "credits", tier: "epic", weight: 3 },
  { id: "lc_15c", credits: 15, type: "credits", tier: "epic", weight: 2 },
  { id: "lc_20c", credits: 20, type: "credits", tier: "epic", weight: 1 },

  /* ---------- LEGENDARY (rare frames + emotes + title) ---------- */
  { id: "lc_frame_dragon",    type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_angel",     type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_demon",     type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_royal",     type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_thorn",     type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_legend",    type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_ghost",     type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_moon",      type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_sun",       type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_void",      type: "avatar_frame", tier: "legendary", weight: 2 },

  { id: "lc_emote_kingpin",    type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_enforcer",   type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_mastermind", type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_don",        type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_silencer",   type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_legend",     type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_myth",       type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_boss",       type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_godfather",  type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_shadow",     type: "emote", tier: "legendary", weight: 2 },

  { id: "lc_title_made",         type: "title", tier: "legendary", weight: 2 },
  { id: "lc_title_capo",         type: "title", tier: "legendary", weight: 2 },
  { id: "lc_title_consigliere",  type: "title", tier: "legendary", weight: 2 },
  { id: "lc_title_underboss",    type: "title", tier: "legendary", weight: 2 },

  { id: "lc_25c", credits: 25, type: "credits", tier: "legendary", weight: 2 },
  { id: "lc_30c", credits: 30, type: "credits", tier: "legendary", weight: 1 },
  { id: "lc_50c", credits: 50, type: "credits", tier: "legendary", weight: 1 },

  /* ---------- MYTHIC (1-of-a-kind) ---------- */
  { id: "lc_frame_godfather", type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_immortal",  type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_celestial", type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_doom",      type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_phoenix",   type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_eclipse",   type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_nexus",     type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_overlord",  type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_titan",     type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_omega",     type: "avatar_frame", tier: "mythic", weight: 1 },

  { id: "lc_emote_omega",     type: "emote", tier: "mythic", weight: 1 },
  { id: "lc_emote_overlord",  type: "emote", tier: "mythic", weight: 1 },
  { id: "lc_emote_immortal",  type: "emote", tier: "mythic", weight: 1 },
  { id: "lc_emote_celestial", type: "emote", tier: "mythic", weight: 1 },
  { id: "lc_emote_doom",      type: "emote", tier: "mythic", weight: 1 },

  { id: "lc_title_don",       type: "title", tier: "mythic", weight: 1 },
  { id: "lc_title_godfather", type: "title", tier: "mythic", weight: 1 },
  { id: "lc_title_overlord",  type: "title", tier: "mythic", weight: 1 },
  { id: "lc_title_immortal",  type: "title", tier: "mythic", weight: 1 },

  { id: "lc_100c", credits: 100, type: "credits", tier: "mythic", weight: 1 },
  { id: "lc_250c", credits: 250, type: "credits", tier: "mythic", weight: 1 },
];

const TIER_COLORS: Record<string, string> = {
  common:    "text-gray-400",
  rare:      "text-blue-400",
  epic:      "text-purple-400",
  legendary: "text-yellow-400",
  mythic:    "text-rose-400",
};

const TIER_BG: Record<string, string> = {
  common:    "bg-gray-500/10 border-gray-500/20",
  rare:      "bg-blue-500/10 border-blue-500/20",
  epic:      "bg-purple-500/10 border-purple-500/20",
  legendary: "bg-yellow-500/10 border-yellow-500/20",
  mythic:    "bg-rose-500/10 border-rose-500/20",
};

function getCredits(): number {
  try {
    const s = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
    return s.credits || 0;
  } catch { return 0; }
}

function addCredits(amount: number) {
  try {
    const s = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
    s.credits = (s.credits || 0) + amount;
    localStorage.setItem("mafia_stats", JSON.stringify(s));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

function hasItem(id: string): boolean {
  try {
    const owned = JSON.parse(localStorage.getItem("mafia_cosmetics_owned") || "[]");
    return owned.includes(id);
  } catch { return false; }
}

function addOwnedItem(id: string) {
  try {
    const owned = new Set(JSON.parse(localStorage.getItem("mafia_cosmetics_owned") || "[]"));
    owned.add(id);
    localStorage.setItem("mafia_cosmetics_owned", JSON.stringify(Array.from(owned)));
  } catch {}
}

function rollLoot() {
  const totalWeight = LOOT_ITEMS.reduce((sum, i) => sum + i.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const item of LOOT_ITEMS) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return LOOT_ITEMS[0];
}

const CRATE_COST = 15;

export function LootCrate({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [credits, setCredits] = useState(getCredits);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<typeof LOOT_ITEMS[0] | null>(null);
  const [revealed, setRevealed] = useState(false);

  const getItemName = (item: typeof LOOT_ITEMS[0]) =>
    item.type === "credits" ? t("lootCrate.creditsAmount", { count: item.credits }) : t(`lootCrate.items.${item.id}`);

  const tierLabel = (tier: string) => t(`cosmetics.tiers.${tier}`, tier);

  const open = useCallback(() => {
    if (credits < CRATE_COST || spinning) return;
    addCredits(-CRATE_COST);
    setCredits(getCredits);
    setSpinning(true);
    setResult(null);
    setRevealed(false);

    setTimeout(() => {
      const item = rollLoot();
      setResult(item);
      setSpinning(false);

      setTimeout(() => {
        setRevealed(true);
        if (item.type === "credits") {
          addCredits(item.credits || 0);
          setCredits(getCredits);
        } else {
          addOwnedItem(item.id);
        }
      }, 800);
    }, 2000);
  }, [credits, spinning]);

  const canAfford = credits >= CRATE_COST;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="relative bg-card border border-border rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-purple-500/20 via-pink-500/10 to-purple-500/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Box className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{t("lootCrate.title")}</h2>
                <p className="text-xs text-muted-foreground">{t("lootCrate.subtitle")}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">{t("lootCrate.yourCredits")}</span>
            </div>
            <span className="text-sm font-bold text-amber-500">{credits}</span>
          </div>

          <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">{t("lootCrate.crateCost")}</span>
            </div>
            <span className="text-sm font-bold text-purple-500">{t("lootCrate.creditsAmount", { count: CRATE_COST })}</span>
          </div>

          <div className="text-xs text-center text-muted-foreground">
            <span className="text-gray-400">{t("cosmetics.tiers.common", "Common")}</span> • <span className="text-blue-400">{t("lootCrate.rare")}</span> • <span className="text-purple-400">{t("lootCrate.epic")}</span> • <span className="text-yellow-400">{t("cosmetics.tiers.legendary")}</span> • <span className="text-rose-400">{t("lootCrate.mythic")}</span>
          </div>

          <AnimatePresence mode="wait">
            {spinning ? (
              <motion.div
                key="spinning"
                className="py-8 flex flex-col items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  animate={{ rotate: [0, 360, 720, 1080, 1440], scale: [1, 1.2, 1, 1.1, 1] }}
                  transition={{ duration: 2, ease: "easeInOut" }}
                >
                  <Box className="w-16 h-16 text-purple-500" />
                </motion.div>
                <p className="mt-4 text-sm font-bold text-foreground">{t("lootCrate.opening")}</p>
              </motion.div>
            ) : result ? (
              <motion.div
                key="result"
                className="py-4 text-center"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <motion.div
                  animate={revealed ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 0.4 }}
                  className={`inline-block p-4 rounded-xl border ${TIER_BG[result.tier]}`}
                >
                  {result.type === "credits" ? (
                    <Coins className="w-10 h-10 text-amber-500 mx-auto" />
                  ) : (
                    <Gift className="w-10 h-10 text-purple-500 mx-auto" />
                  )}
                  <p className={`mt-2 font-black text-lg ${TIER_COLORS[result.tier]}`}>{getItemName(result)}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{tierLabel(result.tier)}</p>
                </motion.div>
                {revealed && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-3 text-sm text-muted-foreground"
                  >
                    {result.type === "credits"
                      ? t("lootCrate.addedToBalance", { name: getItemName(result) })
                      : t("lootCrate.addedToCollection")}
                  </motion.p>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="ready"
                className="py-4 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Box className="w-14 h-14 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-bold text-foreground">{t("lootCrate.feelingLucky")}</p>
                <p className="text-xs text-muted-foreground">{t("lootCrate.openForChance")}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            className="w-full gap-2"
            disabled={!canAfford || spinning}
            onClick={open}
          >
            <Sparkles className="w-4 h-4" />
            {spinning ? t("lootCrate.opening") : canAfford ? t("lootCrate.openCrate", { count: CRATE_COST }) : t("lootCrate.notEnoughCredits")}
          </Button>

          {!canAfford && !spinning && (
            <p className="text-xs text-center text-muted-foreground">
              {t("lootCrate.earnMoreCredits")}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

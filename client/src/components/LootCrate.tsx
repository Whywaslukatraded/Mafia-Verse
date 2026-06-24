import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Coins, Sparkles, X, Gift, Star, Diamond, Crown, Flame } from "lucide-react";
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

const LOOT_ITEMS = [
  /* ---------- COMMON (chat borders + name colours) ---------- */
  { id: "lc_border_grey",   name: "Ash Border",       type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_olive", name: "Olive Border",     type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_tan",   name: "Tan Border",       type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_navy",  name: "Navy Border",      type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_teal",  name: "Teal Border",      type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_mint",  name: "Mint Border",      type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_lav",   name: "Lavender Border",  type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_coral", name: "Coral Border",     type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_peach", name: "Peach Border",     type: "chat_border",  tier: "common", weight: 5 },
  { id: "lc_border_ink",   name: "Ink Border",       type: "chat_border",  tier: "common", weight: 5 },

  { id: "lc_name_grey",    name: "Ash Name",         type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_olive",   name: "Olive Name",       type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_tan",     name: "Tan Name",         type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_navy",    name: "Navy Name",        type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_teal",    name: "Teal Name",        type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_mint",    name: "Mint Name",        type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_lav",     name: "Lavender Name",    type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_coral",   name: "Coral Name",       type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_peach",   name: "Peach Name",       type: "name_color",   tier: "common", weight: 5 },
  { id: "lc_name_ink",     name: "Ink Name",         type: "name_color",   tier: "common", weight: 5 },

  { id: "lc_1c",   name: "1 Credit",   type: "credits", tier: "common", weight: 10 },
  { id: "lc_2c",   name: "2 Credits",  type: "credits", tier: "common", weight: 8 },
  { id: "lc_3c",   name: "3 Credits",  type: "credits", tier: "common", weight: 6 },
  { id: "lc_4c",   name: "4 Credits",  type: "credits", tier: "common", weight: 4 },
  { id: "lc_5c",   name: "5 Credits",  type: "credits", tier: "common", weight: 3 },

  /* ---------- RARE (chat borders + name colours + avatar frames) ---------- */
  { id: "lc_border_gold",   name: "Golden Border",   type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_silver", name: "Silver Border",   type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_bronze", name: "Bronze Border",   type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_ruby",   name: "Ruby Border",     type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_sapphire", name: "Sapphire Border", type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_emerald", name: "Emerald Border",  type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_amethyst", name: "Amethyst Border", type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_amber",   name: "Amber Border",    type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_jade",    name: "Jade Border",     type: "chat_border",  tier: "rare", weight: 4 },
  { id: "lc_border_onyx",    name: "Onyx Border",     type: "chat_border",  tier: "rare", weight: 4 },

  { id: "lc_name_gold",   name: "Gold Name",         type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_silver", name: "Silver Name",       type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_bronze", name: "Bronze Name",       type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_ruby",   name: "Ruby Name",         type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_sapphire", name: "Sapphire Name",   type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_emerald",  name: "Emerald Name",    type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_amethyst", name: "Amethyst Name",   type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_amber",    name: "Amber Name",      type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_jade",     name: "Jade Name",       type: "name_color",   tier: "rare", weight: 4 },
  { id: "lc_name_onyx",     name: "Onyx Name",       type: "name_color",   tier: "rare", weight: 4 },

  { id: "lc_frame_steel",    name: "Steel Frame",      type: "avatar_frame", tier: "rare", weight: 3 },
  { id: "lc_frame_bronze",   name: "Bronze Frame",     type: "avatar_frame", tier: "rare", weight: 3 },
  { id: "lc_frame_silver",   name: "Silver Frame",     type: "avatar_frame", tier: "rare", weight: 3 },
  { id: "lc_frame_wood",     name: "Mahogany Frame",    type: "avatar_frame", tier: "rare", weight: 3 },
  { id: "lc_frame_ivy",      name: "Ivy Frame",        type: "avatar_frame", tier: "rare", weight: 3 },

  { id: "lc_6c",  name: "6 Credits",   type: "credits", tier: "rare", weight: 4 },
  { id: "lc_7c",  name: "7 Credits",   type: "credits", tier: "rare", weight: 3 },
  { id: "lc_8c",  name: "8 Credits",   type: "credits", tier: "rare", weight: 2 },
  { id: "lc_10c", name: "10 Credits",  type: "credits", tier: "rare", weight: 2 },

  /* ---------- EPIC (avatar frames + emotes) ---------- */
  { id: "lc_frame_diamond",  name: "Diamond Frame",   type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_fire",     name: "Fire Frame",      type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_crown",    name: "Crown Frame",     type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_ice",      name: "Ice Frame",       type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_shadow",   name: "Shadow Frame",    type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_neon",     name: "Neon Frame",      type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_goldleaf", name: "Goldleaf Frame",  type: "avatar_frame", tier: "epic", weight: 3 },
  { id: "lc_frame_cyber",    name: "Cyber Frame",     type: "avatar_frame", tier: "epic", weight: 3 },

  { id: "lc_emote_gun",     name: "Finger Gun",       type: "emote", tier: "epic", weight: 2 },
  { id: "lc_emote_hood",    name: "Over the Hood",    type: "emote", tier: "epic", weight: 2 },
  { id: "lc_emote_cigar",   name: "Cigar",            type: "emote", tier: "epic", weight: 2 },
  { id: "lc_emote_glass",   name: "Tumbler",          type: "emote", tier: "epic", weight: 2 },
  { id: "lc_emote_ring",    name: "Boss Ring",        type: "emote", tier: "epic", weight: 2 },

  { id: "lc_12c", name: "12 Credits", type: "credits", tier: "epic", weight: 3 },
  { id: "lc_15c", name: "15 Credits", type: "credits", tier: "epic", weight: 2 },
  { id: "lc_20c", name: "20 Credits", type: "credits", tier: "epic", weight: 1 },

  /* ---------- LEGENDARY (rare frames + emotes + title) ---------- */
  { id: "lc_frame_dragon",  name: "Dragon Frame",    type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_angel",   name: "Seraph Frame",     type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_demon",   name: "Demon Frame",      type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_royal",   name: "Royal Frame",      type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_thorn",   name: "Thorn Frame",      type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_legend",  name: "Legend Frame",     type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_ghost",   name: "Ghost Frame",      type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_moon",    name: "Moonlight Frame",  type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_sun",     name: "Sunburst Frame",   type: "avatar_frame", tier: "legendary", weight: 2 },
  { id: "lc_frame_void",    name: "Void Frame",       type: "avatar_frame", tier: "legendary", weight: 2 },

  { id: "lc_emote_kingpin", name: "Kingpin",          type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_enforcer", name: "The Enforcer",    type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_mastermind", name: "Mastermind",    type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_don",     name: "The Don",          type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_silencer", name: "Silencer",        type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_legend",  name: "Living Legend",    type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_myth",    name: "Urban Myth",       type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_boss",    name: "Final Boss",       type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_godfather", name: "Godfather",      type: "emote", tier: "legendary", weight: 2 },
  { id: "lc_emote_shadow",  name: "Shadow Walker",    type: "emote", tier: "legendary", weight: 2 },

  { id: "lc_title_made",    name: "Title: Made Man",   type: "title", tier: "legendary", weight: 2 },
  { id: "lc_title_capo",    name: "Title: Capo",       type: "title", tier: "legendary", weight: 2 },
  { id: "lc_title_consigliere", name: "Title: Consigliere", type: "title", tier: "legendary", weight: 2 },
  { id: "lc_title_underboss", name: "Title: Underboss", type: "title", tier: "legendary", weight: 2 },

  { id: "lc_25c", name: "25 Credits", type: "credits", tier: "legendary", weight: 2 },
  { id: "lc_30c", name: "30 Credits", type: "credits", tier: "legendary", weight: 1 },
  { id: "lc_50c", name: "50 Credits", type: "credits", tier: "legendary", weight: 1 },

  /* ---------- MYTHIC (1-of-a-kind) ---------- */
  { id: "lc_frame_godfather", name: "Godfather Frame", type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_immortal",  name: "Immortal Frame",  type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_celestial", name: "Celestial Frame", type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_doom",      name: "Doom Frame",      type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_phoenix",   name: "Phoenix Frame",   type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_eclipse",   name: "Eclipse Frame",   type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_nexus",     name: "Nexus Frame",     type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_overlord",  name: "Overlord Frame",  type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_titan",     name: "Titan Frame",     type: "avatar_frame", tier: "mythic", weight: 1 },
  { id: "lc_frame_omega",     name: "Omega Frame",     type: "avatar_frame", tier: "mythic", weight: 1 },

  { id: "lc_emote_omega",    name: "Omega",           type: "emote", tier: "mythic", weight: 1 },
  { id: "lc_emote_overlord", name: "Overlord",        type: "emote", tier: "mythic", weight: 1 },
  { id: "lc_emote_immortal", name: "Immortal",        type: "emote", tier: "mythic", weight: 1 },
  { id: "lc_emote_celestial", name: "Celestial",      type: "emote", tier: "mythic", weight: 1 },
  { id: "lc_emote_doom",     name: "Doom",            type: "emote", tier: "mythic", weight: 1 },

  { id: "lc_title_don",      name: "Title: The Don",          type: "title", tier: "mythic", weight: 1 },
  { id: "lc_title_godfather", name: "Title: Godfather",       type: "title", tier: "mythic", weight: 1 },
  { id: "lc_title_overlord", name: "Title: Overlord",         type: "title", tier: "mythic", weight: 1 },
  { id: "lc_title_immortal", name: "Title: Immortal",         type: "title", tier: "mythic", weight: 1 },

  { id: "lc_100c", name: "100 Credits", type: "credits", tier: "mythic", weight: 1 },
  { id: "lc_250c", name: "250 Credits", type: "credits", tier: "mythic", weight: 1 },
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
  const [credits, setCredits] = useState(getCredits);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<typeof LOOT_ITEMS[0] | null>(null);
  const [revealed, setRevealed] = useState(false);

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
          const val = parseInt(item.name);
          addCredits(val);
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
                <h2 className="text-lg font-bold text-foreground">Loot Crate</h2>
                <p className="text-xs text-muted-foreground">Spend credits, get surprises</p>
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
              <span className="text-sm text-muted-foreground">Your Credits</span>
            </div>
            <span className="text-sm font-bold text-amber-500">{credits}</span>
          </div>

          <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Crate Cost</span>
            </div>
            <span className="text-sm font-bold text-purple-500">{CRATE_COST} Credits</span>
          </div>

          <div className="text-xs text-center text-muted-foreground">
            <span className="text-gray-400">Common</span> • <span className="text-blue-400">Rare</span> • <span className="text-purple-400">Epic</span> • <span className="text-yellow-400">Legendary</span> • <span className="text-rose-400">Mythic</span>
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
                <p className="mt-4 text-sm font-bold text-foreground">Opening...</p>
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
                  <p className={`mt-2 font-black text-lg ${TIER_COLORS[result.tier]}`}>{result.name}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{result.tier}</p>
                </motion.div>
                {revealed && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-3 text-sm text-muted-foreground"
                  >
                    {result.type === "credits"
                      ? `${result.name} added to your balance!`
                      : "Added to your collection!"}
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
                <p className="text-sm font-bold text-foreground">Feeling lucky?</p>
                <p className="text-xs text-muted-foreground">Open for a chance at rare cosmetics & credits</p>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            className="w-full gap-2"
            disabled={!canAfford || spinning}
            onClick={open}
          >
            <Sparkles className="w-4 h-4" />
            {spinning ? "Opening..." : canAfford ? `Open Crate (${CRATE_COST} Credits)` : "Not Enough Credits"}
          </Button>

          {!canAfford && !spinning && (
            <p className="text-xs text-center text-muted-foreground">
              Earn more credits from daily rewards, ads, or referrals
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

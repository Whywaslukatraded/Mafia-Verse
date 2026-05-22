import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Coins, Sparkles, X, Gift, Star, Diamond, Crown, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";

const LOOT_ITEMS = [
  { id: "lc_border_gold", name: "Golden Border", type: "chat_border", tier: "rare", weight: 15 },
  { id: "lc_name_gold", name: "Gold Name", type: "name_color", tier: "rare", weight: 15 },
  { id: "lc_frame_diamond", name: "Diamond Frame", type: "avatar_frame", tier: "epic", weight: 8 },
  { id: "lc_frame_fire", name: "Fire Frame", type: "avatar_frame", tier: "epic", weight: 8 },
  { id: "lc_frame_crown", name: "Crown Frame", type: "avatar_frame", tier: "epic", weight: 8 },
  { id: "lc_10_credits", name: "10 Credits", type: "credits", tier: "common", weight: 20 },
  { id: "lc_25_credits", name: "25 Credits", type: "credits", tier: "common", weight: 15 },
  { id: "lc_50_credits", name: "50 Credits", type: "credits", tier: "rare", weight: 8 },
  { id: "lc_100_credits", name: "100 Credits", type: "credits", tier: "epic", weight: 3 },
];

const TIER_COLORS: Record<string, string> = {
  common: "text-gray-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-yellow-400",
};

const TIER_BG: Record<string, string> = {
  common: "bg-gray-500/10 border-gray-500/20",
  rare: "bg-blue-500/10 border-blue-500/20",
  epic: "bg-purple-500/10 border-purple-500/20",
  legendary: "bg-yellow-500/10 border-yellow-500/20",
};

function getCredits(): number {
  try {
    const s = JSON.parse(localStorage.getItem("mafia_stats") || "{}")
    return s.credits || 0;
  } catch { return 0; }
}

function addCredits(amount: number) {
  try {
    const s = JSON.parse(localStorage.getItem("mafia_stats") || "{}")
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
          addCredits(parseInt(item.name));
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

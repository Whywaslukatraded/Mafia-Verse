import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, CreditCard, X, CheckCircle2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const PACKS = [
  { credits: 100, price: 99, label: "$0.99", popular: false },
  { credits: 550, price: 499, label: "$4.99", popular: true, badge: "+10% Bonus" },
  { credits: 1200, price: 999, label: "$9.99", popular: false, badge: "+20% Bonus" },
  { credits: 3000, price: 2499, label: "$24.99", popular: false, badge: "+30% Bonus" },
];

function addCredits(amount: number) {
  try {
    const s = JSON.parse(localStorage.getItem("mafia_stats") || "{}")
    s.credits = (s.credits || 0) + amount;
    localStorage.setItem("mafia_stats", JSON.stringify(s));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

export function CreditPacks({ onClose }: { onClose: () => void }) {
  const [buying, setBuying] = useState<number | null>(null);
  const [thanks, setThanks] = useState(false);

  const handleBuy = async (pack: typeof PACKS[0]) => {
    setBuying(pack.price);
    try {
      const res = await fetch("/api/stripe/credit-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits: pack.credits, amount: pack.price }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        // Demo fallback
        addCredits(pack.credits);
        setThanks(true);
        setTimeout(() => setThanks(false), 3000);
      }
    } catch {
      addCredits(pack.credits);
      setThanks(true);
      setTimeout(() => setThanks(false), 3000);
    }
    setBuying(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="relative bg-card border border-border rounded-2xl max-w-md w-full shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Coins className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Credit Store</h2>
                <p className="text-xs text-muted-foreground">Buy credits, skip the grind</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {PACKS.map((pack) => (
            <motion.button
              key={pack.price}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => handleBuy(pack)}
              disabled={buying !== null}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-colors text-left disabled:opacity-50 ${
                pack.popular
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border bg-muted/30 hover:bg-muted/50"
              }`}
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                pack.popular ? "bg-amber-500/20" : "bg-muted"
              }`}>
                <Coins className={`w-6 h-6 ${pack.popular ? "text-amber-500" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-foreground">{pack.credits.toLocaleString()} Credits</p>
                  {pack.badge && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-green-500/10 text-green-500 border border-green-500/20">
                      {pack.badge}
                    </span>
                  )}
                </div>
                {pack.popular && (
                  <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Most Popular</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-foreground">{pack.label}</p>
                <CreditCard className="w-3 h-3 text-muted-foreground ml-auto" />
              </div>
              {buying === pack.price && (
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Zap className="w-4 h-4 text-amber-500" />
                </motion.div>
              )}
            </motion.button>
          ))}
        </div>

        <div className="p-4 border-t border-border bg-muted/20">
          <p className="text-[10px] text-muted-foreground text-center">
            Credits unlock cosmetics, loot crates, and premium features. No refunds.
          </p>
        </div>

        <AnimatePresence>
          {thanks && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-10"
            >
              <motion.div
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                exit={{ scale: 1.2, opacity: 0 }}
                className="bg-card border border-amber-500/30 rounded-2xl p-8 text-center"
              >
                <CheckCircle2 className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                <p className="text-lg font-bold">Credits Added!</p>
                <p className="text-sm text-muted-foreground">Spend them in the shop</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

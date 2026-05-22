import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Zap, Star, X, CheckCircle2, DollarSign, Coffee, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TIP_TIERS = [
  { amount: 499, label: "$4.99", icon: Coffee, desc: "Buy us coffee for a week", hearts: 2 },
  { amount: 999, label: "$9.99", icon: Zap, desc: "Power up the servers", hearts: 3 },
  { amount: 1999, label: "$19.99", icon: Star, desc: "Major supporter", hearts: 4 },
  { amount: 4999, label: "$49.99", icon: Crown, desc: "Become a legend", hearts: 5 },
];

export function TipJar({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [thanks, setThanks] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const handleTip = async (amount: number) => {
    setSelected(amount);
    try {
      const res = await fetch("/api/stripe/tip-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setThanks(true);
        setTimeout(() => setThanks(false), 3000);
      }
    } catch {
      setThanks(true);
      setTimeout(() => setThanks(false), 3000);
    }
    setSelected(null);
  };

  const handleCustomTip = () => {
    const cents = Math.round(parseFloat(customAmount) * 100);
    if (cents >= 100) {
      handleTip(cents);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="relative bg-card border border-border rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-pink-500/20 via-rose-500/10 to-pink-500/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center">
                <Heart className="w-5 h-5 text-pink-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Support the Game</h2>
                <p className="text-xs text-muted-foreground">Tips keep the servers running</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {TIP_TIERS.map((tier) => {
            const Icon = tier.icon;
            const isSelected = selected === tier.amount;
            return (
              <motion.button
                key={tier.amount}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleTip(tier.amount)}
                disabled={selected !== null}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-lg bg-pink-500/10 flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6 text-pink-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">{tier.label}</p>
                  <p className="text-xs text-muted-foreground">{tier.desc}</p>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: tier.hearts }).map((_, i) => (
                    <Heart key={i} className="w-3 h-3 text-pink-500 fill-pink-500" />
                  ))}
                </div>
                {isSelected && (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                    <Zap className="w-4 h-4 text-pink-500" />
                  </motion.div>
                )}
              </motion.button>
            );
          })}

          {/* Custom Amount */}
          {!showCustom ? (
            <button
              onClick={() => setShowCustom(true)}
              className="w-full py-3 text-sm font-bold text-pink-500 border border-dashed border-pink-500/30 rounded-xl hover:bg-pink-500/5 transition-colors"
            >
              Or enter a custom amount ($1 minimum)
            </button>
          ) : (
            <div className="space-y-2 p-3 border border-pink-500/20 rounded-xl bg-pink-500/5">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-pink-500" />
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="Enter amount (min $1)"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="flex-1"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setShowCustom(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-pink-500 hover:bg-pink-600 text-white"
                  disabled={parseFloat(customAmount) < 1}
                  onClick={handleCustomTip}
                >
                  Tip ${customAmount || "0"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-muted/20">
          <p className="text-[10px] text-muted-foreground text-center">
            Most of every tip goes to improving the game and keeping the servers running. The rest covers processing fees. Every dollar helps — thank you!
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
                className="bg-card border border-pink-500/30 rounded-2xl p-8 text-center"
              >
                <CheckCircle2 className="w-12 h-12 text-pink-500 mx-auto mb-3" />
                <p className="text-lg font-bold">Thank You!</p>
                <p className="text-sm text-muted-foreground">Your support means everything</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

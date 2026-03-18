import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, Lock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COSMETICS = [
  { id: "border_gold", name: "Golden Chat Border", type: "chat_border", cost: 5, preview: "border-yellow-500/50 bg-yellow-500/5", description: "Luxurious gold border for your chat messages" },
  { id: "border_red", name: "Red Chat Border", type: "chat_border", cost: 3, preview: "border-red-500/50 bg-red-500/5", description: "Menacing red border - perfect for Mafia role" },
  { id: "border_blue", name: "Blue Chat Border", type: "chat_border", cost: 3, preview: "border-blue-500/50 bg-blue-500/5", description: "Detective's signature blue" },
  { id: "name_color_gold", name: "Gold Name Color", type: "name_color", cost: 5, preview: "text-yellow-400", description: "Stand out with golden text" },
  { id: "name_color_red", name: "Red Name Color", type: "name_color", cost: 3, preview: "text-red-400", description: "Menacing red username" },
  { id: "name_color_cyan", name: "Cyan Name Color", type: "name_color", cost: 3, preview: "text-cyan-400", description: "Futuristic cyan" },
  { id: "frame_diamond", name: "Diamond Avatar Frame", type: "avatar_frame", cost: 10, preview: "diamond", description: "Premium diamond frame for your avatar" },
  { id: "frame_fire", name: "Fire Avatar Frame", type: "avatar_frame", cost: 8, preview: "fire", description: "Burning hot avatar frame" },
  { id: "frame_crown", name: "Crown Avatar Frame", type: "avatar_frame", cost: 7, preview: "crown", description: "Royal crown frame" },
];

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

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-black font-serif uppercase tracking-wider text-white">Cosmetics Shop</h1>
        </div>

        <div className="bg-black/40 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Available Wins</p>
              <p className="text-4xl font-black font-mono text-yellow-400">{userWins}</p>
            </div>
            <Sparkles className="w-12 h-12 text-yellow-400" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {COSMETICS.map((cosmetic) => {
            const isOwned = owned.has(cosmetic.id);
            const isEquipped = equipped[cosmetic.type] === cosmetic.id;
            const canAfford = userWins >= cosmetic.cost;

            return (
              <motion.div
                key={cosmetic.id}
                whileHover={{ scale: 1.02 }}
                className={cn(
                  "bg-black/40 backdrop-blur ring-1 rounded-xl p-4 transition-all",
                  isOwned ? "ring-primary/40 bg-primary/5" : "ring-white/10",
                  isEquipped && "ring-2 ring-yellow-500/60"
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-white">{cosmetic.name}</h3>
                    <p className="text-[10px] text-muted-foreground mt-1">{cosmetic.description}</p>
                  </div>
                  {isEquipped && (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <Check className="w-5 h-5 text-yellow-400" />
                    </motion.div>
                  )}
                </div>

                <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
                  {cosmetic.type === "chat_border" && (
                    <div className={cn("p-2 rounded text-sm text-white border", cosmetic.preview)}>
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
                </div>

                <div className="flex gap-2">
                  {!isOwned ? (
                    <Button
                      onClick={() => handleBuy(cosmetic)}
                      disabled={!canAfford}
                      className="flex-1 text-xs font-bold"
                      variant={canAfford ? "default" : "secondary"}
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      {cosmetic.cost}
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
          })}
        </div>

        <Button variant="outline" className="w-full mt-8" onClick={() => setLocation("/")}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}

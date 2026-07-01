import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Coins, CreditCard, Crown, Heart, Sparkles, Zap, Star, Coffee, DollarSign, CircleCheck as CheckCircle2, Gift, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const CREDIT_PACKS = [
  { credits: 100, price: 99, label: "$0.99" },
  { credits: 550, price: 499, label: "$4.99", popular: true, badge: "+10%" },
  { credits: 1200, price: 999, label: "$9.99", badge: "+20%" },
  { credits: 3000, price: 2499, label: "$24.99", badge: "+30%" },
];

const TIP_TIERS = [
  { amount: 499, label: "$4.99", icon: Coffee, desc: "Buy us a coffee" },
  { amount: 999, label: "$9.99", icon: Zap, desc: "Power up the servers" },
  { amount: 1999, label: "$19.99", icon: Star, desc: "Major supporter" },
  { amount: 4999, label: "$49.99", icon: Crown, desc: "Become a legend" },
];


function getStats() {
  try {
    const raw = localStorage.getItem("mafia_stats");
    return raw ? JSON.parse(raw) : { wins: 0, credits: 0, dailyClaimsCount: 0, lastClaimTimestamp: 0 };
  } catch {
    return { wins: 0, credits: 0, dailyClaimsCount: 0, lastClaimTimestamp: 0 };
  }
}

function addCreditsLocal(amount: number) {
  try {
    const s = getStats();
    s.credits = (s.credits || 0) + amount;
    localStorage.setItem("mafia_stats", JSON.stringify(s));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

function setSyndicatePass(active: boolean) {
  localStorage.setItem("mafia_syndicate_pass", active ? "true" : "false");
  window.dispatchEvent(new Event("storage"));
}

function hasSyndicatePass(): boolean {
  return localStorage.getItem("mafia_syndicate_pass") === "true";
}

export default function Store() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [stats, setStats] = useState(getStats);
  const [syndicatePass, setSyndicatePassState] = useState(hasSyndicatePass);
  const [buying, setBuying] = useState<string | null>(null);
  const [customTip, setCustomTip] = useState("");
  const [showCustomTip, setShowCustomTip] = useState(false);
  const [fulfillMsg, setFulfillMsg] = useState<string | null>(null);

  // Fetch real credits from DB
  const [dbCredits, setDbCredits] = useState<number | null>(null);
  useEffect(() => {
    const roomCodes = Object.keys(localStorage).filter(k => k.startsWith("mafia_session_"));
    if (roomCodes.length === 0) return;
    const lastRoom = roomCodes[roomCodes.length - 1];
    const roomCode = lastRoom.replace("mafia_session_", "");
    const sessionId = localStorage.getItem(lastRoom);
    if (!sessionId || !roomCode) return;
    fetch(`/api/players/${encodeURIComponent(sessionId)}/credits?roomCode=${roomCode}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && typeof data.credits === "number") setDbCredits(data.credits); })
      .catch(() => {});
  }, []);

  const displayCredits = dbCredits !== null ? dbCredits : (stats.credits || 0);

  useEffect(() => {
    const handler = () => {
      setSyndicatePassState(hasSyndicatePass());
      setStats(getStats());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Handle Stripe redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      const item = params.get("item");
      const amount = params.get("amount");
      if (item === "credits" && amount) {
        const credits = parseInt(amount, 10);
        addCreditsLocal(credits);
        setStats(getStats());
        setFulfillMsg(`+${credits} Credits added!`);
      } else if (item === "syndicate") {
        setSyndicatePass(true);
        setSyndicatePassState(true);
        setFulfillMsg("Syndicate Pass activated!");
      } else if (item === "tip" && amount) {
        setFulfillMsg(`Thank you for the $${(parseInt(amount, 10) / 100).toFixed(2)} tip!`);
      }
      window.history.replaceState({}, "", "/store");
      setTimeout(() => setFulfillMsg(null), 4000);
    } else if (params.get("canceled") === "true") {
      toast({ title: "Payment canceled", description: "No charges were made." });
      window.history.replaceState({}, "", "/store");
    }
  }, [toast]);

  const checkout = async (endpoint: string, body: object) => {
    setBuying(JSON.stringify(body));
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      toast({
        title: "Payment Error",
        description: data.error || "Unable to process payment. Please try again.",
        variant: "destructive",
      });
    } catch {
      toast({
        title: "Connection Error",
        description: "Unable to connect to payment server. Please try again.",
        variant: "destructive",
      });
    }
    setBuying(null);
  };

  const sendCustomTip = () => {
    const cents = Math.round(parseFloat(customTip) * 100);
    if (cents >= 100) checkout("/api/stripe/tip-checkout", { amount: cents });
  };
  const buyCredits = (pack: any) => checkout("/api/stripe/credit-checkout", { credits: pack.credits, amount: pack.price });
  const buySyndicate = () => { if (!syndicatePass) checkout("/api/stripe/syndicate-checkout", { amount: 499 }); };
  const sendTip = (amountCents: number) => checkout("/api/stripe/tip-checkout", { amount: amountCents });

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Storefront</h1>
            <p className="text-xs text-muted-foreground">Support the game & unlock perks</p>
          </div>
          <div className="ml-auto flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full border border-border">
            <Coins className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-bold">{displayCredits}</span>
          </div>
        </div>

        <AnimatePresence>
          {fulfillMsg && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-sm font-bold text-green-500">{fulfillMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Credit Packs */}
        <section className="mb-10">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Credit Packs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CREDIT_PACKS.map((pack) => (
              <motion.button key={pack.price} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => buyCredits(pack)} disabled={buying !== null}
                className={cn("relative flex items-center gap-4 p-4 rounded-xl border text-left transition-all disabled:opacity-50",
                  pack.popular ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card hover:border-primary/30")}>
                {pack.popular && <span className="absolute -top-2 left-4 px-2 py-0.5 bg-amber-500 text-white text-[9px] font-black uppercase rounded-full">Popular</span>}
                <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center shrink-0", pack.popular ? "bg-amber-500/20" : "bg-muted")}>
                  <Coins className={cn("w-6 h-6", pack.popular ? "text-amber-500" : "text-muted-foreground")} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">{pack.credits.toLocaleString()} Credits</p>
                  <p className="text-[10px] text-muted-foreground">Spend on crates & cosmetics</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black">{pack.label}</p>
                  <CreditCard className="w-3 h-3 text-muted-foreground ml-auto mt-0.5" />
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Syndicate Pass */}
        <section className="mb-10">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Syndicate Pass</h2>
          <motion.button whileHover={syndicatePass ? {} : { scale: 1.01 }} whileTap={syndicatePass ? {} : { scale: 0.99 }} onClick={buySyndicate} disabled={buying !== null || syndicatePass}
            className={cn("w-full flex items-center gap-4 p-5 rounded-xl border text-left transition-all",
              syndicatePass ? "border-green-500/30 bg-green-500/5 opacity-60 cursor-default" : "border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10")}>
            <div className="w-14 h-14 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
              <Crown className="w-7 h-7 text-purple-500" />
            </div>
            <div className="flex-1">
              <p className="text-base font-black">{syndicatePass ? "Syndicate Pass Active" : "The Syndicate Pass"}</p>
              {syndicatePass ? (
                <p className="text-xs text-muted-foreground">You have access to all premium cosmetics</p>
              ) : (
                <div className="mt-1.5 space-y-1 text-xs text-muted-foreground font-medium">
                  <div className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-purple-400" /> Unlock 16 exclusive cosmetics + legendary personas</div>
                  <div className="flex items-center gap-1.5"><Gift className="w-3.5 h-3.5 text-pink-400" /> Instantly receive a premium mystery street kit pack</div>
                  <div className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-red-400" /> Gain permanent priority match lobby status and badge</div>
                </div>
              )}
            </div>
            <div className="text-right">
              {syndicatePass ? <CheckCircle2 className="w-6 h-6 text-green-500" /> : <p className="text-lg font-black text-purple-500">$4.99</p>}
            </div>
          </motion.button>
        </section>

        {/* Tip Jar */}
        <section className="mb-10">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Support the Devs</h2>
          <div className="space-y-3">
            {TIP_TIERS.map((tier) => {
              const Icon = tier.icon;
              return (
                <motion.button key={tier.amount} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => sendTip(tier.amount)} disabled={buying !== null}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-left disabled:opacity-50">
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1"><p className="text-sm font-bold">{tier.desc}</p></div>
                  <div className="text-right"><p className="text-sm font-black text-amber-500">{tier.label}</p></div>
                </motion.button>
              );
            })}
            {!showCustomTip ? (
              <button onClick={() => setShowCustomTip(true)} className="w-full py-3 text-sm font-bold text-pink-500 border border-dashed border-pink-500/30 rounded-xl hover:bg-pink-500/5 transition-colors">
                Or enter a custom amount ($1 minimum)
              </button>
            ) : (
              <div className="space-y-2 p-3 border border-pink-500/20 rounded-xl bg-pink-500/5">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-pink-500" />
                  <Input type="number" min="1" step="0.01" placeholder="Enter amount" value={customTip} onChange={(e) => setCustomTip(e.target.value)} className="flex-1" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowCustomTip(false)}>Cancel</Button>
                  <Button size="sm" className="flex-1 bg-pink-500 hover:bg-pink-600 text-white" disabled={parseFloat(customTip) < 1} onClick={sendCustomTip}>
                    Tip ${customTip || "0"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Capsule Stash Drops */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <Package className="w-5 h-5 text-blue-500" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Capsule Stash Drops</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-center justify-between gap-4 text-left">
              <div>
                <p className="text-sm font-bold">Underworld Stash</p>
                <p className="text-[11px] text-muted-foreground">Contains common to rare street gear.</p>
              </div>
              <Button size="sm" onClick={() => {
                if ((stats.credits || 0) < 150) return toast({ title: "Insufficient Credits", variant: "destructive" });
                addCreditsLocal(-150); setStats(getStats()); toast({ title: "Stash Unlocked!" });
              }} className="h-8 font-mono bg-neutral-800 text-neutral-200">150 🪙</Button>
            </div>
            <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 flex items-center justify-between gap-4 text-left relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-purple-500 text-white text-[8px] font-black px-2 py-0.5 uppercase">HOT</div>
              <div>
                <p className="text-sm font-bold">Syndicate Vault</p>
                <p className="text-[11px] text-muted-foreground">High chance for Epic outfits.</p>
              </div>
              <Button size="sm" onClick={() => {
                if ((stats.credits || 0) < 400) return toast({ title: "Insufficient Credits", variant: "destructive" });
                addCreditsLocal(-400); setStats(getStats()); toast({ title: "Vault Unlocked!" });
              }} className="h-8 font-mono bg-neutral-800 text-neutral-200">400 🪙</Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

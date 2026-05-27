import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Coins, CreditCard, Crown, Heart, Sparkles,
  Zap, Star, Coffee, DollarSign, CheckCircle2, X, Gift, Tv, Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

/* ---------- DATA ---------- */

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

/* ---------- HELPERS ---------- */

function getStats() {
  try {
    const raw = localStorage.getItem("mafia_stats");
    return raw ? JSON.parse(raw) : { wins: 0, credits: 0 };
  } catch {
    return { wins: 0, credits: 0 };
  }
}

function addCredits(amount: number) {
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

/* ---------- COMPONENT ---------- */

export default function Store() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [stats, setStats] = useState(getStats);
  const [buying, setBuying] = useState<string | null>(null);
  const [customTip, setCustomTip] = useState("");
  const [showCustomTip, setShowCustomTip] = useState(false);
  const [fulfillMsg, setFulfillMsg] = useState<string | null>(null);
  const [checkoutState, setCheckoutState] = useState<{
    open: boolean;
    item: string;
    amount: number;
    credits?: number;
    label: string;
  } | null>(null);
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [cardExpiry, setCardExpiry] = useState("12/30");
  const [cardCvc, setCardCvc] = useState("123");
  const [processingPayment, setProcessingPayment] = useState(false);

  /* ---- Handle ?success=... & ?canceled=... from Stripe redirect ---- */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const item = params.get("item");
    const amount = params.get("amount");

    if (success === "true") {
      if (item === "credits" && amount) {
        const credits = parseInt(amount, 10);
        addCredits(credits);
        setStats(getStats);
        setFulfillMsg(`+${credits} Credits added!`);
      } else if (item === "syndicate") {
        setSyndicatePass(true);
        setFulfillMsg("Syndicate Pass activated!");
      } else if (item === "tip" && amount) {
        setFulfillMsg(`Thank you for the $${(parseInt(amount, 10) / 100).toFixed(2)} tip!`);
      }
      // Clean URL
      window.history.replaceState({}, "", "/store");
      setTimeout(() => setFulfillMsg(null), 4000);
    } else if (params.get("canceled") === "true") {
      toast({ title: "Payment canceled", description: "No charges were made.", variant: "default" });
      window.history.replaceState({}, "", "/store");
    }
  }, [toast]);

  /* ---- Checkout helpers ---- */
  const checkout = async (endpoint: string, body: object) => {
    setBuying(JSON.stringify(body));
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      // Success — redirect to Stripe checkout page
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }

      // Backend returned an error (Stripe not connected, etc.)
      // Open test checkout modal instead
      setBuying(null);
      openTestCheckout(endpoint, body);
      return;
    } catch (err: any) {
      // Network error — can't reach backend at all
      setBuying(null);
      openTestCheckout(endpoint, body);
    }
  };

  /* Open test checkout modal (simulates real Stripe flow) */
  const openTestCheckout = (endpoint: string, body: any) => {
    const b = body;
    let label = "";
    let item = "";
    let credits: number | undefined;
    if (endpoint.includes("credit")) {
      item = "credits";
      credits = b.credits;
      label = `${b.credits} Credits`;
    } else if (endpoint.includes("syndicate")) {
      item = "syndicate";
      label = "The Syndicate Pass";
    } else if (endpoint.includes("tip")) {
      item = "tip";
      label = `Tip $${(b.amount / 100).toFixed(2)}`;
    }
    const state = { open: true, item, amount: b.amount, credits, label };
    console.log("[Store] Opening test checkout:", state);
    setCheckoutState(state);
    setBuying(null);
  };

  const handleTestPay = () => {
    if (!checkoutState) return;
    setProcessingPayment(true);
    setTimeout(() => {
      setProcessingPayment(false);
      setCheckoutState(null);
      // Deliver item
      if (checkoutState.item === "credits" && checkoutState.credits) {
        addCredits(checkoutState.credits);
        setStats(getStats);
        setFulfillMsg(`+${checkoutState.credits} Credits added!`);
      } else if (checkoutState.item === "syndicate") {
        setSyndicatePass(true);
        setFulfillMsg("Syndicate Pass activated!");
      } else if (checkoutState.item === "tip") {
        setFulfillMsg(`Thank you for the $${(checkoutState.amount / 100).toFixed(2)} tip!`);
      }
      setTimeout(() => setFulfillMsg(null), 4000);
    }, 2000);
  };

  const sendCustomTip = () => {
    const cents = Math.round(parseFloat(customTip) * 100);
    if (cents >= 100) sendTip(cents);
  };

  const buyCredits = (pack: typeof CREDIT_PACKS[0]) => {
    checkout("/api/stripe/credit-checkout", { credits: pack.credits, amount: pack.price });
  };

  const buySyndicate = () => {
    if (hasSyndicatePass()) return;
    checkout("/api/stripe/syndicate-checkout", { amount: 499 });
  };

  const sendTip = (amountCents: number) => {
    checkout("/api/stripe/tip-checkout", { amount: amountCents });
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-20">
      {/* Header */}
      <div className="max-w-2xl mx-auto">
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
            <span className="text-sm font-bold">{stats.credits || 0}</span>
          </div>
        </div>

        {/* Fulfillment Banner */}
        <AnimatePresence>
          {fulfillMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-sm font-bold text-green-500">{fulfillMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Credit Packs */}
        <section className="mb-10">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Credit Packs
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CREDIT_PACKS.map((pack) => (
              <motion.button
                key={pack.price}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => buyCredits(pack)}
                disabled={buying !== null}
                className={cn(
                  "relative flex items-center gap-4 p-4 rounded-xl border text-left transition-all disabled:opacity-50",
                  pack.popular
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border bg-card hover:border-primary/30"
                )}
              >
                {pack.popular && (
                  <span className="absolute -top-2 left-4 px-2 py-0.5 bg-amber-500 text-white text-[9px] font-black uppercase rounded-full">
                    Popular
                  </span>
                )}
                <div className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center shrink-0",
                  pack.popular ? "bg-amber-500/20" : "bg-muted"
                )}>
                  <Coins className={cn("w-6 h-6", pack.popular ? "text-amber-500" : "text-muted-foreground")} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold">{pack.credits.toLocaleString()} Credits</p>
                    {pack.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-green-500/10 text-green-500 border border-green-500/20">
                        {pack.badge}
                      </span>
                    )}
                  </div>
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
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Syndicate Pass
          </h2>
          <motion.button
            whileHover={hasSyndicatePass() ? {} : { scale: 1.01 }}
            whileTap={hasSyndicatePass() ? {} : { scale: 0.99 }}
            onClick={() => buySyndicate()}
            disabled={buying !== null || hasSyndicatePass()}
            className={cn(
              "w-full flex items-center gap-4 p-5 rounded-xl border text-left transition-all",
              hasSyndicatePass()
                ? "border-green-500/30 bg-green-500/5 opacity-60 cursor-default"
                : "border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10"
            )}
          >
            <div className="w-14 h-14 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
              <Crown className="w-7 h-7 text-purple-500" />
            </div>
            <div className="flex-1">
              <p className="text-base font-black">
                {hasSyndicatePass() ? "Syndicate Pass Active" : "The Syndicate Pass"}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasSyndicatePass()
                  ? "You have access to all premium cosmetics"
                  : "Unlock 16 exclusive cosmetics + legendary personas"}
              </p>
            </div>
            <div className="text-right">
              {hasSyndicatePass() ? (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              ) : (
                <>
                  <p className="text-lg font-black text-purple-500">$4.99</p>
                  <Sparkles className="w-3 h-3 text-purple-500 ml-auto mt-0.5" />
                </>
              )}
            </div>
          </motion.button>
        </section>

        {/* Tip Jar */}
        <section className="mb-10">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Support the Devs
          </h2>
          <div className="space-y-3">
            {TIP_TIERS.map((tier) => {
              const Icon = tier.icon;
              return (
                <motion.button
                  key={tier.amount}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => sendTip(tier.amount)}
                  disabled={buying !== null}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-12 h-12 rounded-lg bg-pink-500/10 flex items-center justify-center shrink-0">
                    <Icon className="w-6 h-6 text-pink-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">{tier.label}</p>
                    <p className="text-xs text-muted-foreground">{tier.desc}</p>
                  </div>
                  <Heart className="w-4 h-4 text-pink-500 fill-pink-500" />
                </motion.button>
              );
            })}

            {!showCustomTip ? (
              <button
                onClick={() => setShowCustomTip(true)}
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
                    value={customTip}
                    onChange={(e) => setCustomTip(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowCustomTip(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-pink-500 hover:bg-pink-600 text-white"
                    disabled={parseFloat(customTip) < 1}
                    onClick={sendCustomTip}
                  >
                    Tip ${customTip || "0"}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground text-center">
            Most of every tip goes to improving the game and keeping the servers running. The rest covers processing fees.
          </p>
        </section>

      </div>

      {/* Test Checkout Modal */}
      <AnimatePresence>
        {checkoutState?.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !processingPayment && setCheckoutState(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-bold">Secure Checkout</span>
                </div>
                {!processingPayment && (
                  <button onClick={() => setCheckoutState(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              <div className="p-5">
                {/* Order summary */}
                <div className="bg-muted/50 rounded-xl p-4 mb-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Order Summary</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">{checkoutState.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {checkoutState.item === "credits" ? `${checkoutState.credits} Credits` :
                         checkoutState.item === "syndicate" ? "The Syndicate Pass" : "Tip"}
                      </p>
                    </div>
                    <p className="text-lg font-black">
                      ${(checkoutState.amount / 100).toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Card form */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Card Number</label>
                    <Input
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="font-mono"
                      disabled={processingPayment}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Expiry (MM/YY)</label>
                      <Input
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/YY"
                        className="font-mono"
                        disabled={processingPayment}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">CVC</label>
                      <Input
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        className="font-mono"
                        disabled={processingPayment}
                      />
                    </div>
                  </div>
                </div>

                {/* Test card helper */}
                <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                  <p className="text-xs font-bold text-amber-500 mb-1">Test Mode — No real charge</p>
                  <p className="text-[11px] text-muted-foreground">
                    Card: 4242 4242 4242 4242 &middot; Expiry: 12/30 &middot; CVC: 123
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    This is a local test. To see payments in your Stripe dashboard, connect a Stripe account via Replit Integrations.
                  </p>
                </div>

                <Button
                  onClick={handleTestPay}
                  disabled={processingPayment}
                  className="w-full mt-4 h-11 text-sm font-black bg-primary hover:bg-primary/90"
                >
                  {processingPayment ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    <span>Pay ${(checkoutState.amount / 100).toFixed(2)}</span>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

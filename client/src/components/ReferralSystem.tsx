import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Users, Copy, CheckCircle2, Link2, Gift } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

function generateReferralCode() {
  const saved = localStorage.getItem("mafia_referral_code");
  if (saved) return saved;
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  localStorage.setItem("mafia_referral_code", code);
  return code;
}

function getReferralStats() {
  try {
    const raw = localStorage.getItem("mafia_referral_stats");
    return raw ? JSON.parse(raw) : { invited: 0, claimed: 0, totalCredits: 0 };
  } catch {
    return { invited: 0, claimed: 0, totalCredits: 0 };
  }
}

function saveReferralStats(s: any) {
  localStorage.setItem("mafia_referral_stats", JSON.stringify(s));
}

const REWARD_PER_INVITE = 25;

export function ReferralSystem({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [code] = useState(generateReferralCode);
  const [stats] = useState(getReferralStats);
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(() => {
    const link = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="relative bg-card border border-border rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-emerald-500/20 via-green-500/10 to-emerald-500/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{t("referralSystem.title")}</h2>
                <p className="text-xs text-muted-foreground">{t("referralSystem.subtitle")}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-muted/30 rounded-xl p-4 text-center space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">{t("referralSystem.yourReferralLink")}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground truncate">
                {window.location.origin}/?ref={code}
              </div>
              <Button size="sm" variant="outline" onClick={copyCode} className="shrink-0">
                {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-foreground">{stats.invited}</p>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("referralSystem.invited")}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-foreground">{stats.claimed}</p>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("referralSystem.joined")}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-emerald-500">{stats.totalCredits}</p>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("referralSystem.credits")}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
            <Gift className="w-5 h-5 text-emerald-500" />
            <div>
              <p className="text-sm font-bold text-foreground">{t("referralSystem.creditsPerFriend", { count: REWARD_PER_INVITE })}</p>
              <p className="text-xs text-muted-foreground">{t("referralSystem.theyJoinYouGetRewarded")}</p>
            </div>
          </div>
          <p className="text-[10px] text-center text-muted-foreground px-2">
            Both you and your friend need to be signed up to earn the credits — they have to create an account using your link, not just play as a guest.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

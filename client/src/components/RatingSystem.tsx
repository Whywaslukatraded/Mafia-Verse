import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X, Send, Coins, Clock, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const REWARD_CREDITS = 5;
const EDIT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface RatingData {
  stars: number;
  ratedAt: string;   // when they first rated (credit was awarded here)
  lastEditAt: string; // when the star value was last changed
}

function getRatingData(): RatingData | null {
  try {
    const raw = localStorage.getItem("mafia_rating_data");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveRatingData(data: RatingData) {
  localStorage.setItem("mafia_rating_data", JSON.stringify(data));
}

function addCredits(amount: number) {
  try {
    const s = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
    s.credits = (s.credits || 0) + amount;
    localStorage.setItem("mafia_stats", JSON.stringify(s));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

export function RatingSystem({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const existing = getRatingData();
  const [stars, setStars] = useState(existing?.stars || 0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [ratingData, setRatingData] = useState<RatingData | null>(existing);
  const [editing, setEditing] = useState(!existing);

  const hasRatedBefore = !!ratingData;
  const msSinceLastEdit = ratingData ? Date.now() - new Date(ratingData.lastEditAt).getTime() : Infinity;
  const canEdit = !hasRatedBefore || msSinceLastEdit >= EDIT_COOLDOWN_MS;
  const daysUntilEditable = canEdit ? 0 : Math.ceil((EDIT_COOLDOWN_MS - msSinceLastEdit) / (24 * 60 * 60 * 1000));

  const handleSubmit = useCallback(() => {
    if (stars === 0) return;
    const now = new Date().toISOString();
    const isFirstRating = !hasRatedBefore;

    const newData: RatingData = {
      stars,
      ratedAt: ratingData?.ratedAt || now,
      lastEditAt: now,
    };
    saveRatingData(newData);
    setRatingData(newData);
    setEditing(false);
    setSubmitted(true);

    if (isFirstRating) {
      addCredits(REWARD_CREDITS);
    }
  }, [stars, hasRatedBefore, ratingData]);

  const starLabels: Record<number, string> = {
    5: t("rating.amazing"),
    4: t("rating.great"),
    3: t("rating.good"),
    2: t("rating.okay"),
    1: t("rating.needsWork"),
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
        <div className="bg-gradient-to-r from-yellow-500/20 via-amber-500/10 to-yellow-500/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{t("rating.title")}</h2>
                <p className="text-xs text-muted-foreground">{t("rating.subtitle")}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Credit incentive banner — only shown before the first-ever rating */}
          {!hasRatedBefore && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <Coins className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-sm font-bold text-foreground">
                {t("rating.earnCreditsBanner", { count: REWARD_CREDITS })}
              </p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {submitted && !editing ? (
              <motion.div
                key="submitted"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-6 space-y-3"
              >
                <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.5 }}>
                  <div className="flex items-center justify-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-6 h-6 ${i < stars ? "text-yellow-500 fill-yellow-500" : "text-muted"}`} />
                    ))}
                  </div>
                </motion.div>
                <p className="text-lg font-bold">{t("rating.thanksForRating")}</p>
                {ratingData && ratingData.ratedAt === ratingData.lastEditAt && (
                  <p className="text-sm text-amber-500 font-bold flex items-center justify-center gap-1.5">
                    <Coins className="w-4 h-4" /> {t("rating.creditsAwarded", { count: REWARD_CREDITS })}
                  </p>
                )}
                <Button variant="outline" size="sm" onClick={onClose}>
                  {t("common.close")}
                </Button>
              </motion.div>
            ) : editing ? (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="text-center space-y-2">
                  <p className="text-sm font-bold text-foreground">{t("rating.howWouldYouRate")}</p>
                  <div className="flex items-center justify-center gap-2">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const filled = i < (hoveredStar || stars);
                      return (
                        <motion.button
                          key={i}
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.9 }}
                          onMouseEnter={() => setHoveredStar(i + 1)}
                          onMouseLeave={() => setHoveredStar(0)}
                          onClick={() => setStars(i + 1)}
                          className="focus:outline-none"
                        >
                          <Star className={`w-8 h-8 transition-colors ${filled ? "text-yellow-500 fill-yellow-500" : "text-muted"}`} />
                        </motion.button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground h-4">{starLabels[stars] || ""}</p>
                </div>

                <Button className="w-full gap-2" disabled={stars === 0} onClick={handleSubmit}>
                  <Send className="w-4 h-4" />
                  {hasRatedBefore ? t("rating.updateRating") : t("rating.submitAndEarn", { count: REWARD_CREDITS })}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="locked"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-4 space-y-4"
              >
                <div className="flex items-center justify-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`w-7 h-7 ${i < stars ? "text-yellow-500 fill-yellow-500" : "text-muted"}`} />
                  ))}
                </div>
                <p className="text-sm font-bold text-foreground">{t("rating.alreadyRated")}</p>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">
                  <Clock className="w-4 h-4" />
                  {daysUntilEditable === 1
                    ? t("rating.editAvailableInOneDay")
                    : t("rating.editAvailableIn", { count: daysUntilEditable })}
                </div>
                <Button variant="outline" size="sm" onClick={onClose}>
                  {t("common.close")}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lets an already-rated user open the edit form once their cooldown has passed */}
          {!editing && !submitted && canEdit && hasRatedBefore && (
            <Button variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground" onClick={() => setEditing(true)}>
              <Pencil className="w-4 h-4" /> {t("rating.updateRating")}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

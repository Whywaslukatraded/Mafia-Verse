import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X, Send, MessageSquare, ThumbsUp, ThumbsDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Rating {
  id: string;
  stars: number;
  feedback: string;
  timestamp: string;
  helpful: boolean | null;
}

function getRatings(): Rating[] {
  try {
    const raw = localStorage.getItem("mafia_ratings");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRatings(ratings: Rating[]) {
  localStorage.setItem("mafia_ratings", JSON.stringify(ratings));
}

function getHasRated(): boolean {
  try {
    return !!localStorage.getItem("mafia_has_rated");
  } catch {
    return false;
  }
}

function setHasRated() {
  localStorage.setItem("mafia_has_rated", "true");
}

function clearHasRated() {
  localStorage.removeItem("mafia_has_rated");
}

export function RatingSystem({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [stars, setStars] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [ratings, setRatings] = useState<Rating[]>(getRatings);
  const [showHistory, setShowHistory] = useState(false);
  const [canRateAgain, setCanRateAgain] = useState(false);

  const average = ratings.length > 0
    ? (ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length).toFixed(1)
    : "0.0";

  const handleSubmit = useCallback(() => {
    if (stars === 0) return;
    const newRating: Rating = {
      id: Math.random().toString(36).substring(2, 8),
      stars,
      feedback,
      timestamp: new Date().toISOString(),
      helpful: null,
    };
    const updated = [newRating, ...ratings];
    saveRatings(updated);
    setRatings(updated);
    setSubmitted(true);
    setHasRated();
  }, [stars, feedback, ratings]);

  const markHelpful = (id: string, helpful: boolean) => {
    const updated = ratings.map((r) =>
      r.id === id ? { ...r, helpful } : r
    );
    saveRatings(updated);
    setRatings(updated);
  };

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
        className="relative bg-card border border-border rounded-2xl max-w-md w-full shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
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
          {/* Stats */}
          {ratings.length > 0 && (
            <div className="flex items-center gap-4 bg-muted/30 rounded-xl p-3">
              <div className="text-center">
                <p className="text-2xl font-black text-yellow-500">{average}</p>
                <p className="text-[10px] text-muted-foreground uppercase">{t("rating.average")}</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="text-2xl font-black text-foreground">{ratings.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase">{t("rating.reviews")}</p>
              </div>
              <div className="flex-1 flex justify-end">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-xs text-yellow-500 font-bold hover:underline"
                >
                  {showHistory ? t("rating.hide") : t("rating.seeAll")}
                </button>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {canRateAgain ? (
              <motion.div
                key="again"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-6 space-y-3"
              >
                <p className="text-lg font-bold">{t("rating.ratingCleared")}</p>
                <p className="text-sm text-muted-foreground">{t("rating.ratingClearedDescription")}</p>
                <Button size="sm" onClick={() => {
                  setCanRateAgain(false);
                  setStars(0);
                  setFeedback("");
                  setSubmitted(false);
                }}>
                  {t("rating.rateAgain")}
                </Button>
              </motion.div>
            ) : submitted ? (
              <motion.div
                key="submitted"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-6 space-y-3"
              >
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 0.5 }}
                >
                  <Star className="w-12 h-12 text-yellow-500 fill-yellow-500 mx-auto" />
                </motion.div>
                <p className="text-lg font-bold">{t("rating.thanksForRating")}</p>
                <p className="text-sm text-muted-foreground">{t("rating.feedbackHelpsUs")}</p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" size="sm" onClick={onClose}>
                    {t("common.close")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => {
                      clearHasRated();
                      setCanRateAgain(true);
                    }}
                  >
                    {t("rating.resetMyRating")}
                  </Button>
                </div>
              </motion.div>
            ) : showHistory ? (
              <motion.div
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-xs text-muted-foreground hover:text-foreground mb-2"
                >
                  &larr; {t("rating.backToRating")}
                </button>
                {ratings.slice(0, 10).map((r) => (
                  <div key={r.id} className="bg-muted/30 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${i < r.stars ? "text-yellow-500 fill-yellow-500" : "text-muted"}`}
                        />
                      ))}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(r.timestamp).toLocaleDateString(i18n.language)}
                      </span>
                    </div>
                    {r.feedback && (
                      <p className="text-xs text-muted-foreground">{r.feedback}</p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => markHelpful(r.id, true)}
                        className={`flex items-center gap-1 text-[10px] ${r.helpful === true ? "text-green-500 font-bold" : "text-muted-foreground"}`}
                      >
                        <ThumbsUp className="w-3 h-3" /> {t("rating.helpful")}
                      </button>
                      <button
                        onClick={() => markHelpful(r.id, false)}
                        className={`flex items-center gap-1 text-[10px] ${r.helpful === false ? "text-red-500 font-bold" : "text-muted-foreground"}`}
                      >
                        <ThumbsDown className="w-3 h-3" /> {t("rating.notHelpful")}
                      </button>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Star Rating */}
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
                          <Star
                            className={`w-8 h-8 transition-colors ${filled ? "text-yellow-500 fill-yellow-500" : "text-muted"}`}
                          />
                        </motion.button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground h-4">
                    {starLabels[stars] || ""}
                  </p>
                </div>

                {/* Feedback */}
                <div className="space-y-2">
                  <p className="text-sm font-bold text-foreground">{t("rating.whatCouldWeDoBetter")}</p>
                  <Textarea
                    placeholder={t("rating.shareYourThoughts")}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="min-h-[80px] resize-none"
                    maxLength={500}
                  />
                  <p className="text-[10px] text-muted-foreground text-right">{feedback.length}/500</p>
                </div>

                <Button
                  className="w-full gap-2"
                  disabled={stars === 0}
                  onClick={handleSubmit}
                >
                  <Send className="w-4 h-4" />
                  {t("rating.submitRating")}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

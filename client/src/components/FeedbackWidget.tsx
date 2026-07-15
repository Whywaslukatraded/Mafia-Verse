import { useState, useCallback } from "react";
import { MessageSquareText, X, Bug, Lightbulb, Palette, Heart, Send, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const CATEGORIES_META = [
  { id: "BUG_REPORT", labelKey: "bug", icon: Bug, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
  { id: "FEATURE_REQUEST", labelKey: "feature", icon: Lightbulb, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  { id: "DESIGN", labelKey: "design", icon: Palette, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  { id: "OTHER", labelKey: "praise", icon: Heart, color: "text-pink-500", bg: "bg-pink-500/10", border: "border-pink-500/20" },
];

export function FeedbackWidget() {
  const { t } = useTranslation();
  const CATEGORIES = CATEGORIES_META.map(c => ({ ...c, label: t(`feedback.categories.${c.labelKey}`) }));
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState("BUG_REPORT");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!message.trim()) return;
    setSubmitting(true);

    try {
      // Send feedback to the agent inbox API via the backend
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: category,
          message: message.trim(),
          page: window.location.pathname,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        setMessage("");
        setTimeout(() => {
          setSubmitted(false);
          setIsOpen(false);
        }, 2000);
      }
    } catch {
      // If the API fails, store locally as fallback
      const feedbacks = JSON.parse(localStorage.getItem("mafia_feedback") || "[]");
      feedbacks.push({ topic: category, message: message.trim(), page: window.location.pathname, time: new Date().toISOString() });
      localStorage.setItem("mafia_feedback", JSON.stringify(feedbacks));
      setSubmitted(true);
      setMessage("");
      setTimeout(() => {
        setSubmitted(false);
        setIsOpen(false);
      }, 2000);
    } finally {
      setSubmitting(false);
    }
  }, [category, message]);

  return (
    <>
      {/* Floating Button - now larger, with label, and higher contrast */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 pl-4 pr-5 py-3 rounded-full shadow-2xl shadow-primary/30 flex items-center gap-2.5 transition-all font-black text-sm tracking-wide",
          isOpen ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground ring-2 ring-primary/40"
        )}
        data-testid="button-feedback-toggle"
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageSquareText className="w-5 h-5" />}
        {isOpen ? t("common.close") : t("feedback.feedback")}
      </motion.button>

      {/* Feedback Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 w-80 bg-card border border-border rounded-2xl shadow-2xl p-5"
            data-testid="panel-feedback"
          >
            {submitted ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  <CheckCircle className="w-12 h-12 text-green-500" />
                </motion.div>
                <p className="text-sm font-bold text-foreground">{t("feedback.feedbackSent")}</p>
                <p className="text-xs text-muted-foreground text-center">{t("feedback.thankYouForHelping")}</p>
              </div>
            ) : (
              <>
                <h3 className="text-sm font-black uppercase tracking-wider text-foreground mb-4">{t("feedback.sendFeedback")}</h3>

                {/* Category Selection */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isActive = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border",
                          isActive ? `${cat.bg} ${cat.color} ${cat.border}` : "bg-muted text-muted-foreground border-transparent hover:border-border"
                        )}
                        data-testid={`feedback-category-${cat.id}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Message Input */}
                <Textarea
                  placeholder={t("feedback.tellUsWhatsOnYourMind")}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="bg-muted/50 border-border text-sm min-h-[80px] mb-3 resize-none"
                  data-testid="input-feedback-message"
                />

                <Button
                  onClick={handleSubmit}
                  disabled={!message.trim() || submitting}
                  className="w-full font-bold"
                  data-testid="button-feedback-submit"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {submitting ? t("feedback.sending") : t("feedback.sendFeedback")}
                </Button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

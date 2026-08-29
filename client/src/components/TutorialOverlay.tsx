import { useEffect, useState, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type TutorialStep = {
  target: string; // matches a data-tutorial="..." attribute in Room.tsx
  titleKey: string;
  titleFallback: string;
  bodyKey: string;
  bodyFallback: string;
};

export const ROOM_TUTORIAL_STEPS: TutorialStep[] = [
  {
    target: "phase-indicator",
    titleKey: "tutorial.phase.title",
    titleFallback: "Track the phase",
    bodyKey: "tutorial.phase.body",
    bodyFallback: "This shows whether it's day or night, and how much time is left to act.",
  },
  {
    target: "player-grid",
    titleKey: "tutorial.players.title",
    titleFallback: "Vote and act here",
    bodyKey: "tutorial.players.body",
    bodyFallback: "Tap a player's card to vote during the day, or to use your role's night action when it's your turn.",
  },
  {
    target: "chat",
    titleKey: "tutorial.chat.title",
    titleFallback: "Talk it out",
    bodyKey: "tutorial.chat.body",
    bodyFallback: "Chat with everyone here. If you're mafia, you'll also get a private channel with your teammates at night.",
  },
  {
    target: "handbook",
    titleKey: "tutorial.handbook.title",
    titleFallback: "Forget a role?",
    bodyKey: "tutorial.handbook.body",
    bodyFallback: "Open the handbook anytime to check what every role does.",
  },
];

// Feature: Tutorial overlay. A live spotlight walkthrough over the actual
// Room.tsx UI (not a static rules screen — that's the separate HowToPlay
// modal shown before joining a room). Finds each step's target by the
// data-tutorial="..." attribute Room.tsx already has on the real elements,
// so the highlight is always pointing at the real, current position of
// that element rather than a hardcoded coordinate — it recomputes on
// scroll/resize so it can't drift out of alignment.
export function TutorialOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = ROOM_TUTORIAL_STEPS[stepIndex];

  const measure = () => {
    const el = document.querySelector(`[data-tutorial="${step.target}"]`);
    if (el) setRect(el.getBoundingClientRect());
    else setRect(null);
  };

  useLayoutEffect(() => {
    measure();
    // Scroll the target into view so a step further down the page (chat,
    // player grid) isn't spotlighting something off-screen.
    const el = document.querySelector(`[data-tutorial="${step.target}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(measure, 350); // re-measure after the smooth scroll settles
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const next = () => {
    if (stepIndex < ROOM_TUTORIAL_STEPS.length - 1) setStepIndex(stepIndex + 1);
    else onClose();
  };
  const isLast = stepIndex === ROOM_TUTORIAL_STEPS.length - 1;

  // Card position: below the target if there's room, otherwise above it —
  // keeps the explanation on-screen for steps near the top or bottom edge.
  const cardBelow = rect ? rect.bottom + 180 < window.innerHeight : true;

  return (
    <div className="fixed inset-0 z-[250]">
      {/* Dimmed backdrop with a cut-out "spotlight" hole over the target,
          built from four rectangles instead of an SVG mask so it degrades
          gracefully (just a normal dim overlay) if a target isn't found. */}
      {rect ? (
        <>
          <div className="fixed bg-background/80 backdrop-blur-sm transition-all duration-300" style={{ left: 0, top: 0, right: 0, height: Math.max(rect.top - 8, 0) }} />
          <div className="fixed bg-background/80 backdrop-blur-sm transition-all duration-300" style={{ left: 0, top: rect.bottom + 8, right: 0, bottom: 0 }} />
          <div className="fixed bg-background/80 backdrop-blur-sm transition-all duration-300" style={{ left: 0, top: Math.max(rect.top - 8, 0), width: Math.max(rect.left - 8, 0), height: rect.height + 16 }} />
          <div className="fixed bg-background/80 backdrop-blur-sm transition-all duration-300" style={{ left: rect.right + 8, top: Math.max(rect.top - 8, 0), right: 0, height: rect.height + 16 }} />
          <div
            className="fixed rounded-xl ring-2 ring-primary shadow-[0_0_0_2000px_rgba(0,0,0,0)] pointer-events-none transition-all duration-300"
            style={{ left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16 }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={stepIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="fixed left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm bg-card border border-primary/40 rounded-2xl p-5 shadow-2xl"
          style={
            rect
              ? cardBelow
                ? { top: rect.bottom + 20 }
                : { top: Math.max(rect.top - 190, 16) }
              : { top: "40%" }
          }
        >
          <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground" aria-label={t("common.close", "Close")}>
            <X className="w-4 h-4" />
          </button>
          <h4 className="font-serif font-bold text-lg text-primary mb-1 pr-6">{t(step.titleKey, step.titleFallback)}</h4>
          <p className="text-sm text-muted-foreground mb-4">{t(step.bodyKey, step.bodyFallback)}</p>
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {ROOM_TUTORIAL_STEPS.map((_, i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === stepIndex ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>{t("tutorial.skip", "Skip")}</Button>
              <Button size="sm" onClick={next} data-testid="button-tutorial-next">
                {isLast ? t("tutorial.done", "Got it") : t("tutorial.next", "Next")}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

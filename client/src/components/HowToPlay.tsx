import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun, Skull, Shield, Heart, Search, User, ShieldCheck, Crosshair, Landmark, Drama, ChevronRight, ChevronLeft, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HowToPlayProps {
  onClose: () => void;
}

const STEP_ICONS = [Moon, Skull, Shield, Heart, Search, ShieldCheck, Crosshair, Landmark, Drama, Sun];

export function HowToPlay({ onClose }: HowToPlayProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  // 10 short steps: the loop, mafia, detective, doctor, civilian, the 4 new
  // roles, then the day vote. Each key below must exist under
  // `howToPlay.steps.*` in en.json/es.json.
  const steps = ["loop", "mafia", "detective", "doctor", "civilian", "bodyguard", "vigilante", "mayor", "jester", "vote"];
  const isLast = step === steps.length - 1;
  const Icon = STEP_ICONS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="relative bg-card border border-border rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-primary/20 via-purple-500/10 to-primary/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">{t("howToPlay.title")}</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-4">
            {steps.map((_, i) => (
              <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="space-y-4 text-center min-h-[220px] flex flex-col items-center justify-center"
            >
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-base font-bold text-foreground">{t(`howToPlay.steps.${steps[step]}.title`)}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{t(`howToPlay.steps.${steps[step]}.body`)}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="p-6 pt-0 flex items-center gap-2">
          {step > 0 && (
            <Button variant="outline" size="icon" onClick={() => setStep(s => s - 1)} className="shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
          <Button
            className="flex-1 gap-2"
            onClick={() => (isLast ? onClose() : setStep(s => s + 1))}
          >
            {isLast ? t("howToPlay.gotIt") : t("howToPlay.next")}
            {!isLast && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

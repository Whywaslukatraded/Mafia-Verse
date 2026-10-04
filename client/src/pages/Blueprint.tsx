import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { FileCode2, Users, Layers, GitBranch, ArrowLeft, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Drumroll-style count-up. Mounts at 0 and animates to the real value
// whenever `play` is true — since the row it lives in only exists in the
// DOM while its section is expanded (AnimatePresence unmounts it on
// collapse), every re-open is a fresh mount, so it replays from 0 each time
// a section is opened rather than only animating once ever.
function AnimatedNumber({ value, play }: { value: string; play: boolean }) {
  const target = useMemo(() => parseInt(value.replace(/,/g, ""), 10) || 0, [value]);
  const [display, setDisplay] = useState(play ? 0 : target);

  useEffect(() => {
    if (!play) return;
    let raf: number;
    const duration = 900;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, target]);

  return <>{display.toLocaleString()}</>;
}

// NOTE: these numbers are a hand-updated snapshot from a PowerShell
// line-count pass, not computed live in the app. Re-run the script
// whenever the codebase changes meaningfully, and update both this file
// and the README together.
const CORE_STATS = {
  totalLines: "48,448",
  sourceLines: "30,274",
  fileCount: "147",
  languageCount: "11",
};

const LANGUAGE_BREAKDOWN = [
  { label: "Data & Config (.json)", files: "11", lines: "18,174" },
  { label: "TypeScript React (.tsx)", files: "85", lines: "17,906" },
  { label: "Pure TypeScript (.ts)", files: "31", lines: "10,807" },
  { label: "CommonJS (.cjs)", files: "3", lines: "535" },
  { label: "Markdown (.md)", files: "3", lines: "317" },
  { label: "SQL (.sql)", files: "6", lines: "286" },
  { label: "JavaScript (.js)", files: "4", lines: "167" },
  { label: "CSS (.css)", files: "1", lines: "136" },
  { label: "HTML (.html)", files: "1", lines: "51" },
  { label: "Shell (.sh)", files: "1", lines: "37" },
  { label: "TOML (.toml)", files: "1", lines: "32" },
];

const ECOSYSTEM_STATS = {
  totalFiles: "27,112",
  totalLines: "3,821,725",
};

export default function Blueprint() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showEcosystem, setShowEcosystem] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none bg-background">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-4 bg-card border-2 border-border rounded-full shadow-xl mb-6 ring-4 ring-primary/10 relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 via-transparent to-transparent opacity-50" />
            <FileCode2 className="w-10 h-10 text-emerald-400 relative z-10" strokeWidth={2.5} />
          </div>
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/50 mb-2 drop-shadow-sm font-serif uppercase tracking-tighter">
            {t("blueprint.title", "Blueprint")}
          </h1>
          <p className="text-muted-foreground font-medium uppercase tracking-[0.3em] text-[10px] opacity-80">
            {t("blueprint.tagline", "Behind the Curtain")}
          </p>
        </div>

        <Card className="glass-card border-none bg-card/80 backdrop-blur-xl ring-1 ring-border mb-6">
          <CardContent className="pt-6 pb-6 space-y-4">
            <p className="text-sm text-foreground/90 leading-relaxed">
              {t(
                "blueprint.description",
                "Every screen, roll and reveal in Mafia Verse is hand-written, one file at a time. Here's what's actually under the hood."
              )}
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="flex flex-col items-center justify-center gap-1 p-3 bg-muted/50 rounded-xl border border-border">
                <span className="text-2xl font-black font-mono">{CORE_STATS.totalLines}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold text-center">
                  {t("blueprint.totalLines", "Total Core Lines")}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 p-3 bg-muted/50 rounded-xl border border-border">
                <span className="text-2xl font-black font-mono">{CORE_STATS.sourceLines}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold text-center">
                  {t("blueprint.sourceLines", "Raw Code Logic")}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 p-3 bg-muted/50 rounded-xl border border-border">
                <span className="text-2xl font-black font-mono">{CORE_STATS.fileCount}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold text-center">
                  {t("blueprint.fileCount", "Active Script Files")}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 p-3 bg-muted/50 rounded-xl border border-border">
                <span className="text-2xl font-black font-mono">{CORE_STATS.languageCount}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold text-center">
                  {t("blueprint.languageCount", "Languages & Formats")}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowBreakdown((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-1 py-1 cursor-pointer"
                data-testid="button-toggle-breakdown"
              >
                <span className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    {t("blueprint.breakdownLabel", "Language Breakdown")}
                  </span>
                </span>
                <motion.span animate={{ rotate: showBreakdown ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {showBreakdown && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 pt-2">
                      {LANGUAGE_BREAKDOWN.map((row, i) => (
                        <motion.div
                          key={row.label}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.25, delay: i * 0.05 }}
                          className="flex items-center justify-between gap-3 p-2.5 bg-muted/50 rounded-lg border border-border"
                        >
                          <span className="text-xs font-bold text-foreground/90 truncate">{row.label}</span>
                          <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                            <AnimatedNumber value={row.files} play={showBreakdown} /> {t("blueprint.filesShort", "files")} ·{" "}
                            <AnimatedNumber value={row.lines} play={showBreakdown} /> {t("blueprint.linesShort", "lines")}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowEcosystem((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-1 py-1 cursor-pointer"
                data-testid="button-toggle-ecosystem"
              >
                <span className="flex items-center gap-2">
                  <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    {t("blueprint.ecosystemLabel", "Ecosystem Footprint")}
                  </span>
                </span>
                <motion.span animate={{ rotate: showEcosystem ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {showEcosystem && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 pt-2">
                      <motion.div
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25 }}
                        className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg border border-border"
                      >
                        <span className="text-xs font-bold text-foreground/90">{t("blueprint.totalFiles", "Total Project Files")}</span>
                        <span className="text-xs font-mono text-muted-foreground">
                          <AnimatedNumber value={ECOSYSTEM_STATS.totalFiles} play={showEcosystem} />
                        </span>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: 0.05 }}
                        className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg border border-border"
                      >
                        <span className="text-xs font-bold text-foreground/90">{t("blueprint.totalEcoLines", "Total Ecosystem Lines")}</span>
                        <span className="text-xs font-mono text-muted-foreground">
                          <AnimatedNumber value={ECOSYSTEM_STATS.totalLines} play={showEcosystem} />
                        </span>
                      </motion.div>
                      <p className="text-xs text-foreground/70 leading-relaxed pt-1">
                        {t(
                          "blueprint.ecosystemNote",
                          "Even efficient code leans on a multi-million-line ecosystem of dependencies to keep the game running under the hood."
                        )}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>

        <a
          href="https://discord.gg/9fRxpUyjD4"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl cursor-pointer mb-4"
        >
          <Users className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-bold text-indigo-400">{t("home.joinDiscord")}</span>
        </a>

        <Button
          onClick={() => setLocation("/")}
          variant="ghost"
          className="w-full gap-2 text-muted-foreground hover:text-foreground"
          data-testid="button-blueprint-back-home"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.backToHome")}
        </Button>
      </motion.div>
    </div>
  );
}

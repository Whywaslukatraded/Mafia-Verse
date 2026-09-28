import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { FileCode2, Users, Layers, GitBranch, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2 px-1">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  {t("blueprint.breakdownLabel", "Language Breakdown")}
                </span>
              </div>
              {LANGUAGE_BREAKDOWN.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 p-2.5 bg-muted/50 rounded-lg border border-border"
                >
                  <span className="text-xs font-bold text-foreground/90 truncate">{row.label}</span>
                  <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                    {row.files} {t("blueprint.filesShort", "files")} · {row.lines} {t("blueprint.linesShort", "lines")}
                  </span>
                </div>
              ))}
            </div>

            <details className="pt-2 group">
              <summary className="flex items-center gap-2 px-1 cursor-pointer list-none">
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  {t("blueprint.ecosystemLabel", "Ecosystem Footprint")}
                </span>
              </summary>
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg border border-border">
                  <span className="text-xs font-bold text-foreground/90">{t("blueprint.totalFiles", "Total Project Files")}</span>
                  <span className="text-xs font-mono text-muted-foreground">{ECOSYSTEM_STATS.totalFiles}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg border border-border">
                  <span className="text-xs font-bold text-foreground/90">{t("blueprint.totalEcoLines", "Total Ecosystem Lines")}</span>
                  <span className="text-xs font-mono text-muted-foreground">{ECOSYSTEM_STATS.totalLines}</span>
                </div>
                <p className="text-xs text-foreground/70 leading-relaxed pt-1">
                  {t(
                    "blueprint.ecosystemNote",
                    "Even efficient code leans on a multi-million-line ecosystem of dependencies to keep the game running under the hood."
                  )}
                </p>
              </div>
            </details>
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

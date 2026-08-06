import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Search, Users, Bot, MessagesSquare, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function About() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const highlights = [
    { icon: Bot, key: "bots" },
    { icon: MessagesSquare, key: "graveyard" },
    { icon: Users, key: "community" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none bg-background">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-4 bg-card border-2 border-border rounded-full shadow-xl mb-6 ring-4 ring-primary/10 relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-transparent to-transparent opacity-50" />
            <Search className="w-10 h-10 text-primary relative z-10" strokeWidth={2.5} />
          </div>
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/50 mb-2 drop-shadow-sm font-serif uppercase tracking-tighter">
            {t("about.title")}
          </h1>
          <p className="text-muted-foreground font-medium uppercase tracking-[0.3em] text-[10px] opacity-80">
            {t("home.tagline")}
          </p>
        </div>

        <Card className="glass-card border-none bg-card/80 backdrop-blur-xl ring-1 ring-border mb-6">
          <CardContent className="pt-6 pb-6 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("about.description")}
            </p>

            <div className="space-y-3 pt-2">
              {highlights.map(({ icon: Icon, key }) => (
                <div key={key} className="flex items-start gap-3 p-3 bg-muted/50 rounded-xl border border-border">
                  <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{t(`about.highlights.${key}.title`)}</p>
                    <p className="text-xs text-muted-foreground">{t(`about.highlights.${key}.description`)}</p>
                  </div>
                </div>
              ))}
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
          data-testid="button-about-back-home"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.backToHome")}
        </Button>
      </motion.div>
    </div>
  );
}

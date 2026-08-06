import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { HelpCircle, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

const FAQ_KEYS = ["howToPlay", "credits", "botAutoFill", "syndicatePass", "afkFlag"] as const;

export default function FAQ() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

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
        className="w-full max-w-lg relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-card border-2 border-border rounded-full shadow-xl mb-6 ring-4 ring-primary/10 relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-transparent to-transparent opacity-50" />
            <HelpCircle className="w-10 h-10 text-amber-400 relative z-10" strokeWidth={2.5} />
          </div>
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/50 mb-2 drop-shadow-sm font-serif uppercase tracking-tighter">
            {t("faq.title")}
          </h1>
          <p className="text-muted-foreground font-medium uppercase tracking-[0.3em] text-[10px] opacity-80">
            {t("faq.subtitle")}
          </p>
        </div>

        <Card className="glass-card border-none bg-card/80 backdrop-blur-xl ring-1 ring-border mb-6">
          <CardContent className="pt-6 pb-2">
            <Accordion type="single" collapsible className="w-full">
              {FAQ_KEYS.map((key) => (
                <AccordionItem key={key} value={key} className="border-border">
                  <AccordionTrigger className="text-sm font-bold text-foreground text-left hover:no-underline">
                    {t(`faq.questions.${key}.question`)}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {t(`faq.questions.${key}.answer`)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Button
          onClick={() => setLocation("/")}
          variant="ghost"
          className="w-full gap-2 text-muted-foreground hover:text-foreground"
          data-testid="button-faq-back-home"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.backToHome")}
        </Button>
      </motion.div>
    </div>
  );
}

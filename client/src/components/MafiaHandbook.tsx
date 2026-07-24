import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Skull, Shield, Heart, User, Timer, Lightbulb, Zap, Info, ChevronRight, Users, Eye, Crosshair, Vote, Moon, Sun, Trophy, AlertTriangle, ShieldCheck, Landmark, Drama } from "lucide-react";
import { useTranslation } from "react-i18next";

export function MafiaHandbook() {
  const { t } = useTranslation();
  const mafiaAbilities = t("handbook.roles.mafia.abilities", { returnObjects: true }) as string[];
  const detectiveAbilities = t("handbook.roles.detective.abilities", { returnObjects: true }) as string[];
  const doctorAbilities = t("handbook.roles.doctor.abilities", { returnObjects: true }) as string[];
  const civilianAbilities = t("handbook.roles.civilian.abilities", { returnObjects: true }) as string[];
  const bodyguardAbilities = t("handbook.roles.bodyguard.abilities", { returnObjects: true }) as string[];
  const vigilanteAbilities = t("handbook.roles.vigilante.abilities", { returnObjects: true }) as string[];
  const mayorAbilities = t("handbook.roles.mayor.abilities", { returnObjects: true }) as string[];
  const jesterAbilities = t("handbook.roles.jester.abilities", { returnObjects: true }) as string[];
  const townTips = t("handbook.strategy.townTips", { returnObjects: true }) as string[];
  const mafiaTips = t("handbook.strategy.mafiaTips", { returnObjects: true }) as string[];
  const jesterTips = t("handbook.strategy.jesterTips", { returnObjects: true }) as string[];
  const redFlags = t("handbook.strategy.redFlags", { returnObjects: true }) as string[];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 bg-muted/50 border-border hover:bg-muted transition-all hover:scale-105 group"
        >
          <BookOpen className="w-4 h-4 text-blue-400 group-hover:rotate-12 transition-transform" />
          <span>{t("handbook.title")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-background border-border text-foreground shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-destructive/5 pointer-events-none" />

        <DialogHeader className="border-b border-border pb-4 relative z-10">
          <DialogTitle className="text-3xl font-serif tracking-[0.2em] uppercase text-center bg-clip-text text-transparent bg-gradient-to-b from-foreground to-muted-foreground">
            {t("handbook.title")}
          </DialogTitle>
          <p className="text-center text-xs text-muted-foreground mt-1">
            {t("handbook.subtitle")}
          </p>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full mt-4 relative z-10">
          <TabsList className="grid w-full grid-cols-4 bg-muted/40 p-1 rounded-xl border border-border">
            <TabsTrigger value="overview" className="rounded-lg gap-1 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-[10px] sm:text-xs">
              <Info className="w-3 h-3" /> {t("handbook.tabs.basics")}
            </TabsTrigger>
            <TabsTrigger value="roles" className="rounded-lg gap-1 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 text-[10px] sm:text-xs">
              <Users className="w-3 h-3" /> {t("handbook.tabs.roles")}
            </TabsTrigger>
            <TabsTrigger value="flow" className="rounded-lg gap-1 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 text-[10px] sm:text-xs">
              <Timer className="w-3 h-3" /> {t("handbook.tabs.phases")}
            </TabsTrigger>
            <TabsTrigger value="strategies" className="rounded-lg gap-1 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-[10px] sm:text-xs">
              <Lightbulb className="w-3 h-3" /> {t("handbook.tabs.tips")}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[450px] mt-4 pr-4">
            <AnimatePresence mode="wait">

              {/* OVERVIEW TAB */}
              <TabsContent value="overview" className="space-y-4 mt-0">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

                  <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4" /> {t("handbook.overview.whatIsMafiaTitle")}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t("handbook.overview.whatIsMafiaDescription")}
                    </p>
                  </div>

                  <div className="bg-card p-4 rounded-xl border border-border">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-blue-400" /> {t("handbook.overview.teamsAtAGlance")}
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                        <p className="text-xs font-bold text-blue-400 mb-1">{t("handbook.overview.theTown")}</p>
                        <p className="text-xs text-muted-foreground">{t("handbook.overview.theTownDescription")}</p>
                      </div>
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <p className="text-xs font-bold text-red-400 mb-1">{t("handbook.overview.theMafia")}</p>
                        <p className="text-xs text-muted-foreground">{t("handbook.overview.theMafiaDescription")}</p>
                      </div>
                      <div className="bg-pink-500/10 border border-pink-500/20 rounded-lg p-3">
                        <p className="text-xs font-bold text-pink-400 mb-1">{t("handbook.overview.theJester")}</p>
                        <p className="text-xs text-muted-foreground">{t("handbook.overview.theJesterDescription")}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-card p-4 rounded-xl border border-border">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                      <Trophy className="w-4 h-4 text-yellow-400" /> {t("handbook.overview.howToWin")}
                    </h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p><strong className="text-emerald-400">{t("handbook.overview.townWins")}</strong> {t("handbook.overview.townWinsDescription")}</p>
                      <p><strong className="text-red-400">{t("handbook.overview.mafiaWins")}</strong> {t("handbook.overview.mafiaWinsDescription")}</p>
                      <p><strong className="text-pink-400">{t("handbook.overview.jesterWins")}</strong> {t("handbook.overview.jesterWinsDescription")}</p>
                    </div>
                  </div>

                  <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2 mb-2">
                      <Eye className="w-4 h-4" /> {t("handbook.overview.whatMakesDifferentTitle")}
                    </h3>
                    <ul className="text-sm text-muted-foreground space-y-1.5">
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-1 text-purple-400 shrink-0" /> {t("handbook.overview.difference1")}</li>
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-1 text-purple-400 shrink-0" /> {t("handbook.overview.difference2")}</li>
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-1 text-purple-400 shrink-0" /> {t("handbook.overview.difference3")}</li>
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-1 text-purple-400 shrink-0" /> {t("handbook.overview.difference4")}</li>
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-1 text-purple-400 shrink-0" /> {t("handbook.overview.difference5")}</li>
                    </ul>
                  </div>

                  <div className="bg-pink-500/10 border border-pink-500/20 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-pink-400 flex items-center gap-2 mb-2">
                      <Drama className="w-4 h-4" /> {t("handbook.overview.jesterNoteTitle")}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t("handbook.overview.jesterNoteDescription")}
                    </p>
                  </div>
                </motion.div>
              </TabsContent>

              {/* ROLES TAB */}
              <TabsContent value="roles" className="space-y-4 mt-0">
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="grid gap-3">

                  <RoleSection
                    title={t("handbook.roles.mafia.title")}
                    icon={<Skull className="w-5 h-5" />}
                    color="text-red-500"
                    glow="shadow-red-500/10"
                    desc={t("handbook.roles.mafia.desc")}
                    abilities={mafiaAbilities}
                  />

                  <RoleSection
                    title={t("handbook.roles.detective.title")}
                    icon={<Shield className="w-5 h-5" />}
                    color="text-blue-500"
                    glow="shadow-blue-500/10"
                    desc={t("handbook.roles.detective.desc")}
                    abilities={detectiveAbilities}
                  />

                  <RoleSection
                    title={t("handbook.roles.doctor.title")}
                    icon={<Heart className="w-5 h-5" />}
                    color="text-emerald-500"
                    glow="shadow-emerald-500/10"
                    desc={t("handbook.roles.doctor.desc")}
                    abilities={doctorAbilities}
                  />

                  <RoleSection
                    title={t("handbook.roles.civilian.title")}
                    icon={<User className="w-5 h-5" />}
                    color="text-slate-400"
                    glow="shadow-slate-500/10"
                    desc={t("handbook.roles.civilian.desc")}
                    abilities={civilianAbilities}
                  />

                  <RoleSection
                    title={t("handbook.roles.bodyguard.title")}
                    icon={<ShieldCheck className="w-5 h-5" />}
                    color="text-slate-300"
                    glow="shadow-slate-400/10"
                    desc={t("handbook.roles.bodyguard.desc")}
                    abilities={bodyguardAbilities}
                  />

                  <RoleSection
                    title={t("handbook.roles.vigilante.title")}
                    icon={<Crosshair className="w-5 h-5" />}
                    color="text-orange-400"
                    glow="shadow-orange-500/10"
                    desc={t("handbook.roles.vigilante.desc")}
                    abilities={vigilanteAbilities}
                  />

                  <RoleSection
                    title={t("handbook.roles.mayor.title")}
                    icon={<Landmark className="w-5 h-5" />}
                    color="text-purple-400"
                    glow="shadow-purple-500/10"
                    desc={t("handbook.roles.mayor.desc")}
                    abilities={mayorAbilities}
                  />

                  <RoleSection
                    title={t("handbook.roles.jester.title")}
                    icon={<Drama className="w-5 h-5" />}
                    color="text-pink-400"
                    glow="shadow-pink-500/10"
                    desc={t("handbook.roles.jester.desc")}
                    abilities={jesterAbilities}
                  />
                </motion.div>
              </TabsContent>

              {/* FLOW TAB */}
              <TabsContent value="flow" className="space-y-4 mt-0">
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">

                  <div className="bg-card p-4 rounded-xl border border-border">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                      <Sun className="w-4 h-4 text-amber-400" /> {t("handbook.flow.dayPhaseTitle")}
                    </h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p><strong className="text-foreground">{t("handbook.flow.day1Label")}</strong> {t("handbook.flow.day1Description")}</p>
                      <p><strong className="text-foreground">{t("handbook.flow.day2Label")}</strong> {t("handbook.flow.day2Description")}</p>
                      <p><strong className="text-foreground">{t("handbook.flow.day3Label")}</strong> {t("handbook.flow.day3Description")}</p>
                    </div>
                  </div>

                  <div className="bg-card p-4 rounded-xl border border-border">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                      <Moon className="w-4 h-4 text-indigo-400" /> {t("handbook.flow.nightPhaseTitle")}
                    </h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p><strong className="text-foreground">{t("handbook.flow.night1Label")}</strong> {t("handbook.flow.night1Description")}</p>
                      <p><strong className="text-foreground">{t("handbook.flow.night2Label")}</strong> {t("handbook.flow.night2Description")}</p>
                      <p><strong className="text-foreground">{t("handbook.flow.night3Label")}</strong> {t("handbook.flow.night3Description")}</p>
                      <p><strong className="text-foreground">{t("handbook.flow.night4Label")}</strong> {t("handbook.flow.night4Description")}</p>
                      <p><strong className="text-foreground">{t("handbook.flow.night5Label")}</strong> {t("handbook.flow.night5Description")}</p>
                      <p><strong className="text-foreground">{t("handbook.flow.night6Label")}</strong> {t("handbook.flow.night6Description")}</p>
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-2">
                      <Vote className="w-4 h-4" /> {t("handbook.flow.tieBreakingTitle")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("handbook.flow.tieBreakingDescription")}
                    </p>
                  </div>
                </motion.div>
              </TabsContent>

              {/* STRATEGY TAB */}
              <TabsContent value="strategies" className="space-y-4 mt-0">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

                  <StrategyCard
                    title={t("handbook.strategy.townTitle")}
                    accent="border-blue-500/20"
                    tips={townTips}
                  />

                  <StrategyCard
                    title={t("handbook.strategy.mafiaTitle")}
                    accent="border-red-500/20"
                    tips={mafiaTips}
                  />

                  <StrategyCard
                    title={t("handbook.strategy.jesterTitle")}
                    accent="border-pink-500/20"
                    tips={jesterTips}
                  />

                  <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2 mb-2">
                      <Crosshair className="w-4 h-4" /> {t("handbook.strategy.redFlagsTitle")}
                    </h3>
                    <ul className="text-sm text-muted-foreground space-y-1.5">
                      {redFlags.map((flag, i) => (
                        <li key={i} className="flex gap-2"><ChevronRight className="w-3 h-3 mt-0.5 text-purple-400 shrink-0" /> {flag}</li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              </TabsContent>
            </AnimatePresence>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function RoleSection({ title, icon, color, desc, abilities, glow }: any) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={`bg-card p-4 rounded-xl border border-border hover:bg-muted transition-all ${glow} hover:shadow-lg`}
    >
      <h3 className={`text-base font-bold flex items-center gap-2 mb-2 ${color}`}>
        {icon} {title}
      </h3>
      <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{desc}</p>
      <div className="space-y-2">
        {abilities.map((a: string, i: number) => (
          <div key={i} className="text-xs text-muted-foreground flex gap-2 items-start bg-muted/50 p-2.5 rounded-lg leading-relaxed">
            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            {a}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function StrategyCard({ title, tips, accent }: any) {
  return (
    <div className={`bg-card p-4 rounded-xl border ${accent} hover:bg-muted transition-colors`}>
      <h3 className="text-base font-bold mb-3 text-foreground flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        {title}
      </h3>
      <ul className="space-y-2.5">
        {tips.map((tip: string, i: number) => (
          <li key={i} className="text-sm text-muted-foreground flex gap-3 group leading-relaxed">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500/30 group-hover:bg-amber-500 transition-colors mt-1.5 shrink-0" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

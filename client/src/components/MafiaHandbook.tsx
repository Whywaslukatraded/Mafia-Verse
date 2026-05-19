import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Skull, Shield, Heart, User, Timer, Lightbulb, Zap, Info, ChevronRight } from "lucide-react";

export function MafiaHandbook() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 bg-muted/50 border-border hover:bg-muted transition-all hover:scale-105 group"
        >
          <BookOpen className="w-4 h-4 text-blue-400 group-hover:rotate-12 transition-transform" />
          <span>Handbook</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-background border-border text-foreground shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-destructive/5 pointer-events-none" />

        <DialogHeader className="border-b border-border pb-4 relative z-10">
          <DialogTitle className="text-3xl font-serif tracking-[0.2em] uppercase text-center bg-clip-text text-transparent bg-gradient-to-b from-foreground to-muted-foreground">
            Mafia Handbook
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="roles" className="w-full mt-4 relative z-10">
          <TabsList className="grid w-full grid-cols-3 bg-muted/40 p-1 rounded-xl border border-border">
            <TabsTrigger value="roles" className="rounded-lg gap-2 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
              <User className="w-4 h-4" /> Roles
            </TabsTrigger>
            <TabsTrigger value="rules" className="rounded-lg gap-2 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
              <Info className="w-4 h-4" /> Rules
            </TabsTrigger>
            <TabsTrigger value="strategies" className="rounded-lg gap-2 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
              <Lightbulb className="w-4 h-4" /> Strategy
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[450px] mt-4 pr-4">
            <AnimatePresence mode="wait">
              <TabsContent value="roles" className="space-y-6 mt-0">
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="grid gap-4"
                >
                  <RoleSection 
                    title="The Mafias" 
                    icon={<Skull className="w-5 h-5" />} 
                    color="text-red-500" 
                    glow="shadow-red-500/10"
                    desc="The unseen predators. Your goal is to eliminate all non-mafia players until you hold the majority."
                    abilities={["Night Kill: Choose one player to eliminate each night.", "Deception: Blend in during the day to avoid being voted out."]}
                  />
                  <RoleSection 
                    title="The Detectives" 
                    icon={<Shield className="w-5 h-5" />} 
                    color="text-blue-500" 
                    glow="shadow-blue-500/10"
                    desc="The eyes of the law. Your goal is to identify the Mafia members before it's too late."
                    abilities={["Investigate: Check one player each night to see if they are Mafia.", "Leadership: Guide the group's vote based on your findings."]}
                  />
                  <RoleSection 
                    title="The Doctors" 
                    icon={<Heart className="w-5 h-5" />} 
                    color="text-emerald-500" 
                    glow="shadow-emerald-500/10"
                    desc="The guardians. Protect the innocent from the Mafia's nightly attacks."
                    abilities={["Save: Choose one player to protect each night.", "Self-Preservation: You can save yourself (limitations apply)."]}
                  />
                  <RoleSection 
                    title="The Civilians" 
                    icon={<User className="w-5 h-5" />} 
                    color="text-slate-400" 
                    glow="shadow-slate-500/10"
                    desc="The backbone of the city. Use your power of observation and voting to catch the Mafia."
                    abilities={["The Vote: Your primary weapon to eliminate suspects during the day.", "Deduction: Watch patterns and behavior to find inconsistencies."]}
                  />
                </motion.div>
              </TabsContent>

              <TabsContent value="rules" className="space-y-6 mt-0">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4"
                >
                  <div className="bg-card p-4 rounded-xl border border-border hover:border-amber-500/30 transition-colors">
                    <h3 className="text-lg font-bold flex items-center gap-2 mb-2 text-amber-500">
                      <Timer className="w-5 h-5" /> Game Flow
                    </h3>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <div className="flex gap-3 items-start group">
                        <span className="font-bold text-amber-500/50 group-hover:text-amber-500 transition-colors">01</span>
                        <p><strong className="text-foreground">Lobby:</strong> Game starts when the host clicks 'Start' (minimum 6 players).</p>
                      </div>
                      <div className="flex gap-3 items-start group">
                        <span className="font-bold text-amber-500/50 group-hover:text-amber-500 transition-colors">02</span>
                        <p><strong className="text-foreground">Day Phase:</strong> Discussion followed by public voting. Majority vote eliminates a player.</p>
                      </div>
                      <div className="flex gap-3 items-start group">
                        <span className="font-bold text-amber-500/50 group-hover:text-amber-500 transition-colors">03</span>
                        <p><strong className="text-foreground">Night Phase:</strong> Roles perform secret actions. The city wakes up to the results.</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-card p-4 rounded-xl border border-border hover:border-purple-500/30 transition-colors">
                    <h3 className="text-lg font-bold flex items-center gap-2 mb-2 text-purple-500">
                      <Zap className="w-5 h-5" /> Victory Conditions
                    </h3>
                    <ul className="text-sm text-muted-foreground space-y-3">
                      <li className="flex items-center gap-2">
                        <ChevronRight className="w-3 h-3 text-emerald-500" />
                        <span><strong className="text-emerald-400">Town Victory:</strong> All Mafia members are eliminated.</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <ChevronRight className="w-3 h-3 text-red-500" />
                        <span><strong className="text-red-400">Mafia Victory:</strong> Mafia equals or outnumbers the Town.</span>
                      </li>
                    </ul>
                  </div>
                </motion.div>
              </TabsContent>

              <TabsContent value="strategies" className="space-y-6 mt-0">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <StrategyCard 
                    title="For the Town" 
                    accent="border-blue-500/20"
                    tips={[
                      "Watch for 'quiet' players who don't contribute to discussion.",
                      "Detectives: Be careful about revealing yourself too early.",
                      "Doctors: Protect the most influential town members."
                    ]}
                  />
                  <StrategyCard 
                    title="For the Mafia" 
                    accent="border-red-500/20"
                    tips={[
                      "Don't all vote for the same person early on; it's suspicious.",
                      "Try to gain the trust of 'confirmed' Town members.",
                      "Leaving a known Detective alive can sometimes cause more confusion."
                    ]}
                  />
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
      whileHover={{ scale: 1.02 }}
      className={`bg-card p-4 rounded-xl border border-border hover:bg-muted transition-all ${glow} hover:shadow-lg`}
    >
      <h3 className={`text-lg font-bold flex items-center gap-2 mb-2 ${color}`}>
        {icon} {title}
      </h3>
      <p className="text-sm text-muted-foreground mb-3">{desc}</p>
      <div className="space-y-2">
        {abilities.map((a: string, i: number) => (
          <div key={i} className="text-xs text-muted-foreground flex gap-2 items-center bg-muted/50 p-2 rounded-lg">
            <div className="w-1 h-1 rounded-full bg-primary shadow-[0_0_5px_rgba(0,0,0,0.3)]" />
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
      <h3 className="text-lg font-bold mb-3 text-foreground flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-amber-500" />
        {title}
      </h3>
      <ul className="space-y-3">
        {tips.map((tip: string, i: number) => (
          <li key={i} className="text-sm text-muted-foreground flex gap-3 group">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500/30 group-hover:bg-amber-500 transition-colors mt-1.5 shrink-0" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}


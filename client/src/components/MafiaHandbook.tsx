import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Skull, Shield, Heart, User, Timer, Lightbulb, Zap, Info, ChevronRight, Users, Eye, Crosshair, Vote, Moon, Sun, Trophy, AlertTriangle } from "lucide-react";

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
          <p className="text-center text-xs text-muted-foreground mt-1">
            A complete guide for first-time players
          </p>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full mt-4 relative z-10">
          <TabsList className="grid w-full grid-cols-4 bg-muted/40 p-1 rounded-xl border border-border">
            <TabsTrigger value="overview" className="rounded-lg gap-1 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-[10px] sm:text-xs">
              <Info className="w-3 h-3" /> Basics
            </TabsTrigger>
            <TabsTrigger value="roles" className="rounded-lg gap-1 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 text-[10px] sm:text-xs">
              <Users className="w-3 h-3" /> Roles
            </TabsTrigger>
            <TabsTrigger value="flow" className="rounded-lg gap-1 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 text-[10px] sm:text-xs">
              <Timer className="w-3 h-3" /> Phases
            </TabsTrigger>
            <TabsTrigger value="strategies" className="rounded-lg gap-1 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-[10px] sm:text-xs">
              <Lightbulb className="w-3 h-3" /> Tips
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[450px] mt-4 pr-4">
            <AnimatePresence mode="wait">

              {/* OVERVIEW TAB */}
              <TabsContent value="overview" className="space-y-4 mt-0">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

                  <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4" /> What is Mafia?
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Mafia is a social deduction game. Players are secretly divided into two teams: the <strong className="text-foreground">Town</strong> (the good guys) and the <strong className="text-red-400">Mafia</strong> (the bad guys). Nobody knows who is who at first. The Town must figure out who the Mafia are and vote them out. The Mafia must deceive the Town and secretly eliminate them at night.
                    </p>
                  </div>

                  <div className="bg-card p-4 rounded-xl border border-border">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-blue-400" /> Teams at a Glance
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                        <p className="text-xs font-bold text-blue-400 mb-1">THE TOWN</p>
                        <p className="text-xs text-muted-foreground">Detectives, Doctors, and Civilians work together to find and eliminate all Mafia members.</p>
                      </div>
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <p className="text-xs font-bold text-red-400 mb-1">THE MAFIA</p>
                        <p className="text-xs text-muted-foreground">Hidden among the Town. They secretly choose someone to kill every night. They win when Mafia equals or outnumbers the Town.</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-card p-4 rounded-xl border border-border">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                      <Trophy className="w-4 h-4 text-yellow-400" /> How to Win
                    </h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p><strong className="text-emerald-400">Town wins</strong> when every Mafia member is eliminated through daytime voting.</p>
                      <p><strong className="text-red-400">Mafia wins</strong> when the number of living Mafia members equals or exceeds the number of living Town members.</p>
                    </div>
                  </div>

                  <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2 mb-2">
                      <Eye className="w-4 h-4" /> What Makes This Different?
                    </h3>
                    <ul className="text-sm text-muted-foreground space-y-1.5">
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-1 text-purple-400 shrink-0" /> Multiple Mafia can exist and <strong>they all know each other</strong>.</li>
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-1 text-purple-400 shrink-0" /> Multiple Doctors can exist and <strong>they all know each other</strong>.</li>
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-1 text-purple-400 shrink-0" /> Multiple Detectives can exist and <strong>they all know each other</strong>.</li>
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-1 text-purple-400 shrink-0" /> Everyone else is a Civilian with no special powers except their vote.</li>
                    </ul>
                  </div>
                </motion.div>
              </TabsContent>

              {/* ROLES TAB */}
              <TabsContent value="roles" className="space-y-4 mt-0">
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="grid gap-3">

                  <RoleSection
                    title="The Mafia"
                    icon={<Skull className="w-5 h-5" />}
                    color="text-red-500"
                    glow="shadow-red-500/10"
                    desc="You are a hidden killer. Your goal is to deceive the Town and eliminate them one by one at night."
                    abilities={[
                      "Each night, all living Mafia vote on who to kill. The target with the most votes dies (unless saved by a Doctor).",
                      "You know who the other Mafia are. Use the chat at night to coordinate with your teammates.",
                      "During the day, blend in. Act like a Civilian. Don't be too quiet, but don't be too loud either.",
                      "If there are multiple Mafia, work together to split votes and avoid suspicion.",
                    ]}
                  />

                  <RoleSection
                    title="The Detective"
                    icon={<Shield className="w-5 h-5" />}
                    color="text-blue-500"
                    glow="shadow-blue-500/10"
                    desc="You are the investigator. Each night you can check one player to see if they are Mafia."
                    abilities={[
                      "Each night, choose one player to investigate. The result tells you if they are Mafia or not.",
                      "You know who the other Detectives are. Share findings with them, but be careful — Mafia could be listening if you're too obvious.",
                      "Don't reveal yourself too early. Mafia will target you immediately if they know who you are.",
                      "Build trust slowly. Share information with reliable players, but verify their behavior first.",
                    ]}
                  />

                  <RoleSection
                    title="The Doctor"
                    icon={<Heart className="w-5 h-5" />}
                    color="text-emerald-500"
                    glow="shadow-emerald-500/10"
                    desc="You are the protector. Each night you choose one player to save from the Mafia's attack."
                    abilities={[
                      "Each night, choose one player to protect. If the Mafia tries to kill that player, they survive.",
                      "You know who the other Doctors are. Coordinate to cover different targets and maximize protection.",
                      "You can save yourself, but doing it every night is predictable. Save key players like Detectives when you suspect danger.",
                      "Watch who dies. If someone you protected still dies, there might be multiple Mafia or the protected player was already targeted by something else.",
                    ]}
                  />

                  <RoleSection
                    title="The Civilian"
                    icon={<User className="w-5 h-5" />}
                    color="text-slate-400"
                    glow="shadow-slate-500/10"
                    desc="You are the backbone of the Town. No special powers, but your vote and observations are the Town's greatest weapon."
                    abilities={[
                      "You vote during the day to eliminate suspicious players. Your vote counts just as much as anyone else's.",
                      "Watch patterns carefully. Who changes their story? Who avoids answering questions? Who seems too eager to vote out specific people?",
                      "Listen to Detectives and Doctors, but don't blindly trust anyone. Mafia can fake being helpful.",
                      "Speak up. A quiet Civilian looks suspicious. Share your observations and theories during the day.",
                    ]}
                  />
                </motion.div>
              </TabsContent>

              {/* FLOW TAB */}
              <TabsContent value="flow" className="space-y-4 mt-0">
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">

                  <div className="bg-card p-4 rounded-xl border border-border">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                      <Sun className="w-4 h-4 text-amber-400" /> Day Phase (Discussion + Voting)
                    </h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p><strong className="text-foreground">1. Discussion:</strong> Everyone talks in the chat. Share suspicions, defend yourself, ask questions. This is where the game is won or lost.</p>
                      <p><strong className="text-foreground">2. Voting:</strong> When voting opens, click on a player's card to vote to eliminate them. The player with the most votes is removed from the game.</p>
                      <p><strong className="text-foreground">3. Reveal:</strong> After voting, the eliminated player's role is revealed to everyone. Use this information to update your theories.</p>
                    </div>
                  </div>

                  <div className="bg-card p-4 rounded-xl border border-border">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                      <Moon className="w-4 h-4 text-indigo-400" /> Night Phase (Secret Actions)
                    </h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p><strong className="text-foreground">1. Mafia Turn:</strong> All Mafia members secretly vote on who to kill. The chosen player will die unless a Doctor saves them.</p>
                      <p><strong className="text-foreground">2. Doctor Turn:</strong> All Doctors secretly choose one player to protect from the Mafia's attack.</p>
                      <p><strong className="text-foreground">3. Detective Turn:</strong> All Detectives secretly investigate one player to learn if they are Mafia.</p>
                      <p><strong className="text-foreground">4. Morning:</strong> Everyone wakes up. If someone died, their role is revealed. If a Detective found a Mafia, they now know — but proving it without revealing themselves is tricky.</p>
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-2">
                      <Vote className="w-4 h-4" /> Tie-Breaking
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      If two or more players receive the same highest number of votes, nobody is eliminated that round. The game moves straight to night. This is why coordination matters — splitting votes helps the Mafia survive.
                    </p>
                  </div>
                </motion.div>
              </TabsContent>

              {/* STRATEGY TAB */}
              <TabsContent value="strategies" className="space-y-4 mt-0">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

                  <StrategyCard
                    title="For the Town (Civilians, Doctors, Detectives)"
                    accent="border-blue-500/20"
                    tips={[
                      "Watch for players who never change their story — or who change it too much. Both are suspicious.",
                      "If a Detective reveals they found a Mafia, ask them to describe their investigation process. Fake Detectives often can't answer detailed questions.",
                      "Doctors: Protect the most talkative and helpful players. Mafia usually targets players who are leading the Town.",
                      "Civilians: Don't stay silent. Even if you have no special info, sharing observations helps the Town coordinate.",
                      "If multiple players are accusing the same person from different angles, that person might actually be Mafia — or the accusers might be coordinated Mafia trying to frame someone.",
                    ]}
                  />

                  <StrategyCard
                    title="For the Mafia"
                    accent="border-red-500/20"
                    tips={[
                      "Don't all vote for the same person on Day 1. It looks coordinated. Spread your early votes to look like independent thinkers.",
                      "Sacrifice a Mafia teammate if it builds long-term trust. A trusted Mafia is more dangerous than two suspicious ones.",
                      "Defend a Civilian occasionally. If you save them from a bad vote, they might trust you later — and trust is the Mafia's best weapon.",
                      "When a real Detective reveals findings, discredit them subtly. Ask 'how do we know you're really a Detective?'",
                      "If there are multiple Mafia, have one play aggressive and one play quiet. Diverse strategies make the Town divide their suspicion.",
                    ]}
                  />

                  <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2 mb-2">
                      <Crosshair className="w-4 h-4" /> Red Flags to Watch For
                    </h3>
                    <ul className="text-sm text-muted-foreground space-y-1.5">
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-0.5 text-purple-400 shrink-0" /> A player who never votes first — they always wait to see where the crowd goes.</li>
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-0.5 text-purple-400 shrink-0" /> Someone who answers questions with questions instead of facts.</li>
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-0.5 text-purple-400 shrink-0" /> Two or more players who always agree with each other from the start.</li>
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-0.5 text-purple-400 shrink-0" /> A player who suddenly goes from silent to extremely defensive when accused.</li>
                      <li className="flex gap-2"><ChevronRight className="w-3 h-3 mt-0.5 text-purple-400 shrink-0" /> Someone who claims a special role too early with no proof to back it up.</li>
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

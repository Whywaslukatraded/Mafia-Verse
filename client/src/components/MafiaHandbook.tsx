import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Skull, Shield, Heart, User, Timer, Lightbulb, Zap, Info } from "lucide-react";

export function MafiaHandbook() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-slate-900/50 border-white/10 hover:bg-slate-800 transition-all hover:scale-105">
          <BookOpen className="w-4 h-4 text-blue-400" />
          <span>Handbook</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-slate-950 border-white/10 text-white shadow-2xl">
        <DialogHeader className="border-b border-white/5 pb-4">
          <DialogTitle className="text-3xl font-serif tracking-[0.2em] uppercase text-center bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
            Mafia Handbook
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="roles" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-3 bg-black/40 p-1 rounded-xl">
            <TabsTrigger value="roles" className="rounded-lg gap-2"><User className="w-4 h-4" /> Roles</TabsTrigger>
            <TabsTrigger value="rules" className="rounded-lg gap-2"><Info className="w-4 h-4" /> Rules</TabsTrigger>
            <TabsTrigger value="strategies" className="rounded-lg gap-2"><Lightbulb className="w-4 h-4" /> Strategy</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[450px] mt-4 pr-4">
            <TabsContent value="roles" className="space-y-6 mt-0">
              <div className="grid gap-4">
                <RoleSection 
                  title="The Mafias" 
                  icon={<Skull className="w-5 h-5" />} 
                  color="text-red-500" 
                  desc="The unseen predators. Your goal is to eliminate all non-mafia players until you hold the majority."
                  abilities={["Night Kill: Choose one player to eliminate each night.", "Deception: Blend in during the day to avoid being voted out."]}
                />
                <RoleSection 
                  title="The Detectives" 
                  icon={<Shield className="w-5 h-5" />} 
                  color="text-blue-500" 
                  desc="The eyes of the law. Your goal is to identify the Mafia members before it's too late."
                  abilities={["Investigate: Check one player each night to see if they are Mafia.", "Leadership: Guide the group's vote based on your findings."]}
                />
                <RoleSection 
                  title="The Doctors" 
                  icon={<Heart className="w-5 h-5" />} 
                  color="text-emerald-500" 
                  desc="The guardians. Protect the innocent from the Mafia's nightly attacks."
                  abilities={["Save: Choose one player to protect each night.", "Self-Preservation: You can save yourself (limitations apply)."]}
                />
                <RoleSection 
                  title="The Civilians" 
                  icon={<User className="w-5 h-5" />} 
                  color="text-slate-400" 
                  desc="The backbone of the city. Use your power of observation and voting to catch the Mafia."
                  abilities={["The Vote: Your primary weapon to eliminate suspects during the day.", "Deduction: Watch patterns and behavior to find inconsistencies."]}
                />
              </div>
            </TabsContent>

            <TabsContent value="rules" className="space-y-6 mt-0">
              <section className="space-y-4">
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                  <h3 className="text-lg font-bold flex items-center gap-2 mb-2 text-amber-500">
                    <Timer className="w-5 h-5" /> Game Flow
                  </h3>
                  <div className="space-y-3 text-sm text-slate-300">
                    <div className="flex gap-3">
                      <span className="font-bold text-white">1.</span>
                      <p><strong>Lobby:</strong> Game starts when the host clicks 'Start' (minimum 6 players).</p>
                    </div>
                    <div className="flex gap-3">
                      <span className="font-bold text-white">2.</span>
                      <p><strong>Day Phase:</strong> Discussion followed by public voting. Majority vote eliminates a player.</p>
                    </div>
                    <div className="flex gap-3">
                      <span className="font-bold text-white">3.</span>
                      <p><strong>Night Phase:</strong> Mafias, Doctors, and Detectives perform their secret actions in order.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                  <h3 className="text-lg font-bold flex items-center gap-2 mb-2 text-purple-500">
                    <Zap className="w-5 h-5" /> Victory Conditions
                  </h3>
                  <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
                    <li><strong className="text-white">Town Victory:</strong> All Mafia members are eliminated.</li>
                    <li><strong className="text-white">Mafia Victory:</strong> Mafia equals or outnumbers the Town members.</li>
                  </ul>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="strategies" className="space-y-6 mt-0">
              <div className="space-y-4">
                <StrategyCard 
                  title="For the Town" 
                  tips={[
                    "Watch for 'quiet' players who don't contribute much to discussion.",
                    "Detectives should be careful about revealing themselves too early.",
                    "Doctors: Try to predict who the Mafia will target (usually the loudest talkers or revealed Detectives)."
                  ]}
                />
                <StrategyCard 
                  title="For the Mafia" 
                  tips={[
                    "Don't all vote for the same person early on; it looks suspicious.",
                    "Try to gain the trust of 'confirmed' Town members.",
                    "Sometimes leaving a known Detective alive for a night can cause more confusion."
                  ]}
                />
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function RoleSection({ title, icon, color, desc, abilities }: any) {
  return (
    <div className="bg-white/5 p-4 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
      <h3 className={`text-lg font-bold flex items-center gap-2 mb-2 ${color}`}>
        {icon} {title}
      </h3>
      <p className="text-sm text-slate-300 mb-3">{desc}</p>
      <div className="space-y-1">
        {abilities.map((a: string, i: number) => (
          <div key={i} className="text-xs text-slate-400 flex gap-2">
            <span className="text-primary">•</span> {a}
          </div>
        ))}
      </div>
    </div>
  );
}

function StrategyCard({ title, tips }: any) {
  return (
    <div className="bg-white/5 p-4 rounded-xl border border-white/5">
      <h3 className="text-lg font-bold mb-3 text-white">{title}</h3>
      <ul className="space-y-3">
        {tips.map((tip: string, i: number) => (
          <li key={i} className="text-sm text-slate-300 flex gap-3">
            <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Skull, Shield, Heart, User, Timer } from "lucide-react";

export function MafiaHandbook() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <BookOpen className="w-4 h-4" />
          <span>Handbook</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-black/90 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif tracking-widest uppercase">Underworld Handbook</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-6 pt-4">
            <section>
              <h3 className="text-lg font-bold text-red-500 flex items-center gap-2 mb-2">
                <Skull className="w-5 h-5" /> The Mafias
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your goal is to eliminate all non-mafia players. Each night, discuss with your teammates and choose a target to eliminate. During the day, blend in and avoid suspicion.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-blue-500 flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5" /> The Detectives
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Each night, you can investigate one player to reveal if they are a Mafia member. Use this information wisely to guide the group during the day.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-emerald-500 flex items-center gap-2 mb-2">
                <Heart className="w-5 h-5" /> The Doctors
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Each night, you can choose one player to save. If the Mafias target that player, they will survive the night. You can save yourself, but not two nights in a row.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-slate-400 flex items-center gap-2 mb-2">
                <User className="w-5 h-5" /> The Civilians
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You have no special night actions. Your weapon is your voice and your vote. Observe carefully and try to root out the Mafias during the day.
              </p>
            </section>

            <section className="border-t border-white/5 pt-4">
              <h3 className="text-lg font-bold text-amber-500 flex items-center gap-2 mb-2">
                <Timer className="w-5 h-5" /> Game Phases
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
                <li><strong>Lobby:</strong> Wait for at least 6 players to join.</li>
                <li><strong>Day:</strong> Discuss and vote to eliminate a suspect.</li>
                <li><strong>Night:</strong> Roles perform their secret actions.</li>
              </ul>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

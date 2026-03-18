import { Moon, Sun, Clock, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface PhaseIndicatorProps {
  status: string; // lobby, day, night, ended
  phase: string;  // discussion, voting, mafia, doctor, detective
  turn: number;
  timeRemaining?: number; // seconds left
}

export function PhaseIndicator({ status, phase, turn, timeRemaining }: PhaseIndicatorProps) {
  const isNight = status === "night";
  const isDay = status === "day";
  const isLobby = status === "lobby";
  const isEnded = status === "ended";

  let title = "";
  let description = "";
  let Icon: any = isNight ? Moon : Sun;

  if (isLobby) {
    title = "Waiting Lobby";
    description = "Waiting for players to join...";
    Icon = Crown;
  } else if (isEnded) {
    title = "Game Over";
    description = "The game has ended.";
    Icon = Crown;
  } else if (isDay) {
    title = `Day ${turn}`;
    if (phase === "discussion") description = "Discuss who the imposters are.";
    if (phase === "voting") description = "Vote to eliminate a suspect.";
  } else {
    title = `Night ${turn}`;
    description = "Mafia and roles are acting...";
  }

  function Crown(props: any) {
    return <Sun {...props} className={cn(props.className, "opacity-0")} />; // Placeholder for layout
  }

  return (
    <div className={cn(
      "w-full py-6 px-4 rounded-xl mb-6 relative overflow-hidden transition-all duration-500",
      isNight ? "bg-indigo-950 border border-indigo-900" : "bg-orange-50 border border-orange-200/50",
      isLobby && "bg-card border-border",
      isEnded && "bg-slate-900 border-slate-800"
    )}>
      <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
        <Icon className={cn("w-32 h-32", isNight ? "text-indigo-200" : "text-orange-500")} />
      </div>

      <div className="relative z-10 flex items-center gap-4">
        <div className={cn(
          "p-3 rounded-full border shadow-sm",
          isNight ? "bg-indigo-900/50 border-indigo-700 text-indigo-300" : "bg-orange-100 border-orange-200 text-orange-600",
          isLobby && "bg-secondary text-secondary-foreground border-border",
          isEnded && "bg-slate-800 text-slate-400 border-slate-700"
        )}>
          {isNight ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
        </div>
        <div>
          <h2 className={cn(
            "text-2xl font-bold font-serif tracking-tight",
            isNight ? "text-indigo-100" : "text-orange-950",
            isLobby && "text-foreground",
            isEnded && "text-foreground"
          )}>
            {title}
          </h2>
          <p className={cn(
            "text-sm font-medium",
            isNight ? "text-indigo-300" : "text-orange-800/80",
            isLobby && "text-muted-foreground",
            isEnded && "text-muted-foreground"
          )}>
            {description}
          </p>
        </div>
        
        {/* Phase Badge and Timer */}
        {!isLobby && !isEnded && (
          <div className="ml-auto flex items-center gap-3">
            <div className="px-3 py-1 rounded-full bg-background/50 backdrop-blur border text-xs font-semibold uppercase tracking-wider">
              {phase.replace('_', ' ')}
            </div>
            {timeRemaining !== undefined && timeRemaining > 0 && (
              <motion.div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/40 backdrop-blur"
                animate={{
                  scale: timeRemaining <= 5 ? [1, 1.05, 1] : 1,
                }}
                transition={{
                  duration: 0.6,
                  repeat: timeRemaining <= 5 ? Infinity : 0,
                }}
              >
                <Clock className={cn(
                  "w-4 h-4 font-semibold",
                  timeRemaining <= 5 ? "text-red-400" : "text-primary"
                )} />
                <span className={cn(
                  "text-sm font-bold font-mono",
                  timeRemaining <= 5 ? "text-red-400" : "text-primary"
                )}>
                  {timeRemaining}s
                </span>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

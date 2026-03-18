import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Search, Shield, Heart, User, Timer, Plus, Minus, Skull, Smile, Trophy, Target, BarChart2, Settings, Sparkles } from "lucide-react";
import { useCreateRoom, useJoinRoom } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const AVATARS = [
  "👤", "🧛", "🕵️", "🏥", "🧟", "🐺", "🔪", "🩸", "🦉", "🕯️", "🎭", "🗝️",
  "🤡", "🤫", "☠️", "🪦", "🔍", "💊", "🌙", "☀️", "🧥", "🎩", "💼", "🧨",
  "🦾", "🧠", "🧬", "🕸️", "♟️", "🎲", "🥨", "🍺", "🍷", "🥃", "🍕", "🍔",
  "🥷", "🧙", "🧞", "🧜", "🧚", "🦇"
];

const ACCESSORIES = ["None", "🕶️", "👑", "🎓", "🎀", "🎩", "🎧", "🎭"];
const CLOTHING = ["None", "👔", "👗", "🧥", "🥋", "👕", "🦺", "🧣"];
const BGS = ["bg-primary/10", "bg-red-500/10", "bg-blue-500/10", "bg-emerald-500/10", "bg-amber-500/10", "bg-purple-500/10"];

const ACHIEVEMENTS = [
  { id: 'first_win', name: 'First Blood', description: 'Win your first game', icon: '🩸' },
  { id: 'mafia_master', name: 'Don of the City', description: 'Win 5 games as Mafia', icon: '🍷' },
  { id: 'savior', name: 'Life Saver', description: 'Save 3 players as Doctor', icon: '💉' },
  { id: 'truth_seeker', name: 'Eagle Eye', description: 'Find 3 Mafia as Detective', icon: '🔍' },
  { id: 'survivor', name: 'Final Stand', description: 'Win as the last Civilian alive', icon: '🛡️' },
  { id: 'quick_thinker', name: 'Quick Thinker', description: 'Win a game with short phase durations', icon: '⚡' },
  { id: 'ghost_whisperer', name: 'Ghost Whisperer', description: 'Chat 50 times in spectator chat', icon: '👻' },
  { id: 'fashionista', name: 'Fashionista', description: 'Change your outfit 10 times', icon: '💅' },
  { id: 'night_owl', name: 'Night Owl', description: 'Play 10 games during the night phase', icon: '🦉' }
];

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createRoom = useCreateRoom();
  const joinRoom = useJoinRoom();

  const [activeTab, setActiveTab] = useState("join");
  const [joinCode, setJoinCode] = useState("");
  
  // Persistent Profile
  const [name, setName] = useState(() => localStorage.getItem("mafia_profile_name") || "");
  const [avatar, setAvatar] = useState(() => localStorage.getItem("mafia_profile_avatar") || AVATARS[0]);
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem("mafia_profile_config");
    return saved ? JSON.parse(saved) : { accessory: "None", clothing: "None", bg: BGS[0] };
  });
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem("mafia_stats");
    return saved ? JSON.parse(saved) : { wins: 0, gamesPlayed: 0, achievements: [] };
  });

  useEffect(() => {
    localStorage.setItem("mafia_profile_name", name);
    localStorage.setItem("mafia_profile_avatar", avatar);
    localStorage.setItem("mafia_profile_config", JSON.stringify(config));
    
    // Track fashionista achievement
    const fashionCount = parseInt(localStorage.getItem("mafia_fashion_count") || "0");
    localStorage.setItem("mafia_fashion_count", (fashionCount + 1).toString());
    if (fashionCount + 1 >= 10) {
      const currentStats = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
      const achievements = new Set(currentStats.achievements || []);
      if (!achievements.has('fashionista')) {
        achievements.add('fashionista');
        localStorage.setItem("mafia_stats", JSON.stringify({ ...currentStats, achievements: Array.from(achievements) }));
        window.dispatchEvent(new Event('storage'));
      }
    }
  }, [name, avatar, config]);

  const [roomName, setRoomName] = useState("");
  const [showVoteResults, setShowVoteResults] = useState(true);
  const [showRoleReveal, setShowRoleReveal] = useState(true);

  // Create State
  const [counts, setCounts] = useState({
    mafia: 2,
    detective: 1,
    doctor: 1,
    civilian: 4,
    phaseDuration: 30,
    mafiaDuration: 15,
    doctorDuration: 15,
    detectiveDuration: 15,
  });

  const adjustCount = (role: keyof typeof counts, delta: number) => {
    setCounts(prev => ({
      ...prev,
      [role]: Math.max(0, prev[role] + delta)
    }));
  };

  const totalPlayers = counts.mafia + counts.detective + counts.doctor + counts.civilian;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !joinCode) return;
    
    try {
      const res = await joinRoom.mutateAsync({ name, avatar, code: joinCode, avatarConfig: config } as any);
      // Store session info
      localStorage.setItem(`mafia_session_${res.code}`, res.sessionId);
      localStorage.setItem(`mafia_player_${res.code}`, res.playerId.toString());
      setLocation(`/room/${res.code}`);
    } catch (err: any) {
      toast({
        title: "Failed to join",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleCreate = async () => {
    if (!name) {
      toast({ title: "Name required", description: "Please enter your name before creating a room.", variant: "destructive" });
      return;
    }
    try {
      const res = await createRoom.mutateAsync({ 
        name, 
        avatar,
        avatarConfig: config,
        settings: {
          mafiaCount: counts.mafia,
          detectiveCount: counts.detective,
          doctorCount: counts.doctor,
          civilianCount: counts.civilian,
          phaseDuration: counts.phaseDuration,
          mafiaDuration: counts.mafiaDuration,
          doctorDuration: counts.doctorDuration,
          detectiveDuration: counts.detectiveDuration,
          roomName: roomName.trim() || undefined,
          showVoteResults,
          showRoleReveal,
        }
      } as any);
      localStorage.setItem(`mafia_session_${res.code}`, res.sessionId);
      localStorage.setItem(`mafia_player_${res.code}`, res.playerId.toString());
      setLocation(`/room/${res.code}`);
    } catch (err: any) {
      toast({
        title: "Failed to create",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none bg-slate-950">
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
          <div className="inline-flex items-center justify-center p-4 bg-slate-900 border-2 border-slate-800 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.4)] mb-6 ring-4 ring-blue-500/10 relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-transparent to-transparent opacity-50" />
            <Search className="w-10 h-10 text-blue-400 relative z-10 drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]" strokeWidth={2.5} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[1px] bg-white/5 rotate-45 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[1px] bg-white/5 -rotate-45 pointer-events-none" />
          </div>
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50 mb-2 drop-shadow-sm font-serif uppercase tracking-tighter">MAFIA</h1>
          <p className="text-muted-foreground font-medium uppercase tracking-[0.3em] text-[10px] opacity-80">Trust No One • Find The Truth • Survive The Night</p>
        </div>

        <div className="space-y-6 mb-8">
          <Card className="glass-card border-none bg-black/40 backdrop-blur-xl ring-1 ring-white/10 p-6">
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-start gap-8 w-full">
                <div className="relative group flex-shrink-0">
                  <div className={cn(
                    "w-32 h-32 rounded-full border-2 border-primary/20 flex items-center justify-center text-6xl shadow-2xl shadow-primary/10 relative overflow-hidden",
                    config.bg
                  )}>
                    <span className="relative z-10">{avatar}</span>
                    {config.accessory !== "None" && (
                      <span className="absolute top-4 text-3xl z-30">{config.accessory}</span>
                    )}
                    {config.clothing !== "None" && (
                      <span className="absolute bottom-4 text-3xl z-20 opacity-90">{config.clothing}</span>
                    )}
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-slate-900 border border-white/10 p-1.5 rounded-full shadow-lg">
                    <Smile className="w-4 h-4 text-primary" />
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Accessory</Label>
                    <div className="flex flex-wrap gap-1">
                      {ACCESSORIES.map(a => (
                        <button
                          key={a}
                          onClick={() => setConfig({ ...config, accessory: a })}
                          className={cn(
                            "w-8 h-8 rounded border flex items-center justify-center text-sm transition-all",
                            config.accessory === a ? "bg-primary border-primary text-white" : "bg-white/5 border-white/10 hover:bg-white/10"
                          )}
                        >
                          {a === "None" ? "Ø" : a}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Clothing</Label>
                    <div className="flex flex-wrap gap-1">
                      {CLOTHING.map(c => (
                        <button
                          key={c}
                          onClick={() => setConfig({ ...config, clothing: c })}
                          className={cn(
                            "w-8 h-8 rounded border flex items-center justify-center text-sm transition-all",
                            config.clothing === c ? "bg-primary border-primary text-white" : "bg-white/5 border-white/10 hover:bg-white/10"
                          )}
                        >
                          {c === "None" ? "Ø" : c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Background</Label>
                    <div className="flex flex-wrap gap-1">
                      {BGS.map(bg => (
                        <button
                          key={bg}
                          onClick={() => setConfig({ ...config, bg })}
                          className={cn(
                            "w-8 h-8 rounded-full border transition-all",
                            bg,
                            config.bg === bg ? "ring-2 ring-primary ring-offset-2 ring-offset-black" : "border-white/10"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="w-full space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Your Mafia Handle</Label>
                  <Input 
                    placeholder="CHOOSE A NAME..." 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="bg-white/5 border-white/10 h-12 text-center font-bold tracking-tight focus:ring-primary/50 text-lg"
                    maxLength={12}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Pick Your Persona</Label>
                  <div className="grid grid-cols-6 gap-2">
                    {AVATARS.map(a => (
                      <button
                        key={a}
                        onClick={() => setAvatar(a)}
                        className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all border border-transparent",
                          avatar === a ? "bg-primary border-primary shadow-lg shadow-primary/20 scale-110 text-white" : "bg-white/5 hover:bg-white/10"
                        )}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 flex gap-4 w-full">
                  <button
                    onClick={() => setLocation("/profile")}
                    className="flex-1 p-3 bg-white/5 rounded-xl border border-white/5 flex flex-col items-center gap-1 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Trophy className="w-4 h-4 text-yellow-500" />
                    <span className="text-2xl font-black font-mono">{stats.wins}</span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Wins</span>
                  </button>
                  <button
                    onClick={() => setLocation("/leaderboard")}
                    className="flex-1 p-3 bg-white/5 rounded-xl border border-white/5 flex flex-col items-center gap-1 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <BarChart2 className="w-4 h-4 text-blue-500" />
                    <span className="text-2xl font-black font-mono">{stats.gamesPlayed}</span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Leaderboard</span>
                  </button>
                  <button
                    onClick={() => setLocation("/settings")}
                    className="flex-1 p-3 bg-white/5 rounded-xl border border-white/5 flex flex-col items-center gap-1 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Settings className="w-4 h-4 text-gray-400" />
                    <span className="text-lg font-black font-mono">⚙️</span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Settings</span>
                  </button>
                  <button
                    onClick={() => setLocation("/cosmetics")}
                    className="flex-1 p-3 bg-white/5 rounded-xl border border-white/5 flex flex-col items-center gap-1 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-yellow-400" />
                    <span className="text-lg font-black font-mono">✨</span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Cosmetics</span>
                  </button>
                </div>

                <div className="pt-2 flex justify-center">
                  <span className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] font-mono">
                    System Core: 2,900+ Source Lines
                  </span>
                </div>

                {stats.achievements?.length > 0 && (
                  <div className="w-full space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Achievements</Label>
                    <div className="flex flex-wrap gap-2">
                      {stats.achievements.map((id: string) => {
                        const ach = ACHIEVEMENTS.find(a => a.id === id);
                        if (!ach) return null;
                        return (
                          <div key={id} className="group relative">
                            <div className="w-10 h-10 rounded-full bg-yellow-500/20 border border-yellow-500/50 flex items-center justify-center text-xl cursor-help hover:scale-110 transition-transform">
                              {ach.icon}
                            </div>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-black/90 border border-white/10 rounded-lg text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                              <p className="font-bold text-yellow-500 uppercase">{ach.name}</p>
                              <p className="text-white/60">{ach.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8 bg-black/40 backdrop-blur border border-white/5 p-1 h-14 rounded-full">
            <TabsTrigger value="join" className="rounded-full h-full data-[state=active]:bg-primary font-bold tracking-wide">JOIN GAME</TabsTrigger>
            <TabsTrigger value="create" className="rounded-full h-full data-[state=active]:bg-primary font-bold tracking-wide">CREATE ROOM</TabsTrigger>
          </TabsList>

          <TabsContent value="join">
            <Card className="glass-card border-none bg-black/40 backdrop-blur-xl ring-1 ring-white/10">
              <CardContent className="pt-6">
                <form onSubmit={handleJoin} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Room Code</Label>
                    <Input 
                      placeholder="E.G. A4X9" 
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      className="text-center uppercase text-2xl tracking-[0.5em] font-mono bg-white/5 border-white/10 h-14 focus:ring-primary/50"
                      maxLength={4}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 rounded-xl"
                    disabled={joinRoom.isPending || !joinCode || !name}
                  >
                    {joinRoom.isPending ? "JOINING..." : "ENTER THE ABYSS"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card className="glass-card border-none bg-black/40 backdrop-blur-xl ring-1 ring-white/10">
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Room Name (optional)</Label>
                  <Input
                    placeholder="e.g. The Godfather's Table"
                    value={roomName}
                    onChange={e => setRoomName(e.target.value)}
                    className="bg-white/5 border-white/10 h-11 focus:ring-primary/50"
                    maxLength={32}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { key: 'mafia', label: 'Mafias', icon: Skull, color: 'text-red-500', bg: 'bg-red-500/10' },
                    { key: 'detective', label: 'Detectives', icon: Shield, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { key: 'doctor', label: 'Doctors', icon: Heart, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { key: 'civilian', label: 'Civilians', icon: User, color: 'text-slate-400', bg: 'bg-slate-500/10' },
                    { key: 'phaseDuration', label: 'Voting Time (sec)', icon: Timer, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                    { key: 'mafiaDuration', label: 'Mafia Night Time (sec)', icon: Skull, color: 'text-red-400', bg: 'bg-red-400/10' },
                    { key: 'doctorDuration', label: 'Doctor Night Time (sec)', icon: Heart, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
                    { key: 'detectiveDuration', label: 'Detective Night Time (sec)', icon: Shield, color: 'text-blue-400', bg: 'bg-blue-400/10' },
                  ].map((role) => (
                    <div key={role.key} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${role.bg}`}>
                          <role.icon className={`w-5 h-5 ${role.color}`} />
                        </div>
                        <span className="font-semibold tracking-tight">{role.label}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 hover:bg-white/10 rounded-md"
                          onClick={() => adjustCount(role.key as any, -1)}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="w-8 text-center font-mono font-bold text-lg">{counts[role.key as keyof typeof counts]}</span>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 hover:bg-white/10 rounded-md"
                          onClick={() => adjustCount(role.key as any, 1)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-white/5 space-y-3">
                  <div className="flex justify-between items-center px-2">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground text-xs uppercase tracking-widest font-bold">Total Players</span>
                      <span className="text-xs text-muted-foreground/60 italic">Min 6 players required</span>
                    </div>
                    <span className="text-3xl font-black font-mono tracking-tighter">{totalPlayers}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 px-2">
                    <button
                      onClick={() => setShowVoteResults(!showVoteResults)}
                      className={cn(
                        "text-xs px-3 py-2 rounded-lg border font-bold uppercase tracking-wider transition-all",
                        showVoteResults ? "bg-primary/20 border-primary/40 text-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                      )}
                    >
                      {showVoteResults ? "✓ Vote Results" : "Vote Results"}
                    </button>
                    <button
                      onClick={() => setShowRoleReveal(!showRoleReveal)}
                      className={cn(
                        "text-xs px-3 py-2 rounded-lg border font-bold uppercase tracking-wider transition-all",
                        showRoleReveal ? "bg-primary/20 border-primary/40 text-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                      )}
                    >
                      {showRoleReveal ? "✓ Role Reveal" : "Role Reveal"}
                    </button>
                  </div>
                </div>

                <Button 
                  onClick={handleCreate}
                  className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 rounded-xl"
                  disabled={createRoom.isPending || totalPlayers < 6}
                >
                  {createRoom.isPending ? "PREPARING..." : "CREATE ROOM"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

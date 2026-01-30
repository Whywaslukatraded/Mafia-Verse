import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Search, Shield, Heart, User, Timer, Plus, Minus, BookOpen } from "lucide-react";
import { useCreateRoom, useJoinRoom } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createRoom = useCreateRoom();
  const joinRoom = useJoinRoom();

  const [activeTab, setActiveTab] = useState("join");
  
  // Join State
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // Create State
  const [counts, setCounts] = useState({
    mafia: 2,
    detective: 1,
    doctor: 1,
    civilian: 4,
    phaseDuration: 30,
  });

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinName || !joinCode) return;
    
    try {
      const res = await joinRoom.mutateAsync({ name: joinName, code: joinCode });
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
    try {
      const res = await createRoom.mutateAsync({ settings: {
        mafiaCount: counts.mafia,
        detectiveCount: counts.detective,
        doctorCount: counts.doctor,
        civilianCount: counts.civilian,
        phaseDuration: counts.phaseDuration,
      }});
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

  const adjustCount = (role: keyof typeof counts, delta: number) => {
    setCounts(prev => ({
      ...prev,
      [role]: Math.max(0, prev[role] + delta)
    }));
  };

  const totalPlayers = counts.mafia + counts.detective + counts.doctor + counts.civilian;

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
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Your Name</Label>
                    <Input 
                      placeholder="ENTER NICKNAME" 
                      value={joinName}
                      onChange={e => setJoinName(e.target.value)}
                      className="bg-white/5 border-white/10 h-12 focus:ring-primary/50"
                      maxLength={12}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 rounded-xl"
                    disabled={joinRoom.isPending || !joinCode || !joinName}
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
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { key: 'mafia', label: 'Mafias', icon: Search, color: 'text-red-500', bg: 'bg-red-500/10' },
                    { key: 'detective', label: 'Detectives', icon: Shield, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { key: 'doctor', label: 'Doctors', icon: Heart, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { key: 'civilian', label: 'Civilians', icon: User, color: 'text-slate-400', bg: 'bg-slate-500/10' },
                    { key: 'phaseDuration', label: 'Voting Time (sec)', icon: Timer, color: 'text-amber-500', bg: 'bg-amber-500/10' },
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

                <div className="pt-4 border-t border-white/5 flex justify-between items-center px-2">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs uppercase tracking-widest font-bold">Total Players</span>
                    <span className="text-xs text-muted-foreground/60 italic">Min 6 players required</span>
                  </div>
                  <span className="text-3xl font-black font-mono tracking-tighter">{totalPlayers}</span>
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

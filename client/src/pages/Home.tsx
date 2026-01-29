import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Skull, Search, Play, Users, Plus, Minus } from "lucide-react";
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

  const totalPlayers = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[100px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-4 bg-background border border-border rounded-full shadow-2xl mb-6 ring-4 ring-black/20">
            <Skull className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50 mb-2 drop-shadow-sm font-serif">MAFIA</h1>
          <p className="text-muted-foreground font-medium">Deception, Deduction, and Survival</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8 bg-black/40 backdrop-blur border border-white/5 p-1 h-14 rounded-full">
            <TabsTrigger value="join" className="rounded-full h-full data-[state=active]:bg-primary font-bold tracking-wide">JOIN GAME</TabsTrigger>
            <TabsTrigger value="create" className="rounded-full h-full data-[state=active]:bg-primary font-bold tracking-wide">CREATE NEW</TabsTrigger>
          </TabsList>

          <TabsContent value="join">
            <Card className="glass-card border-none">
              <CardContent className="pt-6">
                <form onSubmit={handleJoin} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Room Code</Label>
                    <Input 
                      placeholder="e.g. A4X9" 
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      className="text-center uppercase text-xl tracking-widest font-mono bg-black/20 border-white/10 h-12"
                      maxLength={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Your Name</Label>
                    <Input 
                      placeholder="Enter nickname" 
                      value={joinName}
                      onChange={e => setJoinName(e.target.value)}
                      className="bg-black/20 border-white/10 h-12"
                      maxLength={12}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-lg font-bold bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg shadow-primary/25"
                    disabled={joinRoom.isPending || !joinCode || !joinName}
                  >
                    {joinRoom.isPending ? "Joining..." : "Enter Room"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card className="glass-card border-none">
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { key: 'mafia', label: 'Mafia', icon: Skull, color: 'text-red-400' },
                    { key: 'detective', label: 'Detectives', icon: Search, color: 'text-blue-400' },
                    { key: 'doctor', label: 'Doctors', icon: Plus, color: 'text-green-400' },
                    { key: 'civilian', label: 'Civilians', icon: Users, color: 'text-slate-400' },
                  ].map((role) => (
                    <div key={role.key} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5">
                      <div className="flex items-center gap-3">
                        <role.icon className={`w-5 h-5 ${role.color}`} />
                        <span className="font-medium">{role.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 hover:bg-white/10"
                          onClick={() => adjustCount(role.key as any, -1)}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="w-6 text-center font-mono font-bold">{counts[role.key as keyof typeof counts]}</span>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 hover:bg-white/10"
                          onClick={() => adjustCount(role.key as any, 1)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-white/10 flex justify-between items-center px-2">
                  <span className="text-muted-foreground text-sm font-medium">Total Players</span>
                  <span className="text-xl font-bold">{totalPlayers}</span>
                </div>

                <Button 
                  onClick={handleCreate}
                  className="w-full h-12 text-lg font-bold bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg shadow-primary/25"
                  disabled={createRoom.isPending || totalPlayers < 3}
                >
                  {createRoom.isPending ? "Creating..." : "Create Game Room"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

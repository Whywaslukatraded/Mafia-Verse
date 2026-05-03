import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { api } from "@shared/routes";
import { Search } from "lucide-react";

const AVATARS = ["👤", "🧔", "👨", "👩", "🧑", "👨‍🦰", "👩‍🦱", "🧔‍♂️", "🧔‍♀️", "👨‍🦱"];

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSignup, setIsSignup] = useState(false);
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint = isSignup ? api.auth.signup.path : api.auth.login.path;
      const body = isSignup 
        ? { username, password, name, avatar }
        : { username, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.message || "Authentication failed",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const data = await res.json();
      localStorage.setItem("mafia_userId", data.userId.toString());
      localStorage.setItem("mafia_username", data.username);
      localStorage.setItem("mafia_name", data.name);
      localStorage.setItem("mafia_avatar", data.avatar);

      toast({
        title: isSignup ? "Account created!" : "Logged in!",
        description: `Welcome ${data.name}!`,
      });

      setLocation("/");
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none bg-slate-950">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-slate-900 border-2 border-slate-800 rounded-full mb-6">
            <Search className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-2">MAFIA</h1>
          <p className="text-muted-foreground text-sm">{isSignup ? "Create Account" : "Login"}</p>
        </div>

        <Card className="glass-card border-none bg-black/40 backdrop-blur-xl ring-1 ring-white/10 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs">Username</Label>
              <Input
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Password</Label>
              <Input
                type="password"
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="mt-1"
              />
            </div>

            {isSignup && (
              <>
                <div>
                  <Label className="text-xs">Display Name</Label>
                  <Input
                    type="text"
                    placeholder="your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Avatar</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {AVATARS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAvatar(a)}
                        className={`w-10 h-10 rounded border flex items-center justify-center text-lg ${
                          avatar === a
                            ? "bg-blue-600 border-blue-400"
                            : "bg-white/5 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Button type="submit" disabled={loading} className="w-full mt-6">
              {loading ? "..." : isSignup ? "Sign Up" : "Login"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setIsSignup(!isSignup);
              setUsername("");
              setPassword("");
              setName("");
            }}
            className="w-full text-sm text-blue-400 hover:text-blue-300 mt-4"
          >
            {isSignup ? "Already have an account? Login" : "Need an account? Sign Up"}
          </button>

          <Button
            variant="outline"
            onClick={() => setLocation("/")}
            className="w-full mt-2"
            size="sm"
          >
            Back to Home
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}

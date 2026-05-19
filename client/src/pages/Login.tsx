import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { api } from "@shared/routes";
import { Search, Shield } from "lucide-react";

const AVATARS = ["👤", "🧔", "👨", "👩", "🧑", "👨‍🦰", "👩‍🦱", "🧔‍♂️", "🧔‍♀️", "👨‍🦱"];

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSignup, setIsSignup] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // If 2FA step is active, submit the code
      if (needs2FA) {
        const res = await fetch("/api/auth/login-2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, totpCode }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast({ title: "Error", description: err.message || "Invalid 2FA code", variant: "destructive" });
          setLoading(false);
          return;
        }

        const data = await res.json();
        finalizeLogin(data);
        return;
      }

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
        let msg = "Authentication failed";
        try {
          const error = await res.json();
          msg = error.message || msg;
          if (Array.isArray(error.message)) {
            msg = error.message.map((e: any) => e.message).join("; ");
          }
        } catch { /* not JSON */ }
        toast({
          title: "Error",
          description: msg,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const data = await res.json();

      // If 2FA is required, show the code input
      if (data.requires2FA) {
        setNeeds2FA(true);
        setLoading(false);
        toast({
          title: "2FA Required",
          description: "Enter the code from your authenticator app.",
        });
        return;
      }

      finalizeLogin(data);
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

  const finalizeLogin = (data: any) => {
    localStorage.setItem("mafia_userId", data.userId.toString());
    localStorage.setItem("mafia_username", data.username);
    localStorage.setItem("mafia_name", data.name);
    localStorage.setItem("mafia_avatar", data.avatar);
    toast({
      title: needs2FA ? "Authenticated!" : "Logged in!",
      description: `Welcome ${data.name}!`,
    });
    setLocation("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none bg-background">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 dark:bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/10 dark:bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-card border-2 border-border rounded-full mb-6">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-black text-foreground mb-2">MAFIA</h1>
          <p className="text-muted-foreground text-sm">{isSignup ? "Create Account" : "Login"}</p>
        </div>

        <Card className="glass-card border-none bg-card/80 backdrop-blur-xl ring-1 ring-border p-6">
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

            {needs2FA && (
              <div>
                <Label className="text-xs">2FA Code</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Shield className="w-4 h-4 text-green-500 shrink-0" />
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    disabled={loading}
                    className="text-center text-lg tracking-widest"
                    data-testid="input-login-2fa"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Enter the 6-digit code from your authenticator app</p>
              </div>
            )}

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
                            ? "bg-primary border-primary text-primary-foreground"
                            : "bg-muted/50 border-border hover:bg-muted"
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

          {!isSignup && (
            <button
              type="button"
              onClick={() => setLocation("/forgot-password")}
              className="w-full text-sm text-muted-foreground hover:text-foreground mt-2"
              data-testid="link-forgot-password"
            >
              Forgot your password?
            </button>
          )}

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

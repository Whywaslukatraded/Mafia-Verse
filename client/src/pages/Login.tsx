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
import { cn } from "@/lib/utils";

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
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!username.trim()) e.username = "Username is required";
    else if (username.trim().length < 3) e.username = "Min 3 characters";
    if (!password.trim()) e.password = "Password is required";
    else if (password.length < 6) e.password = "Min 6 characters";
    if (isSignup) {
      if (!name.trim()) e.name = "Display name is required";
      else if (name.trim().length < 2) e.name = "Min 2 characters";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast({ title: "Check your inputs", description: "Please fix the errors above", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
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
        ? { username: username.trim(), password, name: name.trim(), avatar }
        : { username: username.trim(), password };

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
          if (Array.isArray(msg)) {
            msg = msg.map((e: any) => e.message).join("; ");
          }
        } catch { /* not JSON */ }
        const title = res.status === 503 ? "Server Busy" : "Error";
        toast({ title, description: msg, variant: "destructive" });
        if (res.status === 503) {
          setTimeout(() => setLoading(false), 2000);
          return;
        }
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data.requires2FA) {
        setNeeds2FA(true);
        setLoading(false);
        toast({ title: "2FA Required", description: "Enter the code from your authenticator app." });
        return;
      }
      finalizeLogin(data);
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const finalizeLogin = (data: any) => {
    localStorage.setItem("mafia_userId", data.userId.toString());
    localStorage.setItem("mafia_username", data.username);
    localStorage.setItem("mafia_name", data.name);
    localStorage.setItem("mafia_avatar", data.avatar);
    toast({ title: needs2FA ? "Authenticated!" : "Logged in!", description: `Welcome ${data.name}!` });
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
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Username</Label>
                <span className="text-[10px] text-muted-foreground">min 3 chars</span>
              </div>
              <Input
                type="text"
                placeholder="choose a username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setErrors((prev) => ({ ...prev, username: "" })); }}
                disabled={loading}
                className={cn("mt-1", errors.username && "border-destructive ring-1 ring-destructive")}
                data-testid="input-username"
              />
              {errors.username && <p className="text-[10px] text-destructive mt-1">{errors.username}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Password</Label>
                <span className="text-[10px] text-muted-foreground">min 6 chars</span>
              </div>
              <Input
                type="password"
                placeholder="choose a password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: "" })); }}
                disabled={loading}
                className={cn("mt-1", errors.password && "border-destructive ring-1 ring-destructive")}
                data-testid="input-password"
              />
              {errors.password && <p className="text-[10px] text-destructive mt-1">{errors.password}</p>}
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
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Display Name</Label>
                    <span className="text-[10px] text-muted-foreground">min 2 chars</span>
                  </div>
                  <Input
                    type="text"
                    placeholder="how others see you"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: "" })); }}
                    disabled={loading}
                    className={cn("mt-1", errors.name && "border-destructive ring-1 ring-destructive")}
                    data-testid="input-name"
                  />
                  {errors.name && <p className="text-[10px] text-destructive mt-1">{errors.name}</p>}
                </div>

                <div>
                  <Label className="text-xs">Pick Your Avatar</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {AVATARS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAvatar(a)}
                        className={cn(
                          "w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg transition-all",
                          avatar === a
                            ? "bg-primary border-primary text-primary-foreground shadow-lg scale-110"
                            : "bg-muted/50 border-border hover:bg-muted hover:border-primary/50"
                        )}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            <Button type="submit" disabled={loading} className="w-full mt-6" data-testid="button-auth-submit">
              {loading ? "Please wait..." : isSignup ? "Create Account" : needs2FA ? "Verify & Login" : "Login"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setIsSignup(!isSignup);
              setUsername("");
              setPassword("");
              setName("");
              setErrors({});
              setNeeds2FA(false);
            }}
            className="w-full text-sm text-blue-400 hover:text-blue-300 mt-4"
          >
            {isSignup ? "Already have an account? Login" : "Need an account? Sign Up"}
          </button>

          {!isSignup && !needs2FA && (
            <button
              type="button"
              onClick={() => setLocation("/forgot-password")}
              className="w-full text-sm text-muted-foreground hover:text-foreground mt-2"
              data-testid="link-forgot-password"
            >
              Forgot your password?
            </button>
          )}

          <Button variant="outline" onClick={() => setLocation("/")} className="w-full mt-2" size="sm">
            Back to Home
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}

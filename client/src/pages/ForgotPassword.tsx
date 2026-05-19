import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { ArrowLeft, KeyRound, Copy, CheckCircle } from "lucide-react";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.resetToken) {
        setToken(data.resetToken);
        toast({
          title: "Reset link generated",
          description: "In production, this would be emailed to you. For demo, copy the token below.",
        });
      } else {
        toast({ title: "Error", description: data.message || "Request failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyToken = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Token copied!" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-destructive/10 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <Button variant="ghost" size="sm" onClick={() => setLocation("/login")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Login
        </Button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-card border-2 border-border rounded-full mb-6">
            <KeyRound className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-foreground mb-2">Forgot Password?</h1>
          <p className="text-muted-foreground text-sm">Enter your username to generate a reset token.</p>
        </div>

        <Card className="bg-card/80 backdrop-blur-xl ring-1 ring-border p-6">
          {!token ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-xs">Username</Label>
                <Input
                  type="text"
                  placeholder="your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  className="mt-1"
                  data-testid="input-forgot-username"
                />
              </div>
              <Button type="submit" disabled={loading || !username.trim()} className="w-full" data-testid="button-forgot-submit">
                {loading ? "..." : "Generate Reset Token"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-2">
                <CheckCircle className="w-10 h-10 text-green-500" />
                <p className="text-sm font-bold text-foreground">Token Generated!</p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                In a production app, this would be emailed to you. For demo, copy it:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted p-2 rounded text-xs break-all text-foreground">{token}</code>
                <Button size="sm" variant="outline" onClick={copyToken} className="shrink-0">
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <Button className="w-full" onClick={() => setLocation(`/reset-password?token=${token}`)}>
                Go to Reset Page
              </Button>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

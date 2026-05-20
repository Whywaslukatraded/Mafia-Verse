import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Moon, Sun, Volume2, VolumeX, Bell, BellOff, Shield, KeyRound, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return true;
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("mafia_sound_enabled");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [soundVolume, setSoundVolume] = useState(() => {
    const saved = localStorage.getItem("mafia_sound_volume");
    return saved ? parseInt(saved) : 70;
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem("mafia_notifications_enabled");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const userId = localStorage.getItem("mafia_userId");
  const isLoggedIn = !!userId;
  const [has2FA, setHas2FA] = useState(false);
  const [checking2FA, setChecking2FA] = useState(false);
  const [disabling2FA, setDisabling2FA] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);

  // Check if user has 2FA enabled
  useEffect(() => {
    if (!userId) return;
    setChecking2FA(true);
    fetch(`/api/auth/me?userId=${userId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setHas2FA(!!d.is2FAEnabled); })
      .catch(() => {})
      .finally(() => setChecking2FA(false));
  }, [userId]);

  const handleDisable2FA = async () => {
    if (!userId || !disablePassword.trim()) return;
    setDisabling2FA(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(userId), password: disablePassword }),
      });
      const data = await res.json();
      if (res.ok && data.disabled) {
        setHas2FA(false);
        setShowDisableForm(false);
        setDisablePassword("");
        toast({ title: "2FA Disabled", description: "Two-factor authentication has been turned off." });
      } else {
        toast({ title: "Error", description: data.message || "Could not disable 2FA", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setDisabling2FA(false);
    }
  };
  const applyTheme = (enabled: boolean) => {
    document.documentElement.classList.toggle("dark", enabled);
    localStorage.setItem("mafia_theme_dark", JSON.stringify(enabled));
  };
  const applySound = (enabled: boolean, volume: number) => {
    localStorage.setItem("mafia_sound_enabled", JSON.stringify(enabled));
    localStorage.setItem("mafia_sound_volume", volume.toString());
    window.dispatchEvent(new Event("storage"));
  };
  // Theme toggle
  useEffect(() => {
    applyTheme(darkMode);
  }, [darkMode]);

  // Sound settings
  useEffect(() => {
    applySound(soundEnabled, soundVolume);
  }, [soundEnabled, soundVolume]);

  // Notifications
  useEffect(() => {
    localStorage.setItem("mafia_notifications_enabled", JSON.stringify(notificationsEnabled));
    // Request browser notification permission when enabled
    if (notificationsEnabled && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [notificationsEnabled]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 dark:bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/10 dark:bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-black font-serif uppercase tracking-wider text-foreground">Settings</h1>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Theme Toggle */}
          <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Display</h2>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {darkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-yellow-500" />}
                <div>
                  <p className="text-sm font-bold text-foreground">Dark Mode</p>
                  <p className="text-xs text-muted-foreground">{darkMode ? "On" : "Off"}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  const next = !darkMode;
                  setDarkMode(next);
                  applyTheme(next);
                }}
                className={cn(
                  "relative inline-flex h-8 w-14 items-center rounded-full transition-colors",
                  darkMode ? "bg-indigo-600" : "bg-gray-300"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-6 w-6 transform rounded-full bg-white transition-transform",
                    darkMode ? "translate-x-7" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          </div>

          {/* Sound Settings */}
          <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Audio</h2>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {soundEnabled ? <Volume2 className="w-5 h-5 text-green-500" /> : <VolumeX className="w-5 h-5 text-red-500" />}
                <div>
                  <p className="text-sm font-bold text-foreground">Sound Effects</p>
                  <p className="text-xs text-muted-foreground">{soundEnabled ? "Enabled" : "Disabled"}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  applySound(next, soundVolume);
                }}
                className={cn(
                  "relative inline-flex h-8 w-14 items-center rounded-full transition-colors",
                  soundEnabled ? "bg-green-600" : "bg-gray-300"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-6 w-6 transform rounded-full bg-white transition-transform",
                    soundEnabled ? "translate-x-7" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            {soundEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground">Volume</p>
                  <span className="text-xs font-mono text-primary">{soundVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={soundVolume}
                  onChange={(e) => {
                    const next = parseInt(e.target.value);
                    setSoundVolume(next);
                    applySound(soundEnabled, next);
                  }}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Notifications</h2>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {notificationsEnabled ? <Bell className="w-5 h-5 text-blue-500" /> : <BellOff className="w-5 h-5 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-bold text-foreground">Chat Alerts</p>
                  <p className="text-xs text-muted-foreground">{notificationsEnabled ? "Enabled" : "Disabled"}</p>
                </div>
              </div>
              <button
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={cn(
                  "relative inline-flex h-8 w-14 items-center rounded-full transition-colors",
                  notificationsEnabled ? "bg-blue-600" : "bg-gray-300"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-6 w-6 transform rounded-full bg-white transition-transform",
                    notificationsEnabled ? "translate-x-7" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-border">
              Get notified when someone sends a chat message during gameplay
            </p>
          </div>

          {/* Security Section */}
          {isLoggedIn && (
            <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Security</h2>
                {checking2FA && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
              </div>

              {/* 2FA Status Card */}
              <div className={cn(
                "p-4 rounded-xl border transition-all",
                has2FA
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-muted/50 border-border"
              )}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center",
                    has2FA ? "bg-green-500/20" : "bg-muted"
                  )}>
                    {has2FA ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Shield className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground">
                      Two-Factor Auth {has2FA ? "Enabled" : "Not Set Up"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {has2FA ? "Your account is protected with TOTP." : "Add an extra layer to your account."}
                    </p>
                  </div>
                </div>

                {showDisableForm ? (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Enter your password to confirm disabling 2FA.
                    </p>
                    <input
                      type="password"
                      placeholder="Your password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={handleDisable2FA} disabled={disabling2FA} className="flex-1">
                        {disabling2FA ? "Disabling..." : "Confirm Disable"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowDisableForm(false); setDisablePassword(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : has2FA ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                    onClick={() => setShowDisableForm(true)}
                  >
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    Disable 2FA
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setLocation("/2fa-setup")}
                    className="w-full"
                  >
                    <Shield className="w-4 h-4 mr-1" />
                    Set Up Two-Factor Auth
                  </Button>
                )}
              </div>

              {/* Forgot / Reset Password */}
              <button
                onClick={() => setLocation("/forgot-password")}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                data-testid="button-forgot-password"
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="w-5 h-5 text-amber-500" />
                  <div className="text-left">
                    <p className="text-sm font-bold text-foreground">Forgot Password</p>
                    <p className="text-xs text-muted-foreground">Generate a reset token</p>
                  </div>
                </div>
                <span className="text-xs text-primary font-bold">Reset</span>
              </button>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>
            Back to Home
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

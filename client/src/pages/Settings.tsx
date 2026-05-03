import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Moon, Sun, Volume2, VolumeX, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Settings() {
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
  const [syncKey, setSyncKey] = useState(0);

  // Theme toggle
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("mafia_theme_dark", JSON.stringify(darkMode));
    window.dispatchEvent(new Event("storage"));
  }, [darkMode]);

  // Sound settings
  useEffect(() => {
    localStorage.setItem("mafia_sound_enabled", JSON.stringify(soundEnabled));
    window.dispatchEvent(new Event("storage"));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem("mafia_sound_volume", soundVolume.toString());
    window.dispatchEvent(new Event("storage"));
  }, [soundVolume]);

  // Notifications
  useEffect(() => {
    localStorage.setItem("mafia_notifications_enabled", JSON.stringify(notificationsEnabled));
    window.dispatchEvent(new Event("storage"));
  }, [notificationsEnabled]);

  useEffect(() => {
    const onStorage = () => setSyncKey((v) => v + 1);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-black font-serif uppercase tracking-wider text-white">Settings</h1>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Theme Toggle */}
          <div className="bg-black/40 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-6 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Display</h2>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {darkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-yellow-400" />}
                <div>
                  <p className="text-sm font-bold text-white">Dark Mode</p>
                  <p className="text-xs text-muted-foreground">{darkMode ? "On" : "Off"}</p>
                </div>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
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
          <div className="bg-black/40 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-6 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Audio</h2>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {soundEnabled ? <Volume2 className="w-5 h-5 text-green-400" /> : <VolumeX className="w-5 h-5 text-red-400" />}
                <div>
                  <p className="text-sm font-bold text-white">Sound Effects</p>
                  <p className="text-xs text-muted-foreground">{soundEnabled ? "Enabled" : "Disabled"}</p>
                </div>
              </div>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
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
                  <p className="text-sm font-bold text-white">Volume</p>
                  <span className="text-xs font-mono text-primary">{soundVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="bg-black/40 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-6 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Notifications</h2>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {notificationsEnabled ? <Bell className="w-5 h-5 text-blue-400" /> : <BellOff className="w-5 h-5 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-bold text-white">Chat Alerts</p>
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

            <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-white/5">
              Get notified when someone sends a chat message during gameplay
            </p>
          </div>

          <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>
            Back to Home
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

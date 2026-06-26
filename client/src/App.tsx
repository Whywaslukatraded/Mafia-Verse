import { useEffect, useState, useCallback } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { engine } from "@/components/GameAudio";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import TwoFactorSetup from "@/pages/TwoFactorSetup";
import TwoFactorVerify from "@/pages/TwoFactorVerify";
import ResetPassword from "@/pages/ResetPassword";
import AuthCallback from "@/pages/AuthCallback";
import Room from "@/pages/Room";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import Cosmetics from "@/pages/Cosmetics";
import Store from "@/pages/Store";
import Leaderboard from "@/pages/Leaderboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/2fa-setup" component={TwoFactorSetup} />
      <Route path="/2fa-verify" component={TwoFactorVerify} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/room/:code" component={Room} />
      <Route path="/profile" component={Profile} />
      <Route path="/settings" component={Settings} />
      <Route path="/cosmetics" component={Cosmetics} />
      <Route path="/store" component={Store} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    const syncTheme = () => {
      const saved = localStorage.getItem("mafia_theme_dark");
      const darkMode = saved !== null ? JSON.parse(saved) : true;
      document.documentElement.classList.toggle("dark", darkMode);
    };
    syncTheme();
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  // Global audio unlock — works on ALL pages, not just Room
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    engine.init();
    const ok = engine.resume();
    if (ok) {
      setAudioUnlocked(true);
      engine.playTestSound();
    }
    window.removeEventListener("click", unlockAudio, true);
    window.removeEventListener("touchstart", unlockAudio, true);
    window.removeEventListener("keydown", unlockAudio, true);
  }, [audioUnlocked]);

  useEffect(() => {
    window.addEventListener("click", unlockAudio, true);
    window.addEventListener("touchstart", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);
    return () => {
      window.removeEventListener("click", unlockAudio, true);
      window.removeEventListener("touchstart", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
    };
  }, [unlockAudio]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

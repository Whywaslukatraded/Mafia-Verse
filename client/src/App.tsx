import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { engine } from "@/components/GameAudio";
import Home from "@/pages/Home";

// Everything except Home is lazy-loaded — the initial bundle only needs the
// code for the page someone actually lands on. Login/Signup/Settings/Store/
// etc. only download once the user navigates there, which is most of what
// Lighthouse's "unused JavaScript" (189KB) audit was flagging.
const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const TwoFactorSetup = lazy(() => import("@/pages/TwoFactorSetup"));
const TwoFactorVerify = lazy(() => import("@/pages/TwoFactorVerify"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const Room = lazy(() => import("@/pages/Room"));
const Profile = lazy(() => import("@/pages/Profile"));
const Settings = lazy(() => import("@/pages/Settings"));
const Cosmetics = lazy(() => import("@/pages/Cosmetics"));
const Store = lazy(() => import("@/pages/Store"));
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));

function Router404() {
  // Check if we are running inside an itch.io nested preview sandbox or subfolder
  const isItchSandbox = window.location.pathname.includes('/embed') || window.location.hostname.includes('itch.zone');
  
  // If trapped in the sandbox on the root view, bypass Wouter and force-mount the Home page layout directly
  if (isItchSandbox && (window.location.hash === "" || window.location.hash === "#" || window.location.hash === "#/")) {
    return (
      <Suspense fallback={null}>
        <Home />
      </Suspense>
    );
  }

  return (
    <Router hook={useHashLocation}>
      <Suspense fallback={null}>
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
      </Suspense>
    </Router>
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
        <Router404 />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

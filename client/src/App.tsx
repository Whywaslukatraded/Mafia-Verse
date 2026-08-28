import { useEffect, useState, useCallback, lazy, Suspense, Component, type ReactNode } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { engine } from "@/components/GameAudio";
import { getSupabase, isSupabaseReady } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import Home from "@/pages/Home";

// There was previously no error boundary anywhere in this app, so any
// unexpected render-time crash (this hash/Supabase-token bug included)
// unmounted the whole tree with nothing to fall back to — a permanent
// blank white screen instead of a themed message. This is deliberately
// tiny and dependency-free.
class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Unhandled render error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background text-center">
          <div className="max-w-sm space-y-4">
            <p className="text-2xl font-black font-serif uppercase text-foreground">Something Went Wrong</p>
            <p className="text-sm text-muted-foreground">
              An unexpected error stopped the page from loading. Try heading back to the home screen.
            </p>
            <button
              onClick={() => { window.location.hash = "#/"; window.location.reload(); }}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
            >
              Back to Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
const Friends = lazy(() => import("@/pages/Friends"));
const RecapView = lazy(() => import("@/pages/RecapView"));
const Settings = lazy(() => import("@/pages/Settings"));
const Cosmetics = lazy(() => import("@/pages/Cosmetics"));
const Store = lazy(() => import("@/pages/Store"));
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const About = lazy(() => import("@/pages/About"));
const FAQ = lazy(() => import("@/pages/FAQ"));

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
          <Route path="/friends" component={Friends} />
          <Route path="/recap/:shareId" component={RecapView} />
          <Route path="/settings" component={Settings} />
          <Route path="/cosmetics" component={Cosmetics} />
          <Route path="/store" component={Store} />
          <Route path="/leaderboard" component={Leaderboard} />
          <Route path="/about" component={About} />
          <Route path="/faq" component={FAQ} />
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

  // Feature: Friends online status, app-wide. Sends a lightweight "still
  // here" heartbeat every 20s no matter which page is open (Room, Settings,
  // Profile, etc.) — not just the Friends or Home page — so a friend shows
  // as online while someone is actually mid-game, not only while they
  // happen to be looking at the friends list. The server just stamps a
  // timestamp (see POST /api/presence/ping); if these pings ever stop —
  // tab closed, phone died, connection lost — the person simply ages out to
  // "offline" on their own after a bit. Nothing here needs to detect
  // disconnects directly, which is what makes it immune to the "ghost
  // online" bug a WebSocket-close-event approach would have.
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;

    const ping = () => {
      authFetch("/api/presence/ping", { method: "POST" }).catch(() => {
        // Non-critical — a missed ping just delays going offline slightly,
        // not worth surfacing to the user.
      });
    };

    const startHeartbeatIfLoggedIn = (isLoggedIn: boolean) => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (isLoggedIn) {
        ping();
        interval = setInterval(ping, 20_000);
      }
    };

    const attach = () => {
      const supabase = getSupabase();
      supabase.auth.getSession().then(({ data }: any) => {
        if (cancelled) return;
        startHeartbeatIfLoggedIn(!!data.session);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
        if (cancelled) return;
        startHeartbeatIfLoggedIn(!!session);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    };

    if (isSupabaseReady()) {
      attach();
    } else {
      // Supabase client may still be initializing at app mount — poll
      // briefly rather than assuming logged-out (same pattern as
      // Friends.tsx's own login check).
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (isSupabaseReady()) {
          clearInterval(poll);
          attach();
        } else if (attempts > 20) { // ~4s
          clearInterval(poll);
        }
      }, 200);
      return () => clearInterval(poll);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      unsubscribe?.();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppErrorBoundary>
          <Router404 />
        </AppErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

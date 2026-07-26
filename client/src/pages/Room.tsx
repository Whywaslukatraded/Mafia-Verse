import { useEffect, useState, useRef, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { Share2, LogOut, Timer, Volume2, VolumeX, Settings2, Plus, Minus, History, Ghost, Shield, User, Heart, Skull, Eye, CheckCircle2, Flame, Sparkles, Users, RotateCcw, X, Copy, Check, Flag, ShieldCheck, Crosshair, Landmark, Drama, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameSocket } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { PhaseIndicator } from "@/components/PhaseIndicator";
import { PlayerCard } from "@/components/PlayerCard";
import { RoleBadge } from "@/components/RoleBadge";
import { ChatWindow } from "@/components/ChatWindow";
import { MafiaHandbook } from "@/components/MafiaHandbook";
import { GameAudio } from "@/components/GameAudio";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/use-notifications";
import type { GameAction } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// --- Confetti ---
const CONFETTI_COLORS = ["#ffd700", "#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7", "#ff9ff3", "#54a0ff"];
function ConfettiPiece({ x, color, delay, duration, size, isRect }: any) {
  return (
    <motion.div
      style={{ position: "absolute", left: `${x}%`, top: -20, width: size, height: isRect ? size * 0.5 : size, backgroundColor: color, borderRadius: isRect ? 2 : "50%" }}
      initial={{ y: -20, rotate: 0, opacity: 1 }}
      animate={{ y: "110vh", rotate: 720, opacity: [1, 1, 1, 0] }}
      transition={{ duration, delay, ease: "linear" }}
    />
  );
}
function ConfettiEffect() {
  const pieces = useMemo(() => Array.from({ length: 100 }).map((_, i) => ({
    id: i, x: Math.random() * 100,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 2.5, duration: 2.5 + Math.random() * 2,
    size: 6 + Math.random() * 10, isRect: Math.random() > 0.5
  })), []);
  return (
    <div className="fixed inset-0 pointer-events-none z-[300] overflow-hidden">
      {pieces.map(p => <ConfettiPiece key={p.id} {...p} />)}
    </div>
  );
}

// Per-role goal banner styling. Each role gets its own title/body text
// (keys under room.roleGoals.<role>.title / .body) instead of a generic
// "stay vigilant and survive the night" placeholder.
const ROLE_GOAL_STYLE: Record<string, { icon: string; box: string; text: string }> = {
  mafia: { icon: "🔪", box: "bg-red-500/10 border-red-500/30", text: "text-red-400" },
  detective: { icon: "🔍", box: "bg-blue-500/10 border-blue-500/30", text: "text-blue-400" },
  doctor: { icon: "💉", box: "bg-green-500/10 border-green-500/30", text: "text-green-400" },
  civilian: { icon: "🗳️", box: "bg-slate-500/10 border-slate-500/30", text: "text-slate-300" },
  bodyguard: { icon: "🛡️", box: "bg-slate-400/10 border-slate-400/30", text: "text-slate-300" },
  vigilante: { icon: "🎯", box: "bg-orange-500/10 border-orange-500/30", text: "text-orange-400" },
  mayor: { icon: "🏛️", box: "bg-purple-500/10 border-purple-500/30", text: "text-purple-400" },
  jester: { icon: "🎭", box: "bg-pink-500/10 border-pink-500/30", text: "text-pink-400" },
};

export default function Room() {
  const { t } = useTranslation();
  const [, params] = useRoute("/room/:code");
  const [, setLocation] = useLocation();
  const code = params?.code || null;
  const { toast } = useToast();

  // Death stories live in the translation files (room.deathStories, an array of 20
  // templates each) so they read naturally in whichever language is active.
  const DEATH_STORIES = t("room.deathStories", { returnObjects: true }) as string[];

  const sessionId = localStorage.getItem(`mafia_session_${code}`);
  const { gameState, isConnected, sendAction, startGame } = useGameSocket(code, sessionId);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("mafia_sound_enabled");
    return saved !== null ? JSON.parse(saved) : true;
  });
  useEffect(() => {
    const syncSound = () => {
      const saved = localStorage.getItem("mafia_sound_enabled");
      setSoundEnabled(saved !== null ? JSON.parse(saved) : true);
    };
    syncSound();
    window.addEventListener("storage", syncSound);
    return () => window.removeEventListener("storage", syncSound);
  }, []);

  const [showRoleReveal, setShowRoleReveal] = useState(false);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [pendingNightAction, setPendingNightAction] = useState<{ targetId: number; targetName: string; actionType: string } | null>(null);
  const pendingActionRef = useRef(pendingNightAction);
  useEffect(() => { pendingActionRef.current = pendingNightAction; }, [pendingNightAction]);
  const lockInRef = useRef<(() => void) | null>(null);
  const [lockedIn, setLockedIn] = useState(false);
  const [reportedAfk, setReportedAfk] = useState<Set<number>>(new Set());
  const [eliminationOverlay, setEliminationOverlay] = useState<{ name: string; role: string | null; avatar: string; deathStory?: string } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | undefined>(undefined);
  const [showShareModal, setShowShareModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Feature: Edit game settings from the lobby (e.g. after a replay, once more
  // players have joined) instead of being locked to whatever was picked at creation.
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({
    mafiaCount: 1, detectiveCount: 1, doctorCount: 1, civilianCount: 3,
    bodyguardCount: 0, vigilanteCount: 0, mayorCount: 0, jesterCount: 0,
    phaseDuration: 30, mafiaDuration: 15, doctorDuration: 15, detectiveDuration: 15,
    bodyguardDuration: 15, vigilanteDuration: 15,
    showVoteResults: false, showRoleReveal: true,
  });

  const prevPlayersRef = useRef<Record<number, boolean>>({});
  const prevWinsRef = useRef<number | null>(null);
  const shownEliminationsRef = useRef<Set<number>>(new Set());

  const me = gameState?.me;
  const room = gameState?.room;
  const players = gameState?.players || [];
  const { notify } = useNotifications();
  // Stable hash: only changes when alive states actually change (not on every broadcast)
  const aliveHash = players.map(p => `${p.id}:${p.isAlive ? 1 : 0}`).join(',');
  const isHost = me?.isHost;
  const isSpectator = me?.isSpectator;

  // Feature 6: Count watchers (spectators + dead players)
  const watcherCount = players.filter(p => p.isSpectator || !p.isAlive).length;

  // Background style based on phase
  const getBackgroundStyle = () => {
    if (!room) return "";
    if (room.status === "lobby") return "bg-background";
    if (room.status === "ended") return "bg-background";
    if (room.status === "night") {
      if (room.phase === "bodyguard") return "bg-[hsl(var(--bg-bodyguard))] transition-colors duration-1000";
      if (room.phase === "mafia") return "bg-[hsl(var(--bg-mafia))] transition-colors duration-1000";
      if (room.phase === "vigilante") return "bg-[hsl(var(--bg-vigilante))] transition-colors duration-1000";
      if (room.phase === "doctor") return "bg-[hsl(var(--bg-doctor))] transition-colors duration-1000";
      if (room.phase === "detective") return "bg-[hsl(var(--bg-detective))] transition-colors duration-1000";
      return "bg-[hsl(var(--bg-night))] transition-colors duration-1000";
    }
    return "bg-background transition-colors duration-1000";
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    toast({ title: t("room.linkCopied"), description: t("room.sendToFriends") });
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // Feature: Share room — Web Share API on supported devices (covers WhatsApp,
  // Messages, and anything else installed), falls back to a QR code + copy link panel.
  const handleShare = async () => {
    const shareData = {
      title: roomName ? t("room.shareTitleNamed", { roomName }) : t("room.shareTitleDefault"),
      text: t("room.shareText"),
      url: window.location.href,
    };
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share(shareData);
        return;
      } catch (err) {
        // User cancelled the native share sheet, or it failed — fall back to the panel.
        if ((err as any)?.name === "AbortError") return;
      }
    }
    setShowShareModal(true);
  };

  const qrCodeUrl = code
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(window.location.href)}`
    : "";

  // Session check
  useEffect(() => {
    if (gameState && !sessionId && gameState.room.status === "lobby") {
      toast({ title: t("room.joinTheRoom"), description: t("room.enterNameToJoin") });
      setLocation(`/?join=${code}`);
    }
  }, [sessionId, setLocation, toast, gameState, code]);

  // Feature 8: Streak tracking + stats sync on game end
  useEffect(() => {
    if (gameState?.room.status === "ended" && me) {
      const currentWins = me.wins || 0;
      const stats = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
      const prevWins = prevWinsRef.current ?? stats.wins ?? 0;
      const won = currentWins > prevWins;

      const currentStreak = won ? ((stats.currentStreak || 0) + 1) : 0;
      const bestStreak = Math.max(stats.bestStreak || 0, currentStreak);

      const newStats = {
        wins: currentWins,
        gamesPlayed: me.gamesPlayed || 0,
        achievements: (me as any).achievements || [],
        currentStreak,
        bestStreak,
        mafia_wins: (stats.mafia_wins || 0) + (won && me.role === "mafia" ? 1 : 0),
        detective_wins: (stats.detective_wins || 0) + (won && me.role === "detective" ? 1 : 0),
        doctor_wins: (stats.doctor_wins || 0) + (won && me.role === "doctor" ? 1 : 0),
        civilian_wins: (stats.civilian_wins || 0) + (won && me.role === "civilian" ? 1 : 0),
      };
      localStorage.setItem("mafia_stats", JSON.stringify(newStats));
      window.dispatchEvent(new Event("storage"));
      prevWinsRef.current = currentWins;

      // Feature 10: Confetti for winners
      if (won && !showConfetti) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      }
    }
  }, [gameState?.room.status, me]);

  // Clear reactions when returning to lobby (game ended/replayed)
  useEffect(() => {
    if (gameState?.room.status === "lobby") {
      localStorage.removeItem("mafia_reactions");
      shownEliminationsRef.current.clear();
      prevPlayersRef.current = {}; // Reset alive tracking for fresh game
      setPendingNightAction(null);
    }
  }, [gameState?.room.status]);

  // Seed the draft from the server's settings once when the room first loads,
  // so it isn't garbage before the host ever opens the panel.
  const settingsInitializedRef = useRef(false);
  useEffect(() => {
    if (room?.status === "lobby" && room.settings && !settingsInitializedRef.current) {
      const s = room.settings as any;
      settingsInitializedRef.current = true;
      setSettingsDraft({
        mafiaCount: s.mafiaCount ?? 1, detectiveCount: s.detectiveCount ?? 1,
        doctorCount: s.doctorCount ?? 1, civilianCount: s.civilianCount ?? 3,
        bodyguardCount: s.bodyguardCount ?? 0, vigilanteCount: s.vigilanteCount ?? 0,
        mayorCount: s.mayorCount ?? 0, jesterCount: s.jesterCount ?? 0,
        phaseDuration: s.phaseDuration ?? 30, mafiaDuration: s.mafiaDuration ?? 15,
        doctorDuration: s.doctorDuration ?? 15, detectiveDuration: s.detectiveDuration ?? 15,
        bodyguardDuration: s.bodyguardDuration ?? 15, vigilanteDuration: s.vigilanteDuration ?? 15,
        showVoteResults: s.showVoteResults === true, showRoleReveal: s.showRoleReveal !== false,
      });
    }
  }, [room?.status, room?.settings]);

  // Seed the draft from the latest server settings each time the host opens
  // the panel (but never while it's open or from a race with our own save).
  const openSettingsPanel = () => {
    if (room?.settings) {
      const s = room.settings as any;
      setSettingsDraft({
        mafiaCount: s.mafiaCount ?? 1, detectiveCount: s.detectiveCount ?? 1,
        doctorCount: s.doctorCount ?? 1, civilianCount: s.civilianCount ?? 3,
        bodyguardCount: s.bodyguardCount ?? 0, vigilanteCount: s.vigilanteCount ?? 0,
        mayorCount: s.mayorCount ?? 0, jesterCount: s.jesterCount ?? 0,
        phaseDuration: s.phaseDuration ?? 30, mafiaDuration: s.mafiaDuration ?? 15,
        doctorDuration: s.doctorDuration ?? 15, detectiveDuration: s.detectiveDuration ?? 15,
        bodyguardDuration: s.bodyguardDuration ?? 15, vigilanteDuration: s.vigilanteDuration ?? 15,
        showVoteResults: s.showVoteResults === true, showRoleReveal: s.showRoleReveal !== false,
      });
    }
    setShowSettingsPanel(true);
  };

  type NumericSettingKey = "mafiaCount" | "detectiveCount" | "doctorCount" | "civilianCount"
    | "bodyguardCount" | "vigilanteCount" | "mayorCount" | "jesterCount"
    | "phaseDuration" | "mafiaDuration" | "doctorDuration" | "detectiveDuration"
    | "bodyguardDuration" | "vigilanteDuration";
  const adjustSetting = (key: NumericSettingKey, delta: number) => {
    setSettingsDraft(prev => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
  };

  const toggleSetting = (key: "showVoteResults" | "showRoleReveal") => {
    setSettingsDraft(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const specialRoleTotal = settingsDraft.mafiaCount + settingsDraft.detectiveCount + settingsDraft.doctorCount
    + settingsDraft.bodyguardCount + settingsDraft.vigilanteCount + settingsDraft.mayorCount + settingsDraft.jesterCount;

  const handleSaveSettings = () => {
    if (settingsDraft.civilianCount < 1) {
      toast({
        title: t("room.needCivilian"),
        description: t("room.needCivilianDescription"),
        variant: "destructive",
      });
      return;
    }
    if (settingsDraft.mafiaCount < 1) {
      toast({
        title: t("room.needMafia"),
        description: t("room.needMafiaDescription"),
        variant: "destructive",
      });
      return;
    }
    if (specialRoleTotal > 10) {
      toast({
        title: t("room.tooManySpecialRoles"),
        description: t("room.tooManySpecialRolesCapDescription"),
        variant: "destructive",
      });
      return;
    }
    if (specialRoleTotal >= players.length) {
      toast({
        title: t("room.tooManySpecialRoles"),
        description: t("room.tooManySpecialRolesDescription"),
        variant: "destructive",
      });
      return;
    }
    sendAction({ type: "update_settings", settings: settingsDraft } as any);
    // Keep Home.tsx's "last used settings" in sync with whatever was actually
    // saved here — otherwise changing role counts mid-room never carried over
    // to the next room you create, and Home kept showing stale counts.
    try {
      const saved = localStorage.getItem("mafia_last_room_settings");
      const prev = saved ? JSON.parse(saved) : {};
      localStorage.setItem("mafia_last_room_settings", JSON.stringify({
        ...prev,
        mafia: settingsDraft.mafiaCount,
        detective: settingsDraft.detectiveCount,
        doctor: settingsDraft.doctorCount,
        civilian: settingsDraft.civilianCount,
        bodyguard: settingsDraft.bodyguardCount,
        vigilante: settingsDraft.vigilanteCount,
        mayor: settingsDraft.mayorCount,
        jester: settingsDraft.jesterCount,
        phaseDuration: settingsDraft.phaseDuration,
        mafiaDuration: settingsDraft.mafiaDuration,
        doctorDuration: settingsDraft.doctorDuration,
        detectiveDuration: settingsDraft.detectiveDuration,
        bodyguardDuration: settingsDraft.bodyguardDuration,
        vigilanteDuration: settingsDraft.vigilanteDuration,
        showVoteResults: settingsDraft.showVoteResults,
        showRoleReveal: settingsDraft.showRoleReveal,
      }));
    } catch {}
    setShowSettingsPanel(false);
    toast({ title: t("room.settingsUpdated") });
  };

  // Reset role reveal flag whenever the room goes back to lobby (fresh game or replay)
  useEffect(() => {
    if (room?.status === "lobby" && hasRevealed) {
      setHasRevealed(false);
    }
  }, [room?.status, hasRevealed]);

  // Role reveal on first night (always shows the player their OWN role —
  // the showRoleReveal setting only controls whether OTHER players' roles
  // are shown when they're eliminated, not your own reveal)
  useEffect(() => {
    if (room?.status === "night" && room?.turn === 1 && !hasRevealed && me?.role) {
      setShowRoleReveal(true);
      setHasRevealed(true);
      setTimeout(() => setShowRoleReveal(false), 5000);
    }
  }, [room?.status, room?.turn, me?.role, hasRevealed]);

  // Reset night action state when phase changes
  useEffect(() => {
    setLockedIn(false);
    // Only clear pending action when moving away from night phases, not when entering them
    if (room?.status !== "night") {
      setPendingNightAction(null);
    }
    // Dismiss elimination overlay when voting starts so players can vote
    if (room?.phase === "voting") {
      setEliminationOverlay(null);
    }
  }, [room?.phase, room?.status]);

  // Timer countdown - driven by the server's lastUpdated timestamp so it stays
  // accurate across reloads, network lag, and the role-reveal overlay
  useEffect(() => {
    if (!room || room.status === "lobby" || room.status === "ended") return;

    const getDuration = () => {
      const settings = room.settings as any;
      if (room.status === "night") {
        if (room.phase === "bodyguard") return settings.bodyguardDuration || 15;
        if (room.phase === "mafia") return settings.mafiaDuration || 30;
        if (room.phase === "vigilante") return settings.vigilanteDuration || 15;
        if (room.phase === "doctor") return settings.doctorDuration || 15;
        if (room.phase === "detective") return settings.detectiveDuration || 20;
        return settings.phaseDuration || 30;
      }
      return settings.phaseDuration || 30;
    };

    const duration = getDuration();
    const serverPhaseStart = room.lastUpdated ? new Date(room.lastUpdated as any).getTime() : Date.now();
    let autoLockedIn = false;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - serverPhaseStart) / 1000);
      const remaining = Math.min(duration, Math.max(0, duration - elapsed));
      setTimeRemaining(remaining);
      // A player can select a target without pressing "Lock In" — if the
      // timer runs out on them, submit whatever they had selected instead
      // of silently doing nothing (e.g. a Doctor who picked a heal target
      // but never confirmed before time expired).
      if (remaining <= 0 && !autoLockedIn) {
        autoLockedIn = true;
        pendingActionRef.current && lockInRef.current?.();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [room?.status, room?.phase, room?.settings, room?.lastUpdated]);

  // Feature 7: Detect eliminations (only show once per player per game)
  // Uses aliveHash so this only fires when alive states actually change, not on every broadcast
  useEffect(() => {
    if (!room || room.status === "lobby" || room.status === "ended") return;

    for (const p of players) {
      // First time we see this player — initialize without triggering overlay
      if (!(p.id in prevPlayersRef.current)) {
        prevPlayersRef.current[p.id] = p.isAlive ?? true;
        continue;
      }
      const wasAlive = prevPlayersRef.current[p.id];
      if (wasAlive && !p.isAlive && !shownEliminationsRef.current.has(p.id)) {
        shownEliminationsRef.current.add(p.id);
        const story = DEATH_STORIES[Math.floor(Math.random() * DEATH_STORIES.length)];
        const deathStory = story.replace("{name}", p.name);

        toast({
          title: t("room.playerEliminated", { name: p.name }),
          description: deathStory,
          variant: "destructive",
        });

        setEliminationOverlay({
          name: p.name,
          role: p.role,
          avatar: p.avatar || "👤",
          deathStory,
        });
      }
      prevPlayersRef.current[p.id] = p.isAlive ?? true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aliveHash]);

  // Auto-dismiss elimination overlay after 5 seconds or when voting starts
  useEffect(() => {
    if (!eliminationOverlay) return;
    const timeout = setTimeout(() => {
      setEliminationOverlay(null);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [eliminationOverlay]);

  // Dismiss overlay immediately when voting phase starts or game ends
  useEffect(() => {
    if ((room?.status === "day" && room?.phase === "voting") || room?.status === "ended") {
      setEliminationOverlay(null);
    }
  }, [room?.phase, room?.status]);

  if (!gameState || !room || !me) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-foreground">{t("room.connecting")}</div>;
  }

  const getNightActionLabel = () => {
    if (room?.phase === "bodyguard") return { verb: t("room.actions.protect"), action: "protecting" };
    if (room?.phase === "mafia") return { verb: t("room.actions.kill"), action: "killing" };
    if (room?.phase === "vigilante") return { verb: t("room.actions.shoot"), action: "shooting" };
    if (room?.phase === "doctor") return { verb: t("room.actions.protect"), action: "protecting" };
    if (room?.phase === "detective") return { verb: t("room.actions.investigate"), action: "investigating" };
    return { verb: t("room.actions.act"), action: "acting" };
  };

  const myBullets: number | undefined = (gameState as any)?.myBullets;
  const revealedMayorIds: number[] = (gameState as any)?.revealedMayorIds || [];
  const iAmRevealedMayor = !!(me && revealedMayorIds.includes(me.id));

  const isMyNightTurn = (room?.status === "night" && me.isAlive && (
    (room?.phase === "bodyguard" && me.role === "bodyguard") ||
    (room?.phase === "mafia" && me.role === "mafia") ||
    (room?.phase === "vigilante" && me.role === "vigilante" && (myBullets ?? 0) > 0) ||
    (room?.phase === "doctor" && me.role === "doctor") ||
    (room?.phase === "detective" && me.role === "detective")
  )) || false;

  const getPlayerButtonState = (targetId: number): { label: string; variant: any; action: GameAction; isNight: boolean } | null => {
    if (room?.status === "day" && room?.phase === "voting") {
      const isVoted = (gameState as any)?.me?.currentAction?.vote === targetId;
      return {
        label: isVoted ? t("room.voted") : t("room.vote"),
        variant: isVoted ? "secondary" : "default",
        action: { type: "vote", targetId } as GameAction,
        isNight: false,
      };
    }

    if (room?.status === "night") {
      if (room?.phase === "bodyguard" && me?.role === "bodyguard") {
        if (targetId === me.id) return null; // can't protect self
        const isSelected = pendingNightAction?.targetId === targetId;
        return {
          label: isSelected ? t("room.selected") : t("room.select"),
          variant: isSelected ? "secondary" : "default",
          action: { type: "bodyguard_protect", targetId } as GameAction,
          isNight: true,
        };
      }
      if (room?.phase === "mafia" && me?.role === "mafia") {
        // Cannot kill fellow mafia members
        const target = players.find(p => p.id === targetId);
        if (target?.role === "mafia") return null;
        const isTargeted = pendingNightAction?.targetId === targetId;
        return {
          label: isTargeted ? t("room.selected") : t("room.select"),
          variant: isTargeted ? "secondary" : "destructive",
          action: { type: "kill", targetId } as GameAction,
          isNight: true,
        };
      }
      if (room.phase === "doctor" && me.role === "doctor") {
        const isSelected = pendingNightAction?.targetId === targetId;
        return {
          label: isSelected ? t("room.selected") : t("room.select"),
          variant: isSelected ? "secondary" : "default",
          action: { type: "heal", targetId } as GameAction,
          isNight: true,
        };
      }
      if (room.phase === "vigilante" && me.role === "vigilante" && (myBullets ?? 0) > 0) {
        if (targetId === me.id) return null; // can't shoot self
        const isSelected = pendingNightAction?.targetId === targetId;
        return {
          label: isSelected ? t("room.selected") : t("room.actions.shoot"),
          variant: isSelected ? "secondary" : "destructive",
          action: { type: "vigilante_shoot", targetId } as GameAction,
          isNight: true,
        };
      }
      if (room.phase === "detective" && me.role === "detective") {
        const isSelected = pendingNightAction?.targetId === targetId;
        return {
          label: isSelected ? t("room.selected") : t("room.select"),
          variant: isSelected ? "secondary" : "default",
          action: { type: "check", targetId } as GameAction,
          isNight: true,
        };
      }
    }
    return null;
  };

  const handleLockIn = () => {
    if (!pendingNightAction) return;
    const actionTypeMap: Record<string, GameAction["type"]> = { bodyguard: "bodyguard_protect", mafia: "kill", vigilante: "vigilante_shoot", doctor: "heal", detective: "check" };
    const type = actionTypeMap[room.phase || ""] as GameAction["type"];
    if (!type) return;
    sendAction({ type, targetId: pendingNightAction.targetId } as GameAction);
    setLockedIn(true);
    toast({ title: t("room.actionLockedIn"), description: t("room.actionLockedInDescription", { verb: getNightActionLabel().verb, name: pendingNightAction.targetName }) });
  };
  useEffect(() => { lockInRef.current = handleLockIn; });

  const roomName = room.settings?.roomName;

  return (
    <div className={cn("min-h-screen pb-24 relative overflow-hidden transition-colors duration-1000", getBackgroundStyle())}>
      {/* Animated Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ opacity: room?.status === "night" ? 0.3 : 0.1, scale: room?.status === "night" ? 1.2 : 1 }}
          className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{ opacity: room?.status === "night" ? 0.2 : 0.05 }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/20 rounded-full blur-[120px]"
        />
      </div>

      {/* Confetti */}
      {showConfetti && <ConfettiEffect />}

      {/* Elimination Overlay */}
      <AnimatePresence>
        {room?.status === "ended" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-xl pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.8, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center max-w-2xl px-6 py-8"
            >
              {(() => {
                const aliveMafia = players.filter(p => p.isAlive && p.role === "mafia").length;
                const aliveCivilians = players.filter(p => p.isAlive && p.role !== "mafia").length;
                // Alive-mafia-count is a guess and breaks for instant-win cases
                // (e.g. the detective catching a mafia member ends the game
                // immediately, before that mafia player is eliminated — they're
                // still "alive" but civilians actually won). The server already
                // computed the real winner in finalizeGameEnd and stored it on
                // each player's gameHistory — use that when it's there.
                const latestGameEnd = [...(((me as any)?.gameHistory as any[]) || [])].reverse().find((h: any) => h?.type === "game_end");
                const jesterWon = latestGameEnd?.winner === "jester";
                const mafiaWon = jesterWon ? false : (latestGameEnd ? latestGameEnd.winner === "mafia" : aliveMafia > 0);
                const jesterName = jesterWon ? (latestGameEnd.roles?.find((r: any) => r.role === "jester")?.name || players.find(p => p.role === "jester")?.name) : undefined;

                return (
                  <>
                    <div className={`text-8xl font-black mb-2 ${jesterWon ? "text-pink-400" : mafiaWon ? "text-red-500" : "text-green-500"}`}>
                      {jesterWon ? `🃏 ${t("room.jesterLabel")}` : mafiaWon ? `🔴 ${t("room.mafiaLabel")}` : `✨ ${t("room.civiliansLabel")}`}
                    </div>
                    <div className="text-5xl font-black mb-6 text-foreground">{t("room.wins")}</div>
                    <div className="mb-8 text-muted-foreground text-lg font-semibold">
                      {jesterWon
                        ? t("room.jesterWonDescription", { name: jesterName || t("chat.someone") })
                        : mafiaWon
                        ? t("room.mafiaWonDescription", { count: aliveMafia })
                        : t("room.civiliansWonDescription")}
                    </div>

                    <div className="bg-muted/50 border border-border rounded-lg p-6 mb-6">
                      <h3 className="text-foreground font-black mb-4 uppercase tracking-wider text-sm">{t("room.finalRolesRevealed")}</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {players.map((p) => (
                          <div key={p.id} className={`flex items-center gap-2 p-2 rounded-lg ${p.isAlive ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
                            <span className="text-2xl">{p.avatar || "👤"}</span>
                            <div className="text-left flex-1">
                              <div className="text-foreground font-bold text-sm">{p.name}</div>
                              <div className={`text-xs font-bold uppercase tracking-wider ${p.role === "mafia" ? "text-red-400" : p.role === "detective" ? "text-blue-400" : p.role === "doctor" ? "text-yellow-400" : "text-muted-foreground"}`}>
                                {t(`roleBadge.${p.role || "civilian"}`)}
                              </div>
                            </div>
                            {!p.isAlive && <span className="text-red-500 font-black">✕</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    <Button
                      onClick={() => sendAction({ type: "replay" } as any)}
                      className="gap-3 px-10 py-4 text-lg font-black bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 border-2 border-purple-400 shadow-lg shadow-purple-500/50 animate-pulse"
                    >
                      <RotateCcw className="w-6 h-6" />
                      {t("room.playAgain")}
                    </Button>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {eliminationOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 backdrop-blur-xl pointer-events-auto"
            onClick={() => setEliminationOverlay(null)}
          >
            <motion.div
              initial={{ scale: 0.5, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center max-w-xl px-6"
            >
              <div className="text-8xl mb-4">{eliminationOverlay.avatar}</div>
              <div className="text-sm font-black uppercase tracking-[0.4em] text-red-400 mb-2">{t("room.eliminated")}</div>
              <h2 className="text-4xl font-black text-foreground mb-2">{eliminationOverlay.name}</h2>
              {eliminationOverlay.role && (room?.settings as any)?.showRoleReveal !== false && (
                <div className="inline-block bg-muted/50 border border-border px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider text-muted-foreground capitalize mb-4">
                  {t("room.wasRole", { role: t(`roleBadge.${eliminationOverlay.role}`) })}
                </div>
              )}
              {eliminationOverlay.deathStory && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-sm italic text-muted-foreground mt-4 leading-relaxed"
                >
                  {eliminationOverlay.deathStory}
                </motion.p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Role Reveal */}
      <AnimatePresence>
        {showRoleReveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-xl"
          >
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} className="text-center">
              <div className="mb-4 text-sm font-bold uppercase tracking-[0.4em] text-muted-foreground/60">{t("room.yourSecretIdentity")}</div>
              <motion.div
                animate={{ scale: [1, 1.1, 1], rotateY: [0, 360] }}
                transition={{ duration: 1.5 }}
              >
                <RoleBadge role={me?.role} className="text-4xl px-12 py-6 border-2 shadow-[0_0_50px_rgba(var(--primary),0.5)]" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="mt-8 text-xl font-serif text-muted-foreground max-w-xs mx-auto italic"
              >
                {t(`room.roleFlavor.${me?.role || "civilian"}`, t("room.roleFlavor.civilian"))}
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Panel — fallback for devices without the native Web Share API */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-xl px-4"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 text-center relative shadow-2xl"
            >
              <button
                onClick={() => setShowShareModal(false)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("common.close")}
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="font-serif font-bold text-xl text-primary mb-1">{t("room.inviteFriends")}</h3>
              <p className="text-xs text-muted-foreground mb-5">{t("room.scanOrCopy", { code: room.code })}</p>

              {qrCodeUrl && (
                <div className="flex justify-center mb-5">
                  <div className="bg-white p-3 rounded-xl">
                    <img src={qrCodeUrl} alt={t("room.roomQrCode")} width={180} height={180} className="rounded-lg" />
                  </div>
                </div>
              )}

              <Button
                onClick={copyLink}
                variant="outline"
                className="w-full gap-2"
              >
                {linkCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {linkCopied ? t("common.copied") : t("room.copyLink")}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {soundEnabled && <GameAudio phase={room.phase || ""} status={room.status} />}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              {/* Feature 9: Room name */}
              {roomName ? (
                <div>
                  <h1 className="font-serif font-bold text-lg tracking-wider text-primary leading-tight truncate">{roomName}</h1>
                  <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">{t("room.roomLabel")}: {room.code}</p>
                </div>
              ) : (
                <h1 className="font-serif font-bold text-2xl tracking-wider text-primary">{t("room.roomLabel").toUpperCase()}: {room.code}</h1>
              )}
            </div>
            <div className={`w-3 h-3 rounded-full flex-shrink-0 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${isConnected ? "bg-green-500 shadow-green-500/50" : "bg-red-500 shadow-red-500/50"}`} />
            {/* Feature 6: Spectator count */}
            {watcherCount > 0 && (
              <div className="flex items-center gap-1 bg-muted border border-border rounded-full px-2 py-0.5 text-[10px] font-bold text-muted-foreground flex-shrink-0">
                <Eye className="w-3 h-3" />
                <span>{watcherCount}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setSoundEnabled(!soundEnabled)}>
              {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-400" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
            </Button>
            <MafiaHandbook />
            <Button variant="outline" size="sm" onClick={handleShare} className="gap-2">
              <Share2 className="w-3 h-3" />
              {t("room.share")}
            </Button>
            {isHost && room?.status === "lobby" && (
              <Button
                onClick={() => startGame()}
                disabled={players.length < 6}
                className="gap-2"
              >
                <Sparkles className="w-3 h-3" />
                {t("room.startGame")}
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="ml-auto">
              <LogOut className="w-4 h-4 text-red-400" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <PhaseIndicator status={room.status} phase={room.phase || ""} turn={room.turn || 1} timeRemaining={timeRemaining} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          <div className="lg:col-span-2 space-y-8">
            {room.status === "lobby" && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      {t("room.waitingForPlayers")}
                    </CardTitle>
                    {isHost && (
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => showSettingsPanel ? setShowSettingsPanel(false) : openSettingsPanel()}>
                        <Settings2 className="w-3.5 h-3.5" />
                        {showSettingsPanel ? t("room.closeSettings") : t("room.gameSettings")}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">{t("room.playerCount", { count: players.length })}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {players.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 p-2 bg-muted/80 rounded-lg">
                        <span className="text-lg">{p.avatar}</span>
                        <span className="text-xs font-bold truncate">{p.name}</span>
                        {p.isHost && <span className="text-[10px] bg-primary/20 text-primary px-1 rounded">{t("room.host")}</span>}
                      </div>
                    ))}
                  </div>

                  {isHost && showSettingsPanel && (
                    <div className="mt-6 pt-6 border-t border-border space-y-3">
                      {([
                        { key: "mafiaCount", label: t("home.roles.mafias"), icon: Skull, color: "text-red-500" },
                        { key: "detectiveCount", label: t("home.roles.detectives"), icon: Shield, color: "text-blue-500" },
                        { key: "doctorCount", label: t("home.roles.doctors"), icon: Heart, color: "text-emerald-500" },
                        { key: "civilianCount", label: t("home.roles.civilians"), icon: User, color: "text-slate-400" },
                        { key: "bodyguardCount", label: t("roleBadge.bodyguard"), icon: ShieldCheck, color: "text-slate-300" },
                        { key: "vigilanteCount", label: t("roleBadge.vigilante"), icon: Crosshair, color: "text-orange-400" },
                        { key: "mayorCount", label: t("roleBadge.mayor"), icon: Landmark, color: "text-purple-400" },
                        { key: "jesterCount", label: t("roleBadge.jester"), icon: Drama, color: "text-pink-400" },
                        { key: "phaseDuration", label: t("home.roles.votingTime"), icon: Timer, color: "text-amber-500" },
                        { key: "mafiaDuration", label: t("home.roles.mafiaNightTime"), icon: Skull, color: "text-red-400" },
                        { key: "bodyguardDuration", label: t("room.bodyguardNightTime"), icon: ShieldCheck, color: "text-slate-300" },
                        { key: "vigilanteDuration", label: t("room.vigilanteNightTime"), icon: Crosshair, color: "text-orange-400" },
                        { key: "doctorDuration", label: t("home.roles.doctorNightTime"), icon: Heart, color: "text-emerald-400" },
                        { key: "detectiveDuration", label: t("home.roles.detectiveNightTime"), icon: Shield, color: "text-blue-400" },
                      ] as const).map(row => (
                        <div key={row.key} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                          <div className="flex items-center gap-3">
                            <row.icon className={cn("w-4 h-4", row.color)} />
                            <span className="text-sm font-semibold">{row.label}</span>
                          </div>
                          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => adjustSetting(row.key, -1)}>
                              <Minus className="w-3.5 h-3.5" />
                            </Button>
                            <span className="w-8 text-center font-mono font-bold">{settingsDraft[row.key]}</span>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => adjustSetting(row.key, 1)}>
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      <div className="flex items-center justify-between px-1 pt-1 text-xs text-muted-foreground">
                        <span>{t("room.specialRolesCount", { count: specialRoleTotal, total: players.length })}</span>
                        {specialRoleTotal > 10 && (
                          <span className="text-red-400 font-bold">{t("room.specialRolesCapHint")}</span>
                        )}
                        {specialRoleTotal <= 10 && specialRoleTotal >= players.length && (
                          <span className="text-red-400 font-bold">{t("room.leaveRoomForCivilian")}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => toggleSetting("showVoteResults")}
                          className={cn("text-xs px-3 py-2 rounded-lg border font-bold uppercase tracking-wider transition-all",
                            settingsDraft.showVoteResults ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")}
                        >
                          {settingsDraft.showVoteResults ? `✓ ${t("room.voteResultsLabel")}` : t("room.voteResultsLabel")}
                        </button>
                        <button
                          onClick={() => toggleSetting("showRoleReveal")}
                          className={cn("text-xs px-3 py-2 rounded-lg border font-bold uppercase tracking-wider transition-all",
                            settingsDraft.showRoleReveal ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")}
                        >
                          {settingsDraft.showRoleReveal ? `✓ ${t("room.roleRevealLabel")}` : t("room.roleRevealLabel")}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70">
                        {t("room.voteAnonymityExplainer")}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">
                        {t("room.roleRevealExplainer")}
                      </p>

                      <Button onClick={handleSaveSettings} className="w-full gap-2 mt-2">
                        <CheckCircle2 className="w-4 h-4" />
                        {t("room.saveSettings")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {room?.status !== "lobby" && room?.status !== "ended" && (
              <div className="space-y-4">
                {isMyNightTurn && !lockedIn && pendingNightAction && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, y: [0, 4, 0] }}
                    transition={{ y: { repeat: Infinity, duration: 1.2 } }}
                    className="text-center text-xs font-bold text-emerald-400 uppercase tracking-wider"
                  >
                    ↓ {t("room.readyToLockIn")}
                  </motion.p>
                )}

                {me?.role && me?.isAlive && room?.status !== "ended" && ROLE_GOAL_STYLE[me.role] && (
                  <div className={cn("mb-3 p-3 rounded-xl border flex items-center gap-3", ROLE_GOAL_STYLE[me.role].box)}>
                    <span className="text-2xl">{ROLE_GOAL_STYLE[me.role].icon}</span>
                    <div>
                      <p className={cn("text-sm font-black uppercase tracking-wide", ROLE_GOAL_STYLE[me.role].text)}>
                        {t(`room.roleGoals.${me.role}.title`)}
                      </p>
                      <p className="text-xs text-muted-foreground">{t(`room.roleGoals.${me.role}.body`)}</p>
                    </div>
                  </div>
                )}

                {/* Every role except Civilian gets to see who else shares their
                    role — this covers Mafia as an actual team, but also lets
                    multiple Doctors/Bodyguards/Vigilantes/Mayors/Jesters (if a
                    room has more than one) recognize each other. */}
                {me?.role && me.role !== "civilian" && me?.isAlive && room?.status !== "ended" && (() => {
                  const teammates = players.filter((p) => p.role === me.role && p.id !== me.id);
                  return (
                    <div className="mb-3 p-3 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                      <span className="text-2xl">🤝</span>
                      <div>
                        <p className="text-sm font-black uppercase tracking-wide text-foreground">{t("room.teammatesTitle", { role: t(`playerCard.roleLabels.${me.role}`, me.role) })}</p>
                        <p className="text-xs text-muted-foreground">
                          {teammates.length > 0
                            ? teammates.map((p) => p.name).join(", ")
                            : t("room.noTeammates")}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {me?.role === "mayor" && me?.isAlive && room?.status === "day" && !iAmRevealedMayor && (
                  <Button
                    onClick={() => sendAction({ type: "mayor_reveal" } as any)}
                    className="w-full mb-3 gap-2 bg-purple-600 hover:bg-purple-700"
                  >
                    🏛️ {t("room.mayorRevealButton")}
                  </Button>
                )}

                {room?.status === "day" && me?.isAlive && !isSpectator && (
                  <div className="flex items-center gap-1.5 mb-2 px-1 text-[10px] text-muted-foreground">
                    <Flag className="w-3 h-3 text-amber-400" />
                    <span>{t("room.afkFlagExplainer")}</span>
                  </div>
                )}

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
                  {players.map((p) => {
                    const buttonState = getPlayerButtonState(p.id);
                    const canReportAfk = room?.status === "day" && me?.isAlive && p.id !== me?.id && p.isAlive && !isSpectator;
                    return (
                      <div key={p.id} className="relative">
                        <PlayerCard
                          player={p}
                          isMe={p.id === me?.id}
                          canInteract={!!buttonState && (me?.isAlive ?? false) && !isSpectator}
                          interactionLabel={buttonState?.label}
                          interactionVariant={buttonState?.variant}
                          onInteract={() => {
                            if (buttonState?.isNight) {
                              setPendingNightAction({
                                targetId: p.id,
                                targetName: p.name,
                                actionType: room?.phase || "",
                              });
                            } else if (buttonState?.action) {
                              sendAction(buttonState.action);
                            }
                          }}
                          revealedRole={
                            room?.status === "ended"
                              ? p.role
                              : (me?.role && me.role !== "civilian" && p.role === me.role)
                                ? p.role
                                : undefined
                          }
                          myBulletsLeft={p.id === me?.id && me?.role === "vigilante" ? myBullets : undefined}
                          myMayorRevealed={p.id === me?.id && me?.role === "mayor" ? iAmRevealedMayor : undefined}
                        />
                        {canReportAfk && (
                          <button
                            title={reportedAfk.has(p.id) ? t("room.afkReportedTapToUndo") : t("room.reportAfk")}
                            onClick={(e) => {
                              e.stopPropagation();
                              const alreadyReported = reportedAfk.has(p.id);
                              sendAction({ type: alreadyReported ? "unreport_afk" : "report_afk", targetId: p.id } as any);
                              setReportedAfk((prev) => {
                                const next = new Set(prev);
                                if (alreadyReported) next.delete(p.id); else next.add(p.id);
                                return next;
                              });
                            }}
                            className={cn(
                              "absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full border flex items-center justify-center transition-colors z-10",
                              reportedAfk.has(p.id)
                                ? "bg-amber-500/30 border-amber-500/50 text-amber-400"
                                : "bg-muted/80 border-border text-muted-foreground hover:bg-amber-500/20 hover:border-amber-500/40 hover:text-amber-400"
                            )}
                          >
                            <Flag className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Night Action Lock-In Section */}
            {room?.status !== "ended" && room?.status !== "lobby" && (
              <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent pt-6 pb-4">
                <div className="max-w-5xl mx-auto px-4">
                <AnimatePresence mode="wait">
                  {isMyNightTurn && !lockedIn ? (
                    <motion.div
                      key="lock-in-btn"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="flex gap-2"
                    >
                      <Button
                        onClick={() => setPendingNightAction(null)}
                        variant="outline"
                        className="flex-1"
                        disabled={!pendingNightAction}
                      >
                        {t("room.reset")}
                      </Button>
                      <Button
                        onClick={handleLockIn}
                        disabled={!pendingNightAction}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      >
                        {t("room.lockIn")}
                      </Button>
                    </motion.div>
                  ) : isMyNightTurn && lockedIn ? (
                    <motion.div
                      key="locked-in"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-3"
                    >
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="text-emerald-400"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </motion.div>
                      <div>
                        <p className="text-sm font-black text-emerald-400 uppercase tracking-wider">{t("room.actionLockedInShort")}</p>
                        <p className="text-xs text-muted-foreground">{t("room.waitingForOthers")}</p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="default-bar"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-muted-foreground hidden sm:block">{t("room.yourRole")}</div>
                        <RoleBadge role={me.role} className="text-lg px-4 py-1.5" />
                      </div>
                      <div className="text-sm font-medium text-right">
                        {isSpectator && <span className="text-blue-400">{t("room.spectating")}</span>}
                        {!isSpectator && room.status === "day" && room.phase === "voting" && t("room.voteToEliminate")}
                        {!isSpectator && room.status === "night" && me.isAlive && t("room.nightPhaseInProgress")}
                        {!isSpectator && !me.isAlive && <span className="text-red-500">{t("room.youHaveBeenEliminated")}</span>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
              </div>
            )}

            {room.status === "ended" && (
              <>
                {isHost && (
                  <div className="flex gap-3 mb-6 justify-center">
                    <Button
                      onClick={() => sendAction({ type: "replay" } as any)}
                      className="gap-3 px-8 py-6 text-lg font-black bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 border-2 border-purple-400 shadow-lg hover:shadow-purple-500/50 animate-pulse"
                    >
                      <RotateCcw className="w-6 h-6" />
                      {t("room.playAgain")}
                    </Button>
                  </div>
                )}
                <Card className="bg-card border-border mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-xl font-serif">
                        <History className="w-5 h-5 text-primary" />
                        {t("room.gameChronicle")}
                      </CardTitle>
                      {(room.settings as any).showVoteResults === true && (
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("room.voteResultsVisible")}</div>
                      )}
                    </div>
                  </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-6">
                      {(me as any)?.gameHistory?.map((entry: any, i: number) => (
                        <div key={i} className="space-y-3 p-4 bg-card/80 rounded-xl border border-border">
                          {entry.type === "game_end" ? (
                            <>
                              <h4 className="text-sm font-black uppercase tracking-widest text-yellow-400">
                                🎮 {t("room.gameEnded")} - {entry.winner === 'jester' ? `🃏 ${t("room.jesterWinsExclaim")}` : entry.winner === 'mafia' ? `🔴 ${t("room.mafiaWinsExclaim")}` : `✨ ${t("room.civiliansWinExclaim")}`}
                              </h4>
                              <div className="space-y-2 text-sm">
                                <div className="text-muted-foreground italic">{t("room.finalRolesColon")}</div>
                                {entry.roles?.map((role: any, j: number) => (
                                  <div key={j} className="flex items-center gap-2">
                                    <span className="font-bold text-foreground">{role.name}</span>
                                    <span className="text-muted-foreground">{t("room.was")}</span>
                                    <span className={role.role === 'mafia' ? "text-red-400 font-bold" : "text-green-400 font-bold"}>
                                      {t(`roleBadge.${role.role || "civilian"}`)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <>
                              <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                                {entry.type === "night" ? t("room.nightN", { turn: entry.turn }) : t("room.dayN", { turn: entry.turn })}
                              </h4>
                              <div className="space-y-2">
                                {entry.type === "vote" ? (
                                  <>
                                    {(room.settings as any).showVoteResults === true && entry.results?.map((res: any, j: number) => (
                                      <div key={j} className="text-sm flex items-center gap-2">
                                        <User className="w-3 h-3 text-blue-400" />
                                        <span className="font-bold text-foreground">{res.voterName}</span>
                                        <span className="text-muted-foreground italic">{t("room.votedFor")}</span>
                                        <span className="font-bold text-red-400">{res.targetName}</span>
                                      </div>
                                    ))}
                                    {(room.settings as any).showVoteResults !== true && (
                                      <div className="text-sm text-muted-foreground italic">{t("room.voteResultsHidden")}</div>
                                    )}
                                    <div className="text-sm flex items-center gap-2 pt-1">
                                      <Skull className="w-3 h-3 text-red-500" />
                                      <span>
                                        {entry.eliminated
                                          ? t("room.wasVotedOutWithRole", { target: entry.eliminated.name, role: t(`roleBadge.${entry.eliminated.role || "civilian"}`) })
                                          : t("room.noOneVotedOut")}
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  entry.events.map((ev: any, j: number) => (
                                    <div key={j} className="text-sm flex items-center gap-2">
                                      {(ev.type === "kill" || ev.type === "combined_kill") ? <Skull className="w-3 h-3 text-red-500" /> :
                                       ev.type === "attempt" && ev.saved ? <Shield className="w-3 h-3 text-green-500" /> :
                                       ev.type === "bodyguard_death" ? <Shield className="w-3 h-3 text-slate-300" /> :
                                       ev.type === "retaliation_death" ? <Skull className="w-3 h-3 text-orange-400" /> :
                                       ev.type === "guilt_death" ? <Skull className="w-3 h-3 text-orange-400" /> :
                                       ev.type === "detective_check" ? <Search className="w-3 h-3 text-blue-400" /> :
                                       <History className="w-3 h-3 text-blue-400" />}
                                      <span>
                                        {(ev.type === "kill" || ev.type === "combined_kill") ? t("room.wasEliminatedWithRole", { target: ev.target, role: t(`roleBadge.${ev.role || "civilian"}`) }) :
                                         ev.type === "attempt" && ev.saved ? t("room.wasProtected", { target: ev.target }) :
                                         ev.type === "bodyguard_death" ? t("room.bodyguardDiedProtecting", { target: ev.target }) :
                                         ev.type === "retaliation_death" ? t("room.attackerRetaliatedDied", { target: ev.target }) :
                                         ev.type === "guilt_death" ? t("room.vigilanteGuiltDiedHistory", { target: ev.target }) :
                                         ev.type === "detective_check" ? t("room.detectiveFoundResult", { target: ev.target, result: ev.isMafia ? t("room.mafiaLabel") : t("roleBadge.civilian") }) : ""}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
                </Card>
              </>
            )}
          </div>

          <div className="space-y-6">
            <ChatWindow
              messages={gameState?.messages || []}
              onSendMessage={(content) => sendAction({ type: "chat", content } as any)}
              notify={notify}
              currentPlayerId={me?.id || 0}
              isSpectator={(isSpectator ?? false) || !(me?.isAlive ?? true)}
              players={players}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

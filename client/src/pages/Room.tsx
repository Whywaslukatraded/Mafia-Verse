import { useEffect, useState, useRef, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { Share2, LogOut, Timer, Volume2, VolumeX, Settings2, Plus, Minus, History, Ghost, Shield, User, Heart, Skull, Eye, CheckCircle2, Flame, Sparkles, Users, RotateCcw, X, Copy, Check, Flag, ShieldCheck, Crosshair, Landmark, Drama, Search, Download, Smile, UserPlus } from "lucide-react";
import { ROLE_PRESETS, type RolePreset } from "@/lib/rolePresets";
import { useTranslation } from "react-i18next";
import { useGameSocket } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { PhaseIndicator } from "@/components/PhaseIndicator";
import { PlayerCard } from "@/components/PlayerCard";
import { RoleBadge } from "@/components/RoleBadge";
import { ChatWindow } from "@/components/ChatWindow";
import { MafiaHandbook } from "@/components/MafiaHandbook";
import { authFetch, authFetchJson } from "@/lib/authFetch";
import { GameAudio } from "@/components/GameAudio";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/use-notifications";
import type { GameAction } from "@shared/schema";
import { END_SCREEN_REACTIONS } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { generateShareCard, type ShareCardHighlight } from "@/lib/shareCard";
import { TutorialOverlay } from "@/components/TutorialOverlay";

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
  const DEATH_STORIES = (t("room.deathStories", { returnObjects: true }) as string[]) || [];

  const sessionId = localStorage.getItem(`mafia_session_${code}`);
  const { gameState, isConnected, sendAction, startGame, toggleReady, startNow, reactions } = useGameSocket(code, sessionId);

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


  const [hasRevealed, setHasRevealed] = useState(false);
  // Feature: role-reveal modal, shown briefly on night 1 (see the effect
  // below that flips this true then auto-hides it after 5s).
  const [showRoleReveal, setShowRoleReveal] = useState(false);
  const [pendingNightAction, setPendingNightAction] = useState<{ targetId: number; targetName: string; actionType: string } | null>(null);
  const pendingActionRef = useRef(pendingNightAction);
  useEffect(() => { pendingActionRef.current = pendingNightAction; }, [pendingNightAction]);
  const lockInRef = useRef<(() => void) | null>(null);
  const [lockedIn, setLockedIn] = useState(false);
  const [reportedAfk, setReportedAfk] = useState<Set<number>>(new Set());
  const [eliminationOverlay, setEliminationOverlay] = useState<{ name: string; role: string | null; avatar: string; deathStory?: string } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | undefined>(undefined);
  const [lobbyCountdown, setLobbyCountdown] = useState<number | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showShareCardModal, setShowShareCardModal] = useState(false);
  const [shareCardDataUrl, setShareCardDataUrl] = useState<string | null>(null);
  const [shareCardBlob, setShareCardBlob] = useState<Blob | null>(null);
  const [generatingShareCard, setGeneratingShareCard] = useState(false);
  const [resultTextCopied, setResultTextCopied] = useState(false);

  // Feature: Edit game settings from the lobby (e.g. after a replay, once more
  // players have joined) instead of being locked to whatever was picked at creation.
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  // Feature: Friends list + private lobbies — host's "Invite Friends" panel
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [inviteFriends, setInviteFriends] = useState<{ friendshipId: number; supabaseUserId: string; name: string; avatar: string }[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [loadingInviteFriends, setLoadingInviteFriends] = useState(false);

  const openInvitePanel = async () => {
    setShowInvitePanel(true);
    setLoadingInviteFriends(true);
    try {
      const data = await authFetchJson<{ friends: typeof inviteFriends }>("/api/friends");
      setInviteFriends(data.friends);
    } catch {
      // Not signed in / request failed — panel just shows empty with the
      // sign-in nudge below rather than a toast for what's a soft feature.
    } finally {
      setLoadingInviteFriends(false);
    }
  };

  const inviteFriendToRoom = async (friendSupabaseUserId: string) => {
    if (!code) return;
    try {
      await authFetch(`/api/rooms/${code}/invite`, { method: "POST", body: JSON.stringify({ friendSupabaseUserId }) });
      setInvitedIds(prev => new Set(prev).add(friendSupabaseUserId));
    } catch {
      // Silently ignore — the button just won't show as "invited" and the
      // host can try again.
    }
  };

  const [settingsDraft, setSettingsDraft] = useState({
    mafiaCount: 1, detectiveCount: 1, doctorCount: 1, civilianCount: 3,
    bodyguardCount: 0, vigilanteCount: 0, mayorCount: 0, jesterCount: 0,
    phaseDuration: 30, discussionDuration: 30, mafiaDuration: 15, doctorDuration: 15, detectiveDuration: 15,
    bodyguardDuration: 15, vigilanteDuration: 15,
    showVoteResults: true, showRoleReveal: true,
    botPersonality: undefined as ("chill" | "aggressiveLiar" | "chaotic" | "sharp" | undefined),
    // Feature: Private lobbies
    isPrivate: false,
  });

  const prevPlayersRef = useRef<Record<number, boolean>>({});
  const shownEliminationsRef = useRef<Set<number>>(new Set());

  const me = gameState?.me;
  const room = gameState?.room;
  const players = gameState?.players || [];

  // Feature: win/lose sound cue. Mirrors the exact isWinner logic
  // finalizeGameEnd uses server-side, so the sting always matches what the
  // "Final Roles Revealed" screen shows — null until the match has actually
  // ended and this player's own gameHistory has recorded a result.
  const audioOutcome: 'win' | 'lose' | null = (() => {
    if (room?.status !== 'ended' || !me) return null;
    const latestGameEnd = [...((me as any)?.gameHistory as any[] || [])].reverse().find((h: any) => h?.type === 'game_end');
    if (!latestGameEnd) return null;
    const winner = latestGameEnd.winner;
    const isWinner = winner === 'jester' ? me.role === 'jester' :
      winner === 'civilians' ? me.role !== 'mafia' :
      winner === 'mafia' ? me.role === 'mafia' : false;
    return isWinner ? 'win' : 'lose';
  })();
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

  // Feature: Share Result — picks up to 2 notable moments from this player's
  // own gameHistory (the same canonical, frozen data the Game Chronicle
  // below reads from) to put on the share card.
  const pickHighlights = (history: any[]): ShareCardHighlight[] => {
    const highlights: ShareCardHighlight[] = [];
    for (const entry of history) {
      if (entry.type === "vote" && entry.eliminated) {
        highlights.push({
          text: t("room.wasVotedOutWithRole", { target: entry.eliminated.name, role: t(`roleBadge.${entry.eliminated.role || "civilian"}`) }),
        });
      } else if ((entry.type === "night" || entry.type === "day") && Array.isArray(entry.events)) {
        for (const ev of entry.events) {
          if (ev.type === "kill" || ev.type === "combined_kill") {
            highlights.push({ text: t("room.wasEliminatedWithRole", { target: ev.target, role: t(`roleBadge.${ev.role || "civilian"}`) }) });
          } else if (ev.type === "attempt" && ev.saved) {
            highlights.push({ text: t("room.wasProtected", { target: ev.target }) });
          } else if (ev.type === "detective_check") {
            highlights.push({ text: t("room.detectiveFoundResult", { target: ev.target, result: ev.isMafia ? t("room.mafiaLabel") : t("roleBadge.civilian") }) });
          }
        }
      }
      if (highlights.length >= 2) break;
    }
    return highlights.slice(0, 2);
  };

  const handleGenerateShareCard = async (latestGameEnd: any) => {
    if (!me || !latestGameEnd) return;
    setGeneratingShareCard(true);
    try {
      const myFinalRole = latestGameEnd.roles?.find((r: any) => r.id === me.id)?.role || me.role || "civilian";
      const won = latestGameEnd.winner === "jester"
        ? myFinalRole === "jester"
        : latestGameEnd.winner === "mafia"
        ? myFinalRole === "mafia"
        : myFinalRole !== "mafia" && myFinalRole !== "jester";
      const winnerLabel = latestGameEnd.winner === "jester"
        ? t("room.jesterWinsExclaim")
        : latestGameEnd.winner === "mafia"
        ? t("room.mafiaWinsExclaim")
        : t("room.civiliansWinExclaim");
      const highlights = pickHighlights(((me as any)?.gameHistory as any[]) || []);

      const { toBlob, dataUrl } = await generateShareCard({
        playerName: me.name,
        avatarEmoji: me.avatar || "🎭",
        avatarConfig: (me as any).avatarConfig,
        role: myFinalRole,
        won,
        winnerLabel,
        roleLabel: t(`roleBadge.${myFinalRole}`),
        resultLabel: won ? t("room.youWon") : t("room.youLost"),
        highlights,
        roomLabel: room.code,
      });

      const blob = await toBlob();
      setShareCardDataUrl(dataUrl);
      setShareCardBlob(blob);
      setShowShareCardModal(true);
    } catch (err) {
      console.error("Failed to generate share card", err);
      toast({ title: t("room.shareCardErrorTitle"), description: t("room.shareCardErrorDescription"), variant: "destructive" });
    } finally {
      setGeneratingShareCard(false);
    }
  };

  const handleDownloadShareCard = () => {
    if (!shareCardDataUrl) return;
    const a = document.createElement("a");
    a.href = shareCardDataUrl;
    a.download = `mafia-verse-result-${room.code}.png`;
    a.click();
  };

  // No backend exists to host a public, permanent link to a finished game's
  // results (the room URL only works for the original participant's own
  // browser — see the "match already ended" state above), so instead of a
  // misleading "copy link" that would break for anyone else who opens it,
  // this copies a plain text summary of the result.
  const handleCopyResultText = async (latestGameEnd: any) => {
    if (!me || !latestGameEnd) return;
    const myFinalRole = latestGameEnd.roles?.find((r: any) => r.id === me.id)?.role || me.role || "civilian";
    const won = latestGameEnd.winner === "jester"
      ? myFinalRole === "jester"
      : latestGameEnd.winner === "mafia"
      ? myFinalRole === "mafia"
      : myFinalRole !== "mafia" && myFinalRole !== "jester";
    const summary = t("room.shareResultSummary", {
      role: t(`roleBadge.${myFinalRole}`),
      result: won ? t("room.youWon") : t("room.youLost"),
    });
    try {
      await navigator.clipboard.writeText(summary);
      setResultTextCopied(true);
      toast({ title: t("common.copied"), description: t("room.resultTextCopiedDescription") });
      setTimeout(() => setResultTextCopied(false), 2000);
    } catch {
      toast({ title: t("room.shareCardErrorTitle"), description: t("room.shareCardErrorDescription"), variant: "destructive" });
    }
  };

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
      // players rows (and me.wins/me.gamesPlayed) are scoped to a single
      // room — a new room always starts that row at wins:0, gamesPlayed:0.
      // Comparing against them directly made the profile's totals reset
      // every time you joined a new game instead of accumulating. Use the
      // room's own game-end record instead (reliable regardless of room),
      // and accumulate wins/gamesPlayed locally exactly like the per-role
      // stats already do below.
      const latestGameEnd = [...(((me as any)?.gameHistory as any[]) || [])].reverse().find((h: any) => h?.type === "game_end");
      const stats = JSON.parse(localStorage.getItem("mafia_stats") || "{}");

      // Guard against double-counting the same game's result (e.g. if this
      // effect re-fires from another state update before the room resets).
      if (!latestGameEnd || stats.lastCountedRoomCode === code) {
        return;
      }

      const winner = latestGameEnd.winner;
      const won = winner === "jester" ? me.role === "jester"
        : winner === "mafia" ? me.role === "mafia"
        : me.role !== "mafia" && me.role !== "jester"; // civilians win: every town-aligned role

      const currentStreak = won ? ((stats.currentStreak || 0) + 1) : 0;
      const bestStreak = Math.max(stats.bestStreak || 0, currentStreak);

      const newStats = {
        ...stats,
        wins: (stats.wins || 0) + (won ? 1 : 0),
        gamesPlayed: (stats.gamesPlayed || 0) + 1,
        achievements: (me as any).achievements || [],
        currentStreak,
        bestStreak,
        lastCountedRoomCode: code,
        mafia_wins: (stats.mafia_wins || 0) + (won && me.role === "mafia" ? 1 : 0),
        detective_wins: (stats.detective_wins || 0) + (won && me.role === "detective" ? 1 : 0),
        doctor_wins: (stats.doctor_wins || 0) + (won && me.role === "doctor" ? 1 : 0),
        civilian_wins: (stats.civilian_wins || 0) + (won && me.role === "civilian" ? 1 : 0),
        bodyguard_wins: (stats.bodyguard_wins || 0) + (won && me.role === "bodyguard" ? 1 : 0),
        vigilante_wins: (stats.vigilante_wins || 0) + (won && me.role === "vigilante" ? 1 : 0),
        mayor_wins: (stats.mayor_wins || 0) + (won && me.role === "mayor" ? 1 : 0),
        jester_wins: (stats.jester_wins || 0) + (won && me.role === "jester" ? 1 : 0),
        // Feature 6: per-role games played, alongside the per-role win counts
        // above — needed so the profile page can show a win *rate* per role
        // ("3/5 as Mafia") instead of just a raw win count. Incremented once
        // per finished game for whichever single role `me` held that game.
        mafia_games: (stats.mafia_games || 0) + (me.role === "mafia" ? 1 : 0),
        detective_games: (stats.detective_games || 0) + (me.role === "detective" ? 1 : 0),
        doctor_games: (stats.doctor_games || 0) + (me.role === "doctor" ? 1 : 0),
        civilian_games: (stats.civilian_games || 0) + (me.role === "civilian" ? 1 : 0),
        bodyguard_games: (stats.bodyguard_games || 0) + (me.role === "bodyguard" ? 1 : 0),
        vigilante_games: (stats.vigilante_games || 0) + (me.role === "vigilante" ? 1 : 0),
        mayor_games: (stats.mayor_games || 0) + (me.role === "mayor" ? 1 : 0),
        jester_games: (stats.jester_games || 0) + (me.role === "jester" ? 1 : 0),
      };
      localStorage.setItem("mafia_stats", JSON.stringify(newStats));
      window.dispatchEvent(new Event("storage"));

      // Feature 10: Confetti for winners
      if (won && !showConfetti) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      }
    }
  }, [gameState?.room.status, me, code]);

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
        phaseDuration: Math.max(5, s.phaseDuration ?? 30), discussionDuration: Math.max(10, s.discussionDuration ?? s.phaseDuration ?? 30),
        mafiaDuration: Math.max(5, s.mafiaDuration ?? 15),
        doctorDuration: Math.max(5, s.doctorDuration ?? 15), detectiveDuration: Math.max(5, s.detectiveDuration ?? 15),
        bodyguardDuration: Math.max(5, s.bodyguardDuration ?? 15), vigilanteDuration: Math.max(5, s.vigilanteDuration ?? 15),
        showVoteResults: s.showVoteResults === true, showRoleReveal: s.showRoleReveal !== false,
        isPrivate: s.isPrivate === true,
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
        phaseDuration: Math.max(5, s.phaseDuration ?? 30), discussionDuration: Math.max(10, s.discussionDuration ?? s.phaseDuration ?? 30),
        mafiaDuration: Math.max(5, s.mafiaDuration ?? 15),
        doctorDuration: Math.max(5, s.doctorDuration ?? 15), detectiveDuration: Math.max(5, s.detectiveDuration ?? 15),
        bodyguardDuration: Math.max(5, s.bodyguardDuration ?? 15), vigilanteDuration: Math.max(5, s.vigilanteDuration ?? 15),
        showVoteResults: s.showVoteResults === true, showRoleReveal: s.showRoleReveal !== false,
        botPersonality: s.botPersonality as ("chill" | "aggressiveLiar" | "chaotic" | "sharp" | undefined),
        isPrivate: s.isPrivate === true,
      });
    }
    setShowSettingsPanel(true);
  };

  type NumericSettingKey = "mafiaCount" | "detectiveCount" | "doctorCount" | "civilianCount"
    | "bodyguardCount" | "vigilanteCount" | "mayorCount" | "jesterCount"
    | "phaseDuration" | "discussionDuration" | "mafiaDuration" | "doctorDuration" | "detectiveDuration"
    | "bodyguardDuration" | "vigilanteDuration";
  // Hard floors — mirrors the server-side clampInt minimums, so the host
  // can't even drag a phase down to 0s in the UI before it's sent.
  const DURATION_MIN: Partial<Record<NumericSettingKey, number>> = {
    phaseDuration: 5, discussionDuration: 10, mafiaDuration: 5, doctorDuration: 5,
    detectiveDuration: 5, bodyguardDuration: 5, vigilanteDuration: 5,
  };
  const adjustSetting = (key: NumericSettingKey, delta: number) => {
    setSettingsDraft(prev => ({ ...prev, [key]: Math.max(DURATION_MIN[key] ?? 0, prev[key] + delta) }));
  };

  const toggleSetting = (key: "showVoteResults" | "showRoleReveal" | "isPrivate") => {
    setSettingsDraft(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Feature: Role presets — same shared presets as room creation. Only
  // overwrites the role/timer fields; showVoteResults/showRoleReveal stay
  // whatever the host already had them set to.
  const applyPresetToDraft = (preset: RolePreset) => {
    const { id, ...presetFields } = preset;
    setSettingsDraft(prev => ({ ...prev, ...presetFields }));
  };

  const PRESET_META: Record<string, { icon: any; color: string }> = {
    classic: { icon: Sparkles, color: "text-blue-400" },
    chaos: { icon: Flame, color: "text-orange-400" },
    beginner: { icon: Smile, color: "text-emerald-400" },
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
    sendAction({ type: "update_settings", settings: settingsDraft });
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
        discussionDuration: settingsDraft.discussionDuration,
        mafiaDuration: settingsDraft.mafiaDuration,
        doctorDuration: settingsDraft.doctorDuration,
        detectiveDuration: settingsDraft.detectiveDuration,
        bodyguardDuration: settingsDraft.bodyguardDuration,
        vigilanteDuration: settingsDraft.vigilanteDuration,
        showVoteResults: settingsDraft.showVoteResults,
        showRoleReveal: settingsDraft.showRoleReveal,
        botPersonality: settingsDraft.botPersonality,
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
      // Feature: Discussion timer — discussion and voting used to always
      // share phaseDuration; discussion now has its own setting (falling
      // back to phaseDuration for older rooms/settings payloads).
      if (room.status === "day" && room.phase === "discussion") {
        return settings.discussionDuration ?? settings.phaseDuration ?? 30;
      }
      return settings.phaseDuration || 30;
    };

    const duration = getDuration();
    const serverPhaseStart = room.lastUpdated ? new Date(room.lastUpdated as any).getTime() : Date.now();
    // The very first tick of a fresh phase was reliably showing one second
    // short (e.g. 14 instead of a selected 15): by the time this effect
    // actually runs, some amount of latency has already passed between the
    // server stamping `lastUpdated` and this client receiving/processing
    // that state_update (DB write time, WS transit, effect scheduling) —
    // easily enough to cross the 1-second boundary and make it look like a
    // whole second was already spent before the player ever saw the timer.
    // Treat a small amount of that drift (<1.2s) as pipeline latency, not
    // real elapsed time, so a freshly-started phase always starts at its
    // full duration. Reloading mid-phase still shows the correct remaining
    // time, since real elapsed time (someone reconnecting well into a
    // phase) is far larger than this window.
    //
    // Bug fix: this used to be `impliedElapsedMs < 1200` with no lower
    // bound, which also caught the (large, negative) drift produced when
    // the server deliberately schedules lastUpdated into the future — done
    // on purpose after a role-reveal or elimination overlay (see
    // ROLE_REVEAL_MS/revealDelayMs in routes.ts) specifically so the
    // countdown doesn't start until that overlay clears. Treating that
    // negative drift as "just latency" reset it to right now instead,
    // silently discarding the server's buffer: the visible timer started
    // ticking immediately behind the overlay, showing ~5s less than the
    // selected duration, and then sitting at 0 for several seconds waiting
    // for the real (unmoved) server deadline to actually arrive. Only
    // small, non-negative drift is pipeline latency — a negative value
    // means the server start time is still ahead of us on purpose, so it
    // should be honored, not discarded.
    const impliedElapsedMs = Date.now() - serverPhaseStart;
    const effectivePhaseStart = (impliedElapsedMs >= 0 && impliedElapsedMs < 1200) ? Date.now() : serverPhaseStart;
    let autoLockedIn = false;
    let lastDisplayed = -1;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - effectivePhaseStart) / 1000);
      const remaining = Math.min(duration, Math.max(0, duration - elapsed));
      // Checking every 100ms keeps the auto-lock-in timing tight, but the
      // displayed number only actually changes once a second — updating
      // React state on every 100ms tick was forcing 10x more re-renders of
      // the whole Room page than the UI needed, which was starving mobile
      // keyboards mid-keystroke (typed characters would silently drop,
      // including in chat inputs unrelated to the timer itself).
      if (remaining !== lastDisplayed) {
        lastDisplayed = remaining;
        setTimeRemaining(remaining);
      }
      if (remaining <= 0 && !autoLockedIn) {
        autoLockedIn = true;
        pendingActionRef.current && lockInRef.current?.();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [
    room?.status, room?.phase, room?.lastUpdated,
    room?.settings?.bodyguardDuration, room?.settings?.mafiaDuration,
    room?.settings?.vigilanteDuration, room?.settings?.doctorDuration,
    room?.settings?.detectiveDuration, room?.settings?.phaseDuration,
    room?.settings?.discussionDuration,
  ]);

  // Feature: Pre-game ready-up lobby — countdown to bots-fill-and-start,
  // driven by the server's lobbyCountdownEndsAt timestamp (set once every
  // connected human is ready) so it stays accurate across reloads/lag, same
  // approach as the in-game phase timer above.
  useEffect(() => {
    const endsAt = gameState?.lobbyCountdownEndsAt;
    if (!endsAt || room?.status !== "lobby") {
      setLobbyCountdown(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setLobbyCountdown(remaining);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [gameState?.lobbyCountdownEndsAt, room?.status]);

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

  const getNightActionLabel = () => {
    if (room?.phase === "bodyguard") return { verb: t("room.actions.protect"), action: "protecting" };
    if (room?.phase === "mafia") return { verb: t("room.actions.kill"), action: "killing" };
    if (room?.phase === "vigilante") return { verb: t("room.actions.shoot"), action: "shooting" };
    if (room?.phase === "doctor") return { verb: t("room.actions.protect"), action: "protecting" };
    if (room?.phase === "detective") return { verb: t("room.actions.investigate"), action: "investigating" };
    return { verb: t("room.actions.act"), action: "acting" };
  };

  const myBullets: number | undefined = (gameState as any)?.myBullets;

  // Feature: Turn notifications. Deliberately does NOT keep its own
  // enabled/disabled state or button — Settings.tsx already owns
  // mafia_notifications_enabled (a general app-wide notifications toggle,
  // defaults on, already requests permission on enable) and useNotifications()
  // itself already checks that same flag plus permission plus tab-visibility
  // before ever actually showing anything. Duplicating that here as a second
  // toggle would just be two controls fighting over one flag with different
  // defaults — this only needs to decide *when* to call notify(), not
  // whether notifications are allowed at all.

  // Fires once per phase — not once per render — by remembering the last
  // phase this already notified for. A raw [room.phase] dependency without
  // this guard would refire on every unrelated state update that happens
  // to land while still in the same phase (a chat message, a vote count
  // ticking up, a reconnect), which would spam the OS notification tray
  // instead of announcing the phase change exactly once.
  const lastNotifiedPhaseKey = useRef<string | null>(null);
  useEffect(() => {
    if (!room || !me?.isAlive || isSpectator) return;
    const phaseKey = `${room.turn}-${room.status}-${room.phase}`;
    if (lastNotifiedPhaseKey.current === phaseKey) return;

    const myTurn =
      (room.status === "day" && room.phase === "voting") ||
      (room.status === "night" && room.phase === "bodyguard" && me.role === "bodyguard") ||
      (room.status === "night" && room.phase === "mafia" && me.role === "mafia") ||
      (room.status === "night" && room.phase === "doctor" && me.role === "doctor") ||
      (room.status === "night" && room.phase === "vigilante" && me.role === "vigilante" && (myBullets ?? 0) > 0) ||
      (room.status === "night" && room.phase === "detective" && me.role === "detective");

    if (myTurn) {
      lastNotifiedPhaseKey.current = phaseKey;
      notify(t("room.yourTurnNotifTitle", "It's your turn"), {
        body: room.status === "day" && room.phase === "voting"
          ? t("room.yourTurnNotifVote", "Time to vote.")
          : t("room.yourTurnNotifAction", "Time to use your night action."),
        tag: "mafia-turn",
      });
    }
  }, [room?.turn, room?.status, room?.phase, me?.isAlive, me?.role, isSpectator, myBullets, notify, t]);

  // Feature: Tutorial overlay. A live walkthrough over the real Room UI —
  // separate from the static HowToPlay rules modal on Home. Fires once per
  // browser, the first time someone reaches an actual playing phase (not
  // the lobby, and not as a spectator, who don't get vote/action cards).
  // Waits for hasRevealed so it never competes with the role-reveal modal
  // for attention on turn 1.
  const [showTutorial, setShowTutorial] = useState(false);
  useEffect(() => {
    if (!room || isSpectator) return;
    if (room.status === "lobby" || room.status === "ended") return;
    if (!hasRevealed) return;
    const seen = localStorage.getItem("mafia_seen_room_tutorial");
    if (!seen) setShowTutorial(true);
  }, [room?.status, isSpectator, hasRevealed]);
  const closeTutorial = () => {
    setShowTutorial(false);
    try { localStorage.setItem("mafia_seen_room_tutorial", "1"); } catch {}
  };


  const revealedMayorIds: number[] = (gameState as any)?.revealedMayorIds || [];
  const iAmRevealedMayor = !!(me && revealedMayorIds.includes(me.id));

  const isMyNightTurn = (room?.status === "night" && me?.isAlive && (
    (room?.phase === "bodyguard" && me.role === "bodyguard") ||
    (room?.phase === "mafia" && me.role === "mafia") ||
    (room?.phase === "vigilante" && me.role === "vigilante" && (myBullets ?? 0) > 0) ||
    (room?.phase === "doctor" && me.role === "doctor") ||
    (room?.phase === "detective" && me.role === "detective")
  )) || false;

  const getPlayerButtonState = (targetId: number): { label: string; variant: any; action: GameAction; isNight: boolean } | null => {
    // Feature: Spectator "Crowd Favorite" vote. Takes priority over the
    // normal alive-player action states below since a ghost (dead or a
    // late-joining spectator) never has a real vote/kill/heal/etc. to cast
    // anyway — `!me.isAlive` already covers both cases (late joiners are
    // created with isAlive: false server-side).
    if (me && !me.isAlive && room?.status !== "lobby" && room?.status !== "ended") {
      if (targetId === me.id) return null; // can't vote for yourself
      const target = players.find(p => p.id === targetId);
      if (!target?.isAlive) return null; // only living players are worth rooting for
      const isPicked = (gameState as any)?.me?.crowdFavoritePick === targetId;
      return {
        label: isPicked ? t("room.crowdFavoritePicked", "Your Pick") : t("room.crowdFavoriteVote", "Crowd Favorite"),
        variant: isPicked ? "secondary" : "outline",
        action: { type: "crowd_favorite_vote", targetId } as GameAction,
        isNight: false,
      };
    }

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

  // Feature: keyboard shortcuts for voting. Number keys 1-9 target the
  // player in that grid position (same grid order players.map renders,
  // matching what's actually on screen), Enter locks in whatever's
  // currently pending — via lockInRef rather than calling handleLockIn
  // directly, since that's declared further down and referencing it here
  // would hit the same "used before declaration" problem the turn-
  // notifications effect above already had to work around. Ignored
  // whenever focus is in a text input (chat) so typing "1" there doesn't
  // accidentally cast a vote.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (e.key === "Enter") {
        if (pendingActionRef.current) lockInRef.current?.();
        return;
      }

      const digit = parseInt(e.key, 10);
      if (!Number.isInteger(digit) || digit < 1 || digit > 9) return;
      const targetPlayer = players[digit - 1];
      if (!targetPlayer) return;
      const buttonState = getPlayerButtonState(targetPlayer.id);
      if (!buttonState) return;
      const canInteract = (me?.isAlive ?? false) && !isSpectator || (!!me && !me.isAlive);
      if (!canInteract) return;

      if (buttonState.isNight) {
        setPendingNightAction({ targetId: targetPlayer.id, targetName: targetPlayer.name, actionType: room?.phase || "" });
      } else {
        sendAction(buttonState.action);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, me?.isAlive, me?.id, isSpectator, room?.phase]);

  const handleLockIn = () => {
    if (!pendingNightAction) return;
    const actionTypeMap: Record<string, GameAction["type"]> = { bodyguard: "bodyguard_protect", mafia: "kill", vigilante: "vigilante_shoot", doctor: "heal", detective: "check" };
    const type = actionTypeMap[room.phase || ""] as GameAction["type"];
    if (!type) return;
    sendAction({ type, targetId: pendingNightAction.targetId } as GameAction);
    setLockedIn(true);
    toast({ title: t("room.actionLockedIn"), description: t("room.actionLockedInDescription", { verb: getNightActionLabel().verb, name: pendingNightAction.targetName }) });
  };
  // Plain assignment, not a hook — safe to run after the early return above
  // without upsetting React's hooks-order requirement.
  lockInRef.current = handleLockIn;

  const roomName = room?.settings?.roomName;

  if (!gameState || !room || !me) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-foreground">{t("room.connecting")}</div>;
  }


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
            // Bug fix: this had no overflow/scroll at all, so on any screen
            // where the content (win graphic, share button, final-roles
            // grid, Play Again, and the helper text below it) was taller
            // than the viewport — very common at 100% zoom on a laptop —
            // flex-centering clipped it evenly top AND bottom with no way
            // to scroll to the rest. overflow-y-auto plus vertical padding
            // on the inner wrapper lets it scroll instead of clip.
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-xl pointer-events-auto overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.8, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center max-w-2xl px-6 py-8 my-auto"
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

                // A player whose gameHistory has no game_end entry never
                // participated in this match — most commonly someone who
                // joined the room after it already ended. Show them a plain
                // "match is over" state instead of guessing a winner from
                // the live (and for them, irrelevant) player list.
                if (!latestGameEnd) {
                  return (
                    <>
                      <div className="text-6xl mb-4">🕯️</div>
                      <div className="text-3xl font-black mb-4 text-foreground">{t("room.matchAlreadyEndedTitle")}</div>
                      <div className="mb-8 text-muted-foreground text-lg font-semibold">
                        {t("room.matchAlreadyEndedDescription")}
                      </div>
                    </>
                  );
                }

                const jesterWon = latestGameEnd?.winner === "jester";
                const mafiaWon = jesterWon ? false : latestGameEnd.winner === "mafia";
                // The roles list below is the frozen snapshot the server saved
                // the moment this match ended — the same data for every player
                // who was actually in it, so every tab shows an identical
                // result and anyone who joins later never gets added to it.
                const finalRoles: any[] = latestGameEnd.roles || [];
                const jesterName = jesterWon ? finalRoles.find((r: any) => r.role === "jester")?.name : undefined;
                const aliveMafiaAtEnd = finalRoles.filter((r: any) => r.role === "mafia" && r.isAlive).length;

                // Feature: personal vote-history stat. Own votes only —
                // matched by voter name against this chronicle's own vote
                // entries, "correct" meaning the target turned out to be
                // mafia per the frozen final-roles snapshot above. null
                // (not 0/0) when this player never actually cast a vote
                // (spectator, or eliminated turn 1), so the stat can be
                // hidden entirely instead of showing a misleading "0/0".
                const myVoteStats = (() => {
                  const chronicle = ((me as any)?.gameHistory as any[]) || [];
                  let correct = 0, total = 0;
                  for (const entry of chronicle) {
                    if (entry?.type !== "vote") continue;
                    const myVote = entry.results?.find((r: any) => r.voterName === me?.name);
                    if (!myVote) continue;
                    total++;
                    if (finalRoles.find((r: any) => r.name === myVote.targetName)?.role === "mafia") correct++;
                  }
                  return total > 0 ? { correct, total } : null;
                })();

                // Feature: Detective's Report. Shown to everyone, not just
                // the detective — like Final Roles Revealed, this is
                // historical fact once the game's over, not a private
                // insight. Every player's gameHistory holds the identical
                // shared chronicle (see finalizeGameEnd in routes.ts), so
                // this works the same regardless of who's looking at it.
                const detectivePlayer = finalRoles.find((r: any) => r.role === "detective");
                const detectiveChecks: { turn: number; target: string; isMafia: boolean }[] = detectivePlayer
                  ? (((me as any)?.gameHistory as any[]) || [])
                      .filter((entry: any) => entry?.type === "night" && entry.events)
                      .flatMap((entry: any) => entry.events
                        .filter((ev: any) => ev.type === "detective_check")
                        .map((ev: any) => ({ turn: entry.turn, target: ev.target, isMafia: !!ev.isMafia })))
                  : [];


                return (
                  <>
                    {/* Bug fix: text-8xl/text-5xl were flat sizes with no
                        responsive scaling, so on narrower viewports (most
                        phones, laptops below 100% zoom) the winner banner
                        overflowed the fixed-width container horizontally —
                        this overlay only scrolls vertically, so anything
                        wider than the viewport just got clipped at the
                        edges instead of shrinking to fit. break-words is a
                        second line of defense in case a long translated
                        label still doesn't fit even at the smallest size. */}
                    <div className={`text-5xl sm:text-6xl md:text-8xl font-black mb-2 break-words px-2 ${jesterWon ? "text-pink-400" : mafiaWon ? "text-red-500" : "text-green-500"}`}>
                      {jesterWon ? `🃏 ${t("room.jesterLabel")}` : mafiaWon ? `🔴 ${t("room.mafiaLabel")}` : `✨ ${t("room.civiliansLabel")}`}
                    </div>
                    <div className="text-3xl sm:text-4xl md:text-5xl font-black mb-6 text-foreground">{t("room.wins")}</div>
                    <div className="mb-8 text-muted-foreground text-lg font-semibold">
                      {jesterWon
                        ? t("room.jesterWonDescription", { name: jesterName || t("chat.someone") })
                        : mafiaWon
                        ? t("room.mafiaWonDescription", { count: aliveMafiaAtEnd })
                        : t("room.civiliansWonDescription")}
                    </div>

                    {latestGameEnd.crowdFavorite && (
                      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-pink-500/30 bg-pink-500/10 px-4 py-2 text-sm font-bold text-pink-400">
                        🌟 {t("room.crowdFavoriteResult", "Crowd Favorite: {{name}}", { name: latestGameEnd.crowdFavorite.name })}
                      </div>
                    )}
                    {latestGameEnd.mvp && (
                      <div className="mb-6 ml-2 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm font-bold text-yellow-400">
                        🏆 {t("room.mvpResult", "MVP: {{name}}", { name: latestGameEnd.mvp.name })}
                      </div>
                    )}

                    {/* Feature: End-screen reactions. Ephemeral flair, not
                        saved anywhere — every connected player/spectator
                        sees the same burst live, then it's gone. */}
                    <div className="mb-6 flex items-center justify-center gap-2">
                      {END_SCREEN_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => sendAction({ type: "end_screen_reaction", emoji })}
                          className="text-2xl w-11 h-11 rounded-full bg-muted/50 border border-border hover:bg-muted hover:scale-110 transition-all flex items-center justify-center"
                          data-testid={`button-reaction-${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    {/* Share Result lives here, right under the result — not
                        stacked against Play Again below, so a tap intending
                        one doesn't land on the other. */}
                    <Button
                      onClick={() => handleGenerateShareCard(latestGameEnd)}
                      disabled={generatingShareCard}
                      variant="outline"
                      className="gap-2 mb-8 flex-wrap justify-center"
                      data-testid="button-share-result"
                    >
                      <Share2 className="w-4 h-4 shrink-0" />
                      {generatingShareCard ? t("room.generatingImage") : t("room.shareResult")}
                    </Button>

                    <div className="bg-muted/50 border border-border rounded-lg p-6 mb-6">
                      <h3 className="text-foreground font-black mb-4 uppercase tracking-wider text-sm">{t("room.finalRolesRevealed")}</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {finalRoles.map((p) => (
                          <div key={p.id} className={`relative flex items-center gap-2 p-2 rounded-lg ${p.isAlive ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
                            {latestGameEnd.mvp?.id === p.id && (
                              <span className="absolute -top-2 -left-2 text-base" title={t("room.mvpLabel", "MVP")}>🏆</span>
                            )}
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

                    {isHost ? (
                      <>
                        <Button
                          onClick={() => sendAction({ type: "replay" } as any)}
                          className="gap-3 px-6 sm:px-10 py-4 text-base sm:text-lg font-black bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 border-2 border-purple-400 shadow-lg shadow-purple-500/50 animate-pulse flex-wrap justify-center max-w-full"
                        >
                          <RotateCcw className="w-6 h-6 shrink-0" />
                          {t("room.playAgain")}
                        </Button>
                        <div className="mt-3 text-xs text-muted-foreground">{t("room.playAgainHelper")}</div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">{t("room.waitingForHostRematch")}</div>
                    )}
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

      {/* Share Result Card — Game Over screen "Share Result" feature */}
      <AnimatePresence>
        {showShareCardModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-xl px-4"
            onClick={() => setShowShareCardModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 text-center relative shadow-2xl"
            >
              <button
                onClick={() => setShowShareCardModal(false)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("common.close")}
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="font-serif font-bold text-xl text-primary mb-1">{t("room.shareResultTitle")}</h3>
              <p className="text-xs text-muted-foreground mb-5">{t("room.shareResultSubtitle")}</p>

              {shareCardDataUrl && (
                <div className="flex justify-center mb-5">
                  <img src={shareCardDataUrl} alt={t("room.shareResultTitle")} className="rounded-xl border border-border max-h-[400px]" />
                </div>
              )}

              <div className="space-y-2">
                <Button onClick={handleDownloadShareCard} className="w-full gap-2">
                  <Download className="w-4 h-4" />
                  {t("room.downloadImage")}
                </Button>
                <Button
                  onClick={() => handleCopyResultText([...(((me as any)?.gameHistory as any[]) || [])].reverse().find((h: any) => h?.type === "game_end"))}
                  variant="outline"
                  className="w-full gap-2"
                >
                  {resultTextCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {resultTextCopied ? t("common.copied") : t("room.copyResultText")}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-4">{t("room.shareResultLinkNote")}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {soundEnabled && <GameAudio phase={room.phase || ""} status={room.status} roleRevealing={showRoleReveal} outcome={audioOutcome} timeRemaining={timeRemaining} />}

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
            <Button variant="ghost" size="icon" onClick={() => setSoundEnabled(!soundEnabled)} aria-label={soundEnabled ? t("room.muteSound") : t("room.unmuteSound")}>
              {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-400" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
            </Button>
            <div data-tutorial="handbook">
              <MafiaHandbook />
            </div>
            <Button variant="outline" size="sm" onClick={handleShare} className="gap-2">
              <Share2 className="w-3 h-3" />
              {t("room.share")}
            </Button>
            {isHost && room?.status === "lobby" && (
              <Button variant="outline" size="sm" onClick={openInvitePanel} className="gap-2" data-testid="button-invite-friends">
                <UserPlus className="w-3.5 h-3.5" />
                {t("room.inviteFriends", "Invite Friends")}
              </Button>
            )}
            {isHost && room?.status === "lobby" && (
              <Button
                onClick={() => startNow()}
                disabled={players.filter(p => !p.isBot).length < 1}
                className="gap-2"
              >
                <Sparkles className="w-3 h-3" />
                {t("room.startNow", "Start Now")}
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="ml-auto" aria-label={t("room.leaveRoom")}>
              <LogOut className="w-4 h-4 text-red-400" />
            </Button>
          </div>
        </div>
      </header>

      {/* Feature: Friends list + private lobbies — host's invite panel */}
      {showInvitePanel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInvitePanel(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black uppercase tracking-wider text-sm text-foreground">{t("room.inviteFriends", "Invite Friends")}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowInvitePanel(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            {loadingInviteFriends ? (
              <p className="text-sm text-muted-foreground">{t("common.loading", "Loading...")}</p>
            ) : inviteFriends.length === 0 ? (
              <div className="text-sm text-muted-foreground space-y-3">
                <p>{t("room.noFriendsToInvite", "No friends yet, or you're not signed in.")}</p>
                <Button variant="outline" size="sm" onClick={() => setLocation("/friends")}>{t("friends.title", "Friends")}</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {inviteFriends.map((f) => (
                  <div key={f.friendshipId} className="flex items-center justify-between bg-muted/50 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{f.avatar}</span>
                      <span className="text-sm font-bold text-foreground">{f.name}</span>
                    </div>
                    <Button
                      size="sm"
                      variant={invitedIds.has(f.supabaseUserId) ? "secondary" : "default"}
                      disabled={invitedIds.has(f.supabaseUserId)}
                      onClick={() => inviteFriendToRoom(f.supabaseUserId)}
                      data-testid={`button-invite-${f.friendshipId}`}
                    >
                      {invitedIds.has(f.supabaseUserId) ? t("room.invited", "Invited") : t("room.invite", "Invite")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {!(room?.settings as any)?.isPrivate && (
              <p className="text-[10px] text-muted-foreground/70 mt-4">
                {t("room.inviteWorksAnyway", "This room isn't private — anyone with the code can still join, but invited friends will also see it under their Lobby Invites.")}
              </p>
            )}
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div data-tutorial="phase-indicator">
          <PhaseIndicator status={room.status} phase={room.phase || ""} turn={room.turn || 1} timeRemaining={timeRemaining} />
        </div>

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
                  <p className="text-sm text-muted-foreground mb-1">{t("room.playerCount", { count: players.length })}</p>
                  <p className="text-xs text-muted-foreground/70 mb-4">{t("room.maxBotsNote", "Up to 5 bots will fill empty seats — the rest need to be real players.")}</p>

                  {lobbyCountdown !== null && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-bold text-primary">
                      <Sparkles className="w-4 h-4 flex-shrink-0" />
                      {t("room.startingIn", "Everyone's ready — starting in {{seconds}}s", { seconds: lobbyCountdown })}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {players.filter(p => !p.isBot).map((p) => (
                      <div key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border ${p.isReady ? "bg-primary/10 border-primary/40" : "bg-muted/80 border-transparent"}`}>
                        <span className="text-lg">{p.avatar}</span>
                        <span className="text-xs font-bold truncate flex-1">{p.name}</span>
                        {p.isHost && <span className="text-[10px] bg-primary/20 text-primary px-1 rounded">{t("room.host")}</span>}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.isReady ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
                          {p.isReady ? t("room.ready", "Ready") : t("room.notReady", "Not ready")}
                        </span>
                      </div>
                    ))}
                  </div>

                  {me && !me.isBot && (
                    <Button
                      onClick={() => toggleReady()}
                      variant={me.isReady ? "outline" : "default"}
                      className="w-full mt-4 gap-2"
                      data-testid="button-ready-toggle"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {me.isReady ? t("room.cancelReady", "Cancel Ready") : t("room.markReady", "I'm Ready")}
                    </Button>
                  )}

                  {isHost && showSettingsPanel && (
                    <div className="mt-6 pt-6 border-t border-border space-y-3">
                      <div className="space-y-2">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("home.presets.label")}</span>
                        <div className="grid grid-cols-3 gap-2">
                          {ROLE_PRESETS.map((preset) => {
                            const meta = PRESET_META[preset.id];
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => applyPresetToDraft(preset)}
                                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-muted/50 border border-border hover:border-primary/50 hover:bg-muted transition-colors"
                                data-testid={`button-room-preset-${preset.id}`}
                              >
                                <meta.icon className={cn("w-4 h-4", meta.color)} />
                                <span className="text-[9px] font-bold uppercase tracking-wider text-foreground">{t(`home.presets.${preset.id}`)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
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
                        { key: "discussionDuration", label: t("home.roles.discussionTime", "Discussion Time"), icon: Timer, color: "text-cyan-400" },
                        { key: "bodyguardDuration", label: t("room.bodyguardNightTime"), icon: ShieldCheck, color: "text-slate-300" },
                        { key: "mafiaDuration", label: t("home.roles.mafiaNightTime"), icon: Skull, color: "text-red-400" },
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
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => adjustSetting(row.key, -1)} aria-label={t("room.decreaseSetting", { label: row.label })}>
                              <Minus className="w-3.5 h-3.5" />
                            </Button>
                            <span className="w-8 text-center font-mono font-bold">{settingsDraft[row.key]}</span>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => adjustSetting(row.key, 1)} aria-label={t("room.increaseSetting", { label: row.label })}>
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
                        <button
                          onClick={() => toggleSetting("isPrivate")}
                          className={cn("text-xs px-3 py-2 rounded-lg border font-bold uppercase tracking-wider transition-all col-span-2",
                            settingsDraft.isPrivate ? "bg-pink-500/20 border-pink-500/40 text-pink-400" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")}
                          data-testid="button-toggle-private"
                        >
                          {settingsDraft.isPrivate ? `✓ ${t("room.privateLobbyLabel", "Private Lobby")}` : t("room.privateLobbyLabel", "Private Lobby")}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70">
                        {t("room.voteAnonymityExplainer")}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">
                        {t("room.roleRevealExplainer")}
                      </p>

                      <div className="space-y-2 pt-2 border-t border-border">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("home.botPersonality.label")}</span>
                        <div className="grid grid-cols-4 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSettingsDraft(prev => ({ ...prev, botPersonality: undefined }))}
                            className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-2 rounded-lg border transition-all",
                              !settingsDraft.botPersonality ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")}
                            data-testid="button-bot-personality-default"
                          >
                            {t("home.botPersonality.default")}
                          </button>
                          {(["chill", "aggressiveLiar", "chaotic", "sharp"] as const).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setSettingsDraft(prev => ({ ...prev, botPersonality: p }))}
                              className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-2 rounded-lg border transition-all",
                                settingsDraft.botPersonality === p ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")}
                              data-testid={`button-bot-personality-${p}`}
                            >
                              {t(`home.botPersonality.${p}`)}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground/70">
                          {t(`home.botPersonality.${settingsDraft.botPersonality || "default"}Description`)}
                        </p>
                      </div>

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
                  const showActedStatus = me.role === "mafia" && room?.status === "night" && room?.phase === "mafia";
                  const actedIds = new Set((gameState as any)?.mafiaTeammatesActedIds || []);
                  return (
                    <div className="mb-3 p-3 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                      <span className="text-2xl">🤝</span>
                      <div>
                        <p className="text-sm font-black uppercase tracking-wide text-foreground">{t("room.teammatesTitle", { role: t(`playerCard.roleLabels.${me.role}`, me.role) })}</p>
                        <p className="text-xs text-muted-foreground">
                          {teammates.length > 0
                            ? teammates.map((p) => (
                                <span key={p.id} className="inline-flex items-center gap-1 mr-2">
                                  {p.name}
                                  {showActedStatus && (
                                    actedIds.has(p.id)
                                      ? <span className="text-emerald-400" title={t("room.teammateLockedIn")}>✓</span>
                                      : <span className="text-muted-foreground/50" title={t("room.teammateStillDeciding")}>⋯</span>
                                  )}
                                </span>
                              ))
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

                <div data-tutorial="player-grid" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
                  {players.map((p) => {
                    const buttonState = getPlayerButtonState(p.id);
                    const canReportAfk = room?.status === "day" && me?.isAlive && p.id !== me?.id && p.isAlive && !isSpectator;
                    return (
                      <div key={p.id} className="relative">
                        <PlayerCard
                          player={p}
                          isMe={p.id === me?.id}
                          canInteract={!!buttonState && ((me?.isAlive ?? false) && !isSpectator || (!!me && !me.isAlive))}
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
                              : !p.isAlive
                                // Bug fix: a dead player's role used to only
                                // ever show in the brief elimination overlay
                                // — this card fell through to `undefined`
                                // for everyone except the game-ended and
                                // same-role-teammate cases, so the moment
                                // that overlay closed, the role disappeared
                                // from the persistent player list even
                                // though the server has been sending their
                                // true role in every broadcast since they
                                // died (subject to the room's showRoleReveal
                                // setting — if that's off, the server itself
                                // already substitutes 'unknown' for p.role,
                                // so this stays safe either way).
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
                              "absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full border flex items-center justify-center z-10",
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
                  <div className="flex flex-col items-center gap-2 mb-6">
                    <Button
                      onClick={() => sendAction({ type: "replay" } as any)}
                      className="gap-3 px-8 py-6 text-lg font-black bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 border-2 border-purple-400 shadow-lg hover:shadow-purple-500/50 animate-pulse"
                    >
                      <RotateCcw className="w-6 h-6" />
                      {t("room.playAgain")}
                    </Button>
                    <div className="text-xs text-muted-foreground">{t("room.playAgainHelper")}</div>
                  </div>
                )}

                {myVoteStats && (
                  <div className="mb-6 text-sm text-muted-foreground">
                    {t("room.myVoteRecord", "You voted for the mafia {{correct}} out of {{total}} times.", { correct: myVoteStats.correct, total: myVoteStats.total })}
                  </div>
                )}

                {detectivePlayer && detectiveChecks.length > 0 && (
                  <Card className="bg-card border-border mb-8">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl font-serif">
                        <Search className="w-5 h-5 text-blue-400" />
                        {t("room.detectiveReport", "Detective's Report — {{name}}", { name: detectivePlayer.name })}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {detectiveChecks.map((c, i) => (
                        <div key={i} className="text-sm flex items-center gap-2">
                          <span className="text-muted-foreground">{t("room.nightN", { turn: c.turn })}:</span>
                          <span className="font-bold text-foreground">{c.target}</span>
                          <span className={c.isMafia ? "text-red-400 font-bold" : "text-muted-foreground"}>
                            {c.isMafia ? t("room.mafiaLabel") : t("roleBadge.civilian")}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
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
                                  entry.events?.map((ev: any, j: number) => (
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

          <div className="space-y-6" data-tutorial="chat">
            <ChatWindow
              messages={gameState?.messages || []}
              onSendMessage={(content, channel) => sendAction({ type: "chat", content, channel } as any)}
              notify={notify}
              currentPlayerId={me?.id || 0}
              isSpectator={(isSpectator ?? false) || !(me?.isAlive ?? true)}
              players={players}
              mafiaChatAvailable={gameState?.mafiaChatAvailable ?? false}
              gameEnded={room.status === "ended"}
            />
          </div>
        </div>
      </main>

      <AnimatePresence>
        {showTutorial && <TutorialOverlay onClose={closeTutorial} />}
      </AnimatePresence>

      {/* Feature: End-screen reactions — floating bubbles, purely visual,
          no interaction. Each reaction only ever mounts once (key={id}),
          rises and fades via its own animate/exit, and the hook itself
          removes it from the array after REACTION_LIFETIME_MS — this just
          renders whatever's currently in that array. */}
      <div className="fixed inset-x-0 bottom-24 pointer-events-none z-[300] flex justify-center">
        <AnimatePresence>
          {(reactions || []).map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 0, x: (Math.random() - 0.5) * 160 }}
              animate={{ opacity: 1, y: -120 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.2, ease: "easeOut" }}
              className="absolute text-4xl"
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

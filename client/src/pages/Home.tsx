import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Shield, Heart, User, Timer, Plus, Minus, Skull, Smile, Trophy, Settings, Sparkles, Gift, Tv, Users, Coins, Star, Copy, CircleCheck as CheckCircle2, X, UserPlus, Loader2, ShieldCheck, Crosshair, Landmark, Drama, Medal, BookOpen, Flame, History, Check, Share2 } from "lucide-react";
import { ROLE_PRESETS, type RolePreset } from "@/lib/rolePresets";
import { useTranslation } from "react-i18next";
import { useCreateRoom, useJoinRoom } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { containsProfanity } from "@/lib/profanity";
import { DailyRewards } from "@/components/DailyRewards";
import { AdRewards } from "@/components/AdRewards";
import { RatingSystem } from "@/components/RatingSystem";
import { HowToPlay } from "@/components/HowToPlay";
import { getSupabase, isSupabaseReady } from "@/lib/supabase";
import { authFetchJson } from "@/lib/authFetch";
import { getDeviceId } from "@/lib/deviceId";

const AVATARS = [
  "👤", "🧛", "🕵️", "🏥", "🧟", "🐺", "🔪", "🩸", "🦉", "🕯️", "🎭", "🗝️",
  "🤡", "🤫", "☠️", "🪦", "🔍", "💊", "🌙", "☀️", "🧥", "🎩", "💼", "🧨",
  "🦾", "🧠", "🧬", "🕸️", "♟️", "🎲", "🥨", "🍺", "🍷", "🥃", "🍕", "🍔",
  "🥷", "🧙", "🧞", "🧜", "🧚", "🦇"
];

const ACCESSORIES = ["None", "🕶️", "👑", "🎓", "🎀", "🎩", "🎧", "🎭"];
const CLOTHING = ["None", "👔", "👗", "🧥", "🥋", "👕", "🦺", "🧣"];
const BGS = ["bg-primary/30", "bg-red-500/30", "bg-blue-500/30", "bg-emerald-500/30", "bg-amber-500/30", "bg-purple-500/30"];

const ACHIEVEMENTS = [
  { id: 'first_win', icon: '🩸' },
  { id: 'mafia_master', icon: '🍷' },
  { id: 'savior', icon: '💉' },
  { id: 'truth_seeker', icon: '🔍' },
  { id: 'survivor', icon: '🛡️' },
  { id: 'quick_thinker', icon: '⚡' },
  { id: 'ghost_whisperer', icon: '👻' },
  { id: 'night_owl', icon: '🦉' },
  { id: 'fashionista', icon: '👗' },
];

function ReferralModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState({ joined: 0, totalCredits: 0 });
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadStats = useCallback((id: string, token: string) => {
    setLoadingStats(true);
    return fetch(`/api/rewards/referral?supabaseUserId=${encodeURIComponent(id)}&deviceId=${encodeURIComponent(getDeviceId())}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        setCode(data.code ?? null);
        setStats({ joined: data.joined ?? data.invited ?? 0, totalCredits: data.totalCredits ?? 0 });
      })
      .catch(() => {})
      .finally(() => setLoadingStats(false));
  }, []);

  // The invite code and joined/credits counts are tied to the signed-in
  // account on the server — a code generated in localStorage never told
  // the server anything, so real friends signing up never counted.
  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      let attempts = 0;
      while (!isSupabaseReady() && attempts < 30) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      if (!isSupabaseReady() || cancelled) { setCheckingAuth(false); setLoadingStats(false); return; }
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user?.id || null;
      const token = data.session?.access_token || null;
      if (cancelled) return;
      setSupabaseUserId(id);
      setAccessToken(token);
      setCheckingAuth(false);

      if (id && token) {
        await loadStats(id, token);
      } else {
        setLoadingStats(false);
      }
    }
    loadSession();
    return () => { cancelled = true; };
  }, [loadStats]);

  const link = code ? `${window.location.origin}/?ref=${code}` : "";

  const copy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Redeeming a code directly (typed in, not via link) works for any signed-in
  // account, new or existing — it doesn't depend on the invite link surviving
  // the page navigations between landing, login, and signup.
  const redeemCodeSubmit = useCallback(async () => {
    const trimmed = redeemCode.trim().toUpperCase();
    if (!trimmed || !supabaseUserId || !accessToken) return;
    setRedeeming(true);
    setRedeemResult(null);
    try {
      const res = await fetch("/api/rewards/referral/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ code: trimmed, deviceId: getDeviceId() }),
      });
      const data = await res.json();
      if (res.ok) {
        setRedeemCode("");
        if (data.credited) {
          setRedeemResult({ ok: true, message: t("home.referral.redeemSuccess", { count: 25 }) });
        } else {
          setRedeemResult({ ok: true, message: t("home.referral.redeemPending", { count: data.gamesNeeded ?? 3 }) });
        }
        if (data.totalCredits !== undefined) {
          try {
            const s = JSON.parse(localStorage.getItem("mafia_stats") || "{}");
            s.credits = data.totalCredits;
            localStorage.setItem("mafia_stats", JSON.stringify(s));
            window.dispatchEvent(new Event("storage"));
          } catch {}
        }
        await loadStats(supabaseUserId, accessToken);
      } else if (res.status === 429) {
        setRedeemResult({ ok: false, message: t("home.referral.redeemAlreadyUsed") });
      } else if (res.status === 400) {
        setRedeemResult({ ok: false, message: t("home.referral.redeemSelf") });
      } else if (res.status === 403) {
        setRedeemResult({ ok: false, message: t("home.referral.redeemSameDevice") });
      } else {
        setRedeemResult({ ok: false, message: t("home.referral.redeemInvalid") });
      }
    } catch {
      setRedeemResult({ ok: false, message: t("home.referral.redeemInvalid") });
    }
    setRedeeming(false);
  }, [redeemCode, supabaseUserId, accessToken, t, loadStats]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative bg-card border border-border rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-emerald-500/20 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{t("home.referral.title")}</h2>
                <p className="text-xs text-muted-foreground">{t("home.referral.subtitle")}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {checkingAuth || loadingStats ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : !supabaseUserId ? (
            <div className="text-center py-6 space-y-4">
              <UserPlus className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-bold text-foreground">Sign up to get your referral link</p>
              <p className="text-xs text-muted-foreground">Your invite link and credits are tied to your account, so guests can't refer friends.</p>
              <Button className="w-full" onClick={() => setLocation("/signup")}>
                Sign Up
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("home.referral.shareDescription1")} <strong className="text-emerald-400">{t("home.referral.shareDescription2")}</strong>.
              </p>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.referral.yourInviteLink")}</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground truncate">
                    {link}
                  </div>
                  <Button size="sm" variant="outline" onClick={copy} className="shrink-0 gap-1">
                    {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? t("common.copied") : t("common.copy")}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                {[
                  { label: t("home.referral.yourCode"), value: code, color: "text-emerald-400" },
                  { label: t("home.referral.reward"), value: "25 🪙", color: "text-amber-400" },
                  { label: t("home.referral.perFriend"), value: t("home.referral.each"), color: "text-blue-400" },
                ].map((item) => (
                  <div key={item.label} className="bg-muted/30 rounded-xl p-3 text-center border border-border">
                    <p className={`text-base font-black ${item.color}`}>{item.value}</p>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/30 rounded-xl p-3 text-center border border-border">
                  <p className="text-base font-black text-foreground">{stats.joined}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">Joined</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3 text-center border border-border">
                  <p className="text-base font-black text-emerald-500">{stats.totalCredits}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">Credits Earned</p>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.referral.gotACode")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={redeemCode}
                    onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                    placeholder={t("home.referral.codePlaceholder")}
                    maxLength={12}
                    className="font-mono"
                  />
                  <Button size="sm" onClick={redeemCodeSubmit} disabled={redeeming || !redeemCode.trim()} className="shrink-0">
                    {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : t("home.referral.redeem")}
                  </Button>
                </div>
                {redeemResult && (
                  <p className={`text-xs text-center ${redeemResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {redeemResult.message}
                  </p>
                )}
              </div>

              <p className="text-[10px] text-center text-muted-foreground px-2">
                Both you and your friend need to be signed up to earn the credits — they have to create an account using your link, not just play as a guest.
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

type RecapEntry = {
  shareId: string;
  roomCode: string;
  roomName: string | null;
  winner: "civilians" | "mafia" | "jester";
  roles: { id: number; name: string; role: string | null; avatar: string | null; isAlive: boolean }[];
  crowdFavorite: { name: string } | null;
  endedAt: string;
};

// Feature: Game history + share. Lists this account's past matches (a
// GameRecap is only ever created once per finished game, independent of the
// live room/player rows — see finalizeGameEnd in routes.ts) and lets any of
// them be shared via a public /recap/:shareId link. Mirrors Room.tsx's own
// share pattern exactly (Web Share API first, QR + copy-link modal as the
// fallback) so sharing a past match feels identical to sharing a room.
function GameHistoryPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [recaps, setRecaps] = useState<RecapEntry[]>([]);
  const [shareTarget, setShareTarget] = useState<RecapEntry | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await authFetchJson<{ recaps: RecapEntry[] }>("/api/recaps");
        setRecaps(data.recaps);
      } catch (e: any) {
        toast({ title: t("history.loadError", "Couldn't load game history"), description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [t, toast]);

  const recapUrl = (recap: RecapEntry) => `${window.location.origin}${window.location.pathname}#/recap/${recap.shareId}`;

  const shareRecap = async (recap: RecapEntry) => {
    const shareData = {
      title: t("history.shareTitle", "Mafia Verse — Match Recap"),
      text: recap.roomName || t("history.shareText", "Check out how this match went"),
      url: recapUrl(recap),
    };
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share(shareData);
        return;
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
      }
    }
    setShareTarget(recap);
  };

  const copyRecapLink = () => {
    if (!shareTarget) return;
    navigator.clipboard.writeText(recapUrl(shareTarget));
    setLinkCopied(true);
    toast({ title: t("common.copied", "Copied") });
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const qrCodeUrl = shareTarget
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(recapUrl(shareTarget))}`
    : "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-background/90 backdrop-blur-xl px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card border border-border rounded-2xl p-6 relative shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground" aria-label={t("common.close")}>
          <X className="w-5 h-5" />
        </button>
        <h3 className="font-serif font-bold text-xl text-primary mb-4 flex items-center gap-2">
          <History className="w-5 h-5" /> {t("history.title", "Game History")}
        </h3>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading", "Loading...")}</p>
        ) : recaps.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t("history.empty", "No finished games yet — play a match to see it here.")}</p>
        ) : (
          <div className="space-y-3">
            {recaps.map((r) => (
              <div key={r.shareId} className="bg-muted/50 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">
                    {r.roomName || r.roomCode}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.winner === "jester" ? `🃏 ${t("room.jesterLabel")}` : r.winner === "mafia" ? `🔴 ${t("room.mafiaLabel")}` : `✨ ${t("room.civiliansLabel")}`}
                    {" · "}
                    {new Date(r.endedAt).toLocaleDateString()}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={() => shareRecap(r)} data-testid={`button-share-recap-${r.shareId}`}>
                  <Share2 className="w-4 h-4" />
                  {t("history.share", "Share")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {shareTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-xl px-4"
            onClick={() => setShareTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 text-center relative shadow-2xl"
            >
              <button
                onClick={() => setShareTarget(null)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("common.close")}
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="font-serif font-bold text-xl text-primary mb-1">{t("history.shareRecap", "Share This Match")}</h3>
              <p className="text-xs text-muted-foreground mb-5">{t("history.scanOrCopy", "Scan the code or copy the link")}</p>

              {qrCodeUrl && (
                <div className="flex justify-center mb-5">
                  <div className="bg-white p-3 rounded-xl">
                    <img src={qrCodeUrl} alt={t("history.recapQrCode", "Recap QR code")} width={180} height={180} className="rounded-lg" />
                  </div>
                </div>
              )}

              <Button onClick={copyRecapLink} variant="outline" className="w-full gap-2">
                {linkCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {linkCopied ? t("common.copied") : t("room.copyLink")}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RecentPlayers() {
  const { t } = useTranslation();
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [recentPlayers, setRecentPlayers] = useState<{ name: string; avatar: string }[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let attempts = 0;
      while (!isSupabaseReady() && attempts < 30) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      if (!isSupabaseReady() || cancelled) return;
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user?.id || null;
      const token = data.session?.access_token || null;
      if (cancelled || !id || !token) return;
      setSupabaseUserId(id);
      fetch(`/api/rewards/recent-players?supabaseUserId=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(data => { if (!cancelled) setRecentPlayers(data.recentPlayers || []); })
        .catch(() => {});
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const invite = (name: string) => {
    const link = `${window.location.origin}`;
    navigator.clipboard.writeText(t("home.recentPlayers.inviteMessage", { name, link })).then(() => {
      setCopiedId(name);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (!supabaseUserId || recentPlayers.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2 px-1">{t("home.recentPlayers.title")}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {recentPlayers.map((rp, idx) => (
          <button
            key={`${rp.name}-${idx}`}
            onClick={() => invite(rp.name)}
            className="shrink-0 flex items-center gap-2 bg-card border border-border rounded-full pl-1.5 pr-3 py-1.5 hover:bg-muted transition-colors"
          >
            <span className="text-lg leading-none">{rp.avatar}</span>
            <span className="text-xs font-bold text-foreground">{rp.name}</span>
            <span className="text-[9px] uppercase tracking-wider text-emerald-400">
              {copiedId === rp.name ? t("common.copied") : t("home.recentPlayers.invite")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createRoom = useCreateRoom();
  const joinRoom = useJoinRoom();
  const { user, isSignedIn, isLoading, signOut } = useAuth();

  // 2FA is optional — users can set it up in Settings if they want
  // No forced redirect on login

  const [activeTab, setActiveTab] = useState("join");
  const [joinCode, setJoinCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get("join");
    return joinParam ? joinParam.toUpperCase() : "";
  });
  // Feature: deliberate "Join as Spectator" — lets someone watch a room on
  // purpose instead of only ever spectating by accident (joining late).
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);

  // Feature: public room browser + Quick Match.
  const [publicRooms, setPublicRooms] = useState<{ code: string; roomName: string | null; status: string; playerCount: number; maxPlayers: number }[]>([]);
  const [loadingPublicRooms, setLoadingPublicRooms] = useState(true);
  const [quickMatching, setQuickMatching] = useState(false);
  const loadPublicRooms = async () => {
    try {
      const res = await fetch("/api/rooms/public");
      const data = await res.json();
      setPublicRooms(data.rooms || []);
    } catch {
      // Non-critical — the list just stays empty/stale rather than
      // surfacing a toast for what's essentially a background refresh.
    } finally {
      setLoadingPublicRooms(false);
    }
  };
  useEffect(() => {
    loadPublicRooms();
  }, []);
  const handleQuickMatch = async () => {
    if (!name) {
      toast({ title: t("home.needNameTitle", "Enter a name first"), variant: "destructive" });
      return;
    }
    setQuickMatching(true);
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/rooms/quick-match", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: name.trim(), avatar, avatarConfig: config }),
      });
      if (!res.ok) throw new Error((await res.json())?.message || "Quick Match failed");
      const result = await res.json();
      localStorage.setItem(`mafia_session_${result.code}`, result.sessionId);
      localStorage.setItem(`mafia_player_${result.code}`, result.playerId.toString());
      setLocation(`/room/${result.code}`);
    } catch (err: any) {
      toast({ title: t("home.quickMatchFailed", "Quick Match failed"), description: err?.message, variant: "destructive" });
    } finally {
      setQuickMatching(false);
    }
  };
  const handleJoinPublicRoom = async (code: string) => {
    if (!name) {
      toast({ title: t("home.needNameTitle", "Enter a name first"), variant: "destructive" });
      return;
    }
    try {
      const res = await joinRoom.mutateAsync({ name, avatar, code, avatarConfig: config, asSpectator: false, supabaseUserId: user?.id } as any);
      localStorage.setItem(`mafia_session_${res.code}`, res.sessionId);
      localStorage.setItem(`mafia_player_${res.code}`, res.playerId.toString());
      setLocation(`/room/${res.code}`);
    } catch (err: any) {
      toast({ title: t("home.failedToJoin", "Couldn't join that room"), description: err?.message, variant: "destructive" });
    }
  };

  const [showDailyRewards, setShowDailyRewards] = useState(false);
  const [showAdRewards, setShowAdRewards] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [showGameHistory, setShowGameHistory] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(() => {
    try {
      return !localStorage.getItem("mafia_seen_onboarding");
    } catch {
      return false;
    }
  });

  const closeHowToPlay = () => {
    setShowHowToPlay(false);
    try { localStorage.setItem("mafia_seen_onboarding", "1"); } catch {}
  };

  // If a room code was passed via ?join=CODE (from a shared room link),
  // make sure the Join tab is active so the pre-filled code is visible.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("join")) {
      setActiveTab("join");
    }
  }, []);

  // The referral link points here (/?ref=CODE), but a new visitor has to
  // click through to Login and then Signup before an account actually
  // exists — and neither of those page navigations preserves the query
  // string. Stash the code the moment it shows up so Signup.tsx can still
  // find it once the user finally reaches the signup form.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      sessionStorage.setItem("mafia_pending_ref", ref);
    }
  }, []);

  const safeParse = (key: string, fallback: any) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      if (typeof fallback === 'object' && fallback !== null) return JSON.parse(raw);
      return raw;
    } catch { return fallback; }
  };

  // Bug fix: this key was shared across every account that ever logged
  // into this browser, with no per-account scoping at all. Whichever
  // account's name was written here most recently stuck around for every
  // other account afterward too — e.g. logging into Account B after
  // Account A made Account A's profile show Account B's name on the next
  // visit, since nothing here ever distinguished whose name it actually
  // was. profileKey below scopes storage to the signed-in account (falls
  // back to the old shared key for a guest/anonymous session, where
  // there's no account to scope by anyway).
  const profileKey = (suffix: string) => (user?.id ? `mafia_profile_${suffix}:${user.id}` : `mafia_profile_${suffix}`);

  const [name, setName] = useState(() => {
    const raw = safeParse(profileKey("name"), "");
    return typeof raw === "string" ? raw : "";
  });
  const [avatar, setAvatar] = useState(() => {
    const raw = safeParse(profileKey("avatar"), AVATARS[0]);
    return typeof raw === "string" ? raw : AVATARS[0];
  });
  const [config, setConfig] = useState(() => {
    const raw = safeParse(profileKey("config"), { accessory: "None", clothing: "None", bg: BGS[0] });
    return raw && typeof raw === "object" ? raw : { accessory: "None", clothing: "None", bg: BGS[0] };
  });
  const [stats, setStats] = useState(() => {
    const raw = safeParse("mafia_stats", { wins: 0, gamesPlayed: 0, achievements: [] });
    if (raw && typeof raw === "object") return raw;
    return { wins: 0, gamesPlayed: 0, achievements: [] };
  });

  // Bug fix: a signed-in account's name should always reflect the real
  // account (see profile.tsx and Settings), not a per-device leftover.
  // This fetches the authoritative name from the server and — for a
  // logged-in account specifically — always applies it, rather than only
  // filling in an empty field. That guarantees switching accounts on one
  // browser can't leave one account displaying another's name.
  useEffect(() => {
    if (!isSignedIn || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const body = await authFetchJson<{ name?: string }>("/api/auth/sync-profile", { method: "POST" });
        if (cancelled) return;
        if (typeof body.name === "string" && body.name) setName(body.name);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    localStorage.setItem(profileKey("name"), name);
    localStorage.setItem(profileKey("avatar"), avatar);
    localStorage.setItem(profileKey("config"), JSON.stringify(config));
  }, [name, avatar, config, user?.id]);

  useEffect(() => {
    const onStorage = () => {
      const saved = localStorage.getItem("mafia_stats");
      if (saved) setStats(JSON.parse(saved));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const [roomName, setRoomName] = useState("");
  const [showVoteResults, setShowVoteResultsState] = useState(() => {
    try {
      const saved = localStorage.getItem("mafia_last_room_settings");
      if (saved) return JSON.parse(saved).showVoteResults === true;
    } catch {}
    return true;
  });
  const [showRoleReveal, setShowRoleRevealState] = useState(() => {
    try {
      const saved = localStorage.getItem("mafia_last_room_settings");
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed && typeof parsed.showRoleReveal === "boolean") return parsed.showRoleReveal;
    } catch {}
    return true;
  });
  const setShowVoteResults = (val: boolean) => {
    setShowVoteResultsState(val);
    try {
      const saved = localStorage.getItem("mafia_last_room_settings");
      const prev = saved ? JSON.parse(saved) : {};
      localStorage.setItem("mafia_last_room_settings", JSON.stringify({ ...prev, showVoteResults: val }));
    } catch {}
  };
  const setShowRoleReveal = (val: boolean) => {
    setShowRoleRevealState(val);
    try {
      const saved = localStorage.getItem("mafia_last_room_settings");
      const prev = saved ? JSON.parse(saved) : {};
      localStorage.setItem("mafia_last_room_settings", JSON.stringify({ ...prev, showRoleReveal: val }));
    } catch {}
  };

  const DEFAULT_COUNTS = {
    mafia: 1, detective: 1, doctor: 1, civilian: 3,
    bodyguard: 0, vigilante: 0, mayor: 0, jester: 0,
    phaseDuration: 30, discussionDuration: 30, mafiaDuration: 15, doctorDuration: 15, detectiveDuration: 15,
    bodyguardDuration: 15, vigilanteDuration: 15,
  };
  // Hard floors so the game can't be configured with a 0s (or near-0s)
  // phase, which can crash/spiral the timer logic — 10s for discussion,
  // 5s for voting and every night-action phase. Role counts have no floor
  // beyond the existing 0.
  const DURATION_MIN: Partial<Record<keyof typeof DEFAULT_COUNTS, number>> = {
    phaseDuration: 5, discussionDuration: 10, mafiaDuration: 5, doctorDuration: 5,
    detectiveDuration: 5, bodyguardDuration: 5, vigilanteDuration: 5,
  };
  const clampDurations = (settings: typeof DEFAULT_COUNTS) => {
    const clamped = { ...settings };
    for (const key of Object.keys(DURATION_MIN) as (keyof typeof DEFAULT_COUNTS)[]) {
      const min = DURATION_MIN[key]!;
      if (clamped[key] < min) clamped[key] = min;
    }
    return clamped;
  };
  const [counts, setCounts] = useState(() => {
    try {
      const saved = localStorage.getItem("mafia_last_room_settings");
      // Clamp on load too — localStorage could still hold a sub-minimum
      // value saved before this floor was added.
      if (saved) return clampDurations({ ...DEFAULT_COUNTS, ...JSON.parse(saved) });
    } catch {}
    return DEFAULT_COUNTS;
  });

  const adjustCount = (role: keyof typeof counts, delta: number) => {
    setCounts(prev => {
      const min = DURATION_MIN[role] ?? 0;
      const next = { ...prev, [role]: Math.max(min, prev[role] + delta) };
      try { localStorage.setItem("mafia_last_room_settings", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Feature: Role presets — populates the same editable count fields below
  // rather than creating a separate config path, so a preset is just a
  // starting point the host can still tweak.
  const applyPreset = (preset: RolePreset) => {
    const next = {
      mafia: preset.mafiaCount, detective: preset.detectiveCount, doctor: preset.doctorCount, civilian: preset.civilianCount,
      bodyguard: preset.bodyguardCount, vigilante: preset.vigilanteCount, mayor: preset.mayorCount, jester: preset.jesterCount,
      phaseDuration: preset.phaseDuration, mafiaDuration: preset.mafiaDuration, doctorDuration: preset.doctorDuration, detectiveDuration: preset.detectiveDuration,
      bodyguardDuration: preset.bodyguardDuration, vigilanteDuration: preset.vigilanteDuration,
      // Presets don't define a discussion duration yet (rolePresets.ts
      // predates this feature) — fall back to the preset's phaseDuration so
      // discussion still starts out sensible for whichever preset was picked.
      discussionDuration: (preset as any).discussionDuration ?? preset.phaseDuration,
    };
    setCounts(clampDurations(next));
    try { localStorage.setItem("mafia_last_room_settings", JSON.stringify(clampDurations(next))); } catch {}
  };

  const PRESET_META: Record<string, { icon: any; color: string }> = {
    classic: { icon: Sparkles, color: "text-blue-400" },
    chaos: { icon: Flame, color: "text-orange-400" },
    beginner: { icon: Smile, color: "text-emerald-400" },
  };

  // Feature: Bot personality — host-configurable at creation too, same
  // optional field the in-room Game Settings panel writes. Undefined means
  // "use current default bot behavior."
  const [botPersonality, setBotPersonality] = useState<"chill" | "aggressiveLiar" | "chaotic" | "sharp" | undefined>(() => {
    try {
      const saved = localStorage.getItem("mafia_last_room_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.botPersonality) return parsed.botPersonality;
      }
    } catch {}
    return undefined;
  });
  const updateBotPersonality = (val: "chill" | "aggressiveLiar" | "chaotic" | "sharp" | undefined) => {
    setBotPersonality(val);
    try {
      const saved = localStorage.getItem("mafia_last_room_settings");
      const prev = saved ? JSON.parse(saved) : {};
      localStorage.setItem("mafia_last_room_settings", JSON.stringify({ ...prev, botPersonality: val }));
    } catch {}
  };

  const totalPlayers = counts.mafia + counts.detective + counts.doctor + counts.civilian
    + counts.bodyguard + counts.vigilante + counts.mayor + counts.jester;
  const specialRoleTotal = counts.mafia + counts.detective + counts.doctor
    + counts.bodyguard + counts.vigilante + counts.mayor + counts.jester;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !joinCode) return;
    if (containsProfanity(name)) {
      toast({ title: t("home.inappropriateName"), description: t("home.inappropriateNameDescription"), variant: "destructive" });
      return;
    }
    try {
      const res = await joinRoom.mutateAsync({ name, avatar, code: joinCode, avatarConfig: config, asSpectator: joinAsSpectator, supabaseUserId: user?.id } as any);
      localStorage.setItem(`mafia_session_${res.code}`, res.sessionId);
      localStorage.setItem(`mafia_player_${res.code}`, res.playerId.toString());
      setLocation(`/room/${res.code}`);
    } catch (err: any) {
      toast({ title: t("home.failedToJoin"), description: err.message, variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!name?.trim()) {
      toast({ title: t("home.nameRequired"), description: t("home.nameRequiredDescription"), variant: "destructive" });
      return;
    }
    if (containsProfanity(name)) {
      toast({ title: t("home.inappropriateName"), description: t("home.inappropriateNameDescription"), variant: "destructive" });
      return;
    }
    if (counts.mafia < 1) {
      toast({ title: t("home.needMafia"), description: t("home.needMafiaDescription"), variant: "destructive" });
      return;
    }
    if (counts.civilian < 1) {
      toast({ title: t("home.needCivilian"), description: t("home.needCivilianDescription"), variant: "destructive" });
      return;
    }
    if (specialRoleTotal > 10) {
      toast({ title: t("home.tooManySpecialRoles"), description: t("home.tooManySpecialRolesDescription"), variant: "destructive" });
      return;
    }
    if (totalPlayers > 20) {
      toast({ title: t("home.tooManyPlayers"), description: t("home.tooManyPlayersDescription"), variant: "destructive" });
      return;
    }
    try {
      const res = await createRoom.mutateAsync({
        name: name.trim(), avatar, avatarConfig: config,
        settings: {
          mafiaCount: counts.mafia, detectiveCount: counts.detective,
          doctorCount: counts.doctor, civilianCount: counts.civilian,
          bodyguardCount: counts.bodyguard, vigilanteCount: counts.vigilante,
          mayorCount: counts.mayor, jesterCount: counts.jester,
          phaseDuration: counts.phaseDuration, discussionDuration: counts.discussionDuration, mafiaDuration: counts.mafiaDuration,
          doctorDuration: counts.doctorDuration, detectiveDuration: counts.detectiveDuration,
          bodyguardDuration: counts.bodyguardDuration, vigilanteDuration: counts.vigilanteDuration,
          roomName: roomName.trim() || undefined, showVoteResults, showRoleReveal,
          language: i18n.language?.startsWith("es") ? "es" : "en",
          botPersonality,
        },
        supabaseUserId: user?.id,
      } as any);
      localStorage.setItem(`mafia_session_${res.code}`, res.sessionId);
      localStorage.setItem(`mafia_player_${res.code}`, res.playerId.toString());
      setLocation(`/room/${res.code}`);
    } catch (err: any) {
      toast({ title: t("home.failedToCreate"), description: err?.message || t("home.somethingWentWrong"), variant: "destructive" });
    }
  };

  const ROLE_ROWS = [
    { key: 'mafia', label: t("home.roles.mafias"), icon: Skull, color: 'text-red-500', bg: 'bg-red-500/10' },
    { key: 'detective', label: t("home.roles.detectives"), icon: Shield, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { key: 'doctor', label: t("home.roles.doctors"), icon: Heart, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { key: 'civilian', label: t("home.roles.civilians"), icon: User, color: 'text-slate-400', bg: 'bg-slate-500/10' },
    { key: 'bodyguard', label: t("roleBadge.bodyguard"), icon: ShieldCheck, color: 'text-slate-300', bg: 'bg-slate-400/10' },
    { key: 'vigilante', label: t("roleBadge.vigilante"), icon: Crosshair, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { key: 'mayor', label: t("roleBadge.mayor"), icon: Landmark, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { key: 'jester', label: t("roleBadge.jester"), icon: Drama, color: 'text-pink-400', bg: 'bg-pink-500/10' },
    { key: 'phaseDuration', label: t("home.roles.votingTime"), icon: Timer, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { key: 'discussionDuration', label: t("home.roles.discussionTime", "Discussion Time"), icon: Timer, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { key: 'bodyguardDuration', label: t("room.bodyguardNightTime"), icon: ShieldCheck, color: 'text-slate-300', bg: 'bg-slate-400/10' },
    { key: 'mafiaDuration', label: t("home.roles.mafiaNightTime"), icon: Skull, color: 'text-red-400', bg: 'bg-red-400/10' },
    { key: 'vigilanteDuration', label: t("room.vigilanteNightTime"), icon: Crosshair, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { key: 'doctorDuration', label: t("home.roles.doctorNightTime"), icon: Heart, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { key: 'detectiveDuration', label: t("home.roles.detectiveNightTime"), icon: Shield, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none bg-background">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <div className="flex justify-end mb-4">
            {isSignedIn ? (
              <Button onClick={async () => { await signOut(); setLocation("/"); }} size="sm" className="bg-red-600 hover:bg-red-700" data-testid="button-logout">{t("home.logout")}</Button>
            ) : (
              <Button onClick={() => setLocation("/login")} size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="button-login">{t("home.loginSignup")}</Button>
            )}
          </div>
          <div className="inline-flex items-center justify-center p-4 bg-card border-2 border-border rounded-full shadow-xl mb-6 ring-4 ring-primary/10 relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-transparent to-transparent opacity-50" />
            <Search className="w-10 h-10 text-primary relative z-10" strokeWidth={2.5} />
          </div>
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/50 mb-2 drop-shadow-sm font-serif uppercase tracking-tighter">Mafia Verse</h1>
          <p className="text-muted-foreground font-medium uppercase tracking-[0.3em] text-[10px] opacity-80">{t("home.tagline")}</p>
        </div>

        <div className="space-y-6 mb-8">
          <Card className="glass-card border-none bg-card/80 backdrop-blur-xl ring-1 ring-border p-6">
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-start gap-8 w-full">
                <div className="relative group flex-shrink-0">
                  <div className={cn("w-32 h-32 rounded-full border-2 border-primary/20 flex items-center justify-center text-6xl shadow-2xl shadow-primary/10 relative overflow-hidden", config.bg)}>
                    <span className="relative z-10">{avatar}</span>
                    {config.accessory !== "None" && <span className="absolute top-4 text-3xl z-30">{config.accessory}</span>}
                    {config.clothing !== "None" && <span className="absolute bottom-4 text-3xl z-20 opacity-90">{config.clothing}</span>}
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-card border border-border p-1.5 rounded-full shadow-lg">
                    <Smile className="w-4 h-4 text-primary" />
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.accessory")}</Label>
                    <div className="flex flex-wrap gap-1">
                      {ACCESSORIES.map(a => (
                        <button key={a} onClick={() => setConfig({ ...config, accessory: a })}
                          className={cn("w-8 h-8 rounded border flex items-center justify-center text-sm",
                            config.accessory === a ? "bg-primary border-primary text-primary-foreground" : "bg-muted/50 border-border hover:bg-muted")}>
                          {a === "None" ? "Ø" : a}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.clothing")}</Label>
                    <div className="flex flex-wrap gap-1">
                      {CLOTHING.map(c => (
                        <button key={c} onClick={() => setConfig({ ...config, clothing: c })}
                          className={cn("w-8 h-8 rounded border flex items-center justify-center text-sm",
                            config.clothing === c ? "bg-primary border-primary text-primary-foreground" : "bg-muted/50 border-border hover:bg-muted")}>
                          {c === "None" ? "Ø" : c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.background")}</Label>
                    <div className="flex flex-wrap gap-1">
                      {BGS.map((bg, i) => (
                        <button key={bg} onClick={() => setConfig({ ...config, bg })}
                          aria-label={t("home.selectBackgroundColor", { color: t(`home.bgColorNames.${i}`) })}
                          className={cn("w-8 h-8 rounded-full border", bg,
                            config.bg === bg ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border")} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{t("home.mafiaHandle")}</Label>
                  <Input
                    placeholder={t("home.chooseNamePlaceholder")}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className={cn("bg-muted/50 border-border h-12 text-center font-bold tracking-tight focus:ring-primary/50 text-lg text-foreground",
                      !name.trim() && "border-red-500/50 focus:border-red-500")}
                    maxLength={12}
                    data-testid="input-player-name"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{t("home.pickPersona")}</Label>
                  <div className="grid grid-cols-6 gap-2">
                    {AVATARS.map(a => (
                      <button key={a} onClick={() => setAvatar(a)}
                        className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-transform border border-transparent",
                          avatar === a ? "bg-primary border-primary shadow-lg shadow-primary/20 scale-110 text-primary-foreground" : "bg-muted/50 hover:bg-muted")}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4x2 Navigation Grid */}
                <div className="pt-4 border-t border-white/5 flex flex-col gap-2 w-full">
                  {/* Row 1 */}
                  <div className="grid grid-cols-4 gap-2 w-full">
                    <button onClick={() => setLocation("/profile")}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center gap-1 hover:bg-muted cursor-pointer">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                      <span className="text-2xl font-black font-mono">{stats.wins ?? 0}</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.wins")}</span>
                    </button>
                    <button onClick={() => setLocation("/store")}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center gap-1 hover:bg-muted cursor-pointer">
                      <Coins className="w-4 h-4 text-purple-500" />
                      <span className="text-lg font-black font-mono">🛒</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.store")}</span>
                    </button>
                    <button onClick={() => setLocation("/cosmetics")}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center gap-1 hover:bg-muted cursor-pointer">
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                      <span className="text-lg font-black font-mono">✨</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.shop")}</span>
                    </button>
                    <button onClick={() => setShowDailyRewards(true)}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center gap-1 hover:bg-muted cursor-pointer relative">
                      <Gift className="w-4 h-4 text-amber-500" />
                      <span className="text-lg font-black font-mono">🎁</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.daily")}</span>
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    </button>
                  </div>
                  {/* Row 2 */}
                  <div className="grid grid-cols-4 gap-2 w-full">
                    <button onClick={() => setShowAdRewards(true)}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center gap-1 hover:bg-muted cursor-pointer">
                      <Tv className="w-4 h-4 text-blue-500" />
                      <span className="text-lg font-black font-mono">📺</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.free")}</span>
                    </button>
                    <button onClick={() => setShowRating(true)}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center gap-1 hover:bg-muted cursor-pointer">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <span className="text-lg font-black font-mono">⭐</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.rate")}</span>
                    </button>
                    <button onClick={() => setShowReferral(true)}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center gap-1 hover:bg-muted cursor-pointer">
                      <Users className="w-4 h-4 text-emerald-500" />
                      <span className="text-lg font-black font-mono">👥</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.refer")}</span>
                    </button>
                    <button onClick={() => setLocation("/settings")}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center gap-1 hover:bg-muted cursor-pointer">
                      <Settings className="w-4 h-4 text-gray-400" />
                      <span className="text-lg font-black font-mono">⚙️</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.settings")}</span>
                    </button>
                  </div>
                  {/* Row 3 */}
                  <div className="grid grid-cols-4 gap-2 w-full">
                    <button onClick={() => setLocation("/leaderboard")}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center justify-center gap-1.5 hover:bg-muted cursor-pointer min-w-0">
                      <Medal className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                      <span className="text-[10px] leading-tight uppercase tracking-wide text-muted-foreground font-bold text-center">{t("home.leaderboard")}</span>
                    </button>
                    <button onClick={() => setLocation("/friends")}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center justify-center gap-1.5 hover:bg-muted cursor-pointer min-w-0"
                      data-testid="button-friends-nav">
                      <UserPlus className="w-5 h-5 text-pink-400 flex-shrink-0" />
                      <span className="text-[10px] leading-tight uppercase tracking-wide text-muted-foreground font-bold text-center">{t("friends.title", "Friends")}</span>
                    </button>
                    <button onClick={() => setShowHowToPlay(true)}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center justify-center gap-1.5 hover:bg-muted cursor-pointer min-w-0">
                      <BookOpen className="w-5 h-5 text-primary flex-shrink-0" />
                      <span className="text-[10px] leading-tight uppercase tracking-wide text-muted-foreground font-bold text-center">{t("home.howToPlay")}</span>
                    </button>
                    <button onClick={() => isSignedIn ? setShowGameHistory(true) : setLocation("/login")}
                      className="p-3 bg-muted/50 rounded-xl border border-border flex flex-col items-center justify-center gap-1.5 hover:bg-muted cursor-pointer min-w-0"
                      data-testid="button-game-history-nav">
                      <History className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                      <span className="text-[10px] leading-tight uppercase tracking-wide text-muted-foreground font-bold text-center">{t("history.title", "Game History")}</span>
                    </button>
                  </div>
                </div>

                <a
                  href="https://discord.gg/9fRxpUyjD4"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl cursor-pointer"
                >
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-bold text-indigo-400">{t("home.joinDiscord")}</span>
                </a>

                <div className="pt-2 flex items-center justify-center gap-4">
                  <button
                    onClick={() => setLocation("/about")}
                    className="text-[10px] text-muted-foreground/60 hover:text-foreground uppercase tracking-[0.2em] font-mono transition-colors"
                    data-testid="link-about"
                  >
                    {t("home.aboutLink")}
                  </button>
                  <button
                    onClick={() => setLocation("/faq")}
                    className="text-[10px] text-muted-foreground/60 hover:text-foreground uppercase tracking-[0.2em] font-mono transition-colors"
                    data-testid="link-faq"
                  >
                    {t("home.faqLink")}
                  </button>
                  <span className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] font-mono">
                    {t("home.systemCore")}
                  </span>
                </div>

                {stats.achievements?.length > 0 && (
                  <div className="w-full space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("home.achievementsLabel")}</Label>
                    <div className="flex flex-wrap gap-2">
                      {stats.achievements.map((id: string) => {
                        const ach = ACHIEVEMENTS.find(a => a.id === id);
                        if (!ach) return null;
                        return (
                          <div key={id} className="group relative">
                            <div className="w-10 h-10 rounded-full bg-yellow-500/20 border border-yellow-500/50 flex items-center justify-center text-xl cursor-help hover:scale-110 transition-transform">
                              {ach.icon}
                            </div>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-popover border border-border rounded-lg text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                              <p className="font-bold text-yellow-500 uppercase">{t(`home.achievements.${ach.id}.name`)}</p>
                              <p className="text-muted-foreground">{t(`home.achievements.${ach.id}.description`)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        <RecentPlayers />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8 bg-muted/50 backdrop-blur border border-border p-1 h-14 rounded-full">
            <TabsTrigger value="join" className="rounded-full h-full data-[state=active]:bg-primary font-bold tracking-wide">{t("home.joinGameTab")}</TabsTrigger>
            <TabsTrigger value="create" className="rounded-full h-full data-[state=active]:bg-primary font-bold tracking-wide">{t("home.createRoomTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="join">
            <Card className="glass-card border-none bg-card/80 backdrop-blur-xl ring-1 ring-border">
              <CardContent className="pt-6">
                <form onSubmit={handleJoin} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("home.roomCode")}</Label>
                    <Input
                      placeholder={t("home.roomCodePlaceholder")}
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      className="text-center uppercase text-2xl tracking-[0.5em] font-mono bg-muted/50 border-border h-14 focus:ring-primary/50 text-foreground"
                      maxLength={4}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setJoinAsSpectator(v => !v)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                      joinAsSpectator ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                    )}
                    data-testid="checkbox-join-as-spectator"
                  >
                    <Tv className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-bold">{t("home.joinAsSpectator")}</span>
                  </button>
                  <Button type="submit" className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 rounded-xl"
                    disabled={joinRoom.isPending || !joinCode || !name} data-testid="button-join-room">
                    {joinRoom.isPending ? t("home.joining") : t("home.enterAbyss")}
                  </Button>
                </form>

                {/* Feature: public room browser + Quick Match */}
                <div className="mt-6 pt-6 border-t border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t("home.findAGame", "Find a Game")}</h3>
                    <Button size="sm" onClick={handleQuickMatch} disabled={quickMatching || !name} className="gap-2" data-testid="button-quick-match">
                      <Sparkles className="w-4 h-4" />
                      {quickMatching ? t("home.matching", "Matching...") : t("home.quickMatch", "Quick Match")}
                    </Button>
                  </div>
                  {loadingPublicRooms ? (
                    <p className="text-sm text-muted-foreground">{t("common.loading", "Loading...")}</p>
                  ) : publicRooms.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">{t("home.noOpenRooms", "No open public rooms right now — try Quick Match to start one.")}</p>
                  ) : (
                    <div className="space-y-2">
                      {publicRooms.map((r) => (
                        <div key={r.code} className="flex items-center justify-between bg-muted/50 rounded-xl p-3">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-foreground truncate">{r.roomName || r.code}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.status === "lobby" ? t("home.inLobby", "In lobby") : t("home.inProgress", "In progress — join as spectator")}
                              {" · "}{r.playerCount}/{r.maxPlayers}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => handleJoinPublicRoom(r.code)} disabled={!name} data-testid={`button-join-public-${r.code}`}>
                            {r.status === "lobby" ? t("home.join", "Join") : t("home.watch", "Watch")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card className="glass-card border-none bg-card/80 backdrop-blur-xl ring-1 ring-border">
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("home.roomNameOptional")}</Label>
                  <Input placeholder={t("home.roomNamePlaceholder")} value={roomName}
                    onChange={e => setRoomName(e.target.value)}
                    className="bg-muted/50 border-border h-11 focus:ring-primary/50 text-foreground" maxLength={32} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("home.presets.label")}</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {ROLE_PRESETS.map((preset) => {
                      const meta = PRESET_META[preset.id];
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyPreset(preset)}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/50 border border-border hover:border-primary/50 hover:bg-muted transition-colors"
                          data-testid={`button-preset-${preset.id}`}
                        >
                          <meta.icon className={`w-4 h-4 ${meta.color}`} />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">{t(`home.presets.${preset.id}`)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {ROLE_ROWS.map((role) => (
                    <div key={role.key} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border hover:border-border/80 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${role.bg}`}>
                          <role.icon className={`w-5 h-5 ${role.color}`} />
                        </div>
                        <span className="font-semibold tracking-tight text-foreground">{role.label}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-muted-foreground/10 rounded-md"
                          onClick={() => adjustCount(role.key as any, -1)}>
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="w-8 text-center font-mono font-bold text-lg text-foreground">{counts[role.key as keyof typeof counts]}</span>
                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-muted-foreground/10 rounded-md"
                          onClick={() => adjustCount(role.key as any, 1)}>
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-border space-y-3">
                  <div className="flex justify-between items-center px-2">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground text-xs uppercase tracking-widest font-bold">{t("home.totalPlayers")}</span>
                      <span className="text-xs text-muted-foreground/60 italic">{t("home.minPlayers")}</span>
                      <span className={cn("text-xs italic", totalPlayers > 20 ? "text-destructive font-bold" : "text-muted-foreground/60")}>{t("home.maxPlayersHint")}</span>
                      <span className="text-xs text-muted-foreground/60 italic">{t("home.maxBotsHint", "Up to 5 bots will fill empty seats — the rest need to be real players.")}</span>
                    </div>
                    <span className={cn("text-3xl font-black font-mono tracking-tighter", totalPlayers > 20 && "text-destructive")}>{totalPlayers}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 px-2">
                    <button onClick={() => setShowVoteResults(!showVoteResults)}
                      className={cn("text-xs px-3 py-2 rounded-lg border font-bold uppercase tracking-wider transition-opacity",
                        showVoteResults ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")}>
                      {showVoteResults ? `✓ ${t("home.voteResults")}` : t("home.voteResults")}
                    </button>
                    <button onClick={() => setShowRoleReveal(!showRoleReveal)}
                      className={cn("text-xs px-3 py-2 rounded-lg border font-bold uppercase tracking-wider transition-opacity",
                        showRoleReveal ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")}>
                      {showRoleReveal ? `✓ ${t("home.roleReveal")}` : t("home.roleReveal")}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 px-2 leading-relaxed">
                    {t("home.voteAnonymityExplainer")}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 px-2 leading-relaxed">
                    {t("home.roleRevealExplainer")}
                  </p>
                  <div className="px-2 space-y-2 pt-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("home.botPersonality.label")}</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateBotPersonality(undefined)}
                        className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-2 rounded-lg border transition-all",
                          !botPersonality ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")}
                        data-testid="button-create-bot-personality-default"
                      >
                        {t("home.botPersonality.default")}
                      </button>
                      {(["chill", "aggressiveLiar", "chaotic", "sharp"] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => updateBotPersonality(p)}
                          className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-2 rounded-lg border transition-all",
                            botPersonality === p ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")}
                          data-testid={`button-create-bot-personality-${p}`}
                        >
                          {t(`home.botPersonality.${p}`)}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                      {t(`home.botPersonality.${botPersonality || "default"}Description`)}
                    </p>
                  </div>
                </div>

                <Button onClick={handleCreate} className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 rounded-xl"
                  disabled={createRoom.isPending || totalPlayers < 6 || totalPlayers > 20 || specialRoleTotal > 10 || counts.mafia < 1 || counts.civilian < 1 || !name} data-testid="button-create-room">
                  {createRoom.isPending ? t("home.preparing") : t("home.createRoomButton")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      <AnimatePresence>
        {showDailyRewards && <DailyRewards onClose={() => setShowDailyRewards(false)} />}
        {showAdRewards && <AdRewards onClose={() => setShowAdRewards(false)} />}
        {showRating && <RatingSystem onClose={() => setShowRating(false)} />}
        {showReferral && <ReferralModal onClose={() => setShowReferral(false)} />}
        {showGameHistory && <GameHistoryPanel onClose={() => setShowGameHistory(false)} />}
        {showHowToPlay && <HowToPlay onClose={closeHowToPlay} />}
      </AnimatePresence>
    </div>
  );
}

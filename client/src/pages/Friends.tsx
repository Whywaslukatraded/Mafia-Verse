import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, UserPlus, Check, X, Trash2, Users, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getSupabase, isSupabaseReady } from "@/lib/supabase";
import { authFetch, authFetchJson } from "@/lib/authFetch";

type FriendEntry = { friendshipId: number; supabaseUserId: string; name: string; avatar: string; isOnline?: boolean };
type RoomInvite = { code: string; roomName: string | null };

export default function Friends() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [incoming, setIncoming] = useState<FriendEntry[]>([]);
  const [outgoing, setOutgoing] = useState<FriendEntry[]>([]);
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [usernameInput, setUsernameInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;

    const attach = () => {
      const supabase = getSupabase();
      supabase.auth.getSession().then(({ data }: any) => {
        if (cancelled) return;
        setIsLoggedIn(!!data.session);
        if (!data.session) setLoading(false);
      });
      // Also react to auth state resolving/changing after mount — a
      // one-shot getSession() check right on mount can lose a race against
      // Supabase still finishing its own initial session hydration, which
      // would otherwise permanently show "sign in required" even though
      // the person actually is logged in.
      const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
        if (cancelled) return;
        setIsLoggedIn(!!session);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    };

    if (isSupabaseReady()) {
      attach();
    } else {
      // Supabase client not initialized yet at mount time — poll briefly
      // instead of immediately concluding "logged out", since initSupabase()
      // may still be running (e.g. fetching config) when this page loads.
      let attempts = 0;
      pollInterval = setInterval(() => {
        attempts++;
        if (isSupabaseReady()) {
          if (pollInterval) clearInterval(pollInterval);
          attach();
        } else if (attempts > 20) { // ~4s
          if (pollInterval) clearInterval(pollInterval);
          setIsLoggedIn(false);
          setLoading(false);
        }
      }, 200);
    }

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      unsubscribe?.();
    };
  }, []);

  const loadFriends = useCallback(async () => {
    try {
      const data = await authFetchJson<{ friends: FriendEntry[]; incoming: FriendEntry[]; outgoing: FriendEntry[] }>("/api/friends");
      setFriends(data.friends);
      setIncoming(data.incoming);
      setOutgoing(data.outgoing);
    } catch (e: any) {
      toast({ title: t("friends.loadError", "Couldn't load friends"), description: e.message, variant: "destructive" });
    }
  }, [t, toast]);

  const loadInvites = useCallback(async () => {
    try {
      const data = await authFetchJson<{ invites: RoomInvite[] }>("/api/friends/invites");
      setInvites(data.invites);
    } catch {
      // Non-critical — the invites strip just stays empty rather than
      // surfacing a toast for what's essentially a background refresh.
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn !== true) return;
    (async () => {
      setLoading(true);
      await Promise.all([loadFriends(), loadInvites()]);
      setLoading(false);
    })();
  }, [isLoggedIn, loadFriends, loadInvites]);

  // Feature: Friends online status. The actual "still here" heartbeat now
  // runs app-wide in App.tsx (covers every page, not just this one) — this
  // just re-fetches the friends list on the same cadence so the green/gray
  // dots shown here stay current without a manual refresh.
  useEffect(() => {
    if (isLoggedIn !== true) return;
    const interval = setInterval(() => {
      loadFriends();
    }, 20_000);
    return () => clearInterval(interval);
  }, [isLoggedIn, loadFriends]);

  const sendRequest = async () => {
    const username = usernameInput.trim();
    if (!username) return;
    setSending(true);
    try {
      await authFetchJson("/api/friends/request", { method: "POST", body: JSON.stringify({ username }) });
      setUsernameInput("");
      toast({ title: t("friends.requestSent", "Friend request sent") });
      await loadFriends();
    } catch (e: any) {
      toast({ title: t("friends.requestFailed", "Couldn't send request"), description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const respond = async (friendshipId: number, accept: boolean) => {
    try {
      await authFetchJson("/api/friends/respond", { method: "POST", body: JSON.stringify({ friendshipId, accept }) });
      await loadFriends();
    } catch (e: any) {
      toast({ title: t("friends.actionFailed", "Something went wrong"), description: e.message, variant: "destructive" });
    }
  };

  const removeFriend = async (friendshipId: number) => {
    try {
      await authFetch("/api/friends/remove", { method: "POST", body: JSON.stringify({ friendshipId }) });
      await loadFriends();
    } catch (e: any) {
      toast({ title: t("friends.actionFailed", "Something went wrong"), description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/profile")} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-black font-serif uppercase tracking-wider text-foreground">{t("friends.title", "Friends")}</h1>
        </div>

        {isLoggedIn === false && (
          <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 text-center space-y-3">
            <Users className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{t("friends.signInRequired", "Sign in to add friends and get invited to private lobbies.")}</p>
            <Button onClick={() => setLocation("/login")}>{t("common.signIn", "Sign In")}</Button>
          </div>
        )}

        {isLoggedIn && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Add friend */}
            <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-5">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">{t("friends.addFriend", "Add a Friend")}</h3>
              <div className="flex gap-2">
                <Input
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendRequest(); }}
                  placeholder={t("friends.usernamePlaceholder", "Their account username (not their in-game name)")}
                  data-testid="input-friend-username"
                />
                <Button onClick={sendRequest} disabled={sending || !usernameInput.trim()} data-testid="button-send-friend-request">
                  <UserPlus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Room invites */}
            {invites.length > 0 && (
              <div className="bg-pink-500/10 border border-pink-500/30 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-pink-400 flex items-center gap-2">
                  <Mail className="w-4 h-4" /> {t("friends.lobbyInvites", "Lobby Invites")}
                </h3>
                {invites.map((inv) => (
                  <div key={inv.code} className="flex items-center justify-between bg-card/60 rounded-xl p-3">
                    <span className="text-sm font-bold text-foreground">{inv.roomName || t("friends.aPrivateLobby", "A private lobby")}</span>
                    <Button size="sm" onClick={() => setLocation(`/?join=${inv.code}`)} data-testid={`button-join-invite-${inv.code}`}>
                      {t("friends.join", "Join")}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Incoming requests */}
            {incoming.length > 0 && (
              <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t("friends.incomingRequests", "Requests")}</h3>
                <AnimatePresence>
                  {incoming.map((f) => (
                    <motion.div key={f.friendshipId} exit={{ opacity: 0, x: -20 }} className="flex items-center justify-between bg-muted/50 rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{f.avatar}</span>
                        <span className="text-sm font-bold text-foreground">{f.name}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="icon" variant="outline" className="h-8 w-8 text-green-500" onClick={() => respond(f.friendshipId, true)} data-testid={`button-accept-${f.friendshipId}`}>
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-8 w-8 text-red-500" onClick={() => respond(f.friendshipId, false)} data-testid={`button-decline-${f.friendshipId}`}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Friends list */}
            <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t("friends.yourFriends", "Your Friends")} {friends.length > 0 && `(${friends.length})`}</h3>
              {loading ? (
                <p className="text-sm text-muted-foreground">{t("common.loading", "Loading...")}</p>
              ) : friends.length === 0 && outgoing.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">{t("friends.noFriendsYet", "No friends yet — add one above.")}</p>
              ) : (
                <>
                  <AnimatePresence>
                    {friends.map((f) => (
                      <motion.div key={f.friendshipId} exit={{ opacity: 0, x: -20 }} className="flex items-center justify-between bg-muted/50 rounded-xl p-3">
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <span className="text-xl">{f.avatar}</span>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-background ${f.isOnline ? "bg-green-500" : "bg-muted-foreground/40"}`}
                              title={f.isOnline ? t("friends.online", "Online") : t("friends.offline", "Offline")}
                              data-testid={`status-dot-${f.friendshipId}`}
                            />
                          </div>
                          <span className="text-sm font-bold text-foreground">{f.name}</span>
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => removeFriend(f.friendshipId)} data-testid={`button-remove-${f.friendshipId}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {outgoing.map((f) => (
                    <div key={f.friendshipId} className="flex items-center justify-between bg-muted/30 rounded-xl p-3 opacity-60">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{f.avatar}</span>
                        <span className="text-sm font-bold text-foreground">{f.name}</span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{t("friends.pending", "Pending")}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

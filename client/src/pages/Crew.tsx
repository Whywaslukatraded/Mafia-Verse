import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, UserPlus, Check, X, Trash2, Users, Shield, LogOut, Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getSupabase, isSupabaseReady } from "@/lib/supabase";
import { authFetch, authFetchJson } from "@/lib/authFetch";

// Feature: Crews (team system). Modeled directly on Friends.tsx — same
// login-check pattern, same authFetch/authFetchJson usage, same
// AnimatePresence list treatment. Unlike friends (a list of pairwise
// relationships), a crew is a single group a person either is or isn't
// in, so this page has two modes: no crew yet (create one, or see pending
// invites) vs. in a crew (member list, invite box, leave/remove/disband).
type CrewInfo = { id: number; name: string; founderId: string };
type CrewMemberEntry = { crewMemberId: number; supabaseUserId: string; name: string; avatar: string; role: string; isOnline?: boolean };
type CrewInvite = { crewMemberId: number; crewId: number; crewName: string };

export default function Crew() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [crew, setCrew] = useState<CrewInfo | null>(null);
  const [members, setMembers] = useState<CrewMemberEntry[]>([]);
  const [isFounder, setIsFounder] = useState(false);
  const [invites, setInvites] = useState<CrewInvite[]>([]);
  const [crewNameInput, setCrewNameInput] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [mySupabaseUserId, setMySupabaseUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;

    const attach = () => {
      const supabase = getSupabase();
      supabase.auth.getSession().then(({ data }: any) => {
        if (cancelled) return;
        setIsLoggedIn(!!data.session);
        setMySupabaseUserId(data.session?.user?.id || null);
        if (!data.session) setLoading(false);
      });
      // Also react to auth state resolving/changing after mount — same
      // reasoning as Friends.tsx's identical block: a one-shot getSession()
      // check right on mount can lose a race against Supabase still
      // finishing its own initial session hydration.
      const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
        if (cancelled) return;
        setIsLoggedIn(!!session);
        setMySupabaseUserId(session?.user?.id || null);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    };

    if (isSupabaseReady()) {
      attach();
    } else {
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

  const loadCrew = useCallback(async () => {
    try {
      const data = await authFetchJson<{ crew: CrewInfo | null; members: CrewMemberEntry[]; isFounder: boolean }>("/api/crews");
      setCrew(data.crew);
      setMembers(data.members);
      setIsFounder(data.isFounder);
    } catch (e: any) {
      toast({ title: t("crew.loadError", "Couldn't load your crew"), description: e.message, variant: "destructive" });
    }
  }, [t, toast]);

  const loadInvites = useCallback(async () => {
    try {
      const data = await authFetchJson<{ invites: CrewInvite[] }>("/api/crews/invites");
      setInvites(data.invites);
    } catch {
      // Non-critical — same tradeoff as Friends.tsx's loadInvites.
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn !== true) return;
    (async () => {
      setLoading(true);
      await Promise.all([loadCrew(), loadInvites()]);
      setLoading(false);
    })();
  }, [isLoggedIn, loadCrew, loadInvites]);

  // Re-fetch on the same cadence as Friends.tsx's online-status refresh, so
  // member online dots and any new invite stay current without a manual
  // reload.
  useEffect(() => {
    if (isLoggedIn !== true) return;
    const interval = setInterval(() => {
      loadCrew();
      loadInvites();
    }, 20_000);
    return () => clearInterval(interval);
  }, [isLoggedIn, loadCrew, loadInvites]);

  const createCrew = async () => {
    const name = crewNameInput.trim();
    if (!name) return;
    setCreating(true);
    try {
      await authFetchJson("/api/crews", { method: "POST", body: JSON.stringify({ name }) });
      setCrewNameInput("");
      toast({ title: t("crew.created", "Crew created") });
      await loadCrew();
    } catch (e: any) {
      toast({ title: t("crew.createFailed", "Couldn't create crew"), description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const sendInvite = async () => {
    const username = usernameInput.trim();
    if (!username) return;
    setInviting(true);
    try {
      await authFetchJson("/api/crews/invite", { method: "POST", body: JSON.stringify({ username }) });
      setUsernameInput("");
      toast({ title: t("crew.inviteSent", "Crew invite sent") });
    } catch (e: any) {
      toast({ title: t("crew.inviteFailed", "Couldn't send invite"), description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const respond = async (crewMemberId: number, accept: boolean) => {
    try {
      await authFetchJson("/api/crews/respond", { method: "POST", body: JSON.stringify({ crewMemberId, accept }) });
      await Promise.all([loadCrew(), loadInvites()]);
    } catch (e: any) {
      toast({ title: t("crew.actionFailed", "Something went wrong"), description: e.message, variant: "destructive" });
    }
  };

  const leaveCrew = async () => {
    try {
      await authFetch("/api/crews/leave", { method: "POST" });
      toast({ title: t("crew.left", "You left the crew") });
      await loadCrew();
    } catch (e: any) {
      toast({ title: t("crew.actionFailed", "Something went wrong"), description: e.message, variant: "destructive" });
    }
  };

  const removeMember = async (supabaseUserId: string) => {
    try {
      await authFetch("/api/crews/remove", { method: "POST", body: JSON.stringify({ supabaseUserId }) });
      await loadCrew();
    } catch (e: any) {
      toast({ title: t("crew.actionFailed", "Something went wrong"), description: e.message, variant: "destructive" });
    }
  };

  const disbandCrew = async () => {
    try {
      await authFetch("/api/crews/disband", { method: "POST" });
      toast({ title: t("crew.disbanded", "Crew disbanded") });
      await loadCrew();
    } catch (e: any) {
      toast({ title: t("crew.actionFailed", "Something went wrong"), description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-violet-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/profile")} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-black font-serif uppercase tracking-wider text-foreground">{t("crew.title", "Crew")}</h1>
        </div>

        {isLoggedIn === false && (
          <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-6 text-center space-y-3">
            <Users className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{t("crew.signInRequired", "Sign in to join or create a Crew.")}</p>
            <Button onClick={() => setLocation("/login")}>{t("common.signIn", "Sign In")}</Button>
          </div>
        )}

        {isLoggedIn && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading", "Loading...")}</p>
            ) : !crew ? (
              <>
                {/* Pending invites — only relevant when not already in a crew */}
                {invites.length > 0 && (
                  <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-5 space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t("crew.pendingInvites", "Crew Invites")}</h3>
                    <AnimatePresence>
                      {invites.map((inv) => (
                        <motion.div key={inv.crewMemberId} exit={{ opacity: 0, x: -20 }} className="flex items-center justify-between bg-muted/50 rounded-xl p-3">
                          <span className="text-sm font-bold text-foreground">{inv.crewName}</span>
                          <div className="flex gap-2">
                            <Button size="icon" variant="outline" className="h-8 w-8 text-green-500" onClick={() => respond(inv.crewMemberId, true)} data-testid={`button-accept-crew-${inv.crewMemberId}`}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="outline" className="h-8 w-8 text-red-500" onClick={() => respond(inv.crewMemberId, false)} data-testid={`button-decline-crew-${inv.crewMemberId}`}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {/* Create a crew */}
                <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-5">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">{t("crew.createCrew", "Create a Crew")}</h3>
                  <p className="text-sm text-muted-foreground italic mb-3">{t("crew.noCrewYet", "You're not in a crew yet. Start one, or accept an invite above.")}</p>
                  <div className="flex gap-2">
                    <Input
                      value={crewNameInput}
                      onChange={(e) => setCrewNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") createCrew(); }}
                      placeholder={t("crew.crewNamePlaceholder", "Crew name")}
                      maxLength={30}
                      data-testid="input-crew-name"
                    />
                    <Button onClick={createCrew} disabled={creating || !crewNameInput.trim()} data-testid="button-create-crew">
                      <Flag className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Crew header + invite box */}
                <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-5">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">{t("crew.yourCrew", "Your Crew")}</h3>
                  <p className="text-xl font-black font-serif text-foreground mb-3">{crew.name}</p>
                  <div className="flex gap-2">
                    <Input
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") sendInvite(); }}
                      placeholder={t("crew.usernamePlaceholder", "Their account username (not their in-game name)")}
                      data-testid="input-crew-invite-username"
                    />
                    <Button onClick={sendInvite} disabled={inviting || !usernameInput.trim()} data-testid="button-send-crew-invite">
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Member list */}
                <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-2xl p-5 space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t("crew.members", "Members")} ({members.length})</h3>
                  <AnimatePresence>
                    {members.map((m) => (
                      <motion.div key={m.crewMemberId} exit={{ opacity: 0, x: -20 }} className="flex items-center justify-between bg-muted/50 rounded-xl p-3">
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <span className="text-xl">{m.avatar}</span>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-background ${m.isOnline ? "bg-green-500" : "bg-muted-foreground/40"}`}
                              title={m.isOnline ? t("crew.online", "Online") : t("crew.offline", "Offline")}
                              data-testid={`status-dot-crew-${m.crewMemberId}`}
                            />
                          </div>
                          <span className="text-sm font-bold text-foreground">{m.name}</span>
                          {m.role === "founder" && (
                            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-yellow-400 font-bold">
                              <Shield className="w-3 h-3" /> {t("crew.founder", "Founder")}
                            </span>
                          )}
                        </div>
                        {isFounder && m.supabaseUserId !== mySupabaseUserId && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => removeMember(m.supabaseUserId)} data-testid={`button-remove-crew-member-${m.crewMemberId}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Leave / disband */}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2" onClick={leaveCrew} data-testid="button-leave-crew">
                    <LogOut className="w-4 h-4" /> {t("crew.leave", "Leave Crew")}
                  </Button>
                  {isFounder && (
                    <Button variant="outline" className="flex-1 gap-2 text-red-500 hover:text-red-500" onClick={disbandCrew} data-testid="button-disband-crew">
                      <Trash2 className="w-4 h-4" /> {t("crew.disband", "Disband")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

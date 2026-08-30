import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, History, User, Skull, Shield, Search, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { authFetchJson } from "@/lib/authFetch";

// Feature: Game history + share. This is the page a shared /recap/:shareId
// link opens — deliberately public (no sign-in check, no room/session
// context) since the whole point is that anyone with the link, including
// someone who was never in the match, can open it from Discord/WhatsApp/etc.
// Renders from a single fetched GameRecap row rather than a live player's
// gameHistory (which is what Room.tsx's own end-screen and Game Chronicle
// read from) — those two data sources are intentionally separate, see the
// comment on the game_recaps table in schema.ts.
type RecapRoleEntry = { id: number; name: string; role: string | null; avatar: string | null; isAlive: boolean };
type Recap = {
  shareId: string;
  roomCode: string;
  roomName: string | null;
  winner: "civilians" | "mafia" | "jester";
  roles: RecapRoleEntry[];
  chronicle: any[];
  crowdFavorite: { name: string } | null;
  mvp: { id: number; name: string; avatar: string | null; role: string | null } | null;
  endedAt: string;
};

export default function RecapView() {
  const { t } = useTranslation();
  const [, params] = useRoute("/recap/:shareId");
  const [, setLocation] = useLocation();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!params?.shareId) return;
    (async () => {
      try {
        const data = await authFetchJson<{ recap: Recap }>(`/api/recaps/${params.shareId}`);
        setRecap(data.recap);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [params?.shareId]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">{t("common.loading", "Loading...")}</div>;
  }

  if (notFound || !recap) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-center px-4">
        <div className="space-y-4">
          <div className="text-6xl">🕯️</div>
          <p className="text-xl font-black text-foreground">{t("history.recapNotFound", "This recap couldn't be found.")}</p>
          <Button onClick={() => setLocation("/")}><RotateCcw className="w-4 h-4 mr-2" />{t("common.backToHome", "Back to Home")}</Button>
        </div>
      </div>
    );
  }

  const jesterWon = recap.winner === "jester";
  const mafiaWon = !jesterWon && recap.winner === "mafia";
  const jesterName = jesterWon ? recap.roles.find((r) => r.role === "jester")?.name : undefined;
  const aliveMafiaAtEnd = recap.roles.filter((r) => r.role === "mafia" && r.isAlive).length;

  // Feature: Detective's Report — same shape as Room.tsx's version, shown
  // to everyone viewing this public recap since it's historical fact by
  // this point, not a private insight tied to who's looking at it.
  const detectivePlayer = recap.roles.find((r) => r.role === "detective");
  const detectiveChecks: { turn: number; target: string; isMafia: boolean }[] = detectivePlayer
    ? recap.chronicle
        .filter((entry: any) => entry?.type === "night" && entry.events)
        .flatMap((entry: any) => entry.events
          .filter((ev: any) => ev.type === "detective_check")
          .map((ev: any) => ({ turn: entry.turn, target: ev.target, isMafia: !!ev.isMafia })))
    : [];

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="mb-4 rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <div className="text-center mb-8">
          <div className={`text-4xl sm:text-6xl font-black mb-2 break-words ${jesterWon ? "text-pink-400" : mafiaWon ? "text-red-500" : "text-green-500"}`}>
            {jesterWon ? `🃏 ${t("room.jesterLabel")}` : mafiaWon ? `🔴 ${t("room.mafiaLabel")}` : `✨ ${t("room.civiliansLabel")}`}
          </div>
          <div className="text-2xl sm:text-3xl font-black mb-3 text-foreground">{t("room.wins")}</div>
          <div className="text-muted-foreground text-sm font-semibold">
            {recap.roomName || recap.roomCode} · {new Date(recap.endedAt).toLocaleDateString()}
          </div>
          <div className="mt-3 text-muted-foreground text-base">
            {jesterWon
              ? t("room.jesterWonDescription", { name: jesterName || t("chat.someone") })
              : mafiaWon
              ? t("room.mafiaWonDescription", { count: aliveMafiaAtEnd })
              : t("room.civiliansWonDescription")}
          </div>
          {recap.crowdFavorite && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-pink-500/30 bg-pink-500/10 px-4 py-2 text-sm font-bold text-pink-400">
              🌟 {t("room.crowdFavoriteResult", "Crowd Favorite: {{name}}", { name: recap.crowdFavorite.name })}
            </div>
          )}
          {recap.mvp && (
            <div className="mt-4 ml-2 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm font-bold text-yellow-400">
              🏆 {t("room.mvpResult", "MVP: {{name}}", { name: recap.mvp.name })}
            </div>
          )}
        </div>

        <div className="bg-muted/50 border border-border rounded-lg p-6 mb-6">
          <h3 className="text-foreground font-black mb-4 uppercase tracking-wider text-sm">{t("room.finalRolesRevealed")}</h3>
          <div className="grid grid-cols-2 gap-3">
            {recap.roles.map((p) => (
              <div key={p.id} className={`relative flex items-center gap-2 p-2 rounded-lg ${p.isAlive ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
                {recap.mvp?.id === p.id && (
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

        {detectivePlayer && detectiveChecks.length > 0 && (
          <Card className="bg-card border-border mb-6">
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

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-serif">
              <History className="w-5 h-5 text-primary" />
              {t("room.gameChronicle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-6">
                {recap.chronicle?.map((entry: any, i: number) => (
                  <div key={i} className="space-y-3 p-4 bg-card/80 rounded-xl border border-border">
                    {entry.type === "game_end" ? (
                      <>
                        <h4 className="text-sm font-black uppercase tracking-widest text-yellow-400">
                          🎮 {t("room.gameEnded")} - {entry.winner === "jester" ? `🃏 ${t("room.jesterWinsExclaim")}` : entry.winner === "mafia" ? `🔴 ${t("room.mafiaWinsExclaim")}` : `✨ ${t("room.civiliansWinExclaim")}`}
                        </h4>
                      </>
                    ) : (
                      <>
                        <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                          {entry.type === "night" ? t("room.nightN", { turn: entry.turn }) : t("room.dayN", { turn: entry.turn })}
                        </h4>
                        <div className="space-y-2">
                          {entry.type === "vote" ? (
                            <>
                              {entry.results?.map((res: any, j: number) => (
                                <div key={j} className="text-sm flex items-center gap-2">
                                  <User className="w-3 h-3 text-blue-400" />
                                  <span className="font-bold text-foreground">{res.voterName}</span>
                                  <span className="text-muted-foreground italic">{t("room.votedFor")}</span>
                                  <span className="font-bold text-red-400">{res.targetName}</span>
                                </div>
                              ))}
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
      </div>
    </div>
  );
}

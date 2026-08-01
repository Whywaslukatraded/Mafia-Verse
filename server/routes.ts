import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { WS_EVENTS, type GameState, type GameAction, type Player, type Message, userMfa, users, MAX_PLAYERS_PER_ROOM } from "@shared/schema";
import { db, pool } from "./db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID, pbkdf2Sync, randomBytes } from "crypto";
import { sendEmail, generateSixDigitCode, build2FAEmailHtml } from "./emailService";
import rateLimit from "express-rate-limit";

// Room creation: no more than 10 rooms per IP every 10 minutes — enough for
// normal use (replays, multiple friend groups) but stops one person from
// scripting hundreds of rooms.
const roomCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many rooms created from this network. Please wait a few minutes and try again." },
});

// 2FA code verification: a 6-digit code only has 1,000,000 possibilities, so
// this needs to be tight — 5 attempts per 15 minutes per IP.
const twoFaVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification attempts. Please wait 15 minutes and try again." },
});

// Login (password + the 2FA-gated login step): also brute-forceable, same treatment.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please wait 15 minutes and try again." },
});

// Password hashing helpers
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, hash: string): boolean {
  const [salt, storedHash] = hash.split(':');
  const testHash = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return testHash === storedHash;
}

// Game Logic Helpers
// Canonical night phase order. A phase is only entered if at least one
// living player actually holds that role — otherwise it's skipped, so a
// game with no Doctor never shows/waits on a "Doctor" timer, etc.
const NIGHT_ROLE_ORDER = ["bodyguard", "mafia", "vigilante", "doctor", "detective"] as const;

// Some rooms can have more than one Mafia, Doctor, Detective, Bodyguard, or
// Vigilante. Previously, the phase advanced the instant the FIRST player with
// that role acted — leaving any other teammate's UI stuck "waiting" forever
// once the phase had already moved on underneath them (looked like a freeze).
// Now we only advance once every living holder of that role has acted.
function haveAllRoleHoldersActed(players: Player[], role: string, actionMap: Map<number, number>): boolean {
  const actors = players.filter((p) => p.role === role && p.isAlive);
  return actors.length > 0 && actors.every((p) => actionMap.has(p.id));
}

function getFirstNightPhase(players: Player[]): string {
  for (const role of NIGHT_ROLE_ORDER) {
    if (players.some((p) => p.role === role && p.isAlive)) return role;
  }
  return "mafia"; // mafiaCount >= 1 is enforced at settings time, so this is unreachable in practice
}

// Returns the next night phase after `currentPhase` that has a living role
// holder, or null if there are no more night roles left to act — meaning
// the night is over and it's time to resolve/advance to Day.
function getNextNightPhase(currentPhase: string, players: Player[]): string | null {
  const idx = NIGHT_ROLE_ORDER.indexOf(currentPhase as any);
  for (let i = idx + 1; i < NIGHT_ROLE_ORDER.length; i++) {
    const role = NIGHT_ROLE_ORDER[i];
    if (players.some((p) => p.role === role && p.isAlive)) return role;
  }
  return null;
}

function getNightPhaseDuration(phase: string, settings: any): number {
  const map: Record<string, number> = {
    bodyguard: settings.bodyguardDuration,
    mafia: settings.mafiaDuration,
    vigilante: settings.vigilanteDuration,
    doctor: settings.doctorDuration,
    detective: settings.detectiveDuration,
  };
  return (map[phase] ? map[phase] * 1000 : 0) || 15000;
}

function assignRoles(players: Player[], settings: any) {
  const roles: string[] = [];
  for (let i = 0; i < settings.mafiaCount; i++) roles.push("mafia");
  for (let i = 0; i < settings.detectiveCount; i++) roles.push("detective");
  for (let i = 0; i < settings.doctorCount; i++) roles.push("doctor");
  for (let i = 0; i < (settings.bodyguardCount || 0); i++) roles.push("bodyguard");
  for (let i = 0; i < (settings.vigilanteCount || 0); i++) roles.push("vigilante");
  for (let i = 0; i < (settings.mayorCount || 0); i++) roles.push("mayor");
  for (let i = 0; i < (settings.jesterCount || 0); i++) roles.push("jester");
  while (roles.length < players.length) roles.push("civilian");

  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  return players.map((p, i) => ({ ...p, role: roles[i] }));
}

// Builds "X was voted out/killed. They were {article} {role}." with the right
// article/language. "the" (definite) only when this game has exactly one
// player with that role; otherwise "a"/"an" (indefinite), since e.g. "the
// civilian" is wrong when several players are civilians.
function buildRoleRevealSentence(victimName: string, role: string, allPlayers: Player[], lang: string, action: "voted" | "killed" = "voted"): string {
  const roleCount = allPlayers.filter(p => p.role === role).length;
  const isUnique = roleCount <= 1;

  if (lang === "es") {
    const esRole: Record<string, string> = { mafia: "mafioso", detective: "detective", doctor: "médico", civilian: "civil", bodyguard: "guardaespaldas", vigilante: "vigilante", mayor: "alcalde", jester: "bufón" };
    const name = esRole[role] || role;
    const article = isUnique ? "el" : "un";
    const verb = action === "killed" ? "fue asesinado" : "fue eliminado por votación";
    return `${victimName} ${verb}. Era ${article} ${name}.`;
  }

  const enRole: Record<string, string> = { mafia: "mafia", detective: "detective", doctor: "doctor", civilian: "civilian", bodyguard: "bodyguard", vigilante: "vigilante", mayor: "mayor", jester: "jester" };
  const name = enRole[role] || role;
  const article = isUnique ? "the" : (/^[aeiou]/i.test(name) ? "an" : "a");
  const verb = action === "killed" ? "was killed" : "was voted out";
  return `${victimName} ${verb}. They were ${article} ${name}.`;
}

const gameHistory = new Map<number, any[]>();

// Per-game activity, used only to gate referral payouts (see "Referral
// fraud prevention" below). Cleared in finalizeGameEnd alongside gameActions.
const gameActivity = new Map<number, Map<number, { messages: number; votes: number }>>();
function bumpActivity(roomId: number, playerId: number, field: "messages" | "votes") {
  if (!gameActivity.has(roomId)) gameActivity.set(roomId, new Map());
  const roomMap = gameActivity.get(roomId)!;
  if (!roomMap.has(playerId)) roomMap.set(playerId, { messages: 0, votes: 0 });
  roomMap.get(playerId)![field]++;
}

// Distinct reporters per (room, target) this game. 2+ different reporters in
// the same game counts as one confirmed AFK incident on that account.
const afkReports = new Map<number, Map<number, Set<number>>>();

// New-role state (Vigilante/Mayor/Bodyguard), all per-room, reset when a
// fresh game starts and cleared when it ends.
const vigilanteBullets = new Map<number, Map<number, number>>();       // roomId -> playerId -> bullets left (starts at 2)
const mayorRevealed = new Map<number, Set<number>>();                  // roomId -> set of playerIds who've revealed
const vigilanteGuiltPending = new Map<number, number>();               // roomId -> vigilante playerId who must die from guilt next night

// Small dictionary for the recurring system/chat messages that aren't part
// of the bot dialogue pools (game-end announcements, night summary, etc.)
const SYSTEM_MESSAGES: Record<string, { en: string; es: string }> = {
  votingResultsHeader: { en: "Voting Results: ", es: "Resultados de la votación: " },
  votedForLine: { en: "{voter} voted for {target}. ", es: "{voter} votó por {target}. " },
  noOneVotedOut: { en: "No one was voted out today.", es: "Nadie fue eliminado por votación hoy." },
  mafiaEliminatedCiviliansWin: { en: "The Mafia has been eliminated! Civilians win!", es: "¡La mafia ha sido eliminada! ¡Ganan los civiles!" },
  mafiaTookOverMafiaWins: { en: "The Mafia has taken over! Mafia wins!", es: "¡La mafia ha tomado el control! ¡Gana la mafia!" },
  detectiveDiscoveredMafia: { en: "The detective discovered the Mafia! {name} was the killer. Civilians win!", es: "¡El detective descubrió a la mafia! {name} era el asesino. ¡Ganan los civiles!" },
  mafiaFailedDoctorSaved: { en: "The mafia tried to kill someone, but the doctor saved them!", es: "La mafia intentó matar a alguien, ¡pero el médico lo salvó!" },
  nothingHappenedNight: { en: "Nothing happened during the night.", es: "No pasó nada durante la noche." },
  nightHasEnded: { en: "The night has ended. ", es: "La noche ha terminado. " },
  bodyguardDied: { en: "{name} threw themselves in front of an attack protecting someone — and died a hero. ", es: "{name} se interpuso en un ataque para proteger a alguien y murió como un héroe. " },
  attackerRetaliated: { en: "The attacker didn't survive the counterattack. ", es: "El atacante no sobrevivió al contraataque. " },
  vigilanteGuiltDied: { en: "{name} couldn't live with shooting an innocent person and died of guilt.", es: "{name} no pudo vivir con haber disparado a un inocente y murió de culpa." },
  jesterWinsTitle: { en: "The Jester Wins!", es: "¡El bufón gana!" },
  jesterWinsBody: { en: "{name} wanted to be voted out, and it worked! The Jester wins on their own — the game continues for everyone else.", es: "¡{name} quería ser eliminado por votación, y funcionó! El bufón gana por su cuenta — el juego continúa para los demás." },
  mayorRevealedTitle: { en: "The Mayor Has Revealed!", es: "¡El alcalde se ha revelado!" },
  mayorRevealedBody: { en: "{name} publicly revealed as the Mayor! Their vote now counts double — but they can no longer be healed or protected.", es: "¡{name} se reveló públicamente como el alcalde! Su voto ahora cuenta doble, pero ya no puede ser curado ni protegido." },
  cannotTargetRevealedMayor: { en: "The Mayor has revealed and can no longer be healed or protected.", es: "El alcalde se ha revelado y ya no puede ser curado ni protegido." },
  noBulletsLeft: { en: "You're out of bullets.", es: "Te quedaste sin balas." },
  targetLockedTitle: { en: "Target Locked", es: "Objetivo bloqueado" },
  targetLockedBody: { en: "You have targeted {name} for elimination.", es: "Has marcado a {name} para la eliminación." },
  chatErrorTitle: { en: "Error", es: "Error" },
  chatErrorBody: { en: "Failed to send message", es: "No se pudo enviar el mensaje" },
  deadCantSpeakTitle: { en: "🪦 Silence from Beyond", es: "🪦 Silencio desde el más allá" },
  deadCantSpeakBody: { en: "The dead cannot speak and risk snitching...", es: "Los muertos no pueden hablar ni arriesgarse a delatar..." },
  voteRegisteredTitle: { en: "Vote Registered", es: "Voto registrado" },
  voteRegisteredBody: { en: "Your vote has been recorded.", es: "Tu voto ha sido registrado." },
  protectionAppliedTitle: { en: "Protection Applied", es: "Protección aplicada" },
  protectionAppliedBody: { en: "You are protecting {name} tonight.", es: "Estás protegiendo a {name} esta noche." },
};

function sysMsg(key: keyof typeof SYSTEM_MESSAGES, lang: string, vars?: Record<string, string>): string {
  const entry = SYSTEM_MESSAGES[key];
  let text = lang === "es" ? entry.es : entry.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(v);
  }
  return text;
}

// Matches common.systemName in en.json/es.json — the display name shown on
// system chat messages (deaths, vote results, etc.), localized per room.
function sysName(lang: string | undefined): string {
  return lang === "es" ? "Sistema" : "System";
}


const DEATH_STORIES = [
  "{name} was found floating in the harbor, wearing concrete shoes that definitely weren't fashionable.",
  "{name} answered a knock at the door and never came back to finish dinner.",
  "A black sedan pulled up beside {name}'s car, and only one drove away.",
  "{name} was caught skimming from the family's books — the accountant's job is a dangerous one.",
  "Someone left a message for {name} inside a fish wrapped in newspaper. It was not a good sign.",
  "{name} took one too many meetings in dark alleys and didn't walk out of the last one.",
  "The last anyone heard from {name} was a gunshot echoing from the warehouse district.",
  "{name} tried to double-cross the wrong crew and paid the family's oldest toll.",
  "A single rose was left where {name} used to sit. Nobody asked who sent it.",
  "{name} was last seen getting into a car that wasn't theirs, and never seen again.",
  "The docks were quiet that night — quiet enough to hide what happened to {name}.",
  "{name} talked to the wrong reporter, and the family doesn't tolerate loose lips.",
  "Somebody tampered with {name}'s brakes on the old bridge road.",
  "{name} was found slumped in a back booth, their coffee gone cold beside them.",
  "The family's enforcer paid {name} a visit, and only one of them left the room.",
  "{name} tried to skip town with the family's money. The family has a long memory.",
  "A single bullet, a quiet street, and {name} never made it home.",
  "{name} was seen arguing with a stranger in a long coat. Neither was seen again — except one.",
  "The safe was empty, and so was the chair where {name} used to sit.",
  "{name} made a call that should have stayed private. Someone was listening.",
  "A car with no plates idled outside {name}'s apartment all night. By morning, it was gone — and so was {name}.",
  "{name} was found in the trunk of their own car, parked exactly where they'd left it.",
  "Somebody slipped something into {name}'s drink at the speakeasy. It wasn't a compliment.",
  "{name} owed the wrong people money, and interest rates in this town are lethal.",
  "The last text from {name} just said 'meet me at the pier.' They never showed up to send another.",
  "{name} was caught wearing a wire. The tailor never finished the job.",
  "A single candle burned in {name}'s window that night. By dawn, it had gone out for good.",
  "{name} tried to walk away from the family business. Nobody walks away.",
  "The bartender swears {name} left through the back door. Nobody's seen them use it since.",
  "{name} was found with a deck of cards scattered around them — someone folded their hand permanently.",
  "A note in {name}'s coat pocket simply read: 'You knew too much.'",
  "{name} met with a rival family to broker peace. It didn't take.",
  "Somebody rigged {name}'s elevator to stop between floors — permanently.",
  "{name} was the only one who knew where the bodies were buried. Now they're one of them.",
  "The family's tailor measured {name} for a suit they'd never wear.",
  "{name} bet against the house one too many times, and the house always collects.",
  "A single set of footprints led away from where {name} was last seen. Only one set.",
  "{name} was caught red-handed skimming the till, and the family doesn't do second chances.",
  "The last thing {name} heard was a car door slamming shut behind them.",
  "{name} tried to bluff their way out of a debt they couldn't pay.",
  "Someone left {name}'s watch on the boss's desk. {name} wasn't wearing it anymore.",
  "{name} vanished somewhere between the club and the parking garage.",
  "A single shot rang out near the old distillery, and {name} never called home again.",
  "{name} trusted the wrong lieutenant, and lieutenants talk when the price is right.",
  "The family found out {name} was working both sides of the street.",
  "{name}'s chair at the poker table stayed empty for the rest of the night — permanently.",
  "Somebody left the porch light off for {name}. They never made it up the steps.",
  "{name} made one deal too many with a rival crew, and the family doesn't forgive that.",
  "A phone rang three times in an empty office — right after {name} stopped answering.",
  "{name} thought they could disappear into the crowd. The family found them anyway."
];

const DEATH_STORIES_ES = [
  "Encontraron a {name} flotando en el puerto, con unos zapatos de cemento que definitivamente no estaban de moda.",
  "{name} atendió a alguien que tocó la puerta y nunca volvió a terminar la cena.",
  "Un sedán negro se detuvo junto al auto de {name}, y solo uno se fue manejando.",
  "Descubrieron que {name} desviaba dinero de los libros de la familia — el trabajo de contador es peligroso.",
  "Alguien dejó un mensaje para {name} dentro de un pescado envuelto en periódico. No era buena señal.",
  "{name} tuvo demasiadas reuniones en callejones oscuros y no salió caminando de la última.",
  "Lo último que se supo de {name} fue un disparo que resonó en la zona de los almacenes.",
  "{name} intentó traicionar a la banda equivocada y pagó el peaje más antiguo de la familia.",
  "Dejaron una sola rosa donde solía sentarse {name}. Nadie preguntó quién la envió.",
  "Vieron a {name} subirse a un auto que no era suyo, y nunca más lo volvieron a ver.",
  "El muelle estaba tranquilo esa noche — lo bastante tranquilo para ocultar lo que le pasó a {name}.",
  "{name} habló con el periodista equivocado, y la familia no tolera las bocas sueltas.",
  "Alguien manipuló los frenos de {name} en el viejo camino del puente.",
  "Encontraron a {name} desplomado en una mesa del fondo, con el café ya frío a su lado.",
  "El ejecutor de la familia le hizo una visita a {name}, y solo uno de los dos salió del cuarto.",
  "{name} intentó huir del pueblo con el dinero de la familia. La familia tiene buena memoria.",
  "Una sola bala, una calle silenciosa, y {name} nunca llegó a casa.",
  "Vieron a {name} discutiendo con un desconocido de abrigo largo. Ninguno volvió a aparecer — excepto uno.",
  "La caja fuerte estaba vacía, igual que la silla donde solía sentarse {name}.",
  "{name} hizo una llamada que debió mantenerse en privado. Alguien estaba escuchando.",
  "Un auto sin placas se quedó toda la noche frente al edificio de {name}. Al amanecer, había desaparecido — y {name} también.",
  "Encontraron a {name} en la cajuela de su propio auto, estacionado justo donde lo había dejado.",
  "Alguien le puso algo a la bebida de {name} en el bar clandestino. No era un cumplido.",
  "{name} le debía dinero a la gente equivocada, y en este pueblo los intereses se cobran caro.",
  "El último mensaje de {name} solo decía: 'nos vemos en el muelle'. Nunca llegó a mandar otro.",
  "Descubrieron que {name} llevaba un micrófono escondido. El sastre nunca terminó el traje.",
  "Esa noche ardía una sola vela en la ventana de {name}. Al amanecer, se había apagado para siempre.",
  "{name} intentó alejarse del negocio familiar. Nadie se aleja.",
  "El bartender jura que {name} salió por la puerta trasera. Nadie la ha vuelto a usar desde entonces.",
  "Encontraron a {name} rodeado de cartas de una baraja esparcidas — alguien retiró su mano para siempre.",
  "Una nota en el bolsillo del abrigo de {name} decía simplemente: 'Sabías demasiado'.",
  "{name} se reunió con una familia rival para negociar la paz. No funcionó.",
  "Alguien saboteó el elevador de {name} para que se detuviera entre pisos — para siempre.",
  "{name} era el único que sabía dónde estaban enterrados los cuerpos. Ahora es uno de ellos.",
  "El sastre de la familia le tomó las medidas a {name} para un traje que nunca usaría.",
  "{name} apostó contra la casa demasiadas veces, y la casa siempre cobra.",
  "Un solo rastro de huellas se alejaba del lugar donde vieron por última vez a {name}. Solo un rastro.",
  "Atraparon a {name} con las manos en la caja, y la familia no da segundas oportunidades.",
  "Lo último que escuchó {name} fue la puerta de un auto cerrándose detrás de él.",
  "{name} intentó salir con un farol de una deuda que no podía pagar.",
  "Alguien dejó el reloj de {name} sobre el escritorio del jefe. {name} ya no lo llevaba puesto.",
  "{name} desapareció en algún punto entre el club y el estacionamiento.",
  "Un solo disparo resonó cerca de la vieja destilería, y {name} nunca volvió a llamar a casa.",
  "{name} confió en el teniente equivocado, y los tenientes hablan cuando el precio es bueno.",
  "La familia descubrió que {name} trabajaba para los dos lados.",
  "La silla de {name} en la mesa de póker quedó vacía el resto de la noche — para siempre.",
  "Alguien dejó apagada la luz del porche para {name}. Nunca llegó a subir los escalones.",
  "{name} hizo un trato de más con una banda rival, y la familia no perdona eso.",
  "Un teléfono sonó tres veces en una oficina vacía — justo después de que {name} dejara de contestar.",
  "{name} pensó que podía perderse entre la multitud. La familia lo encontró de todas formas."
];

function getRandomDeathStory(name: string, lang: string = "en") {
  const pool = lang === "es" ? DEATH_STORIES_ES : DEATH_STORIES;
  const story = pool[Math.floor(Math.random() * pool.length)];
  return story.replace("{name}", name);
}

const phaseTimers = new Map<number, NodeJS.Timeout>();
const PHASE_DURATION = 15000;
// Must match the setTimeout duration of the role-reveal overlay in client/src/pages/Room.tsx
const ROLE_REVEAL_MS = 5000;
// Must match the setTimeout duration of the elimination overlay in client/src/pages/Room.tsx
const ELIMINATION_REVEAL_MS = 5000;
const BOT_NAMES = ["Bot_Alpha", "Bot_Beta", "Bot_Gamma", "Bot_Delta", "Bot_Epsilon", "Bot_Zeta", "Bot_Eta", "Bot_Theta"];

const BOT_AVATARS = ["🤖", "👾", "👻", "🧟", "🧛", "👽", "🦊", "🐻"];

const MAX_BOTS_PER_ROOM = 5;
const MAX_SPECIAL_ROLES = 10;

async function fillWithBots(roomId: number, storage: any): Promise<{ added: number; cappedAtMax: boolean }> {
  const players = await storage.getPlayersInRoom(roomId);
  const existingBots = players.filter((p: Player) => p.isBot).length;
  if (players.length >= 6 || existingBots >= MAX_BOTS_PER_ROOM) {
    return { added: 0, cappedAtMax: existingBots >= MAX_BOTS_PER_ROOM };
  }

  const botsWantedForMin = 6 - players.length;
  const botsRoomForMore = MAX_BOTS_PER_ROOM - existingBots;
  const botsNeeded = Math.min(botsWantedForMin, botsRoomForMore);
  for (let i = 0; i < botsNeeded; i++) {
    await storage.createPlayer({
      roomId,
      name: BOT_NAMES[i % BOT_NAMES.length] + "_" + Math.floor(Math.random() * 1000),
      avatar: BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)],
      avatarConfig: {},
      role: null,
      isAlive: true,
      isHost: false,
      sessionId: "bot-" + randomUUID(),
      isSpectator: false,
      isBot: true,
      wins: 0,
      gamesPlayed: 0,
      achievements: [],
      gameHistory: []
    });
  }
  return { added: botsNeeded, cappedAtMax: botsNeeded < botsWantedForMin };
}

// Tracks each bot's last message so they never repeat themselves back-to-back
const botLastMessage = new Map<number, string>();

// Pulls a short, natural-looking snippet of the player's own words so the bot
// can quote it back — this is what actually sells "the bot is listening",
// far more than picking the right category ever does on its own.
function extractSnippet(original: string): string {
  let s = original.trim().replace(/\s+/g, " ");
  if (s.length > 45) {
    const words = s.split(" ").slice(0, 7);
    s = words.join(" ");
  }
  s = s.replace(/[.?!,]+$/, "");
  return s;
}

const ECHO_PREFIXES_EN = [
  '"{snippet}"? Interesting take.',
  'You said "{snippet}" — noted.',
  'Wait, "{snippet}"? Let\'s unpack that.',
  'Hold on — "{snippet}" is a bold thing to say right now.',
  'So your take is "{snippet}"? Okay.',
];

const ECHO_PREFIXES_ES = [
  '¿"{snippet}"? Interesante.',
  'Dijiste "{snippet}" — anotado.',
  'Espera, ¿"{snippet}"? Analicemos eso.',
  'Un momento — "{snippet}" es algo arriesgado de decir ahora mismo.',
  '¿Entonces tu idea es "{snippet}"? Está bien.',
];

function pickUnique(arr: string[], botId: number): string {
  if (arr.length <= 1) return arr[0] || "";
  const last = botLastMessage.get(botId);
  let choice = arr[Math.floor(Math.random() * arr.length)];
  let attempts = 0;
  while (choice === last && attempts < 5) {
    choice = arr[Math.floor(Math.random() * arr.length)];
    attempts++;
  }
  botLastMessage.set(botId, choice);
  return choice;
}

const GRAVEYARD_BOT_LINES_EN = [
  "well that was fast 💀",
  "RIP me, gg",
  "who got me??",
  "this is boring, I can see everyone's role now 👀",
  "can't believe I died N1",
  "at least the popcorn's good down here",
  "anyone else bored down here?",
  "ooh this vote is about to be spicy",
  "wish I could tell you all who the mafia is",
  "typing from the great beyond",
];
const GRAVEYARD_BOT_LINES_ES = [
  "vaya, qué rápido 💀",
  "descanse en paz, gg",
  "¿quién me eliminó?",
  "qué aburrido, ahora veo todos los roles 👀",
  "no puedo creer que morí la noche 1",
  "al menos las palomitas están buenas aquí",
  "¿alguien más aburrido aquí abajo?",
  "esta votación se va a poner interesante",
  "ojalá pudiera decirles quién es la mafia",
  "escribiendo desde el más allá",
];

const BOT_MESSAGES_EN = {
  general: [
    "I watched everyone last night. Someone's story doesn't line up.",
    "I've played enough rounds to know when someone's faking calm.",
    "Why is the room so quiet? Guilty people stay quiet.",
    "Call me paranoid but I always check alibis twice.",
    "If I die tonight, check the person who just changed the subject.",
    "I've been taking notes. Three people changed their story.",
    "The silence is louder than any accusation right now.",
    "Someone here is way too good at deflecting. That's a red flag.",
    "I'm watching how fast people type when cornered.",
    "Last round I trusted the wrong person. Never again.",
  ],
  accusation: [
    "I watched {name} carefully. Their reaction time was suspicious.",
    "{name} only speaks up when the pressure is on someone else. Classic deflection.",
    "Has anyone noticed {name} never votes first? They always wait to see where the wind blows.",
    "{name} said they were a civilian but their logic sounds like mafia covering tracks.",
    "I asked {name} a direct question and they answered with another question. Fishy.",
    "{name} went from silent to extremely defensive in two messages. Overcompensating?",
    "If you eliminate {name} and they're civilian, I'll take the blame. But I don't think so.",
    "{name} keeps saying 'trust me' — people who demand trust usually don't deserve it.",
    "I've played against {name} before. They use the same excuses every time they're mafia.",
    "{name} contradicted themselves between round one and now. Dead giveaway.",
  ],
  defense: [
    "I've been completely transparent since round one. Check my messages.",
    "Why would I risk drawing this much attention if I were mafia? Think about it.",
    "I voted to eliminate a bot last round. Why would mafia waste a vote on a bot?",
    "My story hasn't changed once. Can the accuser say the same?",
    "If I were mafia, I'd be much quieter. I'm arguing because I'm innocent and frustrated.",
    "Watch who benefits if you vote me out. That's the real mafia.",
    "I literally suggested a strategy that hurt mafia last round. Use your brain.",
    "Eliminate me and you'll lose a civilian. Then the mafia wins faster.",
    "I've been trying to coordinate the whole team. Does that sound like mafia behavior?",
    "The person accusing me hasn't offered a single piece of evidence. Just vibes.",
  ],
  agreement: [
    "Solid read. I was thinking the same thing but couldn't articulate it.",
    "That analysis is airtight. I'm locking in behind this.",
    "You just connected dots I missed. That's good detective work.",
    "I'm convinced. Let's vote and move to the next round.",
    "Finally someone speaking with logic instead of panic.",
    "Your reasoning is sound. I'll adjust my theory accordingly.",
  ],
  suspicion: [
    "Something feels manufactured about this discussion. Like it's being steered.",
    "Two people are pushing the same narrative from different angles. Coordinated?",
    "The mafia is definitely reading this chat. Watch for who stays invisible.",
    "I don't like how quickly the conversation moved away from the night results.",
    "Someone here is playing us like a fiddle. We need to wake up.",
    "The quietest player is often the most dangerous. Remember that.",
    "Every round the mafia survives, they get bolder. We need to strike now.",
    "I've seen this pattern before — fake confidence, redirect, eliminate a civilian.",
  ],
  response: [
    "Interesting angle, but you're missing the night-phase timeline.",
    "That would make sense if we had more players alive. Right now it's too risky.",
    "I see your point but the data doesn't support that conclusion.",
    "You might be right, but can you explain why the doctor didn't heal them?",
    "That's one interpretation. Here's another: what if the mafia wanted us to think that?",
    "Your theory relies on too many assumptions. Let's stick to what we know.",
    "I respect the take but I've been watching different signals.",
    "Convincing argument, but I've been burned by similar logic before. Cautious yes.",
    "You almost had me, but {name} actually has a solid alibi from round one.",
    "Partial credit — your first half is right, second half needs more proof.",
  ],
  nightMafia: [
    "Who do we take out? The loud one or the smart one?",
    "Let's hit the player asking too many questions. They're dangerous.",
    "If we eliminate {name}, the civilians lose their best analyst.",
    "Split the vote if we have to, but let's not leave evidence.",
    "The doctor might be watching. Pick someone unexpected.",
  ],
  nightDoctor: [
    "I have a feeling about tonight. Someone's going to need this save.",
    "Who's been the most helpful? That's who the mafia wants dead.",
    "My gut says protect the loudest voice — they're making the mafia nervous.",
  ],
  nightDetective: [
    "Time to get some intel. I'll check the player who's been too smooth.",
    "Who's hiding in plain sight? Let's find out.",
    "The quiet ones are always worth investigating first.",
  ],
  // Someone said the bot's own name directly
  calledOut: [
    "Me? I've said nothing but the truth this whole game. Check the logs.",
    "Wow, okay. Pointing at me changes nothing — I haven't been suspicious once.",
    "You can accuse me all you want, it won't hold up. I'm just playing logically.",
    "I'm the least suspicious person here honestly. Look at who's actually being quiet.",
    "Funny how the moment someone's cornered, they swing at me instead.",
    "Go ahead, vote me out. When I'm innocent, you'll wish you hadn't.",
  ],
  roleClaim: [
    "Anyone can type 'I'm the detective.' Where's your proof?",
    "Claiming a role this early is either brave or reckless. We'll see which.",
    "If that's true, why wait until now to say it?",
    "Interesting timing on that claim. What made you speak up right now?",
    "I'll believe it when the results back it up, not before.",
  ],
  deathTalk: [
    "That death changes everything. We need to rethink who we trust now.",
    "RIP. Let's not waste that. What did they say right before they died?",
    "Someone benefited from that death. Who does it point to?",
    "That's a big loss for the town if they were telling the truth.",
    "Convenient that they died right after speaking up, don't you think?",
  ],
  greeting: [
    "Hey. Let's figure this out together.",
    "Alright, everyone locked in? Let's get to work.",
    "Morning. Who's got theories?",
  ],
};

const BOT_MESSAGES_ES = {
  general: [
    "Observé a todos anoche. La historia de alguien no cuadra.",
    "He jugado suficientes rondas para saber cuándo alguien finge calma.",
    "¿Por qué está tan callada la sala? La gente culpable se queda callada.",
    "Llámenme paranoico, pero siempre reviso las coartadas dos veces.",
    "Si muero esta noche, revisen a quien acaba de cambiar de tema.",
    "He estado tomando notas. Tres personas cambiaron su historia.",
    "El silencio ahora mismo dice más que cualquier acusación.",
    "Alguien aquí es demasiado bueno para evadir preguntas. Eso es sospechoso.",
    "Estoy viendo qué tan rápido escribe la gente cuando la acorralan.",
    "La ronda pasada confié en la persona equivocada. Nunca más.",
  ],
  accusation: [
    "Observé a {name} con cuidado. Su tiempo de reacción fue sospechoso.",
    "{name} solo habla cuando la presión está sobre otra persona. Distracción clásica.",
    "¿Alguien notó que {name} nunca vota primero? Siempre espera a ver hacia dónde sopla el viento.",
    "{name} dijo que era civil, pero su lógica suena a mafia cubriendo sus huellas.",
    "Le hice una pregunta directa a {name} y respondió con otra pregunta. Sospechoso.",
    "{name} pasó de callado a extremadamente a la defensiva en dos mensajes. ¿Sobrecompensando?",
    "Si eliminan a {name} y resulta ser civil, asumo la culpa. Pero no lo creo.",
    "{name} sigue diciendo 'confíen en mí' — quien exige confianza normalmente no la merece.",
    "Ya he jugado contra {name} antes. Usa las mismas excusas cada vez que es mafia.",
    "{name} se contradijo entre la primera ronda y ahora. Se le nota.",
  ],
  defense: [
    "He sido completamente transparente desde la primera ronda. Revisen mis mensajes.",
    "¿Por qué arriesgaría tanta atención si fuera mafia? Piénsenlo.",
    "Voté para eliminar a un bot la ronda pasada. ¿Por qué la mafia desperdiciaría un voto en un bot?",
    "Mi historia no ha cambiado ni una vez. ¿Puede decir lo mismo quien me acusa?",
    "Si yo fuera mafia, estaría mucho más callado. Estoy discutiendo porque soy inocente y estoy frustrado.",
    "Miren quién se beneficia si me eliminan. Esa es la verdadera mafia.",
    "Literalmente sugerí una estrategia que perjudicó a la mafia la ronda pasada. Usen la cabeza.",
    "Elimínenme y perderán a un civil. Entonces la mafia gana más rápido.",
    "He estado tratando de coordinar a todo el equipo. ¿Eso suena a comportamiento de mafia?",
    "La persona que me acusa no ha dado ni una sola prueba. Solo intuición.",
  ],
  agreement: [
    "Buena lectura. Estaba pensando lo mismo pero no lo sabía expresar.",
    "Ese análisis es sólido. Me sumo a esa idea.",
    "Acabas de conectar puntos que se me pasaron. Buen trabajo de detective.",
    "Estoy convencido. Votemos y pasemos a la siguiente ronda.",
    "Por fin alguien habla con lógica en lugar de pánico.",
    "Tu razonamiento tiene sentido. Ajustaré mi teoría en consecuencia.",
  ],
  suspicion: [
    "Algo se siente fabricado en esta discusión. Como si alguien la estuviera dirigiendo.",
    "Dos personas están empujando la misma narrativa desde ángulos distintos. ¿Coordinado?",
    "La mafia seguro está leyendo este chat. Vigilen a quien se mantiene invisible.",
    "No me gusta lo rápido que la conversación se alejó de los resultados de la noche.",
    "Alguien aquí nos está manipulando como quiere. Necesitamos despertar.",
    "El jugador más callado suele ser el más peligroso. Recuérdenlo.",
    "Cada ronda que la mafia sobrevive, se vuelve más audaz. Debemos actuar ahora.",
    "Ya he visto este patrón antes: confianza falsa, redirigir, eliminar a un civil.",
  ],
  response: [
    "Ángulo interesante, pero te falta la línea de tiempo de la fase nocturna.",
    "Eso tendría sentido si tuviéramos más jugadores vivos. Ahora mismo es muy arriesgado.",
    "Entiendo tu punto, pero los datos no respaldan esa conclusión.",
    "Puede que tengas razón, pero ¿puedes explicar por qué el doctor no lo curó?",
    "Esa es una interpretación. Aquí va otra: ¿y si la mafia quería que pensáramos eso?",
    "Tu teoría depende de demasiadas suposiciones. Quedémonos con lo que sabemos.",
    "Respeto tu punto de vista, pero he estado observando otras señales.",
    "Argumento convincente, pero ya me han engañado con lógica similar antes. Cautela, sí.",
    "Casi me convences, pero {name} tiene una coartada sólida desde la primera ronda.",
    "Crédito parcial — la primera mitad tiene razón, la segunda necesita más pruebas.",
  ],
  nightMafia: [
    "¿A quién eliminamos? ¿Al escandaloso o al inteligente?",
    "Ataquemos al jugador que hace demasiadas preguntas. Es peligroso.",
    "Si eliminamos a {name}, los civiles pierden a su mejor analista.",
    "Dividamos el voto si es necesario, pero no dejemos evidencia.",
    "El doctor podría estar vigilando. Elijamos a alguien inesperado.",
  ],
  nightDoctor: [
    "Tengo un presentimiento sobre esta noche. Alguien va a necesitar esta cura.",
    "¿Quién ha sido más útil? A esa persona quiere matar la mafia.",
    "Mi instinto dice que proteja a la voz más fuerte — está poniendo nerviosa a la mafia.",
  ],
  nightDetective: [
    "Hora de conseguir información. Investigaré al jugador que ha sido demasiado convincente.",
    "¿Quién se esconde a plena vista? Vamos a averiguarlo.",
    "Los más callados siempre valen la pena investigarlos primero.",
  ],
  // Alguien mencionó el nombre del bot directamente
  calledOut: [
    "¿Yo? No he dicho más que la verdad en todo el juego. Revisen los mensajes.",
    "Vaya, está bien. Señalarme a mí no cambia nada — nunca he sido sospechoso.",
    "Pueden acusarme todo lo que quieran, no se va a sostener. Solo estoy jugando con lógica.",
    "Honestamente soy el menos sospechoso aquí. Miren quién realmente está callado.",
    "Qué curioso que en cuanto alguien se siente acorralado, me ataca a mí.",
    "Adelante, elimínenme. Cuando resulte que soy inocente, se van a arrepentir.",
  ],
  roleClaim: [
    "Cualquiera puede escribir 'soy el detective'. ¿Dónde está tu prueba?",
    "Reclamar un rol tan pronto es valiente o imprudente. Ya veremos cuál de las dos.",
    "Si eso es cierto, ¿por qué esperaste hasta ahora para decirlo?",
    "Qué momento tan interesante para esa afirmación. ¿Qué te hizo hablar justo ahora?",
    "Lo creeré cuando los resultados lo respalden, no antes.",
  ],
  deathTalk: [
    "Esa muerte lo cambia todo. Necesitamos repensar en quién confiamos ahora.",
    "Descanse en paz. No desperdiciemos eso. ¿Qué dijo justo antes de morir?",
    "Alguien se benefició de esa muerte. ¿A quién apunta eso?",
    "Es una gran pérdida para el pueblo si decía la verdad.",
    "Qué conveniente que muriera justo después de hablar, ¿no creen?",
  ],
  greeting: [
    "Hola. Averigüemos esto juntos.",
    "Bien, ¿todos listos? Manos a la obra.",
    "Buenos días. ¿Quién tiene teorías?",
  ],
};

function getBotMessages(lang: string | undefined) {
  return lang === "es" ? BOT_MESSAGES_ES : BOT_MESSAGES_EN;
}

function getEchoPrefixes(lang: string | undefined) {
  return lang === "es" ? ECHO_PREFIXES_ES : ECHO_PREFIXES_EN;
}

// Reads an actual human message and picks the bot response category that best
// matches what was said, instead of only checking a couple of keywords.
function classifyMessage(msgLower: string, players: Player[], bot: Player, alivePlayers: Player[], lang: string | undefined) {
  const mentionedPlayer = players.find((p: Player) => p.name && msgLower.includes(p.name.toLowerCase()) && p.id !== bot.id && p.isAlive);

  const roleWords = lang === "es"
    ? ["soy el detective", "soy detective", "soy la doctora", "soy el doctor", "soy doctor", "digo que soy detective", "digo que soy doctor"]
    : ["i'm the detective", "i am the detective", "i'm the doctor", "i am the doctor", "i'm detective", "i'm doctor", "claim detective", "claim doctor", "i am detective", "i am doctor"];
  if (roleWords.some(w => msgLower.includes(w))) {
    return { category: "roleClaim" as const, targetName: undefined };
  }

  const deathWords = lang === "es"
    ? ["murió", "muerto", "muerta", "mataron anoche", "quién murió", "quien murio", "qepd", "descanse en paz", "eliminado", "eliminada"]
    : ["died", "dead", "killed last night", "who died", "rip", "eliminated"];
  if (deathWords.some(w => msgLower.includes(w))) {
    return { category: "deathTalk" as const, targetName: undefined };
  }

  const accusationWords = lang === "es"
    ? ["mafia", "sospechoso", "sospechosa", "vota", "votar", "matar", "culpable", "mintiendo", "miente"]
    : ["mafia", "sus", "vote", "kill", "suspicious", "guilty", "lying"];
  const defenseWords = lang === "es"
    ? ["inocente", "no fui yo", "confía en mí", "confia en mi", "yo no", "lo juro"]
    : ["innocent", "not me", "trust me", "i'm not", "im not", "i swear"];
  const agreementWords = lang === "es"
    ? ["de acuerdo", "sí", "si", "tienes razón", "tienes razon", "exacto", "verdad", "igual"]
    : ["agree", "yes", "you're right", "youre right", "exactly", "true", "same"];
  const greetingWords = lang === "es"
    ? ["hola", "buenos días", "buenos dias", "buen día", "buen dia"]
    : ["hey", "hi ", "hello", "morning", "good morning", "gm"];
  const negations = lang === "es"
    ? ["no ", "nunca ", "jamás ", "jamas "]
    : ["don't ", "dont ", "not ", "n't ", "no "];
  // "I don't agree" or "not true" should never be read as agreement
  const isNegated = (word: string) => negations.some(n => msgLower.includes(n + word) || msgLower.includes(n.trim() + " " + word));

  if (mentionedPlayer) {
    if (accusationWords.some(w => msgLower.includes(w))) {
      return { category: "accusation" as const, targetName: mentionedPlayer.name };
    }
    if (defenseWords.some(w => msgLower.includes(w))) {
      return { category: "defense" as const, targetName: undefined };
    }
    return { category: "response" as const, targetName: mentionedPlayer.name };
  }

  if (msgLower.includes("?") || msgLower.includes("¿")) {
    return { category: "response" as const, targetName: undefined };
  }
  if (accusationWords.some(w => msgLower.includes(w))) {
    if (alivePlayers.length > 0 && Math.random() > 0.4) {
      const victim = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      return { category: "accusation" as const, targetName: victim.name };
    }
    return { category: "suspicion" as const, targetName: undefined };
  }
  if (agreementWords.some(w => msgLower.includes(w)) && !agreementWords.some(w => isNegated(w))) {
    return { category: "agreement" as const, targetName: undefined };
  }
  if (greetingWords.some(w => msgLower.startsWith(w) || msgLower.includes(w))) {
    return { category: "greeting" as const, targetName: undefined };
  }
  if (defenseWords.some(w => msgLower.includes(w))) {
    return { category: "defense" as const, targetName: undefined };
  }

  return { category: "general" as const, targetName: undefined };
}

function buildBotReply(category: keyof typeof BOT_MESSAGES_EN, targetName: string | undefined, botId: number, fallbackPlayers: Player[] = [], lang: string | undefined = "en"): string {
  const line = pickUnique(getBotMessages(lang)[category], botId);
  if (!line.includes("{name}")) return line;
  // Some pools (like "response") mostly don't need a name but have one or two
  // lines that do — if no target was supplied, backfill with a random alive
  // player instead of ever showing the literal "{name}" placeholder.
  const name = targetName || (fallbackPlayers.length > 0
    ? fallbackPlayers[Math.floor(Math.random() * fallbackPlayers.length)].name
    : (lang === "es" ? "alguien" : "someone"));
  return line.replace("{name}", name);
}

async function respondToHumanChat(roomId: number, humanMessage: string, storage: any) {
  const room = await storage.getRoom(roomId);
  if (!room || room.status === 'lobby' || room.status === 'ended') return;

  const lang: string | undefined = (room.settings as any)?.language === "es" ? "es" : "en";
  const players = await storage.getPlayersInRoom(roomId);
  const bots = players.filter((p: Player) => p.isBot && p.isAlive);
  if (bots.length === 0) return;

  const msgLower = humanMessage.toLowerCase();

  // If a bot was directly named in the message, that specific bot always replies —
  // being called out shouldn't have a chance of being ignored.
  const calledBot = bots.find((b: Player) => b.name && msgLower.includes(b.name.toLowerCase().split("_")[0].toLowerCase()));
  // A direct question also deserves a guaranteed response — catch both "?" and
  // question-word phrasing without punctuation, like "who is it" or "whats going on".
  const questionWords = lang === "es"
    ? ["quién ", "quien ", "qué ", "que ", "por qué", "por que", "cómo ", "como ", "cuál ", "cual ", "es él", "es ella", "eres tú", "eres tu", "tú crees", "tu crees"]
    : ["who ", "who's", "whos ", "what ", "what's", "whats ", "why ", "why's", "how ", "which ", "is it", "are you", "do you", "did you"];
  const isDirectQuestion = msgLower.includes("?") || msgLower.includes("¿") || questionWords.some(w => msgLower.includes(w));

  if (!calledBot && !isDirectQuestion && Math.random() > 0.8) return;

  const bot = calledBot || bots[Math.floor(Math.random() * bots.length)];
  const alivePlayers = players.filter((p: Player) => p.isAlive && p.id !== bot.id);

  if (calledBot) {
    const content = buildBotReply("calledOut", undefined, bot.id, alivePlayers, lang);
    await storage.createMessage({ roomId, playerId: bot.id, playerName: bot.name, content });
    return;
  }

  const { category, targetName } = classifyMessage(msgLower, players, bot, alivePlayers, lang);
  let content = buildBotReply(category, targetName, bot.id, alivePlayers, lang);

  // ~45% of the time, open with a direct quote of what the player said —
  // this is what makes the bot feel like it's actually listening.
  if (Math.random() < 0.45 && humanMessage.trim().length > 3) {
    const snippet = extractSnippet(humanMessage);
    const echoPrefixes = getEchoPrefixes(lang);
    const prefix = echoPrefixes[Math.floor(Math.random() * echoPrefixes.length)].replace("{snippet}", snippet);
    content = `${prefix} ${content}`;
  }

  if (content) {
    await storage.createMessage({ roomId, playerId: bot.id, playerName: bot.name, content });
  }
}

async function handleBotActions(roomId: number, wss: WebSocketServer, storage: any, roomClients: Map<number, Set<string>>, clients: Map<string, WebSocket>, gameActions: Map<number, any>) {
  const room = await storage.getRoom(roomId);
  if (!room || room.status === 'lobby' || room.status === 'ended') return;

  const lang: string | undefined = (room.settings as any)?.language === "es" ? "es" : "en";
  const players = await storage.getPlayersInRoom(roomId);
  const bots = players.filter((p: Player) => p.isBot && p.isAlive);
  const actions = gameActions.get(roomId) || { votes: new Map(), mafiaKills: new Map(), doctorSaves: new Map(), detectiveChecks: new Map(), guards: new Map(), shots: new Map() };

  for (const bot of bots) {
    const alivePlayers = players.filter((p: Player) => p.isAlive && p.id !== bot.id);
    if (alivePlayers.length === 0) continue;

    let target;
    const botsAlive = alivePlayers.filter((p: Player) => p.isBot);
    
    if (Math.random() > 0.6 && botsAlive.length > 0) {
      target = botsAlive[Math.floor(Math.random() * botsAlive.length)];
    } else {
      target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    }
    
    if (bot.role === 'mafia') {
      const nonMafiaAlive = alivePlayers.filter((p: Player) => p.role !== 'mafia');
      if (nonMafiaAlive.length > 0) {
        const nonMafiaBots = nonMafiaAlive.filter((p: Player) => p.isBot);
        if (Math.random() > 0.5 && nonMafiaBots.length > 0) {
          target = nonMafiaBots[Math.floor(Math.random() * nonMafiaBots.length)];
        } else {
          target = nonMafiaAlive[Math.floor(Math.random() * nonMafiaAlive.length)];
        }
      }
    }

    if (room.phase === 'voting') {
      actions.votes.set(bot.id, target.id);
      const allAlivePlayers = players.filter((p: Player) => p.isAlive);
      if (actions.votes.size === allAlivePlayers.length) {
        return true;
      }
    } else if (room.phase === 'mafia' && bot.role === 'mafia') {
      actions.mafiaKills.set(bot.id, target.id);
    } else if (room.phase === 'doctor' && bot.role === 'doctor') {
      actions.doctorSaves.set(bot.id, target.id);
    } else if (room.phase === 'bodyguard' && bot.role === 'bodyguard') {
      actions.guards.set(bot.id, target.id); // target already excludes bot itself
    } else if (room.phase === 'vigilante' && bot.role === 'vigilante') {
      const bulletsLeft = vigilanteBullets.get(roomId)?.get(bot.id) ?? 0;
      // Bots are conservative with their 2 bullets — only shoot about a third of the time.
      if (bulletsLeft > 0 && Math.random() > 0.65) {
        actions.shots.set(bot.id, target.id);
        const bulletsMap = vigilanteBullets.get(roomId) || new Map<number, number>();
        bulletsMap.set(bot.id, bulletsLeft - 1);
        vigilanteBullets.set(roomId, bulletsMap);
      }
    }

    if (Math.random() > 0.35) {
      let content = "";

      const recentMessages = await storage.getMessagesByRoom(roomId);
      const lastHumanMsg = recentMessages?.filter((m: any) => m.playerId !== 0 && !players.find((p: Player) => p.id === m.playerId && p.isBot))?.pop();

      if (lastHumanMsg && Math.random() > 0.45) {
        const msgText = lastHumanMsg.content.toLowerCase();
        const calledBot = msgText.includes(bot.name.toLowerCase().split("_")[0].toLowerCase());
        if (calledBot) {
          content = buildBotReply("calledOut", undefined, bot.id, alivePlayers, lang);
        } else {
          const { category, targetName } = classifyMessage(msgText, players, bot, alivePlayers, lang);
          content = buildBotReply(category, targetName, bot.id, alivePlayers, lang);
        }
      } else {
        const rand = Math.random();
        if (rand > 0.7 && alivePlayers.length > 0) {
          const victim = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
          content = buildBotReply("accusation", victim.name, bot.id, alivePlayers, lang);
        } else if (rand > 0.55) {
          content = buildBotReply("defense", undefined, bot.id, alivePlayers, lang);
        } else if (rand > 0.4) {
          content = buildBotReply("suspicion", undefined, bot.id, alivePlayers, lang);
        } else if (rand > 0.25) {
          content = buildBotReply("response", undefined, bot.id, alivePlayers, lang);
        } else if (rand > 0.15) {
          content = buildBotReply("agreement", undefined, bot.id, alivePlayers, lang);
        } else {
          content = buildBotReply("general", undefined, bot.id, alivePlayers, lang);
        }
      }
      if (content) {
        await storage.createMessage({ roomId, playerId: bot.id, playerName: bot.name, content });
      }
    }
  }
  // Dead bots don't have any night/day actions left, but shouldn't just go
  // silent in the graveyard — give them a small chance each phase to post a
  // bit of flavor chatter there, same as living bots do in the main chat.
  const deadBots = players.filter((p: Player) => p.isBot && !p.isAlive);
  for (const bot of deadBots) {
    if (Math.random() > 0.75) {
      const lines = lang === "es" ? GRAVEYARD_BOT_LINES_ES : GRAVEYARD_BOT_LINES_EN;
      const content = lines[Math.floor(Math.random() * lines.length)];
      await storage.createMessage({ roomId, playerId: bot.id, playerName: bot.name, content, isSpectator: true } as any);
    }
  }

  gameActions.set(roomId, actions);
  return false;
}

// Bots used to only ever decide on a target inside handleBotActions, which
// only runs once — right when a phase's timer fully expires (or a human's
// action happens to trigger an early-advance check for that same phase).
// If no human held that phase's role, bots effectively never acted until
// the whole phase duration ran out, making every such phase feel stalled.
// This schedules bots to commit to a decision shortly after a phase starts
// instead, then reuses the same "everyone acted -> advance early" check the
// human action handlers already use.
async function scheduleBotQuickActions(roomId: number, wss: WebSocketServer, storage: any, roomClients: Map<number, Set<string>>, clients: Map<string, WebSocket>, gameActions: Map<number, any>) {
  const snapshotRoom = await storage.getRoom(roomId);
  if (!snapshotRoom || snapshotRoom.status === 'ended' || snapshotRoom.status === 'lobby') return;
  const phaseAtSchedule = snapshotRoom.phase;
  const statusAtSchedule = snapshotRoom.status;

  const delay = 500 + Math.floor(Math.random() * 700); // ~0.5s-1.2s — feels immediate, not robotic/simultaneous
  setTimeout(async () => {
    const room = await storage.getRoom(roomId);
    // Bail out if the phase already moved on for any other reason (a human
    // resolved it, the game ended, etc.) — nothing to do here anymore.
    if (!room || room.phase !== phaseAtSchedule || room.status !== statusAtSchedule || room.status === 'ended') return;

    const players = await storage.getPlayersInRoom(roomId);
    const bots = players.filter((p: Player) => p.isBot && p.isAlive);
    if (bots.length === 0) return;
    const actions = gameActions.get(roomId) || { votes: new Map(), mafiaKills: new Map(), doctorSaves: new Map(), detectiveChecks: new Map(), guards: new Map(), shots: new Map() };

    const pickTarget = (pool: Player[]) => {
      const botsInPool = pool.filter((p) => p.isBot);
      if (Math.random() > 0.6 && botsInPool.length > 0) return botsInPool[Math.floor(Math.random() * botsInPool.length)];
      return pool[Math.floor(Math.random() * pool.length)];
    };

    let changed = false;
    for (const bot of bots) {
      const alivePlayers = players.filter((p: Player) => p.isAlive && p.id !== bot.id);
      if (alivePlayers.length === 0) continue;

      if (room.status === 'day' && room.phase === 'voting' && !actions.votes.has(bot.id)) {
        actions.votes.set(bot.id, pickTarget(alivePlayers).id);
        changed = true;
      } else if (room.status === 'night' && room.phase === 'mafia' && bot.role === 'mafia' && !actions.mafiaKills.has(bot.id)) {
        const nonMafiaAlive = alivePlayers.filter((p: Player) => p.role !== 'mafia');
        if (nonMafiaAlive.length > 0) {
          actions.mafiaKills.set(bot.id, pickTarget(nonMafiaAlive).id);
          changed = true;
        }
      } else if (room.status === 'night' && room.phase === 'doctor' && bot.role === 'doctor' && !actions.doctorSaves.has(bot.id)) {
        actions.doctorSaves.set(bot.id, pickTarget(alivePlayers).id);
        changed = true;
      } else if (room.status === 'night' && room.phase === 'bodyguard' && bot.role === 'bodyguard' && !actions.guards.has(bot.id)) {
        actions.guards.set(bot.id, pickTarget(alivePlayers).id);
        changed = true;
      } else if (room.status === 'night' && room.phase === 'vigilante' && bot.role === 'vigilante' && !actions.shots.has(bot.id)) {
        const bulletsLeft = vigilanteBullets.get(roomId)?.get(bot.id) ?? 0;
        if (bulletsLeft > 0 && Math.random() > 0.65) {
          actions.shots.set(bot.id, pickTarget(alivePlayers).id);
          const bulletsMap = vigilanteBullets.get(roomId) || new Map<number, number>();
          bulletsMap.set(bot.id, bulletsLeft - 1);
          vigilanteBullets.set(roomId, bulletsMap);
        } else {
          // Chose not to shoot this phase — still mark as "acted" (with an
          // unreachable target id) so the early-advance check below doesn't
          // wait forever on a bot that isn't going to do anything tonight.
          actions.shots.set(bot.id, -1);
        }
        changed = true;
      } else if (room.status === 'night' && room.phase === 'detective' && bot.role === 'detective' && !actions.detectiveChecks.has(bot.id)) {
        actions.detectiveChecks.set(bot.id, pickTarget(alivePlayers).id);
        changed = true;
      }
    }

    if (!changed) return;
    gameActions.set(roomId, actions);
    broadcastState(roomId);

    // Same "has everyone with this role acted" check the human action
    // handlers already use to advance early instead of waiting for the timer.
    let allActed = false;
    if (room.status === 'day' && room.phase === 'voting') {
      const allAlivePlayers = players.filter((p: Player) => p.isAlive);
      allActed = actions.votes.size === allAlivePlayers.length;
    } else if (room.status === 'night') {
      const roleActionMaps: Record<string, Map<number, number>> = {
        mafia: actions.mafiaKills,
        doctor: actions.doctorSaves,
        bodyguard: actions.guards,
        vigilante: actions.shots,
        detective: actions.detectiveChecks,
      };
      const actionMap = roleActionMaps[room.phase];
      if (actionMap) allActed = haveAllRoleHoldersActed(players, room.phase, actionMap);
    }

    if (allActed) {
      if (phaseTimers.has(roomId)) { clearTimeout(phaseTimers.get(roomId)); phaseTimers.delete(roomId); }
      await advancePhase(roomId, wss, storage, roomClients, clients, gameActions);
    }
  }, delay);
}

// Persists the game chronicle (votes, nights, and this final result) onto every
// player's row so the end screen can show what actually happened, and updates
// win/loss stats. Must be called on every path that can end the game — a couple
// of "shortcut" paths used to skip this, which is why the end screen sometimes
// looked blank/incomplete.
// Adds credits to a user's server-side balance and returns the new total.
// This is the one authoritative wallet all four reward systems pay into.
async function addAccountCredits(supabaseUserId: string, amount: number): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO account_credits (supabase_user_id, credits) VALUES ($1, $2)
       ON CONFLICT (supabase_user_id) DO UPDATE SET credits = account_credits.credits + $2
       RETURNING credits`,
      [supabaseUserId, amount]
    );
    return result.rows[0].credits;
  } finally {
    client.release();
  }
}

const REFERRAL_CREDITS = 25;
// A referred account needs this many games with real participation (at least
// one chat message AND one vote) before its referral can pay out.
const REFERRAL_MIN_ACTIVE_GAMES = 2;

// Called once per game per signed-in player. Records whether they actually
// participated (vs. sitting AFK the whole game) and whether anyone flagged
// them as AFK, onto their persistent account record.
async function updateAccountActivity(supabaseUserId: string, hadRealActivity: boolean, afkIncident: boolean): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO account_activity (supabase_user_id, games_completed, games_with_activity, afk_reports)
       VALUES ($1, 1, $2, $3)
       ON CONFLICT (supabase_user_id) DO UPDATE SET
         games_completed = account_activity.games_completed + 1,
         games_with_activity = account_activity.games_with_activity + $2,
         afk_reports = account_activity.afk_reports + $3`,
      [supabaseUserId, hadRealActivity ? 1 : 0, afkIncident ? 1 : 0]
    );
  } finally {
    client.release();
  }
}

// Checks whether a pending referral claim for this (newly-referred) account
// can now be resolved, and pays out both sides if so. Safe to call after
// every game — it's a no-op unless there's a pending claim for this account.
async function tryResolveReferralClaim(referredUserId: string): Promise<void> {
  const client = await pool.connect();
  try {
    const claimResult = await client.query(
      `SELECT id, referrer_user_id, signup_ip, signup_device_id, status FROM referral_claims WHERE referred_user_id = $1`,
      [referredUserId]
    );
    const claim = claimResult.rows[0];
    if (!claim || claim.status !== 'pending') return;

    const activityResult = await client.query(
      `SELECT games_with_activity, afk_reports FROM account_activity WHERE supabase_user_id = $1`,
      [referredUserId]
    );
    const activity = activityResult.rows[0] || { games_with_activity: 0, afk_reports: 0 };

    if (activity.afk_reports > 0) {
      await client.query(`UPDATE referral_claims SET status = 'flagged', resolved_at = now() WHERE id = $1`, [claim.id]);
      return;
    }
    if (activity.games_with_activity < REFERRAL_MIN_ACTIVE_GAMES) {
      return; // not enough real activity yet — check again after their next game
    }

    // Same-IP or same-device as the referrer strongly suggests one person
    // referring themselves for free credits — deny instead of paying out.
    const linkResult = await client.query(
      `SELECT signup_ip, signup_device_id FROM referral_links WHERE supabase_user_id = $1`,
      [claim.referrer_user_id]
    );
    const referrerLink = linkResult.rows[0];
    const sameIp = referrerLink?.signup_ip && claim.signup_ip && referrerLink.signup_ip === claim.signup_ip;
    const sameDevice = referrerLink?.signup_device_id && claim.signup_device_id && referrerLink.signup_device_id === claim.signup_device_id;
    if (sameIp || sameDevice) {
      await client.query(`UPDATE referral_claims SET status = 'denied', resolved_at = now() WHERE id = $1`, [claim.id]);
      return;
    }

    await client.query(`UPDATE referral_claims SET status = 'approved', resolved_at = now() WHERE id = $1`, [claim.id]);
    await addAccountCredits(claim.referrer_user_id, REFERRAL_CREDITS);
    await addAccountCredits(referredUserId, REFERRAL_CREDITS);
  } catch (err: any) {
    console.error("tryResolveReferralClaim error:", err.message);
  } finally {
    client.release();
  }
}

async function finalizeGameEnd(roomId: number, storage: any, winner: 'civilians' | 'mafia' | 'jester', gameActionsMap: Map<number, any>) {
  const history = gameHistory.get(roomId) || [];
  const playersInRoom = await storage.getPlayersInRoom(roomId);

  // A vigilante who shot an innocent normally dies of guilt the following
  // night. If the game ends before that next night happens, that pending
  // guilt death would otherwise be silently discarded — resolve it now so
  // it still shows up in the chronicle and final roles.
  const pendingGuiltId = vigilanteGuiltPending.get(roomId);
  if (pendingGuiltId) {
    const guiltyVigi = playersInRoom.find((p: Player) => p.id === pendingGuiltId);
    if (guiltyVigi && guiltyVigi.isAlive) {
      await storage.updatePlayer(guiltyVigi.id, { isAlive: false });
      guiltyVigi.isAlive = false;
      history.push({ type: 'guilt_death', target: guiltyVigi.name, role: 'vigilante' });
    }
    vigilanteGuiltPending.delete(roomId);
  }

  history.push({
    type: 'game_end',
    winner,
    roles: playersInRoom.map((p: Player) => ({ name: p.name, role: p.role }))
  });
  gameHistory.set(roomId, history);

  for (const p of playersInRoom) {
    await storage.updatePlayer(p.id, {
      gameHistory: history,
      gamesPlayed: (p.gamesPlayed || 0) + 1,
      wins: (p.wins || 0) + (
        winner === 'jester' ? (p.role === 'jester' ? 1 : 0) :
        winner === 'civilians' && p.role !== 'mafia' ? 1 :
        winner === 'mafia' && p.role === 'mafia' ? 1 : 0
      )
    });
  }

  // Referral fraud prevention: update each signed-in player's account activity
  // record and, if they have a pending referral, see whether it can now be
  // resolved. Guest/bot players (no supabaseUserId) are skipped — they're not
  // tied to any account and can't be part of a referral either way.
  try {
    const activity = gameActivity.get(roomId);
    const roomAfk = afkReports.get(roomId);
    for (const p of playersInRoom) {
      if (!p.supabaseUserId || p.isBot) continue;
      const a = activity?.get(p.id);
      const hadRealActivity = !!a && a.messages > 0 && a.votes > 0;
      const afkIncident = (roomAfk?.get(p.id)?.size || 0) >= 2;
      await updateAccountActivity(p.supabaseUserId, hadRealActivity, afkIncident);
      await tryResolveReferralClaim(p.supabaseUserId);
    }
  } catch (err) {
    console.error("Referral activity tracking error:", err);
  }
  gameActivity.delete(roomId);
  afkReports.delete(roomId);
  vigilanteBullets.delete(roomId);
  mayorRevealed.delete(roomId);
  vigilanteGuiltPending.delete(roomId);

  if (phaseTimers.has(roomId)) { clearTimeout(phaseTimers.get(roomId)); phaseTimers.delete(roomId); }
  gameActionsMap.delete(roomId);
}

async function advancePhase(roomId: number, wss: WebSocketServer, storage: any, roomClients: Map<number, Set<string>>, clients: Map<string, WebSocket>, gameActions: Map<number, any>) {
  // Whenever a player is actually eliminated in this call, the client shows a
  // ~5s elimination overlay that blocks interaction. Delay the next phase's
  // lastUpdated (and its timer) by that same amount so the overlay doesn't
  // quietly eat into the next phase's real time, same fix as the role reveal.
  let revealDelayMs = 0;
  const shouldAdvanceImmediately = await handleBotActions(roomId, wss, storage, roomClients, clients, gameActions);
  if (shouldAdvanceImmediately) {
    const room = await storage.getRoom(roomId);
    if (room?.phase === 'voting') {
      const actions = gameActions.get(roomId) || { votes: new Map() };
      const players = await storage.getPlayersInRoom(roomId);
      const voteCounts = new Map<number, number>();
      const voteResults: { voterName: string, targetName: string }[] = [];
      
      actions.votes.forEach((targetId: number, voterId: number) => {
        const voter = players.find((p: Player) => p.id === voterId);
        // A revealed Mayor's vote counts double.
        const voteWeight = voter && mayorRevealed.get(roomId)?.has(voter.id) ? 2 : 1;
        voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + voteWeight);
        const target = players.find((p: Player) => p.id === targetId);
        if (voter && target) {
          voteResults.push({ voterName: voter.name, targetName: target.name });
        }
      });
      
      if (voteResults.length > 0 && (room.settings as any).showVoteResults === true) {
        const lang: string = (room.settings as any)?.language === "es" ? "es" : "en";
        let voteSummary = sysMsg("votingResultsHeader", lang);
        voteResults.forEach(res => { voteSummary += sysMsg("votedForLine", lang, { voter: res.voterName, target: res.targetName }); });
        await storage.createMessage({ roomId, playerId: 0, playerName: sysName(lang), content: voteSummary });
      }
      
      const voteHistoryEntry: any = { type: 'vote', turn: room.turn, results: voteResults, eliminated: null };
      if (voteResults.length > 0) {
        const history = gameHistory.get(roomId) || [];
        history.push(voteHistoryEntry);
        gameHistory.set(roomId, history);
      }
      
      let topTargetId = -1;
      let maxVotes = 0;
      voteCounts.forEach((count, id) => {
        if (count > maxVotes) { maxVotes = count; topTargetId = id; }
      });
      
      let gameEnded = false;
      if (topTargetId !== -1) {
        const victim = players.find((p: Player) => p.id === topTargetId);
        if (victim) {
          await storage.updatePlayer(topTargetId, { isAlive: false });
          voteHistoryEntry.eliminated = { name: victim.name, role: victim.role || "civilian" };
          const revealLang = (room.settings as any)?.language === "es" ? "es" : "en";
          await storage.createMessage({ roomId, playerId: 0, playerName: sysName(revealLang), content: buildRoleRevealSentence(victim.name, victim.role || "civilian", players, revealLang, "voted") });
          revealDelayMs = ELIMINATION_REVEAL_MS; // overlay always shows for 5s regardless of showRoleReveal — that setting only hides the role text inside it

          if (victim.role === 'jester') {
            // Classic Jester rule: getting voted out ends the game
            // immediately, right then — it doesn't continue for anyone else.
            await storage.updateRoom(roomId, { status: 'ended' });
            await storage.createMessage({ roomId, playerId: 0, playerName: sysName(revealLang), content: sysMsg("jesterWinsBody", revealLang, { name: victim.name }) });
            await finalizeGameEnd(roomId, storage, 'jester', gameActions);
            gameEnded = true;
          } else {
            const remainingPlayers = await storage.getPlayersInRoom(roomId);
            const remainingMafia = remainingPlayers.filter((p: Player) => p.role === 'mafia' && p.isAlive);
            if (remainingMafia.length === 0) {
              await storage.updateRoom(roomId, { status: 'ended' });
              await storage.createMessage({ roomId, playerId: 0, playerName: sysName(revealLang), content: sysMsg("mafiaEliminatedCiviliansWin", revealLang) });
              await finalizeGameEnd(roomId, storage, 'civilians', gameActions);
              gameEnded = true;
            }
            const remainingInnocents = remainingPlayers.filter((p: Player) => p.role !== 'mafia' && p.isAlive);
            if (!gameEnded && remainingMafia.length >= remainingInnocents.length) {
              await storage.updateRoom(roomId, { status: 'ended' });
              await storage.createMessage({ roomId, playerId: 0, playerName: sysName(revealLang), content: sysMsg("mafiaTookOverMafiaWins", revealLang) });
              await finalizeGameEnd(roomId, storage, 'mafia', gameActions);
              gameEnded = true;
            }
          }
        }
      } else {
        const noVoteLang: string = (room.settings as any)?.language === "es" ? "es" : "en";
        await storage.createMessage({ roomId, playerId: 0, playerName: sysName(noVoteLang), content: sysMsg("noOneVotedOut", noVoteLang) });
      }
      
      if (gameEnded) {
        broadcastState(roomId);
        return;
      }
      
      const nextPlayers = await storage.getPlayersInRoom(roomId);
      const nextPhase = getFirstNightPhase(nextPlayers);
      await storage.updateRoom(roomId, { status: 'night', phase: nextPhase, turn: (room.turn || 0) + 1, lastUpdated: new Date(Date.now() + revealDelayMs) });
      actions.votes.clear();
      actions.mafiaKills.clear();
      actions.doctorSaves.clear();
      actions.detectiveChecks.clear();
      actions.guards.clear();
      actions.shots.clear();
      gameActions.set(roomId, actions);
      broadcastState(roomId);
      const nextSettings = room.settings as any;
      const nextDuration = getNightPhaseDuration(nextPhase, nextSettings);
      const nextTimer = setTimeout(() => advancePhase(roomId, wss, storage, roomClients, clients, gameActions), nextDuration + revealDelayMs);
      phaseTimers.set(roomId, nextTimer);
      void scheduleBotQuickActions(roomId, wss, storage, roomClients, clients, gameActions);
      return;
    }
  }
  const room = await storage.getRoom(roomId);
  if (!room) return;

  const lang: string = (room.settings as any)?.language === "es" ? "es" : "en";
  const players = await storage.getPlayersInRoom(roomId);
  const actions = gameActions.get(roomId) || { votes: new Map(), mafiaKills: new Map(), doctorSaves: new Map(), detectiveChecks: new Map(), guards: new Map(), shots: new Map() };

  if (room.status === 'day') {
    if (room.phase === 'discussion') {
      console.log(`[Room ${roomId}] Day Phase: Discussion -> Voting`);
      await storage.updateRoom(roomId, { phase: 'voting', lastUpdated: new Date() });
      broadcastState(roomId);
      void scheduleBotQuickActions(roomId, wss, storage, roomClients, clients, gameActions);
    } else if (room.phase === 'voting') {
      const voteCounts = new Map<number, number>();
      const voteResults: { voterName: string, targetName: string }[] = [];
      
      actions.votes.forEach((targetId: number, voterId: number) => {
        const voter = players.find((p: Player) => p.id === voterId);
        // A revealed Mayor's vote counts double.
        const voteWeight = voter && mayorRevealed.get(roomId)?.has(voter.id) ? 2 : 1;
        voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + voteWeight);
        const target = players.find((p: Player) => p.id === targetId);
        if (voter && target) {
          voteResults.push({ voterName: voter.name, targetName: target.name });
        }
      });

      if (voteResults.length > 0 && (room.settings as any).showVoteResults === true) {
        let voteSummary = sysMsg("votingResultsHeader", lang);
        voteResults.forEach(res => { voteSummary += sysMsg("votedForLine", lang, { voter: res.voterName, target: res.targetName }); });
        await storage.createMessage({ roomId, playerId: 0, playerName: sysName(lang), content: voteSummary });
      }
      
      const voteHistoryEntry: any = { type: 'vote', turn: room.turn, results: voteResults, eliminated: null };
      if (voteResults.length > 0) {
        const history = gameHistory.get(roomId) || [];
        history.push(voteHistoryEntry);
        gameHistory.set(roomId, history);
      }

      let topTargetId = -1;
      let maxVotes = 0;
      voteCounts.forEach((count, id) => {
        if (count > maxVotes) { maxVotes = count; topTargetId = id; }
      });

      let gameEnded = false;
      if (topTargetId !== -1) {
        const victim = players.find((p: Player) => p.id === topTargetId);
        if (victim) {
          await storage.updatePlayer(topTargetId, { isAlive: false });
          voteHistoryEntry.eliminated = { name: victim.name, role: victim.role || "civilian" };
          await storage.createMessage({ roomId, playerId: 0, playerName: sysName(lang), content: buildRoleRevealSentence(victim.name, victim.role || "civilian", players, lang, "voted") });
          revealDelayMs = ELIMINATION_REVEAL_MS; // overlay always shows for 5s regardless of showRoleReveal — that setting only hides the role text inside it

          if (victim.role === 'jester') {
            await storage.updateRoom(roomId, { status: 'ended' });
            await storage.createMessage({ roomId, playerId: 0, playerName: sysName(lang), content: sysMsg("jesterWinsBody", lang, { name: victim.name }) });
            await finalizeGameEnd(roomId, storage, 'jester', gameActions);
            gameEnded = true;
          } else {
            const remainingPlayers = await storage.getPlayersInRoom(roomId);
            const remainingMafia = remainingPlayers.filter((p: Player) => p.role === 'mafia' && p.isAlive);
            if (remainingMafia.length === 0) {
              await storage.updateRoom(roomId, { status: 'ended' });
              await storage.createMessage({ roomId, playerId: 0, playerName: sysName(lang), content: sysMsg("mafiaEliminatedCiviliansWin", lang) });
              await finalizeGameEnd(roomId, storage, 'civilians', gameActions);
              gameEnded = true;
            }
            const remainingInnocents = remainingPlayers.filter((p: Player) => p.role !== 'mafia' && p.isAlive);
            if (!gameEnded && remainingMafia.length >= remainingInnocents.length) {
              await storage.updateRoom(roomId, { status: 'ended' });
              await storage.createMessage({ roomId, playerId: 0, playerName: sysName(lang), content: sysMsg("mafiaTookOverMafiaWins", lang) });
              await finalizeGameEnd(roomId, storage, 'mafia', gameActions);
              gameEnded = true;
            }
          }
        }
      } else {
        await storage.createMessage({ roomId, playerId: 0, playerName: sysName(lang), content: sysMsg("noOneVotedOut", lang) });
      }

      if (!gameEnded) {
        const nextPlayers = await storage.getPlayersInRoom(roomId);
        const nextPhase = getFirstNightPhase(nextPlayers);
        await storage.updateRoom(roomId, { status: 'night', phase: nextPhase, turn: (room.turn || 0) + 1, lastUpdated: new Date(Date.now() + revealDelayMs) });
      }
      actions.mafiaKills.clear();
      actions.doctorSaves.clear();
      actions.detectiveChecks.clear();
      actions.votes.clear();
      actions.guards.clear();
      actions.shots.clear();
      gameActions.set(roomId, actions);
    }
  } else if (room.status === 'night') {
    // Special case: Mafia phase always ends the game immediately if there's
    // no living Mafia left, regardless of what other roles are in play.
    if (room.phase === 'mafia') {
      const aliveMafia = players.filter((p: Player) => p.role === 'mafia' && p.isAlive);
      if (aliveMafia.length === 0) {
        console.log(`[Room ${roomId}] All mafia eliminated! Ending game.`);
        await storage.updateRoom(roomId, { status: 'ended' });
        await storage.createMessage({ roomId, playerId: 0, playerName: sysName(lang), content: sysMsg("mafiaEliminatedCiviliansWin", lang) });
        await finalizeGameEnd(roomId, storage, 'civilians', gameActions);
        broadcastState(roomId);
        return;
      }
    }

    const nextNightPhase = getNextNightPhase(room.phase, players);

    if (nextNightPhase) {
      // There's still a living role holder left to act tonight — move to
      // their phase. Any role with nobody alive holding it (e.g. no Doctor
      // in this game) is skipped automatically by getNextNightPhase.
      console.log(`[Room ${roomId}] Night Phase: ${room.phase} -> ${nextNightPhase}`);
      await storage.updateRoom(roomId, { phase: nextNightPhase, lastUpdated: new Date() });
      broadcastState(roomId);
    } else {
      // No more night roles left to act — resolve the night and move to Day.
      console.log(`[Room ${roomId}] Night Phase: ${room.phase} -> Day Discussion`);
      const history = gameHistory.get(roomId) || [];
      const nightData: any = { type: 'night', turn: room.turn, events: [] };

      let nightSummary = sysMsg("nightHasEnded", lang);
      const deadTonight = new Set<number>();
      let anyoneDied = false;

      // Step 1-2: figure out this night's targets, then map every attacker onto their target.
      // Mafia doesn't need consensus — every distinct target a mafia member
      // picked gets attacked for real (no more majority-vote-to-one-kill).
      const mafiaTargetIds = new Set<number>(Array.from(actions.mafiaKills.values()));
      // Only one Bodyguard's guard matters for resolution purposes — if several
      // are alive, each acted independently, but we resolve per attacked target below.
      const guardEntries = Array.from(actions.guards.entries()); // [bodyguardId, targetId][]
      const healedIds = new Set(Array.from(actions.doctorSaves.values()));

      type AttackerRef = { type: 'mafia' | 'vigilante'; id?: number };
      const targetAttackedBy = new Map<number, AttackerRef[]>();
      mafiaTargetIds.forEach((targetId: number) => {
        if (!targetAttackedBy.has(targetId)) targetAttackedBy.set(targetId, []);
        targetAttackedBy.get(targetId)!.push({ type: 'mafia' });
      });
      actions.shots.forEach((targetId: number, vigilanteId: number) => {
        if (!targetAttackedBy.has(targetId)) targetAttackedBy.set(targetId, []);
        targetAttackedBy.get(targetId)!.push({ type: 'vigilante', id: vigilanteId });
      });

      let newGuiltVigilanteId: number | null = null;

      if (targetAttackedBy.size === 0) {
        nightSummary += sysMsg("nothingHappenedNight", lang);
      }

      // Step 3: resolve each attacked target once.
      for (const [targetId, attackers] of Array.from(targetAttackedBy.entries())) {
        if (attackers.length === 0) continue;
        const victim = players.find((p: Player) => p.id === targetId);
        if (!victim) continue;

        const guardedBy = guardEntries.find(([, guardTargetId]) => guardTargetId === targetId)?.[0];

        if (guardedBy !== undefined) {
          // Bodyguard protection: they sacrifice themselves and block exactly ONE attacker.
          const guardian = players.find((p: Player) => p.id === guardedBy);
          if (guardian && guardian.isAlive) {
            deadTonight.add(guardian.id);
            anyoneDied = true;
            nightSummary += sysMsg("bodyguardDied", lang, { name: guardian.name });
            nightData.events.push({ type: 'bodyguard_death', target: guardian.name, role: 'bodyguard' });

            // Retaliation: the first attacker dies too.
            const blocked = attackers[0];
            if (blocked.type === 'mafia') {
              const aliveMafiaNow = players.filter((p: Player) => p.role === 'mafia' && p.isAlive && !deadTonight.has(p.id));
              if (aliveMafiaNow.length > 0) {
                const fallenMafia = aliveMafiaNow[Math.floor(Math.random() * aliveMafiaNow.length)];
                deadTonight.add(fallenMafia.id);
                nightSummary += sysMsg("attackerRetaliated", lang);
                nightData.events.push({ type: 'retaliation_death', target: fallenMafia.name, role: 'mafia' });
              }
            } else if (blocked.type === 'vigilante' && blocked.id) {
              const vigi = players.find((p: Player) => p.id === blocked.id);
              if (vigi && vigi.isAlive && !deadTonight.has(vigi.id)) {
                deadTonight.add(vigi.id);
                nightSummary += sysMsg("attackerRetaliated", lang);
                nightData.events.push({ type: 'retaliation_death', target: vigi.name, role: 'vigilante' });
              }
            }

            // The Bodyguard only blocks ONE attacker — if a second attacker also
            // hit this same target tonight, and the Doctor didn't heal them, the
            // target still dies.
            if (attackers.length > 1 && !healedIds.has(targetId)) {
              deadTonight.add(targetId);
              anyoneDied = true;
              nightSummary += `${buildRoleRevealSentence(victim.name, victim.role || "civilian", players, lang, "killed")} ${getRandomDeathStory(victim.name, lang)}`;
              nightData.events.push({ type: 'combined_kill', target: victim.name, role: victim.role });
              const secondAttacker = attackers[1];
              if (secondAttacker.type === 'vigilante' && victim.role !== 'mafia') newGuiltVigilanteId = secondAttacker.id || null;
            } else if (attackers.length > 1 && healedIds.has(targetId)) {
              nightSummary += sysMsg("mafiaFailedDoctorSaved", lang);
              nightData.events.push({ type: 'attempt', target: victim.name, saved: true });
            }
            continue;
          }
        }

        // No living Bodyguard covering this target — does the Doctor's heal cover them?
        if (healedIds.has(targetId)) {
          nightSummary += sysMsg("mafiaFailedDoctorSaved", lang);
          nightData.events.push({ type: 'attempt', target: victim.name, saved: true });
          continue;
        }

        // No protection at all — the target dies.
        deadTonight.add(targetId);
        anyoneDied = true;
        nightSummary += `${buildRoleRevealSentence(victim.name, victim.role || "civilian", players, lang, "killed")} ${getRandomDeathStory(victim.name, lang)}`;
        nightData.events.push({ type: 'kill', target: victim.name, role: victim.role });

        // Guilt: any Vigilante who shot this target dies of guilt if the target wasn't Mafia.
        const vigiAttacker = attackers.find(a => a.type === 'vigilante');
        if (vigiAttacker && victim.role !== 'mafia') newGuiltVigilanteId = vigiAttacker.id || null;
      }

      // Apply all deaths from tonight in one pass.
      for (const deadId of Array.from(deadTonight)) {
        await storage.updatePlayer(deadId, { isAlive: false });
      }

      if (anyoneDied) revealDelayMs = ELIMINATION_REVEAL_MS; // overlay always shows for 5s regardless of showRoleReveal — that setting only hides the role text inside it

      // Guilt catches up: if a Vigilante shot an innocent last night, they die now.
      const pendingGuiltId = vigilanteGuiltPending.get(roomId);
      if (pendingGuiltId && !deadTonight.has(pendingGuiltId)) {
        const guiltyVigi = players.find((p: Player) => p.id === pendingGuiltId);
        if (guiltyVigi && guiltyVigi.isAlive) {
          await storage.updatePlayer(guiltyVigi.id, { isAlive: false });
          deadTonight.add(guiltyVigi.id);
          revealDelayMs = ELIMINATION_REVEAL_MS; // overlay always shows for 5s regardless of showRoleReveal — that setting only hides the role text inside it
          nightSummary += sysMsg("vigilanteGuiltDied", lang, { name: guiltyVigi.name });
          nightData.events.push({ type: 'guilt_death', target: guiltyVigi.name, role: 'vigilante' });
        }
      }
      if (newGuiltVigilanteId) {
        vigilanteGuiltPending.set(roomId, newGuiltVigilanteId);
      } else {
        vigilanteGuiltPending.delete(roomId);
      }

      actions.detectiveChecks.forEach((targetId: number, detectiveId: number) => {
        const target = players.find((p: Player) => p.id === targetId);
        if (target) {
          nightData.events.push({ type: 'detective_check', target: target.name, isMafia: target.role === 'mafia', detectiveId });
        }
      });

      history.push(nightData);
      gameHistory.set(roomId, history);

      await storage.createMessage({ roomId, playerId: 0, playerName: sysName(lang), content: nightSummary });
      await storage.updateRoom(roomId, { status: 'day', phase: 'discussion', lastUpdated: new Date(Date.now() + revealDelayMs) });
      actions.votes.clear();
      actions.mafiaKills.clear();
      actions.doctorSaves.clear();
      actions.detectiveChecks.clear();
      actions.guards.clear();
      actions.shots.clear();
      broadcastState(roomId);
    }
  }

  gameActions.set(roomId, actions);
  
  const updatedPlayersRef = await storage.getPlayersInRoom(roomId);
  const aliveMafiaCount = updatedPlayersRef.filter((p: Player) => p.role === 'mafia' && p.isAlive).length;
  const aliveCiviliansCount = updatedPlayersRef.filter((p: Player) => p.role !== 'mafia' && p.isAlive).length;

  const currentRoom = await storage.getRoom(roomId);
  if (currentRoom) {
    if (aliveMafiaCount === 0 || aliveMafiaCount >= aliveCiviliansCount) {
      const history = gameHistory.get(roomId) || [];
      const playersInRoom = await storage.getPlayersInRoom(roomId);
      
      const winner = aliveMafiaCount === 0 ? 'civilians' : 'mafia';
      history.push({
        type: 'game_end',
        winner,
        roles: playersInRoom.map((p: Player) => ({ name: p.name, role: p.role }))
      });
      
      for (const p of playersInRoom) {
        await storage.updatePlayer(p.id, {
          gameHistory: history,
          gamesPlayed: (p.gamesPlayed || 0) + 1,
          wins: (p.wins || 0) + (winner === 'civilians' && p.role !== 'mafia' ? 1 : winner === 'mafia' && p.role === 'mafia' ? 1 : 0)
        });
      }
      await storage.updateRoom(roomId, { status: 'ended' });
      if (phaseTimers.has(roomId)) { clearTimeout(phaseTimers.get(roomId)); phaseTimers.delete(roomId); }
      gameActions.delete(roomId);
      broadcastState(roomId);
    } else {
      let duration = (currentRoom.settings as any).phaseDuration * 1000 || PHASE_DURATION;
      if (currentRoom.status === 'night') {
        duration = getNightPhaseDuration(currentRoom.phase, currentRoom.settings as any);
      }
      // revealDelayMs is only ever nonzero here when this phase's lastUpdated was
      // itself pushed into the future above (an elimination just happened) — keep
      // the real timer in sync with that so the phase doesn't get cut short.
      const timer = setTimeout(() => advancePhase(roomId, wss, storage, roomClients, clients, gameActions), duration + revealDelayMs);
      phaseTimers.set(roomId, timer);
      void scheduleBotQuickActions(roomId, wss, storage, roomClients, clients, gameActions);
    }
  }
  broadcastState(roomId);
}

const clients = new Map<string, WebSocket>();
const roomClients = new Map<number, Set<string>>();
const gameActions = new Map<number, {
  votes: Map<number, number>,
  mafiaKills: Map<number, number>,
  doctorSaves: Map<number, number>,
  detectiveChecks: Map<number, number>,
  guards: Map<number, number>,
  shots: Map<number, number>
}>();

async function broadcastState(roomId: number) {
  const sessions = roomClients.get(roomId);
  if (!sessions || sessions.size === 0) return;

  const room = await storage.getRoom(roomId);
  if (!room) return;
  const players = await storage.getPlayersInRoom(roomId);
  
  let messages: Message[] = [];
  try {
    messages = await storage.getMessagesByRoom(roomId);
  } catch (err) {
    console.error("Error fetching messages for room", roomId, err);
  }

  sessions.forEach(sessionId => {
    const ws = clients.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const me = players.find((p: Player) => p.sessionId === sessionId);
      const actions = gameActions.get(roomId);
      const myAction = me ? {
        vote: actions?.votes.get(me.id),
        kill: me.role === 'mafia' ? actions?.mafiaKills.get(me.id) || null : null,
        heal: me.role === 'doctor' ? actions?.doctorSaves.get(me.id) || null : null,
        check: me.role === 'detective' ? actions?.detectiveChecks.get(me.id) || null : null,
        guard: me.role === 'bodyguard' ? actions?.guards.get(me.id) || null : null,
        shoot: me.role === 'vigilante' ? actions?.shots.get(me.id) || null : null,
      } : null;

      const sanitizedPlayers = players.map((p: Player) => {
         if (room.status === 'lobby' || room.status === 'ended') return p;
         if (me?.id === p.id) return p;
         if (me && !me.isAlive) return p;
         // A dead player's role is only shown to the rest of the room if the host
         // has role-reveal-on-elimination turned on; otherwise it stays hidden
         // like any other living player's role would be.
         if (!p.isAlive) {
           return (room.settings as any).showRoleReveal !== false ? p : { ...p, role: 'unknown' };
         }
         // Every role except Civilian gets to recognize others sharing their
         // role (this covers actual teams like Mafia, but also lets solo
         // roles like multiple Doctors/Bodyguards/Vigilantes/Mayors/Jesters
         // know who else shares their role, same as before).
         if (me?.role && me.role !== 'civilian' && p.role === me.role) return p;
         return { ...p, role: 'unknown' }; 
      });

      const revealedMayorIds = Array.from(mayorRevealed.get(roomId) || []);
      const myBullets = me?.role === 'vigilante' ? (vigilanteBullets.get(roomId)?.get(me.id) ?? 0) : undefined;

      // Graveyard chat: messages tagged isSpectator (sent by dead players)
      // are only visible to other dead players — anyone still alive in the
      // game only sees the normal in-game chat.
      // Mafia chat: messages tagged isMafiaChat are only sent to alive mafia
      // players — never to the rest of the room, not even at the network level.
      const visibleMessages = messages.filter((m: Message) => {
        if ((m as any).isSpectator) return !!me && !me.isAlive;
        if ((m as any).isMafiaChat) return !!me && me.isAlive && me.role === 'mafia';
        return true;
      });

      const aliveMafiaCount = players.filter((p: Player) => p.isAlive && p.role === 'mafia').length;
      const mafiaChatAvailable = !!me && me.isAlive && me.role === 'mafia' && aliveMafiaCount >= 2;

      ws.send(JSON.stringify({
        type: WS_EVENTS.STATE_UPDATE,
        payload: {
          room, players: sanitizedPlayers,
          me: me ? { ...me, currentAction: myAction } : me,
          messages: visibleMessages,
          revealedMayorIds,
          myBullets,
          mafiaChatAvailable,
        }
      }));
    }
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Keep-alive: free-tier hosts (Render, Railway, etc.) spin the server down
  // after a period of no incoming traffic. This route gives something to
  // ping, and the setInterval below pings it on its own so the server never
  // sits idle long enough to sleep.
  app.get("/ping", (_req, res) => {
    res.status(200).send("OK");
  });

  setInterval(() => {
    const selfUrl = process.env.SELF_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 5000}`;
    fetch(`${selfUrl}/ping`).catch(() => {
      // Ignore failures — a missed ping just means we try again in 10 minutes.
    });
  }, 10 * 60 * 1000);

  // Reward-system tables. All keyed on supabase_user_id (a real signed-in account)
  // rather than a client-generated sessionId/localStorage token, which is what
  // made the old client-only versions of these features exploitable — clearing
  // localStorage or opening a new incognito tab reset the "identity" the limits
  // were tracked against. Requiring an account closes that off. Dates are always
  // computed server-side (UTC), so the device's clock/timezone can't be gamed either.
  try {
    const bootstrapClient = await pool.connect();
    try {
      await bootstrapClient.query(`
        CREATE TABLE IF NOT EXISTS ad_claims (
          session_id TEXT NOT NULL,
          claim_date TEXT NOT NULL,
          claim_count INT NOT NULL DEFAULT 0,
          last_claim_at TIMESTAMPTZ,
          PRIMARY KEY (session_id, claim_date)
        );
      `);
      await bootstrapClient.query(`ALTER TABLE ad_claims ADD COLUMN IF NOT EXISTS supabase_user_id TEXT;`);
      await bootstrapClient.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_mafia_chat BOOLEAN DEFAULT false;`);
      await bootstrapClient.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_spectator BOOLEAN DEFAULT false;`);
      await bootstrapClient.query(`
        CREATE TABLE IF NOT EXISTS daily_streaks (
          supabase_user_id TEXT PRIMARY KEY,
          current_streak INT NOT NULL DEFAULT 0,
          longest_streak INT NOT NULL DEFAULT 0,
          last_claim_date TEXT
        );
      `);
      await bootstrapClient.query(`
        CREATE TABLE IF NOT EXISTS ratings (
          supabase_user_id TEXT PRIMARY KEY,
          stars INT NOT NULL,
          rated_at TIMESTAMPTZ NOT NULL,
          last_edit_at TIMESTAMPTZ NOT NULL
        );
      `);
      await bootstrapClient.query(`
        CREATE TABLE IF NOT EXISTS referral_links (
          supabase_user_id TEXT PRIMARY KEY,
          code TEXT UNIQUE NOT NULL
        );
      `);
      await bootstrapClient.query(`ALTER TABLE referral_links ADD COLUMN IF NOT EXISTS signup_ip TEXT;`);
      await bootstrapClient.query(`ALTER TABLE referral_links ADD COLUMN IF NOT EXISTS signup_device_id TEXT;`);
      await bootstrapClient.query(`
        CREATE TABLE IF NOT EXISTS referral_claims (
          id SERIAL PRIMARY KEY,
          referrer_user_id TEXT NOT NULL,
          referred_user_id TEXT UNIQUE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      // Referral fraud prevention: claims start 'pending' and only pay out once
      // the referred account has genuinely played (see tryResolveReferralClaim),
      // or get 'denied'/'flagged' instead of ever being paid.
      await bootstrapClient.query(`ALTER TABLE referral_claims ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';`);
      await bootstrapClient.query(`ALTER TABLE referral_claims ADD COLUMN IF NOT EXISTS signup_ip TEXT;`);
      await bootstrapClient.query(`ALTER TABLE referral_claims ADD COLUMN IF NOT EXISTS signup_device_id TEXT;`);
      await bootstrapClient.query(`ALTER TABLE referral_claims ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;`);
      await bootstrapClient.query(`
        CREATE TABLE IF NOT EXISTS account_activity (
          supabase_user_id TEXT PRIMARY KEY,
          games_completed INT NOT NULL DEFAULT 0,
          games_with_activity INT NOT NULL DEFAULT 0,
          afk_reports INT NOT NULL DEFAULT 0
        );
      `);
      await bootstrapClient.query(`
        CREATE TABLE IF NOT EXISTS account_credits (
          supabase_user_id TEXT PRIMARY KEY,
          credits INT NOT NULL DEFAULT 0
        );
      `);
    } finally {
      bootstrapClient.release();
    }
  } catch (e: any) {
    console.error("Reward table bootstrap failed:", e.message);
  }

  // Adds credits to a user's server-side balance and returns the new total.
  // This is the one authoritative wallet all four reward systems pay into.
  // (Defined at module level below, alongside the referral fraud-check helpers.)

  // Auth endpoints
  app.post(api.auth.signup.path, async (req, res) => {
    try {
      const input = api.auth.signup.input.parse(req.body);
      const existing = await storage.getUserByUsername(input.username);
      if (existing) return res.status(400).json({ message: "Username already taken" });

      const user = await storage.createUser({
        username: input.username,
        passwordHash: hashPassword(input.password),
        name: input.name,
        avatar: input.avatar,
        avatarConfig: {},
        wins: 0,
        gamesPlayed: 0,
        achievements: [],
        email: null,
        resetToken: null,
        resetTokenExpires: null,
        totpSecret: null,
        is2FAEnabled: null,
        credits: 0,
        supabaseUserId: null,
      });

      res.status(201).json({
        userId: user.id,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
      });
    } catch (err: any) {
      console.error("Signup error:", err);
      const isNetworkError = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetworkError) {
        return res.status(503).json({ message: "Server temporarily unavailable. Please wait a moment and try again." });
      }
      res.status(400).json({ message: err?.message || "Signup failed" });
    }
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByUsername(input.username);
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (user.is2FAEnabled) {
        return res.status(200).json({ requires2FA: true, userId: user.id });
      }

      res.json({ userId: user.id, username: user.username, name: user.name, avatar: user.avatar });
    } catch (error: any) {
      const isNetwork = error?.message?.includes("EAI_AGAIN") || error?.message?.includes("getaddrinfo") || error?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please try again shortly." });
      res.status(401).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/login-2fa", loginLimiter, async (req, res) => {
    try {
      const { username, password, totpCode } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (!user.is2FAEnabled || !user.totpSecret) {
        return res.status(400).json({ message: "2FA not enabled" });
      }

      const { TOTP } = await import("otpauth");
      const totp = new TOTP({ secret: user.totpSecret });
      const isValid = totp.validate({ token: totpCode, window: 1 }) !== null;

      if (!isValid) return res.status(401).json({ message: "Invalid 2FA code" });

      res.json({ userId: user.id, username: user.username, name: user.name, avatar: user.avatar });
    } catch (err: any) {
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please try again shortly." });
      res.status(400).json({ message: err?.message || "2FA login failed" });
    }
  });

  app.post(api.auth.forgotPassword.path, async (req, res) => {
    try {
      const input = api.auth.forgotPassword.input.parse(req.body);
      const user = await storage.getUserByUsername(input.username);
      if (!user) {
        return res.status(200).json({ message: "If this account exists, a reset link has been generated." });
      }

      const token = randomUUID();
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await storage.updateUser(user.id, { resetToken: token, resetTokenExpires: expires });

      console.log(`[PASSWORD RESET] Token for ${user.username}: ${token}`);

      res.json({ message: "If this account exists, a reset link has been generated.", resetToken: token });
    } catch (err: any) {
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please try again shortly." });
      res.status(400).json({ message: err?.message || "Request failed" });
    }
  });

  app.post(api.auth.resetPassword.path, async (req, res) => {
    try {
      const input = api.auth.resetPassword.input.parse(req.body);
      const user = await storage.getUserByResetToken(input.token);
      if (!user || !user.resetTokenExpires || new Date() > new Date(user.resetTokenExpires)) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      await storage.updateUser(user.id, { passwordHash: hashPassword(input.newPassword), resetToken: null, resetTokenExpires: null });

      res.json({ message: "Password updated successfully" });
    } catch (err: any) {
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please try again shortly." });
      res.status(400).json({ message: err?.message || "Reset failed" });
    }
  });

  app.post("/api/auth/2fa/setup", async (req, res) => {
    try {
      const { supabaseUserId } = req.body;
      if (!supabaseUserId) return res.status(400).json({ message: "Missing user ID" });

      const { TOTP } = await import("otpauth");
      const secret = new TOTP({
        issuer: "Mafia Game",
        label: supabaseUserId,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      }).secret.base32;

      const uri = `otpauth://totp/Mafia%20Game:${encodeURIComponent(supabaseUserId)}?secret=${secret}&issuer=Mafia%20Game&algorithm=SHA1&digits=6&period=30`;

      await db.insert(userMfa)
        .values({ supabaseUserId, totpSecret: secret, isEnabled: false, mfaMethod: "totp" })
        .onConflictDoUpdate({
          target: userMfa.supabaseUserId,
          set: { totpSecret: secret, isEnabled: false, mfaMethod: "totp" },
        });

      res.json({ secret, qrCodeUri: uri });
    } catch (err: any) {
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please try again shortly." });
      res.status(400).json({ message: err?.message || "Setup failed" });
    }
  });

  // Feature: Email 2FA option — sends a fresh 6-digit code to the user's email
  // as an alternative to the Authenticator app. Used both for initial setup
  // (to confirm the email) and for each subsequent login.
  app.post("/api/auth/2fa/setup-email", async (req, res) => {
    try {
      const { supabaseUserId, email } = req.body;
      if (!supabaseUserId || !email) return res.status(400).json({ message: "Missing user ID or email" });

      const code = generateSixDigitCode();
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await db.insert(userMfa)
        .values({ supabaseUserId, mfaMethod: "email", mfaEmail: email, emailCode: code, emailCodeExpires: expires, isEnabled: false })
        .onConflictDoUpdate({
          target: userMfa.supabaseUserId,
          set: { mfaMethod: "email", mfaEmail: email, emailCode: code, emailCodeExpires: expires, isEnabled: false },
        });

      await sendEmail(email, "Your Mafia Verse verification code", build2FAEmailHtml(code));

      res.json({ sent: true });
    } catch (err: any) {
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please try again shortly." });
      res.status(400).json({ message: err?.message || "Could not send verification email" });
    }
  });

  // Sends a fresh login-time code to an already-configured email-2FA user.
  // TOTP users don't need this — their app generates codes on its own.
  app.post("/api/auth/2fa/send-login-code", twoFaVerifyLimiter, async (req, res) => {
    try {
      const { supabaseUserId } = req.body;
      if (!supabaseUserId) return res.status(400).json({ message: "Missing user ID" });

      const [mfa] = await db.select().from(userMfa).where(eq(userMfa.supabaseUserId, supabaseUserId));
      if (!mfa || mfa.mfaMethod !== "email" || !mfa.mfaEmail) {
        return res.status(400).json({ message: "Email 2FA not set up for this account" });
      }

      const code = generateSixDigitCode();
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      await db.update(userMfa).set({ emailCode: code, emailCodeExpires: expires }).where(eq(userMfa.supabaseUserId, supabaseUserId));

      await sendEmail(mfa.mfaEmail, "Your Mafia Verse verification code", build2FAEmailHtml(code));
      res.json({ sent: true });
    } catch (err: any) {
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please try again shortly." });
      res.status(400).json({ message: err?.message || "Could not send verification email" });
    }
  });

  app.post("/api/auth/2fa/verify", twoFaVerifyLimiter, async (req, res) => {
    try {
      const { supabaseUserId, code } = req.body;
      if (!supabaseUserId || !code) return res.status(400).json({ message: "Missing fields" });

      const [mfa] = await db.select().from(userMfa).where(eq(userMfa.supabaseUserId, supabaseUserId));
      if (!mfa) {
        return res.status(400).json({ message: "2FA not set up" });
      }

      if (mfa.mfaMethod === "email") {
        if (!mfa.emailCode || !mfa.emailCodeExpires) {
          return res.status(400).json({ message: "No pending verification code. Request a new one." });
        }
        if (new Date() > new Date(mfa.emailCodeExpires)) {
          return res.status(400).json({ message: "Code expired. Request a new one." });
        }
        if (mfa.emailCode !== code) {
          return res.status(400).json({ message: "Invalid code" });
        }
        // Clear the used code so it can't be replayed, then mark enabled
        await db.update(userMfa).set({ isEnabled: true, emailCode: null, emailCodeExpires: null }).where(eq(userMfa.supabaseUserId, supabaseUserId));
        return res.json({ enabled: true });
      }

      // Default / "totp" path
      if (!mfa.totpSecret) {
        return res.status(400).json({ message: "2FA not set up" });
      }
      const { TOTP } = await import("otpauth");
      const totp = new TOTP({ secret: mfa.totpSecret });
      const isValid = totp.validate({ token: code, window: 1 }) !== null;

      if (!isValid) return res.status(400).json({ message: "Invalid code" });

      await db.update(userMfa).set({ isEnabled: true }).where(eq(userMfa.supabaseUserId, supabaseUserId));
      res.json({ enabled: true });
    } catch (err: any) {
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please try again shortly." });
      res.status(400).json({ message: err?.message || "Verification failed" });
    }
  });

  app.get("/api/auth/2fa/status", async (req, res) => {
    try {
      const supabaseUserId = req.query.supabaseUserId as string;
      if (!supabaseUserId) return res.status(400).json({ message: "Missing user ID" });
      const [mfa] = await db.select().from(userMfa).where(eq(userMfa.supabaseUserId, supabaseUserId));
      res.json({ isEnabled: mfa?.isEnabled ?? false, method: mfa?.mfaMethod ?? "totp" });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Status check failed" });
    }
  });

  app.post("/api/auth/2fa/disable", async (req, res) => {
    try {
      const { supabaseUserId } = req.body;
      if (!supabaseUserId) return res.status(400).json({ message: "Missing user ID" });

      await db.update(userMfa).set({ isEnabled: false, totpSecret: null, mfaMethod: "totp", mfaEmail: null, emailCode: null, emailCodeExpires: null }).where(eq(userMfa.supabaseUserId, supabaseUserId));
      res.json({ disabled: true });
    } catch (err: any) {
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please try again shortly." });
      res.status(400).json({ message: err?.message || "Disable failed" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const userId = req.query.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUserById(Number(userId));
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ userId: user.id, username: user.username, name: user.name, avatar: user.avatar, is2FAEnabled: user.is2FAEnabled });
    } catch (err: any) {
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable." });
      res.status(400).json({ message: err?.message || "Failed to fetch user" });
    }
  });

  app.post(api.rooms.create.path, roomCreateLimiter, async (req, res) => {
    try {
      const input = api.rooms.create.input.parse(req.body);
      const s = input.settings as any;
      const totalRoles = (s.mafiaCount || 0) + (s.detectiveCount || 0) + (s.doctorCount || 0) + (s.civilianCount || 0)
        + (s.bodyguardCount || 0) + (s.vigilanteCount || 0) + (s.mayorCount || 0) + (s.jesterCount || 0);
      if ((s.mafiaCount || 0) < 1) {
        return res.status(400).json({ message: "You need at least 1 Mafia to start a game." });
      }
      if ((s.civilianCount || 0) < 1) {
        return res.status(400).json({ message: "You need at least 1 Civilian to start a game." });
      }
      const totalSpecialRoles = (s.mafiaCount || 0) + (s.detectiveCount || 0) + (s.doctorCount || 0)
        + (s.bodyguardCount || 0) + (s.vigilanteCount || 0) + (s.mayorCount || 0) + (s.jesterCount || 0);
      if (totalSpecialRoles > MAX_SPECIAL_ROLES) {
        return res.status(400).json({ message: `Too many special roles — max ${MAX_SPECIAL_ROLES}, to keep large games fair.` });
      }
      if (totalRoles > MAX_PLAYERS_PER_ROOM) {
        return res.status(400).json({ message: `Too many people — rooms cap out at ${MAX_PLAYERS_PER_ROOM} players.` });
      }
      const room = await storage.createRoom({ ...input.settings, phaseDuration: input.settings.phaseDuration ?? 30 } as any);
      
      const sessionId = randomUUID();
      const player = await storage.createPlayer({
        roomId: room.id,
        name: input.name,
        avatar: input.avatar,
        avatarConfig: (input as any).avatarConfig || {},
        role: null,
        isAlive: true,
        isHost: true,
        sessionId,
        supabaseUserId: (input as any).supabaseUserId || null,
        isSpectator: false,
        isBot: false,
        wins: 0,
        gamesPlayed: 0,
        achievements: [],
        gameHistory: [],
        credits: 0,
      });

      res.status(201).json({ code: room.code, playerId: player.id, sessionId });

      void setTimeout(() => {
        (async () => {
          try {
            const playersInRoom = await storage.getPlayersInRoom(room.id);
            if (playersInRoom.length < 6) {
              await fillWithBots(room.id, storage);
              await broadcastState(room.id);
            }
          } catch (err) {
            console.error("Error filling bots or broadcasting:", err);
          }
        })();
      }, 1000);
    } catch (err: any) {
      console.error("POST /api/rooms failed:", err);
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please wait a moment and try again." });
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: err?.message || "Internal server error" });
    }
  });

  app.post(api.rooms.join.path, async (req, res) => {
    try {
      const input = api.rooms.join.input.parse(req.body);
      const room = await storage.getRoomByCode(input.code);
      if (!room) return res.status(404).json({ message: "Room not found" });

      const players = await storage.getPlayersInRoom(room.id);
      if (players.length >= MAX_PLAYERS_PER_ROOM) {
        return res.status(400).json({ message: `Room is full (max ${MAX_PLAYERS_PER_ROOM} players).` });
      }
      const sessionId = randomUUID();
      const isSpectator = room.status !== "lobby";

      const player = await storage.createPlayer({
        roomId: room.id,
        name: input.name,
        avatar: input.avatar,
        avatarConfig: (input as any).avatarConfig || {},
        role: null,
        isAlive: !isSpectator,
        isHost: players.length === 0,
        sessionId,
        supabaseUserId: (input as any).supabaseUserId || null,
        isSpectator,
        isBot: false,
        wins: 0,
        gamesPlayed: 0,
        achievements: [],
        gameHistory: [],
        credits: 0,
      });

      res.json({ code: room.code, playerId: player.id, sessionId });

      setTimeout(async () => {
        const playersInRoom = await storage.getPlayersInRoom(room.id);
        const bots = playersInRoom.filter(p => p.isBot);
        if (playersInRoom.length > 6 && bots.length > 0) {
          await storage.deletePlayer(bots[0].id);
        } else if (playersInRoom.length < 6) {
          await fillWithBots(room.id, storage);
        }
        broadcastState(room.id);
      }, 1000);
    } catch (err: any) {
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please wait a moment and try again." });
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.rooms.get.path, async (req, res) => {
    try {
      const code = (req.params as any).code as string;
      if (!code) return res.status(400).json({ message: "Room code required" });

      const room = await storage.getRoomByCode(code);
      if (!room) return res.status(404).json({ message: "Room not found" });

      const players = await storage.getPlayersInRoom(room.id);
      const messages = await storage.getMessagesByRoom(room.id);

      res.json({ room, players, messages, me: null });
    } catch (err) {
      console.error("GET room error", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    let mySessionId: string | null = null;
    let myRoomId: number | null = null;

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log("WS MESSAGE:", msg.type, msg.payload?.type || msg.payload?.content?.substring(0, 50) || "");

        if (msg.type === WS_EVENTS.JOIN) {
          const { code, sessionId } = msg.payload;
          const room = await storage.getRoomByCode(code);
          if (!room) return;
          const players = await storage.getPlayersInRoom(room.id);
          const player = players.find((p: Player) => p.sessionId === sessionId);
          if (!player) return;

          mySessionId = sessionId;
          myRoomId = room.id;
          clients.set(sessionId, ws);
          if (!roomClients.has(room.id)) roomClients.set(room.id, new Set());
          roomClients.get(room.id)!.add(sessionId);
          broadcastState(room.id);
        }

        if (msg.type === WS_EVENTS.START_GAME) {
          if (!myRoomId || !mySessionId) return;
          const players = await storage.getPlayersInRoom(myRoomId);
          const me = players.find((p: Player) => p.sessionId === mySessionId);
          if (!me?.isHost) return;

          const room = await storage.getRoom(myRoomId);
          if (room?.status !== 'lobby') return;

          if (players.length < 6) {
            ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: "Minimum 6 players required." } }));
            return;
          }

          const updatedPlayers = assignRoles(players, room.settings);
          for (const p of updatedPlayers) {
            await storage.updatePlayer(p.id, { role: p.role });
          }

          // Every client shows a ~4s "your role is..." overlay on the first night, during
          // which they can't act. Push lastUpdated (and the matching phase timer) out by
          // that same amount so the mafia's actual night timer only starts once the reveal
          // animation ends, instead of quietly eating into their real decision time.
          // This animation always plays — it's not gated by a setting (showRoleReveal
          // controls whether a role gets announced on elimination, a separate thing).
          const revealDelayMs = ROLE_REVEAL_MS;

          const firstNightPlayers = await storage.getPlayersInRoom(myRoomId);
          const firstPhase = getFirstNightPhase(firstNightPlayers);
          await storage.updateRoom(myRoomId, { status: 'night', phase: firstPhase, turn: 1, lastUpdated: new Date(Date.now() + revealDelayMs) });
          gameActions.set(myRoomId, {
            votes: new Map(),
            mafiaKills: new Map(),
            doctorSaves: new Map(),
            detectiveChecks: new Map(),
            guards: new Map(),
            shots: new Map()
          });
          gameHistory.set(myRoomId, []);
          // Vigilante starts with exactly 2 bullets for the whole game.
          const bulletsMap = new Map<number, number>();
          for (const p of firstNightPlayers) {
            if (p.role === 'vigilante') bulletsMap.set(p.id, 2);
          }
          vigilanteBullets.set(myRoomId, bulletsMap);
          mayorRevealed.set(myRoomId, new Set());

          const startSettings = room.settings as any;
          const duration = getNightPhaseDuration(firstPhase, startSettings);
          const timer = setTimeout(() => advancePhase(myRoomId!, wss, storage, roomClients, clients, gameActions), duration + revealDelayMs);
          phaseTimers.set(myRoomId, timer);
          void scheduleBotQuickActions(myRoomId, wss, storage, roomClients, clients, gameActions);
          broadcastState(myRoomId);
        }

        if (msg.type === WS_EVENTS.ACTION) {
           console.log("ACTION HANDLER ENTERED, payload:", msg.payload);
           if (!myRoomId || !mySessionId) {
             console.log("BLOCKED: myRoomId or mySessionId missing", { myRoomId, mySessionId });
             return;
           }
           const action = msg.payload as GameAction;
           const players = await storage.getPlayersInRoom(myRoomId);
           const me = players.find((p: Player) => p.sessionId === mySessionId);
           const room = await storage.getRoom(myRoomId);
           console.log("ACTION LOOKUP:", { actionType: action.type, meExists: !!me, roomExists: !!room });
           if (!me || !room) {
             console.log("BLOCKED: me or room missing");
             return;
           }

           const actions = gameActions.get(myRoomId) || { votes: new Map(), mafiaKills: new Map(), doctorSaves: new Map(), detectiveChecks: new Map(), guards: new Map(), shots: new Map() };

           if (action.type === 'chat') {
             console.log("CHAT ACTION received:", { content: (action as any).content, myRoomId, meId: me?.id, meExists: !!me, meAlive: me?.isAlive });
             if ((action as any).content && (action as any).content.trim() && myRoomId && me) {
               try {
                 // A player can only send to the mafia channel if they're
                 // actually alive mafia — never trust the client's claim.
                 const requestedChannel = (action as any).channel;
                 const isMafiaChat = requestedChannel === 'mafia' && me.isAlive && me.role === 'mafia';
                 // Dead players can still talk to each other in the graveyard —
                 // their messages are tagged isSpectator so broadcastState can
                 // hide them from players who are still alive in the game.
                 console.log("CREATING MESSAGE:", { roomId: myRoomId, playerId: me.id, content: (action as any).content });
                 await storage.createMessage({ 
                   roomId: myRoomId, 
                   playerId: me.id, 
                   playerName: me.name, 
                   content: (action as any).content.trim(),
                   isSpectator: !me.isAlive,
                   isMafiaChat,
                 } as any);
                 console.log("MESSAGE CREATED SUCCESSFULLY");
                 bumpActivity(myRoomId, me.id, "messages");
                 if (me.isAlive && !isMafiaChat) await respondToHumanChat(myRoomId, (action as any).content.trim(), storage);
                 broadcastState(myRoomId);
               } catch (err) {
                 console.error("Error creating message", err);
                 const chatLang = (room.settings as any)?.language === "es" ? "es" : "en";
                 ws.send(JSON.stringify({ type: 'notification', payload: { title: sysMsg("chatErrorTitle", chatLang), body: sysMsg("chatErrorBody", chatLang) } }));
               }
             }
             return;
           }

           if (action.type === 'add_bots' && me.isHost) {
             const { added, cappedAtMax } = await fillWithBots(myRoomId, storage);
             if (cappedAtMax) {
               ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: `You can only play with ${MAX_BOTS_PER_ROOM} bots at a time per room.` } }));
             }
             if (added > 0) broadcastState(myRoomId);
             return;
           }

           if (action.type === 'remove_bot' && me.isHost) {
             const bot = players.find((p: Player) => p.id === action.playerId && p.isBot);
             if (bot) { await storage.deletePlayer(bot.id); broadcastState(myRoomId); }
             return;
           }

           if (action.type === 'update_settings' && me.isHost) {
             if (room.status !== 'lobby') {
               ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: "Settings can only be changed in the lobby." } }));
               return;
             }
             const incoming = (action as any).settings || {};
             const clampInt = (val: any, fallback: number) => {
               const n = parseInt(val, 10);
               return Number.isFinite(n) && n >= 0 ? n : fallback;
             };
             const current = room.settings as any;
             const mafiaCount = clampInt(incoming.mafiaCount, current.mafiaCount);
             const detectiveCount = clampInt(incoming.detectiveCount, current.detectiveCount);
             const doctorCount = clampInt(incoming.doctorCount, current.doctorCount);
             const civilianCount = clampInt(incoming.civilianCount, current.civilianCount);
             const bodyguardCount = clampInt(incoming.bodyguardCount, current.bodyguardCount || 0);
             const vigilanteCount = clampInt(incoming.vigilanteCount, current.vigilanteCount || 0);
             const mayorCount = clampInt(incoming.mayorCount, current.mayorCount || 0);
             const jesterCount = clampInt(incoming.jesterCount, current.jesterCount || 0);

             // Leave room for at least one civilian so the special roles don't outnumber
             // everyone else and break voting.
             const totalSpecialRoles = mafiaCount + detectiveCount + doctorCount + bodyguardCount + vigilanteCount + mayorCount + jesterCount;
             if (mafiaCount < 1) {
               ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: "You need at least 1 Mafia." } }));
               return;
             }
             if (civilianCount < 1) {
               ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: "You need at least 1 Civilian." } }));
               return;
             }
             if (totalSpecialRoles > MAX_SPECIAL_ROLES) {
               ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: `Too many special roles — max ${MAX_SPECIAL_ROLES}, to keep large games fair.` } }));
               return;
             }
             if (totalSpecialRoles >= players.length) {
               ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: "Too many special roles for the current player count." } }));
               return;
             }

             const newSettings = {
               ...current,
               mafiaCount, detectiveCount, doctorCount, civilianCount,
               bodyguardCount, vigilanteCount, mayorCount, jesterCount,
               phaseDuration: clampInt(incoming.phaseDuration, current.phaseDuration),
               mafiaDuration: clampInt(incoming.mafiaDuration, current.mafiaDuration),
               doctorDuration: clampInt(incoming.doctorDuration, current.doctorDuration),
               detectiveDuration: clampInt(incoming.detectiveDuration, current.detectiveDuration),
               bodyguardDuration: clampInt(incoming.bodyguardDuration, current.bodyguardDuration || 15),
               vigilanteDuration: clampInt(incoming.vigilanteDuration, current.vigilanteDuration || 15),
               showVoteResults: incoming.showVoteResults ?? current.showVoteResults,
               showRoleReveal: incoming.showRoleReveal ?? current.showRoleReveal,
             };
             await storage.updateRoom(myRoomId, { settings: newSettings } as any);
             broadcastState(myRoomId);
             return;
           }

           if (action.type === 'replay' && me.isHost) {
             const currentRoom = await storage.getRoom(myRoomId);
             if (currentRoom?.status !== 'ended') return;
             
             const survivors = players.filter((p: Player) => p.isAlive);
             const mafiaCount = survivors.filter(p => p.role === 'mafia').length;
             const innocentsCount = survivors.length - mafiaCount;
             
             let winners: string[] = [];
             if (mafiaCount > 0 && innocentsCount === 0) winners = ['mafia'];
             else if (mafiaCount === 0) winners = ['civilian', 'doctor', 'detective'];

             for (const p of players) {
               if (p.isBot) {
                 await storage.updatePlayer(p.id, { role: null, isAlive: true, isSpectator: false, gameHistory: [] });
                 continue;
               }
               const isWinner = p.role && winners.includes(p.role);
               const newWins = (p.wins || 0) + (isWinner ? 1 : 0);
               const newGamesPlayed = (p.gamesPlayed || 0) + 1;
               
               const currentAchievements = (p.achievements as string[]) || [];
               const earnedAchievements = new Set(currentAchievements);
               
               if (isWinner && !earnedAchievements.has('first_win')) earnedAchievements.add('first_win');
               if (isWinner && p.role === 'mafia' && newWins >= 5) earnedAchievements.add('mafia_master');
               const alivePlayers = players.filter(pl => pl.isAlive);
               if (isWinner && p.role !== 'mafia' && alivePlayers.length === 1 && alivePlayers[0].id === p.id) earnedAchievements.add('survivor');
               if (isWinner && ((room.settings as any).phaseDuration <= 15)) earnedAchievements.add('quick_thinker');

               await storage.updatePlayer(p.id, { 
                 role: null, isAlive: true, isSpectator: false, 
                 gamesPlayed: newGamesPlayed, wins: newWins,
                 achievements: Array.from(earnedAchievements), gameHistory: []
               });
             }
             
             gameActions.delete(myRoomId);
             gameHistory.delete(myRoomId);
             if (phaseTimers.has(myRoomId)) { clearTimeout(phaseTimers.get(myRoomId)); phaseTimers.delete(myRoomId); }
             await storage.deleteMessagesByRoom(myRoomId);
             await storage.updateRoom(myRoomId, { status: 'lobby', phase: 'lobby', turn: 1 });
             broadcastState(myRoomId);
             return;
           }

           if (action.type === 'vote') {
             console.log("VOTE RECEIVED:", { status: room.status, phase: room.phase, targetId: action.targetId, meId: me.id, meAlive: me.isAlive });
             if (room.status !== 'day' || room.phase !== 'voting') {
               console.log("VOTE REJECTED - Wrong phase. Expected: day/voting, Got:", room.status, room.phase);
               return;
             }
             const target = players.find((p: Player) => p.id === action.targetId);
             if (me.isAlive && target?.isAlive) {
               actions.votes.set(me.id, action.targetId);
               gameActions.set(myRoomId, actions);
               bumpActivity(myRoomId, me.id, "votes");
               
               const bots = players.filter((p: Player) => p.isBot && p.isAlive && !actions.votes.has(p.id));
               for (const bot of bots) {
                 const eligibleTargets = players.filter((p: Player) => p.isAlive && p.id !== bot.id);
                 if (eligibleTargets.length > 0) {
                   const botTarget = eligibleTargets[Math.floor(Math.random() * eligibleTargets.length)];
                   actions.votes.set(bot.id, botTarget.id);
                 }
               }
               gameActions.set(myRoomId, actions);
               
               broadcastState(myRoomId);
               const voteLang = (room.settings as any)?.language === "es" ? "es" : "en";
               ws.send(JSON.stringify({ type: 'notification', payload: { title: sysMsg("voteRegisteredTitle", voteLang), body: sysMsg("voteRegisteredBody", voteLang) } }));
               
               const allAlivePlayers = players.filter((p: Player) => p.isAlive);
               const votedPlayers = Array.from(actions.votes.keys());
               console.log("VOTE TALLY:", { votedPlayers: votedPlayers.length, totalAlive: allAlivePlayers.length });
               if (votedPlayers.length === allAlivePlayers.length) {
                 console.log("ALL PLAYERS VOTED - Advancing immediately");
                 if (phaseTimers.has(myRoomId)) { 
                   clearTimeout(phaseTimers.get(myRoomId)); 
                   phaseTimers.delete(myRoomId); 
                 }
                 await advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
               }
             }
             return;
           }

           if (room.phase === 'mafia' && me.role === 'mafia' && action.type === 'kill') {
             console.log(`[Room ${myRoomId}] MAFIA KILL #1: ${me.name} targeting ${action.targetId}`);
             const target = players.find((p: Player) => p.id === action.targetId);
             if (target?.isAlive && target.role !== 'mafia') {
               actions.mafiaKills.set(me.id, action.targetId);
               gameActions.set(myRoomId, actions);

               const mafiaBots = players.filter((p: Player) => p.isBot && p.isAlive && p.role === 'mafia' && !actions.mafiaKills.has(p.id));
               for (const bot of mafiaBots) {
                 const nonMafiaAlive = players.filter((p: Player) => p.isAlive && p.role !== 'mafia');
                 if (nonMafiaAlive.length > 0) {
                   actions.mafiaKills.set(bot.id, nonMafiaAlive[Math.floor(Math.random() * nonMafiaAlive.length)].id);
                 }
               }
               gameActions.set(myRoomId, actions);

               broadcastState(myRoomId);
               const killLang = (room.settings as any)?.language === "es" ? "es" : "en";
               ws.send(JSON.stringify({ type: 'notification', payload: { title: sysMsg("targetLockedTitle", killLang), body: sysMsg("targetLockedBody", killLang, { name: target.name }) } }));
               
               if (haveAllRoleHoldersActed(players, 'mafia', actions.mafiaKills)) {
                 if (phaseTimers.has(myRoomId)) { 
                   clearTimeout(phaseTimers.get(myRoomId)); 
                   phaseTimers.delete(myRoomId); 
                 }
                 await advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
               }
             }
             return;
           }

           if (room.phase === 'doctor' && me.role === 'doctor' && action.type === 'heal') {
             const target = players.find((p: Player) => p.id === action.targetId);
             const healLang = (room.settings as any)?.language === "es" ? "es" : "en";
             if (target?.isAlive && mayorRevealed.get(myRoomId)?.has(target.id)) {
               ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: sysMsg("cannotTargetRevealedMayor", healLang) } }));
               return;
             }
             if (target?.isAlive) {
               actions.doctorSaves.set(me.id, action.targetId);
               gameActions.set(myRoomId, actions);

               const doctorBots = players.filter((p: Player) => p.isBot && p.isAlive && p.role === 'doctor' && p.id !== me.id && !actions.doctorSaves.has(p.id));
               for (const bot of doctorBots) {
                 const eligible = players.filter((p: Player) => p.isAlive && p.id !== bot.id);
                 if (eligible.length > 0) {
                   actions.doctorSaves.set(bot.id, eligible[Math.floor(Math.random() * eligible.length)].id);
                 }
               }
               gameActions.set(myRoomId, actions);

               broadcastState(myRoomId);
               ws.send(JSON.stringify({ type: 'notification', payload: { title: sysMsg("protectionAppliedTitle", healLang), body: sysMsg("protectionAppliedBody", healLang, { name: target.name }) } }));
               
               if (haveAllRoleHoldersActed(players, 'doctor', actions.doctorSaves)) {
                 if (phaseTimers.has(myRoomId)) { 
                   clearTimeout(phaseTimers.get(myRoomId)); 
                   phaseTimers.delete(myRoomId); 
                 }
                 await advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
               }
             }
             return;
           }

           if (room.phase === 'detective' && me.role === 'detective' && action.type === 'check') {
             const target = players.find((p: Player) => p.id === action.targetId);
             if (target) {
                actions.detectiveChecks.set(me.id, target.id);
                gameActions.set(myRoomId, actions);

                const detectiveBots = players.filter((p: Player) => p.isBot && p.isAlive && p.role === 'detective' && p.id !== me.id && !actions.detectiveChecks.has(p.id));
                for (const bot of detectiveBots) {
                  const eligible = players.filter((p: Player) => p.isAlive && p.id !== bot.id);
                  if (eligible.length > 0) {
                    actions.detectiveChecks.set(bot.id, eligible[Math.floor(Math.random() * eligible.length)].id);
                  }
                }
                gameActions.set(myRoomId, actions);

                const isMafia = target.role === 'mafia';
                ws.send(JSON.stringify({ type: 'check_result', payload: { isMafia, targetId: target.id } }));
                if (isMafia) {
                  await storage.updateRoom(myRoomId, { status: 'ended' });
                  const detectiveLang = (room.settings as any)?.language === "es" ? "es" : "en";
                  await storage.createMessage({ roomId: myRoomId, playerId: 0, playerName: sysName(detectiveLang), content: sysMsg("detectiveDiscoveredMafia", detectiveLang, { name: target.name }), isSpectator: false });
                  const instantWinHistory = gameHistory.get(myRoomId) || [];
                  instantWinHistory.push({ type: 'night', turn: room.turn, events: [{ type: 'detective_check', target: target.name, isMafia: true, detectiveId: me.id }] });
                  gameHistory.set(myRoomId, instantWinHistory);
                  await finalizeGameEnd(myRoomId, storage, 'civilians', gameActions);
                  broadcastState(myRoomId);
                } else {
                  if (haveAllRoleHoldersActed(players, 'detective', actions.detectiveChecks)) {
                    if (phaseTimers.has(myRoomId)) { 
                      clearTimeout(phaseTimers.get(myRoomId)); 
                      phaseTimers.delete(myRoomId); 
                    }
                    await advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
                  }
                }
             }
             return;
           }

           if (room.phase === 'bodyguard' && me.role === 'bodyguard' && (action as any).type === 'bodyguard_protect') {
             const target = players.find((p: Player) => p.id === (action as any).targetId);
             const bgLang = (room.settings as any)?.language === "es" ? "es" : "en";
             if (target?.id === me.id) return; // can't protect self
             if (target?.isAlive && mayorRevealed.get(myRoomId)?.has(target.id)) {
               ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: sysMsg("cannotTargetRevealedMayor", bgLang) } }));
               return;
             }
             if (target?.isAlive) {
               actions.guards.set(me.id, target.id);
               gameActions.set(myRoomId, actions);

               const bodyguardBots = players.filter((p: Player) => p.isBot && p.isAlive && p.role === 'bodyguard' && p.id !== me.id && !actions.guards.has(p.id));
               for (const bot of bodyguardBots) {
                 const eligible = players.filter((p: Player) => p.isAlive && p.id !== bot.id);
                 if (eligible.length > 0) {
                   actions.guards.set(bot.id, eligible[Math.floor(Math.random() * eligible.length)].id);
                 }
               }
               gameActions.set(myRoomId, actions);

               broadcastState(myRoomId);
               ws.send(JSON.stringify({ type: 'notification', payload: { title: sysMsg("protectionAppliedTitle", bgLang), body: sysMsg("protectionAppliedBody", bgLang, { name: target.name }) } }));
               if (haveAllRoleHoldersActed(players, 'bodyguard', actions.guards)) {
                 if (phaseTimers.has(myRoomId)) {
                   clearTimeout(phaseTimers.get(myRoomId));
                   phaseTimers.delete(myRoomId);
                 }
                 await advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
               }
             }
             return;
           }

           if (room.phase === 'vigilante' && me.role === 'vigilante' && (action as any).type === 'vigilante_shoot') {
             const target = players.find((p: Player) => p.id === (action as any).targetId);
             const vigiLang = (room.settings as any)?.language === "es" ? "es" : "en";
             const bullets = vigilanteBullets.get(myRoomId)?.get(me.id) ?? 0;
             if (bullets <= 0) {
               ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: sysMsg("noBulletsLeft", vigiLang) } }));
               return;
             }
             if (target?.isAlive && target.id !== me.id) {
               actions.shots.set(me.id, target.id);
               gameActions.set(myRoomId, actions);
               const bulletsMap = vigilanteBullets.get(myRoomId) || new Map<number, number>();
               bulletsMap.set(me.id, bullets - 1);
               vigilanteBullets.set(myRoomId, bulletsMap);

               const vigilanteBots = players.filter((p: Player) => p.isBot && p.isAlive && p.role === 'vigilante' && p.id !== me.id && !actions.shots.has(p.id));
               for (const bot of vigilanteBots) {
                 const botBulletsLeft = bulletsMap.get(bot.id) ?? 2;
                 if (botBulletsLeft > 0 && Math.random() > 0.65) {
                   const eligible = players.filter((p: Player) => p.isAlive && p.id !== bot.id);
                   if (eligible.length > 0) {
                     actions.shots.set(bot.id, eligible[Math.floor(Math.random() * eligible.length)].id);
                     bulletsMap.set(bot.id, botBulletsLeft - 1);
                   }
                 }
               }
               vigilanteBullets.set(myRoomId, bulletsMap);
               gameActions.set(myRoomId, actions);

               broadcastState(myRoomId);
               ws.send(JSON.stringify({ type: 'notification', payload: { title: sysMsg("targetLockedTitle", vigiLang), body: sysMsg("targetLockedBody", vigiLang, { name: target.name }) } }));
               if (haveAllRoleHoldersActed(players, 'vigilante', actions.shots)) {
                 if (phaseTimers.has(myRoomId)) {
                   clearTimeout(phaseTimers.get(myRoomId));
                   phaseTimers.delete(myRoomId);
                 }
                 await advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
               }
             }
             return;
           }

           // Mayor can reveal once, any time during the day, to double their vote
           // weight — at the cost of becoming unhealable/unguardable from then on.
           if (me.role === 'mayor' && (action as any).type === 'mayor_reveal') {
             if (room.status !== 'day' || !me.isAlive) return;
             if (!mayorRevealed.has(myRoomId)) mayorRevealed.set(myRoomId, new Set());
             const revealedSet = mayorRevealed.get(myRoomId)!;
             if (revealedSet.has(me.id)) return; // already revealed
             revealedSet.add(me.id);
             const mayorLang = (room.settings as any)?.language === "es" ? "es" : "en";
             await storage.createMessage({ roomId: myRoomId, playerId: 0, playerName: sysName(mayorLang), content: sysMsg("mayorRevealedBody", mayorLang, { name: me.name }) });
             broadcastState(myRoomId);
             return;
           }

           // Referral fraud prevention: other players can flag someone as AFK.
           // 2+ distinct reporters in one game counts as a confirmed incident
           // against that account (see finalizeGameEnd), which blocks any
           // pending referral payout tied to it.
           if (action.type === 'report_afk') {
             const target = players.find((p: Player) => p.id === (action as any).targetId);
             if (myRoomId && me?.isAlive && target && target.id !== me.id) {
               if (!afkReports.has(myRoomId)) afkReports.set(myRoomId, new Map());
               const roomReports = afkReports.get(myRoomId)!;
               if (!roomReports.has(target.id)) roomReports.set(target.id, new Set());
               roomReports.get(target.id)!.add(me.id);
             }
             return;
           }

           if (action.type === 'unreport_afk') {
             const target = players.find((p: Player) => p.id === (action as any).targetId);
             if (myRoomId && target) {
               afkReports.get(myRoomId)?.get(target.id)?.delete(me.id);
             }
             return;
           }
           
           if (action.type === 'skip' && me.isHost) {
              advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
           }
           
           gameActions.set(myRoomId, actions);
           broadcastState(myRoomId);
        }
      } catch (e) {
        console.error("WS Message Error", e);
      }
    });

    ws.on('close', () => {
      if (mySessionId && myRoomId) {
        roomClients.get(myRoomId)?.delete(mySessionId);
        clients.delete(mySessionId);
      }
    });
  });

  // Leaderboard
  app.get("/api/leaderboard", async (_req, res) => {
    try {
      const entries = await storage.getLeaderboard();
      res.json(entries);
    } catch (e) {
      console.error("Leaderboard error", e);
      res.status(500).json({ error: "Failed to load leaderboard" });
    }
  });

  app.post("/api/reset-leaderboard", async (req, res) => {
    try {
      const providedSecret = req.headers["x-admin-secret"];
      const expectedSecret = process.env.ADMIN_SECRET;
      if (!expectedSecret) {
        return res.status(503).json({ error: "Admin actions are disabled: ADMIN_SECRET is not configured." });
      }
      if (providedSecret !== expectedSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      await storage.resetLeaderboard();
      res.json({ success: true });
    } catch (e: any) {
      console.error("Reset leaderboard error", e);
      res.status(500).json({ error: e?.message || "Failed to reset leaderboard" });
    }
  });

  // Remove a single user from the leaderboard by name, instead of wiping everyone.
  // curl -X POST https://mafia-verse.onrender.com/api/leaderboard/delete-user \
  //   -H "x-admin-secret: <ADMIN_SECRET>" -H "Content-Type: application/json" \
  //   -d '{"name":"ExactPlayerName"}'
  // Multiple names: -d '{"name":"PlayerOne, PlayerTwo, PlayerThree"}'
  // Note: this resets the matching player's wins/gamesPlayed/achievements to
  // zero in the `players` table — the same table the leaderboard is actually
  // built from — rather than deleting an account. getLeaderboard() already
  // excludes anyone with 0 games played, so this removes them from the board.
  app.post("/api/leaderboard/delete-user", async (req, res) => {
    try {
      const providedSecret = req.headers["x-admin-secret"];
      const expectedSecret = process.env.ADMIN_SECRET;
      if (!expectedSecret) {
        return res.status(503).json({ error: "Admin actions are disabled: ADMIN_SECRET is not configured." });
      }
      if (providedSecret !== expectedSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const rawName = (req.body?.name || "").trim();
      if (!rawName) {
        return res.status(400).json({ error: "Missing 'name' in request body." });
      }
      // Accept either a single name or a comma-separated list of names.
      const names = Array.from(new Set(rawName.split(",").map((n: string) => n.trim()).filter((n: string) => n.length > 0)));
      if (names.length === 0) {
        return res.status(400).json({ error: "Missing 'name' in request body." });
      }

      const resetNames: string[] = [];
      const notFoundNames: string[] = [];
      const failedNames: { name: string; error: string }[] = [];
      for (const name of names) {
        try {
          const count = await storage.resetPlayerStatsByName(name);
          if (count === 0) {
            notFoundNames.push(name);
          } else {
            resetNames.push(name);
          }
        } catch (nameErr: any) {
          // One name's failure shouldn't abort the rest of the batch.
          console.error(`Reset leaderboard stats error for "${name}"`, nameErr);
          failedNames.push({ name, error: nameErr?.cause?.message || nameErr?.message || "Unknown error" });
        }
      }

      if (resetNames.length === 0 && failedNames.length > 0 && notFoundNames.length === 0) {
        return res.status(500).json({ error: "Failed to reset all requested users.", failed: failedNames });
      }
      if (resetNames.length === 0 && failedNames.length === 0) {
        return res.status(404).json({ error: `No leaderboard player found for: ${notFoundNames.join(", ")}` });
      }
      res.json({
        success: true,
        reset: resetNames,
        ...(notFoundNames.length > 0 ? { notFound: notFoundNames } : {}),
        ...(failedNames.length > 0 ? { failed: failedNames } : {}),
      });
    } catch (e: any) {
      console.error("Reset leaderboard stats error", e);
      res.status(500).json({ error: e?.cause?.message || e?.message || "Failed to reset user" });
    }
  });

  // Stripe checkout: Credit Packs
  app.post("/api/stripe/credit-checkout", async (req, res) => {
    try {
      const { credits, amount } = req.body;
      if (!credits || !amount) return res.status(400).json({ message: "Missing credits or amount" });

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      const origin = req.headers.origin || `https://${req.headers.host}` || "http://localhost:5000";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{ price_data: { currency: "usd", product_data: { name: `${credits} Credits` }, unit_amount: amount }, quantity: 1 }],
        metadata: { item: "credits", amount: String(credits) },
        success_url: `${origin}/store?success=true&item=credits&amount=${credits}`,
        cancel_url: `${origin}/store?canceled=true`,
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      console.error("Stripe credit checkout error:", err);
      res.status(500).json({ message: err?.message || "Checkout failed" });
    }
  });

  // Stripe checkout: Syndicate Pass
  app.post("/api/stripe/syndicate-checkout", async (req, res) => {
    try {
      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      const origin = req.headers.origin || `https://${req.headers.host}` || "http://localhost:5000";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{ price_data: { currency: "usd", product_data: { name: "The Syndicate Pass" }, unit_amount: 499 }, quantity: 1 }],
        metadata: { item: "syndicate" },
        success_url: `${origin}/store?success=true&item=syndicate`,
        cancel_url: `${origin}/store?canceled=true`,
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      console.error("Stripe syndicate checkout error:", err);
      res.status(500).json({ message: err?.message || "Checkout failed" });
    }
  });

  // Stripe checkout: Tips
  app.post("/api/stripe/tip-checkout", async (req, res) => {
    try {
      const { amount } = req.body;
      if (!amount || amount < 100) return res.status(400).json({ message: "Minimum tip is $1.00" });

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      const origin = req.headers.origin || `https://${req.headers.host}` || "http://localhost:5000";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{ price_data: { currency: "usd", product_data: { name: "Support the Game" }, unit_amount: amount }, quantity: 1 }],
        metadata: { item: "tip", amount: String(amount) },
        success_url: `${origin}/store?success=true&item=tip&amount=${amount}`,
        cancel_url: `${origin}/store?canceled=true`,
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      console.error("Stripe tip checkout error:", err);
      res.status(500).json({ message: err?.message || "Checkout failed" });
    }
  });

  // Public config
  app.get("/api/config", (_req, res) => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || "",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    });
  });

  // Get player credits from DB
  app.get("/api/players/:sessionId/credits", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const roomCode = req.query.roomCode as string;
      if (!sessionId || !roomCode) return res.status(400).json({ credits: 0 });
      const room = await storage.getRoomByCode(roomCode);
      if (!room) return res.status(404).json({ credits: 0 });
      const players = await storage.getPlayersInRoom(room.id);
      const player = players.find((p) => p.sessionId === sessionId);
      if (!player) return res.status(404).json({ credits: 0 });
      res.json({ credits: (player as any).credits ?? 0 });
    } catch {
      res.status(500).json({ credits: 0 });
    }
  });

  // Check ad claim status for today (server-side rate limit check, tied to account)
  app.get("/api/ad-claim/status", async (req, res) => {
    try {
      const supabaseUserId = req.query.supabaseUserId as string;
      if (!supabaseUserId) return res.status(401).json({ message: "Sign up to watch and claim.", claimsToday: 0, remaining: 0 });

      const today = new Date().toISOString().split("T")[0];
      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT claim_count FROM ad_claims WHERE supabase_user_id = $1 AND claim_date = $2",
          [supabaseUserId, today]
        );
        const count = result.rows[0]?.claim_count ?? 0;
        res.json({ claimsToday: count, remaining: Math.max(0, 5 - count) });
      } finally {
        client.release();
      }
    } catch {
      res.json({ claimsToday: 0, remaining: 5 });
    }
  });

  // Claim free ad credits — enforced server-side 5/day limit, tied to the signed-in account
  app.post("/api/ad-claim", async (req, res) => {
    try {
      const { supabaseUserId, roomCode } = req.body;
      if (!supabaseUserId) return res.status(401).json({ message: "Sign up to watch and claim." });

      const today = new Date().toISOString().split("T")[0];
      const MAX_DAILY = 5;
      const REWARD = 5;

      const client = await pool.connect();
      try {
        const check = await client.query(
          "SELECT claim_count FROM ad_claims WHERE supabase_user_id = $1 AND claim_date = $2",
          [supabaseUserId, today]
        );
        const currentCount = check.rows[0]?.claim_count ?? 0;

        if (currentCount >= MAX_DAILY) {
          return res.status(429).json({ message: "Daily limit reached. Try again tomorrow." });
        }

        await client.query(
          `INSERT INTO ad_claims (session_id, supabase_user_id, claim_date, claim_count, last_claim_at)
           VALUES ($1, $1, $2, 1, now())
           ON CONFLICT (session_id, claim_date)
           DO UPDATE SET claim_count = ad_claims.claim_count + 1, last_claim_at = now()`,
          [supabaseUserId, today]
        );

        const newCount = currentCount + 1;
        const totalCredits = await addAccountCredits(supabaseUserId, REWARD);

        // Also award to the in-room player row if room context available, so the
        // room's own credit display stays consistent with the account wallet.
        if (roomCode) {
          try {
            const room = await storage.getRoomByCode(roomCode as string);
            if (room) {
              const players = await storage.getPlayersInRoom(room.id);
              const player = players.find((p) => (p as any).supabaseUserId === supabaseUserId);
              if (player) {
                const currentPlayerCredits = (player as any).credits ?? 0;
                await storage.updatePlayer(player.id, { credits: currentPlayerCredits + REWARD } as any);
              }
            }
          } catch {
            // Non-fatal
          }
        }

        res.json({ success: true, creditsAwarded: REWARD, claimsToday: newCount, remaining: Math.max(0, MAX_DAILY - newCount), totalCredits });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("Ad claim error:", e.message);
      res.status(500).json({ message: "Failed to process claim" });
    }
  });

  // --- Daily login-streak rewards, tied to the signed-in account ---
  app.get("/api/rewards/daily/status", async (req, res) => {
    try {
      const supabaseUserId = req.query.supabaseUserId as string;
      if (!supabaseUserId) return res.status(401).json({ message: "Sign up to claim daily rewards." });

      const today = new Date().toISOString().split("T")[0];
      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT current_streak, longest_streak, last_claim_date FROM daily_streaks WHERE supabase_user_id = $1",
          [supabaseUserId]
        );
        const row = result.rows[0] || { current_streak: 0, longest_streak: 0, last_claim_date: null };
        res.json({
          current: row.current_streak,
          longest: row.longest_streak,
          canClaim: row.last_claim_date !== today,
        });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("Daily status error:", e.message);
      res.status(500).json({ message: "Failed to load streak status" });
    }
  });

  app.post("/api/rewards/daily/claim", async (req, res) => {
    try {
      const { supabaseUserId, day } = req.body;
      if (!supabaseUserId) return res.status(401).json({ message: "Sign up to claim daily rewards." });

      const DAILY_CREDITS = [5, 7, 10, 5, 7, 10, 15];
      const dayNum = parseInt(day, 10);
      if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 7) {
        return res.status(400).json({ message: "Invalid day" });
      }

      const today = new Date().toISOString().split("T")[0];
      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT current_streak, longest_streak, last_claim_date FROM daily_streaks WHERE supabase_user_id = $1",
          [supabaseUserId]
        );
        const row = result.rows[0] || { current_streak: 0, longest_streak: 0, last_claim_date: null };

        if (row.last_claim_date === today) {
          return res.status(429).json({ message: "Already claimed today." });
        }
        if (dayNum !== row.current_streak + 1) {
          return res.status(400).json({ message: "Out of sequence claim." });
        }

        const reward = DAILY_CREDITS[dayNum - 1];
        const newStreak = dayNum >= 7 ? 0 : dayNum;
        const newLongest = Math.max(row.longest_streak, dayNum);

        await client.query(
          `INSERT INTO daily_streaks (supabase_user_id, current_streak, longest_streak, last_claim_date)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (supabase_user_id) DO UPDATE SET current_streak = $2, longest_streak = $3, last_claim_date = $4`,
          [supabaseUserId, newStreak, newLongest, today]
        );

        const totalCredits = await addAccountCredits(supabaseUserId, reward);
        res.json({ success: true, creditsAwarded: reward, current: newStreak, longest: newLongest, totalCredits });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("Daily claim error:", e.message);
      res.status(500).json({ message: "Failed to process claim" });
    }
  });

  // --- Rating, tied to the signed-in account (credits only awarded once, ever) ---
  app.get("/api/rewards/rating", async (req, res) => {
    try {
      const supabaseUserId = req.query.supabaseUserId as string;
      if (!supabaseUserId) return res.status(401).json({ message: "Sign up to rate and earn credits." });

      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT stars, rated_at, last_edit_at FROM ratings WHERE supabase_user_id = $1",
          [supabaseUserId]
        );
        const row = result.rows[0];
        res.json(row ? { stars: row.stars, ratedAt: row.rated_at, lastEditAt: row.last_edit_at } : null);
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("Rating status error:", e.message);
      res.status(500).json({ message: "Failed to load rating" });
    }
  });

  app.post("/api/rewards/rating", async (req, res) => {
    try {
      const { supabaseUserId, stars } = req.body;
      if (!supabaseUserId) return res.status(401).json({ message: "Sign up to rate and earn credits." });
      const starsNum = parseInt(stars, 10);
      if (!Number.isInteger(starsNum) || starsNum < 1 || starsNum > 5) {
        return res.status(400).json({ message: "Invalid rating" });
      }

      const EDIT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
      const REWARD_CREDITS = 5;
      const now = new Date();

      const client = await pool.connect();
      try {
        const existing = await client.query(
          "SELECT rated_at, last_edit_at FROM ratings WHERE supabase_user_id = $1",
          [supabaseUserId]
        );
        const row = existing.rows[0];
        const isFirstRating = !row;

        if (row) {
          const msSinceEdit = now.getTime() - new Date(row.last_edit_at).getTime();
          if (msSinceEdit < EDIT_COOLDOWN_MS) {
            const daysLeft = Math.ceil((EDIT_COOLDOWN_MS - msSinceEdit) / (24 * 60 * 60 * 1000));
            return res.status(429).json({ message: `You can update your rating in ${daysLeft} day(s).` });
          }
        }

        await client.query(
          `INSERT INTO ratings (supabase_user_id, stars, rated_at, last_edit_at)
           VALUES ($1, $2, $3, $3)
           ON CONFLICT (supabase_user_id) DO UPDATE SET stars = $2, last_edit_at = $3`,
          [supabaseUserId, starsNum, now.toISOString()]
        );

        let totalCredits: number | undefined;
        if (isFirstRating) {
          totalCredits = await addAccountCredits(supabaseUserId, REWARD_CREDITS);
        }

        res.json({ success: true, isFirstRating, creditsAwarded: isFirstRating ? REWARD_CREDITS : 0, totalCredits });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("Rating submit error:", e.message);
      res.status(500).json({ message: "Failed to submit rating" });
    }
  });

  // --- Referrals, tied to signed-in accounts on both ends ---
  // Shows who this account has recently finished games with — a lightweight
  // building block toward a friends list, without a real friends system yet.
  app.get("/api/rewards/recent-players", async (req, res) => {
    try {
      const supabaseUserId = req.query.supabaseUserId as string;
      if (!supabaseUserId) return res.status(401).json({ message: "Sign up to see recent players." });

      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT DISTINCT ON (p2.supabase_user_id)
             p2.supabase_user_id AS "supabaseUserId", p2.name, p2.avatar, r.last_updated AS "lastPlayedAt"
           FROM players p1
           JOIN players p2 ON p2.room_id = p1.room_id AND p2.supabase_user_id IS NOT NULL AND p2.supabase_user_id != p1.supabase_user_id
           JOIN rooms r ON r.id = p1.room_id
           WHERE p1.supabase_user_id = $1 AND r.status = 'ended'
           ORDER BY p2.supabase_user_id, r.last_updated DESC
           LIMIT 20`,
          [supabaseUserId]
        );
        const recentPlayers = result.rows
          .sort((a, b) => new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime())
          .slice(0, 8);
        res.json({ recentPlayers });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("GET recent-players error", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/rewards/referral", async (req, res) => {
    try {
      const supabaseUserId = req.query.supabaseUserId as string;
      if (!supabaseUserId) return res.status(401).json({ message: "Sign up to get your referral link." });

      const client = await pool.connect();
      try {
        let codeResult = await client.query("SELECT code FROM referral_links WHERE supabase_user_id = $1", [supabaseUserId]);
        let code = codeResult.rows[0]?.code;
        if (!code) {
          code = Math.random().toString(36).substring(2, 8).toUpperCase();
          const deviceId = (req.query.deviceId as string) || null;
          await client.query(
            `INSERT INTO referral_links (supabase_user_id, code, signup_ip, signup_device_id) VALUES ($1, $2, $3, $4) ON CONFLICT (supabase_user_id) DO NOTHING`,
            [supabaseUserId, code, req.ip, deviceId]
          );
          const recheck = await client.query("SELECT code FROM referral_links WHERE supabase_user_id = $1", [supabaseUserId]);
          code = recheck.rows[0]?.code || code;
        }

        const claims = await client.query(
          "SELECT COUNT(*) FILTER (WHERE status = 'approved')::int AS approved, COUNT(*) FILTER (WHERE status = 'pending')::int AS pending FROM referral_claims WHERE referrer_user_id = $1",
          [supabaseUserId]
        );
        const approved = claims.rows[0]?.approved ?? 0;
        const pending = claims.rows[0]?.pending ?? 0;

        res.json({ code, invited: approved + pending, joined: approved, pending, totalCredits: approved * REFERRAL_CREDITS });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("Referral status error:", e.message);
      res.status(500).json({ message: "Failed to load referral info" });
    }
  });

  // Called once, right after a NEW account finishes signing up with a referral code.
  // Credits are NOT paid out here anymore — see the fraud-prevention note below.
  app.post("/api/rewards/referral/claim", async (req, res) => {
    try {
      const { code, newSupabaseUserId, deviceId } = req.body;
      if (!code || !newSupabaseUserId) return res.status(400).json({ message: "Missing code or new user id" });

      const client = await pool.connect();
      try {
        const linkResult = await client.query("SELECT supabase_user_id, signup_ip, signup_device_id FROM referral_links WHERE code = $1", [code]);
        const referrerLink = linkResult.rows[0];
        const referrerId = referrerLink?.supabase_user_id;
        if (!referrerId) return res.status(404).json({ message: "Invalid referral code" });
        if (referrerId === newSupabaseUserId) return res.status(400).json({ message: "Can't refer yourself" });

        // Referral fraud prevention: the referred account only actually gets
        // credited once it's played REFERRAL_MIN_ACTIVE_GAMES games with real
        // participation (chat + votes) and nobody's flagged it as AFK — see
        // tryResolveReferralClaim, called after every game finishes. If this
        // signup is obviously the same person as the referrer (same IP or
        // same device), deny it outright right now instead of waiting.
        const sameIp = referrerLink.signup_ip && req.ip && referrerLink.signup_ip === req.ip;
        const sameDevice = referrerLink.signup_device_id && deviceId && referrerLink.signup_device_id === deviceId;
        const initialStatus = (sameIp || sameDevice) ? 'denied' : 'pending';

        try {
          await client.query(
            `INSERT INTO referral_claims (referrer_user_id, referred_user_id, status, signup_ip, signup_device_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [referrerId, newSupabaseUserId, initialStatus, req.ip, deviceId || null]
          );
        } catch {
          // Unique constraint on referred_user_id — this account already claimed a referral before.
          return res.status(429).json({ message: "Referral already claimed" });
        }

        if (initialStatus === 'denied') {
          return res.json({ success: false, pending: false, message: "Referral could not be verified." });
        }

        res.json({
          success: true,
          pending: true,
          message: `Referral recorded — credits are awarded once you've played ${REFERRAL_MIN_ACTIVE_GAMES} games.`,
        });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("Referral claim error:", e.message);
      res.status(500).json({ message: "Failed to process referral" });
    }
  });

  // Authoritative account credit balance
  app.get("/api/account/credits", async (req, res) => {
    try {
      const supabaseUserId = req.query.supabaseUserId as string;
      if (!supabaseUserId) return res.json({ credits: 0 });
      const client = await pool.connect();
      try {
        const result = await client.query("SELECT credits FROM account_credits WHERE supabase_user_id = $1", [supabaseUserId]);
        res.json({ credits: result.rows[0]?.credits ?? 0 });
      } finally {
        client.release();
      }
    } catch {
      res.json({ credits: 0 });
    }
  });

  // Feedback endpoint
  app.post("/api/feedback", async (req, res) => {
    try {
      const feedbackSchema = z.object({
        topic: z.enum(["BUG_REPORT", "FEATURE_REQUEST", "DESIGN", "OTHER"]),
        message: z.string().min(1).max(2000),
        page: z.string().optional(),
      });
      const body = feedbackSchema.parse(req.body);
      console.log(`[FEEDBACK] [${body.topic}] ${body.page || "unknown"}: ${body.message.substring(0, 100)}${body.message.length > 100 ? "..." : ""}`);
      res.json({ success: true });
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid feedback data", details: e.errors });
      } else {
        res.status(500).json({ error: "Failed to submit feedback" });
      }
    }
  });

  return httpServer;
}

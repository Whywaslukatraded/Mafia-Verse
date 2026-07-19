import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { WS_EVENTS, type GameState, type GameAction, type Player, type Message, userMfa } from "@shared/schema";
import { db, pool } from "./db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID, pbkdf2Sync, randomBytes } from "crypto";
import { sendEmail, generateSixDigitCode, build2FAEmailHtml } from "./emailService";

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
function assignRoles(players: Player[], settings: any) {
  const roles: string[] = [];
  for (let i = 0; i < settings.mafiaCount; i++) roles.push("mafia");
  for (let i = 0; i < settings.detectiveCount; i++) roles.push("detective");
  for (let i = 0; i < settings.doctorCount; i++) roles.push("doctor");
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
    const esRole: Record<string, string> = { mafia: "mafioso", detective: "detective", doctor: "médico", civilian: "civil" };
    const name = esRole[role] || role;
    const article = isUnique ? "el" : "un";
    const verb = action === "killed" ? "fue asesinado" : "fue eliminado por votación";
    return `${victimName} ${verb}. Era ${article} ${name}.`;
  }

  const enRole: Record<string, string> = { mafia: "mafia", detective: "detective", doctor: "doctor", civilian: "civilian" };
  const name = enRole[role] || role;
  const article = isUnique ? "the" : (/^[aeiou]/i.test(name) ? "an" : "a");
  const verb = action === "killed" ? "was killed" : "was voted out";
  return `${victimName} ${verb}. They were ${article} ${name}.`;
}

const gameHistory = new Map<number, any[]>();

// Referral anti-farming: tracks real participation per player for the whole
// lifetime of a game (unlike gameActions, which resets every phase). Used
// only to decide whether a REFERRED account's game should count toward
// unlocking their referral bonus — a real player playing normally is
// unaffected either way.
type ParticipationStats = { messages: number; votes: number; afkReports: Set<number> };
const gameParticipation = new Map<number, Map<number, ParticipationStats>>();

function getParticipation(roomId: number, playerId: number): ParticipationStats {
  if (!gameParticipation.has(roomId)) gameParticipation.set(roomId, new Map());
  const roomMap = gameParticipation.get(roomId)!;
  if (!roomMap.has(playerId)) roomMap.set(playerId, { messages: 0, votes: 0, afkReports: new Set() });
  return roomMap.get(playerId)!;
}

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

function systemName(lang: string): string {
  return lang === "es" ? "Sistema" : "System";
}

function sysMsg(key: keyof typeof SYSTEM_MESSAGES, lang: string, vars?: Record<string, string>): string {
  const entry = SYSTEM_MESSAGES[key];
  let text = lang === "es" ? entry.es : entry.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(v);
  }
  return text;
}


const DEATH_STORIES = [
  "{name} was skiing down the mountain and fell into a crevasse never to be seen again.",
  "As {name} was skydiving, his or her parachute didn't deploy and they were dead.",
  "{name} went for a swim in shark-infested waters and became a midnight snack.",
  "{name} tried to pet a stray 'cat' that turned out to be a very hungry mountain lion.",
  "{name} accidentally joined a high-stakes underground drag race with a golf cart.",
  "{name} mistook a high-voltage transformer for a public phone booth.",
  "While hunting for ghosts, {name} tripped and fell into a deep, forgotten well.",
  "{name} decided to challenge a professional wrestler to a 'friendly' match.",
  "A giant grand piano fell from the third floor, landing exactly on {name}.",
  "{name} tried to recreate a famous fire-breathing trick with high-proof rum.",
  "During a safari, {name} forgot that windows should stay rolled up around lions.",
  "{name} entered a pie-eating contest against a grizzly bear and lost spectacularly.",
  "A freak bowling accident sent {name} sliding down the lane and into the machinery.",
  "{name} thought they could outrun a swarm of angry hornets by jumping into a cactus.",
  "While taking a selfie on a cliff edge, {name} lost their balance and their phone.",
  "{name} tried to use a lawnmower to trim their hedges, with disastrous results.",
  "A experimental weather balloon landed directly on {name}'s tent during the night.",
  "{name} discovered that 'danger' signs on construction sites are not suggestions.",
  "While exploring an old cave, {name} woke up a colony of very territorial bats.",
  "{name} attempted to surf a tsunami on a piece of plywood.",
  "A misplaced banana peel caused {name} to tumble into a vat of industrial glue.",
  "{name} forgot that oxygen is required for long-distance underwater cave diving.",
  "During a magic show, the 'sawing a person in half' trick went horribly wrong for {name}.",
  "{name} tried to jump the Grand Canyon on a pogo stick.",
  "A rogue golf ball struck {name} with the precision of a heat-seeking missile.",
  "{name} decided to investigate why the local volcano was making rumbling noises.",
  "While cleaning their gutters, {name} discovered that gravity is a very harsh mistress.",
  "{name} tried to use a umbrella as a parachute during a particularly windy storm.",
  "A experimental jet engine test went awry, and {name} was in the wrong zip code."
];

const DEATH_STORIES_ES = [
  "{name} esquiaba montaña abajo y cayó en una grieta, para no volver a ser visto jamás.",
  "Mientras {name} practicaba paracaidismo, el paracaídas no se abrió y murió en el acto.",
  "{name} fue a nadar en aguas infestadas de tiburones y se convirtió en un bocadillo de medianoche.",
  "{name} intentó acariciar a un 'gato' callejero que resultó ser un puma muy hambriento.",
  "{name} terminó, sin querer, en una carrera clandestina de alto riesgo manejando un carrito de golf.",
  "{name} confundió un transformador de alto voltaje con una cabina telefónica pública.",
  "Mientras cazaba fantasmas, {name} tropezó y cayó en un pozo profundo y olvidado.",
  "{name} decidió retar a un luchador profesional a un combate 'amistoso'.",
  "Un piano de cola gigante cayó del tercer piso, aterrizando justo sobre {name}.",
  "{name} intentó recrear un famoso truco de escupir fuego usando ron de alta graduación.",
  "Durante un safari, {name} olvidó que las ventanas deben permanecer cerradas cerca de los leones.",
  "{name} entró en un concurso de comer pasteles contra un oso pardo y perdió estrepitosamente.",
  "Un accidente insólito en la bolera hizo que {name} resbalara por la pista hacia la maquinaria.",
  "{name} pensó que podía escapar de un enjambre de avispas furiosas saltando sobre un cactus.",
  "Mientras se tomaba una selfie al borde de un acantilado, {name} perdió el equilibrio y el teléfono.",
  "{name} intentó usar una cortadora de césped para podar los arbustos, con resultados desastrosos.",
  "Un globo meteorológico experimental cayó directamente sobre la carpa de {name} durante la noche.",
  "{name} descubrió que los letreros de 'peligro' en las obras de construcción no son una sugerencia.",
  "Mientras exploraba una cueva antigua, {name} despertó a una colonia de murciélagos muy territoriales.",
  "{name} intentó surfear un tsunami sobre un pedazo de madera contrachapada.",
  "Una cáscara de plátano fuera de lugar hizo que {name} cayera en un tanque de pegamento industrial.",
  "{name} olvidó que se necesita oxígeno para el buceo en cuevas submarinas de larga distancia.",
  "Durante un show de magia, el truco de 'serruchar a una persona por la mitad' salió terriblemente mal para {name}.",
  "{name} intentó saltar el Gran Cañón en un pogo stick.",
  "Una pelota de golf perdida golpeó a {name} con la precisión de un misil termodirigido.",
  "{name} decidió investigar por qué el volcán local hacía ruidos retumbantes.",
  "Mientras limpiaba las canaletas, {name} descubrió que la gravedad es una amante muy cruel.",
  "{name} intentó usar un paraguas como paracaídas durante una tormenta particularmente ventosa.",
  "Una prueba experimental de motor a reacción salió mal, y {name} estaba en el código postal equivocado."
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

async function fillWithBots(roomId: number, storage: any) {
  const players = await storage.getPlayersInRoom(roomId);
  if (players.length >= 6) return;

  const botsNeeded = 6 - players.length;
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
  const actions = gameActions.get(roomId) || { votes: new Map(), mafiaKills: new Map(), doctorSaves: new Map(), detectiveChecks: new Map() };

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
  gameActions.set(roomId, actions);
  return false;
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
const REFERRAL_MIN_GAMES = 3;

// "Games played" for referral-eligibility purposes: distinct rooms this
// account sat in that actually reached 'ended'. Works off the existing
// players/rooms tables — no separate per-account stats table needed.
async function getCompletedGamesCount(supabaseUserId: string): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(DISTINCT p.room_id)::int AS n
       FROM players p JOIN rooms r ON r.id = p.room_id
       WHERE p.supabase_user_id = $1 AND r.status = 'ended'`,
      [supabaseUserId]
    );
    return result.rows[0]?.n ?? 0;
  } finally {
    client.release();
  }
}

// Credits are held pending on a referral_claims row until the referred
// account hits REFERRAL_MIN_GAMES completed games. Called from
// finalizeGameEnd (so it fires after every game any player finishes) and
// right after a claim is submitted, in case they already qualify. The
// `credited = false` guard in the UPDATE makes this safe to call more than
// once for the same account without double-paying.
async function tryCreditPendingReferral(supabaseUserId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const pending = await client.query(
      `SELECT referrer_user_id FROM referral_claims WHERE referred_user_id = $1 AND credited = false AND banned = false`,
      [supabaseUserId]
    );
    const referrerId = pending.rows[0]?.referrer_user_id;
    if (!referrerId) return false;

    const gamesPlayed = await getCompletedGamesCount(supabaseUserId);
    if (gamesPlayed < REFERRAL_MIN_GAMES) return false;

    const updated = await client.query(
      `UPDATE referral_claims SET credited = true WHERE referred_user_id = $1 AND credited = false AND banned = false`,
      [supabaseUserId]
    );
    if ((updated.rowCount ?? 0) === 0) return false; // already credited by a concurrent call

    await addAccountCredits(referrerId, REFERRAL_CREDITS);
    await addAccountCredits(supabaseUserId, REFERRAL_CREDITS);
    return true;
  } finally {
    client.release();
  }
}

// Called once per player at the end of every game. Only does anything for
// players who (a) have a supabaseUserId and (b) have a pending, not-yet-banned
// referral claim — a real player with no pending referral is untouched.
// Requires TWO suspicious games (not one) before permanently banning the
// payout, since one quiet game is normal for a shy or busy player; a pattern
// across multiple games is what actually indicates farming.
const AFK_BAN_THRESHOLD_GAMES = 2;

async function checkReferralParticipation(roomId: number, playersInRoom: Player[]) {
  const roomParticipation = gameParticipation.get(roomId);
  const client = await pool.connect();
  try {
    for (const p of playersInRoom) {
      if (!p.supabaseUserId) continue;
      const pendingRow = await client.query(
        `SELECT 1 FROM referral_claims WHERE referred_user_id = $1 AND credited = false AND banned = false`,
        [p.supabaseUserId]
      );
      if ((pendingRow.rowCount ?? 0) === 0) continue;

      const stats = roomParticipation?.get(p.id);
      const zeroParticipation = !stats || (stats.messages === 0 && stats.votes === 0);
      const otherPlayers = Math.max(1, playersInRoom.length - 1);
      const majorityAfkFlagged = !!stats && stats.afkReports.size >= Math.ceil(otherPlayers / 2);

      if (zeroParticipation || majorityAfkFlagged) {
        const result = await client.query(
          `UPDATE referral_claims SET suspicious_games = suspicious_games + 1 WHERE referred_user_id = $1 AND credited = false AND banned = false RETURNING suspicious_games`,
          [p.supabaseUserId]
        );
        const suspiciousGames = result.rows[0]?.suspicious_games ?? 0;
        if (suspiciousGames >= AFK_BAN_THRESHOLD_GAMES) {
          await client.query(
            `UPDATE referral_claims SET banned = true WHERE referred_user_id = $1`,
            [p.supabaseUserId]
          );
          console.log(`[Referral] Banned pending payout for ${p.supabaseUserId} — ${suspiciousGames} games with no real participation`);
        }
      }
    }
  } finally {
    client.release();
  }
}

async function finalizeGameEnd(roomId: number, storage: any, winner: 'civilians' | 'mafia', gameActionsMap: Map<number, any>) {
  const history = gameHistory.get(roomId) || [];
  const playersInRoom = await storage.getPlayersInRoom(roomId);

  history.push({
    type: 'game_end',
    winner,
    roles: playersInRoom.map((p: Player) => ({ name: p.name, role: p.role }))
  });
  gameHistory.set(roomId, history);

  // Must run before the credit-attempt loop below: this game's
  // participation needs to be judged (and any ban applied) before we check
  // whether this same game just pushed someone over the games-played
  // threshold — otherwise a farming game could get credited in this same
  // call, one step before the ban that should have stopped it.
  try {
    await checkReferralParticipation(roomId, playersInRoom);
  } catch (e) {
    console.error("Referral participation check failed:", e);
  }
  gameParticipation.delete(roomId);

  for (const p of playersInRoom) {
    await storage.updatePlayer(p.id, {
      gameHistory: history,
      gamesPlayed: (p.gamesPlayed || 0) + 1,
      wins: (p.wins || 0) + (winner === 'civilians' && p.role !== 'mafia' ? 1 : winner === 'mafia' && p.role === 'mafia' ? 1 : 0)
    });
    // Best-effort: a player finishing a game may just have crossed the
    // games-played threshold for a referral bonus they claimed earlier.
    // Never let this block the actual game-ending flow.
    if (p.supabaseUserId) {
      try {
        await tryCreditPendingReferral(p.supabaseUserId);
      } catch (e) {
        console.error("Referral pending-credit check failed:", e);
      }
    }
  }
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
        voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
        const voter = players.find((p: Player) => p.id === voterId);
        const target = players.find((p: Player) => p.id === targetId);
        if (voter && target) {
          voteResults.push({ voterName: voter.name, targetName: target.name });
        }
      });
      
      if (voteResults.length > 0 && (room.settings as any).showVoteResults === true) {
        const lang: string = (room.settings as any)?.language === "es" ? "es" : "en";
        let voteSummary = sysMsg("votingResultsHeader", lang);
        voteResults.forEach(res => { voteSummary += sysMsg("votedForLine", lang, { voter: res.voterName, target: res.targetName }); });
        await storage.createMessage({ roomId, playerId: 0, playerName: systemName(lang), content: voteSummary });
      }
      
      if (voteResults.length > 0) {
        const history = gameHistory.get(roomId) || [];
        history.push({ type: 'vote', turn: room.turn, results: voteResults });
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
          const revealLang = (room.settings as any)?.language === "es" ? "es" : "en";
          await storage.createMessage({ roomId, playerId: 0, playerName: systemName(revealLang), content: buildRoleRevealSentence(victim.name, victim.role || "civilian", players, revealLang, "voted") });
          revealDelayMs = ELIMINATION_REVEAL_MS;
          
          const remainingPlayers = await storage.getPlayersInRoom(roomId);
          const remainingMafia = remainingPlayers.filter((p: Player) => p.role === 'mafia' && p.isAlive);
          if (remainingMafia.length === 0) {
            await storage.updateRoom(roomId, { status: 'ended' });
            await storage.createMessage({ roomId, playerId: 0, playerName: systemName(revealLang), content: sysMsg("mafiaEliminatedCiviliansWin", revealLang) });
            await finalizeGameEnd(roomId, storage, 'civilians', gameActions);
            gameEnded = true;
          }
          const remainingInnocents = remainingPlayers.filter((p: Player) => p.role !== 'mafia' && p.isAlive);
          if (!gameEnded && remainingMafia.length >= remainingInnocents.length) {
            await storage.updateRoom(roomId, { status: 'ended' });
            await storage.createMessage({ roomId, playerId: 0, playerName: systemName(revealLang), content: sysMsg("mafiaTookOverMafiaWins", revealLang) });
            await finalizeGameEnd(roomId, storage, 'mafia', gameActions);
            gameEnded = true;
          }
        }
      } else {
        const noVoteLang: string = (room.settings as any)?.language === "es" ? "es" : "en";
        await storage.createMessage({ roomId, playerId: 0, playerName: systemName(noVoteLang), content: sysMsg("noOneVotedOut", noVoteLang) });
      }
      
      if (gameEnded) {
        broadcastState(roomId);
        return;
      }
      
      await storage.updateRoom(roomId, { status: 'night', phase: 'mafia', turn: (room.turn || 0) + 1, lastUpdated: new Date(Date.now() + revealDelayMs) });
      actions.votes.clear();
      actions.mafiaKill = null;
      actions.doctorSave = null;
      actions.detectiveCheck = null;
      gameActions.set(roomId, actions);
      broadcastState(roomId);
      const mafiaSettings = room.settings as any;
      const mafiaTimer = setTimeout(() => advancePhase(roomId, wss, storage, roomClients, clients, gameActions), (mafiaSettings.mafiaDuration * 1000 || 15000) + revealDelayMs);
      phaseTimers.set(roomId, mafiaTimer);
      return;
    }
  }
  const room = await storage.getRoom(roomId);
  if (!room) return;

  const lang: string = (room.settings as any)?.language === "es" ? "es" : "en";
  const players = await storage.getPlayersInRoom(roomId);
  const actions = gameActions.get(roomId) || { votes: new Map(), mafiaKills: new Map(), doctorSaves: new Map(), detectiveChecks: new Map() };

  if (room.status === 'day') {
    if (room.phase === 'discussion') {
      console.log(`[Room ${roomId}] Day Phase: Discussion -> Voting`);
      await storage.updateRoom(roomId, { phase: 'voting', lastUpdated: new Date() });
      broadcastState(roomId);
    } else if (room.phase === 'voting') {
      const voteCounts = new Map<number, number>();
      const voteResults: { voterName: string, targetName: string }[] = [];
      
      actions.votes.forEach((targetId: number, voterId: number) => {
        voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
        const voter = players.find((p: Player) => p.id === voterId);
        const target = players.find((p: Player) => p.id === targetId);
        if (voter && target) {
          voteResults.push({ voterName: voter.name, targetName: target.name });
        }
      });

      if (voteResults.length > 0 && (room.settings as any).showVoteResults === true) {
        let voteSummary = sysMsg("votingResultsHeader", lang);
        voteResults.forEach(res => { voteSummary += sysMsg("votedForLine", lang, { voter: res.voterName, target: res.targetName }); });
        await storage.createMessage({ roomId, playerId: 0, playerName: systemName(lang), content: voteSummary });
      }
      
      if (voteResults.length > 0) {
        const history = gameHistory.get(roomId) || [];
        history.push({ type: 'vote', turn: room.turn, results: voteResults });
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
          await storage.createMessage({ roomId, playerId: 0, playerName: systemName(lang), content: buildRoleRevealSentence(victim.name, victim.role || "civilian", players, lang, "voted") });
          revealDelayMs = ELIMINATION_REVEAL_MS;
          
          const remainingPlayers = await storage.getPlayersInRoom(roomId);
          const remainingMafia = remainingPlayers.filter((p: Player) => p.role === 'mafia' && p.isAlive);
          if (remainingMafia.length === 0) {
            await storage.updateRoom(roomId, { status: 'ended' });
            await storage.createMessage({ roomId, playerId: 0, playerName: systemName(lang), content: sysMsg("mafiaEliminatedCiviliansWin", lang) });
            await finalizeGameEnd(roomId, storage, 'civilians', gameActions);
            gameEnded = true;
          }
          const remainingInnocents = remainingPlayers.filter((p: Player) => p.role !== 'mafia' && p.isAlive);
          if (!gameEnded && remainingMafia.length >= remainingInnocents.length) {
            await storage.updateRoom(roomId, { status: 'ended' });
            await storage.createMessage({ roomId, playerId: 0, playerName: systemName(lang), content: sysMsg("mafiaTookOverMafiaWins", lang) });
            await finalizeGameEnd(roomId, storage, 'mafia', gameActions);
            gameEnded = true;
          }
        }
      } else {
        await storage.createMessage({ roomId, playerId: 0, playerName: systemName(lang), content: sysMsg("noOneVotedOut", lang) });
      }

      if (!gameEnded) {
        await storage.updateRoom(roomId, { status: 'night', phase: 'mafia', turn: (room.turn || 0) + 1, lastUpdated: new Date(Date.now() + revealDelayMs) });
      }
      actions.mafiaKills.clear();
      actions.doctorSaves.clear();
      actions.detectiveChecks.clear();
      actions.votes.clear();
      gameActions.set(roomId, actions);
    }
  } else if (room.status === 'night') {
    if (room.phase === 'mafia') {
      console.log(`[Room ${roomId}] Night Phase: Mafia -> Doctor`);
      const aliveMafia = players.filter((p: Player) => p.role === 'mafia' && p.isAlive);
      if (aliveMafia.length === 0) {
        console.log(`[Room ${roomId}] All mafia eliminated! Ending game.`);
        await storage.updateRoom(roomId, { status: 'ended' });
        await storage.createMessage({ roomId, playerId: 0, playerName: systemName(lang), content: sysMsg("mafiaEliminatedCiviliansWin", lang) });
        await finalizeGameEnd(roomId, storage, 'civilians', gameActions);
        broadcastState(roomId);
        return;
      } else {
        await storage.updateRoom(roomId, { phase: 'doctor', lastUpdated: new Date() });
      }
      broadcastState(roomId);
    } else if (room.phase === 'doctor') {
      console.log(`[Room ${roomId}] Night Phase: Doctor -> Detective`);
      await storage.updateRoom(roomId, { phase: 'detective', lastUpdated: new Date() });
      broadcastState(roomId);
    } else if (room.phase === 'detective') {
      console.log(`[Room ${roomId}] Night Phase: Detective -> Day Discussion`);
      const history = gameHistory.get(roomId) || [];
      const nightData: any = { type: 'night', turn: room.turn, events: [] };

      let nightSummary = sysMsg("nightHasEnded", lang);
      
      if (actions.mafiaKills.size > 0) {
        const killVotes = new Map<number, number>();
        actions.mafiaKills.forEach((targetId: number) => {
          killVotes.set(targetId, (killVotes.get(targetId) || 0) + 1);
        });
        let topTarget = -1, maxVotes = 0;
        killVotes.forEach((count, id) => {
          if (count > maxVotes) { maxVotes = count; topTarget = id; }
        });
        
        if (topTarget !== -1) {
          const victim = players.find((p: Player) => p.id === topTarget);
          if (victim) {
            const isSaved = actions.doctorSaves.size > 0 && Array.from(actions.doctorSaves.values()).includes(topTarget);
            if (isSaved) {
              nightSummary += sysMsg("mafiaFailedDoctorSaved", lang);
              nightData.events.push({ type: 'mafia_attempt', target: victim.name, saved: true });
            } else {
              await storage.updatePlayer(topTarget, { isAlive: false });
              nightSummary += `${buildRoleRevealSentence(victim.name, victim.role || "civilian", players, lang, "killed")} ${getRandomDeathStory(victim.name, lang)}`;
              nightData.events.push({ type: 'mafia_kill', target: victim.name, role: victim.role });
              // A kill actually happened, so the client will show the ~5s elimination
              // overlay going into discussion — delay the discussion timer to match.
              revealDelayMs = ELIMINATION_REVEAL_MS;
            }
          }
        }
      } else {
        nightSummary += sysMsg("nothingHappenedNight", lang);
      }
      
      actions.detectiveChecks.forEach((targetId: number, detectiveId: number) => {
        const target = players.find((p: Player) => p.id === targetId);
        if (target) {
          nightData.events.push({ type: 'detective_check', target: target.name, isMafia: target.role === 'mafia', detectiveId });
        }
      });

      history.push(nightData);
      gameHistory.set(roomId, history);

      await storage.createMessage({ roomId, playerId: 0, playerName: systemName(lang), content: nightSummary });
      await storage.updateRoom(roomId, { status: 'day', phase: 'discussion', lastUpdated: new Date(Date.now() + revealDelayMs) });
      actions.votes.clear();
      actions.mafiaKills.clear();
      actions.doctorSaves.clear();
      actions.detectiveChecks.clear();
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
      const winner = aliveMafiaCount === 0 ? 'civilians' : 'mafia';
      await storage.updateRoom(roomId, { status: 'ended' });
      await finalizeGameEnd(roomId, storage, winner, gameActions);
      broadcastState(roomId);
    } else {
      let duration = (currentRoom.settings as any).phaseDuration * 1000 || PHASE_DURATION;
      if (currentRoom.status === 'night') {
        if (currentRoom.phase === 'mafia') duration = (currentRoom.settings as any).mafiaDuration * 1000 || 15000;
        if (currentRoom.phase === 'doctor') duration = (currentRoom.settings as any).doctorDuration * 1000 || 15000;
        if (currentRoom.phase === 'detective') duration = (currentRoom.settings as any).detectiveDuration * 1000 || 15000;
      }
      // revealDelayMs is only ever nonzero here when this phase's lastUpdated was
      // itself pushed into the future above (an elimination just happened) — keep
      // the real timer in sync with that so the phase doesn't get cut short.
      const timer = setTimeout(() => advancePhase(roomId, wss, storage, roomClients, clients, gameActions), duration + revealDelayMs);
      phaseTimers.set(roomId, timer);
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
  detectiveChecks: Map<number, number>
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
        check: me.role === 'detective' ? actions?.detectiveChecks.get(me.id) || null : null
      } : null;

      const sanitizedPlayers = players.map((p: Player) => {
         if (room.status === 'lobby' || room.status === 'ended' || !p.isAlive) return p; 
         if (me?.id === p.id) return p; 
         if (me && !me.isAlive) return p; 
         if (me?.role === 'mafia' && p.role === 'mafia') return p; 
         if (me?.role === 'detective' && p.role === 'detective') return p;
         if (me?.role === 'doctor' && p.role === 'doctor') return p;
         return { ...p, role: 'unknown' }; 
      });

      // Graveyard chat is only visible to the dead/spectators who can post
      // there — a living player never receives those messages in their own
      // payload, so there's nothing to leak via devtools either.
      const canSeeGraveyard = !!me && (!me.isAlive || !!me.isSpectator);
      const visibleMessages = canSeeGraveyard ? messages : messages.filter(m => !m.isSpectator);

      ws.send(JSON.stringify({
        type: WS_EVENTS.STATE_UPDATE,
        payload: { room, players: sanitizedPlayers, me: me ? { ...me, currentAction: myAction } : me, messages: visibleMessages }
      }));
    }
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
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
          code TEXT UNIQUE NOT NULL,
          ip_address TEXT,
          device_id TEXT
        );
      `);
      await bootstrapClient.query(`
        CREATE TABLE IF NOT EXISTS referral_claims (
          id SERIAL PRIMARY KEY,
          referrer_user_id TEXT NOT NULL,
          referred_user_id TEXT UNIQUE NOT NULL,
          ip_address TEXT,
          device_id TEXT,
          credited BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      // These tables may already exist from before device/IP tracking and delayed
      // crediting were added — CREATE TABLE IF NOT EXISTS above won't retroactively
      // add columns to an existing table, so do that explicitly here.
      await bootstrapClient.query(`ALTER TABLE referral_links ADD COLUMN IF NOT EXISTS ip_address TEXT;`);
      await bootstrapClient.query(`ALTER TABLE referral_links ADD COLUMN IF NOT EXISTS device_id TEXT;`);
      await bootstrapClient.query(`ALTER TABLE referral_claims ADD COLUMN IF NOT EXISTS ip_address TEXT;`);
      await bootstrapClient.query(`ALTER TABLE referral_claims ADD COLUMN IF NOT EXISTS device_id TEXT;`);
      // Anti-farming: a referred account that plays multiple games with zero
      // chat messages, zero votes, and/or gets flagged as AFK by other real
      // players never gets credited, even after REFERRAL_MIN_GAMES — this
      // catches "join, sit AFK for 3 games, collect the bonus" farming that
      // the device/IP check alone doesn't stop (it can be a genuinely new
      // account/device, just not a genuinely playing one).
      await bootstrapClient.query(`ALTER TABLE referral_claims ADD COLUMN IF NOT EXISTS suspicious_games INT NOT NULL DEFAULT 0;`);
      await bootstrapClient.query(`ALTER TABLE referral_claims ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;`);
      const creditedColCheck = await bootstrapClient.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'referral_claims' AND column_name = 'credited'`
      );
      const creditedColAlreadyExisted = (creditedColCheck.rowCount ?? 0) > 0;
      await bootstrapClient.query(`ALTER TABLE referral_claims ADD COLUMN IF NOT EXISTS credited BOOLEAN NOT NULL DEFAULT false;`);
      if (!creditedColAlreadyExisted) {
        // This is the migration that first introduces the "credit only after 3
        // games played" rule. Every claim already in the table predates that
        // rule and was already paid out under the old immediate-award logic —
        // mark them credited so they're not mistaken for pending and re-processed.
        // This only runs once: on every later restart the column already
        // exists, so this block is skipped and genuinely-pending new claims
        // are left alone.
        await bootstrapClient.query(`UPDATE referral_claims SET credited = true WHERE credited = false;`);
      }
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

  app.post("/api/auth/login-2fa", async (req, res) => {
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
  app.post("/api/auth/2fa/send-login-code", async (req, res) => {
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

  app.post("/api/auth/2fa/verify", async (req, res) => {
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

  app.post(api.rooms.create.path, async (req, res) => {
    try {
      const input = api.rooms.create.input.parse(req.body);
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
      const allMessages = await storage.getMessagesByRoom(room.id);
      // This request can't identify who's asking (no session yet — that
      // happens over the websocket right after), so it can never safely
      // include graveyard messages. The websocket connection that follows
      // immediately after will deliver the correctly personalized set.
      const messages = allMessages.filter((m: Message) => !m.isSpectator);

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
          const revealEnabled = (room.settings as any).showRoleReveal !== false;
          const revealDelayMs = revealEnabled ? ROLE_REVEAL_MS : 0;

          await storage.updateRoom(myRoomId, { status: 'night', phase: 'mafia', turn: 1, lastUpdated: new Date(Date.now() + revealDelayMs) });
          gameActions.set(myRoomId, {
            votes: new Map(),
            mafiaKills: new Map(),
            doctorSaves: new Map(),
            detectiveChecks: new Map()
          });
          gameHistory.set(myRoomId, []);

          const duration = (room.settings as any).mafiaDuration * 1000 || 15000;
          const timer = setTimeout(() => advancePhase(myRoomId!, wss, storage, roomClients, clients, gameActions), duration + revealDelayMs);
          phaseTimers.set(myRoomId, timer);
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

           const actions = gameActions.get(myRoomId) || { votes: new Map(), mafiaKills: new Map(), doctorSaves: new Map(), detectiveChecks: new Map() };

           if (action.type === 'chat') {
             console.log("CHAT ACTION received:", { content: (action as any).content, myRoomId, meId: me?.id, meExists: !!me, meAlive: me?.isAlive });
             // Graveyard chat: dead players and true spectators (joined after
             // the game started) can talk among themselves without living
             // players seeing it — they still see the living chat (read-only),
             // it's just one-way. isGraveyard is filtered server-side in
             // broadcastState/GET room, not just hidden client-side, so a
             // living player can't peek at it via devtools either.
             const isGraveyardSender = !!me && (!me.isAlive || !!me.isSpectator);
             if ((action as any).content && (action as any).content.trim() && myRoomId && me) {
               try {
                 console.log("CREATING MESSAGE:", { roomId: myRoomId, playerId: me.id, content: (action as any).content });
                 await storage.createMessage({ 
                   roomId: myRoomId, 
                   playerId: me.id, 
                   playerName: me.name, 
                   content: (action as any).content.trim(),
                   isSpectator: isGraveyardSender
                 });
                 console.log("MESSAGE CREATED SUCCESSFULLY");
                 if (!isGraveyardSender) {
                   getParticipation(myRoomId, me.id).messages++;
                   await respondToHumanChat(myRoomId, (action as any).content.trim(), storage);
                 }
                 broadcastState(myRoomId);
               } catch (err) {
                 console.error("Error creating message", err);
                 const chatLang = (room.settings as any)?.language === "es" ? "es" : "en";
                 ws.send(JSON.stringify({ type: 'notification', payload: { title: sysMsg("chatErrorTitle", chatLang), body: sysMsg("chatErrorBody", chatLang) } }));
               }
             }
             return;
           }

           if (action.type === 'report_afk') {
             const target = players.find((p: Player) => p.id === (action as any).targetId);
             if (me && me.isAlive && target && target.id !== me.id) {
               getParticipation(myRoomId, target.id).afkReports.add(me.id);
             }
             return;
           }

           if (action.type === 'add_bots' && me.isHost) {
             await fillWithBots(myRoomId, storage);
             broadcastState(myRoomId);
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

             // Leave room for at least one civilian so the special roles don't outnumber
             // everyone else and break voting.
             if (mafiaCount < 1 || (mafiaCount + detectiveCount + doctorCount) >= players.length) {
               ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: "Too many special roles for the current player count." } }));
               return;
             }

             const newSettings = {
               ...current,
               mafiaCount, detectiveCount, doctorCount, civilianCount,
               phaseDuration: clampInt(incoming.phaseDuration, current.phaseDuration),
               mafiaDuration: clampInt(incoming.mafiaDuration, current.mafiaDuration),
               doctorDuration: clampInt(incoming.doctorDuration, current.doctorDuration),
               detectiveDuration: clampInt(incoming.detectiveDuration, current.detectiveDuration),
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
               getParticipation(myRoomId, me.id).votes++;
               gameActions.set(myRoomId, actions);
               
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
               broadcastState(myRoomId);
               const killLang = (room.settings as any)?.language === "es" ? "es" : "en";
               ws.send(JSON.stringify({ type: 'notification', payload: { title: sysMsg("targetLockedTitle", killLang), body: sysMsg("targetLockedBody", killLang, { name: target.name }) } }));
               
               if (phaseTimers.has(myRoomId)) { 
                 clearTimeout(phaseTimers.get(myRoomId)); 
                 phaseTimers.delete(myRoomId); 
               }
               await advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
             }
             return;
           }

           if (room.phase === 'doctor' && me.role === 'doctor' && action.type === 'heal') {
             const target = players.find((p: Player) => p.id === action.targetId);
             if (target?.isAlive) {
               actions.doctorSaves.set(me.id, action.targetId);
               gameActions.set(myRoomId, actions);
               broadcastState(myRoomId);
               const healLang = (room.settings as any)?.language === "es" ? "es" : "en";
               ws.send(JSON.stringify({ type: 'notification', payload: { title: sysMsg("protectionAppliedTitle", healLang), body: sysMsg("protectionAppliedBody", healLang, { name: target.name }) } }));
               
               if (phaseTimers.has(myRoomId)) { 
                 clearTimeout(phaseTimers.get(myRoomId)); 
                 phaseTimers.delete(myRoomId); 
               }
               await advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
             }
             return;
           }

           if (room.phase === 'detective' && me.role === 'detective' && action.type === 'check') {
             const target = players.find((p: Player) => p.id === action.targetId);
             if (target) {
                actions.detectiveChecks.set(me.id, target.id);
                gameActions.set(myRoomId, actions);
                const isMafia = target.role === 'mafia';
                ws.send(JSON.stringify({ type: 'check_result', payload: { isMafia, targetId: target.id } }));
                if (isMafia) {
                  await storage.updateRoom(myRoomId, { status: 'ended' });
                  const detectiveLang = (room.settings as any)?.language === "es" ? "es" : "en";
                  await storage.createMessage({ roomId: myRoomId, playerId: 0, playerName: systemName(detectiveLang), content: sysMsg("detectiveDiscoveredMafia", detectiveLang, { name: target.name }), isSpectator: false });
                  const instantWinHistory = gameHistory.get(myRoomId) || [];
                  instantWinHistory.push({ type: 'night', turn: room.turn, events: [{ type: 'detective_check', target: target.name, isMafia: true, detectiveId: me.id }] });
                  gameHistory.set(myRoomId, instantWinHistory);
                  await finalizeGameEnd(myRoomId, storage, 'civilians', gameActions);
                  broadcastState(myRoomId);
                } else {
                  if (phaseTimers.has(myRoomId)) { 
                    clearTimeout(phaseTimers.get(myRoomId)); 
                    phaseTimers.delete(myRoomId); 
                  }
                  await advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
                }
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

  app.post("/api/reset-leaderboard", async (_req, res) => {
    try {
      await storage.resetLeaderboard();
      res.json({ success: true });
    } catch (e: any) {
      console.error("Reset leaderboard error", e);
      res.status(500).json({ error: e?.message || "Failed to reset leaderboard" });
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
  function getClientIp(req: any): string {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
    return req.socket?.remoteAddress || req.ip || "";
  }

  // Recent Players: who this account has actually played a finished game
  // with recently, most recent first — powers a quick "invite them again"
  // list on the home screen. Derived entirely from existing players/rooms
  // data; no separate friends table needed for this simple version.
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
      const deviceId = (req.query.deviceId as string) || null;
      const ip = getClientIp(req);

      const client = await pool.connect();
      try {
        let codeResult = await client.query("SELECT code FROM referral_links WHERE supabase_user_id = $1", [supabaseUserId]);
        let code = codeResult.rows[0]?.code;
        if (!code) {
          code = Math.random().toString(36).substring(2, 8).toUpperCase();
          await client.query(
            `INSERT INTO referral_links (supabase_user_id, code, ip_address, device_id) VALUES ($1, $2, $3, $4) ON CONFLICT (supabase_user_id) DO NOTHING`,
            [supabaseUserId, code, ip, deviceId]
          );
          const recheck = await client.query("SELECT code FROM referral_links WHERE supabase_user_id = $1", [supabaseUserId]);
          code = recheck.rows[0]?.code || code;
        } else {
          // Refresh the stored ip/device so the self-referral check below
          // reflects this account's current device, not just its first one.
          await client.query(`UPDATE referral_links SET ip_address = $2, device_id = $3 WHERE supabase_user_id = $1`, [supabaseUserId, ip, deviceId]);
        }

        const claims = await client.query("SELECT COUNT(*)::int AS n FROM referral_claims WHERE referrer_user_id = $1 AND credited = true", [supabaseUserId]);
        const joined = claims.rows[0]?.n ?? 0;
        const pendingResult = await client.query("SELECT COUNT(*)::int AS n FROM referral_claims WHERE referrer_user_id = $1 AND credited = false", [supabaseUserId]);
        const pending = pendingResult.rows[0]?.n ?? 0;

        res.json({ code, invited: joined, joined, pending, totalCredits: joined * REFERRAL_CREDITS });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("Referral status error:", e.message);
      res.status(500).json({ message: "Failed to load referral info" });
    }
  });

  // Called when a signed-in account (fresh signup or an existing user
  // redeeming a friend's code in Settings) submits a referral code. The
  // credit isn't paid out immediately — it's held pending until the referred
  // account has completed REFERRAL_MIN_GAMES real games (checked immediately
  // below, and again after each game via tryCreditPendingReferral), and is
  // blocked outright if this device or network was already used for a claim.
  app.post("/api/rewards/referral/claim", async (req, res) => {
    try {
      const { code, newSupabaseUserId, deviceId } = req.body;
      if (!code || !newSupabaseUserId) return res.status(400).json({ message: "Missing code or new user id" });
      const ip = getClientIp(req);

      const client = await pool.connect();
      try {
        const linkResult = await client.query(
          "SELECT supabase_user_id, ip_address, device_id FROM referral_links WHERE code = $1",
          [code]
        );
        const referrerId = linkResult.rows[0]?.supabase_user_id;
        if (!referrerId) return res.status(404).json({ message: "Invalid referral code" });
        if (referrerId === newSupabaseUserId) return res.status(400).json({ message: "Can't refer yourself" });

        // Same device or same network as the referrer's own account — almost
        // certainly one person claiming their own link from an alt account.
        const referrerIp = linkResult.rows[0]?.ip_address;
        const referrerDevice = linkResult.rows[0]?.device_id;
        if ((referrerDevice && deviceId && referrerDevice === deviceId) || (referrerIp && ip && referrerIp === ip)) {
          return res.status(403).json({ message: "This looks like the same device or network as the referrer's account." });
        }

        // This device or network already claimed a referral before, under
        // any account — blocks logging out and re-claiming with a fresh
        // account on the same phone.
        const priorUse = await client.query(
          `SELECT 1 FROM referral_claims WHERE (device_id IS NOT NULL AND device_id = $1) OR (ip_address IS NOT NULL AND ip_address = $2) LIMIT 1`,
          [deviceId || null, ip || null]
        );
        if ((priorUse.rowCount ?? 0) > 0) {
          return res.status(403).json({ message: "A referral has already been claimed from this device or network." });
        }

        try {
          await client.query(
            `INSERT INTO referral_claims (referrer_user_id, referred_user_id, ip_address, device_id, credited) VALUES ($1, $2, $3, $4, false)`,
            [referrerId, newSupabaseUserId, ip, deviceId || null]
          );
        } catch {
          // Unique constraint on referred_user_id — this account already claimed a referral before.
          return res.status(429).json({ message: "Referral already claimed" });
        }

        const justCredited = await tryCreditPendingReferral(newSupabaseUserId);
        if (justCredited) {
          const balanceResult = await client.query("SELECT credits FROM account_credits WHERE supabase_user_id = $1", [newSupabaseUserId]);
          const totalCredits = balanceResult.rows[0]?.credits ?? 0;
          return res.json({ success: true, credited: true, creditsAwarded: REFERRAL_CREDITS, totalCredits });
        }

        const gamesPlayed = await getCompletedGamesCount(newSupabaseUserId);
        const gamesNeeded = Math.max(0, REFERRAL_MIN_GAMES - gamesPlayed);
        res.json({ success: true, credited: false, gamesNeeded });
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

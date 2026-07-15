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

const gameHistory = new Map<number, any[]>();

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

function getRandomDeathStory(name: string) {
  const story = DEATH_STORIES[Math.floor(Math.random() * DEATH_STORIES.length)];
  return story.replace("{name}", name);
}

const phaseTimers = new Map<number, NodeJS.Timeout>();
const PHASE_DURATION = 15000;
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

const BOT_MESSAGES = {
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

// Reads an actual human message and picks the bot response category that best
// matches what was said, instead of only checking a couple of keywords.
function classifyMessage(msgLower: string, players: Player[], bot: Player, alivePlayers: Player[]) {
  const mentionedPlayer = players.find((p: Player) => p.name && msgLower.includes(p.name.toLowerCase()) && p.id !== bot.id && p.isAlive);

  const roleWords = ["i'm the detective", "i am the detective", "i'm the doctor", "i am the doctor", "i'm detective", "i'm doctor", "claim detective", "claim doctor", "i am detective", "i am doctor"];
  if (roleWords.some(w => msgLower.includes(w))) {
    return { category: "roleClaim" as const, targetName: undefined };
  }

  const deathWords = ["died", "dead", "killed last night", "who died", "rip", "eliminated"];
  if (deathWords.some(w => msgLower.includes(w))) {
    return { category: "deathTalk" as const, targetName: undefined };
  }

  const accusationWords = ["mafia", "sus", "vote", "kill", "suspicious", "guilty", "lying"];
  const defenseWords = ["innocent", "not me", "trust me", "i'm not", "im not", "i swear"];
  const agreementWords = ["agree", "yes", "you're right", "youre right", "exactly", "true", "same"];
  const greetingWords = ["hey", "hi ", "hello", "morning", "good morning", "gm"];

  if (mentionedPlayer) {
    if (accusationWords.some(w => msgLower.includes(w))) {
      return { category: "accusation" as const, targetName: mentionedPlayer.name };
    }
    if (defenseWords.some(w => msgLower.includes(w))) {
      return { category: "defense" as const, targetName: undefined };
    }
    return { category: "response" as const, targetName: mentionedPlayer.name };
  }

  if (msgLower.includes("?")) {
    return { category: "response" as const, targetName: undefined };
  }
  if (accusationWords.some(w => msgLower.includes(w))) {
    if (alivePlayers.length > 0 && Math.random() > 0.4) {
      const victim = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      return { category: "accusation" as const, targetName: victim.name };
    }
    return { category: "suspicion" as const, targetName: undefined };
  }
  if (agreementWords.some(w => msgLower.includes(w))) {
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

function buildBotReply(category: keyof typeof BOT_MESSAGES, targetName: string | undefined, botId: number): string {
  const line = pickUnique(BOT_MESSAGES[category], botId);
  return targetName ? line.replace("{name}", targetName) : line;
}

async function respondToHumanChat(roomId: number, humanMessage: string, storage: any) {
  const room = await storage.getRoom(roomId);
  if (!room || room.status === 'lobby' || room.status === 'ended') return;

  const players = await storage.getPlayersInRoom(roomId);
  const bots = players.filter((p: Player) => p.isBot && p.isAlive);
  if (bots.length === 0) return;

  const msgLower = humanMessage.toLowerCase();

  // If a bot was directly named in the message, that specific bot always replies —
  // being called out shouldn't have a chance of being ignored.
  const calledBot = bots.find((b: Player) => b.name && msgLower.includes(b.name.toLowerCase().split("_")[0].toLowerCase()));
  // A direct question also deserves a guaranteed response, otherwise it's a coin flip.
  const isDirectQuestion = msgLower.includes("?");

  if (!calledBot && !isDirectQuestion && Math.random() > 0.8) return;

  const bot = calledBot || bots[Math.floor(Math.random() * bots.length)];
  const alivePlayers = players.filter((p: Player) => p.isAlive && p.id !== bot.id);

  if (calledBot) {
    const content = buildBotReply("calledOut", undefined, bot.id);
    await storage.createMessage({ roomId, playerId: bot.id, playerName: bot.name, content });
    return;
  }

  const { category, targetName } = classifyMessage(msgLower, players, bot, alivePlayers);
  const content = buildBotReply(category, targetName, bot.id);

  if (content) {
    await storage.createMessage({ roomId, playerId: bot.id, playerName: bot.name, content });
  }
}

async function handleBotActions(roomId: number, wss: WebSocketServer, storage: any, roomClients: Map<number, Set<string>>, clients: Map<string, WebSocket>, gameActions: Map<number, any>) {
  const room = await storage.getRoom(roomId);
  if (!room || room.status === 'lobby' || room.status === 'ended') return;

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
          content = buildBotReply("calledOut", undefined, bot.id);
        } else {
          const { category, targetName } = classifyMessage(msgText, players, bot, alivePlayers);
          content = buildBotReply(category, targetName, bot.id);
        }
      } else {
        const rand = Math.random();
        if (rand > 0.7 && alivePlayers.length > 0) {
          const victim = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
          content = buildBotReply("accusation", victim.name, bot.id);
        } else if (rand > 0.55) {
          content = buildBotReply("defense", undefined, bot.id);
        } else if (rand > 0.4) {
          content = buildBotReply("suspicion", undefined, bot.id);
        } else if (rand > 0.25) {
          content = buildBotReply("response", undefined, bot.id);
        } else if (rand > 0.15) {
          content = buildBotReply("agreement", undefined, bot.id);
        } else {
          content = buildBotReply("general", undefined, bot.id);
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

async function advancePhase(roomId: number, wss: WebSocketServer, storage: any, roomClients: Map<number, Set<string>>, clients: Map<string, WebSocket>, gameActions: Map<number, any>) {
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
      
      if (voteResults.length > 0 && (room.settings as any).showVoteResults !== false) {
        let voteSummary = "Voting Results: ";
        voteResults.forEach(res => { voteSummary += `${res.voterName} voted for ${res.targetName}. `; });
        await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: voteSummary });
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
          await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: `${victim.name} was voted out. They were the ${victim.role}.` });
          
          const remainingPlayers = await storage.getPlayersInRoom(roomId);
          const remainingMafia = remainingPlayers.filter((p: Player) => p.role === 'mafia' && p.isAlive);
          if (remainingMafia.length === 0) {
            await storage.updateRoom(roomId, { status: 'ended' });
            await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: "The Mafia has been eliminated! Civilians win!" });
            gameEnded = true;
          }
          const remainingInnocents = remainingPlayers.filter((p: Player) => p.role !== 'mafia' && p.isAlive);
          if (!gameEnded && remainingMafia.length >= remainingInnocents.length) {
            await storage.updateRoom(roomId, { status: 'ended' });
            await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: "The Mafia has taken over! Mafia wins!" });
            gameEnded = true;
          }
        }
      } else {
        await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: `No one was voted out today.` });
      }
      
      if (gameEnded) {
        broadcastState(roomId);
        return;
      }
      
      await storage.updateRoom(roomId, { status: 'night', phase: 'mafia', turn: (room.turn || 0) + 1, lastUpdated: new Date() });
      actions.votes.clear();
      actions.mafiaKill = null;
      actions.doctorSave = null;
      actions.detectiveCheck = null;
      gameActions.set(roomId, actions);
      broadcastState(roomId);
      const mafiaSettings = room.settings as any;
      const mafiaTimer = setTimeout(() => advancePhase(roomId, wss, storage, roomClients, clients, gameActions), mafiaSettings.mafiaDuration * 1000 || 15000);
      phaseTimers.set(roomId, mafiaTimer);
      return;
    }
  }
  const room = await storage.getRoom(roomId);
  if (!room) return;

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

      if (voteResults.length > 0 && (room.settings as any).showVoteResults !== false) {
        let voteSummary = "Voting Results: ";
        voteResults.forEach(res => { voteSummary += `${res.voterName} voted for ${res.targetName}. `; });
        await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: voteSummary });
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
          await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: `${victim.name} was voted out. They were the ${victim.role}.` });
          
          const remainingPlayers = await storage.getPlayersInRoom(roomId);
          const remainingMafia = remainingPlayers.filter((p: Player) => p.role === 'mafia' && p.isAlive);
          if (remainingMafia.length === 0) {
            await storage.updateRoom(roomId, { status: 'ended' });
            await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: "The Mafia has been eliminated! Civilians win!" });
            gameEnded = true;
          }
          const remainingInnocents = remainingPlayers.filter((p: Player) => p.role !== 'mafia' && p.isAlive);
          if (!gameEnded && remainingMafia.length >= remainingInnocents.length) {
            await storage.updateRoom(roomId, { status: 'ended' });
            await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: "The Mafia has taken over! Mafia wins!" });
            gameEnded = true;
          }
        }
      } else {
        await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: `No one was voted out today.` });
      }

      if (!gameEnded) {
        await storage.updateRoom(roomId, { status: 'night', phase: 'mafia', turn: (room.turn || 0) + 1, lastUpdated: new Date() });
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
        if (phaseTimers.has(roomId)) { clearTimeout(phaseTimers.get(roomId)); phaseTimers.delete(roomId); }
        gameActions.delete(roomId);
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

      let nightSummary = "The night has ended. ";
      
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
              nightSummary += "The mafia tried to kill someone, but the doctor saved them!";
              nightData.events.push({ type: 'mafia_attempt', target: victim.name, saved: true });
            } else {
              await storage.updatePlayer(topTarget, { isAlive: false });
              nightSummary += `${victim.name} was killed. They were the ${victim.role}. ${getRandomDeathStory(victim.name)}`;
              nightData.events.push({ type: 'mafia_kill', target: victim.name, role: victim.role });
            }
          }
        }
      } else {
        nightSummary += "Nothing happened during the night.";
      }
      
      actions.detectiveChecks.forEach((targetId: number, detectiveId: number) => {
        const target = players.find((p: Player) => p.id === targetId);
        if (target) {
          nightData.events.push({ type: 'detective_check', target: target.name, isMafia: target.role === 'mafia', detectiveId });
        }
      });

      history.push(nightData);
      gameHistory.set(roomId, history);

      await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: nightSummary });
      await storage.updateRoom(roomId, { status: 'day', phase: 'discussion', lastUpdated: new Date() });
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
        if (currentRoom.phase === 'mafia') duration = (currentRoom.settings as any).mafiaDuration * 1000 || 15000;
        if (currentRoom.phase === 'doctor') duration = (currentRoom.settings as any).doctorDuration * 1000 || 15000;
        if (currentRoom.phase === 'detective') duration = (currentRoom.settings as any).detectiveDuration * 1000 || 15000;
      }
      const timer = setTimeout(() => advancePhase(roomId, wss, storage, roomClients, clients, gameActions), duration);
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

      ws.send(JSON.stringify({
        type: WS_EVENTS.STATE_UPDATE,
        payload: { room, players: sanitizedPlayers, me: me ? { ...me, currentAction: myAction } : me, messages }
      }));
    }
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
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
        .values({ supabaseUserId, totpSecret: secret, isEnabled: false })
        .onConflictDoUpdate({
          target: userMfa.supabaseUserId,
          set: { totpSecret: secret, isEnabled: false },
        });

      res.json({ secret, qrCodeUri: uri });
    } catch (err: any) {
      const isNetwork = err?.message?.includes("EAI_AGAIN") || err?.message?.includes("getaddrinfo") || err?.code === "ECONNREFUSED";
      if (isNetwork) return res.status(503).json({ message: "Server temporarily unavailable. Please try again shortly." });
      res.status(400).json({ message: err?.message || "Setup failed" });
    }
  });

  app.post("/api/auth/2fa/verify", async (req, res) => {
    try {
      const { supabaseUserId, code } = req.body;
      if (!supabaseUserId || !code) return res.status(400).json({ message: "Missing fields" });

      const [mfa] = await db.select().from(userMfa).where(eq(userMfa.supabaseUserId, supabaseUserId));
      if (!mfa || !mfa.totpSecret) {
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
      res.json({ isEnabled: mfa?.isEnabled ?? false });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Status check failed" });
    }
  });

  app.post("/api/auth/2fa/disable", async (req, res) => {
    try {
      const { supabaseUserId } = req.body;
      if (!supabaseUserId) return res.status(400).json({ message: "Missing user ID" });

      await db.update(userMfa).set({ isEnabled: false, totpSecret: null }).where(eq(userMfa.supabaseUserId, supabaseUserId));
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

          await storage.updateRoom(myRoomId, { status: 'night', phase: 'mafia', turn: 1, lastUpdated: new Date() });
          gameActions.set(myRoomId, {
            votes: new Map(),
            mafiaKills: new Map(),
            doctorSaves: new Map(),
            detectiveChecks: new Map()
          });
          gameHistory.set(myRoomId, []);

          const duration = (room.settings as any).mafiaDuration * 1000 || 15000;
          const timer = setTimeout(() => advancePhase(myRoomId!, wss, storage, roomClients, clients, gameActions), duration);
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
             if ((action as any).content && (action as any).content.trim() && myRoomId && me && me.isAlive) {
               try {
                 console.log("CREATING MESSAGE:", { roomId: myRoomId, playerId: me.id, content: (action as any).content });
                 await storage.createMessage({ 
                   roomId: myRoomId, 
                   playerId: me.id, 
                   playerName: me.name, 
                   content: (action as any).content.trim(),
                   isSpectator: false
                 });
                 console.log("MESSAGE CREATED SUCCESSFULLY");
                 await respondToHumanChat(myRoomId, (action as any).content.trim(), storage);
                 broadcastState(myRoomId);
               } catch (err) {
                 console.error("Error creating message", err);
                 ws.send(JSON.stringify({ type: 'notification', payload: { title: "Error", body: "Failed to send message" } }));
               }
             } else if (!me?.isAlive) {
               ws.send(JSON.stringify({ type: 'notification', payload: { title: "🪦 Silence from Beyond", body: "The dead cannot speak and risk snitching..." } }));
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
               ws.send(JSON.stringify({ type: 'notification', payload: { title: "Vote Registered", body: "Your vote has been recorded." } }));
               
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
               ws.send(JSON.stringify({ type: 'notification', payload: { title: "Target Locked", body: `You have targeted ${target.name} for elimination.` } }));
               
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
               ws.send(JSON.stringify({ type: 'notification', payload: { title: "Protection Applied", body: `You are protecting ${target.name} tonight.` } }));
               
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
                  await storage.createMessage({ roomId: myRoomId, playerId: 0, playerName: "System", content: `The detective discovered the Mafia! ${target.name} was the killer. Civilians win!`, isSpectator: false });
                  if (phaseTimers.has(myRoomId)) { clearTimeout(phaseTimers.get(myRoomId)); phaseTimers.delete(myRoomId); }
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

  // Check ad claim status for today (server-side rate limit check)
  app.get("/api/ad-claim/status", async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) return res.json({ claimsToday: 0, remaining: 5 });

      const today = new Date().toISOString().split("T")[0];
      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT claim_count FROM ad_claims WHERE session_id = $1 AND claim_date = $2",
          [sessionId, today]
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

  // Claim free ad credits — enforced server-side 5/day limit
  app.post("/api/ad-claim", async (req, res) => {
    try {
      const { sessionId, roomCode } = req.body;
      if (!sessionId) return res.status(400).json({ message: "Missing sessionId" });

      const today = new Date().toISOString().split("T")[0];
      const MAX_DAILY = 5;
      const REWARD = 5;

      const client = await pool.connect();
      try {
        const check = await client.query(
          "SELECT claim_count FROM ad_claims WHERE session_id = $1 AND claim_date = $2",
          [sessionId, today]
        );
        const currentCount = check.rows[0]?.claim_count ?? 0;

        if (currentCount >= MAX_DAILY) {
          return res.status(429).json({ message: "Daily limit reached. Try again tomorrow." });
        }

        await client.query(
          `INSERT INTO ad_claims (session_id, claim_date, claim_count, last_claim_at)
           VALUES ($1, $2, 1, now())
           ON CONFLICT (session_id, claim_date)
           DO UPDATE SET claim_count = ad_claims.claim_count + 1, last_claim_at = now()`,
          [sessionId, today]
        );

        const newCount = currentCount + 1;

        // Award credits to player in DB if room context available
        if (roomCode) {
          try {
            const room = await storage.getRoomByCode(roomCode as string);
            if (room) {
              const players = await storage.getPlayersInRoom(room.id);
              const player = players.find((p) => p.sessionId === sessionId);
              if (player) {
                const currentCredits = (player as any).credits ?? 0;
                await storage.updatePlayer(player.id, { credits: currentCredits + REWARD } as any);
              }
            }
          } catch {
            // Non-fatal
          }
        }

        res.json({ success: true, creditsAwarded: REWARD, claimsToday: newCount, remaining: Math.max(0, MAX_DAILY - newCount) });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("Ad claim error:", e.message);
      res.status(500).json({ message: "Failed to process claim" });
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

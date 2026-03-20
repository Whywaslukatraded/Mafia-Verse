import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { WS_EVENTS, type GameState, type GameAction, type Player } from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";

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
      role: null,
      isAlive: true,
      isHost: false,
      sessionId: "bot-" + randomUUID(),
      isSpectator: false,
      isBot: true
    });
  }
}

const BOT_MESSAGES = {
  general: ["I think it's one of you...", "I'm innocent!", "Trust me.", "Who is the mafia?", "Found anything?", "This is getting intense."],
  accusation: ["I'm voting for {name}. They seem suspicious.", "Could it be {name}? They haven't said much.", "I'm leaning towards {name}."],
  defense: ["It's not me, I swear!", "Why are you looking at me?", "I'm literally on your side."]
};

async function handleBotActions(roomId: number, wss: WebSocketServer, storage: any, roomClients: Map<number, Set<string>>, clients: Map<string, WebSocket>, gameActions: Map<number, any>) {
  const room = await storage.getRoom(roomId);
  if (!room || room.status === 'lobby' || room.status === 'ended') return;

  const players = await storage.getPlayersInRoom(roomId);
  const bots = players.filter((p: Player) => p.isBot && p.isAlive);
  const actions = gameActions.get(roomId) || { votes: new Map(), mafiaKill: null, doctorSave: null, detectiveCheck: null };

  // Bot voting/action logic - bots act immediately, no delays
  for (const bot of bots) {
    const alivePlayers = players.filter((p: Player) => p.isAlive && p.id !== bot.id);
    if (alivePlayers.length === 0) continue;

    let target;
    const realPlayersAlive = alivePlayers.filter((p: Player) => !p.isBot);
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
      // Check if all alive players have voted after bot votes
      const allAlivePlayers = players.filter(p => p.isAlive);
      if (actions.votes.size === allAlivePlayers.length) {
        // All players voted - signal to advance
        return true; // Signal to advance phase immediately
      }
    } else if (room.phase === 'mafia' && bot.role === 'mafia') {
      actions.mafiaKill = target.id;
    } else if (room.phase === 'doctor' && bot.role === 'doctor') {
      actions.doctorSave = target.id;
    }

    if (Math.random() > 0.4) {
      let content = "";
      const rand = Math.random();
      if (rand > 0.7 && alivePlayers.length > 0) {
        const victim = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        content = BOT_MESSAGES.accusation[Math.floor(Math.random() * BOT_MESSAGES.accusation.length)].replace("{name}", victim.name);
      } else if (rand > 0.5) {
        content = BOT_MESSAGES.defense[Math.floor(Math.random() * BOT_MESSAGES.defense.length)];
      } else {
        content = BOT_MESSAGES.general[Math.floor(Math.random() * BOT_MESSAGES.general.length)];
      }
      if (content) {
        await storage.createMessage({ roomId, playerId: bot.id, playerName: bot.name, content });
      }
    }
  }
  gameActions.set(roomId, actions);
  return false; // No advance needed
}

async function advancePhase(roomId: number, wss: WebSocketServer, storage: any, roomClients: Map<number, Set<string>>, clients: Map<string, WebSocket>, gameActions: Map<number, any>) {
  const shouldAdvanceImmediately = await handleBotActions(roomId, wss, storage, roomClients, clients, gameActions);
  if (shouldAdvanceImmediately) {
    // Bots voted and completed voting phase - recursive call to process votes and move to next phase
    const room = await storage.getRoom(roomId);
    if (room?.phase === 'voting') {
      // Process the votes immediately since all are in
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
      
      if (topTargetId !== -1) {
        const victim = players.find((p: Player) => p.id === topTargetId);
        if (victim) {
          await storage.updatePlayer(topTargetId, { isAlive: false });
          await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: `${victim.name} was voted out. They were the ${victim.role}.` });
        }
      } else {
        await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: `No one was voted out today.` });
      }
      
      await storage.updateRoom(roomId, { status: 'night', phase: 'mafia', turn: (room.turn || 0) + 1 });
      actions.votes.clear();
      actions.mafiaKill = null;
      actions.doctorSave = null;
      actions.detectiveCheck = null;
      gameActions.set(roomId, actions);
      broadcastState(roomId);
      return;
    }
  }
  const room = await storage.getRoom(roomId);
  if (!room) return;

  const players = await storage.getPlayersInRoom(roomId);
  const actions = gameActions.get(roomId) || { votes: new Map(), mafiaKill: null, doctorSave: null, detectiveCheck: null };

  if (room.status === 'day') {
    if (room.phase === 'discussion') {
      await storage.updateRoom(roomId, { phase: 'voting' });
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
          }
        }
      } else {
        await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: `No one was voted out today.` });
      }

      await storage.updateRoom(roomId, { status: 'night', phase: 'mafia', turn: (room.turn || 0) + 1 });
      actions.mafiaKill = null;
      actions.doctorSave = null;
      actions.detectiveCheck = null;
      actions.votes.clear();
    }
  } else if (room.status === 'night') {
    if (room.phase === 'mafia') {
      // Check if any mafia are alive, if not skip to doctor
      const aliveMafia = players.filter(p => p.role === 'mafia' && p.isAlive);
      if (aliveMafia.length === 0) {
        await storage.updateRoom(roomId, { phase: 'detective' });
      } else {
        await storage.updateRoom(roomId, { phase: 'doctor' });
      }
    } else if (room.phase === 'doctor') {
      // Check if doctor is alive, if not skip to detective
      const aliveDoctor = players.find(p => p.role === 'doctor' && p.isAlive);
      if (!aliveDoctor) {
        await storage.updateRoom(roomId, { phase: 'detective' });
      } else {
        await storage.updateRoom(roomId, { phase: 'detective' });
      }
    } else if (room.phase === 'detective') {
      const history = gameHistory.get(roomId) || [];
      const nightData: any = { type: 'night', turn: room.turn, events: [] };

      let nightSummary = "The night has ended. ";
      if (actions.mafiaKill) {
        const victim = players.find((p: Player) => p.id === actions.mafiaKill);
        if (victim) {
          if (actions.mafiaKill === actions.doctorSave) {
            nightSummary += "The mafia tried to kill someone, but the doctor saved them!";
            nightData.events.push({ type: 'mafia_attempt', target: victim.name, saved: true });
          } else {
            await storage.updatePlayer(actions.mafiaKill, { isAlive: false });
            nightSummary += `${victim.name} was killed. They were the ${victim.role}. ${getRandomDeathStory(victim.name)}`;
            nightData.events.push({ type: 'mafia_kill', target: victim.name, role: victim.role });
          }
        }
      } else {
        nightSummary += "Nothing happened during the night.";
      }
      
      if (actions.detectiveCheck) {
        const target = players.find((p: Player) => p.id === actions.detectiveCheck);
        if (target) {
          nightData.events.push({ type: 'detective_check', target: target.name, isMafia: target.role === 'mafia' });
        }
      }

      history.push(nightData);
      gameHistory.set(roomId, history);

      await storage.createMessage({ roomId, playerId: 0, playerName: "System", content: nightSummary });
      await storage.updateRoom(roomId, { status: 'day', phase: 'discussion' });
      actions.votes.clear();
      actions.mafiaKill = null;
      actions.doctorSave = null;
      actions.detectiveCheck = null;
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
      for (const p of playersInRoom) {
        await storage.updatePlayer(p.id, { gameHistory: history });
      }
      await storage.updateRoom(roomId, { status: 'ended' });
      if (phaseTimers.has(roomId)) { clearTimeout(phaseTimers.get(roomId)); phaseTimers.delete(roomId); }
      broadcastState(roomId); // Broadcast the ended state immediately
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
  mafiaKill: number | null,
  doctorSave: number | null,
  detectiveCheck: number | null
}>();

async function broadcastState(roomId: number) {
  const sessions = roomClients.get(roomId);
  if (!sessions) return;

  const room = await storage.getRoom(roomId);
  if (!room) return;
  const players = await storage.getPlayersInRoom(roomId);
  const messages = await storage.getMessagesByRoom(roomId);

  sessions.forEach(sessionId => {
    const ws = clients.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const me = players.find(p => p.sessionId === sessionId);
      const actions = gameActions.get(roomId);
      const myAction = me ? {
        vote: actions?.votes.get(me.id),
        kill: me.role === 'mafia' ? actions?.mafiaKill : null,
        heal: me.role === 'doctor' ? actions?.doctorSave : null,
        check: me.role === 'detective' ? actions?.detectiveCheck : null
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
  app.post(api.rooms.create.path, async (req, res) => {
    try {
      const input = api.rooms.create.input.parse(req.body);
      const room = await storage.createRoom({
        ...input.settings,
        phaseDuration: input.settings.phaseDuration ?? 30
      } as any);
      
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
        isSpectator: false,
        isBot: false,
        wins: 0,
        gamesPlayed: 0,
        achievements: [],
        gameHistory: []
      });

      res.status(201).json({ code: room.code, playerId: player.id, sessionId });

      setTimeout(async () => {
        const playersInRoom = await storage.getPlayersInRoom(room.id);
        if (playersInRoom.length < 6) {
          await fillWithBots(room.id, storage);
          broadcastState(room.id);
        }
      }, 1000);
    } catch (err: any) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Internal server error" });
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
        isSpectator,
        isBot: false,
        wins: 0,
        gamesPlayed: 0,
        achievements: [],
        gameHistory: []
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
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get room state by code
  app.get(api.rooms.get.path, async (req, res) => {
    try {
      const code = (req.params as any).code as string;
      if (!code) return res.status(400).json({ message: "Room code required" });

      const room = await storage.getRoomByCode(code);
      if (!room) return res.status(404).json({ message: "Room not found" });

      const players = await storage.getPlayersInRoom(room.id);
      const messages = await storage.getMessagesByRoom(room.id);

      res.json({
        room,
        players,
        messages,
        me: null
      });
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

        if (msg.type === WS_EVENTS.JOIN) {
          const { code, sessionId } = msg.payload;
          const room = await storage.getRoomByCode(code);
          if (!room) return;
          const players = await storage.getPlayersInRoom(room.id);
          const player = players.find(p => p.sessionId === sessionId);
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
          const me = players.find(p => p.sessionId === mySessionId);
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

          await storage.updateRoom(myRoomId, { status: 'night', phase: 'mafia', turn: 1 });
          gameActions.set(myRoomId, {
            votes: new Map(),
            mafiaKill: null,
            doctorSave: null,
            detectiveCheck: null
          });
          gameHistory.set(myRoomId, []);

          const duration = (room.settings as any).mafiaDuration * 1000 || 15000;
          const timer = setTimeout(() => advancePhase(myRoomId!, wss, storage, roomClients, clients, gameActions), duration);
          phaseTimers.set(myRoomId, timer);
          broadcastState(myRoomId);
        }

        if (msg.type === WS_EVENTS.ACTION) {
           if (!myRoomId || !mySessionId) return;
           const action = msg.payload as GameAction;
           const players = await storage.getPlayersInRoom(myRoomId);
           const me = players.find(p => p.sessionId === mySessionId);
           const room = await storage.getRoom(myRoomId);
           if (!me || !room) return;

           const actions = gameActions.get(myRoomId) || { votes: new Map(), mafiaKill: null, doctorSave: null, detectiveCheck: null };

           if (action.type === 'chat') {
             if (action.content && action.content.trim()) {
               await storage.createMessage({ 
                 roomId: myRoomId, 
                 playerId: me.id, 
                 playerName: me.name, 
                 content: action.content,
                 isSpectator: (me.isSpectator || !me.isAlive) === true ? true : false
               });
               broadcastState(myRoomId);
             }
             return;
           }

           if (action.type === 'add_bots' && me.isHost) {
             await fillWithBots(myRoomId, storage);
             broadcastState(myRoomId);
             return;
           }

           if (action.type === 'remove_bot' && me.isHost) {
             const bot = players.find(p => p.id === action.playerId && p.isBot);
             if (bot) { await storage.deletePlayer(bot.id); broadcastState(myRoomId); }
             return;
           }

           if (action.type === 'replay' && me.isHost) {
             const currentRoom = await storage.getRoom(myRoomId);
             if (currentRoom?.status !== 'ended') return; // Only allow replay from ended state
             
             // Track wins for the winning team before resetting
             const survivors = players.filter(p => p.isAlive);
             const mafiaCount = survivors.filter(p => p.role === 'mafia').length;
             const innocentsCount = survivors.length - mafiaCount;
             
             let winners: string[] = [];
             if (mafiaCount > 0 && innocentsCount === 0) winners = ['mafia'];
             else if (mafiaCount === 0) winners = ['civilian', 'doctor', 'detective'];

             for (const p of players) {
               if (p.isBot) continue; // Don't track bot stats
               const isWinner = p.role && winners.includes(p.role);
               const newWins = (p.wins || 0) + (isWinner ? 1 : 0);
               const newGamesPlayed = (p.gamesPlayed || 0) + 1;
               
               // Check achievements
               const currentAchievements = (p.achievements as string[]) || [];
               const earnedAchievements = new Set(currentAchievements);
               
               if (isWinner && !earnedAchievements.has('first_win')) {
                 earnedAchievements.add('first_win');
               }
               
               if (isWinner && p.role === 'mafia' && newWins >= 5) {
                 earnedAchievements.add('mafia_master');
               }
               
               // Final Stand: Winner and last civilian alive (or only winner alive)
               const alivePlayers = players.filter(pl => pl.isAlive);
               if (isWinner && p.role !== 'mafia' && alivePlayers.length === 1 && alivePlayers[0].id === p.id) {
                 earnedAchievements.add('survivor');
               }

               // Quick Thinker: Win with short durations
               if (isWinner && ((room.settings as any).phaseDuration <= 15)) {
                 earnedAchievements.add('quick_thinker');
               }

               await storage.updatePlayer(p.id, { 
                 role: null, 
                 isAlive: true, 
                 isSpectator: false, 
                 gamesPlayed: newGamesPlayed,
                 wins: newWins,
                 achievements: Array.from(earnedAchievements),
                 gameHistory: []
               });
             }
             
             // Clear game state and messages for new game
             gameActions.delete(myRoomId);
             gameHistory.delete(myRoomId);
             await storage.deleteMessagesByRoom(myRoomId);
             
             await storage.updateRoom(myRoomId, { status: 'lobby', phase: 'lobby', turn: 1 });
             broadcastState(myRoomId);
             return;
           }

           if (action.type === 'vote' && room.status === 'day' && room.phase === 'voting') {
             const target = players.find(p => p.id === action.targetId);
             if (me.isAlive && target?.isAlive) {
               // Register this player's vote
               actions.votes.set(me.id, action.targetId);
               gameActions.set(myRoomId, actions);
               
               // Have bots vote immediately if they haven't already
               const bots = players.filter(p => p.isBot && p.isAlive && !actions.votes.has(p.id));
               for (const bot of bots) {
                 const eligibleTargets = players.filter(p => p.isAlive && p.id !== bot.id);
                 if (eligibleTargets.length > 0) {
                   const botTarget = eligibleTargets[Math.floor(Math.random() * eligibleTargets.length)];
                   actions.votes.set(bot.id, botTarget.id);
                 }
               }
               gameActions.set(myRoomId, actions);
               
               broadcastState(myRoomId);
               ws.send(JSON.stringify({ type: 'notification', payload: { title: "Vote Registered", body: "Your vote has been recorded." } }));
               
               // Check if ALL alive players (human and bot) have voted
               const allAlivePlayers = players.filter(p => p.isAlive);
               const votedPlayers = Array.from(actions.votes.keys());
               if (votedPlayers.length === allAlivePlayers.length) {
                 // All players voted - advance phase immediately
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
             const target = players.find(p => p.id === action.targetId);
             if (target?.isAlive && target.role !== 'mafia') {
               actions.mafiaKill = action.targetId;
               gameActions.set(myRoomId, actions);
               broadcastState(myRoomId);
               ws.send(JSON.stringify({ type: 'notification', payload: { title: "Target Locked", body: `You have targeted ${target.name} for elimination.` } }));
               
               // Advance immediately when Mafia acts
               if (phaseTimers.has(myRoomId)) { 
                 clearTimeout(phaseTimers.get(myRoomId)); 
                 phaseTimers.delete(myRoomId); 
               }
               await advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
             }
             return;
           }

           if (room.phase === 'doctor' && me.role === 'doctor' && action.type === 'heal') {
             const target = players.find(p => p.id === action.targetId);
             if (target?.isAlive) {
               actions.doctorSave = action.targetId;
               gameActions.set(myRoomId, actions);
               broadcastState(myRoomId);
               ws.send(JSON.stringify({ type: 'notification', payload: { title: "Protection Applied", body: `You are protecting ${target.name} tonight.` } }));
               
               // Advance immediately when doctor acts
               if (phaseTimers.has(myRoomId)) { 
                 clearTimeout(phaseTimers.get(myRoomId)); 
                 phaseTimers.delete(myRoomId); 
               }
               await advancePhase(myRoomId, wss, storage, roomClients, clients, gameActions);
             }
             return;
           }

           if (room.phase === 'detective' && me.role === 'detective' && action.type === 'check') {
             const target = players.find(p => p.id === action.targetId);
             if (target) {
                actions.detectiveCheck = target.id;
                gameActions.set(myRoomId, actions);
                const isMafia = target.role === 'mafia';
                ws.send(JSON.stringify({ type: 'check_result', payload: { isMafia, targetId: target.id } }));
                if (isMafia) {
                  await storage.updateRoom(myRoomId, { status: 'ended' });
                  await storage.createMessage({ roomId: myRoomId, playerId: 0, playerName: "System", content: `The detective discovered the Mafia! ${target.name} was the killer. Civilians win!`, isSpectator: false });
                  if (phaseTimers.has(myRoomId)) { clearTimeout(phaseTimers.get(myRoomId)); phaseTimers.delete(myRoomId); }
                  broadcastState(myRoomId);
                } else {
                  // Detective checked but it's not mafia - advance to next phase immediately
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

  // Leaderboard endpoint
  app.get("/api/leaderboard", async (_req, res) => {
    try {
      const entries = await storage.getLeaderboard();
      res.json(entries);
    } catch (e) {
      console.error("Leaderboard error", e);
      res.status(500).json({ error: "Failed to load leaderboard" });
    }
  });

  return httpServer;
}

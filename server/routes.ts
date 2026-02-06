import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { WS_EVENTS, type GameState, type GameAction } from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";

// Game Logic Helpers
function assignRoles(players: any[], settings: any) {
  const roles: string[] = [];
  for (let i = 0; i < settings.mafiaCount; i++) roles.push("mafia");
  for (let i = 0; i < settings.detectiveCount; i++) roles.push("detective");
  for (let i = 0; i < settings.doctorCount; i++) roles.push("doctor");
  while (roles.length < players.length) roles.push("civilian"); // Fill rest with civilian

  // Shuffle roles
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  return players.map((p, i) => ({ ...p, role: roles[i] }));
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

function getRandomDeathStory(name: string) {
  const story = DEATH_STORIES[Math.floor(Math.random() * DEATH_STORIES.length)];
  return story.replace("{name}", name);
}

// Map roomId -> Timer
const phaseTimers = new Map<number, NodeJS.Timeout>();

const PHASE_DURATION = 15000; // 15 seconds per phase for automation

const BOT_NAMES = ["Bot_Alpha", "Bot_Beta", "Bot_Gamma", "Bot_Delta", "Bot_Epsilon", "Bot_Zeta", "Bot_Eta", "Bot_Theta"];

async function fillWithBots(roomId: number, storage: any) {
  const players = await storage.getPlayersInRoom(roomId);
  if (players.length >= 6) return;

  const botsNeeded = 6 - players.length;
  for (let i = 0; i < botsNeeded; i++) {
    await storage.createPlayer({
      roomId,
      name: BOT_NAMES[i % BOT_NAMES.length] + "_" + Math.floor(Math.random() * 1000),
      role: null,
      isAlive: true,
      isHost: false,
      sessionId: "bot-" + randomUUID(),
      isSpectator: false,
      isBot: true
    });
  }
}

async function handleBotActions(roomId: number, wss: WebSocketServer, storage: any, roomClients: Map<number, Set<string>>, clients: Map<string, WebSocket>, gameActions: Map<number, any>) {
  const room = await storage.getRoom(roomId);
  if (!room || room.status === 'lobby' || room.status === 'ended') return;

  const players = await storage.getPlayersInRoom(roomId);
  const bots = players.filter(p => p.isBot && p.isAlive);
  const actions = gameActions.get(roomId) || { votes: new Map(), mafiaKill: null, doctorSave: null, detectiveCheck: null };

  for (const bot of bots) {
    const alivePlayers = players.filter(p => p.isAlive && p.id !== bot.id);
    if (alivePlayers.length === 0) continue;
    const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

    if (room.phase === 'voting') {
      actions.votes.set(bot.id, target.id);
    } else if (room.phase === 'mafia' && bot.role === 'mafia') {
      actions.mafiaKill = target.id;
    } else if (room.phase === 'doctor' && bot.role === 'doctor') {
      actions.doctorSave = target.id;
    } else if (room.phase === 'detective' && bot.role === 'detective') {
      // Bot detective check - usually internal or we could simulate a chat message
    }

    // Occasional bot chat
    if (Math.random() > 0.8) {
      const messages = ["I think it's one of you...", "I'm innocent!", "Trust me.", "Who is the mafia?", "Found anything?"];
      await storage.createMessage({
        roomId,
        playerId: bot.id,
        playerName: bot.name,
        content: messages[Math.floor(Math.random() * messages.length)]
      });
    }
  }
  gameActions.set(roomId, actions);
}

  async function advancePhase(roomId: number, wss: WebSocketServer, storage: any, roomClients: Map<number, Set<string>>, clients: Map<string, WebSocket>, gameActions: Map<number, any>) {
    await handleBotActions(roomId, wss, storage, roomClients, clients, gameActions);
    const room = await storage.getRoom(roomId);
    if (!room) return;

    const players = await storage.getPlayersInRoom(roomId);
    const messages = await storage.getMessagesByRoom(roomId);
    const actions = gameActions.get(roomId) || { votes: new Map(), mafiaKill: null, doctorSave: null, detectiveCheck: null };

  if (room.status === 'day') {
    if (room.phase === 'discussion') {
      await storage.updateRoom(roomId, { phase: 'voting' });
    } else if (room.phase === 'voting') {
      // Resolve voting
      const voteCounts = new Map<number, number>();
      actions.votes.forEach((targetId) => {
        voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
      });

      let topTargetId = -1;
      let maxVotes = 0;
      voteCounts.forEach((count, id) => {
        if (count > maxVotes) {
          maxVotes = count;
          topTargetId = id;
        }
      });

      if (topTargetId !== -1) {
        const victim = players.find(p => p.id === topTargetId);
        if (victim) {
          await storage.updatePlayer(topTargetId, { isAlive: false });
          
          await storage.createMessage({
            roomId,
            playerId: 0,
            playerName: "System",
            content: `${victim.name} was voted out. They were the ${victim.role}.`
          });
        }
      }

      await storage.updateRoom(roomId, { status: 'night', phase: 'mafia' });
      actions.mafiaKill = null;
      actions.doctorSave = null;
    }
  } else if (room.status === 'night') {
    if (room.phase === 'mafia') {
      await storage.updateRoom(roomId, { phase: 'doctor' });
    } else if (room.phase === 'doctor') {
      await storage.updateRoom(roomId, { phase: 'detective' });
    } else if (room.phase === 'detective') {
      // Resolve night
      let nightSummary = "The night has ended. ";
      if (actions.mafiaKill) {
        const victim = players.find(p => p.id === actions.mafiaKill);
        if (victim) {
          if (actions.mafiaKill === actions.doctorSave) {
            nightSummary += "The mafia tried to kill someone, but the doctor saved them!";
          } else {
            const story = getRandomDeathStory(victim.name);
            await storage.updatePlayer(actions.mafiaKill, { isAlive: false });
            nightSummary += `${victim.name} was killed. They were the ${victim.role}. ${story}`;
          }
        }
      } else {
        nightSummary += "Nothing happened during the night.";
      }

      await storage.createMessage({
        roomId,
        playerId: 0,
        playerName: "System",
        content: nightSummary
      });

      await storage.updateRoom(roomId, { status: 'day', phase: 'discussion', turn: (room.turn || 0) + 1 });
      actions.votes.clear();
    }
  }

  gameActions.set(roomId, actions);
  
      // Re-fetch room to check if game ended
      const updatedPlayers = await storage.getPlayersInRoom(roomId);
      const aliveMafia = updatedPlayers.filter(p => p.role === 'mafia' && p.isAlive).length;
      const aliveCivilians = updatedPlayers.filter(p => p.role !== 'mafia' && p.isAlive).length;

      if (aliveMafia === 0 || aliveMafia >= aliveCivilians) {
        await storage.updateRoom(roomId, { status: 'ended' });
        if (phaseTimers.has(roomId)) {
          clearTimeout(phaseTimers.get(roomId));
          phaseTimers.delete(roomId);
        }
      } else {
        // Schedule next phase with customizable duration
        let duration = (room.settings as any).phaseDuration * 1000 || PHASE_DURATION;
        
        if (room.status === 'night') {
          if (room.phase === 'mafia') duration = (room.settings as any).mafiaDuration * 1000 || 15000;
          if (room.phase === 'doctor') duration = (room.settings as any).doctorDuration * 1000 || 15000;
          if (room.phase === 'detective') duration = (room.settings as any).detectiveDuration * 1000 || 15000;
        }

        const timer = setTimeout(() => advancePhase(roomId, wss, storage, roomClients, clients, gameActions), duration);
        phaseTimers.set(roomId, timer);
      }

  // Broadcast
  const sessions = roomClients.get(roomId);
  sessions?.forEach(sessionId => {
    const ws = clients.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const me = updatedPlayers.find(p => p.sessionId === sessionId);
      const sanitizedPlayers = updatedPlayers.map(p => {
        const roomStatus = room.status; // use latest status
        if (roomStatus === 'ended' || !p.isAlive) return p;
        if (me?.id === p.id) return p;
        if (me?.role === 'mafia' && p.role === 'mafia' && !me.isHost) return p;
        return { ...p, role: 'unknown' };
      });

      ws.send(JSON.stringify({
        type: WS_EVENTS.STATE_UPDATE,
        payload: { room, players: sanitizedPlayers, me, messages }
      }));
    }
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // REST API for Room Management
  app.post(api.rooms.create.path, async (req, res) => {
    try {
      console.log("Creating room with settings:", JSON.stringify(req.body));
      const input = api.rooms.create.input.parse(req.body);
      const room = await storage.createRoom({
        ...input.settings,
        phaseDuration: input.settings.phaseDuration ?? 30
      });
      
      if (!room) {
        throw new Error("Failed to create room in storage (storage returned null)");
      }
      
      console.log("Room created successfully:", room.id, room.code);
      
      const sessionId = randomUUID();
      const player = await storage.createPlayer({
        roomId: room.id,
        name: "Host",
        role: null,
        isAlive: true,
        isHost: true,
        sessionId,
        isSpectator: false,
        isBot: false
      });

      if (!player) {
        throw new Error("Failed to create host player in storage (storage returned null)");
      }

      console.log("Host player created successfully:", player.id);

      res.status(201).json({ 
        code: room.code, 
        playerId: player.id, 
        sessionId 
      });

      // Fill with bots if needed - Only up to 6 players total
      setTimeout(async () => {
        const playersInRoom = await storage.getPlayersInRoom(room.id);
        if (playersInRoom.length < 6) {
          await fillWithBots(room.id, storage);
          broadcastState(room.id);
        }
      }, 1000);
    } catch (err: any) {
      console.error("CRITICAL CREATE ROOM ERROR:", err);
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.rooms.join.path, async (req, res) => {
    try {
      const input = api.rooms.join.input.parse(req.body);
      const room = await storage.getRoomByCode(input.code);
      
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      if (room.status !== "lobby") {
         // Allow reconnect?
         // For now, strict lobby join only unless reconnecting logic is robust
      }

      const players = await storage.getPlayersInRoom(room.id);
      const isHost = players.length === 0;
      const sessionId = randomUUID();

      // If game is in progress, join as spectator
      const isSpectator = room.status !== "lobby";

      const player = await storage.createPlayer({
        roomId: room.id,
        name: input.name,
        role: null,
        isAlive: !isSpectator,
        isHost,
        sessionId,
        isSpectator,
        isBot: false
      });

      res.json({
        code: room.code,
        playerId: player.id,
        sessionId
      });

      // After a real player joins, check if we need to remove or add bots
      setTimeout(async () => {
        const playersInRoom = await storage.getPlayersInRoom(room.id);
        const bots = playersInRoom.filter(p => p.isBot);
        
        // If more than 6 players and we have bots, remove one to make space
        if (playersInRoom.length > 6 && bots.length > 0) {
          await storage.deletePlayer(bots[0].id);
        } 
        // If less than 6 players, fill with bots
        else if (playersInRoom.length < 6) {
          await fillWithBots(room.id, storage);
        }
        broadcastState(room.id);
      }, 1000);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // WebSocket Server for Game State
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Map sessionId -> WebSocket
  const clients = new Map<string, WebSocket>();
  // Map roomId -> Set<sessionId>
  const roomClients = new Map<number, Set<string>>();

  // Simple in-memory game state for actions (votes, etc)
  // key: roomId
  const gameActions = new Map<number, {
    votes: Map<number, number>, // voterId -> targetId
    mafiaKill: number | null,
    doctorSave: number | null,
    detectiveCheck: number | null
  }>();

  function broadcastState(roomId: number) {
    const sessions = roomClients.get(roomId);
    if (!sessions) return;

    storage.getRoom(roomId).then(async (room) => {
      if (!room) return;
      const players = await storage.getPlayersInRoom(roomId);
      const messages = await storage.getMessagesByRoom(roomId);
      
      const gameStateBase = {
        room,
        players: players.map(p => ({
          ...p,
          role: room.status === 'lobby' ? null : (p.isAlive ? p.role : p.role)
        })),
        messages
      };

      sessions.forEach(sessionId => {
        const ws = clients.get(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          const me = players.find(p => p.sessionId === sessionId);
          
          // Secure filtering
          const sanitizedPlayers = players.map(p => {
             if (room.status === 'lobby' || room.status === 'ended' || !p.isAlive) return p; 
             if (me?.id === p.id) return p; 
             if (me?.role === 'mafia' && p.role === 'mafia' && !me.isHost) return p; 
             if (me?.role === 'detective' && p.role === 'detective' && !me.isHost) return p;
             if (me?.role === 'doctor' && p.role === 'doctor' && !me.isHost) return p;
             if (!me?.isAlive && me?.role !== 'mafia') return p; // Dead non-mafia can see everyone's role (spectator mode)
             return { ...p, role: 'unknown' }; 
          });

          ws.send(JSON.stringify({
            type: WS_EVENTS.STATE_UPDATE,
            payload: { ...gameStateBase, players: sanitizedPlayers, me }
          }));
        }
      });
    });
  }

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
          
          // Verify session
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
          const player = await storage.getPlayer(
            (await storage.getPlayersInRoom(myRoomId)).find(p => p.sessionId === mySessionId)!.id
          );
          
          if (!player?.isHost) return;

          const room = await storage.getRoom(myRoomId);
          if (room?.status !== 'lobby') return;

          const allPlayers = await storage.getPlayersInRoom(myRoomId);
          if (allPlayers.length < 6) {
            ws.send(JSON.stringify({ type: WS_EVENTS.ERROR, payload: { message: "Minimum 6 players required to start the game." } }));
            return;
          }

          // Assign roles
          const updatedPlayers = assignRoles(allPlayers, room.settings);
          for (const p of updatedPlayers) {
            await storage.updatePlayer(p.id, { role: p.role });
          }

          await storage.updateRoom(myRoomId, { status: 'day', phase: 'discussion', turn: 1 });
          
          // Init actions
          gameActions.set(myRoomId, {
            votes: new Map(),
            mafiaKill: null,
            doctorSave: null,
            detectiveCheck: null
          });

          // Start automation
          const timer = setTimeout(() => advancePhase(myRoomId!, wss, storage, roomClients, clients, gameActions), PHASE_DURATION);
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
           if (!me.isAlive && room.status !== 'ended' && room.status !== 'lobby') {
             if (action.type !== 'chat') return;
           }

           const actions = gameActions.get(myRoomId) || { votes: new Map(), mafiaKill: null, doctorSave: null, detectiveCheck: null };

           if (action.type === 'chat') {
             await storage.createMessage({
               roomId: myRoomId,
               playerId: me.id,
               playerName: me.name,
               content: action.content
             });
             broadcastState(myRoomId);
             return;
           }

           if (action.type === 'add_bots' && me.isHost) {
             await fillWithBots(myRoomId, storage);
             broadcastState(myRoomId);
             return;
           }

           if (action.type === 'remove_bot' && me.isHost) {
             const bot = players.find(p => p.id === action.playerId && p.isBot);
             if (bot) {
               await storage.deletePlayer(bot.id);
               broadcastState(myRoomId);
             }
             return;
           }

           // Handle Phases
           if (room.phase === 'voting' && action.type === 'vote') {
             actions.votes.set(me.id, action.targetId);
             
             // Check if majority reached? Or wait for timer?
             // Let's implement manual "End Phase" or simple majority for now.
             // Simpler: Just store votes. Host can "Proceed" or timer.
             // Let's make it phase-based.
           }
           
           if (room.phase === 'mafia' && me.role === 'mafia' && action.type === 'kill') {
             actions.mafiaKill = action.targetId;
           }

           if (room.phase === 'doctor' && me.role === 'doctor' && action.type === 'heal') {
             actions.doctorSave = action.targetId;
           }

           // Check logic usually immediate return
           if (room.phase === 'detective' && me.role === 'detective' && action.type === 'check') {
             const target = players.find(p => p.id === action.targetId);
             if (target) {
                const isMafia = target.role === 'mafia';
                // Send private message to detective
                ws.send(JSON.stringify({
                  type: 'check_result',
                  payload: { isMafia, targetId: target.id }
                }));

                // If detective finds the LAST mafia, end the game early
                const aliveMafia = players.filter(p => p.role === 'mafia' && p.isAlive);
                if (isMafia && aliveMafia.length === 1) {
                  await storage.createMessage({
                    roomId: myRoomId,
                    playerId: 0,
                    playerName: "System",
                    content: `The detective ${me.name} caught the last mafia ${target.name}!`
                  });
                  await storage.updateRoom(myRoomId, { status: 'ended' });
                  if (phaseTimers.has(myRoomId)) {
                    clearTimeout(phaseTimers.get(myRoomId));
                    phaseTimers.delete(myRoomId);
                  }
                  broadcastState(myRoomId);
                }
             }
           }
           
           // HOST ONLY: Advance Phase
           if (action.type === 'skip' && me.isHost) {
              // Simple phase state machine
              if (room.status === 'day') {
                 // Calculate votes
                 // Logic to kill player
                 await storage.updateRoom(myRoomId, { status: 'night', phase: 'night' });
                 // Reset night actions
                 actions.mafiaKill = null;
                 actions.doctorSave = null;
                 actions.detectiveCheck = null;
              } else if (room.status === 'night') {
                 // Resolve night actions
                 if (actions.mafiaKill && actions.mafiaKill !== actions.doctorSave) {
                   const victim = players.find(p => p.id === actions.mafiaKill);
                   if (victim) {
                     const story = getRandomDeathStory(victim.name);
                     // We can broadcast this story as a system message or just update the player
                     await storage.updatePlayer(actions.mafiaKill, { isAlive: false });
                     // Logic to send the story to all clients
                     wss.clients.forEach(client => {
                       if (client.readyState === WebSocket.OPEN) {
                         client.send(JSON.stringify({
                           type: 'death_story',
                           payload: { story }
                         }));
                       }
                     });
                   }
                 }
                 await storage.updateRoom(myRoomId, { status: 'day', phase: 'voting', turn: (room.turn || 0) + 1 });
                 actions.votes.clear();
              }
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

  return httpServer;
}

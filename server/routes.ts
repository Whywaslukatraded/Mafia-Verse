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
  const roles = [];
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
  "{name} accidentally joined a high-stakes underground drag race with a golf cart."
];

function getRandomDeathStory(name: string) {
  const story = DEATH_STORIES[Math.floor(Math.random() * DEATH_STORIES.length)];
  return story.replace("{name}", name);
}

// Map roomId -> Timer
const phaseTimers = new Map<number, NodeJS.Timeout>();

const PHASE_DURATION = 15000; // 15 seconds per phase for automation

async function advancePhase(roomId: number, wss: WebSocketServer, storage: IStorage, roomClients: Map<number, Set<string>>, clients: Map<string, WebSocket>, gameActions: Map<number, any>) {
  const room = await storage.getRoom(roomId);
  if (!room) return;

  const players = await storage.getPlayersInRoom(roomId);
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

      if (topTargetId !== -1 && maxVotes > players.filter(p => p.isAlive).length / 2) {
        await storage.updatePlayer(topTargetId, { isAlive: false });
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
      if (actions.mafiaKill && actions.mafiaKill !== actions.doctorSave) {
        const victim = players.find(p => p.id === actions.mafiaKill);
        if (victim) {
          const story = getRandomDeathStory(victim.name);
          await storage.updatePlayer(actions.mafiaKill, { isAlive: false });
          
          const sessions = roomClients.get(roomId);
          sessions?.forEach(sid => {
            clients.get(sid)?.send(JSON.stringify({ type: 'death_story', payload: { story } }));
          });
        }
      }
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
    // Schedule next phase
    const timer = setTimeout(() => advancePhase(roomId, wss, storage, roomClients, clients, gameActions), PHASE_DURATION);
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
        if (me?.role === 'mafia' && p.role === 'mafia') return p;
        return { ...p, role: 'unknown' };
      });

      ws.send(JSON.stringify({
        type: WS_EVENTS.STATE_UPDATE,
        payload: { room, players: sanitizedPlayers, me }
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
      const input = api.rooms.create.input.parse(req.body);
      const room = await storage.createRoom(input.settings);
      // We don't create the player here, the client will immediately join
      // Actually, standard flow is create -> auto-join as host.
      // But let's keep it simple: Create returns code, then client calls Join.
      // Wait, to be host, we need to know who created it.
      // Let's assume the first person to join is the host.
      res.status(201).json({ code: room.code, playerId: 0, sessionId: "" }); // Placeholder, client should Join next
    } catch (err) {
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

      const player = await storage.createPlayer({
        roomId: room.id,
        name: input.name,
        role: null,
        isAlive: true,
        isHost,
        sessionId
      });

      res.json({
        code: room.code,
        playerId: player.id,
        sessionId
      });
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
      
      const gameStateBase = {
        room,
        players: players.map(p => ({
          ...p,
          role: room.status === 'lobby' ? null : (p.isAlive ? p.role : p.role) // Logic for hiding roles?
          // Actually, we should sanitize roles for clients.
          // For simplicity, we send full state but frontend hides it. 
          // SECURITY NOTE: In a real app, filtering should happen server-side per client.
        })),
      };

      sessions.forEach(sessionId => {
        const ws = clients.get(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          const me = players.find(p => p.sessionId === sessionId);
          
          // Secure filtering
          const sanitizedPlayers = players.map(p => {
             if (room.status === 'lobby' || room.status === 'ended' || !p.isAlive) return p; // Show roles at end or if dead (maybe)
             if (me?.id === p.id) return p; // Show my role
             if (me?.role === 'mafia' && p.role === 'mafia') return p; // Mafia see each other
             return { ...p, role: 'unknown' }; // Hide others
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
          if (allPlayers.length < 3) return; // Min players

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
           
           if (!me || !room || !me.isAlive) return;

           const actions = gameActions.get(myRoomId) || { votes: new Map(), mafiaKill: null, doctorSave: null, detectiveCheck: null };

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
                // Send private message to detective
                ws.send(JSON.stringify({
                  type: 'check_result',
                  payload: { isMafia: target.role === 'mafia', targetId: target.id }
                }));
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

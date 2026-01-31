import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { GameState, GameAction, Player, CreateRoomRequest, JoinRoomRequest } from "@shared/schema";

const RECONNECT_DELAY = 1000;

export function useGameSocket(code: string | null, sessionId: string | null) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load initial state if we have a code
  const { data: initialData, refetch } = useQuery({
    queryKey: [api.rooms.get.path, code],
    queryFn: async () => {
      if (!code) return null;
      const url = buildUrl(api.rooms.get.path, { code });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch game state");
      return await res.json();
    },
    enabled: !!code,
  });

  // Sync REST data with local state initially
  useEffect(() => {
    if (initialData) {
      setGameState(initialData);
    }
  }, [initialData]);

  const connect = useCallback(() => {
    if (!code || !sessionId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      console.log("Connected to WS");
      ws.send(JSON.stringify({
        type: "join",
        payload: { code, sessionId }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
          case "notification": {
            const { title, body } = msg.payload;
            if (Notification.permission === "granted") {
              new Notification(title, { body });
            } else if (Notification.permission !== "denied") {
              Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                  new Notification(title, { body });
                }
              });
            }
            break;
          }
          case "state_update": {
            const newState = msg.payload as GameState;
            // Notify of phase changes or turns
            if (gameState && newState.room.phase !== gameState.room.phase) {
              const isMyTurn = 
                (newState.room.phase === "mafia" && newState.me?.role === "mafia") ||
                (newState.room.phase === "doctor" && newState.me?.role === "doctor") ||
                (newState.room.phase === "detective" && newState.me?.role === "detective") ||
                (newState.room.phase === "voting" && newState.me?.isAlive);

              if (isMyTurn && Notification.permission === "granted") {
                new Notification("Your Turn!", {
                  body: `The game is now in the ${newState.room.phase} phase.`,
                });
              }
            }
            setGameState(newState);
            break;
          }
          case "error":
            toast({
              title: "Error",
              description: msg.message,
              variant: "destructive",
            });
            break;
          default:
            console.log("Unknown message:", msg);
        }
      } catch (err) {
        console.error("Failed to parse WS message", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log("WS Disconnected");
      // Simple reconnect logic could go here
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [code, sessionId, toast]);

  useEffect(() => {
    if (code && sessionId) {
      const cleanup = connect();
      return cleanup;
    }
  }, [code, sessionId, connect]);

  const sendAction = (action: GameAction) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "action",
        payload: action
      }));
    } else {
      toast({
        title: "Connection Lost",
        description: "Trying to reconnect...",
        variant: "destructive",
      });
    }
  };

  const startGame = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "start_game" }));
    }
  };

  return { gameState, isConnected, sendAction, startGame };
}

export function useCreateRoom() {
  return useMutation({
    mutationFn: async (data: CreateRoomRequest) => {
      const res = await fetch(api.rooms.create.path, {
        method: api.rooms.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create room");
      }
      return api.rooms.create.responses[201].parse(await res.json());
    },
  });
}

export function useJoinRoom() {
  return useMutation({
    mutationFn: async (data: JoinRoomRequest) => {
      const res = await fetch(api.rooms.join.path, {
        method: api.rooms.join.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to join room");
      }
      return api.rooms.join.responses[200].parse(await res.json());
    },
  });
}

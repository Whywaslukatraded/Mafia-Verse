import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { GameState, GameAction, Player, CreateRoomRequest, JoinRoomRequest } from "@shared/schema";

const RECONNECT_DELAY = 1000;

async function safeErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.message === "string") return parsed.message;
    } catch { /* not JSON */ }
    return text || `Error ${res.status}`;
  } catch {
    return "Something went wrong";
  }
}

export function useGameSocket(code: string | null, sessionId: string | null) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reconnectKey, setReconnectKey] = useState(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeWsRef = useRef<WebSocket | null>(null);

  // Load initial state if we have a code
  const { data: initialData, refetch } = useQuery({
    queryKey: [api.rooms.get.path, code],
    queryFn: async () => {
      if (!code) return null;
      const url = api.rooms.get.path.replace(":code", code);
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
    activeWsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log("[WS] Connected");
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
          case "state_update":
            setGameState(msg.payload);
            break;
          case "check_result":
            toast({
              title: msg.payload.isMafia ? "Mafia Found!" : "Innocent",
              description: msg.payload.isMafia 
                ? "The target is a member of the Mafia!" 
                : "The target is a regular civilian.",
            });
            break;
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
      setSocket(null);
      console.log("[WS] Disconnected — will retry in 1s");
      // Auto-reconnect with exponential backoff (up to 8s)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        setReconnectKey(k => k + 1);
      }, RECONNECT_DELAY);
    };

    ws.onerror = (err) => {
      console.error("[WS] Error", err);
    };

    setSocket(ws);

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      ws.close();
    };
  }, [code, sessionId, toast]);

  useEffect(() => {
    if (code && sessionId) {
      const cleanup = connect();
      return cleanup;
    }
  }, [code, sessionId, connect, reconnectKey]);

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
      // Get Supabase user ID if logged in
      const { getSupabase } = await import("@/lib/supabase");
      const supabase = getSupabase();
      const { data: session } = await supabase.auth.getSession();
      const supabaseUserId = session?.session?.user?.id;
      const payload = supabaseUserId ? { ...data, supabaseUserId } : data;
      const res = await fetch(api.rooms.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await safeErrorMessage(res);
        throw new Error(msg);
      }
      return (await res.json()) as { code: string; playerId: number; sessionId: string };
    },
  });
}

export function useJoinRoom() {
  return useMutation({
    mutationFn: async (data: JoinRoomRequest) => {
      // Get Supabase user ID if logged in
      const { getSupabase } = await import("@/lib/supabase");
      const supabase = getSupabase();
      const { data: session } = await supabase.auth.getSession();
      const supabaseUserId = session?.session?.user?.id;
      const payload = supabaseUserId ? { ...data, supabaseUserId } : data;
      const res = await fetch(api.rooms.join.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await safeErrorMessage(res);
        throw new Error(msg);
      }
      return (await res.json()) as { code: string; playerId: number; sessionId: string };
    },
  });
}

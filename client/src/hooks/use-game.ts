import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, buildUrl } from "@shared/routes";
import { getSupabase } from "@/lib/supabase";
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reconnectKey, setReconnectKey] = useState(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeWsRef = useRef<WebSocket | null>(null);

  // Load initial state if we have a code
  const { data: initialData, refetch } = useQuery({
    queryKey: [api.rooms.get.path, code],
    queryFn: async () => {
      if (!code) return null;
      // Security fix (#5): the server now redacts roles and private chat
      // based on who's asking, keyed on this sessionId (matching the
      // identity it already uses for the WebSocket join). Without it, the
      // server treats this as an outside observer and returns a fully
      // anonymized view.
      const url = buildUrl(api.rooms.get.path, { code }) + (sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "");
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
              description: msg.payload?.message || msg.message,
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
    } else if (action.type === "replay") {
      // Play Again failing here almost always just means the socket is
      // mid-reconnect (see the auto-reconnect logic above), not that the
      // connection is actually lost — the scary generic toast below is
      // the wrong message for this expected, short-lived case.
      toast({
        title: t("common.reconnectingTitle"),
        description: t("common.reconnectingPlayAgainDescription"),
      });
    } else {
      toast({
        title: t("common.connectionLostTitle"),
        description: t("common.connectionLostDescription"),
        variant: "destructive",
      });
    }
  };

  const startGame = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "start_game" }));
    }
  };

  // Feature: Pre-game ready-up lobby. Both just piggyback on the existing
  // `action` message envelope (like vote/chat/add_bots etc.) rather than
  // needing their own top-level WS message types.
  const toggleReady = () => sendAction({ type: "ready_toggle" });
  const startNow = () => sendAction({ type: "start_now" });

  return { gameState, isConnected, sendAction, startGame, toggleReady, startNow };
}

export function useCreateRoom() {
  return useMutation({
    mutationFn: async (data: CreateRoomRequest) => {
      // Security fix (#4): the server now derives supabaseUserId from a
      // verified bearer token instead of trusting it in the body — any
      // `supabaseUserId` field still in `data` is ignored server-side, but
      // we send the token here so signed-in users are still correctly
      // linked (guests with no session just get an anonymous player).
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const res = await fetch(api.rooms.create.path, {
        method: api.rooms.create.method,
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await safeErrorMessage(res);
        throw new Error(msg);
      }
      return api.rooms.create.responses[201].parse(await res.json());
    },
  });
}

export function useJoinRoom() {
  return useMutation({
    mutationFn: async (data: JoinRoomRequest) => {
      // Security fix (#4): same reasoning as useCreateRoom above.
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const res = await fetch(api.rooms.join.path, {
        method: api.rooms.join.method,
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await safeErrorMessage(res);
        throw new Error(msg);
      }
      return api.rooms.join.responses[200].parse(await res.json());
    },
  });
}

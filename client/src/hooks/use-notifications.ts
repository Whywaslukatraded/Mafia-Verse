import { useCallback, useEffect, useRef, useState } from "react";

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" ? Notification.permission : "default"
  );

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === "granted";
  }, []);

  const notify = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      const enabled = JSON.parse(localStorage.getItem("mafia_notifications_enabled") || "true");
      if (!enabled) return;
      if (permission !== "granted") return;
      if (document.visibilityState === "visible") return; // Don't notify when tab is active

      try {
        new Notification(title, {
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          ...options,
        });
      } catch {
        // Notification API might be blocked
      }
    },
    [permission]
  );

  // Auto-request on first toggle if not decided
  useEffect(() => {
    if (permission === "default") {
      const saved = localStorage.getItem("mafia_notifications_enabled");
      if (saved !== null && JSON.parse(saved) === true) {
        requestPermission();
      }
    }
  }, [permission, requestPermission]);

  return { permission, requestPermission, notify };
}

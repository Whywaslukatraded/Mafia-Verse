import { useEffect, useState } from "react";

// Feature: Colorblind-safe roles (toggle). Same localStorage-sync pattern
// Room.tsx already uses for mafia_sound_enabled — reads once on mount, then
// stays in sync if the flag changes elsewhere (e.g. flipped in Settings in
// another tab) via the 'storage' event, which Settings.tsx's applySound
// already dispatches manually for same-tab updates (native 'storage'
// events don't fire in the tab that made the change).
export function useColorblindMode(): boolean {
  const [enabled, setEnabled] = useState(() => {
    const saved = localStorage.getItem("mafia_colorblind_mode");
    return saved !== null ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    const sync = () => {
      const saved = localStorage.getItem("mafia_colorblind_mode");
      setEnabled(saved !== null ? JSON.parse(saved) : false);
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return enabled;
}

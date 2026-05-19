import { useEffect, useRef, useState, useCallback } from 'react';

interface GameAudioProps {
  phase: string;
  status: string;
}

// Vite handles these as URLs
import nightTheme from '../assets/sounds/night-theme.mp3';
import dayTheme from '../assets/sounds/day-theme.mp3';
import voteSound from '../assets/sounds/vote-sound.mp3';
import killSound from '../assets/sounds/kill-sound.mp3';

export function GameAudio({ phase, status }: GameAudioProps) {
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.7);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const prevPhaseRef = useRef<string>("");

  // Sync settings from localStorage
  useEffect(() => {
    const sync = () => {
      const savedEnabled = localStorage.getItem("mafia_sound_enabled");
      const savedVolume = localStorage.getItem("mafia_sound_volume");
      setSoundEnabled(savedEnabled !== null ? JSON.parse(savedEnabled) : true);
      setSoundVolume(savedVolume ? Number(savedVolume) / 100 : 0.7);
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // Unlock audio on first user interaction (required by browser autoplay policy)
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    setAudioUnlocked(true);
    window.removeEventListener("click", unlockAudio);
    window.removeEventListener("touchstart", unlockAudio);
  }, [audioUnlocked]);

  useEffect(() => {
    window.addEventListener("click", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, [unlockAudio]);

  // Initialize audio elements once
  useEffect(() => {
    if (!bgMusicRef.current) {
      bgMusicRef.current = new Audio();
      bgMusicRef.current.loop = true;
    }
    if (!sfxRef.current) {
      sfxRef.current = new Audio();
    }
  }, []);

  // Handle Background Music
  useEffect(() => {
    const music = bgMusicRef.current;
    if (!music) return;

    music.volume = soundVolume * 0.5;
    const shouldPlay = soundEnabled && audioUnlocked;

    let targetSrc = '';
    if (status === 'lobby' || status === 'ended') {
      targetSrc = dayTheme;
    } else if (status === 'night') {
      targetSrc = nightTheme;
    } else if (status === 'day') {
      targetSrc = dayTheme;
    }

    if (targetSrc) {
      const targetHref = new URL(targetSrc, window.location.origin).href;
      if (music.src !== targetHref) {
        // Src changed - load new track
        music.pause();
        music.src = targetSrc;
        if (shouldPlay) {
          music.play().catch(() => {});
        }
      } else {
        // Same src - just play/pause based on state
        if (shouldPlay && music.paused) {
          music.play().catch(() => {});
        } else if (!shouldPlay && !music.paused) {
          music.pause();
        }
      }
    } else {
      music.pause();
    }
  }, [status, soundEnabled, soundVolume, audioUnlocked]);

  // Handle Sound Effects on Phase transitions
  useEffect(() => {
    const sfx = sfxRef.current;
    if (!sfx || !soundEnabled || !audioUnlocked) return;

    sfx.volume = soundVolume;

    // Only play when phase changes TO these states
    if (phase === 'voting' && prevPhaseRef.current !== 'voting') {
      sfx.src = voteSound;
      sfx.currentTime = 0;
      sfx.play().catch(() => {});
    } else if (phase === 'mafia' && prevPhaseRef.current !== 'mafia') {
      sfx.src = killSound;
      sfx.currentTime = 0;
      sfx.play().catch(() => {});
    }

    prevPhaseRef.current = phase;
  }, [phase, soundEnabled, soundVolume, audioUnlocked]);

  return null;
}

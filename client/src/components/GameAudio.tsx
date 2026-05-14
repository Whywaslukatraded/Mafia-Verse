import { useEffect, useRef, useState, useCallback } from 'react';

interface GameAudioProps {
  phase: string;
  status: string;
}

// Importing assets directly (Vite handles this as URLs)
import nightTheme from '../assets/sounds/night-theme.mp3';
import dayTheme from '../assets/sounds/day-theme.mp3';
import voteSound from '../assets/sounds/vote-sound.mp3';
import killSound from '../assets/sounds/kill-sound.mp3';

export function GameAudio({ phase, status }: GameAudioProps) {
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.7);
  // AudioContext must be unlocked via user interaction per browser autoplay policy
  const [audioUnlocked, setAudioUnlocked] = useState(false);

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

  // Unlock audio on first user click anywhere
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    setAudioUnlocked(true);
    // Pre-load audio elements by playing them muted briefly
    if (bgMusicRef.current) {
      bgMusicRef.current.muted = true;
      bgMusicRef.current.play().catch(() => {});
      setTimeout(() => {
        if (bgMusicRef.current) bgMusicRef.current.muted = false;
      }, 100);
    }
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

  // Handle Background Music
  useEffect(() => {
    if (!bgMusicRef.current) {
      bgMusicRef.current = new Audio();
      bgMusicRef.current.loop = true;
    }

    const music = bgMusicRef.current;
    music.volume = soundVolume * 0.5;
    let targetSrc = '';

    if (status === 'lobby' || status === 'ended') {
      targetSrc = dayTheme;
    } else if (status === 'night') {
      targetSrc = nightTheme;
    } else if (status === 'day') {
      targetSrc = dayTheme;
    }

    if (targetSrc && music.src !== new URL(targetSrc, window.location.origin).href) {
      music.pause();
      music.src = targetSrc;
      if (soundEnabled && audioUnlocked) {
        music.play().catch(() => {});
      }
    } else if (!soundEnabled || !audioUnlocked) {
      music.pause();
    }

    return () => {
      music.pause();
    };
  }, [status, soundEnabled, soundVolume, audioUnlocked]);

  // Handle Sound Effects on Phase/Status changes
  useEffect(() => {
    if (!sfxRef.current) {
      sfxRef.current = new Audio();
    }

    const sfx = sfxRef.current;
    sfx.volume = soundVolume;
    if (!soundEnabled || !audioUnlocked) return;

    if (phase === 'voting') {
      sfx.src = voteSound;
      sfx.play().catch(() => {});
    } else if (status === 'night' && phase === 'mafia') {
      sfx.src = killSound;
      sfx.play().catch(() => {});
    }
  }, [phase, status, soundEnabled, soundVolume, audioUnlocked]);

  return null; // This component handles side effects only
}

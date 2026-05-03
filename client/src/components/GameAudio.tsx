import { useEffect, useRef, useState } from 'react';

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

  useEffect(() => {
    const sync = () => {
      setSoundEnabled(JSON.parse(localStorage.getItem("mafia_sound_enabled") || "true"));
      setSoundVolume(Number(localStorage.getItem("mafia_sound_volume") || "70") / 100);
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

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
      targetSrc = dayTheme; // Use day theme for lobby/end for now
    } else if (status === 'night') {
      targetSrc = nightTheme;
    } else if (status === 'day') {
      targetSrc = dayTheme;
    }

    if (targetSrc && music.src !== new URL(targetSrc, window.location.origin).href) {
      music.pause();
      music.src = targetSrc;
      if (soundEnabled) {
        music.play().catch(err => console.log("Audio play blocked by browser", err));
      }
    } else if (!soundEnabled) {
      music.pause();
    }

    return () => {
      music.pause();
    };
  }, [status, soundEnabled, soundVolume]);

  // Handle Sound Effects on Phase/Status changes
  useEffect(() => {
    if (!sfxRef.current) {
      sfxRef.current = new Audio();
    }

    const sfx = sfxRef.current;
    sfx.volume = soundVolume;
    if (!soundEnabled) return;
    
    if (phase === 'voting') {
      sfx.src = voteSound;
      sfx.play().catch(() => {});
    } else if (status === 'night' && phase === 'mafia') {
      sfx.src = killSound;
      sfx.play().catch(() => {});
    }
  }, [phase, status, soundEnabled, soundVolume]);

  return null; // This component handles side effects only
}

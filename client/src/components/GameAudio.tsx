import { useEffect, useRef, useState, useCallback } from 'react';

interface GameAudioProps {
  phase: string;
  status: string;
}

// Web Audio API synthesizer - no external files needed
class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  droneOsc: OscillatorNode | null = null;
  droneGain: GainNode | null = null;
  lfo: OscillatorNode | null = null;

  init() {
    if (this.ctx) return;
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    const masterGain = ctx.createGain();
    this.masterGain = masterGain;
    masterGain.connect(ctx.destination);
    masterGain.gain.value = 0.3;
  }

  setVolume(v: number) {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v)) * 0.3;
  }

  stopDrone() {
    if (this.droneOsc) {
      try { this.droneOsc.stop(); } catch {}
      this.droneOsc = null;
    }
    if (this.droneGain) {
      try { this.droneGain.disconnect(); } catch {}
      this.droneGain = null;
    }
    if (this.lfo) {
      try { this.lfo.stop(); } catch {}
      this.lfo = null;
    }
  }

  playDayDrone() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.stopDrone();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 110; // A2

    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 1;

    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 1.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    lfo.start();

    this.droneOsc = osc;
    this.droneGain = gain;
    this.lfo = lfo;
  }

  playNightDrone() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    this.stopDrone();

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.value = 55; // A1 - deep
    osc2.type = 'triangle';
    osc2.frequency.value = 58; // slight detune for unease

    filter.type = 'lowpass';
    filter.frequency.value = 250;
    filter.Q.value = 2;

    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 2);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc2.start();

    this.droneOsc = osc;
    this.droneGain = gain;
  }

  playVoteChime() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6

    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.12 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.6);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.7);
    });
  }

  playKillSting() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    // Low impact sound
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.6);

    // Dissonant upper tone for tension
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(200, now);
    osc2.frequency.exponentialRampToValueAtTime(100, now + 0.3);
    gain2.gain.value = 0;
    gain2.gain.linearRampToValueAtTime(0.08, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc2.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(now);
    osc2.stop(now + 0.5);
  }

  playEliminationSound() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    // Dramatic descending tones
    [440, 370, 311, 277].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, now + i * 0.25);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.25 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.25 + 0.5);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.25);
      osc.stop(now + i * 0.25 + 0.6);
    });
  }
}

const engine = new AudioEngine();

export function GameAudio({ phase, status }: GameAudioProps) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.7);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const prevStatusRef = useRef<string>("");
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

  // Unlock audio on first user interaction
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    engine.init();
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

  // Apply volume
  useEffect(() => {
    engine.setVolume(soundVolume);
  }, [soundVolume]);

  // Handle background music based on status changes
  useEffect(() => {
    if (!soundEnabled || !audioUnlocked) {
      engine.stopDrone();
      return;
    }

    // Only react to status changes, not every render
    if (status !== prevStatusRef.current) {
      prevStatusRef.current = status;

      if (status === 'night') {
        engine.playNightDrone();
      } else if (status === 'day' || status === 'lobby' || status === 'ended') {
        engine.playDayDrone();
      } else {
        engine.stopDrone();
      }
    }

    return () => {
      // Don't stop on unmount - let the next status change handle it
    };
  }, [status, soundEnabled, audioUnlocked]);

  // Handle sound effects on phase transitions
  useEffect(() => {
    if (!soundEnabled || !audioUnlocked) return;

    if (phase === 'voting' && prevPhaseRef.current !== 'voting') {
      engine.playVoteChime();
    } else if (phase === 'mafia' && prevPhaseRef.current !== 'mafia') {
      engine.playKillSting();
    } else if (phase === 'elimination' && prevPhaseRef.current !== 'elimination') {
      engine.playEliminationSound();
    }

    prevPhaseRef.current = phase;
  }, [phase, soundEnabled, audioUnlocked]);

  return null;
}

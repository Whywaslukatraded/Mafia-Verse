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

  init(): AudioContext | null {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;

    const ctx = this.ctx ?? new Ctx();
    this.ctx = ctx;
    if (!this.masterGain) {
      const masterGain = ctx.createGain();
      this.masterGain = masterGain;
      masterGain.connect(ctx.destination);
      masterGain.gain.value = 0.3;
    }
    return ctx;
  }

  resume(): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      try {
        ctx.resume();
        return true;
      } catch {
        return false;
      }
    }
    return ctx.state === 'running';
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
    osc.frequency.value = 110;

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
    osc.frequency.value = 55;
    osc2.type = 'triangle';
    osc2.frequency.value = 58;

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
    const notes = [523.25, 659.25, 783.99, 1046.5];

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

  playTestSound() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.5);
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

  // Unlock audio on first user interaction - must be synchronous!
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    engine.init();
    const ok = engine.resume();
    if (ok) {
      setAudioUnlocked(true);
      // Play a subtle unlock chime so the user knows it worked
      engine.playTestSound();
    }
    window.removeEventListener("click", unlockAudio, true);
    window.removeEventListener("touchstart", unlockAudio, true);
    window.removeEventListener("keydown", unlockAudio, true);
  }, [audioUnlocked]);

  useEffect(() => {
    // Add capture-phase listeners so we catch clicks before React handlers
    window.addEventListener("click", unlockAudio, true);
    window.addEventListener("touchstart", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);
    return () => {
      window.removeEventListener("click", unlockAudio, true);
      window.removeEventListener("touchstart", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
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

export { engine };

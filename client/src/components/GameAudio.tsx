import { useEffect, useRef, useState, useCallback } from 'react';

interface GameAudioProps {
  phase: string;
  status: string;
  // Feature: vote/night-action countdown tick. Optional and defaults to
  // undefined-safe below — existing callers that don't pass it (if any)
  // simply get no ticking, same as before this feature existed.
  timeRemaining?: number;
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

  // Feature: distinct per-phase cues, so someone listening (not just
  // watching) can tell discussion just started or which night role is
  // currently acting, instead of only hearing the generic day/night drone
  // shift plus the three original vote/mafia/elimination stings.

  // Discussion opening — a warm two-note "town bell" rather than a full
  // chime, since discussion is the longest/most frequent phase and a loud
  // cue every single time would get old fast.
  playDiscussionBell() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    [392, 523.25].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.15 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.9);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 1);
    });
  }

  // Detective — a quick rising "aha" interval, investigative rather than
  // threatening.
  playInvestigateChime() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(392, now);
    osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.25);
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.16, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  // Doctor — a soft, consonant major-third pad, gentle/reassuring.
  playHealChime() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    [349.23, 440].forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.12, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now);
      osc.stop(now + 1.2);
    });
  }

  // Bodyguard — a low, solid "thud" + short metallic ring, protective/armored.
  playShieldChime() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(140, now);
    thud.frequency.exponentialRampToValueAtTime(70, now + 0.2);
    thudGain.gain.value = 0;
    thudGain.gain.linearRampToValueAtTime(0.22, now + 0.02);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    thud.connect(thudGain);
    thudGain.connect(this.masterGain);
    thud.start(now);
    thud.stop(now + 0.4);

    const ring = this.ctx.createOscillator();
    const ringGain = this.ctx.createGain();
    ring.type = 'triangle';
    ring.frequency.value = 660;
    ringGain.gain.value = 0;
    ringGain.gain.setValueAtTime(0, now + 0.05);
    ringGain.gain.linearRampToValueAtTime(0.08, now + 0.08);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    ring.connect(ringGain);
    ringGain.connect(this.masterGain);
    ring.start(now + 0.05);
    ring.stop(now + 0.65);
  }

  // Vigilante — a tense, dissonant tick building anticipation (this is the
  // "you might use a bullet tonight" phase), deliberately unresolved rather
  // than a clean chime.
  playTensionPulse() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    [220, 233.08].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, now + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.07, now + i * 0.18 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.4);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.45);
    });
  }
  // Feature: countdown tick — a short, dry, unobtrusive click (not a full
  // chime like the phase-transition cues above) meant to be heard once per
  // second in the last few seconds of a timed phase, so it can't feel like
  // it's competing with those cues for attention. Pitch rises slightly as
  // secondsLeft counts down toward 0, a small extra urgency cue on top of
  // the rhythm itself.
  playCountdownTick(secondsLeft: number) {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    const pitch = secondsLeft <= 1 ? 1200 : secondsLeft <= 3 ? 1000 : 850;
    osc.frequency.value = pitch;
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }
}

const engine = new AudioEngine();

export function GameAudio({ phase, status, timeRemaining }: GameAudioProps) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.7);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const prevStatusRef = useRef<string>("");
  const prevPhaseRef = useRef<string>("");
  // Feature: countdown tick. Tracks the last whole-second value already
  // ticked for, so a re-render that doesn't actually cross a new second
  // boundary (timeRemaining is often reported with sub-second precision)
  // can't fire the same tick twice.
  const lastTickedSecondRef = useRef<number | null>(null);

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
    } else if (phase === 'discussion' && prevPhaseRef.current !== 'discussion') {
      engine.playDiscussionBell();
    } else if (phase === 'detective' && prevPhaseRef.current !== 'detective') {
      engine.playInvestigateChime();
    } else if (phase === 'doctor' && prevPhaseRef.current !== 'doctor') {
      engine.playHealChime();
    } else if (phase === 'bodyguard' && prevPhaseRef.current !== 'bodyguard') {
      engine.playShieldChime();
    } else if (phase === 'vigilante' && prevPhaseRef.current !== 'vigilante') {
      engine.playTensionPulse();
    }

    prevPhaseRef.current = phase;
  }, [phase, soundEnabled, audioUnlocked]);

  // Feature: countdown tick. Only during phases where someone might
  // actually need to act before time runs out — voting and the night-role
  // action phases — deliberately not discussion (its timer is much longer
  // and less consequential to miss) or lobby/ended (no countdown that
  // matters there). Resets lastTickedSecondRef whenever the phase changes
  // so a tick from the previous phase's final seconds can't leak into a
  // freshly-started phase that happens to also be at a low second count.
  const TICKABLE_PHASES = ["voting", "mafia", "doctor", "detective", "bodyguard", "vigilante"];
  useEffect(() => {
    lastTickedSecondRef.current = null;
  }, [phase]);
  useEffect(() => {
    if (!soundEnabled || !audioUnlocked) return;
    if (typeof timeRemaining !== "number") return;
    if (!TICKABLE_PHASES.includes(phase)) return;
    const secondsLeft = Math.ceil(timeRemaining);
    if (secondsLeft < 0 || secondsLeft > 5) return;
    if (lastTickedSecondRef.current === secondsLeft) return;
    lastTickedSecondRef.current = secondsLeft;
    if (secondsLeft > 0) engine.playCountdownTick(secondsLeft);
  }, [timeRemaining, phase, soundEnabled, audioUnlocked]);

  return null;
}

export { engine };

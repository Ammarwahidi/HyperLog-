// Soothing 100% offline Web Audio API breathwork soundscape & harmonic guide engine.
// Synthesizes calming ambient beds and smooth phase-synchronized inhale/hold/exhale harmonic swells.

export type BreathingTrackId =
  | 'tibetan_bowl'
  | 'ocean_breeze'
  | 'rain_pad'
  | 'forest_stream'
  | 'soft_chime';
export type BreathPhaseName = 'Inhale' | 'Hold' | 'Exhale';

export interface BreathingAudioTrackMeta {
  id: BreathingTrackId;
  name: string;
  subtitle: string;
  baseHz: number;
}

export const BREATHING_AUDIO_TRACKS: BreathingAudioTrackMeta[] = [
  {
    id: 'tibetan_bowl',
    name: 'Tibetan Singing Bowl',
    subtitle: 'Warm 432 Hz harmonic resonance with gentle breath swells',
    baseHz: 216,
  },
  {
    id: 'ocean_breeze',
    name: 'Ocean Tide Breeze',
    subtitle: 'Filtered surf wash rising on inhale and receding on exhale',
    baseHz: 196,
  },
  {
    id: 'rain_pad',
    name: 'Evening Rain & Solfeggio Pad',
    subtitle: 'Soft rainfall texture over calming 528 Hz warm chord',
    baseHz: 264,
  },
  {
    id: 'forest_stream',
    name: 'Forest Stream & Warm Pad',
    subtitle: 'Gentle flowing brook over a peaceful 396 Hz grounding drone',
    baseHz: 198,
  },
  {
    id: 'soft_chime',
    name: 'Minimalist Breath Bell',
    subtitle: 'Pure crystalline phase chimes with quiet space between',
    baseHz: 256,
  },
];

class BreathingSoundscapeController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private padOsc1: OscillatorNode | null = null;
  private padOsc2: OscillatorNode | null = null;
  private padOsc3: OscillatorNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;

  private activeTrack: BreathingTrackId = 'tibetan_bowl';
  private volume = 0.65;
  private voiceCueEnabled = false;
  private running = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private createPinkNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  public setVolume(nextVolume: number): void {
    this.volume = Math.max(0, Math.min(1, nextVolume));
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.volume * 0.42, now, 0.08);
    }
  }

  public setVoiceCueEnabled(enabled: boolean): void {
    this.voiceCueEnabled = enabled;
    if (!enabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore browser speech synthesis cancellation issues
      }
    }
  }

  public setTrack(track: BreathingTrackId): void {
    const wasRunning = this.running;
    this.activeTrack = track;
    if (wasRunning) {
      this.stop(false);
      this.start(track, this.volume, this.voiceCueEnabled);
    }
  }

  public start(
    track: BreathingTrackId = this.activeTrack,
    volume: number = this.volume,
    voiceCueEnabled: boolean = this.voiceCueEnabled
  ): void {
    this.activeTrack = track;
    this.volume = Math.max(0, Math.min(1, volume));
    this.voiceCueEnabled = voiceCueEnabled;

    const ctx = this.ensureContext();
    if (!ctx) return;

    this.stopNodesOnly();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(Math.max(0.001, this.volume * 0.42), now + 0.8);
    master.connect(ctx.destination);
    this.masterGain = master;

    const meta = BREATHING_AUDIO_TRACKS.find((t) => t.id === track) || BREATHING_AUDIO_TRACKS[0];
    const baseHz = meta.baseHz;

    // Harmonic warm pad (used subtly in all modes except minimalist soft_chime where it stays whisper-soft)
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(track === 'soft_chime' ? 360 : 620, now);
    padFilter.Q.setValueAtTime(0.7, now);

    const padGain = ctx.createGain();
    const initialPadLevel =
      track === 'tibetan_bowl'
        ? 0.28
        : track === 'rain_pad'
          ? 0.22
          : track === 'forest_stream'
            ? 0.2
            : track === 'ocean_breeze'
              ? 0.12
              : 0.04;
    padGain.gain.setValueAtTime(initialPadLevel, now);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();

    osc1.type = 'sine';
    osc2.type = track === 'tibetan_bowl' ? 'sine' : 'triangle';
    osc3.type = 'sine';

    osc1.frequency.setValueAtTime(baseHz, now);
    osc2.frequency.setValueAtTime(baseHz * 1.498, now); // Pure fifth
    osc3.frequency.setValueAtTime(baseHz * 2.002, now); // Shimmering octave

    osc1.connect(padFilter);
    osc2.connect(padFilter);
    osc3.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(master);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    this.padOsc1 = osc1;
    this.padOsc2 = osc2;
    this.padOsc3 = osc3;
    this.padFilter = padFilter;
    this.padGain = padGain;

    // Filtered pink noise texture for Ocean Tide Breeze, Evening Rain & Forest Stream
    if (track === 'ocean_breeze' || track === 'rain_pad' || track === 'forest_stream') {
      const noiseBuf = this.createPinkNoiseBuffer(ctx, 5);
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = track === 'ocean_breeze' || track === 'forest_stream' ? 'bandpass' : 'lowpass';
      noiseFilter.frequency.setValueAtTime(
        track === 'ocean_breeze' ? 380 : track === 'forest_stream' ? 680 : 1250,
        now
      );
      noiseFilter.Q.setValueAtTime(track === 'ocean_breeze' ? 0.9 : 0.65, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(
        track === 'ocean_breeze' ? 0.26 : track === 'forest_stream' ? 0.18 : 0.22,
        now
      );

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(master);
      noiseSrc.start(now);

      this.noiseSource = noiseSrc;
      this.noiseFilter = noiseFilter;
      this.noiseGain = noiseGain;
    }

    this.running = true;
  }

  /**
   * Synchronizes harmonic pitch, filter warmth, and gentle bell cue with each breath phase.
   */
  public triggerPhaseTransition(phase: BreathPhaseName, durationSec: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.running) {
      this.start(this.activeTrack, this.volume, this.voiceCueEnabled);
    }

    const now = ctx.currentTime;
    const dur = Math.max(1, durationSec);
    const meta =
      BREATHING_AUDIO_TRACKS.find((t) => t.id === this.activeTrack) || BREATHING_AUDIO_TRACKS[0];
    const baseHz = meta.baseHz;

    // 1. Play soft phase bell / singing bowl strike
    this.playGentleBell(ctx, phase, baseHz);

    // 2. Modulate continuous pad & surf/rain filter smoothly across the phase duration
    if (this.padOsc1 && this.padOsc2 && this.padFilter && this.padGain) {
      this.padOsc1.frequency.cancelScheduledValues(now);
      this.padOsc2.frequency.cancelScheduledValues(now);
      this.padFilter.frequency.cancelScheduledValues(now);
      this.padGain.gain.cancelScheduledValues(now);

      const curF1 = this.padOsc1.frequency.value || baseHz;
      const curF2 = this.padOsc2.frequency.value || baseHz * 1.5;
      const curCutoff = this.padFilter.frequency.value || 560;
      const curGain = this.padGain.gain.value || 0.16;

      this.padOsc1.frequency.setValueAtTime(curF1, now);
      this.padOsc2.frequency.setValueAtTime(curF2, now);
      this.padFilter.frequency.setValueAtTime(curCutoff, now);
      this.padGain.gain.setValueAtTime(curGain, now);

      if (phase === 'Inhale') {
        // Uplifting, expanding harmonic swell as lungs fill
        this.padOsc1.frequency.linearRampToValueAtTime(baseHz * 1.122, now + dur * 0.92); // Major second lift
        this.padOsc2.frequency.linearRampToValueAtTime(baseHz * 1.682, now + dur * 0.92);
        this.padFilter.frequency.exponentialRampToValueAtTime(1150, now + dur * 0.92);
        const peakGain = this.activeTrack === 'soft_chime' ? 0.07 : 0.34;
        this.padGain.gain.linearRampToValueAtTime(peakGain, now + dur * 0.9);
      } else if (phase === 'Hold') {
        // Calm, suspended stillness
        this.padFilter.frequency.linearRampToValueAtTime(860, now + dur * 0.9);
        const holdGain = this.activeTrack === 'soft_chime' ? 0.05 : 0.24;
        this.padGain.gain.linearRampToValueAtTime(holdGain, now + dur * 0.9);
      } else {
        // Grounding parasympathetic release back to fundamental root
        this.padOsc1.frequency.linearRampToValueAtTime(baseHz, now + dur * 0.95);
        this.padOsc2.frequency.linearRampToValueAtTime(baseHz * 1.498, now + dur * 0.95);
        this.padFilter.frequency.exponentialRampToValueAtTime(420, now + dur * 0.95);
        const floorGain = this.activeTrack === 'soft_chime' ? 0.03 : 0.15;
        this.padGain.gain.linearRampToValueAtTime(floorGain, now + dur * 0.95);
      }
    }

    if (this.noiseFilter && this.noiseGain) {
      this.noiseFilter.frequency.cancelScheduledValues(now);
      this.noiseGain.gain.cancelScheduledValues(now);
      this.noiseFilter.frequency.setValueAtTime(this.noiseFilter.frequency.value, now);
      this.noiseGain.gain.setValueAtTime(this.noiseGain.gain.value, now);

      if (phase === 'Inhale') {
        const peakFreq = this.activeTrack === 'ocean_breeze' ? 780 : 1650;
        this.noiseFilter.frequency.exponentialRampToValueAtTime(peakFreq, now + dur * 0.9);
        this.noiseGain.gain.linearRampToValueAtTime(0.34, now + dur * 0.9);
      } else if (phase === 'Hold') {
        const holdFreq = this.activeTrack === 'ocean_breeze' ? 520 : 1280;
        this.noiseFilter.frequency.exponentialRampToValueAtTime(holdFreq, now + dur * 0.9);
        this.noiseGain.gain.linearRampToValueAtTime(0.22, now + dur * 0.9);
      } else {
        const calmFreq = this.activeTrack === 'ocean_breeze' ? 250 : 920;
        this.noiseFilter.frequency.exponentialRampToValueAtTime(calmFreq, now + dur * 0.95);
        this.noiseGain.gain.linearRampToValueAtTime(0.14, now + dur * 0.95);
      }
    }

    // 3. Optional soft spoken cue
    if (this.voiceCueEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const phrase =
          phase === 'Inhale'
            ? 'Breathe in slowly'
            : phase === 'Hold'
              ? 'Hold gently'
              : 'Breathe out slowly';
        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.rate = 0.84;
        utterance.pitch = 0.95;
        utterance.volume = Math.max(0.15, Math.min(0.85, this.volume * 0.8));
        window.speechSynthesis.speak(utterance);
      } catch {
        // Ignore speech synthesis errors on restricted browsers
      }
    }
  }

  private playGentleBell(ctx: AudioContext, phase: BreathPhaseName, baseHz: number): void {
    if (!this.masterGain) return;
    const now = ctx.currentTime;
    const bellOsc = ctx.createOscillator();
    const overtoneOsc = ctx.createOscillator();
    const bellGain = ctx.createGain();

    const bellFreq =
      phase === 'Inhale'
        ? baseHz * 2 // Octave chime
        : phase === 'Hold'
          ? baseHz * 2.5 // Gentle major third overtone
          : baseHz * 1.5; // Warm grounding fifth on exhale

    bellOsc.type = 'sine';
    overtoneOsc.type = 'sine';
    bellOsc.frequency.setValueAtTime(bellFreq, now);
    overtoneOsc.frequency.setValueAtTime(bellFreq * 2.0, now);

    bellGain.gain.setValueAtTime(0.0001, now);
    bellGain.gain.exponentialRampToValueAtTime(0.22, now + 0.06);
    bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0.06, now);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    bellOsc.connect(bellGain);
    overtoneOsc.connect(overtoneGain);
    overtoneGain.connect(bellGain);
    bellGain.connect(this.masterGain);

    bellOsc.start(now);
    overtoneOsc.start(now);
    bellOsc.stop(now + 2.2);
    overtoneOsc.stop(now + 1.3);
  }

  private stopNodesOnly(): void {
    const oscList = [this.padOsc1, this.padOsc2, this.padOsc3];
    for (const osc of oscList) {
      if (osc) {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // Ignore already stopped oscillators
        }
      }
    }
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
        this.noiseSource.disconnect();
      } catch {
        // Ignore
      }
    }
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // Ignore
      }
    }
    this.padOsc1 = null;
    this.padOsc2 = null;
    this.padOsc3 = null;
    this.padFilter = null;
    this.padGain = null;
    this.noiseSource = null;
    this.noiseFilter = null;
    this.noiseGain = null;
    this.masterGain = null;
  }

  public stop(cancelSpeech = true): void {
    this.running = false;
    this.stopNodesOnly();
    if (cancelSpeech && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }
}

export const breathingAudio = new BreathingSoundscapeController();

/**
 * Plays a cheerful, warm C-major ascending celebration chime using the Web Audio API
 * when the user opens or celebrates on the Workout Complete page.
 */
export function playWorkoutCelebrationFanfare(enabled = true): void {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const notesHz = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const startBase = ctx.currentTime + 0.04;

    notesHz.forEach((hz, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === notesHz.length - 1 ? 'triangle' : 'sine';
      const noteStart = startBase + idx * 0.11;
      const noteDur = idx === notesHz.length - 1 ? 0.65 : 0.28;

      osc.frequency.setValueAtTime(hz, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.14, noteStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(noteStart);
      osc.stop(noteStart + noteDur + 0.04);
    });

    window.setTimeout(() => {
      try {
        void ctx.close();
      } catch {
        // Ignore close error
      }
    }, 1500);
  } catch {
    // Ignore restricted audio environments gracefully
  }
}


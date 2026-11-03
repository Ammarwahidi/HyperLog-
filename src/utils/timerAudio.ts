// Shared Web Audio synthesizer for crisp, low-latency timer feedback tones.
// Works 100% offline with zero external audio files.

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Plays a crisp, short ascending confirmation tone when a timer is set, started, or adjusted.
 */
export function playTimerSetTone(enabled: boolean = true): boolean {
  if (!enabled) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    const now = ctx.currentTime;
    const notes = [
      { freq: 659.25, start: 0, dur: 0.065, peak: 0.085 },
      { freq: 880.0, start: 0.06, dur: 0.085, peak: 0.1 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.freq, now + n.start);
      gain.gain.setValueAtTime(0.0001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(n.peak, now + n.start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.01);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Plays a gentle single-pulse cadence cue when an interval or pose transitions to the next step.
 */
export function playTimerStepTone(enabled: boolean = true): boolean {
  if (!enabled) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
    return true;
  } catch {
    return false;
  }
}

/**
 * Plays a clear three-note harmonic chime when a countdown timer finishes (reaches 00:00).
 */
export function playTimerCompleteTone(enabled: boolean = true): boolean {
  if (!enabled) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    const now = ctx.currentTime;
    const freqs = [587.33, 880.0, 1174.66];
    freqs.forEach((freq, idx) => {
      const startOffset = idx * 0.13;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.13, now + startOffset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + 0.24);
    });
    return true;
  } catch {
    return false;
  }
}

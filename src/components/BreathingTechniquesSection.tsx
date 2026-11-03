import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Check,
  HeartHandshake,
  Music,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import {
  BREATHING_AUDIO_TRACKS,
  breathingAudio,
  BreathPhaseName,
  BreathingTrackId,
} from '../utils/breathingAudio';
import { playTimerCompleteTone, playTimerSetTone } from '../utils/timerAudio';
import { ExpandableInfoDropdown } from './ExpandableInfoDropdown';

export interface BreathingTechniquesSectionProps {
  todayBreathworkMinutes: number;
  currentStressLevel: 1 | 2 | 3 | 4 | 5;
  soundEnabledByDefault?: boolean;
  onCompleteBreathworkMinutes: (minutesAdded: number, nextStressLevel?: 1 | 2 | 3 | 4 | 5) => Promise<void>;
}

interface GuidedBreathExercise {
  id: 'belly_balloon' | 'box' | '478' | 'coherent' | 'pranayama';
  shortTitle: string;
  friendlyTagline: string;
  bestFor: string;
  phases: Array<{
    prompt: string;
    helperText: string;
    seconds: number;
    phaseType: BreathPhaseName;
  }>;
}

const GUIDED_BREATH_EXERCISES: GuidedBreathExercise[] = [
  {
    id: 'belly_balloon',
    shortTitle: 'Calm Belly Balloon (3-1-4)',
    friendlyTagline: 'Super gentle & easy for all ages',
    bestFor: 'Everyday worry & quick calm',
    phases: [
      {
        prompt: 'Breathe In Slowly',
        helperText: 'Fill your belly softly like a warm balloon through your nose',
        seconds: 3,
        phaseType: 'Inhale',
      },
      {
        prompt: 'Pause Gently',
        helperText: 'Keep shoulders soft and relaxed',
        seconds: 1,
        phaseType: 'Hold',
      },
      {
        prompt: 'Breathe Out Slowly',
        helperText: 'Let all the air float out gently like a feather',
        seconds: 4,
        phaseType: 'Exhale',
      },
    ],
  },
  {
    id: 'box',
    shortTitle: 'Box Breathing (4-4-4-4)',
    friendlyTagline: 'Steady 4-count rhythm for focus',
    bestFor: 'Clearing a busy mind',
    phases: [
      {
        prompt: 'Breathe In',
        helperText: 'Slow, steady breath in through your nose',
        seconds: 4,
        phaseType: 'Inhale',
      },
      {
        prompt: 'Hold Gently',
        helperText: 'Rest calmly with full lungs',
        seconds: 4,
        phaseType: 'Hold',
      },
      {
        prompt: 'Breathe Out',
        helperText: 'Smooth, unhurried breath out',
        seconds: 4,
        phaseType: 'Exhale',
      },
      {
        prompt: 'Rest Empty',
        helperText: 'Pause peacefully before the next breath',
        seconds: 4,
        phaseType: 'Hold',
      },
    ],
  },
  {
    id: '478',
    shortTitle: '4-7-8 Fast Stress Melt',
    friendlyTagline: 'Long soothing exhale to slow your heart rate',
    bestFor: 'High stress or bedtime calm',
    phases: [
      {
        prompt: 'Breathe In Nose',
        helperText: 'Quietly draw air in through your nose',
        seconds: 4,
        phaseType: 'Inhale',
      },
      {
        prompt: 'Hold Softly',
        helperText: 'Let your jaw and shoulders drop',
        seconds: 7,
        phaseType: 'Hold',
      },
      {
        prompt: 'Long Whoosh Out',
        helperText: 'Exhale slowly through your mouth and let tension melt',
        seconds: 8,
        phaseType: 'Exhale',
      },
    ],
  },
  {
    id: 'coherent',
    shortTitle: 'Steady Heart Rhythm (5-5)',
    friendlyTagline: 'No holds — just smooth in & out waves',
    bestFor: 'Post-workout recovery',
    phases: [
      {
        prompt: 'Breathe In Smoothly',
        helperText: 'Expand ribs and belly at an even pace',
        seconds: 5,
        phaseType: 'Inhale',
      },
      {
        prompt: 'Breathe Out Smoothly',
        helperText: 'Release at the exact same calm speed',
        seconds: 5,
        phaseType: 'Exhale',
      },
    ],
  },
  {
    id: 'pranayama',
    shortTitle: 'Deep Release Pranayama (4-4-6-2)',
    friendlyTagline: 'Traditional calming breath with extended exhale',
    bestFor: 'Deep body relaxation',
    phases: [
      {
        prompt: 'Breathe In Deep',
        helperText: 'Breathe into belly, then lower ribs',
        seconds: 4,
        phaseType: 'Inhale',
      },
      {
        prompt: 'Hold Calmly',
        helperText: 'Stay effortless and still',
        seconds: 4,
        phaseType: 'Hold',
      },
      {
        prompt: 'Slow Release Out',
        helperText: 'Long, peaceful exhale out',
        seconds: 6,
        phaseType: 'Exhale',
      },
      {
        prompt: 'Quiet Pause',
        helperText: 'Notice the stillness',
        seconds: 2,
        phaseType: 'Hold',
      },
    ],
  },
];

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const BreathingTechniquesSection: React.FC<BreathingTechniquesSectionProps> = ({
  todayBreathworkMinutes,
  currentStressLevel,
  soundEnabledByDefault = true,
  onCompleteBreathworkMinutes,
}) => {
  const prefersReducedMotion = useReducedMotion();

  const [selectedExerciseId, setSelectedExerciseId] =
    useState<GuidedBreathExercise['id']>('belly_balloon');
  const [targetMinutes, setTargetMinutes] = useState<number>(3);
  const [trackId, setTrackId] = useState<BreathingTrackId>('tibetan_bowl');
  const [isMuted, setIsMuted] = useState<boolean>(!soundEnabledByDefault);
  const [volume, setVolume] = useState<number>(0.72);
  const [voiceCue, setVoiceCue] = useState<boolean>(false);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [phaseIdx, setPhaseIdx] = useState<number>(0);
  const [phaseSecondsLeft, setPhaseSecondsLeft] = useState<number>(
    GUIDED_BREATH_EXERCISES[0].phases[0].seconds
  );
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [completedCycles, setCompletedCycles] = useState<number>(0);
  const [sessionSavedBanner, setSessionSavedBanner] = useState<string | null>(null);

  const activeExercise = useMemo(
    () =>
      GUIDED_BREATH_EXERCISES.find((item) => item.id === selectedExerciseId) ??
      GUIDED_BREATH_EXERCISES[0],
    [selectedExerciseId]
  );

  const currentPhase = activeExercise.phases[phaseIdx] ?? activeExercise.phases[0];
  const targetTotalSeconds = targetMinutes * 60;
  const sessionProgressPct = Math.min(
    100,
    Math.round((elapsedSeconds / Math.max(1, targetTotalSeconds)) * 100)
  );

  // Reset phase state cleanly when switching exercises
  useEffect(() => {
    setIsRunning(false);
    breathingAudio.stop();
    setPhaseIdx(0);
    setPhaseSecondsLeft(activeExercise.phases[0].seconds);
    setElapsedSeconds(0);
    setCompletedCycles(0);
  }, [activeExercise]);

  // Always stop Web Audio oscillators when unmounting
  useEffect(() => {
    return () => {
      breathingAudio.stop();
    };
  }, []);

  // Trigger Web Audio API ambient swell & gentle chime on each phase transition
  useEffect(() => {
    if (!isRunning) {
      breathingAudio.stop();
      return;
    }
    const phase = activeExercise.phases[phaseIdx];
    if (!isMuted && phase) {
      breathingAudio.triggerPhaseTransition(phase.phaseType, phase.seconds);
    }
  }, [isRunning, phaseIdx, activeExercise, isMuted]);

  // 1-second guided countdown timer + auto-complete when target duration finishes
  useEffect(() => {
    if (!isRunning) return;

    const timerId = window.setInterval(() => {
      setElapsedSeconds((prevElapsed) => {
        const nextElapsed = prevElapsed + 1;
        if (nextElapsed >= targetTotalSeconds) {
          window.clearInterval(timerId);
          setIsRunning(false);
          breathingAudio.stop();
          if (!isMuted) {
            playTimerCompleteTone(true);
          }
          const minsEarned = Math.max(1, targetMinutes);
          const calmerStress = Math.max(1, currentStressLevel - 1) as 1 | 2 | 3 | 4 | 5;
          void onCompleteBreathworkMinutes(minsEarned, calmerStress);
          setSessionSavedBanner(
            `Great job! Completed ${minsEarned} min of ${activeExercise.shortTitle}.`
          );
          window.setTimeout(() => setSessionSavedBanner(null), 5000);
        }
        return nextElapsed;
      });

      setPhaseSecondsLeft((prevSec) => {
        if (prevSec > 1) {
          return prevSec - 1;
        }
        setPhaseIdx((currIdx) => {
          const nextIdx = (currIdx + 1) % activeExercise.phases.length;
          if (nextIdx === 0) {
            setCompletedCycles((c) => c + 1);
          }
          setPhaseSecondsLeft(activeExercise.phases[nextIdx].seconds);
          return nextIdx;
        });
        return 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [
    isRunning,
    targetTotalSeconds,
    targetMinutes,
    isMuted,
    currentStressLevel,
    activeExercise,
    onCompleteBreathworkMinutes,
  ]);

  const handleTogglePlay = () => {
    if (!isRunning) {
      if (elapsedSeconds >= targetTotalSeconds) {
        setElapsedSeconds(0);
        setCompletedCycles(0);
        setPhaseIdx(0);
        setPhaseSecondsLeft(activeExercise.phases[0].seconds);
      }
      if (!isMuted) {
        breathingAudio.start(trackId, volume, voiceCue);
      } else {
        playTimerSetTone(soundEnabledByDefault);
      }
      setIsRunning(true);
    } else {
      breathingAudio.stop();
      setIsRunning(false);
    }
  };

  const handleReset = () => {
    breathingAudio.stop();
    setIsRunning(false);
    setPhaseIdx(0);
    setPhaseSecondsLeft(activeExercise.phases[0].seconds);
    setElapsedSeconds(0);
    setCompletedCycles(0);
  };

  const handleSaveProgressNow = async () => {
    const mins = Math.max(1, Math.round(elapsedSeconds / 60) || 1);
    breathingAudio.stop();
    setIsRunning(false);
    const calmerStress = Math.max(1, currentStressLevel - 1) as 1 | 2 | 3 | 4 | 5;
    await onCompleteBreathworkMinutes(mins, calmerStress);
    setElapsedSeconds(0);
    setCompletedCycles(0);
    setPhaseIdx(0);
    setPhaseSecondsLeft(activeExercise.phases[0].seconds);
    setSessionSavedBanner(`Saved ${mins} min of calming breathwork to your daily log!`);
    window.setTimeout(() => setSessionSavedBanner(null), 4000);
  };

  // Determine visual circle scale for Inhale / Hold / Exhale
  const targetCircleScale = useMemo(() => {
    if (!isRunning || prefersReducedMotion) return 1;
    if (currentPhase.phaseType === 'Inhale') return 1.24;
    if (currentPhase.phaseType === 'Hold') {
      // Keep expanded if holding after inhale, relaxed if holding after exhale
      const prevIdx = (phaseIdx - 1 + activeExercise.phases.length) % activeExercise.phases.length;
      return activeExercise.phases[prevIdx]?.phaseType === 'Exhale' ? 0.88 : 1.24;
    }
    return 0.88;
  }, [isRunning, prefersReducedMotion, currentPhase.phaseType, phaseIdx, activeExercise.phases]);

  const activeTrackMeta =
    BREATHING_AUDIO_TRACKS.find((t) => t.id === trackId) ?? BREATHING_AUDIO_TRACKS[0];

  return (
    <section
      data-testid="breathing-techniques-section"
      aria-label="Breathing Techniques for Stress Management"
      className="space-y-5"
    >
      {sessionSavedBanner && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-sm font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-2.5">
          <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{sessionSavedBanner}</span>
        </div>
      )}

      {/* Primary Two-Column Stress-Relief Studio */}
      <div className="hl-card rounded-3xl p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Big Visual Breathing Circle & 1-Tap Play Control */}
        <div className="lg:col-span-7 flex flex-col items-center text-center space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
              Guided Stress Relief · {activeTrackMeta.name}
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {activeExercise.shortTitle}
            </h2>
          </div>

          {/* Animated Breathing Pacer Ring */}
          <div className="relative w-60 h-60 sm:w-64 sm:h-64 flex items-center justify-center my-1">
            <motion.div
              aria-hidden="true"
              animate={{
                scale: targetCircleScale,
                opacity: isRunning ? 0.95 : 0.75,
              }}
              transition={{
                duration: prefersReducedMotion ? 0.15 : Math.max(0.8, currentPhase.seconds * 0.92),
                ease: 'easeInOut',
              }}
              className={`w-48 h-48 sm:w-52 sm:h-52 rounded-full border-4 flex flex-col items-center justify-center px-4 shadow-sm ${
                currentPhase.phaseType === 'Inhale'
                  ? 'bg-teal-500/15 dark:bg-teal-500/20 border-teal-500 text-teal-950 dark:text-teal-50'
                  : currentPhase.phaseType === 'Hold'
                  ? 'bg-blue-500/15 dark:bg-blue-500/20 border-blue-500 text-blue-950 dark:text-blue-50'
                  : 'bg-indigo-500/15 dark:bg-indigo-500/20 border-indigo-500 text-indigo-950 dark:text-indigo-50'
              }`}
            >
              <span className="text-xs sm:text-sm font-bold tracking-tight">
                {isRunning ? currentPhase.prompt : 'Ready to Breathe'}
              </span>
              <span
                data-testid="breathing-countdown-seconds"
                className="text-4xl sm:text-5xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1 leading-none"
              >
                {phaseSecondsLeft}s
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 mt-2">
                {isRunning ? currentPhase.phaseType : 'Tap Start Below'}
              </span>
            </motion.div>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-md min-h-[2.25rem]">
            {isRunning
              ? currentPhase.helperText
              : 'Press Start and follow the growing circle as calming music guides every breath in and out.'}
          </p>

          {/* Session Timer Progress Bar */}
          <div className="w-full max-w-md space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <span>
                Time: {formatClock(elapsedSeconds)} / {formatClock(targetTotalSeconds)}
              </span>
              <span>
                {completedCycles} breaths · Today: {todayBreathworkMinutes}m
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-teal-600 dark:bg-teal-400 rounded-full transition-all duration-300"
                style={{ width: `${sessionProgressPct}%` }}
              />
            </div>
          </div>

          {/* Big Friendly Primary Controls */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 w-full max-w-md">
            <button
              type="button"
              data-testid="start-breathwork-btn"
              onClick={handleTogglePlay}
              className={`no-touch-delay flex-1 min-w-[180px] min-h-[50px] px-5 py-3 rounded-2xl text-sm font-bold text-white transition-colors flex items-center justify-center gap-2 shadow-xs whitespace-nowrap ${
                isRunning
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-teal-600 hover:bg-teal-500'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4 shrink-0" />
                  <span>Pause Breathing</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 shrink-0" />
                  <span>{elapsedSeconds > 0 ? 'Resume Breathing' : 'Start Calming Audio'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset breathing timer"
              className="no-touch-delay min-h-[50px] px-3.5 py-3 rounded-2xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 flex items-center gap-1.5 whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>Reset</span>
            </button>

            {elapsedSeconds >= 10 && (
              <button
                type="button"
                onClick={() => void handleSaveProgressNow()}
                className="no-touch-delay min-h-[50px] px-4 py-3 rounded-2xl bg-slate-900 dark:bg-sky-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Done &amp; Save</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Step-by-Step Easy Choices (Pick Exercise, Pick Time, Pick Ambient Sound) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Step 1: Pick a Breathing Exercise */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Wind className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>1. Pick Your Breathing Pattern</span>
            </label>
            <div className="space-y-1.5">
              {GUIDED_BREATH_EXERCISES.map((ex) => {
                const selected = ex.id === selectedExerciseId;
                return (
                  <button
                    key={ex.id}
                    type="button"
                    data-testid={`breath-pattern-${ex.id}`}
                    onClick={() => setSelectedExerciseId(ex.id)}
                    className={`no-touch-delay w-full min-h-[52px] px-3.5 py-2.5 rounded-2xl border text-left transition-colors flex items-center justify-between gap-2 ${
                      selected
                        ? 'border-teal-600 dark:border-teal-400 bg-teal-50/70 dark:bg-teal-950/40'
                        : 'hl-subtle border-transparent hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                        {ex.shortTitle}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {ex.friendlyTagline} · {ex.bestFor}
                      </p>
                    </div>
                    {selected && (
                      <Check className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Pick How Long */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
              2. How Long Would You Like to Relax?
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { mins: 1, label: '1 Min Quick' },
                { mins: 3, label: '3 Min Calm' },
                { mins: 5, label: '5 Min Deep' },
              ].map((opt) => (
                <button
                  key={opt.mins}
                  type="button"
                  onClick={() => setTargetMinutes(opt.mins)}
                  className={`no-touch-delay min-h-[44px] px-2.5 py-2 rounded-xl text-xs font-mono tabular-nums font-semibold border transition-colors whitespace-nowrap ${
                    targetMinutes === opt.mins
                      ? 'bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-500'
                      : 'hl-subtle text-slate-700 dark:text-slate-200 hover:border-slate-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Pick Calming Ambient Sound Track */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="breath-audio-track-select"
                className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
              >
                <Music className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>3. Calming Ambient Sound</span>
              </label>

              <button
                type="button"
                aria-label={isMuted ? 'Unmute calming audio' : 'Mute calming audio'}
                onClick={() => {
                  const nextMuted = !isMuted;
                  setIsMuted(nextMuted);
                  if (nextMuted) {
                    breathingAudio.stop();
                  } else if (isRunning) {
                    breathingAudio.start(trackId, volume, voiceCue);
                    breathingAudio.triggerPhaseTransition(
                      currentPhase.phaseType,
                      phaseSecondsLeft
                    );
                  }
                }}
                className="no-touch-delay min-h-[38px] px-2.5 py-1 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
              >
                {isMuted ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                    <span>Muted</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>Sound On</span>
                  </>
                )}
              </button>
            </div>

            <select
              id="breath-audio-track-select"
              data-testid="breath-audio-track-select"
              aria-label="Select calming ambient audio track"
              value={trackId}
              onChange={(e) => {
                const next = e.target.value as BreathingTrackId;
                setTrackId(next);
                breathingAudio.setTrack(next);
              }}
              className="w-full min-h-[44px] px-3 text-xs sm:text-sm font-semibold hl-input rounded-xl"
            >
              {BREATHING_AUDIO_TRACKS.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name} — {track.subtitle}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Expandable Dropdowns for Volume/Voice Settings & Simple Science Explanation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <ExpandableInfoDropdown
          title="Volume, Spoken Voice & Stress Check"
          subtitle="Adjust music loudness, voice helper, or how calm you feel"
          icon={<Volume2 className="w-4 h-4" />}
          testId="breathing-sound-options-dropdown"
        >
          <div className="space-y-4 text-xs">
            <label className="flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Music Loudness
              </span>
              <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setVolume(val);
                    breathingAudio.setVolume(val);
                  }}
                  className="w-full accent-teal-600"
                />
                <span className="font-mono tabular-nums font-bold w-10 text-right text-slate-900 dark:text-white">
                  {Math.round(volume * 100)}%
                </span>
              </div>
            </label>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  Spoken Voice Guide
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Reads &ldquo;Breathe in&rdquo; and &ldquo;Breathe out&rdquo; aloud softly
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !voiceCue;
                  setVoiceCue(next);
                  breathingAudio.setVoiceCueEnabled(next);
                }}
                className={`no-touch-delay min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                  voiceCue
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'hl-subtle text-slate-700 dark:text-slate-200'
                }`}
              >
                {voiceCue ? 'Voice On' : 'Voice Off'}
              </button>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  How Stressed Do You Feel Right Now?
                </span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {currentStressLevel}/5
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {(
                  [
                    { level: 1, label: '1 · Super Calm' },
                    { level: 2, label: '2 · Relaxed' },
                    { level: 3, label: '3 · Okay' },
                    { level: 4, label: '4 · Busy' },
                    { level: 5, label: '5 · Stressed' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.level}
                    type="button"
                    onClick={() => void onCompleteBreathworkMinutes(0, item.level)}
                    className={`no-touch-delay min-h-[40px] px-1.5 py-1 rounded-xl font-mono tabular-nums text-[11px] font-semibold transition-colors ${
                      currentStressLevel === item.level
                        ? 'bg-teal-600 text-white'
                        : 'hl-subtle border text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {item.level}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ExpandableInfoDropdown>

        <ExpandableInfoDropdown
          title="How Breathing Melts Stress (Easy Guide)"
          subtitle="Why slow exhales calm your heart and muscles in 60 seconds"
          icon={<HeartHandshake className="w-4 h-4" />}
          testId="breathing-how-it-works-dropdown"
        >
          <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <p className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <span>
                <strong>Breathe In = Gentle Energy:</strong> Breathing in through your nose warms
                the air and fills your lower lungs with fresh oxygen.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <span>
                <strong>Longer Breathe Out = Instant Brake Pedal:</strong> Making your exhale
                slightly longer than your inhale signals your vagus nerve that you are safe,
                slowing a racing heart within 4 to 6 breaths.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <span>
                <strong>Web Audio Sound Swells:</strong> Our built-in ambient synthesizer gently
                brightens as you inhale and softens as you exhale so you can even close your eyes!
              </span>
            </p>
          </div>
        </ExpandableInfoDropdown>
      </div>
    </section>
  );
};

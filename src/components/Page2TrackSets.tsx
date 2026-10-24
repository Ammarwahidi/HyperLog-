import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActiveStandaloneSession,
  ExercisePrescription,
  MuscleAutoregulationFeedback,
  MuscleId,
  MuscleLandmark,
  SetLogEntry,
  WorkoutDayPlan,
} from '../types/workout';
import { MESOCYCLE_WEEKS } from '../data/rpPlanData';
import {
  BellRing,
  Check,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Share2,
  Smartphone,
  Timer,
  Trash2,
  X,
} from 'lucide-react';

interface Page2TrackSetsProps {
  activeWeek: number;
  onChangeWeek: (week: number) => void;
  activeDay: number;
  onChangeDay: (day: number) => void;
  activeStandaloneSession: ActiveStandaloneSession | null;
  onClearStandaloneSession: () => Promise<void>;
  plan: WorkoutDayPlan[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  setLogs: SetLogEntry[];
  feedback: Record<string, MuscleAutoregulationFeedback>;
  weightUnit: 'kg' | 'lb';
  defaultRestSeconds?: number;
  defaultVibrateEnabled?: boolean;
  defaultAutoTimer?: boolean;
  onToggleWeightUnit: (unit: 'kg' | 'lb') => void;
  onUpsertSet: (entry: SetLogEntry, triggerSync?: boolean) => Promise<void>;
  onDeleteSet: (id: string) => Promise<void>;
  onSaveFeedback: (fb: MuscleAutoregulationFeedback) => Promise<void>;
  onQueueSessionSync: (
    sessionLabel: string,
    dayNumber: number,
    completedSetsCount: number,
    tonnageKg: number
  ) => Promise<void>;
}

const RIR_OPTIONS: Array<{ value: number; shortLabel: string; detail: string }> = [
  { value: 0, shortLabel: '0 RIR', detail: '0 RIR · Failure' },
  { value: 0.5, shortLabel: '0.5 RIR', detail: '0.5 RIR · Near Fail' },
  { value: 1, shortLabel: '1 RIR', detail: '1 RIR · Optimal' },
  { value: 2, shortLabel: '2 RIR', detail: '2 RIR · Optimal' },
  { value: 3, shortLabel: '3 RIR', detail: '3 RIR · Optimal' },
  { value: 4, shortLabel: '4+ RIR', detail: '4+ RIR · Deload' },
];

function getRirVisualFeedback(rir: number): {
  selectClasses: string;
  badgeLabel: string;
  badgeClasses: string;
} {
  if (rir < 1) {
    // Immediate Yellow feedback for <1 RIR (Failure / Near Failure)
    return {
      selectClasses:
        'bg-yellow-50 dark:bg-yellow-950/70 border-yellow-400 dark:border-yellow-500/80 text-yellow-900 dark:text-yellow-200 focus:ring-yellow-500',
      badgeLabel: '<1 RIR · High Fatigue',
      badgeClasses: 'text-yellow-700 dark:text-yellow-300',
    };
  }
  if (rir <= 3) {
    // Immediate Green feedback for 1-3 RIR (Hypertrophy Sweet Spot)
    return {
      selectClasses:
        'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-400 dark:border-emerald-500/80 text-emerald-900 dark:text-emerald-200 focus:ring-emerald-500',
      badgeLabel: '1–3 RIR · Optimal',
      badgeClasses: 'text-emerald-700 dark:text-emerald-300',
    };
  }
  return {
    selectClasses:
      'hl-input border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:ring-blue-600',
    badgeLabel: '4+ RIR · Deload',
    badgeClasses: 'text-slate-500 dark:text-slate-400',
  };
}

function triggerDeviceVibration(pattern: number | number[]): boolean {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return navigator.vibrate(pattern);
    }
  } catch {
    // Ignore restricted iframe / unsupported platform errors gracefully
  }
  return false;
}

function playGentleCompletionTone(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [587.33, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.16);
      gain.gain.setValueAtTime(0.001, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.16 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.16 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.26);
    });
  } catch {
    // Ignore audio context restrictions
  }
}

export const Page2TrackSets: React.FC<Page2TrackSetsProps> = ({
  activeWeek,
  onChangeWeek,
  activeDay,
  onChangeDay,
  activeStandaloneSession,
  onClearStandaloneSession,
  plan,
  landmarks,
  setLogs,
  feedback,
  weightUnit,
  defaultRestSeconds = 90,
  defaultVibrateEnabled = true,
  defaultAutoTimer = true,
  onToggleWeightUnit,
  onUpsertSet,
  onDeleteSet,
  onSaveFeedback,
  onQueueSessionSync,
}) => {
  const [trackingMode, setTrackingMode] = useState<'schedule' | 'standalone'>(
    activeStandaloneSession ? 'standalone' : 'schedule'
  );
  const [restDuration, setRestDuration] = useState<number>(defaultRestSeconds);
  const [userCustomRestSpecified, setUserCustomRestSpecified] = useState<boolean>(false);
  const [customRestInput, setCustomRestInput] = useState<string>(String(defaultRestSeconds));
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [activeTimerTarget, setActiveTimerTarget] = useState<number>(defaultRestSeconds);
  const [restExerciseName, setRestExerciseName] = useState<string>('');
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [autoTimerOnComplete, setAutoTimerOnComplete] = useState<boolean>(defaultAutoTimer);
  const [vibrateEnabled, setVibrateEnabled] = useState<boolean>(defaultVibrateEnabled);
  const [timerCompletedAlert, setTimerCompletedAlert] = useState<string | null>(null);
  const [syncConfirmation, setSyncConfirmation] = useState<string | null>(null);

  const vibrateEnabledRef = useRef(vibrateEnabled);
  vibrateEnabledRef.current = vibrateEnabled;
  const restExerciseRef = useRef(restExerciseName);
  restExerciseRef.current = restExerciseName;

  const supportsNativeVibrate =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  useEffect(() => {
    setRestDuration(defaultRestSeconds);
    setCustomRestInput(String(defaultRestSeconds));
    setActiveTimerTarget(defaultRestSeconds);
  }, [defaultRestSeconds]);

  useEffect(() => {
    setVibrateEnabled(defaultVibrateEnabled);
  }, [defaultVibrateEnabled]);

  useEffect(() => {
    setAutoTimerOnComplete(defaultAutoTimer);
  }, [defaultAutoTimer]);

  useEffect(() => {
    if (activeStandaloneSession) {
      setTrackingMode('standalone');
    } else {
      setTrackingMode('schedule');
    }
  }, [activeStandaloneSession]);

  const fireRestElapsedFeedback = useCallback(() => {
    if (vibrateEnabledRef.current) {
      // Rhythmic triple-pulse alarm on the device's native vibration motor
      triggerDeviceVibration([280, 110, 280, 110, 420]);
      playGentleCompletionTone();
    }
    const label = restExerciseRef.current
      ? `Rest complete for ${restExerciseRef.current} — ready for your next set!`
      : 'Rest timer complete — ready for your next set!';
    setTimerCompletedAlert(label);
  }, []);

  useEffect(() => {
    if (!isTimerRunning) return;
    if (restSecondsLeft <= 0) {
      setIsTimerRunning(false);
      return;
    }

    const intervalId = window.setInterval(() => {
      setRestSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          setIsTimerRunning(false);
          fireRestElapsedFeedback();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isTimerRunning, restSecondsLeft, fireRestElapsedFeedback]);

  const startRestCountdown = (seconds: number, exerciseLabel?: string) => {
    const clamped = Math.max(5, Math.min(600, Math.round(seconds)));
    setTimerCompletedAlert(null);
    setRestDuration(clamped);
    setCustomRestInput(String(clamped));
    setActiveTimerTarget(clamped);
    setRestSecondsLeft(clamped);
    if (exerciseLabel !== undefined) {
      setRestExerciseName(exerciseLabel);
    }
    setIsTimerRunning(true);
  };

  const adjustRestTime = (deltaSec: number) => {
    setTimerCompletedAlert(null);
    setUserCustomRestSpecified(true);
    if (isTimerRunning || restSecondsLeft > 0) {
      const nextLeft = Math.max(5, Math.min(600, restSecondsLeft + deltaSec));
      setRestSecondsLeft(nextLeft);
      setRestDuration(nextLeft);
      setCustomRestInput(String(nextLeft));
      setActiveTimerTarget((prev) => Math.max(prev, nextLeft));
    } else {
      const nextDur = Math.max(5, Math.min(600, restDuration + deltaSec));
      setRestDuration(nextDur);
      setCustomRestInput(String(nextDur));
      setActiveTimerTarget(nextDur);
    }
  };

  const handleCommitCustomSeconds = () => {
    const parsed = Math.max(5, Math.min(600, Math.round(Number(customRestInput) || 90)));
    setUserCustomRestSpecified(true);
    setRestDuration(parsed);
    setCustomRestInput(String(parsed));
    setActiveTimerTarget(parsed);
    if (!isTimerRunning) {
      setRestSecondsLeft(parsed);
    }
  };

  const isStandaloneActive = trackingMode === 'standalone' && !!activeStandaloneSession;

  const currentDayPlan: WorkoutDayPlan = useMemo(() => {
    if (isStandaloneActive && activeStandaloneSession) {
      return {
        dayNumber: 0,
        title: `Template · ${activeStandaloneSession.templateName}`,
        focusSummary: 'Standalone template session (credits weekly muscle volume landmarks)',
        isRestDay: false,
        exercises: activeStandaloneSession.exercises.map((item, idx) => ({
          id: item.id,
          dayNumber: 0,
          order: idx + 1,
          muscleId: item.primaryMuscle,
          sheetMuscleLabel: landmarks[item.primaryMuscle]?.shortName ?? 'Target',
          name: item.name,
          isSuperset: false,
          repRange: item.reps,
          defaultWeightKg: item.defaultWeightKg,
          restSeconds: item.restSeconds,
          libraryExerciseId: item.libraryExerciseId,
          weekSets: {
            1: item.sets,
            2: item.sets,
            3: item.sets,
            4: item.sets,
            5: Math.max(1, Math.floor(item.sets / 2)),
          },
        })),
      };
    }
    return plan.find((d) => d.dayNumber === activeDay) ?? plan[0];
  }, [isStandaloneActive, activeStandaloneSession, plan, activeDay, landmarks]);

  const weekMeta =
    MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];

  const weeklySetsByMuscle = useMemo(() => {
    const counts = {} as Record<MuscleId, number>;
    for (const id of Object.values(MuscleId)) counts[id] = 0;
    for (const s of setLogs) {
      if (s.week === activeWeek && s.completed) {
        counts[s.muscleId] = (counts[s.muscleId] ?? 0) + 1;
      }
    }
    return counts;
  }, [setLogs, activeWeek]);

  const setsByExercise = useMemo(() => {
    const map: Record<string, SetLogEntry[]> = {};
    for (const ex of currentDayPlan.exercises) {
      map[ex.id] = [];
    }
    for (const s of setLogs) {
      if (isStandaloneActive && activeStandaloneSession) {
        if (s.templateSessionId === activeStandaloneSession.sessionId) {
          if (!map[s.exerciseId]) map[s.exerciseId] = [];
          map[s.exerciseId].push(s);
        }
      } else if (
        !s.templateSessionId &&
        s.week === activeWeek &&
        s.dayNumber === activeDay
      ) {
        if (!map[s.exerciseId]) map[s.exerciseId] = [];
        map[s.exerciseId].push(s);
      }
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.setIndex - b.setIndex);
    }
    return map;
  }, [
    setLogs,
    activeWeek,
    activeDay,
    currentDayPlan,
    isStandaloneActive,
    activeStandaloneSession,
  ]);

  const sessionStats = useMemo(() => {
    let total = 0;
    let completed = 0;
    let tonnageKg = 0;
    for (const ex of currentDayPlan.exercises) {
      const list = setsByExercise[ex.id] ?? [];
      total += list.length;
      for (const s of list) {
        if (s.completed) {
          completed += 1;
          tonnageKg += (s.weightKg || 0) * s.reps;
        }
      }
    }
    return { total, completed, tonnageKg };
  }, [currentDayPlan, setsByExercise]);

  const formatWeightDisplay = (kg: number) => {
    if (weightUnit === 'kg') return kg;
    return Number((kg * 2.20462).toFixed(1));
  };

  const parseWeightToKg = (inputVal: number) => {
    if (weightUnit === 'kg') return inputVal;
    return Number((inputVal / 2.20462).toFixed(2));
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const handleToggleComplete = async (
    entry: SetLogEntry,
    exerciseName: string,
    prescribedRestSec?: number
  ) => {
    const nextCompleted = !entry.completed;
    await onUpsertSet(
      {
        ...entry,
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date().toISOString() : undefined,
      },
      nextCompleted
    );
    if (nextCompleted) {
      if (vibrateEnabled) {
        triggerDeviceVibration(35);
      }
      if (autoTimerOnComplete) {
        const chosenRest = userCustomRestSpecified
          ? restDuration
          : entry.restSeconds ?? prescribedRestSec ?? restDuration;
        startRestCountdown(chosenRest, exerciseName);
      }
    }
  };

  const handleAddSet = async (ex: ExercisePrescription) => {
    const existing = setsByExercise[ex.id] ?? [];
    const last = existing[existing.length - 1];
    const nextIdx = existing.length + 1;
    const sessionId = isStandaloneActive ? activeStandaloneSession?.sessionId : undefined;
    const newEntry: SetLogEntry = {
      id: sessionId
        ? `${sessionId}_${ex.id}_s${nextIdx}_${Date.now()}`
        : `w${activeWeek}_d${activeDay}_${ex.id}_s${nextIdx}_${Date.now()}`,
      week: activeWeek,
      dayNumber: isStandaloneActive ? 0 : activeDay,
      templateSessionId: sessionId,
      exerciseId: ex.id,
      exerciseName: ex.name,
      muscleId: ex.muscleId,
      setIndex: nextIdx,
      weightKg: last ? last.weightKg : ex.defaultWeightKg,
      reps: last ? last.reps : 10,
      rir: last ? last.rir : weekMeta.defaultRirNumber,
      restSeconds: ex.restSeconds ?? restDuration,
      completed: false,
    };
    await onUpsertSet(newEntry, false);
  };

  const handleSyncWorkoutSession = async () => {
    await onQueueSessionSync(
      currentDayPlan.title,
      isStandaloneActive ? 0 : activeDay,
      sessionStats.completed,
      sessionStats.tonnageKg
    );
    setSyncConfirmation(
      `Queued "${currentDayPlan.title}" (${sessionStats.completed} sets · ${Math.round(
        sessionStats.completed * 16.5
      )} kcal) to Health Connect / Google Fit Outbox`
    );
    window.setTimeout(() => setSyncConfirmation(null), 4000);
  };

  const musclesTrainedToday = useMemo(() => {
    const seen = new Set<MuscleId>();
    const list: MuscleId[] = [];
    for (const ex of currentDayPlan.exercises) {
      if (!seen.has(ex.muscleId)) {
        seen.add(ex.muscleId);
        list.push(ex.muscleId);
      }
    }
    return list;
  }, [currentDayPlan]);

  const displayedTimerSec = restSecondsLeft > 0 ? restSecondsLeft : restDuration;
  const timerProgressPct =
    restSecondsLeft > 0
      ? Math.max(0, Math.min(100, Math.round((restSecondsLeft / Math.max(1, activeTimerTarget)) * 100)))
      : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Page Title & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Track Sets &amp; RIR
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            {weekMeta.label} · Prescribed Effort {weekMeta.targetRir}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeStandaloneSession && (
            <div className="flex items-center gap-1 p-1 bg-blue-100/80 dark:bg-blue-950/70 rounded-xl">
              <button
                type="button"
                onClick={() => setTrackingMode('standalone')}
                className={`min-h-[38px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  trackingMode === 'standalone'
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-900 dark:text-blue-200 hover:bg-blue-200/60 dark:hover:bg-blue-900/50'
                }`}
              >
                Active Template
              </button>
              <button
                type="button"
                onClick={() => setTrackingMode('schedule')}
                className={`min-h-[38px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  trackingMode === 'schedule'
                    ? 'bg-slate-900 dark:bg-slate-700 text-white'
                    : 'text-blue-900 dark:text-blue-200 hover:bg-blue-200/60 dark:hover:bg-blue-900/50'
                }`}
              >
                7-Day Schedule
              </button>
            </div>
          )}

          {/* Week Selector */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800/90 overflow-x-auto no-scrollbar">
            {MESOCYCLE_WEEKS.map((w) => (
              <button
                key={w.week}
                type="button"
                onClick={() => onChangeWeek(w.week)}
                className={`min-h-[38px] px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  activeWeek === w.week
                    ? 'bg-slate-900 dark:bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {w.week === 5 ? 'Deload' : `Wk ${w.week}`}
              </button>
            ))}
          </div>

          {/* Unit Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800/90">
            {(['kg', 'lb'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => onToggleWeightUnit(u)}
                className={`min-h-[38px] px-3 py-1 text-xs font-semibold rounded-lg uppercase transition-colors ${
                  weightUnit === u
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Standalone Active Banner OR Horizontal 7-Day Selector Bar */}
      {isStandaloneActive && activeStandaloneSession ? (
        <div className="bg-blue-50/90 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
              Standalone Workout Template Active · Credits Week {activeWeek} Muscle Volume
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
              {activeStandaloneSession.templateName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClearStandaloneSession}
            className="min-h-[40px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hl-card hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Exit Template Session
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {plan.map((d) => {
            const isSelected = d.dayNumber === activeDay;
            const dayLogs = setLogs.filter(
              (s) => !s.templateSessionId && s.week === activeWeek && s.dayNumber === d.dayNumber
            );
            const doneCount = dayLogs.filter((s) => s.completed).length;

            return (
              <button
                key={d.dayNumber}
                type="button"
                onClick={() => onChangeDay(d.dayNumber)}
                className={`min-h-[54px] px-3.5 sm:px-4 py-2 rounded-xl border text-left transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-500'
                    : 'hl-card text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <div className="text-xs font-bold whitespace-nowrap">
                  Day {d.dayNumber} {d.isRestDay ? '· Rest' : ''}
                </div>
                <div
                  className={`text-[11px] font-mono tabular-nums mt-0.5 whitespace-nowrap ${
                    isSelected ? 'text-slate-200 dark:text-blue-100' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {d.isRestDay ? 'Recovery' : `${doneCount}/${dayLogs.length} sets`}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Vibration Rest Timer Console & Session Summary */}
      {!currentDayPlan.isRestDay && (
        <div className="hl-card rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Session Progress Info */}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                {currentDayPlan.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                Completed{' '}
                <strong className="text-slate-900 dark:text-white">
                  {sessionStats.completed}/{sessionStats.total}
                </strong>{' '}
                sets · Load{' '}
                {weightUnit === 'kg'
                  ? `${Math.round(sessionStats.tonnageKg).toLocaleString()} kg`
                  : `${Math.round(sessionStats.tonnageKg * 2.20462).toLocaleString()} lb`}{' '}
                · Est. {Math.round(sessionStats.completed * 16.5)} kcal
              </p>
            </div>

            {/* Haptic Vibration Rest Timer Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Countdown Display + Start/Pause/Reset */}
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors ${
                  isTimerRunning
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 dark:border-blue-500'
                    : 'hl-subtle border'
                }`}
              >
                <Timer
                  className={`w-4 h-4 shrink-0 ${
                    isTimerRunning
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => adjustRestTime(-15)}
                  className="min-h-[36px] min-w-[32px] flex items-center justify-center rounded-lg text-xs font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                  title="Subtract 15 seconds"
                  aria-label="Subtract 15 seconds from rest timer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                <span className="font-mono tabular-nums text-base font-bold text-slate-900 dark:text-white min-w-[52px] text-center">
                  {formatTimer(displayedTimerSec)}
                </span>

                <button
                  type="button"
                  onClick={() => adjustRestTime(15)}
                  className="min-h-[36px] min-w-[32px] flex items-center justify-center rounded-lg text-xs font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                  title="Add 15 seconds"
                  aria-label="Add 15 seconds to rest timer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTimerCompletedAlert(null);
                    if (isTimerRunning) {
                      setIsTimerRunning(false);
                    } else if (restSecondsLeft > 0) {
                      setIsTimerRunning(true);
                    } else {
                      startRestCountdown(restDuration);
                    }
                  }}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-900 dark:bg-blue-600 text-white hover:opacity-90 transition-opacity"
                  aria-label={isTimerRunning ? 'Pause rest timer' : 'Start rest timer'}
                >
                  {isTimerRunning ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsTimerRunning(false);
                    setTimerCompletedAlert(null);
                    setRestSecondsLeft(restDuration);
                    setActiveTimerTarget(restDuration);
                  }}
                  className="min-h-[38px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  aria-label="Reset rest timer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Presets + Custom Seconds Input */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[60, 90, 120, 180].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => {
                      setUserCustomRestSpecified(true);
                      setRestDuration(sec);
                      setCustomRestInput(String(sec));
                      setActiveTimerTarget(sec);
                      setRestSecondsLeft(sec);
                      setTimerCompletedAlert(null);
                    }}
                    className={`min-h-[38px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-lg border transition-colors whitespace-nowrap ${
                      restDuration === sec
                        ? 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}

                <div className="flex items-center gap-1 hl-subtle border rounded-lg px-2 min-h-[38px]">
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={customRestInput}
                    onChange={(e) => setCustomRestInput(e.target.value)}
                    onBlur={handleCommitCustomSeconds}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCommitCustomSeconds();
                      }
                    }}
                    aria-label="Custom rest time in seconds"
                    className="w-12 bg-transparent text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white focus:outline-none text-right"
                  />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">sec</span>
                </div>
              </div>
            </div>
          </div>

          {/* Haptic Vibration Controls & Live Progress Bar */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoTimerOnComplete}
                  onChange={(e) => setAutoTimerOnComplete(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>Auto-start rest on set checkoff</span>
              </label>

              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={vibrateEnabled}
                  onChange={(e) => setVibrateEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>Vibrate on finish</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const vibrated = triggerDeviceVibration([180, 90, 220]);
                  if (!vibrated) playGentleCompletionTone();
                  setTimerCompletedAlert(
                    supportsNativeVibrate
                      ? 'Vibration motor pulse triggered.'
                      : 'Audio alert triggered (open on Android/mobile for native haptic motor).'
                  );
                }}
                className="min-h-[34px] px-2.5 py-1 rounded-lg hl-subtle border text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600 font-medium flex items-center gap-1.5 whitespace-nowrap"
              >
                <Smartphone className="w-3.5 h-3.5" />
                Test Vibrate
              </button>
            </div>
          </div>

          {(isTimerRunning || restSecondsLeft > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span>
                  {isTimerRunning ? 'Resting' : 'Paused'}
                  {restExerciseName ? ` · ${restExerciseName}` : ''}
                </span>
                <span>
                  {formatTimer(restSecondsLeft)} / {formatTimer(activeTimerTarget)}
                </span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-200"
                  style={{ width: `${timerProgressPct}%` }}
                />
              </div>
            </div>
          )}

          {timerCompletedAlert && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 flex items-center justify-between gap-3 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 shrink-0" />
                <span>{timerCompletedAlert}</span>
              </div>
              <button
                type="button"
                onClick={() => setTimerCompletedAlert(null)}
                className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                aria-label="Dismiss timer alert"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {syncConfirmation && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-xs font-medium text-emerald-800 dark:text-emerald-200">
          {syncConfirmation}
        </div>
      )}

      {/* Rest Day Card OR Exercise Set Logging Cards */}
      {currentDayPlan.isRestDay ? (
        <div className="hl-card rounded-2xl p-6 sm:p-8 text-center max-w-2xl mx-auto space-y-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Day {currentDayPlan.dayNumber} · Scheduled Systemic Recovery
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Day 3 is a dedicated recovery day between your Anterior/Quad sessions (Days 1–2) and
            Posterior/Back session (Day 4). Aim for 8,000–10,000 low-fatigue walking steps and hit
            your daily protein and carbohydrate targets on the Calories tab.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => onChangeDay(4)}
              className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Preview Day 4 Workout
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Exercise Logging Cards */}
          <div className="xl:col-span-8 space-y-4">
            {/* Concise Color-Coded RIR Proximity Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl hl-subtle border text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                RIR Proximity Feedback:
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                  1–3 RIR (Optimal Growth)
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-yellow-700 dark:text-yellow-300">
                  <span className="w-2.5 h-2.5 rounded-xs bg-yellow-400 inline-block" />
                  &lt;1 RIR (Failure / Max Fatigue)
                </span>
              </div>
            </div>

            {currentDayPlan.exercises.map((ex, idx) => {
              const exSets = setsByExercise[ex.id] ?? [];
              const lm = landmarks[ex.muscleId];
              const currentWeeklyMuscleSets = weeklySetsByMuscle[ex.muscleId] ?? 0;
              const lastSet = exSets[exSets.length - 1];

              return (
                <div
                  key={ex.id}
                  className="hl-card rounded-2xl p-4 sm:p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {lm.shortName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Target {ex.repRange} reps</span>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() =>
                            startRestCountdown(ex.restSeconds ?? restDuration, ex.name)
                          }
                          className="font-mono tabular-nums text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          title="Start prescribed rest timer for this exercise"
                        >
                          {ex.restSeconds ?? restDuration}s rest
                        </button>
                        {ex.isSuperset && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-blue-700 dark:text-blue-300">
                              Superset
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                        {ex.name}
                      </h3>
                    </div>

                    <div className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      <span>{lm.shortName}: </span>
                      <strong className="text-slate-900 dark:text-white">
                        {currentWeeklyMuscleSets}
                      </strong>
                      <span>
                        /{lm.mavMin}–{lm.mavMax} MAV
                      </span>
                    </div>
                  </div>

                  {/* Mobile-Aligned Set Rows */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-1.5 sm:gap-2.5 px-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <div className="col-span-2 sm:col-span-1">Set</div>
                      <div className="col-span-3">Load ({weightUnit})</div>
                      <div className="col-span-2 sm:col-span-3">Reps</div>
                      <div className="col-span-3">RIR</div>
                      <div className="col-span-2 text-right">Done</div>
                    </div>

                    {exSets.map((setRow, sIdx) => {
                      const rirVisual = getRirVisualFeedback(setRow.rir);
                      const hasMatchingOption = RIR_OPTIONS.some((o) => o.value === setRow.rir);

                      return (
                        <div
                          key={setRow.id}
                          className={`grid grid-cols-12 gap-1.5 sm:gap-2.5 items-center p-2 rounded-xl border transition-colors ${
                            setRow.completed
                              ? 'bg-emerald-50/55 dark:bg-emerald-950/35 border-emerald-300/80 dark:border-emerald-700/70'
                              : 'hl-subtle border'
                          }`}
                        >
                          <div className="col-span-2 sm:col-span-1">
                            <span className="font-mono tabular-nums text-xs font-bold text-slate-700 dark:text-slate-300 pl-0.5">
                              S{sIdx + 1}
                            </span>
                          </div>

                          <div className="col-span-3">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              aria-label={`Set ${sIdx + 1} load in ${weightUnit}`}
                              value={formatWeightDisplay(setRow.weightKg)}
                              onChange={(e) =>
                                onUpsertSet({
                                  ...setRow,
                                  weightKg: parseWeightToKg(Math.max(0, Number(e.target.value))),
                                })
                              }
                              className="w-full min-h-[42px] px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm font-mono tabular-nums font-semibold hl-input rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </div>

                          <div className="col-span-2 sm:col-span-3">
                            <input
                              type="number"
                              min="1"
                              max="60"
                              aria-label={`Set ${sIdx + 1} reps`}
                              value={setRow.reps}
                              onChange={(e) =>
                                onUpsertSet({
                                  ...setRow,
                                  reps: Math.max(1, Number(e.target.value)),
                                })
                              }
                              className="w-full min-h-[42px] px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm font-mono tabular-nums font-semibold hl-input rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </div>

                          {/* Color-Coded RIR Selector Dropdown */}
                          <div className="col-span-3">
                            <select
                              aria-label={`Set ${sIdx + 1} Reps in Reserve`}
                              value={hasMatchingOption ? setRow.rir : Math.min(4, Math.max(0, Math.round(setRow.rir)))}
                              onChange={(e) =>
                                onUpsertSet({
                                  ...setRow,
                                  rir: Number(e.target.value),
                                })
                              }
                              title={rirVisual.badgeLabel}
                              className={`w-full min-h-[42px] px-1.5 sm:px-2 py-1.5 text-xs font-mono tabular-nums font-bold border rounded-lg focus:outline-none focus:ring-2 transition-colors ${rirVisual.selectClasses}`}
                            >
                              {RIR_OPTIONS.map((opt) => (
                                <option
                                  key={opt.value}
                                  value={opt.value}
                                  className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                >
                                  {opt.shortLabel}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-span-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleComplete(setRow, ex.name, ex.restSeconds)
                              }
                              aria-label={
                                setRow.completed
                                  ? `Mark set ${sIdx + 1} incomplete`
                                  : `Mark set ${sIdx + 1} complete`
                              }
                              className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-colors ${
                                setRow.completed
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                  : 'hl-input text-slate-400 dark:text-slate-500 hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                              }`}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Clean Card Footer with Add/Remove Set & Completion Status */}
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddSet(ex)}
                        className="min-h-[40px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Set
                      </button>

                      {exSets.length > 1 && lastSet && (
                        <button
                          type="button"
                          onClick={() => onDeleteSet(lastSet.id)}
                          className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove Last
                        </button>
                      )}
                    </div>

                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {exSets.filter((s) => s.completed).length}/{exSets.length} completed
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Sidebar: Muscle Autoregulation & Health Connect Outbox */}
          <div className="xl:col-span-4 space-y-4">
            <div className="hl-card rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Session Finish &amp; Health Sync
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Package completed sets into an offline-first Health Connect / Google Fit
                  weightlifting session payload.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSyncWorkoutSession}
                className="w-full min-h-[46px] px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                Queue Session for Google Fit
              </button>
            </div>

            <div className="hl-card rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Biofeedback Autoregulation
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Rate pump and joint stress for today&apos;s muscle groups to guide next week&apos;s
                  set progressions.
                </p>
              </div>

              <div className="space-y-4 divide-y divide-slate-200 dark:divide-slate-800">
                {musclesTrainedToday.map((mId) => {
                  const dayKey = isStandaloneActive ? 0 : activeDay;
                  const fbKey = `${activeWeek}_${dayKey}_${mId}`;
                  const currentFb: MuscleAutoregulationFeedback = feedback[fbKey] ?? {
                    id: fbKey,
                    week: activeWeek,
                    dayNumber: dayKey,
                    muscleId: mId,
                    pump: 1,
                    jointPain: 0,
                    sorenessRecovery: 1,
                  };
                  const lm = landmarks[mId];

                  return (
                    <div key={mId} className="pt-3 first:pt-0 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {lm.shortName}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {currentFb.jointPain > 0
                            ? 'Hold/Reduce Sets'
                            : currentFb.pump >= 1 && currentFb.sorenessRecovery <= 1
                            ? '+1 Set Next Wk'
                            : 'Maintain Sets'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <label className="block">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Pump
                          </span>
                          <select
                            value={currentFb.pump}
                            onChange={(e) =>
                              onSaveFeedback({
                                ...currentFb,
                                pump: Number(e.target.value) as 0 | 1 | 2,
                              })
                            }
                            className="mt-1 w-full min-h-[40px] px-2 py-1 text-xs hl-input rounded-lg"
                          >
                            <option value={0}>Low Pump</option>
                            <option value={1}>Moderate Pump</option>
                            <option value={2}>Great Pump</option>
                          </select>
                        </label>

                        <label className="block">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Joint Stress
                          </span>
                          <select
                            value={currentFb.jointPain}
                            onChange={(e) =>
                              onSaveFeedback({
                                ...currentFb,
                                jointPain: Number(e.target.value) as 0 | 1 | 2,
                              })
                            }
                            className="mt-1 w-full min-h-[40px] px-2 py-1 text-xs hl-input rounded-lg"
                          >
                            <option value={0}>Zero Pain</option>
                            <option value={1}>Mild Tightness</option>
                            <option value={2}>Joint Pain</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

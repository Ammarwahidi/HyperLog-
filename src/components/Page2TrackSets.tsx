import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ActiveStandaloneSession,
  ActiveWorkoutRunState,
  DailyNutritionRecord,
  EquipmentType,
  ExerciseModality,
  ExercisePrescription,
  LibraryExercise,
  MajorMuscleGroup,
  MuscleAutoregulationFeedback,
  MuscleId,
  MuscleLandmark,
  SavedCustomMeal,
  SetLogEntry,
  WorkoutDayPlan,
  WorkoutHistoryRecord,
  WorkoutTemplate,
} from '../types/workout';
import { MESOCYCLE_WEEKS } from '../data/rpPlanData';
import { getMuscleMajorGroup } from '../data/exerciseCatalog';
import {
  MODALITY_FILTER_ORDER,
  resolveTemplateModality,
} from '../data/allInOneFitnessCatalog';
import {
  buildHistoryRecordFromSessionLogs,
  formatHumanDateLong,
  formatHumanDateShort,
  formatLocalDateISO,
  generateDateWorkoutPdfBlob,
  resolveSetLogDateISO,
  shareOrDownloadPdfBlob,
} from '../utils/workoutHistory';
import { ExercisePickerModal } from './ExercisePickerModal';
import { formatGlobalWorkoutClock } from './MinimizedWorkoutBar';
import { PastWorkoutExerciseDraft, WorkoutCalendar } from './WorkoutCalendar';
import {
  WorkoutHelpModal,
  WorkoutHelpTarget,
  buildHelpTargetFromDayPlan,
  buildHelpTargetFromTemplate,
} from './WorkoutHelpModal';
import {
  Activity,
  ArrowLeftRight,
  BellRing,
  BookOpen,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  FileText,
  Flame,
  Heart,
  HelpCircle,
  History,
  Minimize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  Smartphone,
  Square,
  Timer,
  Trash2,
  TrendingUp,
  Volume2,
  X,
} from 'lucide-react';
import { playTimerCompleteTone, playTimerSetTone } from '../utils/timerAudio';
import {
  LB_PER_KG,
  formatCleanNumberString,
  formatWeightForDisplay,
  parseDisplayWeightToKg,
  sanitizeOptionalRpe,
  sanitizeReps,
  sanitizeRir,
  sanitizeSetLogEntry,
  sanitizeWeightKg,
} from '../utils/setLogNumeric';
import {
  isRunningInAndroidStandaloneApk,
  triggerAndroidHaptic,
} from '../utils/nativeAndroidBridge';

interface Page2TrackSetsProps {
  activeWeek: number;
  onChangeWeek?: (week: number) => void;
  activeDay: number;
  userGreetingName?: string;
  hasSelectedWorkout?: boolean;
  onClearSelectedWorkout?: () => Promise<void> | void;
  onCancelWorkoutSession?: (discardLoggedSets: boolean) => Promise<void> | void;
  onSelectScheduleDay: (day: number) => Promise<void>;
  activeStandaloneSession: ActiveStandaloneSession | null;
  activeWorkoutRunState: ActiveWorkoutRunState | null;
  globalElapsedSeconds: number;
  onStartGlobalWorkout: () => Promise<void>;
  onTogglePauseGlobalWorkout: () => Promise<void>;
  onStopGlobalWorkoutTimer: () => Promise<void>;
  onMinimizeWorkout: () => void;
  onSubViewChange?: (view: 'log' | 'calendar') => void;
  onClearStandaloneSession: () => Promise<void>;
  onStartStandaloneTemplate: (template: WorkoutTemplate) => Promise<void>;
  onStartQuickWorkout: (customTitle?: string) => Promise<void>;
  onRepeatWorkout: (session: WorkoutHistoryRecord) => void;
  onAddExerciseToActiveWorkout: (exercise: LibraryExercise) => Promise<void>;
  onRemoveExerciseFromActiveWorkout: (exerciseId: string) => Promise<void>;
  onFinishActiveWorkout: (params: {
    durationMinutes?: number;
    notes?: string;
  }) => Promise<WorkoutHistoryRecord | null>;
  onCompleteWorkoutAndRedirect?: (
    record: WorkoutHistoryRecord,
    cardioMinutes: number
  ) => void;
  trackFocusNonce: number;
  plan: WorkoutDayPlan[];
  templates: WorkoutTemplate[];
  exerciseLibrary: LibraryExercise[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  setLogs: SetLogEntry[];
  workoutHistory: WorkoutHistoryRecord[];
  nutritionByDate: Record<string, DailyNutritionRecord>;
  feedback: Record<string, MuscleAutoregulationFeedback>;
  weightUnit: 'kg' | 'lb';
  streakDays?: number;
  bestStreakDays?: number;
  todayActive?: boolean;
  defaultRestSeconds?: number;
  defaultVibrateEnabled?: boolean;
  defaultSoundEnabled?: boolean;
  defaultAutoTimer?: boolean;
  onToggleWeightUnit: (unit: 'kg' | 'lb') => void;
  onUpsertSet: (entry: SetLogEntry, triggerSync?: boolean) => Promise<void>;
  onDeleteSet: (id: string) => Promise<void>;
  onSaveFeedback: (fb: MuscleAutoregulationFeedback) => Promise<void>;
  onSaveHistoryRecord: (record: WorkoutHistoryRecord) => Promise<void>;
  onLogPastWorkout: (params: {
    dateIso: string;
    title: string;
    durationMinutes?: number;
    notes?: string;
    exercises: PastWorkoutExerciseDraft[];
  }) => Promise<void>;
  onDeleteManualHistoryRecord: (recordId: string) => Promise<void>;
  onCreateCustomExercise?: (exercise: LibraryExercise) => Promise<void>;
  onStartCustomExerciseWorkout?: (
    exercise: LibraryExercise,
    customSessionTitle?: string
  ) => Promise<void>;
  savedCustomMeals?: SavedCustomMeal[];
  todayCalories?: number;
  targetCalories?: number;
  todayProteinG?: number;
  targetProteinG?: number;
  onQuickLogSavedMeal?: (meal: SavedCustomMeal) => Promise<void>;
  onJumpToAnatomy?: () => void;
  onJumpToWorkouts?: () => void;
  onJumpToWellnessSection?: (
    section: 'wellbeing' | 'breathing' | 'indian' | 'studio' | 'tools' | 'nutrition'
  ) => void;
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
    return {
      selectClasses:
        'bg-yellow-50 dark:bg-yellow-950/70 border-yellow-400 dark:border-yellow-500/80 text-yellow-900 dark:text-yellow-200 focus:ring-yellow-500',
      badgeLabel: '<1 RIR · High Fatigue',
      badgeClasses: 'text-yellow-700 dark:text-yellow-300',
    };
  }
  if (rir <= 3) {
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
  if (isRunningInAndroidStandaloneApk()) {
    triggerAndroidHaptic(Array.isArray(pattern) ? 'success' : 'tick');
    return true;
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return navigator.vibrate(pattern);
    }
  } catch {
    // Ignore restricted iframe / unsupported platform errors gracefully
  }
  return false;
}

const CARDIO_NAME_KEYWORDS = [
  'treadmill',
  'incline walk',
  'stationary',
  'assault',
  'spin bike',
  'cycling',
  'air bike',
  'rowing erg',
  'rower',
  'concept2',
  'stairmaster',
  'stair climb',
  'elliptical',
  'jump rope',
  'skipping',
  'sprint',
  'jogging',
  'running',
  'hiit',
  'liss',
  'zone 2',
  'cardio',
  'burpee',
  'mountain climber',
  'jumping jack',
  'high knees',
  'battle rope',
];

function isCardioExercise(
  ex: ExercisePrescription,
  exerciseLibrary: LibraryExercise[]
): boolean {
  const normName = ex.name.trim().toLowerCase();
  const matched = exerciseLibrary.find(
    (item) =>
      (ex.libraryExerciseId && item.id === ex.libraryExerciseId) ||
      item.name.trim().toLowerCase() === normName
  );
  if (
    matched &&
    (matched.modality === ExerciseModality.Cardio ||
      matched.equipment === EquipmentType.CardioMachine)
  ) {
    return true;
  }
  return CARDIO_NAME_KEYWORDS.some((kw) => normName.includes(kw));
}

function parseDefaultCardioSeconds(
  ex: ExercisePrescription,
  exerciseLibrary: LibraryExercise[]
): number {
  const normName = ex.name.trim().toLowerCase();
  const matched = exerciseLibrary.find(
    (item) =>
      (ex.libraryExerciseId && item.id === ex.libraryExerciseId) ||
      item.name.trim().toLowerCase() === normName
  );
  if (matched?.durationSeconds && matched.durationSeconds >= 120) {
    return Math.min(5400, matched.durationSeconds);
  }
  const repStr = (ex.repRange || '').toLowerCase();
  const minMatch = repStr.match(/(\d+)\s*min/);
  if (minMatch) {
    return Math.min(5400, Math.max(60, Number(minMatch[1]) * 60));
  }
  const secMatch = repStr.match(/(\d+)\s*s/);
  if (secMatch) {
    const secVal = Number(secMatch[1]);
    return secVal >= 120 ? Math.min(5400, secVal) : 600;
  }
  return 900; // Default 15:00 cardio timer
}

interface CardioExerciseTimerState {
  targetSec: number;
  remainingSec: number;
  elapsedSec: number;
  isRunning: boolean;
  intensityZone: string;
}

interface PreviousSetRef {
  weightKg: number;
  reps: number;
  rpe?: number;
}

interface NumericSetInputProps {
  value: number | '';
  allowDecimal?: boolean;
  maxDecimals?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  ariaLabel: string;
  title?: string;
  className: string;
  onDraftValueChange?: (val: number | undefined) => void;
  onCommitNumber: (val: number | undefined) => void;
}

const NumericSetInput: React.FC<NumericSetInputProps> = ({
  value,
  allowDecimal = false,
  maxDecimals = allowDecimal ? 2 : 0,
  min = 0,
  max,
  placeholder,
  ariaLabel,
  title,
  className,
  onDraftValueChange,
  onCommitNumber,
}) => {
  const [focused, setFocused] = useState(false);
  const formattedProp = formatCleanNumberString(value, maxDecimals);
  const [draft, setDraft] = useState<string>(formattedProp);

  useEffect(() => {
    if (!focused) {
      setDraft(formatCleanNumberString(value, maxDecimals));
    }
  }, [value, maxDecimals, focused]);

  const commitFinalString = (rawStr: string) => {
    const trimmed = rawStr.trim().replace(',', '.');
    if (trimmed === '' || trimmed === '.') {
      if (placeholder !== undefined) {
        setDraft('');
        onDraftValueChange?.(undefined);
        onCommitNumber(undefined);
      } else {
        const fallback = Math.max(min, typeof value === 'number' && Number.isFinite(value) ? value : min);
        const cleanFallback = Number(formatCleanNumberString(fallback, maxDecimals));
        setDraft(formatCleanNumberString(cleanFallback, maxDecimals));
        onDraftValueChange?.(cleanFallback);
        onCommitNumber(cleanFallback);
      }
      return;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      const clamped =
        max !== undefined ? Math.min(max, Math.max(min, parsed)) : Math.max(min, parsed);
      const factor = Math.pow(10, Math.max(0, maxDecimals));
      const clean = allowDecimal
        ? Math.round(clamped * factor) / factor
        : Math.round(clamped);
      setDraft(formatCleanNumberString(clean, maxDecimals));
      onDraftValueChange?.(clean);
      onCommitNumber(clean);
    }
  };

  return (
    <input
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      pattern={allowDecimal ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
      placeholder={placeholder}
      aria-label={ariaLabel}
      title={title}
      value={focused ? draft : formattedProp}
      onFocus={(e) => {
        const currentStr = formatCleanNumberString(value, maxDecimals);
        setFocused(true);
        setDraft(currentStr);
        e.currentTarget.select();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.');
        const validPattern = allowDecimal ? /^\d*\.?\d{0,3}$/ : /^\d*$/;
        if (!validPattern.test(raw)) return;
        setDraft(raw);
        if (raw === '') {
          if (placeholder !== undefined) {
            onDraftValueChange?.(undefined);
            onCommitNumber(undefined);
          }
          return;
        }
        if (raw.endsWith('.')) return;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        const withinBounds =
          parsed >= min && (max === undefined || parsed <= max);
        if (withinBounds) {
          const factor = Math.pow(10, Math.max(0, maxDecimals));
          const clean = allowDecimal
            ? Math.round(parsed * factor) / factor
            : Math.round(parsed);
          onDraftValueChange?.(clean);
          onCommitNumber(clean);
        }
      }}
      onBlur={() => {
        setFocused(false);
        commitFinalString(draft);
      }}
      className={className}
    />
  );
};

export const Page2TrackSets: React.FC<Page2TrackSetsProps> = ({
  activeWeek,
  activeDay,
  hasSelectedWorkout = true,
  onClearSelectedWorkout,
  onCancelWorkoutSession,
  onSelectScheduleDay,
  activeStandaloneSession,
  activeWorkoutRunState,
  globalElapsedSeconds,
  onStartGlobalWorkout,
  onTogglePauseGlobalWorkout,
  onStopGlobalWorkoutTimer,
  onMinimizeWorkout,
  onSubViewChange,
  onClearStandaloneSession,
  onStartStandaloneTemplate,
  onStartQuickWorkout,
  onRepeatWorkout,
  onAddExerciseToActiveWorkout,
  onRemoveExerciseFromActiveWorkout,
  onFinishActiveWorkout,
  onCompleteWorkoutAndRedirect,
  trackFocusNonce,
  plan,
  templates,
  exerciseLibrary,
  landmarks,
  setLogs,
  workoutHistory,
  nutritionByDate,
  feedback,
  weightUnit,
  streakDays = 0,
  bestStreakDays = 0,
  todayActive = false,
  defaultRestSeconds = 90,
  defaultVibrateEnabled = true,
  defaultSoundEnabled = true,
  defaultAutoTimer = true,
  onToggleWeightUnit,
  onUpsertSet,
  onDeleteSet,
  onSaveFeedback,
  onSaveHistoryRecord,
  onLogPastWorkout,
  onDeleteManualHistoryRecord,
  onCreateCustomExercise,
  onStartCustomExerciseWorkout,
  userGreetingName,
}) => {
  const [pageView, setPageView] = useState<'log' | 'calendar'>('log');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() =>
    formatLocalDateISO(new Date())
  );
  const [openCalendarPopupInitially, setOpenCalendarPopupInitially] = useState<boolean>(false);
  const [trackingMode, setTrackingMode] = useState<'schedule' | 'standalone'>(
    activeStandaloneSession ? 'standalone' : 'schedule'
  );

  // Progressive Disclosure state on the minimalist Tracker Home view
  const [isDeepAnalyticsOpen, setIsDeepAnalyticsOpen] = useState<boolean>(false);
  const [openAnalyticsAccordion, setOpenAnalyticsAccordion] = useState<'trends' | 'sets' | null>(
    null
  );
  const [selectedTrendExercise, setSelectedTrendExercise] = useState<string>('all');
  const [heartRateBpm, setHeartRateBpm] = useState<number>(() => {
    try {
      const saved = Number(window.localStorage.getItem('hyperlog_calm_bpm_checkin'));
      if (Number.isFinite(saved) && saved >= 42 && saved <= 195) {
        return Math.round(saved);
      }
    } catch {
      // Ignore storage access errors
    }
    return 68;
  });

  const adjustHeartRateBpm = useCallback((delta: number) => {
    setHeartRateBpm((prev) => {
      const next = Math.max(42, Math.min(195, prev + delta));
      try {
        window.localStorage.setItem('hyperlog_calm_bpm_checkin', String(next));
      } catch {
        // Ignore storage restrictions
      }
      return next;
    });
  }, []);

  // On-demand Custom Exercise & Custom Session drawer state (collapsed initially for cognitive calm)
  const [isCustomComposerOpen, setIsCustomComposerOpen] = useState<boolean>(false);
  const [customExName, setCustomExName] = useState<string>('');
  const [customExMuscle, setCustomExMuscle] = useState<MuscleId>(MuscleId.Chest);
  const [customExModality, setCustomExModality] = useState<
    Exclude<ExerciseModality, ExerciseModality.All>
  >(ExerciseModality.Strength);
  const [customExEquipment, setCustomExEquipment] = useState<
    Exclude<EquipmentType, EquipmentType.All>
  >(EquipmentType.Dumbbell);
  const [customExRepRange, setCustomExRepRange] = useState<string>('8–12');
  const [customExWeightInput, setCustomExWeightInput] = useState<string>('20');
  const [customHubToast, setCustomHubToast] = useState<string | null>(null);

  // Workout Switcher, Help Popup & Exercise Picker Modals
  const [isWorkoutSwitcherOpen, setIsWorkoutSwitcherOpen] = useState<boolean>(false);
  const [switcherTab, setSwitcherTab] = useState<'templates' | 'schedule' | 'empty'>('templates');
  const [switcherSearch, setSwitcherSearch] = useState<string>('');
  const [switcherModality, setSwitcherModality] = useState<ExerciseModality>(ExerciseModality.All);
  const [quickWorkoutTitle, setQuickWorkoutTitle] = useState<string>('Custom Workout');
  const [isAddExerciseOpen, setIsAddExerciseOpen] = useState<boolean>(false);
  const [workoutHelpTarget, setWorkoutHelpTarget] = useState<WorkoutHelpTarget | null>(null);
  const [historyModalExercise, setHistoryModalExercise] = useState<ExercisePrescription | null>(
    null
  );

  useEffect(() => {
    if (!historyModalExercise) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHistoryModalExercise(null);
      }
    };
    const handlePointerDownOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-testid="exercise-history-mini-modal"]')) return;
      if (target.closest('[data-testid^="exercise-history-btn-"]')) return;
      setHistoryModalExercise(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [historyModalExercise]);

  // Finish & Cancel Workout Session State
  const [isFinishModalOpen, setIsFinishModalOpen] = useState<boolean>(false);
  const [finishDurationInput, setFinishDurationInput] = useState<string>('50');
  const [finishNotesInput, setFinishNotesInput] = useState<string>('');
  const [isFinishing, setIsFinishing] = useState<boolean>(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState<boolean>(false);

  // Session Start Timestamp for Elapsed Duration Calculation
  const sessionStartMsRef = useRef<number>(Date.now());

  const [showTimerOptions, setShowTimerOptions] = useState<boolean>(false);
  const [showSessionFinishDrawer, setShowSessionFinishDrawer] = useState<boolean>(false);
  const [showActiveDayStrips, setShowActiveDayStrips] = useState<boolean>(false);
  const [showAdvancedRpe, setShowAdvancedRpe] = useState<boolean>(false);
  const [restDuration, setRestDuration] = useState<number>(defaultRestSeconds);
  const [userCustomRestSpecified, setUserCustomRestSpecified] = useState<boolean>(false);
  const [customRestInput, setCustomRestInput] = useState<string>(String(defaultRestSeconds));
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [activeTimerTarget, setActiveTimerTarget] = useState<number>(defaultRestSeconds);
  const [restExerciseName, setRestExerciseName] = useState<string>('');
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [autoTimerOnComplete, setAutoTimerOnComplete] = useState<boolean>(defaultAutoTimer);
  const [vibrateEnabled, setVibrateEnabled] = useState<boolean>(defaultVibrateEnabled);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(defaultSoundEnabled);
  const [timerCompletedAlert, setTimerCompletedAlert] = useState<string | null>(null);
  const [syncConfirmation, setSyncConfirmation] = useState<string | null>(null);

  // Set Checkoff Pop Animation + Framer Motion Exercise Set Toggle + Cardio Timer State
  const shouldReduceMotion = useReducedMotion();
  const [focusedExerciseId, setFocusedExerciseId] = useState<string>('all');
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<Record<string, boolean>>({});
  const [poppedSetId, setPoppedSetId] = useState<string | null>(null);
  const popTimeoutRef = useRef<number | null>(null);
  const [poppedCardById, setPoppedCardById] = useState<Record<string, 'expand' | 'collapse'>>({});
  const cardPopTimeoutRef = useRef<number | null>(null);
  const [cardioTimersByExId, setCardioTimersByExId] = useState<
    Record<string, CardioExerciseTimerState>
  >({});

  useEffect(() => {
    setFocusedExerciseId('all');
    setExpandedExerciseIds({});
    setPoppedCardById({});
    setHistoryModalExercise(null);
  }, [activeWeek, activeDay, activeStandaloneSession?.sessionId]);

  const toggleExpandedExercise = useCallback((exId: string) => {
    setExpandedExerciseIds((prev) => ({
      ...prev,
      [exId]: !prev[exId],
    }));
  }, []);

  const triggerCardExpandCollapsePop = useCallback(
    (targetIds: string[], direction: 'expand' | 'collapse') => {
      if (cardPopTimeoutRef.current !== null) {
        window.clearTimeout(cardPopTimeoutRef.current);
      }
      const nextMap: Record<string, 'expand' | 'collapse'> = {};
      for (const id of targetIds) {
        nextMap[id] = direction;
      }
      setPoppedCardById(nextMap);
      cardPopTimeoutRef.current = window.setTimeout(() => {
        setPoppedCardById({});
        cardPopTimeoutRef.current = null;
      }, 450);

      if (vibrateEnabledRef.current) {
        triggerDeviceVibration(direction === 'expand' ? 12 : 10);
      }
    },
    []
  );

  const triggerSetPopAndHaptic = useCallback(
    (targetId: string) => {
      if (popTimeoutRef.current !== null) {
        window.clearTimeout(popTimeoutRef.current);
      }
      setPoppedSetId(targetId);
      popTimeoutRef.current = window.setTimeout(() => {
        setPoppedSetId((curr) => (curr === targetId ? null : curr));
        popTimeoutRef.current = null;
      }, 240);

      if (vibrateEnabledRef.current) {
        triggerDeviceVibration([16, 22, 28]);
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      if (popTimeoutRef.current !== null) {
        window.clearTimeout(popTimeoutRef.current);
      }
      if (cardPopTimeoutRef.current !== null) {
        window.clearTimeout(cardPopTimeoutRef.current);
      }
    };
  }, []);

  const vibrateEnabledRef = useRef(vibrateEnabled);
  vibrateEnabledRef.current = vibrateEnabled;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const restExerciseRef = useRef(restExerciseName);
  restExerciseRef.current = restExerciseName;

  const supportsNativeVibrate =
    isRunningInAndroidStandaloneApk() ||
    (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function');

  useEffect(() => {
    setRestDuration(defaultRestSeconds);
    setCustomRestInput(String(defaultRestSeconds));
    setActiveTimerTarget(defaultRestSeconds);
  }, [defaultRestSeconds]);

  useEffect(() => {
    setVibrateEnabled(defaultVibrateEnabled);
  }, [defaultVibrateEnabled]);

  useEffect(() => {
    setSoundEnabled(defaultSoundEnabled);
  }, [defaultSoundEnabled]);

  useEffect(() => {
    setAutoTimerOnComplete(defaultAutoTimer);
  }, [defaultAutoTimer]);

  // Deterministically synchronize trackingMode & focus 'log' view whenever a workout is selected
  useEffect(() => {
    setIsCancelConfirmOpen(false);
    if (activeStandaloneSession) {
      setTrackingMode('standalone');
      const parsedStart = Date.parse(activeStandaloneSession.startedAt);
      sessionStartMsRef.current = Number.isNaN(parsedStart) ? Date.now() : parsedStart;
    } else {
      setTrackingMode('schedule');
      sessionStartMsRef.current = Date.now();
    }
  }, [activeStandaloneSession, activeDay]);

  useEffect(() => {
    if (trackFocusNonce > 0) {
      setPageView('log');
      setIsWorkoutSwitcherOpen(false);
    }
  }, [trackFocusNonce]);

  useEffect(() => {
    onSubViewChange?.(pageView);
  }, [pageView, onSubViewChange]);

  const fireRestElapsedFeedback = useCallback(() => {
    if (vibrateEnabledRef.current) {
      triggerDeviceVibration([280, 110, 280, 110, 420]);
    }
    if (soundEnabledRef.current) {
      playTimerCompleteTone(true);
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

  const anyCardioTimerRunning = useMemo(
    () => Object.values(cardioTimersByExId).some((t) => t.isRunning),
    [cardioTimersByExId]
  );

  useEffect(() => {
    if (!anyCardioTimerRunning) return;
    const intervalId = window.setInterval(() => {
      let finishedAny = false;
      setCardioTimersByExId((prev) => {
        const next: Record<string, CardioExerciseTimerState> = { ...prev };
        for (const [exId, st] of Object.entries(prev)) {
          if (!st.isRunning) continue;
          const nextElapsed = st.elapsedSec + 1;
          if (st.remainingSec <= 1) {
            finishedAny = true;
            next[exId] = {
              ...st,
              remainingSec: 0,
              elapsedSec: nextElapsed,
              isRunning: false,
            };
          } else {
            next[exId] = {
              ...st,
              remainingSec: st.remainingSec - 1,
              elapsedSec: nextElapsed,
            };
          }
        }
        return next;
      });
      if (finishedAny) {
        if (vibrateEnabledRef.current) {
          triggerDeviceVibration([220, 100, 260]);
        }
        if (soundEnabledRef.current) {
          playTimerCompleteTone(true);
        }
        setTimerCompletedAlert('Cardio timer target reached! Tap Complete Cardio to log duration.');
      }
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [anyCardioTimerRunning]);

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
    playTimerSetTone(soundEnabledRef.current);
  };

  const adjustRestTime = (deltaSec: number) => {
    setTimerCompletedAlert(null);
    setUserCustomRestSpecified(true);
    playTimerSetTone(soundEnabledRef.current);
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
    playTimerSetTone(soundEnabledRef.current);
  };

  const isStandaloneActive = trackingMode === 'standalone' && !!activeStandaloneSession;

  const currentDayPlan: WorkoutDayPlan = useMemo(() => {
    if (isStandaloneActive && activeStandaloneSession) {
      const focusMuscles = Array.from(
        new Set(
          activeStandaloneSession.exercises
            .map((e) => landmarks[e.primaryMuscle]?.shortName)
            .filter(Boolean)
        )
      ).join(', ');

      return {
        dayNumber: 0,
        title: activeStandaloneSession.templateName,
        focusSummary:
          focusMuscles || 'Custom / Template Workout · Credits weekly muscle volume',
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

  // Previous completed performance lookup per exercise (Strong / Hevy style "Prev" reference)
  const previousSetsByExerciseId = useMemo(() => {
    const activeIds = new Set<string>();
    for (const list of Object.values(setsByExercise)) {
      for (const s of list) activeIds.add(s.id);
    }

    // Group all historical completed sets by normalized exercise name
    const completedByNormName: Record<string, SetLogEntry[]> = {};
    for (const s of setLogs) {
      if (!s.completed || activeIds.has(s.id)) continue;
      const key = s.exerciseName.trim().toLowerCase();
      if (!key) continue;
      if (!completedByNormName[key]) completedByNormName[key] = [];
      completedByNormName[key].push(s);
    }

    const result: Record<string, PreviousSetRef[]> = {};
    for (const ex of currentDayPlan.exercises) {
      const key = ex.name.trim().toLowerCase();
      const candidates = completedByNormName[key];
      if (!candidates || candidates.length === 0) continue;

      // Sort most recent first (by completedAt, then completedDate, then week)
      const sorted = [...candidates].sort((a, b) => {
        const aTime = a.completedAt ?? a.completedDate ?? '';
        const bTime = b.completedAt ?? b.completedDate ?? '';
        if (aTime !== bTime) return aTime < bTime ? 1 : -1;
        return b.week - a.week;
      });

      const latestSessionRef = sorted[0];
      const latestDate = resolveSetLogDateISO(latestSessionRef);
      const sameSessionSets = sorted
        .filter((s) => {
          if (latestSessionRef.templateSessionId) {
            return s.templateSessionId === latestSessionRef.templateSessionId;
          }
          if (latestDate) {
            return (
              resolveSetLogDateISO(s) === latestDate &&
              s.dayNumber === latestSessionRef.dayNumber
            );
          }
          return s.week === latestSessionRef.week && s.dayNumber === latestSessionRef.dayNumber;
        })
        .sort((a, b) => a.setIndex - b.setIndex);

      if (sameSessionSets.length > 0) {
        result[ex.id] = sameSessionSets.map((s) => ({
          weightKg: s.weightKg,
          reps: s.reps,
          rpe: s.rpe,
        }));
      }
    }
    return result;
  }, [currentDayPlan.exercises, setLogs, setsByExercise]);

  // Previous 3 completed sets performed per exercise (for the Exercise History tooltip & mini-modal)
  const recentThreeSetsByExerciseId = useMemo(() => {
    const result: Record<string, SetLogEntry[]> = {};
    for (const ex of currentDayPlan.exercises) {
      const normName = ex.name.trim().toLowerCase();
      const matching = setLogs.filter((s) => {
        if (!s.completed) return false;
        if (s.exerciseId === ex.id) return true;
        if (ex.libraryExerciseId && s.exerciseId === ex.libraryExerciseId) return true;
        return s.exerciseName.trim().toLowerCase() === normName;
      });
      if (matching.length === 0) {
        result[ex.id] = [];
        continue;
      }

      const sortedNewestFirst = [...matching].sort((a, b) => {
        const aTime = a.completedAt ?? a.completedDate ?? '';
        const bTime = b.completedAt ?? b.completedDate ?? '';
        if (aTime !== bTime) return aTime < bTime ? 1 : -1;
        if (a.week !== b.week) return b.week - a.week;
        if (a.dayNumber !== b.dayNumber) return b.dayNumber - a.dayNumber;
        return b.setIndex - a.setIndex;
      });

      const topThree = sortedNewestFirst.slice(0, 3);
      const firstRef = topThree[0];
      const firstDate = resolveSetLogDateISO(firstRef);
      const allSameSession =
        topThree.length > 1 &&
        topThree.every((s) =>
          firstRef.templateSessionId
            ? s.templateSessionId === firstRef.templateSessionId
            : resolveSetLogDateISO(s) === firstDate &&
              s.week === firstRef.week &&
              s.dayNumber === firstRef.dayNumber
        );

      result[ex.id] = allSameSession
        ? [...topThree].sort((a, b) => a.setIndex - b.setIndex)
        : topThree;
    }
    return result;
  }, [currentDayPlan.exercises, setLogs]);

  const sessionStats = useMemo(() => {
    let total = 0;
    let completed = 0;
    let totalReps = 0;
    let tonnageKg = 0;
    for (const ex of currentDayPlan.exercises) {
      const list = setsByExercise[ex.id] ?? [];
      total += list.length;
      for (const s of list) {
        if (s.completed) {
          const safeReps = sanitizeReps(s.reps, 1);
          const safeWeightKg = sanitizeWeightKg(s.weightKg, 0);
          completed += 1;
          totalReps += safeReps;
          tonnageKg += safeWeightKg * safeReps;
        }
      }
    }
    return { total, completed, totalReps, tonnageKg };
  }, [currentDayPlan, setsByExercise]);

  // Live per-row numeric draft cache so blur + Log click or rapid multi-field edits never drop values
  const pendingRowDraftsRef = useRef<
    Record<
      string,
      {
        weightKg?: number;
        reps?: number;
        rir?: number;
        rpe?: number | null;
      }
    >
  >({});

  useEffect(() => {
    // Prune stale draft overrides once parent setLogs reflect the saved values
    for (const s of setLogs) {
      const pending = pendingRowDraftsRef.current[s.id];
      if (!pending) continue;
      const weightMatches =
        pending.weightKg === undefined || Math.abs(pending.weightKg - s.weightKg) < 0.0005;
      const repsMatches = pending.reps === undefined || pending.reps === s.reps;
      const rirMatches = pending.rir === undefined || pending.rir === s.rir;
      const rpeMatches =
        pending.rpe === undefined ||
        (pending.rpe === null ? s.rpe === undefined : pending.rpe === s.rpe);
      if (weightMatches && repsMatches && rirMatches && rpeMatches) {
        delete pendingRowDraftsRef.current[s.id];
      }
    }
  }, [setLogs]);

  const mergeRowWithPendingDraft = (
    baseRow: SetLogEntry,
    patch?: {
      weightKg?: number;
      reps?: number;
      rir?: number;
      rpe?: number | null;
    }
  ): SetLogEntry => {
    const existingDraft = pendingRowDraftsRef.current[baseRow.id] ?? {};
    const mergedDraft = patch ? { ...existingDraft, ...patch } : existingDraft;
    if (patch) {
      pendingRowDraftsRef.current[baseRow.id] = mergedDraft;
    }
    const resolvedRpe =
      mergedDraft.rpe !== undefined
        ? mergedDraft.rpe === null
          ? undefined
          : mergedDraft.rpe
        : baseRow.rpe;
    return sanitizeSetLogEntry({
      ...baseRow,
      weightKg: mergedDraft.weightKg !== undefined ? mergedDraft.weightKg : baseRow.weightKg,
      reps: mergedDraft.reps !== undefined ? mergedDraft.reps : baseRow.reps,
      rir: mergedDraft.rir !== undefined ? mergedDraft.rir : baseRow.rir,
      rpe: resolvedRpe,
    });
  };

  const formatWeightDisplay = (kg: number) => formatWeightForDisplay(kg, weightUnit);

  const parseWeightToKg = (inputVal: number) => parseDisplayWeightToKg(inputVal, weightUnit);

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
    const mergedEntry = mergeRowWithPendingDraft(entry);
    const nextCompleted = !mergedEntry.completed;
    const now = new Date();
    const sessionTitleLabel = currentDayPlan.title;

    if (nextCompleted) {
      triggerSetPopAndHaptic(entry.id);
    }

    await onUpsertSet(
      sanitizeSetLogEntry({
        ...mergedEntry,
        sessionTitle: mergedEntry.sessionTitle ?? sessionTitleLabel,
        completed: nextCompleted,
        completedAt: nextCompleted ? now.toISOString() : undefined,
        completedDate: nextCompleted ? formatLocalDateISO(now) : undefined,
      }),
      nextCompleted
    );
    if (nextCompleted) {
      if (autoTimerOnComplete) {
        const chosenRest = userCustomRestSpecified
          ? restDuration
          : mergedEntry.restSeconds ?? prescribedRestSec ?? restDuration;
        startRestCountdown(chosenRest, exerciseName);
      }
    }
  };

  const getOrInitCardioTimer = (ex: ExercisePrescription): CardioExerciseTimerState => {
    const existing = cardioTimersByExId[ex.id];
    if (existing) return existing;
    const defaultSec = parseDefaultCardioSeconds(ex, exerciseLibrary);
    return {
      targetSec: defaultSec,
      remainingSec: defaultSec,
      elapsedSec: 0,
      isRunning: false,
      intensityZone: 'Zone 2 Aerobic Base',
    };
  };

  const updateCardioTimer = (
    ex: ExercisePrescription,
    updater: (prev: CardioExerciseTimerState) => CardioExerciseTimerState
  ) => {
    setCardioTimersByExId((prev) => {
      const current = prev[ex.id] ?? getOrInitCardioTimer(ex);
      return {
        ...prev,
        [ex.id]: updater(current),
      };
    });
  };

  const handleCompleteCardioTimer = async (ex: ExercisePrescription) => {
    const timerState = getOrInitCardioTimer(ex);
    const exSets = setsByExercise[ex.id] ?? [];
    const primaryRow = exSets[0];
    const extraRows = exSets.slice(1);

    const loggedSeconds =
      timerState.elapsedSec >= 30 ? timerState.elapsedSec : timerState.targetSec;
    const loggedMinutes = Math.max(1, Math.round(loggedSeconds / 60));
    const now = new Date();
    const sessionId = isStandaloneActive ? activeStandaloneSession?.sessionId : undefined;
    const sessionTitleLabel = currentDayPlan.title;

    updateCardioTimer(ex, (st) => ({
      ...st,
      isRunning: false,
    }));

    const targetId =
      primaryRow?.id ??
      (sessionId
        ? `${sessionId}_${ex.id}_cardio`
        : `w${activeWeek}_d${activeDay}_${ex.id}_cardio`);

    triggerSetPopAndHaptic(targetId);
    if (soundEnabledRef.current) {
      playTimerCompleteTone(true);
    }

    const cardioEntry: SetLogEntry = sanitizeSetLogEntry({
      ...(primaryRow ?? {
        id: targetId,
        week: activeWeek,
        dayNumber: isStandaloneActive ? 0 : activeDay,
        templateSessionId: sessionId,
        exerciseId: ex.id,
        exerciseName: ex.name,
        muscleId: ex.muscleId,
        setIndex: 1,
        rir: 2,
      }),
      sessionTitle: primaryRow?.sessionTitle ?? sessionTitleLabel,
      weightKg: 0,
      reps: loggedMinutes,
      restSeconds: loggedSeconds,
      completed: true,
      completedAt: now.toISOString(),
      completedDate: formatLocalDateISO(now),
    });

    await onUpsertSet(cardioEntry, true);

    // Clean up any extra unused set rows generated for this cardio exercise so it counts cleanly as 1 timed cardio block
    for (const extra of extraRows) {
      if (!extra.completed) {
        await onDeleteSet(extra.id);
      }
    }
  };

  const handleQuickAddCardioExercise = async () => {
    const cardioLibEx =
      exerciseLibrary.find(
        (item) =>
          item.modality === ExerciseModality.Cardio ||
          item.equipment === EquipmentType.CardioMachine
      ) ?? {
        id: 'custom_zone2_treadmill_cardio',
        name: 'Zone 2 Incline Treadmill Cardio',
        majorGroup: MajorMuscleGroup.Legs,
        primaryMuscle: MuscleId.Quads,
        secondaryMuscles: [MuscleId.Glutes, MuscleId.Calves],
        equipment: EquipmentType.CardioMachine,
        modality: ExerciseModality.Cardio,
        level: 'Beginner' as const,
        durationSeconds: 900,
        description: 'Steady aerobic incline treadmill walk tracked by countdown timer.',
        instructions: [
          'Set incline to 8–12% and walk briskly at conversational nasal-breathing pace.',
          'Track total cardio duration using the built-in Cardio Timer.',
        ],
        defaultRepRange: '15 min',
        defaultRestSeconds: 30,
        defaultWeightKg: 0,
      };
    await onAddExerciseToActiveWorkout(cardioLibEx);
  };

  const handleApplyPreviousToExercise = async (
    ex: ExercisePrescription,
    prevList: PreviousSetRef[]
  ) => {
    const exSets = setsByExercise[ex.id] ?? [];
    for (let i = 0; i < exSets.length; i++) {
      const row = exSets[i];
      if (row.completed) continue;
      const ref = prevList[Math.min(i, prevList.length - 1)];
      if (!ref) continue;
      await onUpsertSet(
        {
          ...row,
          weightKg: ref.weightKg,
          reps: ref.reps,
        },
        false
      );
    }
  };

  const handleAddSet = async (ex: ExercisePrescription) => {
    const existing = setsByExercise[ex.id] ?? [];
    const last = existing[existing.length - 1];
    const prevList = previousSetsByExerciseId[ex.id];
    const prevFallback = prevList ? prevList[prevList.length - 1] : undefined;
    const nextIdx = existing.length + 1;
    const sessionId = isStandaloneActive ? activeStandaloneSession?.sessionId : undefined;
    const sessionTitleLabel = currentDayPlan.title;

    const newEntry: SetLogEntry = {
      id: sessionId
        ? `${sessionId}_${ex.id}_s${nextIdx}_${Date.now()}`
        : `w${activeWeek}_d${activeDay}_${ex.id}_s${nextIdx}_${Date.now()}`,
      week: activeWeek,
      dayNumber: isStandaloneActive ? 0 : activeDay,
      templateSessionId: sessionId,
      sessionTitle: sessionTitleLabel,
      exerciseId: ex.id,
      exerciseName: ex.name,
      muscleId: ex.muscleId,
      setIndex: nextIdx,
      weightKg: last ? last.weightKg : prevFallback?.weightKg ?? ex.defaultWeightKg,
      reps: last ? last.reps : prevFallback?.reps ?? 10,
      rir: last ? last.rir : weekMeta.defaultRirNumber,
      rpe: last?.rpe,
      restSeconds: ex.restSeconds ?? restDuration,
      completed: false,
    };
    await onUpsertSet(newEntry, false);
  };

  const handleOpenFinishModal = () => {
    if (activeWorkoutRunState?.isActive) {
      const globalMin = Math.max(1, Math.min(480, Math.round(globalElapsedSeconds / 60) || 1));
      setFinishDurationInput(String(globalMin));
    } else {
      const elapsedMin = Math.max(
        10,
        Math.min(240, Math.round((Date.now() - sessionStartMsRef.current) / 60000) || 45)
      );
      setFinishDurationInput(String(elapsedMin === 10 ? 45 : elapsedMin));
    }
    setFinishNotesInput('');
    setIsFinishModalOpen(true);
  };

  const loggedCardioMinutes = useMemo(() => {
    let mins = 0;
    for (const ex of currentDayPlan.exercises) {
      if (!isCardioExercise(ex, exerciseLibrary)) continue;
      const exSets = setsByExercise[ex.id] ?? [];
      for (const s of exSets) {
        if (s.completed) {
          mins += Math.max(1, sanitizeReps(s.reps, 15));
        }
      }
      const timerSt = cardioTimersByExId[ex.id];
      if (exSets.every((s) => !s.completed) && timerSt && timerSt.elapsedSec >= 60) {
        mins += Math.round(timerSt.elapsedSec / 60);
      }
    }
    return mins;
  }, [currentDayPlan.exercises, exerciseLibrary, setsByExercise, cardioTimersByExId]);

  const handleDirectWorkoutComplete = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      // Ensure at least 1 set/cardio block is marked complete so Workout Complete always saves & redirects cleanly
      if (sessionStats.completed === 0 && currentDayPlan.exercises.length > 0) {
        const firstEx = currentDayPlan.exercises[0];
        if (isCardioExercise(firstEx, exerciseLibrary)) {
          await handleCompleteCardioTimer(firstEx);
        } else {
          const firstRow = (setsByExercise[firstEx.id] ?? [])[0];
          if (firstRow) {
            const now = new Date();
            await onUpsertSet(
              sanitizeSetLogEntry({
                ...mergeRowWithPendingDraft(firstRow),
                completed: true,
                completedAt: now.toISOString(),
                completedDate: formatLocalDateISO(now),
              }),
              true
            );
          }
        }
      }

      const elapsedMin = activeWorkoutRunState?.isActive
        ? Math.max(1, Math.min(480, Math.round(globalElapsedSeconds / 60) || 1))
        : Math.max(
            15,
            Math.min(240, Math.round((Date.now() - sessionStartMsRef.current) / 60000) || 42)
          );

      const savedRecord = await onFinishActiveWorkout({
        durationMinutes: elapsedMin,
      });

      if (savedRecord) {
        if (vibrateEnabledRef.current) {
          triggerDeviceVibration([24, 30, 48]);
        }
        if (soundEnabledRef.current) {
          playTimerCompleteTone(true);
        }
        onCompleteWorkoutAndRedirect?.(savedRecord, loggedCardioMinutes);
      }
    } finally {
      setIsFinishing(false);
    }
  };

  const handleConfirmFinishWorkout = async (alsoSharePdf: boolean) => {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      const parsedDur = Number(finishDurationInput);
      const savedRecord = await onFinishActiveWorkout({
        durationMinutes:
          finishDurationInput.trim() !== '' && !Number.isNaN(parsedDur) && parsedDur > 0
            ? Math.min(480, Math.round(parsedDur))
            : undefined,
        notes: finishNotesInput.trim() || undefined,
      });
      setIsFinishModalOpen(false);

      if (savedRecord) {
        if (alsoSharePdf) {
          const pdfBlob = generateDateWorkoutPdfBlob({
            dateIso: savedRecord.date,
            sessions: [savedRecord],
            landmarks,
            weightUnit,
            nutritionRecord: nutritionByDate[savedRecord.date],
          });
          const filename = `hyperlog-workout-${savedRecord.date}.pdf`;
          await shareOrDownloadPdfBlob({
            blob: pdfBlob,
            filename,
            title: `HyperLog Workout PDF · ${formatHumanDateShort(savedRecord.date)}`,
            text: `${savedRecord.title} (${formatHumanDateLong(savedRecord.date)})`,
          });
        }
        if (onCompleteWorkoutAndRedirect) {
          onCompleteWorkoutAndRedirect(savedRecord, loggedCardioMinutes);
        } else {
          setSyncConfirmation(
            `Saved "${savedRecord.title}" (${savedRecord.totalSets} sets) to your Workout Calendar.`
          );
          window.setTimeout(() => setSyncConfirmation(null), 4500);
        }
      }
    } finally {
      setIsFinishing(false);
    }
  };



  const handleShareActiveSessionPdf = async () => {
    const completedSessionLogs: SetLogEntry[] = [];
    for (const ex of currentDayPlan.exercises) {
      const list = setsByExercise[ex.id] ?? [];
      for (const s of list) {
        if (s.completed) completedSessionLogs.push(s);
      }
    }
    if (completedSessionLogs.length === 0) {
      setSyncConfirmation('Complete at least 1 set first to generate a session PDF.');
      window.setTimeout(() => setSyncConfirmation(null), 3500);
      return;
    }

    const todayDateIso = formatLocalDateISO(new Date());
    const tempRecord = buildHistoryRecordFromSessionLogs({
      sessionId: `active_${todayDateIso}`,
      dateIso: todayDateIso,
      logs: completedSessionLogs,
      plan,
      landmarks,
      activeStandaloneSession,
    });

    const pdfBlob = generateDateWorkoutPdfBlob({
      dateIso: todayDateIso,
      sessions: [tempRecord],
      landmarks,
      weightUnit,
      nutritionRecord: nutritionByDate[todayDateIso],
    });
    const filename = `hyperlog-workout-${todayDateIso}.pdf`;
    const outcome = await shareOrDownloadPdfBlob({
      blob: pdfBlob,
      filename,
      title: `HyperLog Workout PDF · ${formatHumanDateShort(todayDateIso)}`,
      text: `${tempRecord.title} (${formatHumanDateLong(todayDateIso)})`,
    });

    if (outcome !== 'cancelled') {
      setSyncConfirmation(
        outcome === 'shared'
          ? `Shared ${filename}`
          : `Downloaded ${filename} ready to share`
      );
      window.setTimeout(() => setSyncConfirmation(null), 4000);
    }
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
      ? Math.max(
          0,
          Math.min(100, Math.round((restSecondsLeft / Math.max(1, activeTimerTarget)) * 100))
        )
      : 0;

  const workoutSetsByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of setLogs) {
      if (!log.completed) continue;
      const dIso = resolveSetLogDateISO(log);
      if (dIso) {
        counts[dIso] = (counts[dIso] ?? 0) + 1;
      }
    }
    for (const hist of workoutHistory) {
      if (hist.isManualEntry && hist.totalSets > 0 && !counts[hist.date]) {
        counts[hist.date] = hist.totalSets;
      }
    }
    return counts;
  }, [setLogs, workoutHistory]);

  const totalHighlightedDays = useMemo(
    () => Object.keys(workoutSetsByDate).length,
    [workoutSetsByDate]
  );

  const recent7CalendarDays = useMemo(() => {
    const shortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const items: Array<{
      iso: string;
      dayLabel: string;
      dayNum: number;
      setsDone: number;
      isToday: boolean;
    }> = [];
    for (let offset = -6; offset <= 0; offset++) {
      const dt = new Date();
      dt.setDate(dt.getDate() + offset);
      const iso = formatLocalDateISO(dt);
      items.push({
        iso,
        dayLabel: shortNames[dt.getDay()],
        dayNum: dt.getDate(),
        setsDone: workoutSetsByDate[iso] ?? 0,
        isToday: offset === 0,
      });
    }
    return items;
  }, [workoutSetsByDate]);

  const openSwitcher = (tab: 'templates' | 'schedule' | 'empty' = 'templates') => {
    setSwitcherTab(tab);
    setIsWorkoutSwitcherOpen(true);
  };

  const customExercises = useMemo(
    () =>
      exerciseLibrary.filter(
        (ex) => Boolean(ex.isCustom) || ex.id.startsWith('lib_custom_')
      ),
    [exerciseLibrary]
  );

  const customTemplates = useMemo(
    () => templates.filter((tpl) => tpl.category === 'Custom'),
    [templates]
  );

  const weeklyCompletedTotalSets = useMemo(
    () =>
      (Object.values(weeklySetsByMuscle) as number[]).reduce(
        (sum, val) => sum + (Number.isFinite(val) ? val : 0),
        0
      ),
    [weeklySetsByMuscle]
  );

  const warmGreetingText = useMemo(() => {
    const hour = new Date().getHours();
    const salutation =
      hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName = (userGreetingName ?? '').trim().split(/\s+/)[0];
    return firstName ? `${salutation}, ${firstName}` : salutation;
  }, [userGreetingName]);

  const scheduledDayPlan = useMemo(
    () => plan.find((d) => d.dayNumber === activeDay) ?? plan[0],
    [plan, activeDay]
  );

  const todayProgressSummary = useMemo(() => {
    const todayIso = formatLocalDateISO(new Date());
    const plannedSetsFromSchedule = scheduledDayPlan.isRestDay
      ? 10
      : Math.max(
          1,
          scheduledDayPlan.exercises.reduce(
            (sum, ex) => sum + Math.max(1, ex.weekSets[activeWeek] ?? 3),
            0
          )
        );

    let todayStrengthSets = 0;
    let todayCardioMinutes = 0;
    let todayCompletedSets = 0;

    for (const s of setLogs) {
      if (!s.completed) continue;
      const logDate = resolveSetLogDateISO(s);
      const isTodayLog =
        logDate === todayIso ||
        (!logDate && !s.templateSessionId && s.week === activeWeek && s.dayNumber === activeDay);
      if (!isTodayLog) continue;

      todayCompletedSets += 1;
      const libMatch = exerciseLibrary.find(
        (item) =>
          item.id === s.exerciseId ||
          item.name.trim().toLowerCase() === s.exerciseName.trim().toLowerCase()
      );
      const isCardioRow =
        libMatch?.modality === ExerciseModality.Cardio ||
        libMatch?.equipment === EquipmentType.CardioMachine ||
        CARDIO_NAME_KEYWORDS.some((kw) => s.exerciseName.toLowerCase().includes(kw));

      if (isCardioRow && s.weightKg === 0) {
        todayCardioMinutes += Math.max(1, sanitizeReps(s.reps, 15));
      } else {
        todayStrengthSets += 1;
      }
    }

    for (const hist of workoutHistory) {
      if (hist.date === todayIso && hist.isManualEntry && todayCompletedSets === 0) {
        todayCompletedSets += hist.totalSets;
        todayStrengthSets += hist.totalSets;
      }
    }

    const targetSets = Math.max(plannedSetsFromSchedule, todayCompletedSets || 1);
    const completionPct = Math.min(
      100,
      Math.round((todayCompletedSets / Math.max(1, targetSets)) * 100)
    );
    const activeCaloriesKcal = Math.round(todayStrengthSets * 16.5 + todayCardioMinutes * 8.5);

    const statusHeadline =
      completionPct === 0
        ? 'Ready when you are'
        : completionPct < 50
        ? 'Warming into your rhythm'
        : completionPct < 100
        ? 'Steady, unhurried progress'
        : "Today's movement complete";

    const statusSubcopy =
      completionPct === 0
        ? 'Start gently and take today one calm, focused set at a time.'
        : completionPct < 100
        ? `${todayCompletedSets} of ${targetSets} planned sets logged today.`
        : 'Wonderful consistency today. Hydrate well and let your muscles recover.';

    return {
      todayCompletedSets,
      targetSets,
      completionPct,
      activeCaloriesKcal,
      statusHeadline,
      statusSubcopy,
    };
  }, [scheduledDayPlan, activeWeek, activeDay, setLogs, exerciseLibrary, workoutHistory]);

  const strengthTrendAnalytics = useMemo(() => {
    const completedStrength = setLogs.filter((s) => {
      if (!s.completed) return false;
      const lower = s.exerciseName.toLowerCase();
      return !CARDIO_NAME_KEYWORDS.some((kw) => lower.includes(kw)) || s.weightKg > 0;
    });

    let dumbbellPeakKg = 0;
    let totalWeightSumKg = 0;
    let weightedCount = 0;
    let weeklyTonnageKg = 0;
    const exerciseMap = new Map<string, { name: string; isDumbbell: boolean; count: number }>();

    for (const s of completedStrength) {
      const safeW = sanitizeWeightKg(s.weightKg, 0);
      const safeReps = sanitizeReps(s.reps, 1);
      if (s.week === activeWeek) {
        weeklyTonnageKg += safeW * safeReps;
      }
      if (safeW > 0) {
        totalWeightSumKg += safeW;
        weightedCount += 1;
      }

      const libEx = exerciseLibrary.find(
        (item) =>
          item.id === s.exerciseId ||
          item.name.trim().toLowerCase() === s.exerciseName.trim().toLowerCase()
      );
      const isDumbbell =
        libEx?.equipment === EquipmentType.Dumbbell ||
        /\bdumbbell|\bdb\b/i.test(s.exerciseName);

      if (isDumbbell && safeW > dumbbellPeakKg) {
        dumbbellPeakKg = safeW;
      }

      const normKey = s.exerciseName.trim();
      if (normKey) {
        const prev = exerciseMap.get(normKey);
        exerciseMap.set(normKey, {
          name: normKey,
          isDumbbell: Boolean(prev?.isDumbbell || isDumbbell),
          count: (prev?.count ?? 0) + 1,
        });
      }
    }

    if (dumbbellPeakKg === 0 && completedStrength.length > 0) {
      dumbbellPeakKg = Math.max(
        0,
        ...completedStrength.map((s) => sanitizeWeightKg(s.weightKg, 0))
      );
    }

    const avgWorkingLoadKg = weightedCount > 0 ? totalWeightSumKg / weightedCount : 0;

    const exerciseOptions = Array.from(exerciseMap.values()).sort((a, b) => {
      if (a.isDumbbell !== b.isDumbbell) return a.isDumbbell ? -1 : 1;
      return b.count - a.count;
    });

    const filteredForChart =
      selectedTrendExercise === 'all'
        ? completedStrength
        : completedStrength.filter((s) => s.exerciseName.trim() === selectedTrendExercise);

    const chronological = [...filteredForChart]
      .sort((a, b) => {
        const aTime = a.completedAt ?? a.completedDate ?? '';
        const bTime = b.completedAt ?? b.completedDate ?? '';
        if (aTime !== bTime) return aTime < bTime ? -1 : 1;
        return a.setIndex - b.setIndex;
      })
      .slice(-8);

    const points = chronological.map((entry, idx) => {
      const rawDate = resolveSetLogDateISO(entry);
      const shortDate = rawDate ? rawDate.slice(5).replace('-', '/') : `S${idx + 1}`;
      return {
        id: entry.id,
        label: shortDate,
        weightKg: sanitizeWeightKg(entry.weightKg, 0),
        reps: sanitizeReps(entry.reps, 1),
        exerciseName: entry.exerciseName,
      };
    });

    return {
      dumbbellPeakKg,
      avgWorkingLoadKg,
      weeklyTonnageKg,
      exerciseOptions,
      points,
    };
  }, [setLogs, activeWeek, exerciseLibrary, selectedTrendExercise]);

  const handleSaveCustomExerciseFromHub = async (startImmediately: boolean) => {
    const cleanName = customExName.trim();
    if (!cleanName) return;

    const isTimed =
      customExModality === ExerciseModality.Yoga ||
      customExModality === ExerciseModality.Stretching;
    const rawDisplayWeight = Math.max(0, Number(customExWeightInput) || 0);
    const defaultWeightKg =
      isTimed ||
      customExEquipment === EquipmentType.Bodyweight ||
      customExEquipment === EquipmentType.Mat
        ? 0
        : parseDisplayWeightToKg(rawDisplayWeight, weightUnit);

    const created: LibraryExercise = {
      id: `lib_custom_${Date.now()}`,
      name: cleanName,
      majorGroup: getMuscleMajorGroup(customExMuscle),
      primaryMuscle: customExMuscle,
      secondaryMuscles: [],
      equipment: customExEquipment,
      modality: customExModality,
      level: 'Beginner',
      durationSeconds: isTimed ? 60 : undefined,
      description: `Custom ${customExModality} exercise targeting ${
        landmarks[customExMuscle]?.name ?? customExMuscle
      }.`,
      instructions: [
        'Brace your core and set a stable posture before initiating each repetition.',
        'Control the eccentric phase smoothly and drive with intent through your target range of motion.',
      ],
      defaultRepRange: customExRepRange.trim() || (isTimed ? '60s' : '8–12'),
      defaultRestSeconds: isTimed ? 30 : defaultRestSeconds || 90,
      defaultWeightKg,
      isCustom: true,
    };

    if (onCreateCustomExercise) {
      await onCreateCustomExercise(created);
    }

    setCustomExName('');
    setIsCustomComposerOpen(false);

    if (startImmediately) {
      if (onStartCustomExerciseWorkout) {
        await onStartCustomExerciseWorkout(created, `${created.name} Session`);
      } else {
        await onStartQuickWorkout(`${created.name} Session`);
        await onAddExerciseToActiveWorkout(created);
      }
      return;
    }

    setCustomHubToast(`Saved "${created.name}" to your Custom Exercises.`);
    window.setTimeout(() => setCustomHubToast(null), 3500);
  };

  const executeCancelWorkout = async (discardLoggedSets: boolean) => {
    setIsCancelConfirmOpen(false);
    if (onCancelWorkoutSession) {
      await onCancelWorkoutSession(discardLoggedSets);
      return;
    }
    if (onClearSelectedWorkout) {
      await onClearSelectedWorkout();
      return;
    }
    await onClearStandaloneSession();
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Calm, Progressive-Disclosure Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div data-testid="tracker-warm-greeting">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            {pageView === 'calendar'
              ? 'Workout Calendar'
              : !hasSelectedWorkout
              ? warmGreetingText
              : 'Track Workout'}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            <span>
              {pageView === 'calendar'
                ? 'Select any date to review sessions or log a past workout.'
                : !hasSelectedWorkout
                ? 'Move at your own pace today. Every steady set counts.'
                : 'Check off each set as you finish — or pause anytime to rest.'}
            </span>
            {(hasSelectedWorkout || pageView === 'calendar') && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCalendarDate(formatLocalDateISO(new Date()));
                    setOpenCalendarPopupInitially(true);
                    setPageView('calendar');
                  }}
                  className="no-touch-delay inline-flex items-center gap-1 font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-300 hover:underline"
                >
                  <Flame className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {streakDays}d streak{todayActive ? ' (logged today)' : ''}
                  </span>
                </button>
                {bestStreakDays > streakDays && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                      Best {bestStreakDays}d
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Primary View Mode: Today | Calendar */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
            <button
              type="button"
              onClick={() => setPageView('log')}
              className={`no-touch-delay min-h-[38px] px-3.5 py-1 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                pageView === 'log'
                  ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setPageView('calendar')}
              className={`no-touch-delay min-h-[38px] px-3.5 py-1 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                pageView === 'calendar'
                  ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
              {totalHighlightedDays > 0 && (
                <span className="font-mono tabular-nums text-[11px] text-sky-600 dark:text-sky-400">
                  ({totalHighlightedDays})
                </span>
              )}
            </button>
          </div>

          {/* Calm Unit Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
            {(['kg', 'lb'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => onToggleWeightUnit(u)}
                className={`no-touch-delay min-h-[38px] px-2.5 py-1 text-xs font-semibold rounded-xl uppercase transition-colors ${
                  weightUnit === u
                    ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pageView === 'calendar' ? (
        <WorkoutCalendar
          initialSelectedDateIso={selectedCalendarDate}
          openPopupInitially={openCalendarPopupInitially}
          onPopupConsumed={() => setOpenCalendarPopupInitially(false)}
          onSelectDateIso={setSelectedCalendarDate}
          setLogs={setLogs}
          workoutHistory={workoutHistory}
          plan={plan}
          templates={templates}
          exerciseLibrary={exerciseLibrary}
          landmarks={landmarks}
          nutritionByDate={nutritionByDate}
          weightUnit={weightUnit}
          streakDays={streakDays}
          bestStreakDays={bestStreakDays}
          activeStandaloneSession={activeStandaloneSession}
          onSaveHistoryRecord={onSaveHistoryRecord}
          onLogPastWorkout={onLogPastWorkout}
          onDeleteManualHistoryRecord={onDeleteManualHistoryRecord}
          onCreateCustomExercise={onCreateCustomExercise}
          onReturnToLiveTracker={() => setPageView('log')}
          onRepeatWorkout={(session) => {
            onRepeatWorkout(session);
            setPageView('log');
          }}
        />
      ) : (
        <>
          {!hasSelectedWorkout ? (
            /* MINIMALIST PROGRESSIVE-DISCLOSURE HOME SCREEN (ZERO REDUNDANCY, CALM PALETTE) */
            <div
              data-testid="tracker-workout-launchpad"
              className="max-w-3xl mx-auto w-full space-y-5 py-2 sm:py-4"
            >
              {/* 1. SINGLE LARGE CIRCULAR PROGRESS CARD */}
              <section
                data-testid="daily-workout-progress-card"
                className="hl-card rounded-3xl p-6 sm:p-10 bg-slate-50/90 dark:bg-slate-900/75 border border-slate-200/80 dark:border-slate-800 text-center space-y-7"
              >
                <div className="space-y-1">
                  <p className="text-xs font-medium text-sky-700 dark:text-sky-300">
                    Today&apos;s Workout Progress
                  </p>
                  <h2 className="text-lg sm:text-xl font-semibold text-slate-800 dark:text-slate-100">
                    {todayProgressSummary.statusHeadline}
                  </h2>
                </div>

                {/* Friendly Pale-Blue & Soft-Mint Circular Progress Ring */}
                <div
                  data-testid="daily-completion-ring"
                  className="relative w-52 h-52 sm:w-60 sm:h-60 mx-auto flex items-center justify-center"
                >
                  {(() => {
                    const radius = 88;
                    const circumference = 2 * Math.PI * radius;
                    const strokeOffset =
                      circumference - (todayProgressSummary.completionPct / 100) * circumference;
                    return (
                      <svg
                        viewBox="0 0 220 220"
                        className="w-full h-full -rotate-90"
                        role="img"
                        aria-label={`Today's workout completion: ${todayProgressSummary.completionPct} percent`}
                      >
                        <defs>
                          <linearGradient
                            id="calmDailyProgressGradient"
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="100%"
                          >
                            <stop offset="0%" stopColor="#93C5FD" />
                            <stop offset="52%" stopColor="#60A5FA" />
                            <stop offset="100%" stopColor="#6EE7B7" />
                          </linearGradient>
                        </defs>
                        {/* Soft low-stress track */}
                        <circle
                          cx="110"
                          cy="110"
                          r={radius}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="14"
                          className="text-slate-200/85 dark:text-slate-800"
                        />
                        {/* Pale-blue to mint completion arc */}
                        <circle
                          cx="110"
                          cy="110"
                          r={radius}
                          fill="none"
                          stroke="url(#calmDailyProgressGradient)"
                          strokeWidth="14"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeOffset}
                          className="transition-all duration-500 ease-out"
                        />
                      </svg>
                    );
                  })()}

                  <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
                    <span
                      data-testid="daily-completion-percentage"
                      className="text-4xl sm:text-5xl font-bold tracking-tight font-mono tabular-nums text-slate-800 dark:text-slate-100"
                    >
                      {todayProgressSummary.completionPct}%
                    </span>
                    <span className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Daily completion
                    </span>
                  </div>
                </div>

                {/* Calm Supporting Copy & Primary Workout Action */}
                <div className="max-w-md mx-auto space-y-5">
                  <div className="space-y-1">
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {todayProgressSummary.statusSubcopy}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500">
                      Day {activeDay} · {scheduledDayPlan.title}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-1">
                    <button
                      type="button"
                      data-testid="quick-open-day-sets-btn"
                      onClick={() => onSelectScheduleDay(activeDay)}
                      className="no-touch-delay min-h-[48px] px-6 py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Play className="w-4 h-4 shrink-0" />
                      <span>
                        {todayProgressSummary.todayCompletedSets > 0
                          ? "Continue Today's Workout"
                          : "Start Today's Workout"}
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="toggle-custom-exercise-composer-btn"
                      aria-expanded={isCustomComposerOpen}
                      onClick={() => setIsCustomComposerOpen((prev) => !prev)}
                      className="no-touch-delay min-h-[48px] px-5 py-3 rounded-2xl bg-white/90 hover:bg-white dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                      <span>
                        {isCustomComposerOpen ? 'Hide Custom Session' : 'Custom Exercise'}
                      </span>
                    </button>
                  </div>
                </div>
              </section>

              {/* ON-DEMAND CUSTOM EXERCISE & QUICK SESSION DRAWER (Hidden until requested) */}
              <AnimatePresence initial={false}>
                {isCustomComposerOpen && (
                  <motion.section
                    key="custom-exercise-drawer"
                    data-testid="custom-exercise-hub"
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="hl-card rounded-3xl p-5 sm:p-6 bg-slate-50/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                          Custom Exercise &amp; Session Studio
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Add a personal movement or launch an open session at your own pace.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAddExerciseOpen(true)}
                        className="no-touch-delay min-h-[42px] px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-sky-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Dumbbell className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                        <span>Browse Library</span>
                      </button>
                    </div>

                    {customHubToast && (
                      <div className="p-3 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>{customHubToast}</span>
                      </div>
                    )}

                    {/* Quick Open Session Starter */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <input
                        type="text"
                        value={quickWorkoutTitle}
                        onChange={(e) => setQuickWorkoutTitle(e.target.value)}
                        placeholder="Session name (e.g., Calm Upper Body)"
                        aria-label="Custom workout name"
                        className="flex-1 min-h-[46px] px-3.5 py-2 text-xs sm:text-sm hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        data-testid="launchpad-start-empty-btn"
                        onClick={async () => {
                          await onStartQuickWorkout(quickWorkoutTitle.trim() || 'Custom Workout');
                          setIsAddExerciseOpen(true);
                        }}
                        className="no-touch-delay min-h-[46px] px-5 py-2.5 bg-slate-800 hover:bg-slate-700 dark:bg-sky-600 dark:hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                      >
                        <Play className="w-4 h-4 shrink-0" />
                        <span>Start Open Session</span>
                      </button>
                    </div>

                    {/* Inline Custom Exercise Form */}
                    <form
                      data-testid="inline-custom-exercise-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleSaveCustomExerciseFromHub(false);
                      }}
                      className="p-4 rounded-2xl bg-white/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-3.5"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        <div className="sm:col-span-2 lg:col-span-1 space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                            Exercise Name
                          </label>
                          <input
                            type="text"
                            required
                            value={customExName}
                            onChange={(e) => setCustomExName(e.target.value)}
                            placeholder="e.g., Cable Wrist Pronation"
                            className="w-full min-h-[44px] px-3 py-2 text-xs sm:text-sm hl-input rounded-xl"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                            Target Muscle
                          </label>
                          <select
                            value={customExMuscle}
                            onChange={(e) => setCustomExMuscle(e.target.value as MuscleId)}
                            aria-label="Custom exercise target muscle"
                            className="w-full min-h-[44px] px-3 py-2 text-xs sm:text-sm hl-input rounded-xl"
                          >
                            {Object.values(landmarks).map((lm) => (
                              <option key={lm.id} value={lm.id}>
                                {lm.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                            Equipment
                          </label>
                          <select
                            value={customExEquipment}
                            onChange={(e) =>
                              setCustomExEquipment(
                                e.target.value as Exclude<EquipmentType, EquipmentType.All>
                              )
                            }
                            aria-label="Custom exercise equipment"
                            className="w-full min-h-[44px] px-3 py-2 text-xs sm:text-sm hl-input rounded-xl"
                          >
                            {Object.values(EquipmentType)
                              .filter((eq) => eq !== EquipmentType.All)
                              .map((eq) => (
                                <option key={eq} value={eq}>
                                  {eq}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                            Discipline
                          </label>
                          <select
                            value={customExModality}
                            onChange={(e) => {
                              const nextMod = e.target.value as Exclude<
                                ExerciseModality,
                                ExerciseModality.All
                              >;
                              setCustomExModality(nextMod);
                              if (
                                nextMod === ExerciseModality.Yoga ||
                                nextMod === ExerciseModality.Stretching
                              ) {
                                setCustomExRepRange('60s');
                              } else if (customExRepRange === '60s') {
                                setCustomExRepRange('8–12');
                              }
                            }}
                            aria-label="Custom exercise discipline"
                            className="w-full min-h-[44px] px-3 py-2 text-xs sm:text-sm hl-input rounded-xl"
                          >
                            <option value={ExerciseModality.Strength}>Strength &amp; Hypertrophy</option>
                            <option value={ExerciseModality.Cardio}>Cardio &amp; Mobility Pace</option>
                            <option value={ExerciseModality.Yoga}>Yoga</option>
                            <option value={ExerciseModality.Stretching}>Stretching &amp; Mobility</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                            Target Reps or Duration
                          </label>
                          <input
                            type="text"
                            value={customExRepRange}
                            onChange={(e) => setCustomExRepRange(e.target.value)}
                            placeholder="8–12 or 60s"
                            className="w-full min-h-[44px] px-3 py-2 text-xs sm:text-sm font-mono tabular-nums hl-input rounded-xl"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                            Default Load ({weightUnit})
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.5"
                            value={customExWeightInput}
                            onChange={(e) => setCustomExWeightInput(e.target.value)}
                            className="w-full min-h-[44px] px-3 py-2 text-xs sm:text-sm font-mono tabular-nums hl-input rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                        <button
                          type="submit"
                          disabled={!customExName.trim()}
                          className="no-touch-delay min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-700 dark:hover:bg-slate-600 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                        >
                          Save Custom Exercise
                        </button>
                        <button
                          type="button"
                          disabled={!customExName.trim()}
                          onClick={() => void handleSaveCustomExerciseFromHub(true)}
                          className="no-touch-delay min-h-[44px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5 shrink-0" />
                          <span>Save &amp; Begin</span>
                        </button>
                      </div>
                    </form>
                  </motion.section>
                )}
              </AnimatePresence>

              {/* Saved Custom Exercises Quick Row (Shown quietly only if user created custom exercises) */}
              {customExercises.length > 0 && (
                <div className="hl-card rounded-2xl p-4 bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      Your Saved Custom Exercises
                    </span>
                    <span className="font-mono tabular-nums">{customExercises.length} saved</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {customExercises.map((ex) => (
                      <div
                        key={ex.id}
                        data-testid={`custom-exercise-card-${ex.id}`}
                        className="p-3 rounded-xl bg-white/85 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {ex.name}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                            {ex.equipment} · {landmarks[ex.primaryMuscle]?.shortName ?? ex.primaryMuscle}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (onStartCustomExerciseWorkout) {
                              await onStartCustomExerciseWorkout(ex, `${ex.name} Workout`);
                            } else {
                              await onStartQuickWorkout(`${ex.name} Workout`);
                              await onAddExerciseToActiveWorkout(ex);
                            }
                          }}
                          className="no-touch-delay min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <Play className="w-3 h-3 shrink-0" />
                          <span>Start</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {customTemplates.length > 0 && (
                <div className="hl-card rounded-2xl p-4 bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      Your Custom Routines
                    </span>
                    <span className="font-mono tabular-nums">{customTemplates.length} saved</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {customTemplates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="p-3 rounded-xl bg-white/85 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-2.5"
                      >
                        <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {tpl.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => void onStartStandaloneTemplate(tpl)}
                          className="no-touch-delay min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 dark:bg-sky-600 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                        >
                          Start
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. PROGRESSIVE DISCLOSURE TOGGLE: "VIEW DEEP ANALYTICS" */}
              <div className="space-y-3">
                <button
                  type="button"
                  data-testid="toggle-deep-analytics-btn"
                  aria-expanded={isDeepAnalyticsOpen}
                  aria-controls="deep-analytics-region"
                  onClick={() => setIsDeepAnalyticsOpen((prev) => !prev)}
                  className="no-touch-delay w-full min-h-[54px] px-5 py-3.5 rounded-2xl hl-card bg-slate-50/95 hover:bg-slate-100/90 dark:bg-slate-900/75 dark:hover:bg-slate-800/80 border border-slate-200/85 dark:border-slate-800 flex items-center justify-between gap-3 text-left transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-sky-100/80 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
                      <Activity className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {isDeepAnalyticsOpen ? 'Hide Deep Analytics' : 'View Deep Analytics'}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                        Active calories · Heart rate · Total sets lifted &amp; strength trends
                      </span>
                    </div>
                  </div>
                  <span className="text-slate-500 dark:text-slate-400 shrink-0">
                    {isDeepAnalyticsOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>

                {/* 3. EXPANDABLE DEEP ANALYTICS SHEET / ACCORDION */}
                <AnimatePresence initial={false}>
                  {isDeepAnalyticsOpen && (
                    <motion.section
                      id="deep-analytics-region"
                      key="deep-analytics-sheet"
                      data-testid="deep-analytics-panel"
                      initial={
                        shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
                      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                      className="hl-card rounded-3xl p-5 sm:p-7 bg-slate-50/95 dark:bg-slate-900/85 border border-slate-200/85 dark:border-slate-800 space-y-6"
                    >
                      {/* Subtle Bottom-Sheet Handle Affordance */}
                      <div
                        aria-hidden="true"
                        className="w-10 h-1 rounded-full bg-slate-300/80 dark:bg-slate-700 mx-auto"
                      />

                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                          Today&apos;s Secondary Wellness &amp; Strength Snapshot
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Calm, high-level signals so you can check your effort without data fatigue.
                        </p>
                      </div>

                      {/* Secondary Metrics Strip: Active Calories, Heart Rate, Total Sets Lifted */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800 rounded-2xl bg-white/85 dark:bg-slate-800/55 border border-slate-200/80 dark:border-slate-700/80">
                        {/* Metric 1: Active Calories */}
                        <div
                          data-testid="metric-active-calories"
                          className="p-4 sm:p-5 space-y-1.5"
                        >
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <Flame className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
                            <span>Active Calories</span>
                          </div>
                          <div className="text-2xl font-bold font-mono tabular-nums text-slate-800 dark:text-slate-100">
                            {todayProgressSummary.activeCaloriesKcal.toLocaleString()}{' '}
                            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                              kcal
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            Estimated from today&apos;s logged sets &amp; steady cardio
                          </p>
                        </div>

                        {/* Metric 2: Heart Rate */}
                        <div data-testid="metric-heart-rate" className="p-4 sm:p-5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                              <Heart className="w-4 h-4 text-teal-500 dark:text-teal-400 shrink-0" />
                              <span>Heart Rate</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => adjustHeartRateBpm(-2)}
                                aria-label="Decrease heart rate check-in"
                                className="no-touch-delay min-h-[28px] min-w-[28px] rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => adjustHeartRateBpm(2)}
                                aria-label="Increase heart rate check-in"
                                className="no-touch-delay min-h-[28px] min-w-[28px] rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <div className="text-2xl font-bold font-mono tabular-nums text-slate-800 dark:text-slate-100">
                            {heartRateBpm}{' '}
                            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                              bpm
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {heartRateBpm <= 75
                              ? 'Rested recovery zone · Ready for steady effort'
                              : heartRateBpm <= 125
                              ? 'Warm aerobic rhythm · Comfortable breathing pace'
                              : 'Active training zone · Take full recovery breaths'}
                          </p>
                        </div>

                        {/* Metric 3: Total Sets Lifted */}
                        <div
                          data-testid="metric-total-sets-lifted"
                          className="p-4 sm:p-5 space-y-1.5"
                        >
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <Dumbbell className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                            <span>Total Sets Lifted</span>
                          </div>
                          <div className="text-2xl font-bold font-mono tabular-nums text-slate-800 dark:text-slate-100">
                            {todayProgressSummary.todayCompletedSets}{' '}
                            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                              today · {weeklyCompletedTotalSets} wk
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            Controlled sets completed across Week {activeWeek}
                          </p>
                        </div>
                      </div>

                      {/* Expandable Strength Analytics Accordions (Hiding Complex Graphs by Default) */}
                      <div className="space-y-2.5">
                        {/* Accordion 1: Dumbbell & Strength Weight Trends */}
                        <div
                          data-testid="analytics-accordion-weight-trends"
                          className="rounded-2xl bg-white/85 dark:bg-slate-800/55 border border-slate-200/80 dark:border-slate-700/80 overflow-hidden"
                        >
                          <button
                            type="button"
                            data-testid="analytics-toggle-weight-trends"
                            aria-expanded={openAnalyticsAccordion === 'trends'}
                            onClick={() =>
                              setOpenAnalyticsAccordion((prev) =>
                                prev === 'trends' ? null : 'trends'
                              )
                            }
                            className="no-touch-delay w-full min-h-[54px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/90 dark:hover:bg-slate-800/80 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <TrendingUp className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                              <div className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  Dumbbell &amp; Strength Weight Trends
                                </span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                                  Working load curve, peak dumbbell weight &amp; weekly tonnage
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                {strengthTrendAnalytics.dumbbellPeakKg > 0
                                  ? `${formatWeightDisplay(strengthTrendAnalytics.dumbbellPeakKg)} ${weightUnit}`
                                  : `0 ${weightUnit}`}
                              </span>
                              {openAnalyticsAccordion === 'trends' ? (
                                <ChevronUp className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          </button>

                          {openAnalyticsAccordion === 'trends' && (
                            <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-slate-200/75 dark:border-slate-700/75 space-y-4">
                              <div className="grid grid-cols-3 gap-3 text-xs">
                                <div>
                                  <span className="text-slate-500 dark:text-slate-400 block">
                                    Dumbbell Peak
                                  </span>
                                  <span className="font-mono tabular-nums text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                                    {formatWeightDisplay(strengthTrendAnalytics.dumbbellPeakKg)}{' '}
                                    {weightUnit}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500 dark:text-slate-400 block">
                                    Avg Working Load
                                  </span>
                                  <span className="font-mono tabular-nums text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                                    {formatWeightDisplay(strengthTrendAnalytics.avgWorkingLoadKg)}{' '}
                                    {weightUnit}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500 dark:text-slate-400 block">
                                    Week {activeWeek} Volume
                                  </span>
                                  <span className="font-mono tabular-nums text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                                    {weightUnit === 'kg'
                                      ? `${Math.round(strengthTrendAnalytics.weeklyTonnageKg).toLocaleString()} kg`
                                      : `${Math.round(strengthTrendAnalytics.weeklyTonnageKg * LB_PER_KG).toLocaleString()} lb`}
                                  </span>
                                </div>
                              </div>

                              {strengthTrendAnalytics.exerciseOptions.length > 1 && (
                                <div className="flex items-center justify-between gap-2">
                                  <label
                                    htmlFor="trend-exercise-filter"
                                    className="text-xs font-medium text-slate-600 dark:text-slate-300"
                                  >
                                    Movement filter
                                  </label>
                                  <select
                                    id="trend-exercise-filter"
                                    value={selectedTrendExercise}
                                    onChange={(e) => setSelectedTrendExercise(e.target.value)}
                                    className="min-h-[38px] px-3 py-1.5 text-xs hl-input rounded-xl"
                                  >
                                    <option value="all">All Logged Movements</option>
                                    {strengthTrendAnalytics.exerciseOptions.map((opt) => (
                                      <option key={opt.name} value={opt.name}>
                                        {opt.name} ({opt.count})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {strengthTrendAnalytics.points.length === 0 ? (
                                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 text-center space-y-2">
                                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                    Your strength curve starts with your first logged set. Once you
                                    check off dumbbell or barbell sets, your progression line will
                                    appear softly here.
                                  </p>
                                </div>
                              ) : (
                                <div
                                  data-testid="dumbbell-weight-trend-svg"
                                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 space-y-2"
                                >
                                  {(() => {
                                    const pts = strengthTrendAnalytics.points;
                                    const maxW = Math.max(
                                      1,
                                      ...pts.map((p) => Number(formatWeightDisplay(p.weightKg)) || 0)
                                    );
                                    const minW = Math.min(
                                      ...pts.map((p) => Number(formatWeightDisplay(p.weightKg)) || 0)
                                    );
                                    const span = Math.max(5, maxW - minW);
                                    const coords = pts.map((p, idx) => {
                                      const val = Number(formatWeightDisplay(p.weightKg)) || 0;
                                      const x =
                                        pts.length === 1
                                          ? 160
                                          : 24 + (idx / (pts.length - 1)) * 272;
                                      const y = 92 - ((val - minW) / span) * 64;
                                      return { ...p, val, x, y };
                                    });
                                    const polyline = coords
                                      .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
                                      .join(' ');

                                    return (
                                      <>
                                        <svg
                                          viewBox="0 0 320 116"
                                          className="w-full h-32"
                                          role="img"
                                          aria-label="Strength load progression trend"
                                        >
                                          {[28, 60, 92].map((gy) => (
                                            <line
                                              key={gy}
                                              x1="18"
                                              y1={gy}
                                              x2="302"
                                              y2={gy}
                                              stroke="currentColor"
                                              strokeDasharray="3 3"
                                              className="text-slate-200 dark:text-slate-800"
                                            />
                                          ))}
                                          {coords.length > 1 && (
                                            <polyline
                                              fill="none"
                                              stroke="#60A5FA"
                                              strokeWidth="3"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              points={polyline}
                                            />
                                          )}
                                          {coords.map((c) => (
                                            <g key={c.id}>
                                              <circle
                                                cx={c.x}
                                                cy={c.y}
                                                r="4.5"
                                                fill="#34D399"
                                                stroke="#FFFFFF"
                                                strokeWidth="1.5"
                                              />
                                              <text
                                                x={c.x}
                                                y={110}
                                                textAnchor="middle"
                                                className="fill-slate-400 text-[9px] font-mono"
                                              >
                                                {c.label}
                                              </text>
                                            </g>
                                          ))}
                                        </svg>
                                        <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 text-right">
                                          Latest: {coords[coords.length - 1].val} {weightUnit} ×{' '}
                                          {coords[coords.length - 1].reps} reps
                                        </p>
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Accordion 2: Sets Completed & 7-Day Rhythm */}
                        <div
                          data-testid="analytics-accordion-sets-breakdown"
                          className="rounded-2xl bg-white/85 dark:bg-slate-800/55 border border-slate-200/80 dark:border-slate-700/80 overflow-hidden"
                        >
                          <button
                            type="button"
                            data-testid="analytics-toggle-sets-breakdown"
                            aria-expanded={openAnalyticsAccordion === 'sets'}
                            onClick={() =>
                              setOpenAnalyticsAccordion((prev) => (prev === 'sets' ? null : 'sets'))
                            }
                            className="no-touch-delay w-full min-h-[54px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/90 dark:hover:bg-slate-800/80 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Check className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                              <div className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  Sets Completed &amp; 7-Day Rhythm
                                </span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                                  Daily consistency bars and gentle muscle group balance
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                {weeklyCompletedTotalSets} sets wk
                              </span>
                              {openAnalyticsAccordion === 'sets' ? (
                                <ChevronUp className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          </button>

                          {openAnalyticsAccordion === 'sets' && (
                            <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-slate-200/75 dark:border-slate-700/75 space-y-4">
                              <div className="grid grid-cols-7 gap-1.5">
                                {recent7CalendarDays.map((d) => {
                                  const maxSets = Math.max(
                                    6,
                                    ...recent7CalendarDays.map((item) => item.setsDone)
                                  );
                                  const barPct =
                                    d.setsDone > 0
                                      ? Math.max(18, Math.round((d.setsDone / maxSets) * 100))
                                      : 8;
                                  return (
                                    <button
                                      key={d.iso}
                                      type="button"
                                      onClick={() => {
                                        setSelectedCalendarDate(d.iso);
                                        setOpenCalendarPopupInitially(true);
                                        setPageView('calendar');
                                      }}
                                      className="no-touch-delay min-h-[68px] p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-800 flex flex-col items-center justify-end gap-1 transition-colors"
                                    >
                                      <div className="w-full h-8 flex items-end justify-center">
                                        <div
                                          className={`w-3 rounded-full transition-all ${
                                            d.setsDone > 0
                                              ? 'bg-teal-400 dark:bg-teal-500'
                                              : 'bg-slate-200 dark:bg-slate-700'
                                          }`}
                                          style={{ height: `${barPct}%` }}
                                        />
                                      </div>
                                      <span className="font-mono tabular-nums text-[10px] font-semibold text-slate-700 dark:text-slate-200 leading-none">
                                        {d.setsDone}
                                      </span>
                                      <span className="text-[10px] text-slate-400 leading-none">
                                        {d.isToday ? 'Today' : d.dayLabel}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                {Object.values(landmarks)
                                  .slice(0, 4)
                                  .map((lm) => {
                                    const done = weeklySetsByMuscle[lm.id] ?? 0;
                                    const pct = Math.min(
                                      100,
                                      Math.round((done / Math.max(1, lm.mavMax)) * 100)
                                    );
                                    return (
                                      <div
                                        key={lm.id}
                                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 space-y-1.5"
                                      >
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
                                            {lm.shortName}
                                          </span>
                                          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                            {done}/{lm.mavMax}
                                          </span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                                          <div
                                            className={`h-full rounded-full ${
                                              done >= lm.mavMin
                                                ? 'bg-teal-400 dark:bg-teal-500'
                                                : 'bg-sky-400 dark:bg-sky-500'
                                            }`}
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <>
              {/* Progressive Disclosure: Switch Day or View 7-Day Streak (Collapsed by Default) */}
              <div className="hl-card rounded-2xl p-3 sm:px-4 sm:py-3 space-y-3">
                <button
                  type="button"
                  data-testid="toggle-active-day-strip-btn"
                  aria-expanded={showActiveDayStrips}
                  onClick={() => setShowActiveDayStrips((prev) => !prev)}
                  className="no-touch-delay w-full min-h-[42px] flex items-center justify-between gap-2 text-left text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CalendarIcon className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {showActiveDayStrips
                        ? 'Hide Day Switcher & 7-Day Streak'
                        : 'Switch Day or View 7-Day Streak'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span>
                      {isStandaloneActive ? 'Custom' : `Day ${activeDay}`} · {streakDays}d streak
                    </span>
                    {showActiveDayStrips ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </button>

                {showActiveDayStrips && (
                  <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        Recent 7 Days
                      </span>
                      <button
                        type="button"
                        onClick={() => setPageView('calendar')}
                        className="no-touch-delay text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
                      >
                        Open Calendar &amp; Share PDF
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1.5">
                      {recent7CalendarDays.map((d) => {
                        const active = d.setsDone > 0;
                        return (
                          <button
                            key={d.iso}
                            type="button"
                            onClick={() => {
                              setSelectedCalendarDate(d.iso);
                              setOpenCalendarPopupInitially(true);
                              setPageView('calendar');
                            }}
                            className={`no-touch-delay min-h-[48px] py-1.5 px-1 rounded-xl border flex flex-col items-center justify-center transition-colors ${
                              active
                                ? 'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500/50 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/25'
                                : d.isToday
                                ? 'hl-subtle border-sky-500 dark:border-sky-400 text-slate-900 dark:text-white'
                                : 'hl-subtle border-transparent text-slate-600 dark:text-slate-400 hover:border-slate-400'
                            }`}
                            title={`Open ${d.iso} day pop-up on Calendar`}
                          >
                            <span className="text-[10px] font-medium leading-none">
                              {d.isToday ? 'Today' : d.dayLabel}
                            </span>
                            <span className="font-mono tabular-nums text-xs sm:text-sm font-bold mt-1 leading-none flex items-center gap-0.5">
                              <span>{d.dayNum}</span>
                              {active && (
                                <Check
                                  className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0"
                                  strokeWidth={2.6}
                                />
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {!isStandaloneActive && (
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                        {plan.map((d) => {
                          const isSelected = d.dayNumber === activeDay;
                          const dayLogs = setLogs.filter(
                            (s) =>
                              !s.templateSessionId &&
                              s.week === activeWeek &&
                              s.dayNumber === d.dayNumber
                          );
                          const doneCount = dayLogs.filter((s) => s.completed).length;

                          return (
                            <button
                              key={d.dayNumber}
                              type="button"
                              onClick={() => onSelectScheduleDay(d.dayNumber)}
                              className={`no-touch-delay min-h-[50px] px-3.5 py-2 rounded-xl border text-left transition-colors shrink-0 ${
                                isSelected
                                  ? 'bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-500'
                                  : 'hl-card text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600'
                              }`}
                            >
                              <div className="text-xs font-bold whitespace-nowrap">
                                Day {d.dayNumber} {d.isRestDay ? '· Rest' : ''}
                              </div>
                              <div
                                className={`text-[11px] font-mono tabular-nums mt-0.5 whitespace-nowrap ${
                                  isSelected
                                    ? 'text-slate-200 dark:text-sky-100'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {d.isRestDay ? 'Recovery' : `${doneCount}/${dayLogs.length} sets`}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Active Workout Session Control Bar with Calm End / Switch Option */}
              <div className="space-y-2.5">
                <div className="hl-card rounded-2xl px-4 py-4 space-y-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <span>
                          {isStandaloneActive ? 'Active Session' : 'Today\u2019s Routine'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() =>
                            setWorkoutHelpTarget(
                              buildHelpTargetFromDayPlan(
                                currentDayPlan,
                                activeWeek,
                                weekMeta.targetRir
                              )
                            )
                          }
                          className="no-touch-delay inline-flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
                        >
                          <BookOpen className="w-3.5 h-3.5 shrink-0" />
                          <span>Exercise Form Guide</span>
                        </button>
                      </div>
                      <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate mt-0.5">
                        {currentDayPlan.title}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 min-w-0 sm:shrink-0">
                      <button
                        type="button"
                        onClick={() => openSwitcher('templates')}
                        className="no-touch-delay min-h-[44px] px-3.5 py-2 text-xs font-semibold hl-subtle border text-slate-800 dark:text-slate-100 hover:border-sky-500 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        <span>Switch Workout</span>
                      </button>

                      {/* Calm Stop / End Session Button */}
                      <button
                        type="button"
                        data-testid="cancel-workout-session-btn"
                        aria-expanded={isCancelConfirmOpen}
                        onClick={() => setIsCancelConfirmOpen((prev) => !prev)}
                        className="no-touch-delay min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-xl border border-amber-300/90 dark:border-amber-700/80 bg-amber-50/80 dark:bg-amber-950/35 text-amber-800 dark:text-amber-200 hover:bg-amber-100/80 dark:hover:bg-amber-900/45 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                        <span>End or Switch</span>
                      </button>
                    </div>
                  </div>

                  {/* Calm Inline End / Switch Confirmation Panel */}
                  {isCancelConfirmOpen && (
                    <div
                      data-testid="cancel-workout-confirm-panel"
                      className="p-4 rounded-xl bg-slate-50/95 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          Step away from &ldquo;{currentDayPlan.title}&rdquo;?
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          You can keep the sets you&apos;ve already logged today, or clear today&apos;s session and return to your home card.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          data-testid="confirm-switch-keep-sets-btn"
                          onClick={() => void executeCancelWorkout(false)}
                          className="no-touch-delay min-h-[44px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          <span>Switch Activity (Keep Logged Sets)</span>
                        </button>

                        <button
                          type="button"
                          data-testid="confirm-cancel-discard-sets-btn"
                          onClick={() => void executeCancelWorkout(true)}
                          className="no-touch-delay min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Clear Session &amp; Return Home</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsCancelConfirmOpen(false)}
                          className="no-touch-delay min-h-[44px] px-3.5 py-2 rounded-xl hl-card border text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
                        >
                          Continue Workout
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Global Workout Timer & Cross-Page Minimize Controls */}
                  {!currentDayPlan.isRestDay && (
                    <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
                      {activeWorkoutRunState?.isActive ? (
                        <>
                          <div className="flex items-center gap-2 min-w-0 font-mono tabular-nums">
                            <Timer className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span
                              data-testid="global-workout-timer-display"
                              className={`text-sm sm:text-base font-bold ${
                                activeWorkoutRunState.isPaused
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {formatGlobalWorkoutClock(globalElapsedSeconds)}
                            </span>
                            <span className="font-sans text-xs text-slate-500 dark:text-slate-400 truncate">
                              · {activeWorkoutRunState.isPaused ? 'Paused' : 'Session Timer'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={onTogglePauseGlobalWorkout}
                              className="no-touch-delay min-h-[42px] px-3 py-1.5 text-xs font-semibold hl-subtle border text-slate-800 dark:text-slate-100 hover:border-slate-400 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                            >
                              {activeWorkoutRunState.isPaused ? (
                                <>
                                  <Play className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  <span>Resume</span>
                                </>
                              ) : (
                                <>
                                  <Pause className="w-3.5 h-3.5" />
                                  <span>Pause</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={onMinimizeWorkout}
                              className="no-touch-delay min-h-[42px] px-3 py-1.5 text-xs font-semibold hl-subtle border text-slate-800 dark:text-slate-100 hover:border-sky-500 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                              title="Minimize workout tracker and browse other pages"
                            >
                              <Minimize2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                              <span>Minimize</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleDirectWorkoutComplete}
                              disabled={isFinishing}
                              className="no-touch-delay min-h-[42px] px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Finish Workout</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Check off sets at your own pace, or start a gentle session timer if you&apos;d like.
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={onStartGlobalWorkout}
                              className="no-touch-delay min-h-[44px] px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Start Timer</span>
                            </button>
                            {sessionStats.completed > 0 && (
                              <button
                                type="button"
                                onClick={handleDirectWorkoutComplete}
                                disabled={isFinishing}
                                className="no-touch-delay min-h-[44px] px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Finish Workout</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

          {/* Clean Compact Session Summary + Rest Timer Bar */}
          {!currentDayPlan.isRestDay && (
            <div className="hl-card rounded-2xl p-4 space-y-3.5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Session Progress Info */}
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {currentDayPlan.focusSummary}
                  </p>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5 font-mono tabular-nums">
                    <strong className="text-slate-900 dark:text-white">
                      {sessionStats.completed} of {sessionStats.total}
                    </strong>{' '}
                    sets done
                    {sessionStats.tonnageKg > 0 && (
                      <>
                        {' · '}
                        {weightUnit === 'kg'
                          ? `${Math.round(sessionStats.tonnageKg).toLocaleString()} kg`
                          : `${Math.round(sessionStats.tonnageKg * LB_PER_KG).toLocaleString()} lb`}{' '}
                        lifted
                      </>
                    )}
                  </p>
                </div>

                {/* Clean Inline Timer Controls + Options Toggle */}
                <div className="flex flex-wrap items-center gap-2 min-w-0 md:shrink-0">
                  <div
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border transition-colors ${
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
                      className="no-touch-delay min-h-[38px] min-w-[34px] flex items-center justify-center rounded-lg text-xs font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                      title="Subtract 15 seconds"
                      aria-label="Subtract 15 seconds from rest timer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <span className="font-mono tabular-nums text-base font-bold text-slate-900 dark:text-white min-w-[50px] text-center">
                      {formatTimer(displayedTimerSec)}
                    </span>

                    <button
                      type="button"
                      onClick={() => adjustRestTime(15)}
                      className="no-touch-delay min-h-[38px] min-w-[34px] flex items-center justify-center rounded-lg text-xs font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
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
                          playTimerSetTone(soundEnabledRef.current);
                        } else {
                          startRestCountdown(restDuration);
                        }
                      }}
                      className="no-touch-delay min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-900 dark:bg-sky-600 text-white hover:opacity-90 transition-opacity"
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
                      className="no-touch-delay min-h-[38px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                      aria-label="Reset rest timer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    data-testid="toggle-timer-effort-options-btn"
                    onClick={() => setShowTimerOptions((v) => !v)}
                    className={`no-touch-delay min-h-[42px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      showTimerOptions
                        ? 'bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-500'
                        : 'hl-subtle text-slate-700 dark:text-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Timer &amp; Effort Options</span>
                    {showTimerOptions ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Live Timer Progress Bar when Active */}
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
                      className="h-full bg-sky-600 dark:bg-sky-500 transition-all duration-200"
                      style={{ width: `${timerProgressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Collapsible Timer Presets, Vibration Controls & Plain-English Effort Guide */}
              {showTimerOptions && (
                <div className="pt-3.5 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-500 dark:text-slate-400 font-medium mr-1">
                        Rest Presets:
                      </span>
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
                            playTimerSetTone(soundEnabledRef.current);
                          }}
                          className={`no-touch-delay min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-lg border transition-colors whitespace-nowrap ${
                            restDuration === sec
                              ? 'border-sky-600 dark:border-sky-400 bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}

                      <div className="flex items-center gap-1 hl-subtle border rounded-lg px-2 min-h-[36px]">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={customRestInput}
                          onChange={(e) => setCustomRestInput(e.target.value.replace(/\D/g, ''))}
                          onBlur={handleCommitCustomSeconds}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCommitCustomSeconds();
                            }
                          }}
                          aria-label="Custom rest time in seconds"
                          className="w-12 bg-transparent text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white focus:outline-none text-center hl-num-input"
                        />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">sec</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          playTimerSetTone(true);
                          setTimerCompletedAlert('Timer set audio tone played.');
                        }}
                        className="no-touch-delay min-h-[36px] px-2.5 py-1 rounded-lg hl-subtle border text-slate-700 dark:text-slate-300 hover:border-slate-400 font-medium flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        Test Tone
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const vibrated = triggerDeviceVibration([180, 90, 220]);
                          if (!vibrated) playTimerCompleteTone(true);
                          setTimerCompletedAlert(
                            supportsNativeVibrate
                              ? 'Vibration motor pulse triggered.'
                              : 'Audio alert triggered (open on Android/mobile for native haptic motor).'
                          );
                        }}
                        className="no-touch-delay min-h-[36px] px-3 py-1 rounded-lg hl-subtle border text-slate-700 dark:text-slate-300 hover:border-slate-400 font-medium flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        Test Vibrate
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoTimerOnComplete}
                          onChange={(e) => setAutoTimerOnComplete(e.target.checked)}
                          className="rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                        />
                        <span>Auto-start rest on checkoff</span>
                      </label>

                      <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={soundEnabled}
                          onChange={(e) => setSoundEnabled(e.target.checked)}
                          className="rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                        />
                        <span>Tone on timer set &amp; finish</span>
                      </label>

                      <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={vibrateEnabled}
                          onChange={(e) => setVibrateEnabled(e.target.checked)}
                          className="rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                        />
                        <span>Vibrate on finish</span>
                      </label>

                      <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          data-testid="toggle-optional-rpe-col"
                          checked={showAdvancedRpe}
                          onChange={(e) => setShowAdvancedRpe(e.target.checked)}
                          className="rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                        />
                        <span>Show optional RPE column</span>
                      </label>
                    </div>

                    <div className="text-slate-500 dark:text-slate-400">
                      <span>Effort Guide: </span>
                      <strong className="text-emerald-700 dark:text-emerald-300">
                        1–3 reps left in the tank (Sweet Spot)
                      </strong>
                      <span> · </span>
                      <strong className="text-amber-700 dark:text-amber-300">
                        0 left (Max Effort)
                      </strong>
                    </div>
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
                    className="no-touch-delay min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                    aria-label="Dismiss timer alert"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {syncConfirmation && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-xs font-medium text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{syncConfirmation}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCalendarDate(formatLocalDateISO(new Date()));
                  setPageView('calendar');
                }}
                className="no-touch-delay text-xs font-semibold underline whitespace-nowrap shrink-0"
              >
                View Calendar
              </button>
            </div>
          )}

          {/* Rest Day Card OR Empty Session Prompt OR Clean Exercise Set Cards */}
          {currentDayPlan.isRestDay ? (
            <div className="hl-card rounded-2xl p-6 sm:p-8 text-center max-w-2xl mx-auto space-y-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Day {currentDayPlan.dayNumber} · Active Recovery Day
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-lg mx-auto">
                Today is set aside for rest, light walking, or gentle mobility. Feel like moving anyway? Pick a routine or start an open session whenever you&apos;re ready.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => openSwitcher('templates')}
                  className="no-touch-delay min-h-[44px] px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5"
                >
                  <Dumbbell className="w-4 h-4" />
                  <span>Choose Routine</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onStartQuickWorkout('Quick Workout');
                    setIsAddExerciseOpen(true);
                  }}
                  className="no-touch-delay min-h-[44px] px-4 py-2.5 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-sky-500 text-xs sm:text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Start Open Session</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddExerciseOpen(true)}
                  className="no-touch-delay min-h-[44px] px-4 py-2.5 hl-subtle border text-slate-700 dark:text-slate-300 hover:border-slate-400 text-xs sm:text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Exercise to Day {currentDayPlan.dayNumber}</span>
                </button>
              </div>
            </div>
          ) : currentDayPlan.exercises.length === 0 ? (
            <div className="hl-card rounded-2xl p-6 sm:p-8 text-center max-w-xl mx-auto space-y-4">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {currentDayPlan.title} · Ready When You Are
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Add your first movement from the library to start logging, or switch to a saved routine.
              </p>
              <div className="pt-1 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddExerciseOpen(true)}
                  className="no-touch-delay min-h-[44px] px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add First Exercise</span>
                </button>
                <button
                  type="button"
                  onClick={() => openSwitcher('templates')}
                  className="no-touch-delay min-h-[44px] px-4 py-2.5 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-sky-500 text-sm font-semibold rounded-xl transition-colors"
                >
                  Pick Routine
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Exercise Set Focus Toggle Bar (Tactile Exercise-to-Exercise Switcher) */}
              {currentDayPlan.exercises.length > 1 && (
                <div
                  data-testid="exercise-set-focus-bar"
                  className="hl-card rounded-2xl p-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
                  role="tablist"
                  aria-label="Toggle between exercise sets"
                >
                  <button
                    type="button"
                    role="tab"
                    data-testid="exercise-focus-btn-all"
                    aria-selected={focusedExerciseId === 'all'}
                    onClick={() => setFocusedExerciseId('all')}
                    className={`no-touch-delay min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                      focusedExerciseId === 'all'
                        ? 'bg-slate-900 dark:bg-blue-600 text-white'
                        : 'hl-subtle border text-slate-700 dark:text-slate-200 hover:border-blue-500'
                    }`}
                  >
                    All Exercises ({currentDayPlan.exercises.length})
                  </button>
                  {currentDayPlan.exercises.map((focusEx, focusIdx) => {
                    const isFocused = focusedExerciseId === focusEx.id;
                    const focusSets = setsByExercise[focusEx.id] ?? [];
                    const focusDone = focusSets.filter((s) => s.completed).length;
                    return (
                      <button
                        key={focusEx.id}
                        type="button"
                        role="tab"
                        data-testid={`exercise-focus-btn-${focusEx.id}`}
                        aria-selected={isFocused}
                        onClick={() => {
                          setFocusedExerciseId(focusEx.id);
                          setExpandedExerciseIds((prev) => ({
                            ...prev,
                            [focusEx.id]: true,
                          }));
                          triggerCardExpandCollapsePop([focusEx.id], 'expand');
                        }}
                        className={`no-touch-delay min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                          isFocused
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'hl-subtle border text-slate-700 dark:text-slate-200 hover:border-blue-500'
                        }`}
                      >
                        <span className="font-mono tabular-nums">
                          {String(focusIdx + 1).padStart(2, '0')}.
                        </span>
                        <span className="max-w-[140px] truncate">{focusEx.name}</span>
                        <span
                          className={`font-mono tabular-nums text-[11px] ${
                            isFocused ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {focusDone}/{focusSets.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Compact Single-Row Workout Session Cards (.hl-card per exercise + CSS Transition Expand + History Mini-Modal) */}
              {(() => {
                const visibleExercises = currentDayPlan.exercises
                  .map((ex, idx) => ({ ex, idx }))
                  .filter(
                    ({ ex }) =>
                      focusedExerciseId === 'all' ||
                      ex.id === focusedExerciseId ||
                      !currentDayPlan.exercises.some((c) => c.id === focusedExerciseId)
                  );
                const allVisibleExpanded =
                  visibleExercises.length > 0 &&
                  visibleExercises.every(
                    ({ ex }) => Boolean(expandedExerciseIds[ex.id]) || focusedExerciseId === ex.id
                  );
                const todayIso = formatLocalDateISO(new Date());

                return (
                  <div data-testid="workout-session-card" className="space-y-2.5">
                    <div className="px-1 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                          Session Exercises
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums whitespace-nowrap">
                          {sessionStats.completed}/{sessionStats.total} sets
                        </span>
                      </div>

                      {focusedExerciseId === 'all' && visibleExercises.length > 1 && (
                        <button
                          type="button"
                          data-testid="toggle-expand-all-exercises-btn"
                          onClick={() => {
                            const visibleIds = visibleExercises.map((v) => v.ex.id);
                            if (allVisibleExpanded) {
                              setExpandedExerciseIds({});
                              triggerCardExpandCollapsePop(visibleIds, 'collapse');
                            } else {
                              const nextMap: Record<string, boolean> = {};
                              for (const id of visibleIds) {
                                nextMap[id] = true;
                              }
                              setExpandedExerciseIds(nextMap);
                              triggerCardExpandCollapsePop(visibleIds, 'expand');
                            }
                          }}
                          className="no-touch-delay min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50/70 dark:hover:bg-sky-950/40 transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <span>{allVisibleExpanded ? 'Collapse All' : 'Expand All'}</span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                              allVisibleExpanded ? 'rotate-180' : 'rotate-0'
                            }`}
                          />
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      {visibleExercises.map(({ ex, idx }) => {
                          const exSets = setsByExercise[ex.id] ?? [];
                          const completedSetsCount = exSets.filter((s) => s.completed).length;
                          const lm = landmarks[ex.muscleId];
                          const lastSet = exSets[exSets.length - 1];
                          const prevList = previousSetsByExerciseId[ex.id];
                          const recentThree = recentThreeSetsByExerciseId[ex.id] ?? [];
                          const hasUncompletedSets = exSets.some((s) => !s.completed);
                          const hasCompletedInThisExercise = completedSetsCount > 0;

                          const cardioMode = isCardioExercise(ex, exerciseLibrary);
                          const cardioTimer = cardioMode ? getOrInitCardioTimer(ex) : null;
                          const cardioPrimarySet = exSets[0];
                          const isCardioDone = Boolean(cardioPrimarySet?.completed);
                          const isExerciseComplete = cardioMode
                            ? isCardioDone
                            : exSets.length > 0 && completedSetsCount === exSets.length;
                          const isExpanded =
                            focusedExerciseId === ex.id || Boolean(expandedExerciseIds[ex.id]);
                          const isHistoryModalOpen = historyModalExercise?.id === ex.id;
                          const cardPopDirection = poppedCardById[ex.id];
                          const targetMuscleName = lm?.name ?? ex.muscleId;
                          const recentThreeMeanWeightLabel =
                            !cardioMode && recentThree.length > 0
                              ? formatCleanNumberString(
                                  recentThree.reduce(
                                    (sum, s) => sum + formatWeightDisplay(s.weightKg),
                                    0
                                  ) / recentThree.length,
                                  1
                                )
                              : null;

                          const historyTooltip =
                            recentThree.length > 0
                              ? `Previous ${recentThree.length} set${
                                  recentThree.length === 1 ? '' : 's'
                                }: ${recentThree
                                  .map((s) =>
                                    cardioMode
                                      ? `${s.reps} min`
                                      : `${formatWeightDisplay(s.weightKg)} ${weightUnit} × ${s.reps}`
                                  )
                                  .join(' · ')} — tap to toggle previous 3 sets`
                              : `View previous 3 sets for ${ex.name} (no sets logged yet)`;

                          const handleToggleExpandRow = () => {
                            const nextExpanded = !isExpanded;
                            triggerCardExpandCollapsePop(
                              [ex.id],
                              nextExpanded ? 'expand' : 'collapse'
                            );
                            if (focusedExerciseId === ex.id) {
                              setFocusedExerciseId('all');
                              setExpandedExerciseIds((prev) => ({
                                ...prev,
                                [ex.id]: false,
                              }));
                            } else {
                              toggleExpandedExercise(ex.id);
                            }
                          };

                          return (
                            <div
                              key={`${activeWeek}_${activeDay}_${activeStandaloneSession?.sessionId ?? 'sched'}_${ex.id}`}
                              data-testid={
                                cardioMode ? `cardio-timer-card-${ex.id}` : `strength-card-${ex.id}`
                              }
                              data-card-pop={cardPopDirection ?? undefined}
                              onAnimationEnd={(ev) => {
                                if (ev.target === ev.currentTarget && cardPopDirection) {
                                  setPoppedCardById((prev) => {
                                    if (!prev[ex.id]) return prev;
                                    const copy = { ...prev };
                                    delete copy[ex.id];
                                    return copy;
                                  });
                                }
                              }}
                              className={`hl-card rounded-2xl relative ${
                                isHistoryModalOpen ? 'z-30' : 'z-0'
                              } ${
                                cardPopDirection === 'expand'
                                  ? 'hl-card-pop-expand'
                                  : cardPopDirection === 'collapse'
                                  ? 'hl-card-pop-collapse'
                                  : ''
                              } ${
                                cardioMode && poppedSetId === cardioPrimarySet?.id
                                  ? 'hl-set-row-pop'
                                  : ''
                              }`}
                            >
                              {/* Single Compact Row by Default */}
                              <div
                                data-testid={`compact-exercise-row-${ex.id}`}
                                className="relative px-3.5 sm:px-4 py-2 min-h-[60px] flex items-center justify-between gap-2"
                              >
                                <button
                                  type="button"
                                  onClick={handleToggleExpandRow}
                                  className="no-touch-delay flex-1 min-w-0 min-h-[44px] flex items-center gap-2.5 sm:gap-3 text-left group"
                                >
                                  <span
                                    className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-mono tabular-nums text-xs font-bold transition-colors ${
                                      isExerciseComplete
                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    {isExerciseComplete ? (
                                      <Check className="w-3.5 h-3.5" />
                                    ) : (
                                      String(idx + 1).padStart(2, '0')
                                    )}
                                  </span>

                                  <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                                    <span className="text-sm sm:text-[15px] font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                                      {ex.name}
                                    </span>

                                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap shrink-0">
                                      {cardioMode
                                        ? `${
                                            isCardioDone
                                              ? `${cardioPrimarySet?.reps ?? Math.round((cardioTimer?.targetSec ?? 900) / 60)}m done`
                                              : `${Math.round((cardioTimer?.targetSec ?? 900) / 60)}m cardio`
                                          }`
                                        : `${lm?.shortName ?? ex.muscleId} · ${completedSetsCount}/${exSets.length}`}
                                    </span>
                                  </div>
                                </button>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* History Icon Button: Toggles Mini-Modal with Recent 3 Sets from setLogs */}
                                  <button
                                    type="button"
                                    data-testid={`exercise-history-btn-${ex.id}`}
                                    aria-expanded={isHistoryModalOpen}
                                    aria-haspopup="dialog"
                                    aria-label={`View previous 3 sets for ${ex.name}`}
                                    title={historyTooltip}
                                    onClick={() =>
                                      setHistoryModalExercise((prev) =>
                                        prev?.id === ex.id ? null : ex
                                      )
                                    }
                                    className={`no-touch-delay min-h-[44px] min-w-[44px] px-2.5 rounded-xl border text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                                      isHistoryModalOpen
                                        ? 'bg-sky-50/95 dark:bg-sky-950/60 border-sky-400 dark:border-sky-600 text-sky-700 dark:text-sky-300'
                                        : recentThree.length > 0
                                        ? 'hl-subtle text-sky-700 dark:text-sky-300 border-sky-200/80 dark:border-sky-800/70 hover:border-sky-500'
                                        : 'hl-subtle text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-400'
                                    }`}
                                  >
                                    <History className="w-4 h-4 shrink-0" />
                                    <span className="sr-only sm:not-sr-only font-mono tabular-nums text-[11px]">
                                      {recentThree.length > 0
                                        ? `History (${recentThree.length})`
                                        : 'History'}
                                    </span>
                                  </button>

                                  {/* Expand Icon Button: Toggles Hidden Weight/Rep History Div via CSS Transitions */}
                                  <button
                                    type="button"
                                    data-testid={`expand-exercise-btn-${ex.id}`}
                                    aria-expanded={isExpanded}
                                    aria-controls={`exercise-details-panel-${ex.id}`}
                                    aria-label={
                                      isExpanded
                                        ? `Collapse ${ex.name}`
                                        : `Expand ${ex.name} rep/weight history and sets`
                                    }
                                    title={
                                      isExpanded
                                        ? 'Hide detailed rep/weight history & sets'
                                        : 'Expand detailed rep/weight history & sets'
                                    }
                                    onClick={handleToggleExpandRow}
                                    className={`no-touch-delay min-h-[44px] min-w-[44px] px-2.5 rounded-xl border text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                                      isExpanded
                                        ? 'bg-sky-50/90 dark:bg-sky-950/50 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300'
                                        : 'hl-subtle text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-400'
                                    }`}
                                  >
                                    <span className="sr-only sm:not-sr-only">
                                      {isExpanded ? 'Hide' : 'Expand'}
                                    </span>
                                    <ChevronDown
                                      className={`w-4 h-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                        isExpanded ? 'rotate-180' : 'rotate-0'
                                      }`}
                                    />
                                  </button>
                                </div>

                                {/* Anchored Mini-Modal: Most Recent 3 Set Logs from `setLogs` State */}
                                <AnimatePresence>
                                  {isHistoryModalOpen && (
                                    <motion.div
                                      key={`history-mini-modal-${ex.id}`}
                                      initial={
                                        shouldReduceMotion
                                          ? { opacity: 1 }
                                          : { opacity: 0, y: 6, scale: 0.98 }
                                      }
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={
                                        shouldReduceMotion
                                          ? { opacity: 0 }
                                          : { opacity: 0, y: 4, scale: 0.98 }
                                      }
                                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                                      role="dialog"
                                      aria-modal="false"
                                      aria-labelledby={`exercise-history-modal-title-${ex.id}`}
                                      data-testid="exercise-history-mini-modal"
                                      className="absolute right-2 sm:right-4 top-full mt-1.5 z-40 w-[min(22rem,calc(100vw-2.25rem))] hl-card rounded-2xl p-4 space-y-3.5 shadow-2xl border border-slate-200/90 dark:border-slate-700"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <h3
                                            id={`exercise-history-modal-title-${ex.id}`}
                                            className="text-sm font-bold text-slate-900 dark:text-white truncate"
                                          >
                                            {ex.name}
                                          </h3>
                                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            Most recent 3 set logs · {targetMuscleName}
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          data-testid="close-exercise-history-modal-btn"
                                          onClick={() => setHistoryModalExercise(null)}
                                          className="no-touch-delay min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
                                          aria-label="Close exercise history"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>

                                      {recentThree.length === 0 ? (
                                        <div
                                          data-testid="exercise-history-empty-state"
                                          className="py-4 border-y border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 leading-relaxed"
                                        >
                                          No completed sets recorded for{' '}
                                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                                            {ex.name}
                                          </span>{' '}
                                          yet. Complete sets below and your 3 most recent logs will appear here.
                                        </div>
                                      ) : (
                                        <div
                                          data-testid="exercise-history-sets-list"
                                          className="divide-y divide-slate-200/80 dark:divide-slate-800 border-y border-slate-200/80 dark:border-slate-800"
                                        >
                                          {recentThree.map((s, rIdx) => {
                                            const dIso = resolveSetLogDateISO(s);
                                            const dateLabel = !dIso
                                              ? `Week ${s.week}`
                                              : dIso === todayIso
                                              ? 'Today'
                                              : formatHumanDateShort(dIso);

                                            return (
                                              <div
                                                key={`${s.id}_${rIdx}`}
                                                data-testid={`exercise-history-row-${rIdx}`}
                                                className="py-2.5 flex items-center justify-between gap-3"
                                              >
                                                <div className="min-w-0">
                                                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 font-mono tabular-nums">
                                                    Set {s.setIndex}
                                                  </div>
                                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                                    {dateLabel}
                                                    {s.sessionTitle ? ` · ${s.sessionTitle}` : ''}
                                                  </div>
                                                </div>

                                                <div className="text-right shrink-0 font-mono tabular-nums">
                                                  <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                                                    {cardioMode
                                                      ? `${s.reps} min`
                                                      : `${formatWeightDisplay(s.weightKg)} ${weightUnit} × ${s.reps}`}
                                                  </div>
                                                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                    {cardioMode
                                                      ? 'Timed cardio'
                                                      : `${s.rir} RIR${
                                                          s.rpe !== undefined ? ` · RPE ${s.rpe}` : ''
                                                        }`}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}

                                      <div className="flex items-center justify-end gap-2 pt-0.5">
                                        {!cardioMode &&
                                          recentThree.length > 0 &&
                                          hasUncompletedSets && (
                                            <button
                                              type="button"
                                              data-testid="apply-exercise-history-btn"
                                              onClick={async () => {
                                                await handleApplyPreviousToExercise(
                                                  ex,
                                                  recentThree.map((s) => ({
                                                    weightKg: s.weightKg,
                                                    reps: s.reps,
                                                    rpe: s.rpe,
                                                  }))
                                                );
                                                setHistoryModalExercise(null);
                                              }}
                                              className="no-touch-delay flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                                            >
                                              Use Weights &amp; Reps
                                            </button>
                                          )}
                                        <button
                                          type="button"
                                          data-testid="done-exercise-history-modal-btn"
                                          onClick={() => setHistoryModalExercise(null)}
                                          className={`no-touch-delay min-h-[40px] px-4 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 transition-colors ${
                                            !cardioMode &&
                                            recentThree.length > 0 &&
                                            hasUncompletedSets
                                              ? ''
                                              : 'w-full'
                                          }`}
                                        >
                                          Done
                                        </button>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>

                              {/* Hidden Div Containing Detailed Weight/Rep History & Set Inputs (CSS Transition Smooth Reveal) */}
                              <div
                                id={`exercise-details-panel-${ex.id}`}
                                data-testid={`exercise-details-panel-${ex.id}`}
                                data-expanded={isExpanded ? 'true' : 'false'}
                                aria-hidden={!isExpanded}
                                className="hl-collapse-wrapper"
                              >
                                <div className="hl-collapse-inner">
                                  <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5 border-t border-slate-200/70 dark:border-slate-800/80 space-y-3.5">
                                    {/* Detailed Weight/Rep History & Exercise Controls */}
                                    <div
                                      data-testid={`exercise-rep-weight-history-${ex.id}`}
                                      className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"
                                    >
                                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                        {cardioMode && cardioTimer ? (
                                          <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                                            Target {Math.round(cardioTimer.targetSec / 60)} min timer
                                          </span>
                                        ) : (
                                          <>
                                            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                              {ex.repRange} reps
                                            </span>
                                            <span aria-hidden="true">·</span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                startRestCountdown(
                                                  ex.restSeconds ?? restDuration,
                                                  ex.name
                                                )
                                              }
                                              className="no-touch-delay font-mono tabular-nums text-sky-600 dark:text-sky-400 hover:underline font-medium"
                                              title="Start prescribed rest timer for this exercise"
                                            >
                                              {ex.restSeconds ?? restDuration}s rest
                                            </button>
                                          </>
                                        )}
                                        {ex.isSuperset && !cardioMode && (
                                          <>
                                            <span aria-hidden="true">·</span>
                                            <span className="font-semibold text-sky-700 dark:text-sky-300">
                                              Superset
                                            </span>
                                          </>
                                        )}
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                          {recentThree.length > 0
                                            ? `Last: ${recentThree
                                                .map((s) =>
                                                  cardioMode
                                                    ? `Set ${s.setIndex}: ${s.reps}m`
                                                    : `Set ${s.setIndex}: ${formatWeightDisplay(s.weightKg)} ${weightUnit} × ${s.reps} (${s.rir} RIR)`
                                                )
                                                .join(' · ')}`
                                            : 'No prior history yet'}
                                        </span>
                                        {!cardioMode && (
                                          <>
                                            <span aria-hidden="true">·</span>
                                            <span
                                              data-testid={`exercise-history-average-${ex.id}`}
                                              className={`text-[11px] font-mono tabular-nums whitespace-nowrap ${
                                                recentThreeMeanWeightLabel
                                                  ? 'text-sky-700 dark:text-sky-300 font-semibold'
                                                  : 'text-slate-400 dark:text-slate-500'
                                              }`}
                                              title={
                                                recentThreeMeanWeightLabel
                                                  ? `Mean weight across the last ${recentThree.length} displayed set${recentThree.length === 1 ? '' : 's'}`
                                                  : 'Mean weight across the last 3 displayed sets'
                                              }
                                            >
                                              {recentThreeMeanWeightLabel
                                                ? `Average: ${recentThreeMeanWeightLabel} ${weightUnit}`
                                                : 'Average: —'}
                                            </span>
                                          </>
                                        )}
                                      </div>

                                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                        {!cardioMode &&
                                          prevList &&
                                          prevList.length > 0 &&
                                          hasUncompletedSets && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleApplyPreviousToExercise(ex, prevList)
                                              }
                                              className="no-touch-delay min-h-[34px] px-2.5 py-1 rounded-lg hl-subtle border text-xs font-semibold text-sky-600 dark:text-sky-400 hover:border-sky-500 transition-colors whitespace-nowrap"
                                            >
                                              Use Last
                                            </button>
                                          )}

                                        <button
                                          type="button"
                                          onClick={() =>
                                            setWorkoutHelpTarget(
                                              buildHelpTargetFromDayPlan(
                                                currentDayPlan,
                                                activeWeek,
                                                weekMeta.targetRir,
                                                ex.id
                                              )
                                            )
                                          }
                                          className="no-touch-delay min-h-[34px] px-2.5 py-1 rounded-lg hl-subtle border text-xs font-semibold text-sky-600 dark:text-sky-400 hover:border-sky-500 transition-colors flex items-center gap-1 whitespace-nowrap"
                                          title={`How to perform ${ex.name}`}
                                        >
                                          <HelpCircle className="w-3.5 h-3.5" />
                                          <span>Form</span>
                                        </button>

                                        {!hasCompletedInThisExercise &&
                                          currentDayPlan.exercises.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                onRemoveExerciseFromActiveWorkout(ex.id)
                                              }
                                              className="no-touch-delay min-h-[34px] min-w-[34px] rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-50/70 dark:hover:bg-amber-950/30 transition-colors"
                                              title={`Remove ${ex.name} from session`}
                                              aria-label={`Remove ${ex.name} from session`}
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                      </div>
                                    </div>

                                    {isExpanded &&
                                      (cardioMode && cardioTimer ? (
                                        /* TIMER-BASED CARDIO TRACKER (Replaces Set × Weight × Reps Rows) */
                                        <div className="space-y-3.5 pt-0.5">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200/80 dark:border-slate-800">
                                          <div className="flex items-center gap-3.5">
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  playTimerSetTone(soundEnabledRef.current);
                                                  updateCardioTimer(ex, (st) => {
                                                    const nextTarget = Math.max(
                                                      60,
                                                      st.targetSec - 60
                                                    );
                                                    return {
                                                      ...st,
                                                      targetSec: nextTarget,
                                                      remainingSec: Math.max(
                                                        10,
                                                        st.remainingSec - 60
                                                      ),
                                                    };
                                                  });
                                                }}
                                                className="no-touch-delay min-h-[44px] min-w-[44px] rounded-xl hl-subtle border flex items-center justify-center text-slate-700 dark:text-slate-200 hover:border-slate-400"
                                                aria-label="Subtract 1 minute from cardio timer"
                                              >
                                                <Minus className="w-4 h-4" />
                                              </button>

                                              <div className="px-3 text-center">
                                                <div
                                                  data-testid={`cardio-clock-${ex.id}`}
                                                  className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-slate-900 dark:text-white leading-none"
                                                >
                                                  {formatTimer(cardioTimer.remainingSec)}
                                                </div>
                                                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
                                                  Elapsed {formatTimer(cardioTimer.elapsedSec)} ·{' '}
                                                  {cardioTimer.intensityZone}
                                                </div>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => {
                                                  playTimerSetTone(soundEnabledRef.current);
                                                  updateCardioTimer(ex, (st) => {
                                                    const nextTarget = Math.min(
                                                      5400,
                                                      st.targetSec + 60
                                                    );
                                                    return {
                                                      ...st,
                                                      targetSec: nextTarget,
                                                      remainingSec: Math.min(
                                                        5400,
                                                        st.remainingSec + 60
                                                      ),
                                                    };
                                                  });
                                                }}
                                                className="no-touch-delay min-h-[44px] min-w-[44px] rounded-xl hl-subtle border flex items-center justify-center text-slate-700 dark:text-slate-200 hover:border-slate-400"
                                                aria-label="Add 1 minute to cardio timer"
                                              >
                                                <Plus className="w-4 h-4" />
                                              </button>
                                            </div>
                                          </div>

                                          <div className="flex flex-wrap items-center gap-2">
                                            <button
                                              type="button"
                                              data-testid={`cardio-start-pause-btn-${ex.id}`}
                                              onClick={() => {
                                                if (!cardioTimer.isRunning) {
                                                  playTimerSetTone(soundEnabledRef.current);
                                                }
                                                updateCardioTimer(ex, (st) => ({
                                                  ...st,
                                                  remainingSec:
                                                    st.remainingSec <= 0
                                                      ? st.targetSec
                                                      : st.remainingSec,
                                                  isRunning: !st.isRunning,
                                                }));
                                              }}
                                              className="no-touch-delay min-h-[44px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
                                            >
                                              {cardioTimer.isRunning ? (
                                                <>
                                                  <Pause className="w-4 h-4" />
                                                  <span>Pause Timer</span>
                                                </>
                                              ) : (
                                                <>
                                                  <Play className="w-4 h-4" />
                                                  <span>Start Cardio Timer</span>
                                                </>
                                              )}
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => {
                                                playTimerSetTone(soundEnabledRef.current);
                                                updateCardioTimer(ex, (st) => ({
                                                  ...st,
                                                  isRunning: false,
                                                  remainingSec: st.targetSec,
                                                  elapsedSec: 0,
                                                }));
                                              }}
                                              className="no-touch-delay min-h-[44px] px-3 py-2 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 flex items-center gap-1 whitespace-nowrap"
                                            >
                                              <RotateCcw className="w-3.5 h-3.5" />
                                              <span>Reset</span>
                                            </button>

                                            <button
                                              type="button"
                                              data-testid={`complete-cardio-btn-${ex.id}`}
                                              onClick={() => void handleCompleteCardioTimer(ex)}
                                              className={`no-touch-delay min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                                                isCardioDone
                                                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                                  : 'bg-slate-900 dark:bg-emerald-600 text-white hover:opacity-90'
                                              }`}
                                            >
                                              <Check className="w-4 h-4" />
                                              <span>
                                                {isCardioDone
                                                  ? `Cardio Logged (${cardioPrimarySet?.reps ?? Math.round(cardioTimer.targetSec / 60)}m)`
                                                  : 'Complete Cardio'}
                                              </span>
                                            </button>
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-slate-500 dark:text-slate-400 font-medium mr-1">
                                              Duration:
                                            </span>
                                            {[5, 10, 15, 20, 30, 45].map((mins) => {
                                              const sec = mins * 60;
                                              const isSelected = cardioTimer.targetSec === sec;
                                              return (
                                                <button
                                                  key={mins}
                                                  type="button"
                                                  onClick={() => {
                                                    playTimerSetTone(soundEnabledRef.current);
                                                    updateCardioTimer(ex, (st) => ({
                                                      ...st,
                                                      targetSec: sec,
                                                      remainingSec: sec,
                                                      isRunning: false,
                                                    }));
                                                  }}
                                                  className={`no-touch-delay min-h-[36px] px-2.5 py-1 rounded-lg font-mono tabular-nums font-semibold border transition-colors ${
                                                    isSelected
                                                      ? 'bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-500'
                                                      : 'hl-subtle text-slate-700 dark:text-slate-300 hover:border-slate-400'
                                                  }`}
                                                >
                                                  {mins}m
                                                </button>
                                              );
                                            })}
                                          </div>

                                          <select
                                            aria-label={`Cardio intensity zone for ${ex.name}`}
                                            value={cardioTimer.intensityZone}
                                            onChange={(e) =>
                                              updateCardioTimer(ex, (st) => ({
                                                ...st,
                                                intensityZone: e.target.value,
                                              }))
                                            }
                                            className="min-h-[38px] px-2.5 py-1 text-xs font-semibold hl-input rounded-lg"
                                          >
                                            <option value="Zone 2 Aerobic Base">
                                              Zone 2 Aerobic Base
                                            </option>
                                            <option value="Zone 3 Tempo">Zone 3 Tempo</option>
                                            <option value="Zone 4 Threshold">
                                              Zone 4 Threshold
                                            </option>
                                            <option value="HIIT Intervals">HIIT Intervals</option>
                                          </select>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        {/* Calm 5-Column Default Set Rows (Optional RPE column tucked in Timer & Effort Options unless populated) */}
                                        {(() => {
                                          const showRpeCol =
                                            showAdvancedRpe ||
                                            exSets.some(
                                              (s) => s.rpe !== undefined && s.rpe !== null
                                            );
                                          const gridColsClass = showRpeCol
                                            ? 'grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.15fr)_minmax(0,0.85fr)_2.75rem] sm:grid-cols-[2.75rem_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)_3.25rem]'
                                            : 'grid-cols-[2.25rem_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1.2fr)_2.85rem] sm:grid-cols-[2.75rem_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_3.25rem]';

                                          return (
                                            <div className="space-y-2">
                                              <div
                                                className={`grid ${gridColsClass} gap-1.5 sm:gap-2.5 px-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 items-center`}
                                              >
                                                <div className="text-center">Set</div>
                                                <div className="text-center">
                                                  Weight ({weightUnit})
                                                </div>
                                                <div className="text-center">Reps</div>
                                                <div className="text-center">Effort</div>
                                                {showRpeCol && (
                                                  <div className="text-center">
                                                    RPE{' '}
                                                    <span className="hidden sm:inline font-normal text-slate-400">
                                                      (opt)
                                                    </span>
                                                  </div>
                                                )}
                                                <div className="text-center">Done</div>
                                              </div>

                                              <AnimatePresence initial={true} mode="popLayout">
                                                {exSets.map((setRow, sIdx) => {
                                                  const rirVisual = getRirVisualFeedback(
                                                    setRow.rir
                                                  );
                                                  const hasMatchingOption = RIR_OPTIONS.some(
                                                    (o) => o.value === setRow.rir
                                                  );
                                                  const rpeHighEffort =
                                                    typeof setRow.rpe === 'number' &&
                                                    setRow.rpe >= 9.5;
                                                  const rpeOptimalEffort =
                                                    typeof setRow.rpe === 'number' &&
                                                    setRow.rpe >= 7 &&
                                                    setRow.rpe < 9.5;
                                                  const isPopped = poppedSetId === setRow.id;

                                                  return (
                                                    <motion.div
                                                      key={`${activeWeek}_${activeDay}_${activeStandaloneSession?.sessionId ?? 'sched'}_${focusedExerciseId}_${setRow.id}`}
                                                      layout={!shouldReduceMotion}
                                                      initial={
                                                        shouldReduceMotion
                                                          ? false
                                                          : { opacity: 0, y: 10, scale: 0.985 }
                                                      }
                                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                                      exit={
                                                        shouldReduceMotion
                                                          ? { opacity: 0 }
                                                          : { opacity: 0, y: -6, scale: 0.985 }
                                                      }
                                                      transition={{
                                                        duration: 0.2,
                                                        delay: Math.min(sIdx * 0.035, 0.16),
                                                        ease: [0.16, 1, 0.3, 1],
                                                      }}
                                                      data-testid={`set-row-${setRow.id}`}
                                                      data-framer-animated="true"
                                                      data-popped={isPopped ? 'true' : undefined}
                                                      className={`grid ${gridColsClass} gap-1.5 sm:gap-2.5 items-center p-2 rounded-xl border transition-colors ${
                                                        setRow.completed
                                                          ? 'bg-emerald-50/55 dark:bg-emerald-950/35 border-emerald-300/80 dark:border-emerald-700/70'
                                                          : 'hl-subtle border'
                                                      } ${isPopped ? 'hl-set-row-pop' : ''}`}
                                                    >
                                                      <div className="flex items-center justify-center">
                                                        <span className="w-6 h-6 rounded-md bg-slate-200/70 dark:bg-slate-800/90 flex items-center justify-center font-mono tabular-nums text-xs font-bold text-slate-700 dark:text-slate-200">
                                                          {sIdx + 1}
                                                        </span>
                                                      </div>

                                                      <div>
                                                        <NumericSetInput
                                                          allowDecimal
                                                          maxDecimals={2}
                                                          min={0}
                                                          max={1500}
                                                          ariaLabel={`Set ${sIdx + 1} load in ${weightUnit}`}
                                                          value={formatWeightDisplay(
                                                            setRow.weightKg
                                                          )}
                                                          onDraftValueChange={(val) => {
                                                            if (val === undefined) return;
                                                            pendingRowDraftsRef.current[
                                                              setRow.id
                                                            ] = {
                                                              ...(pendingRowDraftsRef.current[
                                                                setRow.id
                                                              ] ?? {}),
                                                              weightKg: parseWeightToKg(
                                                                Math.max(0, val)
                                                              ),
                                                            };
                                                          }}
                                                          onCommitNumber={(val) => {
                                                            if (val === undefined) return;
                                                            const nextRow =
                                                              mergeRowWithPendingDraft(setRow, {
                                                                weightKg: parseWeightToKg(
                                                                  Math.max(0, val)
                                                                ),
                                                              });
                                                            void onUpsertSet(nextRow);
                                                          }}
                                                          className="w-full min-h-[44px] px-1.5 sm:px-2.5 py-1.5 text-center text-xs sm:text-sm font-mono tabular-nums font-semibold hl-input hl-num-input rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                                                        />
                                                      </div>

                                                      <div>
                                                        <NumericSetInput
                                                          allowDecimal={false}
                                                          maxDecimals={0}
                                                          min={1}
                                                          max={200}
                                                          ariaLabel={`Set ${sIdx + 1} reps`}
                                                          value={sanitizeReps(setRow.reps, 1)}
                                                          onDraftValueChange={(val) => {
                                                            if (val === undefined) return;
                                                            pendingRowDraftsRef.current[
                                                              setRow.id
                                                            ] = {
                                                              ...(pendingRowDraftsRef.current[
                                                                setRow.id
                                                              ] ?? {}),
                                                              reps: sanitizeReps(val, 1),
                                                            };
                                                          }}
                                                          onCommitNumber={(val) => {
                                                            if (val === undefined) return;
                                                            const nextRow =
                                                              mergeRowWithPendingDraft(setRow, {
                                                                reps: sanitizeReps(val, 1),
                                                              });
                                                            void onUpsertSet(nextRow);
                                                          }}
                                                          className="w-full min-h-[44px] px-1.5 sm:px-2.5 py-1.5 text-center text-xs sm:text-sm font-mono tabular-nums font-semibold hl-input hl-num-input rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                                                        />
                                                      </div>

                                                      {/* Color-Coded Effort Selector Dropdown */}
                                                      <div>
                                                        <select
                                                          aria-label={`Set ${sIdx + 1} Reps in Reserve`}
                                                          value={
                                                            hasMatchingOption
                                                              ? setRow.rir
                                                              : Math.min(
                                                                  4,
                                                                  Math.max(
                                                                    0,
                                                                    Math.round(setRow.rir)
                                                                  )
                                                                )
                                                          }
                                                          onChange={(e) => {
                                                            const nextRir = sanitizeRir(
                                                              Number(e.target.value),
                                                              2
                                                            );
                                                            const nextRow =
                                                              mergeRowWithPendingDraft(setRow, {
                                                                rir: nextRir,
                                                              });
                                                            void onUpsertSet(nextRow);
                                                          }}
                                                          title={rirVisual.badgeLabel}
                                                          className={`w-full min-h-[44px] px-1 sm:px-2 py-1.5 text-center text-xs font-mono tabular-nums font-bold border rounded-lg appearance-none sm:appearance-auto focus:outline-none focus:ring-2 transition-colors ${rirVisual.selectClasses}`}
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

                                                      {/* Optional RPE Input Field (Shown when requested or populated) */}
                                                      {showRpeCol && (
                                                        <div>
                                                          <NumericSetInput
                                                            allowDecimal
                                                            maxDecimals={1}
                                                            min={1}
                                                            max={10}
                                                            placeholder="—"
                                                            ariaLabel={`Set ${sIdx + 1} optional RPE (1 to 10)`}
                                                            title="Optional Rate of Perceived Exertion (1–10)"
                                                            value={
                                                              setRow.rpe !== undefined &&
                                                              setRow.rpe !== null
                                                                ? sanitizeOptionalRpe(setRow.rpe) ??
                                                                  ''
                                                                : ''
                                                            }
                                                            onDraftValueChange={(val) => {
                                                              pendingRowDraftsRef.current[
                                                                setRow.id
                                                              ] = {
                                                                ...(pendingRowDraftsRef.current[
                                                                  setRow.id
                                                                ] ?? {}),
                                                                rpe:
                                                                  val === undefined
                                                                    ? null
                                                                    : sanitizeOptionalRpe(val) ??
                                                                      null,
                                                              };
                                                            }}
                                                            onCommitNumber={(val) => {
                                                              const cleanRpe =
                                                                val === undefined
                                                                  ? null
                                                                  : sanitizeOptionalRpe(val) ??
                                                                    null;
                                                              const nextRow =
                                                                mergeRowWithPendingDraft(setRow, {
                                                                  rpe: cleanRpe,
                                                                });
                                                              void onUpsertSet(nextRow);
                                                            }}
                                                            className={`w-full min-h-[44px] px-1 sm:px-2 py-1.5 text-center text-xs sm:text-sm font-mono tabular-nums font-semibold rounded-lg border hl-num-input focus:outline-none focus:ring-2 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                                                              rpeHighEffort
                                                                ? 'bg-amber-50 dark:bg-amber-950/70 border-amber-400 dark:border-amber-500/80 text-amber-900 dark:text-amber-200 focus:ring-amber-500'
                                                                : rpeOptimalEffort
                                                                ? 'bg-emerald-50/70 dark:bg-emerald-950/50 border-emerald-400/80 dark:border-emerald-600/80 text-emerald-900 dark:text-emerald-200 focus:ring-emerald-500'
                                                                : 'hl-input focus:ring-sky-600'
                                                            }`}
                                                          />
                                                        </div>
                                                      )}

                                                      <div className="flex justify-center">
                                                        <button
                                                          type="button"
                                                          data-testid={`set-complete-btn-${setRow.id}`}
                                                          onClick={() =>
                                                            handleToggleComplete(
                                                              setRow,
                                                              ex.name,
                                                              ex.restSeconds
                                                            )
                                                          }
                                                          aria-label={
                                                            setRow.completed
                                                              ? `Mark set ${sIdx + 1} incomplete`
                                                              : `Mark set ${sIdx + 1} complete`
                                                          }
                                                          className={`no-touch-delay min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-colors ${
                                                            setRow.completed
                                                              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                                              : 'hl-input text-slate-400 dark:text-slate-500 hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                                                          } ${isPopped ? 'hl-set-btn-pop' : ''}`}
                                                        >
                                                          <Check className="w-4 h-4" />
                                                        </button>
                                                      </div>
                                                    </motion.div>
                                                  );
                                                })}
                                              </AnimatePresence>
                                            </div>
                                          );
                                        })()}

                                        {/* Clean Expanded Row Footer with Add/Remove Set & Completion Status */}
                                        <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => handleAddSet(ex)}
                                              className="no-touch-delay min-h-[40px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                                            >
                                              <Plus className="w-3.5 h-3.5" />
                                              Add Set
                                            </button>

                                            {exSets.length > 1 && lastSet && (
                                              <button
                                                type="button"
                                                onClick={() => onDeleteSet(lastSet.id)}
                                                className="no-touch-delay min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-50/70 dark:hover:bg-amber-950/30 rounded-lg transition-colors flex items-center gap-1"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Remove Last
                                              </button>
                                            )}
                                          </div>

                                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                            {completedSetsCount} of {exSets.length} logged
                                          </span>
                                        </div>
                                        </>
                                      ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })()}
              {/* Clean Mid-Workout Action Bar: + Add Exercise, + Add Cardio Timer & Workout Complete */}
              <div className="hl-card rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddExerciseOpen(true)}
                    className="no-touch-delay min-h-[44px] px-4 py-2.5 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-blue-500 text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>Add Exercise</span>
                  </button>

                  <button
                    type="button"
                    data-testid="quick-add-cardio-exercise-btn"
                    onClick={() => void handleQuickAddCardioExercise()}
                    className="no-touch-delay min-h-[44px] px-4 py-2.5 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-emerald-500 text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Timer className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Add Cardio Timer</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {sessionStats.completed > 0 && (
                    <button
                      type="button"
                      onClick={handleOpenFinishModal}
                      className="no-touch-delay min-h-[44px] px-3.5 py-2.5 hl-subtle border text-slate-700 dark:text-slate-200 hover:border-slate-400 text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <span>Add Notes</span>
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid="workout-complete-btn"
                    disabled={isFinishing}
                    onClick={handleDirectWorkoutComplete}
                    className="no-touch-delay min-h-[46px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Check className="w-4 h-4 shrink-0" />
                    <span>
                      Workout Complete
                      {sessionStats.completed > 0 ? ` (${sessionStats.completed} logged)` : ''}
                    </span>
                  </button>
                </div>
              </div>

              {/* Progressive Disclosure Accordion: Pump Check-In & Session PDF */}
              <div className="hl-card rounded-2xl overflow-hidden">
                <button
                  type="button"
                  data-testid="toggle-pump-checkin-drawer-btn"
                  onClick={() => setShowSessionFinishDrawer((v) => !v)}
                  className="no-touch-delay w-full px-4 sm:px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      Post-Workout Check-In &amp; Session PDF
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Optional muscle feel check-in ({musclesTrainedToday.length} muscles) &amp;
                      clean PDF summary
                    </p>
                  </div>
                  <span className="min-h-[38px] px-3 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0">
                    <span>{showSessionFinishDrawer ? 'Hide' : 'Open'}</span>
                    {showSessionFinishDrawer ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>

                {showSessionFinishDrawer && (
                  <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-5 space-y-3">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        Share Session PDF Report
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Save or share a clean PDF summary of today&apos;s workout ({sessionStats.completed} sets · Est.{' '}
                        {Math.round(Math.max(1, sessionStats.completed) * 16.5)} kcal). Health Connect
                        and Google Fit sync live in Settings &rarr; Health Integration.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleShareActiveSessionPdf}
                          className="no-touch-delay w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                          <FileText className="w-4 h-4 shrink-0" />
                          <span>Share Session PDF</span>
                        </button>
                      </div>
                    </div>

                    <div className="lg:col-span-7 space-y-3">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        How Did Today&apos;s Muscles Feel?
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                            <div
                              key={mId}
                              className="p-3 rounded-xl hl-subtle border space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-900 dark:text-white">
                                  {lm.shortName}
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                  {currentFb.jointPain > 0
                                    ? 'Ease Volume'
                                    : currentFb.pump >= 1 && currentFb.sorenessRecovery <= 1
                                    ? 'Ready for +1 Set'
                                    : 'Steady Pace'}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <label className="block">
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Muscle Feel
                                  </span>
                                  <select
                                    value={currentFb.pump}
                                    onChange={(e) =>
                                      onSaveFeedback({
                                        ...currentFb,
                                        pump: Number(e.target.value) as 0 | 1 | 2,
                                      })
                                    }
                                    className="mt-1 w-full min-h-[38px] px-2 py-1 text-xs hl-input rounded-lg"
                                  >
                                    <option value={0}>Light</option>
                                    <option value={1}>Good Work</option>
                                    <option value={2}>Strong Pump</option>
                                  </select>
                                </label>

                                <label className="block">
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Joint Comfort
                                  </span>
                                  <select
                                    value={currentFb.jointPain}
                                    onChange={(e) =>
                                      onSaveFeedback({
                                        ...currentFb,
                                        jointPain: Number(e.target.value) as 0 | 1 | 2,
                                      })
                                    }
                                    className="mt-1 w-full min-h-[38px] px-2 py-1 text-xs hl-input rounded-lg"
                                  >
                                    <option value={0}>Comfortable</option>
                                    <option value={1}>Slightly Tight</option>
                                    <option value={2}>Needs Care</option>
                                  </select>
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
            </>
          )}
        </>
      )}

      {/* UNIFIED WORKOUT SELECTOR MODAL: Pick Any Template, Split Day, or Empty Custom Workout */}
      {isWorkoutSwitcherOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workout-switcher-title"
        >
          <div className="hl-card w-full max-w-2xl max-h-[88vh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
              <div>
                <h2
                  id="workout-switcher-title"
                  className="text-base sm:text-lg font-bold text-slate-900 dark:text-white"
                >
                  Select Workout to Track
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Choose a saved routine, a 7-day split day, or start an open session
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsWorkoutSwitcherOpen(false)}
                className="no-touch-delay min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close workout selector"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800/90">
                {(
                  [
                    { id: 'templates', label: `Routines (${templates.length})` },
                    { id: 'schedule', label: '7-Day Split' },
                    { id: 'empty', label: 'Open Session' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSwitcherTab(t.id)}
                    className={`no-touch-delay min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      switcherTab === t.id
                        ? 'bg-slate-900 dark:bg-sky-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {switcherTab === 'templates' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={switcherSearch}
                        onChange={(e) => setSwitcherSearch(e.target.value)}
                        placeholder="Search routines (Strength, Yoga, HIIT, Mobility)..."
                        className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs hl-input rounded-xl"
                      />
                    </div>
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                      {MODALITY_FILTER_ORDER.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSwitcherModality(m.id)}
                          className={`no-touch-delay min-h-[30px] px-2.5 py-0.5 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                            switcherModality === m.id
                              ? 'bg-sky-600 text-white'
                              : 'hl-subtle border text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                    {templates
                      .filter((tpl) => {
                        if (
                          switcherModality !== ExerciseModality.All &&
                          resolveTemplateModality(tpl) !== switcherModality
                        ) {
                          return false;
                        }
                        const q = switcherSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          tpl.name.toLowerCase().includes(q) ||
                          tpl.splitType.toLowerCase().includes(q) ||
                          tpl.description.toLowerCase().includes(q)
                        );
                      })
                      .map((tpl) => {
                        const totalSets = tpl.exercises.reduce((s, e) => s + e.sets, 0);
                        const isCurrentlyActive =
                          isStandaloneActive && activeStandaloneSession?.templateId === tpl.id;

                        return (
                          <div
                            key={tpl.id}
                            className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {tpl.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                                {tpl.category} · {tpl.splitType} · {tpl.exercises.length} exercises ·{' '}
                                {totalSets} sets
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setWorkoutHelpTarget(buildHelpTargetFromTemplate(tpl))
                                }
                                className="no-touch-delay min-h-[40px] px-2.5 py-1.5 text-xs font-semibold hl-subtle border text-sky-600 dark:text-sky-400 hover:border-sky-500 rounded-xl transition-colors flex items-center gap-1 whitespace-nowrap"
                                title={`Workout Help for ${tpl.name}`}
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                                <span>Guide</span>
                              </button>

                              <button
                                type="button"
                                onClick={async () => {
                                  await onStartStandaloneTemplate(tpl);
                                  setIsWorkoutSwitcherOpen(false);
                                }}
                                className={`no-touch-delay min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                                  isCurrentlyActive
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-900 dark:bg-sky-600 hover:opacity-90 text-white'
                                }`}
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span>{isCurrentlyActive ? 'Restart' : 'Start'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {switcherTab === 'schedule' && (
                <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                  {plan.map((d) => {
                    const isCurrentDay = !isStandaloneActive && d.dayNumber === activeDay;
                    const dayLogs = setLogs.filter(
                      (s) =>
                        !s.templateSessionId &&
                        s.week === activeWeek &&
                        s.dayNumber === d.dayNumber
                    );
                    const doneCount = dayLogs.filter((s) => s.completed).length;

                    return (
                      <div
                        key={d.dayNumber}
                        className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {d.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                            {d.isRestDay
                              ? 'Active recovery day'
                              : `${d.exercises.length} exercises · ${doneCount}/${dayLogs.length} sets · ${d.focusSummary}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setWorkoutHelpTarget(
                                buildHelpTargetFromDayPlan(d, activeWeek, weekMeta.targetRir)
                              )
                            }
                            className="no-touch-delay min-h-[40px] px-2.5 py-1.5 text-xs font-semibold hl-subtle border text-sky-600 dark:text-sky-400 hover:border-sky-500 rounded-xl transition-colors flex items-center gap-1 whitespace-nowrap"
                            title={`Workout Help for ${d.title}`}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Guide</span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              await onSelectScheduleDay(d.dayNumber);
                              setIsWorkoutSwitcherOpen(false);
                            }}
                            className={`no-touch-delay min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                              isCurrentDay
                                ? 'bg-emerald-600 text-white'
                                : 'hl-subtle border text-slate-800 dark:text-slate-100 hover:border-sky-500'
                            }`}
                          >
                            {isCurrentDay ? 'Selected' : d.isRestDay ? 'View' : 'Start'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {switcherTab === 'empty' && (
                <div className="space-y-4 py-2">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Start an Open Session
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Start with a clean slate and add movements as you go. Every completed set automatically updates your weekly balance and calendar.
                    </p>
                  </div>

                  <label className="block text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Session Name
                    </span>
                    <input
                      type="text"
                      value={quickWorkoutTitle}
                      onChange={(e) => setQuickWorkoutTitle(e.target.value)}
                      placeholder="e.g. Evening Push & Arms"
                      className="mt-1.5 w-full min-h-[44px] px-3.5 py-2 text-sm hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={async () => {
                      await onStartQuickWorkout(quickWorkoutTitle.trim() || 'Quick Workout');
                      setIsWorkoutSwitcherOpen(false);
                      setIsAddExerciseOpen(true);
                    }}
                    className="no-touch-delay w-full min-h-[44px] px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    <span>Start Open Session &amp; Pick Exercises</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MID-WORKOUT EXERCISE PICKER MODAL */}
      <ExercisePickerModal
        isOpen={isAddExerciseOpen}
        onClose={() => setIsAddExerciseOpen(false)}
        exercises={exerciseLibrary}
        landmarks={landmarks}
        title={`Add Exercise to ${currentDayPlan.title}`}
        alreadySelectedIds={currentDayPlan.exercises
          .map((e) => e.libraryExerciseId)
          .filter((id): id is string => Boolean(id))}
        onSelectExercise={(libEx) => {
          void onAddExerciseToActiveWorkout(libEx);
        }}
        onCreateCustomExercise={onCreateCustomExercise}
      />

      {/* CLEAN FINISH WORKOUT MODAL */}
      {isFinishModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finish-workout-title"
        >
          <div className="hl-card w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="finish-workout-title"
                  className="text-lg font-bold text-slate-900 dark:text-white"
                >
                  Finish Workout
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {currentDayPlan.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFinishModalOpen(false)}
                className="no-touch-delay min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white"
                aria-label="Close finish workout dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl hl-subtle border flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {sessionStats.completed} sets completed
              </span>
              <span className="text-slate-700 dark:text-slate-200 font-semibold">
                {weightUnit === 'kg'
                  ? `${Math.round(sessionStats.tonnageKg).toLocaleString()} kg`
                  : `${Math.round(sessionStats.tonnageKg * 2.20462).toLocaleString()} lb`}{' '}
                lifted
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Session Duration (minutes)
                </span>
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={finishDurationInput}
                  onChange={(e) => setFinishDurationInput(e.target.value)}
                  className="mt-1 w-full min-h-[42px] px-3 py-2 font-mono tabular-nums text-sm hl-input rounded-xl"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Workout Notes (optional)
                </span>
                <textarea
                  rows={2}
                  value={finishNotesInput}
                  onChange={(e) => setFinishNotesInput(e.target.value)}
                  placeholder="How did the session feel? Any wins or adjustments…"
                  className="mt-1 w-full p-3 text-xs hl-input rounded-xl resize-none"
                />
              </label>
            </div>

            <div className="pt-1 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={isFinishing}
                onClick={() => handleConfirmFinishWorkout(false)}
                className="no-touch-delay flex-1 min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Save &amp; Finish</span>
              </button>
              <button
                type="button"
                disabled={isFinishing}
                onClick={() => handleConfirmFinishWorkout(true)}
                className="no-touch-delay flex-1 min-h-[44px] px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4" />
                <span>Finish &amp; Share PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workout Help & Step-by-Step Execution Modal */}
      <WorkoutHelpModal
        isOpen={Boolean(workoutHelpTarget)}
        onClose={() => setWorkoutHelpTarget(null)}
        target={workoutHelpTarget}
        exerciseLibrary={exerciseLibrary}
        landmarks={landmarks}
      />
    </div>
  );
};

import React, { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ChevronDown,
  HelpCircle,
  History,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ExercisePrescription,
  MuscleLandmark,
  SetLogEntry,
} from '../types/workout';
import {
  formatCleanNumberString,
  sanitizeOptionalRpe,
  sanitizeReps,
  sanitizeRir,
} from '../utils/setLogNumeric';
import {
  formatHumanDateShort,
  resolveSetLogDateISO,
} from '../utils/workoutHistory';
import { playTimerSetTone } from '../utils/timerAudio';

export interface CardioExerciseTimerState {
  targetSec: number;
  remainingSec: number;
  elapsedSec: number;
  isRunning: boolean;
  intensityZone: string;
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

export interface NumericSetInputProps {
  value: number | string;
  onCommitNumber: (cleanNum: number | undefined) => void;
  onDraftValueChange?: (cleanNum: number | undefined) => void;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
  maxDecimals?: number;
  placeholder?: string;
  ariaLabel?: string;
  title?: string;
  className?: string;
}

export const NumericSetInput: React.FC<NumericSetInputProps> = memo(({
  value,
  onCommitNumber,
  onDraftValueChange,
  min = 0,
  max,
  allowDecimal = false,
  maxDecimals = 0,
  placeholder,
  ariaLabel,
  title,
  className,
}) => {
  const formattedProp =
    typeof value === 'number'
      ? formatCleanNumberString(value, maxDecimals)
      : String(value ?? '');

  const [draft, setDraft] = React.useState<string>(formattedProp);
  const [focused, setFocused] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!focused) {
      setDraft(formattedProp);
    }
  }, [formattedProp, focused]);

  const commitFinalString = (str: string) => {
    if (str.trim() === '') {
      onDraftValueChange?.(undefined);
      onCommitNumber(undefined);
      return;
    }
    const cleanNum = Number(str.replace(',', '.'));
    if (!Number.isFinite(cleanNum)) {
      setDraft(formattedProp);
      return;
    }
    const clamped = Math.max(min, max !== undefined ? Math.min(max, cleanNum) : cleanNum);
    const factor = Math.pow(10, Math.max(0, maxDecimals));
    const clean = allowDecimal
      ? Math.round(clamped * factor) / factor
      : Math.round(clamped);
    setDraft(formatCleanNumberString(clean, maxDecimals));
    onDraftValueChange?.(clean);
    onCommitNumber(clean);
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
        const currentStr = formatCleanNumberString(
          typeof value === 'number' ? value : null,
          maxDecimals
        );
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
        const withinBounds = parsed >= min && (max === undefined || parsed <= max);
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
});

NumericSetInput.displayName = 'NumericSetInput';

/* =========================================================================
   MEMOIZED TRACK SET ROW (.hl-set-row-pop)
   Guarantees zero re-renders when other rows or timer seconds update
   ========================================================================= */
export interface TrackSetRowProps {
  setRow: SetLogEntry;
  sIdx: number;
  showRpeCol: boolean;
  weightUnit: 'kg' | 'lb';
  gridColsClass: string;
  isPopped: boolean;
  shouldReduceMotion: boolean;
  formatWeightDisplay: (kg: number) => number;
  parseWeightToKg: (inputVal: number) => number;
  onCommitWeight: (setRow: SetLogEntry, weightKg: number) => void;
  onDraftWeight: (setId: string, weightKg: number) => void;
  onCommitReps: (setRow: SetLogEntry, reps: number) => void;
  onDraftReps: (setId: string, reps: number) => void;
  onCommitRir: (setRow: SetLogEntry, rir: number) => void;
  onCommitRpe: (setRow: SetLogEntry, rpe: number | null) => void;
  onDraftRpe: (setId: string, rpe: number | null) => void;
  onToggleComplete: (setRow: SetLogEntry) => void;
}

export const TrackSetRow = memo<TrackSetRowProps>(({
  setRow,
  sIdx,
  showRpeCol,
  weightUnit,
  gridColsClass,
  isPopped,
  shouldReduceMotion,
  formatWeightDisplay,
  parseWeightToKg,
  onCommitWeight,
  onDraftWeight,
  onCommitReps,
  onDraftReps,
  onCommitRir,
  onCommitRpe,
  onDraftRpe,
  onToggleComplete,
}) => {
  const rirVisual = getRirVisualFeedback(setRow.rir);
  const hasMatchingOption = RIR_OPTIONS.some((o) => o.value === setRow.rir);
  const rpeHighEffort = typeof setRow.rpe === 'number' && setRow.rpe >= 9.5;
  const rpeOptimalEffort = typeof setRow.rpe === 'number' && setRow.rpe >= 7 && setRow.rpe < 9.5;

  return (
    <motion.div
      layout={!shouldReduceMotion}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.985 }}
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
          value={formatWeightDisplay(setRow.weightKg)}
          onDraftValueChange={(val) => {
            if (val === undefined) return;
            onDraftWeight(setRow.id, parseWeightToKg(Math.max(0, val)));
          }}
          onCommitNumber={(val) => {
            if (val === undefined) return;
            onCommitWeight(setRow, parseWeightToKg(Math.max(0, val)));
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
            onDraftReps(setRow.id, sanitizeReps(val, 1));
          }}
          onCommitNumber={(val) => {
            if (val === undefined) return;
            onCommitReps(setRow, sanitizeReps(val, 1));
          }}
          className="w-full min-h-[44px] px-1.5 sm:px-2.5 py-1.5 text-center text-xs sm:text-sm font-mono tabular-nums font-semibold hl-input hl-num-input rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
        />
      </div>

      <div>
        <select
          aria-label={`Set ${sIdx + 1} Reps in Reserve`}
          value={
            hasMatchingOption
              ? setRow.rir
              : Math.min(4, Math.max(0, Math.round(setRow.rir)))
          }
          onChange={(e) => {
            const nextRir = sanitizeRir(Number(e.target.value), 2);
            onCommitRir(setRow, nextRir);
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
              setRow.rpe !== undefined && setRow.rpe !== null
                ? sanitizeOptionalRpe(setRow.rpe) ?? ''
                : ''
            }
            onDraftValueChange={(val) => {
              const cleanRpe =
                val === undefined ? null : sanitizeOptionalRpe(val) ?? null;
              onDraftRpe(setRow.id, cleanRpe);
            }}
            onCommitNumber={(val) => {
              const cleanRpe =
                val === undefined ? null : sanitizeOptionalRpe(val) ?? null;
              onCommitRpe(setRow, cleanRpe);
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
          onClick={() => onToggleComplete(setRow)}
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
});

TrackSetRow.displayName = 'TrackSetRow';

/* =========================================================================
   MEMOIZED TRACK EXERCISE CARD (.hl-card)
   Guarantees zero re-renders when unrelated exercises or rest timers update
   ========================================================================= */
export interface TrackExerciseCardProps {
  ex: ExercisePrescription;
  idx: number;
  exSets: SetLogEntry[];
  landmark: MuscleLandmark | undefined;
  prevList: Array<{ weightKg: number; reps: number; rpe?: number }> | undefined;
  recentThree: SetLogEntry[];
  cardioMode: boolean;
  cardioTimer: CardioExerciseTimerState | null;
  isExpanded: boolean;
  isFocused: boolean;
  isHistoryModalOpen: boolean;
  cardPopDirection: 'expand' | 'collapse' | undefined;
  poppedSetId: string | null;
  weightUnit: 'kg' | 'lb';
  showAdvancedRpe: boolean;
  shouldReduceMotion: boolean;
  restDuration: number;
  soundEnabled: boolean;
  onToggleExpand: (exId: string) => void;
  onOpenHistoryModal: (ex: ExercisePrescription) => void;
  onCloseHistoryModal: () => void;
  onApplyPrevious: (
    ex: ExercisePrescription,
    prev: Array<{ weightKg: number; reps: number; rpe?: number }>
  ) => void;
  onStartRestCountdown: (seconds: number, name: string) => void;
  onOpenFormHelp: (ex: ExercisePrescription) => void;
  onRemoveExercise: (exId: string) => void;
  onAddSet: (ex: ExercisePrescription) => void;
  onDeleteSet: (id: string) => void;
  onToggleSetComplete: (
    entry: SetLogEntry,
    exerciseName: string,
    prescribedRestSec?: number
  ) => void;
  onCardAnimationEnd: (exId: string) => void;
  formatWeightDisplay: (kg: number) => number;
  parseWeightToKg: (inputVal: number) => number;
  onCommitWeight: (setRow: SetLogEntry, weightKg: number) => void;
  onDraftWeight: (setId: string, weightKg: number) => void;
  onCommitReps: (setRow: SetLogEntry, reps: number) => void;
  onDraftReps: (setId: string, reps: number) => void;
  onCommitRir: (setRow: SetLogEntry, rir: number) => void;
  onCommitRpe: (setRow: SetLogEntry, rpe: number | null) => void;
  onDraftRpe: (setId: string, rpe: number | null) => void;
  onUpdateCardioTimer: (
    ex: ExercisePrescription,
    updater: (prev: CardioExerciseTimerState) => CardioExerciseTimerState
  ) => void;
  onCompleteCardioTimer: (ex: ExercisePrescription) => void;
  canRemove: boolean;
}

export const TrackExerciseCard = memo<TrackExerciseCardProps>(({
  ex,
  idx,
  exSets,
  landmark,
  prevList,
  recentThree,
  cardioMode,
  cardioTimer,
  isExpanded,
  isHistoryModalOpen,
  cardPopDirection,
  poppedSetId,
  weightUnit,
  showAdvancedRpe,
  shouldReduceMotion,
  restDuration,
  soundEnabled,
  onToggleExpand,
  onOpenHistoryModal,
  onCloseHistoryModal,
  onApplyPrevious,
  onStartRestCountdown,
  onOpenFormHelp,
  onRemoveExercise,
  onAddSet,
  onDeleteSet,
  onToggleSetComplete,
  onCardAnimationEnd,
  formatWeightDisplay,
  parseWeightToKg,
  onCommitWeight,
  onDraftWeight,
  onCommitReps,
  onDraftReps,
  onCommitRir,
  onCommitRpe,
  onDraftRpe,
  onUpdateCardioTimer,
  onCompleteCardioTimer,
  canRemove,
}) => {
  const completedSetsCount = exSets.filter((s) => s.completed).length;
  const lastSet = exSets[exSets.length - 1];
  const hasUncompletedSets = exSets.some((s) => !s.completed);
  const cardioPrimarySet = exSets[0];
  const isCardioDone = Boolean(cardioPrimarySet?.completed);
  const isExerciseComplete = cardioMode
    ? isCardioDone
    : exSets.length > 0 && completedSetsCount === exSets.length;
  const targetMuscleName = landmark?.name ?? ex.muscleId;

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

  const showRpeCol =
    showAdvancedRpe ||
    exSets.some((s) => s.rpe !== undefined && s.rpe !== null);

  const gridColsClass = showRpeCol
    ? 'grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.15fr)_minmax(0,0.85fr)_2.75rem] sm:grid-cols-[2.75rem_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)_3.25rem]'
    : 'grid-cols-[2.25rem_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1.2fr)_2.85rem] sm:grid-cols-[2.75rem_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_3.25rem]';

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div
      data-testid={cardioMode ? `cardio-timer-card-${ex.id}` : `strength-card-${ex.id}`}
      data-card-pop={cardPopDirection ?? undefined}
      onAnimationEnd={(ev) => {
        if (ev.target === ev.currentTarget && cardPopDirection) {
          onCardAnimationEnd(ex.id);
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
        cardioMode && poppedSetId === cardioPrimarySet?.id ? 'hl-set-row-pop' : ''
      }`}
    >
      {/* Single Compact Row by Default */}
      <div
        data-testid={`compact-exercise-row-${ex.id}`}
        className="relative px-3.5 sm:px-4 py-2 min-h-[60px] flex items-center justify-between gap-2"
      >
        <button
          type="button"
          onClick={() => onToggleExpand(ex.id)}
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
                : `${completedSetsCount} of ${exSets.length} done`}
            </span>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* History Icon Button */}
          <button
            type="button"
            data-testid={`exercise-history-btn-${ex.id}`}
            aria-expanded={isHistoryModalOpen}
            aria-haspopup="dialog"
            aria-label={`View previous 3 sets for ${ex.name}`}
            title={historyTooltip}
            onClick={() => onOpenHistoryModal(ex)}
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
              {recentThree.length > 0 ? `History (${recentThree.length})` : 'History'}
            </span>
          </button>

          {/* Expand Icon Button */}
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
            onClick={() => onToggleExpand(ex.id)}
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

        {/* Anchored Mini-Modal: Most Recent 3 Set Logs */}
        <AnimatePresence>
          {isHistoryModalOpen && (
            <motion.div
              key={`history-mini-modal-${ex.id}`}
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
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
                  onClick={onCloseHistoryModal}
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
                {!cardioMode && recentThree.length > 0 && hasUncompletedSets && (
                  <button
                    type="button"
                    data-testid="apply-exercise-history-btn"
                    onClick={() => {
                      onApplyPrevious(
                        ex,
                        recentThree.map((s) => ({
                          weightKg: s.weightKg,
                          reps: s.reps,
                          rpe: s.rpe,
                        }))
                      );
                      onCloseHistoryModal();
                    }}
                    className="no-touch-delay flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    Use Weights &amp; Reps
                  </button>
                )}
                <button
                  type="button"
                  data-testid="done-exercise-history-modal-btn"
                  onClick={onCloseHistoryModal}
                  className={`no-touch-delay min-h-[40px] px-4 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 transition-colors ${
                    !cardioMode && recentThree.length > 0 && hasUncompletedSets
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

      {/* Hidden Div: Weight/Rep History & Set Inputs */}
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
                        onStartRestCountdown(
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
                {!cardioMode && prevList && prevList.length > 0 && hasUncompletedSets && (
                  <button
                    type="button"
                    onClick={() => onApplyPrevious(ex, prevList)}
                    className="no-touch-delay min-h-[34px] px-2.5 py-1 rounded-lg hl-subtle border text-xs font-semibold text-sky-600 dark:text-sky-400 hover:border-sky-500 transition-colors whitespace-nowrap"
                  >
                    Use Last
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onOpenFormHelp(ex)}
                  className="no-touch-delay min-h-[34px] px-2.5 py-1 rounded-lg hl-subtle border text-xs font-semibold text-sky-600 dark:text-sky-400 hover:border-sky-500 transition-colors flex items-center gap-1 whitespace-nowrap"
                  title={`How to perform ${ex.name}`}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Form</span>
                </button>

                {canRemove && (
                  <button
                    type="button"
                    onClick={() => onRemoveExercise(ex.id)}
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
                /* Cardio Tracker */
                <div className="space-y-3.5 pt-0.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200/80 dark:border-slate-800">
                    <div className="flex items-center gap-3.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            playTimerSetTone(soundEnabled);
                            onUpdateCardioTimer(ex, (st) => {
                              const nextTarget = Math.max(60, st.targetSec - 60);
                              return {
                                ...st,
                                targetSec: nextTarget,
                                remainingSec: Math.max(10, st.remainingSec - 60),
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
                            className="font-mono tabular-nums text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white"
                          >
                            {Math.floor(cardioTimer.remainingSec / 60)}:
                            {String(cardioTimer.remainingSec % 60).padStart(2, '0')}
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            {cardioTimer.isRunning ? 'Active Countdown' : 'Timer Ready'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            playTimerSetTone(soundEnabled);
                            onUpdateCardioTimer(ex, (st) => {
                              const nextTarget = Math.min(3600, st.targetSec + 60);
                              return {
                                ...st,
                                targetSec: nextTarget,
                                remainingSec: st.remainingSec + 60,
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

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid={`cardio-toggle-btn-${ex.id}`}
                        onClick={() => {
                          playTimerSetTone(soundEnabled);
                          onUpdateCardioTimer(ex, (st) => ({
                            ...st,
                            remainingSec:
                              st.remainingSec <= 0 ? st.targetSec : st.remainingSec,
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
                          playTimerSetTone(soundEnabled);
                          onUpdateCardioTimer(ex, (st) => ({
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
                        onClick={() => onCompleteCardioTimer(ex)}
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
                              playTimerSetTone(soundEnabled);
                              onUpdateCardioTimer(ex, (st) => ({
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
                        onUpdateCardioTimer(ex, (st) => ({
                          ...st,
                          intensityZone: e.target.value,
                        }))
                      }
                      className="min-h-[38px] px-2.5 py-1 text-xs font-semibold hl-input rounded-lg"
                    >
                      <option value="Zone 2 Aerobic Base">Zone 2 Aerobic Base</option>
                      <option value="Zone 3 Tempo">Zone 3 Tempo</option>
                      <option value="Zone 4 Threshold">Zone 4 Threshold</option>
                      <option value="HIIT Intervals">HIIT Intervals</option>
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div
                      className={`grid ${gridColsClass} gap-1.5 sm:gap-2.5 px-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 items-center`}
                    >
                      <div className="text-center">Set</div>
                      <div className="text-center">Weight ({weightUnit})</div>
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
                      {exSets.map((setRow, sIdx) => (
                        <TrackSetRow
                          key={setRow.id}
                          setRow={setRow}
                          sIdx={sIdx}
                          showRpeCol={showRpeCol}
                          weightUnit={weightUnit}
                          gridColsClass={gridColsClass}
                          isPopped={poppedSetId === setRow.id}
                          shouldReduceMotion={Boolean(shouldReduceMotion)}
                          formatWeightDisplay={formatWeightDisplay}
                          parseWeightToKg={parseWeightToKg}
                          onCommitWeight={onCommitWeight}
                          onDraftWeight={onDraftWeight}
                          onCommitReps={onCommitReps}
                          onDraftReps={onDraftReps}
                          onCommitRir={onCommitRir}
                          onCommitRpe={onCommitRpe}
                          onDraftRpe={onDraftRpe}
                          onToggleComplete={() =>
                            onToggleSetComplete(setRow, ex.name, ex.restSeconds)
                          }
                        />
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Clean Expanded Row Footer */}
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onAddSet(ex)}
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
});

TrackExerciseCard.displayName = 'TrackExerciseCard';

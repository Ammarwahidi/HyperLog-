import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Pause, Play, Timer, XCircle } from 'lucide-react';
import type { ActiveWorkoutRunState } from '../types/workout';

interface MinimizedWorkoutBarProps {
  workoutTitle: string;
  runState?: ActiveWorkoutRunState | null;
  elapsedSeconds?: number;
  isPaused: boolean;
  completedSets: number;
  totalSets: number;
  onOpenTracker: () => void;
  onTogglePause: () => void;
  onCancelWorkout?: (discardLoggedSets: boolean) => void;
}

export function computeElapsedFromRunState(run: ActiveWorkoutRunState | null | undefined): number {
  if (!run || !run.isActive) return 0;
  const base = Math.max(0, Math.floor(run.accumulatedSeconds || 0));
  if (run.isPaused) return base;
  const delta = Math.max(0, Math.floor((Date.now() - run.lastResumedAtMs) / 1000));
  return base + delta;
}

export function formatGlobalWorkoutClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
      secs
    ).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function useLiveWorkoutElapsed(
  runState: ActiveWorkoutRunState | null | undefined,
  fallbackElapsedSeconds = 0
): number {
  const [elapsed, setElapsed] = useState<number>(() =>
    runState ? computeElapsedFromRunState(runState) : fallbackElapsedSeconds
  );

  useEffect(() => {
    if (!runState) {
      setElapsed(fallbackElapsedSeconds);
      return;
    }
    setElapsed(computeElapsedFromRunState(runState));
    if (!runState.isActive || runState.isPaused) {
      return;
    }
    const id = window.setInterval(() => {
      setElapsed(computeElapsedFromRunState(runState));
    }, 1000);
    return () => window.clearInterval(id);
  }, [runState, fallbackElapsedSeconds]);

  return runState ? elapsed : fallbackElapsedSeconds;
}

export const LiveWorkoutClock: React.FC<{
  runState: ActiveWorkoutRunState | null | undefined;
  prefix?: string;
  className?: string;
  testId?: string;
}> = React.memo(({ runState, prefix = '', className, testId }) => {
  const elapsed = useLiveWorkoutElapsed(runState, 0);
  return (
    <span data-testid={testId} className={className}>
      {prefix}
      {formatGlobalWorkoutClock(elapsed)}
    </span>
  );
});
LiveWorkoutClock.displayName = 'LiveWorkoutClock';

export const MinimizedWorkoutBar: React.FC<MinimizedWorkoutBarProps> = React.memo(
  ({
    workoutTitle,
    runState,
    elapsedSeconds = 0,
    isPaused,
    completedSets,
    totalSets,
    onOpenTracker,
    onTogglePause,
    onCancelWorkout,
  }) => {
    const [confirmStopOpen, setConfirmStopOpen] = useState<boolean>(false);
    const liveElapsed = useLiveWorkoutElapsed(runState, elapsedSeconds);

    return (
      <div
        role="region"
        aria-label="Active workout session"
        className="fixed left-3 right-3 sm:left-auto sm:right-6 sm:w-[440px] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-40 hl-card border border-blue-500/40 dark:border-blue-400/40 shadow-lg rounded-2xl p-3 space-y-2.5 backdrop-blur-md"
      >
        <div className="flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onOpenTracker}
            className="no-touch-delay flex-1 min-w-0 text-left flex items-center gap-3 group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Timer className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono tabular-nums text-sm font-bold ${
                    isPaused
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatGlobalWorkoutClock(liveElapsed)}
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  · {isPaused ? 'Paused' : 'In Progress'}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {workoutTitle}
                {totalSets > 0 ? ` (${completedSets}/${totalSets})` : ''}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onTogglePause}
              aria-label={isPaused ? 'Resume workout timer' : 'Pause workout timer'}
              className="no-touch-delay min-h-[44px] min-w-[44px] rounded-xl hl-subtle border text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 flex items-center justify-center"
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>

            {onCancelWorkout && (
              <button
                type="button"
                data-testid="minimized-bar-cancel-workout-btn"
                onClick={() => setConfirmStopOpen((prev) => !prev)}
                aria-label="Stop or switch workout"
                className="no-touch-delay min-h-[44px] px-2.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Stop</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenTracker}
              className="no-touch-delay min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 hover:opacity-90"
            >
              <span>Open</span>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        </div>

        {confirmStopOpen && onCancelWorkout && (
          <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              Stop this workout and pick a different activity?
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmStopOpen(false);
                  onCancelWorkout(false);
                }}
                className="no-touch-delay flex-1 min-h-[44px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold whitespace-nowrap shrink-0"
              >
                Switch Activity
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmStopOpen(false);
                  onCancelWorkout(true);
                }}
                className="no-touch-delay flex-1 min-h-[44px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold whitespace-nowrap shrink-0"
              >
                Cancel &amp; Discard Sets
              </button>
              <button
                type="button"
                onClick={() => setConfirmStopOpen(false)}
                className="no-touch-delay min-h-[44px] px-3 py-1.5 rounded-xl hl-subtle border text-slate-700 dark:text-slate-200 font-semibold whitespace-nowrap shrink-0"
              >
                Keep Going
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
);
MinimizedWorkoutBar.displayName = 'MinimizedWorkoutBar';

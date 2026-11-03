import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import {
  LibraryExercise,
  SetLogEntry,
  WorkoutDayPlan,
} from '../types/workout';

export interface ExerciseProgressChartProps {
  exercise: LibraryExercise;
  setLogs: SetLogEntry[];
  plan: WorkoutDayPlan[];
  weightUnit: 'kg' | 'lb';
  isDark: boolean;
}

type ChartMetricMode = 'topWeight' | 'avgWeight' | 'est1rm';

interface SessionProgressPoint {
  sessionKey: string;
  shortLabel: string;
  fullLabel: string;
  sortOrder: number;
  topWeight: number;
  avgWeight: number;
  est1rm: number;
  topSetReps: number;
  setsCompleted: number;
  avgRpe: number | null;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function convertWeight(kg: number, unit: 'kg' | 'lb'): number {
  const val = unit === 'kg' ? kg : kg * 2.20462;
  return Number(val.toFixed(1));
}

function formatShortDate(isoDate: string): string {
  const parsed = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate.slice(0, 10);
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SessionProgressPoint }>;
  weightUnit: 'kg' | 'lb';
}

const ProgressionTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  weightUnit,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

  return (
    <div className="hl-card rounded-xl p-3 shadow-lg border border-slate-200 dark:border-slate-700 text-xs space-y-1.5 min-w-[185px]">
      <div className="font-bold text-slate-900 dark:text-white border-b border-slate-200/80 dark:border-slate-800 pb-1">
        {point.fullLabel}
      </div>
      <div className="flex items-center justify-between gap-4 font-mono tabular-nums">
        <span className="text-slate-500 dark:text-slate-400">Top Set</span>
        <span className="font-bold text-blue-600 dark:text-blue-400">
          {point.topWeight} {weightUnit} × {point.topSetReps}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 font-mono tabular-nums">
        <span className="text-slate-500 dark:text-slate-400">Avg Load</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">
          {point.avgWeight} {weightUnit}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 font-mono tabular-nums">
        <span className="text-slate-500 dark:text-slate-400">Est. 1RM</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">
          {point.est1rm} {weightUnit}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 font-mono tabular-nums pt-0.5 border-t border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
        <span>{point.setsCompleted} sets logged</span>
        {point.avgRpe !== null && <span>RPE {point.avgRpe}</span>}
      </div>
    </div>
  );
};

export const ExerciseProgressChart: React.FC<ExerciseProgressChartProps> = ({
  exercise,
  setLogs,
  plan,
  weightUnit,
  isDark,
}) => {
  const [metricMode, setMetricMode] = useState<ChartMetricMode>('topWeight');

  const sessionHistory = useMemo<SessionProgressPoint[]>(() => {
    const targetName = normalizeName(exercise.name);

    const matchingPlanExerciseIds = new Set<string>([exercise.id]);
    for (const day of plan) {
      for (const presc of day.exercises) {
        if (
          presc.libraryExerciseId === exercise.id ||
          normalizeName(presc.name) === targetName
        ) {
          matchingPlanExerciseIds.add(presc.id);
        }
      }
    }

    const matchingLogs = setLogs.filter((entry) => {
      if (!entry.completed) return false;
      if (matchingPlanExerciseIds.has(entry.exerciseId)) return true;
      return normalizeName(entry.exerciseName) === targetName;
    });

    if (matchingLogs.length === 0) {
      return [];
    }

    const grouped = new Map<string, SetLogEntry[]>();
    for (const log of matchingLogs) {
      const localDate = log.completedDate ?? log.completedAt?.slice(0, 10);
      let key: string;
      if (log.templateSessionId) {
        key = `tpl_${log.templateSessionId}`;
      } else if (localDate) {
        key = `dt_${localDate}_w${log.week}_d${log.dayNumber}`;
      } else {
        key = `wk_${log.week}_d_${log.dayNumber}`;
      }
      const bucket = grouped.get(key);
      if (bucket) {
        bucket.push(log);
      } else {
        grouped.set(key, [log]);
      }
    }

    const points: SessionProgressPoint[] = [];
    for (const [sessionKey, logs] of grouped.entries()) {
      let bestSet = logs[0];
      let weightSumKg = 0;
      let bestE1rmKg = 0;
      let rpeSum = 0;
      let rpeCount = 0;

      for (const item of logs) {
        weightSumKg += item.weightKg;
        if (
          item.weightKg > bestSet.weightKg ||
          (item.weightKg === bestSet.weightKg && item.reps > bestSet.reps)
        ) {
          bestSet = item;
        }
        const e1rm = item.weightKg * (1 + item.reps / 30);
        if (e1rm > bestE1rmKg) {
          bestE1rmKg = e1rm;
        }
        if (typeof item.rpe === 'number' && !Number.isNaN(item.rpe)) {
          rpeSum += item.rpe;
          rpeCount += 1;
        }
      }

      const avgWeightKg = weightSumKg / logs.length;
      const sample = logs[0];
      const dateIso = sample.completedDate ?? sample.completedAt?.slice(0, 10);
      const parsedTime = dateIso ? Date.parse(`${dateIso}T12:00:00Z`) : Number.NaN;
      const fallbackOrder = sample.week * 100 + sample.dayNumber;
      const sortOrder = !Number.isNaN(parsedTime)
        ? parsedTime + sample.week * 10 + sample.dayNumber
        : fallbackOrder;

      const shortDate = dateIso ? formatShortDate(dateIso) : null;
      const weekTag =
        sample.week > 0
          ? sample.dayNumber > 0
            ? `Wk ${sample.week} D${sample.dayNumber}`
            : `Wk ${sample.week} Template`
          : 'Prior Meso';

      points.push({
        sessionKey,
        shortLabel: shortDate ?? weekTag,
        fullLabel: shortDate ? `${shortDate} · ${weekTag}` : weekTag,
        sortOrder,
        topWeight: convertWeight(bestSet.weightKg, weightUnit),
        avgWeight: convertWeight(avgWeightKg, weightUnit),
        est1rm: convertWeight(bestE1rmKg, weightUnit),
        topSetReps: bestSet.reps,
        setsCompleted: logs.length,
        avgRpe: rpeCount > 0 ? Number((rpeSum / rpeCount).toFixed(1)) : null,
      });
    }

    points.sort((a, b) => a.sortOrder - b.sortOrder);
    return points.slice(-10);
  }, [exercise.id, exercise.name, setLogs, plan, weightUnit]);

  const summary = useMemo(() => {
    if (sessionHistory.length === 0) return null;
    const values = sessionHistory.map((p) => p[metricMode]);
    const firstVal = values[0];
    const latestVal = values[values.length - 1];
    const peakVal = Math.max(...values);
    const minVal = Math.min(...values);
    const delta = Number((latestVal - firstVal).toFixed(1));
    const pad = Math.max(2.5, (peakVal - minVal) * 0.25);
    const yMin = Math.max(0, Math.floor((minVal - pad) / 2.5) * 2.5);
    const yMax = Math.ceil((peakVal + pad) / 2.5) * 2.5;

    return {
      firstVal,
      latestVal,
      peakVal,
      delta,
      yMin,
      yMax: yMax <= yMin ? yMin + 10 : yMax,
    };
  }, [sessionHistory, metricMode]);

  const metricLabel =
    metricMode === 'topWeight'
      ? 'Top Set Load'
      : metricMode === 'avgWeight'
      ? 'Avg Working Load'
      : 'Estimated 1RM';

  const gridStroke = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.08)';
  const axisTickColor = isDark ? '#94A3B8' : '#64748B';
  const strokeColor = isDark ? '#38BDF8' : '#2563EB';
  const gradientId = `hlWeightGrad_${exercise.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <div className="p-4 sm:p-5 rounded-2xl hl-subtle border space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Historical Weight Progression (Last 10 Sessions)
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {sessionHistory.length > 0
              ? `${sessionHistory.length} completed ${
                  sessionHistory.length === 1 ? 'session' : 'sessions'
                } tracked · Updates live as sets are logged`
              : 'No completed sessions logged yet for this movement'}
          </p>
        </div>

        {sessionHistory.length > 0 && (
          <div
            className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800/90 self-start sm:self-auto"
            role="group"
            aria-label="Progression chart metric"
          >
            {(
              [
                { id: 'topWeight', label: 'Top Load' },
                { id: 'avgWeight', label: 'Avg Load' },
                { id: 'est1rm', label: 'Est. 1RM' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMetricMode(opt.id)}
                className={`min-h-[32px] px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  metricMode === opt.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {sessionHistory.length === 0 || !summary ? (
        <div className="py-8 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-1.5">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            No historical sets recorded for {exercise.name} yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Add this exercise to a workout day or template and mark sets complete in the Track tab
            to plot your 10-session load progression curve.
          </p>
        </div>
      ) : (
        <>
          {/* Unboxed KPI Summary Row */}
          <div className="grid grid-cols-3 gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Latest {metricLabel}
              </div>
              <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {summary.latestVal} {weightUnit}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {sessionHistory.length}-Session Change
              </div>
              <div
                className={`text-base sm:text-lg font-bold font-mono tabular-nums mt-0.5 ${
                  summary.delta > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : summary.delta < 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {summary.delta > 0 ? `+${summary.delta}` : summary.delta} {weightUnit}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                10-Session Peak
              </div>
              <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {summary.peakVal} {weightUnit}
              </div>
            </div>
          </div>

          {/* Recharts Area Progression Visualization */}
          <div className="w-full h-[230px] min-w-0 pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sessionHistory}
                margin={{ top: 8, right: 10, left: -12, bottom: 2 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={strokeColor} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={gridStroke}
                />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[summary.yMin, summary.yMax]}
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip
                  content={<ProgressionTooltip weightUnit={weightUnit} />}
                  cursor={{
                    stroke: strokeColor,
                    strokeWidth: 1,
                    strokeDasharray: '3 3',
                  }}
                />
                {sessionHistory.length > 1 && (
                  <ReferenceLine
                    y={summary.firstVal}
                    stroke={axisTickColor}
                    strokeDasharray="4 4"
                    strokeOpacity={0.45}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey={metricMode}
                  name={metricLabel}
                  stroke={strokeColor}
                  strokeWidth={2.5}
                  fill={`url(#${gradientId})`}
                  dot={{
                    r: 3.5,
                    fill: strokeColor,
                    strokeWidth: 1.5,
                    stroke: isDark ? '#0F172A' : '#FFFFFF',
                  }}
                  activeDot={{
                    r: 5.5,
                    fill: strokeColor,
                    strokeWidth: 2,
                    stroke: isDark ? '#0F172A' : '#FFFFFF',
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};

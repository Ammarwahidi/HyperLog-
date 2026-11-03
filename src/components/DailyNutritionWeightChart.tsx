import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, Check, Minus, Plus, Scale } from 'lucide-react';
import { DailyNutritionRecord, NutritionGoals } from '../types/workout';
import { LB_PER_KG } from '../utils/setLogNumeric';

export interface DailyNutritionWeightChartProps {
  nutritionByDate: Record<string, DailyNutritionRecord>;
  nutritionGoals: NutritionGoals;
  todayIso: string;
  isDark?: boolean;
  onUpdateTodayBodyweight?: (newWeightKg: number) => Promise<void>;
  onSaveWeightForDate?: (dateIso: string, newWeightKg: number) => Promise<void>;
}

type ChartRangeOption = '7d' | '14d' | '30d' | 'all';

interface NutritionWeightPoint {
  date: string;
  shortDate: string;
  bodyweightDisplay: number | null;
  bodyweightKg: number | null;
  calories: number;
  proteinG: number;
  mealsCount: number;
}

function formatAxisShortDate(dateIso: string): string {
  const parts = dateIso.split('-');
  if (parts.length !== 3) return dateIso;
  const monthIdx = Math.max(0, Math.min(11, Number(parts[1]) - 1));
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[monthIdx]} ${Number(parts[2])}`;
}

export const DailyNutritionWeightChart: React.FC<DailyNutritionWeightChartProps> = ({
  nutritionByDate,
  nutritionGoals,
  todayIso,
  isDark = false,
  onUpdateTodayBodyweight,
  onSaveWeightForDate,
}) => {
  const [range, setRange] = useState<ChartRangeOption>('14d');
  const [selectedWeightDate, setSelectedWeightDate] = useState<string>(todayIso);
  const weightUnit = nutritionGoals.weightUnit;

  const selectedDateRecord = nutritionByDate[selectedWeightDate];
  const fallbackLatestWeightKg = useMemo(() => {
    const dates = Object.keys(nutritionByDate).sort();
    for (let i = dates.length - 1; i >= 0; i--) {
      const rec = nutritionByDate[dates[i]];
      if (rec && typeof rec.bodyweightKg === 'number' && rec.bodyweightKg > 20) {
        return rec.bodyweightKg;
      }
    }
    return 82.7;
  }, [nutritionByDate]);

  const currentWeightDisplay = useMemo(() => {
    const rawKg =
      selectedDateRecord &&
      typeof selectedDateRecord.bodyweightKg === 'number' &&
      selectedDateRecord.bodyweightKg > 20
        ? selectedDateRecord.bodyweightKg
        : fallbackLatestWeightKg;
    const val = weightUnit === 'lb' ? rawKg * LB_PER_KG : rawKg;
    return (Math.round(val * 10) / 10).toFixed(1);
  }, [selectedDateRecord, fallbackLatestWeightKg, weightUnit]);

  const [weightDraft, setWeightDraft] = useState<string>(currentWeightDisplay);
  const [savedWeightFlash, setSavedWeightFlash] = useState<boolean>(false);

  useEffect(() => {
    setWeightDraft(currentWeightDisplay);
  }, [currentWeightDisplay, selectedWeightDate]);

  const allSeries = useMemo<NutritionWeightPoint[]>(() => {
    const sortedDates = Object.keys(nutritionByDate).sort((a, b) => (a < b ? -1 : 1));
    return sortedDates
      .map((dateIso) => {
        const rec = nutritionByDate[dateIso];
        if (!rec) return null;
        const kcal = (rec.meals || []).reduce(
          (sum, m) => sum + (Number.isFinite(m.calories) ? m.calories : 0),
          0
        );
        const prot = (rec.meals || []).reduce(
          (sum, m) => sum + (Number.isFinite(m.proteinG) ? m.proteinG : 0),
          0
        );
        const hasValidWeight =
          typeof rec.bodyweightKg === 'number' &&
          Number.isFinite(rec.bodyweightKg) &&
          rec.bodyweightKg > 20;
        const dispW = hasValidWeight
          ? Math.round(
              (weightUnit === 'lb' ? rec.bodyweightKg * LB_PER_KG : rec.bodyweightKg) * 10
            ) / 10
          : null;

        return {
          date: dateIso,
          shortDate: formatAxisShortDate(dateIso),
          bodyweightDisplay: dispW,
          bodyweightKg: hasValidWeight ? rec.bodyweightKg : null,
          calories: Math.round(kcal),
          proteinG: Math.round(prot),
          mealsCount: (rec.meals || []).length,
        };
      })
      .filter((item): item is NutritionWeightPoint => Boolean(item));
  }, [nutritionByDate, weightUnit]);

  const filteredData = useMemo(() => {
    if (range === 'all') return allSeries;
    const limit = range === '7d' ? 7 : range === '14d' ? 14 : 30;
    return allSeries.slice(-limit);
  }, [allSeries, range]);

  const summaryStats = useMemo(() => {
    const weightPoints = filteredData.filter(
      (d): d is NutritionWeightPoint & { bodyweightDisplay: number } =>
        d.bodyweightDisplay !== null
    );
    const caloriePoints = filteredData.filter((d) => d.calories > 0);

    const latestWeight =
      weightPoints.length > 0 ? weightPoints[weightPoints.length - 1].bodyweightDisplay : null;
    const firstWeight = weightPoints.length > 0 ? weightPoints[0].bodyweightDisplay : null;
    const weightDelta =
      latestWeight !== null && firstWeight !== null
        ? Math.round((latestWeight - firstWeight) * 10) / 10
        : 0;

    const avgCalories =
      caloriePoints.length > 0
        ? Math.round(caloriePoints.reduce((acc, d) => acc + d.calories, 0) / caloriePoints.length)
        : 0;

    let minW = 60;
    let maxW = 100;
    if (weightPoints.length > 0) {
      const vals = weightPoints.map((p) => p.bodyweightDisplay);
      minW = Math.floor(Math.min(...vals) - 1.2);
      maxW = Math.ceil(Math.max(...vals) + 1.2);
    }

    const maxKcal = Math.max(
      nutritionGoals.targetCalories + 400,
      ...filteredData.map((d) => d.calories + 250),
      2800
    );

    return {
      latestWeight,
      weightDelta,
      avgCalories,
      weightPointsCount: weightPoints.length,
      weightDomain: [minW, maxW] as [number, number],
      kcalDomain: [0, Math.ceil(maxKcal / 200) * 200] as [number, number],
    };
  }, [filteredData, nutritionGoals.targetCalories]);

  const adjustWeightDraft = (delta: number) => {
    const parsed = Number(weightDraft.trim().replace(',', '.'));
    const base = Number.isFinite(parsed) && parsed > 20 ? parsed : Number(currentWeightDisplay) || 80;
    const next = Math.max(25, Math.min(350, Math.round((base + delta) * 10) / 10));
    setWeightDraft(next.toFixed(1));
  };

  const handleSaveWeightRecord = async () => {
    const parsed = Number(weightDraft.trim().replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 20) return;
    const kg = weightUnit === 'lb' ? parsed / LB_PER_KG : parsed;
    const roundedKg = Math.round(kg * 10) / 10;

    if (onSaveWeightForDate) {
      await onSaveWeightForDate(selectedWeightDate, roundedKg);
    } else if (onUpdateTodayBodyweight) {
      await onUpdateTodayBodyweight(roundedKg);
    } else {
      return;
    }

    setSavedWeightFlash(true);
    window.setTimeout(() => setSavedWeightFlash(false), 2200);
  };

  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const axisTickColor = isDark ? '#94a3b8' : '#64748b';
  const calorieLineColor = isDark ? '#fb923c' : '#ea580c';
  const weightLineColor = isDark ? '#60a5fa' : '#2563eb';
  const targetLineColor = isDark ? '#34d399' : '#059669';

  return (
    <section
      data-testid="daily-nutrition-weight-chart"
      aria-label="Bodyweight vs time and daily caloric intake line chart"
      className="hl-card rounded-2xl p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Scale className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Bodyweight vs. Time &amp; Caloric Intake</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Daily weight records ({weightUnit}) plotted alongside caloric intake (kcal) vs{' '}
            {nutritionGoals.targetCalories.toLocaleString()} kcal goal
          </p>
        </div>

        <div
          className="flex items-center gap-1 p-1 rounded-xl hl-subtle border self-start lg:self-auto"
          role="group"
          aria-label="Chart date range"
        >
          {(
            [
              { id: '7d', label: '7D' },
              { id: '14d', label: '14D' },
              { id: '30d', label: '30D' },
              { id: 'all', label: 'All' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRange(opt.id)}
              className={`no-touch-delay min-h-[36px] px-3 py-1 text-xs font-mono tabular-nums font-semibold rounded-lg transition-colors whitespace-nowrap ${
                range === opt.id
                  ? 'bg-slate-900 dark:bg-sky-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dedicated Daily Weight Record Entry Panel */}
      {(onSaveWeightForDate || onUpdateTodayBodyweight) && (
        <div
          data-testid="daily-weight-entry-panel"
          className="p-3.5 sm:p-4 rounded-xl hl-subtle border flex flex-col md:flex-row md:items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              Log Daily Weight Record
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Select a date and enter morning scale weight to track bodyweight trends over time
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex items-center">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="date"
                data-testid="chart-weight-date-input"
                aria-label="Weight record date"
                max={todayIso}
                value={selectedWeightDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedWeightDate(e.target.value);
                }}
                className="min-h-[42px] pl-8 pr-2.5 py-1.5 text-xs font-mono tabular-nums font-semibold hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            {selectedWeightDate !== todayIso && (
              <button
                type="button"
                onClick={() => setSelectedWeightDate(todayIso)}
                className="no-touch-delay min-h-[42px] px-2.5 py-1.5 rounded-xl hl-card border text-xs font-semibold text-sky-600 dark:text-sky-400 hover:border-sky-500 whitespace-nowrap"
              >
                Today
              </button>
            )}

            <div className="flex items-center gap-1 hl-card border rounded-xl p-1">
              <button
                type="button"
                onClick={() => adjustWeightDraft(-0.2)}
                aria-label={`Decrease weight by 0.2 ${weightUnit}`}
                className="no-touch-delay min-h-[34px] min-w-[34px] rounded-lg hl-subtle flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-sky-600"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="text"
                inputMode="decimal"
                data-testid="chart-today-weight-input"
                aria-label={`Scale weight in ${weightUnit} for ${selectedWeightDate}`}
                value={weightDraft}
                onChange={(e) => setWeightDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSaveWeightRecord();
                  }
                }}
                className="w-20 min-h-[34px] px-2 text-center text-xs sm:text-sm font-mono tabular-nums font-bold bg-transparent text-slate-900 dark:text-white focus:outline-none"
              />
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 pr-1">
                {weightUnit}
              </span>
              <button
                type="button"
                onClick={() => adjustWeightDraft(0.2)}
                aria-label={`Increase weight by 0.2 ${weightUnit}`}
                className="no-touch-delay min-h-[34px] min-w-[34px] rounded-lg hl-subtle flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-sky-600"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              data-testid="chart-save-weight-btn"
              onClick={() => void handleSaveWeightRecord()}
              className="no-touch-delay min-h-[42px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {savedWeightFlash ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved</span>
                </>
              ) : (
                <span>Save Weight</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Summary KPIs Strip (Single Hairline Divider Row) */}
      <div className="grid grid-cols-3 divide-x divide-slate-200/80 dark:divide-slate-800 border-y border-slate-200/80 dark:border-slate-800 py-2.5 text-xs">
        <div className="pr-3">
          <span className="text-slate-500 dark:text-slate-400 block">Latest Weight</span>
          <span className="text-sm sm:text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 block">
            {summaryStats.latestWeight !== null
              ? `${summaryStats.latestWeight.toFixed(1)} ${weightUnit}`
              : '—'}
          </span>
        </div>

        <div className="px-3">
          <span className="text-slate-500 dark:text-slate-400 block">Period Change</span>
          <span
            className={`text-sm sm:text-base font-bold font-mono tabular-nums mt-0.5 block ${
              summaryStats.weightDelta > 0
                ? 'text-blue-600 dark:text-blue-400'
                : summaryStats.weightDelta < 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {summaryStats.weightDelta > 0 ? '+' : ''}
            {summaryStats.weightDelta.toFixed(1)} {weightUnit}
          </span>
        </div>

        <div className="pl-3">
          <span className="text-slate-500 dark:text-slate-400 block">Avg Caloric Intake</span>
          <span className="text-sm sm:text-base font-bold font-mono tabular-nums text-orange-600 dark:text-orange-400 mt-0.5 block">
            {summaryStats.avgCalories > 0
              ? `${summaryStats.avgCalories.toLocaleString()} kcal`
              : '0 kcal'}
          </span>
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className="h-56 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          Enter a daily weight record above or log meals to plot your bodyweight vs. time line chart.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={filteredData}
                margin={{ top: 10, right: 8, left: -8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="shortDate"
                  tick={{ fill: axisTickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="kcal"
                  orientation="left"
                  domain={summaryStats.kcalDomain}
                  tick={{ fill: calorieLineColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}`}
                  width={46}
                />
                <YAxis
                  yAxisId="weight"
                  orientation="right"
                  domain={summaryStats.weightDomain}
                  tick={{ fill: weightLineColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}${weightUnit}`}
                  width={54}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    borderColor: isDark ? '#334155' : '#cbd5e1',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontFamily: 'JetBrains Mono, monospace',
                    color: isDark ? '#f8fafc' : '#0f172a',
                  }}
                  formatter={(value: unknown, name: unknown) => {
                    const num = Number(value);
                    const key = String(name);
                    if (key === 'Bodyweight') {
                      return [`${num.toFixed(1)} ${weightUnit}`, 'Bodyweight'];
                    }
                    return [`${Math.round(num).toLocaleString()} kcal`, 'Caloric Intake'];
                  }}
                  labelFormatter={(label: unknown) => `Date: ${String(label)}`}
                />
                <ReferenceLine
                  yAxisId="kcal"
                  y={nutritionGoals.targetCalories}
                  stroke={targetLineColor}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
                <Line
                  yAxisId="kcal"
                  type="monotone"
                  dataKey="calories"
                  name="Caloric Intake"
                  stroke={calorieLineColor}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{
                    r: 3,
                    fill: calorieLineColor,
                    strokeWidth: 1.5,
                    stroke: isDark ? '#0b1120' : '#ffffff',
                  }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  yAxisId="weight"
                  type="monotone"
                  dataKey="bodyweightDisplay"
                  name="Bodyweight"
                  stroke={weightLineColor}
                  strokeWidth={2.8}
                  connectNulls
                  dot={{
                    r: 3.5,
                    fill: weightLineColor,
                    strokeWidth: 1.5,
                    stroke: isDark ? '#0b1120' : '#ffffff',
                  }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-0.5 bg-blue-600 dark:bg-blue-400 inline-block" />
                <span>Bodyweight ({weightUnit})</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-0.5 border-t-2 border-dashed border-orange-500 dark:border-orange-400 inline-block" />
                <span>Caloric Intake (kcal)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-0.5 border-t border-dashed border-emerald-600 dark:border-emerald-400 inline-block" />
                <span>Goal ({nutritionGoals.targetCalories} kcal)</span>
              </span>
            </div>
            <span>
              {summaryStats.weightPointsCount} weight records · {filteredData.length} days shown
            </span>
          </div>
        </div>
      )}
    </section>
  );
};

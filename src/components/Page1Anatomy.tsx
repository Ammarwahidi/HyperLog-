import React, { useMemo, useState } from 'react';
import {
  ExercisePrescription,
  MajorMuscleGroup,
  MuscleId,
  MuscleLandmark,
  SetLogEntry,
  VolumeZone,
  WorkoutDayPlan,
} from '../types/workout';
import {
  evaluateVolumeZone,
  MESOCYCLE_WEEKS,
  VOLUME_ZONE_META,
} from '../data/rpPlanData';
import {
  getMuscleMajorGroup,
  MAJOR_MUSCLE_GROUP_MAP,
  MAJOR_MUSCLE_GROUP_ORDER,
} from '../data/exerciseCatalog';
import { BodyDiagram } from './BodyDiagram';
import { ArrowRight, Check, SlidersHorizontal, X } from 'lucide-react';

interface Page1AnatomyProps {
  activeWeek: number;
  onChangeWeek: (week: number) => void;
  plan: WorkoutDayPlan[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  setLogs: SetLogEntry[];
  weightUnit: 'kg' | 'lb';
  isDark?: boolean;
  onUpdateLandmark: (landmark: MuscleLandmark) => Promise<void>;
  onJumpToTrackDay: (dayNumber: number) => void;
}

function formatFreqTarget(minFreq: number, maxFreq: number): string {
  const cleanMin = Number.isInteger(minFreq) ? String(minFreq) : String(Math.ceil(minFreq));
  const cleanMax = Number.isInteger(maxFreq) ? String(maxFreq) : String(Math.round(maxFreq));
  return cleanMin === cleanMax ? `${cleanMin}x/wk` : `${cleanMin}–${cleanMax}x/wk`;
}

export const Page1Anatomy: React.FC<Page1AnatomyProps> = ({
  activeWeek,
  onChangeWeek,
  plan,
  landmarks,
  setLogs,
  weightUnit,
  isDark = false,
  onUpdateLandmark,
  onJumpToTrackDay,
}) => {
  const [selectedMajorGroup, setSelectedMajorGroup] = useState<MajorMuscleGroup>(
    MajorMuscleGroup.All
  );
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleId>(MuscleId.Chest);
  const [isEditingLandmarks, setIsEditingLandmarks] = useState(false);
  const [draftLandmark, setDraftLandmark] = useState<MuscleLandmark | null>(null);

  const activeWeekMeta =
    MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];

  const handleSelectMajorGroup = (group: MajorMuscleGroup) => {
    setSelectedMajorGroup(group);
    setIsEditingLandmarks(false);
    const groupMuscles = MAJOR_MUSCLE_GROUP_MAP[group];
    if (!groupMuscles.includes(selectedMuscle) && groupMuscles.length > 0) {
      setSelectedMuscle(groupMuscles[0]);
    }
  };

  const handleSelectMuscleFromDiagram = (muscle: MuscleId) => {
    setSelectedMuscle(muscle);
    setIsEditingLandmarks(false);
    if (
      selectedMajorGroup !== MajorMuscleGroup.All &&
      !MAJOR_MUSCLE_GROUP_MAP[selectedMajorGroup].includes(muscle)
    ) {
      setSelectedMajorGroup(getMuscleMajorGroup(muscle));
    }
  };

  const filteredMuscles = MAJOR_MUSCLE_GROUP_MAP[selectedMajorGroup];
  const activeGroupLabel =
    MAJOR_MUSCLE_GROUP_ORDER.find((g) => g.id === selectedMajorGroup)?.label ?? 'All Muscles';

  const muscleStats = useMemo(() => {
    const setsByMuscle = {} as Record<MuscleId, number>;
    const plannedByMuscle = {} as Record<MuscleId, number>;
    const freqDaysByMuscle = {} as Record<MuscleId, Set<string>>;
    const plannedFreqByMuscle = {} as Record<MuscleId, Set<number>>;
    const rirSumByMuscle = {} as Record<MuscleId, { sum: number; count: number }>;
    const tonnageKgByMuscle = {} as Record<MuscleId, number>;

    for (const id of Object.values(MuscleId)) {
      setsByMuscle[id] = 0;
      plannedByMuscle[id] = 0;
      freqDaysByMuscle[id] = new Set();
      plannedFreqByMuscle[id] = new Set();
      rirSumByMuscle[id] = { sum: 0, count: 0 };
      tonnageKgByMuscle[id] = 0;
    }

    for (const day of plan) {
      if (day.isRestDay) continue;
      for (const ex of day.exercises) {
        const targetSets = ex.weekSets[activeWeek] ?? 3;
        plannedByMuscle[ex.muscleId] += targetSets;
        plannedFreqByMuscle[ex.muscleId].add(day.dayNumber);
      }
    }

    for (const log of setLogs) {
      if (log.week !== activeWeek || !log.completed) continue;
      setsByMuscle[log.muscleId] = (setsByMuscle[log.muscleId] ?? 0) + 1;
      const sessionKey = log.templateSessionId
        ? `tpl_${log.templateSessionId}`
        : `day_${log.dayNumber}`;
      freqDaysByMuscle[log.muscleId]?.add(sessionKey);
      rirSumByMuscle[log.muscleId].sum += log.rir;
      rirSumByMuscle[log.muscleId].count += 1;
      tonnageKgByMuscle[log.muscleId] += (log.weightKg || 0) * log.reps;
    }

    return {
      setsByMuscle,
      plannedByMuscle,
      freqDaysByMuscle,
      plannedFreqByMuscle,
      rirSumByMuscle,
      tonnageKgByMuscle,
    };
  }, [plan, setLogs, activeWeek]);

  const selectedMuscleTrend = useMemo(() => {
    return MESOCYCLE_WEEKS.map((wm) => {
      const completed = setLogs.filter(
        (s) => s.week === wm.week && s.muscleId === selectedMuscle && s.completed
      ).length;
      let planned = 0;
      for (const d of plan) {
        for (const ex of d.exercises) {
          if (ex.muscleId === selectedMuscle) {
            planned += ex.weekSets[wm.week] ?? 3;
          }
        }
      }
      return {
        week: wm.week,
        shortLabel: wm.shortLabel,
        completed,
        planned,
      };
    });
  }, [setLogs, plan, selectedMuscle]);

  const selectedMuscleExercises = useMemo(() => {
    const list: Array<{ exercise: ExercisePrescription; completedSets: number }> = [];
    for (const d of plan) {
      for (const ex of d.exercises) {
        if (ex.muscleId === selectedMuscle) {
          const completedSets = setLogs.filter(
            (s) =>
              s.week === activeWeek &&
              s.dayNumber === d.dayNumber &&
              s.exerciseId === ex.id &&
              s.completed
          ).length;
          list.push({ exercise: ex, completedSets });
        }
      }
    }
    return list;
  }, [plan, selectedMuscle, setLogs, activeWeek]);

  const kpiSummary = useMemo(() => {
    let totalCompletedSets = 0;
    let totalPlannedSets = 0;
    let musclesInProductiveOrMav = 0;
    const completedSessions = new Set<string>();
    const plannedSessions = new Set<number>();

    for (const id of filteredMuscles) {
      const s = muscleStats.setsByMuscle[id];
      totalCompletedSets += s;
      totalPlannedSets += muscleStats.plannedByMuscle[id];
      muscleStats.plannedFreqByMuscle[id].forEach((d) => plannedSessions.add(d));
      const z = evaluateVolumeZone(s, landmarks[id]);
      if (z === VolumeZone.Productive || z === VolumeZone.OptimalMAV) {
        musclesInProductiveOrMav += 1;
      }
    }

    for (const log of setLogs) {
      if (
        log.week === activeWeek &&
        log.completed &&
        filteredMuscles.includes(log.muscleId)
      ) {
        completedSessions.add(
          log.templateSessionId ? `tpl_${log.templateSessionId}` : `day_${log.dayNumber}`
        );
      }
    }

    return {
      totalCompletedSets,
      totalPlannedSets,
      musclesInProductiveOrMav,
      totalMusclesInScope: filteredMuscles.length,
      sessionsLogged: completedSessions.size,
      sessionsPlanned: plannedSessions.size,
    };
  }, [muscleStats, landmarks, setLogs, activeWeek, filteredMuscles]);

  const currentLm = landmarks[selectedMuscle];
  const currentSets = muscleStats.setsByMuscle[selectedMuscle] ?? 0;
  const currentPlanned = muscleStats.plannedByMuscle[selectedMuscle] ?? 0;
  const currentFreq = muscleStats.freqDaysByMuscle[selectedMuscle]?.size ?? 0;
  const plannedFreq = muscleStats.plannedFreqByMuscle[selectedMuscle]?.size ?? 0;
  const rirData = muscleStats.rirSumByMuscle[selectedMuscle];
  const avgRirNum = rirData.count > 0 ? rirData.sum / rirData.count : null;
  const avgRir = avgRirNum !== null ? avgRirNum.toFixed(1) : '—';
  const tonnageDisplay =
    weightUnit === 'kg'
      ? `${Math.round(muscleStats.tonnageKgByMuscle[selectedMuscle]).toLocaleString()} kg`
      : `${Math.round(muscleStats.tonnageKgByMuscle[selectedMuscle] * 2.20462).toLocaleString()} lb`;

  const currentZone = evaluateVolumeZone(currentSets, currentLm);
  const currentZoneMeta = VOLUME_ZONE_META[currentZone];

  const gaugeScaleMax = Math.max(currentLm.mrv + 4, currentSets + 2, 26);
  const pct = (val: number) => `${Math.min(100, Math.round((val / gaugeScaleMax) * 100))}%`;

  const handleOpenEditLandmarks = () => {
    setDraftLandmark({ ...currentLm });
    setIsEditingLandmarks(true);
  };

  const handleSaveLandmarks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftLandmark) return;
    await onUpdateLandmark(draftLandmark);
    setIsEditingLandmarks(false);
  };

  return (
    <div className="space-y-6">
      {/* Clean Overview Header & Responsive Week Selector */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Weekly Hypertrophy Landmarks
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            {activeWeekMeta.label} · Target {activeWeekMeta.targetRir} · {activeWeekMeta.volumeFocus}
          </p>
        </div>

        {/* Full-width 5-col on mobile, compact segmented row on desktop */}
        <div
          className="grid grid-cols-5 sm:flex items-center gap-1 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800/90 shrink-0"
          role="tablist"
          aria-label="Mesocycle Week"
        >
          {MESOCYCLE_WEEKS.map((w) => (
            <button
              key={w.week}
              type="button"
              role="tab"
              aria-selected={activeWeek === w.week}
              onClick={() => onChangeWeek(w.week)}
              className={`min-h-[40px] px-2 sm:px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap text-center ${
                activeWeek === w.week
                  ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {w.week === 5 ? 'Deload' : `Wk ${w.week}`}
            </button>
          ))}
        </div>
      </div>

      {/* 4-Column Quantitative KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="hl-card rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {activeGroupLabel === 'All Muscles' ? 'Weekly Working Sets' : `${activeGroupLabel} Sets`}
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1 whitespace-nowrap">
            {kpiSummary.totalCompletedSets}
            <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
              {' '}
              / {kpiSummary.totalPlannedSets}
            </span>
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Logged in Week {activeWeek}
          </p>
        </div>

        <div className="hl-card rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">In Growth Window</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-1 whitespace-nowrap">
            {kpiSummary.musclesInProductiveOrMav}
            <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
              {' '}
              / {kpiSummary.totalMusclesInScope}
            </span>
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Between MEV &amp; MRV
          </p>
        </div>

        <div className="hl-card rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Training Frequency</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1 whitespace-nowrap">
            {kpiSummary.sessionsLogged}
            <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
              {' '}
              / {Math.max(kpiSummary.sessionsLogged, kpiSummary.sessionsPlanned)}d
            </span>
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Sessions completed
          </p>
        </div>

        <div className="hl-card rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Target Proximity</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1 whitespace-nowrap">
            {activeWeekMeta.targetRir}
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Reps in Reserve goal
          </p>
        </div>
      </div>

      {/* Main 2-Column Split: Left Interactive Body Diagram | Right Group & Individual Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6">
          <BodyDiagram
            selectedMajorGroup={selectedMajorGroup}
            onSelectMajorGroup={handleSelectMajorGroup}
            selectedMuscle={selectedMuscle}
            onSelectMuscle={handleSelectMuscleFromDiagram}
            weeklySetsByMuscle={muscleStats.setsByMuscle}
            landmarks={landmarks}
            isDark={isDark}
          />
        </div>

        {/* RIGHT PANEL: Filtered Group Progress + Individual Muscle Inspector */}
        <div className="lg:col-span-6 space-y-6">
          {selectedMajorGroup !== MajorMuscleGroup.All && (
            <div className="hl-card rounded-2xl p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                    {activeGroupLabel} Group Breakdown
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tap any muscle to inspect weekly landmarks and exercises
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                  {filteredMuscles.length}{' '}
                  {filteredMuscles.length === 1 ? 'region' : 'regions'}
                </span>
              </div>

              <div className="space-y-2.5">
                {filteredMuscles.map((mId) => {
                  const lm = landmarks[mId];
                  const sets = muscleStats.setsByMuscle[mId] ?? 0;
                  const planned = muscleStats.plannedByMuscle[mId] ?? 0;
                  const freq = muscleStats.freqDaysByMuscle[mId]?.size ?? 0;
                  const z = evaluateVolumeZone(sets, lm);
                  const zMeta = VOLUME_ZONE_META[z];
                  const isFocused = selectedMuscle === mId;
                  const barPct = Math.min(100, Math.round((sets / Math.max(1, lm.mrv)) * 100));

                  return (
                    <button
                      key={mId}
                      type="button"
                      onClick={() => setSelectedMuscle(mId)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                        isFocused
                          ? 'border-blue-600 dark:border-blue-500 hl-subtle'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-900 dark:text-white">{lm.name}</span>
                        <span className={`font-semibold whitespace-nowrap ${zMeta.textColor}`}>
                          {zMeta.shortLabel}
                        </span>
                      </div>
                      <div className="mt-2 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${zMeta.barColor} transition-all duration-150`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        <span>
                          <strong className="text-slate-900 dark:text-white">{sets}</strong>/{planned} sets ·{' '}
                          {freq}x/wk ({formatFreqTarget(lm.optimalFreqMin, lm.optimalFreqMax)})
                        </span>
                        <span>
                          MAV {lm.mavMin}–{lm.mavMax} · MRV {lm.mrv}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* INDIVIDUAL MUSCLE PROGRESS INSPECTOR */}
          <div className="hl-card rounded-2xl p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>{currentLm.anatomicalGroup}</span>
                  <span aria-hidden="true">·</span>
                  <span className={`font-semibold ${currentZoneMeta.textColor}`}>
                    {currentZoneMeta.label}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
                  {currentLm.name}
                </h2>
              </div>

              <button
                type="button"
                onClick={handleOpenEditLandmarks}
                className="min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Tune Landmarks
              </button>
            </div>

            {/* Inline Custom Landmark Editor — Mobile-Responsive Grid */}
            {isEditingLandmarks && draftLandmark && (
              <form
                onSubmit={handleSaveLandmarks}
                className="p-4 hl-subtle border rounded-xl space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    Personalize Weekly Set Landmarks ({draftLandmark.shortName})
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingLandmarks(false)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    aria-label="Cancel landmark edit"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {(
                    [
                      { key: 'mv', label: 'MV (Maint.)' },
                      { key: 'mev', label: 'MEV (Min)' },
                      { key: 'mavMin', label: 'MAV Min' },
                      { key: 'mavMax', label: 'MAV Max' },
                      { key: 'mrv', label: 'MRV (Max)' },
                    ] as const
                  ).map((field) => (
                    <label key={field.key} className="block">
                      <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        {field.label}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={40}
                        value={draftLandmark[field.key]}
                        onChange={(e) =>
                          setDraftLandmark({
                            ...draftLandmark,
                            [field.key]: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="mt-1 w-full min-h-[40px] px-2.5 py-1.5 text-xs font-mono tabular-nums hl-input rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="submit"
                    className="min-h-[40px] px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Save Landmarks
                  </button>
                </div>
              </form>
            )}

            {/* MV / MEV / MAV / MRV Visual Volume Gauge */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Completed Weekly Sets vs Landmarks
                </span>
                <span className="text-xs sm:text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {currentSets} logged · {currentPlanned} scheduled sets
                </span>
              </div>

              <div className="relative h-5 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border border-slate-200/80 dark:border-slate-700/80">
                <div
                  className="absolute top-0 bottom-0 bg-blue-100/80 dark:bg-blue-950/80 border-x border-blue-300/70 dark:border-blue-500/50"
                  style={{
                    left: pct(currentLm.mavMin),
                    width: `${Math.max(
                      4,
                      Math.round(((currentLm.mavMax - currentLm.mavMin) / gaugeScaleMax) * 100)
                    )}%`,
                  }}
                  title={`MAV Window: ${currentLm.mavMin}–${currentLm.mavMax} sets/wk`}
                />
                <div
                  className={`relative h-full ${currentZoneMeta.barColor} transition-all duration-200`}
                  style={{ width: pct(currentSets) }}
                />
              </div>

              {/* Clean 4-Column Set Landmarks Grid (Sets / Week) */}
              <div className="grid grid-cols-4 gap-2 sm:gap-2.5 pt-0.5 text-center">
                <div className="p-2.5 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">MV</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {currentLm.mv}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">MEV</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-0.5">
                    {currentLm.mev}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/80">
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 font-semibold">MAV</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-blue-800 dark:text-blue-200 mt-0.5 whitespace-nowrap">
                    {currentLm.mavMin}–{currentLm.mavMax}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">MRV</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">
                    {currentLm.mrv}
                  </p>
                </div>
              </div>

              {/* Dedicated 3-Column Session & Effort Metrics Row (Fixes Cramped Frequency Box!) */}
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                <div className="p-2.5 sm:p-3 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Frequency</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                    {currentFreq}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      /{plannedFreq || Math.ceil(currentLm.optimalFreqMin)}d
                    </span>
                  </p>
                  <p className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap">
                    Opt {formatFreqTarget(currentLm.optimalFreqMin, currentLm.optimalFreqMax)}
                  </p>
                </div>

                <div className="p-2.5 sm:p-3 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Avg Effort</p>
                  <p
                    className={`text-sm font-bold font-mono tabular-nums mt-0.5 whitespace-nowrap ${
                      avgRirNum === null
                        ? 'text-slate-900 dark:text-white'
                        : avgRirNum < 1
                        ? 'text-amber-600 dark:text-amber-400'
                        : avgRirNum <= 3
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {avgRir === '—' ? '—' : `${avgRir} RIR`}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {avgRirNum === null
                      ? 'No sets yet'
                      : avgRirNum < 1
                      ? 'Near failure'
                      : avgRirNum <= 3
                      ? 'Optimal zone'
                      : 'Deload effort'}
                  </p>
                </div>

                <div className="p-2.5 sm:p-3 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Weekly Load</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 truncate">
                    {tonnageDisplay}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    Total tonnage
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-0.5">
                {currentLm.rpGuidance}
              </p>
            </div>

            {/* 5-Week Mesocycle Volume Progression Mini-Chart */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                  5-Week Set Progression ({currentLm.shortName})
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Logged vs Scheduled
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {selectedMuscleTrend.map((item) => {
                  const maxBar = Math.max(currentLm.mrv, 20);
                  const plannedH = Math.min(100, Math.round((item.planned / maxBar) * 100));
                  const compH = Math.min(100, Math.round((item.completed / maxBar) * 100));
                  const isActive = item.week === activeWeek;
                  return (
                    <button
                      key={item.week}
                      type="button"
                      onClick={() => onChangeWeek(item.week)}
                      className={`p-2 rounded-xl border text-center transition-colors ${
                        isActive
                          ? 'border-blue-600 dark:border-blue-500 hl-subtle'
                          : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="h-14 sm:h-16 flex items-end justify-center gap-1 px-0.5">
                        <div
                          className="w-2 sm:w-2.5 bg-slate-200 dark:bg-slate-700 rounded-t-xs"
                          style={{ height: `${Math.max(8, plannedH)}%` }}
                          title={`Planned: ${item.planned} sets`}
                        />
                        <div
                          className="w-2 sm:w-2.5 bg-blue-600 dark:bg-blue-500 rounded-t-xs"
                          style={{ height: `${item.completed > 0 ? Math.max(8, compH) : 0}%` }}
                          title={`Completed: ${item.completed} sets`}
                        />
                      </div>
                      <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 mt-1.5 whitespace-nowrap">
                        {item.week === 5 ? 'Deload' : `Wk ${item.week}`}
                      </p>
                      <p className="text-[10px] sm:text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {item.completed}/{item.planned}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scheduled Exercises Targeting This Muscle */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                Scheduled Exercises for {currentLm.shortName}
              </h3>

              {selectedMuscleExercises.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                  No direct isolation prescribed in the active weekly schedule. Assign a template or
                  add an exercise from the Library on the Workouts tab.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {selectedMuscleExercises.map(({ exercise, completedSets }) => {
                    const targetSets = exercise.weekSets[activeWeek] ?? 3;
                    return (
                      <div
                        key={exercise.id}
                        className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {exercise.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums truncate">
                            Day {exercise.dayNumber} · {completedSets}/{targetSets} sets ·{' '}
                            {exercise.repRange} reps
                            {exercise.restSeconds ? ` · ${exercise.restSeconds}s` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onJumpToTrackDay(exercise.dayNumber)}
                          className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          Log Day {exercise.dayNumber}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filtered Muscle Volume & Frequency Matrix (Responsive Mobile Cards + Desktop Table) */}
      <div className="hl-card rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {selectedMajorGroup === MajorMuscleGroup.All
                ? `Muscle Volume & Frequency Matrix (Week ${activeWeek})`
                : `${activeGroupLabel} Volume & Frequency Matrix (Week ${activeWeek})`}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {filteredMuscles.length} of 13 anatomical regions · Tap any muscle to focus
            </p>
          </div>

          {selectedMajorGroup !== MajorMuscleGroup.All && (
            <button
              type="button"
              onClick={() => handleSelectMajorGroup(MajorMuscleGroup.All)}
              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              Show All 13 Muscles
            </button>
          )}
        </div>

        {/* Mobile Card Stack (Zero Horizontal Scroll Cramping on Phones) */}
        <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
          {filteredMuscles.map((id) => {
            const lm = landmarks[id];
            const sets = muscleStats.setsByMuscle[id] ?? 0;
            const planned = muscleStats.plannedByMuscle[id] ?? 0;
            const freq = muscleStats.freqDaysByMuscle[id]?.size ?? 0;
            const plannedF = muscleStats.plannedFreqByMuscle[id]?.size ?? 0;
            const zone = evaluateVolumeZone(sets, lm);
            const zMeta = VOLUME_ZONE_META[zone];
            const isSelected = selectedMuscle === id;
            const barPct = Math.min(100, Math.round((sets / Math.max(1, lm.mrv)) * 100));

            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedMuscle(id)}
                className={`w-full text-left p-4 space-y-2 transition-colors ${
                  isSelected
                    ? 'bg-blue-50/60 dark:bg-blue-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {lm.name}
                  </span>
                  <span className={`text-xs font-semibold whitespace-nowrap ${zMeta.textColor}`}>
                    {zMeta.shortLabel}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${zMeta.barColor}`} style={{ width: `${barPct}%` }} />
                </div>
                <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>
                    <strong className="text-slate-900 dark:text-white">{sets}</strong>/{planned} sets
                  </span>
                  <span>
                    Freq <strong className="text-slate-900 dark:text-white">{freq}</strong>/
                    {plannedF || Math.ceil(lm.optimalFreqMin)}d (
                    {formatFreqTarget(lm.optimalFreqMin, lm.optimalFreqMax)})
                  </span>
                  <span>
                    MAV {lm.mavMin}–{lm.mavMax}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desktop Full Data Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 hl-subtle text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Muscle Group</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Logged / Scheduled</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Frequency (Target)</th>
                <th className="py-3 px-3 text-right">MV</th>
                <th className="py-3 px-3 text-right">MEV</th>
                <th className="py-3 px-3 text-right">MAV</th>
                <th className="py-3 px-3 text-right">MRV</th>
                <th className="py-3 px-4">Landmark Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {filteredMuscles.map((id) => {
                const lm = landmarks[id];
                const sets = muscleStats.setsByMuscle[id] ?? 0;
                const planned = muscleStats.plannedByMuscle[id] ?? 0;
                const freq = muscleStats.freqDaysByMuscle[id]?.size ?? 0;
                const plannedF = muscleStats.plannedFreqByMuscle[id]?.size ?? 0;
                const zone = evaluateVolumeZone(sets, lm);
                const zMeta = VOLUME_ZONE_META[zone];
                const isSelected = selectedMuscle === id;

                return (
                  <tr
                    key={id}
                    onClick={() => setSelectedMuscle(id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/35'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {lm.name}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {sets} / {planned}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {freq}/{plannedF || Math.ceil(lm.optimalFreqMin)}d
                      </span>
                      <span className="text-slate-400 dark:text-slate-500 ml-1.5">
                        ({formatFreqTarget(lm.optimalFreqMin, lm.optimalFreqMax)})
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {lm.mv}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-sky-700 dark:text-sky-400">
                      {lm.mev}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-blue-700 dark:text-blue-400 font-medium whitespace-nowrap">
                      {lm.mavMin}–{lm.mavMax}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                      {lm.mrv}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`font-semibold ${zMeta.textColor}`}>{zMeta.shortLabel}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

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
import { ArrowRight, Check, ChevronDown, ChevronUp, SlidersHorizontal, X } from 'lucide-react';

interface Page1AnatomyProps {
  activeWeek: number;
  onChangeWeek?: (week: number) => void;
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
  const [showWeeklyKpis, setShowWeeklyKpis] = useState<boolean>(false);
  const [showMuscleAnalytics, setShowMuscleAnalytics] = useState<boolean>(false);
  const [showFullMatrix, setShowFullMatrix] = useState<boolean>(false);

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

  const calmWeeklyHeadline =
    kpiSummary.totalCompletedSets === 0
      ? `All ${kpiSummary.totalMusclesInScope} muscle groups are rested and ready`
      : kpiSummary.musclesInProductiveOrMav > 0
      ? `${kpiSummary.musclesInProductiveOrMav} muscle ${
          kpiSummary.musclesInProductiveOrMav === 1 ? 'group' : 'groups'
        } in a steady growth rhythm`
      : `${kpiSummary.totalCompletedSets} ${
          kpiSummary.totalCompletedSets === 1 ? 'set' : 'sets'
        } gently logged this week`;

  const calmWeeklySubtext =
    kpiSummary.totalCompletedSets === 0
      ? 'Start whenever it feels right — every completed set gently updates your muscle map.'
      : `You have logged ${kpiSummary.totalCompletedSets} of ${kpiSummary.totalPlannedSets} scheduled sets across ${kpiSummary.sessionsLogged} ${
          kpiSummary.sessionsLogged === 1 ? 'session' : 'sessions'
        }.`;

  return (
    <div className="space-y-6">
      {/* Calm Overview Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Muscle Balance Map
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Tap any muscle on the map to see what is rested, growing steadily, or ready for recovery
          </p>
        </div>
      </div>

      {/* Single Calm Weekly Balance Card + Progressive Disclosure for Raw KPI Numbers */}
      <section
        data-testid="anatomy-calm-summary-card"
        className="hl-card rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
              Weekly Muscle Balance · Week {activeWeek}
            </p>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {calmWeeklyHeadline}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {calmWeeklySubtext}
            </p>
          </div>

          <button
            type="button"
            data-testid="toggle-anatomy-kpis-btn"
            aria-expanded={showWeeklyKpis}
            onClick={() => setShowWeeklyKpis((v) => !v)}
            className="no-touch-delay self-start sm:self-auto min-h-[40px] px-3.5 py-2 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-sky-400 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>{showWeeklyKpis ? 'Hide Weekly Numbers' : 'View Weekly Volume Numbers'}</span>
            {showWeeklyKpis ? (
              <ChevronUp className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            )}
          </button>
        </div>

        {showWeeklyKpis && (
          <div
            data-testid="anatomy-kpis-panel"
            className="pt-3 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <div className="hl-subtle border rounded-xl p-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {activeGroupLabel === 'All Muscles' ? 'Sets Logged' : `${activeGroupLabel} Sets`}
              </p>
              <p className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1 whitespace-nowrap">
                {kpiSummary.totalCompletedSets}
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                  {' '}
                  / {kpiSummary.totalPlannedSets}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                Scheduled this week
              </p>
            </div>

            <div className="hl-subtle border rounded-xl p-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">In Sweet Spot</p>
              <p className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1 whitespace-nowrap">
                {kpiSummary.musclesInProductiveOrMav}
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                  {' '}
                  / {kpiSummary.totalMusclesInScope}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                Growing comfortably
              </p>
            </div>

            <div className="hl-subtle border rounded-xl p-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Active Days</p>
              <p className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1 whitespace-nowrap">
                {kpiSummary.sessionsLogged}
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                  {' '}
                  / {Math.max(kpiSummary.sessionsLogged, kpiSummary.sessionsPlanned)}d
                </span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                Sessions completed
              </p>
            </div>

            <div className="hl-subtle border rounded-xl p-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Effort Guide</p>
              <p className="text-xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400 mt-1 whitespace-nowrap">
                {activeWeekMeta.targetRir}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                Leave clean reps in reserve
              </p>
            </div>
          </div>
        )}
      </section>

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
                      className={`no-touch-delay w-full text-left p-3.5 rounded-xl border transition-colors ${
                        isFocused
                          ? 'border-sky-600 dark:border-sky-500 hl-subtle'
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
                          {freq}x/wk
                        </span>
                        <span>
                          Goal {lm.mavMin}–{lm.mavMax} sets
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* CALM INDIVIDUAL MUSCLE INSPECTOR */}
          <div className="hl-card rounded-2xl p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>{currentLm.anatomicalGroup}</span>
                  <span aria-hidden="true">·</span>
                  <span className={`font-semibold ${currentZoneMeta.textColor}`}>
                    {currentSets === 0 ? 'Rested & ready' : currentZoneMeta.shortLabel}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
                  {currentLm.name}
                </h2>
              </div>
            </div>

            {/* Clean Visual Progress Gauge */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Weekly Sets Progress
                </span>
                <span className="text-xs sm:text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {currentSets} logged · Goal {currentLm.mavMin}–{currentLm.mavMax} sets
                </span>
              </div>

              <div className="relative h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/80 dark:border-slate-700/80">
                <div
                  className="absolute top-0 bottom-0 bg-sky-100/80 dark:bg-sky-950/80 border-x border-sky-300/70 dark:border-sky-500/50"
                  style={{
                    left: pct(currentLm.mavMin),
                    width: `${Math.max(
                      4,
                      Math.round(((currentLm.mavMax - currentLm.mavMin) / gaugeScaleMax) * 100)
                    )}%`,
                  }}
                  title={`Sweet Spot: ${currentLm.mavMin}–${currentLm.mavMax} sets/wk`}
                />
                <div
                  className={`relative h-full ${currentZoneMeta.barColor} transition-all duration-200`}
                  style={{ width: pct(currentSets) }}
                />
              </div>
            </div>

            {/* Scheduled Exercises Targeting This Muscle (Actionable & Calm Up Front) */}
            <div className="pt-2 space-y-2.5">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                Movements in Your Plan for {currentLm.shortName}
              </h3>

              {selectedMuscleExercises.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  No direct movement scheduled right now — you can add one anytime from the Library
                  or Workouts tab.
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
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onJumpToTrackDay(exercise.dayNumber)}
                          className="no-touch-delay min-h-[40px] px-3 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <span>Open Day {exercise.dayNumber}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Progressive Disclosure Toggle for Landmarks, Custom Targets & Detailed Analytics */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <button
                type="button"
                data-testid="toggle-muscle-landmarks-btn"
                aria-expanded={showMuscleAnalytics || isEditingLandmarks}
                onClick={() => {
                  if (isEditingLandmarks) {
                    setIsEditingLandmarks(false);
                    setShowMuscleAnalytics(false);
                  } else {
                    setShowMuscleAnalytics((v) => !v);
                  }
                }}
                className="no-touch-delay w-full min-h-[40px] px-3.5 py-2 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-sky-400 transition-colors flex items-center justify-between gap-2"
              >
                <span>
                  {showMuscleAnalytics || isEditingLandmarks
                    ? 'Hide Volume Landmarks & Detailed Metrics'
                    : 'View Volume Landmarks & Custom Targets'}
                </span>
                {showMuscleAnalytics || isEditingLandmarks ? (
                  <ChevronUp className="w-4 h-4 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" />
                )}
              </button>

              {(showMuscleAnalytics || isEditingLandmarks) && (
                <div data-testid="muscle-landmarks-panel" className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Weekly set landmarks ({currentPlanned} scheduled)
                    </span>
                    {!isEditingLandmarks && (
                      <button
                        type="button"
                        onClick={handleOpenEditLandmarks}
                        className="no-touch-delay min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hl-subtle border hover:border-sky-400 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Customize Targets</span>
                      </button>
                    )}
                  </div>

                  {isEditingLandmarks && draftLandmark && (
                    <form
                      onSubmit={handleSaveLandmarks}
                      className="p-4 hl-subtle border rounded-xl space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          Personalize Weekly Targets ({draftLandmark.shortName})
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsEditingLandmarks(false)}
                          className="no-touch-delay min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          aria-label="Cancel landmark edit"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        {(
                          [
                            { key: 'mv', label: 'Maintain' },
                            { key: 'mev', label: 'Steady Min' },
                            { key: 'mavMin', label: 'Goal Min' },
                            { key: 'mavMax', label: 'Goal Max' },
                            { key: 'mrv', label: 'Rest Cap' },
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
                              className="mt-1 w-full min-h-[40px] px-2.5 py-1.5 text-xs font-mono tabular-nums hl-input rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="submit"
                          className="no-touch-delay min-h-[40px] px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Weekly Targets</span>
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="grid grid-cols-4 gap-2 sm:gap-2.5 text-center">
                    <div className="p-2.5 rounded-xl hl-subtle border">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Maintain</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                        {currentLm.mv}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl hl-subtle border">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Steady Start</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-0.5">
                        {currentLm.mev}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80">
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                        Sweet Spot
                      </p>
                      <p className="text-sm font-bold font-mono tabular-nums text-emerald-800 dark:text-emerald-200 mt-0.5 whitespace-nowrap">
                        {currentLm.mavMin}–{currentLm.mavMax}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl hl-subtle border">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Rest Cap</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">
                        {currentLm.mrv}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                    <div className="p-2.5 sm:p-3 rounded-xl hl-subtle border">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Days Active</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                        {currentFreq}
                        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                          /{plannedFreq || Math.ceil(currentLm.optimalFreqMin)}d
                        </span>
                      </p>
                      <p className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap">
                        Goal {formatFreqTarget(currentLm.optimalFreqMin, currentLm.optimalFreqMax)}
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
                        {avgRir === '—' ? '—' : `${avgRir} left`}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {avgRirNum === null
                          ? 'No sets yet'
                          : avgRirNum < 1
                          ? 'Very close to max'
                          : avgRirNum <= 3
                          ? 'Steady effort'
                          : 'Light pace'}
                      </p>
                    </div>

                    <div className="p-2.5 sm:p-3 rounded-xl hl-subtle border">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Weight Moved</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 truncate">
                        {tonnageDisplay}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        Weekly total
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {currentLm.rpGuidance}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Full 13-Muscle Overview Table */}
      <div className="hl-card rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {selectedMajorGroup === MajorMuscleGroup.All
                ? 'Compare All 13 Muscle Groups'
                : `Compare ${activeGroupLabel} Muscles`}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Optional table view of weekly sets and sweet-spot ranges across {filteredMuscles.length}{' '}
              regions
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedMajorGroup !== MajorMuscleGroup.All && (
              <button
                type="button"
                onClick={() => handleSelectMajorGroup(MajorMuscleGroup.All)}
                className="no-touch-delay min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                Show All 13
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFullMatrix((v) => !v)}
              className="no-touch-delay min-h-[38px] px-3.5 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>{showFullMatrix ? 'Hide Table' : 'Expand All Muscles'}</span>
              {showFullMatrix ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {showFullMatrix && (
          <div className="border-t border-slate-200 dark:border-slate-800">
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
                className={`no-touch-delay w-full text-left p-4 space-y-2 transition-colors ${
                  isSelected
                    ? 'bg-sky-50/60 dark:bg-sky-950/30'
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
                    Active <strong className="text-slate-900 dark:text-white">{freq}</strong>/
                    {plannedF || Math.ceil(lm.optimalFreqMin)}d
                  </span>
                  <span>
                    Goal {lm.mavMin}–{lm.mavMax}
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
        )}
      </div>
    </div>
  );
};

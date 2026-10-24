/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookMarked,
  Calendar,
  Check,
  Download,
  Dumbbell,
  Flame,
  Settings,
  X,
} from 'lucide-react';
import {
  ActiveStandaloneSession,
  AppPreferences,
  AppTab,
  AppTheme,
  DailyNutritionRecord,
  ExercisePrescription,
  LibraryExercise,
  MealEntry,
  MuscleAutoregulationFeedback,
  MuscleId,
  MuscleLandmark,
  NutritionGoals,
  SavedCustomMeal,
  SetLogEntry,
  SyncOutboxEvent,
  TemplateExerciseItem,
  WorkoutDayPlan,
  WorkoutTemplate,
} from './types/workout';
import {
  DEFAULT_MUSCLE_LANDMARKS,
  INITIAL_WORKOUT_PLAN,
  MESOCYCLE_WEEKS,
} from './data/rpPlanData';
import {
  INITIAL_EXERCISE_LIBRARY,
  INITIAL_WORKOUT_TEMPLATES,
} from './data/exerciseCatalog';
import {
  computeWidgetProgressSnapshot,
  DEFAULT_APP_PREFERENCES,
  DEFAULT_NUTRITION_GOALS,
  deleteSetLog,
  deleteWorkoutTemplate,
  enqueueSyncEvent,
  exportFullBackupJSON,
  importFullBackupJSON,
  initializeDatabaseIfNeeded,
  loadAllDatabaseState,
  replaceUncompletedDaySetLogs,
  resetDatabaseToDefaults,
  saveActiveStandaloneSession,
  saveActiveWeek,
  saveAppPreferences,
  saveBulkSetLogs,
  saveDailyNutrition,
  saveLibraryExercise,
  saveMuscleFeedback,
  saveMuscleLandmark,
  saveNutritionGoals,
  saveSavedCustomMeals,
  saveSetLog,
  saveWorkoutDayPlan,
  saveWorkoutTemplate,
} from './db/localStore';
import { Page1Anatomy } from './components/Page1Anatomy';
import { Page2TrackSets } from './components/Page2TrackSets';
import { Page3Workouts } from './components/Page3Workouts';
import { PageLibrary } from './components/PageLibrary';
import { Page4Calories } from './components/Page4Calories';
import { PageSettings } from './components/PageSettings';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { TechnicalGuideModal } from './components/TechnicalGuideModal';
import { APK_FILE_NAME, downloadSignedApk } from './utils/apkDownload';

function parseDefaultRepTarget(repRange: string): number {
  const match = repRange.match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : 10;
}

function getInitialTheme(): AppTheme {
  try {
    const saved = window.localStorage.getItem('hyperlog_theme') as AppTheme | null;
    if (
      saved === AppTheme.Daylight ||
      saved === AppTheme.NightSlate ||
      saved === AppTheme.Amoled ||
      saved === AppTheme.Graphite
    ) {
      return saved;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return AppTheme.NightSlate;
    }
  } catch {
    // Ignore storage access errors
  }
  return AppTheme.Daylight;
}

const THEME_META_COLOR: Record<AppTheme, string> = {
  [AppTheme.Daylight]: '#F8FAFC',
  [AppTheme.NightSlate]: '#0B1120',
  [AppTheme.Amoled]: '#000000',
  [AppTheme.Graphite]: '#121316',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.Anatomy);
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme);
  const [activeWeek, setActiveWeek] = useState<number>(3);
  const [activeDay, setActiveDay] = useState<number>(5);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  const [plan, setPlan] = useState<WorkoutDayPlan[]>(INITIAL_WORKOUT_PLAN);
  const [landmarks, setLandmarks] =
    useState<Record<MuscleId, MuscleLandmark>>(DEFAULT_MUSCLE_LANDMARKS);
  const [setLogs, setSetLogs] = useState<SetLogEntry[]>([]);
  const [feedback, setFeedback] = useState<Record<string, MuscleAutoregulationFeedback>>({});
  const [nutritionByDate, setNutritionByDate] = useState<Record<string, DailyNutritionRecord>>({});
  const [nutritionGoals, setNutritionGoals] = useState<NutritionGoals>(DEFAULT_NUTRITION_GOALS);
  const [savedCustomMeals, setSavedCustomMeals] = useState<SavedCustomMeal[]>([]);
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(DEFAULT_APP_PREFERENCES);
  const [syncOutbox, setSyncOutbox] = useState<SyncOutboxEvent[]>([]);
  const [exerciseLibrary, setExerciseLibrary] =
    useState<LibraryExercise[]>(INITIAL_EXERCISE_LIBRARY);
  const [workoutTemplates, setWorkoutTemplates] =
    useState<WorkoutTemplate[]>(INITIAL_WORKOUT_TEMPLATES);
  const [activeStandaloneSession, setActiveStandaloneSession] =
    useState<ActiveStandaloneSession | null>(null);

  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [showApkBanner, setShowApkBanner] = useState<boolean>(true);
  const [quickApkState, setQuickApkState] = useState<'idle' | 'downloading' | 'done'>('idle');
  const [lastWidgetSync, setLastWidgetSync] = useState<{
    trigger: string;
    timeLabel: string;
  }>({
    trigger: 'Initial SQLite Sync',
    timeLabel: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  });

  const recordWidgetUpdateTrigger = (trigger: string) => {
    setLastWidgetSync({
      trigger,
      timeLabel: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    });
  };

  const handleQuickApkDownload = async () => {
    if (quickApkState === 'downloading') return;
    setQuickApkState('downloading');
    await downloadSignedApk();
    setQuickApkState('done');
    window.setTimeout(() => setQuickApkState('idle'), 4000);
  };

  const isDark = theme !== AppTheme.Daylight;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === AppTheme.Daylight) {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
    try {
      window.localStorage.setItem('hyperlog_theme', theme);
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute('content', THEME_META_COLOR[theme]);
      }
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const applyDatabaseSnapshot = (
    state: Awaited<ReturnType<typeof loadAllDatabaseState>>
  ) => {
    setPlan(state.plan);
    setLandmarks(state.landmarks);
    setSetLogs(state.setLogs);
    setFeedback(state.feedback);
    setNutritionByDate(state.nutritionByDate);
    setNutritionGoals(state.nutritionGoals);
    setSyncOutbox(state.syncOutbox);
    setActiveWeek(state.activeWeek);
    setActiveStandaloneSession(state.activeStandaloneSession);
    setExerciseLibrary(state.exerciseLibrary);
    setWorkoutTemplates(state.workoutTemplates);
    setSavedCustomMeals(state.savedCustomMeals);
    setAppPreferences(state.appPreferences);
  };

  useEffect(() => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    initializeDatabaseIfNeeded().then((state) => {
      applyDatabaseSnapshot(state);
      setIsLoaded(true);
    });
  }, []);

  const handleChangeWeek = async (week: number) => {
    setActiveWeek(week);
    await saveActiveWeek(week);
  };

  const handleUpdateLandmark = async (lm: MuscleLandmark) => {
    setLandmarks((prev) => ({ ...prev, [lm.id]: lm }));
    await saveMuscleLandmark(lm);
  };

  const handleUpsertSet = async (entry: SetLogEntry) => {
    setSetLogs((prev) => {
      const idx = prev.findIndex((s) => s.id === entry.id);
      if (idx === -1) return [...prev, entry];
      const next = [...prev];
      next[idx] = entry;
      return next;
    });
    await saveSetLog(entry);
    if (entry.completed) {
      recordWidgetUpdateTrigger('Set Completed in Tracker');
    } else {
      recordWidgetUpdateTrigger('Set Updated in Tracker');
    }
  };

  const handleDeleteSet = async (id: string) => {
    setSetLogs((prev) => prev.filter((s) => s.id !== id));
    await deleteSetLog(id);
    recordWidgetUpdateTrigger('Set Removed in Tracker');
  };

  const handleSaveFeedback = async (fb: MuscleAutoregulationFeedback) => {
    setFeedback((prev) => ({ ...prev, [fb.id]: fb }));
    await saveMuscleFeedback(fb);
  };

  const handleSaveDayPlan = async (updatedDay: WorkoutDayPlan) => {
    setPlan((prev) => prev.map((d) => (d.dayNumber === updatedDay.dayNumber ? updatedDay : d)));
    await saveWorkoutDayPlan(updatedDay);

    const weekMeta =
      MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];
    const missingSets: SetLogEntry[] = [];
    for (const ex of updatedDay.exercises) {
      const hasSets = setLogs.some(
        (s) =>
          !s.templateSessionId &&
          s.week === activeWeek &&
          s.dayNumber === updatedDay.dayNumber &&
          s.exerciseId === ex.id
      );
      if (!hasSets) {
        const count = ex.weekSets[activeWeek] ?? 3;
        for (let s = 1; s <= count; s++) {
          missingSets.push({
            id: `w${activeWeek}_d${updatedDay.dayNumber}_${ex.id}_s${s}`,
            week: activeWeek,
            dayNumber: updatedDay.dayNumber,
            exerciseId: ex.id,
            exerciseName: ex.name,
            muscleId: ex.muscleId,
            setIndex: s,
            weightKg: ex.defaultWeightKg,
            reps: parseDefaultRepTarget(ex.repRange),
            rir: weekMeta.defaultRirNumber,
            restSeconds: ex.restSeconds,
            completed: false,
          });
        }
      }
    }
    if (missingSets.length > 0) {
      setSetLogs((prev) => [...prev, ...missingSets]);
      await saveBulkSetLogs(missingSets);
    }
  };

  const handleCreateExercise = async (exercise: LibraryExercise) => {
    setExerciseLibrary((prev) =>
      [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name))
    );
    await saveLibraryExercise(exercise);
  };

  const handleSaveTemplate = async (template: WorkoutTemplate) => {
    setWorkoutTemplates((prev) => {
      const without = prev.filter((t) => t.id !== template.id);
      return [...without, template].sort((a, b) => {
        if (a.category !== b.category) return a.category === 'Custom' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    });
    await saveWorkoutTemplate(template);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    setWorkoutTemplates((prev) => prev.filter((t) => t.id !== templateId));
    await deleteWorkoutTemplate(templateId);
  };

  const handleAddExerciseToTemplate = async (
    templateId: string,
    exercise: LibraryExercise
  ) => {
    const target = workoutTemplates.find((t) => t.id === templateId);
    if (!target) return;
    const item: TemplateExerciseItem = {
      id: `ti_${Date.now()}`,
      libraryExerciseId: exercise.id,
      name: exercise.name,
      primaryMuscle: exercise.primaryMuscle,
      secondaryMuscles: exercise.secondaryMuscles,
      sets: 3,
      reps: exercise.defaultRepRange,
      restSeconds: exercise.defaultRestSeconds,
      defaultWeightKg: exercise.defaultWeightKg,
    };
    const updated: WorkoutTemplate = {
      ...target,
      updatedAt: new Date().toISOString(),
      exercises: [...target.exercises, item],
    };
    await handleSaveTemplate(updated);
  };

  const handleAssignTemplateToDay = async (
    template: WorkoutTemplate,
    dayNumber: number
  ) => {
    const mappedExercises: ExercisePrescription[] = template.exercises.map((item, idx) => ({
      id: `d${dayNumber}_tpl_${template.id}_${idx + 1}`,
      dayNumber,
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
        3: Math.min(10, item.sets + 1),
        4: Math.min(10, item.sets + 1),
        5: Math.max(1, Math.floor(item.sets / 2)),
      },
    }));

    const focusMuscles = Array.from(
      new Set(mappedExercises.map((e) => landmarks[e.muscleId]?.shortName).filter(Boolean))
    ).join(', ');

    const updatedDay: WorkoutDayPlan = {
      dayNumber,
      title: `Day ${dayNumber} · ${template.name}`,
      focusSummary: focusMuscles || template.splitType,
      isRestDay: false,
      exercises: mappedExercises,
    };

    setPlan((prev) => prev.map((d) => (d.dayNumber === dayNumber ? updatedDay : d)));
    await saveWorkoutDayPlan(updatedDay);

    const weekMeta =
      MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];
    const newLogs: SetLogEntry[] = [];
    for (const ex of mappedExercises) {
      const targetSets = ex.weekSets[activeWeek] ?? 3;
      for (let s = 1; s <= targetSets; s++) {
        newLogs.push({
          id: `w${activeWeek}_d${dayNumber}_${ex.id}_s${s}_${Date.now()}`,
          week: activeWeek,
          dayNumber,
          exerciseId: ex.id,
          exerciseName: ex.name,
          muscleId: ex.muscleId,
          setIndex: s,
          weightKg: ex.defaultWeightKg,
          reps: parseDefaultRepTarget(ex.repRange),
          rir: weekMeta.defaultRirNumber,
          restSeconds: ex.restSeconds,
          completed: false,
        });
      }
    }

    await replaceUncompletedDaySetLogs(activeWeek, dayNumber, newLogs);
    setSetLogs((prev) => [
      ...prev.filter(
        (s) => !(s.week === activeWeek && s.dayNumber === dayNumber && !s.completed)
      ),
      ...newLogs,
    ]);
  };

  const handleStartStandaloneTemplate = async (template: WorkoutTemplate) => {
    const sessionId = `standalone_${Date.now()}`;
    const session: ActiveStandaloneSession = {
      sessionId,
      templateId: template.id,
      templateName: template.name,
      startedAt: new Date().toISOString(),
      exercises: template.exercises,
    };

    const weekMeta =
      MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];
    const generatedLogs: SetLogEntry[] = [];
    for (const item of template.exercises) {
      for (let s = 1; s <= item.sets; s++) {
        generatedLogs.push({
          id: `${sessionId}_${item.id}_s${s}`,
          week: activeWeek,
          dayNumber: 0,
          templateSessionId: sessionId,
          exerciseId: item.id,
          exerciseName: item.name,
          muscleId: item.primaryMuscle,
          setIndex: s,
          weightKg: item.defaultWeightKg,
          reps: parseDefaultRepTarget(item.reps),
          rir: weekMeta.defaultRirNumber,
          restSeconds: item.restSeconds,
          completed: false,
        });
      }
    }

    await saveBulkSetLogs(generatedLogs);
    await saveActiveStandaloneSession(session);
    setSetLogs((prev) => [...prev, ...generatedLogs]);
    setActiveStandaloneSession(session);
    setActiveTab(AppTab.TrackSets);
  };

  const handleClearStandaloneSession = async () => {
    setActiveStandaloneSession(null);
    await saveActiveStandaloneSession(null);
  };

  const handleQueueSessionSync = async (
    sessionLabel: string,
    dayNumber: number,
    completedSetsCount: number,
    tonnageKg: number
  ) => {
    const ev: SyncOutboxEvent = {
      id: `sync_session_${Date.now()}`,
      recordType: 'EXERCISE_SESSION',
      healthConnectType: 'ExerciseSessionRecord (EXERCISE_TYPE_WEIGHTLIFTING)',
      googleFitDataSource: 'raw:com.google.activity.segment:com.hyperlog.rp',
      createdAt: new Date().toISOString(),
      status: 'READY_FOR_BRIDGE',
      payload: {
        week: activeWeek,
        dayNumber,
        sessionName: `Week ${activeWeek} · ${sessionLabel}`,
        totalCompletedSets: completedSetsCount,
        totalTonnageKg: Math.round(tonnageKg),
        estimatedActiveCaloriesKcal: Math.round(completedSetsCount * 16.5),
        activityType: 97,
      },
    };
    setSyncOutbox((prev) => [ev, ...prev]);
    await enqueueSyncEvent(ev);
  };

  const handleSaveDailyNutrition = async (
    record: DailyNutritionRecord,
    addedMeal?: MealEntry
  ) => {
    setNutritionByDate((prev) => ({ ...prev, [record.date]: record }));
    await saveDailyNutrition(record);
    recordWidgetUpdateTrigger(
      addedMeal ? `Meal Saved (${addedMeal.name})` : 'Daily Nutrition Updated'
    );

    if (addedMeal) {
      const ev: SyncOutboxEvent = {
        id: `sync_nut_${Date.now()}`,
        recordType: 'NUTRITION_RECORD',
        healthConnectType: 'NutritionRecord',
        googleFitDataSource: 'raw:com.google.nutrition:com.hyperlog.rp',
        createdAt: new Date().toISOString(),
        status: 'READY_FOR_BRIDGE',
        payload: {
          date: record.date,
          mealType: addedMeal.mealType,
          mealName: addedMeal.name,
          energyKcal: addedMeal.calories,
          proteinGrams: addedMeal.proteinG,
          carbsGrams: addedMeal.carbsG,
          fatGrams: addedMeal.fatG,
        },
      };
      setSyncOutbox((prev) => [ev, ...prev]);
      await enqueueSyncEvent(ev);
    }
  };

  const handleSaveNutritionGoals = async (goals: NutritionGoals) => {
    setNutritionGoals(goals);
    await saveNutritionGoals(goals);
    recordWidgetUpdateTrigger('Nutrition Targets Updated');
  };

  const handleToggleWeightUnit = async (unit: 'kg' | 'lb') => {
    const updated = { ...nutritionGoals, weightUnit: unit };
    setNutritionGoals(updated);
    await saveNutritionGoals(updated);
  };

  const handleSaveCustomMeals = async (meals: SavedCustomMeal[]) => {
    setSavedCustomMeals(meals);
    await saveSavedCustomMeals(meals);
    recordWidgetUpdateTrigger('Custom Meal Preset Saved');
  };

  const handleSavePreferences = async (prefs: AppPreferences) => {
    setAppPreferences(prefs);
    await saveAppPreferences(prefs);
  };

  const handleExportBackup = async () => {
    const json = await exportFullBackupJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hyperlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (jsonContent: string) => {
    await importFullBackupJSON(jsonContent);
    const fresh = await loadAllDatabaseState();
    applyDatabaseSnapshot(fresh);
  };

  const handleResetDefaults = async () => {
    await resetDatabaseToDefaults();
    const fresh = await loadAllDatabaseState();
    applyDatabaseSnapshot(fresh);
  };

  const weeklyCompletedSetsCount = useMemo(
    () => setLogs.filter((s) => s.week === activeWeek && s.completed).length,
    [setLogs, activeWeek]
  );

  const widgetSnapshot = useMemo(
    () =>
      computeWidgetProgressSnapshot({
        activeWeek,
        plan,
        setLogs,
        nutritionByDate,
        nutritionGoals,
      }),
    [activeWeek, plan, setLogs, nutritionByDate, nutritionGoals]
  );

  const isSettingsActive = activeTab === AppTab.Settings;

  return (
    <div className="min-h-screen flex flex-col hl-canvas">
      {/* Safe-Area Aware Top Bar: Crest + Wordmark | 5 Desktop Nav Links | Top-Right Settings Tab Button */}
      <header className="sticky top-0 z-30 pt-safe-top hl-header backdrop-blur-md border-b">
        <div className="h-14 max-w-7xl mx-auto px-safe flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Vibrant Crest + HyperLog Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab(AppTab.Anatomy)}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 group"
          >
            <img
              src="/pwa-192x192.png"
              alt="HyperLog"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-lg object-cover shrink-0"
            />
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              HyperLog
            </span>
          </button>

          {/* Zone 2: 5 Concise Single-Line Desktop Nav Links */}
          <nav
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400"
            aria-label="Primary Navigation"
          >
            {(
              [
                { id: AppTab.Anatomy, label: 'Anatomy' },
                { id: AppTab.TrackSets, label: 'Track Sets' },
                { id: AppTab.Workouts, label: 'Workouts' },
                { id: AppTab.Library, label: 'Library' },
                { id: AppTab.Calories, label: 'Calories' },
              ] as const
            ).map((navItem) => (
              <button
                key={navItem.id}
                type="button"
                onClick={() => setActiveTab(navItem.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === navItem.id
                    ? 'text-slate-900 dark:text-white border-blue-600 dark:border-blue-400 font-semibold'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {navItem.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single Top-Right Settings Tab Button */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab(AppTab.Settings)}
              aria-current={isSettingsActive ? 'page' : undefined}
              className={`min-h-[40px] px-4 py-2 text-xs font-semibold rounded-xl border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isSettingsActive
                  ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-500'
                  : 'hl-subtle text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-safe pt-4 pb-24 md:pb-12 space-y-5">
        {/* Direct 1-Click Android Phone APK v2.0 Download Card */}
        {showApkBanner && activeTab !== AppTab.Settings && (
          <div className="hl-card rounded-2xl p-3.5 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <img
                src="/pwa-192x192.png"
                alt="HyperLog v2.0 Android app icon"
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-xl object-cover shrink-0"
              />
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  Run HyperLog on Your Phone ({APK_FILE_NAME} + Standalone App)
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Dynamic RemoteViews Grid Streak Widget · Offline SQLite &amp; Macro Calculator · Vibration Rest Timer
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleQuickApkDownload}
                disabled={quickApkState === 'downloading'}
                className="min-h-[40px] px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-70 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                {quickApkState === 'done' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved .APK</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {quickApkState === 'downloading' ? 'Preparing…' : 'Download .APK'}
                    </span>
                  </>
                )}
              </button>

              <PWAInstallButton compact />

              <button
                type="button"
                onClick={() => setIsGuideOpen(true)}
                className="min-h-[40px] px-3 py-2 text-xs font-semibold hl-subtle border text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-xl transition-colors whitespace-nowrap"
              >
                Install Guide
              </button>

              <button
                type="button"
                onClick={() => setShowApkBanner(false)}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Dismiss phone app download banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {!isLoaded ? (
          <div className="py-20 text-center text-sm text-slate-500 dark:text-slate-400">
            Loading local IndexedDB hypertrophy records…
          </div>
        ) : (
          <>
            {activeTab === AppTab.Anatomy && (
              <Page1Anatomy
                activeWeek={activeWeek}
                onChangeWeek={handleChangeWeek}
                plan={plan}
                landmarks={landmarks}
                setLogs={setLogs}
                weightUnit={nutritionGoals.weightUnit}
                isDark={isDark}
                onUpdateLandmark={handleUpdateLandmark}
                onJumpToTrackDay={(dayNumber) => {
                  setActiveDay(dayNumber);
                  setActiveTab(AppTab.TrackSets);
                }}
              />
            )}

            {activeTab === AppTab.TrackSets && (
              <Page2TrackSets
                activeWeek={activeWeek}
                onChangeWeek={handleChangeWeek}
                activeDay={activeDay}
                onChangeDay={setActiveDay}
                activeStandaloneSession={activeStandaloneSession}
                onClearStandaloneSession={handleClearStandaloneSession}
                plan={plan}
                landmarks={landmarks}
                setLogs={setLogs}
                feedback={feedback}
                weightUnit={nutritionGoals.weightUnit}
                defaultRestSeconds={appPreferences.defaultRestSeconds}
                defaultVibrateEnabled={appPreferences.vibrateOnRestComplete}
                defaultAutoTimer={appPreferences.autoStartRestTimer}
                onToggleWeightUnit={handleToggleWeightUnit}
                onUpsertSet={handleUpsertSet}
                onDeleteSet={handleDeleteSet}
                onSaveFeedback={handleSaveFeedback}
                onQueueSessionSync={handleQueueSessionSync}
              />
            )}

            {activeTab === AppTab.Workouts && (
              <Page3Workouts
                activeWeek={activeWeek}
                onChangeWeek={handleChangeWeek}
                plan={plan}
                templates={workoutTemplates}
                exerciseLibrary={exerciseLibrary}
                landmarks={landmarks}
                setLogs={setLogs}
                onSaveDayPlan={handleSaveDayPlan}
                onSaveTemplate={handleSaveTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onAssignTemplateToDay={handleAssignTemplateToDay}
                onStartStandaloneTemplate={handleStartStandaloneTemplate}
                onOpenDayInTracker={(dayNumber) => {
                  setActiveStandaloneSession(null);
                  setActiveDay(dayNumber);
                  setActiveTab(AppTab.TrackSets);
                }}
              />
            )}

            {activeTab === AppTab.Library && (
              <PageLibrary
                exercises={exerciseLibrary}
                landmarks={landmarks}
                templates={workoutTemplates}
                onCreateExercise={handleCreateExercise}
                onAddExerciseToTemplate={handleAddExerciseToTemplate}
              />
            )}

            {activeTab === AppTab.Calories && (
              <Page4Calories
                nutritionByDate={nutritionByDate}
                goals={nutritionGoals}
                preferences={appPreferences}
                savedCustomMeals={savedCustomMeals}
                weeklyCompletedSetsCount={weeklyCompletedSetsCount}
                isDark={isDark}
                onSaveDailyNutrition={handleSaveDailyNutrition}
                onSaveGoals={handleSaveNutritionGoals}
                onSavePreferences={handleSavePreferences}
                onSaveCustomMeals={handleSaveCustomMeals}
              />
            )}

            {activeTab === AppTab.Settings && (
              <PageSettings
                theme={theme}
                onChangeTheme={setTheme}
                weightUnit={nutritionGoals.weightUnit}
                onToggleWeightUnit={handleToggleWeightUnit}
                preferences={appPreferences}
                onSavePreferences={handleSavePreferences}
                widgetSnapshot={widgetSnapshot}
                lastWidgetSync={lastWidgetSync}
                onJumpToTab={setActiveTab}
                onExportBackup={handleExportBackup}
                onImportBackup={handleImportBackup}
                onResetDefaults={handleResetDefaults}
                onOpenInstallGuide={() => setIsGuideOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Fixed 5-Tab Bottom Navigation Bar (Safe-Area Gesture Bar Aware, >= 48px Hitboxes) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe-bottom hl-header backdrop-blur-md border-t"
        aria-label="Mobile Navigation"
      >
        <div className="grid grid-cols-5 items-center h-16 px-1">
          {[
            { id: AppTab.Anatomy, label: 'Anatomy', Icon: Activity },
            { id: AppTab.TrackSets, label: 'Track', Icon: Dumbbell },
            { id: AppTab.Workouts, label: 'Workouts', Icon: Calendar },
            { id: AppTab.Library, label: 'Library', Icon: BookMarked },
            { id: AppTab.Calories, label: 'Calories', Icon: Flame },
          ].map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
                  active
                    ? 'text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 1.9} />
                <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <OfflineIndicator />

      {/* APK, Emulator & Local Backup Hub */}
      <TechnicalGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        syncOutbox={syncOutbox}
        onExportBackup={handleExportBackup}
        onResetDefaults={handleResetDefaults}
      />
    </div>
  );
}

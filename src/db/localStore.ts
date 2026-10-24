import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  ActiveStandaloneSession,
  ActivityLevel,
  AppPreferences,
  BiologicalSex,
  DailyNutritionRecord,
  LibraryExercise,
  MuscleAutoregulationFeedback,
  MuscleId,
  MuscleLandmark,
  NutritionGoals,
  NutritionPhase,
  SavedCustomMeal,
  SetLogEntry,
  SyncOutboxEvent,
  WidgetDayIndicator,
  WidgetMesoSplitBar,
  WidgetProgressSnapshot,
  WorkoutDayPlan,
  WorkoutTemplate,
} from '../types/workout';
import {
  DEFAULT_MUSCLE_LANDMARKS,
  INITIAL_WORKOUT_PLAN,
  MESOCYCLE_WEEKS,
} from '../data/rpPlanData';
import {
  INITIAL_EXERCISE_LIBRARY,
  INITIAL_WORKOUT_TEMPLATES,
} from '../data/exerciseCatalog';

interface MesoTrackDB extends DBSchema {
  appMeta: {
    key: string;
    value: unknown;
  };
  workoutPlan: {
    key: number; // dayNumber
    value: WorkoutDayPlan;
  };
  landmarks: {
    key: MuscleId;
    value: MuscleLandmark;
  };
  setLogs: {
    key: string; // id
    value: SetLogEntry;
    indexes: { 'by-week': number; 'by-week-day': [number, number] };
  };
  feedback: {
    key: string;
    value: MuscleAutoregulationFeedback;
  };
  nutrition: {
    key: string; // date YYYY-MM-DD
    value: DailyNutritionRecord;
  };
  syncOutbox: {
    key: string;
    value: SyncOutboxEvent;
  };
  exerciseLibrary: {
    key: string;
    value: LibraryExercise;
  };
  workoutTemplates: {
    key: string;
    value: WorkoutTemplate;
  };
}

const DB_NAME = 'mesotrack-rp-db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<MesoTrackDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MesoTrackDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MesoTrackDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('appMeta')) {
          db.createObjectStore('appMeta');
        }
        if (!db.objectStoreNames.contains('workoutPlan')) {
          db.createObjectStore('workoutPlan', { keyPath: 'dayNumber' });
        }
        if (!db.objectStoreNames.contains('landmarks')) {
          db.createObjectStore('landmarks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('setLogs')) {
          const store = db.createObjectStore('setLogs', { keyPath: 'id' });
          store.createIndex('by-week', 'week');
          store.createIndex('by-week-day', ['week', 'dayNumber']);
        }
        if (!db.objectStoreNames.contains('feedback')) {
          db.createObjectStore('feedback', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('nutrition')) {
          db.createObjectStore('nutrition', { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains('syncOutbox')) {
          db.createObjectStore('syncOutbox', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('exerciseLibrary')) {
          db.createObjectStore('exerciseLibrary', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('workoutTemplates')) {
          db.createObjectStore('workoutTemplates', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getOffsetDateISO(daysOffset: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysOffset);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const DEFAULT_NUTRITION_GOALS: NutritionGoals = {
  phase: NutritionPhase.LeanMass,
  baseTdeeKcal: 2650,
  targetCalories: 2950,
  proteinTargetG: 195,
  carbsTargetG: 375,
  fatTargetG: 74,
  weightUnit: 'kg',
};

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  defaultRestSeconds: 90,
  vibrateOnRestComplete: true,
  autoStartRestTimer: true,
  calculatorProfile: {
    weightKg: 82.7,
    heightCm: 178,
    ageYears: 28,
    sex: BiologicalSex.Male,
    activity: ActivityLevel.Moderate,
    phase: NutritionPhase.LeanMass,
  },
};

function generateInitialSetLogs(plan: WorkoutDayPlan[]): SetLogEntry[] {
  const entries: SetLogEntry[] = [];
  const nowIso = new Date().toISOString();

  for (const weekMeta of MESOCYCLE_WEEKS) {
    const wk = weekMeta.week;
    for (const day of plan) {
      if (day.isRestDay) continue;
      for (const ex of day.exercises) {
        const prescribedCount = ex.weekSets[wk] ?? 3;
        for (let s = 1; s <= prescribedCount; s++) {
          const isDemoCompleted =
            (wk === 1 && day.dayNumber <= 7) ||
            (wk === 2 && day.dayNumber <= 7) ||
            (wk === 3 &&
              (day.dayNumber === 1 ||
                day.dayNumber === 2 ||
                day.dayNumber === 4 ||
                (day.dayNumber === 5 && s <= 3)));

          const progressiveWeight =
            ex.defaultWeightKg > 0
              ? Number((ex.defaultWeightKg + (wk === 5 ? -7.5 : (wk - 1) * 2.5)).toFixed(1))
              : 0;
          const baseReps = ex.repRange.startsWith('6')
            ? 8
            : ex.repRange.startsWith('8')
            ? 10
            : ex.repRange.startsWith('10')
            ? 12
            : ex.repRange.startsWith('20')
            ? 24
            : 15;

          entries.push({
            id: `w${wk}_d${day.dayNumber}_${ex.id}_s${s}`,
            week: wk,
            dayNumber: day.dayNumber,
            exerciseId: ex.id,
            exerciseName: ex.name,
            muscleId: ex.muscleId,
            setIndex: s,
            weightKg: Math.max(0, progressiveWeight),
            reps: Math.max(5, baseReps - (s > 3 ? 1 : 0)),
            rir: weekMeta.defaultRirNumber,
            restSeconds: ex.restSeconds,
            completed: isDemoCompleted,
            completedAt: isDemoCompleted ? nowIso : undefined,
          });
        }
      }
    }
  }
  return entries;
}

export async function initializeDatabaseIfNeeded() {
  const db = await getDB();
  const isSeededV1 = await db.get('appMeta', 'seeded_v1');

  if (!isSeededV1) {
    const txPlan = db.transaction('workoutPlan', 'readwrite');
    for (const day of INITIAL_WORKOUT_PLAN) {
      await txPlan.store.put(day);
    }
    await txPlan.done;

    const txLandmarks = db.transaction('landmarks', 'readwrite');
    for (const lm of Object.values(DEFAULT_MUSCLE_LANDMARKS)) {
      await txLandmarks.store.put(lm);
    }
    await txLandmarks.done;

    const initialSets = generateInitialSetLogs(INITIAL_WORKOUT_PLAN);
    const txSets = db.transaction('setLogs', 'readwrite');
    for (const s of initialSets) {
      await txSets.store.put(s);
    }
    await txSets.done;

    const today = getTodayISO();
    const seedDates: DailyNutritionRecord[] = [
      {
        date: getOffsetDateISO(-3),
        bodyweightKg: 82.4,
        stepsCount: 9240,
        meals: [
          {
            id: 'm_seed_1',
            date: getOffsetDateISO(-3),
            mealType: 'Breakfast',
            name: 'Whey Isolate Oats & Egg Whites',
            calories: 720,
            proteinG: 55,
            carbsG: 94,
            fatG: 12,
            loggedAt: '08:15',
          },
          {
            id: 'm_seed_2',
            date: getOffsetDateISO(-3),
            mealType: 'Post-Workout',
            name: 'Chicken Breast, Jasmine Rice & Avocado',
            calories: 1180,
            proteinG: 82,
            carbsG: 145,
            fatG: 26,
            loggedAt: '14:10',
          },
          {
            id: 'm_seed_3',
            date: getOffsetDateISO(-3),
            mealType: 'Dinner',
            name: 'Lean Sirloin, Potatoes & Greek Yogurt',
            calories: 1020,
            proteinG: 64,
            carbsG: 118,
            fatG: 30,
            loggedAt: '19:45',
          },
        ],
      },
      {
        date: getOffsetDateISO(-2),
        bodyweightKg: 82.5,
        stepsCount: 8410,
        meals: [
          {
            id: 'm_seed_4',
            date: getOffsetDateISO(-2),
            mealType: 'Breakfast',
            name: 'Protein Pancakes & Berries',
            calories: 690,
            proteinG: 50,
            carbsG: 92,
            fatG: 13,
            loggedAt: '08:30',
          },
          {
            id: 'm_seed_5',
            date: getOffsetDateISO(-2),
            mealType: 'Post-Workout',
            name: 'Turkey Rice Bowl & Olive Oil',
            calories: 1140,
            proteinG: 78,
            carbsG: 138,
            fatG: 28,
            loggedAt: '13:45',
          },
          {
            id: 'm_seed_6',
            date: getOffsetDateISO(-2),
            mealType: 'Dinner',
            name: 'Atlantic Salmon, Pasta & Greens',
            calories: 1060,
            proteinG: 66,
            carbsG: 122,
            fatG: 32,
            loggedAt: '20:00',
          },
        ],
      },
      {
        date: getOffsetDateISO(-1),
        bodyweightKg: 82.6,
        stepsCount: 10320,
        meals: [
          {
            id: 'm_seed_7',
            date: getOffsetDateISO(-1),
            mealType: 'Breakfast',
            name: 'Whey Isolate Oats, Banana & Egg Whites',
            calories: 640,
            proteinG: 52,
            carbsG: 86,
            fatG: 10,
            loggedAt: '08:00',
          },
          {
            id: 'm_seed_8',
            date: getOffsetDateISO(-1),
            mealType: 'Pre-Workout',
            name: 'Jasmine Rice, Chicken Breast & Honey',
            calories: 890,
            proteinG: 68,
            carbsG: 126,
            fatG: 11,
            loggedAt: '12:30',
          },
          {
            id: 'm_seed_9',
            date: getOffsetDateISO(-1),
            mealType: 'Dinner',
            name: '93/7 Beef, Sweet Potato & Cottage Cheese',
            calories: 1360,
            proteinG: 80,
            carbsG: 152,
            fatG: 42,
            loggedAt: '19:30',
          },
        ],
      },
      {
        date: today,
        bodyweightKg: 82.7,
        stepsCount: 7650,
        meals: [
          {
            id: 'm_today_1',
            date: today,
            mealType: 'Breakfast',
            name: 'Whey Isolate Oats, Banana & Egg Whites',
            calories: 640,
            proteinG: 52,
            carbsG: 86,
            fatG: 10,
            loggedAt: '08:10',
          },
          {
            id: 'm_today_2',
            date: today,
            mealType: 'Pre-Workout',
            name: 'Jasmine Rice, Chicken Breast & Honey',
            calories: 590,
            proteinG: 48,
            carbsG: 84,
            fatG: 6,
            loggedAt: '11:45',
          },
          {
            id: 'm_today_3',
            date: today,
            mealType: 'Post-Workout',
            name: 'Lean Beef 93/7, Sweet Potato & Olive Oil',
            calories: 720,
            proteinG: 54,
            carbsG: 78,
            fatG: 20,
            loggedAt: '15:20',
          },
        ],
      },
    ];

    const txNut = db.transaction('nutrition', 'readwrite');
    for (const rec of seedDates) {
      await txNut.store.put(rec);
    }
    await txNut.done;

    const initialOutbox: SyncOutboxEvent[] = [
      {
        id: 'sync_init_1',
        recordType: 'EXERCISE_SESSION',
        healthConnectType: 'ExerciseSessionRecord (EXERCISE_TYPE_WEIGHTLIFTING)',
        googleFitDataSource: 'raw:com.google.activity.segment:com.hyperlog.rp',
        createdAt: new Date().toISOString(),
        status: 'READY_FOR_BRIDGE',
        payload: {
          sessionName: 'Week 3 · Day 4 Posterior Chain & Heavy Back',
          totalCompletedSets: 22,
          activeCaloriesKcal: 365,
          activityType: 97,
        },
      },
      {
        id: 'sync_init_2',
        recordType: 'NUTRITION_RECORD',
        healthConnectType: 'NutritionRecord',
        googleFitDataSource: 'raw:com.google.nutrition:com.hyperlog.rp',
        createdAt: new Date().toISOString(),
        status: 'READY_FOR_BRIDGE',
        payload: {
          meal: 'Lean Beef 93/7, Sweet Potato & Olive Oil',
          energyKcal: 720,
          proteinGrams: 54,
          carbsGrams: 78,
          fatGrams: 20,
        },
      },
    ];
    const txOut = db.transaction('syncOutbox', 'readwrite');
    for (const ev of initialOutbox) {
      await txOut.store.put(ev);
    }
    await txOut.done;

    await db.put('appMeta', DEFAULT_NUTRITION_GOALS, 'nutritionGoals');
    await db.put('appMeta', 3, 'activeWeek');
    await db.put('appMeta', true, 'seeded_v1');
  }

  // Non-destructive V2 seeding for Exercise Library & Starter Workout Templates
  const isSeededV2 = await db.get('appMeta', 'seeded_v2_templates_library');
  if (!isSeededV2) {
    const existingLibraryCount = (await db.getAllKeys('exerciseLibrary')).length;
    if (existingLibraryCount === 0) {
      const txLib = db.transaction('exerciseLibrary', 'readwrite');
      for (const ex of INITIAL_EXERCISE_LIBRARY) {
        await txLib.store.put(ex);
      }
      await txLib.done;
    }

    const existingTemplatesCount = (await db.getAllKeys('workoutTemplates')).length;
    if (existingTemplatesCount === 0) {
      const txTpl = db.transaction('workoutTemplates', 'readwrite');
      for (const tpl of INITIAL_WORKOUT_TEMPLATES) {
        await txTpl.store.put(tpl);
      }
      await txTpl.done;
    }

    await db.put('appMeta', true, 'seeded_v2_templates_library');
  }

  return loadAllDatabaseState();
}

export async function loadAllDatabaseState() {
  const db = await getDB();
  const planArr = await db.getAll('workoutPlan');
  planArr.sort((a, b) => a.dayNumber - b.dayNumber);

  const lmArr = await db.getAll('landmarks');
  const landmarks = { ...DEFAULT_MUSCLE_LANDMARKS };
  for (const lm of lmArr) {
    landmarks[lm.id] = lm;
  }

  const setLogs = await db.getAll('setLogs');
  setLogs.sort((a, b) => a.setIndex - b.setIndex);

  const fbArr = await db.getAll('feedback');
  const feedback: Record<string, MuscleAutoregulationFeedback> = {};
  for (const fb of fbArr) {
    feedback[fb.id] = fb;
  }

  const nutArr = await db.getAll('nutrition');
  const nutritionByDate: Record<string, DailyNutritionRecord> = {};
  for (const n of nutArr) {
    nutritionByDate[n.date] = n;
  }

  const nutritionGoals =
    ((await db.get('appMeta', 'nutritionGoals')) as NutritionGoals | undefined) ??
    DEFAULT_NUTRITION_GOALS;
  const activeWeek = ((await db.get('appMeta', 'activeWeek')) as number | undefined) ?? 3;
  const activeStandaloneSession =
    ((await db.get('appMeta', 'activeStandaloneSession')) as ActiveStandaloneSession | null | undefined) ??
    null;

  const syncOutbox = await db.getAll('syncOutbox');
  syncOutbox.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const exerciseLibrary = await db.getAll('exerciseLibrary');
  exerciseLibrary.sort((a, b) => a.name.localeCompare(b.name));

  const workoutTemplates = await db.getAll('workoutTemplates');
  workoutTemplates.sort((a, b) => {
    if (a.category !== b.category) return a.category === 'Custom' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const savedCustomMeals =
    ((await db.get('appMeta', 'savedCustomMeals')) as SavedCustomMeal[] | undefined) ?? [];

  const appPreferences =
    ((await db.get('appMeta', 'appPreferences')) as AppPreferences | undefined) ??
    DEFAULT_APP_PREFERENCES;

  return {
    plan: planArr,
    landmarks,
    setLogs,
    feedback,
    nutritionByDate,
    nutritionGoals,
    syncOutbox,
    activeWeek,
    activeStandaloneSession,
    exerciseLibrary,
    workoutTemplates,
    savedCustomMeals,
    appPreferences,
  };
}

export async function saveSetLog(entry: SetLogEntry): Promise<void> {
  const db = await getDB();
  await db.put('setLogs', entry);
}

export async function saveBulkSetLogs(entries: SetLogEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('setLogs', 'readwrite');
  for (const entry of entries) {
    await tx.store.put(entry);
  }
  await tx.done;
}

export async function replaceUncompletedDaySetLogs(
  week: number,
  dayNumber: number,
  newEntries: SetLogEntry[]
): Promise<void> {
  const db = await getDB();
  const all = await db.getAll('setLogs');
  const tx = db.transaction('setLogs', 'readwrite');
  for (const existing of all) {
    if (existing.week === week && existing.dayNumber === dayNumber && !existing.completed) {
      await tx.store.delete(existing.id);
    }
  }
  for (const entry of newEntries) {
    await tx.store.put(entry);
  }
  await tx.done;
}

export async function deleteSetLog(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('setLogs', id);
}

export async function saveActiveWeek(week: number): Promise<void> {
  const db = await getDB();
  await db.put('appMeta', week, 'activeWeek');
}

export async function saveActiveStandaloneSession(
  session: ActiveStandaloneSession | null
): Promise<void> {
  const db = await getDB();
  await db.put('appMeta', session, 'activeStandaloneSession');
}

export async function saveMuscleLandmark(landmark: MuscleLandmark): Promise<void> {
  const db = await getDB();
  await db.put('landmarks', landmark);
}

export async function saveWorkoutDayPlan(day: WorkoutDayPlan): Promise<void> {
  const db = await getDB();
  await db.put('workoutPlan', day);
}

export async function saveMuscleFeedback(fb: MuscleAutoregulationFeedback): Promise<void> {
  const db = await getDB();
  await db.put('feedback', fb);
}

export async function saveDailyNutrition(record: DailyNutritionRecord): Promise<void> {
  const db = await getDB();
  await db.put('nutrition', record);
}

export async function saveNutritionGoals(goals: NutritionGoals): Promise<void> {
  const db = await getDB();
  await db.put('appMeta', goals, 'nutritionGoals');
}

export async function saveLibraryExercise(exercise: LibraryExercise): Promise<void> {
  const db = await getDB();
  await db.put('exerciseLibrary', exercise);
}

export async function saveWorkoutTemplate(template: WorkoutTemplate): Promise<void> {
  const db = await getDB();
  await db.put('workoutTemplates', template);
}

export async function deleteWorkoutTemplate(templateId: string): Promise<void> {
  const db = await getDB();
  await db.delete('workoutTemplates', templateId);
}

export async function enqueueSyncEvent(event: SyncOutboxEvent): Promise<void> {
  const db = await getDB();
  await db.put('syncOutbox', event);
}

export async function saveSavedCustomMeals(meals: SavedCustomMeal[]): Promise<void> {
  const db = await getDB();
  await db.put('appMeta', meals, 'savedCustomMeals');
}

export async function saveAppPreferences(prefs: AppPreferences): Promise<void> {
  const db = await getDB();
  await db.put('appMeta', prefs, 'appPreferences');
}

export async function exportFullBackupJSON(): Promise<string> {
  const state = await loadAllDatabaseState();
  return JSON.stringify(
    {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      ...state,
    },
    null,
    2
  );
}

export async function importFullBackupJSON(jsonString: string): Promise<void> {
  const parsed = JSON.parse(jsonString) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON backup structure.');
  }

  const db = await getDB();

  if (Array.isArray(parsed.plan) && parsed.plan.length > 0) {
    await db.clear('workoutPlan');
    const tx = db.transaction('workoutPlan', 'readwrite');
    for (const day of parsed.plan as WorkoutDayPlan[]) {
      if (day && typeof day.dayNumber === 'number') {
        await tx.store.put(day);
      }
    }
    await tx.done;
  }

  if (parsed.landmarks && typeof parsed.landmarks === 'object') {
    await db.clear('landmarks');
    const tx = db.transaction('landmarks', 'readwrite');
    for (const lm of Object.values(parsed.landmarks as Record<string, MuscleLandmark>)) {
      if (lm && lm.id) {
        await tx.store.put(lm);
      }
    }
    await tx.done;
  }

  if (Array.isArray(parsed.setLogs)) {
    await db.clear('setLogs');
    const tx = db.transaction('setLogs', 'readwrite');
    for (const entry of parsed.setLogs as SetLogEntry[]) {
      if (entry && entry.id) {
        await tx.store.put(entry);
      }
    }
    await tx.done;
  }

  if (parsed.feedback && typeof parsed.feedback === 'object') {
    await db.clear('feedback');
    const tx = db.transaction('feedback', 'readwrite');
    for (const fb of Object.values(
      parsed.feedback as Record<string, MuscleAutoregulationFeedback>
    )) {
      if (fb && fb.id) {
        await tx.store.put(fb);
      }
    }
    await tx.done;
  }

  if (parsed.nutritionByDate && typeof parsed.nutritionByDate === 'object') {
    await db.clear('nutrition');
    const tx = db.transaction('nutrition', 'readwrite');
    for (const rec of Object.values(
      parsed.nutritionByDate as Record<string, DailyNutritionRecord>
    )) {
      if (rec && rec.date) {
        await tx.store.put(rec);
      }
    }
    await tx.done;
  }

  if (Array.isArray(parsed.exerciseLibrary) && parsed.exerciseLibrary.length > 0) {
    await db.clear('exerciseLibrary');
    const tx = db.transaction('exerciseLibrary', 'readwrite');
    for (const ex of parsed.exerciseLibrary as LibraryExercise[]) {
      if (ex && ex.id) {
        await tx.store.put(ex);
      }
    }
    await tx.done;
  }

  if (Array.isArray(parsed.workoutTemplates) && parsed.workoutTemplates.length > 0) {
    await db.clear('workoutTemplates');
    const tx = db.transaction('workoutTemplates', 'readwrite');
    for (const tpl of parsed.workoutTemplates as WorkoutTemplate[]) {
      if (tpl && tpl.id) {
        await tx.store.put(tpl);
      }
    }
    await tx.done;
  }

  if (parsed.nutritionGoals && typeof parsed.nutritionGoals === 'object') {
    await db.put('appMeta', parsed.nutritionGoals, 'nutritionGoals');
  }

  if (typeof parsed.activeWeek === 'number') {
    await db.put('appMeta', parsed.activeWeek, 'activeWeek');
  }

  if (Array.isArray(parsed.savedCustomMeals)) {
    await db.put('appMeta', parsed.savedCustomMeals, 'savedCustomMeals');
  }

  if (parsed.appPreferences && typeof parsed.appPreferences === 'object') {
    await db.put('appMeta', parsed.appPreferences, 'appPreferences');
  }
}

export function computeWidgetProgressSnapshot(params: {
  activeWeek: number;
  plan: WorkoutDayPlan[];
  setLogs: SetLogEntry[];
  nutritionByDate: Record<string, DailyNutritionRecord>;
  nutritionGoals: NutritionGoals;
}): WidgetProgressSnapshot {
  const { activeWeek, plan, setLogs, nutritionByDate, nutritionGoals } = params;
  const todayIso = getTodayISO();

  const activeDates = new Set<string>();
  for (const [iso, rec] of Object.entries(nutritionByDate)) {
    if (rec.meals && rec.meals.length > 0) {
      activeDates.add(iso);
    }
  }
  for (const log of setLogs) {
    if (log.completed && log.completedAt) {
      activeDates.add(log.completedAt.slice(0, 10));
    }
  }

  let streakDays = 0;
  for (let offset = 0; offset >= -60; offset--) {
    const checkIso = getOffsetDateISO(offset);
    if (activeDates.has(checkIso)) {
      streakDays += 1;
    } else if (offset === 0) {
      // Allow streak to stay alive if yesterday was logged and today is still in progress
      continue;
    } else {
      break;
    }
  }

  const sortedDates = Array.from(activeDates).sort();
  let bestStreakDays = streakDays;
  let currentRun = 0;
  let prevMs: number | null = null;
  for (const iso of sortedDates) {
    const ms = Date.parse(`${iso}T00:00:00Z`);
    if (!Number.isNaN(ms)) {
      if (prevMs !== null && Math.round((ms - prevMs) / 86400000) === 1) {
        currentRun += 1;
      } else {
        currentRun = 1;
      }
      if (currentRun > bestStreakDays) {
        bestStreakDays = currentRun;
      }
      prevMs = ms;
    }
  }

  const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const weekDays: WidgetDayIndicator[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const iso = getOffsetDateISO(-i);
    weekDays.push({
      iso,
      dayLetter: dayLetters[dt.getDay()],
      active: activeDates.has(iso),
      isToday: i === 0,
    });
  }

  const weekCompletedLogs = setLogs.filter((s) => s.week === activeWeek && s.completed);
  const completedSets = weekCompletedLogs.length;
  let plannedSets = 0;
  for (const d of plan) {
    if (d.isRestDay) continue;
    for (const ex of d.exercises) {
      plannedSets += ex.weekSets[activeWeek] ?? 3;
    }
  }

  const buildSplitBar = (
    id: string,
    shortTitle: string,
    fullTitle: string,
    muscles: Set<MuscleId>
  ): WidgetMesoSplitBar => {
    const done = weekCompletedLogs.filter((s) => muscles.has(s.muscleId)).length;
    let target = 0;
    for (const d of plan) {
      if (d.isRestDay) continue;
      for (const ex of d.exercises) {
        if (muscles.has(ex.muscleId)) {
          target += ex.weekSets[activeWeek] ?? 3;
        }
      }
    }
    const cleanTarget = Math.max(1, target);
    const progressPct = Math.min(100, Math.round((done / cleanTarget) * 100));
    return {
      id,
      shortTitle,
      fullTitle,
      completedSets: done,
      plannedSets: cleanTarget,
      progressPct,
    };
  };

  const mesoSplitBars: WidgetMesoSplitBar[] = [
    buildSplitBar('push', 'Push', 'Upper Push', new Set([MuscleId.Chest, MuscleId.FrontDelts])),
    buildSplitBar(
      'back',
      'Back',
      'Back & Rear',
      new Set([MuscleId.Back, MuscleId.RearSideDelts, MuscleId.Traps])
    ),
    buildSplitBar(
      'arms',
      'Arms',
      'Arms (Bi/Tri)',
      new Set([MuscleId.Biceps, MuscleId.Triceps, MuscleId.Forearms])
    ),
    buildSplitBar(
      'legs',
      'Legs',
      'Legs & Core',
      new Set([
        MuscleId.Quads,
        MuscleId.Hamstrings,
        MuscleId.Glutes,
        MuscleId.Calves,
        MuscleId.Abs,
      ])
    ),
  ];

  const todayRec = nutritionByDate[todayIso];
  const todayCalories = todayRec
    ? todayRec.meals.reduce((sum, m) => sum + m.calories, 0)
    : 0;
  const todayProteinG = todayRec
    ? Math.round(todayRec.meals.reduce((sum, m) => sum + m.proteinG, 0))
    : 0;

  return {
    streakDays,
    bestStreakDays,
    weekDays,
    activeWeek,
    completedSets,
    plannedSets: Math.max(1, plannedSets),
    mesoSplitBars,
    todayCalories,
    targetCalories: Math.max(1, nutritionGoals.targetCalories),
    todayProteinG,
    targetProteinG: Math.max(1, nutritionGoals.proteinTargetG),
  };
}

export async function resetDatabaseToDefaults(): Promise<void> {
  const db = await getDB();
  await db.clear('appMeta');
  await db.clear('workoutPlan');
  await db.clear('landmarks');
  await db.clear('setLogs');
  await db.clear('feedback');
  await db.clear('nutrition');
  await db.clear('syncOutbox');
  await db.clear('exerciseLibrary');
  await db.clear('workoutTemplates');
  await initializeDatabaseIfNeeded();
}

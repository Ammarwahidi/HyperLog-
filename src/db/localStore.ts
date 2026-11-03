import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  ActiveStandaloneSession,
  ActiveWorkoutRunState,
  ActivityLevel,
  AppPreferences,
  BiologicalSex,
  DailyNutritionRecord,
  GoogleWorkoutSyncReceipt,
  LibraryExercise,
  MuscleAutoregulationFeedback,
  MuscleId,
  MuscleLandmark,
  NutritionGoals,
  NutritionPhase,
  SavedCustomMeal,
  SetLogEntry,
  SyncOutboxEvent,
  TrainingPackageStatus,
  WellbeingDailyRecord,
  WidgetDayIndicator,
  WidgetMesoSplitBar,
  WidgetProgressSnapshot,
  WorkoutDayPlan,
  WorkoutHistoryRecord,
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
import {
  deriveFullWorkoutHistory,
  resolveSetLogDateISO,
} from '../utils/workoutHistory';
import {
  compareSetLogsDeterministic,
  computeSetLogsParityChecksum,
  sanitizeSetLogEntry,
} from '../utils/setLogNumeric';

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
  workoutHistory: {
    key: string;
    value: WorkoutHistoryRecord;
    indexes: { 'by-date': string };
  };
}

const DEFAULT_GUEST_DB_NAME = 'mesotrack-rp-db';
const DB_VERSION = 3;

let activeUserNamespaceUid: string | null = null;
let activeDbName: string = DEFAULT_GUEST_DB_NAME;
let dbPromise: Promise<IDBPDatabase<MesoTrackDB>> | null = null;

function sanitizeUidForDbName(uid: string): string {
  return uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
}

export function getActiveUserStorageNamespace(): string | null {
  return activeUserNamespaceUid;
}

export async function setActiveUserStorageNamespace(uid: string | null): Promise<string> {
  const cleanUid = uid ? sanitizeUidForDbName(uid) : null;
  const targetDbName = cleanUid ? `mesotrack-rp-db-u-${cleanUid}` : DEFAULT_GUEST_DB_NAME;
  if (targetDbName === activeDbName && dbPromise) {
    return activeDbName;
  }
  if (dbPromise) {
    try {
      const openInstance = await dbPromise;
      openInstance.close();
    } catch {
      // Ignore close error on stale handle
    }
  }
  activeUserNamespaceUid = cleanUid;
  activeDbName = targetDbName;
  dbPromise = null;
  return activeDbName;
}

export async function deleteIsolatedUserDatabase(uid: string): Promise<void> {
  const cleanUid = sanitizeUidForDbName(uid);
  const userDbName = `mesotrack-rp-db-u-${cleanUid}`;
  if (activeDbName === userDbName && dbPromise) {
    try {
      const openInstance = await dbPromise;
      openInstance.close();
    } catch {
      // Ignore close error
    }
    activeUserNamespaceUid = null;
    activeDbName = DEFAULT_GUEST_DB_NAME;
    dbPromise = null;
  }
  await new Promise<void>((resolve) => {
    try {
      const req = window.indexedDB.deleteDatabase(userDbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function getDB(): Promise<IDBPDatabase<MesoTrackDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MesoTrackDB>(activeDbName, DB_VERSION, {
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
        if (!db.objectStoreNames.contains('workoutHistory')) {
          const histStore = db.createObjectStore('workoutHistory', { keyPath: 'id' });
          histStore.createIndex('by-date', 'date');
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
  phase: NutritionPhase.Maintenance,
  baseTdeeKcal: 2350,
  targetCalories: 2350,
  proteinTargetG: 160,
  carbsTargetG: 260,
  fatTargetG: 70,
  hydrationTargetMl: 2800,
  weightUnit: 'kg',
};

export const DEFAULT_SAVED_CUSTOM_MEALS: SavedCustomMeal[] = [
  {
    id: 'cmeal_seed_whey_rice',
    mealType: 'Post-Workout',
    name: 'Whey Isolate & Jasmine Rice Bowl',
    calories: 468,
    proteinG: 34,
    carbsG: 79,
    fatG: 2,
    ingredientsSummary: '32g Whey Protein Isolate, 250g Jasmine Rice, 20g Honey',
  },
  {
    id: 'cmeal_seed_yogurt_oats',
    mealType: 'Breakfast',
    name: 'Greek Yogurt, Oats & Blueberries',
    calories: 472,
    proteinG: 35,
    carbsG: 71,
    fatG: 6,
    ingredientsSummary: '225g Non-Fat Greek Yogurt, 80g Rolled Oats, 125g Blueberries',
  },
  {
    id: 'cmeal_seed_chicken_potato',
    mealType: 'Dinner',
    name: 'Chicken Breast, Sweet Potato & Olive Oil',
    calories: 626,
    proteinG: 61,
    carbsG: 52,
    fatG: 19,
    ingredientsSummary: '180g Chicken Breast, 250g Baked Sweet Potato, 14g Olive Oil',
  },
  {
    id: 'cmeal_seed_paneer_bhurji_roti',
    mealType: 'Post-Workout',
    name: 'Paneer Bhurji & 2 Whole-Wheat Phulkas',
    calories: 515,
    proteinG: 39,
    carbsG: 48,
    fatG: 18,
    ingredientsSummary: '160g Low-Fat Paneer Bhurji, 2 Phulkas, 1 tsp Ghee',
  },
  {
    id: 'cmeal_seed_moong_chilla',
    mealType: 'Breakfast',
    name: 'Stuffed Moong Dal & Paneer Chilla (2 pcs)',
    calories: 390,
    proteinG: 28,
    carbsG: 38,
    fatG: 12,
    ingredientsSummary: '70g Moong Dal Batter, 80g Grated Paneer, Mint Chutney',
  },
  {
    id: 'cmeal_seed_tandoori_tikka',
    mealType: 'Dinner',
    name: 'Tandoori Chicken Tikka & 1 Roti',
    calories: 440,
    proteinG: 54,
    carbsG: 26,
    fatG: 11,
    ingredientsSummary: '220g Chicken Breast Tikka, Hung Curd Marinade, 1 Roti',
  },
  {
    id: 'cmeal_seed_sattu_shaker',
    mealType: 'Pre-Workout',
    name: 'Roasted Chana Sattu & Lemon Cooler',
    calories: 215,
    proteinG: 13,
    carbsG: 34,
    fatG: 3,
    ingredientsSummary: '55g Chana Sattu, Lemon, Black Salt & Roasted Jeera',
  },
];

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  defaultRestSeconds: 90,
  vibrateOnRestComplete: true,
  soundOnTimer: true,
  autoStartRestTimer: true,
  autoSyncGoogleFit: true,
  autoQueueHealthConnect: true,
  calculatorProfile: {
    weightKg: 70,
    heightCm: 178,
    ageYears: 28,
    sex: BiologicalSex.Male,
    activity: ActivityLevel.Moderate,
    phase: NutritionPhase.Maintenance,
  },
};

function computeSeedCompletedIso(wk: number, dayNumber: number): string {
  if (wk === 1) {
    return getOffsetDateISO(-17 + dayNumber);
  }
  if (wk === 2) {
    return getOffsetDateISO(-10 + dayNumber);
  }
  if (wk === 3) {
    if (dayNumber === 1) return `${getOffsetDateISO(-3)}T17:30:00.000Z`;
    if (dayNumber === 2) return `${getOffsetDateISO(-2)}T17:30:00.000Z`;
    if (dayNumber === 4) return `${getOffsetDateISO(-1)}T17:30:00.000Z`;
  }
  return `${getOffsetDateISO(-1)}T17:30:00.000Z`;
}

function generateInitialSetLogs(plan: WorkoutDayPlan[]): SetLogEntry[] {
  const entries: SetLogEntry[] = [];

  for (const weekMeta of MESOCYCLE_WEEKS) {
    const wk = weekMeta.week;
    for (const day of plan) {
      if (day.isRestDay) continue;
      for (const ex of day.exercises) {
        const prescribedCount = ex.weekSets[wk] ?? 3;
        for (let s = 1; s <= prescribedCount; s++) {
          // Leave Week 3 Day 5 uncompleted so today's workout is ready to log and advances streak live
          const isDemoCompleted =
            (wk === 1 && day.dayNumber <= 7) ||
            (wk === 2 && day.dayNumber <= 7) ||
            (wk === 3 && (day.dayNumber === 1 || day.dayNumber === 2 || day.dayNumber === 4));

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

          const completedDateStr = computeSeedCompletedIso(wk, day.dayNumber);
          const completedDateOnly = completedDateStr.slice(0, 10);
          const normalizedCompletedAt = completedDateStr.includes('T')
            ? completedDateStr
            : `${completedDateStr}T17:30:00.000Z`;

          const completedRpe = isDemoCompleted
            ? Number(Math.min(10, Math.max(6, 10 - weekMeta.defaultRirNumber)).toFixed(1))
            : undefined;

          entries.push({
            id: `w${wk}_d${day.dayNumber}_${ex.id}_s${s}`,
            week: wk,
            dayNumber: day.dayNumber,
            sessionTitle: `Week ${wk} · ${day.title}`,
            exerciseId: ex.id,
            exerciseName: ex.name,
            muscleId: ex.muscleId,
            setIndex: s,
            weightKg: Math.max(0, progressiveWeight),
            reps: Math.max(5, baseReps - (s > 3 ? 1 : 0)),
            rir: weekMeta.defaultRirNumber,
            rpe: completedRpe,
            restSeconds: ex.restSeconds,
            completed: isDemoCompleted,
            completedAt: isDemoCompleted ? normalizedCompletedAt : undefined,
            completedDate: isDemoCompleted ? completedDateOnly : undefined,
          });
        }
      }
    }
  }
  return entries;
}

function generateFreshCleanSlateSetLogs(plan: WorkoutDayPlan[]): SetLogEntry[] {
  const entries: SetLogEntry[] = [];
  const week1Meta = MESOCYCLE_WEEKS[0];
  for (const day of plan) {
    if (day.isRestDay) continue;
    for (const ex of day.exercises) {
      const prescribedCount = ex.weekSets[1] ?? 3;
      const repMatch = ex.repRange.match(/\d+/);
      const baseReps = repMatch ? Math.max(5, Number(repMatch[0])) : 10;
      for (let s = 1; s <= prescribedCount; s++) {
        entries.push({
          id: `w1_d${day.dayNumber}_${ex.id}_s${s}`,
          week: 1,
          dayNumber: day.dayNumber,
          sessionTitle: `Week 1 · ${day.title}`,
          exerciseId: ex.id,
          exerciseName: ex.name,
          muscleId: ex.muscleId,
          setIndex: s,
          weightKg: Math.max(0, ex.defaultWeightKg),
          reps: baseReps,
          rir: week1Meta.defaultRirNumber,
          restSeconds: ex.restSeconds,
          completed: false,
        });
      }
    }
  }
  return entries;
}

function getPriorBlockSplitMeta(majorGroup: LibraryExercise['majorGroup']): {
  dayOffsetWithinWeek: number;
  daySlot: number;
  splitTitle: string;
} {
  if (majorGroup === 'chest' || majorGroup === 'shoulders') {
    return {
      dayOffsetWithinWeek: 0,
      daySlot: 1,
      splitTitle: 'Push · Chest & Delts',
    };
  }
  if (majorGroup === 'back') {
    return {
      dayOffsetWithinWeek: 1,
      daySlot: 2,
      splitTitle: 'Pull · Back & Thickness',
    };
  }
  if (majorGroup === 'legs') {
    return {
      dayOffsetWithinWeek: 3,
      daySlot: 4,
      splitTitle: 'Lower Body · Quads, Hamstrings & Glutes',
    };
  }
  return {
    dayOffsetWithinWeek: 4,
    daySlot: 5,
    splitTitle: 'Arms & Core Hypertrophy',
  };
}

function generatePriorMesocycleHistoryLogs(library: LibraryExercise[]): SetLogEntry[] {
  const weekStartOffsets = [-68, -61, -54, -47, -40, -33, -26];
  const entries: SetLogEntry[] = [];

  for (const ex of library) {
    const baseLoad = ex.defaultWeightKg > 0 ? ex.defaultWeightKg : 12.5;
    const repMatch = ex.defaultRepRange.match(/\d+/);
    const baseReps = repMatch ? Math.max(6, Number(repMatch[0]) + 1) : 10;
    const splitMeta = getPriorBlockSplitMeta(ex.majorGroup);

    weekStartOffsets.forEach((weekStart, idx) => {
      const wkMarker = -(weekStartOffsets.length - idx); // -7 .. -1 (archive weeks; excluded from Wk 1..5 active totals)
      const factor = 0.85 + idx * 0.022;
      const rawLoad =
        ex.defaultWeightKg > 0
          ? Math.round(baseLoad * factor * 2) / 2
          : Math.round(idx * 2.5 * 2) / 2;
      const rpeVal = Number((7.5 + (idx % 3) * 0.5).toFixed(1));
      const rirVal = Math.max(1, Number((10 - rpeVal).toFixed(1)));
      const dateIso = getOffsetDateISO(weekStart + splitMeta.dayOffsetWithinWeek);
      const completedIso = `${dateIso}T17:15:00.000Z`;
      const sessionTitle = `Prior Block Wk ${idx + 1} · ${splitMeta.splitTitle}`;

      for (let s = 1; s <= 3; s++) {
        const setLoad =
          s === 1 ? rawLoad : Math.max(0, Number((rawLoad - (s === 3 ? 2.5 : 0)).toFixed(1)));
        entries.push({
          id: `hist_m0_${ex.id}_${idx + 1}_s${s}`,
          week: wkMarker,
          dayNumber: splitMeta.daySlot,
          sessionTitle,
          exerciseId: ex.id,
          exerciseName: ex.name,
          muscleId: ex.primaryMuscle,
          setIndex: s,
          weightKg: setLoad,
          reps: Math.max(5, baseReps - (s === 3 ? 1 : 0)),
          rir: rirVal,
          rpe: rpeVal,
          restSeconds: ex.defaultRestSeconds,
          completed: true,
          completedAt: completedIso,
          completedDate: dateIso,
        });
      }
    });
  }

  return entries;
}

export interface DatabaseLoadOptions {
  initialLibraryLimit?: number;
}

interface LibraryPageCacheEntry {
  items: LibraryExercise[];
  total: number;
  cachedAt: number;
}

const MAX_LIBRARY_PAGE_CACHE_ENTRIES = 32;
const libraryPageCache = new Map<string, LibraryPageCacheEntry>();
const libraryFilteredQueryCache = new Map<string, LibraryExercise[]>();

export function invalidateLibraryPageCache(): void {
  libraryPageCache.clear();
  libraryFilteredQueryCache.clear();
}

export function prioritizeExercisesForLogin(
  exercises: LibraryExercise[],
  setLogs: SetLogEntry[]
): LibraryExercise[] {
  const latestCompletionByNormName = new Map<string, string>();
  const latestCompletionByExId = new Map<string, string>();

  for (const log of setLogs) {
    if (!log.completed) continue;
    const stamp = log.completedAt ?? log.completedDate ?? '';
    if (!stamp) continue;
    const prevById = latestCompletionByExId.get(log.exerciseId);
    if (!prevById || stamp > prevById) {
      latestCompletionByExId.set(log.exerciseId, stamp);
    }
    const norm = log.exerciseName.trim().toLowerCase();
    if (norm) {
      const prevByName = latestCompletionByNormName.get(norm);
      if (!prevByName || stamp > prevByName) {
        latestCompletionByNormName.set(norm, stamp);
      }
    }
  }

  return [...exercises].sort((a, b) => {
    const aCustom = a.isCustom || a.id.startsWith('lib_custom_') ? 1 : 0;
    const bCustom = b.isCustom || b.id.startsWith('lib_custom_') ? 1 : 0;
    if (aCustom !== bCustom) return bCustom - aCustom;

    const aRecent =
      latestCompletionByExId.get(a.id) ??
      latestCompletionByNormName.get(a.name.trim().toLowerCase()) ??
      '';
    const bRecent =
      latestCompletionByExId.get(b.id) ??
      latestCompletionByNormName.get(b.name.trim().toLowerCase()) ??
      '';
    if (aRecent !== bRecent) {
      if (!aRecent) return 1;
      if (!bRecent) return -1;
      return aRecent < bRecent ? 1 : -1;
    }

    return a.name.localeCompare(b.name);
  });
}

export function getCachedLibrarySlice(params: {
  cacheKey: string;
  source: LibraryExercise[];
  limit: number;
}): { items: LibraryExercise[]; total: number } {
  const fullKey = `${params.cacheKey}::len=${params.source.length}::lim=${params.limit}`;
  const hit = libraryPageCache.get(fullKey);
  if (hit) {
    // Refresh LRU order
    libraryPageCache.delete(fullKey);
    libraryPageCache.set(fullKey, hit);
    return { items: hit.items, total: hit.total };
  }

  const sliced = params.source.slice(0, Math.max(10, params.limit));
  const entry: LibraryPageCacheEntry = {
    items: sliced,
    total: params.source.length,
    cachedAt: Date.now(),
  };
  if (libraryPageCache.size >= MAX_LIBRARY_PAGE_CACHE_ENTRIES) {
    const oldestKey = libraryPageCache.keys().next().value;
    if (oldestKey !== undefined) {
      libraryPageCache.delete(oldestKey);
    }
  }
  libraryPageCache.set(fullKey, entry);
  return { items: entry.items, total: entry.total };
}

export async function loadFullExerciseLibrary(
  setLogsHint?: SetLogEntry[]
): Promise<LibraryExercise[]> {
  const db = await getDB();
  const all = await db.getAll('exerciseLibrary');
  const logs = setLogsHint ?? (await db.getAll('setLogs'));
  return prioritizeExercisesForLogin(all, logs);
}

export interface FetchLibraryBatchParams {
  offset: number;
  limit: number;
  searchQuery?: string;
  onlyForearms?: boolean;
  level?: 'All' | 'Beginner' | 'Intermediate' | 'Advanced';
  modality?: string;
  majorGroup?: string;
  equipment?: string;
  resolveModality?: (exercise: LibraryExercise) => string;
  landmarks?: Record<MuscleId, MuscleLandmark>;
  setLogsHint?: SetLogEntry[];
  fallbackExercises?: LibraryExercise[];
}

export interface FetchLibraryBatchResult {
  batch: LibraryExercise[];
  nextOffset: number;
  totalMatched: number;
  hasMore: boolean;
}

export async function fetchExerciseLibraryBatch(
  params: FetchLibraryBatchParams
): Promise<FetchLibraryBatchResult> {
  const safeOffset = Math.max(0, Math.floor(params.offset));
  const safeLimit = Math.max(1, Math.floor(params.limit));
  const cleanQuery = (params.searchQuery ?? '').trim().toLowerCase();
  const onlyForearms = Boolean(params.onlyForearms);
  const level = params.level ?? 'All';
  const modality = (params.modality ?? 'all').toLowerCase();
  const majorGroup = (params.majorGroup ?? 'all').toLowerCase();
  const equipment = params.equipment ?? 'all';
  const fallbackCount = params.fallbackExercises?.length ?? 0;

  const queryCacheKey = `${activeDbName}|q=${cleanQuery}|fa=${onlyForearms ? 1 : 0}|lv=${level}|md=${modality}|gr=${majorGroup}|eq=${equipment}|fb=${fallbackCount}`;

  let matched = libraryFilteredQueryCache.get(queryCacheKey);
  if (matched) {
    libraryFilteredQueryCache.delete(queryCacheKey);
    libraryFilteredQueryCache.set(queryCacheKey, matched);
  } else {
    const db = await getDB();
    const dbExercises = await db.getAll('exerciseLibrary');
    const byId = new Map<string, LibraryExercise>();
    for (const ex of dbExercises) {
      byId.set(ex.id, ex);
    }
    if (params.fallbackExercises) {
      for (const ex of params.fallbackExercises) {
        if (!byId.has(ex.id)) {
          byId.set(ex.id, ex);
        }
      }
    }

    const logs = params.setLogsHint ?? (await db.getAll('setLogs'));
    const prioritized = prioritizeExercisesForLogin(Array.from(byId.values()), logs);
    const tokens = cleanQuery
      .split(' ')
      .map((t) => t.trim())
      .filter(Boolean);

    matched = prioritized.filter((ex) => {
      if (
        onlyForearms &&
        ex.primaryMuscle !== MuscleId.Forearms &&
        !ex.secondaryMuscles.includes(MuscleId.Forearms)
      ) {
        return false;
      }
      if (level !== 'All' && level.toLowerCase() !== 'all' && (ex.level ?? 'Intermediate') !== level) {
        return false;
      }
      const exModality = (
        params.resolveModality ? params.resolveModality(ex) : ex.modality ?? 'strength'
      ).toLowerCase();
      if (modality !== 'all' && exModality !== modality) {
        return false;
      }
      if (majorGroup !== 'all' && ex.majorGroup.toLowerCase() !== majorGroup) {
        return false;
      }
      if (equipment.toLowerCase() !== 'all' && ex.equipment !== equipment) {
        return false;
      }
      if (tokens.length === 0) return true;
      const primName = params.landmarks?.[ex.primaryMuscle]?.name.toLowerCase() ?? '';
      const shortName = params.landmarks?.[ex.primaryMuscle]?.shortName.toLowerCase() ?? '';
      const secNames = ex.secondaryMuscles
        .map((m) => params.landmarks?.[m]?.name.toLowerCase() ?? '')
        .join(' ');
      const haystack = `${ex.name} ${ex.description} ${ex.equipment} ${ex.majorGroup} ${ex.level ?? ''} ${exModality} ${primName} ${shortName} ${secNames}`.toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    });

    if (libraryFilteredQueryCache.size >= 24) {
      const oldest = libraryFilteredQueryCache.keys().next().value;
      if (oldest !== undefined) {
        libraryFilteredQueryCache.delete(oldest);
      }
    }
    libraryFilteredQueryCache.set(queryCacheKey, matched);
  }

  const batch = matched.slice(safeOffset, safeOffset + safeLimit);
  const nextOffset = safeOffset + batch.length;
  return {
    batch,
    nextOffset,
    totalMatched: matched.length,
    hasMore: nextOffset < matched.length,
  };
}

export async function initializeDatabaseIfNeeded(options?: DatabaseLoadOptions) {
  invalidateLibraryPageCache();
  const db = await getDB();
  const isSeededV1 = await db.get('appMeta', 'seeded_v1');
  const isDayZeroCleanV4 = await db.get('appMeta', 'day_zero_v4_0_clean_slate');

  // Day-Zero Clean-Slate Initialization (v4.0):
  // Every profile (both Guest and Authenticated) starts at Day Zero with 0 completed workouts,
  // 0 streak days, 0 logged meals, 0 sync outbox test records, and neutral 70 kg baseline.
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

    const cleanWeek1Slots = generateFreshCleanSlateSetLogs(INITIAL_WORKOUT_PLAN);
    const txSets = db.transaction('setLogs', 'readwrite');
    for (const s of cleanWeek1Slots) {
      await txSets.store.put(s);
    }
    await txSets.done;

    const txLib = db.transaction('exerciseLibrary', 'readwrite');
    for (const ex of INITIAL_EXERCISE_LIBRARY) {
      await txLib.store.put(ex);
    }
    await txLib.done;

    const txTpl = db.transaction('workoutTemplates', 'readwrite');
    for (const tpl of INITIAL_WORKOUT_TEMPLATES) {
      await txTpl.store.put(tpl);
    }
    await txTpl.done;

    await db.put('appMeta', DEFAULT_NUTRITION_GOALS, 'nutritionGoals');
    await db.put('appMeta', DEFAULT_APP_PREFERENCES, 'appPreferences');
    await db.put('appMeta', DEFAULT_SAVED_CUSTOM_MEALS, 'savedCustomMeals');
    await db.put('appMeta', {}, 'wellbeingByDate');
    await db.put('appMeta', [], 'googleSyncReceipts');
    await db.put('appMeta', 1, 'activeWeek');
    await db.put('appMeta', new Date().toISOString(), 'dayZeroEpochIso');
    await db.put('appMeta', true, 'seeded_v1');
    await db.put('appMeta', true, 'seeded_v2_templates_library');
    await db.put('appMeta', true, 'seeded_v3_streak_fix');
    await db.put('appMeta', true, 'seeded_v4_rpe_and_history');
    await db.put('appMeta', true, 'seeded_v5_calendar_history');
    await db.put('appMeta', true, 'seeded_v6_all_in_one_catalog');
    await db.put('appMeta', true, 'seeded_v7_nutrition_weight_trend');
    await db.put('appMeta', true, 'seeded_v8_hypertrophy_templates_and_indian_meals');
    await db.put('appMeta', true, 'day_zero_v4_0_clean_slate');

    void computeSeedCompletedIso;
    void generateInitialSetLogs;
    void generatePriorMesocycleHistoryLogs;
    void deriveFullWorkoutHistory;
    void resolveSetLogDateISO;
    void getOffsetDateISO;

    return loadAllDatabaseState(options);
  }

  // Automatic One-Time Migration to v4.0 Day-Zero Clean Slate:
  // Removes any legacy demo/test data from earlier iterations (m_seed_*, m_v7_*, hist_m0_*,
  // sync_init_*, pre-completed showcase sets) so existing installs begin cleanly at Day Zero.
  if (!isDayZeroCleanV4) {
    await db.clear('setLogs');
    await db.clear('workoutHistory');
    await db.clear('nutrition');
    await db.clear('feedback');
    await db.clear('syncOutbox');

    const cleanWeek1Slots = generateFreshCleanSlateSetLogs(INITIAL_WORKOUT_PLAN);
    const txSets = db.transaction('setLogs', 'readwrite');
    for (const s of cleanWeek1Slots) {
      await txSets.store.put(s);
    }
    await txSets.done;

    await db.put('appMeta', DEFAULT_NUTRITION_GOALS, 'nutritionGoals');
    await db.put('appMeta', DEFAULT_APP_PREFERENCES, 'appPreferences');
    await db.put('appMeta', {}, 'wellbeingByDate');
    await db.put('appMeta', [], 'googleSyncReceipts');
    await db.put('appMeta', null, 'activeStandaloneSession');
    await db.put('appMeta', null, 'activeWorkoutRunState');
    await db.put('appMeta', 1, 'activeWeek');
    await db.put('appMeta', new Date().toISOString(), 'dayZeroEpochIso');
    await db.put('appMeta', true, 'seeded_v8_hypertrophy_templates_and_indian_meals');
    await db.put('appMeta', true, 'day_zero_v4_0_clean_slate');
  }

  // Always idempotently backfill any newly added built-in exercises or starter templates (e.g., Forearm & Grip routines)
  const currentLibKeys = new Set((await db.getAllKeys('exerciseLibrary')).map(String));
  const missingBuiltInExercises = INITIAL_EXERCISE_LIBRARY.filter(
    (ex) => !currentLibKeys.has(ex.id)
  );
  if (missingBuiltInExercises.length > 0) {
    const txLib = db.transaction('exerciseLibrary', 'readwrite');
    for (const ex of missingBuiltInExercises) {
      await txLib.store.put(ex);
    }
    await txLib.done;
  }

  const currentTplKeys = new Set((await db.getAllKeys('workoutTemplates')).map(String));
  const missingBuiltInTemplates = INITIAL_WORKOUT_TEMPLATES.filter(
    (tpl) => !currentTplKeys.has(tpl.id)
  );
  if (missingBuiltInTemplates.length > 0) {
    const txTpl = db.transaction('workoutTemplates', 'readwrite');
    for (const tpl of missingBuiltInTemplates) {
      await txTpl.store.put(tpl);
    }
    await txTpl.done;
  }

  return loadAllDatabaseState(options);
}

export async function loadAllDatabaseState(options?: DatabaseLoadOptions) {
  const db = await getDB();
  const planArr = await db.getAll('workoutPlan');
  planArr.sort((a, b) => a.dayNumber - b.dayNumber);

  const lmArr = await db.getAll('landmarks');
  const landmarks = { ...DEFAULT_MUSCLE_LANDMARKS };
  for (const lm of lmArr) {
    landmarks[lm.id] = lm;
  }

  const rawSetLogs = await db.getAll('setLogs');
  const setLogs = rawSetLogs.map(sanitizeSetLogEntry).sort(compareSetLogsDeterministic);

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

  const rawNutritionGoals = (await db.get('appMeta', 'nutritionGoals')) as
    | NutritionGoals
    | undefined;
  const nutritionGoals: NutritionGoals = rawNutritionGoals
    ? {
        ...DEFAULT_NUTRITION_GOALS,
        ...rawNutritionGoals,
        hydrationTargetMl:
          typeof rawNutritionGoals.hydrationTargetMl === 'number' &&
          rawNutritionGoals.hydrationTargetMl >= 500
            ? rawNutritionGoals.hydrationTargetMl
            : DEFAULT_NUTRITION_GOALS.hydrationTargetMl ?? 3000,
      }
    : DEFAULT_NUTRITION_GOALS;
  const activeWeek = ((await db.get('appMeta', 'activeWeek')) as number | undefined) ?? 1;
  const activeStandaloneSession =
    ((await db.get('appMeta', 'activeStandaloneSession')) as ActiveStandaloneSession | null | undefined) ??
    null;

  const syncOutbox = await db.getAll('syncOutbox');
  syncOutbox.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const allExerciseLibrary = await db.getAll('exerciseLibrary');
  const prioritizedLibrary = prioritizeExercisesForLogin(allExerciseLibrary, setLogs);
  const totalExerciseLibraryCount = prioritizedLibrary.length;
  const exerciseLibrary =
    typeof options?.initialLibraryLimit === 'number' && options.initialLibraryLimit > 0
      ? prioritizedLibrary.slice(0, options.initialLibraryLimit)
      : prioritizedLibrary;

  const workoutTemplates = await db.getAll('workoutTemplates');
  const categoryRank = (c: WorkoutTemplate['category']) =>
    c === 'Custom' ? 0 : c === 'Starter' ? 1 : 2;
  workoutTemplates.sort((a, b) => {
    const rDiff = categoryRank(a.category) - categoryRank(b.category);
    if (rDiff !== 0) return rDiff;
    return a.name.localeCompare(b.name);
  });

  const workoutHistory = await db.getAll('workoutHistory');
  workoutHistory.sort((a, b) => (a.date < b.date ? 1 : -1));

  let savedCustomMeals = (await db.get('appMeta', 'savedCustomMeals')) as
    | SavedCustomMeal[]
    | undefined;
  if (savedCustomMeals === undefined) {
    savedCustomMeals = DEFAULT_SAVED_CUSTOM_MEALS;
    await db.put('appMeta', savedCustomMeals, 'savedCustomMeals');
  }

  const appPreferences =
    ((await db.get('appMeta', 'appPreferences')) as AppPreferences | undefined) ??
    DEFAULT_APP_PREFERENCES;

  const wellbeingByDate =
    ((await db.get('appMeta', 'wellbeingByDate')) as Record<string, WellbeingDailyRecord> | undefined) ??
    {};

  const activeWorkoutRunState =
    ((await db.get('appMeta', 'activeWorkoutRunState')) as ActiveWorkoutRunState | null | undefined) ??
    null;

  const googleSyncReceipts =
    ((await db.get('appMeta', 'googleSyncReceipts')) as GoogleWorkoutSyncReceipt[] | undefined) ??
    [];

  const trainingPackageStatus =
    ((await db.get('appMeta', 'trainingPackageStatus')) as TrainingPackageStatus | null | undefined) ??
    null;

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
    activeWorkoutRunState,
    exerciseLibrary,
    totalExerciseLibraryCount,
    workoutTemplates,
    workoutHistory,
    savedCustomMeals,
    appPreferences,
    wellbeingByDate,
    googleSyncReceipts,
    trainingPackageStatus,
  };
}

export async function saveGoogleSyncReceipts(
  receipts: GoogleWorkoutSyncReceipt[]
): Promise<void> {
  const db = await getDB();
  await db.put('appMeta', receipts.slice(0, 60), 'googleSyncReceipts');
}

export async function saveTrainingPackageStatus(
  status: TrainingPackageStatus,
  folderPayloads?: {
    databaseSnapshot?: Record<string, unknown>;
    trainingCatalog?: Record<string, unknown>;
    nutritionCatalog?: Record<string, unknown>;
    wellnessAudio?: Record<string, unknown>;
    videoGuides?: Record<string, unknown>;
  }
): Promise<void> {
  const db = await getDB();
  await db.put('appMeta', status, 'trainingPackageStatus');
  if (folderPayloads?.databaseSnapshot) {
    await db.put('appMeta', folderPayloads.databaseSnapshot, 'HyperLogData/database/snapshot.json');
  }
  if (folderPayloads?.trainingCatalog) {
    await db.put('appMeta', folderPayloads.trainingCatalog, 'HyperLogData/training/catalog.json');
  }
  if (folderPayloads?.nutritionCatalog) {
    await db.put(
      'appMeta',
      folderPayloads.nutritionCatalog,
      'HyperLogData/nutrition/indian_recipes.json'
    );
  }
  if (folderPayloads?.wellnessAudio) {
    await db.put(
      'appMeta',
      folderPayloads.wellnessAudio,
      'HyperLogData/wellness/breathing_audio.json'
    );
  }
  if (folderPayloads?.videoGuides) {
    await db.put('appMeta', folderPayloads.videoGuides, 'HyperLogData/videos/video_manifest.json');
  }
}

export async function hasVerifiedTrainingPackageInDb(expectedVersion: string): Promise<boolean> {
  try {
    const db = await getDB();
    const status = (await db.get('appMeta', 'trainingPackageStatus')) as
      | TrainingPackageStatus
      | undefined;
    if (!status || !status.installed || status.packageVersion !== expectedVersion) {
      return false;
    }
    const [catalogSnap, exCount, tplCount] = await Promise.all([
      db.get('appMeta', 'HyperLogData/training/catalog.json'),
      db.count('exerciseLibrary'),
      db.count('workoutTemplates'),
    ]);
    return Boolean(catalogSnap) && exCount > 0 && tplCount > 0;
  } catch {
    return false;
  }
}

export async function saveSetLog(entry: SetLogEntry): Promise<void> {
  const db = await getDB();
  await db.put('setLogs', sanitizeSetLogEntry(entry));
}

export async function saveBulkSetLogs(entries: SetLogEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('setLogs', 'readwrite');
  for (const entry of entries) {
    await tx.store.put(sanitizeSetLogEntry(entry));
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
    await tx.store.put(sanitizeSetLogEntry(entry));
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

export async function saveActiveWorkoutRunState(
  runState: ActiveWorkoutRunState | null
): Promise<void> {
  const db = await getDB();
  await db.put('appMeta', runState, 'activeWorkoutRunState');
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
  invalidateLibraryPageCache();
  const db = await getDB();
  await db.put('exerciseLibrary', exercise);
}

export async function saveBulkLibraryExercises(exercises: LibraryExercise[]): Promise<void> {
  invalidateLibraryPageCache();
  const db = await getDB();
  const tx = db.transaction('exerciseLibrary', 'readwrite');
  for (const ex of exercises) {
    await tx.store.put(ex);
  }
  await tx.done;
}

export async function saveWorkoutTemplate(template: WorkoutTemplate): Promise<void> {
  const db = await getDB();
  await db.put('workoutTemplates', template);
}

export async function saveBulkWorkoutTemplates(templates: WorkoutTemplate[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('workoutTemplates', 'readwrite');
  for (const tpl of templates) {
    await tx.store.put(tpl);
  }
  await tx.done;
}

export async function saveDailyWellbeing(record: WellbeingDailyRecord): Promise<void> {
  const db = await getDB();
  const existing =
    ((await db.get('appMeta', 'wellbeingByDate')) as Record<string, WellbeingDailyRecord> | undefined) ??
    {};
  const updated = { ...existing, [record.date]: record };
  await db.put('appMeta', updated, 'wellbeingByDate');
}

export async function deleteWorkoutTemplate(templateId: string): Promise<void> {
  const db = await getDB();
  await db.delete('workoutTemplates', templateId);
}

export async function enqueueSyncEvent(event: SyncOutboxEvent): Promise<void> {
  const db = await getDB();
  await db.put('syncOutbox', event);
}

export async function clearSyncOutbox(): Promise<void> {
  const db = await getDB();
  await db.clear('syncOutbox');
}

export async function saveSavedCustomMeals(meals: SavedCustomMeal[]): Promise<void> {
  const db = await getDB();
  await db.put('appMeta', meals, 'savedCustomMeals');
}

export async function saveWorkoutHistoryRecord(record: WorkoutHistoryRecord): Promise<void> {
  const db = await getDB();
  await db.put('workoutHistory', record);
}

export async function deleteWorkoutHistoryRecord(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('workoutHistory', id);
}

export async function saveAppPreferences(prefs: AppPreferences): Promise<void> {
  const db = await getDB();
  await db.put('appMeta', prefs, 'appPreferences');
}

export async function exportFullBackupJSON(): Promise<string> {
  const state = await loadAllDatabaseState();
  return JSON.stringify(
    {
      schemaVersion: 4,
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
    for (const rawEntry of parsed.setLogs as Array<SetLogEntry & { completedDateIso?: string }>) {
      if (rawEntry && rawEntry.id) {
        const resolvedDate = rawEntry.completedDate ?? rawEntry.completedDateIso;
        const normalized = sanitizeSetLogEntry({
          ...rawEntry,
          completed: Boolean(rawEntry.completed),
          completedDate: resolvedDate,
          completedAt:
            rawEntry.completedAt ??
            (rawEntry.completed && resolvedDate ? `${resolvedDate}T17:30:00.000Z` : undefined),
        });
        await tx.store.put(normalized);
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
  } else if (Array.isArray(parsed.meals)) {
    // Native Android APK backup compatibility: group flat meals[] by date
    const grouped: Record<string, DailyNutritionRecord> = {};
    for (const m of parsed.meals as Array<{
      id: string;
      date: string;
      mealType?: string;
      name: string;
      calories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      loggedAt?: string;
    }>) {
      if (!m || !m.date) continue;
      if (!grouped[m.date]) {
        grouped[m.date] = {
          date: m.date,
          bodyweightKg: 82.5,
          stepsCount: 8000,
          meals: [],
        };
      }
      grouped[m.date].meals.push({
        id: m.id || `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: m.date,
        mealType: (m.mealType as DailyNutritionRecord['meals'][number]['mealType']) || 'Dinner',
        name: m.name || 'Logged Meal',
        calories: Number(m.calories) || 0,
        proteinG: Number(m.proteinG) || 0,
        carbsG: Number(m.carbsG) || 0,
        fatG: Number(m.fatG) || 0,
        loggedAt: m.loggedAt || '12:00',
      });
    }
    if (Object.keys(grouped).length > 0) {
      await db.clear('nutrition');
      const tx = db.transaction('nutrition', 'readwrite');
      for (const rec of Object.values(grouped)) {
        await tx.store.put(rec);
      }
      await tx.done;
    }
  }

  const incomingLibrary = Array.isArray(parsed.exerciseLibrary)
    ? (parsed.exerciseLibrary as LibraryExercise[])
    : Array.isArray(parsed.libraryExercises)
    ? (parsed.libraryExercises as LibraryExercise[])
    : null;

  if (incomingLibrary && incomingLibrary.length > 0) {
    await db.clear('exerciseLibrary');
    const tx = db.transaction('exerciseLibrary', 'readwrite');
    for (const ex of incomingLibrary) {
      if (ex && ex.id && ex.name) {
        await tx.store.put({
          ...ex,
          secondaryMuscles: Array.isArray(ex.secondaryMuscles) ? ex.secondaryMuscles : [],
          instructions: Array.isArray(ex.instructions) ? ex.instructions : [],
        });
      }
    }
    await tx.done;
  }

  const incomingTemplates = Array.isArray(parsed.workoutTemplates)
    ? (parsed.workoutTemplates as WorkoutTemplate[])
    : Array.isArray(parsed.templates)
    ? (parsed.templates as WorkoutTemplate[])
    : null;

  if (incomingTemplates && incomingTemplates.length > 0) {
    await db.clear('workoutTemplates');
    const tx = db.transaction('workoutTemplates', 'readwrite');
    for (const tpl of incomingTemplates) {
      if (tpl && tpl.id && tpl.name) {
        await tx.store.put({
          ...tpl,
          category: tpl.category || 'Custom',
          updatedAt: tpl.updatedAt || new Date().toISOString(),
          exercises: Array.isArray(tpl.exercises) ? tpl.exercises : [],
        });
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

  if (Array.isArray(parsed.workoutHistory)) {
    await db.clear('workoutHistory');
    const tx = db.transaction('workoutHistory', 'readwrite');
    for (const rec of parsed.workoutHistory as WorkoutHistoryRecord[]) {
      if (rec && rec.id && rec.date) {
        await tx.store.put(rec);
      }
    }
    await tx.done;
  } else if (Array.isArray(parsed.setLogs)) {
    // Derive workoutHistory automatically when importing from Native APK backup
    const allSets = await db.getAll('setLogs');
    const planArr = await db.getAll('workoutPlan');
    const lmArr = await db.getAll('landmarks');
    const lmMap = { ...DEFAULT_MUSCLE_LANDMARKS };
    for (const lm of lmArr) lmMap[lm.id] = lm;
    const derived = deriveFullWorkoutHistory({
      setLogs: allSets,
      persistedHistory: [],
      plan: planArr.length > 0 ? planArr : INITIAL_WORKOUT_PLAN,
      landmarks: lmMap,
    });
    await db.clear('workoutHistory');
    const tx = db.transaction('workoutHistory', 'readwrite');
    for (const rec of derived.allRecords) {
      await tx.store.put(rec);
    }
    await tx.done;
  }

  if (parsed.appPreferences && typeof parsed.appPreferences === 'object') {
    await db.put('appMeta', parsed.appPreferences, 'appPreferences');
  }

  if (parsed.wellbeingByDate && typeof parsed.wellbeingByDate === 'object') {
    await db.put('appMeta', parsed.wellbeingByDate, 'wellbeingByDate');
  }
}

export function computeWidgetProgressSnapshot(params: {
  activeWeek: number;
  plan: WorkoutDayPlan[];
  setLogs: SetLogEntry[];
  workoutHistory?: WorkoutHistoryRecord[];
  nutritionByDate: Record<string, DailyNutritionRecord>;
  nutritionGoals: NutritionGoals;
}): WidgetProgressSnapshot {
  const {
    activeWeek,
    plan,
    setLogs,
    workoutHistory = [],
    nutritionByDate,
    nutritionGoals,
  } = params;
  const todayIso = getTodayISO();

  const activeDates = new Set<string>();
  for (const [iso, rec] of Object.entries(nutritionByDate)) {
    if (rec.meals && rec.meals.length > 0) {
      activeDates.add(iso);
    }
  }
  for (const log of setLogs) {
    if (log.completed) {
      const resolvedDate = resolveSetLogDateISO(log);
      if (resolvedDate) {
        activeDates.add(resolvedDate);
      }
    }
  }
  for (const hist of workoutHistory) {
    if (hist.totalSets > 0 && hist.date) {
      activeDates.add(hist.date);
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

export interface StorageParityCheckResult {
  inSync: boolean;
  repairedRows: number;
  materializedRows: number;
  storageChecksum: string;
  freshState?: Awaited<ReturnType<typeof loadAllDatabaseState>>;
}

function parseDefaultRepFromRange(repRange: string): number {
  const match = String(repRange || '').match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : 10;
}

/**
 * Verifies parity between persistent offline storage and in-memory application state.
 * Repairs any malformed numeric fields on stored SetLogEntry records, materializes any
 * missing active-day or standalone-session set rows, and returns a fresh database snapshot
 * whenever drift is detected or when forceReload is requested.
 */
export async function verifyAndRepairDatabaseParity(params: {
  activeWeek: number;
  activeDay: number;
  inMemoryChecksum: string;
  inMemoryExerciseCount: number;
  inMemoryTemplateCount: number;
  inMemoryHistoryCount: number;
  inMemoryStandaloneSessionId: string | null;
  forceReload?: boolean;
}): Promise<StorageParityCheckResult> {
  const db = await getDB();
  const rawLogs = await db.getAll('setLogs');
  const toRepair: SetLogEntry[] = [];
  const normalizedLogs: SetLogEntry[] = [];

  for (const raw of rawLogs) {
    const clean = sanitizeSetLogEntry(raw);
    const needsRepair =
      typeof raw.weightKg !== 'number' ||
      !Number.isFinite(raw.weightKg) ||
      raw.weightKg !== clean.weightKg ||
      typeof raw.reps !== 'number' ||
      !Number.isFinite(raw.reps) ||
      raw.reps !== clean.reps ||
      typeof raw.rir !== 'number' ||
      !Number.isFinite(raw.rir) ||
      raw.rir !== clean.rir ||
      (raw.rpe !== undefined && raw.rpe !== clean.rpe) ||
      typeof raw.setIndex !== 'number' ||
      raw.setIndex !== clean.setIndex;

    if (needsRepair) {
      toRepair.push(clean);
    }
    normalizedLogs.push(clean);
  }

  const storedWeek =
    ((await db.get('appMeta', 'activeWeek')) as number | undefined) ?? params.activeWeek;
  const effectiveWeek = Number.isFinite(storedWeek) ? storedWeek : params.activeWeek;
  const weekMeta =
    MESOCYCLE_WEEKS.find((w) => w.week === effectiveWeek) ?? MESOCYCLE_WEEKS[2];

  const storedStandalone =
    ((await db.get('appMeta', 'activeStandaloneSession')) as
      | ActiveStandaloneSession
      | null
      | undefined) ?? null;

  const missingRows: SetLogEntry[] = [];

  if (storedStandalone && Array.isArray(storedStandalone.exercises)) {
    for (const item of storedStandalone.exercises) {
      const hasRows = normalizedLogs.some(
        (s) =>
          s.templateSessionId === storedStandalone.sessionId && s.exerciseId === item.id
      );
      if (!hasRows) {
        const targetCount = Math.max(1, Math.round(Number(item.sets) || 3));
        for (let idx = 1; idx <= targetCount; idx++) {
          const entry = sanitizeSetLogEntry({
            id: `${storedStandalone.sessionId}_${item.id}_s${idx}`,
            week: effectiveWeek,
            dayNumber: 0,
            templateSessionId: storedStandalone.sessionId,
            sessionTitle: storedStandalone.templateName,
            exerciseId: item.id,
            exerciseName: item.name,
            muscleId: item.primaryMuscle,
            setIndex: idx,
            weightKg: item.defaultWeightKg,
            reps: parseDefaultRepFromRange(item.reps),
            rir: weekMeta.defaultRirNumber,
            restSeconds: item.restSeconds,
            completed: false,
          });
          missingRows.push(entry);
          normalizedLogs.push(entry);
        }
      }
    }
  } else {
    const dayPlan = await db.get('workoutPlan', params.activeDay);
    if (dayPlan && !dayPlan.isRestDay && Array.isArray(dayPlan.exercises)) {
      for (const ex of dayPlan.exercises) {
        const hasRows = normalizedLogs.some(
          (s) =>
            !s.templateSessionId &&
            s.week === effectiveWeek &&
            s.dayNumber === dayPlan.dayNumber &&
            s.exerciseId === ex.id
        );
        if (!hasRows) {
          const targetSets = Math.max(1, Number(ex.weekSets?.[effectiveWeek] ?? 3));
          for (let idx = 1; idx <= targetSets; idx++) {
            const entry = sanitizeSetLogEntry({
              id: `w${effectiveWeek}_d${dayPlan.dayNumber}_${ex.id}_s${idx}`,
              week: effectiveWeek,
              dayNumber: dayPlan.dayNumber,
              exerciseId: ex.id,
              exerciseName: ex.name,
              muscleId: ex.muscleId,
              setIndex: idx,
              weightKg: ex.defaultWeightKg,
              reps: parseDefaultRepFromRange(ex.repRange),
              rir: weekMeta.defaultRirNumber,
              restSeconds: ex.restSeconds,
              completed: false,
            });
            missingRows.push(entry);
            normalizedLogs.push(entry);
          }
        }
      }
    }
  }

  if (toRepair.length > 0 || missingRows.length > 0) {
    const tx = db.transaction('setLogs', 'readwrite');
    for (const row of toRepair) {
      await tx.store.put(row);
    }
    for (const row of missingRows) {
      await tx.store.put(row);
    }
    await tx.done;
  }

  const [exCount, tplCount, histCount] = await Promise.all([
    db.count('exerciseLibrary'),
    db.count('workoutTemplates'),
    db.count('workoutHistory'),
  ]);

  const storageChecksum = computeSetLogsParityChecksum(normalizedLogs);
  const storedSessionId = storedStandalone?.sessionId ?? null;

  const inSync =
    toRepair.length === 0 &&
    missingRows.length === 0 &&
    effectiveWeek === params.activeWeek &&
    storedSessionId === params.inMemoryStandaloneSessionId &&
    storageChecksum === params.inMemoryChecksum &&
    (params.inMemoryExerciseCount <= 10 || exCount === params.inMemoryExerciseCount) &&
    tplCount === params.inMemoryTemplateCount &&
    histCount === params.inMemoryHistoryCount;

  if (!inSync || params.forceReload) {
    const freshState = await loadAllDatabaseState();
    return {
      inSync,
      repairedRows: toRepair.length,
      materializedRows: missingRows.length,
      storageChecksum,
      freshState,
    };
  }

  return {
    inSync: true,
    repairedRows: 0,
    materializedRows: 0,
    storageChecksum,
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
  await db.clear('workoutHistory');
  try {
    await fetch('/api/google-sync/receipts', { method: 'DELETE' });
  } catch {
    // Ignore offline error
  }
  await initializeDatabaseIfNeeded();
}


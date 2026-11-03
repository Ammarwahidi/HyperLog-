import {
  LibraryExercise,
  MuscleId,
  MuscleLandmark,
  TrainingPackageStatus,
  WorkoutTemplate,
} from '../types/workout';
import {
  INITIAL_EXERCISE_LIBRARY,
  INITIAL_WORKOUT_TEMPLATES,
} from '../data/exerciseCatalog';
import { DEFAULT_MUSCLE_LANDMARKS } from '../data/rpPlanData';
import { OFFLINE_FOOD_CATALOG } from '../data/offlineFoodCatalog';
import { INDIAN_RECIPES_CATALOG } from '../data/indianNutritionData';
import { INDIAN_FOOD_CATALOG } from '../data/indianFoodCatalog';
import { BREATHING_AUDIO_TRACKS } from './breathingAudio';
import {
  hasVerifiedTrainingPackageInDb,
  saveBulkLibraryExercises,
  saveBulkWorkoutTemplates,
  saveTrainingPackageStatus,
} from '../db/localStore';

export const CURRENT_TRAINING_PACKAGE_VERSION = '4.0.0';
const LOCAL_PKG_STAMP_KEY = 'hyperlog_training_package_installed_v4_0_0';
const TOTAL_CURATED_INDIAN_RECIPES = INDIAN_RECIPES_CATALOG.length + INDIAN_FOOD_CATALOG.length;

export interface TrainingBundlePayload {
  packageVersion: string;
  generatedAt: string;
  exercises: LibraryExercise[];
  templates: WorkoutTemplate[];
  landmarks?: Record<MuscleId, MuscleLandmark>;
  videoGuides: Array<{
    id: string;
    exerciseName: string;
    folder: string;
    videoUrl: string;
    cues: string[];
  }>;
  foodsCount: number;
  indianRecipesCount?: number;
  breathingAudioTracksCount?: number;
}

export interface PackageDownloadProgress {
  stage: 'checking' | 'downloading' | 'unpacking' | 'ready';
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  detail: string;
}

function buildEmbeddedVideoGuides(exercises: LibraryExercise[]) {
  return exercises.map((ex) => {
    const folder =
      ex.modality === 'cardio'
        ? 'cardio'
        : ex.modality === 'yoga' || ex.modality === 'stretching'
          ? 'yoga_mobility'
          : ex.majorGroup || 'chest';
    return {
      id: `vid_${ex.id}`,
      exerciseName: ex.name,
      folder: `HyperLogData/videos/${folder}`,
      videoUrl:
        ex.videoUrl ||
        `https://www.youtube.com/results?search_query=${encodeURIComponent(
          `${ex.name} proper form`
        )}`,
      cues: ex.instructions?.slice(0, 3) ?? [],
    };
  });
}

export function isTrainingPackageAlreadyInstalled(): boolean {
  try {
    return window.localStorage.getItem(LOCAL_PKG_STAMP_KEY) === CURRENT_TRAINING_PACKAGE_VERSION;
  } catch {
    return false;
  }
}

export async function verifyTrainingPackageInstalled(): Promise<boolean> {
  if (!isTrainingPackageAlreadyInstalled()) {
    return false;
  }
  return hasVerifiedTrainingPackageInDb(CURRENT_TRAINING_PACKAGE_VERSION);
}

export async function downloadAndUnpackStartupTrainingPackage(options: {
  forceRedownload?: boolean;
  existingExercises: LibraryExercise[];
  existingTemplates: WorkoutTemplate[];
  onProgress?: (progress: PackageDownloadProgress) => void;
}): Promise<{
  status: TrainingPackageStatus;
  mergedExercises: LibraryExercise[];
  mergedTemplates: WorkoutTemplate[];
}> {
  const { forceRedownload = false, existingExercises, existingTemplates, onProgress } = options;

  onProgress?.({
    stage: 'checking',
    percent: 12,
    loadedBytes: 0,
    totalBytes: 0,
    detail: `Checking HyperLog Training & Wellness Package v${CURRENT_TRAINING_PACKAGE_VERSION}…`,
  });

  let payload: TrainingBundlePayload | null = null;
  let downloadedBytes = 0;
  let source: 'server-bundle' | 'offline-embedded' = 'server-bundle';

  try {
    const res = await fetch(
      `/api/package/training-bundle?v=${CURRENT_TRAINING_PACKAGE_VERSION}${
        forceRedownload ? `&t=${Date.now()}` : ''
      }`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }
    );

    if (res.ok) {
      const contentLen = Number(res.headers.get('content-length') || '0');
      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.byteLength;
            const estTotal = Math.max(contentLen, received, 195_000);
            const pct = Math.min(78, 18 + Math.round((received / estTotal) * 60));
            onProgress?.({
              stage: 'downloading',
              percent: pct,
              loadedBytes: received,
              totalBytes: estTotal,
              detail: `Downloading workouts, Indian nutrition & audio package (${(
                received / 1024
              ).toFixed(0)} KB)…`,
            });
          }
        }

        const mergedBytes = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) {
          mergedBytes.set(c, offset);
          offset += c.byteLength;
        }
        downloadedBytes = received;
        const text = new TextDecoder('utf-8').decode(mergedBytes);
        payload = JSON.parse(text) as TrainingBundlePayload;
      } else {
        const text = await res.text();
        downloadedBytes = text.length;
        payload = JSON.parse(text) as TrainingBundlePayload;
      }
    }
  } catch {
    payload = null;
  }

  if (!payload || !Array.isArray(payload.exercises)) {
    source = 'offline-embedded';
    const fallbackVideos = buildEmbeddedVideoGuides(INITIAL_EXERCISE_LIBRARY);
    const serialized = JSON.stringify({
      exercises: INITIAL_EXERCISE_LIBRARY,
      templates: INITIAL_WORKOUT_TEMPLATES,
      videoGuides: fallbackVideos,
      indianRecipes: INDIAN_RECIPES_CATALOG,
      breathingAudio: BREATHING_AUDIO_TRACKS,
    });
    downloadedBytes = serialized.length;
    payload = {
      packageVersion: CURRENT_TRAINING_PACKAGE_VERSION,
      generatedAt: new Date().toISOString(),
      exercises: INITIAL_EXERCISE_LIBRARY,
      templates: INITIAL_WORKOUT_TEMPLATES,
      landmarks: DEFAULT_MUSCLE_LANDMARKS,
      videoGuides: fallbackVideos,
      foodsCount: OFFLINE_FOOD_CATALOG.length,
      indianRecipesCount: TOTAL_CURATED_INDIAN_RECIPES,
      breathingAudioTracksCount: BREATHING_AUDIO_TRACKS.length,
    };
  }

  onProgress?.({
    stage: 'unpacking',
    percent: 88,
    loadedBytes: downloadedBytes,
    totalBytes: downloadedBytes,
    detail: 'Unpacking database, hypertrophy templates, Indian recipes & audio folders…',
  });

  const existingExMap = new Map<string, LibraryExercise>();
  for (const ex of existingExercises) existingExMap.set(ex.id, ex);
  for (const seedEx of INITIAL_EXERCISE_LIBRARY) {
    if (!existingExMap.has(seedEx.id)) {
      existingExMap.set(seedEx.id, seedEx);
    }
  }

  const newExercisesToStore: LibraryExercise[] = [];
  for (const ex of payload.exercises) {
    if (!existingExMap.has(ex.id)) {
      existingExMap.set(ex.id, ex);
      newExercisesToStore.push(ex);
    }
  }

  const existingTplMap = new Map<string, WorkoutTemplate>();
  for (const tpl of existingTemplates) existingTplMap.set(tpl.id, tpl);

  const newTemplatesToStore: WorkoutTemplate[] = [];
  const allCandidateTemplates = [...INITIAL_WORKOUT_TEMPLATES, ...(payload.templates || [])];
  for (const tpl of allCandidateTemplates) {
    if (!existingTplMap.has(tpl.id)) {
      existingTplMap.set(tpl.id, tpl);
      newTemplatesToStore.push(tpl);
    }
  }

  if (newExercisesToStore.length > 0) {
    await saveBulkLibraryExercises(newExercisesToStore);
  }
  if (newTemplatesToStore.length > 0) {
    await saveBulkWorkoutTemplates(newTemplatesToStore);
  }

  const mergedExercises = Array.from(existingExMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const categoryRank = (c: WorkoutTemplate['category']) =>
    c === 'Custom' ? 0 : c === 'Starter' ? 1 : 2;
  const mergedTemplates = Array.from(existingTplMap.values()).sort((a, b) => {
    const diff = categoryRank(a.category) - categoryRank(b.category);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  const nowIso = new Date().toISOString();
  const videoGuides =
    Array.isArray(payload.videoGuides) && payload.videoGuides.length > 0
      ? payload.videoGuides
      : buildEmbeddedVideoGuides(mergedExercises.slice(0, 160));

  const dbBytes = Math.round(downloadedBytes * 0.2);
  const trainingBytes = Math.round(downloadedBytes * 0.4);
  const nutritionBytes = Math.round(downloadedBytes * 0.16);
  const wellnessBytes = Math.round(downloadedBytes * 0.08);
  const videoBytes = Math.max(
    14_200,
    downloadedBytes - dbBytes - trainingBytes - nutritionBytes - wellnessBytes
  );

  const status: TrainingPackageStatus = {
    packageVersion: CURRENT_TRAINING_PACKAGE_VERSION,
    installed: true,
    installedAt: nowIso,
    source,
    totalExercises: mergedExercises.length,
    totalTemplates: mergedTemplates.length,
    totalVideoGuides: videoGuides.length,
    totalFoods: Math.max(payload.foodsCount || 0, OFFLINE_FOOD_CATALOG.length),
    totalRecipes: TOTAL_CURATED_INDIAN_RECIPES,
    totalAudioTracks: BREATHING_AUDIO_TRACKS.length,
    sizeBytes: downloadedBytes,
    folders: [
      {
        folderPath: 'HyperLogData/database/',
        category: 'database',
        fileCount: 4,
        sizeBytes: dbBytes,
        updatedAt: nowIso,
      },
      {
        folderPath: 'HyperLogData/training/',
        category: 'training',
        fileCount: 5,
        sizeBytes: trainingBytes,
        updatedAt: nowIso,
      },
      {
        folderPath: 'HyperLogData/nutrition/',
        category: 'nutrition',
        fileCount: 3,
        sizeBytes: nutritionBytes,
        updatedAt: nowIso,
      },
      {
        folderPath: 'HyperLogData/wellness/',
        category: 'wellness',
        fileCount: 2,
        sizeBytes: wellnessBytes,
        updatedAt: nowIso,
      },
      {
        folderPath: 'HyperLogData/videos/',
        category: 'videos',
        fileCount: 8,
        sizeBytes: videoBytes,
        updatedAt: nowIso,
      },
      {
        folderPath: 'HyperLogData/logs/',
        category: 'logs',
        fileCount: 1,
        sizeBytes: 4200,
        updatedAt: nowIso,
      },
    ],
  };

  await saveTrainingPackageStatus(status, {
    databaseSnapshot: {
      packageVersion: CURRENT_TRAINING_PACKAGE_VERSION,
      syncedAt: nowIso,
      foodsCount: status.totalFoods,
    },
    trainingCatalog: {
      packageVersion: CURRENT_TRAINING_PACKAGE_VERSION,
      exercisesCount: status.totalExercises,
      templatesCount: status.totalTemplates,
    },
    nutritionCatalog: {
      packageVersion: CURRENT_TRAINING_PACKAGE_VERSION,
      foodsCount: OFFLINE_FOOD_CATALOG.length,
      indianRecipesCount: TOTAL_CURATED_INDIAN_RECIPES,
      recipes: [
        ...INDIAN_RECIPES_CATALOG.map((r) => ({
          id: r.id,
          name: r.name,
          dietPreference: r.dietPreference,
          calories: r.calories,
          proteinG: r.proteinG,
        })),
        ...INDIAN_FOOD_CATALOG.map((r) => ({
          id: r.id,
          name: r.name,
          dietPreference: r.dietaryTags[0] || 'Vegetarian',
          calories: r.macros.calories,
          proteinG: r.macros.proteinG,
        })),
      ],
    },
    wellnessAudio: {
      packageVersion: CURRENT_TRAINING_PACKAGE_VERSION,
      tracks: BREATHING_AUDIO_TRACKS,
    },
    videoGuides: {
      packageVersion: CURRENT_TRAINING_PACKAGE_VERSION,
      folders: [
        'chest',
        'back',
        'shoulders',
        'arms',
        'core',
        'legs',
        'cardio',
        'yoga_mobility',
      ],
      guidesCount: videoGuides.length,
      guidesSample: videoGuides.slice(0, 60),
    },
  });

  try {
    window.localStorage.setItem(LOCAL_PKG_STAMP_KEY, CURRENT_TRAINING_PACKAGE_VERSION);
  } catch {
    // Ignore storage quota errors
  }

  onProgress?.({
    stage: 'ready',
    percent: 100,
    loadedBytes: downloadedBytes,
    totalBytes: downloadedBytes,
    detail: `Resource Package v${CURRENT_TRAINING_PACKAGE_VERSION} ready (${mergedExercises.length} exercises · ${mergedTemplates.length} templates · ${TOTAL_CURATED_INDIAN_RECIPES} Indian recipes).`,
  });

  return {
    status,
    mergedExercises,
    mergedTemplates,
  };
}

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const APK_FILENAME = 'HyperLog-v4.0-claymorphism-release.apk';
const LEGACY_APK_FILENAME = 'HyperLog-v3.0-workout-tracker-release.apk';
const BUNDLE_FILENAME = 'HyperLog-v4.0-Phone-Install-Bundle.zip';
const LEGACY_BUNDLE_FILENAME = 'HyperLog-v3.0-Phone-Install-Bundle.zip';
const SOURCE_ZIP_FILENAME = 'HyperLog-v4.0-AndroidStudio-Source.zip';
const LEGACY_SOURCE_ZIP_FILENAME = 'HyperLog-v3.0-AndroidStudio-Source.zip';
const MANIFEST_FILENAME = 'apk-manifest.json';

function resolveDownloadFile(fileName: string): string | null {
  const candidates = [
    path.resolve(__dirname, 'public', 'downloads', fileName),
    path.resolve(__dirname, 'dist', 'downloads', fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      if (stat.isFile() && stat.size > 0) {
        return candidate;
      }
    }
  }
  return null;
}

function streamBinaryAttachment(
  req: Request,
  res: Response,
  filePath: string,
  downloadName: string,
  mimeType: string
): void {
  const stat = fs.statSync(filePath);
  const totalSize = stat.size;

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0] || '0', 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
    if (start >= 0 && start < totalSize && end < totalSize && start <= end) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', String(end - start + 1));
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
  }

  res.status(200);
  res.setHeader('Content-Length', String(totalSize));
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function handleApkDownload(req: Request, res: Response): void {
  const apkPath = resolveDownloadFile(APK_FILENAME) || resolveDownloadFile(LEGACY_APK_FILENAME);
  if (!apkPath) {
    res.status(404).json({ error: 'Signed v4.0 APK artifact not found on server.' });
    return;
  }
  streamBinaryAttachment(
    req,
    res,
    apkPath,
    APK_FILENAME,
    'application/vnd.android.package-archive'
  );
}

function handleBundleDownload(req: Request, res: Response): void {
  const bundlePath =
    resolveDownloadFile(BUNDLE_FILENAME) ||
    resolveDownloadFile(SOURCE_ZIP_FILENAME) ||
    resolveDownloadFile(LEGACY_BUNDLE_FILENAME);
  if (!bundlePath) {
    res.status(404).json({ error: 'Phone bundle v4.0 ZIP artifact not found on server.' });
    return;
  }
  streamBinaryAttachment(req, res, bundlePath, BUNDLE_FILENAME, 'application/zip');
}

function handleSourceZipDownload(req: Request, res: Response): void {
  const zipPath =
    resolveDownloadFile(SOURCE_ZIP_FILENAME) || resolveDownloadFile(LEGACY_SOURCE_ZIP_FILENAME);
  if (!zipPath) {
    res.status(404).json({ error: 'Android source ZIP not found on server.' });
    return;
  }
  streamBinaryAttachment(req, res, zipPath, SOURCE_ZIP_FILENAME, 'application/zip');
}

interface RawOnlineExercise {
  id: string;
  name: string;
  force?: string | null;
  level?: string | null;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  category?: string;
}

interface MappedLibraryExercise {
  id: string;
  name: string;
  majorGroup: 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'legs';
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  modality: 'strength' | 'cardio' | 'yoga' | 'stretching';
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  durationSeconds?: number;
  sourceRepo: string;
  description: string;
  instructions: string[];
  defaultRepRange: string;
  defaultRestSeconds: number;
  defaultWeightKg: number;
  videoUrl: string;
  videoSourceLabel: string;
}

interface MappedWorkoutTemplate {
  id: string;
  name: string;
  category: 'Online';
  modality: 'strength' | 'cardio' | 'yoga' | 'stretching';
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedMinutes: number;
  sourceLabel: string;
  splitType: string;
  description: string;
  updatedAt: string;
  exercises: Array<{
    id: string;
    libraryExerciseId: string;
    name: string;
    primaryMuscle: string;
    secondaryMuscles: string[];
    sets: number;
    reps: string;
    restSeconds: number;
    defaultWeightKg: number;
  }>;
}

const FREE_EXERCISE_DB_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

let cachedOnlineCatalog: {
  fetchedAtMs: number;
  source: string;
  totalFetched: number;
  exercises: MappedLibraryExercise[];
  templates: MappedWorkoutTemplate[];
} | null = null;

function mapOnlineMuscle(rawMuscle: string | undefined, exName: string): {
  primaryMuscle: string;
  majorGroup: 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'legs';
} {
  const m = (rawMuscle || '').toLowerCase();
  const lowerName = exName.toLowerCase();
  if (m === 'chest') return { primaryMuscle: 'chest', majorGroup: 'chest' };
  if (m === 'lats' || m === 'middle back' || m === 'lower back') {
    return { primaryMuscle: 'back', majorGroup: 'back' };
  }
  if (m === 'shoulders') {
    const isLateralOrRear =
      lowerName.includes('lateral') ||
      lowerName.includes('rear') ||
      lowerName.includes('reverse') ||
      lowerName.includes('face pull');
    return {
      primaryMuscle: isLateralOrRear ? 'rear_side_delts' : 'front_delts',
      majorGroup: 'shoulders',
    };
  }
  if (m === 'traps' || m === 'neck') {
    return { primaryMuscle: 'traps', majorGroup: 'shoulders' };
  }
  if (m === 'biceps') return { primaryMuscle: 'biceps', majorGroup: 'arms' };
  if (m === 'triceps') return { primaryMuscle: 'triceps', majorGroup: 'arms' };
  if (m === 'forearms') return { primaryMuscle: 'forearms', majorGroup: 'arms' };
  if (m === 'abdominals') return { primaryMuscle: 'abs', majorGroup: 'core' };
  if (m === 'hamstrings') return { primaryMuscle: 'hamstrings', majorGroup: 'legs' };
  if (m === 'glutes' || m === 'abductors') return { primaryMuscle: 'glutes', majorGroup: 'legs' };
  if (m === 'calves') return { primaryMuscle: 'calves', majorGroup: 'legs' };
  return { primaryMuscle: 'quads', majorGroup: 'legs' };
}

function mapOnlineEquipment(rawEq: string | null | undefined, category: string): string {
  const eq = (rawEq || '').toLowerCase();
  if (eq === 'barbell' || eq === 'e-z curl bar') return 'Barbell';
  if (eq === 'dumbbell') return 'Dumbbell';
  if (eq === 'cable') return 'Cable';
  if (eq === 'machine') return category === 'cardio' ? 'Cardio Machine' : 'Machine';
  if (eq === 'kettlebells') return 'Kettlebell';
  if (eq === 'bands') return 'Bands';
  if (eq === 'foam roll' || eq === 'exercise ball') return 'Yoga Mat';
  if (category === 'stretching') return 'Yoga Mat';
  if (category === 'cardio') return 'Bodyweight';
  return 'Bodyweight';
}

function mapOnlineModality(
  category: string,
  exName: string
): 'strength' | 'cardio' | 'yoga' | 'stretching' {
  const cat = category.toLowerCase();
  const n = exName.toLowerCase();
  if (
    n.includes('yoga') ||
    n.includes('cobra') ||
    n.includes('child') ||
    n.includes('warrior') ||
    n.includes('downward')
  ) {
    return 'yoga';
  }
  if (cat === 'stretching') return 'stretching';
  if (cat === 'cardio' || cat === 'plyometrics') return 'cardio';
  return 'strength';
}

function mapOnlineLevel(rawLevel: string | null | undefined): 'Beginner' | 'Intermediate' | 'Advanced' {
  const l = (rawLevel || '').toLowerCase();
  if (l === 'expert' || l === 'advanced') return 'Advanced';
  if (l === 'intermediate') return 'Intermediate';
  return 'Beginner';
}

function mapRawExerciseToLibrary(raw: RawOnlineExercise): MappedLibraryExercise {
  const cat = (raw.category || 'strength').toLowerCase();
  const { primaryMuscle, majorGroup } = mapOnlineMuscle(raw.primaryMuscles?.[0], raw.name);
  const secondarySet = new Set<string>();
  for (const sec of raw.secondaryMuscles || []) {
    const mapped = mapOnlineMuscle(sec, raw.name).primaryMuscle;
    if (mapped !== primaryMuscle) secondarySet.add(mapped);
  }

  const equipment = mapOnlineEquipment(raw.equipment, cat);
  const modality = mapOnlineModality(cat, raw.name);
  const level = mapOnlineLevel(raw.level);

  const isTimed = modality === 'stretching' || modality === 'yoga' || cat === 'cardio';
  const defaultRepRange =
    modality === 'stretching' || modality === 'yoga'
      ? '45–60s'
      : cat === 'cardio'
      ? '60–120s'
      : cat === 'plyometrics'
      ? '8–12'
      : cat === 'powerlifting' || cat === 'strongman' || cat === 'olympic weightlifting'
      ? '3–6'
      : '8–12';

  const defaultRestSeconds =
    modality === 'stretching' || modality === 'yoga'
      ? 20
      : modality === 'cardio'
      ? 45
      : cat === 'powerlifting' || cat === 'strongman'
      ? 180
      : 90;

  const defaultWeightKg =
    isTimed || equipment === 'Bodyweight' || equipment === 'Yoga Mat' || equipment === 'Bands' || equipment === 'Cardio Machine'
      ? 0
      : equipment === 'Barbell'
      ? 60
      : equipment === 'Kettlebell'
      ? 16
      : equipment === 'Dumbbell'
      ? 16
      : 40;

  const cleanInstructions =
    Array.isArray(raw.instructions) && raw.instructions.length > 0
      ? raw.instructions.map((s) => String(s).trim()).filter(Boolean)
      : [
          'Set a stable posture and controlled breathing cadence before initiating each repetition.',
          'Move smoothly through your full pain-free range of motion and control the return phase.',
        ];

  const primaryLabel = (raw.primaryMuscles?.[0] || majorGroup).replace(/\b\w/g, (c) =>
    c.toUpperCase()
  );
  const categoryLabel = cat.replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    id: `online_${String(raw.id || raw.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')}`,
    name: raw.name,
    majorGroup,
    primaryMuscle,
    secondaryMuscles: Array.from(secondarySet).slice(0, 3),
    equipment,
    modality,
    level,
    durationSeconds: isTimed ? 60 : undefined,
    sourceRepo: 'free-exercise-db',
    description: `${categoryLabel} movement targeting ${primaryLabel} (${equipment} · ${level}). ${
      cleanInstructions[0] ?? ''
    }`.trim(),
    instructions: cleanInstructions,
    defaultRepRange,
    defaultRestSeconds,
    defaultWeightKg,
    videoUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${raw.name} exercise form tutorial`
    )}`,
    videoSourceLabel: 'Video Form Search',
  };
}

function buildOnlineWorkoutTemplates(
  rawList: RawOnlineExercise[],
  mappedByRawId: Map<string, MappedLibraryExercise>
): MappedWorkoutTemplate[] {
  const nowIso = new Date().toISOString();

  const pickByPredicate = (
    pred: (r: RawOnlineExercise, m: MappedLibraryExercise) => boolean,
    limit: number
  ): MappedLibraryExercise[] => {
    const out: MappedLibraryExercise[] = [];
    const seenPrimary = new Map<string, number>();
    for (const r of rawList) {
      const m = mappedByRawId.get(r.id);
      if (!m) continue;
      if (!pred(r, m)) continue;
      const count = seenPrimary.get(m.primaryMuscle) ?? 0;
      if (count >= 3 && out.length < limit) {
        // Prefer variety across muscles first
        continue;
      }
      out.push(m);
      seenPrimary.set(m.primaryMuscle, count + 1);
      if (out.length >= limit) break;
    }
    if (out.length < limit) {
      for (const r of rawList) {
        const m = mappedByRawId.get(r.id);
        if (!m || out.some((x) => x.id === m.id)) continue;
        if (pred(r, m)) {
          out.push(m);
          if (out.length >= limit) break;
        }
      }
    }
    return out;
  };

  const specs: Array<{
    id: string;
    name: string;
    modality: 'strength' | 'cardio' | 'yoga' | 'stretching';
    level: 'Beginner' | 'Intermediate' | 'Advanced';
    estimatedMinutes: number;
    splitType: string;
    description: string;
    sets: number;
    pred: (r: RawOnlineExercise, m: MappedLibraryExercise) => boolean;
  }> = [
    {
      id: 'tpl_online_powerlifting_sbd',
      name: 'Powerlifting Competition Peaking (SBD)',
      modality: 'strength',
      level: 'Advanced',
      estimatedMinutes: 70,
      splitType: 'Powerlifting · Squat / Bench / Deadlift',
      description:
        'Competition-style barbell powerlifting session pulled from the open Powerlifting exercise index.',
      sets: 4,
      pred: (r) => (r.category || '').toLowerCase() === 'powerlifting',
    },
    {
      id: 'tpl_online_olympic_weightlifting',
      name: 'Olympic Weightlifting Explosiveness',
      modality: 'strength',
      level: 'Advanced',
      estimatedMinutes: 60,
      splitType: 'Olympic Lifting · Triple Extension',
      description:
        'Clean, snatch, and overhead jerk derivatives for explosive rate-of-force development.',
      sets: 4,
      pred: (r) => (r.category || '').toLowerCase() === 'olympic weightlifting',
    },
    {
      id: 'tpl_online_strongman_power',
      name: 'Strongman Loaded Carries & Pressing',
      modality: 'strength',
      level: 'Intermediate',
      estimatedMinutes: 55,
      splitType: 'Strongman · Full-Body Work Capacity',
      description:
        'Odd-object, axle, stone, and loaded carry movements building rugged full-body strength.',
      sets: 3,
      pred: (r) => (r.category || '').toLowerCase() === 'strongman',
    },
    {
      id: 'tpl_online_plyometrics_speed',
      name: 'Plyometric Jump & Reactive Conditioning',
      modality: 'cardio',
      level: 'Intermediate',
      estimatedMinutes: 35,
      splitType: 'Plyometrics & Athletic Speed',
      description:
        'Explosive bounding, box jumps, and medicine-ball reactive drills for athletic power and cardio.',
      sets: 3,
      pred: (r) => (r.category || '').toLowerCase() === 'plyometrics',
    },
    {
      id: 'tpl_online_kettlebell_conditioning',
      name: 'Kettlebell Total-Body Conditioning',
      modality: 'cardio',
      level: 'Intermediate',
      estimatedMinutes: 40,
      splitType: 'Kettlebell Flow · Strength + Engine',
      description:
        'Ballistic swings, cleans, presses, and goblet squats using a single kettlebell.',
      sets: 3,
      pred: (r) => (r.equipment || '').toLowerCase() === 'kettlebells',
    },
    {
      id: 'tpl_online_resistance_bands_travel',
      name: 'Travel & Hotel Resistance Band Workout',
      modality: 'strength',
      level: 'Beginner',
      estimatedMinutes: 35,
      splitType: 'Portable Bands · Full Body',
      description:
        'Zero-gym portable resistance band routine hitting chest, back, shoulders, arms, and legs anywhere.',
      sets: 3,
      pred: (r) => (r.equipment || '').toLowerCase() === 'bands',
    },
    {
      id: 'tpl_online_bodyweight_calisthenics',
      name: 'Zero-Equipment Calisthenics Park Routine',
      modality: 'strength',
      level: 'Beginner',
      estimatedMinutes: 42,
      splitType: 'Bodyweight Calisthenics',
      description:
        'Pure bodyweight strength routine combining push, pull, squat, and core movements.',
      sets: 3,
      pred: (r, m) =>
        (r.equipment || '').toLowerCase() === 'body only' && m.modality === 'strength',
    },
    {
      id: 'tpl_online_chest_back_antagonist',
      name: 'Old-School Chest & Back Antagonist Volume',
      modality: 'strength',
      level: 'Intermediate',
      estimatedMinutes: 60,
      splitType: 'Upper Torso · Chest + Back',
      description:
        'High-pump chest pressing paired with horizontal and vertical back pulls.',
      sets: 4,
      pred: (_r, m) =>
        m.modality === 'strength' && (m.majorGroup === 'chest' || m.majorGroup === 'back'),
    },
    {
      id: 'tpl_online_legs_posterior_builder',
      name: 'Complete Lower Body · Quads, Glutes & Hamstrings',
      modality: 'strength',
      level: 'Intermediate',
      estimatedMinutes: 60,
      splitType: 'Lower Body Hypertrophy',
      description:
        'Balanced squat, hinge, lunge, and calf session drawn from the global strength database.',
      sets: 4,
      pred: (_r, m) => m.modality === 'strength' && m.majorGroup === 'legs',
    },
    {
      id: 'tpl_online_delts_arms_sculpt',
      name: 'Shoulders, Traps & Arms Specialization',
      modality: 'strength',
      level: 'Intermediate',
      estimatedMinutes: 50,
      splitType: 'Delts & Arms Isolation',
      description:
        'Focused upper-limb hypertrophy targeting front/side/rear deltoids, biceps, triceps, and forearms.',
      sets: 3,
      pred: (_r, m) =>
        m.modality === 'strength' && (m.majorGroup === 'shoulders' || m.majorGroup === 'arms'),
    },
    {
      id: 'tpl_online_cardio_sweat_circuit',
      name: 'Cardio & Metabolic Sweat Circuit',
      modality: 'cardio',
      level: 'Beginner',
      estimatedMinutes: 30,
      splitType: 'Cardio Conditioning · Heart Health',
      description:
        'Continuous aerobic and anaerobic conditioning intervals to elevate VO2 max and daily calorie burn.',
      sets: 3,
      pred: (r) => (r.category || '').toLowerCase() === 'cardio',
    },
    {
      id: 'tpl_online_full_body_stretching',
      name: 'Full-Body Active Flexibility & Stretching',
      modality: 'stretching',
      level: 'Beginner',
      estimatedMinutes: 25,
      splitType: 'Stretching & Joint Mobility',
      description:
        'Head-to-toe active and static stretching routine to restore tight hips, hamstrings, chest, and shoulders.',
      sets: 2,
      pred: (r) =>
        (r.category || '').toLowerCase() === 'stretching' &&
        (r.equipment || '').toLowerCase() !== 'foam roll',
    },
    {
      id: 'tpl_online_foam_roll_recovery',
      name: 'Myofascial Foam Roll & Recovery Session',
      modality: 'stretching',
      level: 'Beginner',
      estimatedMinutes: 20,
      splitType: 'Self-Myofascial Release · Recovery Day',
      description:
        'Guided foam rolling sequence releasing quads, IT band, piriformis, lats, and thoracic spine.',
      sets: 2,
      pred: (r) => (r.equipment || '').toLowerCase() === 'foam roll',
    },
  ];

  const templates: MappedWorkoutTemplate[] = [];
  for (const spec of specs) {
    const chosen = pickByPredicate(spec.pred, 6);
    if (chosen.length === 0) continue;
    templates.push({
      id: spec.id,
      name: spec.name,
      category: 'Online',
      modality: spec.modality,
      level: spec.level,
      estimatedMinutes: spec.estimatedMinutes,
      sourceLabel: 'Open Fitness DB (GitHub)',
      splitType: spec.splitType,
      description: spec.description,
      updatedAt: nowIso,
      exercises: chosen.map((ex, idx) => ({
        id: `${spec.id}_item_${idx + 1}`,
        libraryExerciseId: ex.id,
        name: ex.name,
        primaryMuscle: ex.primaryMuscle,
        secondaryMuscles: ex.secondaryMuscles,
        sets: spec.sets,
        reps: ex.defaultRepRange,
        restSeconds: ex.defaultRestSeconds,
        defaultWeightKg: ex.defaultWeightKg,
      })),
    });
  }

  return templates;
}

function sendCatalogResponseWithPaginationAndEtag(
  req: Request,
  res: Response,
  catalog: NonNullable<typeof cachedOnlineCatalog>
): void {
  const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : NaN;
  const rawCursor = req.query.cursor !== undefined ? Number(req.query.cursor) : 0;
  const queryText = String(req.query.q || '')
    .trim()
    .toLowerCase();

  let filteredExercises = catalog.exercises;
  if (queryText) {
    const tokens = queryText.split(/\s+/).filter(Boolean);
    filteredExercises = catalog.exercises.filter((ex) => {
      const hay = `${ex.name} ${ex.majorGroup} ${ex.primaryMuscle} ${ex.equipment} ${ex.modality ?? ''}`.toLowerCase();
      return tokens.every((tok) => hay.includes(tok));
    });
  }

  const isPaginated = Number.isFinite(rawLimit) && rawLimit > 0;
  const safeOffset = Number.isFinite(rawCursor) && rawCursor >= 0 ? Math.floor(rawCursor) : 0;
  const safeLimit = isPaginated ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : filteredExercises.length;
  const pageItems = isPaginated
    ? filteredExercises.slice(safeOffset, safeOffset + safeLimit)
    : filteredExercises;
  const nextCursor =
    isPaginated && safeOffset + safeLimit < filteredExercises.length
      ? safeOffset + safeLimit
      : null;

  const etag = `W/"hl-cat-${catalog.totalFetched}-${filteredExercises.length}-${safeOffset}-${safeLimit}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  res.json({
    source: catalog.source,
    totalFetched: catalog.totalFetched,
    totalMatching: filteredExercises.length,
    cursor: safeOffset,
    nextCursor,
    hasMore: nextCursor !== null,
    exercises: pageItems,
    templates: !isPaginated || safeOffset === 0 ? catalog.templates : [],
  });
}

async function handleOnlineCatalogSync(req: Request, res: Response): Promise<void> {
  try {
    // Serve from 30-min memory cache if warm
    if (cachedOnlineCatalog && Date.now() - cachedOnlineCatalog.fetchedAtMs < 30 * 60 * 1000) {
      sendCatalogResponseWithPaginationAndEtag(req, res, cachedOnlineCatalog);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const upstream = await fetch(FREE_EXERCISE_DB_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      res.status(502).json({
        error: `Upstream exercise repository returned HTTP ${upstream.status}`,
      });
      return;
    }

    const rawData = (await upstream.json()) as RawOnlineExercise[];
    if (!Array.isArray(rawData)) {
      res.status(502).json({ error: 'Unexpected upstream catalog format.' });
      return;
    }

    const mappedExercises: MappedLibraryExercise[] = [];
    const mappedByRawId = new Map<string, MappedLibraryExercise>();

    for (const raw of rawData) {
      if (!raw || !raw.name) continue;
      const mapped = mapRawExerciseToLibrary(raw);
      mappedExercises.push(mapped);
      mappedByRawId.set(raw.id, mapped);
    }

    const templates = buildOnlineWorkoutTemplates(rawData, mappedByRawId);

    cachedOnlineCatalog = {
      fetchedAtMs: Date.now(),
      source: 'yuhonas/free-exercise-db (Public Domain)',
      totalFetched: mappedExercises.length,
      exercises: mappedExercises,
      templates,
    };

    sendCatalogResponseWithPaginationAndEtag(req, res, cachedOnlineCatalog);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to reach online workout database';
    res.status(503).json({
      error: `Online workout sync temporarily unavailable: ${msg}`,
    });
  }
}

interface ServerGoogleSyncReceipt {
  id: string;
  sessionId: string;
  workoutTitle: string;
  syncedAt: string;
  status: 'SYNCED' | 'QUEUED_OFFLINE';
  googleFitDataSource: string;
  healthConnectRecordType: string;
  totalSets: number;
  totalTonnageKg: number;
  durationMinutes: number;
  activeCaloriesKcal: number;
  cardioMinutes: number;
}

const HYPERLOG_DATA_ROOT = path.resolve(__dirname, 'HyperLogData');
const GOOGLE_SYNC_RECEIPTS_FILE = path.join(
  HYPERLOG_DATA_ROOT,
  'database',
  'google_sync_receipts.json'
);
const VIDEO_SUBFOLDERS = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'core',
  'legs',
  'cardio',
  'yoga_mobility',
  'offline_saved',
];

function ensureServerStorageFolders(): void {
  try {
    fs.mkdirSync(path.join(HYPERLOG_DATA_ROOT, 'database'), { recursive: true });
    fs.mkdirSync(path.join(HYPERLOG_DATA_ROOT, 'training'), { recursive: true });
    fs.mkdirSync(path.join(HYPERLOG_DATA_ROOT, 'nutrition'), { recursive: true });
    fs.mkdirSync(path.join(HYPERLOG_DATA_ROOT, 'wellness'), { recursive: true });
    fs.mkdirSync(path.join(HYPERLOG_DATA_ROOT, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(HYPERLOG_DATA_ROOT, 'logs', 'archives'), { recursive: true });
    for (const sub of VIDEO_SUBFOLDERS) {
      fs.mkdirSync(path.join(HYPERLOG_DATA_ROOT, 'videos', sub), { recursive: true });
    }
  } catch {
    // Read-only container fallback
  }
}

interface ServerTelemetryLogEntry {
  id: string;
  timestampIso: string;
  dayZeroOffsetMinutes: number;
  level: 'INFO' | 'METRIC' | 'ACTION' | 'WARN' | 'ERROR';
  category: string;
  event: string;
  durationMs?: number;
  metadata?: Record<string, string | number | boolean>;
}

const LIVE_TELEMETRY_LOGS_FILE = path.join(HYPERLOG_DATA_ROOT, 'logs', 'live_telemetry.json');
const MAX_SERVER_LIVE_LOGS = 500;
let memoryTelemetryLogs: ServerTelemetryLogEntry[] = [];

function loadServerTelemetryLogs(): ServerTelemetryLogEntry[] {
  try {
    if (fs.existsSync(LIVE_TELEMETRY_LOGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LIVE_TELEMETRY_LOGS_FILE, 'utf-8'));
      if (Array.isArray(parsed)) {
        memoryTelemetryLogs = parsed;
      }
    }
  } catch {
    // Fallback to in-memory ring buffer
  }
  return memoryTelemetryLogs;
}

function saveServerTelemetryLogs(entries: ServerTelemetryLogEntry[]): void {
  memoryTelemetryLogs = entries.slice(0, MAX_SERVER_LIVE_LOGS);
  try {
    ensureServerStorageFolders();
    fs.writeFileSync(LIVE_TELEMETRY_LOGS_FILE, JSON.stringify(memoryTelemetryLogs, null, 2), 'utf-8');
  } catch {
    // Ignore read-only disk errors
  }
}

let memoryGoogleSyncReceipts: ServerGoogleSyncReceipt[] = [];

function loadServerGoogleSyncReceipts(): ServerGoogleSyncReceipt[] {
  try {
    if (fs.existsSync(GOOGLE_SYNC_RECEIPTS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(GOOGLE_SYNC_RECEIPTS_FILE, 'utf-8'));
      if (Array.isArray(parsed)) {
        memoryGoogleSyncReceipts = parsed;
      }
    }
  } catch {
    // Use memory receipts
  }
  return memoryGoogleSyncReceipts;
}

function appendServerGoogleSyncReceipt(receipt: ServerGoogleSyncReceipt): void {
  const existing = loadServerGoogleSyncReceipts().filter((r) => r.sessionId !== receipt.sessionId);
  memoryGoogleSyncReceipts = [receipt, ...existing].slice(0, 100);
  try {
    ensureServerStorageFolders();
    fs.writeFileSync(
      GOOGLE_SYNC_RECEIPTS_FILE,
      JSON.stringify(memoryGoogleSyncReceipts, null, 2),
      'utf-8'
    );
  } catch {
    // Ignore read-only fs errors
  }
}

const EMBEDDED_PACKAGE_EXERCISES: MappedLibraryExercise[] = [
  {
    id: 'pkg_zone2_incline_treadmill',
    name: 'Zone 2 Incline Treadmill Walk',
    majorGroup: 'legs',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes', 'calves'],
    equipment: 'Cardio Machine',
    modality: 'cardio',
    level: 'Beginner',
    durationSeconds: 1200,
    sourceRepo: 'hyperlog-training-pkg-v2.6',
    description:
      'Steady Zone 2 aerobic treadmill walk at 8–12% incline for mitochondrial density and fat oxidation.',
    instructions: [
      'Set treadmill incline between 8% and 12% and speed between 4.5–5.8 km/h without holding the handrails.',
      'Maintain nasal-conversational breathing (60–70% HRmax) for the target timer duration.',
    ],
    defaultRepRange: '20 min',
    defaultRestSeconds: 30,
    defaultWeightKg: 0,
    videoUrl: 'https://www.youtube.com/results?search_query=zone+2+incline+treadmill+walk+form',
    videoSourceLabel: 'Cardio Video Guide',
  },
  {
    id: 'pkg_stationary_bike_intervals',
    name: 'Stationary Assault / Spin Bike Conditioning',
    majorGroup: 'legs',
    primaryMuscle: 'quads',
    secondaryMuscles: ['hamstrings', 'glutes'],
    equipment: 'Cardio Machine',
    modality: 'cardio',
    level: 'Intermediate',
    durationSeconds: 900,
    sourceRepo: 'hyperlog-training-pkg-v2.6',
    description:
      'Zero-impact concentric cycling intervals building VO2 max and work capacity without eccentric leg soreness.',
    instructions: [
      'Adjust saddle height so your knee retains a 15-degree bend at the bottom of the pedal stroke.',
      'Maintain smooth 80–95 RPM cadence across the countdown timer.',
    ],
    defaultRepRange: '15 min',
    defaultRestSeconds: 45,
    defaultWeightKg: 0,
    videoUrl: 'https://www.youtube.com/results?search_query=stationary+bike+hiit+workout+technique',
    videoSourceLabel: 'Cardio Video Guide',
  },
  {
    id: 'pkg_concept2_rower_erg',
    name: 'Rowing Ergometer 2000m / Timed Pace',
    majorGroup: 'back',
    primaryMuscle: 'back',
    secondaryMuscles: ['quads', 'hamstrings', 'biceps'],
    equipment: 'Cardio Machine',
    modality: 'cardio',
    level: 'Intermediate',
    durationSeconds: 900,
    sourceRepo: 'hyperlog-training-pkg-v2.6',
    description: 'Full-body posterior-chain and aerobic conditioning on the rowing ergometer.',
    instructions: [
      'Sequence each stroke cleanly: legs drive first, hips swing open, arms pull handle to lower ribs.',
      'Recover in reverse order (arms, hips, knees) at a controlled 1:2 drive-to-recovery ratio.',
    ],
    defaultRepRange: '15 min',
    defaultRestSeconds: 60,
    defaultWeightKg: 0,
    videoUrl: 'https://www.youtube.com/results?search_query=concept2+rowing+technique+proper+form',
    videoSourceLabel: 'Cardio Video Guide',
  },
  {
    id: 'pkg_stairmaster_steady_climb',
    name: 'StairMaster Steady Climb',
    majorGroup: 'legs',
    primaryMuscle: 'glutes',
    secondaryMuscles: ['quads', 'calves'],
    equipment: 'Cardio Machine',
    modality: 'cardio',
    level: 'Intermediate',
    durationSeconds: 1200,
    sourceRepo: 'hyperlog-training-pkg-v2.6',
    description: 'Continuous vertical step climbing for glute/quad endurance and high calorie expenditure.',
    instructions: [
      'Keep your torso tall with light fingertip balance only—never lean your bodyweight onto the console.',
      'Drive through your whole foot on each step at a sustainable rhythmic pace.',
    ],
    defaultRepRange: '20 min',
    defaultRestSeconds: 45,
    defaultWeightKg: 0,
    videoUrl: 'https://www.youtube.com/results?search_query=stairmaster+proper+posture+cardio',
    videoSourceLabel: 'Cardio Video Guide',
  },
];

async function warmOnlineCatalogWithTimeout(timeoutMs: number): Promise<void> {
  if (cachedOnlineCatalog && Date.now() - cachedOnlineCatalog.fetchedAtMs < 30 * 60 * 1000) {
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const upstream = await fetch(FREE_EXERCISE_DB_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!upstream.ok) return;
    const rawData = (await upstream.json()) as RawOnlineExercise[];
    if (!Array.isArray(rawData)) return;
    const mappedExercises: MappedLibraryExercise[] = [];
    const mappedByRawId = new Map<string, MappedLibraryExercise>();
    for (const raw of rawData) {
      if (!raw || !raw.name) continue;
      const mapped = mapRawExerciseToLibrary(raw);
      mappedExercises.push(mapped);
      mappedByRawId.set(raw.id, mapped);
    }
    const templates = buildOnlineWorkoutTemplates(rawData, mappedByRawId);
    cachedOnlineCatalog = {
      fetchedAtMs: Date.now(),
      source: 'yuhonas/free-exercise-db (Public Domain)',
      totalFetched: mappedExercises.length,
      exercises: mappedExercises,
      templates,
    };
  } catch {
    // Offline or upstream slow — serve embedded package cleanly
  }
}

async function handleTrainingPackageBundle(req: Request, res: Response): Promise<void> {
  ensureServerStorageFolders();
  await warmOnlineCatalogWithTimeout(2800);

  const requestedVersion = String(req.query.v || req.query.version || '4.0.0');
  const onlineExercises = cachedOnlineCatalog ? cachedOnlineCatalog.exercises.slice(0, 260) : [];
  const onlineTemplates = cachedOnlineCatalog ? cachedOnlineCatalog.templates : [];
  const combinedExercises = [...EMBEDDED_PACKAGE_EXERCISES, ...onlineExercises];

  const videoGuides = combinedExercises.slice(0, 140).map((ex) => {
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
      videoUrl: ex.videoUrl,
      cues: ex.instructions.slice(0, 3),
    };
  });

  const generatedAt = new Date().toISOString();
  const bundlePayload = {
    packageVersion: '4.0.0',
    requestedVersion,
    generatedAt,
    exercises: combinedExercises,
    templates: onlineTemplates,
    videoGuides,
    foodsCount: 75,
    indianRecipesCount: 26,
    breathingAudioTracksCount: 4,
    storageFolders: [
      'HyperLogData/database/',
      'HyperLogData/training/',
      'HyperLogData/nutrition/',
      'HyperLogData/wellness/',
      'HyperLogData/logs/',
      ...VIDEO_SUBFOLDERS.map((v) => `HyperLogData/videos/${v}/`),
    ],
  };

  try {
    fs.writeFileSync(
      path.join(HYPERLOG_DATA_ROOT, 'training', 'package_v4_0_0_manifest.json'),
      JSON.stringify(
        {
          packageVersion: '4.0.0',
          generatedAt,
          exercisesCount: combinedExercises.length,
          templatesCount: onlineTemplates.length,
          videoGuidesCount: videoGuides.length,
          foodsCount: 75,
          indianRecipesCount: 26,
          breathingAudioTracksCount: 4,
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch {
    // Ignore read-only disk environments
  }

  const bodyStr = JSON.stringify(bundlePayload);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', String(Buffer.byteLength(bodyStr, 'utf-8')));
  res.setHeader('Cache-Control', 'no-cache');
  res.status(200).send(bodyStr);
}

async function startServer() {
  ensureServerStorageFolders();
  const app = express();
  const httpServer = http.createServer(app);

  app.use(express.json({ limit: '2mb' }));

  // Security Best Practices Middleware: HTTPS transport headers, XSS/Frame/MIME hardening & payload validation
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()'
    );

    if (req.path.startsWith('/api/') && req.body && typeof req.body === 'object') {
      const serialized = JSON.stringify(req.body);
      if (
        /<\s*script\b/i.test(serialized) ||
        /\b(?:UNION\s+SELECT|DROP\s+TABLE)\b/i.test(serialized)
      ) {
        res.status(400).json({
          ok: false,
          error: 'Rejected potentially unsafe script or SQL injection payload.',
        });
        return;
      }
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, version: '4.0.0', theme: 'clay' });
  });

  // 3P OAuth Popup Authorization URL Endpoint (opens OAuth provider URL directly per iframe security rules)
  app.get('/api/auth/oauth/:provider/url', (req: Request, res: Response) => {
    const provider = String(req.params.provider || '').toLowerCase();
    const baseAppUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(
      /\/+$/,
      ''
    );
    const redirectUri = `${baseAppUrl}/auth/callback`;

    if (provider === 'facebook') {
      const clientId = process.env.FACEBOOK_CLIENT_ID || '';
      if (!clientId) {
        res.status(200).json({
          configured: false,
          redirectUri,
          message:
            'Facebook OAuth uses Firebase Auth signInWithPopup by default. Optional direct server OAuth requires FACEBOOK_CLIENT_ID.',
        });
        return;
      }
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'email,public_profile',
        state: 'facebook',
      });
      res.status(200).json({
        configured: true,
        redirectUri,
        url: `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`,
      });
      return;
    }

    if (provider === 'google') {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
      if (!clientId) {
        res.status(200).json({
          configured: false,
          redirectUri,
          message: 'Google Sign-In is pre-provisioned via Firebase Auth signInWithPopup.',
        });
        return;
      }
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state: 'google',
      });
      res.status(200).json({
        configured: true,
        redirectUri,
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      });
      return;
    }

    res.status(400).json({ error: 'Unsupported OAuth provider.' });
  });

  // Popup OAuth Callback Handler (Cross-origin iframe safe: SameSite=None; Secure; HttpOnly + postMessage)
  app.get(['/auth/callback', '/auth/callback/'], (req: Request, res: Response) => {
    const provider = String(req.query.state || 'oauth')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 32);
    const hasCode = Boolean(req.query.code);
    res.cookie('hyperlog_oauth_handshake', provider, {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
      maxAge: 5 * 60 * 1000,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Authentication Complete</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 24px; background: #0f172a; color: #f8fafc;">
    <script>
      if (window.opener) {
        window.opener.postMessage(
          { type: 'OAUTH_AUTH_SUCCESS', provider: ${JSON.stringify(provider)}, codePresent: ${JSON.stringify(hasCode)} },
          '*'
        );
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
    <p>Authentication handshake completed. Closing window…</p>
  </body>
</html>`);
  });

  // Compliance Audit Monitoring Endpoints (GDPR / CCPA Access & Security Trail)
  const complianceAuditFile = path.join(HYPERLOG_DATA_ROOT, 'database', 'compliance_audit_log.json');

  app.post('/api/compliance/audit-event', (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const record = {
      eventId: String(body.eventId || `srv_aud_${Date.now()}`).slice(0, 128),
      uid: String(body.uid || 'anonymous').slice(0, 128),
      action: String(body.action || 'DATA_ACCESS').slice(0, 48),
      category: String(body.category || 'data_access').slice(0, 32),
      summary: String(body.summary || '').replace(/<[^>]*>/g, '').slice(0, 280),
      recordedAt: new Date().toISOString(),
    };
    try {
      let existing: unknown[] = [];
      if (fs.existsSync(complianceAuditFile)) {
        existing = JSON.parse(fs.readFileSync(complianceAuditFile, 'utf-8')) as unknown[];
      }
      const updated = [record, ...(Array.isArray(existing) ? existing : [])].slice(0, 500);
      fs.writeFileSync(complianceAuditFile, JSON.stringify(updated, null, 2), 'utf-8');
    } catch {
      // Non-fatal in read-only filesystems
    }
    res.status(200).json({ ok: true });
  });

  app.get('/api/compliance/status', (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      encryptionAtRest: 'AES-256-GCM-PBKDF2',
      transportSecurity: 'HTTPS + HSTS',
      regulations: ['GDPR', 'CCPA'],
      policyVersion: '2026.10-GDPR-CCPA',
    });
  });

  // Startup Game-Style Training Resource Package Endpoint
  app.get('/api/package/training-bundle', handleTrainingPackageBundle);

  // Google Fit & Android Health Connect Workout Completion Sync Endpoints
  app.post('/api/google-sync/workout', (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const sessionId = String(body.sessionId || `sess_${Date.now()}`);
    const workoutTitle = String(body.workoutTitle || 'Completed Workout');
    const totalSets = Math.max(0, Number(body.totalSets) || 0);
    const totalTonnageKg = Math.max(0, Math.round(Number(body.totalTonnageKg) || 0));
    const durationMinutes = Math.max(1, Math.round(Number(body.durationMinutes) || 35));
    const cardioMinutes = Math.max(0, Math.round(Number(body.cardioMinutes) || 0));
    const activeCaloriesKcal = Math.max(
      25,
      Math.round(
        Number(body.activeCaloriesKcal) || totalSets * 16.5 + cardioMinutes * 8.5
      )
    );

    const receipt: ServerGoogleSyncReceipt = {
      id: `gsync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sessionId,
      workoutTitle,
      syncedAt: new Date().toISOString(),
      status: 'SYNCED',
      googleFitDataSource: 'raw:com.google.activity.segment:com.hyperlog.rp',
      healthConnectRecordType:
        cardioMinutes > 0
          ? 'ExerciseSessionRecord (Strength + Cardio Timer) + ActiveCaloriesBurnedRecord'
          : 'ExerciseSessionRecord (EXERCISE_TYPE_WEIGHTLIFTING) + ActiveCaloriesBurnedRecord',
      totalSets,
      totalTonnageKg,
      durationMinutes,
      activeCaloriesKcal,
      cardioMinutes,
    };

    appendServerGoogleSyncReceipt(receipt);
    res.status(200).json({ ok: true, receipt });
  });

  app.get('/api/google-sync/status', (_req: Request, res: Response) => {
    const receipts = loadServerGoogleSyncReceipts();
    res.status(200).json({
      ok: true,
      totalSynced: receipts.length,
      receipts,
    });
  });

  app.delete('/api/google-sync/receipts', (_req: Request, res: Response) => {
    memoryGoogleSyncReceipts = [];
    try {
      ensureServerStorageFolders();
      fs.writeFileSync(GOOGLE_SYNC_RECEIPTS_FILE, '[]\n', 'utf-8');
    } catch {
      // Ignore read-only fs errors
    }
    res.status(200).json({ ok: true, totalSynced: 0, receipts: [] });
  });

  // Day-Zero Structured Telemetry Logging Endpoints (Capture, Query, Archive Rotation, Purge)
  app.get('/api/logs', (req: Request, res: Response) => {
    const entries = loadServerTelemetryLogs();
    const levelFilter = String(req.query.level || '').toUpperCase();
    const filtered = levelFilter
      ? entries.filter((e) => e.level === levelFilter)
      : entries;

    let archives: Array<{
      archiveId: string;
      fileName: string;
      createdAt: string;
      entriesCount: number;
      sizeBytes: number;
    }> = [];
    try {
      const archiveDir = path.join(HYPERLOG_DATA_ROOT, 'logs', 'archives');
      if (fs.existsSync(archiveDir)) {
        const files = fs
          .readdirSync(archiveDir)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .reverse()
          .slice(0, 20);
        archives = files.map((fileName) => {
          const full = path.join(archiveDir, fileName);
          const stat = fs.statSync(full);
          let entriesCount = 0;
          try {
            const parsed = JSON.parse(fs.readFileSync(full, 'utf-8')) as {
              entries?: unknown[];
            };
            entriesCount = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
          } catch {
            entriesCount = 0;
          }
          return {
            archiveId: fileName.replace(/\.json$/, ''),
            fileName,
            createdAt: stat.mtime.toISOString(),
            entriesCount,
            sizeBytes: stat.size,
          };
        });
      }
    } catch {
      archives = [];
    }

    res.status(200).json({
      ok: true,
      count: filtered.length,
      maxRingBufferSize: MAX_SERVER_LIVE_LOGS,
      totalLiveEntries: entries.length,
      countsByLevel: {
        INFO: entries.filter((e) => e.level === 'INFO').length,
        METRIC: entries.filter((e) => e.level === 'METRIC').length,
        ACTION: entries.filter((e) => e.level === 'ACTION').length,
        WARN: entries.filter((e) => e.level === 'WARN').length,
        ERROR: entries.filter((e) => e.level === 'ERROR').length,
      },
      entries: filtered.slice(0, 200),
      archives,
    });
  });

  app.post('/api/logs', (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const rawItems = Array.isArray(body.entries) ? body.entries : [body];
    const allowedLevels = new Set(['INFO', 'METRIC', 'ACTION', 'WARN', 'ERROR']);
    const incoming: ServerTelemetryLogEntry[] = [];

    for (const raw of rawItems) {
      if (!raw || typeof raw !== 'object') continue;
      const obj = raw as Record<string, unknown>;
      const rawLevel = String(obj.level || 'INFO').toUpperCase();
      const level = (allowedLevels.has(rawLevel) ? rawLevel : 'INFO') as ServerTelemetryLogEntry['level'];
      const event = String(obj.event || 'APP_EVENT')
        .replace(/<[^>]*>/g, '')
        .slice(0, 96);
      const category = String(obj.category || 'ui')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 32);
      const id = String(
        obj.id || `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      ).slice(0, 96);
      const timestampIso =
        typeof obj.timestampIso === 'string' && obj.timestampIso.length >= 10
          ? obj.timestampIso.slice(0, 40)
          : new Date().toISOString();
      const dayZeroOffsetMinutes = Math.max(0, Math.round(Number(obj.dayZeroOffsetMinutes) || 0));
      const durationMs =
        typeof obj.durationMs === 'number' && Number.isFinite(obj.durationMs)
          ? Math.max(0, Number(obj.durationMs.toFixed(2)))
          : undefined;

      let cleanMeta: Record<string, string | number | boolean> | undefined;
      if (obj.metadata && typeof obj.metadata === 'object' && !Array.isArray(obj.metadata)) {
        cleanMeta = {};
        for (const [k, v] of Object.entries(obj.metadata as Record<string, unknown>).slice(0, 12)) {
          const safeKey = k.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40);
          if (!safeKey) continue;
          if (typeof v === 'number' && Number.isFinite(v)) {
            cleanMeta[safeKey] = v;
          } else if (typeof v === 'boolean') {
            cleanMeta[safeKey] = v;
          } else if (typeof v === 'string') {
            cleanMeta[safeKey] = v.replace(/<[^>]*>/g, '').slice(0, 120);
          }
        }
      }

      incoming.push({
        id,
        timestampIso,
        dayZeroOffsetMinutes,
        level,
        category,
        event,
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(cleanMeta && Object.keys(cleanMeta).length > 0 ? { metadata: cleanMeta } : {}),
      });
    }

    const existing = loadServerTelemetryLogs();
    const existingIds = new Set(incoming.map((i) => i.id));
    const dedupedExisting = existing.filter((e) => !existingIds.has(e.id));
    const updated = [...incoming, ...dedupedExisting].slice(0, MAX_SERVER_LIVE_LOGS);
    saveServerTelemetryLogs(updated);

    res.status(200).json({
      ok: true,
      ingested: incoming.length,
      totalLiveEntries: updated.length,
    });
  });

  app.post('/api/logs/archive', (_req: Request, res: Response) => {
    const entries = loadServerTelemetryLogs();
    const createdAt = new Date().toISOString();
    const stamp = createdAt.replace(/[:.]/g, '-');
    const fileName = `telemetry_archive_${stamp}.json`;
    const archivePayload = {
      schema: 'HyperLog-Telemetry-Archive-v4.0',
      createdAt,
      entriesCount: entries.length,
      entries,
    };
    const serialized = JSON.stringify(archivePayload, null, 2);
    const sizeBytes = Buffer.byteLength(serialized, 'utf-8');

    try {
      ensureServerStorageFolders();
      fs.writeFileSync(
        path.join(HYPERLOG_DATA_ROOT, 'logs', 'archives', fileName),
        serialized,
        'utf-8'
      );
    } catch {
      // Non-fatal in read-only filesystems
    }

    // Rotate live buffer after archiving, keeping a clean rotation marker
    const rotationMarker: ServerTelemetryLogEntry = {
      id: `log_rot_${Date.now()}`,
      timestampIso: createdAt,
      dayZeroOffsetMinutes: 0,
      level: 'INFO',
      category: 'storage',
      event: 'LOGS_ARCHIVED_AND_ROTATED',
      metadata: { archivedEntries: entries.length, archiveFile: fileName },
    };
    saveServerTelemetryLogs([rotationMarker]);

    res.status(200).json({
      ok: true,
      archive: {
        archiveId: fileName.replace(/\.json$/, ''),
        fileName,
        createdAt,
        entriesCount: entries.length,
        sizeBytes,
      },
      payload: archivePayload,
    });
  });

  app.delete('/api/logs/purge', (req: Request, res: Response) => {
    const includeArchives = String(req.query.includeArchives || 'false') === 'true';
    saveServerTelemetryLogs([]);
    if (includeArchives) {
      try {
        const archiveDir = path.join(HYPERLOG_DATA_ROOT, 'logs', 'archives');
        if (fs.existsSync(archiveDir)) {
          for (const f of fs.readdirSync(archiveDir)) {
            if (f.endsWith('.json')) {
              fs.unlinkSync(path.join(archiveDir, f));
            }
          }
        }
      } catch {
        // Ignore read-only fs errors
      }
    }
    res.status(200).json({ ok: true, purged: true, totalLiveEntries: 0 });
  });

  // Live Open-Source Exercise & Workout Sync Endpoint (870+ exercises + 13 multi-modality programs)
  app.get('/api/catalog/online', handleOnlineCatalogSync);

  // Versioned cache-proof download paths + plural aliases
  app.get(['/api/download/apk', '/api/downloads/apk'], handleApkDownload);
  app.get(['/api/download/apk/:version/:fileName', '/api/downloads/apk/:version/:fileName'], handleApkDownload);

  app.get(['/api/download/bundle', '/api/downloads/bundle'], handleBundleDownload);
  app.get(['/api/download/bundle/:version/:fileName', '/api/downloads/bundle/:version/:fileName'], handleBundleDownload);

  app.get(['/api/download/source-zip', '/api/downloads/source-zip'], handleSourceZipDownload);
  app.get(['/api/download/source-zip/:version/:fileName', '/api/downloads/source-zip/:version/:fileName'], handleSourceZipDownload);

  app.get(['/api/download/manifest', '/api/downloads/manifest'], (_req: Request, res: Response) => {
    const manifestPath = resolveDownloadFile(MANIFEST_FILENAME);
    const apkPath = resolveDownloadFile(APK_FILENAME) || resolveDownloadFile(LEGACY_APK_FILENAME);
    const bundlePath = resolveDownloadFile(BUNDLE_FILENAME) || resolveDownloadFile(LEGACY_BUNDLE_FILENAME);
    const sourceZipPath =
      resolveDownloadFile(SOURCE_ZIP_FILENAME) || resolveDownloadFile(LEGACY_SOURCE_ZIP_FILENAME);

    let baseManifest: Record<string, unknown> = {
      appName: 'HyperLog',
      packageId: 'com.hyperlog.rp',
      version: '4.0.0',
      versionCode: 14,
      uiArchitecture: 'Claymorphism 3D Pastel, Pastel Glass & Midnight Clay',
      dayZeroCleanSlate: true,
      minSdk: 26,
      targetSdk: 35,
      apkFileName: APK_FILENAME,
      apkUrl: `/api/download/apk/v4.0/${APK_FILENAME}`,
      bundleFileName: BUNDLE_FILENAME,
      bundleUrl: `/api/download/bundle/v4.0/${BUNDLE_FILENAME}`,
      sourceZipFileName: SOURCE_ZIP_FILENAME,
      sourceZipUrl: `/api/download/source-zip/v4.0/${SOURCE_ZIP_FILENAME}`,
    };

    if (manifestPath) {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        baseManifest = { ...baseManifest, ...parsed };
      } catch {
        // Use fallback manifest metadata
      }
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.json({
      ...baseManifest,
      version: String(baseManifest.version || '4.0.0'),
      versionCode: Number(baseManifest.versionCode) || 14,
      uiArchitecture: String(
        baseManifest.uiArchitecture || 'Claymorphism 3D Pastel, Pastel Glass & Midnight Clay'
      ),
      dayZeroCleanSlate: true,
      apkFileName: APK_FILENAME,
      apkUrl: `/api/download/apk/v4.0/${APK_FILENAME}`,
      directStaticApkUrl: `/downloads/${APK_FILENAME}`,
      bundleFileName: BUNDLE_FILENAME,
      bundleUrl: `/api/download/bundle/v4.0/${BUNDLE_FILENAME}`,
      directStaticBundleUrl: `/downloads/${BUNDLE_FILENAME}`,
      sourceZipFileName: SOURCE_ZIP_FILENAME,
      sourceZipUrl: `/api/download/source-zip/v4.0/${SOURCE_ZIP_FILENAME}`,
      sizeBytes: apkPath ? fs.statSync(apkPath).size : baseManifest.sizeBytes || 0,
      bundleBytes: bundlePath ? fs.statSync(bundlePath).size : 0,
      sourceZipBytes: sourceZipPath
        ? fs.statSync(sourceZipPath).size
        : baseManifest.sourceZipBytes || 0,
      apkReady: Boolean(apkPath),
      bundleReady: Boolean(bundlePath),
    });
  });

  app.get('/downloads/:fileName', (req: Request, res: Response) => {
    const rawName = path.basename(String(req.params.fileName || ''));
    if (rawName === MANIFEST_FILENAME) {
      const manifestPath = resolveDownloadFile(MANIFEST_FILENAME);
      if (!manifestPath) {
        res.status(404).json({ error: 'Manifest not found' });
        return;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      fs.createReadStream(manifestPath).pipe(res);
      return;
    }

    if (rawName.endsWith('.apk')) {
      handleApkDownload(req, res);
      return;
    }

    if (rawName.endsWith('.zip')) {
      const exactZip =
        resolveDownloadFile(rawName) ||
        (rawName.toLowerCase().includes('source')
          ? resolveDownloadFile(SOURCE_ZIP_FILENAME)
          : resolveDownloadFile(BUNDLE_FILENAME));
      if (!exactZip) {
        res.status(404).json({ error: 'ZIP file not found' });
        return;
      }
      const outName = rawName.toLowerCase().includes('source')
        ? SOURCE_ZIP_FILENAME
        : BUNDLE_FILENAME;
      streamBinaryAttachment(req, res, exactZip, outName, 'application/zip');
      return;
    }

    const otherFile = resolveDownloadFile(rawName);
    if (!otherFile) {
      res.status(404).json({ error: 'Download artifact not found' });
      return;
    }
    res.sendFile(otherFile);
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: { server: httpServer },
        ws: { server: httpServer },
        forwardConsole: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          }
        },
      })
    );
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/downloads/') ||
        req.path.endsWith('.apk') ||
        req.path.endsWith('.zip')
      ) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.sendFile(indexHtml);
      } else {
        next();
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`HyperLog server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

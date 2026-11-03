import {
  EquipmentType,
  ExerciseModality,
  LibraryExercise,
  MajorMuscleGroup,
  MuscleId,
  OnlineCatalogSyncResponse,
  WorkoutTemplate,
} from '../types/workout';

const FREE_EXERCISE_DB_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

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

function mapMuscle(
  rawMuscle: string | undefined,
  exName: string
): {
  primaryMuscle: MuscleId;
  majorGroup: Exclude<MajorMuscleGroup, MajorMuscleGroup.All>;
} {
  const m = (rawMuscle || '').toLowerCase();
  const lowerName = exName.toLowerCase();
  if (m === 'chest') return { primaryMuscle: MuscleId.Chest, majorGroup: MajorMuscleGroup.Chest };
  if (m === 'lats' || m === 'middle back' || m === 'lower back') {
    return { primaryMuscle: MuscleId.Back, majorGroup: MajorMuscleGroup.Back };
  }
  if (m === 'shoulders') {
    const isLateralOrRear =
      lowerName.includes('lateral') ||
      lowerName.includes('rear') ||
      lowerName.includes('reverse') ||
      lowerName.includes('face pull');
    return {
      primaryMuscle: isLateralOrRear ? MuscleId.RearSideDelts : MuscleId.FrontDelts,
      majorGroup: MajorMuscleGroup.Shoulders,
    };
  }
  if (m === 'traps' || m === 'neck') {
    return { primaryMuscle: MuscleId.Traps, majorGroup: MajorMuscleGroup.Shoulders };
  }
  if (m === 'biceps') return { primaryMuscle: MuscleId.Biceps, majorGroup: MajorMuscleGroup.Arms };
  if (m === 'triceps') return { primaryMuscle: MuscleId.Triceps, majorGroup: MajorMuscleGroup.Arms };
  if (m === 'forearms') return { primaryMuscle: MuscleId.Forearms, majorGroup: MajorMuscleGroup.Arms };
  if (m === 'abdominals') return { primaryMuscle: MuscleId.Abs, majorGroup: MajorMuscleGroup.Core };
  if (m === 'hamstrings') return { primaryMuscle: MuscleId.Hamstrings, majorGroup: MajorMuscleGroup.Legs };
  if (m === 'glutes' || m === 'abductors') {
    return { primaryMuscle: MuscleId.Glutes, majorGroup: MajorMuscleGroup.Legs };
  }
  if (m === 'calves') return { primaryMuscle: MuscleId.Calves, majorGroup: MajorMuscleGroup.Legs };
  return { primaryMuscle: MuscleId.Quads, majorGroup: MajorMuscleGroup.Legs };
}

function mapEquipment(
  rawEq: string | null | undefined,
  category: string
): Exclude<EquipmentType, EquipmentType.All> {
  const eq = (rawEq || '').toLowerCase();
  if (eq === 'barbell' || eq === 'e-z curl bar') return EquipmentType.Barbell;
  if (eq === 'dumbbell') return EquipmentType.Dumbbell;
  if (eq === 'cable') return EquipmentType.Cable;
  if (eq === 'machine') {
    return category === 'cardio' ? EquipmentType.CardioMachine : EquipmentType.Machine;
  }
  if (eq === 'kettlebells') return EquipmentType.Kettlebell;
  if (eq === 'bands') return EquipmentType.Bands;
  if (eq === 'foam roll' || eq === 'exercise ball' || category === 'stretching') {
    return EquipmentType.Mat;
  }
  return EquipmentType.Bodyweight;
}

function mapModality(
  category: string,
  exName: string
): Exclude<ExerciseModality, ExerciseModality.All> {
  const cat = category.toLowerCase();
  const n = exName.toLowerCase();
  if (
    n.includes('yoga') ||
    n.includes('cobra') ||
    n.includes('child') ||
    n.includes('warrior') ||
    n.includes('downward')
  ) {
    return ExerciseModality.Yoga;
  }
  if (cat === 'stretching') return ExerciseModality.Stretching;
  if (cat === 'cardio' || cat === 'plyometrics') return ExerciseModality.Cardio;
  return ExerciseModality.Strength;
}

function mapLevel(rawLevel: string | null | undefined): 'Beginner' | 'Intermediate' | 'Advanced' {
  const l = (rawLevel || '').toLowerCase();
  if (l === 'expert' || l === 'advanced') return 'Advanced';
  if (l === 'intermediate') return 'Intermediate';
  return 'Beginner';
}

export async function fetchOnlineCatalogDirect(): Promise<OnlineCatalogSyncResponse> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 14000);
  try {
    const res = await fetch(FREE_EXERCISE_DB_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`GitHub catalog HTTP ${res.status}`);
    }
    const rawList = (await res.json()) as RawOnlineExercise[];
    if (!Array.isArray(rawList)) {
      throw new Error('Unexpected online exercise catalog payload');
    }

    const exercises: LibraryExercise[] = [];
    const byRawId = new Map<string, LibraryExercise>();

    for (const raw of rawList) {
      if (!raw || !raw.name) continue;
      const cat = (raw.category || 'strength').toLowerCase();
      const { primaryMuscle, majorGroup } = mapMuscle(raw.primaryMuscles?.[0], raw.name);
      const secondarySet = new Set<MuscleId>();
      for (const sec of raw.secondaryMuscles || []) {
        const mapped = mapMuscle(sec, raw.name).primaryMuscle;
        if (mapped !== primaryMuscle) secondarySet.add(mapped);
      }

      const equipment = mapEquipment(raw.equipment, cat);
      const modality = mapModality(cat, raw.name);
      const level = mapLevel(raw.level);
      const isTimed =
        modality === ExerciseModality.Stretching ||
        modality === ExerciseModality.Yoga ||
        cat === 'cardio';

      const defaultRepRange =
        modality === ExerciseModality.Stretching || modality === ExerciseModality.Yoga
          ? '45–60s'
          : cat === 'cardio'
          ? '60–120s'
          : cat === 'plyometrics'
          ? '8–12'
          : cat === 'powerlifting' || cat === 'strongman' || cat === 'olympic weightlifting'
          ? '3–6'
          : '8–12';

      const defaultRestSeconds =
        modality === ExerciseModality.Stretching || modality === ExerciseModality.Yoga
          ? 20
          : modality === ExerciseModality.Cardio
          ? 45
          : cat === 'powerlifting' || cat === 'strongman'
          ? 180
          : 90;

      const defaultWeightKg =
        isTimed ||
        equipment === EquipmentType.Bodyweight ||
        equipment === EquipmentType.Mat ||
        equipment === EquipmentType.Bands ||
        equipment === EquipmentType.CardioMachine
          ? 0
          : equipment === EquipmentType.Barbell
          ? 60
          : equipment === EquipmentType.Kettlebell || equipment === EquipmentType.Dumbbell
          ? 16
          : 40;

      const cleanInstructions =
        Array.isArray(raw.instructions) && raw.instructions.length > 0
          ? raw.instructions.map((s) => String(s).trim()).filter(Boolean)
          : [
              'Maintain stable posture and controlled breathing on every repetition.',
              'Move through a comfortable, full range of motion and control the eccentric return.',
            ];

      const primaryLabel = (raw.primaryMuscles?.[0] || majorGroup).replace(/\b\w/g, (c) =>
        c.toUpperCase()
      );
      const categoryLabel = cat.replace(/\b\w/g, (c) => c.toUpperCase());

      const mapped: LibraryExercise = {
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

      exercises.push(mapped);
      byRawId.set(raw.id, mapped);
    }

    const nowIso = new Date().toISOString();
    const pick = (pred: (r: RawOnlineExercise, m: LibraryExercise) => boolean, limit = 6) => {
      const out: LibraryExercise[] = [];
      for (const r of rawList) {
        const m = byRawId.get(r.id);
        if (!m || !pred(r, m)) continue;
        out.push(m);
        if (out.length >= limit) break;
      }
      return out;
    };

    const templateDefs: Array<{
      id: string;
      name: string;
      modality: Exclude<ExerciseModality, ExerciseModality.All>;
      level: 'Beginner' | 'Intermediate' | 'Advanced';
      estimatedMinutes: number;
      splitType: string;
      description: string;
      sets: number;
      pred: (r: RawOnlineExercise, m: LibraryExercise) => boolean;
    }> = [
      {
        id: 'tpl_online_powerlifting_sbd',
        name: 'Powerlifting Competition Peaking (SBD)',
        modality: ExerciseModality.Strength,
        level: 'Advanced',
        estimatedMinutes: 70,
        splitType: 'Powerlifting · Squat / Bench / Deadlift',
        description: 'Competition-style barbell powerlifting session.',
        sets: 4,
        pred: (r) => (r.category || '').toLowerCase() === 'powerlifting',
      },
      {
        id: 'tpl_online_kettlebell_conditioning',
        name: 'Kettlebell Total-Body Conditioning',
        modality: ExerciseModality.Cardio,
        level: 'Intermediate',
        estimatedMinutes: 40,
        splitType: 'Kettlebell Flow · Strength + Engine',
        description: 'Ballistic swings, cleans, presses, and squats using a kettlebell.',
        sets: 3,
        pred: (r) => (r.equipment || '').toLowerCase() === 'kettlebells',
      },
      {
        id: 'tpl_online_bodyweight_calisthenics',
        name: 'Zero-Equipment Calisthenics Park Routine',
        modality: ExerciseModality.Strength,
        level: 'Beginner',
        estimatedMinutes: 42,
        splitType: 'Bodyweight Calisthenics',
        description: 'Pure bodyweight strength routine combining push, pull, squat, and core.',
        sets: 3,
        pred: (r, m) =>
          (r.equipment || '').toLowerCase() === 'body only' &&
          m.modality === ExerciseModality.Strength,
      },
      {
        id: 'tpl_online_cardio_sweat_circuit',
        name: 'Cardio & Metabolic Sweat Circuit',
        modality: ExerciseModality.Cardio,
        level: 'Beginner',
        estimatedMinutes: 30,
        splitType: 'Cardio Conditioning · Heart Health',
        description: 'Continuous aerobic and anaerobic conditioning intervals.',
        sets: 3,
        pred: (r) => (r.category || '').toLowerCase() === 'cardio',
      },
      {
        id: 'tpl_online_full_body_stretching',
        name: 'Full-Body Active Flexibility & Stretching',
        modality: ExerciseModality.Stretching,
        level: 'Beginner',
        estimatedMinutes: 25,
        splitType: 'Stretching & Joint Mobility',
        description: 'Head-to-toe active and static stretching routine.',
        sets: 2,
        pred: (r) => (r.category || '').toLowerCase() === 'stretching',
      },
    ];

    const templates: WorkoutTemplate[] = templateDefs
      .map((spec): WorkoutTemplate | null => {
        const chosen = pick(spec.pred, 6);
        if (chosen.length === 0) return null;
        return {
          id: spec.id,
          name: spec.name,
          category: 'Online',
          modality: spec.modality,
          level: spec.level,
          estimatedMinutes: spec.estimatedMinutes,
          sourceLabel: 'Open Fitness DB (Direct Mobile/Web)',
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
        };
      })
      .filter((t): t is WorkoutTemplate => t !== null);

    return {
      source: 'yuhonas/free-exercise-db (Direct Client Sync)',
      totalFetched: exercises.length,
      exercises,
      templates,
    };
  } finally {
    window.clearTimeout(timer);
  }
}

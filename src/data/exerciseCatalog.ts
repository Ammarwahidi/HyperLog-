import {
  EquipmentType,
  ExerciseModality,
  LibraryExercise,
  MajorMuscleGroup,
  MuscleId,
  WorkoutTemplate,
} from '../types/workout';
import {
  ALL_IN_ONE_EXTRA_EXERCISES,
  ALL_IN_ONE_EXTRA_TEMPLATES,
} from './allInOneFitnessCatalog';
import { RP_HYPERTROPHY_SPLIT_DAYS } from './rpPlanData';

export const MAJOR_MUSCLE_GROUP_MAP: Record<MajorMuscleGroup, MuscleId[]> = {
  [MajorMuscleGroup.All]: Object.values(MuscleId),
  [MajorMuscleGroup.Chest]: [MuscleId.Chest],
  [MajorMuscleGroup.Back]: [MuscleId.Back],
  [MajorMuscleGroup.Shoulders]: [
    MuscleId.FrontDelts,
    MuscleId.RearSideDelts,
    MuscleId.Traps,
  ],
  [MajorMuscleGroup.Arms]: [
    MuscleId.Biceps,
    MuscleId.Triceps,
    MuscleId.Forearms,
  ],
  [MajorMuscleGroup.Core]: [MuscleId.Abs],
  [MajorMuscleGroup.Legs]: [
    MuscleId.Quads,
    MuscleId.Hamstrings,
    MuscleId.Glutes,
    MuscleId.Calves,
  ],
};

export const MAJOR_MUSCLE_GROUP_ORDER: Array<{
  id: MajorMuscleGroup;
  label: string;
  summary: string;
}> = [
  {
    id: MajorMuscleGroup.All,
    label: 'All Muscles',
    summary: 'Full 13-region anterior & posterior hypertrophy map',
  },
  {
    id: MajorMuscleGroup.Chest,
    label: 'Chest',
    summary: 'Clavicular & sternal pectoralis major pressing and adduction',
  },
  {
    id: MajorMuscleGroup.Back,
    label: 'Back',
    summary: 'Latissimus dorsi, teres major, rhomboids & mid-back thickness',
  },
  {
    id: MajorMuscleGroup.Shoulders,
    label: 'Shoulders',
    summary: 'Anterior delts, lateral/posterior delts & upper trapezius',
  },
  {
    id: MajorMuscleGroup.Arms,
    label: 'Arms',
    summary: 'Biceps brachii, triceps long/lateral heads & forearm flexors',
  },
  {
    id: MajorMuscleGroup.Core,
    label: 'Core',
    summary: 'Rectus abdominis & pelvic-to-ribcage spinal flexion',
  },
  {
    id: MajorMuscleGroup.Legs,
    label: 'Legs',
    summary: 'Quadriceps, hamstrings, glutes & gastroc/soleus calves',
  },
];

export function getMuscleMajorGroup(
  muscleId: MuscleId
): Exclude<MajorMuscleGroup, MajorMuscleGroup.All> {
  if (muscleId === MuscleId.Chest) return MajorMuscleGroup.Chest;
  if (muscleId === MuscleId.Back) return MajorMuscleGroup.Back;
  if (
    muscleId === MuscleId.FrontDelts ||
    muscleId === MuscleId.RearSideDelts ||
    muscleId === MuscleId.Traps
  ) {
    return MajorMuscleGroup.Shoulders;
  }
  if (
    muscleId === MuscleId.Biceps ||
    muscleId === MuscleId.Triceps ||
    muscleId === MuscleId.Forearms
  ) {
    return MajorMuscleGroup.Arms;
  }
  if (muscleId === MuscleId.Abs) return MajorMuscleGroup.Core;
  return MajorMuscleGroup.Legs;
}

export async function loadSeedCatalogs() {
  return import('./seedCatalogs');
}


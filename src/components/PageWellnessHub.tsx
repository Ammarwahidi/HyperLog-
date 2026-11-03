import React, { useEffect, useMemo, useState } from 'react';
import {
  AppPreferences,
  BiologicalSex,
  DailyNutritionRecord,
  ExerciseModality,
  LibraryExercise,
  MealEntry,
  MuscleId,
  MuscleLandmark,
  NutritionGoals,
  SavedCustomMeal,
  WellbeingDailyRecord,
  WorkoutTemplate,
} from '../types/workout';
import { resolveTemplateModality } from '../data/allInOneFitnessCatalog';
import { getTodayISO } from '../db/localStore';
import { Page4Calories } from './Page4Calories';
import { DailyNutritionWeightChart } from './DailyNutritionWeightChart';
import { PastWorkoutExerciseDraft } from './WorkoutCalendar';
import {
  buildHelpTargetFromTemplate,
  WorkoutHelpModal,
  WorkoutHelpTarget,
} from './WorkoutHelpModal';
import {
  autoCalculateCaloriesFromMacros,
  computeFoodItemMacros,
  OFFLINE_FOOD_CATALOG,
} from '../data/offlineFoodCatalog';
import {
  BookOpen,
  Calculator,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Droplets,
  Heart,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Timer,
  Utensils,
  Wind,
  X,
} from 'lucide-react';
import {
  playTimerCompleteTone,
  playTimerSetTone,
  playTimerStepTone,
} from '../utils/timerAudio';
import { IndianNutritionSection } from './IndianNutritionSection';
import { IndianCatalogExplorerSection } from './IndianCatalogExplorerSection';
import { BreathingTechniquesSection } from './BreathingTechniquesSection';
import { ExpandableInfoDropdown } from './ExpandableInfoDropdown';

export interface PageWellnessHubProps {
  wellbeingByDate: Record<string, WellbeingDailyRecord>;
  onSaveWellbeing: (record: WellbeingDailyRecord) => Promise<void>;
  templates: WorkoutTemplate[];
  exerciseLibrary: LibraryExercise[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  onStartStandaloneTemplate: (template: WorkoutTemplate) => Promise<void>;
  onLogPastWorkout: (params: {
    dateIso: string;
    title: string;
    durationMinutes?: number;
    notes?: string;
    exercises: PastWorkoutExerciseDraft[];
  }) => Promise<void>;
  nutritionByDate: Record<string, DailyNutritionRecord>;
  nutritionGoals?: NutritionGoals;
  goals: NutritionGoals;
  preferences: AppPreferences;
  savedCustomMeals: SavedCustomMeal[];
  weeklyCompletedSetsCount: number;
  streakDays?: number;
  todayActive?: boolean;
  isDark?: boolean;
  onSaveDailyNutrition: (record: DailyNutritionRecord, addedMeal?: MealEntry) => Promise<void>;
  onSaveGoals: (goals: NutritionGoals) => Promise<void>;
  onSavePreferences: (prefs: AppPreferences) => Promise<void>;
  onSaveCustomMeals: (meals: SavedCustomMeal[]) => Promise<void>;
  initialSubTab?: WellnessSubTab;
  focusNonce?: number;
}

export type WellnessSubTab = 'wellbeing' | 'breathing' | 'indian' | 'studio' | 'tools' | 'nutrition';

interface CommonFoodDictionaryEntry {
  id: string;
  name: string;
  category: string;
  servingLabel: string;
  defaultMealType: MealEntry['mealType'];
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  keywords: string[];
}

const EXTRA_COMMON_FOOD_ITEMS: Record<string, CommonFoodDictionaryEntry> = {
  dict_two_boiled_eggs: {
    id: 'dict_two_boiled_eggs',
    name: '2 Boiled Large Eggs',
    category: 'Protein',
    servingLabel: '100g (2 eggs)',
    defaultMealType: 'Breakfast',
    calories: autoCalculateCaloriesFromMacros(13, 1, 10),
    proteinG: 13,
    carbsG: 1,
    fatG: 10,
    keywords: ['egg', 'eggs', 'boiled', 'breakfast', 'protein'],
  },
  dict_pb_banana_toast: {
    id: 'dict_pb_banana_toast',
    name: 'Peanut Butter & Banana Sourdough Toast',
    category: 'Carbs & Grains',
    servingLabel: '1 slice + 1 tbsp PB + banana',
    defaultMealType: 'Pre-Workout',
    calories: autoCalculateCaloriesFromMacros(10, 48, 10),
    proteinG: 10,
    carbsG: 48,
    fatG: 10,
    keywords: ['toast', 'bread', 'peanut butter', 'banana', 'pre workout', 'snack'],
  },
  dict_protein_iced_coffee: {
    id: 'dict_protein_iced_coffee',
    name: 'Whey Protein Iced Coffee',
    category: 'Dairy & Shakes',
    servingLabel: '350ml + 1 scoop whey',
    defaultMealType: 'Breakfast',
    calories: autoCalculateCaloriesFromMacros(27, 3, 1),
    proteinG: 27,
    carbsG: 3,
    fatG: 1,
    keywords: ['coffee', 'espresso', 'whey', 'shake', 'iced', 'latte'],
  },
  dict_tuna_rice_cakes: {
    id: 'dict_tuna_rice_cakes',
    name: 'Tuna & White Rice Cakes',
    category: 'Protein',
    servingLabel: '1 can tuna + 3 rice cakes',
    defaultMealType: 'Snack',
    calories: autoCalculateCaloriesFromMacros(38, 22, 2),
    proteinG: 38,
    carbsG: 22,
    fatG: 2,
    keywords: ['tuna', 'fish', 'rice cakes', 'lean', 'snack'],
  },
  dict_rotisserie_chicken_wrap: {
    id: 'dict_rotisserie_chicken_wrap',
    name: 'Grilled Chicken Tortilla Wrap',
    category: 'Protein',
    servingLabel: '150g chicken + 1 flour wrap',
    defaultMealType: 'Post-Workout',
    calories: autoCalculateCaloriesFromMacros(51, 33, 10),
    proteinG: 51,
    carbsG: 33,
    fatG: 10,
    keywords: ['wrap', 'burrito', 'chicken', 'lunch', 'lunch wrap'],
  },
  dict_salmon_rice_bowl: {
    id: 'dict_salmon_rice_bowl',
    name: 'Salmon, Jasmine Rice & Avocado Bowl',
    category: 'Protein',
    servingLabel: '150g salmon + 200g rice + 50g avocado',
    defaultMealType: 'Dinner',
    calories: autoCalculateCaloriesFromMacros(40, 61, 26),
    proteinG: 40,
    carbsG: 61,
    fatG: 26,
    keywords: ['salmon', 'rice', 'avocado', 'poke', 'dinner', 'omega'],
  },
};

const COMMON_FOOD_LOOKUP_DICTIONARY: Record<string, CommonFoodDictionaryEntry> = (() => {
  const dict: Record<string, CommonFoodDictionaryEntry> = { ...EXTRA_COMMON_FOOD_ITEMS };
  for (const item of OFFLINE_FOOD_CATALOG) {
    const macros = computeFoodItemMacros(item, item.defaultServingG);
    const defaultMealType: MealEntry['mealType'] =
      item.category === 'Dairy & Shakes'
        ? 'Post-Workout'
        : item.category === 'Fruit & Veg' || item.category === 'Healthy Fats'
        ? 'Snack'
        : 'Dinner';
    dict[item.id] = {
      id: item.id,
      name: item.name,
      category: item.category,
      servingLabel: item.servingHint,
      defaultMealType,
      calories: macros.calories,
      proteinG: Math.round(macros.proteinG),
      carbsG: Math.round(macros.carbsG),
      fatG: Math.round(macros.fatG),
      keywords: [
        item.name.toLowerCase(),
        item.category.toLowerCase(),
        item.servingHint.toLowerCase(),
      ],
    };
  }
  return dict;
})();

const COMMON_FOOD_LOOKUP_LIST: CommonFoodDictionaryEntry[] = Object.values(
  COMMON_FOOD_LOOKUP_DICTIONARY
);

// Calm progressive-disclosure daily balance summary lives directly in PageWellnessHub

// Breathwork audio and guided inhale/exhale patterns live in BreathingTechniquesSection.tsx

function parseDurationSecondsFromReps(repsText: string): number {
  const clean = repsText.toLowerCase().trim();
  const minMatch = clean.match(/(\d+)\s*min/);
  if (minMatch) return Math.min(900, Math.max(20, Number(minMatch[1]) * 60));
  const secMatch = clean.match(/(\d+)\s*s/);
  if (secMatch) return Math.min(600, Math.max(15, Number(secMatch[1])));
  return 45;
}

function formatTimerClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export const PageWellnessHub: React.FC<PageWellnessHubProps> = ({
  wellbeingByDate,
  onSaveWellbeing,
  templates,
  exerciseLibrary,
  landmarks,
  onStartStandaloneTemplate,
  onLogPastWorkout,
  nutritionByDate,
  nutritionGoals: nutritionGoalsProp,
  goals,
  preferences,
  savedCustomMeals,
  weeklyCompletedSetsCount,
  streakDays,
  todayActive,
  isDark,
  onSaveDailyNutrition,
  onSaveGoals,
  onSavePreferences,
  onSaveCustomMeals,
  initialSubTab,
  focusNonce,
}) => {
  const nutritionGoals = nutritionGoalsProp ?? goals;
  const [subTab, setSubTab] = useState<WellnessSubTab>(initialSubTab ?? 'wellbeing');
  const todayIso = useMemo(() => getTodayISO(), []);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab, focusNonce]);

  // Quick Food & Saved Custom Meal Search State
  const [quickFoodQuery, setQuickFoodQuery] = useState<string>('');
  const [quickSourceFilter, setQuickSourceFilter] = useState<'all' | 'saved' | 'common'>('all');
  const [quickMealSlot, setQuickMealSlot] = useState<MealEntry['mealType']>('Post-Workout');
  const [quickServingMultiplier, setQuickServingMultiplier] = useState<number>(1);
  const [isQuickSearchExpanded, setIsQuickSearchExpanded] = useState<boolean>(false);
  const [showMacroDetails, setShowMacroDetails] = useState<boolean>(false);
  const [openQuickAddMealSlot, setOpenQuickAddMealSlot] = useState<MealEntry['mealType'] | null>(
    null
  );
  const [quickAddModalSearch, setQuickAddModalSearch] = useState<string>('');

  const MEAL_TYPE_SLOTS: Array<{
    type: MealEntry['mealType'];
    slug: string;
    subtitle: string;
  }> = useMemo(
    () => [
      { type: 'Breakfast', slug: 'breakfast', subtitle: 'Gentle morning fuel' },
      { type: 'Pre-Workout', slug: 'pre-workout', subtitle: 'Light energy before moving' },
      { type: 'Post-Workout', slug: 'post-workout', subtitle: 'Refuel & rebuild' },
      { type: 'Dinner', slug: 'dinner', subtitle: 'Balanced evening meal' },
      { type: 'Snack', slug: 'snack', subtitle: 'Simple bite or shake' },
    ],
    []
  );

  const defaultHydrationGoalMl = useMemo(
    () =>
      Math.max(
        500,
        nutritionGoals.hydrationTargetMl ??
          Math.max(2250, Math.round(nutritionGoals.targetCalories * 1.02))
      ),
    [nutritionGoals.hydrationTargetMl, nutritionGoals.targetCalories]
  );

  const currentWellbeing: WellbeingDailyRecord = useMemo(() => {
    const existing = wellbeingByDate[todayIso];
    if (existing) {
      return {
        ...existing,
        waterGoalMl: nutritionGoals.hydrationTargetMl ?? existing.waterGoalMl ?? defaultHydrationGoalMl,
      };
    }
    return {
      date: todayIso,
      waterMl: 0,
      waterGoalMl: defaultHydrationGoalMl,
      sleepHours: 7.5,
      sleepQuality: 4,
      energyLevel: 4,
      stressLevel: 2,
      moodLevel: 4,
      mobilityMinutes: 0,
      cardioMinutes: 0,
      breathworkMinutes: 0,
      notes: '',
    };
  }, [wellbeingByDate, todayIso, nutritionGoals.hydrationTargetMl, defaultHydrationGoalMl]);

  const todayNutritionRecord: DailyNutritionRecord = useMemo(
    () =>
      nutritionByDate[todayIso] ?? {
        date: todayIso,
        bodyweightKg: preferences.calculatorProfile.weightKg || 82.7,
        stepsCount: 8000,
        meals: [],
      },
    [nutritionByDate, todayIso, preferences.calculatorProfile.weightKg]
  );

  const todayMacroTotals = useMemo(() => {
    return todayNutritionRecord.meals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (Number.isFinite(meal.calories) ? meal.calories : 0),
        proteinG: acc.proteinG + (Number.isFinite(meal.proteinG) ? meal.proteinG : 0),
        carbsG: acc.carbsG + (Number.isFinite(meal.carbsG) ? meal.carbsG : 0),
        fatG: acc.fatG + (Number.isFinite(meal.fatG) ? meal.fatG : 0),
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    );
  }, [todayNutritionRecord.meals]);

  const hydrationGoalMl = useMemo(
    () =>
      Math.max(
        500,
        nutritionGoals.hydrationTargetMl ?? currentWellbeing.waterGoalMl ?? defaultHydrationGoalMl
      ),
    [nutritionGoals.hydrationTargetMl, currentWellbeing.waterGoalMl, defaultHydrationGoalMl]
  );

  const filteredQuickResults = useMemo(() => {
    const q = quickFoodQuery.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

    const matchedSaved =
      quickSourceFilter === 'common'
        ? []
        : savedCustomMeals.filter((meal) => {
            if (tokens.length === 0) return true;
            const haystack = `${meal.name} ${meal.mealType} ${
              meal.ingredientsSummary ?? ''
            }`.toLowerCase();
            return tokens.every((tok) => haystack.includes(tok));
          });

    const matchedCommon =
      quickSourceFilter === 'saved'
        ? []
        : COMMON_FOOD_LOOKUP_LIST.filter((food) => {
            if (tokens.length === 0) return true;
            const haystack = `${food.name} ${food.category} ${
              food.servingLabel
            } ${food.keywords.join(' ')}`.toLowerCase();
            return tokens.every((tok) => haystack.includes(tok));
          });

    const visibleCommon = tokens.length === 0 ? matchedCommon.slice(0, 8) : matchedCommon.slice(0, 18);

    return {
      saved: matchedSaved,
      common: visibleCommon,
      totalMatches: matchedSaved.length + matchedCommon.length,
    };
  }, [quickFoodQuery, quickSourceFilter, savedCustomMeals]);

  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [studioHelpTarget, setStudioHelpTarget] = useState<WorkoutHelpTarget | null>(null);
  const triggerToast = (msg: string) => {
    setStatusToast(msg);
    window.setTimeout(() => setStatusToast(null), 3500);
  };

  const readinessScore = useMemo(() => {
    const sleepHrsScore = Math.min(30, Math.max(0, (currentWellbeing.sleepHours / 8) * 30));
    const sleepQualScore = (currentWellbeing.sleepQuality / 5) * 20;
    const energyScore = (currentWellbeing.energyLevel / 5) * 20;
    const stressInverseScore = ((6 - currentWellbeing.stressLevel) / 5) * 15;
    const hydrationScore = Math.min(
      15,
      (currentWellbeing.waterMl / Math.max(1000, currentWellbeing.waterGoalMl)) * 15
    );
    return Math.round(
      sleepHrsScore + sleepQualScore + energyScore + stressInverseScore + hydrationScore
    );
  }, [currentWellbeing]);

  const readinessLabel =
    readinessScore >= 80
      ? 'Well rested · Great day for steady movement'
      : readinessScore >= 60
      ? 'Steady energy · Move at a comfortable pace and sip water'
      : 'Gentle recovery day · Favor stretching, walking, or calm breathing';

  const updateWellbeingPatch = async (patch: Partial<WellbeingDailyRecord>) => {
    await onSaveWellbeing({
      ...currentWellbeing,
      ...patch,
      date: todayIso,
    });
  };

  const handleUpdateHydrationGoalMl = async (nextGoalMl: number) => {
    const clampedGoal = Math.max(1000, Math.min(7000, Math.round(nextGoalMl)));
    await Promise.all([
      updateWellbeingPatch({ waterGoalMl: clampedGoal }),
      onSaveGoals({ ...nutritionGoals, hydrationTargetMl: clampedGoal }),
    ]);
  };

  const handleQuickLogFoodOrMeal = async (item: {
    name: string;
    mealType: MealEntry['mealType'];
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    useSelectedSlot?: boolean;
  }) => {
    const mult = quickServingMultiplier;
    const scaledProtein = Math.max(0, Math.round(item.proteinG * mult));
    const scaledCarbs = Math.max(0, Math.round(item.carbsG * mult));
    const scaledFat = Math.max(0, Math.round(item.fatG * mult));
    const scaledCalories = Math.max(1, Math.round(item.calories * mult));

    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const labelWithServing =
      mult === 1 ? item.name : `${item.name} (${mult}× serving)`;

    const entry: MealEntry = {
      id: `meal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: todayIso,
      mealType: item.useSelectedSlot ? quickMealSlot : item.mealType,
      name: labelWithServing,
      calories: scaledCalories,
      proteinG: scaledProtein,
      carbsG: scaledCarbs,
      fatG: scaledFat,
      loggedAt: hhmm,
    };

    await onSaveDailyNutrition(
      {
        ...todayNutritionRecord,
        meals: [...todayNutritionRecord.meals, entry],
      },
      entry
    );

    triggerToast(
      `Logged "${labelWithServing}" · ${scaledCalories} kcal · ${scaledProtein}g protein`
    );
  };

  const handleInstantQuickAddForMealSlot = async (
    targetSlot: MealEntry['mealType'],
    savedMeal: SavedCustomMeal
  ) => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    const entry: MealEntry = {
      id: `meal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: todayIso,
      mealType: targetSlot,
      name: savedMeal.name,
      calories: Math.max(1, Math.round(savedMeal.calories)),
      proteinG: Math.max(0, Math.round(savedMeal.proteinG)),
      carbsG: Math.max(0, Math.round(savedMeal.carbsG)),
      fatG: Math.max(0, Math.round(savedMeal.fatG)),
      loggedAt: hhmm,
    };

    await onSaveDailyNutrition(
      {
        ...todayNutritionRecord,
        meals: [...todayNutritionRecord.meals, entry],
      },
      entry
    );

    setOpenQuickAddMealSlot(null);
    setQuickAddModalSearch('');
    triggerToast(
      `Quick Added "${savedMeal.name}" to ${targetSlot} · ${entry.calories} kcal · ${entry.proteinG}g P`
    );
  };

  const handleUpdateTodayBodyweight = async (newWeightKg: number) => {
    await onSaveDailyNutrition({
      ...todayNutritionRecord,
      bodyweightKg: newWeightKg,
    });
    triggerToast(`Updated today's scale weight to ${newWeightKg} kg`);
  };

  const handleSaveWeightForDate = async (dateIso: string, newWeightKg: number) => {
    const existing = nutritionByDate[dateIso] ?? {
      date: dateIso,
      bodyweightKg: newWeightKg,
      stepsCount: dateIso === todayIso ? todayNutritionRecord.stepsCount : 8000,
      meals: [],
    };
    await onSaveDailyNutrition({
      ...existing,
      date: dateIso,
      bodyweightKg: newWeightKg,
    });
    triggerToast(`Logged scale weight ${newWeightKg} kg for ${dateIso}`);
  };

  const handleSaveCustomMealItem = async (newMeal: Omit<SavedCustomMeal, 'id'>) => {
    const created: SavedCustomMeal = {
      ...newMeal,
      id: `custom_meal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    await onSaveCustomMeals([created, ...savedCustomMeals]);
    triggerToast(`Saved "${created.name}" to Custom Meals for 1-tap Quick Add`);
  };

  const handleCompleteBreathworkMinutes = async (
    minutesAdded: number,
    nextStressLevel?: 1 | 2 | 3 | 4 | 5
  ) => {
    const mins = Math.max(0, Math.round(minutesAdded));
    await updateWellbeingPatch({
      breathworkMinutes: currentWellbeing.breathworkMinutes + mins,
      ...(nextStressLevel ? { stressLevel: nextStressLevel } : {}),
    });
    if (mins > 0) {
      triggerToast(`Saved ${mins} min of calming breathwork to today's log!`);
    } else if (nextStressLevel) {
      triggerToast(`Updated stress check-in to ${nextStressLevel}/5`);
    }
  };

  // Yoga, Stretching & Cardio Studio state
  const [studioFilter, setStudioFilter] = useState<
    'all' | ExerciseModality.Yoga | ExerciseModality.Stretching | ExerciseModality.Cardio
  >('all');

  const studioTemplates = useMemo(() => {
    return templates.filter((t) => {
      const mod = resolveTemplateModality(t);
      if (
        mod !== ExerciseModality.Yoga &&
        mod !== ExerciseModality.Stretching &&
        mod !== ExerciseModality.Cardio
      ) {
        return false;
      }
      return studioFilter === 'all' ? true : mod === studioFilter;
    });
  }, [templates, studioFilter]);

  const [selectedStudioTplId, setSelectedStudioTplId] = useState<string>(
    () => studioTemplates[0]?.id ?? ''
  );

  const activeStudioTemplate = useMemo(
    () => studioTemplates.find((t) => t.id === selectedStudioTplId) ?? studioTemplates[0] ?? null,
    [studioTemplates, selectedStudioTplId]
  );

  const [poseStepIdx, setPoseStepIdx] = useState(0);
  const [poseTimerRunning, setPoseTimerRunning] = useState(false);
  const [poseSecondsLeft, setPoseSecondsLeft] = useState(45);

  useEffect(() => {
    setPoseStepIdx(0);
    setPoseTimerRunning(false);
    const firstItem = activeStudioTemplate?.exercises[0];
    setPoseSecondsLeft(firstItem ? parseDurationSecondsFromReps(firstItem.reps) : 45);
  }, [activeStudioTemplate?.id]);

  const currentPoseItem = activeStudioTemplate?.exercises[poseStepIdx] ?? null;
  const currentPoseLibraryEx = useMemo(() => {
    if (!currentPoseItem) return null;
    return (
      exerciseLibrary.find(
        (e) =>
          e.id === currentPoseItem.libraryExerciseId ||
          e.name.toLowerCase() === currentPoseItem.name.toLowerCase()
      ) ?? null
    );
  }, [currentPoseItem, exerciseLibrary]);

  useEffect(() => {
    if (!poseTimerRunning || !activeStudioTemplate) return;
    const id = window.setInterval(() => {
      setPoseSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        if (poseStepIdx + 1 < activeStudioTemplate.exercises.length) {
          const nextIdx = poseStepIdx + 1;
          setPoseStepIdx(nextIdx);
          playTimerStepTone(preferences.soundOnTimer !== false);
          return parseDurationSecondsFromReps(activeStudioTemplate.exercises[nextIdx].reps);
        }
        setPoseTimerRunning(false);
        playTimerCompleteTone(preferences.soundOnTimer !== false);
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [poseTimerRunning, poseStepIdx, activeStudioTemplate, preferences.soundOnTimer]);

  const selectPoseStep = (idx: number) => {
    if (!activeStudioTemplate) return;
    const clamped = Math.max(0, Math.min(activeStudioTemplate.exercises.length - 1, idx));
    setPoseStepIdx(clamped);
    setPoseTimerRunning(false);
    setPoseSecondsLeft(parseDurationSecondsFromReps(activeStudioTemplate.exercises[clamped].reps));
    playTimerSetTone(preferences.soundOnTimer !== false);
  };

  const handleCompleteGuidedFlow = async (tpl: WorkoutTemplate) => {
    const mod = resolveTemplateModality(tpl);
    const estMins = tpl.estimatedMinutes ?? 25;
    const drafts: PastWorkoutExerciseDraft[] = tpl.exercises.map((item) => ({
      exerciseId: item.libraryExerciseId,
      exerciseName: item.name,
      muscleId: item.primaryMuscle,
      setsCount: Math.max(1, item.sets),
      weightKg: item.defaultWeightKg,
      reps: 1,
      rir: 2,
      rpe: mod === ExerciseModality.Cardio ? 8 : 6,
    }));

    await onLogPastWorkout({
      dateIso: todayIso,
      title: tpl.name,
      durationMinutes: estMins,
      notes: `Completed guided ${mod} session (${estMins} min).`,
      exercises: drafts,
    });

    if (mod === ExerciseModality.Cardio) {
      await updateWellbeingPatch({ cardioMinutes: currentWellbeing.cardioMinutes + estMins });
    } else {
      await updateWellbeingPatch({ mobilityMinutes: currentWellbeing.mobilityMinutes + estMins });
    }
    setPoseTimerRunning(false);
    triggerToast(`Logged "${tpl.name}" to your Workout Calendar & Wellbeing`);
  };

  // Fitness Tools
  const weightUnit = nutritionGoals.weightUnit;
  const [oneRmWeight, setOneRmWeight] = useState<string>(weightUnit === 'kg' ? '100' : '225');
  const [oneRmReps, setOneRmReps] = useState<string>('5');

  const oneRmStats = useMemo(() => {
    const w = Math.max(0, Number(oneRmWeight) || 0);
    const r = Math.max(1, Math.min(30, Number(oneRmReps) || 1));
    if (w <= 0) return { est1Rm: 0, table: [] };
    const epley = r === 1 ? w : w * (1 + r / 30);
    const brzycki = r === 1 ? w : w * (36 / (37 - Math.min(35, r)));
    const avg1Rm = (epley + brzycki) / 2;
    const pcts = [
      { label: '1RM (100%)', pct: 1.0 },
      { label: '3RM (93%)', pct: 0.93 },
      { label: '5RM (87%)', pct: 0.87 },
      { label: '8RM (80%)', pct: 0.8 },
      { label: '10RM (75%)', pct: 0.75 },
      { label: '12RM (70%)', pct: 0.7 },
    ];
    return {
      est1Rm: Math.round(avg1Rm * 2) / 2,
      table: pcts.map((row) => ({ ...row, load: Math.round(avg1Rm * row.pct * 2) / 2 })),
    };
  }, [oneRmWeight, oneRmReps]);

  const [targetBarWeight, setTargetBarWeight] = useState<string>(weightUnit === 'kg' ? '100' : '225');
  const [barbellWeight, setBarbellWeight] = useState<number>(weightUnit === 'kg' ? 20 : 45);

  const plateBreakdown = useMemo(() => {
    const total = Math.max(0, Number(targetBarWeight) || 0);
    const bar = Math.max(0, barbellWeight);
    if (total <= bar) return { perSide: 0, plates: [] };
    const available = weightUnit === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
    let rem = (total - bar) / 2;
    const perSide = rem;
    const counts: Array<{ plate: number; count: number }> = [];
    for (const p of available) {
      const c = Math.floor((rem + 0.001) / p);
      if (c > 0) {
        counts.push({ plate: p, count: c });
        rem = Math.max(0, Number((rem - c * p).toFixed(2)));
      }
    }
    return { perSide: Number(perSide.toFixed(2)), plates: counts };
  }, [targetBarWeight, barbellWeight, weightUnit]);

  const [hrAge, setHrAge] = useState<string>(String(preferences.calculatorProfile.ageYears || 28));
  const [restingHr, setRestingHr] = useState<string>('58');

  const hrZones = useMemo(() => {
    const age = Math.max(14, Math.min(95, Number(hrAge) || 28));
    const rhr = Math.max(35, Math.min(110, Number(restingHr) || 60));
    const maxHr = Math.round(208 - 0.7 * age);
    const hrr = Math.max(20, maxHr - rhr);
    const calc = (pct: number) => Math.round(rhr + hrr * pct);
    return [
      { zone: 'Zone 1 · Recovery', range: `${calc(0.5)}–${calc(0.6)} bpm`, focus: 'Warm-up, walking & recovery' },
      { zone: 'Zone 2 · Aerobic Base', range: `${calc(0.6)}–${calc(0.7)} bpm`, focus: 'Fat oxidation & endurance' },
      { zone: 'Zone 3 · Tempo', range: `${calc(0.7)}–${calc(0.8)} bpm`, focus: 'Sustained aerobic stamina' },
      { zone: 'Zone 4 · Threshold', range: `${calc(0.8)}–${calc(0.9)} bpm`, focus: 'Anaerobic lactate threshold' },
      { zone: 'Zone 5 · VO2 Max', range: `${calc(0.9)}–${maxHr} bpm`, focus: 'Peak HIIT sprint output' },
    ];
  }, [hrAge, restingHr]);

  const [compHeightCm, setCompHeightCm] = useState<string>(
    String(preferences.calculatorProfile.heightCm || 178)
  );
  const [compWeightKg, setCompWeightKg] = useState<string>(
    String(preferences.calculatorProfile.weightKg || 82.5)
  );
  const [compWaistCm, setCompWaistCm] = useState<string>('82');
  const [compNeckCm, setCompNeckCm] = useState<string>('39');
  const [compHipCm, setCompHipCm] = useState<string>('96');
  const [compSex, setCompSex] = useState<BiologicalSex>(preferences.calculatorProfile.sex);

  const bodyCompMetrics = useMemo(() => {
    const hCm = Math.max(120, Math.min(230, Number(compHeightCm) || 178));
    const wKg = Math.max(35, Math.min(250, Number(compWeightKg) || 80));
    const waist = Math.max(50, Math.min(180, Number(compWaistCm) || 82));
    const neck = Math.max(25, Math.min(65, Number(compNeckCm) || 39));
    const hip = Math.max(60, Math.min(180, Number(compHipCm) || 96));
    const hM = hCm / 100;
    const bmi = wKg / (hM * hM);
    const bfPct =
      compSex === BiologicalSex.Male
        ? 495 / (1.0324 - 0.19077 * Math.log10(Math.max(12, waist - neck)) + 0.15456 * Math.log10(hCm)) - 450
        : 495 / (1.29579 - 0.35004 * Math.log10(Math.max(20, waist + hip - neck)) + 0.221 * Math.log10(hCm)) - 450;
    const clampedBf = Math.min(48, Math.max(4, bfPct));
    const leanMassKg = wKg * (1 - clampedBf / 100);
    const ffmi = leanMassKg / (hM * hM) + 6.1 * (1.8 - hM);
    return {
      bmi: bmi.toFixed(1),
      bodyFatPct: clampedBf.toFixed(1),
      leanMassKg: leanMassKg.toFixed(1),
      ffmi: ffmi.toFixed(1),
    };
  }, [compHeightCm, compWeightKg, compWaistCm, compNeckCm, compHipCm, compSex]);

  const [hiitWorkSec, setHiitWorkSec] = useState<number>(20);
  const [hiitRestSec, setHiitRestSec] = useState<number>(10);
  const [hiitRounds, setHiitRounds] = useState<number>(8);
  const [hiitRunning, setHiitRunning] = useState<boolean>(false);
  const [hiitCurrentRound, setHiitCurrentRound] = useState<number>(1);
  const [hiitPhase, setHiitPhase] = useState<'work' | 'rest' | 'done'>('work');
  const [hiitSecondsLeft, setHiitSecondsLeft] = useState<number>(20);

  const applyHiitPreset = (work: number, rest: number, rounds: number) => {
    setHiitRunning(false);
    setHiitWorkSec(work);
    setHiitRestSec(rest);
    setHiitRounds(rounds);
    setHiitCurrentRound(1);
    setHiitPhase('work');
    setHiitSecondsLeft(work);
    playTimerSetTone(preferences.soundOnTimer !== false);
  };

  useEffect(() => {
    if (!hiitRunning) return;
    const id = window.setInterval(() => {
      setHiitSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        if (hiitPhase === 'work') {
          if (hiitCurrentRound >= hiitRounds) {
            setHiitRunning(false);
            setHiitPhase('done');
            playTimerCompleteTone(preferences.soundOnTimer !== false);
            return 0;
          }
          setHiitPhase('rest');
          playTimerStepTone(preferences.soundOnTimer !== false);
          return hiitRestSec;
        }
        if (hiitPhase === 'rest') {
          setHiitCurrentRound((r) => r + 1);
          setHiitPhase('work');
          playTimerStepTone(preferences.soundOnTimer !== false);
          return hiitWorkSec;
        }
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [
    hiitRunning,
    hiitPhase,
    hiitCurrentRound,
    hiitRounds,
    hiitWorkSec,
    hiitRestSec,
    preferences.soundOnTimer,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Wellness &amp; Recovery
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Nourish your body, stay hydrated, and unwind at a comfortable pace.
          </p>
        </div>

        <div className="flex items-center w-full lg:w-auto">
          <div
            className="flex w-full lg:w-auto items-center gap-1 p-1 rounded-xl hl-subtle border overflow-x-auto no-scrollbar"
            role="tablist"
            aria-label="Wellness workspace sections"
          >
            {(
              [
                { id: 'wellbeing', label: 'Overview' },
                { id: 'indian', label: 'Indian Meals' },
                { id: 'breathing', label: 'Breathing' },
                { id: 'studio', label: 'Movement' },
                { id: 'tools', label: 'Tools' },
                { id: 'nutrition', label: 'Nutrition' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-testid={`wellness-subtab-${tab.id}`}
                aria-selected={subTab === tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`no-touch-delay min-h-[44px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  subTab === tab.id
                    ? 'bg-sky-600 dark:bg-sky-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {statusToast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusToast}</span>
        </div>
      )}

      {/* CALM DAILY BALANCE SUMMARY (Progressive Disclosure — Shown on Overview) */}
      {subTab === 'wellbeing' && (
        <section
          data-testid="wellness-daily-balance-card"
          aria-label="Today's daily balance summary"
          className="hl-card rounded-2xl p-5 sm:p-6 bg-slate-50/90 dark:bg-slate-900/75 border border-slate-200/80 dark:border-slate-800 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-sky-700 dark:text-sky-300">
                Today&apos;s Daily Balance
              </p>
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                {readinessLabel}
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                void updateWellbeingPatch({ waterMl: currentWellbeing.waterMl + 250 })
              }
              className="no-touch-delay min-h-[42px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Add 250 ml Water</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-200/80 dark:border-slate-800">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Nourishment
                </span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <strong className="text-slate-900 dark:text-white">
                    {todayMacroTotals.calories.toLocaleString()}
                  </strong>{' '}
                  / {nutritionGoals.targetCalories.toLocaleString()} kcal
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500 dark:bg-sky-400 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (todayMacroTotals.calories / Math.max(1, nutritionGoals.targetCalories)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">Protein</span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <strong className="text-slate-900 dark:text-white">
                    {todayMacroTotals.proteinG}
                  </strong>{' '}
                  / {nutritionGoals.proteinTargetG}g
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (todayMacroTotals.proteinG / Math.max(1, nutritionGoals.proteinTargetG)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">Hydration</span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <strong className="text-slate-900 dark:text-white">
                    {currentWellbeing.waterMl.toLocaleString()}
                  </strong>{' '}
                  / {hydrationGoalMl.toLocaleString()} ml
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-teal-500 dark:bg-teal-400 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((currentWellbeing.waterMl / Math.max(500, hydrationGoalMl)) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                data-testid="toggle-wellness-macro-details-btn"
                aria-expanded={showMacroDetails}
                onClick={() => setShowMacroDetails((prev) => !prev)}
                className="no-touch-delay min-h-[38px] px-3 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-sky-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>
                  {showMacroDetails
                    ? 'Hide Macro & Readiness Details'
                    : 'View Macro & Readiness Details'}
                </span>
                {showMacroDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setSubTab('nutrition')}
                className="no-touch-delay min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold text-sky-700 dark:text-sky-300 hover:underline whitespace-nowrap"
              >
                Open Full Nutrition Log &rarr;
              </button>
            </div>

            {showMacroDetails && (
              <div
                data-testid="wellness-macro-details-panel"
                className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs"
              >
                <div className="p-3 rounded-xl bg-white/85 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-slate-500 dark:text-slate-400 block">Carbs</span>
                  <span className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                    {todayMacroTotals.carbsG} / {nutritionGoals.carbsTargetG}g
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/85 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-slate-500 dark:text-slate-400 block">Healthy Fats</span>
                  <span className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                    {todayMacroTotals.fatG} / {nutritionGoals.fatTargetG}g
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/85 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-slate-500 dark:text-slate-400 block">Meals Today</span>
                  <span className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                    {todayNutritionRecord.meals.length} logged
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/85 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-slate-500 dark:text-slate-400 block">Readiness</span>
                  <span className="font-mono tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                    {readinessScore} / 100
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* DROPDOWN MENU: MEALS BY TIME OF DAY (Shown on Overview) */}
      {subTab === 'wellbeing' && (
      <ExpandableInfoDropdown
        testId="wellness-dropdown-meal-slots"
        title="Meals by Time of Day"
        subtitle="Add breakfast, pre/post-workout fuel, dinner, or a simple snack at your own pace"
        summaryRight={`${todayNutritionRecord.meals.length} logged · ${todayMacroTotals.calories} kcal`}
        icon={<Utensils className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
        defaultOpen={false}
      >
        <section
          data-testid="wellness-meal-slots-section"
          aria-label="Daily nutrition tracking by meal type"
          className="space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tap <strong>Quick Add</strong> next to any meal time to pick from your saved favorites
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTab('indian')}
                className="no-touch-delay min-h-[38px] px-3 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-sky-600 dark:text-sky-400 hover:border-sky-500 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Utensils className="w-3.5 h-3.5 shrink-0" />
                <span>Indian Foods &amp; Recipes</span>
              </button>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Today ({todayIso})
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
            {MEAL_TYPE_SLOTS.map((slot) => {
              const slotMeals = todayNutritionRecord.meals.filter((m) => m.mealType === slot.type);
              const slotKcal = slotMeals.reduce((sum, m) => sum + m.calories, 0);
              const slotProtein = slotMeals.reduce((sum, m) => sum + m.proteinG, 0);
              const isMenuOpen = openQuickAddMealSlot === slot.type;

              return (
                <div
                  key={slot.type}
                  data-testid={`meal-slot-row-${slot.slug}`}
                  className="py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {slot.type}
                        </h3>
                        <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {slotKcal > 0
                            ? `${slotKcal.toLocaleString()} kcal · ${slotProtein}g P`
                            : slot.subtitle}
                        </span>
                      </div>

                      {slotMeals.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {slotMeals.map((logged) => (
                            <p
                              key={logged.id}
                              className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums truncate"
                            >
                              {logged.loggedAt} ·{' '}
                              <span className="font-sans font-medium">{logged.name}</span> (
                              {logged.calories} kcal · {logged.proteinG}g P)
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      data-testid={`quick-add-btn-${slot.slug}`}
                      aria-haspopup="dialog"
                      aria-expanded={isMenuOpen}
                      onClick={() => {
                        setQuickAddModalSearch('');
                        setOpenQuickAddMealSlot((prev) => (prev === slot.type ? null : slot.type));
                      }}
                      className="no-touch-delay min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Quick Add</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </ExpandableInfoDropdown>
      )}

      {/* QUICK ADD SAVED CUSTOM MEALS DROPDOWN MODAL */}
      {openQuickAddMealSlot && (() => {
        const activeSlotMeta =
          MEAL_TYPE_SLOTS.find((s) => s.type === openQuickAddMealSlot) ?? MEAL_TYPE_SLOTS[0];
        const q = quickAddModalSearch.trim().toLowerCase();
        const modalMeals = savedCustomMeals.filter((meal) => {
          if (!q) return true;
          return `${meal.name} ${meal.mealType} ${meal.ingredientsSummary ?? ''}`
            .toLowerCase()
            .includes(q);
        });

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Quick Add saved meal to ${openQuickAddMealSlot}`}
            data-testid="quick-add-modal"
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => {
              setOpenQuickAddMealSlot(null);
              setQuickAddModalSearch('');
            }}
          >
            <div
              data-testid={`quick-add-menu-${activeSlotMeta.slug}`}
              className="w-full max-w-lg hl-card rounded-2xl border shadow-xl p-4 sm:p-5 space-y-4 max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <p className="text-[11px] font-mono tabular-nums text-blue-600 dark:text-blue-400 font-semibold">
                    Quick Add · {todayIso}
                  </p>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                    Add Saved Meal to {openQuickAddMealSlot}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Select any saved custom meal below to append it to today&apos;s{' '}
                    {openQuickAddMealSlot} log
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close Quick Add modal"
                  onClick={() => {
                    setOpenQuickAddMealSlot(null);
                    setQuickAddModalSearch('');
                  }}
                  className="no-touch-delay min-h-[40px] min-w-[40px] rounded-xl hl-subtle border flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {savedCustomMeals.length > 3 && (
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={quickAddModalSearch}
                    onChange={(e) => setQuickAddModalSearch(e.target.value)}
                    placeholder="Filter saved custom meals…"
                    aria-label="Filter saved custom meals"
                    className="w-full min-h-[42px] pl-9 pr-3 py-2 text-xs sm:text-sm hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
              )}

              <div className="overflow-y-auto space-y-2 pr-1 flex-1">
                {modalMeals.length === 0 ? (
                  <div className="py-6 text-center space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {savedCustomMeals.length === 0
                        ? 'No saved custom meals yet.'
                        : `No saved custom meals match "${quickAddModalSearch}".`}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenQuickAddMealSlot(null);
                        setSubTab('nutrition');
                      }}
                      className="no-touch-delay min-h-[38px] px-3.5 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-semibold"
                    >
                      Create Custom Meal in Nutrition Builder
                    </button>
                  </div>
                ) : (
                  modalMeals.map((meal) => (
                    <button
                      key={meal.id}
                      type="button"
                      data-testid={`quick-add-option-${activeSlotMeta.slug}-${meal.id}`}
                      onClick={() =>
                        void handleInstantQuickAddForMealSlot(openQuickAddMealSlot, meal)
                      }
                      className="no-touch-delay w-full min-h-[54px] px-3.5 py-3 rounded-xl hl-subtle border hover:border-sky-500 text-left transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                          {meal.name}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                          {meal.calories} kcal · {meal.proteinG}g P · {meal.carbsG}g C ·{' '}
                          {meal.fatG}g F
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 shrink-0 whitespace-nowrap">
                        + Add
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* DEDICATED BREATHING TECHNIQUES SECTION (Web Audio API Ambient Tracks + Timed Inhale/Exhale) */}
      {subTab === 'breathing' && (
        <BreathingTechniquesSection
          currentStressLevel={currentWellbeing.stressLevel}
          todayBreathworkMinutes={currentWellbeing.breathworkMinutes}
          soundEnabledByDefault={preferences.soundOnTimer !== false}
          onCompleteBreathworkMinutes={handleCompleteBreathworkMinutes}
        />
      )}

      {/* CURATED INDIAN RECIPE CATALOG SEARCH & MACRO LOGGING (Collapsible Dropdown on Wellbeing, Open on Indian Tab) */}
      {subTab === 'wellbeing' && (
        <ExpandableInfoDropdown
          testId="wellness-dropdown-indian-catalog"
          title="Indian Home Cooking & Recipe Videos"
          subtitle="Explore everyday dals, rotis, curries, and regional video guides"
          summaryRight="8 video styles"
          icon={<Utensils className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
          defaultOpen={false}
        >
          <IndianCatalogExplorerSection
            onAddRecipeToDailyLog={async (item) => {
              await handleQuickLogFoodOrMeal({
                ...item,
                useSelectedSlot: false,
              });
            }}
          />
        </ExpandableInfoDropdown>
      )}
      {subTab === 'indian' && (
        <IndianCatalogExplorerSection
          onAddRecipeToDailyLog={async (item) => {
            await handleQuickLogFoodOrMeal({
              ...item,
              useSelectedSlot: false,
            });
          }}
        />
      )}

      {/* FAST SEARCH INPUT FOR SAVED CUSTOM MEALS & LOCAL COMMON FOOD DICTIONARY (Collapsed by Default) */}
      {subTab === 'wellbeing' && (
        <ExpandableInfoDropdown
          title="Quick Food Lookup"
          subtitle={`Search ${COMMON_FOOD_LOOKUP_LIST.length} everyday foods or your ${savedCustomMeals.length} saved favorites`}
          icon={<Search className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
          defaultOpen={isQuickSearchExpanded}
        >
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
              <div className="lg:col-span-6 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  data-testid="wellness-food-search-input"
                  aria-label="Search saved custom meals and common food items"
                  value={quickFoodQuery}
                  onChange={(e) => {
                    setIsQuickSearchExpanded(true);
                    setQuickFoodQuery(e.target.value);
                  }}
                  placeholder="Type a food (oats, eggs, rice, banana, yogurt)…"
                  className="w-full min-h-[46px] pl-10 pr-10 py-2 text-xs sm:text-sm hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
                {quickFoodQuery && (
                  <button
                    type="button"
                    onClick={() => setQuickFoodQuery('')}
                    aria-label="Clear food search"
                    className="no-touch-delay min-h-[40px] min-w-[40px] absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="lg:col-span-3 flex items-center gap-1 p-1 rounded-xl hl-subtle border overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'saved', label: `Saved (${savedCustomMeals.length})` },
                    { id: 'common', label: 'Foods' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setQuickSourceFilter(opt.id)}
                    className={`no-touch-delay flex-1 min-h-[38px] px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      quickSourceFilter === opt.id
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="lg:col-span-3 grid grid-cols-2 gap-2">
                <select
                  aria-label="Quick log meal slot"
                  value={quickMealSlot}
                  onChange={(e) => setQuickMealSlot(e.target.value as MealEntry['mealType'])}
                  className="min-h-[44px] px-2.5 text-xs font-semibold hl-input rounded-xl"
                >
                  <option value="Breakfast">Breakfast</option>
                  <option value="Pre-Workout">Pre-Workout</option>
                  <option value="Post-Workout">Post-Workout</option>
                  <option value="Dinner">Dinner</option>
                  <option value="Snack">Snack</option>
                </select>

                <select
                  aria-label="Serving size multiplier"
                  value={quickServingMultiplier}
                  onChange={(e) => setQuickServingMultiplier(Number(e.target.value) || 1)}
                  className="min-h-[44px] px-2.5 text-xs font-mono tabular-nums font-semibold hl-input rounded-xl"
                >
                  <option value={0.5}>0.5× serving</option>
                  <option value={1}>1× serving</option>
                  <option value={1.5}>1.5× serving</option>
                  <option value={2}>2× serving</option>
                </select>
              </div>
            </div>

            {filteredQuickResults.saved.length === 0 &&
            filteredQuickResults.common.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No saved meals or common foods match &ldquo;{quickFoodQuery}&rdquo;. Try another word!
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-200/80 dark:divide-slate-800 pr-1">
                {filteredQuickResults.saved.map((meal) => {
                  const scaledKcal = Math.round(meal.calories * quickServingMultiplier);
                  const scaledP = Math.round(meal.proteinG * quickServingMultiplier);
                  const scaledC = Math.round(meal.carbsG * quickServingMultiplier);
                  const scaledF = Math.round(meal.fatG * quickServingMultiplier);
                  return (
                    <div
                      key={meal.id}
                      data-testid={`quick-saved-meal-${meal.id}`}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            Saved Meal
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{meal.mealType}</span>
                        </div>
                        <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate mt-0.5">
                          {meal.name}
                        </p>
                        <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 mt-0.5">
                          <strong className="text-slate-900 dark:text-white">
                            {scaledKcal} kcal
                          </strong>
                          {' · '}
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            {scaledP}g P
                          </span>
                          {` · ${scaledC}g C · ${scaledF}g F`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void handleQuickLogFoodOrMeal({
                            name: meal.name,
                            mealType: meal.mealType,
                            calories: meal.calories,
                            proteinG: meal.proteinG,
                            carbsG: meal.carbsG,
                            fatG: meal.fatG,
                            useSelectedSlot: false,
                          })
                        }
                        aria-label={`Quick log ${meal.name}`}
                        className="no-touch-delay min-h-[44px] px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span>Add</span>
                      </button>
                    </div>
                  );
                })}

                {filteredQuickResults.common.map((food) => {
                  const scaledKcal = Math.round(food.calories * quickServingMultiplier);
                  const scaledP = Math.round(food.proteinG * quickServingMultiplier);
                  const scaledC = Math.round(food.carbsG * quickServingMultiplier);
                  const scaledF = Math.round(food.fatG * quickServingMultiplier);
                  return (
                    <div
                      key={food.id}
                      data-testid={`quick-common-food-${food.id}`}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{food.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{food.servingLabel}</span>
                        </div>
                        <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate mt-0.5">
                          {food.name}
                        </p>
                        <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 mt-0.5">
                          <strong className="text-slate-900 dark:text-white">
                            {scaledKcal} kcal
                          </strong>
                          {' · '}
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            {scaledP}g P
                          </span>
                          {` · ${scaledC}g C · ${scaledF}g F`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void handleQuickLogFoodOrMeal({
                            name: food.name,
                            mealType: food.defaultMealType,
                            calories: food.calories,
                            proteinG: food.proteinG,
                            carbsG: food.carbsG,
                            fatG: food.fatG,
                            useSelectedSlot: true,
                          })
                        }
                        aria-label={`Quick log ${food.name}`}
                        className="no-touch-delay min-h-[44px] px-3.5 py-2 rounded-xl hl-subtle border text-slate-800 dark:text-slate-100 hover:border-sky-500 text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span>Add</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ExpandableInfoDropdown>
      )}

      {/* TAB 1: DAILY HUB (Organized Collapsible Dropdown Menus for Hydration, Breathwork, Weight Chart & Check-In) */}
      {subTab === 'wellbeing' && (
        <div className="space-y-4">
          <ExpandableInfoDropdown
            testId="wellness-dropdown-hydration"
            title="Hydration & Water Log"
            subtitle="Add a glass or bottle and adjust your comfortable daily goal"
            summaryRight={`${currentWellbeing.waterMl.toLocaleString()} / ${hydrationGoalMl.toLocaleString()} ml`}
            icon={<Droplets className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <svg
                className="w-full h-3 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800"
                viewBox="0 0 100 6"
                preserveAspectRatio="none"
                aria-label="Hydration progress"
              >
                <rect
                  x="0"
                  y="0"
                  width={Math.min(
                    100,
                    Math.round((currentWellbeing.waterMl / Math.max(500, hydrationGoalMl)) * 100)
                  )}
                  height="6"
                  className="fill-blue-600 dark:fill-blue-500 transition-all"
                />
              </svg>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      void updateWellbeingPatch({
                        waterMl: Math.max(0, currentWellbeing.waterMl - 250),
                      })
                    }
                    className="no-touch-delay min-h-[44px] px-3 py-2 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 flex items-center gap-1"
                  >
                    <Minus className="w-3.5 h-3.5" />
                    <span>250 ml</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void updateWellbeingPatch({ waterMl: currentWellbeing.waterMl + 250 })
                    }
                    className="no-touch-delay min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>1 Cup (250 ml)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void updateWellbeingPatch({ waterMl: currentWellbeing.waterMl + 500 })
                    }
                    className="no-touch-delay min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:opacity-90 text-white text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>1 Bottle (500 ml)</span>
                  </button>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>Daily Goal</span>
                  <input
                    type="number"
                    min={1000}
                    max={7000}
                    step={250}
                    value={hydrationGoalMl}
                    onChange={(e) =>
                      void handleUpdateHydrationGoalMl(Number(e.target.value) || 3000)
                    }
                    className="w-20 min-h-[40px] px-2 text-center font-mono tabular-nums hl-input rounded-lg"
                  />
                </label>
              </div>
            </div>
          </ExpandableInfoDropdown>

          <ExpandableInfoDropdown
            testId="wellness-dropdown-breathwork"
            title="Calm Breathing & Ambient Sound"
            subtitle="Unwind with gentle rhythmic breathing and ocean, rain, or singing bowl audio"
            summaryRight={`${currentWellbeing.breathworkMinutes}m · Readiness ${readinessScore}/100`}
            icon={<Wind className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
            defaultOpen={false}
          >
            <div
              data-testid="guided-breathwork-card"
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Follow a gentle inhale and exhale rhythm with soft ocean, rain, forest stream, or singing bowl soundscapes whenever you want to slow down.
              </p>

              <button
                type="button"
                data-testid="open-breathing-studio-btn"
                onClick={() => setSubTab('breathing')}
                className="no-touch-delay min-h-[46px] px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Wind className="w-4 h-4" />
                <span>Open Breathing Studio</span>
              </button>
            </div>
          </ExpandableInfoDropdown>

          {/* Expandable Dropdown: Body Weight & Calorie Trend Chart */}
          <ExpandableInfoDropdown
            title="Weight & Nourishment Trend"
            subtitle="Optional check-in for scale weight and gentle multi-day progress"
            summaryRight={`${todayNutritionRecord.bodyweightKg} ${nutritionGoals.weightUnit}`}
            defaultOpen={false}
          >
            <DailyNutritionWeightChart
              nutritionByDate={nutritionByDate}
              nutritionGoals={nutritionGoals}
              todayIso={todayIso}
              isDark={isDark}
              onUpdateTodayBodyweight={handleUpdateTodayBodyweight}
              onSaveWeightForDate={handleSaveWeightForDate}
            />
          </ExpandableInfoDropdown>

          {/* Expandable Dropdown: Sleep, Energy & Recovery Check-In */}
          <ExpandableInfoDropdown
            title="Sleep, Energy & Mood Check-In"
            subtitle={`${readinessLabel}`}
            summaryRight={`Readiness ${readinessScore}/100`}
            icon={<Heart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Mobility</p>
                  <p className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {currentWellbeing.mobilityMinutes}m
                  </p>
                </div>
                <div className="p-3 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Cardio</p>
                  <p className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {currentWellbeing.cardioMinutes}m
                  </p>
                </div>
                <div className="p-3 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Breathwork</p>
                  <p className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {currentWellbeing.breathworkMinutes}m
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Hours Slept Last Night
                    </span>
                    <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                      {currentWellbeing.sleepHours.toFixed(1)} hrs
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={11}
                    step={0.5}
                    value={currentWellbeing.sleepHours}
                    onChange={(e) =>
                      void updateWellbeingPatch({ sleepHours: Number(e.target.value) })
                    }
                    className="w-full accent-blue-600"
                  />
                </label>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      How Well Did You Sleep?
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {currentWellbeing.sleepQuality}/5
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {([1, 2, 3, 4, 5] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => void updateWellbeingPatch({ sleepQuality: n })}
                        className={`no-touch-delay min-h-[40px] rounded-lg font-mono tabular-nums text-xs font-semibold transition-colors ${
                          currentWellbeing.sleepQuality === n
                            ? 'bg-sky-600 text-white'
                            : 'hl-subtle border text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Energy Level Today
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {currentWellbeing.energyLevel}/5
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {([1, 2, 3, 4, 5] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => void updateWellbeingPatch({ energyLevel: n })}
                        className={`no-touch-delay min-h-[40px] rounded-lg font-mono tabular-nums text-xs font-semibold transition-colors ${
                          currentWellbeing.energyLevel === n
                            ? 'bg-emerald-600 text-white'
                            : 'hl-subtle border text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Stress (1 Very Calm – 5 Busy)
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {currentWellbeing.stressLevel}/5
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {([1, 2, 3, 4, 5] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => void updateWellbeingPatch({ stressLevel: n })}
                        className={`no-touch-delay min-h-[40px] rounded-lg font-mono tabular-nums text-xs font-semibold transition-colors ${
                          currentWellbeing.stressLevel === n
                            ? 'bg-sky-600 text-white'
                            : 'hl-subtle border text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </ExpandableInfoDropdown>
        </div>
      )}

      {/* TAB: MORE INDIAN PANTRY STAPLES & CUSTOM BUILDER */}
      {subTab === 'indian' && (
        <ExpandableInfoDropdown
          testId="wellness-dropdown-indian-pantry"
          title="More Indian Staples, Pantry Items & Custom Dish Builder"
          subtitle="Tap to browse everyday rotis, dals, snacks, or save your own family recipe"
          icon={<Utensils className="w-4 h-4 text-orange-500" />}
          defaultOpen={true}
        >
          <IndianNutritionSection
            onQuickLogFood={async (item) => {
              await handleQuickLogFoodOrMeal({
                ...item,
                useSelectedSlot: false,
              });
            }}
            savedCustomMeals={savedCustomMeals}
            onSaveCustomMeal={handleSaveCustomMealItem}
          />
        </ExpandableInfoDropdown>
      )}

      {/* TAB 2: YOGA, STRETCHING & CARDIO STUDIO */}
      {subTab === 'studio' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 hl-subtle border rounded-xl overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: 'All Flows & Cardio' },
                  { id: ExerciseModality.Yoga, label: 'Yoga Flows' },
                  { id: ExerciseModality.Stretching, label: 'Stretching & Mobility' },
                  { id: ExerciseModality.Cardio, label: 'Cardio & Pace' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStudioFilter(f.id)}
                  className={`no-touch-delay min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    studioFilter === f.id
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Follow the gentle step timer or open any flow in Tracker
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 hl-card rounded-2xl overflow-hidden divide-y divide-slate-200/70 dark:divide-slate-800">
              {studioTemplates.map((tpl) => {
                const mod = resolveTemplateModality(tpl);
                const active = activeStudioTemplate?.id === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedStudioTplId(tpl.id)}
                    className={`no-touch-delay w-full text-left p-4 transition-colors ${
                      active
                        ? 'bg-sky-50/75 dark:bg-sky-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 capitalize">
                      {mod} · {tpl.level ?? 'All Levels'} · ~{tpl.estimatedMinutes ?? 25} min ·{' '}
                      {tpl.exercises.length} steps
                    </p>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      {tpl.name}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                      {tpl.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {activeStudioTemplate && (
              <div className="lg:col-span-7 hl-card rounded-2xl p-4 sm:p-6 space-y-5">
                <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 capitalize">
                      {resolveTemplateModality(activeStudioTemplate)} · Step {poseStepIdx + 1} of{' '}
                      {activeStudioTemplate.exercises.length}
                    </p>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                      {activeStudioTemplate.name}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        setStudioHelpTarget(buildHelpTargetFromTemplate(activeStudioTemplate))
                      }
                      className="no-touch-delay min-h-[38px] px-3 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-sky-600 dark:text-sky-400 hover:border-sky-500 flex items-center gap-1 whitespace-nowrap"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Guide</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onStartStandaloneTemplate(activeStudioTemplate)}
                      className="no-touch-delay min-h-[38px] px-3 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-sky-500 whitespace-nowrap"
                    >
                      Open in Tracker
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCompleteGuidedFlow(activeStudioTemplate)}
                      className="no-touch-delay min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Complete &amp; Log</span>
                    </button>
                  </div>
                </div>

                {currentPoseItem && (
                  <div className="p-4 sm:p-5 rounded-2xl hl-subtle border space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Target: {currentPoseItem.sets} × {currentPoseItem.reps} ·{' '}
                          {landmarks[currentPoseItem.primaryMuscle]?.name}
                        </p>
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                          {currentPoseItem.name}
                        </h3>
                      </div>

                      <div className="text-left sm:text-right shrink-0">
                        <span className="text-3xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
                          {formatTimerClock(poseSecondsLeft)}
                        </span>
                      </div>
                    </div>

                    {currentPoseLibraryEx && (
                      <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-200/70 dark:border-slate-800 pt-3">
                        {currentPoseLibraryEx.instructions.map((cue, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {idx + 1}. {cue}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={poseStepIdx === 0}
                          onClick={() => selectPoseStep(poseStepIdx - 1)}
                          className="no-touch-delay min-h-[38px] px-3 rounded-xl hl-card border text-xs font-semibold disabled:opacity-40 flex items-center gap-1"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>Prev</span>
                        </button>
                        <button
                          type="button"
                          disabled={poseStepIdx >= activeStudioTemplate.exercises.length - 1}
                          onClick={() => selectPoseStep(poseStepIdx + 1)}
                          className="no-touch-delay min-h-[38px] px-3 rounded-xl hl-card border text-xs font-semibold disabled:opacity-40 flex items-center gap-1"
                        >
                          <span>Next</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPoseSecondsLeft(parseDurationSecondsFromReps(currentPoseItem.reps));
                            playTimerSetTone(preferences.soundOnTimer !== false);
                          }}
                          className="no-touch-delay min-h-[38px] px-3 rounded-xl hl-card border text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!poseTimerRunning) {
                              playTimerSetTone(preferences.soundOnTimer !== false);
                            }
                            setPoseTimerRunning((r) => !r);
                          }}
                          className="no-touch-delay min-h-[38px] px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5"
                        >
                          {poseTimerRunning ? (
                            <>
                              <Pause className="w-3.5 h-3.5" />
                              <span>Pause Timer</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              <span>Start Pose Timer</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                  {activeStudioTemplate.exercises.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectPoseStep(idx)}
                      className={`no-touch-delay w-full py-2.5 px-2 text-left flex items-center justify-between gap-3 rounded-lg transition-colors ${
                        idx === poseStepIdx
                          ? 'bg-sky-50/70 dark:bg-sky-950/30 font-semibold'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <span className="text-xs text-slate-900 dark:text-white truncate">
                        <span className="font-mono tabular-nums text-slate-400 mr-2">
                          {idx + 1}.
                        </span>
                        {item.name}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                        {item.sets} × {item.reps}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: FITNESS TOOLS (All Calculators & Timers Collapsed by Default in Dropdown Menus) */}
      {subTab === 'tools' && (
        <div className="space-y-4">
          <ExpandableInfoDropdown
            testId="wellness-dropdown-hiit"
            title="Interval & Circuit Timer"
            subtitle={`Round ${hiitCurrentRound} of ${hiitRounds} · ${
              hiitPhase === 'work'
                ? 'Active Pace'
                : hiitPhase === 'rest'
                ? 'Recovery Breath'
                : 'Completed'
            }`}
            summaryRight={formatTimerClock(hiitSecondsLeft)}
            icon={<Timer className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyHiitPreset(20, 10, 8)}
                    className="no-touch-delay min-h-[40px] px-3 rounded-lg hl-subtle border text-xs font-semibold"
                  >
                    Tabata 20s/10s × 8
                  </button>
                  <button
                    type="button"
                    onClick={() => applyHiitPreset(40, 20, 10)}
                    className="no-touch-delay min-h-[40px] px-3 rounded-lg hl-subtle border text-xs font-semibold"
                  >
                    HIIT 40s/20s × 10
                  </button>
                  <button
                    type="button"
                    onClick={() => applyHiitPreset(45, 15, 12)}
                    className="no-touch-delay min-h-[40px] px-3 rounded-lg hl-subtle border text-xs font-semibold"
                  >
                    EMOM 45s/15s × 12
                  </button>
                </div>
                <span className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {formatTimerClock(hiitSecondsLeft)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (hiitPhase === 'done') {
                      setHiitCurrentRound(1);
                      setHiitPhase('work');
                      setHiitSecondsLeft(hiitWorkSec);
                    }
                    if (!hiitRunning) {
                      playTimerSetTone(preferences.soundOnTimer !== false);
                    }
                    setHiitRunning((r) => !r);
                  }}
                  className="no-touch-delay flex-1 min-h-[46px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  {hiitRunning ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause Timer</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Start HIIT Timer</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => applyHiitPreset(hiitWorkSec, hiitRestSec, hiitRounds)}
                  className="no-touch-delay min-h-[46px] px-3.5 py-2 rounded-xl hl-subtle border text-xs font-semibold"
                >
                  Reset
                </button>
              </div>
            </div>
          </ExpandableInfoDropdown>

          <ExpandableInfoDropdown
            testId="wellness-dropdown-1rm"
            title="Strength Load Estimator (1RM)"
            subtitle={`Estimate your 1-rep max and comfortable working weights (${weightUnit})`}
            summaryRight={`${oneRmStats.est1Rm} ${weightUnit}`}
            icon={<Calculator className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="block">
                  <span className="text-slate-500 dark:text-slate-400">
                    Lifted Weight ({weightUnit})
                  </span>
                  <input
                    type="number"
                    min={1}
                    step="0.5"
                    value={oneRmWeight}
                    onChange={(e) => setOneRmWeight(e.target.value)}
                    className="mt-1 w-full min-h-[42px] px-3 font-mono tabular-nums text-sm hl-input rounded-xl"
                  />
                </label>
                <label className="block">
                  <span className="text-slate-500 dark:text-slate-400">Reps Done (1–30)</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={oneRmReps}
                    onChange={(e) => setOneRmReps(e.target.value)}
                    className="mt-1 w-full min-h-[42px] px-3 font-mono tabular-nums text-sm hl-input rounded-xl"
                  />
                </label>
              </div>

              <div className="p-3.5 rounded-xl hl-subtle border flex items-baseline justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Estimated 1-Rep Max
                </span>
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {oneRmStats.est1Rm} {weightUnit}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {oneRmStats.table.map((row) => (
                  <div key={row.label} className="p-2.5 rounded-xl hl-subtle border">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{row.label}</p>
                    <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {row.load} {weightUnit}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </ExpandableInfoDropdown>

          <ExpandableInfoDropdown
            title="Barbell Plate Helper"
            subtitle="See which plates to place onto each side of your barbell"
            summaryRight={`${plateBreakdown.perSide} ${weightUnit}/side`}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="block">
                  <span className="text-slate-500 dark:text-slate-400">
                    Target Total ({weightUnit})
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="2.5"
                    value={targetBarWeight}
                    onChange={(e) => setTargetBarWeight(e.target.value)}
                    className="mt-1 w-full min-h-[42px] px-3 font-mono tabular-nums text-sm hl-input rounded-xl"
                  />
                </label>
                <label className="block">
                  <span className="text-slate-500 dark:text-slate-400">
                    Barbell Weight ({weightUnit})
                  </span>
                  <select
                    value={barbellWeight}
                    onChange={(e) => setBarbellWeight(Number(e.target.value))}
                    className="mt-1 w-full min-h-[42px] px-3 font-mono tabular-nums text-sm hl-input rounded-xl"
                  >
                    {weightUnit === 'kg' ? (
                      <>
                        <option value={20}>20 kg Standard</option>
                        <option value={15}>15 kg Lighter Bar</option>
                        <option value={10}>10 kg EZ Curl Bar</option>
                      </>
                    ) : (
                      <>
                        <option value={45}>45 lb Standard</option>
                        <option value={35}>35 lb Bar</option>
                        <option value={25}>25 lb EZ Curl Bar</option>
                      </>
                    )}
                  </select>
                </label>
              </div>

              <div className="p-3.5 rounded-xl hl-subtle border space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Load Per Side</span>
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    {plateBreakdown.perSide} {weightUnit} / side
                  </span>
                </div>
                {plateBreakdown.plates.length === 0 ? (
                  <p className="text-xs text-slate-500">Empty bar or below bar weight.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {plateBreakdown.plates.map((p) => (
                      <div
                        key={p.plate}
                        className="px-3 py-1.5 rounded-lg hl-card border text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white"
                      >
                        {p.count} × {p.plate} {weightUnit}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ExpandableInfoDropdown>

          <ExpandableInfoDropdown
            title="Comfortable Cardio Heart-Rate Zones"
            subtitle="Find your easy Zone 2 walking or steady cardio heart-rate range"
            icon={<Heart className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="block">
                  <span className="text-slate-500 dark:text-slate-400">Age (years)</span>
                  <input
                    type="number"
                    min={14}
                    max={95}
                    value={hrAge}
                    onChange={(e) => setHrAge(e.target.value)}
                    className="mt-1 w-full min-h-[42px] px-3 font-mono tabular-nums text-sm hl-input rounded-xl"
                  />
                </label>
                <label className="block">
                  <span className="text-slate-500 dark:text-slate-400">Resting HR (bpm)</span>
                  <input
                    type="number"
                    min={35}
                    max={110}
                    value={restingHr}
                    onChange={(e) => setRestingHr(e.target.value)}
                    className="mt-1 w-full min-h-[42px] px-3 font-mono tabular-nums text-sm hl-input rounded-xl"
                  />
                </label>
              </div>

              <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {hrZones.map((z) => (
                  <div key={z.zone} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{z.zone}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {z.focus}
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap shrink-0">
                      {z.range}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </ExpandableInfoDropdown>

          <ExpandableInfoDropdown
            title="Optional Body Measurements"
            subtitle="Estimate lean mass and body composition if helpful for your goals"
            summaryRight={`BMI ${bodyCompMetrics.bmi}`}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <label className="block">
                  <span className="text-slate-500">Sex</span>
                  <select
                    value={compSex}
                    onChange={(e) => setCompSex(e.target.value as BiologicalSex)}
                    className="mt-1 w-full min-h-[40px] px-2.5 hl-input rounded-lg"
                  >
                    <option value={BiologicalSex.Male}>Male</option>
                    <option value={BiologicalSex.Female}>Female</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-slate-500">Height (cm)</span>
                  <input
                    type="number"
                    value={compHeightCm}
                    onChange={(e) => setCompHeightCm(e.target.value)}
                    className="mt-1 w-full min-h-[40px] px-2.5 font-mono tabular-nums hl-input rounded-lg"
                  />
                </label>
                <label className="block">
                  <span className="text-slate-500">Weight (kg)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={compWeightKg}
                    onChange={(e) => setCompWeightKg(e.target.value)}
                    className="mt-1 w-full min-h-[40px] px-2.5 font-mono tabular-nums hl-input rounded-lg"
                  />
                </label>
                <label className="block">
                  <span className="text-slate-500">Waist (cm)</span>
                  <input
                    type="number"
                    value={compWaistCm}
                    onChange={(e) => setCompWaistCm(e.target.value)}
                    className="mt-1 w-full min-h-[40px] px-2.5 font-mono tabular-nums hl-input rounded-lg"
                  />
                </label>
                <label className="block">
                  <span className="text-slate-500">Neck (cm)</span>
                  <input
                    type="number"
                    value={compNeckCm}
                    onChange={(e) => setCompNeckCm(e.target.value)}
                    className="mt-1 w-full min-h-[40px] px-2.5 font-mono tabular-nums hl-input rounded-lg"
                  />
                </label>
                {compSex === BiologicalSex.Female && (
                  <label className="block">
                    <span className="text-slate-500">Hips (cm)</span>
                    <input
                      type="number"
                      value={compHipCm}
                      onChange={(e) => setCompHipCm(e.target.value)}
                      className="mt-1 w-full min-h-[40px] px-2.5 font-mono tabular-nums hl-input rounded-lg"
                    />
                  </label>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500">BMI</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {bodyCompMetrics.bmi}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500">Body Fat</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {bodyCompMetrics.bodyFatPct}%
                  </p>
                </div>
                <div className="p-2.5 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500">Lean Mass</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {bodyCompMetrics.leanMassKg} kg
                  </p>
                </div>
                <div className="p-2.5 rounded-xl hl-subtle border">
                  <p className="text-[11px] text-slate-500">FFMI</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {bodyCompMetrics.ffmi}
                  </p>
                </div>
              </div>
            </div>
          </ExpandableInfoDropdown>
        </div>
      )}

      {/* TAB 4: NUTRITION & CALORIES (+ INDIAN NUTRITION CATALOG) */}
      {subTab === 'nutrition' && (
        <div className="space-y-8">
          <Page4Calories
            nutritionByDate={nutritionByDate}
            goals={nutritionGoals}
            preferences={preferences}
            savedCustomMeals={savedCustomMeals}
            weeklyCompletedSetsCount={weeklyCompletedSetsCount}
            streakDays={streakDays}
            todayActive={todayActive}
            isDark={isDark}
            onSaveDailyNutrition={onSaveDailyNutrition}
            onSaveGoals={onSaveGoals}
            onSavePreferences={onSavePreferences}
            onSaveCustomMeals={onSaveCustomMeals}
          />
          <IndianNutritionSection
            onQuickLogFood={async (item) => {
              await handleQuickLogFoodOrMeal({
                ...item,
                useSelectedSlot: false,
              });
            }}
            savedCustomMeals={savedCustomMeals}
            onSaveCustomMeal={handleSaveCustomMealItem}
          />
        </div>
      )}

      <WorkoutHelpModal
        isOpen={Boolean(studioHelpTarget)}
        target={studioHelpTarget}
        exerciseLibrary={exerciseLibrary}
        landmarks={landmarks}
        onClose={() => setStudioHelpTarget(null)}
      />
    </div>
  );
};

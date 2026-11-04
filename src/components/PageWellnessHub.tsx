import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
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
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Sparkles,
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
import { ExpandableInfoDropdown } from './ExpandableInfoDropdown';
import {
  BentoCard,
  NavigationTab,
  ProgressRing,
  SearchComponent,
  Sparkline,
} from './bento/BentoDesignSystem';

const Page4Calories = lazy(() =>
  import('./Page4Calories').then((m) => ({ default: m.Page4Calories }))
);
const DailyNutritionWeightChart = lazy(() =>
  import('./DailyNutritionWeightChart').then((m) => ({ default: m.DailyNutritionWeightChart }))
);
const IndianNutritionSection = lazy(() =>
  import('./IndianNutritionSection').then((m) => ({ default: m.IndianNutritionSection }))
);
const IndianCatalogExplorerSection = lazy(() =>
  import('./IndianCatalogExplorerSection').then((m) => ({
    default: m.IndianCatalogExplorerSection,
  }))
);
const BreathingTechniquesSection = lazy(() =>
  import('./BreathingTechniquesSection').then((m) => ({
    default: m.BreathingTechniquesSection,
  }))
);

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

export const PageWellnessHub: React.FC<PageWellnessHubProps> = React.memo(({
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
  const [showWeightChartDrawer, setShowWeightChartDrawer] = useState<boolean>(false);
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
        bodyweightKg: preferences.calculatorProfile.weightKg || 70,
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

  const realWeightSparklinePoints = useMemo(() => {
    const entries = Object.values(nutritionByDate)
      .filter((rec) => Number.isFinite(rec.bodyweightKg) && rec.bodyweightKg > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7)
      .map((rec) => ({
        label: rec.date.slice(5),
        value: rec.bodyweightKg,
      }));
    if (entries.length === 0) {
      return [{ label: todayIso.slice(5), value: todayNutritionRecord.bodyweightKg }];
    }
    return entries;
  }, [nutritionByDate, todayIso, todayNutritionRecord.bodyweightKg]);

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
      ? 'Well rested • Great day for steady movement'
      : readinessScore >= 60
      ? 'Steady energy • Move at a comfortable pace & sip water'
      : 'Gentle recovery day • Favor stretching, walking, or calm breathing';

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
      {/* HORIZONTAL WELLNESS NAVIGATION MENU */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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
            className="flex w-full lg:w-auto items-center gap-1.5 p-1.5 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-slate-200/85 dark:border-slate-800 shadow-xs overflow-x-auto no-scrollbar"
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
              <NavigationTab
                key={tab.id}
                id={tab.id}
                label={tab.label}
                active={subTab === tab.id}
                testId={`wellness-subtab-${tab.id}`}
                onClick={() => setSubTab(tab.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {statusToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2 shadow-xs">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusToast}</span>
        </div>
      )}

      {/* TODAY'S BALANCE – HERO SECTION (Shown on Overview) */}
      {subTab === 'wellbeing' && (
        <BentoCard
          as="section"
          variant="hero"
          testId="wellness-daily-balance-card"
          ariaLabel="Today's Balance summary"
          className="p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Today&apos;s Balance</span>
              </div>
              <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {readinessLabel}
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                void updateWellbeingPatch({ waterMl: currentWellbeing.waterMl + 250 })
              }
              className="no-touch-delay min-h-[44px] px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>+ Add 250 ml Water</span>
            </button>
          </div>

          {/* 3 Independent Animated Circular Progress Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
            <ProgressRing
              label="Nourishment"
              consumed={todayMacroTotals.calories}
              target={nutritionGoals.targetCalories}
              unit="kcal"
              tone="orange"
              testId="hero-ring-nourishment"
            />
            <ProgressRing
              label="Protein"
              consumed={todayMacroTotals.proteinG}
              target={nutritionGoals.proteinTargetG}
              unit="g"
              tone="purple"
              testId="hero-ring-protein"
            />
            <ProgressRing
              label="Hydration"
              consumed={currentWellbeing.waterMl}
              target={hydrationGoalMl}
              unit="ml"
              tone="blue"
              testId="hero-ring-hydration"
            />
          </div>

          <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                data-testid="toggle-wellness-macro-details-btn"
                aria-expanded={showMacroDetails}
                onClick={() => setShowMacroDetails((prev) => !prev)}
                className="no-touch-delay min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/85 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
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
                className="no-touch-delay min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold text-[#2563EB] dark:text-blue-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
              >
                <span>Open Full Nutrition Log</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {showMacroDetails && (
              <div
                data-testid="wellness-macro-details-panel"
                className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs"
              >
                <div className="p-3 rounded-xl bg-white/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-slate-500 dark:text-slate-400 block">Carbs</span>
                  <span className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                    {todayMacroTotals.carbsG} / {nutritionGoals.carbsTargetG}g
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-slate-500 dark:text-slate-400 block">Healthy Fats</span>
                  <span className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                    {todayMacroTotals.fatG} / {nutritionGoals.fatTargetG}g
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-slate-500 dark:text-slate-400 block">Meals Today</span>
                  <span className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                    {todayNutritionRecord.meals.length} logged
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-slate-500 dark:text-slate-400 block">Readiness</span>
                  <span className="font-mono tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                    {readinessScore} / 100
                  </span>
                </div>
              </div>
            )}
          </div>
        </BentoCard>
      )}

      {/* BENTO BOX DASHBOARD LAYOUT (Shown on Overview) */}
      {subTab === 'wellbeing' && (
        <div
          data-testid="wellness-bento-grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-stretch"
        >
          {/* A. Meals & Fast Food – Double Width (lg:col-span-8) */}
          <BentoCard
            as="section"
            testId="wellness-dropdown-meal-slots"
            ariaLabel="Meals & Fast Food"
            className="md:col-span-2 lg:col-span-8 p-5 flex flex-col justify-between gap-4"
          >
            <div
              data-testid="wellness-meal-slots-section"
              className="space-y-4"
            >
              {/* Card Header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200/70 dark:border-orange-800/60 flex items-center justify-center text-[#F97316] shrink-0">
                    <Utensils className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                      Meals &amp; Fast Food
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Log breakfast, lunch, dinner, or search everyday foods in one place
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                    {todayNutritionRecord.meals.length} meals logged
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-orange-950/50 border border-orange-200/60 dark:border-orange-800/50 text-xs font-mono tabular-nums font-bold text-[#F97316]">
                    {todayMacroTotals.calories.toLocaleString()} kcal
                  </span>
                </div>
              </div>

              {/* Quick Action Buttons for Breakfast, Lunch (Post-Workout), Dinner, Snack + Pre-Workout */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {MEAL_TYPE_SLOTS.map((slot) => {
                  const slotMeals = todayNutritionRecord.meals.filter(
                    (m) => m.mealType === slot.type
                  );
                  const slotKcal = slotMeals.reduce((sum, m) => sum + m.calories, 0);
                  const isMenuOpen = openQuickAddMealSlot === slot.type;
                  const displayTitle =
                    slot.type === 'Post-Workout'
                      ? 'Lunch / Post'
                      : slot.type === 'Pre-Workout'
                      ? 'Pre-Workout'
                      : slot.type;

                  return (
                    <div
                      key={slot.type}
                      data-testid={`meal-slot-row-${slot.slug}`}
                      className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/75 dark:border-slate-800 flex flex-col justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {displayTitle}
                          </span>
                          {slotMeals.length > 0 && (
                            <span className="text-[10px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">
                              {slotMeals.length}×
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {slotKcal > 0 ? `${slotKcal} kcal` : slot.subtitle}
                        </p>
                      </div>

                      <button
                        type="button"
                        data-testid={`quick-add-btn-${slot.slug}`}
                        aria-haspopup="dialog"
                        aria-expanded={isMenuOpen}
                        onClick={() => {
                          setQuickAddModalSearch('');
                          setOpenQuickAddMealSlot((prev) =>
                            prev === slot.type ? null : slot.type
                          );
                        }}
                        className="no-touch-delay w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span>Quick Add</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Embedded Quick Food Lookup Search inside Meals & Fast Food Card */}
              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                  <div className="sm:col-span-7">
                    <SearchComponent
                      value={quickFoodQuery}
                      onChange={setQuickFoodQuery}
                      placeholder="Quick lookup (oats, eggs, chicken wrap, rice, banana)…"
                      ariaLabel="Quick lookup food or meal"
                      testId="bento-meals-food-search-input"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <select
                      aria-label="Quick log meal slot"
                      value={quickMealSlot}
                      onChange={(e) => setQuickMealSlot(e.target.value as MealEntry['mealType'])}
                      className="w-full min-h-[42px] px-2.5 text-xs font-semibold hl-input rounded-xl"
                    >
                      <option value="Breakfast">Breakfast</option>
                      <option value="Pre-Workout">Pre-Workout</option>
                      <option value="Post-Workout">Lunch / Post-Workout</option>
                      <option value="Dinner">Dinner</option>
                      <option value="Snack">Snack</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <select
                      aria-label="Serving size multiplier"
                      value={quickServingMultiplier}
                      onChange={(e) => setQuickServingMultiplier(Number(e.target.value) || 1)}
                      className="w-full min-h-[42px] px-2 text-xs font-mono tabular-nums font-semibold hl-input rounded-xl"
                    >
                      <option value={0.5}>0.5×</option>
                      <option value={1}>1×</option>
                      <option value={1.5}>1.5×</option>
                      <option value={2}>2×</option>
                    </select>
                  </div>
                </div>

                {/* Compact Live Food Results Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-0.5">
                  {filteredQuickResults.saved.slice(0, 4).map((meal) => {
                    const scaledKcal = Math.round(meal.calories * quickServingMultiplier);
                    const scaledP = Math.round(meal.proteinG * quickServingMultiplier);
                    return (
                      <div
                        key={meal.id}
                        data-testid={`quick-saved-meal-${meal.id}`}
                        className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/75 dark:border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {meal.name}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {scaledKcal} kcal · {scaledP}g P
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
                          className="no-touch-delay min-h-[34px] px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold shrink-0 inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add</span>
                        </button>
                      </div>
                    );
                  })}

                  {filteredQuickResults.common.slice(0, 4).map((food) => {
                    const scaledKcal = Math.round(food.calories * quickServingMultiplier);
                    const scaledP = Math.round(food.proteinG * quickServingMultiplier);
                    return (
                      <div
                        key={food.id}
                        data-testid={`quick-common-food-${food.id}`}
                        className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/75 dark:border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {food.name}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {scaledKcal} kcal · {scaledP}g P
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
                          className="no-touch-delay min-h-[34px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-slate-800 dark:text-slate-100 text-xs font-semibold shrink-0 inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add</span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Progressive Disclosure Dictionary Filter (Preserves UPG-09 hidden input invariant) */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setIsQuickSearchExpanded((prev) => !prev)}
                    aria-expanded={isQuickSearchExpanded}
                    className="no-touch-delay text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 inline-flex items-center gap-1"
                  >
                    <span>
                      {isQuickSearchExpanded
                        ? 'Hide Advanced Dictionary Filter'
                        : `Filter all ${COMMON_FOOD_LOOKUP_LIST.length} foods & ${savedCustomMeals.length} saved meals`}
                    </span>
                    {isQuickSearchExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>

                  {isQuickSearchExpanded && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        data-testid="wellness-food-search-input"
                        aria-label="Search saved custom meals and common food items"
                        value={quickFoodQuery}
                        onChange={(e) => setQuickFoodQuery(e.target.value)}
                        placeholder="Filter full food dictionary…"
                        className="flex-1 min-w-[180px] min-h-[38px] px-3 py-1.5 text-xs hl-input rounded-xl"
                      />
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
                          className={`no-touch-delay min-h-[36px] px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                            quickSourceFilter === opt.id
                              ? 'bg-[#2563EB] text-white'
                              : 'hl-subtle border text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </BentoCard>

          {/* B. Indian Home Meals (lg:col-span-4) */}
          <BentoCard
            as="article"
            interactive
            testId="wellness-bento-indian-meals"
            ariaLabel="Indian Home Meals – 8 video styles"
            onClick={() => setSubTab('indian')}
            className="md:col-span-1 lg:col-span-4 p-5 flex flex-col justify-between gap-4"
          >
            <div className="space-y-3.5">
              {/* High-quality visual dish preview thumbnail */}
              <div className="relative h-36 w-full rounded-xl overflow-hidden bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-rose-500/20 border border-orange-200/70 dark:border-orange-900/50 flex items-center justify-between px-4">
                <div className="space-y-1 z-10 max-w-[62%]">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/90 dark:bg-slate-900/90 text-[11px] font-bold text-orange-600 dark:text-orange-400 shadow-2xs">
                    8 video styles
                  </span>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-snug pt-1">
                    Dal Tadka, Paneer Tikka, Rotis, Idli &amp; Regional Thalis
                  </p>
                </div>

                {/* Illustrated Brass Thali Bowl Visual */}
                <svg
                  viewBox="0 0 96 96"
                  className="w-24 h-24 shrink-0 drop-shadow-sm"
                  aria-hidden="true"
                >
                  <circle cx="48" cy="48" r="42" fill="#FFF7ED" stroke="#F97316" strokeWidth="2.5" />
                  <circle cx="48" cy="48" r="35" fill="#FFEDD5" />
                  <circle cx="35" cy="36" r="11" fill="#EA580C" />
                  <circle cx="35" cy="36" r="7" fill="#FB923C" />
                  <circle cx="60" cy="36" r="10" fill="#16A34A" />
                  <circle cx="60" cy="36" r="6" fill="#4ADE80" />
                  <ellipse cx="48" cy="61" rx="18" ry="11" fill="#FDE68A" stroke="#D97706" strokeWidth="1.5" />
                  <circle cx="44" cy="59" r="1.5" fill="#78350F" />
                  <circle cx="53" cy="62" r="1.5" fill="#78350F" />
                </svg>
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Indian Home Meals
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Authentic macro-calculated dals, curries, rotis, and step-by-step recipe videos.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/75 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                8 video styles
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSubTab('indian');
                }}
                className="no-touch-delay min-h-[36px] px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold inline-flex items-center gap-1 transition-colors"
              >
                <span>Explore</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </BentoCard>

          {/* C. Weight & Hydration Trend (lg:col-span-5) */}
          <BentoCard
            as="section"
            testId="wellness-dropdown-hydration"
            ariaLabel="Hydration & Weight Trend"
            className="md:col-span-1 lg:col-span-5 p-5 flex flex-col justify-between gap-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200/70 dark:border-sky-800/60 flex items-center justify-center text-[#0EA5E9] shrink-0">
                    <Droplets className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                      Hydration &amp; Weight Trend
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {currentWellbeing.waterMl.toLocaleString()} / {hydrationGoalMl.toLocaleString()} ml water
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200/60 dark:border-sky-800/60 text-xs font-mono tabular-nums font-bold text-[#0EA5E9]">
                  {todayNutritionRecord.bodyweightKg} {nutritionGoals.weightUnit}
                </span>
              </div>

              {/* Smooth SVG Line Sparkline from Real Logged Data */}
              <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/75 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Weekly Progress</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                    {realWeightSparklinePoints.length} check-in
                    {realWeightSparklinePoints.length === 1 ? '' : 's'}
                  </span>
                </div>
                <Sparkline
                  points={realWeightSparklinePoints}
                  stroke="#0EA5E9"
                  fillId="bento-hydration-weight-grad"
                  ariaLabel="Hydration and bodyweight weekly sparkline"
                />
              </div>
            </div>

            {/* Quick Hydration Controls */}
            <div className="pt-2 border-t border-slate-200/75 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      void updateWellbeingPatch({
                        waterMl: Math.max(0, currentWellbeing.waterMl - 250),
                      })
                    }
                    className="no-touch-delay min-h-[36px] px-2.5 py-1 rounded-lg hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1"
                  >
                    <Minus className="w-3 h-3" />
                    <span>250ml</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void updateWellbeingPatch({ waterMl: currentWellbeing.waterMl + 250 })
                    }
                    className="no-touch-delay min-h-[36px] px-3 py-1 rounded-lg bg-[#0EA5E9] hover:bg-sky-600 text-white text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>250ml</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void updateWellbeingPatch({ waterMl: currentWellbeing.waterMl + 500 })
                    }
                    className="no-touch-delay min-h-[36px] px-3 py-1 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>500ml</span>
                  </button>
                </div>

                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Goal</span>
                  <input
                    type="number"
                    min={1000}
                    max={7000}
                    step={250}
                    value={hydrationGoalMl}
                    onChange={(e) =>
                      void handleUpdateHydrationGoalMl(Number(e.target.value) || 2800)
                    }
                    className="w-16 min-h-[34px] px-1.5 text-center font-mono tabular-nums text-xs hl-input rounded-lg"
                  />
                </label>
              </div>
            </div>
          </BentoCard>

          {/* D. Weight Status (lg:col-span-3) */}
          <BentoCard
            as="section"
            testId="wellness-bento-weight-status"
            ariaLabel="Weight Status"
            className="md:col-span-1 lg:col-span-3 p-5 flex flex-col justify-between gap-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-200/70 dark:border-violet-800/60 flex items-center justify-center text-[#7C3AED]">
                  <Scale className="w-4 h-4" />
                </div>
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  On Track
                </span>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Weight Status
                </p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                  {todayNutritionRecord.bodyweightKg}{' '}
                  <span className="text-sm font-normal text-slate-500">
                    {nutritionGoals.weightUnit}
                  </span>
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/75 dark:border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => setShowWeightChartDrawer((prev) => !prev)}
                className="no-touch-delay w-full min-h-[36px] px-3 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-violet-400 transition-colors flex items-center justify-between"
              >
                <span>{showWeightChartDrawer ? 'Hide Weight Log' : 'Update / Full Trend'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </BentoCard>

          {/* E. Calm & Breathing (lg:col-span-4) */}
          <BentoCard
            as="section"
            interactive
            testId="wellness-dropdown-breathwork"
            ariaLabel="Calm & Breathing"
            onClick={() => setSubTab('breathing')}
            className="md:col-span-1 lg:col-span-4 p-5 flex flex-col justify-between gap-4"
          >
            <div data-testid="guided-breathwork-card" className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200/70 dark:border-teal-800/60 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
                  <Wind className="w-4 h-4" />
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-800/60 text-xs font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
                  Readiness {readinessScore}/100
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Calm &amp; Breathing
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Unwind with gentle box, 4-7-8, or coherent breathing and ocean or rain soundscapes.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/75 dark:border-slate-800 flex items-center justify-between gap-2">
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {currentWellbeing.breathworkMinutes}m logged today
              </span>
              <button
                type="button"
                data-testid="open-breathing-studio-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setSubTab('breathing');
                }}
                className="no-touch-delay min-h-[38px] px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
              >
                <span>Breathing</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </BentoCard>

          {/* F. Sleep & Calm – Large Card (lg:col-span-8) */}
          <BentoCard
            as="section"
            variant="sleep"
            testId="wellness-bento-sleep-calm"
            ariaLabel="Sleep & Calm"
            className="md:col-span-2 lg:col-span-8 p-5 sm:p-6 flex flex-col justify-between gap-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  <Moon className="w-3.5 h-3.5" />
                  <span>Sleep &amp; Calm</span>
                </div>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {currentWellbeing.sleepHours.toFixed(1)} hrs
                  </span>
                  <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">
                    Steady energy
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Restorative overnight recovery supports comfortable training and calm focus.
                </p>
              </div>

              {/* Circular Readiness Score with Heart Icon */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/85 dark:bg-slate-900/75 border border-indigo-200/70 dark:border-indigo-900/60 shrink-0">
                <div className="relative w-14 h-14 flex items-center justify-center">
                  <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
                    <circle
                      cx="28"
                      cy="28"
                      r="23"
                      fill="none"
                      stroke="rgba(99, 102, 241, 0.16)"
                      strokeWidth="5"
                    />
                    <circle
                      cx="28"
                      cy="28"
                      r="23"
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 23}
                      strokeDashoffset={
                        2 * Math.PI * 23 * (1 - Math.min(100, Math.max(0, readinessScore)) / 100)
                      }
                    />
                  </svg>
                  <Heart className="w-4 h-4 text-emerald-600 dark:text-emerald-400 absolute" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Readiness
                  </span>
                  <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {readinessScore}/100
                  </span>
                </div>
              </div>
            </div>

            {/* Subtle Animated Energy Wave */}
            <div className="relative h-10 w-full overflow-hidden rounded-xl bg-white/60 dark:bg-slate-900/50 border border-indigo-200/50 dark:border-slate-800 flex items-center px-3">
              <svg
                viewBox="0 0 400 32"
                preserveAspectRatio="none"
                className="w-full h-6 bento-energy-wave"
                aria-hidden="true"
              >
                <path
                  d="M0 16 Q 50 4, 100 16 T 200 16 T 300 16 T 400 16"
                  fill="none"
                  stroke="#6366F1"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M0 20 Q 50 10, 100 20 T 200 20 T 300 20 T 400 20"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="1.5"
                  strokeOpacity="0.55"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* Interactive Sleep Duration Slider */}
            <label className="block space-y-1.5 text-xs pt-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Adjust Hours Slept Last Night
                </span>
                <span className="font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
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
                className="w-full accent-[#2563EB]"
              />
            </label>
          </BentoCard>

          {/* G. Sleep & Energy (lg:col-span-4) */}
          <BentoCard
            as="section"
            testId="wellness-bento-sleep-energy"
            ariaLabel="Sleep & Energy"
            className="md:col-span-1 lg:col-span-4 p-5 flex flex-col justify-between gap-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/70 dark:border-emerald-800/60 flex items-center justify-center text-[#10B981]">
                  <Moon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                    Sleep &amp; Energy
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Quality {currentWellbeing.sleepQuality}/5 · Energy {currentWellbeing.energyLevel}/5
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Sleep Quality
                  </span>
                  <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                    {currentWellbeing.sleepQuality}/5
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {([1, 2, 3, 4, 5] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => void updateWellbeingPatch({ sleepQuality: n })}
                      className={`no-touch-delay min-h-[34px] rounded-lg font-mono tabular-nums text-xs font-semibold transition-colors ${
                        currentWellbeing.sleepQuality === n
                          ? 'bg-[#2563EB] text-white'
                          : 'hl-subtle border text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Energy Status
                  </span>
                  <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                    {currentWellbeing.energyLevel}/5
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {([1, 2, 3, 4, 5] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => void updateWellbeingPatch({ energyLevel: n })}
                      className={`no-touch-delay min-h-[34px] rounded-lg font-mono tabular-nums text-xs font-semibold transition-colors ${
                        currentWellbeing.energyLevel === n
                          ? 'bg-[#10B981] text-white'
                          : 'hl-subtle border text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Calm / Stress (1 Calm – 5 Busy)
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
                      className={`no-touch-delay min-h-[34px] rounded-lg font-mono tabular-nums text-xs font-semibold transition-colors ${
                        currentWellbeing.stressLevel === n
                          ? 'bg-[#2563EB] text-white'
                          : 'hl-subtle border text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </BentoCard>
        </div>
      )}

      {/* OPTIONAL MULTI-DAY WEIGHT & CALORIE TREND DRAWER (Toggled from Weight Status Bento Card) */}
      {subTab === 'wellbeing' && showWeightChartDrawer && (
        <BentoCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Multi-Day Weight &amp; Nourishment Check-In
            </h3>
            <button
              type="button"
              onClick={() => setShowWeightChartDrawer(false)}
              className="no-touch-delay min-h-[34px] px-2.5 py-1 rounded-lg hl-subtle border text-xs font-semibold text-slate-600 dark:text-slate-300"
            >
              Close
            </button>
          </div>
          <Suspense fallback={null}>
            <DailyNutritionWeightChart
              nutritionByDate={nutritionByDate}
              nutritionGoals={nutritionGoals}
              todayIso={todayIso}
              isDark={isDark}
              onUpdateTodayBodyweight={handleUpdateTodayBodyweight}
              onSaveWeightForDate={handleSaveWeightForDate}
            />
          </Suspense>
        </BentoCard>
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
        <Suspense fallback={null}>
          <BreathingTechniquesSection
            currentStressLevel={currentWellbeing.stressLevel}
            todayBreathworkMinutes={currentWellbeing.breathworkMinutes}
            soundEnabledByDefault={preferences.soundOnTimer !== false}
            onCompleteBreathworkMinutes={handleCompleteBreathworkMinutes}
          />
        </Suspense>
      )}

      {/* CURATED INDIAN RECIPE CATALOG SEARCH & MACRO LOGGING (Open on Indian Tab) */}
      {subTab === 'indian' && (
        <Suspense fallback={null}>
          <IndianCatalogExplorerSection
            onAddRecipeToDailyLog={async (item) => {
              await handleQuickLogFoodOrMeal({
                ...item,
                useSelectedSlot: false,
              });
            }}
          />
        </Suspense>
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
          <Suspense fallback={null}>
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
          </Suspense>
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
        <Suspense fallback={null}>
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
        </Suspense>
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
});
PageWellnessHub.displayName = 'PageWellnessHub';

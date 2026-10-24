import React, { useMemo, useState } from 'react';
import {
  ActivityLevel,
  AppPreferences,
  BiologicalSex,
  CalorieCalculatorProfile,
  DailyNutritionRecord,
  MealEntry,
  NutritionGoals,
  NutritionPhase,
  OfflineFoodItem,
  SavedCustomMeal,
} from '../types/workout';
import { PRESET_HYPERTROPHY_MEALS } from '../data/rpPlanData';
import {
  ACTIVITY_LEVEL_META,
  autoCalculateCaloriesFromMacros,
  computeFoodItemMacros,
  computeOfflineCalorieTargets,
  OFFLINE_FOOD_CATALOG,
} from '../data/offlineFoodCatalog';
import { getTodayISO } from '../db/localStore';
import {
  BookmarkPlus,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';

interface Page4CaloriesProps {
  nutritionByDate: Record<string, DailyNutritionRecord>;
  goals: NutritionGoals;
  preferences: AppPreferences;
  savedCustomMeals: SavedCustomMeal[];
  weeklyCompletedSetsCount: number;
  isDark?: boolean;
  onSaveDailyNutrition: (record: DailyNutritionRecord, addedMeal?: MealEntry) => Promise<void>;
  onSaveGoals: (goals: NutritionGoals) => Promise<void>;
  onSavePreferences: (prefs: AppPreferences) => Promise<void>;
  onSaveCustomMeals: (meals: SavedCustomMeal[]) => Promise<void>;
}

interface SelectedFoodIngredient {
  uid: string;
  food: OfflineFoodItem;
  grams: number;
}

const FOOD_CATEGORIES: Array<'All' | OfflineFoodItem['category']> = [
  'All',
  'Protein',
  'Carbs & Grains',
  'Dairy & Shakes',
  'Healthy Fats',
  'Fruit & Veg',
];

function getLastDaysISO(count: number): Array<{ iso: string; shortDay: string; dayNum: string }> {
  const list: Array<{ iso: string; shortDay: string; dayNum: string }> = [];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    list.push({
      iso: `${y}-${m}-${dayStr}`,
      shortDay: i === 0 ? 'Today' : days[d.getDay()],
      dayNum: dayStr,
    });
  }
  return list;
}

export const Page4Calories: React.FC<Page4CaloriesProps> = ({
  nutritionByDate,
  goals,
  preferences,
  savedCustomMeals,
  weeklyCompletedSetsCount,
  isDark = false,
  onSaveDailyNutrition,
  onSaveGoals,
  onSavePreferences,
  onSaveCustomMeals,
}) => {
  const todayIso = getTodayISO();
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  // Offline Calorie Calculator State
  const [isCalcExpanded, setIsCalcExpanded] = useState<boolean>(false);
  const [calcProfile, setCalcProfile] = useState<CalorieCalculatorProfile>(
    preferences.calculatorProfile
  );
  const [calcAppliedBanner, setCalcAppliedBanner] = useState<boolean>(false);

  // Redesigned Offline Custom Meal Builder State
  const [mealType, setMealType] = useState<MealEntry['mealType']>('Post-Workout');
  const [mealName, setMealName] = useState<string>('');
  const [foodSearch, setFoodSearch] = useState<string>('');
  const [foodCategory, setFoodCategory] = useState<'All' | OfflineFoodItem['category']>('All');
  const [ingredients, setIngredients] = useState<SelectedFoodIngredient[]>([]);

  // Extra / Direct Macro Grams (summed with food ingredients or entered standalone)
  const [directProteinG, setDirectProteinG] = useState<string>('');
  const [directCarbsG, setDirectCarbsG] = useState<string>('');
  const [directFatG, setDirectFatG] = useState<string>('');
  const [manualKcalOverride, setManualKcalOverride] = useState<string>('');
  const [useManualKcal, setUseManualKcal] = useState<boolean>(false);
  const [savedPresetToast, setSavedPresetToast] = useState<string | null>(null);

  const recentDates = useMemo(() => getLastDaysISO(5), []);

  const currentRecord: DailyNutritionRecord = nutritionByDate[selectedDate] ?? {
    date: selectedDate,
    bodyweightKg: calcProfile.weightKg || 82.7,
    stepsCount: 8000,
    meals: [],
  };

  const totals = useMemo(() => {
    return currentRecord.meals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        proteinG: acc.proteinG + m.proteinG,
        carbsG: acc.carbsG + m.carbsG,
        fatG: acc.fatG + m.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    );
  }, [currentRecord]);

  const estimatedBurn = useMemo(() => {
    const stepBonus = Math.round(Math.max(0, currentRecord.stepsCount - 6000) * 0.035);
    const liftingAvgDaily = Math.round((weeklyCompletedSetsCount * 16.5) / 7);
    return goals.baseTdeeKcal + stepBonus + liftingAvgDaily;
  }, [goals.baseTdeeKcal, currentRecord.stepsCount, weeklyCompletedSetsCount]);

  // Live Offline Calculator Output (Mifflin-St Jeor + Activity + Goal)
  const calcResult = useMemo(
    () => computeOfflineCalorieTargets(calcProfile),
    [calcProfile]
  );

  // Filtered Offline Food Library
  const filteredFoods = useMemo(() => {
    const q = foodSearch.trim().toLowerCase();
    return OFFLINE_FOOD_CATALOG.filter((f) => {
      if (foodCategory !== 'All' && f.category !== foodCategory) return false;
      if (q && !f.name.toLowerCase().includes(q) && !f.category.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [foodSearch, foodCategory]);

  // Combined Meal Macros + Live Offline Calorie Auto-Calculation (4*P + 4*C + 9*F)
  const composedMealTotals = useMemo(() => {
    let ingP = 0;
    let ingC = 0;
    let ingF = 0;
    for (const item of ingredients) {
      const m = computeFoodItemMacros(item.food, item.grams);
      ingP += m.proteinG;
      ingC += m.carbsG;
      ingF += m.fatG;
    }
    const extraP = Math.max(0, Number(directProteinG) || 0);
    const extraC = Math.max(0, Number(directCarbsG) || 0);
    const extraF = Math.max(0, Number(directFatG) || 0);

    const totalProteinG = Math.round(ingP + extraP);
    const totalCarbsG = Math.round(ingC + extraC);
    const totalFatG = Math.round(ingF + extraF);
    const autoCalories = autoCalculateCaloriesFromMacros(
      ingP + extraP,
      ingC + extraC,
      ingF + extraF
    );

    const finalCalories =
      useManualKcal && manualKcalOverride !== ''
        ? Math.max(0, Math.round(Number(manualKcalOverride) || 0))
        : autoCalories;

    return {
      proteinG: totalProteinG,
      carbsG: totalCarbsG,
      fatG: totalFatG,
      autoCalories,
      finalCalories,
    };
  }, [ingredients, directProteinG, directCarbsG, directFatG, useManualKcal, manualKcalOverride]);

  const effectiveMealTitle = useMemo(() => {
    if (mealName.trim()) return mealName.trim();
    if (ingredients.length > 0) {
      return ingredients
        .map((i) => `${i.food.name.split(' (')[0]} (${i.grams}g)`)
        .join(' + ');
    }
    return '';
  }, [mealName, ingredients]);

  const handlePhaseChange = async (phase: NutritionPhase) => {
    const nextProfile = { ...calcProfile, phase };
    setCalcProfile(nextProfile);
    const computed = computeOfflineCalorieTargets(nextProfile);
    await onSavePreferences({ ...preferences, calculatorProfile: nextProfile });
    await onSaveGoals({
      ...goals,
      phase,
      baseTdeeKcal: computed.tdeeKcal,
      targetCalories: computed.targetCalories,
      proteinTargetG: computed.proteinTargetG,
      carbsTargetG: computed.carbsTargetG,
      fatTargetG: computed.fatTargetG,
    });
  };

  const handleApplyCalculatorTargets = async () => {
    await onSavePreferences({
      ...preferences,
      calculatorProfile: calcProfile,
    });
    await onSaveGoals({
      ...goals,
      phase: calcProfile.phase,
      baseTdeeKcal: calcResult.tdeeKcal,
      targetCalories: calcResult.targetCalories,
      proteinTargetG: calcResult.proteinTargetG,
      carbsTargetG: calcResult.carbsTargetG,
      fatTargetG: calcResult.fatTargetG,
    });
    setCalcAppliedBanner(true);
    window.setTimeout(() => setCalcAppliedBanner(false), 3500);
  };

  const handleAddFoodIngredient = (food: OfflineFoodItem) => {
    setIngredients((prev) => {
      const existingIdx = prev.findIndex((p) => p.food.id === food.id);
      if (existingIdx !== -1) {
        const copy = [...prev];
        copy[existingIdx] = {
          ...copy[existingIdx],
          grams: copy[existingIdx].grams + Math.round(food.defaultServingG / 2),
        };
        return copy;
      }
      return [
        ...prev,
        {
          uid: `ing_${food.id}_${Date.now()}`,
          food,
          grams: food.defaultServingG,
        },
      ];
    });
  };

  const handleUpdateIngredientGrams = (uid: string, grams: number) => {
    setIngredients((prev) =>
      prev.map((item) =>
        item.uid === uid ? { ...item, grams: Math.max(0, Math.min(2000, grams)) } : item
      )
    );
  };

  const handleRemoveIngredient = (uid: string) => {
    setIngredients((prev) => prev.filter((item) => item.uid !== uid));
  };

  const resetCustomBuilder = () => {
    setMealName('');
    setIngredients([]);
    setDirectProteinG('');
    setDirectCarbsG('');
    setDirectFatG('');
    setManualKcalOverride('');
    setUseManualKcal(false);
  };

  const handleAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = effectiveMealTitle || `${mealType} Custom Macros`;
    if (composedMealTotals.finalCalories <= 0) return;

    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    const entry: MealEntry = {
      id: `meal_${Date.now()}`,
      date: selectedDate,
      mealType,
      name: finalName,
      calories: composedMealTotals.finalCalories,
      proteinG: composedMealTotals.proteinG,
      carbsG: composedMealTotals.carbsG,
      fatG: composedMealTotals.fatG,
      loggedAt: hhmm,
    };

    await onSaveDailyNutrition(
      {
        ...currentRecord,
        meals: [...currentRecord.meals, entry],
      },
      entry
    );

    resetCustomBuilder();
  };

  const handleSaveAsCustomPreset = async () => {
    const finalName = effectiveMealTitle || `${mealType} Custom Meal`;
    if (composedMealTotals.finalCalories <= 0) return;

    const preset: SavedCustomMeal = {
      id: `cmeal_${Date.now()}`,
      mealType,
      name: finalName,
      calories: composedMealTotals.finalCalories,
      proteinG: composedMealTotals.proteinG,
      carbsG: composedMealTotals.carbsG,
      fatG: composedMealTotals.fatG,
      ingredientsSummary:
        ingredients.length > 0
          ? ingredients.map((i) => `${i.grams}g ${i.food.name.split(' (')[0]}`).join(', ')
          : undefined,
    };

    await onSaveCustomMeals([preset, ...savedCustomMeals]);
    setSavedPresetToast(`Saved "${finalName}" to offline presets.`);
    window.setTimeout(() => setSavedPresetToast(null), 3500);
  };

  const handleQuickAddPreset = async (preset: {
    mealType: MealEntry['mealType'];
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }) => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    const entry: MealEntry = {
      id: `meal_${Date.now()}`,
      date: selectedDate,
      mealType: preset.mealType,
      name: preset.name,
      calories: preset.calories,
      proteinG: preset.proteinG,
      carbsG: preset.carbsG,
      fatG: preset.fatG,
      loggedAt: hhmm,
    };

    await onSaveDailyNutrition(
      {
        ...currentRecord,
        meals: [...currentRecord.meals, entry],
      },
      entry
    );
  };

  const handleDeleteSavedPreset = async (id: string) => {
    await onSaveCustomMeals(savedCustomMeals.filter((m) => m.id !== id));
  };

  const handleDeleteMeal = async (mealId: string) => {
    await onSaveDailyNutrition({
      ...currentRecord,
      meals: currentRecord.meals.filter((m) => m.id !== mealId),
    });
  };

  const calPct = Math.min(
    100,
    Math.round((totals.calories / Math.max(1, goals.targetCalories)) * 100)
  );
  const ringRadius = 46;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (calPct / 100) * ringCircumference;

  const displayWeightInput =
    goals.weightUnit === 'lb'
      ? Math.round(calcProfile.weightKg * 2.20462 * 10) / 10
      : Math.round(calcProfile.weightKg * 10) / 10;

  return (
    <div className="space-y-6">
      {/* Header & Diet Phase Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Calories &amp; Macronutrients
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Offline BMR/TDEE target calculator, whole-food gram scaler, and auto-calculated macro meal logger
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCalcExpanded((prev) => !prev)}
            className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition-colors flex items-center gap-1.5 ${
              isCalcExpanded
                ? 'bg-blue-600 text-white border-blue-600'
                : 'hl-card text-slate-800 dark:text-slate-100 hover:border-blue-500'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Calorie Calculator</span>
            {isCalcExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800/90 overflow-x-auto no-scrollbar">
            {(
              [
                { id: NutritionPhase.LeanMass, label: 'Massing (+300)' },
                { id: NutritionPhase.Maintenance, label: 'Maintenance' },
                { id: NutritionPhase.MiniCut, label: 'Mini-Cut (-500)' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePhaseChange(p.id)}
                className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  goals.phase === p.id
                    ? 'bg-slate-900 dark:bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 100% Offline Calorie & Macro Calculator Panel */}
      {isCalcExpanded && (
        <section className="hl-card rounded-2xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Offline Calorie &amp; Hypertrophy Macro Calculator
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mifflin-St Jeor equation calibrated by weight, height, age, sex, activity multiplier, and training goal
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              100% Offline Formula
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Weight */}
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Weight ({goals.weightUnit})
              </span>
              <input
                type="number"
                step="0.5"
                min="35"
                max="500"
                value={displayWeightInput}
                onChange={(e) => {
                  const raw = Number(e.target.value) || 0;
                  const kg = goals.weightUnit === 'lb' ? raw / 2.20462 : raw;
                  setCalcProfile((prev) => ({ ...prev, weightKg: Math.max(30, kg) }));
                }}
                className="mt-1 w-full min-h-[42px] px-3 py-1.5 text-sm font-mono tabular-nums font-semibold hl-input rounded-xl"
              />
            </label>

            {/* Height */}
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Height (cm)
              </span>
              <input
                type="number"
                step="1"
                min="120"
                max="230"
                value={calcProfile.heightCm}
                onChange={(e) =>
                  setCalcProfile((prev) => ({
                    ...prev,
                    heightCm: Math.max(120, Math.min(230, Number(e.target.value) || 175)),
                  }))
                }
                className="mt-1 w-full min-h-[42px] px-3 py-1.5 text-sm font-mono tabular-nums font-semibold hl-input rounded-xl"
              />
            </label>

            {/* Age */}
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Age (years)
              </span>
              <input
                type="number"
                step="1"
                min="14"
                max="95"
                value={calcProfile.ageYears}
                onChange={(e) =>
                  setCalcProfile((prev) => ({
                    ...prev,
                    ageYears: Math.max(14, Math.min(95, Number(e.target.value) || 28)),
                  }))
                }
                className="mt-1 w-full min-h-[42px] px-3 py-1.5 text-sm font-mono tabular-nums font-semibold hl-input rounded-xl"
              />
            </label>

            {/* Biological Sex */}
            <div className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300 block">
                Biological Sex
              </span>
              <div className="mt-1 grid grid-cols-2 gap-1 p-1 rounded-xl hl-subtle border min-h-[42px]">
                {(
                  [
                    { id: BiologicalSex.Male, label: 'Male' },
                    { id: BiologicalSex.Female, label: 'Female' },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCalcProfile((prev) => ({ ...prev, sex: s.id }))}
                    className={`text-xs font-semibold rounded-lg transition-colors ${
                      calcProfile.sex === s.id
                        ? 'bg-slate-900 dark:bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Activity Level */}
            <label className="block col-span-2 sm:col-span-1 lg:col-span-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Activity
              </span>
              <select
                value={calcProfile.activity}
                onChange={(e) =>
                  setCalcProfile((prev) => ({
                    ...prev,
                    activity: e.target.value as ActivityLevel,
                  }))
                }
                className="mt-1 w-full min-h-[42px] px-2.5 py-1.5 text-xs font-semibold hl-input rounded-xl"
              >
                {Object.entries(ACTIVITY_LEVEL_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.shortLabel} (×{meta.multiplier})
                  </option>
                ))}
              </select>
            </label>

            {/* Goal Phase */}
            <label className="block col-span-2 sm:col-span-1 lg:col-span-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Goal Phase
              </span>
              <select
                value={calcProfile.phase}
                onChange={(e) =>
                  setCalcProfile((prev) => ({
                    ...prev,
                    phase: e.target.value as NutritionPhase,
                  }))
                }
                className="mt-1 w-full min-h-[42px] px-2.5 py-1.5 text-xs font-semibold hl-input rounded-xl"
              >
                <option value={NutritionPhase.LeanMass}>Lean Mass (+300)</option>
                <option value={NutritionPhase.Maintenance}>Maintenance (0)</option>
                <option value={NutritionPhase.MiniCut}>Mini-Cut (-500)</option>
              </select>
            </label>
          </div>

          {/* Calculated Readout Bar & Apply Button */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1">
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Resting BMR</div>
                <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {calcResult.bmrKcal.toLocaleString()} kcal
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Est. TDEE</div>
                <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {calcResult.tdeeKcal.toLocaleString()} kcal
                </div>
              </div>
              <div>
                <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                  Daily Target
                </div>
                <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
                  {calcResult.targetCalories.toLocaleString()} kcal
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Recommended Macros
                </div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {calcResult.proteinTargetG}g P · {calcResult.carbsTargetG}g C ·{' '}
                  {calcResult.fatTargetG}g F
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleApplyCalculatorTargets}
              className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shrink-0"
            >
              {calcAppliedBanner ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Targets Applied</span>
                </>
              ) : (
                <span>Apply Calculated Targets</span>
              )}
            </button>
          </div>
        </section>
      )}

      {/* Horizontal Date Scroller */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
        {recentDates.map((d) => {
          const isSelected = d.iso === selectedDate;
          const dayRec = nutritionByDate[d.iso];
          const dayKcal = dayRec ? dayRec.meals.reduce((s, m) => s + m.calories, 0) : 0;

          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => setSelectedDate(d.iso)}
              className={`min-h-[54px] px-4 py-2 rounded-xl border text-left transition-colors shrink-0 ${
                isSelected
                  ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-500'
                  : 'hl-card text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <div className="text-xs font-bold whitespace-nowrap">
                {d.shortDay} · {d.dayNum}
              </div>
              <div
                className={`text-[11px] font-mono tabular-nums mt-0.5 whitespace-nowrap ${
                  isSelected
                    ? 'text-slate-200 dark:text-blue-100'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {dayKcal.toLocaleString()} kcal
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Energy Ring + Logged Meals + Saved/Built-in Presets */}
        <div className="lg:col-span-6 space-y-6">
          <div className="hl-card rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 112 112">
                    <circle
                      cx="56"
                      cy="56"
                      r={ringRadius}
                      stroke={isDark ? '#1E293B' : '#E2E8F0'}
                      strokeWidth="10"
                      fill="none"
                    />
                    <circle
                      cx="56"
                      cy="56"
                      r={ringRadius}
                      stroke="#3B82F6"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      fill="none"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {calPct}%
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">Target</span>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Daily Energy Intake</p>
                  <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {totals.calories.toLocaleString()}
                    <span className="text-sm sm:text-base font-normal text-slate-400 dark:text-slate-500">
                      {' '}
                      / {goals.targetCalories.toLocaleString()} kcal
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                    Remaining:{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {Math.max(0, goals.targetCalories - totals.calories).toLocaleString()} kcal
                    </strong>{' '}
                    · Est. Burn {estimatedBurn.toLocaleString()} kcal
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              {[
                {
                  label: 'Protein',
                  current: Math.round(totals.proteinG),
                  target: goals.proteinTargetG,
                  color: 'bg-blue-600 dark:bg-blue-500',
                  note: 'Muscle protein synthesis',
                },
                {
                  label: 'Carbohydrates',
                  current: Math.round(totals.carbsG),
                  target: goals.carbsTargetG,
                  color: 'bg-emerald-500',
                  note: 'Glycogen & MAV output',
                },
                {
                  label: 'Dietary Fats',
                  current: Math.round(totals.fatG),
                  target: goals.fatTargetG,
                  color: 'bg-amber-500',
                  note: 'Endocrine baseline',
                },
              ].map((m) => {
                const pct = Math.min(100, Math.round((m.current / Math.max(1, m.target)) * 100));
                return (
                  <div key={m.label} className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {m.label}
                      </span>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        <strong className="text-slate-900 dark:text-white">{m.current}g</strong> /{' '}
                        {m.target}g
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${m.color} transition-all duration-200`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{m.note}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Morning Scale Weight ({goals.weightUnit})
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={
                    goals.weightUnit === 'lb'
                      ? Math.round(currentRecord.bodyweightKg * 2.20462 * 10) / 10
                      : currentRecord.bodyweightKg
                  }
                  onChange={(e) => {
                    const raw = Math.max(30, Number(e.target.value) || 0);
                    const kg =
                      goals.weightUnit === 'lb'
                        ? Math.round((raw / 2.20462) * 10) / 10
                        : raw;
                    onSaveDailyNutrition({
                      ...currentRecord,
                      bodyweightKg: kg,
                    });
                  }}
                  className="mt-1 w-full min-h-[42px] px-3 py-1.5 text-sm font-mono tabular-nums font-semibold hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Daily Step Count
                </span>
                <input
                  type="number"
                  step="250"
                  value={currentRecord.stepsCount}
                  onChange={(e) =>
                    onSaveDailyNutrition({
                      ...currentRecord,
                      stepsCount: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="mt-1 w-full min-h-[42px] px-3 py-1.5 text-sm font-mono tabular-nums font-semibold hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </label>
            </div>
          </div>

          {/* Logged Meals List */}
          <div className="hl-card rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Meals Logged ({selectedDate})
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {currentRecord.meals.length} entries
              </span>
            </div>

            {currentRecord.meals.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                No meals logged for this date yet. Build an offline meal or tap a preset.
              </p>
            ) : (
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {currentRecord.meals.map((meal) => (
                  <div
                    key={meal.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {meal.mealType} · {meal.loggedAt}
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate mt-0.5">
                        {meal.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                        {meal.calories} kcal · P {meal.proteinG}g · C {meal.carbsG}g · F{' '}
                        {meal.fatG}g
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteMeal(meal.id)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0"
                      aria-label={`Delete ${meal.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saved Custom Meal Presets + Built-In Hypertrophy Templates */}
          <div className="hl-card rounded-2xl p-4 sm:p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                1-Tap Offline Meal Templates
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Your saved custom meals and pre-built hypertrophy meals
              </p>
            </div>

            <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {savedCustomMeals.map((custom) => (
                <div
                  key={custom.id}
                  className="py-2.5 first:pt-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {custom.name}
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      Custom · {custom.calories} kcal · {custom.proteinG}P / {custom.carbsG}C /{' '}
                      {custom.fatG}F
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickAddPreset(custom)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors"
                    >
                      + Log
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSavedPreset(custom.id)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      aria-label={`Remove saved meal ${custom.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {PRESET_HYPERTROPHY_MEALS.map((preset, idx) => (
                <div
                  key={idx}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {preset.name}
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {preset.calories} kcal · {preset.proteinG}P / {preset.carbsG}C /{' '}
                      {preset.fatG}F
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickAddPreset(preset)}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors shrink-0"
                  >
                    + Log
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Redesigned Offline Custom Meal Builder */}
        <div className="lg:col-span-6">
          <form onSubmit={handleAddMeal} className="hl-card rounded-2xl p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Offline Custom Meal Builder
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Combine whole-food gram servings or type macros—calories auto-calculate live offline (4P + 4C + 9F)
                </p>
              </div>
            </div>

            {savedPresetToast && (
              <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                {savedPresetToast}
              </div>
            )}

            {/* Timing + Meal Name */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Meal Timing
                </span>
                <select
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value as MealEntry['mealType'])}
                  className="mt-1 w-full min-h-[42px] px-3 py-1.5 text-xs font-semibold hl-input rounded-xl"
                >
                  <option value="Breakfast">Breakfast</option>
                  <option value="Pre-Workout">Pre-Workout</option>
                  <option value="Post-Workout">Post-Workout</option>
                  <option value="Dinner">Dinner</option>
                  <option value="Snack">Snack</option>
                </select>
              </label>

              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Meal Name (optional — auto-fills from foods)
                </span>
                <input
                  type="text"
                  placeholder="e.g. Post-Lift Chicken & Jasmine Rice Bowl"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  className="mt-1 w-full min-h-[42px] px-3 py-1.5 text-sm hl-input rounded-xl"
                />
              </label>
            </div>

            {/* Step 1: Searchable Offline Whole-Food Library */}
            <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Add Offline Whole-Food Ingredients ({OFFLINE_FOOD_CATALOG.length} foods)
                </span>
                {ingredients.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIngredients([])}
                    className="text-xs font-semibold text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                  >
                    Clear Foods ({ingredients.length})
                  </button>
                )}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  placeholder="Search chicken, jasmine rice, oats, eggs, whey, avocado…"
                  value={foodSearch}
                  onChange={(e) => setFoodSearch(e.target.value)}
                  className="w-full min-h-[40px] pl-9 pr-3 py-1.5 text-xs hl-input rounded-xl"
                />
              </div>

              {/* Category Filter Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {FOOD_CATEGORIES.map((cat) => {
                  const active = foodCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFoodCategory(cat)}
                      className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-slate-900 dark:bg-blue-600 text-white'
                          : 'hl-subtle text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {/* Compact Scrollable Offline Food Results */}
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-800 rounded-xl hl-subtle border px-3">
                {filteredFoods.slice(0, 18).map((food) => {
                  const sampleMacros = computeFoodItemMacros(food, food.defaultServingG);
                  return (
                    <div
                      key={food.id}
                      className="py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {food.name}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {food.servingHint} · {sampleMacros.calories} kcal ({sampleMacros.proteinG}
                          P / {sampleMacros.carbsG}C / {sampleMacros.fatG}F)
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddFoodIngredient(food)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shrink-0"
                      >
                        + Add
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Ingredients with Gram Scaler */}
            {ingredients.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Selected Meal Ingredients (Adjust Grams)
                </div>
                <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                  {ingredients.map((item) => {
                    const m = computeFoodItemMacros(item.food, item.grams);
                    return (
                      <div
                        key={item.uid}
                        className="py-2.5 first:pt-0 last:pb-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {item.food.name}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {m.calories} kcal · P {m.proteinG}g · C {m.carbsG}g · F {m.fatG}g
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            min="1"
                            max="2000"
                            step="5"
                            value={item.grams}
                            onChange={(e) =>
                              handleUpdateIngredientGrams(item.uid, Number(e.target.value) || 0)
                            }
                            aria-label={`Grams of ${item.food.name}`}
                            className="w-20 min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums font-semibold hl-input rounded-lg text-right"
                          />
                          <span className="text-xs text-slate-500 font-mono">g</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(item.uid)}
                            className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                            aria-label={`Remove ${item.food.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Direct / Additional Macro Inputs (Auto-Calculates Calories Offline) */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {ingredients.length > 0
                    ? 'Additional Macros (Optional Top-Up)'
                    : 'Direct Macro Entry (Auto-Calculates Calories)'}
                </span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  4 kcal/g P · 4 kcal/g C · 9 kcal/g F
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Protein (g)
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={directProteinG}
                    onChange={(e) => setDirectProteinG(e.target.value)}
                    className="mt-1 w-full min-h-[42px] px-2.5 py-1.5 text-sm font-mono tabular-nums hl-input rounded-xl"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Carbs (g)
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={directCarbsG}
                    onChange={(e) => setDirectCarbsG(e.target.value)}
                    className="mt-1 w-full min-h-[42px] px-2.5 py-1.5 text-sm font-mono tabular-nums hl-input rounded-xl"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Fat (g)
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={directFatG}
                    onChange={(e) => setDirectFatG(e.target.value)}
                    className="mt-1 w-full min-h-[42px] px-2.5 py-1.5 text-sm font-mono tabular-nums hl-input rounded-xl"
                  />
                </label>
              </div>
            </div>

            {/* Live Offline Auto-Calculated Meal Summary Bar */}
            <div className="p-3.5 rounded-xl hl-subtle border space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Auto-Calculated Meal Total
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {composedMealTotals.finalCalories.toLocaleString()} kcal
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums text-xs text-slate-700 dark:text-slate-200">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {composedMealTotals.proteinG}g P
                  </span>{' '}
                  ·{' '}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {composedMealTotals.carbsG}g C
                  </span>{' '}
                  ·{' '}
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {composedMealTotals.fatG}g F
                  </span>
                </div>
              </div>

              {/* Optional Label Calorie Override */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-700/70 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const next = !useManualKcal;
                    setUseManualKcal(next);
                    if (next && !manualKcalOverride) {
                      setManualKcalOverride(String(composedMealTotals.autoCalories || ''));
                    }
                  }}
                  className="text-slate-600 dark:text-slate-300 hover:underline font-medium"
                >
                  {useManualKcal
                    ? 'Use Automatic Macro Formula (4P + 4C + 9F)'
                    : 'Override kcal from nutrition label?'}
                </button>

                {useManualKcal && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      placeholder="650"
                      value={manualKcalOverride}
                      onChange={(e) => setManualKcalOverride(e.target.value)}
                      className="w-24 min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums font-bold hl-input rounded-lg text-right"
                    />
                    <span className="font-mono text-slate-500">kcal</span>
                  </div>
                )}
              </div>
            </div>

            {/* Submit & Save Reusable Preset Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="submit"
                disabled={composedMealTotals.finalCalories <= 0}
                className="sm:col-span-2 min-h-[44px] px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Log Meal ({composedMealTotals.finalCalories} kcal)</span>
              </button>

              <button
                type="button"
                disabled={composedMealTotals.finalCalories <= 0}
                onClick={handleSaveAsCustomPreset}
                className="min-h-[44px] px-3 hl-subtle border text-slate-800 dark:text-slate-200 hover:border-slate-400 disabled:opacity-50 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <BookmarkPlus className="w-4 h-4" />
                <span>Save Preset</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

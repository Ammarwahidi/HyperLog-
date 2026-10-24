import {
  ActivityLevel,
  BiologicalSex,
  CalorieCalculatorProfile,
  CalorieCalculatorResult,
  NutritionPhase,
  OfflineFoodItem,
} from '../types/workout';

export const ACTIVITY_LEVEL_META: Record<
  ActivityLevel,
  { label: string; shortLabel: string; multiplier: number; detail: string }
> = {
  [ActivityLevel.Sedentary]: {
    label: 'Sedentary (Desk · <5k steps)',
    shortLabel: 'Sedentary',
    multiplier: 1.2,
    detail: '1–2 light workouts/wk',
  },
  [ActivityLevel.Light]: {
    label: 'Lightly Active (6k–8k steps)',
    shortLabel: 'Light',
    multiplier: 1.375,
    detail: '3 workouts/wk',
  },
  [ActivityLevel.Moderate]: {
    label: 'Moderately Active (8k–10k steps)',
    shortLabel: 'Moderate',
    multiplier: 1.55,
    detail: '4–5 hypertrophy sessions/wk',
  },
  [ActivityLevel.Active]: {
    label: 'Very Active (10k–13k steps)',
    shortLabel: 'Active',
    multiplier: 1.725,
    detail: '5–6 intense sessions/wk',
  },
  [ActivityLevel.VeryActive]: {
    label: 'Athlete / Physical Job (14k+ steps)',
    shortLabel: 'Athlete',
    multiplier: 1.9,
    detail: 'Daily training + active job',
  },
};

export function autoCalculateCaloriesFromMacros(
  proteinG: number,
  carbsG: number,
  fatG: number
): number {
  const p = Number.isFinite(proteinG) ? Math.max(0, proteinG) : 0;
  const c = Number.isFinite(carbsG) ? Math.max(0, carbsG) : 0;
  const f = Number.isFinite(fatG) ? Math.max(0, fatG) : 0;
  return Math.max(0, Math.round(p * 4 + c * 4 + f * 9));
}

export function computeOfflineCalorieTargets(
  profile: CalorieCalculatorProfile
): CalorieCalculatorResult {
  const safeWeightKg = Math.min(250, Math.max(35, profile.weightKg || 80));
  const safeHeightCm = Math.min(230, Math.max(120, profile.heightCm || 178));
  const safeAge = Math.min(95, Math.max(14, Math.round(profile.ageYears || 28)));

  // Mifflin-St Jeor Equation (100% Offline)
  const sexConstant = profile.sex === BiologicalSex.Male ? 5 : -161;
  const bmrRaw = 10 * safeWeightKg + 6.25 * safeHeightCm - 5 * safeAge + sexConstant;
  const bmrKcal = Math.max(1050, Math.round(bmrRaw));

  const mult = ACTIVITY_LEVEL_META[profile.activity]?.multiplier ?? 1.55;
  const tdeeKcal = Math.max(1300, Math.round(bmrKcal * mult));

  const goalDelta =
    profile.phase === NutritionPhase.LeanMass
      ? 300
      : profile.phase === NutritionPhase.MiniCut
      ? -500
      : 0;

  const minSafeKcal = profile.sex === BiologicalSex.Male ? 1500 : 1250;
  const targetCalories = Math.max(minSafeKcal, tdeeKcal + goalDelta);

  // Evidence-based hypertrophy macro allocation
  const proteinPerKg = profile.phase === NutritionPhase.MiniCut ? 2.2 : 2.0;
  const fatPerKg = profile.phase === NutritionPhase.MiniCut ? 0.75 : 0.88;

  const proteinTargetG = Math.max(90, Math.round(safeWeightKg * proteinPerKg));
  const fatTargetG = Math.max(40, Math.round(safeWeightKg * fatPerKg));

  const remainingForCarbsKcal = Math.max(
    240,
    targetCalories - proteinTargetG * 4 - fatTargetG * 9
  );
  const carbsTargetG = Math.round(remainingForCarbsKcal / 4);

  return {
    bmrKcal,
    tdeeKcal,
    targetCalories,
    proteinTargetG,
    carbsTargetG,
    fatTargetG,
  };
}

export function computeFoodItemMacros(food: OfflineFoodItem, grams: number) {
  const factor = Math.max(0, grams) / 100;
  const proteinG = Math.round(food.per100gProtein * factor * 10) / 10;
  const carbsG = Math.round(food.per100gCarbs * factor * 10) / 10;
  const fatG = Math.round(food.per100gFat * factor * 10) / 10;
  const calories = autoCalculateCaloriesFromMacros(proteinG, carbsG, fatG);
  return { proteinG, carbsG, fatG, calories };
}

export const OFFLINE_FOOD_CATALOG: OfflineFoodItem[] = [
  // Protein
  {
    id: 'f_chicken_breast',
    name: 'Chicken Breast (Cooked)',
    category: 'Protein',
    defaultServingG: 180,
    servingHint: '180g cooked breast',
    per100gProtein: 31,
    per100gCarbs: 0,
    per100gFat: 3.6,
  },
  {
    id: 'f_turkey_breast',
    name: 'Lean Ground Turkey (93/7)',
    category: 'Protein',
    defaultServingG: 170,
    servingHint: '170g cooked',
    per100gProtein: 27,
    per100gCarbs: 0,
    per100gFat: 7.2,
  },
  {
    id: 'f_beef_93',
    name: 'Lean Ground Beef (93/7)',
    category: 'Protein',
    defaultServingG: 170,
    servingHint: '170g cooked',
    per100gProtein: 26,
    per100gCarbs: 0,
    per100gFat: 8.5,
  },
  {
    id: 'f_sirloin_steak',
    name: 'Top Sirloin Steak (Trimmed)',
    category: 'Protein',
    defaultServingG: 180,
    servingHint: '180g grilled',
    per100gProtein: 29,
    per100gCarbs: 0,
    per100gFat: 6.8,
  },
  {
    id: 'f_salmon',
    name: 'Atlantic Salmon Fillet',
    category: 'Protein',
    defaultServingG: 160,
    servingHint: '160g baked fillet',
    per100gProtein: 22.5,
    per100gCarbs: 0,
    per100gFat: 12.4,
  },
  {
    id: 'f_tilapia',
    name: 'White Fish / Tilapia / Cod',
    category: 'Protein',
    defaultServingG: 200,
    servingHint: '200g cooked fillet',
    per100gProtein: 26,
    per100gCarbs: 0,
    per100gFat: 2.3,
  },
  {
    id: 'f_shrimp',
    name: 'Peeled Shrimp (Cooked)',
    category: 'Protein',
    defaultServingG: 180,
    servingHint: '180g cooked',
    per100gProtein: 24,
    per100gCarbs: 0.2,
    per100gFat: 0.9,
  },
  {
    id: 'f_egg_whites',
    name: 'Liquid Egg Whites',
    category: 'Protein',
    defaultServingG: 200,
    servingHint: '200g (~6 whites)',
    per100gProtein: 10.9,
    per100gCarbs: 0.7,
    per100gFat: 0.2,
  },
  {
    id: 'f_whole_eggs',
    name: 'Whole Large Eggs',
    category: 'Protein',
    defaultServingG: 150,
    servingHint: '150g (3 large eggs)',
    per100gProtein: 12.6,
    per100gCarbs: 0.7,
    per100gFat: 9.5,
  },
  {
    id: 'f_tofu_firm',
    name: 'Extra-Firm Tofu',
    category: 'Protein',
    defaultServingG: 200,
    servingHint: '200g pressed',
    per100gProtein: 15.5,
    per100gCarbs: 2.2,
    per100gFat: 8.2,
  },
  {
    id: 'f_tuna_canned',
    name: 'Tuna in Water (Drained)',
    category: 'Protein',
    defaultServingG: 140,
    servingHint: '140g (1 drained can)',
    per100gProtein: 25.5,
    per100gCarbs: 0,
    per100gFat: 0.9,
  },

  // Dairy & Shakes
  {
    id: 'f_whey_isolate',
    name: 'Whey Protein Isolate',
    category: 'Dairy & Shakes',
    defaultServingG: 32,
    servingHint: '32g (1 scoop)',
    per100gProtein: 84,
    per100gCarbs: 3,
    per100gFat: 1.5,
  },
  {
    id: 'f_greek_yogurt_0',
    name: 'Non-Fat Greek Yogurt (0%)',
    category: 'Dairy & Shakes',
    defaultServingG: 225,
    servingHint: '225g bowl',
    per100gProtein: 10.3,
    per100gCarbs: 3.6,
    per100gFat: 0.4,
  },
  {
    id: 'f_cottage_cheese_2',
    name: 'Low-Fat Cottage Cheese (2%)',
    category: 'Dairy & Shakes',
    defaultServingG: 200,
    servingHint: '200g cup',
    per100gProtein: 11.8,
    per100gCarbs: 3.5,
    per100gFat: 2.2,
  },
  {
    id: 'f_ultrafiltered_milk',
    name: 'Ultra-Filtered Milk (2%)',
    category: 'Dairy & Shakes',
    defaultServingG: 240,
    servingHint: '240ml glass',
    per100gProtein: 5.4,
    per100gCarbs: 2.5,
    per100gFat: 1.9,
  },
  {
    id: 'f_skim_milk',
    name: 'Skim Milk (0%)',
    category: 'Dairy & Shakes',
    defaultServingG: 250,
    servingHint: '250ml glass',
    per100gProtein: 3.4,
    per100gCarbs: 5.0,
    per100gFat: 0.1,
  },
  {
    id: 'f_whole_milk',
    name: 'Whole Milk (3.25%)',
    category: 'Dairy & Shakes',
    defaultServingG: 250,
    servingHint: '250ml glass',
    per100gProtein: 3.3,
    per100gCarbs: 4.8,
    per100gFat: 3.3,
  },
  {
    id: 'f_soy_milk',
    name: 'Unsweetened Soy Milk',
    category: 'Dairy & Shakes',
    defaultServingG: 250,
    servingHint: '250ml glass',
    per100gProtein: 3.3,
    per100gCarbs: 1.2,
    per100gFat: 1.8,
  },
  {
    id: 'f_cheddar_cheese',
    name: 'Reduced-Fat Cheddar Cheese',
    category: 'Dairy & Shakes',
    defaultServingG: 30,
    servingHint: '30g shredded',
    per100gProtein: 28,
    per100gCarbs: 2.0,
    per100gFat: 19,
  },

  // Carbs & Grains
  {
    id: 'f_jasmine_rice',
    name: 'Jasmine / White Rice (Cooked)',
    category: 'Carbs & Grains',
    defaultServingG: 250,
    servingHint: '250g cooked rice',
    per100gProtein: 2.7,
    per100gCarbs: 28.2,
    per100gFat: 0.3,
  },
  {
    id: 'f_rolled_oats',
    name: 'Rolled Oats (Dry Weight)',
    category: 'Carbs & Grains',
    defaultServingG: 80,
    servingHint: '80g dry oats',
    per100gProtein: 13.2,
    per100gCarbs: 67.7,
    per100gFat: 6.5,
  },
  {
    id: 'f_cream_of_rice',
    name: 'Cream of Rice (Dry Weight)',
    category: 'Carbs & Grains',
    defaultServingG: 60,
    servingHint: '60g dry cereal',
    per100gProtein: 6.7,
    per100gCarbs: 80.0,
    per100gFat: 0.8,
  },
  {
    id: 'f_sweet_potato',
    name: 'Sweet Potato (Baked)',
    category: 'Carbs & Grains',
    defaultServingG: 250,
    servingHint: '250g baked',
    per100gProtein: 2.0,
    per100gCarbs: 20.7,
    per100gFat: 0.1,
  },
  {
    id: 'f_russet_potato',
    name: 'White / Russet Potato (Baked)',
    category: 'Carbs & Grains',
    defaultServingG: 280,
    servingHint: '280g potato',
    per100gProtein: 2.5,
    per100gCarbs: 21.2,
    per100gFat: 0.1,
  },
  {
    id: 'f_pasta_cooked',
    name: 'Pasta (Cooked)',
    category: 'Carbs & Grains',
    defaultServingG: 220,
    servingHint: '220g cooked',
    per100gProtein: 5.8,
    per100gCarbs: 30.9,
    per100gFat: 0.9,
  },
  {
    id: 'f_sourdough_bread',
    name: 'Sourdough Bread',
    category: 'Carbs & Grains',
    defaultServingG: 90,
    servingHint: '90g (2 thick slices)',
    per100gProtein: 9.0,
    per100gCarbs: 51.0,
    per100gFat: 1.8,
  },
  {
    id: 'f_rice_cakes',
    name: 'Plain White Rice Cakes',
    category: 'Carbs & Grains',
    defaultServingG: 36,
    servingHint: '36g (4 cakes)',
    per100gProtein: 7.5,
    per100gCarbs: 81.5,
    per100gFat: 2.8,
  },
  {
    id: 'f_quinoa_cooked',
    name: 'Quinoa (Cooked)',
    category: 'Carbs & Grains',
    defaultServingG: 200,
    servingHint: '200g cooked',
    per100gProtein: 4.4,
    per100gCarbs: 21.3,
    per100gFat: 1.9,
  },
  {
    id: 'f_black_beans',
    name: 'Black Beans (Cooked)',
    category: 'Carbs & Grains',
    defaultServingG: 150,
    servingHint: '150g drained',
    per100gProtein: 8.9,
    per100gCarbs: 23.7,
    per100gFat: 0.5,
  },
  {
    id: 'f_tortilla_wrap',
    name: 'Flour Tortilla Wrap',
    category: 'Carbs & Grains',
    defaultServingG: 65,
    servingHint: '65g (1 large wrap)',
    per100gProtein: 8.2,
    per100gCarbs: 50.0,
    per100gFat: 7.5,
  },
  {
    id: 'f_honey',
    name: 'Raw Honey',
    category: 'Carbs & Grains',
    defaultServingG: 25,
    servingHint: '25g (1 tbsp)',
    per100gProtein: 0.3,
    per100gCarbs: 82.4,
    per100gFat: 0,
  },
  {
    id: 'f_intra_dextrin',
    name: 'Cyclic Dextrin / Intra Carbs',
    category: 'Carbs & Grains',
    defaultServingG: 40,
    servingHint: '40g scoop',
    per100gProtein: 0,
    per100gCarbs: 96.0,
    per100gFat: 0,
  },

  // Healthy Fats
  {
    id: 'f_olive_oil',
    name: 'Extra Virgin Olive Oil',
    category: 'Healthy Fats',
    defaultServingG: 14,
    servingHint: '14g (1 tbsp)',
    per100gProtein: 0,
    per100gCarbs: 0,
    per100gFat: 100.0,
  },
  {
    id: 'f_avocado',
    name: 'Fresh Avocado',
    category: 'Healthy Fats',
    defaultServingG: 80,
    servingHint: '80g (half avocado)',
    per100gProtein: 2.0,
    per100gCarbs: 8.5,
    per100gFat: 14.7,
  },
  {
    id: 'f_peanut_butter',
    name: 'Natural Peanut Butter',
    category: 'Healthy Fats',
    defaultServingG: 32,
    servingHint: '32g (2 tbsp)',
    per100gProtein: 25.0,
    per100gCarbs: 20.0,
    per100gFat: 50.0,
  },
  {
    id: 'f_almonds',
    name: 'Roasted Almonds',
    category: 'Healthy Fats',
    defaultServingG: 28,
    servingHint: '28g handful',
    per100gProtein: 21.2,
    per100gCarbs: 21.6,
    per100gFat: 49.9,
  },
  {
    id: 'f_chia_seeds',
    name: 'Chia Seeds',
    category: 'Healthy Fats',
    defaultServingG: 20,
    servingHint: '20g (2 tbsp)',
    per100gProtein: 16.5,
    per100gCarbs: 42.1,
    per100gFat: 30.7,
  },
  {
    id: 'f_dark_chocolate',
    name: '85% Dark Chocolate',
    category: 'Healthy Fats',
    defaultServingG: 25,
    servingHint: '25g (2 squares)',
    per100gProtein: 8.0,
    per100gCarbs: 36.0,
    per100gFat: 46.0,
  },
  {
    id: 'f_butter',
    name: 'Grass-Fed Butter',
    category: 'Healthy Fats',
    defaultServingG: 14,
    servingHint: '14g (1 tbsp)',
    per100gProtein: 0.9,
    per100gCarbs: 0.1,
    per100gFat: 81.1,
  },

  // Fruit & Veg
  {
    id: 'f_banana',
    name: 'Ripe Banana',
    category: 'Fruit & Veg',
    defaultServingG: 120,
    servingHint: '120g (1 medium)',
    per100gProtein: 1.1,
    per100gCarbs: 22.8,
    per100gFat: 0.3,
  },
  {
    id: 'f_blueberries',
    name: 'Blueberries / Mixed Berries',
    category: 'Fruit & Veg',
    defaultServingG: 125,
    servingHint: '125g cup',
    per100gProtein: 0.7,
    per100gCarbs: 14.5,
    per100gFat: 0.3,
  },
  {
    id: 'f_apple',
    name: 'Honeycrisp Apple',
    category: 'Fruit & Veg',
    defaultServingG: 180,
    servingHint: '180g (1 medium)',
    per100gProtein: 0.3,
    per100gCarbs: 13.8,
    per100gFat: 0.2,
  },
  {
    id: 'f_broccoli',
    name: 'Steamed Broccoli Florets',
    category: 'Fruit & Veg',
    defaultServingG: 150,
    servingHint: '150g side',
    per100gProtein: 2.8,
    per100gCarbs: 7.0,
    per100gFat: 0.4,
  },
  {
    id: 'f_spinach',
    name: 'Baby Spinach',
    category: 'Fruit & Veg',
    defaultServingG: 100,
    servingHint: '100g greens',
    per100gProtein: 2.9,
    per100gCarbs: 3.6,
    per100gFat: 0.4,
  },
  {
    id: 'f_bell_peppers',
    name: 'Mixed Bell Peppers & Onions',
    category: 'Fruit & Veg',
    defaultServingG: 150,
    servingHint: '150g sautéed',
    per100gProtein: 1.1,
    per100gCarbs: 6.5,
    per100gFat: 0.3,
  },
];

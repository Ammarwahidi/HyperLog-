export enum AppTab {
  Anatomy = 'anatomy',
  TrackSets = 'track_sets',
  Workouts = 'workouts',
  Library = 'library',
  Calories = 'calories',
  Settings = 'settings',
}

export enum AppTheme {
  Daylight = 'light',
  NightSlate = 'dark',
  Amoled = 'amoled',
  Graphite = 'graphite',
}

export enum BiologicalSex {
  Male = 'male',
  Female = 'female',
}

export enum ActivityLevel {
  Sedentary = 'sedentary',
  Light = 'light',
  Moderate = 'moderate',
  Active = 'active',
  VeryActive = 'very_active',
}

export enum MuscleId {
  Chest = 'chest',
  FrontDelts = 'front_delts',
  RearSideDelts = 'rear_side_delts',
  Traps = 'traps',
  Biceps = 'biceps',
  Triceps = 'triceps',
  Forearms = 'forearms',
  Abs = 'abs',
  Back = 'back',
  Glutes = 'glutes',
  Quads = 'quads',
  Hamstrings = 'hamstrings',
  Calves = 'calves',
}

export enum MajorMuscleGroup {
  All = 'all',
  Chest = 'chest',
  Back = 'back',
  Shoulders = 'shoulders',
  Arms = 'arms',
  Core = 'core',
  Legs = 'legs',
}

export enum EquipmentType {
  All = 'all',
  Barbell = 'Barbell',
  Dumbbell = 'Dumbbell',
  Cable = 'Cable',
  Machine = 'Machine',
  Bodyweight = 'Bodyweight',
}

export enum VolumeZone {
  BelowMV = 'below_mv',
  Maintenance = 'mv_to_mev',
  Productive = 'mev_to_mav',
  OptimalMAV = 'optimal_mav',
  Overreaching = 'near_or_above_mrv',
}

export enum NutritionPhase {
  LeanMass = 'lean_mass',
  Maintenance = 'maintenance',
  MiniCut = 'mini_cut',
}

export interface MuscleLandmark {
  id: MuscleId;
  name: string;
  shortName: string;
  anatomicalGroup: 'Upper Anterior' | 'Upper Posterior' | 'Arms & Core' | 'Lower Body';
  primaryPlane: 'anterior' | 'posterior' | 'both';
  mv: number;
  mev: number;
  mavMin: number;
  mavMax: number;
  mrv: number;
  optimalFreqMin: number;
  optimalFreqMax: number;
  rpGuidance: string;
}

export interface LibraryExercise {
  id: string;
  name: string;
  majorGroup: Exclude<MajorMuscleGroup, MajorMuscleGroup.All>;
  primaryMuscle: MuscleId;
  secondaryMuscles: MuscleId[];
  equipment: Exclude<EquipmentType, EquipmentType.All>;
  description: string;
  instructions: string[];
  defaultRepRange: string;
  defaultRestSeconds: number;
  defaultWeightKg: number;
  videoUrl?: string;
  videoSourceLabel?: string;
  isCustom?: boolean;
}

export interface TemplateExerciseItem {
  id: string;
  libraryExerciseId: string;
  name: string;
  primaryMuscle: MuscleId;
  secondaryMuscles: MuscleId[];
  sets: number;
  reps: string;
  restSeconds: number;
  defaultWeightKg: number;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  category: 'Starter' | 'Custom';
  splitType: string;
  description: string;
  updatedAt: string;
  exercises: TemplateExerciseItem[];
}

export interface ExercisePrescription {
  id: string;
  dayNumber: number;
  order: number;
  muscleId: MuscleId;
  sheetMuscleLabel: string;
  name: string;
  isSuperset: boolean;
  repRange: string;
  defaultWeightKg: number;
  restSeconds?: number;
  libraryExerciseId?: string;
  weekSets: Record<number, number>; // Weeks 1..5
}

export interface WorkoutDayPlan {
  dayNumber: number;
  title: string;
  focusSummary: string;
  isRestDay: boolean;
  exercises: ExercisePrescription[];
}

export interface SetLogEntry {
  id: string;
  week: number; // 1..5
  dayNumber: number; // 1..7 for schedule days, 0 for standalone template sessions
  templateSessionId?: string;
  exerciseId: string;
  exerciseName: string;
  muscleId: MuscleId;
  setIndex: number; // 1-based
  weightKg: number;
  reps: number;
  rir: number;
  restSeconds?: number;
  completed: boolean;
  completedAt?: string;
}

export interface ActiveStandaloneSession {
  sessionId: string;
  templateId: string;
  templateName: string;
  startedAt: string;
  exercises: TemplateExerciseItem[];
}

export interface MuscleAutoregulationFeedback {
  id: string; // `${week}_${dayNumber}_${muscleId}`
  week: number;
  dayNumber: number;
  muscleId: MuscleId;
  pump: 0 | 1 | 2; // 0: Low, 1: Moderate, 2: High
  jointPain: 0 | 1 | 2; // 0: None, 1: Mild, 2: Significant
  sorenessRecovery: 0 | 1 | 2; // 0: Healed early, 1: Just on time, 2: Still sore
}

export interface MealEntry {
  id: string;
  date: string; // YYYY-MM-DD
  mealType: 'Breakfast' | 'Pre-Workout' | 'Post-Workout' | 'Dinner' | 'Snack';
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  loggedAt: string;
}

export interface SavedCustomMeal {
  id: string;
  mealType: MealEntry['mealType'];
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  ingredientsSummary?: string;
}

export interface OfflineFoodItem {
  id: string;
  name: string;
  category: 'Protein' | 'Carbs & Grains' | 'Healthy Fats' | 'Dairy & Shakes' | 'Fruit & Veg';
  defaultServingG: number;
  servingHint: string;
  per100gProtein: number;
  per100gCarbs: number;
  per100gFat: number;
}

export interface CalorieCalculatorProfile {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: BiologicalSex;
  activity: ActivityLevel;
  phase: NutritionPhase;
}

export interface CalorieCalculatorResult {
  bmrKcal: number;
  tdeeKcal: number;
  targetCalories: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
}

export interface AppPreferences {
  defaultRestSeconds: number;
  vibrateOnRestComplete: boolean;
  autoStartRestTimer: boolean;
  calculatorProfile: CalorieCalculatorProfile;
}

export interface WidgetDayIndicator {
  iso: string;
  dayLetter: string;
  active: boolean;
  isToday: boolean;
}

export interface WidgetMesoSplitBar {
  id: string;
  shortTitle: string;
  fullTitle: string;
  completedSets: number;
  plannedSets: number;
  progressPct: number;
}

export interface WidgetProgressSnapshot {
  streakDays: number;
  bestStreakDays: number;
  weekDays: WidgetDayIndicator[];
  activeWeek: number;
  completedSets: number;
  plannedSets: number;
  mesoSplitBars: WidgetMesoSplitBar[];
  todayCalories: number;
  targetCalories: number;
  todayProteinG: number;
  targetProteinG: number;
}

export interface DailyNutritionRecord {
  date: string; // YYYY-MM-DD
  bodyweightKg: number;
  stepsCount: number;
  meals: MealEntry[];
}

export interface NutritionGoals {
  phase: NutritionPhase;
  baseTdeeKcal: number;
  targetCalories: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  weightUnit: 'kg' | 'lb';
}

export interface SyncOutboxEvent {
  id: string;
  recordType: 'EXERCISE_SESSION' | 'NUTRITION_RECORD' | 'BODY_MASS';
  healthConnectType: string;
  googleFitDataSource: string;
  createdAt: string;
  status: 'PENDING_LOCAL' | 'READY_FOR_BRIDGE';
  payload: Record<string, unknown>;
}

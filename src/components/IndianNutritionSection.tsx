import React, { useMemo, useState } from 'react';
import {
  Search,
  Utensils,
  Clock,
  Plus,
  BookmarkPlus,
  Check,
  X,
  ChefHat,
  Flame,
  PlayCircle,
  ExternalLink,
} from 'lucide-react';
import {
  INDIAN_FOOD_META_LIST,
  INDIAN_RECIPES_CATALOG,
  filterIndianRecipes,
  getIndianFoodPortionSummary,
  getIndianNutritionRecipeVideo,
  type IndianDietPreference,
  type IndianFoodCatalogMeta,
  type IndianRecipeItem,
} from '../data/indianNutritionData';
import type { MealEntry, SavedCustomMeal } from '../types/workout';

interface IndianNutritionSectionProps {
  onQuickLogFood: (item: {
    name: string;
    mealType: MealEntry['mealType'];
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }) => Promise<void>;
  savedCustomMeals: SavedCustomMeal[];
  onSaveCustomMeal: (meal: Omit<SavedCustomMeal, 'id'>) => Promise<void>;
}

const DIET_TABS: IndianDietPreference[] = [
  'All',
  'Vegetarian',
  'High-Protein Veg',
  'Vegan',
  'Eggetarian',
  'Non-Vegetarian',
];

const MEAL_SLOTS: Array<'All' | MealEntry['mealType']> = [
  'All',
  'Breakfast',
  'Pre-Workout',
  'Post-Workout',
  'Dinner',
  'Snack',
];

export const IndianNutritionSection: React.FC<IndianNutritionSectionProps> = ({
  onQuickLogFood,
  savedCustomMeals,
  onSaveCustomMeal,
}) => {
  const [viewMode, setViewMode] = useState<'recipes' | 'foods'>('recipes');
  const [dietFilter, setDietFilter] = useState<IndianDietPreference>('All');
  const [slotFilter, setSlotFilter] = useState<'All' | MealEntry['mealType']>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<IndianRecipeItem | null>(null);
  const [targetLogSlot, setTargetLogSlot] = useState<MealEntry['mealType']>('Post-Workout');
  const [recentlyLoggedId, setRecentlyLoggedId] = useState<string | null>(null);
  const [recentlySavedId, setRecentlySavedId] = useState<string | null>(null);
  const [showDietFilters, setShowDietFilters] = useState<boolean>(false);

  const filteredRecipes = useMemo(
    () => filterIndianRecipes(dietFilter, searchQuery, slotFilter),
    [dietFilter, searchQuery, slotFilter]
  );

  const filteredIndianFoods = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return INDIAN_FOOD_META_LIST.filter((entry) => {
      if (dietFilter !== 'All' && !entry.dietTags.includes(dietFilter)) {
        return false;
      }
      if (!q) return true;
      const hay = `${entry.food.name} ${entry.food.category} ${entry.food.servingHint} ${entry.keywords.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [dietFilter, searchQuery]);

  const savedNamesSet = useMemo(
    () => new Set(savedCustomMeals.map((m) => m.name.trim().toLowerCase())),
    [savedCustomMeals]
  );

  const handleLogRecipe = async (
    recipe: IndianRecipeItem,
    slotOverride?: MealEntry['mealType']
  ) => {
    const slot = slotOverride || recipe.recommendedSlot;
    await onQuickLogFood({
      name: `${recipe.name} (${recipe.servingLabel})`,
      mealType: slot,
      calories: recipe.calories,
      proteinG: recipe.proteinG,
      carbsG: recipe.carbsG,
      fatG: recipe.fatG,
    });
    setRecentlyLoggedId(recipe.id);
    window.setTimeout(() => {
      setRecentlyLoggedId((prev) => (prev === recipe.id ? null : prev));
    }, 1800);
  };

  const handleSaveRecipeTemplate = async (recipe: IndianRecipeItem) => {
    if (savedNamesSet.has(recipe.name.trim().toLowerCase())) return;
    await onSaveCustomMeal({
      mealType: recipe.recommendedSlot,
      name: recipe.name,
      calories: recipe.calories,
      proteinG: recipe.proteinG,
      carbsG: recipe.carbsG,
      fatG: recipe.fatG,
      ingredientsSummary: recipe.servingLabel,
    });
    setRecentlySavedId(recipe.id);
    window.setTimeout(() => {
      setRecentlySavedId((prev) => (prev === recipe.id ? null : prev));
    }, 1800);
  };

  const handleLogStapleFood = async (entry: IndianFoodCatalogMeta) => {
    const macros = getIndianFoodPortionSummary(entry.food);
    const chosenSlot: MealEntry['mealType'] =
      slotFilter !== 'All'
        ? slotFilter
        : entry.food.category === 'Carbs & Grains'
          ? 'Breakfast'
          : 'Dinner';
    await onQuickLogFood({
      name: `${entry.food.name} (${entry.food.servingHint})`,
      mealType: chosenSlot,
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
    });
    setRecentlyLoggedId(entry.food.id);
    window.setTimeout(() => {
      setRecentlyLoggedId((prev) => (prev === entry.food.id ? null : prev));
    }, 1800);
  };

  return (
    <section data-testid="indian-nutrition-section" className="space-y-4">
      {/* Header & Mode Switcher */}
      <div className="hl-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Everyday Staples &amp; Step-by-Step Recipes</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Simple rotis, dals, bowls, and regional recipes with step-by-step instructions.
            </p>
          </div>

          <div className="inline-flex rounded-xl hl-subtle border p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('recipes')}
              className={`no-touch-delay min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                viewMode === 'recipes'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Recipes ({INDIAN_RECIPES_CATALOG.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('foods')}
              className={`no-touch-delay min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                viewMode === 'foods'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Indian Foods ({INDIAN_FOOD_META_LIST.length})
            </button>
          </div>
        </div>

        {/* Search + Meal Slot Filter */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-7 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search paneer, soya keema, moong chilla, sattu, tandoori, dal..."
              className="w-full min-h-[44px] hl-input rounded-xl pl-10 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="no-touch-delay absolute right-2 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="md:col-span-5">
            <select
              value={slotFilter}
              onChange={(e) => setSlotFilter(e.target.value as 'All' | MealEntry['mealType'])}
              aria-label="Filter by meal timing"
              className="w-full min-h-[44px] hl-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {MEAL_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot === 'All' ? 'All Meal Timings' : `Meal Timing: ${slot}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Progressive-Disclosure Dietary Preference Filter */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowDietFilters((v) => !v)}
              className="no-touch-delay min-h-[38px] px-3 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-sky-500 transition-colors"
            >
              {showDietFilters
                ? 'Hide Dietary Preferences'
                : `Dietary Preference: ${dietFilter}`}
            </button>
            {dietFilter !== 'All' && (
              <button
                type="button"
                onClick={() => setDietFilter('All')}
                className="no-touch-delay text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline"
              >
                Show All
              </button>
            )}
          </div>

          {showDietFilters && (
            <div
              role="tablist"
              aria-label="Dietary preferences"
              className="flex flex-wrap gap-1.5"
            >
              {DIET_TABS.map((tab) => {
                const active = dietFilter === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setDietFilter(tab)}
                    className={`no-touch-delay min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-500'
                        : 'hl-subtle text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recipes Grid View */}
      {viewMode === 'recipes' ? (
        filteredRecipes.length === 0 ? (
          <div className="hl-card rounded-2xl p-8 text-center">
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
              No Indian recipes match your current filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setDietFilter('All');
                setSlotFilter('All');
                setSearchQuery('');
              }}
              className="no-touch-delay mt-3 min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 text-xs font-semibold text-white hover:bg-blue-500"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredRecipes.map((recipe) => {
              const isLogged = recentlyLoggedId === recipe.id;
              const alreadySaved =
                savedNamesSet.has(recipe.name.trim().toLowerCase()) ||
                recentlySavedId === recipe.id;
              const videoInfo = getIndianNutritionRecipeVideo(recipe);

              return (
                <article
                  key={recipe.id}
                  className="hl-card rounded-2xl p-4 flex flex-col justify-between gap-3 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                          {recipe.regionTag} · {videoInfo.cookingStyle}
                        </p>
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5 leading-snug">
                          {recipe.name}
                        </h3>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums flex items-center gap-1 shrink-0">
                        <Clock className="w-3.5 h-3.5" />
                        {recipe.prepMinutes + recipe.cookMinutes}m
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {recipe.summary}
                    </p>

                    <div className="pt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-200 border-t border-slate-200 dark:border-slate-800">
                      <span className="font-bold text-amber-700 dark:text-amber-300">
                        {recipe.calories} kcal
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {recipe.proteinG}g Protein
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{recipe.carbsG}g Carbs</span>
                      <span aria-hidden="true">·</span>
                      <span>{recipe.fatG}g Fat</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRecipe(recipe);
                        setTargetLogSlot(recipe.recommendedSlot);
                      }}
                      className="no-touch-delay flex-1 min-h-[42px] px-3 py-2 rounded-xl hl-subtle border text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-blue-500 transition-colors"
                    >
                      Steps ({recipe.steps.length})
                    </button>

                    <a
                      href={videoInfo.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`indian-nutrition-video-${recipe.id}`}
                      className="no-touch-delay min-h-[42px] px-3 py-2 rounded-xl hl-subtle border text-xs font-semibold text-sky-700 dark:text-sky-300 hover:border-sky-400 inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <PlayCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Video</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>

                    <button
                      type="button"
                      onClick={() => void handleLogRecipe(recipe)}
                      className={`no-touch-delay min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                        isLogged
                          ? 'bg-emerald-600 text-white'
                          : 'bg-sky-600 hover:bg-sky-500 text-white'
                      }`}
                    >
                      {isLogged ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Logged</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Log {recipe.recommendedSlot}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={alreadySaved}
                      onClick={() => void handleSaveRecipeTemplate(recipe)}
                      title={
                        alreadySaved ? 'Saved in Quick Add Meals' : 'Save to Custom Meals'
                      }
                      className={`no-touch-delay min-h-[42px] px-2.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
                        alreadySaved
                          ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 cursor-default'
                          : 'hl-subtle text-slate-700 dark:text-slate-300 hover:border-blue-500'
                      }`}
                    >
                      {alreadySaved ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <BookmarkPlus className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : (
        /* Indian Staples Quick Macro List */
        <div className="hl-card rounded-2xl divide-y divide-slate-200 dark:divide-slate-800/80">
          {filteredIndianFoods.map((entry) => {
            const { food } = entry;
            const macros = getIndianFoodPortionSummary(food);
            const isLogged = recentlyLoggedId === food.id;
            return (
              <div
                key={food.id}
                className="p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {food.name}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                    {food.servingHint} ·{' '}
                    <span className="text-amber-700 dark:text-amber-300 font-semibold">
                      {macros.calories} kcal
                    </span>{' '}
                    ·{' '}
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      {macros.proteinG}g P
                    </span>{' '}
                    · <span>{macros.carbsG}g C</span> · <span>{macros.fatG}g F</span> ·{' '}
                    <span className="font-sans text-slate-500">{entry.dietTags.join(' / ')}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleLogStapleFood(entry)}
                  className={`no-touch-delay min-h-[42px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors ${
                    isLogged
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  {isLogged ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Added Today</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Log Portion</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Recipe Step-by-Step Pop-Up Modal */}
      {selectedRecipe && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="indian-recipe-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedRecipe(null)}
        >
          <div
            className="hl-card rounded-3xl max-w-xl w-full max-h-[88vh] overflow-y-auto p-5 sm:p-6 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {selectedRecipe.regionTag} · {selectedRecipe.dietPreference.join(' · ')}
                </p>
                <h3
                  id="indian-recipe-modal-title"
                  className="text-lg font-bold text-slate-900 dark:text-white mt-0.5"
                >
                  {selectedRecipe.name}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-mono tabular-nums">
                  Prep {selectedRecipe.prepMinutes}m · Cook {selectedRecipe.cookMinutes}m ·
                  Serving: {selectedRecipe.servingLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecipe(null)}
                aria-label="Close recipe dialog"
                className="no-touch-delay min-h-[42px] min-w-[42px] rounded-xl hl-subtle border flex items-center justify-center text-slate-700 dark:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Watch Cooking Video Banner */}
            <a
              href={getIndianNutritionRecipeVideo(selectedRecipe).videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="no-touch-delay w-full min-h-[44px] px-4 py-2.5 rounded-2xl hl-subtle border hover:border-sky-400 flex items-center justify-between gap-3 text-xs font-semibold text-sky-700 dark:text-sky-300"
            >
              <span className="inline-flex items-center gap-2">
                <PlayCircle className="w-4 h-4 shrink-0" />
                <span>
                  Watch Cooking Video · {getIndianNutritionRecipeVideo(selectedRecipe).cookingStyle}
                </span>
              </span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>

            {/* Macro Strip */}
            <div className="grid grid-cols-4 gap-2 hl-subtle border rounded-2xl p-3 text-center font-mono tabular-nums">
              <div>
                <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                  <Flame className="w-3 h-3 text-amber-500" />
                  Calories
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedRecipe.calories} kcal
                </div>
              </div>
              <div>
                <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                  Protein
                </div>
                <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {selectedRecipe.proteinG}g
                </div>
              </div>
              <div>
                <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                  Carbs
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedRecipe.carbsG}g
                </div>
              </div>
              <div>
                <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                  Fats
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedRecipe.fatG}g
                </div>
              </div>
            </div>

            {/* Ingredients */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                Ingredients
              </h4>
              <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                {selectedRecipe.ingredients.map((ing, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-600 dark:text-amber-400 font-bold">·</span>
                    <span>{ing}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Step-by-Step Instructions */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                Step-by-Step Preparation
              </h4>
              <ol className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                {selectedRecipe.steps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                    <span className="w-5 h-5 rounded-md hl-subtle border text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 font-mono tabular-nums">
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="hl-subtle border rounded-2xl p-3 text-xs text-slate-700 dark:text-slate-300">
              <span className="font-bold text-amber-700 dark:text-amber-300">
                Nutritionist Note:{' '}
              </span>
              {selectedRecipe.coachTip}
            </div>

            {/* Log Action Bar */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <select
                value={targetLogSlot}
                onChange={(e) => setTargetLogSlot(e.target.value as MealEntry['mealType'])}
                aria-label="Choose meal slot to log recipe"
                className="min-h-[44px] hl-input rounded-xl px-3 py-2 text-xs sm:text-sm"
              >
                {(['Breakfast', 'Pre-Workout', 'Post-Workout', 'Dinner', 'Snack'] as const).map(
                  (slot) => (
                    <option key={slot} value={slot}>
                      Log to {slot}
                    </option>
                  )
                )}
              </select>

              <button
                type="button"
                onClick={async () => {
                  await handleLogRecipe(selectedRecipe, targetLogSlot);
                  setSelectedRecipe(null);
                }}
                className="no-touch-delay flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Log Recipe to Today&apos;s {targetLogSlot}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

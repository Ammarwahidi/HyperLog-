import React, { useMemo, useState } from 'react';
import {
  ChefHat,
  Check,
  Clock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  PlayCircle,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  INDIAN_COOKING_STYLE_VIDEOS,
  INDIAN_FOOD_CATALOG,
  IndianCatalogDietTag,
  IndianCatalogRecipe,
  getIndianCatalogVideoMeta,
  searchIndianFoodCatalog,
} from '../data/indianFoodCatalog';
import type { MealEntry } from '../types/workout';
import { ExpandableInfoDropdown } from './ExpandableInfoDropdown';

export interface IndianCatalogExplorerSectionProps {
  onAddRecipeToDailyLog: (params: {
    name: string;
    mealType: MealEntry['mealType'];
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }) => Promise<void>;
}

const DIET_FILTER_OPTIONS: IndianCatalogDietTag[] = [
  'All',
  'Vegetarian',
  'High-Protein Veg',
  'Vegan',
  'Eggetarian',
  'Non-Vegetarian',
];

const MEAL_TYPE_OPTIONS: MealEntry['mealType'][] = [
  'Breakfast',
  'Pre-Workout',
  'Post-Workout',
  'Dinner',
  'Snack',
];

export const IndianCatalogExplorerSection: React.FC<IndianCatalogExplorerSectionProps> = ({
  onAddRecipeToDailyLog,
}) => {
  const [query, setQuery] = useState<string>('');
  const [dietFilter, setDietFilter] = useState<IndianCatalogDietTag>('All');
  const [mealFilter, setMealFilter] = useState<'All' | MealEntry['mealType']>('All');
  const [targetMealSlot, setTargetMealSlot] = useState<'recommended' | MealEntry['mealType']>(
    'recommended'
  );
  const [portionMultiplier, setPortionMultiplier] = useState<number>(1);
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [justLoggedId, setJustLoggedId] = useState<string | null>(null);

  const matchingRecipes = useMemo(
    () =>
      searchIndianFoodCatalog({
        query,
        dietTag: dietFilter,
        mealType: mealFilter,
      }),
    [query, dietFilter, mealFilter]
  );

  const handleLogRecipe = async (recipe: IndianCatalogRecipe) => {
    const slot: MealEntry['mealType'] =
      targetMealSlot === 'recommended' ? recipe.defaultMealType : targetMealSlot;
    const calories = Math.max(1, Math.round(recipe.macros.calories * portionMultiplier));
    const proteinG = Math.max(0, Math.round(recipe.macros.proteinG * portionMultiplier));
    const carbsG = Math.max(0, Math.round(recipe.macros.carbsG * portionMultiplier));
    const fatG = Math.max(0, Math.round(recipe.macros.fatG * portionMultiplier));
    const labelSuffix =
      portionMultiplier === 1 ? recipe.servingSize : `${portionMultiplier}× ${recipe.servingSize}`;

    await onAddRecipeToDailyLog({
      name: `${recipe.name} (${labelSuffix})`,
      mealType: slot,
      calories,
      proteinG,
      carbsG,
      fatG,
    });

    setJustLoggedId(recipe.id);
    window.setTimeout(() => {
      setJustLoggedId((prev) => (prev === recipe.id ? null : prev));
    }, 2200);
  };

  return (
    <section
      data-testid="indian-food-catalog-section"
      aria-label="Curated Indian Recipe Catalog"
      className="hl-card rounded-3xl p-4 sm:p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Home-Style Indian Meals &amp; Video Guides</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Browse comforting regional dishes, watch quick cooking guides, or add a meal in one tap.
          </p>
        </div>

        <span className="text-xs font-mono tabular-nums font-semibold text-slate-500 dark:text-slate-400 shrink-0">
          {matchingRecipes.length} of {INDIAN_FOOD_CATALOG.length} dishes
        </span>
      </div>

      {/* Curated Indian Cooking Styles & Recipe Video Showcase Dropdown */}
      <ExpandableInfoDropdown
        testId="indian-video-showcase-dropdown"
        title="Regional Cooking Styles & Video Guides"
        subtitle="Tandoori Grill · Double-Tadka Dal · South Indian Pesarattu · Bhuna · Chettinad · Coastal"
        icon={<PlayCircle className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
        defaultOpen={true}
        className="hl-subtle border"
      >
        <div
          data-testid="indian-video-showcase-grid"
          className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
        >
          {INDIAN_COOKING_STYLE_VIDEOS.map((item) => (
            <a
              key={item.id}
              href={item.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`indian-style-video-${item.id}`}
              className="no-touch-delay p-3 rounded-2xl hl-card border hover:border-sky-500 transition-colors flex items-center justify-between gap-3 group"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 truncate">
                  {item.cookingStyle} · {item.region}
                </p>
                <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                  {item.dishTitle}
                </p>
                <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {item.macrosLabel}
                </p>
              </div>
              <span className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-sky-600 group-hover:bg-sky-500 text-white text-[11px] font-bold inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
                <PlayCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Video</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </span>
            </a>
          ))}
        </div>
      </ExpandableInfoDropdown>

      {/* Simple Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          data-testid="indian-catalog-search-input"
          aria-label="Search curated Indian recipes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Indian dishes (paneer, dal, dosa, chicken, egg bhurji, soya, chilla)…"
          className="w-full min-h-[46px] pl-10 pr-10 py-2.5 text-sm hl-input rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear Indian recipe search"
            className="no-touch-delay min-h-[42px] min-w-[42px] absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Simple 1-Tap Diet Buttons */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {DIET_FILTER_OPTIONS.map((tag) => {
          const isActive = dietFilter === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setDietFilter(tag)}
              className={`no-touch-delay min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-500'
                  : 'hl-subtle text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {/* Extra Portion & Meal Timing Options Tucked Neatly in Dropdown */}
      <ExpandableInfoDropdown
        title="Portion Size & Meal Time Filters"
        subtitle={`Logging ${portionMultiplier}× portion to ${
          targetMealSlot === 'recommended' ? 'Recommended Meal' : targetMealSlot
        }`}
        icon={<SlidersHorizontal className="w-4 h-4" />}
        className="hl-subtle border"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <label className="space-y-1">
            <span className="font-semibold text-slate-700 dark:text-slate-300 block">
              Show Dishes For
            </span>
            <select
              aria-label="Filter Indian recipes by meal timing"
              value={mealFilter}
              onChange={(e) => setMealFilter(e.target.value as 'All' | MealEntry['mealType'])}
              className="w-full min-h-[42px] px-3 text-xs font-semibold hl-input rounded-xl"
            >
              <option value="All">All Meal Times ({INDIAN_FOOD_CATALOG.length})</option>
              {MEAL_TYPE_OPTIONS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot} Only
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-slate-700 dark:text-slate-300 block">
              Add To Which Meal?
            </span>
            <select
              aria-label="Target meal slot for Indian recipe log"
              value={targetMealSlot}
              onChange={(e) =>
                setTargetMealSlot(e.target.value as 'recommended' | MealEntry['mealType'])
              }
              className="w-full min-h-[42px] px-3 text-xs font-semibold hl-input rounded-xl"
            >
              <option value="recommended">Recommended Meal Time</option>
              {MEAL_TYPE_OPTIONS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-slate-700 dark:text-slate-300 block">
              Portion Size
            </span>
            <select
              aria-label="Indian recipe portion multiplier"
              value={portionMultiplier}
              onChange={(e) => setPortionMultiplier(Number(e.target.value) || 1)}
              className="w-full min-h-[42px] px-3 text-xs font-mono tabular-nums font-semibold hl-input rounded-xl"
            >
              <option value={0.5}>Half Portion (0.5×)</option>
              <option value={1}>Regular Portion (1×)</option>
              <option value={1.5}>Large Portion (1.5×)</option>
              <option value={2}>Double Portion (2×)</option>
            </select>
          </label>
        </div>
      </ExpandableInfoDropdown>

      {/* Clean Recipe Cards Grid */}
      {matchingRecipes.length === 0 ? (
        <div className="py-8 text-center space-y-2.5 hl-subtle rounded-2xl border">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            No Indian dishes match &ldquo;{query}&rdquo;
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setDietFilter('All');
              setMealFilter('All');
            }}
            className="no-touch-delay min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
          >
            Show All Indian Recipes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[620px] overflow-y-auto pr-1">
          {matchingRecipes.map((recipe) => {
            const isExpanded = expandedRecipeId === recipe.id;
            const isLogged = justLoggedId === recipe.id;
            const kcal = Math.round(recipe.macros.calories * portionMultiplier);
            const prot = Math.round(recipe.macros.proteinG * portionMultiplier);
            const carbs = Math.round(recipe.macros.carbsG * portionMultiplier);
            const fat = Math.round(recipe.macros.fatG * portionMultiplier);
            const fiber = Math.round(recipe.macros.fiberG * portionMultiplier);
            const videoMeta = getIndianCatalogVideoMeta(recipe);

            return (
              <div
                key={recipe.id}
                data-testid={`indian-catalog-item-${recipe.id}`}
                className="p-4 rounded-2xl hl-subtle border flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {recipe.region}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{videoMeta.cookingStyle}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="w-3 h-3" />
                      {recipe.prepTimeMin + recipe.cookTimeMin}m
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                    {recipe.name}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {recipe.servingSize} · {recipe.defaultMealType}
                  </p>

                  {/* Calm Single-Line Nourishment Summary */}
                  <div className="pt-1.5 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-slate-900 dark:text-white">{kcal} kcal</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {prot}g protein
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{carbs}g carbs</span>
                    <span aria-hidden="true">·</span>
                    <span>{fat}g fat</span>
                  </div>
                </div>

                {/* Primary 1-Tap Action + Recipe Video Link + Expandable Steps */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    data-testid={`indian-catalog-log-${recipe.id}`}
                    onClick={() => void handleLogRecipe(recipe)}
                    className={`no-touch-delay flex-1 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      isLogged
                        ? 'bg-emerald-600 text-white'
                        : 'bg-sky-600 hover:bg-sky-500 text-white'
                    }`}
                  >
                    {isLogged ? (
                      <>
                        <Check className="w-4 h-4 shrink-0" />
                        <span>Added to Today</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 shrink-0" />
                        <span>Add to Log</span>
                      </>
                    )}
                  </button>

                  <a
                    href={videoMeta.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`indian-recipe-video-${recipe.id}`}
                    className="no-touch-delay min-h-[44px] px-3 py-2 rounded-xl hl-card border text-xs font-semibold text-sky-700 dark:text-sky-300 hover:border-sky-400 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <PlayCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Recipe Video</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedRecipeId((prev) => (prev === recipe.id ? null : recipe.id))
                    }
                    aria-expanded={isExpanded}
                    className="no-touch-delay min-h-[44px] px-3 py-2 rounded-xl hl-card border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <span>{isExpanded ? 'Hide Steps' : 'Steps'}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {isExpanded && (
                  <div className="p-3.5 rounded-xl hl-card border space-y-3 text-xs">
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {recipe.description} ({fiber}g fiber · {recipe.dietaryTags.join(' · ')})
                    </p>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-900 dark:text-white">Ingredients</h4>
                      <ul className="space-y-1 text-slate-600 dark:text-slate-300 list-disc pl-4">
                        {recipe.ingredients.map((ing, i) => (
                          <li key={i}>{ing}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-900 dark:text-white">Easy Steps</h4>
                      <ol className="space-y-1 text-slate-600 dark:text-slate-300 list-decimal pl-4">
                        {recipe.instructions.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

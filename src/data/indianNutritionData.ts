import type { MealEntry, OfflineFoodItem } from '../types/workout';
import { computeFoodItemMacros } from './offlineFoodCatalog';

export type IndianDietPreference =
  | 'All'
  | 'Vegetarian'
  | 'High-Protein Veg'
  | 'Vegan'
  | 'Eggetarian'
  | 'Non-Vegetarian';

export interface IndianRecipeItem {
  id: string;
  name: string;
  regionTag: string;
  dietPreference: Exclude<IndianDietPreference, 'All'>[];
  recommendedSlot: MealEntry['mealType'];
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  servingLabel: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  summary: string;
  ingredients: string[];
  steps: string[];
  coachTip: string;
  cookingStyle?: string;
  videoUrl?: string;
}

const NUTRITION_RECIPE_VIDEOS: Record<string, { cookingStyle: string; videoUrl: string }> = {
  rcp_paneer_bhurji_phulka: {
    cookingStyle: 'North Indian Tawa Paneer Scramble',
    videoUrl: 'https://www.youtube.com/results?search_query=high+protein+low+oil+paneer+bhurji+roti+recipe',
  },
  rcp_moong_chilla_paneer: {
    cookingStyle: 'Cast-Iron Sprouted Lentil Crepe',
    videoUrl: 'https://www.youtube.com/results?search_query=green+moong+dal+chilla+paneer+stuffing+recipe',
  },
  rcp_soya_keema_matar: {
    cookingStyle: 'Dhaba Bhuna Masala Simmer',
    videoUrl: 'https://www.youtube.com/results?search_query=healthy+soya+granules+keema+matar+indian+recipe',
  },
  rcp_kala_chana_chaat: {
    cookingStyle: 'Street-Style Zero-Oil Chaat',
    videoUrl: 'https://www.youtube.com/results?search_query=boiled+kala+chana+chaat+high+protein+indian+snack',
  },
  rcp_tofu_palak_bhakri: {
    cookingStyle: 'Blanched Greens & Millet Flatbread',
    videoUrl: 'https://www.youtube.com/results?search_query=indian+palak+tofu+curry+jowar+bhakri+recipe',
  },
  rcp_sattu_buttermilk_drink: {
    cookingStyle: 'Traditional Whisked Savory Cooler',
    videoUrl: 'https://www.youtube.com/results?search_query=roasted+chana+sattu+chaas+protein+drink+recipe',
  },
  rcp_idli_sambar_protein: {
    cookingStyle: 'South Indian Fermented Steam & Dal Sambar',
    videoUrl: 'https://www.youtube.com/results?search_query=soft+idli+and+high+protein+toor+dal+sambar+recipe',
  },
  rcp_rajma_rice_bowl: {
    cookingStyle: 'Punjabi Pressure-Cooked Bean Gravy',
    videoUrl: 'https://www.youtube.com/results?search_query=authentic+punjabi+rajma+masala+steamed+rice+recipe',
  },
  rcp_dahi_tadka_khichdi: {
    cookingStyle: 'One-Pot Comfort Dal Khichdi & Tadka',
    videoUrl: 'https://www.youtube.com/results?search_query=moong+dal+khichdi+with+dahi+tadka+recipe',
  },
  rcp_masala_egg_bhurji: {
    cookingStyle: 'Mumbai Tawa Street Egg Scramble',
    videoUrl: 'https://www.youtube.com/results?search_query=mumbai+masala+egg+bhurji+high+protein+recipe',
  },
  rcp_boiled_egg_tawa_masala: {
    cookingStyle: 'Spiced Tawa-Seared Egg Halves',
    videoUrl: 'https://www.youtube.com/results?search_query=egg+tawa+masala+fry+healthy+indian+recipe',
  },
  rcp_tandoori_chicken_tikka: {
    cookingStyle: 'Air-Fryer / Oven Tandoori Roast',
    videoUrl: 'https://www.youtube.com/results?search_query=air+fryer+tandoori+chicken+tikka+breast+recipe',
  },
  rcp_pepper_chicken_sukka: {
    cookingStyle: 'South Indian Pepper-Fennel Dry Roast',
    videoUrl: 'https://www.youtube.com/results?search_query=south+indian+pepper+chicken+sukka+dry+roast+recipe',
  },
  rcp_malabar_fish_curry_rice: {
    cookingStyle: 'Coastal Kokum & Curry-Leaf Poach',
    videoUrl: 'https://www.youtube.com/results?search_query=coastal+kokum+fish+curry+red+rice+indian+recipe',
  },
};

export function getIndianNutritionRecipeVideo(recipe: IndianRecipeItem): {
  cookingStyle: string;
  videoUrl: string;
} {
  const found = NUTRITION_RECIPE_VIDEOS[recipe.id];
  if (found) return found;
  return {
    cookingStyle: recipe.cookingStyle ?? recipe.regionTag,
    videoUrl:
      recipe.videoUrl ??
      `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${recipe.name} indian recipe`
      )}`,
  };
}

export interface IndianFoodCatalogMeta {
  food: OfflineFoodItem;
  dietTags: Exclude<IndianDietPreference, 'All'>[];
  keywords: string[];
}

export const INDIAN_FOOD_META_LIST: IndianFoodCatalogMeta[] = [
  {
    food: {
      id: 'ind_paneer_lowfat',
      name: 'Low-Fat Paneer (Indian Cottage Cheese)',
      category: 'Protein',
      defaultServingG: 150,
      servingHint: '150g cubed',
      per100gProtein: 20.0,
      per100gCarbs: 3.4,
      per100gFat: 9.2,
    },
    dietTags: ['Vegetarian', 'High-Protein Veg'],
    keywords: ['indian', 'paneer', 'cottage cheese', 'bhurji', 'tikka'],
  },
  {
    food: {
      id: 'ind_paneer_malai',
      name: 'Fresh Malai Paneer',
      category: 'Dairy & Shakes',
      defaultServingG: 100,
      servingHint: '100g block',
      per100gProtein: 18.8,
      per100gCarbs: 3.8,
      per100gFat: 22.0,
    },
    dietTags: ['Vegetarian', 'High-Protein Veg'],
    keywords: ['indian', 'paneer', 'dairy'],
  },
  {
    food: {
      id: 'ind_soya_chunks_dry',
      name: 'Soya Chunks / Meal Maker (Dry Weight)',
      category: 'Protein',
      defaultServingG: 50,
      servingHint: '50g dry (~150g boiled)',
      per100gProtein: 52.0,
      per100gCarbs: 33.0,
      per100gFat: 1.0,
    },
    dietTags: ['Vegan', 'Vegetarian', 'High-Protein Veg'],
    keywords: ['indian', 'soya', 'soy', 'wadi', 'keema', 'plant protein'],
  },
  {
    food: {
      id: 'ind_moong_dal_tadka',
      name: 'Yellow Moong Dal Tadka (Cooked)',
      category: 'Protein',
      defaultServingG: 200,
      servingHint: '200g (1 katori)',
      per100gProtein: 6.8,
      per100gCarbs: 15.6,
      per100gFat: 2.1,
    },
    dietTags: ['Vegan', 'Vegetarian', 'High-Protein Veg'],
    keywords: ['indian', 'dal', 'moong', 'lentils'],
  },
  {
    food: {
      id: 'ind_toor_masoor_dal',
      name: 'Toor / Masoor Dal Fry (Cooked)',
      category: 'Protein',
      defaultServingG: 200,
      servingHint: '200g (1 katori)',
      per100gProtein: 6.4,
      per100gCarbs: 16.5,
      per100gFat: 2.5,
    },
    dietTags: ['Vegan', 'Vegetarian'],
    keywords: ['indian', 'toor', 'arhar', 'masoor', 'dal'],
  },
  {
    food: {
      id: 'ind_rajma_masala',
      name: 'Punjabi Rajma Masala (Cooked)',
      category: 'Protein',
      defaultServingG: 220,
      servingHint: '220g bowl',
      per100gProtein: 6.5,
      per100gCarbs: 17.8,
      per100gFat: 2.8,
    },
    dietTags: ['Vegan', 'Vegetarian'],
    keywords: ['indian', 'rajma', 'kidney beans', 'curry'],
  },
  {
    food: {
      id: 'ind_chole_masala',
      name: 'Chana / Chole Masala (Cooked)',
      category: 'Protein',
      defaultServingG: 220,
      servingHint: '220g bowl',
      per100gProtein: 6.8,
      per100gCarbs: 18.6,
      per100gFat: 3.2,
    },
    dietTags: ['Vegan', 'Vegetarian'],
    keywords: ['indian', 'chole', 'chana', 'chickpeas'],
  },
  {
    food: {
      id: 'ind_kala_chana_sprouts',
      name: 'Steamed Kala Chana & Moong Sprouts',
      category: 'Protein',
      defaultServingG: 180,
      servingHint: '180g chaat bowl',
      per100gProtein: 8.2,
      per100gCarbs: 17.5,
      per100gFat: 1.4,
    },
    dietTags: ['Vegan', 'Vegetarian', 'High-Protein Veg'],
    keywords: ['indian', 'sprouts', 'kala chana', 'chaat'],
  },
  {
    food: {
      id: 'ind_whole_wheat_roti',
      name: 'Whole Wheat Phulka / Roti (No Ghee)',
      category: 'Carbs & Grains',
      defaultServingG: 70,
      servingHint: '70g (2 medium rotis)',
      per100gProtein: 9.8,
      per100gCarbs: 59.5,
      per100gFat: 2.4,
    },
    dietTags: ['Vegan', 'Vegetarian'],
    keywords: ['indian', 'roti', 'chapati', 'phulka', 'atta'],
  },
  {
    food: {
      id: 'ind_ragi_jowar_roti',
      name: 'Ragi / Jowar Millet Bhakri',
      category: 'Carbs & Grains',
      defaultServingG: 80,
      servingHint: '80g (2 millet rotis)',
      per100gProtein: 8.2,
      per100gCarbs: 56.4,
      per100gFat: 2.3,
    },
    dietTags: ['Vegan', 'Vegetarian'],
    keywords: ['indian', 'ragi', 'jowar', 'bajra', 'millet', 'bhakri'],
  },
  {
    food: {
      id: 'ind_basmati_rice_cooked',
      name: 'Steamed Basmati Rice (Cooked)',
      category: 'Carbs & Grains',
      defaultServingG: 180,
      servingHint: '180g (1 cooked cup)',
      per100gProtein: 2.7,
      per100gCarbs: 26.2,
      per100gFat: 0.4,
    },
    dietTags: ['Vegan', 'Vegetarian'],
    keywords: ['indian', 'basmati', 'rice', 'chawal'],
  },
  {
    food: {
      id: 'ind_kanda_poha',
      name: 'Kanda Poha with Peanuts',
      category: 'Carbs & Grains',
      defaultServingG: 200,
      servingHint: '200g breakfast plate',
      per100gProtein: 3.6,
      per100gCarbs: 22.4,
      per100gFat: 4.1,
    },
    dietTags: ['Vegan', 'Vegetarian'],
    keywords: ['indian', 'poha', 'flattened rice', 'breakfast'],
  },
  {
    food: {
      id: 'ind_idli_sambar',
      name: 'Steamed Rice Idli with Sambar',
      category: 'Carbs & Grains',
      defaultServingG: 240,
      servingHint: '3 idlis + sambar (240g)',
      per100gProtein: 4.4,
      per100gCarbs: 22.5,
      per100gFat: 1.3,
    },
    dietTags: ['Vegan', 'Vegetarian'],
    keywords: ['indian', 'south indian', 'idli', 'sambar'],
  },
  {
    food: {
      id: 'ind_moong_dal_chilla',
      name: 'Moong Dal Chilla / Pesarattu',
      category: 'Protein',
      defaultServingG: 160,
      servingHint: '2 chillas (160g)',
      per100gProtein: 11.5,
      per100gCarbs: 21.0,
      per100gFat: 4.8,
    },
    dietTags: ['Vegan', 'Vegetarian', 'High-Protein Veg'],
    keywords: ['indian', 'chilla', 'cheela', 'pesarattu', 'moong'],
  },
  {
    food: {
      id: 'ind_plain_dosa_sambar',
      name: 'Crisp Sada Dosa with Sambar',
      category: 'Carbs & Grains',
      defaultServingG: 200,
      servingHint: '1 dosa + sambar (200g)',
      per100gProtein: 4.2,
      per100gCarbs: 25.0,
      per100gFat: 3.5,
    },
    dietTags: ['Vegan', 'Vegetarian'],
    keywords: ['indian', 'south indian', 'dosa', 'sambar'],
  },
  {
    food: {
      id: 'ind_vegetable_upma',
      name: 'Vegetable Rava / Oats Upma',
      category: 'Carbs & Grains',
      defaultServingG: 200,
      servingHint: '200g bowl',
      per100gProtein: 3.8,
      per100gCarbs: 20.5,
      per100gFat: 3.6,
    },
    dietTags: ['Vegetarian'],
    keywords: ['indian', 'upma', 'suji', 'semolina'],
  },
  {
    food: {
      id: 'ind_moong_khichdi',
      name: 'Moong Dal Khichdi (Homestyle)',
      category: 'Carbs & Grains',
      defaultServingG: 260,
      servingHint: '260g bowl',
      per100gProtein: 4.8,
      per100gCarbs: 20.0,
      per100gFat: 2.3,
    },
    dietTags: ['Vegetarian'],
    keywords: ['indian', 'khichdi', 'dal', 'comfort'],
  },
  {
    food: {
      id: 'ind_dahi_curd_toned',
      name: 'Homemade Toned Dahi / Curd',
      category: 'Dairy & Shakes',
      defaultServingG: 200,
      servingHint: '200g bowl',
      per100gProtein: 4.2,
      per100gCarbs: 4.6,
      per100gFat: 3.0,
    },
    dietTags: ['Vegetarian'],
    keywords: ['indian', 'dahi', 'curd', 'raita', 'probiotic'],
  },
  {
    food: {
      id: 'ind_masala_chaas',
      name: 'Spiced Masala Chaas / Buttermilk',
      category: 'Dairy & Shakes',
      defaultServingG: 300,
      servingHint: '300ml glass',
      per100gProtein: 1.6,
      per100gCarbs: 1.8,
      per100gFat: 1.0,
    },
    dietTags: ['Vegetarian'],
    keywords: ['indian', 'chaas', 'buttermilk', 'lassi'],
  },
  {
    food: {
      id: 'ind_chana_sattu_flour',
      name: 'Roasted Chana Sattu (Drink / Flour)',
      category: 'Protein',
      defaultServingG: 50,
      servingHint: '50g in chilled water',
      per100gProtein: 22.4,
      per100gCarbs: 60.2,
      per100gFat: 5.2,
    },
    dietTags: ['Vegan', 'Vegetarian', 'High-Protein Veg'],
    keywords: ['indian', 'sattu', 'bihari', 'pre workout', 'drink'],
  },
  {
    food: {
      id: 'ind_roasted_makhana',
      name: 'Dry-Roasted Makhana (Fox Nuts)',
      category: 'Carbs & Grains',
      defaultServingG: 35,
      servingHint: '35g large bowl',
      per100gProtein: 9.7,
      per100gCarbs: 76.9,
      per100gFat: 0.6,
    },
    dietTags: ['Vegan', 'Vegetarian'],
    keywords: ['indian', 'makhana', 'fox nuts', 'lotus seeds', 'snack'],
  },
  {
    food: {
      id: 'ind_besan_chilla',
      name: 'Spiced Besan Chilla (Gram Flour)',
      category: 'Protein',
      defaultServingG: 140,
      servingHint: '2 chillas (140g)',
      per100gProtein: 10.2,
      per100gCarbs: 23.0,
      per100gFat: 6.2,
    },
    dietTags: ['Vegan', 'Vegetarian', 'High-Protein Veg'],
    keywords: ['indian', 'besan', 'chilla', 'gram flour'],
  },
  {
    food: {
      id: 'ind_anda_bhurji',
      name: 'Mumbai-Style Anda Bhurji (Egg Scramble)',
      category: 'Protein',
      defaultServingG: 200,
      servingHint: '200g plate (3 whole + 2 whites)',
      per100gProtein: 13.2,
      per100gCarbs: 2.6,
      per100gFat: 9.0,
    },
    dietTags: ['Eggetarian'],
    keywords: ['indian', 'egg', 'anda', 'bhurji'],
  },
  {
    food: {
      id: 'ind_tandoori_chicken_tikka',
      name: 'Tandoori Chicken Breast Tikka (Grilled)',
      category: 'Protein',
      defaultServingG: 200,
      servingHint: '200g grilled tikka',
      per100gProtein: 26.5,
      per100gCarbs: 2.2,
      per100gFat: 5.4,
    },
    dietTags: ['Non-Vegetarian'],
    keywords: ['indian', 'tandoori', 'chicken', 'tikka', 'murgh'],
  },
  {
    food: {
      id: 'ind_homestyle_chicken_curry',
      name: 'Homestyle Dhaba Chicken Curry',
      category: 'Protein',
      defaultServingG: 220,
      servingHint: '220g bowl',
      per100gProtein: 16.5,
      per100gCarbs: 4.2,
      per100gFat: 8.2,
    },
    dietTags: ['Non-Vegetarian'],
    keywords: ['indian', 'chicken curry', 'murgh'],
  },
  {
    food: {
      id: 'ind_coastal_fish_curry',
      name: 'Coastal Rohu / Surmai Fish Curry',
      category: 'Protein',
      defaultServingG: 220,
      servingHint: '220g bowl',
      per100gProtein: 15.8,
      per100gCarbs: 2.8,
      per100gFat: 6.8,
    },
    dietTags: ['Non-Vegetarian'],
    keywords: ['indian', 'fish', 'machher jhol', 'surmai', 'curry'],
  },
  {
    food: {
      id: 'ind_cow_desi_ghee',
      name: 'Pure Cow Desi Ghee',
      category: 'Healthy Fats',
      defaultServingG: 5,
      servingHint: '5g (1 tsp)',
      per100gProtein: 0,
      per100gCarbs: 0,
      per100gFat: 99.5,
    },
    dietTags: ['Vegetarian'],
    keywords: ['indian', 'ghee', 'clarified butter'],
  },
];

export const INDIAN_OFFLINE_FOOD_ITEMS: OfflineFoodItem[] = INDIAN_FOOD_META_LIST.map(
  (entry) => entry.food
);

export function getIndianFoodPortionSummary(food: OfflineFoodItem) {
  return computeFoodItemMacros(food, food.defaultServingG);
}

export const INDIAN_RECIPES_CATALOG: IndianRecipeItem[] = [
  {
    id: 'rcp_paneer_bhurji_roti',
    name: 'High-Protein Paneer Bhurji & 2 Phulkas',
    regionTag: 'North Indian · Post-Workout Classic',
    dietPreference: ['Vegetarian', 'High-Protein Veg'],
    recommendedSlot: 'Post-Workout',
    prepMinutes: 8,
    cookMinutes: 12,
    servings: 1,
    servingLabel: '200g Bhurji + 2 Phulkas',
    calories: 515,
    proteinG: 39,
    carbsG: 48,
    fatG: 18,
    summary:
      'Crumbled low-fat paneer sautéed with onion, tomato, ginger, green chilli, and kasuri methi paired with whole-wheat phulkas.',
    ingredients: [
      '160 g low-fat paneer (crumbled by hand)',
      '2 medium whole-wheat phulkas (70 g atta total)',
      '1 medium onion & 1 ripe tomato, finely chopped',
      '1 tsp ginger-garlic paste, 1 green chilli, ½ tsp jeera',
      '½ tsp turmeric, ¾ tsp coriander powder, ½ tsp garam masala, kasuri methi',
      '1 tsp desi ghee or cold-pressed mustard oil, fresh coriander',
    ],
    steps: [
      'Warm 1 tsp ghee in a non-stick skillet over medium heat and crackle cumin seeds with ginger-garlic and green chilli for 30 seconds.',
      'Sauté chopped onions until translucent (3 minutes), then stir in tomatoes, turmeric, coriander powder, and salt until pulpy.',
      'Fold in crumbled low-fat paneer and 2 tbsp water so the paneer stays soft and juicy; cook gently for 3 minutes without over-drying.',
      'Finish with crushed kasuri methi, garam masala, and fresh coriander leaves. Serve hot alongside 2 freshly puffed whole-wheat phulkas.',
    ],
    coachTip:
      'Add 2 tbsp whisked curd while folding in the paneer to keep low-fat paneer extra creamy without adding oil.',
  },
  {
    id: 'rcp_soya_keema_matar',
    name: 'Amritsari Soya Keema Matar Bowl',
    regionTag: 'Punjabi · Lean Plant Hypertrophy',
    dietPreference: ['Vegan', 'Vegetarian', 'High-Protein Veg'],
    recommendedSlot: 'Dinner',
    prepMinutes: 10,
    cookMinutes: 15,
    servings: 1,
    servingLabel: '60g dry soya + green peas bowl',
    calories: 385,
    proteinG: 36,
    carbsG: 42,
    fatG: 7,
    summary:
      'Minced soya granules simmered with sweet green peas, roasted cumin, and aromatic tomato-onion masala for 36g complete plant protein.',
    ingredients: [
      '60 g dry soya granules or chunks (boiled 5 mins & squeezed thoroughly)',
      '60 g green peas (matar)',
      '1 onion, 1 tomato puree, 1 tsp ginger juliennes',
      '1 tsp oil, 1 bay leaf, ½ tsp jeera, 1 tsp kitchen king / garam masala',
      'Lemon wedge & fresh mint-coriander garnish',
    ],
    steps: [
      'Boil soya granules in salted water with ¼ tsp turmeric for 5 minutes, rinse in cold water, and squeeze out excess water twice.',
      'Heat 1 tsp oil with bay leaf and jeera; brown finely diced onions well for rich dhaba flavor, then add ginger and tomato puree.',
      'Add spices, green peas, squeezed soya keema, and ½ cup warm water. Cover and simmer 7–8 minutes until masala coats every granule.',
      'Squeeze fresh lemon juice before serving standalone or alongside 1 millet roti.',
    ],
    coachTip:
      'Rinsing and squeezing boiled soya chunks twice completely removes any raw bean aroma and lets them absorb spices.',
  },
  {
    id: 'rcp_moong_chilla_paneer',
    name: 'Stuffed Moong Dal & Paneer Chilla (Pesarattu)',
    regionTag: 'Pan-Indian · High-Protein Breakfast',
    dietPreference: ['Vegetarian', 'High-Protein Veg'],
    recommendedSlot: 'Breakfast',
    prepMinutes: 10,
    cookMinutes: 10,
    servings: 1,
    servingLabel: '2 stuffed chillas + mint chutney',
    calories: 390,
    proteinG: 28,
    carbsG: 38,
    fatG: 12,
    summary:
      'Crispy green or yellow moong lentil crepes filled with spiced grated paneer, bell peppers, and mint-coriander chutney.',
    ingredients: [
      '70 g soaked yellow or whole green moong dal',
      '80 g grated low-fat paneer + finely diced capsicum & onion',
      '1 inch ginger, 1 green chilli, ½ tsp ajwain, pinch of hing',
      '1 tsp oil for cooking both chillas on cast-iron tawa',
      '2 tbsp green pudina-dahi chutney',
    ],
    steps: [
      'Blend soaked moong dal with ginger, green chilli, hing, salt, and minimal water into a smooth pourable dosa-style batter.',
      'Toss grated paneer with diced capsicum, roasted jeera powder, black pepper, and chopped coriander.',
      'Spread a ladle of batter onto a hot greased tawa in circular motion; cook 2 minutes until golden underneath.',
      'Spoon half the spiced paneer filling down the center, fold crisp, and serve with fresh mint chutney.',
    ],
    coachTip:
      'Soak a 3-day batch of moong dal overnight and refrigerate the blended batter for 4-minute weekday breakfasts.',
  },
  {
    id: 'rcp_tofu_palak_millet',
    name: 'Lasooni Tofu Palak with Jowar Bhakri',
    regionTag: 'Western / North · Iron & Fiber Rich',
    dietPreference: ['Vegan', 'Vegetarian', 'High-Protein Veg'],
    recommendedSlot: 'Dinner',
    prepMinutes: 10,
    cookMinutes: 14,
    servings: 1,
    servingLabel: '180g tofu palak + 2 jowar rotis',
    calories: 455,
    proteinG: 31,
    carbsG: 49,
    fatG: 14,
    summary:
      'Silky blanched spinach gravy tempered with smoky roasted garlic and golden firm tofu cubes, served with gluten-free jowar rotis.',
    ingredients: [
      '175 g firm high-protein tofu, cubed',
      '200 g fresh spinach (palak) leaves, blanched & pureed',
      '4 cloves garlic (thinly sliced), ½ onion, 1 green chilli',
      '2 medium jowar / sorghum rotis (75 g flour)',
      '1.5 tsp sesame or olive oil, pinch of nutmeg & kasuri methi',
    ],
    steps: [
      'Pan-sear tofu cubes in ½ tsp oil with a pinch of salt and turmeric until lightly golden on two sides.',
      'Blanch washed spinach leaves in boiling water for 90 seconds, plunge into ice water to lock bright green color, and blend smooth.',
      'Temper sliced garlic and cumin in 1 tsp oil until fragrant golden; sauté onion for 2 minutes, then stir in spinach puree.',
      'Simmer tofu in the palak gravy for 4 minutes with a pinch of nutmeg. Pair warm with 2 soft jowar bhakris.',
    ],
    coachTip:
      'Squeeze lemon over the Lasooni Palak at the table—Vitamin C triples plant iron absorption from spinach.',
  },
  {
    id: 'rcp_sattu_preworkout_cooler',
    name: 'Bihari Roasted Sattu & Lemon Pre-Workout Shaker',
    regionTag: 'East Indian · Zero-Cook Fuel',
    dietPreference: ['Vegan', 'Vegetarian', 'High-Protein Veg'],
    recommendedSlot: 'Pre-Workout',
    prepMinutes: 3,
    cookMinutes: 0,
    servings: 1,
    servingLabel: '1 shaker (400 ml)',
    calories: 215,
    proteinG: 13,
    carbsG: 34,
    fatG: 3,
    summary:
      'Instant cooling roasted-gram drink loaded with sustained complex carbs, electrolytes, black salt, and roasted cumin.',
    ingredients: [
      '55 g roasted chana sattu flour',
      '350 ml chilled water',
      '½ fresh lemon squeezed, ½ tsp kala namak (black salt)',
      '½ tsp roasted jeera powder, finely chopped mint leaves',
    ],
    steps: [
      'Add sattu flour and 80 ml water to a glass or shaker first and whisk into a lump-free paste.',
      'Top up with remaining chilled water, roasted cumin, black salt, lemon juice, and crushed mint.',
      'Shake briskly for 10 seconds and drink 35–45 minutes before lifting or outdoor cardio.',
    ],
    coachTip:
      'Prefer a sweet pre-workout version? Swap black salt & jeera for 1 chopped ripe banana and a pinch of cardamom.',
  },
  {
    id: 'rcp_kala_chana_power_chaat',
    name: 'Sprouted Kala Chana, Pomegranate & Peanut Chaat',
    regionTag: 'Street-Style Clean Snack',
    dietPreference: ['Vegan', 'Vegetarian'],
    recommendedSlot: 'Snack',
    prepMinutes: 7,
    cookMinutes: 5,
    servings: 1,
    servingLabel: '1 large bowl (240 g)',
    calories: 295,
    proteinG: 16,
    carbsG: 41,
    fatG: 7.5,
    summary:
      'Tangy oil-free chaat combining boiled black chickpeas, crunchy cucumber, pomegranate rubies, roasted peanuts, and chaat masala.',
    ingredients: [
      '140 g boiled or sprouted kala chana & green moong',
      '15 g dry-roasted peanuts',
      '½ cucumber, ½ tomato, ¼ red onion, 2 tbsp pomegranate arils',
      '1 tsp chaat masala, roasted jeera, lemon juice, coriander',
    ],
    steps: [
      'Steam or pressure-cook soaked kala chana until tender yet firm to the bite, then cool slightly.',
      'Toss warm chana in a mixing bowl with finely diced cucumber, onion, tomato, and roasted peanuts.',
      'Season generously with chaat masala, roasted jeera, fresh lime juice, and top with pomegranate.',
    ],
    coachTip:
      'Packs cleanly in a lunchbox without getting soggy—keep lemon wedge separate until ready to eat.',
  },
  {
    id: 'rcp_rajma_rice_bowl',
    name: 'Homestyle Kashmiri Rajma & Steamed Rice Bowl',
    regionTag: 'North Indian · Complete Amino Acid Pair',
    dietPreference: ['Vegan', 'Vegetarian'],
    recommendedSlot: 'Dinner',
    prepMinutes: 8,
    cookMinutes: 20,
    servings: 1,
    servingLabel: '220g Rajma + 150g Rice + Kachumber',
    calories: 445,
    proteinG: 18,
    carbsG: 76,
    fatG: 7,
    summary:
      'Slow-simmered red kidney beans in spiced tomato-ginger broth paired with fluffy basmati rice for complete plant protein.',
    ingredients: [
      '70 g raw red rajma (soaked overnight & pressure cooked)',
      '150 g cooked basmati or brown rice',
      '1 onion, 2 tomatoes pureed, 1 tsp ginger-garlic paste',
      '1 tsp oil, ½ tsp Kashmiri chilli, 1 tsp coriander, ½ tsp amchur',
      'Side of crunchy cucumber-radish kachumber salad',
    ],
    steps: [
      'Pressure cook soaked rajma with salt, 1 black cardamom, and water until buttery-soft when pressed.',
      'Sauté onion and ginger-garlic in 1 tsp oil, add tomato puree and dry spices, and cook until rich red.',
      'Pour in cooked rajma with its stock, mash 1 tbsp of beans to naturally thicken the gravy, and simmer 8 minutes.',
      'Serve hot over steamed rice with crisp lemon kachumber salad.',
    ],
    coachTip:
      'Pair with 150g plain toned dahi on the side to bump meal protein from 18g up to 24g.',
  },
  {
    id: 'rcp_masala_oats_dahi_khichdi',
    name: 'Savory Vegetable Dal-Oats Khichdi & Raita',
    regionTag: 'Modern Indian Comfort Recovery',
    dietPreference: ['Vegetarian'],
    recommendedSlot: 'Dinner',
    prepMinutes: 6,
    cookMinutes: 12,
    servings: 1,
    servingLabel: '1 bowl Khichdi + 150g Cucumber Raita',
    calories: 410,
    proteinG: 21,
    carbsG: 56,
    fatG: 10,
    summary:
      'High-beta-glucan rolled oats and split yellow moong dal pressure-cooked with veggies and tempered with jeera-hing tadka.',
    ingredients: [
      '45 g rolled oats + 45 g yellow moong dal (washed)',
      '1 cup mixed carrots, beans, and green peas',
      '150 g low-fat dahi whisked with grated cucumber & roasted jeera',
      '1 tsp cow ghee, ½ tsp mustard & cumin seeds, curry leaves, pinch of hing',
    ],
    steps: [
      'Add washed moong dal, rolled oats, chopped vegetables, turmeric, salt, and 2.5 cups water to a pot or pressure cooker.',
      'Cook for 2 whistles (or 10 minutes covered in a pan) until creamy porridgy khichdi forms.',
      'Finish with a 30-second tadka of 1 tsp ghee, cumin, curry leaves, and hing. Serve alongside cool cucumber raita.',
    ],
    coachTip:
      'Ideal evening recovery meal before early-morning training—gentle on digestion and high in soluble fiber.',
  },
  {
    id: 'rcp_curd_rice_paneer_tadka',
    name: 'South Indian Thayir Sadam (Protein Curd Rice Bowl)',
    regionTag: 'South Indian · Gut-Friendly Cooling Meal',
    dietPreference: ['Vegetarian', 'High-Protein Veg'],
    recommendedSlot: 'Post-Workout',
    prepMinutes: 7,
    cookMinutes: 5,
    servings: 1,
    servingLabel: '1 bowl (360 g)',
    calories: 425,
    proteinG: 24,
    carbsG: 50,
    fatG: 13,
    summary:
      'Probiotic curd rice upgraded with finely diced grilled paneer, grated carrot, pomegranate, and curry-leaf mustard tempering.',
    ingredients: [
      '140 g soft cooked rice (slightly mashed while warm)',
      '220 g thick Greek-style hung curd / toned dahi',
      '70 g small-cubed low-fat paneer (pan-tossed)',
      '1 tsp sesame oil, ½ tsp mustard seeds, urad dal, ginger, curry leaves',
      '2 tbsp grated carrot & pomegranate seeds',
    ],
    steps: [
      'Fold thick whisked dahi, grated carrot, salt, and pan-tossed paneer cubes into cooled soft rice.',
      'Pop mustard seeds, ½ tsp urad dal, finely chopped ginger, green chilli, and curry leaves in 1 tsp oil.',
      'Pour sizzling tempering over the curd rice, garnish with pomegranate arils, and enjoy chilled or room temperature.',
    ],
    coachTip:
      'Swapping half the rice volume for thick hung curd doubles the protein while keeping classic Thayir Sadam creaminess.',
  },
  {
    id: 'rcp_anda_bhurji_multigrain',
    name: 'Mumbai Masala Anda Bhurji (3 Whole + 3 Whites)',
    regionTag: 'Mumbai Irani Cafe Style',
    dietPreference: ['Eggetarian'],
    recommendedSlot: 'Breakfast',
    prepMinutes: 6,
    cookMinutes: 8,
    servings: 1,
    servingLabel: '6-egg bhurji + 2 toasted multigrain slices',
    calories: 455,
    proteinG: 36,
    carbsG: 34,
    fatG: 19,
    summary:
      'Fluffy street-style spiced scrambled eggs cooked with pav bhaji masala, tomatoes, and spring onions for 36g fast-digesting protein.',
    ingredients: [
      '3 whole eggs + 3 liquid egg whites',
      '2 slices sprouted or multigrain bread, toasted dry',
      '1 small onion, 1 tomato, green chilli, fresh coriander',
      '½ tsp pav bhaji masala, ¼ tsp turmeric, 1 tsp butter or olive oil',
    ],
    steps: [
      'Whisk whole eggs and egg whites lightly with a pinch of salt and 1 tbsp water for extra fluffiness.',
      'Sauté finely chopped onion and green chilli in 1 tsp butter until soft; add tomato and pav bhaji masala for 2 minutes.',
      'Lower flame, pour in whisked eggs, and fold gently with a spatula so soft curds form without turning rubbery.',
      'Shower with chopped coriander and serve immediately with crisp multigrain toast.',
    ],
    coachTip:
      'Pull the pan off the burner when the eggs are still 90% set—carryover heat finishes them to restaurant-soft texture.',
  },
  {
    id: 'rcp_egg_tadka_dal',
    name: 'Kolkata Dhaba Egg Tadka Dal',
    regionTag: 'Eastern Highway Dhaba Classic',
    dietPreference: ['Eggetarian'],
    recommendedSlot: 'Dinner',
    prepMinutes: 8,
    cookMinutes: 14,
    servings: 1,
    servingLabel: '1 hearty bowl + 1 phulka',
    calories: 465,
    proteinG: 31,
    carbsG: 46,
    fatG: 16,
    summary:
      'Velvety chana-moong dal folded with ribboned masala scrambled eggs and smoky kasuri methi.',
    ingredients: [
      '200 g cooked chana + moong dal blend',
      '2 whole eggs + 2 egg whites',
      '1 whole-wheat phulka',
      '1 tsp mustard oil or ghee, garlic, ginger, tomato, kasuri methi, garam masala',
    ],
    steps: [
      'Scramble the eggs lightly with salt and turmeric in ½ tsp oil, set aside in coarse ribbons.',
      'Sauté garlic, ginger, onion, and tomato with dhaba spices in ½ tsp ghee; pour in cooked dal and simmer 4 minutes.',
      'Fold scrambled eggs and crushed kasuri methi into the bubbling dal. Serve piping hot with 1 phulka.',
    ],
    coachTip:
      'Combining lentils with eggs creates one of the highest satiety-per-calorie dinners for fat-loss phases.',
  },
  {
    id: 'rcp_tandoori_chicken_tikka_plate',
    name: 'Air-Fryer / Tawa Tandoori Chicken Tikka Platter',
    regionTag: 'North Indian · 54g Lean Protein',
    dietPreference: ['Non-Vegetarian'],
    recommendedSlot: 'Post-Workout',
    prepMinutes: 12,
    cookMinutes: 14,
    servings: 1,
    servingLabel: '220g raw chicken breast + mint curd dip + 1 roti',
    calories: 440,
    proteinG: 54,
    carbsG: 26,
    fatG: 11,
    summary:
      'Juicy hung-curd marinated chicken breast cubes charred with Kashmiri chilli, lemon, and chaat masala.',
    ingredients: [
      '220 g boneless chicken breast, cut into 1.5-inch cubes',
      '3 tbsp thick hung curd, 1 tsp ginger-garlic paste, ½ lemon juice',
      '1 tsp Kashmiri red chilli, ½ tsp tandoori masala, ½ tsp kasuri methi, 1 tsp mustard oil',
      '1 whole-wheat roti + pickled onion rings & mint chutney',
    ],
    steps: [
      'Coat chicken cubes first with lemon juice, salt, and ginger-garlic paste, then toss in spiced hung-curd mustard-oil marinade (15 mins or overnight).',
      'Cook in a preheated air fryer at 200°C for 11–12 minutes (or sear covered on a cast-iron skillet 5 mins per side).',
      'Brush lightly with pan juices, dust chaat masala on top, and serve with onion rings, mint dip, and 1 warm roti.',
    ],
    coachTip:
      'Hung curd + 1 tsp mustard oil seals moisture inside chicken breast so it stays tender for 3 days of meal prep.',
  },
  {
    id: 'rcp_pepper_chicken_rice',
    name: 'Chettinad Pepper Chicken & Steamed Rice',
    regionTag: 'South Indian · Clean Spice Metabolism',
    dietPreference: ['Non-Vegetarian'],
    recommendedSlot: 'Dinner',
    prepMinutes: 10,
    cookMinutes: 18,
    servings: 1,
    servingLabel: '180g chicken sukka + 150g steamed rice',
    calories: 485,
    proteinG: 46,
    carbsG: 48,
    fatG: 11,
    summary:
      'Fragrant dry-roasted black pepper, fennel, and curry leaf chicken breast stir-fry paired with steamed rice.',
    ingredients: [
      '180 g chicken breast or lean thigh strips',
      '150 g cooked steamed rice',
      '1 tsp freshly crushed black peppercorns, ½ tsp fennel (saunf), ½ tsp cumin',
      '1 sprig fresh curry leaves, shallots/onion, ginger-garlic, 1.5 tsp gingelly/coconut oil',
    ],
    steps: [
      'Dry-roast peppercorns, fennel, and cumin seeds for 60 seconds until aromatic, then crush coarsely.',
      'Sauté sliced shallots, curry leaves, and ginger-garlic in 1.5 tsp oil until golden.',
      'Add chicken strips, turmeric, salt, and a splash of water; cook covered 10 minutes until tender.',
      'Toss in the freshly crushed pepper-fennel spice mix on high heat for 2 minutes and serve with steamed rice.',
    ],
    coachTip:
      'Zero heavy cream or cashew paste—pure whole-spice flavor that keeps fats low and recovery carbs clean.',
  },
  {
    id: 'rcp_malabar_fish_curry_rice',
    name: 'Coastal Kokum / Mustard Fish Curry & Red Rice',
    regionTag: 'Coastal Indian · Omega-3 Rich',
    dietPreference: ['Non-Vegetarian'],
    recommendedSlot: 'Dinner',
    prepMinutes: 10,
    cookMinutes: 14,
    servings: 1,
    servingLabel: '180g fish steaks + 150g red/steamed rice',
    calories: 470,
    proteinG: 41,
    carbsG: 46,
    fatG: 13,
    summary:
      'Light, tangy coastal fish curry simmered with turmeric, coriander, ginger, curry leaves, and kokum/tamarind.',
    ingredients: [
      '180 g Rohu, Surmai (Kingfish), or Pomfret fillets',
      '150 g cooked red matta rice or basmati rice',
      '2 kokum petals or 1 tsp tamarind pulp, 1 tomato, 1 green chilli',
      '1 tsp coconut or mustard oil, fenugreek seeds, curry leaves, coriander & Kashmiri chilli',
    ],
    steps: [
      'Marinate washed fish pieces with ¼ tsp turmeric, salt, and lemon juice for 8 minutes.',
      'Temper fenugreek seeds and curry leaves in 1 tsp oil; sauté ginger, onion, tomato, and spice powders into a light broth with 1 cup water and kokum.',
      'Slide fish fillets gently into the simmering tangy gravy and poach 6–7 minutes without stirring roughly.',
      'Swirl the pot gently, rest 3 minutes, and ladle over warm rice.',
    ],
    coachTip:
      'Aim for 2 coastal fish meals per week to naturally hit EPA/DHA omega-3 joint-recovery targets.',
  },
];

export function filterIndianRecipes(
  diet: IndianDietPreference,
  query: string,
  slotFilter: 'All' | MealEntry['mealType'] = 'All'
): IndianRecipeItem[] {
  const q = query.trim().toLowerCase();
  return INDIAN_RECIPES_CATALOG.filter((recipe) => {
    if (diet !== 'All' && !recipe.dietPreference.includes(diet)) {
      return false;
    }
    if (slotFilter !== 'All' && recipe.recommendedSlot !== slotFilter) {
      return false;
    }
    if (!q) return true;
    const hay = `${recipe.name} ${recipe.regionTag} ${recipe.summary} ${recipe.ingredients.join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}

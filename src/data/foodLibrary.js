// Food database. Each food has calorie/macro data per 100g (or per 100ml for
// liquids), plus preset "tiles" for quick logging (variants + portions) as
// specified in the PRD (FR-2.1 - FR-2.4), and search-friendly metadata for
// items that aren't in a meal's curated tile set (FR-2.5).
//
// This file ships in the app bundle for V1 (fast, offline, zero cost). Mid-term
// this should move to Firestore (collection: `foods`) so it can be updated
// without an app release — see src/services/foodService.js for the swap point.

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

// kcalPer100 / proteinPer100 / carbsPer100 / fatPer100 are per 100g (solids)
// or per 100ml (liquids like tea, milk).
//
// unitGrams + unitLabel: the gram weight of "1" discrete unit (e.g. 1 chapati =
// 40g, 1 egg = 50g) and what to call that unit. Used by the quantity stepper so
// users can log ANY number of pieces (e.g. 7 chapatis), not just preset chip
// values. Foods without unitGrams are logged directly in grams via the stepper.
//
// tiles: true => shown as a quick-tap tile for the listed mealTypes.
// tiles: false (or omitted mealTypes) => search-only, not cluttering the grid,
// but fully loggable via the search bar (FR-2.5) — e.g. occasional items like
// samosa, pizza, burger.
export const FOOD_LIBRARY = [
  // ---- Breakfast staples (tiles) ----
  {
    id: "tea", name: "Tea", emoji: "\u2615", mealTypes: ["breakfast", "snack"], tiles: true,
    variants: ["Without Sugar", "With Sugar"],
    unitGrams: 150, unitLabel: "Cup",
    kcalPer100: 20, proteinPer100: 0.3, carbsPer100: 3, fatPer100: 0.7,
  },
  {
    id: "coffee", name: "Coffee", emoji: "\u2615", mealTypes: ["breakfast", "snack"], tiles: true,
    variants: ["Black", "With Milk"],
    unitGrams: 150, unitLabel: "Cup",
    kcalPer100: 15, proteinPer100: 0.4, carbsPer100: 2, fatPer100: 0.5,
  },
  {
    id: "milk", name: "Milk", emoji: "\ud83e\udd5b", mealTypes: ["breakfast"], tiles: true,
    variants: null,
    unitGrams: 200, unitLabel: "Cup",
    kcalPer100: 61, proteinPer100: 3.2, carbsPer100: 4.8, fatPer100: 3.3,
  },
  {
    id: "egg", name: "Egg", emoji: "\ud83e\udd5a", mealTypes: ["breakfast", "snack"], tiles: true,
    variants: ["Boiled", "Fried", "Scrambled"],
    unitGrams: 50, unitLabel: "Egg",
    kcalPer100: 155, proteinPer100: 13, carbsPer100: 1.1, fatPer100: 11,
  },
  {
    id: "bread", name: "Bread", emoji: "\ud83c\udf5e", mealTypes: ["breakfast", "snack"], tiles: true,
    variants: null,
    unitGrams: 30, unitLabel: "Slice",
    kcalPer100: 265, proteinPer100: 9, carbsPer100: 49, fatPer100: 3.2,
  },
  {
    id: "oats", name: "Oats", emoji: "\ud83c\udf63", mealTypes: ["breakfast"], tiles: true,
    variants: null,
    unitGrams: 150, unitLabel: "Bowl",
    kcalPer100: 68, proteinPer100: 2.4, carbsPer100: 12, fatPer100: 1.4,
  },
  {
    id: "banana", name: "Banana", emoji: "\ud83c\udf4c", mealTypes: ["breakfast", "snack"], tiles: true,
    variants: null,
    unitGrams: 120, unitLabel: "Banana",
    kcalPer100: 89, proteinPer100: 1.1, carbsPer100: 23, fatPer100: 0.3,
  },

  // ---- Lunch / dinner staples (tiles) ----
  {
    id: "chapati", name: "Chapati", emoji: "\ud83e\udef3", mealTypes: ["lunch", "dinner"], tiles: true,
    variants: null,
    unitGrams: 40, unitLabel: "Chapati",
    kcalPer100: 297, proteinPer100: 11, carbsPer100: 46, fatPer100: 7.4,
  },
  {
    id: "rice", name: "Rice", emoji: "\ud83c\udf5a", mealTypes: ["lunch", "dinner"], tiles: true,
    variants: null,
    unitGrams: null, unitLabel: null, // gram-based, no discrete unit
    kcalPer100: 130, proteinPer100: 2.7, carbsPer100: 28, fatPer100: 0.3,
  },
  {
    id: "dal", name: "Dal", emoji: "\ud83c\udf72", mealTypes: ["lunch", "dinner"], tiles: true,
    variants: null,
    unitGrams: 150, unitLabel: "Bowl",
    kcalPer100: 120, proteinPer100: 9, carbsPer100: 18, fatPer100: 1.5,
  },
  {
    id: "paneer", name: "Paneer", emoji: "\ud83e\uddc0", mealTypes: ["lunch", "dinner"], tiles: true,
    variants: null,
    unitGrams: null, unitLabel: null,
    kcalPer100: 265, proteinPer100: 18, carbsPer100: 1.2, fatPer100: 21,
  },
  {
    id: "sabzi", name: "Sabzi", emoji: "\ud83e\udd57", mealTypes: ["lunch", "dinner"], tiles: true,
    variants: null,
    unitGrams: 150, unitLabel: "Bowl",
    kcalPer100: 95, proteinPer100: 2.5, carbsPer100: 12, fatPer100: 4,
  },
  {
    id: "curd", name: "Curd", emoji: "\ud83e\udd5b", mealTypes: ["lunch", "dinner", "snack"], tiles: true,
    variants: null,
    unitGrams: 150, unitLabel: "Bowl",
    kcalPer100: 60, proteinPer100: 3.5, carbsPer100: 4.7, fatPer100: 3.3,
  },
  {
    id: "salad", name: "Salad", emoji: "\ud83e\udd57", mealTypes: ["lunch", "dinner"], tiles: true,
    variants: null,
    unitGrams: 100, unitLabel: "Bowl",
    kcalPer100: 25, proteinPer100: 1.5, carbsPer100: 4, fatPer100: 0.2,
  },

  // ---- Search-only items (FR-2.5): not cluttering the tile grid, but fully
  // loggable via search for occasional/restaurant/snack foods ----
  {
    id: "samosa", name: "Samosa", emoji: "\ud83e\udd5f", mealTypes: [], tiles: false,
    variants: null,
    unitGrams: 60, unitLabel: "Samosa",
    kcalPer100: 308, proteinPer100: 5.5, carbsPer100: 30, fatPer100: 18,
    searchTokens: ["samosa", "snack", "fried", "punjabi samosa"],
  },
  {
    id: "pizza", name: "Pizza", emoji: "\ud83c\udf55", mealTypes: [], tiles: false,
    variants: ["Veg", "Cheese", "Pepperoni"],
    unitGrams: 110, unitLabel: "Slice",
    kcalPer100: 266, proteinPer100: 11, carbsPer100: 33, fatPer100: 10,
    searchTokens: ["pizza", "slice", "fast food", "italian"],
  },
  {
    id: "burger", name: "Burger", emoji: "\ud83c\udf54", mealTypes: [], tiles: false,
    variants: ["Veg", "Chicken", "Cheese"],
    unitGrams: 220, unitLabel: "Burger",
    kcalPer100: 250, proteinPer100: 12, carbsPer100: 28, fatPer100: 10,
    searchTokens: ["burger", "fast food", "sandwich"],
  },
  {
    id: "poha", name: "Poha", emoji: "\ud83c\udf5a", mealTypes: [], tiles: false,
    variants: null,
    unitGrams: 200, unitLabel: "Plate",
    kcalPer100: 130, proteinPer100: 2.6, carbsPer100: 25, fatPer100: 2.5,
    searchTokens: ["poha", "flattened rice", "breakfast", "maharashtrian"],
  },
  {
    id: "idli", name: "Idli", emoji: "\u26aa", mealTypes: [], tiles: false,
    variants: null,
    unitGrams: 40, unitLabel: "Idli",
    kcalPer100: 132, proteinPer100: 4, carbsPer100: 28, fatPer100: 0.5,
    searchTokens: ["idli", "south indian", "steamed", "breakfast"],
  },
  {
    id: "dosa", name: "Dosa", emoji: "\ud83e\udf2f", mealTypes: [], tiles: false,
    variants: ["Plain", "Masala"],
    unitGrams: 130, unitLabel: "Dosa",
    kcalPer100: 168, proteinPer100: 3.9, carbsPer100: 29, fatPer100: 3.7,
    searchTokens: ["dosa", "south indian", "crepe", "breakfast"],
  },
  {
    id: "noodles", name: "Noodles", emoji: "\ud83c\udf5c", mealTypes: [], tiles: false,
    variants: ["Veg", "Chicken"],
    unitGrams: 200, unitLabel: "Plate",
    kcalPer100: 138, proteinPer100: 4.5, carbsPer100: 25, fatPer100: 2.5,
    searchTokens: ["noodles", "chowmein", "chinese", "hakka"],
  },
  {
    id: "frenchfries", name: "French Fries", emoji: "\ud83c\udf5f", mealTypes: [], tiles: false,
    variants: null,
    unitGrams: 100, unitLabel: "Serving",
    kcalPer100: 312, proteinPer100: 3.4, carbsPer100: 41, fatPer100: 15,
    searchTokens: ["fries", "french fries", "potato", "fast food"],
  },
  {
    id: "icecream", name: "Ice Cream", emoji: "\ud83c\udf66", mealTypes: [], tiles: false,
    variants: null,
    unitGrams: 100, unitLabel: "Scoop",
    kcalPer100: 207, proteinPer100: 3.5, carbsPer100: 24, fatPer100: 11,
    searchTokens: ["ice cream", "dessert", "sweet"],
  },
  {
    id: "chocolate", name: "Chocolate", emoji: "\ud83c\udf6b", mealTypes: [], tiles: false,
    variants: null,
    unitGrams: 20, unitLabel: "Piece",
    kcalPer100: 546, proteinPer100: 4.9, carbsPer100: 61, fatPer100: 31,
    searchTokens: ["chocolate", "dessert", "sweet", "candy"],
  },
  {
    id: "biryani", name: "Biryani", emoji: "\ud83c\udf5b", mealTypes: [], tiles: false,
    variants: ["Veg", "Chicken", "Mutton"],
    unitGrams: 250, unitLabel: "Plate",
    kcalPer100: 165, proteinPer100: 6.5, carbsPer100: 22, fatPer100: 5.5,
    searchTokens: ["biryani", "rice dish", "hyderabadi"],
  },
  {
    id: "chai_biscuit", name: "Biscuit", emoji: "\ud83c\udf6a", mealTypes: [], tiles: false,
    variants: null,
    unitGrams: 10, unitLabel: "Biscuit",
    kcalPer100: 450, proteinPer100: 6.5, carbsPer100: 70, fatPer100: 16,
    searchTokens: ["biscuit", "cookie", "snack", "tea time"],
  },
  {
    id: "apple", name: "Apple", emoji: "\ud83c\udf4e", mealTypes: [], tiles: false,
    variants: null,
    unitGrams: 150, unitLabel: "Apple",
    kcalPer100: 52, proteinPer100: 0.3, carbsPer100: 14, fatPer100: 0.2,
    searchTokens: ["apple", "fruit"],
  },
  {
    id: "almonds", name: "Almonds", emoji: "\ud83e\udd5c", mealTypes: [], tiles: false,
    variants: null,
    unitGrams: 1, unitLabel: "g",
    kcalPer100: 579, proteinPer100: 21, carbsPer100: 22, fatPer100: 50,
    searchTokens: ["almonds", "nuts", "badam", "dry fruit"],
  },
  {
    id: "paratha", name: "Paratha", emoji: "\ud83e\udef3", mealTypes: [], tiles: false,
    variants: ["Plain", "Aloo", "Gobi"],
    unitGrams: 80, unitLabel: "Paratha",
    kcalPer100: 320, proteinPer100: 6.5, carbsPer100: 40, fatPer100: 15,
    searchTokens: ["paratha", "stuffed bread", "breakfast"],
  },
  {
    id: "momo", name: "Momos", emoji: "\ud83e\udd5f", mealTypes: [], tiles: false,
    variants: ["Veg", "Chicken"],
    unitGrams: 25, unitLabel: "Piece",
    kcalPer100: 180, proteinPer100: 6, carbsPer100: 22, fatPer100: 6,
    searchTokens: ["momo", "momos", "dumpling", "tibetan"],
  },
];

export function getFoodById(id) {
  return FOOD_LIBRARY.find((f) => f.id === id) || null;
}

export function getFoodsForMeal(mealType) {
  return FOOD_LIBRARY.filter((f) => f.tiles && f.mealTypes.includes(mealType));
}

// Search across ALL foods (tile or not) by name and search tokens. Used by the
// food logger's search bar so items like samosa/pizza/burger are reachable even
// though they don't clutter the default tile grid (FR-2.5).
export function searchFoods(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return FOOD_LIBRARY.filter((f) => {
    if (f.name.toLowerCase().includes(q)) return true;
    if (f.searchTokens) {
      return f.searchTokens.some((t) => t.toLowerCase().includes(q));
    }
    return false;
  }).slice(0, 20);
}

export function calcKcal(food, grams) {
  return Math.round((food.kcalPer100 * grams) / 100);
}

export function calcMacro(food, grams, key) {
  // key: "proteinPer100" | "carbsPer100" | "fatPer100"
  return Math.round(((food[key] * grams) / 100) * 10) / 10;
}

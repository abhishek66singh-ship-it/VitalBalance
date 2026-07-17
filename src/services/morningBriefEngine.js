// Morning Brief Engine — generates personalized slide tiles for the hero section.
//
// Design principles (mirrors aiCoach.js):
//  • Deterministic & offline — no API calls, no costs, safe for any user.
//  • The engine outputs *validated facts*. Future: swap phraseSlide() for an LLM
//    that rewrites only the text, never the underlying health claim.
//  • Gracefully degrades: returns sensible defaults even with zero historical data.

const FOOD_RECOMMENDATIONS = [
  {
    goal: "lose",
    slots: {
      breakfast: {
        veg: { name: "Poha with sprouts", kcal: 280, proteinG: 11, emoji: "🥣" },
        nonVeg: { name: "Boiled egg whites (4) + whole toast", kcal: 240, proteinG: 18, emoji: "🍳" }
      },
      lunch: {
        veg: { name: "Dal + 2 rotis + cucumber salad", kcal: 420, proteinG: 18, emoji: "🍛" },
        nonVeg: { name: "Grilled chicken + brown rice + salad", kcal: 460, proteinG: 38, emoji: "🍗" }
      },
      dinner: {
        veg: { name: "Grilled paneer + sautéed sabzi", kcal: 360, proteinG: 22, emoji: "🧆" },
        nonVeg: { name: "Baked fish tikka + steamed veggies", kcal: 320, proteinG: 28, emoji: "🐟" }
      },
    },
  },
  {
    goal: "gain",
    slots: {
      breakfast: {
        veg: { name: "Oats banana smoothie + peanut butter", kcal: 520, proteinG: 18, emoji: "🥤" },
        nonVeg: { name: "3 Whole eggs + butter toast + avocado", kcal: 580, proteinG: 26, emoji: "🍳" }
      },
      lunch: {
        veg: { name: "Paneer bhurji + 3 rotis + curd", kcal: 640, proteinG: 28, emoji: "🍛" },
        nonVeg: { name: "Chicken biryani bowl + raita", kcal: 720, proteinG: 42, emoji: "🍚" }
      },
      dinner: {
        veg: { name: "Rajma + steamed rice + curd cup", kcal: 620, proteinG: 20, emoji: "🍲" },
        nonVeg: { name: "Mutton curry + 2 parathas", kcal: 780, proteinG: 36, emoji: "🥘" }
      },
    },
  },
  {
    goal: "maintain",
    slots: {
      breakfast: {
        veg: { name: "Veggie upma + roasted almonds", kcal: 320, proteinG: 9, emoji: "🥣" },
        nonVeg: { name: "Double egg bhurji + 2 rotis", kcal: 410, proteinG: 20, emoji: "🍳" }
      },
      lunch: {
        veg: { name: "Chole + 2 rotis + mix salad", kcal: 480, proteinG: 16, emoji: "🫘" },
        nonVeg: { name: "Egg curry + jeera rice", kcal: 540, proteinG: 22, emoji: "🍛" }
      },
      dinner: {
        veg: { name: "Dal khichdi + mix veg raita", kcal: 420, proteinG: 12, emoji: "🥣" },
        nonVeg: { name: "Grilled chicken wrap with veggies", kcal: 510, proteinG: 28, emoji: "🌯" }
      },
    },
  },
];

function sumBy(items, key) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, i) => {
    if (typeof i !== "object" || i === null) return s;
    return s + (typeof i[key] === "number" ? i[key] : 0);
  }, 0);
}

function safeItems(log) {
  if (!log || !Array.isArray(log.items)) return [];
  return log.items.filter((i) => typeof i === "object" && i !== null && typeof i.kcal === "number");
}

function todayKeyStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yesterdayKeyStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKeyStr(d);
}

function firstName(displayName) {
  if (!displayName) return null;
  return displayName.split(" ")[0];
}

function weekdayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Main export. Returns 4-6 slide objects.
 *
 * @param {object} params
 * @param {object} params.profile      - Firestore user profile doc
 * @param {Array}  params.todayItems   - Food items logged today
 * @param {Array}  params.recentLogs   - Last 7 day-log docs from Firestore
 * @param {object} params.activity     - { steps, caloriesBurned, activeCalories, distanceKm }
 */
export function generateMorningBrief({ profile = {}, todayItems = [], recentLogs = [], activity = {} }) {
  const slides = [];
  const name = firstName(profile.displayName);
  const goal = profile.goal || "maintain"; // "lose" | "maintain" | "gain"
  const stepsGoal = 10000;
  const calorieTarget = profile.dailyCalorieTarget || 2000;
  const proteinGoal = profile.proteinTargetG || 70;
  const weightKg = profile.weightKg || 65;

  const yesterdayKey = yesterdayKeyStr();
  const yesterdayLog = recentLogs.find((l) => l.date === yesterdayKey) || null;
  const yesterdayItems = safeItems(yesterdayLog);
  const yesterdayConsumed = sumBy(yesterdayItems, "kcal");
  const yesterdayProtein = sumBy(yesterdayItems, "proteinG");
  const yesterdaySteps = yesterdayLog?.steps || 0;
  const yesterdayBurned = yesterdayLog?.caloriesBurned || 0;

  // Past week (exclude today)
  const weekLogs = recentLogs.filter((l) => l.date !== todayKeyStr());
  const weekAvgSteps =
    weekLogs.length > 0
      ? Math.round(weekLogs.reduce((s, l) => s + (l.steps || 0), 0) / weekLogs.length)
      : 0;
  const weekAvgBurned =
    weekLogs.length > 0
      ? Math.round(weekLogs.reduce((s, l) => s + (l.caloriesBurned || 0), 0) / weekLogs.length)
      : 0;
  const weekAvgConsumed =
    weekLogs.length > 0
      ? Math.round(
          weekLogs.reduce((s, l) => s + sumBy(safeItems(l), "kcal"), 0) / weekLogs.length
        )
      : 0;

  // Days in deficit this week
  const deficitDays = weekLogs.filter((l) => {
    const c = sumBy(safeItems(l), "kcal");
    const b = l.caloriesBurned || 0;
    return b > 0 && c > 0 && c - b < -50;
  }).length;

  // ── Slide 1: Morning brief summary ──────────────────────────────────────────
  const greeting = weekdayGreeting();
  const stepPct = yesterdaySteps > 0 ? Math.round((yesterdaySteps / stepsGoal) * 100) : null;
  const stepLine =
    stepPct !== null
      ? stepPct >= 100
        ? `Yesterday you crushed your step goal (${yesterdaySteps.toLocaleString()} steps)! 🏆`
        : `Yesterday you hit ${stepPct}% of your step goal (${yesterdaySteps.toLocaleString()} steps).`
      : "No step data from yesterday — let's make today count!";

  const netYesterday = yesterdayBurned > 0 ? yesterdayConsumed - yesterdayBurned : null;
  const netLine =
    netYesterday !== null
      ? netYesterday < -600
        ? "Your calorie deficit was a bit deep — make sure you're eating enough."
        : netYesterday < -50
        ? `You maintained a healthy ${Math.abs(netYesterday)} kcal deficit.`
        : netYesterday < 200
        ? "You were right at your maintenance calories — balanced day!"
        : `You were ${netYesterday} kcal over target — no worries, today's a fresh start.`
      : "Log your meals today to track your calorie balance.";

  slides.push({
    id: "morning_brief",
    icon: "🌅",
    category: "MORNING BRIEF",
    headline: name ? `${greeting}, ${name}!` : `${greeting}!`,
    body: `${stepLine} ${netLine}`,
    color: "#1A3A2A",
    accent: "#C9E4B5",
  });

  // ── Slide 2: Weekly activity trend ──────────────────────────────────────────
  if (weekLogs.length >= 3) {
    const todaySteps = activity.steps || 0;
    const trendDelta = weekAvgSteps > 0 ? Math.round(((todaySteps - weekAvgSteps) / weekAvgSteps) * 100) : null;

    let trendText;
    if (trendDelta === null || weekAvgSteps === 0) {
      trendText = `Your weekly average is ${weekAvgSteps.toLocaleString()} steps/day. Keep it up!`;
    } else if (trendDelta >= 10) {
      trendText = `This week you're averaging ${weekAvgSteps.toLocaleString()} steps/day — up ${trendDelta}% from your recent pace! 🔥`;
    } else if (trendDelta <= -10) {
      trendText = `Activity is a bit lower this week (avg ${weekAvgSteps.toLocaleString()} steps/day). A short walk after meals can help!`;
    } else {
      trendText = `You're consistently averaging ${weekAvgSteps.toLocaleString()} steps/day this week — solid routine!`;
    }

    slides.push({
      id: "trend_activity",
      icon: "📈",
      category: "WEEKLY ACTIVITY",
      headline:
        weekAvgSteps >= stepsGoal
          ? "Crushing your step goal this week!"
          : weekAvgSteps >= stepsGoal * 0.7
          ? "Strong step consistency"
          : "Room to move more",
      body: trendText,
      color: "#1C3248",
      accent: "#A8D4F5",
    });
  }

  // ── Slide 3: Protein / macro gap from yesterday ──────────────────────────────
  if (yesterdayItems.length > 0) {
    const proteinGap = Math.round(proteinGoal - yesterdayProtein);
    if (proteinGap > 8) {
      const reco = FOOD_RECOMMENDATIONS.find((r) => r.goal === goal) || FOOD_RECOMMENDATIONS[2];
      const breakfastReco = reco.slots.breakfast;
      slides.push({
        id: "food_balance",
        icon: "🥩",
        category: "NUTRITION BALANCE",
        headline: `${proteinGap}g protein gap yesterday`,
        body: `You had ${Math.round(yesterdayProtein)}g of protein vs. your ${proteinGoal}g goal. Try adding protein: 🟢 Veg: ${breakfastReco.veg.name} (~${breakfastReco.veg.proteinG}g protein) or 🔴 Non-Veg: ${breakfastReco.nonVeg.name} (~${breakfastReco.nonVeg.proteinG}g protein).`,
        color: "#2D1F3A",
        accent: "#D4A8F5",
      });
    } else if (proteinGap <= 0) {
      slides.push({
        id: "food_balance",
        icon: "💪",
        category: "NUTRITION WIN",
        headline: "Protein goal nailed yesterday!",
        body: `You hit ${Math.round(yesterdayProtein)}g of protein — above your ${proteinGoal}g target. Keep the streak going today!`,
        color: "#1A3A2A",
        accent: "#C9E4B5",
      });
    }
  }

  // ── Slide 4: Calorie consistency pattern ────────────────────────────────────
  if (weekLogs.length >= 4) {
    let consistencyText;
    if (deficitDays >= 5) {
      consistencyText = `You've been in a calorie deficit ${deficitDays} of the last ${weekLogs.length} days — excellent consistency for your ${goal === "lose" ? "weight-loss" : "health"} goal!`;
    } else if (deficitDays >= 3) {
      consistencyText = `${deficitDays} of your last ${weekLogs.length} days were in deficit. Building a consistent pattern is the key to results.`;
    } else if (weekAvgConsumed > 0 && weekAvgConsumed < calorieTarget + 200) {
      consistencyText = `You're averaging ${weekAvgConsumed} kcal/day this week, close to your ${calorieTarget} kcal target. Nice balance!`;
    } else {
      consistencyText = `Average intake this week: ${weekAvgConsumed} kcal/day vs. your ${calorieTarget} kcal target. Small consistent changes add up!`;
    }

    slides.push({
      id: "calorie_balance",
      icon: "⚖️",
      category: "CALORIE TREND",
      headline:
        deficitDays >= 4
          ? "Great deficit consistency!"
          : weekAvgConsumed <= calorieTarget + 150
          ? "On target this week"
          : "Calorie snapshot",
      body: consistencyText,
      color: "#2B2014",
      accent: "#F5D5A8",
    });
  }

  // ── Slide 5: Personalised food recommendation ────────────────────────────────
  const hour = new Date().getHours();
  const reco = FOOD_RECOMMENDATIONS.find((r) => r.goal === goal) || FOOD_RECOMMENDATIONS[2];
  let mealSlot, mealLabel;
  if (hour < 11) {
    mealSlot = reco.slots.breakfast;
    mealLabel = "breakfast";
  } else if (hour < 15) {
    mealSlot = reco.slots.lunch;
    mealLabel = "lunch";
  } else {
    mealSlot = reco.slots.dinner;
    mealLabel = "dinner";
  }

  const vegItem = mealSlot.veg;
  const nonVegItem = mealSlot.nonVeg;

  slides.push({
    id: "food_recommend",
    icon: "🍽️",
    category: "MEAL SUGGESTION",
    headline: `Healthy ${mealLabel} options`,
    body: `🟢 Veg: ${vegItem.emoji} ${vegItem.name} (~${vegItem.kcal} kcal, ${vegItem.proteinG}g protein)\n🔴 Non-Veg: ${nonVegItem.emoji} ${nonVegItem.name} (~${nonVegItem.kcal} kcal, ${nonVegItem.proteinG}g protein)\nTailored for your ${goal === "lose" ? "deficit" : goal === "gain" ? "surplus" : "maintenance"} balance today.`,
    color: "#1C2B1C",
    accent: "#B5E4B5",
  });

  // ── Slide 6: Hydration / always-on tip ──────────────────────────────────────
  const hydrationTips = [
    `Staying hydrated boosts metabolism and reduces hunger. Aim for ${Math.round(weightKg * 0.033)} litres (about ${Math.round(weightKg * 0.033 * 4)} glasses) today.`,
    "Drink a glass of water before each meal — it improves satiety and digestion.",
    "Mild dehydration can make fatigue feel like hunger. Keep a water bottle handy!",
  ];
  const tipIndex = new Date().getDate() % hydrationTips.length;

  slides.push({
    id: "hydration",
    icon: "💧",
    category: "WELLNESS TIP",
    headline: "Stay hydrated today",
    body: hydrationTips[tipIndex],
    color: "#102030",
    accent: "#A8D4F5",
  });

  return slides;
}

// AI Coach insight engine — see PRD section 9 ("AI Coach — Design Detail").
//
// Design principle from the PRD: insight generation combines deterministic rule
// evaluation (this file) with an LLM layer responsible only for phrasing. The LLM
// is never the source of the underlying health claim — so insights are safe and
// auditable even before any AI API key is wired up.
//
// generateInsights() returns fully-formed, ready-to-display insights using
// template strings (zero cost, works offline). Swap `phraseInsight()` for a call
// to an LLM (Anthropic/OpenAI) later — it receives the *same validated insight
// object*, so the underlying claim never depends on the model.

const PROTEIN_GOAL_FALLBACK_G = 70;
const AVG_LUNCH_KCAL_FALLBACK = 620;
const AVG_DINNER_KCAL_FALLBACK = 650;
const HEALTHY_DEFICIT_MIN = -600;
const HEALTHY_DEFICIT_MAX = -100;
const UNSAFE_DEFICIT_THRESHOLD = -1000; // FR-5.5: never encourage unsafe deficits

function sumBy(items, key) {
  return items.reduce((s, i) => s + (i[key] || 0), 0);
}

/**
 * @param {Object} params
 * @param {Array} params.todayItems - all logged items for today (any meal type)
 * @param {Object} params.profile - user profile (targets, goal)
 * @param {number} params.caloriesBurned - synced/estimated calories burned today
 * @param {Array} params.recentLogs - last 7 days of day-log docs, for pattern detection
 * @param {Date} params.now - current time (injectable for testing)
 */
export function generateInsights({ todayItems = [], profile = {}, caloriesBurned = 0, recentLogs = [], now = new Date() }) {
  const insights = [];
  const hour = now.getHours();

  const consumed = sumBy(todayItems, "kcal");
  const protein = sumBy(todayItems, "proteinG");
  const net = consumed - caloriesBurned;

  const proteinGoal = profile.proteinTargetG || PROTEIN_GOAL_FALLBACK_G;
  const calorieTarget = profile.dailyCalorieTarget || 2000;

  const byMeal = (type) => todayItems.filter((i) => i.mealType === type);
  const breakfastItems = byMeal("breakfast");
  const lunchItems = byMeal("lunch");
  const dinnerItems = byMeal("dinner");

  // --- Morning: missed breakfast pattern ---
  if (hour >= 9 && hour < 12 && breakfastItems.length === 0) {
    const skipsOnThisWeekday = countWeekdaySkips(recentLogs, now.getDay(), "breakfast");
    if (skipsOnThisWeekday >= 2) {
      insights.push(
        buildInsight({
          dayPart: "Morning",
          kind: "pattern",
          text: `You usually skip breakfast on ${weekdayName(now.getDay())}s. Want to repeat a recent breakfast in one tap?`,
        })
      );
    } else {
      insights.push(
        buildInsight({
          dayPart: "Morning",
          kind: "nudge",
          text: "Start your day by logging breakfast — it only takes a few taps.",
        })
      );
    }
  }

  // --- Midday: lunch deviates from average ---
  if (lunchItems.length > 0) {
    const lunchKcal = sumBy(lunchItems, "kcal");
    const avgLunch = averageMealKcal(recentLogs, "lunch") || AVG_LUNCH_KCAL_FALLBACK;
    if (lunchKcal > avgLunch * 1.3) {
      const pct = Math.round(((lunchKcal - avgLunch) / avgLunch) * 100);
      insights.push(
        buildInsight({
          dayPart: "Lunch",
          kind: "deviation",
          text: `Today's lunch is ${pct}% higher in calories than your average.`,
        })
      );
    }
  }

  // --- Evening: protein gap ---
  if (hour >= 16 && hour < 21 && protein < proteinGoal) {
    const gap = Math.round(proteinGoal - protein);
    if (gap > 5) {
      insights.push(
        buildInsight({
          dayPart: "Evening",
          kind: "macro_gap",
          text: `You need another ${gap}g of protein to reach today's goal. Curd or paneer with dinner would help.`,
        })
      );
    }
  }

  // --- Dinner: deviates from average ---
  if (dinnerItems.length > 0) {
    const dinnerKcal = sumBy(dinnerItems, "kcal");
    const avgDinner = averageMealKcal(recentLogs, "dinner") || AVG_DINNER_KCAL_FALLBACK;
    if (dinnerKcal > avgDinner * 1.3) {
      const pct = Math.round(((dinnerKcal - avgDinner) / avgDinner) * 100);
      insights.push(
        buildInsight({
          dayPart: "Evening",
          kind: "deviation",
          text: `Tonight's dinner is ${pct}% higher in calories than your average.`,
        })
      );
    }
  }

  // --- Night: end-of-day summary ---
  if (hour >= 21 && consumed > 0) {
    if (net <= UNSAFE_DEFICIT_THRESHOLD) {
      // FR-5.5 safety filter: never praise or reinforce an unsafe deficit.
      // Fall back to a neutral, non-judgmental message instead of a specific number.
      insights.push(
        buildInsight({
          dayPart: "Night",
          kind: "safety_fallback",
          text: "Your numbers look unusually low today — make sure you're eating enough to support your goals.",
        })
      );
    } else if (net <= HEALTHY_DEFICIT_MAX && net >= HEALTHY_DEFICIT_MIN) {
      insights.push(
        buildInsight({
          dayPart: "Night",
          kind: "positive",
          text: "You maintained a healthy calorie deficit today.",
        })
      );
    } else if (net > HEALTHY_DEFICIT_MAX && net <= 200) {
      insights.push(
        buildInsight({
          dayPart: "Night",
          kind: "positive",
          text: "You're right around your maintenance calories today.",
        })
      );
    }
  }

  // --- Low activity nudge (any time after midday) ---
  if (hour >= 17 && caloriesBurned > 0 && caloriesBurned < (profile.dailyCalorieBurnTarget || 1400) * 0.6) {
    insights.push(
      buildInsight({
        dayPart: "Evening",
        kind: "activity_nudge",
        text: "A 20-minute walk after dinner could help balance today's intake.",
      })
    );
  }

  return insights.slice(0, 4); // cap insight volume per FR-5.1/5.2 cadence
}

function buildInsight({ dayPart, kind, text }) {
  return {
    id: `${kind}-${dayPart}-${Date.now()}`,
    dayPart,
    kind,
    text,
    generatedAt: new Date().toISOString(),
  };
}

function weekdayName(dayIndex) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayIndex];
}

function countWeekdaySkips(recentLogs, weekday, mealType) {
  let skips = 0;
  for (const log of recentLogs) {
    const d = new Date(log.date);
    if (d.getDay() !== weekday) continue;
    const hasMeal = (log.items || []).some((i) => i.mealType === mealType);
    if (!hasMeal) skips += 1;
  }
  return skips;
}

function averageMealKcal(recentLogs, mealType) {
  const totals = recentLogs
    .map((log) => sumBy((log.items || []).filter((i) => i.mealType === mealType), "kcal"))
    .filter((v) => v > 0);
  if (totals.length === 0) return null;
  return totals.reduce((a, b) => a + b, 0) / totals.length;
}

/**
 * Future hook: replace template phrasing with an LLM call for more natural,
 * varied language. The LLM receives the already-validated insight (kind, dayPart,
 * and the underlying numbers) and ONLY rewrites `text` — it must never be asked
 * to decide *whether* an insight is true, just how to phrase it.
 *
 * Example future implementation (commented out — requires an API key & is not
 * zero-cost, so it's off by default):
 *
 * export async function phraseInsight(insight, apiKey) {
 *   const res = await fetch("https://api.anthropic.com/v1/messages", { ... });
 *   ...
 * }
 */
export async function phraseInsight(insight) {
  return insight.text; // no-op until an LLM key is configured
}

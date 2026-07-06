import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, Check, Search, X, Minus, Plus } from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { getFoodsForMeal, searchFoods, calcKcal, calcMacro } from "../data/foodLibrary";
import { addLoggedItem, todayKey } from "../services/logService";
import { theme } from "../theme";
import Button from "../components/Button";

const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

// Quick-pick quantity presets shown above the stepper, purely as shortcuts —
// the stepper itself supports any quantity, so a user who ate 7 chapatis can
// just tap + seven times (or type the number) rather than being capped at 4.
const QUICK_QTY_PRESETS = [1, 2, 3, 4];

export default function FoodLoggerScreen({ route, navigation }) {
  const { mealType } = route.params;
  const { user } = useAuth();
  const [step, setStep] = useState("tiles"); // tiles | variant | quantity | saving | confirmed
  const [activeFood, setActiveFood] = useState(null);
  const [activeVariant, setActiveVariant] = useState(null);
  const [quantity, setQuantity] = useState(1); // in units (pieces) or grams, depending on food
  const [lastLogged, setLastLogged] = useState(null);
  const [mealKcalThisSession, setMealKcalThisSession] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const tileFoods = useMemo(() => getFoodsForMeal(mealType), [mealType]);
  const searchResults = useMemo(() => searchFoods(searchQuery), [searchQuery]);
  const isSearching = searchQuery.trim().length > 0;

  // Whether this food is logged in discrete units (chapati, egg, samosa...) or
  // directly in grams (rice, paneer...).
  const isUnitBased = (food) => !!food?.unitGrams;

  function pickFood(food) {
    setActiveFood(food);
    setSearchQuery("");
    const defaultQty = isUnitBased(food) ? 1 : (food.unitGrams ? food.unitGrams : 100);
    setQuantity(defaultQty);
    if (food.variants) {
      setStep("variant");
    } else {
      setActiveVariant(null);
      setStep("quantity");
    }
  }

  function pickVariant(v) {
    setActiveVariant(v);
    setStep("quantity");
  }

  function adjustQuantity(delta) {
    setQuantity((prev) => {
      const step = isUnitBased(activeFood) ? 1 : 25; // grams move in 25g increments
      const next = prev + delta * step;
      const min = isUnitBased(activeFood) ? 1 : 25;
      return Math.max(min, next);
    });
  }

  function setQuickQty(n) {
    setQuantity(n);
  }

  async function confirmLog() {
    const grams = isUnitBased(activeFood) ? quantity * activeFood.unitGrams : quantity;
    const kcal = calcKcal(activeFood, grams);
    const portionLabel = isUnitBased(activeFood)
      ? `${quantity} ${activeFood.unitLabel}${quantity > 1 ? (activeFood.unitLabel.endsWith("s") ? "" : "s") : ""}`
      : `${grams} g`;

    const item = {
      id: `${activeFood.id}-${Date.now()}`,
      foodId: activeFood.id,
      name: activeFood.name,
      emoji: activeFood.emoji,
      mealType,
      variant: activeVariant,
      portionLabel,
      grams,
      kcal,
      proteinG: calcMacro(activeFood, grams, "proteinPer100"),
      carbsG: calcMacro(activeFood, grams, "carbsPer100"),
      fatG: calcMacro(activeFood, grams, "fatPer100"),
      loggedAt: new Date().toISOString(),
    };

    setStep("saving");
    try {
      await addLoggedItem(user.uid, todayKey(), item);
      setLastLogged(item);
      setMealKcalThisSession((prev) => prev + kcal);
      setStep("confirmed");
    } catch (e) {
      // Roll back so the user can retry rather than losing context.
      setStep("quantity");
    }
  }

  function logAnother() {
    setStep("tiles");
    setActiveFood(null);
    setActiveVariant(null);
    setSearchQuery("");
  }

  function goBack() {
    if (step === "tiles") {
      navigation.goBack();
    } else if (step === "variant") {
      setStep("tiles");
      setActiveFood(null);
    } else if (step === "quantity") {
      if (activeFood?.variants) setStep("variant");
      else { setStep("tiles"); setActiveFood(null); }
    } else {
      logAnother();
    }
  }

  const previewGrams = activeFood ? (isUnitBased(activeFood) ? quantity * activeFood.unitGrams : quantity) : 0;
  const previewKcal = activeFood ? calcKcal(activeFood, previewGrams) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={goBack} hitSlop={10} style={{ padding: 4 }}>
          <ChevronLeft size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>{MEAL_LABELS[mealType]}</Text>
          {mealKcalThisSession > 0 && (
            <Text style={styles.headerSub}>{mealKcalThisSession} kcal logged this session</Text>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        {step === "tiles" && (
          <>
            <View style={styles.searchBar}>
              <Search size={16} color={theme.colors.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search any food (e.g. samosa, pizza)"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.searchInput}
                autoCapitalize="none"
              />
              {isSearching && (
                <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                  <X size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {isSearching ? (
              <>
                {searchResults.length === 0 ? (
                  <Text style={styles.hint}>No matches for "{searchQuery}". Try a different name.</Text>
                ) : (
                  <View style={styles.searchResultsList}>
                    {searchResults.map((f) => (
                      <TouchableOpacity key={f.id} style={styles.searchResultRow} onPress={() => pickFood(f)} activeOpacity={0.7}>
                        <Text style={styles.searchResultEmoji}>{f.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.searchResultName}>{f.name}</Text>
                          <Text style={styles.searchResultSub}>{f.kcalPer100} kcal / 100g</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={styles.hint}>Tap a food to log it, or search above for anything else</Text>
                <View style={styles.tileGrid}>
                  {tileFoods.map((f) => (
                    <TouchableOpacity key={f.id} style={styles.tile} onPress={() => pickFood(f)} activeOpacity={0.7}>
                      <Text style={styles.tileEmoji}>{f.emoji}</Text>
                      <Text style={styles.tileName}>{f.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {step === "variant" && activeFood && (
          <>
            <FoodHeader food={activeFood} sub="Choose a variant" />
            <View style={styles.chipGrid}>
              {activeFood.variants.map((v) => (
                <TouchableOpacity key={v} style={styles.chip} onPress={() => pickVariant(v)}>
                  <Text style={styles.chipText}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {step === "quantity" && activeFood && (
          <>
            <FoodHeader
              food={activeFood}
              variant={activeVariant}
              sub={isUnitBased(activeFood) ? "How many did you have?" : "How much did you have?"}
            />

            <View style={styles.stepperRow}>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustQuantity(-1)}>
                <Minus size={20} color={theme.colors.primary} />
              </TouchableOpacity>
              <View style={styles.stepperValueWrap}>
                <Text style={styles.stepperValue}>{quantity}</Text>
                <Text style={styles.stepperUnit}>
                  {isUnitBased(activeFood) ? activeFood.unitLabel + (quantity > 1 ? "s" : "") : "g"}
                </Text>
              </View>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustQuantity(1)}>
                <Plus size={20} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>

            {isUnitBased(activeFood) && (
              <View style={styles.quickQtyRow}>
                {QUICK_QTY_PRESETS.map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.quickQtyChip, quantity === n && styles.quickQtyChipActive]}
                    onPress={() => setQuickQty(n)}
                  >
                    <Text style={[styles.quickQtyText, quantity === n && styles.quickQtyTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.previewCard}>
              <Text style={styles.previewKcal}>{previewKcal} kcal</Text>
              <Text style={styles.previewSub}>
                {isUnitBased(activeFood)
                  ? `${quantity} ${activeFood.unitLabel}${quantity > 1 ? "s" : ""} \u00b7 ${previewGrams}g total`
                  : `${previewGrams}g`}
              </Text>
            </View>

            <Button title="Log This" onPress={confirmLog} style={{ marginHorizontal: 16, marginTop: 14 }} />
          </>
        )}

        {step === "saving" && (
          <View style={styles.confirmWrap}>
            <Text style={styles.hint}>Saving...</Text>
          </View>
        )}

        {step === "confirmed" && lastLogged && (
          <View style={styles.confirmWrap}>
            <View style={styles.checkCircle}>
              <Check size={28} color="#fff" />
            </View>
            <Text style={styles.confirmName}>{lastLogged.emoji} {lastLogged.name}</Text>
            <Text style={styles.confirmSub}>{lastLogged.portionLabel} \u2014 {lastLogged.kcal} kcal</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 22, width: "100%" }}>
              <Button title="Add Another" variant="outline" onPress={logAnother} style={{ flex: 1 }} />
              <Button title="Done" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FoodHeader({ food, variant, sub }) {
  return (
    <View style={styles.foodHeader}>
      <Text style={styles.foodHeaderEmoji}>{food.emoji}</Text>
      <Text style={styles.foodHeaderName}>{food.name}{variant ? ` \u00b7 ${variant}` : ""}</Text>
      <Text style={styles.hint}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display },
  headerSub: { fontSize: 11.5, color: theme.colors.textMuted },
  hint: { textAlign: "center", fontSize: 12, color: theme.colors.textMuted, paddingHorizontal: 16, paddingBottom: 6 },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },
  searchResultsList: { paddingHorizontal: 16, gap: 8 },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  searchResultEmoji: { fontSize: 24 },
  searchResultName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  searchResultSub: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 1 },

  tileGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 14, gap: 10, justifyContent: "flex-start" },
  tile: {
    width: "30%",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    gap: 6,
  },
  tileEmoji: { fontSize: 26 },
  tileName: { fontSize: 12, fontWeight: "600", color: theme.colors.textSubtle },

  foodHeader: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  foodHeaderEmoji: { fontSize: 34 },
  foodHeaderName: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginTop: 4, marginBottom: 4 },

  chipGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 10, marginTop: 8 },
  chip: {
    flexGrow: 1,
    minWidth: "44%",
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.chipBorder,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  chipText: { fontWeight: "600", fontSize: 14, color: theme.colors.text },

  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, marginTop: 18 },
  stepperBtn: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1.5, borderColor: theme.colors.chipBorder,
    alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  stepperValueWrap: { alignItems: "center", minWidth: 80 },
  stepperValue: { fontSize: 34, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display },
  stepperUnit: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },

  quickQtyRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 16 },
  quickQtyChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  quickQtyChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  quickQtyText: { fontSize: 13, fontWeight: "600", color: theme.colors.textSubtle },
  quickQtyTextActive: { color: "#fff" },

  previewCard: {
    marginHorizontal: 16, marginTop: 20, padding: 16, borderRadius: 14,
    backgroundColor: theme.colors.primaryDark, alignItems: "center",
  },
  previewKcal: { fontSize: 22, fontWeight: "700", color: "#fff", fontFamily: theme.fonts.display },
  previewSub: { fontSize: 12, color: "#C9E4B5", marginTop: 2 },

  confirmWrap: { alignItems: "center", paddingHorizontal: 24, paddingTop: 30 },
  checkCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  confirmName: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  confirmSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
});

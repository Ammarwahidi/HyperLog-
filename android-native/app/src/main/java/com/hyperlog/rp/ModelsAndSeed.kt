package com.hyperlog.rp

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import kotlin.math.roundToInt

enum class MajorMuscleGroup(val label: String, val summary: String) {
    ALL("All Muscles", "Full 13-region anterior & posterior hypertrophy map"),
    CHEST("Chest", "Clavicular & sternal pectoralis major pressing & adduction"),
    BACK("Back", "Latissimus dorsi, teres major, rhomboids & mid-back"),
    SHOULDERS("Shoulders", "Front delts, side/rear delts & upper trapezius"),
    ARMS("Arms", "Biceps brachii, triceps long/lateral heads & forearms"),
    CORE("Core", "Rectus abdominis & spinal flexion"),
    LEGS("Legs", "Quadriceps, hamstrings, glutes & gastroc/soleus calves");

    fun matchesMuscle(muscleId: String): Boolean = when (this) {
        ALL -> true
        CHEST -> muscleId == "chest"
        BACK -> muscleId == "back"
        SHOULDERS -> muscleId in setOf("front_delts", "rear_side_delts", "traps")
        ARMS -> muscleId in setOf("biceps", "triceps", "forearms")
        CORE -> muscleId == "abs"
        LEGS -> muscleId in setOf("quads", "hamstrings", "glutes", "calves")
    }
}

enum class VolumeZone(
    val shortLabel: String,
    val fullLabel: String,
    val fillColor: Int,
    val strokeColor: Int,
    val guidance: String
) {
    BELOW_MV(
        "Below MV",
        "Below MV (Unstimulated)",
        0xFFCBD5E1.toInt(),
        0xFF64748B.toInt(),
        "Below weekly Maintenance Volume; log sessions to stimulate retention & growth."
    ),
    MAINTENANCE(
        "MV–MEV",
        "MV–MEV (Maintenance)",
        0xFF38BDF8.toInt(),
        0xFF0284C7.toInt(),
        "Preserves existing muscle tissue (ideal for Week 5 Deload phases)."
    ),
    PRODUCTIVE(
        "MEV–MAV",
        "MEV–MAV (Hypertrophy)",
        0xFF34D399.toInt(),
        0xFF059669.toInt(),
        "Above Minimum Effective Volume; actively driving measurable hypertrophy."
    ),
    OPTIMAL_MAV(
        "Optimal MAV",
        "MAV Window (Peak Growth)",
        0xFF2563EB.toInt(),
        0xFF1D4ED8.toInt(),
        "Directly inside Maximum Adaptive Volume sweet spot."
    ),
    OVERREACHING(
        "≥ MRV",
        "At/Above MRV (Overreaching)",
        0xFFF59E0B.toInt(),
        0xFFB45309.toInt(),
        "Approaching or exceeding Maximum Recoverable Volume; deload soon if needed."
    )
}

data class MuscleLandmark(
    val id: String,
    val name: String,
    val shortName: String,
    val majorGroup: String,
    val plane: String,
    val mv: Int,
    val mev: Int,
    val mavMin: Int,
    val mavMax: Int,
    val mrv: Int,
    val freqMin: Double,
    val freqMax: Double,
    val guidance: String
)

fun evaluateVolumeZone(sets: Int, lm: MuscleLandmark): VolumeZone {
    if (sets >= lm.mrv) return VolumeZone.OVERREACHING
    if (sets >= lm.mavMin) return VolumeZone.OPTIMAL_MAV
    if (sets > lm.mev && sets < lm.mavMin) return VolumeZone.PRODUCTIVE
    if (sets >= lm.mv && sets <= lm.mev && sets > 0) return VolumeZone.MAINTENANCE
    if (lm.mev == 0 && sets > 0) return VolumeZone.PRODUCTIVE
    return VolumeZone.BELOW_MV
}

enum class AppThemeMode(val id: String, val label: String, val shortTag: String, val subtitle: String, val isDark: Boolean) {
    DAYLIGHT("light", "Daylight", "Light", "Crisp high-contrast slate for bright gyms", false),
    NIGHT_SLATE("dark", "Night Slate", "Night", "Deep cobalt dark mode for evening sessions", true),
    AMOLED("amoled", "True AMOLED", "AMOLED", "Pure #000000 black for OLED battery savings", true),
    GRAPHITE("graphite", "Graphite Dark", "Graphite", "Neutral charcoal iron aesthetic", true);

    companion object {
        fun fromId(id: String?): AppThemeMode = entries.firstOrNull { it.id == id } ?: DAYLIGHT
    }
}

val RIR_OPTIONS: List<Double> = listOf(0.0, 0.5, 1.0, 2.0, 3.0, 4.0)

fun formatRirShort(rir: Double): String = when {
    rir >= 4.0 -> "4+ RIR"
    rir == 0.5 -> "0.5 RIR"
    else -> "${rir.toInt()} RIR"
}

fun formatFreqRange(min: Double, max: Double): String {
    val lo = kotlin.math.ceil(min).toInt()
    val hi = kotlin.math.round(max).toInt()
    return if (lo == hi) "${lo}x/wk" else "${lo}–${hi}x/wk"
}

data class MesocycleWeekMeta(
    val week: Int,
    val shortLabel: String,
    val fullLabel: String,
    val targetRir: String,
    val defaultRirNumber: Double,
    val focusNote: String
)

val MESOCYCLE_WEEKS = listOf(
    MesocycleWeekMeta(1, "Wk 1", "Week 1 · MEV Accumulation", "3 RIR", 3.0, "Establish baseline loads near MEV"),
    MesocycleWeekMeta(2, "Wk 2", "Week 2 · Early MAV Progression", "2 RIR", 2.0, "Add +1–2 sets & reps on recovered muscles"),
    MesocycleWeekMeta(3, "Wk 3", "Week 3 · Peak MAV Accumulation", "1–2 RIR", 1.0, "Operate inside Maximum Adaptive Volume window"),
    MesocycleWeekMeta(4, "Wk 4", "Week 4 · Functional Overreaching", "0–1 RIR", 0.5, "Push to MRV ceiling prior to Week 5 Deload"),
    MesocycleWeekMeta(5, "Wk 5 (Deload)", "Week 5 · Systemic & Local Deload", "4+ RIR", 4.0, "Halve sets (~MV) and reduce effort to shed fatigue")
)

data class WorkoutDay(
    val dayNumber: Int,
    val title: String,
    val focusSummary: String,
    val isRestDay: Boolean
)

data class DayExercise(
    val id: String,
    val dayNumber: Int,
    val orderIndex: Int,
    val muscleId: String,
    val name: String,
    val isSuperset: Boolean,
    val repRange: String,
    val defaultWeightKg: Double,
    val restSeconds: Int,
    val w1Sets: Int,
    val w2Sets: Int,
    val w3Sets: Int,
    val w4Sets: Int,
    val w5Sets: Int
) {
    fun setsForWeek(week: Int): Int = when (week) {
        1 -> w1Sets; 2 -> w2Sets; 3 -> w3Sets; 4 -> w4Sets; 5 -> w5Sets; else -> w3Sets
    }
}

data class SetLog(
    val id: String,
    val week: Int,
    val dayNumber: Int,
    val templateSessionId: String?,
    val exerciseId: String,
    val exerciseName: String,
    val muscleId: String,
    val setIndex: Int,
    val weightKg: Double,
    val reps: Int,
    val rir: Double,
    val restSeconds: Int,
    val completed: Boolean
)

data class MuscleFeedback(
    val id: String,
    val week: Int,
    val muscleId: String,
    val pumpScore: Int,
    val jointPainScore: Int
)

data class TemplateExerciseItem(
    val id: String,
    val libraryExerciseId: String,
    val name: String,
    val primaryMuscle: String,
    val sets: Int,
    val reps: String,
    val restSeconds: Int,
    val defaultWeightKg: Double
)

data class WorkoutTemplate(
    val id: String,
    val name: String,
    val category: String,
    val splitType: String,
    val description: String,
    val exercisesJson: String,
    val updatedAtEpochMs: Long
) {
    fun parsedExercises(): List<TemplateExerciseItem> = parseTemplateItems(exercisesJson)
}

fun serializeTemplateItems(items: List<TemplateExerciseItem>): String {
    val arr = JSONArray()
    for (item in items) {
        arr.put(JSONObject().apply {
            put("id", item.id)
            put("libraryExerciseId", item.libraryExerciseId)
            put("name", item.name)
            put("primaryMuscle", item.primaryMuscle)
            put("sets", item.sets)
            put("reps", item.reps)
            put("restSeconds", item.restSeconds)
            put("defaultWeightKg", item.defaultWeightKg)
        })
    }
    return arr.toString()
}

fun parseTemplateItems(json: String): List<TemplateExerciseItem> {
    if (json.isBlank()) return emptyList()
    return try {
        val arr = JSONArray(json)
        val out = mutableListOf<TemplateExerciseItem>()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.add(
                TemplateExerciseItem(
                    id = o.optString("id", "ti_$i"),
                    libraryExerciseId = o.optString("libraryExerciseId", ""),
                    name = o.optString("name", "Exercise"),
                    primaryMuscle = o.optString("primaryMuscle", "chest"),
                    sets = o.optInt("sets", 3),
                    reps = o.optString("reps", "8–12"),
                    restSeconds = o.optInt("restSeconds", 90),
                    defaultWeightKg = o.optDouble("defaultWeightKg", 20.0)
                )
            )
        }
        out
    } catch (_: Exception) {
        emptyList()
    }
}

data class LibraryExercise(
    val id: String,
    val name: String,
    val majorGroup: String,
    val primaryMuscle: String,
    val secondaryMusclesCsv: String,
    val equipment: String,
    val description: String,
    val instructionsText: String,
    val defaultRepRange: String,
    val defaultRestSeconds: Int,
    val defaultWeightKg: Double,
    val videoUrl: String
) {
    fun instructionSteps(): List<String> =
        instructionsText.split("\n").map { it.trim() }.filter { it.isNotEmpty() }

    fun secondaryList(): List<String> =
        secondaryMusclesCsv.split(",").map { it.trim() }.filter { it.isNotEmpty() }
}

data class MealLog(
    val id: String,
    val dateIso: String,
    val mealType: String,
    val name: String,
    val calories: Int,
    val proteinG: Int,
    val carbsG: Int,
    val fatG: Int,
    val loggedAtEpochMs: Long
)

data class SavedCustomMeal(
    val id: String,
    val name: String,
    val mealType: String,
    val calories: Int,
    val proteinG: Int,
    val carbsG: Int,
    val fatG: Int,
    val ingredientsSummary: String
)

data class DailyMetrics(
    val dateIso: String,
    val bodyweightKg: Double,
    val steps: Int,
    val phase: String,
    val baseTdee: Int,
    val proteinPerKg: Double
)

data class StandaloneSession(
    val sessionId: String,
    val templateId: String,
    val templateName: String,
    val exercises: List<TemplateExerciseItem>
)

// ============================================================================
// 100% OFFLINE MIFFLIN-ST JEOR CALORIE & MACRO CALCULATOR
// ============================================================================
enum class ActivityLevelOption(val id: String, val shortLabel: String, val detail: String, val multiplier: Double) {
    SEDENTARY("sedentary", "Sedentary", "Desk job · little exercise (1.2x)", 1.20),
    LIGHT("light", "Light", "1–3 lifting sessions/wk (1.375x)", 1.375),
    MODERATE("moderate", "Moderate", "3–5 hypertrophy sessions/wk (1.55x)", 1.55),
    ACTIVE("active", "High Volume", "5–6 intense sessions + steps (1.725x)", 1.725),
    VERY_ACTIVE("very_active", "Athlete", "Daily hard training / physical job (1.9x)", 1.90);

    companion object {
        fun fromId(id: String?): ActivityLevelOption = entries.firstOrNull { it.id == id } ?: MODERATE
    }
}

enum class GoalPhaseOption(val id: String, val label: String, val dbPhaseName: String, val kcalDelta: Int) {
    MINI_CUT("mini_cut", "Mini-Cut (-500)", "Mini-Cut", -500),
    MAINTENANCE("maintenance", "Maintenance (0)", "Maintenance", 0),
    LEAN_MASS("lean_mass", "Lean Mass (+300)", "Massing", 300);

    companion object {
        fun fromId(id: String?): GoalPhaseOption = entries.firstOrNull { it.id == id } ?: LEAN_MASS
        fun fromDbPhase(phase: String?): GoalPhaseOption = when (phase) {
            "Mini-Cut" -> MINI_CUT
            "Maintenance" -> MAINTENANCE
            else -> LEAN_MASS
        }
    }
}

data class CalorieCalculatorProfile(
    val sex: String, // "male" or "female"
    val ageYears: Int,
    val weightKg: Double,
    val heightCm: Double,
    val activityId: String,
    val goalId: String
)

data class CalorieCalculationResult(
    val bmrKcal: Int,
    val tdeeKcal: Int,
    val targetCalories: Int,
    val proteinG: Int,
    val carbsG: Int,
    val fatG: Int,
    val proteinPerKg: Double
)

fun computeOfflineCalorieTargets(profile: CalorieCalculatorProfile): CalorieCalculationResult {
    val cleanW = profile.weightKg.coerceIn(35.0, 250.0)
    val cleanH = profile.heightCm.coerceIn(120.0, 230.0)
    val cleanAge = profile.ageYears.coerceIn(14, 95)
    val sexOffset = if (profile.sex.equals("female", ignoreCase = true)) -161.0 else 5.0

    val bmrRaw = 10.0 * cleanW + 6.25 * cleanH - 5.0 * cleanAge + sexOffset
    val bmr = bmrRaw.roundToInt().coerceAtLeast(1000)

    val activity = ActivityLevelOption.fromId(profile.activityId)
    val goal = GoalPhaseOption.fromId(profile.goalId)
    val tdee = (bmrRaw * activity.multiplier).roundToInt()

    val minFloor = if (profile.sex.equals("female", ignoreCase = true)) 1250 else 1450
    val targetCalories = (tdee + goal.kcalDelta).coerceAtLeast(minFloor)

    val proteinMultiplier = when (goal) {
        GoalPhaseOption.MINI_CUT -> 2.2
        GoalPhaseOption.MAINTENANCE -> 2.0
        GoalPhaseOption.LEAN_MASS -> 2.05
    }
    val fatMultiplier = when (goal) {
        GoalPhaseOption.MINI_CUT -> 0.75
        else -> 0.88
    }

    val proteinG = (cleanW * proteinMultiplier).roundToInt().coerceAtLeast(90)
    val fatG = (cleanW * fatMultiplier).roundToInt().coerceAtLeast(40)
    val remainingForCarbs = (targetCalories - proteinG * 4 - fatG * 9).coerceAtLeast(200)
    val carbsG = (remainingForCarbs / 4.0).roundToInt()

    return CalorieCalculationResult(
        bmrKcal = bmr,
        tdeeKcal = tdee,
        targetCalories = targetCalories,
        proteinG = proteinG,
        carbsG = carbsG,
        fatG = fatG,
        proteinPerKg = proteinMultiplier
    )
}

fun autoCalculateCaloriesFromMacros(proteinG: Double, carbsG: Double, fatG: Double): Int {
    return (proteinG.coerceAtLeast(0.0) * 4.0 + carbsG.coerceAtLeast(0.0) * 4.0 + fatG.coerceAtLeast(0.0) * 9.0)
        .roundToInt()
}

// ============================================================================
// 100% OFFLINE WHOLE-FOOD HYPERTROPHY CATALOG
// ============================================================================
data class OfflineFoodItem(
    val id: String,
    val name: String,
    val category: String, // "Protein", "Carbs", "Fats & Dairy", "Fruit & Veg"
    val baseGrams: Int,
    val unitHint: String,
    val proteinPerBase: Double,
    val carbsPerBase: Double,
    val fatPerBase: Double
) {
    val kcalPerBase: Int
        get() = autoCalculateCaloriesFromMacros(proteinPerBase, carbsPerBase, fatPerBase)

    fun scaledMacros(grams: Int): ScaledFoodMacros {
        val ratio = grams.coerceAtLeast(1).toDouble() / baseGrams.coerceAtLeast(1).toDouble()
        val p = proteinPerBase * ratio
        val c = carbsPerBase * ratio
        val f = fatPerBase * ratio
        return ScaledFoodMacros(
            grams = grams.coerceAtLeast(1),
            calories = autoCalculateCaloriesFromMacros(p, c, f),
            proteinG = p.roundToInt(),
            carbsG = c.roundToInt(),
            fatG = f.roundToInt()
        )
    }
}

data class ScaledFoodMacros(
    val grams: Int,
    val calories: Int,
    val proteinG: Int,
    val carbsG: Int,
    val fatG: Int
)

data class MealIngredientPick(
    val food: OfflineFoodItem,
    val grams: Int
) {
    val macros: ScaledFoodMacros get() = food.scaledMacros(grams)
}

data class WidgetMesoSplitBar(
    val shortTitle: String,
    val fullTitle: String,
    val completedSets: Int,
    val plannedSets: Int
) {
    val progressPct: Int
        get() = ((completedSets * 100.0) / plannedSets.coerceAtLeast(1).toDouble())
            .roundToInt()
            .coerceIn(0, 100)
}

data class WidgetProgressSnapshot(
    val streakDays: Int,
    val bestStreakDays: Int,
    val last7Days: List<Pair<String, Boolean>>,
    val activeWeek: Int,
    val weekSubtitle: String,
    val completedSets: Int,
    val plannedSets: Int,
    val mesoSplitBars: List<WidgetMesoSplitBar>,
    val todayCalories: Int,
    val targetCalories: Int,
    val todayProteinG: Int,
    val targetProteinG: Int
)

object SeedCatalog {
    fun offlineFoods(): List<OfflineFoodItem> = listOf(
        // Proteins
        OfflineFoodItem("fd_chicken_breast", "Chicken Breast (Cooked)", "Protein", 100, "100g breast", 31.0, 0.0, 3.6),
        OfflineFoodItem("fd_chicken_thigh", "Skinless Chicken Thigh (Cooked)", "Protein", 100, "100g thigh", 26.0, 0.0, 8.2),
        OfflineFoodItem("fd_turkey_99", "Extra Lean Turkey 99% (Cooked)", "Protein", 100, "100g mince", 30.0, 0.0, 1.5),
        OfflineFoodItem("fd_beef_93", "Lean Ground Beef 93/7 (Cooked)", "Protein", 100, "100g beef", 26.0, 0.0, 8.5),
        OfflineFoodItem("fd_sirloin", "Top Sirloin Steak (Trimmed)", "Protein", 100, "100g steak", 29.0, 0.0, 6.4),
        OfflineFoodItem("fd_salmon", "Atlantic Salmon Fillet", "Protein", 100, "100g fillet", 22.5, 0.0, 12.0),
        OfflineFoodItem("fd_tilapia", "White Fish / Cod / Tilapia", "Protein", 100, "100g fillet", 24.0, 0.0, 2.0),
        OfflineFoodItem("fd_tuna_can", "Canned Tuna in Water (Drained)", "Protein", 120, "1 can (120g)", 28.0, 0.0, 1.0),
        OfflineFoodItem("fd_shrimp", "Prawns / Shrimp (Cooked)", "Protein", 100, "100g shrimp", 24.0, 0.2, 0.9),
        OfflineFoodItem("fd_whey_iso", "Whey Protein Isolate", "Protein", 32, "1 scoop (32g)", 26.0, 1.5, 0.5),
        OfflineFoodItem("fd_casein", "Micellar Casein Protein", "Protein", 34, "1 scoop (34g)", 25.0, 3.0, 1.0),
        OfflineFoodItem("fd_egg_whites", "Liquid Egg Whites", "Protein", 150, "150g whites", 16.5, 1.2, 0.2),
        OfflineFoodItem("fd_whole_egg", "Whole Large Egg", "Protein", 50, "1 egg (50g)", 6.3, 0.4, 5.0),
        OfflineFoodItem("fd_tofu_firm", "Extra-Firm Tofu", "Protein", 150, "150g block", 24.0, 3.0, 12.0),
        OfflineFoodItem("fd_tempeh", "Tempeh", "Protein", 100, "100g slice", 20.0, 8.0, 11.0),

        // Carbs & Grains
        OfflineFoodItem("fd_jasmine_rice", "White / Jasmine Rice (Cooked)", "Carbs", 150, "150g cooked", 4.1, 42.0, 0.4),
        OfflineFoodItem("fd_brown_rice", "Brown Rice (Cooked)", "Carbs", 150, "150g cooked", 3.9, 35.0, 1.4),
        OfflineFoodItem("fd_rolled_oats", "Rolled Oats (Dry Weight)", "Carbs", 60, "60g dry oats", 7.9, 40.0, 4.1),
        OfflineFoodItem("fd_cream_of_rice", "Cream of Rice (Dry)", "Carbs", 50, "50g dry", 3.5, 40.0, 0.3),
        OfflineFoodItem("fd_sweet_potato", "Sweet Potato (Baked)", "Carbs", 200, "200g potato", 4.0, 41.0, 0.3),
        OfflineFoodItem("fd_white_potato", "Russet / White Potato (Baked)", "Carbs", 200, "200g potato", 4.6, 42.0, 0.3),
        OfflineFoodItem("fd_pasta_cooked", "Whole / Durum Pasta (Cooked)", "Carbs", 160, "160g cooked", 9.0, 49.0, 1.5),
        OfflineFoodItem("fd_quinoa", "Quinoa (Cooked)", "Carbs", 150, "150g cooked", 6.6, 32.0, 2.8),
        OfflineFoodItem("fd_sourdough", "Sourdough / Ezekiel Bread", "Carbs", 80, "2 slices (80g)", 8.0, 38.0, 1.2),
        OfflineFoodItem("fd_bagel", "Plain Athletic Bagel", "Carbs", 95, "1 bagel (95g)", 10.0, 50.0, 1.5),
        OfflineFoodItem("fd_rice_cakes", "Plain Rice Cakes", "Carbs", 28, "3 cakes (28g)", 2.1, 23.0, 0.7),
        OfflineFoodItem("fd_honey", "Raw Honey", "Carbs", 21, "1 tbsp (21g)", 0.1, 17.3, 0.0),
        OfflineFoodItem("fd_dextrose", "Intra-Workout Cyclic Dextrin", "Carbs", 30, "1 scoop (30g)", 0.0, 29.0, 0.0),

        // Fats & Dairy
        OfflineFoodItem("fd_greek_yogurt_0", "0% Non-Fat Greek Yogurt", "Fats & Dairy", 200, "200g bowl", 20.6, 7.2, 0.4),
        OfflineFoodItem("fd_cottage_cheese", "Low-Fat Cottage Cheese (2%)", "Fats & Dairy", 150, "150g cup", 18.0, 5.5, 3.0),
        OfflineFoodItem("fd_skyr", "Icelandic Skyr Yogurt", "Fats & Dairy", 170, "170g tub", 19.0, 6.8, 0.3),
        OfflineFoodItem("fd_olive_oil", "Extra Virgin Olive Oil", "Fats & Dairy", 14, "1 tbsp (14g)", 0.0, 0.0, 14.0),
        OfflineFoodItem("fd_peanut_butter", "Natural Peanut Butter", "Fats & Dairy", 32, "2 tbsp (32g)", 8.0, 6.4, 16.0),
        OfflineFoodItem("fd_almond_butter", "Almond Butter", "Fats & Dairy", 32, "2 tbsp (32g)", 6.8, 6.0, 17.8),
        OfflineFoodItem("fd_avocado", "Fresh Hass Avocado", "Fats & Dairy", 100, "100g (~half)", 2.0, 8.5, 14.7),
        OfflineFoodItem("fd_almonds", "Roasted Almonds", "Fats & Dairy", 28, "1 oz (28g)", 6.0, 6.1, 14.0),
        OfflineFoodItem("fd_walnuts", "Walnut Halves", "Fats & Dairy", 28, "1 oz (28g)", 4.3, 3.9, 18.5),
        OfflineFoodItem("fd_cheddar_light", "Reduced-Fat Cheddar / Mozzarella", "Fats & Dairy", 30, "30g cheese", 9.0, 1.0, 5.0),

        // Fruit & Veg
        OfflineFoodItem("fd_banana", "Ripe Banana", "Fruit & Veg", 120, "1 med (120g)", 1.3, 27.5, 0.4),
        OfflineFoodItem("fd_blueberries", "Blueberries / Mixed Berries", "Fruit & Veg", 100, "100g berries", 0.7, 14.5, 0.3),
        OfflineFoodItem("fd_apple", "Honeycrisp Apple", "Fruit & Veg", 180, "1 med (180g)", 0.5, 25.0, 0.3),
        OfflineFoodItem("fd_dates", "Medjool Dates (Pre-Workout)", "Fruit & Veg", 48, "2 dates (48g)", 0.9, 36.0, 0.1),
        OfflineFoodItem("fd_broccoli", "Steamed Broccoli Florets", "Fruit & Veg", 150, "150g greens", 4.2, 10.5, 0.5),
        OfflineFoodItem("fd_spinach", "Baby Spinach / Mixed Greens", "Fruit & Veg", 100, "100g greens", 2.9, 3.6, 0.4),
        OfflineFoodItem("fd_asparagus", "Grilled Asparagus", "Fruit & Veg", 150, "150g spears", 3.6, 6.0, 0.3)
    )

    fun defaultLandmarks(): List<MuscleLandmark> = listOf(
        MuscleLandmark("chest", "Chest (Pectoralis)", "Chest", "CHEST", "anterior", 8, 10, 12, 20, 22, 1.5, 3.0,
            "Pressing compounds (Barbell Bench, Incline Close Grip) paired with deep-stretch flies and wide pushups on Days 1 & 5."),
        MuscleLandmark("front_delts", "Front Delts", "Front Delts", "SHOULDERS", "anterior", 0, 0, 6, 8, 12, 1.0, 2.0,
            "Heavy indirect stimulus from pressing plus direct Standing Barbell & Seated DB Overhead Presses on Days 1 & 2."),
        MuscleLandmark("rear_side_delts", "Rear & Side Delts", "Side/Rear Delts", "SHOULDERS", "both", 0, 8, 16, 22, 26, 3.0, 6.0,
            "Recovers rapidly and thrives on 4x/wk frequency: Upright Rows, DB Side Laterals, and Rear Lateral Supersets."),
        MuscleLandmark("traps", "Upper Traps", "Traps", "SHOULDERS", "both", 0, 0, 12, 20, 26, 2.0, 6.0,
            "Trained directly via Barbell Shrugs (Day 1) and Dumbbell Bent Shrugs (Day 2), plus deadlift stabilization."),
        MuscleLandmark("back", "Back (Lats & Rhomboids)", "Back", "BACK", "posterior", 8, 10, 14, 22, 25, 2.0, 4.0,
            "Combine vertical pulling (Pullups, Weighted Pullups) and horizontal rowing (Barbell Bent Row, Cable Rows) on Days 4 & 7."),
        MuscleLandmark("biceps", "Biceps Brachii", "Biceps", "ARMS", "anterior", 4, 8, 14, 20, 26, 2.0, 6.0,
            "High-frequency 4x/wk arm focus: EZ Bar Curls (Days 1 & 2), DB Curls (Day 5), and Occlusion Curls (Day 6)."),
        MuscleLandmark("triceps", "Triceps Brachii", "Triceps", "ARMS", "posterior", 4, 6, 10, 14, 18, 2.0, 4.0,
            "Weighted Dips on Day 1 plus Overhead EZ Extension supersetted with Incline Close Grip Bench on Day 5."),
        MuscleLandmark("forearms", "Forearms & Grip", "Forearms", "ARMS", "both", 0, 2, 8, 14, 18, 2.0, 4.0,
            "Maintained via heavy rows, pullups, shrugs, and curls; add direct wrist curls when elbow flexors need extra volume."),
        MuscleLandmark("abs", "Abdominals (Rectus)", "Abs", "CORE", "anterior", 0, 0, 16, 20, 25, 3.0, 5.0,
            "Spinal flexion focus across 3 sessions/wk: Machine Crunches (Days 1 & 4) and Hanging Knee Raises (Day 6)."),
        MuscleLandmark("quads", "Quadriceps", "Quads", "LEGS", "anterior", 6, 8, 12, 18, 20, 1.5, 3.0,
            "High Bar Squats & Leg Press on Day 2, followed by high-knee-flexion Smith Machine Feet Forward Squats on Day 6."),
        MuscleLandmark("hamstrings", "Hamstrings", "Hamstrings", "LEGS", "posterior", 4, 6, 10, 16, 20, 2.0, 3.0,
            "Hip-hinge Stiff-Legged Deadlifts on Day 4 paired with knee-flexion Lying Leg Curls on Day 7."),
        MuscleLandmark("glutes", "Glutes", "Glutes", "LEGS", "posterior", 0, 0, 4, 12, 16, 2.0, 3.0,
            "Deep stretch Sumo Deficit Deadlifts on Day 4 paired with Barbell Glute Bridges on Day 7."),
        MuscleLandmark("calves", "Calves (Gastroc & Soleus)", "Calves", "LEGS", "both", 6, 8, 12, 16, 20, 2.0, 4.0,
            "1-second bottom stretch pause on Leg Press Calves (Day 2) and Smith Machine Calves (Day 6).")
    )

    fun defaultWorkoutDays(): List<WorkoutDay> = listOf(
        WorkoutDay(1, "Day 1 · Upper Push & Arm/Delt Volume", "Chest, Front Delts, Triceps, Traps, Side Delts, Biceps, Abs", false),
        WorkoutDay(2, "Day 2 · Quads, Calves & Upper Accessories", "Quads, Calves, Front Delts, Traps, Side Delts, Biceps", false),
        WorkoutDay(3, "Day 3 · Scheduled Recovery & Glycogen", "Active recovery, light walking steps, systemic fatigue dissipation", true),
        WorkoutDay(4, "Day 4 · Posterior Chain & Heavy Back", "Glutes, Hamstrings, Back (Vertical & Horizontal), Abs", false),
        WorkoutDay(5, "Day 5 · Upper Hypertrophy & Tricep Supersets", "Chest, Triceps (Superset), Side Delts, Biceps", false),
        WorkoutDay(6, "Day 6 · Quads, Delt Supersets & Metabolite Arms", "Quads, Calves, Rear/Side Delts (Superset), Biceps, Abs", false),
        WorkoutDay(7, "Day 7 · Back Width/Thickness & Posterior Lower", "Back, Hamstrings, Glutes", false)
    )

    fun defaultDayExercises(): List<DayExercise> = listOf(
        DayExercise("d1_e1", 1, 1, "chest", "Barbell Bench Press", false, "6–10", 85.0, 150, 3, 4, 4, 5, 2),
        DayExercise("d1_e2", 1, 2, "front_delts", "Barbell Standing Press", false, "6–10", 52.5, 120, 3, 3, 4, 4, 2),
        DayExercise("d1_e3", 1, 3, "triceps", "Weighted Dips", false, "8–12", 15.0, 120, 3, 3, 4, 5, 2),
        DayExercise("d1_e4", 1, 4, "chest", "Cable Flies", false, "12–15", 20.0, 75, 3, 3, 4, 4, 2),
        DayExercise("d1_e5", 1, 5, "traps", "Barbell Shrug", false, "10–15", 100.0, 90, 3, 4, 5, 6, 2),
        DayExercise("d1_e6", 1, 6, "rear_side_delts", "Barbell Upright Row 1", false, "10–15", 35.0, 75, 3, 4, 4, 5, 2),
        DayExercise("d1_e7", 1, 7, "biceps", "EZ Bar Curls 1", false, "8–12", 32.5, 75, 3, 4, 4, 5, 2),
        DayExercise("d1_e8", 1, 8, "abs", "Machine Crunches 1", false, "12–20", 45.0, 60, 3, 4, 5, 6, 2),

        DayExercise("d2_e1", 2, 1, "quads", "High Bar Squats", false, "6–10", 110.0, 180, 3, 4, 4, 5, 2),
        DayExercise("d2_e2", 2, 2, "quads", "Leg Press", false, "10–15", 180.0, 150, 3, 3, 4, 5, 2),
        DayExercise("d2_e3", 2, 3, "calves", "Calves on Leg Press", false, "12–15", 140.0, 60, 4, 5, 6, 7, 3),
        DayExercise("d2_e4", 2, 4, "front_delts", "Seated Dumbbell Overhead Press", false, "8–12", 26.0, 120, 3, 3, 4, 4, 2),
        DayExercise("d2_e5", 2, 5, "traps", "Dumbbell Bent Shrug", false, "12–15", 36.0, 75, 3, 4, 5, 6, 2),
        DayExercise("d2_e6", 2, 6, "rear_side_delts", "Barbell Upright Row 2", false, "12–15", 32.5, 75, 3, 4, 4, 5, 2),
        DayExercise("d2_e7", 2, 7, "biceps", "EZ Bar Curls 2", false, "10–15", 30.0, 75, 3, 3, 4, 5, 2),

        DayExercise("d4_e1", 4, 1, "glutes", "Sumo Deficit Deadlift", false, "6–10", 130.0, 180, 3, 3, 4, 5, 2),
        DayExercise("d4_e2", 4, 2, "hamstrings", "SL Deadlift", false, "8–12", 105.0, 150, 3, 4, 5, 6, 2),
        DayExercise("d4_e3", 4, 3, "back", "Barbell Bent Row", false, "8–12", 82.5, 120, 3, 4, 5, 6, 2),
        DayExercise("d4_e4", 4, 4, "back", "Pullups", false, "8–12", 0.0, 120, 3, 4, 4, 5, 2),
        DayExercise("d4_e5", 4, 5, "abs", "Machine Crunches 2", false, "12–20", 45.0, 60, 3, 4, 5, 6, 2),

        DayExercise("d5_e1", 5, 1, "chest", "Incline Close Grip Bench", false, "8–12", 70.0, 120, 3, 4, 5, 5, 2),
        DayExercise("d5_e2", 5, 2, "chest", "Wide Grip Pushup", false, "12–20", 0.0, 75, 3, 3, 4, 5, 2),
        DayExercise("d5_e3", 5, 3, "triceps", "Overhead EZ Extension SS", true, "10–15", 27.5, 60, 3, 4, 4, 5, 2),
        DayExercise("d5_e4", 5, 4, "triceps", "Incline Close Grip Bench SS", true, "10–15", 50.0, 90, 3, 3, 4, 4, 2),
        DayExercise("d5_e5", 5, 5, "rear_side_delts", "Dumbbell Side Laterals", false, "12–20", 12.0, 60, 4, 5, 5, 6, 2),
        DayExercise("d5_e6", 5, 6, "biceps", "Dumbbell Curls", false, "10–15", 14.0, 60, 3, 4, 4, 5, 2),

        DayExercise("d6_e1", 6, 1, "quads", "Smith Machine Feet Forward Squats", false, "10–15", 85.0, 150, 4, 5, 6, 7, 2),
        DayExercise("d6_e2", 6, 2, "calves", "Smith Machine Calves", false, "12–20", 90.0, 60, 4, 5, 6, 7, 3),
        DayExercise("d6_e3", 6, 3, "rear_side_delts", "Dumbbell Rear Lateral Raise SS", true, "15–20", 10.0, 45, 3, 4, 4, 5, 2),
        DayExercise("d6_e4", 6, 4, "rear_side_delts", "Dumbbell Upright Row SS", true, "12–15", 16.0, 75, 3, 3, 4, 5, 2),
        DayExercise("d6_e5", 6, 5, "biceps", "Dumbbell Occlusion Curls", false, "20–30", 8.0, 30, 3, 4, 4, 5, 2),
        DayExercise("d6_e6", 6, 6, "abs", "Hanging Knee Raises", false, "12–20", 0.0, 60, 3, 4, 5, 6, 2),

        DayExercise("d7_e1", 7, 1, "back", "Weighted Pullups", false, "6–10", 12.5, 150, 3, 4, 5, 6, 2),
        DayExercise("d7_e2", 7, 2, "back", "Cable Rows", false, "10–15", 70.0, 120, 3, 4, 5, 6, 2),
        DayExercise("d7_e3", 7, 3, "hamstrings", "Lying Leg Curls", false, "10–15", 55.0, 90, 4, 5, 6, 7, 2),
        DayExercise("d7_e4", 7, 4, "glutes", "Glute Bridge", false, "10–15", 120.0, 120, 3, 4, 5, 6, 2)
    )

    fun defaultWeek3BaselineSetLogs(exercises: List<DayExercise>): List<SetLog> {
        val list = mutableListOf<SetLog>()
        for (ex in exercises) {
            val targetSets = ex.w3Sets
            val defaultReps = Regex("\\d+").find(ex.repRange)?.value?.toIntOrNull() ?: 10
            val isCompleted = ex.dayNumber in setOf(1, 2, 4)
            for (s in 1..targetSets) {
                list.add(
                    SetLog(
                        id = "w3_d${ex.dayNumber}_${ex.id}_s$s",
                        week = 3,
                        dayNumber = ex.dayNumber,
                        templateSessionId = null,
                        exerciseId = ex.id,
                        exerciseName = ex.name,
                        muscleId = ex.muscleId,
                        setIndex = s,
                        weightKg = ex.defaultWeightKg,
                        reps = defaultReps,
                        rir = 1.0,
                        restSeconds = ex.restSeconds,
                        completed = isCompleted
                    )
                )
            }
        }
        return list
    }

    fun defaultStarterTemplates(): List<WorkoutTemplate> {
        val now = System.currentTimeMillis()
        return listOf(
            WorkoutTemplate(
                "tpl_full_body_beginner", "Full Body Beginner", "Starter", "Full Body · 3x/Week",
                "Balanced compound hypertrophy foundation hitting every major muscle group in 45–55 minutes.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("fb_1", "lib_high_bar_squat", "High Bar Squats", "quads", 3, "8–10", 150, 80.0),
                    TemplateExerciseItem("fb_2", "lib_bb_bench_press", "Barbell Bench Press", "chest", 3, "8–10", 120, 65.0),
                    TemplateExerciseItem("fb_3", "lib_cable_rows", "Cable Rows", "back", 3, "10–12", 90, 55.0),
                    TemplateExerciseItem("fb_4", "lib_seated_db_ohp", "Seated Dumbbell Overhead Press", "front_delts", 3, "10–12", 90, 20.0),
                    TemplateExerciseItem("fb_5", "lib_lying_leg_curl", "Lying Leg Curls", "hamstrings", 3, "10–15", 75, 45.0),
                    TemplateExerciseItem("fb_6", "lib_db_curls", "Dumbbell Curls", "biceps", 2, "12–15", 60, 12.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_ppl_push", "Push-Pull-Legs · Push", "Starter", "PPL · Push Hypertrophy",
                "Chest, anterior/lateral deltoids, and long-head triceps stretch & pressing session.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("p_1", "lib_bb_bench_press", "Barbell Bench Press", "chest", 4, "6–10", 150, 85.0),
                    TemplateExerciseItem("p_2", "lib_incline_db_press", "Incline Dumbbell Press", "chest", 3, "8–12", 120, 32.0),
                    TemplateExerciseItem("p_3", "lib_cable_flies", "Cable Flies", "chest", 3, "12–15", 75, 20.0),
                    TemplateExerciseItem("p_4", "lib_seated_db_ohp", "Seated Dumbbell Overhead Press", "front_delts", 3, "8–12", 120, 26.0),
                    TemplateExerciseItem("p_5", "lib_db_side_laterals", "Dumbbell Side Laterals", "rear_side_delts", 4, "12–20", 60, 12.0),
                    TemplateExerciseItem("p_6", "lib_oh_ez_ext", "Overhead EZ Bar Extension", "triceps", 4, "10–15", 75, 27.5)
                )), now
            ),
            WorkoutTemplate(
                "tpl_ppl_pull", "Push-Pull-Legs · Pull", "Starter", "PPL · Pull Hypertrophy",
                "Vertical lat width, mid-back thickness, rear delts, upper traps, and biceps.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("pl_1", "lib_weighted_pullups", "Weighted Pullups", "back", 4, "6–10", 150, 10.0),
                    TemplateExerciseItem("pl_2", "lib_bb_bent_row", "Barbell Bent Row", "back", 4, "8–12", 120, 82.5),
                    TemplateExerciseItem("pl_3", "lib_cable_rows", "Cable Rows", "back", 3, "10–15", 90, 70.0),
                    TemplateExerciseItem("pl_4", "lib_db_rear_lateral", "Dumbbell Rear Lateral Raise", "rear_side_delts", 4, "15–20", 60, 10.0),
                    TemplateExerciseItem("pl_5", "lib_bb_shrug", "Barbell Shrug", "traps", 4, "10–15", 75, 100.0),
                    TemplateExerciseItem("pl_6", "lib_ez_bar_curl", "EZ Bar Curls", "biceps", 4, "8–12", 75, 32.5)
                )), now
            ),
            WorkoutTemplate(
                "tpl_ppl_legs", "Push-Pull-Legs · Legs", "Starter", "PPL · Lower Hypertrophy",
                "Complete quad, hamstring, glute, calf, and abdominal volume block.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("lg_1", "lib_high_bar_squat", "High Bar Squats", "quads", 4, "6–10", 180, 110.0),
                    TemplateExerciseItem("lg_2", "lib_sl_deadlift", "Stiff-Legged Deadlift", "hamstrings", 4, "8–12", 150, 105.0),
                    TemplateExerciseItem("lg_3", "lib_leg_press", "Leg Press", "quads", 3, "10–15", 120, 180.0),
                    TemplateExerciseItem("lg_4", "lib_lying_leg_curl", "Lying Leg Curls", "hamstrings", 3, "10–15", 90, 55.0),
                    TemplateExerciseItem("lg_5", "lib_glute_bridge", "Barbell Glute Bridge", "glutes", 3, "10–15", 90, 120.0),
                    TemplateExerciseItem("lg_6", "lib_leg_press_calves", "Calves on Leg Press", "calves", 5, "12–15", 60, 140.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_upper_hypertrophy", "Upper / Lower · Upper", "Starter", "Upper/Lower · 4x/Week",
                "High-efficiency antagonist pairing across chest, lats, shoulders, and arms.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("up_1", "lib_incline_cg_bench", "Incline Close Grip Bench", "chest", 4, "8–12", 120, 70.0),
                    TemplateExerciseItem("up_2", "lib_pullups", "Pullups", "back", 4, "8–12", 120, 0.0),
                    TemplateExerciseItem("up_3", "lib_cable_flies", "Cable Flies", "chest", 3, "12–15", 75, 20.0),
                    TemplateExerciseItem("up_4", "lib_cable_rows", "Cable Rows", "back", 3, "10–15", 90, 70.0),
                    TemplateExerciseItem("up_5", "lib_db_side_laterals", "Dumbbell Side Laterals", "rear_side_delts", 4, "12–20", 60, 12.0),
                    TemplateExerciseItem("up_6", "lib_weighted_dips", "Weighted Dips", "triceps", 3, "8–12", 90, 15.0),
                    TemplateExerciseItem("up_7", "lib_db_curls", "Dumbbell Curls", "biceps", 3, "10–15", 60, 14.0)
                )), now
            )
        )
    }

    fun defaultLibraryExercises(): List<LibraryExercise> = listOf(
        LibraryExercise("lib_bb_bench_press", "Barbell Bench Press", "CHEST", "chest", "front_delts,triceps", "Barbell",
            "Foundational horizontal compound press maximizing mechanical tension across the sternal and clavicular pectoralis major.",
            "Retract and depress your scapulae into the bench with feet planted firmly.\nGrip the bar 1.5x shoulder width and unrack over shoulder joints.\nLower over 2–3 seconds to your lower sternum with elbows tucked ~45–60 degrees.\nPause lightly on the chest without bouncing, then drive to lockout.",
            "6–10", 150, 85.0, "https://www.youtube.com/results?search_query=Barbell+Bench+Press+Hypertrophy+Technique"),
        LibraryExercise("lib_incline_cg_bench", "Incline Close Grip Bench", "CHEST", "chest", "triceps,front_delts", "Barbell",
            "30-degree incline barbell press with shoulder-width grip emphasizing upper clavicular chest and triceps stretch.",
            "Set bench to 30 degrees and take a shoulder-width pronated grip.\nLower slowly toward upper chest while keeping elbows tracking forward.\nAchieve a deep stretch at the bottom before pressing smoothly to lockout.",
            "8–12", 120, 70.0, "https://www.youtube.com/results?search_query=Incline+Close+Grip+Bench+Press"),
        LibraryExercise("lib_incline_db_press", "Incline Dumbbell Press", "CHEST", "chest", "front_delts,triceps", "Dumbbell",
            "Converging free-weight incline press offering unrestricted shoulder range of motion for maximum upper-pec fiber lengthening.",
            "Set bench to 15–30 degrees and bring dumbbells to shoulder level.\nLower handles slightly past chest depth for a deep loaded stretch.\nPress up and slightly inward without clanging weights together.",
            "8–12", 120, 32.0, "https://www.youtube.com/results?search_query=Incline+Dumbbell+Press+Hypertrophy"),
        LibraryExercise("lib_cable_flies", "Cable Flies", "CHEST", "chest", "front_delts", "Cable",
            "Constant-tension horizontal adduction isolating the pectoralis major from full stretch to midline squeeze.",
            "Set dual pulleys to chest height and step forward into a staggered stance.\nOpen arms wide with a fixed slight elbow bend until a deep pec stretch is felt.\nSweep hands together in a wide arc and squeeze 1 second at midline.",
            "12–15", 75, 20.0, "https://www.youtube.com/results?search_query=Cable+Chest+Fly+Technique"),
        LibraryExercise("lib_wide_pushup", "Wide Grip Pushup", "CHEST", "chest", "front_delts,triceps,abs", "Bodyweight",
            "High-rep bodyweight chest movement emphasizing pec stretch, serratus control, and metabolite accumulation.",
            "Place hands wider than shoulder width on handles or floor to maximize depth.\nKeep a rigid plank with abs and glutes braced.\nLower chest deep, pause 1 second in the stretch, and press to 95% lockout.",
            "12–20", 75, 0.0, "https://www.youtube.com/results?search_query=Deficit+Pushups+Hypertrophy"),

        LibraryExercise("lib_bb_bent_row", "Barbell Bent Row", "BACK", "back", "rear_side_delts,biceps,forearms,hamstrings", "Barbell",
            "Heavy hip-hinged horizontal pull developing mid-back thickness, lats, rhomboids, and erectors.",
            "Hinge hips until torso is 15–45 degrees above parallel.\nAllow scapulae to protract at bottom for a full lat/rhomboid stretch.\nRow bar into lower sternum while driving elbows behind torso.",
            "8–12", 120, 82.5, "https://www.youtube.com/results?search_query=Barbell+Bent+Row+Technique"),
        LibraryExercise("lib_pullups", "Pullups", "BACK", "back", "biceps,forearms,rear_side_delts", "Bodyweight",
            "Full-range pronated vertical pull targeting latissimus dorsi and teres major through complete overhead extension.",
            "Grip bar 1.25–1.5x shoulder width from a dead hang.\nDepress scapulae and drive elbows down to hips until upper chest nears the bar.\nControl the eccentric all the way back to a full overhead stretch.",
            "8–12", 120, 0.0, "https://www.youtube.com/results?search_query=Pullups+Hypertrophy+Form"),
        LibraryExercise("lib_weighted_pullups", "Weighted Pullups", "BACK", "back", "biceps,forearms", "Bodyweight",
            "Progressive-overload vertical pull with dip belt or dumbbell for high-threshold lat width.",
            "Attach weight securely to a dip belt and hang fully extended.\nPull smoothly without violent leg kipping until chin clears the bar.\nLower over 2–3 seconds into a complete dead-hang stretch.",
            "6–10", 150, 12.5, "https://www.youtube.com/results?search_query=Weighted+Pullups+Technique"),
        LibraryExercise("lib_cable_rows", "Cable Rows", "BACK", "back", "biceps,rear_side_delts,forearms", "Cable",
            "Seated horizontal cable row allowing exaggerated scapular protraction on the eccentric and retraction at peak.",
            "Brace feet on platform with knees slightly bent.\nLean slightly forward on eccentric to stretch lats and rhomboids.\nRow handle to abdomen while sitting tall and squeezing shoulder blades.",
            "10–15", 120, 70.0, "https://www.youtube.com/results?search_query=Seated+Cable+Row+Form"),

        LibraryExercise("lib_bb_standing_press", "Barbell Standing Press", "SHOULDERS", "front_delts", "triceps,traps,abs", "Barbell",
            "Strict standing overhead press building anterior deltoids, upper chest, and axial core stability.",
            "Unrack bar on front delts with wrists stacked and glutes braced.\nPress vertically past chin, moving head slightly through as bar clears.\nLower under strict control to clavicles for full front-delt stretch.",
            "6–10", 120, 52.5, "https://www.youtube.com/results?search_query=Standing+Barbell+Overhead+Press"),
        LibraryExercise("lib_seated_db_ohp", "Seated Dumbbell Overhead Press", "SHOULDERS", "front_delts", "triceps,rear_side_delts", "Dumbbell",
            "High-stability seated overhead press isolating anterior and lateral deltoid fibers.",
            "Set bench upright (75–85 degrees) and plant feet firmly.\nLower dumbbells until bells touch or pass ear/shoulder height.\nPress smoothly overhead without locking elbows aggressively.",
            "8–12", 120, 26.0, "https://www.youtube.com/results?search_query=Seated+Dumbbell+Shoulder+Press"),
        LibraryExercise("lib_db_side_laterals", "Dumbbell Side Laterals", "SHOULDERS", "rear_side_delts", "traps", "Dumbbell",
            "Primary lateral deltoid isolation movement building shoulder cap width.",
            "Stand tall or lean slightly forward with dumbbells at sides.\nRaise arms out in scapular plane (~15–20 deg forward) leading with elbows.\nPause briefly at shoulder level and lower over 2–3 seconds.",
            "12–20", 60, 12.0, "https://www.youtube.com/results?search_query=Dumbbell+Lateral+Raises+Form"),
        LibraryExercise("lib_db_rear_lateral", "Dumbbell Rear Lateral Raise", "SHOULDERS", "rear_side_delts", "back,traps", "Dumbbell",
            "Bent-over or chest-supported reverse fly isolating posterior deltoids.",
            "Hinge torso near parallel or brace chest on an incline bench.\nSweep dumbbells outward in a wide arc without pinching shoulder blades early.\nControl descent slowly to keep tension on rear delts.",
            "15–20", 60, 10.0, "https://www.youtube.com/results?search_query=Rear+Delt+Dumbbell+Fly"),
        LibraryExercise("lib_bb_upright_row", "Barbell Upright Row", "SHOULDERS", "rear_side_delts", "traps,biceps", "Barbell",
            "Shoulder-width upright pull hitting lateral delts, rear delts, and upper traps simultaneously.",
            "Take a shoulder-width or slightly wider grip for shoulder comfort.\nPull bar close to torso by driving elbows up and outward to sternum height.\nLower slowly to full arm extension.",
            "10–15", 75, 35.0, "https://www.youtube.com/results?search_query=Barbell+Upright+Row+Technique"),
        LibraryExercise("lib_bb_shrug", "Barbell Shrug", "SHOULDERS", "traps", "forearms", "Barbell",
            "Heavy vertical scapular elevation directly loading the upper trapezius.",
            "Hold barbell just outside thighs (use straps if grip limits load).\nLet shoulders stretch downward at bottom, then shrug straight toward ears.\nHold peak contraction 1 second before lowering under control.",
            "10–15", 90, 100.0, "https://www.youtube.com/results?search_query=Barbell+Shrugs+Form"),
        LibraryExercise("lib_db_bent_shrug", "Dumbbell Bent Shrug", "SHOULDERS", "traps", "back,forearms", "Dumbbell",
            "Slight forward torso lean aligns line of pull with upper and middle trapezius fibers.",
            "Hinge forward 15–25 degrees holding dumbbells at sides.\nLet scapulae protract downward, then shrug up and slightly back.\nPause 1 second at top of every rep.",
            "12–15", 75, 36.0, "https://www.youtube.com/results?search_query=Dumbbell+Shrugs+Technique"),

        LibraryExercise("lib_ez_bar_curl", "EZ Bar Curls", "ARMS", "biceps", "forearms", "EZ Bar",
            "Wrist-friendly cambered bar curl overloading biceps brachii and brachialis.",
            "Stand tall with upper arms pinned at sides and elbows fully extended.\nCurl bar toward shoulders without swinging lower back.\nLower over 2–3 seconds to full elbow extension.",
            "8–12", 75, 32.5, "https://www.youtube.com/results?search_query=EZ+Bar+Curl+Form"),
        LibraryExercise("lib_db_curls", "Dumbbell Curls", "ARMS", "biceps", "forearms", "Dumbbell",
            "Supinating free-weight curl recruiting both flexion and forearm supination functions of the biceps.",
            "Begin with neutral or supinated palms at full arm extension.\nCurl simultaneously while rotating pinkies upward at peak squeeze.\nControl eccentric all the way down.",
            "10–15", 60, 14.0, "https://www.youtube.com/results?search_query=Dumbbell+Bicep+Curl+Form"),
        LibraryExercise("lib_db_occlusion_curls", "Dumbbell Occlusion Curls", "ARMS", "biceps", "forearms", "Dumbbell",
            "High-rep metabolite / constant-tension curl minimizing joint stress while maximizing cellular swelling.",
            "Select a light weight allowing 20–30 strict continuous reps.\nKeep constant tension on biceps without resting at top or bottom.\nRest only 30 seconds between sets.",
            "20–30", 30, 8.0, "https://www.youtube.com/results?search_query=High+Rep+Bicep+Curls"),
        LibraryExercise("lib_weighted_dips", "Weighted Dips", "ARMS", "triceps", "chest,front_delts", "Bodyweight",
            "Heavy multi-joint vertical push overloading lateral/medial triceps heads and lower chest.",
            "Support yourself on parallel bars with weight attached to dip belt.\nLower under control until shoulders dip slightly below elbows.\nPress forcefully to full elbow lockout.",
            "8–12", 120, 15.0, "https://www.youtube.com/results?search_query=Weighted+Dips+Form"),
        LibraryExercise("lib_oh_ez_ext", "Overhead EZ Bar Extension", "ARMS", "triceps", "forearms", "EZ Bar",
            "Overhead shoulder flexion places the long head of the triceps under maximal stretch-mediated hypertrophy.",
            "Hold EZ bar overhead with narrow inner grip and elbows angled slightly forward.\nLower bar behind head until forearms contact biceps for maximum stretch.\nExtend elbows smoothly back overhead without flaring.",
            "10–15", 75, 27.5, "https://www.youtube.com/results?search_query=Overhead+EZ+Bar+Tricep+Extension"),
        LibraryExercise("lib_wrist_curl", "Cable / Barbell Wrist Curl", "ARMS", "forearms", "biceps", "Barbell",
            "Direct forearm flexor isolation rolling from fingertip extension to full wrist flexion.",
            "Rest forearms across bench or thighs with wrists beyond edge.\nLet bar roll toward fingers, then curl wrists forcefully upward.\nPause 1 second at peak forearm squeeze.",
            "15–20", 60, 25.0, "https://www.youtube.com/results?search_query=Barbell+Wrist+Curl+Forearms"),

        LibraryExercise("lib_machine_crunch", "Machine Crunches", "CORE", "abs", "", "Machine",
            "Loaded spinal flexion allowing progressive overload across the rectus abdominis.",
            "Secure pads and allow thoracic spine to extend slightly at start for an ab stretch.\nExhale and curl ribcage down toward pelvis (avoid flat-back hip hinging).\nSqueeze abs 1 second at bottom and return slowly.",
            "12–20", 60, 45.0, "https://www.youtube.com/results?search_query=Machine+Crunch+Abs+Form"),
        LibraryExercise("lib_hanging_knee_raise", "Hanging Knee Raises", "CORE", "abs", "forearms", "Bodyweight",
            "Bottom-up pelvic-to-ribcage spinal flexion targeting lower rectus abdominis.",
            "Hang from pullup bar (use straps if grip fatigues first).\nCurl pelvis upward so knees approach chest—rounding lower back is essential.\nLower legs slowly without swinging.",
            "12–20", 60, 0.0, "https://www.youtube.com/results?search_query=Hanging+Knee+Raise+Abs"),

        LibraryExercise("lib_high_bar_squat", "High Bar Squats", "LEGS", "quads", "glutes,abs", "Barbell",
            "Upright-torso barbell squat maximizing knee flexion depth and quadriceps tension.",
            "Rest barbell high on upper traps; elevate heels if ankle mobility limits depth.\nBrace 360 degrees and descend upright until hamstrings cover calves.\nDrive smoothly out of the hole keeping knees tracking over toes.",
            "6–10", 180, 110.0, "https://www.youtube.com/results?search_query=High+Bar+Squat+Technique"),
        LibraryExercise("lib_leg_press", "Leg Press", "LEGS", "quads", "glutes", "Machine",
            "Externally stabilized lower-body press allowing safely taking quadriceps close to 0 RIR.",
            "Place feet low-to-middle on sled hip-width apart and pull hips into seat.\nLower sled as deep as possible without lumbar rounding.\nPress evenly through mid-foot without snapping knees locked.",
            "10–15", 150, 180.0, "https://www.youtube.com/results?search_query=Leg+Press+Quad+Focus"),
        LibraryExercise("lib_smith_ff_squat", "Smith Machine Feet Forward Squats", "LEGS", "quads", "glutes", "Smith Machine",
            "Hack-squat style fixed-bar squat isolating quads with minimal spinal erector fatigue.",
            "Position feet 15–25 cm forward of vertical bar path.\nKeep back vertical as you squat into deep knee flexion.\nPause briefly at bottom before driving upward.",
            "10–15", 150, 85.0, "https://www.youtube.com/results?search_query=Smith+Machine+Squat+Quads"),
        LibraryExercise("lib_sl_deadlift", "Stiff-Legged Deadlift", "LEGS", "hamstrings", "glutes,back", "Barbell",
            "Loaded hip hinge stretching the hamstrings across the hip joint.",
            "Unrack or lift bar to hip crease with knees kept nearly straight (soft unlock).\nPush hips backward while keeping spine neutral until maximal hamstring stretch.\nDrive hips forward to stand tall.",
            "8–12", 150, 105.0, "https://www.youtube.com/results?search_query=Stiff+Leg+Deadlift+Form"),
        LibraryExercise("lib_lying_leg_curl", "Lying Leg Curls", "LEGS", "hamstrings", "calves", "Machine",
            "Direct knee-flexion isolation recruiting short head of biceps femoris and medial hamstrings.",
            "Align knees with machine pivot and press hips firmly into pad.\nCurl pad all the way to glutes without hips lifting.\nLower over 3 full seconds to complete knee extension.",
            "10–15", 90, 55.0, "https://www.youtube.com/results?search_query=Lying+Leg+Curl+Technique"),
        LibraryExercise("lib_sumo_deficit_dl", "Sumo Deficit Deadlift", "LEGS", "glutes", "hamstrings,quads,back", "Barbell",
            "Wide-stance elevated pull exaggerating hip flexion and abduction stretch on glutes.",
            "Stand on a 2–5 cm platform in wide sumo stance with toes angled out.\nWedge hips close to bar with knees pushed wide.\nDrive floor apart and lock hips cleanly at top.",
            "6–10", 180, 130.0, "https://www.youtube.com/results?search_query=Sumo+Deadlift+Technique"),
        LibraryExercise("lib_glute_bridge", "Barbell Glute Bridge", "LEGS", "glutes", "hamstrings", "Barbell",
            "Shortened-position hip extension loading gluteus maximus at peak lockout.",
            "Pad barbell across hip crease with shins vertical at top.\nLower hips under control, then drive heels down to full hip extension.\nHold peak glute squeeze 1–2 seconds.",
            "10–15", 120, 120.0, "https://www.youtube.com/results?search_query=Barbell+Glute+Bridge+Form"),
        LibraryExercise("lib_leg_press_calves", "Calves on Leg Press", "LEGS", "calves", "", "Machine",
            "Straight-knee plantarflexion prioritizing gastrocnemius stretch under load.",
            "Place balls of feet on bottom edge of sled with knees straight (soft unlock).\nLower heels into deep dorsiflexion stretch and pause 1–2 seconds.\nPress smoothly onto toes without bouncing.",
            "12–15", 60, 140.0, "https://www.youtube.com/results?search_query=Leg+Press+Calf+Raise")
    )

    fun defaultTodayMetrics(): DailyMetrics = DailyMetrics(
        dateIso = LocalDate.now().toString(),
        bodyweightKg = 82.4,
        steps = 8450,
        phase = "Massing",
        baseTdee = 2650,
        proteinPerKg = 2.1
    )

    fun defaultTodayMeals(): List<MealLog> {
        val today = LocalDate.now()
        val now = System.currentTimeMillis()
        return listOf(
            MealLog("seed_meal_prev3", today.minusDays(3).toString(), "Post-Workout", "Chicken Breast, Jasmine Rice & Avocado", 920, 74, 112, 18, now - 259200000L),
            MealLog("seed_meal_prev2", today.minusDays(2).toString(), "Breakfast", "Whey Isolate Oats & Berries", 680, 54, 88, 12, now - 172800000L),
            MealLog("seed_meal_prev1", today.minusDays(1).toString(), "Dinner", "Lean Beef 93/7, Sweet Potato & Yogurt", 980, 76, 108, 24, now - 86400000L),
            MealLog("seed_meal_1", today.toString(), "Breakfast", "Whey Isolate Oats, Banana & Egg Whites", 640, 52, 86, 10, now - 14400000L),
            MealLog("seed_meal_2", today.toString(), "Pre-Workout", "Jasmine Rice, Chicken Breast & Honey", 590, 48, 84, 6, now - 7200000L)
        )
    }

    fun defaultSavedCustomMeals(): List<SavedCustomMeal> = listOf(
        SavedCustomMeal("scm_1", "Whey Oats & Banana Bowl", "Breakfast", 640, 52, 86, 10, "Whey Isolate 32g, Oats 60g, Banana 120g"),
        SavedCustomMeal("scm_2", "Chicken & Jasmine Rice", "Post-Workout", 590, 48, 84, 6, "Chicken Breast 150g, Jasmine Rice 250g, Honey 15g"),
        SavedCustomMeal("scm_3", "Lean Beef & Sweet Potato", "Dinner", 720, 54, 78, 20, "Lean Beef 180g, Sweet Potato 250g, Olive Oil 7g"),
        SavedCustomMeal("scm_4", "0% Greek Yogurt & Berries", "Snack", 315, 32, 28, 8, "Greek Yogurt 250g, Berries 100g, Almonds 14g")
    )
}

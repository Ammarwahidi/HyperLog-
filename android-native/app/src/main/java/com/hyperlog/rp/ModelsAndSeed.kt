package com.hyperlog.rp

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import kotlin.math.roundToInt

/**
 * ============================================================================
 * ModelsAndSeed.kt — The Data Blueprints & Starter Catalog of HyperLog
 *
 * Beginner Guide to Fitness Words Used in This File:
 * - MV  (Maintenance Volume): Minimum weekly sets needed so you don't lose muscle.
 * - MEV (Minimum Effective Volume): Weekly sets where new muscle growth begins!
 * - MAV (Maximum Adaptive Volume): The "sweet spot" of weekly sets for best results.
 * - MRV (Maximum Recoverable Volume): The ceiling — more sets than this can make you too tired.
 * - RIR (Reps in Reserve): How many more reps you *could* have done before stopping (e.g., 2 RIR = 2 reps left in the tank).
 * ============================================================================
 */
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
    CLAYMORPHISM("clay", "Soft Clay 3D", "Clay", "Plump 3D pastel clay cards with smooth glass-like specular bevels", false),
    CLAY_DARK("clay_dark", "Midnight Clay 3D", "Clay Dark", "Deep indigo matte clay with luminous 3D inner rims", true),
    DAYLIGHT("light", "Daylight", "Light", "Crisp high-contrast slate for bright gyms", false),
    FROST_GLASS("glass", "Pastel Glass", "Glass", "Soft pastel backdrop with frosted glass cards", false),
    NIGHT_SLATE("dark", "Night Slate", "Night", "Deep cobalt dark mode for evening sessions", true),
    AMOLED("amoled", "True AMOLED", "AMOLED", "Pure #000000 black for OLED battery savings", true),
    GRAPHITE("graphite", "Graphite Dark", "Graphite", "Neutral charcoal iron aesthetic", true);

    companion object {
        fun fromId(id: String?): AppThemeMode {
            val norm = id?.trim()?.lowercase() ?: return CLAYMORPHISM
            if (norm == "glass" || norm == "pastel-glass" || norm == "pistel-glass" || norm == "frost_glass") {
                return FROST_GLASS
            }
            if (norm == "clay-dark" || norm == "clay_dark") {
                return CLAY_DARK
            }
            return entries.firstOrNull { it.id == norm } ?: CLAYMORPHISM
        }
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
    val completed: Boolean,
    val completedDateIso: String? = null,
    val rpe: Double? = null
)

data class WorkoutDayNote(
    val dateIso: String,
    val title: String,
    val durationMinutes: Int,
    val notes: String
)

data class ExerciseSessionPoint(
    val dateIso: String,
    val shortLabel: String,
    val topWeightKg: Double,
    val avgWeightKg: Double,
    val est1RmKg: Double,
    val totalSets: Int,
    val bestReps: Int,
    val avgRpe: Double?
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

    val isCustom: Boolean
        get() = id.startsWith("lib_custom_")

    fun inferModality(): String {
        val eq = equipment.trim().lowercase()
        val grp = majorGroup.trim().lowercase()
        return when {
            eq == "yoga" || grp == "yoga" -> "Yoga"
            eq == "stretching" || grp == "stretching" -> "Stretching"
            eq == "cardio" || grp == "cardio" || primaryMuscle == "cardio" -> "Cardio"
            else -> "Strength"
        }
    }

    fun inferLevel(): String {
        val eq = equipment.trim().lowercase()
        val nm = name.trim().lowercase()
        return when {
            nm.contains("weighted") || nm.contains("deficit") || nm.contains("snatch") || nm.contains("clean") || nm.contains("pistol") -> "Advanced"
            eq in setOf("machine", "bodyweight", "stretching", "yoga", "bands", "cardio") -> "Beginner"
            else -> "Intermediate"
        }
    }
}

data class UserAccountProfile(
    val uid: String,
    val displayName: String,
    val email: String,
    val provider: String, // "Guest", "Email", "Google", "Facebook"
    val dbFileName: String
)

data class OfflineDemoVideoEntry(
    val exerciseId: String,
    val exerciseName: String,
    val primaryMuscle: String,
    val majorGroup: String,
    val equipment: String,
    val modality: String,
    val motionPattern: String,
    val localFilePath: String,
    val fileSizeBytes: Long,
    val durationSec: Int,
    val coachingStepsJson: String,
    val videoUrl: String,
    val downloadedAtEpochMs: Long,
    val downloadedAtIso: String
) {
    fun coachingSteps(): List<String> {
        if (coachingStepsJson.isBlank()) return emptyList()
        return try {
            val arr = JSONArray(coachingStepsJson)
            (0 until arr.length()).mapNotNull { idx -> arr.optString(idx, "").trim().takeIf { it.isNotEmpty() } }
        } catch (_: Exception) {
            emptyList()
        }
    }
}

data class WorkoutHistoryAnalytics(
    val currentWorkoutStreakDays: Int,
    val bestWorkoutStreakDays: Int,
    val totalWorkoutsAllTime: Int,
    val workoutsLast7Days: Int,
    val workoutsLast30Days: Int,
    val avgWorkoutsPerWeek: Double,
    val totalDurationMinutes: Int,
    val avgDurationMinutes: Int,
    val totalSetsAllTime: Int,
    val totalTonnageKg: Double,
    val last14DaysConsistency: List<Triple<String, String, Boolean>> // (dateIso, dayLabel, hasWorkout)
)

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

data class WellbeingDailyRecord(
    val dateIso: String,
    val waterMl: Int,
    val sleepHours: Double,
    val energyScore: Int,
    val stressScore: Int,
    val sorenessScore: Int,
    val breathMinutes: Int,
    val mobilityMinutes: Int,
    val notes: String
) {
    fun readinessScore(): Int {
        val sleepNorm = ((sleepHours.coerceIn(4.0, 9.0) - 4.0) / 5.0) * 35.0
        val energyNorm = (energyScore.coerceIn(1, 5) / 5.0) * 25.0
        val stressNorm = ((6 - stressScore.coerceIn(1, 5)) / 5.0) * 20.0
        val soreNorm = ((6 - sorenessScore.coerceIn(1, 5)) / 5.0) * 20.0
        return (sleepNorm + energyNorm + stressNorm + soreNorm).roundToInt().coerceIn(15, 100)
    }
}

data class HealthConnectSyncRecord(
    val id: String,
    val syncedAtEpochMs: Long,
    val summary: String,
    val setsCount: Int,
    val tonnageKg: Double,
    val status: String
)

data class GuidedFlowStep(
    val name: String,
    val durationSec: Int,
    val cue: String,
    val primaryMuscle: String
)

data class GuidedFlowRoutine(
    val id: String,
    val title: String,
    val modality: String, // "Yoga", "Stretching", "Cardio"
    val durationMin: Int,
    val summary: String,
    val steps: List<GuidedFlowStep>
)

data class StandaloneSession(
    val sessionId: String,
    val templateId: String,
    val templateName: String,
    val exercises: List<TemplateExerciseItem>
)

fun serializeStandaloneSession(session: StandaloneSession?): String {
    if (session == null) return ""
    return JSONObject().apply {
        put("sessionId", session.sessionId)
        put("templateId", session.templateId)
        put("templateName", session.templateName)
        put("exercisesJson", serializeTemplateItems(session.exercises))
    }.toString()
}

fun parseStandaloneSession(raw: String?): StandaloneSession? {
    if (raw.isNullOrBlank()) return null
    return try {
        val o = JSONObject(raw)
        val sid = o.optString("sessionId", "")
        if (sid.isBlank()) return null
        StandaloneSession(
            sessionId = sid,
            templateId = o.optString("templateId", "custom"),
            templateName = o.optString("templateName", "Custom Workout"),
            exercises = parseTemplateItems(o.optString("exercisesJson", "[]"))
        )
    } catch (_: Exception) {
        null
    }
}

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

data class IndianRecipe(
    val id: String,
    val name: String,
    val region: String,
    val dietaryTag: String, // Primary tag: "Vegetarian", "High-Protein Veg", "Vegan", "Eggetarian", "Non-Vegetarian"
    val mealType: String,
    val prepMinutes: Int,
    val cookMinutes: Int,
    val calories: Int,
    val proteinG: Int,
    val carbsG: Int,
    val fatG: Int,
    val summary: String,
    val ingredients: List<String>,
    val steps: List<String>,
    val dietaryTags: List<String> = listOf(dietaryTag),
    val cookingStyle: String = "",
    val videoUrl: String = ""
) {
    fun matchesDietFilter(filter: String): Boolean {
        if (filter.isBlank() || filter.equals("All", ignoreCase = true)) return true
        if (filter.equals("Vegetarian", ignoreCase = true)) {
            val vegSet = setOf("vegetarian", "high-protein veg", "vegan")
            return dietaryTag.lowercase() in vegSet || dietaryTags.any { it.lowercase() in vegSet }
        }
        return dietaryTag.equals(filter, ignoreCase = true) ||
            dietaryTags.any { it.equals(filter, ignoreCase = true) }
    }

    fun resolvedCookingStyle(): String {
        if (cookingStyle.isNotBlank()) return cookingStyle
        val n = name.lowercase()
        val r = region.lowercase()
        return when {
            "tikka" in n || "tandoor" in n -> "Tandoori & Air-Fryer Chargrill"
            "pesarattu" in n || "dosa" in n || "idli" in n || "south" in r -> "South Indian Fermented & Tawa Batter"
            "dal" in n || "rajma" in n || "chana" in n || "chole" in n -> "North Indian Double-Tadka Legumes"
            "palak" in n || "bhakri" in n || "millet" in n || "thepla" in n -> "Iron-Skillet Greens & Millet Flatbreads"
            "bhurji" in n || "egg" in n || "chaat" in n || "sprout" in n -> "Mumbai Tawa Bhurji & Street Chaat"
            "keema" in n || "chicken" in n -> "Slow-Simmered Bhuna Masala"
            "fish" in n || "prawn" in n || "coastal" in r -> "Coastal Curry-Leaf & Kokum Simmer"
            else -> "Homestyle Indian Macro Prep"
        }
    }

    fun resolvedVideoUrl(): String {
        if (videoUrl.isNotBlank()) return videoUrl
        val n = name.lowercase()
        return when {
            "paneer tikka" in n -> "https://www.youtube.com/results?search_query=high+protein+paneer+tikka+air+fryer+tandoori+recipe"
            "chicken tikka" in n -> "https://www.youtube.com/results?search_query=high+protein+tandoori+chicken+tikka+breast+indian+recipe"
            "pesarattu" in n -> "https://www.youtube.com/results?search_query=crispy+green+moong+dal+pesarattu+dosa+south+indian+recipe"
            "dal" in n -> "https://www.youtube.com/results?search_query=dhaba+style+double+tadka+dal+high+protein+indian+recipe"
            "rajma" in n || "chole" in n || "chana" in n -> "https://www.youtube.com/results?search_query=punjabi+masala+rajma+chole+healthy+indian+recipe"
            "palak" in n -> "https://www.youtube.com/results?search_query=authentic+lasooni+palak+paneer+tofu+indian+recipe"
            "bhurji" in n || "egg" in n -> "https://www.youtube.com/results?search_query=mumbai+street+style+masala+egg+bhurji+tawa+recipe"
            "fish" in n -> "https://www.youtube.com/results?search_query=kerala+goan+coastal+fish+curry+authentic+indian+recipe"
            "soya" in n || "keema" in n -> "https://www.youtube.com/results?search_query=high+protein+soya+keema+matar+bhuna+masala+recipe"
            else -> {
                val query = java.net.URLEncoder.encode("$name authentic healthy Indian recipe video", "UTF-8")
                "https://www.youtube.com/results?search_query=$query"
            }
        }
    }
}

data class BreathingAudioTrackInfo(
    val id: String,
    val title: String,
    val subtitle: String,
    val baseFreqHz: Double
)

/**
 * Stores a post-testing feedback report or bug note written by a user on their phone.
 * Saved offline in SQLite (`user_feedback` table) AND mirrored to `HyperLogData/feedback/tester_feedback.json`.
 */
data class UserFeedbackEntry(
    val id: String,
    val rating: Int,
    val category: String,
    val message: String,
    val deviceInfo: String,
    val createdAtEpochMs: Long,
    val createdAtIso: String
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
        OfflineFoodItem("fd_asparagus", "Grilled Asparagus", "Fruit & Veg", 150, "150g spears", 3.6, 6.0, 0.3),

        // Authentic Indian Foods & High-Protein Staples
        OfflineFoodItem("fd_ind_paneer_lowfat", "Low-Fat Malai Paneer", "Indian Foods", 100, "100g cubes", 22.0, 4.0, 8.5),
        OfflineFoodItem("fd_ind_soya_chunks", "Soya Chunks / Nutrela (Dry Wt)", "Indian Foods", 50, "50g dry (150g boiled)", 26.0, 16.5, 0.5),
        OfflineFoodItem("fd_ind_tandoori_chicken", "Tandoori Chicken Breast Tikka", "Indian Foods", 150, "150g roasted", 43.0, 3.5, 5.5),
        OfflineFoodItem("fd_ind_moong_dal", "Yellow Moong Dal Tadka", "Indian Foods", 200, "1 katori (200g)", 14.5, 30.0, 4.2),
        OfflineFoodItem("fd_ind_rajma", "Homestyle Rajma Masala", "Indian Foods", 200, "1 katori (200g)", 13.5, 34.0, 5.0),
        OfflineFoodItem("fd_ind_chana_masala", "Punjabi Chole / Chana Masala", "Indian Foods", 200, "1 katori (200g)", 14.0, 36.0, 6.0),
        OfflineFoodItem("fd_ind_kala_chana", "Boiled Kala Chana Chaat", "Indian Foods", 150, "150g bowl", 13.0, 29.0, 2.8),
        OfflineFoodItem("fd_ind_roti_phulka", "Whole Wheat Phulka / Chapati", "Indian Foods", 70, "2 phulkas (70g)", 6.4, 34.0, 1.4),
        OfflineFoodItem("fd_ind_ragi_roti", "Ragi / Bajra Millet Bhakri", "Indian Foods", 80, "2 rotis (80g)", 5.8, 36.0, 1.8),
        OfflineFoodItem("fd_ind_basmati_rice", "Steamed Aged Basmati Rice", "Indian Foods", 150, "150g cooked", 4.2, 41.0, 0.5),
        OfflineFoodItem("fd_ind_poha", "Kanda Batata Poha with Peanuts", "Indian Foods", 180, "1 plate (180g)", 5.8, 38.0, 6.5),
        OfflineFoodItem("fd_ind_upma", "Vegetable Rava & Oats Upma", "Indian Foods", 180, "1 bowl (180g)", 6.5, 34.0, 5.5),
        OfflineFoodItem("fd_ind_idli", "Steamed Rice & Urad Dal Idli", "Indian Foods", 150, "3 idlis (150g)", 6.6, 39.0, 0.9),
        OfflineFoodItem("fd_ind_ragi_dosa", "Crispy Ragi & Urad Protein Dosa", "Indian Foods", 110, "1 dosa (110g)", 6.2, 29.0, 3.5),
        OfflineFoodItem("fd_ind_besan_chilla", "Spiced Besan Veggie Chilla", "Indian Foods", 140, "2 chillas (140g)", 13.5, 28.0, 6.0),
        OfflineFoodItem("fd_ind_moong_chilla", "Green Moong Dal Paneer Chilla", "Indian Foods", 160, "2 chillas (160g)", 18.5, 26.0, 5.5),
        OfflineFoodItem("fd_ind_egg_bhurji", "Masala Egg Bhurji (2 Whole + 2 Whites)", "Indian Foods", 170, "170g scramble", 21.0, 4.5, 11.0),
        OfflineFoodItem("fd_ind_dahi", "Thick Ghar Ka Dahi (Low-Fat Curd)", "Indian Foods", 200, "1 bowl (200g)", 10.5, 9.0, 3.0),
        OfflineFoodItem("fd_ind_chaas", "Jeera Masala Chaas (Buttermilk)", "Indian Foods", 250, "1 glass (250ml)", 5.2, 4.8, 1.5),
        OfflineFoodItem("fd_ind_makhana", "Dry-Roasted Spiced Makhana", "Indian Foods", 30, "30g bowl", 3.2, 22.0, 1.2),
        OfflineFoodItem("fd_ind_roasted_chana", "Crunchy Bhuna Chana", "Indian Foods", 45, "45g handful", 9.5, 25.0, 2.2),
        OfflineFoodItem("fd_ind_ghee", "Pure Desi Cow Ghee", "Indian Foods", 5, "1 tsp (5g)", 0.0, 0.0, 5.0)
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
        val today = LocalDate.now()
        val list = mutableListOf<SetLog>()
        for (ex in exercises) {
            val targetSets = ex.w3Sets
            val defaultReps = Regex("\\d+").find(ex.repRange)?.value?.toIntOrNull() ?: 10
            val completedDate = when (ex.dayNumber) {
                1 -> today.minusDays(3).toString()
                2 -> today.minusDays(2).toString()
                4 -> today.minusDays(1).toString()
                else -> null
            }
            val isCompleted = completedDate != null
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
                        completed = isCompleted,
                        completedDateIso = completedDate,
                        rpe = if (isCompleted) (8.5 + (if (s == targetSets) 0.5 else 0.0)).coerceAtMost(10.0) else null
                    )
                )
            }
        }
        return list
    }

    fun defaultHistoricalProgressionSetLogs(exercises: List<DayExercise>): List<SetLog> {
        val today = LocalDate.now()
        val list = mutableListOf<SetLog>()

        // Seed 6 prior microcycles across the past 42 days so Calendar & 10-Session Progression Charts have rich history
        data class HistBlock(val tag: String, val weekNum: Int, val daysAgoBase: Long, val loadScale: Double, val rirVal: Double, val baseRpe: Double)
        val blocks = listOf(
            HistBlock("hist_b1_w1", 1, 42L, 0.84, 3.0, 7.0),
            HistBlock("hist_b1_w2", 2, 35L, 0.87, 2.5, 7.5),
            HistBlock("hist_b1_w3", 3, 28L, 0.90, 2.0, 8.0),
            HistBlock("hist_b1_w4", 4, 21L, 0.93, 1.0, 8.5),
            HistBlock("w1", 1, 17L, 0.95, 3.0, 7.5),
            HistBlock("w2", 2, 10L, 0.98, 2.0, 8.0)
        )

        for (blk in blocks) {
            for (ex in exercises) {
                val dayOffset = (blk.daysAgoBase - (ex.dayNumber - 1)).coerceAtLeast(4L)
                val dateIso = today.minusDays(dayOffset).toString()
                val setCount = when (blk.weekNum) {
                    1 -> ex.w1Sets
                    2 -> ex.w2Sets
                    4 -> ex.w4Sets
                    else -> ex.w3Sets
                }.coerceAtMost(4)
                val baseReps = Regex("\\d+").find(ex.repRange)?.value?.toIntOrNull() ?: 10
                val scaledWeight = if (ex.defaultWeightKg > 0.0) {
                    (kotlin.math.round((ex.defaultWeightKg * blk.loadScale) / 2.5) * 2.5).coerceAtLeast(2.5)
                } else {
                    0.0
                }
                for (s in 1..setCount) {
                    val idPrefix = if (blk.tag == "w1" || blk.tag == "w2") {
                        "${blk.tag}_d${ex.dayNumber}_${ex.id}_s$s"
                    } else {
                        "${blk.tag}_d${ex.dayNumber}_${ex.id}_s$s"
                    }
                    val tplSession = if (blk.tag.startsWith("hist_")) blk.tag else null
                    list.add(
                        SetLog(
                            id = idPrefix,
                            week = blk.weekNum,
                            dayNumber = ex.dayNumber,
                            templateSessionId = tplSession,
                            exerciseId = ex.id,
                            exerciseName = ex.name,
                            muscleId = ex.muscleId,
                            setIndex = s,
                            weightKg = scaledWeight,
                            reps = baseReps,
                            rir = blk.rirVal,
                            restSeconds = ex.restSeconds,
                            completed = true,
                            completedDateIso = dateIso,
                            rpe = (blk.baseRpe + (if (s == setCount) 0.5 else 0.0)).coerceAtMost(10.0)
                        )
                    )
                }
            }
        }
        return list
    }

    fun defaultStarterTemplates(): List<WorkoutTemplate> {
        val now = System.currentTimeMillis()
        return listOf(
            WorkoutTemplate(
                "tpl_rp_hyp_chest_back", "RP Hypertrophy · Chest, Back & Arms", "Hypertrophy", "RP Hypertrophy · Upper",
                "High-stimulus antagonist chest, lats, side delts, and arms hypertrophy template.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("rph_1", "lib_incline_db_press", "Incline Dumbbell Press", "chest", 4, "8–12", 120, 32.0),
                    TemplateExerciseItem("rph_2", "lib_pullups", "Pullups", "back", 4, "8–12", 120, 0.0),
                    TemplateExerciseItem("rph_3", "lib_cable_flies", "Cable Flies", "chest", 3, "12–15", 75, 20.0),
                    TemplateExerciseItem("rph_4", "lib_cable_rows", "Cable Rows", "back", 3, "10–15", 90, 70.0),
                    TemplateExerciseItem("rph_5", "lib_db_side_laterals", "Dumbbell Side Laterals", "rear_side_delts", 4, "12–20", 60, 12.0),
                    TemplateExerciseItem("rph_6", "lib_oh_ez_ext", "Overhead EZ Bar Extension", "triceps", 3, "10–15", 75, 27.5),
                    TemplateExerciseItem("rph_7", "lib_db_curls", "Dumbbell Curls", "biceps", 3, "10–15", 60, 14.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_rp_hyp_quads_delts", "RP Hypertrophy · Quads, Hamstrings & Delts", "Hypertrophy", "RP Hypertrophy · Lower + Delts",
                "Deep knee-flexion quad compounds paired with lengthened hamstrings, calves, and lateral delts.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("rpq_1", "lib_high_bar_squat", "High Bar Squats", "quads", 4, "6–10", 180, 110.0),
                    TemplateExerciseItem("rpq_2", "lib_sl_deadlift", "Stiff-Legged Deadlift", "hamstrings", 4, "8–12", 150, 105.0),
                    TemplateExerciseItem("rpq_3", "lib_leg_press", "Leg Press", "quads", 3, "10–15", 120, 180.0),
                    TemplateExerciseItem("rpq_4", "lib_lying_leg_curl", "Lying Leg Curls", "hamstrings", 3, "10–15", 90, 55.0),
                    TemplateExerciseItem("rpq_5", "lib_leg_press_calves", "Calves on Leg Press", "calves", 4, "12–15", 60, 140.0),
                    TemplateExerciseItem("rpq_6", "lib_db_rear_lateral", "Dumbbell Rear Lateral Raise", "rear_side_delts", 4, "15–20", 60, 10.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_rp_hyp_posterior_back", "RP Hypertrophy · Posterior Chain & Back Specialization", "Hypertrophy", "RP Hypertrophy · Posterior",
                "Focused glute, hamstring, upper-back thickness, and biceps specialization session.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("rpp_1", "lib_sumo_deficit_dl", "Sumo Deficit Deadlift", "glutes", 3, "6–10", 180, 130.0),
                    TemplateExerciseItem("rpp_2", "lib_bb_bent_row", "Barbell Bent Row", "back", 4, "8–12", 120, 82.5),
                    TemplateExerciseItem("rpp_3", "lib_glute_bridge", "Barbell Glute Bridge", "glutes", 3, "10–15", 120, 120.0),
                    TemplateExerciseItem("rpp_4", "lib_weighted_pullups", "Weighted Pullups", "back", 3, "6–10", 150, 12.5),
                    TemplateExerciseItem("rpp_5", "lib_ez_bar_curl", "EZ Bar Curls", "biceps", 4, "8–12", 75, 32.5)
                )), now
            ),
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
            ),
            WorkoutTemplate(
                "tpl_yoga_sun_flow", "Morning Vinyasa Yoga & Spine Flow", "Starter", "Yoga · 20 Min",
                "Restorative breath-synchronized yoga flow opening thoracic spine, hips, hamstrings, and shoulders.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("yg_1", "lib_yoga_sun_salutation", "Sun Salutation Vinyasa Flow", "back", 3, "60s flow", 30, 0.0),
                    TemplateExerciseItem("yg_2", "lib_yoga_down_dog_cobra", "Downward Dog to Cobra", "hamstrings", 3, "45s hold", 25, 0.0),
                    TemplateExerciseItem("yg_3", "lib_yoga_warrior_flow", "Warrior II & Reverse Warrior", "quads", 3, "45s/side", 25, 0.0),
                    TemplateExerciseItem("yg_4", "lib_stretch_pigeon_9090", "90/90 Hip & Pigeon Stretch", "glutes", 2, "60s/side", 20, 0.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_mobility_deep_stretch", "Full-Body Deep Stretching & Mobility", "Starter", "Stretching · 18 Min",
                "Post-lifting or rest-day joint decompression targeting hip flexors, thoracic rotation, pecs, and calves.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("st_1", "lib_stretch_worlds_greatest", "World's Greatest Lunge & Thoracic Opener", "back", 3, "5/side", 30, 0.0),
                    TemplateExerciseItem("st_2", "lib_stretch_pigeon_9090", "90/90 Hip & Pigeon Stretch", "glutes", 3, "60s/side", 20, 0.0),
                    TemplateExerciseItem("st_3", "lib_yoga_down_dog_cobra", "Downward Dog to Cobra", "hamstrings", 3, "45s", 20, 0.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_cardio_hiit_zone2", "HIIT + Zone 2 Cardio Conditioning", "Starter", "Cardio · 25 Min",
                "Metabolic conditioning pairing crisp work-rest intervals with steady aerobic base work.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("cd_1", "lib_cardio_zone2_incline", "Zone 2 Incline Walk / Bike", "quads", 2, "8 min", 45, 0.0),
                    TemplateExerciseItem("cd_2", "lib_cardio_hiit_sprint", "Tabata Assault Bike / Rowing Sprint", "quads", 6, "30s sprint", 60, 0.0),
                    TemplateExerciseItem("cd_3", "lib_cardio_jump_rope", "Jump Rope Conditioning", "calves", 4, "60s", 45, 0.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_forearm_beginner", "Forearm & Grip · Beginner Foundation", "Forearms & Grip", "Forearms · 15 Min",
                "Joint-friendly wrist flexor, extensor, and brachioradialis starter routine you can run after any workout.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("fa_b1", "lib_hammer_curl", "Dumbbell Hammer Curl", "forearms", 3, "10–14", 60, 12.0),
                    TemplateExerciseItem("fa_b2", "lib_wrist_curl", "Cable / Barbell Wrist Curl", "forearms", 3, "15–20", 45, 20.0),
                    TemplateExerciseItem("fa_b3", "lib_reverse_wrist_curl", "Dumbbell Reverse Wrist Curl", "forearms", 3, "15–20", 45, 6.0),
                    TemplateExerciseItem("fa_b4", "lib_dead_hang_hold", "Dead Hang Grip Hold", "forearms", 2, "45s hold", 60, 0.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_forearm_intermediate", "Forearm & Grip · Hypertrophy Builder", "Forearms & Grip", "Forearms · 22 Min",
                "Complete 360-degree forearm thickness targeting brachioradialis, finger flexors, and wrist extensors.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("fa_i1", "lib_reverse_ez_curl", "Reverse-Grip EZ Bar Curl", "forearms", 4, "10–15", 60, 22.5),
                    TemplateExerciseItem("fa_i2", "lib_behind_back_wrist_curl", "Behind-the-Back Barbell Wrist Curl", "forearms", 4, "12–20", 60, 35.0),
                    TemplateExerciseItem("fa_i3", "lib_reverse_wrist_curl", "Dumbbell Reverse Wrist Curl", "forearms", 3, "15–20", 45, 8.0),
                    TemplateExerciseItem("fa_i4", "lib_farmers_carry", "Heavy Dumbbell Farmer's Carry", "forearms", 3, "40m walk", 75, 28.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_forearm_advanced", "Forearm & Grip · Iron Grip Specialization", "Forearms & Grip", "Forearms · 28 Min",
                "High-volume crushing, pinching, and loaded carry forearm specialization block.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("fa_a1", "lib_hammer_curl", "Dumbbell Hammer Curl", "forearms", 4, "8–12", 75, 18.0),
                    TemplateExerciseItem("fa_a2", "lib_behind_back_wrist_curl", "Behind-the-Back Barbell Wrist Curl", "forearms", 4, "15–20", 60, 45.0),
                    TemplateExerciseItem("fa_a3", "lib_reverse_ez_curl", "Reverse-Grip EZ Bar Curl", "forearms", 3, "12–15", 60, 25.0),
                    TemplateExerciseItem("fa_a4", "lib_wrist_roller_pinch", "Wrist Roller & Plate Pinch Hold", "forearms", 3, "45s roll", 60, 10.0),
                    TemplateExerciseItem("fa_a5", "lib_farmers_carry", "Heavy Dumbbell Farmer's Carry", "forearms", 3, "45m walk", 90, 34.0)
                )), now
            )
        )
    }

    fun offlineGuidedFlows(): List<GuidedFlowRoutine> = listOf(
        GuidedFlowRoutine(
            id = "flow_yoga_morning",
            title = "Sunrise Vinyasa Yoga",
            modality = "Yoga",
            durationMin = 15,
            summary = "Fluid spinal articulation, hip opening, and nasal cadence breathing.",
            steps = listOf(
                GuidedFlowStep("Child's Pose & Ribcage Breath", 45, "Knees wide, reach fingertips forward, inhale 4s through nose and exhale 6s.", "back"),
                GuidedFlowStep("Cat-Cow Spinal Waves", 45, "Segmentally articulate from tailbone to neck on each breath.", "back"),
                GuidedFlowStep("Downward Facing Dog Pedal", 60, "Press floor away, lengthen spine, gently alternate heel presses.", "hamstrings"),
                GuidedFlowStep("Low Lunge & Crescent Reach", 60, "Squeeze back glute, lift ribcage tall without lumbar overarching.", "quads"),
                GuidedFlowStep("Warrior II to Reverse Warrior", 60, "Front thigh parallel, open hips, reach overhead to lengthen lats.", "glutes")
            )
        ),
        GuidedFlowRoutine(
            id = "flow_stretch_recovery",
            title = "Post-Lift Deep Stretch",
            modality = "Stretching",
            durationMin = 12,
            summary = "Parasympathetic down-regulation and loaded-muscle decompression.",
            steps = listOf(
                GuidedFlowStep("World's Greatest Lunge & T-Spine", 60, "Drop inside elbow toward instep, then rotate chest toward ceiling.", "back"),
                GuidedFlowStep("Doorway / Floor Pec & Delt Opener", 45, "Arm at 90 degrees, gently rotate torso away and breathe slowly.", "chest"),
                GuidedFlowStep("90/90 Hip & Pigeon Hold", 60, "Hinge forward with tall spine over front shin for deep glute stretch.", "glutes"),
                GuidedFlowStep("Supine Hamstring & Calf Floss", 60, "Extend knee smoothly while flexing and pointing ankle.", "hamstrings")
            )
        ),
        GuidedFlowRoutine(
            id = "flow_cardio_metabolic",
            title = "Athletic Cardio Intervals",
            modality = "Cardio",
            durationMin = 16,
            summary = "Crisp aerobic + anaerobic intervals playable anywhere without gym machines.",
            steps = listOf(
                GuidedFlowStep("Brisk March / Jump Rope Warmup", 60, "Light elastic ankle bounce, relaxed shoulders, nasal breathing.", "calves"),
                GuidedFlowStep("High-Knee / Bike Sprint Interval", 30, "Drive arms and knees crisply at 85% effort.", "quads"),
                GuidedFlowStep("Active Walking Recovery", 45, "Slow heart rate down with deep belly inhales and long exhales.", "quads"),
                GuidedFlowStep("Mountain Climber / Burpee Pace", 40, "Brace abs tight, smooth athletic rhythm.", "abs")
            )
        )
    )

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
        LibraryExercise("lib_reverse_ez_curl", "Reverse-Grip EZ Bar Curl", "ARMS", "forearms", "biceps", "EZ Bar",
            "Pronated-grip elbow flexion directly building the outer brachioradialis and forearm extensors.",
            "Take an overhand shoulder-width grip on an EZ bar with elbows pinned to your ribs.\nCurl smoothly to shoulder height while keeping wrists straight and strong.\nLower over 2–3 seconds to full elbow extension.",
            "10–15", 60, 22.5, "https://www.youtube.com/results?search_query=Reverse+EZ+Bar+Curl+Forearms"),
        LibraryExercise("lib_hammer_curl", "Dumbbell Hammer Curl", "ARMS", "forearms", "biceps", "Dumbbell",
            "Neutral-palm curl targeting the thick brachioradialis muscle on top of the forearm alongside the brachialis.",
            "Hold dumbbells with palms facing each other (thumbs up) at full arm extension.\nCurl up without swinging shoulders or torso.\nSqueeze 1 second at the top and lower slowly.",
            "10–14", 60, 14.0, "https://www.youtube.com/results?search_query=Dumbbell+Hammer+Curl+Technique"),
        LibraryExercise("lib_behind_back_wrist_curl", "Behind-the-Back Barbell Wrist Curl", "ARMS", "forearms", "", "Barbell",
            "Standing finger-to-palm wrist curl overloading deep forearm belly flexors with zero elbow strain.",
            "Stand tall holding a barbell behind your glutes with palms facing backward.\nLet the bar roll securely down to your fingertips, then curl knuckles upward.\nHold peak forearm contraction for 1 full second.",
            "12–20", 60, 35.0, "https://www.youtube.com/results?search_query=Behind+The+Back+Barbell+Wrist+Curl"),
        LibraryExercise("lib_reverse_wrist_curl", "Dumbbell Reverse Wrist Curl", "ARMS", "forearms", "", "Dumbbell",
            "Essential wrist extensor isolation for balanced forearm size and healthy, pain-free elbows.",
            "Rest forearms flat on a bench with palms facing down over the edge.\nRaise knuckles toward the ceiling through full pain-free range.\nLower slowly for 2 seconds on every rep.",
            "15–20", 45, 7.0, "https://www.youtube.com/results?search_query=Dumbbell+Reverse+Wrist+Curl"),
        LibraryExercise("lib_farmers_carry", "Heavy Dumbbell Farmer's Carry", "ARMS", "forearms", "traps,abs", "Dumbbell",
            "Loaded walking carry building crushing grip endurance, upper traps, and rock-solid trunk stability.",
            "Pick up heavy dumbbells with a tall chest and shoulders pulled slightly back.\nWalk briskly with controlled short steps for 30–45 meters without letting weights tilt.\nSet weights down safely with a hip hinge.",
            "40m walk", 75, 28.0, "https://www.youtube.com/results?search_query=Dumbbell+Farmers+Walk+Grip"),
        LibraryExercise("lib_dead_hang_hold", "Dead Hang Grip Hold", "ARMS", "forearms", "back", "Bodyweight",
            "Timed overhead bar hang building iron finger-flexor endurance while gently decompressing the shoulders and spine.",
            "Wrap thumbs securely around a pullup bar with full-hand grip.\nHang with ribs stacked and gentle shoulder engagement for 30–60 seconds.\nStep down smoothly between sets.",
            "45s hold", 60, 0.0, "https://www.youtube.com/results?search_query=Dead+Hang+Grip+Strength"),
        LibraryExercise("lib_wrist_roller_pinch", "Wrist Roller & Plate Pinch Hold", "ARMS", "forearms", "", "Other",
            "Thumb pinch and continuous wrist-rolling finisher creating maximum forearm pump.",
            "Pinch two smooth weight plates together with fingers and thumb (or wind a wrist roller up and down).\nKeep shoulders relaxed and wrists controlled throughout the 45-second effort.",
            "45s roll", 60, 10.0, "https://www.youtube.com/results?search_query=Wrist+Roller+Plate+Pinch+Forearms"),

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
            "12–15", 60, 140.0, "https://www.youtube.com/results?search_query=Leg+Press+Calf+Raise"),

        // Offline Yoga, Stretching & Cardio Seed Exercises
        LibraryExercise("lib_yoga_sun_salutation", "Sun Salutation Vinyasa Flow", "BACK", "back", "hamstrings,front_delts,abs", "Yoga",
            "Breath-synchronized full-body yoga sequence linking overhead reach, forward fold, plank, cobra, and downward dog.",
            "Inhale arms overhead in tall mountain posture.\nExhale hinge into forward fold, then step back to rigid plank.\nLower under control, inhale into cobra thoracic extension, and exhale hips high to downward dog.",
            "60s flow", 30, 0.0, "https://www.youtube.com/results?search_query=Sun+Salutation+A+Yoga+Flow"),
        LibraryExercise("lib_yoga_down_dog_cobra", "Downward Dog to Cobra", "LEGS", "hamstrings", "back,calves,front_delts", "Yoga",
            "Dynamic posterior-chain lengthening paired with gentle prone spinal extension.",
            "Press palms firmly and send sit-bones high to lengthen hamstrings and calves.\nRipple forward through plank and lower hips toward mat while lifting chest into cobra.\nBreathe slowly through the nose for 45–60 seconds.",
            "45–60s", 25, 0.0, "https://www.youtube.com/results?search_query=Downward+Dog+to+Cobra+Flow"),
        LibraryExercise("lib_yoga_warrior_flow", "Warrior II & Reverse Warrior", "LEGS", "quads", "glutes,abs,back", "Yoga",
            "Isometric lower-body endurance posture combined with lateral ribcage and lat opening.",
            "Take a wide stance with front knee stacked over ankle and arms extended at shoulder height.\nFlip front palm and arc overhead into Reverse Warrior while maintaining deep front-knee bend.\nHold 30–45 seconds per side.",
            "45s/side", 25, 0.0, "https://www.youtube.com/results?search_query=Warrior+2+Reverse+Warrior+Yoga"),
        LibraryExercise("lib_stretch_worlds_greatest", "World's Greatest Lunge & Thoracic Opener", "BACK", "back", "glutes,hamstrings,quads", "Stretching",
            "Complete athletic mobility drill opening hip flexors, adductors, hamstrings, and thoracic spine in one sequence.",
            "Step into a long forward lunge with back knee extended.\nLower inside elbow toward front instep, pause 2 seconds, then rotate arm skyward following your hand with your eyes.\nShift hips back briefly to lengthen front hamstring before switching sides.",
            "5/side", 30, 0.0, "https://www.youtube.com/results?search_query=Worlds+Greatest+Stretch+Mobility"),
        LibraryExercise("lib_stretch_pigeon_9090", "90/90 Hip & Pigeon Stretch", "LEGS", "glutes", "hamstrings,back", "Stretching",
            "Deep external-rotation hip capsule and glute decompression ideal after squats, deadlifts, or desk work.",
            "Set front leg at 90 degrees in front of torso and back leg at 90 degrees or extended behind.\nKeep spine long and hinge forward from the hips until a deep glute stretch is felt.\nRelax jaw and exhale slowly for 60 seconds per side.",
            "60s/side", 20, 0.0, "https://www.youtube.com/results?search_query=90+90+Hip+Stretch+Mobility"),
        LibraryExercise("lib_cardio_zone2_incline", "Zone 2 Incline Walk / Bike", "LEGS", "quads", "glutes,calves", "Cardio",
            "Low-fatigue aerobic base conditioning improving mitochondrial density and between-set recovery.",
            "Set treadmill to 6–10% incline at 4.8–5.8 km/h (or stationary bike at conversational nasal-breathing pace).\nMaintain steady heart rate at ~65–72% max HR without gripping handrails.",
            "10–20 min", 45, 0.0, "https://www.youtube.com/results?search_query=Zone+2+Cardio+Incline+Treadmill"),
        LibraryExercise("lib_cardio_hiit_sprint", "Tabata Assault Bike / Rowing Sprint", "LEGS", "quads", "back,hamstrings,abs", "Cardio",
            "High-output anaerobic intervals boosting VO2 max and work capacity in minimal time.",
            "Warm up 3 minutes easy.\nDrive 20–30 seconds at crisp 85–90% effort, followed by 40–60 seconds easy recovery spin/row.\nRepeat for 6–8 rounds.",
            "30s sprint", 60, 0.0, "https://www.youtube.com/results?search_query=Assault+Bike+HIIT+Intervals"),
        LibraryExercise("lib_cardio_jump_rope", "Jump Rope Conditioning", "LEGS", "calves", "forearms,abs,front_delts", "Cardio",
            "Elastic plyometric footwork building calf resilience, coordination, and steady energy expenditure.",
            "Keep elbows tucked near ribs and turn rope from the wrists.\nBounce 1–2 cm off balls of feet with soft knees for 60-second rounds.",
            "60s", 45, 0.0, "https://www.youtube.com/results?search_query=Jump+Rope+Cardio+Form")
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
            MealLog("seed_meal_prev1", today.minusDays(1).toString(), "Dinner", "Lean Beef 93/7, Sweet Potato & Yogurt", 980, 76, 108, 24, now - 86400000L)
        )
    }

    fun defaultSavedCustomMeals(): List<SavedCustomMeal> = listOf(
        SavedCustomMeal("scm_1", "Whey Oats & Banana Bowl", "Breakfast", 640, 52, 86, 10, "Whey Isolate 32g, Oats 60g, Banana 120g"),
        SavedCustomMeal("scm_2", "Chicken & Jasmine Rice", "Post-Workout", 590, 48, 84, 6, "Chicken Breast 150g, Jasmine Rice 250g, Honey 15g"),
        SavedCustomMeal("scm_3", "Lean Beef & Sweet Potato", "Dinner", 720, 54, 78, 20, "Lean Beef 180g, Sweet Potato 250g, Olive Oil 7g"),
        SavedCustomMeal("scm_4", "0% Greek Yogurt & Berries", "Snack", 315, 32, 28, 8, "Greek Yogurt 250g, Berries 100g, Almonds 14g"),
        SavedCustomMeal("scm_ind_1", "Paneer Bhurji & 2 Phulkas", "Dinner", 545, 36, 44, 18, "Low-Fat Paneer 150g, 2 Whole Wheat Phulkas, Onion-Tomato Masala"),
        SavedCustomMeal("scm_ind_2", "High-Protein Soya Pulao & Dahi", "Post-Workout", 560, 41, 76, 8, "Soya Chunks 55g dry, Basmati Rice 150g, Low-Fat Dahi 150g"),
        SavedCustomMeal("scm_ind_3", "Tandoori Chicken Tikka & Dal Bowl", "Dinner", 595, 54, 52, 12, "Chicken Breast Tikka 160g, Moong Dal 180g, Salad"),
        SavedCustomMeal("scm_ind_4", "Moong Dal Paneer Chilla (2 pcs)", "Breakfast", 430, 31, 42, 12, "Green Moong Batter 120g, Grated Paneer 60g, Mint Chutney")
    )

    fun breathingAudioTracks(): List<BreathingAudioTrackInfo> = listOf(
        BreathingAudioTrackInfo("tibetan_bowl", "Tibetan Singing Bowl", "Warm 432Hz harmonic overtones synced to inhale & exhale", 216.0),
        BreathingAudioTrackInfo("ocean_breeze", "Ocean Tide Breeze", "Filtered coastal surf swell with gentle harmonic drone", 174.0),
        BreathingAudioTrackInfo("rain_pad", "Evening Rain & Pad", "Soft rain shimmer layered over 528Hz Solfeggio chord", 264.0),
        BreathingAudioTrackInfo("soft_chime", "Minimalist Breath Bell", "Quiet meditation bell cues at every phase transition", 396.0)
    )

    fun indianRecipes(): List<IndianRecipe> = listOf(
        IndianRecipe(
            id = "rec_paneer_bhurji_roti",
            name = "High-Protein Low-Fat Paneer Bhurji & Phulka",
            region = "North Indian",
            dietaryTag = "High-Protein Veg",
            mealType = "Dinner",
            prepMinutes = 8,
            cookMinutes = 10,
            calories = 545,
            proteinG = 36,
            carbsG = 44,
            fatG = 18,
            summary = "Scrambled low-fat paneer tossed with ginger, green chillies, tomatoes, and kasuri methi alongside 2 whole-wheat phulkas.",
            ingredients = listOf(
                "150g low-fat paneer, crumbled",
                "2 whole-wheat phulkas (70g)",
                "1 medium onion + 1 ripe tomato, finely chopped",
                "1 tsp cumin, 1/2 tsp turmeric, 1 tsp garam masala, kasuri methi",
                "1 tsp cow ghee + fresh coriander"
            ),
            steps = listOf(
                "Warm 1 tsp ghee in a non-stick pan and crackle cumin seeds with finely chopped ginger and green chilli.",
                "Saute chopped onion for 3 minutes until translucent, then add tomatoes and dry spices until soft.",
                "Fold in crumbled low-fat paneer and 2 tbsp water; cook gently for 3 minutes so paneer stays juicy.",
                "Finish with crushed kasuri methi and coriander. Serve hot with 2 whole-wheat phulkas."
            )
        ),
        IndianRecipe(
            id = "rec_soya_matar_pulao",
            name = "Soya Chunk & Green Pea Masala Pulao",
            region = "Pan-Indian",
            dietaryTag = "Vegan",
            mealType = "Post-Workout",
            prepMinutes = 10,
            cookMinutes = 15,
            calories = 530,
            proteinG = 38,
            carbsG = 78,
            fatG = 6,
            summary = "One-pot post-workout glycogen + plant-protein powerhouse with 38g complete protein.",
            ingredients = listOf(
                "55g dry soya chunks (boiled & squeezed)",
                "65g dry aged basmati rice, soaked 15 min",
                "50g green peas + 1 sliced onion",
                "Whole spices (bay leaf, 2 cloves, 1/2 tsp jeera) + 1 tsp biryani masala",
                "1 tsp cold-pressed oil + lemon wedge"
            ),
            steps = listOf(
                "Boil soya chunks in salted water for 5 minutes, rinse in cool water, and squeeze dry.",
                "Saute whole spices and sliced onions in 1 tsp oil inside a pressure cooker or pot.",
                "Toss in soya chunks, green peas, drained basmati rice, biryani masala, and 140ml water.",
                "Cook covered on low for 12 minutes (or 1 whistle). Fluff with a fork and squeeze fresh lemon."
            )
        ),
        IndianRecipe(
            id = "rec_moong_paneer_chilla",
            name = "Stuffed Green Moong Dal & Paneer Chilla",
            region = "North Indian",
            dietaryTag = "High-Protein Veg",
            mealType = "Breakfast",
            prepMinutes = 10,
            cookMinutes = 10,
            calories = 435,
            proteinG = 32,
            carbsG = 42,
            fatG = 12,
            summary = "Crispy savory sprouted/soaked moong crepes stuffed with spiced grated paneer and mint chutney.",
            ingredients = listOf(
                "80g soaked green/yellow moong dal",
                "65g grated low-fat paneer + chopped coriander",
                "1 inch ginger, 1 green chilli, 1/2 tsp ajwain",
                "1 tsp oil for roasting + 2 tbsp pudina dahi chutney"
            ),
            steps = listOf(
                "Blend soaked moong dal with ginger, green chilli, salt, and minimal water into a smooth pourable batter.",
                "Spread two thin ladles on a hot cast-iron tawa and brush lightly with 1/2 tsp oil.",
                "Top center with spiced grated paneer, onions, and coriander; fold in half once golden crisp.",
                "Serve immediately with fresh mint-coriander curd chutney."
            )
        ),
        IndianRecipe(
            id = "rec_tandoori_tikka_dal",
            name = "Air-Fried Tandoori Chicken Tikka & Dal Tadka Bowl",
            region = "Punjabi",
            dietaryTag = "Non-Vegetarian",
            mealType = "Dinner",
            prepMinutes = 15,
            cookMinutes = 14,
            calories = 595,
            proteinG = 55,
            carbsG = 50,
            fatG = 12,
            summary = "Charred hung-curd marinated chicken breast cubes paired with comforting yellow moong dal and kachumber salad.",
            ingredients = listOf(
                "170g raw chicken breast cubed",
                "50g thick hung curd + 1 tsp tandoori masala + lemon + ginger-garlic paste",
                "180g cooked yellow moong dal tadka",
                "100g cucumber-tomato-onion kachumber salad"
            ),
            steps = listOf(
                "Coat chicken cubes in hung curd, ginger-garlic paste, Kashmiri chilli, tandoori masala, and lemon juice for 15 minutes.",
                "Roast on a hot grill pan or air-fryer at 200C for 11-12 minutes until lightly charred and tender.",
                "Ladle warm yellow moong dal tadka into a bowl, top with chicken tikka, and serve with crunchy kachumber."
            )
        ),
        IndianRecipe(
            id = "rec_masala_egg_bhurji_toast",
            name = "Mumbai Style Egg Bhurji & Multigrain Roti",
            region = "West Indian",
            dietaryTag = "Eggetarian",
            mealType = "Breakfast",
            prepMinutes = 6,
            cookMinutes = 8,
            calories = 485,
            proteinG = 31,
            carbsG = 38,
            fatG = 19,
            summary = "Street-style spiced scrambled eggs boosted with extra egg whites for lean morning hypertrophy macros.",
            ingredients = listOf(
                "2 whole eggs + 3 liquid egg whites",
                "2 whole-wheat or multigrain rotis (70g)",
                "1 finely chopped onion, 1 tomato, 1/2 capsicum",
                "1/2 tsp pav bhaji masala + turmeric + fresh coriander",
                "1 tsp butter or ghee"
            ),
            steps = listOf(
                "Whisk 2 whole eggs and 3 egg whites with a pinch of salt and turmeric.",
                "Saute onion, capsicum, and tomato in 1 tsp ghee with pav bhaji masala until glossy.",
                "Pour beaten eggs over medium-low heat, stirring gently for soft curds; top with coriander and pair with warm rotis."
            )
        ),
        IndianRecipe(
            id = "rec_sprouted_kala_chana_salad",
            name = "Kala Chana, Tofu & Pomegranate Power Chaat",
            region = "Pan-Indian",
            dietaryTag = "Vegan",
            mealType = "Snack",
            prepMinutes = 10,
            cookMinutes = 0,
            calories = 375,
            proteinG = 24,
            carbsG = 46,
            fatG = 9,
            summary = "Zero-oil tangy pre-workout or evening chaat combining boiled black chickpeas, seared tofu, and chaat masala.",
            ingredients = listOf(
                "130g boiled kala chana (black chickpeas)",
                "80g firm tofu cubes, lightly pan-toasted",
                "1/2 cucumber, 1 tomato, 2 tbsp pomegranate arils",
                "1 tsp roasted jeera powder, chaat masala, black salt & lime juice"
            ),
            steps = listOf(
                "Toss warm boiled kala chana and golden pan-seared tofu cubes in a mixing bowl.",
                "Add diced cucumber, tomato, green chilli, and fresh pomegranate.",
                "Season generously with roasted cumin, chaat masala, and fresh lime juice; toss and eat fresh."
            )
        ),
        IndianRecipe(
            id = "rec_ragi_dosa_sambar",
            name = "Crispy Fermented Ragi Dosa & Drumstick Sambar",
            region = "South Indian",
            dietaryTag = "Vegetarian",
            mealType = "Breakfast",
            prepMinutes = 8,
            cookMinutes = 12,
            calories = 460,
            proteinG = 21,
            carbsG = 68,
            fatG = 9,
            summary = "Calcium- and iron-rich finger-millet dosas paired with protein-packed toor dal vegetable sambar.",
            ingredients = listOf(
                "2 ragi + urad dal dosas (180g batter)",
                "220ml thick toor dal vegetable sambar",
                "40g roasted chana dal & coconut chutney",
                "1 tsp sesame/gingelly oil"
            ),
            steps = listOf(
                "Pour fermented ragi-urad batter in thin concentric circles on a seasoned cast-iron tawa.",
                "Drizzle 1/2 tsp gingelly oil and roast until crisp at the edges.",
                "Serve hot alongside piping-hot toor dal sambar and roasted chana chutney."
            )
        ),
        IndianRecipe(
            id = "rec_palak_paneer_quinoa",
            name = "Homestyle Lehsuni Palak Paneer & Steamed Rice",
            region = "North Indian",
            dietaryTag = "Vegetarian",
            mealType = "Dinner",
            prepMinutes = 12,
            cookMinutes = 15,
            calories = 560,
            proteinG = 33,
            carbsG = 52,
            fatG = 21,
            summary = "Iron-rich blanched spinach puree tempered with roasted garlic and folded with soft paneer cubes.",
            ingredients = listOf(
                "130g low-fat paneer cubes",
                "200g fresh spinach (blanched & pureed)",
                "140g cooked basmati or brown rice",
                "4 cloves minced garlic, jeera, garam masala, 1 tsp ghee"
            ),
            steps = listOf(
                "Blanch washed spinach leaves for 2 minutes in boiling water, plunge into ice water, and blend smooth.",
                "Temper cumin and golden minced garlic in 1 tsp ghee; stir in onion-tomato masala.",
                "Simmer spinach puree for 4 minutes with paneer cubes so flavors infuse; serve with steamed rice."
            )
        ),
        IndianRecipe(
            id = "rec_dahi_oats_poha",
            name = "High-Protein Curd Poha & Roasted Peanuts",
            region = "Central / West Indian",
            dietaryTag = "Vegetarian",
            mealType = "Pre-Workout",
            prepMinutes = 8,
            cookMinutes = 6,
            calories = 445,
            proteinG = 20,
            carbsG = 62,
            fatG = 11,
            summary = "Easy-digesting flattened rice tempered with curry leaves and mustard seeds, paired with thick curd.",
            ingredients = listOf(
                "60g thick poha (rinsed & drained)",
                "150g low-fat dahi (curd) on the side",
                "15g roasted peanuts + curry leaves + mustard seeds + turmeric",
                "1 tsp oil + fresh lemon"
            ),
            steps = listOf(
                "Rinse thick poha gently in a colander so grains soften without turning mushy.",
                "Pop mustard seeds, curry leaves, green chilli, and peanuts in 1 tsp oil with turmeric.",
                "Fold in poha, steam covered for 2 minutes, finish with lemon juice, and pair with chilled dahi."
            )
        ),
        IndianRecipe(
            id = "rec_malabar_fish_curry_rice",
            name = "Light Kerala Fish Molee / Curry & Red Rice",
            region = "South Indian",
            dietaryTag = "Non-Vegetarian",
            mealType = 15.let { "Dinner" },
            prepMinutes = 10,
            cookMinutes = 14,
            calories = 540,
            proteinG = 42,
            carbsG = 56,
            fatG = 14,
            summary = "Omega-3 rich seer/white fish poached gently in spiced light coconut-tomato broth with steamed rice.",
            ingredients = listOf(
                "160g firm white fish / surmai fillets",
                "150g cooked matta or basmati rice",
                "60ml light coconut milk, curry leaves, kokum/tamarind, ginger",
                "1 tsp coconut oil + black pepper & turmeric"
            ),
            steps = listOf(
                "Saute shallots, julienned ginger, green chillies, and curry leaves in 1 tsp coconut oil.",
                "Add turmeric, coriander powder, kokum/tomato, and 100ml water; bring to a gentle simmer.",
                "Slide in fish fillets, poach covered 6 minutes, swirl in light coconut milk, and serve over warm rice."
            )
        ),
        IndianRecipe(
            id = "rec_rajma_chawal_bowl",
            name = "Punjabi Homestyle Rajma Chawal & Kachumber",
            region = "North Indian",
            dietaryTag = "Vegan",
            mealType = "Post-Workout",
            prepMinutes = 10,
            cookMinutes = 20,
            calories = 550,
            proteinG = 21,
            carbsG = 94,
            fatG = 8,
            summary = "Complete amino-acid pairing of slow-simmered red kidney beans and aged basmati rice.",
            ingredients = listOf(
                "220g cooked rajma masala (minimal oil)",
                "150g steamed basmati rice",
                "Onion, ginger-garlic, tomato puree, amchur & garam masala",
                "Fresh cucumber-onion lemon salad"
            ),
            steps = listOf(
                "Pressure-cook overnight-soaked rajma until buttery soft when pressed.",
                "Simmer onion-ginger-garlic and tomato masala with coriander, cumin, and Kashmiri chilli.",
                "Combine boiled rajma with the masala, mash a few beans for thick gravy, simmer 8 minutes, and serve over rice."
            )
        ),
        IndianRecipe(
            id = "rec_sattu_whey_cooler",
            name = "Roasted Chana Sattu & Buttermilk Recovery Drink",
            region = "East Indian (Bihar/UP)",
            dietaryTag = "High-Protein Veg",
            mealType = "Snack",
            prepMinutes = 4,
            cookMinutes = 0,
            calories = 285,
            proteinG = 24,
            carbsG = 34,
            fatG = 5,
            summary = "Cooling 4-minute savory summer drink combining roasted gram flour (sattu) and spiced chaas.",
            ingredients = listOf(
                "45g roasted chana sattu flour",
                "250ml chilled spiced chaas / buttermilk (or 1/2 scoop unflavored whey)",
                "1/2 tsp roasted cumin, black salt, chopped mint & lemon juice"
            ),
            steps = listOf(
                "Whisk sattu flour with 60ml water first into a lump-free paste.",
                "Top up with chilled chaas, roasted jeera, kala namak, finely chopped mint, and squeeze of lemon.",
                "Stir briskly and drink chilled post-training or mid-afternoon."
            )
        ),
        IndianRecipe(
            id = "rec_chicken_keema_roti",
            name = "Lean Chicken Breast Keema Matar & 2 Phulkas",
            region = "North Indian",
            dietaryTag = "Non-Vegetarian",
            mealType = "Dinner",
            prepMinutes = 10,
            cookMinutes = 15,
            calories = 565,
            proteinG = 51,
            carbsG = 48,
            fatG = 13,
            summary = "Spiced minced lean chicken breast simmered with sweet green peas and ginger juliennes.",
            ingredients = listOf(
                "165g lean minced chicken breast",
                "50g green peas + 1 chopped onion & tomato",
                "2 whole-wheat phulkas (70g)",
                "1 tsp ginger-garlic paste, garam masala & 1 tsp ghee"
            ),
            steps = listOf(
                "Brown onion and ginger-garlic paste in 1 tsp ghee until fragrant.",
                "Add tomatoes, turmeric, coriander powder, and minced chicken; stir-fry 5 minutes.",
                "Toss in green peas and 60ml water, cover 8 minutes on low, and serve with warm phulkas."
            )
        ),
        IndianRecipe(
            id = "rec_punjabi_chole_rice",
            name = "Low-Oil Amritsari Chole & Jeera Brown Rice",
            region = "Punjabi",
            dietaryTag = "Vegan",
            mealType = "Post-Workout",
            prepMinutes = 10,
            cookMinutes = 18,
            calories = 540,
            proteinG = 22,
            carbsG = 89,
            fatG = 9,
            summary = "Slow-cooked chickpeas infused with roasted anardana and chana masala over nutty brown rice.",
            ingredients = listOf(
                "200g boiled white kabuli chana",
                "150g cooked jeera brown rice",
                "Onion-tomato masala + 1.5 tsp Amritsari chole masala",
                "1 tsp mustard/olive oil + ginger & lemon"
            ),
            steps = listOf(
                "Saute onion-ginger-tomato masala in 1 tsp oil with chole spices.",
                "Add boiled chickpeas and simmer 10 minutes, lightly mashing 2 tbsp chickpeas for rich gravy.",
                "Garnish with fresh coriander and lemon; serve with jeera brown rice."
            )
        ),
        IndianRecipe(
            id = "rec_tofu_tikka_kathi_roll",
            name = "Tandoori Spiced Tofu Tikka Whole-Wheat Kathi Roll",
            region = "East Indian (Kolkata)",
            dietaryTag = "Vegan",
            mealType = "Lunch",
            prepMinutes = 10,
            cookMinutes = 10,
            calories = 470,
            proteinG = 30,
            carbsG = 46,
            fatG = 16,
            summary = "Smoky pan-charred extra-firm tofu strips wrapped in whole-wheat roti with mint chutney.",
            ingredients = listOf(
                "160g extra-firm tofu strips",
                "1 large whole-wheat chapati wrap (65g)",
                "Sliced bell peppers, red onion & mint-coriander chutney",
                "1 tsp tandoori masala + lemon juice"
            ),
            steps = listOf(
                "Toss tofu strips and bell peppers with tandoori spices and lemon.",
                "Sear on high heat for 6 minutes until lightly charred.",
                "Spread mint chutney over warm whole-wheat roti, pile in tofu tikka and pickled onions, and roll tight."
            )
        ),
        IndianRecipe(
            id = "rec_besan_paneer_toast",
            name = "Savory Besan & Grated Paneer Masala Chilla",
            region = "West Indian",
            dietaryTag = "High-Protein Veg",
            mealType = "Breakfast",
            prepMinutes = 7,
            cookMinutes = 9,
            calories = 420,
            proteinG = 29,
            carbsG = 38,
            fatG = 15,
            summary = "Quick 15-minute chickpea-flour savory pancakes loaded with grated low-fat paneer and veggies.",
            ingredients = listOf(
                "60g besan (gram flour) + pinch of ajwain & turmeric",
                "75g grated low-fat paneer",
                "Finely diced spinach, onion, tomato & green chilli",
                "1 tsp ghee for roasting"
            ),
            steps = listOf(
                "Whisk besan with water, ajwain, turmeric, and chopped veggies into a lump-free batter.",
                "Pour onto a hot tawa, scatter grated paneer across the top, and cook both sides until golden.",
                "Serve hot with green chutney or plain curd."
            )
        ),
        IndianRecipe(
            id = "rec_makhana_chana_bhel",
            name = "Crunchy Roasted Makhana & Bhuna Chana Gym Bhel",
            region = "Pan-Indian",
            dietaryTag = "Vegetarian",
            mealType = "Snack",
            prepMinutes = 5,
            cookMinutes = 4,
            calories = 310,
            proteinG = 15,
            carbsG = 48,
            fatG = 6,
            summary = "Crunchy 5-minute pre-workout snack mixing fox nuts, roasted gram, diced mango/tomato, and lime.",
            ingredients = listOf(
                "30g dry-roasted makhana (fox nuts)",
                "45g crunchy bhuna chana (roasted chickpeas)",
                "Chopped onion, tomato, cucumber & coriander",
                "Chaat masala, roasted jeera & lime juice"
            ),
            steps = listOf(
                "Dry-roast makhana in a pan for 4 minutes with a pinch of turmeric until crisp.",
                "Toss immediately with bhuna chana, finely chopped salad veggies, chaat masala, and fresh lime."
            )
        ),
        IndianRecipe(
            id = "rec_kesar_elaichi_whey_oats",
            name = "Kesar-Elaichi Rabri Style High-Protein Whey Oats",
            region = "North Indian",
            dietaryTag = "High-Protein Veg",
            mealType = "Breakfast",
            prepMinutes = 4,
            cookMinutes = 6,
            calories = 490,
            proteinG = 37,
            carbsG = 58,
            fatG = 11,
            summary = "Creamy cardamom-and-saffron porridge that tastes like festive kheer while delivering 37g protein.",
            ingredients = listOf(
                "55g rolled oats + 200ml toned milk/water",
                "1 scoop (32g) vanilla or unflavored whey isolate",
                "Pinch of saffron strands, 1/4 tsp green cardamom powder",
                "10g slivered almonds & pistachios"
            ),
            steps = listOf(
                "Simmer rolled oats with milk/water, saffron strands, and crushed cardamom for 5 minutes until creamy.",
                "Take off the heat, cool 1 minute, then stir in whey protein isolate so it stays silky smooth.",
                "Top with slivered almonds and pistachios."
            ),
            dietaryTags = listOf("Vegetarian", "High-Protein Veg")
        ),
        IndianRecipe(
            id = "ifc_paneer_tikka_bowl",
            name = "Chargrilled Low-Fat Paneer Tikka & Mint Quinoa Bowl",
            region = "North Indian",
            dietaryTag = "High-Protein Veg",
            mealType = "Post-Workout",
            prepMinutes = 12,
            cookMinutes = 14,
            calories = 445,
            proteinG = 37,
            carbsG = 38,
            fatG = 15,
            summary = "Smoky hung-curd marinated low-fat paneer cubes roasted with capsicum and red onion over fluffy cumin quinoa.",
            ingredients = listOf(
                "160g low-fat paneer, cubed",
                "60g hung curd (thickened Greek-style dahi)",
                "100g cooked quinoa or brown basmati rice",
                "80g diced bell peppers & red onion",
                "1 tsp Kashmiri chilli, roasted jeera, chaat masala & lemon juice"
            ),
            steps = listOf(
                "Whisk hung curd, Kashmiri chilli, roasted cumin, turmeric, salt, and 1 tsp mustard oil into a thick marinade.",
                "Coat paneer cubes, onion petals, and bell peppers; marinate 10 minutes.",
                "Sear on a hot cast-iron tawa or air-fry at 200C for 10-12 minutes until charred at the edges.",
                "Serve warm over steamed quinoa with fresh mint-coriander chutney."
            ),
            dietaryTags = listOf("Vegetarian", "High-Protein Veg")
        ),
        IndianRecipe(
            id = "ifc_soya_keema_phulka",
            name = "Dhaba Soya Granule Keema Matar with 2 Whole-Wheat Phulkas",
            region = "Punjabi / North Indian",
            dietaryTag = "Vegan",
            mealType = "Dinner",
            prepMinutes = 10,
            cookMinutes = 18,
            calories = 465,
            proteinG = 39,
            carbsG = 58,
            fatG = 8,
            summary = "Ultra-lean plant-protein soya keema simmered with green peas, tomato-onion bhuna masala, and whole-wheat rotis.",
            ingredients = listOf(
                "55g dry soya granules (boiled & squeezed thoroughly)",
                "60g green peas (matar)",
                "1 medium onion & 2 ripe tomatoes, finely chopped",
                "1 tsp ginger-garlic paste, garam masala & kasuri methi",
                "2 whole-wheat phulka rotis (no ghee)"
            ),
            steps = listOf(
                "Boil soya granules in salted water for 5 minutes, rinse in cold water, and squeeze dry.",
                "Saute onion and ginger-garlic paste in 1 tsp oil until golden; add tomatoes and spices.",
                "Fold in soya granules and green peas with 100ml water; simmer 8 minutes and finish with crushed kasuri methi.",
                "Serve hot alongside 2 flame-puffed whole-wheat phulkas."
            ),
            dietaryTags = listOf("Vegan", "Vegetarian", "High-Protein Veg")
        ),
        IndianRecipe(
            id = "ifc_tandoori_chicken_raita",
            name = "Tandoori Chicken Breast Fillet & Cucumber Jeera Raita",
            region = "Punjabi / Mughlai",
            dietaryTag = "Non-Vegetarian",
            mealType = "Post-Workout",
            prepMinutes = 15,
            cookMinutes = 16,
            calories = 385,
            proteinG = 54,
            carbsG = 9,
            fatG = 13,
            summary = "High-protein lean chicken breast marinated in spiced curd and lemon, served with cooling roasted-cumin cucumber raita.",
            ingredients = listOf(
                "200g skinless chicken breast, scored",
                "50g low-fat curd for marinade + 100g curd for raita",
                "1 tsp ginger-garlic paste, tandoori masala & Kashmiri mirch",
                "60g grated cucumber & fresh mint leaves",
                "1 tsp lemon juice & 1 tsp mustard oil"
            ),
            steps = listOf(
                "Rub chicken breast with lemon juice, salt, ginger-garlic paste, spiced curd, and mustard oil.",
                "Grill, bake, or air-fry at 205C for 14-16 minutes until juicy.",
                "Whisk chilled curd with grated cucumber, roasted cumin powder, and mint to serve alongside."
            ),
            dietaryTags = listOf("Non-Vegetarian")
        ),
        IndianRecipe(
            id = "ifc_pesarattu_ginger_chutney",
            name = "Andhra Whole Green Moong Pesarattu & Allam Chutney",
            region = "South Indian / Andhra",
            dietaryTag = "Vegan",
            mealType = "Breakfast",
            prepMinutes = 10,
            cookMinutes = 10,
            calories = 360,
            proteinG = 21,
            carbsG = 52,
            fatG = 7,
            summary = "No-fermentation sprouted whole green gram crepes topped with finely chopped onions, cumin seeds, and tangy ginger-tamarind chutney.",
            ingredients = listOf(
                "90g soaked whole green moong (with skin)",
                "1 tbsp raw rice (for crispness)",
                "1 inch ginger, 1 green chilli & 1/2 tsp jeera",
                "30g finely diced red onion",
                "2 tbsp tangy ginger-tamarind (allam) chutney"
            ),
            steps = listOf(
                "Grind soaked green moong, rice, ginger, and green chilli with minimal water into a coarse dosa batter.",
                "Spread onto a hot skillet, scatter chopped onion and cumin seeds on top, and cook with 1/2 tsp sesame oil until crisp.",
                "Serve immediately with spicy ginger-tamarind chutney."
            ),
            dietaryTags = listOf("Vegan", "Vegetarian", "High-Protein Veg")
        ),
        IndianRecipe(
            id = "ifc_palak_paneer_rotis",
            name = "Iron-Rich Low-Oil Palak Paneer with Jowar Bhakri",
            region = "North & West Indian",
            dietaryTag = "High-Protein Veg",
            mealType = "Dinner",
            prepMinutes = 12,
            cookMinutes = 15,
            calories = 430,
            proteinG = 31,
            carbsG = 39,
            fatG = 16,
            summary = "Blanched emerald spinach puree tempered with garlic and nutmeg, simmered with soft paneer cubes and gluten-free sorghum flatbread.",
            ingredients = listOf(
                "150g low-fat paneer cubes",
                "200g fresh spinach leaves (blanched & pureed)",
                "4 cloves garlic, 1 green chilli & pinch of nutmeg",
                "1 jowar (sorghum) millet bhakri (55g flour)",
                "1 tsp ghee"
            ),
            steps = listOf(
                "Blanch spinach in boiling water for 90 seconds, plunge into ice water, and blend smooth with green chilli.",
                "Saute sliced garlic and cumin in 1 tsp ghee; stir in spinach puree, salt, and a pinch of nutmeg.",
                "Fold in paneer cubes to warm through for 4 minutes and serve with freshly patted jowar bhakri."
            ),
            dietaryTags = listOf("Vegetarian", "High-Protein Veg")
        ),
        IndianRecipe(
            id = "ifc_chicken_chettinad_bowl",
            name = "Pepper Chicken Chettinad Roast & Parboiled Red Rice",
            region = "South Indian / Tamil Nadu",
            dietaryTag = "Non-Vegetarian",
            mealType = "Dinner",
            prepMinutes = 15,
            cookMinutes = 22,
            calories = 510,
            proteinG = 46,
            carbsG = 47,
            fatG = 14,
            summary = "Fragrant freshly ground black peppercorn, fennel, and curry leaf chicken roast paired with mineral-rich South Indian matta rice.",
            ingredients = listOf(
                "180g boneless chicken thigh/breast mix",
                "140g cooked Kerala matta / parboiled rice",
                "1 tbsp freshly toasted black pepper, fennel & coriander seeds",
                "1 sprig fresh curry leaves, shallots & 1 tomato",
                "1.5 tsp cold-pressed sesame (gingelly) oil"
            ),
            steps = listOf(
                "Dry-roast peppercorns, fennel, cumin, and coriander seeds; grind into a coarse aromatic powder.",
                "Saute shallots, curry leaves, and ginger-garlic in sesame oil; add chicken pieces and sear on high heat.",
                "Add chopped tomato and ground Chettinad spice mix; cook covered until tender and serve with parboiled red rice."
            ),
            dietaryTags = listOf("Non-Vegetarian")
        ),
        IndianRecipe(
            id = "ifc_amritsari_grilled_fish",
            name = "Air-Fried Amritsari Ajwain Fish Tikka & Kachumber Salad",
            region = "Punjabi / North Indian",
            dietaryTag = "Non-Vegetarian",
            mealType = "Dinner",
            prepMinutes = 12,
            cookMinutes = 12,
            calories = 335,
            proteinG = 43,
            carbsG = 12,
            fatG = 12,
            summary = "Flaky white fish fillets coated in a light carom-seed (ajwain) and roasted besan crust, air-fried crisp without deep-frying.",
            ingredients = listOf(
                "200g bhetki, surmai, or tilapia fillet cut into chunks",
                "1.5 tbsp roasted besan (gram flour) & 2 tbsp curd",
                "1/2 tsp crushed ajwain (carom seeds), garlic & lemon juice",
                "150g crunchy cucumber-radish-onion kachumber salad",
                "1 tsp mustard oil"
            ),
            steps = listOf(
                "Whisk roasted besan, curd, crushed ajwain, garlic paste, turmeric, chilli, lemon juice, and mustard oil.",
                "Gently coat fish chunks and rest for 10 minutes.",
                "Air-fry or oven-broil at 200C for 10-12 minutes until golden; serve with lemon wedges and kachumber salad."
            ),
            dietaryTags = listOf("Non-Vegetarian")
        ),
        IndianRecipe(
            id = "ifc_tofu_chana_masala",
            name = "Smoky Tofu & Chickpea Tikka Masala Bowl",
            region = "Modern Indian Fusion",
            dietaryTag = "Vegan",
            mealType = "Post-Workout",
            prepMinutes = 10,
            cookMinutes = 16,
            calories = 440,
            proteinG = 28,
            carbsG = 49,
            fatG = 14,
            summary = "Dairy-free high-protein curry combining firm soy tofu cubes and tender kabuli chana in a cashew-tomato masala.",
            ingredients = listOf(
                "140g extra-firm tofu, pressed and pan-seared",
                "90g cooked chickpeas (kabuli chana)",
                "2 ripe tomatoes, 1 onion & 4 soaked cashews blended smooth",
                "1 tsp Kashmiri mirch, garam masala & kasuri methi",
                "1 whole-wheat phulka roti"
            ),
            steps = listOf(
                "Pan-sear cubed firm tofu on a dry non-stick skillet until lightly browned.",
                "Simmer onion-tomato-cashew puree with Kashmiri chilli, coriander powder, and garam masala for 8 minutes.",
                "Add chickpeas and seared tofu with a splash of water; simmer 5 minutes, crush kasuri methi on top, and serve with 1 roti."
            ),
            dietaryTags = listOf("Vegan", "Vegetarian", "High-Protein Veg")
        ),
        IndianRecipe(
            id = "ifc_curd_rice_probiotic",
            name = "Tempered Probiotic Thayer Sadam (Curd Rice) & Peanuts",
            region = "South Indian",
            dietaryTag = "Vegetarian",
            mealType = "Pre-Workout",
            prepMinutes = 6,
            cookMinutes = 4,
            calories = 340,
            proteinG = 14,
            carbsG = 48,
            fatG = 10,
            summary = "Gut-soothing soft rice whipped with thick probiotic curd, grated carrot, pomegranate, and a crackling mustard-hing tadka.",
            ingredients = listOf(
                "130g soft-cooked rice",
                "140g thick low-fat probiotic curd (dahi)",
                "1 tbsp roasted peanuts & 1/2 tsp urad dal",
                "Mustard seeds, curry leaves, grated ginger & pinch of hing",
                "2 tbsp grated carrot & pomegranate arils"
            ),
            steps = listOf(
                "Mash warm rice lightly and fold in thick curd, salt, and grated ginger.",
                "Crackle mustard seeds, urad dal, roasted peanuts, hing, and curry leaves in 1/2 tsp oil; pour over curd rice.",
                "Top with grated carrot and pomegranate seeds."
            ),
            dietaryTags = listOf("Vegetarian")
        ),
        IndianRecipe(
            id = "ifc_quinoa_dal_khichdi",
            name = "One-Pot Masala Quinoa & Yellow Moong Dal Khichdi",
            region = "Gujarati / Rajasthani",
            dietaryTag = "High-Protein Veg",
            mealType = "Dinner",
            prepMinutes = 8,
            cookMinutes = 18,
            calories = 395,
            proteinG = 20,
            carbsG = 58,
            fatG = 9,
            summary = "Comforting recovery one-pot meal swapping white rice for quinoa alongside split yellow moong dal and seasonal vegetables.",
            ingredients = listOf(
                "50g dry quinoa + 50g yellow split moong dal (washed)",
                "100g mixed diced carrots, French beans & green peas",
                "1/2 tsp cumin seeds, hing, turmeric & crushed black pepper",
                "1.5 tsp A2 cow ghee for tempering"
            ),
            steps = listOf(
                "Temper cumin seeds, hing, ginger, and turmeric in ghee inside a pressure cooker.",
                "Add diced vegetables, washed quinoa, moong dal, salt, and 320ml water.",
                "Pressure cook for 2 whistles until creamy and comforting; garnish with fresh coriander."
            ),
            dietaryTags = listOf("Vegetarian", "High-Protein Veg")
        ),
        IndianRecipe(
            id = "ifc_dal_tadka_jeera_rice",
            name = "Homestyle Yellow Dal Tadka & Steamed Jeera Basmati Bowl",
            region = "Pan-Indian Classic",
            dietaryTag = "Vegan",
            mealType = "Lunch",
            prepMinutes = 10,
            cookMinutes = 18,
            calories = 430,
            proteinG = 19,
            carbsG = 68,
            fatG = 8,
            summary = "Comforting everyday toor & masoor dal tempered with roasted cumin, garlic, and tomatoes alongside fluffy jeera basmati rice.",
            ingredients = listOf(
                "70g dry toor + red masoor dal blend",
                "150g cooked steamed jeera basmati rice",
                "1 medium tomato & 1 small onion, finely chopped",
                "3 cloves garlic, 1/2 tsp jeera, turmeric & fresh coriander",
                "1.5 tsp cold-pressed oil or desi ghee"
            ),
            steps = listOf(
                "Pressure cook washed toor and masoor dal with turmeric, salt, and water until velvety soft.",
                "Sizzle cumin seeds, minced garlic, onion, and tomato in 1.5 tsp oil for the fragrant tadka.",
                "Pour sizzling tadka over the dal, garnish with coriander, and serve beside warm jeera rice."
            ),
            dietaryTags = listOf("Vegan", "Vegetarian")
        ),
        IndianRecipe(
            id = "ifc_masala_egg_bhurji_roti",
            name = "Street-Style 5-Egg Masala Bhurji & 2 Whole-Wheat Phulkas",
            region = "Maharashtrian / Pan-Indian",
            dietaryTag = "Eggetarian",
            mealType = "Lunch",
            prepMinutes = 7,
            cookMinutes = 8,
            calories = 485,
            proteinG = 33,
            carbsG = 44,
            fatG = 19,
            summary = "Fluffy spiced scrambled eggs cooked with finely diced onions, tomatoes, pav bhaji masala, and fresh coriander with warm rotis.",
            ingredients = listOf(
                "3 whole eggs + 2 extra egg whites, whisked",
                "2 whole-wheat phulka rotis",
                "60g finely chopped red onion, tomato & green chilli",
                "1/2 tsp pav bhaji masala, turmeric & fresh coriander",
                "1 tsp butter or olive oil"
            ),
            steps = listOf(
                "Saute finely chopped onion, green chilli, and tomato in 1 tsp butter until glossy.",
                "Stir in turmeric and pav bhaji masala, then pour in whisked eggs on medium-low heat.",
                "Fold gently until soft curds form, top with coriander, and enjoy hot with 2 whole-wheat rotis."
            ),
            dietaryTags = listOf("Eggetarian")
        )
    )
}

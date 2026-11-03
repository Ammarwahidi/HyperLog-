import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Search,
  X,
} from 'lucide-react';
import {
  EquipmentType,
  ExerciseModality,
  LibraryExercise,
  MuscleId,
  MuscleLandmark,
  WorkoutDayPlan,
  WorkoutTemplate,
} from '../types/workout';
import {
  resolveExerciseModality,
  resolveTemplateModality,
} from '../data/allInOneFitnessCatalog';

export interface WorkoutHelpExerciseItem {
  id: string;
  name: string;
  primaryMuscle: MuscleId;
  secondaryMuscles?: MuscleId[];
  sets: number;
  repRange: string;
  restSeconds: number;
  libraryExerciseId?: string;
  isSuperset?: boolean;
}

export interface WorkoutHelpTarget {
  title: string;
  subtitle: string;
  modality: Exclude<ExerciseModality, ExerciseModality.All>;
  targetRirLabel?: string;
  estimatedMinutes?: number;
  isRestDay?: boolean;
  focusExerciseId?: string;
  exercises: WorkoutHelpExerciseItem[];
}

export function buildHelpTargetFromDayPlan(
  day: WorkoutDayPlan,
  activeWeek: number,
  targetRirLabel?: string,
  focusExerciseId?: string
): WorkoutHelpTarget {
  const mapped: WorkoutHelpExerciseItem[] = day.exercises.map((ex) => ({
    id: ex.id,
    name: ex.name,
    primaryMuscle: ex.muscleId,
    secondaryMuscles: [],
    sets: ex.weekSets[activeWeek] ?? 3,
    repRange: ex.repRange,
    restSeconds: ex.restSeconds ?? 90,
    libraryExerciseId: ex.libraryExerciseId,
    isSuperset: ex.isSuperset,
  }));

  const lower = `${day.title} ${day.focusSummary}`.toLowerCase();
  let modality: Exclude<ExerciseModality, ExerciseModality.All> = ExerciseModality.Strength;
  if (lower.includes('yoga') || lower.includes('vinyasa') || lower.includes('yin')) {
    modality = ExerciseModality.Yoga;
  } else if (lower.includes('stretch') || lower.includes('mobility')) {
    modality = ExerciseModality.Stretching;
  } else if (
    lower.includes('cardio') ||
    lower.includes('hiit') ||
    lower.includes('zone 2') ||
    lower.includes('conditioning')
  ) {
    modality = ExerciseModality.Cardio;
  }

  const totalSets = mapped.reduce((s, e) => s + e.sets, 0);
  const estMin = day.isRestDay
    ? 20
    : Math.max(
        12,
        Math.round(
          mapped.reduce((sum, e) => sum + e.sets * (45 + e.restSeconds), 0) / 60
        )
      );

  return {
    title: day.title,
    subtitle:
      day.focusSummary ||
      (day.isRestDay
        ? 'Active recovery, walking, hydration, and light mobility'
        : `${mapped.length} exercises · ${totalSets} working sets`),
    modality,
    targetRirLabel,
    estimatedMinutes: estMin,
    isRestDay: day.isRestDay,
    focusExerciseId,
    exercises: mapped,
  };
}

export function buildHelpTargetFromTemplate(
  tpl: WorkoutTemplate,
  focusExerciseId?: string
): WorkoutHelpTarget {
  const modality = resolveTemplateModality(tpl);
  const mapped: WorkoutHelpExerciseItem[] = tpl.exercises.map((item) => ({
    id: item.id,
    name: item.name,
    primaryMuscle: item.primaryMuscle,
    secondaryMuscles: item.secondaryMuscles,
    sets: item.sets,
    repRange: item.reps,
    restSeconds: item.restSeconds,
    libraryExerciseId: item.libraryExerciseId,
  }));

  const estMin =
    tpl.estimatedMinutes ??
    Math.max(
      12,
      Math.round(
        mapped.reduce((sum, e) => sum + e.sets * (45 + e.restSeconds), 0) / 60
      )
    );

  return {
    title: tpl.name,
    subtitle: `${tpl.splitType} · ${tpl.description}`,
    modality,
    estimatedMinutes: estMin,
    focusExerciseId,
    exercises: mapped,
  };
}

function findMatchingLibraryExercise(
  item: WorkoutHelpExerciseItem,
  library: LibraryExercise[]
): LibraryExercise | undefined {
  if (item.libraryExerciseId) {
    const byId = library.find((e) => e.id === item.libraryExerciseId);
    if (byId) return byId;
  }
  const cleanName = item.name.trim().toLowerCase();
  const exact = library.find((e) => e.name.trim().toLowerCase() === cleanName);
  if (exact) return exact;

  const tokens = cleanName
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (tokens.length === 0) return undefined;

  let bestMatch: LibraryExercise | undefined;
  let bestScore = 0;
  for (const lib of library) {
    const hay = lib.name.toLowerCase();
    const hits = tokens.filter((t) => hay.includes(t)).length;
    const score = hits / tokens.length;
    if (score >= 0.65 && hits > bestScore) {
      bestScore = hits;
      bestMatch = lib;
    }
  }
  return bestMatch;
}

function generateFallbackInstructions(
  item: WorkoutHelpExerciseItem,
  muscleLabel: string,
  modality: Exclude<ExerciseModality, ExerciseModality.All>,
  equipment?: EquipmentType
): { steps: string[]; cue: string } {
  if (modality === ExerciseModality.Yoga) {
    return {
      steps: [
        `Set up on your mat in a stable base for ${item.name}, stacking joints cleanly without forcing end-range.`,
        `Inhale through the nose to lengthen the spine; exhale slowly to settle deeper into ${muscleLabel} engagement.`,
        `Hold or flow smoothly for ${item.repRange}, keeping neck and jaw relaxed before transitioning.`,
      ],
      cue: 'Never force a joint past comfortable alignment—use steady 4-second nasal breaths to deepen range.',
    };
  }

  if (modality === ExerciseModality.Stretching) {
    return {
      steps: [
        `Ease gradually into ${item.name} until you feel a mild-to-moderate stretch (around 6/10) across ${muscleLabel}.`,
        `Keep ribs stacked and take slow 5-second exhales so protective muscle tension releases naturally.`,
        `Maintain stillness without bouncing for ${item.repRange}, then exit the position slowly.`,
      ],
      cue: 'Avoid ballistic bouncing or sharp joint pinching; mild tension + slow exhales drive real mobility gains.',
    };
  }

  if (modality === ExerciseModality.Cardio) {
    return {
      steps: [
        `Establish crisp posture and rhythmic breathing before accelerating into ${item.name}.`,
        `Sustain controlled output across the full ${item.repRange} interval without form breakdown.`,
        `Use the ${item.restSeconds}s recovery window to walk/breathe through your nose and bring heart rate down.`,
      ],
      cue: 'Prioritize repeatable mechanics and smooth cadence from the first interval to the last.',
    };
  }

  const equipHint =
    equipment && equipment !== EquipmentType.All ? ` using ${equipment.toLowerCase()}` : '';

  return {
    steps: [
      `Set a stable stance/seat and brace your core 360 degrees before initiating ${item.name}${equipHint}.`,
      `Drive purposefully through ${muscleLabel} on the concentric phase without swinging or using momentum.`,
      `Control the lowering (eccentric) phase for 2–3 full seconds into a deep stretch across ${muscleLabel}, aiming for ${item.repRange} reps.`,
    ],
    cue: `Keep tension on ${muscleLabel} at both the stretched bottom and peak contraction; rest ${item.restSeconds}s between sets.`,
  };
}

function getModalityWarmupGuide(
  modality: Exclude<ExerciseModality, ExerciseModality.All>,
  targetRirLabel?: string
): { heading: string; bullets: string[] } {
  if (modality === ExerciseModality.Yoga) {
    return {
      heading: 'How to Practice This Yoga Session',
      bullets: [
        'Practice barefoot on a non-slip mat; keep blocks or a folded towel nearby to support tight hips or hamstrings.',
        'Link breath to movement: inhale on upward/opening phases and exhale on folds, twists, and grounding holds.',
        'Treat every pose timer or breath count as an invitation—back off 10% if breath becomes shallow or strained.',
      ],
    };
  }
  if (modality === ExerciseModality.Stretching) {
    return {
      heading: 'How to Perform This Mobility & Stretching Routine',
      bullets: [
        'Spend 2 minutes walking or doing gentle joint circles first so tissues are warm before long holds.',
        'Settle to a calm 5–6/10 stretch sensation—never push into sharp, tingling, or pinching discomfort.',
        'Long 4–6 second exhales down-regulate nervous system tone and unlock deeper range safely.',
      ],
    };
  }
  if (modality === ExerciseModality.Cardio) {
    return {
      heading: 'How to Pace This Cardio / Conditioning Workout',
      bullets: [
        'Warm up for 3–5 minutes at an easy conversational effort before starting working intervals or Zone 2 pace.',
        'For Zone 2 sessions, maintain a steady nasal-breathing or full-sentence pace; for HIIT, hit crisp repeatable surges.',
        'Finish with a 2–3 minute easy walk/spin cool-down and hydrate with water + electrolytes.',
      ],
    };
  }

  return {
    heading: 'How to Execute This Strength Workout',
    bullets: [
      'Warm-Up Ramp: On your first compound lift, perform 2–3 lighter ramp sets (50% × 8, 70% × 5, 85% × 2) before working sets.',
      `Effort Target: Train within ${
        targetRirLabel || '1–3 RIR (RPE 7–9)'
      }—stop each set when form slows but before technique breaks down.`,
      'Tempo & Rest: Lower weights under a 2–3s controlled eccentric, pause briefly in the stretch, and rest fully between sets.',
    ],
  };
}

interface WorkoutHelpModalProps {
  isOpen: boolean;
  target: WorkoutHelpTarget | null;
  exerciseLibrary: LibraryExercise[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  onClose: () => void;
}

export const WorkoutHelpModal: React.FC<WorkoutHelpModalProps> = ({
  isOpen,
  target,
  exerciseLibrary,
  landmarks,
  onClose,
}) => {
  const [filterText, setFilterText] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    setFilterText('');
    if (target?.focusExerciseId) {
      const nextCollapsed: Record<string, boolean> = {};
      for (const ex of target.exercises) {
        nextCollapsed[ex.id] = ex.id !== target.focusExerciseId;
      }
      setCollapsedIds(nextCollapsed);
    } else {
      setCollapsedIds({});
    }
  }, [isOpen, target]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const enrichedExercises = useMemo(() => {
    if (!target) return [];
    const tokens = filterText
      .trim()
      .toLowerCase()
      .split(' ')
      .map((s) => s.trim())
      .filter(Boolean);

    return target.exercises
      .map((item, idx) => {
        const matchedLib = findMatchingLibraryExercise(item, exerciseLibrary);
        const primaryLabel =
          landmarks[item.primaryMuscle]?.name ?? item.primaryMuscle;
        const secondaryLabels = (
          item.secondaryMuscles && item.secondaryMuscles.length > 0
            ? item.secondaryMuscles
            : matchedLib?.secondaryMuscles ?? []
        )
          .map((m) => landmarks[m]?.shortName ?? m)
          .filter(Boolean);

        const exModality = matchedLib
          ? resolveExerciseModality(matchedLib)
          : target.modality;

        const fallback = generateFallbackInstructions(
          item,
          primaryLabel,
          exModality,
          matchedLib?.equipment
        );

        const steps =
          matchedLib && matchedLib.instructions && matchedLib.instructions.length > 0
            ? matchedLib.instructions
            : fallback.steps;

        return {
          index: idx + 1,
          item,
          matchedLib,
          primaryLabel,
          secondaryLabels,
          equipment: matchedLib?.equipment ?? EquipmentType.Bodyweight,
          description: matchedLib?.description,
          steps,
          cue: fallback.cue,
        };
      })
      .filter((entry) => {
        if (tokens.length === 0) return true;
        const hay = `${entry.item.name} ${entry.primaryLabel} ${entry.secondaryLabels.join(
          ' '
        )} ${entry.equipment}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
  }, [target, exerciseLibrary, landmarks, filterText]);

  if (!isOpen || !target) return null;

  const totalSets = target.exercises.reduce((sum, e) => sum + e.sets, 0);
  const guide = getModalityWarmupGuide(target.modality, target.targetRirLabel);

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workout-help-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="hl-card w-full max-w-3xl max-h-[90vh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>Workout Help &amp; Exercise Execution Guide</span>
            </div>
            <h2
              id="workout-help-modal-title"
              className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5 truncate"
            >
              {target.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 truncate">
              <span>{target.modality}</span>
              <span aria-hidden="true"> · </span>
              <span>{target.exercises.length} exercises</span>
              <span aria-hidden="true"> · </span>
              <span>{totalSets} sets</span>
              {target.estimatedMinutes ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>~{target.estimatedMinutes} min</span>
                </>
              ) : null}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="no-touch-delay min-h-[40px] min-w-[40px] rounded-xl hl-subtle border flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
            aria-label="Close workout help"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
          {/* Warm-Up & Execution Strategy */}
          <section className="p-4 rounded-2xl hl-subtle border space-y-2.5">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{guide.heading}</span>
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {guide.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </section>

          {target.isRestDay && target.exercises.length === 0 ? (
            <div className="p-6 rounded-2xl hl-subtle border text-center space-y-2">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                Scheduled Active Recovery Day
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
                Aim for 7,500–10,000 relaxed outdoor steps, hit your daily hydration and protein
                targets, and optionally run a 15-minute Stretching or Evening Yin Yoga flow in the
                Wellness Studio.
              </p>
            </div>
          ) : target.exercises.length === 0 ? (
            <div className="p-6 rounded-2xl hl-subtle border text-center space-y-2">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                No Exercises Added Yet
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                Tap Add Exercise in the tracker to pick movements by muscle group—step-by-step form
                cues will appear here automatically.
              </p>
            </div>
          ) : (
            <>
              {target.exercises.length > 3 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      placeholder="Filter exercises in this workout..."
                      className="w-full min-h-[38px] pl-8 pr-3 py-1.5 text-xs hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCollapsedIds({})}
                      className="no-touch-delay min-h-[36px] px-2.5 py-1 rounded-lg hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-sky-500"
                    >
                      Expand All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const allClosed: Record<string, boolean> = {};
                        for (const e of target.exercises) allClosed[e.id] = true;
                        setCollapsedIds(allClosed);
                      }}
                      className="no-touch-delay min-h-[36px] px-2.5 py-1 rounded-lg hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-sky-500"
                    >
                      Collapse All
                    </button>
                  </div>
                </div>
              )}

              {/* Step-by-Step Exercise Breakdown */}
              <div className="space-y-3">
                {enrichedExercises.map((entry) => {
                  const isCollapsed = Boolean(collapsedIds[entry.item.id]);
                  const numStr = String(entry.index).padStart(2, '0');
                  return (
                    <article
                      key={entry.item.id}
                      className="rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedIds((prev) => ({
                            ...prev,
                            [entry.item.id]: !prev[entry.item.id],
                          }))
                        }
                        className="no-touch-delay w-full px-4 py-3 hl-subtle flex items-center justify-between gap-3 text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-xs font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">
                              {numStr}.
                            </span>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {entry.item.name}
                            </h4>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {entry.primaryLabel}
                            </span>
                            {entry.secondaryLabels.length > 0 && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span>+{entry.secondaryLabels.join(', ')}</span>
                              </>
                            )}
                            <span aria-hidden="true"> · </span>
                            <span>{entry.equipment}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono tabular-nums">
                              {entry.item.sets} × {entry.item.repRange} · {entry.item.restSeconds}s rest
                            </span>
                          </p>
                        </div>

                        {isCollapsed ? (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                      </button>

                      {!isCollapsed && (
                        <div className="px-4 py-3.5 space-y-3 border-t border-slate-200/70 dark:border-slate-800 text-xs">
                          {entry.description && (
                            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                              {entry.description}
                            </p>
                          )}

                          <div className="space-y-1.5">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              How to Perform:
                            </p>
                            <ol className="space-y-1.5 text-slate-700 dark:text-slate-200 leading-relaxed">
                              {entry.steps.map((step, sIdx) => (
                                <li key={sIdx} className="flex items-start gap-2">
                                  <span className="font-mono tabular-nums font-semibold text-slate-400 dark:text-slate-500 shrink-0">
                                    {sIdx + 1}.
                                  </span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>

                          <p className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 text-slate-500 dark:text-slate-400 leading-relaxed">
                            <strong className="text-slate-700 dark:text-slate-300">
                              Coaching Cue:
                            </strong>{' '}
                            {entry.cue}
                          </p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 hl-subtle flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Step-by-step execution &amp; safety cues
          </span>
          <button
            type="button"
            onClick={onClose}
            className="no-touch-delay min-h-[38px] px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};

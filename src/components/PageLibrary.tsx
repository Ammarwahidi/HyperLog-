import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EquipmentType,
  ExerciseModality,
  LibraryExercise,
  MajorMuscleGroup,
  MuscleId,
  MuscleLandmark,
  SetLogEntry,
  WorkoutDayPlan,
  WorkoutTemplate,
} from '../types/workout';
import {
  getMuscleMajorGroup,
  MAJOR_MUSCLE_GROUP_ORDER,
} from '../data/exerciseCatalog';
import {
  groupExercisesByMuscleSection,
  MODALITY_FILTER_ORDER,
  resolveExerciseModality,
} from '../data/allInOneFitnessCatalog';
import {
  Check,
  DownloadCloud,
  Dumbbell,
  ExternalLink,
  Play,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { ExerciseProgressChart } from './ExerciseProgressChart';
import { ExpandableInfoDropdown } from './ExpandableInfoDropdown';
import {
  fetchExerciseLibraryBatch,
  invalidateLibraryPageCache,
} from '../db/localStore';

const LIBRARY_BATCH_SIZE = 10;

interface PageLibraryProps {
  exercises: LibraryExercise[];
  totalCatalogCount?: number;
  isHydratingFullCatalog?: boolean;
  landmarks: Record<MuscleId, MuscleLandmark>;
  templates: WorkoutTemplate[];
  setLogs: SetLogEntry[];
  plan: WorkoutDayPlan[];
  weightUnit: 'kg' | 'lb';
  isDark: boolean;
  activeWorkoutLabel: string;
  onCreateExercise: (exercise: LibraryExercise) => Promise<void>;
  onAddExerciseToTemplate: (templateId: string, exercise: LibraryExercise) => Promise<void>;
  onAddExerciseToActiveWorkout: (exercise: LibraryExercise) => Promise<void>;
  onSyncOnlineCatalog: () => Promise<{
    addedExercises: number;
    addedTemplates: number;
    totalExercises: number;
  }>;
  isSyncingOnline?: boolean;
}

function filterInMemoryExercises(params: {
  exercises: LibraryExercise[];
  query: string;
  onlyForearms: boolean;
  level: 'All' | 'Beginner' | 'Intermediate' | 'Advanced';
  modality: ExerciseModality;
  group: MajorMuscleGroup;
  equipment: EquipmentType;
  landmarks: Record<MuscleId, MuscleLandmark>;
}): LibraryExercise[] {
  const tokens = params.query
    .trim()
    .toLowerCase()
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean);

  const matching = params.exercises.filter((ex) => {
    if (
      params.onlyForearms &&
      ex.primaryMuscle !== MuscleId.Forearms &&
      !ex.secondaryMuscles.includes(MuscleId.Forearms)
    ) {
      return false;
    }
    if (params.level !== 'All' && (ex.level ?? 'Intermediate') !== params.level) {
      return false;
    }
    const mod = resolveExerciseModality(ex);
    if (params.modality !== ExerciseModality.All && mod !== params.modality) {
      return false;
    }
    if (params.group !== MajorMuscleGroup.All && ex.majorGroup !== params.group) {
      return false;
    }
    if (params.equipment !== EquipmentType.All && ex.equipment !== params.equipment) {
      return false;
    }
    if (tokens.length === 0) return true;
    const primName = params.landmarks[ex.primaryMuscle]?.name.toLowerCase() ?? '';
    const shortName = params.landmarks[ex.primaryMuscle]?.shortName.toLowerCase() ?? '';
    const secNames = ex.secondaryMuscles
      .map((m) => params.landmarks[m]?.name.toLowerCase() ?? '')
      .join(' ');
    const haystack = `${ex.name} ${ex.description} ${ex.equipment} ${ex.majorGroup} ${ex.level ?? ''} ${mod} ${primName} ${shortName} ${secNames}`.toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });

  return [...matching].sort((a, b) => {
    const aCustom = a.isCustom || a.id.startsWith('lib_custom_') ? 1 : 0;
    const bCustom = b.isCustom || b.id.startsWith('lib_custom_') ? 1 : 0;
    if (aCustom !== bCustom) return bCustom - aCustom;
    return 0;
  });
}

export const PageLibrary: React.FC<PageLibraryProps> = ({
  exercises,
  totalCatalogCount,
  isHydratingFullCatalog = false,
  landmarks,
  templates,
  setLogs,
  plan,
  weightUnit,
  isDark,
  activeWorkoutLabel,
  onCreateExercise,
  onAddExerciseToTemplate,
  onAddExerciseToActiveWorkout,
  onSyncOnlineCatalog,
  isSyncingOnline = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedModality, setSelectedModality] = useState<ExerciseModality>(ExerciseModality.All);
  const [selectedGroup, setSelectedGroup] = useState<MajorMuscleGroup>(MajorMuscleGroup.All);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType>(EquipmentType.All);
  const [onlyForearms, setOnlyForearms] = useState<boolean>(false);
  const [selectedLevel, setSelectedLevel] = useState<
    'All' | 'Beginner' | 'Intermediate' | 'Advanced'
  >('All');

  // Render strictly the first 10 exercises initially, then dynamically fetch batches on scroll
  const initialFirstTen = useMemo(
    () =>
      filterInMemoryExercises({
        exercises,
        query: '',
        onlyForearms: false,
        level: 'All',
        modality: ExerciseModality.All,
        group: MajorMuscleGroup.All,
        equipment: EquipmentType.All,
        landmarks,
      }).slice(0, LIBRARY_BATCH_SIZE),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [renderedExercises, setRenderedExercises] = useState<LibraryExercise[]>(initialFirstTen);
  const [nextBatchOffset, setNextBatchOffset] = useState<number>(initialFirstTen.length);
  const [totalMatchedCount, setTotalMatchedCount] = useState<number>(() =>
    Math.max(exercises.length, totalCatalogCount ?? exercises.length)
  );
  const [hasMoreBatches, setHasMoreBatches] = useState<boolean>(
    () => Math.max(exercises.length, totalCatalogCount ?? exercises.length) > initialFirstTen.length
  );
  const [isFetchingBatch, setIsFetchingBatch] = useState<boolean>(false);

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const inFlightOffsetRef = useRef<number | null>(null);
  const queryGenerationRef = useRef<number>(0);

  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(
    exercises[0]?.id ?? 'lib_bb_bench_press'
  );

  const [targetTemplateId, setTargetTemplateId] = useState<string>(templates[0]?.id ?? '');
  const [addedBanner, setAddedBanner] = useState<string | null>(null);
  const [syncBanner, setSyncBanner] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEquipment, setNewEquipment] =
    useState<Exclude<EquipmentType, EquipmentType.All>>(EquipmentType.Dumbbell);
  const [newPrimaryMuscle, setNewPrimaryMuscle] = useState<MuscleId>(MuscleId.Chest);
  const [newSecondaryMuscles, setNewSecondaryMuscles] = useState<MuscleId[]>([]);
  const [newDescription, setNewDescription] = useState('');
  const [newInstructionsText, setNewInstructionsText] = useState('');
  const [newRepRange, setNewRepRange] = useState('8–12');
  const [newRestSeconds, setNewRestSeconds] = useState(90);
  const [newVideoUrl, setNewVideoUrl] = useState('');

  const forearmExerciseCount = useMemo(
    () =>
      exercises.filter(
        (ex) =>
          ex.primaryMuscle === MuscleId.Forearms ||
          ex.secondaryMuscles.includes(MuscleId.Forearms)
      ).length,
    [exercises]
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 160);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  // Reset to first 10 exercises & dynamically fetch Batch 0 whenever filters or catalog change
  useEffect(() => {
    const gen = ++queryGenerationRef.current;
    inFlightOffsetRef.current = 0;

    if (listScrollRef.current) {
      listScrollRef.current.scrollTop = 0;
    }

    const immediateMatches = filterInMemoryExercises({
      exercises,
      query: debouncedQuery,
      onlyForearms,
      level: selectedLevel,
      modality: selectedModality,
      group: selectedGroup,
      equipment: selectedEquipment,
      landmarks,
    });
    const immediateFirstBatch = immediateMatches.slice(0, LIBRARY_BATCH_SIZE);
    setRenderedExercises(immediateFirstBatch);
    setNextBatchOffset(immediateFirstBatch.length);
    setTotalMatchedCount(immediateMatches.length);
    setHasMoreBatches(immediateMatches.length > immediateFirstBatch.length);
    setIsFetchingBatch(true);

    let cancelled = false;
    void fetchExerciseLibraryBatch({
      offset: 0,
      limit: LIBRARY_BATCH_SIZE,
      searchQuery: debouncedQuery,
      onlyForearms,
      level: selectedLevel,
      modality: selectedModality,
      majorGroup: selectedGroup,
      equipment: selectedEquipment,
      resolveModality: resolveExerciseModality,
      landmarks,
      setLogsHint: setLogs,
      fallbackExercises: exercises,
    })
      .then((res) => {
        if (cancelled || gen !== queryGenerationRef.current) return;
        setRenderedExercises(res.batch);
        setNextBatchOffset(res.nextOffset);
        setTotalMatchedCount(res.totalMatched);
        setHasMoreBatches(res.hasMore);
      })
      .catch(() => {
        // Fallback to in-memory seed already rendered above
      })
      .finally(() => {
        if (!cancelled && gen === queryGenerationRef.current) {
          inFlightOffsetRef.current = null;
          setIsFetchingBatch(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    debouncedQuery,
    onlyForearms,
    selectedLevel,
    selectedModality,
    selectedGroup,
    selectedEquipment,
    exercises,
    landmarks,
    setLogs,
  ]);

  // Dynamically fetch the next batch of 10 exercises as user nears the end of scrollable area
  const fetchNextExerciseBatch = useCallback(async () => {
    if (!hasMoreBatches || inFlightOffsetRef.current !== null) {
      return;
    }

    const targetOffset = nextBatchOffset;
    const gen = queryGenerationRef.current;
    inFlightOffsetRef.current = targetOffset;
    setIsFetchingBatch(true);

    try {
      const res = await fetchExerciseLibraryBatch({
        offset: targetOffset,
        limit: LIBRARY_BATCH_SIZE,
        searchQuery: debouncedQuery,
        onlyForearms,
        level: selectedLevel,
        modality: selectedModality,
        majorGroup: selectedGroup,
        equipment: selectedEquipment,
        resolveModality: resolveExerciseModality,
        landmarks,
        setLogsHint: setLogs,
        fallbackExercises: exercises,
      });

      if (gen !== queryGenerationRef.current) {
        return;
      }

      setRenderedExercises((prev) => {
        const seenIds = new Set(prev.map((item) => item.id));
        const uniqueIncoming = res.batch.filter((item) => !seenIds.has(item.id));
        return uniqueIncoming.length > 0 ? [...prev, ...uniqueIncoming] : prev;
      });
      setNextBatchOffset(res.nextOffset);
      setTotalMatchedCount(res.totalMatched);
      setHasMoreBatches(res.hasMore);
    } finally {
      if (gen === queryGenerationRef.current) {
        inFlightOffsetRef.current = null;
        setIsFetchingBatch(false);
      }
    }
  }, [
    hasMoreBatches,
    nextBatchOffset,
    debouncedQuery,
    onlyForearms,
    selectedLevel,
    selectedModality,
    selectedGroup,
    selectedEquipment,
    landmarks,
    setLogs,
    exercises,
  ]);

  // IntersectionObserver watching sentinel near bottom of scrollable list container
  useEffect(() => {
    const sentinelEl = loadMoreSentinelRef.current;
    const scrollRootEl = listScrollRef.current;
    if (
      !sentinelEl ||
      !hasMoreBatches ||
      isFetchingBatch ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void fetchNextExerciseBatch();
        }
      },
      {
        root: scrollRootEl,
        rootMargin: '0px 0px 80px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [hasMoreBatches, isFetchingBatch, fetchNextExerciseBatch, renderedExercises.length]);

  const groupedSections = useMemo(
    () => groupExercisesByMuscleSection(renderedExercises),
    [renderedExercises]
  );

  const handlePullOnlineExercises = async () => {
    try {
      const res = await onSyncOnlineCatalog();
      invalidateLibraryPageCache();
      setSyncBanner(
        `Synced ${res.totalExercises} movements (+${res.addedExercises} new exercises & +${res.addedTemplates} workouts added).`
      );
      window.setTimeout(() => setSyncBanner(null), 5000);
    } catch {
      setSyncBanner('Unable to pull online exercise database right now.');
      window.setTimeout(() => setSyncBanner(null), 4000);
    }
  };

  const activeExercise = useMemo(() => {
    return (
      renderedExercises.find((e) => e.id === selectedExerciseId) ??
      exercises.find((e) => e.id === selectedExerciseId) ??
      renderedExercises[0] ??
      exercises[0]
    );
  }, [renderedExercises, exercises, selectedExerciseId]);

  const handleToggleSecondaryMuscle = (mId: MuscleId) => {
    if (mId === newPrimaryMuscle) return;
    setNewSecondaryMuscles((prev) =>
      prev.includes(mId) ? prev.filter((x) => x !== mId) : [...prev, mId]
    );
  };

  const handleSubmitNewExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDescription.trim()) return;

    const steps = newInstructionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const created: LibraryExercise = {
      id: `lib_custom_${Date.now()}`,
      name: newName.trim(),
      majorGroup: getMuscleMajorGroup(newPrimaryMuscle),
      primaryMuscle: newPrimaryMuscle,
      secondaryMuscles: newSecondaryMuscles.filter((m) => m !== newPrimaryMuscle),
      equipment: newEquipment,
      description: newDescription.trim(),
      instructions:
        steps.length > 0
          ? steps
          : [
              'Establish a stable base of support and brace your core before initiating the movement.',
              'Control a 2–3 second eccentric into a full loaded stretch, then drive smoothly to peak contraction.',
            ],
      defaultRepRange: newRepRange.trim() || '8–12',
      defaultRestSeconds: Math.max(30, Math.min(300, Number(newRestSeconds) || 90)),
      defaultWeightKg: 20,
      videoUrl: newVideoUrl.trim() || undefined,
      videoSourceLabel: newVideoUrl.trim() ? 'External Demonstration Video' : undefined,
      isCustom: true,
    };

    await onCreateExercise(created);
    invalidateLibraryPageCache();
    setSelectedExerciseId(created.id);
    setIsCreateOpen(false);
    setNewName('');
    setNewDescription('');
    setNewInstructionsText('');
    setNewSecondaryMuscles([]);
    setNewVideoUrl('');
  };

  const handleQuickAddToTemplate = async () => {
    const chosenId = targetTemplateId || templates[0]?.id;
    if (!chosenId || !activeExercise) return;
    await onAddExerciseToTemplate(chosenId, activeExercise);
    const tplName = templates.find((t) => t.id === chosenId)?.name ?? 'Template';
    setAddedBanner(`Added "${activeExercise.name}" to ${tplName}`);
    window.setTimeout(() => setAddedBanner(null), 3000);
  };

  const hasActiveFilter =
    Boolean(debouncedQuery) ||
    onlyForearms ||
    selectedLevel !== 'All' ||
    selectedModality !== ExerciseModality.All ||
    selectedGroup !== MajorMuscleGroup.All ||
    selectedEquipment !== EquipmentType.All;

  const displayedTotalCount = hasActiveFilter
    ? totalMatchedCount
    : Math.max(totalMatchedCount, totalCatalogCount ?? exercises.length);

  const remainingExercisesCount = Math.max(0, displayedTotalCount - renderedExercises.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Movement Library
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Explore calm, step-by-step form guides at your own pace, or add any movement straight
            to today&apos;s workout.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            type="button"
            disabled={isSyncingOnline}
            onClick={handlePullOnlineExercises}
            className="no-touch-delay min-h-[44px] px-3.5 py-2 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-sky-500 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <DownloadCloud className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>{isSyncingOnline ? 'Syncing 870+…' : 'Sync More Movements'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="no-touch-delay min-h-[44px] px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>New Custom Exercise</span>
          </button>
        </div>
      </div>

      {syncBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{syncBanner}</span>
        </div>
      )}

      {/* Calm Search + Progressive Disclosure Filter Drawer */}
      <div className="hl-card rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search movements (e.g., Goblet Squat, Forearms, Chest, Yoga, Jump Rope)..."
              className="no-touch-delay w-full min-h-[46px] pl-10 pr-4 py-2 text-sm hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-600"
            />
          </div>

          <button
            type="button"
            data-testid="library-filter-forearms-btn"
            onClick={() => {
              const next = !onlyForearms;
              setOnlyForearms(next);
              if (next) {
                setSelectedGroup(MajorMuscleGroup.All);
                setSelectedModality(ExerciseModality.All);
                const firstForearm = exercises.find(
                  (e) => e.primaryMuscle === MuscleId.Forearms
                );
                if (firstForearm) setSelectedExerciseId(firstForearm.id);
              }
            }}
            className={`no-touch-delay min-h-[46px] px-4 py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-2 whitespace-nowrap shrink-0 ${
              onlyForearms
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'hl-subtle text-slate-800 dark:text-slate-100 hover:border-emerald-500'
            }`}
          >
            <Dumbbell className="w-4 h-4 shrink-0" />
            <span>
              {onlyForearms
                ? `Showing Forearms (${forearmExerciseCount}) · Tap to Show All`
                : `Forearms & Grip (${forearmExerciseCount})`}
            </span>
          </button>
        </div>

        {/* Progressive Disclosure: Muscle Group, Experience Level, Style & Gear */}
        <ExpandableInfoDropdown
          testId="library-filters-dropdown"
          title="Filter by Muscle, Experience Level or Gear"
          subtitle="Narrow down by body area, beginner-friendly pace, yoga/cardio style, or equipment"
          summaryRight={`${displayedTotalCount} matches`}
          defaultOpen={false}
          className="hl-subtle border"
        >
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Muscle Area
              </span>
              <div
                className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
                role="tablist"
                aria-label="Filter library by major muscle group"
              >
                {MAJOR_MUSCLE_GROUP_ORDER.map((group) => {
                  const active = selectedGroup === group.id && !onlyForearms;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setOnlyForearms(false);
                        setSelectedGroup(group.id);
                      }}
                      className={`no-touch-delay min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-slate-900 dark:bg-sky-600 text-white'
                          : 'hl-card border text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {group.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Comfort &amp; Experience Level
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {(['All', 'Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSelectedLevel(lvl)}
                    className={`no-touch-delay min-h-[38px] px-3 py-1 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 ${
                      selectedLevel === lvl
                        ? 'bg-sky-600 text-white'
                        : 'hl-card border text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {lvl === 'All' ? 'All Levels' : lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Movement Style
              </span>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 overflow-x-auto no-scrollbar">
                {MODALITY_FILTER_ORDER.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedModality(m.id)}
                    className={`no-touch-delay min-h-[38px] px-3 py-1 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 ${
                      selectedModality === m.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Available Gear
              </span>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                {Object.values(EquipmentType).map((eq) => (
                  <button
                    key={eq}
                    type="button"
                    onClick={() => setSelectedEquipment(eq)}
                    className={`no-touch-delay min-h-[38px] px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 ${
                      selectedEquipment === eq
                        ? 'bg-sky-600 text-white'
                        : 'hl-card border text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {eq === EquipmentType.All ? 'Any Gear' : eq}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ExpandableInfoDropdown>
      </div>

      {/* Main Master-Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 hl-card rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Pick an Exercise
            </span>
            <span
              data-testid="library-pagination-counter"
              className="font-mono tabular-nums whitespace-nowrap"
            >
              Showing {renderedExercises.length} of {displayedTotalCount}
              {isHydratingFullCatalog ? ' · syncing…' : ''}
            </span>
          </div>

          {renderedExercises.length === 0 && !isFetchingBatch ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No matching exercises found
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tap Reset Filters below or add your own custom exercise.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDebouncedQuery('');
                    setOnlyForearms(false);
                    setSelectedLevel('All');
                    setSelectedModality(ExerciseModality.All);
                    setSelectedGroup(MajorMuscleGroup.All);
                    setSelectedEquipment(EquipmentType.All);
                  }}
                  className="no-touch-delay min-h-[44px] px-3.5 py-1.5 text-xs font-semibold hl-subtle border text-slate-800 dark:text-slate-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  Reset Filters
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  className="no-touch-delay min-h-[44px] px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg whitespace-nowrap shrink-0"
                >
                  Create Exercise
                </button>
              </div>
            </div>
          ) : (
            <div
              ref={listScrollRef}
              data-testid="library-scroll-container"
              className="max-h-[440px] lg:max-h-[540px] overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-800"
            >
              {groupedSections.map((section) => (
                <div key={section.key}>
                  <div className="px-4 py-2 hl-subtle border-y border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {section.title}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {section.items.length}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200/60 dark:divide-slate-800/80">
                    {section.items.map((ex) => {
                      const isSelected = activeExercise?.id === ex.id;
                      const primLm = landmarks[ex.primaryMuscle];
                      const secLabels = ex.secondaryMuscles
                        .map((m) => landmarks[m]?.shortName)
                        .filter(Boolean)
                        .join(', ');

                      return (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => setSelectedExerciseId(ex.id)}
                          className={`no-touch-delay w-full min-h-[60px] text-left px-4 py-3 ${
                            isSelected
                              ? 'bg-blue-50/75 dark:bg-blue-950/40'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {ex.name}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                              {ex.defaultRepRange}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            <span>{ex.equipment}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="text-slate-700 dark:text-slate-300 font-medium">
                              {primLm?.shortName}
                            </span>
                            {secLabels && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span>+{secLabels}</span>
                              </>
                            )}
                            {ex.isCustom && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                  Custom
                                </span>
                              </>
                            )}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Fixed-height skeleton rows while dynamically fetching next 10 exercises */}
              {(isFetchingBatch || isHydratingFullCatalog) && (
                <div
                  aria-busy="true"
                  aria-label="Fetching next batch of exercises"
                  className="divide-y divide-slate-200/60 dark:divide-slate-800/80"
                >
                  {[0, 1].map((idx) => (
                    <div key={idx} className="min-h-[60px] px-4 py-3 space-y-2 animate-pulse">
                      <div className="h-3.5 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
                      <div className="h-2.5 w-1/2 rounded bg-slate-200/80 dark:bg-slate-800/80" />
                    </div>
                  ))}
                </div>
              )}

              {/* IntersectionObserver Sentinel + Accessible Manual Fetch Fallback */}
              {hasMoreBatches && (
                <div
                  ref={loadMoreSentinelRef}
                  data-testid="library-intersection-sentinel"
                  className="p-3 hl-subtle flex items-center justify-between gap-3"
                >
                  <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Scroll for more · {remainingExercisesCount} remaining
                  </span>
                  <button
                    type="button"
                    data-testid="library-load-more-btn"
                    onClick={() => {
                      void fetchNextExerciseBatch();
                    }}
                    disabled={isFetchingBatch}
                    className="no-touch-delay min-h-[42px] px-3.5 py-1.5 rounded-xl hl-card border text-xs font-semibold text-blue-600 dark:text-blue-400 hover:border-blue-500 whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    {isFetchingBatch
                      ? 'Fetching…'
                      : `Load ${Math.min(LIBRARY_BATCH_SIZE, Math.max(1, remainingExercisesCount))} More`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Clean Step-by-Step Instructions + 1-Tap Track + Expandable Details */}
        {activeExercise && (
          <div className="lg:col-span-7 hl-card rounded-2xl p-4 sm:p-6 space-y-5">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {activeExercise.level ?? 'All Levels'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {activeExercise.equipment}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {landmarks[activeExercise.primaryMuscle]?.name ?? activeExercise.majorGroup}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {activeExercise.defaultRepRange} · {activeExercise.defaultRestSeconds}s rest
                </span>
              </div>

              <div className="flex flex-wrap items-start justify-between gap-4">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {activeExercise.name}
                </h2>

                {activeExercise.videoUrl && (
                  <a
                    href={activeExercise.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-touch-delay min-h-[44px] px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <span>{activeExercise.videoSourceLabel ?? 'Watch Video Demo'}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                )}
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                {activeExercise.description}
              </p>
            </div>

            {/* Primary 1-Tap Action Bar right up top */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl hl-subtle border">
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Do This Exercise Today
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate block mt-0.5">
                  Adds straight into: {activeWorkoutLabel}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onAddExerciseToActiveWorkout(activeExercise)}
                className="no-touch-delay min-h-[46px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 shrink-0" />
                <span>Add &amp; Track Now</span>
              </button>
            </div>

            {/* Easy Step-by-Step Instructions */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                How to Do It (Easy Step-by-Step Guide)
              </h3>
              <ol className="space-y-2.5">
                {activeExercise.instructions.map((step, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                  >
                    <span className="font-mono tabular-nums text-xs font-bold text-slate-900 dark:text-white hl-subtle border rounded-md w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Expandable Dropdown for Secondary Charts, Muscle Landmarks & Template Saving */}
            <ExpandableInfoDropdown
              title="See Progress Chart, Muscle Details & Save to Template"
              subtitle="Tap to view your 10-session strength history or save this exercise to a routine"
              defaultOpen={false}
            >
              <div className="space-y-5">
                <ExerciseProgressChart
                  exercise={activeExercise}
                  setLogs={setLogs}
                  plan={plan}
                  weightUnit={weightUnit}
                  isDark={isDark}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl hl-subtle border space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Primary Target Muscle
                    </p>
                    <p className="text-base font-bold text-slate-900 dark:text-white">
                      {landmarks[activeExercise.primaryMuscle]?.name}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      Suggested weekly range: {landmarks[activeExercise.primaryMuscle]?.mavMin}–
                      {landmarks[activeExercise.primaryMuscle]?.mavMax} sets · Gentle rest cap{' '}
                      {landmarks[activeExercise.primaryMuscle]?.mrv}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl hl-subtle border space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Helper Muscles
                    </p>
                    {activeExercise.secondaryMuscles.length === 0 ? (
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        Focused isolation exercise
                      </p>
                    ) : (
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {activeExercise.secondaryMuscles
                          .map((m) => landmarks[m]?.name)
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                {templates.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Save Exercise to a Workout Template
                    </span>
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <select
                        value={targetTemplateId || templates[0]?.id}
                        onChange={(e) => setTargetTemplateId(e.target.value)}
                        aria-label="Target workout template"
                        className="no-touch-delay flex-1 min-h-[44px] px-3 py-2 text-xs font-medium hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        {templates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.name} ({tpl.exercises.length} exercises)
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={handleQuickAddToTemplate}
                        className="no-touch-delay min-h-[44px] px-4 py-2 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-blue-500 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span>Add to Template</span>
                      </button>
                    </div>

                    {addedBanner && (
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 pt-1">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>{addedBanner}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </ExpandableInfoDropdown>
          </div>
        )}
      </div>

      {/* Create Custom Exercise Modal */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-exercise-title"
        >
          <form
            onSubmit={handleSubmitNewExercise}
            className="hl-card w-full max-w-xl max-h-[90vh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 id="new-exercise-title" className="text-base font-bold text-slate-900 dark:text-white">
                Add Custom Exercise to Library
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="no-touch-delay min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
                aria-label="Close custom exercise dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Exercise Name *
                  </span>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Pendulum Squat"
                    className="no-touch-delay mt-1 w-full min-h-[44px] px-3 py-1.5 text-sm hl-input rounded-xl"
                  />
                </label>

                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Equipment
                  </span>
                  <select
                    value={newEquipment}
                    onChange={(e) =>
                      setNewEquipment(
                        e.target.value as Exclude<EquipmentType, EquipmentType.All>
                      )
                    }
                    className="no-touch-delay mt-1 w-full min-h-[44px] px-3 py-1.5 text-sm hl-input rounded-xl"
                  >
                    {Object.values(EquipmentType)
                      .filter((eq) => eq !== EquipmentType.All)
                      .map((eq) => (
                        <option key={eq} value={eq}>
                          {eq}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Primary Muscle
                  </span>
                  <select
                    value={newPrimaryMuscle}
                    onChange={(e) => setNewPrimaryMuscle(e.target.value as MuscleId)}
                    className="no-touch-delay mt-1 w-full min-h-[44px] px-2.5 py-1.5 text-xs hl-input rounded-xl"
                  >
                    {Object.values(MuscleId).map((m) => (
                      <option key={m} value={m}>
                        {landmarks[m]?.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Default Reps
                  </span>
                  <input
                    type="text"
                    value={newRepRange}
                    onChange={(e) => setNewRepRange(e.target.value)}
                    placeholder="8–12"
                    className="no-touch-delay mt-1 w-full min-h-[44px] px-3 py-1.5 text-xs font-mono hl-input rounded-xl"
                  />
                </label>

                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Default Rest (sec)
                  </span>
                  <input
                    type="number"
                    min={15}
                    max={300}
                    step={15}
                    value={newRestSeconds}
                    onChange={(e) => setNewRestSeconds(Number(e.target.value))}
                    className="no-touch-delay mt-1 w-full min-h-[44px] px-3 py-1.5 text-xs font-mono tabular-nums hl-input rounded-xl"
                  />
                </label>
              </div>

              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Secondary Muscles Targeted
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.values(MuscleId)
                    .filter((m) => m !== newPrimaryMuscle)
                    .map((m) => {
                      const checked = newSecondaryMuscles.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleToggleSecondaryMuscle(m)}
                          className={`no-touch-delay min-h-[38px] px-2.5 py-1 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 ${
                            checked
                              ? 'bg-blue-600 text-white border-blue-500'
                              : 'hl-subtle text-slate-600 dark:text-slate-300 hover:border-slate-400'
                          }`}
                        >
                          {landmarks[m]?.shortName}
                        </button>
                      );
                    })}
                </div>
              </div>

              <label className="block">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Short Description *
                </span>
                <textarea
                  required
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe biomechanical focus and stretch/contraction profile..."
                  className="no-touch-delay mt-1 w-full px-3 py-2 text-sm hl-input rounded-xl"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Step-by-Step Instructions (one step per line)
                </span>
                <textarea
                  rows={3}
                  value={newInstructionsText}
                  onChange={(e) => setNewInstructionsText(e.target.value)}
                  placeholder={
                    'Set foot stance hip-width apart.\nControl 3-second descent into deep knee flexion.\nDrive smoothly out of the bottom.'
                  }
                  className="no-touch-delay mt-1 w-full px-3 py-2 text-xs hl-input rounded-xl"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Optional Video Demonstration URL
                </span>
                <input
                  type="url"
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="no-touch-delay mt-1 w-full min-h-[44px] px-3 py-1.5 text-xs hl-input rounded-xl"
                />
              </label>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 hl-subtle flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="no-touch-delay min-h-[44px] px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hl-card rounded-xl whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="no-touch-delay min-h-[44px] px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl whitespace-nowrap shrink-0"
              >
                Save to Library
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

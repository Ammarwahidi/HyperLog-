import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EquipmentType,
  ExerciseModality,
  LibraryExercise,
  MajorMuscleGroup,
  MuscleId,
  MuscleLandmark,
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
import { Check, ChevronDown, ChevronUp, Plus, Search, X } from 'lucide-react';
import { getCachedLibrarySlice } from '../db/localStore';

const PICKER_PAGE_SIZE = 10;

interface ExercisePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: LibraryExercise[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  onSelectExercise: (exercise: LibraryExercise) => void;
  onCreateCustomExercise?: (exercise: LibraryExercise) => Promise<void> | void;
  alreadySelectedIds?: string[];
  title?: string;
}

const pickerHaystackCache = new WeakMap<LibraryExercise, string>();

function getPickerSearchHaystack(
  ex: LibraryExercise,
  exModality: ExerciseModality,
  landmarks: Record<MuscleId, MuscleLandmark>
): string {
  const cached = pickerHaystackCache.get(ex);
  if (cached !== undefined) return cached;
  const primaryName = landmarks[ex.primaryMuscle]?.name.toLowerCase() ?? '';
  const shortName = landmarks[ex.primaryMuscle]?.shortName.toLowerCase() ?? '';
  const secNames = ex.secondaryMuscles
    .map((m) => landmarks[m]?.shortName.toLowerCase() ?? '')
    .join(' ');
  const built = `${ex.name} ${ex.description} ${ex.equipment} ${ex.majorGroup} ${exModality} ${primaryName} ${shortName} ${secNames}`.toLowerCase();
  pickerHaystackCache.set(ex, built);
  return built;
}

export const ExercisePickerModal: React.FC<ExercisePickerModalProps> = React.memo(({
  isOpen,
  onClose,
  exercises,
  landmarks,
  onSelectExercise,
  onCreateCustomExercise,
  alreadySelectedIds = [],
  title = 'Select Exercise by Muscle Group',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [modalityFilter, setModalityFilter] = useState<ExerciseModality>(ExerciseModality.All);
  const [groupFilter, setGroupFilter] = useState<MajorMuscleGroup>(MajorMuscleGroup.All);
  const [equipmentFilter, setEquipmentFilter] = useState<EquipmentType>(EquipmentType.All);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [visibleCount, setVisibleCount] = useState<number>(PICKER_PAGE_SIZE);
  const pickerScrollRef = useRef<HTMLDivElement | null>(null);
  const pickerSentinelRef = useRef<HTMLDivElement | null>(null);

  // Quick inline custom exercise creator inside picker
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] = useState<MuscleId>(MuscleId.Chest);
  const [customEquipment, setCustomEquipment] =
    useState<Exclude<EquipmentType, EquipmentType.All>>(EquipmentType.Dumbbell);
  const [customModality, setCustomModality] =
    useState<Exclude<ExerciseModality, ExerciseModality.All>>(ExerciseModality.Strength);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 180);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setVisibleCount(PICKER_PAGE_SIZE);
    if (pickerScrollRef.current) {
      pickerScrollRef.current.scrollTop = 0;
    }
  }, [debouncedQuery, modalityFilter, groupFilter, equipmentFilter, isOpen]);

  const filtered = useMemo(() => {
    const tokens = debouncedQuery
      .trim()
      .toLowerCase()
      .split(' ')
      .map((t) => t.trim())
      .filter(Boolean);
    const matching = exercises.filter((ex) => {
      const exModality = resolveExerciseModality(ex);
      if (modalityFilter !== ExerciseModality.All && exModality !== modalityFilter) {
        return false;
      }
      if (groupFilter !== MajorMuscleGroup.All && ex.majorGroup !== groupFilter) {
        return false;
      }
      if (equipmentFilter !== EquipmentType.All && ex.equipment !== equipmentFilter) {
        return false;
      }
      if (tokens.length === 0) return true;
      const haystack = getPickerSearchHaystack(ex, exModality, landmarks);
      return tokens.every((tok) => haystack.includes(tok));
    });

    return [...matching].sort((a, b) => {
      const aCustom = a.isCustom || a.id.startsWith('lib_custom_') ? 1 : 0;
      const bCustom = b.isCustom || b.id.startsWith('lib_custom_') ? 1 : 0;
      if (aCustom !== bCustom) return bCustom - aCustom;
      return 0;
    });
  }, [exercises, modalityFilter, groupFilter, equipmentFilter, debouncedQuery, landmarks]);

  const visibleFiltered = useMemo(() => {
    const cacheKey = `picker|q=${debouncedQuery.trim().toLowerCase()}|md=${modalityFilter}|gr=${groupFilter}|eq=${equipmentFilter}`;
    return getCachedLibrarySlice({
      cacheKey,
      source: filtered,
      limit: visibleCount,
    }).items;
  }, [filtered, debouncedQuery, modalityFilter, groupFilter, equipmentFilter, visibleCount]);

  const hasMorePickerItems = visibleFiltered.length < filtered.length;

  const handleLoadMorePicker = useCallback(() => {
    if (!hasMorePickerItems) return;
    setVisibleCount((prev) => Math.min(filtered.length, prev + PICKER_PAGE_SIZE));
  }, [hasMorePickerItems, filtered.length]);

  useEffect(() => {
    if (!isOpen || !hasMorePickerItems || typeof IntersectionObserver === 'undefined') return;
    const sentinel = pickerSentinelRef.current;
    const rootEl = pickerScrollRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          handleLoadMorePicker();
        }
      },
      {
        root: rootEl,
        rootMargin: '0px 0px 220px 0px',
        threshold: 0.01,
      }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [isOpen, hasMorePickerItems, handleLoadMorePicker, visibleFiltered.length]);

  const sections = useMemo(() => groupExercisesByMuscleSection(visibleFiltered), [visibleFiltered]);

  if (!isOpen) return null;

  const selectedSet = new Set(alreadySelectedIds);

  const handlePick = (ex: LibraryExercise) => {
    onSelectExercise(ex);
    setJustAddedId(ex.id);
    window.setTimeout(() => setJustAddedId(null), 1200);
  };

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleQuickCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customName.trim();
    if (!clean) return;

    const isTimed =
      customModality === ExerciseModality.Yoga ||
      customModality === ExerciseModality.Stretching;

    const created: LibraryExercise = {
      id: `lib_custom_${Date.now()}`,
      name: clean,
      majorGroup: getMuscleMajorGroup(customMuscle),
      primaryMuscle: customMuscle,
      secondaryMuscles: [],
      equipment: customEquipment,
      modality: customModality,
      level: 'Beginner',
      durationSeconds: isTimed ? 60 : undefined,
      description: `Custom ${customModality} exercise targeting ${
        landmarks[customMuscle]?.name ?? customMuscle
      }.`,
      instructions: [
        'Maintain controlled posture and smooth breathing throughout every repetition or timed hold.',
      ],
      defaultRepRange: isTimed ? '60s' : '8–12',
      defaultRestSeconds: isTimed ? 20 : 90,
      defaultWeightKg:
        isTimed ||
        customEquipment === EquipmentType.Bodyweight ||
        customEquipment === EquipmentType.Mat ||
        customEquipment === EquipmentType.Bands
          ? 0
          : 20,
      isCustom: true,
    };

    if (onCreateCustomExercise) {
      await onCreateCustomExercise(created);
    }
    handlePick(created);
    setCustomName('');
    setIsQuickCreateOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-picker-title"
    >
      <div className="hl-card w-full max-w-3xl max-h-[90vh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="exercise-picker-title"
              className="text-base font-bold text-slate-900 dark:text-white truncate"
            >
              {title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Search {exercises.length} movements separated by muscle group &amp; discipline
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!customName && searchQuery.trim()) {
                  setCustomName(searchQuery.trim());
                }
                setIsQuickCreateOpen((v) => !v);
              }}
              className="no-touch-delay min-h-[40px] px-3 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Custom</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="no-touch-delay min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close exercise picker"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Inline Quick Create Custom Exercise Drawer */}
        {isQuickCreateOpen && (
          <form
            onSubmit={handleQuickCreateAndAdd}
            className="p-4 border-b border-slate-200 dark:border-slate-800 bg-blue-50/40 dark:bg-blue-950/20 space-y-3 shrink-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Create &amp; Add Custom Exercise
              </span>
              <button
                type="button"
                onClick={() => setIsQuickCreateOpen(false)}
                className="no-touch-delay text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                required
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Exercise name..."
                className="sm:col-span-2 min-h-[38px] px-3 text-xs hl-input rounded-lg"
              />
              <select
                value={customMuscle}
                onChange={(e) => setCustomMuscle(e.target.value as MuscleId)}
                aria-label="Primary muscle group"
                className="min-h-[38px] px-2.5 text-xs hl-input rounded-lg"
              >
                {Object.values(landmarks).map((lm) => (
                  <option key={lm.id} value={lm.id}>
                    {lm.name}
                  </option>
                ))}
              </select>
              <select
                value={customModality}
                onChange={(e) =>
                  setCustomModality(
                    e.target.value as Exclude<ExerciseModality, ExerciseModality.All>
                  )
                }
                aria-label="Exercise discipline"
                className="min-h-[38px] px-2.5 text-xs hl-input rounded-lg"
              >
                <option value={ExerciseModality.Strength}>Strength</option>
                <option value={ExerciseModality.Cardio}>Cardio &amp; HIIT</option>
                <option value={ExerciseModality.Yoga}>Yoga</option>
                <option value={ExerciseModality.Stretching}>Stretching</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <select
                value={customEquipment}
                onChange={(e) =>
                  setCustomEquipment(
                    e.target.value as Exclude<EquipmentType, EquipmentType.All>
                  )
                }
                aria-label="Equipment"
                className="min-h-[36px] px-2.5 text-xs hl-input rounded-lg"
              >
                {Object.values(EquipmentType)
                  .filter((eq) => eq !== EquipmentType.All)
                  .map((eq) => (
                    <option key={eq} value={eq}>
                      {eq}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="no-touch-delay min-h-[38px] px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold whitespace-nowrap"
              >
                Save &amp; Add Exercise
              </button>
            </div>
          </form>
        )}

        {/* Search + Multi-Axis Filters */}
        <div className="p-3.5 sm:p-4 hl-subtle border-b space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exercise name, muscle group (e.g. Chest, Back, Legs), Yoga, Cardio..."
              className="no-touch-delay w-full min-h-[44px] pl-9 pr-4 py-2 text-sm hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Modality Filter Row */}
          <div
            className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5"
            role="tablist"
            aria-label="Filter by discipline"
          >
            {MODALITY_FILTER_ORDER.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={modalityFilter === m.id}
                onClick={() => setModalityFilter(m.id)}
                className={`no-touch-delay min-h-[38px] px-3 py-1 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 ${
                  modalityFilter === m.id
                    ? 'bg-blue-600 text-white'
                    : 'hl-card text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Major Muscle Group Filter Row */}
          <div
            className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5"
            role="tablist"
            aria-label="Filter by muscle group"
          >
            {MAJOR_MUSCLE_GROUP_ORDER.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={groupFilter === g.id}
                onClick={() => setGroupFilter(g.id)}
                className={`no-touch-delay min-h-[38px] px-3 py-1 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 ${
                  groupFilter === g.id
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'hl-card text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* Equipment Filter Row */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
            {Object.values(EquipmentType).map((eq) => (
              <button
                key={eq}
                type="button"
                onClick={() => setEquipmentFilter(eq)}
                className={`no-touch-delay min-h-[36px] px-2.5 py-0.5 text-[11px] font-medium rounded-lg whitespace-nowrap shrink-0 ${
                  equipmentFilter === eq
                    ? 'bg-slate-800 dark:bg-blue-600 text-white font-semibold'
                    : 'hl-card text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {eq === EquipmentType.All ? 'All Equipment' : eq}
              </button>
            ))}
          </div>
        </div>

        {/* Muscle-Group Separated Exercise List (Paginated 10 at a time via Scroll-to-Load) */}
        <div
          ref={pickerScrollRef}
          className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-4"
        >
          {sections.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No exercises match &ldquo;{searchQuery || 'current filters'}&rdquo;.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setModalityFilter(ExerciseModality.All);
                    setGroupFilter(MajorMuscleGroup.All);
                    setEquipmentFilter(EquipmentType.All);
                  }}
                  className="no-touch-delay min-h-[38px] px-4 py-1.5 text-xs font-semibold hl-subtle border text-slate-800 dark:text-slate-200 rounded-lg"
                >
                  Clear All Filters
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (searchQuery.trim()) setCustomName(searchQuery.trim());
                    setIsQuickCreateOpen(true);
                  }}
                  className="no-touch-delay min-h-[38px] px-4 py-1.5 text-xs font-semibold bg-sky-600 text-white rounded-lg"
                >
                  + Create &ldquo;{searchQuery.trim() || 'Custom Exercise'}&rdquo;
                </button>
              </div>
            </div>
          ) : (
            sections.map((section) => {
              const isCollapsed = Boolean(collapsedSections[section.key]);
              return (
                <section
                  key={section.key}
                  className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    className="no-touch-delay w-full px-3.5 py-2.5 hl-subtle flex items-center justify-between gap-2 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          {section.title}
                        </h3>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {section.items.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {section.subtitle}
                      </p>
                    </div>
                    {isCollapsed ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {!isCollapsed && (
                    <div className="divide-y divide-slate-200/70 dark:divide-slate-800 px-3.5">
                      {section.items.map((ex) => {
                        const primaryLm = landmarks[ex.primaryMuscle];
                        const secondaryNames = ex.secondaryMuscles
                          .map((m) => landmarks[m]?.shortName)
                          .filter(Boolean)
                          .join(', ');
                        const isAdded = justAddedId === ex.id || selectedSet.has(ex.id);

                        return (
                          <div
                            key={ex.id}
                            className="py-3 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {ex.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                <span>{ex.equipment}</span>
                                <span aria-hidden="true"> · </span>
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {primaryLm?.shortName ?? ex.primaryMuscle}
                                </span>
                                {secondaryNames && (
                                  <>
                                    <span aria-hidden="true"> · </span>
                                    <span>+{secondaryNames}</span>
                                  </>
                                )}
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono tabular-nums">
                                  {ex.defaultRepRange} · {ex.defaultRestSeconds}s rest
                                </span>
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handlePick(ex)}
                              className={`no-touch-delay min-h-[42px] px-3.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                                justAddedId === ex.id
                                  ? 'bg-emerald-600 text-white'
                                  : isAdded
                                  ? 'hl-subtle border text-slate-800 dark:text-slate-200'
                                  : 'bg-blue-600 text-white hover:bg-blue-500'
                              }`}
                            >
                              {justAddedId === ex.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 shrink-0" />
                                  <span>Added</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5 shrink-0" />
                                  <span>{isAdded ? 'Add Again' : 'Add'}</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}

          {hasMorePickerItems && (
            <div
              ref={pickerSentinelRef}
              className="p-3 rounded-xl hl-subtle border flex items-center justify-between gap-3"
            >
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Scroll to load more · {filtered.length - visibleFiltered.length} remaining
              </span>
              <button
                type="button"
                onClick={handleLoadMorePicker}
                className="no-touch-delay min-h-[42px] px-3.5 py-1.5 rounded-lg hl-card border text-xs font-semibold text-blue-600 dark:text-blue-400 hover:border-blue-500 whitespace-nowrap shrink-0"
              >
                Load {Math.min(PICKER_PAGE_SIZE, filtered.length - visibleFiltered.length)} More
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 hl-subtle flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Showing {visibleFiltered.length} of {filtered.length} matching ({exercises.length} total)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="no-touch-delay min-h-[42px] px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-500 whitespace-nowrap shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
});
ExercisePickerModal.displayName = 'ExercisePickerModal';

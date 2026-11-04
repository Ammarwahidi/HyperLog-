import React, { useEffect, useMemo, useState } from 'react';
import {
  ActiveStandaloneSession,
  DailyNutritionRecord,
  ExerciseModality,
  ExercisePrescription,
  LibraryExercise,
  MuscleId,
  MuscleLandmark,
  SetLogEntry,
  TemplateExerciseItem,
  WorkoutDayPlan,
  WorkoutHistoryRecord,
  WorkoutTemplate,
} from '../types/workout';
import {
  ATTACHED_CSV_PATH,
  INITIAL_WORKOUT_PLAN,
  MESOCYCLE_WEEKS,
  SHEET_INSTRUCTIONS,
} from '../data/rpPlanData';
import { INITIAL_WORKOUT_TEMPLATES } from '../data/seedCatalogs';
import {
  MODALITY_FILTER_ORDER,
  resolveTemplateModality,
} from '../data/allInOneFitnessCatalog';
import { ExercisePickerModal } from './ExercisePickerModal';
import { PastWorkoutExerciseDraft, WorkoutCalendar } from './WorkoutCalendar';
import {
  buildHelpTargetFromDayPlan,
  buildHelpTargetFromTemplate,
  WorkoutHelpModal,
  WorkoutHelpTarget,
} from './WorkoutHelpModal';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  DownloadCloud,
  Edit3,
  FileSpreadsheet,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';

interface Page3WorkoutsProps {
  activeWeek: number;
  onChangeWeek?: (week: number) => void;
  plan: WorkoutDayPlan[];
  templates: WorkoutTemplate[];
  exerciseLibrary: LibraryExercise[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  setLogs: SetLogEntry[];
  workoutHistory: WorkoutHistoryRecord[];
  nutritionByDate: Record<string, DailyNutritionRecord>;
  weightUnit: 'kg' | 'lb';
  streakDays: number;
  bestStreakDays: number;
  activeStandaloneSession?: ActiveStandaloneSession | null;
  onSaveDayPlan: (updatedDay: WorkoutDayPlan) => Promise<void>;
  onSaveTemplate: (template: WorkoutTemplate) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onAssignTemplateToDay: (template: WorkoutTemplate, dayNumber: number) => Promise<void>;
  onStartStandaloneTemplate: (template: WorkoutTemplate) => Promise<void>;
  onSaveHistoryRecord: (record: WorkoutHistoryRecord) => Promise<void>;
  onLogPastWorkout: (params: {
    dateIso: string;
    title: string;
    durationMinutes?: number;
    notes?: string;
    exercises: PastWorkoutExerciseDraft[];
  }) => Promise<void>;
  onDeleteManualHistoryRecord: (recordId: string) => Promise<void>;
  onOpenDayInTracker: (dayNumber: number) => void;
  onRepeatWorkout: (session: WorkoutHistoryRecord) => void;
  onReturnToLiveTracker?: () => void;
  onSyncOnlineCatalog: () => Promise<{
    addedExercises: number;
    addedTemplates: number;
    totalExercises: number;
  }>;
  isSyncingOnline?: boolean;
  onCreateCustomExercise?: (exercise: LibraryExercise) => Promise<void>;
}

let cachedRawCsvText: string | null = null;
const templateHaystackCache = new WeakMap<WorkoutTemplate, string>();

function getTemplateSearchHaystack(tpl: WorkoutTemplate, mod: ExerciseModality): string {
  const cached = templateHaystackCache.get(tpl);
  if (cached !== undefined) return cached;
  const built = `${tpl.name} ${tpl.splitType} ${tpl.description} ${mod} ${tpl.exercises
    .map((e) => e.name)
    .join(' ')}`.toLowerCase();
  templateHaystackCache.set(tpl, built);
  return built;
}

export const Page3Workouts: React.FC<Page3WorkoutsProps> = React.memo(({
  activeWeek,
  plan,
  templates,
  exerciseLibrary,
  landmarks,
  setLogs,
  workoutHistory,
  nutritionByDate,
  weightUnit,
  streakDays,
  bestStreakDays,
  activeStandaloneSession,
  onSaveDayPlan,
  onSaveTemplate,
  onDeleteTemplate,
  onAssignTemplateToDay,
  onStartStandaloneTemplate,
  onSaveHistoryRecord,
  onLogPastWorkout,
  onDeleteManualHistoryRecord,
  onOpenDayInTracker,
  onRepeatWorkout,
  onReturnToLiveTracker,
  onSyncOnlineCatalog,
  isSyncingOnline = false,
  onCreateCustomExercise,
}) => {
  const [subTab, setSubTab] = useState<'templates' | 'schedule' | 'calendar'>('templates');
  const [templateFilter, setTemplateFilter] = useState<
    'all' | 'RP' | 'Starter' | 'Online' | 'Custom'
  >('all');
  const [modalityFilter, setModalityFilter] = useState<ExerciseModality>(ExerciseModality.All);
  const [templateSearch, setTemplateSearch] = useState<string>('');
  const [showWorkoutFilters, setShowWorkoutFilters] = useState<boolean>(false);

  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>('');
  const [draftRepRange, setDraftRepRange] = useState<string>('');
  const [showRawSheet, setShowRawSheet] = useState<boolean>(false);
  const [rawCsvPreview, setRawCsvPreview] = useState<string>('');

  const [assignDayMap, setAssignDayMap] = useState<Record<string, number>>({});
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [assignedJumpDay, setAssignedJumpDay] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [showGuidelines, setShowGuidelines] = useState<boolean>(false);
  const [workoutHelpTarget, setWorkoutHelpTarget] = useState<WorkoutHelpTarget | null>(null);

  const toggleCardExpanded = (cardKey: string) => {
    setExpandedCardIds((prev) => ({ ...prev, [cardKey]: !prev[cardKey] }));
  };

  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editorTemplate, setEditorTemplate] = useState<WorkoutTemplate | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [pickerTargetDayNumber, setPickerTargetDayNumber] = useState<number | null>(null);

  useEffect(() => {
    if (!showRawSheet) return;
    if (cachedRawCsvText !== null) {
      setRawCsvPreview(cachedRawCsvText);
      return;
    }
    fetch(ATTACHED_CSV_PATH)
      .then((res) => (res.ok ? res.text() : ''))
      .then((txt) => {
        cachedRawCsvText = txt;
        setRawCsvPreview(txt);
      })
      .catch(() => setRawCsvPreview(''));
  }, [showRawSheet]);

  const effectiveTemplates = useMemo(
    () => (templates.length > 0 ? templates : INITIAL_WORKOUT_TEMPLATES),
    [templates]
  );
  const effectivePlan = useMemo(
    () => (plan.length > 0 ? plan : INITIAL_WORKOUT_PLAN),
    [plan]
  );

  const filteredTemplates = useMemo(() => {
    const tokens = templateSearch
      .trim()
      .toLowerCase()
      .split(' ')
      .map((s) => s.trim())
      .filter(Boolean);
    return effectiveTemplates.filter((t) => {
      if (templateFilter === 'RP') {
        const isRp =
          t.id.startsWith('tpl_rp_') || t.splitType.toLowerCase().includes('rp hypertrophy');
        if (!isRp) return false;
      } else if (templateFilter !== 'all' && t.category !== templateFilter) {
        return false;
      }
      const mod = resolveTemplateModality(t);
      if (modalityFilter !== ExerciseModality.All && mod !== modalityFilter) {
        return false;
      }
      if (tokens.length === 0) return true;
      const haystack = getTemplateSearchHaystack(t, mod);
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [effectiveTemplates, templateFilter, modalityFilter, templateSearch]);

  const handlePullOnlineWorkouts = async () => {
    try {
      const res = await onSyncOnlineCatalog();
      showToast(
        `Synced online database: ${res.totalExercises} exercises & +${res.addedTemplates} new workout programs ready.`
      );
    } catch {
      showToast('Could not reach online fitness catalog right now.');
    }
  };

  const showToast = (msg: string, jumpDay?: number) => {
    setStatusBanner(msg);
    setAssignedJumpDay(jumpDay ?? null);
    window.setTimeout(() => {
      setStatusBanner(null);
      setAssignedJumpDay(null);
    }, 4500);
  };

  const handleOpenNewTemplate = () => {
    setEditorError(null);
    setEditorTemplate({
      id: `tpl_custom_${Date.now()}`,
      name: '',
      category: 'Custom',
      splitType: 'Custom Routine',
      description: '',
      updatedAt: new Date().toISOString(),
      exercises: [],
    });
    setIsEditorOpen(true);
  };

  const handleOpenEditTemplate = (tpl: WorkoutTemplate) => {
    setEditorError(null);
    setEditorTemplate({
      ...tpl,
      exercises: tpl.exercises.map((e) => ({ ...e })),
    });
    setIsEditorOpen(true);
  };

  const handleDuplicateTemplate = async (tpl: WorkoutTemplate) => {
    const copy: WorkoutTemplate = {
      ...tpl,
      id: `tpl_custom_${Date.now()}`,
      name: `${tpl.name} (Copy)`,
      category: 'Custom',
      updatedAt: new Date().toISOString(),
      exercises: tpl.exercises.map((item, idx) => ({
        ...item,
        id: `t_item_${Date.now()}_${idx}`,
      })),
    };
    await onSaveTemplate(copy);
    showToast(`Created customizable copy "${copy.name}"`);
  };

  const handleSaveEditorTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editorTemplate) return;
    if (!editorTemplate.name.trim()) {
      setEditorError('Please provide a name for this workout template.');
      return;
    }
    if (editorTemplate.exercises.length === 0) {
      setEditorError('Add at least one exercise to save the template.');
      return;
    }

    const cleaned: WorkoutTemplate = {
      ...editorTemplate,
      name: editorTemplate.name.trim(),
      description:
        editorTemplate.description.trim() ||
        `Custom ${editorTemplate.splitType} workout template with ${editorTemplate.exercises.length} exercises.`,
      updatedAt: new Date().toISOString(),
    };

    await onSaveTemplate(cleaned);
    setIsEditorOpen(false);
    setEditorTemplate(null);
    showToast(`Saved workout template "${cleaned.name}"`);
  };

  const handlePickerSelect = async (libEx: LibraryExercise) => {
    if (pickerTargetDayNumber !== null) {
      const targetDay = effectivePlan.find((d) => d.dayNumber === pickerTargetDayNumber);
      if (targetDay) {
        const nextOrder = targetDay.exercises.length + 1;
        const newPresc: ExercisePrescription = {
          id: `d${targetDay.dayNumber}_e_${Date.now()}`,
          dayNumber: targetDay.dayNumber,
          order: nextOrder,
          muscleId: libEx.primaryMuscle,
          sheetMuscleLabel: landmarks[libEx.primaryMuscle]?.shortName ?? 'Target',
          name: libEx.name,
          isSuperset: false,
          repRange: libEx.defaultRepRange,
          defaultWeightKg: libEx.defaultWeightKg,
          restSeconds: libEx.defaultRestSeconds,
          libraryExerciseId: libEx.id,
          weekSets: { 1: 3, 2: 3, 3: 4, 4: 4, 5: 2 },
        };
        await onSaveDayPlan({
          ...targetDay,
          isRestDay: false,
          exercises: [...targetDay.exercises, newPresc],
        });
        showToast(`Added "${libEx.name}" to Day ${targetDay.dayNumber}`);
      }
      return;
    }

    if (!editorTemplate) return;
    const newItem: TemplateExerciseItem = {
      id: `ti_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      libraryExerciseId: libEx.id,
      name: libEx.name,
      primaryMuscle: libEx.primaryMuscle,
      secondaryMuscles: libEx.secondaryMuscles,
      sets: 3,
      reps: libEx.defaultRepRange,
      restSeconds: libEx.defaultRestSeconds,
      defaultWeightKg: libEx.defaultWeightKg,
    };
    setEditorError(null);
    setEditorTemplate({
      ...editorTemplate,
      exercises: [...editorTemplate.exercises, newItem],
    });
  };

  const updateEditorItem = (
    itemId: string,
    patch: Partial<TemplateExerciseItem>
  ) => {
    if (!editorTemplate) return;
    setEditorTemplate({
      ...editorTemplate,
      exercises: editorTemplate.exercises.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item
      ),
    });
  };

  const moveEditorItem = (index: number, direction: -1 | 1) => {
    if (!editorTemplate) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= editorTemplate.exercises.length) return;
    const next = [...editorTemplate.exercises];
    const [removed] = next.splice(index, 1);
    next.splice(targetIdx, 0, removed);
    setEditorTemplate({ ...editorTemplate, exercises: next });
  };

  const removeEditorItem = (itemId: string) => {
    if (!editorTemplate) return;
    setEditorTemplate({
      ...editorTemplate,
      exercises: editorTemplate.exercises.filter((i) => i.id !== itemId),
    });
  };

  const handleAssignClick = async (tpl: WorkoutTemplate) => {
    const dayNum = assignDayMap[tpl.id] ?? 1;
    await onAssignTemplateToDay(tpl, dayNum);
    showToast(`Assigned "${tpl.name}" to Day ${dayNum}.`, dayNum);
  };

  const handleStartEditScheduleExercise = (ex: ExercisePrescription) => {
    setEditingExerciseId(ex.id);
    setDraftName(ex.name);
    setDraftRepRange(ex.repRange);
  };

  const handleCommitEditScheduleExercise = async (day: WorkoutDayPlan, exId: string) => {
    if (!draftName.trim()) return;
    const updatedDay: WorkoutDayPlan = {
      ...day,
      exercises: day.exercises.map((e) =>
        e.id === exId
          ? {
              ...e,
              name: draftName.trim(),
              repRange: draftRepRange.trim() || e.repRange,
            }
          : e
      ),
    };
    await onSaveDayPlan(updatedDay);
    setEditingExerciseId(null);
  };

  const estimateTemplateDurationMinutes = (tpl: WorkoutTemplate) => {
    const totalSeconds = tpl.exercises.reduce(
      (sum, ex) => sum + ex.sets * (40 + ex.restSeconds),
      0
    );
    return Math.max(15, Math.round(totalSeconds / 60));
  };

  return (
    <div data-testid="workouts-page-root" className="space-y-6">
      {/* Header & Primary Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Workouts &amp; Routines
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Pick a guided routine that fits your energy today, shape your weekly rhythm, or check your calendar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="flex items-center gap-1 p-1 rounded-xl hl-subtle border overflow-x-auto no-scrollbar max-w-full"
            role="tablist"
            aria-label="Workouts section mode"
          >
            <button
              type="button"
              role="tab"
              data-testid="workouts-subtab-templates"
              aria-selected={subTab === 'templates'}
              onClick={() => setSubTab('templates')}
              className={`no-touch-delay min-h-[40px] px-3.5 sm:px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'templates'
                  ? 'bg-slate-900 dark:bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Routines ({effectiveTemplates.length})
            </button>
            <button
              type="button"
              role="tab"
              data-testid="workouts-subtab-schedule"
              aria-selected={subTab === 'schedule'}
              onClick={() => setSubTab('schedule')}
              className={`no-touch-delay min-h-[40px] px-3.5 sm:px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'schedule'
                  ? 'bg-slate-900 dark:bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Weekly Plan
            </button>
            <button
              type="button"
              role="tab"
              data-testid="workouts-subtab-calendar"
              aria-selected={subTab === 'calendar'}
              onClick={() => setSubTab('calendar')}
              className={`no-touch-delay min-h-[40px] px-3.5 sm:px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'calendar'
                  ? 'bg-slate-900 dark:bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Calendar
            </button>
          </div>

          {subTab === 'templates' && (
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <button
                type="button"
                disabled={isSyncingOnline}
                onClick={handlePullOnlineWorkouts}
                className="no-touch-delay min-h-[40px] px-3.5 py-2 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-sky-500 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
              >
                <DownloadCloud className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>{isSyncingOnline ? 'Syncing…' : 'Sync More Routines'}</span>
              </button>
              <button
                type="button"
                data-testid="create-new-template-btn"
                onClick={handleOpenNewTemplate}
                className="no-touch-delay min-h-[40px] px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>New Routine</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {statusBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{statusBanner}</span>
          </div>
          {assignedJumpDay !== null && (
            <button
              type="button"
              onClick={() => onOpenDayInTracker(assignedJumpDay)}
              className="no-touch-delay min-h-[34px] px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Track Day {assignedJumpDay}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* SUB-TAB 1: WORKOUT TEMPLATES STUDIO */}
      {subTab === 'templates' && (
        <div className="space-y-5">
          <div className="hl-card rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search routines by goal, Yoga, Cardio, Full Body, or movement..."
                  className="w-full min-h-[42px] pl-9 pr-4 py-1.5 text-xs sm:text-sm hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {filteredTemplates.length} of {effectiveTemplates.length} routines
                </span>
                <button
                  type="button"
                  data-testid="toggle-workout-filters-btn"
                  aria-expanded={showWorkoutFilters}
                  onClick={() => setShowWorkoutFilters((v) => !v)}
                  className="no-touch-delay min-h-[40px] px-3.5 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-sky-400 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>{showWorkoutFilters ? 'Hide Filters' : 'Filter Routines'}</span>
                  {showWorkoutFilters ? (
                    <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  )}
                </button>
              </div>
            </div>

            {showWorkoutFilters && (
              <div
                data-testid="workout-filters-panel"
                className="pt-3 border-t border-slate-200/80 dark:border-slate-800 space-y-2.5"
              >
                <div className="flex items-center gap-1 p-1 hl-subtle border rounded-xl overflow-x-auto no-scrollbar">
                  {(
                    [
                      { id: 'all', label: 'All Sources' },
                      { id: 'RP', label: 'RP Hypertrophy' },
                      { id: 'Starter', label: 'Built-In' },
                      { id: 'Online', label: 'Online Library' },
                      { id: 'Custom', label: 'My Custom' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setTemplateFilter(f.id)}
                      className={`no-touch-delay min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        templateFilter === f.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                  {MODALITY_FILTER_ORDER.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModalityFilter(m.id)}
                      className={`no-touch-delay min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        modalityFilter === m.id
                          ? 'bg-slate-900 dark:bg-sky-600 text-white'
                          : 'hl-subtle border text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="hl-card rounded-2xl p-8 sm:p-10 text-center space-y-3">
              <p className="text-base font-bold text-slate-900 dark:text-white">
                {templateFilter === 'Custom' && !templateSearch.trim()
                  ? 'No custom workout templates created yet'
                  : 'No workout templates match your active filter'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {templateFilter === 'Custom' && !templateSearch.trim()
                  ? 'Build a template from scratch with custom sets, rep ranges, and rest timers, or duplicate any starter routine.'
                  : 'Clear your search/discipline filters to view all built-in hypertrophy, grip, cardio, and yoga templates, or create a new custom template.'}
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                {(templateFilter !== 'all' ||
                  modalityFilter !== ExerciseModality.All ||
                  templateSearch.trim().length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateFilter('all');
                      setModalityFilter(ExerciseModality.All);
                      setTemplateSearch('');
                    }}
                    className="no-touch-delay min-h-[42px] px-4 py-2 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-blue-500 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                  >
                    Reset Filters
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOpenNewTemplate}
                  className="no-touch-delay min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Create Custom Template
                </button>
              </div>
            </div>
          ) : (
            <div data-testid="workouts-template-grid" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {filteredTemplates.map((tpl) => {
                const totalSets = tpl.exercises.reduce((sum, e) => sum + e.sets, 0);
                const estMinutes = estimateTemplateDurationMinutes(tpl);
                const selectedAssignDay = assignDayMap[tpl.id] ?? 1;

                return (
                  <div
                    key={tpl.id}
                    data-testid={`workout-template-card-${tpl.id}`}
                    className="hl-card hl-cv-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3.5">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            ~{estMinutes} min · {tpl.exercises.length} movements · {totalSets} sets
                          </p>
                          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 leading-snug">
                            {tpl.name}
                          </h2>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                            {tpl.description}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setWorkoutHelpTarget(buildHelpTargetFromTemplate(tpl))
                          }
                          className="no-touch-delay self-start min-h-[38px] px-2.5 py-1.5 rounded-lg hl-subtle border text-xs font-semibold text-sky-600 dark:text-sky-400 hover:border-sky-500 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                          title={`How to perform ${tpl.name}`}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Guide</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCardExpanded(`tpl_${tpl.id}`)}
                          className="no-touch-delay min-h-[36px] px-3 py-1 rounded-lg hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <span>
                            {expandedCardIds[`tpl_${tpl.id}`]
                              ? `Hide Movements (${tpl.exercises.length})`
                              : `Preview ${tpl.exercises.length} Movements`}
                          </span>
                          {expandedCardIds[`tpl_${tpl.id}`] ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          data-testid={`toggle-card-actions-${tpl.id}`}
                          onClick={() => toggleCardExpanded(`act_${tpl.id}`)}
                          className="no-touch-delay min-h-[36px] px-3 py-1 rounded-lg hl-subtle border text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-slate-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <span>
                            {expandedCardIds[`act_${tpl.id}`]
                              ? 'Hide Options'
                              : 'Schedule or Edit'}
                          </span>
                          {expandedCardIds[`act_${tpl.id}`] ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {expandedCardIds[`tpl_${tpl.id}`] && (
                        <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                          {tpl.exercises.map((item, idx) => (
                            <div
                              key={item.id}
                              className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0 truncate">
                                <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500 mr-1.5">
                                  {idx + 1}.
                                </span>
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {item.name}
                                </span>
                                <span
                                  className="text-slate-400 dark:text-slate-500"
                                  aria-hidden="true"
                                >
                                  {' '}
                                  ·{' '}
                                </span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {landmarks[item.primaryMuscle]?.shortName}
                                </span>
                              </div>

                              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap shrink-0">
                                {item.sets} × {item.reps}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {expandedCardIds[`act_${tpl.id}`] && (
                        <div className="p-3 rounded-xl hl-subtle border space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                              Assign to Weekly Plan
                            </span>
                            <div className="flex items-center gap-1.5">
                              <select
                                aria-label={`Select day to assign ${tpl.name}`}
                                value={selectedAssignDay}
                                onChange={(e) =>
                                  setAssignDayMap((prev) => ({
                                    ...prev,
                                    [tpl.id]: Number(e.target.value),
                                  }))
                                }
                                className="min-h-[38px] px-2.5 py-1 text-xs font-medium hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-600"
                              >
                                {[1, 2, 3, 4, 5, 6, 7].map((dNum) => (
                                  <option key={dNum} value={dNum}>
                                    Day {dNum}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                onClick={() => handleAssignClick(tpl)}
                                className="no-touch-delay min-h-[38px] px-3 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                <span>Assign to Day</span>
                              </button>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditTemplate(tpl)}
                              className="no-touch-delay min-h-[36px] px-3 py-1 rounded-lg hl-card border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 flex items-center gap-1.5 whitespace-nowrap"
                              aria-label={`Customize ${tpl.name}`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Customize</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateTemplate(tpl)}
                              className="no-touch-delay min-h-[36px] px-3 py-1 rounded-lg hl-card border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 flex items-center gap-1.5 whitespace-nowrap"
                              aria-label={`Duplicate ${tpl.name}`}
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Duplicate</span>
                            </button>
                            {confirmDeleteId === tpl.id ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  await onDeleteTemplate(tpl.id);
                                  setConfirmDeleteId(null);
                                  showToast(`Removed routine "${tpl.name}"`);
                                }}
                                className="no-touch-delay min-h-[36px] px-3 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-lg whitespace-nowrap"
                              >
                                Confirm Remove
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(tpl.id)}
                                className="no-touch-delay min-h-[36px] px-3 py-1 rounded-lg hl-card border text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-300 flex items-center gap-1.5 whitespace-nowrap"
                                aria-label={`Delete ${tpl.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => onStartStandaloneTemplate(tpl)}
                        className="no-touch-delay w-full min-h-[44px] px-4 py-2 bg-slate-900 dark:bg-sky-600 hover:opacity-90 text-white text-xs sm:text-sm font-semibold rounded-xl transition-opacity flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Start Workout</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: 7-DAY TRAINING SCHEDULE */}
      {subTab === 'schedule' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Your calm 7-day rhythm — open any day to log sets or swap movements whenever life shifts.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGuidelines((v) => !v)}
                className="no-touch-delay min-h-[40px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hl-card hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <span>{showGuidelines ? 'Hide Tips' : 'Helpful Tips'}</span>
                {showGuidelines ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowRawSheet((v) => !v)}
                className="no-touch-delay min-h-[40px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hl-card hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{showRawSheet ? 'Hide CSV' : 'Source CSV'}</span>
              </button>
            </div>
          </div>

          {(showGuidelines || showRawSheet) && (
            <div className="hl-card rounded-2xl p-4 sm:p-5 space-y-3">
              {showGuidelines && (
                <>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Mesocycle Progression Guidelines
                  </h2>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                    {SHEET_INSTRUCTIONS.map((inst, i) => (
                      <li key={i}>{inst}</li>
                    ))}
                  </ul>
                </>
              )}

              {showRawSheet && rawCsvPreview && (
                <div className={showGuidelines ? 'pt-3 border-t border-slate-200 dark:border-slate-800' : ''}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Source File: Workout_plan_463cf254
                    </span>
                    <a
                      href={ATTACHED_CSV_PATH}
                      download="Workout_plan.csv"
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Download Original CSV
                    </a>
                  </div>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-x-auto max-h-48">
                    {rawCsvPreview}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div data-testid="workouts-schedule-grid" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {effectivePlan.map((day) => {
              const daySets = setLogs.filter(
                (s) =>
                  !s.templateSessionId &&
                  s.week === activeWeek &&
                  s.dayNumber === day.dayNumber
              );
              const completedSets = daySets.filter((s) => s.completed).length;

              return (
                <div
                  key={day.dayNumber}
                  data-testid={`workout-schedule-day-${day.dayNumber}`}
                  className="hl-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          Day {day.dayNumber} ·{' '}
                          {day.isRestDay
                            ? 'Active Recovery'
                            : day.exercises.length === 0
                            ? 'Open Slot'
                            : `${completedSets}/${daySets.length} sets logged`}
                        </p>
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 leading-snug">
                          {day.title}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {day.focusSummary}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                        {day.exercises.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setWorkoutHelpTarget(
                                buildHelpTargetFromDayPlan(
                                  day,
                                  activeWeek,
                                  MESOCYCLE_WEEKS.find((w) => w.week === activeWeek)?.targetRir
                                )
                              )
                            }
                            className="no-touch-delay min-h-[40px] px-3 py-1.5 text-xs font-semibold hl-subtle border text-sky-600 dark:text-sky-400 hover:border-sky-500 rounded-xl transition-colors flex items-center gap-1 whitespace-nowrap"
                            title={`How to perform ${day.title}`}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Workout Help</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            day.exercises.length === 0 && !day.isRestDay
                              ? setSubTab('templates')
                              : onOpenDayInTracker(day.dayNumber)
                          }
                          className={`no-touch-delay min-h-[42px] px-3.5 py-2 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                            day.isRestDay || day.exercises.length === 0
                              ? 'hl-subtle border text-slate-700 dark:text-slate-200 hover:border-sky-500'
                              : 'bg-slate-900 dark:bg-sky-600 hover:opacity-90 text-white'
                          }`}
                        >
                          {day.isRestDay
                            ? `Open Day ${day.dayNumber}`
                            : day.exercises.length === 0
                            ? 'Pick Template'
                            : `Track Day ${day.dayNumber}`}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {day.isRestDay ? (
                      <p className="text-xs text-slate-600 dark:text-slate-300 py-2 leading-relaxed">
                        Scheduled recovery day. Assign a template from the Routines tab if you want
                        an extra session.
                      </p>
                    ) : day.exercises.length === 0 ? (
                      <p className="text-xs text-slate-600 dark:text-slate-300 py-1.5 leading-relaxed">
                        No preloaded exercises. Assign any RP Hypertrophy or custom template from
                        Routines, or add movements below.
                      </p>
                    ) : (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleCardExpanded(`day_${day.dayNumber}`)}
                          className="no-touch-delay min-h-[36px] px-3 py-1 rounded-lg hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <span>
                            {expandedCardIds[`day_${day.dayNumber}`]
                              ? `Hide Exercises (${day.exercises.length})`
                              : `Customize ${day.exercises.length} Exercises`}
                          </span>
                          {expandedCardIds[`day_${day.dayNumber}`] ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {expandedCardIds[`day_${day.dayNumber}`] && (
                          <div className="mt-3 divide-y divide-slate-200/70 dark:divide-slate-800">
                            {day.exercises.map((ex, idx) => {
                              const isEditing = editingExerciseId === ex.id;
                              const lm = landmarks[ex.muscleId];
                              const targetSets = ex.weekSets[activeWeek] ?? 3;
                              const doneExSets = daySets.filter(
                                (s) => s.exerciseId === ex.id && s.completed
                              ).length;

                              return (
                                <div key={ex.id} className="py-2.5 first:pt-0 last:pb-0">
                                  {isEditing ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <input
                                        type="text"
                                        value={draftName}
                                        onChange={(e) => setDraftName(e.target.value)}
                                        className="flex-1 min-w-[150px] min-h-[38px] px-2.5 py-1 text-xs font-medium hl-input rounded-lg"
                                        aria-label="Exercise name"
                                      />
                                      <input
                                        type="text"
                                        value={draftRepRange}
                                        onChange={(e) => setDraftRepRange(e.target.value)}
                                        className="w-20 min-h-[38px] px-2 py-1 text-xs font-mono hl-input rounded-lg"
                                        placeholder="8-12"
                                        aria-label="Rep range"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleCommitEditScheduleExercise(day, ex.id)}
                                        className="no-touch-delay min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-sky-600 text-white"
                                        aria-label="Save exercise edit"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingExerciseId(null)}
                                        className="no-touch-delay min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg hl-subtle border text-slate-600 dark:text-slate-300"
                                        aria-label="Cancel exercise edit"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                          <span className="font-mono tabular-nums text-xs text-slate-400 dark:text-slate-500 mr-1.5">
                                            {idx + 1}.
                                          </span>
                                          {ex.name}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums truncate">
                                          {lm?.shortName} · {doneExSets}/{targetSets} sets ·{' '}
                                          {ex.repRange} reps
                                          {ex.restSeconds ? ` · ${ex.restSeconds}s` : ''}
                                          {ex.isSuperset ? ' · Superset' : ''}
                                        </p>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => handleStartEditScheduleExercise(ex)}
                                        className="no-touch-delay min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                                        title="Swap exercise name or rep range"
                                        aria-label={`Swap ${ex.name}`}
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setPickerTargetDayNumber(day.dayNumber);
                        setIsPickerOpen(true);
                      }}
                      className="no-touch-delay min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Movement from Library</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 0: WORKOUT CALENDAR & HISTORICAL LOGBOOK */}
      {subTab === 'calendar' && (
        <WorkoutCalendar
          setLogs={setLogs}
          workoutHistory={workoutHistory}
          plan={effectivePlan}
          templates={effectiveTemplates}
          exerciseLibrary={exerciseLibrary}
          landmarks={landmarks}
          nutritionByDate={nutritionByDate}
          weightUnit={weightUnit}
          streakDays={streakDays}
          bestStreakDays={bestStreakDays}
          activeStandaloneSession={activeStandaloneSession}
          onSaveHistoryRecord={onSaveHistoryRecord}
          onLogPastWorkout={onLogPastWorkout}
          onDeleteManualHistoryRecord={onDeleteManualHistoryRecord}
          onCreateCustomExercise={onCreateCustomExercise}
          onRepeatWorkout={onRepeatWorkout}
          onReturnToLiveTracker={onReturnToLiveTracker}
        />
      )}

      {/* TEMPLATE BUILDER / CUSTOMIZER MODAL */}
      {isEditorOpen && editorTemplate && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-editor-title"
        >
          <form
            onSubmit={handleSaveEditorTemplate}
            className="hl-card w-full max-w-4xl max-h-[92vh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl"
          >
            <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
              <div>
                <h2 id="template-editor-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  {editorTemplate.name ? `Edit Template: ${editorTemplate.name}` : 'Create Workout Template'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Configure exercises, target sets, rep ranges, and rest intervals
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="no-touch-delay min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close template editor"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {editorError && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-200">
                  {editorError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="sm:col-span-2 block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Routine Name *
                  </span>
                  <input
                    type="text"
                    required
                    value={editorTemplate.name}
                    onChange={(e) =>
                      setEditorTemplate({ ...editorTemplate, name: e.target.value })
                    }
                    placeholder="e.g. Upper Push & Lateral Delts"
                    className="mt-1 w-full min-h-[42px] px-3.5 py-2 text-sm font-medium hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Split Category
                  </span>
                  <select
                    value={editorTemplate.splitType}
                    onChange={(e) =>
                      setEditorTemplate({ ...editorTemplate, splitType: e.target.value })
                    }
                    className="mt-1 w-full min-h-[42px] px-3 py-2 text-xs font-semibold hl-input rounded-xl"
                  >
                    <option value="Full Body · 3x/Week">Full Body · 3x/Week</option>
                    <option value="Push-Pull-Legs">Push-Pull-Legs</option>
                    <option value="Upper / Lower · 4x/Week">Upper / Lower · 4x/Week</option>
                    <option value="Bodypart Specialization">Bodypart Specialization</option>
                    <option value="Custom Routine">Custom Routine</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Notes / Focus
                </span>
                <input
                  type="text"
                  value={editorTemplate.description}
                  onChange={(e) =>
                    setEditorTemplate({ ...editorTemplate, description: e.target.value })
                  }
                  placeholder="Optional goal or coaching notes for this routine..."
                  className="mt-1 w-full min-h-[40px] px-3.5 py-1.5 text-xs hl-input rounded-xl"
                />
              </label>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Movements ({editorTemplate.exercises.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setPickerTargetDayNumber(null);
                      setIsPickerOpen(true);
                    }}
                    className="no-touch-delay min-h-[40px] px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Movement from Library</span>
                  </button>
                </div>

                {editorTemplate.exercises.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-center space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No movements added yet. Browse the Movement Library to add exercises and
                      configure sets, reps, and rest times.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPickerTargetDayNumber(null);
                        setIsPickerOpen(true);
                      }}
                      className="no-touch-delay min-h-[38px] px-4 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Browse Movement Library</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {editorTemplate.exercises.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-3.5 hl-subtle border rounded-xl grid grid-cols-2 md:grid-cols-12 gap-3 items-center"
                      >
                        <div className="col-span-2 md:col-span-5 flex items-center gap-2 min-w-0">
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveEditorItem(idx, -1)}
                              className="no-touch-delay p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                              aria-label="Move exercise up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === editorTemplate.exercises.length - 1}
                              onClick={() => moveEditorItem(idx, 1)}
                              className="no-touch-delay p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                              aria-label="Move exercise down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {idx + 1}. {item.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Primary: {landmarks[item.primaryMuscle]?.shortName}
                            </p>
                          </div>
                        </div>

                        <div className="col-span-1 md:col-span-2">
                          <label className="block">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              Sets
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={15}
                              value={item.sets}
                              onChange={(e) =>
                                updateEditorItem(item.id, {
                                  sets: Math.max(1, Math.min(15, Number(e.target.value))),
                                })
                              }
                              className="mt-0.5 w-full min-h-[38px] px-2.5 py-1 text-xs font-mono tabular-nums font-semibold hl-input rounded-lg"
                            />
                          </label>
                        </div>

                        <div className="col-span-1 md:col-span-2">
                          <label className="block">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              Reps
                            </span>
                            <input
                              type="text"
                              value={item.reps}
                              onChange={(e) =>
                                updateEditorItem(item.id, { reps: e.target.value })
                              }
                              placeholder="8–12"
                              className="mt-0.5 w-full min-h-[38px] px-2.5 py-1 text-xs font-mono tabular-nums font-semibold hl-input rounded-lg"
                            />
                          </label>
                        </div>

                        <div className="col-span-1 md:col-span-2">
                          <label className="block">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              Rest (sec)
                            </span>
                            <input
                              type="number"
                              min={15}
                              max={360}
                              step={15}
                              value={item.restSeconds}
                              onChange={(e) =>
                                updateEditorItem(item.id, {
                                  restSeconds: Math.max(15, Number(e.target.value)),
                                })
                              }
                              className="mt-0.5 w-full min-h-[38px] px-2.5 py-1 text-xs font-mono tabular-nums font-semibold hl-input rounded-lg"
                            />
                          </label>
                        </div>

                        <div className="col-span-1 md:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeEditorItem(item.id)}
                            className="no-touch-delay min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-800 hl-subtle flex flex-wrap items-center justify-between gap-3 shrink-0">
              <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                Total: {editorTemplate.exercises.reduce((s, e) => s + e.sets, 0)} sets · Est.{' '}
                {estimateTemplateDurationMinutes(editorTemplate)} min
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="no-touch-delay min-h-[42px] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hl-card rounded-xl hover:opacity-80 whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="no-touch-delay min-h-[42px] px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Routine</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <ExercisePickerModal
        isOpen={isPickerOpen}
        onClose={() => {
          setIsPickerOpen(false);
          setPickerTargetDayNumber(null);
        }}
        exercises={exerciseLibrary}
        landmarks={landmarks}
        onSelectExercise={handlePickerSelect}
        onCreateCustomExercise={onCreateCustomExercise}
        alreadySelectedIds={
          pickerTargetDayNumber === null && editorTemplate
            ? editorTemplate.exercises.map((e) => e.libraryExerciseId)
            : []
        }
        title={
          pickerTargetDayNumber !== null
            ? `Add Exercise to Day ${pickerTargetDayNumber}`
            : 'Add Exercises to Template'
        }
      />

      <WorkoutHelpModal
        isOpen={Boolean(workoutHelpTarget)}
        target={workoutHelpTarget}
        exerciseLibrary={exerciseLibrary}
        landmarks={landmarks}
        onClose={() => setWorkoutHelpTarget(null)}
      />
    </div>
  );
});
Page3Workouts.displayName = 'Page3Workouts';

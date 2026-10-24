import React, { useEffect, useMemo, useState } from 'react';
import {
  ExercisePrescription,
  LibraryExercise,
  MuscleId,
  MuscleLandmark,
  SetLogEntry,
  TemplateExerciseItem,
  WorkoutDayPlan,
  WorkoutTemplate,
} from '../types/workout';
import {
  ATTACHED_CSV_PATH,
  MESOCYCLE_WEEKS,
  SHEET_INSTRUCTIONS,
} from '../data/rpPlanData';
import { ExercisePickerModal } from './ExercisePickerModal';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarPlus,
  Check,
  Copy,
  Edit3,
  FileSpreadsheet,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

interface Page3WorkoutsProps {
  activeWeek: number;
  onChangeWeek: (week: number) => void;
  plan: WorkoutDayPlan[];
  templates: WorkoutTemplate[];
  exerciseLibrary: LibraryExercise[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  setLogs: SetLogEntry[];
  onSaveDayPlan: (updatedDay: WorkoutDayPlan) => Promise<void>;
  onSaveTemplate: (template: WorkoutTemplate) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onAssignTemplateToDay: (template: WorkoutTemplate, dayNumber: number) => Promise<void>;
  onStartStandaloneTemplate: (template: WorkoutTemplate) => Promise<void>;
  onOpenDayInTracker: (dayNumber: number) => void;
}

export const Page3Workouts: React.FC<Page3WorkoutsProps> = ({
  activeWeek,
  onChangeWeek,
  plan,
  templates,
  exerciseLibrary,
  landmarks,
  setLogs,
  onSaveDayPlan,
  onSaveTemplate,
  onDeleteTemplate,
  onAssignTemplateToDay,
  onStartStandaloneTemplate,
  onOpenDayInTracker,
}) => {
  const [subTab, setSubTab] = useState<'templates' | 'schedule'>('templates');
  const [templateFilter, setTemplateFilter] = useState<'all' | 'Starter' | 'Custom'>('all');

  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>('');
  const [draftRepRange, setDraftRepRange] = useState<string>('');
  const [showRawSheet, setShowRawSheet] = useState<boolean>(false);
  const [rawCsvPreview, setRawCsvPreview] = useState<string>('');

  const [assignDayMap, setAssignDayMap] = useState<Record<string, number>>({});
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editorTemplate, setEditorTemplate] = useState<WorkoutTemplate | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [pickerTargetDayNumber, setPickerTargetDayNumber] = useState<number | null>(null);

  useEffect(() => {
    fetch(ATTACHED_CSV_PATH)
      .then((res) => (res.ok ? res.text() : ''))
      .then((txt) => setRawCsvPreview(txt))
      .catch(() => setRawCsvPreview(''));
  }, []);

  const filteredTemplates = useMemo(() => {
    if (templateFilter === 'all') return templates;
    return templates.filter((t) => t.category === templateFilter);
  }, [templates, templateFilter]);

  const showToast = (msg: string) => {
    setStatusBanner(msg);
    window.setTimeout(() => setStatusBanner(null), 3500);
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
      const targetDay = plan.find((d) => d.dayNumber === pickerTargetDayNumber);
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
    showToast(`Assigned "${tpl.name}" to Day ${dayNum} of your weekly schedule.`);
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
    <div className="space-y-6">
      {/* Header & Primary Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Workouts &amp; Templates
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Build custom templates, launch standalone sessions, or customize your 7-day schedule
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800/90"
            role="tablist"
            aria-label="Workouts section mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'templates'}
              onClick={() => setSubTab('templates')}
              className={`min-h-[40px] px-3.5 sm:px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'templates'
                  ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Templates ({templates.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'schedule'}
              onClick={() => setSubTab('schedule')}
              className={`min-h-[40px] px-3.5 sm:px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'schedule'
                  ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              7-Day Schedule
            </button>
          </div>

          {subTab === 'templates' && (
            <button
              type="button"
              onClick={handleOpenNewTemplate}
              className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Template
            </button>
          )}
        </div>
      </div>

      {statusBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusBanner}</span>
        </div>
      )}

      {/* SUB-TAB 1: WORKOUT TEMPLATES STUDIO */}
      {subTab === 'templates' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 hl-subtle border rounded-xl overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: 'All Templates' },
                  { id: 'Starter', label: 'Starter' },
                  { id: 'Custom', label: 'My Custom' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTemplateFilter(f.id)}
                  className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    templateFilter === f.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Start any template standalone or assign it to Days 1–7
            </p>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="hl-card rounded-2xl p-8 sm:p-10 text-center space-y-3">
              <p className="text-base font-bold text-slate-900 dark:text-white">
                No custom workout templates created yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Build a template from scratch with custom sets, rep ranges, and rest timers, or
                duplicate any starter routine.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleOpenNewTemplate}
                  className="min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Create First Custom Template
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {filteredTemplates.map((tpl) => {
                const totalSets = tpl.exercises.reduce((sum, e) => sum + e.sets, 0);
                const estMinutes = estimateTemplateDurationMinutes(tpl);
                const selectedAssignDay = assignDayMap[tpl.id] ?? 1;

                return (
                  <div
                    key={tpl.id}
                    className="hl-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3.5">
                      <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            {tpl.category} · {tpl.splitType} · {totalSets} sets · ~{estMinutes} min
                          </p>
                          <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                            {tpl.name}
                          </h2>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                            {tpl.description}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditTemplate(tpl)}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Customize template"
                            aria-label={`Customize ${tpl.name}`}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateTemplate(tpl)}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Duplicate template"
                            aria-label={`Duplicate ${tpl.name}`}
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          {confirmDeleteId === tpl.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteTemplate(tpl.id);
                                setConfirmDeleteId(null);
                                showToast(`Deleted template "${tpl.name}"`);
                              }}
                              className="min-h-[38px] px-2.5 py-1 text-[11px] font-bold bg-red-600 text-white rounded-lg"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(tpl.id)}
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                              title="Delete template"
                              aria-label={`Delete ${tpl.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

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
                              <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">
                                {' '}
                                ·{' '}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {landmarks[item.primaryMuscle]?.shortName}
                              </span>
                            </div>

                            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap shrink-0">
                              {item.sets} × {item.reps} · {item.restSeconds}s
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => onStartStandaloneTemplate(tpl)}
                        className="min-h-[42px] px-4 py-2 bg-slate-900 dark:bg-blue-600 hover:opacity-90 text-white text-xs font-semibold rounded-xl transition-opacity flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Start Standalone
                      </button>

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
                          className="flex-1 sm:flex-none min-h-[42px] px-2.5 py-1.5 text-xs font-medium hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                          className="min-h-[42px] px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          Assign to Day
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: 7-DAY MESOCYCLE SCHEDULE */}
      {subTab === 'schedule' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800/90 overflow-x-auto no-scrollbar">
              {MESOCYCLE_WEEKS.map((w) => (
                <button
                  key={w.week}
                  type="button"
                  onClick={() => onChangeWeek(w.week)}
                  className={`min-h-[38px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    activeWeek === w.week
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {w.week === 5 ? 'Deload' : `Wk ${w.week}`}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowRawSheet((v) => !v)}
              className="min-h-[40px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hl-card hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {showRawSheet ? 'Hide Attached CSV' : 'Inspect Attached Sheet'}
            </button>
          </div>

          <div className="hl-card rounded-2xl p-4 sm:p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Mesocycle Progression Guidelines
            </h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
              {SHEET_INSTRUCTIONS.map((inst, i) => (
                <li key={i}>{inst}</li>
              ))}
            </ul>

            {showRawSheet && rawCsvPreview && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {plan.map((day) => {
              const daySets = setLogs.filter(
                (s) => s.week === activeWeek && s.dayNumber === day.dayNumber
              );
              const completedSets = daySets.filter((s) => s.completed).length;

              return (
                <div
                  key={day.dayNumber}
                  className="hl-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          Week {activeWeek} ·{' '}
                          {day.isRestDay
                            ? 'Active Recovery'
                            : `${completedSets}/${daySets.length} sets logged`}
                        </p>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                          {day.title}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {day.focusSummary}
                        </p>
                      </div>

                      {!day.isRestDay && (
                        <button
                          type="button"
                          onClick={() => onOpenDayInTracker(day.dayNumber)}
                          className="min-h-[42px] px-3.5 py-2 bg-slate-900 dark:bg-blue-600 hover:opacity-90 text-white text-xs font-semibold rounded-xl transition-opacity flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          Track Day {day.dayNumber}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {day.isRestDay ? (
                      <p className="text-xs text-slate-600 dark:text-slate-300 py-4 leading-relaxed">
                        No resistance training scheduled. You can keep this as recovery or assign a
                        template to Day {day.dayNumber} from the Workout Templates tab.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
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
                                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-blue-600 text-white"
                                    aria-label="Save exercise edit"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingExerciseId(null)}
                                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg hl-subtle border text-slate-600 dark:text-slate-300"
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
                                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
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

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setPickerTargetDayNumber(day.dayNumber);
                        setIsPickerOpen(true);
                      }}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Exercise from Library
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close template editor"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {editorError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300">
                  {editorError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="sm:col-span-2 block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Template Name *
                  </span>
                  <input
                    type="text"
                    required
                    value={editorTemplate.name}
                    onChange={(e) =>
                      setEditorTemplate({ ...editorTemplate, name: e.target.value })
                    }
                    placeholder="e.g. Upper Push & Lateral Delts"
                    className="mt-1 w-full min-h-[42px] px-3.5 py-2 text-sm font-medium hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                  placeholder="Optional goal or coaching notes for this template..."
                  className="mt-1 w-full min-h-[40px] px-3.5 py-1.5 text-xs hl-input rounded-xl"
                />
              </label>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Template Exercises ({editorTemplate.exercises.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setPickerTargetDayNumber(null);
                      setIsPickerOpen(true);
                    }}
                    className="min-h-[40px] px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Exercise from Library
                  </button>
                </div>

                {editorTemplate.exercises.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-center space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No exercises added yet. Browse the Exercise Library to add movements and
                      configure sets, reps, and rest times.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPickerTargetDayNumber(null);
                        setIsPickerOpen(true);
                      }}
                      className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Browse Exercise Library
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
                              className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                              aria-label="Move exercise up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === editorTemplate.exercises.length - 1}
                              onClick={() => moveEditorItem(idx, 1)}
                              className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
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
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
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
                  className="min-h-[42px] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hl-card rounded-xl hover:opacity-80"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Save Template
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
    </div>
  );
};

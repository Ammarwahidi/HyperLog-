import React, { useEffect, useMemo, useState } from 'react';
import {
  ActiveStandaloneSession,
  DailyNutritionRecord,
  LibraryExercise,
  MuscleId,
  MuscleLandmark,
  SetLogEntry,
  WorkoutDayPlan,
  WorkoutHistoryRecord,
  WorkoutTemplate,
} from '../types/workout';
import {
  convertDisplayWeight,
  deriveFullWorkoutHistory,
  downloadBlobFile,
  exportWorkoutRecordsToCSV,
  formatDateWorkoutsShareText,
  formatHumanDateLong,
  formatHumanDateShort,
  formatLocalDateISO,
  generateDateWorkoutPdfBlob,
  generateWorkoutSummaryPngBlob,
  shareOrDownloadPdfBlob,
} from '../utils/workoutHistory';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Dumbbell,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Play,
  Plus,
  Search,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { ExercisePickerModal } from './ExercisePickerModal';

export interface PastWorkoutExerciseDraft {
  exerciseId: string;
  exerciseName: string;
  muscleId: MuscleId;
  setsCount: number;
  weightKg: number;
  reps: number;
  rir: number;
  rpe?: number;
}

export interface WorkoutCalendarProps {
  initialSelectedDateIso?: string;
  openPopupInitially?: boolean;
  onPopupConsumed?: () => void;
  onSelectDateIso?: (iso: string) => void;
  setLogs: SetLogEntry[];
  workoutHistory: WorkoutHistoryRecord[];
  plan: WorkoutDayPlan[];
  templates: WorkoutTemplate[];
  exerciseLibrary: LibraryExercise[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  nutritionByDate: Record<string, DailyNutritionRecord>;
  weightUnit: 'kg' | 'lb';
  streakDays?: number;
  bestStreakDays?: number;
  activeStandaloneSession?: ActiveStandaloneSession | null;
  onSaveHistoryRecord: (record: WorkoutHistoryRecord) => Promise<void>;
  onLogPastWorkout: (params: {
    dateIso: string;
    title: string;
    durationMinutes?: number;
    notes?: string;
    exercises: PastWorkoutExerciseDraft[];
  }) => Promise<void>;
  onDeleteManualHistoryRecord?: (recordId: string) => Promise<void>;
  onCreateCustomExercise?: (exercise: LibraryExercise) => Promise<void> | void;
  onReturnToLiveTracker?: () => void;
  onRepeatWorkout?: (session: WorkoutHistoryRecord) => void;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseRepDefault(repRange: string): number {
  const m = repRange.match(/\d+/);
  return m ? Math.max(1, Number(m[0])) : 10;
}

export const WorkoutCalendar: React.FC<WorkoutCalendarProps> = ({
  initialSelectedDateIso,
  openPopupInitially = false,
  onPopupConsumed,
  onSelectDateIso,
  setLogs,
  workoutHistory,
  plan,
  templates,
  exerciseLibrary,
  landmarks,
  nutritionByDate,
  weightUnit,
  activeStandaloneSession,
  onSaveHistoryRecord,
  onLogPastWorkout,
  onDeleteManualHistoryRecord,
  onCreateCustomExercise,
  onReturnToLiveTracker,
  onRepeatWorkout,
}) => {
  const todayIso = useMemo(() => formatLocalDateISO(new Date()), []);

  const derivedHistory = useMemo(
    () =>
      deriveFullWorkoutHistory({
        setLogs,
        persistedHistory: workoutHistory,
        plan,
        landmarks,
        activeStandaloneSession,
      }),
    [setLogs, workoutHistory, plan, landmarks, activeStandaloneSession]
  );

  // Default to initialSelectedDateIso if provided, otherwise today if today has a workout, otherwise most recent workout date or today
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => {
    if (initialSelectedDateIso) return initialSelectedDateIso;
    if (derivedHistory.byDate[todayIso]?.length) return todayIso;
    return derivedHistory.allRecords[0]?.date ?? todayIso;
  });

  useEffect(() => {
    if (initialSelectedDateIso) {
      setSelectedDateIso(initialSelectedDateIso);
      const [y, m] = initialSelectedDateIso.split('-').map(Number);
      if (y && m) {
        setViewYear(y);
        setViewMonth(m - 1);
      }
    }
  }, [initialSelectedDateIso]);

  const initialParsed = useMemo(() => {
    const [y, m] = selectedDateIso.split('-').map(Number);
    const fallback = new Date();
    return {
      year: y || fallback.getFullYear(),
      month: m ? m - 1 : fallback.getMonth(),
    };
  }, [selectedDateIso]);

  const [viewYear, setViewYear] = useState<number>(initialParsed.year);
  const [viewMonth, setViewMonth] = useState<number>(initialParsed.month);
  const [isDayPopupOpen, setIsDayPopupOpen] = useState<boolean>(Boolean(openPopupInitially));

  useEffect(() => {
    if (openPopupInitially) {
      setIsDayPopupOpen(true);
      onPopupConsumed?.();
    }
  }, [openPopupInitially, onPopupConsumed]);

  // Share UI states
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [copiedTextState, setCopiedTextState] = useState<boolean>(false);
  const [generatingPng, setGeneratingPng] = useState<boolean>(false);
  const [generatingPdf, setGeneratingPdf] = useState<boolean>(false);

  // Notes & Duration editor state per session id
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [draftDuration, setDraftDuration] = useState<string>('');
  const [draftNotes, setDraftNotes] = useState<string>('');
  const [savedNotesBanner, setSavedNotesBanner] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Log Past Workout modal/drawer state
  const [isLogPastOpen, setIsLogPastOpen] = useState<boolean>(false);
  const [pastPresetSource, setPastPresetSource] = useState<string>('plan_1');
  const [pastTitle, setPastTitle] = useState<string>('');
  const [pastDuration, setPastDuration] = useState<string>('55');
  const [pastNotes, setPastNotes] = useState<string>('');
  const [pastExercises, setPastExercises] = useState<PastWorkoutExerciseDraft[]>([]);
  const [isManualExercisePickerOpen, setIsManualExercisePickerOpen] = useState<boolean>(false);

  const handleChooseDate = (iso: string, openPopup = true) => {
    setSelectedDateIso(iso);
    setIsShareOpen(false);
    setConfirmDeleteId(null);
    setEditingNotesId(null);
    const [y, m] = iso.split('-').map(Number);
    if (y && m && (y !== viewYear || m - 1 !== viewMonth)) {
      setViewYear(y);
      setViewMonth(m - 1);
    }
    if (openPopup) {
      setIsDayPopupOpen(true);
    }
    onSelectDateIso?.(iso);
  };

  const handleStepSelectedDay = (deltaDays: number) => {
    const [y, m, d] = selectedDateIso.split('-').map(Number);
    if (!y || !m || !d) return;
    const dt = new Date(y, m - 1, d + deltaDays);
    handleChooseDate(formatLocalDateISO(dt), true);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleJumpToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    handleChooseDate(todayIso, true);
  };

  // Build calendar grid cells for viewYear & viewMonth
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstOfMonth.getDay(); // 0=Sun..6=Sat
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: Array<{
      iso: string | null;
      dayNum: number | null;
      sessions: WorkoutHistoryRecord[];
      totalSets: number;
      hasNutrition: boolean;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    for (let i = 0; i < startWeekday; i++) {
      cells.push({
        iso: null,
        dayNum: null,
        sessions: [],
        totalSets: 0,
        hasNutrition: false,
        isToday: false,
        isSelected: false,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(viewMonth + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const iso = `${viewYear}-${mStr}-${dStr}`;
      const sessions = derivedHistory.byDate[iso] ?? [];
      const totalSets = sessions.reduce((sum, s) => sum + s.totalSets, 0);
      const nutRec = nutritionByDate[iso];
      const hasNutrition = Boolean(nutRec && nutRec.meals && nutRec.meals.length > 0);

      cells.push({
        iso,
        dayNum: d,
        sessions,
        totalSets,
        hasNutrition,
        isToday: iso === todayIso,
        isSelected: iso === selectedDateIso,
      });
    }

    return cells;
  }, [viewYear, viewMonth, derivedHistory.byDate, nutritionByDate, todayIso, selectedDateIso]);

  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-`;
  const monthStats = useMemo(() => {
    let workoutDays = 0;
    let sets = 0;
    let tonnageKg = 0;
    for (const [iso, list] of Object.entries(derivedHistory.byDate)) {
      if (iso.startsWith(monthPrefix) && list.length > 0) {
        workoutDays += 1;
        for (const s of list) {
          sets += s.totalSets;
          tonnageKg += s.totalTonnageKg;
        }
      }
    }
    return { workoutDays, sets, tonnageKg };
  }, [derivedHistory.byDate, monthPrefix]);

  const monthHeading = useMemo(() => {
    const dt = new Date(viewYear, viewMonth, 1);
    return dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [viewYear, viewMonth]);

  const selectedSessions = derivedHistory.byDate[selectedDateIso] ?? [];
  const selectedNutrition = nutritionByDate[selectedDateIso];

  const formattedShareText = useMemo(
    () =>
      formatDateWorkoutsShareText({
        dateIso: selectedDateIso,
        sessions: selectedSessions,
        landmarks,
        weightUnit,
        nutritionRecord: selectedNutrition,
      }),
    [selectedDateIso, selectedSessions, landmarks, weightUnit, selectedNutrition]
  );

  const triggerTemporaryShareFeedback = (msg: string) => {
    setShareFeedback(msg);
    window.setTimeout(() => setShareFeedback(null), 4000);
  };

  const handleCopyWorkoutText = async () => {
    try {
      await navigator.clipboard.writeText(formattedShareText);
      setCopiedTextState(true);
      triggerTemporaryShareFeedback('Copied workout summary to clipboard.');
      window.setTimeout(() => setCopiedTextState(false), 3000);
    } catch {
      triggerTemporaryShareFeedback('Clipboard restricted — select the summary text below to copy.');
    }
  };

  const handleShareDatePdf = async () => {
    if (generatingPdf || selectedSessions.length === 0) return;
    setGeneratingPdf(true);
    try {
      const pdfBlob = generateDateWorkoutPdfBlob({
        dateIso: selectedDateIso,
        sessions: selectedSessions,
        landmarks,
        weightUnit,
        nutritionRecord: selectedNutrition,
      });
      const filename = `hyperlog-workout-${selectedDateIso}.pdf`;
      const outcome = await shareOrDownloadPdfBlob({
        blob: pdfBlob,
        filename,
        title: `HyperLog Workout PDF · ${formatHumanDateShort(selectedDateIso)}`,
        text: `Workout report for ${formatHumanDateLong(selectedDateIso)}`,
      });
      if (outcome === 'shared') {
        triggerTemporaryShareFeedback(`Shared ${filename}`);
        setSavedNotesBanner(`Shared ${filename}`);
        window.setTimeout(() => setSavedNotesBanner(null), 3500);
      } else if (outcome === 'downloaded') {
        triggerTemporaryShareFeedback(`Downloaded ${filename} ready to share.`);
        setSavedNotesBanner(`Downloaded ${filename}`);
        window.setTimeout(() => setSavedNotesBanner(null), 3500);
      }
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadDatePdf = () => {
    if (generatingPdf || selectedSessions.length === 0) return;
    setGeneratingPdf(true);
    try {
      const pdfBlob = generateDateWorkoutPdfBlob({
        dateIso: selectedDateIso,
        sessions: selectedSessions,
        landmarks,
        weightUnit,
        nutritionRecord: selectedNutrition,
      });
      const filename = `hyperlog-workout-${selectedDateIso}.pdf`;
      downloadBlobFile(pdfBlob, filename);
      triggerTemporaryShareFeedback(`Downloaded ${filename}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadPngCard = async () => {
    if (generatingPng || selectedSessions.length === 0) return;
    setGeneratingPng(true);
    try {
      const blob = await generateWorkoutSummaryPngBlob({
        dateIso: selectedDateIso,
        sessions: selectedSessions,
        landmarks,
        weightUnit,
      });
      if (!blob) {
        triggerTemporaryShareFeedback('Unable to render workout image card.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hyperlog-workout-${selectedDateIso}.png`;
      a.click();
      URL.revokeObjectURL(url);
      triggerTemporaryShareFeedback(`Downloaded hyperlog-workout-${selectedDateIso}.png`);
    } finally {
      setGeneratingPng(false);
    }
  };

  const handleDownloadCsv = (records: WorkoutHistoryRecord[], filename: string) => {
    const csv = exportWorkoutRecordsToCSV(records, landmarks, weightUnit);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    triggerTemporaryShareFeedback(`Exported ${filename}`);
  };

  const openNotesEditor = (session: WorkoutHistoryRecord) => {
    setEditingNotesId(session.id);
    setDraftDuration(session.durationMinutes ? String(session.durationMinutes) : '');
    setDraftNotes(session.notes ?? '');
  };

  const handleSaveSessionMeta = async (session: WorkoutHistoryRecord) => {
    const parsedDur = Number(draftDuration);
    const updated: WorkoutHistoryRecord = {
      ...session,
      durationMinutes:
        draftDuration.trim() !== '' && !Number.isNaN(parsedDur) && parsedDur > 0
          ? Math.min(480, Math.round(parsedDur))
          : undefined,
      notes: draftNotes.trim() || undefined,
    };
    await onSaveHistoryRecord(updated);
    setEditingNotesId(null);
    setSavedNotesBanner('Saved workout notes & duration.');
    window.setTimeout(() => setSavedNotesBanner(null), 3000);
  };

  const applyPresetToPastDraft = (sourceKey: string) => {
    setPastPresetSource(sourceKey);
    if (sourceKey.startsWith('plan_')) {
      const dayNum = Number(sourceKey.replace('plan_', ''));
      const foundDay = plan.find((d) => d.dayNumber === dayNum && !d.isRestDay);
      if (foundDay) {
        setPastTitle(foundDay.title);
        setPastExercises(
          foundDay.exercises.map((ex) => ({
            exerciseId: ex.libraryExerciseId ?? ex.id,
            exerciseName: ex.name,
            muscleId: ex.muscleId,
            setsCount: ex.weekSets[3] ?? 3,
            weightKg: ex.defaultWeightKg,
            reps: parseRepDefault(ex.repRange),
            rir: 2,
            rpe: 8,
          }))
        );
        return;
      }
    }
    if (sourceKey.startsWith('tpl_')) {
      const tplId = sourceKey.replace('tpl_', '');
      const tpl = templates.find((t) => t.id === tplId);
      if (tpl) {
        setPastTitle(tpl.name);
        setPastExercises(
          tpl.exercises.map((item) => ({
            exerciseId: item.libraryExerciseId,
            exerciseName: item.name,
            muscleId: item.primaryMuscle,
            setsCount: item.sets,
            weightKg: item.defaultWeightKg,
            reps: parseRepDefault(item.reps),
            rir: 2,
            rpe: 8,
          }))
        );
        return;
      }
    }
    // Custom blank
    const firstLib = exerciseLibrary[0];
    setPastTitle('Custom Strength Session');
    setPastExercises(
      firstLib
        ? [
            {
              exerciseId: firstLib.id,
              exerciseName: firstLib.name,
              muscleId: firstLib.primaryMuscle,
              setsCount: 3,
              weightKg: firstLib.defaultWeightKg,
              reps: parseRepDefault(firstLib.defaultRepRange),
              rir: 2,
              rpe: 8,
            },
          ]
        : []
    );
  };

  const handleOpenLogPastDrawer = () => {
    const firstActiveDay = plan.find((d) => !d.isRestDay);
    const defaultKey = firstActiveDay ? `plan_${firstActiveDay.dayNumber}` : 'custom';
    applyPresetToPastDraft(defaultKey);
    setPastDuration('55');
    setPastNotes('');
    setIsLogPastOpen(true);
  };

  const handlePickExerciseForPastDraft = (lib: LibraryExercise) => {
    setPastExercises((prev) => [
      ...prev,
      {
        exerciseId: lib.id,
        exerciseName: lib.name,
        muscleId: lib.primaryMuscle,
        setsCount: 3,
        weightKg: lib.defaultWeightKg,
        reps: parseRepDefault(lib.defaultRepRange),
        rir: 2,
        rpe: 8,
      },
    ]);
  };

  const handleSubmitPastWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pastExercises.length === 0) return;
    const durNum = Number(pastDuration);
    await onLogPastWorkout({
      dateIso: selectedDateIso,
      title: pastTitle.trim() || 'Logged Workout',
      durationMinutes: !Number.isNaN(durNum) && durNum > 0 ? Math.round(durNum) : undefined,
      notes: pastNotes.trim() || undefined,
      exercises: pastExercises,
    });
    setIsLogPastOpen(false);
    setSavedNotesBanner(`Logged workout on ${formatHumanDateShort(selectedDateIso)}.`);
    window.setTimeout(() => setSavedNotesBanner(null), 3500);
  };

  const formatVolume = (tonnageKg: number): string => {
    if (weightUnit === 'kg') {
      return `${Math.round(tonnageKg).toLocaleString()} kg`;
    }
    return `${Math.round(tonnageKg * 2.20462).toLocaleString()} lb`;
  };

  const selectedDayTotals = useMemo(() => {
    let sets = 0;
    let reps = 0;
    let tonnageKg = 0;
    let durationMin = 0;
    for (const s of selectedSessions) {
      sets += s.totalSets;
      reps += s.totalReps;
      tonnageKg += s.totalTonnageKg;
      durationMin += s.durationMinutes ?? 0;
    }
    const mealCalories = selectedNutrition?.meals?.reduce((acc, m) => acc + m.calories, 0) ?? 0;
    const mealProteinG = selectedNutrition?.meals?.reduce((acc, m) => acc + m.proteinG, 0) ?? 0;
    const mealCarbsG = selectedNutrition?.meals?.reduce((acc, m) => acc + m.carbsG, 0) ?? 0;
    const mealFatG = selectedNutrition?.meals?.reduce((acc, m) => acc + m.fatG, 0) ?? 0;
    return {
      sets,
      reps,
      tonnageKg,
      durationMin,
      mealCalories,
      mealProteinG,
      mealCarbsG,
      mealFatG,
    };
  }, [selectedSessions, selectedNutrition]);

  return (
    <div className="space-y-5" data-testid="simplified-workout-calendar">
      {/* Simplified Full-Width Monthly Calendar Card */}
      <div className="hl-card rounded-2xl p-4 sm:p-6 space-y-4">
        {/* Month Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              {monthHeading}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              {monthStats.workoutDays} workout days · {monthStats.sets} sets ·{' '}
              {formatVolume(monthStats.tonnageKg)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsDayPopupOpen(true);
                handleOpenLogPastDrawer();
              }}
              className="min-h-[40px] px-3 py-2 rounded-xl hl-subtle border text-slate-800 dark:text-slate-100 hover:border-blue-500 text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Log Past Workout</span>
            </button>

            {onReturnToLiveTracker && (
              <button
                type="button"
                onClick={onReturnToLiveTracker}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap mr-0.5"
              >
                <Dumbbell className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Start Workout</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrevMonth}
              className="min-h-[40px] min-w-[40px] rounded-xl hl-subtle border flex items-center justify-center text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleJumpToday}
              className="min-h-[40px] px-3 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500 transition-colors whitespace-nowrap"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="min-h-[40px] min-w-[40px] rounded-xl hl-subtle border flex items-center justify-center text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Weekday Header */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center">
          {WEEKDAY_LABELS.map((day) => (
            <div
              key={day}
              className="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 py-1"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Simplified Day Grid — Clicking ANY Date Opens Pop-Up Modal */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {calendarDays.map((cell, idx) => {
            if (!cell.iso || cell.dayNum === null) {
              return (
                <div
                  key={`empty_${idx}`}
                  className="min-h-[56px] sm:min-h-[76px] rounded-xl opacity-30"
                  aria-hidden="true"
                />
              );
            }

            const hasWorkout = cell.totalSets > 0;
            let cellClasses =
              'hl-subtle border border-transparent text-slate-700 dark:text-slate-300 hover:border-blue-500/70 dark:hover:border-blue-400/70';

            if (cell.isSelected && hasWorkout) {
              cellClasses =
                'bg-emerald-600 dark:bg-emerald-600 text-white border border-emerald-700 dark:border-emerald-400 shadow-sm';
            } else if (cell.isSelected) {
              cellClasses =
                'bg-slate-900 dark:bg-blue-600 text-white border border-slate-900 dark:border-blue-400 shadow-sm';
            } else if (hasWorkout) {
              cellClasses =
                'bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/50 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/25';
            } else if (cell.isToday) {
              cellClasses =
                'hl-subtle border border-blue-500 dark:border-blue-400 text-slate-900 dark:text-white';
            }

            return (
              <button
                key={cell.iso}
                type="button"
                data-testid={`calendar-day-${cell.iso}`}
                onClick={() => handleChooseDate(cell.iso!, true)}
                aria-label={`${formatHumanDateLong(cell.iso)}${
                  hasWorkout ? `, ${cell.totalSets} sets completed` : ', tap to view day details'
                }`}
                aria-pressed={cell.isSelected && isDayPopupOpen}
                className={`min-h-[56px] sm:min-h-[76px] p-1.5 sm:p-2.5 rounded-xl flex flex-col justify-between items-start text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${cellClasses}`}
              >
                <div className="w-full flex items-center justify-between gap-1">
                  <span className="font-mono tabular-nums text-xs sm:text-sm font-bold leading-none">
                    {cell.dayNum}
                  </span>
                  {hasWorkout && (
                    <Check
                      className={`w-3.5 h-3.5 shrink-0 ${
                        cell.isSelected ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                      strokeWidth={2.6}
                    />
                  )}
                </div>

                <div className="w-full mt-auto">
                  {hasWorkout ? (
                    <span
                      className={`block font-mono tabular-nums text-[10px] sm:text-xs font-semibold truncate ${
                        cell.isSelected
                          ? 'text-emerald-50'
                          : 'text-emerald-800 dark:text-emerald-300'
                      }`}
                    >
                      <span className="sm:hidden">{cell.totalSets}s</span>
                      <span className="hidden sm:inline">{cell.totalSets} sets</span>
                    </span>
                  ) : cell.isToday ? (
                    <span
                      className={`block text-[10px] sm:text-[11px] font-semibold truncate ${
                        cell.isSelected
                          ? 'text-slate-200 dark:text-blue-100'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      Today
                    </span>
                  ) : cell.hasNutrition ? (
                    <span
                      className={`block text-[10px] sm:text-[11px] truncate ${
                        cell.isSelected ? 'text-slate-300' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      Meals
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        {/* Clean Unboxed Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
              <Check className="w-3.5 h-3.5" />
              <span>Workout Logged</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>Tap any date to open a pop-up with full workout, nutrition, and PDF export details</span>
          </div>
          <button
            type="button"
            onClick={() => setIsDayPopupOpen(true)}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
          >
            Inspect {formatHumanDateShort(selectedDateIso)} →
          </button>
        </div>
      </div>

      {/* Compact Recent Logged Sessions List (Quick-Open Pop-Up) */}
      {derivedHistory.allRecords.length > 0 && (
        <div className="hl-card rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Recent Logged Workouts
            </h4>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Tap to open Day Pop-Up
            </span>
          </div>
          <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
            {derivedHistory.allRecords.slice(0, 5).map((rec) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => handleChooseDate(rec.date, true)}
                className="w-full py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity"
              >
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                    {rec.title}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {formatHumanDateShort(rec.date)} · {rec.exercises.length} exercises
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums shrink-0">
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    {rec.totalSets} sets
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatVolume(rec.totalTonnageKg)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CALENDAR DAY POP-UP MODAL: Opens When Any Date Is Clicked */}
      {isDayPopupOpen && (
        <div
          className="fixed inset-0 z-[45] bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          data-testid="calendar-day-popup-modal"
          aria-labelledby="calendar-popup-date-heading"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsDayPopupOpen(false);
            }
          }}
        >
          <div className="hl-card w-full max-w-2xl max-h-[88vh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            {/* Pop-Up Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-mono tabular-nums">
                    <CalendarIcon className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span>{selectedDateIso === todayIso ? `Today · ${selectedDateIso}` : selectedDateIso}</span>
                  </div>
                  <h3
                    id="calendar-popup-date-heading"
                    className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5"
                  >
                    {formatHumanDateLong(selectedDateIso)}
                  </h3>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStepSelectedDay(-1)}
                    className="min-h-[38px] min-w-[38px] rounded-xl hl-subtle border flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-slate-400"
                    aria-label="Previous day"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStepSelectedDay(1)}
                    className="min-h-[38px] min-w-[38px] rounded-xl hl-subtle border flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-slate-400"
                    aria-label="Next day"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    data-testid="close-calendar-popup-btn"
                    onClick={() => setIsDayPopupOpen(false)}
                    className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 ml-1"
                    aria-label="Close day summary pop-up"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Action Toolbar inside Pop-Up */}
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedSessions.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleShareDatePdf}
                      disabled={generatingPdf}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{generatingPdf ? 'Preparing…' : 'Share PDF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadDatePdf}
                      disabled={generatingPdf}
                      className="min-h-[40px] px-3 py-2 rounded-xl hl-subtle border text-slate-700 dark:text-slate-200 hover:border-blue-500 text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Save PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsShareOpen((v) => !v)}
                      className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1 whitespace-nowrap ${
                        isShareOpen
                          ? 'bg-slate-900 dark:bg-slate-700 text-white border-slate-900 dark:border-slate-600'
                          : 'hl-subtle text-slate-700 dark:text-slate-200 hover:border-blue-500'
                      }`}
                    >
                      <span>{isShareOpen ? 'Close Formats' : 'Formats'}</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (isLogPastOpen) {
                      setIsLogPastOpen(false);
                    } else {
                      handleOpenLogPastDrawer();
                    }
                  }}
                  className="min-h-[40px] px-3 py-2 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500 transition-colors flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isLogPastOpen ? 'Cancel Log' : 'Log Workout'}</span>
                </button>
              </div>
            </div>

            {/* Scrollable Pop-Up Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {savedNotesBanner && (
                <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-xs font-medium text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{savedNotesBanner}</span>
                </div>
              )}

              {/* Day Overview KPI Strip */}
              {(selectedSessions.length > 0 ||
                (selectedNutrition &&
                  (selectedNutrition.meals.length > 0 || selectedNutrition.bodyweightKg > 0))) && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl hl-subtle border">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Sets Logged
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {selectedDayTotals.sets} sets
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {selectedDayTotals.reps} total reps
                    </div>
                  </div>

                  <div className="p-3 rounded-xl hl-subtle border">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Session Volume
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatVolume(selectedDayTotals.tonnageKg)}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {selectedDayTotals.durationMin > 0
                        ? `${selectedDayTotals.durationMin} min`
                        : `${selectedSessions.length} session${selectedSessions.length === 1 ? '' : 's'}`}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl hl-subtle border">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Calories &amp; Protein
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {selectedDayTotals.mealCalories > 0
                        ? `${selectedDayTotals.mealCalories.toLocaleString()} kcal`
                        : '—'}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {selectedDayTotals.mealProteinG > 0
                        ? `${Math.round(selectedDayTotals.mealProteinG)}g protein`
                        : 'No meals logged'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl hl-subtle border">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Bodyweight
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-0.5">
                      {selectedNutrition?.bodyweightKg
                        ? `${convertDisplayWeight(selectedNutrition.bodyweightKg, weightUnit)} ${weightUnit}`
                        : '—'}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {selectedNutrition?.stepsCount
                        ? `${selectedNutrition.stepsCount.toLocaleString()} steps`
                        : 'Scale record'}
                    </div>
                  </div>
                </div>
              )}

              {/* Single-Day Share Workout Data Panel (PDF-First) */}
              {isShareOpen && selectedSessions.length > 0 && (
                <div className="p-3.5 rounded-xl hl-subtle border space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Share {formatHumanDateShort(selectedDateIso)} Workout
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      This day only · PDF, Text, PNG, CSV
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleShareDatePdf}
                      disabled={generatingPdf}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{generatingPdf ? 'Generating PDF…' : 'Share Workout PDF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadDatePdf}
                      disabled={generatingPdf}
                      className="min-h-[42px] px-3 py-2 rounded-xl hl-card border border-blue-400/60 dark:border-blue-500/50 text-xs font-semibold text-slate-900 dark:text-white hover:border-blue-500 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Download PDF (.PDF)</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleCopyWorkoutText}
                      className="min-h-[40px] px-2.5 py-1.5 rounded-xl hl-card border text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-blue-500 transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                    >
                      {copiedTextState ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Text</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadPngCard}
                      disabled={generatingPng}
                      className="min-h-[40px] px-2.5 py-1.5 rounded-xl hl-card border text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-blue-500 transition-colors flex items-center justify-center gap-1 whitespace-nowrap disabled:opacity-60"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                      <span>{generatingPng ? 'Wait…' : 'Card (.PNG)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadCsv(
                          selectedSessions,
                          `hyperlog-workout-${selectedDateIso}.csv`
                        )
                      }
                      className="min-h-[40px] px-2.5 py-1.5 rounded-xl hl-card border text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-blue-500 transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                      <span>CSV</span>
                    </button>
                  </div>

                  {shareFeedback && (
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                      {shareFeedback}
                    </p>
                  )}

                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Report Preview
                    </div>
                    <pre className="max-h-40 overflow-y-auto p-2.5 rounded-lg hl-card border text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {formattedShareText}
                    </pre>
                  </div>
                </div>
              )}

              {/* Inline Log Past / Custom Workout Form */}
              {isLogPastOpen && (
                <form
                  onSubmit={handleSubmitPastWorkout}
                  className="p-3.5 rounded-xl hl-subtle border space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Log Workout for {formatHumanDateShort(selectedDateIso)}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsLogPastOpen(false)}
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      aria-label="Close workout logger"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Load From Routine</span>
                      <select
                        value={pastPresetSource}
                        onChange={(e) => applyPresetToPastDraft(e.target.value)}
                        className="mt-1 w-full min-h-[38px] px-2.5 py-1.5 text-xs hl-input rounded-lg"
                      >
                        <optgroup label="7-Day Split Routines">
                          {plan
                            .filter((d) => !d.isRestDay)
                            .map((d) => (
                              <option key={`plan_${d.dayNumber}`} value={`plan_${d.dayNumber}`}>
                                {d.title}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Workout Templates">
                          {templates.map((t) => (
                            <option key={`tpl_${t.id}`} value={`tpl_${t.id}`}>
                              {t.name}
                            </option>
                          ))}
                        </optgroup>
                        <option value="custom">Custom Session</option>
                      </select>
                    </label>

                    <label className="block text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Duration (min)</span>
                      <input
                        type="number"
                        min={5}
                        max={360}
                        value={pastDuration}
                        onChange={(e) => setPastDuration(e.target.value)}
                        className="mt-1 w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono tabular-nums hl-input rounded-lg"
                      />
                    </label>
                  </div>

                  <label className="block text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Session Title</span>
                    <input
                      type="text"
                      value={pastTitle}
                      onChange={(e) => setPastTitle(e.target.value)}
                      placeholder="e.g. Upper Push & Arms"
                      className="mt-1 w-full min-h-[38px] px-2.5 py-1.5 text-xs hl-input rounded-lg"
                    />
                  </label>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                    {pastExercises.map((ex, idx) => (
                      <div
                        key={`${ex.exerciseId}_${idx}`}
                        className="p-2.5 rounded-lg hl-card border space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {ex.exerciseName}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPastExercises((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-slate-400 hover:text-red-500 p-1"
                            aria-label={`Remove ${ex.exerciseName}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                          <label className="block">
                            <span className="text-slate-500 dark:text-slate-400">Sets</span>
                            <input
                              type="number"
                              min={1}
                              max={15}
                              value={ex.setsCount}
                              onChange={(e) => {
                                const val = Math.max(1, Math.min(15, Number(e.target.value) || 1));
                                setPastExercises((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, setsCount: val } : item
                                  )
                                );
                              }}
                              className="mt-0.5 w-full min-h-[34px] px-1.5 text-center font-mono tabular-nums hl-input rounded"
                            />
                          </label>

                          <label className="block">
                            <span className="text-slate-500 dark:text-slate-400">{weightUnit}</span>
                            <input
                              type="number"
                              min={0}
                              step="0.5"
                              value={convertDisplayWeight(ex.weightKg, weightUnit)}
                              onChange={(e) => {
                                const raw = Math.max(0, Number(e.target.value) || 0);
                                const kg =
                                  weightUnit === 'kg'
                                    ? raw
                                    : Number((raw / 2.20462).toFixed(2));
                                setPastExercises((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, weightKg: kg } : item
                                  )
                                );
                              }}
                              className="mt-0.5 w-full min-h-[34px] px-1.5 text-center font-mono tabular-nums hl-input rounded"
                            />
                          </label>

                          <label className="block">
                            <span className="text-slate-500 dark:text-slate-400">Reps</span>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={ex.reps}
                              onChange={(e) => {
                                const val = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                                setPastExercises((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, reps: val } : item))
                                );
                              }}
                              className="mt-0.5 w-full min-h-[34px] px-1.5 text-center font-mono tabular-nums hl-input rounded"
                            />
                          </label>

                          <label className="block">
                            <span className="text-slate-500 dark:text-slate-400">RPE</span>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              step="0.5"
                              value={ex.rpe ?? ''}
                              placeholder="—"
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                const val =
                                  raw === ''
                                    ? undefined
                                    : Math.max(1, Math.min(10, Number(raw) || 8));
                                setPastExercises((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, rpe: val } : item))
                                );
                              }}
                              className="mt-0.5 w-full min-h-[34px] px-1.5 text-center font-mono tabular-nums hl-input rounded"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsManualExercisePickerOpen(true)}
                    className="w-full min-h-[40px] px-3.5 py-2 rounded-xl hl-card border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-semibold text-blue-600 dark:text-blue-400 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Search &amp; Add Exercise by Muscle Group</span>
                  </button>

                  <label className="block text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Notes (Optional)</span>
                    <input
                      type="text"
                      value={pastNotes}
                      onChange={(e) => setPastNotes(e.target.value)}
                      placeholder="Session feel, PRs, or adjustments…"
                      className="mt-1 w-full min-h-[38px] px-2.5 py-1.5 text-xs hl-input rounded-lg"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={pastExercises.length === 0}
                    className="w-full min-h-[42px] py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    Save Workout to {formatHumanDateShort(selectedDateIso)}
                  </button>
                </form>
              )}

              {/* Selected Date Workout Sessions Breakdown */}
              {selectedSessions.length === 0 ? (
                <div className="py-6 text-center space-y-3">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    No workout logged on {formatHumanDateShort(selectedDateIso)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                    {selectedDateIso === todayIso
                      ? 'Start a workout from Track or tap "Log Workout" above to record a completed session for today.'
                      : 'Rest or recovery day. Tap "Log Workout" above if you want to record a session on this date.'}
                  </p>

                  {selectedDateIso === todayIso && onReturnToLiveTracker && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDayPopupOpen(false);
                          onReturnToLiveTracker();
                        }}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                      >
                        <Dumbbell className="w-3.5 h-3.5" />
                        <span>Start Today&apos;s Workout</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {selectedSessions.map((session) => {
                    const isEditingThis = editingNotesId === session.id;
                    const musclesLine = session.musclesTrained
                      .map((m) => landmarks[m]?.shortName ?? m)
                      .join(' · ');

                    return (
                      <div key={session.id} className="space-y-3.5">
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-base font-bold text-slate-900 dark:text-white">
                              {session.title.replace(/^Week\s+\d+\s+·\s+/i, '')}
                            </h4>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {onRepeatWorkout && session.exercises.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsDayPopupOpen(false);
                                    onRepeatWorkout(session);
                                  }}
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-blue-600 hover:opacity-90 text-white text-xs font-semibold transition-opacity inline-flex items-center gap-1 whitespace-nowrap"
                                  title="Load this workout into Track to log a new session"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>Track Again</span>
                                </button>
                              )}

                              {session.isManualEntry && onDeleteManualHistoryRecord && (
                                <div>
                                  {confirmDeleteId === session.id ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await onDeleteManualHistoryRecord(session.id);
                                          setConfirmDeleteId(null);
                                        }}
                                        className="min-h-[32px] px-2.5 rounded-lg bg-red-600 text-white text-[11px] font-semibold"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="min-h-[32px] px-2 rounded-lg hl-subtle text-[11px]"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(session.id)}
                                      className="min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-red-500"
                                      aria-label="Delete manual workout entry"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {musclesLine && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {musclesLine}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 pt-0.5">
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {session.totalSets} sets
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{session.totalReps} reps</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold">
                              {formatVolume(session.totalTonnageKg)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>~{session.estimatedCaloriesKcal} kcal</span>
                            {session.durationMinutes && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{session.durationMinutes} min</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Exercise-by-Exercise Set Table */}
                        <div className="divide-y divide-slate-200/70 dark:divide-slate-800 border-y border-slate-200/70 dark:border-slate-800">
                          {session.exercises.map((ex, exIdx) => {
                            let bestSet = ex.sets[0];
                            for (const st of ex.sets) {
                              if (
                                st.weightKg > bestSet.weightKg ||
                                (st.weightKg === bestSet.weightKg && st.reps > bestSet.reps)
                              ) {
                                bestSet = st;
                              }
                            }

                            return (
                              <div key={`${ex.exerciseId}_${exIdx}`} className="py-3 space-y-2">
                                <div className="flex items-baseline justify-between gap-2">
                                  <div className="min-w-0">
                                    <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                                      {exIdx + 1}. {ex.exerciseName}
                                    </span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-2">
                                      {landmarks[ex.muscleId]?.shortName ?? ex.muscleId}
                                    </span>
                                  </div>
                                  {bestSet && (
                                    <span className="text-[11px] font-mono tabular-nums text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap shrink-0">
                                      Top {convertDisplayWeight(bestSet.weightKg, weightUnit)}{' '}
                                      {weightUnit} × {bestSet.reps}
                                    </span>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {ex.sets.map((st) => (
                                    <div
                                      key={st.id}
                                      className="px-2.5 py-1.5 rounded-lg hl-subtle flex items-center justify-between gap-2 text-xs font-mono tabular-nums"
                                    >
                                      <span className="text-slate-500 dark:text-slate-400">
                                        #{st.setIndex}{' '}
                                        <strong className="text-slate-900 dark:text-white">
                                          {convertDisplayWeight(st.weightKg, weightUnit)}{' '}
                                          {weightUnit} × {st.reps}
                                        </strong>
                                      </span>
                                      <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {st.rir} RIR
                                        {typeof st.rpe === 'number' ? ` · RPE ${st.rpe}` : ''}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Session Notes & Duration */}
                        {isEditingThis ? (
                          <div className="p-3 rounded-xl hl-subtle border space-y-2.5">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <label className="block">
                                <span className="text-slate-500 dark:text-slate-400">
                                  Duration (min)
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={480}
                                  value={draftDuration}
                                  onChange={(e) => setDraftDuration(e.target.value)}
                                  placeholder="e.g. 60"
                                  className="mt-1 w-full min-h-[36px] px-2.5 font-mono tabular-nums hl-input rounded-lg"
                                />
                              </label>
                            </div>
                            <label className="block text-xs">
                              <span className="text-slate-500 dark:text-slate-400">
                                Session Notes
                              </span>
                              <textarea
                                rows={2}
                                value={draftNotes}
                                onChange={(e) => setDraftNotes(e.target.value)}
                                placeholder="How did the weights move? Any PRs or joint notes…"
                                className="mt-1 w-full p-2.5 text-xs hl-input rounded-lg resize-none"
                              />
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveSessionMeta(session)}
                                className="min-h-[36px] px-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                              >
                                Save Notes
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingNotesId(null)}
                                className="min-h-[36px] px-3 rounded-lg hl-card border text-xs font-medium text-slate-600 dark:text-slate-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            {session.notes ? (
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                <span className="font-semibold text-slate-800 dark:text-slate-100">
                                  Notes:{' '}
                                </span>
                                {session.notes}
                              </p>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-slate-500">
                                No session notes added
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => openNotesEditor(session)}
                              className="min-h-[34px] px-2.5 rounded-lg hl-subtle border text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                            >
                              <FileText className="w-3 h-3" />
                              <span>{session.notes ? 'Edit Notes' : 'Add Notes'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Nutrition & Meals Logged on Selected Date */}
              {selectedNutrition && selectedNutrition.meals.length > 0 && (
                <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-900 dark:text-white">
                      Nutrition &amp; Meals Logged ({selectedNutrition.meals.length})
                    </span>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {selectedDayTotals.mealCalories.toLocaleString()} kcal · P{' '}
                      {Math.round(selectedDayTotals.mealProteinG)}g · C{' '}
                      {Math.round(selectedDayTotals.mealCarbsG)}g · F{' '}
                      {Math.round(selectedDayTotals.mealFatG)}g
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200/70 dark:divide-slate-800 rounded-xl hl-subtle border px-3">
                    {selectedNutrition.meals.map((meal) => (
                      <div
                        key={meal.id}
                        className="py-2 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 truncate">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {meal.name}
                          </span>
                          <span className="text-slate-400 dark:text-slate-500"> · </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {meal.mealType}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                          {meal.calories} kcal · {Math.round(meal.proteinG)}g P
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Searchable, Muscle-Grouped Exercise Picker for Manual Workout Logging */}
      <ExercisePickerModal
        isOpen={isManualExercisePickerOpen}
        onClose={() => setIsManualExercisePickerOpen(false)}
        exercises={exerciseLibrary}
        landmarks={landmarks}
        onSelectExercise={handlePickExerciseForPastDraft}
        onCreateCustomExercise={onCreateCustomExercise}
        alreadySelectedIds={pastExercises.map((e) => e.exerciseId)}
        title={`Add Exercises · ${formatHumanDateShort(selectedDateIso)}`}
      />
    </div>
  );
};

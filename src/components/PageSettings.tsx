import React, { useMemo, useRef, useState } from 'react';
import {
  ActiveStandaloneSession,
  AppPreferences,
  AppTab,
  AppTheme,
  DailyNutritionRecord,
  GoogleWorkoutSyncReceipt,
  MuscleId,
  MuscleLandmark,
  SetLogEntry,
  SyncOutboxEvent,
  TrainingPackageStatus,
  WidgetProgressSnapshot,
  WorkoutDayPlan,
  WorkoutHistoryRecord,
} from '../types/workout';
import {
  deriveFullWorkoutHistory,
  downloadBlobFile,
  exportWorkoutRecordsToCSV,
  formatHumanDateShort,
  formatLocalDateISO,
  generateFullHistoryPdfBlob,
  shareOrDownloadPdfBlob,
} from '../utils/workoutHistory';
import {
  Activity,
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Contrast,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  FolderArchive,
  Layers,
  Moon,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Vibrate,
  Volume2,
  X,
} from 'lucide-react';
import {
  archiveTelemetryLogs,
  getDayZeroEpochIso,
  getLiveTelemetryLogs,
  purgeTelemetryLogs,
  subscribeTelemetryLogs,
} from '../services/telemetryLogger';
import { playTimerSetTone } from '../utils/timerAudio';
import {
  APK_DOWNLOAD_PATH,
  APK_FILE_NAME,
  BUNDLE_ZIP_FILE_NAME,
  SOURCE_ZIP_DOWNLOAD_PATH,
  SOURCE_ZIP_FILE_NAME,
  downloadSignedApk,
  getFreshApkHref,
  getFreshBundleHref,
} from '../utils/apkDownload';
import {
  isRunningInAndroidStandaloneApk,
  openAndroidHealthConnectSettings,
  requestPinAndroidHomeWidget,
  syncWorkoutToAndroidHealthConnect,
} from '../utils/nativeAndroidBridge';
import { PWAInstallButton } from './PWAInstallButton';
import { BetaFeedbackPanel } from './BetaFeedbackPanel';

interface PageSettingsProps {
  theme: AppTheme;
  onChangeTheme: (theme: AppTheme) => void;
  weightUnit: 'kg' | 'lb';
  onToggleWeightUnit: (unit: 'kg' | 'lb') => Promise<void>;
  preferences: AppPreferences;
  onSavePreferences: (prefs: AppPreferences) => Promise<void>;
  widgetSnapshot: WidgetProgressSnapshot;
  lastWidgetSync: {
    trigger: string;
    timeLabel: string;
  };
  setLogs: SetLogEntry[];
  workoutHistory: WorkoutHistoryRecord[];
  plan: WorkoutDayPlan[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  nutritionByDate: Record<string, DailyNutritionRecord>;
  activeStandaloneSession?: ActiveStandaloneSession | null;
  trainingPackageStatus?: TrainingPackageStatus | null;
  googleSyncReceipts?: GoogleWorkoutSyncReceipt[];
  syncOutbox?: SyncOutboxEvent[];
  onSyncWorkoutWithGoogle?: (
    record: WorkoutHistoryRecord,
    cardioMinutes: number
  ) => Promise<GoogleWorkoutSyncReceipt>;
  onClearGoogleSyncReceipts?: () => Promise<void>;
  onQueueSessionSync?: (
    sessionLabel: string,
    dayNumber: number,
    completedSetsCount: number,
    tonnageKg: number
  ) => Promise<void>;
  onClearSyncOutbox?: () => Promise<void>;
  onRedownloadTrainingPackage?: () => Promise<void>;
  onJumpToTab: (tab: AppTab) => void;
  onExportBackup: () => Promise<void>;
  onImportBackup: (jsonContent: string) => Promise<void>;
  onResetDefaults: () => Promise<void>;
  onForceRefreshTracker: () => Promise<{
    totalSets: number;
    activeSets: number;
    repairedCount: number;
  }>;
  onOpenInstallGuide: () => void;
  onOpenGlassDesignGuide?: () => void;
  onOpenClayDesignStudio?: () => void;
}

const THEME_CARDS: Array<{
  id: AppTheme;
  title: string;
  subtitle: string;
  swatchBgClass: string;
  swatchCardClass: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: AppTheme.Claymorphism,
    title: 'Soft Clay 3D (Default)',
    subtitle: 'Plump pastel clay cards with smooth glass specular bevels',
    swatchBgClass: 'bg-gradient-to-br from-[#F5F3FF] via-[#EEF4FF] to-[#F0FDF9]',
    swatchCardClass:
      'bg-white text-[#16182C] shadow-[inset_1px_2px_3px_#fff,inset_-2px_-2px_4px_rgba(165,180,252,0.45)]',
    Icon: Layers,
  },
  {
    id: AppTheme.ClayDark,
    title: 'Midnight Clay 3D',
    subtitle: 'Deep indigo matte clay with luminous 3D inner rims',
    swatchBgClass: 'bg-gradient-to-br from-[#101223] to-[#181C36]',
    swatchCardClass:
      'bg-[#23284A] text-[#F6F7FF] border border-indigo-400/30',
    Icon: Sparkles,
  },
  {
    id: AppTheme.Daylight,
    title: 'Daylight Crisp',
    subtitle: 'High-contrast daylight gym visibility',
    swatchBgClass: 'bg-[#F8FAFC]',
    swatchCardClass: 'bg-white text-[#0F172A]',
    Icon: Sun,
  },
  {
    id: AppTheme.PastelGlass,
    title: 'Pastel Glass',
    subtitle: 'Frosted blur over soft pastel mesh gradients',
    swatchBgClass: 'bg-gradient-to-br from-[#EEF2FF] via-[#E0F2FE] to-[#FDF2F8]',
    swatchCardClass: 'bg-white/80 text-[#0F172A] border border-white',
    Icon: Sparkles,
  },
  {
    id: AppTheme.NightSlate,
    title: 'Night Slate',
    subtitle: 'Deep cobalt slate for evening sessions',
    swatchBgClass: 'bg-[#0B1120]',
    swatchCardClass: 'bg-[#111827] text-[#F8FAFC]',
    Icon: Moon,
  },
  {
    id: AppTheme.Amoled,
    title: 'True AMOLED',
    subtitle: 'Pure #000000 black for OLED battery savings',
    swatchBgClass: 'bg-black',
    swatchCardClass: 'bg-[#0A0D14] text-white',
    Icon: Contrast,
  },
  {
    id: AppTheme.Graphite,
    title: 'Graphite Dark',
    subtitle: 'Neutral charcoal matte dark finish',
    swatchBgClass: 'bg-[#121316]',
    swatchCardClass: 'bg-[#1A1D24] text-[#F4F4F5]',
    Icon: Moon,
  },
];

const REST_PRESET_SECONDS = [60, 90, 120, 150, 180, 240];

export const PageSettings: React.FC<PageSettingsProps> = React.memo(({
  theme,
  onChangeTheme,
  weightUnit,
  onToggleWeightUnit,
  preferences,
  onSavePreferences,
  widgetSnapshot,
  lastWidgetSync,
  setLogs,
  workoutHistory,
  plan,
  landmarks,
  nutritionByDate,
  activeStandaloneSession,
  trainingPackageStatus,
  googleSyncReceipts = [],
  syncOutbox = [],
  onSyncWorkoutWithGoogle,
  onClearGoogleSyncReceipts,
  onQueueSessionSync,
  onClearSyncOutbox,
  onRedownloadTrainingPackage,
  onJumpToTab,
  onExportBackup,
  onImportBackup,
  onResetDefaults,
  onForceRefreshTracker,
  onOpenInstallGuide,
  onOpenGlassDesignGuide,
  onOpenClayDesignStudio,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isForceRefreshing, setIsForceRefreshing] = useState<boolean>(false);
  const [isRedownloadingPkg, setIsRedownloadingPkg] = useState<boolean>(false);
  const [isSyncingGoogleFit, setIsSyncingGoogleFit] = useState<boolean>(false);
  const [isQueueingHealthConnect, setIsQueueingHealthConnect] = useState<boolean>(false);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [exportingHistoryPdf, setExportingHistoryPdf] = useState<boolean>(false);
  const [sharingHistoryPdf, setSharingHistoryPdf] = useState<boolean>(false);
  const [showAllHistoryFeed, setShowAllHistoryFeed] = useState<boolean>(false);
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [apkDownloading, setApkDownloading] = useState<'idle' | 'downloading' | 'done'>('idle');
  const [bundleDownloading, setBundleDownloading] = useState<'idle' | 'done'>('idle');
  const [zipDownloading, setZipDownloading] = useState<'idle' | 'done'>('idle');
  const [apkProgressMb, setApkProgressMb] = useState<string>('');
  const [widgetGridPreview, setWidgetGridPreview] = useState<'compact' | 'standard' | 'expanded'>(
    'standard'
  );
  const [liveTelemetryLogs, setLiveTelemetryLogs] = useState(() => getLiveTelemetryLogs());

  React.useEffect(() => {
    return subscribeTelemetryLogs((entries) => setLiveTelemetryLogs(entries));
  }, []);

  const handleRedownloadPackageClick = async () => {
    if (!onRedownloadTrainingPackage || isRedownloadingPkg) return;
    setIsRedownloadingPkg(true);
    try {
      await onRedownloadTrainingPackage();
      setStatusMessage({
        tone: 'success',
        text: 'Training Resource Package v4.0.0 downloaded and unpacked into HyperLogData/{database,training,nutrition,wellness,videos,logs}.',
      });
      window.setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setIsRedownloadingPkg(false);
    }
  };

  const handleForceRefresh = async () => {
    if (isForceRefreshing) return;
    setIsForceRefreshing(true);
    try {
      const res = await onForceRefreshTracker();
      const repairNote =
        res.repairedCount > 0 ? ` · ${res.repairedCount} set rows normalized` : '';
      setStatusMessage({
        tone: 'success',
        text: `Tracker data refreshed from offline storage (${res.activeSets} active session sets · ${res.totalSets} total sets${repairNote}).`,
      });
      window.setTimeout(() => setStatusMessage(null), 5000);
    } catch {
      setStatusMessage({
        tone: 'error',
        text: 'Could not refresh tracker storage right now. Please try again.',
      });
    } finally {
      setIsForceRefreshing(false);
    }
  };

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

  const nutritionDaysCount = useMemo(
    () =>
      Object.values(nutritionByDate).filter(
        (rec) => rec && rec.meals && rec.meals.length > 0
      ).length,
    [nutritionByDate]
  );

  const filteredAllRecords = useMemo(() => {
    const q = historySearchQuery.trim().toLowerCase();
    if (!q) return derivedHistory.allRecords;
    return derivedHistory.allRecords.filter((rec) => {
      if (rec.date.includes(q) || rec.title.toLowerCase().includes(q)) return true;
      if (rec.notes && rec.notes.toLowerCase().includes(q)) return true;
      for (const mId of rec.musclesTrained) {
        if ((landmarks[mId]?.name ?? '').toLowerCase().includes(q)) return true;
      }
      return rec.exercises.some((ex) => ex.exerciseName.toLowerCase().includes(q));
    });
  }, [derivedHistory.allRecords, historySearchQuery, landmarks]);

  const formatVolume = (tonnageKg: number): string => {
    if (weightUnit === 'kg') {
      return `${Math.round(tonnageKg).toLocaleString()} kg`;
    }
    return `${Math.round(tonnageKg * 2.20462).toLocaleString()} lb`;
  };

  const handleDownloadAllDataPdf = async () => {
    if (exportingHistoryPdf || derivedHistory.allRecords.length === 0) return;
    setExportingHistoryPdf(true);
    try {
      const pdfBlob = await generateFullHistoryPdfBlob({
        records: derivedHistory.allRecords,
        landmarks,
        weightUnit,
        streakDays: widgetSnapshot.streakDays,
        bestStreakDays: widgetSnapshot.bestStreakDays,
      });
      const filename = `hyperlog-all-workout-data-${todayIso}.pdf`;
      downloadBlobFile(pdfBlob, filename);
      setStatusMessage({
        tone: 'success',
        text: `Exported complete workout history PDF (${derivedHistory.allRecords.length} sessions) as ${filename}.`,
      });
      window.setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setExportingHistoryPdf(false);
    }
  };

  const handleShareAllDataPdf = async () => {
    if (sharingHistoryPdf || derivedHistory.allRecords.length === 0) return;
    setSharingHistoryPdf(true);
    try {
      const pdfBlob = await generateFullHistoryPdfBlob({
        records: derivedHistory.allRecords,
        landmarks,
        weightUnit,
        streakDays: widgetSnapshot.streakDays,
        bestStreakDays: widgetSnapshot.bestStreakDays,
      });
      const filename = `hyperlog-all-workout-data-${todayIso}.pdf`;
      const outcome = await shareOrDownloadPdfBlob({
        blob: pdfBlob,
        filename,
        title: 'HyperLog Complete Workout History PDF',
        text: `All historical workout data (${derivedHistory.allRecords.length} sessions).`,
      });
      if (outcome !== 'cancelled') {
        setStatusMessage({
          tone: 'success',
          text:
            outcome === 'shared'
              ? `Shared complete workout history PDF (${filename}).`
              : `Downloaded complete workout history PDF (${filename}).`,
        });
        window.setTimeout(() => setStatusMessage(null), 5000);
      }
    } finally {
      setSharingHistoryPdf(false);
    }
  };

  const handleExportAllDataCsv = () => {
    const csv = exportWorkoutRecordsToCSV(derivedHistory.allRecords, landmarks, weightUnit);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const filename = `hyperlog-all-workout-data-${todayIso}.csv`;
    downloadBlobFile(blob, filename);
    setStatusMessage({
      tone: 'success',
      text: `Exported all historical sets (${derivedHistory.lifetimeStats.totalSets.toLocaleString()} sets) to ${filename}.`,
    });
    window.setTimeout(() => setStatusMessage(null), 5000);
  };

  const setsPct = Math.min(
    100,
    Math.round((widgetSnapshot.completedSets / Math.max(1, widgetSnapshot.plannedSets)) * 100)
  );
  const kcalPct = Math.min(
    100,
    Math.round((widgetSnapshot.todayCalories / Math.max(1, widgetSnapshot.targetCalories)) * 100)
  );
  const proteinPct = Math.min(
    100,
    Math.round((widgetSnapshot.todayProteinG / Math.max(1, widgetSnapshot.targetProteinG)) * 100)
  );
  const splitBarColors = ['bg-blue-500', 'bg-emerald-500', 'bg-sky-400', 'bg-orange-400'];

  const handleTestVibration = () => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([240, 100, 240, 100, 380]);
        setStatusMessage({
          tone: 'success',
          text: 'Sent triple-pulse vibration signal to device motor.',
        });
      } else {
        setStatusMessage({
          tone: 'success',
          text: 'Browser preview simulated haptic pulse. Native Android APK drives the hardware Vibrator motor directly.',
        });
      }
    } catch {
      setStatusMessage({
        tone: 'success',
        text: 'Haptic test queued. Native Android APK drives the hardware Vibrator motor directly.',
      });
    }
    window.setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      await onImportBackup(content);
      setStatusMessage({
        tone: 'success',
        text: `Restored offline backup from ${file.name}.`,
      });
    } catch {
      setStatusMessage({
        tone: 'error',
        text: 'Could not parse JSON backup file. Please select a valid HyperLog export.',
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      window.setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleVerifiedApkDownload = async () => {
    if (apkDownloading === 'downloading') return;
    setApkDownloading('downloading');
    setApkProgressMb('0.00 MB');
    const result = await downloadSignedApk(APK_DOWNLOAD_PATH, APK_FILE_NAME, (loaded) => {
      setApkProgressMb(`${(loaded / (1024 * 1024)).toFixed(2)} MB`);
    });
    if (result.ok) {
      setApkDownloading('done');
      setStatusMessage({
        tone: 'success',
        text: `Verified ${APK_FILE_NAME} (${(result.bytesDownloaded / (1024 * 1024)).toFixed(
          2
        )} MB) saved to your device Downloads folder.`,
      });
    } else {
      setApkDownloading('idle');
      setStatusMessage({
        tone: 'error',
        text: result.errorMessage || 'Tap Direct .APK Stream above to download directly.',
      });
    }
    window.setTimeout(() => setApkDownloading('idle'), 4500);
  };

  const handleManualGoogleFitSync = async () => {
    if (!onSyncWorkoutWithGoogle || isSyncingGoogleFit) return;
    setIsSyncingGoogleFit(true);
    try {
      const latestRecord: WorkoutHistoryRecord =
        derivedHistory.allRecords[0] ?? {
          id: `session_sync_${todayIso}`,
          date: todayIso,
          title: plan[0]?.title ?? 'Day 1 · Strength Session',
          completedAt: new Date().toISOString(),
          durationMinutes: 45,
          exercises: [],
          totalSets: Math.max(1, widgetSnapshot.completedSets),
          totalReps: Math.max(8, widgetSnapshot.completedSets * 10),
          totalTonnageKg: 0,
          estimatedCaloriesKcal: Math.max(25, Math.round(Math.max(1, widgetSnapshot.completedSets) * 16.5)),
          musclesTrained: [],
        };
      const receipt = await onSyncWorkoutWithGoogle(latestRecord, 0);
      setStatusMessage({
        tone: 'success',
        text: `Synced "${receipt.workoutTitle}" with Google Fit (${receipt.status}).`,
      });
      window.setTimeout(() => setStatusMessage(null), 4500);
    } catch {
      setStatusMessage({
        tone: 'error',
        text: 'Could not sync with Google Fit right now. Queued for offline retry.',
      });
    } finally {
      setIsSyncingGoogleFit(false);
    }
  };

  const handleManualHealthConnectQueue = async () => {
    if (!onQueueSessionSync || isQueueingHealthConnect) return;
    setIsQueueingHealthConnect(true);
    try {
      const latest = derivedHistory.allRecords[0];
      const sessionTitle = latest?.title ?? plan[0]?.title ?? 'Active Mesocycle Session';
      const setsCount = latest?.totalSets ?? Math.max(1, widgetSnapshot.completedSets);
      const tonnageKg = latest?.totalTonnageKg ?? 0;
      await onQueueSessionSync(sessionTitle, latest?.dayNumber ?? 1, setsCount, tonnageKg);
      setStatusMessage({
        tone: 'success',
        text: `Queued "${sessionTitle}" (${setsCount} sets) to Android Health Connect outbox.`,
      });
      window.setTimeout(() => setStatusMessage(null), 4500);
    } finally {
      setIsQueueingHealthConnect(false);
    }
  };

  const handleExportHealthConnectJson = () => {
    const latest = derivedHistory.allRecords[0];
    const setsCount = latest?.totalSets ?? Math.max(1, widgetSnapshot.completedSets);
    const payload = {
      schema: 'androidx.health.connect.client.records.ExerciseSessionRecord',
      packageName: 'com.hyperlog.rp',
      exportedAt: new Date().toISOString(),
      latestSession: {
        title: latest?.title ?? plan[0]?.title ?? 'Strength Session',
        exerciseType: 'EXERCISE_TYPE_WEIGHTLIFTING',
        completedSets: setsCount,
        totalTonnageKg: Math.round(latest?.totalTonnageKg ?? 0),
        activeCaloriesKcal: latest?.estimatedCaloriesKcal ?? Math.round(setsCount * 16.5),
      },
      queuedOutboxEvents: syncOutbox,
      googleFitSyncReceipts: googleSyncReceipts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlobFile(blob, `hyperlog-health-connect-${todayIso}.json`);
    setStatusMessage({
      tone: 'success',
      text: `Exported Health Connect & Google Fit payload (hyperlog-health-connect-${todayIso}.json).`,
    });
    window.setTimeout(() => setStatusMessage(null), 4500);
  };

  return (
    <div className="space-y-6">
      {/* Page Title + Manual Force Refresh Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            App Settings &amp; Preferences
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Appearance themes, training units, Health Integration, Android widget, and Export All Data
          </p>
        </div>

        <button
          type="button"
          data-testid="force-refresh-btn"
          onClick={handleForceRefresh}
          disabled={isForceRefreshing}
          className="no-touch-delay min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 self-start sm:self-auto shrink-0 whitespace-nowrap disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 shrink-0 ${isForceRefreshing ? 'animate-spin' : ''}`} />
          <span>{isForceRefreshing ? 'Refreshing…' : 'Force Refresh'}</span>
        </button>
      </div>

      {statusMessage && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
            statusMessage.tone === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="no-touch-delay text-xs font-semibold underline shrink-0 whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Appearance + Training Preferences */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Appearance & Night Mode Themes (Consolidated Theme Dropdown + Clay 3D Studio) */}
          <section
            data-testid="settings-appearance-section"
            className="hl-card rounded-2xl p-4 sm:p-6 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Appearance &amp; Theme Dropdown
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Choose any Claymorphism, Pastel Glass, Daylight, or Night theme from the dropdown below
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                {THEME_CARDS.length} Themes Available
              </span>
            </div>

            {(() => {
              const activeThemeMeta =
                THEME_CARDS.find((item) => item.id === theme) ?? THEME_CARDS[0];
              const ActiveThemeIcon = activeThemeMeta.Icon;
              return (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-stretch">
                  <div className="md:col-span-7 flex flex-col justify-center space-y-1.5">
                    <label
                      htmlFor="hyperlog-theme-dropdown"
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Active Application Theme
                    </label>
                    <div className="relative">
                      <select
                        id="hyperlog-theme-dropdown"
                        data-testid="theme-dropdown-select"
                        aria-label="Select application color theme"
                        value={theme}
                        onChange={(e) => onChangeTheme(e.target.value as AppTheme)}
                        className="no-touch-delay w-full min-h-[48px] pl-3.5 pr-10 py-2.5 text-sm font-semibold hl-input rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                      >
                        {THEME_CARDS.map(({ id, title, subtitle }) => (
                          <option
                            key={id}
                            value={id}
                            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          >
                            {title} — {subtitle}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  {/* Active Theme Live Swatch Preview */}
                  <div
                    data-testid="active-theme-preview-card"
                    className="md:col-span-5 p-3.5 rounded-xl hl-subtle border flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <ActiveThemeIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {activeThemeMeta.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                        {activeThemeMeta.subtitle}
                      </p>
                    </div>

                    <div
                      className={`w-11 h-11 rounded-lg border border-slate-300/70 dark:border-slate-700 shrink-0 flex items-center justify-center ${activeThemeMeta.swatchBgClass}`}
                      aria-hidden="true"
                    >
                      <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold font-mono ${activeThemeMeta.swatchCardClass}`}
                      >
                        <Check className="w-3.5 h-3.5 text-blue-500" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {(onOpenClayDesignStudio || onOpenGlassDesignGuide) && (
              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Clay 3D Studio &amp; UI Architecture Guides
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Open Clay 3D Studio wireframes, Day-Zero telemetry console, or the Pastel Glass design guide.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {onOpenClayDesignStudio && (
                    <button
                      type="button"
                      data-testid="open-clay-studio-btn"
                      onClick={onOpenClayDesignStudio}
                      className="no-touch-delay min-h-[44px] px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Layers className="w-4 h-4 shrink-0" />
                      <span>Clay 3D Studio</span>
                    </button>
                  )}
                  {onOpenGlassDesignGuide && (
                    <button
                      type="button"
                      data-testid="settings-open-glass-guide-btn"
                      onClick={onOpenGlassDesignGuide}
                      className="no-touch-delay min-h-[44px] px-3.5 py-2 rounded-2xl hl-subtle border hover:border-blue-500 text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>Pastel Glass Guide</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 2. Training Units & Rest Timer Hardware Preferences */}
          <section className="hl-card rounded-2xl p-4 sm:p-6 space-y-5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Training Units &amp; Rest Timer Hardware
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configure load units, default countdown duration, and native vibration motor behavior
              </p>
            </div>

            {/* Weight Unit Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Barbell &amp; Bodyweight Unit
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Used across Set Tracker, Anatomy tonnage, and Calorie Calculator
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800/90 self-start sm:self-auto">
                {(['kg', 'lb'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => onToggleWeightUnit(u)}
                    className={`no-touch-delay min-h-[38px] px-4 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                      weightUnit === u
                        ? 'bg-slate-900 dark:bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {u === 'kg' ? 'Kilograms (kg)' : 'Pounds (lb)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Default Rest Timer Duration */}
            <div className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  Default Rest Timer Duration
                </span>
                <span className="text-xs font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">
                  {preferences.defaultRestSeconds}s ({Math.floor(preferences.defaultRestSeconds / 60)}:
                  {String(preferences.defaultRestSeconds % 60).padStart(2, '0')})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {REST_PRESET_SECONDS.map((sec) => {
                  const active = preferences.defaultRestSeconds === sec;
                  return (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        playTimerSetTone(preferences.soundOnTimer !== false);
                        void onSavePreferences({ ...preferences, defaultRestSeconds: sec });
                      }}
                      className={`no-touch-delay min-h-[38px] px-3.5 py-1.5 text-xs font-mono tabular-nums font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-500'
                          : 'hl-subtle text-slate-700 dark:text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {sec}s
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Auto-Start & Native Vibration Toggles */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    Auto-Start Rest Timer on Set Completion
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Starts countdown automatically whenever you mark a working set complete
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences.autoStartRestTimer}
                  onClick={() =>
                    onSavePreferences({
                      ...preferences,
                      autoStartRestTimer: !preferences.autoStartRestTimer,
                    })
                  }
                  className={`no-touch-delay min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 whitespace-nowrap ${
                    preferences.autoStartRestTimer
                      ? 'bg-blue-600 text-white'
                      : 'hl-subtle border text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {preferences.autoStartRestTimer ? 'Enabled' : 'Off'}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/70 dark:border-slate-800/70">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    Native Vibration Motor Alert
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Fires rhythmic triple-pulse vibration when your rest timer reaches 00:00
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestVibration}
                    className="no-touch-delay min-h-[38px] px-3 py-1.5 rounded-lg hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Vibrate className="w-3.5 h-3.5 shrink-0" />
                    <span>Test Pulse</span>
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.vibrateOnRestComplete}
                    onClick={() =>
                      onSavePreferences({
                        ...preferences,
                        vibrateOnRestComplete: !preferences.vibrateOnRestComplete,
                      })
                    }
                    className={`no-touch-delay min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      preferences.vibrateOnRestComplete
                        ? 'bg-blue-600 text-white'
                        : 'hl-subtle border text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {preferences.vibrateOnRestComplete ? 'Enabled' : 'Muted'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/70 dark:border-slate-800/70">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    Timer Audio Tone (Set &amp; Complete)
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Plays a crisp confirmation chime when timers are set/started and when countdowns finish
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playTimerSetTone(true);
                      setStatusMessage({
                        tone: 'success',
                        text: 'Played synthesized timer set confirmation tone.',
                      });
                      window.setTimeout(() => setStatusMessage(null), 3500);
                    }}
                    className="no-touch-delay min-h-[38px] px-3 py-1.5 rounded-lg hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Volume2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Test Tone</span>
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.soundOnTimer !== false}
                    onClick={() =>
                      onSavePreferences({
                        ...preferences,
                        soundOnTimer: !(preferences.soundOnTimer !== false),
                      })
                    }
                    className={`no-touch-delay min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      preferences.soundOnTimer !== false
                        ? 'bg-blue-600 text-white'
                        : 'hl-subtle border text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {preferences.soundOnTimer !== false ? 'Enabled' : 'Muted'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 2B. Dedicated Health Integration Sub-Section (Google Fit + Android Health Connect) */}
          <section
            data-testid="settings-health-integration-section"
            className="hl-card rounded-2xl p-4 sm:p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Health Integration</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Consolidated Google Fit integration and Android Health Connect sync controls
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                <span>{googleSyncReceipts.length} Google Fit syncs</span>
                <span aria-hidden="true">·</span>
                <span>{syncOutbox.length} Health Connect outbox</span>
              </div>
            </div>

            {/* Automatic Sync Toggles */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    Google Fit Automatic Workout Sync
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Automatically records completed workout duration, sets, and active calories to Google Fit
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  data-testid="toggle-auto-google-fit"
                  aria-checked={preferences.autoSyncGoogleFit !== false}
                  onClick={() =>
                    void onSavePreferences({
                      ...preferences,
                      autoSyncGoogleFit: !(preferences.autoSyncGoogleFit !== false),
                    })
                  }
                  className={`no-touch-delay min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 whitespace-nowrap ${
                    preferences.autoSyncGoogleFit !== false
                      ? 'bg-blue-600 text-white'
                      : 'hl-subtle border text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {preferences.autoSyncGoogleFit !== false ? 'Enabled' : 'Off'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-200/70 dark:border-slate-800/70">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    Android Health Connect Outbox Bridge
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Queues ExerciseSessionRecord and NutritionRecord payloads for on-device HealthConnectManager sync
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  data-testid="toggle-auto-health-connect"
                  aria-checked={preferences.autoQueueHealthConnect !== false}
                  onClick={() =>
                    void onSavePreferences({
                      ...preferences,
                      autoQueueHealthConnect: !(preferences.autoQueueHealthConnect !== false),
                    })
                  }
                  className={`no-touch-delay min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 whitespace-nowrap ${
                    preferences.autoQueueHealthConnect !== false
                      ? 'bg-blue-600 text-white'
                      : 'hl-subtle border text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {preferences.autoQueueHealthConnect !== false ? 'Enabled' : 'Off'}
                </button>
              </div>
            </div>

            {/* Google Fit Manual Actions & Recent Receipts */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Google Fit Cloud Activity Sync
                </div>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  raw:com.google.activity.segment:com.hyperlog.rp
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onSyncWorkoutWithGoogle && (
                  <button
                    type="button"
                    data-testid="settings-sync-google-fit-btn"
                    disabled={isSyncingGoogleFit}
                    onClick={() => void handleManualGoogleFitSync()}
                    className="no-touch-delay min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncingGoogleFit ? 'animate-spin' : ''}`} />
                    <span>{isSyncingGoogleFit ? 'Syncing Google Fit…' : 'Sync Latest Workout'}</span>
                  </button>
                )}

                {onClearGoogleSyncReceipts && googleSyncReceipts.length > 0 && (
                  <button
                    type="button"
                    data-testid="settings-clear-google-fit-btn"
                    onClick={async () => {
                      await onClearGoogleSyncReceipts();
                      setStatusMessage({
                        tone: 'success',
                        text: 'Cleared Google Fit sync receipts.',
                      });
                      window.setTimeout(() => setStatusMessage(null), 3500);
                    }}
                    className="no-touch-delay min-h-[42px] px-3.5 py-2 hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>Clear Receipts</span>
                  </button>
                )}
              </div>

              {googleSyncReceipts.length > 0 && (
                <div
                  data-testid="settings-google-fit-receipts-list"
                  className="divide-y divide-slate-200/80 dark:divide-slate-800 border-t border-slate-200/80 dark:border-slate-800 text-xs"
                >
                  {googleSyncReceipts.slice(0, 3).map((rec) => (
                    <div
                      key={rec.receiptId}
                      className="py-2 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {rec.workoutTitle}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {rec.completedSets} sets · {rec.estimatedCaloriesKcal} kcal · {rec.receiptId}
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                        {rec.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Android Health Connect Outbox & Export Actions */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Android Health Connect Sync &amp; Outbox
                </div>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  ExerciseSessionRecord · NutritionRecord
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onQueueSessionSync && (
                  <button
                    type="button"
                    data-testid="settings-queue-health-connect-btn"
                    disabled={isQueueingHealthConnect}
                    onClick={() => void handleManualHealthConnectQueue()}
                    className="no-touch-delay min-h-[42px] px-4 py-2 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-blue-500 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Queue Session to Health Connect</span>
                  </button>
                )}

                <button
                  type="button"
                  data-testid="settings-export-health-connect-json-btn"
                  onClick={handleExportHealthConnectJson}
                  className="no-touch-delay min-h-[42px] px-4 py-2 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-blue-500 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Export Health Connect (.JSON)</span>
                </button>

                {isRunningInAndroidStandaloneApk() && (
                  <button
                    type="button"
                    data-testid="settings-open-native-health-connect-btn"
                    onClick={() => {
                      const latest = workoutHistory[0];
                      if (latest) {
                        syncWorkoutToAndroidHealthConnect({
                          title: latest.title,
                          durationMinutes: latest.durationMinutes ?? 45,
                          completedSets: latest.totalSets,
                          tonnageKg: latest.totalTonnageKg,
                          activeCaloriesKcal: latest.estimatedCaloriesKcal,
                        });
                      }
                      const opened = openAndroidHealthConnectSettings();
                      setStatusMessage({
                        tone: opened ? 'success' : 'error',
                        text: opened
                          ? 'Opened Android Health Connect permissions and synced workout records.'
                          : 'Android Health Connect is not installed or enabled on this device.',
                      });
                      window.setTimeout(() => setStatusMessage(null), 4000);
                    }}
                    className="no-touch-delay min-h-[42px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Activity className="w-3.5 h-3.5 shrink-0" />
                    <span>Open Health Connect Permissions</span>
                  </button>
                )}

                {onClearSyncOutbox && syncOutbox.length > 0 && (
                  <button
                    type="button"
                    data-testid="settings-clear-health-outbox-btn"
                    onClick={async () => {
                      await onClearSyncOutbox();
                      setStatusMessage({
                        tone: 'success',
                        text: 'Cleared Android Health Connect outbox.',
                      });
                      window.setTimeout(() => setStatusMessage(null), 3500);
                    }}
                    className="no-touch-delay min-h-[42px] px-3.5 py-2 hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>Clear Outbox ({syncOutbox.length})</span>
                  </button>
                )}
              </div>

              {syncOutbox.length > 0 && (
                <div
                  data-testid="settings-health-outbox-list"
                  className="divide-y divide-slate-200/80 dark:divide-slate-800 border-t border-slate-200/80 dark:border-slate-800 text-xs"
                >
                  {syncOutbox.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      className="py-2 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {ev.recordType} · {ev.healthConnectType}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                          {ev.createdAt.slice(0, 19).replace('T', ' ')}
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                        {ev.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 3. Export All Data (Complete Historical Data, PDF Logbook, CSV & Full Backup) */}
          <section className="hl-card rounded-2xl p-4 sm:p-6 space-y-5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Export All Data &amp; Complete Workout History
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Export or share your entire historical workout logbook as a PDF, spreadsheet CSV, or full offline JSON backup
              </p>
            </div>

            {/* Clean Unboxed All-Time Historical Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Workout Days
                </div>
                <div className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {derivedHistory.lifetimeStats.totalWorkoutDays}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {derivedHistory.allRecords.length} total sessions
                </div>
              </div>

              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  All-Time Sets
                </div>
                <div className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {derivedHistory.lifetimeStats.totalSets.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {derivedHistory.lifetimeStats.totalReps.toLocaleString()} reps
                </div>
              </div>

              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Lifetime Volume
                </div>
                <div className="font-mono tabular-nums text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  {formatVolume(derivedHistory.lifetimeStats.totalTonnageKg)}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  All training blocks
                </div>
              </div>

              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Nutrition Logged
                </div>
                <div className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {nutritionDaysCount}d
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  Streak {widgetSnapshot.streakDays}d
                </div>
              </div>
            </div>

            {/* Primary Export All Data Actions */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Export All Historical Data
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadAllDataPdf}
                  disabled={exportingHistoryPdf || derivedHistory.allRecords.length === 0}
                  className="no-touch-delay min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>
                    {exportingHistoryPdf ? 'Generating PDF…' : 'Export All Data (.PDF)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleShareAllDataPdf}
                  disabled={sharingHistoryPdf || derivedHistory.allRecords.length === 0}
                  className="no-touch-delay min-h-[44px] px-4 py-2.5 bg-slate-900 dark:bg-slate-800 hover:opacity-90 text-white text-xs font-bold rounded-xl border border-slate-800 dark:border-slate-700 transition-opacity flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                  <Share2 className="w-4 h-4 shrink-0" />
                  <span>
                    {sharingHistoryPdf ? 'Preparing PDF…' : 'Share All History (.PDF)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleExportAllDataCsv}
                  disabled={derivedHistory.allRecords.length === 0}
                  className="no-touch-delay min-h-[44px] px-4 py-2.5 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-blue-500 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Export All Workouts (.CSV)</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await onExportBackup();
                    setStatusMessage({
                      tone: 'success',
                      text: 'Exported complete app data backup (.JSON) including all workouts, templates, and meals.',
                    });
                    window.setTimeout(() => setStatusMessage(null), 5000);
                  }}
                  className="no-touch-delay min-h-[44px] px-4 py-2.5 hl-subtle border text-slate-800 dark:text-slate-100 hover:border-blue-500 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Export Full App Data (.JSON)</span>
                </button>
              </div>
            </div>

            {/* Optional Expandable Complete Historical Sessions Browser */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <button
                type="button"
                onClick={() => setShowAllHistoryFeed((v) => !v)}
                className="no-touch-delay w-full min-h-[42px] px-3.5 py-2 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 transition-colors flex items-center justify-between gap-2"
              >
                <span>
                  Browse All Historical Workout Data ({derivedHistory.allRecords.length} sessions)
                </span>
                {showAllHistoryFeed ? (
                  <ChevronUp className="w-4 h-4 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" />
                )}
              </button>

              {showAllHistoryFeed && (
                <div className="space-y-3 pt-1">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      placeholder="Filter sessions by exercise, muscle, or date…"
                      className="w-full min-h-[40px] pl-9 pr-9 py-2 text-xs hl-input rounded-xl"
                    />
                    {historySearchQuery && (
                      <button
                        type="button"
                        onClick={() => setHistorySearchQuery('')}
                        className="no-touch-delay min-h-[34px] min-w-[34px] absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        aria-label="Clear filter"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {filteredAllRecords.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                      No historical sessions match &ldquo;{historySearchQuery}&rdquo;.
                    </p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-200/80 dark:divide-slate-800 pr-1">
                      {filteredAllRecords.map((rec) => (
                        <div
                          key={rec.id}
                          className="py-2.5 flex items-center justify-between gap-3 text-left"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {formatHumanDateShort(rec.date)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{rec.exercises.length} exercises</span>
                            </div>
                            <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate mt-0.5">
                              {rec.title}
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-mono tabular-nums">
                            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                              {rec.totalSets} sets
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {formatVolume(rec.totalTonnageKg)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Secondary Restore & Factory Reset Controls */}
            <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="no-touch-delay min-h-[42px] px-4 py-2 hl-subtle border text-slate-800 dark:text-slate-200 hover:border-slate-400 text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span>Import Backup (.JSON)</span>
              </button>

              {!confirmReset ? (
                <button
                  type="button"
                  data-testid="settings-dayzero-reset-btn"
                  onClick={() => setConfirmReset(true)}
                  className="no-touch-delay min-h-[42px] px-4 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-950/80 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Reset to Day Zero</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="settings-confirm-dayzero-reset-btn"
                    onClick={async () => {
                      await onResetDefaults();
                      setConfirmReset(false);
                      setStatusMessage({
                        tone: 'success',
                        text: 'Database & logs reset to Day-Zero Clean Slate (0 workouts, 0 meals, 0d streak).',
                      });
                    }}
                    className="no-touch-delay min-h-[42px] px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl whitespace-nowrap"
                  >
                    Confirm Day-Zero Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="no-touch-delay min-h-[42px] px-3 py-2 text-xs font-semibold hl-subtle border rounded-xl text-slate-600 dark:text-slate-300 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* 3B. Day-Zero Structured Telemetry & Log Lifecycle Management */}
          <section
            data-testid="settings-telemetry-card"
            className="hl-card rounded-2xl p-4 sm:p-6 space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Day-Zero Telemetry &amp; Log Lifecycle</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Captures startup metrics, workout actions, and errors in a 500-event ring buffer with zero legacy test data.
                </p>
              </div>
              <span
                data-testid="settings-live-log-count"
                className="text-xs font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300"
              >
                {liveTelemetryLogs.length} / 500 Live Events
              </span>
            </div>

            <div className="text-xs font-mono text-slate-600 dark:text-slate-300 hl-subtle rounded-xl p-3 border space-y-1">
              <div>Genesis Epoch: {getDayZeroEpochIso()}</div>
              <div>
                Latest Event: {liveTelemetryLogs[0]?.event ?? 'DAY_ZERO_CLEAN_SLATE_INITIALIZED'} (
                {liveTelemetryLogs[0]?.level ?? 'INFO'})
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                data-testid="settings-archive-logs-btn"
                onClick={async () => {
                  const res = await archiveTelemetryLogs({ downloadJsonFile: true });
                  setStatusMessage({
                    tone: 'success',
                    text: `Archived ${res.summary.entriesCount} log entries to ${res.summary.fileName} and rotated live ring buffer.`,
                  });
                }}
                className="no-touch-delay min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Archive className="w-3.5 h-3.5 shrink-0" />
                <span>Archive Logs (.JSON)</span>
              </button>

              <button
                type="button"
                data-testid="settings-purge-logs-btn"
                onClick={async () => {
                  await purgeTelemetryLogs({ resetDayZeroEpoch: false, includeArchives: false });
                  setStatusMessage({
                    tone: 'success',
                    text: 'Purged live telemetry logs cleanly while keeping Day-Zero genesis marker.',
                  });
                }}
                className="no-touch-delay min-h-[42px] px-4 py-2 rounded-xl hl-subtle border text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>Purge Live Logs</span>
              </button>

              {onOpenClayDesignStudio && (
                <button
                  type="button"
                  onClick={onOpenClayDesignStudio}
                  className="no-touch-delay min-h-[42px] px-4 py-2 rounded-xl hl-subtle border text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Inspect Live Logs</span>
                </button>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Home Screen Progress & Streak Widget + Native Android APK v2.0 */}
        <div className="lg:col-span-5 space-y-6">
          {/* 4. Native Android Home Screen Progress & Streak Widget Preview (Dynamic RemoteViews Grid) */}
          <section className="hl-card rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="space-y-2.5">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Home Screen Progress &amp; Streak Widget
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Dynamic RemoteViews GridLayout scaling weekly mesocycle set progress bars and streak count across phone sizes
                </p>
              </div>

              {/* Phone Screen Size / Widget Grid Scaler */}
              <div
                className="grid grid-cols-3 gap-1.5 p-1 rounded-xl hl-subtle border"
                role="tablist"
                aria-label="Preview widget display scaling"
              >
                {(
                  [
                    { id: 'compact', label: 'Small (320dp)' },
                    { id: 'standard', label: 'Standard 4×2' },
                    { id: 'expanded', label: 'Large / 4×3' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={widgetGridPreview === opt.id}
                    onClick={() => setWidgetGridPreview(opt.id)}
                    className={`no-touch-delay min-h-[34px] px-2 py-1 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      widgetGridPreview === opt.id
                        ? 'bg-slate-900 dark:bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Authentic Dark Obsidian RemoteViews Grid Replica */}
            <div
              className={`rounded-2xl bg-[#0C1324] border border-slate-800 text-white shadow-sm mx-auto transition-all ${
                widgetGridPreview === 'compact'
                  ? 'max-w-[270px] p-3 space-y-2.5'
                  : widgetGridPreview === 'expanded'
                  ? 'w-full p-4 space-y-3.5'
                  : 'w-full p-3.5 space-y-3'
              }`}
            >
              {/* Header + Readable Streak Counter */}
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src="/pwa-192x192.png"
                    alt="HyperLog crest icon"
                    referrerPolicy="no-referrer"
                    className={`${
                      widgetGridPreview === 'compact' ? 'w-6 h-6' : 'w-7 h-7'
                    } rounded-lg shrink-0 object-cover`}
                  />
                  <div className="min-w-0">
                    <div
                      className={`${
                        widgetGridPreview === 'expanded'
                          ? 'text-sm'
                          : widgetGridPreview === 'compact'
                          ? 'text-xs'
                          : 'text-[13px]'
                      } font-bold tracking-tight text-white truncate`}
                    >
                      {widgetGridPreview === 'expanded' ? 'HyperLog · Mesocycle' : 'HyperLog'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono tabular-nums truncate">
                      {widgetGridPreview === 'compact'
                        ? `Wk ${widgetSnapshot.activeWeek} · Best ${widgetSnapshot.bestStreakDays}d`
                        : `Wk ${widgetSnapshot.activeWeek} · Best ${widgetSnapshot.bestStreakDays}d`}
                    </div>
                  </div>
                </div>

                <div className="px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-500/45 text-orange-300 text-xs font-bold font-mono tabular-nums flex items-center gap-1 shrink-0">
                  <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span>
                    {widgetGridPreview === 'compact'
                      ? `${widgetSnapshot.streakDays}d`
                      : `${widgetSnapshot.streakDays}d Streak`}
                  </span>
                </div>
              </div>

              {/* 7-Column RemoteViews GridLayout Day Strip */}
              <div className="grid grid-cols-7 gap-1">
                {widgetSnapshot.weekDays.map((d) => (
                  <div
                    key={d.iso}
                    className={`py-1 rounded-md text-center font-mono font-bold border ${
                      widgetGridPreview === 'compact' ? 'text-[10px]' : 'text-[11px]'
                    } ${
                      d.active && d.isToday
                        ? 'bg-orange-500/20 border-orange-500/60 text-orange-200'
                        : d.active
                        ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
                        : 'bg-slate-900/90 border-slate-800 text-slate-500'
                    }`}
                  >
                    {widgetGridPreview === 'compact'
                      ? `${d.dayLetter}${d.active ? '✓' : ''}`
                      : `${d.dayLetter} ${d.active ? '●' : '○'}`}
                  </div>
                ))}
              </div>

              {/* Dynamic RemoteViews GridLayout: 1-Column on Small Displays, 2-Column on Standard/Large */}
              {widgetGridPreview === 'compact' ? (
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => onJumpToTab(AppTab.TrackSets)}
                    className="no-touch-delay p-2.5 rounded-xl bg-[#141F38] hover:bg-slate-800/90 border border-slate-800 text-left transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums">
                      <span className="font-bold text-sky-300">
                        WK {widgetSnapshot.activeWeek} SETS
                      </span>
                      <span className="font-bold text-white">
                        {widgetSnapshot.completedSets}/{widgetSnapshot.plannedSets} sets
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${setsPct}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-slate-400">
                      {setsPct}% done · Tap to Track →
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onJumpToTab(AppTab.Calories)}
                    className="no-touch-delay p-2.5 rounded-xl bg-[#141F38] hover:bg-slate-800/90 border border-slate-800 text-left transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums">
                      <span className="font-bold text-orange-300">NUTRITION</span>
                      <span className="font-bold text-white">
                        {widgetSnapshot.todayCalories}/{widgetSnapshot.targetCalories}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-orange-400 rounded-full"
                        style={{ width: `${kcalPct}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-slate-400">
                      P {widgetSnapshot.todayProteinG}/{widgetSnapshot.targetProteinG}g · Tap Meals →
                    </div>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => onJumpToTab(AppTab.TrackSets)}
                      className="no-touch-delay p-2.5 rounded-xl bg-[#141F38] hover:bg-slate-800/90 border border-slate-800 text-left transition-colors space-y-1.5"
                    >
                      <div className="text-[10px] font-bold text-sky-300 tracking-wide">
                        WEEKLY MESO SETS
                      </div>
                      <div className="text-xs font-mono tabular-nums font-bold text-white">
                        {widgetSnapshot.completedSets} / {widgetSnapshot.plannedSets} sets
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${setsPct}%` }}
                        />
                      </div>
                      <div className="text-[10px] font-mono tabular-nums text-slate-400">
                        {setsPct}% of Wk {widgetSnapshot.activeWeek} · Track →
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onJumpToTab(AppTab.Calories)}
                      className="no-touch-delay p-2.5 rounded-xl bg-[#141F38] hover:bg-slate-800/90 border border-slate-800 text-left transition-colors space-y-1.5"
                    >
                      <div className="text-[10px] font-bold text-orange-300 tracking-wide">
                        TODAY NUTRITION
                      </div>
                      <div className="text-xs font-mono tabular-nums font-bold text-white">
                        {widgetSnapshot.todayCalories} / {widgetSnapshot.targetCalories}
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-orange-400 rounded-full"
                          style={{ width: `${kcalPct}%` }}
                        />
                      </div>
                      <div className="text-[10px] font-mono tabular-nums text-slate-400">
                        P {widgetSnapshot.todayProteinG}/{widgetSnapshot.targetProteinG}g ({proteinPct}%)
                      </div>
                    </button>
                  </div>

                  {/* 2x2 RemoteViews GridLayout for Weekly Mesocycle Split Set Progress Bars */}
                  <button
                    type="button"
                    onClick={() => onJumpToTab(AppTab.TrackSets)}
                    className="no-touch-delay w-full p-2.5 rounded-xl bg-[#141F38] hover:bg-slate-800/90 border border-slate-800 text-left transition-colors"
                  >
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {widgetSnapshot.mesoSplitBars.map((bar, idx) => (
                        <div key={bar.id} className="space-y-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 text-[10px] font-mono tabular-nums text-slate-200">
                            <span className="font-semibold truncate">
                              {widgetGridPreview === 'expanded' ? bar.fullTitle : bar.shortTitle}
                            </span>
                            <span className="text-slate-300 shrink-0">
                              {bar.completedSets}/{bar.plannedSets}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                splitBarColors[idx % splitBarColors.length]
                              }`}
                              style={{ width: `${bar.progressPct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              <span>{lastWidgetSync.trigger}</span>
              <span aria-hidden="true">·</span>
              <span>{lastWidgetSync.timeLabel}</span>
            </div>

            {isRunningInAndroidStandaloneApk() && (
              <button
                type="button"
                data-testid="settings-pin-android-widget-btn"
                onClick={() => {
                  const pinned = requestPinAndroidHomeWidget();
                  setStatusMessage({
                    tone: 'success',
                    text: pinned
                      ? 'Requested Android launcher to pin the HyperLog Streak & Progress Widget.'
                      : 'Long-press your Android Home Screen → Widgets → HyperLog to place the live widget.',
                  });
                  window.setTimeout(() => setStatusMessage(null), 4000);
                }}
                className="no-touch-delay w-full min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span>Pin Live Streak Widget to Home Screen</span>
              </button>
            )}

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Automatically adapts via Android 12+ responsive <code className="font-mono">SizeF</code>{' '}
              buckets and <code className="font-mono">smallestScreenWidthDp</code> font scaling so
              weekly mesocycle set progress bars and your streak count remain sharp on compact and
              large displays alike.
            </p>
          </section>

          {/* 4B. Organized Internal Storage Folders & Startup Training Package (HyperLogData/) */}
          <section
            data-testid="storage-package-settings-card"
            className="hl-card rounded-2xl p-4 sm:p-6 space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Internal Storage Folders &amp; Training Package
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Game-style startup package unpacked into <code className="font-mono">HyperLogData/</code> folders for instant loading
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                v{trainingPackageStatus?.packageVersion ?? '4.0.0'} ·{' '}
                {trainingPackageStatus?.installed ? 'READY' : 'SEEDED'}
              </span>
            </div>

            <div className="divide-y divide-slate-200/80 dark:divide-slate-800 border-y border-slate-200/80 dark:divide-slate-800 text-xs">
              {(
                trainingPackageStatus?.folders ?? [
                  {
                    folderPath: 'HyperLogData/database/',
                    category: 'database' as const,
                    fileCount: 4,
                    sizeBytes: 48200,
                    updatedAt: todayIso,
                  },
                  {
                    folderPath: 'HyperLogData/training/',
                    category: 'training' as const,
                    fileCount: 4,
                    sizeBytes: 96400,
                    updatedAt: todayIso,
                  },
                  {
                    folderPath: 'HyperLogData/nutrition/',
                    category: 'nutrition' as const,
                    fileCount: 2,
                    sizeBytes: 38400,
                    updatedAt: todayIso,
                  },
                  {
                    folderPath: 'HyperLogData/wellness/',
                    category: 'wellness' as const,
                    fileCount: 1,
                    sizeBytes: 12400,
                    updatedAt: todayIso,
                  },
                  {
                    folderPath: 'HyperLogData/videos/offline_saved/',
                    category: 'videos' as const,
                    fileCount: 12,
                    sizeBytes: 64200,
                    updatedAt: todayIso,
                  },
                  {
                    folderPath: 'HyperLogData/logs/',
                    category: 'logs' as const,
                    fileCount: 1,
                    sizeBytes: 4200,
                    updatedAt: todayIso,
                  },
                ]
              ).map((folder) => (
                <div
                  key={folder.folderPath}
                  className="py-2.5 flex items-center justify-between gap-3 font-mono tabular-nums"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {folder.folderPath}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 shrink-0">
                    {folder.fileCount} files · {(folder.sizeBytes / 1024).toFixed(0)} KB
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
              <div>
                <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                  Exercises
                </div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                  {trainingPackageStatus?.totalExercises ?? 240}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                  Video Guides
                </div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                  {trainingPackageStatus?.totalVideoGuides ?? 180}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                  Storage Folders
                </div>
                <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {trainingPackageStatus?.folders.length ?? 6}
                </div>
              </div>
            </div>

            {onRedownloadTrainingPackage && (
              <button
                type="button"
                data-testid="redownload-package-btn"
                disabled={isRedownloadingPkg}
                onClick={() => void handleRedownloadPackageClick()}
                className="no-touch-delay w-full min-h-[42px] px-4 py-2 hl-subtle border hover:border-blue-500 text-xs font-semibold text-slate-800 dark:text-slate-100 rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRedownloadingPkg ? 'animate-spin' : ''}`} />
                <span>
                  {isRedownloadingPkg
                    ? 'Downloading & Unpacking Training Package…'
                    : 'Re-Download Training Package (v4.0.0)'}
                </span>
              </button>
            )}
          </section>

          {/* 5. Full Phone Application Install Hub (Native Android APK v4.0 + Standalone PWA) */}
          <section className="hl-card rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <img
                src="/pwa-192x192.png"
                alt="HyperLog vibrant dumbbell flame crest"
                width={56}
                height={56}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-2xl shrink-0 object-cover border border-slate-700/40"
              />
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {isRunningInAndroidStandaloneApk()
                    ? 'Native Android Standalone App Active (v4.0.0 · Build 18)'
                    : 'Run HyperLog on Your Phone (v4.0.0 · Build 18)'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-all sm:break-normal">
                  {isRunningInAndroidStandaloneApk()
                    ? '100% Unified Web & Android UI/UX · Offline Asset Engine · Live Home Screen Widget & Health Connect Bridge Active'
                    : `${APK_FILE_NAME} · 100% Unified Web & Android UI/UX across all 6 pages · Offline Standalone Engine`}
                </p>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <a
                href={`${getFreshApkHref()}&t=${Date.now()}`}
                download={APK_FILE_NAME}
                onClick={(e) => {
                  e.currentTarget.href = `${getFreshApkHref()}&t=${Date.now()}`;
                  setApkDownloading('done');
                  window.setTimeout(() => setApkDownloading('idle'), 4500);
                }}
                className="w-full min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {apkDownloading === 'done' ? (
                  <>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Downloading Signed .APK (v4.0.0)</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-4 h-4 shrink-0" />
                    <span>Download Signed Android .APK (v4.0.0)</span>
                  </>
                )}
              </a>

              <a
                href={`${getFreshBundleHref()}&t=${Date.now()}`}
                download={BUNDLE_ZIP_FILE_NAME}
                onClick={(e) => {
                  e.currentTarget.href = `${getFreshBundleHref()}&t=${Date.now()}`;
                  setBundleDownloading('done');
                  window.setTimeout(() => setBundleDownloading('idle'), 4500);
                }}
                className="w-full min-h-[44px] px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <FolderArchive className="w-4 h-4 shrink-0" />
                <span>
                  {bundleDownloading === 'done'
                    ? 'Downloading Phone Bundle v4.0 (.ZIP)…'
                    : 'Download Phone APK + Testing Bundle v4.0 (.ZIP)'}
                </span>
              </a>

              <PWAInstallButton />

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handleVerifiedApkDownload}
                  disabled={apkDownloading === 'downloading'}
                  className="no-touch-delay min-h-[44px] px-2.5 py-2 hl-subtle border text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 rounded-xl transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {apkDownloading === 'downloading'
                      ? apkProgressMb || 'Verifying…'
                      : 'Verified Stream'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onOpenInstallGuide}
                  className="no-touch-delay min-h-[44px] px-2.5 py-2 hl-subtle border text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 rounded-xl transition-colors whitespace-nowrap"
                >
                  Install Steps
                </button>

                <a
                  href={SOURCE_ZIP_DOWNLOAD_PATH}
                  download={SOURCE_ZIP_FILE_NAME}
                  onClick={() => {
                    setZipDownloading('done');
                    window.setTimeout(() => setZipDownloading('idle'), 3500);
                  }}
                  className="min-h-[44px] px-2.5 py-2 hl-subtle border text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 rounded-xl transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <FolderArchive className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{zipDownloading === 'done' ? 'Saved' : 'Source .ZIP'}</span>
                </a>
              </div>
            </div>
          </section>

          {/* 6. Post-Testing Beta Feedback & Bug Triage Loop */}
          <BetaFeedbackPanel />
        </div>
      </div>
    </div>
  );
});
PageSettings.displayName = 'PageSettings';

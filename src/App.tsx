/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookMarked,
  Calendar,
  Check,
  Download,
  Dumbbell,
  Heart,
  Settings,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  ActiveStandaloneSession,
  ActiveWorkoutRunState,
  AppPreferences,
  AppTab,
  AppTheme,
  DailyNutritionRecord,
  ExercisePrescription,
  GoogleWorkoutSyncReceipt,
  LibraryExercise,
  MealEntry,
  MuscleAutoregulationFeedback,
  MuscleId,
  MuscleLandmark,
  NutritionGoals,
  OnlineCatalogSyncResponse,
  SavedCustomMeal,
  SetLogEntry,
  SyncOutboxEvent,
  TemplateExerciseItem,
  TrainingPackageStatus,
  WellbeingDailyRecord,
  WorkoutDayPlan,
  WorkoutHistoryRecord,
  WorkoutTemplate,
} from './types/workout';
import {
  DEFAULT_MUSCLE_LANDMARKS,
  INITIAL_WORKOUT_PLAN,
  MESOCYCLE_WEEKS,
} from './data/rpPlanData';
import {
  clearSyncOutbox,
  computeWidgetProgressSnapshot,
  DEFAULT_APP_PREFERENCES,
  DEFAULT_NUTRITION_GOALS,
  deleteIsolatedUserDatabase,
  deleteSetLog,
  deleteWorkoutHistoryRecord,
  deleteWorkoutTemplate,
  enqueueSyncEvent,
  exportFullBackupJSON,
  importFullBackupJSON,
  initializeDatabaseIfNeeded,
  loadAllDatabaseState,
  loadFullExerciseLibrary,
  prioritizeExercisesForLogin,
  replaceUncompletedDaySetLogs,
  resetDatabaseToDefaults,
  saveActiveStandaloneSession,
  saveActiveWeek,
  saveActiveWorkoutRunState,
  saveAppPreferences,
  saveBulkLibraryExercises,
  saveBulkSetLogs,
  saveBulkWorkoutTemplates,
  saveDailyNutrition,
  saveDailyWellbeing,
  saveGoogleSyncReceipts,
  saveLibraryExercise,
  saveMuscleFeedback,
  saveMuscleLandmark,
  saveNutritionGoals,
  saveSavedCustomMeals,
  saveSetLog,
  saveWorkoutDayPlan,
  saveWorkoutHistoryRecord,
  saveWorkoutTemplate,
  setActiveUserStorageNamespace,
  verifyAndRepairDatabaseParity,
} from './db/localStore';
import {
  compareSetLogsDeterministic,
  computeSetLogsParityChecksum,
  sanitizeSetLogEntry,
} from './utils/setLogNumeric';
import { computeSetLogsParityChecksumAsync } from './utils/checksumWorkerClient';
import {
  buildHistoryRecordFromSessionLogs,
  downloadBlobFile,
  formatLocalDateISO,
  generateDateWorkoutPdfBlob,
  getDeterministicSessionId,
  resolveSetLogDateISO,
  shareOrDownloadPdfBlob,
} from './utils/workoutHistory';
import {
  isRunningInAndroidStandaloneApk,
  setAndroidKeepScreenOn,
  syncAndroidHomeWidget,
  syncAndroidTheme,
  syncWorkoutToAndroidHealthConnect,
  triggerAndroidHaptic,
} from './utils/nativeAndroidBridge';
import { PastWorkoutExerciseDraft } from './components/WorkoutCalendar';
import { Page2TrackSets } from './components/Page2TrackSets';
import type { WellnessSubTab } from './components/PageWellnessHub';
import type { PackageDownloadProgress } from './utils/trainingPackageManager';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import {
  LiveWorkoutClock,
  MinimizedWorkoutBar,
  computeElapsedFromRunState,
} from './components/MinimizedWorkoutBar';
import { ExpandableInfoDropdown } from './components/ExpandableInfoDropdown';
import {
  initializeDayZeroTelemetry,
  logTelemetryEvent,
  measureAsyncMetric,
  purgeTelemetryLogs,
} from './services/telemetryLogger';
import {
  APK_FILE_NAME,
  BUNDLE_ZIP_FILE_NAME,
  downloadFullPhoneBundleZip,
  downloadSignedApk,
  getFreshApkHref,
  getFreshBundleHref,
} from './utils/apkDownload';
import { playTimerSetTone } from './utils/timerAudio';
import { fetchOnlineCatalogDirect } from './utils/onlineCatalogMapper';
import type {
  ComplianceAuditEntry,
  UserAccountProfile,
  UserPrivacyConsentSettings,
} from './services/userManagementService';

const loadPage1Anatomy = () =>
  import('./components/Page1Anatomy').then((m) => ({ default: m.Page1Anatomy }));
const loadPage3Workouts = () =>
  import('./components/Page3Workouts').then((m) => ({ default: m.Page3Workouts }));
const loadPageLibrary = () =>
  import('./components/PageLibrary').then((m) => ({ default: m.PageLibrary }));
const loadPageWellnessHub = () =>
  import('./components/PageWellnessHub').then((m) => ({ default: m.PageWellnessHub }));
const loadPageSettings = () =>
  import('./components/PageSettings').then((m) => ({ default: m.PageSettings }));
const loadPageWorkoutComplete = () =>
  import('./components/PageWorkoutComplete').then((m) => ({ default: m.PageWorkoutComplete }));

const Page1Anatomy = lazy(loadPage1Anatomy);
const Page3Workouts = lazy(loadPage3Workouts);
const PageLibrary = lazy(loadPageLibrary);
const PageWellnessHub = lazy(loadPageWellnessHub);
const PageSettings = lazy(loadPageSettings);
const PageWorkoutComplete = lazy(loadPageWorkoutComplete);

const TechnicalGuideModal = lazy(() =>
  import('./components/TechnicalGuideModal').then((m) => ({ default: m.TechnicalGuideModal }))
);
const GlassmorphismDesignGuideModal = lazy(() =>
  import('./components/GlassmorphismDesignGuideModal').then((m) => ({
    default: m.GlassmorphismDesignGuideModal,
  }))
);
const ClaymorphismDesignStudioModal = lazy(() =>
  import('./components/ClaymorphismDesignStudioModal').then((m) => ({
    default: m.ClaymorphismDesignStudioModal,
  }))
);
const UserAuthAndPrivacyModal = lazy(() =>
  import('./components/UserAuthAndPrivacyModal').then((m) => ({
    default: m.UserAuthAndPrivacyModal,
  }))
);

let hasPreloadedTabChunks = false;
function preloadPrimaryTabChunks(): void {
  if (hasPreloadedTabChunks) return;
  hasPreloadedTabChunks = true;
  void Promise.allSettled([
    loadPage1Anatomy(),
    loadPage3Workouts(),
    loadPageLibrary(),
    loadPageWellnessHub(),
    loadPageSettings(),
  ]);
}

function parseDefaultRepTarget(repRange: string): number {
  const match = repRange.match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : 10;
}

function findLatestCompletedSetForExercise(
  logs: SetLogEntry[],
  exerciseName: string
): SetLogEntry | undefined {
  const key = exerciseName.trim().toLowerCase();
  if (!key) return undefined;
  const matches = logs.filter(
    (s) => s.completed && s.exerciseName.trim().toLowerCase() === key
  );
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => {
    const aT = a.completedAt ?? a.completedDate ?? '';
    const bT = b.completedAt ?? b.completedDate ?? '';
    if (aT !== bT) return aT < bT ? 1 : -1;
    return b.week - a.week;
  });
  return matches[0];
}

function getInitialTheme(): AppTheme {
  try {
    const saved = window.localStorage.getItem('hyperlog_theme_v4') as AppTheme | null;
    if (
      saved === AppTheme.Claymorphism ||
      saved === AppTheme.ClayDark ||
      saved === AppTheme.Daylight ||
      saved === AppTheme.PastelGlass ||
      saved === AppTheme.NightSlate ||
      saved === AppTheme.Amoled ||
      saved === AppTheme.Graphite
    ) {
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  return AppTheme.Claymorphism;
}

const THEME_META_COLOR: Record<AppTheme, string> = {
  [AppTheme.Claymorphism]: '#F3F1FF',
  [AppTheme.ClayDark]: '#121426',
  [AppTheme.Daylight]: '#F8FAFC',
  [AppTheme.PastelGlass]: '#EEF4FF',
  [AppTheme.NightSlate]: '#0B1120',
  [AppTheme.Amoled]: '#000000',
  [AppTheme.Graphite]: '#121316',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.TrackSets);
  const [optimisticTab, setOptimisticTab] = useState<AppTab | null>(null);
  const [pressedNavKey, setPressedNavKey] = useState<string | null>(null);
  const appRootRef = useRef<HTMLDivElement | null>(null);
  const [trackSubView, setTrackSubView] = useState<'log' | 'calendar'>('log');
  const [lastNonTrackerTab, setLastNonTrackerTab] = useState<AppTab>(AppTab.Workouts);
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme);
  const [activeWeek, setActiveWeek] = useState<number>(1);
  const [activeDay, setActiveDay] = useState<number>(1);
  const [isScheduleDaySelected, setIsScheduleDaySelected] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  const [plan, setPlan] = useState<WorkoutDayPlan[]>(INITIAL_WORKOUT_PLAN);
  const [landmarks, setLandmarks] =
    useState<Record<MuscleId, MuscleLandmark>>(DEFAULT_MUSCLE_LANDMARKS);
  const [setLogs, setSetLogs] = useState<SetLogEntry[]>([]);
  const [feedback, setFeedback] = useState<Record<string, MuscleAutoregulationFeedback>>({});
  const [nutritionByDate, setNutritionByDate] = useState<Record<string, DailyNutritionRecord>>({});
  const [nutritionGoals, setNutritionGoals] = useState<NutritionGoals>(DEFAULT_NUTRITION_GOALS);
  const [savedCustomMeals, setSavedCustomMeals] = useState<SavedCustomMeal[]>([]);
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(DEFAULT_APP_PREFERENCES);
  const [syncOutbox, setSyncOutbox] = useState<SyncOutboxEvent[]>([]);
  const [exerciseLibrary, setExerciseLibrary] = useState<LibraryExercise[]>([]);
  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplate[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutHistoryRecord[]>([]);
  const [wellbeingByDate, setWellbeingByDate] = useState<Record<string, WellbeingDailyRecord>>({});
  const [isSyncingOnline, setIsSyncingOnline] = useState<boolean>(false);
  const [activeStandaloneSession, setActiveStandaloneSession] =
    useState<ActiveStandaloneSession | null>(null);
  const [activeWorkoutRunState, setActiveWorkoutRunState] =
    useState<ActiveWorkoutRunState | null>(null);
  const [trackFocusNonce, setTrackFocusNonce] = useState<number>(0);
  const [trackerRefreshNonce, setTrackerRefreshNonce] = useState<number>(0);
  const [completedWorkoutView, setCompletedWorkoutView] = useState<{
    record: WorkoutHistoryRecord;
    cardioMinutes: number;
  } | null>(null);
  const [googleSyncReceipts, setGoogleSyncReceipts] = useState<GoogleWorkoutSyncReceipt[]>([]);
  const [trainingPackageStatus, setTrainingPackageStatus] = useState<TrainingPackageStatus | null>(
    null
  );
  const [packageDownloadProgress, setPackageDownloadProgress] =
    useState<PackageDownloadProgress | null>(null);

  const setLogsRef = useRef<SetLogEntry[]>([]);
  const pendingWritesRef = useRef<number>(0);
  const parityCheckRunningRef = useRef<boolean>(false);

  const updateSetLogsSync = useCallback(
    (updater: SetLogEntry[] | ((prev: SetLogEntry[]) => SetLogEntry[])): SetLogEntry[] => {
      const prev = setLogsRef.current;
      const rawNext = typeof updater === 'function' ? updater(prev) : updater;
      const normalized = rawNext
        .map((item) => sanitizeSetLogEntry(item))
        .sort(compareSetLogsDeterministic);
      setLogsRef.current = normalized;
      setSetLogs(normalized);
      return normalized;
    },
    []
  );

  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isGlassGuideOpen, setIsGlassGuideOpen] = useState<boolean>(false);
  const [isClayStudioOpen, setIsClayStudioOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserAccountProfile | null>(null);
  const [userConsent, setUserConsent] = useState<UserPrivacyConsentSettings | null>(null);
  const [userAuditLogs, setUserAuditLogs] = useState<ComplianceAuditEntry[]>([]);
  const [requiresMfaChallenge, setRequiresMfaChallenge] = useState<boolean>(false);
  const [showApkBanner, setShowApkBanner] = useState<boolean>(() => {
    if (isRunningInAndroidStandaloneApk()) {
      return false;
    }
    try {
      return window.localStorage.getItem('hyperlog_dismiss_apk_banner') !== '1';
    } catch {
      return true;
    }
  });
  const [quickApkState, setQuickApkState] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle');
  const [quickBundleState, setQuickBundleState] = useState<'idle' | 'downloading' | 'done'>('idle');
  const [lastWidgetSync, setLastWidgetSync] = useState<{
    trigger: string;
    timeLabel: string;
  }>({
    trigger: 'Initial SQLite Sync',
    timeLabel: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  });

  const recordWidgetUpdateTrigger = (trigger: string) => {
    setLastWidgetSync({
      trigger,
      timeLabel: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    });
  };

  const handleQuickApkDownload = async () => {
    if (quickApkState === 'downloading') return;
    setQuickApkState('downloading');
    const res = await downloadSignedApk();
    setQuickApkState(res.ok ? 'done' : 'error');
    window.setTimeout(() => setQuickApkState('idle'), 4500);
  };

  const handleQuickBundleDownload = async () => {
    if (quickBundleState === 'downloading') return;
    setQuickBundleState('downloading');
    const res = await downloadFullPhoneBundleZip();
    setQuickBundleState(res.ok ? 'done' : 'idle');
    window.setTimeout(() => setQuickBundleState('idle'), 4500);
  };

  const isDark =
    theme !== AppTheme.Claymorphism &&
    theme !== AppTheme.Daylight &&
    theme !== AppTheme.PastelGlass;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (
      theme === AppTheme.Claymorphism ||
      theme === AppTheme.Daylight ||
      theme === AppTheme.PastelGlass
    ) {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
    try {
      window.localStorage.setItem('hyperlog_theme_v4', theme);
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute('content', THEME_META_COLOR[theme]);
      }
    } catch {
      // Ignore storage errors
    }
    syncAndroidTheme(theme);
  }, [theme]);

  const [totalLibraryCatalogCount, setTotalLibraryCatalogCount] = useState<number>(870);
  const [isHydratingFullLibrary, setIsHydratingFullLibrary] = useState<boolean>(false);
  const [wellnessInitialSubTab, setWellnessInitialSubTab] =
    useState<WellnessSubTab>('wellbeing');
  const [wellnessFocusNonce, setWellnessFocusNonce] = useState<number>(0);

  const applyDatabaseSnapshot = useCallback(
    (
      state: Awaited<ReturnType<typeof loadAllDatabaseState>>,
      options?: { preserveScheduleSelection?: boolean }
    ) => {
      setPlan(state.plan);
      setLandmarks(state.landmarks);
      updateSetLogsSync(state.setLogs);
      setFeedback(state.feedback);
      setNutritionByDate(state.nutritionByDate);
      setNutritionGoals(state.nutritionGoals);
      setSyncOutbox(state.syncOutbox);
      setActiveWeek(state.activeWeek);
      setActiveStandaloneSession(state.activeStandaloneSession);
      setActiveWorkoutRunState(state.activeWorkoutRunState);
      setIsScheduleDaySelected((prev) =>
        Boolean(
          state.activeWorkoutRunState?.isActive &&
            state.activeWorkoutRunState.mode === 'schedule'
        ) || Boolean(options?.preserveScheduleSelection && prev)
      );
      setExerciseLibrary(state.exerciseLibrary);
      setTotalLibraryCatalogCount(
        state.totalExerciseLibraryCount ?? state.exerciseLibrary.length
      );
      setWorkoutTemplates(state.workoutTemplates);
      setWorkoutHistory(state.workoutHistory);
      setSavedCustomMeals(state.savedCustomMeals);
      setAppPreferences(state.appPreferences);
      setWellbeingByDate(state.wellbeingByDate);
      setGoogleSyncReceipts(state.googleSyncReceipts ?? []);
      setTrainingPackageStatus(state.trainingPackageStatus ?? null);
    },
    [updateSetLogsSync]
  );

  const runStartupPackageDownload = useCallback(
    async (
      forceRedownload: boolean,
      baseExercises: LibraryExercise[],
      baseTemplates: WorkoutTemplate[]
    ) => {
      try {
        const { downloadAndUnpackStartupTrainingPackage } = await import(
          './utils/trainingPackageManager'
        );
        const res = await downloadAndUnpackStartupTrainingPackage({
          forceRedownload,
          existingExercises: baseExercises,
          existingTemplates: baseTemplates,
          onProgress: (prog) => setPackageDownloadProgress(prog),
        });
        setExerciseLibrary(res.mergedExercises);
        setWorkoutTemplates(res.mergedTemplates);
        setTrainingPackageStatus(res.status);
        recordWidgetUpdateTrigger('Training Resource Package Unpacked');
      } finally {
        window.setTimeout(() => {
          setPackageDownloadProgress(null);
        }, 2200);
      }
    },
    []
  );

  useEffect(() => {
    if (activeTab !== AppTab.TrackSets) {
      setLastNonTrackerTab(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    const keepScreenAwake = Boolean(
      activeWorkoutRunState?.isActive && !activeWorkoutRunState?.isPaused
    );
    setAndroidKeepScreenOn(keepScreenAwake);
  }, [activeWorkoutRunState]);

  const refreshUserGovernance = useCallback(async (targetUser?: FirebaseUser | null) => {
    try {
      const [{ auth }, { bootstrapAndLoadUserGovernance }] = await Promise.all([
        import('./firebase'),
        import('./services/userManagementService'),
      ]);
      const activeUser = targetUser !== undefined ? targetUser : auth.currentUser;
      if (!activeUser) {
        setUserProfile(null);
        setUserConsent(null);
        setUserAuditLogs([]);
        setRequiresMfaChallenge(false);
        return;
      }
      const gov = await bootstrapAndLoadUserGovernance(activeUser);
      setUserProfile(gov.profile);
      setUserConsent(gov.consent);
      setUserAuditLogs(gov.auditLogs);
      setRequiresMfaChallenge(gov.requiresMfaVerification);
      if (gov.requiresMfaVerification) {
        setIsAuthModalOpen(true);
      }
    } catch {
      // Keep local workspace accessible if cloud metadata is temporarily unreachable
    }
  }, []);

  useEffect(() => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    let isMounted = true;
    let idleCallbackId: number | null = null;
    let fallbackTimerId: number | null = null;
    let preloadTimerId: number | null = null;
    let unsubscribeAuth: (() => void) | null = null;
    let hydratedUidRef: string | null | undefined = undefined;

    const cancelDeferredHydration = () => {
      if (idleCallbackId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
          idleCallbackId
        );
        idleCallbackId = null;
      }
      if (fallbackTimerId !== null) {
        window.clearTimeout(fallbackTimerId);
        fallbackTimerId = null;
      }
      if (preloadTimerId !== null) {
        window.clearTimeout(preloadTimerId);
        preloadTimerId = null;
      }
    };

    const hydrateNamespace = async (uid: string | null, userObj: FirebaseUser | null) => {
      if (!isMounted) return;
      cancelDeferredHydration();
      hydratedUidRef = uid;
      const namespaceId = uid ?? 'guest';
      await setActiveUserStorageNamespace(uid);

      // Phase 1 (Fast Critical Path): Hydrate first 10 prioritized exercises immediately without waiting on Firebase SDK
      const fastState = await measureAsyncMetric(
        'startup',
        'PHASE1_DB_FAST_HYDRATION',
        () => initializeDatabaseIfNeeded({ initialLibraryLimit: 10 }),
        { namespace: namespaceId, initialLimit: 10 }
      );
      await initializeDayZeroTelemetry(namespaceId);
      if (!isMounted) return;
      applyDatabaseSnapshot(fastState);
      setIsHydratingFullLibrary(
        (fastState.totalExerciseLibraryCount ?? fastState.exerciseLibrary.length) >
          fastState.exerciseLibrary.length
      );
      setIsLoaded(true);

      // Phase 2 (Idle Background Hydration): Load remaining catalog + verify training bundle without blocking UI
      const runDeferredLibraryAndBundleHydration = async () => {
        if (!isMounted) return;
        try {
          const fullLibrary = await measureAsyncMetric(
            'startup',
            'PHASE2_IDLE_CATALOG_HYDRATION',
            () => loadFullExerciseLibrary(fastState.setLogs)
          );
          if (!isMounted) return;
          setExerciseLibrary(fullLibrary);
          setTotalLibraryCatalogCount(fullLibrary.length);
          setIsHydratingFullLibrary(false);

          const { verifyTrainingPackageInstalled } = await import(
            './utils/trainingPackageManager'
          );
          const verifiedInstalled = await verifyTrainingPackageInstalled();
          if (!isMounted) return;
          if (!verifiedInstalled || !fastState.trainingPackageStatus?.installed) {
            void runStartupPackageDownload(false, fullLibrary, fastState.workoutTemplates);
          }
          if (userObj) {
            await refreshUserGovernance(userObj);
          }
        } catch {
          if (isMounted) {
            setIsHydratingFullLibrary(false);
          }
        }
      };

      const winWithIdle = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (typeof winWithIdle.requestIdleCallback === 'function') {
        idleCallbackId = winWithIdle.requestIdleCallback(
          () => {
            void runDeferredLibraryAndBundleHydration();
            if (isMounted) preloadPrimaryTabChunks();
          },
          { timeout: 400 }
        );
      } else {
        fallbackTimerId = window.setTimeout(() => {
          void runDeferredLibraryAndBundleHydration();
          if (isMounted) preloadPrimaryTabChunks();
        }, 150);
      }
    };

    let cachedUid: string | null = null;
    try {
      const rawCachedUid = window.localStorage.getItem('hyperlog_last_auth_uid');
      cachedUid = rawCachedUid && rawCachedUid.trim().length > 0 ? rawCachedUid : null;
    } catch {
      cachedUid = null;
    }

    // Immediate offline-first boot before Firebase chunk is downloaded
    void hydrateNamespace(cachedUid, null).then(() => {
      if (!isMounted) return;
      window.setTimeout(() => {
        if (!isMounted) return;
        void Promise.all([import('firebase/auth'), import('./firebase')])
          .then(([{ onAuthStateChanged }, { auth }]) => {
            if (!isMounted) return;
            unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
              if (!isMounted) return;
              setFirebaseUser(user);
              const nextUid = user ? user.uid : null;
              try {
                if (nextUid) {
                  window.localStorage.setItem('hyperlog_last_auth_uid', nextUid);
                } else {
                  window.localStorage.removeItem('hyperlog_last_auth_uid');
                }
              } catch {
                // Ignore storage restrictions
              }
              if (hydratedUidRef !== nextUid) {
                await hydrateNamespace(nextUid, user);
              } else if (user) {
                await refreshUserGovernance(user);
              } else {
                setUserProfile(null);
                setUserConsent(null);
                setUserAuditLogs([]);
                setRequiresMfaChallenge(false);
              }
            });
          })
          .catch(() => {
            // Offline mode continues cleanly without Firebase network reachability
          });
      }, 120);
    });

    return () => {
      isMounted = false;
      cancelDeferredHydration();
      unsubscribeAuth?.();
    };
  }, [applyDatabaseSnapshot, runStartupPackageDownload, refreshUserGovernance]);

  // Explicit Background Synchronization State Monitor:
  // Verifies parity between offline IndexedDB storage and in-memory React state
  // periodically and whenever focus/visibility/storage events occur.
  const runBackgroundParityCheck = useCallback(async () => {
    if (!isLoaded || isHydratingFullLibrary || packageDownloadProgress !== null) return;
    if (pendingWritesRef.current > 0 || parityCheckRunningRef.current) return;

    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    if (
      activeEl &&
      activeEl.tagName === 'INPUT' &&
      (activeEl as HTMLInputElement).getAttribute('inputmode')
    ) {
      return;
    }

    parityCheckRunningRef.current = true;
    try {
      const inMemoryChecksum = await computeSetLogsParityChecksumAsync(setLogsRef.current);
      if (pendingWritesRef.current > 0) return;
      const result = await verifyAndRepairDatabaseParity({
        activeWeek,
        activeDay,
        inMemoryChecksum,
        inMemoryExerciseCount: exerciseLibrary.length,
        inMemoryTemplateCount: workoutTemplates.length,
        inMemoryHistoryCount: workoutHistory.length,
        inMemoryStandaloneSessionId: activeStandaloneSession?.sessionId ?? null,
      });

      if (!result.inSync && result.freshState && pendingWritesRef.current === 0) {
        applyDatabaseSnapshot(result.freshState, { preserveScheduleSelection: true });
        recordWidgetUpdateTrigger('Offline Storage Synced');
      }
    } catch {
      // Keep background monitor resilient if browser storage is momentarily busy
    } finally {
      parityCheckRunningRef.current = false;
    }
  }, [
    isLoaded,
    isHydratingFullLibrary,
    packageDownloadProgress,
    activeWeek,
    activeDay,
    exerciseLibrary.length,
    workoutTemplates.length,
    workoutHistory.length,
    activeStandaloneSession?.sessionId,
    applyDatabaseSnapshot,
  ]);

  const runBackgroundParityCheckRef = useRef(runBackgroundParityCheck);
  useEffect(() => {
    runBackgroundParityCheckRef.current = runBackgroundParityCheck;
  }, [runBackgroundParityCheck]);

  useEffect(() => {
    if (!isLoaded) return;

    const intervalId = window.setInterval(() => {
      void runBackgroundParityCheckRef.current();
    }, 45000);

    const handleVisibilityOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void runBackgroundParityCheckRef.current();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('storage', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('storage', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isLoaded]);

  const handleForceRefreshTracker = useCallback(async (): Promise<{
    totalSets: number;
    activeSets: number;
    repairedCount: number;
  }> => {
    parityCheckRunningRef.current = true;
    try {
      const inMemoryChecksum = computeSetLogsParityChecksum(setLogsRef.current);
      const parity = await verifyAndRepairDatabaseParity({
        activeWeek,
        activeDay,
        inMemoryChecksum,
        inMemoryExerciseCount: exerciseLibrary.length,
        inMemoryTemplateCount: workoutTemplates.length,
        inMemoryHistoryCount: workoutHistory.length,
        inMemoryStandaloneSessionId: activeStandaloneSession?.sessionId ?? null,
        forceReload: true,
      });
      const fresh = parity.freshState ?? (await loadAllDatabaseState());
      applyDatabaseSnapshot(fresh);
      setTrackerRefreshNonce((n) => n + 1);
      setTrackFocusNonce((n) => n + 1);
      recordWidgetUpdateTrigger('Manual Force Refresh');

      const activeSets = fresh.activeStandaloneSession
        ? fresh.setLogs.filter(
            (s) => s.templateSessionId === fresh.activeStandaloneSession?.sessionId
          ).length
        : fresh.setLogs.filter(
            (s) =>
              !s.templateSessionId &&
              s.week === fresh.activeWeek &&
              s.dayNumber === activeDay
          ).length;

      return {
        totalSets: fresh.setLogs.length,
        activeSets,
        repairedCount: parity.repairedRows + parity.materializedRows,
      };
    } finally {
      parityCheckRunningRef.current = false;
    }
  }, [
    activeWeek,
    activeDay,
    exerciseLibrary.length,
    workoutTemplates.length,
    workoutHistory.length,
    activeStandaloneSession?.sessionId,
    applyDatabaseSnapshot,
  ]);

  const activateGlobalWorkoutTimer = async (opts: {
    workoutTitle: string;
    mode: 'schedule' | 'standalone';
    week: number;
    dayNumber: number;
    templateSessionId?: string;
    resetClock?: boolean;
  }) => {
    const now = Date.now();
    const shouldReset = opts.resetClock || !activeWorkoutRunState?.isActive;
    const nextRun: ActiveWorkoutRunState = shouldReset
      ? {
          isActive: true,
          isPaused: false,
          startedAtMs: now,
          accumulatedSeconds: 0,
          lastResumedAtMs: now,
          workoutTitle: opts.workoutTitle,
          mode: opts.mode,
          week: opts.week,
          dayNumber: opts.dayNumber,
          templateSessionId: opts.templateSessionId,
        }
      : {
          ...activeWorkoutRunState,
          workoutTitle: opts.workoutTitle,
          mode: opts.mode,
          week: opts.week,
          dayNumber: opts.dayNumber,
          templateSessionId: opts.templateSessionId,
        };
    setActiveWorkoutRunState(nextRun);
    if (shouldReset) {
      playTimerSetTone(appPreferences.soundOnTimer !== false);
    }
    await saveActiveWorkoutRunState(nextRun);
  };

  const handleStartGlobalWorkout = async () => {
    if (activeStandaloneSession) {
      await activateGlobalWorkoutTimer({
        workoutTitle: activeStandaloneSession.templateName,
        mode: 'standalone',
        week: activeWeek,
        dayNumber: 0,
        templateSessionId: activeStandaloneSession.sessionId,
        resetClock: true,
      });
      return;
    }
    const targetDay = plan.find((d) => d.dayNumber === activeDay) ?? plan[0];
    await activateGlobalWorkoutTimer({
      workoutTitle: targetDay?.title ?? `Day ${activeDay}`,
      mode: 'schedule',
      week: activeWeek,
      dayNumber: activeDay,
      resetClock: true,
    });
  };

  const handleTogglePauseGlobalWorkout = async () => {
    if (!activeWorkoutRunState || !activeWorkoutRunState.isActive) return;
    const now = Date.now();
    let nextRun: ActiveWorkoutRunState;
    if (activeWorkoutRunState.isPaused) {
      nextRun = {
        ...activeWorkoutRunState,
        isPaused: false,
        lastResumedAtMs: now,
      };
      playTimerSetTone(appPreferences.soundOnTimer !== false);
    } else {
      const elapsedNow = computeElapsedFromRunState(activeWorkoutRunState);
      nextRun = {
        ...activeWorkoutRunState,
        isPaused: true,
        accumulatedSeconds: elapsedNow,
        lastResumedAtMs: now,
      };
    }
    setActiveWorkoutRunState(nextRun);
    await saveActiveWorkoutRunState(nextRun);
  };

  const handleStopGlobalWorkoutTimer = async () => {
    setActiveWorkoutRunState(null);
    await saveActiveWorkoutRunState(null);
  };

  const handleMinimizeTracker = () => {
    setActiveTab(lastNonTrackerTab === AppTab.TrackSets ? AppTab.Workouts : lastNonTrackerTab);
  };

  const handleOpenMinimizedTracker = () => {
    setTrackSubView('log');
    setTrackFocusNonce((n) => n + 1);
    setActiveTab(AppTab.TrackSets);
  };

  const handleChangeWeek = async (week: number) => {
    setActiveWeek(week);
    pendingWritesRef.current += 1;
    try {
      await saveActiveWeek(week);
      if (!activeStandaloneSession) {
        const targetDay = plan.find((d) => d.dayNumber === activeDay);
        if (targetDay && !targetDay.isRestDay && targetDay.exercises.length > 0) {
          const weekMeta =
            MESOCYCLE_WEEKS.find((w) => w.week === week) ?? MESOCYCLE_WEEKS[2];
          const currentLogs = setLogsRef.current;
          const missingLogs: SetLogEntry[] = [];
          for (const ex of targetDay.exercises) {
            const hasExisting = currentLogs.some(
              (s) =>
                !s.templateSessionId &&
                s.week === week &&
                s.dayNumber === activeDay &&
                s.exerciseId === ex.id
            );
            if (!hasExisting) {
              const targetSets = ex.weekSets[week] ?? 3;
              const prevBest = findLatestCompletedSetForExercise(currentLogs, ex.name);
              for (let s = 1; s <= targetSets; s++) {
                missingLogs.push(
                  sanitizeSetLogEntry({
                    id: `w${week}_d${activeDay}_${ex.id}_s${s}`,
                    week,
                    dayNumber: activeDay,
                    exerciseId: ex.id,
                    exerciseName: ex.name,
                    muscleId: ex.muscleId,
                    setIndex: s,
                    weightKg: prevBest ? prevBest.weightKg : ex.defaultWeightKg,
                    reps: prevBest ? prevBest.reps : parseDefaultRepTarget(ex.repRange),
                    rir: weekMeta.defaultRirNumber,
                    restSeconds: ex.restSeconds,
                    completed: false,
                  })
                );
              }
            }
          }
          if (missingLogs.length > 0) {
            updateSetLogsSync((prev) => [...prev, ...missingLogs]);
            await saveBulkSetLogs(missingLogs);
          }
        }
      }
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
  };

  const handleUpdateLandmark = async (lm: MuscleLandmark) => {
    setLandmarks((prev) => ({ ...prev, [lm.id]: lm }));
    await saveMuscleLandmark(lm);
  };

  const syncHistorySnapshotForSession = async (
    nextLogs: SetLogEntry[],
    referenceLog: SetLogEntry | undefined
  ) => {
    if (!referenceLog) return;
    const dateIso = resolveSetLogDateISO(referenceLog);
    if (!dateIso) return;

    const sessionId = getDeterministicSessionId(dateIso, referenceLog);
    const sessionCompletedLogs = nextLogs.filter((s) => {
      if (!s.completed) return false;
      const d = resolveSetLogDateISO(s);
      if (!d) return false;
      return getDeterministicSessionId(d, s) === sessionId;
    });

    const existingRecord = workoutHistory.find((h) => h.id === sessionId);

    if (sessionCompletedLogs.length > 0) {
      const built = buildHistoryRecordFromSessionLogs({
        sessionId,
        dateIso,
        logs: sessionCompletedLogs,
        plan,
        landmarks,
        activeStandaloneSession,
        existingRecord,
      });
      setWorkoutHistory((prev) => {
        const without = prev.filter((r) => r.id !== sessionId);
        return [built, ...without].sort((a, b) => (a.date < b.date ? 1 : -1));
      });
      await saveWorkoutHistoryRecord(built);
    } else if (existingRecord && !existingRecord.isManualEntry) {
      setWorkoutHistory((prev) => prev.filter((r) => r.id !== sessionId));
      await deleteWorkoutHistoryRecord(sessionId);
    }
  };

  const handleUpsertSet = async (rawEntry: SetLogEntry) => {
    const entry = sanitizeSetLogEntry(rawEntry);
    const currentLogs = setLogsRef.current;
    const previousEntry = currentLogs.find((s) => s.id === entry.id);
    const nextLogs = updateSetLogsSync((prev) => {
      const idx = prev.findIndex((s) => s.id === entry.id);
      if (idx === -1) return [...prev, entry];
      const copy = [...prev];
      copy[idx] = entry;
      return copy;
    });

    pendingWritesRef.current += 1;
    try {
      await saveSetLog(entry);
      await syncHistorySnapshotForSession(nextLogs, entry.completed ? entry : previousEntry);
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }

    if (entry.completed) {
      logTelemetryEvent({
        level: 'ACTION',
        category: 'workout',
        event: 'WORKING_SET_COMPLETED',
        metadata: {
          exercise: entry.exerciseName,
          weightKg: entry.weightKg,
          reps: entry.reps,
          rir: entry.rir,
        },
      });
      if (!activeWorkoutRunState?.isActive) {
        const autoTitle = activeStandaloneSession
          ? activeStandaloneSession.templateName
          : plan.find((d) => d.dayNumber === activeDay)?.title ?? `Day ${activeDay}`;
        await activateGlobalWorkoutTimer({
          workoutTitle: autoTitle,
          mode: activeStandaloneSession ? 'standalone' : 'schedule',
          week: activeWeek,
          dayNumber: activeStandaloneSession ? 0 : activeDay,
          templateSessionId: activeStandaloneSession?.sessionId,
          resetClock: true,
        });
      }
      recordWidgetUpdateTrigger('Set Completed in Tracker');
    } else {
      recordWidgetUpdateTrigger('Set Updated in Tracker');
    }
  };

  const handleDeleteSet = async (id: string) => {
    const removed = setLogsRef.current.find((s) => s.id === id);
    const nextLogs = updateSetLogsSync((prev) => prev.filter((s) => s.id !== id));
    pendingWritesRef.current += 1;
    try {
      await deleteSetLog(id);
      await syncHistorySnapshotForSession(nextLogs, removed);
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
    recordWidgetUpdateTrigger('Set Removed in Tracker');
  };

  const handleSaveHistoryRecord = async (record: WorkoutHistoryRecord) => {
    setWorkoutHistory((prev) => {
      const without = prev.filter((r) => r.id !== record.id);
      return [record, ...without].sort((a, b) => (a.date < b.date ? 1 : -1));
    });
    await saveWorkoutHistoryRecord(record);
  };

  const handleLogPastWorkout = async (params: {
    dateIso: string;
    title: string;
    durationMinutes?: number;
    notes?: string;
    exercises: PastWorkoutExerciseDraft[];
  }) => {
    const { dateIso, title, durationMinutes, notes, exercises } = params;
    const manualTplSessionId = `manual_${dateIso}_${Date.now()}`;
    const completedIso = `${dateIso}T17:30:00.000Z`;
    const todayIso = formatLocalDateISO(new Date());
    const diffDays = Math.round(
      (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${dateIso}T00:00:00Z`)) / 86400000
    );
    const assignedWeek = !Number.isNaN(diffDays) && diffDays >= 0 && diffDays <= 6 ? activeWeek : 0;

    const generatedLogs: SetLogEntry[] = [];
    for (const ex of exercises) {
      for (let s = 1; s <= ex.setsCount; s++) {
        generatedLogs.push({
          id: `${manualTplSessionId}_${ex.exerciseId}_s${s}`,
          week: assignedWeek,
          dayNumber: 0,
          templateSessionId: manualTplSessionId,
          sessionTitle: title,
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          muscleId: ex.muscleId,
          setIndex: s,
          weightKg: ex.weightKg,
          reps: ex.reps,
          rir: ex.rir,
          rpe: ex.rpe,
          completed: true,
          completedAt: completedIso,
          completedDate: dateIso,
        });
      }
    }

    const sessionId = `hist_${dateIso}_tpl_${manualTplSessionId}`;
    const builtRecord = buildHistoryRecordFromSessionLogs({
      sessionId,
      dateIso,
      logs: generatedLogs,
      plan,
      landmarks,
      existingRecord: {
        id: sessionId,
        date: dateIso,
        title,
        completedAt: completedIso,
        durationMinutes,
        notes,
        isManualEntry: true,
        exercises: [],
        totalSets: 0,
        totalReps: 0,
        totalTonnageKg: 0,
        estimatedCaloriesKcal: 0,
        musclesTrained: [],
      },
    });

    updateSetLogsSync((prev) => [...prev, ...generatedLogs]);
    setWorkoutHistory((prev) =>
      [builtRecord, ...prev.filter((r) => r.id !== builtRecord.id)].sort((a, b) =>
        a.date < b.date ? 1 : -1
      )
    );
    pendingWritesRef.current += 1;
    try {
      await saveBulkSetLogs(generatedLogs);
      await saveWorkoutHistoryRecord(builtRecord);
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
    recordWidgetUpdateTrigger(`Workout Logged (${dateIso})`);
  };

  const handleDeleteManualHistoryRecord = async (recordId: string) => {
    const target = workoutHistory.find((r) => r.id === recordId);
    setWorkoutHistory((prev) => prev.filter((r) => r.id !== recordId));
    pendingWritesRef.current += 1;
    try {
      await deleteWorkoutHistoryRecord(recordId);

      if (target?.templateSessionId) {
        const matchingLogs = setLogsRef.current.filter(
          (l) => l.templateSessionId === target.templateSessionId
        );
        if (matchingLogs.length > 0) {
          updateSetLogsSync((prev) =>
            prev.filter((l) => l.templateSessionId !== target.templateSessionId)
          );
          for (const l of matchingLogs) {
            await deleteSetLog(l.id);
          }
        }
      }
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
    recordWidgetUpdateTrigger('Historical Workout Deleted');
  };

  const handleSaveFeedback = async (fb: MuscleAutoregulationFeedback) => {
    setFeedback((prev) => ({ ...prev, [fb.id]: fb }));
    await saveMuscleFeedback(fb);
  };

  const handleSaveDayPlan = async (updatedDay: WorkoutDayPlan) => {
    setPlan((prev) => prev.map((d) => (d.dayNumber === updatedDay.dayNumber ? updatedDay : d)));
    await saveWorkoutDayPlan(updatedDay);

    const weekMeta =
      MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];
    const missingSets: SetLogEntry[] = [];
    for (const ex of updatedDay.exercises) {
      const hasSets = setLogs.some(
        (s) =>
          !s.templateSessionId &&
          s.week === activeWeek &&
          s.dayNumber === updatedDay.dayNumber &&
          s.exerciseId === ex.id
      );
      if (!hasSets) {
        const count = ex.weekSets[activeWeek] ?? 3;
        for (let s = 1; s <= count; s++) {
          missingSets.push({
            id: `w${activeWeek}_d${updatedDay.dayNumber}_${ex.id}_s${s}`,
            week: activeWeek,
            dayNumber: updatedDay.dayNumber,
            exerciseId: ex.id,
            exerciseName: ex.name,
            muscleId: ex.muscleId,
            setIndex: s,
            weightKg: ex.defaultWeightKg,
            reps: parseDefaultRepTarget(ex.repRange),
            rir: weekMeta.defaultRirNumber,
            restSeconds: ex.restSeconds,
            completed: false,
          });
        }
      }
    }
    if (missingSets.length > 0) {
      updateSetLogsSync((prev) => [...prev, ...missingSets]);
      pendingWritesRef.current += 1;
      try {
        await saveBulkSetLogs(missingSets);
      } finally {
        pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      }
    }
  };

  const handleCreateExercise = async (exercise: LibraryExercise) => {
    setExerciseLibrary((prev) =>
      prioritizeExercisesForLogin([...prev.filter((e) => e.id !== exercise.id), exercise], setLogsRef.current)
    );
    setTotalLibraryCatalogCount((prev) => prev + 1);
    await saveLibraryExercise(exercise);
  };

  const handleStartCustomExerciseWorkout = async (
    libEx: LibraryExercise,
    customTitle?: string
  ) => {
    const sessionId = `standalone_custom_${Date.now()}`;
    const cleanTitle = (customTitle || `${libEx.name} Workout`).trim();
    const prevBest = findLatestCompletedSetForExercise(setLogsRef.current, libEx.name);
    const weekMeta =
      MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];

    const firstItem: TemplateExerciseItem = {
      id: `ti_${Date.now()}_1`,
      libraryExerciseId: libEx.id,
      name: libEx.name,
      primaryMuscle: libEx.primaryMuscle,
      secondaryMuscles: libEx.secondaryMuscles,
      sets: 3,
      reps: libEx.defaultRepRange,
      restSeconds: libEx.defaultRestSeconds,
      defaultWeightKg: prevBest ? prevBest.weightKg : libEx.defaultWeightKg,
    };

    const session: ActiveStandaloneSession = {
      sessionId,
      templateId: 'quick_custom',
      templateName: cleanTitle,
      startedAt: new Date().toISOString(),
      exercises: [firstItem],
    };

    const generatedLogs: SetLogEntry[] = [];
    for (let s = 1; s <= 3; s++) {
      generatedLogs.push({
        id: `${sessionId}_${firstItem.id}_s${s}`,
        week: activeWeek,
        dayNumber: 0,
        templateSessionId: sessionId,
        sessionTitle: cleanTitle,
        exerciseId: firstItem.id,
        exerciseName: firstItem.name,
        muscleId: firstItem.primaryMuscle,
        setIndex: s,
        weightKg: prevBest ? prevBest.weightKg : libEx.defaultWeightKg,
        reps: prevBest ? prevBest.reps : parseDefaultRepTarget(libEx.defaultRepRange),
        rir: weekMeta.defaultRirNumber,
        restSeconds: libEx.defaultRestSeconds,
        completed: false,
      });
    }

    pendingWritesRef.current += 1;
    try {
      await saveBulkSetLogs(generatedLogs);
      await saveActiveStandaloneSession(session);
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
    updateSetLogsSync((prev) => [...prev, ...generatedLogs]);
    setIsScheduleDaySelected(false);
    setActiveStandaloneSession(session);
    await activateGlobalWorkoutTimer({
      workoutTitle: cleanTitle,
      mode: 'standalone',
      week: activeWeek,
      dayNumber: 0,
      templateSessionId: sessionId,
      resetClock: true,
    });
    setTrackSubView('log');
    setTrackFocusNonce((n) => n + 1);
    setActiveTab(AppTab.TrackSets);
  };

  const handleSaveTemplate = async (template: WorkoutTemplate) => {
    setWorkoutTemplates((prev) => {
      const without = prev.filter((t) => t.id !== template.id);
      return [...without, template].sort((a, b) => {
        if (a.category !== b.category) return a.category === 'Custom' ? -1 : 1;
        const aRp = a.id.startsWith('tpl_rp_') || a.name.startsWith('RP Hypertrophy') ? 1 : 0;
        const bRp = b.id.startsWith('tpl_rp_') || b.name.startsWith('RP Hypertrophy') ? 1 : 0;
        if (aRp !== bRp) return bRp - aRp;
        return a.name.localeCompare(b.name);
      });
    });
    await saveWorkoutTemplate(template);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    setWorkoutTemplates((prev) => prev.filter((t) => t.id !== templateId));
    await deleteWorkoutTemplate(templateId);
  };

  const handleAddExerciseToTemplate = async (
    templateId: string,
    exercise: LibraryExercise
  ) => {
    const target = workoutTemplates.find((t) => t.id === templateId);
    if (!target) return;
    const item: TemplateExerciseItem = {
      id: `ti_${Date.now()}`,
      libraryExerciseId: exercise.id,
      name: exercise.name,
      primaryMuscle: exercise.primaryMuscle,
      secondaryMuscles: exercise.secondaryMuscles,
      sets: 3,
      reps: exercise.defaultRepRange,
      restSeconds: exercise.defaultRestSeconds,
      defaultWeightKg: exercise.defaultWeightKg,
    };
    const updated: WorkoutTemplate = {
      ...target,
      updatedAt: new Date().toISOString(),
      exercises: [...target.exercises, item],
    };
    await handleSaveTemplate(updated);
  };

  const handleAssignTemplateToDay = async (
    template: WorkoutTemplate,
    dayNumber: number
  ) => {
    const mappedExercises: ExercisePrescription[] = template.exercises.map((item, idx) => ({
      id: `d${dayNumber}_tpl_${template.id}_${idx + 1}`,
      dayNumber,
      order: idx + 1,
      muscleId: item.primaryMuscle,
      sheetMuscleLabel: landmarks[item.primaryMuscle]?.shortName ?? 'Target',
      name: item.name,
      isSuperset: false,
      repRange: item.reps,
      defaultWeightKg: item.defaultWeightKg,
      restSeconds: item.restSeconds,
      libraryExerciseId: item.libraryExerciseId,
      weekSets: {
        1: item.sets,
        2: item.sets,
        3: Math.min(10, item.sets + 1),
        4: Math.min(10, item.sets + 1),
        5: Math.max(1, Math.floor(item.sets / 2)),
      },
    }));

    const focusMuscles = Array.from(
      new Set(mappedExercises.map((e) => landmarks[e.muscleId]?.shortName).filter(Boolean))
    ).join(', ');

    const updatedDay: WorkoutDayPlan = {
      dayNumber,
      title: `Day ${dayNumber} · ${template.name}`,
      focusSummary: focusMuscles || template.splitType,
      isRestDay: false,
      exercises: mappedExercises,
    };

    setPlan((prev) => prev.map((d) => (d.dayNumber === dayNumber ? updatedDay : d)));
    await saveWorkoutDayPlan(updatedDay);

    const weekMeta =
      MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];
    const newLogs: SetLogEntry[] = [];
    for (const ex of mappedExercises) {
      const targetSets = ex.weekSets[activeWeek] ?? 3;
      const prevBest = findLatestCompletedSetForExercise(setLogs, ex.name);
      for (let s = 1; s <= targetSets; s++) {
        newLogs.push({
          id: `w${activeWeek}_d${dayNumber}_${ex.id}_s${s}_${Date.now()}`,
          week: activeWeek,
          dayNumber,
          exerciseId: ex.id,
          exerciseName: ex.name,
          muscleId: ex.muscleId,
          setIndex: s,
          weightKg: prevBest ? prevBest.weightKg : ex.defaultWeightKg,
          reps: prevBest ? prevBest.reps : parseDefaultRepTarget(ex.repRange),
          rir: weekMeta.defaultRirNumber,
          restSeconds: ex.restSeconds,
          completed: false,
        });
      }
    }

    pendingWritesRef.current += 1;
    try {
      await replaceUncompletedDaySetLogs(activeWeek, dayNumber, newLogs);
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
    updateSetLogsSync((prev) => [
      ...prev.filter(
        (s) => !(s.week === activeWeek && s.dayNumber === dayNumber && !s.completed)
      ),
      ...newLogs,
    ]);
  };

  const handleSelectScheduleDay = async (dayNumber: number) => {
    if (activeStandaloneSession) {
      setActiveStandaloneSession(null);
      await saveActiveStandaloneSession(null);
    }
    setActiveDay(dayNumber);
    setIsScheduleDaySelected(true);

    const targetDay = plan.find((d) => d.dayNumber === dayNumber);
    if (targetDay && !targetDay.isRestDay && targetDay.exercises.length > 0) {
      const weekMeta =
        MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];
      const currentLogs = setLogsRef.current;
      const missingLogs: SetLogEntry[] = [];
      for (const ex of targetDay.exercises) {
        const hasExisting = currentLogs.some(
          (s) =>
            !s.templateSessionId &&
            s.week === activeWeek &&
            s.dayNumber === dayNumber &&
            s.exerciseId === ex.id
        );
        if (!hasExisting) {
          const targetSets = ex.weekSets[activeWeek] ?? 3;
          const prevBest = findLatestCompletedSetForExercise(currentLogs, ex.name);
          for (let s = 1; s <= targetSets; s++) {
            missingLogs.push({
              id: `w${activeWeek}_d${dayNumber}_${ex.id}_s${s}`,
              week: activeWeek,
              dayNumber,
              exerciseId: ex.id,
              exerciseName: ex.name,
              muscleId: ex.muscleId,
              setIndex: s,
              weightKg: prevBest ? prevBest.weightKg : ex.defaultWeightKg,
              reps: prevBest ? prevBest.reps : parseDefaultRepTarget(ex.repRange),
              rir: weekMeta.defaultRirNumber,
              restSeconds: ex.restSeconds,
              completed: false,
            });
          }
        }
      }
      if (missingLogs.length > 0) {
        updateSetLogsSync((prev) => [...prev, ...missingLogs]);
        pendingWritesRef.current += 1;
        try {
          await saveBulkSetLogs(missingLogs);
        } finally {
          pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
        }
      }
    }

    if (activeWorkoutRunState?.isActive && targetDay && !targetDay.isRestDay) {
      await activateGlobalWorkoutTimer({
        workoutTitle: targetDay.title,
        mode: 'schedule',
        week: activeWeek,
        dayNumber,
        resetClock: false,
      });
    }

    setTrackSubView('log');
    setTrackFocusNonce((n) => n + 1);
    setActiveTab(AppTab.TrackSets);
  };

  const handleStartStandaloneTemplate = async (template: WorkoutTemplate) => {
    const sessionId = `standalone_${Date.now()}`;
    const session: ActiveStandaloneSession = {
      sessionId,
      templateId: template.id,
      templateName: template.name,
      startedAt: new Date().toISOString(),
      exercises: template.exercises,
    };

    const weekMeta =
      MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];
    const generatedLogs: SetLogEntry[] = [];
    for (const item of template.exercises) {
      const prevBest = findLatestCompletedSetForExercise(setLogs, item.name);
      for (let s = 1; s <= item.sets; s++) {
        generatedLogs.push({
          id: `${sessionId}_${item.id}_s${s}`,
          week: activeWeek,
          dayNumber: 0,
          templateSessionId: sessionId,
          sessionTitle: template.name,
          exerciseId: item.id,
          exerciseName: item.name,
          muscleId: item.primaryMuscle,
          setIndex: s,
          weightKg: prevBest ? prevBest.weightKg : item.defaultWeightKg,
          reps: prevBest ? prevBest.reps : parseDefaultRepTarget(item.reps),
          rir: weekMeta.defaultRirNumber,
          restSeconds: item.restSeconds,
          completed: false,
        });
      }
    }

    pendingWritesRef.current += 1;
    try {
      await saveBulkSetLogs(generatedLogs);
      await saveActiveStandaloneSession(session);
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
    updateSetLogsSync((prev) => [...prev, ...generatedLogs]);
    setIsScheduleDaySelected(false);
    setActiveStandaloneSession(session);
    await activateGlobalWorkoutTimer({
      workoutTitle: template.name,
      mode: 'standalone',
      week: activeWeek,
      dayNumber: 0,
      templateSessionId: sessionId,
      resetClock: true,
    });
    setTrackSubView('log');
    setTrackFocusNonce((n) => n + 1);
    setActiveTab(AppTab.TrackSets);
  };

  const handleStartQuickWorkout = async (customTitle?: string) => {
    const sessionId = `standalone_quick_${Date.now()}`;
    const cleanTitle = (customTitle || 'Quick Workout').trim() || 'Quick Workout';
    const session: ActiveStandaloneSession = {
      sessionId,
      templateId: 'quick_custom',
      templateName: cleanTitle,
      startedAt: new Date().toISOString(),
      exercises: [],
    };
    pendingWritesRef.current += 1;
    try {
      await saveActiveStandaloneSession(session);
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
    setIsScheduleDaySelected(false);
    setActiveStandaloneSession(session);
    await activateGlobalWorkoutTimer({
      workoutTitle: cleanTitle,
      mode: 'standalone',
      week: activeWeek,
      dayNumber: 0,
      templateSessionId: sessionId,
      resetClock: true,
    });
    setTrackSubView('log');
    setTrackFocusNonce((n) => n + 1);
    setActiveTab(AppTab.TrackSets);
  };

  const handleRepeatHistoryWorkout = async (record: WorkoutHistoryRecord) => {
    const sessionId = `standalone_repeat_${Date.now()}`;
    const cleanTitle = record.title.replace(/^Week\s+\d+\s+·\s+/i, '').trim() || 'Repeated Workout';
    const mappedItems: TemplateExerciseItem[] = record.exercises.map((ex, idx) => {
      const firstSet = ex.sets[0];
      return {
        id: `rep_item_${Date.now()}_${idx}`,
        libraryExerciseId: ex.exerciseId,
        name: ex.exerciseName,
        primaryMuscle: ex.muscleId,
        secondaryMuscles: [],
        sets: Math.max(1, ex.sets.length),
        reps: firstSet ? String(firstSet.reps) : '8–12',
        restSeconds: appPreferences.defaultRestSeconds || 90,
        defaultWeightKg: firstSet ? firstSet.weightKg : 20,
      };
    });

    const session: ActiveStandaloneSession = {
      sessionId,
      templateId: `repeat_${record.id}`,
      templateName: cleanTitle,
      startedAt: new Date().toISOString(),
      exercises: mappedItems,
    };

    const weekMeta =
      MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];
    const generatedLogs: SetLogEntry[] = [];
    record.exercises.forEach((ex, idx) => {
      const item = mappedItems[idx];
      ex.sets.forEach((histSet, sIdx) => {
        generatedLogs.push({
          id: `${sessionId}_${item.id}_s${sIdx + 1}`,
          week: activeWeek,
          dayNumber: 0,
          templateSessionId: sessionId,
          sessionTitle: cleanTitle,
          exerciseId: item.id,
          exerciseName: item.name,
          muscleId: item.primaryMuscle,
          setIndex: sIdx + 1,
          weightKg: histSet.weightKg,
          reps: histSet.reps,
          rir: histSet.rir ?? weekMeta.defaultRirNumber,
          rpe: histSet.rpe,
          restSeconds: item.restSeconds,
          completed: false,
        });
      });
    });

    pendingWritesRef.current += 1;
    try {
      await saveBulkSetLogs(generatedLogs);
      await saveActiveStandaloneSession(session);
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
    updateSetLogsSync((prev) => [...prev, ...generatedLogs]);
    setIsScheduleDaySelected(false);
    setActiveStandaloneSession(session);
    await activateGlobalWorkoutTimer({
      workoutTitle: cleanTitle,
      mode: 'standalone',
      week: activeWeek,
      dayNumber: 0,
      templateSessionId: sessionId,
      resetClock: true,
    });
    setTrackSubView('log');
    setTrackFocusNonce((n) => n + 1);
    setActiveTab(AppTab.TrackSets);
  };

  const handleAddExerciseToActiveWorkout = async (libEx: LibraryExercise) => {
    const weekMeta =
      MESOCYCLE_WEEKS.find((w) => w.week === activeWeek) ?? MESOCYCLE_WEEKS[2];
    const prevBest = findLatestCompletedSetForExercise(setLogs, libEx.name);

    if (activeStandaloneSession) {
      const newItem: TemplateExerciseItem = {
        id: `ti_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        libraryExerciseId: libEx.id,
        name: libEx.name,
        primaryMuscle: libEx.primaryMuscle,
        secondaryMuscles: libEx.secondaryMuscles,
        sets: 3,
        reps: libEx.defaultRepRange,
        restSeconds: libEx.defaultRestSeconds,
        defaultWeightKg: prevBest ? prevBest.weightKg : libEx.defaultWeightKg,
      };
      const updatedSession: ActiveStandaloneSession = {
        ...activeStandaloneSession,
        exercises: [...activeStandaloneSession.exercises, newItem],
      };

      const generatedLogs: SetLogEntry[] = [];
      for (let s = 1; s <= 3; s++) {
        generatedLogs.push({
          id: `${activeStandaloneSession.sessionId}_${newItem.id}_s${s}_${Date.now()}`,
          week: activeWeek,
          dayNumber: 0,
          templateSessionId: activeStandaloneSession.sessionId,
          sessionTitle: activeStandaloneSession.templateName,
          exerciseId: newItem.id,
          exerciseName: newItem.name,
          muscleId: newItem.primaryMuscle,
          setIndex: s,
          weightKg: prevBest ? prevBest.weightKg : libEx.defaultWeightKg,
          reps: prevBest ? prevBest.reps : parseDefaultRepTarget(libEx.defaultRepRange),
          rir: weekMeta.defaultRirNumber,
          restSeconds: libEx.defaultRestSeconds,
          completed: false,
        });
      }

      pendingWritesRef.current += 1;
      try {
        await saveBulkSetLogs(generatedLogs);
        await saveActiveStandaloneSession(updatedSession);
      } finally {
        pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      }
      updateSetLogsSync((prev) => [...prev, ...generatedLogs]);
      setActiveStandaloneSession(updatedSession);
      setTrackFocusNonce((n) => n + 1);
      setActiveTab(AppTab.TrackSets);
      return;
    }

    const targetDay = plan.find((d) => d.dayNumber === activeDay) ?? plan[0];
    if (!targetDay) return;

    const newPresc: ExercisePrescription = {
      id: `d${targetDay.dayNumber}_e_${Date.now()}`,
      dayNumber: targetDay.dayNumber,
      order: targetDay.exercises.length + 1,
      muscleId: libEx.primaryMuscle,
      sheetMuscleLabel: landmarks[libEx.primaryMuscle]?.shortName ?? 'Target',
      name: libEx.name,
      isSuperset: false,
      repRange: libEx.defaultRepRange,
      defaultWeightKg: prevBest ? prevBest.weightKg : libEx.defaultWeightKg,
      restSeconds: libEx.defaultRestSeconds,
      libraryExerciseId: libEx.id,
      weekSets: { 1: 3, 2: 3, 3: 4, 4: 4, 5: 2 },
    };

    const nextExercises = [...targetDay.exercises, newPresc];
    const focusMuscles = Array.from(
      new Set(nextExercises.map((e) => landmarks[e.muscleId]?.shortName).filter(Boolean))
    ).join(', ');

    const updatedDay: WorkoutDayPlan = {
      ...targetDay,
      title: targetDay.isRestDay
        ? `Day ${targetDay.dayNumber} · Custom Session`
        : targetDay.title,
      focusSummary: focusMuscles || targetDay.focusSummary,
      isRestDay: false,
      exercises: nextExercises,
    };

    await handleSaveDayPlan(updatedDay);
    setIsScheduleDaySelected(true);
    setTrackFocusNonce((n) => n + 1);
    setActiveTab(AppTab.TrackSets);
  };

  const handleRemoveExerciseFromActiveWorkout = async (exerciseId: string) => {
    if (activeStandaloneSession) {
      const updatedSession: ActiveStandaloneSession = {
        ...activeStandaloneSession,
        exercises: activeStandaloneSession.exercises.filter((e) => e.id !== exerciseId),
      };
      const toRemove = setLogsRef.current.filter(
        (s) =>
          s.templateSessionId === activeStandaloneSession.sessionId &&
          s.exerciseId === exerciseId &&
          !s.completed
      );
      setActiveStandaloneSession(updatedSession);
      pendingWritesRef.current += 1;
      try {
        await saveActiveStandaloneSession(updatedSession);
        if (toRemove.length > 0) {
          const removeSet = new Set(toRemove.map((r) => r.id));
          updateSetLogsSync((prev) => prev.filter((s) => !removeSet.has(s.id)));
          for (const row of toRemove) {
            await deleteSetLog(row.id);
          }
        }
      } finally {
        pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      }
      return;
    }

    const targetDay = plan.find((d) => d.dayNumber === activeDay);
    if (!targetDay) return;
    const updatedDay: WorkoutDayPlan = {
      ...targetDay,
      exercises: targetDay.exercises.filter((e) => e.id !== exerciseId),
    };
    setPlan((prev) => prev.map((d) => (d.dayNumber === activeDay ? updatedDay : d)));
    pendingWritesRef.current += 1;
    try {
      await saveWorkoutDayPlan(updatedDay);

      const toRemove = setLogsRef.current.filter(
        (s) =>
          !s.templateSessionId &&
          s.week === activeWeek &&
          s.dayNumber === activeDay &&
          s.exerciseId === exerciseId &&
          !s.completed
      );
      if (toRemove.length > 0) {
        const removeSet = new Set(toRemove.map((r) => r.id));
        updateSetLogsSync((prev) => prev.filter((s) => !removeSet.has(s.id)));
        for (const row of toRemove) {
          await deleteSetLog(row.id);
        }
      }
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
  };

  const handleFinishActiveWorkout = async (params: {
    durationMinutes?: number;
    notes?: string;
  }): Promise<WorkoutHistoryRecord | null> => {
    const activeCompletedLogs = setLogs.filter((s) => {
      if (!s.completed) return false;
      if (activeStandaloneSession) {
        return s.templateSessionId === activeStandaloneSession.sessionId;
      }
      return !s.templateSessionId && s.week === activeWeek && s.dayNumber === activeDay;
    });

    if (activeCompletedLogs.length === 0) return null;

    const refLog = activeCompletedLogs[activeCompletedLogs.length - 1];
    const dateIso = resolveSetLogDateISO(refLog) ?? formatLocalDateISO(new Date());
    const sessionId = getDeterministicSessionId(dateIso, refLog);
    const existingRecord = workoutHistory.find((h) => h.id === sessionId);

    const built = buildHistoryRecordFromSessionLogs({
      sessionId,
      dateIso,
      logs: activeCompletedLogs,
      plan,
      landmarks,
      activeStandaloneSession,
      existingRecord,
    });

    const elapsedMinFromGlobal = activeWorkoutRunState?.isActive
      ? Math.max(1, Math.round(computeElapsedFromRunState(activeWorkoutRunState) / 60))
      : undefined;

    const finalized: WorkoutHistoryRecord = {
      ...built,
      durationMinutes: params.durationMinutes ?? elapsedMinFromGlobal ?? built.durationMinutes,
      notes: params.notes ?? built.notes,
      completedAt: new Date().toISOString(),
    };

    setWorkoutHistory((prev) => {
      const without = prev.filter((r) => r.id !== sessionId);
      return [finalized, ...without].sort((a, b) => (a.date < b.date ? 1 : -1));
    });
    await saveWorkoutHistoryRecord(finalized);

    if (appPreferences.autoQueueHealthConnect !== false) {
      await handleQueueSessionSync(
        finalized.title,
        activeStandaloneSession ? 0 : activeDay,
        finalized.totalSets,
        finalized.totalTonnageKg
      );
      syncWorkoutToAndroidHealthConnect({
        title: finalized.title,
        durationMinutes: finalized.durationMinutes ?? 45,
        completedSets: finalized.totalSets,
        tonnageKg: finalized.totalTonnageKg,
        activeCaloriesKcal: finalized.estimatedCaloriesKcal,
      });
    }

    if (activeStandaloneSession) {
      setActiveStandaloneSession(null);
      await saveActiveStandaloneSession(null);
    }
    setIsScheduleDaySelected(false);

    setActiveWorkoutRunState(null);
    await saveActiveWorkoutRunState(null);

    recordWidgetUpdateTrigger(`Workout Finished (${finalized.title})`);
    return finalized;
  };

  const handleClearStandaloneSession = async () => {
    setActiveStandaloneSession(null);
    await saveActiveStandaloneSession(null);
    if (activeWorkoutRunState?.isActive && activeWorkoutRunState.mode === 'standalone') {
      await handleStopGlobalWorkoutTimer();
    }
  };

  const handleClearSelectedWorkout = async () => {
    setIsScheduleDaySelected(false);
    if (activeStandaloneSession) {
      setActiveStandaloneSession(null);
      await saveActiveStandaloneSession(null);
    }
    if (activeWorkoutRunState?.isActive) {
      await handleStopGlobalWorkoutTimer();
    }
  };

  const handleCancelActiveWorkoutSession = async (discardLoggedSets: boolean) => {
    if (discardLoggedSets) {
      if (activeStandaloneSession) {
        const sessionId = activeStandaloneSession.sessionId;
        const toDelete = setLogsRef.current.filter(
          (s) => s.templateSessionId === sessionId
        );
        if (toDelete.length > 0) {
          const remaining = setLogsRef.current.filter(
            (s) => s.templateSessionId !== sessionId
          );
          updateSetLogsSync(remaining);
          await Promise.all(toDelete.map((s) => deleteSetLog(s.id)));
        }
      } else {
        const resetRows: SetLogEntry[] = [];
        const updatedAll = setLogsRef.current.map((s) => {
          if (
            !s.templateSessionId &&
            s.week === activeWeek &&
            s.dayNumber === activeDay &&
            s.completed
          ) {
            const resetItem: SetLogEntry = {
              ...s,
              completed: false,
              completedAt: undefined,
              completedDate: undefined,
            };
            resetRows.push(resetItem);
            return resetItem;
          }
          return s;
        });
        if (resetRows.length > 0) {
          updateSetLogsSync(updatedAll);
          await saveBulkSetLogs(resetRows);
        }
      }
    }

    setIsScheduleDaySelected(false);
    if (activeStandaloneSession) {
      setActiveStandaloneSession(null);
      await saveActiveStandaloneSession(null);
    }
    if (activeWorkoutRunState?.isActive) {
      await handleStopGlobalWorkoutTimer();
    }
    setCompletedWorkoutView(null);
    setTrackSubView('log');
    setActiveTab(AppTab.TrackSets);
    recordWidgetUpdateTrigger('Workout Session Cancelled');
  };

  const handleQueueSessionSync = async (
    sessionLabel: string,
    dayNumber: number,
    completedSetsCount: number,
    tonnageKg: number
  ) => {
    const ev: SyncOutboxEvent = {
      id: `sync_session_${Date.now()}`,
      recordType: 'EXERCISE_SESSION',
      healthConnectType: 'ExerciseSessionRecord (EXERCISE_TYPE_WEIGHTLIFTING)',
      googleFitDataSource: 'raw:com.google.activity.segment:com.hyperlog.rp',
      createdAt: new Date().toISOString(),
      status: 'READY_FOR_BRIDGE',
      payload: {
        week: activeWeek,
        dayNumber,
        sessionName: sessionLabel,
        totalCompletedSets: completedSetsCount,
        totalTonnageKg: Math.round(tonnageKg),
        estimatedActiveCaloriesKcal: Math.round(completedSetsCount * 16.5),
        activityType: 97,
      },
    };
    setSyncOutbox((prev) => [ev, ...prev]);
    await enqueueSyncEvent(ev);
  };

  const handleSyncWorkoutWithGoogle = useCallback(
    async (
      record: WorkoutHistoryRecord,
      cardioMinutes: number
    ): Promise<GoogleWorkoutSyncReceipt> => {
      let receipt: GoogleWorkoutSyncReceipt | null = null;
      try {
        const res = await fetch('/api/google-sync/workout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: record.id,
            workoutTitle: record.title,
            durationMinutes: record.durationMinutes ?? 45,
            completedSets: record.totalSets,
            totalTonnageKg: Math.round(record.totalTonnageKg),
            estimatedCaloriesKcal: record.estimatedCaloriesKcal,
            cardioMinutes,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            receipt?: GoogleWorkoutSyncReceipt;
          };
          if (data?.receipt) {
            receipt = data.receipt;
          }
        }
      } catch {
        // Offline fallback — queue local receipt
      }

      const finalReceipt: GoogleWorkoutSyncReceipt = receipt ?? {
        receiptId: `gsync_local_${Date.now()}`,
        sessionId: record.id,
        workoutTitle: record.title,
        syncedAt: new Date().toISOString(),
        status: 'QUEUED_OFFLINE',
        googleFitDataSource: 'raw:com.google.activity.segment:com.hyperlog.rp',
        healthConnectRecordType: 'ExerciseSessionRecord + ActiveCaloriesBurnedRecord',
        durationMinutes: record.durationMinutes ?? 45,
        completedSets: record.totalSets,
        totalTonnageKg: Math.round(record.totalTonnageKg),
        estimatedCaloriesKcal: record.estimatedCaloriesKcal,
        cardioMinutes,
      };

      let nextReceipts: GoogleWorkoutSyncReceipt[] = [];
      setGoogleSyncReceipts((prev) => {
        const without = prev.filter((r) => r.sessionId !== finalReceipt.sessionId);
        nextReceipts = [finalReceipt, ...without].slice(0, 100);
        return nextReceipts;
      });
      await saveGoogleSyncReceipts(nextReceipts);
      recordWidgetUpdateTrigger('Google Workout Sync Verified');
      return finalReceipt;
    },
    []
  );

  const handleClearSyncOutbox = useCallback(async () => {
    setSyncOutbox([]);
    await clearSyncOutbox();
  }, []);

  const handleClearGoogleSyncReceipts = useCallback(async () => {
    setGoogleSyncReceipts([]);
    await saveGoogleSyncReceipts([]);
    try {
      await fetch('/api/google-sync/receipts', { method: 'DELETE' });
    } catch {
      // Ignore offline delete error
    }
  }, []);

  const handleShareSingleWorkoutPdf = useCallback(
    async (record: WorkoutHistoryRecord) => {
      const pdfBlob = await generateDateWorkoutPdfBlob({
        dateIso: record.date,
        sessions: [record],
        landmarks,
        weightUnit: nutritionGoals.weightUnit,
        nutritionRecord: nutritionByDate[record.date],
      });
      await shareOrDownloadPdfBlob({
        blob: pdfBlob,
        filename: `hyperlog-workout-${record.date}.pdf`,
        title: `${record.title} · HyperLog Report`,
        text: `${record.title} (${record.totalSets} sets · ${record.estimatedCaloriesKcal} kcal)`,
      });
    },
    [landmarks, nutritionGoals.weightUnit, nutritionByDate]
  );

  const handleSaveDailyNutrition = async (
    record: DailyNutritionRecord,
    addedMeal?: MealEntry
  ) => {
    setNutritionByDate((prev) => ({ ...prev, [record.date]: record }));
    await saveDailyNutrition(record);
    recordWidgetUpdateTrigger(
      addedMeal ? `Meal Saved (${addedMeal.name})` : 'Daily Nutrition Updated'
    );

    if (addedMeal && appPreferences.autoQueueHealthConnect !== false) {
      const ev: SyncOutboxEvent = {
        id: `sync_nut_${Date.now()}`,
        recordType: 'NUTRITION_RECORD',
        healthConnectType: 'NutritionRecord',
        googleFitDataSource: 'raw:com.google.nutrition:com.hyperlog.rp',
        createdAt: new Date().toISOString(),
        status: 'READY_FOR_BRIDGE',
        payload: {
          date: record.date,
          mealType: addedMeal.mealType,
          mealName: addedMeal.name,
          energyKcal: addedMeal.calories,
          proteinGrams: addedMeal.proteinG,
          carbsGrams: addedMeal.carbsG,
          fatGrams: addedMeal.fatG,
        },
      };
      setSyncOutbox((prev) => [ev, ...prev]);
      await enqueueSyncEvent(ev);
    }
  };

  const handleSaveNutritionGoals = async (goals: NutritionGoals) => {
    setNutritionGoals(goals);
    await saveNutritionGoals(goals);
    recordWidgetUpdateTrigger('Nutrition Targets Updated');
  };

  const handleToggleWeightUnit = async (unit: 'kg' | 'lb') => {
    const updated = { ...nutritionGoals, weightUnit: unit };
    setNutritionGoals(updated);
    await saveNutritionGoals(updated);
  };

  const handleSaveCustomMeals = async (meals: SavedCustomMeal[]) => {
    setSavedCustomMeals(meals);
    await saveSavedCustomMeals(meals);
    recordWidgetUpdateTrigger('Custom Meal Preset Saved');
  };

  const handleQuickLogSavedMeal = async (meal: SavedCustomMeal) => {
    const todayIso = formatLocalDateISO(new Date());
    const existingDay = nutritionByDate[todayIso] ?? {
      date: todayIso,
      bodyweightKg: appPreferences.calculatorProfile.weightKg || 70,
      stepsCount: 0,
      meals: [],
    };
    logTelemetryEvent({
      level: 'ACTION',
      category: 'nutrition',
      event: 'MEAL_LOGGED',
      metadata: { mealName: meal.name, calories: meal.calories, proteinG: meal.proteinG },
    });
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const addedMeal: MealEntry = {
      id: `m_quick_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: todayIso,
      mealType: meal.mealType || 'Post-Workout',
      name: meal.name,
      calories: meal.calories,
      proteinG: meal.proteinG,
      carbsG: meal.carbsG,
      fatG: meal.fatG,
      loggedAt: `${hh}:${mm}`,
    };
    await handleSaveDailyNutrition(
      {
        ...existingDay,
        meals: [...existingDay.meals, addedMeal],
      },
      addedMeal
    );
  };

  const handleSavePreferences = async (prefs: AppPreferences) => {
    setAppPreferences(prefs);
    await saveAppPreferences(prefs);
  };

  const handleSaveWellbeing = async (record: WellbeingDailyRecord) => {
    setWellbeingByDate((prev) => ({ ...prev, [record.date]: record }));
    await saveDailyWellbeing(record);
    recordWidgetUpdateTrigger('Daily Wellbeing Updated');
  };

  const handleSyncOnlineCatalog = async (): Promise<{
    addedExercises: number;
    addedTemplates: number;
    totalExercises: number;
  }> => {
    setIsSyncingOnline(true);
    try {
      let data: OnlineCatalogSyncResponse;
      try {
        const res = await fetch('/api/catalog/online');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        data = (await res.json()) as OnlineCatalogSyncResponse;
      } catch {
        // Fallback directly to GitHub public JSON over mobile data / Wi-Fi if backend route is unreachable
        data = await fetchOnlineCatalogDirect();
      }

      const existingExIds = new Set(exerciseLibrary.map((e) => e.id));
      const newExercises = (data.exercises || []).filter((e) => !existingExIds.has(e.id));

      const existingTplIds = new Set(workoutTemplates.map((t) => t.id));
      const newTemplates = (data.templates || []).filter((t) => !existingTplIds.has(t.id));

      if (newExercises.length > 0) {
        await saveBulkLibraryExercises(newExercises);
      }
      if (newTemplates.length > 0) {
        await saveBulkWorkoutTemplates(newTemplates);
      }

      const mergedExercises = [...exerciseLibrary, ...newExercises].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      const categoryRank = (c: WorkoutTemplate['category']) =>
        c === 'Custom' ? 0 : c === 'Starter' ? 1 : 2;
      const mergedTemplates = [...workoutTemplates, ...newTemplates].sort((a, b) => {
        const diff = categoryRank(a.category) - categoryRank(b.category);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });

      setExerciseLibrary(mergedExercises);
      setWorkoutTemplates(mergedTemplates);

      return {
        addedExercises: newExercises.length,
        addedTemplates: newTemplates.length,
        totalExercises: mergedExercises.length,
      };
    } finally {
      setIsSyncingOnline(false);
    }
  };

  const handleExportBackup = async () => {
    const json = await exportFullBackupJSON();
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlobFile(blob, `hyperlog-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleSyncEncryptedCloudVault = useCallback(async () => {
    if (!firebaseUser) return;
    const { syncEncryptedVaultPartition } = await import('./services/userManagementService');
    await syncEncryptedVaultPartition({
      uid: firebaseUser.uid,
      chunkType: 'nutrition_wellbeing',
      plainObject: {
        nutritionByDate,
        wellbeingByDate,
        savedCustomMeals,
      },
      recordCount:
        Object.keys(nutritionByDate).length +
        Object.keys(wellbeingByDate).length +
        savedCustomMeals.length,
    });
    await syncEncryptedVaultPartition({
      uid: firebaseUser.uid,
      chunkType: 'workouts_sets',
      plainObject: {
        setLogs: setLogs.slice(-600),
        workoutHistory: workoutHistory.slice(0, 120),
      },
      recordCount: setLogs.length + workoutHistory.length,
    });
    await syncEncryptedVaultPartition({
      uid: firebaseUser.uid,
      chunkType: 'goals_preferences',
      plainObject: {
        nutritionGoals,
        appPreferences,
      },
      recordCount: 2,
    });
  }, [
    firebaseUser,
    nutritionByDate,
    wellbeingByDate,
    savedCustomMeals,
    setLogs,
    workoutHistory,
    nutritionGoals,
    appPreferences,
  ]);

  const handleRestoreEncryptedCloudVault = useCallback(async () => {
    if (!firebaseUser) return;
    const { readEncryptedVaultPartition } = await import('./services/userManagementService');
    const nutChunk = await readEncryptedVaultPartition<{
      nutritionByDate?: Record<string, DailyNutritionRecord>;
      wellbeingByDate?: Record<string, WellbeingDailyRecord>;
      savedCustomMeals?: SavedCustomMeal[];
    }>(firebaseUser.uid, 'nutrition_wellbeing');

    if (nutChunk?.nutritionByDate) {
      setNutritionByDate(nutChunk.nutritionByDate);
      for (const rec of Object.values(nutChunk.nutritionByDate)) {
        await saveDailyNutrition(rec);
      }
    }
    if (nutChunk?.wellbeingByDate) {
      setWellbeingByDate(nutChunk.wellbeingByDate);
      for (const rec of Object.values(nutChunk.wellbeingByDate)) {
        await saveDailyWellbeing(rec);
      }
    }
    if (nutChunk?.savedCustomMeals) {
      setSavedCustomMeals(nutChunk.savedCustomMeals);
      await saveSavedCustomMeals(nutChunk.savedCustomMeals);
    }

    const workChunk = await readEncryptedVaultPartition<{
      setLogs?: SetLogEntry[];
      workoutHistory?: WorkoutHistoryRecord[];
    }>(firebaseUser.uid, 'workouts_sets');

    if (workChunk?.setLogs && workChunk.setLogs.length > 0) {
      updateSetLogsSync(workChunk.setLogs);
      await saveBulkSetLogs(workChunk.setLogs);
    }
    if (workChunk?.workoutHistory && workChunk.workoutHistory.length > 0) {
      setWorkoutHistory(workChunk.workoutHistory);
      for (const h of workChunk.workoutHistory) {
        await saveWorkoutHistoryRecord(h);
      }
    }

    const goalsChunk = await readEncryptedVaultPartition<{
      nutritionGoals?: NutritionGoals;
      appPreferences?: AppPreferences;
    }>(firebaseUser.uid, 'goals_preferences');

    if (goalsChunk?.nutritionGoals) {
      setNutritionGoals(goalsChunk.nutritionGoals);
      await saveNutritionGoals(goalsChunk.nutritionGoals);
    }
    if (goalsChunk?.appPreferences) {
      setAppPreferences(goalsChunk.appPreferences);
      await saveAppPreferences(goalsChunk.appPreferences);
    }
  }, [firebaseUser, updateSetLogsSync]);

  const handleExportGdprJson = useCallback(async () => {
    const dbDumpRaw = await exportFullBackupJSON();
    let parsedDb: unknown = {};
    try {
      parsedDb = JSON.parse(dbDumpRaw);
    } catch {
      parsedDb = {};
    }
    const portableArchive = {
      schema: 'HyperLog-GDPR-Art20-CCPA-Portable-Export-v1',
      exportedAt: new Date().toISOString(),
      accountProfile: userProfile,
      privacyConsent: userConsent,
      complianceAuditLogs: userAuditLogs,
      isolatedFitnessAndNutritionVault: parsedDb,
    };
    const blob = new Blob([JSON.stringify(portableArchive, null, 2)], {
      type: 'application/json',
    });
    downloadBlobFile(
      blob,
      `hyperlog-gdpr-data-export-${new Date().toISOString().slice(0, 10)}.json`
    );
  }, [userProfile, userConsent, userAuditLogs]);

  const handleAccountErased = useCallback(
    async (erasedUid: string) => {
      await deleteIsolatedUserDatabase(erasedUid);
      await setActiveUserStorageNamespace(null);
      const guestState = await initializeDatabaseIfNeeded();
      applyDatabaseSnapshot(guestState);
      setFirebaseUser(null);
      setUserProfile(null);
      setUserConsent(null);
      setUserAuditLogs([]);
      setRequiresMfaChallenge(false);
    },
    [applyDatabaseSnapshot]
  );

  const handleImportBackup = async (jsonContent: string) => {
    await importFullBackupJSON(jsonContent);
    const fresh = await loadAllDatabaseState();
    applyDatabaseSnapshot(fresh);
  };

  const handleResetDefaults = async () => {
    await resetDatabaseToDefaults();
    await purgeTelemetryLogs({ resetDayZeroEpoch: true, includeArchives: false });
    const fresh = await loadAllDatabaseState();
    applyDatabaseSnapshot(fresh);
    setActiveWeek(1);
    setActiveDay(1);
  };

  const weeklyCompletedSetsCount = useMemo(
    () => setLogs.filter((s) => s.week === activeWeek && s.completed).length,
    [setLogs, activeWeek]
  );

  const widgetSnapshot = useMemo(
    () =>
      computeWidgetProgressSnapshot({
        activeWeek,
        plan,
        setLogs,
        workoutHistory,
        nutritionByDate,
        nutritionGoals,
      }),
    [activeWeek, plan, setLogs, workoutHistory, nutritionByDate, nutritionGoals]
  );

  useEffect(() => {
    if (!isLoaded) return;
    syncAndroidHomeWidget(widgetSnapshot, lastWidgetSync.trigger);
  }, [isLoaded, widgetSnapshot, lastWidgetSync.trigger]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__hyperlogSelectNativeTab = (rawTab: string) => {
      const norm = (rawTab || '').trim().toLowerCase();
      const mapped: AppTab =
        norm === '1' || norm === 'anatomy'
          ? AppTab.Anatomy
          : norm === '2' || norm === 'workouts'
          ? AppTab.Workouts
          : norm === '3' || norm === 'library'
          ? AppTab.Library
          : norm === '4' || norm === 'wellness' || norm === 'calories'
          ? AppTab.Calories
          : norm === '5' || norm === 'settings'
          ? AppTab.Settings
          : AppTab.TrackSets;
      setCompletedWorkoutView(null);
      if (mapped === AppTab.TrackSets) {
        setTrackSubView('log');
      }
      setActiveTab(mapped);
    };
    return () => {
      delete window.__hyperlogSelectNativeTab;
    };
  }, []);

  const activeSessionSetProgress = useMemo(() => {
    if (activeStandaloneSession) {
      const rows = setLogs.filter(
        (s) => s.templateSessionId === activeStandaloneSession.sessionId
      );
      return {
        completedSets: rows.filter((s) => s.completed).length,
        totalSets: rows.length,
        title: activeStandaloneSession.templateName,
      };
    }
    const dayObj = plan.find((d) => d.dayNumber === activeDay) ?? plan[0];
    const rows = setLogs.filter(
      (s) => !s.templateSessionId && s.week === activeWeek && s.dayNumber === activeDay
    );
    return {
      completedSets: rows.filter((s) => s.completed).length,
      totalSets: rows.length,
      title: dayObj?.title ?? `Day ${activeDay}`,
    };
  }, [activeStandaloneSession, setLogs, plan, activeDay, activeWeek]);

  const showMinimizedWorkoutBar =
    isLoaded &&
    Boolean(activeWorkoutRunState?.isActive) &&
    !(activeTab === AppTab.TrackSets && trackSubView === 'log');

  useEffect(() => {
    if (optimisticTab !== null && activeTab === optimisticTab) {
      setOptimisticTab(null);
    }
  }, [activeTab, optimisticTab]);

  // Ensure every interactive element in the DOM carries 'no-touch-delay' for instant Android touch response
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observeRoot = document.body ?? appRootRef.current;
    if (!observeRoot) return;

    const INTERACTIVE_SELECTOR =
      'button, a, input, select, textarea, summary, [role="button"], [role="tab"]';

    const stampInteractiveNodes = (scope: ParentNode) => {
      if (scope instanceof Element && scope.matches(INTERACTIVE_SELECTOR)) {
        if (!scope.classList.contains('no-touch-delay')) {
          scope.classList.add('no-touch-delay');
        }
      }
      const nodes = scope.querySelectorAll(INTERACTIVE_SELECTOR);
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (!el.classList.contains('no-touch-delay')) {
          el.classList.add('no-touch-delay');
        }
      }
    };

    stampInteractiveNodes(observeRoot);

    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (let i = 0; i < m.addedNodes.length; i++) {
          const added = m.addedNodes[i];
          if (added.nodeType === Node.ELEMENT_NODE) {
            stampInteractiveNodes(added as Element);
          }
        }
      }
    });

    observer.observe(observeRoot, {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  const handleNavPressStart = useCallback(
    (navKey: string, pointerType?: string) => {
      setPressedNavKey(navKey);
      if (pointerType === 'touch' && appPreferences.vibrateOnRestComplete) {
        if (isRunningInAndroidStandaloneApk()) {
          triggerAndroidHaptic('tick');
        } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate(5);
          } catch {
            // Ignore vibration permission restrictions
          }
        }
      }
    },
    [appPreferences.vibrateOnRestComplete]
  );

  const handleNavPressEnd = useCallback(() => {
    setPressedNavKey((prev) => (prev === null ? prev : null));
  }, []);

  const handlePrimaryNavigationSelect = useCallback(
    (targetTab: AppTab, extraTransitionUpdate?: () => void) => {
      setPressedNavKey(null);
      setOptimisticTab(targetTab);
      logTelemetryEvent({
        level: 'ACTION',
        category: 'navigation',
        event: 'PRIMARY_TAB_SELECTED',
        metadata: { tab: targetTab },
      });
      startTransition(() => {
        setCompletedWorkoutView(null);
        extraTransitionUpdate?.();
        setActiveTab(targetTab);
      });
    },
    []
  );

  const visualActiveTab = optimisticTab ?? activeTab;
  const isSettingsActive = visualActiveTab === AppTab.Settings;

  return (
    <div ref={appRootRef} className="min-h-screen flex flex-col hl-canvas">
      {/* Safe-Area Aware Top Bar: Crest + Wordmark | 5 Desktop Nav Links | Top-Right Settings Tab Button */}
      <header className="sticky top-0 z-30 pt-safe-top hl-header backdrop-blur-md border-b">
        <div className="h-14 max-w-7xl mx-auto px-safe flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Vibrant Crest + HyperLog Wordmark */}
          <button
            type="button"
            data-pressed={pressedNavKey === 'brand' ? 'true' : 'false'}
            onPointerDown={(e) => handleNavPressStart('brand', e.pointerType)}
            onPointerUp={handleNavPressEnd}
            onPointerCancel={handleNavPressEnd}
            onPointerLeave={handleNavPressEnd}
            onBlur={handleNavPressEnd}
            onClick={() =>
              handlePrimaryNavigationSelect(AppTab.TrackSets, () => {
                setTrackSubView('log');
                setTrackFocusNonce((n) => n + 1);
              })
            }
            className="no-touch-delay hl-nav-press min-h-[44px] px-1.5 -ml-1.5 rounded-xl flex items-center gap-2.5 whitespace-nowrap shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <img
              src="/pwa-192x192.png"
              alt="HyperLog"
              width={32}
              height={32}
              decoding="async"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-lg object-cover shrink-0"
            />
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              HyperLog
            </span>
          </button>

          {/* Zone 2: 5 Concise Single-Line Desktop Nav Links (Prioritized Press Visual Feedback) */}
          <nav
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400"
            aria-label="Primary Navigation"
          >
            {(
              [
                { id: AppTab.TrackSets, label: 'Tracker', testId: 'nav-tab-tracker' },
                { id: AppTab.Anatomy, label: 'Anatomy', testId: 'nav-tab-anatomy' },
                { id: AppTab.Workouts, label: 'Workouts', testId: 'nav-tab-workouts' },
                { id: AppTab.Library, label: 'Library', testId: 'nav-tab-library' },
                { id: AppTab.Calories, label: 'Wellness', testId: 'nav-tab-wellness' },
              ] as const
            ).map((navItem) => {
              const navKey = `desktop_${navItem.id}`;
              const isPressed = pressedNavKey === navKey;
              const isVisualActive = visualActiveTab === navItem.id && !completedWorkoutView;
              return (
                <button
                  key={navItem.id}
                  type="button"
                  data-testid={navItem.testId}
                  aria-current={isVisualActive ? 'page' : undefined}
                  data-pressed={isPressed ? 'true' : 'false'}
                  onPointerDown={(e) => handleNavPressStart(navKey, e.pointerType)}
                  onPointerUp={handleNavPressEnd}
                  onPointerCancel={handleNavPressEnd}
                  onPointerLeave={handleNavPressEnd}
                  onBlur={handleNavPressEnd}
                  onClick={() => handlePrimaryNavigationSelect(navItem.id)}
                  className={`no-touch-delay hl-nav-press min-h-[42px] px-2 py-1 rounded-t-lg whitespace-nowrap shrink-0 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    isPressed
                      ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-blue-500/10 dark:bg-blue-400/15 font-semibold'
                      : isVisualActive
                      ? 'text-slate-900 dark:text-white border-blue-600 dark:border-blue-400 font-semibold'
                      : 'border-transparent hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <span>{navItem.label}</span>
                  {navItem.id === AppTab.TrackSets && activeWorkoutRunState?.isActive && (
                    <LiveWorkoutClock
                      runState={activeWorkoutRunState}
                      prefix="· "
                      className="ml-1.5 font-mono tabular-nums text-xs text-emerald-600 dark:text-emerald-400"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: User Profile Avatar + Minimal Settings Icon */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              data-testid="open-account-auth-btn"
              aria-label={
                firebaseUser
                  ? `Account profile (${userProfile?.displayName || firebaseUser.displayName || 'User'})`
                  : 'Sign In to HyperLog'
              }
              data-pressed={pressedNavKey === 'auth' ? 'true' : 'false'}
              onPointerDown={(e) => handleNavPressStart('auth', e.pointerType)}
              onPointerUp={handleNavPressEnd}
              onPointerCancel={handleNavPressEnd}
              onPointerLeave={handleNavPressEnd}
              onBlur={handleNavPressEnd}
              onClick={() => {
                setPressedNavKey(null);
                setIsAuthModalOpen(true);
              }}
              className="no-touch-delay hl-nav-press min-h-[42px] pl-1.5 pr-3 py-1 rounded-full hl-subtle border border-slate-200/90 dark:border-slate-700/80 hover:border-blue-500/60 flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  firebaseUser
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#2563EB] text-white'
                }`}
              >
                {firebaseUser ? (
                  (userProfile?.displayName || firebaseUser.displayName || 'U')
                    .trim()
                    .charAt(0)
                    .toUpperCase()
                ) : (
                  <UserIcon className="w-3.5 h-3.5" />
                )}
              </span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[96px] truncate">
                {firebaseUser
                  ? userProfile?.displayName || firebaseUser.displayName || 'Account'
                  : 'Sign In'}
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-tab-settings"
              aria-label="Settings"
              title="Settings"
              data-pressed={pressedNavKey === 'settings' ? 'true' : 'false'}
              onPointerDown={(e) => handleNavPressStart('settings', e.pointerType)}
              onPointerUp={handleNavPressEnd}
              onPointerCancel={handleNavPressEnd}
              onPointerLeave={handleNavPressEnd}
              onBlur={handleNavPressEnd}
              onClick={() => handlePrimaryNavigationSelect(AppTab.Settings)}
              aria-current={isSettingsActive ? 'page' : undefined}
              className={`no-touch-delay hl-nav-press min-h-[42px] min-w-[42px] p-2 rounded-full border flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                pressedNavKey === 'settings'
                  ? 'bg-[#2563EB] text-white border-[#2563EB]'
                  : isSettingsActive && !completedWorkoutView
                  ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-xs'
                  : 'hl-subtle border-slate-200/90 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" strokeWidth={1.85} />
              <span className="sr-only">Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-safe pt-4 pb-24 md:pb-12 space-y-5">
        {/* Startup Training Resource Package Progress Strip (Non-layout-shifting floating toast) */}
        {packageDownloadProgress && (
          <div
            data-testid="startup-package-banner"
            className="fixed left-3 right-3 sm:left-auto sm:right-6 sm:w-96 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-30 hl-card rounded-2xl px-4 py-3 space-y-2 shadow-lg pointer-events-none"
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {packageDownloadProgress.detail}
              </span>
              <span className="font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400 shrink-0">
                {packageDownloadProgress.percent}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-200"
                style={{ width: `${packageDownloadProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Clean, Collapsible Phone APK Download Dropdown (hidden on Tracker & Settings to keep Tracker calm and distraction-free) */}
        {showApkBanner &&
          activeTab !== AppTab.Settings &&
          activeTab !== AppTab.TrackSets &&
          !completedWorkoutView && (
          <ExpandableInfoDropdown
            title="Get HyperLog on Your Android Phone (.APK)"
            subtitle="Tap to open phone app download & offline workout pack options"
            icon={<Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
            defaultOpen={false}
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Includes Guided Breathing Audio, Indian Recipes, Forearm Workouts &amp; Offline Storage.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`${getFreshApkHref()}&t=${Date.now()}`}
                  download={APK_FILE_NAME}
                  onClick={(e) => {
                    e.currentTarget.href = `${getFreshApkHref()}&t=${Date.now()}`;
                    setQuickApkState('done');
                    window.setTimeout(() => setQuickApkState('idle'), 4000);
                  }}
                  className="no-touch-delay min-h-[44px] px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {quickApkState === 'done' ? (
                    <>
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>Downloading .APK</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Download .APK</span>
                    </>
                  )}
                </a>

                <a
                  href={`${getFreshBundleHref()}&t=${Date.now()}`}
                  download={BUNDLE_ZIP_FILE_NAME}
                  onClick={(e) => {
                    e.currentTarget.href = `${getFreshBundleHref()}&t=${Date.now()}`;
                    setQuickBundleState('done');
                    window.setTimeout(() => setQuickBundleState('idle'), 4000);
                  }}
                  className="no-touch-delay min-h-[44px] px-3.5 py-2 text-xs font-semibold hl-subtle border text-slate-800 dark:text-slate-100 hover:border-blue-500 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span>{quickBundleState === 'done' ? 'Downloading…' : 'Offline Pack (.ZIP)'}</span>
                </a>

                <PWAInstallButton compact />

                <button
                  type="button"
                  onClick={() => {
                    void handleQuickApkDownload;
                    void handleQuickBundleDownload;
                    setIsGuideOpen(true);
                  }}
                  className="no-touch-delay min-h-[44px] px-3 py-2 text-xs font-medium hl-subtle border text-slate-700 dark:text-slate-200 rounded-xl whitespace-nowrap shrink-0"
                >
                  Install Help
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowApkBanner(false);
                    try {
                      window.localStorage.setItem('hyperlog_dismiss_apk_banner', '1');
                    } catch {
                      // Ignore storage error
                    }
                  }}
                  className="no-touch-delay min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 whitespace-nowrap shrink-0"
                  aria-label="Hide phone app download bar"
                >
                  <X className="w-3.5 h-3.5 shrink-0" />
                  <span>Hide</span>
                </button>
              </div>
            </div>
          </ExpandableInfoDropdown>
        )}

        {!isLoaded ? (
          <div className="min-h-[70vh] py-20 text-center text-sm text-slate-500 dark:text-slate-400">
            Loading workout log…
          </div>
        ) : completedWorkoutView ? (
          <Suspense fallback={null}>
            <PageWorkoutComplete
              record={completedWorkoutView.record}
              landmarks={landmarks}
              weightUnit={nutritionGoals.weightUnit}
              streakDays={widgetSnapshot.streakDays}
              cardioMinutesLogged={completedWorkoutView.cardioMinutes}
              onSharePdf={handleShareSingleWorkoutPdf}
              onReturnToTracker={() => {
                setCompletedWorkoutView(null);
                setTrackSubView('log');
                setActiveTab(AppTab.TrackSets);
              }}
              onOpenCalendar={() => {
                setCompletedWorkoutView(null);
                setTrackSubView('calendar');
                setActiveTab(AppTab.TrackSets);
              }}
              onOpenWellness={() => {
                setCompletedWorkoutView(null);
                setActiveTab(AppTab.Calories);
              }}
            />
          </Suspense>
        ) : (
          <Suspense fallback={null}>
            {activeTab === AppTab.TrackSets && (
              <Page2TrackSets
                key={`tracker_refresh_${trackerRefreshNonce}`}
                activeWeek={activeWeek}
                onChangeWeek={handleChangeWeek}
                activeDay={activeDay}
                userGreetingName={
                  userProfile?.displayName || firebaseUser?.displayName || undefined
                }
                hasSelectedWorkout={Boolean(activeStandaloneSession) || isScheduleDaySelected}
                onClearSelectedWorkout={handleClearSelectedWorkout}
                onCancelWorkoutSession={handleCancelActiveWorkoutSession}
                onSelectScheduleDay={handleSelectScheduleDay}
                activeStandaloneSession={activeStandaloneSession}
                activeWorkoutRunState={activeWorkoutRunState}
                onStartGlobalWorkout={handleStartGlobalWorkout}
                onTogglePauseGlobalWorkout={handleTogglePauseGlobalWorkout}
                onStopGlobalWorkoutTimer={handleStopGlobalWorkoutTimer}
                onMinimizeWorkout={handleMinimizeTracker}
                onSubViewChange={setTrackSubView}
                onClearStandaloneSession={handleClearStandaloneSession}
                onStartStandaloneTemplate={handleStartStandaloneTemplate}
                onStartQuickWorkout={handleStartQuickWorkout}
                onRepeatWorkout={handleRepeatHistoryWorkout}
                onAddExerciseToActiveWorkout={handleAddExerciseToActiveWorkout}
                onRemoveExerciseFromActiveWorkout={handleRemoveExerciseFromActiveWorkout}
                onFinishActiveWorkout={handleFinishActiveWorkout}
                onCompleteWorkoutAndRedirect={(rec, cardioMinutes) => {
                  if (appPreferences.autoSyncGoogleFit !== false) {
                    void handleSyncWorkoutWithGoogle(rec, cardioMinutes);
                  }
                  setCompletedWorkoutView({ record: rec, cardioMinutes });
                }}
                trackFocusNonce={trackFocusNonce}
                plan={plan}
                templates={workoutTemplates}
                exerciseLibrary={exerciseLibrary}
                landmarks={landmarks}
                setLogs={setLogs}
                workoutHistory={workoutHistory}
                nutritionByDate={nutritionByDate}
                feedback={feedback}
                weightUnit={nutritionGoals.weightUnit}
                streakDays={widgetSnapshot.streakDays}
                bestStreakDays={widgetSnapshot.bestStreakDays}
                todayActive={
                  widgetSnapshot.weekDays[widgetSnapshot.weekDays.length - 1]?.active ?? false
                }
                defaultRestSeconds={appPreferences.defaultRestSeconds}
                defaultVibrateEnabled={appPreferences.vibrateOnRestComplete}
                defaultSoundEnabled={appPreferences.soundOnTimer !== false}
                defaultAutoTimer={appPreferences.autoStartRestTimer}
                onToggleWeightUnit={handleToggleWeightUnit}
                onUpsertSet={handleUpsertSet}
                onDeleteSet={handleDeleteSet}
                onSaveFeedback={handleSaveFeedback}
                onSaveHistoryRecord={handleSaveHistoryRecord}
                onLogPastWorkout={handleLogPastWorkout}
                onDeleteManualHistoryRecord={handleDeleteManualHistoryRecord}
                onCreateCustomExercise={handleCreateExercise}
                onStartCustomExerciseWorkout={handleStartCustomExerciseWorkout}
                savedCustomMeals={savedCustomMeals}
                todayCalories={widgetSnapshot.todayCalories}
                targetCalories={widgetSnapshot.targetCalories}
                todayProteinG={widgetSnapshot.todayProteinG}
                targetProteinG={widgetSnapshot.targetProteinG}
                onQuickLogSavedMeal={handleQuickLogSavedMeal}
                onJumpToAnatomy={() => {
                  setCompletedWorkoutView(null);
                  setActiveTab(AppTab.Anatomy);
                }}
                onJumpToWorkouts={() => {
                  setCompletedWorkoutView(null);
                  setActiveTab(AppTab.Workouts);
                }}
                onJumpToWellnessSection={(section) => {
                  setCompletedWorkoutView(null);
                  setWellnessInitialSubTab(section);
                  setWellnessFocusNonce((n) => n + 1);
                  setActiveTab(AppTab.Calories);
                }}
              />
            )}

            {activeTab === AppTab.Anatomy && (
              <Page1Anatomy
                activeWeek={activeWeek}
                onChangeWeek={handleChangeWeek}
                plan={plan}
                landmarks={landmarks}
                setLogs={setLogs}
                weightUnit={nutritionGoals.weightUnit}
                isDark={isDark}
                onUpdateLandmark={handleUpdateLandmark}
                onJumpToTrackDay={(dayNumber) => {
                  void handleSelectScheduleDay(dayNumber);
                }}
              />
            )}

            {activeTab === AppTab.Workouts && (
              <Page3Workouts
                activeWeek={activeWeek}
                onChangeWeek={handleChangeWeek}
                plan={plan}
                templates={workoutTemplates}
                exerciseLibrary={exerciseLibrary}
                landmarks={landmarks}
                setLogs={setLogs}
                workoutHistory={workoutHistory}
                nutritionByDate={nutritionByDate}
                weightUnit={nutritionGoals.weightUnit}
                streakDays={widgetSnapshot.streakDays}
                bestStreakDays={widgetSnapshot.bestStreakDays}
                activeStandaloneSession={activeStandaloneSession}
                onSaveDayPlan={handleSaveDayPlan}
                onSaveTemplate={handleSaveTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onAssignTemplateToDay={handleAssignTemplateToDay}
                onStartStandaloneTemplate={handleStartStandaloneTemplate}
                onSaveHistoryRecord={handleSaveHistoryRecord}
                onLogPastWorkout={handleLogPastWorkout}
                onDeleteManualHistoryRecord={handleDeleteManualHistoryRecord}
                onOpenDayInTracker={(dayNumber) => {
                  void handleSelectScheduleDay(dayNumber);
                }}
                onRepeatWorkout={(session) => {
                  void handleRepeatHistoryWorkout(session);
                }}
                onReturnToLiveTracker={() => {
                  setTrackFocusNonce((n) => n + 1);
                  setActiveTab(AppTab.TrackSets);
                }}
                onSyncOnlineCatalog={handleSyncOnlineCatalog}
                isSyncingOnline={isSyncingOnline}
                onCreateCustomExercise={handleCreateExercise}
              />
            )}

            {activeTab === AppTab.Library && (
              <PageLibrary
                exercises={exerciseLibrary}
                totalCatalogCount={totalLibraryCatalogCount}
                isHydratingFullCatalog={isHydratingFullLibrary}
                landmarks={landmarks}
                templates={workoutTemplates}
                setLogs={setLogs}
                plan={plan}
                weightUnit={nutritionGoals.weightUnit}
                isDark={isDark}
                activeWorkoutLabel={
                  activeStandaloneSession
                    ? activeStandaloneSession.templateName
                    : plan.find((d) => d.dayNumber === activeDay)?.title ?? `Day ${activeDay}`
                }
                onCreateExercise={handleCreateExercise}
                onAddExerciseToTemplate={handleAddExerciseToTemplate}
                onAddExerciseToActiveWorkout={handleAddExerciseToActiveWorkout}
                onSyncOnlineCatalog={handleSyncOnlineCatalog}
                isSyncingOnline={isSyncingOnline}
              />
            )}

            {activeTab === AppTab.Calories && (
              <PageWellnessHub
                wellbeingByDate={wellbeingByDate}
                onSaveWellbeing={handleSaveWellbeing}
                templates={workoutTemplates}
                exerciseLibrary={exerciseLibrary}
                landmarks={landmarks}
                onStartStandaloneTemplate={handleStartStandaloneTemplate}
                onLogPastWorkout={handleLogPastWorkout}
                nutritionByDate={nutritionByDate}
                nutritionGoals={nutritionGoals}
                goals={nutritionGoals}
                preferences={appPreferences}
                savedCustomMeals={savedCustomMeals}
                weeklyCompletedSetsCount={weeklyCompletedSetsCount}
                streakDays={widgetSnapshot.streakDays}
                todayActive={
                  widgetSnapshot.weekDays[widgetSnapshot.weekDays.length - 1]?.active ?? false
                }
                isDark={isDark}
                onSaveDailyNutrition={handleSaveDailyNutrition}
                onSaveGoals={handleSaveNutritionGoals}
                onSavePreferences={handleSavePreferences}
                onSaveCustomMeals={handleSaveCustomMeals}
                initialSubTab={wellnessInitialSubTab}
                focusNonce={wellnessFocusNonce}
              />
            )}

            {activeTab === AppTab.Settings && (
              <PageSettings
                theme={theme}
                onChangeTheme={setTheme}
                weightUnit={nutritionGoals.weightUnit}
                onToggleWeightUnit={handleToggleWeightUnit}
                preferences={appPreferences}
                onSavePreferences={handleSavePreferences}
                widgetSnapshot={widgetSnapshot}
                lastWidgetSync={lastWidgetSync}
                setLogs={setLogs}
                workoutHistory={workoutHistory}
                plan={plan}
                landmarks={landmarks}
                nutritionByDate={nutritionByDate}
                activeStandaloneSession={activeStandaloneSession}
                trainingPackageStatus={trainingPackageStatus}
                googleSyncReceipts={googleSyncReceipts}
                syncOutbox={syncOutbox}
                onSyncWorkoutWithGoogle={handleSyncWorkoutWithGoogle}
                onClearGoogleSyncReceipts={handleClearGoogleSyncReceipts}
                onQueueSessionSync={handleQueueSessionSync}
                onClearSyncOutbox={handleClearSyncOutbox}
                onRedownloadTrainingPackage={() =>
                  runStartupPackageDownload(true, exerciseLibrary, workoutTemplates)
                }
                onJumpToTab={setActiveTab}
                onExportBackup={handleExportBackup}
                onImportBackup={handleImportBackup}
                onResetDefaults={handleResetDefaults}
                onForceRefreshTracker={handleForceRefreshTracker}
                onOpenInstallGuide={() => setIsGuideOpen(true)}
                onOpenGlassDesignGuide={() => setIsGlassGuideOpen(true)}
                onOpenClayDesignStudio={() => setIsClayStudioOpen(true)}
              />
            )}
          </Suspense>
        )}
      </main>

      {/* Mobile Fixed 5-Tab Glass Bottom Navigation Bar (Thin Icons, Royal Blue Active State & Bottom Indicator) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe-bottom hl-header backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 shadow-[0_-4px_20px_rgba(15,23,42,0.04)]"
        aria-label="Mobile Navigation"
      >
        <div className="grid grid-cols-5 items-center h-16 px-2 gap-1">
          {[
            { id: AppTab.TrackSets, label: 'Tracker', Icon: Dumbbell, testId: 'mobile-nav-tab-tracker' },
            { id: AppTab.Anatomy, label: 'Anatomy', Icon: Activity, testId: 'mobile-nav-tab-anatomy' },
            { id: AppTab.Workouts, label: 'Workouts', Icon: Calendar, testId: 'mobile-nav-tab-workouts' },
            { id: AppTab.Library, label: 'Library', Icon: BookMarked, testId: 'mobile-nav-tab-library' },
            { id: AppTab.Calories, label: 'Wellness', Icon: Heart, testId: 'mobile-nav-tab-wellness' },
          ].map(({ id, label, Icon, testId }) => {
            const mobileKey = `mobile_${id}`;
            const isPressed = pressedNavKey === mobileKey;
            const active = visualActiveTab === id && !completedWorkoutView;
            return (
              <button
                key={id}
                type="button"
                data-testid={testId}
                aria-current={active ? 'page' : undefined}
                data-pressed={isPressed ? 'true' : 'false'}
                onPointerDown={(e) => handleNavPressStart(mobileKey, e.pointerType)}
                onPointerUp={handleNavPressEnd}
                onPointerCancel={handleNavPressEnd}
                onPointerLeave={handleNavPressEnd}
                onBlur={handleNavPressEnd}
                onClick={() => handlePrimaryNavigationSelect(id)}
                className={`no-touch-delay hl-nav-press relative min-h-[50px] py-1.5 flex flex-col items-center justify-center rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isPressed
                    ? 'bg-[#2563EB]/12 dark:bg-blue-400/18 text-[#2563EB] dark:text-blue-400 font-semibold'
                    : active
                    ? 'text-[#2563EB] dark:text-blue-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:bg-slate-200/60 dark:active:bg-slate-800/60'
                }`}
              >
                <Icon
                  className="w-5 h-5 transition-transform duration-150"
                  strokeWidth={active || isPressed ? 2.15 : 1.55}
                />
                <span className="text-[11px] tracking-tight mt-0.5 whitespace-nowrap leading-tight">
                  {label}
                </span>
                {(active || isPressed) && (
                  <span
                    aria-hidden="true"
                    className="mt-1 w-4 h-1 rounded-full bg-[#2563EB] dark:bg-blue-400 transition-all"
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Cross-Page Minimized Active Workout Bar with Live Global Workout Timer */}
      {showMinimizedWorkoutBar && activeWorkoutRunState && (
        <MinimizedWorkoutBar
          workoutTitle={activeWorkoutRunState.workoutTitle || activeSessionSetProgress.title}
          runState={activeWorkoutRunState}
          isPaused={activeWorkoutRunState.isPaused}
          completedSets={activeSessionSetProgress.completedSets}
          totalSets={activeSessionSetProgress.totalSets}
          onOpenTracker={handleOpenMinimizedTracker}
          onTogglePause={() => {
            void handleTogglePauseGlobalWorkout();
          }}
          onCancelWorkout={(discardLoggedSets) => {
            void handleCancelActiveWorkoutSession(discardLoggedSets);
          }}
        />
      )}

      <OfflineIndicator />

      {/* On-Demand Lazy Modals (mounted only when open so initial DOM & JS boot remain lightweight) */}
      <Suspense fallback={null}>
        {isGuideOpen && (
          <TechnicalGuideModal
            isOpen={isGuideOpen}
            onClose={() => setIsGuideOpen(false)}
            onExportBackup={handleExportBackup}
            onResetDefaults={handleResetDefaults}
          />
        )}

        {isClayStudioOpen && (
          <ClaymorphismDesignStudioModal
            isOpen={isClayStudioOpen}
            onClose={() => setIsClayStudioOpen(false)}
            currentTheme={theme}
            onSelectTheme={(nextTheme) => {
              setTheme(nextTheme);
              logTelemetryEvent({
                level: 'ACTION',
                category: 'ui',
                event: 'THEME_SWITCHED',
                metadata: { theme: nextTheme },
              });
            }}
            onResetAppToDayZero={handleResetDefaults}
          />
        )}

        {isGlassGuideOpen && (
          <GlassmorphismDesignGuideModal
            isOpen={isGlassGuideOpen}
            onClose={() => setIsGlassGuideOpen(false)}
            currentTheme={theme}
            onApplyPastelGlassTheme={() => setTheme(AppTheme.PastelGlass)}
          />
        )}

        {(isAuthModalOpen || requiresMfaChallenge) && (
          <UserAuthAndPrivacyModal
            isOpen={isAuthModalOpen || requiresMfaChallenge}
            onClose={() => {
              if (!requiresMfaChallenge) {
                setIsAuthModalOpen(false);
              }
            }}
            firebaseUser={firebaseUser}
            profile={userProfile}
            consent={userConsent}
            auditLogs={userAuditLogs}
            requiresMfaChallenge={requiresMfaChallenge}
            onRefreshGovernance={() => refreshUserGovernance()}
            onSyncEncryptedCloudVault={handleSyncEncryptedCloudVault}
            onRestoreEncryptedCloudVault={handleRestoreEncryptedCloudVault}
            onExportGdprJson={handleExportGdprJson}
            onAccountErased={handleAccountErased}
          />
        )}
      </Suspense>
    </div>
  );
}

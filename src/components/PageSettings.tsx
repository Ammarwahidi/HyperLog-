import React, { useRef, useState } from 'react';
import {
  AppPreferences,
  AppTab,
  AppTheme,
  WidgetProgressSnapshot,
} from '../types/workout';
import {
  Check,
  Contrast,
  Download,
  Flame,
  FolderArchive,
  Moon,
  RotateCcw,
  Smartphone,
  Sun,
  Upload,
  Vibrate,
} from 'lucide-react';
import {
  APK_FILE_NAME,
  downloadAndroidSourceZip,
  downloadSignedApk,
} from '../utils/apkDownload';
import { PWAInstallButton } from './PWAInstallButton';

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
  onJumpToTab: (tab: AppTab) => void;
  onExportBackup: () => Promise<void>;
  onImportBackup: (jsonContent: string) => Promise<void>;
  onResetDefaults: () => Promise<void>;
  onOpenInstallGuide: () => void;
}

const THEME_CARDS: Array<{
  id: AppTheme;
  title: string;
  subtitle: string;
  swatchBg: string;
  swatchCard: string;
  swatchText: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: AppTheme.Daylight,
    title: 'Daylight Crisp',
    subtitle: 'High-contrast daylight gym visibility',
    swatchBg: '#F8FAFC',
    swatchCard: '#FFFFFF',
    swatchText: '#0F172A',
    Icon: Sun,
  },
  {
    id: AppTheme.NightSlate,
    title: 'Night Slate',
    subtitle: 'Deep cobalt slate for evening sessions',
    swatchBg: '#0B1120',
    swatchCard: '#111827',
    swatchText: '#F8FAFC',
    Icon: Moon,
  },
  {
    id: AppTheme.Amoled,
    title: 'True AMOLED',
    subtitle: 'Pure #000000 black for OLED battery savings',
    swatchBg: '#000000',
    swatchCard: '#0A0D14',
    swatchText: '#FFFFFF',
    Icon: Contrast,
  },
  {
    id: AppTheme.Graphite,
    title: 'Graphite Dark',
    subtitle: 'Neutral charcoal matte dark finish',
    swatchBg: '#121316',
    swatchCard: '#1A1D24',
    swatchText: '#F4F4F5',
    Icon: Moon,
  },
];

const REST_PRESET_SECONDS = [60, 90, 120, 150, 180, 240];

export const PageSettings: React.FC<PageSettingsProps> = ({
  theme,
  onChangeTheme,
  weightUnit,
  onToggleWeightUnit,
  preferences,
  onSavePreferences,
  widgetSnapshot,
  lastWidgetSync,
  onJumpToTab,
  onExportBackup,
  onImportBackup,
  onResetDefaults,
  onOpenInstallGuide,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [apkDownloading, setApkDownloading] = useState<'idle' | 'downloading' | 'done'>('idle');
  const [zipDownloading, setZipDownloading] = useState<'idle' | 'downloading' | 'done'>('idle');
  const [widgetGridPreview, setWidgetGridPreview] = useState<'compact' | 'standard' | 'expanded'>(
    'standard'
  );

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

  const handleApkDownload = async () => {
    if (apkDownloading === 'downloading') return;
    setApkDownloading('downloading');
    await downloadSignedApk();
    setApkDownloading('done');
    window.setTimeout(() => setApkDownloading('idle'), 4000);
  };

  const handleZipDownload = async () => {
    if (zipDownloading === 'downloading') return;
    setZipDownloading('downloading');
    await downloadAndroidSourceZip();
    setZipDownloading('done');
    window.setTimeout(() => setZipDownloading('idle'), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            App Settings &amp; Preferences
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Appearance themes, Android Home Screen streak widget, training units, rest timer haptics, and offline backup
          </p>
        </div>
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
            className="text-xs font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Appearance + Training Preferences */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Appearance & Night Mode Themes */}
          <section className="hl-card rounded-2xl p-4 sm:p-6 space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Appearance &amp; Night Themes
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Automatically syncs status bar, navigation bar, and anatomy contrast
              </p>
            </div>

            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              role="radiogroup"
              aria-label="Select application color theme"
            >
              {THEME_CARDS.map(({ id, title, subtitle, swatchBg, swatchCard, swatchText, Icon }) => {
                const isSelected = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => onChangeTheme(id)}
                    className={`min-h-[76px] p-3.5 rounded-xl border text-left transition-colors flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'border-blue-600 dark:border-blue-400 bg-blue-50/60 dark:bg-blue-950/35'
                        : 'hl-subtle hover:border-slate-400 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                        {subtitle}
                      </p>
                    </div>

                    <div
                      className="w-11 h-11 rounded-lg border border-slate-300/70 dark:border-slate-700 shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: swatchBg }}
                      aria-hidden="true"
                    >
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold font-mono"
                        style={{ backgroundColor: swatchCard, color: swatchText }}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5 text-blue-500" /> : 'Aa'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
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
                    className={`min-h-[38px] px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${
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
                      onClick={() =>
                        onSavePreferences({ ...preferences, defaultRestSeconds: sec })
                      }
                      className={`min-h-[38px] px-3.5 py-1.5 text-xs font-mono tabular-nums font-semibold rounded-lg border transition-colors ${
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
                  className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${
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
                    className="min-h-[38px] px-3 py-1.5 rounded-lg hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 flex items-center gap-1.5"
                  >
                    <Vibrate className="w-3.5 h-3.5" />
                    Test Pulse
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
                    className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      preferences.vibrateOnRestComplete
                        ? 'bg-blue-600 text-white'
                        : 'hl-subtle border text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {preferences.vibrateOnRestComplete ? 'Enabled' : 'Muted'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Offline Backup, Restore & Reset */}
          <section className="hl-card rounded-2xl p-4 sm:p-6 space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Offline Data Backup &amp; Storage
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Export all workouts, RIR logs, custom templates, and meals as a portable JSON file or restore from backup
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={async () => {
                  await onExportBackup();
                  setStatusMessage({
                    tone: 'success',
                    text: 'Saved full offline JSON backup to your device.',
                  });
                }}
                className="min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export JSON Backup
              </button>

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
                className="min-h-[42px] px-4 py-2 hl-subtle border text-slate-800 dark:text-slate-200 hover:border-slate-400 text-xs font-semibold rounded-xl transition-colors flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import JSON Backup
              </button>

              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="min-h-[42px] px-4 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-950/80 rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Demo Data
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await onResetDefaults();
                      setConfirmReset(false);
                      setStatusMessage({
                        tone: 'success',
                        text: 'Database reset to default hypertrophy mesocycle seed.',
                      });
                    }}
                    className="min-h-[42px] px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl"
                  >
                    Confirm Factory Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="min-h-[42px] px-3 py-2 text-xs font-semibold hl-subtle border rounded-xl text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
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
                    className={`min-h-[34px] px-2 py-1 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap ${
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
                    className="p-2.5 rounded-xl bg-[#141F38] hover:bg-slate-800/90 border border-slate-800 text-left transition-colors space-y-1.5"
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
                    className="p-2.5 rounded-xl bg-[#141F38] hover:bg-slate-800/90 border border-slate-800 text-left transition-colors space-y-1.5"
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
                      className="p-2.5 rounded-xl bg-[#141F38] hover:bg-slate-800/90 border border-slate-800 text-left transition-colors space-y-1.5"
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
                      className="p-2.5 rounded-xl bg-[#141F38] hover:bg-slate-800/90 border border-slate-800 text-left transition-colors space-y-1.5"
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
                    className="w-full p-2.5 rounded-xl bg-[#141F38] hover:bg-slate-800/90 border border-slate-800 text-left transition-colors"
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
              <span>AppWidgetManager.updateAppWidget</span>
              <span aria-hidden="true">·</span>
              <span>{lastWidgetSync.trigger}</span>
              <span aria-hidden="true">·</span>
              <span>{lastWidgetSync.timeLabel}</span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Automatically adapts via Android 12+ responsive <code className="font-mono">SizeF</code>{' '}
              buckets and <code className="font-mono">smallestScreenWidthDp</code> font scaling so
              weekly mesocycle set progress bars and your streak count remain sharp on compact and
              large displays alike.
            </p>
          </section>

          {/* 5. Full Phone Application Install Hub (Native Android APK v2.0 + Standalone PWA) */}
          <section className="hl-card rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <img
                src="/pwa-192x192.png"
                alt="HyperLog vibrant dumbbell flame crest"
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-2xl shrink-0 object-cover border border-slate-700/40"
              />
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Run HyperLog on Your Phone (v2.0)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-all sm:break-normal">
                  {APK_FILE_NAME} · Signed Android 8.0–15 + Standalone Offline PWA
                </p>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={handleApkDownload}
                disabled={apkDownloading === 'downloading'}
                className="w-full min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-70 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {apkDownloading === 'done' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Saved Signed .APK to Device</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-4 h-4" />
                    <span>
                      {apkDownloading === 'downloading'
                        ? 'Preparing Universal .APK…'
                        : 'Download Signed Android .APK (v2.0)'}
                    </span>
                  </>
                )}
              </button>

              <PWAInstallButton />

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={onOpenInstallGuide}
                  className="min-h-[40px] px-3 py-2 hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 rounded-xl transition-colors"
                >
                  Phone Install Steps
                </button>
                <button
                  type="button"
                  onClick={handleZipDownload}
                  disabled={zipDownloading === 'downloading'}
                  className="min-h-[40px] px-3 py-2 hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  <FolderArchive className="w-3.5 h-3.5" />
                  <span>{zipDownloading === 'done' ? 'Saved .ZIP' : 'Source .ZIP'}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

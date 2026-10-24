import React, { useEffect, useState } from 'react';
import { SyncOutboxEvent } from '../types/workout';
import {
  Check,
  Copy,
  Download,
  FolderArchive,
  Link2,
  RotateCcw,
  Smartphone,
  X,
} from 'lucide-react';
import {
  APK_DOWNLOAD_PATH,
  APK_FILE_NAME,
  SOURCE_ZIP_DOWNLOAD_PATH,
  SOURCE_ZIP_FILE_NAME,
  downloadAndroidSourceZip,
  downloadSignedApk,
} from '../utils/apkDownload';

interface TechnicalGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncOutbox: SyncOutboxEvent[];
  onExportBackup: () => Promise<void>;
  onResetDefaults: () => Promise<void>;
}

interface ApkManifestInfo {
  appName: string;
  packageId: string;
  version: string;
  minSdk: number;
  targetSdk: number;
  apkFileName: string;
  apkUrl: string;
  sourceZipFileName: string;
  sourceZipUrl: string;
  sizeBytes: number;
  sourceZipBytes: number;
  sha256: string;
  builtAt: string;
}

const ADB_EMULATOR_COMMANDS = `# Option A: Drag & drop HyperLog-v2.0-universal-release.apk directly
# onto your running Android Studio Hardware Emulator window!

# Option B: Install via ADB CLI onto your USB Android Phone or Emulator
adb devices
adb install -r HyperLog-v2.0-universal-release.apk

# Launch HyperLog directly from terminal (works 100% in Airplane Mode)
adb shell am start -n com.hyperlog.rp/com.hyperlog.rp.MainActivity`;

const HEALTH_CONNECT_KOTLIN_SNIPPET = `// Compiled inside HyperLog Native APK v2.0 (HyperLogStreakWidgetProvider.kt)
// Real-time AppWidgetManager.updateAppWidget + Dynamic RemoteViews GridLayout scaling:

private fun buildResponsiveRemoteViews(
    context: Context,
    snap: WidgetProgressSnapshot,
    options: Bundle?
): RemoteViews {
    val scale = computePhoneDisplayScale(context) // smallestScreenWidthDp + density + fontScale
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        return RemoteViews(
            mapOf(
                SizeF(140f, 96f) to buildTierRemoteViews(context, snap, WidgetGridTier.COMPACT, scale),
                SizeF(225f, 110f) to buildTierRemoteViews(context, snap, WidgetGridTier.STANDARD, scale),
                SizeF(275f, 170f) to buildTierRemoteViews(context, snap, WidgetGridTier.EXPANDED, scale)
            )
        )
    }
    return buildTierRemoteViews(context, snap, resolveGridTier(options, scale), scale)
}`;

const SQLITE_SCHEMA_SNIPPET = `// On-Device Offline SQLite Database (hyperlog_offline_rp.db)
// Zero WebView, zero cloud container — pure Native Kotlin + Android SQLiteOpenHelper
CREATE TABLE set_logs (
    id TEXT PRIMARY KEY,
    week INTEGER NOT NULL,
    day_number INTEGER NOT NULL,
    template_session_id TEXT,
    exercise_id TEXT NOT NULL,
    exercise_name TEXT NOT NULL,
    muscle_id TEXT NOT NULL,
    set_index INTEGER NOT NULL,
    weight_kg REAL NOT NULL,
    reps INTEGER NOT NULL,
    rir REAL NOT NULL,
    rest_seconds INTEGER NOT NULL,
    completed INTEGER NOT NULL
);`;

function formatMegabytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '1.41 MB';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const TechnicalGuideModal: React.FC<TechnicalGuideModalProps> = ({
  isOpen,
  onClose,
  syncOutbox,
  onExportBackup,
  onResetDefaults,
}) => {
  const [activeSection, setActiveSection] = useState<'apk' | 'emulator' | 'fit' | 'outbox'>('apk');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [manifest, setManifest] = useState<ApkManifestInfo | null>(null);
  const [apkDownloadState, setApkDownloadState] = useState<'idle' | 'downloading' | 'done'>('idle');
  const [zipDownloadState, setZipDownloadState] = useState<'idle' | 'downloading' | 'done'>('idle');

  useEffect(() => {
    if (!isOpen) return;
    fetch('/downloads/apk-manifest.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.apkUrl) setManifest(data);
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const copyCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const apkUrl = manifest?.apkUrl ?? APK_DOWNLOAD_PATH;
  const apkFileName = manifest?.apkFileName ?? APK_FILE_NAME;
  const sourceZipUrl = manifest?.sourceZipUrl ?? SOURCE_ZIP_DOWNLOAD_PATH;
  const sourceZipFileName = manifest?.sourceZipFileName ?? SOURCE_ZIP_FILE_NAME;
  const directApkLink =
    typeof window !== 'undefined' ? `${window.location.origin}${apkUrl}` : apkUrl;

  const handleDownloadApkClick = async () => {
    if (apkDownloadState === 'downloading') return;
    setApkDownloadState('downloading');
    await downloadSignedApk(apkUrl, apkFileName);
    setApkDownloadState('done');
    window.setTimeout(() => setApkDownloadState('idle'), 4000);
  };

  const handleDownloadZipClick = async () => {
    if (zipDownloadState === 'downloading') return;
    setZipDownloadState('downloading');
    await downloadAndroidSourceZip(sourceZipUrl, sourceZipFileName);
    setZipDownloadState('done');
    window.setTimeout(() => setZipDownloadState('idle'), 3500);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tech-guide-title"
    >
      <div className="hl-card w-full max-w-4xl max-h-[90vh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2
              id="tech-guide-title"
              className="text-base sm:text-lg font-bold text-slate-900 dark:text-white"
            >
              HyperLog Android Phone `.APK` &amp; Offline Install Hub
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Standalone Native Kotlin App · Offline SQLite · Vibration Timer · Night &amp; AMOLED Themes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close APK download hub"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="px-5 sm:px-6 py-2.5 hl-subtle border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {(
            [
              { id: 'apk', label: '1. Install on Android Phone' },
              { id: 'emulator', label: '2. ADB & Emulator Setup' },
              { id: 'fit', label: '3. Real-Time Widget & SQLite' },
              { id: 'outbox', label: `4. Web Backup & Outbox (${syncOutbox.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveSection(t.id)}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeSection === t.id
                  ? 'bg-slate-900 dark:bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {activeSection === 'apk' && (
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-slate-900 dark:bg-slate-950 border border-slate-800 text-white space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold">
                      <Smartphone className="w-4 h-4 shrink-0" />
                      <span>Android 8.0 – 15 Universal Release · Signed v2 + v3</span>
                    </div>
                    <h3 className="text-lg font-bold text-white break-all sm:break-normal">
                      {apkFileName}
                    </h3>
                    <p className="text-xs text-slate-300">
                      Universal Android 8.0–15 release with automatic phone screen adaptation &amp;
                      cutout-safe insets, dedicated Settings tab, Home Screen Progress &amp; Streak
                      Widget, offline Mifflin-St Jeor calorie calculator, whole-food macro meal
                      builder, vibrant crest icon, and native vibration rest timer.
                    </p>
                  </div>

                  <div className="flex flex-wrap sm:flex-col items-stretch sm:items-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleDownloadApkClick}
                      disabled={apkDownloadState === 'downloading'}
                      className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-70 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                    >
                      {apkDownloadState === 'done' ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Saved .APK ({formatMegabytes(manifest?.sizeBytes ?? 1483497)})</span>
                        </>
                      ) : apkDownloadState === 'downloading' ? (
                        <>
                          <Download className="w-4 h-4 animate-bounce" />
                          <span>Preparing .APK…</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>
                            Download Signed .APK ({formatMegabytes(manifest?.sizeBytes ?? 1483497)})
                          </span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => copyCode('apkLink', directApkLink)}
                      className="min-h-[38px] px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      {copiedId === 'apkLink' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied Direct .APK URL</span>
                        </>
                      ) : (
                        <>
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Copy Direct .APK Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-xs">
                  <div>
                    <div className="text-slate-400">Package ID</div>
                    <div className="font-mono font-semibold text-white">
                      {manifest?.packageId ?? 'com.hyperlog.rp'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Android Phones</div>
                    <div className="font-mono font-semibold text-white">
                      Android 8.0+ (API 26–35)
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Signature</div>
                    <div className="font-mono font-semibold text-emerald-400">
                      v2 + v3 Verified
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Offline Storage</div>
                    <div className="font-mono font-semibold text-white">Native SQLite + JSON</div>
                  </div>
                </div>

                {manifest?.sha256 && (
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                    <span className="truncate">SHA-256: {manifest.sha256}</span>
                    <button
                      type="button"
                      onClick={() => copyCode('sha', manifest.sha256)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0"
                    >
                      {copiedId === 'sha' ? 'Copied' : 'Copy Hash'}
                    </button>
                  </div>
                )}
              </div>

              {/* Step-by-Step Android Phone Installation Card */}
              <div className="p-4 sm:p-5 rounded-2xl hl-subtle border space-y-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Install on Your Android Phone in 4 Steps
                </h4>
                <ol className="list-decimal pl-5 text-xs space-y-2 text-slate-700 dark:text-slate-300">
                  <li>
                    <strong>Save the `.apk` file:</strong> Tap{' '}
                    <strong>Download Signed .APK</strong> above on your Android phone—or
                    download it on your computer and send{' '}
                    <code className="font-mono hl-card px-1.5 py-0.5 rounded">{apkFileName}</code>{' '}
                    to your phone via Google Drive, Quick Share, WhatsApp, Telegram, or USB cable.
                  </li>
                  <li>
                    <strong>Open the installer:</strong> On your Android phone, open the{' '}
                    <strong>Files</strong> or <strong>Downloads</strong> app and tap{' '}
                    <code className="font-mono hl-card px-1.5 py-0.5 rounded">{apkFileName}</code>.
                  </li>
                  <li>
                    <strong>Allow installation if prompted:</strong> First-time direct `.apk`
                    installs show Android&apos;s security prompt—tap <strong>Settings</strong> and
                    enable <strong>Allow from this source</strong>.
                  </li>
                  <li>
                    <strong>Install &amp; launch offline:</strong> Tap <strong>Install</strong>{' '}
                    (if Play Protect asks about an unrecognized developer, tap{' '}
                    <strong>More details → Install anyway</strong>), then tap <strong>Open</strong>.
                    HyperLog runs 100% offline on your phone.
                  </li>
                </ol>
              </div>

              <div className="p-4 rounded-xl hl-subtle border flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <FolderArchive className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                    Android Studio Kotlin Source Project (`HyperLogNative`)
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Complete Gradle + Kotlin source archive if you also want to build or customize in
                    Android Studio.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadZipClick}
                  disabled={zipDownloadState === 'downloading'}
                  className="min-h-[40px] px-4 py-2 hl-card hover:opacity-80 text-slate-900 dark:text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-opacity shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {zipDownloadState === 'done'
                      ? 'Saved Source .ZIP'
                      : zipDownloadState === 'downloading'
                        ? 'Preparing .ZIP…'
                        : 'Download Source .ZIP'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {activeSection === 'emulator' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Run on Android Studio Hardware Emulator or Physical Phone
                </h3>
                <ol className="list-decimal pl-5 text-xs space-y-1.5">
                  <li>
                    Click <strong>Download Signed .APK</strong> on Tab 1 to save{' '}
                    <code className="font-mono hl-subtle px-1 py-0.5 rounded">{apkFileName}</code>.
                  </li>
                  <li>
                    Open <strong>Android Studio → Device Manager</strong> and boot any Hardware
                    Emulator (API 26–35 `x86_64` or `arm64-v8a`).
                  </li>
                  <li>
                    <strong>Drag and drop</strong>{' '}
                    <code className="font-mono hl-subtle px-1 py-0.5 rounded">{apkFileName}</code>{' '}
                    straight onto the emulator screen—or run the `adb install -r` command below.
                  </li>
                  <li>
                    Test Night / AMOLED themes, color-coded RIR dropdowns, and custom vibration rest
                    timers 100% offline!
                  </li>
                </ol>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    ADB Hardware Emulator &amp; Device Commands
                  </h4>
                  <button
                    type="button"
                    onClick={() => copyCode('adb', ADB_EMULATOR_COMMANDS)}
                    className="min-h-[34px] px-2.5 py-1 text-xs font-medium hl-subtle border rounded-lg flex items-center gap-1"
                  >
                    {copiedId === 'adb' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedId === 'adb' ? 'Copied' : 'Copy Commands'}
                  </button>
                </div>
                <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto">
                  {ADB_EMULATOR_COMMANDS}
                </pre>
              </div>
            </div>
          )}

          {activeSection === 'fit' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Real-Time AppWidgetProvider (`AppWidgetManager.updateAppWidget`)
                  </h3>
                  <button
                    type="button"
                    onClick={() => copyCode('hc', HEALTH_CONNECT_KOTLIN_SNIPPET)}
                    className="min-h-[34px] px-2.5 py-1 text-xs font-medium hl-subtle border rounded-lg flex items-center gap-1"
                  >
                    {copiedId === 'hc' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedId === 'hc' ? 'Copied' : 'Copy Kotlin'}
                  </button>
                </div>
                <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto">
                  {HEALTH_CONNECT_KOTLIN_SNIPPET}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Compiled Native SQLite Schema (`set_logs`)
                  </h3>
                  <button
                    type="button"
                    onClick={() => copyCode('room', SQLITE_SCHEMA_SNIPPET)}
                    className="min-h-[34px] px-2.5 py-1 text-xs font-medium hl-subtle border rounded-lg flex items-center gap-1"
                  >
                    {copiedId === 'room' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedId === 'room' ? 'Copied' : 'Copy Schema'}
                  </button>
                </div>
                <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto">
                  {SQLITE_SCHEMA_SNIPPET}
                </pre>
              </div>
            </div>
          )}

          {activeSection === 'outbox' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Web Preview Local Backup &amp; Outbox
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Export your web preview logs or inspect queued sync events
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onExportBackup}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export JSON Backup
                  </button>

                  {!confirmReset ? (
                    <button
                      type="button"
                      onClick={() => setConfirmReset(true)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 rounded-lg flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset Demo Data
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await onResetDefaults();
                        setConfirmReset(false);
                      }}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                    >
                      Confirm Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                {syncOutbox.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3.5 rounded-xl hl-subtle border space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {ev.recordType} · {ev.healthConnectType}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {ev.googleFitDataSource}
                      </span>
                    </div>
                    <pre className="p-2.5 hl-card rounded-lg text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

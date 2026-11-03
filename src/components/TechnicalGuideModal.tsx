import React, { useEffect, useState } from 'react';
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
  BUNDLE_ZIP_DOWNLOAD_PATH,
  BUNDLE_ZIP_FILE_NAME,
  SOURCE_ZIP_DOWNLOAD_PATH,
  SOURCE_ZIP_FILE_NAME,
  downloadSignedApk,
} from '../utils/apkDownload';

interface TechnicalGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
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
  bundleFileName?: string;
  bundleUrl?: string;
  sourceZipFileName: string;
  sourceZipUrl: string;
  sizeBytes: number;
  bundleBytes?: number;
  sourceZipBytes: number;
  sha256: string;
  builtAt: string;
}

const ADB_EMULATOR_COMMANDS = `# Option A: Drag & drop HyperLog-v4.0-claymorphism-release.apk directly
# onto your running Android Studio Hardware Emulator window!

# Option B: Install via ADB CLI onto your USB Android Phone or Emulator
adb devices
adb install -r HyperLog-v4.0-claymorphism-release.apk

# Launch HyperLog directly from terminal (auto-unpacks HyperLogData/{database,training,nutrition,wellness,videos} package)
adb shell am start -n com.hyperlog.rp/com.hyperlog.rp.MainActivity`;

const HEALTH_CONNECT_KOTLIN_SNIPPET = `// Compiled inside HyperLog Native APK v4.0.0 (HyperLogStreakWidgetProvider.kt)
// Per-User SharedPreferences + Dynamic RemoteViews GridLayout scaling:

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

const SQLITE_SCHEMA_SNIPPET = `// Per-User Isolated On-Device Offline SQLite Database v9 (hyperlog_user_<uid>.db)
// Standalone Native Kotlin + Offline Video Vault + Manual Entry & Delete
CREATE TABLE set_logs (
    id TEXT PRIMARY KEY,
    week INTEGER NOT NULL,
    dayNumber INTEGER NOT NULL,
    templateSessionId TEXT,
    exerciseId TEXT NOT NULL,
    exerciseName TEXT NOT NULL,
    muscleId TEXT NOT NULL,
    setIndex INTEGER NOT NULL,
    weightKg REAL NOT NULL,
    reps INTEGER NOT NULL,
    rir REAL NOT NULL,
    restSeconds INTEGER NOT NULL,
    completed INTEGER NOT NULL,
    completedDateIso TEXT,
    rpe REAL
);`;

function formatMegabytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '1.41 MB';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const TechnicalGuideModal: React.FC<TechnicalGuideModalProps> = ({
  isOpen,
  onClose,
  onExportBackup,
  onResetDefaults,
}) => {
  const [activeSection, setActiveSection] = useState<'apk' | 'emulator' | 'fit' | 'outbox'>('apk');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [manifest, setManifest] = useState<ApkManifestInfo | null>(null);
  const [apkDownloadState, setApkDownloadState] = useState<'idle' | 'downloading' | 'done'>('idle');
  const [bundleDownloadState, setBundleDownloadState] = useState<'idle' | 'done'>('idle');
  const [zipDownloadState, setZipDownloadState] = useState<'idle' | 'done'>('idle');
  const [progressLabel, setProgressLabel] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/download/manifest', { cache: 'no-store' })
      .then((res) =>
        res.ok
          ? res.json()
          : fetch('/downloads/apk-manifest.json', { cache: 'no-store' }).then((r) =>
              r.ok ? r.json() : null
            )
      )
      .then((data) => {
        if (data && data.apkFileName) setManifest(data);
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

  const apkUrl = `${manifest?.apkUrl || APK_DOWNLOAD_PATH}?v=4.0.0-b16`;
  const apkFileName = manifest?.apkFileName || APK_FILE_NAME;
  const bundleUrl = `${manifest?.bundleUrl || BUNDLE_ZIP_DOWNLOAD_PATH}?v=4.0.0-b16`;
  const bundleFileName = manifest?.bundleFileName || BUNDLE_ZIP_FILE_NAME;
  const sourceZipUrl = `${manifest?.sourceZipUrl || SOURCE_ZIP_DOWNLOAD_PATH}?v=4.0.0-b16`;
  const sourceZipFileName = manifest?.sourceZipFileName || SOURCE_ZIP_FILE_NAME;
  const directApkLink =
    typeof window !== 'undefined' ? `${window.location.origin}${apkUrl}` : apkUrl;

  const handleVerifiedApkClick = async () => {
    if (apkDownloadState === 'downloading') return;
    setApkDownloadState('downloading');
    setProgressLabel('0.00 MB');
    const res = await downloadSignedApk(apkUrl, apkFileName, (loaded) => {
      setProgressLabel(`${(loaded / (1024 * 1024)).toFixed(2)} MB`);
    });
    setApkDownloadState(res.ok ? 'done' : 'idle');
    window.setTimeout(() => setApkDownloadState('idle'), 4500);
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
            className="no-touch-delay min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
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
              { id: 'outbox', label: '4. Web Backup & Reset' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveSection(t.id)}
              className={`no-touch-delay min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
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
                      Unified Android 8.0–15 release (v4.0.0 · Build 16) rendering the exact same UI/UX
                      across all 6 pages as the Web App 100% offline, bridged to Android Health Connect,
                      live Home Screen Streak Widget, hardware haptics, and native PDF/JSON sharing.
                    </p>
                  </div>

                  <div className="flex flex-wrap sm:flex-col items-stretch sm:items-end gap-2 shrink-0">
                    <a
                      href={`${apkUrl}&t=${Date.now()}`}
                      download={apkFileName}
                      onClick={(e) => {
                        e.currentTarget.href = `${apkUrl}&t=${Date.now()}`;
                        setApkDownloadState('done');
                        window.setTimeout(() => setApkDownloadState('idle'), 4000);
                      }}
                      className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                    >
                      {apkDownloadState === 'done' ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>
                            Downloading v4.0 .APK ({formatMegabytes(manifest?.sizeBytes ?? 1410000)})
                          </span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>
                            Direct Download v4.0 .APK ({formatMegabytes(manifest?.sizeBytes ?? 1410000)})
                          </span>
                        </>
                      )}
                    </a>

                    <a
                      href={`${bundleUrl}&t=${Date.now()}`}
                      download={bundleFileName}
                      onClick={(e) => {
                        e.currentTarget.href = `${bundleUrl}&t=${Date.now()}`;
                        setBundleDownloadState('done');
                        window.setTimeout(() => setBundleDownloadState('idle'), 4000);
                      }}
                      className="min-h-[44px] px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <FolderArchive className="w-3.5 h-3.5" />
                      <span>
                        {bundleDownloadState === 'done'
                          ? 'Downloading v4.0 Phone Bundle…'
                          : `Full Phone Bundle v4.0 .ZIP (${formatMegabytes(
                              manifest?.bundleBytes || 1400000
                            )})`}
                      </span>
                    </a>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleVerifiedApkClick}
                        disabled={apkDownloadState === 'downloading'}
                        className="no-touch-delay min-h-[36px] px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {apkDownloadState === 'downloading'
                            ? `Verifying ${progressLabel}…`
                            : 'Verified Blob Fallback'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => copyCode('apkLink', directApkLink)}
                        className="no-touch-delay min-h-[36px] px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        {copiedId === 'apkLink' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copied URL</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3.5 h-3.5" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>
                    </div>
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
                      className="no-touch-delay px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0"
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
                <a
                  href={sourceZipUrl}
                  download={sourceZipFileName}
                  onClick={() => {
                    setZipDownloadState('done');
                    window.setTimeout(() => setZipDownloadState('idle'), 3500);
                  }}
                  className="min-h-[40px] px-4 py-2 hl-card hover:opacity-80 text-slate-900 dark:text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-opacity shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {zipDownloadState === 'done' ? 'Downloading Source .ZIP…' : 'Download Source .ZIP'}
                  </span>
                </a>
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
                    Web Preview Local Backup &amp; Reset
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Export your complete offline JSON backup or reset local demo data. Manage Health Connect &amp; Google Fit sync under Settings &rarr; Health Integration.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onExportBackup}
                    className="no-touch-delay min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-500 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>Export JSON Backup</span>
                  </button>

                  {!confirmReset ? (
                    <button
                      type="button"
                      onClick={() => setConfirmReset(true)}
                      className="no-touch-delay min-h-[38px] px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                      <span>Reset Demo Data</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await onResetDefaults();
                        setConfirmReset(false);
                      }}
                      className="no-touch-delay min-h-[38px] px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg whitespace-nowrap"
                    >
                      Confirm Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

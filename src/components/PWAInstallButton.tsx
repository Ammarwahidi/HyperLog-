import React, { useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showPhoneGuide, setShowPhoneGuide] = useState<boolean>(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`min-h-[40px] ${
          compact ? 'px-3.5 py-2 text-xs' : 'w-full min-h-[42px] px-4 py-2 text-xs'
        } font-bold rounded-xl hl-subtle border text-slate-800 dark:text-slate-100 hover:border-blue-500 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap`}
      >
        <Smartphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <span>Install Web App</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPhoneGuide(true)}
        className={`min-h-[40px] ${
          compact ? 'px-3 py-2 text-xs' : 'w-full min-h-[42px] px-4 py-2 text-xs'
        } font-semibold rounded-xl hl-subtle border text-slate-700 dark:text-slate-200 hover:border-slate-400 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap`}
      >
        <Smartphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <span>{isIOS ? 'Install on iPhone' : 'Add to Phone Home'}</span>
      </button>

      {showPhoneGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-sm rounded-2xl hl-card p-5 shadow-xl space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <h3
                id="pwa-guide-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                {isIOS ? 'Install HyperLog on iPhone / iPad' : 'Install Full-Screen Phone Web App'}
              </h3>
              <button
                type="button"
                onClick={() => setShowPhoneGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                aria-label="Close phone install steps"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="list-decimal pl-5 text-xs space-y-2 text-slate-600 dark:text-slate-300 leading-relaxed">
                <li>
                  Open this link in <strong>Safari</strong> and tap the <strong>Share</strong> icon
                  in the bottom toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong>—HyperLog launches full-screen offline with local
                  IndexedDB storage.
                </li>
              </ol>
            ) : (
              <ol className="list-decimal pl-5 text-xs space-y-2 text-slate-600 dark:text-slate-300 leading-relaxed">
                <li>
                  <strong>Option A (Native Android .APK):</strong> Tap{' '}
                  <strong>Download .APK</strong> to install the native Kotlin app with the Android
                  Home Screen Streak Widget &amp; hardware vibration motor.
                </li>
                <li>
                  <strong>Option B (Instant Standalone PWA):</strong> Open this URL in Chrome on
                  your phone, tap the <strong>⋮ menu</strong>, and choose{' '}
                  <strong>Install app / Add to Home screen</strong>.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowPhoneGuide(false)}
              className="w-full min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <span className="h-2 w-2 rounded-full bg-emerald-400" />
      <span>Offline Mode — Local on-device database active</span>
    </div>
  );
};

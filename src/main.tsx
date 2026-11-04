import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { isRunningInAndroidStandaloneApk } from './utils/nativeAndroidBridge';

if (
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  !isRunningInAndroidStandaloneApk()
) {
  window.addEventListener(
    'load',
    () => {
      window.setTimeout(() => {
        if (import.meta.env.PROD) {
          navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .then((reg) => reg.update().catch(() => {}))
            .catch(() => {});
        } else {
          navigator.serviceWorker
            .getRegistrations()
            .then((registrations) => {
              for (const reg of registrations) {
                reg.update().catch(() => {});
              }
            })
            .catch(() => {});
        }
      }, 2500);
    },
    { once: true }
  );
}

createRoot(document.getElementById('root')!).render(<App />);

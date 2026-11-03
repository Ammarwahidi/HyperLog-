import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { isRunningInAndroidStandaloneApk } from './utils/nativeAndroidBridge';

if (
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  !isRunningInAndroidStandaloneApk()
) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const reg of registrations) {
        reg.update().catch(() => {});
      }
    })
    .catch(() => {});
}

createRoot(document.getElementById('root')!).render(<App />);

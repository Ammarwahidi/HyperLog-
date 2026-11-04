import { AppTheme, WidgetProgressSnapshot } from '../types/workout';

export interface HyperLogNativeBridgeApi {
  isStandaloneApk?: () => boolean;
  getAppVersionJson?: () => string;
  syncTheme?: (themeId: string, statusHex: string, navHex: string, isDark: boolean) => void;
  syncWidgetSnapshot?: (snapshotJson: string, triggerSource: string) => void;
  haptic?: (kind: string) => void;
  setKeepScreenOn?: (keepAwake: boolean) => void;
  openHealthConnectSettings?: () => boolean;
  syncWorkoutToHealthConnect?: (
    title: string,
    durationMinutes: number,
    completedSets: number,
    tonnageKg: number,
    activeCaloriesKcal: number
  ) => string;
  getHealthConnectStatusJson?: () => string;
  requestPinHomeWidget?: () => boolean;
  shareBase64File?: (
    fileName: string,
    mimeType: string,
    base64Data: string,
    title: string
  ) => boolean;
}

declare global {
  interface Window {
    HyperLogNative?: HyperLogNativeBridgeApi;
    __hyperlogSelectNativeTab?: (tabKey: string) => void;
  }
}

export function getNativeAndroidBridge(): HyperLogNativeBridgeApi | null {
  if (typeof window === 'undefined') return null;
  return window.HyperLogNative ?? null;
}

export function isRunningInAndroidStandaloneApk(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.location?.hostname === 'app.hyperlog.local') {
      return true;
    }
    return Boolean(window.HyperLogNative?.isStandaloneApk?.());
  } catch {
    return false;
  }
}

const THEME_SYSTEM_BARS: Record<
  AppTheme,
  { statusHex: string; navHex: string; isDark: boolean }
> = {
  [AppTheme.Claymorphism]: { statusHex: '#FAF9FF', navHex: '#FAF9FF', isDark: false },
  [AppTheme.ClayDark]: { statusHex: '#181B32', navHex: '#121426', isDark: true },
  [AppTheme.Daylight]: { statusHex: '#FFFFFF', navHex: '#FFFFFF', isDark: false },
  [AppTheme.PastelGlass]: { statusHex: '#F3F7FF', navHex: '#EEF4FF', isDark: false },
  [AppTheme.NightSlate]: { statusHex: '#0F172A', navHex: '#0B1120', isDark: true },
  [AppTheme.Amoled]: { statusHex: '#000000', navHex: '#000000', isDark: true },
  [AppTheme.Graphite]: { statusHex: '#181A1F', navHex: '#121316', isDark: true },
};

export function syncAndroidTheme(theme: AppTheme): void {
  const bridge = getNativeAndroidBridge();
  if (!bridge?.syncTheme) return;
  const spec = THEME_SYSTEM_BARS[theme] ?? THEME_SYSTEM_BARS[AppTheme.Claymorphism];
  try {
    bridge.syncTheme(theme, spec.statusHex, spec.navHex, spec.isDark);
  } catch {
    // Ignore native bridge errors
  }
}

let lastSyncedWidgetPayload = '';
let lastSyncedBridgeRef: HyperLogNativeBridgeApi | null = null;

export function syncAndroidHomeWidget(
  snapshot: WidgetProgressSnapshot,
  triggerSource: string
): void {
  const bridge = getNativeAndroidBridge();
  if (!bridge?.syncWidgetSnapshot) return;
  try {
    const serialized = JSON.stringify(snapshot);
    if (bridge === lastSyncedBridgeRef && serialized === lastSyncedWidgetPayload) {
      return;
    }
    lastSyncedBridgeRef = bridge;
    lastSyncedWidgetPayload = serialized;
    bridge.syncWidgetSnapshot(serialized, triggerSource);
  } catch {
    // Ignore native bridge errors
  }
}

export function triggerAndroidHaptic(kind: 'tick' | 'success'): void {
  const bridge = getNativeAndroidBridge();
  if (!bridge?.haptic) return;
  try {
    bridge.haptic(kind);
  } catch {
    // Ignore native bridge errors
  }
}

export function setAndroidKeepScreenOn(keepAwake: boolean): void {
  const bridge = getNativeAndroidBridge();
  if (!bridge?.setKeepScreenOn) return;
  try {
    bridge.setKeepScreenOn(keepAwake);
  } catch {
    // Ignore native bridge errors
  }
}

export function openAndroidHealthConnectSettings(): boolean {
  const bridge = getNativeAndroidBridge();
  if (!bridge?.openHealthConnectSettings) return false;
  try {
    return Boolean(bridge.openHealthConnectSettings());
  } catch {
    return false;
  }
}

export function requestPinAndroidHomeWidget(): boolean {
  const bridge = getNativeAndroidBridge();
  if (!bridge?.requestPinHomeWidget) return false;
  try {
    return Boolean(bridge.requestPinHomeWidget());
  } catch {
    return false;
  }
}

export function syncWorkoutToAndroidHealthConnect(params: {
  title: string;
  durationMinutes: number;
  completedSets: number;
  tonnageKg: number;
  activeCaloriesKcal: number;
}): { ok: boolean; detail: string } | null {
  const bridge = getNativeAndroidBridge();
  if (!bridge?.syncWorkoutToHealthConnect) return null;
  try {
    const raw = bridge.syncWorkoutToHealthConnect(
      params.title,
      Math.max(1, Math.round(params.durationMinutes)),
      Math.max(0, Math.round(params.completedSets)),
      Math.max(0, Math.round(params.tonnageKg)),
      Math.max(0, Math.round(params.activeCaloriesKcal))
    );
    const parsed = JSON.parse(raw) as { ok?: boolean; detail?: string };
    return {
      ok: Boolean(parsed.ok),
      detail: parsed.detail || 'Synced with Android Health Connect.',
    };
  } catch {
    return null;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to encode blob'));
    reader.readAsDataURL(blob);
  });
}

export async function shareOrSaveBlobViaAndroid(params: {
  blob: Blob;
  filename: string;
  mimeType?: string;
  title?: string;
}): Promise<boolean> {
  const bridge = getNativeAndroidBridge();
  if (!bridge?.shareBase64File) return false;
  try {
    const base64 = await blobToBase64(params.blob);
    if (!base64) return false;
    return Boolean(
      bridge.shareBase64File(
        params.filename,
        params.mimeType || params.blob.type || 'application/octet-stream',
        base64,
        params.title || params.filename
      )
    );
  } catch {
    return false;
  }
}

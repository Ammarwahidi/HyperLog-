export const APK_BUILD_VERSION = '4.0.0';
export const APK_BUILD_STAMP = 'v4.0-b18';

export const APK_FILE_NAME = 'HyperLog-v4.0-claymorphism-release.apk';
export const APK_DOWNLOAD_PATH = `/api/download/apk/v4.0/${APK_FILE_NAME}`;
export const APK_STATIC_FALLBACK_PATH = `/downloads/${APK_FILE_NAME}`;

export const BUNDLE_ZIP_FILE_NAME = 'HyperLog-v4.0-Phone-Install-Bundle.zip';
export const BUNDLE_ZIP_DOWNLOAD_PATH = `/api/download/bundle/v4.0/${BUNDLE_ZIP_FILE_NAME}`;
export const BUNDLE_STATIC_FALLBACK_PATH = `/downloads/${BUNDLE_ZIP_FILE_NAME}`;

export const SOURCE_ZIP_FILE_NAME = 'HyperLog-v4.0-AndroidStudio-Source.zip';
export const SOURCE_ZIP_DOWNLOAD_PATH = `/api/download/source-zip/v4.0/${SOURCE_ZIP_FILE_NAME}`;
export const SOURCE_STATIC_FALLBACK_PATH = `/downloads/${SOURCE_ZIP_FILE_NAME}`;


export function getFreshApkHref(): string {
  return `${APK_DOWNLOAD_PATH}?v=${APK_BUILD_STAMP}`;
}

export function getFreshBundleHref(): string {
  return `${BUNDLE_ZIP_DOWNLOAD_PATH}?v=${APK_BUILD_STAMP}`;
}

export interface DownloadVerificationResult {
  ok: boolean;
  bytesDownloaded: number;
  method: 'verified-blob' | 'direct-stream' | 'failed';
  errorMessage?: string;
}

function isValidZipOrApkArchive(buffer: ArrayBuffer, minBytes: number): boolean {
  if (!buffer || buffer.byteLength < minBytes) {
    return false;
  }
  const header = new Uint8Array(buffer, 0, 4);
  return (
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    header[2] === 0x03 &&
    header[3] === 0x04
  );
}

async function refreshServiceWorkersBeforeDownload(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.map((r) =>
          window.location.hostname.includes('ais-dev') ? r.unregister() : r.update()
        )
      );
    }
  } catch {
    // Ignore service worker cleanup errors
  }
}

export async function triggerVerifiedArchiveDownload(
  urlsToTry: string[],
  fileName: string,
  mimeType: string,
  minExpectedBytes: number,
  onProgress?: (loadedBytes: number, totalBytes: number) => void
): Promise<DownloadVerificationResult> {
  await refreshServiceWorkersBeforeDownload();

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isAndroidBrowser = /Android/i.test(ua);

  for (const url of urlsToTry) {
    try {
      const bustUrl = `${url}${url.includes('?') ? '&' : '?'}b=${APK_BUILD_STAMP}&t=${Date.now()}`;
      const response = await fetch(bustUrl, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        continue;
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) {
        continue;
      }

      const totalHeader = Number(response.headers.get('content-length') || '0');
      let buffer: ArrayBuffer;

      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedLength = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedLength += value.byteLength;
            if (onProgress) {
              onProgress(receivedLength, totalHeader || receivedLength);
            }
          }
        }

        const merged = new Uint8Array(receivedLength);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }
        buffer = merged.buffer;
      } else {
        buffer = await response.arrayBuffer();
        if (onProgress) {
          onProgress(buffer.byteLength, buffer.byteLength);
        }
      }

      if (!isValidZipOrApkArchive(buffer, minExpectedBytes)) {
        continue;
      }

      if (isAndroidBrowser && url.startsWith('/api/download/')) {
        const directAnchor = document.createElement('a');
        directAnchor.href = bustUrl;
        directAnchor.download = fileName;
        directAnchor.rel = 'noopener';
        document.body.appendChild(directAnchor);
        directAnchor.click();
        document.body.removeChild(directAnchor);
        return {
          ok: true,
          bytesDownloaded: buffer.byteLength,
          method: 'direct-stream',
        };
      }

      const blob = new Blob([buffer], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);

      return {
        ok: true,
        bytesDownloaded: buffer.byteLength,
        method: 'verified-blob',
      };
    } catch {
      // Try next candidate URL
    }
  }

  return {
    ok: false,
    bytesDownloaded: 0,
    method: 'failed',
    errorMessage:
      'Could not stream the verified archive. Tap Direct Download .APK (v4.0) above to download straight from your browser.',
  };
}

export async function downloadSignedApk(
  primaryUrl: string = APK_DOWNLOAD_PATH,
  fileName: string = APK_FILE_NAME,
  onProgress?: (loadedBytes: number, totalBytes: number) => void
): Promise<DownloadVerificationResult> {
  const urls = Array.from(
    new Set([primaryUrl, APK_DOWNLOAD_PATH, APK_STATIC_FALLBACK_PATH])
  );
  return triggerVerifiedArchiveDownload(
    urls,
    fileName,
    'application/vnd.android.package-archive',
    500_000,
    onProgress
  );
}

export async function downloadFullPhoneBundleZip(
  primaryUrl: string = BUNDLE_ZIP_DOWNLOAD_PATH,
  fileName: string = BUNDLE_ZIP_FILE_NAME,
  onProgress?: (loadedBytes: number, totalBytes: number) => void
): Promise<DownloadVerificationResult> {
  const urls = Array.from(
    new Set([primaryUrl, BUNDLE_ZIP_DOWNLOAD_PATH, BUNDLE_STATIC_FALLBACK_PATH])
  );
  return triggerVerifiedArchiveDownload(
    urls,
    fileName,
    'application/zip',
    500_000,
    onProgress
  );
}

export async function downloadAndroidSourceZip(
  primaryUrl: string = SOURCE_ZIP_DOWNLOAD_PATH,
  fileName: string = SOURCE_ZIP_FILE_NAME,
  onProgress?: (loadedBytes: number, totalBytes: number) => void
): Promise<DownloadVerificationResult> {
  const urls = Array.from(
    new Set([primaryUrl, SOURCE_ZIP_DOWNLOAD_PATH, SOURCE_STATIC_FALLBACK_PATH])
  );
  return triggerVerifiedArchiveDownload(
    urls,
    fileName,
    'application/zip',
    20_000,
    onProgress
  );
}

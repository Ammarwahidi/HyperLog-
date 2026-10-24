export const APK_FILE_NAME = 'HyperLog-v2.0-universal-release.apk';
export const APK_DOWNLOAD_PATH = '/downloads/HyperLog-v2.0-universal-release.apk';
export const SOURCE_ZIP_FILE_NAME = 'HyperLog-AndroidStudio-Source.zip';
export const SOURCE_ZIP_DOWNLOAD_PATH = '/downloads/HyperLog-AndroidStudio-Source.zip';

export async function triggerBinaryDownload(
  url: string,
  fileName: string,
  mimeType: string
): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const blob = new Blob([buffer], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
    return true;
  } catch {
    // Fallback to direct anchor download if fetch fails
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return false;
  }
}

export async function downloadSignedApk(
  url: string = APK_DOWNLOAD_PATH,
  fileName: string = APK_FILE_NAME
): Promise<boolean> {
  return triggerBinaryDownload(url, fileName, 'application/vnd.android.package-archive');
}

export async function downloadAndroidSourceZip(
  url: string = SOURCE_ZIP_DOWNLOAD_PATH,
  fileName: string = SOURCE_ZIP_FILE_NAME
): Promise<boolean> {
  return triggerBinaryDownload(url, fileName, 'application/zip');
}

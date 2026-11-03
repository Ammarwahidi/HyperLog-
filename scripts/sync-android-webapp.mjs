import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const androidAssetsWebDir = path.join(
  rootDir,
  'android-native',
  'app',
  'src',
  'main',
  'assets',
  'webapp'
);

const EXCLUDED_NAMES = new Set([
  'downloads',
  'sw.js',
  'sw.js.map',
  'registerSW.js',
  'pwa-512x512.png',
  'pwa-maskable-512x512.png',
  'apple-touch-icon.png',
]);

function shouldSkipEntry(entryName) {
  if (EXCLUDED_NAMES.has(entryName)) return true;
  if (entryName.startsWith('workbox-')) return true;
  return false;
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (shouldSkipEntry(entry)) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

if (!fs.existsSync(distDir)) {
  console.error(`[sync-android-webapp] dist directory not found at ${distDir}`);
  process.exit(1);
}

fs.rmSync(androidAssetsWebDir, { recursive: true, force: true });
fs.mkdirSync(androidAssetsWebDir, { recursive: true });
copyRecursive(distDir, androidAssetsWebDir);

const manifestPath = path.join(rootDir, 'public', 'downloads', 'apk-manifest.json');
if (fs.existsSync(manifestPath)) {
  fs.copyFileSync(manifestPath, path.join(androidAssetsWebDir, 'apk-manifest.json'));
}

console.log(`[sync-android-webapp] Synced compiled Web UI into ${androidAssetsWebDir}`);

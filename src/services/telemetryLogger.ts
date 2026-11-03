import { getDB } from '../db/localStore';
import {
  TelemetryArchiveSummary,
  TelemetryLogEntry,
  TelemetryLogLevel,
} from '../types/workout';

/**
 * Day-Zero Structured Telemetry & Performance Logger (v4.0)
 *
 * Designed for high-throughput, zero-jank capture of:
 * - Startup & IndexedDB hydration metrics (METRIC)
 * - User workout, navigation & nutrition actions (ACTION)
 * - Storage rotation & Day-Zero clean-slate lifecycles (INFO / WARN)
 * - Unhandled runtime or network errors (ERROR)
 *
 * Uses a bounded ring buffer (max 500 entries) persisted asynchronously to the
 * isolated per-user IndexedDB partition and mirrored non-blockingly to /api/logs.
 */
const MAX_LOCAL_RING_BUFFER = 500;
const DAY_ZERO_EPOCH_META_KEY = 'dayZeroEpochIso';
const TELEMETRY_RING_META_KEY = 'telemetryEventLogs';
const TELEMETRY_ARCHIVES_META_KEY = 'telemetryArchiveSummaries';

let inMemoryRing: TelemetryLogEntry[] = [];
let dayZeroEpochMs: number | null = null;
let hydratedNamespace: string | null = null;
let flushTimerId: number | null = null;
let pendingServerBatch: TelemetryLogEntry[] = [];
const subscribers = new Set<(logs: TelemetryLogEntry[]) => void>();

function notifySubscribers(): void {
  const snapshot = [...inMemoryRing];
  for (const listener of subscribers) {
    try {
      listener(snapshot);
    } catch {
      // Prevent listener error from interrupting telemetry loop
    }
  }
}

export function subscribeTelemetryLogs(
  listener: (logs: TelemetryLogEntry[]) => void
): () => void {
  subscribers.add(listener);
  listener([...inMemoryRing]);
  return () => {
    subscribers.delete(listener);
  };
}

export async function initializeDayZeroTelemetry(namespaceKey: string = 'guest'): Promise<{
  dayZeroEpochIso: string;
  entries: TelemetryLogEntry[];
}> {
  const db = await getDB();
  let storedEpoch = (await db.get('appMeta', DAY_ZERO_EPOCH_META_KEY)) as string | undefined;
  if (!storedEpoch) {
    storedEpoch = new Date().toISOString();
    await db.put('appMeta', storedEpoch, DAY_ZERO_EPOCH_META_KEY);
  }
  const parsedMs = Date.parse(storedEpoch);
  dayZeroEpochMs = Number.isNaN(parsedMs) ? Date.now() : parsedMs;

  const storedLogs = (await db.get('appMeta', TELEMETRY_RING_META_KEY)) as
    | TelemetryLogEntry[]
    | undefined;

  if (Array.isArray(storedLogs) && storedLogs.length > 0) {
    inMemoryRing = storedLogs.slice(0, MAX_LOCAL_RING_BUFFER);
  } else {
    const genesisEntry: TelemetryLogEntry = {
      id: `log_day0_${Date.now()}`,
      timestampIso: storedEpoch,
      dayZeroOffsetMinutes: 0,
      level: 'INFO',
      category: 'startup',
      event: 'DAY_ZERO_CLEAN_SLATE_INITIALIZED',
      metadata: {
        vaultNamespace: namespaceKey,
        legacyTestDataRemoved: true,
        ringBufferCap: MAX_LOCAL_RING_BUFFER,
      },
    };
    inMemoryRing = [genesisEntry];
    await db.put('appMeta', inMemoryRing, TELEMETRY_RING_META_KEY);
    queueServerTelemetryPush(genesisEntry);
  }

  hydratedNamespace = namespaceKey;
  notifySubscribers();
  return {
    dayZeroEpochIso: storedEpoch,
    entries: [...inMemoryRing],
  };
}

function scheduleLocalAndServerFlush(): void {
  if (typeof window === 'undefined') return;
  if (flushTimerId !== null) return;

  flushTimerId = window.setTimeout(async () => {
    flushTimerId = null;
    try {
      const db = await getDB();
      await db.put('appMeta', inMemoryRing.slice(0, MAX_LOCAL_RING_BUFFER), TELEMETRY_RING_META_KEY);
    } catch {
      // Ignore transient IndexedDB lock during tab teardown
    }

    if (pendingServerBatch.length > 0) {
      const batchToSend = pendingServerBatch.splice(0, 50);
      try {
        await fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: batchToSend }),
        });
      } catch {
        // Offline-first safe: local IndexedDB ring buffer remains authoritative
      }
    }
  }, 160);
}

function queueServerTelemetryPush(entry: TelemetryLogEntry): void {
  pendingServerBatch.push(entry);
  if (pendingServerBatch.length > 100) {
    pendingServerBatch = pendingServerBatch.slice(-100);
  }
  scheduleLocalAndServerFlush();
}

export function logTelemetryEvent(params: {
  level: TelemetryLogLevel;
  category: TelemetryLogEntry['category'];
  event: string;
  durationMs?: number;
  metadata?: Record<string, string | number | boolean>;
}): TelemetryLogEntry {
  const now = Date.now();
  const epoch = dayZeroEpochMs ?? now;
  const offsetMinutes = Math.max(0, Math.round((now - epoch) / 60000));

  const entry: TelemetryLogEntry = {
    id: `log_${now}_${Math.random().toString(36).slice(2, 7)}`,
    timestampIso: new Date(now).toISOString(),
    dayZeroOffsetMinutes: offsetMinutes,
    level: params.level,
    category: params.category,
    event: params.event,
    ...(params.durationMs !== undefined
      ? { durationMs: Number(Math.max(0, params.durationMs).toFixed(2)) }
      : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
  };

  inMemoryRing = [entry, ...inMemoryRing].slice(0, MAX_LOCAL_RING_BUFFER);
  notifySubscribers();
  queueServerTelemetryPush(entry);
  return entry;
}

export async function measureAsyncMetric<T>(
  category: TelemetryLogEntry['category'],
  event: string,
  operation: () => Promise<T>,
  metadata?: Record<string, string | number | boolean>
): Promise<T> {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const result = await operation();
    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    logTelemetryEvent({
      level: 'METRIC',
      category,
      event,
      durationMs: end - start,
      metadata,
    });
    return result;
  } catch (err) {
    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    logTelemetryEvent({
      level: 'ERROR',
      category: 'error',
      event: `${event}_FAILED`,
      durationMs: end - start,
      metadata: {
        ...metadata,
        message: err instanceof Error ? err.message.slice(0, 110) : 'Unknown error',
      },
    });
    throw err;
  }
}

export function getLiveTelemetryLogs(): TelemetryLogEntry[] {
  return [...inMemoryRing];
}

export function getDayZeroEpochIso(): string {
  return new Date(dayZeroEpochMs ?? Date.now()).toISOString();
}

export async function getTelemetryArchiveSummaries(): Promise<TelemetryArchiveSummary[]> {
  try {
    const db = await getDB();
    const localArchives =
      ((await db.get('appMeta', TELEMETRY_ARCHIVES_META_KEY)) as
        | TelemetryArchiveSummary[]
        | undefined) ?? [];
    return localArchives;
  } catch {
    return [];
  }
}

export async function archiveTelemetryLogs(options?: {
  downloadJsonFile?: boolean;
}): Promise<{
  summary: TelemetryArchiveSummary;
  remainingEntries: TelemetryLogEntry[];
}> {
  const snapshot = [...inMemoryRing];
  const createdAt = new Date().toISOString();
  const safeStamp = createdAt.replace(/[:.]/g, '-');
  const fileName = `hyperlog-dayzero-logs-${safeStamp}.json`;

  const archivePayload = {
    schema: 'HyperLog-DayZero-Telemetry-Archive-v4.0',
    namespace: hydratedNamespace ?? 'guest',
    dayZeroEpochIso: getDayZeroEpochIso(),
    archivedAt: createdAt,
    entriesCount: snapshot.length,
    entries: snapshot,
  };

  const jsonString = JSON.stringify(archivePayload, null, 2);
  const sizeBytes = new Blob([jsonString]).size;

  const summary: TelemetryArchiveSummary = {
    archiveId: `arch_${Date.now()}`,
    fileName,
    createdAt,
    entriesCount: snapshot.length,
    sizeBytes,
  };

  if (options?.downloadJsonFile !== false && typeof document !== 'undefined') {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
  }

  try {
    await fetch('/api/logs/archive', { method: 'POST' });
  } catch {
    // Offline fallback remains clean
  }

  const rotationEntry: TelemetryLogEntry = {
    id: `log_arch_${Date.now()}`,
    timestampIso: createdAt,
    dayZeroOffsetMinutes: Math.max(
      0,
      Math.round((Date.now() - (dayZeroEpochMs ?? Date.now())) / 60000)
    ),
    level: 'INFO',
    category: 'storage',
    event: 'TELEMETRY_ARCHIVE_ROTATED',
    metadata: {
      archivedCount: snapshot.length,
      fileName,
    },
  };

  inMemoryRing = [rotationEntry];
  pendingServerBatch = [];

  try {
    const db = await getDB();
    const existingArchives =
      ((await db.get('appMeta', TELEMETRY_ARCHIVES_META_KEY)) as
        | TelemetryArchiveSummary[]
        | undefined) ?? [];
    await db.put(
      'appMeta',
      [summary, ...existingArchives].slice(0, 25),
      TELEMETRY_ARCHIVES_META_KEY
    );
    await db.put('appMeta', inMemoryRing, TELEMETRY_RING_META_KEY);
  } catch {
    // Ignore storage write error
  }

  notifySubscribers();
  return { summary, remainingEntries: [...inMemoryRing] };
}

export async function purgeTelemetryLogs(options?: {
  resetDayZeroEpoch?: boolean;
  includeArchives?: boolean;
}): Promise<TelemetryLogEntry[]> {
  const nowIso = new Date().toISOString();
  if (options?.resetDayZeroEpoch) {
    dayZeroEpochMs = Date.now();
  }
  pendingServerBatch = [];

  const freshGenesis: TelemetryLogEntry = {
    id: `log_purge_${Date.now()}`,
    timestampIso: nowIso,
    dayZeroOffsetMinutes: 0,
    level: 'INFO',
    category: 'storage',
    event: options?.resetDayZeroEpoch
      ? 'DAY_ZERO_RESET_COMPLETED'
      : 'TELEMETRY_RING_BUFFER_PURGED',
    metadata: {
      cleanSlate: true,
      ringBufferCap: MAX_LOCAL_RING_BUFFER,
    },
  };

  inMemoryRing = [freshGenesis];

  try {
    const db = await getDB();
    if (options?.resetDayZeroEpoch) {
      await db.put('appMeta', nowIso, DAY_ZERO_EPOCH_META_KEY);
    }
    if (options?.includeArchives) {
      await db.put('appMeta', [], TELEMETRY_ARCHIVES_META_KEY);
    }
    await db.put('appMeta', inMemoryRing, TELEMETRY_RING_META_KEY);
  } catch {
    // Ignore IndexedDB lock error
  }

  try {
    await fetch(
      `/api/logs/purge?includeArchives=${options?.includeArchives ? 'true' : 'false'}`,
      { method: 'DELETE' }
    );
    queueServerTelemetryPush(freshGenesis);
  } catch {
    // Offline-safe
  }

  notifySubscribers();
  return [...inMemoryRing];
}

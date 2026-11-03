import { MuscleId, SetLogEntry } from '../types/workout';

export const LB_PER_KG = 2.2046226218;

/**
 * Coerces a raw numeric input into a finite non-negative weight in kg,
 * stored at 4 decimal places internally so lb <-> kg round-trips never drift
 * while kg micro-plates (e.g. 1.25, 2.5, 22.75) remain exact.
 */
export function sanitizeWeightKg(raw: unknown, fallback = 0): number {
  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
      ? Number(raw.trim().replace(',', '.'))
      : NaN;
  const base = Number.isFinite(parsed) ? parsed : Number.isFinite(fallback) ? fallback : 0;
  const clamped = Math.min(1500, Math.max(0, base));
  return Math.round(clamped * 10000) / 10000;
}

/**
 * Formats an internal weightKg value into a clean display number for the active unit ('kg' | 'lb')
 * without floating-point artifacts (e.g. 20.000000000000004 -> 20, 61.235 kg -> 135 lb, 22.25 kg -> 22.25).
 */
export function formatWeightForDisplay(weightKg: unknown, unit: 'kg' | 'lb'): number {
  const cleanKg = sanitizeWeightKg(weightKg, 0);
  if (unit === 'kg') {
    const rounded2 = Math.round(cleanKg * 100) / 100;
    const nearestTenth = Math.round(cleanKg * 10) / 10;
    const nearestQuarter = Math.round(cleanKg * 4) / 4;
    if (Math.abs(cleanKg - nearestQuarter) < 0.006) {
      return Number(nearestQuarter.toFixed(2));
    }
    if (Math.abs(cleanKg - nearestTenth) < 0.006) {
      return Number(nearestTenth.toFixed(1));
    }
    return Number(rounded2.toFixed(2));
  }

  const rawLb = cleanKg * LB_PER_KG;
  const nearestQuarterLb = Math.round(rawLb * 4) / 4;
  if (Math.abs(rawLb - nearestQuarterLb) < 0.035) {
    return Number(nearestQuarterLb.toFixed(2));
  }
  const nearestTenthLb = Math.round(rawLb * 10) / 10;
  if (Math.abs(rawLb - nearestTenthLb) < 0.02) {
    return Number(nearestTenthLb.toFixed(1));
  }
  return Number((Math.round(rawLb * 100) / 100).toFixed(2));
}

/**
 * Converts a user-entered weight in the active display unit ('kg' | 'lb')
 * into canonical internal weightKg without precision loss.
 */
export function parseDisplayWeightToKg(inputVal: unknown, unit: 'kg' | 'lb'): number {
  const parsed =
    typeof inputVal === 'number'
      ? inputVal
      : typeof inputVal === 'string' && inputVal.trim() !== ''
      ? Number(inputVal.trim().replace(',', '.'))
      : 0;
  const safeVal = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  if (unit === 'kg') {
    return sanitizeWeightKg(Math.round(safeVal * 100) / 100, 0);
  }
  return sanitizeWeightKg(safeVal / LB_PER_KG, 0);
}

/**
 * Formats a number into a crisp string for text inputs (no NaN, Infinity, or trailing float noise).
 */
export function formatCleanNumberString(val: number | '' | undefined | null, maxDecimals = 2): string {
  if (val === '' || val === undefined || val === null) return '';
  if (typeof val !== 'number' || !Number.isFinite(val)) return '';
  const factor = Math.pow(10, Math.max(0, maxDecimals));
  const rounded = Math.round(val * factor) / factor;
  if (Object.is(rounded, -0)) return '0';
  return String(Number(rounded.toFixed(Math.max(0, maxDecimals))));
}

export function sanitizeReps(raw: unknown, fallback = 10): number {
  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
      ? Number(raw.trim())
      : NaN;
  const base = Number.isFinite(parsed) ? parsed : Number.isFinite(fallback) ? fallback : 10;
  return Math.min(999, Math.max(1, Math.round(base)));
}

export function sanitizeRir(raw: unknown, fallback = 2): number {
  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
      ? Number(raw.trim().replace(',', '.'))
      : NaN;
  const base = Number.isFinite(parsed) ? parsed : Number.isFinite(fallback) ? fallback : 2;
  const clamped = Math.min(5, Math.max(0, base));
  return Math.round(clamped * 2) / 2;
}

export function sanitizeOptionalRpe(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
      ? Number(raw.trim().replace(',', '.'))
      : NaN;
  if (!Number.isFinite(parsed)) return undefined;
  const clamped = Math.min(10, Math.max(1, parsed));
  return Math.round(clamped * 10) / 10;
}

/**
 * Ensures every field of a SetLogEntry has strict runtime numeric types and clean precision.
 */
export function sanitizeSetLogEntry(entry: SetLogEntry): SetLogEntry {
  const cleanWeek = Number.isFinite(Number(entry.week))
    ? Math.max(0, Math.round(Number(entry.week)))
    : 3;
  const cleanDay = Number.isFinite(Number(entry.dayNumber))
    ? Math.max(0, Math.round(Number(entry.dayNumber)))
    : 0;
  const cleanSetIndex = Number.isFinite(Number(entry.setIndex))
    ? Math.max(1, Math.round(Number(entry.setIndex)))
    : 1;
  const cleanWeightKg = sanitizeWeightKg(entry.weightKg, 0);
  const cleanReps = sanitizeReps(entry.reps, 10);
  const cleanRir = sanitizeRir(entry.rir, 2);
  const cleanRpe = sanitizeOptionalRpe(entry.rpe);
  const cleanRest =
    entry.restSeconds !== undefined &&
    entry.restSeconds !== null &&
    Number.isFinite(Number(entry.restSeconds))
      ? Math.min(600, Math.max(5, Math.round(Number(entry.restSeconds))))
      : undefined;
  const completed = Boolean(entry.completed);

  const normalized: SetLogEntry = {
    ...entry,
    id: String(entry.id || `set_${Date.now()}_${cleanSetIndex}`),
    week: cleanWeek,
    dayNumber: cleanDay,
    exerciseId: String(entry.exerciseId || 'unknown_ex'),
    exerciseName: String(entry.exerciseName || 'Exercise').trim() || 'Exercise',
    muscleId: (entry.muscleId || MuscleId.Chest) as MuscleId,
    setIndex: cleanSetIndex,
    weightKg: cleanWeightKg,
    reps: cleanReps,
    rir: cleanRir,
    completed,
    completedAt: completed ? entry.completedAt : undefined,
    completedDate: completed ? entry.completedDate : undefined,
  };

  if (cleanRpe !== undefined) {
    normalized.rpe = cleanRpe;
  } else {
    delete normalized.rpe;
  }

  if (cleanRest !== undefined) {
    normalized.restSeconds = cleanRest;
  }

  return normalized;
}

/**
 * Deterministic comparator for SetLogEntry arrays so order never jitters across edits or DB reloads.
 */
export function compareSetLogsDeterministic(a: SetLogEntry, b: SetLogEntry): number {
  if (a.week !== b.week) return a.week - b.week;
  if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
  const aTpl = a.templateSessionId ?? '';
  const bTpl = b.templateSessionId ?? '';
  if (aTpl !== bTpl) return aTpl < bTpl ? -1 : 1;
  if (a.exerciseId !== b.exerciseId) return a.exerciseId < b.exerciseId ? -1 : 1;
  if (a.setIndex !== b.setIndex) return a.setIndex - b.setIndex;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Computes a deterministic parity checksum across all SetLogEntry rows so the background
 * storage synchronization monitor can detect any drift between offline storage and UI state.
 */
export function computeSetLogsParityChecksum(logs: SetLogEntry[]): string {
  if (logs.length === 0) return '0:0';
  const sorted = [...logs].map(sanitizeSetLogEntry).sort(compareSetLogsDeterministic);
  let hash = 2166136261;
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const token = `${s.id}|${s.week}|${s.dayNumber}|${s.templateSessionId ?? ''}|${s.setIndex}|${s.weightKg}|${s.reps}|${s.rir}|${s.rpe ?? ''}|${s.completed ? 1 : 0}|${s.completedDate ?? ''}`;
    for (let c = 0; c < token.length; c++) {
      hash ^= token.charCodeAt(c);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${sorted.length}:${(hash >>> 0).toString(16)}`;
}

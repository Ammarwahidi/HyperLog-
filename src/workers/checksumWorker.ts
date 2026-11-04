import { compareSetLogsDeterministic, sanitizeSetLogEntry } from '../utils/setLogNumeric';
import type { SetLogEntry } from '../types/workout';

export type WorkerRequest =
  | { id: string; type: 'COMPUTE_CHECKSUM'; logs: SetLogEntry[] }
  | { id: string; type: 'SERIALIZE_JSON'; data: unknown };

export type WorkerResponse =
  | { id: string; success: true; checksum: string }
  | { id: string; success: true; json: string }
  | { id: string; success: false; error: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.type === 'COMPUTE_CHECKSUM') {
      const logs = req.logs;
      if (!logs || logs.length === 0) {
        self.postMessage({ id: req.id, success: true, checksum: '0:0' });
        return;
      }
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
      const checksum = `${sorted.length}:${(hash >>> 0).toString(16)}`;
      self.postMessage({ id: req.id, success: true, checksum });
    } else if (req.type === 'SERIALIZE_JSON') {
      const json = JSON.stringify(req.data, null, 2);
      self.postMessage({ id: req.id, success: true, json });
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    self.postMessage({ id: req.id, success: false, error });
  }
};

import type { SetLogEntry } from '../types/workout';
import { computeSetLogsParityChecksum } from './setLogNumeric';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

let workerInstance: Worker | null = null;
let isWorkerAvailable = typeof Worker !== 'undefined';
const pendingRequests = new Map<string, PendingRequest>();

function getWorker(): Worker | null {
  if (!isWorkerAvailable) return null;
  if (!workerInstance) {
    try {
      workerInstance = new Worker(
        new URL('../workers/checksumWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerInstance.onmessage = (event: MessageEvent) => {
        const { id, success, checksum, json, error } = event.data;
        const pending = pendingRequests.get(id);
        if (!pending) return;
        pendingRequests.delete(id);
        if (success) {
          pending.resolve(checksum ?? json);
        } else {
          pending.reject(new Error(error || 'Worker operation failed'));
        }
      };
      workerInstance.onerror = () => {
        isWorkerAvailable = false;
        workerInstance?.terminate();
        workerInstance = null;
      };
    } catch {
      isWorkerAvailable = false;
      workerInstance = null;
    }
  }
  return workerInstance;
}

export async function computeSetLogsParityChecksumAsync(logs: SetLogEntry[]): Promise<string> {
  const worker = getWorker();
  if (!worker) {
    return computeSetLogsParityChecksum(logs);
  }
  const id = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise<string>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, type: 'COMPUTE_CHECKSUM', logs });
    // Safety fallback timeout after 3s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        resolve(computeSetLogsParityChecksum(logs));
      }
    }, 3000);
  });
}

export async function serializeBackupJsonAsync(data: unknown): Promise<string> {
  const worker = getWorker();
  if (!worker) {
    return JSON.stringify(data, null, 2);
  }
  const id = `ser_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise<string>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, type: 'SERIALIZE_JSON', data });
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        resolve(JSON.stringify(data, null, 2));
      }
    }, 3000);
  });
}

import { jsPDF } from 'jspdf';
import {
  ActiveStandaloneSession,
  DailyNutritionRecord,
  HistoricalExerciseSnapshot,
  MuscleId,
  MuscleLandmark,
  SetLogEntry,
  WorkoutDayPlan,
  WorkoutHistoryRecord,
} from '../types/workout';

export function formatLocalDateISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function resolveSetLogDateISO(log: SetLogEntry): string | null {
  if (log.completedDate && /^\d{4}-\d{2}-\d{2}$/.test(log.completedDate)) {
    return log.completedDate;
  }
  if (!log.completedAt) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(log.completedAt)) {
    return log.completedAt;
  }
  // Seed timestamps carry canonical YYYY-MM-DD prefix before T17:15 / T17:30
  if (
    log.completedAt.endsWith('T17:30:00.000Z') ||
    log.completedAt.endsWith('T17:15:00.000Z')
  ) {
    return log.completedAt.slice(0, 10);
  }
  const parsed = new Date(log.completedAt);
  if (!Number.isNaN(parsed.getTime())) {
    return formatLocalDateISO(parsed);
  }
  return log.completedAt.slice(0, 10);
}

export function formatHumanDateLong(dateIso: string): string {
  const parsed = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatHumanDateShort(dateIso: string): string {
  const parsed = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function convertDisplayWeight(kg: number, unit: 'kg' | 'lb'): number {
  const raw = unit === 'kg' ? kg : kg * 2.20462;
  return Number(raw.toFixed(1));
}

export function getDeterministicSessionId(dateIso: string, log: SetLogEntry): string {
  if (log.templateSessionId) {
    return `hist_${dateIso}_tpl_${log.templateSessionId}`;
  }
  return `hist_${dateIso}_w${log.week}_d${log.dayNumber}`;
}

export function resolveSessionTitleForLogs(params: {
  logs: SetLogEntry[];
  plan: WorkoutDayPlan[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  activeStandaloneSession?: ActiveStandaloneSession | null;
}): { title: string; focusSummary: string } {
  const { logs, plan, landmarks, activeStandaloneSession } = params;
  const sample = logs[0];
  if (!sample) {
    return { title: 'Logged Workout', focusSummary: '' };
  }

  const explicitTitle = logs.find((l) => l.sessionTitle)?.sessionTitle;

  const uniqueMuscles = Array.from(new Set(logs.map((l) => l.muscleId)));
  const muscleSummary = uniqueMuscles
    .map((m) => landmarks[m]?.shortName ?? m)
    .slice(0, 4)
    .join(' · ');

  if (explicitTitle) {
    return { title: explicitTitle, focusSummary: muscleSummary };
  }

  if (sample.templateSessionId) {
    if (
      activeStandaloneSession &&
      activeStandaloneSession.sessionId === sample.templateSessionId
    ) {
      return {
        title: `Template · ${activeStandaloneSession.templateName}`,
        focusSummary: muscleSummary,
      };
    }
    return {
      title: sample.week > 0 ? `Week ${sample.week} · Template Session` : 'Template Session',
      focusSummary: muscleSummary,
    };
  }

  if (sample.week > 0 && sample.dayNumber > 0) {
    const planDay = plan.find((d) => d.dayNumber === sample.dayNumber);
    if (planDay) {
      return {
        title: `Week ${sample.week} · ${planDay.title}`,
        focusSummary: planDay.focusSummary || muscleSummary,
      };
    }
    return {
      title: `Week ${sample.week} · Day ${sample.dayNumber}`,
      focusSummary: muscleSummary,
    };
  }

  if (sample.week < 0) {
    const archiveWeek = 8 + sample.week; // -7.. -1 => Wk 1..7 of prior training block
    return {
      title: `Prior Block Wk ${Math.max(1, archiveWeek)} · ${muscleSummary || 'Hypertrophy'}`,
      focusSummary: muscleSummary,
    };
  }

  return {
    title: muscleSummary ? `Workout · ${muscleSummary}` : 'Logged Workout',
    focusSummary: muscleSummary,
  };
}

export function buildHistoryRecordFromSessionLogs(params: {
  sessionId: string;
  dateIso: string;
  logs: SetLogEntry[];
  plan: WorkoutDayPlan[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  activeStandaloneSession?: ActiveStandaloneSession | null;
  existingRecord?: WorkoutHistoryRecord;
}): WorkoutHistoryRecord {
  const {
    sessionId,
    dateIso,
    logs,
    plan,
    landmarks,
    activeStandaloneSession,
    existingRecord,
  } = params;

  const orderedLogs = [...logs].sort((a, b) => {
    if (a.exerciseId === b.exerciseId) return a.setIndex - b.setIndex;
    return a.id.localeCompare(b.id);
  });

  const exerciseMap = new Map<string, HistoricalExerciseSnapshot>();
  const exerciseOrder: string[] = [];

  let totalSets = 0;
  let totalReps = 0;
  let totalTonnageKg = 0;
  let latestCompletedAt = `${dateIso}T17:30:00.000Z`;
  const musclesSeen = new Set<MuscleId>();

  for (const log of orderedLogs) {
    if (!log.completed) continue;
    totalSets += 1;
    totalReps += log.reps || 0;
    totalTonnageKg += (log.weightKg || 0) * (log.reps || 0);
    musclesSeen.add(log.muscleId);
    if (log.completedAt && log.completedAt > latestCompletedAt) {
      latestCompletedAt = log.completedAt;
    }

    const exKey = `${log.exerciseId}::${log.exerciseName}`;
    let group = exerciseMap.get(exKey);
    if (!group) {
      group = {
        exerciseId: log.exerciseId,
        exerciseName: log.exerciseName,
        muscleId: log.muscleId,
        sets: [],
      };
      exerciseMap.set(exKey, group);
      exerciseOrder.push(exKey);
    }
    group.sets.push({
      id: log.id,
      setIndex: log.setIndex,
      weightKg: log.weightKg,
      reps: log.reps,
      rir: log.rir,
      rpe: log.rpe,
    });
  }

  const exercises = exerciseOrder.map((key) => {
    const snap = exerciseMap.get(key)!;
    snap.sets.sort((a, b) => a.setIndex - b.setIndex);
    return snap;
  });

  const resolvedMeta = resolveSessionTitleForLogs({
    logs: orderedLogs,
    plan,
    landmarks,
    activeStandaloneSession,
  });

  const sample = orderedLogs[0];

  return {
    id: sessionId,
    date: dateIso,
    title: existingRecord?.isManualEntry ? existingRecord.title : resolvedMeta.title,
    focusSummary: existingRecord?.focusSummary || resolvedMeta.focusSummary,
    week: sample?.week,
    dayNumber: sample?.dayNumber,
    templateSessionId: sample?.templateSessionId,
    completedAt: latestCompletedAt,
    durationMinutes: existingRecord?.durationMinutes,
    notes: existingRecord?.notes,
    isManualEntry: existingRecord?.isManualEntry,
    exercises,
    totalSets,
    totalReps,
    totalTonnageKg: Math.round(totalTonnageKg * 10) / 10,
    estimatedCaloriesKcal: Math.round(totalSets * 16.5),
    musclesTrained: Array.from(musclesSeen),
  };
}

export interface DerivedWorkoutHistory {
  byDate: Record<string, WorkoutHistoryRecord[]>;
  allRecords: WorkoutHistoryRecord[];
  lifetimeStats: {
    totalWorkoutDays: number;
    totalSessions: number;
    totalSets: number;
    totalReps: number;
    totalTonnageKg: number;
    totalCaloriesKcal: number;
  };
}

export function deriveFullWorkoutHistory(params: {
  setLogs: SetLogEntry[];
  persistedHistory: WorkoutHistoryRecord[];
  plan: WorkoutDayPlan[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  activeStandaloneSession?: ActiveStandaloneSession | null;
}): DerivedWorkoutHistory {
  const { setLogs, persistedHistory, plan, landmarks, activeStandaloneSession } = params;

  const persistedMap = new Map<string, WorkoutHistoryRecord>();
  for (const rec of persistedHistory) {
    if (rec && rec.id && rec.date) {
      persistedMap.set(rec.id, rec);
    }
  }

  // Group live completed sets by deterministic (date + session) key
  const groupedLiveLogs = new Map<string, { dateIso: string; logs: SetLogEntry[] }>();
  for (const log of setLogs) {
    if (!log.completed) continue;
    const dateIso = resolveSetLogDateISO(log);
    if (!dateIso) continue;
    const sessionId = getDeterministicSessionId(dateIso, log);
    const existingBucket = groupedLiveLogs.get(sessionId);
    if (existingBucket) {
      existingBucket.logs.push(log);
    } else {
      groupedLiveLogs.set(sessionId, { dateIso, logs: [log] });
    }
  }

  const mergedRecordsMap = new Map<string, WorkoutHistoryRecord>();

  // 1. Add all live-derived sessions (enriched with persisted notes/duration if present)
  for (const [sessionId, { dateIso, logs }] of groupedLiveLogs.entries()) {
    const existingRecord = persistedMap.get(sessionId);
    const built = buildHistoryRecordFromSessionLogs({
      sessionId,
      dateIso,
      logs,
      plan,
      landmarks,
      activeStandaloneSession,
      existingRecord,
    });
    if (built.totalSets > 0) {
      mergedRecordsMap.set(sessionId, built);
    }
  }

  // 2. Retain any archived or manual WorkoutHistoryRecords whose setLogs were later cleared/cycled
  for (const [id, rec] of persistedMap.entries()) {
    if (!mergedRecordsMap.has(id) && rec.totalSets > 0) {
      mergedRecordsMap.set(id, rec);
    }
  }

  const allRecords = Array.from(mergedRecordsMap.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.completedAt < b.completedAt ? 1 : -1;
  });

  const byDate: Record<string, WorkoutHistoryRecord[]> = {};
  let totalSets = 0;
  let totalReps = 0;
  let totalTonnageKg = 0;
  let totalCaloriesKcal = 0;

  for (const rec of allRecords) {
    if (!byDate[rec.date]) {
      byDate[rec.date] = [];
    }
    byDate[rec.date].push(rec);
    totalSets += rec.totalSets;
    totalReps += rec.totalReps;
    totalTonnageKg += rec.totalTonnageKg;
    totalCaloriesKcal += rec.estimatedCaloriesKcal;
  }

  return {
    byDate,
    allRecords,
    lifetimeStats: {
      totalWorkoutDays: Object.keys(byDate).length,
      totalSessions: allRecords.length,
      totalSets,
      totalReps,
      totalTonnageKg: Math.round(totalTonnageKg),
      totalCaloriesKcal,
    },
  };
}

export function formatDateWorkoutsShareText(params: {
  dateIso: string;
  sessions: WorkoutHistoryRecord[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  weightUnit: 'kg' | 'lb';
  nutritionRecord?: DailyNutritionRecord;
}): string {
  const { dateIso, sessions, landmarks, weightUnit, nutritionRecord } = params;
  const dateLabel = formatHumanDateLong(dateIso);

  if (sessions.length === 0) {
    return `HyperLog — ${dateLabel}\nRest / Recovery Day`;
  }

  const daySets = sessions.reduce((acc, s) => acc + s.totalSets, 0);
  const dayReps = sessions.reduce((acc, s) => acc + s.totalReps, 0);
  const dayTonnageKg = sessions.reduce((acc, s) => acc + s.totalTonnageKg, 0);
  const displayVolume =
    weightUnit === 'kg'
      ? `${Math.round(dayTonnageKg).toLocaleString()} kg`
      : `${Math.round(dayTonnageKg * 2.20462).toLocaleString()} lb`;

  const lines: string[] = [
    `HyperLog Workout Log — ${dateLabel}`,
    `${daySets} sets · ${dayReps} reps · ${displayVolume} volume`,
    '',
  ];

  sessions.forEach((session, sIdx) => {
    if (sIdx > 0) lines.push('');
    const durationPart = session.durationMinutes ? ` (${session.durationMinutes} min)` : '';
    lines.push(`${session.title}${durationPart}`);
    if (session.musclesTrained.length > 0) {
      const musclesStr = session.musclesTrained
        .map((m) => landmarks[m]?.shortName ?? m)
        .join(' · ');
      lines.push(`Muscles: ${musclesStr}`);
    }

    session.exercises.forEach((ex, exIdx) => {
      lines.push(`${exIdx + 1}. ${ex.exerciseName}`);
      ex.sets.forEach((st) => {
        const w = convertDisplayWeight(st.weightKg, weightUnit);
        const rpeSuffix = typeof st.rpe === 'number' ? ` · RPE ${st.rpe}` : '';
        lines.push(`   Set ${st.setIndex}: ${w} ${weightUnit} × ${st.reps} (${st.rir} RIR${rpeSuffix})`);
      });
    });

    if (session.notes && session.notes.trim()) {
      lines.push(`Notes: ${session.notes.trim()}`);
    }
  });

  if (nutritionRecord && nutritionRecord.meals.length > 0) {
    const kcal = nutritionRecord.meals.reduce((s, m) => s + m.calories, 0);
    const prot = Math.round(nutritionRecord.meals.reduce((s, m) => s + m.proteinG, 0));
    lines.push('');
    lines.push(`Nutrition: ${kcal.toLocaleString()} kcal · ${prot}g protein`);
  }

  return lines.join('\n');
}

export function exportWorkoutRecordsToCSV(
  records: WorkoutHistoryRecord[],
  landmarks: Record<MuscleId, MuscleLandmark>,
  weightUnit: 'kg' | 'lb'
): string {
  const escapeCsv = (val: string | number | undefined): string => {
    if (val === undefined || val === null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'Date',
    'Session Title',
    'Duration (min)',
    'Exercise',
    'Muscle Group',
    'Set',
    `Weight (${weightUnit})`,
    'Reps',
    'RIR',
    'RPE',
    `Set Volume (${weightUnit})`,
    'Notes',
  ];

  const rows: string[] = [headers.join(',')];
  const chronological = [...records].sort((a, b) => (a.date > b.date ? 1 : -1));

  for (const session of chronological) {
    for (const ex of session.exercises) {
      const muscleLabel = landmarks[ex.muscleId]?.name ?? ex.muscleId;
      for (const st of ex.sets) {
        const w = convertDisplayWeight(st.weightKg, weightUnit);
        const setVol = Number((w * st.reps).toFixed(1));
        rows.push(
          [
            escapeCsv(session.date),
            escapeCsv(session.title),
            escapeCsv(session.durationMinutes),
            escapeCsv(ex.exerciseName),
            escapeCsv(muscleLabel),
            escapeCsv(st.setIndex),
            escapeCsv(w),
            escapeCsv(st.reps),
            escapeCsv(st.rir),
            escapeCsv(st.rpe),
            escapeCsv(setVol),
            escapeCsv(session.notes),
          ].join(',')
        );
      }
    }
  }

  return rows.join('\n');
}

export async function generateWorkoutSummaryPngBlob(params: {
  dateIso: string;
  sessions: WorkoutHistoryRecord[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  weightUnit: 'kg' | 'lb';
}): Promise<Blob | null> {
  const { dateIso, sessions, landmarks, weightUnit } = params;
  if (typeof document === 'undefined' || sessions.length === 0) return null;

  const width = 1080;
  const allExercises = sessions.flatMap((s) => s.exercises);
  const shownExercises = allExercises.slice(0, 9);
  const extraCount = Math.max(0, allExercises.length - shownExercises.length);
  const height = Math.max(1180, 560 + shownExercises.length * 78 + (extraCount > 0 ? 54 : 0));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Deep slate canvas background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#0B1120');
  bgGrad.addColorStop(1, '#0F172A');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle top structural bar
  ctx.fillStyle = '#2563EB';
  ctx.fillRect(0, 0, width, 10);

  // Header brand & date
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 26px system-ui, -apple-system, sans-serif';
  ctx.fillText('HyperLog · Workout Summary', 72, 86);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 46px system-ui, -apple-system, sans-serif';
  ctx.fillText(formatHumanDateLong(dateIso), 72, 152);

  const primaryTitle =
    sessions.length === 1
      ? sessions[0].title
      : `${sessions[0].title} (+${sessions.length - 1} more)`;
  ctx.fillStyle = '#60A5FA';
  ctx.font = '600 30px system-ui, -apple-system, sans-serif';
  ctx.fillText(primaryTitle.slice(0, 56), 72, 204);

  // Muscles trained line
  const muscles = Array.from(new Set(sessions.flatMap((s) => s.musclesTrained)))
    .map((m) => landmarks[m]?.shortName ?? m)
    .join(' · ');
  if (muscles) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 24px system-ui, -apple-system, sans-serif';
    ctx.fillText(muscles.slice(0, 68), 72, 248);
  }

  // Divider
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, 286);
  ctx.lineTo(width - 72, 286);
  ctx.stroke();

  // Headline KPIs
  const totalSets = sessions.reduce((s, r) => s + r.totalSets, 0);
  const totalReps = sessions.reduce((s, r) => s + r.totalReps, 0);
  const totalTonnageKg = sessions.reduce((s, r) => s + r.totalTonnageKg, 0);
  const volumeVal =
    weightUnit === 'kg'
      ? `${Math.round(totalTonnageKg).toLocaleString()} kg`
      : `${Math.round(totalTonnageKg * 2.20462).toLocaleString()} lb`;
  const estKcal = sessions.reduce((s, r) => s + r.estimatedCaloriesKcal, 0);

  const metrics = [
    { label: 'Completed Sets', value: String(totalSets) },
    { label: 'Total Reps', value: totalReps.toLocaleString() },
    { label: 'Session Volume', value: volumeVal },
    { label: 'Est. Energy', value: `${estKcal} kcal` },
  ];

  const colW = (width - 144) / 4;
  metrics.forEach((m, idx) => {
    const x = 72 + idx * colW;
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(m.label, x, 336);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 38px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(m.value, x, 388);
  });

  // Divider before exercise table
  ctx.strokeStyle = '#1E293B';
  ctx.beginPath();
  ctx.moveTo(72, 428);
  ctx.lineTo(width - 72, 428);
  ctx.stroke();

  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 22px system-ui, -apple-system, sans-serif';
  ctx.fillText('Exercise', 72, 472);
  ctx.textAlign = 'right';
  ctx.fillText('Sets · Best Set', width - 72, 472);
  ctx.textAlign = 'left';

  let rowY = 532;
  shownExercises.forEach((ex, i) => {
    let bestSet = ex.sets[0];
    for (const st of ex.sets) {
      if (
        st.weightKg > bestSet.weightKg ||
        (st.weightKg === bestSet.weightKg && st.reps > bestSet.reps)
      ) {
        bestSet = st;
      }
    }

    // Subtle alternating row hairline
    if (i > 0) {
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(72, rowY - 46);
      ctx.lineTo(width - 72, rowY - 46);
      ctx.stroke();
    }

    ctx.fillStyle = '#F1F5F9';
    ctx.font = '600 27px system-ui, -apple-system, sans-serif';
    const exTitle =
      ex.exerciseName.length > 34 ? `${ex.exerciseName.slice(0, 33)}…` : ex.exerciseName;
    ctx.fillText(`${i + 1}. ${exTitle}`, 72, rowY);

    if (bestSet) {
      const w = convertDisplayWeight(bestSet.weightKg, weightUnit);
      const rpeTxt = typeof bestSet.rpe === 'number' ? ` · RPE ${bestSet.rpe}` : '';
      const summaryRight = `${ex.sets.length} sets · ${w} ${weightUnit} × ${bestSet.reps}${rpeTxt}`;
      ctx.fillStyle = '#34D399';
      ctx.font = '600 25px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(summaryRight, width - 72, rowY);
      ctx.textAlign = 'left';
    }

    rowY += 78;
  });

  if (extraCount > 0) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 23px system-ui, -apple-system, sans-serif';
    ctx.fillText(`+ ${extraCount} additional logged exercises`, 72, rowY);
  }

  // Footer note / watermark
  const firstNote = sessions.find((s) => s.notes && s.notes.trim())?.notes?.trim();
  if (firstNote) {
    ctx.fillStyle = '#CBD5E1';
    ctx.font = '400 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Note: "${firstNote.slice(0, 74)}"`, 72, height - 92);
  }

  ctx.fillStyle = '#64748B';
  ctx.font = '500 21px system-ui, -apple-system, sans-serif';
  ctx.fillText('Tracked with HyperLog · Hypertrophy & Volume Logbook', 72, height - 44);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
  });
}

function sanitizePdfText(value: string): string {
  return value
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u00B7/g, '|')
    .replace(/\u00D7/g, 'x')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function stampPdfPageFooters(doc: jsPDF, subtitle: string): void {
  const totalPages = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(14, pageH - 14, pageW - 14, pageH - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(sanitizePdfText(`HyperLog Workout Report | ${subtitle}`), 14, pageH - 9);
    doc.text(`Page ${p} of ${totalPages}`, pageW - 14, pageH - 9, { align: 'right' });
  }
}

export function generateDateWorkoutPdfBlob(params: {
  dateIso: string;
  sessions: WorkoutHistoryRecord[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  weightUnit: 'kg' | 'lb';
  nutritionRecord?: DailyNutritionRecord;
}): Blob {
  const { dateIso, sessions, landmarks, weightUnit, nutritionRecord } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentW = pageW - marginX * 2;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageW, 2.2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text('HYPERLOG  |  WORKOUT SESSION REPORT', marginX, 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(248, 250, 252);
  doc.text(sanitizePdfText(formatHumanDateLong(dateIso)), marginX, 22);

  const headerSub =
    sessions.length === 0
      ? 'Rest / Recovery Day'
      : sessions.length === 1
      ? sessions[0].title
      : `${sessions.length} Workout Sessions Logged`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(96, 165, 250);
  doc.text(sanitizePdfText(headerSub).slice(0, 86), marginX, 30.5);

  let y = 46;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageH - 20) {
      doc.addPage();
      y = 18;
    }
  };

  if (sessions.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    doc.text('No weightlifting sets were recorded on this calendar date.', marginX, y);
    y += 10;
  } else {
    // Aggregate Daily Summary Metrics
    const totalSets = sessions.reduce((s, r) => s + r.totalSets, 0);
    const totalReps = sessions.reduce((s, r) => s + r.totalReps, 0);
    const totalTonnageKg = sessions.reduce((s, r) => s + r.totalTonnageKg, 0);
    const estKcal = sessions.reduce((s, r) => s + r.estimatedCaloriesKcal, 0);
    const volText =
      weightUnit === 'kg'
        ? `${Math.round(totalTonnageKg).toLocaleString()} kg`
        : `${Math.round(totalTonnageKg * 2.20462).toLocaleString()} lb`;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginX, y, contentW, 20, 2.5, 2.5, 'FD');

    const kpis = [
      { label: 'Completed Sets', value: String(totalSets) },
      { label: 'Total Reps', value: totalReps.toLocaleString() },
      { label: 'Total Volume', value: volText },
      { label: 'Est. Energy', value: `${estKcal} kcal` },
    ];
    const colW = contentW / 4;
    kpis.forEach((k, idx) => {
      const kx = marginX + 4 + idx * colW;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(k.label, kx, y + 7.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(15, 23, 42);
      doc.text(sanitizePdfText(k.value), kx, y + 15.5);
    });

    y += 27;

    // Render each session
    sessions.forEach((session, sIdx) => {
      ensureSpace(26);
      if (sIdx > 0) {
        doc.setDrawColor(203, 213, 225);
        doc.line(marginX, y - 3, pageW - marginX, y - 3);
        y += 3;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      const durSuffix = session.durationMinutes ? ` (${session.durationMinutes} min)` : '';
      doc.text(sanitizePdfText(`${session.title}${durSuffix}`), marginX, y);
      y += 5.5;

      const musclesLine = session.musclesTrained
        .map((m) => landmarks[m]?.shortName ?? m)
        .join(', ');
      if (musclesLine) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105);
        doc.text(sanitizePdfText(`Target Muscles: ${musclesLine}`), marginX, y);
        y += 6.5;
      } else {
        y += 2;
      }

      // Exercise Breakdown
      session.exercises.forEach((ex, exIdx) => {
        const neededForEx = 15 + ex.sets.length * 6.2;
        ensureSpace(Math.min(neededForEx, 42));

        let bestSet = ex.sets[0];
        for (const st of ex.sets) {
          if (
            st.weightKg > bestSet.weightKg ||
            (st.weightKg === bestSet.weightKg && st.reps > bestSet.reps)
          ) {
            bestSet = st;
          }
        }

        // Exercise title bar
        doc.setFillColor(241, 245, 249);
        doc.rect(marginX, y, contentW, 7.5, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        const muscleTag = landmarks[ex.muscleId]?.shortName ?? ex.muscleId;
        doc.text(
          sanitizePdfText(`${exIdx + 1}. ${ex.exerciseName}  (${muscleTag})`).slice(0, 72),
          marginX + 2.5,
          y + 5.1
        );

        if (bestSet) {
          const topW = convertDisplayWeight(bestSet.weightKg, weightUnit);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(37, 99, 235);
          doc.text(
            sanitizePdfText(`Top Set: ${topW} ${weightUnit} x ${bestSet.reps}`),
            pageW - marginX - 2.5,
            y + 5.1,
            { align: 'right' }
          );
        }

        y += 12;

        // Column headers for sets
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(100, 116, 139);
        doc.text('SET', marginX + 3, y);
        doc.text(`LOAD (${weightUnit.toUpperCase()})`, marginX + 26, y);
        doc.text('REPS', marginX + 64, y);
        doc.text('RIR', marginX + 92, y);
        doc.text('RPE', marginX + 118, y);
        doc.text(`VOLUME (${weightUnit.toUpperCase()})`, pageW - marginX - 3, y, {
          align: 'right',
        });
        y += 2;
        doc.setDrawColor(226, 232, 240);
        doc.line(marginX, y, pageW - marginX, y);
        y += 4.6;

        ex.sets.forEach((st) => {
          ensureSpace(7);
          const w = convertDisplayWeight(st.weightKg, weightUnit);
          const vol = Number((w * st.reps).toFixed(1));

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.2);
          doc.setTextColor(30, 41, 59);
          doc.text(`#${st.setIndex}`, marginX + 3, y);

          doc.setFont('helvetica', 'bold');
          doc.text(`${w} ${weightUnit}`, marginX + 26, y);
          doc.text(String(st.reps), marginX + 64, y);

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(`${st.rir} RIR`, marginX + 92, y);
          doc.text(typeof st.rpe === 'number' ? String(st.rpe) : '-', marginX + 118, y);
          doc.text(`${vol.toLocaleString()} ${weightUnit}`, pageW - marginX - 3, y, {
            align: 'right',
          });

          y += 5.8;
        });

        y += 3.5;
      });

      if (session.notes && session.notes.trim()) {
        const wrappedNotes = doc.splitTextToSize(
          sanitizePdfText(`Session Notes: ${session.notes.trim()}`),
          contentW - 6
        );
        ensureSpace(wrappedNotes.length * 5 + 6);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(marginX, y, contentW, wrappedNotes.length * 4.8 + 4.5, 2, 2, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        doc.text(wrappedNotes, marginX + 3, y + 5.2);
        y += wrappedNotes.length * 4.8 + 9;
      }
    });
  }

  // Optional Daily Nutrition Cross-Reference
  if (nutritionRecord && nutritionRecord.meals.length > 0) {
    ensureSpace(18);
    const kcal = nutritionRecord.meals.reduce((s, m) => s + m.calories, 0);
    const prot = Math.round(nutritionRecord.meals.reduce((s, m) => s + m.proteinG, 0));
    const carbs = Math.round(nutritionRecord.meals.reduce((s, m) => s + m.carbsG, 0));
    const fat = Math.round(nutritionRecord.meals.reduce((s, m) => s + m.fatG, 0));
    const bw = convertDisplayWeight(nutritionRecord.bodyweightKg, weightUnit);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginX, y, contentW, 13, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(
      sanitizePdfText(
        `Daily Nutrition Logged: ${kcal.toLocaleString()} kcal  |  ${prot}g P  |  ${carbs}g C  |  ${fat}g F  |  BW ${bw} ${weightUnit}`
      ),
      marginX + 3,
      y + 8
    );
  }

  stampPdfPageFooters(doc, formatHumanDateShort(dateIso));
  return doc.output('blob');
}

export function generateFullHistoryPdfBlob(params: {
  records: WorkoutHistoryRecord[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  weightUnit: 'kg' | 'lb';
  streakDays: number;
  bestStreakDays: number;
  reportTitle?: string;
}): Blob {
  const {
    records,
    landmarks,
    weightUnit,
    streakDays,
    bestStreakDays,
    reportTitle = 'Complete Historical Workout Logbook',
  } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentW = pageW - marginX * 2;

  // Cover Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageW, 2.2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text('HYPERLOG  |  HISTORICAL TRAINING ARCHIVE', marginX, 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(248, 250, 252);
  doc.text(sanitizePdfText(reportTitle), marginX, 22);

  const generatedDate = formatHumanDateLong(formatLocalDateISO(new Date()));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(96, 165, 250);
  doc.text(sanitizePdfText(`Generated ${generatedDate}`), marginX, 30.5);

  let y = 46;
  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageH - 20) {
      doc.addPage();
      y = 18;
    }
  };

  const uniqueDays = new Set(records.map((r) => r.date)).size;
  const totalSets = records.reduce((s, r) => s + r.totalSets, 0);
  const totalReps = records.reduce((s, r) => s + r.totalReps, 0);
  const totalTonnageKg = records.reduce((s, r) => s + r.totalTonnageKg, 0);
  const volText =
    weightUnit === 'kg'
      ? `${Math.round(totalTonnageKg).toLocaleString()} kg`
      : `${Math.round(totalTonnageKg * 2.20462).toLocaleString()} lb`;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, y, contentW, 20, 2.5, 2.5, 'FD');

  const kpis = [
    { label: 'Workout Days', value: `${uniqueDays} (${records.length} sessions)` },
    { label: 'Lifetime Sets', value: `${totalSets.toLocaleString()} (${totalReps.toLocaleString()} reps)` },
    { label: 'Lifetime Volume', value: volText },
    { label: 'Streak (Now / Best)', value: `${streakDays}d / ${bestStreakDays}d` },
  ];
  const colW = contentW / 4;
  kpis.forEach((k, idx) => {
    const kx = marginX + 3.5 + idx * colW;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(k.label, kx, y + 7.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(sanitizePdfText(k.value), kx, y + 15.2);
  });

  y += 27;

  const sortedNewestFirst = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));

  sortedNewestFirst.forEach((session) => {
    const estimatedBlockH = 16 + session.exercises.length * 5.8 + (session.notes ? 7 : 0);
    ensureSpace(Math.min(estimatedBlockH, 48));

    doc.setFillColor(241, 245, 249);
    doc.rect(marginX, y, contentW, 8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(15, 23, 42);
    doc.text(
      sanitizePdfText(`${formatHumanDateShort(session.date)}  -  ${session.title}`).slice(0, 74),
      marginX + 2.5,
      y + 5.4
    );

    const sessionVol =
      weightUnit === 'kg'
        ? `${Math.round(session.totalTonnageKg).toLocaleString()} kg`
        : `${Math.round(session.totalTonnageKg * 2.20462).toLocaleString()} lb`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(37, 99, 235);
    doc.text(
      sanitizePdfText(`${session.totalSets} sets | ${sessionVol}`),
      pageW - marginX - 2.5,
      y + 5.4,
      { align: 'right' }
    );

    y += 12.2;

    session.exercises.forEach((ex, i) => {
      ensureSpace(6.5);
      let bestSet = ex.sets[0];
      for (const st of ex.sets) {
        if (
          st.weightKg > bestSet.weightKg ||
          (st.weightKg === bestSet.weightKg && st.reps > bestSet.reps)
        ) {
          bestSet = st;
        }
      }
      const mLabel = landmarks[ex.muscleId]?.shortName ?? ex.muscleId;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(30, 41, 59);
      doc.text(
        sanitizePdfText(`${i + 1}. ${ex.exerciseName} (${mLabel})`).slice(0, 68),
        marginX + 3,
        y
      );

      if (bestSet) {
        const bw = convertDisplayWeight(bestSet.weightKg, weightUnit);
        const rpePart = typeof bestSet.rpe === 'number' ? ` @ RPE ${bestSet.rpe}` : '';
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(
          sanitizePdfText(`${ex.sets.length} sets | Top ${bw} ${weightUnit} x ${bestSet.reps}${rpePart}`),
          pageW - marginX - 3,
          y,
          { align: 'right' }
        );
      }
      y += 5.3;
    });

    if (session.notes && session.notes.trim()) {
      ensureSpace(6.5);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        sanitizePdfText(`Note: ${session.notes.trim()}`).slice(0, 96),
        marginX + 3,
        y
      );
      y += 5.5;
    }

    y += 3.5;
  });

  stampPdfPageFooters(doc, `${records.length} Sessions`);
  return doc.output('blob');
}

export function downloadBlobFile(blob: Blob, filename: string): void {
  if (typeof window !== 'undefined' && window.HyperLogNative?.shareBase64File) {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const comma = res.indexOf(',');
      const b64 = comma >= 0 ? res.slice(comma + 1) : res;
      if (b64) {
        try {
          window.HyperLogNative?.shareBase64File?.(
            filename,
            blob.type || 'application/octet-stream',
            b64,
            filename
          );
          return;
        } catch {
          // Fall back to standard anchor download
        }
      }
    };
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareOrDownloadPdfBlob(params: {
  blob: Blob;
  filename: string;
  title: string;
  text?: string;
}): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const { blob, filename, title, text } = params;
  if (typeof window !== 'undefined' && window.HyperLogNative?.shareBase64File) {
    const sharedNatively = await new Promise<boolean>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = typeof reader.result === 'string' ? reader.result : '';
        const comma = res.indexOf(',');
        const b64 = comma >= 0 ? res.slice(comma + 1) : res;
        if (!b64) {
          resolve(false);
          return;
        }
        try {
          resolve(
            Boolean(
              window.HyperLogNative?.shareBase64File?.(
                filename,
                'application/pdf',
                b64,
                title || filename
              )
            )
          );
        } catch {
          resolve(false);
        }
      };
      reader.onerror = () => resolve(false);
      reader.readAsDataURL(blob);
    });
    if (sharedNatively) {
      return 'shared';
    }
  }
  const pdfFile = new File([blob], filename, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      if (navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          title,
          text,
          files: [pdfFile],
        });
        return 'shared';
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        return 'cancelled';
      }
      // Fall through to clean direct PDF download if iframe/browser blocks file share
    }
  }

  downloadBlobFile(blob, filename);
  return 'downloaded';
}


import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  MuscleId,
  MuscleLandmark,
  WorkoutHistoryRecord,
} from '../types/workout';
import { LB_PER_KG } from '../utils/setLogNumeric';
import { formatHumanDateLong } from '../utils/workoutHistory';
import { playWorkoutCelebrationFanfare } from '../utils/breathingAudio';
import { ExpandableInfoDropdown } from './ExpandableInfoDropdown';
import {
  Award,
  Calendar,
  Check,
  Dumbbell,
  Flame,
  Heart,
  Share2,
  Sparkles,
  Star,
  Timer,
  Trophy,
  Volume2,
  Zap,
} from 'lucide-react';

interface PageWorkoutCompleteProps {
  record: WorkoutHistoryRecord;
  landmarks: Record<MuscleId, MuscleLandmark>;
  weightUnit: 'kg' | 'lb';
  streakDays: number;
  cardioMinutesLogged: number;
  onSharePdf: (record: WorkoutHistoryRecord) => Promise<void>;
  onReturnToTracker: () => void;
  onOpenCalendar: () => void;
  onOpenWellness: () => void;
}

interface EarnedRewardBadge {
  id: string;
  title: string;
  description: string;
  xpBonus: number;
  accentClasses: string;
  icon: React.ReactNode;
}

const CELEBRATION_SPARKLES: Array<{
  leftPct: number;
  delay: number;
  size: number;
  colorClass: string;
}> = [
  { leftPct: 8, delay: 0.05, size: 18, colorClass: 'text-amber-400' },
  { leftPct: 19, delay: 0.18, size: 14, colorClass: 'text-emerald-400' },
  { leftPct: 31, delay: 0.08, size: 16, colorClass: 'text-sky-400' },
  { leftPct: 44, delay: 0.24, size: 20, colorClass: 'text-amber-500' },
  { leftPct: 58, delay: 0.12, size: 15, colorClass: 'text-teal-400' },
  { leftPct: 71, delay: 0.2, size: 18, colorClass: 'text-blue-400' },
  { leftPct: 83, delay: 0.09, size: 14, colorClass: 'text-amber-400' },
  { leftPct: 92, delay: 0.28, size: 17, colorClass: 'text-emerald-400' },
];

export const PageWorkoutComplete: React.FC<PageWorkoutCompleteProps> = ({
  record,
  landmarks,
  weightUnit,
  streakDays,
  cardioMinutesLogged,
  onSharePdf,
  onReturnToTracker,
  onOpenCalendar,
  onOpenWellness,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [sharingPdf, setSharingPdf] = useState(false);
  const [celebrationBurstNonce, setCelebrationBurstNonce] = useState<number>(1);
  const playedInitialFanfareRef = useRef<string | null>(null);

  // Play cheerful Web Audio fanfare once per completed session
  useEffect(() => {
    if (playedInitialFanfareRef.current === record.id) return;
    playedInitialFanfareRef.current = record.id;
    playWorkoutCelebrationFanfare(true);
  }, [record.id]);

  const handleReplayCheer = () => {
    setCelebrationBurstNonce((n) => n + 1);
    playWorkoutCelebrationFanfare(true);
  };

  const formattedTonnage =
    weightUnit === 'kg'
      ? `${Math.round(record.totalTonnageKg).toLocaleString()} kg`
      : `${Math.round(record.totalTonnageKg * LB_PER_KG).toLocaleString()} lb`;

  const effectiveStreak = Math.max(1, streakDays);
  const durationMins = record.durationMinutes ?? 42;

  // Compute meaningful rewards & XP earned from real workout achievements
  const earnedBadges: EarnedRewardBadge[] = useMemo(() => {
    const badges: EarnedRewardBadge[] = [
      {
        id: 'finisher_cup',
        title: 'Workout Champion Trophy',
        description: `Finished "${record.title}" from start to finish!`,
        xpBonus: 150,
        accentClasses:
          'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100',
        icon: <Trophy className="w-5 h-5 text-amber-500 shrink-0" />,
      },
    ];

    if (record.musclesTrained.includes(MuscleId.Forearms)) {
      badges.push({
        id: 'iron_grip',
        title: 'Iron Forearm & Grip Shield',
        description: 'Trained forearm strength & wrist resilience today!',
        xpBonus: 85,
        accentClasses:
          'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100',
        icon: <Award className="w-5 h-5 text-blue-500 shrink-0" />,
      });
    }

    if (cardioMinutesLogged > 0) {
      badges.push({
        id: 'cardio_heart',
        title: 'Super Heart Stamina Star',
        description: `Completed ${cardioMinutesLogged} minutes of timed cardio!`,
        xpBonus: 90,
        accentClasses:
          'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700 text-teal-900 dark:text-teal-100',
        icon: <Heart className="w-5 h-5 text-teal-500 shrink-0" />,
      });
    }

    if (effectiveStreak >= 2) {
      badges.push({
        id: 'streak_hero',
        title: `${effectiveStreak}-Day Streak Flame`,
        description: 'Showed up consistently multiple days in a row!',
        xpBonus: effectiveStreak * 25,
        accentClasses:
          'bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700 text-orange-900 dark:text-orange-100',
        icon: <Flame className="w-5 h-5 text-orange-500 shrink-0" />,
      });
    }

    if (record.totalSets >= 8 || record.totalTonnageKg >= 800) {
      badges.push({
        id: 'power_lifter',
        title: 'Power Effort Medal',
        description: `Crushed ${record.totalSets} sets (${formattedTonnage} lifted)!`,
        xpBonus: 100,
        accentClasses:
          'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100',
        icon: <Zap className="w-5 h-5 text-emerald-500 shrink-0" />,
      });
    }

    return badges;
  }, [
    record.title,
    record.musclesTrained,
    record.totalSets,
    record.totalTonnageKg,
    cardioMinutesLogged,
    effectiveStreak,
    formattedTonnage,
  ]);

  const totalSessionXp = useMemo(() => {
    const baseSetXp = record.totalSets * 20 + durationMins * 3;
    const badgeXp = earnedBadges.reduce((sum, b) => sum + b.xpBonus, 0);
    return baseSetXp + badgeXp;
  }, [record.totalSets, durationMins, earnedBadges]);

  const athleteLevel = Math.max(1, Math.floor((totalSessionXp + effectiveStreak * 120) / 250) + 1);
  const levelProgressPct = Math.min(96, Math.max(24, ((totalSessionXp + effectiveStreak * 70) % 250) / 2.5));

  return (
    <div
      data-testid="workout-complete-page"
      className="max-w-3xl mx-auto space-y-5 py-2"
    >
      {/* Celebratory Hero Card with Animated Trophy & Starburst */}
      <div className="relative overflow-hidden hl-card rounded-3xl p-6 sm:p-8 text-center space-y-5 border-2 border-emerald-500/35 dark:border-emerald-400/35">
        {!prefersReducedMotion && (
          <div
            key={celebrationBurstNonce}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-2 h-28 overflow-hidden"
          >
            {CELEBRATION_SPARKLES.map((sp, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 36, scale: 0.4, rotate: -20 }}
                animate={{
                  opacity: [0, 1, 0.85, 0],
                  y: [36, -6, -24, -40],
                  scale: [0.4, 1.15, 1, 0.7],
                  rotate: [-20, 12, -8, 18],
                }}
                transition={{
                  duration: 1.9,
                  delay: sp.delay,
                  ease: 'easeOut',
                }}
                style={{ left: `${sp.leftPct}%` }}
                className={`absolute top-6 ${sp.colorClass}`}
              >
                <Star className="fill-current" style={{ width: sp.size, height: sp.size }} />
              </motion.div>
            ))}
          </div>
        )}

        {/* Spring-Animated Trophy Medallion */}
        <motion.div
          key={`trophy_${celebrationBurstNonce}`}
          initial={prefersReducedMotion ? false : { scale: 0.65, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 18 }}
          className="w-20 h-20 rounded-3xl bg-amber-500/15 dark:bg-amber-400/20 border-2 border-amber-400/60 flex items-center justify-center mx-auto text-amber-500 dark:text-amber-300 shadow-sm"
        >
          <Trophy className="w-10 h-10" strokeWidth={2.2} />
        </motion.div>

        <div className="space-y-1.5">
          <p className="text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
            Session Logged · {formatHumanDateLong(record.date)}
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold font-display text-slate-900 dark:text-white tracking-tight">
            You Did It! Workout Complete!
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
            <strong className="text-slate-900 dark:text-white">{record.title}</strong> is saved to
            your calendar and backed up safely.
          </p>
        </div>

        {/* XP & Level Celebration Bar */}
        <div className="max-w-md mx-auto p-3.5 rounded-2xl hl-subtle border space-y-2 text-left">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-900 dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Level {athleteLevel} Strength Explorer</span>
            </span>
            <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              +{totalSessionXp} XP Earned!
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <motion.div
              initial={prefersReducedMotion ? false : { width: '8%' }}
              animate={{ width: `${levelProgressPct}%` }}
              transition={{ duration: 0.75, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500"
            />
          </div>
        </div>

        {/* Simple 4-Tile Scoreboard */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3.5 rounded-2xl hl-subtle border text-center">
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {record.totalSets}
            </p>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Sets Done
            </p>
          </div>
          <div className="p-3.5 rounded-2xl hl-subtle border text-center">
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {durationMins}m
            </p>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Workout Time
            </p>
          </div>
          <div className="p-3.5 rounded-2xl hl-subtle border text-center">
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {record.estimatedCaloriesKcal}
            </p>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Calories Burned
            </p>
          </div>
          <div className="p-3.5 rounded-2xl hl-subtle border text-center">
            <p className="text-2xl font-bold font-mono tabular-nums text-orange-600 dark:text-orange-400 inline-flex items-center justify-center gap-1">
              <Flame className="w-5 h-5" />
              <span>{effectiveStreak}d</span>
            </p>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Day Streak
            </p>
          </div>
        </div>

        {cardioMinutesLogged > 0 && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-teal-50 dark:bg-teal-950/50 border border-teal-300 dark:border-teal-700 text-xs font-semibold text-teal-800 dark:text-teal-200">
            <Timer className="w-4 h-4 shrink-0" />
            <span className="font-mono tabular-nums">
              Bonus Cardio Timer Logged: {cardioMinutesLogged} min
            </span>
          </div>
        )}

        <div className="pt-1 flex justify-center">
          <button
            type="button"
            onClick={handleReplayCheer}
            className="no-touch-delay min-h-[40px] px-4 py-1.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-amber-400 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Volume2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Play Victory Chime &amp; Stars Again</span>
          </button>
        </div>
      </div>

      {/* Unlocked Rewards & Trophy Shelf */}
      <div
        data-testid="workout-rewards-shelf"
        className="hl-card rounded-3xl p-5 sm:p-6 space-y-3.5"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Rewards Unlocked Today ({earnedBadges.length})</span>
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Total Lifted: {formattedTonnage}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {earnedBadges.map((badge, i) => (
            <motion.div
              key={badge.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.06 }}
              className={`p-3.5 rounded-2xl border flex items-start gap-3 ${badge.accentClasses}`}
            >
              <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 flex items-center justify-center shrink-0">
                {badge.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs sm:text-sm font-bold truncate">{badge.title}</h3>
                  <span className="text-[11px] font-mono tabular-nums font-bold shrink-0">
                    +{badge.xpBonus} XP
                  </span>
                </div>
                <p className="text-xs opacity-85 mt-0.5 leading-snug">{badge.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Next-Step Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={onReturnToTracker}
          className="no-touch-delay min-h-[50px] px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-xs"
        >
          <Dumbbell className="w-4 h-4 shrink-0" />
          <span>Pick Next Workout</span>
        </button>

        <button
          type="button"
          onClick={onOpenWellness}
          className="no-touch-delay min-h-[50px] px-4 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-xs"
        >
          <Heart className="w-4 h-4 shrink-0" />
          <span>Relax &amp; Log Food</span>
        </button>

        <button
          type="button"
          onClick={onOpenCalendar}
          className="no-touch-delay min-h-[50px] px-4 py-3 rounded-2xl hl-card border text-slate-900 dark:text-white hover:border-blue-500 text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span>See Calendar</span>
        </button>

        <button
          type="button"
          disabled={sharingPdf}
          onClick={async () => {
            setSharingPdf(true);
            try {
              await onSharePdf(record);
            } finally {
              setSharingPdf(false);
            }
          }}
          className="no-touch-delay min-h-[50px] px-4 py-3 rounded-2xl hl-card border text-slate-800 dark:text-slate-100 hover:border-blue-500 text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-60"
        >
          <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{sharingPdf ? 'Building PDF…' : 'Share PDF'}</span>
        </button>
      </div>

      {/* Expandable Dropdown for Exercise Breakdown */}
      <ExpandableInfoDropdown
        title="See Exercises Completed"
        subtitle={`${record.exercises.length} exercises · ${record.musclesTrained.length} muscle groups`}
        icon={<Check className="w-4 h-4" />}
        testId="workout-complete-details-dropdown"
      >
        <div className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
          {record.exercises.map((ex) => {
            const lm = landmarks[ex.muscleId];
            return (
              <div
                key={ex.exerciseId}
                className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {ex.exerciseName}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lm?.name ?? ex.muscleId}
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200 shrink-0">
                  {ex.sets.length} {ex.sets.length === 1 ? 'set' : 'sets'}
                </span>
              </div>
            );
          })}
        </div>
      </ExpandableInfoDropdown>
    </div>
  );
};

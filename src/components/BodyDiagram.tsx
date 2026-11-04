import React, { useCallback, useMemo, useState } from 'react';
import {
  MajorMuscleGroup,
  MuscleId,
  MuscleLandmark,
  VolumeZone,
} from '../types/workout';
import { evaluateVolumeZone, VOLUME_ZONE_META } from '../data/rpPlanData';
import {
  MAJOR_MUSCLE_GROUP_MAP,
  MAJOR_MUSCLE_GROUP_ORDER,
} from '../data/exerciseCatalog';

interface BodyDiagramProps {
  selectedMajorGroup: MajorMuscleGroup;
  onSelectMajorGroup: (group: MajorMuscleGroup) => void;
  selectedMuscle: MuscleId;
  onSelectMuscle: (muscle: MuscleId) => void;
  weeklySetsByMuscle: Record<MuscleId, number>;
  landmarks: Record<MuscleId, MuscleLandmark>;
  isDark?: boolean;
}

interface MuscleRegionProps {
  muscleId: MuscleId;
  d: string;
  isInActiveGroup: boolean;
  selectedMuscle: MuscleId;
  hoveredMuscle: MuscleId | null;
  onSelect: (m: MuscleId) => void;
  onHover: (m: MuscleId | null) => void;
  fill: string;
  stroke: string;
  label: string;
  isDark: boolean;
}

const MUSCLE_PLANE_LABEL: Record<MuscleId, string> = {
  [MuscleId.Chest]: 'Anterior · Upper Torso',
  [MuscleId.Back]: 'Posterior · Lats & Rhomboids',
  [MuscleId.Traps]: 'Anterior & Posterior · Upper Yoke',
  [MuscleId.FrontDelts]: 'Anterior · Shoulder Cap',
  [MuscleId.RearSideDelts]: 'Lateral & Posterior · Deltoid',
  [MuscleId.Biceps]: 'Anterior · Upper Arm',
  [MuscleId.Triceps]: 'Posterior · Upper Arm',
  [MuscleId.Forearms]: 'Anterior & Posterior · Grip & Wrist',
  [MuscleId.Quads]: 'Anterior · Thigh',
  [MuscleId.Hamstrings]: 'Posterior · Thigh',
  [MuscleId.Glutes]: 'Posterior · Hip Extensors',
  [MuscleId.Calves]: 'Anterior & Posterior · Lower Leg',
  [MuscleId.Abs]: 'Anterior · Trunk & Midline',
};

const ZONE_LEGEND_DESCRIPTIONS: Record<VolumeZone, string> = {
  [VolumeZone.BelowMV]: 'Rested · Ready to train',
  [VolumeZone.Maintenance]: 'Maintaining strength',
  [VolumeZone.Productive]: 'Building steadily',
  [VolumeZone.OptimalMAV]: 'Weekly sweet spot',
  [VolumeZone.Overreaching]: 'Time to recover',
};

const MusclePath: React.FC<MuscleRegionProps> = React.memo(
  ({
    muscleId,
    d,
    isInActiveGroup,
    selectedMuscle,
    hoveredMuscle,
    onSelect,
    onHover,
    fill,
    stroke,
    label,
    isDark,
  }) => {
    const isSelected = selectedMuscle === muscleId;
    const isHovered = hoveredMuscle === muscleId;

    const inactiveFill = isDark ? 'var(--hl-svg-inactive)' : '#E9EEF6';
    const inactiveStroke = isDark ? 'var(--hl-svg-bone-stroke)' : '#CBD5E1';
    const selectedStroke = isDark ? '#F8FAFC' : '#1E1B4B';
    const hoveredStroke = isDark ? '#E2E8F0' : '#312E81';

    const effectiveFill = isInActiveGroup ? fill : inactiveFill;
    const effectiveStroke = isInActiveGroup
      ? isSelected
        ? selectedStroke
        : isHovered
        ? hoveredStroke
        : stroke
      : inactiveStroke;
    const effectiveOpacity = isInActiveGroup
      ? isSelected
        ? 1
        : isHovered
        ? 0.95
        : 0.88
      : isHovered
      ? 0.65
      : 0.34;

    return (
      <path
        d={d}
        data-muscle-id={muscleId}
        fill={effectiveFill}
        fillOpacity={effectiveOpacity}
        stroke={effectiveStroke}
        strokeWidth={isInActiveGroup && isSelected ? 2.75 : isHovered ? 2.0 : 1.15}
        strokeLinejoin="round"
        strokeLinecap="round"
        filter={isInActiveGroup && isSelected ? 'url(#hl-selected-muscle-glow)' : undefined}
        className="cursor-pointer transition-opacity duration-150 focus:outline-none"
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={() => onSelect(muscleId)}
        onMouseEnter={() => onHover(muscleId)}
        onMouseLeave={() => onHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(muscleId);
          }
        }}
      />
    );
  },
  (prev, next) =>
    prev.muscleId === next.muscleId &&
    prev.d === next.d &&
    prev.isInActiveGroup === next.isInActiveGroup &&
    (prev.selectedMuscle === prev.muscleId) === (next.selectedMuscle === next.muscleId) &&
    (prev.hoveredMuscle === prev.muscleId) === (next.hoveredMuscle === next.muscleId) &&
    prev.fill === next.fill &&
    prev.stroke === next.stroke &&
    prev.label === next.label &&
    prev.isDark === next.isDark &&
    prev.onSelect === next.onSelect &&
    prev.onHover === next.onHover
);
MusclePath.displayName = 'MusclePath';

export const BodyDiagram: React.FC<BodyDiagramProps> = React.memo(({
  selectedMajorGroup,
  onSelectMajorGroup,
  selectedMuscle,
  onSelectMuscle,
  weeklySetsByMuscle,
  landmarks,
  isDark = false,
}) => {
  const [hoveredMuscle, setHoveredMuscle] = useState<MuscleId | null>(null);
  const [planeMode, setPlaneMode] = useState<'dual' | 'anterior' | 'posterior'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 390 ? 'anterior' : 'dual'
  );

  const handleHoverMuscle = useCallback((m: MuscleId | null) => {
    setHoveredMuscle(m);
  }, []);

  const allowedMuscles = useMemo(
    () => new Set<MuscleId>(MAJOR_MUSCLE_GROUP_MAP[selectedMajorGroup]),
    [selectedMajorGroup]
  );
  const activeGroupMuscles = MAJOR_MUSCLE_GROUP_MAP[selectedMajorGroup];

  const getMuscleVisual = (id: MuscleId) => {
    const sets = weeklySetsByMuscle[id] ?? 0;
    const lm = landmarks[id];
    const zone = evaluateVolumeZone(sets, lm);
    const meta = VOLUME_ZONE_META[zone];
    const isInActiveGroup = allowedMuscles.has(id);
    const fill =
      zone === VolumeZone.BelowMV
        ? isDark
          ? '#334155'
          : '#CBD5E1'
        : meta.svgFill;
    const stroke =
      zone === VolumeZone.BelowMV
        ? isDark
          ? '#64748B'
          : '#94A3B8'
        : meta.svgStroke;
    return {
      sets,
      lm,
      zone,
      isInActiveGroup,
      fill,
      stroke,
      aria: `${lm.name}: ${sets} sets completed (${meta.shortLabel}, MAV ${lm.mavMin}-${lm.mavMax})`,
    };
  };

  const activeCalloutMuscle = hoveredMuscle ?? selectedMuscle;
  const calloutInfo = getMuscleVisual(activeCalloutMuscle);
  const activeGroupMeta =
    MAJOR_MUSCLE_GROUP_ORDER.find((g) => g.id === selectedMajorGroup) ??
    MAJOR_MUSCLE_GROUP_ORDER[0];

  const scaleMax = Math.max(calloutInfo.lm.mrv + 4, calloutInfo.sets + 2, 24);
  const pctOfScale = (v: number) => Math.min(100, Math.max(0, Math.round((v / scaleMax) * 100)));
  const currentBarPct = pctOfScale(calloutInfo.sets);
  const mevMarkerPct = pctOfScale(calloutInfo.lm.mev);
  const mavMinMarkerPct = pctOfScale(calloutInfo.lm.mavMin);
  const mrvMarkerPct = pctOfScale(calloutInfo.lm.mrv);

  const fiberLineColor = isDark ? '#0F172A' : '#FFFFFF';

  return (
    <div
      data-testid="anatomical-volume-map"
      className="hl-card rounded-2xl p-4 sm:p-6 space-y-4"
    >
      {/* Header & Plane Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Body Balance Map
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              · Tap any muscle to check progress
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {activeGroupMeta.summary}
          </p>
        </div>

        <div
          className="flex items-center gap-1 p-1 rounded-xl hl-subtle border"
          role="group"
          aria-label="Anatomical view plane"
        >
          {(['dual', 'anterior', 'posterior'] as const).map((plane) => (
            <button
              key={plane}
              type="button"
              data-testid={`anatomy-plane-${plane}`}
              onClick={() => setPlaneMode(plane)}
              className={`no-touch-delay min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                planeMode === plane
                  ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {plane === 'dual' ? 'Split View' : plane === 'anterior' ? 'Front' : 'Back'}
            </button>
          ))}
        </div>
      </div>

      {/* Major Muscle Group Filter Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold">Focus Area</span>
          {selectedMajorGroup !== MajorMuscleGroup.All && (
            <button
              type="button"
              onClick={() => onSelectMajorGroup(MajorMuscleGroup.All)}
              className="no-touch-delay text-sky-700 dark:text-sky-400 hover:underline font-semibold"
            >
              Show All Areas
            </button>
          )}
        </div>
        <div
          className="flex items-center gap-1.5 p-1 rounded-xl hl-subtle border overflow-x-auto no-scrollbar"
          role="tablist"
          aria-label="Filter diagram by major muscle group"
        >
          {MAJOR_MUSCLE_GROUP_ORDER.map((group) => {
            const isActive = selectedMajorGroup === group.id;
            return (
              <button
                key={group.id}
                type="button"
                role="tab"
                data-testid={`anatomy-group-${group.id}`}
                aria-selected={isActive}
                onClick={() => onSelectMajorGroup(group.id)}
                className={`no-touch-delay min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {group.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Redesigned Live Landmark Progress Callout Card */}
      <div
        data-testid="anatomy-live-callout"
        className="p-3.5 rounded-xl hl-subtle border space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block w-3.5 h-3.5 rounded-sm border shrink-0"
              style={{
                backgroundColor: calloutInfo.fill,
                borderColor: calloutInfo.stroke,
              }}
            />
            <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
              {calloutInfo.lm.name}
            </span>
            <span className="hidden sm:inline text-[11px] text-slate-500 dark:text-slate-400">
              ({MUSCLE_PLANE_LABEL[activeCalloutMuscle]})
            </span>
          </div>

          <span
            className={`text-xs font-semibold ${VOLUME_ZONE_META[calloutInfo.zone].textColor}`}
          >
            {VOLUME_ZONE_META[calloutInfo.zone].shortLabel}
          </span>
        </div>

        {/* Calm Weekly Progress Bar */}
        <div className="space-y-1.5">
          <div className="relative h-2.5 rounded-full bg-slate-200/90 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.max(calloutInfo.sets > 0 ? 5 : 0, currentBarPct)}%`,
                backgroundColor:
                  calloutInfo.zone === VolumeZone.BelowMV ? '#64748B' : calloutInfo.fill,
              }}
            />
            <span
              aria-hidden="true"
              title={`Minimum effective: ${calloutInfo.lm.mev} sets`}
              className="absolute top-0 bottom-0 w-0.5 bg-sky-500/70 dark:bg-sky-300/80"
              style={{ left: `${mevMarkerPct}%` }}
            />
            <span
              aria-hidden="true"
              title={`Sweet spot: ${calloutInfo.lm.mavMin} sets`}
              className="absolute top-0 bottom-0 w-0.5 bg-emerald-600/80 dark:bg-emerald-300/90"
              style={{ left: `${mavMinMarkerPct}%` }}
            />
            <span
              aria-hidden="true"
              title={`Recovery cap: ${calloutInfo.lm.mrv} sets`}
              className="absolute top-0 bottom-0 w-0.5 bg-amber-500/80 dark:bg-amber-400/90"
              style={{ left: `${mrvMarkerPct}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300">
            <span>
              <strong className="text-slate-900 dark:text-white">{calloutInfo.sets}</strong> sets
              done this week
            </span>
            <span>
              Weekly goal: {calloutInfo.lm.mavMin}–{calloutInfo.lm.mavMax} sets
            </span>
          </div>
        </div>
      </div>

      {/* Dual or Single Anatomical Studio Stage */}
      <div
        className={`grid gap-3 sm:gap-4 items-stretch py-1 ${
          planeMode === 'dual' ? 'grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {/* ANTERIOR VIEW */}
        {planeMode !== 'posterior' && (
          <div className="hl-subtle border rounded-2xl p-3 flex flex-col items-center justify-between">
            <div className="w-full flex items-center justify-between gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5 px-1">
              <span>Anterior (Front)</span>
              <span className="font-mono tabular-nums text-[10px] text-slate-400 dark:text-slate-500">
                Pectorals · Quads · Abs
              </span>
            </div>

            <svg
              data-testid="anatomy-svg-anterior"
              viewBox="0 0 220 440"
              className={`w-full h-auto select-none ${
                planeMode === 'anterior'
                  ? 'max-w-[265px] sm:max-w-[285px]'
                  : 'max-w-[205px] sm:max-w-[232px]'
              }`}
              role="img"
              aria-label="Anterior human muscle diagram"
            >
              <defs>
                <filter id="hl-selected-muscle-glow" x="-15%" y="-15%" width="130%" height="130%">
                  <feDropShadow
                    dx="0"
                    dy="1"
                    stdDeviation="2.2"
                    floodColor={isDark ? '#60A5FA' : '#4F46E5'}
                    floodOpacity="0.45"
                  />
                </filter>
                <radialGradient id="hl-stage-anterior" cx="50%" cy="42%" r="54%">
                  <stop
                    offset="0%"
                    stopColor={isDark ? '#3B82F6' : '#818CF8'}
                    stopOpacity={isDark ? '0.12' : '0.10'}
                  />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Subtle Anatomical Stage Backdrop & Midline */}
              <ellipse cx="110" cy="216" rx="88" ry="198" fill="url(#hl-stage-anterior)" />
              <line
                x1="110"
                y1="10"
                x2="110"
                y2="426"
                stroke={isDark ? '#334155' : '#CBD5E1'}
                strokeWidth="0.75"
                strokeDasharray="3 4"
                opacity="0.55"
              />

              {/* Cranium, Neck, Pelvis, Knees, Hands & Feet Silhouette */}
              <g
                style={{
                  fill: 'var(--hl-svg-bone)',
                  stroke: 'var(--hl-svg-bone-stroke)',
                }}
                strokeWidth="1.1"
              >
                <ellipse cx="110" cy="33" rx="18.5" ry="23.5" />
                <path d="M101 55 L119 55 L122 72 L98 72 Z" />
                {/* Clavicle Landmark Line */}
                <path
                  d="M77 80 Q94 75 108 80 M143 80 Q126 75 112 80"
                  fill="none"
                  strokeWidth="1.2"
                />
                {/* Pelvis / Iliac Crest */}
                <path d="M84 197 L136 197 L131 221 L110 228 L89 221 Z" />
                {/* Patella */}
                <ellipse cx="89" cy="316" rx="10.5" ry="8.5" />
                <ellipse cx="131" cy="316" rx="10.5" ry="8.5" />
                {/* Hands */}
                <ellipse cx="37" cy="226" rx="7.5" ry="12.5" transform="rotate(11 37 226)" />
                <ellipse cx="183" cy="226" rx="7.5" ry="12.5" transform="rotate(-11 183 226)" />
                {/* Feet */}
                <path d="M80 398 L95 398 L98 418 L73 418 Z" />
                <path d="M125 398 L140 398 L147 418 L122 418 Z" />
              </g>

              {/* TRAPS (Upper Yoke) */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Traps);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Traps}
                      d="M98 63 L72 78 L96 82 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Traps}
                      d="M122 63 L148 78 L124 82 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* LATERAL DELTS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.RearSideDelts);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.RearSideDelts}
                      d="M72 78 C55 82 49 98 54 114 L67 110 C67 97 70 86 76 80 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.RearSideDelts}
                      d="M148 78 C165 82 171 98 166 114 L153 110 C153 97 150 86 144 80 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* FRONT DELTS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.FrontDelts);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.FrontDelts}
                      d="M76 80 L88 83 L78 112 L67 110 C68 96 71 86 76 80 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.FrontDelts}
                      d="M144 80 L132 83 L142 112 L153 110 C152 96 149 86 144 80 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* CHEST (Clavicular & Sternal Pectoralis Contour) */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Chest);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Chest}
                      d="M88 82 L109 82 L109 124 C95 128 80 124 76 112 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Chest}
                      d="M132 82 L111 82 L111 124 C125 128 140 124 144 112 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}
              {/* Upper/Lower Pec Fiber Separation */}
              <g
                stroke={fiberLineColor}
                strokeWidth="1"
                strokeOpacity="0.45"
                fill="none"
                pointerEvents="none"
              >
                <path d="M84 96 Q97 101 108 97" />
                <path d="M136 96 Q123 101 112 97" />
              </g>

              {/* ANTERIOR LAT FLARE */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Back);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Back}
                      d="M76 114 L84 125 L85 162 L76 146 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Back}
                      d="M144 114 L136 125 L135 162 L144 146 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* ABS & OBLIQUES */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Abs);
                return (
                  <MusclePath
                    muscleId={MuscleId.Abs}
                    d="M86 126 L134 126 L131 196 L89 196 Z"
                    isInActiveGroup={v.isInActiveGroup}
                    selectedMuscle={selectedMuscle}
                    hoveredMuscle={hoveredMuscle}
                    onSelect={onSelectMuscle}
                    onHover={handleHoverMuscle}
                    fill={v.fill}
                    stroke={v.stroke}
                    label={v.aria}
                    isDark={isDark}
                  />
                );
              })()}
              <g
                stroke={fiberLineColor}
                strokeWidth="1.2"
                strokeOpacity="0.62"
                fill="none"
                pointerEvents="none"
              >
                <line x1="110" y1="128" x2="110" y2="194" />
                <path d="M90 144 Q110 147 130 144" />
                <path d="M90 162 Q110 165 130 162" />
                <path d="M91 180 Q110 183 129 180" />
              </g>

              {/* BICEPS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Biceps);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Biceps}
                      d="M54 115 L72 114 L66 160 L48 158 C46 142 49 128 54 115 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Biceps}
                      d="M166 115 L148 114 L154 160 L172 158 C174 142 171 128 166 115 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* FOREARMS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Forearms);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Forearms}
                      d="M47 160 L65 162 L50 212 L38 210 C39 190 42 175 47 160 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Forearms}
                      d="M173 160 L155 162 L170 212 L182 210 C181 190 178 175 173 160 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* QUADS (Rectus Femoris & Vastus Sweep) */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Quads);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Quads}
                      d="M82 214 L107 224 L101 306 L77 306 C71 274 73 242 82 214 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Quads}
                      d="M138 214 L113 224 L119 306 L143 306 C149 274 147 242 138 214 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}
              <g
                stroke={fiberLineColor}
                strokeWidth="1"
                strokeOpacity="0.45"
                fill="none"
                pointerEvents="none"
              >
                <path d="M92 226 Q89 266 91 302" />
                <path d="M128 226 Q131 266 129 302" />
              </g>

              {/* ANTERIOR CALVES / TIBIALIS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Calves);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Calves}
                      d="M78 326 L100 326 C103 352 99 376 95 397 L80 397 C75 376 73 352 78 326 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Calves}
                      d="M142 326 L120 326 C117 352 121 376 125 397 L140 397 C145 376 147 352 142 326 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}
            </svg>
          </div>
        )}

        {/* POSTERIOR VIEW */}
        {planeMode !== 'anterior' && (
          <div className="hl-subtle border rounded-2xl p-3 flex flex-col items-center justify-between">
            <div className="w-full flex items-center justify-between gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5 px-1">
              <span>Posterior (Back)</span>
              <span className="font-mono tabular-nums text-[10px] text-slate-400 dark:text-slate-500">
                Lats · Glutes · Hamstrings
              </span>
            </div>

            <svg
              data-testid="anatomy-svg-posterior"
              viewBox="0 0 220 440"
              className={`w-full h-auto select-none ${
                planeMode === 'posterior'
                  ? 'max-w-[265px] sm:max-w-[285px]'
                  : 'max-w-[205px] sm:max-w-[232px]'
              }`}
              role="img"
              aria-label="Posterior human muscle diagram"
            >
              <defs>
                <radialGradient id="hl-stage-posterior" cx="50%" cy="42%" r="54%">
                  <stop
                    offset="0%"
                    stopColor={isDark ? '#10B981' : '#6366F1'}
                    stopOpacity={isDark ? '0.12' : '0.10'}
                  />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </radialGradient>
              </defs>

              <ellipse cx="110" cy="216" rx="88" ry="198" fill="url(#hl-stage-posterior)" />
              <line
                x1="110"
                y1="10"
                x2="110"
                y2="426"
                stroke={isDark ? '#334155' : '#CBD5E1'}
                strokeWidth="0.75"
                strokeDasharray="3 4"
                opacity="0.55"
              />

              <g
                style={{
                  fill: 'var(--hl-svg-bone)',
                  stroke: 'var(--hl-svg-bone-stroke)',
                }}
                strokeWidth="1.1"
              >
                <ellipse cx="110" cy="33" rx="18.5" ry="23.5" />
                <path d="M101 55 L119 55 L122 70 L98 70 Z" />
                <ellipse cx="89" cy="316" rx="10.5" ry="8" />
                <ellipse cx="131" cy="316" rx="10.5" ry="8" />
                <ellipse cx="37" cy="226" rx="7.5" ry="12.5" transform="rotate(11 37 226)" />
                <ellipse cx="183" cy="226" rx="7.5" ry="12.5" transform="rotate(-11 183 226)" />
                <path d="M80 398 L95 398 L96 418 L78 418 Z" />
                <path d="M125 398 L140 398 L142 418 L124 418 Z" />
              </g>

              {/* TRAPS (Diamond Upper & Mid Trapezius) */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Traps);
                return (
                  <MusclePath
                    muscleId={MuscleId.Traps}
                    d="M98 63 L122 63 L148 79 L110 132 L72 79 Z"
                    isInActiveGroup={v.isInActiveGroup}
                    selectedMuscle={selectedMuscle}
                    hoveredMuscle={hoveredMuscle}
                    onSelect={onSelectMuscle}
                    onHover={handleHoverMuscle}
                    fill={v.fill}
                    stroke={v.stroke}
                    label={v.aria}
                    isDark={isDark}
                  />
                );
              })()}

              {/* REAR & SIDE DELTS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.RearSideDelts);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.RearSideDelts}
                      d="M72 79 C55 83 49 98 54 114 L77 109 L85 95 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.RearSideDelts}
                      d="M148 79 C165 83 171 98 166 114 L143 109 L135 95 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* LATS & ERECTORS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Back);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Back}
                      d="M85 96 L109 132 L109 194 L87 194 L74 138 L77 110 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Back}
                      d="M135 96 L111 132 L111 194 L133 194 L146 138 L143 110 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}
              {/* Scapular & Thoracolumbar Detail */}
              <g
                stroke={fiberLineColor}
                strokeWidth="1"
                strokeOpacity="0.45"
                fill="none"
                pointerEvents="none"
              >
                <line x1="110" y1="66" x2="110" y2="192" />
                <path d="M84 128 Q96 140 106 154" />
                <path d="M136 128 Q124 140 114 154" />
              </g>

              {/* TRICEPS (Horseshoe Contour) */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Triceps);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Triceps}
                      d="M54 115 L73 112 L66 160 L48 158 C46 142 49 128 54 115 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Triceps}
                      d="M166 115 L147 112 L154 160 L172 158 C174 142 171 128 166 115 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* FOREARMS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Forearms);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Forearms}
                      d="M47 160 L65 162 L50 212 L38 210 C39 190 42 175 47 160 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Forearms}
                      d="M173 160 L155 162 L170 212 L182 210 C181 190 178 175 173 160 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* GLUTES */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Glutes);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Glutes}
                      d="M86 195 L109 195 L109 236 C95 243 77 234 78 214 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Glutes}
                      d="M134 195 L111 195 L111 236 C125 243 143 234 142 214 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* HAMSTRINGS (Biceps Femoris & Semitendinosus) */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Hamstrings);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Hamstrings}
                      d="M79 235 C86 241 99 242 107 238 L101 307 L78 307 C73 282 74 256 79 235 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Hamstrings}
                      d="M141 235 C134 241 121 242 113 238 L119 307 L142 307 C147 282 146 256 141 235 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}
              <g
                stroke={fiberLineColor}
                strokeWidth="1"
                strokeOpacity="0.45"
                fill="none"
                pointerEvents="none"
              >
                <line x1="91" y1="242" x2="90" y2="303" />
                <line x1="129" y1="242" x2="130" y2="303" />
              </g>

              {/* POSTERIOR CALVES (Gastrocnemius Dual Heads) */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Calves);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Calves}
                      d="M78 325 L101 325 C104 350 99 374 95 397 L80 397 C75 374 73 350 78 325 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Calves}
                      d="M142 325 L119 325 C116 350 121 374 125 397 L140 397 C145 374 147 350 142 325 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={handleHoverMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}
              <g
                stroke={fiberLineColor}
                strokeWidth="1"
                strokeOpacity="0.45"
                fill="none"
                pointerEvents="none"
              >
                <line x1="89" y1="328" x2="88" y2="366" />
                <line x1="131" y1="328" x2="132" y2="366" />
              </g>
            </svg>
          </div>
        )}
      </div>

      {/* Quick-Tap Muscle Selector Strip for Effortless Thumb Selection on Mobile */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-semibold">
            Quick-Select Muscle ({activeGroupMuscles.length})
          </span>
          <span>Tap region or chip to inspect</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {activeGroupMuscles.map((mId) => {
            const lm = landmarks[mId];
            const sets = weeklySetsByMuscle[mId] ?? 0;
            const active = selectedMuscle === mId;
            return (
              <button
                key={mId}
                type="button"
                data-testid={`anatomy-chip-${mId}`}
                onClick={() => onSelectMuscle(mId)}
                className={`no-touch-delay min-h-[38px] px-3 py-1 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-500 font-semibold'
                    : 'hl-subtle text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <span>{lm.shortName}</span>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    active ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {sets}/{lm.mavMax}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Enhanced Accessible Volume Landmark Legend */}
      <div
        data-testid="anatomy-volume-legend"
        className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs"
      >
        {(
          [
            VolumeZone.BelowMV,
            VolumeZone.Maintenance,
            VolumeZone.Productive,
            VolumeZone.OptimalMAV,
            VolumeZone.Overreaching,
          ] as const
        ).map((z) => {
          const meta = VOLUME_ZONE_META[z];
          const fill =
            z === VolumeZone.BelowMV ? (isDark ? '#334155' : '#CBD5E1') : meta.svgFill;
          return (
            <div
              key={z}
              className="p-2 rounded-xl hl-subtle border flex items-start gap-2 text-slate-700 dark:text-slate-200"
            >
              <span
                className="w-3 h-3 rounded-xs shrink-0 border mt-0.5"
                style={{ backgroundColor: fill, borderColor: meta.svgStroke }}
              />
              <div className="min-w-0">
                <p className="truncate font-bold text-[11px] leading-tight">{meta.shortLabel}</p>
                <p className="truncate text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {ZONE_LEGEND_DESCRIPTIONS[z]}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
BodyDiagram.displayName = 'BodyDiagram';

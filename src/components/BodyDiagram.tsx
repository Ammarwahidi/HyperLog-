import React, { useState } from 'react';
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

const MusclePath: React.FC<MuscleRegionProps> = ({
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

  const inactiveFill = isDark ? 'var(--hl-svg-inactive)' : '#F1F5F9';
  const inactiveStroke = isDark ? 'var(--hl-svg-bone-stroke)' : '#CBD5E1';
  const selectedStroke = isDark ? '#F8FAFC' : '#0F172A';
  const hoveredStroke = isDark ? '#E2E8F0' : '#1E293B';

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
      ? 0.94
      : 0.86
    : isHovered
    ? 0.65
    : 0.35;

  return (
    <path
      d={d}
      fill={effectiveFill}
      fillOpacity={effectiveOpacity}
      stroke={effectiveStroke}
      strokeWidth={isInActiveGroup && isSelected ? 2.6 : isHovered ? 1.9 : 1.1}
      strokeLinejoin="round"
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
};

export const BodyDiagram: React.FC<BodyDiagramProps> = ({
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

  const allowedMuscles = new Set<MuscleId>(MAJOR_MUSCLE_GROUP_MAP[selectedMajorGroup]);
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
          ? '#475569'
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

  return (
    <div className="hl-card rounded-2xl p-4 sm:p-6 space-y-4">
      {/* Header & Plane Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Anatomical Volume Map
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {activeGroupMeta.summary}
          </p>
        </div>

        <div
          className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90"
          role="group"
          aria-label="Anatomical view plane"
        >
          {(['dual', 'anterior', 'posterior'] as const).map((plane) => (
            <button
              key={plane}
              type="button"
              onClick={() => setPlaneMode(plane)}
              className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                planeMode === plane
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {plane === 'dual' ? 'Split' : plane === 'anterior' ? 'Front' : 'Back'}
            </button>
          ))}
        </div>
      </div>

      {/* Major Muscle Group Filter Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium">Major Muscle Group</span>
          {selectedMajorGroup !== MajorMuscleGroup.All && (
            <button
              type="button"
              onClick={() => onSelectMajorGroup(MajorMuscleGroup.All)}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              Show All
            </button>
          )}
        </div>
        <div
          className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 overflow-x-auto no-scrollbar"
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
                aria-selected={isActive}
                onClick={() => onSelectMajorGroup(group.id)}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
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

      {/* Live Hover / Selection Readout Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-3.5 py-2.5 rounded-xl hl-subtle border text-xs">
        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100 min-w-0">
          <span
            className="inline-block w-3 h-3 rounded-xs border shrink-0"
            style={{
              backgroundColor: calloutInfo.fill,
              borderColor: calloutInfo.stroke,
            }}
          />
          <span className="truncate">{calloutInfo.lm.name}</span>
          <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">
            ·
          </span>
          <span className={`whitespace-nowrap ${VOLUME_ZONE_META[calloutInfo.zone].textColor}`}>
            {VOLUME_ZONE_META[calloutInfo.zone].shortLabel}
          </span>
        </div>
        <div className="font-mono tabular-nums text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
          <strong className="text-slate-900 dark:text-white">{calloutInfo.sets}</strong> sets · MEV{' '}
          {calloutInfo.lm.mev} · MAV {calloutInfo.lm.mavMin}–{calloutInfo.lm.mavMax} · MRV{' '}
          {calloutInfo.lm.mrv}
        </div>
      </div>

      {/* Dual or Single Anatomical SVG Canvas */}
      <div
        className={`grid gap-3 sm:gap-5 items-center py-1 ${
          planeMode === 'dual' ? 'grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {/* ANTERIOR VIEW */}
        {planeMode !== 'posterior' && (
          <div className="flex flex-col items-center">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Anterior (Front)
            </span>
            <svg
              viewBox="0 0 220 440"
              className={`w-full h-auto select-none ${
                planeMode === 'anterior' ? 'max-w-[255px] sm:max-w-[275px]' : 'max-w-[200px] sm:max-w-[225px]'
              }`}
              role="img"
              aria-label="Anterior human muscle diagram"
            >
              <g
                style={{
                  fill: 'var(--hl-svg-bone)',
                  stroke: 'var(--hl-svg-bone-stroke)',
                }}
                strokeWidth="1"
              >
                <ellipse cx="110" cy="34" rx="19" ry="24" />
                <path d="M101 56 L119 56 L122 72 L98 72 Z" />
                <path d="M84 198 L136 198 L130 222 L110 228 L90 222 Z" />
                <ellipse cx="89" cy="316" rx="11" ry="9" />
                <ellipse cx="131" cy="316" rx="11" ry="9" />
                <ellipse cx="38" cy="226" rx="8" ry="13" transform="rotate(10 38 226)" />
                <ellipse cx="182" cy="226" rx="8" ry="13" transform="rotate(-10 182 226)" />
                <path d="M80 398 L95 398 L98 418 L74 418 Z" />
                <path d="M125 398 L140 398 L146 418 L122 418 Z" />
              </g>

              {/* TRAPS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Traps);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Traps}
                      d="M98 64 L72 78 L96 82 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Traps}
                      d="M122 64 L148 78 L124 82 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* SIDE DELTS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.RearSideDelts);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.RearSideDelts}
                      d="M72 78 C56 82 50 98 54 114 L67 110 C67 98 70 86 76 81 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.RearSideDelts}
                      d="M148 78 C164 82 170 98 166 114 L153 110 C153 98 150 86 144 81 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
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
                      onHover={setHoveredMuscle}
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
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* CHEST */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Chest);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Chest}
                      d="M88 82 L109 82 L109 124 C96 127 81 124 76 112 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Chest}
                      d="M132 82 L111 82 L111 124 C124 127 139 124 144 112 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* LATS FLARE */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Back);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Back}
                      d="M76 114 L84 125 L85 162 L77 146 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Back}
                      d="M144 114 L136 125 L135 162 L143 146 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* ABS */}
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
                    onHover={setHoveredMuscle}
                    fill={v.fill}
                    stroke={v.stroke}
                    label={v.aria}
                    isDark={isDark}
                  />
                );
              })()}
              <g
                stroke={isDark ? '#0F172A' : '#FFFFFF'}
                strokeWidth="1.2"
                strokeOpacity="0.6"
                pointerEvents="none"
              >
                <line x1="110" y1="128" x2="110" y2="194" />
                <line x1="90" y1="145" x2="130" y2="145" />
                <line x1="90" y1="163" x2="130" y2="163" />
                <line x1="91" y1="180" x2="129" y2="180" />
              </g>

              {/* BICEPS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Biceps);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Biceps}
                      d="M54 115 L72 114 L66 160 L48 158 C47 142 49 128 54 115 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Biceps}
                      d="M166 115 L148 114 L154 160 L172 158 C173 142 171 128 166 115 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
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
                      onHover={setHoveredMuscle}
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
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* QUADS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Quads);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Quads}
                      d="M82 214 L107 224 L101 306 L77 306 C72 274 74 242 82 214 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Quads}
                      d="M138 214 L113 224 L119 306 L143 306 C148 274 146 242 138 214 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* CALVES */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Calves);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Calves}
                      d="M78 326 L100 326 C103 352 99 376 95 397 L80 397 C76 376 74 352 78 326 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Calves}
                      d="M142 326 L120 326 C117 352 121 376 125 397 L140 397 C144 376 146 352 142 326 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
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
          <div className="flex flex-col items-center">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Posterior (Back)
            </span>
            <svg
              viewBox="0 0 220 440"
              className={`w-full h-auto select-none ${
                planeMode === 'posterior' ? 'max-w-[255px] sm:max-w-[275px]' : 'max-w-[200px] sm:max-w-[225px]'
              }`}
              role="img"
              aria-label="Posterior human muscle diagram"
            >
              <g
                style={{
                  fill: 'var(--hl-svg-bone)',
                  stroke: 'var(--hl-svg-bone-stroke)',
                }}
                strokeWidth="1"
              >
                <ellipse cx="110" cy="34" rx="19" ry="24" />
                <path d="M101 56 L119 56 L122 70 L98 70 Z" />
                <ellipse cx="89" cy="316" rx="11" ry="8" />
                <ellipse cx="131" cy="316" rx="11" ry="8" />
                <ellipse cx="38" cy="226" rx="8" ry="13" transform="rotate(10 38 226)" />
                <ellipse cx="182" cy="226" rx="8" ry="13" transform="rotate(-10 182 226)" />
                <path d="M80 398 L95 398 L96 418 L78 418 Z" />
                <path d="M125 398 L140 398 L142 418 L124 418 Z" />
              </g>

              {/* TRAPS */}
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
                    onHover={setHoveredMuscle}
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
                      d="M72 79 C55 83 50 98 54 114 L77 109 L85 95 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.RearSideDelts}
                      d="M148 79 C165 83 170 98 166 114 L143 109 L135 95 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* BACK */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Back);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Back}
                      d="M85 96 L109 132 L109 194 L87 194 L75 138 L77 110 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Back}
                      d="M135 96 L111 132 L111 194 L133 194 L145 138 L143 110 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* TRICEPS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Triceps);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Triceps}
                      d="M54 115 L73 112 L66 160 L48 158 C47 142 49 128 54 115 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Triceps}
                      d="M166 115 L147 112 L154 160 L172 158 C173 142 171 128 166 115 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
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
                      onHover={setHoveredMuscle}
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
                      onHover={setHoveredMuscle}
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
                      d="M86 195 L109 195 L109 236 C95 242 78 234 78 214 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Glutes}
                      d="M134 195 L111 195 L111 236 C125 242 142 234 142 214 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* HAMSTRINGS */}
              {(() => {
                const v = getMuscleVisual(MuscleId.Hamstrings);
                return (
                  <>
                    <MusclePath
                      muscleId={MuscleId.Hamstrings}
                      d="M79 235 C86 241 99 242 107 238 L101 307 L78 307 C74 282 75 256 79 235 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                    <MusclePath
                      muscleId={MuscleId.Hamstrings}
                      d="M141 235 C134 241 121 242 113 238 L119 307 L142 307 C146 282 145 256 141 235 Z"
                      isInActiveGroup={v.isInActiveGroup}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelect={onSelectMuscle}
                      onHover={setHoveredMuscle}
                      fill={v.fill}
                      stroke={v.stroke}
                      label={v.aria}
                      isDark={isDark}
                    />
                  </>
                );
              })()}

              {/* CALVES */}
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
                      onHover={setHoveredMuscle}
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
                      onHover={setHoveredMuscle}
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
      </div>

      {/* Quick-Tap Muscle Selector Strip for Effortless Thumb Selection on Mobile */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
          Quick-Select Region ({activeGroupMuscles.length})
        </span>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {activeGroupMuscles.map((mId) => {
            const lm = landmarks[mId];
            const sets = weeklySetsByMuscle[mId] ?? 0;
            const active = selectedMuscle === mId;
            return (
              <button
                key={mId}
                type="button"
                onClick={() => onSelectMuscle(mId)}
                className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
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
                  {sets}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accessible Volume Landmark Legend */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
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
            <div key={z} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span
                className="w-3 h-3 rounded-xs shrink-0 border"
                style={{ backgroundColor: fill, borderColor: meta.svgStroke }}
              />
              <span className="truncate font-medium">{meta.shortLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

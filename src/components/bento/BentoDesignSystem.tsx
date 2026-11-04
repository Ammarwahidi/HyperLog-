import React, { memo, useEffect, useId, useState } from 'react';
import { Check, Search, X } from 'lucide-react';

/* =========================================================================
   1. BENTO CARD
   ========================================================================= */
export interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  variant?: 'default' | 'hero' | 'sleep';
  as?: 'section' | 'article' | 'div';
  interactive?: boolean;
  onClick?: () => void;
}

export const BentoCard = memo<BentoCardProps>(
  ({
    children,
    className = '',
    testId,
    ariaLabel,
    variant = 'default',
    as: Component = 'section',
    interactive = false,
    onClick,
  }) => {
    const surfaceClass =
      variant === 'hero'
        ? 'bento-hero-surface'
        : variant === 'sleep'
        ? 'bento-sleep-surface'
        : '';

    const isClickable = Boolean(onClick) || interactive;
    const interactiveClass = isClickable ? 'bento-card-interactive' : '';

    return (
      <Component
        data-testid={testId}
        aria-label={ariaLabel}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        className={`bento-card hl-card ${surfaceClass} ${interactiveClass} ${
          onClick ? 'no-touch-delay text-left' : ''
        } p-5 sm:p-6 ${className}`}
      >
        {children}
      </Component>
    );
  }
);
BentoCard.displayName = 'BentoCard';

/* =========================================================================
   2. CIRCULAR PROGRESS RING
   Supports zero & completed states, smooth SVG stroke transitions,
   consumed + remaining readout, and color tokens (orange, purple, blue, emerald).
   ========================================================================= */
export type ProgressRingTone = 'orange' | 'purple' | 'blue' | 'emerald' | 'royal';

export interface ProgressRingProps {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  tone: ProgressRingTone;
  size?: number;
  strokeWidth?: number;
  testId?: string;
  icon?: React.ReactNode;
}

const TONE_PALETTE: Record<
  ProgressRingTone,
  {
    stroke: string;
    trackLight: string;
    trackDark: string;
    accentText: string;
  }
> = {
  orange: {
    stroke: '#F97316',
    trackLight: 'rgba(249, 115, 22, 0.14)',
    trackDark: 'rgba(249, 115, 22, 0.22)',
    accentText: 'text-orange-600 dark:text-orange-400',
  },
  purple: {
    stroke: '#8B5CF6',
    trackLight: 'rgba(139, 92, 246, 0.14)',
    trackDark: 'rgba(139, 92, 246, 0.22)',
    accentText: 'text-violet-600 dark:text-violet-400',
  },
  blue: {
    stroke: '#0EA5E9',
    trackLight: 'rgba(14, 165, 233, 0.14)',
    trackDark: 'rgba(14, 165, 233, 0.22)',
    accentText: 'text-sky-600 dark:text-sky-400',
  },
  emerald: {
    stroke: '#10B981',
    trackLight: 'rgba(16, 185, 129, 0.14)',
    trackDark: 'rgba(16, 185, 129, 0.22)',
    accentText: 'text-emerald-600 dark:text-emerald-400',
  },
  royal: {
    stroke: '#2563EB',
    trackLight: 'rgba(37, 99, 235, 0.14)',
    trackDark: 'rgba(37, 99, 235, 0.22)',
    accentText: 'text-blue-600 dark:text-blue-400',
  },
};

export const ProgressRing = memo<ProgressRingProps>(
  ({
    label,
    consumed,
    target,
    unit,
    tone,
    size = 104,
    strokeWidth = 8.5,
    testId,
    icon,
  }) => {
    const safeConsumed = Math.max(0, Math.round(Number.isFinite(consumed) ? consumed : 0));
    const safeTarget = Math.max(1, Math.round(Number.isFinite(target) ? target : 1));
    const rawPct = Math.round((safeConsumed / safeTarget) * 100);
    const clampedPct = Math.max(0, Math.min(100, rawPct));
    const remaining = Math.max(0, safeTarget - safeConsumed);
    const isCompleted = safeConsumed >= safeTarget;
    const isZero = safeConsumed === 0;

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (clampedPct / 100) * circumference;
    const palette = TONE_PALETTE[tone];

    return (
      <div
        data-testid={testId}
        className="flex flex-col items-center text-center p-3.5 sm:p-4 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/90 transition-colors"
      >
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90 transform"
            aria-label={`${label} progress: ${clampedPct}%`}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-slate-200/75 dark:text-slate-800"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={palette.stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                transition: 'stroke-dashoffset 480ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
            {icon && <div className={`mb-0.5 ${palette.accentText}`}>{icon}</div>}
            <span className="font-mono tabular-nums text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">
              {clampedPct}%
            </span>
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
              {isCompleted ? 'Goal met' : isZero ? 'Start' : 'of goal'}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-0.5 w-full">
          <div className="flex items-center justify-center gap-1">
            <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
              {label}
            </span>
            {isCompleted && (
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
          </div>

          <p className="font-mono tabular-nums text-xs text-slate-700 dark:text-slate-200">
            <strong className="font-bold text-slate-900 dark:text-white">
              {safeConsumed.toLocaleString()}
            </strong>{' '}
            / {safeTarget.toLocaleString()} {unit}
          </p>

          <p className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
            {isCompleted
              ? `Target reached (+${(safeConsumed - safeTarget).toLocaleString()} ${unit})`
              : `${remaining.toLocaleString()} ${unit} remaining`}
          </p>
        </div>
      </div>
    );
  }
);
ProgressRing.displayName = 'ProgressRing';

/* =========================================================================
   3. LIGHTWEIGHT SVG SPARKLINE
   Zero-dependency smooth path rendering strictly real data points.
   ========================================================================= */
export interface SparklinePoint {
  label: string;
  value: number;
}

export interface SparklineProps {
  points: SparklinePoint[];
  strokeColor?: string;
  stroke?: string;
  fillId?: string;
  ariaLabel?: string;
  height?: number;
  unit?: string;
}

export const Sparkline = memo<SparklineProps>(
  ({ points, strokeColor, stroke, fillId, ariaLabel, height = 56, unit = '' }) => {
    const autoGradId = useId();
    const gradId = fillId ?? autoGradId;
    const resolvedStroke = stroke ?? strokeColor ?? '#0EA5E9';
    const safePoints = points.length > 0 ? points : [{ label: 'Today', value: 0 }];
    const width = 240;
    const padX = 8;
    const padY = 8;

    const values = safePoints.map((p) => p.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const span = Math.max(1, maxVal - minVal);

    const coords = safePoints.map((pt, idx) => {
      const x =
        safePoints.length === 1
          ? width / 2
          : padX + (idx / (safePoints.length - 1)) * (width - padX * 2);
      const y =
        maxVal === minVal
          ? height / 2
          : height - padY - ((pt.value - minVal) / span) * (height - padY * 2);
      return { x, y, pt };
    });

    const linePath =
      coords.length === 1
        ? `M ${padX} ${coords[0].y} L ${width - padX} ${coords[0].y}`
        : coords.reduce((acc, cur, idx, arr) => {
            if (idx === 0) return `M ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
            const prev = arr[idx - 1];
            const cx1 = (prev.x + cur.x) / 2;
            const cy1 = prev.y;
            const cx2 = (prev.x + cur.x) / 2;
            const cy2 = cur.y;
            return `${acc} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
          }, '');

    const areaPath = `${linePath} L ${(coords[coords.length - 1]?.x ?? width - padX).toFixed(
      1
    )} ${height} L ${(coords[0]?.x ?? padX).toFixed(1)} ${height} Z`;

    const lastCoord = coords[coords.length - 1];

    return (
      <div className="w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full overflow-visible"
          style={{ height }}
          role="img"
          aria-label={ariaLabel ?? `Trend sparkline (${safePoints.length} logged points)`}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={resolvedStroke} stopOpacity="0.24" />
              <stop offset="100%" stopColor={resolvedStroke} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          <path d={areaPath} fill={`url(#${gradId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={resolvedStroke}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {lastCoord && (
            <circle
              cx={lastCoord.x}
              cy={lastCoord.y}
              r="3.5"
              fill={resolvedStroke}
              className="stroke-white dark:stroke-slate-900"
              strokeWidth="1.5"
            />
          )}
        </svg>

        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
          <span>{safePoints[0]?.label}</span>
          <span>
            {safePoints[safePoints.length - 1]?.value}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      </div>
    );
  }
);
Sparkline.displayName = 'Sparkline';

/* =========================================================================
   4. METRIC CARD
   ========================================================================= */
export interface MetricCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle?: string;
  statusLabel?: string;
  onClick?: () => void;
  testId?: string;
}

export const MetricCard = memo<MetricCardProps>(
  ({ icon, title, value, subtitle, statusLabel, onClick, testId }) => {
    return (
      <BentoCard testId={testId} onClick={onClick} className="flex flex-col justify-between gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
            {icon}
          </div>
          {statusLabel && (
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {statusLabel}
            </span>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>
      </BentoCard>
    );
  }
);
MetricCard.displayName = 'MetricCard';

/* =========================================================================
   5. QUICK ACTION BUTTON
   ========================================================================= */
export interface QuickActionButtonProps {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'subtle';
  testId?: string;
  className?: string;
}

export const QuickActionButton = memo<QuickActionButtonProps>(
  ({ label, onClick, icon, variant = 'primary', testId, className = '' }) => {
    const styleClass =
      variant === 'primary'
        ? 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-xs'
        : variant === 'secondary'
        ? 'bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white'
        : 'hl-subtle border text-slate-700 dark:text-slate-200 hover:border-blue-500';

    return (
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        className={`no-touch-delay min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${styleClass} ${className}`}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }
);
QuickActionButton.displayName = 'QuickActionButton';

/* =========================================================================
   6. NAVIGATION TAB (Royal-Blue Active State, Clean Minimal Inactive)
   ========================================================================= */
export interface NavigationTabProps {
  id: string;
  label: string;
  active: boolean;
  onSelect?: () => void;
  onClick?: () => void;
  testId?: string;
}

export const NavigationTab = memo<NavigationTabProps>(
  ({ label, active, onSelect, onClick, testId }) => {
    return (
      <button
        type="button"
        role="tab"
        data-testid={testId}
        aria-selected={active}
        onClick={onClick ?? onSelect}
        className={`no-touch-delay min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 ${
          active
            ? 'bg-[#2563EB] text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
        }`}
      >
        {label}
      </button>
    );
  }
);
NavigationTab.displayName = 'NavigationTab';

/* =========================================================================
   7. SECTION HEADER
   ========================================================================= */
export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

export const SectionHeader = memo<SectionHeaderProps>(({ title, subtitle, rightSlot }) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">{subtitle}</p>
        )}
      </div>
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  );
});
SectionHeader.displayName = 'SectionHeader';

/* =========================================================================
   8. DEBOUNCED SEARCH COMPONENT
   ========================================================================= */
export interface SearchComponentProps {
  value: string;
  onChange: (nextVal: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  testId?: string;
  debounceMs?: number;
}

export const SearchComponent = memo<SearchComponentProps>(
  ({
    value,
    onChange,
    placeholder = 'Search foods or saved meals…',
    ariaLabel = 'Search foods',
    testId,
    debounceMs = 120,
  }) => {
    const [localDraft, setLocalDraft] = useState(value);

    useEffect(() => {
      setLocalDraft(value);
    }, [value]);

    useEffect(() => {
      if (localDraft === value) return;
      const timer = window.setTimeout(() => {
        onChange(localDraft);
      }, debounceMs);
      return () => window.clearTimeout(timer);
    }, [localDraft, value, onChange, debounceMs]);

    return (
      <div className="relative w-full">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          data-testid={testId}
          aria-label={ariaLabel}
          value={localDraft}
          onChange={(e) => setLocalDraft(e.target.value)}
          placeholder={placeholder}
          className="w-full min-h-[44px] pl-10 pr-10 py-2 text-xs sm:text-sm hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        />
        {localDraft && (
          <button
            type="button"
            onClick={() => {
              setLocalDraft('');
              onChange('');
            }}
            aria-label="Clear search"
            className="no-touch-delay min-h-[38px] min-w-[38px] absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }
);
SearchComponent.displayName = 'SearchComponent';

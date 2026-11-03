import React, { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface ExpandableInfoDropdownProps {
  title: string;
  subtitle?: string;
  summaryRight?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (nextOpen: boolean) => void;
  testId?: string;
  className?: string;
  children: React.ReactNode;
}

export const ExpandableInfoDropdown: React.FC<ExpandableInfoDropdownProps> = ({
  title,
  subtitle,
  summaryRight,
  icon,
  defaultOpen = false,
  open,
  onOpenChange,
  testId,
  className = '',
  children,
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState<boolean>(defaultOpen);
  const isControlled = typeof open === 'boolean';
  const isOpen = isControlled ? open : uncontrolledOpen;
  const panelId = useId();

  const handleToggle = () => {
    const next = !isOpen;
    if (!isControlled) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  };

  return (
    <div
      data-testid={testId}
      className={`hl-card rounded-2xl overflow-hidden transition-colors ${className}`}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={handleToggle}
        className="no-touch-delay w-full min-h-[54px] px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
      >
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span className="w-8 h-8 rounded-xl hl-subtle border flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <span className="text-sm font-bold text-slate-900 dark:text-white block truncate">
              {title}
            </span>
            {subtitle && (
              <span className="text-xs text-slate-500 dark:text-slate-400 block truncate mt-0.5">
                {subtitle}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {summaryRight && (
            <span className="text-[11px] sm:text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {summaryRight}
            </span>
          )}
          <span className="min-h-[34px] px-2.5 py-1 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 whitespace-nowrap">
            <span>{isOpen ? 'Hide' : 'Open'}</span>
            {isOpen ? (
              <ChevronUp className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            )}
          </span>
        </div>
      </button>

      {isOpen && (
        <div
          id={panelId}
          className="px-4 pb-4 pt-3 border-t border-slate-200/80 dark:border-slate-800"
        >
          {children}
        </div>
      )}
    </div>
  );
};

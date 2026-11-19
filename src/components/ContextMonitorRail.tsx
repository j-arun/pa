import { AlertTriangle, Calendar, ShieldAlert, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { CarefulDateItem } from '../types/workbench';

interface ContextMonitorRailProps {
  carefulDates: CarefulDateItem[];
  periodLabel?: string;
  onClose: () => void;
}

const SEVERITY_STYLES: Record<
  NonNullable<CarefulDateItem['severity']>,
  { dot: string; label: string; border: string }
> = {
  high: {
    dot: 'bg-red-500',
    label: 'High Care',
    border: 'border-red-200/90 dark:border-red-900/75',
  },
  caution: {
    dot: 'bg-amber-500',
    label: 'Caution',
    border: 'border-amber-200/90 dark:border-amber-900/75',
  },
  watch: {
    dot: 'bg-sky-500',
    label: 'Watch',
    border: 'border-slate-200/90 dark:border-slate-700/80',
  },
};

export function ContextMonitorRail({
  carefulDates,
  periodLabel,
  onClose,
}: ContextMonitorRailProps) {
  const [selectedDomain, setSelectedDomain] = useState<string>('All');

  const domains = useMemo(() => {
    const unique = Array.from(
      new Set(carefulDates.map((item) => item.domain.trim() || 'General')),
    );
    return ['All', ...unique];
  }, [carefulDates]);

  const activeDomain = domains.includes(selectedDomain) ? selectedDomain : 'All';

  const groupedByDomain = useMemo(() => {
    const filtered =
      activeDomain === 'All'
        ? carefulDates
        : carefulDates.filter(
            (item) => (item.domain.trim() || 'General') === activeDomain,
          );

    const map = new Map<string, CarefulDateItem[]>();
    for (const item of filtered) {
      const domainKey = item.domain.trim() || 'General';
      const existing = map.get(domainKey) || [];
      existing.push(item);
      map.set(domainKey, existing);
    }
    return Array.from(map.entries());
  }, [activeDomain, carefulDates]);

  return (
    <motion.aside
      aria-label="Care Must Be Taken"
      initial={{ opacity: 0, x: 28, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 28, scale: 0.96 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-[4.25rem] right-4 z-30 w-[330px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8.5rem)] flex flex-col rounded-3xl border border-white/90 dark:border-slate-700/85 bg-white/92 dark:bg-slate-900/92 backdrop-blur-2xl shadow-[0_24px_60px_-14px_rgba(15,23,42,0.26)] overflow-hidden select-text"
    >
      {/* Header */}
      <div className="shrink-0 px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-500" />
            <h2 className="font-display text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              Care Must Be Taken
            </h2>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums truncate">
            {periodLabel ? `${periodLabel} · ` : ''}
            {carefulDates.length} date{carefulDates.length === 1 ? '' : 's'} flagged
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close Care Must Be Taken"
          title="Close Care Must Be Taken"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Domain Filter Strip */}
      {domains.length > 2 && (
        <div className="shrink-0 px-3.5 py-2 border-b border-slate-200/70 dark:border-slate-800/70 flex items-center gap-1.5 overflow-x-auto fluent-scroll">
          {domains.map((dom) => (
            <button
              key={dom}
              type="button"
              onClick={() => setSelectedDomain(dom)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeDomain === dom
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {dom}
            </button>
          ))}
        </div>
      )}

      {/* Careful Dates List */}
      <div className="flex-1 min-h-0 overflow-y-auto fluent-scroll p-3.5 space-y-4">
        {groupedByDomain.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 p-4 text-center space-y-1.5">
            <AlertTriangle className="w-5 h-5 mx-auto text-slate-400" />
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              No careful dates yet
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Ask a question to populate domain-specific dates to watch closely.
            </p>
          </div>
        ) : (
          groupedByDomain.map(([domainName, items]) => (
            <section key={domainName} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {domainName}
                </h3>
                <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                  {items.length}
                </span>
              </div>

              <div className="space-y-2">
                {items.map((item) => {
                  const sev = SEVERITY_STYLES[item.severity || 'caution'];
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border ${sev.border} bg-white/85 dark:bg-slate-950/60 p-3 space-y-1.5 shadow-2xs`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--pa-accent)' }} />
                          <span>{item.date}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                          <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} aria-hidden="true" />
                          <span>{sev.label}</span>
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {item.note}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </motion.aside>
  );
}

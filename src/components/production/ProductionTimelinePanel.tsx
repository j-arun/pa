import {
  AlertTriangle,
  Briefcase,
  Calendar,
  Coins,
  Heart,
  Home,
  Scale,
  ShieldAlert,
  ShieldPlus,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CarefulDateItem } from '../../types/workbench';

interface ProductionTimelinePanelProps {
  carefulDates: CarefulDateItem[];
  periodLabel?: string;
  isDarkTheme?: boolean;
  onClose: () => void;
}

const SEVERITY_META: Record<
  NonNullable<CarefulDateItem['severity']>,
  { label: string; dotColor: string; ringBorder: string }
> = {
  high: {
    label: 'High Care',
    dotColor: '#ef4444',
    ringBorder: 'rgba(252, 165, 165, 0.72)',
  },
  caution: {
    label: 'Caution',
    dotColor: '#f59e0b',
    ringBorder: 'rgba(253, 230, 138, 0.65)',
  },
  watch: {
    label: 'Watch',
    dotColor: '#38bdf8',
    ringBorder: 'rgba(186, 230, 253, 0.68)',
  },
};

function DomainNodeGlyph({ domain }: { domain: string }) {
  const lower = domain.toLowerCase();
  if (/(career|work|business|retail|profession|job)/.test(lower)) {
    return <Briefcase className="w-4 h-4 text-sky-400" />;
  }
  if (/(finance|money|wealth|invest|budget|income)/.test(lower)) {
    return <Coins className="w-4 h-4 text-amber-400" />;
  }
  if (/(family|home|domestic|household)/.test(lower)) {
    return <Home className="w-4 h-4 text-emerald-400" />;
  }
  if (/(love|relationship|romance|marriage|partner)/.test(lower)) {
    return <Heart className="w-4 h-4 text-rose-400" />;
  }
  if (/(litigation|legal|lawsuit|court|dispute)/.test(lower)) {
    return <Scale className="w-4 h-4 text-orange-400" />;
  }
  if (/(health|wellness|medical|vitality|body)/.test(lower)) {
    return <ShieldPlus className="w-4 h-4 text-violet-400" />;
  }
  return <Calendar className="w-4 h-4 text-amber-400" />;
}

export function ProductionTimelinePanel({
  carefulDates,
  periodLabel,
  isDarkTheme = true,
  onClose,
}: ProductionTimelinePanelProps) {
  const [selectedDomain, setSelectedDomain] = useState<string>('All');

  const domains = useMemo(() => {
    const unique = Array.from(
      new Set(carefulDates.map((item) => item.domain.trim() || 'General')),
    );
    return ['All', ...unique];
  }, [carefulDates]);

  const activeDomain = domains.includes(selectedDomain) ? selectedDomain : 'All';

  const visibleItems = useMemo(() => {
    if (activeDomain === 'All') return carefulDates;
    return carefulDates.filter(
      (item) => (item.domain.trim() || 'General') === activeDomain,
    );
  }, [activeDomain, carefulDates]);

  return (
    <aside
      aria-label="Dates & Events to Watch Out"
      className="pa-glass-card fixed top-14 right-0 bottom-9 z-30 w-[480px] max-w-[96vw] flex flex-col border-l overflow-hidden select-text"
    >
      {/* Frosted Drawer Header */}
      <div
        className={`shrink-0 px-5 py-3.5 border-b flex items-center justify-between gap-3 ${
          isDarkTheme
            ? 'border-white/12 bg-white/5'
            : 'border-white/75 bg-white/55'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert
              className={`w-4 h-4 shrink-0 ${
                isDarkTheme ? 'text-amber-400' : 'text-amber-600'
              }`}
            />
            <h2
              className={`font-display text-sm font-bold tracking-wide truncate ${
                isDarkTheme ? 'text-white' : 'text-slate-900'
              }`}
            >
              Dates &amp; Events to Watch Out
            </h2>
          </div>
          <p
            className={`text-[11px] font-medium mt-0.5 tabular-nums truncate ${
              isDarkTheme ? 'text-slate-300/80' : 'text-slate-600'
            }`}
          >
            {periodLabel ? `${periodLabel} · ` : ''}
            {carefulDates.length} item{carefulDates.length === 1 ? '' : 's'} flagged
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close Watch Out Timeline"
          title="Close"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-colors shrink-0 cursor-pointer ${
            isDarkTheme
              ? 'text-slate-300 hover:text-white hover:bg-white/10'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-900/5'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Domain Filter Strip when multiple domains present */}
      {domains.length > 2 && (
        <div
          className={`shrink-0 px-4 py-2 border-b flex items-center gap-1.5 overflow-x-auto fluent-scroll ${
            isDarkTheme
              ? 'border-white/10 bg-white/4'
              : 'border-white/65 bg-white/40'
          }`}
        >
          {domains.map((dom) => (
            <button
              key={dom}
              type="button"
              onClick={() => setSelectedDomain(dom)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeDomain === dom
                  ? isDarkTheme
                    ? 'bg-sky-500/25 text-sky-200 border border-sky-400/45'
                    : 'bg-sky-600 text-white'
                  : isDarkTheme
                    ? 'text-slate-300 hover:bg-white/10'
                    : 'text-slate-700 hover:bg-white/75'
              }`}
            >
              {dom}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable Glassy Timeline */}
      <div className="relative flex-1 min-h-0 overflow-y-auto fluent-scroll px-4 sm:px-5 py-5">
        {visibleItems.length > 0 && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute top-5 bottom-5 left-[2.15rem] w-[2px] ${
              isDarkTheme ? 'bg-white/14' : 'bg-sky-300/60'
            }`}
          />
        )}

        {visibleItems.length === 0 ? (
          <div className="pa-glass-subwell max-w-xs mx-auto mt-10 rounded-2xl p-5 text-center space-y-2">
            <AlertTriangle
              className={`w-5 h-5 mx-auto ${
                isDarkTheme ? 'text-amber-300' : 'text-amber-600'
              }`}
            />
            <p
              className={`text-xs font-bold tracking-wide ${
                isDarkTheme ? 'text-white' : 'text-slate-900'
              }`}
            >
              No Watch-Out Dates Flagged
            </p>
            <p
              className={`text-[11px] leading-relaxed ${
                isDarkTheme ? 'text-slate-300/85' : 'text-slate-600'
              }`}
            >
              Dates requiring extra care across domains appear along this timeline when present in the report.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleItems.map((item) => {
              const sev = SEVERITY_META[item.severity || 'caution'];
              return (
                <div key={item.id} className="relative flex items-start gap-3">
                  <div
                    className={`relative z-10 shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5 shadow-md ${
                      isDarkTheme ? 'bg-slate-900/90' : 'bg-white/95'
                    }`}
                    style={{ border: `1.5px solid ${sev.ringBorder}` }}
                    title={`${item.domain} · ${sev.label}`}
                  >
                    <DomainNodeGlyph domain={item.domain} />
                  </div>

                  <div className="pa-glass-subwell flex-1 rounded-2xl px-4 py-3 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: sev.dotColor }}
                          aria-hidden="true"
                        />
                        <h3
                          className={`text-xs font-bold tracking-wide ${
                            isDarkTheme ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {item.domain || 'General'} · {sev.label}
                        </h3>
                      </div>
                      <span
                        className={`text-[11px] font-mono font-semibold tabular-nums ${
                          isDarkTheme ? 'text-amber-200' : 'text-amber-700'
                        }`}
                      >
                        {item.date}
                      </span>
                    </div>
                    <p
                      className={`text-xs leading-relaxed ${
                        isDarkTheme ? 'text-slate-200/90' : 'text-slate-700'
                      }`}
                    >
                      {item.note}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

import {
  AlertTriangle,
  Briefcase,
  Calendar,
  Heart,
  Layers,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CarefulDateItem } from '../../types/workbench';

interface ProductionTimelinePanelProps {
  carefulDates: CarefulDateItem[];
  periodLabel?: string;
  onClose: () => void;
}

const SEVERITY_META: Record<
  NonNullable<CarefulDateItem['severity']>,
  { label: string; dotColor: string; ringBorder: string }
> = {
  high: {
    label: 'High Care',
    dotColor: '#ef4444',
    ringBorder: '#fca5a5',
  },
  caution: {
    label: 'Caution',
    dotColor: '#f59e0b',
    ringBorder: '#cbd5e1',
  },
  watch: {
    label: 'Watch',
    dotColor: '#38bdf8',
    ringBorder: '#bae6fd',
  },
};

function DomainNodeGlyph({ domain }: { domain: string }) {
  const lower = domain.toLowerCase();
  if (/(career|work|business|retail|profession|job)/.test(lower)) {
    return <Briefcase className="w-4 h-4 text-sky-300" />;
  }
  if (/(family|home|finance|money|domestic|household)/.test(lower)) {
    return <Layers className="w-4 h-4 text-emerald-300" />;
  }
  if (/(love|relationship|romance|marriage|partner)/.test(lower)) {
    return <Heart className="w-4 h-4 text-rose-300" />;
  }
  if (/(health|wellness|medical|vitality|body)/.test(lower)) {
    return <ShieldAlert className="w-4 h-4 text-violet-300" />;
  }
  return <Calendar className="w-4 h-4 text-amber-300" />;
}

export function ProductionTimelinePanel({
  carefulDates,
  periodLabel,
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
      className="fixed top-14 right-0 bottom-9 z-30 w-[560px] max-w-[96vw] flex flex-col border-l border-slate-700/75 bg-[#111318] shadow-[0_24px_70px_rgba(2,6,23,0.78)] overflow-hidden select-text"
    >
      {/* Top Drawer Header */}
      <div className="shrink-0 bg-[#0c0f15] border-b border-slate-800/90 px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
            <h2 className="font-display text-sm font-bold tracking-wide text-white uppercase truncate">
              Dates &amp; Events to Watch Out
            </h2>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-0.5 tabular-nums truncate">
            {periodLabel ? `${periodLabel} · ` : ''}
            {carefulDates.length} item{carefulDates.length === 1 ? '' : 's'} flagged
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close Watch Out Timeline"
          title="Close"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Domain Filter Strip when multiple domains present */}
      {domains.length > 2 && (
        <div className="shrink-0 bg-[#12161f] px-4 py-2 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto fluent-scroll">
          {domains.map((dom) => (
            <button
              key={dom}
              type="button"
              onClick={() => setSelectedDomain(dom)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeDomain === dom
                  ? 'bg-white text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {dom}
            </button>
          ))}
        </div>
      )}

      {/* Screenshot 3 Style Diagonal Light/Dark Split Vertical Timeline */}
      <div className="relative flex-1 min-h-0 overflow-y-auto fluent-scroll bg-[#111318]">
        {/* Fixed Diagonal Split Polygon Backdrop (#f3f4f6 upper-left vs #111318 lower-right) */}
        <div className="sticky top-0 h-0 w-full overflow-visible pointer-events-none z-0">
          <div className="relative w-full h-[calc(100vh-9.5rem)]">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="w-full h-full block"
              aria-hidden="true"
            >
              <polygon points="0,0 100,0 100,100 0,100" fill="#111318" />
              <polygon points="0,0 84,0 16,100 0,100" fill="#f3f4f6" />
            </svg>
          </div>
        </div>

        <div className="relative z-10 min-h-full px-4 sm:px-6 py-7">
          {/* Central Vertical Timeline Spine */}
          {visibleItems.length > 0 && (
            <div
              aria-hidden="true"
              className="hidden sm:block pointer-events-none absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-slate-400/55"
            />
          )}

          {visibleItems.length === 0 ? (
            <div className="max-w-xs mx-auto mt-10 rounded-md border border-slate-200 bg-[#f1f2f4] p-5 text-center shadow-lg space-y-2">
              <AlertTriangle className="w-5 h-5 mx-auto text-slate-600" />
              <p className="text-xs font-bold uppercase tracking-wider text-slate-900">
                No Watch-Out Dates Flagged
              </p>
              <p className="text-[11px] leading-relaxed text-slate-600">
                Dates requiring special care across domains appear along this timeline when present in the report.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {visibleItems.map((item, idx) => {
                const sev = SEVERITY_META[item.severity || 'caution'];
                const isLeftCard = idx % 2 === 0;
                const headingText = `${(item.domain || 'General').toUpperCase()} · ${sev.label.toUpperCase()}`;

                return (
                  <div key={item.id}>
                    {/* Desktop Alternating Spine Layout (Screenshot 3) */}
                    <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] items-center gap-2">
                      {/* Left Column */}
                      {isLeftCard ? (
                        <div className="relative bg-[#f1f2f4] text-slate-900 rounded-[4px] border border-white px-4 py-3.5 shadow-[0_12px_28px_rgba(2,6,23,0.22)]">
                          <span
                            aria-hidden="true"
                            className="absolute top-1/2 -right-[8px] -translate-y-1/2 w-0 h-0 border-y-[7px] border-y-transparent border-l-[9px] border-l-[#f1f2f4]"
                          />
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: sev.dotColor }}
                              aria-hidden="true"
                            />
                            <h3 className="text-[12px] font-extrabold tracking-wide text-slate-900 uppercase leading-snug">
                              {headingText}
                            </h3>
                          </div>
                          <p className="mt-1.5 text-[11.5px] leading-relaxed font-medium text-slate-600">
                            {item.note}
                          </p>
                        </div>
                      ) : (
                        <div className="pr-2 text-right">
                          <span className="inline-block text-[11px] font-bold tracking-wider uppercase tabular-nums text-white mix-blend-difference">
                            {item.date}
                          </span>
                        </div>
                      )}

                      {/* Center Circular Node */}
                      <div className="flex justify-center">
                        <div
                          className="relative z-10 w-10 h-10 rounded-full bg-[#161a22] flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
                          style={{ border: `2px solid ${sev.ringBorder}` }}
                          title={`${item.domain} · ${sev.label}`}
                        >
                          <DomainNodeGlyph domain={item.domain} />
                        </div>
                      </div>

                      {/* Right Column */}
                      {!isLeftCard ? (
                        <div className="relative bg-[#f1f2f4] text-slate-900 rounded-[4px] border border-white px-4 py-3.5 shadow-[0_12px_28px_rgba(2,6,23,0.22)]">
                          <span
                            aria-hidden="true"
                            className="absolute top-1/2 -left-[8px] -translate-y-1/2 w-0 h-0 border-y-[7px] border-y-transparent border-r-[9px] border-r-[#f1f2f4]"
                          />
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: sev.dotColor }}
                              aria-hidden="true"
                            />
                            <h3 className="text-[12px] font-extrabold tracking-wide text-slate-900 uppercase leading-snug">
                              {headingText}
                            </h3>
                          </div>
                          <p className="mt-1.5 text-[11.5px] leading-relaxed font-medium text-slate-600">
                            {item.note}
                          </p>
                        </div>
                      ) : (
                        <div className="pl-2 text-left">
                          <span className="inline-block text-[11px] font-bold tracking-wider uppercase tabular-nums text-white mix-blend-difference">
                            {item.date}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Compact Mobile Vertical Layout */}
                    <div className="sm:hidden flex items-start gap-3">
                      <div
                        className="shrink-0 w-9 h-9 rounded-full bg-[#161a22] flex items-center justify-center mt-0.5 shadow"
                        style={{ border: `2px solid ${sev.ringBorder}` }}
                      >
                        <DomainNodeGlyph domain={item.domain} />
                      </div>
                      <div className="flex-1 bg-[#f1f2f4] text-slate-900 rounded-[4px] border border-white px-3.5 py-3 shadow-md">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                          <h3 className="text-[11px] font-extrabold tracking-wide text-slate-900 uppercase">
                            {headingText}
                          </h3>
                          <span className="text-[10px] font-bold uppercase tabular-nums text-slate-700">
                            {item.date}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                          {item.note}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

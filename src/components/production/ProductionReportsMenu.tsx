import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PromptDomain, RatedThreadRecord } from '../../types/workbench';
import {
  getMonthNameFromNumber,
  getMonthNumberFromName,
  getPromptDomainShortLabel,
  THREAD_MONTHS,
} from '../../utils/promptTemplates';
import { EventCategoryEmblem, getDomainEmblemIcon } from '../DomainEmblem';

interface ProductionReportsMenuProps {
  reports: RatedThreadRecord[];
  activeReportId?: string | null;
  onSelectReport: (record: RatedThreadRecord) => void;
  onDeleteReport: (recordId: string) => void;
  onClose: () => void;
}

interface FloatingReportItem {
  record: RatedThreadRecord;
  year: number;
  month: string;
  monthNum: number;
  provider: 'gemini' | 'fable';
  domain: PromptDomain;
  shortLabel: string;
  fullQuestion: string;
  timeTooltip: string;
  timestampMs: number;
}

function normalizeFloatingDomain(rawDomain?: string, relPath?: string): PromptDomain {
  if (
    rawDomain === 'astrology' ||
    rawDomain === 'family' ||
    rawDomain === 'finance' ||
    rawDomain === 'general' ||
    rawDomain === 'health'
  ) {
    if (rawDomain === 'finance' && relPath && /(?:^|\/)family(?:\/|$)/i.test(relPath)) {
      return 'family';
    }
    return rawDomain;
  }
  return 'astrology';
}

function formatRunTimeTooltip(isoString: string, domainLabel: string, fullQuestion: string): string {
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) {
    return `${domainLabel} · ${fullQuestion}`;
  }
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const day = dt.getDate();
  const monthShort = (getMonthNameFromNumber(dt.getMonth() + 1) ?? '').slice(0, 3);
  const year = dt.getFullYear();
  return `Ran at ${hh}:${mm} (${day} ${monthShort} ${year}) · ${domainLabel} — ${fullQuestion}`;
}

export function ProductionReportsMenu({
  reports,
  activeReportId,
  onSelectReport,
  onDeleteReport,
  onClose,
}: ProductionReportsMenuProps) {
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const onPointerDownOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (asideRef.current?.contains(target)) return;
      if (target.closest('[data-prod-reports-toggle="true"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDownOutside, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDownOutside, true);
    };
  }, [onClose]);

  const items = useMemo<FloatingReportItem[]>(() => {
    const out: FloatingReportItem[] = [];
    for (const rec of reports) {
      const qTurn = rec.turns.find((t) => t.role === 'user');
      const aTurn = [...rec.turns].reverse().find((t) => t.role === 'assistant');
      if (!qTurn) continue;

      const rawAdapter = aTurn?.adapterId ?? qTurn.adapterId;
      if (rawAdapter !== 'gemini' && rawAdapter !== 'fable') continue;

      const runIso = aTurn?.timestamp || qTurn.timestamp || rec.ratedAt || new Date().toISOString();
      const parsedDt = new Date(runIso);
      const safeDt = Number.isNaN(parsedDt.getTime()) ? new Date() : parsedDt;

      const monthNum = getMonthNumberFromName(qTurn.threadMonth) ?? safeDt.getMonth() + 1;
      const month = getMonthNameFromNumber(monthNum) ?? THREAD_MONTHS[safeDt.getMonth()];
      const year =
        typeof qTurn.threadYear === 'number' &&
        Number.isFinite(qTurn.threadYear) &&
        qTurn.threadYear >= 1990 &&
        qTurn.threadYear <= 2090
          ? Math.round(qTurn.threadYear)
          : safeDt.getFullYear();

      const domain = normalizeFloatingDomain(qTurn.promptDomain, rec.relativePath);
      const fullQuestion = (qTurn.content || qTurn.threadName || 'Report').trim();
      const prefix = fullQuestion.replace(/\s+/g, ' ').slice(0, 6).trim();
      const shortLabel = fullQuestion.length > 6 ? `${prefix}...` : prefix || 'Report';
      const domainLabel = getPromptDomainShortLabel(domain);

      out.push({
        record: rec,
        year,
        month,
        monthNum,
        provider: rawAdapter,
        domain,
        shortLabel,
        fullQuestion,
        timeTooltip: formatRunTimeTooltip(runIso, domainLabel, fullQuestion),
        timestampMs: safeDt.getTime(),
      });
    }
    return out;
  }, [reports]);

  // Tree: Year -> Month -> Gemini / Fable -> Domain reports
  const yearGroups = useMemo(() => {
    const byYear = new Map<number, FloatingReportItem[]>();
    for (const item of items) {
      const list = byYear.get(item.year) ?? [];
      list.push(item);
      byYear.set(item.year, list);
    }

    return Array.from(byYear.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, yearItems]) => {
        const byMonth = new Map<string, { monthNum: number; month: string; items: FloatingReportItem[] }>();
        for (const item of yearItems) {
          const existing = byMonth.get(item.month);
          if (existing) {
            existing.items.push(item);
          } else {
            byMonth.set(item.month, {
              monthNum: item.monthNum,
              month: item.month,
              items: [item],
            });
          }
        }
        const months = Array.from(byMonth.values())
          .sort((a, b) => a.monthNum - b.monthNum)
          .map((m) => ({
            ...m,
            gemini: m.items
              .filter((x) => x.provider === 'gemini')
              .sort((a, b) => a.domain.localeCompare(b.domain)),
            fable: m.items
              .filter((x) => x.provider === 'fable')
              .sort((a, b) => a.domain.localeCompare(b.domain)),
          }));
        return { year, months, total: yearItems.length };
      });
  }, [items]);

  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(() => new Set());

  const toggleNode = (key: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <motion.aside
      ref={asideRef}
      aria-label="Production Reports"
      initial={{ x: -24, opacity: 0, scale: 0.98 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: -24, opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="fixed top-[4.25rem] left-3 sm:left-4 z-30 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-8.25rem)] flex flex-col rounded-2xl border border-slate-300/85 bg-[#f2f1ed]/96 backdrop-blur-xl shadow-[0_22px_54px_-12px_rgba(15,23,42,0.28)] text-slate-900 overflow-hidden"
    >
      <div className="flex-1 min-h-0 overflow-y-auto fluent-scroll p-3 space-y-1.5">
        {yearGroups.length === 0 ? (
          <div className="px-3 py-5 text-center text-xs text-slate-600">
            No production reports saved yet. Drop any jumping domain icon into a month bucket to generate one.
          </div>
        ) : (
          yearGroups.map((yg) => {
            const yearKey = `y:${yg.year}`;
            const isYearOpen = !collapsedNodes.has(yearKey);
            return (
              <div key={yearKey} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleNode(yearKey)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs font-bold text-slate-900 hover:bg-slate-900/5 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    {isYearOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <Folder className="w-3.5 h-3.5 text-amber-600" />
                    <span className="tabular-nums">{yg.year}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                    {yg.total}
                  </span>
                </button>

                {isYearOpen && (
                  <div className="pl-3.5 space-y-1">
                    {yg.months.map((mg) => {
                      const monthKey = `m:${yg.year}-${mg.month}`;
                      const isMonthOpen = !collapsedNodes.has(monthKey);
                      return (
                        <div key={monthKey} className="space-y-1">
                          <button
                            type="button"
                            onClick={() => toggleNode(monthKey)}
                            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-900/5 cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              {isMonthOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              <FolderOpen className="w-3.5 h-3.5 text-sky-600" />
                              <span>{mg.month}</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                              {mg.items.length}/10
                            </span>
                          </button>

                          {isMonthOpen && (
                            <div className="pl-3.5 space-y-1">
                              {(
                                [
                                  { id: 'gemini', label: 'Gemini', rows: mg.gemini },
                                  { id: 'fable', label: 'Fable', rows: mg.fable },
                                ] as const
                              ).map((prov) => {
                                const provKey = `p:${yg.year}-${mg.month}-${prov.id}`;
                                const isProvOpen = !collapsedNodes.has(provKey);
                                return (
                                  <div key={provKey} className="space-y-0.5">
                                    <button
                                      type="button"
                                      onClick={() => toggleNode(provKey)}
                                      className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-[11px] font-semibold text-slate-700 hover:bg-slate-900/5 cursor-pointer"
                                    >
                                      <span className="flex items-center gap-1.5">
                                        {isProvOpen ? (
                                          <ChevronDown className="w-3 h-3 text-slate-500" />
                                        ) : (
                                          <ChevronRight className="w-3 h-3 text-slate-500" />
                                        )}
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full ${
                                            prov.id === 'gemini' ? 'bg-sky-600' : 'bg-amber-600'
                                          }`}
                                        />
                                        <span>{prov.label}</span>
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                                        {prov.rows.length}/5
                                      </span>
                                    </button>

                                    {isProvOpen && (
                                      <div className="pl-4 space-y-0.5">
                                        {prov.rows.length === 0 ? (
                                          <div className="px-2 py-1 text-[10px] italic text-slate-500">
                                            Empty
                                          </div>
                                        ) : (
                                          prov.rows.map((entry) => {
                                            const isSelected = activeReportId === entry.record.id;
                                            return (
                                              <div
                                                key={entry.record.id}
                                                className={`group flex items-center gap-1 rounded-lg transition-colors ${
                                                  isSelected
                                                    ? 'bg-sky-600/12 text-sky-950 border border-sky-500/45 shadow-2xs'
                                                    : 'text-slate-800 hover:bg-white/80 border border-transparent'
                                                }`}
                                              >
                                                <button
                                                  type="button"
                                                  title={entry.timeTooltip}
                                                  onClick={() => onSelectReport(entry.record)}
                                                  className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left text-xs cursor-pointer"
                                                >
                                                  <EventCategoryEmblem
                                                    icon={getDomainEmblemIcon(entry.domain)}
                                                    className="w-4 h-4 shrink-0"
                                                  />
                                                  <span className="truncate font-medium">
                                                    {entry.shortLabel}
                                                  </span>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteReport(entry.record.id);
                                                  }}
                                                  aria-label="Delete report"
                                                  title="Delete report"
                                                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100 inline-flex h-6 w-6 mr-1 items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-500/12 transition-all shrink-0 cursor-pointer"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </motion.aside>
  );
}

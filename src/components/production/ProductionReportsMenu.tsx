import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
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
  reportsPathDisplay: string;
  activeReportId?: string | null;
  onSelectReport: (record: RatedThreadRecord) => void;
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
  reportsPathDisplay,
  activeReportId,
  onSelectReport,
  onClose,
}: ProductionReportsMenuProps) {
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
    <div
      role="dialog"
      aria-label="Production Reports"
      className="fixed top-16 left-4 z-40 w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-7.5rem)] flex flex-col rounded-2xl border border-slate-700/80 bg-[#0b1222]/96 backdrop-blur-xl shadow-[0_24px_60px_rgba(2,6,23,0.78)] text-slate-100 overflow-hidden"
    >
      <div className="shrink-0 px-4 py-3 border-b border-slate-800/90 flex items-center justify-between gap-2 bg-[#080d1a]/90">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">
              Reports ({items.length})
            </h2>
          </div>
          <p
            title={reportsPathDisplay}
            className="text-[10px] font-mono text-slate-400 truncate mt-0.5"
          >
            {reportsPathDisplay}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reports menu"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto fluent-scroll p-2.5 space-y-1.5">
        {yearGroups.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-400">
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
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs font-bold text-slate-100 hover:bg-slate-800/70 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    {isYearOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <Folder className="w-3.5 h-3.5 text-amber-400" />
                    <span className="tabular-nums">{yg.year}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums">
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
                            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-sky-200 hover:bg-slate-800/70 cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              {isMonthOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                              )}
                              <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                              <span>{mg.month}</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 tabular-nums">
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
                                      className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-[11px] font-semibold text-slate-300 hover:bg-slate-800/60 cursor-pointer"
                                    >
                                      <span className="flex items-center gap-1.5">
                                        {isProvOpen ? (
                                          <ChevronDown className="w-3 h-3 text-slate-500" />
                                        ) : (
                                          <ChevronRight className="w-3 h-3 text-slate-500" />
                                        )}
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full ${
                                            prov.id === 'gemini' ? 'bg-sky-400' : 'bg-amber-400'
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
                                              <button
                                                key={entry.record.id}
                                                type="button"
                                                title={entry.timeTooltip}
                                                onClick={() => onSelectReport(entry.record)}
                                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                                                  isSelected
                                                    ? 'bg-sky-500/20 text-white border border-sky-400/40'
                                                    : 'text-slate-200 hover:bg-slate-800/80 border border-transparent'
                                                }`}
                                              >
                                                <EventCategoryEmblem
                                                  icon={getDomainEmblemIcon(entry.domain)}
                                                  className="w-4 h-4 shrink-0"
                                                />
                                                <span className="truncate font-medium">
                                                  {entry.shortLabel}
                                                </span>
                                              </button>
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
    </div>
  );
}

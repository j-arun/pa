import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  GripHorizontal,
  Trash2,
  X,
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
  isDarkTheme?: boolean;
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

let savedReportsMenuPosition: { x: number; y: number } | null = null;

function clampMenuPosition(
  pos: { x: number; y: number },
  panelWidth: number,
  panelHeight: number,
): { x: number; y: number } {
  if (typeof window === 'undefined') return pos;
  const maxX = Math.max(8, window.innerWidth - panelWidth - 8);
  const maxY = Math.max(60, window.innerHeight - panelHeight - 40);
  return {
    x: Math.min(maxX, Math.max(8, pos.x)),
    y: Math.min(maxY, Math.max(60, pos.y)),
  };
}

function normalizeFloatingDomain(rawDomain?: string, relPath?: string): PromptDomain {
  if (
    rawDomain === 'astrology' ||
    rawDomain === 'family' ||
    rawDomain === 'finance' ||
    rawDomain === 'general' ||
    rawDomain === 'health' ||
    rawDomain === 'litigation'
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
  isDarkTheme = true,
  onSelectReport,
  onDeleteReport,
  onClose,
}: ProductionReportsMenuProps) {
  const asideRef = useRef<HTMLElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(() =>
    savedReportsMenuPosition,
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    panelWidth: number;
    panelHeight: number;
  } | null>(null);

  useEffect(() => {
    const onResize = () => {
      if (!menuPos || !asideRef.current) return;
      const rect = asideRef.current.getBoundingClientRect();
      const clamped = clampMenuPosition(menuPos, rect.width, rect.height);
      if (clamped.x !== menuPos.x || clamped.y !== menuPos.y) {
        savedReportsMenuPosition = clamped;
        setMenuPos(clamped);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [menuPos]);

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

  // Tree: Chronological starting from current year & current month first (e.g. 2026 Nov/Dec -> 2027 Jan/Feb/Mar...)
  const yearGroups = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;

    const byYear = new Map<number, FloatingReportItem[]>();
    for (const item of items) {
      const list = byYear.get(item.year) ?? [];
      list.push(item);
      byYear.set(item.year, list);
    }

    return Array.from(byYear.entries())
      .sort(([yearA], [yearB]) => {
        const aCurrOrFuture = yearA >= currentYear;
        const bCurrOrFuture = yearB >= currentYear;
        if (aCurrOrFuture !== bCurrOrFuture) {
          return aCurrOrFuture ? -1 : 1;
        }
        if (aCurrOrFuture) {
          return yearA - yearB;
        }
        return yearB - yearA;
      })
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
          .sort((a, b) => {
            if (year === currentYear) {
              const aUpcoming = a.monthNum >= currentMonthNum;
              const bUpcoming = b.monthNum >= currentMonthNum;
              if (aUpcoming !== bUpcoming) {
                return aUpcoming ? -1 : 1;
              }
            }
            return a.monthNum - b.monthNum;
          })
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
      initial={{ x: -18, opacity: 0, scale: 0.98 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: -18, opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      style={menuPos ? { left: menuPos.x, top: menuPos.y } : undefined}
      className={`pa-glass-card fixed z-30 flex flex-col w-[204px] sm:w-[216px] max-w-[calc(100vw-1rem)] max-h-[min(52vh,calc(100vh-8.25rem))] rounded-2xl overflow-hidden transition-colors ${
        menuPos ? '' : 'top-[4.25rem] left-3 sm:left-4'
      }`}
    >
      {/* Movable Drag Bar */}
      <div
        role="presentation"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement | null)?.closest('button')) return;
          if (!asideRef.current) return;
          const rect = asideRef.current.getBoundingClientRect();
          dragRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originLeft: rect.left,
            originTop: rect.top,
            panelWidth: rect.width,
            panelHeight: rect.height,
          };
          setIsDragging(true);
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          const next = clampMenuPosition(
            {
              x: drag.originLeft + (e.clientX - drag.startX),
              y: drag.originTop + (e.clientY - drag.startY),
            },
            drag.panelWidth,
            drag.panelHeight,
          );
          savedReportsMenuPosition = next;
          setMenuPos(next);
        }}
        onPointerUp={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          dragRef.current = null;
          setIsDragging(false);
          e.currentTarget.releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setIsDragging(false);
        }}
        title="Drag to move Reports window"
        className={`shrink-0 flex items-center justify-between gap-2 px-2.5 py-1.5 border-b touch-none select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        } ${
          isDarkTheme
            ? 'border-white/12 bg-white/6 text-slate-200'
            : 'border-white/70 bg-white/55 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <GripHorizontal
            className={`w-3.5 h-3.5 shrink-0 ${
              isDarkTheme ? 'text-slate-300' : 'text-slate-500'
            }`}
          />
          <span className="text-[11px] font-semibold tracking-wide truncate">Reports</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reports window"
          title="Close"
          className={`pa-glass-pill inline-flex h-5 w-5 items-center justify-center rounded-md transition-colors cursor-pointer shrink-0 ${
            isDarkTheme
              ? 'text-slate-300 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Compact Scrollable Tree */}
      <div className="flex-1 min-h-0 overflow-y-auto fluent-scroll p-2 space-y-1">
        {yearGroups.length === 0 ? (
          <div
            className={`pa-glass-subwell rounded-xl px-2 py-4 text-center text-[11px] ${
              isDarkTheme ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            No reports yet.
          </div>
        ) : (
          yearGroups.map((yg) => {
            const yearKey = `y:${yg.year}`;
            const isYearOpen = !collapsedNodes.has(yearKey);
            return (
              <div key={yearKey} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleNode(yearKey)}
                  className={`w-full flex items-center justify-between gap-1.5 px-1.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                    isDarkTheme
                      ? 'text-slate-100 hover:bg-white/10'
                      : 'text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {isYearOpen ? (
                      <ChevronDown
                        className={`w-3 h-3 shrink-0 ${
                          isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      />
                    ) : (
                      <ChevronRight
                        className={`w-3 h-3 shrink-0 ${
                          isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      />
                    )}
                    <Folder
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isDarkTheme ? 'text-amber-400' : 'text-amber-600'
                      }`}
                    />
                    <span className="tabular-nums truncate">{yg.year}</span>
                  </span>
                  <span
                    className={`text-[10px] font-mono tabular-nums shrink-0 ${
                      isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {yg.total}
                  </span>
                </button>

                {isYearOpen && (
                  <div className="pl-2.5 space-y-0.5">
                    {yg.months.map((mg) => {
                      const monthKey = `m:${yg.year}-${mg.month}`;
                      const isMonthOpen = !collapsedNodes.has(monthKey);
                      return (
                        <div key={monthKey} className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => toggleNode(monthKey)}
                            className={`w-full flex items-center justify-between gap-1.5 px-1.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                              isDarkTheme
                                ? 'text-slate-200 hover:bg-white/10'
                                : 'text-slate-800 hover:bg-white/60'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              {isMonthOpen ? (
                                <ChevronDown
                                  className={`w-3 h-3 shrink-0 ${
                                    isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                                  }`}
                                />
                              ) : (
                                <ChevronRight
                                  className={`w-3 h-3 shrink-0 ${
                                    isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                                  }`}
                                />
                              )}
                              <FolderOpen
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isDarkTheme ? 'text-sky-400' : 'text-sky-600'
                                }`}
                              />
                              <span className="truncate">{mg.month}</span>
                            </span>
                            <span
                              className={`text-[10px] font-mono tabular-nums shrink-0 ${
                                isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                              }`}
                            >
                              {mg.items.length}/12
                            </span>
                          </button>

                          {isMonthOpen && (
                            <div className="pl-2.5 space-y-0.5">
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
                                      className={`w-full flex items-center justify-between gap-1.5 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold cursor-pointer transition-colors ${
                                        isDarkTheme
                                          ? 'text-slate-300 hover:bg-white/10'
                                          : 'text-slate-700 hover:bg-white/60'
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5 min-w-0">
                                        {isProvOpen ? (
                                          <ChevronDown
                                            className={`w-2.5 h-2.5 shrink-0 ${
                                              isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                                            }`}
                                          />
                                        ) : (
                                          <ChevronRight
                                            className={`w-2.5 h-2.5 shrink-0 ${
                                              isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                                            }`}
                                          />
                                        )}
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                            prov.id === 'gemini' ? 'bg-sky-500' : 'bg-amber-500'
                                          }`}
                                        />
                                        <span className="truncate">{prov.label}</span>
                                      </span>
                                      <span
                                        className={`text-[9.5px] font-mono tabular-nums shrink-0 ${
                                          isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                                        }`}
                                      >
                                        {prov.rows.length}/6
                                      </span>
                                    </button>

                                    {isProvOpen && (
                                      <div className="pl-2.5 space-y-0.5">
                                        {prov.rows.length === 0 ? (
                                          <div
                                            className={`px-1.5 py-0.5 text-[10px] italic ${
                                              isDarkTheme ? 'text-slate-400/75' : 'text-slate-500'
                                            }`}
                                          >
                                            Empty
                                          </div>
                                        ) : (
                                          prov.rows.map((entry) => {
                                            const isSelected = activeReportId === entry.record.id;
                                            return (
                                              <div
                                                key={entry.record.id}
                                                className={`group flex items-center gap-0.5 rounded-lg border transition-colors ${
                                                  isSelected
                                                    ? isDarkTheme
                                                      ? 'bg-sky-500/20 text-sky-100 border-sky-400/55 shadow-2xs'
                                                      : 'bg-sky-500/15 text-sky-950 border-sky-400/55 shadow-2xs'
                                                    : isDarkTheme
                                                      ? 'text-slate-200 hover:bg-white/10 border-transparent'
                                                      : 'text-slate-800 hover:bg-white/65 border-transparent'
                                                }`}
                                              >
                                                <button
                                                  type="button"
                                                  title={entry.timeTooltip}
                                                  onClick={() => onSelectReport(entry.record)}
                                                  className="flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1 text-left text-[11px] cursor-pointer"
                                                >
                                                  <EventCategoryEmblem
                                                    icon={getDomainEmblemIcon(entry.domain)}
                                                    className="w-3.5 h-3.5 shrink-0"
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
                                                  className={`opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100 inline-flex h-5 w-5 mr-0.5 items-center justify-center rounded-md transition-all shrink-0 cursor-pointer ${
                                                    isDarkTheme
                                                      ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/15'
                                                      : 'text-slate-400 hover:text-rose-600 hover:bg-rose-500/12'
                                                  }`}
                                                >
                                                  <Trash2 className="w-3 h-3" />
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

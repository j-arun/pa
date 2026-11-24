import {
  Bot,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Folder,
  FolderInput,
  FolderOpen,
  Loader2,
  Lock,
  MessageSquareText,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnyAdapterId,
  PromptDomain,
  RatedThreadRecord,
} from '../types/workbench';
import { EventCategoryEmblem, getDomainEmblemIcon } from './DomainEmblem';
import {
  getMonthNameFromNumber,
  getMonthNumberFromName,
  getPromptDomainShortLabel,
  THREAD_MONTHS,
  THREAD_YEARS,
} from '../utils/promptTemplates';

export interface ReportMoveTarget {
  threadMonth: string;
  threadYear: number;
  promptDomain: PromptDomain;
  adapterId: AnyAdapterId;
}

interface ReportTreeSidebarProps {
  reports: RatedThreadRecord[];
  activeReportId: string | null;
  activePeriodMonth?: number;
  activePeriodYear?: number;
  syncingReportIds?: Record<string, boolean>;
  syncedReportIds?: Record<string, boolean>;
  onSelectReport: (recordId: string) => void;
  onSyncReport: (recordId: string) => void;
  onRenameReport: (recordId: string, newName: string) => void;
  onUpdateComment: (recordId: string, comment: string) => void;
  onMoveReport: (recordId: string, target: ReportMoveTarget) => void;
  onDeleteReport: (recordId: string) => void;
  onDeleteFolderReports: (recordIds: string[], folderLabel: string) => void;
}

const TREE_DOMAINS: ReadonlyArray<{
  domain: PromptDomain;
  label: string;
}> = [
  { domain: 'general', label: 'Love' },
  { domain: 'astrology', label: 'Career' },
  { domain: 'family', label: 'Family' },
  { domain: 'finance', label: 'Finance' },
  { domain: 'health', label: 'Health' },
  { domain: 'litigation', label: 'Litigation' },
];

const TREE_ADAPTERS: ReadonlyArray<{
  adapterId: AnyAdapterId;
  label: string;
  isPrivate: boolean;
}> = [
  { adapterId: 'ollama', label: 'Local', isPrivate: true },
  { adapterId: 'fable', label: 'Fable', isPrivate: false },
  { adapterId: 'gemini', label: 'Gemini', isPrivate: false },
  { adapterId: 'claude', label: 'Sonnet', isPrivate: false },
  { adapterId: 'chatgpt', label: 'ChatGPT', isPrivate: false },
];

function formatRunDatePart(date: Date): string {
  const monthShort = date.toLocaleString('en-US', { month: 'short' });
  const day = String(date.getDate()).padStart(2, '0');
  const yr = date.getFullYear();
  return `${monthShort} ${day}, ${yr}`;
}

function formatRunTimePart(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeRecordPlacement(record: RatedThreadRecord): {
  year: number;
  month: string;
  monthNum: number;
  periodKey: string;
  domain: PromptDomain;
  domainLabel: string;
  adapterId: AnyAdapterId;
  isPublic: boolean;
  title: string;
  comment: string;
  ratingStars: string;
  runDateLabel: string;
  runTimeLabel: string;
  runTimestampMs: number;
} {
  const qTurn = record.turns.find((t) => t.role === 'user');
  const assistantTurn = [...record.turns].reverse().find((t) => t.role === 'assistant');
  const runIso = qTurn?.timestamp || assistantTurn?.timestamp || record.ratedAt || new Date().toISOString();
  const parsedDate = new Date(runIso);
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  const monthNum =
    getMonthNumberFromName(qTurn?.threadMonth) ?? safeDate.getMonth() + 1;
  const month = getMonthNameFromNumber(monthNum) ?? THREAD_MONTHS[safeDate.getMonth()];
  const year =
    typeof qTurn?.threadYear === 'number' &&
    Number.isFinite(qTurn.threadYear) &&
    qTurn.threadYear >= 1990 &&
    qTurn.threadYear <= 2090
      ? Math.round(qTurn.threadYear)
      : safeDate.getFullYear();

  const periodKey = `${year}-${String(monthNum).padStart(2, '0')}`;

  let domain: PromptDomain =
    qTurn?.promptDomain === 'astrology' ||
    qTurn?.promptDomain === 'family' ||
    qTurn?.promptDomain === 'finance' ||
    qTurn?.promptDomain === 'general' ||
    qTurn?.promptDomain === 'health' ||
    qTurn?.promptDomain === 'litigation'
      ? qTurn.promptDomain
      : 'astrology';
  if (
    domain === 'finance' &&
    typeof record.relativePath === 'string' &&
    /(?:^|\/)family(?:\/|$)/i.test(record.relativePath)
  ) {
    domain = 'family';
  }

  const rawAdapter = assistantTurn?.adapterId ?? qTurn?.adapterId;
  const rawScope = qTurn?.scope ?? assistantTurn?.scope ?? 'public';
  const adapterId: AnyAdapterId =
    rawAdapter === 'ollama' ||
    rawAdapter === 'fable' ||
    rawAdapter === 'gemini' ||
    rawAdapter === 'claude' ||
    rawAdapter === 'chatgpt'
      ? rawAdapter
      : rawScope === 'private'
        ? 'ollama'
        : 'gemini';

  const isPublic = adapterId !== 'ollama' && rawScope !== 'private';
  const title = qTurn?.threadName?.trim() || 'Report';
  const comment = (record.comment ?? qTurn?.threadComment ?? '').trim();
  const ratingStars =
    qTurn?.threadRating === 'red'
      ? '★'
      : qTurn?.threadRating === 'yellow'
        ? '★★'
        : qTurn?.threadRating === 'green'
          ? '★★★'
          : '';

  return {
    year,
    month,
    monthNum,
    periodKey,
    domain,
    domainLabel: getPromptDomainShortLabel(domain),
    adapterId,
    isPublic,
    title,
    comment,
    ratingStars,
    runDateLabel: formatRunDatePart(safeDate),
    runTimeLabel: formatRunTimePart(safeDate),
    runTimestampMs: safeDate.getTime(),
  };
}

export function ReportTreeSidebar({
  reports,
  activeReportId,
  activePeriodMonth,
  activePeriodYear,
  syncingReportIds = {},
  syncedReportIds = {},
  onSelectReport,
  onSyncReport,
  onRenameReport,
  onUpdateComment,
  onMoveReport,
  onDeleteReport,
  onDeleteFolderReports,
}: ReportTreeSidebarProps) {
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [expandedAdapters, setExpandedAdapters] = useState<Record<string, boolean>>({});
  const [confirmDeleteFolderKey, setConfirmDeleteFolderKey] = useState<string | null>(null);

  const [draggedReportId, setDraggedReportId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    recordId: string;
    x: number;
    y: number;
  } | null>(null);

  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState('');
  const commentInputRef = useRef<HTMLInputElement | null>(null);

  const [moveModalRecordId, setMoveModalRecordId] = useState<string | null>(null);
  const [moveMonth, setMoveMonth] = useState<string>('December');
  const [moveYear, setMoveYear] = useState<number>(2026);
  const [moveDomain, setMoveDomain] = useState<PromptDomain>('astrology');
  const [moveAdapter, setMoveAdapter] = useState<AnyAdapterId>('gemini');

  type NormalizedEntry = {
    record: RatedThreadRecord;
    meta: ReturnType<typeof normalizeRecordPlacement>;
  };

  const yearGroups = useMemo(() => {
    const yearMap = new Map<
      number,
      Map<
        string,
        {
          periodKey: string;
          year: number;
          month: string;
          monthNum: number;
          items: NormalizedEntry[];
        }
      >
    >();

    const ensurePeriod = (year: number, monthNum: number, monthName: string) => {
      let monthsForYear = yearMap.get(year);
      if (!monthsForYear) {
        monthsForYear = new Map();
        yearMap.set(year, monthsForYear);
      }
      const periodKey = `${year}-${String(monthNum).padStart(2, '0')}`;
      let monthBucket = monthsForYear.get(periodKey);
      if (!monthBucket) {
        monthBucket = {
          periodKey,
          year,
          month: monthName,
          monthNum,
          items: [],
        };
        monthsForYear.set(periodKey, monthBucket);
      }
      return monthBucket;
    };

    for (const record of reports) {
      const meta = normalizeRecordPlacement(record);
      const bucket = ensurePeriod(meta.year, meta.monthNum, meta.month);
      bucket.items.push({ record, meta });
    }

    if (
      activePeriodMonth &&
      activePeriodYear &&
      activePeriodYear >= 1990 &&
      activePeriodYear <= 2090
    ) {
      const activeMonthName = getMonthNameFromNumber(activePeriodMonth);
      if (activeMonthName) {
        ensurePeriod(activePeriodYear, activePeriodMonth, activeMonthName);
      }
    }

    return Array.from(yearMap.entries())
      .sort(([yA], [yB]) => yB - yA)
      .map(([year, monthsMap]) => {
        const months = Array.from(monthsMap.values())
          .sort((a, b) => b.monthNum - a.monthNum)
          .map((m) => ({
            ...m,
            items: [...m.items].sort(
              (a, b) => b.meta.runTimestampMs - a.meta.runTimestampMs,
            ),
          }));
        const total = months.reduce((sum, m) => sum + m.items.length, 0);
        return { year, months, total };
      });
  }, [activePeriodMonth, activePeriodYear, reports]);

  // Auto-expand newest / active year & month on initial load
  useEffect(() => {
    if (yearGroups.length === 0) return;
    const firstYear = yearGroups[0];
    setExpandedYears((prev) =>
      Object.keys(prev).length > 0 ? prev : { [firstYear.year]: true },
    );
    if (firstYear.months.length > 0) {
      setExpandedMonths((prev) =>
        Object.keys(prev).length > 0
          ? prev
          : { [firstYear.months[0].periodKey]: true },
      );
    }
  }, [yearGroups]);

  // Expand folders containing the active report
  useEffect(() => {
    if (!activeReportId) return;
    const target = reports.find((r) => r.id === activeReportId);
    if (!target) return;
    const meta = normalizeRecordPlacement(target);
    const adapterKey = `${meta.periodKey}::${meta.adapterId}`;
    setExpandedYears((prev) => ({ ...prev, [meta.year]: true }));
    setExpandedMonths((prev) => ({ ...prev, [meta.periodKey]: true }));
    setExpandedAdapters((prev) => ({ ...prev, [adapterKey]: true }));
  }, [activeReportId, reports]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    const onKeyDown = (e: globalThis.KeyboardEvent | Event) => {
      if ('key' in e && e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (editingNameId) {
      window.requestAnimationFrame(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      });
    }
  }, [editingNameId]);

  useEffect(() => {
    if (editingCommentId) {
      window.requestAnimationFrame(() => {
        commentInputRef.current?.focus();
        commentInputRef.current?.select();
      });
    }
  }, [editingCommentId]);

  const openMoveModal = (recordId: string) => {
    const target = reports.find((r) => r.id === recordId);
    if (!target) return;
    const meta = normalizeRecordPlacement(target);
    setMoveMonth(meta.month);
    setMoveYear(meta.year);
    setMoveDomain(meta.domain);
    setMoveAdapter(meta.adapterId);
    setMoveModalRecordId(recordId);
    setContextMenu(null);
  };

  const handleDropOnAdapter = (
    e: React.DragEvent,
    targetYear: number,
    targetMonth: string,
    targetAdapterId: AnyAdapterId,
    adapterKey: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const recordId =
      draggedReportId || e.dataTransfer.getData('text/plain');
    setDropTargetKey(null);
    setDraggedReportId(null);
    if (!recordId) return;

    const existing = reports.find((r) => r.id === recordId);
    const existingDomain = existing
      ? normalizeRecordPlacement(existing).domain
      : 'astrology';

    onMoveReport(recordId, {
      threadMonth: targetMonth,
      threadYear: targetYear,
      promptDomain: existingDomain,
      adapterId: targetAdapterId,
    });
    const periodKey = `${targetYear}-${String(
      getMonthNumberFromName(targetMonth) ?? 1,
    ).padStart(2, '0')}`;
    setExpandedYears((prev) => ({ ...prev, [targetYear]: true }));
    setExpandedMonths((prev) => ({ ...prev, [periodKey]: true }));
    setExpandedAdapters((prev) => ({ ...prev, [adapterKey]: true }));
  };

  const commitNameEdit = (recordId: string) => {
    const trimmed = editingNameValue.trim();
    setEditingNameId(null);
    setEditingNameValue('');
    if (trimmed) {
      onRenameReport(recordId, trimmed);
    }
  };

  const commitCommentEdit = (recordId: string) => {
    const trimmed = editingCommentValue.trim();
    setEditingCommentId(null);
    setEditingCommentValue('');
    onUpdateComment(recordId, trimmed);
  };

  return (
    <>
      <div
        aria-label="Reports Folder Tree"
        className="flex-1 min-h-0 overflow-y-auto fluent-scroll space-y-1.5 pr-0.5"
      >
        {yearGroups.map((yg) => {
          const isYearExpanded = Boolean(expandedYears[yg.year]);

          return (
            <div key={yg.year} className="space-y-0.5">
              {/* Level 1: Year Folder */}
              <button
                type="button"
                onClick={() =>
                  setExpandedYears((prev) => ({
                    ...prev,
                    [yg.year]: !prev[yg.year],
                  }))
                }
                aria-expanded={isYearExpanded}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-white/75 dark:hover:bg-slate-800/75 transition-colors text-left cursor-pointer"
              >
                {isYearExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
                {isYearExpanded ? (
                  <FolderOpen
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--pa-accent)' }}
                  />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-amber-500/90 dark:text-amber-400/90 shrink-0" />
                )}
                <span className="truncate flex-1 tabular-nums">{yg.year}</span>
                {yg.total > 0 && (
                  <span className="rounded-full bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                    {yg.total}
                  </span>
                )}
              </button>

              {/* Level 2: Month Folders */}
              {isYearExpanded && (
                <div className="pl-3 space-y-0.5 border-l border-slate-200/80 dark:border-slate-800 ml-3.5">
                  {yg.months.map((mg) => {
                    const isMonthExpanded = Boolean(expandedMonths[mg.periodKey]);

                    return (
                      <div key={mg.periodKey} className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMonths((prev) => ({
                              ...prev,
                              [mg.periodKey]: !prev[mg.periodKey],
                            }))
                          }
                          aria-expanded={isMonthExpanded}
                          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/70 transition-colors text-left cursor-pointer"
                        >
                          {isMonthExpanded ? (
                            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                          {isMonthExpanded ? (
                            <FolderOpen className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                          ) : (
                            <Folder className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                          )}
                          <span className="truncate flex-1">{mg.month}</span>
                          {mg.items.length > 0 && (
                            <span className="rounded-full bg-sky-100/90 dark:bg-sky-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300 tabular-nums shrink-0">
                              {mg.items.length}
                            </span>
                          )}
                        </button>

                        {/* Level 3: Adapter Folders (Local, Fable, Gemini, Sonnet, ChatGPT) */}
                        {isMonthExpanded && (
                          <div className="pl-3 space-y-0.5 border-l border-slate-200/70 dark:border-slate-800/80 ml-3">
                            {TREE_ADAPTERS.map(({ adapterId, label: adapterLabel, isPrivate }) => {
                              const adapterKey = `${mg.periodKey}::${adapterId}`;
                              const adapterItems = mg.items.filter(
                                (entry) => entry.meta.adapterId === adapterId,
                              );
                              const isAdapterExpanded = Boolean(
                                expandedAdapters[adapterKey],
                              );
                              const isDropHover = dropTargetKey === adapterKey;
                              const isConfirmingFolderDelete =
                                confirmDeleteFolderKey === adapterKey;

                              return (
                                <div key={adapterKey} className="space-y-0.5">
                                  <div
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      if (dropTargetKey !== adapterKey) {
                                        setDropTargetKey(adapterKey);
                                      }
                                    }}
                                    onDragLeave={() => {
                                      if (dropTargetKey === adapterKey) {
                                        setDropTargetKey(null);
                                      }
                                    }}
                                    onDrop={(e) =>
                                      handleDropOnAdapter(
                                        e,
                                        yg.year,
                                        mg.month,
                                        adapterId,
                                        adapterKey,
                                      )
                                    }
                                    className={`group flex items-center gap-1 rounded-lg pr-1 transition-all ${
                                      isDropHover
                                        ? 'bg-sky-100 dark:bg-sky-900/60 ring-1 ring-sky-400 text-sky-900 dark:text-sky-100'
                                        : isPrivate
                                          ? 'text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/55'
                                          : 'text-slate-700 dark:text-slate-200 hover:bg-white/75 dark:hover:bg-slate-800/75'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedAdapters((prev) => ({
                                          ...prev,
                                          [adapterKey]: !prev[adapterKey],
                                        }))
                                      }
                                      aria-expanded={isAdapterExpanded}
                                      className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 text-[11.5px] text-left cursor-pointer"
                                    >
                                      {isAdapterExpanded ? (
                                        <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                                      )}
                                      {isPrivate ? (
                                        <Lock className="w-3 h-3 text-emerald-600/80 dark:text-emerald-400/80 shrink-0" />
                                      ) : adapterId === 'gemini' ? (
                                        <Sparkles className="w-3 h-3 text-sky-500 shrink-0" />
                                      ) : adapterId === 'chatgpt' ? (
                                        <Bot className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                                      ) : (
                                        <Cloud className="w-3 h-3 text-indigo-500 dark:text-indigo-400 shrink-0" />
                                      )}
                                      <span className="truncate flex-1 font-medium">
                                        {adapterLabel}
                                      </span>
                                      <span
                                        className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums shrink-0 ${
                                          adapterItems.length > 0
                                            ? 'bg-slate-200/85 dark:bg-slate-700/85 font-semibold text-slate-700 dark:text-slate-200'
                                            : 'text-slate-400 dark:text-slate-600'
                                        }`}
                                      >
                                        {adapterItems.length}
                                      </span>
                                    </button>

                                    {adapterItems.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConfirmDeleteFolderKey((prev) =>
                                            prev === adapterKey ? null : adapterKey,
                                          );
                                        }}
                                        aria-label={`Delete all ${adapterLabel} reports in ${mg.month} ${yg.year}`}
                                        title={`Delete all ${adapterItems.length} ${adapterLabel} report${adapterItems.length === 1 ? '' : 's'}`}
                                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/12 transition-all shrink-0 cursor-pointer"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>

                                  {isConfirmingFolderDelete && adapterItems.length > 0 && (
                                    <div className="ml-3 mr-1 px-2 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/90 dark:bg-rose-950/50 flex items-center justify-between gap-1.5 text-[10.5px]">
                                      <span className="font-medium text-rose-800 dark:text-rose-200 truncate">
                                        Delete {adapterItems.length} {adapterLabel}?
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const ids = adapterItems.map(
                                              (entry) => entry.record.id,
                                            );
                                            setConfirmDeleteFolderKey(null);
                                            onDeleteFolderReports(
                                              ids,
                                              `${adapterLabel} (${mg.month} ${yg.year})`,
                                            );
                                          }}
                                          className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
                                        >
                                          Delete
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteFolderKey(null)}
                                          className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800 cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Level 4: Domain Reports inside Adapter Folder ([Icon] - [Run Date] - [Run Time]) */}
                                  {isAdapterExpanded && (
                                    <div className="pl-2.5 space-y-0.5 border-l border-slate-200/60 dark:border-slate-800/70 ml-2.5">
                                      {adapterItems.length === 0 ? (
                                        <div className="px-2 py-1 text-[10.5px] italic text-slate-400 dark:text-slate-600">
                                          No reports yet
                                        </div>
                                      ) : (
                                        adapterItems.map(({ record, meta }, runIdx) => {
                                          const isActive = activeReportId === record.id;
                                          const isEditingName = editingNameId === record.id;
                                          const isEditingComment = editingCommentId === record.id;
                                          const isSyncing = Boolean(syncingReportIds[record.id]);
                                          const isSynced = Boolean(syncedReportIds[record.id]);
                                          const fallbackRunTitle =
                                            meta.title || `Report ${runIdx + 1}`;
                                          const formattedLabel = `${meta.runDateLabel} - ${meta.runTimeLabel}`;

                                          if (isEditingName) {
                                            return (
                                              <div
                                                key={record.id}
                                                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-sky-400 dark:border-sky-500 shadow-xs"
                                              >
                                                <input
                                                  ref={nameInputRef}
                                                  type="text"
                                                  value={editingNameValue}
                                                  aria-label="Edit report name"
                                                  onChange={(e) =>
                                                    setEditingNameValue(e.target.value)
                                                  }
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      e.preventDefault();
                                                      commitNameEdit(record.id);
                                                    } else if (e.key === 'Escape') {
                                                      e.preventDefault();
                                                      setEditingNameId(null);
                                                      setEditingNameValue('');
                                                    }
                                                  }}
                                                  onBlur={() => commitNameEdit(record.id)}
                                                  className="w-full bg-transparent text-[11.5px] font-medium text-slate-900 dark:text-white focus:outline-none"
                                                />
                                              </div>
                                            );
                                          }

                                          return (
                                            <div key={record.id} className="space-y-0.5">
                                              <div
                                                className={`group flex items-center gap-0.5 rounded-lg transition-all ${
                                                  isActive
                                                    ? 'bg-white dark:bg-slate-800 shadow-xs border border-slate-200/90 dark:border-slate-700'
                                                    : meta.isPublic
                                                      ? 'bg-white/45 dark:bg-slate-800/35 hover:bg-white/85 dark:hover:bg-slate-800/80 border border-transparent'
                                                      : 'hover:bg-white/60 dark:hover:bg-slate-800/60 border border-transparent'
                                                }`}
                                              >
                                                <button
                                                  type="button"
                                                  draggable
                                                  onDragStart={(e) => {
                                                    setDraggedReportId(record.id);
                                                    e.dataTransfer.setData(
                                                      'text/plain',
                                                      record.id,
                                                    );
                                                    e.dataTransfer.effectAllowed = 'move';
                                                  }}
                                                  onDragEnd={() => {
                                                    setDraggedReportId(null);
                                                    setDropTargetKey(null);
                                                  }}
                                                  onClick={() => {
                                                    setContextMenu(null);
                                                    onSelectReport(record.id);
                                                  }}
                                                  onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setContextMenu({
                                                      recordId: record.id,
                                                      x: Math.min(
                                                        e.clientX,
                                                        window.innerWidth - 220,
                                                      ),
                                                      y: Math.min(
                                                        e.clientY,
                                                        window.innerHeight - 210,
                                                      ),
                                                    });
                                                  }}
                                                  title={
                                                    meta.comment
                                                      ? `${meta.domainLabel} · ${fallbackRunTitle}\nRan: ${formattedLabel}\nNote: ${meta.comment}\n(Right-click for options; drag to move)`
                                                      : `${meta.domainLabel} · ${fallbackRunTitle}\nRan: ${formattedLabel}\n(Right-click for options; drag to move)`
                                                  }
                                                  className={`flex-1 min-w-0 flex flex-col px-2 py-1.5 text-left cursor-pointer ${
                                                    meta.isPublic
                                                      ? 'font-medium text-slate-800 dark:text-slate-100'
                                                      : 'font-normal text-slate-500 dark:text-slate-400 opacity-75 hover:opacity-100'
                                                  } ${isActive ? '!opacity-100' : ''}`}
                                                >
                                                  <div className="flex items-center gap-1 min-w-0 w-full text-[11px] tabular-nums">
                                                    <EventCategoryEmblem
                                                      icon={getDomainEmblemIcon(meta.domain)}
                                                      className="w-3.5 h-3.5 shrink-0"
                                                    />
                                                    <span className="text-slate-400 dark:text-slate-500 shrink-0">
                                                      -
                                                    </span>
                                                    <span className="truncate flex-1">
                                                      {formattedLabel}
                                                    </span>
                                                    {meta.ratingStars && (
                                                      <span
                                                        className="text-amber-500 dark:text-amber-400 shrink-0 text-[9.5px]"
                                                        aria-hidden="true"
                                                      >
                                                        {meta.ratingStars}
                                                      </span>
                                                    )}
                                                  </div>
                                                  {meta.comment && !isEditingComment && (
                                                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 truncate w-full">
                                                      <MessageSquareText className="w-2.5 h-2.5 shrink-0 opacity-75" />
                                                      <span className="truncate">
                                                        {meta.comment}
                                                      </span>
                                                    </div>
                                                  )}
                                                </button>

                                                <div className="flex items-center gap-0.5 pr-1 shrink-0">
                                                  <button
                                                    type="button"
                                                    disabled={isSyncing}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      onSyncReport(record.id);
                                                    }}
                                                    aria-label={`Sync ${meta.domainLabel} report to Calendar and Reminders`}
                                                    title={
                                                      isSyncing
                                                        ? 'Syncing WatchOut & Event Cards…'
                                                        : isSynced
                                                          ? 'Synced to Calendar & Reminders (click to re-sync)'
                                                          : 'Sync WatchOut to Calendar & Event Cards to Reminders'
                                                    }
                                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-md transition-all shrink-0 cursor-pointer ${
                                                      isSyncing || isSynced
                                                        ? 'opacity-100'
                                                        : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100'
                                                    } ${
                                                      isSynced
                                                        ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
                                                        : 'text-sky-600 dark:text-sky-400 hover:bg-sky-500/15'
                                                    }`}
                                                  >
                                                    {isSyncing ? (
                                                      <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : isSynced ? (
                                                      <Check className="w-3 h-3" />
                                                    ) : (
                                                      <CalendarPlus className="w-3 h-3" />
                                                    )}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      onDeleteReport(record.id);
                                                    }}
                                                    aria-label="Delete report"
                                                    title="Delete report"
                                                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/15 transition-all shrink-0 cursor-pointer"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              </div>

                                              {isEditingComment && (
                                                <div className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-sky-400 dark:border-sky-500 shadow-xs">
                                                  <input
                                                    ref={commentInputRef}
                                                    type="text"
                                                    value={editingCommentValue}
                                                    placeholder="Add note / why rerun…"
                                                    aria-label="Edit report comment"
                                                    onChange={(e) =>
                                                      setEditingCommentValue(e.target.value)
                                                    }
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        commitCommentEdit(record.id);
                                                      } else if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        setEditingCommentId(null);
                                                        setEditingCommentValue('');
                                                      }
                                                    }}
                                                    onBlur={() => commitCommentEdit(record.id)}
                                                    className="w-full bg-transparent text-[11px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                                                  />
                                                </div>
                                              )}
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
        })}
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          role="menu"
          aria-label="Report actions"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed z-50 w-56 rounded-xl border border-slate-200/90 dark:border-slate-700/90 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-xl p-1.5 space-y-0.5"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const id = contextMenu.recordId;
              setContextMenu(null);
              onSyncReport(id);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors text-left cursor-pointer"
          >
            <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
            <span>Sync to Calendar &amp; Reminders</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const target = reports.find((r) => r.id === contextMenu.recordId);
              const qTurn = target?.turns.find((t) => t.role === 'user');
              setEditingNameId(contextMenu.recordId);
              setEditingNameValue(qTurn?.threadName?.trim() || '');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span>Edit Name</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const target = reports.find((r) => r.id === contextMenu.recordId);
              const qTurn = target?.turns.find((t) => t.role === 'user');
              setEditingCommentId(contextMenu.recordId);
              setEditingCommentValue(
                target?.comment ?? qTurn?.threadComment ?? '',
              );
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
          >
            <MessageSquareText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span>Add / Edit Comment</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => openMoveModal(contextMenu.recordId)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
          >
            <FolderInput className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span>Move to Folder…</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const id = contextMenu.recordId;
              setContextMenu(null);
              onDeleteReport(id);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors text-left cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Move Existing Report Modal */}
      {moveModalRecordId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Move report to folder"
          onClick={() => setMoveModalRecordId(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-4"
          >
            <div className="space-y-1">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Move Report to Folder
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Updates the sidebar tree and moves the HTML file on disk.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Year</span>
                <select
                  value={moveYear}
                  onChange={(e) => setMoveYear(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  {THREAD_YEARS.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Month</span>
                <select
                  value={moveMonth}
                  onChange={(e) => setMoveMonth(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  {THREAD_MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Domain</span>
                <select
                  value={moveDomain}
                  onChange={(e) => setMoveDomain(e.target.value as PromptDomain)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  {TREE_DOMAINS.map((d) => (
                    <option key={d.domain} value={d.domain}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Engine / Adapter</span>
                <select
                  value={moveAdapter}
                  onChange={(e) => setMoveAdapter(e.target.value as AnyAdapterId)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  {TREE_ADAPTERS.map((a) => (
                    <option key={a.adapterId} value={a.adapterId}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMoveModalRecordId(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = moveModalRecordId;
                  setMoveModalRecordId(null);
                  onMoveReport(id, {
                    threadMonth: moveMonth,
                    threadYear: moveYear,
                    promptDomain: moveDomain,
                    adapterId: moveAdapter,
                  });
                }}
                className="px-3.5 py-1.5 rounded-xl bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] text-xs font-semibold text-white cursor-pointer"
              >
                Move Report
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

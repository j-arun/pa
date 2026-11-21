import {
  Check,
  Cloud,
  Copy,
  FolderOpen,
  Home,
  Lock,
  PanelLeft,
  PanelRight,
  Settings,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContextMonitorRail } from './components/ContextMonitorRail';
import { ReportDocumentPage } from './components/ReportDocumentPage';
import {
  ReportTreeSidebar,
  type ReportMoveTarget,
} from './components/ReportTreeSidebar';
import { SettingsPage } from './components/SettingsPage';
import { WhatsAppSymbol } from './components/WhatsAppSymbol';
import {
  WorkbenchPage,
  formatProviderErrorDetail,
  getEventRatingSortScore,
  type SendThreadMessagePayload,
  type ThreadMetadataPatch,
} from './components/WorkbenchPage';
import { ProductionCards3D } from './components/production/ProductionCards3D';
import { ProductionReportsMenu } from './components/production/ProductionReportsMenu';
import { ProductionStage1Three } from './components/production/ProductionStage1Three';
import { ProductionTimelinePanel } from './components/production/ProductionTimelinePanel';
import { useSpeechIO } from './hooks/useSpeechIO';
import type {
  AnyAdapterId,
  CarefulDateItem,
  ConversationScope,
  ConversationTurn,
  EventCardItem,
  LlmContextLogEntry,
  LlmContextTelemetry,
  PromptDomain,
  PublicAdapterId,
  RatedThreadRecord,
  WorkbenchSettings,
} from './types/workbench';
import {
  DEFAULT_SETTINGS,
  PROD_RATED_THREADS_KEY,
  loadRatedThreads,
  loadScope,
  loadSettings,
  saveConversation,
  saveRatedThreads,
  saveScope,
  saveSettings,
} from './utils/storage';
import {
  estimateTokens,
  formatShortYearMonth,
  getDomainQueryValue,
  getMonthNameFromNumber,
  getMonthNumberFromName,
  hasCustomPromptTemplates,
} from './utils/promptTemplates';
import {
  EVENT_EXTRACTION_SYSTEM_DIRECTIVE,
  buildThreadHtmlDocument,
  extractCarefulDatesFromHtml,
  extractReadOutSections,
  normalizeEventCardItem,
  parseResponseEventsAndReport,
  sanitizeCarefulDateItem,
  type ThreadHtmlExchangeInput,
} from './utils/eventParser';
import {
  playReplyChime,
  requestDesktopNotificationPermission,
  showDesktopNotification,
} from './utils/notify';
import { fetchReferenceContextFromApi } from './utils/referenceContextFetch';
import { parseMarkdownReportImport } from './utils/markdownImport';

const IS_PRODUCTION_APP =
  import.meta.env.PROD ||
  (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('mode') === 'production');

function appendCachedContext(
  instruction: string,
  cachedContext: string,
  existingContent: string[],
): string {
  const normalizedInstruction = instruction.trim();
  const normalizedContext = cachedContext.trim();
  if (
    !normalizedContext ||
    normalizedInstruction.includes(normalizedContext) ||
    existingContent.some((content) => content.includes(normalizedContext))
  ) {
    return normalizedInstruction;
  }
  return [normalizedInstruction, normalizedContext].filter(Boolean).join('\n\n');
}

function buildExchangesFromTurns(threadTurns: ConversationTurn[]): ThreadHtmlExchangeInput[] {
  const grouped: ThreadHtmlExchangeInput[] = [];
  const byId = new Map<string, ThreadHtmlExchangeInput>();
  let current: ThreadHtmlExchangeInput | null = null;

  for (const turn of threadTurns) {
    if (turn.role === 'user') {
      current = {
        question: turn.content,
        replies: [],
        askedAt: turn.timestamp,
      };
      grouped.push(current);
      byId.set(turn.id, current);
    } else {
      const target = turn.exchangeId ? byId.get(turn.exchangeId) : current;
      if (target) {
        target.replies.push(turn);
      }
    }
  }
  return grouped;
}

export default function App() {
  const isProductionApp = IS_PRODUCTION_APP;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeReportExchangeId, setActiveReportExchangeId] = useState<string | null>(null);
  const [scope, setScope] = useState<ConversationScope>(() =>
    IS_PRODUCTION_APP ? 'public' : loadScope(),
  );
  const [settings, setSettings] = useState<WorkbenchSettings>(() => loadSettings());
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [ratedThreads, setRatedThreads] = useState<RatedThreadRecord[]>(() =>
    loadRatedThreads(IS_PRODUCTION_APP ? PROD_RATED_THREADS_KEY : undefined).map((rec) => ({
      ...rec,
      isFinalized: true,
    })),
  );
  const activePromptDomain = settings.promptBuilder.activeDomain;
  const [isSending, setIsSending] = useState(false);
  const [configFileInfo, setConfigFileInfo] = useState<{
    filePath: string;
    platform: string;
    lastSavedAt?: string;
    syncError?: string;
    defaultReportsDir?: string;
    resolvedReportsDir?: string;
    productionReportsDir?: string;
    promptFiles?: Record<PromptDomain, string>;
  }>({
    filePath: 'workbench.config.json',
    platform: 'unknown',
  });
  const configHydratedRef = useRef(false);
  const reportsHydratedRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const userEditedPromptsRef = useRef(false);
  const skipNextAutoPersistRef = useRef(false);
  const persistDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyToastTimerRef = useRef<number | null>(null);
  const mdFileInputRef = useRef<HTMLInputElement | null>(null);
  const promptCopiedTimerRef = useRef<number | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [lastSentPrompt, setLastSentPrompt] = useState<{
    exchangeId: string;
    text: string;
  } | null>(null);
  const activeRequestAbortRef = useRef<{
    exchangeId: string;
    controller: AbortController;
  } | null>(null);
  const [replyToast, setReplyToast] = useState<{
    title: string;
    preview: string;
    isError: boolean;
  } | null>(null);
  const [isLeftRailOpen, setIsLeftRailOpen] = useState(true);
  const [isContextRailOpen, setIsContextRailOpen] = useState(false);
  const [isProdReportsMenuOpen, setIsProdReportsMenuOpen] = useState(false);
  const [prodReportsDirDisplay, setProdReportsDirDisplay] = useState('D:/whatsup/reports');
  const [isChatBarOpen, setIsChatBarOpen] = useState(false);
  const [switchingMonthKey, setSwitchingMonthKey] = useState<string | null>(null);
  const [monthSwitchError, setMonthSwitchError] = useState<string | null>(null);
  const [leftRailWidth, setLeftRailWidth] = useState<number>(() => {
    const raw = Number(window.localStorage.getItem('pa_left_rail_width'));
    return Number.isFinite(raw) && raw >= 168 && raw <= 380 ? raw : 224;
  });
  const [rightRailWidth, setRightRailWidth] = useState<number>(() => {
    const raw = Number(window.localStorage.getItem('pa_right_rail_width'));
    return Number.isFinite(raw) && raw >= 220 && raw <= 540 ? raw : 288;
  });
  const [bottomBarHeight, setBottomBarHeight] = useState<number>(() => {
    const raw = Number(window.localStorage.getItem('pa_bottom_bar_height'));
    return Number.isFinite(raw) && raw >= 28 && raw <= 220 ? raw : 34;
  });
  const [activeResizer, setActiveResizer] = useState<'left' | 'right' | 'bottom' | null>(null);
  const [telemetry, setTelemetry] = useState<LlmContextTelemetry>({
    phase: 'Idle',
    isThinking: false,
    promptChars: 0,
    historyTurnsUsed: 0,
    lastError: '',
  });
  const [sessionTokens, setSessionTokens] = useState<number>(0);
  const [contextLogs, setContextLogs] = useState<LlmContextLogEntry[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    try {
      window.localStorage.setItem('pa_left_rail_width', String(leftRailWidth));
      window.localStorage.setItem('pa_right_rail_width', String(rightRailWidth));
      window.localStorage.setItem('pa_bottom_bar_height', String(bottomBarHeight));
    } catch {
      // Ignore storage quota errors
    }
  }, [leftRailWidth, rightRailWidth, bottomBarHeight]);

  const startPaneResize = (
    target: 'left' | 'right' | 'bottom',
    startCoord: number,
    initialSize: number,
  ) => {
    setActiveResizer(target);
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = target === 'bottom' ? 'row-resize' : 'col-resize';

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (target === 'left') {
        const next = Math.min(380, Math.max(168, initialSize + (moveEvent.clientX - startCoord)));
        setLeftRailWidth(Math.round(next));
      } else if (target === 'right') {
        const next = Math.min(540, Math.max(220, initialSize - (moveEvent.clientX - startCoord)));
        setRightRailWidth(Math.round(next));
      } else {
        const next = Math.min(220, Math.max(28, initialSize - (moveEvent.clientY - startCoord)));
        setBottomBarHeight(Math.round(next));
      }
    };

    const onPointerUp = () => {
      setActiveResizer(null);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const pushContextLog = useCallback(
    (level: 'info' | 'success' | 'error', message: string) => {
      const now = new Date();
      const timestamp = now.toTimeString().slice(0, 8);
      const entry: LlmContextLogEntry = {
        id: `log-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp,
        level,
        message,
      };
      setContextLogs((prev) => [entry, ...prev].slice(0, 12));
    },
    [],
  );

  useEffect(() => {
    if (!telemetry.isThinking) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [telemetry.isThinking]);

  const speech = useSpeechIO(settings.voice);

  const reloadReportsFromDisk = useCallback(
    async (dirOverride?: string) => {
      try {
        const query = isProductionApp
          ? '?mode=production'
          : dirOverride
            ? `?dir=${encodeURIComponent(dirOverride)}`
            : '';
        const res = await fetch(`/api/reports${query}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          reportsDir?: string;
          displayReportsDir?: string;
          reports?: RatedThreadRecord[];
        };
        if (isProductionApp && data.displayReportsDir) {
          setProdReportsDirDisplay(data.displayReportsDir);
        }
        if (Array.isArray(data.reports)) {
          const diskReports = data.reports.map((rec) => ({ ...rec, isFinalized: true }));
          if (isProductionApp) {
            setRatedThreads(
              [...diskReports].sort(
                (a, b) => Date.parse(b.ratedAt || '') - Date.parse(a.ratedAt || ''),
              ),
            );
          } else {
            setRatedThreads((prev) => {
              const byId = new Map<string, RatedThreadRecord>();
              for (const rec of diskReports) {
                byId.set(rec.id, rec);
              }
              for (const localRec of prev) {
                if (!byId.has(localRec.id) && !localRec.isExternalFile) {
                  byId.set(localRec.id, localRec);
                  // Persist browser-only report onto disk folder too
                  void fetch(`/api/reports/${encodeURIComponent(localRec.id)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      record: localRec,
                      reportsDir: data.reportsDir || dirOverride,
                    }),
                  }).catch(() => undefined);
                }
              }
              return Array.from(byId.values()).sort(
                (a, b) => Date.parse(b.ratedAt || '') - Date.parse(a.ratedAt || ''),
              );
            });
          }
        }
        if (!isProductionApp && data.reportsDir) {
          setConfigFileInfo((prev) => ({
            ...prev,
            resolvedReportsDir: data.reportsDir,
          }));
        }
      } catch {
        // Ignore offline/network errors when loading local reports
      } finally {
        reportsHydratedRef.current = true;
      }
    },
    [isProductionApp],
  );

  const syncReportToDisk = useCallback(
    async (record: RatedThreadRecord, explicitHtml?: string, dirOverride?: string) => {
      if (record.isExternalFile) return;
      try {
        const query = isProductionApp ? '?mode=production' : '';
        const res = await fetch(`/api/reports/${encodeURIComponent(record.id)}${query}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record,
            html: explicitHtml,
            ...(isProductionApp
              ? { mode: 'production' }
              : { reportsDir: dirOverride ?? settings.reportsDir }),
          }),
        });
        if (!res.ok) return;
        const saved = (await res.json()) as {
          fileName?: string;
          filePath?: string;
          relativePath?: string;
          reportsDir?: string;
          displayReportsDir?: string;
        };
        if (isProductionApp && saved.displayReportsDir) {
          setProdReportsDirDisplay(saved.displayReportsDir);
        }
        if (saved.filePath || saved.fileName || saved.relativePath) {
          setRatedThreads((prev) =>
            prev.map((item) =>
              item.id === record.id
                ? {
                    ...item,
                    fileName: saved.fileName || item.fileName,
                    filePath: saved.filePath || item.filePath,
                    relativePath: saved.relativePath || item.relativePath,
                  }
                : item,
            ),
          );
        }
      } catch {
        // Non-fatal if server unavailable
      }
    },
    [isProductionApp, settings.reportsDir],
  );

  const persistSettingsToFile = useCallback(async (nextSettings: WorkbenchSettings) => {
    if (persistDebounceTimerRef.current) {
      clearTimeout(persistDebounceTimerRef.current);
      persistDebounceTimerRef.current = null;
    }
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        filePath?: string;
        savedAt?: string;
        defaultReportsDir?: string;
        resolvedReportsDir?: string;
        productionReportsDir?: string;
        promptFiles?: Record<PromptDomain, string>;
      };
      if (data.productionReportsDir) {
        setProdReportsDirDisplay(data.productionReportsDir);
      }
      setConfigFileInfo((prev) => ({
        ...prev,
        filePath: data.filePath || prev.filePath,
        lastSavedAt: data.savedAt || new Date().toISOString(),
        defaultReportsDir: data.defaultReportsDir || prev.defaultReportsDir,
        resolvedReportsDir: data.resolvedReportsDir || prev.resolvedReportsDir,
        productionReportsDir: data.productionReportsDir || prev.productionReportsDir,
        promptFiles: data.promptFiles || prev.promptFiles,
        syncError: undefined,
      }));
      return true;
    } catch (err) {
      setConfigFileInfo((prev) => ({
        ...prev,
        syncError:
          err instanceof Error ? err.message : 'Failed to sync workbench.config.json.',
      }));
      return false;
    }
  }, []);

  const reloadConfigFromFile = useCallback(async () => {
    let loadedReportsDir = '';
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        config?: WorkbenchSettings;
        filePath?: string;
        platform?: string;
        hasPromptBuilderSettings?: boolean;
        hasCustomPromptTemplates?: boolean;
        defaultReportsDir?: string;
        resolvedReportsDir?: string;
        productionReportsDir?: string;
        promptFiles?: Record<PromptDomain, string>;
      };
      if (data.productionReportsDir) {
        setProdReportsDirDisplay(data.productionReportsDir);
      }
      if (data.config) {
        loadedReportsDir = data.config.reportsDir || data.resolvedReportsDir || '';
        const clientHasCustom = hasCustomPromptTemplates(settingsRef.current.promptBuilder.templates);
        const serverHasCustom = Boolean(data.hasCustomPromptTemplates);
        const shouldAdoptServerPrompts =
          !userEditedPromptsRef.current &&
          Boolean(data.hasPromptBuilderSettings) &&
          (serverHasCustom || !clientHasCustom);

        skipNextAutoPersistRef.current = shouldAdoptServerPrompts;
        setSettings((previous) => {
          const next = {
            ...data.config!,
            reportsDir: data.config!.reportsDir || data.resolvedReportsDir || previous.reportsDir || '',
            promptBuilder: shouldAdoptServerPrompts
              ? data.config!.promptBuilder
              : previous.promptBuilder,
          };
          settingsRef.current = next;
          return next;
        });
      }
      setConfigFileInfo((prev) => ({
        ...prev,
        filePath: data.filePath || prev.filePath,
        platform: data.platform || prev.platform,
        defaultReportsDir: data.defaultReportsDir || prev.defaultReportsDir,
        resolvedReportsDir: data.resolvedReportsDir || prev.resolvedReportsDir,
        productionReportsDir: data.productionReportsDir || prev.productionReportsDir,
        promptFiles: data.promptFiles || prev.promptFiles,
        syncError: undefined,
      }));
    } catch (err) {
      setConfigFileInfo((prev) => ({
        ...prev,
        syncError:
          err instanceof Error ? err.message : 'Unable to read local config file.',
      }));
    } finally {
      configHydratedRef.current = true;
      await reloadReportsFromDisk(loadedReportsDir || undefined);
    }
  }, [reloadReportsFromDisk]);

  useEffect(() => {
    void reloadConfigFromFile();
  }, [reloadConfigFromFile]);

  useEffect(() => {
    saveSettings(settings);
    if (!configHydratedRef.current) return;
    if (skipNextAutoPersistRef.current) {
      skipNextAutoPersistRef.current = false;
      return;
    }

    if (persistDebounceTimerRef.current) {
      clearTimeout(persistDebounceTimerRef.current);
    }
    persistDebounceTimerRef.current = setTimeout(() => {
      persistDebounceTimerRef.current = null;
      void persistSettingsToFile(settingsRef.current);
    }, 250);

    return () => {
      if (persistDebounceTimerRef.current) {
        clearTimeout(persistDebounceTimerRef.current);
        persistDebounceTimerRef.current = null;
      }
    };
  }, [settings, persistSettingsToFile]);

  useEffect(() => {
    saveConversation(turns);
  }, [turns]);

  useEffect(() => {
    saveRatedThreads(
      ratedThreads,
      isProductionApp ? PROD_RATED_THREADS_KEY : undefined,
    );
  }, [ratedThreads, isProductionApp]);

  useEffect(() => {
    saveScope(scope);
  }, [scope]);

  const handleApplyFetchedContext = useCallback(
    async ({
      text,
      month,
      year,
      fetchedAt,
    }: {
      text: string;
      month: number;
      year: number;
      fetchedAt: string;
    }): Promise<boolean> => {
      const currentSettings = settingsRef.current;
      const nextSettings: WorkbenchSettings = {
        ...currentSettings,
        contextCache: {
          ...currentSettings.contextCache,
          privateText: text,
          publicText: text,
          activeMonth: month,
          activeYear: year,
          lastSyncedAt: fetchedAt,
        },
      };
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      return persistSettingsToFile(nextSettings);
    },
    [persistSettingsToFile],
  );

  const handleQuickSelectMonth = useCallback(
    async (month: number, year: number) => {
      if (switchingMonthKey) return;
      setMonthSwitchError(null);
      const currentSettings = settingsRef.current;
      const nextSettings: WorkbenchSettings = {
        ...currentSettings,
        contextCache: {
          ...currentSettings.contextCache,
          activeMonth: month,
          activeYear: year,
        },
      };
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      void persistSettingsToFile(nextSettings);
      pushContextLog(
        'info',
        `Selected active period ${formatShortYearMonth(month, year)}. Reference Context will fetch dynamically per domain.`,
      );
    },
    [persistSettingsToFile, pushContextLog, switchingMonthKey],
  );

  const handleUpdateExchangeMetadata = useCallback(
    (exchangeId: string, patch: ThreadMetadataPatch) => {
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === exchangeId && turn.role === 'user'
            ? { ...turn, ...patch }
            : turn,
        ),
      );
      setRatedThreads((prevRated) =>
        prevRated.map((item) => {
          if (item.id !== exchangeId) return item;
          const updatedItem: RatedThreadRecord = {
            ...item,
            turns: item.turns.map((turn) =>
              turn.id === exchangeId && turn.role === 'user'
                ? { ...turn, ...patch }
                : turn,
            ),
          };
          if (reportsHydratedRef.current && !updatedItem.isExternalFile) {
            void syncReportToDisk(updatedItem);
          }
          return updatedItem;
        }),
      );
    },
    [syncReportToDisk],
  );

  const handleStartNewThread = useCallback(() => {
    setMonthSwitchError(null);
    if (activeRequestAbortRef.current) {
      activeRequestAbortRef.current.controller.abort();
      activeRequestAbortRef.current = null;
      setIsSending(false);
    }
    const rootUserTurn = turns.find((turn) => turn.role === 'user');
    if (rootUserTurn) {
      const finalizedTurns = turns.map((turn) =>
        turn.id === rootUserTurn.id && turn.role === 'user'
          ? { ...turn, isFinalized: true }
          : turn,
      );
      const hasAssistantReply = finalizedTurns.some(
        (candidate) => candidate.role === 'assistant',
      );
      const finalizedAt = new Date().toISOString();

      setRatedThreads((prevRated) => {
        const existingIdx = prevRated.findIndex((item) => item.id === rootUserTurn.id);
        if (existingIdx >= 0) {
          const existing = prevRated[existingIdx];
          const updatedRecord: RatedThreadRecord = {
            ...existing,
            turns: finalizedTurns,
            isFinalized: true,
          };
          const nextRated = [...prevRated];
          nextRated[existingIdx] = updatedRecord;
          if (hasAssistantReply && reportsHydratedRef.current && !existing.isFinalized) {
            void syncReportToDisk(updatedRecord);
          }
          return nextRated;
        }
        if (hasAssistantReply) {
          const newFinalizedRecord: RatedThreadRecord = {
            id: rootUserTurn.id,
            turns: finalizedTurns,
            ratedAt: finalizedAt,
            isFinalized: true,
          };
          if (reportsHydratedRef.current) {
            void syncReportToDisk(newFinalizedRecord);
          }
          return [newFinalizedRecord, ...prevRated];
        }
        return prevRated;
      });
    }

    setIsSettingsOpen(false);
    setActiveReportExchangeId(null);
    setIsProdReportsMenuOpen(false);
    setTurns([]);
    setIsChatBarOpen(false);
    setTelemetry({
      phase: 'Idle',
      isThinking: false,
      promptChars: 0,
      historyTurnsUsed: 0,
      lastError: '',
    });
    pushContextLog(
      'info',
      rootUserTurn
        ? 'Previous thread finalized; started a new thread'
        : 'Started new thread; stage cleared',
    );
  }, [turns, syncReportToDisk, pushContextLog]);

  const handleOpenProductionReport = useCallback(
    (record: RatedThreadRecord) => {
      setMonthSwitchError(null);
      if (activeRequestAbortRef.current) {
        activeRequestAbortRef.current.controller.abort();
        activeRequestAbortRef.current = null;
        setIsSending(false);
      }
      const firstUserIdx = record.turns.findIndex((t) => t.role === 'user');
      const loadedTurns = record.turns.map((t, idx) =>
        idx === firstUserIdx ? { ...t, isFinalized: true } : t,
      );
      setIsSettingsOpen(false);
      setActiveReportExchangeId(null);
      setIsProdReportsMenuOpen(false);
      setIsContextRailOpen(false);
      setIsChatBarOpen(false);
      setTurns(loadedTurns);
    },
    [],
  );

  const handleDeleteSidebarReport = useCallback(
    (recordId: string) => {
      const targetRecord = ratedThreads.find((item) => item.id === recordId);
      const targetTurnIds = new Set(
        (targetRecord?.turns ?? []).map((t) => t.id).filter(Boolean),
      );
      setRatedThreads((previous) => previous.filter((item) => item.id !== recordId));
      if (activeReportExchangeId === recordId) {
        setActiveReportExchangeId(null);
      }
      setTurns((previous) =>
        previous.some(
          (t) =>
            t.id === recordId ||
            t.exchangeId === recordId ||
            targetTurnIds.has(t.id),
        )
          ? []
          : previous,
      );
      const query = isProductionApp
        ? '?mode=production'
        : settings.reportsDir
          ? `?dir=${encodeURIComponent(settings.reportsDir)}`
          : '';
      void fetch(`/api/reports/${encodeURIComponent(recordId)}${query}`, {
        method: 'DELETE',
      }).catch(() => undefined);
      pushContextLog('info', 'Report deleted from session and local folder');
    },
    [
      activeReportExchangeId,
      isProductionApp,
      pushContextLog,
      ratedThreads,
      settings.reportsDir,
    ],
  );

  const handleRenameReportCommit = useCallback(
    async (recordId: string, rawNewName: string) => {
      const nextName = rawNewName.trim();
      if (!nextName) return;

      setRatedThreads((previous) =>
        previous.map((item) =>
          item.id === recordId
            ? {
                ...item,
                ratedAt: new Date().toISOString(),
                turns: item.turns.map((turn) =>
                  turn.role === 'user' ? { ...turn, threadName: nextName } : turn,
                ),
              }
            : item,
        ),
      );
      setTurns((previous) =>
        previous.some((t) => t.id === recordId)
          ? previous.map((turn) =>
              turn.role === 'user' ? { ...turn, threadName: nextName } : turn,
            )
          : previous,
      );

      try {
        const res = await fetch(`/api/reports/${encodeURIComponent(recordId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nextName,
            reportsDir: settings.reportsDir,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { record?: RatedThreadRecord };
        if (data.record) {
          const updatedRecord = data.record;
          setRatedThreads((previous) =>
            previous.map((item) => (item.id === recordId ? updatedRecord : item)),
          );
          if (activeReportExchangeId === recordId && updatedRecord.id !== recordId) {
            setActiveReportExchangeId(updatedRecord.id);
          }
        }
      } catch {
        // Local state already updated
      }
      pushContextLog('info', `Renamed report to "${nextName}"`);
    },
    [activeReportExchangeId, pushContextLog, settings.reportsDir],
  );

  const handleUpdateReportComment = useCallback(
    async (recordId: string, rawComment: string) => {
      const nextComment = rawComment.trim();

      setRatedThreads((previous) =>
        previous.map((item) =>
          item.id === recordId
            ? {
                ...item,
                comment: nextComment,
                turns: item.turns.map((turn) =>
                  turn.role === 'user' ? { ...turn, threadComment: nextComment } : turn,
                ),
              }
            : item,
        ),
      );
      setTurns((previous) =>
        previous.some((t) => t.id === recordId)
          ? previous.map((turn) =>
              turn.role === 'user' ? { ...turn, threadComment: nextComment } : turn,
            )
          : previous,
      );

      try {
        const res = await fetch(`/api/reports/${encodeURIComponent(recordId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comment: nextComment,
            reportsDir: settings.reportsDir,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { record?: RatedThreadRecord };
        if (data.record) {
          const updatedRecord = data.record;
          setRatedThreads((previous) =>
            previous.map((item) => (item.id === recordId ? updatedRecord : item)),
          );
        }
      } catch {
        // Local state already updated
      }
      pushContextLog('info', nextComment ? 'Updated report note' : 'Cleared report note');
    },
    [pushContextLog, settings.reportsDir],
  );

  const handleMoveSidebarReport = useCallback(
    async (recordId: string, target: ReportMoveTarget) => {
      const nextScope: ConversationScope =
        target.adapterId === 'ollama' ? 'private' : 'public';

      setRatedThreads((previous) =>
        previous.map((item) =>
          item.id === recordId
            ? {
                ...item,
                ratedAt: new Date().toISOString(),
                turns: item.turns.map((turn) => {
                  if (turn.role === 'user') {
                    return {
                      ...turn,
                      threadMonth: target.threadMonth,
                      threadYear: target.threadYear,
                      promptDomain: target.promptDomain,
                      adapterId: target.adapterId,
                      scope: nextScope,
                      responseScopes: [nextScope],
                    };
                  }
                  if (turn.role === 'assistant') {
                    return {
                      ...turn,
                      adapterId: target.adapterId,
                      scope: nextScope,
                    };
                  }
                  return turn;
                }),
              }
            : item,
        ),
      );

      setTurns((previous) =>
        previous.some((t) => t.id === recordId)
          ? previous.map((turn) => {
              if (turn.role === 'user') {
                return {
                  ...turn,
                  threadMonth: target.threadMonth,
                  threadYear: target.threadYear,
                  promptDomain: target.promptDomain,
                  adapterId: target.adapterId,
                  scope: nextScope,
                  responseScopes: [nextScope],
                };
              }
              if (turn.role === 'assistant') {
                return {
                  ...turn,
                  adapterId: target.adapterId,
                  scope: nextScope,
                };
              }
              return turn;
            })
          : previous,
      );

      try {
        const res = await fetch(`/api/reports/${encodeURIComponent(recordId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            moveTarget: target,
            reportsDir: settings.reportsDir,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { record?: RatedThreadRecord };
        if (data.record) {
          const updatedRecord = data.record;
          setRatedThreads((previous) =>
            previous.map((item) => (item.id === recordId ? updatedRecord : item)),
          );
          if (activeReportExchangeId === recordId && updatedRecord.id !== recordId) {
            setActiveReportExchangeId(updatedRecord.id);
          }
        }
      } catch {
        // Local state already updated
      }
      pushContextLog(
        'info',
        `Moved report to ${target.threadYear} ${target.threadMonth} (${target.adapterId})`,
      );
    },
    [activeReportExchangeId, pushContextLog, settings.reportsDir],
  );

  const activeReportRecord = useMemo(() => {
    if (!activeReportExchangeId) return null;
    const fromSaved = ratedThreads.find((r) => r.id === activeReportExchangeId);
    if (fromSaved) return fromSaved;
    if (turns.some((t) => t.id === activeReportExchangeId)) {
      return {
        id: activeReportExchangeId,
        turns,
        ratedAt: turns[0]?.timestamp || new Date().toISOString(),
      };
    }
    return null;
  }, [activeReportExchangeId, ratedThreads, turns]);

  const activeThreadScope = useMemo<ConversationScope | null>(() => {
    const sourceTurns = activeReportRecord?.turns ?? (turns.length > 0 ? turns : null);
    if (!sourceTurns || sourceTurns.length === 0) return null;
    const latestReply = [...sourceTurns]
      .reverse()
      .find((t) => t.role === 'assistant');
    const rootQ = sourceTurns.find((t) => t.role === 'user');
    return latestReply?.scope ?? rootQ?.scope ?? null;
  }, [activeReportRecord, turns]);

  const canSwitchScope =
    !isSettingsOpen &&
    !activeReportRecord &&
    turns.length === 0 &&
    !isSending;

  const displayedScope: ConversationScope = isProductionApp
    ? 'public'
    : (activeThreadScope ?? scope);

  const activeProductionReportId = useMemo(
    () => turns.find((t) => t.role === 'user')?.id ?? null,
    [turns],
  );

  const hasReportForRightPane =
    (!isSettingsOpen || isProductionApp) &&
    ((!isProductionApp && Boolean(activeReportRecord)) ||
      turns.some((t) => t.role === 'assistant'));
  const isContextRailVisible = isContextRailOpen && hasReportForRightPane;

  useEffect(() => {
    if (!hasReportForRightPane && isContextRailOpen) {
      setIsContextRailOpen(false);
    }
  }, [hasReportForRightPane, isContextRailOpen]);

  const reportTurnsForCopy = useMemo<ConversationTurn[] | null>(() => {
    if (activeReportRecord && activeReportRecord.turns.some((t) => t.role === 'user')) {
      return activeReportRecord.turns;
    }
    if (turns.some((t) => t.role === 'user')) {
      return turns;
    }
    return null;
  }, [activeReportRecord, turns]);

  const copyPromptText = useMemo(() => {
    const viewingDifferentSavedReport =
      Boolean(activeReportRecord) &&
      activeReportRecord?.id !== lastSentPrompt?.exchangeId;

    if (!viewingDifferentSavedReport && lastSentPrompt?.text) {
      return lastSentPrompt.text;
    }

    if (!reportTurnsForCopy) {
      return lastSentPrompt?.text ?? '';
    }

    const userTurns = reportTurnsForCopy.filter((t) => t.role === 'user');
    const rootUser = userTurns[0];
    if (!rootUser) return lastSentPrompt?.text ?? '';

    const assistantReply = [...reportTurnsForCopy]
      .reverse()
      .find((t) => t.role === 'assistant');
    const targetScope = rootUser.scope ?? assistantReply?.scope ?? scope;
    const fallbackAdapter: PublicAdapterId =
      assistantReply?.adapterId === 'claude' ||
      assistantReply?.adapterId === 'fable' ||
      assistantReply?.adapterId === 'gemini'
        ? assistantReply.adapterId
        : settings.publicLlm.activeAdapter;

    const fallbackSysInstruction = [
      targetScope === 'private'
        ? settings.privateLlm.systemInstruction.trim()
        : settings.publicLlm.adapters[fallbackAdapter].systemInstruction.trim(),
      EVENT_EXTRACTION_SYSTEM_DIRECTIVE,
    ]
      .filter(Boolean)
      .join('\n\n');

    const systemInstructionText =
      rootUser.systemInstruction?.trim() ||
      (targetScope === 'private'
        ? rootUser.privateSystemInstruction?.trim()
        : rootUser.publicSystemInstruction?.trim()) ||
      fallbackSysInstruction;

    const referenceContextText =
      rootUser.cachedContext?.trim() ||
      (targetScope === 'private'
        ? rootUser.privateCachedContext?.trim()
        : rootUser.publicCachedContext?.trim()) ||
      '';

    const questionBlocks = userTurns.map((u, idx) =>
      userTurns.length === 1
        ? `Question:\n${u.content.trim()}`
        : idx === 0
          ? `Question:\n${u.content.trim()}`
          : `Follow-up #${idx}:\n${u.content.trim()}`,
    );

    return [
      systemInstructionText ? `System Instruction:\n${systemInstructionText}` : '',
      `Reference Context (${referenceContextText.length} chars):\n${referenceContextText || '(EMPTY)'}`,
      ...questionBlocks,
    ]
      .filter(Boolean)
      .join('\n\n');
  }, [activeReportRecord, lastSentPrompt, reportTurnsForCopy, scope, settings]);

  const canCopyPrompt = Boolean(copyPromptText.trim());

  const handleCopyReportPrompt = useCallback(async () => {
    const fullPrompt = copyPromptText;
    if (!fullPrompt) return;

    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(fullPrompt);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = fullPrompt;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        textarea.remove();
      } catch {
        copied = false;
      }
    }

    if (copied) {
      setPromptCopied(true);
      if (promptCopiedTimerRef.current) window.clearTimeout(promptCopiedTimerRef.current);
      promptCopiedTimerRef.current = window.setTimeout(() => setPromptCopied(false), 2000);
      pushContextLog(
        'success',
        'Copied captured prompt payload to clipboard',
      );
    } else {
      pushContextLog('error', 'Failed to copy prompt to clipboard');
    }
  }, [copyPromptText, pushContextLog]);

  const handleImportMarkdownFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      const importedResults: Array<{
        record: RatedThreadRecord;
        htmlReport: string;
        detectedPeriodLabel: string;
        detectedDomainLabel: string;
        detectedCarrierLabel: string;
      }> = [];

      let workingReports = [...ratedThreads];

      for (const file of files) {
        try {
          const rawMarkdown = await file.text();
          if (!rawMarkdown.trim()) continue;
          const parsed = parseMarkdownReportImport({
            rawMarkdown,
            fileName: file.name,
            fallbackMonth: settingsRef.current.contextCache.activeMonth,
            fallbackYear: settingsRef.current.contextCache.activeYear,
            fallbackDomain: settingsRef.current.promptBuilder.activeDomain,
            existingReports: workingReports,
          });
          workingReports = [parsed.record, ...workingReports];
          importedResults.push(parsed);
        } catch (err) {
          pushContextLog(
            'error',
            `Failed to import ${file.name}: ${err instanceof Error ? err.message : 'Invalid markdown file'}`,
          );
        }
      }

      if (importedResults.length === 0) return;

      setRatedThreads(workingReports);
      for (const item of importedResults) {
        void syncReportToDisk(item.record, item.htmlReport);
      }

      const primary = importedResults[importedResults.length - 1];
      setIsSettingsOpen(false);
      setActiveReportExchangeId(primary.record.id);

      const summaryDetail = `${primary.detectedPeriodLabel} · ${primary.detectedDomainLabel} · ${primary.detectedCarrierLabel}`;
      pushContextLog(
        'success',
        importedResults.length === 1
          ? `Imported "${primary.record.turns[0]?.threadName || 'Report'}" -> ${summaryDetail}`
          : `Imported ${importedResults.length} Markdown reports (latest -> ${summaryDetail})`,
      );
      setReplyToast({
        title:
          importedResults.length === 1
            ? 'Markdown report imported'
            : `${importedResults.length} Markdown reports imported`,
        preview: summaryDetail,
        isError: false,
      });
      if (replyToastTimerRef.current) window.clearTimeout(replyToastTimerRef.current);
      replyToastTimerRef.current = window.setTimeout(() => setReplyToast(null), 4500);
    },
    [pushContextLog, ratedThreads, syncReportToDisk],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.removeAttribute('data-pa-theme');
    root.setAttribute('data-pa-scope', displayedScope);
    root.setAttribute('data-pa-font', settings.fontFamily || 'segoe');
    if (displayedScope === 'public') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [displayedScope, settings.fontFamily]);

  const activePublicAdapterLabel =
    settings.publicLlm.activeAdapter === 'gemini'
      ? 'Gemini'
      : settings.publicLlm.activeAdapter === 'claude'
        ? 'Claude'
        : 'Fable';

  const connectedEngineText =
    displayedScope === 'private'
      ? `Connected: Private · Ollama (${settings.privateLlm.selectedModel || 'No model selected'})`
      : `Connected: Public · ${activePublicAdapterLabel} (${settings.publicLlm.adapters[settings.publicLlm.activeAdapter].model})`;

  const displayedTelemetry = useMemo<LlmContextTelemetry>(() => {
    if (
      !activeReportRecord &&
      (telemetry.isThinking ||
        telemetry.totalTokens !== undefined ||
        telemetry.durationMs !== undefined)
    ) {
      return telemetry;
    }

    const sourceTurns = activeReportRecord?.turns ?? turns;
    const latestAssistant = [...sourceTurns]
      .reverse()
      .find((t) => t.role === 'assistant');
    const rootQuestion = sourceTurns.find((t) => t.role === 'user');
    if (!latestAssistant) {
      if (rootQuestion?.refContextDomain) {
        return {
          ...telemetry,
          refContextDomain: rootQuestion.refContextDomain,
          refContextTokens: rootQuestion.refContextTokens,
          refContextChars: rootQuestion.refContextChars,
        };
      }
      return telemetry;
    }

    const inputTokens = latestAssistant.inputTokenCount;
    const outputTokens = latestAssistant.outputTokenCount;
    const totalTokens =
      latestAssistant.tokenCount ??
      (inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined);
    const durationMs = latestAssistant.durationMs;
    const effectiveOutput = outputTokens ?? totalTokens;
    const tokensPerSecond =
      latestAssistant.tokensPerSecond ??
      (effectiveOutput !== undefined &&
      effectiveOutput > 0 &&
      durationMs !== undefined &&
      durationMs > 0
        ? Number((effectiveOutput / (durationMs / 1000)).toFixed(1))
        : undefined);

    const refContextDomain =
      latestAssistant.refContextDomain ??
      rootQuestion?.refContextDomain ??
      (!activeReportRecord ? telemetry.refContextDomain : undefined);
    const refContextTokens =
      latestAssistant.refContextTokens ??
      rootQuestion?.refContextTokens ??
      (!activeReportRecord ? telemetry.refContextTokens : undefined);
    const refContextChars =
      latestAssistant.refContextChars ??
      rootQuestion?.refContextChars ??
      (!activeReportRecord ? telemetry.refContextChars : undefined);

    if (
      totalTokens === undefined &&
      tokensPerSecond === undefined &&
      durationMs === undefined &&
      refContextDomain === undefined
    ) {
      return telemetry;
    }

    return {
      ...telemetry,
      phase: 'Ready',
      inputTokens,
      outputTokens,
      totalTokens,
      tokensPerSecond,
      durationMs,
      refContextDomain,
      refContextTokens,
      refContextChars,
    };
  }, [activeReportRecord, telemetry, turns]);

  const activeCarefulDates = useMemo<CarefulDateItem[]>(() => {
    const items: CarefulDateItem[] = [];
    const seen = new Set<string>();
    const sourceTurns = (!isProductionApp ? activeReportRecord?.turns : undefined) ?? turns;
    const rootQ = sourceTurns.find((t) => t.role === 'user');

    for (const turn of sourceTurns) {
      if (turn.role !== 'assistant') continue;
      const stored = Array.isArray(turn.carefulDates) ? turn.carefulDates : [];
      const freshFromMarkdown =
        turn.content && turn.content.trim().length > 40
          ? parseResponseEventsAndReport(turn.content, rootQ?.promptDomain).carefulDates
          : [];
      const freshFromHtml =
        stored.length === 0 && freshFromMarkdown.length === 0 && turn.htmlReport
          ? extractCarefulDatesFromHtml(turn.htmlReport, rootQ?.promptDomain)
          : [];
      const combinedList =
        freshFromMarkdown.length > 0
          ? freshFromMarkdown
          : stored.length > 0
            ? stored.map(sanitizeCarefulDateItem)
            : freshFromHtml.map(sanitizeCarefulDateItem);

      for (const cd of combinedList) {
        const dedupeKey = `${cd.domain.toLowerCase()}|${cd.date.toLowerCase()}|${cd.note.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        items.push({ ...cd, id: `${turn.id}-${cd.id}` });
      }
    }
    return items;
  }, [activeReportRecord, isProductionApp, turns]);

  const productionStageData = useMemo(() => {
    const userTurns = turns.filter((t) => t.role === 'user');
    const latestUserTurn = userTurns[userTurns.length - 1] ?? null;
    const rootUserTurn = userTurns[0] ?? null;
    const latestReplyTurn = latestUserTurn
      ? turns.find((t) => t.role === 'assistant' && t.exchangeId === latestUserTurn.id) ??
        [...turns].reverse().find((t) => t.role === 'assistant') ??
        null
      : null;
    const latestErrorTurn = latestUserTurn
      ? turns.find((t) => t.role === 'error' && t.exchangeId === latestUserTurn.id) ?? null
      : null;

    let cards: EventCardItem[] = [];
    if (latestReplyTurn) {
      const parsedFromReport = parseResponseEventsAndReport(
        latestReplyTurn.content,
        latestUserTurn?.promptDomain ?? rootUserTurn?.promptDomain,
      ).events;
      const raw =
        parsedFromReport.length > 0
          ? parsedFromReport
          : Array.isArray(latestReplyTurn.eventCards)
            ? latestReplyTurn.eventCards
            : [];
      cards = raw
        .map((evt, idx) => normalizeEventCardItem(evt, idx))
        .map((evt, idx) => ({ evt, idx, score: getEventRatingSortScore(evt) }))
        .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx))
        .map((entry) => entry.evt);
    }

    const readOutSections = latestReplyTurn
      ? extractReadOutSections(latestReplyTurn.content)
      : null;

    const isWaitingForReply =
      isSending && Boolean(latestUserTurn) && !latestReplyTurn && !latestErrorTurn;

    const errorDetail =
      !isWaitingForReply && latestErrorTurn && !latestReplyTurn
        ? [
            [latestErrorTurn.adapterId, latestErrorTurn.model].filter(Boolean).join(' · '),
            formatProviderErrorDetail(latestErrorTurn.content),
          ]
            .filter(Boolean)
            .join(': ')
        : null;

    return {
      latestUserTurn,
      latestReplyTurn,
      cards,
      readOutSections,
      isWaitingForReply,
      errorDetail,
    };
  }, [isSending, turns]);

  const activeCarefulPeriodLabel = useMemo(() => {
    const sourceTurns = activeReportRecord?.turns ?? turns;
    const rootQ = sourceTurns.find((t) => t.role === 'user');
    return (
      formatShortYearMonth(rootQ?.threadMonth, rootQ?.threadYear) ||
      formatShortYearMonth(
        settings.contextCache.activeMonth,
        settings.contextCache.activeYear,
      )
    );
  }, [
    activeReportRecord,
    settings.contextCache.activeMonth,
    settings.contextCache.activeYear,
    turns,
  ]);

  const executeExchangeRequest = async ({
    userTurn,
    precedingTurns,
    baseThreadTurns,
    effectiveDomain,
    overrideCachedContext,
    abortController: providedAbortController,
  }: {
    userTurn: ConversationTurn;
    precedingTurns: ConversationTurn[];
    baseThreadTurns: ConversationTurn[];
    effectiveDomain: PromptDomain;
    overrideCachedContext?: string;
    abortController?: AbortController;
  }) => {
    const targetScope: ConversationScope = isProductionApp
      ? 'public'
      : (userTurn.scope ?? scope);
    const activeProdPublicAdapter: PublicAdapterId =
      settings.publicLlm.activeAdapter === 'fable' ? 'fable' : 'gemini';
    const targetPublicAdapter: PublicAdapterId = isProductionApp
      ? activeProdPublicAdapter
      : settings.publicLlm.activeAdapter;
    const targetAdapterId: AnyAdapterId =
      targetScope === 'private'
        ? settings.privateLlm.activeAdapter
        : targetPublicAdapter;
    const targetModel =
      targetScope === 'private'
        ? settings.privateLlm.selectedModel || 'unselected'
        : settings.publicLlm.adapters[targetPublicAdapter].model;
    const maxHistory = Math.min(32, Math.max(2, settings.privateLlm.maxHistoryTurns || 16));
    const targetCachedContext = (
      overrideCachedContext !== undefined
        ? overrideCachedContext
        : targetScope === 'private'
          ? settings.contextCache.privateText
          : settings.contextCache.publicText
    ).trim();

    const filteredPreceding = precedingTurns
      .filter((turn) => {
        if (turn.role === 'user') {
          return (turn.responseScopes ?? [turn.scope]).includes(targetScope);
        }
        return turn.role === 'assistant' && turn.scope === targetScope;
      })
      .slice(-maxHistory);

    const isInitialTurn = filteredPreceding.length === 0;
    const questionText = userTurn.content.trim();
    const outgoingMessage =
      isInitialTurn && targetCachedContext
        ? `${targetCachedContext}\n\nQuestion:\n${questionText}`
        : questionText;

    const targetHistory = filteredPreceding.map((turn, idx) => {
      if (turn.role === 'user' && idx === 0) {
        const rootCtx = (turn.cachedContext ?? targetCachedContext).trim();
        if (rootCtx && !turn.content.includes(rootCtx)) {
          return {
            role: 'user' as const,
            content: `${rootCtx}\n\nQuestion:\n${turn.content.trim()}`,
          };
        }
      }
      return {
        role: turn.role as 'user' | 'assistant',
        content: turn.content,
      };
    });

    const adapterSystemInstruction =
      targetScope === 'private'
        ? settings.privateLlm.systemInstruction
        : settings.publicLlm.adapters[settings.publicLlm.activeAdapter].systemInstruction;
    const baseSystemInstruction =
      isInitialTurn || targetHistory.length > 0
        ? adapterSystemInstruction.trim()
        : appendCachedContext(
            adapterSystemInstruction,
            targetCachedContext,
            targetHistory.map((turn) => turn.content),
          );
    const targetSystemInstruction = [
      baseSystemInstruction,
      EVENT_EXTRACTION_SYSTEM_DIRECTIVE,
    ]
      .filter(Boolean)
      .join('\n\n');

    const userTurnWithPrompt: ConversationTurn = {
      ...userTurn,
      systemInstruction: targetSystemInstruction,
      cachedContext: targetCachedContext || userTurn.cachedContext,
    };

    const sentPromptSnapshot = [
      `[Target: ${targetScope}:${targetAdapterId}/${targetModel} · Domain: ${effectiveDomain} (${getDomainQueryValue(effectiveDomain)}) · Ref Context: ${targetCachedContext.length} chars · Outgoing Message: ${outgoingMessage.length} chars · History: ${targetHistory.length} turns]`,
      `System Instruction:\n${targetSystemInstruction || '(EMPTY)'}`,
      `Reference Context (${targetCachedContext.length} chars):\n${targetCachedContext || '(EMPTY)'}`,
      targetHistory.length > 0
        ? `History (${targetHistory.length}):\n${targetHistory
            .map((h, i) => `[${i + 1}] ${h.role}:\n${h.content}`)
            .join('\n\n')}`
        : '',
      `Outgoing Message:\n${outgoingMessage}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    setLastSentPrompt({
      exchangeId: userTurn.id,
      text: sentPromptSnapshot,
    });

    setTurns((prev) =>
      prev.map((t) =>
        t.id === userTurn.id && t.role === 'user' ? userTurnWithPrompt : t,
      ),
    );

    setIsSending(true);
    const requestStartedAt = Date.now();
    const fullPromptChars =
      targetSystemInstruction.length +
      targetHistory.reduce((sum, item) => sum + item.content.length, 0) +
      outgoingMessage.length;
    const estimatedInputTokens = Math.max(1, Math.round(fullPromptChars / 4));
    setNowMs(requestStartedAt);
    setTelemetry((prev) => ({
      ...prev,
      phase: 'Thinking',
      isThinking: true,
      startedAtMs: requestStartedAt,
      promptChars: userTurn.content.trim().length,
      historyTurnsUsed: targetHistory.length,
      inputTokens: estimatedInputTokens,
      outputTokens: undefined,
      totalTokens: undefined,
      tokensPerSecond: undefined,
      durationMs: undefined,
      lastError: '',
      refContextDomain: userTurn.refContextDomain ?? prev.refContextDomain,
      refContextTokens:
        userTurn.refContextTokens !== undefined
          ? userTurn.refContextTokens
          : prev.refContextTokens,
      refContextChars:
        userTurn.refContextChars !== undefined
          ? userTurn.refContextChars
          : prev.refContextChars,
    }));

    const timeoutSec = Math.max(0, Number(settings.requestTimeoutSeconds) || 0);
    const timeoutLabel = timeoutSec > 0 ? `${timeoutSec}s` : 'Unlimited';

    pushContextLog(
      'info',
      `Prompt sent (${userTurn.content.trim().length} ch, ${targetHistory.length} hist) -> ${targetScope}:${targetAdapterId}/${targetModel} · timeout: ${timeoutLabel}`,
    );

    if (settings.notifications?.desktopNotificationOnReply !== false) {
      void requestDesktopNotificationPermission();
    }

    const requestStart = Date.now();
    const options =
      targetScope === 'private'
        ? {
            model: settings.privateLlm.selectedModel,
            systemInstruction: targetSystemInstruction,
            ollamaBaseUrl: settings.privateLlm.ollamaBaseUrl,
            contextWindow: settings.privateLlm.contextWindow,
            keepAlive: settings.privateLlm.keepAlive,
            requestTimeoutSeconds: timeoutSec,
          }
        : {
            model: settings.publicLlm.adapters[settings.publicLlm.activeAdapter].model,
            systemInstruction: targetSystemInstruction,
            thinkingLevel:
              settings.publicLlm.adapters[settings.publicLlm.activeAdapter].thinkingLevel,
            endpointUrl:
              settings.publicLlm.adapters[settings.publicLlm.activeAdapter].endpointUrl,
            maxTokens:
              settings.publicLlm.adapters[settings.publicLlm.activeAdapter].maxTokens,
            requestTimeoutSeconds: timeoutSec,
          };

    let abortController = providedAbortController;
    if (!abortController) {
      if (activeRequestAbortRef.current) {
        activeRequestAbortRef.current.controller.abort();
      }
      abortController = new AbortController();
      activeRequestAbortRef.current = {
        exchangeId: userTurn.id,
        controller: abortController,
      };
    }

    try {
      if (targetScope === 'private' && !settings.privateLlm.selectedModel.trim()) {
        throw new Error('Select a private Ollama model in Settings to get the Private response.');
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          scope: targetScope,
          adapterId: targetAdapterId,
          message: outgoingMessage,
          history: targetHistory,
          options,
        }),
      });

      const payload = (await response.json()) as {
        text?: string;
        adapterId?: AnyAdapterId;
        scope?: ConversationScope;
        model?: string;
        protocol?: string;
        durationMs?: number;
        tokenCount?: number;
        inputTokens?: number;
        outputTokens?: number;
        tokensPerSecond?: number;
        error?: string;
      };

      if (!response.ok || payload.error || !payload.text) {
        throw new Error(payload.error || 'Adapter returned an error.');
      }

      const elapsedMs = Math.max(1, payload.durationMs ?? Date.now() - requestStart);
      const estimatedOutputTokens = Math.max(1, Math.round(payload.text.length / 4));
      const inputTokens =
        typeof payload.inputTokens === 'number' && payload.inputTokens > 0
          ? payload.inputTokens
          : estimatedInputTokens;
      const outputTokens =
        typeof payload.outputTokens === 'number' && payload.outputTokens > 0
          ? payload.outputTokens
          : typeof payload.tokenCount === 'number' && payload.tokenCount > inputTokens
            ? payload.tokenCount - inputTokens
            : estimatedOutputTokens;
      const totalTokens =
        typeof payload.tokenCount === 'number' && payload.tokenCount > 0
          ? payload.tokenCount
          : inputTokens + outputTokens;
      const tokensPerSecond =
        typeof payload.tokensPerSecond === 'number' && payload.tokensPerSecond > 0
          ? payload.tokensPerSecond
          : Number((outputTokens / (elapsedMs / 1000)).toFixed(1));
      const { cleanMarkdown, events, carefulDates } = parseResponseEventsAndReport(
        payload.text,
        effectiveDomain,
      );
      const nowIso = new Date().toISOString();
      const preliminaryReplyTurn: ConversationTurn = {
        id: `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        exchangeId: userTurn.id,
        role: 'assistant',
        content: cleanMarkdown,
        eventCards: events,
        carefulDates,
        timestamp: nowIso,
        scope: payload.scope || targetScope,
        adapterId: payload.adapterId || targetAdapterId,
        model: payload.model || targetModel,
        durationMs: elapsedMs,
        tokenCount: totalTokens,
        inputTokenCount: inputTokens,
        outputTokenCount: outputTokens,
        tokensPerSecond,
        adapterProtocol: payload.protocol,
        refContextDomain: userTurn.refContextDomain,
        refContextTokens: userTurn.refContextTokens,
        refContextChars: userTurn.refContextChars,
      };

      const effectiveBaseTurns = baseThreadTurns.map((t) =>
        t.id === userTurn.id && t.role === 'user' ? userTurnWithPrompt : t,
      );
      const rootUserTurn =
        effectiveBaseTurns.find((t) => t.role === 'user') ?? userTurnWithPrompt;
      const combinedTurns = [...effectiveBaseTurns, preliminaryReplyTurn];
      const combinedExchanges = buildExchangesFromTurns(combinedTurns);
      const htmlReport = buildThreadHtmlDocument({
        title: rootUserTurn.threadName || userTurn.threadName || 'Assistant Report',
        exchanges: combinedExchanges,
        domain: rootUserTurn.promptDomain || effectiveDomain,
        month: rootUserTurn.threadMonth || userTurn.threadMonth,
        year: rootUserTurn.threadYear ?? userTurn.threadYear,
        rating: rootUserTurn.threadRating,
        createdAt: nowIso,
      });

      if (abortController.signal.aborted) {
        return;
      }

      const assistantTurn: ConversationTurn = {
        ...preliminaryReplyTurn,
        htmlReport,
      };

      setTurns((prev) => [
        ...prev
          .filter((t) => t.exchangeId !== userTurn.id)
          .map((t) =>
            t.id === userTurn.id && t.role === 'user' ? userTurnWithPrompt : t,
          ),
        assistantTurn,
      ]);

      // In Production Mode, save completed reports silently into backend folder structure (no left-hand Reports UI)
      if (isProductionApp) {
        const finalizedTurns = [...effectiveBaseTurns, assistantTurn].map((t) =>
          t.id === rootUserTurn.id && t.role === 'user'
            ? { ...t, isFinalized: true }
            : t,
        );
        const silentRecord: RatedThreadRecord = {
          id: rootUserTurn.id,
          turns: finalizedTurns,
          ratedAt: nowIso,
          isFinalized: true,
        };
        setRatedThreads((prevRated) => {
          const withoutCurrent = prevRated.filter((item) => item.id !== rootUserTurn.id);
          return [silentRecord, ...withoutCurrent];
        });
        void syncReportToDisk(silentRecord, htmlReport);
      }

      setSessionTokens((prev) => prev + totalTokens);
      setTelemetry((prev) => ({
        ...prev,
        phase: 'Ready',
        isThinking: false,
        startedAtMs: undefined,
        inputTokens,
        outputTokens,
        totalTokens,
        tokensPerSecond,
        durationMs: Date.now() - requestStartedAt,
        lastError: '',
      }));

      pushContextLog(
        'success',
        `${targetScope} reply in ${(elapsedMs / 1000).toFixed(2)}s · ${
          totalTokens !== undefined
            ? `${totalTokens} tok (in ${inputTokens ?? '—'} / out ${outputTokens ?? '—'})`
            : 'tokens n/a'
        }${tokensPerSecond !== undefined ? ` @ ${tokensPerSecond.toFixed(1)} tok/s` : ''}`,
      );

      if (settings.notifications?.soundOnReply !== false) {
        playReplyChime(false);
      }
      const replyTitle = `What's up · ${targetScope === 'private' ? 'Private' : 'Public'} reply ready`;
      const cleanedPreview = cleanMarkdown.replace(/\s+/g, ' ').trim();
      const shortPreview =
        cleanedPreview.length > 110 ? `${cleanedPreview.slice(0, 107)}...` : cleanedPreview;
      if (settings.notifications?.desktopNotificationOnReply !== false && shortPreview) {
        showDesktopNotification(replyTitle, shortPreview);
      }
      if (!isProductionApp && shortPreview) {
        setReplyToast({ title: replyTitle, preview: shortPreview, isError: false });
        if (replyToastTimerRef.current) window.clearTimeout(replyToastTimerRef.current);
        replyToastTimerRef.current = window.setTimeout(() => setReplyToast(null), 4500);
      }

      const shouldAutoSpeak =
        targetScope === 'public'
          ? settings.voice.autoSpeakPublic
          : settings.voice.autoSpeakPrivate;
      if (shouldAutoSpeak) {
        if (settings.notifications?.soundOnReply !== false) {
          setTimeout(() => speech.speakText(assistantTurn.id, assistantTurn.content), 240);
        } else {
          speech.speakText(assistantTurn.id, assistantTurn.content);
        }
      }

      setIsChatBarOpen(false);
    } catch (err) {
      if (
        abortController.signal.aborted ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Request failed.';
      const errorTurn: ConversationTurn = {
        id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        exchangeId: userTurn.id,
        role: 'error',
        content: errorMessage,
        timestamp: new Date().toISOString(),
        scope: targetScope,
        adapterId: targetAdapterId,
        model: targetModel,
        durationMs: Math.max(0, Date.now() - requestStart),
      };
      setTurns((prev) => [
        ...prev.filter((t) => t.exchangeId !== userTurn.id),
        errorTurn,
      ]);
      setTelemetry((prev) => ({
        ...prev,
        phase: 'Error',
        isThinking: false,
        startedAtMs: undefined,
        durationMs: Date.now() - requestStartedAt,
        lastError: `${targetScope}: ${errorMessage}`,
      }));
      pushContextLog('error', `${targetScope} response failed: ${errorMessage}`);

      if (settings.notifications?.soundOnReply !== false) {
        playReplyChime(true);
      }
      if (!isProductionApp) {
        const errTitle = "What's up";
        const friendlyError = 'Try "What\'s up" little later ..';
        setReplyToast({ title: errTitle, preview: friendlyError, isError: true });
        if (replyToastTimerRef.current) window.clearTimeout(replyToastTimerRef.current);
        replyToastTimerRef.current = window.setTimeout(() => setReplyToast(null), 5000);
      }
    } finally {
      if (activeRequestAbortRef.current?.exchangeId === userTurn.id) {
        activeRequestAbortRef.current = null;
        setIsSending(false);
      } else if (!activeRequestAbortRef.current) {
        setIsSending(false);
      }
    }
  };

  const handleCancelRequest = useCallback(() => {
    const active = activeRequestAbortRef.current;
    if (!active) {
      setIsSending(false);
      return;
    }
    active.controller.abort();
    activeRequestAbortRef.current = null;
    setIsSending(false);

    const cancelledId = active.exchangeId;
    setTurns((prev) =>
      prev.filter((t) => t.id !== cancelledId && t.exchangeId !== cancelledId),
    );
    setTelemetry((prev) => ({
      ...prev,
      phase: 'Idle',
      isThinking: false,
      startedAtMs: undefined,
      lastError: '',
    }));
    pushContextLog('info', 'Request cancelled by user');
  }, [pushContextLog]);

  const handleSendMessage = async ({
    text,
    inputMode,
    threadName,
    promptDomain,
    isFollowUp,
    targetMonth,
    targetYear,
  }: SendThreadMessagePayload) => {
    const rootUserTurn = turns.find((t) => t.role === 'user');
    if (isFollowUp && rootUserTurn?.isFinalized) {
      return;
    }
    const effectiveScope: ConversationScope = isProductionApp
      ? 'public'
      : ((isFollowUp ? rootUserTurn?.scope : undefined) ?? scope);
    const activeProdPublicAdapter: PublicAdapterId =
      settings.publicLlm.activeAdapter === 'fable' ? 'fable' : 'gemini';
    const selectedPublicAdapter: PublicAdapterId = isProductionApp
      ? activeProdPublicAdapter
      : settings.publicLlm.activeAdapter;
    const selectedAdapterId: AnyAdapterId =
      effectiveScope === 'private'
        ? settings.privateLlm.activeAdapter
        : selectedPublicAdapter;
    const selectedModelName =
      effectiveScope === 'private'
        ? settings.privateLlm.selectedModel || 'unselected'
        : settings.publicLlm.adapters[selectedPublicAdapter].model;

    const currentActiveMonth =
      targetMonth ?? settingsRef.current.contextCache.activeMonth;
    const currentActiveYear =
      targetYear ?? settingsRef.current.contextCache.activeYear;
    const inheritedMonth =
      (isFollowUp ? rootUserTurn?.threadMonth : undefined) ||
      getMonthNameFromNumber(currentActiveMonth);
    const inheritedYear =
      (isFollowUp ? rootUserTurn?.threadYear : undefined) ??
      currentActiveYear;
    const effectiveDomain: PromptDomain = promptDomain ?? activePromptDomain;
    const domainQuery = getDomainQueryValue(effectiveDomain);
    let effectiveThreadName =
      isFollowUp && rootUserTurn?.threadName?.trim()
        ? rootUserTurn.threadName.trim()
        : threadName.trim();

    if (!isFollowUp) {
      const matchingExisting = ratedThreads.filter((rec) => {
        const q = rec.turns.find((t) => t.role === 'user');
        const a = [...rec.turns].reverse().find((t) => t.role === 'assistant');
        const recAdapter = a?.adapterId ?? q?.adapterId;
        const recMonth = (q?.threadMonth || '').toLowerCase();
        const recYear = q?.threadYear;
        const recDomain = q?.promptDomain ?? 'astrology';
        return (
          recMonth === (inheritedMonth || '').toLowerCase() &&
          recYear === inheritedYear &&
          recDomain === effectiveDomain &&
          recAdapter === selectedAdapterId
        );
      });
      if (isProductionApp && matchingExisting.length > 0) {
        const providerLabel = selectedAdapterId === 'fable' ? 'Fable' : 'Gemini';
        setMonthSwitchError(
          `A ${providerLabel} report for this domain already exists in ${inheritedMonth} ${inheritedYear}.`,
        );
        return;
      }
      const runNumber = matchingExisting.length + 1;
      const baseTitle = effectiveThreadName || 'Report';
      const isGenericDomainTitle = /^(career|family|finance|love|health|general)$/i.test(
        baseTitle,
      );
      if (isGenericDomainTitle) {
        effectiveThreadName = `${baseTitle} Report ${runNumber}`;
      } else if (
        matchingExisting.some((rec) => {
          const q = rec.turns.find((t) => t.role === 'user');
          return (q?.threadName || '').trim().toLowerCase() === baseTitle.toLowerCase();
        })
      ) {
        effectiveThreadName = `${baseTitle} (${runNumber})`;
      }
    }

    const userTurnId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const initialUserTurn: ConversationTurn = {
      id: userTurnId,
      responseScopes: [effectiveScope],
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      inputMode,
      scope: effectiveScope,
      adapterId: selectedAdapterId,
      model: selectedModelName,
      promptDomain: effectiveDomain,
      threadName: effectiveThreadName,
      threadMonth: inheritedMonth,
      threadYear: inheritedYear,
      cachedContext: isFollowUp ? rootUserTurn?.cachedContext : undefined,
      refContextDomain: isFollowUp
        ? rootUserTurn?.refContextDomain ?? domainQuery
        : domainQuery,
      refContextTokens: isFollowUp ? rootUserTurn?.refContextTokens : undefined,
      refContextChars: isFollowUp ? rootUserTurn?.refContextChars : undefined,
    };

    const nextBaseTurns = [...turns, initialUserTurn];
    setMonthSwitchError(null);
    setTurns(nextBaseTurns);
    setActiveReportExchangeId(null);
    setIsChatBarOpen(false);

    if (activeRequestAbortRef.current) {
      activeRequestAbortRef.current.controller.abort();
    }
    const abortController = new AbortController();
    activeRequestAbortRef.current = {
      exchangeId: userTurnId,
      controller: abortController,
    };

    let resolvedUserTurn = initialUserTurn;
    let resolvedBaseTurns = nextBaseTurns;
    let overrideCachedContext: string | undefined = isFollowUp
      ? rootUserTurn?.cachedContext
      : undefined;

    if (!isFollowUp) {
      const targetMonthNum =
        getMonthNumberFromName(inheritedMonth) ??
        settingsRef.current.contextCache.activeMonth ??
        new Date().getMonth() + 1;
      const targetYearNum =
        inheritedYear ??
        settingsRef.current.contextCache.activeYear ??
        new Date().getFullYear();

      setIsSending(true);
      setNowMs(Date.now());
      setTelemetry((prev) => ({
        ...prev,
        phase: 'Thinking',
        isThinking: true,
        startedAtMs: Date.now(),
        promptChars: text.trim().length,
        historyTurnsUsed: 0,
        lastError: '',
        refContextDomain: domainQuery,
        refContextTokens: undefined,
        refContextChars: undefined,
      }));

      let fetchedText = '';
      let fetchedTokens = 0;
      let fetchedChars = 0;

      try {
        const ctxResult = await fetchReferenceContextFromApi({
          month: targetMonthNum,
          year: targetYearNum,
          domain: domainQuery,
          apiConfig: settingsRef.current.referenceContextApi,
          signal: abortController.signal,
        });
        if (abortController.signal.aborted) return;

        fetchedText = ctxResult.text;
        fetchedTokens = estimateTokens(ctxResult.text);
        fetchedChars = ctxResult.text.length;

        void handleApplyFetchedContext({
          text: ctxResult.text,
          month: targetMonthNum,
          year: targetYearNum,
          fetchedAt: ctxResult.fetchedAt,
        });
        pushContextLog(
          'success',
          `Fetched Reference Context (domain=${domainQuery} · ${formatShortYearMonth(targetMonthNum, targetYearNum)}): ${fetchedTokens.toLocaleString()} tokens (${fetchedChars.toLocaleString()} ch)`,
        );
      } catch (err) {
        if (
          abortController.signal.aborted ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return;
        }
        const msg =
          err instanceof Error ? err.message : 'Reference Context API endpoint is unavailable.';
        pushContextLog(
          'error',
          `Reference Context fetch failed (domain=${domainQuery} · ${formatShortYearMonth(targetMonthNum, targetYearNum)}): ${msg}`,
        );
      }

      if (abortController.signal.aborted) return;

      overrideCachedContext = fetchedText;
      resolvedUserTurn = {
        ...initialUserTurn,
        cachedContext: fetchedText,
        refContextDomain: domainQuery,
        refContextTokens: fetchedTokens,
        refContextChars: fetchedChars,
      };
      resolvedBaseTurns = nextBaseTurns.map((t) =>
        t.id === userTurnId ? resolvedUserTurn : t,
      );
      setTurns(resolvedBaseTurns);
      setTelemetry((prev) => ({
        ...prev,
        refContextDomain: domainQuery,
        refContextTokens: fetchedTokens,
        refContextChars: fetchedChars,
      }));
    }

    await executeExchangeRequest({
      userTurn: resolvedUserTurn,
      precedingTurns: turns,
      baseThreadTurns: resolvedBaseTurns,
      effectiveDomain,
      overrideCachedContext,
      abortController,
    });
  };

  const handleRetryExchange = async (exchangeId: string) => {
    if (isSending) return;
    const targetIndex = turns.findIndex(
      (t) => t.id === exchangeId && t.role === 'user',
    );
    if (targetIndex < 0) return;

    const existingUserTurn = turns[targetIndex];
    const rootUserTurn = turns.find((t) => t.role === 'user');
    const retryScope: ConversationScope = existingUserTurn.scope ?? scope;
    const selectedAdapterId: AnyAdapterId =
      retryScope === 'private'
        ? settings.privateLlm.activeAdapter
        : settings.publicLlm.activeAdapter;
    const selectedModelName =
      retryScope === 'private'
        ? settings.privateLlm.selectedModel || 'unselected'
        : settings.publicLlm.adapters[settings.publicLlm.activeAdapter].model;

    const refreshedUserTurn: ConversationTurn = {
      ...existingUserTurn,
      scope: retryScope,
      responseScopes: [retryScope],
      adapterId: selectedAdapterId,
      model: selectedModelName,
    };

    const precedingTurns = turns.slice(0, targetIndex);
    const cleanedTurns = turns
      .filter((t) => t.exchangeId !== exchangeId)
      .map((t) => (t.id === exchangeId ? refreshedUserTurn : t));

    setTurns(cleanedTurns);
    setIsChatBarOpen(false);

    await executeExchangeRequest({
      userTurn: refreshedUserTurn,
      precedingTurns,
      baseThreadTurns: cleanedTurns,
      effectiveDomain: refreshedUserTurn.promptDomain ?? activePromptDomain,
      overrideCachedContext: existingUserTurn.cachedContext ?? rootUserTurn?.cachedContext,
    });
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex mica-canvas text-slate-900 dark:text-slate-100 select-none sm:select-auto">
      {/* Left WinUI 3 NavigationView Rail (Dev Mode ONLY — Hidden in Production Mode) */}
      {!isProductionApp && isLeftRailOpen && (
        <>
          <aside
            style={{ width: leftRailWidth }}
            className="hidden md:flex shrink-0 flex-col justify-between border-r border-slate-200/80 dark:border-slate-800/80 bg-white/55 dark:bg-slate-900/55 backdrop-blur-xl p-3 overflow-hidden"
          >
            <div className="flex-1 min-h-0 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  setActiveReportExchangeId(null);
                }}
                title="Home"
                aria-label="Home"
                className="px-2.5 py-2 inline-flex items-center justify-center rounded-xl bg-white/75 dark:bg-slate-800/75 border border-slate-200/80 dark:border-slate-700/70 hover:bg-white dark:hover:bg-slate-800 transition-colors shrink-0 self-start shadow-2xs"
                style={{ color: 'var(--pa-accent)' }}
              >
                <Home className="w-5 h-5" />
              </button>

              <ReportTreeSidebar
                reports={ratedThreads}
                activeReportId={activeReportExchangeId}
                activePeriodMonth={settings.contextCache.activeMonth}
                activePeriodYear={settings.contextCache.activeYear}
                onSelectReport={(recordId) => {
                  setIsSettingsOpen(false);
                  setActiveReportExchangeId(recordId);
                }}
                onRenameReport={(recordId, newName) =>
                  void handleRenameReportCommit(recordId, newName)
                }
                onUpdateComment={(recordId, comment) =>
                  void handleUpdateReportComment(recordId, comment)
                }
                onMoveReport={(recordId, target) =>
                  void handleMoveSidebarReport(recordId, target)
                }
                onDeleteReport={(recordId) =>
                  handleDeleteSidebarReport(recordId)
                }
              />
            </div>

          </aside>

          {/* Left Rail Drag Splitter */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize left navigation rail"
            title="Drag to resize left rail"
            onPointerDown={(e) => {
              e.preventDefault();
              startPaneResize('left', e.clientX, leftRailWidth);
            }}
            className="hidden md:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center group hover:bg-sky-500/15 transition-colors"
          >
            <span
              className={`w-0.5 h-9 rounded-full transition-colors ${
                activeResizer === 'left'
                  ? 'bg-sky-500'
                  : 'bg-slate-300/70 dark:bg-slate-700/70 group-hover:bg-sky-500/80'
              }`}
            />
          </div>
        </>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {isProductionApp ? (
          /* Minimal Production Header: Left Show/Hide Reports Slider Icon + Right Watch Out Toggle */
          <header className="relative h-14 shrink-0 px-4 sm:px-6 border-b border-slate-800/80 bg-[#080d1a]/95 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                data-prod-reports-toggle="true"
                onClick={() => setIsProdReportsMenuOpen((prev) => !prev)}
                aria-expanded={isProdReportsMenuOpen}
                aria-pressed={isProdReportsMenuOpen}
                aria-label={isProdReportsMenuOpen ? 'Hide Reports slider' : 'Show Reports slider'}
                title={
                  isProdReportsMenuOpen
                    ? `Hide Reports (${prodReportsDirDisplay})`
                    : `Show Reports (${prodReportsDirDisplay})`
                }
                className={`inline-flex p-1.5 rounded-lg border transition-colors shrink-0 cursor-pointer ${
                  isProdReportsMenuOpen
                    ? 'bg-slate-800 border-sky-400/70 text-sky-300'
                    : 'border-slate-700/80 bg-slate-800/85 text-sky-400 hover:bg-slate-800 hover:border-slate-600'
                }`}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasReportForRightPane && (
                <button
                  type="button"
                  onClick={() => setIsContextRailOpen((prev) => !prev)}
                  aria-label={isContextRailVisible ? 'Hide Watch Out Timeline' : 'Show Watch Out Timeline'}
                  aria-pressed={isContextRailVisible}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    isContextRailVisible
                      ? 'border-amber-400/70 bg-amber-500/15 text-amber-200'
                      : 'border-slate-700/80 bg-slate-900/90 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Watch Out</span>
                  {activeCarefulDates.length > 0 && (
                    <span className="rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-200">
                      {activeCarefulDates.length}
                    </span>
                  )}
                </button>
              )}
            </div>
          </header>
        ) : (
          /* Dev Mode Top Menu Bar */
          <header className="h-14 shrink-0 px-4 sm:px-6 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-slate-900/75 backdrop-blur-xl flex items-center justify-between sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 sm:gap-4">
            {/* Zone 1: Left Rail Toggle + Title + Icon-only Top Navigation */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setIsLeftRailOpen((prev) => !prev)}
                aria-label={isLeftRailOpen ? 'Hide left rail' : 'Show left rail'}
                title={isLeftRailOpen ? 'Hide left rail' : 'Show left rail'}
                aria-pressed={isLeftRailOpen}
                className={`hidden md:inline-flex p-1.5 rounded-lg border transition-colors shrink-0 ${
                  isLeftRailOpen
                    ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                    : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                style={isLeftRailOpen ? { color: 'var(--pa-accent-text)' } : undefined}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  setActiveReportExchangeId(null);
                }}
                title="Home"
                aria-label="Home"
                className="md:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 shrink-0"
                style={{ color: 'var(--pa-accent)' }}
              >
                <Home className="w-4 h-4" />
              </button>
              {(isSettingsOpen || activeReportRecord) && (
                <span className="font-display text-sm font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                  {isSettingsOpen ? 'Settings' : 'Reference Report'}
                </span>
              )}

              <span
                aria-hidden="true"
                className="hidden md:inline-block h-4 w-px bg-slate-200/90 dark:bg-slate-700/80 mx-0.5 shrink-0"
              />

              <nav className="flex items-center gap-1 shrink-0" aria-label="Primary pages">
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen((prev) => !prev);
                    setActiveReportExchangeId(null);
                  }}
                  aria-label="Settings"
                  title="Settings"
                  aria-current={isSettingsOpen ? 'page' : undefined}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                    isSettingsOpen
                      ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 shadow-xs'
                      : 'border-transparent text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:border-slate-200/80 dark:hover:border-slate-700/80'
                  }`}
                  style={isSettingsOpen ? { color: 'var(--pa-accent)' } : undefined}
                >
                  <Settings className="w-4 h-4" />
                </button>
              </nav>
            </div>

            {/* Zone 2: Private / Public Toggle in Top Menu Bar */}
            <div
              role="group"
              aria-label="Conversation target"
              title={
                canSwitchScope
                  ? 'Choose Private or Public for your new thread'
                  : 'Private / Public switching is only available when starting a new thread'
              }
              className={`inline-flex items-center justify-self-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/80 shrink-0 transition-opacity ${
                canSwitchScope ? '' : 'opacity-55 cursor-not-allowed'
              }`}
            >
              <button
                type="button"
                disabled={!canSwitchScope}
                aria-pressed={displayedScope === 'private'}
                onClick={() => {
                  if (canSwitchScope) setScope('private');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  !canSwitchScope ? 'cursor-not-allowed' : 'cursor-pointer'
                } ${
                  displayedScope === 'private'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 disabled:hover:text-slate-600 dark:disabled:hover:text-slate-400'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Private</span>
              </button>
              <button
                type="button"
                disabled={!canSwitchScope}
                aria-pressed={displayedScope === 'public'}
                onClick={() => {
                  if (canSwitchScope) setScope('public');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  !canSwitchScope ? 'cursor-not-allowed' : 'cursor-pointer'
                } ${
                  displayedScope === 'public'
                    ? 'bg-white dark:bg-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 disabled:hover:text-slate-600 dark:disabled:hover:text-slate-400'
                }`}
                style={displayedScope === 'public' ? { color: 'var(--pa-accent-text)' } : undefined}
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Public</span>
              </button>
            </div>

            {/* Zone 3: Icon-Only Markdown Upload + Care Must Be Taken Toggle */}
            <div className="flex items-center justify-end justify-self-end gap-1.5 shrink-0">
              <input
                ref={mdFileInputRef}
                type="file"
                accept=".md,.markdown,text/markdown,text/plain"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleImportMarkdownFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => mdFileInputRef.current?.click()}
                aria-label="Import Markdown report"
                title="Import Markdown report (.md)"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
              </button>
              {hasReportForRightPane && (
                <button
                  type="button"
                  onClick={() => {
                    setIsContextRailOpen((prev) => !prev);
                  }}
                  aria-label={isContextRailVisible ? 'Hide Care Must Be Taken' : 'Show Care Must Be Taken'}
                  title={isContextRailVisible ? 'Hide Care Must Be Taken' : 'Show Care Must Be Taken'}
                  aria-pressed={isContextRailVisible}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors shrink-0 cursor-pointer ${
                    isContextRailVisible
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  style={isContextRailVisible ? { color: 'var(--pa-accent-text)' } : undefined}
                >
                  <PanelRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </header>
        )}

        {/* Main Assistant Surface */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {isProductionApp ? (
            turns.length === 0 ? (
              <ProductionStage1Three
                activeMonthNum={settings.contextCache.activeMonth ?? new Date().getMonth() + 1}
                activeYearNum={settings.contextCache.activeYear ?? new Date().getFullYear()}
                activePromptDomain={activePromptDomain}
                activeProvider={
                  settings.publicLlm.activeAdapter === 'fable' ? 'fable' : 'gemini'
                }
                ratedThreads={ratedThreads}
                isSending={isSending}
                switchingMonthKey={switchingMonthKey}
                monthSwitchError={monthSwitchError}
                onDismissMonthSwitchError={() => setMonthSwitchError(null)}
                onPromptDomainChange={(activeDomain) =>
                  setSettings((previous) => ({
                    ...previous,
                    promptBuilder: {
                      ...previous.promptBuilder,
                      activeDomain,
                    },
                  }))
                }
                onSelectQuickMonth={(month, year) => void handleQuickSelectMonth(month, year)}
                onOpenExistingReport={handleOpenProductionReport}
                onSubmitQuestion={(payload) =>
                  void handleSendMessage({
                    text: payload.text,
                    inputMode: 'text',
                    threadName: payload.threadName,
                    promptDomain: payload.domain,
                    isFollowUp: false,
                    targetMonth: payload.month,
                    targetYear: payload.year,
                  })
                }
              />
            ) : (
              <ProductionCards3D
                cards={productionStageData.cards}
                readOutSections={productionStageData.readOutSections}
                isWaitingForReply={productionStageData.isWaitingForReply}
                errorDetail={productionStageData.errorDetail}
                questionText={productionStageData.latestUserTurn?.content}
                periodLabel={activeCarefulPeriodLabel}
                domain={productionStageData.latestUserTurn?.promptDomain}
                providerAdapter={
                  productionStageData.latestUserTurn?.adapterId === 'fable'
                    ? 'fable'
                    : productionStageData.latestUserTurn?.adapterId === 'gemini'
                      ? 'gemini'
                      : settings.publicLlm.activeAdapter === 'fable'
                        ? 'fable'
                        : 'gemini'
                }
                onCancelRequest={handleCancelRequest}
                onRetry={() => {
                  if (productionStageData.latestUserTurn) {
                    void handleRetryExchange(productionStageData.latestUserTurn.id);
                  }
                }}
                onStartNewThread={handleStartNewThread}
              />
            )
          ) : isSettingsOpen ? (
            <SettingsPage
              settings={settings}
              onApplySettings={(next) => {
                const dirChanged = (next.reportsDir || '').trim() !== (settings.reportsDir || '').trim();
                setSettings(next);
                if (dirChanged) {
                  void reloadReportsFromDisk(next.reportsDir || undefined);
                }
              }}
              onClose={() => setIsSettingsOpen(false)}
              speech={speech}
              messageCount={turns.length}
              configFileInfo={configFileInfo}
              onResetSettings={() => setSettings(DEFAULT_SETTINGS)}
              onContextLog={pushContextLog}
            />
          ) : activeReportRecord ? (
            <ReportDocumentPage
              exchangeId={activeReportRecord.id}
              turns={activeReportRecord.turns}
              reportFilePath={activeReportRecord.filePath}
              reportsDir={settings.reportsDir}
              isExternalFile={activeReportRecord.isExternalFile}
              comment={activeReportRecord.comment}
              onUpdateComment={(id, nextComment) =>
                void handleUpdateReportComment(id, nextComment)
              }
              onViewEventCards={(exchangeId) => {
                // If an active unarchived thread is on stage with a reply, archive it first
                const currentRoot = turns.find((t) => t.role === 'user');
                const currentHasReply = turns.some((t) => t.role === 'assistant');
                if (
                  currentRoot &&
                  currentHasReply &&
                  currentRoot.id !== exchangeId &&
                  !ratedThreads.some((r) => r.id === currentRoot.id)
                ) {
                  const archivedTurns = turns.map((t) =>
                    t.id === currentRoot.id && t.role === 'user'
                      ? { ...t, isFinalized: true }
                      : t,
                  );
                  const archivedRecord: RatedThreadRecord = {
                    id: currentRoot.id,
                    turns: archivedTurns,
                    ratedAt: new Date().toISOString(),
                    isFinalized: true,
                  };
                  setRatedThreads((prev) => [archivedRecord, ...prev]);
                  if (reportsHydratedRef.current) {
                    void syncReportToDisk(archivedRecord);
                  }
                }

                const record = ratedThreads.find((r) => r.id === exchangeId);
                if (record) {
                  const firstUserIdx = record.turns.findIndex((t) => t.role === 'user');
                  const qTurn = firstUserIdx >= 0 ? record.turns[firstUserIdx] : undefined;
                  if (qTurn?.scope) setScope(qTurn.scope);
                  const loadedTurns = record.turns.map((t, idx) =>
                    idx === firstUserIdx ? { ...t, isFinalized: true } : t,
                  );
                  setTurns(loadedTurns);
                }
                setIsChatBarOpen(false);
                setActiveReportExchangeId(null);
              }}
              onClose={() => handleStartNewThread()}
            />
          ) : (
            <WorkbenchPage
              scope={displayedScope}
              settings={settings}
              turns={turns}
              isArchivedThread={Boolean(
                turns.some((t) => t.role === 'user' && t.isFinalized) ||
                  (() => {
                    const rootQ = turns.find((t) => t.role === 'user');
                    return rootQ ? ratedThreads.some((r) => r.id === rootQ.id) : false;
                  })(),
              )}
              activePromptDomain={activePromptDomain}
              isChatBarOpen={isChatBarOpen}
              onToggleChatBar={() => setIsChatBarOpen((prev) => !prev)}
              onOpenChatBar={() => setIsChatBarOpen(true)}
              onPromptDomainChange={(activeDomain) =>
                setSettings((previous) => ({
                  ...previous,
                  promptBuilder: {
                    ...previous.promptBuilder,
                    activeDomain,
                  },
                }))
              }
              isSending={isSending}
              speech={speech}
              onSendMessage={(payload) => void handleSendMessage(payload)}
              onCancelRequest={handleCancelRequest}
              onRetryExchange={(exchangeId) => void handleRetryExchange(exchangeId)}
              onUpdateExchangeMetadata={handleUpdateExchangeMetadata}
              onClearConversation={handleStartNewThread}
              onDeleteExchange={(exchangeId) => {
                setTurns([]);
                setRatedThreads((previous) =>
                  previous.filter((item) => item.id !== exchangeId),
                );
                const query = settings.reportsDir
                  ? `?dir=${encodeURIComponent(settings.reportsDir)}`
                  : '';
                void fetch(`/api/reports/${encodeURIComponent(exchangeId)}${query}`, {
                  method: 'DELETE',
                }).catch(() => undefined);
                pushContextLog('info', 'Conversation thread deleted from session and local folder');
              }}
              onOpenSettings={() => {
                setActiveReportExchangeId(null);
                setIsSettingsOpen(true);
              }}
              showQuickMonthRainbow={true}
              switchingMonthKey={switchingMonthKey}
              monthSwitchError={monthSwitchError}
              onSelectQuickMonth={(month, year) => void handleQuickSelectMonth(month, year)}
              onDismissMonthSwitchError={() => setMonthSwitchError(null)}
            />
          )}

          {/* Floating Left-Hand Production Reports Slider */}
          <AnimatePresence>
            {isProductionApp && isProdReportsMenuOpen && (
              <ProductionReportsMenu
                reports={ratedThreads}
                activeReportId={activeProductionReportId}
                onSelectReport={handleOpenProductionReport}
                onDeleteReport={handleDeleteSidebarReport}
                onClose={() => setIsProdReportsMenuOpen(false)}
              />
            )}
          </AnimatePresence>

          {/* Floating Right-Hand Watch-Out Drawer */}
          <AnimatePresence>
            {isContextRailVisible &&
              (isProductionApp ? (
                <ProductionTimelinePanel
                  carefulDates={activeCarefulDates}
                  periodLabel={activeCarefulPeriodLabel}
                  onClose={() => setIsContextRailOpen(false)}
                />
              ) : (
                !isSettingsOpen && (
                  <ContextMonitorRail
                    carefulDates={activeCarefulDates}
                    periodLabel={activeCarefulPeriodLabel}
                    onClose={() => setIsContextRailOpen(false)}
                  />
                )
              ))}
          </AnimatePresence>
        </div>

        {/* Bottom Panel Drag Splitter (Dev Mode ONLY) */}
        {!isProductionApp && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize bottom status panel"
            title="Drag up or down to resize bottom panel"
            onPointerDown={(e) => {
              e.preventDefault();
              startPaneResize('bottom', e.clientY, bottomBarHeight);
            }}
            className="h-1.5 shrink-0 cursor-row-resize flex items-center justify-center border-t border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/75 group hover:bg-sky-500/15 transition-colors"
          >
            <span
              className={`h-0.5 w-11 rounded-full transition-colors ${
                activeResizer === 'bottom'
                  ? 'bg-sky-500'
                  : 'bg-slate-300/75 dark:bg-slate-700/75 group-hover:bg-sky-500/80'
              }`}
            />
          </div>
        )}

        {/* Bottom Panel Status Bar */}
        {isProductionApp ? (
          <footer className="h-9 shrink-0 px-4 sm:px-6 border-t border-slate-800/80 bg-[#080d1a]/95 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0 text-slate-200">
              <span
                className="w-2 h-2 rounded-full shrink-0 bg-sky-400"
                aria-hidden="true"
              />
              <span className="truncate font-medium text-xs">
                Public ·{' '}
                {(settings.publicLlm.activeAdapter === 'fable' ? 'Fable' : 'Gemini')}
              </span>
              <div
                role="group"
                aria-label="Public LLM provider toggle"
                title={
                  canSwitchScope
                    ? 'Switch Public provider between Gemini and Fable'
                    : 'Gemini / Fable switching is only available on Home before starting a report'
                }
                className={`inline-flex items-center p-0.5 rounded-md bg-slate-800/95 border border-slate-700/80 shrink-0 transition-opacity ${
                  canSwitchScope ? '' : 'opacity-55 cursor-not-allowed'
                }`}
              >
                {(['gemini', 'fable'] as const).map((providerId) => {
                  const activeProdAdapter =
                    settings.publicLlm.activeAdapter === 'fable' ? 'fable' : 'gemini';
                  const isSelected = activeProdAdapter === providerId;
                  const label = providerId === 'gemini' ? 'Gemini' : 'Fable';
                  return (
                    <button
                      key={providerId}
                      type="button"
                      disabled={!canSwitchScope}
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (!canSwitchScope) return;
                        setSettings((previous) => ({
                          ...previous,
                          publicLlm: {
                            ...previous.publicLlm,
                            activeAdapter: providerId,
                          },
                        }));
                      }}
                      className={`px-2.5 py-0.5 rounded text-[11px] font-semibold leading-none transition-colors whitespace-nowrap shrink-0 ${
                        !canSwitchScope ? 'cursor-not-allowed' : 'cursor-pointer'
                      } ${
                        isSelected
                          ? 'bg-slate-950 text-sky-300 shadow-2xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 min-w-0">
              <span
                title={`Production Reports Directory: ${prodReportsDirDisplay}`}
                className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-400 truncate max-w-[260px]"
              >
                <FolderOpen className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                <span className="truncate">Reports: {prodReportsDirDisplay}</span>
              </span>
              <span className="hidden sm:inline text-slate-700">|</span>
              <button
                type="button"
                disabled={!canCopyPrompt}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyReportPrompt();
                }}
                aria-label={promptCopied ? 'Prompt copied' : 'Copy prompt'}
                title={
                  !canCopyPrompt
                    ? 'Trigger a report first to copy the outgoing prompt'
                    : promptCopied
                      ? 'Copied outgoing prompt to clipboard'
                      : 'Copy captured prompt sent to LLM'
                }
                className={`inline-flex items-center justify-center w-6 h-6 rounded border transition-colors shrink-0 ${
                  canCopyPrompt
                    ? promptCopied
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300 cursor-pointer'
                      : 'border-slate-700/80 bg-slate-800/90 text-slate-300 hover:text-sky-300 hover:border-sky-500/60 hover:bg-slate-800 cursor-pointer'
                    : 'border-slate-800/80 bg-slate-900/60 text-slate-600 opacity-50 cursor-not-allowed'
                }`}
              >
                {promptCopied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  displayedTelemetry.phase === 'Thinking'
                    ? 'text-sky-400 font-semibold'
                    : displayedTelemetry.phase === 'Error'
                      ? 'text-red-400 font-semibold'
                      : displayedTelemetry.phase === 'Ready'
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-400'
                }`}
              >
                {displayedTelemetry.isThinking && displayedTelemetry.startedAtMs
                  ? `Thinking ${((Math.max(0, nowMs - displayedTelemetry.startedAtMs)) / 1000).toFixed(1)}s`
                  : displayedTelemetry.phase}
              </span>
            </div>
          </footer>
        ) : (
          <footer
            style={{ height: bottomBarHeight }}
            className="shrink-0 px-4 sm:px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl flex flex-col justify-center gap-1.5 text-xs overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0 text-slate-600 dark:text-slate-300">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      displayedScope === 'private' ? '#10B981' : 'var(--pa-accent)',
                  }}
                  aria-hidden="true"
                />
                <span className="truncate font-medium">{connectedEngineText}</span>

                {displayedScope === 'public' && (
                  <div
                    role="group"
                    aria-label="Public LLM provider toggle"
                    title={
                      canSwitchScope
                        ? 'Switch Public provider between Gemini and Fable'
                        : 'Gemini / Fable switching is only available on Home before starting a report'
                    }
                    className={`inline-flex items-center p-0.5 rounded-md bg-slate-200/75 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/80 shrink-0 transition-opacity ${
                      canSwitchScope ? '' : 'opacity-55 cursor-not-allowed'
                    }`}
                  >
                    {(['gemini', 'fable'] as const).map((providerId) => {
                      const isSelected = settings.publicLlm.activeAdapter === providerId;
                      const label = providerId === 'gemini' ? 'Gemini' : 'Fable';
                      return (
                        <button
                          key={providerId}
                          type="button"
                          disabled={!canSwitchScope}
                          aria-pressed={isSelected}
                          onClick={() => {
                            if (!canSwitchScope) return;
                            setSettings((previous) => ({
                              ...previous,
                              publicLlm: {
                                ...previous.publicLlm,
                                activeAdapter: providerId,
                              },
                            }));
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold leading-none transition-colors whitespace-nowrap shrink-0 ${
                            !canSwitchScope ? 'cursor-not-allowed' : 'cursor-pointer'
                          } ${
                            isSelected
                              ? 'bg-white dark:bg-slate-900 shadow-2xs text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                          style={isSelected ? { color: 'var(--pa-accent-text)' } : undefined}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 font-mono text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                <button
                  type="button"
                  disabled={!canCopyPrompt}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCopyReportPrompt();
                  }}
                  aria-label={promptCopied ? 'Prompt copied' : 'Copy prompt'}
                  title={
                    !canCopyPrompt
                      ? 'Send a prompt first to copy the outgoing payload'
                      : promptCopied
                        ? 'Copied captured prompt to clipboard'
                        : 'Copy System Instruction, Reference Context, and Outgoing Message'
                  }
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors shrink-0 ${
                    canCopyPrompt
                      ? promptCopied
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 cursor-pointer shadow-2xs'
                        : 'border-slate-200/90 dark:border-slate-700/85 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 cursor-pointer shadow-2xs'
                      : 'border-slate-200/60 dark:border-slate-800/70 bg-slate-100/60 dark:bg-slate-900/50 text-slate-400 dark:text-slate-600 opacity-55 cursor-not-allowed'
                  }`}
                >
                  {promptCopied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 shrink-0" style={canCopyPrompt ? { color: 'var(--pa-accent)' } : undefined} />
                  )}
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span
                  className={
                    displayedTelemetry.phase === 'Thinking'
                      ? 'text-sky-600 dark:text-sky-400 font-semibold'
                      : displayedTelemetry.phase === 'Error'
                        ? 'text-red-600 dark:text-red-400 font-semibold'
                        : displayedTelemetry.phase === 'Ready'
                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          : 'text-slate-500 dark:text-slate-400'
                  }
                >
                  {displayedTelemetry.isThinking && displayedTelemetry.startedAtMs
                    ? `Thinking ${((Math.max(0, nowMs - displayedTelemetry.startedAtMs)) / 1000).toFixed(1)}s`
                    : displayedTelemetry.phase}
                </span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                {displayedTelemetry.refContextDomain && (
                  <>
                    <span
                      title={`Reference Context fetched for domain=${displayedTelemetry.refContextDomain}: ${displayedTelemetry.refContextTokens !== undefined ? `${displayedTelemetry.refContextTokens.toLocaleString()} tokens (${(displayedTelemetry.refContextChars ?? 0).toLocaleString()} chars)` : 'fetching…'}`}
                      className="font-semibold"
                      style={{ color: 'var(--pa-accent-text)' }}
                    >
                      Domain ({displayedTelemetry.refContextDomain}):{' '}
                      {displayedTelemetry.refContextTokens !== undefined
                        ? `${displayedTelemetry.refContextTokens.toLocaleString()} tok`
                        : 'fetching…'}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                  </>
                )}
                <span
                  title={
                    displayedTelemetry.totalTokens !== undefined
                      ? `Input: ${displayedTelemetry.inputTokens?.toLocaleString() ?? '—'} · Output: ${displayedTelemetry.outputTokens?.toLocaleString() ?? '—'} · Total: ${displayedTelemetry.totalTokens.toLocaleString()}${sessionTokens > 0 ? ` · Session: ${sessionTokens.toLocaleString()}` : ''}`
                      : 'Total tokens (input + output)'
                  }
                >
                  Tokens:{' '}
                  {displayedTelemetry.isThinking && displayedTelemetry.inputTokens !== undefined
                    ? `~${displayedTelemetry.inputTokens.toLocaleString()} in`
                    : displayedTelemetry.totalTokens !== undefined
                      ? displayedTelemetry.totalTokens.toLocaleString()
                      : sessionTokens > 0
                        ? sessionTokens.toLocaleString()
                        : '—'}
                </span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span>
                  {displayedTelemetry.tokensPerSecond !== undefined
                    ? `${displayedTelemetry.tokensPerSecond.toFixed(1)} tok/s`
                    : '— tok/s'}
                </span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span>
                  Time:{' '}
                  {displayedTelemetry.isThinking && displayedTelemetry.startedAtMs
                    ? `${((Math.max(0, nowMs - displayedTelemetry.startedAtMs)) / 1000).toFixed(1)}s`
                    : displayedTelemetry.durationMs !== undefined
                      ? `${(displayedTelemetry.durationMs / 1000).toFixed(2)}s`
                      : '—'}
                </span>
                <span className="hidden xl:inline text-slate-300 dark:text-slate-700">|</span>
                <span className="hidden xl:inline text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                  {configFileInfo.filePath}
                </span>
              </div>
            </div>

            {bottomBarHeight >= 54 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/70 dark:border-slate-800/70 select-text">
                {displayedTelemetry.refContextDomain && (
                  <span>
                    Ref ({displayedTelemetry.refContextDomain}):{' '}
                    {displayedTelemetry.refContextTokens !== undefined
                      ? `${displayedTelemetry.refContextTokens.toLocaleString()} tok (${(displayedTelemetry.refContextChars ?? 0).toLocaleString()} ch)`
                      : 'fetching…'}
                  </span>
                )}
                <span>
                  Prompt Size:{' '}
                  {displayedTelemetry.promptChars > 0
                    ? `${displayedTelemetry.promptChars.toLocaleString()} ch (${displayedTelemetry.historyTurnsUsed}t)`
                    : '—'}
                </span>
                <span>
                  Input: {displayedTelemetry.inputTokens !== undefined ? displayedTelemetry.inputTokens.toLocaleString() : '—'}
                </span>
                <span>
                  Output: {displayedTelemetry.outputTokens !== undefined ? displayedTelemetry.outputTokens.toLocaleString() : '—'}
                </span>
                <span>
                  Session: {sessionTokens.toLocaleString()} tok
                </span>
                <span className={displayedTelemetry.lastError ? 'text-red-600 dark:text-red-400 truncate' : 'truncate'}>
                  Status: {displayedTelemetry.lastError || 'Healthy · No active errors'}
                </span>
              </div>
            )}
          </footer>
        )}
      </div>

      {/* Reply Arrival Toast Notification */}
      {replyToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 right-4 z-40 max-w-sm rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-xl px-4 py-3 flex items-start gap-3"
        >
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
              replyToast.isError ? 'ring-2 ring-red-500/80' : ''
            }`}
          >
            <WhatsAppSymbol className="w-7 h-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {replyToast.title}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5">
              {replyToast.preview}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyToast(null)}
            aria-label="Dismiss notification"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

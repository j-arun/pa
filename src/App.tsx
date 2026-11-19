import {
  BookOpen,
  Cloud,
  Home,
  Lock,
  Palette,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Pencil,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PromptBuilderPage } from './components/PromptBuilderPage';
import { ContextMonitorRail } from './components/ContextMonitorRail';
import { ReferenceContextPage } from './components/ReferenceContextPage';
import { ReportDocumentPage } from './components/ReportDocumentPage';
import { SettingsPage } from './components/SettingsPage';
import { WhatsAppSymbol } from './components/WhatsAppSymbol';
import {
  WorkbenchPage,
  type SendThreadMessagePayload,
  type ThreadMetadataPatch,
} from './components/WorkbenchPage';
import { useSpeechIO } from './hooks/useSpeechIO';
import type {
  AnyAdapterId,
  CarefulDateItem,
  ConversationScope,
  ConversationTurn,
  LlmContextLogEntry,
  LlmContextTelemetry,
  PromptDomain,
  RatedThreadRecord,
  ThemeMode,
  WorkbenchSettings,
} from './types/workbench';
import {
  DEFAULT_SETTINGS,
  loadRatedThreads,
  loadScope,
  loadSettings,
  saveConversation,
  saveRatedThreads,
  saveScope,
  saveSettings,
} from './utils/storage';
import {
  formatShortYearMonth,
  getMonthNameFromNumber,
  hasCustomPromptTemplates,
} from './utils/promptTemplates';
import {
  EVENT_EXTRACTION_SYSTEM_DIRECTIVE,
  buildThreadHtmlDocument,
  formatSidebarThreadLabel,
  parseResponseEventsAndReport,
  type ThreadHtmlExchangeInput,
} from './utils/eventParser';
import {
  playReplyChime,
  requestDesktopNotificationPermission,
  showDesktopNotification,
} from './utils/notify';

const THEME_CYCLE: ThemeMode[] = [
  'arctic-sky',
  'emerald-mist',
  'royal-amethyst',
  'midnight-slate',
];

function extractMajorTemplate(template: string): string {
  return template
    .replace(/(?:\r?\n)*[A-Za-z ]*request:\s*\{\{prompt\}\}/gi, '')
    .replace(/\{\{prompt\}\}/g, '')
    .trim();
}

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPromptBuilderOpen, setIsPromptBuilderOpen] = useState(false);
  const [isReferenceContextOpen, setIsReferenceContextOpen] = useState(false);
  const [activeReportExchangeId, setActiveReportExchangeId] = useState<string | null>(null);
  const [scope, setScope] = useState<ConversationScope>(() => loadScope());
  const [settings, setSettings] = useState<WorkbenchSettings>(() => loadSettings());
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [ratedThreads, setRatedThreads] = useState<RatedThreadRecord[]>(() =>
    loadRatedThreads(),
  );
  const activePromptDomain = settings.promptBuilder.activeDomain;
  const promptStyle = settings.promptBuilder.activeStyle;
  const promptTemplates = settings.promptBuilder.templates;
  const [isSending, setIsSending] = useState(false);
  const [configFileInfo, setConfigFileInfo] = useState<{
    filePath: string;
    platform: string;
    lastSavedAt?: string;
    syncError?: string;
    defaultReportsDir?: string;
    resolvedReportsDir?: string;
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
  const [replyToast, setReplyToast] = useState<{
    title: string;
    preview: string;
    isError: boolean;
  } | null>(null);
  const [reportContextMenu, setReportContextMenu] = useState<{
    recordId: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingReportName, setEditingReportName] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [isLeftRailOpen, setIsLeftRailOpen] = useState(true);
  const [isContextRailOpen, setIsContextRailOpen] = useState(false);
  const [isChatBarOpen, setIsChatBarOpen] = useState(false);
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
    return Number.isFinite(raw) && raw >= 28 && raw <= 220 ? raw : 30;
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
  const isContextRailVisible = isContextRailOpen;

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

  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  const effectiveTheme: Exclude<ThemeMode, 'system' | 'light' | 'dark'> =
    settings.theme === 'system'
      ? systemPrefersDark
        ? 'midnight-slate'
        : 'arctic-sky'
      : settings.theme === 'light'
        ? 'arctic-sky'
        : settings.theme === 'dark'
          ? 'midnight-slate'
          : settings.theme;

  const isDarkActive = effectiveTheme === 'midnight-slate';

  const reloadReportsFromDisk = useCallback(async (dirOverride?: string) => {
    try {
      const query = dirOverride ? `?dir=${encodeURIComponent(dirOverride)}` : '';
      const res = await fetch(`/api/reports${query}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        reportsDir?: string;
        reports?: RatedThreadRecord[];
      };
      if (Array.isArray(data.reports)) {
        const diskReports = data.reports;
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
      if (data.reportsDir) {
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
  }, []);

  const syncReportToDisk = useCallback(
    async (record: RatedThreadRecord, explicitHtml?: string, dirOverride?: string) => {
      if (record.isExternalFile) return;
      try {
        const res = await fetch(`/api/reports/${encodeURIComponent(record.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record,
            html: explicitHtml,
            reportsDir: dirOverride ?? settings.reportsDir,
          }),
        });
        if (!res.ok) return;
        const saved = (await res.json()) as {
          fileName?: string;
          filePath?: string;
          reportsDir?: string;
        };
        if (saved.filePath || saved.fileName) {
          setRatedThreads((prev) =>
            prev.map((item) =>
              item.id === record.id
                ? {
                    ...item,
                    fileName: saved.fileName || item.fileName,
                    filePath: saved.filePath || item.filePath,
                  }
                : item,
            ),
          );
        }
      } catch {
        // Non-fatal if server unavailable
      }
    },
    [settings.reportsDir],
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
        promptFiles?: Record<PromptDomain, string>;
      };
      setConfigFileInfo((prev) => ({
        ...prev,
        filePath: data.filePath || prev.filePath,
        lastSavedAt: data.savedAt || new Date().toISOString(),
        defaultReportsDir: data.defaultReportsDir || prev.defaultReportsDir,
        resolvedReportsDir: data.resolvedReportsDir || prev.resolvedReportsDir,
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
        promptFiles?: Record<PromptDomain, string>;
      };
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
    const root = document.documentElement;
    root.setAttribute('data-pa-theme', effectiveTheme);
    root.setAttribute('data-pa-scope', scope);
    root.setAttribute('data-pa-font', settings.fontFamily || 'segoe');
    if (isDarkActive) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [effectiveTheme, isDarkActive, scope, settings.fontFamily]);

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
    saveRatedThreads(ratedThreads);
  }, [ratedThreads]);

  useEffect(() => {
    const rootUserTurn = turns.find((turn) => turn.role === 'user');
    if (!rootUserTurn) return;
    const hasAssistantReply = turns.some((candidate) => candidate.role === 'assistant');
    if (!hasAssistantReply && !rootUserTurn.threadRating) return;

    const recordId = rootUserTurn.id;
    const updatedRecord: RatedThreadRecord = {
      id: recordId,
      turns,
      ratedAt: new Date().toISOString(),
    };

    setRatedThreads((prevRated) => {
      const existingIdx = prevRated.findIndex((item) => item.id === recordId);
      if (existingIdx >= 0) {
        const existing = prevRated[existingIdx];
        if (JSON.stringify(existing.turns) === JSON.stringify(turns)) {
          return prevRated;
        }
        const nextRated = [...prevRated];
        nextRated[existingIdx] = {
          ...existing,
          turns,
          ratedAt: updatedRecord.ratedAt,
        };
        if (hasAssistantReply && reportsHydratedRef.current) {
          void syncReportToDisk({ ...existing, turns, ratedAt: updatedRecord.ratedAt });
        }
        return nextRated;
      }

      if (hasAssistantReply && reportsHydratedRef.current) {
        void syncReportToDisk(updatedRecord);
      }
      return [updatedRecord, ...prevRated];
    });
  }, [turns, syncReportToDisk]);

  useEffect(() => {
    saveScope(scope);
  }, [scope]);

  const activePublicAdapterLabel =
    settings.publicLlm.activeAdapter === 'gemini'
      ? 'Gemini'
      : settings.publicLlm.activeAdapter === 'claude'
        ? 'Claude'
        : 'Fable';

  const connectedEngineText =
    scope === 'private'
      ? `Connected: Private · Ollama (${settings.privateLlm.selectedModel || 'No model selected'})`
      : `Connected: Public · ${activePublicAdapterLabel} (${settings.publicLlm.adapters[settings.publicLlm.activeAdapter].model})`;

  const handleCycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(effectiveTheme);
    const nextTheme = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setSettings((prev) => ({ ...prev, theme: nextTheme }));
  };

  const handleApplyFetchedContext = async ({
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
    const nextSettings: WorkbenchSettings = {
      ...settings,
      contextCache: {
        ...settings.contextCache,
        privateText: text,
        publicText: text,
        activeMonth: month,
        activeYear: year,
        lastSyncedAt: fetchedAt,
      },
    };
    setSettings(nextSettings);
    return persistSettingsToFile(nextSettings);
  };

  const handleClearAllReferenceContext = async (): Promise<boolean> => {
    const nextSettings: WorkbenchSettings = {
      ...settings,
      contextCache: {
        ...settings.contextCache,
        privateText: '',
        publicText: '',
      },
    };
    setSettings(nextSettings);
    return persistSettingsToFile(nextSettings);
  };

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
        prevRated.map((item) =>
          item.id === exchangeId
            ? {
                ...item,
                turns: item.turns.map((turn) =>
                  turn.id === exchangeId && turn.role === 'user'
                    ? { ...turn, ...patch }
                    : turn,
                ),
              }
            : item,
        ),
      );
    },
    [],
  );

  const handleStartNewThread = useCallback(() => {
    setIsSettingsOpen(false);
    setIsPromptBuilderOpen(false);
    setIsReferenceContextOpen(false);
    setActiveReportExchangeId(null);
    setTurns([]);
    setIsChatBarOpen(false);
    setTelemetry({
      phase: 'Idle',
      isThinking: false,
      promptChars: 0,
      historyTurnsUsed: 0,
      lastError: '',
    });
    pushContextLog('info', 'Started new thread; stage cleared');
  }, [pushContextLog]);

  useEffect(() => {
    if (!reportContextMenu) return;
    const closeMenu = () => setReportContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReportContextMenu(null);
      }
    };
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', closeMenu);
    };
  }, [reportContextMenu]);

  useEffect(() => {
    if (editingReportId) {
      window.requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [editingReportId]);

  const handleDeleteSidebarReport = useCallback(
    (recordId: string) => {
      setReportContextMenu(null);
      if (editingReportId === recordId) {
        setEditingReportId(null);
        setEditingReportName('');
      }
      setRatedThreads((previous) => previous.filter((item) => item.id !== recordId));
      if (activeReportExchangeId === recordId) {
        setActiveReportExchangeId(null);
      }
      setTurns((previous) =>
        previous.some((t) => t.id === recordId || t.exchangeId === recordId)
          ? []
          : previous,
      );
      const query = settings.reportsDir
        ? `?dir=${encodeURIComponent(settings.reportsDir)}`
        : '';
      void fetch(`/api/reports/${encodeURIComponent(recordId)}${query}`, {
        method: 'DELETE',
      }).catch(() => undefined);
      pushContextLog('info', 'Report deleted from session and local folder');
    },
    [activeReportExchangeId, editingReportId, pushContextLog, settings.reportsDir],
  );

  const handleRenameReportCommit = useCallback(
    async (recordId: string, rawNewName: string) => {
      const nextName = rawNewName.trim();
      setEditingReportId(null);
      setEditingReportName('');
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

  const displayedTelemetry = useMemo<LlmContextTelemetry>(() => {
    if (
      telemetry.isThinking ||
      telemetry.totalTokens !== undefined ||
      telemetry.durationMs !== undefined
    ) {
      return telemetry;
    }

    const sourceTurns = activeReportRecord?.turns ?? turns;
    const latestAssistant = [...sourceTurns]
      .reverse()
      .find((t) => t.role === 'assistant');
    if (!latestAssistant) {
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

    if (
      totalTokens === undefined &&
      tokensPerSecond === undefined &&
      durationMs === undefined
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
    };
  }, [activeReportRecord, telemetry, turns]);

  const activeCarefulDates = useMemo<CarefulDateItem[]>(() => {
    const items: CarefulDateItem[] = [];
    const seen = new Set<string>();
    const rootQ = turns.find((t) => t.role === 'user');

    for (const turn of turns) {
      if (turn.role !== 'assistant') continue;
      const list =
        Array.isArray(turn.carefulDates) && turn.carefulDates.length > 0
          ? turn.carefulDates
          : parseResponseEventsAndReport(turn.content, rootQ?.promptDomain).carefulDates;
      for (const cd of list) {
        const dedupeKey = `${cd.domain.toLowerCase()}|${cd.date.toLowerCase()}|${cd.note.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        items.push({ ...cd, id: `${turn.id}-${cd.id}` });
      }
    }
    return items;
  }, [turns]);

  const activeCarefulPeriodLabel = useMemo(() => {
    const rootQ = turns.find((t) => t.role === 'user');
    return (
      formatShortYearMonth(rootQ?.threadMonth, rootQ?.threadYear) ||
      formatShortYearMonth(
        settings.contextCache.activeMonth,
        settings.contextCache.activeYear,
      )
    );
  }, [settings.contextCache.activeMonth, settings.contextCache.activeYear, turns]);

  const executeExchangeRequest = async ({
    userTurn,
    precedingTurns,
    baseThreadTurns,
    effectiveDomain,
  }: {
    userTurn: ConversationTurn;
    precedingTurns: ConversationTurn[];
    baseThreadTurns: ConversationTurn[];
    effectiveDomain: PromptDomain;
  }) => {
    const targetScope = scope;
    const targetAdapterId: AnyAdapterId =
      targetScope === 'private'
        ? settings.privateLlm.activeAdapter
        : settings.publicLlm.activeAdapter;
    const targetModel =
      targetScope === 'private'
        ? settings.privateLlm.selectedModel || 'unselected'
        : settings.publicLlm.adapters[settings.publicLlm.activeAdapter].model;
    const maxHistory = Math.min(32, Math.max(2, settings.privateLlm.maxHistoryTurns || 16));
    const targetHistory = precedingTurns
      .filter((turn) => {
        if (turn.role === 'user') {
          return (turn.responseScopes ?? [turn.scope]).includes(targetScope);
        }
        return turn.role === 'assistant' && turn.scope === targetScope;
      })
      .slice(-maxHistory)
      .map((turn) => ({
        role: turn.role as 'user' | 'assistant',
        content: turn.content,
      }));

    const targetCachedContext =
      targetScope === 'private'
        ? settings.contextCache.privateText.trim()
        : settings.contextCache.publicText.trim();
    const majorTemplate = extractMajorTemplate(
      promptTemplates[effectiveDomain]?.[promptStyle] ?? '',
    );
    const dedupeSources = [
      userTurn.content,
      ...targetHistory.map((turn) => turn.content),
    ];
    const baseWithContext = appendCachedContext(
      targetScope === 'private'
        ? settings.privateLlm.systemInstruction
        : settings.publicLlm.adapters[settings.publicLlm.activeAdapter].systemInstruction,
      targetCachedContext,
      dedupeSources,
    );
    const baseWithTemplate = appendCachedContext(
      baseWithContext,
      majorTemplate,
      dedupeSources,
    );
    const targetSystemInstruction = [
      baseWithTemplate,
      EVENT_EXTRACTION_SYSTEM_DIRECTIVE,
    ]
      .filter(Boolean)
      .join('\n\n');

    setIsSending(true);
    const requestStartedAt = Date.now();
    const fullPromptChars =
      targetSystemInstruction.length +
      targetHistory.reduce((sum, item) => sum + item.content.length, 0) +
      userTurn.content.trim().length;
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

    try {
      if (targetScope === 'private' && !settings.privateLlm.selectedModel.trim()) {
        throw new Error('Select a private Ollama model in Settings to get the Private response.');
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: targetScope,
          adapterId: targetAdapterId,
          message: userTurn.content,
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
      };

      const rootUserTurn =
        baseThreadTurns.find((t) => t.role === 'user') ?? userTurn;
      const combinedTurns = [...baseThreadTurns, preliminaryReplyTurn];
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

      const assistantTurn: ConversationTurn = {
        ...preliminaryReplyTurn,
        htmlReport,
      };

      setTurns((prev) => [
        ...prev.filter((t) => t.exchangeId !== userTurn.id),
        assistantTurn,
      ]);

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
      if (shortPreview) {
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
      const errTitle = "What's up";
      const friendlyError = 'Try "What\'s up" little later ..';
      setReplyToast({ title: errTitle, preview: friendlyError, isError: true });
      if (replyToastTimerRef.current) window.clearTimeout(replyToastTimerRef.current);
      replyToastTimerRef.current = window.setTimeout(() => setReplyToast(null), 5000);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = async ({
    text,
    inputMode,
    threadName,
    promptDomain,
    isFollowUp,
  }: SendThreadMessagePayload) => {
    const selectedAdapterId: AnyAdapterId =
      scope === 'private'
        ? settings.privateLlm.activeAdapter
        : settings.publicLlm.activeAdapter;
    const selectedModelName =
      scope === 'private'
        ? settings.privateLlm.selectedModel || 'unselected'
        : settings.publicLlm.adapters[settings.publicLlm.activeAdapter].model;

    const rootUserTurn = turns.find((t) => t.role === 'user');
    const inheritedMonth =
      (isFollowUp ? rootUserTurn?.threadMonth : undefined) ||
      getMonthNameFromNumber(settings.contextCache.activeMonth);
    const inheritedYear =
      (isFollowUp ? rootUserTurn?.threadYear : undefined) ??
      settings.contextCache.activeYear;
    const effectiveThreadName =
      isFollowUp && rootUserTurn?.threadName?.trim()
        ? rootUserTurn.threadName.trim()
        : threadName;
    const effectiveDomain: PromptDomain = promptDomain ?? activePromptDomain;

    const userTurn: ConversationTurn = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      responseScopes: [scope],
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      inputMode,
      scope,
      adapterId: selectedAdapterId,
      model: selectedModelName,
      promptDomain: effectiveDomain,
      promptStyle,
      threadName: effectiveThreadName,
      threadMonth: inheritedMonth,
      threadYear: inheritedYear,
    };

    const nextBaseTurns = [...turns, userTurn];
    setTurns(nextBaseTurns);
    setActiveReportExchangeId(null);
    setIsChatBarOpen(false);

    await executeExchangeRequest({
      userTurn,
      precedingTurns: turns,
      baseThreadTurns: nextBaseTurns,
      effectiveDomain,
    });
  };

  const handleRetryExchange = async (exchangeId: string) => {
    if (isSending) return;
    const targetIndex = turns.findIndex(
      (t) => t.id === exchangeId && t.role === 'user',
    );
    if (targetIndex < 0) return;

    const existingUserTurn = turns[targetIndex];
    const selectedAdapterId: AnyAdapterId =
      scope === 'private'
        ? settings.privateLlm.activeAdapter
        : settings.publicLlm.activeAdapter;
    const selectedModelName =
      scope === 'private'
        ? settings.privateLlm.selectedModel || 'unselected'
        : settings.publicLlm.adapters[settings.publicLlm.activeAdapter].model;

    const refreshedUserTurn: ConversationTurn = {
      ...existingUserTurn,
      scope,
      responseScopes: [scope],
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
    });
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex mica-canvas text-slate-900 dark:text-slate-100 select-none sm:select-auto">
      {/* Left WinUI 3 NavigationView Rail (Adjustable & Resizable) */}
      {isLeftRailOpen && (
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
                  setIsPromptBuilderOpen(false);
                  setIsReferenceContextOpen(false);
                  setActiveReportExchangeId(null);
                }}
                title="Home"
                aria-label="Home"
                className="px-2.5 py-2 inline-flex items-center justify-center rounded-xl bg-white/75 dark:bg-slate-800/75 border border-slate-200/80 dark:border-slate-700/70 hover:bg-white dark:hover:bg-slate-800 transition-colors shrink-0 self-start shadow-2xs"
                style={{ color: 'var(--pa-accent)' }}
              >
                <Home className="w-5 h-5" />
              </button>

              <div
                aria-label="Reports"
                className="flex-1 min-h-0 overflow-y-auto fluent-scroll space-y-1 pr-0.5"
              >
                {ratedThreads.length > 0 &&
                  ratedThreads.map((record, index) => {
                    const qTurn = record.turns.find((turn) => turn.role === 'user');
                    const threadScope =
                      qTurn?.scope ??
                      record.turns.find((turn) => turn.role === 'assistant')?.scope ??
                      'public';
                    const isPublicThread = threadScope === 'public';
                    const displayLabel = formatSidebarThreadLabel(qTurn, index);
                    const isActiveReport = activeReportExchangeId === record.id;
                    const isEditing = editingReportId === record.id;

                    if (isEditing) {
                      return (
                        <div
                          key={record.id}
                          className="w-full flex items-center px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-sky-400 dark:border-sky-500 shadow-xs"
                        >
                          <input
                            ref={renameInputRef}
                            type="text"
                            value={editingReportName}
                            aria-label="Edit report name"
                            onChange={(e) => setEditingReportName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleRenameReportCommit(record.id, editingReportName);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingReportId(null);
                                setEditingReportName('');
                              }
                            }}
                            onBlur={() => {
                              void handleRenameReportCommit(record.id, editingReportName);
                            }}
                            className="flex-1 min-w-0 bg-transparent text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
                          />
                        </div>
                      );
                    }

                    const ratingStars =
                      qTurn?.threadRating === 'red'
                        ? '★'
                        : qTurn?.threadRating === 'yellow'
                          ? '★★'
                          : qTurn?.threadRating === 'green'
                            ? '★★★'
                            : '';
                    const baseLabel = ratingStars
                      ? displayLabel.replace(/^★+\s+/, '')
                      : displayLabel;

                    return (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => {
                          setReportContextMenu(null);
                          setIsSettingsOpen(false);
                          setIsPromptBuilderOpen(false);
                          setIsReferenceContextOpen(false);
                          setActiveReportExchangeId(record.id);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setReportContextMenu({
                            recordId: record.id,
                            x: Math.min(e.clientX, window.innerWidth - 196),
                            y: Math.min(e.clientY, window.innerHeight - 108),
                          });
                        }}
                        title={`${isPublicThread ? 'Public' : 'Private'} "${displayLabel}" (Right-click to edit or delete)`}
                        className={`w-full flex items-center px-2.5 py-2 rounded-lg text-xs transition-all text-left ${
                          isPublicThread
                            ? 'font-semibold text-slate-900 dark:text-white'
                            : 'font-normal text-slate-500 dark:text-slate-400 opacity-55 blur-[0.4px] grayscale-[45%] hover:opacity-85 hover:blur-0'
                        } ${
                          isActiveReport
                            ? 'bg-white dark:bg-slate-800 shadow-xs border border-slate-200/80 dark:border-slate-700/70 opacity-100 blur-none'
                            : isPublicThread
                              ? 'bg-white/45 dark:bg-slate-800/35 hover:bg-white/80 dark:hover:bg-slate-800/75'
                              : 'hover:bg-white/55 dark:hover:bg-slate-800/55'
                        }`}
                      >
                        {ratingStars && (
                          <span
                            className="text-amber-500 dark:text-amber-400 shrink-0 mr-1.5"
                            aria-hidden="true"
                          >
                            {ratingStars}
                          </span>
                        )}
                        <span className="truncate flex-1 tabular-nums">{baseLabel}</span>
                      </button>
                    );
                  })}
              </div>
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
        {/* Fluent Top Menu Bar */}
        <header className="h-14 shrink-0 px-4 sm:px-6 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl flex items-center justify-between gap-4">
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
                setIsPromptBuilderOpen(false);
                setIsReferenceContextOpen(false);
                setActiveReportExchangeId(null);
              }}
              title="Home"
              aria-label="Home"
              className="md:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 shrink-0"
              style={{ color: 'var(--pa-accent)' }}
            >
              <Home className="w-4 h-4" />
            </button>
            <span
              title="What's up"
              className="inline-flex items-center gap-1.5 font-display text-sm sm:text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
            >
              <WhatsAppSymbol className="w-7 h-7 shrink-0" />
              {(isSettingsOpen || isPromptBuilderOpen || isReferenceContextOpen || activeReportRecord) && (
                <>
                  <span className="text-slate-400 dark:text-slate-500 font-normal">·</span>
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    {isSettingsOpen
                      ? 'Settings'
                      : isPromptBuilderOpen
                        ? 'Prompt Builder'
                        : isReferenceContextOpen
                          ? 'Reference Context'
                          : 'Reference Report'}
                  </span>
                </>
              )}
            </span>

            <span
              aria-hidden="true"
              className="h-4 w-px bg-slate-200/90 dark:bg-slate-700/80 mx-0.5 shrink-0"
            />

            <nav className="flex items-center gap-1 shrink-0" aria-label="Primary pages">
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  setIsPromptBuilderOpen(false);
                  setIsReferenceContextOpen((prev) => !prev);
                  setActiveReportExchangeId(null);
                }}
                aria-label="Reference Context"
                title="Reference Context"
                aria-current={isReferenceContextOpen ? 'page' : undefined}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                  isReferenceContextOpen
                    ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 shadow-xs'
                    : 'border-transparent text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:border-slate-200/80 dark:hover:border-slate-700/80'
                }`}
                style={isReferenceContextOpen ? { color: 'var(--pa-accent)' } : undefined}
              >
                <BookOpen className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen((prev) => !prev);
                  setIsPromptBuilderOpen(false);
                  setIsReferenceContextOpen(false);
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
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  setIsPromptBuilderOpen((prev) => !prev);
                  setIsReferenceContextOpen(false);
                  setActiveReportExchangeId(null);
                }}
                aria-label="Prompt Builder"
                title="Prompt Builder"
                aria-current={isPromptBuilderOpen ? 'page' : undefined}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                  isPromptBuilderOpen
                    ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 shadow-xs'
                    : 'border-transparent text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:border-slate-200/80 dark:hover:border-slate-700/80'
                }`}
                style={isPromptBuilderOpen ? { color: 'var(--pa-accent)' } : undefined}
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </nav>
          </div>

          {/* Zone 2: Private / Public Toggle in Top Menu Bar */}
          <div
            role="group"
            aria-label="Conversation target"
            className="inline-flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/80 shrink-0"
          >
            <button
              type="button"
              onClick={() => setScope('private')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                scope === 'private'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Private</span>
            </button>
            <button
              type="button"
              onClick={() => setScope('public')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                scope === 'public'
                  ? 'bg-white dark:bg-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              style={scope === 'public' ? { color: 'var(--pa-accent-text)' } : undefined}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Public</span>
            </button>
          </div>

          {/* Zone 3: Theme, Chat Bar & Agent Session Sidebar Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCycleTheme}
              aria-label="Switch color theme"
              title={`Theme: ${effectiveTheme} (click to switch)`}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <Palette className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (
                  isSettingsOpen ||
                  isPromptBuilderOpen ||
                  isReferenceContextOpen ||
                  activeReportExchangeId
                ) {
                  setIsSettingsOpen(false);
                  setIsPromptBuilderOpen(false);
                  setIsReferenceContextOpen(false);
                  setActiveReportExchangeId(null);
                  setIsChatBarOpen(true);
                } else {
                  setIsChatBarOpen((prev) => !prev);
                }
              }}
              aria-label={isChatBarOpen ? 'Minimize Chat Panel' : 'Show Chat Panel'}
              title={isChatBarOpen ? 'Minimize Chat Panel' : 'Show Chat Panel'}
              aria-pressed={
                !isSettingsOpen &&
                !isPromptBuilderOpen &&
                !isReferenceContextOpen &&
                !activeReportExchangeId &&
                isChatBarOpen
              }
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors shrink-0 ${
                !isSettingsOpen &&
                !isPromptBuilderOpen &&
                !isReferenceContextOpen &&
                !activeReportExchangeId &&
                isChatBarOpen
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              style={
                !isSettingsOpen &&
                !isPromptBuilderOpen &&
                !isReferenceContextOpen &&
                !activeReportExchangeId &&
                isChatBarOpen
                  ? { color: 'var(--pa-accent-text)' }
                  : undefined
              }
            >
              <PanelBottom className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setIsContextRailOpen((prev) => !prev);
              }}
              aria-label={isContextRailVisible ? 'Hide Care Must Be Taken' : 'Show Care Must Be Taken'}
              title={isContextRailVisible ? 'Hide Care Must Be Taken' : 'Show Care Must Be Taken'}
              aria-pressed={isContextRailVisible}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors shrink-0 ${
                isContextRailVisible
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              style={isContextRailVisible ? { color: 'var(--pa-accent-text)' } : undefined}
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Assistant Surface + Agent Session Sidebar */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {isSettingsOpen ? (
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
          ) : isPromptBuilderOpen ? (
            <PromptBuilderPage
              activeDomain={activePromptDomain}
              templates={promptTemplates}
              settingsFilePath={configFileInfo.filePath}
              domainPromptFilePath={configFileInfo.promptFiles?.[activePromptDomain]}
              promptFiles={configFileInfo.promptFiles}
              saveError={configFileInfo.syncError}
              onApplySettings={(overrideTemplates) => {
                const nextSettings: WorkbenchSettings = {
                  ...settingsRef.current,
                  promptBuilder: {
                    ...settingsRef.current.promptBuilder,
                    templates: overrideTemplates ?? settingsRef.current.promptBuilder.templates,
                  },
                };
                settingsRef.current = nextSettings;
                setSettings(nextSettings);
                saveSettings(nextSettings);
                return persistSettingsToFile(nextSettings);
              }}
              onSelectDomain={(activeDomain) => {
                userEditedPromptsRef.current = true;
                setSettings((previous) => {
                  const next = {
                    ...previous,
                    promptBuilder: {
                      ...previous.promptBuilder,
                      activeDomain,
                    },
                  };
                  settingsRef.current = next;
                  return next;
                });
              }}
              onChangeTemplates={(templates) => {
                userEditedPromptsRef.current = true;
                setSettings((previous) => {
                  const next = {
                    ...previous,
                    promptBuilder: {
                      ...previous.promptBuilder,
                      templates,
                    },
                  };
                  settingsRef.current = next;
                  return next;
                });
              }}
            />
          ) : isReferenceContextOpen ? (
            <ReferenceContextPage
              scope={scope}
              settings={settings}
              onApplyFetchedContext={handleApplyFetchedContext}
              onClearAllReferenceContext={handleClearAllReferenceContext}
              onOpenSettings={() => {
                setIsReferenceContextOpen(false);
                setIsSettingsOpen(true);
              }}
              onContextLog={pushContextLog}
            />
          ) : activeReportRecord ? (
            <ReportDocumentPage
              exchangeId={activeReportRecord.id}
              turns={activeReportRecord.turns}
              reportFilePath={activeReportRecord.filePath}
              reportsDir={settings.reportsDir}
              isExternalFile={activeReportRecord.isExternalFile}
              onViewEventCards={(exchangeId) => {
                const record = ratedThreads.find((r) => r.id === exchangeId);
                if (record) {
                  const qTurn = record.turns.find((t) => t.role === 'user');
                  if (qTurn?.scope) setScope(qTurn.scope);
                  setTurns(record.turns);
                }
                setActiveReportExchangeId(null);
              }}
              onClose={() => setActiveReportExchangeId(null)}
            />
          ) : (
            <WorkbenchPage
              scope={scope}
              settings={settings}
              turns={turns}
              activePromptDomain={activePromptDomain}
              promptStyle={promptStyle}
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
              onPromptStyleChange={(activeStyle) =>
                setSettings((previous) => ({
                  ...previous,
                  promptBuilder: {
                    ...previous.promptBuilder,
                    activeStyle,
                  },
                }))
              }
              isSending={isSending}
              speech={speech}
              onSendMessage={(payload) => void handleSendMessage(payload)}
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
                setIsReferenceContextOpen(false);
                setIsPromptBuilderOpen(false);
                setActiveReportExchangeId(null);
                setIsSettingsOpen(true);
              }}
              onOpenReportViewer={(exchangeId) => {
                setIsSettingsOpen(false);
                setIsPromptBuilderOpen(false);
                setIsReferenceContextOpen(false);
                setActiveReportExchangeId(exchangeId);
              }}
            />
          )}

          {/* Floating Right-Hand Careful Dates by Domain Drawer */}
          <AnimatePresence>
            {!isSettingsOpen &&
              !isPromptBuilderOpen &&
              !isReferenceContextOpen &&
              !activeReportRecord &&
              isContextRailVisible && (
                <ContextMonitorRail
                  carefulDates={activeCarefulDates}
                  periodLabel={activeCarefulPeriodLabel}
                  onClose={() => setIsContextRailOpen(false)}
                />
              )}
          </AnimatePresence>
        </div>

        {/* Bottom Panel Drag Splitter */}
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

        {/* Bottom Panel Status Bar (Adjustable Height) */}
        <footer
          style={{ height: bottomBarHeight }}
          className="shrink-0 px-4 sm:px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl flex flex-col justify-center gap-1.5 text-xs overflow-hidden"
        >
          <div className="flex items-center justify-between gap-4 min-w-0">
            <div className="flex items-center gap-2 min-w-0 text-slate-600 dark:text-slate-300">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    scope === 'private' ? '#10B981' : 'var(--pa-accent)',
                }}
                aria-hidden="true"
              />
              <span className="truncate font-medium">{connectedEngineText}</span>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 font-mono text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
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

      {/* Left-Rail Report Right-Click Context Menu */}
      {reportContextMenu && (
        <div
          role="menu"
          aria-label="Report actions"
          style={{ left: reportContextMenu.x, top: reportContextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed z-50 w-44 rounded-xl border border-slate-200/90 dark:border-slate-700/90 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-xl p-1.5 space-y-0.5"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const target = ratedThreads.find((r) => r.id === reportContextMenu.recordId);
              const qTurn = target?.turns.find((t) => t.role === 'user');
              setEditingReportId(reportContextMenu.recordId);
              setEditingReportName(qTurn?.threadName?.trim() || '');
              setReportContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span>Edit Name</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleDeleteSidebarReport(reportContextMenu.recordId)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors text-left"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Delete</span>
          </button>
        </div>
      )}

    </div>
  );
}

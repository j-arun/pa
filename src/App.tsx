import {
  Bell,
  Cloud,
  Lock,
  Mic,
  MicOff,
  Palette,
  PanelLeft,
  PanelRight,
  Settings,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ContextMonitorRail } from './components/ContextMonitorRail';
import { SettingsPage } from './components/SettingsPage';
import { WorkbenchPage } from './components/WorkbenchPage';
import { useSpeechIO } from './hooks/useSpeechIO';
import type {
  AnyAdapterId,
  ConversationScope,
  ConversationTurn,
  LlmContextLogEntry,
  LlmContextTelemetry,
  ThemeMode,
  WorkbenchSettings,
} from './types/workbench';
import {
  DEFAULT_SETTINGS,
  loadConversation,
  loadScope,
  loadSettings,
  saveConversation,
  saveScope,
  saveSettings,
} from './utils/storage';
import {
  playReplyChime,
  requestDesktopNotificationPermission,
  showDesktopNotification,
} from './utils/notify';

const USER_AVATAR_SRC = '/src/assets/images/local_user_avatar_1794900004889.jpg';
const THEME_CYCLE: ThemeMode[] = [
  'arctic-sky',
  'midnight-slate',
  'emerald-mist',
  'royal-amethyst',
];

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [scope, setScope] = useState<ConversationScope>(() => loadScope());
  const [settings, setSettings] = useState<WorkbenchSettings>(() => loadSettings());
  const [turns, setTurns] = useState<ConversationTurn[]>(() => loadConversation());
  const [isSending, setIsSending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [configFileInfo, setConfigFileInfo] = useState<{
    filePath: string;
    platform: string;
    lastSavedAt?: string;
    syncError?: string;
  }>({
    filePath: 'workbench.config.json',
    platform: 'unknown',
  });
  const configHydratedRef = useRef(false);
  const replyToastTimerRef = useRef<number | null>(null);
  const [replyToast, setReplyToast] = useState<{
    title: string;
    preview: string;
    isError: boolean;
  } | null>(null);
  const [isLeftRailOpen, setIsLeftRailOpen] = useState(true);
  const [isContextRailOpen, setIsContextRailOpen] = useState(true);
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

  const speech = useSpeechIO(settings.voice, isMuted);

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

  const isDarkActive =
    effectiveTheme === 'midnight-slate' || effectiveTheme === 'royal-amethyst';

  const reloadConfigFromFile = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        config?: WorkbenchSettings;
        filePath?: string;
        platform?: string;
      };
      if (data.config) {
        setSettings(data.config);
      }
      setConfigFileInfo((prev) => ({
        ...prev,
        filePath: data.filePath || prev.filePath,
        platform: data.platform || prev.platform,
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
    }
  }, []);

  useEffect(() => {
    void reloadConfigFromFile();
  }, [reloadConfigFromFile]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-pa-theme', effectiveTheme);
    root.setAttribute('data-pa-font', settings.fontFamily || 'segoe');
    if (isDarkActive) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [effectiveTheme, isDarkActive, settings.fontFamily]);

  useEffect(() => {
    saveSettings(settings);
    if (!configHydratedRef.current) return;

    const timer = setTimeout(() => {
      void fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as {
            filePath?: string;
            savedAt?: string;
          };
          setConfigFileInfo((prev) => ({
            ...prev,
            filePath: data.filePath || prev.filePath,
            lastSavedAt: data.savedAt || new Date().toISOString(),
            syncError: undefined,
          }));
        })
        .catch((err) => {
          setConfigFileInfo((prev) => ({
            ...prev,
            syncError:
              err instanceof Error ? err.message : 'Failed to sync workbench.config.json.',
          }));
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    saveConversation(turns);
  }, [turns]);

  useEffect(() => {
    saveScope(scope);
  }, [scope]);

  const activeAutoSpeak =
    scope === 'public'
      ? settings.voice.autoSpeakPublic
      : settings.voice.autoSpeakPrivate;

  const activePublicAdapterLabel =
    settings.publicLlm.activeAdapter === 'gemini'
      ? 'Gemini'
      : settings.publicLlm.activeAdapter === 'claude'
        ? 'Claude'
        : 'Fable';

  const connectedEngineText =
    scope === 'private'
      ? `Connected: Private · Windows Ollama (${settings.privateLlm.selectedModel || 'No model selected'})`
      : `Connected: Public · ${activePublicAdapterLabel} (${settings.publicLlm.adapters[settings.publicLlm.activeAdapter].model})`;

  const toggleTopBarSpeak = () => {
    if (speech.speakingTurnId) {
      speech.stopSpeaking();
      return;
    }
    if (scope === 'public') {
      setSettings((prev) => ({
        ...prev,
        voice: { ...prev.voice, autoSpeakPublic: !prev.voice.autoSpeakPublic },
      }));
    } else {
      setSettings((prev) => ({
        ...prev,
        voice: { ...prev.voice, autoSpeakPrivate: !prev.voice.autoSpeakPrivate },
      }));
    }
  };

  const handleCycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(effectiveTheme);
    const nextTheme = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setSettings((prev) => ({ ...prev, theme: nextTheme }));
  };

  const handleSendMessage = async (text: string, inputMode: 'text' | 'voice') => {
    const adapterId: AnyAdapterId =
      scope === 'private'
        ? settings.privateLlm.activeAdapter
        : settings.publicLlm.activeAdapter;

    const modelName =
      scope === 'private'
        ? settings.privateLlm.selectedModel || 'unselected'
        : settings.publicLlm.adapters[settings.publicLlm.activeAdapter].model;

    const userTurn: ConversationTurn = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      inputMode,
      scope,
      adapterId,
      model: modelName,
    };

    const maxHistory = Math.min(32, Math.max(2, settings.privateLlm.maxHistoryTurns || 16));
    const historyPayload = turns
      .filter((t) => t.role === 'user' || t.role === 'assistant')
      .slice(-maxHistory)
      .map((t) => ({
        role: t.role as 'user' | 'assistant',
        content: t.content,
      }));

    setTurns((prev) => [...prev, userTurn]);
    setIsSending(true);
    const requestStartedAt = Date.now();
    setNowMs(requestStartedAt);
    setTelemetry((prev) => ({
      ...prev,
      phase: 'Thinking',
      isThinking: true,
      startedAtMs: requestStartedAt,
      promptChars: text.trim().length,
      historyTurnsUsed: historyPayload.length,
      inputTokens: undefined,
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
      `Prompt sent (${text.trim().length} ch, ${historyPayload.length} hist) -> ${scope}:${adapterId}/${modelName} · timeout: ${timeoutLabel}`,
    );

    if (settings.notifications?.desktopNotificationOnReply !== false) {
      void requestDesktopNotificationPermission();
    }

    try {
      const options =
        scope === 'private'
          ? {
              model: settings.privateLlm.selectedModel,
              systemInstruction: settings.privateLlm.systemInstruction,
              ollamaBaseUrl: settings.privateLlm.ollamaBaseUrl,
              contextWindow: settings.privateLlm.contextWindow,
              keepAlive: settings.privateLlm.keepAlive,
              requestTimeoutSeconds: timeoutSec,
            }
          : {
              model: settings.publicLlm.adapters[settings.publicLlm.activeAdapter].model,
              systemInstruction:
                settings.publicLlm.adapters[settings.publicLlm.activeAdapter]
                  .systemInstruction,
              thinkingLevel:
                settings.publicLlm.adapters[settings.publicLlm.activeAdapter]
                  .thinkingLevel,
              endpointUrl:
                settings.publicLlm.adapters[settings.publicLlm.activeAdapter]
                  .endpointUrl,
              maxTokens:
                settings.publicLlm.adapters[settings.publicLlm.activeAdapter].maxTokens,
              requestTimeoutSeconds: timeoutSec,
            };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          adapterId,
          message: text,
          history: historyPayload,
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

      const elapsedMs = payload.durationMs ?? Math.max(0, Date.now() - requestStartedAt);
      const inputTokens = payload.inputTokens;
      const outputTokens = payload.outputTokens ?? payload.tokenCount;
      const totalTokens =
        inputTokens !== undefined && outputTokens !== undefined
          ? inputTokens + outputTokens
          : payload.tokenCount ?? outputTokens ?? inputTokens;
      const tokensPerSecond =
        payload.tokensPerSecond ??
        (outputTokens !== undefined && elapsedMs > 0
          ? Number((outputTokens / (elapsedMs / 1000)).toFixed(1))
          : undefined);

      const assistantTurn: ConversationTurn = {
        id: `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'assistant',
        content: payload.text,
        timestamp: new Date().toISOString(),
        scope: payload.scope || scope,
        adapterId: payload.adapterId || adapterId,
        model: payload.model || modelName,
        durationMs: elapsedMs,
        tokenCount: totalTokens,
        adapterProtocol: payload.protocol,
      };

      setTurns((prev) => [...prev, assistantTurn]);
      setTelemetry((prev) => ({
        ...prev,
        phase: 'Ready',
        isThinking: false,
        startedAtMs: undefined,
        inputTokens,
        outputTokens,
        totalTokens,
        tokensPerSecond,
        durationMs: elapsedMs,
        lastError: '',
      }));

      const tokenSummary =
        totalTokens !== undefined
          ? `${totalTokens} tok (in ${inputTokens ?? '—'} / out ${outputTokens ?? '—'})`
          : 'tokens n/a';
      const speedSummary =
        tokensPerSecond !== undefined ? ` @ ${tokensPerSecond.toFixed(1)} tok/s` : '';
      pushContextLog(
        'success',
        `Reply in ${(elapsedMs / 1000).toFixed(2)}s · ${tokenSummary}${speedSummary}`,
      );

      if (settings.notifications?.soundOnReply !== false) {
        playReplyChime(false);
      }
      if (settings.notifications?.desktopNotificationOnReply !== false) {
        const title = `Personal Assistant · ${
          assistantTurn.scope === 'private' ? 'Private' : 'Public'
        } reply ready`;
        const cleanPreview = assistantTurn.content.replace(/\s+/g, ' ').trim();
        const shortPreview =
          cleanPreview.length > 110 ? `${cleanPreview.slice(0, 107)}...` : cleanPreview;
        showDesktopNotification(title, cleanPreview);
        setReplyToast({ title, preview: shortPreview, isError: false });
        if (replyToastTimerRef.current) window.clearTimeout(replyToastTimerRef.current);
        replyToastTimerRef.current = window.setTimeout(() => setReplyToast(null), 4500);
      }

      const shouldAutoSpeak =
        (assistantTurn.scope === 'public' && settings.voice.autoSpeakPublic) ||
        (assistantTurn.scope === 'private' && settings.voice.autoSpeakPrivate);
      if (shouldAutoSpeak) {
        if (settings.notifications?.soundOnReply !== false) {
          setTimeout(() => speech.speakText(assistantTurn.id, assistantTurn.content), 240);
        } else {
          speech.speakText(assistantTurn.id, assistantTurn.content);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Request failed.';
      const errTurn: ConversationTurn = {
        id: `err-${Date.now()}`,
        role: 'error',
        content: errorMessage,
        timestamp: new Date().toISOString(),
        scope,
        adapterId,
        model: modelName,
      };
      setTurns((prev) => [...prev, errTurn]);
      setTelemetry((prev) => ({
        ...prev,
        phase: 'Error',
        isThinking: false,
        startedAtMs: undefined,
        durationMs: Math.max(0, Date.now() - requestStartedAt),
        lastError: errorMessage,
      }));
      pushContextLog('error', `Context error: ${errorMessage}`);

      if (settings.notifications?.soundOnReply !== false) {
        playReplyChime(true);
      }
      if (settings.notifications?.desktopNotificationOnReply !== false) {
        const title = 'Personal Assistant · Response Error';
        showDesktopNotification(title, errTurn.content);
        setReplyToast({ title, preview: errTurn.content, isError: true });
        if (replyToastTimerRef.current) window.clearTimeout(replyToastTimerRef.current);
        replyToastTimerRef.current = window.setTimeout(() => setReplyToast(null), 5000);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleExportHistory = () => {
    const blob = new Blob([JSON.stringify(turns, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `personal-assistant-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
            <div className="space-y-6">
              <div className="px-3 pt-2 pb-1 flex items-center gap-2.5">
                <img src="/favicon.svg" alt="Personal Assistant" className="w-7 h-7 shrink-0" />
                <div className="min-w-0">
                  <div className="font-display text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                    Personal Assistant
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    WinUI 3 Fluent Edition
                  </div>
                </div>
              </div>

              <nav className="space-y-1" aria-label="Primary pages">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200/80 dark:border-slate-700/70"
                >
                  <Cloud className="w-4 h-4 shrink-0" style={{ color: 'var(--pa-accent)' }} />
                  <span className="truncate">Personal Assistant</span>
                </button>
              </nav>
            </div>

            {/* Account Profile Footer (Pulled from Windows / OS account profile) */}
            <div className="pt-3 border-t border-slate-200/75 dark:border-slate-800/80 px-1 py-1.5">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                title="View account profile in Settings"
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/70 dark:hover:bg-slate-800/70 transition-colors text-left"
              >
                <div className="shrink-0">
                  {settings.profile.avatarDataUrl ? (
                    <img
                      src={settings.profile.avatarDataUrl}
                      alt={settings.profile.displayName || 'Account avatar'}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                    />
                  ) : !avatarError ? (
                    <img
                      src={USER_AVATAR_SRC}
                      alt={settings.profile.displayName || 'Account avatar'}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarError(true)}
                      className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                    />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-full text-white flex items-center justify-center text-xs font-semibold"
                      style={{ backgroundColor: 'var(--pa-accent)' }}
                    >
                      {(settings.profile.displayName || 'U').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                    {settings.profile.displayName || 'Windows User'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Windows Account
                  </div>
                </div>
              </button>
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
          {/* Zone 1: Left Rail Toggle + App Icon + Title */}
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
            <img src="/favicon.svg" alt="Personal Assistant" className="w-6 h-6 shrink-0 md:hidden" />
            <span className="font-display text-sm sm:text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
              Personal Assistant
            </span>
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

          {/* Zone 3: Icon-Only Mic, Speaker, Theme & Settings Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsMuted((prev) => !prev)}
              aria-label={isMuted ? 'Microphone muted, click to unmute' : 'Microphone on, click to mute'}
              title={isMuted ? 'Microphone Muted (click to unmute)' : 'Microphone On (click to mute)'}
              aria-pressed={isMuted}
              className={`p-2 rounded-lg border transition-colors shrink-0 ${
                isMuted
                  ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  : 'bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={toggleTopBarSpeak}
              aria-label={
                speech.speakingTurnId
                  ? 'Stop Windows Speaker'
                  : activeAutoSpeak
                    ? 'Auto-speak on, click to disable'
                    : 'Speaker off, click to enable auto-speak'
              }
              title={
                speech.speakingTurnId
                  ? 'Stop Windows Speaker'
                  : activeAutoSpeak
                    ? 'Windows Speaker Auto-Speak On'
                    : 'Windows Speaker Off'
              }
              aria-pressed={Boolean(speech.speakingTurnId) || activeAutoSpeak}
              className={`p-2 rounded-lg border transition-colors shrink-0 ${
                speech.speakingTurnId
                  ? 'text-white border-transparent'
                  : activeAutoSpeak
                    ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                    : 'bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              style={
                speech.speakingTurnId
                  ? { backgroundColor: 'var(--pa-accent)' }
                  : activeAutoSpeak
                    ? { color: 'var(--pa-accent-text)' }
                    : undefined
              }
            >
              {speech.speakingTurnId ? (
                <Square className="w-4 h-4 fill-current" />
              ) : activeAutoSpeak ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>

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
              onClick={() => setIsContextRailOpen((prev) => !prev)}
              aria-label={isContextRailOpen ? 'Hide LLM Context Monitor' : 'Show LLM Context Monitor'}
              title={isContextRailOpen ? 'Hide LLM Context Monitor' : 'Show LLM Context Monitor'}
              aria-pressed={isContextRailOpen}
              className={`hidden lg:inline-flex p-2 rounded-lg border transition-colors shrink-0 ${
                isContextRailOpen
                  ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                  : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              style={isContextRailOpen ? { color: 'var(--pa-accent-text)' } : undefined}
            >
              <PanelRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              aria-label="Settings"
              title="Settings"
              aria-pressed={isSettingsOpen}
              className={`p-2 rounded-lg border transition-colors shrink-0 ${
                isSettingsOpen
                  ? 'text-white border-transparent'
                  : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              style={isSettingsOpen ? { backgroundColor: 'var(--pa-accent)' } : undefined}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Assistant Surface + Read-Only Right Context Inspector Rail */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <WorkbenchPage
            scope={scope}
            settings={settings}
            turns={turns}
            isSending={isSending}
            isMuted={isMuted}
            speech={speech}
            onSendMessage={(text, inputMode) => void handleSendMessage(text, inputMode)}
            onClearConversation={() => {
              setTurns([]);
              setTelemetry({
                phase: 'Idle',
                isThinking: false,
                promptChars: 0,
                historyTurnsUsed: 0,
                lastError: '',
              });
              pushContextLog('info', 'Session context cleared');
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onToggleMute={() => setIsMuted((prev) => !prev)}
          />

          {isContextRailOpen && (
            <>
              {/* Right Rail Drag Splitter */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize right LLM context monitor"
                title="Drag to resize right LLM context monitor"
                onPointerDown={(e) => {
                  e.preventDefault();
                  startPaneResize('right', e.clientX, rightRailWidth);
                }}
                className="hidden lg:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center group hover:bg-sky-500/15 transition-colors"
              >
                <span
                  className={`w-0.5 h-9 rounded-full transition-colors ${
                    activeResizer === 'right'
                      ? 'bg-sky-500'
                      : 'bg-slate-300/70 dark:bg-slate-700/70 group-hover:bg-sky-500/80'
                  }`}
                />
              </div>

              <ContextMonitorRail
                telemetry={telemetry}
                logs={contextLogs}
                nowMs={nowMs}
                width={rightRailWidth}
              />
            </>
          )}
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

            <div className="flex items-center gap-3 shrink-0 font-mono text-[11px] text-slate-600 dark:text-slate-300">
              <span
                className={
                  telemetry.phase === 'Thinking'
                    ? 'text-sky-600 dark:text-sky-400 font-semibold'
                    : telemetry.phase === 'Error'
                      ? 'text-red-600 dark:text-red-400 font-semibold'
                      : telemetry.phase === 'Ready'
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                }
              >
                {telemetry.isThinking && telemetry.startedAtMs
                  ? `Thinking ${((Math.max(0, nowMs - telemetry.startedAtMs)) / 1000).toFixed(1)}s`
                  : telemetry.phase}
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
              <span className="hidden sm:inline">
                Tokens: {telemetry.totalTokens !== undefined ? telemetry.totalTokens.toLocaleString() : '—'}
              </span>
              <span className="hidden md:inline text-slate-300 dark:text-slate-700">|</span>
              <span className="hidden md:inline">
                {telemetry.tokensPerSecond !== undefined
                  ? `${telemetry.tokensPerSecond.toFixed(1)} tok/s`
                  : '— tok/s'}
              </span>
              <span className="hidden lg:inline text-slate-300 dark:text-slate-700">|</span>
              <span className="hidden lg:inline">
                Time:{' '}
                {telemetry.isThinking && telemetry.startedAtMs
                  ? `${((Math.max(0, nowMs - telemetry.startedAtMs)) / 1000).toFixed(1)}s`
                  : telemetry.durationMs !== undefined
                    ? `${(telemetry.durationMs / 1000).toFixed(2)}s`
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
                {telemetry.promptChars > 0
                  ? `${telemetry.promptChars.toLocaleString()} ch (${telemetry.historyTurnsUsed}t)`
                  : '—'}
              </span>
              <span>
                Input: {telemetry.inputTokens !== undefined ? telemetry.inputTokens.toLocaleString() : '—'}
              </span>
              <span>
                Output: {telemetry.outputTokens !== undefined ? telemetry.outputTokens.toLocaleString() : '—'}
              </span>
              <span className={telemetry.lastError ? 'text-red-600 dark:text-red-400 truncate' : 'truncate'}>
                Status: {telemetry.lastError || 'Healthy · No active errors'}
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
            className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 text-white"
            style={{
              backgroundColor: replyToast.isError ? '#dc2626' : 'var(--pa-accent)',
            }}
          >
            <Bell className="w-3.5 h-3.5" />
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

      {/* Compact Settings Modal Window */}
      {isSettingsOpen && (
        <SettingsPage
          settings={settings}
          onApplySettings={(next) => setSettings(next)}
          onClose={() => setIsSettingsOpen(false)}
          speech={speech}
          messageCount={turns.length}
          configFileInfo={configFileInfo}
          onReloadConfigFromFile={() => void reloadConfigFromFile()}
          onExportHistory={handleExportHistory}
          onClearConversation={() => {
            setTurns([]);
            setTelemetry({
              phase: 'Idle',
              isThinking: false,
              promptChars: 0,
              historyTurnsUsed: 0,
              lastError: '',
            });
            pushContextLog('info', 'Session context cleared');
          }}
          onClearAppCache={() => {
            setTurns([]);
            setReplyToast(null);
            setTelemetry({
              phase: 'Idle',
              isThinking: false,
              promptChars: 0,
              historyTurnsUsed: 0,
              lastError: '',
            });
            try {
              window.localStorage.removeItem('fluent_paw_conversation_v1');
              if ('caches' in window) {
                void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
              }
            } catch {
              // Ignore storage cleanup errors
            }
            pushContextLog('info', 'App cache cleared');
          }}
          onResetSettings={() => setSettings(DEFAULT_SETTINGS)}
          onContextLog={pushContextLog}
        />
      )}
    </div>
  );
}

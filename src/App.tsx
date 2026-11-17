import {
  Cloud,
  Lock,
  Mic,
  MicOff,
  Palette,
  Settings,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingsPage } from './components/SettingsPage';
import { WorkbenchPage } from './components/WorkbenchPage';
import { useSpeechIO } from './hooks/useSpeechIO';
import type {
  AnyAdapterId,
  ConversationScope,
  ConversationTurn,
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
    if (isDarkActive) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [effectiveTheme, isDarkActive]);

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

    const historyPayload = turns
      .filter((t) => t.role === 'user' || t.role === 'assistant')
      .slice(-16)
      .map((t) => ({
        role: t.role as 'user' | 'assistant',
        content: t.content,
      }));

    setTurns((prev) => [...prev, userTurn]);
    setIsSending(true);

    try {
      const options =
        scope === 'private'
          ? {
              model: settings.privateLlm.selectedModel,
              systemInstruction: settings.privateLlm.systemInstruction,
              ollamaBaseUrl: settings.privateLlm.ollamaBaseUrl,
              contextWindow: settings.privateLlm.contextWindow,
              keepAlive: settings.privateLlm.keepAlive,
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
        error?: string;
      };

      if (!response.ok || payload.error || !payload.text) {
        throw new Error(payload.error || 'Adapter returned an error.');
      }

      const assistantTurn: ConversationTurn = {
        id: `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'assistant',
        content: payload.text,
        timestamp: new Date().toISOString(),
        scope: payload.scope || scope,
        adapterId: payload.adapterId || adapterId,
        model: payload.model || modelName,
        durationMs: payload.durationMs,
        tokenCount: payload.tokenCount,
        adapterProtocol: payload.protocol,
      };

      setTurns((prev) => [...prev, assistantTurn]);

      const shouldAutoSpeak =
        (assistantTurn.scope === 'public' && settings.voice.autoSpeakPublic) ||
        (assistantTurn.scope === 'private' && settings.voice.autoSpeakPrivate);
      if (shouldAutoSpeak) {
        speech.speakText(assistantTurn.id, assistantTurn.content);
      }
    } catch (err) {
      const errTurn: ConversationTurn = {
        id: `err-${Date.now()}`,
        role: 'error',
        content: err instanceof Error ? err.message : 'Request failed.',
        timestamp: new Date().toISOString(),
        scope,
        adapterId,
        model: modelName,
      };
      setTurns((prev) => [...prev, errTurn]);
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
      {/* Left WinUI 3 NavigationView Rail */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col justify-between border-r border-slate-200/80 dark:border-slate-800/80 bg-white/55 dark:bg-slate-900/55 backdrop-blur-xl p-3">
        <div className="space-y-6">
          <div className="px-3 pt-2 pb-1 flex items-center gap-2.5">
            <img src="/favicon.svg" alt="Personal Assistant" className="w-7 h-7 shrink-0" />
            <div className="min-w-0">
              <div className="font-display text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                Personal Assistant
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
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
              <span>Personal Assistant</span>
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

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Fluent Top Menu Bar */}
        <header className="h-14 shrink-0 px-4 sm:px-6 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl flex items-center justify-between gap-4">
          {/* Zone 1: App Icon + Title */}
          <div className="flex items-center gap-2.5 min-w-0">
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

        {/* Main Assistant Surface */}
        <WorkbenchPage
          scope={scope}
          settings={settings}
          turns={turns}
          isSending={isSending}
          isMuted={isMuted}
          speech={speech}
          onSendMessage={(text, inputMode) => void handleSendMessage(text, inputMode)}
          onClearConversation={() => setTurns([])}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onToggleMute={() => setIsMuted((prev) => !prev)}
        />

        {/* Bottom Panel Status Bar */}
        <footer className="h-7 shrink-0 px-4 sm:px-6 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl flex items-center justify-between gap-4 text-xs">
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
          <span className="hidden sm:inline font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {configFileInfo.filePath}
          </span>
        </footer>
      </div>

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
          onClearConversation={() => setTurns([])}
          onResetSettings={() => setSettings(DEFAULT_SETTINGS)}
        />
      )}
    </div>
  );
}

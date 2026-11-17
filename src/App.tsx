import {
  Camera,
  Cloud,
  Lock,
  Mic,
  MicOff,
  Moon,
  Settings,
  SlidersHorizontal,
  Square,
  Sun,
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
  WorkbenchSettings,
} from './types/workbench';
import {
  DEFAULT_SETTINGS,
  loadConversation,
  loadScope,
  loadSettings,
  resizeAvatarToDataUrl,
  saveConversation,
  saveScope,
  saveSettings,
} from './utils/storage';

type ActivePage = 'workbench' | 'settings';

const USER_AVATAR_SRC = '/src/assets/images/local_user_avatar_1794900004889.jpg';

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>('workbench');
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
  const avatarUploadRef = useRef<HTMLInputElement | null>(null);

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

  const isDarkActive =
    settings.theme === 'dark' || (settings.theme === 'system' && systemPrefersDark);

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
    if (isDarkActive) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkActive]);

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
    a.download = `assistant-workbench-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex mica-canvas text-slate-900 dark:text-slate-100 select-none sm:select-auto">
      {/* Left WinUI 3 NavigationView Rail */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col justify-between border-r border-slate-200/80 dark:border-slate-800/80 bg-white/55 dark:bg-slate-900/55 backdrop-blur-xl p-3">
        <div className="space-y-6">
          <div className="px-3 pt-2 pb-1">
            <div className="font-display text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Personal Workbench
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              WinUI 3 Fluent Edition
            </div>
          </div>

          <nav className="space-y-1" aria-label="Primary pages">
            <button
              type="button"
              onClick={() => setActivePage('workbench')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activePage === 'workbench'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200/80 dark:border-slate-700/70'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Cloud className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>Cloud Workbench</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePage('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activePage === 'settings'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200/80 dark:border-slate-700/70'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4 text-slate-600 dark:text-slate-300 shrink-0" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Local Windows Profile Footer (Click to upload photo) */}
        <div className="pt-3 border-t border-slate-200/75 dark:border-slate-800/80 px-1 py-1.5">
          <button
            type="button"
            onClick={() => avatarUploadRef.current?.click()}
            title="Click to upload your profile photo"
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/70 dark:hover:bg-slate-800/70 transition-colors text-left group"
          >
            <div className="relative shrink-0">
              {settings.profile.avatarDataUrl ? (
                <img
                  src={settings.profile.avatarDataUrl}
                  alt={settings.profile.displayName || 'User avatar'}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                />
              ) : !avatarError ? (
                <img
                  src={USER_AVATAR_SRC}
                  alt={settings.profile.displayName || 'User avatar'}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                  className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-semibold">
                  {(settings.profile.displayName || 'U').slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 opacity-85 group-hover:opacity-100">
                <Camera className="w-2.5 h-2.5" />
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                {settings.profile.displayName || 'Local User'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Upload photo
              </div>
            </div>
          </button>
          <input
            ref={avatarUploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const dataUrl = await resizeAvatarToDataUrl(file);
                setSettings((prev) => ({
                  ...prev,
                  profile: { ...prev.profile, avatarDataUrl: dataUrl },
                }));
              } catch {
                // Ignore invalid image
              }
              e.target.value = '';
            }}
          />
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Fluent Top Menu Bar */}
        <header className="h-14 shrink-0 px-4 sm:px-6 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl flex items-center justify-between gap-4">
          {/* Zone 1: Page Title + Mobile Page Switch */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-display text-sm sm:text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
              Assistant Workbench
            </span>
            <div className="flex md:hidden items-center gap-1 ml-2">
              <button
                type="button"
                onClick={() => setActivePage('workbench')}
                aria-label="Cloud Workbench"
                className={`p-2 rounded-lg ${
                  activePage === 'workbench'
                    ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    : 'text-slate-500'
                }`}
              >
                <Cloud className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setActivePage('settings')}
                aria-label="Settings"
                className={`p-2 rounded-lg ${
                  activePage === 'settings'
                    ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    : 'text-slate-500'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
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
                  ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Public</span>
            </button>
          </div>

          {/* Zone 3: Mute, Speak & Theme Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsMuted((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                isMuted
                  ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  : 'bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Mic On'}</span>
            </button>

            <button
              type="button"
              onClick={toggleTopBarSpeak}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                speech.speakingTurnId
                  ? 'bg-sky-600 border-sky-600 text-white hover:bg-sky-700'
                  : activeAutoSpeak
                    ? 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300'
                    : 'bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {speech.speakingTurnId ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span className="hidden sm:inline">Stop</span>
                </>
              ) : activeAutoSpeak ? (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Auto-Speak</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Speak Off</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  theme: isDarkActive ? 'light' : 'dark',
                }))
              }
              aria-label="Toggle light or dark theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              {isDarkActive ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </header>

        {/* Two-Page Router */}
        {activePage === 'workbench' ? (
          <WorkbenchPage
            scope={scope}
            settings={settings}
            turns={turns}
            isSending={isSending}
            isMuted={isMuted}
            speech={speech}
            onSendMessage={(text, inputMode) => void handleSendMessage(text, inputMode)}
            onClearConversation={() => setTurns([])}
            onOpenSettings={() => setActivePage('settings')}
            onToggleMute={() => setIsMuted((prev) => !prev)}
          />
        ) : (
          <SettingsPage
            settings={settings}
            onUpdateSettings={setSettings}
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
    </div>
  );
}

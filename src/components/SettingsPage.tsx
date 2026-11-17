import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FolderOpen,
  HardDrive,
  Lock,
  Palette,
  Play,
  RefreshCw,
  Save,
  Server,
  Trash2,
  User,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AdapterHealthResult,
  AdapterWireSummary,
  AnyAdapterId,
  FontOption,
  OllamaModelInfo,
  PublicAdapterId,
  ThemeMode,
  WorkbenchSettings,
} from '../types/workbench';
import type { UseSpeechIOResult } from '../hooks/useSpeechIO';
import { normalizeFontOption, normalizeThemeMode } from '../utils/storage';
import {
  playReplyChime,
  requestDesktopNotificationPermission,
  showDesktopNotification,
} from '../utils/notify';
import { WINUI3_SKELETON_SNIPPETS } from '../utils/winui3Skeleton';

const FONT_OPTIONS: Array<{
  id: FontOption;
  label: string;
  sample: string;
  cssFamily: string;
}> = [
  {
    id: 'segoe',
    label: 'Segoe UI',
    sample: 'Default Sans',
    cssFamily: '"Segoe UI Variable Text", "DM Sans", system-ui, sans-serif',
  },
  {
    id: 'calibri',
    label: 'Calibri',
    sample: 'Clean Sans',
    cssFamily: 'Calibri, "Plus Jakarta Sans", system-ui, sans-serif',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    sample: 'Editorial Serif',
    cssFamily: 'Georgia, "Times New Roman", serif',
  },
  {
    id: 'cascadia',
    label: 'Cascadia Mono',
    sample: 'Technical Mono',
    cssFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
  },
];

interface ConfigFileInfo {
  filePath: string;
  platform: string;
  lastSavedAt?: string;
  syncError?: string;
}

interface SettingsPageProps {
  settings: WorkbenchSettings;
  onApplySettings: (next: WorkbenchSettings) => void;
  onClose: () => void;
  speech: UseSpeechIOResult;
  messageCount: number;
  configFileInfo: ConfigFileInfo;
  onReloadConfigFromFile: () => void;
  onExportHistory: () => void;
  onClearConversation: () => void;
  onClearAppCache: () => void;
  onResetSettings: () => void;
  onContextLog?: (level: 'info' | 'success' | 'error', message: string) => void;
}

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  code: string;
  swatchBg: string;
  swatchAccent: string;
}> = [
  {
    id: 'system',
    label: 'System',
    code: 'OS Auto',
    swatchBg: '#e2e8f0',
    swatchAccent: '#0284c7',
  },
  {
    id: 'arctic-sky',
    label: 'Arctic Sky',
    code: '#0284C7',
    swatchBg: '#f0f7ff',
    swatchAccent: '#0284c7',
  },
  {
    id: 'midnight-slate',
    label: 'Midnight Slate',
    code: '#38BDF8',
    swatchBg: '#0f172a',
    swatchAccent: '#38bdf8',
  },
  {
    id: 'emerald-mist',
    label: 'Emerald Mist',
    code: '#059669',
    swatchBg: '#ecfdf5',
    swatchAccent: '#059669',
  },
  {
    id: 'royal-amethyst',
    label: 'Royal Amethyst',
    code: '#A855F7',
    swatchBg: '#170e26',
    swatchAccent: '#a855f7',
  },
];

export function SettingsPage({
  settings,
  onApplySettings,
  onClose,
  speech,
  messageCount,
  configFileInfo,
  onReloadConfigFromFile,
  onExportHistory,
  onClearConversation,
  onClearAppCache,
  onResetSettings,
  onContextLog,
}: SettingsPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<WorkbenchSettings>(settings);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);
  const [profileSyncNote, setProfileSyncNote] = useState<string | null>(null);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [ollamaSuccessNote, setOllamaSuccessNote] = useState<string | null>(null);
  const [manualModelInput, setManualModelInput] = useState(
    settings.privateLlm.selectedModel,
  );

  const [adapterSummaries, setAdapterSummaries] = useState<AdapterWireSummary[]>([]);
  const [healthByAdapter, setHealthByAdapter] = useState<
    Partial<Record<AnyAdapterId, AdapterHealthResult>>
  >({});
  const [testingAdapterId, setTestingAdapterId] = useState<AnyAdapterId | null>(null);
  const [inspectedAdapterId, setInspectedAdapterId] = useState<AnyAdapterId | null>(null);
  const [showWinUiSkeleton, setShowWinUiSkeleton] = useState(false);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [notifyFeedback, setNotifyFeedback] = useState<string | null>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceFeedback, setMaintenanceFeedback] = useState<string | null>(null);

  const updateDraft = (updater: WorkbenchSettings | ((prev: WorkbenchSettings) => WorkbenchSettings)) => {
    setDraft((prev) => (typeof updater === 'function' ? updater(prev) : updater));
    setHasUnsavedChanges(true);
    setApplyFeedback(null);
  };

  useEffect(() => {
    setDraft(settings);
    setHasUnsavedChanges(false);
  }, [settings]);

  useEffect(() => {
    setManualModelInput(draft.privateLlm.selectedModel);
  }, [draft.privateLlm.selectedModel]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    void fetch('/api/adapters')
      .then((res) => res.json())
      .then((data: { adapters?: AdapterWireSummary[] }) => {
        if (Array.isArray(data.adapters)) {
          setAdapterSummaries(data.adapters);
        }
      })
      .catch(() => undefined);
  }, []);

  const discoverOllamaModels = async () => {
    setOllamaLoading(true);
    setOllamaError(null);
    setOllamaSuccessNote(null);

    try {
      const response = await fetch('/api/ollama/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: draft.privateLlm.ollamaBaseUrl,
        }),
      });
      const payload = (await response.json()) as {
        models?: OllamaModelInfo[];
        error?: string;
      };

      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'Failed to discover Ollama models.');
      }

      const list = Array.isArray(payload.models) ? payload.models : [];
      setOllamaModels(list);
      setOllamaSuccessNote(
        `Connected to Ollama (${list.length} deployed model${list.length === 1 ? '' : 's'} found).`,
      );

      if (list.length > 0 && !draft.privateLlm.selectedModel) {
        updateDraft((prev) => ({
          ...prev,
          privateLlm: {
            ...prev.privateLlm,
            selectedModel: list[0].name,
          },
        }));
      }
    } catch (err) {
      setOllamaModels([]);
      setOllamaError(
        err instanceof Error
          ? err.message
          : 'Unable to reach Ollama at the configured URL.',
      );
    } finally {
      setOllamaLoading(false);
    }
  };

  const handleTestAdapter = async (adapterId: AnyAdapterId) => {
    setTestingAdapterId(adapterId);
    try {
      const options =
        adapterId === 'ollama'
          ? { ollamaBaseUrl: draft.privateLlm.ollamaBaseUrl }
          : {
              model: draft.publicLlm.adapters[adapterId].model,
              endpointUrl: draft.publicLlm.adapters[adapterId].endpointUrl,
            };

      const res = await fetch('/api/adapters/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterId, options }),
      });
      const data = (await res.json()) as AdapterHealthResult;
      if (data && data.adapterId) {
        setHealthByAdapter((prev) => ({ ...prev, [adapterId]: data }));
      }
    } catch {
      // Handled via status state
    } finally {
      setTestingAdapterId(null);
    }
  };

  const handleClearCache = () => {
    onClearAppCache();
    setOllamaModels([]);
    setHealthByAdapter({});
    setOllamaError(null);
    setOllamaSuccessNote(null);
    setMaintenanceFeedback('Cleared cached conversation, model list, and browser cache.');
  };

  const handleUnloadOllamaMemory = async (alsoClearCache: boolean) => {
    setMaintenanceLoading(true);
    setMaintenanceFeedback(
      alsoClearCache
        ? 'Clearing cache and unloading Private Ollama memory...'
        : 'Unloading Private Ollama model memory...',
    );

    if (alsoClearCache) {
      onClearAppCache();
      setOllamaModels([]);
      setHealthByAdapter({});
    }

    try {
      const res = await fetch('/api/ollama/unload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: draft.privateLlm.ollamaBaseUrl,
          model: draft.privateLlm.selectedModel,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!res.ok || payload.error) {
        throw new Error(payload.error || 'Failed to unload Ollama model memory.');
      }
      const summary = alsoClearCache
        ? `Cache cleared. ${payload.message || 'Ollama memory unloaded.'}`
        : payload.message || 'Unloaded Ollama model memory.';
      setMaintenanceFeedback(summary);
      onContextLog?.('success', summary);
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Unable to contact Ollama to unload model memory.';
      setMaintenanceFeedback(errMsg);
      onContextLog?.('error', `Ollama unload failed: ${errMsg}`);
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const syncWindowsAccountProfile = async () => {
    try {
      const res = await fetch('/api/profile/windows');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        displayName?: string;
        avatarDataUrl?: string;
      };
      updateDraft((prev) => ({
        ...prev,
        profile: {
          displayName: data.displayName || prev.profile.displayName,
          avatarDataUrl: data.avatarDataUrl || prev.profile.avatarDataUrl,
        },
      }));
      setProfileSyncNote(
        data.avatarDataUrl
          ? 'Synced display name and account profile picture.'
          : 'Synced account display name from Windows.',
      );
    } catch {
      setProfileSyncNote('Account picture sync runs automatically when hosted on Windows.');
    }
  };

  const activePublicId = draft.publicLlm.activeAdapter;
  const publicAdapterSummaries = adapterSummaries.filter((a) => a.scope === 'public');

  const updatePublicAdapter = (
    id: PublicAdapterId,
    patch: Partial<WorkbenchSettings['publicLlm']['adapters'][PublicAdapterId]>,
  ) => {
    updateDraft((prev) => ({
      ...prev,
      publicLlm: {
        ...prev.publicLlm,
        adapters: {
          ...prev.publicLlm.adapters,
          [id]: {
            ...prev.publicLlm.adapters[id],
            ...patch,
          },
        },
      },
    }));
  };

  const handleCopySnippet = (filename: string, code: string) => {
    void navigator.clipboard?.writeText(code);
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile((prev) => (prev === filename ? null : prev)), 1500);
  };

  const handleApply = () => {
    onApplySettings(draft);
    setHasUnsavedChanges(false);
    setApplyFeedback(`Applied at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };

  const handleSaveAndClose = () => {
    onApplySettings(draft);
    setHasUnsavedChanges(false);
    onClose();
  };

  const normalizedDraftTheme = normalizeThemeMode(draft.theme);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        {/* Compact Modal Header */}
        <header className="shrink-0 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/80 dark:bg-slate-950/60">
          <div>
            <h1
              id="settings-modal-title"
              className="font-display text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100"
            >
              Personal Assistant Settings
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Themes, Windows account profile, Ollama, Public adapters &amp; local storage
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            title="Close"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto fluent-scroll p-5 space-y-7">
          {/* Section 0: Color-Coded Themes & Account Profile */}
          <section className="space-y-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Palette className="w-4 h-4" style={{ color: 'var(--pa-accent)' }} />
                <span>Color Themes &amp; Account Profile</span>
              </h2>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Select Theme
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {THEME_OPTIONS.map((option) => {
                    const isSelected = normalizedDraftTheme === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          updateDraft((prev) => ({
                            ...prev,
                            theme: option.id,
                          }))
                        }
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-white dark:bg-slate-900 shadow-xs ring-1'
                            : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                        style={
                          isSelected
                            ? {
                                borderColor: option.swatchAccent,
                                boxShadow: `0 0 0 1px ${option.swatchAccent}`,
                              }
                            : undefined
                        }
                      >
                        <span
                          className="w-6 h-6 rounded-lg border border-slate-300/60 dark:border-slate-600/60 flex items-center justify-center shrink-0"
                          style={{ backgroundColor: option.swatchBg }}
                        >
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: option.swatchAccent }}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                            {option.label}
                          </span>
                          <span className="block text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            {option.code}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Conversation Font
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FONT_OPTIONS.map((fontOpt) => {
                    const currentFont = normalizeFontOption(draft.fontFamily);
                    const isFontSelected = currentFont === fontOpt.id;
                    return (
                      <button
                        key={fontOpt.id}
                        type="button"
                        onClick={() =>
                          updateDraft((prev) => ({
                            ...prev,
                            fontFamily: fontOpt.id,
                          }))
                        }
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isFontSelected
                            ? 'bg-white dark:bg-slate-900 shadow-xs ring-1'
                            : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                        style={
                          isFontSelected
                            ? {
                                borderColor: 'var(--pa-accent)',
                                boxShadow: '0 0 0 1px var(--pa-accent)',
                              }
                            : undefined
                        }
                      >
                        <span
                          className="block text-xs font-semibold text-slate-900 dark:text-slate-100 truncate"
                          style={{ fontFamily: fontOpt.cssFamily }}
                        >
                          {fontOpt.label}
                        </span>
                        <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                          {fontOpt.sample}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label
                    htmlFor="profile-display-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Account Display Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="profile-display-name"
                      type="text"
                      value={draft.profile.displayName}
                      onChange={(e) =>
                        updateDraft((prev) => ({
                          ...prev,
                          profile: {
                            ...prev.profile,
                            displayName: e.target.value,
                          },
                        }))
                      }
                      placeholder="Windows account user"
                      className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => void syncWindowsAccountProfile()}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sync Account Picture</span>
                  </button>
                  {profileSyncNote && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {profileSyncNote}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

        {/* Section 1: Private LLM (Windows Ollama) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Private LLM (Windows Ollama)</span>
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Discover and connect to models deployed locally through Ollama on Windows.
              </p>
            </div>
            <button
              type="button"
              onClick={discoverOllamaModels}
              disabled={ollamaLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${ollamaLoading ? 'animate-spin' : ''}`} />
              <span>{ollamaLoading ? 'Scanning Ollama...' : 'Discover Local Models'}</span>
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 divide-y divide-slate-200 dark:divide-slate-800">
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="ollama-url"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Ollama Daemon URL
                </label>
                <input
                  id="ollama-url"
                  type="url"
                  value={draft.privateLlm.ollamaBaseUrl}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      privateLlm: {
                        ...prev.privateLlm,
                        ollamaBaseUrl: e.target.value,
                      },
                    }))
                  }
                  placeholder="http://127.0.0.1:11434"
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </div>

              <div>
                <label
                  htmlFor="ollama-manual-model"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Active Private Model Tag
                </label>
                <div className="flex gap-2">
                  <input
                    id="ollama-manual-model"
                    type="text"
                    value={manualModelInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setManualModelInput(val);
                      updateDraft((prev) => ({
                        ...prev,
                        privateLlm: {
                          ...prev.privateLlm,
                          selectedModel: val,
                        },
                      }));
                    }}
                    placeholder="e.g. llama3.2, qwen2.5:7b"
                    className="flex-1 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>
              </div>
            </div>

            {/* Discovered Models Table */}
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Deployed Ollama Models
                </span>
                {ollamaSuccessNote && (
                  <span className="text-xs text-emerald-700 dark:text-emerald-400">
                    {ollamaSuccessNote}
                  </span>
                )}
              </div>

              {ollamaError && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/40 p-3.5 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  <p className="font-medium">{ollamaError}</p>
                  <p className="mt-1 text-amber-800/90 dark:text-amber-300/90">
                    To connect to Ollama on your Windows machine, verify <code className="font-mono">ollama serve</code> is running locally at <code className="font-mono">http://127.0.0.1:11434</code> (or provide an accessible tunnel URL above when previewing from a remote host).
                  </p>
                </div>
              )}

              {ollamaModels.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3.5 font-medium">Model</th>
                        <th className="py-2.5 px-3.5 font-medium">Family</th>
                        <th className="py-2.5 px-3.5 font-medium">Params</th>
                        <th className="py-2.5 px-3.5 font-medium text-right">Size</th>
                        <th className="py-2.5 px-3.5 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {ollamaModels.map((model) => {
                        const isSelected = draft.privateLlm.selectedModel === model.name;
                        return (
                          <tr
                            key={model.name}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-2.5 px-3.5 font-mono text-slate-900 dark:text-slate-100">
                              {model.name}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                              {model.family || '—'}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400 tabular-nums">
                              {model.parameterSize || '—'}
                            </td>
                            <td className="py-2.5 px-3.5 text-right text-slate-600 dark:text-slate-400 tabular-nums">
                              {model.sizeFormatted}
                            </td>
                            <td className="py-2.5 px-3.5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  updateDraft((prev) => ({
                                    ...prev,
                                    privateLlm: {
                                      ...prev.privateLlm,
                                      selectedModel: model.name,
                                    },
                                  }))
                                }
                                className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                              >
                                {isSelected ? 'Selected' : 'Use Model'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                !ollamaError && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Click Discover Local Models to query <code className="font-mono">/api/tags</code> from your Ollama instance, or enter an installed model tag above.
                  </p>
                )
              )}
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="private-system-prompt"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Private Assistant System Instruction
                </label>
                <textarea
                  id="private-system-prompt"
                  rows={2}
                  value={draft.privateLlm.systemInstruction}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      privateLlm: {
                        ...prev.privateLlm,
                        systemInstruction: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="ollama-ctx"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Context Window (num_ctx)
                  </label>
                  <select
                    id="ollama-ctx"
                    value={draft.privateLlm.contextWindow}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        privateLlm: {
                          ...prev.privateLlm,
                          contextWindow: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  >
                    <option value={4096}>4,096 tokens (Low RAM)</option>
                    <option value={8192}>8,192 tokens (Balanced)</option>
                    <option value={16384}>16,384 tokens (Long)</option>
                    <option value={32768}>32,768 tokens (Max)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ollama-keep-alive"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Memory Keep-Alive
                  </label>
                  <select
                    id="ollama-keep-alive"
                    value={draft.privateLlm.keepAlive || '10m'}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        privateLlm: {
                          ...prev.privateLlm,
                          keepAlive: e.target.value,
                        },
                      }))
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  >
                    <option value="0">Unload immediately (0)</option>
                    <option value="2m">2 minutes</option>
                    <option value="5m">5 minutes</option>
                    <option value="10m">10 minutes (Default)</option>
                    <option value="30m">30 minutes</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ollama-history-turns"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    History Window
                  </label>
                  <select
                    id="ollama-history-turns"
                    value={draft.privateLlm.maxHistoryTurns ?? 16}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        privateLlm: {
                          ...prev.privateLlm,
                          maxHistoryTurns: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  >
                    <option value={4}>Last 4 turns (Lightest)</option>
                    <option value={8}>Last 8 turns (Fast)</option>
                    <option value={12}>Last 12 turns</option>
                    <option value={16}>Last 16 turns (Default)</option>
                    <option value={24}>Last 24 turns</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/70 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="request-timeout-preset"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Query Request Timeout (Private & Public LLMs)
                  </label>
                  <select
                    id="request-timeout-preset"
                    value={
                      [0, 300, 600, 1800, 3600].includes(draft.requestTimeoutSeconds ?? 0)
                        ? draft.requestTimeoutSeconds ?? 0
                        : -1
                    }
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (val >= 0) {
                        updateDraft((prev) => ({
                          ...prev,
                          requestTimeoutSeconds: val,
                        }));
                      }
                    }}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  >
                    <option value={0}>No Timeout (Unlimited · Full Throttle)</option>
                    <option value={300}>5 Minutes (300 seconds)</option>
                    <option value={600}>10 Minutes (600 seconds)</option>
                    <option value={1800}>30 Minutes (1800 seconds)</option>
                    <option value={3600}>60 Minutes (3600 seconds)</option>
                    {![0, 300, 600, 1800, 3600].includes(draft.requestTimeoutSeconds ?? 0) && (
                      <option value={-1}>
                        Custom ({draft.requestTimeoutSeconds} seconds)
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="request-timeout-seconds"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Custom Timeout Seconds (0 = No Timeout)
                  </label>
                  <input
                    id="request-timeout-seconds"
                    type="number"
                    min={0}
                    step={30}
                    value={draft.requestTimeoutSeconds ?? 0}
                    onChange={(e) => {
                      const parsed = Math.max(0, Math.round(Number(e.target.value) || 0));
                      updateDraft((prev) => ({
                        ...prev,
                        requestTimeoutSeconds: parsed,
                      }));
                    }}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Public LLM Adapters */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Server className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>Public LLM Adapters</span>
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Separate provider adapters normalize outgoing prompts and incoming responses for Gemini, Claude, and Fable.
              </p>
            </div>

            <div className="inline-flex items-center p-1 rounded-lg bg-slate-200/75 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              {(['gemini', 'claude', 'fable'] as PublicAdapterId[]).map((id) => {
                const isActive = activePublicId === id;
                const label = id === 'gemini' ? 'Gemini' : id === 'claude' ? 'Claude' : 'Fable';
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      updateDraft((prev) => ({
                        ...prev,
                        publicLlm: {
                          ...prev.publicLlm,
                          activeAdapter: id,
                        },
                      }))
                    }
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {(['gemini', 'claude', 'fable'] as PublicAdapterId[]).map((adapterId) => {
              const summary = publicAdapterSummaries.find((s) => s.id === adapterId);
              const cfg = draft.publicLlm.adapters[adapterId];
              const isActive = activePublicId === adapterId;
              const health = healthByAdapter[adapterId];
              const isInspecting = inspectedAdapterId === adapterId;

              const title =
                adapterId === 'gemini'
                  ? 'Gemini Adapter'
                  : adapterId === 'claude'
                    ? 'Claude Adapter'
                    : 'Fable Adapter';

              return (
                <div
                  key={adapterId}
                  className={`rounded-xl border transition-colors bg-white dark:bg-slate-900/80 ${
                    isActive
                      ? 'border-sky-500/80 dark:border-sky-500/70'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="p-5 flex items-start justify-between gap-4 flex-wrap border-b border-slate-200/80 dark:border-slate-800">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">
                          {title}
                        </h3>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          {summary?.protocol || ''}
                        </span>
                        {isActive && (
                          <span className="text-xs font-medium text-sky-600 dark:text-sky-400">
                            · Active Public Adapter
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
                        {summary?.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft((prev) => ({
                              ...prev,
                              publicLlm: {
                                ...prev.publicLlm,
                                activeAdapter: adapterId,
                              },
                            }))
                          }
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                        >
                          Set Active
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleTestAdapter(adapterId)}
                        disabled={testingAdapterId === adapterId}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {testingAdapterId === adapterId ? 'Testing...' : 'Test Adapter'}
                      </button>
                    </div>
                  </div>

                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Model
                      </label>
                      <select
                        value={cfg.model}
                        onChange={(e) => updatePublicAdapter(adapterId, { model: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      >
                        {(summary?.availableModels || [cfg.model]).map((modelOpt) => (
                          <option key={modelOpt} value={modelOpt}>
                            {modelOpt}
                          </option>
                        ))}
                      </select>
                    </div>

                    {adapterId === 'gemini' ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Thinking Depth
                        </label>
                        <select
                          value={cfg.thinkingLevel || 'HIGH'}
                          onChange={(e) =>
                            updatePublicAdapter('gemini', {
                              thinkingLevel: e.target.value as 'LOW' | 'MEDIUM' | 'HIGH',
                            })
                          }
                          className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        >
                          <option value="LOW">Low (Fastest)</option>
                          <option value="MEDIUM">Medium (Balanced)</option>
                          <option value="HIGH">High (Default Reasoning)</option>
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Adapter Endpoint URL
                        </label>
                        <input
                          type="url"
                          value={cfg.endpointUrl || ''}
                          onChange={(e) =>
                            updatePublicAdapter(adapterId, { endpointUrl: e.target.value })
                          }
                          className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                      </div>
                    )}

                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        System Instruction
                      </label>
                      <textarea
                        rows={2}
                        value={cfg.systemInstruction}
                        onChange={(e) =>
                          updatePublicAdapter(adapterId, { systemInstruction: e.target.value })
                        }
                        className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    </div>
                  </div>

                  {/* Health Result + Wire Inspector Footer */}
                  <div className="px-5 py-3 bg-slate-50/70 dark:bg-slate-950/50 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap text-xs">
                    <div className="text-slate-600 dark:text-slate-400">
                      {health ? (
                        <span
                          className={
                            health.reachable
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-amber-700 dark:text-amber-400 font-medium'
                          }
                        >
                          {health.statusLabel} ({health.latencyMs} ms) — {health.detail}
                        </span>
                      ) : (
                        <span>
                          Server secret status:{' '}
                          {summary?.configuredOnServer ? 'Configured' : 'Not set in environment'}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setInspectedAdapterId((prev) => (prev === adapterId ? null : adapterId))
                      }
                      className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white font-medium whitespace-nowrap"
                    >
                      {isInspecting ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      <span>Inspect Adapter Pipeline</span>
                    </button>
                  </div>

                  {isInspecting && summary && (
                    <div className="p-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-950/70">
                      <div>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                          Outgoing Request Envelope
                        </p>
                        <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto">
                          {summary.requestEnvelopePreview}
                        </pre>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                          Normalized Response Mapping
                        </p>
                        <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto">
                          {summary.responseEnvelopePreview}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 3: Audio, Voice & Native Speaker */}
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Voice & Windows Native Speaker</span>
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Select your system speech synthesis voice and automatic speaker playback rules.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="md:col-span-2">
                <label
                  htmlFor="voice-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  System Speaker Voice ({speech.voices.length} detected)
                </label>
                <select
                  id="voice-select"
                  value={draft.voice.selectedVoiceURI}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      voice: { ...prev.voice, selectedVoiceURI: e.target.value },
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                >
                  <option value="">System Default Voice</option>
                  {speech.voices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() =>
                  speech.speakText(
                    'voice-test',
                    'Windows native speaker playback is ready for Personal Assistant.',
                  )
                }
                disabled={!speech.speechSynthesisSupported}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Test Native Speaker</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Speech Rate
                  </span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {draft.voice.rate.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.6"
                  step="0.05"
                  value={draft.voice.rate}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      voice: { ...prev.voice, rate: Number(e.target.value) },
                    }))
                  }
                  className="w-full accent-[var(--pa-accent)]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Speech Pitch
                  </span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {draft.voice.pitch.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.3"
                  step="0.05"
                  value={draft.voice.pitch}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      voice: { ...prev.voice, pitch: Number(e.target.value) },
                    }))
                  }
                  className="w-full accent-[var(--pa-accent)]"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row gap-4 sm:gap-8">
              <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.voice.autoSpeakPublic}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      voice: { ...prev.voice, autoSpeakPublic: e.target.checked },
                    }))
                  }
                  className="w-4 h-4 accent-[var(--pa-accent)] rounded"
                />
                <span>Auto-play Public LLM replies</span>
              </label>

              <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.voice.autoSpeakPrivate}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      voice: { ...prev.voice, autoSpeakPrivate: e.target.checked },
                    }))
                  }
                  className="w-4 h-4 accent-[var(--pa-accent)] rounded"
                />
                <span>Auto-play Private Ollama replies</span>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
                  <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.notifications?.soundOnReply ?? true}
                      onChange={(e) =>
                        updateDraft((prev) => ({
                          ...prev,
                          notifications: {
                            soundOnReply: e.target.checked,
                            desktopNotificationOnReply:
                              prev.notifications?.desktopNotificationOnReply ?? true,
                          },
                        }))
                      }
                      className="w-4 h-4 accent-[var(--pa-accent)] rounded"
                    />
                    <span>Play chime sound when LLM responds</span>
                  </label>

                  <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.notifications?.desktopNotificationOnReply ?? true}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        updateDraft((prev) => ({
                          ...prev,
                          notifications: {
                            soundOnReply: prev.notifications?.soundOnReply ?? true,
                            desktopNotificationOnReply: checked,
                          },
                        }));
                        if (checked) {
                          void requestDesktopNotificationPermission();
                        }
                      }}
                      className="w-4 h-4 accent-[var(--pa-accent)] rounded"
                    />
                    <span>Show notification on reply</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    playReplyChime(false);
                    const perm = await requestDesktopNotificationPermission();
                    const sent =
                      perm === 'granted' &&
                      showDesktopNotification(
                        'Personal Assistant · Notification Test',
                        'Reply chime and notifications are ready.',
                      );
                    setNotifyFeedback(
                      sent
                        ? 'Played reply chime and sent desktop notification.'
                        : 'Played reply chime (in-app notifications are active).',
                    );
                    setTimeout(() => setNotifyFeedback(null), 3000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Test Chime &amp; Notify</span>
                </button>
              </div>
              {notifyFeedback && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {notifyFeedback}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Section 4: Local Data, Config File & WinUI 3 Native Skeleton */}
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>Local Configuration File & Windows Storage</span>
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Configure models in the UI before starting a conversation, or edit <code className="font-mono text-xs">workbench.config.json</code> directly on disk.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 divide-y divide-slate-200 dark:divide-slate-800">
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Active Config File Path ({configFileInfo.platform === 'win32' ? 'Windows LocalAppData' : 'Local Host Storage'})
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-900 dark:text-slate-100 break-all">
                    {configFileInfo.filePath}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {configFileInfo.platform === 'win32'
                      ? 'Stored natively in %LOCALAPPDATA%\\FluentAssistantWorkbench\\workbench.config.json'
                      : 'When run locally on Windows, saves automatically to %LOCALAPPDATA%\\FluentAssistantWorkbench\\workbench.config.json'}
                    {configFileInfo.lastSavedAt
                      ? ` · Synced at ${new Date(configFileInfo.lastSavedAt).toLocaleTimeString()}`
                      : ''}
                  </div>
                  {configFileInfo.syncError && (
                    <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      {configFileInfo.syncError}
                    </div>
                  )}
                  {configFeedback && (
                    <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                      {configFeedback}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onReloadConfigFromFile();
                      setConfigFeedback('Reloaded settings from workbench.config.json.');
                      setTimeout(() => setConfigFeedback(null), 2500);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reload from Disk</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const jsonText = JSON.stringify(draft, null, 2);
                      const win = window as unknown as {
                        showSaveFilePicker?: (opts: unknown) => Promise<{
                          createWritable: () => Promise<{
                            write: (data: string) => Promise<void>;
                            close: () => Promise<void>;
                          }>;
                        }>;
                      };
                      if (win.showSaveFilePicker) {
                        try {
                          const handle = await win.showSaveFilePicker({
                            suggestedName: 'workbench.config.json',
                            types: [
                              {
                                description: 'JSON Configuration',
                                accept: { 'application/json': ['.json'] },
                              },
                            ],
                          });
                          const writable = await handle.createWritable();
                          await writable.write(jsonText);
                          await writable.close();
                          setConfigFeedback('Saved workbench.config.json to your chosen Windows folder.');
                          setTimeout(() => setConfigFeedback(null), 3000);
                          return;
                        } catch {
                          return;
                        }
                      }
                      const blob = new Blob([jsonText], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'workbench.config.json';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Config to Laptop</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Load Config File</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        try {
                          const parsed = JSON.parse(String(reader.result || '{}')) as Partial<WorkbenchSettings>;
                          updateDraft((prev) => ({
                            ...prev,
                            ...parsed,
                            privateLlm: {
                              ...prev.privateLlm,
                              ...(parsed.privateLlm || {}),
                            },
                            publicLlm: {
                              activeAdapter:
                                parsed.publicLlm?.activeAdapter || prev.publicLlm.activeAdapter,
                              adapters: {
                                gemini: {
                                  ...prev.publicLlm.adapters.gemini,
                                  ...(parsed.publicLlm?.adapters?.gemini || {}),
                                },
                                claude: {
                                  ...prev.publicLlm.adapters.claude,
                                  ...(parsed.publicLlm?.adapters?.claude || {}),
                                },
                                fable: {
                                  ...prev.publicLlm.adapters.fable,
                                  ...(parsed.publicLlm?.adapters?.fable || {}),
                                },
                              },
                            },
                            voice: {
                              ...prev.voice,
                              ...(parsed.voice || {}),
                            },
                          }));
                          setConfigFeedback(`Loaded configuration from ${file.name}.`);
                          setTimeout(() => setConfigFeedback(null), 3000);
                        } catch {
                          setConfigFeedback('Selected file is not valid JSON configuration.');
                        }
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Cache &amp; Private LLM Memory Relief
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Clear local caches or unload Ollama RAM/VRAM models after prolonged sessions to prevent slowdown.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleClearCache}
                    disabled={maintenanceLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear App Cache</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUnloadOllamaMemory(false)}
                    disabled={maintenanceLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${maintenanceLoading ? 'animate-spin' : ''}`} />
                    <span>Unload Ollama Memory</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUnloadOllamaMemory(true)}
                    disabled={maintenanceLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] disabled:opacity-50 transition-colors"
                  >
                    <span>Reset Cache &amp; LLM</span>
                  </button>
                </div>
              </div>

              {maintenanceFeedback && (
                <div className="text-xs text-emerald-700 dark:text-emerald-400">
                  {maintenanceFeedback}
                </div>
              )}

              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm text-slate-700 dark:text-slate-300 tabular-nums">
                  Local conversation turns stored: <strong className="font-semibold">{messageCount}</strong>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={onExportHistory}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Conversation JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClearConversation}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear History</span>
                  </button>
                  <button
                    type="button"
                    onClick={onResetSettings}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 dark:border-red-900/70 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                  >
                    <span>Reset Defaults</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5">
              <button
                type="button"
                onClick={() => setShowWinUiSkeleton((prev) => !prev)}
                className="flex items-center justify-between w-full text-left text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                <span>WinUI 3 (.NET 8 / C#) Native Windows Adapter Skeleton</span>
                {showWinUiSkeleton ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {showWinUiSkeleton && (
                <div className="mt-4 space-y-4">
                  {WINUI3_SKELETON_SNIPPETS.map((item) => (
                    <div
                      key={item.filename}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {item.title}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {item.filename}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopySnippet(item.filename, item.code)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          {copiedFile === item.filename ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="p-3.5 bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
                        <code>{item.code}</code>
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

        {/* Sticky Modal Footer: Close, Apply, Save & Close */}
        <footer className="shrink-0 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {applyFeedback ? (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                {applyFeedback}
              </span>
            ) : hasUnsavedChanges ? (
              <span>Pending changes — click Apply or Save &amp; Close</span>
            ) : (
              <span>All settings saved</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] transition-colors"
            >
              Save &amp; Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

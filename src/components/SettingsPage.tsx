import {
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Globe,
  HardDrive,
  Lock,
  Palette,
  Play,
  RefreshCw,
  Server,
  User,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import {
  buildReferenceContextUrl,
  fetchReferenceContextFromApi,
} from '../utils/referenceContextFetch';

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
  defaultReportsDir?: string;
  resolvedReportsDir?: string;
}

interface SettingsPageProps {
  settings: WorkbenchSettings;
  onApplySettings: (next: WorkbenchSettings) => void;
  onClose: () => void;
  speech: UseSpeechIOResult;
  messageCount: number;
  configFileInfo: ConfigFileInfo;
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
  onResetSettings,
  onContextLog,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<WorkbenchSettings>(settings);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);
  const [profileSyncNote, setProfileSyncNote] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaRefreshing, setOllamaRefreshing] = useState(false);
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
  const [notifyFeedback, setNotifyFeedback] = useState<string | null>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceFeedback, setMaintenanceFeedback] = useState<string | null>(null);
  const [refApiTesting, setRefApiTesting] = useState(false);
  const [refPortInput, setRefPortInput] = useState(
    String(settings.referenceContextApi.port || 3000),
  );
  const [refApiTestFeedback, setRefApiTestFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [reportsRescanning, setReportsRescanning] = useState(false);
  const [reportsFolderStatus, setReportsFolderStatus] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<{
    appearance: boolean;
    privateLlm: boolean;
    publicLlm: boolean;
    voice: boolean;
    referenceApi: boolean;
    storage: boolean;
  }>({
    appearance: true,
    privateLlm: true,
    publicLlm: true,
    voice: true,
    referenceApi: true,
    storage: true,
  });

  const toggleSection = (
    sectionKey:
      | 'appearance'
      | 'privateLlm'
      | 'publicLlm'
      | 'voice'
      | 'referenceApi'
      | 'storage',
  ) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const areAllExpanded = Object.values(expandedSections).every(Boolean);
  const toggleAllSections = () => {
    const nextValue = !areAllExpanded;
    setExpandedSections({
      appearance: nextValue,
      privateLlm: nextValue,
      publicLlm: nextValue,
      voice: nextValue,
      referenceApi: nextValue,
      storage: nextValue,
    });
  };

  const updateDraft = (updater: WorkbenchSettings | ((prev: WorkbenchSettings) => WorkbenchSettings)) => {
    setDraft((prev) => (typeof updater === 'function' ? updater(prev) : updater));
    setHasUnsavedChanges(true);
    setApplyFeedback(null);
  };

  useEffect(() => {
    setDraft(settings);
    setRefPortInput(String(settings.referenceContextApi.port || 3000));
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

  const handleRefreshPrivateModel = async () => {
    setOllamaRefreshing(true);
    setOllamaError(null);
    setOllamaSuccessNote(null);

    try {
      const response = await fetch('/api/ollama/unload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: draft.privateLlm.ollamaBaseUrl,
          model: draft.privateLlm.selectedModel,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'Failed to refresh the Ollama model.');
      }
      const message =
        payload.message ||
        'Ollama model refreshed and unloaded; it will reload with a brand new context on your next prompt.';
      setOllamaSuccessNote(message);
      onContextLog?.('success', message);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to refresh the Ollama model.';
      setOllamaError(message);
      onContextLog?.('error', `Ollama model refresh failed: ${message}`);
    } finally {
      setOllamaRefreshing(false);
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
              thinkingLevel: draft.publicLlm.adapters[adapterId].thinkingLevel,
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

  const handleUnloadOllamaMemory = async () => {
    setMaintenanceLoading(true);
    setMaintenanceFeedback('Unloading Private Ollama model memory...');

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
      const summary = payload.message || 'Unloaded Ollama model memory.';
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
    <section
      className="w-full flex-1 h-full min-h-0 flex flex-col p-4 sm:p-6"
      aria-labelledby="settings-page-title"
    >
      <div className="w-full max-w-5xl h-full min-h-0 mx-auto flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <header className="shrink-0 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/80 dark:bg-slate-950/60">
          <div>
            <h1
              id="settings-page-title"
              className="font-display text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100"
            >
              What&apos;s up Settings
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Themes, Windows account profile, Ollama, Public adapters &amp; local storage
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleAllSections}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {areAllExpanded ? 'Collapse All' : 'Expand All'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Return to What's up"
              title="Back to What's up"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto fluent-scroll p-5 space-y-4">
          {/* Section 1: Color Themes & Account Profile */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('appearance')}
              aria-expanded={expandedSections.appearance}
              className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left bg-slate-50/75 dark:bg-slate-950/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="min-w-0">
                <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Palette className="w-4 h-4 shrink-0" style={{ color: 'var(--pa-accent)' }} />
                  <span>Color Themes &amp; Account Profile</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  Theme palette, conversation font, and Windows account display name
                </p>
              </div>
              {expandedSections.appearance ? (
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              )}
            </button>

            {expandedSections.appearance && (
              <div className="p-5 border-t border-slate-200/80 dark:border-slate-800 space-y-4">
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
            )}
          </section>

        {/* Section 2: Private LLM (Windows Ollama) */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('privateLlm')}
            aria-expanded={expandedSections.privateLlm}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left bg-slate-50/75 dark:bg-slate-950/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-colors"
          >
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Private LLM (Windows Ollama)</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Discover and connect to models deployed locally through Ollama on Windows
              </p>
            </div>
            {expandedSections.privateLlm ? (
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            )}
          </button>

          {expandedSections.privateLlm && (
          <div className="border-t border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
            <div className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap bg-slate-50/40 dark:bg-slate-950/30">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Manage local Ollama connection, model discovery, and context refresh.
              </span>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={() => void handleRefreshPrivateModel()}
                  disabled={ollamaRefreshing || !draft.privateLlm.selectedModel.trim()}
                  title="Unload running Ollama model memory (keep_alive: 0) to get a brand new context on the next prompt"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200 text-xs font-medium hover:bg-sky-100 dark:hover:bg-sky-900/60 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${ollamaRefreshing ? 'animate-spin' : ''}`} />
                  <span>{ollamaRefreshing ? 'Refreshing Model...' : 'Refresh Model'}</span>
                </button>
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
            </div>
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
          )}
        </section>

        {/* Section 3: Public LLM Adapters */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('publicLlm')}
            aria-expanded={expandedSections.publicLlm}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left bg-slate-50/75 dark:bg-slate-950/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-colors"
          >
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Server className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>Public LLM Adapters</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Configure active cloud provider adapter (Gemini, Claude, or Fable)
              </p>
            </div>
            {expandedSections.publicLlm ? (
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            )}
          </button>

          {expandedSections.publicLlm && (
          <div className="p-5 border-t border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Separate provider adapters normalize outgoing prompts and incoming responses for Gemini, Claude, and Fable.
              </p>

              <div className="inline-flex items-center p-1 rounded-lg bg-slate-200/75 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
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
                      {adapterId === 'fable' ? (
                        <>
                          <input
                            type="text"
                            list="fable-model-presets"
                            value={cfg.model}
                            onChange={(e) => updatePublicAdapter('fable', { model: e.target.value })}
                            placeholder="claude-fable-5-1"
                            className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                          />
                          <datalist id="fable-model-presets">
                            {(summary?.availableModels || [
                              'claude-fable-5-1',
                              'claude-fable-5-2',
                              'claude-sonnet-5-5',
                              'claude-opus-5-5',
                              'claude-sonnet-4-20250514',
                            ]).map((modelOpt) => (
                              <option key={modelOpt} value={modelOpt} />
                            ))}
                          </datalist>
                        </>
                      ) : (
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
                      )}
                      {adapterId === 'fable' && (
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                          Recommended model: <code className="font-mono">claude-fable-5-1</code> (uses Anthropic adaptive thinking + effort config).
                        </p>
                      )}
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
                          placeholder={
                            adapterId === 'fable'
                              ? 'https://api.anthropic.com/v1/messages'
                              : undefined
                          }
                          onChange={(e) =>
                            updatePublicAdapter(adapterId, { endpointUrl: e.target.value })
                          }
                          className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                        {adapterId === 'fable' && (
                          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                            Uses <code className="font-mono">https://api.anthropic.com/v1/messages</code> with <code className="font-mono">x-api-key</code> and <code className="font-mono">anthropic-version: 2023-06-01</code>. Configure <code className="font-mono">ANTHROPIC_API_KEY</code> (or <code className="font-mono">CLAUDE_API_KEY</code> / <code className="font-mono">FABLE_API_KEY</code>) in server secrets.
                          </p>
                        )}
                      </div>
                    )}

                    {adapterId === 'fable' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Adaptive Thinking Effort
                        </label>
                        <select
                          value={cfg.thinkingLevel || 'HIGH'}
                          onChange={(e) =>
                            updatePublicAdapter('fable', {
                              thinkingLevel: e.target.value as 'LOW' | 'MEDIUM' | 'HIGH',
                            })
                          }
                          className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        >
                          <option value="LOW">Low (Fastest)</option>
                          <option value="MEDIUM">Medium (Balanced)</option>
                          <option value="HIGH">High (Default Adaptive)</option>
                        </select>
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
          </div>
          )}
        </section>

        {/* Section 4: Voice & Windows Native Speaker */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('voice')}
            aria-expanded={expandedSections.voice}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left bg-slate-50/75 dark:bg-slate-950/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-colors"
          >
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>Voice &amp; Windows Native Speaker</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Speech synthesis voice, playback rules, and reply notification alerts
              </p>
            </div>
            {expandedSections.voice ? (
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            )}
          </button>

          {expandedSections.voice && (
          <div className="p-5 border-t border-slate-200/80 dark:border-slate-800 space-y-5">
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
                    "Windows native speaker playback is ready for What's up.",
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
                        "🤙 What's up · Notification Test",
                        'Reply chime and notifications are ready.',
                      );
                    setNotifyFeedback(
                      sent
                        ? "🤙 What's up · Played reply chime and sent desktop notification."
                        : "🤙 What's up · Played reply chime (in-app notifications are active).",
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
          )}
        </section>

        {/* Section 5: Reference Context REST API */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('referenceApi')}
            aria-expanded={expandedSections.referenceApi}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left bg-slate-50/75 dark:bg-slate-950/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-colors"
          >
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Globe className="w-4 h-4 shrink-0" style={{ color: 'var(--pa-accent)' }} />
                <span>Reference Context REST API</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Configure hostname, port, endpoint path, and query template for automatic Reference Context fetch
              </p>
            </div>
            {expandedSections.referenceApi ? (
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            )}
          </button>

          {expandedSections.referenceApi && (
            <div className="p-5 border-t border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="ref-api-host"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Hostname
                  </label>
                  <input
                    id="ref-api-host"
                    type="text"
                    value={draft.referenceContextApi.hostname}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        referenceContextApi: {
                          ...prev.referenceContextApi,
                          hostname: e.target.value,
                        },
                      }))
                    }
                    placeholder="localhost"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ref-api-port"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Port
                  </label>
                  <input
                    id="ref-api-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={refPortInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setRefPortInput(raw);
                      const parsed = Number(raw);
                      if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535) {
                        updateDraft((prev) => ({
                          ...prev,
                          referenceContextApi: {
                            ...prev.referenceContextApi,
                            port: Math.round(parsed),
                          },
                        }));
                      }
                    }}
                    onBlur={() => {
                      const parsed = Number(refPortInput);
                      const valid =
                        refPortInput.trim() !== '' && Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535
                          ? Math.round(parsed)
                          : draft.referenceContextApi.port || 3000;
                      setRefPortInput(String(valid));
                      if (valid !== draft.referenceContextApi.port) {
                        updateDraft((prev) => ({
                          ...prev,
                          referenceContextApi: {
                            ...prev.referenceContextApi,
                            port: valid,
                          },
                        }));
                      }
                    }}
                    placeholder="3000"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ref-api-path"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Endpoint Path
                  </label>
                  <input
                    id="ref-api-path"
                    type="text"
                    value={draft.referenceContextApi.path}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        referenceContextApi: {
                          ...prev.referenceContextApi,
                          path: e.target.value,
                        },
                      }))
                    }
                    placeholder="/api/content"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ref-api-query"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Query Parameter Template
                  </label>
                  <input
                    id="ref-api-query"
                    type="text"
                    value={draft.referenceContextApi.queryTemplate}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        referenceContextApi: {
                          ...prev.referenceContextApi,
                          queryTemplate: e.target.value,
                        },
                      }))
                    }
                    placeholder="date={month}/{year}&variant=compact"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-800/70">
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Resolved GET Request Preview
                  </div>
                  <div className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                    {buildReferenceContextUrl(
                      draft.referenceContextApi,
                      draft.contextCache.activeMonth ?? 4,
                      draft.contextCache.activeYear ?? 2026,
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={refApiTesting}
                  onClick={async () => {
                    setRefApiTesting(true);
                    setRefApiTestFeedback(null);
                    try {
                      const result = await fetchReferenceContextFromApi({
                        month: draft.contextCache.activeMonth ?? 4,
                        year: draft.contextCache.activeYear ?? 2026,
                        apiConfig: draft.referenceContextApi,
                      });
                      setRefApiTestFeedback({
                        ok: true,
                        message: `Endpoint reachable (${result.text.length.toLocaleString()} chars returned${result.via === 'browser' ? ' via direct browser fetch' : ''}).`,
                      });
                    } catch (err) {
                      setRefApiTestFeedback({
                        ok: false,
                        message:
                          err instanceof Error
                            ? err.message
                            : 'Unable to reach Reference Context endpoint.',
                      });
                    } finally {
                      setRefApiTesting(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refApiTesting ? 'animate-spin' : ''}`} />
                  <span>{refApiTesting ? 'Testing…' : 'Test Endpoint'}</span>
                </button>
              </div>

              {refApiTestFeedback && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    refApiTestFeedback.ok
                      ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                      : 'border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
                  }`}
                >
                  {refApiTestFeedback.message}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Section 6: Local Configuration File & Report Storage */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('storage')}
            aria-expanded={expandedSections.storage}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left bg-slate-50/75 dark:bg-slate-950/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-colors"
          >
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" />
                <span>Report Storage &amp; Local Configuration</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Local HTML reports storage directory, workbench.config.json path, Ollama memory relief, and reset defaults
              </p>
            </div>
            {expandedSections.storage ? (
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            )}
          </button>

          {expandedSections.storage && (
          <div className="border-t border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <label
                    htmlFor="reports-storage-dir"
                    className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--pa-accent)' }} />
                    <span>HTML Reports Storage Folder (Local File System)</span>
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Generated HTML reports are saved directly into this folder and loaded as-is when opened.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {configFileInfo.defaultReportsDir && (
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft((prev) => ({
                          ...prev,
                          reportsDir: configFileInfo.defaultReportsDir || '',
                        }))
                      }
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                      Use Default Folder
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={reportsRescanning}
                    onClick={async () => {
                      setReportsRescanning(true);
                      setReportsFolderStatus(null);
                      try {
                        const target = (draft.reportsDir || '').trim();
                        const query = target ? `?dir=${encodeURIComponent(target)}` : '';
                        const res = await fetch(`/api/reports${query}`);
                        const data = (await res.json()) as {
                          reportsDir?: string;
                          reports?: unknown[];
                          error?: string;
                        };
                        if (!res.ok || data.error) {
                          throw new Error(data.error || `HTTP ${res.status}`);
                        }
                        const count = Array.isArray(data.reports) ? data.reports.length : 0;
                        setReportsFolderStatus(
                          `Verified folder: ${data.reportsDir || target} (${count} report${count === 1 ? '' : 's'} found on disk)`,
                        );
                      } catch (err) {
                        setReportsFolderStatus(
                          err instanceof Error
                            ? err.message
                            : 'Unable to access reports storage folder.',
                        );
                      } finally {
                        setReportsRescanning(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reportsRescanning ? 'animate-spin' : ''}`} />
                    <span>Verify Folder</span>
                  </button>
                </div>
              </div>

              <input
                id="reports-storage-dir"
                type="text"
                value={draft.reportsDir ?? ''}
                onChange={(e) =>
                  updateDraft((prev) => ({
                    ...prev,
                    reportsDir: e.target.value,
                  }))
                }
                placeholder={
                  configFileInfo.defaultReportsDir ||
                  (configFileInfo.platform === 'win32'
                    ? 'C:\\Users\\<User>\\AppData\\Local\\FluentAssistantWorkbench\\reports'
                    : './.workbench-local/reports')
                }
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />

              <div className="text-[11px] text-slate-500 dark:text-slate-400 break-all">
                Active folder:{' '}
                <code className="font-mono text-slate-700 dark:text-slate-300">
                  {draft.reportsDir?.trim() ||
                    configFileInfo.resolvedReportsDir ||
                    configFileInfo.defaultReportsDir ||
                    'Default reports directory'}
                </code>
              </div>

              {reportsFolderStatus && (
                <div className="text-xs text-emerald-700 dark:text-emerald-400 break-all">
                  {reportsFolderStatus}
                </div>
              )}
            </div>

            <div className="p-5 space-y-2">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Active application configurations are stored automatically in <code className="font-mono">workbench.config.json</code> ({configFileInfo.platform === 'win32' ? 'Windows LocalAppData' : 'Local Host Storage'})
              </div>
              <div className="font-mono text-xs text-slate-900 dark:text-slate-100 break-all">
                {configFileInfo.filePath}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {configFileInfo.platform === 'win32'
                  ? 'Persisted and reloaded automatically from %LOCALAPPDATA%\\FluentAssistantWorkbench\\workbench.config.json'
                  : 'Persisted and reloaded automatically from disk whenever settings change'}
                {configFileInfo.lastSavedAt
                  ? ` · Synced at ${new Date(configFileInfo.lastSavedAt).toLocaleTimeString()}`
                  : ''}
              </div>
              {configFileInfo.syncError && (
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  {configFileInfo.syncError}
                </div>
              )}
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Private LLM Memory Relief
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Unload active Ollama model weights from RAM/VRAM (<code className="font-mono">keep_alive: 0</code>) so your machine returns to normal idle memory.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleUnloadOllamaMemory()}
                  disabled={maintenanceLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${maintenanceLoading ? 'animate-spin' : ''}`} />
                  <span>Unload Ollama Memory</span>
                </button>
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
          )}
        </section>
      </div>

        {/* Sticky Modal Footer: Back Arrow, Apply, Save */}
        <footer className="shrink-0 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {applyFeedback ? (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                {applyFeedback}
              </span>
            ) : hasUnsavedChanges ? (
              <span>Pending changes — click Apply or Save</span>
            ) : (
              <span>All settings saved</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to What's up"
              title="Back to What's up"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] transition-colors"
            >
              Save
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}

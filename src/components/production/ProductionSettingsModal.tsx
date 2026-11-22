import {
  Activity,
  CheckCircle2,
  FolderCheck,
  FolderOpen,
  Globe,
  Loader2,
  Moon,
  RotateCcw,
  Sun,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AdapterHealthResult, WorkbenchSettings } from '../../types/workbench';
import {
  buildReferenceContextUrl,
  fetchReferenceContextFromApi,
} from '../../utils/referenceContextFetch';

interface ProductionSettingsModalProps {
  settings: WorkbenchSettings;
  effectiveReportsDir: string;
  defaultReportsDir: string;
  onUpdateSettings: (next: WorkbenchSettings, reloadReportsDir?: string | null) => void;
  onClose: () => void;
}

export function ProductionSettingsModal({
  settings,
  effectiveReportsDir,
  defaultReportsDir,
  onUpdateSettings,
  onClose,
}: ProductionSettingsModalProps) {
  const [folderDraft, setFolderDraft] = useState(
    settings.prodReportsDir?.trim() || effectiveReportsDir || defaultReportsDir,
  );
  const [folderStatus, setFolderStatus] = useState<{
    kind: 'idle' | 'ok' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });
  const [verifyingFolder, setVerifyingFolder] = useState(false);

  const [testingAdapterId, setTestingAdapterId] = useState<'gemini' | 'fable' | null>(null);
  const [healthByAdapter, setHealthByAdapter] = useState<
    Partial<Record<'gemini' | 'fable', AdapterHealthResult>>
  >({});

  const [portDraft, setPortDraft] = useState(
    String(settings.referenceContextApi.port || 3000),
  );
  const [portStatus, setPortStatus] = useState<{
    kind: 'idle' | 'ok' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });
  const [testingRefPort, setTestingRefPort] = useState(false);

  useEffect(() => {
    setPortDraft(String(settings.referenceContextApi.port || 3000));
  }, [settings.referenceContextApi.port]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const activeProdTheme: 'light' | 'dark' =
    settings.prodTheme === 'light' ? 'light' : 'dark';

  const handleThemeChange = (nextTheme: 'light' | 'dark') => {
    if (nextTheme === activeProdTheme) return;
    onUpdateSettings({
      ...settings,
      prodTheme: nextTheme,
    });
  };

  const handleVerifyFolder = async () => {
    const candidate = folderDraft.trim();
    setVerifyingFolder(true);
    setFolderStatus({ kind: 'idle', message: '' });
    try {
      const q = candidate
        ? `?mode=production&dir=${encodeURIComponent(candidate)}`
        : '?mode=production';
      const res = await fetch(`/api/reports${q}`);
      const data = (await res.json()) as {
        displayReportsDir?: string;
        reports?: unknown[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const count = Array.isArray(data.reports) ? data.reports.length : 0;
      setFolderStatus({
        kind: 'ok',
        message: `Verified: ${data.displayReportsDir || candidate || defaultReportsDir} (${count} report${count === 1 ? '' : 's'})`,
      });
    } catch (err) {
      setFolderStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unable to access folder.',
      });
    } finally {
      setVerifyingFolder(false);
    }
  };

  const handleApplyFolder = () => {
    const trimmed = folderDraft.trim();
    const isDefault =
      !trimmed || trimmed.replace(/\\/g, '/') === defaultReportsDir.replace(/\\/g, '/');
    const nextValue = isDefault ? '' : trimmed;
    onUpdateSettings(
      {
        ...settings,
        prodReportsDir: nextValue,
      },
      nextValue || null,
    );
    setFolderStatus({
      kind: 'ok',
      message: `Reports folder set to ${isDefault ? defaultReportsDir : trimmed}`,
    });
  };

  const handleUseDefaultFolder = () => {
    setFolderDraft(defaultReportsDir);
    onUpdateSettings(
      {
        ...settings,
        prodReportsDir: '',
      },
      null,
    );
    setFolderStatus({
      kind: 'ok',
      message: `Reset to default folder: ${defaultReportsDir}`,
    });
  };

  const handleTestAdapter = async (adapterId: 'gemini' | 'fable') => {
    setTestingAdapterId(adapterId);
    try {
      const cfg = settings.publicLlm.adapters[adapterId];
      const res = await fetch('/api/adapters/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adapterId,
          options: {
            model: cfg.model,
            endpointUrl: cfg.endpointUrl,
            thinkingLevel: cfg.thinkingLevel,
          },
        }),
      });
      const data = (await res.json()) as AdapterHealthResult;
      if (data && data.adapterId) {
        setHealthByAdapter((prev) => ({ ...prev, [adapterId]: data }));
      }
    } catch (err) {
      setHealthByAdapter((prev) => ({
        ...prev,
        [adapterId]: {
          adapterId,
          scope: 'public',
          reachable: false,
          configured: false,
          statusLabel: 'Error',
          detail: err instanceof Error ? err.message : 'Adapter test failed.',
          latencyMs: 0,
          checkedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setTestingAdapterId(null);
    }
  };

  const parseValidPort = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    const rounded = Math.round(num);
    if (rounded < 1 || rounded > 65535) return null;
    return rounded;
  };

  const previewPort =
    parseValidPort(portDraft) ?? settings.referenceContextApi.port ?? 3000;
  const previewApiConfig = {
    ...settings.referenceContextApi,
    port: previewPort,
  };
  const resolvedRefUrlPreview = buildReferenceContextUrl(
    previewApiConfig,
    settings.contextCache.activeMonth ?? new Date().getMonth() + 1,
    settings.contextCache.activeYear ?? new Date().getFullYear(),
    'career',
  );

  const handleApplyPort = () => {
    const validPort = parseValidPort(portDraft);
    if (validPort === null) {
      setPortStatus({
        kind: 'error',
        message: 'Enter a valid port number between 1 and 65535.',
      });
      return;
    }
    setPortDraft(String(validPort));
    onUpdateSettings({
      ...settings,
      referenceContextApi: {
        ...settings.referenceContextApi,
        port: validPort,
      },
    });
    setPortStatus({
      kind: 'ok',
      message: `Reference URL port set to ${validPort}.`,
    });
  };

  const handleTestRefPort = async () => {
    const validPort = parseValidPort(portDraft);
    if (validPort === null) {
      setPortStatus({
        kind: 'error',
        message: 'Enter a valid port number between 1 and 65535 before testing.',
      });
      return;
    }
    setTestingRefPort(true);
    setPortStatus({ kind: 'idle', message: '' });
    try {
      const result = await fetchReferenceContextFromApi({
        month: settings.contextCache.activeMonth ?? new Date().getMonth() + 1,
        year: settings.contextCache.activeYear ?? new Date().getFullYear(),
        domain: 'career',
        apiConfig: {
          ...settings.referenceContextApi,
          port: validPort,
        },
      });
      setPortStatus({
        kind: 'ok',
        message: `Reachable on port ${validPort} (${result.text.length.toLocaleString()} chars returned).`,
      });
    } catch (err) {
      setPortStatus({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : `Unable to reach Reference URL on port ${validPort}.`,
      });
    } finally {
      setTestingRefPort(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/35 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prod-settings-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fluent-3d-popup w-full max-w-lg rounded-[28px] p-5 sm:p-6 space-y-5 max-h-[88vh] overflow-y-auto fluent-scroll"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="prod-settings-title"
            className="font-display text-base font-bold text-slate-900 tracking-tight"
          >
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white/75 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Reports Folder Location */}
        <section className="rounded-2xl border border-white/80 bg-white/55 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-800">
            <FolderOpen className="w-4 h-4 text-sky-600 shrink-0" />
            <span>Reports Folder Location</span>
          </div>

          <input
            type="text"
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            placeholder={defaultReportsDir}
            aria-label="Report folder location"
            className="w-full rounded-xl border border-sky-200/90 bg-white/80 px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleApplyFolder}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
            >
              <FolderCheck className="w-3.5 h-3.5" />
              <span>Save Folder</span>
            </button>
            <button
              type="button"
              onClick={() => void handleVerifyFolder()}
              disabled={verifyingFolder}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300/80 bg-white/75 hover:bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors cursor-pointer disabled:opacity-60"
            >
              {verifyingFolder ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-sky-600" />
              )}
              <span>Verify</span>
            </button>
            <button
              type="button"
              onClick={handleUseDefaultFolder}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300/80 bg-white/75 hover:bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Use Default</span>
            </button>
          </div>

          <p className="text-[11px] font-mono text-slate-600 break-all">
            Active: {effectiveReportsDir}
          </p>

          {folderStatus.message && (
            <p
              className={`text-xs font-medium ${
                folderStatus.kind === 'error' ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {folderStatus.message}
            </p>
          )}
        </section>

        {/* 2. Theme: Dark or Light */}
        <section className="rounded-2xl border border-white/80 bg-white/55 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-800">
              Theme
            </span>
            <div
              role="group"
              aria-label="Production theme"
              className="inline-flex items-center p-1 rounded-xl border border-slate-200/90 bg-white/75"
            >
              <button
                type="button"
                aria-pressed={activeProdTheme === 'light'}
                onClick={() => handleThemeChange('light')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  activeProdTheme === 'light'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>
              <button
                type="button"
                aria-pressed={activeProdTheme === 'dark'}
                onClick={() => handleThemeChange('dark')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  activeProdTheme === 'dark'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </button>
            </div>
          </div>
        </section>

        {/* 3. Test Gemini & Fable Adapters */}
        <section className="rounded-2xl border border-white/80 bg-white/55 p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-sky-800">
            Test Gemini &amp; Fable Adapters
          </div>

          <div className="space-y-2.5">
            {(['gemini', 'fable'] as const).map((adapterId) => {
              const label = adapterId === 'gemini' ? 'Gemini' : 'Fable';
              const model = settings.publicLlm.adapters[adapterId].model;
              const health = healthByAdapter[adapterId];
              const isTesting = testingAdapterId === adapterId;

              return (
                <div
                  key={adapterId}
                  className="rounded-xl border border-white/85 bg-white/75 px-3.5 py-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900">{label}</div>
                      <div className="text-[11px] font-mono text-slate-600 truncate">
                        {model}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleTestAdapter(adapterId)}
                      disabled={testingAdapterId !== null}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors shrink-0 cursor-pointer"
                    >
                      {isTesting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Activity className="w-3.5 h-3.5" />
                      )}
                      <span>{isTesting ? 'Testing…' : `Test ${label}`}</span>
                    </button>
                  </div>

                  {health && (
                    <div
                      className={`flex items-start gap-1.5 text-[11px] leading-snug ${
                        health.reachable && health.configured
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {health.reachable && health.configured ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      )}
                      <span>
                        <strong className="font-semibold">{health.statusLabel}:</strong>{' '}
                        {health.detail}
                        {health.latencyMs > 0 ? ` (${health.latencyMs}ms)` : ''}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        {/* 4. Reference URL Port */}
        <section className="rounded-2xl border border-white/80 bg-white/55 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-800">
            <Globe className="w-4 h-4 text-sky-600 shrink-0" />
            <span>Reference URL Port</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              max={65535}
              value={portDraft}
              onChange={(e) => {
                setPortDraft(e.target.value);
                if (portStatus.kind !== 'idle') {
                  setPortStatus({ kind: 'idle', message: '' });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyPort();
                }
              }}
              placeholder="3000"
              aria-label="Reference URL Port"
              className="w-32 rounded-xl border border-sky-200/90 bg-white/80 px-3 py-2 text-xs font-mono tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={handleApplyPort}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 px-3 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
            >
              <span>Save Port</span>
            </button>
            <button
              type="button"
              onClick={() => void handleTestRefPort()}
              disabled={testingRefPort}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300/80 bg-white/75 hover:bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer disabled:opacity-60"
            >
              {testingRefPort ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-sky-600" />
              )}
              <span>{testingRefPort ? 'Testing…' : 'Test URL'}</span>
            </button>
          </div>

          <p className="text-[11px] font-mono text-slate-600 break-all">
            URL: {resolvedRefUrlPreview}
          </p>

          {portStatus.message && (
            <p
              className={`text-xs font-medium ${
                portStatus.kind === 'error' ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {portStatus.message}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

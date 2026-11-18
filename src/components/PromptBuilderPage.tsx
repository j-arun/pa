import {
  Brain,
  Check,
  HeartPulse,
  Landmark,
  LoaderCircle,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import type { PromptDomain, PromptStyle, PromptTemplates } from '../types/workbench';
import { DEFAULT_PROMPT_TEMPLATES } from '../utils/promptTemplates';

const DOMAIN_OPTIONS: Array<{
  id: PromptDomain;
  label: string;
  description: string;
  icon: typeof Brain;
}> = [
  {
    id: 'astrology',
    label: 'Career & Profession',
    description: 'Astrological readings, charts, and timing',
    icon: Sparkles,
  },
  {
    id: 'health',
    label: 'Health & Vitality',
    description: 'Health information and wellness questions',
    icon: HeartPulse,
  },
  {
    id: 'finance',
    label: 'Family & Domestic Life',
    description: 'Financial planning and analysis',
    icon: Landmark,
  },
  {
    id: 'general',
    label: 'Love & Relationships',
    description: 'Everyday questions and tasks',
    icon: Brain,
  },
];

const STYLE_OPTIONS: Array<{ id: PromptStyle; label: string; description: string }> = [
  {
    id: 'formal',
    label: 'Formal',
    description: 'Straightforward, neutral instructions',
  },
  {
    id: 'classic',
    label: 'Classic',
    description: 'Context-rich instructions with structured output',
  },
];

interface PromptBuilderPageProps {
  activeDomain: PromptDomain;
  templates: PromptTemplates;
  settingsFilePath: string;
  saveError?: string;
  onApplySettings: () => Promise<boolean>;
  onSelectDomain: (domain: PromptDomain) => void;
  onChangeTemplates: (templates: PromptTemplates) => void;
}

export function PromptBuilderPage({
  activeDomain,
  templates,
  settingsFilePath,
  saveError,
  onApplySettings,
  onSelectDomain,
  onChangeTemplates,
}: PromptBuilderPageProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const domain = DOMAIN_OPTIONS.find((option) => option.id === activeDomain) ?? DOMAIN_OPTIONS[0];

  const handleApplySettings = async () => {
    setIsSaving(true);
    setSaveNotice(null);
    try {
      const saved = await onApplySettings();
      setSaveNotice(
        saved
          ? 'Prompt Builder settings saved to the application file.'
          : 'Save failed. Check the error details below.',
      );
    } catch (error) {
      setSaveNotice(
        error instanceof Error ? `Save failed: ${error.message}` : 'Save failed unexpectedly.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const updateTemplate = (style: PromptStyle, value: string) => {
    onChangeTemplates({
      ...templates,
      [activeDomain]: {
        ...templates[activeDomain],
        [style]: value,
      },
    });
  };

  return (
    <main className="relative flex-1 min-w-0 overflow-y-auto fluent-scroll px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
              Session prompt setup
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Prompt Builder
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Choose the active domain for this session and maintain the Formal and Classic
              templates used by the chat panel. Changes are saved to the application settings file.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Active domain: {domain.label}
            </div>
            <button
              type="button"
              onClick={() => void handleApplySettings()}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--pa-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--pa-accent-hover)] disabled:cursor-wait disabled:opacity-65"
            >
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : saveNotice?.startsWith('Prompt Builder settings saved') ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSaving ? 'Saving…' : 'Save / Apply'}
            </button>
          </div>
        </header>

        {saveNotice && (
          <p
            role={saveNotice.startsWith('Save failed') || saveError ? 'alert' : 'status'}
            className={`text-sm ${
              saveNotice.startsWith('Save failed') || saveError
                ? 'text-red-700 dark:text-red-300'
                : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {saveNotice}
          </p>
        )}

        <p className="break-all text-xs text-slate-500 dark:text-slate-400">
          Settings file: {settingsFilePath}
        </p>
        {saveError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
          >
            Settings could not be saved to the application file: {saveError}
          </div>
        )}

        <div
          role="group"
          aria-label="Active prompt domain"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {DOMAIN_OPTIONS.map(({ id, label, description, icon: Icon }) => {
            const isActive = id === activeDomain;
            return (
              <label
                key={id}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  isActive
                    ? 'border-sky-400 bg-sky-50/90 shadow-sm dark:border-sky-600 dark:bg-sky-950/45'
                    : 'border-slate-200/80 bg-white/70 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/50 dark:hover:bg-slate-900'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => {
                    if (event.currentTarget.checked) onSelectDomain(id);
                  }}
                  aria-label={`Set ${label} as the active prompt domain`}
                  className="mt-1 h-4 w-4 shrink-0 accent-sky-600"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                      isActive
                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/80 dark:text-sky-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="mt-3 block text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <section
          aria-label={`${domain.label} prompt templates`}
          className="space-y-4 rounded-3xl border border-white/80 bg-white/65 p-4 shadow-sm backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/55 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                {domain.label} templates
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Use <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">{'{{prompt}}'}</code>{' '}
                where the chat draft should be inserted. Changes save automatically to the settings file.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {STYLE_OPTIONS.map(({ id, label, description }) => (
              <div
                key={id}
                className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/75 p-4 dark:border-slate-700/80 dark:bg-slate-950/35"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {label}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateTemplate(id, DEFAULT_PROMPT_TEMPLATES[activeDomain][id])
                    }
                    aria-label={`Restore default ${label} ${domain.label} template`}
                    title="Restore default template"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea
                  aria-label={`${label} ${domain.label} prompt template`}
                  value={templates[activeDomain][id]}
                  onChange={(event) => updateTemplate(id, event.target.value)}
                  rows={9}
                  spellCheck
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white/85 px-3 py-2.5 text-sm leading-relaxed text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:border-sky-600"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

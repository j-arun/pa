import fs from 'fs';
import path from 'path';
import type { PromptDomain, PromptTemplates } from '../src/types/workbench.ts';
import {
  DEFAULT_PROMPT_TEMPLATES,
  PROMPT_DOMAINS,
} from '../src/utils/promptTemplates.ts';

export const DOMAIN_PROMPT_FILES: Record<
  PromptDomain,
  { fileName: string; label: string }
> = {
  astrology: { fileName: 'career.json', label: 'Career' },
  health: { fileName: 'health.json', label: 'Health' },
  finance: { fileName: 'family.json', label: 'Family' },
  general: { fileName: 'love.json', label: 'Love' },
};

export function resolvePromptsDir(): string {
  return path.resolve(process.cwd(), 'prompts');
}

export function getDomainPromptFilePaths(): Record<PromptDomain, string> {
  const dir = resolvePromptsDir();
  return {
    astrology: path.join(dir, DOMAIN_PROMPT_FILES.astrology.fileName),
    health: path.join(dir, DOMAIN_PROMPT_FILES.health.fileName),
    finance: path.join(dir, DOMAIN_PROMPT_FILES.finance.fileName),
    general: path.join(dir, DOMAIN_PROMPT_FILES.general.fileName),
  };
}

interface StoredDomainPromptFile {
  domain?: string;
  label?: string;
  formal?: unknown;
  classic?: unknown;
}

export function readDomainPromptsFromFiles(
  fallback: PromptTemplates = DEFAULT_PROMPT_TEMPLATES,
): {
  templates: PromptTemplates;
  filePaths: Record<PromptDomain, string>;
  hasAnyFile: boolean;
} {
  const dir = resolvePromptsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePaths = getDomainPromptFilePaths();
  let hasAnyFile = false;
  const entries = PROMPT_DOMAINS.map((domain) => {
    const filePath = filePaths[domain];
    const meta = DOMAIN_PROMPT_FILES[domain];
    const base = fallback[domain] ?? DEFAULT_PROMPT_TEMPLATES[domain];

    if (!fs.existsSync(filePath)) {
      const initialPayload = {
        domain,
        label: meta.label,
        formal: base.formal,
        classic: base.classic,
      };
      fs.writeFileSync(
        filePath,
        `${JSON.stringify(initialPayload, null, 2)}\n`,
        'utf-8',
      );
      return [domain, { formal: base.formal, classic: base.classic }] as const;
    }

    hasAnyFile = true;
    try {
      const parsed = JSON.parse(
        fs.readFileSync(filePath, 'utf-8'),
      ) as StoredDomainPromptFile;
      return [
        domain,
        {
          formal: typeof parsed.formal === 'string' ? parsed.formal : base.formal,
          classic: typeof parsed.classic === 'string' ? parsed.classic : base.classic,
        },
      ] as const;
    } catch {
      return [domain, { formal: base.formal, classic: base.classic }] as const;
    }
  });

  return {
    templates: Object.fromEntries(entries) as PromptTemplates,
    filePaths,
    hasAnyFile,
  };
}

export function writeDomainPromptsToFiles(
  templates: PromptTemplates,
): Record<PromptDomain, string> {
  const dir = resolvePromptsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePaths = getDomainPromptFilePaths();
  for (const domain of PROMPT_DOMAINS) {
    const filePath = filePaths[domain];
    const meta = DOMAIN_PROMPT_FILES[domain];
    const current = templates[domain] ?? DEFAULT_PROMPT_TEMPLATES[domain];
    const payload = {
      domain,
      label: meta.label,
      formal: current.formal,
      classic: current.classic,
    };
    fs.writeFileSync(
      filePath,
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf-8',
    );
  }

  return filePaths;
}

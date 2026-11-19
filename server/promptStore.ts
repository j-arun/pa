import fs from 'fs';
import path from 'path';
import type { PromptDomain, PromptTemplates } from '../src/types/workbench.ts';
import {
  DEFAULT_PROMPT_TEMPLATES,
  PROMPT_DOMAINS,
  hasCustomPromptTemplates,
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

function buildDomainPromptPayload(
  domain: PromptDomain,
  formal: string,
  classic: string,
) {
  const meta = DOMAIN_PROMPT_FILES[domain];
  return {
    domain: meta.label,
    formal,
    classic,
  };
}

export function readDomainPromptsFromFiles(
  fallback: PromptTemplates = DEFAULT_PROMPT_TEMPLATES,
): {
  templates: PromptTemplates;
  filePaths: Record<PromptDomain, string>;
  hasAnyFile: boolean;
  hasCustomTemplates: boolean;
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
    const defaults = DEFAULT_PROMPT_TEMPLATES[domain];
    const base = fallback[domain] ?? defaults;

    if (!fs.existsSync(filePath)) {
      const initialPayload = buildDomainPromptPayload(
        domain,
        base.formal,
        base.classic,
      );
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
      const diskFormal =
        typeof parsed.formal === 'string' ? parsed.formal : base.formal;
      const diskClassic =
        typeof parsed.classic === 'string' ? parsed.classic : base.classic;

      // Never let an untouched default prompt file overwrite customized config prompts
      const resolvedFormal =
        diskFormal === defaults.formal && base.formal !== defaults.formal
          ? base.formal
          : diskFormal;
      const resolvedClassic =
        diskClassic === defaults.classic && base.classic !== defaults.classic
          ? base.classic
          : diskClassic;

      const needsSchemaOrMigrationWrite =
        parsed.domain !== meta.label ||
        'label' in parsed ||
        resolvedFormal !== diskFormal ||
        resolvedClassic !== diskClassic;

      if (needsSchemaOrMigrationWrite) {
        const nextPayload = buildDomainPromptPayload(
          domain,
          resolvedFormal,
          resolvedClassic,
        );
        fs.writeFileSync(
          filePath,
          `${JSON.stringify(nextPayload, null, 2)}\n`,
          'utf-8',
        );
      }

      return [
        domain,
        {
          formal: resolvedFormal,
          classic: resolvedClassic,
        },
      ] as const;
    } catch {
      return [domain, { formal: base.formal, classic: base.classic }] as const;
    }
  });

  const templates = Object.fromEntries(entries) as PromptTemplates;
  return {
    templates,
    filePaths,
    hasAnyFile,
    hasCustomTemplates: hasCustomPromptTemplates(templates),
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
    const current = templates[domain] ?? DEFAULT_PROMPT_TEMPLATES[domain];
    const payload = buildDomainPromptPayload(
      domain,
      current.formal,
      current.classic,
    );
    fs.writeFileSync(
      filePath,
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf-8',
    );
  }

  return filePaths;
}

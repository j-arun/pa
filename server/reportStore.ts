import fs from 'fs';
import path from 'path';
import type {
  AnyAdapterId,
  ConversationScope,
  ConversationTurn,
  PromptDomain,
  RatedThreadRecord,
} from '../src/types/workbench.ts';
import { resolveReportsDir } from './configStore.ts';

const META_DIR_NAME = '.workbench-records';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const DOMAIN_FOLDER_NAMES: Record<PromptDomain, string> = {
  astrology: 'Career',
  family: 'Family',
  finance: 'Finance',
  general: 'Love',
  health: 'Health',
  litigation: 'Litigation',
};

const ADAPTER_FOLDER_NAMES: Record<AnyAdapterId, string> = {
  ollama: 'Local',
  fable: 'Fable',
  gemini: 'Gemini',
  claude: 'Sonnet',
  chatgpt: 'ChatGPT',
};

function sanitizeId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || `report-${Date.now()}`;
}

function sanitizeSlug(rawTitle: string): string {
  const slug = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'reference-report';
}

function sanitizeFolderSegment(rawSegment: string, fallback: string): string {
  const cleaned = rawSegment
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function ensureReportsFolders(dir?: string): { root: string; metaDir: string } {
  const root = resolveReportsDir(dir);
  const metaDir = path.join(root, META_DIR_NAME);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }
  return { root, metaDir };
}

function normalizeMonthName(rawMonth?: string, fallbackDateIso?: string): string {
  if (rawMonth && rawMonth.trim()) {
    const trimmed = rawMonth.trim().toLowerCase();
    const matched = MONTHS.find(
      (m) => m.toLowerCase() === trimmed || m.toLowerCase().startsWith(trimmed.slice(0, 3)),
    );
    if (matched) return matched;
    const numeric = Number(trimmed);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
      return MONTHS[numeric - 1];
    }
  }
  const parsed = fallbackDateIso ? new Date(fallbackDateIso) : new Date();
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return MONTHS[safeDate.getMonth()];
}

function normalizeYearNumber(rawYear?: number, fallbackDateIso?: string): number {
  if (typeof rawYear === 'number' && Number.isFinite(rawYear) && rawYear >= 1990 && rawYear <= 2090) {
    return Math.round(rawYear);
  }
  const parsed = fallbackDateIso ? new Date(fallbackDateIso) : new Date();
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return safeDate.getFullYear();
}

function normalizeDomain(rawDomain?: string): PromptDomain {
  if (
    rawDomain === 'astrology' ||
    rawDomain === 'family' ||
    rawDomain === 'finance' ||
    rawDomain === 'general' ||
    rawDomain === 'health' ||
    rawDomain === 'litigation'
  ) {
    return rawDomain;
  }
  return 'astrology';
}

function normalizeAdapterId(rawAdapter?: string, scope?: ConversationScope): AnyAdapterId {
  if (
    rawAdapter === 'ollama' ||
    rawAdapter === 'fable' ||
    rawAdapter === 'gemini' ||
    rawAdapter === 'claude' ||
    rawAdapter === 'chatgpt'
  ) {
    return rawAdapter;
  }
  return scope === 'private' ? 'ollama' : 'gemini';
}

export type ReportFolderLayout = 'dev' | 'production';

function getStructuredFolderSegments(
  record: RatedThreadRecord,
  layout: ReportFolderLayout = 'dev',
): {
  folderSegments: string[];
  yearMonthDir: string;
  domainDir: string;
  adapterDir: string;
  monthName: string;
  yearNum: number;
  domain: PromptDomain;
  adapterId: AnyAdapterId;
} {
  const qTurn = record.turns.find((t) => t.role === 'user');
  const assistantTurn = [...record.turns].reverse().find((t) => t.role === 'assistant');
  const fallbackIso = qTurn?.timestamp || record.ratedAt;
  const monthName = normalizeMonthName(qTurn?.threadMonth, fallbackIso);
  const yearNum = normalizeYearNumber(qTurn?.threadYear, fallbackIso);
  let domain = normalizeDomain(qTurn?.promptDomain);
  if (
    domain === 'finance' &&
    typeof record.relativePath === 'string' &&
    /(?:^|\/)family(?:\/|$)/i.test(record.relativePath)
  ) {
    domain = 'family';
  }
  const adapterId = normalizeAdapterId(
    assistantTurn?.adapterId ?? qTurn?.adapterId,
    qTurn?.scope ?? assistantTurn?.scope,
  );

  const yearMonthDir = sanitizeFolderSegment(`${yearNum} ${monthName}`, `${yearNum} ${monthName}`);
  const domainDir = DOMAIN_FOLDER_NAMES[domain];
  const adapterDir = ADAPTER_FOLDER_NAMES[adapterId];
  const folderSegments =
    layout === 'production'
      ? [String(yearNum), monthName, adapterDir]
      : [yearMonthDir, domainDir, adapterDir];

  return {
    folderSegments,
    yearMonthDir,
    domainDir,
    adapterDir,
    monthName,
    yearNum,
    domain,
    adapterId,
  };
}

function parseFolderMetadataFromRelativePath(relPosixPath: string): {
  threadMonth?: string;
  threadYear?: number;
  promptDomain?: PromptDomain;
  adapterId?: AnyAdapterId;
  scope?: ConversationScope;
} {
  const parts = relPosixPath.split('/').filter(Boolean);
  if (parts.length < 2) return {};
  const result: {
    threadMonth?: string;
    threadYear?: number;
    promptDomain?: PromptDomain;
    adapterId?: AnyAdapterId;
    scope?: ConversationScope;
  } = {};

  for (const seg of parts.slice(0, -1)) {
    const ymMatch = seg.match(/^(\d{4})\s+([A-Za-z]+)$/);
    if (ymMatch) {
      const y = Number(ymMatch[1]);
      if (y >= 1990 && y <= 2090) result.threadYear = y;
      result.threadMonth = normalizeMonthName(ymMatch[2]);
      continue;
    }

    if (/^\d{4}$/.test(seg.trim())) {
      const y = Number(seg.trim());
      if (y >= 1990 && y <= 2090) result.threadYear = y;
      continue;
    }

    const lower = seg.trim().toLowerCase();
    const matchedMonth = MONTHS.find(
      (m) => m.toLowerCase() === lower || m.toLowerCase().slice(0, 3) === lower,
    );
    if (matchedMonth) {
      result.threadMonth = matchedMonth;
      continue;
    }

    if (lower === 'career' || lower === 'astrology') {
      result.promptDomain = 'astrology';
    } else if (lower === 'family' || lower === 'home') {
      result.promptDomain = 'family';
    } else if (lower === 'finance' || lower === 'money' || lower === 'wealth') {
      result.promptDomain = 'finance';
    } else if (lower === 'love' || lower === 'general' || lower === 'relationship') {
      result.promptDomain = 'general';
    } else if (lower === 'health') {
      result.promptDomain = 'health';
    } else if (lower === 'litigation' || lower === 'legal' || lower === 'dispute' || lower === 'lawsuit') {
      result.promptDomain = 'litigation';
    } else if (lower === 'local' || lower === 'ollama') {
      result.adapterId = 'ollama';
      result.scope = 'private';
    } else if (lower === 'fable' || lower === 'fabul') {
      result.adapterId = 'fable';
      result.scope = 'public';
    } else if (lower === 'gemini') {
      result.adapterId = 'gemini';
      result.scope = 'public';
    } else if (lower === 'sonnet' || lower === 'claude' || lower === 'claude sonnet') {
      result.adapterId = 'claude';
      result.scope = 'public';
    } else if (lower === 'chatgpt' || lower === 'openai' || lower === 'gpt') {
      result.adapterId = 'chatgpt';
      result.scope = 'public';
    }
  }

  if (!result.promptDomain) {
    const fileLower = (parts[parts.length - 1] || '').toLowerCase();
    if (/^(career|astrology)[-_ ]/.test(fileLower)) result.promptDomain = 'astrology';
    else if (/^(family|home)[-_ ]/.test(fileLower)) result.promptDomain = 'family';
    else if (/^(finance|money)[-_ ]/.test(fileLower)) result.promptDomain = 'finance';
    else if (/^(love|general|relationship)[-_ ]/.test(fileLower)) result.promptDomain = 'general';
    else if (/^health[-_ ]/.test(fileLower)) result.promptDomain = 'health';
    else if (/^(litigation|legal|dispute|lawsuit)[-_ ]/.test(fileLower)) result.promptDomain = 'litigation';
  }

  return result;
}

function extractTitleFromHtml(html: string, fallbackName: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const decoded = titleMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (decoded) return decoded;
  }
  return fallbackName.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim() || 'HTML Report';
}

function getPreferredHtmlFileName(
  record: RatedThreadRecord,
  layout: ReportFolderLayout = 'dev',
): string {
  const qTurn = record.turns.find((t) => t.role === 'user');
  const title = qTurn?.threadName?.trim() || 'reference-report';
  const shortId = sanitizeId(record.id).slice(-8);
  if (layout === 'production') {
    const domain = normalizeDomain(qTurn?.promptDomain);
    const domainPrefix = sanitizeSlug(DOMAIN_FOLDER_NAMES[domain]);
    const questionSlug = sanitizeSlug(qTurn?.content?.trim() || title).slice(0, 32);
    return `${domainPrefix}-${questionSlug}-${shortId}.html`;
  }
  return `${sanitizeSlug(title)}-${shortId}.html`;
}

function getLatestHtmlFromRecord(record: RatedThreadRecord): string | null {
  for (let i = record.turns.length - 1; i >= 0; i -= 1) {
    const t = record.turns[i];
    if (t.role === 'assistant' && typeof t.htmlReport === 'string' && t.htmlReport.trim()) {
      return t.htmlReport;
    }
  }
  return null;
}

function applyHtmlToRecord(record: RatedThreadRecord, html: string): RatedThreadRecord {
  const assistantIndices = record.turns
    .map((t, idx) => (t.role === 'assistant' ? idx : -1))
    .filter((idx) => idx >= 0);
  if (assistantIndices.length === 0) {
    return record;
  }
  const lastIdx = assistantIndices[assistantIndices.length - 1];
  return {
    ...record,
    turns: record.turns.map((turn, idx) =>
      idx === lastIdx ? { ...turn, htmlReport: html } : turn,
    ),
  };
}

function pruneEmptyParentDirs(startDir: string, rootDir: string) {
  const resolvedRoot = path.resolve(rootDir);
  let current = path.resolve(startDir);
  while (
    current !== resolvedRoot &&
    current.startsWith(resolvedRoot + path.sep)
  ) {
    try {
      const entries = fs.readdirSync(current);
      if (entries.length > 0) break;
      fs.rmdirSync(current);
      current = path.dirname(current);
    } catch {
      break;
    }
  }
}

function toPosixRelative(root: string, targetPath: string): string {
  return path.relative(root, targetPath).split(path.sep).join('/');
}

function safeResolveUnderRoot(root: string, relOrName: string): string | null {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, relOrName);
  if (candidate === resolvedRoot || candidate.startsWith(resolvedRoot + path.sep)) {
    return candidate;
  }
  return null;
}

function walkHtmlFilesRecursively(dir: string, root: string, results: string[]) {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === META_DIR_NAME || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFilesRecursively(fullPath, root, results);
    } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
}

export function listStoredReports(
  customReportsDir?: string,
  layout: ReportFolderLayout = 'dev',
): {
  reportsDir: string;
  reports: RatedThreadRecord[];
} {
  const { root, metaDir } = ensureReportsFolders(customReportsDir);
  const reports: RatedThreadRecord[] = [];
  const claimedHtmlPaths = new Set<string>();

  // 1. Load metadata records saved by the workbench
  let metaFiles: string[] = [];
  try {
    metaFiles = fs.readdirSync(metaDir).filter((name) => name.toLowerCase().endsWith('.json'));
  } catch {
    metaFiles = [];
  }

  for (const metaFile of metaFiles) {
    const metaPath = path.join(metaDir, metaFile);
    try {
      const raw = fs.readFileSync(metaPath, 'utf-8');
      const parsed = JSON.parse(raw) as RatedThreadRecord & {
        htmlFileName?: string;
        relativePath?: string;
      };
      if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.turns)) {
        continue;
      }

      const segments = getStructuredFolderSegments(parsed, layout);
      const baseFileName =
        (typeof parsed.htmlFileName === 'string' && path.basename(parsed.htmlFileName)) ||
        (typeof parsed.fileName === 'string' && path.basename(parsed.fileName)) ||
        getPreferredHtmlFileName(parsed, layout);

      const structuredFolder = path.join(root, ...segments.folderSegments);
      const structuredHtmlPath = path.join(structuredFolder, baseFileName);
      const structuredRelPath = toPosixRelative(root, structuredHtmlPath);

      // Check prior locations (relativePath or flat root fileName) and migrate on disk if needed
      const priorRelPath =
        typeof parsed.relativePath === 'string' && parsed.relativePath.trim()
          ? parsed.relativePath.trim()
          : '';
      const priorResolved = priorRelPath
        ? safeResolveUnderRoot(root, priorRelPath)
        : null;
      const flatLegacyPath = path.join(root, baseFileName);

      if (!fs.existsSync(structuredHtmlPath)) {
        const sourceToMigrate =
          priorResolved && fs.existsSync(priorResolved)
            ? priorResolved
            : fs.existsSync(flatLegacyPath)
              ? flatLegacyPath
              : null;
        if (sourceToMigrate) {
          fs.mkdirSync(structuredFolder, { recursive: true });
          fs.renameSync(sourceToMigrate, structuredHtmlPath);
          pruneEmptyParentDirs(path.dirname(sourceToMigrate), root);
        }
      }

      let finalRecord: RatedThreadRecord = {
        id: parsed.id,
        turns: parsed.turns,
        ratedAt: parsed.ratedAt || new Date().toISOString(),
        fileName: baseFileName,
        filePath: structuredHtmlPath,
        relativePath: structuredRelPath,
        isExternalFile: false,
        isFinalized: Boolean(parsed.isFinalized),
        comment: parsed.comment,
      };

      if (fs.existsSync(structuredHtmlPath)) {
        claimedHtmlPaths.add(path.resolve(structuredHtmlPath).toLowerCase());
        try {
          const diskHtml = fs.readFileSync(structuredHtmlPath, 'utf-8');
          if (diskHtml) {
            finalRecord = applyHtmlToRecord(finalRecord, diskHtml);
          }
        } catch {
          // Keep stored turns if HTML read fails
        }
      } else {
        const inlineHtml = getLatestHtmlFromRecord(finalRecord);
        if (inlineHtml) {
          fs.mkdirSync(structuredFolder, { recursive: true });
          fs.writeFileSync(structuredHtmlPath, inlineHtml, 'utf-8');
          claimedHtmlPaths.add(path.resolve(structuredHtmlPath).toLowerCase());
        }
      }

      // Persist updated relativePath in metadata if migrated
      if (parsed.relativePath !== structuredRelPath) {
        try {
          fs.writeFileSync(
            metaPath,
            JSON.stringify(
              {
                ...finalRecord,
                htmlFileName: baseFileName,
                relativePath: structuredRelPath,
              },
              null,
              2,
            ),
            'utf-8',
          );
        } catch {
          // Ignore non-critical metadata sync write errors
        }
      }

      reports.push(finalRecord);
    } catch {
      // Skip malformed metadata record
    }
  }

  // 2. Also include any standalone .html / .htm files anywhere under reportsDir (both flat and nested folders)
  const discoveredHtmlFiles: string[] = [];
  walkHtmlFilesRecursively(root, root, discoveredHtmlFiles);

  for (const fullPath of discoveredHtmlFiles) {
    if (claimedHtmlPaths.has(path.resolve(fullPath).toLowerCase())) continue;

    try {
      const htmlContent = fs.readFileSync(fullPath, 'utf-8');
      const stat = fs.statSync(fullPath);
      const isoTime = stat.mtime.toISOString();
      const relPosix = toPosixRelative(root, fullPath);
      const fileName = path.basename(fullPath);
      const title = extractTitleFromHtml(htmlContent, fileName);
      const inferred = parseFolderMetadataFromRelativePath(relPosix);
      const recordId = `file:${relPosix}`;

      const fallbackMonth = normalizeMonthName(inferred.threadMonth, isoTime);
      const fallbackYear = normalizeYearNumber(inferred.threadYear, isoTime);
      const fallbackDomain = inferred.promptDomain ?? 'astrology';
      const fallbackAdapter: AnyAdapterId = inferred.adapterId ?? 'gemini';
      const fallbackScope: ConversationScope =
        inferred.scope ?? (fallbackAdapter === 'ollama' ? 'private' : 'public');

      const syntheticUserTurn: ConversationTurn = {
        id: `${recordId}:user`,
        role: 'user',
        content: title,
        timestamp: isoTime,
        scope: fallbackScope,
        adapterId: fallbackAdapter,
        model: 'local-html',
        promptDomain: fallbackDomain,
        threadName: title,
        threadMonth: fallbackMonth,
        threadYear: fallbackYear,
      };
      const syntheticAssistantTurn: ConversationTurn = {
        id: `${recordId}:html`,
        exchangeId: syntheticUserTurn.id,
        role: 'assistant',
        content: title,
        htmlReport: htmlContent,
        timestamp: isoTime,
        scope: fallbackScope,
        adapterId: fallbackAdapter,
        model: 'Local HTML File',
      };
      reports.push({
        id: recordId,
        turns: [syntheticUserTurn, syntheticAssistantTurn],
        ratedAt: isoTime,
        fileName,
        filePath: fullPath,
        relativePath: relPosix,
        isExternalFile: true,
      });
    } catch {
      // Ignore unreadable HTML file
    }
  }

  reports.sort((a, b) => Date.parse(b.ratedAt || '') - Date.parse(a.ratedAt || ''));

  return {
    reportsDir: root,
    reports,
  };
}

export function saveStoredReport(
  record: RatedThreadRecord,
  customReportsDir?: string,
  explicitHtml?: string,
  layout: ReportFolderLayout = 'dev',
): {
  reportsDir: string;
  fileName: string;
  filePath: string;
  relativePath: string;
  record: RatedThreadRecord;
} {
  const { root, metaDir } = ensureReportsFolders(customReportsDir);
  const safeId = sanitizeId(record.id);
  const metaPath = path.join(metaDir, `${safeId}.json`);

  const segments = getStructuredFolderSegments(record, layout);
  const targetFolder = path.join(root, ...segments.folderSegments);
  fs.mkdirSync(targetFolder, { recursive: true });

  // Inspect existing metadata to find any previous HTML path so we can clean/move cleanly
  let prevHtmlPath: string | null = null;
  let fileName = record.fileName ? path.basename(record.fileName) : '';
  if (fs.existsSync(metaPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
        htmlFileName?: string;
        fileName?: string;
        relativePath?: string;
      };
      if (existing.relativePath) {
        prevHtmlPath = safeResolveUnderRoot(root, existing.relativePath);
      } else if (existing.htmlFileName || existing.fileName) {
        prevHtmlPath = path.join(root, path.basename(existing.htmlFileName || existing.fileName || ''));
      }
      if (!fileName) {
        const prevName = existing.htmlFileName || existing.fileName;
        if (prevName) fileName = path.basename(prevName);
      }
    } catch {
      // Ignore parse error
    }
  }

  if (!fileName || !/\.html?$/i.test(fileName)) {
    fileName = getPreferredHtmlFileName(record, layout);
  }

  const htmlFilePath = path.join(targetFolder, fileName);
  const relativePath = toPosixRelative(root, htmlFilePath);

  if (
    prevHtmlPath &&
    path.resolve(prevHtmlPath) !== path.resolve(htmlFilePath) &&
    fs.existsSync(prevHtmlPath)
  ) {
    try {
      fs.renameSync(prevHtmlPath, htmlFilePath);
      pruneEmptyParentDirs(path.dirname(prevHtmlPath), root);
    } catch {
      // Fall back to writing fresh below
    }
  }

  const htmlContent = explicitHtml ?? getLatestHtmlFromRecord(record);
  if (htmlContent && htmlContent.trim()) {
    fs.writeFileSync(htmlFilePath, htmlContent, 'utf-8');
  }

  const qTurn = record.turns.find((t) => t.role === 'user');
  const baseRecord: RatedThreadRecord = {
    ...record,
    fileName,
    filePath: htmlFilePath,
    relativePath,
    isExternalFile: false,
    comment: record.comment ?? qTurn?.threadComment,
  };

  const updatedRecord: RatedThreadRecord = htmlContent
    ? applyHtmlToRecord(baseRecord, htmlContent)
    : baseRecord;

  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        ...updatedRecord,
        htmlFileName: fileName,
        relativePath,
      },
      null,
      2,
    ),
    'utf-8',
  );

  return {
    reportsDir: root,
    fileName,
    filePath: htmlFilePath,
    relativePath,
    record: updatedRecord,
  };
}

export function readStoredReportHtml(
  reportId: string,
  customReportsDir?: string,
): {
  html: string;
  fileName: string;
  filePath: string;
} | null {
  const { root, metaDir } = ensureReportsFolders(customReportsDir);

  if (reportId.startsWith('file:')) {
    const relTarget = reportId.slice('file:'.length);
    const fullPath = safeResolveUnderRoot(root, relTarget);
    if (!fullPath || !fs.existsSync(fullPath)) return null;
    return {
      html: fs.readFileSync(fullPath, 'utf-8'),
      fileName: path.basename(fullPath),
      filePath: fullPath,
    };
  }

  const safeId = sanitizeId(reportId);
  const metaPath = path.join(metaDir, `${safeId}.json`);
  if (!fs.existsSync(metaPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as RatedThreadRecord & {
      htmlFileName?: string;
      relativePath?: string;
    };
    const fileName = path.basename(
      parsed.htmlFileName || parsed.fileName || getPreferredHtmlFileName(parsed),
    );

    const candidates: string[] = [];
    if (parsed.relativePath) {
      const resolvedRel = safeResolveUnderRoot(root, parsed.relativePath);
      if (resolvedRel) candidates.push(resolvedRel);
    }
    const seg = getStructuredFolderSegments(parsed);
    candidates.push(path.join(root, seg.yearMonthDir, seg.domainDir, seg.adapterDir, fileName));
    candidates.push(path.join(root, fileName));

    for (const fullPath of candidates) {
      if (fs.existsSync(fullPath)) {
        return {
          html: fs.readFileSync(fullPath, 'utf-8'),
          fileName,
          filePath: fullPath,
        };
      }
    }

    const fallbackHtml = getLatestHtmlFromRecord(parsed);
    if (fallbackHtml) {
      return {
        html: fallbackHtml,
        fileName,
        filePath: candidates[0],
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function deleteStoredReport(
  reportId: string,
  customReportsDir?: string,
): { deleted: boolean } {
  const { root, metaDir } = ensureReportsFolders(customReportsDir);

  if (reportId.startsWith('file:')) {
    const relTarget = reportId.slice('file:'.length);
    const fullPath = safeResolveUnderRoot(root, relTarget);
    if (fullPath && fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      pruneEmptyParentDirs(path.dirname(fullPath), root);
      return { deleted: true };
    }
    return { deleted: false };
  }

  const safeId = sanitizeId(reportId);
  const metaPath = path.join(metaDir, `${safeId}.json`);
  let deleted = false;

  if (fs.existsSync(metaPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as RatedThreadRecord & {
        htmlFileName?: string;
        relativePath?: string;
      };
      if (parsed.relativePath) {
        const relFull = safeResolveUnderRoot(root, parsed.relativePath);
        if (relFull && fs.existsSync(relFull)) {
          fs.unlinkSync(relFull);
          pruneEmptyParentDirs(path.dirname(relFull), root);
        }
      }
      const fileName = parsed.htmlFileName || parsed.fileName;
      if (fileName) {
        const flatPath = path.join(root, path.basename(fileName));
        if (fs.existsSync(flatPath)) {
          fs.unlinkSync(flatPath);
        }
      }
    } catch {
      // Ignore metadata parse errors while deleting
    }
    fs.unlinkSync(metaPath);
    deleted = true;
  }

  return { deleted };
}

export interface ReportMetadataUpdatePayload {
  name?: string;
  comment?: string;
  moveTarget?: {
    threadMonth: string;
    threadYear: number;
    promptDomain: PromptDomain;
    adapterId: AnyAdapterId;
  };
}

export function updateStoredReportMetadata(
  reportId: string,
  patch: ReportMetadataUpdatePayload,
  customReportsDir?: string,
): {
  record: RatedThreadRecord;
} | null {
  const { root, metaDir } = ensureReportsFolders(customReportsDir);
  const trimmedName = typeof patch.name === 'string' ? patch.name.trim() : undefined;
  const nextComment = typeof patch.comment === 'string' ? patch.comment.trim() : undefined;

  if (reportId.startsWith('file:')) {
    const oldRel = reportId.slice('file:'.length);
    const oldPath = safeResolveUnderRoot(root, oldRel);
    if (!oldPath || !fs.existsSync(oldPath)) return null;

    const oldFileName = path.basename(oldPath);
    const ext = path.extname(oldFileName) || '.html';
    let nextFileName = oldFileName;
    if (trimmedName) {
      const baseFromName = sanitizeSlug(trimmedName);
      nextFileName = `${baseFromName}${ext}`;
    }

    let targetDir = path.dirname(oldPath);
    if (patch.moveTarget) {
      const monthName = normalizeMonthName(patch.moveTarget.threadMonth);
      const yearNum = normalizeYearNumber(patch.moveTarget.threadYear);
      const domainDir = DOMAIN_FOLDER_NAMES[normalizeDomain(patch.moveTarget.promptDomain)];
      const adapterDir = ADAPTER_FOLDER_NAMES[normalizeAdapterId(patch.moveTarget.adapterId)];
      targetDir = path.join(root, `${yearNum} ${monthName}`, domainDir, adapterDir);
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let nextPath = path.join(targetDir, nextFileName);
    if (
      path.resolve(nextPath).toLowerCase() !== path.resolve(oldPath).toLowerCase() &&
      fs.existsSync(nextPath)
    ) {
      const baseWithoutExt = nextFileName.replace(/\.html?$/i, '');
      nextFileName = `${baseWithoutExt}-${Date.now().toString().slice(-5)}${ext}`;
      nextPath = path.join(targetDir, nextFileName);
    }

    if (path.resolve(nextPath) !== path.resolve(oldPath)) {
      fs.renameSync(oldPath, nextPath);
      pruneEmptyParentDirs(path.dirname(oldPath), root);
    }

    const htmlContent = fs.readFileSync(nextPath, 'utf-8');
    const stat = fs.statSync(nextPath);
    const isoTime = stat.mtime.toISOString();
    const relPosix = toPosixRelative(root, nextPath);
    const nextId = `file:${relPosix}`;
    const inferred = parseFolderMetadataFromRelativePath(relPosix);
    const resolvedTitle = trimmedName || extractTitleFromHtml(htmlContent, nextFileName);
    const resolvedAdapter = patch.moveTarget?.adapterId ?? inferred.adapterId ?? 'gemini';
    const resolvedScope: ConversationScope =
      resolvedAdapter === 'ollama' ? 'private' : 'public';
    const resolvedDomain = patch.moveTarget?.promptDomain ?? inferred.promptDomain ?? 'astrology';
    const resolvedMonth =
      patch.moveTarget?.threadMonth ??
      inferred.threadMonth ??
      normalizeMonthName(undefined, isoTime);
    const resolvedYear =
      patch.moveTarget?.threadYear ??
      inferred.threadYear ??
      normalizeYearNumber(undefined, isoTime);

    const syntheticUserTurn: ConversationTurn = {
      id: `${nextId}:user`,
      role: 'user',
      content: resolvedTitle,
      timestamp: isoTime,
      scope: resolvedScope,
      adapterId: resolvedAdapter,
      model: 'local-html',
      promptDomain: resolvedDomain,
      threadName: resolvedTitle,
      threadMonth: resolvedMonth,
      threadYear: resolvedYear,
      threadComment: nextComment,
    };
    const syntheticAssistantTurn: ConversationTurn = {
      id: `${nextId}:html`,
      exchangeId: syntheticUserTurn.id,
      role: 'assistant',
      content: resolvedTitle,
      htmlReport: htmlContent,
      timestamp: isoTime,
      scope: resolvedScope,
      adapterId: resolvedAdapter,
      model: 'Local HTML File',
    };
    return {
      record: {
        id: nextId,
        turns: [syntheticUserTurn, syntheticAssistantTurn],
        ratedAt: isoTime,
        fileName: nextFileName,
        filePath: nextPath,
        relativePath: relPosix,
        isExternalFile: true,
        comment: nextComment,
      },
    };
  }

  const safeId = sanitizeId(reportId);
  const metaPath = path.join(metaDir, `${safeId}.json`);
  if (!fs.existsSync(metaPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as RatedThreadRecord & {
      htmlFileName?: string;
    };

    const nextScope: ConversationScope | undefined = patch.moveTarget
      ? patch.moveTarget.adapterId === 'ollama'
        ? 'private'
        : 'public'
      : undefined;

    const updatedTurns = (parsed.turns || []).map((turn) => {
      if (turn.role === 'user') {
        return {
          ...turn,
          ...(trimmedName ? { threadName: trimmedName } : {}),
          ...(nextComment !== undefined ? { threadComment: nextComment } : {}),
          ...(patch.moveTarget
            ? {
                threadMonth: normalizeMonthName(patch.moveTarget.threadMonth),
                threadYear: normalizeYearNumber(patch.moveTarget.threadYear),
                promptDomain: patch.moveTarget.promptDomain,
                adapterId: patch.moveTarget.adapterId,
                scope: nextScope ?? turn.scope,
                responseScopes: nextScope ? [nextScope] : turn.responseScopes,
              }
            : {}),
        };
      }
      if (turn.role === 'assistant' && patch.moveTarget) {
        return {
          ...turn,
          adapterId: patch.moveTarget.adapterId,
          scope: nextScope ?? turn.scope,
        };
      }
      return turn;
    });

    const updatedRecord: RatedThreadRecord = {
      ...parsed,
      turns: updatedTurns,
      ratedAt: new Date().toISOString(),
      ...(nextComment !== undefined ? { comment: nextComment } : {}),
    };

    const saved = saveStoredReport(updatedRecord, customReportsDir);
    return { record: saved.record };
  } catch {
    return null;
  }
}

export function renameStoredReport(
  reportId: string,
  newName: string,
  customReportsDir?: string,
): {
  record: RatedThreadRecord;
} | null {
  const trimmedName = newName.trim();
  if (!trimmedName) return null;
  return updateStoredReportMetadata(reportId, { name: trimmedName }, customReportsDir);
}

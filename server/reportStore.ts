import fs from 'fs';
import path from 'path';
import type {
  ConversationTurn,
  RatedThreadRecord,
} from '../src/types/workbench.ts';
import { resolveReportsDir } from './configStore.ts';

const META_DIR_NAME = '.workbench-records';

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

function getPreferredHtmlFileName(record: RatedThreadRecord): string {
  const qTurn = record.turns.find((t) => t.role === 'user');
  const title = qTurn?.threadName?.trim() || 'reference-report';
  const monthPart = qTurn?.threadMonth ? `${qTurn.threadMonth}-` : '';
  const yearPart = qTurn?.threadYear ? `${qTurn.threadYear}-` : '';
  const shortId = sanitizeId(record.id).slice(-8);
  return `${sanitizeSlug(`${yearPart}${monthPart}${title}`)}-${shortId}.html`;
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

export function listStoredReports(customReportsDir?: string): {
  reportsDir: string;
  reports: RatedThreadRecord[];
} {
  const { root, metaDir } = ensureReportsFolders(customReportsDir);
  const reports: RatedThreadRecord[] = [];
  const claimedHtmlFiles = new Set<string>();

  // 1. Load metadata records saved by the workbench and hydrate their exact HTML from disk
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
      const parsed = JSON.parse(raw) as RatedThreadRecord & { htmlFileName?: string };
      if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.turns)) {
        continue;
      }

      const candidateFileName =
        (typeof parsed.htmlFileName === 'string' && path.basename(parsed.htmlFileName)) ||
        (typeof parsed.fileName === 'string' && path.basename(parsed.fileName)) ||
        getPreferredHtmlFileName(parsed);

      const candidateHtmlPath = path.join(root, candidateFileName);
      let finalRecord: RatedThreadRecord = {
        id: parsed.id,
        turns: parsed.turns,
        ratedAt: parsed.ratedAt || new Date().toISOString(),
        fileName: candidateFileName,
        filePath: candidateHtmlPath,
        isExternalFile: false,
      };

      if (fs.existsSync(candidateHtmlPath)) {
        claimedHtmlFiles.add(candidateFileName.toLowerCase());
        try {
          const diskHtml = fs.readFileSync(candidateHtmlPath, 'utf-8');
          if (diskHtml) {
            finalRecord = applyHtmlToRecord(finalRecord, diskHtml);
          }
        } catch {
          // Keep stored turns if HTML read fails
        }
      } else {
        const inlineHtml = getLatestHtmlFromRecord(finalRecord);
        if (inlineHtml) {
          fs.writeFileSync(candidateHtmlPath, inlineHtml, 'utf-8');
          claimedHtmlFiles.add(candidateFileName.toLowerCase());
        }
      }

      reports.push(finalRecord);
    } catch {
      // Skip malformed metadata record
    }
  }

  // 2. Also include any standalone .html / .htm files directly inside reportsDir
  let dirEntries: fs.Dirent[] = [];
  try {
    dirEntries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    dirEntries = [];
  }

  for (const entry of dirEntries) {
    if (!entry.isFile()) continue;
    if (!/\.html?$/i.test(entry.name)) continue;
    if (claimedHtmlFiles.has(entry.name.toLowerCase())) continue;

    const fullPath = path.join(root, entry.name);
    try {
      const htmlContent = fs.readFileSync(fullPath, 'utf-8');
      const stat = fs.statSync(fullPath);
      const isoTime = stat.mtime.toISOString();
      const title = extractTitleFromHtml(htmlContent, entry.name);
      const recordId = `file:${entry.name}`;
      const syntheticUserTurn: ConversationTurn = {
        id: `${recordId}:user`,
        role: 'user',
        content: title,
        timestamp: isoTime,
        scope: 'public',
        adapterId: 'gemini',
        model: 'local-html',
        threadName: title,
      };
      const syntheticAssistantTurn: ConversationTurn = {
        id: `${recordId}:html`,
        exchangeId: syntheticUserTurn.id,
        role: 'assistant',
        content: title,
        htmlReport: htmlContent,
        timestamp: isoTime,
        scope: 'public',
        adapterId: 'gemini',
        model: 'Local HTML File',
      };
      reports.push({
        id: recordId,
        turns: [syntheticUserTurn, syntheticAssistantTurn],
        ratedAt: isoTime,
        fileName: entry.name,
        filePath: fullPath,
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
): {
  reportsDir: string;
  fileName: string;
  filePath: string;
  record: RatedThreadRecord;
} {
  const { root, metaDir } = ensureReportsFolders(customReportsDir);
  const safeId = sanitizeId(record.id);
  const metaPath = path.join(metaDir, `${safeId}.json`);

  // Preserve previous filename for this ID if it already existed so we update in place
  let fileName = record.fileName ? path.basename(record.fileName) : '';
  if (!fileName && fs.existsSync(metaPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
        htmlFileName?: string;
        fileName?: string;
      };
      const prevName = existing.htmlFileName || existing.fileName;
      if (prevName) fileName = path.basename(prevName);
    } catch {
      // Ignore parse error
    }
  }
  if (!fileName || !/\.html?$/i.test(fileName)) {
    fileName = getPreferredHtmlFileName(record);
  }

  const htmlFilePath = path.join(root, fileName);
  const htmlContent = explicitHtml ?? getLatestHtmlFromRecord(record);
  if (htmlContent && htmlContent.trim()) {
    fs.writeFileSync(htmlFilePath, htmlContent, 'utf-8');
  }

  const updatedRecord: RatedThreadRecord = htmlContent
    ? applyHtmlToRecord(
        { ...record, fileName, filePath: htmlFilePath, isExternalFile: false },
        htmlContent,
      )
    : { ...record, fileName, filePath: htmlFilePath, isExternalFile: false };

  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        ...updatedRecord,
        htmlFileName: fileName,
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
    const fileName = path.basename(reportId.slice('file:'.length));
    const fullPath = path.join(root, fileName);
    if (!fs.existsSync(fullPath)) return null;
    return {
      html: fs.readFileSync(fullPath, 'utf-8'),
      fileName,
      filePath: fullPath,
    };
  }

  const safeId = sanitizeId(reportId);
  const metaPath = path.join(metaDir, `${safeId}.json`);
  if (!fs.existsSync(metaPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as RatedThreadRecord & {
      htmlFileName?: string;
    };
    const fileName = path.basename(
      parsed.htmlFileName || parsed.fileName || getPreferredHtmlFileName(parsed),
    );
    const fullPath = path.join(root, fileName);
    if (fs.existsSync(fullPath)) {
      return {
        html: fs.readFileSync(fullPath, 'utf-8'),
        fileName,
        filePath: fullPath,
      };
    }
    const fallbackHtml = getLatestHtmlFromRecord(parsed);
    if (fallbackHtml) {
      return {
        html: fallbackHtml,
        fileName,
        filePath: fullPath,
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
    const fileName = path.basename(reportId.slice('file:'.length));
    const fullPath = path.join(root, fileName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return { deleted: true };
    }
    return { deleted: false };
  }

  const safeId = sanitizeId(reportId);
  const metaPath = path.join(metaDir, `${safeId}.json`);
  let deleted = false;

  if (fs.existsSync(metaPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
        htmlFileName?: string;
        fileName?: string;
      };
      const fileName = parsed.htmlFileName || parsed.fileName;
      if (fileName) {
        const htmlPath = path.join(root, path.basename(fileName));
        if (fs.existsSync(htmlPath)) {
          fs.unlinkSync(htmlPath);
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

export function renameStoredReport(
  reportId: string,
  newName: string,
  customReportsDir?: string,
): {
  record: RatedThreadRecord;
} | null {
  const trimmedName = newName.trim();
  if (!trimmedName) return null;

  const { root, metaDir } = ensureReportsFolders(customReportsDir);

  if (reportId.startsWith('file:')) {
    const oldFileName = path.basename(reportId.slice('file:'.length));
    const oldPath = path.join(root, oldFileName);
    if (!fs.existsSync(oldPath)) return null;

    const ext = path.extname(oldFileName) || '.html';
    const baseFromName = sanitizeSlug(trimmedName);
    let nextFileName = `${baseFromName}${ext}`;
    if (
      nextFileName.toLowerCase() !== oldFileName.toLowerCase() &&
      fs.existsSync(path.join(root, nextFileName))
    ) {
      nextFileName = `${baseFromName}-${Date.now().toString().slice(-5)}${ext}`;
    }
    const nextPath = path.join(root, nextFileName);
    if (nextPath !== oldPath) {
      fs.renameSync(oldPath, nextPath);
    }

    const htmlContent = fs.readFileSync(nextPath, 'utf-8');
    const stat = fs.statSync(nextPath);
    const isoTime = stat.mtime.toISOString();
    const nextId = `file:${nextFileName}`;
    const syntheticUserTurn: ConversationTurn = {
      id: `${nextId}:user`,
      role: 'user',
      content: trimmedName,
      timestamp: isoTime,
      scope: 'public',
      adapterId: 'gemini',
      model: 'local-html',
      threadName: trimmedName,
    };
    const syntheticAssistantTurn: ConversationTurn = {
      id: `${nextId}:html`,
      exchangeId: syntheticUserTurn.id,
      role: 'assistant',
      content: trimmedName,
      htmlReport: htmlContent,
      timestamp: isoTime,
      scope: 'public',
      adapterId: 'gemini',
      model: 'Local HTML File',
    };
    return {
      record: {
        id: nextId,
        turns: [syntheticUserTurn, syntheticAssistantTurn],
        ratedAt: isoTime,
        fileName: nextFileName,
        filePath: nextPath,
        isExternalFile: true,
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
    const updatedTurns = (parsed.turns || []).map((turn) =>
      turn.role === 'user' ? { ...turn, threadName: trimmedName } : turn,
    );
    const updatedRecord: RatedThreadRecord = {
      ...parsed,
      turns: updatedTurns,
      ratedAt: new Date().toISOString(),
    };
    const saved = saveStoredReport(updatedRecord, customReportsDir);
    return { record: saved.record };
  } catch {
    return null;
  }
}


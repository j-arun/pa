import { execFile } from 'child_process';
import crypto from 'crypto';
import type {
  AnyAdapterId,
  AppleSyncConfig,
  AppleSyncMode,
  AppleSyncResult,
  CarefulDateItem,
  EventCardItem,
  PromptDomain,
  RatedThreadRecord,
} from '../src/types/workbench.ts';
import { parseResponseEventsAndReport } from '../src/utils/eventParser.ts';

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

const DOMAIN_DISPLAY_LABELS: Record<PromptDomain, string> = {
  astrology: 'Career',
  family: 'Family',
  finance: 'Finance',
  general: 'Love',
  health: 'Health',
  litigation: 'Litigation',
};

const ADAPTER_DISPLAY_LABELS: Record<AnyAdapterId, string> = {
  gemini: 'Gemini',
  fable: 'Fable',
  claude: 'Sonnet',
  chatgpt: 'ChatGPT',
  ollama: 'Local',
};

export interface AppleSyncCapabilities {
  platform: string;
  isMacOs: boolean;
  osascriptAvailable: boolean;
  caldavEndpoint: string;
  hasEnvCredentials: boolean;
}

export interface WatchOutSyncPayloadItem {
  uid: string;
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  allDay: boolean;
  severity: 'high' | 'caution' | 'watch';
  domain: string;
  providerLabel: string;
  rawDateLabel: string;
}

export interface ReminderCardSyncPayloadItem {
  uid: string;
  title: string;
  body: string;
  dueIso: string | null;
  priority: number;
  category: string;
  providerLabel: string;
  whenLabel: string;
  probabilityLabel: string;
}

export interface AppleSyncFallbackPayload {
  title?: string;
  providerLabel?: string;
  threadMonth?: string;
  threadYear?: number;
  promptDomain?: PromptDomain;
  carefulDates?: CarefulDateItem[];
  eventCards?: EventCardItem[];
}

export function getAppleSyncCapabilities(): AppleSyncCapabilities {
  const isMacOs = process.platform === 'darwin';
  return {
    platform: process.platform,
    isMacOs,
    osascriptAvailable: isMacOs,
    caldavEndpoint: 'https://caldav.icloud.com/',
    hasEnvCredentials: Boolean(
      process.env.ICLOUD_APPLE_ID?.trim() && process.env.ICLOUD_APP_PASSWORD?.trim(),
    ),
  };
}

function getProviderDisplayName(adapterId?: string, scope?: string): string {
  if (adapterId && adapterId in ADAPTER_DISPLAY_LABELS) {
    return ADAPTER_DISPLAY_LABELS[adapterId as AnyAdapterId];
  }
  return scope === 'private' ? 'Local' : 'Gemini';
}

function getSeverityLabel(sev?: CarefulDateItem['severity']): string {
  if (sev === 'high') return 'High Care';
  if (sev === 'watch') return 'Watch';
  return 'Caution';
}

function resolveMonthIndex(rawMonth?: string): number | null {
  if (!rawMonth) return null;
  const lower = rawMonth.trim().toLowerCase();
  const idx = MONTHS.findIndex(
    (m) => m === lower || m.slice(0, 3) === lower.slice(0, 3),
  );
  if (idx >= 0) return idx;
  const num = Number(lower);
  if (Number.isInteger(num) && num >= 1 && num <= 12) return num - 1;
  return null;
}

function parseClockTime(raw: string): { hours: number; minutes: number } | null {
  const match = raw.match(/\b(\d{1,2}):(\d{2})(?:\s*(am|pm))?\b/i);
  if (match) {
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const ampm = match[3]?.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }
  const simpleAmPm = raw.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (simpleAmPm) {
    let hours = Number(simpleAmPm[1]);
    const ampm = simpleAmPm[2].toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    if (hours >= 0 && hours <= 23) {
      return { hours, minutes: 0 };
    }
  }
  return null;
}

function extractClockTimeRange(
  raw: string,
): { start: { hours: number; minutes: number }; end: { hours: number; minutes: number } } | null {
  const rangeMatch = raw.match(
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i,
  );
  if (rangeMatch) {
    let startStr = rangeMatch[1].trim();
    const endStr = rangeMatch[2].trim();
    const endAmPm = endStr.match(/(am|pm)/i)?.[1];
    if (endAmPm && !/(am|pm)/i.test(startStr)) {
      startStr = `${startStr} ${endAmPm}`;
    }
    const start = parseClockTime(startStr);
    const end = parseClockTime(endStr);
    if (start && end) {
      return { start, end };
    }
  }
  const single = parseClockTime(raw);
  if (single) {
    const endHour = (single.hours + 1) % 24;
    return {
      start: single,
      end: { hours: endHour, minutes: single.minutes },
    };
  }
  return null;
}

function parseSingleDateFromSegment(
  segment: string,
  fallbackYear: number,
  fallbackMonthIdx: number,
): Date | null {
  const isoMatch = segment.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]) - 1;
    const d = Number(isoMatch[3]);
    const dt = new Date(y, m, d, 0, 0, 0, 0);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const slashMatch = segment.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slashMatch) {
    const m = Number(slashMatch[1]) - 1;
    const d = Number(slashMatch[2]);
    let y = Number(slashMatch[3]);
    if (y < 100) y += 2000;
    const dt = new Date(y, m, d, 0, 0, 0, 0);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const monthNamesRegex =
    '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  const mdyMatch = segment.match(
    new RegExp(`\\b${monthNamesRegex}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i'),
  );
  if (mdyMatch) {
    const mIdx = resolveMonthIndex(mdyMatch[1]);
    const day = Number(mdyMatch[2]);
    const y = mdyMatch[3] ? Number(mdyMatch[3]) : fallbackYear;
    if (mIdx !== null && day >= 1 && day <= 31) {
      return new Date(y, mIdx, day, 0, 0, 0, 0);
    }
  }

  const dmyMatch = segment.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthNamesRegex}(?:,?\\s*(\\d{4}))?\\b`, 'i'),
  );
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const mIdx = resolveMonthIndex(dmyMatch[2]);
    const y = dmyMatch[3] ? Number(dmyMatch[3]) : fallbackYear;
    if (mIdx !== null && day >= 1 && day <= 31) {
      return new Date(y, mIdx, day, 0, 0, 0, 0);
    }
  }

  // Day-only inside a range like "Mar 14-16, 2027"
  const bareDay = segment.trim().match(/^(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/i);
  if (bareDay) {
    const day = Number(bareDay[1]);
    const y = bareDay[2] ? Number(bareDay[2]) : fallbackYear;
    if (day >= 1 && day <= 31) {
      return new Date(y, fallbackMonthIdx, day, 0, 0, 0, 0);
    }
  }

  return null;
}

export function parseEventWindow(
  rawLabel: string,
  fallbackMonth?: string,
  fallbackYear?: number,
): { startDate: Date; endDate: Date; allDay: boolean } {
  const now = new Date();
  const baseYear =
    typeof fallbackYear === 'number' && fallbackYear >= 1990 && fallbackYear <= 2090
      ? Math.round(fallbackYear)
      : now.getFullYear();
  const baseMonthIdx = resolveMonthIndex(fallbackMonth) ?? now.getMonth();

  const text = (rawLabel || '').trim();
  const timeRange = extractClockTimeRange(text);

  // Check range separator between two dates (avoid splitting ISO YYYY-MM-DD hyphens)
  const datePartOnly = text
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, ' ')
    .replace(/\b\d{1,2}:\d{2}\s*(?:-|–|—|to)\s*\d{1,2}:\d{2}\b/gi, ' ');

  let startDate: Date | null = null;
  let endDate: Date | null = null;

  const sameMonthRange = datePartOnly.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})(?:,?\s*(\d{4}))?/i,
  );
  if (sameMonthRange) {
    const mIdx = resolveMonthIndex(sameMonthRange[1]) ?? baseMonthIdx;
    const d1 = Number(sameMonthRange[2]);
    const d2 = Number(sameMonthRange[3]);
    const yr = sameMonthRange[4] ? Number(sameMonthRange[4]) : baseYear;
    startDate = new Date(yr, mIdx, d1, 0, 0, 0, 0);
    endDate = new Date(yr, mIdx, Math.max(d1, d2), 0, 0, 0, 0);
  } else {
    const rangeSegments = datePartOnly.split(/\s+(?:to|through|until|–|—)\s+|\s+-\s+/i);
    if (rangeSegments.length >= 2) {
      startDate = parseSingleDateFromSegment(rangeSegments[0], baseYear, baseMonthIdx);
      const refMonth = startDate ? startDate.getMonth() : baseMonthIdx;
      const refYear = startDate ? startDate.getFullYear() : baseYear;
      endDate = parseSingleDateFromSegment(rangeSegments[1], refYear, refMonth);
    }
    if (!startDate) {
      startDate = parseSingleDateFromSegment(datePartOnly, baseYear, baseMonthIdx);
    }
  }

  if (!startDate) {
    const lower = text.toLowerCase();
    let heuristicDay = 1;
    if (/\b(early|first\s+week|1st\s+week)\b/.test(lower)) heuristicDay = 5;
    else if (/\b(second\s+week|2nd\s+week)\b/.test(lower)) heuristicDay = 11;
    else if (/\b(mid|middle|third\s+week|3rd\s+week)\b/.test(lower)) heuristicDay = 15;
    else if (/\b(fourth\s+week|4th\s+week|late|end)\b/.test(lower)) heuristicDay = 24;
    const mentionedMonth = resolveMonthIndex(
      text.match(
        /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i,
      )?.[1],
    );
    const mentionedYear = text.match(/\b(20\d{2})\b/)?.[1];
    startDate = new Date(
      mentionedYear ? Number(mentionedYear) : baseYear,
      mentionedMonth ?? baseMonthIdx,
      heuristicDay,
      0,
      0,
      0,
      0,
    );
  }

  if (!endDate || endDate.getTime() < startDate.getTime()) {
    endDate = new Date(startDate.getTime());
  }

  if (timeRange) {
    const timedStart = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate(),
      timeRange.start.hours,
      timeRange.start.minutes,
      0,
      0,
    );
    const timedEnd = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate(),
      timeRange.end.hours,
      timeRange.end.minutes,
      0,
      0,
    );
    if (timedEnd.getTime() <= timedStart.getTime()) {
      timedEnd.setTime(timedStart.getTime() + 60 * 60 * 1000);
    }
    return { startDate: timedStart, endDate: timedEnd, allDay: false };
  }

  const allDayStart = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
    0,
    0,
    0,
    0,
  );
  const allDayEnd = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
    23,
    59,
    0,
    0,
  );
  return { startDate: allDayStart, endDate: allDayEnd, allDay: true };
}

function buildDeterministicUid(prefix: string, seed: string): string {
  const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 20);
  return `${prefix}-${hash}`;
}

function parsePriorityFromProbability(probText: string): number {
  const lower = probText.toLowerCase();
  const pct = Number(probText.match(/(\d{1,3})\s*%/)?.[1] ?? 'NaN');
  if (/\b(high|very\s*high|certain|strong)\b/.test(lower) || (Number.isFinite(pct) && pct >= 75)) {
    return 1; // High
  }
  if (/\b(medium|moderate|mostly|probable|likely)\b/.test(lower) || (Number.isFinite(pct) && pct >= 50)) {
    return 5; // Medium
  }
  return 9; // Low
}

export function buildSyncItemsFromReport(
  record: RatedThreadRecord | null,
  fallback?: AppleSyncFallbackPayload,
): {
  reportId: string;
  reportTitle: string;
  providerLabel: string;
  watchOutEvents: WatchOutSyncPayloadItem[];
  reminderCards: ReminderCardSyncPayloadItem[];
} {
  const turns = record?.turns ?? [];
  const qTurn = turns.find((t) => t.role === 'user');
  const assistantReplies = turns.filter((t) => t.role === 'assistant');
  const latestReply = assistantReplies[assistantReplies.length - 1];

  const reportId = record?.id || `report-${Date.now()}`;
  const reportTitle =
    fallback?.title?.trim() || qTurn?.threadName?.trim() || 'Assistant Report';
  const threadMonth = fallback?.threadMonth || qTurn?.threadMonth;
  const threadYear = fallback?.threadYear ?? qTurn?.threadYear;
  const domainCode = fallback?.promptDomain ?? qTurn?.promptDomain ?? 'astrology';
  const defaultDomainLabel = DOMAIN_DISPLAY_LABELS[domainCode] || 'General';
  const providerLabel =
    fallback?.providerLabel?.trim() ||
    getProviderDisplayName(
      latestReply?.adapterId ?? qTurn?.adapterId,
      latestReply?.scope ?? qTurn?.scope,
    );
  const modelName =
    latestReply?.model && !/local html/i.test(latestReply.model)
      ? latestReply.model
      : '';
  const providerAttribution = modelName
    ? `${providerLabel} (${modelName})`
    : providerLabel;
  const periodLabel = [threadMonth, threadYear].filter(Boolean).join(' ');

  let carefulDates: CarefulDateItem[] = [];
  let eventCards: EventCardItem[] = [];

  for (const reply of assistantReplies) {
    if (Array.isArray(reply.carefulDates) && reply.carefulDates.length > 0) {
      carefulDates.push(...reply.carefulDates);
    }
    if (Array.isArray(reply.eventCards) && reply.eventCards.length > 0) {
      eventCards.push(...reply.eventCards);
    }
    if (
      (!reply.carefulDates || reply.carefulDates.length === 0 || !reply.eventCards || reply.eventCards.length === 0) &&
      typeof reply.content === 'string' &&
      reply.content.trim().length > 40
    ) {
      const parsed = parseResponseEventsAndReport(reply.content, domainCode);
      if (carefulDates.length === 0 && parsed.carefulDates.length > 0) {
        carefulDates.push(...parsed.carefulDates);
      }
      if (eventCards.length === 0 && parsed.events.length > 0) {
        eventCards.push(...parsed.events);
      }
    }
  }

  if (carefulDates.length === 0 && Array.isArray(fallback?.carefulDates)) {
    carefulDates = fallback.carefulDates;
  }
  if (eventCards.length === 0 && Array.isArray(fallback?.eventCards)) {
    eventCards = fallback.eventCards;
  }

  const watchOutEvents: WatchOutSyncPayloadItem[] = carefulDates.map((item, idx) => {
    const severity = item.severity || 'caution';
    const sevLabel = getSeverityLabel(severity);
    const itemDomain = (item.domain || defaultDomainLabel).trim();
    const rawDateLabel = (item.date || 'Upcoming window').trim();
    const { startDate, endDate, allDay } = parseEventWindow(
      rawDateLabel,
      threadMonth,
      threadYear,
    );
    const uid = buildDeterministicUid(
      'pa-watchout',
      `${reportId}|${idx}|${itemDomain}|${rawDateLabel}|${item.note}`,
    );
    const summary = `[${sevLabel}] ${itemDomain} (${providerLabel}) — WatchOut`;
    const description = [
      `Care Level: ${sevLabel}`,
      `Domain: ${itemDomain}`,
      `WatchOut Window: ${rawDateLabel}`,
      `Provider: ${providerAttribution}`,
      `Report: ${reportTitle}${periodLabel ? ` (${periodLabel})` : ''}`,
      '',
      'Guidance:',
      (item.note || 'Exercise extra care during this window.').trim(),
      '',
      `[PA-UID:${uid}]`,
    ].join('\n');

    return {
      uid,
      summary,
      description,
      startIso: startDate.toISOString(),
      endIso: endDate.toISOString(),
      allDay,
      severity,
      domain: itemDomain,
      providerLabel,
      rawDateLabel,
    };
  });

  const reminderCards: ReminderCardSyncPayloadItem[] = eventCards.map((card, idx) => {
    const whenLabel = (card.when || card.dateRange || card.timeframe || '').trim();
    const probabilityLabel = (card.probability || card.likelihood || '').trim();
    const category = (card.category || defaultDomainLabel).trim();
    const howText = (card.how || card.summary || '').trim();
    const uid = buildDeterministicUid(
      'pa-card',
      `${reportId}|${idx}|${card.title}|${whenLabel}|${category}`,
    );
    const parsedWindow = whenLabel
      ? parseEventWindow(whenLabel, threadMonth, threadYear)
      : null;

    const title = `${card.title.trim()} (${providerLabel})`;
    const body = [
      whenLabel ? `When: ${whenLabel}` : '',
      probabilityLabel ? `Probability: ${probabilityLabel}` : '',
      `Domain: ${category}`,
      `Provider: ${providerAttribution}`,
      `Report: ${reportTitle}${periodLabel ? ` (${periodLabel})` : ''}`,
      '',
      howText ? 'How it will happen:' : '',
      howText,
      '',
      `[PA-UID:${uid}]`,
    ]
      .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
      .join('\n')
      .trim();

    return {
      uid,
      title,
      body,
      dueIso: parsedWindow ? parsedWindow.startDate.toISOString() : null,
      priority: parsePriorityFromProbability(probabilityLabel),
      category,
      providerLabel,
      whenLabel,
      probabilityLabel,
    };
  });

  return {
    reportId,
    reportTitle,
    providerLabel,
    watchOutEvents,
    reminderCards,
  };
}

// ---------------------------------------------------------------------------
// macOS Native JXA Runner (osascript -l JavaScript -)
// Zero shell interpolation: static JXA reads JSON from PA_SYNC_PAYLOAD env.
// ---------------------------------------------------------------------------

function runOsaScriptJson<T>(scriptSource: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      reject(new Error('Native Calendar & Reminders automation is only available on macOS.'));
      return;
    }
    const child = execFile(
      'osascript',
      ['-l', 'JavaScript', '-'],
      {
        env: {
          ...process.env,
          PA_SYNC_PAYLOAD: JSON.stringify(payload),
        },
        timeout: 45000,
        maxBuffer: 4 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || err.message || 'osascript failed').trim();
          reject(
            new Error(
              `macOS Calendar/Reminders automation failed: ${detail}. Grant Calendar & Reminders automation permission in System Settings > Privacy & Security.`,
            ),
          );
          return;
        }
        try {
          const parsed = JSON.parse((stdout || '').trim() || '{}') as T;
          resolve(parsed);
        } catch {
          reject(new Error(`Unexpected response from macOS osascript: ${stdout}`));
        }
      },
    );
    child.stdin?.write(scriptSource);
    child.stdin?.end();
  });
}

const JXA_TEST_SCRIPT = `
ObjC.import('Foundation');
function run() {
  var calNames = [];
  var remNames = [];
  var calApp = Application('Calendar');
  var cals = calApp.calendars();
  for (var i = 0; i < cals.length; i++) {
    try {
      if (cals[i].writable()) calNames.push(cals[i].name());
    } catch (e) {}
  }
  var remApp = Application('Reminders');
  var lists = remApp.lists();
  for (var j = 0; j < lists.length; j++) {
    try {
      remNames.push(lists[j].name());
    } catch (e) {}
  }
  return JSON.stringify({ calendars: calNames, reminderLists: remNames });
}
`;

const JXA_SYNC_SCRIPT = `
ObjC.import('Foundation');
function run() {
  var rawEnv = $.NSProcessInfo.processInfo.environment.objectForKey('PA_SYNC_PAYLOAD');
  var payload = JSON.parse(ObjC.unwrap(rawEnv));
  var watchOutSynced = 0;
  var remindersSynced = 0;
  var usedCalendarName = '';
  var usedRemindersListName = '';

  if (payload.watchOutEvents && payload.watchOutEvents.length > 0) {
    var calApp = Application('Calendar');
    var cals = calApp.calendars();
    var targetCal = null;
    var desiredCal = (payload.calendarName || '').trim().toLowerCase();
    var writableCals = [];
    for (var i = 0; i < cals.length; i++) {
      try {
        if (!cals[i].writable()) continue;
        writableCals.push(cals[i]);
        if (desiredCal && (cals[i].name() || '').trim().toLowerCase() === desiredCal) {
          targetCal = cals[i];
          break;
        }
      } catch (e) {}
    }
    if (!targetCal && writableCals.length > 0) {
      var preferred = ['home', 'personal', 'calendar', 'work'];
      for (var p = 0; p < preferred.length && !targetCal; p++) {
        for (var k = 0; k < writableCals.length; k++) {
          if ((writableCals[k].name() || '').trim().toLowerCase() === preferred[p]) {
            targetCal = writableCals[k];
            break;
          }
        }
      }
      if (!targetCal) targetCal = writableCals[0];
    }
    if (!targetCal) {
      throw new Error('No writable calendar found in macOS Calendar.app.');
    }
    usedCalendarName = targetCal.name();

    for (var w = 0; w < payload.watchOutEvents.length; w++) {
      var ev = payload.watchOutEvents[w];
      var sDate = new Date(ev.startIso);
      var eDate = new Date(ev.endIso);
      var uidTag = '[PA-UID:' + ev.uid + ']';
      var dayBefore = new Date(sDate.getTime() - 36 * 3600 * 1000);
      var dayAfter = new Date(eDate.getTime() + 36 * 3600 * 1000);
      var matchedEvent = null;
      try {
        var candidates = targetCal.events.whose({
          _and: [
            { startDate: { _greaterThan: dayBefore } },
            { startDate: { _lessThan: dayAfter } }
          ]
        })();
        for (var c = 0; c < candidates.length; c++) {
          var desc = '';
          try { desc = candidates[c].description() || ''; } catch (errD) { desc = ''; }
          if (desc.indexOf(uidTag) !== -1) {
            matchedEvent = candidates[c];
            break;
          }
        }
      } catch (errQ) {}

      if (matchedEvent) {
        matchedEvent.summary = ev.summary;
        matchedEvent.startDate = sDate;
        matchedEvent.endDate = eDate;
        matchedEvent.description = ev.description;
        matchedEvent.alldayEvent = Boolean(ev.allDay);
      } else {
        var newEvt = calApp.Event({
          summary: ev.summary,
          startDate: sDate,
          endDate: eDate,
          description: ev.description,
          alldayEvent: Boolean(ev.allDay)
        });
        targetCal.events.push(newEvt);
      }
      watchOutSynced++;
    }
  }

  if (payload.reminderCards && payload.reminderCards.length > 0) {
    var remApp = Application('Reminders');
    var lists = remApp.lists();
    var targetList = null;
    var desiredList = (payload.remindersListName || '').trim().toLowerCase();
    for (var l = 0; l < lists.length; l++) {
      try {
        if (desiredList && (lists[l].name() || '').trim().toLowerCase() === desiredList) {
          targetList = lists[l];
          break;
        }
      } catch (e) {}
    }
    if (!targetList) {
      try { targetList = remApp.defaultList(); } catch (e) {}
    }
    if (!targetList && lists.length > 0) {
      targetList = lists[0];
    }
    if (!targetList) {
      throw new Error('No reminder list found in macOS Reminders.app.');
    }
    usedRemindersListName = targetList.name();

    var existingRems = [];
    try {
      existingRems = targetList.reminders.whose({ completed: false })();
    } catch (e) {
      existingRems = [];
    }

    for (var r = 0; r < payload.reminderCards.length; r++) {
      var card = payload.reminderCards[r];
      var remUidTag = '[PA-UID:' + card.uid + ']';
      var matchedRem = null;
      for (var er = 0; er < existingRems.length; er++) {
        var rBody = '';
        try { rBody = existingRems[er].body() || ''; } catch (e) { rBody = ''; }
        if (rBody.indexOf(remUidTag) !== -1) {
          matchedRem = existingRems[er];
          break;
        }
      }

      if (matchedRem) {
        matchedRem.name = card.title;
        matchedRem.body = card.body;
        matchedRem.priority = card.priority || 0;
        if (card.dueIso) {
          matchedRem.dueDate = new Date(card.dueIso);
        }
      } else {
        var props = {
          name: card.title,
          body: card.body,
          priority: card.priority || 0
        };
        if (card.dueIso) {
          props.dueDate = new Date(card.dueIso);
        }
        var newRem = remApp.Reminder(props);
        targetList.reminders.push(newRem);
      }
      remindersSynced++;
    }
  }

  return JSON.stringify({
    watchOutSynced: watchOutSynced,
    remindersSynced: remindersSynced,
    calendarName: usedCalendarName,
    remindersListName: usedRemindersListName
  });
}
`;

// ---------------------------------------------------------------------------
// Direct iCloud CalDAV Client (HTTPS https://caldav.icloud.com)
// Strictly validates Apple iCloud/Apple redirect hosts (SSRF-safe).
// ---------------------------------------------------------------------------

function isAllowedAppleCalDavUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'caldav.icloud.com' || host.endsWith('.icloud.com') || host.endsWith('.apple.com');
  } catch {
    return false;
  }
}

async function calDavFetch(
  targetUrl: string,
  authHeader: string,
  init: RequestInit,
  redirectDepth = 0,
): Promise<{ status: number; text: string; finalUrl: string }> {
  if (!isAllowedAppleCalDavUrl(targetUrl)) {
    throw new Error(`Refused non-iCloud CalDAV URL: ${targetUrl}`);
  }
  const response = await fetch(targetUrl, {
    ...init,
    redirect: 'manual',
    headers: {
      Authorization: authHeader,
      'User-Agent': 'PersonalAssistantWorkbench/1.0',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });

  if ([301, 302, 303, 307, 308].includes(response.status) && redirectDepth < 5) {
    const loc = response.headers.get('location');
    if (loc) {
      const nextUrl = new URL(loc, targetUrl).toString();
      return calDavFetch(nextUrl, authHeader, init, redirectDepth + 1);
    }
  }

  const text = await response.text();
  return { status: response.status, text, finalUrl: targetUrl };
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractFirstHrefTag(xml: string, tagLocalName: string): string | null {
  const blockRegex = new RegExp(
    `<(?:[a-z0-9_-]+:)?${tagLocalName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-z0-9_-]+:)?${tagLocalName}>`,
    'i',
  );
  const blockMatch = xml.match(blockRegex);
  if (!blockMatch) return null;
  const hrefMatch = blockMatch[1].match(
    /<(?:[a-z0-9_-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?href>/i,
  );
  return hrefMatch ? decodeXmlEntities(hrefMatch[1].trim()) : null;
}

interface CalDavCollection {
  url: string;
  displayName: string;
  supportsVEvent: boolean;
  supportsVTodo: boolean;
}

async function discoverICloudCollections(
  appleId: string,
  appPassword: string,
): Promise<{
  calendarCollections: CalDavCollection[];
  reminderCollections: CalDavCollection[];
}> {
  const authHeader = `Basic ${Buffer.from(`${appleId}:${appPassword}`, 'utf-8').toString('base64')}`;

  // 1. Discover current-user-principal
  const principalRes = await calDavFetch('https://caldav.icloud.com/', authHeader, {
    method: 'PROPFIND',
    headers: {
      Depth: '0',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:current-user-principal/></d:prop>
</d:propfind>`,
  });

  if (principalRes.status === 401 || principalRes.status === 403) {
    throw new Error(
      'iCloud CalDAV rejected credentials (HTTP 401/403). Verify your Apple ID email and App-Specific Password from account.apple.com.',
    );
  }
  if (principalRes.status >= 400) {
    throw new Error(`iCloud CalDAV principal lookup returned HTTP ${principalRes.status}.`);
  }

  const principalHref = extractFirstHrefTag(principalRes.text, 'current-user-principal');
  if (!principalHref) {
    throw new Error('Could not discover iCloud current-user-principal URL.');
  }
  const principalUrl = new URL(principalHref, principalRes.finalUrl).toString();

  // 2. Discover calendar-home-set
  const homeRes = await calDavFetch(principalUrl, authHeader, {
    method: 'PROPFIND',
    headers: {
      Depth: '0',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-home-set/></d:prop>
</d:propfind>`,
  });

  if (homeRes.status >= 400) {
    throw new Error(`iCloud CalDAV calendar-home-set lookup returned HTTP ${homeRes.status}.`);
  }

  const homeHref = extractFirstHrefTag(homeRes.text, 'calendar-home-set');
  if (!homeHref) {
    throw new Error('Could not discover iCloud calendar-home-set URL.');
  }
  const homeUrl = new URL(homeHref, homeRes.finalUrl).toString();

  // 3. List Depth:1 collections
  const listRes = await calDavFetch(homeUrl, authHeader, {
    method: 'PROPFIND',
    headers: {
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
    <c:supported-calendar-component-set/>
  </d:prop>
</d:propfind>`,
  });

  if (listRes.status >= 400) {
    throw new Error(`iCloud CalDAV collection list returned HTTP ${listRes.status}.`);
  }

  const responseBlocks =
    listRes.text.match(/<(?:[a-z0-9_-]+:)?response\b[\s\S]*?<\/(?:[a-z0-9_-]+:)?response>/gi) ||
    [];

  const calendarCollections: CalDavCollection[] = [];
  const reminderCollections: CalDavCollection[] = [];

  for (const block of responseBlocks) {
    const hrefMatch = block.match(
      /<(?:[a-z0-9_-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?href>/i,
    );
    if (!hrefMatch) continue;
    const colUrl = new URL(decodeXmlEntities(hrefMatch[1].trim()), listRes.finalUrl).toString();
    if (colUrl.replace(/\/+$/, '') === homeUrl.replace(/\/+$/, '')) continue;
    if (!/<(?:[a-z0-9_-]+:)?calendar\b/i.test(block)) continue;
    if (/(?:inbox|outbox|notification)/i.test(colUrl)) continue;

    const nameMatch = block.match(
      /<(?:[a-z0-9_-]+:)?displayname\b[^>]*>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?displayname>/i,
    );
    const displayName = nameMatch ? decodeXmlEntities(nameMatch[1].trim()) : 'Calendar';
    const supportsVEvent = /name=["']VEVENT["']/i.test(block);
    const supportsVTodo = /name=["']VTODO["']/i.test(block);

    const item: CalDavCollection = {
      url: colUrl.endsWith('/') ? colUrl : `${colUrl}/`,
      displayName,
      supportsVEvent,
      supportsVTodo,
    };

    if (supportsVEvent) calendarCollections.push(item);
    if (supportsVTodo) reminderCollections.push(item);
  }

  return { calendarCollections, reminderCollections };
}

function formatIcsUtcStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function formatIcsLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function formatIcsLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function escapeIcsText(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function buildVEventIcs(ev: WatchOutSyncPayloadItem): string {
  const start = new Date(ev.startIso);
  const end = new Date(ev.endIso);
  const dtStamp = formatIcsUtcStamp(new Date());

  let dtStartLine: string;
  let dtEndLine: string;
  if (ev.allDay) {
    const endExclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    dtStartLine = `DTSTART;VALUE=DATE:${formatIcsLocalDate(start)}`;
    dtEndLine = `DTEND;VALUE=DATE:${formatIcsLocalDate(endExclusive)}`;
  } else {
    dtStartLine = `DTSTART:${formatIcsLocalDateTime(start)}`;
    dtEndLine = `DTEND:${formatIcsLocalDateTime(end)}`;
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Personal Assistant Workbench//Apple Sync//EN',
    'BEGIN:VEVENT',
    `UID:${ev.uid}@whatsup.local`,
    `DTSTAMP:${dtStamp}`,
    dtStartLine,
    dtEndLine,
    `SUMMARY:${escapeIcsText(ev.summary)}`,
    `DESCRIPTION:${escapeIcsText(ev.description)}`,
    `CATEGORIES:${escapeIcsText(`${ev.domain},${ev.providerLabel},WatchOut`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function buildVTodoIcs(card: ReminderCardSyncPayloadItem): string {
  const dtStamp = formatIcsUtcStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Personal Assistant Workbench//Apple Sync//EN',
    'BEGIN:VTODO',
    `UID:${card.uid}@whatsup.local`,
    `DTSTAMP:${dtStamp}`,
    `SUMMARY:${escapeIcsText(card.title)}`,
    `DESCRIPTION:${escapeIcsText(card.body)}`,
    `PRIORITY:${card.priority || 0}`,
    `CATEGORIES:${escapeIcsText(`${card.category},${card.providerLabel}`)}`,
    'STATUS:NEEDS-ACTION',
  ];

  if (card.dueIso) {
    const due = new Date(card.dueIso);
    lines.push(`DUE;VALUE=DATE:${formatIcsLocalDate(due)}`);
  }

  lines.push('END:VTODO', 'END:VCALENDAR', '');
  return lines.join('\r\n');
}

function pickTargetCollection(
  collections: CalDavCollection[],
  preferredName?: string,
  fallbackNames: string[] = [],
): CalDavCollection | null {
  if (collections.length === 0) return null;
  const desired = (preferredName || '').trim().toLowerCase();
  if (desired) {
    const match = collections.find((c) => c.displayName.trim().toLowerCase() === desired);
    if (match) return match;
  }
  for (const name of fallbackNames) {
    const match = collections.find((c) => c.displayName.trim().toLowerCase() === name);
    if (match) return match;
  }
  return collections[0];
}

async function syncViaICloudCalDav(params: {
  appleId: string;
  appPassword: string;
  calendarName?: string;
  remindersListName?: string;
  watchOutEvents: WatchOutSyncPayloadItem[];
  reminderCards: ReminderCardSyncPayloadItem[];
}): Promise<{
  watchOutSynced: number;
  remindersSynced: number;
  calendarName?: string;
  remindersListName?: string;
  warnings: string[];
}> {
  const { appleId, appPassword, watchOutEvents, reminderCards } = params;
  const warnings: string[] = [];
  const { calendarCollections, reminderCollections } = await discoverICloudCollections(
    appleId,
    appPassword,
  );
  const authHeader = `Basic ${Buffer.from(`${appleId}:${appPassword}`, 'utf-8').toString('base64')}`;

  let watchOutSynced = 0;
  let remindersSynced = 0;
  let usedCalName: string | undefined;
  let usedRemName: string | undefined;

  if (watchOutEvents.length > 0) {
    const targetCal = pickTargetCollection(calendarCollections, params.calendarName, [
      'home',
      'personal',
      'calendar',
      'work',
    ]);
    if (!targetCal) {
      warnings.push('No writable VEVENT calendar collection was returned by iCloud CalDAV.');
    } else {
      usedCalName = targetCal.displayName;
      for (const ev of watchOutEvents) {
        const icsUrl = `${targetCal.url}${encodeURIComponent(ev.uid)}.ics`;
        const putRes = await calDavFetch(icsUrl, authHeader, {
          method: 'PUT',
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
          },
          body: buildVEventIcs(ev),
        });
        if (putRes.status >= 200 && putRes.status < 300) {
          watchOutSynced += 1;
        } else {
          warnings.push(`Calendar PUT for "${ev.summary}" returned HTTP ${putRes.status}.`);
        }
      }
    }
  }

  if (reminderCards.length > 0) {
    const targetRem = pickTargetCollection(reminderCollections, params.remindersListName, [
      'reminders',
      'tasks',
      'personal',
    ]);
    if (!targetRem) {
      warnings.push(
        'iCloud CalDAV did not expose a VTODO Reminders collection (Apple restricts CalDAV VTODO on upgraded Reminders accounts). Use "Auto" or "MacBook Calendar & Reminders" mode on macOS to sync Event Cards directly into Reminders.app.',
      );
    } else {
      usedRemName = targetRem.displayName;
      for (const card of reminderCards) {
        const icsUrl = `${targetRem.url}${encodeURIComponent(card.uid)}.ics`;
        const putRes = await calDavFetch(icsUrl, authHeader, {
          method: 'PUT',
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
          },
          body: buildVTodoIcs(card),
        });
        if (putRes.status >= 200 && putRes.status < 300) {
          remindersSynced += 1;
        } else {
          warnings.push(`Reminders PUT for "${card.title}" returned HTTP ${putRes.status}.`);
        }
      }
    }
  }

  return {
    watchOutSynced,
    remindersSynced,
    calendarName: usedCalName,
    remindersListName: usedRemName,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Public Entry Points
// ---------------------------------------------------------------------------

function resolveEffectiveCredentials(config?: Partial<AppleSyncConfig>): {
  mode: AppleSyncMode;
  appleId: string;
  appPassword: string;
  calendarName: string;
  remindersListName: string;
} {
  const mode: AppleSyncMode =
    config?.mode === 'macos' || config?.mode === 'caldav' ? config.mode : 'auto';
  const appleId = (config?.appleId || process.env.ICLOUD_APPLE_ID || '').trim();
  const appPassword = (config?.appPassword || process.env.ICLOUD_APP_PASSWORD || '').trim();
  const calendarName = (config?.calendarName || '').trim();
  const remindersListName = (config?.remindersListName || '').trim();
  return { mode, appleId, appPassword, calendarName, remindersListName };
}

export async function testAppleSyncConnection(
  config?: Partial<AppleSyncConfig>,
): Promise<{
  ok: boolean;
  transport: 'macos' | 'caldav';
  message: string;
  calendars?: string[];
  reminderLists?: string[];
}> {
  const resolved = resolveEffectiveCredentials(config);
  const useMacOs =
    resolved.mode === 'macos' ||
    (resolved.mode === 'auto' && process.platform === 'darwin');

  if (useMacOs) {
    if (process.platform !== 'darwin') {
      return {
        ok: false,
        transport: 'macos',
        message:
          'MacBook native Calendar & Reminders sync requires running the Node.js server on macOS (darwin). Switch to iCloud CalDAV mode if running from a non-Mac host.',
      };
    }
    const info = await runOsaScriptJson<{ calendars?: string[]; reminderLists?: string[] }>(
      JXA_TEST_SCRIPT,
      {},
    );
    const cals = Array.isArray(info.calendars) ? info.calendars : [];
    const rems = Array.isArray(info.reminderLists) ? info.reminderLists : [];
    return {
      ok: true,
      transport: 'macos',
      message: `Connected to macOS Calendar (${cals.length} writable) & Reminders (${rems.length} lists).`,
      calendars: cals,
      reminderLists: rems,
    };
  }

  if (!resolved.appleId || !resolved.appPassword) {
    return {
      ok: false,
      transport: 'caldav',
      message:
        'Enter your iCloud Apple ID and App-Specific Password (from account.apple.com) to test iCloud CalDAV.',
    };
  }

  const { calendarCollections, reminderCollections } = await discoverICloudCollections(
    resolved.appleId,
    resolved.appPassword,
  );
  return {
    ok: true,
    transport: 'caldav',
    message: `Connected to iCloud CalDAV (${calendarCollections.length} calendar(s), ${reminderCollections.length} VTODO reminder list(s)).`,
    calendars: calendarCollections.map((c) => c.displayName),
    reminderLists: reminderCollections.map((r) => r.displayName),
  };
}

export async function syncReportToApple(params: {
  record: RatedThreadRecord | null;
  fallback?: AppleSyncFallbackPayload;
  config?: Partial<AppleSyncConfig>;
}): Promise<AppleSyncResult> {
  const resolved = resolveEffectiveCredentials(params.config);
  const extracted = buildSyncItemsFromReport(params.record, params.fallback);

  if (extracted.watchOutEvents.length === 0 && extracted.reminderCards.length === 0) {
    return {
      ok: false,
      transport: process.platform === 'darwin' ? 'macos' : 'caldav',
      providerLabel: extracted.providerLabel,
      reportTitle: extracted.reportTitle,
      watchOutSyncedCount: 0,
      eventCardsSyncedCount: 0,
      error:
        'No WatchOut dates or Event Cards were found in this report to sync.',
    };
  }

  const useMacOsNative =
    resolved.mode === 'macos' ||
    (resolved.mode === 'auto' && process.platform === 'darwin');

  if (useMacOsNative) {
    if (process.platform !== 'darwin') {
      return {
        ok: false,
        transport: 'macos',
        providerLabel: extracted.providerLabel,
        reportTitle: extracted.reportTitle,
        watchOutSyncedCount: 0,
        eventCardsSyncedCount: 0,
        error:
          'MacBook native Calendar & Reminders sync requires running on macOS. Configure iCloud CalDAV credentials in Settings if running from another OS.',
      };
    }

    const osaRes = await runOsaScriptJson<{
      watchOutSynced?: number;
      remindersSynced?: number;
      calendarName?: string;
      remindersListName?: string;
    }>(JXA_SYNC_SCRIPT, {
      calendarName: resolved.calendarName,
      remindersListName: resolved.remindersListName,
      watchOutEvents: extracted.watchOutEvents,
      reminderCards: extracted.reminderCards,
    });

    return {
      ok: true,
      transport: 'macos',
      providerLabel: extracted.providerLabel,
      reportTitle: extracted.reportTitle,
      watchOutSyncedCount: osaRes.watchOutSynced ?? extracted.watchOutEvents.length,
      eventCardsSyncedCount: osaRes.remindersSynced ?? extracted.reminderCards.length,
      calendarName: osaRes.calendarName || undefined,
      remindersListName: osaRes.remindersListName || undefined,
    };
  }

  if (!resolved.appleId || !resolved.appPassword) {
    return {
      ok: false,
      transport: 'caldav',
      providerLabel: extracted.providerLabel,
      reportTitle: extracted.reportTitle,
      watchOutSyncedCount: 0,
      eventCardsSyncedCount: 0,
      error:
        'iCloud Apple ID and App-Specific Password are required in Settings -> Apple Sync (or run Node.js directly on your MacBook for native Calendar & Reminders sync).',
    };
  }

  const calDavRes = await syncViaICloudCalDav({
    appleId: resolved.appleId,
    appPassword: resolved.appPassword,
    calendarName: resolved.calendarName,
    remindersListName: resolved.remindersListName,
    watchOutEvents: extracted.watchOutEvents,
    reminderCards: extracted.reminderCards,
  });

  // If iCloud CalDAV couldn't sync Reminders (due to upgraded Reminders VTODO restriction) AND we are on macOS,
  // automatically complete the Event Cards sync via native macOS Reminders.app!
  let finalRemindersSynced = calDavRes.remindersSynced;
  let finalRemListName = calDavRes.remindersListName;
  let warnings = calDavRes.warnings;
  let transport: AppleSyncResult['transport'] = 'caldav';

  if (
    process.platform === 'darwin' &&
    extracted.reminderCards.length > 0 &&
    calDavRes.remindersSynced === 0
  ) {
    try {
      const remFallback = await runOsaScriptJson<{
        remindersSynced?: number;
        remindersListName?: string;
      }>(JXA_SYNC_SCRIPT, {
        calendarName: resolved.calendarName,
        remindersListName: resolved.remindersListName,
        watchOutEvents: [],
        reminderCards: extracted.reminderCards,
      });
      if ((remFallback.remindersSynced ?? 0) > 0) {
        finalRemindersSynced = remFallback.remindersSynced ?? 0;
        finalRemListName = remFallback.remindersListName || finalRemListName;
        transport = 'hybrid';
        warnings = warnings.filter((w) => !w.includes('VTODO'));
      }
    } catch {
      // Keep original CalDAV warning
    }
  }

  return {
    ok: calDavRes.watchOutSynced > 0 || finalRemindersSynced > 0,
    transport,
    providerLabel: extracted.providerLabel,
    reportTitle: extracted.reportTitle,
    watchOutSyncedCount: calDavRes.watchOutSynced,
    eventCardsSyncedCount: finalRemindersSynced,
    calendarName: calDavRes.calendarName,
    remindersListName: finalRemListName,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

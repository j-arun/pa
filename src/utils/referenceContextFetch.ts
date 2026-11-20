import type { ReferenceContextApiConfig } from '../types/workbench';

export function buildReferenceContextUrl(
  apiConfig: ReferenceContextApiConfig,
  month: number,
  year: number,
  domain?: string,
): string {
  const rawHost = (apiConfig.hostname || 'localhost').trim() || 'localhost';
  const hasScheme = /^https?:\/\//i.test(rawHost);
  const baseHost = hasScheme ? rawHost.replace(/\/+$/, '') : `http://${rawHost}`;
  const rawPath = (apiConfig.path || '/api/content').trim() || '/api/content';
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const rawQuery = (
    apiConfig.queryTemplate || 'date={month}/{year}&variant=compact'
  ).trim();
  const normalizedDomain = (domain || '').trim().toLowerCase();

  let renderedQuery = rawQuery
    .replace(/^\?/, '')
    .replace(/\{month\}/gi, String(month))
    .replace(/\{year\}/gi, String(year));

  if (normalizedDomain) {
    if (/\{domain\}/i.test(renderedQuery)) {
      renderedQuery = renderedQuery.replace(
        /\{domain\}/gi,
        encodeURIComponent(normalizedDomain),
      );
    } else if (!/(?:^|&)domain=/i.test(renderedQuery)) {
      renderedQuery = renderedQuery
        ? `${renderedQuery}&domain=${encodeURIComponent(normalizedDomain)}`
        : `domain=${encodeURIComponent(normalizedDomain)}`;
    }
  } else {
    renderedQuery = renderedQuery
      .replace(/&?domain=\{domain\}/gi, '')
      .replace(/^&+/, '');
  }

  try {
    const urlObj = new URL(baseHost);
    const portNum = Number(apiConfig.port);
    if (!urlObj.port && Number.isFinite(portNum) && portNum > 0 && portNum <= 65535) {
      urlObj.port = String(Math.round(portNum));
    }
    urlObj.pathname = normalizedPath;
    urlObj.search = renderedQuery ? `?${renderedQuery}` : '';
    return urlObj.toString();
  } catch {
    const portPart =
      apiConfig.port && !/:\d+$/.test(baseHost) ? `:${apiConfig.port}` : '';
    return `${baseHost}${portPart}${normalizedPath}${renderedQuery ? `?${renderedQuery}` : ''}`;
  }
}

function extractPlainTextResponse(contentType: string, rawBody: string): string {
  if (!contentType.includes('application/json')) {
    return rawBody;
  }
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.content === 'string') return obj.content;
      if (typeof obj.text === 'string') return obj.text;
      if (typeof obj.data === 'string') return obj.data;
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    return rawBody;
  }
  return rawBody;
}

export interface ReferenceContextFetchSuccess {
  text: string;
  url: string;
  fetchedAt: string;
  via: 'proxy' | 'browser';
  domain?: string;
}

export async function fetchReferenceContextFromApi({
  month,
  year,
  domain,
  apiConfig,
  signal,
}: {
  month: number;
  year: number;
  domain?: string;
  apiConfig: ReferenceContextApiConfig;
  signal?: AbortSignal;
}): Promise<ReferenceContextFetchSuccess> {
  const normalizedDomain = (domain || '').trim().toLowerCase() || undefined;
  const targetUrl = buildReferenceContextUrl(apiConfig, month, year, normalizedDomain);
  let proxyErrorMessage = `Reference Context REST endpoint is not available at ${targetUrl}.`;

  // 1. Try server-side proxy first (avoids CORS for reachable hosts)
  try {
    const response = await fetch('/api/reference-context/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ month, year, domain: normalizedDomain, apiConfig }),
    });
    const payload = (await response.json()) as {
      text?: string;
      url?: string;
      fetchedAt?: string;
      domain?: string;
      error?: string;
    };

    if (response.ok && !payload.error && typeof payload.text === 'string') {
      return {
        text: payload.text,
        url: payload.url || targetUrl,
        fetchedAt: payload.fetchedAt || new Date().toISOString(),
        via: 'proxy',
        domain: payload.domain || normalizedDomain,
      };
    }

    if (payload.error) {
      proxyErrorMessage = payload.error;
    }
  } catch (err) {
    if (
      signal?.aborted ||
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      throw err;
    }
    if (err instanceof Error && err.message) {
      proxyErrorMessage = err.message;
    }
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // 2. Direct browser fallback (crucial when workbench runs in Cloud Run and the user's API runs on their local PC's localhost)
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  signal?.addEventListener('abort', onParentAbort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), 7000);
  try {
    const directRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/plain, application/json;q=0.8, */*;q=0.5',
      },
      signal: controller.signal,
    });

    const contentType = (directRes.headers.get('content-type') || '').toLowerCase();
    const rawBody = await directRes.text();
    const looksLikeSpaShell =
      contentType.includes('text/html') &&
      (rawBody.includes('<div id="root"') ||
        rawBody.includes('/src/main.tsx') ||
        rawBody.includes("<title>What's up") ||
        rawBody.includes('<title>Personal Assistant'));

    if (!looksLikeSpaShell && directRes.ok) {
      const plainText = extractPlainTextResponse(contentType, rawBody);
      return {
        text: plainText,
        url: targetUrl,
        fetchedAt: new Date().toISOString(),
        via: 'browser',
        domain: normalizedDomain,
      };
    }
  } catch (err) {
    if (
      signal?.aborted ||
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      throw err;
    }
    // Ignore direct fallback failure (e.g., CORS / mixed content / server offline) and surface clear proxy error
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onParentAbort);
  }

  throw new Error(proxyErrorMessage);
}

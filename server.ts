import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import type {
  AnyAdapterId,
  ConversationScope,
  RatedThreadRecord,
  WorkbenchSettings,
} from './src/types/workbench.ts';
import { adapterRegistry } from './server/adapters/registry.ts';
import type { AdapterRuntimeOptions, ChatHistoryItem } from './server/adapters/types.ts';
import {
  detectWindowsAccountProfile,
  readLocalConfigFile,
  writeLocalConfigFile,
} from './server/configStore.ts';
import {
  deleteStoredReport,
  listStoredReports,
  readStoredReportHtml,
  saveStoredReport,
  updateStoredReportMetadata,
  type ReportMetadataUpdatePayload,
} from './server/reportStore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/config', (_req, res) => {
    try {
      const result = readLocalConfigFile();
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to read workbench.config.json.',
      });
    }
  });

  app.put('/api/config', (req, res) => {
    try {
      const next = (req.body || {}) as Partial<WorkbenchSettings>;
      const result = writeLocalConfigFile(next);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to write workbench.config.json.',
      });
    }
  });

  app.get('/api/reports', (req, res) => {
    try {
      const queryDir =
        typeof req.query.dir === 'string' && req.query.dir.trim()
          ? req.query.dir.trim()
          : readLocalConfigFile().config.reportsDir;
      const result = listStoredReports(queryDir);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to list reports from local filesystem.',
      });
    }
  });

  app.get('/api/reports/:id/html', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.id || '');
      const queryDir =
        typeof req.query.dir === 'string' && req.query.dir.trim()
          ? req.query.dir.trim()
          : readLocalConfigFile().config.reportsDir;
      const result = readStoredReportHtml(reportId, queryDir);
      if (!result) {
        return res.status(404).json({ error: 'Report HTML file not found on disk.' });
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to read report HTML from local filesystem.',
      });
    }
  });

  app.put('/api/reports/:id', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.id || '');
      const { record, html, reportsDir } = req.body as {
        record?: RatedThreadRecord;
        html?: string;
        reportsDir?: string;
      };
      if (!record || !Array.isArray(record.turns)) {
        return res.status(400).json({ error: 'Valid report record is required.' });
      }
      const targetDir =
        (typeof reportsDir === 'string' && reportsDir.trim()) ||
        readLocalConfigFile().config.reportsDir;
      const saved = saveStoredReport({ ...record, id: reportId || record.id }, targetDir, html);
      return res.json(saved);
    } catch (err) {
      return res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to save report to local filesystem.',
      });
    }
  });

  app.delete('/api/reports/:id', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.id || '');
      const queryDir =
        typeof req.query.dir === 'string' && req.query.dir.trim()
          ? req.query.dir.trim()
          : readLocalConfigFile().config.reportsDir;
      const result = deleteStoredReport(reportId, queryDir);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to delete report from local filesystem.',
      });
    }
  });

  app.patch('/api/reports/:id', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.id || '');
      const { name, comment, moveTarget, reportsDir } = req.body as {
        name?: string;
        comment?: string;
        moveTarget?: ReportMetadataUpdatePayload['moveTarget'];
        reportsDir?: string;
      };
      const hasName = typeof name === 'string' && name.trim().length > 0;
      const hasComment = typeof comment === 'string';
      const hasMove = Boolean(
        moveTarget &&
          moveTarget.threadMonth &&
          Number.isFinite(Number(moveTarget.threadYear)) &&
          moveTarget.promptDomain &&
          moveTarget.adapterId,
      );
      if (!hasName && !hasComment && !hasMove) {
        return res
          .status(400)
          .json({ error: 'Provide a report name, comment, or move target.' });
      }
      const targetDir =
        (typeof reportsDir === 'string' && reportsDir.trim()) ||
        readLocalConfigFile().config.reportsDir;
      const result = updateStoredReportMetadata(
        reportId,
        {
          ...(hasName ? { name } : {}),
          ...(hasComment ? { comment } : {}),
          ...(hasMove ? { moveTarget } : {}),
        },
        targetDir,
      );
      if (!result) {
        return res.status(404).json({ error: 'Report not found on disk.' });
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to update report on local filesystem.',
      });
    }
  });

  app.get('/api/profile/windows', (_req, res) => {
    try {
      return res.json(detectWindowsAccountProfile());
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to detect OS account profile.',
      });
    }
  });

  app.get('/api/adapters', (_req, res) => {
    res.json({
      adapters: adapterRegistry.listSummaries(),
    });
  });

  app.post('/api/adapters/health', async (req, res) => {
    try {
      const { adapterId, options, apiKey } = req.body as {
        adapterId?: AnyAdapterId;
        options?: AdapterRuntimeOptions;
        apiKey?: string;
      };
      if (!adapterId) {
        return res.status(400).json({ error: 'adapterId is required.' });
      }
      const adapter = adapterRegistry.get(adapterId);
      const requestApiKey =
        (typeof apiKey === 'string' ? apiKey.trim() : '') || req.get('x-api-key')?.trim();
      const requestOptions =
        requestApiKey && adapter.scope === 'public'
          ? { ...options, apiKey: requestApiKey }
          : options;
      const result = await adapter.healthCheck(requestOptions);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to inspect adapter health.',
      });
    }
  });

  app.post('/api/ollama/models', async (req, res) => {
    try {
      const { baseUrl } = req.body as { baseUrl?: string };
      const models = await adapterRegistry.ollama.listModels({ ollamaBaseUrl: baseUrl });
      return res.json({ models });
    } catch (err) {
      return res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to query Windows Ollama /api/tags endpoint.',
      });
    }
  });

  app.post('/api/ollama/unload', async (req, res) => {
    try {
      const { baseUrl, model } = req.body as { baseUrl?: string; model?: string };
      const result = await adapterRegistry.ollama.unloadModels({
        ollamaBaseUrl: baseUrl,
        model,
      });
      return res.json(result);
    } catch (err) {
      return res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to unload Ollama model memory.',
      });
    }
  });

  app.post('/api/chat', async (req, res) => {
    req.setTimeout(0);
    res.setTimeout(0);
    try {
      const { scope, adapterId, message, history, options, apiKey } = req.body as {
        scope?: ConversationScope;
        adapterId?: AnyAdapterId;
        message?: string;
        history?: ChatHistoryItem[];
        options?: AdapterRuntimeOptions;
        apiKey?: string;
      };

      if (scope !== 'private' && scope !== 'public') {
        return res.status(400).json({ error: 'scope must be "private" or "public".' });
      }

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'message cannot be empty.' });
      }

      const adapter = adapterRegistry.resolve(scope, adapterId);
      const safeHistory: ChatHistoryItem[] = Array.isArray(history)
        ? history
            .filter(
              (item) =>
                item &&
                (item.role === 'user' || item.role === 'assistant') &&
                typeof item.content === 'string' &&
                item.content.trim().length > 0,
            )
            .slice(-24)
        : [];
      const requestApiKey =
        (typeof apiKey === 'string' ? apiKey.trim() : '') || req.get('x-api-key')?.trim();
      const requestOptions =
        requestApiKey && scope === 'public'
          ? { ...options, apiKey: requestApiKey }
          : options || {};

      let clientClosed = false;
      res.on('close', () => {
        if (!res.writableEnded) {
          clientClosed = true;
        }
      });

      const reply = await adapter.sendMessage({
        message: message.trim(),
        history: safeHistory,
        options: requestOptions,
      });

      if (clientClosed || res.writableEnded || res.headersSent) {
        return;
      }
      return res.json(reply);
    } catch (err) {
      if (res.closed || res.writableEnded || res.headersSent) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Adapter request failed.';
      const status =
        message.includes('not configured') || message.includes('No Private Ollama model')
          ? 400
          : 502;
      return res.status(status).json({ error: message });
    }
  });

  app.post('/api/reference-context/fetch', async (req, res) => {
    try {
      const { month, year, domain, apiConfig } = req.body as {
        month?: number;
        year?: number;
        domain?: string;
        apiConfig?: {
          hostname?: string;
          port?: number;
          path?: string;
          queryTemplate?: string;
        };
      };

      const monthNum = Number(month);
      const yearNum = Number(year);
      if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ error: 'Month must be between 1 and 12.' });
      }
      if (!Number.isInteger(yearNum) || yearNum < 1990 || yearNum > 2090) {
        return res.status(400).json({ error: 'Year must be between 1990 and 2090.' });
      }

      const normalizedDomain =
        typeof domain === 'string' ? domain.trim().toLowerCase() : '';

      const saved = readLocalConfigFile().config.referenceContextApi;
      const rawHost = (apiConfig?.hostname ?? saved.hostname ?? 'localhost').trim();
      const rawPort = Number(apiConfig?.port ?? saved.port ?? 3000);
      const rawPath = (apiConfig?.path ?? saved.path ?? '/api/content').trim();
      const rawQuery = (
        apiConfig?.queryTemplate ??
        saved.queryTemplate ??
        'date={month}/{year}&variant=compact'
      ).trim();

      if (!rawHost) {
        return res.status(400).json({
          error: 'Reference Context API hostname is required in Settings.',
        });
      }

      const hasScheme = /^https?:\/\//i.test(rawHost);
      const baseHost = hasScheme ? rawHost.replace(/\/+$/, '') : `http://${rawHost}`;
      const urlObj = new URL(baseHost);
      if (!urlObj.port && Number.isFinite(rawPort) && rawPort > 0 && rawPort <= 65535) {
        urlObj.port = String(Math.round(rawPort));
      }
      const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
      urlObj.pathname = normalizedPath;

      let renderedQuery = rawQuery
        .replace(/^\?/, '')
        .replace(/\{month\}/gi, String(monthNum))
        .replace(/\{year\}/gi, String(yearNum));

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

      urlObj.search = renderedQuery ? `?${renderedQuery}` : '';
      const targetUrl = urlObj.toString();

      let upstream: Response;
      try {
        upstream = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            Accept: 'text/plain, application/json;q=0.8, */*;q=0.5',
          },
          signal: AbortSignal.timeout(8000),
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'Connection failed.';
        return res.status(502).json({
          error: `Reference Context REST endpoint is not available at ${targetUrl} (${detail}). Start your Reference Context API server or verify Hostname & Port in Settings.`,
          url: targetUrl,
        });
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      const rawBody = await upstream.text();

      // Detect hitting Vite / Express SPA HTML fallback (e.g., localhost:3000 when external API is not running)
      const looksLikeSpaShell =
        contentType.includes('text/html') &&
        (rawBody.includes('<div id="root"') ||
          rawBody.includes('/src/main.tsx') ||
          rawBody.includes("<title>What's up") ||
          rawBody.includes('<title>Personal Assistant'));

      if (looksLikeSpaShell) {
        return res.status(502).json({
          error: `Reference Context REST endpoint is not available at ${targetUrl}. The server returned the workbench web page instead of /api/content plain text. Please start your external Reference Context API or update Hostname & Port in Settings.`,
          url: targetUrl,
        });
      }

      if (!upstream.ok) {
        return res.status(502).json({
          error: `Reference Context REST endpoint at ${targetUrl} returned HTTP ${upstream.status}. Please verify the endpoint is running and reachable.`,
          url: targetUrl,
        });
      }

      let plainText = rawBody;
      if (contentType.includes('application/json')) {
        try {
          const parsed = JSON.parse(rawBody) as unknown;
          if (typeof parsed === 'string') {
            plainText = parsed;
          } else if (parsed && typeof parsed === 'object') {
            const obj = parsed as Record<string, unknown>;
            if (typeof obj.content === 'string') plainText = obj.content;
            else if (typeof obj.text === 'string') plainText = obj.text;
            else if (typeof obj.data === 'string') plainText = obj.data;
            else plainText = JSON.stringify(parsed, null, 2);
          }
        } catch {
          plainText = rawBody;
        }
      }

      return res.json({
        text: plainText,
        url: targetUrl,
        fetchedAt: new Date().toISOString(),
        domain: normalizedDomain || undefined,
      });
    } catch (err) {
      return res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unexpected error calling Reference Context API.',
      });
    }
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const httpServer = app.listen(port, '0.0.0.0', () => {
    console.log(`Fluent Personal Assistant Workbench listening on http://0.0.0.0:${port}`);
  });
  httpServer.timeout = 0;
  httpServer.keepAliveTimeout = 0;
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 0;
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

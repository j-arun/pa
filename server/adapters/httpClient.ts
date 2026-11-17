import http from 'node:http';
import https from 'node:https';

export interface HttpJsonResult {
  statusCode: number;
  bodyText: string;
}

export function postJsonConfigurable(
  targetUrl: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
  timeoutSeconds = 0,
): Promise<HttpJsonResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const jsonPayload = Buffer.from(JSON.stringify(body), 'utf8');
    const client = parsed.protocol === 'https:' ? https : http;
    const timeoutMs = timeoutSeconds > 0 ? Math.round(timeoutSeconds * 1000) : 0;

    const req = client.request(
      parsed,
      {
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(jsonPayload.byteLength),
          ...extraHeaders,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 500,
            bodyText: Buffer.concat(chunks).toString('utf8'),
          });
        });
        res.on('error', reject);
      },
    );

    req.on('socket', (socket) => {
      socket.setKeepAlive(true, 15000);
      if (timeoutMs === 0) {
        socket.setTimeout(0);
      }
    });

    req.setTimeout(timeoutMs, () => {
      if (timeoutMs > 0) {
        req.destroy(
          new Error(
            `Configured query timeout of ${timeoutSeconds}s elapsed. Set Request Timeout to 'No Timeout (Unlimited)' in Settings for full-throttle queries.`,
          ),
        );
      }
    });

    req.on('error', reject);
    req.write(jsonPayload);
    req.end();
  });
}

export interface OllamaStreamAccumulated {
  statusCode: number;
  text: string;
  model?: string;
  promptEvalCount?: number;
  evalCount?: number;
  evalDuration?: number;
  error?: string;
}

export function postOllamaStreamConfigurable(
  targetUrl: string,
  body: unknown,
  timeoutSeconds = 0,
): Promise<OllamaStreamAccumulated> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const jsonPayload = Buffer.from(JSON.stringify(body), 'utf8');
    const client = parsed.protocol === 'https:' ? https : http;
    const timeoutMs = timeoutSeconds > 0 ? Math.round(timeoutSeconds * 1000) : 0;

    const req = client.request(
      parsed,
      {
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(jsonPayload.byteLength),
        },
      },
      (res) => {
        const statusCode = res.statusCode ?? 500;
        let lineBuffer = '';
        let accumulatedText = '';
        let resolvedModel: string | undefined;
        let promptEvalCount: number | undefined;
        let evalCount: number | undefined;
        let evalDuration: number | undefined;
        let streamError: string | undefined;
        const rawChunks: Buffer[] = [];

        const processLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const parsedChunk = JSON.parse(trimmed) as {
              model?: string;
              error?: string;
              message?: { content?: string };
              prompt_eval_count?: number;
              eval_count?: number;
              eval_duration?: number;
            };
            if (parsedChunk.error) {
              streamError = parsedChunk.error;
            }
            if (parsedChunk.message?.content) {
              accumulatedText += parsedChunk.message.content;
            }
            if (parsedChunk.model) {
              resolvedModel = parsedChunk.model;
            }
            if (typeof parsedChunk.prompt_eval_count === 'number') {
              promptEvalCount = parsedChunk.prompt_eval_count;
            }
            if (typeof parsedChunk.eval_count === 'number') {
              evalCount = parsedChunk.eval_count;
            }
            if (typeof parsedChunk.eval_duration === 'number') {
              evalDuration = parsedChunk.eval_duration;
            }
          } catch {
            // Ignore partial non-JSON lines when non-200 HTML/plain errors occur
          }
        };

        res.on('data', (chunk: Buffer | string) => {
          const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
          if (statusCode < 200 || statusCode >= 300) {
            rawChunks.push(buf);
            return;
          }
          lineBuffer += buf.toString('utf8');
          let newlineIdx = lineBuffer.indexOf('\n');
          while (newlineIdx !== -1) {
            const line = lineBuffer.slice(0, newlineIdx);
            lineBuffer = lineBuffer.slice(newlineIdx + 1);
            processLine(line);
            newlineIdx = lineBuffer.indexOf('\n');
          }
        });

        res.on('end', () => {
          if (statusCode < 200 || statusCode >= 300) {
            const rawText = Buffer.concat(rawChunks).toString('utf8');
            let errMsg = rawText;
            try {
              const errJson = JSON.parse(rawText) as { error?: string };
              if (errJson.error) errMsg = errJson.error;
            } catch {
              // keep rawText
            }
            resolve({ statusCode, text: '', error: errMsg });
            return;
          }

          if (lineBuffer.trim()) {
            processLine(lineBuffer);
          }

          resolve({
            statusCode,
            text: accumulatedText,
            model: resolvedModel,
            promptEvalCount,
            evalCount,
            evalDuration,
            error: streamError,
          });
        });

        res.on('error', reject);
      },
    );

    req.on('socket', (socket) => {
      socket.setKeepAlive(true, 15000);
      if (timeoutMs === 0) {
        socket.setTimeout(0);
      }
    });

    req.setTimeout(timeoutMs, () => {
      if (timeoutMs > 0) {
        req.destroy(
          new Error(
            `Configured query timeout of ${timeoutSeconds}s elapsed. Set Request Timeout to 'No Timeout (Unlimited)' in Settings for full-throttle queries.`,
          ),
        );
      }
    });

    req.on('error', reject);
    req.write(jsonPayload);
    req.end();
  });
}

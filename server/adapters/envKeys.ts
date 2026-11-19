import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

let lastEnvCheckMs = 0;

export function refreshDotEnvIfNeeded(): void {
  const now = Date.now();
  if (now - lastEnvCheckMs < 2000) return;
  lastEnvCheckMs = now;

  for (const filename of ['.env', '.env.local']) {
    const filePath = path.resolve(process.cwd(), filename);
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: false, quiet: true });
    }
  }
}

export function resolveServerEnvSecret(candidateNames: readonly string[]): string {
  refreshDotEnvIfNeeded();
  for (const name of candidateNames) {
    const val = process.env[name]?.trim();
    if (val) {
      return val.replace(/^Bearer\s+/i, '').trim();
    }
  }
  return '';
}

export function normalizeAnthropicEndpointUrl(
  rawEndpoint: string,
  defaultEndpoint = 'https://api.anthropic.com/v1/messages',
): string {
  let endpoint = rawEndpoint.trim();
  if (!endpoint) return defaultEndpoint;

  if (!/^https?:\/\//i.test(endpoint)) {
    endpoint = `https://${endpoint}`;
  }

  try {
    const parsed = new URL(endpoint);
    const cleanPath = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    if (
      parsed.hostname.toLowerCase() === 'api.anthropic.com' &&
      (cleanPath === '' || cleanPath === '/v1' || cleanPath === '/v1/message')
    ) {
      parsed.pathname = '/v1/messages';
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return endpoint;
  }
}

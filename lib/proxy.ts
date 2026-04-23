// Proxy client — the extension never talks to MiniMax directly. Every AI call
// goes through a Cloudflare Worker that holds the real key. See mvp/proxy/
// for the server side.

const DEFAULT_TIMEOUT_MS = 12_000;

// Baked at build time from WXT_PROXY_URL in .env. Fallback is the local dev URL.
export const PROXY_BASE: string =
  (import.meta.env.WXT_PROXY_URL as string | undefined) ??
  'http://localhost:8787';

export type ProxyErrorCode = 'rate-limit' | 'timeout' | 'http' | 'parse' | 'install-id';

export class ProxyError extends Error {
  constructor(public code: ProxyErrorCode, message: string) {
    super(message);
    this.name = 'ProxyError';
  }
}

export interface ChatCompletionRequest {
  installId: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  endpoint?: 'analyze' | 'cart-review';
}

interface RawResponse {
  content?: string;
  error?: string;
}

export async function chatCompletion(req: ChatCompletionRequest): Promise<string> {
  if (!req.installId) throw new ProxyError('install-id', 'install id missing');

  const endpoint = req.endpoint ?? 'analyze';
  const url = `${PROXY_BASE}/v1/${endpoint}`;

  const controller = new AbortController();
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MSB-Install-Id': req.installId,
      },
      body: JSON.stringify({
        systemPrompt: req.systemPrompt,
        userMessage: req.userMessage,
        maxTokens: req.maxTokens ?? 400,
        temperature: req.temperature ?? 0.7,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new ProxyError('timeout', `proxy request timed out after ${timeoutMs}ms`);
    }
    throw new ProxyError('http', `proxy request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw new ProxyError('rate-limit', 'rate limit reached — try again later');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ProxyError('http', `proxy HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  let json: RawResponse;
  try {
    json = (await res.json()) as RawResponse;
  } catch {
    throw new ProxyError('parse', 'proxy returned non-JSON');
  }

  const content = json.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new ProxyError('parse', 'proxy response missing content');
  }
  return content;
}

// Manic Spending Buddy proxy Worker.
//
// The extension never holds the MiniMax API key. Every AI request from the
// extension hits this Worker with an X-MSB-Install-Id header; the Worker
// rate-limits per install and forwards to MiniMax using the secret key.

export interface Env {
  MINIMAX_API_KEY: string;
  MINIMAX_MODEL: string;
  ANALYZE_LIMIT_PER_DAY: string;
  CART_REVIEW_LIMIT_PER_DAY: string;
  RATE_LIMITS: KVNamespace;
}

const MINIMAX_ENDPOINT = 'https://api.minimax.io/v1/chat/completions';
const INSTALL_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

type EndpointKind = 'analyze' | 'cart-review';

interface ClientBody {
  systemPrompt?: unknown;
  userMessage?: unknown;
  maxTokens?: unknown;
  temperature?: unknown;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return corsPreflight();
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

    const endpoint = matchEndpoint(url.pathname);
    if (!endpoint) return json({ error: 'not found' }, 404);

    const installId = request.headers.get('X-MSB-Install-Id') ?? '';
    if (!INSTALL_ID_RE.test(installId)) {
      return json({ error: 'missing or malformed install id' }, 400);
    }

    const limit = perDayLimit(endpoint, env);
    const gate = await consumeRateLimit(env, installId, endpoint, limit);
    if (!gate.allowed) {
      return json(
        { error: 'daily limit reached', retryAt: gate.resetAt },
        429,
        { 'Retry-After': String(Math.max(1, Math.ceil((gate.resetAt - Date.now()) / 1000))) },
      );
    }

    const body = (await safeJson(request)) as ClientBody | null;
    if (!body) return json({ error: 'invalid JSON body' }, 400);

    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : '';
    const userMessage = typeof body.userMessage === 'string' ? body.userMessage : '';
    if (!systemPrompt || !userMessage) {
      return json({ error: 'systemPrompt and userMessage are required' }, 400);
    }
    const maxTokens = clamp(numberOr(body.maxTokens, 400), 1, 2048);
    const temperature = clampFloat(numberOr(body.temperature, 0.7), 0, 1);

    const upstream = await fetch(MINIMAX_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.MINIMAX_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return json(
        { error: 'upstream failed', status: upstream.status, body: text.slice(0, 400) },
        502,
      );
    }

    const upstreamJson = (await upstream.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const content = upstreamJson?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return json({ error: 'upstream returned no content' }, 502);
    }

    return json({ content });
  },
};

function matchEndpoint(pathname: string): EndpointKind | null {
  if (pathname === '/v1/analyze') return 'analyze';
  if (pathname === '/v1/cart-review') return 'cart-review';
  return null;
}

function perDayLimit(kind: EndpointKind, env: Env): number {
  const raw = kind === 'analyze' ? env.ANALYZE_LIMIT_PER_DAY : env.CART_REVIEW_LIMIT_PER_DAY;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

interface GateResult {
  allowed: boolean;
  resetAt: number;
}

async function consumeRateLimit(
  env: Env,
  installId: string,
  kind: EndpointKind,
  limit: number,
): Promise<GateResult> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `rl:${kind}:${installId}:${today}`;
  const current = Number((await env.RATE_LIMITS.get(key)) ?? '0');
  const resetAt = nextMidnightUtc();
  if (current >= limit) return { allowed: false, resetAt };
  // Bucket TTL: slightly past tomorrow's reset so KV cleans itself up.
  const ttlSeconds = Math.max(60, Math.ceil((resetAt - Date.now()) / 1000) + 3600);
  await env.RATE_LIMITS.put(key, String(current + 1), { expirationTtl: ttlSeconds });
  return { allowed: true, resetAt };
}

function nextMidnightUtc(): number {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders(): Record<string, string> {
  return {
    // The extension origin is a chrome-extension:// URL whose id differs per install
    // and cannot be usefully allow-listed here. Permissive CORS on POST /v1/* is
    // safe because every request must still present a valid install id and is rate
    // limited. No browser outside an extension can realistically run up the quota.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-MSB-Install-Id',
    'Access-Control-Max-Age': '86400',
  };
}

async function safeJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function numberOr(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampFloat(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

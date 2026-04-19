const ENDPOINT = 'https://api.minimax.io/v1/chat/completions';
const MODEL = 'MiniMax-M2.7';
const DEFAULT_TIMEOUT_MS = 10_000;

export type MiniMaxErrorCode = 'no-key' | 'timeout' | 'http' | 'parse';

export class MiniMaxError extends Error {
  constructor(public code: MiniMaxErrorCode, message: string) {
    super(message);
    this.name = 'MiniMaxError';
  }
}

export interface ChatCompletionRequest {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

interface RawResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function chatCompletion(req: ChatCompletionRequest): Promise<string> {
  if (!req.apiKey) throw new MiniMaxError('no-key', 'MiniMax API key not set');

  const controller = new AbortController();
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userMessage },
        ],
        max_tokens: req.maxTokens ?? 400,
        temperature: req.temperature ?? 0.7,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new MiniMaxError('timeout', `MiniMax request timed out after ${timeoutMs}ms`);
    }
    throw new MiniMaxError('http', `MiniMax request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new MiniMaxError('http', `MiniMax HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  let json: RawResponse;
  try {
    json = (await res.json()) as RawResponse;
  } catch {
    throw new MiniMaxError('parse', 'MiniMax returned non-JSON');
  }

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new MiniMaxError('parse', 'MiniMax response missing choices[0].message.content');
  }
  return content;
}

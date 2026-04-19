import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatCompletion, MiniMaxError } from './minimax';

describe('chatCompletion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts a chat-completions request with the configured model and key', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { role: 'assistant', content: 'hi back' }, finish_reason: 'stop' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await chatCompletion({
      apiKey: 'sk-test',
      systemPrompt: 'you are a buddy',
      userMessage: 'hi',
      maxTokens: 200,
      timeoutMs: 5000,
    });

    expect(out).toBe('hi back');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.minimax.io/v1/chat/completions');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('MiniMax-M2.7');
    expect(body.messages).toEqual([
      { role: 'system', content: 'you are a buddy' },
      { role: 'user', content: 'hi' },
    ]);
    expect(body.max_tokens).toBe(200);
  });

  it('throws MiniMaxError on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    await expect(
      chatCompletion({ apiKey: 'bad', systemPrompt: 's', userMessage: 'u' }),
    ).rejects.toBeInstanceOf(MiniMaxError);
  });

  it('throws MiniMaxError on no-key', async () => {
    await expect(
      chatCompletion({ apiKey: '', systemPrompt: 's', userMessage: 'u' }),
    ).rejects.toMatchObject({ code: 'no-key' });
  });

  it('respects timeoutMs via AbortController', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      chatCompletion({ apiKey: 'k', systemPrompt: 's', userMessage: 'u', timeoutMs: 10 }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});

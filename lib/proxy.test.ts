import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatCompletion, ProxyError } from './proxy';

describe('chatCompletion (proxy client)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to /v1/analyze with install-id header and content-typed JSON body', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ content: 'hi back' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await chatCompletion({
      installId: 'deadbeef-1111-2222-3333-444455556666',
      systemPrompt: 'sys',
      userMessage: 'msg',
      maxTokens: 200,
    });

    expect(out).toBe('hi back');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/v1\/analyze$/);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-MSB-Install-Id']).toBe('deadbeef-1111-2222-3333-444455556666');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.systemPrompt).toBe('sys');
    expect(body.userMessage).toBe('msg');
    expect(body.maxTokens).toBe(200);
  });

  it('routes to /v1/cart-review when endpoint override is cart-review', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ content: 'ok' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await chatCompletion({
      installId: 'uuid-x',
      systemPrompt: 's',
      userMessage: 'u',
      endpoint: 'cart-review',
    });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/v1\/cart-review$/);
  });

  it('throws ProxyError with code "rate-limit" on 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 429 })));
    await expect(
      chatCompletion({ installId: 'x', systemPrompt: 's', userMessage: 'u' }),
    ).rejects.toMatchObject({ code: 'rate-limit' });
  });

  it('throws ProxyError on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 500 })));
    await expect(
      chatCompletion({ installId: 'x', systemPrompt: 's', userMessage: 'u' }),
    ).rejects.toBeInstanceOf(ProxyError);
  });

  it('throws ProxyError "install-id" when missing', async () => {
    await expect(
      chatCompletion({ installId: '', systemPrompt: 's', userMessage: 'u' }),
    ).rejects.toMatchObject({ code: 'install-id' });
  });

  it('respects timeoutMs via AbortController', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      chatCompletion({
        installId: 'x',
        systemPrompt: 's',
        userMessage: 'u',
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});

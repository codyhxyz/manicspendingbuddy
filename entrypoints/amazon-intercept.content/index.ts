// MAIN-world script: patches fetch/XHR to pause cart-add POSTs until the
// isolated-world overlay decides what to do.

import { isCartAddEndpoint } from '@/lib/amazon-cart-endpoints';

export default defineContentScript({
  matches: ['*://*.amazon.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    console.log('[MSB intercept] main-world installed');

    const pending = new Map<string, { resolve: (v: 'approve' | 'deny') => void }>();
    let bypassUntil = 0;

    window.addEventListener('message', (ev) => {
      if (ev.source !== window) return;
      const data = ev.data as
        | { __msb?: string; id?: string; verdict?: 'approve' | 'deny'; ms?: number }
        | null;
      if (!data || typeof data.__msb !== 'string') return;

      if (data.__msb === 'verdict' && data.id && data.verdict) {
        const slot = pending.get(data.id);
        if (!slot) return;
        pending.delete(data.id);
        slot.resolve(data.verdict);
        return;
      }

      if (data.__msb === 'bypass-next' && typeof data.ms === 'number') {
        bypassUntil = Date.now() + data.ms;
      }
    });

    function askIsolated(url: string, method: string): Promise<'approve' | 'deny'> {
      const id = crypto.randomUUID();
      return new Promise((resolve) => {
        pending.set(id, { resolve });
        window.postMessage({ __msb: 'intercept', id, url, method }, window.location.origin);
        // Safety: if no verdict in 60s, let it through so we never permanently break Amazon.
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            resolve('approve');
          }
        }, 60_000);
      });
    }

    function shouldIntercept(method: string, url: string): boolean {
      if (method !== 'POST') return false;
      if (Date.now() < bypassUntil) return false;
      return isCartAddEndpoint(url);
    }

    const origFetch = window.fetch.bind(window);
    window.fetch = async function patchedFetch(input, init) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (shouldIntercept(method, url)) {
        const verdict = await askIsolated(url, method);
        if (verdict === 'deny') {
          throw new DOMException('Blocked by Manic Spending Buddy', 'AbortError');
        }
      }
      return origFetch(input as RequestInfo, init);
    };

    const OrigXHR = window.XMLHttpRequest;
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;

    OrigXHR.prototype.open = function patchedOpen(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      (this as unknown as Record<string, unknown>).__msb_method = method.toUpperCase();
      (this as unknown as Record<string, unknown>).__msb_url = typeof url === 'string' ? url : url.toString();
      // @ts-expect-error — forwarding variadic args to original open
      return origOpen.call(this, method, url, ...rest);
    };

    OrigXHR.prototype.send = function patchedSend(
      this: XMLHttpRequest,
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      const rec = this as unknown as Record<string, unknown>;
      const method = rec.__msb_method as string | undefined;
      const url = rec.__msb_url as string | undefined;
      if (method && url && shouldIntercept(method, url)) {
        askIsolated(url, method).then((verdict) => {
          if (verdict === 'deny') {
            this.abort();
          } else {
            origSend.call(this, body as XMLHttpRequestBodyInit | null | undefined);
          }
        });
        return;
      }
      return origSend.call(this, body as XMLHttpRequestBodyInit | null | undefined);
    };
  },
});

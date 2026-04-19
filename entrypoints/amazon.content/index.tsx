import ReactDOM from 'react-dom/client';
import { extractProductInfo, findAddToCartButton, findBuyNowButton, findPrimeDeliveryButtons } from '@/lib/amazon-selectors';
import type { ProductInfo } from '@/lib/types';
import { createSuppressableObserver } from '@/utils/observer';
import { sendMessage } from '@/utils/messaging';
import { InterventionOverlay } from './InterventionOverlay';

function extractAsinFromUrl(): string {
  const m = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
  return m ? m[1] : '';
}

function renderHoldStrip(holdId: string, title: string, releaseAt: number) {
  const existing = document.getElementById('msb-hold-strip');
  if (existing) return;
  const strip = document.createElement('div');
  strip.id = 'msb-hold-strip';
  strip.style.cssText = [
    'position:fixed','top:0','left:0','right:0','z-index:2147483646',
    'background:#fff8ec','border-bottom:1px solid #fbd38d','color:#b45309',
    'font-family:-apple-system,sans-serif','font-size:13px','padding:10px 16px',
    'display:flex','align-items:center','justify-content:space-between','gap:12px',
  ].join(';');
  const hoursLeft = Math.max(0, Math.ceil((releaseAt - Date.now()) / (60 * 60 * 1000)));
  strip.innerHTML = `
    <span>You're sitting with <b>${title}</b>. ~${hoursLeft}h left.</span>
    <button id="msb-hold-release" style="background:transparent;border:1px solid #fbd38d;color:#b45309;border-radius:6px;padding:6px 10px;cursor:pointer;font:inherit;">Need it now</button>
  `;
  document.body.prepend(strip);
  document.getElementById('msb-hold-release')?.addEventListener('click', async () => {
    const reason = window.prompt('Why the emergency? (logged only for your own reflection)');
    if (reason === null) return;
    await sendMessage('releaseHold', { id: holdId, overrideReason: reason });
    strip.remove();
    const addBtn = findAddToCartButton() ?? findBuyNowButton();
    if (addBtn) {
      // Tell the MAIN-world fetch hook to let the next cart-add through.
      // Without this, the hold-skip path has no verdict listener registered
      // and the intercept falls back to the 60s safety timeout.
      window.postMessage({ __msb: 'bypass-next', ms: 3000 }, window.location.origin);
      addBtn.click();
    }
  });
}

export default defineContentScript({
  matches: ['*://*.amazon.com/*'],
  runAt: 'document_idle',
  main() {
    console.log('[MSB] Content script loaded on Amazon');

    let overlayRoot: HTMLDivElement | null = null;
    let reactRoot: ReactDOM.Root | null = null;
    let intercepted = false;
    let lastClickedButton: HTMLElement | null = null;

    (async () => {
      const asin = extractAsinFromUrl();
      if (asin) {
        const hold = await sendMessage('getHoldByAsin', asin);
        if (hold) {
          renderHoldStrip(hold.id, hold.product.title, hold.releaseAt ?? 0);
          return; // do not register interception
        }
      }
      registerInterception();
    })();

    function registerInterception() {
      function showOverlay(product: ProductInfo) {
        if (overlayRoot) return; // already showing

        overlayRoot = document.createElement('div');
        overlayRoot.id = 'msb-overlay-root';
        document.body.appendChild(overlayRoot);

        reactRoot = ReactDOM.createRoot(overlayRoot);
        reactRoot.render(
          <InterventionOverlay
            product={product}
            onClose={hideOverlay}
            onAddAnyway={() => {
              hideOverlay();
              clickOriginalButton();
            }}
          />,
        );
      }

      function hideOverlay() {
        if (reactRoot) {
          reactRoot.unmount();
          reactRoot = null;
        }
        if (overlayRoot) {
          overlayRoot.remove();
          overlayRoot = null;
        }
      }

      function clickOriginalButton() {
        intercepted = true;
        // Tell the MAIN-world fetch/XHR hook to let the next cart-add request pass
        // without re-prompting, since the user just explicitly chose "Add anyway".
        window.postMessage({ __msb: 'bypass-next', ms: 2000 }, window.location.origin);
        const btn = lastClickedButton || findAddToCartButton() || findBuyNowButton();
        if (btn) btn.click();
        lastClickedButton = null;
        // Reset after a tick so future clicks are intercepted again
        setTimeout(() => { intercepted = false; }, 500);
      }

      function showOverlayForNetwork(product: ProductInfo, requestId: string) {
        if (overlayRoot) {
          // DOM-click overlay is already handling this interaction; deny the
          // orphan fetch so the MAIN-world hook aborts it immediately instead
          // of waiting 60s for the safety timeout to auto-approve.
          window.postMessage(
            { __msb: 'verdict', id: requestId, verdict: 'deny' },
            window.location.origin,
          );
          return;
        }
        overlayRoot = document.createElement('div');
        overlayRoot.id = 'msb-overlay-root';
        document.body.appendChild(overlayRoot);

        const reply = (verdict: 'approve' | 'deny') => {
          window.postMessage({ __msb: 'verdict', id: requestId, verdict }, window.location.origin);
        };

        reactRoot = ReactDOM.createRoot(overlayRoot);
        reactRoot.render(
          <InterventionOverlay
            product={product}
            onClose={() => { reply('deny'); hideOverlay(); }}
            onAddAnyway={() => { reply('approve'); hideOverlay(); }}
          />,
        );
      }

      window.addEventListener('message', (ev) => {
        if (ev.source !== window) return;
        const data = ev.data as { __msb?: string; id?: string } | null;
        if (!data || data.__msb !== 'intercept' || !data.id) return;

        const product = extractProductInfo();
        if (!product.title || product.priceNumeric <= 0) {
          // Can't extract reliably — let the request through rather than
          // break Amazon (and avoid logging bogus $0 interventions).
          window.postMessage(
            { __msb: 'verdict', id: data.id, verdict: 'approve' },
            window.location.origin,
          );
          return;
        }
        showOverlayForNetwork(product, data.id);
      });

      function interceptButton(btn: HTMLElement) {
        btn.addEventListener(
          'click',
          (e) => {
            if (intercepted) return; // let the real click through

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const product = extractProductInfo();
            if (!product.title || product.priceNumeric <= 0) {
              console.warn('[MSB] Could not extract product info reliably, letting click through');
              intercepted = true;
              btn.click();
              setTimeout(() => { intercepted = false; }, 500);
              return;
            }

            lastClickedButton = btn;
            showOverlay(product);
          },
          { capture: true },
        );
        btn.dataset.msbIntercepted = 'true';
      }

      // Intercept all purchase buttons
      function setupInterception() {
        const addToCart = findAddToCartButton();
        if (addToCart && !addToCart.dataset.msbIntercepted) {
          interceptButton(addToCart);
          console.log('[MSB] Intercepting Add to Cart button');
        }

        const buyNow = findBuyNowButton();
        if (buyNow && !buyNow.dataset.msbIntercepted) {
          interceptButton(buyNow);
          console.log('[MSB] Intercepting Buy Now button');
        }

        // Prime delivery, Subscribe & Save, One-Click buttons
        const primeButtons = findPrimeDeliveryButtons();
        for (const btn of primeButtons) {
          if (!btn.dataset.msbIntercepted) {
            interceptButton(btn);
            console.log('[MSB] Intercepting Prime/delivery button:', btn.textContent?.trim()?.slice(0, 40));
          }
        }
      }

      // Initial setup
      setupInterception();

      // Debounced observer — re-attach if Amazon re-renders buttons.
      // Amazon fires hundreds of mutations per second on page load; debouncing
      // collapses them into one setup call per window.
      const observer = createSuppressableObserver({
        callback: () => setupInterception(),
        debounceMs: 150,
      });
      observer.observe(document.body);
    }
  },
});

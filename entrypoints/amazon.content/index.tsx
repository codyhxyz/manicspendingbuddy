import ReactDOM from 'react-dom/client';
import { extractProductInfo, findAddToCartButton, findBuyNowButton, findPrimeDeliveryButtons } from '@/lib/amazon-selectors';
import type { ProductInfo } from '@/lib/types';
import { createSuppressableObserver } from '@/utils/observer';
import { InterventionOverlay } from './InterventionOverlay';

export default defineContentScript({
  matches: ['*://*.amazon.com/*'],
  runAt: 'document_idle',
  main() {
    console.log('[MSB] Content script loaded on Amazon');

    let overlayRoot: HTMLDivElement | null = null;
    let reactRoot: ReactDOM.Root | null = null;
    let intercepted = false;

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

    let lastClickedButton: HTMLElement | null = null;

    function clickOriginalButton() {
      intercepted = true;
      const btn = lastClickedButton || findAddToCartButton() || findBuyNowButton();
      if (btn) btn.click();
      lastClickedButton = null;
      // Reset after a tick so future clicks are intercepted again
      setTimeout(() => { intercepted = false; }, 500);
    }

    function interceptButton(btn: HTMLElement) {
      btn.addEventListener(
        'click',
        (e) => {
          if (intercepted) return; // let the real click through

          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const product = extractProductInfo();
          if (!product.title) {
            console.warn('[MSB] Could not extract product info, letting click through');
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

    // Cart count observer — not debounced since it fires rarely
    const cartCount = document.querySelector('#nav-cart-count');
    if (cartCount) {
      const cartObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'characterData' || m.type === 'childList') {
            console.log('[MSB] Cart count changed — item may have been added outside interception');
          }
        }
      });
      cartObserver.observe(cartCount, { characterData: true, childList: true, subtree: true });
    }
  },
});

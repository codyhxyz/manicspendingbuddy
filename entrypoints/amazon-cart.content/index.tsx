import ReactDOM from 'react-dom/client';
import {
  extractCartItems,
  findProceedToCheckoutButton,
  removeCartItem,
  type CartItem,
} from '@/lib/amazon-cart-selectors';
import { sendMessage } from '@/utils/messaging';
import type { Intervention } from '@/lib/types';
import { CartReviewOverlay, type EnrichedItem } from './CartReviewOverlay';

export default defineContentScript({
  matches: ['*://*.amazon.com/gp/cart/*', '*://*.amazon.com/cart*'],
  runAt: 'document_idle',
  main() {
    console.log('[MSB] Cart content script loaded');

    let overlayRoot: HTMLDivElement | null = null;
    let reactRoot: ReactDOM.Root | null = null;
    let passThrough = false;

    function mountOverlay(
      items: CartItem[],
      priorGoals: Record<string, string>,
      budget: { dailyBudget: number; spentToday: number; monthSpend: number },
      holdModeEnabled: boolean,
      ptcButton: HTMLElement,
      cartTotalBefore: number,
    ) {
      if (overlayRoot) return;
      overlayRoot = document.createElement('div');
      overlayRoot.id = 'msb-cart-overlay-root';
      document.body.appendChild(overlayRoot);
      reactRoot = ReactDOM.createRoot(overlayRoot);

      const unmount = () => {
        reactRoot?.unmount();
        overlayRoot?.remove();
        reactRoot = null;
        overlayRoot = null;
      };

      const handleProceed = async () => {
        await sendMessage('logCartReview', {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          items: items.map((it) => ({
            asin: it.asin,
            verdict: 'ask' as const,
            removed: false,
            sentToHold: false,
          })),
          observation: '',
          cartTotalBefore,
          savedAmount: 0,
          decision: 'proceeded',
        });
        passThrough = true;
        unmount();
        ptcButton.click();
        setTimeout(() => { passThrough = false; }, 500);
      };

      const handleRemove = async (asins: string[]) => {
        // Re-extract in case the user manually deleted rows after the overlay opened.
        const fresh = extractCartItems();
        const byAsin: Record<string, CartItem> = {};
        for (const it of fresh) byAsin[it.asin] = it;
        let savedAmount = 0;
        const removedAsins: string[] = [];
        for (const asin of asins) {
          const it = byAsin[asin] ?? items.find((x) => x.asin === asin);
          if (!it) continue;
          const ok = removeCartItem(it);
          if (ok) {
            savedAmount += it.priceNumeric;
            removedAsins.push(asin);
            const intervention: Intervention = {
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              product: {
                title: it.title,
                price: it.price,
                priceNumeric: it.priceNumeric,
                imageUrl: it.imageUrl,
                asin: it.asin,
                category: '',
              },
              userGoal: priorGoals[asin] ?? '',
              claudeResponse: '',
              decision: 'skipped',
              savedAmount: it.priceNumeric,
            };
            await sendMessage('logIntervention', intervention);
          }
        }
        await sendMessage('logCartReview', {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          items: items.map((it) => ({
            asin: it.asin,
            verdict: 'ask' as const,
            removed: removedAsins.includes(it.asin),
            sentToHold: false,
          })),
          observation: '',
          cartTotalBefore,
          // Per-item logIntervention calls above already added to totalSaved.
          // Pass 0 here so storage.logCartReview doesn't double-count.
          savedAmount: 0,
          decision: removedAsins.length === items.length ? 'emptied' : 'modified',
        });
        unmount();
      };

      const handleHold = async (picks: EnrichedItem[]) => {
        let savedAmount = 0;
        const heldAsins: string[] = [];
        for (const it of picks) {
          const ok = removeCartItem(it);
          if (!ok) continue;
          await sendMessage('createHold', {
            product: {
              title: it.title,
              price: it.price,
              priceNumeric: it.priceNumeric,
              imageUrl: it.imageUrl,
              asin: it.asin,
              category: '',
            },
            userGoal: priorGoals[it.asin] ?? '',
          });
          savedAmount += it.priceNumeric;
          heldAsins.push(it.asin);
        }
        await sendMessage('logCartReview', {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          items: items.map((it) => ({
            asin: it.asin,
            verdict: 'ask' as const,
            removed: false,
            sentToHold: heldAsins.includes(it.asin),
          })),
          observation: '',
          cartTotalBefore,
          savedAmount,
          decision: 'modified',
        });
        unmount();
      };

      reactRoot.render(
        <CartReviewOverlay
          items={items}
          priorGoals={priorGoals}
          dailyBudget={budget.dailyBudget}
          spentToday={budget.spentToday}
          monthSpend={budget.monthSpend}
          holdModeEnabled={holdModeEnabled}
          onDismiss={unmount}
          onProceed={handleProceed}
          onRemoveSelected={handleRemove}
          onHoldSelected={handleHold}
        />,
      );
    }

    function attachInterceptor() {
      const btn = findProceedToCheckoutButton();
      if (!btn || btn.dataset.msbHooked === '1') return;
      btn.dataset.msbHooked = '1';
      btn.addEventListener(
        'click',
        async (e) => {
          if (passThrough) return;
          const items = extractCartItems();
          if (items.length === 0) return;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const state = await sendMessage('getState', undefined);
          const priorGoals: Record<string, string> = {};
          for (const item of items) {
            const match = state.interventions.find(
              (iv) =>
                iv.product.asin === item.asin &&
                (iv.decision === 'added' || iv.decision === 'saved') &&
                iv.userGoal,
            );
            if (match) priorGoals[item.asin] = match.userGoal;
          }
          const monthSpend = computeMonthSpend(state.interventions);
          const cartTotalBefore = items.reduce((s, it) => s + it.priceNumeric, 0);
          mountOverlay(
            items,
            priorGoals,
            {
              dailyBudget: state.settings.dailyBudget,
              spentToday: state.spentToday ?? 0,
              monthSpend,
            },
            state.settings.holdModeEnabled,
            btn,
            cartTotalBefore,
          );
        },
        { capture: true },
      );
    }

    attachInterceptor();
    const observer = new MutationObserver(() => attachInterceptor());
    observer.observe(document.body, { childList: true, subtree: true });
  },
});

function computeMonthSpend(interventions: Intervention[]): number {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return interventions
    .filter((iv) => iv.decision === 'added' && iv.timestamp >= monthStart)
    .reduce((s, iv) => s + iv.product.priceNumeric, 0);
}

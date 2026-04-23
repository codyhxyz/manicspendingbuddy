import { useEffect, useMemo, useState } from 'react';
import type { CartItem } from '@/lib/amazon-cart-selectors';
import type { ParsedCartReview, ParsedCartReviewItem } from '@/lib/cart-review-prompt';
import type { CartReview, Intervention, SavedItem } from '@/lib/types';
import { sendMessage } from '@/utils/messaging';

interface EnrichedItem extends CartItem {
  priorGoal: string | null;
  verdict: 'solid' | 'flag' | 'ask';
  reason: string;
  selected: boolean;
}

interface Props {
  items: CartItem[];
  priorGoals: Record<string, string>;
  dailyBudget: number;
  spentToday: number;
  monthSpend: number;
  holdModeEnabled: boolean;
  onDismiss: () => void;
  onProceed: () => void;
  onRemoveSelected: (ids: string[]) => Promise<void>;
  onHoldSelected: (items: EnrichedItem[]) => Promise<void>;
}

export function CartReviewOverlay({
  items,
  priorGoals,
  dailyBudget,
  spentToday,
  monthSpend,
  holdModeEnabled,
  onDismiss,
  onProceed,
  onRemoveSelected,
  onHoldSelected,
}: Props) {
  const [phase, setPhase] = useState<'thinking' | 'ready' | 'degraded'>('thinking');
  const [review, setReview] = useState<ParsedCartReview | null>(null);
  const [selectedAsins, setSelectedAsins] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const cartTotal = useMemo(
    () => items.reduce((s, it) => s + it.priceNumeric, 0),
    [items],
  );
  const delta = cartTotal - Math.max(0, dailyBudget - spentToday);

  useEffect(() => {
    (async () => {
      try {
        const result = await sendMessage('reviewCart', {
          items: items.map((it) => ({
            asin: it.asin,
            title: it.title,
            priceNumeric: it.priceNumeric,
            priorGoal: priorGoals[it.asin] ?? null,
            daysInCart: 0,
          })),
          dailyBudget,
          spentToday,
          monthSpend,
        });
        setReview(result);
        setSelectedAsins(
          new Set(result.items.filter((i) => i.verdict === 'flag').map((i) => i.asin)),
        );
        setPhase('ready');
      } catch (err) {
        console.warn('[MSB] cart review failed, degrading', err);
        setPhase('degraded');
      }
    })();
  }, [items, priorGoals, dailyBudget, spentToday, monthSpend]);

  const verdictByAsin: Record<string, ParsedCartReviewItem> = useMemo(() => {
    const map: Record<string, ParsedCartReviewItem> = {};
    review?.items.forEach((i) => { map[i.asin] = i; });
    return map;
  }, [review]);

  const enriched: EnrichedItem[] = items.map((it) => {
    const v = verdictByAsin[it.asin];
    return {
      ...it,
      priorGoal: priorGoals[it.asin] ?? null,
      verdict: v?.verdict ?? (priorGoals[it.asin] ? 'solid' : 'ask'),
      reason: v?.reason ?? '',
      selected: selectedAsins.has(it.asin),
    };
  });

  const selectedItems = enriched.filter((e) => selectedAsins.has(e.asin));
  const selectedSavings = selectedItems.reduce((s, it) => s + it.priceNumeric, 0);

  const toggle = (asin: string) => {
    setSelectedAsins((prev) => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin); else next.add(asin);
      return next;
    });
  };

  const handleRemove = async () => {
    try {
      await onRemoveSelected(Array.from(selectedAsins));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not remove items.';
      setError(msg);
    }
  };

  const handleHold = async () => {
    try {
      await onHoldSelected(selectedItems);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not hold items.';
      setError(msg);
    }
  };

  return (
    <>
      <style>{overlayStyles}</style>
      <div className="msbc-backdrop" onClick={onDismiss} />
      <div className="msbc-overlay" role="dialog" aria-modal="true">
        <div className="msbc-header">
          <div className="msbc-title">Before you check out —</div>
          <div className="msbc-sub">
            {items.length} items · ${cartTotal.toFixed(2)}
            {delta > 0 ? ` · $${delta.toFixed(0)} over today's budget` : ''}
          </div>
        </div>

        {phase === 'thinking' && (
          <div className="msbc-thinking">
            <div className="msbc-spinner" />
            <span>Reading the cart…</span>
          </div>
        )}

        {phase === 'degraded' && (
          <div className="msbc-observation msbc-observation-degraded">
            Couldn't reach the buddy AI just now — here are the numbers anyway. Your call.
          </div>
        )}

        {phase === 'ready' && review?.observation && (
          <div className="msbc-observation">{review.observation}</div>
        )}

        {phase !== 'thinking' && (
          <div className="msbc-list">
            {enriched.slice(0, 8).map((it) => (
              <label
                key={it.asin}
                className={`msbc-row msbc-row-${it.verdict}`}
              >
                <input
                  type="checkbox"
                  checked={it.selected}
                  onChange={() => toggle(it.asin)}
                />
                <div className="msbc-row-body">
                  <div className="msbc-row-top">
                    <span className="msbc-row-title">{it.title}</span>
                    <span className="msbc-row-price">${it.priceNumeric.toFixed(2)}</span>
                  </div>
                  {it.priorGoal && (
                    <div className="msbc-row-goal">
                      <em>"{it.priorGoal}"</em> — you, earlier
                    </div>
                  )}
                  {!it.priorGoal && (
                    <div className="msbc-row-goal msbc-row-goal-missing">
                      No goal logged — added via 1-click?
                    </div>
                  )}
                  {it.reason && <div className="msbc-row-reason">{it.reason}</div>}
                </div>
              </label>
            ))}
            {enriched.length > 8 && (
              <div className="msbc-more">…{enriched.length - 8} more items</div>
            )}
          </div>
        )}

        {error && <div className="msbc-error">{error}</div>}

        <div className="msbc-actions">
          <button
            type="button"
            className="msbc-btn msbc-btn-primary"
            onClick={handleRemove}
            disabled={selectedAsins.size === 0}
          >
            Remove selected — save ${selectedSavings.toFixed(0)}
          </button>
          {holdModeEnabled && (
            <button
              type="button"
              className="msbc-btn msbc-btn-hold"
              onClick={handleHold}
              disabled={selectedAsins.size === 0}
            >
              Send to 48h hold
            </button>
          )}
          <button
            type="button"
            className="msbc-btn msbc-btn-proceed"
            onClick={onProceed}
          >
            Proceed anyway
          </button>
        </div>
      </div>
    </>
  );
}

const overlayStyles = `
  .msbc-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.3);
    z-index: 2147483646;
    animation: msbc-fade 0.2s ease;
  }
  .msbc-overlay {
    position: fixed; top: 20px; left: 50%;
    transform: translateX(-50%);
    width: 560px; max-width: calc(100vw - 40px);
    max-height: calc(100vh - 60px); overflow-y: auto;
    background: #fffbf5; border-radius: 16px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08);
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    animation: msbc-slide 0.3s ease;
  }
  @keyframes msbc-fade { from { opacity:0 } to { opacity:1 } }
  @keyframes msbc-slide { from { opacity:0; transform: translateX(-50%) translateY(-12px) } to { opacity:1; transform: translateX(-50%) translateY(0) } }
  .msbc-header { padding: 16px 18px 8px; }
  .msbc-title { font-size: 17px; font-weight: 700; color:#2a1f0a; }
  .msbc-sub { font-size: 12px; color: #666; margin-top: 3px; }
  .msbc-observation { margin: 8px 18px; padding: 12px 14px; background:#fff; border:1px solid #f0e8dd; border-radius:10px; font-size:13px; line-height:1.5; color:#333; }
  .msbc-observation-degraded { color:#b45309; background:#fff8ec; border-color:#fbd38d; }
  .msbc-thinking { display:flex; gap:10px; align-items:center; justify-content:center; padding: 28px 16px; color:#666; font-size:13px; }
  .msbc-spinner { width:18px; height:18px; border:3px solid #e0d6ca; border-top-color:#8b6914; border-radius:50%; animation: msbc-spin 0.8s linear infinite; }
  @keyframes msbc-spin { to { transform: rotate(360deg) } }
  .msbc-list { padding: 6px 12px 12px; }
  .msbc-row { display:flex; align-items:flex-start; gap:10px; padding:10px; border:1px solid #f0e8dd; border-radius:10px; background:#fff; margin-bottom:6px; cursor:pointer; }
  .msbc-row input { margin-top: 3px; }
  .msbc-row-flag { border-color:#fecaca; background:#fff8f8; }
  .msbc-row-ask { border-left: 3px solid #fca5a5; }
  .msbc-row-body { flex:1; min-width:0; }
  .msbc-row-top { display:flex; justify-content:space-between; gap:8px; font-size:13px; font-weight:600; color:#1a1a1a; }
  .msbc-row-title { overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
  .msbc-row-price { flex-shrink:0; color:#b12704; }
  .msbc-row-goal { font-size:11px; color:#666; margin-top:3px; font-style:italic; }
  .msbc-row-goal-missing { color:#b91c1c; }
  .msbc-row-reason { font-size:11px; color:#333; margin-top:4px; }
  .msbc-more { font-size:11px; color:#999; text-align:center; padding:6px; }
  .msbc-error { margin: 6px 18px; padding:8px 12px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; border-radius:8px; font-size:12px; }
  .msbc-actions { display:flex; gap:8px; padding: 12px 16px 18px; }
  .msbc-btn { padding:10px 14px; border:none; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; }
  .msbc-btn:disabled { opacity:0.5; cursor:not-allowed; }
  .msbc-btn-primary { flex:2; background:#2e7d32; color:#fff; }
  .msbc-btn-primary:hover:not(:disabled) { background:#1b5e20; }
  .msbc-btn-hold { flex:1; background:#fff3e0; color:#e65100; border:1px solid #ffe0b2; }
  .msbc-btn-hold:hover:not(:disabled) { background:#ffe0b2; }
  .msbc-btn-proceed { flex:1; background:#f5f5f5; color:#888; border:1px solid #e0e0e0; font-size:12px; }
  .msbc-btn-proceed:hover { background:#eee; color:#666; }
`;

export type { EnrichedItem };
export type { CartReview, Intervention, SavedItem };

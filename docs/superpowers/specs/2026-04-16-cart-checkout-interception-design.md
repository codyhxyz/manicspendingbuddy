# Cart-Page Interception + 48h Hold Rule — Design Spec

**Date:** 2026-04-16
**Status:** Draft, awaiting user review

## 1. Summary

A second-tier "goalie" intervention on the Amazon cart page (`/gp/cart/view.html`, `/cart`) that catches purchases the product-page interception didn't prevent. On "Proceed to checkout", the extension shows a `CartReviewOverlay` that:

- Reuses the user's own stated goals (from prior product-page interventions) as context.
- Runs a single on-device LLM pass for cross-cart reflection: themes, over-budget flags, obvious frivolity, acknowledgement of items that still look solid.
- Renders a row-by-row layout with per-item verdicts (`solid` / `flag` / `ask`) and lets the user remove flagged items directly from Amazon's cart.

An **opt-in 48-hour hold rule** is added in parallel: when enabled, "Add anyway" no longer passes through to Amazon — it creates a held `SavedItem` with a 48-hour `releaseAt`. Expiry surfaces a "still want it?" notification, never auto-purchases. A gated escape hatch exists for genuine emergencies.

## 2. First Principles Compliance

- **Hear first, suggest second**: the cart review reuses the goals the user already gave per item; it adds ONE cross-cart observation on top rather than re-interrogating.
- **Not a friction wall**: no double-intervention (cart-page only, not cart + checkout); 48h rule is off by default.
- **Genuine help**: "Remove selected" acts on Amazon's own cart DOM so the user doesn't have to context-switch back into Amazon to clean up.
- **Celebrate solid purchases**: the `solid` verdict is a first-class path — don't manufacture objections.

## 3. Scope

### In scope
- New content script on Amazon cart pages intercepting "Proceed to checkout".
- `CartReviewOverlay` component implementing the row-by-row layout (Layout B from brainstorm).
- On-device LLM call returning structured per-item verdicts + one cross-cart observation.
- Amazon-cart DOM extraction and per-item removal via Amazon's own delete handles.
- `HoldMode`: opt-in setting in Options; extends `SavedItem` with `kind: 'hold'` + `releaseAt`.
- Product-page re-entry for held ASINs: inline hold-status strip with "Need it now" escape hatch.
- Popup "On ice (N)" section with countdowns.
- Expiry notifications via existing `chrome.alarms` hourly loop.
- New `CartReview` log type, capped at 50 entries.
- Data model migration: existing `SavedItem` → `kind: 'wishlist'` default.

### Out of scope (explicit YAGNI)
- Checkout-page (`Place your order`) interception — redundant with product + cart coverage.
- Cart-level free-text goal prompt — layout B's inline reuse of prior goals replaces it.
- International Amazon domains (.co.uk, .de, etc.) — .com only for MVP.
- Subscribe & Save detection inside cart rows — covered at product page.
- Undo for item removal — Amazon's own "Saved for later" undo suffices.
- `chrome.storage.sync` for cross-device holds.
- Analytics dashboard for `cartReviews` — logged, visualization deferred.

## 4. Architecture

```
+--------------------------------+       +------------------------+
|  amazon-cart.content           |       |  background.ts          |
|  - extract cart items          |       |  - reviewCart(req)       |
|  - match ASIN → prior goal     |<----->|    → LLM structured call|
|  - intercept Proceed click     |       |  - expiry scan on alarm |
|  - render CartReviewOverlay    |       |  - notification fire    |
|  - perform removals via        |       +------------------------+
|    Amazon's own delete handles |                 |
+--------------------------------+                 |
                                          +---------------+
                                          |  lib/storage   |
                                          |  - logCartRev  |
                                          |  - createHold  |
                                          |  - releaseHold |
                                          +---------------+
```

**New modules:**
- `entrypoints/amazon-cart.content/index.tsx` — content script, runs only on cart URLs.
- `entrypoints/amazon-cart.content/CartReviewOverlay.tsx` — UI component.
- `lib/amazon-cart-selectors.ts` — cart DOM extraction + `removeCartItem`.
- `lib/cart-review-prompt.ts` — system prompt + structured-JSON request/response.

**Modified modules:**
- `lib/types.ts` — extend `SavedItem`, add `CartReview`, add `holdModeEnabled` setting.
- `lib/storage.ts` — new helpers, migration of pre-existing `SavedItem`s.
- `lib/claude.ts` — new `reviewCart(req)` exported function sharing the `ai.languageModel` plumbing.
- `entrypoints/background.ts` — register `reviewCart` message handler; extend alarm to handle hold expiry.
- `entrypoints/amazon.content/InterventionOverlay.tsx` — when `holdModeEnabled`, `handleAddAnyway` creates a hold instead of passing through.
- `entrypoints/amazon.content/index.tsx` — on load, check `getHoldByAsin(asin)`; if active hold, render inline hold-status strip and skip normal interception.
- `entrypoints/popup/App.tsx` — "On ice (N)" section with per-item countdowns and release link.
- `entrypoints/options/App.tsx` — `holdModeEnabled` toggle with explanatory copy.

## 5. Data Flow

### Cart-review happy path
1. User lands on `/gp/cart/view.html`.
2. Content script extracts `CartItem[]` via `extractCartItems()`.
3. Intercepts `#sc-buy-box-ptc-button` click: `preventDefault`, `stopPropagation`.
4. Queries storage: for each cart ASIN, find most recent matching intervention with `decision ∈ {added, saved}`. Attach `priorGoal`.
5. Sends `reviewCart` message to background with `{items, budget, spentToday, monthSpend}`.
6. Background runs LLM pass with `cart-review-prompt`, expects JSON: `{observation, items:[{asin, verdict, reason}]}`.
7. Overlay renders Layout B (row-by-row). Items with `verdict: 'flag'` pre-checked.
8. User hits action button:
   - **Remove selected**: iterate → `removeCartItem(item)` (clicks Amazon's delete in that row). Log one `Intervention{decision:'skipped'}` per removed ASIN so streak/savings counters match product-page behavior. Re-extract cart, update displayed totals. Log a `CartReview` with `decision:'modified'` (or `'emptied'`).
   - **Send to hold** (only if `holdModeEnabled`): iterate → remove from Amazon cart, create `SavedItem{kind:'hold', releaseAt:now+48h}`. Log `CartReview{decision:'modified'}`.
   - **Proceed anyway**: log `CartReview{decision:'proceeded'}`, then `.click()` the real checkout button.

### Hold creation (product page, `holdModeEnabled: true`)
1. User sees `InterventionOverlay`, talks to buddy, still wants it, clicks "Add anyway".
2. `handleAddAnyway` branches on `settings.holdModeEnabled`. If true: skip the pass-through click, create `SavedItem{kind:'hold', releaseAt:now+48h}`, log `Intervention{decision:'held'}`, show a confirmation step in the overlay ("OK — 48h hold. I'll ping you when it's time."), close.

### Hold re-encounter
1. Product-page content script loads. After extracting `ProductInfo`, query `getHoldByAsin(product.asin)`.
2. If active hold found: skip all click interception. Render inline hold-status strip at top of page: "You're sitting with this. `hoursLeft`h left. [Need it now]".
3. If user clicks "Need it now": show one-field modal ("why the emergency?"). On submit: call `releaseHold(id, reason)`, then click the real Add-to-Cart button.

### Hold expiry
1. Existing `chrome.alarms` `check-reminders` (hourly) scans `savedForLater` for `kind==='hold' && releaseAt <= now`.
2. For each expired: fire `chrome.notifications.create` with title "Still want the [title]?", deeplink to product page URL (stored on the item's ProductInfo) or Amazon search fallback. Mark `SavedItem.releaseAt = undefined` so it stops firing (item sits in `savedForLater` as expired-hold until user acts).

## 6. Data Model

```ts
// lib/types.ts additions

export interface SavedItem {
  id: string;
  kind: 'wishlist' | 'hold';       // NEW; default 'wishlist' on migrate
  product: ProductInfo;
  userGoal: string;
  savedAt: number;
  reminderAt: number;              // wishlist: 7d; hold: unused
  releaseAt?: number;              // hold only; undefined after expiry fired
  overrideReason?: string;         // hold only; set by "Need it now"
}

export interface CartReview {
  id: string;
  timestamp: number;
  items: Array<{
    asin: string;
    verdict: 'solid' | 'flag' | 'ask';
    removed: boolean;
    sentToHold: boolean;
  }>;
  observation: string;              // the cross-cart reflection
  cartTotalBefore: number;
  savedAmount: number;              // sum of removed + held item prices
  decision: 'proceeded' | 'modified' | 'emptied';
}

export type InterventionDecision = 'skipped' | 'added' | 'saved' | 'held';  // 'held' NEW

export interface AppSettings {
  dailyBudget: number;
  holdModeEnabled: boolean;         // NEW; default false
}

export interface AppState {
  totalSaved: number;
  currentStreak: number;
  lastSkipDate: string;
  interventions: Intervention[];
  savedForLater: SavedItem[];
  cartReviews: CartReview[];        // NEW; cap 50
  settings: AppSettings;
}
```

**Migration:** `getAll()` in `storage.ts` must default existing `SavedItem`s without `kind` to `'wishlist'` on read, and default `settings.holdModeEnabled` to `false` if absent.

## 7. LLM Prompt

**System prompt** (`lib/cart-review-prompt.ts`):

```
You are the Manic Spending Buddy doing a cart-level review.
The user already told you WHY they added most of these items, one by one.
Your job: cross-cart reflection — things they couldn't see item-by-item.

For EACH item, assign:
  verdict: "solid" | "flag" | "ask"
    - "solid" → the prior goal holds up. Don't manufacture objections.
    - "flag" → something actually wrong: over-budget together, frivolous,
      contradicts a prior goal, or part of a jag pattern.
    - "ask" → no prior goal on record (added via 1-click/inline) and
      you'd want to know why.
  reason: one warm, specific sentence. Refer to the user's own words when
    they're on record. No generic "have you considered not buying this".

Cross-cart OBSERVATION (1-2 sentences):
  - Themes or jag patterns across items
  - Budget math (today / weekly)
  - Frivolity call-outs the user would agree with on reflection
  - Acknowledge what still looks solid

TONE: Warm, specific, slightly irreverent. Like a curious friend. No bullet walls.

Return JSON only:
{ "observation": "...", "items": [{"asin":"...", "verdict":"...", "reason":"..."}] }
```

**User message** includes: daily budget, spent today, Amazon MTD, then a JSON array of `{asin, title, price, priorGoal|null, daysInCart}`.

**Fallback:** on malformed JSON, one retry with `"Return ONLY the JSON, no prose, no markdown fence."` appended. Still malformed → degrade to a text-only summary card; overlay still shows the three action buttons, no per-item badges.

**Size cap:** if `cartItems.length > 15`, send top 15 by `priceNumeric`. Append `"(+N more items totaling $X, not analyzed individually)"` to user message. Keeps under ~4K tokens.

## 8. UI

Layout B from brainstorm:

- **Header:** buddy SVG + "Before you check out —" + `N items · $total · $delta over today's budget`.
- **Observation card:** the LLM's cross-cart `observation` in a single bubble.
- **Item rows:** `[checkbox] title · $price · italic prior-goal quote · verdict line`. Flagged rows pre-checked, `ask` rows have a subtle red left border, `solid` rows have a green check glyph.
- **Truncation:** items beyond 8 collapse behind "…N more items" expander.
- **Action row:**
  - Primary: `Remove selected — save $N` (green).
  - Secondary (only if `holdModeEnabled`): `Send selected to 48h hold`.
  - Tertiary: `Proceed anyway` (small gray).
- **Styling:** reuse `#fffbf5` palette, same animations, same font stack as `InterventionOverlay`. Styles scoped via `#msb-cart-overlay-root` prefix to avoid collisions with the product-page overlay if both ever co-exist.

Popup additions:
- New `On ice (N)` section above `Saved for later`, lists each held item with countdown (`31h left`), product image, and a subtle `Release` link.
- Empty state when N=0 collapses the section.

Options additions:
- Toggle: `Second-thought mode — give impulse buys a 48-hour hold`. Help text: `When on, "Add anyway" puts the item on ice for 48 hours instead of adding it right now. You'll get a heads-up when time's up. You can always release early if it's a real emergency.`

## 9. Error Handling & Edge Cases

- **0 cart items extracted** → fail open, click-through, no overlay (avoids breaking empty-cart navigation).
- **LLM >8s timeout** → overlay renders with text-only summary (`$total, N items, X% of budget today`), no per-item verdicts, action buttons still functional.
- **LLM unavailable** (`ai.languageModel` returns `'unsupported'`/`'no'`) → same text-only degraded path.
- **Amazon changes `.sc-list-item` class** → broad fallback `form#activeCartViewForm [data-asin]`. If zero items extract but `#sc-buy-box-ptc-button` exists, fail open.
- **User manually deletes items while overlay is open** → don't re-render mid-review (jumpy). On action submit, re-extract cart to reconcile selected ASINs against current DOM.
- **Multiple tabs on cart** → each overlay is independent; `chrome.storage.local` syncs, so holds created in one tab show in another tab's popup after next read.
- **Held item ASIN appears in a new cart via different Amazon path** → content script's per-page hold check intercepts before the user can proceed.
- **Expired hold with dead deeplink URL** → notification includes title text for Amazon search fallback.
- **Quantity > 1 in cart** → `priceNumeric` for cart reviews uses `unitPrice × quantity`. Removal removes the row entirely (Amazon's delete is row-level, not quantity-decrement).
- **Storage quota** → interventions capped at 100 (existing), cartReviews at 50 (new). Combined JSON footprint stays well under the 5MB `chrome.storage.local` budget.

## 10. Testing Plan

- **Unit-level**: `amazon-cart-selectors` against saved cart-page HTML fixtures (1 item, 5 items, 15+ items, quantity>1).
- **Prompt response parsing**: feed representative LLM JSON outputs (including malformed + partial) through the parser, verify fallback paths.
- **Manual (per staleness-prevention.md)**: build → sync `chrome-extension/` (see memory note) → load unpacked → open Amazon cart with ≥3 items, some with prior interventions, some without. Verify:
  1. Overlay shows on "Proceed to checkout" click.
  2. Prior goals appear in rows for ASINs with logged interventions.
  3. LLM responds within 3s for typical carts.
  4. "Remove selected" actually deletes items from Amazon's cart and logs interventions.
  5. Empty-cart case clicks through cleanly.
  6. Hold mode off: "Add anyway" on product page still passes through.
  7. Hold mode on: "Add anyway" creates a hold; re-visiting the product page shows the hold strip; countdown is correct; "Need it now" releases and adds to cart; expiry notification fires after time travel (temporarily set 1-minute hold for testing).

## 11. Open Questions (to resolve in plan)

- Exact Amazon cart DOM selectors on current Amazon.com (validated when plan is written by inspecting live DOM).
- Whether `chrome.notifications` requires any new manifest permissions beyond existing set.
- Whether `chrome.storage.local` migration for existing users needs a one-shot on extension update or can be lazy per-read (lean: lazy).

## 12. File Change Summary

**New:**
- `mvp/entrypoints/amazon-cart.content/index.tsx`
- `mvp/entrypoints/amazon-cart.content/CartReviewOverlay.tsx`
- `mvp/lib/amazon-cart-selectors.ts`
- `mvp/lib/cart-review-prompt.ts`

**Modified:**
- `mvp/lib/types.ts` — `SavedItem`, `CartReview`, `AppSettings`, `AppState`, `InterventionDecision`.
- `mvp/lib/storage.ts` — `logCartReview`, `createHold`, `releaseHold`, `getActiveHolds`, `getHoldByAsin`; lazy `kind` migration.
- `mvp/lib/claude.ts` — `reviewCart(req)` export sharing `ai.languageModel` plumbing.
- `mvp/entrypoints/background.ts` — `reviewCart` message handler; extend alarm handler for hold expiry + notification firing.
- `mvp/entrypoints/amazon.content/InterventionOverlay.tsx` — hold-mode branching in `handleAddAnyway`.
- `mvp/entrypoints/amazon.content/index.tsx` — hold-status strip for held ASINs.
- `mvp/entrypoints/popup/App.tsx` — "On ice" section.
- `mvp/entrypoints/options/App.tsx` — hold-mode toggle.
- `mvp/utils/messaging.ts` — register `reviewCart`, `createHold`, `releaseHold`, `getHoldByAsin` message types.

Cart content-script URL matches (`*://*.amazon.com/gp/cart/*`, `*://*.amazon.com/cart*`) are declared inside `entrypoints/amazon-cart.content/index.tsx` via `defineContentScript({ matches: [...] })`, per WXT's file-based entrypoint convention — no `wxt.config.ts` changes required. `chrome.notifications` permission will need to be verified during planning — if absent from the current manifest, add it.

# Cart-Page Interception + 48h Hold Rule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cart-page "goalie" intervention (Layout B: row-by-row with prior-goal reuse and per-item LLM verdicts) and an opt-in 48-hour hold rule that holds `Add anyway` clicks for 48h before releasing.

**Architecture:** New WXT content script on Amazon cart URLs extracts cart items, matches each ASIN against the existing intervention log to surface the user's own prior stated goals, and runs one on-device Gemini Nano pass (`ai.languageModel`) returning structured per-item verdicts plus one cross-cart observation. Opt-in hold mode extends `SavedItem` with a `kind` discriminator; expiry fires a Chrome notification rather than auto-purchasing. Shipped end-to-end manually via `pnpm build` + sync to `chrome-extension/` per the project's staleness-prevention workflow.

**Tech Stack:** WXT 0.20, React 19, TypeScript 5.9, `@webext-core/messaging`, `chrome.storage.local`, `chrome.alarms`, `chrome.notifications`, Chrome built-in AI (`ai.languageModel`). Vitest added for pure-logic unit tests only (selectors, prompt parsing, storage migration, budget math). UI + DOM interception code is verified manually via the reload-and-test loop.

**Project notes:**
- The project is **not** a git repository — `git commit` steps are replaced with `pnpm build && verify` checkpoints.
- **Build sync is load-bearing:** after every `pnpm build`, the script copies `.output/chrome-mv3/` into `chrome-extension/`. The user loads the unpacked extension from `chrome-extension/`. Never skip this sync.
- `mvp/` is the extension root. All paths below are relative to `/Users/codyhergenroeder/code/claude/manicspendingbuddy/` unless stated.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `mvp/entrypoints/amazon-cart.content/index.tsx` | Content script for cart URLs: extract, intercept, mount overlay |
| `mvp/entrypoints/amazon-cart.content/CartReviewOverlay.tsx` | React overlay (Layout B) + scoped CSS |
| `mvp/lib/amazon-cart-selectors.ts` | `extractCartItems()`, `removeCartItem()`, `findProceedToCheckoutButton()` |
| `mvp/lib/cart-review-prompt.ts` | System prompt + JSON parsing for `reviewCart` |
| `mvp/lib/hold.ts` | Hold lifecycle: `createHold`, `releaseHold`, `getActiveHolds`, `getHoldByAsin`, `scanExpiredHolds` |
| `mvp/lib/__fixtures__/cart-sample-3items.html` | Static cart DOM snapshot for selector tests |
| `mvp/lib/__fixtures__/cart-sample-empty.html` | Empty cart fixture |
| `mvp/lib/amazon-cart-selectors.test.ts` | Vitest tests against fixtures |
| `mvp/lib/cart-review-prompt.test.ts` | JSON parse + fallback tests |
| `mvp/lib/hold.test.ts` | Storage-level hold lifecycle tests |
| `mvp/vitest.config.ts` | Vitest config with jsdom + path alias |

**Modified files:**

| Path | Change |
|---|---|
| `mvp/package.json` | Add vitest, jsdom, @testing-library/dom; `test` script |
| `mvp/wxt.config.ts` | Add `chrome.notifications` permission |
| `mvp/lib/types.ts` | Extend `SavedItem`, add `CartReview`, add `holdModeEnabled`, add `'held'` to `Intervention.decision` |
| `mvp/lib/storage.ts` | Lazy `kind` migration; `logCartReview`; re-export hold helpers |
| `mvp/lib/claude.ts` | `reviewCart(req)` export sharing `ai.languageModel` plumbing |
| `mvp/entrypoints/background.ts` | `reviewCart` handler; extend alarm for hold expiry + notification |
| `mvp/entrypoints/amazon.content/InterventionOverlay.tsx` | `handleAddAnyway` branches on `holdModeEnabled` |
| `mvp/entrypoints/amazon.content/index.tsx` | Check `getHoldByAsin`; render hold-status strip if active |
| `mvp/entrypoints/popup/App.tsx` | "On ice (N)" section with countdowns |
| `mvp/entrypoints/popup/style.css` | Styles for the on-ice section |
| `mvp/entrypoints/options/App.tsx` | `holdModeEnabled` toggle |
| `mvp/utils/messaging.ts` | New message types: `reviewCart`, `createHold`, `releaseHold`, `getHoldByAsin` |

---

## Task 1: Vitest scaffolding

**Files:**
- Modify: `mvp/package.json`
- Create: `mvp/vitest.config.ts`
- Create: `mvp/lib/__fixtures__/.gitkeep` (empty, just to create dir)
- Create: `mvp/lib/types-smoke.test.ts` (smoke test to confirm harness works)

- [ ] **Step 1: Add dev dependencies**

Run (from `mvp/`):
```bash
pnpm add -D vitest@^2 jsdom@^25 @testing-library/dom@^10
```

- [ ] **Step 2: Add `test` script**

Edit `mvp/package.json`, add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `mvp/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
});
```

- [ ] **Step 4: Write a smoke test**

Create `mvp/lib/types-smoke.test.ts`:
```ts
import { expect, test } from 'vitest';

test('vitest is wired up', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Run it to confirm it passes**

Run (from `mvp/`): `pnpm test`
Expected: 1 passing test.

- [ ] **Step 6: Run `pnpm compile` to confirm TS is still clean**

Expected: no output (zero errors).

---

## Task 2: Data model changes in `lib/types.ts`

**Files:**
- Modify: `mvp/lib/types.ts`

- [ ] **Step 1: Extend `SavedItem` with `kind` + `releaseAt` + `overrideReason`**

Replace the existing `SavedItem` interface in `mvp/lib/types.ts` with:

```ts
export interface SavedItem {
  id: string;
  kind: 'wishlist' | 'hold';
  product: ProductInfo;
  userGoal: string;
  savedAt: number;
  reminderAt: number;       // wishlist: 7d; hold: unused
  releaseAt?: number;       // hold only; undefined after expiry has fired
  overrideReason?: string;  // hold only; populated by "Need it now"
}
```

- [ ] **Step 2: Add `'held'` to `Intervention.decision` union**

Replace the existing `Intervention` interface with:

```ts
export interface Intervention {
  id: string;
  timestamp: number;
  product: ProductInfo;
  userGoal: string;
  claudeResponse: string;
  decision: 'skipped' | 'added' | 'saved' | 'held';
  savedAmount: number;
}
```

- [ ] **Step 3: Add `CartReview` interface**

Append to `mvp/lib/types.ts`:

```ts
export interface CartReviewItem {
  asin: string;
  verdict: 'solid' | 'flag' | 'ask';
  removed: boolean;
  sentToHold: boolean;
}

export interface CartReview {
  id: string;
  timestamp: number;
  items: CartReviewItem[];
  observation: string;
  cartTotalBefore: number;
  savedAmount: number;
  decision: 'proceeded' | 'modified' | 'emptied';
}
```

- [ ] **Step 4: Add `holdModeEnabled` to `AppSettings` and `cartReviews` to `AppState`**

Replace the `AppSettings` and `AppState` interfaces with:

```ts
export interface AppSettings {
  dailyBudget: number;
  holdModeEnabled: boolean;
}

export interface AppState {
  totalSaved: number;
  currentStreak: number;
  lastSkipDate: string;
  interventions: Intervention[];
  savedForLater: SavedItem[];
  cartReviews: CartReview[];
  settings: AppSettings;
}
```

- [ ] **Step 5: Run `pnpm compile`**

Expected: errors pointing at `mvp/lib/storage.ts` (missing `cartReviews` in DEFAULT_STATE, missing `holdModeEnabled`, missing `kind` handling) and at `mvp/entrypoints/popup/App.tsx`. These get fixed in Task 3 and later tasks — this is expected.

---

## Task 3: Storage migration + defaults in `lib/storage.ts`

**Files:**
- Modify: `mvp/lib/storage.ts`
- Create: `mvp/lib/storage.test.ts`

- [ ] **Step 1: Write the failing test for lazy `kind` migration**

Create `mvp/lib/storage.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const chromeStorageMock = (() => {
  let store: Record<string, unknown> = {};
  return {
    get: vi.fn(async (key: string) => ({ [key]: store[key] })),
    set: vi.fn(async (obj: Record<string, unknown>) => { store = { ...store, ...obj }; }),
    _reset: () => { store = {}; },
    _set: (key: string, value: unknown) => { store[key] = value; },
  };
})();

beforeEach(() => {
  chromeStorageMock._reset();
  (globalThis as unknown as { chrome: { storage: { local: typeof chromeStorageMock } } }).chrome = {
    storage: { local: chromeStorageMock },
  };
});

afterEach(() => { vi.restoreAllMocks(); });

describe('storage migration', () => {
  test('legacy SavedItem without kind is read as wishlist', async () => {
    chromeStorageMock._set('appState', {
      savedForLater: [
        { id: 'a', product: { title: 't', price: '$1', priceNumeric: 1, imageUrl: '', asin: 'X', category: '' }, userGoal: 'g', savedAt: 1, reminderAt: 2 },
      ],
    });
    const { getState } = await import('./storage');
    const state = await getState();
    expect(state.savedForLater[0].kind).toBe('wishlist');
  });

  test('legacy AppSettings without holdModeEnabled defaults to false', async () => {
    chromeStorageMock._set('appState', { settings: { dailyBudget: 50 } });
    const { getState } = await import('./storage');
    const state = await getState();
    expect(state.settings.holdModeEnabled).toBe(false);
  });

  test('empty state returns default shape including cartReviews=[]', async () => {
    const { getState } = await import('./storage');
    const state = await getState();
    expect(state.cartReviews).toEqual([]);
    expect(state.settings.holdModeEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests — they should fail**

Run (from `mvp/`): `pnpm test -- lib/storage.test.ts`
Expected: 3 failing tests (`kind` is undefined, `holdModeEnabled` is undefined, etc.).

- [ ] **Step 3: Update `DEFAULT_SETTINGS` and `DEFAULT_STATE`**

In `mvp/lib/storage.ts`, replace the constants:
```ts
const DEFAULT_SETTINGS: AppSettings = {
  dailyBudget: 20,
  holdModeEnabled: false,
};

const DEFAULT_STATE: AppState = {
  totalSaved: 0,
  currentStreak: 0,
  lastSkipDate: '',
  interventions: [],
  savedForLater: [],
  cartReviews: [],
  settings: DEFAULT_SETTINGS,
};
```

- [ ] **Step 4: Add lazy migration inside `getAll()`**

Replace the existing `getAll()` in `mvp/lib/storage.ts`:
```ts
async function getAll(): Promise<AppState> {
  const result = await chrome.storage.local.get('appState');
  const merged: AppState = { ...DEFAULT_STATE, ...(result.appState as Partial<AppState>) };
  merged.settings = { ...DEFAULT_SETTINGS, ...(merged.settings ?? {}) };
  merged.savedForLater = (merged.savedForLater ?? []).map((item) => ({
    ...item,
    kind: item.kind ?? 'wishlist',
  }));
  merged.cartReviews = merged.cartReviews ?? [];
  return merged;
}
```

- [ ] **Step 5: Run tests — they should pass**

Run: `pnpm test -- lib/storage.test.ts`
Expected: 3 passing tests.

- [ ] **Step 6: Add `logCartReview` helper to `lib/storage.ts`**

Append to `mvp/lib/storage.ts`:
```ts
export async function logCartReview(review: CartReview): Promise<void> {
  const state = await getAll();
  state.cartReviews.unshift(review);
  if (state.cartReviews.length > 50) state.cartReviews = state.cartReviews.slice(0, 50);
  state.totalSaved += review.savedAmount;
  await saveAll(state);
}
```

Add `CartReview` to the import at the top of the file.

- [ ] **Step 7: Write and run a test for `logCartReview`**

Append to `mvp/lib/storage.test.ts`:
```ts
test('logCartReview caps at 50 and increments totalSaved', async () => {
  const { logCartReview, getState } = await import('./storage');
  for (let i = 0; i < 52; i++) {
    await logCartReview({
      id: `r${i}`,
      timestamp: i,
      items: [],
      observation: '',
      cartTotalBefore: 10,
      savedAmount: 1,
      decision: 'modified',
    });
  }
  const state = await getState();
  expect(state.cartReviews.length).toBe(50);
  expect(state.totalSaved).toBe(52);
});
```

Run: `pnpm test -- lib/storage.test.ts`
Expected: 4 passing tests.

---

## Task 4: Hold lifecycle in `lib/hold.ts`

**Files:**
- Create: `mvp/lib/hold.ts`
- Create: `mvp/lib/hold.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mvp/lib/hold.test.ts`:
```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

const chromeStorageMock = (() => {
  let store: Record<string, unknown> = {};
  return {
    get: vi.fn(async (key: string) => ({ [key]: store[key] })),
    set: vi.fn(async (obj: Record<string, unknown>) => { store = { ...store, ...obj }; }),
    _reset: () => { store = {}; },
  };
})();

beforeEach(() => {
  chromeStorageMock._reset();
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local: chromeStorageMock } };
  vi.resetModules();
});

const product = {
  title: 'Fan', price: '$45', priceNumeric: 45, imageUrl: '', asin: 'B001', category: '',
};

describe('hold lifecycle', () => {
  test('createHold produces SavedItem with kind=hold and releaseAt=+48h', async () => {
    const { createHold } = await import('./hold');
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const item = await createHold({ product, userGoal: 'impulse' });
    expect(item.kind).toBe('hold');
    expect(item.releaseAt).toBe(now + 48 * 60 * 60 * 1000);
    expect(item.product.asin).toBe('B001');
  });

  test('getHoldByAsin returns active hold, ignores expired', async () => {
    const { createHold, getHoldByAsin } = await import('./hold');
    vi.spyOn(Date, 'now').mockReturnValue(100);
    await createHold({ product, userGoal: 'g' });
    const found = await getHoldByAsin('B001');
    expect(found?.product.asin).toBe('B001');

    vi.spyOn(Date, 'now').mockReturnValue(100 + 49 * 60 * 60 * 1000);
    const expired = await getHoldByAsin('B001');
    expect(expired).toBeNull();
  });

  test('releaseHold clears releaseAt and stores overrideReason', async () => {
    const { createHold, releaseHold, getActiveHolds } = await import('./hold');
    const item = await createHold({ product, userGoal: 'g' });
    await releaseHold(item.id, 'dog food, 11pm');
    const active = await getActiveHolds();
    expect(active).toEqual([]);
  });

  test('scanExpiredHolds returns items past releaseAt with releaseAt still set', async () => {
    const { createHold, scanExpiredHolds } = await import('./hold');
    vi.spyOn(Date, 'now').mockReturnValue(100);
    await createHold({ product, userGoal: 'g' });
    vi.spyOn(Date, 'now').mockReturnValue(100 + 49 * 60 * 60 * 1000);
    const expired = await scanExpiredHolds();
    expect(expired).toHaveLength(1);
    expect(expired[0].product.asin).toBe('B001');
  });
});
```

- [ ] **Step 2: Run tests — they should fail (module missing)**

Run: `pnpm test -- lib/hold.test.ts`
Expected: module-resolution failures.

- [ ] **Step 3: Implement `mvp/lib/hold.ts`**

```ts
import type { ProductInfo, SavedItem } from './types';

const HOLD_MS = 48 * 60 * 60 * 1000;

async function getAllSaved(): Promise<SavedItem[]> {
  const result = await chrome.storage.local.get('appState');
  const state = (result.appState as { savedForLater?: SavedItem[] } | undefined) ?? {};
  return (state.savedForLater ?? []).map((item) => ({ ...item, kind: item.kind ?? 'wishlist' }));
}

async function setAllSaved(items: SavedItem[]): Promise<void> {
  const existing = (await chrome.storage.local.get('appState')).appState ?? {};
  await chrome.storage.local.set({ appState: { ...existing, savedForLater: items } });
}

export async function createHold({ product, userGoal }: { product: ProductInfo; userGoal: string }): Promise<SavedItem> {
  const now = Date.now();
  const item: SavedItem = {
    id: crypto.randomUUID(),
    kind: 'hold',
    product,
    userGoal,
    savedAt: now,
    reminderAt: 0,
    releaseAt: now + HOLD_MS,
  };
  const items = await getAllSaved();
  items.unshift(item);
  await setAllSaved(items);
  return item;
}

export async function releaseHold(id: string, overrideReason: string): Promise<void> {
  const items = await getAllSaved();
  const next = items.map((it) =>
    it.id === id ? { ...it, releaseAt: undefined, overrideReason } : it,
  );
  await setAllSaved(next);
}

export async function getActiveHolds(): Promise<SavedItem[]> {
  const now = Date.now();
  const items = await getAllSaved();
  return items.filter((it) => it.kind === 'hold' && it.releaseAt != null && it.releaseAt > now);
}

export async function getHoldByAsin(asin: string): Promise<SavedItem | null> {
  const active = await getActiveHolds();
  return active.find((it) => it.product.asin === asin) ?? null;
}

export async function scanExpiredHolds(): Promise<SavedItem[]> {
  const now = Date.now();
  const items = await getAllSaved();
  return items.filter((it) => it.kind === 'hold' && it.releaseAt != null && it.releaseAt <= now);
}

export async function markHoldNotified(id: string): Promise<void> {
  const items = await getAllSaved();
  const next = items.map((it) =>
    it.id === id ? { ...it, releaseAt: undefined } : it,
  );
  await setAllSaved(next);
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `pnpm test -- lib/hold.test.ts`
Expected: 4 passing tests.

- [ ] **Step 5: Run `pnpm compile`**

Expected: clean.

---

## Task 5: Cart DOM selectors

**Files:**
- Create: `mvp/lib/__fixtures__/cart-sample-3items.html`
- Create: `mvp/lib/amazon-cart-selectors.ts`
- Create: `mvp/lib/amazon-cart-selectors.test.ts`

- [ ] **Step 1: Create the fixture**

`mvp/lib/__fixtures__/cart-sample-3items.html`:
```html
<form name="activeCartViewForm" id="activeCartViewForm">
  <div class="sc-list-item" data-asin="B001">
    <img class="sc-product-image" src="https://m.media-amazon.com/img/1.jpg" />
    <span class="sc-product-title"><span class="a-truncate-full">Drawer Organizer Set</span></span>
    <span class="sc-price"><span class="a-offscreen">$18.00</span></span>
    <input type="hidden" name="quantity" value="1" />
    <input type="submit" value="Delete" class="sc-action-delete-input" />
  </div>
  <div class="sc-list-item" data-asin="B002">
    <img class="sc-product-image" src="https://m.media-amazon.com/img/2.jpg" />
    <span class="sc-product-title"><span class="a-truncate-full">Spice Rack</span></span>
    <span class="sc-price"><span class="a-offscreen">$32.00</span></span>
    <input type="hidden" name="quantity" value="1" />
    <input type="submit" value="Delete" class="sc-action-delete-input" />
  </div>
  <div class="sc-list-item" data-asin="B003">
    <img class="sc-product-image" src="https://m.media-amazon.com/img/3.jpg" />
    <span class="sc-product-title"><span class="a-truncate-full">Mini Desk Fan</span></span>
    <span class="sc-price"><span class="a-offscreen">$45.00</span></span>
    <input type="hidden" name="quantity" value="2" />
    <input type="submit" value="Delete" class="sc-action-delete-input" />
  </div>
  <input id="sc-buy-box-ptc-button" type="submit" value="Proceed to checkout" />
</form>
```

- [ ] **Step 2: Write the failing tests**

Create `mvp/lib/amazon-cart-selectors.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, test } from 'vitest';

function loadFixture(name: string) {
  const url = new URL(`./__fixtures__/${name}`, import.meta.url);
  document.body.innerHTML = readFileSync(fileURLToPath(url), 'utf8');
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('extractCartItems', () => {
  test('returns one item per row with asin, title, price, quantity, deleteHandle', async () => {
    loadFixture('cart-sample-3items.html');
    const { extractCartItems } = await import('./amazon-cart-selectors');
    const items = extractCartItems();
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      asin: 'B001',
      title: 'Drawer Organizer Set',
      price: '$18.00',
      priceNumeric: 18,
      quantity: 1,
    });
    expect(items[2].quantity).toBe(2);
    expect(items[0].deleteHandle).not.toBeNull();
  });

  test('returns empty array when cart has no items', () => {
    document.body.innerHTML = '<form id="activeCartViewForm"></form>';
    return import('./amazon-cart-selectors').then(({ extractCartItems }) => {
      expect(extractCartItems()).toEqual([]);
    });
  });
});

describe('findProceedToCheckoutButton', () => {
  test('finds the PTC button', async () => {
    loadFixture('cart-sample-3items.html');
    const { findProceedToCheckoutButton } = await import('./amazon-cart-selectors');
    expect(findProceedToCheckoutButton()).not.toBeNull();
  });
});

describe('removeCartItem', () => {
  test('clicks the delete handle when present', async () => {
    loadFixture('cart-sample-3items.html');
    const { extractCartItems, removeCartItem } = await import('./amazon-cart-selectors');
    const items = extractCartItems();
    let clicked = false;
    items[0].deleteHandle!.addEventListener('click', () => { clicked = true; });
    removeCartItem(items[0]);
    expect(clicked).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests — they should fail (module missing)**

Run: `pnpm test -- lib/amazon-cart-selectors.test.ts`

- [ ] **Step 4: Implement `mvp/lib/amazon-cart-selectors.ts`**

```ts
export interface CartItem {
  asin: string;
  title: string;
  price: string;
  priceNumeric: number;
  quantity: number;
  imageUrl: string;
  deleteHandle: HTMLElement | null;
}

function textIn(row: Element, ...selectors: string[]): string {
  for (const sel of selectors) {
    const el = row.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function attrIn(row: Element, attr: string, ...selectors: string[]): string {
  for (const sel of selectors) {
    const el = row.querySelector(sel);
    const val = el?.getAttribute(attr);
    if (val) return val;
  }
  return '';
}

function priceToNumber(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

export function extractCartItems(): CartItem[] {
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>('form#activeCartViewForm [data-asin], .sc-list-item[data-asin]'),
  );
  const seen = new Set<string>();
  const items: CartItem[] = [];
  for (const row of rows) {
    const asin = row.getAttribute('data-asin') ?? '';
    if (!asin || seen.has(asin)) continue;
    seen.add(asin);
    const title = textIn(row, '.a-truncate-full', '.sc-product-title', '.sc-product-link');
    const price = textIn(row, '.sc-price .a-offscreen', '.a-price .a-offscreen', '.sc-price');
    const qtyInput = row.querySelector<HTMLInputElement>(
      'input[name="quantity"], select[name="quantity"]',
    );
    const quantity = qtyInput?.value ? parseInt(qtyInput.value, 10) || 1 : 1;
    const imageUrl = attrIn(row, 'src', '.sc-product-image img', 'img');
    const deleteHandle = row.querySelector<HTMLElement>(
      '.sc-action-delete-input, input[value="Delete"], [data-action="delete"] input',
    );
    items.push({
      asin,
      title,
      price,
      priceNumeric: priceToNumber(price) * quantity,
      quantity,
      imageUrl,
      deleteHandle,
    });
  }
  return items;
}

export function findProceedToCheckoutButton(): HTMLElement | null {
  const selectors = [
    '#sc-buy-box-ptc-button',
    'input[name="proceedToRetailCheckout"]',
    '[data-feature-id="proceed-to-checkout-action"] input',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

export function removeCartItem(item: CartItem): boolean {
  if (item.deleteHandle) {
    item.deleteHandle.click();
    return true;
  }
  return false;
}
```

- [ ] **Step 5: Run tests — they should pass**

Run: `pnpm test -- lib/amazon-cart-selectors.test.ts`
Expected: 4 passing tests.

---

## Task 6: Cart-review prompt + JSON parsing

**Files:**
- Create: `mvp/lib/cart-review-prompt.ts`
- Create: `mvp/lib/cart-review-prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mvp/lib/cart-review-prompt.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { parseCartReviewResponse, buildCartReviewUserMessage, CART_REVIEW_SYSTEM_PROMPT } from './cart-review-prompt';

describe('cart-review prompt', () => {
  test('system prompt mentions verdict vocabulary and JSON-only', () => {
    expect(CART_REVIEW_SYSTEM_PROMPT).toMatch(/solid/);
    expect(CART_REVIEW_SYSTEM_PROMPT).toMatch(/flag/);
    expect(CART_REVIEW_SYSTEM_PROMPT).toMatch(/ask/);
    expect(CART_REVIEW_SYSTEM_PROMPT).toMatch(/JSON/);
  });

  test('buildCartReviewUserMessage includes budget + each ASIN + prior goal', () => {
    const msg = buildCartReviewUserMessage({
      items: [{ asin: 'B1', title: 'x', priceNumeric: 10, priorGoal: 'organize desk', daysInCart: 1 }],
      dailyBudget: 20,
      spentToday: 5,
      monthSpend: 300,
    });
    expect(msg).toMatch(/B1/);
    expect(msg).toMatch(/organize desk/);
    expect(msg).toMatch(/\$20/);
  });

  test('parseCartReviewResponse handles clean JSON', () => {
    const raw = JSON.stringify({
      observation: 'mostly kitchen',
      items: [{ asin: 'B1', verdict: 'solid', reason: 'fine' }],
    });
    const parsed = parseCartReviewResponse(raw);
    expect(parsed.observation).toBe('mostly kitchen');
    expect(parsed.items[0].verdict).toBe('solid');
  });

  test('parseCartReviewResponse strips markdown fences', () => {
    const raw = '```json\n{"observation":"x","items":[]}\n```';
    const parsed = parseCartReviewResponse(raw);
    expect(parsed.observation).toBe('x');
  });

  test('parseCartReviewResponse throws on invalid JSON', () => {
    expect(() => parseCartReviewResponse('not json')).toThrow();
  });

  test('parseCartReviewResponse coerces unknown verdict to ask', () => {
    const raw = JSON.stringify({
      observation: '',
      items: [{ asin: 'B1', verdict: 'nope', reason: 'r' }],
    });
    const parsed = parseCartReviewResponse(raw);
    expect(parsed.items[0].verdict).toBe('ask');
  });
});
```

- [ ] **Step 2: Run — they should fail**

Run: `pnpm test -- lib/cart-review-prompt.test.ts`

- [ ] **Step 3: Implement `mvp/lib/cart-review-prompt.ts`**

```ts
export const CART_REVIEW_SYSTEM_PROMPT = `You are the Manic Spending Buddy doing a cart-level review.
The user already told you WHY they added most of these items, one by one.
Your job: cross-cart reflection — things they couldn't see item-by-item.

For EACH item, assign:
  verdict: "solid" | "flag" | "ask"
    - "solid" -> the prior goal holds up. Do not manufacture objections.
    - "flag" -> something actually wrong: over-budget together, frivolous,
      contradicts a prior goal, or part of a jag pattern.
    - "ask" -> no prior goal on record (added via 1-click / inline) and
      you would want to know why.
  reason: one warm, specific sentence. Refer to the user's own words when
    they are on record. No generic "have you considered not buying this".

Cross-cart OBSERVATION (1-2 sentences):
  - Themes or jag patterns across items
  - Budget math (today / weekly)
  - Frivolity call-outs the user would agree with on reflection
  - Acknowledge what still looks solid

TONE: Warm, specific, slightly irreverent. Like a curious friend. No bullet walls.

Return JSON only:
{ "observation": "...", "items": [{"asin":"...", "verdict":"...", "reason":"..."}] }`;

export interface CartReviewRequestItem {
  asin: string;
  title: string;
  priceNumeric: number;
  priorGoal: string | null;
  daysInCart: number;
}

export interface CartReviewRequest {
  items: CartReviewRequestItem[];
  dailyBudget: number;
  spentToday: number;
  monthSpend: number;
}

export interface ParsedCartReviewItem {
  asin: string;
  verdict: 'solid' | 'flag' | 'ask';
  reason: string;
}

export interface ParsedCartReview {
  observation: string;
  items: ParsedCartReviewItem[];
}

const MAX_ITEMS = 15;

export function buildCartReviewUserMessage(req: CartReviewRequest): string {
  const sorted = [...req.items].sort((a, b) => b.priceNumeric - a.priceNumeric);
  const top = sorted.slice(0, MAX_ITEMS);
  const extra = sorted.slice(MAX_ITEMS);
  const extraTotal = extra.reduce((s, it) => s + it.priceNumeric, 0);
  const totalAll = sorted.reduce((s, it) => s + it.priceNumeric, 0);

  const header = [
    `Daily discretionary budget: $${req.dailyBudget}`,
    `Spent today: $${req.spentToday}`,
    `Amazon this month: $${req.monthSpend}`,
    `Cart total: $${totalAll.toFixed(2)} across ${req.items.length} items`,
  ].join('\n');

  const itemsJson = JSON.stringify(
    top.map((it) => ({
      asin: it.asin,
      title: it.title,
      price: it.priceNumeric,
      priorGoal: it.priorGoal,
      daysInCart: it.daysInCart,
    })),
    null,
    2,
  );

  const tail = extra.length
    ? `\n(+${extra.length} more items totaling $${extraTotal.toFixed(2)}, not analyzed individually)`
    : '';

  return `${header}\n\nItems:\n${itemsJson}${tail}`;
}

export function parseCartReviewResponse(raw: string): ParsedCartReview {
  const stripped = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const data = JSON.parse(stripped) as { observation?: unknown; items?: unknown };
  const observation = typeof data.observation === 'string' ? data.observation : '';
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: ParsedCartReviewItem[] = rawItems.map((raw) => {
    const obj = raw as { asin?: unknown; verdict?: unknown; reason?: unknown };
    const verdictRaw = typeof obj.verdict === 'string' ? obj.verdict : '';
    const verdict: ParsedCartReviewItem['verdict'] =
      verdictRaw === 'solid' || verdictRaw === 'flag' ? verdictRaw : 'ask';
    return {
      asin: typeof obj.asin === 'string' ? obj.asin : '',
      verdict,
      reason: typeof obj.reason === 'string' ? obj.reason : '',
    };
  });
  return { observation, items };
}
```

- [ ] **Step 4: Run — they should pass**

Run: `pnpm test -- lib/cart-review-prompt.test.ts`
Expected: 6 passing tests.

---

## Task 7: `reviewCart` in `lib/claude.ts`

**Files:**
- Modify: `mvp/lib/claude.ts`

- [ ] **Step 1: Add `reviewCart` export**

Append to `mvp/lib/claude.ts`:

```ts
import {
  CART_REVIEW_SYSTEM_PROMPT,
  type CartReviewRequest,
  type ParsedCartReview,
  buildCartReviewUserMessage,
  parseCartReviewResponse,
} from './cart-review-prompt';

const CART_REVIEW_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export async function reviewCart(req: CartReviewRequest): Promise<ParsedCartReview> {
  const availability = await checkAIAvailability();
  if (availability === 'unsupported' || availability === 'no') {
    throw new Error('AI_UNAVAILABLE');
  }

  const session = await ai.languageModel.create({
    systemPrompt: CART_REVIEW_SYSTEM_PROMPT,
  });

  const userMessage = buildCartReviewUserMessage(req);

  try {
    let raw = await withTimeout(session.prompt(userMessage), CART_REVIEW_TIMEOUT_MS, 'cart review');
    try {
      return parseCartReviewResponse(raw);
    } catch {
      raw = await withTimeout(
        session.prompt('Return ONLY the JSON, no prose, no markdown fence.'),
        CART_REVIEW_TIMEOUT_MS,
        'cart review retry',
      );
      return parseCartReviewResponse(raw);
    }
  } finally {
    session.destroy();
  }
}
```

- [ ] **Step 2: Run `pnpm compile`**

Expected: clean.

---

## Task 8: Messaging protocol additions

**Files:**
- Modify: `mvp/utils/messaging.ts`

- [ ] **Step 1: Add new message types**

Replace `mvp/utils/messaging.ts` contents with:

```ts
import { defineExtensionMessaging, ProtocolWithReturn } from '@webext-core/messaging';
import type {
  AppSettings,
  AppState,
  CartReview,
  Intervention,
  ProductInfo,
  SavedItem,
} from '@/lib/types';
import type { AIAvailability } from '@/lib/claude';
import type { CartReviewRequest, ParsedCartReview } from '@/lib/cart-review-prompt';

export interface AnalyzePurchaseData {
  product: ProductInfo;
  userGoal: string;
  dailyBudget: number;
  spentToday: number;
}

export type StateResponse = AppState & { spentToday: number };

export interface CreateHoldData {
  product: ProductInfo;
  userGoal: string;
}

export interface ReleaseHoldData {
  id: string;
  overrideReason: string;
}

interface ProtocolMap {
  analyzePurchase: ProtocolWithReturn<AnalyzePurchaseData, string>;
  reviewCart: ProtocolWithReturn<CartReviewRequest, ParsedCartReview>;
  getState: ProtocolWithReturn<void, StateResponse>;
  logIntervention: ProtocolWithReturn<Intervention, void>;
  logCartReview: ProtocolWithReturn<CartReview, void>;
  saveForLater: ProtocolWithReturn<SavedItem, void>;
  createHold: ProtocolWithReturn<CreateHoldData, SavedItem>;
  releaseHold: ProtocolWithReturn<ReleaseHoldData, void>;
  getHoldByAsin: ProtocolWithReturn<string, SavedItem | null>;
  getSettings: ProtocolWithReturn<void, AppSettings>;
  saveSettings: ProtocolWithReturn<AppSettings, void>;
  checkAIStatus: ProtocolWithReturn<void, AIAvailability>;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
```

- [ ] **Step 2: Run `pnpm compile`**

Expected: errors pointing at `mvp/entrypoints/background.ts` (unregistered handlers). Fixed in Task 9.

---

## Task 9: Background service worker — handlers + notifications

**Files:**
- Modify: `mvp/entrypoints/background.ts`
- Modify: `mvp/wxt.config.ts`

- [ ] **Step 1: Add `notifications` permission**

Edit `mvp/wxt.config.ts`, replace the `permissions` line with:
```ts
permissions: ['activeTab', 'storage', 'alarms', 'notifications'],
```

- [ ] **Step 2: Register the new message handlers and hold-expiry alarm behavior**

Replace `mvp/entrypoints/background.ts` contents with:

```ts
import { analyzePurchase, checkAIAvailability, reviewCart } from '@/lib/claude';
import {
  getSettings,
  saveSettings,
  getState,
  logIntervention,
  logCartReview,
  saveForLater,
  getTodaySpent,
} from '@/lib/storage';
import {
  createHold,
  releaseHold,
  getHoldByAsin,
  scanExpiredHolds,
  markHoldNotified,
} from '@/lib/hold';
import { onMessage } from '@/utils/messaging';

export default defineBackground(() => {
  console.log('[MSB] Service worker started');

  onMessage('analyzePurchase', ({ data }) => analyzePurchase(data));
  onMessage('reviewCart', ({ data }) => reviewCart(data));

  onMessage('getState', async () => {
    const state = await getState();
    const spentToday = await getTodaySpent();
    return { ...state, spentToday };
  });

  onMessage('logIntervention', ({ data }) => logIntervention(data));
  onMessage('logCartReview', ({ data }) => logCartReview(data));
  onMessage('saveForLater', ({ data }) => saveForLater(data));
  onMessage('createHold', ({ data }) => createHold(data));
  onMessage('releaseHold', ({ data }) => releaseHold(data.id, data.overrideReason));
  onMessage('getHoldByAsin', ({ data }) => getHoldByAsin(data));
  onMessage('getSettings', () => getSettings());
  onMessage('saveSettings', ({ data }) => saveSettings(data));
  onMessage('checkAIStatus', () => checkAIAvailability());

  chrome.alarms.create('check-reminders', { periodInMinutes: 60 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'check-reminders') return;

    const state = await getState();
    const now = Date.now();
    const dueWishlist = state.savedForLater.filter(
      (item) => item.kind === 'wishlist' && item.reminderAt <= now,
    );
    for (const item of dueWishlist) {
      console.log(`[MSB] Wishlist reminder: "${item.product.title}"`);
    }

    const expired = await scanExpiredHolds();
    for (const item of expired) {
      try {
        await chrome.notifications.create(`msb-hold-${item.id}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icon/128.png'),
          title: 'Still want it?',
          message: `Your 48h hold on "${item.product.title}" is up. Tap to decide.`,
          priority: 1,
        });
      } catch (err) {
        console.warn('[MSB] notification failed', err);
      }
      await markHoldNotified(item.id);
    }
  });

  chrome.notifications?.onClicked.addListener((notifId) => {
    if (!notifId.startsWith('msb-hold-')) return;
    chrome.action.openPopup?.().catch(() => { /* ignore */ });
  });
});
```

- [ ] **Step 3: Run `pnpm compile`**

Expected: clean.

---

## Task 10: `CartReviewOverlay` component

**Files:**
- Create: `mvp/entrypoints/amazon-cart.content/CartReviewOverlay.tsx`

- [ ] **Step 1: Implement the overlay**

Create `mvp/entrypoints/amazon-cart.content/CartReviewOverlay.tsx`:

```tsx
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
```

- [ ] **Step 2: Run `pnpm compile`**

Expected: errors about the not-yet-existing content-script `index.tsx` importing this file, which is created in Task 11. Ignore for now.

---

## Task 11: `amazon-cart.content` content script

**Files:**
- Create: `mvp/entrypoints/amazon-cart.content/index.tsx`

- [ ] **Step 1: Implement the content script**

Create `mvp/entrypoints/amazon-cart.content/index.tsx`:

```tsx
import ReactDOM from 'react-dom/client';
import {
  extractCartItems,
  findProceedToCheckoutButton,
  removeCartItem,
  type CartItem,
} from '@/lib/amazon-cart-selectors';
import { sendMessage } from '@/utils/messaging';
import type { CartReview, Intervention } from '@/lib/types';
import { CartReviewOverlay, type EnrichedItem } from './CartReviewOverlay';

export default defineContentScript({
  matches: ['*://*.amazon.com/gp/cart/*', '*://*.amazon.com/cart*'],
  runAt: 'document_idle',
  main() {
    console.log('[MSB] Cart content script loaded');

    let overlayRoot: HTMLDivElement | null = null;
    let reactRoot: ReactDOM.Root | null = null;
    let passThrough = false;

    function mountOverlay(items: CartItem[], priorGoals: Record<string, string>, budget: { dailyBudget: number; spentToday: number; monthSpend: number }, holdModeEnabled: boolean, ptcButton: HTMLElement, cartTotalBefore: number) {
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
          items: items.map((it) => ({ asin: it.asin, verdict: 'ask', removed: false, sentToHold: false })),
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
              product: { title: it.title, price: it.price, priceNumeric: it.priceNumeric, imageUrl: it.imageUrl, asin: it.asin, category: '' },
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
            verdict: 'ask',
            removed: removedAsins.includes(it.asin),
            sentToHold: false,
          })),
          observation: '',
          cartTotalBefore,
          savedAmount,
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
            product: { title: it.title, price: it.price, priceNumeric: it.priceNumeric, imageUrl: it.imageUrl, asin: it.asin, category: '' },
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
            verdict: 'ask',
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
              (iv) => iv.product.asin === item.asin && (iv.decision === 'added' || iv.decision === 'saved') && iv.userGoal,
            );
            if (match) priorGoals[item.asin] = match.userGoal;
          }
          const monthSpend = computeMonthSpend(state.interventions);
          const cartTotalBefore = items.reduce((s, it) => s + it.priceNumeric, 0);
          mountOverlay(items, priorGoals, {
            dailyBudget: state.settings.dailyBudget,
            spentToday: state.spentToday ?? 0,
            monthSpend,
          }, state.settings.holdModeEnabled, btn, cartTotalBefore);
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
```

- [ ] **Step 2: Run `pnpm compile`**

Expected: clean.

---

## Task 12: Hold mode in product-page `InterventionOverlay`

**Files:**
- Modify: `mvp/entrypoints/amazon.content/InterventionOverlay.tsx`

- [ ] **Step 1: Fetch `holdModeEnabled` in the overlay's state-loading effect**

In `mvp/entrypoints/amazon.content/InterventionOverlay.tsx`, locate the existing `useEffect` at roughly line 86-94 that calls `sendMessage('getState', undefined)`. Replace with:

```tsx
const [holdModeEnabled, setHoldModeEnabled] = useState(false);
const [heldConfirmation, setHeldConfirmation] = useState(false);

useEffect(() => {
  setTimeout(() => inputRef.current?.focus(), 100);
  sendMessage('getState', undefined).then((state) => {
    setDailyBudget(state.settings?.dailyBudget ?? 20);
    setSpentToday(state.spentToday ?? 0);
    setHoldModeEnabled(state.settings?.holdModeEnabled ?? false);
  });
}, []);
```

- [ ] **Step 2: Branch `handleAddAnyway` on `holdModeEnabled`**

Replace the existing `handleAddAnyway` function with:

```tsx
const handleAddAnyway = async () => {
  if (holdModeEnabled) {
    await sendMessage('createHold', {
      product,
      userGoal,
    });
    const intervention: Intervention = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      product,
      userGoal,
      claudeResponse,
      decision: 'held',
      savedAmount: 0,
    };
    await sendMessage('logIntervention', intervention);
    setHeldConfirmation(true);
    return;
  }

  const intervention: Intervention = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    product,
    userGoal,
    claudeResponse,
    decision: 'added',
    savedAmount: 0,
  };
  await sendMessage('logIntervention', intervention);
  onAddAnyway();
};
```

- [ ] **Step 3: Render the "held" confirmation UI**

Above the existing `return (` block, insert a render branch. Replace the full `return (...)` JSX block with a top-level conditional that handles `heldConfirmation`:

```tsx
if (heldConfirmation) {
  return (
    <>
      <style>{overlayStyles}</style>
      <div className="msb-backdrop" onClick={onClose} />
      <div className="msb-overlay">
        <div className="msb-response-section" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#2a1f0a', marginBottom: 8 }}>
            OK — 48h hold.
          </div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
            I'll ping you when it's time. Most of these don't survive the wait — that's the feature working.
          </div>
          <button className="msb-submit-btn" onClick={onClose}>Got it</button>
        </div>
      </div>
    </>
  );
}
```

Place this right before the existing `return (` at the end of the component body (i.e. after all handlers are defined).

- [ ] **Step 4: Run `pnpm compile`**

Expected: clean.

---

## Task 13: Held-ASIN detection in product-page content script

**Files:**
- Modify: `mvp/entrypoints/amazon.content/index.tsx`

- [ ] **Step 1: Add hold-status strip rendering on page load**

Open `mvp/entrypoints/amazon.content/index.tsx`. At the top of `main()`, before the existing `let overlayRoot...` declarations, add:

```tsx
async function checkForActiveHold() {
  const asin = extractAsinFromUrl();
  if (!asin) return;
  const hold = await sendMessage('getHoldByAsin', asin);
  if (!hold) return;
  renderHoldStrip(hold.id, hold.product.title, hold.releaseAt ?? 0);
  return true;
}
```

Then at the end of `main()` (after the existing logic), add:

```tsx
checkForActiveHold().then((hasHold) => {
  if (hasHold) {
    // Skip registering normal click interception when a hold is active.
    return;
  }
  // existing interception setup would already have run above — no-op here
});
```

Wait — the existing `main()` runs interception unconditionally. Instead, wrap the interception setup in a gate. Replace the body of `main()` with:

```tsx
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
    // ...existing showOverlay / hideOverlay / clickOriginalButton / interceptButton body goes here
    // including the MutationObserver setup and attaching to Add/Buy/Prime buttons.
  }
}
```

Move the existing code (showOverlay, hideOverlay, clickOriginalButton, interceptButton, observer wiring, etc.) into `registerInterception()`. Keep all existing logic unchanged.

- [ ] **Step 2: Add `extractAsinFromUrl` and `renderHoldStrip` helpers**

At module scope in `mvp/entrypoints/amazon.content/index.tsx`:

```tsx
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
    const reason = window.prompt('Why the emergency? (logged only for your own reflection)') ?? '';
    if (reason === null) return;
    await sendMessage('releaseHold', { id: holdId, overrideReason: reason });
    strip.remove();
    const addBtn = findAddToCartButton() ?? findBuyNowButton();
    if (addBtn) addBtn.click();
  });
}
```

- [ ] **Step 3: Run `pnpm compile`**

Expected: clean.

---

## Task 14: Popup "On ice" section

**Files:**
- Modify: `mvp/entrypoints/popup/App.tsx`
- Modify: `mvp/entrypoints/popup/style.css`

- [ ] **Step 1: Render an "On ice" section**

In `mvp/entrypoints/popup/App.tsx`, add helper functions at the top of the file (below imports):

```tsx
function hoursLeft(releaseAt?: number): number {
  if (!releaseAt) return 0;
  return Math.max(0, Math.ceil((releaseAt - Date.now()) / (60 * 60 * 1000)));
}
```

Inside the `App` component, before the existing `state.savedForLater.length > 0 && ...` block, add:

```tsx
{(() => {
  const active = state.savedForLater.filter(
    (i) => i.kind === 'hold' && i.releaseAt && i.releaseAt > Date.now(),
  );
  if (active.length === 0) return null;
  return (
    <section className="section">
      <h2>On ice ({active.length})</h2>
      {active.map((item) => (
        <div key={item.id} className="on-ice-item">
          <div className="on-ice-title">{item.product.title.slice(0, 50)}</div>
          <div className="on-ice-meta">
            <span>{item.product.price}</span>
            <span>·</span>
            <span>{hoursLeft(item.releaseAt)}h left</span>
            <button
              className="on-ice-release"
              onClick={async () => {
                const reason = window.prompt('Why the emergency? (logged for your own reflection)') ?? '';
                if (reason === null) return;
                await sendMessage('releaseHold', { id: item.id, overrideReason: reason });
                const fresh = await sendMessage('getState', undefined);
                setState(fresh);
              }}
            >
              Release
            </button>
          </div>
        </div>
      ))}
    </section>
  );
})()}
```

Also update the "Saved for later" filter so it only shows wishlist items (not holds). Replace the existing `state.savedForLater.length > 0` block with:

```tsx
{(() => {
  const wishlist = state.savedForLater.filter((i) => i.kind !== 'hold');
  if (wishlist.length === 0) return null;
  return (
    <section className="section">
      <h2>Saved for Later ({wishlist.length})</h2>
      {wishlist.slice(0, 3).map((item) => (
        <div key={item.id} className="saved-item">
          <span className="saved-title">{item.product.title.slice(0, 50)}...</span>
          <span className="saved-price">{item.product.price}</span>
        </div>
      ))}
    </section>
  );
})()}
```

- [ ] **Step 2: Add CSS**

Append to `mvp/entrypoints/popup/style.css`:

```css
.on-ice-item {
  padding: 8px 0;
  border-bottom: 1px solid #f0e8dd;
}
.on-ice-item:last-child { border-bottom: none; }
.on-ice-title {
  font-size: 12px;
  font-weight: 600;
  color: #2a1f0a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.on-ice-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  font-size: 11px;
  color: #666;
}
.on-ice-release {
  margin-left: auto;
  background: transparent;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 10px;
  color: #888;
  cursor: pointer;
}
.on-ice-release:hover { border-color: #aaa; color: #555; }
```

- [ ] **Step 3: Run `pnpm compile`**

Expected: clean.

---

## Task 15: Options toggle for `holdModeEnabled`

**Files:**
- Modify: `mvp/entrypoints/options/App.tsx`

The current file stores `dailyBudget` as local state (string, for the input) and builds the settings object at save time. Extend the same pattern with a boolean.

- [ ] **Step 1: Add local state for the toggle**

In `mvp/entrypoints/options/App.tsx`, replace the existing `const [dailyBudget, setDailyBudget] = useState('20');` with:
```tsx
const [dailyBudget, setDailyBudget] = useState('20');
const [holdModeEnabled, setHoldModeEnabled] = useState(false);
```

- [ ] **Step 2: Load it from settings**

Replace the existing `useEffect` block with:
```tsx
useEffect(() => {
  sendMessage('getSettings', undefined)
    .then((settings) => {
      setDailyBudget(String(settings.dailyBudget || 20));
      setHoldModeEnabled(settings.holdModeEnabled ?? false);
    })
    .finally(() => setLoading(false));

  sendMessage('checkAIStatus', undefined).then(setAiStatus);
}, []);
```

- [ ] **Step 3: Persist it on save**

Replace the existing `handleSave` with:
```tsx
const handleSave = async () => {
  await sendMessage('saveSettings', {
    dailyBudget: parseFloat(dailyBudget) || 20,
    holdModeEnabled,
  });
  setSaved(true);
  setTimeout(() => setSaved(false), 2000);
};
```

- [ ] **Step 4: Render the toggle**

Immediately after the closing `</div>` of the existing "Daily Discretionary Budget" field (the `<div className="field">` ending around line 60 in the original), and before the `<button className="save-btn" ...>`, insert:

```tsx
<div className="field">
  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <input
      type="checkbox"
      checked={holdModeEnabled}
      onChange={(e) => setHoldModeEnabled(e.target.checked)}
      style={{ marginTop: 4 }}
    />
    <div>
      <div style={{ fontWeight: 600 }}>Second-thought mode (48-hour hold)</div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
        When on, "Add anyway" puts the item on ice for 48 hours instead of adding it right now.
        You'll get a heads-up when time's up. You can release early if it's a real emergency.
      </div>
    </div>
  </label>
</div>
```

- [ ] **Step 5: Run `pnpm compile`**

Expected: clean.

---

## Task 16: Full test pass + build + manual verification

**Files:**
- None (verification task)

- [ ] **Step 1: Run all unit tests**

Run (from `mvp/`): `pnpm test`
Expected: all tests passing (vitest harness + storage + hold + cart-selectors + cart-review-prompt).

- [ ] **Step 2: Type-check**

Run: `pnpm compile`
Expected: no errors.

- [ ] **Step 3: Build and sync the extension**

Run: `pnpm build`
The `build` script already runs `rm -rf chrome-extension && cp -R .output/chrome-mv3 chrome-extension`. Verify the copy happened:
```bash
ls chrome-extension/manifest.json
```
Expected: file exists.

- [ ] **Step 4: Reload the extension in Chrome**

Tell the user: "Reload the extension at chrome://extensions. Then walk the checklist."

Manual checklist:
- Open a product page and add via "Add to Cart". Existing overlay appears.
- With hold mode **off** in Options, "Add anyway" passes through (item appears in Amazon cart).
- Navigate to `amazon.com/gp/cart/view.html`. With at least one item that was added via the extension (so it has a logged goal) and one without, click "Proceed to checkout".
  - Overlay appears within 3s.
  - Items with a logged goal show the italic quote.
  - Items without show "No goal logged — added via 1-click?".
  - "Remove selected" actually deletes checked items from Amazon's cart.
  - "Proceed anyway" allows checkout to continue normally.
- Turn hold mode **on** in Options.
  - On a product page, click "Add to Cart" → answer goal → see response → click "Add anyway". Overlay shows "OK — 48h hold" confirmation. Amazon cart does not receive the item.
  - Reload the product page. Hold strip appears at top with hours-left count.
  - Click "Need it now" → enter reason → strip disappears and Add-to-Cart click fires.
  - In popup, "On ice (N)" section shows active holds with countdowns. "Release" works.
- Cart overlay shows "Send to 48h hold" button when hold mode is on; clicking it removes items from Amazon's cart and creates holds (verify via popup).
- AI unavailable path: disable Chrome AI (or use a browser without it). Cart overlay shows the degraded text-only mode with working action buttons.
- Report results to the user.

- [ ] **Step 5: Hand off**

Tell the user: "All tasks complete. Try the manual checklist. If anything misbehaves, report the step number and I'll triage."

---

## Post-implementation notes

- `chrome.notifications` permission was added in Task 9. If the user's loaded extension was running before that change, they'll be prompted to re-accept permissions on reload.
- Legacy users with pre-migration `SavedItem`s will have them lazily tagged `kind: 'wishlist'` on next read — no explicit migration step required.
- The existing `staleness-prevention.md` doc should be checked if the build-to-chrome-extension sync ever silently stops working.

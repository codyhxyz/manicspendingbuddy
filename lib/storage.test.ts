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
  vi.resetModules();
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
});

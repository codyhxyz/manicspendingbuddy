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

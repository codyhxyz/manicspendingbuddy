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

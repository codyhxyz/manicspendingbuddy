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

  // Open the welcome tab on first install so the user can grant host access
  // from a button click. chrome.permissions.request() requires a user gesture,
  // which an onInstalled handler alone can't provide — the welcome page is
  // where that click lives.
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'install') return;
    void chrome.storage.local.get('welcomeShown').then(({ welcomeShown }) => {
      if (welcomeShown) return;
      void chrome.storage.local.set({ welcomeShown: true });
      chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') });
    });
  });

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

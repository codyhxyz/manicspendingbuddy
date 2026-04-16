import { analyzePurchase, checkAIAvailability } from '@/lib/claude';
import {
  getSettings,
  saveSettings,
  getState,
  logIntervention,
  saveForLater,
  getTodaySpent,
} from '@/lib/storage';
import { onMessage } from '@/utils/messaging';

export default defineBackground(() => {
  console.log('[MSB] Service worker started');

  onMessage('analyzePurchase', ({ data }) => analyzePurchase(data));

  onMessage('getState', async () => {
    const state = await getState();
    const spentToday = await getTodaySpent();
    return { ...state, spentToday };
  });

  onMessage('logIntervention', ({ data }) => logIntervention(data));
  onMessage('saveForLater', ({ data }) => saveForLater(data));
  onMessage('getSettings', () => getSettings());
  onMessage('saveSettings', ({ data }) => saveSettings(data));
  onMessage('checkAIStatus', () => checkAIAvailability());

  chrome.alarms.create('check-reminders', { periodInMinutes: 60 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'check-reminders') {
      const state = await getState();
      const now = Date.now();
      const due = state.savedForLater.filter((item) => item.reminderAt <= now);
      for (const item of due) {
        console.log(`[MSB] Reminder: Do you still want "${item.product.title}"?`);
      }
    }
  });
});

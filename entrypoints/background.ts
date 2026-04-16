import { analyzePurchase, checkAIAvailability } from '@/lib/claude';
import {
  getSettings,
  saveSettings,
  getState,
  logIntervention,
  saveForLater,
  getTodaySpent,
} from '@/lib/storage';
import type { MessageRequest } from '@/lib/types';

export default defineBackground(() => {
  console.log('[MSB] Service worker started');

  // Handle messages from content script and popup
  browser.runtime.onMessage.addListener(
    (message: MessageRequest, _sender, sendResponse) => {
      handleMessage(message).then(sendResponse).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true; // keep channel open for async response
    },
  );

  // Set up alarm for saved-for-later reminders
  chrome.alarms.create('check-reminders', { periodInMinutes: 60 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'check-reminders') {
      const state = await getState();
      const now = Date.now();
      const due = state.savedForLater.filter((item) => item.reminderAt <= now);
      if (due.length > 0) {
        // Show notification for items whose reminder is due
        for (const item of due) {
          console.log(`[MSB] Reminder: Do you still want "${item.product.title}"?`);
        }
      }
    }
  });
});

async function handleMessage(message: MessageRequest) {
  switch (message.type) {
    case 'ANALYZE_PURCHASE': {
      const response = await analyzePurchase({
        product: message.product,
        userGoal: message.userGoal,
        dailyBudget: message.dailyBudget,
        spentToday: message.spentToday,
      });
      return { success: true, data: response };
    }

    case 'CHECK_AI_STATUS': {
      const status = await checkAIAvailability();
      return { success: true, data: status };
    }

    case 'GET_STATE': {
      const state = await getState();
      const spentToday = await getTodaySpent();
      return { success: true, data: { ...state, spentToday } };
    }

    case 'LOG_INTERVENTION': {
      await logIntervention(message.intervention);
      return { success: true, data: null };
    }

    case 'SAVE_FOR_LATER': {
      await saveForLater(message.item);
      return { success: true, data: null };
    }

    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { success: true, data: settings };
    }

    case 'SAVE_SETTINGS': {
      await saveSettings(message.settings);
      return { success: true, data: null };
    }

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

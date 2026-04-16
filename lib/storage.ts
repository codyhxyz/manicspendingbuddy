import type { AppSettings, AppState, Intervention, SavedItem } from './types';

const DEFAULT_SETTINGS: AppSettings = {
  dailyBudget: 20,
};

const DEFAULT_STATE: AppState = {
  totalSaved: 0,
  currentStreak: 0,
  lastSkipDate: '',
  interventions: [],
  savedForLater: [],
  settings: DEFAULT_SETTINGS,
};

async function getAll(): Promise<AppState> {
  const result = await chrome.storage.local.get('appState');
  return { ...DEFAULT_STATE, ...(result.appState as Partial<AppState>) };
}

async function saveAll(state: AppState): Promise<void> {
  await chrome.storage.local.set({ appState: state });
}

export async function getSettings(): Promise<AppSettings> {
  const state = await getAll();
  return state.settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const state = await getAll();
  state.settings = settings;
  await saveAll(state);
}

export async function getState(): Promise<AppState> {
  return getAll();
}

export async function logIntervention(intervention: Intervention): Promise<void> {
  const state = await getAll();
  state.interventions.unshift(intervention);

  // Keep max 100 interventions
  if (state.interventions.length > 100) {
    state.interventions = state.interventions.slice(0, 100);
  }

  if (intervention.decision === 'skipped') {
    state.totalSaved += intervention.savedAmount;

    const today = new Date().toISOString().slice(0, 10);
    if (state.lastSkipDate === today || isYesterday(state.lastSkipDate)) {
      state.currentStreak += state.lastSkipDate === today ? 0 : 1;
    } else {
      state.currentStreak = 1;
    }
    state.lastSkipDate = today;
  }

  await saveAll(state);
}

export async function saveForLater(item: SavedItem): Promise<void> {
  const state = await getAll();
  state.savedForLater.unshift(item);
  await saveAll(state);
}

export async function removeSavedItem(id: string): Promise<void> {
  const state = await getAll();
  state.savedForLater = state.savedForLater.filter((i) => i.id !== id);
  await saveAll(state);
}

export async function getTodaySpent(): Promise<number> {
  const state = await getAll();
  const today = new Date().toISOString().slice(0, 10);
  return state.interventions
    .filter((i) => i.decision === 'added' && i.timestamp > Date.now() - 86400000)
    .filter((i) => new Date(i.timestamp).toISOString().slice(0, 10) === today)
    .reduce((sum, i) => sum + i.product.priceNumeric, 0);
}

function isYesterday(dateStr: string): boolean {
  if (!dateStr) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateStr === yesterday.toISOString().slice(0, 10);
}

export interface ProductInfo {
  title: string;
  price: string;
  priceNumeric: number;
  imageUrl: string;
  asin: string;
  category: string;
}

export interface Intervention {
  id: string;
  timestamp: number;
  product: ProductInfo;
  userGoal: string;
  claudeResponse: string;
  decision: 'skipped' | 'added' | 'saved';
  savedAmount: number;
}

export interface SavedItem {
  id: string;
  product: ProductInfo;
  userGoal: string;
  savedAt: number;
  reminderAt: number;
}

export interface AppSettings {
  dailyBudget: number;
}

export interface AppState {
  totalSaved: number;
  currentStreak: number;
  lastSkipDate: string;
  interventions: Intervention[];
  savedForLater: SavedItem[];
  settings: AppSettings;
}

// Messages between content script and service worker
export type MessageRequest =
  | {
      type: 'ANALYZE_PURCHASE';
      product: ProductInfo;
      userGoal: string;
      dailyBudget: number;
      spentToday: number;
    }
  | { type: 'GET_STATE' }
  | { type: 'LOG_INTERVENTION'; intervention: Intervention }
  | { type: 'SAVE_FOR_LATER'; item: SavedItem }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: AppSettings }
  | { type: 'CHECK_AI_STATUS' };

export type MessageResponse =
  | { success: true; data: any }
  | { success: false; error: string };

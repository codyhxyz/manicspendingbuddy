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

// Message types now defined in utils/messaging.ts via @webext-core/messaging

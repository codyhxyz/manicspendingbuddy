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
  decision: 'skipped' | 'added' | 'saved' | 'held';
  savedAmount: number;
}

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

export interface AppSettings {
  dailyBudget: number;
  holdModeEnabled: boolean;
  minimaxApiKey: string;
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

// Message types now defined in utils/messaging.ts via @webext-core/messaging

import { defineExtensionMessaging, ProtocolWithReturn } from '@webext-core/messaging';
import type {
  AppSettings,
  AppState,
  CartReview,
  Intervention,
  ProductInfo,
  SavedItem,
} from '@/lib/types';
import type { AIAvailability } from '@/lib/claude';
import type { CartReviewRequest, ParsedCartReview } from '@/lib/cart-review-prompt';

export interface AnalyzePurchaseData {
  product: ProductInfo;
  userGoal: string;
  dailyBudget: number;
  spentToday: number;
}

export type StateResponse = AppState & { spentToday: number };

export interface CreateHoldData {
  product: ProductInfo;
  userGoal: string;
}

export interface ReleaseHoldData {
  id: string;
  overrideReason: string;
}

interface ProtocolMap {
  analyzePurchase: ProtocolWithReturn<AnalyzePurchaseData, string>;
  reviewCart: ProtocolWithReturn<CartReviewRequest, ParsedCartReview>;
  getState: ProtocolWithReturn<void, StateResponse>;
  logIntervention: ProtocolWithReturn<Intervention, void>;
  logCartReview: ProtocolWithReturn<CartReview, void>;
  saveForLater: ProtocolWithReturn<SavedItem, void>;
  createHold: ProtocolWithReturn<CreateHoldData, SavedItem>;
  releaseHold: ProtocolWithReturn<ReleaseHoldData, void>;
  getHoldByAsin: ProtocolWithReturn<string, SavedItem | null>;
  getSettings: ProtocolWithReturn<void, AppSettings>;
  saveSettings: ProtocolWithReturn<AppSettings, void>;
  checkAIStatus: ProtocolWithReturn<void, AIAvailability>;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();

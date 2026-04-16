import { defineExtensionMessaging, ProtocolWithReturn } from '@webext-core/messaging';
import type {
  AppSettings,
  AppState,
  Intervention,
  ProductInfo,
  SavedItem,
} from '@/lib/types';
import type { AIAvailability } from '@/lib/claude';

export interface AnalyzePurchaseData {
  product: ProductInfo;
  userGoal: string;
  dailyBudget: number;
  spentToday: number;
}

export type StateResponse = AppState & { spentToday: number };

interface ProtocolMap {
  analyzePurchase: ProtocolWithReturn<AnalyzePurchaseData, string>;
  getState: ProtocolWithReturn<void, StateResponse>;
  logIntervention: ProtocolWithReturn<Intervention, void>;
  saveForLater: ProtocolWithReturn<SavedItem, void>;
  getSettings: ProtocolWithReturn<void, AppSettings>;
  saveSettings: ProtocolWithReturn<AppSettings, void>;
  checkAIStatus: ProtocolWithReturn<void, AIAvailability>;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();

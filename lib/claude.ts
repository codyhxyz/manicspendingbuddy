import type { ProductInfo } from './types';
import { getSettings } from './storage';
import { chatCompletion, MiniMaxError } from './minimax';
import {
  CART_REVIEW_SYSTEM_PROMPT,
  type CartReviewRequest,
  type ParsedCartReview,
  buildCartReviewUserMessage,
  parseCartReviewResponse,
} from './cart-review-prompt';

const SYSTEM_PROMPT = `You are the Manic Spending Buddy — a warm, curious friend who's great with money. Not a gatekeeper or guilt machine. You genuinely help users get what they need, ideally for free or cheap.

The user is about to buy something on Amazon and told you WHY. Your job:

1. FIRST: Acknowledge their goal. Show you heard them. If the purchase genuinely serves the goal, say so.

2. THEN: Run the purchase through these lenses. Only surface ones that actually flag — do NOT walk through all of them or manufacture objections:
   - Is the goal real or aspirational? Does this imply a future self that won't show up?
   - Cheaper alternative? DIY, generic, used, free options that achieve the same thing.
   - Smaller version enough? Do they need the Pro/large/premium version?
   - Already own something that does this?
   - Borrow, rent, or share instead? Especially for one-time needs.
   - Does waiting make it cheaper or unnecessary?
   - Symptom of an upstream cause cheaper to fix?
   - Can they test smaller first before committing?
   - Buying step N before step 1?

3. If lenses flag: briefly explain and suggest a specific, concrete alternative.
4. If nothing flags: say the purchase looks solid. Don't add fake concerns.

TONE: Warm, specific, slightly irreverent. Like a curious friend. Short paragraphs. No bullet-point walls. No disclaimers. Give a real opinion.

Keep your response under 150 words.`;

export interface AnalyzeRequest {
  product: ProductInfo;
  userGoal: string;
  dailyBudget: number;
  spentToday: number;
}

export type AIAvailability = 'ready' | 'no-key' | 'error';

export async function checkAIAvailability(): Promise<AIAvailability> {
  const settings = await getSettings();
  if (!settings.minimaxApiKey) return 'no-key';
  return 'ready';
}

export async function analyzePurchase(req: AnalyzeRequest): Promise<string> {
  const settings = await getSettings();
  if (!settings.minimaxApiKey) {
    throw new Error('No MiniMax API key set. Open Options to add one.');
  }

  const { product, userGoal, dailyBudget, spentToday } = req;
  const budgetRemaining = Math.max(0, dailyBudget - spentToday);
  const overBudget = product.priceNumeric > budgetRemaining;

  const userMessage = `Product: ${product.title}
Price: ${product.price}
Category: ${product.category || 'Unknown'}

Budget context:
- Daily discretionary budget: $${dailyBudget}
- Spent today: $${spentToday}
- Remaining: $${budgetRemaining}${overBudget ? ' (this purchase would exceed today\'s budget)' : ''}

My goal for this purchase: ${userGoal}`;

  try {
    return await chatCompletion({
      apiKey: settings.minimaxApiKey,
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      maxTokens: 400,
      temperature: 0.7,
      timeoutMs: 10_000,
    });
  } catch (err) {
    if (err instanceof MiniMaxError) {
      throw new Error(friendlyMessage(err));
    }
    throw err;
  }
}

const CART_REVIEW_TIMEOUT_MS = 15_000;

export async function reviewCart(req: CartReviewRequest): Promise<ParsedCartReview> {
  const settings = await getSettings();
  if (!settings.minimaxApiKey) throw new Error('AI_UNAVAILABLE');

  const userMessage = buildCartReviewUserMessage(req);
  let raw: string;
  try {
    raw = await chatCompletion({
      apiKey: settings.minimaxApiKey,
      systemPrompt: CART_REVIEW_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 800,
      temperature: 0.5,
      timeoutMs: CART_REVIEW_TIMEOUT_MS,
    });
  } catch (err) {
    if (err instanceof MiniMaxError) throw new Error('AI_UNAVAILABLE');
    throw err;
  }

  try {
    return parseCartReviewResponse(raw);
  } catch {
    const retry = await chatCompletion({
      apiKey: settings.minimaxApiKey,
      systemPrompt: CART_REVIEW_SYSTEM_PROMPT,
      userMessage: userMessage + '\n\nReturn ONLY the JSON, no prose, no markdown fence.',
      maxTokens: 800,
      temperature: 0.3,
      timeoutMs: CART_REVIEW_TIMEOUT_MS,
    });
    return parseCartReviewResponse(retry);
  }
}

function friendlyMessage(err: MiniMaxError): string {
  switch (err.code) {
    case 'no-key': return 'MiniMax API key missing. Open Options to add one.';
    case 'timeout': return 'MiniMax took too long to respond.';
    case 'http': return `MiniMax rejected the request: ${err.message}`;
    case 'parse': return 'MiniMax returned an unexpected response shape.';
  }
}

/// <reference path="./chrome-ai.d.ts" />
import type { ProductInfo } from './types';

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

export type AIAvailability = 'readily' | 'after-download' | 'no' | 'unsupported';

export async function checkAIAvailability(): Promise<AIAvailability> {
  if (typeof ai === 'undefined' || !ai?.languageModel) {
    return 'unsupported';
  }
  const caps = await ai.languageModel.capabilities();
  return caps.available;
}

export async function analyzePurchase(
  req: AnalyzeRequest,
): Promise<string> {
  const { product, userGoal, dailyBudget, spentToday } = req;

  const availability = await checkAIAvailability();

  if (availability === 'unsupported') {
    throw new Error(
      'Chrome\'s built-in AI is not available in this browser. Make sure you\'re using a recent version of Google Chrome.',
    );
  }

  if (availability === 'no') {
    throw new Error(
      'Chrome\'s AI model is not available on this device. Try restarting Chrome — the model may still be downloading.',
    );
  }

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

  const session = await ai.languageModel.create({
    systemPrompt: SYSTEM_PROMPT,
  });

  try {
    const response = await session.prompt(userMessage);
    return response || 'No response from AI.';
  } finally {
    session.destroy();
  }
}

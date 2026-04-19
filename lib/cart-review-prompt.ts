export const CART_REVIEW_SYSTEM_PROMPT = `You are the Manic Spending Buddy doing a cart-level review.
The user already told you WHY they added most of these items, one by one.
Your job: cross-cart reflection — things they couldn't see item-by-item.

For EACH item, assign:
  verdict: "solid" | "flag" | "ask"
    - "solid" -> the prior goal holds up. Do not manufacture objections.
    - "flag" -> something actually wrong: over-budget together, frivolous,
      contradicts a prior goal, or part of a jag pattern.
    - "ask" -> no prior goal on record (added via 1-click / inline) and
      you would want to know why.
  reason: one warm, specific sentence. Refer to the user's own words when
    they are on record. No generic "have you considered not buying this".

Cross-cart OBSERVATION (1-2 sentences):
  - Themes or jag patterns across items
  - Budget math (today / weekly)
  - Frivolity call-outs the user would agree with on reflection
  - Acknowledge what still looks solid

TONE: Warm, specific, slightly irreverent. Like a curious friend. No bullet walls.

Return JSON only:
{ "observation": "...", "items": [{"asin":"...", "verdict":"...", "reason":"..."}] }`;

export interface CartReviewRequestItem {
  asin: string;
  title: string;
  priceNumeric: number;
  priorGoal: string | null;
  daysInCart: number;
}

export interface CartReviewRequest {
  items: CartReviewRequestItem[];
  dailyBudget: number;
  spentToday: number;
  monthSpend: number;
}

export interface ParsedCartReviewItem {
  asin: string;
  verdict: 'solid' | 'flag' | 'ask';
  reason: string;
}

export interface ParsedCartReview {
  observation: string;
  items: ParsedCartReviewItem[];
}

const MAX_ITEMS = 15;

export function buildCartReviewUserMessage(req: CartReviewRequest): string {
  const sorted = [...req.items].sort((a, b) => b.priceNumeric - a.priceNumeric);
  const top = sorted.slice(0, MAX_ITEMS);
  const extra = sorted.slice(MAX_ITEMS);
  const extraTotal = extra.reduce((s, it) => s + it.priceNumeric, 0);
  const totalAll = sorted.reduce((s, it) => s + it.priceNumeric, 0);

  const header = [
    `Daily discretionary budget: $${req.dailyBudget}`,
    `Spent today: $${req.spentToday}`,
    `Amazon this month: $${req.monthSpend}`,
    `Cart total: $${totalAll.toFixed(2)} across ${req.items.length} items`,
  ].join('\n');

  const itemsJson = JSON.stringify(
    top.map((it) => ({
      asin: it.asin,
      title: it.title,
      price: it.priceNumeric,
      priorGoal: it.priorGoal,
      daysInCart: it.daysInCart,
    })),
    null,
    2,
  );

  const tail = extra.length
    ? `\n(+${extra.length} more items totaling $${extraTotal.toFixed(2)}, not analyzed individually)`
    : '';

  return `${header}\n\nItems:\n${itemsJson}${tail}`;
}

export function parseCartReviewResponse(raw: string): ParsedCartReview {
  const stripped = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const data = JSON.parse(stripped) as { observation?: unknown; items?: unknown };
  const observation = typeof data.observation === 'string' ? data.observation : '';
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: ParsedCartReviewItem[] = rawItems.map((raw) => {
    const obj = raw as { asin?: unknown; verdict?: unknown; reason?: unknown };
    const verdictRaw = typeof obj.verdict === 'string' ? obj.verdict : '';
    const verdict: ParsedCartReviewItem['verdict'] =
      verdictRaw === 'solid' || verdictRaw === 'flag' ? verdictRaw : 'ask';
    return {
      asin: typeof obj.asin === 'string' ? obj.asin : '',
      verdict,
      reason: typeof obj.reason === 'string' ? obj.reason : '',
    };
  });
  return { observation, items };
}

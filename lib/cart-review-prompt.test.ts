import { describe, expect, test } from 'vitest';
import { parseCartReviewResponse, buildCartReviewUserMessage, CART_REVIEW_SYSTEM_PROMPT } from './cart-review-prompt';

describe('cart-review prompt', () => {
  test('system prompt mentions verdict vocabulary and JSON-only', () => {
    expect(CART_REVIEW_SYSTEM_PROMPT).toMatch(/solid/);
    expect(CART_REVIEW_SYSTEM_PROMPT).toMatch(/flag/);
    expect(CART_REVIEW_SYSTEM_PROMPT).toMatch(/ask/);
    expect(CART_REVIEW_SYSTEM_PROMPT).toMatch(/JSON/);
  });

  test('buildCartReviewUserMessage includes budget + each ASIN + prior goal', () => {
    const msg = buildCartReviewUserMessage({
      items: [{ asin: 'B1', title: 'x', priceNumeric: 10, priorGoal: 'organize desk', daysInCart: 1 }],
      dailyBudget: 20,
      spentToday: 5,
      monthSpend: 300,
    });
    expect(msg).toMatch(/B1/);
    expect(msg).toMatch(/organize desk/);
    expect(msg).toMatch(/\$20/);
  });

  test('parseCartReviewResponse handles clean JSON', () => {
    const raw = JSON.stringify({
      observation: 'mostly kitchen',
      items: [{ asin: 'B1', verdict: 'solid', reason: 'fine' }],
    });
    const parsed = parseCartReviewResponse(raw);
    expect(parsed.observation).toBe('mostly kitchen');
    expect(parsed.items[0].verdict).toBe('solid');
  });

  test('parseCartReviewResponse strips markdown fences', () => {
    const raw = '```json\n{"observation":"x","items":[]}\n```';
    const parsed = parseCartReviewResponse(raw);
    expect(parsed.observation).toBe('x');
  });

  test('parseCartReviewResponse throws on invalid JSON', () => {
    expect(() => parseCartReviewResponse('not json')).toThrow();
  });

  test('parseCartReviewResponse coerces unknown verdict to ask', () => {
    const raw = JSON.stringify({
      observation: '',
      items: [{ asin: 'B1', verdict: 'nope', reason: 'r' }],
    });
    const parsed = parseCartReviewResponse(raw);
    expect(parsed.items[0].verdict).toBe('ask');
  });
});

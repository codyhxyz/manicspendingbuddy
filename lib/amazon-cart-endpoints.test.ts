import { describe, it, expect } from 'vitest';
import { isCartAddEndpoint } from './amazon-cart-endpoints';

describe('isCartAddEndpoint', () => {
  it.each([
    ['https://www.amazon.com/gp/cart/add-to-cart/ref=foo', true],
    ['https://www.amazon.com/gp/cart/add.html', true],
    ['https://www.amazon.com/gp/aws/cart/add-oe.html', true],
    ['https://www.amazon.com/gp/cart/add-ajax.html', true],
    ['https://www.amazon.com/hz/oneclickcheckout', true],
    ['https://www.amazon.com/gp/product-ajax/ref=foo', false],
    ['https://www.amazon.com/', false],
    ['https://www.amazon.com/gp/cart/view.html', false],
  ])('classifies %s -> %s', (url, expected) => {
    expect(isCartAddEndpoint(url)).toBe(expected);
  });

  it('matches relative URLs against a provided base', () => {
    expect(isCartAddEndpoint('/gp/cart/add-to-cart/ref=foo', 'https://www.amazon.com')).toBe(true);
    expect(isCartAddEndpoint('/gp/product-details', 'https://www.amazon.com')).toBe(false);
  });
});

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { isCartAddEndpoint } from '@/lib/amazon-cart-endpoints';

describe('MAIN-world cart-add detection contract', () => {
  it('gates on POST + cart-add URL', () => {
    const shouldIntercept = (method: string, url: string) =>
      method === 'POST' && isCartAddEndpoint(url);

    expect(shouldIntercept('POST', 'https://www.amazon.com/gp/cart/add-to-cart/ref=x')).toBe(true);
    expect(shouldIntercept('GET', 'https://www.amazon.com/gp/cart/add-to-cart/ref=x')).toBe(false);
    expect(shouldIntercept('POST', 'https://www.amazon.com/gp/product-details')).toBe(false);
  });

  it('respects a bypass window', () => {
    let bypassUntil = 0;
    const shouldIntercept = (method: string, url: string) => {
      if (method !== 'POST') return false;
      if (Date.now() < bypassUntil) return false;
      return isCartAddEndpoint(url);
    };

    const url = 'https://www.amazon.com/gp/cart/add-to-cart/ref=x';
    expect(shouldIntercept('POST', url)).toBe(true);
    bypassUntil = Date.now() + 2000;
    expect(shouldIntercept('POST', url)).toBe(false);
    bypassUntil = 0;
    expect(shouldIntercept('POST', url)).toBe(true);
  });
});

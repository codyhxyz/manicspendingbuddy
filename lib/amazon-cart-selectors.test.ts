import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFixture(name: string) {
  const fixturePath = path.join(__dirname, '__fixtures__', name);
  document.body.innerHTML = readFileSync(fixturePath, 'utf8');
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('extractCartItems', () => {
  test('returns one item per row with asin, title, price, quantity, deleteHandle', async () => {
    loadFixture('cart-sample-3items.html');
    const { extractCartItems } = await import('./amazon-cart-selectors');
    const items = extractCartItems();
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      asin: 'B001',
      title: 'Drawer Organizer Set',
      price: '$18.00',
      priceNumeric: 18,
      quantity: 1,
    });
    expect(items[2].quantity).toBe(2);
    expect(items[0].deleteHandle).not.toBeNull();
  });

  test('returns empty array when cart has no items', () => {
    document.body.innerHTML = '<form id="activeCartViewForm"></form>';
    return import('./amazon-cart-selectors').then(({ extractCartItems }) => {
      expect(extractCartItems()).toEqual([]);
    });
  });
});

describe('findProceedToCheckoutButton', () => {
  test('finds the PTC button', async () => {
    loadFixture('cart-sample-3items.html');
    const { findProceedToCheckoutButton } = await import('./amazon-cart-selectors');
    expect(findProceedToCheckoutButton()).not.toBeNull();
  });
});

describe('removeCartItem', () => {
  test('clicks the delete handle when present', async () => {
    loadFixture('cart-sample-3items.html');
    const { extractCartItems, removeCartItem } = await import('./amazon-cart-selectors');
    const items = extractCartItems();
    let clicked = false;
    items[0].deleteHandle!.addEventListener('click', () => { clicked = true; });
    removeCartItem(items[0]);
    expect(clicked).toBe(true);
  });
});

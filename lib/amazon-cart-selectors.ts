export interface CartItem {
  asin: string;
  title: string;
  price: string;
  priceNumeric: number;
  quantity: number;
  imageUrl: string;
  deleteHandle: HTMLElement | null;
}

function textIn(row: Element, ...selectors: string[]): string {
  for (const sel of selectors) {
    const el = row.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function attrIn(row: Element, attr: string, ...selectors: string[]): string {
  for (const sel of selectors) {
    const el = row.querySelector(sel);
    const val = el?.getAttribute(attr);
    if (val) return val;
  }
  return '';
}

function priceToNumber(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

export function extractCartItems(): CartItem[] {
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>('form#activeCartViewForm [data-asin], .sc-list-item[data-asin]'),
  );
  const seen = new Set<string>();
  const items: CartItem[] = [];
  for (const row of rows) {
    const asin = row.getAttribute('data-asin') ?? '';
    if (!asin || seen.has(asin)) continue;
    seen.add(asin);
    const title = textIn(row, '.a-truncate-full', '.sc-product-title', '.sc-product-link');
    const price = textIn(row, '.sc-price .a-offscreen', '.a-price .a-offscreen', '.sc-price');
    const qtyInput = row.querySelector<HTMLInputElement>(
      'input[name="quantity"], select[name="quantity"]',
    );
    const quantity = qtyInput?.value ? parseInt(qtyInput.value, 10) || 1 : 1;
    const imageUrl = attrIn(row, 'src', '.sc-product-image img', 'img');
    const deleteHandle = row.querySelector<HTMLElement>(
      '.sc-action-delete-input, input[value="Delete"], [data-action="delete"] input',
    );
    items.push({
      asin,
      title,
      price,
      priceNumeric: priceToNumber(price) * quantity,
      quantity,
      imageUrl,
      deleteHandle,
    });
  }
  return items;
}

export function findProceedToCheckoutButton(): HTMLElement | null {
  const selectors = [
    '#sc-buy-box-ptc-button',
    'input[name="proceedToRetailCheckout"]',
    '[data-feature-id="proceed-to-checkout-action"] input',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

export function removeCartItem(item: CartItem): boolean {
  if (item.deleteHandle) {
    item.deleteHandle.click();
    return true;
  }
  return false;
}

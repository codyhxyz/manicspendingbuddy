import type { ProductInfo } from './types';

/** Try multiple selectors, return first match's text content */
function queryText(...selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return '';
}

/** Try multiple selectors, return first match's attribute */
function queryAttr(attr: string, ...selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const val = el?.getAttribute(attr);
    if (val) return val;
  }
  return '';
}

/** Extract ASIN from URL or DOM */
function extractAsin(): string {
  // URL pattern: /dp/BXXXXXXXXX
  const urlMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
  if (urlMatch) return urlMatch[1];

  // Fallback: hidden input
  const input = document.querySelector<HTMLInputElement>('input[name="ASIN"]');
  if (input?.value) return input.value;

  // Fallback: data attribute
  const asinEl = document.querySelector('[data-asin]');
  if (asinEl?.getAttribute('data-asin')) return asinEl.getAttribute('data-asin')!;

  return '';
}

/** Extract price as a number */
function extractPriceNumeric(priceStr: string): number {
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

/** Extract all product info from the current Amazon product page */
export function extractProductInfo(): ProductInfo {
  const title = queryText('#productTitle', '#title', 'h1#title span');

  const price = queryText(
    '#priceblock_ourprice',
    '.a-price .a-offscreen',
    '#corePrice_feature_div .a-offscreen',
    '#price_inside_buybox',
    '.a-price-whole',
  );

  const imageUrl = queryAttr(
    'src',
    '#landingImage',
    '#imgBlkFront',
    '#main-image',
    '#ebooksImgBlkFront',
  );

  const category = queryText(
    '#wayfinding-breadcrumbs_feature_div',
    '.a-breadcrumb',
  );

  return {
    title,
    price,
    priceNumeric: extractPriceNumeric(price),
    imageUrl,
    asin: extractAsin(),
    category: category.replace(/\s+/g, ' ').trim(),
  };
}

/** Find the Add to Cart button */
export function findAddToCartButton(): HTMLElement | null {
  const selectors = [
    '#add-to-cart-button',
    '#add-to-cart-button-ubb',
    'input[name="submit.add-to-cart"]',
    '#submit.add-to-cart',
  ];

  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

/** Find the Buy Now button */
export function findBuyNowButton(): HTMLElement | null {
  const selectors = [
    '#buy-now-button',
    '#submit.buy-now',
    'input[name="submit.buy-now"]',
  ];

  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

/** Find all Prime delivery / one-click / subscribe buttons */
export function findPrimeDeliveryButtons(): HTMLElement[] {
  const buttons: HTMLElement[] = [];
  const selectors = [
    // "Add to your Thursday delivery" / "Add to your X delivery" buttons
    '#freshAddToCartButton',
    '#add-to-cart-button-fresh',
    '#sameday-accordion button',
    // Prime "Add to" accordion buttons
    'input[name="submit.addToCart"]',
    // Subscribe & Save
    '#rcx-subscribe-submit-button',
    '#subscribe-and-save-buy-box input[type="submit"]',
    // One-click buy
    '#one-click-button',
    '#oneClick',
    'input[name="submit.one-click-buy"]',
  ];

  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) buttons.push(el);
  }

  // Catch any button whose text contains "Add to your" or "Add to Thursday" etc.
  // This handles dynamically named Prime delivery day buttons
  document.querySelectorAll<HTMLElement>(
    '#attach-accessories-button, #add-to-cart-button-group button, ' +
    '#freshCartBtn, [data-action="fresh-add-to-cart"], ' +
    '#submit\\.add-to-cart, .a-button-buy-now, ' +
    '#prime-accordion button, #sameDayContainer button'
  ).forEach(el => {
    if (!buttons.includes(el)) buttons.push(el);
  });

  // Broad text-match fallback for any button/input with delivery-related text
  document.querySelectorAll<HTMLElement>(
    'span.a-button-inner > input[type="submit"], ' +
    'span.a-button-inner > button, ' +
    '#addToCart input[type="submit"]'
  ).forEach(el => {
    const text = (el.getAttribute('value') || el.textContent || '').toLowerCase();
    if (
      (text.includes('add to') && text.includes('delivery')) ||
      text.includes('add to your') ||
      text.includes('subscribe') ||
      text.includes('one-click')
    ) {
      if (!buttons.includes(el)) buttons.push(el);
    }
  });

  return buttons;
}

const CART_ADD_PATTERNS: RegExp[] = [
  /\/gp\/cart\/add-to-cart(?:\/|$|\?)/,
  /\/gp\/cart\/add(?:-ajax)?\.html/,
  /\/gp\/aws\/cart\/add(?:-oe)?\.html/,
  /\/hz\/oneclickcheckout/,
  /\/gp\/buy\/spc\/handlers\/display\.html/,
];

export function isCartAddEndpoint(url: string, base?: string): boolean {
  let path: string;
  try {
    path = new URL(url, base ?? 'https://www.amazon.com').pathname;
  } catch {
    return false;
  }
  return CART_ADD_PATTERNS.some((re) => re.test(path));
}

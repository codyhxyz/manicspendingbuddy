import type { PermissionsRequest } from '@/utils/permissions';

// Baked at build time from WXT_PROXY_URL in .env. The fallback matches
// wrangler dev's default port so local testing against `wrangler dev` works
// end-to-end with no extra config. Production builds MUST have WXT_PROXY_URL
// set to the deployed Worker origin.
const PROXY_ORIGIN: string = (() => {
  const raw = (import.meta.env.WXT_PROXY_URL as string | undefined) ?? 'http://localhost:8787';
  try {
    return new URL(raw).origin + '/*';
  } catch {
    return 'http://localhost:8787/*';
  }
})();

export type PermissionStep = {
  id: string;
  label: string;
  justification: string;
  permissions: PermissionsRequest;
  privacyNote?: string;
  cta?: string;
};

export type WelcomeConfig = {
  valueProp: string;
  activationSurfaces: string[];
  steps: PermissionStep[];
  links: {
    repo: string;
    issues: string;
    privacy: string;
  };
};

export const welcomeConfig: WelcomeConfig = {
  valueProp:
    "A curious buddy that asks what you're trying to accomplish before you add things to your Amazon cart.",
  activationSurfaces: [
    'Amazon product pages (Add to Cart, Buy Now, Subscribe & Save)',
    'Amazon cart page (one last look before checkout)',
  ],
  steps: [
    {
      id: 'host-amazon',
      label: 'Access to amazon.com',
      justification:
        "So the buddy can catch Add to Cart / Buy Now clicks and show you the intervention overlay right on the page. The extension doesn't see anything outside Amazon.",
      permissions: { origins: ['https://www.amazon.com/*'] },
      privacyNote: 'Only runs on amazon.com — never on other sites.',
      cta: 'Allow on amazon.com',
    },
    {
      id: 'host-proxy',
      label: "Talk to the buddy's server",
      justification:
        "So the buddy can ask an AI to think through your purchase with you. We never send your name, address, or card details — just the product title, your stated goal, and your daily budget.",
      permissions: { origins: [PROXY_ORIGIN] },
      privacyNote: 'Your data is not stored on the server.',
      cta: 'Connect the buddy',
    },
  ],
  links: {
    repo: 'https://github.com/codyhxyz/manicspendingbuddy',
    issues: 'https://github.com/codyhxyz/manicspendingbuddy/issues',
    privacy: 'https://github.com/codyhxyz/manicspendingbuddy/blob/main/docs/templates/privacy-policy.md',
  },
};

import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  manifest: {
    name: 'Manic Spending Buddy',
    description: 'A little creature in your browser that makes it feel good not to spend money at Amazon.',
    version: '0.1.0',
    permissions: ['activeTab', 'storage', 'alarms', 'notifications'],
    host_permissions: [
      'https://www.amazon.com/*',
      // The proxy URL is baked from WXT_PROXY_URL at build time; this wildcard
      // covers *.workers.dev until we pin a specific subdomain or move to
      // msb.codyh.xyz. Narrow to the exact hostname before CWS submission.
      'https://*.workers.dev/*',
    ],
  },
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
  },
});

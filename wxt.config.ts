import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  manifest: {
    name: 'Manic Spending Buddy',
    description: 'A little creature in your browser that makes it feel good not to spend money at Amazon.',
    version: '0.1.0',
    permissions: ['activeTab', 'storage', 'alarms'],
    host_permissions: ['https://www.amazon.com/*'],
  },
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
  },
});

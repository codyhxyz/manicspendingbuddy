import { defineConfig } from 'wxt';

// Proxy origin for optional_host_permissions. Read from WXT_PROXY_URL at
// config-load time so the manifest host list exactly matches whatever the
// welcome page asks users to grant. Falls back to wrangler dev's default port.
function proxyOriginPattern(): string {
  const raw = process.env.WXT_PROXY_URL ?? 'http://localhost:8787';
  try {
    return new URL(raw).origin + '/*';
  } catch {
    return 'http://localhost:8787/*';
  }
}

export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  manifest: {
    name: 'Manic Spending Buddy',
    description: 'A little creature in your browser that makes it feel good not to spend money at Amazon.',
    version: '0.1.0',
    permissions: ['storage', 'alarms', 'notifications'],
    // Host access is requested at runtime from the welcome page so the
    // install prompt stays empty. This avoids the Chrome Web Store "in-depth
    // review" banner that broad install-time host_permissions trigger. See
    // create-chrome-extension factory's docs/03-cws-best-practices.md.
    optional_host_permissions: [
      'https://www.amazon.com/*',
      proxyOriginPattern(),
    ],
  },
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
  },
});

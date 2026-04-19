import { defineConfig } from 'wxt';

// Load .env into process.env before WXT reads the manifest config. WXT's Vite
// pipeline auto-loads .env for bundled code (import.meta.env), but not for
// this config file. Node 20.6+ exposes loadEnvFile; we try/catch so older
// runtimes still work with whatever process.env already holds.
try {
  (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.('.env');
} catch {
  /* .env not present — fall back to process.env defaults below */
}

// Proxy origin for optional_host_permissions. Must match the WXT_PROXY_URL
// baked into lib/proxy.ts so the welcome page asks for exactly the origin the
// extension will hit. Fallback = the deployed production URL.
function proxyOriginPattern(): string {
  const raw = process.env.WXT_PROXY_URL ?? 'https://manicspendingbuddy.codyh.xyz';
  try {
    return new URL(raw).origin + '/*';
  } catch {
    return 'https://manicspendingbuddy.codyh.xyz/*';
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

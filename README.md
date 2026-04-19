# Manic Spending Buddy

A curious AI buddy that lives in your browser and asks "what's the goal?" before you add things to your Amazon cart. Not a blocker, not a guilt machine — a friend who's good with money. Built for ADHD brains that bounce off timers, blockers, and friction walls.

## What it does

- Intercepts **Add to Cart**, **Buy Now**, **1-Click**, **Subscribe & Save**, and Prime delivery-day buttons on `amazon.com` product pages.
- Shows a warm overlay asking what you're trying to accomplish. Sends the product + your goal to a small AI; surfaces concerns only when they actually apply.
- Does a **cart-level review** on `/cart` before Proceed to Checkout — flags cross-cart patterns, budget math, and items you added via 1-click with no goal on record.
- Optional **48-hour hold** mode: pick "hold" instead of adding; the buddy pings you when it's time to decide. Most items don't survive the wait.
- Tracks savings streak and running total locally in `chrome.storage.local`. Nothing leaves your machine except product titles + your stated goal (via a server-side AI proxy).

## Not BYOK

The AI works out of the box. Every request goes through a Cloudflare Worker (`proxy/`) that holds the provider key and rate-limits per install. You never configure an API key.

## Architecture

- **WXT + React + TypeScript**, Manifest V3.
- Three content scripts per tab:
  - `amazon-intercept.content` (MAIN world, `document_start`) — patches `fetch`/`XHR` on cart-add endpoints.
  - `amazon.content` (ISOLATED, `document_idle`) — DOM-click interceptor and React overlay.
  - `amazon-cart.content` — cart-review overlay on `/cart`.
- Service worker (`entrypoints/background.ts`) brokers all AI calls, storage, holds, and reminder alarms.
- Host access is requested at runtime from the post-install welcome page — no install-time permission prompts, no Chrome Web Store "in-depth review" banner.

## Develop

```bash
pnpm install
pnpm dev        # loads in Chrome via WXT
pnpm test       # vitest
pnpm compile    # tsc --noEmit
pnpm build      # builds and syncs .output/chrome-mv3 → chrome-extension/
```

`chrome-extension/` is the unpacked directory you load via `chrome://extensions` → Load unpacked.

## Proxy

See `proxy/README.md` for the Cloudflare Worker. Production is deployed at `manicspendingbuddy.codyh.xyz`. Set `WXT_PROXY_URL` in `.env` to point builds at your own deployment.

## Status

MVP — not yet on the Chrome Web Store. See `PLAN.md` for roadmap and `docs/` for the full design trail.

# Manic Spending Buddy — Implementation Plan

## What This Is

A Chrome extension that intercepts Amazon "Add to Cart" clicks and has a conversation with you before the purchase goes through. Not a blocker. Not a guilt machine. A curious buddy who asks "what's the goal?" and then genuinely tries to help you get there — sometimes for free.

**Positioning (from Notion):** "This is NOT a budgeting app. This is for impulsive people who want a lovable AI gremlin living in their browser that makes not buying things more entertaining than buying them."

## Design Principle #1: Hear First, Suggest Second

The tool's first move is ALWAYS to ask you to explain why you want the item — and genuinely listen. The tone is a curious friend who happens to be good with money, not a disapproving parent or a friction wall.

- Ask "what's the goal?" and wait for the answer
- Understand the stated need before applying any lenses
- If the purchase is actually good, say so — don't manufacture objections
- Only after understanding the "why" does it suggest alternatives
- Alternatives must directly address the stated need, not generic "have you considered not buying things" energy

This matters especially for ADHD brains: friction-based tools (timers, blockers, guilt) fail because they add cognitive load without providing value. This tool replaces the dopamine of buying with the dopamine of being understood and finding a better path.

## Existing Research (from Notion)

- **Market:** 10-15M Americans with ADHD/bipolar who actively seek solutions; impulse spending is $150-282/mo per consumer
- **Competitors:** Icebox (stagnated, timer-based), Pause (30-sec blocker), ImpulseLock/Spindle (GitHub-only) — all use friction, which fails for ADHD brains
- **Revenue model:** $5/mo freemium. Targets: 5K users = $750 MRR, scaling to $150K MRR at 1M users
- **5-level escalation mechanic** (from Notion): practical substitution -> emotional reframe -> surprise/delight -> chaos agent -> real-world action. MVP = Level 1 only.

## Architecture: Chrome Extension (Manifest V3)

**Stack:** WXT framework + React + TypeScript

Why WXT: ~43% smaller bundles than Plasmo, better HMR, Vite-based, actively maintained. File-based entrypoints — `content-scripts/amazon.tsx` auto-registers for Amazon URLs.

```
+---------------------------+     +-------------------+
|  Content Script (Amazon)  |     |  Service Worker    |
|  - DOM observer           |---->|  - Claude API call |
|  - Cart interception      |     |  - Budget lookup   |
|  - Overlay injection      |<----|  - Alt search      |
+---------------------------+     +-------------------+
                                         |
                    +--------------------+--------------------+
                    |                    |                    |
            +-------v------+   +--------v------+   +--------v------+
            | Claude Haiku |   | Financial Adv  |   | Price APIs    |
            | (9-lens LLM) |   | (Teller data)  |   | (Keepa, etc)  |
            +--------------+   +----------------+   +---------------+
```

## How Cart Interception Works

1. **Primary:** Intercept `#add-to-cart-button` click with `capture: true`, `preventDefault`, show overlay
2. **Fallback:** MutationObserver on `#nav-cart-count` catches Buy Now, 1-Click, Subscribe & Save
3. **URL-based:** Navigate to `/gp/cart/view.html` or `/cart` triggers cart review overlay

**Product data extraction from DOM:**
- Title: `#productTitle`
- Price: `#priceblock_ourprice`, `.a-price .a-offscreen`
- ASIN: URL path `/dp/B0XXXXXXXX` or `input[name="ASIN"]`
- Category: `#wayfinding-breadcrumbs_feature_div`
- Image: `#landingImage`

## The Intervention UX

### Step 1: "What's the goal?"
- Overlay slides down from top of product page (in-context, not popup)
- Shows: product name, price, image
- Shows: remaining daily budget, month-to-date Amazon spending
- Asks: "What are you trying to accomplish with this?" — text input
- User explains in their own words

### Step 2: The 9-Lens Analysis
- Claude Haiku API call with product info + stated goal + budget context
- Returns in 2-3 seconds
- Surfaces relevant lenses (not all 9 — only what flags)
- Shows free alternatives, cheaper alternatives, "already own" suggestions
- Tone: warm, specific, irreverent

### Step 3: The Decision
- **"Skip it"** (green, prominent) — celebration, savings counter increments
- **"Add anyway"** (small, gray) — no friction, no guilt, just adds to cart. Logs it.
- **"Save for later"** — extension wishlist, 7-day reminder. Most items won't survive.

### Claude API Prompt Structure

```
System: You are the Manic Spending Buddy. The user is about to buy something.
Your job: understand their goal, then run the purchase through 9 lenses.
[include lens definitions from financialadvisor/CLAUDE.md]

IMPORTANT: The user just explained WHY they want this. Start by acknowledging
their goal. If the purchase genuinely serves it well, say so. Only flag lenses
that actually apply. Do not manufacture objections.

Be warm, specific, and genuinely helpful. You're a friend, not a gatekeeper.

User context:
- Daily budget: $X discretionary
- Spent today: $Y
- Amazon this month: $Z

Product: [title], $[price], category: [category]
User's stated goal: [their text input]
```

**Cost:** ~$0.002 per intervention (500 tokens in, 300 out). At heavy usage (10/day): $0.60/month.

## MVP Scope

### In MVP:
1. WXT + React + TypeScript Chrome extension
2. Content script on `amazon.com/*` intercepting Add to Cart clicks
3. Overlay: product info, "what's the goal?" input, Claude response, 3 buttons
4. Service worker: Claude Haiku API call with 9-lens prompt
5. Popup: savings counter, today's spending
6. Options: Claude API key, daily budget (manual input)
7. Local storage: savings streak, intervention log, save-for-later list

### NOT in MVP:
- Teller/financial advisor integration (manual budget instead)
- Price comparison APIs (Claude's knowledge is sufficient)
- Escalation levels 2-5
- Multi-site support
- Premium tier / payments
- The "chaos agent" levels

## Build Order

### Phase 1: Skeleton (Day 1)
1. Init WXT project: `npx wxt@latest init --template react`
2. Configure manifest: `activeTab`, `storage`, `host_permissions: ["https://www.amazon.com/*"]`
3. Create content script for `*://*.amazon.com/*`
4. Implement basic DOM detection: find Add to Cart button, add click listener
5. Build and test with `npx wxt dev`

### Phase 2: Interception + UI (Day 1-2)
6. Build `InterventionOverlay.tsx` (product info, text input, response area, action buttons)
7. Implement `amazon-selectors.ts` with fallback selectors for product data extraction
8. Wire up click interception: preventDefault, extract product data, show overlay
9. Style to be distinct from Amazon but not jarring

### Phase 3: Claude Integration (Day 2)
10. Service worker with Claude Haiku API call
11. `claude.ts` — system prompt with 9 lenses, product context, response parsing
12. Options page for API key entry
13. Wire up: content script -> service worker -> Claude -> overlay display
14. Handle errors, timeouts, rate limits

### Phase 4: State + Tracking (Day 2-3)
15. `storage.ts` using `chrome.storage.local` — savings counter, intervention log, save-for-later
16. Popup with savings streak, recent interventions, quick stats
17. "Save for Later" with 7-day reminder via `chrome.alarms`

### Phase 5: Polish + Ship (Day 3)
18. MutationObserver fallback for cart count changes
19. Handle Amazon page variations (search results, Subscribe & Save, variations)
20. Error handling, offline degradation
21. Build for production, submit to Chrome Web Store ($5 one-time)

### Phase 6: Financial Advisor Integration (Week 2)
22. Local budget API server reading JSONL transaction files
23. Extension calls local server for real-time budget data
24. Replace static budget with live numbers from Teller

### Phase 7: Monetization + Growth (Week 3+)
25. $5/mo premium via ExtensionPay or Stripe
26. Escalation levels 2-3 for premium
27. Keepa price history, Open Library API for books
28. Multi-site: Target, Walmart, Etsy
29. Launch: Product Hunt, r/ADHD, r/bipolar, r/Frugal

## File Structure

```
~/code/claude/manicspendingbuddy/
  wxt.config.ts
  package.json
  tsconfig.json
  entrypoints/
    amazon.content/
      index.tsx                 # Content script, DOM observers
      components/
        InterventionOverlay.tsx
        ProductCard.tsx
        BudgetBar.tsx
        ActionButtons.tsx
    background/
      index.ts                  # Service worker, API calls
    popup/
      index.tsx                 # Savings dashboard
    options/
      index.tsx                 # Settings (API key, budget)
  lib/
    amazon-selectors.ts         # DOM selectors with fallbacks
    claude.ts                   # Claude API + 9-lens prompt
    storage.ts                  # chrome.storage.local wrapper
    budget.ts                   # Budget computation
    types.ts
  assets/
    icon-16.png
    icon-48.png
    icon-128.png
```

## Key Risks

| Risk | Mitigation |
|------|------------|
| Amazon changes DOM selectors | Multi-selector fallback module; MutationObserver backup |
| Claude latency >5s | Show instant budget stats while loading; cache by ASIN |
| Amazon blocks extension | Uses standard DOM APIs (same as Honey/Keepa — tolerated) |
| Manifest V3 service worker hibernation | `chrome.alarms` keepalive during interventions |

## Integration Points

- `financialadvisor/CLAUDE.md` — 9-lens framework (the intellectual core)
- `financialadvisor/sync.py` — Teller API pattern for Phase 6
- `financialadvisor/transactions/*.jsonl` — live spending data for budget integration
- `financialadvisor/financial-snapshot.md` — current budget parameters for defaults

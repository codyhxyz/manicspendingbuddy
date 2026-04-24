# manic spending buddy

> this is NOT a budgeting app. this is for impulsive people who want a lovable AI gremlin living in their browser that makes not buying things more entertaining than buying them.

a Chrome extension that intercepts Amazon "Add to Cart" clicks and has a conversation with you before the purchase goes through. not a blocker. not a guilt machine. a curious buddy who asks "what's the goal?" and then genuinely tries to help you get there — sometimes for free.

## design principle: hear first, suggest second

the tool's first move is ALWAYS to ask you to explain why you want the item — and genuinely listen. the tone is a curious friend who happens to be good with money, not a disapproving parent or a friction wall.

- ask "what's the goal?" and wait for the answer
- understand the stated need before applying any lenses
- if the purchase is actually good, say so — don't manufacture objections
- only after understanding the "why" does it suggest alternatives
- alternatives must directly address the stated need, not generic "have you considered not buying things" energy

this matters especially for ADHD brains: friction-based tools (timers, blockers, guilt) fail because they add cognitive load without providing value. this tool replaces the dopamine of buying with the dopamine of being understood and finding a better path.

## status

mvp. not on the chrome web store yet. amazon-only for now (it's where the bleed is). cart + product page interception working end-to-end. the [proxy](./proxy) is live at `manicspendingbuddy.codyh.xyz` so the ai works out of the box — no api key to configure, ever.

if you want to try it early, clone and load it unpacked. see [contributors](#for-contributors) below.

a longer version of this thinking lives in [`PLAN.md`](./PLAN.md). the full surface map is in [`SURFACES.md`](./SURFACES.md).

## for contributors

stack: [wxt](https://wxt.dev) + react 19 + typescript, manifest v3. cloudflare worker proxy in [`proxy/`](./proxy) so installs don't need api keys.

```bash
pnpm install
pnpm dev        # loads in chrome via wxt
pnpm test       # vitest
pnpm compile    # tsc --noEmit
pnpm build      # outputs to chrome-extension/ (load unpacked)
```

three content scripts per amazon tab handle interception (one in the main world patches `fetch`/`xhr` on cart endpoints; one in the isolated world owns the overlay; one runs on `/cart` for the pre-checkout review). the service worker brokers all ai calls and holds. host access is requested at runtime from a welcome page, not at install — no scary chrome web store permission banner.

issues and prs welcome. tone matters here: warm, specific, irreverent. never preachy.

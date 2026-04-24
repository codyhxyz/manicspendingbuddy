# manic spending buddy

*you opened amazon to buy one thing. you are about to check out with seven.*

a curious little ai that lives in your browser and asks "what's the goal?" before you hit **add to cart** on amazon. not a blocker. not a guilt machine. a friend who happens to be good with money.

built for adhd / impulsive brains that bounce off timers, friction walls, and budgeting apps. the dopamine of being understood turns out to be cheaper than the dopamine of buying.

## how it feels

- you click **add to cart**, **buy now**, **1-click**, **subscribe & save**, or a prime delivery-day button.
- a warm overlay slides in. it asks what you're actually trying to accomplish.
- you tell it. a small ai reads your goal alongside the product and only flags concerns that *actually apply*. if the purchase is good, it says so.
- three buttons: **skip it**, **add anyway** (no friction, no guilt), or **hold for 48 hours**. most things don't survive the wait.
- on the cart page, it does one last cross-cart review before you hit checkout — the place where ten small "fine" decisions become $335.
- a quiet streak counter tracks what you didn't buy.

## status

mvp. not on the chrome web store yet. amazon-only for now (it's where the bleed is). cart + product page interception working end-to-end. the [proxy](./proxy) is live at `manicspendingbuddy.codyh.xyz` so the ai works out of the box — no api key to configure, ever.

if you want to try it early, clone and load it unpacked. see [contributors](#for-contributors) below.

## why

every existing tool in this space is built around friction: a 30-second timer, a blocker, a guilt prompt, a budget you have to manually update. friction is exactly the wrong primitive for an adhd brain — it adds cognitive load without adding value, and we route around it within a week.

what *does* work: being heard. so the buddy's first move is always to listen. it asks why before it suggests anything. when it does suggest something, the suggestion has to actually serve the goal you stated — not generic "have you considered not buying things" energy.

the bet: if not-buying is *more entertaining* than buying, the impulse loses on its own merits. no willpower required.

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

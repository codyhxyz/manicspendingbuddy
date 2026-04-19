# Amazon Surfaces to Intercept

Prioritized by impulse-spend impact. MVP covers #1. Next iterations expand outward.

## Tier 1: Safety Net (catches everything)

- **Cart page — "Proceed to checkout"** — Show total cart value vs. remaining budget. This is where $335/mo happens: 10 small items that each felt fine individually. Last chance before checkout flow.
- **Checkout — "Place your order"** — Nuclear option. If cart total exceeds daily/monthly budget, one final intervention before money leaves. This is the catch-all regardless of which add-to-cart button slipped through.

## Tier 2: Point of Impulse (product-level)

- **Product page — Add to Cart / Buy Now** — MVP, done.
- **Product page — Prime delivery buttons** — "Add to Thursday's delivery" etc. Done.
- **Product page — Subscribe & Save** — Committing to recurring spend in one click. Done (selector added).
- **Product page — One-Click buy** — Done (selector added).
- **Search results — inline "Add to Cart"** — Never visit the product page, never pause. Need to extract product info from the search result card DOM instead of the product page.
- **"Move to Cart" from Wish List / Save for Later** — Deferred impulse buys. The urge was never questioned, just delayed.

## Tier 3: Upstream Triggers (where the browse-to-buy pipeline starts)

- **Lightning Deals / Deal of the Day** — Urgency timers are ADHD kryptonite. Extension could flag: "This deal triggers every week. It'll come back." Defuse the FOMO.
- **"Buy Again" page** — Repeat purchases feel "safe" but add up. The $8/mo thing you never questioned is $96/year.
- **"Frequently bought together" / "Customers also bought"** — Amazon's cross-sell engine. Came for one thing, left with three.
- **Homepage "Recommended for you" / "Inspired by your browsing"** — The dopamine browse. Not a purchase button per se, but could show a gentle budget reminder banner.
- **Kindle / digital one-click** — Instant, no cart, no friction. Books feel "free" but add up fast.

## Design Notes

- Tier 1 is the highest-leverage next build. Cart + checkout interception catches everything that slips through Tier 2.
- Tier 2 is about catching it early — before the item even reaches the cart. Better UX because you haven't committed yet.
- Tier 3 is about defusing the impulse before it forms. Hardest to build, highest long-term value.
- Every tier should respect Design Principle #1: hear first, suggest second. Even the cart page intervention should ask "what's the plan with all this?" not "you're spending too much."

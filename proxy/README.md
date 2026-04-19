# msb-proxy

Cloudflare Worker that the Manic Spending Buddy extension calls instead of hitting MiniMax directly. The real API key lives here as a Worker secret so it can't be extracted from the shipped extension bundle.

## Endpoints

- `POST /v1/analyze` — purchase intervention (single product).
- `POST /v1/cart-review` — cross-cart review at checkout.

Both accept:
```json
{ "systemPrompt": "...", "userMessage": "...", "maxTokens": 400, "temperature": 0.7 }
```
and require the `X-MSB-Install-Id` header. They return `{ "content": "..." }` or a non-2xx with `{ "error": "..." }`.

## Rate limits

Per install id, per calendar day (UTC):
- `/v1/analyze` — `ANALYZE_LIMIT_PER_DAY` (default 30)
- `/v1/cart-review` — `CART_REVIEW_LIMIT_PER_DAY` (default 10)

Enforced via Workers KV with a day-bucketed counter key `rl:<kind>:<installId>:<YYYY-MM-DD>`. On exceed: 429 with `Retry-After` + a JSON `retryAt` timestamp.

## First-time deploy

1. Install [wrangler](https://developers.cloudflare.com/workers/wrangler/) and log in: `npx wrangler login`.
2. From this directory:
   ```bash
   pnpm install
   npx wrangler kv:namespace create RATE_LIMITS
   ```
   Copy the returned `id` into `wrangler.toml` under `[[kv_namespaces]]`.
3. Put the MiniMax key in as a secret (never commit it):
   ```bash
   npx wrangler secret put MINIMAX_API_KEY
   ```
   Paste the key when prompted.
4. Deploy:
   ```bash
   npx wrangler deploy
   ```
   Wrangler prints the `msb-proxy.<account>.workers.dev` URL. Paste that URL into `mvp/.env` as:
   ```
   WXT_PROXY_URL=https://msb-proxy.<account>.workers.dev
   ```
   Rebuild the extension (`pnpm build` from `mvp/`) so it bakes the URL in, and update `mvp/wxt.config.ts` host_permissions to include the exact hostname.

## Dev loop

Local run (does NOT call real MiniMax unless you set a secret in `.dev.vars`):

```bash
npx wrangler dev
```

Defaults to `http://localhost:8787`, which is also the extension's fallback `WXT_PROXY_URL`.

## Ship-readiness

- [ ] KV namespace created and id in `wrangler.toml`
- [ ] `MINIMAX_API_KEY` secret set
- [ ] Hard monthly budget cap set on the MiniMax account dashboard
- [ ] Extension `.env` has the deployed Worker URL
- [ ] Extension `wxt.config.ts` host_permissions includes the exact hostname

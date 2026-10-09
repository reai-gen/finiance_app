# 9–5 Wealth

## Start the app
Requires Node.js 22 or newer (native server-side WebSocket). No API key or npm installation is needed for prices
and public-feed briefings.
```bash
git pull
node server.mjs
```
Open http://localhost:3000. If the server is already running, stop it with Ctrl+C
and restart it after pulling. Opening index.html directly cannot retrieve market data.

## Market prices
The dashboard deliberately displays **only three reference markets**:
- Gold futures (`GC=F`): latest available COMEX futures reference in **USD per troy ounce**.
- Silver futures (`SI=F`): latest available COMEX futures reference in **USD per troy ounce**.
- Nasdaq-100 Index (`^NDX`): index level in **points**, not dollars or an investable share.

Quotes and OHLC chart candles are requested through the existing server-side Yahoo Finance chart endpoint. They are **provider-delayed or last-available**, not guaranteed live exchange feeds. Gold and silver futures prices are not retail spot/bullion purchase prices. This focused dashboard intentionally hides the old individual-stock news panel. The macroeconomic explainer remains available, but calendar event coverage requires an FMP key. Finnhub equity streaming is not currently used for these three instruments. If an index or intraday candle is unavailable from Yahoo, the app shows an unavailable state rather than invented prices.

## Selected-stock briefings
Selecting a stock updates its public-feed briefing. It extracts short summaries
from recent Yahoo Finance/Bing News headlines and publisher excerpts, adds US
jobs/NFP, Fed rates and UK rates/inflation context, and links to sources.
The brief is based on excerpts, not full-article analysis. Coverage is not exhaustive.
The section shows missing/failed feeds explicitly and cancels superseded requests.

## Tests
```bash
node --test test-market.mjs test-news.mjs test-briefing.mjs
```
Tests use provider fixtures and exercise pricing units, timestamps, caching,
failure states, chart points, refresh and selection races. They do not guarantee
public-provider availability or verify every live quote.
Browser visual checks have not been run in the current environment.

## Optional legacy endpoints
/api/news and /api/macro can still use an FMP_API_KEY configured in the server
environment. These are not required by the current price/briefing interface.
Never commit credentials. Environment files are ignored by git.

The server binds to localhost. Deployment requires a server runtime; static-only
hosting cannot call the API routes.

## Market data endpoints
- GET /api/quote?stock=US:AAPL (also UK:BP. and the other curated watchlist IDs)
- GET /api/chart?stock=UK:BP.&period=1M (1W, 1M, 1Y)

The server requests Yahoo Finance chart data and caches snapshots for 60 seconds. Auto-refresh checks every minute while the page is visible; a refresh does **not** guarantee the exchange has published a new trade or quote. Yahoo Finance availability, usage terms and permission for redistribution should be assessed before production deployment. Missing or invalid quotes are displayed as unavailable, never replaced with demo figures.

## Optional live streaming trades

Set `FINNHUB_API_KEY` in your **server-only** `.env`, then restart `node --env-file=.env server.mjs`. The server makes a single upstream WebSocket connection to Finnhub and distributes validated last-trade events through same-origin `GET /api/live` using Server-Sent Events. The browser never receives the Finnhub token. The existing Yahoo Finance quote snapshots (once per minute) remain available when streaming is offline, unconfigured or not entitled. The previous close remains from the Yahoo snapshot when computing live daily percentage change; if it is absent, change remains blank.

**Important:** A connected WebSocket does *not* guarantee live prices for every ticker. Finnhub's US coverage can reflect particular venues, and LSE access, symbol mapping, UK quote units, exchange redistribution permissions and subscriptions must be verified for the account. UK streaming prices are only accepted when consistent with the existing quote currency and within a sanity range of the snapshot. Unsupported symbols simply keep their latest available snapshot. No artificial ticks or invented price movements are generated. Market closures may produce no new trades. The client rejects stale or out-of-order trades, and the server drops trades older than five minutes. Do not expose the app publicly without authentication, usage controls and licence review.

Get Finnhub WebSocket details at https://finnhub.io/docs/api/websocket-trades. One Finnhub API key can open only one upstream connection; running multiple copies of this server with the same token may cause disconnections.

## Candlestick charts
The stock detail panel offers `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1W`, `1M` and `1Y`. The first six are candle resolutions / short history windows (1m = one-minute candles for one trading day, 5m/15m = recent five days, 1h/4h = recent month, 1d = five days). The last three display a week, month or year of daily candles. Each candle shows provider open/high/low/close (OHLC); 4h candles aggregate four hourly candles within a single market-local date. Candles are historical provider data, **not a guaranteed live tick feed**. Intraday data retention, UK exchange coverage, holidays, trading sessions and exchange delays depend on the provider. Unsupported intervals display a clear no-data/error state rather than synthetic prices.

## Animated money-flow explainer
The top-of-page UK/US animation is an **illustration**, not measured capital flow. The selector explains potential household pathways through interest rates, inflation, wages and trade/political policy. Related FMP economic calendar items are shown when available without implying an observed causal or monetary impact. The explainer remains educational when FMP is unavailable. No user budget or financial account data is collected.

## Deploy to Render and share the site

The repository includes a Render Blueprint `render.yaml` with a free Node.js web service, a `/health` check, and Node 24. The server binds to `127.0.0.1` for local development and to `0.0.0.0` on Render via `HOST`.

1. Sign into https://dashboard.render.com/ and connect GitHub.
2. Select **New → Blueprint**, select `reai-gen/finiance_app` and its `main` branch. Review the service and choose **Apply**.
3. Enter **newly rotated** `FINNHUB_API_KEY` and (if available) `FMP_API_KEY` in the secure environment-variable prompts. Do **not** put secrets in the repository. If a provider is not configured, that particular live/news feature may be unavailable.
4. Wait for the web service status to be **Live**. Open the exact HTTPS `onrender.com` URL assigned by Render; verify the dashboard and `/health` response. Share this URL.

Free web services can sleep when idle and may take a while to wake up; a continuously streaming app benefits from an always-on paid instance. Provider access, market-data redistribution terms and rate limits need review before inviting a large audience. The service is publicly reachable once deployed; avoid sharing it widely until you've checked provider rights and usage limits.

Test locally before deployment: `node --test test-news.mjs test-market-data.mjs test-live-stream.mjs` then `node --env-file=.env server.mjs`.

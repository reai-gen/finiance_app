# Finance World

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
- The catalogue contains 24 UK and US listings. It is not the full market.
- Prices and history are fetched server-side from Yahoo Finance chart data.
- The price is the latest available regular-session quote, with its provider quote
  timestamp. Pre/post-market prices are not substituted.
- Day % is calculated against the previous regular-session close supplied for a
  one-day query. Missing prior closes produce no percentage, rather than a guess.
- Checks run every minute while the page is visible, with four concurrent requests.
  There is also a Refresh prices button. Server data is cached for up to 60 seconds.
- GBp/GBX remain British pence; GBP remains pounds. The app never silently
  multiplies or divides a quote by 100.
- Historical charts use actual dated closing-price points for 1 week, 1 month or
  1 year. Missing points are excluded. No chart is simulated.
- Failed quote refreshes clear the old price and display Unavailable.
- Quote time and retrieval time are different: the quote timestamp can be from the
  last trading session when the market is closed.
- Yahoo/exchange data may be delayed. This is not a guaranteed real-time stream.
  The public Yahoo endpoint is not a contracted market-data API and may be
  restricted or change. An unavailable source produces an explicit error.
- Reference: https://help.yahoo.com/kb/finance/article-exchanges-data-delays-sln2310.html

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

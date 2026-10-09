# Finance World

## Start the app
Requires Node.js 20 or newer. No API key or npm installation is needed for prices
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

## Candlestick charts
The stock detail panel offers `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1W`, `1M` and `1Y`. The first six are candle resolutions / short history windows (1m = one-minute candles for one trading day, 5m/15m = recent five days, 1h/4h = recent month, 1d = five days). The last three display a week, month or year of daily candles. Each candle shows provider open/high/low/close (OHLC); 4h candles aggregate four hourly candles within a single market-local date. Candles are historical provider data, **not a guaranteed live tick feed**. Intraday data retention, UK exchange coverage, holidays, trading sessions and exchange delays depend on the provider. Unsupported intervals display a clear no-data/error state rather than synthetic prices.

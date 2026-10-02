# Finance World
UK/US stock explorer with company news and a macro calendar.

## Run locally
Requires Node.js 20 or newer. No npm dependencies are needed.

1. Pull the repository: `git pull`.
2. Create a local `.env` file in the repository folder:
   ```dotenv
   FMP_API_KEY=your_key_here
   ```
3. Start the app:
   ```bash
   node --env-file=.env server.mjs
   ```
4. Open http://localhost:3000.

Get a key from https://site.financialmodelingprep.com/developer/docs.
Your FMP plan must include Search Stock News and Economic Calendar access.
UK news coverage and provider symbol support vary. Access may require a paid plan.
Do not put the key in index.html or news.js, paste it into chat, or commit .env.
The key remains on the server. Without it, the app displays an honest setup state.
Opening index.html directly or using static-only hosting cannot serve the news API.

## What the news section does
- Choose a stock in either the table or the news selector; both remain in sync.
- Company headlines: last 30 days, 20 provider results per page, up to 50 pages.
  Deduplicates article URLs and links to the publisher. This is not all news on the internet.
- Macro watch: seven days back and fourteen days ahead; US and UK payrolls/NFP,
  policy rates, CPI/PCE/inflation, jobs and GDP events.
- Shows actual/forecast/previous values including zero. Missing values stay blank.
- Dates are provider calendar dates. Intraday release times are omitted because
  provider timezone semantics are not verified.
- Separate error states allow either feed to work when the other is unavailable.
- API responses are cached for five minutes and have a 12-second upstream timeout.
- Sector context is a general research prompt, not a personalised analysis,
  measured price impact or investment recommendation.
- The stock list, prices and charts remain the original 24-stock fictional demo.

## Verify
```bash
node --test test-news.mjs
```
Tests use mocked provider responses; they do not prove live account entitlement
or complete UK ticker coverage. A real API key is required for end-to-end verification.

## Data endpoints
- https://site.financialmodelingprep.com/developer/docs/stable/search-stock-news
- https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar

The server binds to localhost. Public deployment needs a server runtime, protected
environment secrets, request controls appropriate to your API allowance, and
provider permission for the intended display/redistribution of data.

# AGENTS.md — apps/finances-panel

## Product Goal (MVP)
`finances-panel` is an investment-focused personal finance dashboard, part of `second-brain`.

MVP must deliver:
1. **Investments-first** tracking: ETFs, stocks, crypto
2. **Net worth summary** including:
   - investments
   - bank accounts (basic)
   - real estate (basic/manual valuation)
3. **Price tracking with history** stored in shared Postgres, enabling:
   - performance charts
   - asset allocation
   - portfolio history since first transaction
4. **CSV import** (initially) for transactions and/or positions
5. **Background job** that updates market prices every 24h and stores them for historical charts

Future (planned, not v1):
- bank sync
- Telegram integration (shared bot)
- FIFO realized P/L reporting suitable for Spanish taxes (“Hacienda”)
- multi-user / SaaS readiness

## Domain Scope
### In scope (v1)
- Assets:
  - ETFs, Stocks, Crypto
- Portfolio transactions:
  - buys, sells, fees (minimum), deposits/withdrawals optional
- Pricing:
  - daily (or periodic) OHLC-ish or “close price” per asset
  - stored historically
- Net worth:
  - investments valued by latest known price
  - bank accounts as manual balances (or CSV)
  - real estate as manual valuation snapshots
- Visualizations:
  - portfolio value over time
  - allocation by asset class / ticker
  - performance over time (simple)

### Out of scope (v1)
- Perfect double-entry accounting
- Full budgeting
- Bank auto-sync (can design seams for it)
- Advanced tax exports (design data model for FIFO later)

## Data & DB Strategy
- Use the shared Postgres instance.
- Use schema: **`finances`**.
- Design with future `user_id` in mind:
  - Include `owner_id` column where feasible, defaulting to a single local user.
  - If not implemented in v1, ensure the model can be migrated cleanly later.

### Required Entities (conceptual)
1. **assets**
   - ticker/symbol, name, type (ETF/STOCK/CRYPTO), currency, exchange (optional)
2. **accounts**
   - broker accounts, crypto exchanges, bank accounts (bank may be simplified in v1)
3. **transactions**
   - buys/sells/fees/transfers
   - must be auditable and ordered (timestamp, imported_at, source)
4. **price_history**
   - asset_id, timestamp/date, price, currency, source
5. **valuation_snapshots** (optional v1, useful for net worth)
   - manual valuations for real estate / bank balances if not derived from transactions

### Import Strategy
- CSV import is required in v1.
- Store:
  - raw import file metadata (filename, hash, imported_at)
  - row-level errors for debugging
- Do not silently drop rows; produce a clear import report.

## Pricing Strategy
- A background job runs every 24h:
  - fetches latest prices for tracked assets
  - writes a new row into `finances.price_history`
- Requirements:
  - idempotent per (asset_id, date, source) to avoid duplicates
  - source attribution (API/provider name)
  - robust retry/backoff & partial failure handling
- Price history must be queryable to compute portfolio value on any day.

## Performance & Computation Rules
- Prefer server-side aggregation for heavy calculations (DB queries or API computed endpoints).
- Cache computed results where it matters (optional v1).
- Keep UI fast:
  - avoid huge payloads
  - paginate and summarize
- Use time-series queries efficiently (indexes on `(asset_id, date)`).

## API Architecture
- Use shared modular API (`/services/api`) with a **Finances module**.
- Expose endpoints (minimum set):
  - `GET /finances/summary` (net worth summary + high-level metrics)
  - `GET /finances/portfolio` (positions, allocation)
  - `GET /finances/timeseries` (portfolio value over time)
  - `POST /finances/import/csv` (upload/import)
  - `GET /finances/assets` + `POST /finances/assets` (manage tracked assets)
- Validate inputs/outputs (Zod).
- Standard error format: `{ code, message, details? }`.

## FIFO & Tax Readiness (Design Constraint)
Even if FIFO is not implemented in v1, ensure the transaction model supports:
- lots (or enough info to derive lots)
- fees, timestamps, quantities, prices, currency
- asset identifiers stable over time
- ability to compute realized gains/losses per sale later

Avoid modeling shortcuts that prevent correct lot matching.

## UI/Frontend Requirements
- Choose a performant stack (not prescribed), but requirements:
  - fast table rendering (positions, transactions)
  - charting for portfolio history and allocation
  - clear navigation: Summary → Portfolio → Assets → Import
- UI should be internal-dashboard style:
  - dense but readable
  - keyboard-friendly
- Must run in Docker as a container.

## Docker & Local Dev
- App container runs the frontend.
- Shared API container provides backend endpoints.
- Postgres container persists data.
- Provide:
  - `.env.example`
  - `README.md` with Bun infra script instructions (`bun run infra:up`, `bun run infra:up:build`, `bun run infra:ps`)
  - seed script for demo data

## Testing & Quality Bar (v1)
Minimum:
- Unit tests for parsing CSV and core calculations (positions valuation).
- Integration test or smoke test for:
  - importing CSV
  - fetching summary
- Lint + typecheck passing.

## Agent Operating Rules (Codex/AI)
1. **Read first**
   - Read root `AGENTS.md` and this file before changes.
2. **Implement vertical slices**
   - Prefer end-to-end MVP slices (DB + API + UI) over partial scaffolding.
3. **Be explicit about assumptions**
   - If a pricing provider, CSV format, or currency rules are unknown, add “Open Questions” and implement with safe defaults.
4. **Never destroy user data**
   - No destructive scripts by default. Provide explicit `reset` scripts behind confirmation.
5. **Document everything**
   - Update README with run steps and CSV format supported.
6. **Design for scale**
   - Keep seams for: multi-user, bank sync, Telegram, FIFO reporting.
7. **Follow root post-task infra policy**
   - For code/config/infra changes, run:
     - `bun run infra:up:build`
     - `bun run infra:ps`
   - Report resulting service health in the task completion update.

## Open Questions (to be resolved during implementation)
- Which CSV formats must be supported first (broker exports? custom template?)
- Base currency (EUR?) and FX handling strategy for v1
- Which price provider(s) to use for ETFs/stocks/crypto
- Update frequency details (daily close vs intraday)
- Real estate valuation frequency (manual snapshots?)

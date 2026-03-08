# AGENTS.md — apps/finances-panel

## Product Goal
`finances-panel` is the main live domain app inside `second-brain`.

Today it is an investment-focused personal finance dashboard with:
- overview and performance tracking
- asset registry and holdings
- account registry and savings cash tracking
- transaction timeline and manual entry
- CSV imports for selected providers
- yearly tax summary

The app is already beyond the original MVP sketch. Future work should extend the existing product shape instead of trying to force it back into an earlier plan.

## Current User Surface
Current navigation:
- `Overview`
- `Assets`
- `Accounts`
- `Transactions`
- `Taxes`

Current capabilities:
- investment tracking for stocks, ETFs, crypto, mutual funds, and retirement funds
- performance and portfolio overview with time-series charts
- positions and asset-level holdings
- account-level views, including savings cash visibility
- manual asset creation and metadata editing
- manual transaction creation
- manual savings deposits via cash movements
- CSV import workflows for:
  - DEGIRO transactions
  - Binance transactions
  - COBAS transactions
  - DEGIRO account statements
- yearly realized gain/loss summary

## Domain Scope
### In scope
- Assets:
  - stocks
  - ETFs
  - mutual funds
  - retirement funds
  - crypto
- Accounts:
  - brokerage
  - crypto exchange
  - investment platform
  - retirement plan
  - savings
- Transactions:
  - buys
  - sells
  - fees
  - dividends
  - account cash movements for supported account types
- Pricing:
  - historical market prices stored in Postgres
  - manual price override on asset positions when needed
- Visualizations:
  - portfolio performance over time
  - valuation overview
  - allocation/positions tables
  - account cash trends
- Import operations:
  - provider-specific CSV import with dry-run support
  - persisted import runs and row-level import outcomes

### Still partial or intentionally limited
- real-estate/manual valuation UX is not a first-class surface yet
- broader bank-account support is savings-oriented rather than a full banking module
- tax tooling exists as yearly summary, not full FIFO reporting or exports
- multi-user readiness is a design concern, not a delivered schema feature

### Out of scope for now
- perfect double-entry accounting
- budgeting
- bank sync
- Telegram workflows
- advanced Spanish tax exports

## Data & DB Strategy
- Shared Postgres database
- Domain schema: **`finances`**
- Current important tables include:
  - `accounts`
  - `assets`
  - `asset_positions`
  - `asset_transactions`
  - `account_cash_movements`
  - `price_history`
  - `asset_valuations`
  - `daily_balances`
  - `transaction_imports`
  - `transaction_import_rows`
- Current schema supports historical data, imports, and derived analytics
- Future multi-user support is still a desired direction; current schema does not yet implement `owner_id` / `user_id`

## API Architecture
- The app depends on the shared finances module in `services/api`
- Current route families include:
  - overview:
    - `GET /finances/overview`
    - `GET /finances/summary`
  - accounts:
    - `GET /finances/accounts`
    - `POST /finances/accounts`
    - `POST /finances/account-cash-movements`
  - transactions:
    - `GET /finances/transactions`
    - `POST /finances/transactions` if extending manual transaction flows, follow the existing route patterns in the finances module
  - assets:
    - `GET /finances/assets`
    - `POST /finances/assets`
    - `PATCH /finances/assets/:id`
    - `PUT /finances/assets/:id/position`
    - `DELETE /finances/assets/:id`
  - imports:
    - `POST /finances/import/degiro-transactions`
    - `POST /finances/import/binance-transactions`
    - `POST /finances/import/cobas-transactions`
    - `POST /finances/import/degiro-account-statement/analyze`
    - `POST /finances/import/degiro-account-statement`
  - tax:
    - `GET /finances/tax/yearly-summary`
- Inputs and outputs are validated through shared types in `@second-brain/types`
- Standard error format remains `{ code, message, details? }`

## Pricing & Worker Strategy
- Background jobs currently run through `services/worker`
- Implemented jobs include:
  - Yahoo market price sync
  - asset valuation snapshots
  - daily balance computation
- Price history is stored in `finances.price_history`
- Current sync is designed to be idempotent by `(symbol, source, priced_date_utc)`
- When extending pricing, preserve:
  - source attribution
  - idempotency
  - partial-failure tolerance

## UI/Frontend Requirements
- Preserve the internal-dashboard style already established in the app
- Reuse existing layout patterns:
  - overview/dashboard page
  - dense data tables
  - modal-driven creation/import flows
  - side-nav + top-nav shell
- Prefer app-local UI components over sharing visual primitives with other apps
- Keep the UI fast:
  - do heavy aggregation server-side
  - avoid oversized payloads
  - paginate transaction-heavy surfaces

## Implementation Guidance
1. **Read current behavior first**
   - Inspect the relevant route, loader, and component before changing anything.
2. **Extend vertical slices**
   - Prefer DB + API + UI + tests together.
3. **Preserve existing route shape**
   - New work should usually build on the current endpoints instead of reintroducing older, unused API shapes.
4. **Do not weaken import auditability**
   - Keep persisted import runs and row-level outcomes.
5. **Be explicit about partial areas**
   - If adding real estate, richer banking, or advanced tax logic, document the chosen scope clearly.
6. **Avoid destructive defaults**
   - No data resets or destructive migrations without explicit user approval.

## Testing & Quality Bar
- Minimum expectations:
  - `bun run typecheck`
  - `bun test`
- Existing coverage already includes:
  - API overview/summary tests
  - provider import tests
  - worker price sync tests
  - some UI/supporting tests in the app
- When adding a feature, extend the closest existing test surface rather than creating isolated unconnected scaffolding

## Known Gaps / Open Questions
- How should real-estate/manual valuation be surfaced in the UI?
- Should broader bank/checking support be added, or should finances remain investment-led plus savings?
- How far should tax support go beyond yearly realized summary?
- When should multi-user readiness become an actual schema migration instead of a design note?
- Should app-local documentation such as `.env.example` and a finances README be added now that the app surface is stable?

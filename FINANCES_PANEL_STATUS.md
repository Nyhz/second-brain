# Finances Panel Status

Last updated: 2026-03-05

This file tracks the finances domain (`apps/finances-panel`, `services/api` finances module, finances worker jobs).

## Current State

### UI and Workflows
- Overview dashboard restyle implemented (shadcn-first, denser professional layout).
- Overview controls and filters:
  - account filter
  - range filter (`1D`, `1W`, `1M`, `YTD`, `1Y`, `MAX`)
- Overview graph behavior:
  - Y-axis now scales to selected-range min/max with extra margin
  - `MAX` now starts from first portfolio transaction (not pre-investment market history)
- Accounts:
  - creation simplified for EUR-first workflow
  - account deletion available
- Assets:
  - simplified v1 creation fields
  - `Provider Symbol` field available on create
  - asset deactivation and metadata edit available
- Transactions:
  - simplified v1 create form
  - buy/sell/dividend support
  - transaction deletion available
  - DEGIRO CSV import modal available

### API and Data
- Finances API routes cover:
  - accounts CRUD subset (list/create/delete)
  - assets CRUD subset + positions
  - asset transactions CRUD subset (list/create/delete)
  - DEGIRO import
  - overview, portfolio summary, markets latest, summary, tax yearly summary
- Price valuation symbol resolution uses:
  - `provider_symbol` > `symbol` > `ticker`
- USD asset valuation conversion:
  - market FX (`EURUSD=X` from `price_history`) first
  - fallback to transaction FX

### Worker and Pricing
- Yahoo sync job implemented:
  - daily gated run with once-per-day success check
  - incremental historical backfill
  - retry + delay to mitigate rate limits
  - FX ingestion into `price_history` (`source=yahoo_fx`)
- Important caveat:
  - asset prices require valid Yahoo symbol mapping; `providerSymbol` should be set explicitly when needed.

## What We Are Working On

- Stabilizing market-pricing quality for all assets:
  - ensuring each asset has valid Yahoo provider symbol
  - validating end-to-end overview and position valuation after imports
- Finishing v1 form simplification consistency:
  - label positioning and reduced fields across all related modals/forms
- Iterating UX polish:
  - clearer feedback for import and pricing failures
  - tighter table/chart readability

## Financial Panel Development Ideas

### Data Quality and Pricing
- Add symbol resolver helper in Assets UI:
  - search Yahoo candidates by ISIN/name
  - one-click apply to `providerSymbol`
- Move Yahoo integration to direct `chart()` API usage (replace deprecated `historical()` mapping).
- Add price freshness indicator per asset (last market update timestamp + source).

### Portfolio and Analytics
- Add explicit benchmark overlay in overview chart (e.g., MSCI World / S&P500 ETF).
- Add contributions timeline (deposits vs performance split).
- Add realized/unrealized P&L breakdown by account and asset.

### Imports and Operations
- Add import history screen (runs, row errors, retry option).
- Add "dry run then apply" two-step import flow with diff preview.
- Add quick reset utilities in UI for sandbox/testing datasets.

## What Is Left (Near-Term)

- Complete remaining v1 cleanup for assets/transactions/account forms and labels.
- Add stronger tests around:
  - pricing + FX valuation paths
  - overview range edge cases
  - import mixed-validity files
- Improve error surfaces in UI for invalid provider symbols and missing market data.
- Tomorrow plan:
  - ingest remaining assets and transactions
  - validate provider symbols during creation/import
  - run pricing sync and verify overview totals/charts.

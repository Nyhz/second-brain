# ADR 0006: Yahoo Finance Pricing Pipeline

## Status
Accepted

## Context
The finances app requires automated market prices with historical depth from first buy date per asset, and EUR portfolio valuation for USD assets.

## Decision
- Use `yahoo-finance2` in the worker service as the market data provider.
- Run a daily sync job (UTC schedule) with advisory locking and idempotent DB upserts.
- Persist prices in `finances.price_history` keyed by `(symbol, source, priced_date_utc)` to avoid duplicates.
- Resolve provider symbol priority as: `provider_symbol` > `symbol` > `ticker`.
- Fetch and store FX via Yahoo (`EURUSD=X`) so USD asset valuations can be converted to EUR at read time.
- Add bounded retries and inter-request delay to reduce rate-limiting risk.
- Implement incremental backfill from each symbol's earliest buy date.

## Consequences
- Keeps architecture aligned with existing worker scheduler and `price_history` consumers.
- Improves EUR valuation accuracy for multi-currency holdings without changing API contracts.
- Requires careful handling for Yahoo outages and symbol mismatches; failures are partial and logged.

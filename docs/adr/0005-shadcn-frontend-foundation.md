# ADR 0005: shadcn-style Frontend Foundation

## Status
Accepted

## Context
The platform frontend had a custom UI layer (`packages/ui`) with bespoke tokens and component styling (`--sb-*`, `.sb-ui-*`).  
We need consistent styling and primitives across `apps/portal` and `apps/finances-panel` with a modern, maintainable component foundation.

## Decision
Adopt a shadcn-style foundation across both apps:

- Use Tailwind CSS + PostCSS in both Next.js apps.
- Use shadcn-compatible design tokens (`--background`, `--foreground`, `--primary`, etc.) instead of legacy `--sb-*`.
- Re-implement shared primitives in `packages/ui` using:
  - `class-variance-authority`
  - `clsx`
  - `tailwind-merge`
  - Radix primitives where needed (Dialog)
- Keep `packages/ui` as shared component surface to avoid app-level duplication.
- Keep Recharts for charts, styled through the new token system.

## Consequences
### Positive
- Unified component and token model across portal and finances.
- Easier incremental migration of page-level UI with functional parity.
- Better maintainability and consistency with shadcn conventions.

### Tradeoffs
- Requires Tailwind config in both apps and broader CSS migration.
- Some existing page-level custom layouts remain and need incremental refactors to fully align.

## Notes
- This decision changes frontend styling architecture only.
- API/domain logic remains unchanged.

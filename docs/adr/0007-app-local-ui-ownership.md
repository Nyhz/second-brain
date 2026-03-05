# ADR 0007: App-Local UI Ownership

## Status
Accepted

## Context
ADR 0005 introduced a shared `packages/ui` surface for `portal` and
`finances-panel`. The apps have since evolved in different directions:

- Finances requires dense domain-specific layout and table patterns.
- Portal favors lightweight status-focused components.
- Shared primitives were no longer imported by app code.

Keeping a shared package created unnecessary maintenance overhead,
extra workspace scripts, and dead code paths.

## Decision
Adopt app-local UI ownership:

- Remove `packages/ui` from the workspace.
- Keep shadcn-style tokens and utility conventions in each app.
- Maintain local UI primitives in:
  - `apps/finances-panel/components/ui/*`
  - `apps/portal/components/ui/*`
- Share only domain contracts and infra via `@second-brain/types`,
  `@second-brain/config`, and `@second-brain/db`.

## Consequences
### Positive
- Lower coupling between apps with independent design iteration.
- Smaller workspace surface and simpler test/typecheck scripts.
- Clear ownership of UI behavior per app.

### Tradeoffs
- Primitive components may diverge between apps.
- Cross-app visual consistency requires explicit coordination.

## Supersedes
- ADR 0005 section: "Keep `packages/ui` as shared component surface".

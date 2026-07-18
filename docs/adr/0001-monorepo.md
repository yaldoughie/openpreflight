# ADR 0001: pnpm monorepo

Status: Accepted

## Context

CLI, API, worker, dashboard, rules, reporters, and integrations share schemas but need clear boundaries.

## Decision

Use pnpm workspaces with apps and focused packages; PHP Agent remains a Composer-managed sibling.

## Consequences

One lockfile and atomic changes improve consistency; workspace builds and releases require dependency ordering.

## Alternatives considered

Multiple repositories and a single giant package were rejected for release drift and poor boundaries.

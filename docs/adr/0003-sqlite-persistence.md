# ADR 0003: SQLite persistence

Status: Accepted

## Context

v1 targets one host and sequential/bounded workers without Redis.

## Decision

Use migrated SQLite with WAL, foreign keys, transactions, leases, heartbeats, and a separate encryption key.

## Consequences

Deployment is simple and recoverable; high-write multi-node scale is intentionally unsupported.

## Alternatives considered

Redis/PostgreSQL and in-memory queues added operations or lost crash recovery.

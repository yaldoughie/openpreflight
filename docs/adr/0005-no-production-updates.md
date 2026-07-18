# ADR 0005: No production updates

Status: Accepted

## Context

The product predicts update safety; production mutation would create catastrophic operator risk.

## Decision

All adapters are read-only and the Agent has no update, install, command, or database-write API. Updates run only in candidates.

## Consequences

Users apply approved updates separately; safety boundaries are simple and testable.

## Alternatives considered

Optional production deployment was rejected for v1.

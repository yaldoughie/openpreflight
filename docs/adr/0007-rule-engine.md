# ADR 0007: Extensible rule engine

Status: Accepted

## Context

Many evidence types need one explainable baseline/candidate comparison.

## Decision

Rules expose version/config/phase metadata and return typed findings; verdict policy is separate and deterministic.

## Consequences

Third parties can extend checks without changing lifecycle; rule compatibility is a public contract.

## Alternatives considered

Hard-coded report conditionals and opaque aggregate scores were rejected.

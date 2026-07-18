# ADR 0006: Declarative journey schema

Status: Accepted

## Context

Tests need portable, reviewable WordPress workflows without arbitrary execution.

## Decision

Publish versioned YAML/JSON Schema with typed steps/locators and distinct secret references; ordinary JavaScript is forbidden.

## Consequences

Journeys are auditable and safe by default; uncommon logic needs a future explicitly trusted extension.

## Alternatives considered

Raw Playwright scripts were powerful but unsafe and hard to validate.

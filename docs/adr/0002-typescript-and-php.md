# ADR 0002: TypeScript and PHP

Status: Accepted

## Context

The control plane needs typed cross-platform tooling; WordPress executes PHP.

## Decision

Use strict TypeScript on Node 24 for control-plane/browser/UI code and PHP 8.1+ with WordPress APIs for the Agent.

## Consequences

Schemas bridge runtimes; CI needs Node, PHP, WordPress, and Composer matrices.

## Alternatives considered

All-PHP lacked browser/UI ergonomics; a Node Agent would not be a native WordPress plugin.

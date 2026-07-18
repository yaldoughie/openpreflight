# ADR 0008: Scoped Agent tokens

Status: Accepted

## Context

The runner needs limited remote read/export access without WordPress passwords or unauthenticated pairing.

## Decision

Use random one-time bearer tokens with HMAC hashes, scopes, expiry, revocation, last-use audit, HTTPS and failure rate limits.

## Consequences

Administrators must protect/copy tokens once; compromise is bounded and revocable.

## Alternatives considered

Application passwords were too broad; shared secrets and public pairing endpoints were rejected.

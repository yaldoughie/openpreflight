# ADR 0004: Docker isolation

Status: Accepted

## Context

Cloned themes/plugins and update packages are untrusted code.

## Decision

Use per-job Compose projects, private networks/volumes, resource/capability limits, restricted proxy egress, and no site Docker socket.

## Consequences

Docker is required and residual kernel risk remains; jobs are reproducible and disposable.

## Alternatives considered

Host execution was unsafe; Kubernetes exceeded v1 scope.

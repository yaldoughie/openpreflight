# Adding a source adapter

Implement `validate`, `inspect`, `materialize`, and `cleanup`. Validation must
produce typed configuration with credentials separated. Inspection is read-only.
Materialization streams bounded content into an explicit empty job destination
and must not mutate its source. Cleanup is idempotent and handles partial work.

Threat-model authentication, SSRF, traversal, links/devices, decompression,
checksums, timeouts, cancellation, retention, and credential leakage. Contract
tests must prove original bytes remain unchanged and all allocated resources are
removed after interruption.

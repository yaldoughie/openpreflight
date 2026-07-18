# Report schema reference

Canonical schema: `packages/reporters/schemas/report.schema.json`. Report `1.0`
includes OpenPreflight version, run/site/update metadata, findings, verdict and
exact reasons, journeys, diagnostics, sanitization, artifacts, skipped tests,
generation time, and disclaimers. Findings use severities `info`, `warning`,
`error`, `critical` and states `new`, `existing`, `resolved`, `changed`.

JSON is the source model for HTML, JUnit, and SARIF. Consumers must reject an
unknown major schema version and tolerate new optional fields within a minor
line. Redacted values are represented as `[REDACTED]`.

# Configuration schema reference

Canonical schema: `packages/configuration/schemas/configuration.schema.json`.
Version `1.0` covers server host/port, storage and retention, Docker network and
resource limits, browser profiles, report formats, privacy redaction, and verdict
policy. The schema uses JSON Schema 2020-12, rejects unknown keys, and aggregates
validation errors. YAML and JSON values are equivalent. See the checked-in
`openpreflight.config.yaml` for documented privacy-conscious defaults.

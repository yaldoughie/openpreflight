# REST API reference

The local API is rooted at `/api/v1`; Agent endpoints are rooted at
`/wp-json/openpreflight/v1`. Local resources include health/diagnostics, sources,
journeys, baselines, runs/cancellation/events, reports/artifacts, and settings.
Run events use SSE with `Last-Event-ID` replay.

Retention is a two-step operation: `GET /retention/preview` returns bounded,
expired artifact targets and `DELETE /retention` requires `{ "confirm": true }`.
Resolved targets are constrained to the configured storage root and deletions
are recorded in `retention_records`.

Errors use `{error:{code,message,requestId}}` and omit production stack traces.
Loopback is default; non-loopback local API binding requires a bearer token.

Agent routes: `GET status|manifest|updates|diagnostics`, `POST exports`,
`GET|DELETE exports/{id}`, `GET exports/{id}/download`, `POST tokens`, and
`DELETE tokens/{id}`. Agent tokens require their documented scope. Token
management requires an authenticated administrator/REST nonce, not a bearer
pairing token. There is deliberately no production update or command route.

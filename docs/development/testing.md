# Testing

Run fast gates with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
`composer check`. Integration uses `pnpm integration`; browser/dashboard tests
use `pnpm e2e`; Docker/source/update/isolation acceptance uses `pnpm demo` and
expects regression exit 1. `pnpm test:coverage` enforces 80% line/function/
statement and 75% branch coverage only for stable critical core packages.

Tests must include negative security cases, cleanup, timeout, cancellation,
schema/migration compatibility, baseline/new/resolved/changed findings, and
redaction. Record actual results in `VERIFICATION.md`; skipped means unverified.

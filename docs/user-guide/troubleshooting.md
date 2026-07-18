# Troubleshooting

Start with `pnpm openpreflight doctor --json`. If MySQL/WordPress does not become
healthy, inspect `.openpreflight/runs/RUN_ID/environment-create.log` and
`docker compose --project-name openpreflight-RUN_ID logs`. Check memory, disk,
port conflicts, Docker daemon status, and filesystem sharing.

Authentication errors: confirm HTTPS outside loopback, token expiry/revocation,
and required scope; create a new token rather than logging it. Archive errors:
verify format, checksum, limits, and absence of links/traversal. Visual warnings:
compare browser/viewport metadata before approving. Missing WooCommerce methods:
remember clone safety disables production gateways; configure only the local
dummy test gateway for optional isolated order tests.

An `ERROR` is not a regression. Preserve sanitized logs and the exact stage, but
never publish exports or credentials.

# Configuration

Precedence is CLI flags, environment variables, source configuration, project
YAML, then built-in defaults. `pnpm openpreflight config validate` returns every
schema error together. Unknown keys fail validation to catch typos.

The example config defines loopback server binding, 14-day retention, restricted
egress, 2 GiB/2 CPU/30-minute run limits, deterministic desktop/mobile Chromium,
all report formats, email/query redaction, immediate raw-export deletion, and
fail-on error/critical policy.

Never commit `.env`, Agent tokens, encryption keys, WordPress salts, payment
credentials, or production exports. Source credentials are encrypted in SQLite;
the encryption key remains a separate permission-restricted file or environment
secret.

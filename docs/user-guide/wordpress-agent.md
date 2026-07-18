# WordPress Agent

Install the packaged `openpreflight-agent.zip`, activate it on single-site
WordPress, and open Tools → OpenPreflight Agent. A privacy acknowledgement is
required. Create the narrowest token scopes, set an expiration, and copy the
token once into `openpreflight source add --type agent`. Only a secure hash is
stored by WordPress.

Non-loopback connections require HTTPS. Tokens are revocable, rate limited, and
record last-use time/address. The Agent exposes status, manifest, updates,
diagnostics, and temporary export operations only. There is no plugin install,
command execution, production update, or arbitrary database-write endpoint.

Exports default to referenced uploads, exclude common caches/backups/logs/env
files, expire after 24 hours, and are deleted remotely after runner import.
Arbitrary plugins may retain secrets in unknown database fields; the runner
sanitizes known values but cannot guarantee complete removal.

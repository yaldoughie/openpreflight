# Sources

OpenPreflight supports local WordPress paths, versioned export archives, and the
OpenPreflight Agent. Local validation checks `wp-config.php`, core layout,
readability, version metadata, and multisite. The source is copied with no write.

Archives contain `manifest.json`, `checksums.json`, `database.sql(.gz)`, and
`wp-content/`. Extraction is streamed and bounded by archive, expanded, file,
entry-count, and individual-file limits. Absolute paths, traversal, symlinks,
devices, duplicates, and checksum failures are rejected.

Agent sources authenticate, inspect, request an export, poll, download, verify
the final SHA-256, safely extract, sanitize, delete the local raw archive by
default, and request remote deletion. Credentials are encrypted separately from
ordinary source configuration.

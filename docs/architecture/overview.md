# Architecture overview

OpenPreflight separates control plane from untrusted execution. CLI and React
dashboard call Fastify application services. SQLite stores configuration, queue
leases, lifecycle transitions, findings, and artifact metadata. Credentials are
AES-256-GCM encrypted with a key outside the database. Sequential workers claim
bounded jobs and invoke Docker with argument arrays.

Source adapters materialize a read-only input into a job directory. Sanitization
produces the common snapshot from which baseline and candidate run. Playwright
creates a fresh context per journey/profile. Normalized evidence feeds pure rule
comparison, verdict, and reporters. Site containers never see Agent/source
credentials or the Docker socket. See [data flow](data-flow.md) and
[container isolation](container-isolation.md).

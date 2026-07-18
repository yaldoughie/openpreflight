# Database

SQLite runs with foreign keys, WAL, a busy timeout, UTC ISO timestamps, and
transactional state changes. Migrations create all source/snapshot/component,
journey/baseline/run/stage, evidence/finding/artifact, job/event, settings, and
retention entities. Credentials live in a separate table as AES-256-GCM
ciphertexts authenticated to their source ID.

The 32-byte key is generated outside SQLite at
`.openpreflight/credentials.key` with restrictive permissions, or supplied via
`OPENPREFLIGHT_ENCRYPTION_KEY`. Nonces are random per encryption. Losing the key
makes credentials unrecoverable; rotate by decrypting/re-encrypting while the
old key is available. Database backups exclude raw artifacts and the key.

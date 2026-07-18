# Data flow

```mermaid
sequenceDiagram
  participant User
  participant API
  participant DB as SQLite queue
  participant Worker
  participant Source
  participant Clone as Docker clone
  participant Browser
  User->>API: create run
  API->>DB: persist QUEUED job
  Worker->>DB: lease job
  Worker->>Source: inspect/export/copy
  Worker->>Clone: import then sanitize
  Worker->>Browser: baseline journeys
  Worker->>Clone: restore snapshot + update
  Worker->>Browser: candidate journeys
  Worker->>DB: findings, stages, artifacts
  API-->>User: SSE progress and offline reports
```

Raw Agent archives are deleted immediately after verified import unless explicit
retention is enabled. Logs/evidence are redacted before storage. Reports never
leave the host automatically.

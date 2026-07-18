# Quick start

```bash
pnpm openpreflight source add --type local --path /srv/example --name "Example"
pnpm openpreflight source list
pnpm openpreflight journey validate examples/journeys/homepage.yaml
pnpm openpreflight baseline create --source SOURCE_ID
pnpm openpreflight run --source SOURCE_ID --update file:/tmp/plugin.zip
pnpm openpreflight run status RUN_ID
pnpm openpreflight report open latest
```

Start the API/dashboard and worker with `docker compose up -d`, or run their pnpm
development scripts. The source is never modified: a sanitized copy becomes the
shared starting snapshot for baseline and candidate. A `FAILED` run means an
application regression; `ERROR` means infrastructure or invalid execution.
Review sanitization actions and skipped checks before trusting a verdict.

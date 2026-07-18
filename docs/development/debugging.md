# Debugging

Use a run ID and stage first. Query `run_stages`/`job_events`, then inspect the
run directory, environment-create log, sanitized Docker logs, journey result,
trace/video, network/console records, and report JSON. Reproduce commands with
argument arrays; never paste a token or source credential into logs.

For an abandoned Docker project use the exact project name shown in the error:
`docker compose --project-name NAME -f docker/run.compose.yml down --volumes
--remove-orphans`. Distinguish baseline site defects, candidate regressions,
invalid journeys, update failure, and infrastructure failure before changing a
rule policy.

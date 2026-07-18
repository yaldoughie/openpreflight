# GitHub Actions

```yaml
name: OpenPreflight
on: [pull_request, workflow_dispatch]
permissions: { contents: read }
jobs:
  preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@REPLACE_WITH_IMMUTABLE_COMMIT_SHA
      - uses: ./integrations/github-action
        with:
          source: ./example-site
          config: ./openpreflight.config.yaml
```

Use repository fixtures for pull requests and upload `.openpreflight/runs` with
an immutable pinned upload-artifact action. Never expose production Agent tokens
or exports to fork code. Privileged or secret-backed tests belong on protected
manual/default-branch workflows after reviewing the exact commit. Permissions
remain `contents: read`; attestations/releases get separate job-scoped rights.
Regression exit code 1 fails the job; infrastructure errors use code 3.

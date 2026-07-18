# OpenPreflight Verification Record

Commands below were actually run on 2026-07-18. An absent or blocked result is
not a pass.

## Host

| Check                       | Observed result                                       |
| --------------------------- | ----------------------------------------------------- |
| OS                          | Windows x64                                           |
| Node.js                     | 22.19.0 (repository target: 24 LTS)                   |
| pnpm                        | 11.14.0 through Corepack                              |
| PHP / Composer              | PHP 8.1.17 / Composer 2.7.7; host Imagick ABI warning |
| Docker / Compose            | Client 28.3.2 / 2.39.1; Linux daemon unavailable      |
| Disk / memory at doctor run | 128.6 GiB disk / 1.9 GiB free memory                  |

## Passed checks

| Area                  | Command                                                                       | Result                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript            | `tsc -p tsconfig.json --noEmit`                                               | Pass                                                                                                                                  |
| Lint                  | `eslint . --quiet`                                                            | Pass                                                                                                                                  |
| Format                | `prettier --check .`                                                          | Pass                                                                                                                                  |
| Unit/API/security     | `vitest run`                                                                  | 9 files, 33 tests passed                                                                                                              |
| Coverage              | `vitest run --coverage`                                                       | 89.89% statements, 81.53% branches, 94.23% functions, 95.26% lines                                                                    |
| PHP static analysis   | `phpstan analyse --no-progress`                                               | Pass, level 8, no errors                                                                                                              |
| WordPress standards   | `phpcs`                                                                       | Pass                                                                                                                                  |
| PHP syntax            | `php -l` over Agent, Docker PHP, and fixtures                                 | All checked files pass                                                                                                                |
| JSON Schemas          | `tsx scripts/validate-schemas.ts`                                             | 3 schemas validated                                                                                                                   |
| Documentation         | `tsx scripts/check-docs.ts`                                                   | 49 documentation files checked                                                                                                        |
| Dependency audit      | `pnpm audit --prod`; `composer audit --locked`                                | No known vulnerability advisories found                                                                                               |
| Local secret patterns | `rg` for private-key headers, AWS keys, and GitHub tokens                     | No matches outside excluded dependencies/builds; gitleaks/trufflehog are unavailable locally                                          |
| Compose parsing       | `docker compose ... config --quiet` for root, run, demo                       | All three pass                                                                                                                        |
| Docker test harness   | `vitest run --config vitest.integration.config.ts`                            | 1 prerequisite test passed; 1 live Docker test explicitly skipped                                                                     |
| Build                 | `tsx scripts/build.ts`                                                        | CLI, server, worker, Action, dashboard built                                                                                          |
| Dashboard browser QA  | `tsx scripts/capture-dashboard.ts`                                            | Routes/editor/retention modal/skip link pass; zero Axe violations, console errors, or page errors in tested flows; system Chrome used |
| CLI bundle            | `node apps/cli/dist/index.js --json version`                                  | Version 1.0.0                                                                                                                         |
| Config/journey CLI    | bundled `config validate`; `journey validate examples/journeys/homepage.yaml` | Both pass                                                                                                                             |
| Doctor behavior       | bundled `doctor --json`                                                       | Exit 3; accurately reports stopped daemon, Node target, memory, and missing pinned browser                                            |
| Release package       | `tsx scripts/package.ts`                                                      | 10 payload artifacts plus `SHA256SUMS`; every listed SHA-256 rechecked                                                                |
| Reproducibility       | package twice, compare `SHA256SUMS`                                           | No differences                                                                                                                        |
| Plugin layout         | list `openpreflight-agent.zip`                                                | Correct root and `vendor/autoload.php`; development tests excluded                                                                    |

Coverage is measured only over the configured stable core packages, not inflated
with generated code or fixtures.

## Generated release payloads

- `openpreflight-agent.zip`
- `openpreflight-github-action.zip`
- `openpreflight-cli.zip`
- `openpreflight-server.zip`
- `openpreflight-worker.zip`
- `openpreflight-dashboard.zip`
- `openpreflight-runner-context.zip`
- `openpreflight-1.0.0-source.zip`
- `openpreflight-sbom.cdx.json`
- `release-manifest.json`
- `SHA256SUMS`

## Blocked or incomplete verification

| Check                                      | Observed result / exact limitation                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `openpreflight doctor` clean pass          | Exit 3 because Docker daemon/pinned Chromium/Node 24/free-memory prerequisites do not pass on this host                             |
| Full demo                                  | Exit 3 before mutation: Docker Desktop Linux engine pipe not found                                                                  |
| Live Docker integration                    | Explicitly skipped after daemon probe; no container was started                                                                     |
| PHPUnit                                    | Exit 1: `WordPress test library not found. Set WP_TESTS_DIR.`                                                                       |
| Pinned Playwright Chromium                 | Installation attempt returned HTTP 403 from the browser CDN in this location                                                        |
| Full Playwright matrix                     | Not run with pinned Chromium; system Chrome dashboard verification passed, but it is not a substitute for the release browser image |
| Docker image build/scan                    | Cannot run without daemon                                                                                                           |
| WordPress/PHP/WooCommerce version matrices | Require CI or a running Docker daemon                                                                                               |
| Full demo regression report                | Not generated locally because environment creation could not begin                                                                  |
| Secret scan/provenance/attestation         | Workflow is configured; hosted GitHub execution not available locally                                                               |
| Clean-room dependency removal/reinstall    | Not repeated under Node 24; current dependency tree and lockfiles build successfully under host Node 22                             |

## Owner values required before publication

Replace every `REPLACE_BEFORE_RELEASE*` value: GitHub owner/repository URLs,
security contact/private advisory link, WordPress.org contributor slug, release
container namespace, and example immutable Action SHA. Then complete every open
item in `docs/release-checklist.md`.

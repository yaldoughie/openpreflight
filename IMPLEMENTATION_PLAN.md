# OpenPreflight v1.0 Implementation Plan

This is the implementation ledger. Completed boxes mean the repository code and
non-blocked acceptance checks are present. Environment-gated acceptance is
called out explicitly and is never recorded as a pass in `VERIFICATION.md`.

## Milestone 1 - Foundation

- [x] pnpm monorepo, shared TypeScript configuration, linting, formatting, Vitest, and lockfile.
- [x] Versioned configuration, journey, export, and report schemas.
- [x] SQLite migrations, core types, state machine, verdict policy, CLI routing, Compose, and initial docs.
- Acceptance: passed build, lint, typecheck, unit tests, schemas, and locked dependency install; Node 24 clean-room rerun remains part of Milestone 12.

## Milestone 2 - Environment Manager

- [x] Per-run WordPress, MariaDB, WP-CLI, mail capture, egress proxy, limits, snapshots, restore, and cleanup.
- [x] Fresh disposable database credentials; only sanitized source content enters the site volume.
- Acceptance: Compose models validate; live create/import/destroy is blocked because the Docker daemon is unavailable.

## Milestone 3 - Source Adapters

- [x] Local-path, streaming safe-archive, and HTTPS Agent adapters behind a common interface.
- [x] WP-CLI database export, credential exclusion, checksums, file/size limits, path traversal and symlink rejection.
- Acceptance: archive/security contract tests pass; live WordPress import is Docker-gated.

## Milestone 4 - Journey Engine

- [x] YAML/JSON parsing, JSON Schema, variables/secrets, all v1 step and locator types, Playwright artifacts.
- [x] Bundled generic WordPress and WooCommerce journey library with recursive selection.
- Acceptance: parser/runner tests pass and dashboard Playwright flows pass in system Chrome; WordPress browser execution is Docker-gated.

## Milestone 5 - Baseline and Candidate Runs

- [x] Persisted lifecycle, isolated baseline/candidate snapshots, update selectors/packages, cancellation, timeout, and recovery.
- Acceptance: state/cancellation/recovery tests pass; live candidate-only fixture update is Docker-gated.

## Milestone 6 - Rules and Verdict

- [x] Runtime, WordPress, WooCommerce, network, visual, accessibility, performance, and extensible rule APIs.
- [x] Explainable finding comparison and deterministic verdict policies.
- Acceptance: rule/verdict fixtures pass; end-to-end broken-update proof is Docker-gated.

## Milestone 7 - Reports

- [x] Offline HTML, JSON, JUnit XML, and SARIF with schemas and centralized redaction.
- Acceptance: reporter, schema, escaping, and redaction tests pass.

## Milestone 8 - WordPress Agent

- [x] Namespaced plugin, scoped/revocable expiring tokens, REST/admin UX, diagnostics, updates, export jobs, secure download, cleanup, i18n, and uninstall controls.
- Acceptance: PHPStan level 8, PHPCS, syntax, packaging, and unit test source pass static gates; WordPress PHPUnit runtime is unavailable locally.

## Milestone 9 - Dashboard

- [x] Setup, diagnostics, sources, journeys/editor, baselines, runs/live progress, reports, settings/retention, privacy, and about screens.
- [x] Responsive, keyboard/focus, reduced-motion, dark-mode, and RTL styling.
- Acceptance: real local API/UI, journey editing, modal focus, Axe, and console checks pass in system Chrome; a Docker-backed run remains gated.

## Milestone 10 - CI and Releases

- [x] Requested workflows, bundled GitHub Action, package builds, plugin ZIP, Docker build flow, SBOM, checksums, and attestations.
- [x] Deterministic local package output with `SOURCE_DATE_EPOCH` support.
- Acceptance: local artifacts reproduce byte-for-byte; image build/scan and hosted attestations require Docker/GitHub.

## Milestone 11 - Documentation and Community

- [x] README, guides, references, ADRs, threat model, governance/community files, examples, release process, and real dashboard screenshot.
- Acceptance: all 49 documentation files pass local-link checks.

## Milestone 12 - Release Candidate

- [ ] Run the full clean-room Node 24, Docker, WordPress/PHP matrix, full demo, container scans, and PHPUnit suite.
- [ ] Replace owner-specific publication placeholders and validate protected release infrastructure.
- Acceptance: blocked only by the exact items recorded in `VERIFICATION.md`; publication must not proceed until they pass.

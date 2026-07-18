# OpenPreflight Status

Last updated: 2026-07-18

## Current milestone

Milestone 12 - Release Candidate verification. The complete v1 implementation is
present as a release candidate, but it is not declared publicly releasable while
the Docker/WordPress clean-room matrix and owner configuration remain blocked.

## Verified locally

- TypeScript typecheck, ESLint, Prettier, 33 Vitest tests, and enforceable coverage thresholds pass.
- PHPStan level 8, PHPCS, and syntax checks pass for the Agent and fixture/runtime PHP.
- Configuration/journey/report schemas and 49 documentation files validate.
- CLI version/config/journey commands run from the production bundle; doctor returns the correct infrastructure exit code and remedies.
- The production dashboard bundle passes live system-Chrome routing, editor, focus, Axe, console, and page-error checks.
- Compose models validate without starting containers.
- Ten payload artifacts plus `SHA256SUMS` are generated twice with identical hashes.

## Environment blockers

- Docker 28.3.2 and Compose 2.39.1 clients exist, but Docker Desktop's Linux daemon is stopped.
- Host Node is 22.19.0; the supported release target is Node 24 LTS.
- Playwright's pinned Chromium download returned HTTP 403 from the CDN in this location; installed system Chrome was used only for dashboard verification.
- The WordPress PHPUnit library is not installed (`WP_TESTS_DIR` is unavailable).
- GNU Make is absent; equivalent pnpm/Composer commands are available.
- PHP 8.1.17 emits a host Imagick compile/runtime version warning unrelated to this repository.

## Publication blockers

- Replace repository owner, URLs, contributor slug, security contact, and example immutable Action SHA values.
- Run and record the full demo, WordPress Agent PHPUnit suite, Docker network/resource tests, container scan, and Node 24 clean-room procedure.
- Verify hosted GitHub release permissions, protected/signed tags, package credentials, provenance, and attestations.

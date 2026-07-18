# Contributing to OpenPreflight

Contributions include bug reports, documentation, journeys, rules, adapters,
security improvements, translations, tests, and code.

1. Read the architecture and threat model before changing a trust boundary.
2. Create a focused branch from `main`; one concern per pull request.
3. Use Conventional Commits and add a Changeset for user-visible changes.
4. Sign every commit with the Developer Certificate of Origin: `git commit -s`.
5. Run `pnpm lint && pnpm typecheck && pnpm test`, plus affected integration,
   Playwright, Docker, and Composer checks.
6. Update schemas, docs, fixtures, and migration tests when interfaces change.

Pull requests require a clear problem statement, security/privacy impact,
reproduction, test evidence, documentation updates, and no unrelated changes.
Maintainers require one approving review for ordinary changes and two for
authentication, archive extraction, process execution, isolation, encryption,
release, or production-data handling. The initial sole maintainer may merge a
security fix after documenting an independent review when available.

Never paste credentials, Agent tokens, production exports, customer data, or
unredacted logs into issues. Vulnerabilities follow [SECURITY.md](SECURITY.md),
not the public issue tracker. By contributing, you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md) and certify the DCO 1.1; no custom CLA is
required.

Setup and standards are documented in [docs/development/setup.md](docs/development/setup.md)
and [docs/development/testing.md](docs/development/testing.md). Maintainers may
request smaller commits, added negative tests, or an ADR before review.

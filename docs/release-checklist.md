# v1.0 release checklist

- [ ] Replace GitHub owner/repository, security contact, contributor slug, URLs, and immutable action SHAs.
- [ ] Confirm signed/protected tag and least-privilege environments.
- [ ] Clean clone; Node 24/pnpm 11 and PHP 8.1–8.5 matrices pass.
- [ ] Lint, format, typecheck, unit, coverage, PHPStan, PHPCS, PHPUnit, build pass.
- [ ] Migration/schema/link/secret/license/dependency audits pass.
- [ ] Docker import/update/network/mail/payment/resource/cleanup tests pass.
- [ ] Chromium desktop/mobile, dashboard axe/keyboard/RTL/dark/reduced-motion pass.
- [ ] Full demo returns expected code 1 and real reports are inspected.
- [ ] Plugin ZIP layout/activation/export/uninstall and WordPress plugin checks pass.
- [ ] Images scan; SBOM, checksums, provenance/attestations verify.
- [ ] README screenshot is regenerated from the release dashboard/report.
- [ ] `VERIFICATION.md`, changelog, limitations, and owner placeholders are final.
- [ ] `git status` contains only intended files; artifacts reproduce from tag.

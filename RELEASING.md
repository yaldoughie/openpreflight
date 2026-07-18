# Releasing OpenPreflight

1. Verify repository URLs, package namespace, and the private security channel.
2. Complete `docs/release-checklist.md` and `VERIFICATION.md` from a clean clone.
3. Run `pnpm install --frozen-lockfile`, `composer install`, all lint/type/test/integration/e2e/demo commands, audits, schema/link/secret checks, and container scans.
4. Apply Changesets, update `CHANGELOG.md`, and verify SemVer compatibility.
5. Run `pnpm build && pnpm package`; inspect plugin ZIP layout, SBOM, and checksums.
6. Create a signed/protected `vX.Y.Z` tag. The release workflow repeats all gates and attaches attestable artifacts.
7. Publish packages only when repository-scoped credentials are configured; the source build never requires them.
8. Verify downloaded checksums and perform the documented rollback/advisory procedure if any gate fails.

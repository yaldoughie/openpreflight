# Supply-chain security

Direct pnpm dependencies and package manager are exact-pinned; pnpm and Composer
lockfiles are release inputs. CI performs dependency review, `pnpm audit`,
`composer audit`, CodeQL, secret/schema/link checks, container scanning, and
license review. Workflows use minimal permissions and immutable external action
SHAs. Dependabot proposes bounded updates for npm, Composer, Docker, and Actions.

Release builds create checksums, CycloneDX SBOM, source/plugin/action artifacts,
container scan results, and GitHub provenance/attestations where supported.
Publishing credentials are optional and absent from pull requests. Fork code
never receives production secrets. Maintainers review lockfile, lifecycle
scripts, license, maintainer changes, and security advisories before merging.

The project is prepared to apply for an OpenSSF Best Practices badge but makes
no claim that it has earned one.

# Threat model

## Assets and actors

Assets: production exports/database/user data, plugin/theme source, Agent tokens,
local encryption key, reports, Docker host, and CI secrets. Actors: malicious
plugins/update packages/contributors/dependencies/network clients, a local
unprivileged user, and accidental operators.

## Threat analysis

| Threat / entry point                       | Preconditions and impact                             | Mitigations / detection / tests                                                                                            | Residual risk                                             |
| ------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| RCE or command injection via update/source | Attacker controls filenames/package; host compromise | argument-array process API, no journey JS, path/schema validation, isolated non-root containers, command-injection tests   | Docker/kernel defects                                     |
| Container escape / Docker socket           | Malicious cloned PHP executes                        | no socket/host-root in site containers, capabilities/pids/resources/no-new-privileges, scans                               | control worker owns Docker; kernel escape remains         |
| SSRF / metadata/private access             | Plugin makes HTTP request                            | internal network, proxy allowlist, private/metadata deny, WP HTTP block, request logs/tests                                | approved hosts can be compromised                         |
| Archive traversal/bomb/device/symlink      | Malicious export                                     | streamed canonical paths, destination containment, reject special/link entries, byte/file limits/checksums/tests           | parser/library vulnerabilities                            |
| SQL injection                              | Agent/operator input reaches DB                      | prepared WordPress/SQLite statements, schema validation, fixed table identifiers/tests                                     | trusted custom sanitization SQL is intentionally powerful |
| XSS/report injection                       | Site-controlled text appears in UI/report            | React escaping, HTML/XML escaping, CSP-ready offline assets, redaction/tests                                               | users can open raw site artifacts separately              |
| CSRF/auth bypass/token theft               | Network/admin attacker                               | WP capabilities/nonces, scoped expiring revocable HMAC tokens, one-time display, HTTPS, rate limit/last-use, tests         | compromised administrator/browser can issue tokens        |
| Secret/personal-data leakage               | Export/log/report shared                             | file exclusions, clone sanitization, centralized redaction, encrypted credentials, local retention, privacy warnings/tests | unknown plugin DB fields cannot be guaranteed clean       |
| Production update/mutation                 | Operator points at production                        | adapters copy read-only; no Agent update/command/write endpoints; candidate-only update tests                              | host-level operator can bypass application                |
| Real email/payment/webhook                 | Clone retains integrations                           | mail preemption/sink, gateway/webhook disabling, restricted egress, detection rules/tests                                  | unknown protocol over approved host                       |
| Dependency confusion/malicious Action      | Build resolves hostile package/workflow              | exact scopes/names/locks, audits, immutable SHAs, minimal permissions, fork-safe CI, SBOM/provenance                       | upstream maintainer compromise                            |
| DoS/disk/memory/process exhaustion         | Huge archive/site/browser loop                       | compressed/expanded/file/log/artifact limits, timeouts, pids/CPU/RAM/concurrency, cleanup/recovery tests                   | host disk may still fill before quota response            |

Highest-risk tests cover token auth/revocation/expiry/scopes, archive paths and
limits, process argument boundaries, egress/mail/payment blocking, cleanup, and
absence of production update routes. Security events are structured and
redacted. Review this model for every trust-boundary ADR.

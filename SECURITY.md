# Security Policy

## Supported versions

| Version              | Security fixes                                 |
| -------------------- | ---------------------------------------------- |
| 1.x                  | Supported after public release                 |
| Pre-release branches | Best effort; never use with irreplaceable data |

Do not open a public issue for a suspected vulnerability. Before publication,
replace `REPLACE_BEFORE_RELEASE_SECURITY_CONTACT` with a monitored private
address or private GitHub Security Advisories link. Public release is blocked
until that channel exists.

Include the affected version/commit, threat scenario, reproduction, impact,
sanitized evidence, and suggested mitigation. Never send production exports,
credentials, tokens, payment data, or personal data unless explicitly requested
through an agreed encrypted channel.

We aim to acknowledge reports within three business days, provide an initial
assessment within seven, coordinate fixes and disclosure with the reporter, and
credit reporters who request it. Timelines can change for complex dependency or
container issues. Scope includes authentication, exports, extraction, process
execution, Docker isolation, reporting/redaction, dashboard/API security, CI,
and the Agent. Ordinary WordPress-site vulnerabilities are out of scope unless
OpenPreflight introduces or amplifies them.

Good-faith research that avoids privacy violations, persistence, destructive
actions, denial of service, social engineering, and access beyond the minimum
needed will not be pursued by project maintainers. This is not legal advice and
cannot bind third parties.

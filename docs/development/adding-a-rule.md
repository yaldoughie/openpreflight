# Adding a rule

Implement the typed Rule contract, a JSON Schema for configuration, stable
reverse-domain ID and SemVer rule version, supported phases, deterministic
evidence, remediation, and conservative default severity. Normalize and redact
site-controlled data before producing findings. Never execute code or access
credentials from a rule.

Test no finding, existing, new, changed, resolved, malformed config, evidence
redaction, and policy override. Add user/reference documentation and a Changeset.
Use `examples/third-party-rule` as the minimal external package pattern.

# Reports

Each run emits offline HTML, schema-validated JSON, JUnit XML, and SARIF. HTML
uses local assets, semantic headings/tables, keyboard focus, reduced motion, and
no third-party request. Findings are grouped by severity/category and show
baseline state, candidate state, evidence, remediation, sanitization, skipped
checks, policy reasons, and tool/schema versions.

New/changed critical or error findings fail by default. Existing unchanged
findings remain visible without newly failing; resolved findings are positive.
JUnit maps findings to test cases and SARIF represents suitable runtime,
network, accessibility, and configuration findings.

Redaction occurs before persistence and rendering. Nevertheless, inspect a
report before sharing because plugin-generated text can contain unknown data.

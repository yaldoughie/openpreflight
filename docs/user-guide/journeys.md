# Journeys

Journeys are YAML or JSON documents validated against schema `1.0`. Prefer role,
label, text, and test-ID locators; CSS/XPath are available for legacy screens.
All v1 step types are listed in [the reference](../reference/journey-schema.md).

`${variable}` values come from the journey and CLI overrides. `secrets` map a
friendly name to an environment-variable name; secret values are resolved only
at execution and redacted from output. Ordinary journeys cannot execute
JavaScript. Custom trusted code is intentionally absent from v1 defaults.

Use fixed locale/timezone/viewports, masks for genuinely dynamic regions, and
specific assertions. Avoid `networkidle` on pages with permanent streams. A
failed locator is an invalid/functional finding, not an infrastructure result.

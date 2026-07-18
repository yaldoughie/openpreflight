# Baselines

A baseline records browser, viewport, WordPress, PHP, diagnostic, screenshot,
network, accessibility, and performance metadata from a sanitized source
snapshot. The candidate restores that same database snapshot before applying
updates, preventing journey mutations from contaminating comparison.

Browser or viewport-incompatible images are not silently compared. Baseline
replacement requires explicit confirmation, produces a new immutable record,
and should be reviewed like a code change. Delete obsolete baselines with
`baseline delete ID --yes`; retained reports remain subject to their own policy.

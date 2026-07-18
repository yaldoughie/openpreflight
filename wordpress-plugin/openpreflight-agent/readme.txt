=== OpenPreflight Agent ===
Tags: updates, testing, staging, woocommerce, regression
Requires at least: 6.8
Tested up to: 7.0
Requires PHP: 8.1
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Securely exports a WordPress site to a paired self-hosted OpenPreflight runner for isolated update testing.

== Description ==

OpenPreflight Agent exposes a scoped, authenticated export API. It cannot install plugins, run arbitrary commands, modify the production database, or apply production updates.

Exports can contain personal data and unknown plugin secrets. Pair only with a trusted runner, require HTTPS outside loopback, and follow applicable privacy and contractual obligations. The default upload mode includes only files referenced by WordPress attachments.

== Installation ==

1. Upload the `openpreflight-agent` directory or release ZIP.
2. Activate the plugin on a single-site WordPress installation.
3. Open Tools > OpenPreflight Agent.
4. Review privacy settings and create a scoped token.
5. Copy the token immediately to the local runner; it is displayed once.

== Frequently Asked Questions ==

= Can the Agent update production? =

No. Version 1.0 has no production update, plugin installation, command execution, or database write API.

= Does it support multisite? =

No. Multisite is detected and reported as unsupported in version 1.0.

= Are all secrets removed? =

No. File exclusions remove common secret, cache, backup, and log files, but arbitrary plugins may keep secrets in unknown database fields. Treat exports as sensitive.

= What happens on deactivation or uninstall? =

Deactivation preserves data. Uninstall removes data only when the administrator explicitly enables the removal setting.

== Privacy ==

The plugin sends data only in response to authenticated requests from a configured runner. It has no telemetry or analytics. Temporary exports expire after 24 hours and can be deleted sooner through the API.

== Changelog ==

= 1.0.0 =
* Initial public release with scoped tokens, diagnostics, inventory, resumable exports, checksums, exclusions, and cleanup.

# WordPress Agent development

The Agent targets PHP 8.1+ and WordPress single-site 6.8/7.0 stable lines. Use
WordPress APIs, namespaced classes, capability/nonce checks, contextual escaping,
sanitization, prepared SQL, translation functions, and assets only on the Agent
screen. Run PHPCS/WPCS, PHPStan level 8, PHPUnit REST/capability/token/export/
uninstall tests, multisite activation rejection, POT generation, and plugin ZIP
checks.

Never add production update, plugin-install, filesystem-write, command, or
arbitrary database endpoints. Token values are one-time; only HMAC hashes remain.
Deactivation keeps data and uninstall deletes only after explicit opt-in.

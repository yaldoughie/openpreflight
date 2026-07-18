<?php
/** Plugin Name: OpenPreflight Accessibility Regression Fixture
 * Version: 1.0.0
 * License: GPL-2.0-or-later
 */
add_action('wp_body_open', static function (): void { echo '<button></button><input type="text"><div id="duplicate"></div><div id="duplicate"></div>'; });

<?php
/** Plugin Name: OpenPreflight JavaScript Error Fixture
 * Version: 1.0.0
 * License: GPL-2.0-or-later
 */
add_action('wp_enqueue_scripts', static function (): void { wp_add_inline_script('jquery-core', 'console.error("Intentional fixture console error")'); });

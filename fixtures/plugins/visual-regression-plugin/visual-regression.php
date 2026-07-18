<?php
/** Plugin Name: OpenPreflight Visual Regression Fixture
 * Version: 1.0.0
 * License: GPL-2.0-or-later
 */
add_action('wp_head', static function (): void { echo '<style>body{transform:translateX(24px);max-width:82%}</style>'; });

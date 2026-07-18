<?php
/** Plugin Name: OpenPreflight PHP Fatal Fixture
 * Version: 1.0.0
 * License: GPL-2.0-or-later
 */
add_action('template_redirect', static function (): void { if (isset($_GET['openpreflight-fatal'])) throw new RuntimeException('Intentional PHP fatal fixture'); });

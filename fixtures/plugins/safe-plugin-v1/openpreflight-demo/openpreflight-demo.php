<?php
/**
 * Plugin Name: OpenPreflight Demo
 * Version: 1.0.0
 * License: GPL-2.0-or-later
 */
declare(strict_types=1);
if (!defined('ABSPATH')) exit;
add_action('wp_head', static function (): void { echo '<style id="openpreflight-demo">.opf-demo-card{padding:24px;border:2px solid #1769aa;border-radius:12px;background:#eef7ff}</style>'; });
add_action('wp_body_open', static function (): void { echo '<section class="opf-demo-card" aria-labelledby="opf-demo-title"><h2 id="opf-demo-title">OpenPreflight demo is healthy</h2><p>The baseline fixture has no intentional regressions.</p><button type="button" aria-label="Open demo details">Details</button></section>'; });

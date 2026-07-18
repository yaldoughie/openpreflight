<?php
/**
 * Plugin Name: OpenPreflight Demo
 * Version: 2.0.0
 * License: GPL-2.0-or-later
 */
declare(strict_types=1);
if (!defined('ABSPATH')) exit;
add_action('template_redirect', static function (): void { if (isset($_GET['openpreflight-functional'])) { status_header(500); nocache_headers(); echo 'Intentional fixture regression'; exit; } if (isset($_GET['openpreflight-fatal'])) { throw new RuntimeException('Intentional OpenPreflight PHP fatal fixture'); } });
add_action('wp_head', static function (): void { echo '<style id="openpreflight-demo">.opf-demo-card{padding:70px;border:12px solid #d92d20;background:#fff0ef;transform:translateX(35px)}</style>'; });
add_action('wp_body_open', static function (): void { echo '<section class="opf-demo-card"><h4>OpenPreflight demo regressed</h4><button type="button"></button><div id="duplicate-demo"></div><div id="duplicate-demo"></div></section>'; });
add_action('wp_enqueue_scripts', static function (): void { wp_add_inline_script('jquery-core', 'console.error("Intentional OpenPreflight JavaScript regression"); Promise.reject(new Error("Intentional unhandled rejection"));'); });

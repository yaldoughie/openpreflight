<?php
/**
 * Plugin Name: OpenPreflight Agent
 * Plugin URI: https://github.com/yaldoughie/openpreflight
 * Description: Securely exports a WordPress site to a paired self-hosted OpenPreflight runner.
 * Version: 1.0.0
 * Requires at least: 6.8
 * Requires PHP: 8.1
 * Author: OpenPreflight contributors
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: openpreflight
 * Domain Path: /languages
 */

declare(strict_types=1);

namespace OpenPreflight\Agent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'OPENPREFLIGHT_AGENT_VERSION', '1.0.0' );
define( 'OPENPREFLIGHT_AGENT_FILE', __FILE__ );
define( 'OPENPREFLIGHT_AGENT_DIR', __DIR__ );

$autoload = __DIR__ . '/vendor/autoload.php';
if ( is_readable( $autoload ) ) {
	require_once $autoload;
} else {
	spl_autoload_register(
		static function ( string $class ): void {
			$prefix = __NAMESPACE__ . '\\';
			if ( str_starts_with( $class, $prefix ) ) {
				$file = __DIR__ . '/includes/' . str_replace( '\\', '/', substr( $class, strlen( $prefix ) ) ) . '.php';
				if ( is_readable( $file ) ) {
					require_once $file;
				}
			}
		}
	);
}

register_activation_hook( __FILE__, array( Activator::class, 'activate' ) );
add_action(
	'plugins_loaded',
	static function (): void {
		Plugin::instance()->boot();
	}
);

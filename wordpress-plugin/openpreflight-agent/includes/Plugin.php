<?php
/**
 * Plugin coordinator.
 *
 * @package OpenPreflight
 */

declare(strict_types=1);

namespace OpenPreflight\Agent;

final class Plugin {
	/** @var self|null Singleton coordinator instance. */
	private static ?self $instance = null;
	public static function instance(): self {
		return self::$instance ??= new self(); }
	private function __construct() {}
	public function boot(): void {
		load_plugin_textdomain( 'openpreflight', false, dirname( plugin_basename( OPENPREFLIGHT_AGENT_FILE ) ) . '/languages' );
		if ( is_multisite() ) {
			add_action(
				'admin_notices',
				static function (): void {
					echo '<div class="notice notice-error"><p>' . esc_html__( 'OpenPreflight Agent does not support multisite in version 1.0. See the roadmap for status.', 'openpreflight' ) . '</p></div>';
				}
			);
			return;
		}
		( new RestController() )->register();
		( new Admin() )->register();
		add_action( Exporter::CRON_HOOK, array( Exporter::class, 'process' ), 10, 1 );
		add_action( 'openpreflight_cleanup_exports', array( Exporter::class, 'cleanup_expired' ) );
		if ( ! wp_next_scheduled( 'openpreflight_cleanup_exports' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'hourly', 'openpreflight_cleanup_exports' );
		}
	}
}

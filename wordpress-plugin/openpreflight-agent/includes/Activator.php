<?php
/**
 * Plugin database activation.
 *
 * @package OpenPreflight
 */

declare(strict_types=1);

namespace OpenPreflight\Agent;

final class Activator {
	public const DB_VERSION = '1.0.0';

	public static function activate(): void {
		if ( is_multisite() ) {
			deactivate_plugins( plugin_basename( OPENPREFLIGHT_AGENT_FILE ) );
			wp_die( esc_html__( 'OpenPreflight Agent does not support WordPress multisite in version 1.0.', 'openpreflight' ) );
		}
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$charset = $wpdb->get_charset_collate();
		$tokens  = $wpdb->prefix . 'openpreflight_tokens';
		$exports = $wpdb->prefix . 'openpreflight_exports';
		$logs    = $wpdb->prefix . 'openpreflight_logs';
		dbDelta(
			"CREATE TABLE {$tokens} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			name varchar(190) NOT NULL,
			token_hash char(64) NOT NULL,
			scopes longtext NOT NULL,
			expires_at datetime NULL,
			last_used_at datetime NULL,
			last_used_ip varchar(45) NULL,
			created_by bigint(20) unsigned NOT NULL,
			created_at datetime NOT NULL,
			revoked_at datetime NULL,
			PRIMARY KEY  (id), UNIQUE KEY token_hash (token_hash)
		) {$charset};"
		);
		dbDelta(
			"CREATE TABLE {$exports} (
			id varchar(64) NOT NULL,
			status varchar(20) NOT NULL,
			progress smallint unsigned NOT NULL DEFAULT 0,
			state longtext NOT NULL,
			archive_path text NULL,
			archive_checksum char(64) NULL,
			archive_size bigint(20) unsigned NULL,
			error_message text NULL,
			created_by_token bigint(20) unsigned NOT NULL,
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			expires_at datetime NOT NULL,
			PRIMARY KEY  (id), KEY status (status), KEY expires_at (expires_at)
		) {$charset};"
		);
		dbDelta(
			"CREATE TABLE {$logs} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			level varchar(20) NOT NULL,
			event varchar(100) NOT NULL,
			context longtext NOT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id), KEY created_at (created_at)
		) {$charset};"
		);
		update_option( 'openpreflight_db_version', self::DB_VERSION, false );
		add_option(
			'openpreflight_settings',
			array(
				'runner_url'               => '',
				'uploads_mode'             => 'referenced-only',
				'remove_data_on_uninstall' => false,
				'exclusions'               => Exporter::default_exclusions(),
			),
			'',
			false
		);
		Exporter::protect_directory();
	}
}

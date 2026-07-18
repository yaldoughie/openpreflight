<?php
/**
 * OpenPreflight Agent uninstall cleanup.
 *
 * @package OpenPreflight
 */

declare(strict_types=1);

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
$settings = (array) get_option( 'openpreflight_settings', array() );
if ( empty( $settings['remove_data_on_uninstall'] ) ) {
	return;
}
global $wpdb;
foreach ( array( 'openpreflight_tokens', 'openpreflight_exports', 'openpreflight_logs' ) as $suffix ) {
	$table = $wpdb->prefix . $suffix;
	$wpdb->query( $wpdb->prepare( 'DROP TABLE IF EXISTS %i', $table ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.SchemaChange
}
delete_option( 'openpreflight_settings' );
delete_option( 'openpreflight_db_version' );
$upload = wp_upload_dir();
$root   = trailingslashit( (string) $upload['basedir'] ) . 'openpreflight-exports';
	$resolved_root = realpath( $root );
if ( is_dir( $root ) && str_contains( false === $resolved_root ? '' : $resolved_root, 'openpreflight-exports' ) ) {
	$iterator = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $root, RecursiveDirectoryIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST );
	foreach ( $iterator as $entry ) {
		$entry->isDir() ? rmdir( $entry->getPathname() ) : unlink( $entry->getPathname() );
	} rmdir( $root ); }

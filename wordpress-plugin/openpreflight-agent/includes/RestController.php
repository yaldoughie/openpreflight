<?php
/**
 * Versioned REST API.
 *
 * @package OpenPreflight
 */

declare(strict_types=1);

namespace OpenPreflight\Agent;

use WP_REST_Request;
use WP_REST_Response;

final class RestController {
	private const NS = 'openpreflight/v1';
	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) ); }
	public function routes(): void {
		register_rest_route(
			self::NS,
			'/status',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'status' ),
				'permission_callback' => fn ( WP_REST_Request $r ) => Auth::authorize( $r, 'status:read' ),
			)
		);
		register_rest_route(
			self::NS,
			'/manifest',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'manifest' ),
				'permission_callback' => fn ( WP_REST_Request $r ) => Auth::authorize( $r, 'manifest:read' ),
			)
		);
		register_rest_route(
			self::NS,
			'/updates',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'updates' ),
				'permission_callback' => fn ( WP_REST_Request $r ) => Auth::authorize( $r, 'updates:read' ),
			)
		);
		register_rest_route(
			self::NS,
			'/diagnostics',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'diagnostics' ),
				'permission_callback' => fn ( WP_REST_Request $r ) => Auth::authorize( $r, 'diagnostics:read' ),
			)
		);
		register_rest_route(
			self::NS,
			'/exports',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'create_export' ),
				'permission_callback' => fn ( WP_REST_Request $r ) => Auth::authorize( $r, 'export:create' ),
			)
		);
		register_rest_route(
			self::NS,
			'/exports/(?P<id>[A-Za-z0-9_-]+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'export_status' ),
					'permission_callback' => fn ( WP_REST_Request $r ) => Auth::authorize( $r, 'export:read' ),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'delete_export' ),
					'permission_callback' => fn ( WP_REST_Request $r ) => Auth::authorize( $r, 'export:delete' ),
				),
			)
		);
		register_rest_route(
			self::NS,
			'/exports/(?P<id>[A-Za-z0-9_-]+)/download',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'download' ),
				'permission_callback' => fn ( WP_REST_Request $r ) => Auth::authorize( $r, 'export:read' ),
			)
		);
		register_rest_route(
			self::NS,
			'/tokens',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'create_token' ),
				'permission_callback' => array( $this, 'manage_options' ),
				'args'                => array(
					'name'      => array(
						'required'          => true,
						'sanitize_callback' => 'sanitize_text_field',
					),
					'scopes'    => array(
						'required' => true,
						'type'     => 'array',
					),
					'expiresAt' => array( 'type' => 'string' ),
				),
			)
		);
		register_rest_route(
			self::NS,
			'/tokens/(?P<id>[0-9]+)',
			array(
				'methods'             => 'DELETE',
				'callback'            => array( $this, 'revoke_token' ),
				'permission_callback' => array( $this, 'manage_options' ),
			)
		);
	}
	public function manage_options(): bool {
		return current_user_can( 'manage_options' ); }
	/** @return array<string,mixed> */
	public function status(): array {
		return array(
			'status'   => 'ready',
			'version'  => OPENPREFLIGHT_AGENT_VERSION,
			'siteType' => is_multisite() ? 'multisite-unsupported' : 'single',
			'https'    => is_ssl(),
			'time'     => gmdate( 'c' ),
		); }
	/** @return array<string,mixed> */
	public function manifest(): array {
		global $wp_version, $wpdb;
		$theme   = wp_get_theme();
		$plugins = get_plugins();
		return array(
			'schemaVersion'      => '1.0',
			'createdAt'          => gmdate( 'c' ),
			'wordpressVersion'   => (string) $wp_version,
			'phpVersion'         => PHP_VERSION,
			'databaseType'       => 'mysql',
			'databaseVersion'    => $wpdb->db_version(),
			'siteType'           => is_multisite() ? 'multisite' : 'single',
			'activeTheme'        => array(
				'slug'    => $theme->get_stylesheet(),
				'version' => $theme->get( 'Version' ),
			),
			'plugins'            => array_map(
				static fn ( string $file, array $plugin ) => array(
					'slug'    => dirname( $file ),
					'version' => $plugin['Version'] ?? '',
					'active'  => is_plugin_active( $file ),
				),
				array_keys( $plugins ),
				array_values( $plugins )
			),
			'muPlugins'          => array_keys( get_mu_plugins() ),
			'contentDirectories' => array( 'plugins', 'themes', 'mu-plugins', 'uploads' ),
			'excludedPaths'      => Exporter::settings()['exclusions'],
			'archiveChecksum'    => null,
		);
	}
	/** @return array<string,mixed> */
	public function updates(): array {
		wp_update_plugins();
		wp_update_themes();
		$plugins = get_site_transient( 'update_plugins' );
		$themes  = get_site_transient( 'update_themes' );
		$plugin_updates = is_object( $plugins ) && property_exists( $plugins, 'response' ) && is_array( $plugins->response ) ? array_values( $plugins->response ) : array();
		$theme_updates  = is_object( $themes ) && property_exists( $themes, 'response' ) && is_array( $themes->response ) ? array_values( $themes->response ) : array();
		return array(
			'core'    => get_core_updates(
				array(
					'dismissed' => false,
					'available' => true,
				)
			),
			'plugins' => $plugin_updates,
			'themes'  => $theme_updates,
		); }
	/** @return array<string,mixed> */
	public function diagnostics(): array {
		global $wpdb;
		$rewrite_json = wp_json_encode( get_option( 'rewrite_rules', array() ) );
		return array(
			'wordpressVersion' => get_bloginfo( 'version' ),
			'phpVersion'       => PHP_VERSION,
			'databaseVersion'  => $wpdb->db_version(),
			'debug'            => defined( 'WP_DEBUG' ) && WP_DEBUG,
			'memoryLimit'      => defined( 'WP_MEMORY_LIMIT' ) ? constant( 'WP_MEMORY_LIMIT' ) : ini_get( 'memory_limit' ),
			'cronDisabled'     => defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON,
			'objectCache'      => wp_using_ext_object_cache(),
			'activeTheme'      => get_stylesheet(),
			'activePlugins'    => get_option( 'active_plugins', array() ),
			'mustUsePlugins'   => array_keys( get_mu_plugins() ),
			'dropIns'          => array_keys( get_dropins() ),
			'rewriteChecksum'  => hash( 'sha256', false === $rewrite_json ? '{}' : $rewrite_json ),
			'extensions'       => get_loaded_extensions(),
			'privacyWarning'   => __( 'Diagnostics can reveal configuration details. Share them only with a trusted runner.', 'openpreflight' ),
		); }
	public function create_export( WP_REST_Request $request ): WP_REST_Response {
		$id = Exporter::create( (int) $request->get_param( '_openpreflight_token_id' ) );
		return new WP_REST_Response(
			array(
				'id'     => $id,
				'status' => 'queued',
			),
			202
		); }
	/** @return array<string,mixed> */
	public function export_status( WP_REST_Request $request ): array {
		return Exporter::status( sanitize_key( (string) $request['id'] ) ); }
	public function delete_export( WP_REST_Request $request ): WP_REST_Response {
		Exporter::delete( sanitize_key( (string) $request['id'] ) );
		return new WP_REST_Response( null, 204 ); }
	public function download( WP_REST_Request $request ): void {
		Exporter::download( sanitize_key( (string) $request['id'] ) ); }
	public function create_token( WP_REST_Request $request ): WP_REST_Response {
		$requested_scopes = array_values( array_filter( (array) $request['scopes'], 'is_string' ) );
		$created          = Auth::create( (string) $request['name'], $requested_scopes, $request['expiresAt'] ? (string) $request['expiresAt'] : null );
		return new WP_REST_Response(
			array(
				'id'      => $created['id'],
				'token'   => $created['token'],
				'warning' => __( 'Copy this token now. It will not be shown again.', 'openpreflight' ),
			),
			201
		); }
	public function revoke_token( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( array( 'revoked' => Auth::revoke( (int) $request['id'] ) ) ); }
}

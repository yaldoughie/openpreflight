<?php
/**
 * Accessible agent administration.
 *
 * @package OpenPreflight
 */

declare(strict_types=1);

namespace OpenPreflight\Agent;

final class Admin {
	public function register(): void {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_post_openpreflight_create_token', array( $this, 'create_token' ) );
		add_action( 'admin_post_openpreflight_revoke_token', array( $this, 'revoke_token' ) );
		add_action( 'admin_post_openpreflight_save_settings', array( $this, 'save_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'assets' ) ); }
	public function menu(): void {
		add_management_page( __( 'OpenPreflight Agent', 'openpreflight' ), __( 'OpenPreflight Agent', 'openpreflight' ), 'manage_options', 'openpreflight-agent', array( $this, 'render' ) ); }
	public function assets( string $hook ): void {
		if ( 'tools_page_openpreflight-agent' !== $hook ) {
			return;
		} wp_enqueue_style( 'openpreflight-agent', plugins_url( 'assets/admin.css', OPENPREFLIGHT_AGENT_FILE ), array(), OPENPREFLIGHT_AGENT_VERSION ); }
	public function create_token(): void {
		$this->guard();
		check_admin_referer( 'openpreflight_create_token' );
		$scopes  = isset( $_POST['scopes'] ) ? array_values( array_map( 'sanitize_text_field', (array) wp_unslash( $_POST['scopes'] ) ) ) : array();
		$created = Auth::create( sanitize_text_field( wp_unslash( $_POST['name'] ?? 'Runner' ) ), $scopes, ! empty( $_POST['expires_at'] ) ? sanitize_text_field( wp_unslash( $_POST['expires_at'] ) ) : null );
		set_transient( 'openpreflight_token_once_' . get_current_user_id(), $created['token'], 5 * MINUTE_IN_SECONDS );
		wp_safe_redirect( admin_url( 'tools.php?page=openpreflight-agent&created=1' ) );
		exit; }
	public function revoke_token(): void {
		$this->guard();
		// The numeric ID is needed to select the corresponding nonce action.
		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		$token_id = absint( wp_unslash( $_POST['token_id'] ?? '0' ) );
		check_admin_referer( 'openpreflight_revoke_token_' . $token_id );
		Auth::revoke( $token_id );
		wp_safe_redirect( admin_url( 'tools.php?page=openpreflight-agent&revoked=1' ) );
		exit; }
	public function save_settings(): void {
		$this->guard();
		check_admin_referer( 'openpreflight_save_settings' );
		$existing   = Exporter::settings();
		$exclusions = isset( $_POST['exclusions'] ) ? preg_split( '/\r?\n/', sanitize_textarea_field( wp_unslash( $_POST['exclusions'] ) ) ) : Exporter::default_exclusions();
		update_option(
			'openpreflight_settings',
			array(
				'runner_url'               => esc_url_raw( wp_unslash( $_POST['runner_url'] ?? '' ) ),
				'uploads_mode'             => in_array( $_POST['uploads_mode'] ?? '', array( 'none', 'referenced-only', 'recent', 'all' ), true ) ? sanitize_key( $_POST['uploads_mode'] ) : 'referenced-only',
				'remove_data_on_uninstall' => isset( $_POST['remove_data_on_uninstall'] ),
				'exclusions'               => array_values( array_filter( array_map( static fn ( string $value ): string => trim( $value ), array_filter( (array) $exclusions, 'is_string' ) ) ) ),
				'privacy_acknowledged'     => isset( $_POST['privacy_acknowledged'] ),
				'previous'                 => $existing,
			),
			false
		);
		wp_safe_redirect( admin_url( 'tools.php?page=openpreflight-agent&saved=1' ) );
		exit; }
	private function guard(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to manage OpenPreflight Agent.', 'openpreflight' ) );
		} }
	public function render(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		} global $wpdb;
		$settings = Exporter::settings();
		$tokens   = $wpdb->get_results( "SELECT id,name,scopes,expires_at,last_used_at,last_used_ip,created_at,revoked_at FROM {$wpdb->prefix}openpreflight_tokens ORDER BY created_at DESC", ARRAY_A );
		$exports  = $wpdb->get_results( "SELECT id,status,progress,archive_size,created_at,expires_at FROM {$wpdb->prefix}openpreflight_exports ORDER BY created_at DESC LIMIT 50", ARRAY_A );
		$logs     = $wpdb->get_results( "SELECT level,event,context,created_at FROM {$wpdb->prefix}openpreflight_logs ORDER BY id DESC LIMIT 50", ARRAY_A );
		$token    = get_transient( 'openpreflight_token_once_' . get_current_user_id() );
		if ( $token ) {
			delete_transient( 'openpreflight_token_once_' . get_current_user_id() );
		} ?>
		<div class="wrap openpreflight-agent" dir="auto"><h1><?php esc_html_e( 'OpenPreflight Agent', 'openpreflight' ); ?></h1><div class="notice notice-warning inline"><p><strong><?php esc_html_e( 'Privacy warning:', 'openpreflight' ); ?></strong> <?php esc_html_e( 'Site exports may contain personal data and plugin secrets. Pair only with a trusted self-hosted runner and use HTTPS outside the local computer.', 'openpreflight' ); ?></p></div>
		<?php
		if ( $token ) :
			?>
			<section class="opf-token" aria-labelledby="opf-new-token"><h2 id="opf-new-token"><?php esc_html_e( 'Copy your token now', 'openpreflight' ); ?></h2><p><?php esc_html_e( 'This value will not be shown again.', 'openpreflight' ); ?></p><code><?php echo esc_html( (string) $token ); ?></code></section><?php endif; ?>
		<nav class="nav-tab-wrapper" aria-label="<?php esc_attr_e( 'Agent sections', 'openpreflight' ); ?>"><a class="nav-tab nav-tab-active" href="#connection"><?php esc_html_e( 'Connection', 'openpreflight' ); ?></a><a class="nav-tab" href="#diagnostics"><?php esc_html_e( 'Diagnostics', 'openpreflight' ); ?></a><a class="nav-tab" href="#exports"><?php esc_html_e( 'Exports', 'openpreflight' ); ?></a><a class="nav-tab" href="#privacy"><?php esc_html_e( 'Privacy', 'openpreflight' ); ?></a><a class="nav-tab" href="#logs"><?php esc_html_e( 'Logs', 'openpreflight' ); ?></a></nav>
		<section id="connection"><h2><?php esc_html_e( 'Connection status and pairing tokens', 'openpreflight' ); ?></h2><p><?php echo is_ssl() ? esc_html__( 'HTTPS is active.', 'openpreflight' ) : esc_html__( 'HTTPS is not active. Only loopback runner connections are accepted.', 'openpreflight' ); ?></p><form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><?php wp_nonce_field( 'openpreflight_create_token' ); ?><input type="hidden" name="action" value="openpreflight_create_token"><label><?php esc_html_e( 'Token name', 'openpreflight' ); ?><input required name="name" maxlength="190"></label><fieldset><legend><?php esc_html_e( 'Scopes', 'openpreflight' ); ?></legend>
		<?php
		foreach ( Auth::SCOPES as $scope ) :
			?>
			<label><input type="checkbox" name="scopes[]" value="<?php echo esc_attr( $scope ); ?>" checked> <code><?php echo esc_html( $scope ); ?></code></label><?php endforeach; ?></fieldset><label><?php esc_html_e( 'Expiration date (optional)', 'openpreflight' ); ?><input type="date" name="expires_at"></label><?php submit_button( __( 'Create token', 'openpreflight' ) ); ?></form>
		<table class="widefat striped"><caption><?php esc_html_e( 'Pairing tokens', 'openpreflight' ); ?></caption><thead><tr><th><?php esc_html_e( 'Name', 'openpreflight' ); ?></th><th><?php esc_html_e( 'Scopes', 'openpreflight' ); ?></th><th><?php esc_html_e( 'Last used', 'openpreflight' ); ?></th><th><?php esc_html_e( 'Status', 'openpreflight' ); ?></th><th><?php esc_html_e( 'Action', 'openpreflight' ); ?></th></tr></thead><tbody>
		<?php
		foreach ( $tokens as $row ) :
			?>
			<tr><td><?php echo esc_html( $row['name'] ); ?></td><td><code><?php echo esc_html( implode( ', ', (array) json_decode( $row['scopes'], true ) ) ); ?></code></td><td><?php echo esc_html( $row['last_used_at'] ? $row['last_used_at'] : __( 'Never', 'openpreflight' ) ); ?> <?php echo $row['last_used_ip'] ? esc_html( '(' . $row['last_used_ip'] . ')' ) : ''; ?></td><td><?php echo $row['revoked_at'] ? esc_html__( 'Revoked', 'openpreflight' ) : esc_html__( 'Active', 'openpreflight' ); ?></td><td>
			<?php
			if ( ! $row['revoked_at'] ) :
				?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><?php wp_nonce_field( 'openpreflight_revoke_token_' . (int) $row['id'] ); ?><input type="hidden" name="action" value="openpreflight_revoke_token"><input type="hidden" name="token_id" value="<?php echo (int) $row['id']; ?>"><button class="button"><?php esc_html_e( 'Revoke', 'openpreflight' ); ?></button></form><?php endif; ?></td></tr><?php endforeach; ?></tbody></table></section>
		<section id="diagnostics"><h2><?php esc_html_e( 'Site diagnostics and update inventory', 'openpreflight' ); ?></h2><dl><dt><?php esc_html_e( 'WordPress', 'openpreflight' ); ?></dt><dd><?php echo esc_html( get_bloginfo( 'version' ) ); ?></dd><dt><?php esc_html_e( 'PHP', 'openpreflight' ); ?></dt><dd><?php echo esc_html( PHP_VERSION ); ?></dd><dt><?php esc_html_e( 'Site type', 'openpreflight' ); ?></dt><dd><?php echo is_multisite() ? esc_html__( 'Unsupported multisite', 'openpreflight' ) : esc_html__( 'Single site', 'openpreflight' ); ?></dd><dt><?php esc_html_e( 'Pending plugin updates', 'openpreflight' ); ?></dt><dd>
		<?php
		$updates = get_site_transient( 'update_plugins' );
		$pending_plugins = is_object( $updates ) && property_exists( $updates, 'response' ) && is_array( $updates->response ) ? count( $updates->response ) : 0;
		echo esc_html( (string) $pending_plugins );
		?>
		</dd></dl></section>
		<section id="exports"><h2><?php esc_html_e( 'Export jobs', 'openpreflight' ); ?></h2><table class="widefat striped"><thead><tr><th><?php esc_html_e( 'ID', 'openpreflight' ); ?></th><th><?php esc_html_e( 'Status', 'openpreflight' ); ?></th><th><?php esc_html_e( 'Progress', 'openpreflight' ); ?></th><th><?php esc_html_e( 'Expires', 'openpreflight' ); ?></th></tr></thead><tbody>
		<?php
		foreach ( $exports as $row ) :
			?>
			<tr><td><code><?php echo esc_html( $row['id'] ); ?></code></td><td><?php echo esc_html( $row['status'] ); ?></td><td><?php echo (int) $row['progress']; ?>%</td><td><?php echo esc_html( $row['expires_at'] ); ?></td></tr><?php endforeach; ?></tbody></table></section>
		<section id="privacy"><h2><?php esc_html_e( 'Export settings, data exclusions, and privacy controls', 'openpreflight' ); ?></h2><form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><?php wp_nonce_field( 'openpreflight_save_settings' ); ?><input type="hidden" name="action" value="openpreflight_save_settings"><label><?php esc_html_e( 'Runner URL', 'openpreflight' ); ?><input class="regular-text" type="url" name="runner_url" value="<?php echo esc_attr( $settings['runner_url'] ); ?>"></label><label><?php esc_html_e( 'Uploads mode', 'openpreflight' ); ?><select name="uploads_mode">
		<?php
		foreach ( array( 'none', 'referenced-only', 'recent', 'all' ) as $mode ) :
			?>
			<option value="<?php echo esc_attr( $mode ); ?>" <?php selected( $settings['uploads_mode'], $mode ); ?>><?php echo esc_html( $mode ); ?></option><?php endforeach; ?></select></label><label><?php esc_html_e( 'Exclusion patterns (one per line)', 'openpreflight' ); ?><textarea name="exclusions" rows="10" class="large-text code"><?php echo esc_textarea( implode( "\n", (array) $settings['exclusions'] ) ); ?></textarea></label><label><input type="checkbox" required name="privacy_acknowledged" <?php checked( ! empty( $settings['privacy_acknowledged'] ) ); ?>> <?php esc_html_e( 'I understand that exports may contain personal data and unknown plugin secrets.', 'openpreflight' ); ?></label><label><input type="checkbox" name="remove_data_on_uninstall" <?php checked( ! empty( $settings['remove_data_on_uninstall'] ) ); ?>> <?php esc_html_e( 'Remove all Agent tokens, logs, settings, and temporary exports when the plugin is uninstalled.', 'openpreflight' ); ?></label><?php submit_button( __( 'Save settings', 'openpreflight' ) ); ?></form></section>
		<section id="logs"><h2><?php esc_html_e( 'Agent logs', 'openpreflight' ); ?></h2><table class="widefat striped"><thead><tr><th><?php esc_html_e( 'Time', 'openpreflight' ); ?></th><th><?php esc_html_e( 'Level', 'openpreflight' ); ?></th><th><?php esc_html_e( 'Event', 'openpreflight' ); ?></th><th><?php esc_html_e( 'Safe context', 'openpreflight' ); ?></th></tr></thead><tbody>
		<?php
		foreach ( $logs as $row ) :
			?>
			<tr><td><?php echo esc_html( $row['created_at'] ); ?></td><td><?php echo esc_html( $row['level'] ); ?></td><td><?php echo esc_html( $row['event'] ); ?></td><td><code><?php echo esc_html( $row['context'] ); ?></code></td></tr><?php endforeach; ?></tbody></table></section></div>
		<?php
	}
}

<?php
/**
 * Trusted local clone sanitization executed only inside a disposable environment.
 *
 * @package OpenPreflight
 */

declare(strict_types=1);

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	throw new RuntimeException( 'Clone sanitization must run through WP-CLI.' );
}

global $wpdb;
$actions = array();
$record  = static function ( string $action, int $affected = 0 ) use ( &$actions ): void {
	$actions[] = array(
		'action'   => $action,
		'affected' => $affected,
		'status'   => 'completed',
	);
};

$affected = $wpdb->query( "UPDATE {$wpdb->users} SET user_activation_key = ''" );
$record( 'password-reset-tokens-removed', false === $affected ? 0 : $affected );

foreach ( get_users( array( 'fields' => array( 'ID' ) ) ) as $user ) {
	$user_id = (int) $user->ID;
	wp_update_user(
		array(
			'ID'           => $user_id,
			'user_email'   => 'user-' . $user_id . '@example.invalid',
			'display_name' => 'Test User ' . $user_id,
			'first_name'   => 'Test',
			'last_name'    => 'User ' . $user_id,
		)
	);
	foreach ( array( 'billing', 'shipping' ) as $kind ) {
		update_user_meta( $user_id, $kind . '_first_name', 'Test' );
		update_user_meta( $user_id, $kind . '_last_name', 'Customer' );
		update_user_meta( $user_id, $kind . '_email', 'customer-' . $user_id . '@example.invalid' );
		update_user_meta( $user_id, $kind . '_phone', '0000000000' );
		update_user_meta( $user_id, $kind . '_address_1', '1 Test Street' );
		update_user_meta( $user_id, $kind . '_address_2', '' );
	}
}
$record( 'wordpress-users-and-customer-profiles-pseudonymized', count( get_users( array( 'fields' => 'ids' ) ) ) );

$synthetic = array(
	array( 'openpreflight_admin', 'administrator' ),
	array( 'openpreflight_customer', 'customer' ),
);
foreach ( $synthetic as $account ) {
	$login = $account[0];
	$role  = $account[1];
	if ( ! username_exists( $login ) ) {
		$selected_role = get_role( $role ) ? $role : 'subscriber';
		wp_insert_user(
			array(
				'user_login' => $login,
				'user_pass'  => wp_generate_password( 32, true, true ),
				'user_email' => $login . '@example.invalid',
				'role'       => $selected_role,
			)
		);
	}
}
$record( 'synthetic-test-users-created', count( $synthetic ) );

$customer_keys = array(
	'_billing_first_name',
	'_billing_last_name',
	'_billing_email',
	'_billing_phone',
	'_billing_address_1',
	'_billing_address_2',
	'_shipping_first_name',
	'_shipping_last_name',
	'_shipping_address_1',
	'_shipping_address_2',
);
$placeholders  = implode( ',', array_fill( 0, count( $customer_keys ), '%s' ) );
$values        = array_merge( array( '[SANITIZED]' ), $customer_keys );
$affected      = $wpdb->query(
	$wpdb->prepare(
		"UPDATE {$wpdb->postmeta} SET meta_value=%s WHERE meta_key IN ($placeholders)",
		...$values
	)
);
$record( 'woocommerce-order-address-metadata-pseudonymized', false === $affected ? 0 : $affected );

foreach ( array( 'woocommerce_payment_tokens', 'woocommerce_payment_tokenmeta' ) as $suffix ) {
	$table = $wpdb->prefix . $suffix;
	if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) === $table ) {
		$affected = $wpdb->query( $wpdb->prepare( 'DELETE FROM %i', $table ) );
		$record( 'woocommerce-payment-tokens-removed', false === $affected ? 0 : $affected );
	}
}

$webhooks = $wpdb->prefix . 'wc_webhooks';
if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $webhooks ) ) === $webhooks ) {
	$affected = $wpdb->query( $wpdb->prepare( "UPDATE %i SET status='disabled'", $webhooks ) );
	$record( 'woocommerce-webhooks-disabled', false === $affected ? 0 : $affected );
}

$secret_options = $wpdb->get_col(
	"SELECT option_name FROM {$wpdb->options} WHERE option_name REGEXP '(api[_-]?key|consumer_secret|client_secret|private_key|access_token|refresh_token|stripe|paypal)'"
);
foreach ( $secret_options as $option_name ) {
	update_option( (string) $option_name, '', false );
}
$record( 'known-option-secret-patterns-cleared', count( $secret_options ) );

foreach ( array( 'woocommerce_allow_tracking', 'google_analytics_ua_id', 'jetpack_private_options' ) as $option_name ) {
	delete_option( $option_name );
}
$record( 'analytics-integrations-disabled', 3 );

$deactivated = array();
foreach ( (array) get_option( 'active_plugins', array() ) as $plugin_file ) {
	if ( preg_match( '#(?:wordfence|sucuri|ithemes-security|wp-rocket|w3-total-cache|litespeed-cache)/#i', (string) $plugin_file ) ) {
		$deactivated[] = (string) $plugin_file;
	}
}
if ( $deactivated ) {
	deactivate_plugins( $deactivated, true );
}
$record( 'blocking-security-and-production-cache-plugins-deactivated', count( $deactivated ) );

wp_destroy_all_sessions();
delete_option( 'cron' );
do_action( 'openpreflight_sanitize_clone' );
$record( 'trusted-local-sanitization-hooks-executed', 1 );

WP_CLI::line(
	wp_json_encode(
		array(
			'warning' => 'Arbitrary plugins may store secrets in unknown locations; complete sanitization cannot be guaranteed.',
			'actions' => $actions,
		),
		JSON_UNESCAPED_SLASHES
	)
);

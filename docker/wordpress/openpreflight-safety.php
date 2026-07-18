<?php
/**
 * Plugin Name: OpenPreflight Clone Safety
 * Description: Enforces non-production mail, webhook, indexing, and payment safeguards inside disposable clones.
 * License: GPL-2.0-or-later
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_filter(
	'pre_wp_mail',
	static function ( $return, array $atts ) {
		$log = WP_CONTENT_DIR . '/openpreflight-mail.jsonl';
		$record = array(
			'at' => gmdate( 'c' ),
			'subject' => isset( $atts['subject'] ) ? sanitize_text_field( (string) $atts['subject'] ) : '',
			'blocked' => true,
		);
		file_put_contents( $log, wp_json_encode( $record ) . PHP_EOL, FILE_APPEND | LOCK_EX );
		return true;
	},
	10,
	2
);

add_filter( 'pre_option_blog_public', static fn () => '0' );
add_filter( 'woocommerce_payment_gateways', static fn () => array() );
add_filter( 'woocommerce_available_payment_gateways', static fn () => array() );
add_filter(
	'pre_http_request',
	static function ( $preempt, array $args, string $url ) {
		$host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
		$configured = array_filter( array_map( 'trim', explode( ',', (string) getenv( 'OPENPREFLIGHT_ALLOWED_HOSTS' ) ) ) );
		$allowed    = array_values( array_unique( $configured ) );
		if ( ! in_array( $host, $allowed, true ) ) {
			return new WP_Error( 'openpreflight_network_blocked', 'External request blocked by OpenPreflight clone safety.' );
		}
		return $preempt;
	},
	1,
	3
);

add_action(
	'init',
	static function (): void {
		if ( ! defined( 'OPENPREFLIGHT_CLONE' ) ) {
			define( 'OPENPREFLIGHT_CLONE', true );
		}
	}
);

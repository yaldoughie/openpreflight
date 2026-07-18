<?php
/**
 * Scoped bearer-token authentication.
 *
 * @package OpenPreflight
 */

declare(strict_types=1);

namespace OpenPreflight\Agent;

use WP_Error;
use WP_REST_Request;

final class Auth {
	public const SCOPES         = array( 'status:read', 'manifest:read', 'updates:read', 'diagnostics:read', 'export:create', 'export:read', 'export:delete' );
	private const FAILURE_LIMIT = 10;

	/**
	 * @param list<string> $scopes Requested token scopes.
	 * @return array{token:string,id:int}
	 */
	public static function create( string $name, array $scopes, ?string $expires_at ): array {
		global $wpdb;
		$scopes = array_values( array_intersect( self::SCOPES, array_map( 'sanitize_text_field', $scopes ) ) );
		if ( empty( $scopes ) ) {
			throw new \InvalidArgumentException( 'At least one valid token scope is required.' );
		}
		$secret           = bin2hex( random_bytes( 32 ) );
		$hash             = hash_hmac( 'sha256', $secret, wp_salt( 'auth' ) );
		$expires_timestamp = null === $expires_at ? null : strtotime( $expires_at );
		if ( null !== $expires_at && false === $expires_timestamp ) {
			throw new \InvalidArgumentException( 'The token expiration date is invalid.' );
		}
		$wpdb->insert(
			$wpdb->prefix . 'openpreflight_tokens',
			array(
				'name'       => sanitize_text_field( $name ),
				'token_hash' => $hash,
				'scopes'     => wp_json_encode( $scopes ),
				'expires_at' => null === $expires_timestamp ? null : gmdate( 'Y-m-d H:i:s', $expires_timestamp ),
				'created_by' => get_current_user_id(),
				'created_at' => current_time( 'mysql', true ),
			),
			array( '%s', '%s', '%s', '%s', '%d', '%s' )
		);
		$id = (int) $wpdb->insert_id;
		return array(
			'token' => 'opf_' . $id . '.' . $secret,
			'id'    => $id,
		);
	}

	public static function authorize( WP_REST_Request $request, string $scope ): bool|WP_Error {
		$ip          = self::client_ip();
		$failure_key = 'opf_fail_' . hash( 'sha256', $ip );
		if ( (int) get_transient( $failure_key ) >= self::FAILURE_LIMIT ) {
			return new WP_Error( 'openpreflight_rate_limited', __( 'Too many authentication failures. Try again later.', 'openpreflight' ), array( 'status' => 429 ) );
		}
		if ( ! is_ssl() && ! self::is_loopback_request() ) {
			return new WP_Error( 'openpreflight_https_required', __( 'HTTPS is required for non-local OpenPreflight Agent connections.', 'openpreflight' ), array( 'status' => 403 ) );
		}
		$authorization = (string) $request->get_header( 'authorization' );
		if ( ! preg_match( '/^Bearer\s+opf_([0-9]+)\.([A-Za-z0-9_-]{40,})$/D', $authorization, $matches ) ) {
			return self::failure( $failure_key );
		}
		global $wpdb;
		$row        = $wpdb->get_row( $wpdb->prepare( "SELECT id,token_hash,scopes,expires_at,revoked_at FROM {$wpdb->prefix}openpreflight_tokens WHERE id=%d", (int) $matches[1] ), ARRAY_A );
		$candidate  = hash_hmac( 'sha256', $matches[2], wp_salt( 'auth' ) );
		$valid_hash = is_array( $row ) ? hash_equals( (string) $row['token_hash'], $candidate ) : hash_equals( str_repeat( '0', 64 ), $candidate );
		if ( ! $valid_hash || ! is_array( $row ) || ! empty( $row['revoked_at'] ) || ( ! empty( $row['expires_at'] ) && strtotime( (string) $row['expires_at'] . ' UTC' ) < time() ) ) {
			return self::failure( $failure_key );
		}
		$scopes = json_decode( (string) $row['scopes'], true );
		if ( ! is_array( $scopes ) || ! in_array( $scope, $scopes, true ) ) {
			return new WP_Error( 'openpreflight_scope_denied', __( 'The token does not have the required scope.', 'openpreflight' ), array( 'status' => 403 ) );
		}
		delete_transient( $failure_key );
		$wpdb->update(
			$wpdb->prefix . 'openpreflight_tokens',
			array(
				'last_used_at' => current_time( 'mysql', true ),
				'last_used_ip' => $ip,
			),
			array( 'id' => (int) $row['id'] ),
			array( '%s', '%s' ),
			array( '%d' )
		);
		$request->set_param( '_openpreflight_token_id', (int) $row['id'] );
		return true;
	}

	private static function failure( string $key ): WP_Error {
		set_transient( $key, (int) get_transient( $key ) + 1, 15 * MINUTE_IN_SECONDS );
		usleep( 100000 );
		return new WP_Error( 'openpreflight_unauthorized', __( 'Valid OpenPreflight Agent credentials are required.', 'openpreflight' ), array( 'status' => 401 ) ); }
	private static function is_loopback_request(): bool {
		return in_array( self::client_ip(), array( '127.0.0.1', '::1' ), true ); }
	private static function client_ip(): string {
		$value = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		return filter_var( $value, FILTER_VALIDATE_IP ) ? $value : 'unknown'; }
	public static function revoke( int $id ): bool {
		global $wpdb;
		return 1 === $wpdb->update( $wpdb->prefix . 'openpreflight_tokens', array( 'revoked_at' => current_time( 'mysql', true ) ), array( 'id' => $id ), array( '%s' ), array( '%d' ) ); }
}

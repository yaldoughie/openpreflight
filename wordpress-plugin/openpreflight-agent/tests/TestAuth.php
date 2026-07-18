<?php
declare(strict_types=1);
namespace OpenPreflight\Agent\Tests;

use OpenPreflight\Agent\Auth;
use WP_REST_Request;

final class TestAuth extends \WP_UnitTestCase {
	public function test_token_is_displayed_once_and_only_hash_is_stored(): void {
		$user = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $user );
		$created = Auth::create( 'Test runner', array( 'status:read' ), null );
		$this->assertStringStartsWith( 'opf_', $created['token'] );
		global $wpdb;
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT token_hash FROM {$wpdb->prefix}openpreflight_tokens WHERE id=%d", $created['id'] ), ARRAY_A );
		$this->assertIsArray( $row );
		$this->assertSame( 64, strlen( $row['token_hash'] ) );
		$this->assertStringNotContainsString( $created['token'], $row['token_hash'] );
	}
	public function test_missing_token_is_unauthorized(): void {
		$request = new WP_REST_Request( 'GET', '/openpreflight/v1/status' );
		$result  = Auth::authorize( $request, 'status:read' );
		$this->assertWPError( $result );
		$this->assertSame( 401, $result->get_error_data()['status'] ); }
	public function test_revoked_token_cannot_be_reused(): void {
		$user = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $user );
		$created = Auth::create( 'Test', array( 'status:read' ), null );
		$this->assertTrue( Auth::revoke( $created['id'] ) );
		$request = new WP_REST_Request( 'GET', '/openpreflight/v1/status' );
		$request->set_header( 'authorization', 'Bearer ' . $created['token'] );
		$this->assertWPError( Auth::authorize( $request, 'status:read' ) ); }
	public function test_wrong_scope_is_forbidden(): void {
		$user = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $user );
		$created = Auth::create( 'Test', array( 'status:read' ), null );
		$request = new WP_REST_Request( 'GET', '/openpreflight/v1/manifest' );
		$request->set_header( 'authorization', 'Bearer ' . $created['token'] );
		$result = Auth::authorize( $request, 'manifest:read' );
		$this->assertWPError( $result );
		$this->assertSame( 403, $result->get_error_data()['status'] ); }
}

<?php
declare(strict_types=1);
namespace OpenPreflight\Agent\Tests;

use OpenPreflight\Agent\Auth;
use WP_REST_Request;

final class TestRest extends \WP_UnitTestCase {
	public function set_up(): void {
		parent::set_up();
		do_action( 'rest_api_init' ); }
	public function test_unauthorized_manifest_fails(): void {
		$response = rest_do_request( new WP_REST_Request( 'GET', '/openpreflight/v1/manifest' ) );
		$this->assertSame( 401, $response->get_status() ); }
	public function test_authorized_manifest_excludes_credentials(): void {
		$user = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $user );
		$created = Auth::create( 'Manifest', array( 'manifest:read' ), null );
		wp_set_current_user( 0 );
		$request = new WP_REST_Request( 'GET', '/openpreflight/v1/manifest' );
		$request->set_header( 'authorization', 'Bearer ' . $created['token'] );
		$response = rest_do_request( $request );
		$this->assertSame( 200, $response->get_status() );
		$json = wp_json_encode( $response->get_data() );
		$this->assertStringNotContainsString( 'DB_PASSWORD', $json );
		$this->assertStringNotContainsString( 'AUTH_KEY', $json ); }
	public function test_no_production_update_route_exists(): void {
		$response = rest_do_request( new WP_REST_Request( 'POST', '/openpreflight/v1/updates' ) );
		$this->assertSame( 404, $response->get_status() ); }
}

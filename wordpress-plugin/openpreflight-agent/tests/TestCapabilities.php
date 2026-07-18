<?php
declare(strict_types=1);
namespace OpenPreflight\Agent\Tests;

use OpenPreflight\Agent\RestController;

final class TestCapabilities extends \WP_UnitTestCase {
	public function test_subscriber_cannot_manage_tokens(): void {
		$user = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		wp_set_current_user( $user );
		$this->assertFalse( ( new RestController() )->manage_options() ); }
	public function test_administrator_can_manage_tokens(): void {
		$user = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $user );
		$this->assertTrue( ( new RestController() )->manage_options() ); }
}

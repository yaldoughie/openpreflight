<?php
declare(strict_types=1);
namespace OpenPreflight\Agent\Tests;

use OpenPreflight\Agent\Exporter;

final class TestExporter extends \WP_UnitTestCase {
	public function test_default_exclusions_cover_sensitive_and_large_content(): void {
		$patterns = implode( '\n', Exporter::default_exclusions() );
		$this->assertStringContainsString( '*.env', $patterns );
		$this->assertStringContainsString( 'backup', $patterns );
		$this->assertStringContainsString( '*.log', $patterns );
		$this->assertStringContainsString( '*.zip', $patterns ); }
	public function test_default_upload_mode_is_privacy_conscious(): void {
		$this->assertSame( 'referenced-only', Exporter::settings()['uploads_mode'] ); }
	public function test_export_id_is_unpredictable(): void {
		global $wpdb;
		$first  = Exporter::create( 1 );
		$second = Exporter::create( 1 );
		$this->assertMatchesRegularExpression( '/^export_[a-f0-9]{32}$/', $first );
		$this->assertNotSame( $first, $second );
		$wpdb->delete( $wpdb->prefix . 'openpreflight_exports', array( 'id' => $first ) );
		$wpdb->delete( $wpdb->prefix . 'openpreflight_exports', array( 'id' => $second ) ); }
}

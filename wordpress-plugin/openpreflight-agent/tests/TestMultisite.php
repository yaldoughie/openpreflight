<?php
declare(strict_types=1);
namespace OpenPreflight\Agent\Tests;

final class TestMultisite extends \WP_UnitTestCase {
	public function test_manifest_reports_single_site_in_v1(): void {
		$this->assertFalse( is_multisite(), 'The v1 test matrix must use single-site WordPress. A separate multisite job verifies activation rejection.' ); }
}

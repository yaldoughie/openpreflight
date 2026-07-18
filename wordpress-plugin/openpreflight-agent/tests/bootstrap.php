<?php
declare(strict_types=1);
$configured_tests_dir = getenv( 'WP_TESTS_DIR' );
$tests_dir            = false === $configured_tests_dir ? sys_get_temp_dir() . '/wordpress-tests-lib' : $configured_tests_dir;
if ( ! is_readable( $tests_dir . '/includes/functions.php' ) ) {
	fwrite( STDERR, "WordPress test library not found. Set WP_TESTS_DIR.\n" );
	exit( 1 );
}
require_once $tests_dir . '/includes/functions.php';
tests_add_filter(
	'muplugins_loaded',
	static function (): void {
		require dirname( __DIR__ ) . '/openpreflight-agent.php';
	}
);
require $tests_dir . '/includes/bootstrap.php';

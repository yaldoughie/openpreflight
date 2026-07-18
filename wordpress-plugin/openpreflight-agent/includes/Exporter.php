<?php
/**
 * Bounded, resumable export jobs.
 *
 * @package OpenPreflight
 */

declare(strict_types=1);

namespace OpenPreflight\Agent;

use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;
use ZipArchive;

final class Exporter {
	public const CRON_HOOK      = 'openpreflight_process_export';
	private const BATCH_SECONDS = 8;
	private const MAX_FILES     = 100000;
	private const MAX_BYTES     = 10737418240;

	/** @return array<string,mixed> */
	public static function settings(): array {
		return wp_parse_args(
			(array) get_option( 'openpreflight_settings', array() ),
			array(
				'uploads_mode'             => 'referenced-only',
				'exclusions'               => self::default_exclusions(),
				'remove_data_on_uninstall' => false,
				'runner_url'               => '',
			)
		); }
	/** @return string[] */
	public static function default_exclusions(): array {
		return array( '*/cache/*', '*/caches/*', '*/backup/*', '*/backups/*', '*/logs/*', '*.log', '*.sql', '*.sql.gz', '*.zip', '*.tar', '*.tar.gz', '*.env', '*/.env', '*/node_modules/*', '*/vendor/bin/*', '*/sessions/*', '*/tmp/*', '*/temp/*', 'wp-content/debug.log' ); }
	public static function directory(): string {
		$upload = wp_upload_dir();
		return trailingslashit( (string) $upload['basedir'] ) . 'openpreflight-exports'; }
	public static function protect_directory(): void {
		$directory = self::directory();
		if ( ! wp_mkdir_p( $directory ) ) {
			return;
		} file_put_contents( $directory . '/index.php', "<?php\n// Silence is golden.\n", LOCK_EX );
		file_put_contents( $directory . '/.htaccess', "Require all denied\nDeny from all\n", LOCK_EX );
		file_put_contents( $directory . '/web.config', '<configuration><system.webServer><authorization><deny users="*" /></authorization></system.webServer></configuration>', LOCK_EX ); }

	public static function create( int $token_id ): string {
		global $wpdb;
		self::protect_directory();
		$id    = 'export_' . bin2hex( random_bytes( 16 ) );
		$now   = current_time( 'mysql', true );
		$state = array(
			'phase'      => 'database',
			'tableIndex' => 0,
			'offset'     => 0,
			'fileOffset' => 0,
			'files'      => 0,
			'bytes'      => 0,
			'excluded'   => array(),
			'warnings'   => array( __( 'Arbitrary plugins may store secrets in unknown database fields. Review exports as sensitive data.', 'openpreflight' ) ),
		);
		$wpdb->insert(
			$wpdb->prefix . 'openpreflight_exports',
			array(
				'id'               => $id,
				'status'           => 'queued',
				'progress'         => 0,
				'state'            => wp_json_encode( $state ),
				'created_by_token' => $token_id,
				'created_at'       => $now,
				'updated_at'       => $now,
				'expires_at'       => gmdate( 'Y-m-d H:i:s', time() + DAY_IN_SECONDS ),
			),
			array( '%s', '%s', '%d', '%s', '%d', '%s', '%s', '%s' )
		);
		wp_schedule_single_event( time() + 1, self::CRON_HOOK, array( $id ) );
		return $id;
	}

	public static function process( string $id ): void {
		global $wpdb;
		$table = $wpdb->prefix . 'openpreflight_exports';
		$row   = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i WHERE id=%s', $table, $id ), ARRAY_A );
		if ( ! is_array( $row ) || in_array( $row['status'], array( 'complete', 'failed' ), true ) ) {
			return;
		}
		$state = json_decode( (string) $row['state'], true );
		if ( ! is_array( $state ) ) {
			$state = array();
		} $wpdb->update(
			$table,
			array(
				'status'     => 'running',
				'updated_at' => current_time( 'mysql', true ),
			),
			array( 'id' => $id )
		);
		try {
			$done = match ( $state['phase'] ?? 'database' ) {
				'database' => self::database_batch( $id, $state ), 'files' => self::files_batch( $id, $state ), 'finalize' => self::finalize( $id, $state ), default => throw new RuntimeException( 'Invalid export phase.' ) };
			if ( ! $done ) {
				$progress = 'database' === $state['phase'] ? 20 : ( 'files' === $state['phase'] ? min( 85, 30 + (int) ( $state['files'] / 100 ) ) : 90 );
				$wpdb->update(
					$table,
					array(
						'state'      => wp_json_encode( $state ),
						'progress'   => $progress,
						'updated_at' => current_time( 'mysql', true ),
					),
					array( 'id' => $id )
				);
				wp_schedule_single_event( time() + 2, self::CRON_HOOK, array( $id ) ); }
		} catch ( \Throwable $error ) {
			$wpdb->update(
				$table,
				array(
					'status'        => 'failed',
					'error_message' => sanitize_text_field( $error->getMessage() ),
					'updated_at'    => current_time( 'mysql', true ),
				),
				array( 'id' => $id )
			);
			self::log(
				'error',
				'export_failed',
				array(
					'exportId' => $id,
					'message'  => $error->getMessage(),
				)
			); }
	}

	/** @param array<string,mixed> $state Mutable export state. */
	private static function database_batch( string $id, array &$state ): bool {
		global $wpdb;
		$directory = self::job_directory( $id );
		wp_mkdir_p( $directory );
		$path   = $directory . '/database.sql.gz';
		$handle = gzopen( $path, 0 === (int) $state['tableIndex'] && 0 === (int) $state['offset'] ? 'wb9' : 'ab9' );
		if ( false === $handle ) {
			throw new RuntimeException( 'Could not create compressed database export.' );
		}
		$tables     = $wpdb->get_col( 'SHOW TABLES' );
		$started    = microtime( true );
		$batch_size = 250;
		while ( isset( $tables[ (int) $state['tableIndex'] ] ) && microtime( true ) - $started < self::BATCH_SECONDS ) {
			$table = (string) $tables[ (int) $state['tableIndex'] ];
			if ( 0 === (int) $state['offset'] ) {
				$create = $wpdb->get_row( 'SHOW CREATE TABLE `' . esc_sql( $table ) . '`', ARRAY_N );
				gzwrite( $handle, "DROP TABLE IF EXISTS `{$table}`;\n" . (string) ( $create[1] ?? '' ) . ";\n" ); }
			$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM `' . esc_sql( $table ) . '` LIMIT %d OFFSET %d', $batch_size, (int) $state['offset'] ), ARRAY_A );
			foreach ( $rows as $row ) {
				$columns = array_map( static fn ( int|string $column ) => '`' . str_replace( '`', '``', (string) $column ) . '`', array_keys( $row ) );
				$values  = array_map( static fn ( $value ) => null === $value ? 'NULL' : "'" . esc_sql( (string) $value ) . "'", array_values( $row ) );
				gzwrite( $handle, 'INSERT INTO `' . $table . '` (' . implode( ',', $columns ) . ') VALUES (' . implode( ',', $values ) . ");\n" ); }
			$state['offset'] += count( $rows );
			if ( count( $rows ) < $batch_size ) {
				++$state['tableIndex'];
				$state['offset'] = 0; }
		}
		gzclose( $handle );
		if ( ! isset( $tables[ (int) $state['tableIndex'] ] ) ) {
			self::append_checksum( $id, 'database.sql.gz', $path );
			$state['phase'] = 'files';
			return false;
		} return false;
	}

	/** @param array<string,mixed> $state Mutable export state. */
	private static function files_batch( string $id, array &$state ): bool {
		$directory    = self::job_directory( $id );
		$archive_path = $directory . '/openpreflight-export.zip';
		$zip          = new ZipArchive();
		if ( true !== $zip->open( $archive_path, ZipArchive::CREATE ) ) {
			throw new RuntimeException( 'Could not create export archive.' );
		}
		$settings   = self::settings();
		$referenced = self::referenced_uploads();
		$root       = WP_CONTENT_DIR;
		$iterator   = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $root, RecursiveDirectoryIterator::SKIP_DOTS ) );
		$started    = microtime( true );
		$seen       = 0;
		$processed  = 0;
		foreach ( $iterator as $file ) {
			if ( $seen++ < (int) $state['fileOffset'] ) {
				continue;
			} if ( microtime( true ) - $started >= self::BATCH_SECONDS || $processed >= 300 ) {
				break;
			} ++$state['fileOffset'];
			++$processed;
			if ( ! $file->isFile() || $file->isLink() ) {
				$state['excluded'][] = str_replace( '\\', '/', (string) $file->getPathname() );
				continue; }
			$relative = 'wp-content/' . ltrim( str_replace( '\\', '/', substr( $file->getPathname(), strlen( $root ) ) ), '/' );
			if ( self::excluded( $relative, (array) $settings['exclusions'] ) ) {
				if ( count( $state['excluded'] ) < 500 ) {
					$state['excluded'][] = $relative;
				} continue; }
			if ( str_starts_with( $relative, 'wp-content/uploads/' ) ) {
				$upload_relative = substr( $relative, strlen( 'wp-content/uploads/' ) );
				if ( 'none' === $settings['uploads_mode'] || ( 'referenced-only' === $settings['uploads_mode'] && ! isset( $referenced[ $upload_relative ] ) ) ) {
					if ( count( $state['excluded'] ) < 500 ) {
						$state['excluded'][] = $relative;
					} continue;
				} if ( 'recent' === $settings['uploads_mode'] && $file->getMTime() < time() - 90 * DAY_IN_SECONDS ) {
					continue;
				}
			}
			$size = $file->getSize();
			++$state['files'];
			$state['bytes'] += $size;
			if ( $state['files'] > self::MAX_FILES || $state['bytes'] > self::MAX_BYTES ) {
				throw new RuntimeException( 'Export safety limit exceeded. Reduce included uploads.' );
			}
			if ( ! $zip->addFile( $file->getPathname(), $relative ) ) {
				throw new RuntimeException( 'Could not add a file to the export archive.' );
			} self::append_checksum( $id, $relative, $file->getPathname() );
		}
		$zip->close();
		if ( $processed < 300 && microtime( true ) - $started < self::BATCH_SECONDS ) {
			$state['phase'] = 'finalize';
		} return false;
	}

	/** @param array<string,mixed> $state Mutable export state. */
	private static function finalize( string $id, array &$state ): bool {
		global $wpdb, $wp_version;
		$directory = self::job_directory( $id );
		$checksums = $directory . '/checksums.json';
		self::close_checksums( $id );
		$checksum_digest = hash_file( 'sha256', $checksums );
		$theme           = wp_get_theme();
		$manifest        = array(
			'schemaVersion'      => '1.0',
			'createdAt'          => gmdate( 'c' ),
			'wordpressVersion'   => (string) $wp_version,
			'phpVersion'         => PHP_VERSION,
			'databaseType'       => 'mysql',
			'databaseVersion'    => $wpdb->db_version(),
			'siteType'           => 'single',
			'activeTheme'        => array(
				'slug'    => $theme->get_stylesheet(),
				'version' => $theme->get( 'Version' ),
			),
			'plugins'            => array(),
			'muPlugins'          => array_keys( get_mu_plugins() ),
			'contentDirectories' => array( 'wp-content/plugins', 'wp-content/themes', 'wp-content/mu-plugins', 'wp-content/uploads' ),
			'excludedPaths'      => array_values( array_unique( (array) $state['excluded'] ) ),
			'archiveChecksum'    => $checksum_digest,
		);
		file_put_contents( $directory . '/manifest.json', wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ), LOCK_EX );
		file_put_contents(
			$directory . '/export-report.json',
			wp_json_encode(
				array(
					'schemaVersion'     => '1.0',
					'uploadsMode'       => self::settings()['uploads_mode'],
					'filesIncluded'     => $state['files'],
					'bytesIncluded'     => $state['bytes'],
					'warnings'          => $state['warnings'],
					'checksumSemantics' => 'manifest.archiveChecksum is the SHA-256 digest of checksums.json; the status endpoint provides the final archive SHA-256.',
				),
				JSON_PRETTY_PRINT
			),
			LOCK_EX
		);
		$archive = $directory . '/openpreflight-export.zip';
		$zip     = new ZipArchive();
		if ( true !== $zip->open( $archive, ZipArchive::CREATE ) ) {
			throw new RuntimeException( 'Could not finalize export archive.' );
		} foreach ( array( 'manifest.json', 'checksums.json', 'database.sql.gz', 'export-report.json' ) as $file ) {
			$zip->addFile( $directory . '/' . $file, $file );
		} $zip->close();
		$checksum = hash_file( 'sha256', $archive );
		$size     = filesize( $archive );
		if ( false === $checksum || false === $size ) {
			throw new RuntimeException( 'Could not checksum final export archive.' );
		} $wpdb->update(
			$wpdb->prefix . 'openpreflight_exports',
			array(
				'status'           => 'complete',
				'progress'         => 100,
				'state'            => wp_json_encode( $state ),
				'archive_path'     => $archive,
				'archive_checksum' => $checksum,
				'archive_size'     => $size,
				'updated_at'       => current_time( 'mysql', true ),
			),
			array( 'id' => $id )
		);
		self::log(
			'info',
			'export_completed',
			array(
				'exportId' => $id,
				'size'     => $size,
			)
		);
		return true;
	}

	private static function job_directory( string $id ): string {
		if ( ! preg_match( '/^export_[a-f0-9]{32}$/D', $id ) ) {
			throw new RuntimeException( 'Invalid export identifier.' );
		} return self::directory() . '/' . $id; }
	private static function append_checksum( string $id, string $relative, string $path ): void {
		$file   = self::job_directory( $id ) . '/checksums.json';
		$first  = ! file_exists( $file );
		$handle = fopen( $file, $first ? 'xb' : 'ab' );
		if ( false === $handle ) {
			throw new RuntimeException( 'Could not write checksums.' );
		} if ( $first ) {
			fwrite( $handle, "{\n" );
		} else {
			fwrite( $handle, ",\n" );
		}
		fwrite( $handle, wp_json_encode( $relative ) . ':' . wp_json_encode( hash_file( 'sha256', $path ) ) );
		fclose( $handle ); }
	private static function close_checksums( string $id ): void {
		$file = self::job_directory( $id ) . '/checksums.json';
		if ( ! file_exists( $file ) ) {
			file_put_contents( $file, '{' );
		} file_put_contents( $file, "\n}\n", FILE_APPEND | LOCK_EX ); }
	/** @param string[] $patterns Exclusion patterns. */
	private static function excluded( string $path, array $patterns ): bool {
		if ( in_array( basename( $path ), array( 'wp-config.php', '.env', 'debug.log' ), true ) ) {
			return true;
		} foreach ( $patterns as $pattern ) {
			if ( fnmatch( (string) $pattern, $path, FNM_CASEFOLD ) ) {
				return true;
			}
		} return false; }
	/** @return array<string,true> */
	private static function referenced_uploads(): array {
		global $wpdb;
		$paths  = $wpdb->get_col( "SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_key='_wp_attached_file'" );
		$result = array();
		foreach ( $paths as $path ) {
			$path            = ltrim( str_replace( '\\', '/', (string) $path ), '/' );
			$result[ $path ] = true;
			$metadata        = wp_get_attachment_metadata( (int) $wpdb->get_var( $wpdb->prepare( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key='_wp_attached_file' AND meta_value=%s LIMIT 1", $path ) ) );
			if ( is_array( $metadata ) && isset( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) ) {
				foreach ( $metadata['sizes'] as $size ) {
					if ( isset( $size['file'] ) ) {
						$result[ trailingslashit( dirname( $path ) ) . basename( (string) $size['file'] ) ] = true;
					}
				}
			}
		} return $result; }

	/** @return array<string,mixed> */
	public static function status( string $id ): array {
		global $wpdb;
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT id,status,progress,archive_checksum,archive_size,error_message,created_at,updated_at,expires_at FROM {$wpdb->prefix}openpreflight_exports WHERE id=%s", $id ), ARRAY_A );
		if ( ! is_array( $row ) ) {
			throw new RuntimeException( 'Export not found.' );
		} return array(
			'id'          => $row['id'],
			'status'      => $row['status'],
			'progress'    => (int) $row['progress'],
			'checksum'    => $row['archive_checksum'],
			'size'        => $row['archive_size'] ? (int) $row['archive_size'] : null,
			'error'       => $row['error_message'],
			'downloadUrl' => 'complete' === $row['status'] ? rest_url( 'openpreflight/v1/exports/' . rawurlencode( $id ) . '/download' ) : null,
			'createdAt'   => mysql_to_rfc3339( (string) $row['created_at'] ),
			'updatedAt'   => mysql_to_rfc3339( (string) $row['updated_at'] ),
			'expiresAt'   => mysql_to_rfc3339( (string) $row['expires_at'] ),
		); }
	public static function download( string $id ): never {
		global $wpdb;
		$path = $wpdb->get_var( $wpdb->prepare( "SELECT archive_path FROM {$wpdb->prefix}openpreflight_exports WHERE id=%s AND status='complete'", $id ) );
		$resolved_path = realpath( (string) $path );
		$resolved_root = realpath( self::directory() );
		if ( ! is_string( $path ) || ! is_readable( $path ) || ! str_starts_with( false === $resolved_path ? '' : $resolved_path, false === $resolved_root ? 'invalid' : $resolved_root ) ) {
			wp_die( esc_html__( 'Export not found.', 'openpreflight' ), '', array( 'response' => 404 ) );
		} nocache_headers();
		header( 'Content-Type: application/zip' );
		header( 'Content-Disposition: attachment; filename="openpreflight-export-' . rawurlencode( $id ) . '.zip"' );
		header( 'Content-Length: ' . (string) filesize( $path ) );
		header( 'X-Content-Type-Options: nosniff' );
		readfile( $path );
		exit; }
	public static function delete( string $id ): void {
		global $wpdb;
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT archive_path FROM {$wpdb->prefix}openpreflight_exports WHERE id=%s", $id ), ARRAY_A );
		if ( ! is_array( $row ) ) {
			return;
		} $directory = self::job_directory( $id );
		$resolved_directory = realpath( $directory );
		$resolved_root      = realpath( self::directory() );
		if ( is_dir( $directory ) && str_starts_with( false === $resolved_directory ? '' : $resolved_directory, false === $resolved_root ? 'invalid' : $resolved_root ) ) {
			self::remove_tree( $directory );
		} $wpdb->delete( $wpdb->prefix . 'openpreflight_exports', array( 'id' => $id ), array( '%s' ) ); }
	public static function cleanup_expired(): void {
		global $wpdb;
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}openpreflight_exports WHERE expires_at < %s", current_time( 'mysql', true ) ) );
		foreach ( $ids as $id ) {
			self::delete( (string) $id );
		} }
	private static function remove_tree( string $directory ): void {
		$iterator = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $directory, RecursiveDirectoryIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST );
		foreach ( $iterator as $entry ) {
			$entry->isDir() ? rmdir( $entry->getPathname() ) : unlink( $entry->getPathname() );
		} rmdir( $directory ); }
	/** @param array<string,mixed> $context Safe structured log context. */
	private static function log( string $level, string $event, array $context ): void {
		global $wpdb;
		foreach ( $context as $key => $value ) {
			if ( preg_match( '/password|secret|token|authorization|key/i', (string) $key ) ) {
				$context[ $key ] = '[REDACTED]';
			}
		} $wpdb->insert(
			$wpdb->prefix . 'openpreflight_logs',
			array(
				'level'      => $level,
				'event'      => $event,
				'context'    => wp_json_encode( $context ),
				'created_at' => current_time( 'mysql', true ),
			)
		); }
}

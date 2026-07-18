#!/usr/bin/env bash
set -euo pipefail

DB_NAME=${1:?database name required}
DB_USER=${2:?database user required}
DB_PASS=${3:-}
DB_HOST=${4:-127.0.0.1}
WP_VERSION=${5:-7.0}
WP_TESTS_DIR=${WP_TESTS_DIR:-/tmp/wordpress-tests-lib}
WP_CORE_DIR=${WP_CORE_DIR:-/tmp/wordpress}

mysqladmin --host="${DB_HOST}" --user="${DB_USER}" ${DB_PASS:+--password="${DB_PASS}"} create "${DB_NAME}" 2>/dev/null || true
rm -rf "${WP_TESTS_DIR}" "${WP_CORE_DIR}"
mkdir -p "${WP_TESTS_DIR}" "${WP_CORE_DIR}"
curl --fail --location --silent --show-error "https://wordpress.org/wordpress-${WP_VERSION}.tar.gz" | tar -xz --strip-components=1 -C "${WP_CORE_DIR}"
svn export --quiet "https://develop.svn.wordpress.org/tags/${WP_VERSION}/tests/phpunit/includes" "${WP_TESTS_DIR}/includes"
svn export --quiet "https://develop.svn.wordpress.org/tags/${WP_VERSION}/tests/phpunit/data" "${WP_TESTS_DIR}/data"
curl --fail --location --silent --show-error "https://develop.svn.wordpress.org/tags/${WP_VERSION}/wp-tests-config-sample.php" -o "${WP_TESTS_DIR}/wp-tests-config.php"
sed -i "s/youremptytestdbnamehere/${DB_NAME}/; s/yourusernamehere/${DB_USER}/; s/yourpasswordhere/${DB_PASS}/; s|localhost|${DB_HOST}|; s|dirname( __FILE__ ) . '/src/'|'${WP_CORE_DIR}/'|" "${WP_TESTS_DIR}/wp-tests-config.php"
printf 'WordPress %s test library installed at %s\n' "${WP_VERSION}" "${WP_TESTS_DIR}"

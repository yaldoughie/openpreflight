# Development setup

Use Node 24 LTS, pnpm 11, Docker Compose v2, PHP 8.1+, and Composer 2.

```bash
corepack enable
pnpm install --frozen-lockfile
composer install
pnpm exec playwright install chromium
cp .env.example .env
pnpm openpreflight init
pnpm dev
```

The dashboard dev server is `127.0.0.1:5173` and proxies `/api` to 4173. Run the
worker separately. Never point fixtures at production or put exports under Git.
Windows users should use pnpm commands when GNU Make is unavailable.
If `corepack enable` cannot write to a system Node installation, prepend the
repository `scripts` directory to `PATH` and use `pnpm.cmd`; it delegates to the
version pinned in `packageManager` without requiring administrator rights.

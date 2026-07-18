# Installation

Install Node.js 24 LTS, Corepack, Docker Engine/Desktop with Compose v2, 8 GiB
RAM, and at least 10 GiB free disk. PHP 8.1+ and Composer 2 are optional unless
developing the Agent.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm openpreflight init
pnpm openpreflight doctor
docker compose up -d
```

The API binds to `127.0.0.1:4173`. A non-loopback bind is rejected unless
`OPENPREFLIGHT_API_TOKEN` is set; terminate TLS in a trusted reverse proxy. The
credential key is generated at `.openpreflight/credentials.key` with restrictive
permissions and never stored in SQLite. Back it up separately if Agent sources
are configured; losing it makes stored credentials unrecoverable.

Linux x86-64 is the release target. Docker Desktop on macOS, native Windows, and
WSL2 are supported development environments; WSL2 is recommended on Windows.
Run doctor after upgrades. Do not continue when Docker isolation, filesystem,
port, memory, or disk checks fail.

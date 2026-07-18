.PHONY: setup dev test lint typecheck integration e2e demo build package docs clean
setup:
	corepack enable
	pnpm install --frozen-lockfile
	pnpm exec playwright install --with-deps chromium
	docker compose build
	@echo "Next: make dev"
dev:
	pnpm dev
test:
	pnpm test
	composer test
lint:
	pnpm lint
	composer lint
typecheck:
	pnpm typecheck
integration:
	pnpm integration
e2e:
	pnpm e2e
demo:
	pnpm demo
build:
	pnpm build
package:
	pnpm package
docs:
	pnpm docs
clean:
	pnpm clean

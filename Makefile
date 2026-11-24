.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	pnpm install

build: ## Build every package (tsc project references)
	pnpm build

test: ## Run the unit tests
	pnpm test

lint: ## Lint and check formatting
	pnpm lint

format: ## Format and apply safe fixes
	pnpm format

typecheck: ## Type-check every package
	pnpm typecheck

check: ## Full quality round: format, lint, build, site build and link check, test
	pnpm check

clean: ## Remove build output
	rm -rf packages/*/dist packages/*/*.tsbuildinfo website/dist website/.astro

site: ## Website dev server (landing and docs), http://localhost:4321
	pnpm build
	pnpm --dir website dev

site-build: ## Build the website into website/dist and check its links
	pnpm build
	pnpm --dir website build

brand: ## Regenerate brand/, the site icons and the Open Graph card (needs the pinned Chrome)
	pnpm build
	pnpm --dir website brand

test-integration: ## Run integration tests (real Chrome and FFmpeg, serial)
	pnpm test:integration

bench: ## Throughput benchmark against the pinned Remotion (ROADMAP, Performance)
	pnpm --dir tools/oracle-render install --frozen-lockfile
	pnpm --dir tools/benchmark typecheck
	node tools/benchmark/run.ts $(BENCH_ARGS)

.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	pnpm install

# The packages are not on npm yet: these create and refresh a project that installs them from
# tarballs packed from this clone (tools/try/try.ts).
try: ## Create a project from this clone: make try DIR=../my-video [TEMPLATE=basic|blank|captions]
	@test -n "$(DIR)" || { echo "Usage: make try DIR=../my-video [TEMPLATE=basic|blank|captions]"; exit 2; }
	pnpm build
	node tools/try/try.ts "$(DIR)" --template "$(or $(TEMPLATE),basic)"

try-update: ## Repack the packages into a project made by make try and reinstall: make try-update DIR=...
	@test -n "$(DIR)" || { echo "Usage: make try-update DIR=../my-video"; exit 2; }
	pnpm build
	node tools/try/try.ts "$(DIR)" --update

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

brand: ## Regenerate brand/ and the site icons from the mark geometry (needs the pinned Chrome)
	pnpm build
	pnpm --dir website brand

# A directory is called promo too: without .PHONY, make would consider the target up to date.
.PHONY: promo
promo: ## Render the promotional material into promo/out; refreshes the OG card and the README banner
	pnpm build
	pnpm --dir promo render

test-integration: ## Run integration tests (real Chrome and FFmpeg, serial)
	pnpm test:integration

bench: ## Throughput benchmark against the pinned Remotion (ROADMAP, Performance)
	pnpm --dir tools/oracle-render install --frozen-lockfile
	pnpm --dir tools/benchmark typecheck
	node tools/benchmark/run.ts $(BENCH_ARGS)

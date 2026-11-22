.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	pnpm install

build: ## Build every package (tsc project references)
	pnpm build

test: ## Run the unit and integration tests
	pnpm test

lint: ## Lint and check formatting
	pnpm lint

format: ## Format and apply safe fixes
	pnpm format

typecheck: ## Type-check every package
	pnpm typecheck

check: ## Full quality round: format, lint, build, test
	pnpm check

clean: ## Remove build output
	rm -rf packages/*/dist packages/*/*.tsbuildinfo

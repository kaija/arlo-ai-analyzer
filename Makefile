.PHONY: dev build release install clean lint test help

# Default target
.DEFAULT_GOAL := help

## install: Install all dependencies (npm + Rust toolchain check)
install:
	pnpm install

## dev: Run the app in development mode (Tauri dev server)
dev:
	pnpm tauri dev

## build: Build the app for the current platform (debug)
build:
	pnpm tauri build --debug

## release: Build an optimized release bundle
release:
	pnpm tauri build

## build-frontend: Build only the frontend (TypeScript + Vite)
build-frontend:
	pnpm build

## build-rust: Build only the Rust workspace
build-rust:
	cargo build --workspace

## test: Run all tests (Rust + frontend)
test: test-rust test-frontend

## test-rust: Run Rust tests
test-rust:
	cargo test --workspace

## test-frontend: Run frontend unit tests (single run, no watch)
test-frontend:
	pnpm vitest --run

## lint: Lint frontend (tsc) and Rust (clippy)
lint: lint-rust lint-frontend

## lint-rust: Run Clippy on the Rust workspace
lint-rust:
	cargo clippy --workspace -- -D warnings

## lint-frontend: Type-check the TypeScript frontend (including test files)
lint-frontend:
	pnpm tsc --noEmit -p tsconfig.json && pnpm tsc --noEmit -p tsconfig.test.json

## update-openrouter-pricing: Re-fetch OpenRouter model list and regenerate src/lib/openrouter-pricing.ts
update-openrouter-pricing:
	node --experimental-strip-types scripts/fetch-openrouter-pricing.ts

## clean: Remove build artifacts
clean:
	cargo clean
	rm -rf dist node_modules/.cache

## help: Show this help message
help:
	@echo "Usage: make <target>"
	@echo ""
	@grep -E '^## ' Makefile | sed 's/^## /  /'

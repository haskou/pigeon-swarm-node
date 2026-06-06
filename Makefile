all: help

.PHONY: help
help : Makefile
	@sed -n 's/^##\s//p' $<

SHELL := /bin/bash

.PHONY: build build-no-cache start stop shell test lint logs logs-backend init

## build: Build Docker services
build:
	docker compose build

## build-no-cache: Build Docker services without cache
build-no-cache:
	docker compose build --no-cache

## start: Start Docker services
start:
	docker compose up -d

## stop: Stop Docker services
stop:
	docker compose down

## shell: Open a shell in the backend container
shell:
	docker compose exec backend bash

## test: Run the full test suite
test:
	yarn test

## lint: Run lint checks
lint:
	yarn lint

## logs: Follow all Docker logs
logs:
	docker compose logs -f

## logs-backend: Follow backend Docker logs
logs-backend:
	docker compose logs backend -f --no-log-prefix

## init: Build and start Docker services
init: build start

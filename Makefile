all: help

.PHONY : help
help : Makefile
	@sed -n 's/^##\s//p' $<

SHELL := /bin/bash
ROOT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
UID=$(shell id -u)

.PHONY : start

##    build: Build services
build:
	@docker compose build
build-no-cache:
	@docker compose build --no-cache

## start: start docker image
start:
	@docker compose up -d

## down: stops and removes all containers
stop:
	@docker compose down

## remove: stops all containers and delete them
remove:
	@docker compose -f docker-compose.yml rm -s -f

## interactive: runs a container with an interactive shell
interactive:
	-@docker compose exec backend bash

## test: runs a container and execute the tests
test:
	-@docker compose exec backend npm run test

## test-unit: project runs unit tests
test-unit:
	-@yarn test:unit

## test-consumer: runs project consumer tests
test-consumer:start
	-@docker compose exec backend yarn test:consumer

## test-consumer-only: runs project consumer tests tagged with only
test-consumer-only:
	-@docker compose exec backend yarn test:consumer:only

## test-api-only: runs project api tests tagged with only
test-api:
	-@docker compose exec backend npm run test:api

## test-api-only: runs project api tests tagged with only
test-api-only:
	-@docker compose exec backend npm run test:api:only

test-scheduler:
	-@docker compose exec backend npm run test:scheduler

test-scheduler-only:
	-@docker compose exec backend npm run test:scheduler:only

## log: shows up the log
log:
	-@docker compose logs -f

## follow: follows the logs of the backend container
follow:
	-@docker compose logs backend -f --no-log-prefix

init: build start

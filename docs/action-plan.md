# Pigeon Swarm Action Plan

Last updated: 2026-06-05.

Keep this file short. Completed slices should live in Git history, API docs,
OpenAPI, context docs and tests instead of remaining here as stale backlog.

## Current Slice: Startup Sync And Storage Hardening

Goal: keep node startup quiet and scalable while keeping MongoDB projections
fast for the current Discord-like product surface.

Scope:

1. Startup sync fanout:
   - cap startup sync requests per context and globally
   - keep caps configurable through environment variables
   - report omitted request counts in startup logs
   - keep retry behavior for eventual peer discovery
2. Storage performance:
   - keep hot MongoDB reads backed by explicit indexes
   - avoid hydrating IPFS payloads for list/auth checks
   - keep index startup idempotent when an existing named index has stale keys
3. Technical quality:
   - remove avoidable `any`/eslint suppressions from shared bootstrapping code
   - keep shared infrastructure declarations focused
   - maintain direct tests for startup sync policy behavior

Out of scope for this slice:

- forum channels
- large call SFU/relay topology
- frontend contract changes

## Later Slice: Forum Channels

Goal: add forum-style community channels without changing existing text channel
contracts.

Scope:

1. Forum channels:
   - add a community channel type for forum-style posts
   - model each post as a titled topic with replies
   - reuse message permissions, attachments, polls, stickers and moderation
   - keep text channels unchanged

## Later Slice: Startup Sync Hardening

Goal: make startup synchronization scalable, resumable and quiet on larger
networks.

Steps:

1. Persist per-context sync cursors and `lastSyncAt` metadata.
2. Add paginated sync with `limit`, `since`, `before/after` or known-resource
   hints where contexts can grow indefinitely.
3. Return only IPFS candidates/references in sync responses when payloads may be
   large.
4. Add requester-side cutoffs: timeout, max responses and "good enough"
   completion criteria per resource.
5. Add responder-side rate limits per requester/peer and network.
6. Emit WebSocket updates when bootstrap sync registers new local data.
7. Add two-real-node end-to-end coverage for cold start recovery.

## Later Slices

- Posts:
  - publish encrypted or public post payloads through IPFS
  - model author, visibility, attachments and timeline reads
  - reuse identity handles and IPFS media references
- Large group calls:
  - keep current 1to1/group call signaling as the baseline
  - add a relay/SFU topology for larger or unstable group calls
  - select a coordinator node from available peers
  - keep TURN configuration compatible with that future topology
- Identity profile polish:
  - add profile listing/search if product flow needs discovery beyond exact
    handle lookup

## Verification

```bash
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn lint
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test
```

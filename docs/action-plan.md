# Pigeon Swarm Action Plan

Last updated: 2026-05-28.

Keep this file short. Completed slices should live in Git history, API docs,
OpenAPI, context docs and tests instead of remaining here as stale backlog.

## Current Slice: Product Usability For Discord-Like Communities

Goal: add user-facing collaboration primitives that make busy communities easier
to read and navigate without changing the P2P/storage model unnecessarily.

Scope:

1. Threads:
   - let users open a focused discussion from a message
   - support threads in group conversations and community text channels
   - expose thread summaries in message resources without loading full thread
     history
   - emit websocket events when thread messages are created or updated
2. Pins:
   - pin and unpin messages in conversations and community channels
   - return pinned messages through dedicated list endpoints and channel state
   - gate community pins behind message-management permissions
   - sync pin/unpin events between nodes
3. Drafts:
   - store per-identity drafts for conversations and community channels
   - keep drafts out of IPFS
   - sync drafts between the user's nodes only
   - add endpoints to upsert, fetch and delete drafts
4. Forum channels:
   - add a community channel type for forum-style posts
   - model each post as a titled topic with replies
   - reuse message permissions, attachments, polls, stickers and moderation
   - keep text channels unchanged

Out of scope for this slice:

- new infrastructure transports
- changing existing text channel contracts unless needed for shared primitives
- full search/ranking UX beyond the existing search capabilities

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

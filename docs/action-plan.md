# Pigeon Swarm Action Plan

Last updated: 2026-05-20.

Keep this file short. Completed slices should live in Git history, API docs,
OpenAPI, context docs and tests instead of remaining here as stale backlog.

## Current Slice: Community Channel Message Contract

Goal: make community channel messages belong to the channel scope instead of
looking like direct messages with explicit recipients.

Scope:

1. Remove explicit recipient fields from community channel message resources and
   request contracts unless a concrete product flow still needs them.
2. Route websocket events from `communityId` + `channelId`, using community
   membership and future channel permissions as the recipient source.
3. Keep authorization tied to community membership and channel access, not to a
   per-message identity list.
4. Keep encryption ownership scoped to the community/channel key model.
5. Update OpenAPI, `docs/api.md`, frontend handoff docs and context diagrams.
6. Add or adjust API and websocket coverage so community channel messages are
   validated as channel-scoped messages.

Out of scope for this cleanup:

- roles and per-channel permissions beyond preserving the future seam
- changing 1to1 or group conversation message contracts

## Next Slice: Node Network Management

Goal: let node owners fully manage local IPFS networks.

Steps:

1. Add `DELETE /node/networks/{networkId}` or equivalent route.
2. Require owner signed request once the node is owned.
3. Remove the network from MongoDB.
4. Synchronize the runtime IPFS network registry after removal.
5. Add API Cucumber coverage and OpenAPI/docs.

## Later Slice: Startup Sync Hardening

Goal: make startup synchronization scalable, resumable and quiet on larger
networks.

Already improved:

- Startup sync sends heartbeat, waits briefly for peer discovery and then
  publishes sync requests.
- Startup sync schedules retries for late peer discovery.
- Response suppression covers identities, keychains, conversations and
  communities.
- Startup sync exposes a richer startup summary for diagnostics.

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

- Call presence validation:
  - validate call participant heartbeat with two browser clients against one
    node
  - validate call participant heartbeat with two nodes on the same network
- Posts:
  - publish encrypted or public post payloads through IPFS
  - model author, visibility, attachments and timeline reads
  - reuse identity handles and IPFS media references
- Large group calls:
  - keep current 1to1/group call signaling as the baseline
  - add a relay/SFU topology for larger or unstable group calls
  - select a coordinator node from available peers
  - keep TURN configuration compatible with that future topology
- Community roles and moderation:
  - add roles and channel permissions
  - add bans and moderation events
  - keep the current community owner model as the MVP baseline
- Identity profile polish:
  - decide whether handles need reservation/conflict policies across nodes
  - add profile listing/search if product flow needs discovery beyond exact
    handle lookup

## Verification

```bash
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn lint
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test
```

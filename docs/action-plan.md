# Pigeon Swarm Action Plan

Last updated: 2026-05-17.

Keep this file short. Completed slices should live in Git history, API docs,
OpenAPI, context docs and tests instead of remaining here as stale backlog.

## Current Slice: Call Presence Hardening

Goal: make voice-channel and call presence converge quickly when a client drops
without leaving explicitly.

Status:

- [x] Add call participant heartbeat endpoint.
- [x] Expire stale joined participants after a short timeout.
- [x] Emit realtime participant-left events when a stale participant is
  expired.
- [ ] Let CI pass and merge the heartbeat PR.
- [ ] Validate with two browser clients against one node.
- [ ] Validate with two nodes on the same network.

## Next Slice: Sticker Packs

Goal: support Telegram-like sticker packs created inside Pigeon Swarm, synced
between nodes and usable in chats without depending on external sticker
providers.

Scope:

1. Add a `stickers` context with `StickerPack`, `Sticker` and authenticated
   identity sticker libraries.
2. Store sticker media in IPFS through the existing public upload flow and keep
   messages referencing CIDs, not embedded binaries.
3. Add HTTP API:
   - `POST /sticker-packs`
   - `GET /sticker-packs/{packId}`
   - `PATCH /sticker-packs/{packId}`
   - `DELETE /sticker-packs/{packId}`
   - `POST /sticker-packs/{packId}/stickers`
   - `DELETE /sticker-packs/{packId}/stickers/{stickerId}`
   - `GET /stickers/library`
   - `POST /stickers/library/{packId}`
   - `DELETE /stickers/library/{packId}`
4. Add optional discovery for public packs by network only if the first product
   flow needs it.
5. Emit websocket and PubSub events for pack changes and library changes.
6. Document how frontend sends a sticker as encrypted message content using
   `packId`, `stickerId` and `mediaExternalIdentifier`.
7. Enforce sticker media constraints:
   - static stickers: max 512 KB and max 512x512 pixels
   - animated stickers: max 64 KB and max 512x512 pixels
   - video stickers: max 256 KB and max 512x512 pixels
   - every sticker must have at least one associated emoji
8. Add API, unit and consumer coverage with acceptance tests split by route.

Out of scope for the first sticker PR:

- Telegram pack compatibility.
- Marketplace/ranking.
- Private sticker packs with per-recipient encrypted media.

## Next Slice: Identity Presence

Goal: expose identity connection state to clients and other nodes without
storing volatile presence in IPFS.

Scope:

1. Add a `presence` or `identity-presence` context backed by MongoDB only.
2. Track per-identity heartbeat and activity timestamps:
   - frontend heartbeat interval: 10 seconds
   - backend marks an identity disconnected when heartbeat expires
   - backend derives idle state after 5 minutes without user activity while
     heartbeat is still active
3. Support connection statuses:
   - `available`
   - `away`
   - `busy`
   - `disconnected`
   - `invisible`
   - `custom`
4. Support a separate optional custom status message:
   - max 50 characters
   - can be set, replaced or removed
   - does not live in IPFS or identity profile metadata
5. Add signed HTTP API for explicit user-selected state:
   - `GET /presence/{identityId}`
   - `GET /presence?identityIds=...`
   - `PUT /presence/me`
   - `DELETE /presence/me/custom-message`
6. Extend WebSocket client messages with a signed or connection-authenticated
   identity presence heartbeat.
7. Emit WebSocket events when visible presence changes.
8. Synchronize presence events between nodes through network-scoped PubSub:
   - do not publish presence to unrelated networks
   - do not publish invisible as `invisible` to other identities; expose it as
     `disconnected` outside the authenticated identity's own sessions
9. Add a scheduler for heartbeat expiration and derived status transitions.
10. Add API, unit, scheduler and consumer coverage with acceptance tests split
    by route.

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

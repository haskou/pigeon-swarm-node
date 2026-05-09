# PubSub Sync Protocol

Last updated: 2026-05-09.

This document defines the node-to-node anti-entropy protocol. Clients do not
use this contract directly; clients use HTTP and WebSocket APIs exposed by their
selected node.

## Goals

- Recover identity versions and conversation messages missed while a node was
  offline.
- Avoid node-to-node HTTP APIs. Nodes may not know each other's IPs.
- Keep PubSub as coordination only. Immutable documents are still fetched from
  IPFS/Helia and validated by domain services.
- Store local progress, request dedupe and retry state in MongoDB.

## Trust Model

PubSub payloads are hints, not truth.

A node may announce an external identifier, a version, a checkpoint or a message
id. The receiving node must still:

1. Fetch the immutable document from IPFS/Helia.
2. Map the infrastructure document to a domain candidate.
3. Validate signatures, expected identity/conversation membership and version
   or message chain rules.
4. Persist metadata locally only after validation succeeds.

## Topics

Stable topics stay context/version based:

- `pigeon-swarm.identities.v1.announcements`
- `pigeon-swarm.identities.v1.sync`
- `pigeon-swarm.conversations.v1.announcements`
- `pigeon-swarm.conversations.v1.sync`

The message `type` field selects the concrete event/request inside the topic.

## Shared Envelope

Every sync message uses the normal message-bus envelope plus sync attributes.

Required attributes:

- `requestId`: unique id for request/response correlation.
- `fromNodeId`: sender node id.
- `expiresAt`: unix timestamp in milliseconds. Expired messages are ignored.

Optional attributes:

- `replyToNodeId`: intended receiver node id for directed responses. PubSub
  still broadcasts it; receivers filter locally.
- `networkId`: connectivity scope when the request is network-specific.

## Identity Sync

### `identities.v1.identity.sync_requested`

Sent when a node starts, reconnects, detects stale metadata or cannot resolve a
requested identity version.

Attributes:

- `identityId`
- `knownVersion`
- `knownExternalIdentifier`
- `requestId`
- `fromNodeId`
- `expiresAt`

### `identities.v1.identity.sync_available`

Sent by a node that has at least one valid candidate for the requested identity.

Attributes:

- `identityId`
- `version`
- `externalIdentifier`
- `previousExternalIdentifier`
- `requestId`
- `fromNodeId`
- `replyToNodeId`
- `expiresAt`

Receiver behavior:

1. Ignore if `replyToNodeId` exists and does not match the local node.
2. Ignore if the request is expired or already processed.
3. Fetch `externalIdentifier` from IPFS/Helia.
4. Validate identity id, signature and version chain.
5. Store metadata in MongoDB only after validation succeeds.

## Conversation Sync

### `conversations.v1.conversation.sync_requested`

Sent when a node subscribes to a known conversation, reconnects or detects that
its local projection may be missing messages.

Attributes:

- `conversationId`
- `knownMessageIds`
- `knownCheckpoint`
- `limit`
- `requestId`
- `fromNodeId`
- `expiresAt`

`knownCheckpoint` is an infrastructure cursor, not a domain value. It may be a
MongoDB projection cursor or a compact list of known message heads.

### `conversations.v1.conversation.sync_available`

Sent by a node that knows messages after the requested checkpoint.

Attributes:

- `conversationId`
- `messageCandidates`
- `requestId`
- `fromNodeId`
- `replyToNodeId`
- `expiresAt`

Each `messageCandidates` item contains:

- `messageId`
- `messageType`
- `authorIdentityId`
- `createdAt`
- `externalIdentifier`

Receiver behavior:

1. Ignore directed responses for another node.
2. Ignore expired or duplicate responses.
3. Fetch candidate documents from IPFS/Helia.
4. Validate signature, participant membership, message type and edit/delete
   target rules.
5. Store message metadata and update local projections only after validation.

## MongoDB State

TODO: implement concrete repositories.

Suggested collections:

- `processed_domain_events`
  - already used for consumer idempotency by `queueName:eventId`
- `pubsub_sync_requests`
  - request id, type, from node, status, expiration and retry count
- `identity_sync_cursors`
  - identity id, known version, known external identifier and last sync status
- `conversation_sync_cursors`
  - conversation id, known checkpoint, last requested at and last completed at

## Failure Modes

Nobody has the latest identity:

- The requester keeps the highest valid local version.
- The sync request is marked as `waiting_for_peers`.
- A later announcement or response can resume validation.

Only one peer has the latest identity:

- That peer broadcasts `sync_available`.
- The requester fetches and validates the immutable document.
- If valid, local metadata is updated and future reads return the new version.

Offline node starts after a week:

- The node loads local MongoDB cursors.
- It publishes sync requests for owned identities and known conversations.
- Responses are treated as candidates and validated normally.
- If no responses arrive before expiry, cursors remain stale but readable.

## Cucumber Scenarios To Add

- Identity sync returns the highest valid local version when no peer has newer
  data.
- Identity sync converges when only one peer has the latest valid version.
- Conversation sync catches up after missed announcements.
- Duplicate sync responses are ignored by persisted processing cursors.
- Expired sync responses are ignored.

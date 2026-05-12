# PubSub Sync Protocol

Last updated: 2026-05-12.

This document defines the node-to-node anti-entropy protocol. Clients do not
use this contract directly; clients use HTTP and WebSocket APIs exposed by their
selected node.

## Goals

- Recover identity versions and conversation messages missed while a node was
  offline.
- Avoid node-to-node HTTP APIs. Nodes may not know each other's IPs.
- Keep PubSub as coordination only. Immutable documents are still fetched from
  IPFS/Helia and validated by domain services.
- Store local metadata, request suppression and retry state in MongoDB.
- Keep gossip scoped by network. A node publishes an event only on the networks
  carried by the event attributes (`networkId`, `networkIds` or
  `networks[].id`) and ignores hints for unrelated networks.

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
- `pigeon-swarm.keychains.v1.announcements`
- `pigeon-swarm.keychains.v1.sync`
- `pigeon-swarm.conversations.v1.announcements`
- `pigeon-swarm.conversations.v1.sync`
- `pigeon-swarm.nodes.v1.announcements`

The message `type` field selects the concrete event/request inside the topic.

## Shared Envelope

Every sync message uses the normal message-bus envelope plus sync attributes.

Sync request/response attributes:

- `requestId`: unique id for request/response correlation.
- `requesterNodeId`: sender node id for startup/manual sync requests.
- `networkId`: required when the resource is scoped to one network, such as a
  conversation.

Optional attributes:

- `replyToNodeId`: intended receiver node id for directed responses. PubSub
  still broadcasts it; receivers filter locally.
- `knownVersion`: latest local version known by the requester.
- `knownExternalIdentifier`: latest local external identifier known by the
  requester when available.

`requestId` is generated per sync trigger by the requester. Responders use a
suppression tracker to wait a deterministic short delay, cancel their response
when an equivalent `sync_available` is observed first, and respond at most once
per `requestId` and resource.

## Identity Sync

### `identities.v1.identity.sync_requested`

Sent when a node starts, reconnects, detects stale metadata or cannot resolve a
requested identity version.

Attributes:

- `identityId`
- `knownVersion`
- `knownExternalIdentifier`
- `requestId`
- `requesterNodeId`

### `identities.v1.identity.sync_available`

Sent by a node that has at least one valid candidate for the requested identity.

Attributes:

- `identityId`
- `version`
- `externalIdentifier`
- `requestId`
- `version`

Receiver behavior:

1. Mark the `requestId` as available for the identity to suppress duplicate
   local responses.
2. Fetch `externalIdentifier` from IPFS/Helia.
3. Validate identity id, signature and version chain.
4. Store metadata in MongoDB only after validation succeeds.

## Keychain Sync

### `keychains.v1.keychain.sync_requested`

Sent when a node starts, reconnects or wants to verify the latest known
keychain for an identity.

Attributes:

- `ownerIdentityId`
- `knownVersion`
- `requestId`
- `requesterNodeId`

### `keychains.v1.keychain.sync_available`

Sent by a node that has a valid current keychain candidate for the owner.

Attributes:

- `ownerIdentityId`
- `version`
- `externalIdentifier`
- `requestId`

Receiver behavior:

1. Mark the `requestId` as available for the owner identity to suppress
   duplicate local responses.
2. Fetch `externalIdentifier` from IPFS/Helia.
3. Validate owner identity, keychain signature and version chain.
4. Store metadata in MongoDB only after validation succeeds.

## Conversation Sync

### `conversations.v1.conversation.sync_requested`

Sent when a node subscribes to a known conversation, reconnects or detects that
its local projection may be missing messages.

Attributes:

- `conversationId`
- `networkId`
- `requestId`
- `requesterNodeId`

Conversation sync is network-specific. The `networkId` is mandatory and the
request is published only in that network.

### `conversations.v1.conversation.sync_available`

Sent by a node that knows messages after the requested checkpoint.

Attributes:

- `conversationId`
- `networkId`
- `messageCandidates`
- `requestId`

Each `messageCandidates` item contains:

- `messageId`

The message id is enough for the receiver to fetch the immutable message
document through the conversation repository/IPFS path and validate it against
the conversation aggregate.

Receiver behavior:

1. Mark the `requestId` as available for the conversation to suppress duplicate
   local responses.
2. Ignore malformed candidates without a string `messageId`.
3. Fetch candidate documents from IPFS/Helia.
4. Validate signature, participant membership, message type and edit/delete
   target rules.
5. Store message metadata and update local projections only after validation.

## Announcements And Realtime Bridge

Announcement events are also domain events and can be forwarded to local
WebSocket clients after they are accepted locally:

- `identities.v1.identity.was_created`
- `identities.v1.identity.was_updated`
- `keychains.v1.keychain.was_published`
- `conversations.v1.conversation.was_created`
- `conversations.v1.message.was_sent`
- `conversations.v1.message.was_edited`
- `conversations.v1.message.was_deleted`
- `nodes.v1.node.heartbeat.was_sent`

Frontend clients do not consume PubSub directly. They receive filtered
`domain_event` messages from `/ws` and recover missed data through HTTP reads.

## MongoDB State

Implemented state is split by context:

- consumer idempotency is keyed by `queueName:eventId`
- identity metadata indexes identity candidates by id, handle and external id
- keychain metadata indexes candidates by owner identity and version
- conversation metadata indexes conversations and message documents by
  conversation id, message id, network id and invalidation state
- node peer metadata stores last heartbeat per remote node

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

- Identity, keychain, conversation and node heartbeat consumers have Cucumber
  coverage under `tests/consumers/features`.
- Two-node convergence and long-offline recovery still need higher-level
  integration coverage with real independent nodes.

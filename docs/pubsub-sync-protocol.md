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
- `pigeon-swarm.communities.v1.announcements`
- `pigeon-swarm.communities.v1.sync`
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

At process startup the node sends a heartbeat, waits briefly for libp2p peer
discovery, then publishes sync requests. The wait is controlled by
`STARTUP_SYNC_PEER_WAIT_MS`; when unset it defaults to `10000` outside tests and
`0` in tests. Startup sync also schedules retries because peer discovery and
gossip subscription propagation are eventually consistent.

Startup sync is intentionally bounded. The requester emits a deterministic
prefix of known resources instead of flooding large networks with every local
resource at once. Limits are configured with:

- `STARTUP_SYNC_MAX_CONTEXT_REQUESTS`: default per-context request cap.
- `STARTUP_SYNC_MAX_IDENTITY_REQUESTS`
- `STARTUP_SYNC_MAX_KEYCHAIN_REQUESTS`
- `STARTUP_SYNC_MAX_CONVERSATION_REQUESTS`
- `STARTUP_SYNC_MAX_COMMUNITY_REQUESTS`
- `STARTUP_SYNC_MAX_TOTAL_REQUESTS`: final global cap across all startup sync
  requests.

The startup log includes `omittedRequests` so operators can see when the node
has more local sync work than the current startup budget. Scheduled retries
rotate each capped context batch, so later attempts cover resources that were
omitted by earlier attempts while still keeping peer discovery and gossip fanout
quiet under load.

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

## Identity Presence Sync

Presence is volatile Mongo-only state. It is never written to IPFS. The local
node publishes presence updates only to the networks attached to the identity
metadata.

### `presence.v1.identity_presence.was_updated`

Sent when an identity heartbeat changes the visible status, when the user
updates selected presence or custom message, or when the scheduler derives
`away`/`disconnected`.

Attributes:

- `identityId`
- `status`: `available`, `away`, `busy`, `custom`, `disconnected` or
  `invisible`
- `customMessage`
- `lastHeartbeatAt`
- `lastActivityAt`
- `updatedAt`
- `networkIds`

Receiver behavior:

1. Consume the event only on the encrypted/clear pubsub topic for a shared
   network.
2. Store the latest presence in MongoDB.
3. Do not fetch or write IPFS content.
4. Expose `invisible` as `disconnected` to identities other than the owner.

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
- `reactionCandidates`
- `requestId`

Each `messageCandidates` item contains:

- `messageId`

The message id is enough for the receiver to fetch the immutable message
document through the conversation repository/IPFS path and validate it against
the conversation aggregate.

Each `reactionCandidates` item contains MongoDB-only reaction metadata:

- `messageId`
- `authorId`
- `emoji`
- `createdAt`

Reaction candidates are not fetched from IPFS. They are accepted only after the
receiver verifies that the conversation exists locally, the author is a
participant and the target message is present.

Receiver behavior:

1. Mark the `requestId` as available for the conversation to suppress duplicate
   local responses.
2. Ignore malformed candidates without a string `messageId`.
3. Fetch candidate documents from IPFS/Helia.
4. Validate signature, participant membership, message type and edit/delete
   target rules.
5. Store message metadata and update local projections only after validation.
6. Register valid reaction candidates in MongoDB without rewriting message IPFS
   documents.

## Community Sync

### `communities.v1.community.sync_requested`

Sent when a node starts, reconnects or wants to recover a known community.

Attributes:

- `communityId`
- `networkId`
- `requestId`
- `requesterNodeId`

Community sync is network-specific. The `networkId` is mandatory and the request
is published only in that network.

### `communities.v1.community.sync_available`

Sent by one node that can provide the community snapshot and recent channel
activity. Responders use the same suppression tracker as identities, keychains
and conversations, keyed by `communityId` and `requestId`, to avoid every node
answering the same request.

Attributes:

- `communityId`
- `networkId`
- `community`
- `messageCandidates`
- `reactionCandidates`
- `requestId`

Receiver behavior:

1. Mark the `requestId` as available for the community to suppress duplicate
   local responses.
2. Validate the community primitive shape before saving it.
3. Validate community channel message and reaction primitive shapes before
   storing them.
4. Ignore malformed candidates.

## IPFS Replication Metadata Sync

IPFS replication metadata is MongoDB state. It tracks which CIDs are known to
the replication policy even when the local node is not currently responsible for
holding a replica.

### `ipfs.v1.content.replication.was_registered`

Sent when a node publishes IPFS content and registers it with the replication
policy. The publisher emits one event per target network. Each event carries
only that delivery network in `networkIds`, so peers on a public/shared topic do
not learn private network ids attached to the same CID.

Attributes:

- `cid`
- `context`
- `networkIds`
- `ownerIdentityId`
- `priority`
- `sizeBytes`
- `createdAt`
- `updatedAt`

Receiver behavior:

1. Consume the event only on shared network topics.
2. Store or update the CID metadata in MongoDB.
3. Do not claim a local replica from this event.
4. Let the replication maintenance scheduler decide later whether the local
   node is responsible for fetching/pinning the CID.

### `ipfs.v1.content.replication.was_claimed`

Sent when a node confirms it has a local replica for a CID in one network.

Attributes:

- `cid`
- `networkId`
- `nodeId`
- `claimedAt`

Receiver behavior:

1. Store the replica claim in MongoDB.
2. Use claims only as availability metadata for diagnostics and policy
   decisions.
3. Do not trust the claim as content validation; fetching nodes still validate
   the IPFS document through the owning context.

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
- `conversations.v1.messages.were_read`
- `conversations.v1.message.reaction.was_added`
- `conversations.v1.message.reaction.was_removed`
- `communities.v1.channel.message.reaction.was_added`
- `communities.v1.channel.message.reaction.was_removed`
- `ipfs.v1.content.replication.was_registered`
- `ipfs.v1.content.replication.was_claimed`
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
- unread conversation message flags are Mongo-only projections keyed by
  conversation id, recipient identity id and message id; read announcements
  delete those flags locally and on consuming nodes
- conversation message reactions are MongoDB-only and indexed by conversation
  id, message id, author id and emoji
- community channel message reactions are MongoDB-only and indexed by community
  id, channel id, message id, author id and emoji; community sync responses
  include `reactionCandidates`
- IPFS replication content metadata stores known CIDs, replication context,
  network ids, owner identity and size; replica claims store which node claims
  each CID per network
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

- The node sends a heartbeat and waits briefly for peer discovery.
- It publishes sync requests for known identities, identity networks,
  keychains, conversations and communities.
- Responses are treated as candidates and validated normally.
- If no responses arrive, scheduled startup retries send the same class of
  requests again as peers become available.

## Cucumber Scenarios To Add

- Identity, keychain, conversation and node heartbeat consumers have Cucumber
  coverage under `tests/consumers/features`.
- Two-node convergence and long-offline recovery still need higher-level
  integration coverage with real independent nodes.

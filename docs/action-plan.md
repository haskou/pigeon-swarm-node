# Pigeon Swarm Action Plan

Last updated: 2026-05-08.

Keep this file as a living execution plan: current decisions, done work, next
small slices, and verification. Remove historical noise once it has been
committed.

## Direction

- Each node is a server-capable P2P runtime.
- MongoDB is the node-local store for metadata, lookup indexes, pagination and
  sync cursors.
- IPFS/Helia stores immutable content:
  - identity documents
  - message documents
  - media and binary attachments
- DHT discovers candidate external identifiers and peers.
- PubSub distributes live announcements and integration events.
- Domain truth comes from aggregates, value objects, canonical payloads,
  signatures and domain validation services.
- The existing `DomainEventPublisher` remains the application event port.

## Design Rules

- `Identity` is the aggregate. It owns `version` and
  `previousIdentityExternalIdentifier`.
- `Conversation` is the aggregate root for chat state.
- `Message` is an entity owned by `Conversation`.
- Edits and deletes are new signed messages, never mutations of the original
  message document.
- 1to1 conversations are always encrypted.
- Future public conversations must introduce an explicit public payload policy.
- MongoDB documents, IPFS documents, DHT records and PubSub DTOs are
  infrastructure details.
- Domain repositories expose domain objects only:
  - `IdentityRepository` returns `Identity`.
  - `NodeRepository` returns `Node`.
  - `ConversationRepository` returns `Conversation`.
- Remote content is untrusted until the corresponding domain validation service
  accepts it.
- PubSub is a separate infrastructure capability, not an `IPFS` method.
- Domain language should avoid `CID`. Use context names such as
  `IdentityExternalIdentifier` or `AttachmentExternalIdentifier`; keep content
  addressing vocabulary in infrastructure.

## Done

- MongoDB foundation and Docker Compose service.
- Node metadata migrated from FS/IPFS-style local files to MongoDB.
- Runtime IPFS network registry separated from persisted node metadata.
- Versioned identities with `IdentityExternalIdentifier`.
- Identity documents stored in IPFS and indexed in MongoDB.
- Identity DHT candidate discovery with local-first record lookup.
- Remote identity validation:
  - requested identity id
  - signature
  - version chain
  - broken/tampered candidate invalidation
- Conversation domain foundation:
  - `Conversation`
  - `OneToOneConversation`
  - `Message`
  - `MessageId`
  - `MessageType`
  - `AttachmentExternalIdentifier`
  - message sent/edited/deleted domain events
  - message signature domain service
  - domain errors extend `DomainError`
  - message ids use `ShortId`
  - message payload uses `EncryptedPayload`
- Conversation infrastructure documents and mappers for IPFS message documents
  and Mongo message metadata.
- PubSub foundation:
  - `PubSubTransport`
  - `Libp2pGossipsubMessageBusAdapter`
  - `Libp2pGossipsubTransport`
  - `libp2p-gossipsub://` MessageBus selection
  - standalone libp2p/gossipsub runtime separated from IPFS storage
  - adapter unit tests
- First real PubSub consumer:
  - `RegisterIdentityWhenPublished`
  - `RegisterPublishedIdentity`
  - `RegisterPublishedIdentityMessage`
  - `IdentityRegistrarService`
  - the consumer registers published identities instead of using
    `IdentityFinder`
- Mongo identity metadata no longer stores invalid rows. Broken metadata is
  deleted and invalid remote candidates are rejected before caching.
- Node owner assignment is guarded against being assigned twice.
- `Message` no longer exposes encrypted payload behavior from the base entity;
  only encrypted message variants serialize encrypted payloads.
- Memory message bus now resolves the default exchange before matching
  consumers, so local consumer tests exercise the same publisher contract.
- Libp2p gossipsub uses stable context/version topics such as
  `pigeon-swarm.identities.v1.announcements` instead of service-local exchange
  names, and filters event types inside the topic payload.
- Consumers ignore duplicate in-process deliveries by `queueName:eventId`.

## Next Slice 1: PubSub Runtime Wiring

Goal: make the existing event publisher usable over libp2p gossipsub.

Done:

1. Added a concrete Helia/libp2p implementation of `PubSubTransport`.
2. Registered the transport and `Libp2pGossipsubMessageBusAdapter` in DI.
3. Selected the PubSub adapter through `TRANSPORT_DSN=libp2p-gossipsub://`, keeping
   the application on the existing event publisher/consumer contracts.
4. Added a standalone libp2p/gossipsub runtime for PubSub, without adding
   PubSub methods to the IPFS infrastructure.

Remaining steps:

1. Store PubSub processing cursors in MongoDB so idempotency survives restarts.
2. Add anti-entropy sync for missed PubSub messages.

Keep:

- Application code must stay on the existing event publisher/consumer
  contracts.
- Transport DTOs stay in infrastructure.

Consumers to create under `src/apps/consumers`:

- [x] `pubsub/identities/RegisterIdentityWhenPublished`
  - receives an identity publication announcement
  - calls `RegisterPublishedIdentity`
  - Cucumber coverage asserts registration metadata is restored locally
  - the feature announces the publication after the consumer is running, because
    the in-memory bus does not replay events published before a consumer is
    attached
- [ ] `pubsub/identities/SynchronizeIdentityWhenUpdated`
  - receives an identity update announcement
  - calls the identity application use case that resolves the newest valid
    version chain
- [ ] `pubsub/conversations/RegisterMessageWhenAnnounced`
  - receives a conversation message announcement
  - calls the conversation application use case that fetches, validates and
    stores the message locally
- [ ] `pubsub/conversations/RegisterMessageEditionWhenAnnounced`
  - receives a conversation message edition announcement
  - calls the conversation application use case that fetches, validates and
    stores the edit message locally without mutating the original message
- [ ] `pubsub/conversations/RegisterMessageDeletionWhenAnnounced`
  - receives a conversation message deletion announcement
  - calls the conversation application use case that fetches, validates and
    stores the delete message locally as a tombstone/projection change
- [ ] `pubsub/conversations/SynchronizeConversationWhenMessageMissed`
  - runs anti-entropy for a conversation when a cursor gap, reconnect or missed
    announcement is detected

Tests:

- Unit test the concrete transport with mocked libp2p gossipsub.
- Unit test stable PubSub topic resolution and same-topic event filtering.
- Unit test consumer duplicate delivery handling.
- Unit test `RegisterIdentityWhenPublished`, `RegisterPublishedIdentity` and
  `IdentityRegistrarService`.
- Cucumber: `RegisterIdentityWhenPublished` restores missing local metadata for
  a published identity.
  - Local status: blocked when MongoDB is not listening on `localhost:27017`.
  - Local Docker status: blocked by Docker socket permissions in this
    environment.
  - CI should run this with the MongoDB service from the workflow.
- Cucumber: two nodes receive an identity publication event.
- Cucumber: a missed PubSub message is recovered by anti-entropy sync.

## Next Slice 2: Conversation Encryption Policy

Goal: model encryption as a domain rule of the conversation type.

Steps:

1. Add a `ConversationType` or `ConversationEncryptionPolicy` enum/value
   object.
2. Make message payload kind explicit in the domain.
3. Enforce encrypted payloads for 1to1 conversations.
4. Keep encryption/decryption mechanics in application or infrastructure
   services.
5. Include payload kind and payload value in the canonical signature payload.
6. Update mapper and signature tests.

Tests:

- Unit: 1to1 rejects unencrypted payloads.
- Unit: signed payload changes when payload kind changes.
- Cucumber: 1to1 conversation round-trips encrypted messages.

## Next Slice 3: Conversation Repository And Remote Message Validation

Goal: make 1to1 chat usable through the aggregate boundary.

Steps:

1. Implement `ConversationRepository` infrastructure.
2. Persist immutable message documents in IPFS.
3. Persist message metadata in MongoDB for ordering, pagination and candidate
   validity.
4. Validate remote message candidates before caching:
   - message signature
   - author belongs to the conversation
   - message type is allowed
   - edit/delete target exists and is valid
   - payload policy matches the conversation type
5. Return empty/not found when all remote candidates are invalid.
6. Publish conversation announcements through `DomainEventPublisher`.

Use cases:

- create/get 1to1 conversation
- send message
- edit message
- delete message
- latest messages
- synchronize conversation

Tests:

- Unit: invalid message candidates are rejected before metadata caching.
- Cucumber: latest 50 messages returns external identifiers and ordered
  metadata.
- Cucumber: edit/delete does not mutate the original message document.

## Next Slice 4: Identity And DHT Acceptance Coverage

Goal: prove identity convergence with Cucumber instead of only unit tests.

Scenarios:

- No peer has the latest identity version:
  resolver returns the highest valid locally known version and records a sync
  miss.
- Only one peer has the latest identity version:
  another node discovers it, validates the chain, caches metadata and returns
  the latest identity.
- Multiple peers advertise conflicting identity heads:
  invalid signatures/chains are rejected and the highest valid chain wins.

Run Helia/libp2p scenarios outside the sandbox when local ports or interfaces
are required.

## Last Slice: Client Chat API

Goal: expose chat to clients without leaking node-to-node PubSub as the client
contract.

Steps:

1. Implement HTTP endpoints for conversation commands and reads.
2. Implement WebSocket realtime for client subscriptions.
3. Keep PubSub as node-to-node infrastructure behind `DomainEventPublisher`.
4. Emit WebSocket events only after domain validation and persistence.
5. Filter subscriptions by authenticated identity and known conversations.
6. Keep `docs/api.md` updated as the API contract evolves.

Tests:

- Cucumber: client sends an encrypted 1to1 message and another connected
  client receives it by WebSocket.
- Cucumber: unauthorized conversation subscription is rejected.
- Cucumber: reconnect recovers missed events through HTTP pagination or sync.

## Final Documentation Slice: PubSub Sync Protocol

Goal: document how offline nodes catch up using only PubSub for node-to-node
coordination.

Context:

- Nodes cannot call each other through HTTP APIs.
- Nodes may not know each other's IPs or reachable addresses.
- PubSub is the only live node-to-node coordination channel.
- IPFS/Helia stores immutable content; PubSub only moves announcements,
  requests, responses and candidate external identifiers.

Preliminary protocol ideas to document:

- `conversation.sync.request`
  - sent when a node starts, reconnects or detects a cursor gap
  - includes `requestId`, `conversationId`, `fromNodeId`, known heads and an
    expiration timestamp
- `conversation.sync.response`
  - sent by nodes that know the conversation
  - includes heads/checkpoints, latest known message metadata and the matching
    `requestId`
- `conversation.missing.request`
  - asks for candidate external identifiers after a known cursor/head
  - includes pagination limits to avoid flooding PubSub
- `conversation.missing.response`
  - returns candidate message metadata and external identifiers
  - never acts as truth; receivers still fetch immutable documents from IPFS
    and validate them in domain services
- `identity.sync.request` / `identity.sync.response`
  - equivalent flow for identity version convergence

Documentation TODO:

- define topics for global sync and per-conversation sync
- define DTO schemas separately from WebSocket DTOs
- define request correlation, expiry, dedupe and retry rules
- define MongoDB sync cursor documents
- define `waiting_for_peers` behavior when nobody has the latest data
- define what happens when only one peer has the latest data
- define Cucumber scenarios for offline-week catch-up

## Known Cleanup

- `max-params` warnings:
  - `MessageSent.create` / constructor
  - `MessageEdited.create` / constructor
  - `Identity` constructor
- `MessageSignatureDomainService` exists, but signing still has to be wired
  into send/edit/delete use cases.
- Consider renaming `IpfsIdentityRepository`; it now coordinates IPFS, MongoDB
  metadata and DHT internally.
- Keep checking whether shared validation helpers are truly context-free before
  adding them to shared domain.

## Verification

Before committing code changes, run the relevant focused unit tests and the API
acceptance suite. For broad slices, use:

```bash
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn build
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn lint
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn jest tests/unit/contexts/nodes/domain/Node.spec.ts tests/unit/contexts/nodes/application/assign-owner tests/unit/contexts/nodes/infrastructure/mongo tests/unit/contexts/conversations tests/unit/contexts/identities --runInBand
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test:api
```

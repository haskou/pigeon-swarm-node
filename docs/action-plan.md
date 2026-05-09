# Pigeon Swarm Action Plan

Last updated: 2026-05-09.

Living plan for the next implementation slices. Keep it short: decisions,
current work, verification and the next useful cut.

## Direction

- Each node is a server-capable P2P runtime.
- MongoDB is the node-local store for metadata, lookup indexes, pagination and
  processing/sync cursors.
- IPFS/Helia stores immutable content: identity documents, message documents,
  media and binary attachments.
- PubSub distributes live node-to-node announcements and integration events.
- DHT discovers candidate external identifiers and peers.
- Domain truth comes from aggregates, value objects, canonical payloads,
  signatures and domain validation services.
- The existing `DomainEventPublisher` / `DomainEventConsumer` contracts remain
  the application boundary.

## Design Rules

- `Identity` is the aggregate. It owns `version` and
  `previousIdentityExternalIdentifier`.
- `Conversation` is the aggregate root for chat state.
- `Message` is an entity owned by `Conversation`.
- Edits and deletes are new signed messages, never mutations of the original
  message document.
- 1to1 conversations are always encrypted. Future public conversations must
  introduce an explicit public payload policy.
- MongoDB documents, IPFS documents, DHT records and PubSub DTOs are
  infrastructure details.
- Domain language avoids `CID`. Use names such as
  `IdentityExternalIdentifier` or `AttachmentExternalIdentifier`; content
  addressing vocabulary stays in infrastructure.
- Remote content is untrusted until the corresponding domain validation service
  accepts it.
- PubSub is a separate infrastructure capability, not an `IPFS` method.

## Completed Foundation

- MongoDB foundation and Docker Compose service.
- Node metadata migrated to MongoDB.
- Runtime IPFS network registry separated from persisted node metadata.
- Versioned identities with `IdentityExternalIdentifier`.
- Identity documents stored in IPFS and indexed in MongoDB.
- Identity DHT candidate discovery with local-first record lookup.
- Remote identity validation for requested id, signature, version chain and
  invalid remote candidates.
- Conversation domain foundation with `Conversation`, `OneToOneConversation`,
  `Message`, `MessageId`, `MessageType`, encrypted payloads, message signature
  service and sent/edited/deleted domain events.
- Conversation infrastructure documents and mappers for IPFS message documents
  and Mongo message metadata.
- Standalone libp2p/gossipsub PubSub runtime separated from IPFS storage.
- `libp2p-gossipsub://` MessageBus selection.
- Stable PubSub topics such as
  `pigeon-swarm.identities.v1.announcements`, with event type filtering inside
  the topic payload.
- First real PubSub consumer:
  `pubsub/identities/RegisterIdentityWhenPublished`.

## Current Slice: PubSub Processing Cursors

Goal: make consumer idempotency survive process restarts.

Status:

- [x] Keep in-process duplicate protection by `queueName:eventId`.
- [x] Add MongoDB storage for processed domain events.
- [x] Make the base `Consumer` consult MongoDB when DI is available.
- [x] Run focused unit tests and lint.

Tests:

- Unit: processed event repository marks an event as processed with upsert.
- Unit: processed event repository checks processed/missing events.
- Unit: existing PubSub consumer duplicate delivery behavior still passes.

## Next Slice 1: Identity PubSub Consumer Cohesion

Goal: finish the naming/cohesion cleanup around the first consumer.

Steps:

1. Ensure `RegisterIdentityWhenPublished` performs registration through a
   registration use case, not through a finder.
2. Keep finder use cases read-only.
3. Keep Cucumber coverage for restoring missing local identity metadata from a
   real published identity.
4. Review unresolved PR feedback before opening the next PR.

## Next Slice 2: PubSub Anti-Entropy

Goal: recover missed PubSub events when a node was offline or detects a gap.

Constraints:

- Nodes cannot use each other's HTTP APIs.
- Nodes may not know each other's IPs.
- PubSub is the node-to-node coordination channel.
- IPFS/Helia stores immutable content; PubSub moves announcements, requests,
  responses and candidate external identifiers.

Preliminary protocol:

- `identity.sync.request` / `identity.sync.response` for identity version
  convergence.
- `conversation.sync.request` / `conversation.sync.response` for conversation
  heads/checkpoints.
- `conversation.missing.request` / `conversation.missing.response` for bounded
  pagination of missing candidate message identifiers.
- Responses never become truth directly; receivers still fetch immutable
  documents and validate them in domain services.

Tests to design with Cucumber:

- Nobody has the latest identity version: resolver returns the highest valid
  known version and records a sync miss.
- Only one peer has the latest identity version: another node discovers,
  validates, caches and returns it.
- A node starts after a week offline and recovers missed conversation messages.

## Next Slice 3: Conversation Encryption Policy

Goal: model encryption as a domain rule of the conversation type.

Steps:

1. Add a `ConversationType` or `ConversationEncryptionPolicy` enum/value object.
2. Make message payload kind explicit in the domain.
3. Enforce encrypted payloads for 1to1 conversations.
4. Keep encryption/decryption mechanics in application or infrastructure
   services.
5. Include payload kind and payload value in the canonical signature payload.

Tests:

- Unit: 1to1 rejects unencrypted payloads.
- Unit: signed payload changes when payload kind changes.
- Cucumber: 1to1 conversation round-trips encrypted messages.

## Next Slice 4: Conversation Repository And Remote Message Validation

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

- Cucumber: client sends an encrypted 1to1 message and another connected client
  receives it by WebSocket.
- Cucumber: unauthorized conversation subscription is rejected.
- Cucumber: reconnect recovers missed events through HTTP pagination or sync.

## Verification

Focused commands for this stage:

```bash
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn jest tests/unit/shared/infrastructure/messageBus tests/unit/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished.spec.ts --runInBand
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn lint
```

Broader checks before merge when the slice grows:

```bash
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test:api
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test:consumer
```

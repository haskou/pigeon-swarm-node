# Pigeon Swarm Action Plan

Last updated: 2026-05-07.

This plan starts from the current implementation state. Keep each slice small,
tested and committed with the repository gitmoji conventional-commit format.

## Current Direction

- The node is a server-capable P2P runtime.
- MongoDB is the node-local store for application metadata, lookup indexes and
  sync cursors.
- IPFS/Helia stores immutable content by content address:
  - identity documents
  - message documents
  - media and binary attachments
- DHT/PubSub discover candidate content references, peers and sync
  announcements.
- Domain truth comes from aggregates, value objects, canonical payloads,
  signatures and validation rules.
- The existing `DomainEventPublisher` remains the application event port.
  Helia/libp2p PubSub should be attached as infrastructure behind that port.

## Design Rules

- `Identity` is the aggregate. It owns `version` and a previous identity
  document reference.
- Do not add `IdentityVersion`, `IdentityHead`, `IdentityBlobStore`,
  `MessageBlobStore` or `ConversationMessageIndex` as domain concepts.
- `Conversation` is the aggregate root for chat state.
- `Message` is an entity owned by `Conversation`.
- Edits and deletes are new signed messages, never mutations of the original
  message document.
- MongoDB documents, IPFS documents, DHT records and PubSub DTOs belong to
  infrastructure.
- Domain repositories expose domain objects:
  - `IdentityRepository` returns `Identity`.
  - `NodeRepository` returns `Node`.
  - `ConversationRepository` returns `Conversation`.
- Remote documents fetched from IPFS/DHT are untrusted input until a domain
  service accepts them.
- Conversations are encrypted according to their type.
- For now, 1to1 conversations are always encrypted.
- Public conversations may exist later; that future type can define a public
  payload policy explicitly.
- Domain language should avoid `CID`. Use `content address` in infrastructure
  docs, and use context names such as `IdentityExternalIdentifier` or
  `AttachmentExternalIdentifier` when the domain needs to express a durable
  external link.

## Already Done

- MongoDB foundation:
  - `MongoDB` adapter
  - Mongo dependency and env vars
  - Docker Compose MongoDB service
- Node domain:
  - `Node.assignOwner(owner)`
  - `NodeOwnerAssigner`
  - `MongoNodeMetadataRepository`
  - mapper/repository tests
- Node infrastructure:
  - `MongoNodeMetadataRepository` is the active `NodeRepository` in DI
  - node id, owner and configured network metadata are persisted in MongoDB
  - `IPFSNetworkRegistry` no longer persists `networks.json`
  - `IPFSNetworkRegistry` is runtime-only for active Helia networks, while FS
    remains only for low-level Helia/libp2p runtime data
  - `LocalNodeRepository` and local node metadata mapper/document/spec were
    removed
- Identity:
  - `Identity.version`
  - `Identity.previousIdentityExternalIdentifier`
  - `IdentityExternalIdentifier` value object
  - signed versioned identity payloads
  - `IdentityResolutionDomainService`
  - `MongoIdentityMetadataRepository`
  - IPFS + Mongo metadata + DHT candidate refresh inside
    `IpfsIdentityRepository`
  - stale metadata invalidation
- Conversation domain:
  - `Conversation`
  - `Conversation.toPrimitives()` uses `PrimitiveOf<Conversation>` instead of
    a hand-written primitive interface
  - `OneToOneConversation`
  - `Message`, `MessageSent`, `MessageEdited`, `MessageDeleted`
  - `MessageFactory`
  - `MessageId`
  - `MessageType` enum value object
  - `AttachmentExternalIdentifier` value object for attachment links
  - message primitives use message language: `messages`,
    `previousMessageIds` and `targetMessageId`
  - `ConversationProjectionDomainService`
  - `MessageSignatureDomainService`
  - `ConversationRepository` port
- Conversation infrastructure base:
  - `IpfsMessageDocument`
  - `IpfsMessageMapper`
  - `MongoMessageMetadataDocument`
  - `MongoMessageMetadataMapper`
  - mapper tests
- IPFS record reliability:
  - `HeliaIPFS.getRecord` checks the local datastore before DHT routing
  - `HeliaIPFS.putRecord` persists locally and publishes to DHT as a
    bounded best-effort step
  - `IPFS.getRecordCandidates` collects unique record candidates across
    networks instead of forcing callers to trust the first winner
  - API acceptance steps allow slower Helia/libp2p work without masking hung
    scenarios indefinitely
- Remote identity validation:
  - `IdentityCandidateValidationDomainService` accepts only candidates matching
    the requested `IdentityId`
  - versioned identity candidates must validate their
    `previousIdentityExternalIdentifier` chain before being accepted
  - `IpfsIdentityRepository` marks broken/tampered or wrong-identity
    candidates invalid before caching
  - DHT candidate lookup now fetches and validates all discovered identity
    content references
- PubSub event bus:
  - `PubSubTransport` is a separate infrastructure port, not part of `IPFS`
  - `HeliaPubSubMessageBusAdapter` maps existing domain events to PubSub topics
    through that port
  - DI/runtime wiring and the concrete Helia/libp2p transport remain pending
- Tooling/runtime:
  - Dockerfile and Compose cleanup
  - `yarn build` passes
  - `yarn lint` passes with known `max-params` warnings
  - focused unit tests pass, including shared IPFS infrastructure tests
  - `yarn test:api` passes outside the sandbox

## Immediate Slice 1: PubSub Event Bus

Goal: plug Helia/libp2p PubSub into the existing event publisher/consumer
model before building more chat behavior on top.

Steps:

1. Add a concrete Helia/libp2p implementation of `PubSubTransport`.
2. Register `HeliaPubSubMessageBusAdapter` in DI and select it from
   `TRANSPORT_DSN`.
3. Publish serialized domain/integration events to topics:
   - `pigeon.identities`
   - `pigeon.conversation.{conversationId}`
4. Add idempotent consumers.
5. Store sync cursors in Mongo.
6. Add anti-entropy sync for missed PubSub messages.

Tests:

- Unit test the PubSub adapter with mocked Helia/libp2p PubSub.
- Acceptance-test two nodes receiving an identity publication event.
- Keep transport DTOs in infrastructure; application code continues using the
  existing event publisher/consumer contracts.

## Immediate Slice 2: Conversation Encryption Policy

Goal: model that conversations are encrypted according to their conversation
type.

Steps:

1. Add a domain value object or enum such as `ConversationType` or
   `ConversationEncryptionPolicy`.
2. Replace the hard assumption that all messages use
   `EncryptedMessagePayload`.
3. Enforce that 1to1 conversations only accept encrypted payloads.
4. Leave public/plaintext payload support as an explicit future conversation
   type, not as the default behavior.
5. Keep encryption/decryption mechanics in application/infrastructure services,
   while the domain enforces whether the selected payload kind is allowed by the
   conversation type.
6. Update message signatures so the canonical payload signs the payload kind and
   payload value.
7. Update mapper tests and conversation projection tests.

## Immediate Slice 3: Remote Content Validation

Goal: fix the security issue called out in `IPFS.getRecord`.

Steps:

1. Keep generic integrity helpers in shared domain only if they are genuinely
   context-free:
   - canonical payload hashing
   - signature payload helpers
   - content hash matching
2. Keep context rules in context domain services:
   - conversations validate message signature, author, participants and
     edit/delete target rules
3. Add remote message validation once `ConversationRepository` exists.
4. Return not found/empty when all candidates are invalid.

Tests:

- Unit tests for invalid message candidates once repository exists.
- Cucumber scenarios for DHT identity convergence.

## Immediate Slice 4: Conversation Repository And Use Cases

Goal: make 1to1 chat usable through the aggregate boundary.

Steps:

1. Implement `ConversationRepository` infrastructure.
2. Persist immutable message documents in IPFS.
3. Persist message metadata in Mongo for ordering, pagination and validity.
4. Add use cases:
   - create/get 1to1 conversation
   - send message
   - edit message
   - delete message
   - latest messages
   - synchronize conversation
5. Use the existing `DomainEventPublisher`.

## E2E DHT And Identity Version Scenarios

Add Cucumber scenarios covering:

- no peer has the latest identity version:
  resolver returns the highest valid locally known version and records a sync
  miss
- only one peer has the latest identity version:
  another node discovers it through DHT/peer sync, validates the chain, caches
  metadata and returns the latest identity
- multiple peers advertise conflicting heads:
  invalid signatures/chains are rejected and the highest valid chain wins
- PubSub missed for a 1to1 message:
  anti-entropy sync discovers missing message document references
- 1to1 conversations round-trip encrypted payloads
- future public conversation scenarios should be added only when public
  conversations exist

Run these outside the sandbox when Helia/libp2p needs local interfaces or
ports.

## Known Cleanup

- `max-params` warnings:
  - `MessageSent.create` / constructor
  - `MessageEdited.create` / constructor
  - `Identity` constructor
- `MessageSignatureDomainService` exists but signing is not fully integrated
  into send/edit/delete use cases.
- `IdentityResolutionDomainService` currently chooses from mapped identity
  candidates. Full previous-document-reference chain validation still needs
  infrastructure to provide candidate content-address context without leaking
  IPFS into the aggregate.
- Consider renaming `IpfsIdentityRepository` later because it now coordinates
  IPFS, Mongo metadata and DHT internally.

## Verification Commands

Use the NVM path when needed:

```bash
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn build
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn lint
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn jest tests/unit/contexts/nodes/domain/Node.spec.ts tests/unit/contexts/nodes/application/assign-owner tests/unit/contexts/nodes/infrastructure/mongo tests/unit/contexts/conversations tests/unit/contexts/identities --runInBand
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test:api
```

Notes:

- `yarn test:api` passes outside the sandbox.
- Docker cannot be fully verified in the current environment because the Docker
  socket is not accessible and the CLI lacks `buildx`; `docker compose config`
  was previously verified.

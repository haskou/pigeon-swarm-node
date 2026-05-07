# Pigeon Swarm Action Plan

Last updated: 2026-05-07.

This plan starts from the current implementation state. Keep each slice small,
tested and committed with the repository gitmoji conventional-commit format.

## Current Direction

- The node is a server-capable P2P runtime.
- MongoDB is the node-local store for application metadata, lookup indexes and
  sync cursors.
- IPFS/Helia stores immutable content by CID:
  - identity documents
  - message documents
  - media and binary attachments
- DHT/PubSub discover candidate CIDs, peers and sync announcements.
- Domain truth comes from aggregates, value objects, canonical payloads,
  signatures and validation rules.
- The existing `DomainEventPublisher` remains the application event port.
  Helia/libp2p PubSub should be attached as infrastructure behind that port.

## Design Rules

- `Identity` is the aggregate. It owns `version` and `previousCid`.
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
- A conversation defines whether message payloads are encrypted or plaintext.
  Storage should persist immutable message documents either way.

## Already Done

- MongoDB foundation:
  - `MongoDB` adapter
  - Mongo dependency and env vars
  - Docker Compose MongoDB service
  - bounded Mongo connection timeout for test stability
- Node domain:
  - `Node.assignOwner(owner)`
  - `NodeOwnerAssigner`
  - `MongoNodeMetadataRepository`
  - mapper/repository tests
- Identity:
  - `Identity.version`
  - `Identity.previousCid`
  - signed versioned identity payloads
  - `IdentityResolutionDomainService`
  - `MongoIdentityMetadataRepository`
  - IPFS + Mongo metadata + DHT candidate refresh inside
    `IpfsIdentityRepository`
  - stale metadata invalidation
  - identity creation still works if Mongo metadata cache is unavailable
- Conversation domain:
  - `Conversation`
  - `OneToOneConversation`
  - `Message`, `MessageSent`, `MessageEdited`, `MessageDeleted`
  - `MessageFactory`
  - `MessageEventType` enum value object
  - `ConversationProjectionDomainService`
  - `MessageSignatureDomainService`
  - `ConversationRepository` port
- Conversation infrastructure base:
  - `IpfsMessageDocument`
  - `IpfsMessageMapper`
  - `MongoMessageMetadataDocument`
  - `MongoMessageMetadataMapper`
  - mapper tests
- Tooling/runtime:
  - Dockerfile and Compose cleanup
  - `yarn build` passes
  - `yarn lint` passes with known `max-params` warnings
  - focused unit tests pass
  - `yarn test:api` passes outside the sandbox

## Immediate Slice 1: Move Node Infrastructure Fully To Mongo

Goal: stop using FS/IPFS storage as the source of truth for node application
metadata.

Rationale:

- There is no strong reason to keep `nodeId`, `owner` or configured network
  metadata in FS/IPFS storage.
- Those values are mutable local node metadata, not immutable content-addressed
  documents.
- MongoDB already fits the required access pattern better:
  - one local node metadata document
  - flexible node/network metadata
  - indexes later if the node becomes multi-tenant or multi-network-heavy
- FS should remain only for Helia runtime storage when not using memory mode:
  blockstore/datastore, libp2p runtime files and other low-level IPFS data.

Steps:

1. Make `MongoNodeMetadataRepository` the active `NodeRepository` in DI.
2. Remove `LocalNodeRepository` from the active graph.
3. Move persisted IPFS network configuration out of `IPFSNetworkRegistry` FS
   files and into Mongo-backed node/network metadata.
4. Keep `IPFSNetworkRegistry` focused on runtime registration of active Helia
   networks, not persistence ownership.
5. Add a migration or compatibility path only if existing local
   `node-metadata.json` / network config files must be imported.
6. Delete `LocalNodeRepository`, local node metadata document/mapper and their
   stale docs once Mongo is active and tests pass.
7. Update `NodesClasses.puml` and use-case docs to show Mongo as the only node
   metadata repository.

Tests:

- Unit test `MongoNodeMetadataRepository.loadLocalNode`.
- Unit test `MongoNodeMetadataRepository.saveLocalNode`.
- Add/adjust acceptance coverage for node startup with persisted Mongo node
  metadata.
- Verify `yarn build`, `yarn lint`, focused node tests and `yarn test:api`.

## Immediate Slice 2: Conversation Encryption Policy

Goal: model that conversations can store encrypted or plaintext payloads.

Steps:

1. Add a domain value object or enum such as `ConversationEncryptionPolicy`.
2. Replace the hard assumption that all messages use
   `EncryptedMessagePayload`.
3. Introduce payload modeling that allows:
   - encrypted payload
   - plaintext payload
4. Keep encryption/decryption mechanics in application/infrastructure services,
   while the domain enforces whether the selected payload kind is allowed by the
   conversation policy.
5. Update message signatures so the canonical payload signs the payload kind and
   payload value.
6. Update mapper tests and conversation projection tests.

## Immediate Slice 3: Remote Content Validation

Goal: fix the security issue called out in `IPFS.getRecord`.

Steps:

1. Replace the single-record trust model with candidate discovery:
   - collect one or more record/CID candidates from DHT and peers
   - fetch candidate documents from IPFS
   - map documents to domain objects
   - validate before exposing them to application code
2. Keep generic integrity helpers in shared domain only if they are genuinely
   context-free:
   - canonical payload hashing
   - signature payload helpers
   - content hash matching
3. Keep context rules in context domain services:
   - identities validate id/public key, signature, version and previous CID
     chain
   - conversations validate message signature, author, participants and
     edit/delete target rules
4. Mark invalid identity/message metadata in Mongo.
5. Return not found/empty when all candidates are invalid.

Tests:

- Unit tests for invalid identity candidates.
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

## Immediate Slice 5: PubSub Event Bus

Goal: plug Helia/libp2p PubSub into the existing event publisher/consumer
model.

Steps:

1. Expose PubSub from the Helia runtime adapter.
2. Add a message-bus adapter behind existing event bus contracts.
3. Publish serialized domain/integration events to topics:
   - `pigeon.identities`
   - `pigeon.conversation.{conversationId}`
4. Add idempotent consumers.
5. Store sync cursors in Mongo.
6. Add anti-entropy sync for missed PubSub messages.

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
  anti-entropy sync discovers missing message CIDs
- encrypted and plaintext conversation policies both round-trip

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
  candidates. Full previous-CID chain validation still needs infrastructure to
  provide candidate CID context without leaking IPFS into the aggregate.
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

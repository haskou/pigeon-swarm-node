# Pigeon Swarm Action Plan

This plan is written for an implementation agent. Follow the steps in order and
keep each change small, tested and aligned with DDD boundaries.

## Target Architecture

The node is a server-capable P2P runtime.

- MongoDB is the node-local metadata, lookup and sync state store.
- IPFS/Helia stores immutable identity documents, message event documents and
  media by CID.
- The existing `DomainEventPublisher` publishes local domain events.
- Helia/libp2p PubSub should be plugged in as message-bus infrastructure so
  remote peers can receive the same domain events that local consumers receive.
- DHT helps discover candidate CIDs and peers when local state is missing.
- Domain truth comes from domain objects, canonical payloads, signatures and
  validation rules.

## Design Rules

- Do not create `IdentityVersion`, `IdentityHead`, `IdentityBlobStore`,
  `MessageBlobStore` or `ConversationMessageIndex` as domain concepts.
- `Identity` is the aggregate. Add `version` and `previousCid` to `Identity`
  itself if version ordering is needed.
- `Conversation` is the aggregate root for chat state.
- `MessageEvent` is an entity owned by `Conversation`; messages are not saved
  or queried through an independent domain aggregate.
- MongoDB document indexes and IPFS documents belong to infrastructure.
- Domain repositories expose domain objects:
  - `IdentityRepository` returns `Identity`.
  - `ConversationRepository` returns `Conversation` and reconstitutes its
    message events.
- Repositories may internally use MongoDB, IPFS and DHT.
- Do not create a conversation-specific publisher port. Use the existing
  `DomainEventPublisher` and message bus.
- Edits and deletes are new signed events, never mutations of the original
  message event.
- Every remote document must be mapped to a domain object and validated before
  it affects application behavior.

## Phase 1: MongoDB Foundation

1. Add MongoDB dependency and configuration.
2. Add a shared Mongo connection adapter under `src/shared/infrastructure`.
3. Add environment variables:
   - `MONGO_URL`
   - `MONGO_DATABASE`
4. Wire the adapter through dependency injection.
5. Add unit tests with mocked Mongo collections first.

Expected result:

- Infrastructure can use MongoDB without leaking Mongo types into domain code.

## Phase 2: Node Metadata

1. Keep the current `NodeRepository` interface.
2. Add `Node.assignOwner(identityId)`.
3. Add `NodeOwnerAssigner` use case.
4. Add `MongoNodeRepository` or `MongoNodeMetadataRepository`.
5. Persist:
   - `nodeId`
   - `owner`
   - optional local network metadata
6. Keep `LocalNodeRepository` while migrating. Do not delete it yet.
7. Add tests for owner assignment and repository mapping.

Expected result:

- A local node can load/save metadata through MongoDB.
- A node can be assigned to an identity explicitly.

## Phase 3: Identity as Versioned Aggregate

1. Update `Identity` with:
   - `version: number`
   - `previousCid?: Cid`
2. Include `version` and `previousCid` in the canonical signature payload.
3. Add domain behavior for:
   - profile update
   - network update
   - producing the next signed `Identity`
4. Add `IdentityResolutionDomainService`.
5. The service should:
   - validate signatures
   - reject identities whose id does not match the public key
   - choose the current identity from candidates
   - prefer the highest valid version with a valid previous CID chain
6. Keep the public port as `IdentityRepository`.
7. Extend it only with domain-oriented methods if needed:
   - `findCandidatesById(id): Promise<Identity[]>`

Expected result:

- The domain has no separate identity version/head model.
- Current identity resolution is expressed as domain validation over
  `Identity` candidates.

## Phase 4: Identity Infrastructure

1. Evolve `IpfsIdentityDocument` to include:
   - `_id`
   - `version`
   - `previousCid`
   - `encryptedKeyPair`
   - `networks`
   - `profile`
   - `timestamp`
   - `signature`
2. Add a Mongo identity metadata document, for infrastructure only:
   - `identityId`
   - `cid`
   - `version`
   - `previousCid`
   - `valid`
   - `receivedAt`
3. Implement identity repository behavior inside `IpfsIdentityRepository` or a
   renamed composite repository.
4. `save(identity)` should:
   - map `Identity` to an IPFS document
   - store it in IPFS
   - store CID metadata in MongoDB
   - record/publish an identity domain event through the existing event bus
   - expose the CID through DHT where useful
5. `findById(id)` should:
   - load candidate CIDs from MongoDB
   - discover more candidate CIDs through DHT/peers if needed
   - fetch missing documents from IPFS
   - map documents to `Identity`
   - ask `IdentityResolutionDomainService` to choose the current identity
   - update local metadata

Expected result:

- Infrastructure solves retrieval and storage mechanics.
- Application receives a normal `Identity`.

## Phase 5: Conversation Domain

1. Create `src/contexts/conversations`.
2. Add value objects:
   - `ConversationId`
   - `MessageEventId`
   - `Cid` if no shared value object exists
3. Add `Conversation` aggregate.
4. Add `OneToOneConversation`.
5. Make 1to1 conversation ids deterministic from the sorted pair of identity
   ids.
6. Add `MessageEvent` base entity inside the `Conversation` aggregate.
7. Add event entities:
   - `MessageSent`
   - `MessageEdited`
   - `MessageDeleted`
8. Add `MessageSignatureDomainService`.
9. Add `ConversationProjectionDomainService`.

Expected result:

- The domain models 1to1 conversations and immutable message events without
  Mongo/IPFS concepts.
- Message events depend on `Conversation` for lifecycle, participant checks,
  edit/delete target rules and projection.

## Phase 6: Conversation Port

1. Add `ConversationRepository`.
2. Do not add blob-store, index, message repository or message publisher ports
   to the domain.
3. `ConversationRepository` should expose aggregate-oriented methods:
   - `save(conversation: Conversation)`
   - `findById(conversationId)`
   - `findOneToOne(firstIdentityId, secondIdentityId)`
   - `findEventById(conversationId, eventId)` if an application use case needs
     direct lookup while still loading through the conversation boundary.

Expected result:

- Application services depend on the `Conversation` aggregate boundary only.

## Phase 7: Message Infrastructure

1. Add IPFS message event document:
   - schema version
   - event id
   - conversation id
   - type
   - author id
   - encrypted payload
   - attachment CIDs
   - previous event ids
   - created at
   - signature
2. Add Mongo message metadata document, for infrastructure only:
   - `eventId`
   - `cid`
   - `conversationId`
   - `authorId`
   - `recipientIds`
   - `networkId`
   - `type`
   - `createdAt`
   - `receivedAt`
   - `targetEventId`
   - `valid`
3. Implement message-event persistence inside `ConversationRepository`
   infrastructure, or behind an infrastructure-only `IpfsConversationEventStore`.
4. `save(conversation)` should:
   - map new conversation events to IPFS documents
   - store them in IPFS
   - store metadata in MongoDB
   - keep the conversation aggregate reconstitutable from persisted events
5. Conversation event reads should:
   - use MongoDB metadata for ordering and pagination
   - fetch missing IPFS documents internally
   - map documents to `MessageEvent`
   - attach domain events to `Conversation`
Expected result:

- Messages are immutable IPFS documents.
- MongoDB remains an internal query accelerator.
- Application code works through `Conversation`; `MessageEvent` remains a
  dependent entity.
- Message propagation uses the existing domain event bus.

## Phase 8: 1to1 Use Cases

1. Add `OneToOneConversationCreator`.
2. Add `MessageSender`.
3. Add `MessageReceiver`.
4. Add `LatestMessagesFinder`.
5. Add `MessageEditor`.
6. Add `MessageDeleter`.
7. Add `ConversationSynchronizer`.
8. `MessageSender` flow:
   - load local identity
   - load remote identity
   - load the `Conversation`
   - encrypt payload
   - ask `Conversation` to record a signed `MessageSent`
   - call `ConversationRepository.save`
   - publish `conversation.pullDomainEvents()` with `DomainEventPublisher`
9. `MessageReceiver` flow:
   - receive announcement
   - load the target `Conversation`
   - fetch and map the announced event inside conversation infrastructure
   - ask `Conversation` to accept the validated event
   - call `ConversationRepository.save`
10. `LatestMessagesFinder` flow:
   - load the `Conversation`
   - decrypt payloads
   - apply edits/deletes with `ConversationProjectionDomainService`
   - return current visible messages

Expected result:

- A 1to1 chat works with immutable message documents and local metadata.

## Phase 9: Domain Events, PubSub and Sync

1. Expose libp2p PubSub from the Helia runtime adapter.
2. Add a Helia/libp2p message-bus adapter or bridge for the existing
   `DomainEventPublisher` / `DomainEventConsumer` contracts.
3. The adapter should publish serialized `DomainEvent` messages to PubSub and
   feed received PubSub messages back into the existing consumer flow.
4. Define topics:
   - `pigeon.identities`
   - `pigeon.conversation.{conversationId}`
5. Define domain events or integration event attributes:
   - `IdentityWasPublished(identityId, cid)`
   - `ConversationMessageWasSent(conversationId, eventId, cid)`
   - `ConversationMessageWasEdited(conversationId, eventId, cid)`
   - `ConversationMessageWasDeleted(conversationId, eventId, cid)`
   - `ConversationSyncWasRequested(conversationId, knownEventIds)`
   - `ConversationSyncWasAnswered(conversationId, eventCids)`
6. Keep transport DTOs inside the message-bus adapter.
7. Add idempotent consumers.
8. Store sync cursors in MongoDB.
9. Add anti-entropy sync:
   - request known events
   - compare missing event ids
   - fetch missing CIDs inside conversation infrastructure
   - validate and merge into `Conversation`

Expected result:

- Nodes converge even if PubSub messages are missed.
- Application use cases keep using `DomainEventPublisher`; they do not know
  whether the underlying transport is memory, AMQP or Helia PubSub.

## Phase 10: API

1. Add API routes for:
   - create identity
   - update identity
   - resolve identity
   - create/get 1to1 conversation
   - send message
   - edit message
   - delete message
   - latest messages
2. Keep route bodies separate from domain commands.
3. Add view models that never leak encrypted private keys.

Expected result:

- The node exposes a usable API for identity and 1to1 chat.

## Phase 11: Validation and Tests

1. Unit test domain invariants:
   - identity signatures
   - identity version ordering
   - deterministic 1to1 conversation id
   - message event signatures
   - edit/delete target rules
2. Unit test repositories with mocked IPFS and MongoDB dependencies.
3. Unit test use cases with ports mocked.
4. Unit test the Helia PubSub message-bus adapter with mocked PubSub.
5. Add one sync test:
   - node A sends message
   - node B receives event CID
   - node B fetches event through `ConversationRepository`
   - node B validates and stores metadata by saving `Conversation`
6. Run:
   - lint
   - unit tests
   - build

Expected result:

- The architecture is covered at the domain and application boundary.

## Suggested Implementation Order

1. Add Mongo connection and config.
2. Move node metadata to Mongo behind the existing port.
3. Add `version` and `previousCid` to `Identity`.
4. Encapsulate identity CID discovery inside `IdentityRepository`.
5. Add conversation domain.
6. Add `ConversationRepository` with IPFS message document storage and Mongo metadata.
7. Add send/receive/latest messages use cases.
8. Add Helia PubSub as a message-bus adapter.
9. Add anti-entropy sync.
10. Add HTTP routes.

## Open Decisions

- Exact MongoDB deployment model for local development and production.
- Whether validated ciphertext is cached in MongoDB after IPFS fetch.
- Conversation topic naming and privacy tradeoffs.
- Key exchange protocol for 1to1 encryption.
- Retention policy for IPFS pins and MongoDB metadata.
- Whether to keep the current `IpfsIdentityRepository` name or rename it to
  reflect that it now coordinates IPFS, MongoDB and DHT internally.

## Current Implementation Status

Last updated: 2026-05-07.

### Completed In Working Tree

- Documentation architecture pass:
  - `docs/use-cases.md`
  - `docs/action-plan.md`
  - `docs/flux.puml`
  - `docs/advanced flux.puml`
  - `docs/clases.puml`
  - `src/contexts/identities/_docs/IdentitiesClasses.puml`
  - `src/contexts/nodes/_docs/NodesClasses.puml`
  - `src/contexts/conversations/_docs/ConversationsClasses.puml`
- Docker/env MongoDB base:
  - Added `mongodb` service to `docker-compose.yml`.
  - Added `MONGO_URL` and `MONGO_DATABASE` to `.env.local` and `.env.test`.
  - Added `mongodb@^7.2.0` dependency to `package.json` and `yarn.lock`.
- Shared MongoDB adapter started:
  - `src/shared/infrastructure/mongodb/MongoDB.ts`
- Node owner support:
  - Added `Node.assignOwner(owner)`.
  - Added `NodeOwnerAssigner` use case and message.
  - Added tests for owner assignment.
- Mongo node metadata repository started:
  - `MongoNodeMetadataDocument`
  - `MongoNodeMetadataMapper`
  - `MongoNodeMetadataRepository`
  - Unit tests for mapper and repository.
- Conversation domain initial pass:
  - `Conversation` aggregate root.
  - `OneToOneConversation`.
  - Dependent message event entities:
    - `MessageEvent`
    - `MessageSent`
    - `MessageEdited`
    - `MessageDeleted`
  - `MessageEventFactory`.
  - Value objects:
    - `ConversationId`
    - `MessageEventId`
    - `Cid`
    - `EncryptedMessagePayload`
  - Domain events:
    - `ConversationMessageWasSentEvent`
    - `ConversationMessageWasEditedEvent`
    - `ConversationMessageWasDeletedEvent`
  - Domain services:
    - `ConversationProjectionDomainService`
    - `MessageSignatureDomainService`
  - Conversation repository port.
  - Unit tests for `Conversation` and `OneToOneConversation`.
- Conversation enum cleanup:
  - Replaced plain TypeScript `MessageEventType` with an enum value object from
    `@haskou/value-objects`.
- Identity versioning first pass:
  - Added `version` and `previousCid` to the `Identity` aggregate.
  - Added identity value objects:
    - `IdentityVersion`
    - `IdentityCid`
  - Included `version` and `previousCid` in the canonical identity signature
    payload.
  - Updated `IpfsIdentityDocument` and `IpfsIdentityMapper` to preserve
    `version` and `previousCid`.
  - Added `IdentityResolutionDomainService`.
  - Extended `IdentityRepository` with `findCandidatesById(id)`.
  - Updated `IdentityFinderService` to resolve candidates through the domain
    service.
  - Added `Identity.updateProfile(...)` and `Identity.updateNetworks(...)`.
  - Added `IdentityWasUpdatedEvent`.
  - Updated tests for identity primitives, mapper, repository and resolver.
- Identity Mongo metadata infrastructure:
  - Added `MongoIdentityMetadataDocument`.
  - Added `MongoIdentityMetadataMapper`.
  - Added `MongoIdentityMetadataRepository`.
  - Added unit tests for identity metadata mapper and repository.
- Identity repository composite wiring:
  - `IpfsIdentityRepository.save(identity)` now stores the IPFS document and
    persists the resulting CID in Mongo identity metadata.
  - `findCandidatesById(id)` now loads candidate CIDs from Mongo first.
  - If Mongo has no candidates, the repository falls back to the existing DHT
    record lookup and caches the fetched CID in Mongo metadata.
  - DI now registers Mongo identity metadata mapper/repository and injects the
    metadata repository into `IpfsIdentityRepository`.
- TypeScript/tooling:
  - `tsconfig.json` now uses `es2023` + `dom` libs so ESLint parser accepts the
    project config.
  - Added `src/shared/types/promise-with-resolvers.d.ts` for Helia/libp2p
    typings required by build.
- Docker/local runtime cleanup:
  - `docker-compose.yml` now uses `.env.local` for backend runtime variables.
  - Backend port mapping is aligned with `API_PORT=8080`.
  - `.env.local` now represents local runtime instead of test runtime.
  - `.env` now has concrete fallback values so Compose does not warn about
    unresolved variable interpolation.
  - Dockerfile stages use uppercase `AS`, the final stage uses the bundled
    `pm2-runtime` dependency instead of installing PM2 globally, and final
    runtime loads `.env` by leaving `NODE_ENV` empty.

### In Progress / Needs Cleanup Next

- Review `max-params` warnings:
  - `MessageSent.create` / constructor currently have 8 parameters.
  - `MessageEdited.create` / constructor currently have 8 parameters.
  - `Identity` constructor currently has 8 parameters.
- `MessageSignatureDomainService` currently exists but is not fully integrated
  into `Conversation.send/edit/delete`; signatures are passed in by caller.
  Decide whether signing belongs in application service or domain service
  invocation.
- `MongoNodeMetadataRepository` duplicates network-sync logic from
  `LocalNodeRepository`. Accept short term, but consider extracting a small
  shared infrastructure helper later.
- `IdentityResolutionDomainService` currently resolves the highest valid
  `Identity.version` from already-mapped domain candidates. Previous-CID chain
  validation still needs infrastructure metadata because the aggregate does not
  know its own storage CID.

### Blockers Encountered

- Use NVM when commands cannot find Node/Yarn:
  - `export NVM_DIR="$HOME/.nvm"`
  - `[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"`
  - Current working shortcut:
    `PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH <command>`
- Docker cannot be fully verified in this environment:
  - `/var/run/docker.sock` is owned by `nobody:nobody`.
  - current user groups are `hasko,nobody`, but Docker still returns
    `permission denied while trying to connect to the docker API`.
  - Docker CLI also lacks the `buildx` plugin:
    `docker: unknown command: docker buildx`.
  - `docker compose config` is verified and no longer emits `.env`
    interpolation warnings.
- Jest may need to run outside the sandbox because it opens local ports and can
  fail with `EPERM` inside the sandbox.
- Commits have been made with the repository gitmoji message format.

### Last Verified Checks

- `docker compose config`: pass.
- `yarn build`: pass.
- `yarn lint`: pass with 5 `max-params` warnings.
- Focused Jest command after conversation/node/identity baseline: pass, 16
  suites / 54 tests.
  - `tests/unit/contexts/nodes/domain/Node.spec.ts`
  - `tests/unit/contexts/nodes/application/assign-owner`
  - `tests/unit/contexts/nodes/infrastructure/mongo`
  - `tests/unit/contexts/conversations/domain`
  - `tests/unit/contexts/identities`

### Exact Next Steps

1. Decide how infrastructure supplies candidate own CIDs to validate
   `previousCid` chains without making `Identity` depend on IPFS.
2. Start richer candidate discovery:
   - keep current DHT `getRecord` fallback for the known head.
   - later add peer/DHT candidate expansion when multiple heads are possible.
3. Add metadata invalidation behavior:
   - decide whether failed IPFS fetches mark Mongo identity metadata as invalid
     or bubble the error.
4. Keep running after each slice:
   - `yarn build`
   - `yarn lint`
   - focused Jest command above.
5. Once green and coherent, commit in small conventional commits:
   - `docs: refine p2p identity and conversation architecture`
   - `feat(infra): add mongodb configuration`
   - `feat(nodes): add mongo-backed local node metadata`
   - `feat(conversations): add one-to-one conversation domain`
   - `feat(identities): add versioned identity resolution`

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
- Processed PubSub events are persisted in MongoDB by `queueName:eventId`, while
  retaining in-process duplicate protection.
- `RegisterIdentityWhenPublished` performs registration through
  `RegisterPublishedIdentity`; finder use cases remain read-only.

## Current Slice: Conversation API

Goal: make real 1to1 conversation flows testable through the HTTP API.

Status:

- [x] Add a `CreateOneToOneConversation` application use case.
- [x] Add MongoDB conversation metadata persistence.
- [x] Add `POST /conversations/1to1`.
- [x] Add API documentation and Cucumber coverage for creating a conversation.
- [ ] Add message send/read endpoints.
- [ ] Add WebSocket client realtime.

Keep:

- For now, 1to1 conversations are the only supported conversation type and are
  treated as encrypted by design.
- The future public-conversation policy should be introduced when a second
  conversation type exists.

## Consumer Backlog

Keep consumers thin: receive PubSub/domain events, call an application use case,
and let repositories/domain validation decide what is trustworthy.

- [x] `pubsub/identities/RegisterIdentityWhenPublished`
  - calls `RegisterPublishedIdentity`
  - registers missing local metadata for a published identity
- [ ] `pubsub/identities/SynchronizeIdentityWhenUpdated`
  - receives identity update announcements
  - calls an identity synchronization use case that resolves the newest valid
    version chain
- [ ] `pubsub/identities/RespondToIdentitySyncRequest`
  - receives identity sync requests
  - publishes valid local candidates as sync responses
- [ ] `pubsub/identities/RegisterIdentityWhenSyncAvailable`
  - receives identity sync responses
  - fetches and validates the announced candidate before caching metadata
- [ ] `pubsub/conversations/RegisterMessageWhenAnnounced`
  - receives a sent-message announcement
  - calls the conversation use case that fetches, validates and stores the
    message locally
- [ ] `pubsub/conversations/RegisterMessageEditionWhenAnnounced`
  - receives an edit-message announcement
  - stores the edit as a new immutable message, without mutating the original
- [ ] `pubsub/conversations/RegisterMessageDeletionWhenAnnounced`
  - receives a delete-message announcement
  - stores the delete as a new immutable tombstone/projection event
- [ ] `pubsub/conversations/RespondToConversationSyncRequest`
  - receives conversation sync requests
  - publishes bounded candidate metadata for known messages
- [ ] `pubsub/conversations/RegisterMessagesWhenSyncAvailable`
  - receives conversation sync responses
  - fetches and validates candidate message documents before updating local
    projections

## Next Slice 1: Conversation Messages And Remote Validation

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
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn jest tests/unit/contexts/conversations tests/unit/apps/apis/ApiSwaggerFactory.spec.ts --runInBand
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn lint
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn build
```

Broader checks before merge when the slice grows:

```bash
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test:api
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test:consumer
```

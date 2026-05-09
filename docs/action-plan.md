# Pigeon Swarm Action Plan

Last updated: 2026-05-09.

Living plan for the next implementation slices. Keep it short: decisions,
current work, verification and the next useful cut.

## Direction

- Each node is a server-capable P2P runtime.
- MongoDB is the node-local store for metadata, lookup indexes, pagination and
  processing/sync cursors.
- IPFS/Helia stores immutable content: identity documents, keychain documents,
  message documents, media and binary attachments.
- PubSub distributes live node-to-node announcements and integration events.
- DHT discovers candidate external identifiers and peers.
- Domain truth comes from aggregates, value objects, canonical payloads,
  signatures and domain validation services.
- The existing `DomainEventPublisher` / `DomainEventConsumer` contracts remain
  the application boundary.

## Design Rules

- `Identity` is the public user aggregate. It owns `version` and
  `previousIdentityExternalIdentifier`.
- `Keychain` is the encrypted portable user secret store. Nodes never decrypt
  its payload.
- `Conversation` is the aggregate root for chat state.
- `Message` is an entity owned by `Conversation`.
- Edits and deletes are new signed messages, never mutations of the original
  message document.
- 1to1 conversations are always encrypted. Future public conversations must
  introduce an explicit public payload policy.
- MongoDB documents, IPFS documents, DHT records and PubSub DTOs are
  infrastructure details.
- Domain language avoids `CID`. Use names such as
  `IdentityExternalIdentifier`, `KeychainExternalIdentifier` or
  `AttachmentExternalIdentifier`; content addressing vocabulary stays in
  infrastructure.
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

## Recently Completed

- Keychain aggregate, IPFS documents, MongoDB metadata and validation services.
- `POST /keychains` for publishing encrypted keychain versions.
- Signed HTTP request verification for implemented API commands.
- Keychain API Cucumber coverage.

## Current Slice: Conversation Messages API

Goal: make the first real 1to1 chat loop usable through HTTP.

Status:

- [x] Add `POST /conversations/{conversationId}/messages`.
- [x] Store immutable encrypted message documents in IPFS.
- [x] Store message metadata in MongoDB for ordering and pagination.
- [x] Publish `ConversationMessageWasSentEvent`.
- [x] Add `GET /conversations/{conversationId}/messages`.
- [x] Support `limit` and `beforeMessageId` pagination.
- [x] Add Cucumber coverage for send/list and `beforeMessageId` pagination.
- [x] Update OpenAPI and API docs.

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

## Next Slice 1: Signed HTTP Requests Hardening

Goal: authenticate API calls without passwords or JWT sessions.

Steps:

1. Define canonical request payload:
   - method
   - path
   - timestamp
   - nonce
   - body hash
2. Verify `X-Identity-Id`, `X-Timestamp`, `X-Nonce` and `X-Signature`.
3. Store recent nonces in MongoDB to prevent replay.
4. Add Cucumber coverage for accepted, invalid and replayed signed requests.

## Next Slice 2: Conversation Remote Validation

Goal: make 1to1 chat usable through the aggregate boundary.

Steps:

1. Validate remote message candidates before caching:
   - message signature
   - author belongs to the conversation
   - message type is allowed
   - edit/delete target exists and is valid
   - payload policy matches the conversation type
2. Return empty/not found when all remote candidates are invalid.
3. Publish conversation announcements through `DomainEventPublisher`.
4. Add PubSub consumer coverage for sent-message announcements.

Use cases:

- get/list 1to1 conversations
- edit message
- delete message
- synchronize conversation

## Next Slice 3: Keychain Consumers

Goal: register and synchronize published keychain candidates from PubSub.

Steps:

1. Add `register published keychain candidate` application use case.
2. Add `find current keychain for authenticated identity` application use case.
3. Add PubSub consumers:
   - `pubsub/keychains/RegisterKeychainWhenPublished`
   - `pubsub/keychains/SynchronizeKeychainWhenUpdated`
4. Add Cucumber coverage for consumer registration.

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
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn jest tests/unit/contexts/keychains --runInBand
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn lint
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn build
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test
```

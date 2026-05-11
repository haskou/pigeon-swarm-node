# Pigeon Swarm Action Plan

Last updated: 2026-05-11.

Keep this file short. Completed slices should move into Git history, API docs
and tests instead of staying here as long-form notes.

## Current Slice: Signed Message And Request Hardening

Goal: authenticate API calls without passwords or JWT sessions and reject
tampered conversation messages.

Status:

- [x] Verify canonical signed HTTP requests.
- [x] Store used nonces in MongoDB per identity.
- [x] Reject stale signed request timestamps.
- [x] Validate sent-message signatures against the canonical message payload.
- [x] Move client-generated message `id` and `createdAt` into the send-message
  request so the client can sign the final immutable message shape.
- [x] Align `POST /conversations` request naming with response naming:
  `participantIds`.
- [x] Add Cucumber coverage for invalid message signatures, replayed nonces and
  expired timestamps.
- [x] Update OpenAPI and API docs.

## Consumer Backlog

Keep consumers thin: receive PubSub/domain events, call an application use case,
and let repositories/domain validation decide what is trustworthy.

- [x] `pubsub/identities/RegisterIdentityWhenPublished`
  - calls `RegisterPublishedIdentity`
  - registers missing local metadata for a published identity
- [x] `pubsub/identities/SynchronizeIdentityWhenUpdated`
  - receives identity update announcements
  - calls an identity synchronization use case that resolves the newest valid
    version chain
- [x] `pubsub/identities/RespondToIdentitySyncRequest`
  - receives identity sync requests
  - publishes valid local candidates as sync responses
- [x] `pubsub/identities/RegisterIdentityWhenSyncAvailable`
  - receives identity sync responses
  - fetches and validates the announced candidate before caching metadata
- [x] `pubsub/conversations/RegisterMessageWhenAnnounced`
  - receives a sent-message announcement
  - calls the conversation use case that fetches, validates and stores the
    message locally
- [x] `pubsub/conversations/RegisterMessageEditionWhenAnnounced`
  - receives an edit-message announcement
  - stores the edit as a new immutable message, without mutating the original
- [x] `pubsub/conversations/RegisterMessageDeletionWhenAnnounced`
  - receives a delete-message announcement
  - stores the delete as a new immutable tombstone/projection event
- [x] `pubsub/conversations/RespondToConversationSyncRequest`
  - receives conversation sync requests
  - publishes bounded candidate metadata for known messages
- [x] `pubsub/conversations/RegisterMessagesWhenSyncAvailable`
  - receives conversation sync responses
  - fetches and validates candidate message documents before updating local
    projections

## Next Slice 1: Conversation Remote Validation

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

## Next Slice 2: Keychain Consumers

Goal: register and synchronize published keychain candidates from PubSub.

Steps:

1. Add `register published keychain candidate` application use case.
2. Add `find current keychain for authenticated identity` application use case.
3. Add PubSub consumers:
   - `pubsub/keychains/RegisterKeychainWhenPublished`
   - `pubsub/keychains/SynchronizeKeychainWhenUpdated`
   - `pubsub/keychains/RespondToKeychainSyncRequest`
   - `pubsub/keychains/RegisterKeychainWhenSyncAvailable`
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

## Next Slices

- Conversation invitations/notifications:
  - create a notification/invitation context for conversation membership offers
  - publish `new_conversation` invitations for invitees
  - include encrypted conversation-key envelopes per invitee
  - let invitees accept or decline before joining
  - store read state as conversation membership state, not keychain data
- Conversation remote validation:
  - validate remote message candidates before caching
  - reject candidates with invalid signatures, authors, targets or payload policy
  - publish conversation announcements through `DomainEventPublisher`
  - add PubSub consumer coverage for sent-message announcements
- Keychain consumers:
  - register published keychain candidates from PubSub
  - synchronize keychain updates from PubSub
- Client realtime:
  - expose WebSocket subscriptions behind node-side validation
  - recover missed events through HTTP pagination or sync

## Verification

```bash
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test
```

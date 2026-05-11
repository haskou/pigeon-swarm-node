# Pigeon Swarm API

Last updated: 2026-05-09.

This document is intentionally incomplete. It captures the intended API shape
before implementation so the client contract does not leak P2P infrastructure.

## Principles

- Clients talk to their selected node through HTTP and WebSocket.
- Nodes talk to other nodes through PubSub, DHT and IPFS/Helia.
- The browser/mobile client must not subscribe directly to the node-to-node
  PubSub mesh.
- The node filters permissions before pushing realtime events to a client.
- HTTP commands create validated domain changes.
- WebSocket events notify already accepted or synchronized changes.
- IPFS external identifiers may appear in API responses only as opaque external
  identifiers, never as domain concepts.
- Node-to-node missed-message recovery is documented separately in
  [PubSub Sync Protocol](pubsub-sync-protocol.md).
- Keychain design is documented separately in [Keychains](keychains.md).

## Authentication

Mutating endpoints are authenticated by a canonical request
signature:

```http
X-Identity-Id: <identityId>
X-Timestamp: <timestamp>
X-Nonce: <nonce>
X-Signature: <signature>
```

Implemented:

- canonical request payload: method, path, timestamp, nonce and body hash
- recent nonces in MongoDB to prevent replay
- timestamp freshness validation
- Cucumber scenarios for invalid, replayed and stale signed requests

## Node HTTP API

### Get local node

```http
GET /node
```

Response:

```json
{
  "id": "<nodeId>",
  "owner": "<identityId>"
}
```

Implemented:

- return the local node id
- return the owner when the node has already been claimed
- keep networks out of this response

### Get local node networks

```http
GET /node/networks
```

Response:

```json
{
  "networks": [
    {
      "id": "<networkId>",
      "name": "public",
      "key": "<optionalPrivateNetworkKey>"
    }
  ]
}
```

Implemented:

- return the networks configured for the local node

### Add local node network

```http
POST /node/networks
```

Request:

```json
{
  "id": "<networkId>",
  "name": "private",
  "key": "<optionalPrivateNetworkKey>"
}
```

Implemented:

- allow unsigned network additions while the node has no owner
- require signed request auth from the owner after the node is claimed
- persist the network in MongoDB
- synchronize the runtime IPFS network registry after saving

### Put local node owner

```http
PUT /node/owner
```

Request:

```json
{
  "identityId": "<newOwnerIdentityId>"
}
```

Implemented:

- claim an unowned node as the authenticated identity
- change the owner only when the request is signed by the current owner
- persist owner state in MongoDB
- load persisted node state when the API process starts

## Identity HTTP API

### Get identity

```http
GET /identities/{identityId}
```

Implemented:

- resolve the latest valid known identity candidate
- return profile, networks, version, previous identity reference and signature

## Keychain HTTP API

The node stores and announces encrypted keychain documents. It must never
receive the keychain password and must never decrypt the payload.

### Publish keychain version

```http
POST /keychains
```

Request:

```json
{
  "version": 1,
  "previousKeychainExternalIdentifier": null,
  "encryptedPayload": "TODO",
  "signature": "TODO"
}
```

Response:

```json
{
  "ownerIdentityId": "TODO",
  "version": 1,
  "keychainExternalIdentifier": "TODO"
}
```

Implemented:

- validate owner identity from the signed request
- validate keychain signature and version chain
- persist immutable encrypted document in IPFS
- persist metadata in MongoDB
- publish keychain announcement through the domain event publisher

### Get current keychain

```http
GET /keychains/{identityId}
```

Response:

```json
{
  "ownerIdentityId": "TODO",
  "version": 1,
  "keychainExternalIdentifier": "TODO",
  "encryptedPayload": "TODO",
  "signature": "TODO"
}
```

Implemented:

- only return the authenticated identity keychain
- resolve latest valid candidate from local MongoDB and DHT candidates
- return encrypted payload as-is for client-side unlock/decryption

TODO:

- include future sync data once node-to-node anti-entropy exists

## Conversation HTTP API

Implemented mutating endpoints use signed HTTP requests with `X-Identity-Id`,
`X-Timestamp`, `X-Nonce` and `X-Signature`.

### List conversations

```http
GET /conversations?limit=20&beforeConversationId=TODO
```

Implemented:

- require signed request auth
- list conversations where the authenticated identity participates
- support `limit` and `beforeConversationId`

TODO:

- define unread counters
- define last message projection
- define sync status projection

### Create a 1to1 conversation

```http
POST /conversations
```

Request:

```json
{
  "type": "one-to-one",
  "participantIds": ["<authenticatedIdentityId>", "<participantIdentityId>"],
  "keychainExternalIdentifier": "<externalIdentifier>"
}
```

Response:

```json
{
  "id": "one-to-one:<deterministic-id>",
  "participantIds": ["<authenticatedIdentityId>", "<participantIdentityId>"],
  "type": "one-to-one"
}
```

Implemented:

- create the one-to-one conversation for the participant pair
- validate that the keychain candidate belongs to the authenticated identity
- persist conversation metadata in MongoDB
- publish `ConversationWasCreatedEvent`

TODO:

- define error when remote identity cannot be resolved
- define encryption setup and key exchange boundary inside the client keychain
- define how the receiver discovers or registers the conversation from PubSub

### Get latest messages

```http
GET /conversations/{conversationId}/messages?limit=50&beforeMessageId=TODO
```

Response:

```json
{
  "conversationId": "one-to-one:<deterministic-id>",
  "messages": [
    {
      "id": "TODO",
      "type": "sent",
      "authorIdentityId": "TODO",
      "createdAt": 1773848829055,
      "encryptedPayload": "TODO",
      "previousMessageIds": [],
      "attachmentExternalIdentifiers": []
    }
  ],
  "nextBeforeMessageId": "TODO"
}
```

Implemented:

- require signed request auth
- return the latest messages ordered from oldest to newest in the page
- when `beforeMessageId` is provided, return messages older than that message

TODO:

- define whether payload should stay inline or become lazy by external
  identifier for large payloads
- define tombstone projection for deleted messages
- define edited message projection
- define attachment metadata projection

### Send message

```http
POST /conversations/{conversationId}/messages
```

Request:

```json
{
  "id": "<clientGeneratedMessageId>",
  "createdAt": 1773848829055,
  "encryptedPayload": "TODO",
  "signature": "TODO",
  "attachmentExternalIdentifiers": ["TODO"]
}
```

Response:

```json
{
  "id": "TODO",
  "conversationId": "one-to-one:<deterministic-id>",
  "authorIdentityId": "TODO",
  "type": "sent",
  "createdAt": 1773848829055,
  "encryptedPayload": "TODO",
  "previousMessageIds": [],
  "attachmentExternalIdentifiers": []
}
```

Implemented:

- enforce encrypted payloads for 1to1 conversations
- validate the signature against the canonical message payload
- persist immutable message document in IPFS
- persist message metadata in MongoDB
- publish `ConversationMessageWasSentEvent`

TODO:

- define attachment upload flow

Signed HTTP request validation:

- reject reused `X-Nonce` values per identity
- reject stale `X-Timestamp` values outside the freshness window

## Notification HTTP API

Notifications are for actionable events that require client-side identity
material, such as accepting a conversation invitation. Message delivery does
not create notifications.

### List notifications

```http
GET /notifications?limit=20&beforeNotificationId=TODO
```

Implemented:

- require signed request auth
- return notifications where the authenticated identity is the recipient
- exclude archived notifications
- support `limit` and `beforeNotificationId`

### Create a conversation invitation notification

```http
POST /notifications
```

Request:

```json
{
  "type": "conversation_invitation",
  "conversationId": "one-to-one:<deterministic-id>",
  "inviterIdentityId": "<aliceIdentityId>",
  "recipientIdentityId": "<bobIdentityId>",
  "encryptedConversationKey": "<encryptedForBob>",
  "keyEncryptionAlgorithm": "rsa-oaep-sha256",
  "signature": "<inviterSignature>"
}
```

Implemented:

- require signed request auth from the inviter
- persist the notification in MongoDB
- store encrypted key material as opaque payload only
- keep private keys and decrypted conversation keys out of the backend

### Update a notification

```http
PATCH /notifications/{notificationId}
```

Accept request:

```json
{
  "state": "accepted",
  "keychainExternalIdentifier": "<updatedRecipientKeychain>"
}
```

Decline request:

```json
{
  "state": "declined"
}
```

Implemented:

- require signed request auth from the recipient
- allow recipient-only accept and decline
- mark accepted or declined notifications as read
- store the recipient keychain external identifier when accepted

### Edit message

```http
PATCH /conversations/{conversationId}/messages/{messageId}
```

TODO:

- model edit as a new immutable message document
- define author-only rule
- define editable message types
- define projection returned to clients

### Delete message

```http
DELETE /conversations/{conversationId}/messages/{messageId}
```

TODO:

- model delete as a new immutable message document
- define author-only rule
- define tombstone behavior
- define whether attachments are unpinned locally

### Synchronize conversation

```http
POST /conversations/{conversationId}/sync
```

TODO:

- define anti-entropy strategy
- define response when no peer has missing messages
- define response when only one peer has missing messages
- define sync cursor persistence

## Realtime WebSocket API

```http
GET /realtime
```

TODO:

- define authentication handshake
- define reconnect behavior
- define heartbeat/ping interval
- define event ack format
- define backpressure strategy

### Subscribe to a conversation

Client message:

```json
{
  "type": "conversation.subscribe",
  "conversationId": "TODO"
}
```

Server response:

```json
{
  "type": "conversation.subscribed",
  "conversationId": "TODO"
}
```

TODO:

- reject subscriptions when the authenticated identity is not a participant
- decide if subscribing triggers a sync
- decide if subscriptions survive reconnect by session id

### Conversation events

Server messages:

```json
{
  "type": "message.sent",
  "conversationId": "TODO",
  "messageId": "TODO",
  "externalIdentifier": "TODO"
}
```

```json
{
  "type": "message.edited",
  "conversationId": "TODO",
  "messageId": "TODO",
  "targetMessageId": "TODO",
  "externalIdentifier": "TODO"
}
```

```json
{
  "type": "message.deleted",
  "conversationId": "TODO",
  "messageId": "TODO",
  "targetMessageId": "TODO",
  "externalIdentifier": "TODO"
}
```

```json
{
  "type": "conversation.synced",
  "conversationId": "TODO",
  "newMessages": 0
}
```

TODO:

- define if events carry full projections or only identifiers
- define ordering guarantees per conversation
- define duplicate event handling
- define missed event recovery through HTTP pagination

## Node-to-Node Flow

Client realtime does not replace PubSub. The intended flow is:

```text
Client A -> Node A: POST /conversations/{id}/messages
Node A -> IPFS: store immutable encrypted message document
Node A -> MongoDB: index metadata
Node A -> DomainEventPublisher: publish accepted domain event
Node A -> PubSub: announce conversation message
Node B <- PubSub: receive announcement
Node B -> IPFS: fetch message document
Node B -> Domain: validate candidate
Node B -> MongoDB: cache valid metadata
Node B -> Client B: WebSocket message event
```

TODO:

- define PubSub DTOs separately from WebSocket DTOs
- define idempotency keys shared by PubSub consumers
- define anti-entropy fallback when PubSub is missed
- define how nodes discover conversation participants' preferred nodes

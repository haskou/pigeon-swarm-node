# Pigeon Swarm API

Last updated: 2026-05-11.

This document describes the HTTP API currently implemented by the node. Planned
or intentionally unsupported API shapes are kept in the final
[Planned API](#planned-api) section so they are not confused with the usable
contract.

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

Authenticated endpoints use a canonical request signature:

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

## Path Parameters

Path parameters must be percent-encoded with `encodeURIComponent` before being
placed in the URL.

Identity ids are public keys encoded as text. They can contain `/`, `+`, `=`
and newlines when represented as PEM, so raw identity ids must never be placed
directly in a path segment.

Example:

```ts
const url = `/identities/${encodeURIComponent(identityId)}`;
```

This applies to:

- `GET /identities/{identityId}`
- `GET /keychains/{identityId}`

Header values such as `X-Identity-Id` are not URL encoded.

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

Path parameters:

- `identityId`: percent-encoded identity id. Use
  `encodeURIComponent(identityId)`.

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
  "encryptedPayload": "<encryptedKeychainPayload>",
  "signature": "<keychainSignature>"
}
```

Response:

```json
{
  "ownerIdentityId": "<identityId>",
  "version": 1,
  "keychainExternalIdentifier": "<externalIdentifier>"
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

Path parameters:

- `identityId`: percent-encoded identity id. Use
  `encodeURIComponent(identityId)`.

Response:

```json
{
  "ownerIdentityId": "<identityId>",
  "version": 1,
  "keychainExternalIdentifier": "<externalIdentifier>",
  "encryptedPayload": "<encryptedKeychainPayload>",
  "signature": "<keychainSignature>"
}
```

Implemented:

- only return the authenticated identity keychain
- resolve latest valid candidate from local MongoDB and DHT candidates
- return encrypted payload as-is for client-side unlock/decryption

## Conversation HTTP API

Implemented mutating endpoints use signed HTTP requests with `X-Identity-Id`,
`X-Timestamp`, `X-Nonce` and `X-Signature`.

### List conversations

```http
GET /conversations?limit=20&beforeConversationId=<conversationId>
```

Implemented:

- require signed request auth
- list conversations where the authenticated identity participates
- support `limit` and `beforeConversationId`

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

### Get latest messages

```http
GET /conversations/{conversationId}/messages?limit=50&beforeMessageId=<messageId>
```

Response:

```json
{
  "conversationId": "one-to-one:<deterministic-id>",
  "messages": [
    {
      "id": "<messageId>",
      "type": "sent",
      "authorIdentityId": "<identityId>",
      "createdAt": 1773848829055,
      "encryptedPayload": "<encryptedMessagePayload>",
      "previousMessageIds": [],
      "attachmentExternalIdentifiers": []
    }
  ],
  "nextBeforeMessageId": "<messageId>"
}
```

Implemented:

- require signed request auth
- return the latest messages ordered from oldest to newest in the page
- when `beforeMessageId` is provided, return messages older than that message

### Send message

```http
POST /conversations/{conversationId}/messages
```

Request:

```json
{
  "id": "<clientGeneratedMessageId>",
  "createdAt": 1773848829055,
  "encryptedPayload": "<encryptedMessagePayload>",
  "signature": "<messageSignature>",
  "attachmentExternalIdentifiers": ["<externalIdentifier>"]
}
```

Response:

```json
{
  "id": "<messageId>",
  "conversationId": "one-to-one:<deterministic-id>",
  "authorIdentityId": "<identityId>",
  "type": "sent",
  "createdAt": 1773848829055,
  "encryptedPayload": "<encryptedMessagePayload>",
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

Signed HTTP request validation:

- reject reused `X-Nonce` values per identity
- reject stale `X-Timestamp` values outside the freshness window

## Notification HTTP API

Notifications are for actionable events that require client-side identity
material, such as accepting a conversation invitation. Message delivery does
not create notifications.

### List notifications

```http
GET /notifications?limit=20&beforeNotificationId=<notificationId>
```

Implemented:

- require signed request auth
- return notifications where the authenticated identity is the recipient
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
  "inviterSignature": "<inviterSignature>"
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
  "state": "accepted"
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

## Planned API

The following API shapes are not implemented yet. They are kept here as design
notes for upcoming conversation sync and realtime work.

### Edit message

```http
PATCH /conversations/{conversationId}/messages/{messageId}
```

Planned:

- model edit as a new immutable message document
- define author-only rule
- define editable message types
- define projection returned to clients

### Delete message

```http
DELETE /conversations/{conversationId}/messages/{messageId}
```

Planned:

- model delete as a new immutable message document
- define author-only rule
- define tombstone behavior
- define whether attachments are unpinned locally

### Synchronize conversation

```http
POST /conversations/{conversationId}/sync
```

Planned:

- define anti-entropy strategy
- define response when no peer has missing messages
- define response when only one peer has missing messages
- define sync cursor persistence

### Realtime WebSocket API

```http
GET /realtime
```

Planned:

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
  "conversationId": "<conversationId>"
}
```

Server response:

```json
{
  "type": "conversation.subscribed",
  "conversationId": "<conversationId>"
}
```

Planned:

- reject subscriptions when the authenticated identity is not a participant
- decide if subscribing triggers a sync
- decide if subscriptions survive reconnect by session id

### Conversation events

Server messages:

```json
{
  "type": "message.sent",
  "conversationId": "<conversationId>",
  "messageId": "<messageId>",
  "externalIdentifier": "<externalIdentifier>"
}
```

```json
{
  "type": "message.edited",
  "conversationId": "<conversationId>",
  "messageId": "<messageId>",
  "targetMessageId": "<messageId>",
  "externalIdentifier": "<externalIdentifier>"
}
```

```json
{
  "type": "message.deleted",
  "conversationId": "<conversationId>",
  "messageId": "<messageId>",
  "targetMessageId": "<messageId>",
  "externalIdentifier": "<externalIdentifier>"
}
```

```json
{
  "type": "conversation.synced",
  "conversationId": "<conversationId>",
  "newMessages": 0
}
```

Planned:

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

Planned:

- define PubSub DTOs separately from WebSocket DTOs
- define idempotency keys shared by PubSub consumers
- define anti-entropy fallback when PubSub is missed
- define how nodes discover conversation participants' preferred nodes

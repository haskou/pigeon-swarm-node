# Pigeon Swarm API

Last updated: 2026-05-12.

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
- Frontend WebSocket usage is documented separately in
  [Frontend Realtime WebSocket](frontend-websocket-realtime.md).

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
- `PUT /identities/{identityId}`
- `GET /keychains/{identityId}`

Header values such as `X-Identity-Id` are not URL encoded.

## Realtime WebSocket API

Realtime events are exposed through a WebSocket upgrade endpoint:

```http
GET /ws
```

This endpoint is intentionally documented here instead of in OpenAPI because it
is an HTTP upgrade, not a regular request/response endpoint.

Browser clients cannot set custom headers in the native `WebSocket` constructor,
so they must authenticate with signed query parameters:

```ts
const path = '/ws';
const timestamp = String(Date.now());
const nonce = crypto.randomUUID();
const body = {};
const canonicalPayload = {
  bodyHash: sha256(JSON.stringify(body)),
  method: 'GET',
  nonce,
  path,
  timestamp,
};
const signature = sign(JSON.stringify(canonicalPayload));
const url =
  `ws://localhost:8080${path}` +
  `?identityId=${encodeURIComponent(identityId)}` +
  `&timestamp=${encodeURIComponent(timestamp)}` +
  `&nonce=${encodeURIComponent(nonce)}` +
  `&signature=${encodeURIComponent(signature)}`;
const socket = new WebSocket(url);
```

Non-browser clients may send the same signature through headers:

```http
X-Identity-Id: <identityId>
X-Timestamp: <timestamp>
X-Nonce: <nonce>
X-Signature: <signature>
```

The signed path is the WebSocket path without query string. If `ROUTE_PREFIX`
is configured, sign `<ROUTE_PREFIX>/ws`.

Connection acknowledgement:

```json
{
  "type": "connection_ack",
  "identityId": "<identityId>"
}
```

Domain event payload:

```json
{
  "type": "domain_event",
  "event": {
    "aggregate_id": "<aggregateId>",
    "attributes": {},
    "causation_id": "<eventId>",
    "correlation_id": "<eventId>",
    "event_id": "<eventId>",
    "occurred_on": 1770000000000,
    "type": "<domain.event.name>"
  }
}
```

Implemented:

- require a valid signed WebSocket handshake
- accept browser-compatible query parameter authentication
- accept header authentication for non-browser clients
- reject stale timestamps and reused WebSocket nonces
- push domain events after they have been published by the local node
- deliver identity events only to the matching identity connection
- deliver keychain events only to the matching keychain owner
- deliver notification events only to the notification recipient
- deliver conversation events only to the conversation participants when the
  event carries `participantIds`
- deliver node-wide events, such as heartbeat/peer updates, to all
  authenticated WebSocket clients on the local node
- drop non-node events that do not carry enough identity information to route
  them safely

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
X-Identity-Id: <optionalIdentityId>
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
- include private network `key` values only when `X-Identity-Id` matches the current node owner
- omit private network `key` values for anonymous callers, non-owner identities or malformed identity headers

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

### Get active peers

```http
GET /peers
```

Response:

```json
{
  "peers": [
    {
      "id": "<nodeId>",
      "owner": "<identityId>",
      "lastSeenAt": 1773848829055,
      "networks": [
        {
          "id": "<networkId>",
          "name": "public"
        }
      ]
    }
  ]
}
```

Implemented:

- publish a local node heartbeat every 5 minutes through the consumer bus
- store heartbeats received from remote nodes as active peers
- return peers seen during the active peer window
- include node id, owner and network id/name only
- never expose private network keys in peer heartbeat payloads

## IPFS HTTP API

### Publish public content

```http
POST /ipfs/public
```

Requires signed request headers. The authenticated identity does not need to be
published yet, so clients can generate a keypair locally, sign this request, get
a CID, and then publish the identity with `profile.picture` or a message with
`attachmentExternalIdentifiers`.

Request body is the raw binary content. Send metadata as headers:

```http
Content-Type: image/png
X-Filename: avatar.png
```

Response:

```json
{
  "cid": "<publicContentCid>",
  "contentType": "image/png",
  "filename": "avatar.png",
  "size": 215040
}
```

Implemented:

- publish public content to every configured IPFS network
- accept raw request bytes instead of wrapping the content in JSON/base64
- store content as a JSON IPFS document with `contentType`, base64 `data`,
  optional `filename`, `size`, `uploadedAt` and `uploadedByIdentityId`
- preserve the original filename through `X-Filename`
- limit content size to 10 MiB
- return the CID to store in signed identity profiles or posts

### Publish private content

```http
POST /ipfs/private
```

Requires signed request headers. The backend never encrypts, decrypts or
inspects the original private file. Clients must encrypt the file bytes locally
before sending the request.

Request body is the encrypted raw binary content. Send metadata as headers:

```http
Content-Type: application/octet-stream
X-Filename: encrypted-photo.bin
```

Response:

```json
{
  "cid": "<privateContentCid>",
  "contentType": "application/octet-stream",
  "encrypted": true,
  "filename": "encrypted-photo.bin",
  "size": 215040
}
```

Implemented:

- publish client-encrypted private content to every configured IPFS network
- accept raw encrypted request bytes instead of wrapping the content in
  JSON/base64
- store content as a JSON IPFS document with `encrypted: true`,
  `contentType`, base64 `encryptedData`, optional `filename`, `size`,
  `uploadedAt` and `uploadedByIdentityId`
- preserve `X-Filename` when provided; do not send a sensitive clear-text
  filename here if it should remain private
- limit encrypted content size to 10 MiB
- return the CID to place in `attachmentExternalIdentifiers` for encrypted
  conversation messages

### Get IPFS JSON content

```http
GET /ipfs/{cid}
```

Implemented:

- read JSON content by CID from any configured IPFS network
- return `404` when the CID is not found

## Identity HTTP API

### Get identity

```http
GET /identities/{reference}
```

Path parameters:

- `reference`: either a percent-encoded identity id or a profile handle.
- Identity ids must use `encodeURIComponent(identityId)`.
- Handles may be passed with or without `@`; they are stored lowercase without
  `@`.

Implemented:

- resolve the latest valid known identity candidate
- resolve by identity id or profile handle
- return profile, networks, version, current identity reference, previous
  identity reference and signature

Response:

```json
{
  "id": "<identityId>",
  "identityExternalIdentifier": "<currentIdentityCid>",
  "encryptedKeyPair": {
    "publicKey": "<publicKeyPem>",
    "encryptedPrivateKey": "<encryptedPrivateKey>"
  },
  "networks": ["<networkId>"],
  "profile": {
    "name": "Alice",
    "handle": "alice",
    "picture": "<publicImageCid>"
  },
  "previousIdentityExternalIdentifier": null,
  "timestamp": 1773848829055,
  "signature": "<identitySignature>",
  "version": 1
}
```

Use `identityExternalIdentifier` as the next update's
`previousIdentityExternalIdentifier`.

### Create identity

```http
POST /identities
```

Legacy backend-generated request:

```json
{
  "name": "Alice",
  "handle": "@alice",
  "password": "super-secret-password",
  "networks": ["<networkId>"]
}
```

Client-signed request:

```json
{
  "id": "<identityId>",
  "encryptedKeyPair": {
    "publicKey": "<publicKeyPem>",
    "encryptedPrivateKey": "<encryptedPrivateKey>"
  },
  "networks": ["<networkId>"],
  "profile": {
    "name": "Alice",
    "handle": "alice"
  },
  "timestamp": 1773848829055,
  "signature": "<identitySignature>",
  "version": 1
}
```

Implemented:

- keep the legacy password-based creation flow for local clients
- accept client-generated encrypted keypairs and signed identity candidates
- keep client passwords out of the backend in the client-signed flow
- store `profile.handle` as part of the signed identity profile
- normalize handles to lowercase without `@`
- return `identityExternalIdentifier`, which is the current published identity
  CID to send as `previousIdentityExternalIdentifier` in the next update
- store `profile.picture` as a public IPFS image CID, not as base64 or a data
  URL

Client-signed identity signatures must cover the canonical identity payload:

```json
{
  "encryptedKeyPair": "<encryptedKeyPair>",
  "id": "<identityId>",
  "networks": ["<networkId>"],
  "previousIdentityExternalIdentifier": null,
  "profile": {
    "biography": null,
    "handle": "alice",
    "name": "Alice",
    "picture": "<publicImageCid>"
  },
  "timestamp": 1773848829055,
  "version": 1
}
```

The actual JSON signature payload should omit undefined optional fields; handles
must already be normalized before signing.

### Update identity

```http
PUT /identities/{identityId}
```

Request:

```json
{
  "id": "<identityId>",
  "encryptedKeyPair": {
    "publicKey": "<publicKeyPem>",
    "encryptedPrivateKey": "<encryptedPrivateKey>"
  },
  "networks": ["<networkId>"],
  "previousIdentityExternalIdentifier": "<previousIdentityCid>",
  "profile": {
    "name": "Alice Updated",
    "handle": "alice_new",
    "picture": "<newPublicContentCid>"
  },
  "timestamp": 1773848829056,
  "signature": "<identitySignature>",
  "version": 2
}
```

Implemented:

- require signed request auth from the identity owner
- accept profile changes, profile image removal and handle changes as signed
  identity updates
- accept encrypted keypair changes, including client-side password changes
- validate the signed identity candidate and previous identity chain before
  publishing
- return the new `identityExternalIdentifier` for the just-published identity
  version
- store `profile.picture` as a public IPFS image CID; omit it or send `null`
  in the signed profile to remove the profile image

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
      "replyToMessageId": "<messageId>",
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

### Get one message

```http
GET /conversations/{conversationId}/messages/{messageId}
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
  "replyToMessageId": "<messageId>",
  "attachmentExternalIdentifiers": []
}
```

Implemented:

- require signed request auth
- require the authenticated identity to be a conversation participant
- return one message by id so WebSocket clients can fetch only the announced
  message instead of reloading the whole page

### Get messages around one message

```http
GET /conversations/{conversationId}/messages/{messageId}/around?before=20&after=20
```

Response:

```json
{
  "messages": [],
  "previousCursor": "<messageBeforeWindowOrNull>",
  "nextCursor": "<messageAfterWindowOrNull>"
}
```

Implemented:

- require signed request auth
- require the authenticated identity to be a conversation participant
- return a window ordered from oldest to newest around `messageId`
- include cursors when there are more messages before or after the returned
  window
- support reply navigation when the replied-to message is not currently loaded

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
  "previousMessageIds": ["<lastKnownMessageId>"],
  "replyToMessageId": "<messageId>",
  "attachmentExternalIdentifiers": ["<privateContentCid>"]
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
  "replyToMessageId": "<messageId>",
  "attachmentExternalIdentifiers": []
}
```

Implemented:

- enforce encrypted payloads for 1to1 conversations
- accept optional `previousMessageIds` so clients can sign the same canonical
  payload that will be persisted; when omitted, the node uses an empty list
- when `previousMessageIds` is included in the canonical signed payload, send
  the exact same array in the request body
- allow replies by sending `replyToMessageId` with the id of an existing,
  non-deleted `sent` message in the same conversation
- validate the signature against the canonical message payload
- persist immutable message document in IPFS
- persist message metadata in MongoDB
- publish `ConversationMessageWasSentEvent` with `messageId`, `authorId` and
  `participantIds`
- store only attachment CIDs in the message; private attachment bytes must be
  encrypted by the client and published first with `POST /ipfs/private`

### Delete message

```http
DELETE /conversations/{conversationId}/messages/{messageId}
```

Request:

```json
{
  "id": "<clientGeneratedDeletionMessageId>",
  "createdAt": 1773848829055,
  "signature": "<deletedMessageSignature>"
}
```

Response:

```json
{
  "id": "<deletionMessageId>",
  "conversationId": "one-to-one:<deterministic-id>",
  "authorIdentityId": "<identityId>",
  "type": "deleted",
  "createdAt": 1773848829055,
  "previousMessageIds": ["<deletedMessageId>"],
  "attachmentExternalIdentifiers": [],
  "targetMessageId": "<deletedMessageId>"
}
```

Implemented:

- require signed request auth
- only allow the original message author to delete the message
- validate the deletion tombstone signature against the canonical deleted
  message payload
- use `previousMessageIds: [messageId]` for deletion signatures, so the client
  signs a deterministic payload based on the message being deleted
- persist the immutable `deleted` tombstone in IPFS
- publish `ConversationMessageWasDeletedEvent`
- invalidate the target message metadata locally so it no longer appears in
  message reads
- remove the target message block from local IPFS blockstores when present
- apply the same invalidation/removal when a deletion event is consumed from
  another node

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

### Synchronize conversation

```http
POST /conversations/{conversationId}/sync
```

Planned:

- define anti-entropy strategy
- define response when no peer has missing messages
- define response when only one peer has missing messages
- define sync cursor persistence

### Realtime WebSocket Subscriptions

```http
GET /ws
```

Planned:

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

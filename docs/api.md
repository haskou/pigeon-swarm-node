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

TODO: replace password/JWT flows with signed HTTP requests.

Every mutating endpoint should be authenticated by a canonical request
signature:

```http
X-Identity-Id: <identityId>
X-Timestamp: <timestamp>
X-Nonce: <nonce>
X-Signature: <signature>
```

TODO:

- define canonical request payload: method, path, timestamp, nonce and body hash
- store recent nonces in MongoDB to prevent replay
- define allowed clock skew
- define Cucumber scenarios for valid, invalid and replayed signed requests

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
GET /keychains/current
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

TODO:

- return only the authenticated identity keychain
- resolve latest valid candidate from local MongoDB, DHT and future sync data
- return encrypted payload as-is for client-side unlock/decryption

## Conversation HTTP API

Implemented mutating endpoints use signed HTTP requests with `X-Identity-Id`,
`X-Timestamp`, `X-Nonce` and `X-Signature`.

### List conversations

```http
GET /conversations
```

TODO:

- define pagination
- define filtering by participant
- define unread counters
- define last message projection
- define sync status projection

### Create or get a 1to1 conversation

```http
POST /conversations/1to1
```

Request:

```json
{
  "participantIdentityId": "<identityId>",
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

- the command is idempotent by participant pair
- validate that the keychain candidate belongs to the authenticated identity
- persist conversation metadata in MongoDB
- publish `ConversationWasCreatedEvent`

TODO:

- define error when remote identity cannot be resolved
- define encryption setup and key exchange boundary inside the client keychain
- define how the receiver discovers or registers the conversation from PubSub

### Get latest messages

```http
GET /conversations/{conversationId}/messages?limit=50&before=TODO
```

Response:

```json
{
  "conversationId": "TODO",
  "messages": [
    {
      "messageId": "TODO",
      "type": "sent",
      "authorIdentityId": "TODO",
      "createdAt": "TODO",
      "externalIdentifier": "TODO",
      "payload": {
        "kind": "encrypted",
        "value": "TODO"
      }
    }
  ],
  "nextCursor": "TODO"
}
```

TODO:

- decide whether payload is returned inline or fetched lazily by external
  identifier
- define cursor format
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
  "payload": {
    "kind": "encrypted",
    "value": "TODO"
  },
  "attachments": [
    {
      "externalIdentifier": "TODO",
      "mimeType": "TODO",
      "size": 0
    }
  ]
}
```

TODO:

- enforce encrypted payloads for 1to1 conversations
- define client-generated idempotency key
- define attachment upload flow
- define message signing boundary
- define response shape after IPFS and Mongo persistence

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

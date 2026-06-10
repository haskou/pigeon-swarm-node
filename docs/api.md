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
- Node-to-node missed-message recovery is handled by the backend sync
  consumers and is not part of the browser/mobile HTTP contract.

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
- recent nonces in the local embedded database to prevent replay
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

This endpoint is also listed in OpenAPI so Swagger consumers can discover the
realtime entrypoint, although the actual interaction is an HTTP upgrade rather
than a regular request/response flow.

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

The acknowledged `identityId` is normalized without PEM headers, footers or
newlines. WebSocket routing uses that same normalized value for byte-for-byte
recipient matching against event attributes such as `participantIds`,
`recipientIdentityId` and `ownerIdentityId`.

Identity presence heartbeat:

```json
{
  "active": true,
  "type": "identity_heartbeat"
}
```

Send it every 10 seconds. `active: true` means the user interacted with the
client since the previous heartbeat. Heartbeats are not individually signed
because the WebSocket upgrade already authenticated the identity. Backend marks
the identity `disconnected` after roughly 20 seconds without heartbeat and
derives `away` after 5 minutes without activity while heartbeat is still active.

Heartbeat acknowledgement:

```json
{
  "type": "heartbeat_ack",
  "identityId": "<identityId>",
  "timestamp": 1770000000000
}
```

Heartbeat messages do not need a new signature; the WebSocket upgrade already
authenticated the connection. The backend ignores any client-sent `identityId`
and answers with the identity bound to the socket. Unknown or malformed client
messages are ignored. Recommended client interval: 10 seconds, reconnecting
with a fresh signed WebSocket URL if no `heartbeat_ack` arrives within 2
intervals.

Ephemeral typing indicators:

```json
{
  "type": "typing",
  "scope": "conversation",
  "conversationId": "<conversationId>",
  "active": true
}
```

```json
{
  "type": "typing",
  "scope": "community_channel",
  "communityId": "<communityId>",
  "channelId": "<channelId>",
  "active": true
}
```

Typing messages are not persisted and are never sent through IPFS/pubsub. The
backend ignores client-sent identity fields and uses the identity authenticated
by the WebSocket handshake. Conversation typing is relayed only to the other
conversation participants. Community channel typing is relayed only to the
other community members when the channel is a text channel.

Delivered typing messages:

```json
{
  "type": "typing",
  "scope": "conversation",
  "conversationId": "<conversationId>",
  "identityId": "<senderIdentityId>",
  "active": true,
  "timestamp": 1770000000000
}
```

```json
{
  "type": "typing",
  "scope": "community_channel",
  "communityId": "<communityId>",
  "channelId": "<channelId>",
  "identityId": "<senderIdentityId>",
  "active": true,
  "timestamp": 1770000000000
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
- deliver call lifecycle events only to call participants when the event
  carries `participantIds`
- deliver call signals only to `recipientIdentityId`
- deliver node-wide events, such as heartbeat/peer updates, to all
  authenticated WebSocket clients on the local node
- drop non-node events that do not carry enough identity information to route
  them safely

Event contracts used by frontend:

| Event type                                            | Aggregate id      | Attributes used by clients/routing                                                                                   |
| ----------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `conversations.v1.conversation.was_created`           | conversation id   | `networkId`, `participantIds`                                                                                        |
| `conversations.v1.message.was_sent`                   | conversation id   | `messageId`, `authorId`, `networkId`, `participantIds`                                                               |
| `conversations.v1.message.was_edited`                 | conversation id   | `messageId`, `targetMessageId`, `networkId`, `participantIds`                                                        |
| `conversations.v1.message.was_deleted`                | conversation id   | `messageId`, `targetMessageId`, `networkId`, `participantIds`                                                        |
| `conversations.v1.message.was_pinned`                 | conversation id   | `messageId`, `pinnedByIdentityId`, `networkId`, `participantIds`                                                     |
| `conversations.v1.message.was_unpinned`               | conversation id   | `messageId`, `unpinnedByIdentityId`, `networkId`, `participantIds`                                                   |
| `conversations.v1.messages.were_read`                 | conversation id   | `messageId`, `readerIdentityId`, `networkId`, `participantIds`                                                       |
| `conversations.v1.message.reaction.was_added`         | conversation id   | `messageId`, `authorId`, `emoji`, `createdAt`, `networkId`, `participantIds`                                         |
| `conversations.v1.message.reaction.was_removed`       | conversation id   | `messageId`, `authorId`, `emoji`, `createdAt`, `networkId`, `participantIds`                                         |
| `calls.v1.call.started`                               | call id           | `callId`, `networkId`, `scope`, `participantIds`, `creatorIdentityId`, `status`                                      |
| `calls.v1.participant.joined`                         | call id           | `callId`, `networkId`, `scope`, `participantIds`, `joinedIdentityId`, `status`                                       |
| `calls.v1.participant.left`                           | call id           | `callId`, `networkId`, `scope`, `participantIds`, `leftIdentityId`, `status`                                         |
| `calls.v1.participant.declined`                       | call id           | `callId`, `networkId`, `scope`, `participantIds`, `declinedIdentityId`, `status`                                     |
| `calls.v1.participant.missed`                         | call id           | `callId`, `networkId`, `scope`, `participantIds`, `missedIdentityId`, `status`                                       |
| `calls.v1.call.ended`                                 | call id           | `callId`, `networkId`, `scope`, `participantIds`, `endedByIdentityId`, `status`                                      |
| `calls.v1.call.missed`                                | call id           | `callId`, `networkId`, `scope`, `participantIds`, `missedIdentityIds`, `status`                                      |
| `calls.v1.signal.sent`                                | call id           | `callId`, `networkId`, `scope`, `participantIds`, `senderIdentityId`, `recipientIdentityId`, `signalType`, `payload` |
| `communities.v1.community.was_created`                | community id      | `communityId`, `networkId`, `ownerIdentityId`, `memberIds`, `community`                                              |
| `communities.v1.channel.was_created`                  | community id      | `communityId`, `networkId`, `memberIds`, `channel`                                                                   |
| `communities.v1.channel.was_renamed`                  | community id      | `communityId`, `networkId`, `memberIds`, `channelId`, `name`                                                         |
| `communities.v1.channel.was_deleted`                  | community id      | `communityId`, `networkId`, `memberIds`, `channelId`                                                                 |
| `communities.v1.community.was_updated`                | community id      | `communityId`, `networkId`, `memberIds`, `community`                                                                 |
| `communities.v1.member.was_added`                     | community id      | `communityId`, `networkId`, `memberIds`, `identityId`, `community`                                                   |
| `communities.v1.member.was_left`                      | community id      | `communityId`, `networkId`, `memberIds`, `identityId`, `community`                                                   |
| `communities.v1.channel.message.was_sent`             | community id      | `communityId`, `channelId`, `messageId`, `authorIdentityId`, `networkId`, `memberIds`                                |
| `communities.v1.channel.message.was_deleted`          | community id      | `communityId`, `channelId`, `messageId`, `targetMessageId`, `deletedByIdentityId`, `networkId`, `memberIds`          |
| `communities.v1.channel.message.was_pinned`           | community id      | `communityId`, `channelId`, `messageId`, `pinnedByIdentityId`, `networkId`, `memberIds`                              |
| `communities.v1.channel.message.was_unpinned`         | community id      | `communityId`, `channelId`, `messageId`, `unpinnedByIdentityId`, `networkId`, `memberIds`                            |
| `communities.v1.channel.message.reaction.was_added`   | community id      | `communityId`, `channelId`, `messageId`, `authorIdentityId`, `emoji`, `createdAt`, `networkId`, `memberIds`          |
| `communities.v1.channel.message.reaction.was_removed` | community id      | `communityId`, `channelId`, `messageId`, `authorIdentityId`, `emoji`, `createdAt`, `networkId`, `memberIds`          |
| `polls.v1.poll.was_created`                           | poll scope id     | `pollId`, `poll`, `memberIds` or `participantIds`                                                                     |
| `stickers.v1.pack.was_created`                        | sticker pack id   | `packId`, `ownerIdentityId`, `pack`                                                                                   |
| `stickers.v1.user_library.was_created`                | identity id       | `identityId`, `library`                                                                                               |
| `notifications.v1.notification.was_created`           | notification id   | `recipientIdentityId`, `type`                                                                                        |
| `notifications.v1.notification.was_accepted`          | notification id   | `recipientIdentityId`                                                                                                |
| `notifications.v1.notification.was_declined`          | notification id   | `recipientIdentityId`                                                                                                |
| `identities.v1.identity.was_created`                  | identity id       | `networkIds`                                                                                                         |
| `identities.v1.identity.was_updated`                  | identity id       | `networkIds`                                                                                                         |
| `keychains.v1.keychain.was_published`                 | owner identity id | owner is the aggregate id                                                                                            |
| `nodes.v1.node.heartbeat.was_sent`                    | node id           | `owner`, `networks`                                                                                                  |
| `nodes.v1.node.network.was_added`                     | node id           | node/network metadata                                                                                                |
| `nodes.v1.node.network.was_removed`                   | node id           | `networkId`                                                                                                          |

For `conversations.v1.message.*`, use `event.aggregate_id` as
`conversationId` and `event.attributes.messageId` as the message id to fetch.
For `conversations.v1.messages.were_read`, use `event.aggregate_id` as
`conversationId` and refresh the conversation unread counters if needed.

For `calls.v1.*`, use `event.aggregate_id` as `callId`. Calls are signalling
only: audio/video media is negotiated by frontend with WebRTC. The backend
stores active call state and routes lifecycle/signalling events to the
authenticated participants.

## Calls HTTP API

Calls can be scoped to a one-to-one conversation, a group conversation or a
community voice channel. All endpoints require signed request authentication.

### List active calls

```http
GET /calls
```

Returns active calls where the authenticated identity is a participant.

### List call history

```http
GET /calls/history
```

Returns active and finished calls where the authenticated identity is a
participant. Use this for call history UI.

### Get call

```http
GET /calls/{callId}
```

Returns a single call when the authenticated identity is a participant.
Frontend can use this after any `calls.v1.*` WebSocket event where
`event.aggregate_id` is the call id.

### Get ICE servers

```http
GET /calls/ice-servers
```

Response:

```json
{
  "iceServers": [
    {
      "urls": [
        "turn:turn.example.com:3478?transport=udp",
        "turn:turn.example.com:3478?transport=tcp"
      ],
      "username": "<expiresAtUnix>:<identityId>",
      "credential": "<temporaryHmacCredential>"
    }
  ],
  "iceTransportPolicy": "relay"
}
```

Implemented:

- require signed request auth before exposing relay credentials
- read TURN servers from `CALLS_TURN_URLS`, as a comma-separated list
- when `CALLS_TURN_SHARED_SECRET` is configured, generate temporary coturn REST
  credentials per authenticated identity:
  `username=<expiresAtUnix>:<identityId>` and
  `credential=base64(hmac-sha1(username, CALLS_TURN_SHARED_SECRET))`
- use `CALLS_TURN_CREDENTIAL_TTL_SECONDS` to control the temporary credential
  lifetime; it defaults to `3600`
- keep `CALLS_TURN_USERNAME` and `CALLS_TURN_CREDENTIAL` only as a local/dev
  fallback when no shared secret is configured
- default `iceTransportPolicy` to `relay`, so production clients can avoid
  exposing peer IPs through direct ICE candidates
- include STUN servers only when `CALLS_STUN_URLS` is explicitly configured
- allow `CALLS_ICE_TRANSPORT_POLICY=all` for development or trusted networks

TURN improves NAT traversal and hides peer IPs from the other participant, but
it does not make large group calls cheap. A mesh group call still creates one
peer connection per participant pair. For large groups, add an SFU/media relay
later so every client uploads one media stream and receives only the streams it
needs.

### Start call

```http
POST /calls
```

Conversation call request:

```json
{
  "scopeType": "conversation",
  "conversationId": "<conversationId>"
}
```

Community channel call request:

```json
{
  "scopeType": "community_channel",
  "communityId": "<communityId>",
  "channelId": "<voiceChannelId>"
}
```

Implemented:

- one-to-one calls use an existing one-to-one conversation id
- group calls use an existing group conversation id
- community channel calls use an existing community voice channel id
- `invitedParticipantIds` is only used for conversation calls; community
  channel call participants are always derived from current community members
- community channel call start is idempotent by `(communityId, channelId)`:
  when an active call already exists for that voice channel, `POST /calls`
  returns the existing call instead of creating a second one
- when returning an existing community channel call, the authenticated caller is
  joined or added as a joined participant when needed
- caller must be a conversation participant or community member
- start emits `calls.v1.call.started` to the call participants
- the creator starts as `joined`; other participants start as `ringing`
- community channel calls are voice-channel presence state; they do not create
  chat timeline `call_event` items and do not generate missed-call
  notifications

### Join and leave call

```http
POST /calls/{callId}/participants
POST /calls/{callId}/participants/me/heartbeat
DELETE /calls/{callId}/participants/me
```

Implemented:

- joining requires the authenticated identity to be an allowed participant for
  the call scope
- joined participants should send a signed heartbeat while media is active
- heartbeat updates `participants[].lastSeenAt`
- participants with no heartbeat for about 5 seconds are marked as `left` by
  the call timeout scheduler
- leaving removes the authenticated identity from the active call
- deleting yourself while `ringing` declines the call instead of leaving it
- joins emit `calls.v1.participant.joined`
- heartbeat timeout emits `calls.v1.participant.left`
- leaves emit `calls.v1.participant.left`
- declines emit `calls.v1.participant.declined`

### End call

```http
DELETE /calls/{callId}
```

Implemented:

- only an active call participant can end the call
- ending the call emits `calls.v1.call.ended` to the current participants

### Send WebRTC signal

```http
POST /calls/{callId}/signals
```

Request:

```json
{
  "recipientIdentityId": "<identityId>",
  "signalType": "offer",
  "payload": {}
}
```

Implemented:

- `signalType` is one of `offer`, `answer` or `ice_candidate`
- sender and recipient must both be current call participants
- backend does not inspect SDP/ICE payloads
- signalling is rate-limited per `(callId, senderIdentityId)` with
  `CALLS_SIGNAL_RATE_LIMIT_PER_MINUTE` defaulting to `120`; `0` disables the
  limit for local/debug runs
- sending a signal emits `calls.v1.signal.sent` only to
  `recipientIdentityId`

### Missed calls

The node runs a call timeout scheduler once per minute for calls scoped to
conversations. Ringing participants that have not joined before the timeout are
marked as `missed`; the call status becomes `missed`; and each missed
participant receives an unread `missed_call` notification.

Implemented:

- missed participant state is persisted in replicated call state
- missed calls stay available through `GET /calls/history`
- timeout emits `calls.v1.participant.missed`
- timeout emits `calls.v1.call.missed`
- missed call notifications use payload fields `callId`, `callerIdentityId`,
  `networkId` and `recipientIdentityId`
- community voice channel calls are excluded from missed-call timeout handling

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
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <millisecondsSinceEpoch>
X-Nonce: <uniqueNonce>
X-Signature: <signature>
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
- include private network `key` values only when the request is signed by the
  current node owner
- omit private network `key` values for anonymous callers, spoofed owner
  headers, non-owner identities or malformed signatures

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
- persist the network in the local embedded database
- synchronize the runtime IPFS network registry after saving

### Add generated public node network

```http
POST /node/networks/public
```

Request body: none.

Implemented:

- create a public network with a backend-generated `networkId`
- use the fixed network name `public`
- allow unsigned creation while the node has no owner
- require signed request auth from the owner after the node is claimed
- reject the request when the node already has a public network
- persist the network in the local embedded database and synchronize the runtime IPFS network registry

### Delete local node network

```http
DELETE /node/networks/{networkId}
```

Request body: none.

Implemented:

- require signed request auth from the node owner
- reject deletion while the node has no owner because no identity can authorize
  the destructive operation
- remove the network from local node metadata
- stop the runtime IPFS network and delete the local IPFS storage folder for that network
- delete local and replicated data scoped to that network:
  conversations, conversation messages/reactions/unread markers, communities and their channel messages/reactions/invites/requests/moderation logs, calls, polls, missed-call notifications, peer network references and content replication records
- preserve identity metadata that still belongs to other networks by removing only the deleted `networkId`
- delete identity metadata only when the deleted network was its only network

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
- persist owner state in the local embedded database
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
a CID, and then publish the identity with `profile.picture`, `profile.banner` or a message with
`attachmentExternalIdentifiers`.

Request body is the raw binary content. Send metadata as headers:

```http
Content-Type: image/png
X-Filename: profile-image.png
```

Response:

```json
{
  "cid": "<publicContentCid>",
  "contentType": "image/png",
  "filename": "profile-image.png",
  "size": 215040
}
```

Implemented:

- publish public content to every configured IPFS network
- register the returned CID in OrbitDB replication metadata
- accept raw request bytes instead of wrapping the content in JSON/base64
- store the binary bytes directly in IPFS
- preserve response metadata from `Content-Type` and `X-Filename` in local
  replication metadata
- limit content size to 50 MiB
- return the CID to store in signed identity profiles or posts

### Get public IPFS content

```http
GET /ipfs/{cid}
```

For CIDs uploaded with `POST /ipfs/public`, the response body is the original
binary content. It is not wrapped in JSON and it is not base64 encoded.

Response:

```http
HTTP/1.1 200 OK
Content-Type: image/png
Content-Disposition: inline; filename="profile-image.png"; filename*=UTF-8''profile-image.png
```

The body is the raw byte stream. `Content-Type` and `Content-Disposition` are
resolved from the replication metadata created during upload or received through
network sync. If metadata is unknown, the endpoint falls back to
`application/octet-stream`. If the CID points to existing JSON content, the
endpoint still returns that JSON document for compatibility with identities,
keychains and private upload documents.

### Publish private content

```http
POST /ipfs/private
```

`POST /ipfs/secure` is accepted as a backwards-compatible alias for
`POST /ipfs/private`. New clients should use `/ipfs/private`.

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
- register the returned CID in OrbitDB replication metadata
- accept raw encrypted request bytes instead of wrapping the content in
  JSON/base64
- store content as a JSON IPFS document with `encrypted: true`,
  `contentType`, base64 `encryptedData`, optional `filename`, `size`,
  `uploadedAt` and `uploadedByIdentityId`
- preserve `X-Filename` when provided; do not send a sensitive clear-text
  filename here if it should remain private
- limit encrypted content size to 50 MiB
- return the CID to place in `attachmentExternalIdentifiers` for encrypted
  conversation messages

### Get IPFS JSON content

```http
GET /ipfs/{cid}
```

Implemented:

- read JSON content by CID from any configured IPFS network
- return `404` when the CID is not found

### Get content replication status

```http
GET /ipfs/replication/status
```

Requires signed request headers. This endpoint reports a precomputed local
replication summary. It does not return known CIDs and does not calculate
replica responsibility during the request.

The summary is refreshed when local uploads register replication metadata, when
network-scoped pubsub replication/claim events are consumed, and when the
background maintenance scheduler runs.

The current policy is intentionally conservative:

- with 1 to 5 active nodes in a network, every active node remains responsible
  for every known CID
- with more than 5 active nodes, desired replicas are the larger of 5 nodes or
  40% of active nodes, capped by the active node count
- responsibility is selected deterministically from `networkId`, `cid` and
  `nodeId`, so nodes can independently agree who should keep a CID
- the background maintenance job only releases local replicas when the network
  has more than 5 active nodes, the local node is not responsible for that CID,
  and every responsible node has already claimed that replica

Response:

```json
{
  "localNodeId": "<nodeId>",
  "summary": {
    "contentCount": 42,
    "totalSizeBytes": 104857600,
    "localResponsibleCount": 38,
    "releasableCount": 3,
    "updatedAt": 1770000000000
  }
}
```

Implemented:

- track CIDs created through `POST /ipfs/public`, `POST /ipfs/private` and
  `POST /ipfs/secure`
- track CIDs announced by other nodes, even before this node claims a local
  replica
- record replica claims when a local or remote node announces that it has a CID
- derive active node counts from node heartbeat peer metadata
- keep generous replica margins to avoid losing half the data when there are
  only a few nodes
- periodically pin missing local responsibilities and release safe extra local
  replicas
- keep per-CID responsibility data internal to the maintenance scheduler

## Link Preview HTTP API

Link previews are fetched by the backend so the frontend can render URL cards
without exposing user cookies, browser-local networks or private metadata.

### Create link preview

```http
POST /link-previews
```

Requires a signed request. Body:

```json
{
  "url": "https://example.com/article"
}
```

Response:

```json
{
  "url": "https://example.com/article",
  "finalUrl": "https://example.com/article",
  "title": "Example article",
  "description": "Short description",
  "image": "https://example.com/preview.png",
  "siteName": "Example"
}
```

Implemented security rules:

- allow only `http` and `https`
- block `localhost`
- block private and local IP ranges, including `127.0.0.0/8`, `10.0.0.0/8`,
  `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `fc00::/7` and `fe80::/10`
- resolve DNS before fetching and connect only to the validated address
- re-resolve and revalidate every redirect target
- limit redirects to 5
- limit downloaded HTML to 1 MB
- use a 5 second timeout
- send only a backend user-agent and HTML accept header; never forward user
  cookies or request headers
- cache successful preview results for 1 hour
- rate limit by authenticated identity and requester IP
- discard preview image URLs that do not pass the same URL/IP validation

## Identity Presence HTTP API

Presence is replicated runtime state. It is not stored in IPFS and it is synced
through network-scoped OrbitDB state.

Statuses:

- `available`: heartbeat active and recent user activity.
- `away`: heartbeat active, but no user activity for 5 minutes.
- `busy`: selected by the user; backend suppresses push notifications for
  messages and calls, and clients should avoid audible notifications.
- `invisible`: heartbeat active, but other identities see `disconnected`.
- `custom`: selected custom connection state.
- `disconnected`: derived by backend after heartbeat timeout.

The custom status message is separate from connection state, max 50 characters,
and can be removed.

### Get identity presence

```http
GET /presence/{identityId}
```

Path parameters:

- `identityId`: percent-encoded identity id/public key without PEM wrapping.

Requires signed HTTP headers. Response:

```json
{
  "identityId": "<identityId>",
  "status": "available",
  "customMessage": "Building the swarm",
  "lastHeartbeatAt": 1770000000000,
  "lastActivityAt": 1770000000000,
  "updatedAt": 1770000000000
}
```

If the target identity is invisible and the viewer is not the same identity,
the response is:

```json
{
  "identityId": "<identityId>",
  "status": "disconnected",
  "updatedAt": 1770000000000
}
```

### Get multiple identity presences

```http
GET /presence/?identityIds=<idA>,<idB>
```

`identityIds` is a comma-separated list. Each id inside the query string must
be URL encoded by the client as part of the full URL.

### Update my presence

```http
PUT /presence/me
```

Request:

```json
{
  "status": "busy",
  "customMessage": "Recording"
}
```

Allowed `status` values are `available`, `away`, `busy`, `custom` and
`invisible`. `disconnected` cannot be selected; it is derived by heartbeat
timeout.

### Clear my custom message

```http
DELETE /presence/me/custom-message
```

Returns the updated presence resource.

### WebSocket presence events

When visible presence changes, backend emits:

```json
{
  "type": "domain_event",
  "event": {
    "type": "presence.v1.identity_presence.was_updated",
    "aggregate_id": "<identityId>",
    "attributes": {
      "identityId": "<identityId>",
      "status": "away",
      "customMessage": "Back soon",
      "lastHeartbeatAt": 1770000000000,
      "lastActivityAt": 1770000000000,
      "updatedAt": 1770000000000,
      "networkIds": ["<networkId>"]
    }
  }
}
```

## Identity HTTP API

### Get identity

```http
GET /identities/{reference}
```

Path parameters:

- `reference`: either a percent-encoded identity id or a profile handle.
- Identity ids must use `encodeURIComponent(identityId)`.
- Handles are stored lowercase and must be passed without `@`.

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
    "picture": "<publicImageCid>",
    "banner": "<publicBannerCid>"
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
  "handle": "alice",
  "password": "Super-secret-password1!",
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
- normalize handles to lowercase
- reject handles containing spaces, `@` or any character outside letters,
  numbers, dots, hyphens and underscores
- require legacy backend-generated passwords to be 12 to 256 characters long
  and include at least one uppercase letter, one lowercase letter, one number
  and one symbol
- return `identityExternalIdentifier`, which is the current published identity
  CID to send as `previousIdentityExternalIdentifier` in the next update
- store `profile.picture` and `profile.banner` as public IPFS image CIDs, not as
  base64 or data URLs

Client-signed identity signatures must cover the canonical identity payload:

```json
{
  "encryptedKeyPair": "<encryptedKeyPair>",
  "id": "<identityId>",
  "networks": ["<networkId>"],
  "previousIdentityExternalIdentifier": null,
  "profile": {
    "picture": "<publicImageCid>",
    "banner": "<publicBannerCid>",
    "biography": null,
    "handle": "alice",
    "name": "Alice"
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
    "picture": "<newPublicImageCid>",
    "banner": "<newPublicBannerCid>"
  },
  "timestamp": 1773848829056,
  "signature": "<identitySignature>",
  "version": 2
}
```

Implemented:

- require signed request auth from the identity owner
- accept profile changes, profile image/banner removal and handle changes as signed
  identity updates
- accept encrypted keypair changes, including client-side password changes
- allow adding networks, but reject signed identity updates that remove any
  previously joined network
- validate the signed identity candidate and previous identity chain before
  publishing
- return the new `identityExternalIdentifier` for the just-published identity
  version
- store `profile.picture` and `profile.banner` as public IPFS image CIDs; omit
  them or send `null` in the signed profile to remove the media

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
- persist metadata in OrbitDB replicated metadata
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
- resolve latest valid candidate from OrbitDB metadata and DHT candidates
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
- include `unreadCount` for the authenticated identity

### Create a conversation

```http
POST /conversations
```

1to1 request:

```json
{
  "type": "one-to-one",
  "participantIds": ["<authenticatedIdentityId>", "<participantIdentityId>"],
  "networkId": "<networkId>",
  "keychainExternalIdentifier": "<externalIdentifier>"
}
```

Standalone group request:

```json
{
  "type": "group",
  "name": "Project room",
  "participantIds": [
    "<authenticatedIdentityId>",
    "<participantIdentityId>",
    "<anotherParticipantIdentityId>"
  ],
  "networkId": "<networkId>",
  "keychainExternalIdentifier": "<externalIdentifier>"
}
```

Response:

```json
{
  "id": "one-to-one:<deterministic-id>",
  "name": "Project room",
  "networkId": "<networkId>",
  "participantIds": ["<authenticatedIdentityId>", "<participantIdentityId>"],
  "type": "one-to-one",
  "unreadCount": 0
}
```

Implemented:

- create the one-to-one conversation for the participant pair
- create standalone group conversations with a client-provided `name` and N
  explicit participants
- require the conversation network id; messages and sync for this conversation
  are published only through that network
- validate that the keychain candidate belongs to the authenticated identity
- persist conversation metadata in OrbitDB replicated metadata
- publish `ConversationWasCreatedEvent`

Standalone group conversations are different from future community channels:
groups use explicit `participantIds`, while community channel access will be
based on community membership/roles.

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
      "attachmentExternalIdentifiers": [],
      "reactions": [
        {
          "authorIdentityId": "<identityId>",
          "createdAt": 1773848829055,
          "emoji": "👍"
        }
      ]
    },
    {
      "id": "call-event:<callId>:ended:<identityId>",
      "conversationId": "one-to-one:<deterministic-id>",
      "type": "call_event",
      "callId": "<callId>",
      "callEventType": "ended",
      "actorIdentityId": "<identityId>",
      "createdAt": 1773848869055,
      "durationMs": 40000
    },
    {
      "id": "<pollId>",
      "type": "poll",
      "creatorIdentityId": "<identityId>",
      "createdAt": 1773848879055,
      "question": "Pizza or sushi?",
      "options": [
        { "id": "pizza", "text": "Pizza" },
        { "id": "sushi", "text": "Sushi" }
      ],
      "allowsMultipleVotes": true,
      "scope": {
        "type": "group_conversation",
        "conversationId": "group:<id>",
        "networkId": "<networkId>"
      },
      "status": "open",
      "votes": []
    }
  ],
  "nextBeforeMessageId": "<messageId>"
}
```

Implemented:

- require signed request auth
- return the latest messages ordered from oldest to newest in the page
- include non-encrypted `call_event` system items for calls scoped to the
  conversation, with `callEventType` equal to `ended`, `declined` or `missed`
- include `poll` timeline items scoped to the group conversation. For group
  conversations, the poll `id` is also registered as a conversation message id,
  so it is valid in later `previousMessageIds`.
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
  "attachmentExternalIdentifiers": [],
  "reactions": []
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

### Get conversation thread replies

```http
GET /conversations/{conversationId}/messages/{messageId}/thread?limit=50
```

Response:

```json
{
  "conversationId": "one-to-one:<deterministic-id>",
  "messages": [
    {
      "id": "<replyMessageId>",
      "conversationId": "one-to-one:<deterministic-id>",
      "authorIdentityId": "<identityId>",
      "type": "sent",
      "createdAt": 1773848829055,
      "encryptedPayload": "<encryptedMessagePayload>",
      "previousMessageIds": ["<messageId>"],
      "replyToMessageId": "<messageId>",
      "attachmentExternalIdentifiers": [],
      "reactions": []
    }
  ],
  "nextBeforeMessageId": "<replyMessageId>"
}
```

Implemented:

- require signed request auth
- require the authenticated identity to be a conversation participant
- return messages whose `replyToMessageId` points to the requested root message
- order replies from oldest to newest

### Conversation drafts

```http
GET /conversations/me/drafts
PUT /conversations/{conversationId}/draft
DELETE /conversations/{conversationId}/draft
```

Save request:

```json
{
  "encryptedPayload": "<encryptedDraftPayload>",
  "updatedAt": 1773848829055
}
```

List response:

```json
{
  "drafts": [
    {
      "conversationId": "one-to-one:<deterministic-id>",
      "encryptedPayload": "<encryptedDraftPayload>",
      "updatedAt": 1773848829055
    }
  ]
}
```

Implemented:

- require signed request auth
- drafts are local embedded DB state scoped to the authenticated identity
- the backend treats `encryptedPayload` as opaque client-encrypted data
- saving or deleting a draft requires conversation participation

### Conversation pins

```http
GET /conversations/{conversationId}/pins
POST /conversations/{conversationId}/messages/{messageId}/pin
DELETE /conversations/{conversationId}/messages/{messageId}/pin
```

List response:

```json
{
  "conversationId": "one-to-one:<deterministic-id>",
  "pins": [
    {
      "messageId": "<messageId>",
      "pinnedByIdentityId": "<identityId>",
      "createdAt": 1773848829055,
      "message": {
        "id": "<messageId>",
        "conversationId": "one-to-one:<deterministic-id>",
        "authorIdentityId": "<identityId>",
        "type": "sent",
        "createdAt": 1773848829055,
        "encryptedPayload": "<encryptedMessagePayload>",
        "previousMessageIds": [],
        "attachmentExternalIdentifiers": [],
        "reactions": []
      }
    }
  ]
}
```

Implemented:

- require signed request auth
- require the authenticated identity to be a conversation participant
- pins are OrbitDB replicated metadata; message IPFS documents are not rewritten
- pinning validates that the target message exists locally

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
  "attachmentExternalIdentifiers": [],
  "reactions": []
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
- persist message metadata in OrbitDB replicated metadata
- publish `ConversationMessageWasSentEvent` with `messageId`, `authorId`,
  `networkId` and `participantIds`
- derive unread state from OrbitDB replicated read markers and message metadata
- store only attachment CIDs in the message; private attachment bytes must be
  encrypted by the client and published first with `POST /ipfs/private`

### Edit message

```http
PUT /conversations/{conversationId}/messages/{messageId}
```

Request:

```json
{
  "id": "<clientGeneratedEditionMessageId>",
  "createdAt": 1773848829055,
  "encryptedPayload": "<updatedEncryptedMessagePayload>",
  "previousMessageIds": ["<editedMessageId>"],
  "signature": "<editedMessageSignature>"
}
```

Response:

```json
{
  "id": "<editionMessageId>",
  "conversationId": "one-to-one:<deterministic-id>",
  "authorIdentityId": "<identityId>",
  "type": "edited",
  "createdAt": 1773848829055,
  "encryptedPayload": "<updatedEncryptedMessagePayload>",
  "previousMessageIds": ["<editedMessageId>"],
  "attachmentExternalIdentifiers": [],
  "reactions": [],
  "targetMessageId": "<editedMessageId>"
}
```

Implemented:

- require signed request auth
- only allow the original message author to edit the message
- reject edits for deleted messages
- validate the edit tombstone signature against the canonical edited message
  payload
- use `targetMessageId` from the path and default `previousMessageIds` to
  `[messageId]` when the body omits it
- persist the immutable `edited` tombstone in IPFS
- publish `ConversationMessageWasEditedEvent` with `messageId`,
  `targetMessageId`, `networkId` and `participantIds`
- consuming nodes register the edit through the existing conversation message
  registrar

### Mark messages as read

```http
PUT /conversations/{conversationId}/messages/read-until
```

Request:

```json
{
  "messageId": "<messageId>"
}
```

Response:

```json
{
  "status": "read"
}
```

Implemented:

- require signed request auth
- require the authenticated identity to be a conversation participant
- update the OrbitDB replicated read marker for the authenticated identity up to
  and including `messageId`
- publish `ConversationMessagesWereReadEvent` with `messageId`,
  `readerIdentityId`, `networkId` and `participantIds`
- consuming nodes apply the same replicated read marker update locally
- send a Web Push control payload of type `notifications_cleared` to the
  reader identity subscriptions so service workers can close displayed
  notifications tagged as `conversation:<conversationId>`

### Add message reaction

```http
POST /conversations/{conversationId}/messages/{messageId}/reactions
```

Request:

```json
{
  "emoji": "👍"
}
```

Response:

```json
{
  "authorIdentityId": "<identityId>",
  "createdAt": 1773848829055,
  "emoji": "👍"
}
```

Implemented:

- require signed request auth
- require the authenticated identity to be a conversation participant
- require the target message to exist and be visible locally
- store reactions in OrbitDB replicated metadata; message IPFS documents are not
  rewritten
- keep reactions unique by conversation id, message id, author id and emoji
- include reactions in `GET /conversations/{conversationId}/messages`,
  `GET /conversations/{conversationId}/messages/{messageId}` and
  `GET /conversations/{conversationId}/messages/{messageId}/around`
- publish `conversations.v1.message.reaction.was_added` with `messageId`,
  `authorId`, `emoji`, `createdAt`, `networkId` and `participantIds`

### Remove message reaction

```http
DELETE /conversations/{conversationId}/messages/{messageId}/reactions
```

Request:

```json
{
  "emoji": "👍"
}
```

Response:

```json
{
  "authorIdentityId": "<identityId>",
  "createdAt": 1773848829055,
  "emoji": "👍"
}
```

Implemented:

- require signed request auth
- remove only the authenticated participant reaction for the provided emoji
- publish `conversations.v1.message.reaction.was_removed` with `messageId`,
  `authorId`, `emoji`, `createdAt`, `networkId` and `participantIds`
- synchronize the removal with other nodes through the conversation PubSub
  consumers

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
  "reactions": [],
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
- publish `ConversationMessageWasDeletedEvent` with `messageId`,
  `targetMessageId`, `networkId` and `participantIds`
- invalidate the target message metadata locally so it no longer appears in
  message reads
- remove unread flags for the deleted target message
- remove the target message block from local IPFS blockstores when present
- apply the same invalidation/removal when a deletion event is consumed from
  another node

Signed HTTP request validation:

- reject reused `X-Nonce` values per identity
- reject stale `X-Timestamp` values outside the freshness window

## Community HTTP API

Communities are private in the current MVP. A community belongs to one network,
has one owner, and contains member ids, text channel metadata and encrypted
text channel messages. Community channels are not backed by `Conversation`;
they live inside the `communities` context.

Implemented mutating endpoints use signed HTTP requests with `X-Identity-Id`,
`X-Timestamp`, `X-Nonce` and `X-Signature`.

### List communities

```http
GET /communities
```

Response:

```json
{
  "communities": [
    {
      "id": "<communityId>",
      "networkId": "<networkId>",
      "ownerIdentityId": "<identityId>",
      "name": "Pigeon Lab",
      "description": "Private workspace",
      "avatar": "<publicAvatarCid>",
      "banner": "<publicBannerCid>",
      "memberIds": ["<identityId>"],
      "bannedMemberIds": [],
      "memberRoles": [],
      "roles": [
        {
          "id": "everyone",
          "name": "everyone",
          "permissions": [
            "view_channels",
            "send_messages",
            "attach_files",
            "embed_links",
            "send_stickers",
            "connect_voice"
          ],
          "builtIn": true
        }
      ],
      "textChannels": [],
      "visibility": "private",
      "discoverable": true,
      "autoJoinEnabled": false,
      "createdAt": 1773848829055
    }
  ]
}
```

Implemented:

- require signed request auth
- list only communities where the authenticated identity is a member
- return private community metadata, member ids and text channel metadata

### Discover communities

```http
GET /communities/discover?query=Pigeon&networkId=<networkId>
```

The request is signed as `GET /communities/discover`; query string values are
not part of the signed canonical path because Express verifies `request.path`.

Response:

```json
{
  "communities": [
    {
      "id": "<communityId>",
      "networkId": "<networkId>",
      "ownerIdentityId": "<identityId>",
      "name": "Pigeon Lab",
      "description": "Private workspace",
      "avatar": "<publicAvatarCid>",
      "banner": "<publicBannerCid>",
      "memberCount": 4,
      "membershipStatus": "none",
      "membershipRequest": {
        "id": "<requestId>",
        "communityId": "<communityId>",
        "creatorIdentityId": "<identityId>",
        "identityId": "<identityId>",
        "type": "request",
        "status": "pending",
        "createdAt": 1773848829055,
        "updatedAt": 1773848829055
      },
      "visibility": "private",
      "discoverable": true,
      "autoJoinEnabled": false
    }
  ]
}
```

Implemented:

- require signed request auth
- search private community metadata by `name` or `description`
- optionally scope results with `networkId`
- only return communities configured with `discoverable: true`
- do not return channel metadata or encrypted content
- include the authenticated identity membership state:
  `none`, `member`, `requested` or `invited`

### Create community

```http
POST /communities
```

Request:

```json
{
  "networkId": "<networkId>",
  "name": "Pigeon Lab",
  "description": "Private workspace",
  "avatar": "<publicAvatarCid>",
  "banner": "<publicBannerCid>",
  "discoverable": true,
  "autoJoinEnabled": false,
  "visibility": "private"
}
```

Implemented:

- create a community in the requested network
- set the authenticated identity as owner
- add the owner as the first member
- store `avatar` as an optional public IPFS CID, not as base64
- store `banner` as an optional public IPFS CID, not as base64
- default `discoverable` to `true`; set it to `false` to hide the community
  from `GET /communities/discover`
- default `autoJoinEnabled` to `false`; set it to `true` to let any non-banned
  identity join through `POST /communities/{communityId}/join-requests`
  without owner approval
- default `visibility` to `private`
- accept `visibility: "public"` to create a plaintext community whose text
  channel messages are stored as `plaintextPayload` and can be searched
- keep `visibility` immutable; update profile endpoints cannot change it
- require private communities to send `encryptedPayload`
- require public communities to send `plaintextPayload`

### Get community

```http
GET /communities/{communityId}
```

Implemented:

- require signed request auth
- only allow community members to read the community

### Update community profile

```http
PATCH /communities/{communityId}
```

Request:

```json
{
  "name": "Pigeon Lab",
  "description": "Updated private workspace",
  "avatar": "<publicAvatarCid>",
  "banner": "<publicBannerCid>",
  "discoverable": false,
  "autoJoinEnabled": true
}
```

Implemented:

- require signed request auth from the community owner
- update name, description and optional avatar/banner CIDs
- omit `avatar` to remove the avatar
- omit `banner` to remove the banner
- update `discoverable` without changing membership or invitation behavior
- update `autoJoinEnabled`; when enabled, join requests are accepted
  immediately and the requester is added to `memberIds`

### List community members

```http
GET /communities/{communityId}/members
```

Response:

```json
{
  "memberIds": ["<identityId>"]
}
```

Implemented:

- require signed request auth
- only allow community members to list members

### Invite community member

```http
POST /communities/{communityId}/members
```

Request:

```json
{
  "identityId": "<newMemberIdentityId>"
}
```

Response:

```json
{
  "id": "<requestId>",
  "communityId": "<communityId>",
  "creatorIdentityId": "<ownerIdentityId>",
  "identityId": "<invitedIdentityId>",
  "type": "invitation",
  "status": "pending",
  "createdAt": 1773848829055,
  "updatedAt": 1773848829055
}
```

Implemented:

- require signed request auth from the community owner
- create a pending invitation
- do not add the invited identity to `memberIds` until they accept
- return an existing pending invitation for the same identity idempotently

### Request community membership

```http
POST /communities/{communityId}/join-requests
```

Implemented:

- require signed request auth from the requester
- reject banned identities
- create a pending `request` when `autoJoinEnabled` is false
- when `autoJoinEnabled` is true, create and immediately accept the `request`
  and add the requester to `memberIds`
- do not add the requester to `memberIds` until the owner accepts, unless
  `autoJoinEnabled` is true
- return an existing pending request for the same requester idempotently

### List community membership requests

```http
GET /communities/membership-requests
```

Implemented:

- require signed request auth
- return requests created by the authenticated identity
- return invitations targeting the authenticated identity
- return requests/invitations for communities owned by the authenticated
  identity

### Accept or decline community membership request

```http
PATCH /communities/membership-requests/{requestId}
```

Request:

```json
{
  "status": "accepted"
}
```

Implemented:

- accepted statuses add the request `identityId` to `memberIds`
- invited identities can accept or decline `invitation` requests
- community owners or members with `approve_members`/`reject_members` can
  accept or decline `request` join requests
- requesters can decline their own pending join request
- owners can decline invitations they created

### Leave community

```http
DELETE /communities/{communityId}/members/me
```

Implemented:

- require signed request auth from the member that is leaving
- remove the authenticated identity from `memberIds`
- publish `communities.v1.member.was_left` with the updated community
- allow the owner to leave only when they are the last community member
- reject the owner while other members remain

### Kick community member

```http
DELETE /communities/{communityId}/members/{identityId}/kick
```

Implemented:

- require signed request auth from the community owner or a member with
  `manage_members`
- `identityId` must be URL-encoded
- remove the target identity from `memberIds`
- publish `communities.v1.member.was_left` with the updated community and
  `actorIdentityId`
- reject attempts to kick the community owner
- does not add the target to `bannedMemberIds`

### Create community invite link token

```http
POST /communities/{communityId}/invites
```

Request:

```json
{
  "encryptedCommunityKey": {
    "version": 1,
    "algorithm": "AES-GCM",
    "nonce": "base64url",
    "ciphertext": "base64url"
  },
  "expiresAt": 1770000000000,
  "maxUses": 1
}
```

Response:

```json
{
  "inviteToken": "<inviteToken>",
  "communityId": "<communityId>",
  "encryptedCommunityKey": {
    "version": 1,
    "algorithm": "AES-GCM",
    "nonce": "base64url",
    "ciphertext": "base64url"
  },
  "expiresAt": 1770000000000,
  "maxUses": 1,
  "uses": 0
}
```

Implemented:

- require signed request auth from the community owner or a member with
  `create_invites`
- create a bearer invite token for the community
- default `maxUses` to `1`
- optionally store an opaque `encryptedCommunityKey` blob produced by frontend
- never receive the invite fragment secret or the community key in clear text

Recommended frontend invite link shape:

```text
https://pigeon.futoineko.com/invite/community/<inviteToken>#k=<inviteSecret>
```

The `inviteSecret` after `#` must not be sent to the backend. Frontend encrypts
the current community key entry with that secret and sends only
`encryptedCommunityKey` in the invite creation body.

### Read community invite link token

```http
GET /communities/invites/{inviteToken}
```

This endpoint is unsigned so a user opening an invite link can preview the
community and create an identity before accepting.

Response:

```json
{
  "inviteToken": "<inviteToken>",
  "communityId": "<communityId>",
  "communityName": "Pigeon Swarm",
  "communityAvatar": "bagaa...",
  "communityBanner": "bagaa...",
  "encryptedCommunityKey": {
    "version": 1,
    "algorithm": "AES-GCM",
    "nonce": "base64url",
    "ciphertext": "base64url"
  },
  "expiresAt": 1770000000000,
  "maxUses": 1,
  "uses": 0
}
```

Implemented:

- resolve invite metadata by bearer token
- return minimal community metadata for invite preview
- return `encryptedCommunityKey` exactly as stored
- never receive the `#k` fragment secret

### Accept community invite link token

```http
POST /communities/invites/{inviteToken}/accept
```

Implemented:

- require signed request auth from the identity accepting the invite
- reject missing, expired or exhausted invite tokens
- consume one invite use
- add the authenticated identity as a community member
- reject banned identities
- publish `communities.v1.member.was_added` with the updated community
- never receive or decrypt the community key

### Ban community member

```http
POST /communities/{communityId}/bans
DELETE /communities/{communityId}/bans/{urlEncodedIdentityId}
```

Ban request:

```json
{
  "identityId": "<identityId>",
  "reason": "optional moderation note"
}
```

Implemented:

- require signed request auth from the owner or a member with `ban_members`
- remove the banned identity from `memberIds` if they were a member
- store banned identities in `bannedMemberIds`
- prevent banned identities from requesting to join or accepting invite links
- publish `communities.v1.community.was_updated`

### List community moderation log

```http
GET /communities/{communityId}/moderation-logs?limit=50&beforeLogId=<logId>
```

Response:

```json
{
  "logs": [
    {
      "id": "<logId>",
      "communityId": "<communityId>",
      "actorIdentityId": "<identityId>",
      "action": "channel_created",
      "target": {
        "type": "channel",
        "id": "<channelId>"
      },
      "details": {
        "name": "general",
        "type": "text"
      },
      "createdAt": 1773848829055
    }
  ],
  "nextBeforeLogId": "<logId>"
}
```

Implemented:

- require signed request auth from the owner or a member with `manage_members`
- store log entries in OrbitDB replicated state; they are not written to IPFS
- return newest entries first, with `beforeLogId` pagination
- currently recorded actions:
  `community_updated`, `channel_created`, `channel_renamed`,
  `channel_deleted`, `channel_permissions_updated`, `role_created`,
  `role_updated`, `role_deleted`, `member_roles_updated`,
  `invitation_created`, `invite_link_created`,
  `membership_request_accepted`, `membership_request_declined`,
  `member_banned`, `member_unbanned` and `message_deleted`

### List community channels

```http
GET /communities/{communityId}/channels
```

Response:

```json
{
  "channels": [
    {
      "id": "<channelId>",
      "name": "general",
      "type": "text",
      "permissions": {
        "visibleRoleIds": ["everyone"]
      },
      "createdAt": 1773848829055,
      "threads": [
        {
          "rootMessageId": "<messageId>",
          "replyCount": 4,
          "lastReplyAt": 1773848929055,
          "lastReplyMessageId": "<messageId>"
        }
      ]
    },
    {
      "id": "<channelId>",
      "name": "Voice",
      "type": "voice",
      "permissions": {
        "visibleRoleIds": ["everyone"]
      },
      "createdAt": 1773848829055,
      "connectedIdentityIds": ["<identityId>"]
    }
  ]
}
```

Implemented:

- require signed request auth
- only allow community members to list channel metadata
- omit channels that are not visible to the authenticated member roles
- return both text and voice channels
- include up to 2 recent active thread summaries per text channel, ordered by
  newest reply activity and calculated from OrbitDB metadata without hydrating
  message payloads
- include `connectedIdentityIds` for voice channels, derived from identities
  currently `joined` to the active call scoped to that voice channel

### Community roles

Roles let a community owner delegate administration. The owner always has every
permission. The built-in `everyone` role applies to every member and cannot be
deleted. New custom roles can be assigned to members.

Supported permission values:

- `view_channels`
- `manage_channels`
- `manage_roles`
- `manage_members`
- `create_invites`
- `approve_members`
- `reject_members`
- `ban_members`
- `send_messages`
- `embed_links`
- `attach_files`
- `send_stickers`
- `mention_everyone`
- `mention_here`
- `mention_roles`
- `manage_messages`
- `create_polls`
- `connect_voice`

```http
GET /communities/{communityId}/roles
```

Returns:

```json
{
  "roles": [
    {
      "id": "everyone",
      "name": "everyone",
      "permissions": ["view_channels", "send_messages"],
      "builtIn": true
    }
  ],
  "memberRoles": [
    {
      "identityId": "<identityId>",
      "roleIds": ["<roleId>"]
    }
  ]
}
```

```http
POST /communities/{communityId}/roles
PATCH /communities/{communityId}/roles/{roleId}
DELETE /communities/{communityId}/roles/{roleId}
PUT /communities/{communityId}/members/{urlEncodedIdentityId}/roles
```

Role body:

```json
{
  "name": "Admin",
  "permissions": ["manage_channels", "create_invites"]
}
```

Member role replacement body:

```json
{
  "roleIds": ["<roleId>"]
}
```

Implemented:

- require signed request auth
- require owner or `manage_roles` for role creation/update/deletion and member
  role assignment
- keep `everyone` implicit for every member; clients should not assign it
  manually
- persist roles and assignments in the community document

### Create text channel

```http
POST /communities/{communityId}/channels/text
```

Request:

```json
{
  "name": "general"
}
```

Implemented:

- require signed request auth from the community owner or a member with
  `manage_channels`
- create text channel metadata in the community

### Create voice channel

```http
POST /communities/{communityId}/channels/voice
```

Request:

```json
{
  "name": "Voice"
}
```

Implemented:

- require signed request auth from the community owner or a member with
  `manage_channels`
- create voice channel metadata in the community
- voice channels do not accept text messages
- calls scoped to community channels must target a voice channel

### Rename channel

```http
PATCH /communities/{communityId}/channels/{channelId}
```

Request:

```json
{
  "name": "announcements"
}
```

Implemented:

- require signed request auth from the community owner or a member with
  `manage_channels`
- rename an existing text or voice channel

### Update channel visibility

```http
PATCH /communities/{communityId}/channels/{channelId}/permissions
```

Request:

```json
{
  "visibleRoleIds": ["everyone", "<roleId>"]
}
```

Implemented:

- require signed request auth from the community owner or a member with
  `manage_channels`
- require at least one visible role; an empty list falls back to `everyone`
- use `visibleRoleIds` to decide whether the authenticated member can list,
  read, write or join a channel
- use `everyone` to make a channel visible to all community members

### Delete channel

```http
DELETE /communities/{communityId}/channels/{channelId}
```

Response:

```json
{
  "id": "<communityId>",
  "networkId": "<networkId>",
  "ownerIdentityId": "<identityId>",
  "name": "Pigeon Lab",
  "description": "Private workspace",
  "memberIds": ["<identityId>"],
  "textChannels": [],
  "voiceChannels": [],
  "visibility": "private",
  "createdAt": 1773848829055
}
```

Implemented:

- require signed request auth from the community owner or a member with
  `manage_channels`
- delete an existing text or voice channel from the community metadata
- when deleting a text channel, delete all stored messages for that channel
- return the updated community resource

### Community realtime metadata events

Community metadata changes are published as WebSocket domain events and routed
to every connected identity in `memberIds`.

Community creation:

```json
{
  "type": "communities.v1.community.was_created",
  "aggregate_id": "<communityId>",
  "attributes": {
    "communityId": "<communityId>",
    "networkId": "<networkId>",
    "ownerIdentityId": "<identityId>",
    "memberIds": ["<identityId>"],
    "community": {
      "id": "<communityId>",
      "networkId": "<networkId>",
      "ownerIdentityId": "<identityId>",
      "name": "Pigeon Lab",
      "description": "Private workspace",
      "memberIds": ["<identityId>"],
      "textChannels": [],
      "voiceChannels": [],
      "visibility": "private",
      "createdAt": 1773848829055
    }
  }
}
```

Channel creation:

```json
{
  "type": "communities.v1.channel.was_created",
  "aggregate_id": "<communityId>",
  "attributes": {
    "communityId": "<communityId>",
    "networkId": "<networkId>",
    "memberIds": ["<identityId>"],
    "channel": {
      "id": "<channelId>",
      "name": "General",
      "type": "text",
      "createdAt": 1773848829055
    }
  }
}
```

Voice channel creation uses the same payload and adds
`connectedIdentityIds: []` inside `channel`.

Other metadata events:

- `communities.v1.channel.was_renamed`: `channelId`, `name`
- `communities.v1.channel.was_deleted`: `channelId`
- `communities.v1.community.was_updated`: full `community`
- `communities.v1.member.was_added`: `identityId` and full updated `community`
- `communities.v1.member.was_left`: `identityId` and full updated `community`
- `communities.v1.membership_request.was_created`: `request`, `requestId`,
  `identityId`, `creatorIdentityId`
- `communities.v1.membership_request.was_accepted`: same request payload after
  state changes to `accepted`
- `communities.v1.membership_request.was_declined`: same request payload after
  state changes to `declined`

Membership request events include identity attributes for WebSocket routing:
`identityId`, `creatorIdentityId`, `requesterIdentityId` and
`ownerIdentityId`.

### Send channel message

```http
POST /communities/{communityId}/channels/{channelId}/messages
```

Request:

```json
{
  "id": "<clientGeneratedMessageId>",
  "createdAt": 1773848829055,
  "encryptedPayload": "<encryptedCommunityChannelMessagePayload>",
  "signature": "<messageSignature>",
  "replyToMessageId": "<messageId>",
  "mentions": [
    {
      "type": "role",
      "targetId": "<roleId>"
    }
  ],
  "attachmentExternalIdentifiers": ["<privateContentCid>"]
}
```

For public communities, send `plaintextPayload` instead of
`encryptedPayload`:

```json
{
  "id": "<clientGeneratedMessageId>",
  "createdAt": 1773848829055,
  "plaintextPayload": "Plain public message that can be indexed",
  "signature": "<messageSignature>",
  "mentions": [],
  "attachmentExternalIdentifiers": []
}
```

Response:

```json
{
  "id": "<messageId>",
  "communityId": "<communityId>",
  "channelId": "<channelId>",
  "authorIdentityId": "<identityId>",
  "encryptedPayload": "<encryptedCommunityChannelMessagePayload>",
  "signature": "<messageSignature>",
  "attachmentExternalIdentifiers": [],
  "mentions": [],
  "replyToMessageId": "<messageId>",
  "reactions": [],
  "type": "sent",
  "createdAt": 1773848829055
}
```

Public community responses contain `plaintextPayload` instead of
`encryptedPayload`.

Implemented:

- require signed request auth from a community member
- require the channel to exist in the community
- require the authenticated member to have channel visibility through their
  roles and `send_messages`
- validate visible mention metadata:
  - `everyone` requires `mention_everyone`
  - `here` requires `mention_here`
  - `role` requires `mention_roles`
  - `identity` mentions do not require a special permission
- store `encryptedPayload` as opaque client-encrypted text for private
  communities
- store `plaintextPayload` as indexable plain text for public communities
- store attachment CIDs only; private attachment bytes must be encrypted by the
  client and published first with `POST /ipfs/private`
- allow threads by sending `replyToMessageId` with the id of an existing
  channel message in the same community channel
- validate the message signature against this canonical payload:

```json
{
  "attachmentExternalIdentifiers": [],
  "authorIdentityId": "<identityId>",
  "channelId": "<channelId>",
  "communityId": "<communityId>",
  "createdAt": 1773848829055,
  "encryptedPayload": "<encryptedCommunityChannelMessagePayload>",
  "id": "<messageId>",
  "mentions": [
    {
      "type": "role",
      "targetId": "<roleId>"
    }
  ],
  "replyToMessageId": "<messageId>",
  "type": "sent"
}
```

For public communities, the canonical payload replaces `encryptedPayload` with
`plaintextPayload` in the same key order used by the backend:

```json
{
  "attachmentExternalIdentifiers": [],
  "authorIdentityId": "<identityId>",
  "channelId": "<channelId>",
  "communityId": "<communityId>",
  "createdAt": 1773848829055,
  "id": "<messageId>",
  "mentions": [],
  "plaintextPayload": "Plain public message that can be indexed",
  "type": "sent"
}
```

The accepted message is published to WebSocket clients as
`communities.v1.channel.message.was_sent`. Frontend can use
`event.aggregate_id` as `communityId`, `event.attributes.channelId` as
`channelId` and `event.attributes.messageId` as the id to fetch or reconcile.

### Edit channel message

```http
PUT /communities/{communityId}/channels/{channelId}/messages/{messageId}
```

Only the original author can edit a community text channel message. The
message keeps the same `id` and `createdAt`; the backend replaces the opaque
encrypted payload and stores the edit timestamp as `editedAt`.

Request:

```json
{
  "createdAt": 1773848929055,
  "encryptedPayload": "<editedEncryptedCommunityChannelMessagePayload>",
  "signature": "<messageEditionSignature>",
  "mentions": [],
  "attachmentExternalIdentifiers": []
}
```

Public community edits send `plaintextPayload` instead of `encryptedPayload`.

The edition signature must be generated from this canonical payload:

```json
{
  "attachmentExternalIdentifiers": [],
  "authorIdentityId": "<identityId>",
  "channelId": "<channelId>",
  "communityId": "<communityId>",
  "createdAt": 1773848929055,
  "encryptedPayload": "<editedEncryptedCommunityChannelMessagePayload>",
  "id": "<messageId>",
  "mentions": [],
  "type": "edited"
}
```

For public communities, the edition canonical payload replaces
`encryptedPayload` with `plaintextPayload`.

The edited message is published to WebSocket clients as
`communities.v1.channel.message.was_edited`. The event attributes include
`communityId`, `channelId`, `messageId`, `memberIds`, `networkId` and the full
updated `message` resource.

### List channel messages

```http
GET /communities/{communityId}/channels/{channelId}/messages?limit=50&beforeMessageId=<messageId>
```

Response:

```json
{
  "communityId": "<communityId>",
  "channelId": "<channelId>",
  "messages": [
    {
      "id": "<messageId>",
      "communityId": "<communityId>",
      "channelId": "<channelId>",
      "authorIdentityId": "<identityId>",
      "createdAt": 1773848869055,
      "editedAt": 1773848929055,
      "encryptedPayload": "<encryptedMessagePayload>",
      "reactions": [
        {
          "authorIdentityId": "<identityId>",
          "createdAt": 1773848829055,
          "emoji": "👍"
        }
      ],
      "type": "sent"
    },
    {
      "id": "<pollId>",
      "type": "poll",
      "creatorIdentityId": "<identityId>",
      "createdAt": 1773848879055,
      "question": "What should we play tonight?",
      "options": [
        { "id": "minecraft", "text": "Minecraft" },
        { "id": "factorio", "text": "Factorio" }
      ],
      "allowsMultipleVotes": false,
      "scope": {
        "type": "community_channel",
        "communityId": "<communityId>",
        "channelId": "<channelId>",
        "networkId": "<networkId>"
      },
      "status": "open",
      "votes": []
    }
  ],
  "nextBeforeMessageId": "<messageId>"
}
```

Public community messages contain `plaintextPayload` instead of
`encryptedPayload`.

### Get community channel thread replies

```http
GET /communities/{communityId}/channels/{channelId}/messages/{messageId}/thread?limit=50
```

Response:

```json
{
  "communityId": "<communityId>",
  "channelId": "<channelId>",
  "messages": [
    {
      "id": "<replyMessageId>",
      "communityId": "<communityId>",
      "channelId": "<channelId>",
      "authorIdentityId": "<identityId>",
      "createdAt": 1773848869055,
      "encryptedPayload": "<encryptedMessagePayload>",
      "replyToMessageId": "<messageId>",
      "reactions": [],
      "type": "sent"
    }
  ],
  "nextBeforeMessageId": "<replyMessageId>"
}
```

Implemented:

- require signed request auth from a community member
- require the member to be able to view the text channel
- return messages whose `replyToMessageId` points to the requested root message
- order replies from oldest to newest

### Community channel drafts

```http
GET /communities/me/drafts
PUT /communities/{communityId}/channels/{channelId}/draft
DELETE /communities/{communityId}/channels/{channelId}/draft
```

Save request:

```json
{
  "encryptedPayload": "<encryptedDraftPayload>",
  "updatedAt": 1773848829055
}
```

List response:

```json
{
  "drafts": [
    {
      "communityId": "<communityId>",
      "channelId": "<channelId>",
      "encryptedPayload": "<encryptedDraftPayload>",
      "updatedAt": 1773848829055
    }
  ]
}
```

Implemented:

- require signed request auth
- drafts are local embedded DB state scoped to the authenticated identity
- the backend treats `encryptedPayload` as opaque client-encrypted data
- saving or deleting a draft requires access to the target text channel

### Community channel pins

```http
GET /communities/{communityId}/channels/{channelId}/pins
POST /communities/{communityId}/channels/{channelId}/messages/{messageId}/pin
DELETE /communities/{communityId}/channels/{channelId}/messages/{messageId}/pin
```

List response:

```json
{
  "communityId": "<communityId>",
  "channelId": "<channelId>",
  "pins": [
    {
      "messageId": "<messageId>",
      "pinnedByIdentityId": "<identityId>",
      "createdAt": 1773848829055,
      "message": {
        "id": "<messageId>",
        "communityId": "<communityId>",
        "channelId": "<channelId>",
        "authorIdentityId": "<identityId>",
        "createdAt": 1773848869055,
        "encryptedPayload": "<encryptedMessagePayload>",
        "reactions": [],
        "type": "sent"
      }
    }
  ]
}
```

Implemented:

- require signed request auth
- listing pins requires channel visibility
- pinning and unpinning requires `manage_messages`
- pins are OrbitDB replicated metadata; message payload documents are not rewritten
- pinning validates that the target channel message exists

### Search public channel messages

```http
GET /communities/{communityId}/channels/{channelId}/messages/search?query=pigeon&limit=20
```

The request is signed as
`GET /communities/{communityId}/channels/{channelId}/messages/search`; query
string values are not part of the signed path.

Implemented:

- require signed request auth from a community member
- require the member to be able to view the text channel
- only work for `visibility: "public"` communities
- search `plaintextPayload`; private encrypted messages are not searchable by
  the backend
- return the same `CommunityChannelMessagesResource` shape as the normal list
  endpoint

### Search public community messages

```http
GET /communities/{communityId}/messages/search?query=pigeon&limit=20
```

The request is signed as `GET /communities/{communityId}/messages/search`;
query string values are not part of the signed path.

Implemented:

- require signed request auth from a community member
- only work for `visibility: "public"` communities
- search `plaintextPayload` across all text channels visible to the
  authenticated member
- exclude hidden channels the member cannot see through roles
- return message resources with their real `channelId`, so frontend can jump
  to the right channel/message
- private encrypted messages are not searchable by the backend

Response:

```json
{
  "communityId": "<communityId>",
  "messages": [
    {
      "id": "<messageId>",
      "communityId": "<communityId>",
      "channelId": "<channelId>",
      "authorIdentityId": "<identityId>",
      "plaintextPayload": "Plain public message that matched",
      "attachmentExternalIdentifiers": [],
      "mentions": [],
      "reactions": [],
      "type": "sent",
      "createdAt": 1773848869055
    }
  ]
}
```

Implemented:

- require signed request auth from a community member
- require the channel to exist in the community
- require the authenticated member to have channel visibility through their
  roles
- return messages ordered from oldest to newest in the page
- include OrbitDB replicated reactions for each message
- include `poll` timeline items scoped to the same community text channel. The
  poll `id` is also registered as a channel message id, so it is valid as
  `beforeMessageId` for pagination.
- do not include call lifecycle system items; community voice channels expose
  active presence through calls/channel state instead of the text timeline
- support `limit` from 1 to 100
- when `beforeMessageId` is provided, return messages older than that message

### Add channel message reaction

```http
POST /communities/{communityId}/channels/{channelId}/messages/{messageId}/reactions
```

Request:

```json
{
  "emoji": "👍"
}
```

Response:

```json
{
  "authorIdentityId": "<identityId>",
  "createdAt": 1773848829055,
  "emoji": "👍"
}
```

Implemented:

- require signed request auth from a community member
- require the channel and target message to exist
- require the authenticated member to have channel visibility through their
  roles and `send_stickers`
- store reactions in OrbitDB replicated metadata; encrypted message documents are
  not rewritten
- keep reactions unique by community id, channel id, message id, author id and
  emoji
- publish `communities.v1.channel.message.reaction.was_added` to community
  members

### Remove channel message reaction

```http
DELETE /communities/{communityId}/channels/{channelId}/messages/{messageId}/reactions
```

Request:

```json
{
  "emoji": "👍"
}
```

Response:

```json
{
  "authorIdentityId": "<identityId>",
  "createdAt": 1773848829055,
  "emoji": "👍"
}
```

Implemented:

- require signed request auth from a community member
- remove only the authenticated member reaction for the provided emoji
- publish `communities.v1.channel.message.reaction.was_removed` to community
  members
- synchronize add/remove events with other nodes through community PubSub
  consumers

### Delete channel message

```http
DELETE /communities/{communityId}/channels/{channelId}/messages/{messageId}
```

Request:

```json
{
  "id": "<clientGeneratedDeletionId>",
  "createdAt": 1773848829055,
  "signature": "<deletionSignature>"
}
```

The deletion signature covers:

```json
{
  "actorIdentityId": "<identityId>",
  "channelId": "<channelId>",
  "communityId": "<communityId>",
  "createdAt": 1773848829055,
  "id": "<clientGeneratedDeletionId>",
  "targetMessageId": "<messageId>",
  "type": "deleted"
}
```

Response:

```json
{
  "id": "<clientGeneratedDeletionId>",
  "communityId": "<communityId>",
  "channelId": "<channelId>",
  "targetMessageId": "<messageId>",
  "deletedByIdentityId": "<identityId>",
  "type": "deleted"
}
```

Implemented:

- require signed request auth from a community member
- require the channel to exist in the community
- allow the message author to delete their own message
- allow the community owner or members with `manage_messages` to delete any
  message in the channel
- validate the deletion signature
- remove the target message from local storage
- publish `communities.v1.channel.message.was_deleted` to community members

### Community keys

The backend does not generate, store or decrypt community keys. Frontend owns
the symmetric community key lifecycle for private communities. Public
communities do not need a community encryption key for channel messages because
they store searchable `plaintextPayload`.

Recommended MVP flow:

- creator generates one symmetric community key when creating the community
- store that key in the creator's encrypted keychain under `communityId`
- when adding a member, encrypt the community key for the recipient identity
  public key
- create a `community_invitation` notification with the encrypted community key
- recipient accepts the notification client-side, decrypts the key locally and
  publishes a new keychain version containing the key under `communityId`

## Notification HTTP API

Notifications are for actionable events that require client-side identity
material, such as accepting a conversation invitation, and for durable UX
alerts such as missed calls. Message delivery does not create notifications.

### List notifications

```http
GET /notifications?limit=20&beforeNotificationId=<notificationId>
```

Implemented:

- require signed request auth
- return notifications where the authenticated identity is the recipient
- support `limit` and `beforeNotificationId`
- can include backend-created `missed_call` notifications for conversation
  calls

### Create an invitation notification

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

Group conversation invitation request:

```json
{
  "type": "group_conversation_invitation",
  "conversationId": "group:<deterministic-id>",
  "inviterIdentityId": "<aliceIdentityId>",
  "recipientIdentityId": "<bobIdentityId>",
  "encryptedConversationKey": "<encryptedForBob>",
  "inviterSignature": "<inviterSignature>"
}
```

Community invitation request:

```json
{
  "type": "community_invitation",
  "communityId": "<communityId>",
  "inviterIdentityId": "<aliceIdentityId>",
  "recipientIdentityId": "<bobIdentityId>",
  "encryptedCommunityKey": "<encryptedForBob>",
  "inviterSignature": "<inviterSignature>"
}
```

Implemented:

- require signed request auth from the inviter
- persist the notification in OrbitDB replicated metadata
- store encrypted key material as opaque payload only
- keep private keys and decrypted conversation keys out of the backend
- group conversation invitations use the same encrypted conversation key payload
  as 1to1 invitations; the `type` tells the client which UX to show
- `missed_call` notifications are not client-created; the call timeout
  scheduler creates them when ringing participants time out in conversation
  calls

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

## Notification Settings HTTP API

Notification settings are authenticated, per-identity preferences stored in
OrbitDB replicated state. They are not published to IPFS.

Scopes:

- `conversation`: applies to one conversation.
- `community`: applies to one community.
- `community_channel`: applies to one community text/voice channel and overrides
  the parent community setting.

Resolution order:

1. exact `community_channel` setting
2. parent `community` setting
3. default behavior

Conversation settings do not inherit from communities.

Default behavior when no explicit setting exists:

- `notificationLevel`: `all`
- `mutedUntil`: omitted
- `suppressEveryoneAndHere`: `false`
- `suppressRoleMentions`: `false`
- `mobilePushEnabled`: `true`
- `hideMutedChannels`: `false`

`mutedUntil` semantics:

- omitted: not muted
- integer timestamp in milliseconds: muted until that instant
- `null`: muted until the setting is reset

`notificationLevel` values:

- `all`: push can be delivered for all matching events.
- `mentions`: push is delivered only when backend receives mention metadata for
  the recipient, `@everyone`/`@here`, or a mentioned role.
- `none`: push is not delivered for that scope.

Backend currently uses these settings to suppress Web Push delivery. WebSocket
events are still delivered so clients can keep local state synchronized.
Frontend should use the same settings locally for sounds, badges, visible
notification counters and "hide muted channels".

Mention-only behavior depends on message events carrying mention metadata:

```json
{
  "mentionedIdentityIds": ["<identityId>"],
  "mentionedRoleMemberIds": ["<identityId>"],
  "mentionsEveryoneOrHere": true
}
```

For encrypted messages where backend cannot inspect the payload, frontend must
send/publish this metadata if it wants backend-side `mentions` filtering to be
accurate. Without metadata, `mentions` behaves as "do not push ordinary
messages".

### List notification settings

```http
GET /notification-settings/
```

Requires signed request headers. Returns only the authenticated identity's
explicit overrides:

```json
{
  "scopes": [
    {
      "scope": {
        "type": "community_channel",
        "communityId": "6a...",
        "channelId": "6b..."
      },
      "notificationLevel": "mentions",
      "mutedUntil": 1780000000000,
      "suppressEveryoneAndHere": true,
      "suppressRoleMentions": false,
      "mobilePushEnabled": true,
      "hideMutedChannels": true,
      "updatedAt": 1780000000000
    }
  ]
}
```

### Upsert scope notification settings

```http
PUT /notification-settings/scopes
```

Signed body examples:

Mute a conversation until manually reset:

```json
{
  "scope": {
    "type": "conversation",
    "conversationId": "one-to-one:..."
  },
  "notificationLevel": "none",
  "mutedUntil": null,
  "mobilePushEnabled": false
}
```

Set a community channel to mentions only:

```json
{
  "scope": {
    "type": "community_channel",
    "communityId": "6a...",
    "channelId": "6b..."
  },
  "notificationLevel": "mentions",
  "suppressEveryoneAndHere": false,
  "suppressRoleMentions": true,
  "mobilePushEnabled": true,
  "hideMutedChannels": false
}
```

Response is the updated scope resource.

### Reset scope notification settings

```http
DELETE /notification-settings/scopes
```

Signed body:

```json
{
  "scope": {
    "type": "community",
    "communityId": "6a..."
  }
}
```

Deletes the explicit override. The scope then inherits from its parent/default.

## Push Notification HTTP API

PWA Web Push is used only as a wake-up/UX channel for the browser. It does not
replace WebSocket realtime and it does not carry decrypted message content.

Backend sends push for:

- conversation messages
- community text channel messages
- invitation notifications
- missed-call notifications
- incoming conversation calls

When the recipient presence is `busy`, backend suppresses pushes for message
and call categories. Invitation notifications are still delivered. Notification
settings can additionally suppress push delivery by conversation, community or
community channel.

Server operators must configure:

```env
PUSH_VAPID_PUBLIC_KEY=<base64urlPublicKey>
PUSH_VAPID_PRIVATE_KEY=<base64urlPrivateKey>
PUSH_VAPID_SUBJECT=mailto:admin@example.com
```

Generate VAPID keys once per deployment:

```bash
npx web-push generate-vapid-keys
```

After changing VAPID values, restart the backend process. Docker deployments
must also include the `web-push` package in runtime dependencies; verify with:

```bash
node -e "console.log(require.resolve('web-push'))"
```

If VAPID keys are not configured, subscription endpoints still work but backend
does not send outbound Web Push requests.

### Get VAPID public key

```http
GET /push/vapid-public-key
```

Response:

```json
{
  "enabled": true,
  "publicKey": "<base64urlPublicKey>"
}
```

Frontend passes `publicKey` to
`pushManager.subscribe({ applicationServerKey })`.
`enabled` is `true` only when both public and private VAPID keys are configured.

### Register push subscription

```http
PUT /push/subscriptions
```

Requires signed HTTP headers. The authenticated identity owns the subscription.

Request body is the browser `PushSubscription.toJSON()` shape. The endpoint must use a supported Web Push provider host (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, or `web.push.apple.com`):

```json
{
  "endpoint": "https://web.push.apple.com/send/...",
  "expirationTime": null,
  "keys": {
    "p256dh": "<browserP256dhKey>",
    "auth": "<browserAuthSecret>"
  }
}
```

Response:

```json
{
  "endpoint": "https://web.push.apple.com/send/...",
  "expirationTime": null,
  "identityId": "<identityId>"
}
```

Call this after login/session restore and whenever the browser gives frontend a
new subscription.

### Remove push subscription

```http
DELETE /push/subscriptions
```

Requires signed HTTP headers. Send the same body shape used to register the
subscription. Backend removes only subscriptions belonging to the authenticated
identity.

Response:

```json
{
  "deleted": true
}
```

Backend also removes stale subscriptions automatically when the push provider
returns `404` or `410`.

Push delivery failures are logged with structured JSON including:

- `endpoint`
- `endpointHost`
- `statusCode`
- `error`
- `shouldDeleteSubscription`

### Send test push

```http
POST /push/test
```

Requires signed HTTP headers. Use this to isolate backend/provider delivery
from service worker handling. Send an empty body to test every subscription for
the authenticated identity, or pass one concrete endpoint to test only that
subscription.

Request body:

```json
{
  "endpoint": "https://web.push.apple.com/..."
}
```

Response:

```json
{
  "deliveries": [
    {
      "endpoint": "https://web.push.apple.com/...",
      "endpointHost": "web.push.apple.com",
      "delivered": false,
      "statusCode": 403,
      "error": "Web Push delivery failed.",
      "removed": false
    }
  ]
}
```

`removed` is `true` when the provider returned `404` or `410` and backend
removed the stale subscription.

## Stickers API

Sticker files are public IPFS assets. Upload the binary first with
`POST /ipfs/public`, then store the returned CID in sticker metadata. The
sticker pack metadata lives in OrbitDB replicated state and is returned through
this API.

Current limits:

- static stickers: max 512 KiB
- animated stickers: max 64 KiB
- video stickers: max 256 KiB
- dimensions: max 512x512

### Create sticker pack

```http
POST /stickers/packs
```

Requires signed HTTP headers. The authenticated identity becomes the pack owner.
The created pack is automatically added to the authenticated identity sticker
library as a saved pack.

Body:

```json
{
  "name": "Blue archive reactions"
}
```

### List sticker packs

```http
GET /stickers/packs?ownerIdentityId=<identityId>
```

`ownerIdentityId` is optional. Without it, the endpoint returns known packs.

### Get sticker pack

```http
GET /stickers/packs/{packId}
```

### Get my sticker library

```http
GET /stickers/me
```

Requires signed HTTP headers. Returns the authenticated identity sticker
library:

```json
{
  "savedPacks": [],
  "favoriteStickers": [
    {
      "packId": "01J...",
      "stickerId": "01J...",
      "favoritedAt": 1770000000000,
      "sticker": {
        "id": "01J...",
        "type": "static",
        "assetCid": "bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq",
        "contentType": "image/png",
        "sizeBytes": 215040,
        "dimensions": {
          "width": 512,
          "height": 512
        }
      }
    }
  ],
  "recentStickers": [
    {
      "packId": "01J...",
      "stickerId": "01J...",
      "usedAt": 1770000000000,
      "sticker": {
        "id": "01J...",
        "type": "static",
        "assetCid": "bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq",
        "contentType": "image/png",
        "sizeBytes": 215040,
        "dimensions": {
          "width": 512,
          "height": 512
        }
      }
    }
  ]
}
```

`recentStickers` keeps the last 10 stickers explicitly reported by the client.
The backend cannot infer recent stickers from encrypted message payloads, so the
client must call the usage endpoint after a sticker message is sent
successfully.

### Save sticker pack

```http
PUT /stickers/packs/{packId}/saved
```

Requires signed HTTP headers. Adds the pack to the authenticated identity
library and returns the updated library.

### Remove saved sticker pack

```http
DELETE /stickers/packs/{packId}/saved
```

Requires signed HTTP headers. Removes the pack from the authenticated identity
library and returns the updated library.

### Update sticker pack

```http
PATCH /stickers/packs/{packId}
```

Requires signed HTTP headers from the pack owner.

Body:

```json
{
  "name": "Updated pack name"
}
```

### Add sticker

```http
POST /stickers/packs/{packId}/stickers
```

Requires signed HTTP headers from the pack owner.

Body:

```json
{
  "type": "static",
  "assetCid": "bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq",
  "contentType": "image/png",
  "sizeBytes": 215040,
  "dimensions": {
    "width": 512,
    "height": 512
  }
}
```

Supported `type` values:

- `static`
- `animated`
- `video`

### Update sticker

```http
PATCH /stickers/packs/{packId}/stickers/{stickerId}
```

Requires signed HTTP headers from the pack owner. Body is the same as add
sticker.

### Remove sticker

```http
DELETE /stickers/packs/{packId}/stickers/{stickerId}
```

Requires signed HTTP headers from the pack owner.

### Favorite sticker

```http
PUT /stickers/packs/{packId}/stickers/{stickerId}/favorite
```

Requires signed HTTP headers. The sticker must exist. Returns the updated
authenticated identity sticker library.

### Remove favorite sticker

```http
DELETE /stickers/packs/{packId}/stickers/{stickerId}/favorite
```

Requires signed HTTP headers. Returns the updated authenticated identity sticker
library.

### Record sticker usage

```http
POST /stickers/packs/{packId}/stickers/{stickerId}/used
```

Requires signed HTTP headers. The sticker must exist. Returns the updated
authenticated identity sticker library with the sticker moved to the front of
`recentStickers`. The list is capped at 10 entries.

## Polls API

Polls are interactive timeline items. They can live in a community text channel
or in a group conversation.

Group conversation polls are also registered as conversation message ids. The
poll `id` returned in the conversation messages timeline can be used by the
next message as `previousMessageIds: ["<pollId>"]`.

Community text channel polls are also registered as channel message ids. The
poll `id` returned in the community channel messages timeline can be used as
`beforeMessageId` in pagination.

Poll resources include `"type": "poll"` and are also returned inside the
existing `messages` arrays for their scope:

- `GET /conversations/{conversationId}/messages` for group conversation polls
- `GET /communities/{communityId}/channels/{channelId}/messages` for community
  text channel polls

Poll events are emitted through websocket as domain events:

- `polls.v1.poll.was_created`
- `polls.v1.vote.was_cast`
- `polls.v1.vote.was_removed`
- `polls.v1.poll.was_closed`

Community poll events include `memberIds` for realtime routing. Group
conversation poll events include `participantIds`.

### Create poll

```http
POST /polls/
```

Requires signed HTTP headers.

Community channel poll:

```json
{
  "scopeType": "community_channel",
  "communityId": "<communityId>",
  "channelId": "<textChannelId>",
  "question": "What should we play tonight?",
  "options": [
    { "id": "minecraft", "text": "Minecraft" },
    { "id": "factorio", "text": "Factorio" }
  ],
  "allowsMultipleVotes": false,
  "expiresAt": null
}
```

Group conversation poll:

```json
{
  "scopeType": "group_conversation",
  "conversationId": "<groupConversationId>",
  "question": "Pizza or sushi?",
  "options": [
    { "id": "pizza", "text": "Pizza" },
    { "id": "sushi", "text": "Sushi" }
  ],
  "allowsMultipleVotes": true
}
```

Rules:

- community channel polls require membership, channel visibility and
  `create_polls`
- group conversation polls require the authenticated identity to be a
  participant of a `group` conversation
- a poll must have 2-10 options
- option ids are client-provided stable strings unique inside the poll
- question max length is 200 characters
- option text max length is 120 characters
- `expiresAt`, when provided, is an epoch millisecond deadline; after that
  instant the poll is treated as closed and rejects new votes

### Get poll

```http
GET /polls/{pollId}
```

Requires signed HTTP headers and access to the poll scope.

### Cast vote

```http
POST /polls/{pollId}/votes
```

Requires signed HTTP headers and access to the poll scope.

```json
{
  "optionIds": ["pizza"]
}
```

Sending a new vote replaces the authenticated identity's previous vote. Polls
with `allowsMultipleVotes: false` accept exactly one option id.
Expired or manually closed polls reject new votes.

### Remove own vote

```http
DELETE /polls/{pollId}/votes/me
```

Requires signed HTTP headers and access to the poll scope.

### Close poll

```http
POST /polls/{pollId}/close
```

Requires signed HTTP headers and access to the poll scope. Closed or expired
polls reject new votes.

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

## Node-to-Node Flow

Client realtime does not replace PubSub. The intended flow is:

```text
Client A -> Node A: POST /conversations/{id}/messages
Node A -> IPFS: store immutable encrypted message document
Node A -> OrbitDB: index replicated metadata
Node A -> DomainEventPublisher: publish accepted domain event
Node A -> PubSub: announce conversation message
Node B <- PubSub: receive announcement
Node B -> IPFS: fetch message document
Node B -> Domain: validate candidate
Node B -> OrbitDB: project valid replicated metadata
Node B -> Client B: WebSocket message event
```

Planned:

- define PubSub DTOs separately from WebSocket DTOs
- define idempotency keys shared by PubSub consumers
- define anti-entropy fallback when PubSub is missed
- define how nodes discover conversation participants' preferred nodes

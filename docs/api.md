# Pigeon Swarm API

Last updated: 2026-05-12.

This document describes the HTTP API currently implemented by the node. Planned
or intentionally unsupported API shapes are kept in the final
[Planned API](#planned-api) section so they are not confused with the usable
contract.

## Principles

- Clients talk to their selected node through HTTP and WebSocket.
- Nodes talk to other nodes through PubSub and IPFS/Helia. Private-network
  metadata discovery is replicated by OrbitDB, not by the public DHT.
- The browser/mobile client must not subscribe directly to the node-to-node
  PubSub mesh.
- The node filters permissions before pushing realtime events to a client.
- HTTP commands create validated domain changes.
- WebSocket events notify already accepted or synchronized changes.
- IPFS external identifiers may appear in API responses only as opaque external
  identifiers, never as domain concepts.
- Node-to-node missed-message recovery is handled by the backend sync
  consumers and is not part of the browser/mobile HTTP contract.

## Client compatibility discovery

`GET /client-contract` is public and requires no identity or signed request.
Apply the configured `ROUTE_PREFIX`, for example `/api/client-contract`.
It returns HTTP 200 with `Content-Type: application/json`,
`Cache-Control: no-store`, and exactly:

```json
{ "protocol": "pigeon-swarm", "apiVersion": 2 }
```

`apiVersion` identifies the breaking-major client API contract implemented by
this node. It is independent of the node software release and cannot be set by
an operator. Breaking changes to client-visible HTTP or WebSocket behavior
require a new major contract version and coordinated client support; compatible
additions retain the version. Independent clients check the protocol and their
supported version before enabling node features, and reject an unknown or
unsupported contract. A failed or missing discovery response does not establish
compatibility. Discovery responses contain declarative data only, never scripts,
module locations, or executable code URLs.

This endpoint uses the existing API CORS policy, including cross-origin GET and
OPTIONS preflight. It does not grant browser permissions or bypass browser
mixed-content or local-network restrictions. Clients must use a node URL that
their browser can reach.

## Authentication

Authenticated endpoints use a canonical request signature:

```http
X-Identity-Id: <identityId>
X-Timestamp: <timestamp>
X-Signature: <signature>
```

Implemented:

- canonical request payload: method, path, timestamp and body hash
- canonical payload `timestamp` is a JSON number; HTTP headers and WebSocket
  query parameters still carry it as text
- timestamp freshness validation with a 30 second maximum clock skew
- replay rejection: a mutating (non-GET/HEAD/OPTIONS) signed request or
  WebSocket upgrade whose identity and signature were already accepted inside
  the freshness window is rejected with `401`; the guard is in-memory and per
  node
- Cucumber scenarios for invalid and stale signed requests

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
const timestamp = Date.now();
const body = {};
const canonicalPayload = {
  bodyHash: sha256(JSON.stringify(body)),
  method: 'GET',
  path,
  timestamp,
};
const signature = sign(JSON.stringify(canonicalPayload));
const url =
  `ws://localhost:8080${path}` +
  `?identityId=${encodeURIComponent(identityId)}` +
  `&timestamp=${encodeURIComponent(String(timestamp))}` +
  `&signature=${encodeURIComponent(signature)}`;
const socket = new WebSocket(url);
```

Non-browser clients may send the same signature through headers:

```http
X-Identity-Id: <identityId>
X-Timestamp: <timestamp>
X-Signature: <signature>
```

The signed path is the WebSocket path without query string. If `ROUTE_PREFIX`
is configured, sign `<ROUTE_PREFIX>/ws`. Each signed upgrade URL is single-use.

Per node, upgrades are rate limited per remote address and total open sockets
are capped; excess upgrades receive `429 Too Many Requests` before signature
verification. A socket sending more than 200 client messages in 10 seconds is
closed with code `1008`.

Connection acknowledgement:

```json
{
  "type": "connection_ack",
  "identityId": "<identityId>"
}
```

The server immediately follows the acknowledgement with the current live
network synchronization snapshot. It publishes the same message again whenever
libp2p connectivity or OrbitDB store membership changes:

```json
{
  "type": "network_synchronization_status",
  "status": {
    "changedAt": 1770000000000,
    "networks": []
  }
}
```

The status is runtime telemetry and is not persisted. `converged` means that
every OrbitDB store has completed its head exchange with every replication peer
currently known to this node. It cannot represent a global percentage: peers
that are offline, disconnected, or have not yet been discovered are unknowable
in an eventually consistent network.

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
Presence is runtime state kept in node memory and replicated to peers through
domain events. It is not written to OrbitDB/IPFS and resets when the node
restarts.

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

Call signal acknowledgement:

```json
{
  "signalId": "<signalId>",
  "type": "call_signal_ack"
}
```

Send it only after the corresponding `calls.v1.signal.sent` payload has been
successfully applied to the local `RTCPeerConnection`. The backend derives the
recipient from the authenticated WebSocket and ignores client-supplied identity
fields. A retry uses the same `signalId`: acknowledge it again, but do not
apply its SDP or ICE payload twice.

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
- reject stale timestamps outside the 30 second freshness window
- push domain events after they have been published by the local node
- deliver identity events only to the matching identity connection
- deliver keychain events only to the matching keychain owner
- deliver notification events only to the notification recipient
- deliver conversation events only to the conversation participants when the
  event carries `participantIds`
- deliver conversation call snapshots only to currently authorized participants;
  community call snapshots go to clients with current voice-channel access
- deliver call signals only to `recipientIdentityId`
- deliver node-wide events, such as heartbeat/peer updates, to all
  authenticated WebSocket clients on the local node
- drop non-node events that do not carry enough identity information to route
  them safely

Event contracts used by frontend:

| Event type                                            | Aggregate id      | Attributes used by clients/routing                                                                                         |
| ----------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `conversations.v1.message.was_sent`                   | conversation id   | `messageId`, `authorId`, `networkId`, `participantIds`                                                                     |
| `conversations.v1.message.was_edited`                 | conversation id   | `messageId`, `targetMessageId`, `networkId`, `participantIds`                                                              |
| `conversations.v1.message.was_deleted`                | conversation id   | `messageId`, `targetMessageId`, `networkId`, `participantIds`                                                              |
| `conversations.v1.message.was_pinned`                 | conversation id   | `messageId`, `pinnedByIdentityId`, `networkId`, `participantIds`                                                           |
| `conversations.v1.message.was_unpinned`               | conversation id   | `messageId`, `unpinnedByIdentityId`, `networkId`, `participantIds`                                                         |
| `conversations.v1.messages.were_read`                 | conversation id   | `messageId`, `readerIdentityId`, `networkId`, `participantIds`                                                             |
| `conversations.v1.message.reaction.was_added`         | conversation id   | `messageId`, `authorId`, `emoji`, `createdAt`, `networkId`, `participantIds`                                               |
| `conversations.v1.message.reaction.was_removed`       | conversation id   | `messageId`, `authorId`, `emoji`, `createdAt`, `networkId`, `participantIds`                                               |
| `calls.v1.call.snapshot_changed`                      | call id           | `callId`, `liveCallRevision`, `liveCall`                                                                                   |
| `calls.v1.call.started`                               | call id           | `callId`, `liveCallRevision`, `liveCall`                                                                                   |
| `calls.v1.participant.joined`                         | call id           | `callId`, `liveCallRevision`, `liveCall`                                                                                   |
| `calls.v1.participant.left`                           | call id           | `callId`, `liveCallRevision`, `liveCall`                                                                                   |
| `calls.v1.participant.declined`                       | call id           | `callId`, `liveCallRevision`, `liveCall`                                                                                   |
| `calls.v1.participant.missed`                         | call id           | `callId`, `liveCallRevision`, `liveCall`                                                                                   |
| `calls.v1.call.ended`                                 | call id           | `callId`, `liveCallRevision`, `liveCall`                                                                                   |
| `calls.v1.call.missed`                                | call id           | `callId`, `liveCallRevision`, `liveCall`                                                                                   |
| `calls.v1.signal.sent`                                | call id           | `signalId`, `callId`, `senderIdentityId`, `recipientIdentityId`, `signalType`, `payload`, `attempt`, `sentAt`, `expiresAt` |
| `calls.v1.participant_lease.was_updated`              | call id           | `callId`, `liveCallRevision`, `liveCall`                                                                                   |
| `communities.v1.community.was_created`                | community id      | `communityId`, `networkId`, `ownerIdentityId`, `memberIds`, `community`                                                    |
| `communities.v1.channel.was_created`                  | community id      | `communityId`, `networkId`, `memberIds`, `channel`                                                                         |
| `communities.v1.channel.was_renamed`                  | community id      | `communityId`, `networkId`, `memberIds`, `channelId`, `name`                                                               |
| `communities.v1.channel.was_deleted`                  | community id      | `communityId`, `networkId`, `memberIds`, `channelId`                                                                       |
| `communities.v1.community.was_updated`                | community id      | `communityId`, `networkId`, `memberIds`, `community`                                                                       |
| `communities.v1.member.was_added`                     | community id      | `communityId`, `networkId`, `memberIds`, `identityId`, `community`                                                         |
| `communities.v1.member.was_left`                      | community id      | `communityId`, `networkId`, `memberIds`, `identityId`, `community`                                                         |
| `communities.v1.channel.message.was_sent`             | community id      | `communityId`, `channelId`, `messageId`, `authorIdentityId`, `networkId`, `memberIds`                                      |
| `communities.v1.channel.message.was_deleted`          | community id      | `communityId`, `channelId`, `messageId`, `targetMessageId`, `deletedByIdentityId`, `networkId`, `memberIds`                |
| `communities.v1.channel.message.was_pinned`           | community id      | `communityId`, `channelId`, `messageId`, `pinnedByIdentityId`, `networkId`, `memberIds`                                    |
| `communities.v1.channel.message.was_unpinned`         | community id      | `communityId`, `channelId`, `messageId`, `unpinnedByIdentityId`, `networkId`, `memberIds`                                  |
| `communities.v1.channel.message.reaction.was_added`   | community id      | `communityId`, `channelId`, `messageId`, `authorIdentityId`, `emoji`, `createdAt`, `networkId`, `memberIds`                |
| `communities.v1.channel.message.reaction.was_removed` | community id      | `communityId`, `channelId`, `messageId`, `authorIdentityId`, `emoji`, `createdAt`, `networkId`, `memberIds`                |
| `polls.v1.poll.was_created`                           | poll scope id     | `pollId`, `poll`, `participantIds` for group conversations                                                                 |
| `stickers.v1.pack.was_created`                        | sticker pack id   | `packId`, `ownerIdentityId`, `pack`                                                                                        |
| `stickers.v1.user_library.was_created`                | identity id       | `identityId`, `library`                                                                                                    |
| `notifications.v1.notification.was_created`           | notification id   | `recipientIdentityId`, `type`                                                                                              |
| `notifications.v1.notification.was_accepted`          | notification id   | `recipientIdentityId`                                                                                                      |
| `notifications.v1.notification.was_declined`          | notification id   | `recipientIdentityId`                                                                                                      |
| `identities.v1.identity.was_created`                  | identity id       | `externalIdentifier`, `handle`, `networkIds`, `previousExternalIdentifier`, `version`                                      |
| `identities.v1.identity.was_updated`                  | identity id       | `externalIdentifier`, `handle`, `networkIds`, `previousExternalIdentifier`, `version`                                      |
| `keychains.v1.keychain.was_published`                 | owner identity id | owner is the aggregate id                                                                                                  |
| `nodes.v1.node.heartbeat.was_sent`                    | node id           | `owner`, `networks` with `id`, `name` and `type`                                                                           |
| `nodes.v1.node.network.was_added`                     | node id           | node/network metadata                                                                                                      |
| `nodes.v1.node.network.was_removed`                   | node id           | `networkId`                                                                                                                |
| `nodes.v1.node.relay_configuration.was_updated`       | node id           | `relayConfiguration`                                                                                                       |

For `conversations.v1.message.*`, use `event.aggregate_id` as
`conversationId` and `event.attributes.messageId` as the message id to fetch.
For `conversations.v1.messages.were_read`, use `event.aggregate_id` as
`conversationId` and refresh the conversation unread counters if needed.

For call lifecycle and signalling events, use `event.aggregate_id` as
`callId`. Browser notifications for `calls.v1.participant_lease.was_updated`
also use the call ID; composite node-owned lease IDs remain internal. Calls
are signalling only: audio/video media is negotiated by frontend with WebRTC.
The backend stores active call state and routes lifecycle/signalling events to
the authenticated participants.

## Calls HTTP API

Calls can be scoped to a one-to-one conversation, a group conversation or a
community voice channel. All endpoints require signed request authentication.

### List active calls

```http
GET /calls
```

Returns active calls associated with the authenticated identity, filtered by current conversation membership or voice-channel permissions. Former participation does not preserve access.

### List call history

```http
GET /calls/history
```

Returns active and finished conversation calls where the authenticated identity participated and still has conversation access. Historical participant states and lifecycle timestamps are available only through this history contract. Community voice-channel histories are excluded.

### Get call

```http
GET /calls/{callId}
```

Returns a minimal snapshot after checking current scope access. `participantIds`
and `participants` contain only authorized connected participants and current
ringing invitees. Departed/expired participants, join/leave timestamps, heartbeat
timestamps and remote transport diagnostics are omitted. Community snapshots omit `creatorIdentityId`,
`createdAt`, `endedAt` and `endedByIdentityId`; conversation snapshots retain the
caller and lifecycle times needed for incoming-call and ended-call UI.
A community member with current channel access can inspect its live snapshot
without having joined. Conversation reads additionally require call participation.

Apply `event.attributes.liveCall` directly from call WebSocket notifications.
`liveCallRevision` is a monotonically increasing counter from the connected
server, not an OrbitDB revision or cross-node clock. Reset revision tracking on
each connection acknowledgement; reject older/duplicate revisions per call.
Load the call list on initial connection/reconnect, preserving any newer
WebSocket snapshots received while the recovery request was outstanding.
Recovery makes at most three attempts with one- and two-second delays, deduplicates
pending requests and discards responses from an earlier connection generation.
Malformed snapshots trigger bounded per-call recovery; stale revisions do not.
Stable heartbeats do not trigger full-call GETs. ICE negotiation and actual audio remain separate from presence.

Community starts for the same known session use a shared, scoped identifier
across nodes. Explicit termination advances a persisted session epoch on the
next start; clock differences do not determine that epoch.

### Presence retention

Runtime leases are memory-only. A lease expires after five seconds without a
heartbeat, checked by the scheduled expiration pass; disconnected entries are
purged after sixty seconds. Local expiry updates local clients but is never
republished as a claim by the remote owner. Only the owner publishes its own
disconnection. Stable heartbeat traffic remains necessary between nodes.

Community sessions retire only on an explicit end operation. A local final
departure cannot safely prove that no concurrent remote join exists. Lifecycle
participant tombstones are retained for deterministic merging of delayed and out-of-order OrbitDB
updates. Abruptly disconnected participants are absent from live snapshots even
while a lifecycle tombstone remains. Conversation history is a separate,
currently authorized use case. These changes do not erase existing OrbitDB/IPFS
log entries, backups, or copies held by another node; replicated lifecycle data
still requires the storage migration and metadata work tracked separately.
An API omission is not cryptographic deletion or protection from a malicious
node that already holds the replicated records.

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
  "iceTransportPolicy": "all",
  "diagnostics": {
    "turnSharedSecretConfigured": true,
    "turnSource": "local-configuration",
    "nonPublicTurnUrls": []
  }
}
```

The `diagnostics` block describes configuration, not live connectivity:

- `turnSharedSecretConfigured` is false when the secret is missing or equals
  the known public secret. Locally issued shared-secret credentials are then omitted.
  Explicit local static credentials and credentials obtained from a private-network relay can still be returned.
- `turnSource` reports whether the TURN URLs come from this node's local
  configuration, from a signed record of a connected relay, or from neither,
  even when no credentials are available.
- `nonPublicTurnUrls` flags common private IP and local hostname forms.
  Such hosts may work over LAN or VPN. Public hosts are not guaranteed reachable.
  This field does not test DNS, credential acceptance, NAT traversal or media.

Implemented:

- require signed request auth before exposing relay credentials
- read TURN servers from `CALLS_TURN_URLS`, as a comma-separated list
- derive local TURN server URLs from node `relayConfiguration.publicHost` plus
  `relayConfiguration.callsRelay.port` when `CALLS_TURN_URLS` is not enough
- generate local/v1 temporary coturn REST credentials per authenticated identity using
  a configured private `CALLS_TURN_SHARED_SECRET`:
  `username=<expiresAtUnix>:<identityId>` and
  `credential=base64(hmac-sha1(username, CALLS_TURN_SHARED_SECRET))`
- publish signed v1 records on public IPFS networks and v2 records on shared
  private networks when at least one local TURN URL and a private local secret are configured
- use the node's locally configured TURN URLs when it exposes a calls relay
- otherwise include TURN URLs only from signed call relay records whose
  `peerId` matches a currently connected circuit relay; records from unrelated
  or disconnected relays are ignored
- for v1 shared pools, require issuers and selected coturn servers to use the same private secret
- for v2 private-network relays, request credentials from the connected relay owner over an encrypted authenticated libp2p stream; independent deployments keep different master secrets
- reuse v2 credentials for up to ten minutes, refreshing thirty seconds before expiry and checking relay eligibility on every lookup; usernames contain a stable per-peer opaque subject rather than an application identity
- limit v2 issuance to ten requests per peer and one hundred globally per minute; credentials never enter pubsub or replicated storage
- use `CALLS_TURN_CREDENTIAL_TTL_SECONDS` to control locally issued v1 credential
  lifetime; it must be a positive whole number of seconds whose resulting Unix
  expiry is a safe integer, otherwise it defaults to `3600`
- keep `CALLS_TURN_USERNAME` and `CALLS_TURN_CREDENTIAL` only as a local/dev
  override for locally configured TURN URLs when no custom shared secret exists
- default `iceTransportPolicy` to `all` so clients can fall back to direct ICE
  candidates when an advertised TURN service is unreachable
- allow operators to set `CALLS_ICE_TRANSPORT_POLICY=relay` explicitly only
  after verifying that coturn is reachable from every supported client network
- include STUN servers only when `CALLS_STUN_URLS` is explicitly configured
- allow `CALLS_ICE_TRANSPORT_POLICY=all` explicitly as well as by default

#### Credential renewal and configuration changes

Each authenticated request reads the current relay settings. Locally issued v1
credentials get a new expiry measured from that request; requests within the
same second may return identical credentials. For v2, a connected private-network
relay owner issues ten-minute credentials with an opaque peer subject. Eligible
cached credentials are reused until thirty seconds before expiry or a newer
signed advertisement invalidates them; each lookup does not extend their lifetime.
The Unix timestamp before the first `:` is the expiry in seconds. Static
credentials have no expiry encoded by this endpoint. Independent v2 relay owners
keep their own master secrets; clients obtain temporary credentials over encrypted
authenticated streams rather than sharing those secrets.

Clients must request configuration again before an ICE restart and apply the
returned servers before creating the restart offer. Do not cache temporary
credentials beyond their expiry. Expiry prevents new TURN authentication; it
does not promise to terminate an existing allocation at that instant. Replacing
the server list does not migrate an established media path by itself.

Independent TURN deployments use their own secrets and locally configured URLs.
Every URL in one returned server entry must accept the same credentials. Nodes
issuing local credentials for a v1 pool must use the secret configured on
every server in that pool; v1 records must prove that pool membership. V2 owners
issue their own credentials over a private encrypted stream and do not share
master secrets between deployments.
Static credentials are never applied to a discovered remote server.

Rotate a v1 pool secret by updating its issuers and coturn servers and
restarting them together. For v2, coordinate only the owner backend and its own
coturn; newer owner advertisements invalidate requesting nodes' cached credentials. Environment-based secret rotation is not a hot-reload contract;
restart also discards the in-memory discovery cache. Existing clients fetch new
credentials during recovery. This procedure can interrupt calls: the endpoint
does not provide overlapping old/new secrets or seamless migration.

Relay URL changes propagate in signed publications. For each peer, a record
with a strictly newer `issuedAt` replaces its predecessor even when its expiry
is earlier. Equal or older publications cannot restore previous URLs. Expired
records are excluded from selection. Issuers should keep their clocks synchronized;
record timestamps are not a consensus sequence or a defense against a compromised
member of the trusted pool.

#### Acceptance evidence

`yarn test:e2e:turn-credentials` requires Docker and the
`coturn/coturn:4.11.0-r0-alpine` image. It exercises production credential issuance
and signed discovery with real keys against isolated coturn servers: independent
secrets, a shared pool, wrong-secret rejection, expiry, renewal and coordinated
restart. The harness removes its containers and network and reports cleanup
failures as failures. It does not simulate a public NAT.

The wrapper's `tests/turn-media.integration.mjs` covers signed HTTP credential
requests from the real backend and Chromium audio over UDP, TCP and TLS before
and after coturn restart. `tests/two-node-call.integration.mjs` covers application
signalling and browser audio between two nodes with independent TURN secrets.
External NAT/CGNAT and user-observed audio acceptance remain tracked separately
in [deployment #29](https://github.com/haskou/pigeon-swarm/issues/29).

TURN improves NAT traversal and hides peer IPs from the other participant, but
it does not make large group calls cheap. A mesh group call still creates one
peer connection per participant pair. For large groups, add an SFU/media relay
later so every client uploads one media stream and receives only the streams it
needs.

The backend does not embed a TURN server. The official coturn sidecar consumes
the persisted listener and private relay range through a local runtime contract,
then shares the backend network namespace. The configured host range must be
published over TCP for IPFS and UDP for TURN. The node-to-node relay discovery
protocol is documented in
[Calls TURN Relay Discovery](calls-turn-relay-discovery.md).

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
  "pollId": "<pollId>",
  "createdAt": 1780000000000,
  "mutation": { "...": "SignedPublicMutation" },
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
  channel calls start with the authenticated caller and add other identities
  only when they join the active voice-channel call
- community channel call start is idempotent by `(communityId, channelId)`:
  when an active call already exists for that voice channel, `POST /calls`
  returns the existing call instead of creating a second one
- when returning an existing community channel call, the authenticated caller is
  joined or added as a joined participant when needed
- caller must be a conversation participant or community member
- start emits `calls.v1.call.started` to the current call participants
- the creator starts as `joined`; explicit conversation invitees start as
  `ringing`
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
- heartbeat body contains one `mediaConnections` entry per remote
  `RTCPeerConnection`; an empty array is valid before ICE selects a pair. An
  entry that targets the sender, a non-participant (such as a participant that
  just left) or a repeated remote identity is rejected with HTTP 409
  `InvalidCallParticipantMediaConnectionError`; clients send the next heartbeat
  from their refreshed roster
- heartbeat renews an in-memory lease owned by the node serving that client and
  replicates it through `calls.v1.participant_lease.was_updated`
- heartbeat never writes the call document or its indexes to OrbitDB
- heartbeat returns HTTP 204 with no roster or diagnostics; it rechecks current scope access
- community heartbeats require a current grant on the serving node. Explicit
  leave, lost runtime state, or sixty seconds without a real renewal requires an
  explicit join; a heartbeat cannot silently rejoin or borrow another node's grant
- conversation heartbeats can recreate a runtime lease for a persisted joined participant
- live `participants[].connected` is true while an authorized identity has a live lease
- heartbeat timestamps and remote ICE reports stay out of the live HTTP/WebSocket contract
- remote nodes expire stale lease copies locally, while only the owner node may
  announce its lease as disconnected
- WebSocket clients receive minimal snapshots on membership/connection changes; unchanged heartbeat renewals and media-only reports are not forwarded
- actual local lease transitions also notify clients, including recovery after a locally expired remote lease; owner-supplied change flags are not sufficient
- OrbitDB call projection changes notify clients after projection, so lease-before-document delivery cannot leave a stale roster
- community membership/permission changes refresh live snapshots for remaining authorized recipients; every delivery rechecks scope access
- leaving removes the authenticated identity from the active snapshot
- leaving a one-to-one conversation ends its call; leaving a group (including a two-member group) or community call does not terminate other participants
- explicit community call termination retires its call ID
- community session documents do not persist participant identities, creator or
  ender attribution. Runtime participation expires and persisted rosters cannot
  restore it after restart. Existing immutable history is not erased; see
  [the synchronization contract](pubsub-sync-protocol.md) for retention limits
- deleting yourself while `ringing` declines the call instead of leaving it
- joins emit `calls.v1.participant.joined`
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
- signal request bodies are limited to 64 KiB
- signalling is rate-limited per `(callId, senderIdentityId)` with
  `CALLS_SIGNAL_RATE_LIMIT_PER_MINUTE` defaulting to `120`; `0` disables the
  limit for local/debug runs
- the response contains `signalId` and `expiresAt`; it no longer serializes the
  entire call for every SDP or ICE message
- sending subscribes all network nodes to `calls.v1.signal.sent`, while
  WebSocket delivery remains restricted to `recipientIdentityId`
- unacknowledged signals are retried after 1, 2, 4 and 8 seconds with the same
  `signalId` and a new event id; delivery expires after 20 seconds
- the recipient acknowledges successful processing over the authenticated
  WebSocket with `{ "type": "call_signal_ack", "signalId": "<uuid>" }`
- acknowledgements emit the internal
  `calls.v1.signal.acknowledged` event; they stop retries but are not forwarded
  to frontend WebSockets
- pending deliveries, acknowledgement state and retry schedules live only in
  bounded in-memory state and never write to OrbitDB

### Missed calls

The node runs a call timeout scheduler once per minute for calls scoped to
conversations. Ringing participants that have not joined before the timeout are
marked as `missed`; the call status becomes `missed`; and each missed
participant receives an unread `missed_call` notification. Missed-call notifications are
local and derived on each node and are never replicated.

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

### Get local node relay configuration

```http
GET /node/relay-configuration
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <millisecondsSinceEpoch>
X-Signature: <signature>
```

Response:

```json
{
  "publicHost": "relay.example.com",
  "callsRelay": {
    "port": 3478
  },
  "manualRelayMultiaddrs": [
    "/dns4/relay.example.com/tcp/4100/p2p/12D3KooWRelayPeerId"
  ],
  "publicNetwork": {
    "enabled": true,
    "port": 4011
  },
  "privateRelay": {
    "enabled": true,
    "portStart": 4100,
    "portEnd": 4199,
    "publicationEnabled": true,
    "discoveryEnabled": true
  }
}
```

Implemented:

- require signed request auth from the current node owner
- return the relay configuration persisted in local node metadata
- reject anonymous and non-owner requests

### Replace local node relay configuration

```http
PUT /node/relay-configuration
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <millisecondsSinceEpoch>
X-Signature: <signature>
```

Request:

```json
{
  "publicHost": "relay.example.com",
  "callsRelay": {
    "port": 3478
  },
  "manualRelayMultiaddrs": [
    "/dns4/relay.example.com/tcp/4100/p2p/12D3KooWRelayPeerId"
  ],
  "publicNetwork": {
    "enabled": true,
    "port": 4011
  },
  "privateRelay": {
    "enabled": true,
    "portStart": 4100,
    "portEnd": 4199,
    "publicationEnabled": true,
    "discoveryEnabled": true
  }
}
```

Implemented:

- require signed request auth from the current node owner
- configure public relay advertising, public relay discovery, private relay
  ports, private relay public-record publication/discovery and manual relay
  multiaddrs from node metadata instead of environment variables
- recreate private IPFS networks when relay settings change so ports, manual
  relay multiaddrs and discovery settings take effect
- reload the public relay runtime when owner-owned relay settings change

### Get local node networks

```http
GET /node/networks
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <millisecondsSinceEpoch>
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
  "ipfsPeers": [
    {
      "id": "<libp2pPeerId>",
      "networks": [
        {
          "id": "<networkId>",
          "name": "public",
          "type": "public"
        }
      ]
    }
  ],
  "networkSynchronization": {
    "changedAt": 1773848829055,
    "networks": [
      {
        "connectedPeerIds": ["<libp2pPeerId>"],
        "convergedStoreCount": 16,
        "id": "<networkId>",
        "name": "private",
        "replicationPeerIds": ["<libp2pPeerId>"],
        "state": "syncing",
        "stores": [
          {
            "name": "identities",
            "peerIds": ["<libp2pPeerId>"],
            "state": "converged"
          },
          {
            "name": "messages",
            "peerIds": [],
            "state": "syncing"
          }
        ],
        "totalStoreCount": 17,
        "type": "private"
      }
    ]
  },
  "peers": [
    {
      "capabilities": {
        "privateIpfs": true,
        "publicIpfs": true,
        "relay": true
      },
      "connectionSummary": {
        "isSharedNetworkPeer": true,
        "sharedNetworkCount": 1
      },
      "id": "<nodeId>",
      "owner": "<identityId>",
      "lastSeenAt": 1773848829055,
      "networks": [
        {
          "id": "<networkId>",
          "name": "public"
        }
      ],
      "nodeType": "relay"
    }
  ]
}
```

`connectedPeerIds` comes from live libp2p connections.
`replicationPeerIds` is the union of peers observed by OrbitDB stores. Public
libp2p DHT peers are not treated as database peers until OrbitDB observes them.
For private networks, a newly connected transport peer keeps the state at
`syncing` until it has joined every store. The three states are:

- `waiting_for_peers`: no replication peer is currently known
- `syncing`: at least one currently known peer has not joined every store
- `converged`: every store has completed its head exchange with all currently
  known replication peers

Implemented:

- publish a local node heartbeat every 5 minutes through the consumer bus
- store heartbeats received from remote nodes as active peers
- return peers seen during the active peer window
- return live IPFS transport peers from the currently connected libp2p networks
- include node id, owner, network id/name, IPFS capabilities, shared-network summary and inferred node type
- expose live IPFS peer ids separately from node ids because transport peers may not have sent a node heartbeat yet
- never expose private network keys in peer heartbeat payloads

## IPFS HTTP API

### Publish public content

```http
POST /ipfs/public
```

Requires signed request headers. The authenticated identity does not need to be
published yet, so clients can generate a keypair locally, sign this request, get
a CID, and then publish the identity with `profile.picture`, `profile.banner` or
inside an encrypted message payload.

Request body is the raw binary content. `Content-Type` and `X-Filename` are
echoed in this response only; they are not replicated and the node never trusts
them when serving content.

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
- NOT announce replication: after the identity is published, the owner registers
  the CID with `PUT /ipfs/replication/{cid}`
- accept raw request bytes instead of wrapping the content in JSON/base64
- store the binary bytes directly in IPFS
- limit content size to 50 MiB
- return the CID to store in signed identity profiles or posts

### Get public IPFS content

```http
GET /ipfs/{cid}
```

For CIDs uploaded with `POST /ipfs/public`, the response body is the original
binary content. It is not wrapped in JSON and it is not base64 encoded.

Response headers:

```http
HTTP/1.1 200 OK
Content-Type: image/png
X-Content-Type-Options: nosniff
```

The body is the raw byte stream. The node sniffs the bytes and serves them
inline only when they are an allowlisted passive media type (PNG, JPEG, GIF,
WebP, AVIF, MP4, WebM, MP3, OGG, WAV). Anything else is served as
`application/octet-stream` with `Content-Disposition: attachment`. Neither a
content type nor a filename is replicated, so a remote peer cannot choose them.
If the CID points to existing JSON content, the endpoint still returns that JSON
document, because identities, keychains and private upload documents are stored
as JSON. Reading a CID may populate Helia's local block cache, but it does not
pin the content or advertise this node as a provider.

### Publish private content

```http
POST /ipfs/{networkId}
```

Requires signed request headers. The backend never encrypts, decrypts or
inspects the original private file. Clients must encrypt the file bytes locally
before sending the request. `networkId` is the target IPFS network id where the
encrypted document must be stored.

Request body is the encrypted raw binary content. `Content-Type` and
`X-Filename` are kept only inside the stored private document.

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

- publish client-encrypted private content only to the selected IPFS network
- NOT announce replication; register with `PUT /ipfs/replication/{cid}` once the identity is published
- accept raw encrypted request bytes instead of wrapping the content in
  JSON/base64
- store content as a JSON IPFS document with `encrypted: true`,
  `contentType`, base64 `encryptedData`, optional `filename`, `size`,
  `uploadedAt` and `uploadedByIdentityId`
- limit encrypted content size to 50 MiB
- return the CID to place inside encrypted message payloads

### Get IPFS JSON content

```http
GET /ipfs/{cid}
```

Implemented:

- read JSON content by CID from any configured IPFS network
- return `404` when the CID is not found

### Register content replication

```http
PUT /ipfs/replication/{cid}
```

Requires signed request headers. Call it only after the identity is published
(a node never replicates a CID for an unpublished identity). Body:

```json
{
  "networkId": "<networkId>",
  "context": "ipfs_private_upload",
  "sizeBytes": 2048,
  "mutation": { "...": "PublicMutationProof primitives" }
}
```

`context` is `ipfs_private_upload` or `ipfs_public_upload`; `sizeBytes` is
1..52428800. Response: `204`.

The replicated record is stored in the gated `contentReplication` collection:

- record id: `content:<networkId>:<cid>`
- payload (signed): `{ cid, context, id, networkId, ownerIdentityId,
  scopeType: "content_replication", sizeBytes }`, with `scopeType` exactly
  `content_replication` and `ownerIdentityId` the signing identity
- `mutation` is a `PublicMutationProof` with `store: "contentReplication"`,
  `kind: "put"`, `recordId` = the record id and `payloadDigest` = the digest of
  the payload without `proof`; the client signs
  `signingContentOf(body)` with its device key
- admission: the owner must belong to `networkId`; per identity and network the
  node admits at most 1 GiB (`CONTENT_REPLICATION_QUOTA_BYTES`) and 10000 records
  (`CONTENT_REPLICATION_MAX_RECORDS_PER_IDENTITY`). The budget is
  deterministic: records sort by id and the first ones that fit are admitted
- only a record that passes the gate is ever fetched or provided, and the fetch
  is capped at the declared `sizeBytes`

Byte-exact vectors (ids, digests and signing content) are in
`tests/fixtures/content-replication-vectors.json`.

### Withdraw content replication

```http
DELETE /ipfs/replication/{cid}
```

Same body with `kind: "delete"` and a tombstone payload `{ cid, id, networkId,
ownerIdentityId, removed: true, scopeType: "content_replication" }`, signed by
the owner. Response: `204`.

### Get content replication status

```http
GET /ipfs/replication/status
```

Requires signed request headers. Reports a precomputed local summary; it does
not return CIDs.

- with 1 to 5 active nodes in a network, every active node is responsible for
  every registered CID
- with more than 5 active nodes, desired replicas are the larger of 5 nodes or
  40% of active nodes, capped by the active node count
- responsibility is deterministic from `networkId`, `cid` and `nodeId`
- there are no replica claims and nodes never release a replica

Response:

```json
{
  "localNodeId": "<nodeId>",
  "summary": {
    "contentCount": 42,
    "totalSizeBytes": 104857600,
    "localResponsibleCount": 38,
    "updatedAt": 1770000000000
  }
}
```

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

Presence is runtime state kept in node memory. Each node maintains an independent
lease for every identity connected through it. Heartbeats renew that node's
lease through domain events; another node may expire its local copy but never
broadcast an expiration on behalf of the lease owner. Leases are aggregated for
reads, are not written to OrbitDB/IPFS, and reset when the node restarts.

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

When a presence preference changes or an ephemeral heartbeat snapshot is
refreshed, backend emits:

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
      "ownerNodeId": "550e8400-e29b-41d4-a716-446655440001",
      "preferenceUpdatedAt": 1770000000000,
      "selectedStatus": "away",
      "updatedAt": 1770000000000,
      "networkIds": ["<networkId>"]
    }
  }
}
```

## Identity HTTP API

Identity publications contain only public profile data and public authorization
material. They never contain encrypted private keys, protected root-key
envelopes, password KDF parameters, device unlock secrets or recovery secrets.
Identity payloads containing those fields are rejected.

### Get identity

```http
GET /identities/{reference}
```

`reference` is a percent-encoded identity id or a lowercase profile handle
without `@`. Identity ids must use `encodeURIComponent(identityId)`.

Response:

```json
{
  "id": "<identityId>",
  "authorizationRevision": 0,
  "deviceCredential": "-----BEGIN PUBLIC KEY-----\n<base64>\n-----END PUBLIC KEY-----\n",
  "deviceCredentialCommitment": "<64 lowercase hexadecimal characters>",
  "recoveryAuthority": "-----BEGIN PUBLIC KEY-----\n<base64>\n-----END PUBLIC KEY-----\n",
  "identityExternalIdentifier": "<currentIdentityCid>",
  "networks": ["<networkId>"],
  "profile": {
    "handle": "alice",
    "name": "Alice"
  },
  "timestamp": 1773848829055,
  "signature": "<identitySignature>",
  "version": 1
}
```

Use `identityExternalIdentifier` as the next update's
`previousIdentityExternalIdentifier`.

### Publish identity

```http
POST /identities
```

Request:

```json
{
  "id": "<identityId>",
  "authorizationRevision": 0,
  "deviceCredential": "-----BEGIN PUBLIC KEY-----\n<base64>\n-----END PUBLIC KEY-----\n",
  "deviceCredentialCommitment": "<64 lowercase hexadecimal characters>",
  "recoveryAuthority": "-----BEGIN PUBLIC KEY-----\n<base64>\n-----END PUBLIC KEY-----\n",
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

The identity id and genesis device signing credential are independent public
keys. `deviceCredentialCommitment` is the SHA-256 digest of `deviceCredential`'s
canonical PEM representation, and both are covered by the identity signature.
`recoveryAuthority` is a separate public key; its private
recovery material remains exclusively with the client. The initial
`authorizationRevision` is `0`.

The signature covers this canonical property order:

```json
{
  "authorizationRevision": 0,
  "deviceCredential": "<genesisDeviceCredential>",
  "deviceCredentialCommitment": "<commitment>",
  "id": "<identityId>",
  "networks": ["<networkId>"],
  "profile": {
    "handle": "alice",
    "name": "Alice"
  },
  "recoveryAuthority": "<publicRecoveryAuthorityPem>",
  "timestamp": 1773848829055,
  "version": 1
}
```

Undefined optional properties are omitted before signing. Handles must already
be normalized. Current requests reject `encryptedKeyPair`,
`encryptedPrivateKey`, `encryptedMasterKey` and `masterKeyDerivation`.

### Update identity

```http
PUT /identities/{identityId}
```

Updates use the same signed public shape and add
`previousIdentityExternalIdentifier`. They may update public profile data and
add networks, but cannot remove a previously joined network or replace the
pinned genesis credential commitment or recovery authority. The node validates
the complete previous-publication chain before publishing the new CID.

## Keychain HTTP API

The node stores and announces encrypted keychain documents. It must never
receive keychain decryption secrets and must never decrypt the payload.

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
- resolve the latest valid candidate from OrbitDB metadata
- return encrypted payload as-is for client-side unlock/decryption

## Conversation HTTP API

Implemented mutating endpoints use signed HTTP requests with `X-Identity-Id`,
`X-Timestamp` and `X-Signature`.

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

A conversation is not a replicated document: its roster is the deterministic fold
of the operations its members signed (see *Signed conversation operations*). Creating
one stores the signed genesis `conversation_created`. The node never signs for a
user and there is no unsigned fallback.

1to1 request:

```json
{
  "type": "one-to-one",
  "participantIds": ["<authenticatedIdentityId>", "<participantIdentityId>"],
  "networkId": "<networkId>",
  "keychainExternalIdentifier": "<externalIdentifier>",
  "operation": {
    "createdAt": 1773848829055,
    "parents": [],
    "mutation": { "...": "SignedPublicMutation" }
  }
}
```

Standalone group request:

```json
{
  "type": "group",
  "name": "Project room",
  "nonce": "<random client string>",
  "participantIds": [
    "<authenticatedIdentityId>",
    "<participantIdentityId>",
    "<anotherParticipantIdentityId>"
  ],
  "networkId": "<networkId>",
  "keychainExternalIdentifier": "<externalIdentifier>",
  "operation": {
    "createdAt": 1773848829055,
    "parents": [],
    "mutation": { "...": "SignedPublicMutation" }
  }
}
```

`name` and `nonce` are required for `group` and ignored for `one-to-one`. The node
builds the participant list as the authenticated identity plus `participantIds`,
deduplicated and sorted ascending, and rebuilds the genesis from it: the signature
only verifies if the client signed exactly that list.

Response:

```json
{
  "id": "group:<base64url sha256>",
  "name": "Project room",
  "networkId": "<networkId>",
  "participantIds": ["<authenticatedIdentityId>", "<participantIdentityId>"],
  "adminIds": [],
  "creatorId": "<authenticatedIdentityId>",
  "type": "group",
  "unreadCount": 0
}
```

`ConversationResource` carries `adminIds` (the admins, never including the creator)
and `creatorId` (the author of the genesis). `participantIds` is the folded roster.

Implemented:

- create the one-to-one conversation for the participant pair; a 1:1 id is the
  same for both participants, so whoever creates it second receives the existing
  conversation unchanged
- create standalone group conversations with a client-provided `name`, a client
  `nonce` and N explicit participants
- require the conversation network id; messages and sync for this conversation
  are published only through that network
- validate that the keychain candidate belongs to the authenticated identity
- validate the roster rules of the genesis before storing anything
- persist the signed `conversation_created` record in the `conversationOperations`
  OrbitDB store; the node announces nothing else, and the local participant index is
  rebuilt from the folded state

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
        "conversationId": "group:<id>"
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

### Signed conversation operations

A conversation is not a replicated document: its roster (members, admins, creator)
is the deterministic fold of the operations its members signed, so a peer cannot
forge a participant, an admin or a removal. The node never signs for a user and has
no unsigned fallback. A route that creates or changes a conversation takes an
`operation` body field:

```json
{
  "operation": {
    "createdAt": 1773848829055,
    "parents": ["<digest from GET /conversations/{id}/frontier>"],
    "mutation": { "...": "SignedPublicMutation" }
  }
}
```

`mutation` signs the operation record (store `conversationOperations`, `kind: "put"`,
`sequence` 0, `predecessor` null, signer = the authenticated identity). The record
has exactly these nine fields, no more and no fewer:

```json
{
  "id": "conversation:<conversationId>:op:<digest>",
  "scopeType": "conversation_operation",
  "conversationId": "<conversationId>",
  "networkId": "<networkId>",
  "authorIdentityId": "<identityId>",
  "action": "member_added",
  "args": { "identityId": "<identityId>" },
  "parents": ["<digest>"],
  "createdAt": 1773848829055
}
```

**Digest and ids.** `<digest>` is the base64url (no padding, 43 characters) sha256 of
the canonical (RFC 8785, `canonicalize`) JSON of the record **without `id`**. The
record id is `conversation:<conversationId>:op:<digest>`, and the proof's `recordId`
is that id. `payloadDigest` is the same base64url sha256 of the canonical record
**with** `id` (what `PublicMutationProof.digestOf` computes). `parents` is sorted
ascending, unique, at most 64 digests, and is the same array in the record and in
`operation.parents` (the genesis has `[]`).

**Proof and signing bytes.** `mutation` is the proof body plus its signature:

```json
{
  "version": 1,
  "store": "conversationOperations",
  "kind": "put",
  "operationId": "<random base64url>",
  "recordId": "conversation:<conversationId>:op:<digest>",
  "payloadDigest": "<base64url sha256 of canonical record with id>",
  "predecessor": null,
  "sequence": 0,
  "author": { "identityId": "<identityId>", "deviceCredential": "<credential>" },
  "signature": "<Ed25519 signature by the device key, as the crypto library emits it>"
}
```

The device signs the UTF-8 bytes `"pigeon:public-mutation:v1\n" +
canonicalize(body-without-signature)`, the same signing content as every other
public mutation and as the community operations. Identity ids are the base64
public key without PEM headers.

**Conversation id.**

- Group: `group:` + base64url(sha256(canonicalize({ "creatorIdentityId", "networkId",
  "nonce" }))) with the creator's identity id, the network id and the client `nonce`.
  The id commits to its creator, so nobody can claim an existing group id.
- 1:1: `one-to-one:` + hex sha256 of `<first>:<second>:<networkId>`, where `first`
  and `second` are the two identity ids sorted ascending (plain string order). It is
  the same for both participants.

The genesis must carry exactly the id derived from its own args.

**Frontier.** The client reads `frontier` from `GET /conversations/{conversationId}/frontier`
immediately before signing and sends it as the sorted `parents`. The genesis has
none. The node rebuilds the operation from the path conversation, the authenticated
actor, the action of the endpoint, the `args` it derives from the other body fields,
and `createdAt` and `parents`; the signature only verifies if the client signed
exactly that. An operation whose author lacks the permission in the roster folded
from `parents`, or that names an unknown parent, is rejected. Operations are applied
in a total order (parents first, lowest digest first among concurrent ones) and
each is authorized again at that point, so concurrent conflicting changes converge
on every node.

| Route | action | `args` |
| --- | --- | --- |
| `POST /conversations` (group) | `conversation_created` | `{type: "group", name, nonce, participantIds}` |
| `POST /conversations` (1:1) | `conversation_created` | `{type: "one-to-one", participantIds}` |
| `POST /conversations/{id}/members` | `member_added` | `{identityId}` |
| `DELETE /conversations/{id}/members/{identityId}` | `member_removed` | `{identityId}` |
| `DELETE /conversations/{id}/members/me` | `member_left` | `{}` |
| `PUT /conversations/{id}/admins/{identityId}` | `admin_promoted` | `{identityId}` |
| `DELETE /conversations/{id}/admins/{identityId}` | `admin_demoted` | `{identityId}` |

Each `args` accepts exactly the listed keys (an extra or missing key is refused).
`participantIds` of a genesis is strictly ascending, unique and includes the
author: a group has 2 to 256 entries, a 1:1 exactly 2. The author of `member_left`
is the leaving identity, taken from the authenticated headers, so its `args` is
empty.

**Roster rules** (applied identically when a route admits an operation and when
every node folds it):

- The creator (author of the genesis) is always a member and never an admin.
- `member_added`: by the creator or an admin, the target is not yet a member, the
  group has fewer than 256 members.
- `member_removed`: by the creator or an admin; the target is a member, is not the
  creator and is not the author (nobody removes themselves; they leave); removing an
  admin is only allowed to the creator.
- `member_left`: by any member except the creator.
- `admin_promoted`: only by the creator; the target is a member, not the creator and
  not already an admin. `admin_demoted`: only by the creator; the target is an admin.
- A 1:1 is immutable: it accepts its genesis and refuses every other operation.
- Messages, pins, reactions and calls authorize against the folded roster (1:1 from
  the signed genesis); a removed member loses access.

**Limits.** `args` is at most 4096 bytes of JSON, a group has at most 256 members and
an identity other than the creator signs at most 1000 operations per conversation
(the creator is exempt). They are decided from the signed operation and its causal
past, so every node agrees. A route that would exceed one answers `409` with code
`ConversationOperationLimitExceededError` (`Conversation operation limit exceeded`)
and stores nothing; an operation another author signed concurrently beyond the quota
is skipped by the fold on every node without any error.

**Errors.** A body whose signed `operation` (or, on community routes, `operation` /
`moderationLog`) is missing, not an object or lacks `createdAt`, `parents` or `mutation`
is rejected before any signature check with `400` (validation error); it never
reaches the use case. A malformed record, wrong args, a wrong id, a mismatching signature
author, an unknown parent or any violated roster rule answers `409` with code
`InvalidConversationOperationError` (`Invalid conversation operation`). An unknown
conversation answers `ConversationNotFoundError`.

**Worked examples** (all use `X-Identity-Id`, `X-Timestamp` and `X-Signature` like
every route; `operation` is built as above, with `action` and `args` of the row):

```text
POST /conversations                                  action conversation_created
  parents []                                         args {"name":"Project room","nonce":"n-1","participantIds":["<A>","<B>"],"type":"group"}
POST /conversations/{id}/members   {"identityId":"<C>"}   action member_added   args {"identityId":"<C>"}
DELETE /conversations/{id}/members/<C>                    action member_removed args {"identityId":"<C>"}
DELETE /conversations/{id}/members/me                     action member_left    args {}
PUT /conversations/{id}/admins/<B>                        action admin_promoted args {"identityId":"<B>"}
DELETE /conversations/{id}/admins/<B>                     action admin_demoted  args {"identityId":"<B>"}
```

For the first line the creator `<A>` signs the record

```json
{"action":"conversation_created","args":{"name":"Project room","nonce":"n-1","participantIds":["<A>","<B>"],"type":"group"},"authorIdentityId":"<A>","conversationId":"group:<sha256>","createdAt":1773848829055,"networkId":"<N>","parents":[],"scopeType":"conversation_operation"}
```

(keys shown in canonical order), computes `digest` of that JSON, adds
`"id":"conversation:group:<sha256>:op:<digest>"`, builds the proof over the record
with `id`, and sends `type: "group"`, `name`, `nonce`, `participantIds: ["<B>"]`
(or both), `networkId`, `keychainExternalIdentifier` and `operation`. A reference
signer lives in `tests/support/signConversationOperation.ts`.

Fixed, byte-exact test vectors (keys, ids, digests, signing content, signatures for
every action, including a unicode group name and a two-parent operation) live in
[`tests/fixtures/conversation-operation-vectors.json`](../tests/fixtures/conversation-operation-vectors.json);
a unit spec recomputes every value with the real domain code, so a client signer can
assert it reproduces them.

### Conversation members and admins

Each route below carries `{ "operation": { "createdAt", "parents", "mutation" } }`
(see *Signed conversation operations*), is authenticated with the signed HTTP
headers, and answers the updated `ConversationResource`.

```http
POST   /conversations/{conversationId}/members            body: { "identityId": "<identityId>", "operation": {...} }
DELETE /conversations/{conversationId}/members/me         body: { "operation": {...} }
DELETE /conversations/{conversationId}/members/{identityId} body: { "operation": {...} }
PUT    /conversations/{conversationId}/admins/{identityId}  body: { "operation": {...} }
DELETE /conversations/{conversationId}/admins/{identityId}  body: { "operation": {...} }
GET    /conversations/{conversationId}/frontier
```

Implemented:

- add a member (`member_added`), remove one (`member_removed`), leave
  (`member_left`), promote (`admin_promoted`) and demote (`admin_demoted`)
- refuse with `404` an unknown conversation and with `409` any change the roster
  rules or limits do not allow (`Invalid conversation operation`,
  `Conversation operation limit exceeded`); nothing is stored on refusal
- `GET .../frontier` is member-only and returns `{ "frontier": ["<digest>"] }`, the
  sorted digests no other operation names as parent: the `parents` of the next
  signed operation

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
        "reactions": []
      }
    }
  ]
}
```

Pin requests carry `{ "createdAt": <ms>, "mutation": SignedPublicMutation }`;
unpin requests carry `{ "mutation": SignedPublicMutation }` with a `delete` proof.
Conversation pins and reactions use the same proof rules as the community ones
(see Community channel pins), with `scopeType: "conversation"`: the proof author
must be a conversation participant, and missing, forged, copied-scope, stale or
revoked-device proofs fail with 409. Replicated records without a valid proof are
ignored by every node.

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
  "previousMessageIds": ["<lastKnownMessageId>"],
  "replyToMessageId": "<messageId>",
  "mutation": SignedPublicMutation
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
  "reactions": []
}
```

Implemented:

- enforce encrypted payloads for 1to1 conversations
- accept optional `previousMessageIds`; when omitted, the node uses an empty
  list. The signed record must carry exactly the array sent in the body
- allow replies by sending `replyToMessageId` with the id of an existing,
  non-deleted `sent` message in the same conversation
- require a client-signed `mutation` (see below); there is no unsigned fallback
- persist immutable message document in IPFS
- persist the signed message record in the OrbitDB `messages` store
- publish `ConversationMessageWasSentEvent` with `messageId`, `authorId`,
  `mutationProof`, `networkId` and `participantIds`
- derive unread state from OrbitDB replicated read markers and message metadata
- attachment CIDs and metadata belong inside the client-encrypted payload; private
  attachment bytes must be encrypted by the client and published first with
  `POST /ipfs/{networkId}`

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
  "mutation": SignedPublicMutation
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
  "reactions": [],
  "targetMessageId": "<editedMessageId>"
}
```

Implemented:

- require signed request auth
- only allow the original message author to edit the message
- reject edits for deleted messages
- require a client-signed `mutation` over the edited-message record
- use `targetMessageId` from the path and default `previousMessageIds` to
  `[messageId]` when the body omits it
- persist the immutable `edited` record in IPFS
- publish `ConversationMessageWasEditedEvent` with `messageId`,
  `targetMessageId`, `networkId` and `participantIds`
- consuming nodes register the edit through the existing conversation message
  registrar

#### Signed conversation message records

Every conversation message (`sent`, `edited`, `deleted` and the `poll`
timeline message) is an immutable record in the replicated `messages` store,
written once with a client-signed `SignedPublicMutation`: `store: "messages"`,
`recordId` = the message `id`, `kind: "put"`, `sequence: 0`,
`predecessor: null`, signed by an authorized device of the author. `payloadDigest`
commits to this record (the stored document without `proof`), whose field set is
closed:

```json
{
  "authorId": "<identityId>",
  "conversationId": "<conversationId>",
  "createdAt": 1773848829055,
  "encryptedPayload": "<only sent/edited>",
  "id": "<messageId>",
  "pollId": "<only poll>",
  "previousMessageIds": [],
  "replyToMessageId": "<optional, sent only>",
  "scopeType": "conversation",
  "targetMessageId": "<only edited/deleted>",
  "type": "sent | edited | deleted | poll"
}
```

Optional fields are omitted when absent. `authorId` is the authenticated identity.
`edited` and `deleted` default `previousMessageIds` to `[targetMessageId]`
(the path `messageId`); `sent` defaults to `[]`. Nodes reject records whose
author is not a conversation participant.

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
  "emoji": "👍",
  "createdAt": 1773848829055,
  "mutation": { "...": "SignedPublicMutation" }
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
  "emoji": "👍",
  "mutation": { "...": "SignedPublicMutation (kind delete)" }
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
  "mutation": SignedPublicMutation
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
  "reactions": [],
  "targetMessageId": "<deletedMessageId>"
}
```

Implemented:

- require signed request auth
- only allow the original message author to delete the message
- require a client-signed `mutation` over the deleted-message record, with
  `previousMessageIds: [messageId]`
- persist the immutable `deleted` record in IPFS
- publish `ConversationMessageWasDeletedEvent` with `messageId`,
  `targetMessageId`, `networkId` and `participantIds`
- readers hide the target message when a `deleted` message from the same author
  targets it (no unsigned tombstone is written)
- remove unread flags for the deleted target message
- remove the target message block from local IPFS blockstores when present
- apply the same invalidation/removal when a deletion event is consumed from
  another node

Signed HTTP request validation:

- reject stale `X-Timestamp` values outside the 30 second freshness window

## Community HTTP API

Communities are private in the current MVP. A community belongs to one network,
has one owner, and contains member ids, text channel metadata and encrypted
text channel messages. Community channels are not backed by `Conversation`;
they live inside the `communities` context.

Implemented mutating endpoints use signed HTTP requests with `X-Identity-Id`,
`X-Timestamp` and `X-Signature`. Every route that changes a community also
carries a client-signed `operation` (see *Signed community operations*), and
moderation routes additionally carry a client-signed `moderationLog` (see
*Signed moderation log entries*).

### Signed community operations

A community is not a replicated document: its state is the deterministic fold of
the operations its members signed, so a peer cannot forge a role, ban, membership,
setting or deletion. The node never signs for a user and has no unsigned
fallback. A route that changes a community takes an `operation` body field:

```json
{
  "operation": {
    "createdAt": 1773848829055,
    "parents": ["<digest from GET /communities/{id}/frontier>"],
    "mutation": { "...": "SignedPublicMutation" }
  }
}
```

`mutation` signs the operation record (store `communityOperations`, `kind: "put"`,
`sequence` 0, `predecessor` null, signer = the authenticated identity):

```json
{
  "id": "community:<communityId>:op:<digest>",
  "scopeType": "community_operation",
  "communityId": "<communityId>",
  "networkId": "<networkId>",
  "authorIdentityId": "<identityId>",
  "action": "channel_created",
  "args": { "channelId": "<id>", "name": "general", "type": "text" },
  "parents": ["<digest>"],
  "createdAt": 1773848829055
}
```

`<digest>` is the base64url sha256 of the canonical payload without `id`, and the
record id and `payloadDigest` bind it. Identity ids in `authorIdentityId` and
`args.identityId` are the base64 public key without PEM headers. The client reads
`frontier` from `GET /communities/{communityId}/frontier` immediately before signing and
sends it as the sorted `parents` (the genesis has none). The node rebuilds the
operation from the path community, the authenticated actor, the action of the
endpoint, the `args` it derives from the other body fields, and `createdAt` and
`parents`; the signature only verifies if the client signed exactly that. An
operation whose author lacks the permission in the history named by `parents`, or
that names an unknown parent, is rejected. Operations are applied in a total order
(parents first, lowest digest first among concurrent ones) and each is authorized
again at that point, so concurrent conflicting changes converge on every node:
for example a role grant by a member that a concurrent ban ordered earlier is
skipped. The last member leaving deletes the community and nothing revives it.

Limits: `args` is at most 4096 bytes of JSON and an identity signs at most 1000
operations per community. Both are decided from the signed operation and its
causal past, so every node agrees. A route that would exceed either answers `409`
with code `CommunityOperationLimitExceededError` (`Community operation limit
exceeded`) and stores nothing. An operation another author signed concurrently
beyond that quota is skipped by the fold on every node without any error.

| Route | action | `args` |
| --- | --- | --- |
| `POST /communities` | `community_created` | `{nonce, name, description, visibility, discoverable, autoJoinEnabled, avatar?, banner?}` |
| `PATCH /communities/{id}` | `community_updated` | `{name, description, avatar?, banner?, discoverable?, autoJoinEnabled?}` |
| `POST .../channels/text`, `.../channels/voice` | `channel_created` | `{channelId, name, type}` |
| `PATCH .../channels/{channelId}` | `channel_renamed` | `{channelId, name}` |
| `DELETE .../channels/{channelId}` | `channel_deleted` | `{channelId}` |
| `PATCH .../channels/{channelId}/permissions` | `channel_permissions_updated` | `{channelId, visibleRoleIds}` |
| `POST .../roles` | `role_created` | `{roleId, name, permissions}` |
| `PATCH .../roles/{roleId}` | `role_updated` | `{roleId, name, permissions}` |
| `DELETE .../roles/{roleId}` | `role_deleted` | `{roleId}` |
| `PUT .../members/{identityId}/roles` | `member_roles_updated` | `{identityId, roleIds}` |
| `POST .../bans` | `member_banned` | `{identityId}` |
| `DELETE .../bans/{identityId}` | `member_unbanned` | `{identityId}` |
| `DELETE .../members/{identityId}/kick` | `member_kicked` | `{identityId}` |
| `DELETE .../members/me` | `member_left` | `{identityId}` |
| `POST .../join-requests` (auto-join), `PATCH .../membership-requests/{id}` (accept), `POST .../invites/{token}/accept` | `member_joined` | `{identityId, method, reference?}` |

`member_joined` carries `method` `added`, `approval`, `invitation`, `invite_link` or
`automatic`, and `reference` exactly for `approval`, `invitation` and
`invite_link`: the id of the accepted `community_membership_request` (type
`request` for `approval`, `invitation` for `invitation`), or the invite token
(which must also have the member's `community_invite_use` record). `approval`
needs `approve_members`, `added` needs `manage_members`, `automatic` needs
`autoJoinEnabled`, and the other methods are signed by the joining identity.
A node that has not replicated the referenced records yet admits the operation
later.

Channel and role ids are not chosen: `channelId` and `roleId` are the first 24 hex
characters of `sha256(JSON.stringify(["channel" | "role", communityId,
authorIdentityId, operation.createdAt]))`.

Fixed, reproducible vectors for the genesis and `member_joined` operations live in
[`tests/fixtures/community-operation-vectors.json`](../tests/fixtures/community-operation-vectors.json).
Per case they give the inputs (`networkId`, community nonce, owner, `createdAt`,
`parents`, `args`, a deterministic ed25519 test key) and every derived value:
`communityId`, the canonical payload and its `digest`, the `recordId`,
`payloadDigest`, the signing content, the signature and the request `operation`.
A unit spec recomputes all of them with the domain code and with plain
`canonicalize` and `sha256`, so a client can use the file as its conformance test.
A client that is not a member yet reads the `networkId` it needs for the
`member_joined` of an invite from `GET /communities/invites/{inviteToken}`.

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
  "nonce": "<random string chosen by the client>",
  "name": "Pigeon Lab",
  "description": "Private workspace",
  "avatar": "<publicAvatarCid>",
  "banner": "<publicBannerCid>",
  "discoverable": true,
  "autoJoinEnabled": false,
  "visibility": "private",
  "operation": { "createdAt": 1773848829055, "parents": [], "mutation": { "...": "SignedPublicMutation" } }
}
```

The genesis is a `community_created` operation signed by the owner with no
parents. The community id is not chosen by the node:
`communityId = base64url(sha256(canonicalize({ networkId, nonce, ownerIdentityId })))`
(RFC 8785 canonical JSON, `ownerIdentityId` without PEM headers), so the client
computes it before signing and a replayed genesis cannot be moved to another
owner or network. The signed `args` carry the values the node applies
(`discoverable` true, `autoJoinEnabled` false and `visibility` `private` when the
body omits them). The Community document is rebuilt from the operations on every
node and is never accepted as a replicated record.

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

### Get community frontier

```http
GET /communities/{communityId}/frontier
```

Implemented:

- require signed request auth
- allow any authenticated identity, members or not, because a non-member signs the
  `member_joined` operation of a join, an invite link or an accepted invitation
- fail with `CommunityNotFoundError` when the community is unknown to the node
- return `{ "frontier": ["<digest>"] }`, the sorted operation digests no other
  operation names as parent: the `parents` for the next signed operation. The
  digests are the ids of immutable records already replicated to every peer of the
  network, so they disclose nothing else.

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
  "autoJoinEnabled": true,
  "operation": { "createdAt": 1773848829055, "parents": ["<frontier>"], "mutation": { "...": "SignedPublicMutation" } }
}
```

The `operation` signs a `community_updated` operation whose `args` are the other
body fields.

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
  "identityId": "<newMemberIdentityId>",
  "createdAt": 1780000000000,
  "mutation": { "...": "SignedPublicMutation" }
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

The invitation is a signed `requests` record only and carries no `operation`:
the invitee joins by signing `member_joined` (`method: "invitation"`,
`reference: <requestId>`) when they accept.

Implemented:

- require signed request auth from the community owner
- create a pending invitation
- do not add the invited identity to `memberIds` until they accept
- return an existing pending invitation for the same identity idempotently

### Request community membership

```http
POST /communities/{communityId}/join-requests
```

Request body: `{ "createdAt", "mutation", "acceptedAt"?, "acceptedMutation"?, "operation"? }`.
`mutation` signs a `community_membership_request` document of type `request`
(creator = identity = requester, `status: "pending"`, `updatedAt = createdAt`).
The id is the first 24 hex chars of
`sha256(JSON.stringify([communityId, type, creatorIdentityId, identityId, createdAt]))`.
For auto-join communities `acceptedAt`, `acceptedMutation` and `operation` are
required: `acceptedMutation` is the same document with `status: "accepted"`,
`updatedAt = acceptedAt` and sequence + 1, signed by the requester, and
`operation` signs `member_joined` with `args` `{identityId: <requester>,
method: "automatic"}` and no `reference`.

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
  "status": "accepted",
  "updatedAt": 1780000000000,
  "mutation": { "...": "SignedPublicMutation" },
  "moderationLog": { "createdAt": 1780000000000, "mutation": { "...": "SignedPublicMutation" } },
  "operation": { "createdAt": 1780000000000, "parents": ["<frontier>"], "mutation": { "...": "SignedPublicMutation" } }
}
```

`operation` is required when `status` is `accepted` and signs `member_joined`
with `args` `{identityId: <request.identityId>, method, reference: <requestId>}`:
`method` is `approval` for a `request` (signed by a member with
`approve_members`) and `invitation` for an `invitation` (signed by the invited
identity). It is not sent when `status` is `declined`.

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

Body: `{ "operation": { "createdAt", "parents", "mutation" } }`, signing
`member_left` with `args` `{identityId: <actor>}`.

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

Body: `{ "operation": { "createdAt", "parents", "mutation" } }`, signing
`member_kicked` with `args` `{identityId: <target>}`.

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
  "maxUses": 1,
  "nonce": "<16-128 chars>",
  "createdAt": 1780000000000,
  "mutation": { "...": "SignedPublicMutation" }
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
https://node.example.com/invite/community/<inviteToken>#k=<inviteSecret>
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
  "networkId": "<networkId>",
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
- return the community `networkId`, which the invited identity, not yet a member
  and so unable to read `GET /communities/{communityId}`, needs to build the
  signed `member_joined` operation of the accept
- return `encryptedCommunityKey` exactly as stored
- never receive the `#k` fragment secret

### Accept community invite link token

```http
POST /communities/invites/{inviteToken}/accept
```

Request body: `{ "usedAt", "mutation", "operation" }`. `mutation` signs a
`community_invite_use` document with id `invite-use:<token>:<identityId>`,
signed by the acceptor. The invite token is
`base64url(sha256(JSON.stringify([communityId, creatorIdentityId, nonce])))`.
Uses are counted as signed use records, so `maxUses` can be exceeded when
nodes are partitioned. `operation` signs `member_joined` with `args`
`{identityId: <acceptor>, method: "invite_link", reference: <inviteToken>}`; the
operation is only admitted by a node that also holds the signed invite and the
acceptor's `invite-use:<token>:<identityId>` record.

Implemented:

- require signed request auth from the identity accepting the invite
- reject missing, expired or exhausted invite tokens
- record one signed invite use
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
  "reason": "optional moderation note",
  "moderationLog": { "createdAt": 1773848829055, "mutation": { "...": "SignedPublicMutation" } },
  "operation": { "createdAt": 1773848829055, "parents": ["<frontier>"], "mutation": { "...": "SignedPublicMutation" } }
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

### Signed moderation log entries

Every community moderation action is recorded in the `moderationLogs`
replicated collection, and the entry is signed by the moderator's own client.
There is no unsigned fallback: an entry whose signature, id or permission check
fails is rejected on write and on replication, and entries are immutable (no
tombstones). The routes below therefore carry an extra body field:

```json
{
  "moderationLog": {
    "createdAt": 1773848829055,
    "mutation": { "...": "SignedPublicMutation" }
  }
}
```

`mutation` signs this record (store `moderationLogs`, `kind: "put"`,
`recordId` = `id`, signer = `actorIdentityId`, `sequence` 0):

```json
{
  "action": "channel_created",
  "actorIdentityId": "<identityId>",
  "communityId": "<communityId>",
  "createdAt": 1773848829055,
  "details": { "name": "general", "type": "text" },
  "id": "<derived log id>",
  "scopeType": "community_moderation_log",
  "target": { "id": "<channelId>", "type": "channel" }
}
```

The log id is derived, not chosen: the first 24 hex characters of the sha256
of `JSON.stringify([communityId, actorIdentityId, action, target.type,
target.id, createdAt])` (UTF-8). `createdAt` is the same value as
`moderationLog.createdAt`. The node records exactly the action, target and
details it computes from the request, and the entry is only admitted when they
match what was signed and the actor holds the permission for the action.

| Route | action | target | details |
| --- | --- | --- | --- |
| `PATCH /communities/{id}` | `community_updated` | community, `communityId` | `{autoJoinEnabled, avatar, banner, description, discoverable, name}` as sent in the request (absent or empty `avatar`, `banner`, `autoJoinEnabled`, `discoverable` omitted) |
| `POST .../channels/text`, `.../channels/voice` | `channel_created` | channel, derived channel id | `{name, type: "text" \| "voice"}` |
| `PATCH .../channels/{channelId}` | `channel_renamed` | channel, `channelId` | `{name}` |
| `DELETE .../channels/{channelId}` | `channel_deleted` | channel, `channelId` | `{type}` |
| `PATCH .../channels/{channelId}/permissions` | `channel_permissions_updated` | channel, `channelId` | `{visibleRoleIds}` |
| `POST .../roles` | `role_created` | role, derived role id | `{name, permissions}` |
| `PATCH .../roles/{roleId}` | `role_updated` | role, `roleId` | `{name, permissions}` |
| `DELETE .../roles/{roleId}` | `role_deleted` | role, `roleId` | `{}` |
| `PUT .../members/{identityId}/roles` | `member_roles_updated` | member, `identityId` | `{roleIds}` |
| `POST .../bans` | `member_banned` | member, banned `identityId` | `{reason}` |
| `DELETE .../bans/{identityId}` | `member_unbanned` | member, `identityId` | `{}` |
| `POST .../invites` | `invite_link_created` | invite, invite `token` | `{encryptedCommunityKeyStored, expiresAt, maxUses}` |
| `POST .../members` | `invitation_created` | membership_request, request id | `{identityId}` (the invited identity) |
| `PATCH /communities/membership-requests/{requestId}` | `membership_request_accepted` or `membership_request_declined` | membership_request, `requestId` | `{identityId, type}` of the request |
| `DELETE .../channels/{channelId}/messages/{messageId}` | `message_deleted` | message, `messageId` | `{channelId, targetMessageAuthorId}` |

Channel and role creation derive the id from the `createdAt` of the signed
community operation (`operation.createdAt`), not from `moderationLog.createdAt`
(`sha256(JSON.stringify(["channel" | "role", communityId, actorIdentityId,
operation.createdAt]))`, first 24 hex characters). The id in the log target is
the id the node assigns. The log is an audit trail with its own signature; the
community state comes only from the signed community operation that every one
of these routes also takes (see "Signed community operations"). The `DELETE`
routes for channel, role and ban take
`{ "moderationLog": { "createdAt", "mutation" }, "operation": { ... } }`.

Permissions checked against the signed actor: channel actions need
`manage_channels`, role and member-role actions `manage_roles`, bans
`ban_members`, invitations `create_invites`, request decisions
`approve_members`/`reject_members` (invitations are decided by the invited
identity), `community_updated` the owner, and `message_deleted` the message
author or `manage_messages`.

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
  currently `joined` to an active call scoped to that voice channel with at least
  one connected participant lease for the same call and identity. Historical
  joined state without a connected lease does not imply presence. Lease expiry
  removes the identity from subsequent channel reads; identities are deduplicated
  across devices and active calls for the channel

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
  "permissions": ["manage_channels", "create_invites"],
  "moderationLog": { "createdAt": 1773848829055, "mutation": { "...": "SignedPublicMutation" } },
  "operation": { "createdAt": 1773848829055, "parents": ["<frontier>"], "mutation": { "...": "SignedPublicMutation" } }
}
```

Member role replacement body:

```json
{
  "roleIds": ["<roleId>"],
  "moderationLog": { "createdAt": 1773848829055, "mutation": { "...": "SignedPublicMutation" } },
  "operation": { "createdAt": 1773848829055, "parents": ["<frontier>"], "mutation": { "...": "SignedPublicMutation" } }
}
```

`DELETE` role, channel and ban routes take the same `moderationLog` and
`operation` fields as their only body. A role creation signs `role_created` with
the derived `roleId`; the other routes sign the action in the table above.

Implemented:

- require signed request auth
- require owner or `manage_roles` for role creation/update/deletion and member
  role assignment
- keep `everyone` implicit for every member; clients should not assign it
  manually
- the roles and assignments are folded from the signed operations

### Create text channel

```http
POST /communities/{communityId}/channels/text
```

Request:

```json
{
  "name": "general",
  "moderationLog": { "createdAt": 1773848829055, "mutation": { "...": "SignedPublicMutation" } },
  "operation": { "createdAt": 1773848829055, "parents": ["<frontier>"], "mutation": { "...": "SignedPublicMutation" } }
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
  "name": "Voice",
  "moderationLog": { "createdAt": 1773848829055, "mutation": { "...": "SignedPublicMutation" } },
  "operation": { "createdAt": 1773848829055, "parents": ["<frontier>"], "mutation": { "...": "SignedPublicMutation" } }
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
  "name": "announcements",
  "moderationLog": { "createdAt": 1773848829055, "mutation": { "...": "SignedPublicMutation" } },
  "operation": { "createdAt": 1773848829055, "parents": ["<frontier>"], "mutation": { "...": "SignedPublicMutation" } }
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
  "visibleRoleIds": ["everyone", "<roleId>"],
  "moderationLog": { "createdAt": 1773848829055, "mutation": { "...": "SignedPublicMutation" } },
  "operation": { "createdAt": 1773848829055, "parents": ["<frontier>"], "mutation": { "...": "SignedPublicMutation" } }
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

Body: `{ "moderationLog": { "createdAt", "mutation" }, "operation": { "createdAt",
"parents", "mutation" } }`, signing `channel_deleted`.

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
  ]
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
  "mentions": []
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
- attachment CIDs and metadata belong inside the client-encrypted payload; private
  attachment bytes must be encrypted by the client and published first with
  `POST /ipfs/{networkId}`
- allow threads by sending `replyToMessageId` with the id of an existing
  channel message in the same community channel
- validate the message signature against this canonical payload:

```json
{
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
  "mentions": []
}
```

Public community edits send `plaintextPayload` instead of `encryptedPayload`.

The edition signature must be generated from this canonical payload:

```json
{
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
        "channelId": "<channelId>"
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

### Community channel messages

Sending, editing and deleting a channel message require a client-signed
`mutation` in the body (schema `SignedPublicMutation`, store `messages`, record
id `community:<communityId>:<channelId>:<messageId>:<authorIdentityId>`). The
signed payload is the stored record without `proof`:
`{authorIdentityId, channelId, communityId, createdAt, editedAt?,
encryptedPayload?, id: <recordId>, mentions, messageId, plaintextPayload?,
pollId?, replyToMessageId?, scopeType: "community_channel", type: "sent"}`
(undefined fields omitted). An edit is a `put` with a higher `sequence` and
`editedAt` set. `DELETE` takes only `{mutation}`: a `kind: "delete"` proof over
`{authorIdentityId (original author), channelId, communityId, id, messageId,
removed: true, scopeType: "community_channel"}`, signed by the author or a
member with `manage_messages`. The client chooses `id` and `createdAt`.
Poll creation carries the same kind of proof as `timelineMutation`.

### Community channel pins

```http
GET /communities/{communityId}/channels/{channelId}/pins
POST /communities/{communityId}/channels/{channelId}/messages/{messageId}/pin
DELETE /communities/{communityId}/channels/{channelId}/messages/{messageId}/pin
```

Pin, unpin, reaction add and reaction removal require a client-signed `mutation`
in the body (schema `SignedPublicMutation` in the communities swagger). Pin also
requires `createdAt`; reaction accepts an optional `createdAt`. The node holds no
user private keys, so the UI builds the proof: `payloadDigest` is the digest of the
record without its `proof`, `sequence` starts at 0 and `predecessor` is null only at
0, and the signature is made by an authorized device of `author.identityId`. Removals
must be `kind: "delete"` proofs. Missing, forged, copied-scope, revoked-device or
insufficient-permission proofs fail with 409; a proof that does not beat the stored
one (higher `sequence`, then lower digest) fails with 409 `StalePublicMutationError`
and `details: { sequence, digest }`. Replicated records without a valid proof are
ignored by every node.

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

Reaction requests carry the same signed `mutation` as pins (see Community channel pins).

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
  "mutation": { "...": "client-signed removal proof for the `messages` record" },
  "moderationLog": { "createdAt": 1773848829055, "mutation": { "...": "..." } }
}
```

`mutation` is the signed tombstone of the message record. `moderationLog` is
the signed `message_deleted` entry (see *Signed moderation log entries*) with
target `message`/`messageId` and details `{ channelId, targetMessageAuthorId }`.

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

An invitation is a replicated record signed by the inviter. The node never signs
for a user and has no unsigned fallback; `inviterSignature` and `createdAt` no
longer exist. The body carries the invitation fields, a client-chosen `nonce`
(`^[A-Za-z0-9_-]{16,128}$`) and the `mutation`:

```json
{
  "type": "conversation_invitation",
  "conversationId": "one-to-one:<deterministic-id>",
  "inviterIdentityId": "<aliceIdentityId>",
  "recipientIdentityId": "<bobIdentityId>",
  "encryptedConversationKey": "<encryptedForBob>",
  "nonce": "<random 16-128 chars>",
  "mutation": { "...": "SignedPublicMutation" }
}
```

`group_conversation_invitation` has the same shape with a `group:<id>`
`conversationId`. A community invitation uses `communityId` and
`encryptedCommunityKey` instead:

```json
{
  "type": "community_invitation",
  "communityId": "<communityId>",
  "inviterIdentityId": "<aliceIdentityId>",
  "recipientIdentityId": "<bobIdentityId>",
  "encryptedCommunityKey": "<encryptedForBob>",
  "nonce": "<random 16-128 chars>",
  "mutation": { "...": "SignedPublicMutation" }
}
```

Byte-exact contract (vectors in
[`tests/fixtures/notification-vectors.json`](../tests/fixtures/notification-vectors.json),
checked by `NotificationVectors.spec.ts`):

- notification id: `"invitation:" + hex(sha256(utf8(canonicalize({inviterIdentityId, nonce, recipientIdentityId, subjectId}))))`,
  where `subjectId` is the conversation id or the community id. The node derives
  it; a client never sends it.
- signed payload (RFC 8785 canonical JSON): `{encryptedKey, id, inviterIdentityId, nonce, recipientIdentityId, scopeType: "notification_invitation", subjectId, type}`.
  `encryptedKey` is the value of `encryptedConversationKey` or `encryptedCommunityKey`.
- `mutation`: a `put` proof with `store: "notifications"`, `recordId` = the
  notification id, `predecessor: null`, `sequence: 0`, `payloadDigest` =
  `base64url(sha256(utf8(canonicalize(payload))))`, signed with the shared
  `pigeon:public-mutation:v1\n` signing content; the author is the inviter.
- admission (every node, on replication too): the inviter must be the proof
  author; for conversation and group invitations both inviter and recipient must
  be participants in the signed conversation state; for community invitations the
  inviter must be allowed to create invites in the signed community state.

Implemented:

- require signed request auth from the inviter
- persist the record in OrbitDB as a signed `notifications` record, replicated
  under the head key `notification:<id>`
- store encrypted key material as opaque payload only
- keep private keys and decrypted conversation keys out of the backend
- `missed_call` notifications are never client-created and never replicated: the
  call timeout scheduler writes them only to the node's local database with the id
  `missed-call:<callId>:<recipientIdentityId>`, and `GET /notifications` merges
  them with the replicated invitations
- rate cap: at most `NOTIFICATIONS_RECORD_RATE_LIMIT_PER_MINUTE` (default 30)
  notification records per identity per minute, enforced on the write path
  (`429`, code `429020`); the replication gate cannot rate-limit
  deterministically
- `notification-recipient-index:<id>` heads are no longer replicated and are
  refused by the gate; the recipient list is rebuilt locally from the records

### Update a notification

```http
PATCH /notifications/{notificationId}
```

```json
{
  "state": "accepted",
  "mutation": { "...": "SignedPublicMutation" }
}
```

`state` is `accepted` or `declined`. The record is signed by the recipient:

- payload: `{id: "notification-state:<notificationId>:<state>", notificationId, read: true, recipientIdentityId, scopeType: "notification_state", state}`
- `mutation`: a `put` proof with `store: "notifications"`, `recordId` = the
  payload `id`, `predecessor: null`, `sequence: 0`; the author is the recipient
- one record exists per state, so a later record never overwrites an earlier one.
  Terminal states are absorbing: `declined` is refused once `accepted` exists,
  and a read mark never goes back. If a recipient signs both, every node resolves
  to `accepted`.

Implemented:

- require signed request auth from the recipient
- allow recipient-only accept and decline; the author must be the invitation
  recipient
- mark accepted or declined notifications as read
- same write-path rate cap as creation, counted per recipient

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

Every body also carries `"updatedAt": <ms>` and `"mutation":
SignedPublicMutation` (a `put` proof whose store is `notificationSettings`, whose
record id is `<identityId>:<scopeKey>` and whose digest covers the stored
document without `proof`, with `scopeType: "notification_settings"`). Missing,
forged, copied-scope, stale or revoked-device proofs fail with 409. Protected
community scopes stay node-local and never use the signed path; the proof is not
used for them.

Response is the updated scope resource.

For protected communities, the node accepts the setting only while its local
projection confirms that the authenticated identity is a member and can view
the requested channel. Protected settings stay in the node-local database and
are limited to 256 scopes per identity and 4,096 scopes per node.

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
  },
  "mutation": "SignedPublicMutation (delete proof)"
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

Sticker packs and user library records are public replicated records, so every
mutating route requires a client-signed `mutation` (`SignedPublicMutation`, see
Notification settings). The node holds no user private keys: the client chooses
every id and timestamp, signs the resulting record, and the node applies the same
change and verifies that the digest of the result equals the signed digest. Missing,
forged, copied, stale or wrong-author proofs fail with 409.

- Store `stickerPacks`: one whole-pack document per pack, signed by the owner. The
  proof has `recordId = <packId>`, kind `put`, and `payloadDigest` covers
  `{ id, name, ownerIdentityId, createdAt, updatedAt, stickers: [{ id, type,
  assetCid, contentType, sizeBytes, dimensions: { width, height } }], scopeType:
  "sticker_pack" }` without `proof`. Packs are never deleted.
- Store `stickerUserLibraries`: independent signed records, author = `identityId`:
  - `sticker_favorite`, id `favorite:<identityId>:<packId>:<stickerId>`:
    `{ id, identityId, packId, stickerId, favoritedAt, scopeType }`; removal is a
    `delete` proof over `{ id, identityId, packId, stickerId, removed: true, scopeType }`.
  - `sticker_saved_pack`, id `saved:<identityId>:<packId>`:
    `{ id, identityId, packId, savedAt, scopeType }`; removal is a `delete` proof over
    `{ id, identityId, packId, removed: true, scopeType }`.
  - `sticker_recent`, id `recent:<identityId>:<packId>:<stickerId>`:
    `{ id, identityId, packId, stickerId, usedAt, scopeType }`; never deleted. Only
    the 10 newest by `usedAt` are returned.
- Proofs for the same record increase `sequence` (predecessor = digest of the
  previous mutation, null at 0).

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
  "packId": "<client generated id>",
  "name": "Blue archive reactions",
  "createdAt": 1780000000000,
  "mutation": "SignedPublicMutation (pack document, updatedAt = createdAt, stickers [])",
  "savedPackMutation": "SignedPublicMutation (saved record saved:<identityId>:<packId>, savedAt = createdAt)"
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

Body: `{ "savedAt": <ms>, "mutation": SignedPublicMutation (saved record put) }`.

### Remove saved sticker pack

```http
DELETE /stickers/packs/{packId}/saved
```

Requires signed HTTP headers. Removes the pack from the authenticated identity
library and returns the updated library.

Body: `{ "mutation": SignedPublicMutation (delete proof over the saved tombstone) }`.

### Update sticker pack

```http
PATCH /stickers/packs/{packId}
```

Requires signed HTTP headers from the pack owner.

Body:

```json
{
  "name": "Updated pack name",
  "updatedAt": 1780000000000,
  "mutation": "SignedPublicMutation (whole resulting pack document)"
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
  "stickerId": "<client generated id>",
  "updatedAt": 1780000000000,
  "mutation": "SignedPublicMutation (whole resulting pack document)",
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
sticker without `stickerId`.

### Remove sticker

```http
DELETE /stickers/packs/{packId}/stickers/{stickerId}
```

Requires signed HTTP headers from the pack owner. Body:
`{ "updatedAt": <ms>, "mutation": SignedPublicMutation (pack document without the sticker) }`.

### Favorite sticker

```http
PUT /stickers/packs/{packId}/stickers/{stickerId}/favorite
```

Requires signed HTTP headers. The sticker must exist. Returns the updated
authenticated identity sticker library.

Body: `{ "favoritedAt": <ms>, "mutation": SignedPublicMutation (favorite put) }`.

### Remove favorite sticker

```http
DELETE /stickers/packs/{packId}/stickers/{stickerId}/favorite
```

Requires signed HTTP headers. Returns the updated authenticated identity sticker
library.

Body: `{ "mutation": SignedPublicMutation (delete proof over the favorite tombstone) }`.

### Record sticker usage

```http
POST /stickers/packs/{packId}/stickers/{stickerId}/used
```

Requires signed HTTP headers. The sticker must exist. Returns the updated
authenticated identity sticker library with the sticker moved to the front of
`recentStickers`. The list is capped at 10 entries.

Body: `{ "usedAt": <ms>, "mutation": SignedPublicMutation (recent put) }`.

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

Community poll events are scoped by community/channel and do not expose the
member list. Group conversation poll events include `participantIds`.

### Create poll

```http
POST /polls/
```

Requires signed HTTP headers. Polls are public replicated records (store
`polls`), so the client signs the mutation: the body also carries `pollId`
(client-chosen id, the record id), `createdAt` (epoch ms) and `mutation`
(`SignedPublicMutation`, `put`, signer = creator). The signed payload is the
record without `proof`: `allowsMultipleVotes`, `createdAt`, `creatorIdentityId`,
`expiresAt` (omitted when none), `id` (= `pollId`), `options` (`{id,text}`),
`question`, `scopeType: "poll"` and the scope fields (`communityId` +
`channelId`, or `conversationId`).

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
  "pollId": "<pollId>",
  "createdAt": 1780000000000,
  "mutation": { "...": "SignedPublicMutation" },
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
  "optionIds": ["pizza"],
  "createdAt": 1780000000000,
  "mutation": { "...": "SignedPublicMutation" }
}
```

The ballot is the record `poll-vote:<pollId>:<voterIdentityId>` (store `polls`,
`scopeType: "poll_vote"`, signer = voter). Signed payload: scope fields,
`createdAt`, `id`, `optionIds`, `pollId`, `scopeType`, `voterIdentityId`.
Changing the vote is a `put` with a higher `sequence`.

Sending a new vote replaces the authenticated identity's previous vote. Polls
with `allowsMultipleVotes: false` accept exactly one option id.
Expired or manually closed polls reject new votes.

### Remove own vote

```http
DELETE /polls/{pollId}/votes/me
```

Requires signed HTTP headers and access to the poll scope. Body
`{ "mutation": SignedPublicMutation }` with a `delete` proof over the tombstone
`{ id, pollId, removed: true, scopeType: "poll_vote", voterIdentityId }` (same
record id as the ballot, higher `sequence`).

### Close poll

```http
POST /polls/{pollId}/close
```

Requires signed HTTP headers and access to the poll scope. Closed or expired
polls reject new votes. Body `{ "createdAt", "mutation" }`; the close is the
record `poll-close:<pollId>` (`scopeType: "poll_close"`, signer = closer, who
must be the creator or manage polls in the channel). Signed payload: scope
fields, `closedByIdentityId`, `createdAt`, `id`, `pollId`, `scopeType`. Ballots
with `createdAt` after the earliest close are ignored.

## Private operation authorization

Create a protected scope with `POST /private-authorization/scopes`. The signed
request identity must own the submitted private community projection. The body
contains an independently authorized owner device key, the exact identity
authorization revision, the device-signed genesis, its protected MLS state and
an owner-only, non-discoverable private community projection. The node verifies
the identity-to-device authorization and commits the initial state atomically.
An identical retry returns `duplicate`; conflicting
genesis data is rejected. A node admits at most 16 scopes and 32 MiB of initial
scope data per owner, and 64 scopes and 256 MiB across all owners.

Protected communities reject the ordinary community mutation routes. A signed client first
submits the complete signed operation and, for control operations, the same
participant-encrypted control frame used for acceptance to
`POST /private-authorization/challenges`. The node verifies the operation
signature against its local checkpoint and authenticates a control transition
only after the author credential is authorized at the exact current identity
authorization revision. It then durably reserves the child head and returns the
exact one-use freshness request. The request expires after ten seconds of local
monotonic time and is consumed only after a valid proof is successfully verified.

Submit the signed operation, signed freshness proof and, for commits or device
revocation, the participant-encrypted control frame to
`POST /private-authorization/operations`. The response status is `accepted`,
`duplicate` or `pending`. Pending means the signature and freshness proof were
valid but a causal dependency or newer authorization checkpoint is missing.
Clients retain the encrypted frame and retry it with a new challenge; the node
does not acknowledge remote delivery until the result is accepted or duplicate.

Both endpoints require the normal signed HTTP request. That request controls
access to the attached node; operation authorship and permissions come only
from the private operation signature, local checkpoint and community aggregate.
Errors are fixed and never include the submitted scope, identity, key, payload
or nested cryptographic error.

## Identity device authorization

Identity creation publishes only a genesis device credential commitment, a
public recovery authority and authorization revision zero. Passwords, password
KDF parameters, protected device roots, recovery secrets and encrypted private
keys are client-local data and are rejected by the identity API.

Read the current checkpoint with:

```http
GET /identity-devices/{percent-encoded identityId}
```

This endpoint requires the normal signed HTTP headers, and the stable identity
signing key must match the requested identity. A client performing total device
recovery can therefore read the checkpoint after recovering that key, before it
has an authorized device credential. Missing or invalid authentication and a
different signer all return the same generic `401`. The response contains only
`epoch`, `identityId` and `revision`; it does not expose a device catalog or
credential commitments. Restricting the endpoint to the identity owner avoids
creating a public identity-target lookup or cross-identity access relationship.

An existing device additionally sends `X-Device-Credential` and
`X-Device-Signature`. The credential uses the normalized public-key form used by
identity identifiers, without PEM delimiters or whitespace. The device signature
covers the same canonical method, path, timestamp and body hash as the stable
identity signature. Total recovery sends `X-Recovery-Signature` over that same
canonical payload instead. Exactly one complete proof is required. The node
verifies the device against the current authorization checkpoint or the recovery
signature against its recovery authority before returning the checkpoint. A
missing, mixed, malformed, invalid, revoked or unrelated proof returns the same
generic `401` without revealing which check failed.

Submit an enrollment, revocation or recovery operation to:

```http
POST /identity-devices/transitions
```

Every transition binds the identity, recovery epoch, operation UUID, exact
predecessor and next revision, operation kind, target public credential and its
commitment. The epoch is `genesis` before the first recovery and the recovery
operation UUID afterwards. Device enrollment additionally binds a single-use
pairing UUID, a short expiry, the authorization time and a proof signed by the
target credential. Both device signatures cover that time, and the domain
rejects an authorization time after the pairing expiry. Enrollment and
revocation are signed by an authorized device credential; recovery is signed by
the identity's pinned recovery authority and replaces the authorized device
set.

Signatures cover the UTF-8 bytes of compact JSON with no whitespace. Keys are
written in the order shown below and properties whose value is `undefined` are
omitted. The target proof preimage is:

```json
{"domain":"pigeon:device-authorization:proof-of-possession:v2","transition":{"authorCredential":"<public credential>","authorizedAt":1770000000000,"epoch":"genesis","identityId":"<identity id>","operation":"enroll","operationId":"<uuid>","pairingExpiration":1770000060000,"pairingId":"<uuid>","previousRevision":0,"revision":1,"targetCredential":"<public credential>","targetCredentialCommitment":"<lowercase SHA-256 hex>"}}
```

After inserting the resulting target signature, the author signature preimage
is:

```json
{"domain":"pigeon:device-authorization:transition:v3","proofOfPossession":"<target signature>","transition":{"authorCredential":"<public credential>","authorizedAt":1770000000000,"epoch":"genesis","identityId":"<identity id>","operation":"enroll","operationId":"<uuid>","pairingExpiration":1770000060000,"pairingId":"<uuid>","previousRevision":0,"revision":1,"targetCredential":"<public credential>","targetCredentialCommitment":"<lowercase SHA-256 hex>"}}
```

Revocation omits `authorizedAt`, `pairingExpiration`, `pairingId` and
`proofOfPossession`. Recovery also omits `authorCredential`; its target proof
uses the proof envelope above, and the recovery authority signs the transition
envelope. Credentials and signatures use their API string representation
without decoding or normalization.

The endpoint is unauthenticated until signatures are verified, so each node
rate limits it before any lookup or lock: 20 submissions per identity and 300
per node per minute. Excess requests return `429`.

The response contains only the identity identifier, current recovery epoch and
deterministic current revision; it does not return an authorized-device catalog.
Replayed operation or pairing identifiers, stale predecessors, wrong recovery
epochs, pairing authorizations signed after their declared expiry, substituted
identities or credentials, revoked authors and unrelated recovery authorities
return `409`. Replicas accept an otherwise valid fully signed enrollment after
an offline partition. A complete artifact signed by both devices is
authorization, rather than an unsigned bearer offer; transport delay does not
invalidate it. The author must refuse to create that final signature after the
pairing deadline. The endpoint never returns local vault envelopes or secret
recovery material.

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

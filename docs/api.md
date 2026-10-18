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

- canonical request payload: method, path, timestamp and body hash, built by
  `SignedHttpRequestSignature` from `@haskou/pigeon-swarm-crypto`; the signed
  bytes are `utf8("pigeon:signed-http-request:v1\n")` followed by the RFC 8785
  canonical JSON of that payload
- canonical payload `timestamp` is a JSON number; HTTP headers carry it as text
- timestamp freshness validation with a 30 second maximum clock skew
- replay rejection: a mutating (non-GET/HEAD/OPTIONS) signed request whose
  identity and signature were already accepted inside the freshness window is
  rejected with `401`. A device proof (`X-Device-Signature`) or recovery proof
  (`X-Recovery-Signature`) is fresh and one-use on every method, `GET`
  included: a client signs each such request anew (see _Identity device
  authorization_)
- the replay guard is in-memory and per node: it remembers each accepted
  signature for its 60 second validity window. Within that window a signed
  request can therefore be accepted once more on another node, or once more on
  the same node after a restart; clients never resend a request they already
  sent
- a request takes a replay slot only after its signature, freshness and block
  checks passed: an identity request then, a device or recovery proof only once
  the device is authorized or the key is the recovery authority of the
  identity. A request refused before that point leaves no record behind. A
  check that runs after authentication keeps the slot. That holds for every
  route's own checks on an authenticated state-changing request, such as a
  node owner route that refuses a key with `403` code `403010`
  (`POST /node/networks` included), or a `PUT /node/blocks` body that does not
  hash to `X-Body-Hash`. The signature was valid and fresh, so keeping it
  refuses a resend of the same signed headers. The slot counts against the
  signing key and, for a stranger (below), against its client address and the
  stranger share too
- the guard is bounded and fails closed: each signing key holds at most 1,000
  live entries and the whole guard holds 100,000. The node serves a key when it
  holds its identity or the identity owns the node (read from the local node
  metadata, so an owner whose identity lives on another node, or an owner
  while the replicated state is not open, is served too). Every other key is a
  stranger: an identity creating itself here, an identity held elsewhere, and
  any identity but the owner while the node has not opened its replicated
  state. Strangers share 10,000 entries, of which one client address holds at
  most 250 (IPv6 counts per /64, IPv4-mapped addresses as IPv4; the address is
  the socket address unless `API_TRUST_PROXY` names a reverse proxy, so a proxy
  the node is not told about puts every stranger on one address). The address
  is kept in memory only, with its entry. An entry expires after 60 seconds and
  is dropped when the guard next records a signature: a signed state-changing
  request, or a device or recovery proof on any method
- the per-address cap of 250 is a trade-off. Filling the stranger share takes
  40 addresses instead of one. One address still has room for its identity
  creations (`IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE`, 30 by default)
  and for the other strangers behind a carrier NAT or a shared proxy, which
  rarely sign 250 state-changing requests within 60 seconds. Above that, the
  clients behind that address get `401020` until its entries expire. While the
  replicated state is not open every identity but the owner is a stranger, so a
  busy shared address meets the cap sooner during that window. An attacker
  holding 40 IPv4 addresses, or an IPv6 prefix of /58 or shorter (40 /64s or
  more), can still fill the share. The identities and devices this node serves
  and its owner keep their slots then
- a full share refuses new signatures with `401` code `401020` instead of
  evicting live entries, until entries of that share expire (at most 60
  seconds). A stranger refused this way, such as a client creating its
  identity, retries with a newly signed request after that. One source of
  self-made keys therefore fills only its own part of the stranger share; the
  identities and devices this node serves and its owner keep their slots, and
  no live entry is flushed, so an intercepted signature stays refused
- served keys have no per-address limit: they are bounded per key, the node
  admits them (registration mode and owner admission), a blocked key is refused
  before it takes a slot, and clients behind one address (carrier NAT, a shared
  proxy) must not lock each other out. Many served identities together can
  still fill the 100,000 entries (100 identities at 1,000 requests a minute
  each); the owner answers that by blocking them
- no identity-signed `GET`, `HEAD` or `OPTIONS` request takes a slot, and
  neither does the transitions read of a key that was never authorized (see
  _Identity device authorization_). Replaying either inside the window only
  returns again what that key may read, at most the public recovery lineage.
  The guard is kept for state changes and for device and recovery proofs, which
  take a slot on every method
- `X-Identity-Id` must be the one canonical encoding of a usable Ed25519 key
  (PEM armour and whitespace are ignored). An alias encoding of the signing key,
  such as another DER prefix byte or base64 padding bits that decode to the
  same bytes, is refused with `401` code `401020`, so block lists, owner checks
  and the replay guard always see one id per key
- declared body hash (`PUT /node/blocks` only): the request also carries
  `X-Body-Hash`, the lowercase hex SHA-256 of the exact body bytes, and the
  canonical payload is built with that hex string as its `body` instead of the
  body itself. The node verifies the signature, freshness, replay and owner
  from the headers before reading any body byte, then streams the body and
  refuses it with `401` code `401020` unless it hashes to `X-Body-Hash`
- Cucumber scenarios for invalid and stale signed requests

Byte-exact vectors for the canonical request payload and its Ed25519 signature
are in `@haskou/pigeon-swarm-crypto/vectors/signed-http-request.json`,
checked by the `SignedHttpRequestVectors` unit spec. They cover a lowercase
method, a request without a body, and a raw binary body, and they require that a
changed path, method, body or timestamp is rejected.

Because each vector carries a fixed timestamp, a live node refuses it as stale,
so the vectors are pinned against a real node by
`tests/e2e/real-transport/signed-http-request.ts`
(`yarn test:e2e:real-transport:signed-http-request`). The script first rebuilds
every vector's `signingContent` and signature byte for byte with `node:crypto`
only (body hash, key order, Ed25519 from the fixture key), without the node's
canonicalization code. It then publishes an identity for the fixture key,
re-signs the same request shapes with a fresh `Date.now()` timestamp and sends
them to real signed endpoints: a body-less `GET /notification-settings`, a
JSON `POST /private-blobs` and a raw binary `POST /ipfs/contents` with the
vector's bytes. All are accepted. The fixed vector timestamp, a timestamp
outside the window in either direction, a JSON or binary body changed after
signing, another path or method than signed, and a replayed `POST` are each
refused with `401` and code `401020`.

## Public mutation proof (authorization revision)

Every client-signed record (`SignedPublicMutation`) is a proof body plus its
signature:

```json
{
  "version": 2,
  "store": "<store>",
  "kind": "put",
  "operationId": "<random base64url, 22 characters>",
  "recordId": "<record id>",
  "payloadDigest": "<base64url sha256 of the canonical record>",
  "frontier": ["<scope operation digest>"],
  "predecessor": null,
  "sequence": 0,
  "author": {
    "identityId": "<identityId>",
    "deviceCredential": "<signing device public key>",
    "authorizationRevision": 3
  },
  "signature": "<Ed25519 signature, standard base64 with padding>"
}
```

`frontier` is present only on records scoped to a community (channel messages,
reactions, pins, membership requests, moderation log, MLS records,
polls) and absent everywhere else; the node rejects a scoped record without it
and any other record with it. It lists 1–64 digests of the community's
operations, strictly ascending, that the author had observed
(`GET /communities/:id/frontier`). The record's permission is judged against the
community folded at exactly that frontier, so the verdict does not depend on
what a node holds when it evaluates the record; an unknown head is refused and
retried after replication, like an unknown operation parent.

The device signs the UTF-8 bytes `"pigeon:public-mutation:v2\n" +
canonicalize(body-without-signature)` (RFC 8785). `version` is exactly `2`;
version `1` proofs and the `pigeon:public-mutation:v1\n` domain are rejected
(`InvalidPublicMutationError`) and there is no fallback. The decoder is strict:
unknown fields are rejected.

`payloadDigest` is `StateDigest.of(payload)` from `@haskou/pigeon-swarm-crypto`:
`base64url(sha256(utf8(canonicalize(payload))))` of a plain JSON object, pinned
by `@haskou/pigeon-swarm-crypto/vectors/commitment-ids.json` (`stateDigest`). A
payload that is not a plain object or carries a non-finite number has no digest
and is rejected (`InvalidPublicMutationError`).

Depth limit: the payload object itself is depth 0, and every value inside an
object or an array is one level deeper than that object or array. A payload
whose deepest value is at depth 64 is digested. A payload with any value at
depth 65 or deeper has no digest and is rejected (`InvalidPublicMutationError`).
For example, `{"a":1}` has depth 1 and `{"a":[{}]}` has depth 2. The same digest
and limit give community and conversation operations their ids. Their `args` sit
at depth 1 of the digested operation, so the operation limits below refuse
`args` deeper than 63 levels (`args` itself being depth 0) before any digest is
taken.

`author.authorizationRevision` is a non-negative safe integer: the `revision` of
the identity's device-authorization chain (`GET /identity-devices/authorization`)
that the signing device observed when it signed. It is inside the signed body.
Nodes evaluate the signing device against the authorization chain **at that
revision**, not at the current head:

- a device is accepted iff the chain state with the greatest revision `<=` the
  claimed one contains the device and the claimed revision is not above the head
  the node has replicated;
- a record signed before a revocation stays valid when it is delivered after the
  revocation (late delivery, partition heal, sync from scratch, restart);
- a revoked device cannot claim the revocation revision or any later one;
- a claimed revision above the node's head is refused until the chain
  replicates (the node retries replicated records) and a revision below the
  latest recovery checkpoint is refused;
- timestamps inside the record are never used for authorization.

A client reads `revision` immediately before signing and uses that value. Byte
exact signing vectors for every store are in `tests/fixtures/*-vectors.json`
(`author.authorizationRevision: 0`, `version: 2`). The design, threat model and
the chosen bound are in `docs/design/causal-device-authorization.md`.

**Network binding.** Any peer of a network can write to that network's replicated
stores, so a validly signed record that names another network could be copied
into them. A node therefore reads a signed record whose top-level `networkId`
names a network only from the store of that network: a copy found in any other
network's store is ignored. It is never returned, projected or counted, and a
per-identity quota of its network never sees it. Records that name no single
network (for example identities, whose `networkIds` list their memberships, or
channel messages, scoped by community) are not affected by this rule.

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

## Path conventions

Every route follows one convention, checked by the `APIPathConventions` unit
spec against the route handlers and the OpenAPI documents:

- **Nouns.** A segment names a resource, never an action: search is a `query`
  parameter on the collection, and a state change is a write to the resource.
- **Plural collections.** A collection is plural and its items are keyed by a
  parameter: `/communities/{communityId}`. A static segment never sits beside
  that parameter, so a collection the caller owns is a kebab-case resource of
  its own, such as `/community-drafts` or `/community-membership-requests`.
- **Singletons.** A resource that exists once in its parent is singular and
  never keyed by a parameter: `/node` and its `owner`, `registration`,
  `relay-configuration` and `diagnostics`, a community `frontier`, `mls`
  group and `invitation-preview`, an invitation `revocation`, a channel
  `draft`, a message `pin` and `thread`, a sticker pack `saved` mark, a
  sticker `favorite` mark, a sticker `usage` mark, the sticker `library`, the
  node block-list `publication`, `/client-contract`,
  `/ipfs/replication-status` and `/push/vapid-public-key`. The namespaces
  `/ipfs`, `/push`, `/realtime` and
  `/private-authorization` are singletons too.
- **`me`.** `me` stands for the authenticated identity only as the item of a
  collection keyed by identity: `members/me`, `participants/me`, `votes/me`,
  `presence/me`. Anything else the caller owns is its own collection.
- **No verbs.** No segment is an action such as `search`, `join`, `accept`,
  `publish` or `send`.
- **No version segment.** Paths carry no `v1`; a protocol version belongs in
  the protocol, such as the `pigeon-realtime.v1` WebSocket subprotocol.
- **No trailing slash.** Routing is strict: `/calls/` is not `/calls` and
  answers `404`. A signed path is the route path exactly, with no trailing
  slash.

Replaced by issue #606, no longer served (they answer `404`; a client that
signed one of the old paths must sign the new one):

| Removed route                                                 | Replacement                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `DELETE /communities/{communityId}/members/{identityId}/kick` | `DELETE /communities/{communityId}/members/{identityId}`          |
| `POST /polls/{pollId}/close`                                  | `PATCH /polls/{pollId}` with `{ "status": "closed" }`             |
| `POST /calls/{callId}/participants/me/heartbeat`              | `PATCH /calls/{callId}/participants/me`                           |
| `POST /stickers/packs/{packId}/stickers/{stickerId}/used`     | `PUT /stickers/packs/{packId}/stickers/{stickerId}/usage`         |
| `POST /communities/{communityId}/channels/text` and `/voice`  | `POST /communities/{communityId}/channels` with `type`            |
| `GET /communities/discover`                                   | `GET /discoverable-communities`                                   |
| `GET /calls/history`                                          | `GET /past-calls`                                                 |
| `GET /calls/ice-servers`                                      | `GET /call-ice-servers`                                           |
| `POST /node/networks/public`                                  | `POST /node/networks` with `{ "name": "public" }`                 |
| `POST /ipfs/public`                                           | `POST /ipfs/contents`                                             |

The three removed `GET` paths still match `GET /communities/{communityId}` and
`GET /calls/{callId}`. Those two routes authenticate the request first and then
refuse a segment that is not a canonical id (a 43-character base64url community
id, a lowercase UUID call id) with `404`, before any lookup. A signed request
for `/communities/discover`, `/calls/history` or `/calls/ice-servers` therefore
answers `404`, and an unsigned one `401`.

Documented exceptions, RPC-style operations with no resource to write:

| Route                                | Why it stays                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `POST /mailboxes/{mailboxId}/ack`    | Advances a per-reader cursor that is only valid forward; it is not a state the reader owns. |
| `POST /push/test`                    | Triggers a one-shot delivery with no stored resource.                                       |

## Errors

Every refused request answers with a JSON object (`application/json`, never
`application/problem+json`). The shape is shared by every operation through the
`Error` response in `src/apps/apis/open-api.yaml` (`#/components/responses/Error`,
schema `ErrorResponse`), which each operation references as its `default`
response.

```json
{
  "code": 400060,
  "message": "Human-readable reason.",
  "httpStatus": 400
}
```

- `code` is a stable numeric code (for example `400060`) or, for domain
  refusals, the error class name (for example `StalePublicMutationError`). Clients
  branch on `code`, never on `message`.
- `httpStatus` repeats the HTTP status for framework errors; `details`, `errors`
  and `requiredDifficultyBits` appear only where the operation documents them.
- Status codes are listed per operation: each operation documents the codes it
  can return.
- A malformed id in a request body (for example a conversation `participantIds`
  entry that is not a canonical identity key) returns `400`. The same id in a
  path returns `404`, the same as an unknown id, so the response does not reveal
  which shape a resource id must have. A removed verb-style path that matches
  `/:id` is refused the same way.

### Delete responses

A successful `DELETE` returns `200` with the updated resource when the resource
(or the caller's view of it) still exists after the delete, for example a
community member, a poll vote or a sticker library. It returns `204` with no
body only when there is nothing to return, as for resetting notification scope
settings.

### Request bodies

A request that carries a body (a `Content-Length` above zero, or a chunked
transfer) must declare `Content-Type: application/json`. Any other type is
refused with `415` and `UnsupportedMediaTypeError` before routing. Bodyless
requests are not affected. Raw-body routes (`POST /ipfs/contents`,
`PUT /node/blocks` and `PUT /private-blobs/{blobId}`) read their bytes as sent
and accept the types they declare.

### Operation ids

Every operation has an `operationId`, unique across the API documents and
matching `^[a-z][A-Za-z0-9]*$`. It is the lowercase method followed by the path
segments in PascalCase, each `{param}` as `By<Param>`: `GET /polls/{pollId}` is
`getPollsByPollId`, `POST /polls` is `postPolls`. The spec test
`tests/unit/apps/apis/OperationIds.spec.ts` asserts the format, uniqueness and
the shared error response on every operation.

### Concurrency

Mutable resources do not use `ETag` or `If-Match`. Where a resource carries a
`sequence` or an authorization revision, the node refuses a stale write with
`409 StalePublicMutationError`; everything else is last-write-wins. Adding
`If-Match` to drafts, settings, profiles or roles is deferred until a client
needs it.

## Pagination

Paged list endpoints take `limit` and an opaque `cursor`, and respond with
`nextCursor`:

- `limit` defaults to 50 and is clamped to 1..100 unless an endpoint documents
  other bounds.
- `nextCursor` is the cursor for the next older (or next) page. It is `null`
  when there is no further page: an empty channel timeline, or an operations or
  moderation-log page that is not full. Pass it back unchanged as `cursor`.
- A cursor is opaque, not a capability. Clients MUST NOT parse or build one. It
  carries only a position and the resource it was issued for; it grants no
  access. Authorization is re-checked on every request from the request itself,
  never from the cursor. A cursor for another list, or a malformed one (wrong
  encoding, unknown fields, or over 512 characters), returns `400` with code
  `400110`.
- Protocol cursors (mailbox envelopes, MLS records, identity-device transitions)
  are not part of this scheme. Bounded node lists (block exceptions,
  diagnostics, published blocks, relay configuration) are returned in full.

## Realtime WebSocket API

Realtime events are exposed through a WebSocket upgrade endpoint:

```http
GET /realtime
```

This endpoint is also listed in OpenAPI so Swagger consumers can discover the
realtime entrypoint, although the actual interaction is an HTTP upgrade rather
than a regular request/response flow.

Clients authenticate the upgrade with a single-use ticket obtained from a signed
HTTP request. The ticket travels in the `Sec-WebSocket-Protocol` header, so
browser and non-browser clients use the same flow. Signed query parameters and
signed headers are ignored on this endpoint; only the ticket in
`Sec-WebSocket-Protocol` authenticates the upgrade.

The former signed-query endpoint `GET /ws` has been removed. Any upgrade to
`/ws` gets `404`, like any other path the node does not serve, whatever
credentials it carries. The ticket flow is described below.

Per node, upgrades are rate limited per remote address and total open sockets
are capped; excess upgrades receive `429 Too Many Requests` before ticket
verification. A socket sending more than 200 client messages in 10 seconds is
closed with code `1008`.

Cookies are never an input to realtime authentication: a request carrying only
a `Cookie` header is refused with `401`, and a ticket upgrade ignores any
cookie sent with it. The node never answers an upgrade with a redirect.
These properties are covered by a real HTTP server and `ws` client test. They
do not prove what a browser sends: browsers attach eligible cookies to native
WebSocket handshakes regardless of this server, so a browser-level cookie test
remains open (#291).

Optional Origin allowlist: set `REALTIME_ALLOWED_ORIGINS` to a comma-separated
list of origins and browser upgrades whose `Origin` header is not in the list
(including `null`) get `403`. Empty (default) applies no restriction.
Requests without `Origin` (non-browser clients) are not refused by this
setting. Origin is not authentication; it only lets an operator refuse pages
from other sites.

Clients fetch a single-use ticket with a signed request
and present it in a WebSocket subprotocol instead of a query string:

```http
POST /realtime/tickets
X-Identity-Id: <identityId>
X-Timestamp: <timestamp>
X-Signature: <signature>
```

The signed canonical request is `POST /realtime/tickets` with body `{}`,
prefixed by `ROUTE_PREFIX` when configured. The response is
`201 {"ticket": "<base64url>", "expiresAt": <epochMs>}` with
`Cache-Control: no-store`. Connect to `/realtime` (prefixed by
`ROUTE_PREFIX` when configured) with both subprotocols:

```ts
const socket = new WebSocket('ws://localhost:8080/realtime', [
  'pigeon-realtime.v1',
  `ticket.${ticket}`,
]);
```

The server selects `pigeon-realtime.v1` and never echoes the ticket. A ticket
is valid for 30 seconds and one upgrade, and is consumed as soon as it is
presented, even if that upgrade later fails. Each identity may hold 8
outstanding tickets and each node 10,000; at capacity issuance returns `429`
with code `429050`. Tickets sent in the query string are not read and get
`401`; the retired `/ws` path answers `404`.

Connection acknowledgement:

```json
{
  "type": "connection_ack",
  "identityId": "<identityId>"
}
```

The server immediately follows the acknowledgement with the current live
network synchronization snapshot. It publishes the same message again whenever
libp2p connectivity, OrbitDB store membership or the compared community state
changes:

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
currently known to this node, and that every one of those peers announced the
same community state (see [Get active peers](#get-active-peers)). It cannot
represent a global percentage: peers that are offline, disconnected, or have
not yet been discovered are unknowable in an eventually consistent network.

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

The reference client (`pigeon-swarm-ui`) sends it every 10 seconds. `active: true` means the user interacted with the
client since the previous heartbeat. Heartbeats are not individually signed
because the WebSocket upgrade already authenticated the identity. Backend marks
the identity `disconnected` after roughly 20 seconds without heartbeat and
derives `away` after 5 minutes without activity while heartbeat is still active.
Presence is runtime state kept in the serving node's memory. It is never
gossiped to other nodes, is not written to OrbitDB/IPFS, and resets when the
node restarts.

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
messages are ignored. Reference client interval: 10 seconds. It closes the socket with
code 4000 when no `heartbeat_ack` arrives within 30 seconds.

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
participant of a direct conversation; typing in a group conversation is never
relayed, because it travels as an MLS record through the group mailboxes.
Community channel typing is relayed only to the other community members when
the channel is a text channel.

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

- require a single-use ticket on the `/realtime` WebSocket upgrade
- accept the ticket in the `Sec-WebSocket-Protocol` header for browser and non-browser clients
- push domain events after they have been published by the local node
- deliver identity events to the matching identity connection;
  `identities.v1.identity.was_updated` also reaches identities that share a
  one-to-one conversation or a community with it. Sharing a group conversation
  does not count: group rosters are never a fan-out input
- deliver keychain events only to the matching keychain owner
- deliver notification events only to the notification recipient
- deliver conversation events only to the conversation participants when the
  event carries `participantIds`
- deliver presence events only to the connections of the identity they describe
- deliver conversation call snapshots only to currently authorized participants;
  community call snapshots go to clients with current voice-channel access
- deliver call signals only to `recipientIdentityId`
- deliver node-wide events, such as heartbeat/peer updates, to all
  authenticated WebSocket clients on the local node
- never deliver `nodes.v1.community_state.was_announced`; it is a node-to-node
  digest exchange whose only client-visible result is the `communityState` of
  `networkSynchronization`
- drop non-node events that do not carry enough identity information to route
  them safely

Event contracts used by frontend:

| Event type                                            | Aggregate id      | Attributes used by clients/routing                                                                                         |
| ----------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
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
| `communities.v1.channel.message.was_edited`           | community id      | `communityId`, `channelId`, `messageId`, `authorIdentityId`, `networkId`, `memberIds`                                      |
| `communities.v1.channel.message.was_deleted`          | community id      | `communityId`, `channelId`, `messageId`, `targetMessageId`, `deletedByIdentityId`, `networkId`, `memberIds`                |
| `communities.v1.channel.message.was_pinned`           | community id      | `communityId`, `channelId`, `messageId`, `pinnedByIdentityId`, `networkId`, `memberIds`                                    |
| `communities.v1.channel.message.was_unpinned`         | community id      | `communityId`, `channelId`, `messageId`, `unpinnedByIdentityId`, `networkId`, `memberIds`                                  |
| `communities.v1.channel.message.reaction.was_added`   | community id      | `communityId`, `channelId`, `messageId`, `authorIdentityId`, `emoji`, `createdAt`, `networkId`, `memberIds`                |
| `communities.v1.channel.message.reaction.was_removed` | community id      | `communityId`, `channelId`, `messageId`, `authorIdentityId`, `emoji`, `createdAt`, `networkId`, `memberIds`                |
| `polls.v1.poll.was_created`                           | poll scope id     | `pollId`, `poll`                                                                                                           |
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

For call lifecycle and signalling events, use `event.aggregate_id` as
`callId`. Browser notifications for `calls.v1.participant_lease.was_updated`
also use the call ID; composite node-owned lease IDs remain internal. Calls
are signalling only: audio/video media is negotiated by frontend with WebRTC.
The backend stores active call state and routes lifecycle/signalling events to
the authenticated participants.

## Calls HTTP API

Calls can be scoped to a one-to-one conversation, a group capability (the group
itself lives in MLS on the clients) or a community voice channel. All endpoints
require signed request authentication.

An endpoint that addresses a call by id answers HTTP 503
`ReplicatedStateNotReadyError` (code `503020`) instead of 409
`CallNotFoundError` when the node holds the start of the call but has not
admitted it yet. That happens for a few seconds after a node restarts, while
the authorization the call records rest on still loads from its peers. The call
is not over: clients keep it up and retry the request. A call the node does not
hold, or whose start it rejected for good, answers `CallNotFoundError`.

The same 503 replaces 409 `CallParticipantNotFoundError` on a heartbeat, an
end or a signal when the call does not show the requester (or the signal
recipient) as a participant that can act, and that identity's own participant
record of the call still waits for admission. The node may admit the start of
a call before such a record, so for those seconds the call shows the
participant as when the call started. A participant the call accepts is never
held back by a waiting record.

Both 503 answers also cover the moments after a restart when the node could
not replay its call history yet because a block it needs was missing locally:
until that replay succeeds, for at most 60 seconds, a call or participant the
node cannot find answers `503020` instead of `CallNotFoundError` or
`CallParticipantNotFoundError`. The list keeps answering 200.

### List active calls

```http
GET /calls
```

Returns active calls associated with the authenticated identity, filtered by current conversation membership or voice-channel permissions. Former participation does not preserve access.

Query: `limit` (1..100, default 50) and `cursor` (the `nextCursor` of the previous page). Calls are ordered by creation time, oldest first, then call id. Pass `nextCursor` as `cursor` to read the next page; `nextCursor` is `null` on the last page. A malformed cursor, or one from another list, returns `400` with code `400110`.

### List past calls

```http
GET /past-calls
```

Returns active and finished conversation calls where the authenticated identity participated and still has conversation access. Historical participant states and lifecycle timestamps are available only through this history contract. Community voice-channel histories are excluded.

Query: `limit` (1..100, default 50) and `cursor` (the `nextCursor` of the previous page). Calls are ordered by creation time, oldest first, then call id. Pass `nextCursor` as `cursor` to read the next page; `nextCursor` is `null` on the last page. A malformed cursor, or one from another list, returns `400` with code `400110`.

### Get call

```http
GET /calls/{callId}
```

Returns a minimal snapshot after checking current scope access. `participantIds`
and `participants` contain only authorized connected participants and current
ringing invitees, plus, during the lease warm-up described under
[Presence retention](#presence-retention), joined participants whose lease the
node has not heard yet. Departed/expired participants, join/leave timestamps, heartbeat
timestamps and remote transport diagnostics are omitted. Community snapshots omit `creatorIdentityId`,
`createdAt`, `endedAt` and `endedByIdentityId`; conversation snapshots retain the
caller and lifecycle times needed for incoming-call and ended-call UI. An ended
community snapshot whose call lost a concurrent start carries `supersededByCallId`,
the id of the winning call of the same channel.
A community member with current channel access can inspect its live snapshot
without having joined. Conversation reads additionally require call participation.

Apply `event.attributes.liveCall` directly from call WebSocket notifications.
`liveCallRevision` is a monotonically increasing counter from the connected
server, not an OrbitDB revision or cross-node clock. Reset revision tracking on
each connection acknowledgement; reject older/duplicate revisions per call.
Load the call list on initial connection/reconnect, preserving any newer
WebSocket snapshots received while the recovery request was outstanding.
Client recovery behavior (retry count and delays, request deduplication, handling of
malformed snapshots) is implemented by the client and is not enforced by the backend.
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

A node that just started has heard no lease yet. Until five seconds after its
call projection becomes ready, HTTP and WebSocket snapshots keep a joined
participant without any lease on the node as `status: joined` with
`connected: false`, so a restart does not read as that participant leaving.
A participant whose lease the node holds as disconnected is omitted as usual.
The window is local and bounded; nothing a peer publishes opens or extends it.

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

### Get call ICE servers

```http
GET /call-ice-servers
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
  `credential=base64(hmac-sha1(username, CALLS_TURN_SHARED_SECRET))`, issued by
  `TurnRestCredential` from `@haskou/pigeon-swarm-crypto`; the secret is at most
  4096 UTF-16 code units and an invalid secret fails configuration loading
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

The `haskou/pigeon-swarm` wrapper's `tests/turn-media.integration.mjs` covers signed HTTP credential
requests from the real backend and Chromium audio over UDP, TCP and TLS before
and after coturn restart. Its `tests/two-node-call.integration.mjs` delegates to
`tests/two-node-call-runner.mjs`, which starts two nodes with separate TURN services and
secrets (`turn-a`, `turn-b`, `TEST_SECRET_A`, `TEST_SECRET_B`). The runner source has no audio check.
External NAT/CGNAT and user-observed audio acceptance remain tracked separately
in [deployment #29](https://github.com/haskou/pigeon-swarm/issues/29).

TURN improves NAT traversal and hides peer IPs from the other participant, but
it does not make large group calls cheap. A mesh group call still creates one
peer connection per participant pair. For large groups, add an SFU/media relay
later so every client uploads one media stream and receives only the streams it
needs.

The backend does not embed a TURN server. The `haskou/pigeon-swarm` image runs
coturn embedded by default and reads the persisted listener and private relay range
from a local runtime contract. Its `external-turn` Compose profile runs coturn as a
sidecar sharing the backend network namespace. The configured host range must be
published over TCP for IPFS and UDP for TURN. The node-to-node relay discovery
protocol is documented in
[Calls TURN Relay Discovery](calls-turn-relay-discovery.md).

### Signed call events

A call is not a document that a node edits: it is derived on every node from
three kinds of replicated records in the `calls` collection, each **signed by
the user it speaks for**. The node holds no user key and has no unsigned
fallback. The UI builds the record, the proof and the signature; the node
rebuilds the record from the request and the node's own state, and the signature
only verifies if the client signed exactly those bytes. A call, a participant
state or an end that no admitted record supports does not exist on any node.
Byte-exact vectors live in
`@haskou/pigeon-swarm-crypto/vectors/call-event.json` and are checked by the
`CallEventVectors` unit spec.

| Record             | id                                       | Author          | Written by                                                                                                                                   |
| ------------------ | ---------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `call_start`       | `call:<callId>`                          | the creator     | `POST /calls`                                                                                                                                |
| `call_participant` | `call-participant:<callId>:<identityId>` | the participant | `POST /calls/{callId}/participants`, `DELETE /calls/{callId}/participants/me`; community and group calls verify the record and store nothing |
| `call_end`         | `call-end:<callId>`                      | the ender       | `DELETE /calls/{callId}`                                                                                                                     |

**Call id.** The id is derived, never chosen: the first 16 bytes of
`sha256(utf8(creatorIdentityId + ":" + nonce))`, with byte 6 replaced by
`(byte6 % 16) + 128` and byte 8 by `(byte8 % 64) + 128`, written as lowercase hex
`8-4-4-4-12`. The client `nonce` matches `^[A-Za-z0-9_-]{16,128}$`. Nobody can
claim the id of a call another identity started, because the id commits to the
creator.

**Records.** Each record is signed as the canonical (RFC 8785, npm
`canonicalize`) JSON of exactly these fields; an extra or missing field is
refused.

`call_start`, conversation scope (one-to-one conversations only; a group
conversation is refused). `participantIds` are exactly the participants of the
admitted conversation, sorted ascending:

```json
{
  "callId": "<callId>",
  "creatorIdentityId": "<identityId>",
  "id": "call:<callId>",
  "networkId": "<networkId>",
  "nonce": "<nonce>",
  "participantIds": ["<identityId>", "<identityId>"],
  "scope": { "conversationId": "<conversationId>", "type": "conversation" },
  "scopeType": "call_start",
  "startedAt": 1770000000000
}
```

`call_start`, community voice channel scope. `participantIds` is the empty array
(community membership is read from the signed community state) and `sessionEpoch`
is a positive integer:

```json
{
  "callId": "<callId>",
  "creatorIdentityId": "<identityId>",
  "id": "call:<callId>",
  "networkId": "<networkId>",
  "nonce": "<nonce>",
  "participantIds": [],
  "scope": {
    "channelId": "<voiceChannelId>",
    "communityId": "<communityId>",
    "type": "community_channel"
  },
  "scopeType": "call_start",
  "sessionEpoch": 1,
  "startedAt": 1770000000000
}
```

`call_start`, group call scope (`group_capability`). `participantIds` is the
empty array and no `sessionEpoch` is signed. `capabilityHash` is the lowercase
hex SHA-256 of the call capability, which the group members derive from the MLS
exporter of the group epoch; the record names neither the group nor its members:

```json
{
  "callId": "<callId>",
  "creatorIdentityId": "<identityId>",
  "id": "call:<callId>",
  "networkId": "<networkId>",
  "nonce": "<nonce>",
  "participantIds": [],
  "scope": { "capabilityHash": "<64 hex>", "type": "group_capability" },
  "scopeType": "call_start",
  "startedAt": 1770000000000
}
```

`call_participant` of a conversation call, `state` is `joined`, `left` or `declined`. Community and group joins and leaves are not stored:

```json
{
  "at": 1770000003000,
  "callId": "<callId>",
  "id": "call-participant:<callId>:<identityId>",
  "identityId": "<identityId>",
  "scopeType": "call_participant",
  "state": "joined"
}
```

`call_end`:

```json
{
  "at": 1770000010000,
  "callId": "<callId>",
  "endedByIdentityId": "<identityId>",
  "id": "call-end:<callId>",
  "scopeType": "call_end"
}
```

**Proof and signing bytes.** `mutation` is a `put` proof with `store: "calls"`,
`recordId` = the record `id`, `payloadDigest` =
`base64url(sha256(utf8(canonicalize(record))))` (43 characters, no padding) and
`author` = `{ identityId, deviceCredential, authorizationRevision }` of the authoring
identity (`authorizationRevision` is the `revision` of
`GET /identity-devices/authorization` the device observed when it signed; see
[Public mutation proof](#public-mutation-proof-authorization-revision)). The
device signs the UTF-8 bytes `"pigeon:public-mutation:v2\n" +
canonicalize(mutation-without-signature)` with Ed25519; `signature` is standard
base64 with padding (88 characters). `call_start` and `call_end` are written at
`sequence` 0 with `predecessor: null`. A participant state is one record per call
and identity: the first state is `sequence` 0, each later state carries
`sequence + 1` and `predecessor` = `base64url(sha256(utf8(canonicalize(previous
complete mutation including its signature))))`. A participant that signs a state
from a stale `sequence` (for example on a second device) gets 409
`StalePublicMutationError` with `details: { sequence, digest }` and re-signs with
`sequence + 1` and `predecessor` = that `digest`.

Conversation call start vector (`conversation_call_start`; creator key
`creator`, nonce `vector-call-nonce-conv-0001`; the signed JSON is the
`mutation` of the case):

```json
{
  "author": {
    "authorizationRevision": 0,
    "deviceCredential": "MCowBQYDK2VwAyEASrJUZSKSpoUb1mzjaHv/CP8FfO1fcxQ9nYfWajQJN04=",
    "identityId": "MCowBQYDK2VwAyEASrJUZSKSpoUb1mzjaHv/CP8FfO1fcxQ9nYfWajQJN04="
  },
  "kind": "put",
  "operationId": "vector-call-start-conv-1",
  "payloadDigest": "ZzXF4bm_zD6jHQ-YnPNQMf80YKnCoQYQsibpr-51bEo",
  "predecessor": null,
  "recordId": "call:1bc97a47-5707-80fe-a156-e7a31b96526b",
  "sequence": 0,
  "store": "calls",
  "version": 2,
  "signature": "3r6O92fx+YigDIdiumwvZvy/iDU3XmGRC1rTfDUEGP/OAvCuQRmgq9yFR8Hs9VIPwfKMcCkiLHzuVLPo1/jrCQ=="
}
```

Participant (`call_participant_left_after_joined`, second state of the callee,
`sequence` 1, `predecessor` = the digest of the complete `joined` mutation):

```json
{
  "author": {
    "authorizationRevision": 0,
    "deviceCredential": "MCowBQYDK2VwAyEAfYssPUn3veVeeSuo+92MJ4MsOfqv+40KRIz0zEc9U+0=",
    "identityId": "MCowBQYDK2VwAyEAfYssPUn3veVeeSuo+92MJ4MsOfqv+40KRIz0zEc9U+0="
  },
  "kind": "put",
  "operationId": "vector-call-leave-1",
  "payloadDigest": "mTkCz7Xxe960HrYGCXIUc_CUjs5zANvj0KmBeeN1TNw",
  "predecessor": "cM6VHQ0tYtKm0PaY7ura82i_L5P9UarD-HSYbjnnHa4",
  "recordId": "call-participant:1bc97a47-5707-80fe-a156-e7a31b96526b:MCowBQYDK2VwAyEAfYssPUn3veVeeSuo+92MJ4MsOfqv+40KRIz0zEc9U+0=",
  "sequence": 1,
  "store": "calls",
  "version": 2,
  "signature": "f1kE3Weq3Q1/TvS2X6y0j8r4Ya9DkyV09meQXUPJKGrsTehsDSXnaMKroV/brnJvdFetxqjC9RGUfQbX4tTWBQ=="
}
```

End (`call_end`):

```json
{
  "author": {
    "authorizationRevision": 0,
    "deviceCredential": "MCowBQYDK2VwAyEASrJUZSKSpoUb1mzjaHv/CP8FfO1fcxQ9nYfWajQJN04=",
    "identityId": "MCowBQYDK2VwAyEASrJUZSKSpoUb1mzjaHv/CP8FfO1fcxQ9nYfWajQJN04="
  },
  "kind": "put",
  "operationId": "vector-call-end-1",
  "payloadDigest": "VatorKBP1hUhjuuCPOxdI6LAyP9LdYSRPoYIWrcpf7s",
  "predecessor": null,
  "recordId": "call-end:1bc97a47-5707-80fe-a156-e7a31b96526b",
  "sequence": 0,
  "store": "calls",
  "version": 2,
  "signature": "XNCfA9/Z4OkqYwrMM83mLdrGy4hpKm7q9LZ5wkvd2n8EImYN4CmJlavqRTHGvZwCpJqG8M7afM+EtRSmsDbqAg=="
}
```

**Admission** (every node, on write and on replication):

- `call_start`: the creator is the proof author; the id derives from creator and
  nonce; `startedAt` is not more than 10 minutes in the future. A conversation
  start must name a one-to-one conversation and carry exactly its two signed
  participants, the creator among them; a group conversation is refused. A
  community start needs a current signed permission to connect to that voice
  channel and a `sessionEpoch` of at most one above the highest epoch of the
  starts already admitted for that channel, so an attacker cannot poison the
  channel with a huge epoch. A group call start needs a 64-hex `capabilityHash`,
  an empty `participantIds`, no `sessionEpoch` and a creator whose signed
  identity belongs to the record's `networkId`.
- `call_participant`: the identity is the proof author; the admitted start
  exists; the identity takes part in the signed conversation, may connect to
  the community voice channel, or, for a group call, belongs to the start's
  `networkId`. A community record passes this check and is then discarded, not
  stored. A group call record is never stored either: the node that receives the
  request also verifies the presented capability and keeps only a lease.
- `call_end`: the author is the creator, or any participant of a conversation
  call. Community and group calls are ended by their creator only; everybody
  else leaves.
- A record whose claimed time (`startedAt`, `at`) lies more than 10 minutes
  ahead of the node clock is refused.
- Rate cap: at most `CALLS_RECORD_RATE_LIMIT_PER_MINUTE` (default 30) call records
  per identity per minute, enforced on the write path (`429`, code `429021`);
  the replication gate cannot rate-limit deterministically. Only a record the
  node is about to store is charged: a request the call refuses (`403`, `404`,
  or `409` from the call's own rules), a `503020` not-ready answer and a
  community start that returns the live call store nothing and cost nothing,
  so retrying `503020` as documented never exhausts the budget. A record the
  store then rejects stays charged: `400` for a proof that does not match, `409`
  `StalePublicMutationError` for a stale proof.

**Visibility.** Records and call gossip reach every member of the call's
network, whether or not that member takes part in the call. The observable
fields, including the signal payload that the node does not encrypt, are listed
in [Call event visibility](pubsub-sync-protocol.md#call-event-visibility). Local
WebSocket clients receive a call event only when they are in the call's audience.

**Derived state.** Every node folds the same admitted records into the same call,
independent of arrival order: participant and end events apply sorted by their
claimed time `at`, then record id; an event that does not apply to the state
reached so far (for example a join after the end) is inert. A call that is still
active after `CALLS_MAX_DURATION_MS` (default 12 hours) since its start is
derived as ended, locally and deterministically. Timeouts (`missed`) are local
state and never become replicated records. The full wire contract of the gate is
in [the synchronization contract](pubsub-sync-protocol.md).

### Start call

```http
POST /calls
```

A new call returns `201 Created` with `Location: /calls/{callId}`. A live community channel call returned instead is `200` (see below).

Conversation call request:

```json
{
  "scopeType": "conversation",
  "conversationId": "<conversationId>",
  "nonce": "<random 16-128 chars>",
  "startedAt": 1770000000000,
  "mutation": { "...": "SignedPublicMutation (call_start)" }
}
```

Community channel call request:

```json
{
  "scopeType": "community_channel",
  "communityId": "<communityId>",
  "channelId": "<voiceChannelId>",
  "sessionEpoch": 1,
  "nonce": "<random 16-128 chars>",
  "startedAt": 1770000000000,
  "mutation": { "...": "SignedPublicMutation (call_start)" }
}
```

The body fields become the signed `call_start` record above (`startedAt` is the
record `startedAt`; the node adds `networkId`, `callId`, `id`, `creatorIdentityId`
from the authenticated identity and the signed conversation or community state).
`invitedParticipantIds` no longer exists: conversation calls ring exactly the
participants of the signed conversation.

Group call request. `capabilityHash` is the lowercase hex SHA-256 of the
capability and `networkId` a network the creator belongs to; it becomes the
record's `networkId`:

```json
{
  "scopeType": "group_capability",
  "capabilityHash": "<64 hex>",
  "networkId": "<networkId>",
  "nonce": "<random 16-128 chars>",
  "startedAt": 1770000000000,
  "mutation": { "...": "SignedPublicMutation (call_start)" }
}
```

**Group call capability.** The capability is a base64url string of 20 to 128
characters that group members derive from the MLS exporter of the current group
epoch and share with the call id in the group mailbox. The node never sees it at
start and stores only its hash. Every request that addresses a group call by id
(read, join, leave, heartbeat, signal, end) presents it as
`Authorization: Bearer <capability>`; the node compares its SHA-256 with the
start's `capabilityHash` in constant time. A joined participant may omit it. A
missing, malformed or wrong capability answers 409 `CallNotFoundError`, exactly
as an unknown call.

Implemented:

- one-to-one calls use an existing one-to-one conversation id
- group conversations have no conversation call (409 `InvalidCallScopeError`):
  their members start a `group_capability` call, which never rings, never
  pushes, creates no chat timeline `call_event` item or call history entry, and
  whose events and snapshots carry no roster but the lease set
- community channel calls use an existing community voice channel id
- community channel call start is idempotent by `(communityId, channelId)`: when
  a live call already exists for that voice channel, `POST /calls` returns that
  call with HTTP 200 **and stores no start**. The authenticated caller is not yet
  part of it: the client then signs and posts a join
  (`POST /calls/{callId}/participants`). The node does not join anyone on the
  caller's behalf
- if two nodes start a call in the same community channel concurrently, both
  starts are admitted and every node keeps the one with the lowest start
  `payloadDigest`. The other call reads as `ended` and its snapshot carries
  `supersededByCallId` = the winning call id; its client signs a join for that
  call (`POST /calls/{callId}/participants`). Community calls that end for any
  other reason carry no `supersededByCallId`
- a start never ends or blocks on a call that no admitted record supports
- caller must be a conversation participant or community member
- start emits `calls.v1.call.started` to the current call participants, from
  the locally admitted record
- the creator starts as `joined`; every other conversation participant starts as
  `ringing`
- community channel calls are voice-channel presence state; they do not create
  chat timeline `call_event` items and do not generate missed-call
  notifications
- errors: HTTP 400 when the body is not a valid start; `InvalidPublicMutationError`
  when the proof does not match the record, the derived call id or the signed
  scope; 409 `StalePublicMutationError` for a stale proof; 429 code `429021`
  when the rate cap is exceeded

### Join and leave call

```http
POST /calls/{callId}/participants
PATCH /calls/{callId}/participants/me
DELETE /calls/{callId}/participants/me
```

`POST /calls/{callId}/participants` and `DELETE /calls/{callId}/participants/me`
carry the claimed time and the signed participant record:

```json
{
  "at": 1770000003000,
  "mutation": { "...": "SignedPublicMutation (call_participant)" }
}
```

`PATCH /calls/{callId}/participants/me` is the participant heartbeat: it refreshes
the participant lease, reports `mediaConnections` and carries no signed record. The signed `state`
is `joined` for a join and `left` for a leave; a leave while the participant is
still `ringing` must be signed as `declined`, which is the state the node derives
for that request. The signed `at` is the `at` of the request.

A conversation call ends when one of its two participants leaves (the fold
derives the end from the signed leave). A group call stays active until its
creator ends it or no participant has held a lease for sixty seconds.

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
- live `participants[].connected` is true while an authorized identity has a live lease;
  a joined participant whose lease a just-started node has not heard yet reads
  `connected: false` until the lease warm-up ends
- heartbeat timestamps and remote ICE reports stay out of the live HTTP/WebSocket contract
- remote nodes expire stale lease copies locally, while only the owner node may
  announce its lease as disconnected
- WebSocket clients receive minimal snapshots on membership/connection changes; unchanged heartbeat renewals and media-only reports are not forwarded
- actual local lease transitions also notify clients, including recovery after a locally expired remote lease; owner-supplied change flags are not sufficient
- OrbitDB call projection changes notify clients after projection, so lease-before-document delivery cannot leave a stale roster
- community membership/permission changes refresh live snapshots for remaining authorized recipients; every delivery rechecks scope access
- leaving removes the authenticated identity from the active snapshot
- leaving a one-to-one conversation ends its call; leaving a group or community call does not terminate other participants
- explicit community call termination retires its call ID
- community and group joins and leaves are verified and never stored, so no persisted
  roster exists. Runtime participation expires and cannot be restored from
  storage after a restart. The start record keeps its creator and the end record
  its ender, as signed. Existing immutable history is not erased; see
  [the synchronization contract](pubsub-sync-protocol.md) for retention limits
- deleting yourself while `ringing` declines the call instead of leaving it
- joins emit `calls.v1.participant.joined`
- leaves emit `calls.v1.participant.left`
- declines emit `calls.v1.participant.declined`
- errors: `CallNotFoundError` for an unknown call, 503 code `503020` for a call
  the node holds but has not admitted yet (retry), 409
  `StalePublicMutationError` for a stale proof, 429 code `429021` when the rate
  cap is exceeded
- a heartbeat answers 409 `CallParticipantNotFoundError` for an identity that
  has not joined the call, or 503 code `503020` while that identity's own
  participant record still waits for admission or the call history is not
  replayed yet (retry)

### End call

```http
DELETE /calls/{callId}
```

```json
{
  "at": 1770000010000,
  "mutation": { "...": "SignedPublicMutation (call_end)" }
}
```

Implemented:

- only an active call participant can end the call; a community call is ended by
  its creator only
- the signed `call_end` record is admitted on every node, which then derives the
  call as ended
- ending the call emits `calls.v1.call.ended` to the current participants, from
  the locally admitted record
- errors as for joining and leaving

### Realtime call events

`calls.v1.*` lifecycle events (`call.started`, `participant.joined|left|declined|missed`,
`call.ended`, `call.missed`) gossip between nodes for fast delivery, but a
gossiped event is only a **claim**. A node does not forward it to WebSockets, does not
send a push notification for it and does not derive missed-call or timeline state
from it until its own admitted signed records support it: the node rebuilds the
event from its local call state and publishes that rebuilt event, or drops the
claim. A claim that arrives before its record is held for up to 5 seconds
(replication can lag the gossip) and dropped when the record does not appear.
`calls.v1.signal.sent`, participant leases and `snapshot_changed` are not lifecycle
claims and are unchanged.

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
- a sender that has not joined, or a recipient that cannot receive signals,
  answers 409 `CallParticipantNotFoundError`, or 503 code `503020` while the
  participant record of either still waits for admission or the call history
  is not replayed yet (retry)
- signal request bodies are limited to 64 KiB
- signalling is rate-limited per `(callId, senderIdentityId)` with
  `CALLS_SIGNAL_RATE_LIMIT_PER_MINUTE` defaulting to `120`; exceeding it returns `429` with code `429010`
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

- missed participant state is derived locally from the signed start and never replicated
- missed calls stay available through `GET /past-calls`
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
  "owner": "<identityId>",
  "registration": {
    "mode": "open"
  }
}
```

Implemented:

- return the local node id
- return the owner when the node has already been claimed
- return the registration mode (`open`, `codes` or `closed`), so a client
  knows before creating a key whether it needs a registration link
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

### Open a diagnostics session

```http
PUT /node/diagnostics
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <millisecondsSinceEpoch>
X-Signature: <signature>
```

Request:

```json
{
  "consent": true,
  "minutes": 15
}
```

Response:

```json
{
  "openedAt": 1760000000000,
  "closesAt": 1760000900000,
  "discardsAt": 1760004500000,
  "entries": []
}
```

Implemented:

- require signed request auth from the current node owner; unowned nodes reject
  the request with 403 because nobody can consent
- refuse a replay of an already accepted signed request with 401 (see
  _Authentication_), so a captured request cannot reopen or replace a session
- require `consent: true` and `minutes` between 1 and 60; otherwise 409
- replace any previous session with a fresh, empty one
- record content-retrieval progress lines only while the session is open. Lines
  are redacted before they are stored: CIDs, provider and sender IDs become
  digests keyed with a secret generated at process start
- keep at most 1000 lines in memory only. Lines are never written to the log
  file, IPFS or OrbitDB
- discard the session 60 minutes after it closes (`discardsAt`) or on restart

### Export the diagnostics session

```http
GET /node/diagnostics
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <millisecondsSinceEpoch>
X-Signature: <signature>
```

Returns the same resource as `PUT /node/diagnostics` with the redacted lines
recorded so far. Returns 409 when no session exists or it has been discarded,
and 403 for non-owner requests.

### Discard the diagnostics session

```http
DELETE /node/diagnostics
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <millisecondsSinceEpoch>
X-Signature: <signature>
```

Stops recording and discards every recorded line immediately. Returns 204, or
403 for non-owner requests.

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
  "id": "<optionalNetworkId>",
  "name": "private",
  "key": "<optionalPrivateNetworkKey>"
}
```

A client that wants the node's public network sends `{ "name": "public" }`:
`id` is optional and the node generates one when it is omitted, and a network
without `key` is public.

Implemented:

- allow unsigned network additions while the node has no owner
- require signed request auth from the owner after the node is claimed
- generate the `networkId` when the request carries none
- reject a second public network with `409`
- persist the network in the local embedded database
- synchronize the runtime IPFS network registry after saving

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
  conversations, communities and their channel messages/reactions/requests/moderation logs, calls, polls, missed-call notifications, peer network references and content replication records
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
- after the node operator ran `yarn node:reset-owner <new owner identity id>`
  on the stopped node (see
  [Resetting the Node Owner](INSTALLATION.md#resetting-the-node-owner)), the
  named identity owns the node and a claim by any other identity is refused
- refuse an `identityId` that is not the one canonical encoding of a usable
  Ed25519 key (an alias DER prefix, a re-encoded base64, a small-order or an
  off-curve point) with `409`, code `InvalidNodeOwnerIdentityIdError`, so the
  node is never handed to an id no identity can sign for
- a handover and an owner-only write never interleave: every owner-only write
  (registration mode and codes, relay configuration and networks of a claimed
  node, block sources, exceptions and publication, diagnostics, private
  authorization scopes) checks the signer still owns the node as it lands, so
  a write of the former owner that is still in flight when the handover lands
  is refused with `403`, code `403010`, and changes nothing; on an unclaimed
  node, a relay or network change that is overtaken by the first claim is
  refused the same way; a block list is checked against the owner as it is
  stored, so one overtaken by a handover is refused with `409`

### Put local node registration mode

```http
PUT /node/registration
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <millisecondsSinceEpoch>
X-Signature: <signature>
```

Request:

```json
{
  "mode": "codes"
}
```

Response:

```json
{
  "mode": "codes"
}
```

Implemented:

- require signed request auth from the current node owner; anonymous,
  non-owner requests and requests to an unclaimed node are refused with `403`,
  code `403010`
- `open` (default): anyone who pays the admission proof can create an identity
  through this node
- `codes`: creating an identity through this node needs a registration code
- `closed`: nobody can create an identity through this node, the owner
  included; switch to `codes` to invite someone
- the mode only gates **creation** through this node: a `POST /identities`
  or `PUT /identities/{identityId}` for an identity this node does not hold
  yet, whatever its version. Updates and republishing of an identity this node
  already holds, login and every other route are never gated
- changing the mode is local: it is neither gossiped nor pushed to WebSocket
  clients; `GET /node` reads it
- the proof of work and its pricing apply unchanged in every mode
- persist the mode in local node metadata; it is not replicated

### Issue a registration code

```http
POST /node/registration-codes
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <millisecondsSinceEpoch>
X-Signature: <signature>
```

Request:

```json
{
  "maxUses": 1,
  "expiresAt": 1773848829055
}
```

Response `201`, with `Cache-Control: no-store`:

```json
{
  "id": "<codeId>",
  "code": "<43 base64url characters>",
  "maxUses": 1,
  "expiresAt": 1773848829055
}
```

Implemented:

- require signed request auth from the current node owner (`403010` otherwise)
- `maxUses` is optional and defaults to `1`; it must be between `1` and
  `NODE_REGISTRATION_CODE_MAX_USES` (default `100`)
- `expiresAt` (milliseconds since epoch) is required, must be in the future and
  at most `NODE_REGISTRATION_CODE_MAX_TTL_DAYS` (default `30`) days ahead
- an out-of-range `maxUses` or `expiresAt` is refused with `400`, code `400070`
- the code is 32 random bytes, base64url. It appears only in this response:
  the node stores its SHA-256, `maxUses`, the uses left and `expiresAt` in a
  local collection that is never replicated
- uses are counted on this node only, because the code only gates creation
  through this node

The owner's client builds the registration link; the node needs no UI address:

```text
https://<ui-origin>/register#node=<encodeURIComponent(node endpoint)>&code=<code>
```

The code travels in the fragment, so it never reaches the UI host's logs or a
`Referer` header.

### List registration codes

```http
GET /node/registration-codes
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <millisecondsSinceEpoch>
X-Signature: <signature>
```

Response:

```json
{
  "codes": [
    {
      "id": "<codeId>",
      "maxUses": 5,
      "usesLeft": 3,
      "expiresAt": 1773848829055
    }
  ]
}
```

Implemented:

- require signed request auth from the current node owner (`403010` otherwise)
- never return the code itself
- expired codes are dropped; used-up codes are not listed but kept until they
  expire, so a use given back by a failed creation is not lost

### Revoke a registration code

```http
DELETE /node/registration-codes/{codeId}
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <millisecondsSinceEpoch>
X-Signature: <signature>
```

Response: `204` without body.

Implemented:

- require signed request auth from the current node owner (`403010` otherwise)
- remove the code so it can no longer create identities
- revoking an unknown or already dropped code also returns `204`

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
        "communityState": {
          "peers": [
            {
              "peerId": "<libp2pPeerId>",
              "state": "converged"
            }
          ],
          "state": "converged"
        },
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
- `syncing`: at least one currently known peer has not joined every store, or
  the community state is not yet `converged`
- `converged`: every store has completed its head exchange with all currently
  known replication peers, and every one of them reports the same community
  state as this node

Joining stores only proves participation, not equal content. `communityState`
compares content: every 10 seconds each node announces, per network, a hash of
the frontier of every community it holds, and compares the announcements of its
peers with its own. `communityState.state` is:

- `unknown`: this node has not hashed its own state yet, no peer is known, or a
  peer has not announced in the last 35 seconds (for example a node on an older
  version)
- `diverged`: at least one peer holds different community state
- `converged`: every known peer announced the same community state

`communityState.peers` lists the same state per known peer. The hash, community
ids and community counts are never exposed. Peer ids in announcements are
claimed by the sender, so treat the field as a diagnostic, not as proof.
Changes are pushed to WebSocket clients with the rest of `networkSynchronization`
within one announcement interval.

Implemented:

- publish a local node heartbeat every 5 minutes through the consumer bus
- store heartbeats received from remote nodes as active peers
- return peers seen during the active peer window
- return live IPFS transport peers from the currently connected libp2p networks
- include node id, owner, network id/name, IPFS capabilities, shared-network summary and inferred node type
- expose live IPFS peer ids separately from node ids because transport peers may not have sent a node heartbeat yet
- never expose private network keys in peer heartbeat payloads

### Block identities and nodes

The node owner keeps one signed block list. A blocked identity cannot use this
node: every identity-signed request answers `403` with code `403012`
("Identity is blocked on this node."), new realtime sockets are refused and
open ones are closed. A blocked node peer id cannot connect to this node. The
current owner is never blocked, even if the list names them. Bearer
capability routes (mailboxes, private blob reads and writes) and public reads
are not gated.

Block entries are canonical identity ids compared as strings, so an id that is
not the one canonical encoding of a usable key never reaches the list. A signed
request naming one in `X-Identity-Id` gets `401` code `401020` (see
_Authentication_). `POST /identities`, `POST /identity-devices/{identityId}/transitions` and
`/identity-devices/{identityId}/sealed-secrets`, which check the block list for
a record or path id, answer `400` code `400080` for such an id instead.
`PUT /node/blocks`, `PUT /node/block-exceptions`,
`PUT /node/block-sources/{ownerIdentityId}` and
`POST /node/block-sources/{ownerIdentityId}/approvals` answer `400` code
`400080`, once the owner is authenticated, before anything is stored, for a body or path naming such an id;
`DELETE /node/block-sources/{ownerIdentityId}` and
`GET /node/block-sources/{ownerIdentityId}/pending-entries` answer it for such a path
id once the owner is authenticated, before any source is read or removed.
A fetched block source list that names such an id is refused with the fetch
outcome `non-canonical-identity-id`, and the last valid list is kept. A list
kept before ids had to be canonical keeps its signed `list` verbatim, so it may
still name one, but such an id is never pending, approved or enforced. At start,
before it serves any request, the node drops such ids from its exceptions and
from what its sources apply, and leaves the node unclaimed if its owner was stored
under one. It then logs a warning that the node is unclaimed and must be claimed
again, naming `yarn node:reset-owner` and no id. A stored own block list that
names such an id is kept, signed verbatim: its alias entries are never enforced,
and `GET /node/published-blocks` answers `404` while it names one. To lift the hold, the
owner re-signs a clean list (only canonical ids) at a version above the kept one and
sends it with `PUT /node/blocks`; an equal or lower version is refused with `409`. Publication
stays on, so the clean list is served again at once.

Before starting an upgraded node whose owner may have been claimed under such
an id, stop it and run `yarn node:reset-owner <canonical owner identity id>`
(see [Resetting the Node Owner](INSTALLATION.md#resetting-the-node-owner)).
If that id already owns the node, the command changes nothing and exits with
status `1`. Otherwise it names that owner and clears the owner settings, so
the node never starts unclaimed.

```http
PUT /node/blocks
Content-Type: application/json
X-Identity-Id: <owner identityId>
X-Timestamp: <ms>
X-Body-Hash: <lowercase hex SHA-256 of the exact body bytes>
X-Signature: <signature>
```

`X-Signature` signs the canonical request (see _Authentication_) with
`body` set to the `X-Body-Hash` string, not the JSON document:
`SignedHttpRequestSignature.signingContent({ method: "PUT", path, timestamp, body: <X-Body-Hash> })`.

```json
{
  "type": "pigeon-node-block-list",
  "ownerIdentityId": "<owner identityId>",
  "version": 2,
  "issuedAt": 1773848829055,
  "blockedIdentityIds": ["<identityId>"],
  "blockedNodePeerIds": ["<libp2pPeerId>"],
  "identitySignature": "<signature>"
}
```

`identitySignature` is the owner's signature over
`"pigeon:node-block-list:v1\n"` followed by the RFC 8785 canonical JSON of the
document without `identitySignature`. Both arrays are sorted and hold no
duplicates. Each change is a new document with a higher `version`; the whole
list is replaced. There is no entry cap; the body is limited to
`NODE_BLOCK_LIST_MAX_BYTES`.

The node checks, in order, before reading any body byte: the signature over
`X-Body-Hash`, the timestamp, replay, the block list, that the signer is the
current owner, and that no other upload is running. It then streams the body,
hashing it as it arrives, stops reading as soon as it exceeds
`NODE_BLOCK_LIST_MAX_BYTES` or takes longer than
`NODE_BLOCK_LIST_BODY_TIMEOUT_MS` (default 120000 ms), and parses JSON only
once the bytes hash to `X-Body-Hash`. A failed, slow or aborted body frees the
upload slot at once, so the next upload is not held back, and its response
closes the connection.

Responses: `200` with `{ "blockList": <stored document> }`; `401` with code
`401020` for an invalid, stale or replayed signature, a malformed
`X-Body-Hash`, or a body that does not hash to it (`401021` when a signed
header is missing); `403` with code `403010` when the signer is not the node
owner; `413` with code `413010` when the body is larger than
`NODE_BLOCK_LIST_MAX_BYTES`; `408` with code `408010` when the body is not
received within `NODE_BLOCK_LIST_BODY_TIMEOUT_MS`; `429` with code `429060` while another block list
upload is in progress; `400` when the body is not JSON or not a block list
document; `409` when the document is not signed by the owner of the node as it
is stored (a handover that lands first refuses it), its signature does not verify, or its version is not higher than the stored one.

```http
GET /node/blocks
```

Owner-signed. Returns `{ "blockList": <document> }`, or `{ "blockList": null }`
when the owner never stored one.

### Share block lists

Sharing is opt-in on both sides. A publishing owner serves their signed list;
another owner adopts that list as a source. Sources are pinned to the
publisher's identity. The node refreshes them every
`NODE_BLOCK_SOURCE_FETCH_INTERVAL_MS`. Each download is HTTPS only, goes to
public addresses only, follows no redirects, and stops reading at
`NODE_BLOCK_LIST_MAX_BYTES`. The whole fetch must finish within
`NODE_BLOCK_SOURCE_FETCH_TIMEOUT_MS`. A fetched document is kept only if it is
signed by the pinned identity and has a higher `version` than the one kept.
Anything else, including an unreachable source, keeps the last valid version.

The node blocks:

- the owner's own list,
- plus, from each source, the entries the owner approved that the source
  still lists, or every entry of a list fetched while `autoApply` is on,
- minus the local exceptions,
- and never the owner or this node's own peer id.

Entries a source adds stay pending until the owner approves them. Entries a
source removes stop applying on the next fetch, in both modes. Removing a
source removes its effect at once.

Every route below except `GET /node/published-blocks` is owner-signed:

- a non-owner gets `403` with code `403010`;
- a domain refusal gets `409` with the error class name as `code`.

```http
PUT /node/blocks/publication
```

```json
{ "published": true }
```

Turns publication of the own list on or off. It is off by default. Returns
`{ "published": boolean }`. `GET /node/blocks/publication` returns the same
shape.

```http
GET /node/published-blocks
```

Public. Returns the stored own block list as the exact bytes its owner signed:
the canonical JSON (RFC 8785) of the document without `identitySignature`,
with `Content-Type: application/json`. The signature travels apart, in the
`X-Identity-Signature` response header (exposed to browsers through
`Access-Control-Expose-Headers`). It covers `"pigeon:node-block-list:v1\n"`
followed by the body bytes, so a subscriber verifies the bytes against the
identity it pinned before it parses them.

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
X-Identity-Signature: <base64 signature>

{"blockedIdentityIds":["<identityId>"],"blockedNodePeerIds":[],"issuedAt":1773848829055,"ownerIdentityId":"<identityId>","type":"pigeon-node-block-list","version":3}
```

Returns `404` with code `404040` while publication is off or no list is
stored.

```http
PUT /node/block-sources/{ownerIdentityId}
```

```json
{ "origin": "https://node.example", "autoApply": false }
```

Adopts the list that `ownerIdentityId` publishes at
`{origin}/node/published-blocks`, or changes an adopted source's `origin` or
`autoApply`. Changing the origin keeps the pin and the last valid version.
Turning `autoApply` on approves nothing already pending; it applies the lists
fetched from then on. Pending entries are approved only naming the version
shown to the owner. A source refuses any list whose version is not above the
highest one this node ever accepted from that publisher, even after the source
was removed or the owner settings were reset. `origin` must be a bare
`https` origin; anything else gets `409 InvalidNodeBlockSourceOriginError`.
An `ownerIdentityId` that is not the canonical encoding of a usable key gets
`400` code `400080` once the owner is authenticated, before anything is stored.
The source is fetched on the
next refresh run.

The response is a source:

```json
{
  "ownerIdentityId": "<identityId>",
  "origin": "https://node.example",
  "autoApply": false,
  "version": 3,
  "appliedCount": 10,
  "pendingCount": 2,
  "lastFetchedAt": 1773848829055,
  "lastFetchOutcome": "accepted"
}
```

`version`, `lastFetchedAt` and `lastFetchOutcome` are `null` until the first
fetch. `lastFetchOutcome` is one of:

| Outcome                     | Meaning                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accepted`                  | The fetched document was kept.                                                                                                                                                              |
| `not-newer`                 | Its `version` was not higher than the one kept.                                                                                                                                             |
| `invalid-signature`         | The pinned identity did not sign the served bytes, or `X-Identity-Signature` was missing or malformed. Checked before the bytes are parsed, so a publisher that changed its key lands here. |
| `invalid-document`          | The signed bytes are not a valid block list in canonical form.                                                                                                                              |
| `wrong-signer`              | The pinned identity signed a list that names another owner.                                                                                                                                 |
| `non-canonical-identity-id` | The list blocks an identity id that is not the canonical encoding of a usable key.                                                                                                          |
| `too-large`                 | It was larger than `NODE_BLOCK_LIST_MAX_BYTES`.                                                                                                                                             |
| `redirected`                | The source answered with a redirect.                                                                                                                                                        |
| `refused-address`           | The origin resolved to a non-public address.                                                                                                                                                |
| `unreachable`               | The fetch failed or timed out.                                                                                                                                                              |

Every outcome except `accepted` keeps the last valid version. Remote addresses
are not stored.

```http
GET /node/block-sources
```

Returns `{ "sources": [<source>] }`.

```http
DELETE /node/block-sources/{ownerIdentityId}
```

Stops following the source, and its entries stop applying at once. Returns the
remaining `{ "sources": [...] }`. Returns
`409 NodeBlockSourceNotFoundError` when the source is not adopted. An
`ownerIdentityId` that is not the canonical encoding of a usable key gets `400`
code `400080` after the owner check, and nothing is removed.

```http
GET /node/block-sources/{ownerIdentityId}/pending
```

Returns the entries of the source's latest version that wait for review:

```json
{
  "ownerIdentityId": "<identityId>",
  "version": 3,
  "blockedIdentityIds": ["<identityId>"],
  "blockedNodePeerIds": ["<libp2pPeerId>"]
}
```

Returns `409 NodeBlockSourceNotFoundError` when the source is not adopted. An
`ownerIdentityId` that is not the canonical encoding of a usable key gets `400`
code `400080` after the owner check, before any source is read.

```http
POST /node/block-sources/{ownerIdentityId}/approvals
```

```json
{ "version": 3, "all": true }
```

```json
{
  "version": 3,
  "all": false,
  "blockedIdentityIds": ["<identityId>"],
  "blockedNodePeerIds": []
}
```

Approves every pending entry of `version`, or only the named ones. Send either
`all: true` without named entries, or `all: false` with at least one named
entry. Returns the source. Refusals answer `409` with one of these codes:

| Code                                        | When                                          |
| ------------------------------------------- | --------------------------------------------- |
| `NodeBlockSourceVersionHasChangedError`     | A newer version was fetched since the review. |
| `NodeBlockEntriesAreNotListedBySourceError` | A named entry is not in that version.         |
| `InvalidNodeBlockSourceApprovalError`       | `all` and the named entries disagree.         |
| `NodeBlockSourceNotFoundError`              | The source is not adopted.                    |

An `ownerIdentityId` or a named `blockedIdentityIds` entry that is not the
canonical encoding of a usable key gets `400` code `400080` once the owner is
authenticated, before anything is stored.

```http
PUT /node/block-exceptions
```

```json
{ "identityIds": ["<identityId>"], "nodePeerIds": ["<libp2pPeerId>"] }
```

Replaces the local exceptions. Adopted lists never block these identities and
peer ids; the owner's own list still does. Returns the stored exceptions in
the same shape. `GET /node/block-exceptions` reads them. An `identityIds` entry
that is not the canonical encoding of a usable key gets `400` code `400080`,
and nothing is stored.

## IPFS HTTP API

### Publish public content

```http
POST /ipfs/contents
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
  the CID with `PUT /ipfs/replications/{cid}`
- accept raw request bytes instead of wrapping the content in JSON/base64
- store the binary bytes directly in IPFS
- limit content size to 50 MiB
- return the CID to store in signed identity profiles or posts

### Get public IPFS content

```http
GET /ipfs/contents/{cid}
```

For CIDs uploaded with `POST /ipfs/contents`, the response body is the original
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
document, because identities and keychains are stored as JSON. Reading a CID
may populate Helia's local block cache, but it does not
pin the content or advertise this node as a provider.

Unknown CIDs return `404` with body `{ "error": "CID not found in any network" }`.

### Register content replication

```http
PUT /ipfs/replications/{cid}
```

Requires signed request headers. Call it only after the identity is published
(a node never replicates a CID for an unpublished identity). Body:

```json
{
  "networkId": "<networkId>",
  "context": "ipfs_public_upload",
  "sizeBytes": 2048,
  "mutation": { "...": "PublicMutationProof primitives" }
}
```

`context` must be `ipfs_public_upload`, the context for content from
`POST /ipfs/contents`. Any other context, including `ipfs_private_upload`, is
rejected with `400`: private content is never published to IPFS. The replicated
gate applies the same rule to records written by any peer: a record with any
other context is never listed and never provided by this node, whichever node
wrote it. `sizeBytes` is 1..52428800. Response: `204`.

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
- replication maintenance on each node schedules at most
  `CONTENT_REPLICATION_NETWORK_BUDGET_BYTES` (32 GiB) of registered content per
  network across every owner. This is local policy: it never changes which
  records are valid nor which nodes are responsible. The budget is shared
  max-min fairly by owner: each owner's records are taken smallest first (then
  by CID), always serving next the record that leaves its owner holding the
  fewest bytes, so a large record waits for every smaller owner's whole set and
  many identities flooding a network cannot starve an owner that holds less
  than the fair share. Each owner's registration of a CID is charged to that
  owner's share; the CID is held when any of them is covered, and its fetch is
  capped at the largest covered registration's `sizeBytes`, never at a larger
  uncovered one. Responsible records beyond the budget are deferred: neither
  fetched nor provided by maintenance, and reported by the maintenance log as
  `deferred`
- the budget bounds what is registered at one time, not total disk: the
  selection is recomputed every maintenance run, so new registrations can
  defer a CID held before, and withdrawing then re-registering frees budget
  while bytes already fetched are never removed. `GET /ipfs/contents/{cid}` still
  fetches any CID on demand, deferred ones included, without authentication
  and without a size cap

Byte-exact vectors (ids, digests and signing content) are in
`@haskou/pigeon-swarm-crypto/vectors/content-replication.json`.

### Withdraw content replication

```http
DELETE /ipfs/replications/{cid}
```

Same body with `kind: "delete"` and a tombstone payload `{ cid, id, networkId,
ownerIdentityId, removed: true, scopeType: "content_replication" }`, signed by
the owner. Response: `204`.

When the owner held a live registration on that network, the node also removes
its local copy of the bytes from that network. Copies registered by other
identities are never removed.

### Get content replication status

```http
GET /ipfs/replication-status
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

## Mailbox HTTP API

Node-local queues of opaque ciphertext envelopes. Mailboxes are never written to OrbitDB, IPFS, the DHT or pubsub. No request carries an identity; authorization is a bearer capability only, and the node keeps the SHA-256 of each capability. Design: `docs/design/opaque-mailboxes.md`.

| Step                                                    | Auth                                                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /mailboxes/{mailboxId}`                            | None, rate limited per client address (see `API_TRUST_PROXY`) | Body `{ postTokenHash, readTokenHash, creationNonce }` (hex SHA-256 and a proof of work). `readTokenHash` becomes the mailbox's first reader; further readers join through `POST /mailboxes/{mailboxId}/readers`, never through this route. The SHA-256 over the mailbox id, both hashes and the nonce must start with the current difficulty: 16 zero bits while the node holds at most half of `MAILBOX_MAX_COUNT`, rising in four steps above half capacity to 20 bits at the limit (about 65k hashes at 16, about 1M at 20). A replay of an existing mailbox is checked against the current difficulty too. `201` created, `200` identical replay, `400` invalid body or nonce (a proof short of the current difficulty adds `requiredDifficultyBits`), `409` different hashes, `429` rate or `MAILBOX_MAX_COUNT` limit. |
| `POST /mailboxes/{mailboxId}/envelopes`                 | `Bearer <postToken>`                                          | Body `{ envelopeId, body }`. `body` is base64url and must decode to exactly 1024, 4096, 16384 or 65536 bytes (else `400`). `201` with `{ cursor }`; a repeated `envelopeId` returns `200` with the first cursor and stores nothing. A full mailbox returns `409`; nothing older is ever dropped. Appends are rate limited per mailbox (`429`, `MAILBOX_APPEND_RATE_PER_MINUTE`); a repeated `envelopeId` is not charged.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GET /mailboxes/{mailboxId}/envelopes?after=&limit=`    | `Bearer <readToken>`                                          | Envelopes with cursor greater than `after`, oldest first, at most 100, with `hasMore`. `Cache-Control: no-store`. A read keeps the mailbox live.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POST /mailboxes/{mailboxId}/ack`                       | `Bearer <readToken>`                                          | Body `{ upTo }`. Records this reader's cursor, only forward and capped at the newest envelope. Envelopes up to and including `upTo` are deleted once every reader has acked them. `204`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GET /mailboxes/{mailboxId}/readers`                    | `Bearer <readToken>`                                          | `200` with `{ maxReaders, readers: [{ ackedCursor, readTokenHash }] }`. Lists reader hashes and each reader's acknowledged cursor, never tokens. `Cache-Control: no-store`. `404` for an unknown mailbox or wrong capability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `POST /mailboxes/{mailboxId}/readers`                   | `Bearer <readToken>`                                          | Body `{ readTokenHash }` (hex SHA-256 of the new device's read token). Adds a reader with nothing acknowledged, so it receives the retained backlog. `201` added, `200` already a reader, `409` at `MAILBOX_MAX_READERS`, `404` for a post token or wrong capability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `DELETE /mailboxes/{mailboxId}/readers/{readTokenHash}` | `Bearer <readToken>`                                          | Revokes that reader. `204`. `404` for an unknown reader hash. `409` for the last reader, which cannot be revoked. Envelopes it was holding back are deleted once the remaining readers have acked them. Closes that reader's realtime subscriptions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `DELETE /mailboxes/{mailboxId}`                         | `Bearer <readToken>`                                          | Deletes the mailbox and its envelopes. `204`. Closes every realtime subscription to it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

- `mailboxId` is 32 bytes base64url; capabilities are sent only in `Authorization`, never the URL.
- Creation proof: the `@haskou/pigeon-swarm-crypto` v2 mailbox-creation proof of work (`ProofOfWork.mailboxCreation(mailboxId, postTokenHash, readTokenHash)`): SHA-256 over a length-prefixed preimage (domain `pigeon-mailbox-creation:v2`). `creationNonce` is a canonical decimal string of 1 to 16 digits without leading zeros (`^(0|[1-9][0-9]{0,15})$`). A proof in any other encoding, including the retired v1 `domain:field:...:nonce` form, is refused with `400`. Byte-exact vectors are the library's `vectors/proof-of-work.json`, checked by the `MailboxCreationProofVectors` unit spec.
- A wrong, swapped or missing capability, a malformed id and an unknown mailbox all return the same `404`.
- Limits: `MAILBOX_MAX_ENVELOPES`, `MAILBOX_MAX_BYTES`, `MAILBOX_MAX_COUNT`, `MAILBOX_CREATE_RATE_LIMIT_PER_MINUTE` (in memory, per client address, `0` disables; IPv6 counts per /64, IPv4-mapped addresses as IPv4; the address is the socket address unless `API_TRUST_PROXY` is set; the window resets on restart and `MAILBOX_MAX_COUNT` still bounds creation; exceeding the rate returns `429` with code `429041`), `MAILBOX_APPEND_RATE_PER_MINUTE` (persisted per mailbox, default `120`, `0` disables).
- Readers: `MAILBOX_MAX_READERS` (default `129`, at least `1`) bounds how many read capabilities one mailbox holds: the root reader plus one per device, so the default admits all 128 devices an identity may hold. Each reader keeps its own acknowledged cursor.
- At `MAILBOX_MAX_COUNT`, creation evicts the least recently read mailboxes that are empty and unread for 7 days (`MailboxPolicy.EVICTION_IDLE`), all or nothing; with too few such mailboxes it returns `429`. An evicted mailbox is unknown afterwards (`404`), so the recipient re-creates it with the same id and hashes, paying the current difficulty.
- Retention: `MAILBOX_RETENTION_MS`. A scheduler deletes older envelopes and mailboxes not read for that long.
- Cursors: unique per mailbox id across its lifetimes. The node remembers the highest cursor any removed mailbox (deleted, expired or evicted) reached, and a recreated mailbox starts one above it, so a stored `after` or `upTo` from an earlier life never hides or acks a new envelope. Clients need not reset cursors on recreation; resetting to `0` is still valid. The node keeps one number for this, not one per mailbox. Removals made before this rule are not recorded, so a mailbox recreated from one may still restart at `1`; clients should keep resetting cursors for those.
- Deletion: an envelope is deleted only when every reader has acked past it, or when retention expires it. Retention does not wait for acks, so a silent reader cannot hold envelopes forever.
- Sender cannot add readers: the post token authenticates appends only, and every reader route returns `404` for it. Reader routes accept only a read capability that matches a reader.
- Threat model: readers of one identity are trusted equally. Any reader can read, ack, add or revoke other readers, and delete the mailbox. The reader set limits how many devices hold this power; it does not limit what one device can do. Revoke a lost device.
- Observability: the node sees reader hashes, acked cursors, the reader count, and when readers join, ack and leave. It never sees tokens. `GET /readers` shows `maxReaders` and each reader's `ackedCursor`.
- Silent-device trade-off: a reader that stops acking holds every envelope above its cursor until `MAILBOX_RETENTION_MS` expires them. While it is silent the mailbox can fill to `MAILBOX_MAX_ENVELOPES` or `MAILBOX_MAX_BYTES`, and appends return `409`. Memory stays bounded. Revoking the silent reader frees its backlog at once. The node cannot tell a lost device from a sleeping one, so it never revokes automatically.
- Late reader: a reader added after envelopes were deleted sees only the retained backlog. Deleted envelopes are not recoverable.
- Realtime: `mailbox_subscribe` over the authenticated WebSocket with `mailboxId` and `readToken`; a wrong or missing capability is ignored, like an unknown mailbox. The node pushes `{ "type": "mailbox_envelope", "mailboxId", "cursor" }` to subscribed sockets for each envelope appended on that node. The hint is content-free: clients must GET the mailbox envelopes, which remain the source of truth. There is no subscription ack and no unsubscribe message; closing the socket ends its subscriptions. A socket holds at most 256 subscriptions.
- Revocation ends realtime: revoking a reader closes its hint subscriptions at once, and deleting a mailbox (including by retention) closes all of them. The socket stays open.
- Status: client key schedule, send/receive and cursor recovery are merged in `pigeon-swarm-ui` (#252, #257). Not yet done: mailbox key rotation, direct-message wiring (#258), wrapper integration, and retiring the replicated message collections.

## Private Blob HTTP API

Node-local storage for client-encrypted bytes. Blobs are never added to IPFS, the DHT, pins or any index, and the server stores no filename, content type, key or thumbnail. The client MUST encrypt (and SHOULD pad to a size bucket; the buckets are in `docs/design/private-blob-store.md`) before uploading; padding reduces but does not eliminate size correlation. Unlike IPFS content, a blob is only as available as this node and its retention window. See `docs/design/private-blob-store.md`.

Authorization is split so a streamed body never has to be buffered for signing:

| Step                             | Auth                                    | Notes                                                                                                                                                                         |
| -------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /private-blobs`            | Signed request                          | Body `{ "size": <bytes> }`. Checks size limit and quotas. Returns `201` with `{ blobId, uploadToken, downloadToken, expiresAt }`. Invalid size: `400`. Quota exceeded: `413`. |
| `PUT /private-blobs/{blobId}`    | `Authorization: Bearer <uploadToken>`   | Raw bytes, streamed. Must be exactly the reserved size, else `400` and nothing is kept. Returns `204`. Second upload: `409`.                                                  |
| `GET /private-blobs/{blobId}`    | `Authorization: Bearer <downloadToken>` | Single `Range: bytes=` supported (`206`/`416`). `Cache-Control: no-store`.                                                                                                    |
| `DELETE /private-blobs/{blobId}` | `Authorization: Bearer <uploadToken>`   | Removes bytes and record on this node only. Returns `204`.                                                                                                                    |

- Capabilities are 256-bit random values sent only in the `Authorization` header (never the URL); the node keeps their SHA-256 and compares in constant time.
- A wrong, swapped, missing or expired capability, an unknown id and a not-yet-uploaded blob all return the same `404`.
- Quotas: `PRIVATE_BLOB_MAX_BYTES`, `PRIVATE_BLOB_QUOTA_BYTES_PER_OWNER`, `PRIVATE_BLOB_QUOTA_BYTES_TOTAL` (exceeded: `413`). Quota owners are an HMAC of the identity id with a per-node secret salt.
- Retention: a reservation lives `PRIVATE_BLOB_UPLOAD_WINDOW_MS`; a completed blob lives `max(PRIVATE_BLOB_RETENTION_MS, MAILBOX_RETENTION_MS)`, so it outlives the mailbox envelopes that reference it. The reservation response's `expiresAt` is the upload deadline, not the post-completion expiry. A scheduler removes expired records and bytes every 5 minutes and raises stored blobs recorded under a shorter retention to the current floor.
- The `downloadToken` is a secret: send it only inside an end-to-end encrypted message.
- Disclosure: the signed `POST /private-blobs` carries the signer's identity id (its PEM public key) and `size` in clear, so each node that receives a reservation learns both and the request time. A client that reserves on several nodes discloses the same to each of them (see `docs/design/private-blob-store.md`, "Availability across nodes").
- `PRIVATE_BLOB_STORAGE_PATH` is outside IPFS/OrbitDB; back it up deliberately.

Existing IPFS attachment CIDs are unaffected: this API does not delete anything already distributed.

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

Presence is runtime state kept in the memory of the node serving the
identity's authenticated WebSocket. That node keeps one lease per identity,
renewed by heartbeats. The lease is never gossiped, never carries a node id or
network id, is not written to OrbitDB/IPFS, and resets when the node restarts.
No other node receives it, so a node unrelated to an identity never learns its
status or heartbeat timing.

Who can see presence:

- Over HTTP, a signed viewer reads another identity's presence in full only
  when they share a one-to-one conversation or community with it that this
  node knows about. Sharing a group conversation does not count. At most 500
  of the viewer's one-to-one conversations are checked. Otherwise the
  response carries only `identityId`, `status: disconnected` and `updatedAt`,
  with no `lastActivityAt` or `lastHeartbeatAt`. An identity
  with `invisible` status reads the same way to everyone except itself.
- Over WebSocket, presence events are delivered only to the connections of the
  identity they describe. Related identities do not receive them.
- An identity connected through another node reads as `disconnected` here,
  because this node holds no lease for it. Presence between contacts on
  different nodes is exchanged by the clients, encrypted end to end over their
  private channels.
- `busy` suppresses push notifications only on the node holding the lease.

Statuses:

- `available`: heartbeat active and recent user activity.
- `away`: heartbeat active, but no user activity for 5 minutes.
- `busy`: selected by the user; backend suppresses push notifications for
  messages and calls, and clients should avoid audible notifications.
- `invisible`: heartbeat active, but other identities see `disconnected`.
- `custom`: selected custom connection state.
- `disconnected`: derived by backend after heartbeat timeout.

Presence carries no custom status message. `PUT /presence/me` rejects unknown
body fields, including `customMessage`, with `400`.

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
  "status": "busy"
}
```

Allowed `status` values are `available`, `away`, `busy`, `custom` and
`invisible`. `disconnected` cannot be selected; it is derived by heartbeat
timeout.

### WebSocket presence events

When the identity's presence preference or derived status changes, the serving
node emits to that identity's own connections:

```json
{
  "type": "domain_event",
  "event": {
    "type": "presence.v1.identity_presence.was_updated",
    "aggregate_id": "<identityId>",
    "attributes": {
      "identityId": "<identityId>",
      "status": "away",
      "lastHeartbeatAt": 1770000000000,
      "lastActivityAt": 1770000000000,
      "preferenceUpdatedAt": 1770000000000,
      "selectedStatus": "away",
      "updatedAt": 1770000000000
    }
  }
}
```

## Identity HTTP API

Identity publications contain only public profile data and public authorization
material. They never contain encrypted private keys, protected root-key
envelopes, password KDF parameters, device unlock secrets or recovery secrets.
Identity payloads containing those fields are rejected.

The identity self-signature covers `utf8("pigeon:identity:v1\n")` followed by
the RFC 8785 canonical JSON of the identity signature payload, built by
`IdentitySignature` from `@haskou/pigeon-swarm-crypto`. The preimage and its
signature are pinned byte for byte in
`@haskou/pigeon-swarm-crypto/vectors/identity-signature.json`, checked by the
`IdentitySignatureVectors` unit spec.

Identities, keychains and signed records created before
`@haskou/pigeon-swarm-crypto` 6.0.0 signed without these domain prefixes. They
are rejected and are not migrated: wipe `PIGEON_LOCAL_DB_PATH` on the node and
the browser storage on the client, then create a new identity.

### Get identity

```http
GET /identities/{identityId}
```

`identityId` is a percent-encoded identity id or a lowercase profile handle
without `@`. Identity ids must use `encodeURIComponent(identityId)`.

A handle resolves to its owner only: among identities whose latest version
claims it, the one with the earliest signed `timestamp` (ties broken by the
lowest identity id). Other claimants are never returned for that handle, on any
node. The identity id stays the authoritative reference.

Response:

```json
{
  "id": "<identityId>",
  "admissionNonce": "<nonce>",
  "authorizationRevision": 0,
  "deviceCredential": "-----BEGIN PUBLIC KEY-----\n<base64>\n-----END PUBLIC KEY-----\n",
  "deviceCredentialCommitment": "<64 lowercase hexadecimal characters>",
  "mailboxHome": "https://node.example",
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
  "admissionNonce": "<nonce>",
  "authorizationRevision": 0,
  "deviceCredential": "-----BEGIN PUBLIC KEY-----\n<base64>\n-----END PUBLIC KEY-----\n",
  "deviceCredentialCommitment": "<64 lowercase hexadecimal characters>",
  "mailboxHome": "https://node.example",
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

Response: `200` with the published identity. It is not `201 Created`: publishing
is idempotent, so the same signed body can be sent again and names the same
identity without creating anything new. The admission path (proof of work and
registration control above) is unchanged by this rule.

The signature covers this canonical property order:

```json
{
  "admissionNonce": "<nonce>",
  "authorizationRevision": 0,
  "deviceCredential": "<genesisDeviceCredential>",
  "deviceCredentialCommitment": "<commitment>",
  "id": "<identityId>",
  "mailboxHome": "https://node.example",
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

`admissionNonce` is a proof of work: the `@haskou/pigeon-swarm-crypto` v2
identity-admission proof (`ProofOfWork.identityAdmission(identityId, networkIds)`,
domain `pigeon-identity-admission:v2`, length-prefixed preimage over the identity
id and the sorted network ids). Its SHA-256 must start with 16 zero bits (a
protocol constant, not configurable; about 65 thousand hashes on average). The
nonce is covered by the identity signature, is a canonical decimal string of 1 to
16 digits without leading zeros, and must be mined again whenever the network set
changes. A proof in any other encoding, including the retired v1 form, never
verifies; v1 records are discarded rather than migrated.
Every node verifies it; identities without a valid proof are rejected and never
admitted to the replicated store. The request `admissionNonce` is required in
practice: without it the identity is refused.
Byte-exact vectors are the library's `vectors/proof-of-work.json`, checked by
the `IdentityAdmissionProofVectors` unit spec.

Through `POST /identities` and `PUT /identities/{identityId}`, a node may ask
more than 16 bits for the networks an identity enters (all of them for a new
identity, only the added ones for an update) while they are busy. Up to 60
admissions per network per minute the floor applies; after that the node adds
one bit per doubling, up to 20 bits (60: 17, 120: 18, 240: 19, 480: 20). The
node counts the admissions it accepted plus the fresh ones it saw replicate in
from other nodes, so the price follows the whole network. An identity whose
`timestamp` is more than 10 minutes away from the node's clock is asked the
20-bit maximum for the networks it enters. A shorter proof is refused with
`400` and the bits it needs:

```json
{
  "code": "BadRequestError",
  "errors": [],
  "httpStatus": 400,
  "message": "Identity admission needs an admissionNonce with 17 leading zero bits on this node now: the network is busy or the identity timestamp is outside the freshness horizon.",
  "requiredDifficultyBits": 17
}
```

Mine a new nonce with at least `requiredDifficultyBits` leading zero bits, sign
again and retry; sign with the current time to stay at the lowest price.
Updates that keep their networks are never asked for more. Only accepted
publications, and replicated ones that were fresh and paid what this node asks,
count towards the load. Replicated records are still valid at 16 bits.

Undefined optional properties are omitted before signing. Handles must already
be normalized. Current requests reject `encryptedKeyPair`,
`encryptedPrivateKey`, `encryptedMasterKey` and `masterKeyDerivation`.

`mailboxHome` is an optional base URL (`http` or `https`, with scheme, host, optional port and optional path prefix) of the node that hosts the identity's mailboxes. It must be canonical: no trailing slash, no empty or dot path segments, and no query, fragment or credentials. Mailbox routes are served under it, so an append goes to `<mailboxHome>/mailboxes`. It is covered by the identity signature, so it cannot be
changed without a new signed publication. An update replaces the publication
and omits `mailboxHome` unless it is sent again.

At most `IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE` (default 30, `0` disables)
identity publications are accepted per identity per minute, on `POST /identities`
and `PUT /identities/{identityId}` together; the next one is refused with `429`,
code `429040`.

At most `IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE` (default 0, off)
identity admissions per network per minute are accepted by this node. Every
network an identity enters is charged on `POST /identities` and
`PUT /identities/{identityId}`, including a `PUT` that leaves the networks
unchanged; the next admission is refused with `429`, code `429041`, when any of
those networks is over the cap. The count is local to the node and is not shared
with peers. Enabling it lets a flood through this node block registrations here
for the window, which is why it is off by default.

At most `IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE` (default 30, `0` disables)
identity admissions per client address are accepted by this node per minute, on
`POST /identities` and `PUT /identities/{identityId}` together. The address is the
socket address unless `API_TRUST_PROXY` names a reverse proxy; IPv6 clients share a
/64 and IPv4-mapped addresses count as IPv4. The check runs before authentication
and before the per-identity and per-network counters, so a flood from one address
is refused without spending them; the next admission from that address is refused
with `429`, code `429042`. The count is in memory and local to the node, and it
resets on restart. Clients behind one NAT share the count.

When this node's registration mode is `codes`, creating an identity through it
needs the registration code in a header, on `POST /identities` and on a
`PUT /identities/{identityId}` that creates an identity alike:

```http
POST /identities
X-Registration-Code: <code>
```

Registration control applies only when the body is an identity this node does
not hold yet, whatever its version and whichever of the two routes carries it:
a later version whose genesis lives elsewhere still brings a new identity here.
An identity that already replicated here is a republish or an update and is
never gated, nor is login.
The check runs after the per-address limiter and before the per-identity and
per-network counters, so refused attempts never spend those limits. One use of
the code is reserved before publishing and released if publishing fails before
the identity is saved, so a refused proof never burns a use, a failure after
the save never makes a creation free, and two concurrent requests cannot both
spend the last one. Publications of one identity run one at a time, so
concurrent creations of it spend a single use. Creation is refused with `403`,
code `403011`, when the mode is
`closed` ("Identity creation on this node is closed.") and in `codes` mode
when the code is missing, unknown, expired or used up ("Identity creation on
this node needs a valid registration code." for all four), so a caller learns
nothing about which codes exist.

### Update identity

```http
PUT /identities/{identityId}
```

Updates use the same signed public shape and add
`previousIdentityExternalIdentifier`. They may update public profile data and
add networks, but cannot remove a previously joined network or replace the
pinned genesis credential commitment or recovery authority. The node validates
the complete previous-publication chain before publishing the new CID. The same
`429` / `429040` publication cap applies. A `PUT` for an identity this node
does not hold yet creates it here, so it takes the `X-Registration-Code` header
and is refused with `403` / `403011` exactly like a `POST` (see above).

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
  "signature": "<keychainSignature>",
  "timestamp": 1770000000000
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

`signature` is the owner identity key's base64 Ed25519 signature, built by
`KeychainSignature` from `@haskou/pigeon-swarm-crypto`, over
`utf8("pigeon:keychain:v1\n")` followed by the RFC 8785 canonical JSON of
exactly these keys:

```json
{
  "encryptedPayload": "<encryptedKeychainPayload>",
  "ownerIdentityId": "<identityId>",
  "previousKeychainExternalIdentifier": "<externalIdentifier>",
  "timestamp": 1770000000000,
  "version": 2
}
```

`ownerIdentityId` is the identity id without PEM headers, taken from the signed
request. `previousKeychainExternalIdentifier` is omitted when it is `null`.
Byte-exact vectors (signing payload, signature and rejected replays, including
signatures without the domain and signatures replayed from the identity and
signed-HTTP domains) are in
`@haskou/pigeon-swarm-crypto/vectors/keychain-signature.json`, checked by the
`KeychainSignatureVectors` unit spec.

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
  "previousKeychainExternalIdentifier": null,
  "encryptedPayload": "<encryptedKeychainPayload>",
  "signature": "<keychainSignature>",
  "timestamp": 1770000000000
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
GET /conversations?limit=20&cursor=<cursor>
```

Implemented:

- require signed request auth
- list conversations where the authenticated identity participates
- support `limit` (1..100, default 50) and an opaque `cursor`. Conversations are ordered newest first by creation time, then conversation id. Responds `{ "conversations": [...], "nextCursor": "<cursor or null>" }`; `nextCursor` is `null` on a short page. A malformed cursor, or one from another list, returns `400` with code `400110`

### Create a conversation

```http
POST /conversations
```

A conversation is not a replicated document: its roster is the deterministic fold
of the operations its members signed (see _Signed conversation operations_). Creating
one stores the signed genesis `conversation_created`. The node never signs for a
user and there is no unsigned fallback.

1to1 request:

```json
{
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

The node builds the participant list as the authenticated identity plus
`participantIds`, deduplicated and sorted ascending, and rebuilds the genesis from
it: the signature only verifies if the client signed exactly that list, which must
hold exactly two identities. Any other field (such as the `type`, `name` and `nonce`
older clients sent for groups) is ignored, and a group genesis is refused with `409`
`InvalidConversationOperationError`.

Response:

```json
{
  "id": "one-to-one:<sha256>",
  "networkId": "<networkId>",
  "participantIds": ["<authenticatedIdentityId>", "<participantIdentityId>"],
  "adminIds": [],
  "creatorId": "<authenticatedIdentityId>",
  "type": "one-to-one"
}
```

`ConversationResource` carries `adminIds` (always empty, kept because clients still
read it) and `creatorId` (the author of the genesis). `participantIds` is the folded
roster.

Implemented:

- create the one-to-one conversation for the participant pair; a 1:1 id is the
  same for both participants, so whoever creates it second receives the existing
  conversation unchanged
- require the conversation network id; messages and sync for this conversation
  are published only through that network
- validate that the keychain candidate belongs to the authenticated identity
- validate the genesis before storing anything
- persist the signed `conversation_created` record in the `conversationOperations`
  OrbitDB store; the node announces nothing else, and the local participant index is
  rebuilt from the folded state

Group conversations are not created on the node: their roster lives in MLS on the
clients.

### Signed conversation operations

A conversation is not a replicated document: its participants and creator are the
deterministic fold of the genesis its creator signed, so a peer cannot forge a
participant. The node never signs for a user and has no unsigned fallback.
`POST /conversations` takes an `operation` body field:

```json
{
  "operation": {
    "createdAt": 1773848829055,
    "parents": [],
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
  "action": "conversation_created",
  "args": {
    "participantIds": ["<identityId>", "<identityId>"],
    "type": "one-to-one"
  },
  "parents": [],
  "createdAt": 1773848829055
}
```

**Digest and ids.** `<digest>` is the base64url (no padding, 43 characters) sha256 of
the canonical (RFC 8785, `canonicalize`) JSON of the record **without `id`**. The
record id is `conversation:<conversationId>:op:<digest>`, and the proof's `recordId`
is that id. `payloadDigest` is the same base64url sha256 of the canonical record
**with** `id` (what `PublicMutationProof.digestOf` computes). `parents` is always
`[]`, in the record and in `operation.parents`: the only admitted operation is the
genesis.

**Proof and signing bytes.** `mutation` is the proof body plus its signature:

```json
{
  "version": 2,
  "store": "conversationOperations",
  "kind": "put",
  "operationId": "<random base64url>",
  "recordId": "conversation:<conversationId>:op:<digest>",
  "payloadDigest": "<base64url sha256 of canonical record with id>",
  "predecessor": null,
  "sequence": 0,
  "author": {
    "identityId": "<identityId>",
    "deviceCredential": "<credential>",
    "authorizationRevision": 0
  },
  "signature": "<Ed25519 signature by the device key, as the crypto library emits it>"
}
```

The device signs the UTF-8 bytes `"pigeon:public-mutation:v2\n" +
canonicalize(body-without-signature)`, the same signing content as every other
public mutation and as the community operations. Identity ids are the base64
public key without PEM headers.

**Conversation id.** `one-to-one:` + hex sha256 of `<first>:<second>:<networkId>`,
where `first` and `second` are the two identity ids sorted ascending (plain string
order); an empty id or one with `:` is refused. It is the same for both
participants. The genesis must carry exactly the id derived from its own args.
`@haskou/pigeon-swarm-crypto` owns the derivation
(`CommitmentId.oneToOneConversation`) and `vectors/commitment-ids.json`; the
`ConversationIdVectors` unit spec runs them against the node.

Group conversations live in MLS on the clients (D15): the node creates and folds no
group conversation. The records older nodes accepted for groups are refused by the
replication gate and by the decoder, so they never change a conversation: a
`conversation_created` record with `type: "group"` (with a `group:` id derived from
creator, network and nonce) and every `member_added`, `member_removed`,
`member_left`, `admin_promoted` and `admin_demoted` record.

**Genesis.** The client signs the genesis with empty `parents`; a genesis with
parents is refused. The node rebuilds the operation from the authenticated
actor, the `args` it derives from the body, and `createdAt` and `parents`; the
signature only verifies if the client signed exactly that.

| Route                 | action                 | `args`                                 |
| --------------------- | ---------------------- | -------------------------------------- |
| `POST /conversations` | `conversation_created` | `{type: "one-to-one", participantIds}` |

`args` accepts exactly the listed keys (an extra or missing key is refused).
`participantIds` is strictly ascending, unique, includes the author and has
exactly 2 entries. A 1:1 is immutable: it accepts its genesis and refuses every
other operation. Calls authorize against the participants of the signed genesis.

**Limits.** `args` is at most 4096 bytes of JSON and nests at most 63 levels
below itself (the depth rule of `payloadDigest`, with `args` at depth 0; `args`
is one level below the digested operation, which can hold depth 64). A genesis
beyond either limit answers `409` with code
`ConversationOperationLimitExceededError` (`Conversation operation limit
exceeded`) and stores nothing. A replicated record beyond them is refused.

**Errors.** A body whose signed `operation` (or, on community routes, `operation` /
`moderationLog`) is missing, not an object or lacks `createdAt`, `parents` or `mutation`
is rejected before any signature check with `400` (validation error); it never
reaches the use case. A malformed record, wrong args, a wrong id or a mismatching
signature author answers `409` with code `InvalidConversationOperationError`
(`Invalid conversation operation`).

**Worked example** (uses `X-Identity-Id`, `X-Timestamp` and `X-Signature` like
every route; `operation` is built as above):

```text
POST /conversations                                  action conversation_created
  parents []                                         args {"participantIds":["<A>","<B>"],"type":"one-to-one"}
```

For the first line `<A>` signs the record

```json
{
  "action": "conversation_created",
  "args": {
    "participantIds": ["<A>", "<B>"],
    "type": "one-to-one"
  },
  "authorIdentityId": "<A>",
  "conversationId": "one-to-one:<sha256>",
  "createdAt": 1773848829055,
  "networkId": "<N>",
  "parents": [],
  "scopeType": "conversation_operation"
}
```

(keys shown in canonical order), computes `digest` of that JSON, adds
`"id":"conversation:one-to-one:<sha256>:op:<digest>"`, builds the proof over the
record with `id`, and sends `participantIds: ["<B>"]` (or both), `networkId`,
`keychainExternalIdentifier` and `operation`. A reference signer lives in
`tests/support/signConversationOperation.ts`.

Fixed, byte-exact test vectors (keys, ids, digests, signing content, signatures)
live in
`@haskou/pigeon-swarm-crypto/vectors/conversation-operation.json`;
a unit spec recomputes every value with the real domain code, so a client signer can
assert it reproduces them. Only the 1:1 genesis cases are admitted. The group
genesis and the member and admin cases are the records older nodes accepted;
nodes now refuse them, and the spec asserts that the decoder refuses them and that
they fold to no conversation.

The member and admin routes (`POST /conversations/{id}/members`,
`DELETE .../members/me`, `DELETE .../members/{identityId}`,
`PUT`/`DELETE .../admins/{identityId}`) and `GET /conversations/{id}/frontier`
are gone and answer `404`: a 1:1 has no operation after its genesis, and group
rosters live in MLS on the clients (D15).

### Conversation drafts

```http
GET /conversation-drafts
PUT /conversation-drafts/{draftKey}
DELETE /conversation-drafts/{draftKey}
```

`GET /conversation-drafts` takes `limit` (1..100, default 50) and `cursor` (the `nextCursor` of the previous page). Drafts are ordered by `updatedAt` newest first, then draft key. Pass `nextCursor` as `cursor` to read the next page; it is `null` on the last page. A malformed cursor, or one from another list, returns `400` with code `400110`.

`draftKey` is opaque: the client derives it as
`base64url(HMAC-SHA256(K_draft, utf8(conversationId)))`, where `K_draft` is a
key only the owner's devices hold. It is 43 base64url characters; anything
else answers `409 InvalidConversationDraftKeyError`.

Save request:

```json
{
  "encryptedPayload": "<encryptedDraftPayload>",
  "updatedAt": 1773848829055
}
```

`updatedAt` is the client time in milliseconds. It may be `null` or omitted;
the node then uses its current time.

List response:

```json
{
  "drafts": [
    {
      "draftKey": "<base64url HMAC-SHA256>",
      "encryptedPayload": "<encryptedDraftPayload>",
      "updatedAt": 1773848829055
    }
  ]
}
```

Implemented:

- require signed request auth
- drafts are local embedded DB state scoped to the authenticated identity:
  listing, saving and deleting only ever touch the caller's own drafts
- the node never learns which conversation a draft belongs to and checks no
  conversation roster; the client seals the conversation id inside
  `encryptedPayload` and drops a draft whose key does not match it
- the backend treats `encryptedPayload` as opaque client-encrypted data of at
  most 65 536 characters; a longer one answers `400`
- `updatedAt` defaults to the node's time when omitted
- each identity keeps its 100 most recently updated drafts; saving under a new
  key drops the oldest others, never the draft just saved; updating an existing
  key evicts nothing
- at startup the node deletes drafts stored before opaque keys, which named
  their conversation and no route can reach

### Conversation messages

The node stores no conversation messages. Messages, edits, deletions, reactions,
pins and history of one-to-one and group conversations travel only through
opaque mailboxes (see _Mailbox HTTP API_, `docs/design/opaque-mailboxes.md` and
`docs/design/group-mailboxes.md`). There are no `/conversations/{conversationId}/messages`
or `/conversations/{conversationId}/pins` routes.

- Read state is device-local: the node keeps no read markers and no unread
  counts, because it cannot read sealed content. Clients compute unread state.
- The node sends no Web Push for mailbox messages and cannot clear a push that
  another device already showed.
- Every node refuses replicated `messages`, `pins` and `reactions` records scoped
  to a conversation; those stores carry community channel records only.

Signed HTTP request validation:

- reject stale `X-Timestamp` values outside the 30 second freshness window

## Community HTTP API

Communities have a `visibility` of `private` or `public`. A community belongs to one network,
has one owner, and contains member ids, text channel metadata and encrypted
text channel messages. Community channels are not backed by `Conversation`;
they live inside the `communities` context.

Implemented mutating endpoints use signed HTTP requests with `X-Identity-Id`,
`X-Timestamp` and `X-Signature`. Every route that changes a community also
carries a client-signed `operation` (see _Signed community operations_), and
moderation routes additionally carry a client-signed `moderationLog` (see
_Signed moderation log entries_).

### Signed community operations

A community is not a replicated document: its state is the deterministic fold of
the operations its members signed, so a peer cannot forge a role, ban, membership,
setting or deletion. The node never signs for a user and has no unsigned
fallback. A route that changes a community takes an `operation` body field:

```json
{
  "operation": {
    "createdAt": 1773848829055,
    "identitySignature": "<base64 ed25519 signature by the author identity key>",
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
  "createdAt": 1773848829055,
  "identitySignature": "<base64 ed25519 signature>"
}
```

`<digest>` is the base64url sha256 of the canonical payload without `id` and
without `identitySignature`, and the record id and `payloadDigest` (which covers
the whole record, `id` and `identitySignature` included) bind it. Identity ids in
`authorIdentityId` and `args.identityId` are the base64 public key without PEM
headers.

`identitySignature` is the standard base64 ed25519 signature (88 characters) by the
author's identity key — the key whose PEM-less base64 public key is
`authorIdentityId`, the same root MLS leaf credentials use — over the UTF-8 bytes
of `"pigeon:community-operation:v1\n" + id`. The device `mutation` alone only
proves the authority of the author's devices to the node; the identity signature
lets any member verify who authored each operation from the operation itself
(see _Get community operations_). The node verifies it on admission and on every
replicated record and has no unsigned fallback: a route refuses an operation whose
`identitySignature` is missing (`400`), malformed
(`InvalidCommunityOperationError`) or not the author's signature of that `id`
(`InvalidPublicMutationError`), and a replicated record without a valid one is
dropped.

The client reads
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

Limits: `args` is at most 4096 bytes of JSON and nests at most 63 levels below
itself (the depth rule of `payloadDigest`, with `args` at depth 0; `args` is one
level below the digested operation, which can hold depth 64), and an identity
signs at most 1000 operations per community. All three are decided from the
signed operation and its causal past, so every node agrees. A route that would
exceed any of them answers `409` with code `CommunityOperationLimitExceededError`
(`Community operation limit exceeded`) and stores nothing. A replicated record
beyond the argument limits is refused. An operation another author signed
concurrently beyond that quota is skipped by the fold on every node without any
error.

| Route                                                                                                   | action                        | `args`                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /communities`                                                                                     | `community_created`           | `{nonce, name, description, visibility, discoverable, autoJoinEnabled, avatar?, banner?}` |
| `PATCH /communities/{id}`                                                                               | `community_updated`           | `{name, description, avatar?, banner?, discoverable?, autoJoinEnabled?}`                  |
| `POST .../channels`                                                          | `channel_created`             | `{channelId, name, type}`                                                                 |
| `PATCH .../channels/{channelId}`                                                                        | `channel_renamed`             | `{channelId, name}`                                                                       |
| `DELETE .../channels/{channelId}`                                                                       | `channel_deleted`             | `{channelId}`                                                                             |
| `PATCH .../channels/{channelId}/permissions`                                                            | `channel_permissions_updated` | `{channelId, visibleRoleIds}`                                                             |
| `POST .../roles`                                                                                        | `role_created`                | `{roleId, name, permissions}`                                                             |
| `PATCH .../roles/{roleId}`                                                                              | `role_updated`                | `{roleId, name, permissions}`                                                             |
| `DELETE .../roles/{roleId}`                                                                             | `role_deleted`                | `{roleId}`                                                                                |
| `PUT .../members/{identityId}/roles`                                                                    | `member_roles_updated`        | `{identityId, roleIds}`                                                                   |
| `POST .../bans`                                                                                         | `member_banned`               | `{identityId}`                                                                            |
| `DELETE .../bans/{identityId}`                                                                          | `member_unbanned`             | `{identityId}`                                                                            |
| `DELETE .../members/{identityId}`                                                                  | `member_kicked`               | `{identityId}`                                                                            |
| `DELETE .../members/me`                                                                                 | `member_left`                 | `{identityId}`                                                                            |
| `POST /community-membership-requests` (auto-join), `PATCH /community-membership-requests/{id}` (accept) | `member_joined`               | `{identityId, method, reference?}`                                                        |
| `POST .../invitations/{invitationId}/admissions`                                                        | `member_joined`               | `{consent, identityId, invitationId, method: "invitation", possession}`                   |
| `POST .../invitations`                                                                                  | `invitation_created`          | `{expiresAt, invitationKey, maxUses, invitee?}`                                           |
| `POST .../invitations/{invitationId}/revocation`                                                        | `invitation_revoked`          | `{invitationId}`                                                                          |

`member_joined` carries `method` `added`, `approval`, `invitation` or `automatic`.
`approval` carries `reference`, the id of the accepted
`community_membership_request`; the other methods carry none. `invitation` takes
`{identityId, invitationId, possession, consent}` instead (see [Community
invitations](#community-invitations)). `approval` needs `approve_members`, `added`
needs `manage_members`, `automatic` needs `autoJoinEnabled`, `invitation` needs
`manage_members` of its author (the admitter, not the joiner), and the remaining
methods are signed by the joining identity. A node that has not replicated the
referenced records yet admits the operation later.

Every identity id in an operation, its author and each argument, must be
canonical (`IdentityId.isCanonicalKey()`); an operation that names another
encoding of a key is refused.

Channel and role ids are not chosen: `channelId` and `roleId` are the first 24 hex
characters of `sha256(JSON.stringify(["channel" | "role", communityId,
authorIdentityId, operation.createdAt]))`.

Fixed, reproducible vectors for the genesis and `member_joined` operations live in
`@haskou/pigeon-swarm-crypto/vectors/community-operation.json`.
Per case they give the inputs (`networkId`, community nonce, owner, `createdAt`,
`parents`, `args`, a deterministic ed25519 test key) and every derived value:
`communityId`, the canonical payload and its `digest`, the `recordId`,
`payloadDigest`, the identity signing content and `identitySignature`, the signing
content, the signature and the request `operation`.
A unit spec recomputes all of them with the domain code and with plain
`canonicalize` and `sha256`, so a client can use the file as its conformance test.
A client that is not a member yet reads the `networkId` it needs for its
invitation proofs from `GET /communities/{communityId}/invitation-preview`.

### List communities

```http
GET /communities
```

Query: `limit` (1..100, default 50) and `cursor` (the `nextCursor` of the previous page). Communities are ordered by id ascending. Pass `nextCursor` as `cursor` to read the next page; `nextCursor` is null on the last page. A malformed cursor, or one from another list, returns 400 (code 400110).

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
  ],
  "nextCursor": null
}
```

Implemented:

- require signed request auth
- list only communities where the authenticated identity is a member
- return private community metadata, member ids and text channel metadata

### Discover communities

```http
GET /discoverable-communities?query=Pigeon&networkId=<networkId>
```

The request is signed as `GET /discoverable-communities`; query string values are
not part of the signed canonical path because Express verifies `request.path`.

Query: `limit` (1..100, default 50) and `cursor` (the `nextCursor` of the previous page). Communities are ordered by id ascending. Pass `nextCursor` as `cursor` to read the next page; `nextCursor` is null on the last page. A malformed cursor, or one from another list, returns 400 (code 400110).

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
  ],
  "nextCursor": null
}
```

Implemented:

- require signed request auth
- search private community metadata by `name` or `description`
- optionally scope results with `networkId`
- only return communities configured with `discoverable: true`
- do not return channel metadata or encrypted content
- include the authenticated identity membership state:
  `none`, `member` or `requested`

### Create community

```http
POST /communities
```

Returns `201 Created` with `Location: /communities/{communityId}`.

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
  "operation": {
    "createdAt": 1773848829055,
    "identitySignature": "<identity signature>",
    "parents": [],
    "mutation": { "...": "SignedPublicMutation" }
  }
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
  from `GET /discoverable-communities`
- default `autoJoinEnabled` to `false`; set it to `true` to let any non-banned
  identity join through `POST /community-membership-requests`
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
- refuse a `communityId` that is not a canonical id (43-character base64url) with `404`, before any lookup
- only allow community members to read the community

### Get community frontier

```http
GET /communities/{communityId}/frontier
```

Implemented:

- require signed request auth
- allow any authenticated identity, members or not, because a non-member signs the
  `member_joined` operation of a join
- fail with `CommunityNotFoundError` when the community is unknown to the node
- return `{ "frontier": ["<digest>"], "networkId": "<id>" }`: the sorted operation
  digests no other operation names as parent (the `parents` for the next signed
  operation) and the network the operation payload names. A non-member cannot
  read `networkId` from `GET /communities/{communityId}`. The digests are the ids
  of immutable records already replicated to every peer of the network, so they
  disclose nothing else.

### Get community operations

```http
GET /communities/{communityId}/operations?cursor=<cursor>&limit=<n>
```

Implemented:

- require signed request auth
- allow only members, like `GET /communities/{communityId}`
  (`CommunityMemberNotFoundError` otherwise)
- fail with `CommunityNotFoundError` when the community is unknown to the node
- `limit` is an integer from 1 to 100 (default 50); `cursor` is an opaque cursor
  returned as `nextCursor` (see Pagination). A `limit` outside that range answers
  `400` with code `400060` (`Invalid community operations query.`). A malformed
  cursor, or one issued for another list, answers `400` with code `400110`
- return every stored operation of the community that passed verification,
  including the ones the fold skipped, verbatim and sorted by digest ascending
  (code-unit order), the next `limit` after the cursor position:

```json
{
  "communityId": "<communityId>",
  "networkId": "<networkId>",
  "operations": [
    {
      "action": "community_created",
      "args": { "...": "..." },
      "authorIdentityId": "<identityId>",
      "communityId": "<communityId>",
      "createdAt": 1773848829055,
      "id": "community:<communityId>:op:<digest>",
      "identitySignature": "<identity signature>",
      "networkId": "<networkId>",
      "parents": [],
      "scopeType": "community_operation"
    }
  ]
}
```

A client reads the next page by passing `nextCursor` back unchanged as `cursor`
while a page is full. The cursor is opaque and only carries the position of the
last operation; authorization is re-checked on every request. Each operation
carries its author's `identitySignature` (see _Signed community operations_), so
a member replays the roles and memberships back to the creator and verifies
every author itself instead of trusting the node: it is what authorizes
community MLS commits and welcomes.

Every member reads every operation, so what an operation signs is public to the
community: `member_banned` and `member_kicked` name the moderator as
`authorIdentityId`. That is inherent to verifiable history (the author is part of
the digest the children pin, and the operations replicate to every node of the
network); hiding it needs a protocol change such as a community moderation key.

A page is selected by record id (`community:<communityId>:op:<digest>`) and only
the operations it returns are decoded and hashed; selecting it still compares
and sorts the ids of every stored operation of the community.

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
  "operation": {
    "createdAt": 1773848829055,
    "identitySignature": "<identity signature>",
    "parents": ["<frontier>"],
    "mutation": { "...": "SignedPublicMutation" }
  }
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

Query: `limit` (1..100, default 50) and `cursor` (the `nextCursor` of the
previous page). Members are ordered by identity id ascending. Pass
`nextCursor` as `cursor` to read the next page; `nextCursor` is null on the
last page. A malformed cursor, or one from another list, returns 400 (code
400110).

Response:

```json
{
  "memberIds": ["<identityId>"],
  "nextCursor": null
}
```

Implemented:

- require signed request auth
- only allow community members to list members

### Request community membership

```http
POST /community-membership-requests
```

Request body: `{ "communityId", "createdAt", "mutation", "acceptedAt"?, "acceptedMutation"?, "operation"? }`.
`communityId` names the community to join.
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
GET /community-membership-requests
```

Query: `limit` (1..100, default 50) and `cursor` (the `nextCursor` of the previous page). Requests are ordered by `updatedAt` descending, then request id descending. Pass `nextCursor` as `cursor` to read the next page; `nextCursor` is null on the last page. A malformed cursor, or one from another list, returns 400 (code 400110).

Response: `{ "requests": [...], "nextCursor": "<cursor or null>" }`.

Implemented:

- require signed request auth
- return requests created by the authenticated identity
- return requests for communities owned by the authenticated
  identity

### Accept or decline community membership request

```http
PATCH /community-membership-requests/{requestId}
```

Request:

```json
{
  "status": "accepted",
  "updatedAt": 1780000000000,
  "mutation": { "...": "SignedPublicMutation" },
  "moderationLog": {
    "createdAt": 1780000000000,
    "mutation": { "...": "SignedPublicMutation" }
  },
  "operation": {
    "createdAt": 1780000000000,
    "identitySignature": "<identity signature>",
    "parents": ["<frontier>"],
    "mutation": { "...": "SignedPublicMutation" }
  }
}
```

`operation` is required when `status` is `accepted` and signs `member_joined`
with `args` `{identityId: <request.identityId>, method, reference: <requestId>}`:
`method` is `approval` (signed by a member with `approve_members`). It is not
sent when `status` is `declined`.

Implemented:

- accepted statuses add the request `identityId` to `memberIds`
- community owners or members with `approve_members`/`reject_members` can
  accept or decline `request` join requests
- requesters can decline their own pending join request

### Community invitations

An invitation is a signed community operation, not a bearer token. The issuer's
client generates a 32-byte secret, derives an Ed25519 invitation key from it
(`CommunityInvitationKey` from `@haskou/pigeon-swarm-crypto`) and signs an
`invitation_created` operation that carries only the public key. The link is
`https://<ui-origin>/invite/community#c=<communityId>&k=<secret>`; both values
sit in the URL fragment, so browsers never send them, and the secret never
reaches the node, a record, a response or a log. The invitation id is the
digest of the `invitation_created` operation.

A joiner signs two proofs over
`canonicalize({communityId, identityId, invitationId, networkId})`:
`possession` with the invitation key (domain
`pigeon:community-invitation-possession:v1\n`) and `consent` with its own
identity key (domain `pigeon:community-invitation-consent:v1\n`). It stores
them in a claim, which carries no authority. A member holding `manage_members`
admits the claim with a `member_joined` operation (method `invitation`) that
embeds both proofs, so the join is judged against the community folded from
its own causal past and no admission depends on a `requests` record. See
`docs/design/signed-community-invitations.md`.

#### Create an invitation

```http
POST /communities/{communityId}/invitations
```

Request body: `{ "expiresAt", "invitationKey", "invitee"?, "maxUses", "moderationLog", "operation" }`.
`operation` signs `invitation_created` with `args` `{expiresAt, invitationKey,
maxUses, invitee?}`. `moderationLog` signs an `invitation_created` entry whose
target is `{ "type": "invitation", "id": <invitation id> }` and whose details are
`{expiresAt, maxUses}`.

Response:

```json
{
  "createdAt": 1773848829055,
  "expiresAt": 1774453629055,
  "id": "<invitationId>",
  "invitationKey": "<base64url public key>",
  "invitee": "<identityId>",
  "issuerIdentityId": "<identityId>",
  "live": true,
  "maxUses": 1,
  "revoked": false,
  "uses": 0
}
```

Implemented:

- require signed request auth from a member with `create_invites`
- `invitationKey` is a canonical Ed25519 public key that is not of small order
  and differs from the key of every invitation in the operation's causal past
- `maxUses` is 1 to 100, and exactly 1 when `invitee` names a canonical identity
  id that alone may join. It is exact for admissions that build on each other.
  Admissions on `k` mutually concurrent branches (a partition, or admitting
  devices that have not synced) each see only their own past, so together they
  can admit up to `k * maxUses` identities. This overshoot is an accepted
  residual and is never repaired: nobody is evicted.
- `expiresAt` is after the operation's `createdAt` and at most 30 days
  (2 592 000 000 ms) later

#### List invitations

```http
GET /communities/{communityId}/invitations
```

Response: `{ "invitations": [ <invitation as above> ] }`. `uses`, `revoked` and
`live` come from the folded operations. Requires signed request auth from a
member.

#### Preview an invitation

```http
GET /communities/{communityId}/invitation-preview
Authorization: Bearer <invitationKey>
```

Unsigned, so a link holder previews before it has an identity. The client sends
the public key derived from the link secret (base64url, 20 to 128 characters)
in the `Authorization` header, never in the URL, and the node never logs that
header. A missing or malformed key, an unknown key and an invitation that is
revoked, expired, used up or no longer live all answer `404` with
`Community not found.`, exactly like an unknown community.

Response:

```json
{
  "communityAvatar": "<ref>",
  "communityBanner": "<ref>",
  "communityId": "<communityId>",
  "communityName": "Pigeon",
  "expiresAt": 1774453629055,
  "invitationId": "<invitationId>",
  "networkId": "<networkId>"
}
```

The response holds no issuer, invitee, use count, member, peer id or address.
The joiner needs `networkId` and `invitationId` to sign its proofs.

#### Claim an invitation

```http
POST /communities/{communityId}/invitations/{invitationId}/claims
```

Request body: `{ "consent", "possession", "mutation" }`. `mutation` is the joiner's
public-mutation proof (store `requests`, `kind: "put"`) with a signed community
`frontier`. It signs the record `{communityId, consent, id, identityId,
invitationId, possession, scopeType: "community_invitation_claim"}` with record
id `invitation-claim:<invitationId>:<identityId>`; the author is the joiner.

Response: the stored claim `{communityId, consent, id, identityId, invitationId, possession}`.

Implemented:

- require signed request auth from the joiner
- store the claim only when `identityId` is canonical (and is the `invitee` when
  the invitation names one), the invitation is in the community folded at the
  claim's frontier and live there, both proofs verify, and the joiner is neither
  banned nor a member
- a claim is written once: a second claim of the same invitation by the same
  identity answers `409` with code `CommunityInvitationAlreadyClaimedError`
- an unknown or unusable invitation answers `409` with
  `CommunityInvitationNotFoundError` or `CommunityInvitationUnusableError`

#### List pending invitation claims

```http
GET /communities/{communityId}/invitation-claims
```

Response: `{ "claims": [ <claim as above> ] }`. Requires signed request auth from a
member with `manage_members`, because a claim names who asks to join. Only
pending claims are returned: the invitation is live and unexpired, and its
joiner is neither a member nor banned nor already admitted under it.

#### Admit a claim

```http
POST /communities/{communityId}/invitations/{invitationId}/admissions
```

Request body: `{ "consent", "identityId", "possession", "operation" }`, the proofs
copied from the claim. `operation` signs `member_joined` with `args`
`{consent, identityId, invitationId, method: "invitation", possession}`. Response: the
community, as for [Get community](#get-community).

Implemented:

- require signed request auth from a member with `manage_members`; that member is
  the operation author and the joiner signs nothing
- the join counts toward the admitter's operation quota, like every operation
  of its author; the founder is exempt. The joiner's quota is untouched, so
  no admitter can spend it, and admitting one joiner on many concurrent
  branches spends only the admitter's own quota
- the ledger refuses the admission unless the invitation is live in its causal
  past, `possession` and `consent` verify, the joiner is canonical, not banned,
  not a member and has not used the invitation, `createdAt` lies between the
  invitation's `createdAt` and `expiresAt`, and the joiner is the `invitee` when
  one is named
- usage limits, revocation and expiry never evict an admitted member; admissions
  made concurrently can exceed `maxUses` by at most one `maxUses` per concurrent
  branch

#### Revoke an invitation

```http
POST /communities/{communityId}/invitations/{invitationId}/revocation
```

Request body: `{ "moderationLog", "operation" }`. `operation` signs
`invitation_revoked` with `args` `{invitationId}`; `moderationLog` signs an
`invitation_revoked` entry whose target is the invitation. Response: the
invitation, as for create.

Implemented:

- require signed request auth from the invitation's issuer or a member with
  `manage_members`; other `create_invites` holders cannot revoke it
- revocation is permanent and a second revocation is refused
- every admission with the revocation in its causal past is refused; admissions
  made before or concurrently with it stand

### Leave community

```http
DELETE /communities/{communityId}/members/me
```

Body: `{ "operation": { "createdAt", "identitySignature", "parents", "mutation" } }`,
signing `member_left` with `args` `{identityId: <actor>}`.

Implemented:

- require signed request auth from the member that is leaving
- remove the authenticated identity from `memberIds`
- publish `communities.v1.member.was_left` with the updated community
- allow the owner to leave only when they are the last community member
- reject the owner while other members remain

### Kick community member

```http
DELETE /communities/{communityId}/members/{identityId}
```

Body: `{ "moderationLog": { "createdAt", "mutation" }, "operation": {
"createdAt", "identitySignature", "parents", "mutation" } }`, the operation
signing `member_kicked` with `args` `{identityId: <target>}` (see "Signed
moderation log entries").

Implemented:

- require signed request auth from the community owner or a member with
  `manage_members`
- `identityId` must be URL-encoded
- record a signed `member_kicked` moderation log entry (target: member,
  `identityId`; details `{}`) before the operation is stored
- remove the target identity from `memberIds`
- publish `communities.v1.member.was_left` with the updated community and
  `actorIdentityId`
- reject attempts to kick the community owner
- does not add the target to `bannedMemberIds`

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
  "moderationLog": {
    "createdAt": 1773848829055,
    "mutation": { "...": "SignedPublicMutation" }
  },
  "operation": {
    "createdAt": 1773848829055,
    "identitySignature": "<identity signature>",
    "parents": ["<frontier>"],
    "mutation": { "...": "SignedPublicMutation" }
  }
}
```

Implemented:

- require signed request auth from the owner or a member with `ban_members`
- remove the banned identity from `memberIds` if they were a member
- store banned identities in `bannedMemberIds`
- prevent banned identities from requesting to join
- publish `communities.v1.community.was_updated`
- when the banned identity was a member, also publish
  `communities.v1.member.was_left` with the updated community, the banned
  `identityId` and the `actorIdentityId`, so the banned member's own sessions
  (which are no longer in `memberIds`) drop the community in real time

### List community moderation log

```http
GET /communities/{communityId}/moderation-logs?limit=50&cursor=<cursor>
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
  "nextCursor": "<cursor>"
}
```

Implemented:

- require signed request auth from the owner or a member with `manage_members`
- store log entries in OrbitDB replicated state; they are not written to IPFS
- `limit` is clamped to 1..100 (default 50); `cursor` is an opaque cursor
  returned as `nextCursor` (see Pagination). A malformed cursor, or one issued
  for another list, answers `400` with code `400110`
- return newest entries first, with `cursor` pagination (see Pagination)
- currently recorded actions:
  `community_updated`, `channel_created`, `channel_renamed`,
  `channel_deleted`, `channel_permissions_updated`, `role_created`,
  `role_updated`, `role_deleted`, `member_roles_updated`,
  `invitation_created`, `invitation_revoked`,
  `membership_request_accepted`, `membership_request_declined`,
  `member_banned`, `member_unbanned`, `member_kicked` and `message_deleted`

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
Byte-exact entries (id preimage, payload, digest, signing content and
signature) are in
`@haskou/pigeon-swarm-crypto/vectors/community-moderation-log.json`,
checked by the `CommunityModerationLogVectors` unit spec.

| Route                                                  | action                                                         | target                          | details                                                                                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /communities/{id}`                              | `community_updated`                                            | community, `communityId`        | `{autoJoinEnabled, avatar, banner, description, discoverable, name}` as sent in the request (absent or empty `avatar`, `banner`, `autoJoinEnabled`, `discoverable` omitted) |
| `POST .../channels`         | `channel_created`                                              | channel, derived channel id     | `{name, type: "text" \| "voice"}`                                                                                                                                           |
| `PATCH .../channels/{channelId}`                       | `channel_renamed`                                              | channel, `channelId`            | `{name}`                                                                                                                                                                    |
| `DELETE .../channels/{channelId}`                      | `channel_deleted`                                              | channel, `channelId`            | `{type}`                                                                                                                                                                    |
| `PATCH .../channels/{channelId}/permissions`           | `channel_permissions_updated`                                  | channel, `channelId`            | `{visibleRoleIds}`                                                                                                                                                          |
| `POST .../roles`                                       | `role_created`                                                 | role, derived role id           | `{name, permissions}`                                                                                                                                                       |
| `PATCH .../roles/{roleId}`                             | `role_updated`                                                 | role, `roleId`                  | `{name, permissions}`                                                                                                                                                       |
| `DELETE .../roles/{roleId}`                            | `role_deleted`                                                 | role, `roleId`                  | `{}`                                                                                                                                                                        |
| `PUT .../members/{identityId}/roles`                   | `member_roles_updated`                                         | member, `identityId`            | `{roleIds}`                                                                                                                                                                 |
| `POST .../bans`                                        | `member_banned`                                                | member, banned `identityId`     | `{reason}`                                                                                                                                                                  |
| `DELETE .../bans/{identityId}`                         | `member_unbanned`                                              | member, `identityId`            | `{}`                                                                                                                                                                        |
| `DELETE .../members/{identityId}`                 | `member_kicked`                                                | member, `identityId`            | `{}`                                                                                                                                                                        |
| `POST .../invitations`                                 | `invitation_created`                                           | invitation, invitation id       | `{expiresAt, maxUses}`                                                                                                                                                      |
| `POST .../invitations/{invitationId}/revocation`       | `invitation_revoked`                                           | invitation, `invitationId`      | `{}`                                                                                                                                                                        |
| `PATCH /community-membership-requests/{requestId}`     | `membership_request_accepted` or `membership_request_declined` | membership_request, `requestId` | `{identityId, type}` of the request                                                                                                                                         |
| `DELETE .../channels/{channelId}/messages/{messageId}` | `message_deleted`                                              | message, `messageId`            | `{channelId, targetMessageAuthorId}`                                                                                                                                        |

Channel and role creation derive the id from the `createdAt` of the signed
community operation (`operation.createdAt`), not from `moderationLog.createdAt`
(`sha256(JSON.stringify(["channel" | "role", communityId, actorIdentityId,
operation.createdAt]))`, first 24 hex characters). The id in the log target is
the id the node assigns. The log is an audit trail with its own signature; the
community state comes only from the signed community operation that every one
of these routes also takes (see "Signed community operations"). The `DELETE`
routes for channel, role, ban and member kick take
`{ "moderationLog": { "createdAt", "mutation" }, "operation": { ... } }`.

Permissions checked against the signed actor: channel actions need
`manage_channels`, role and member-role actions `manage_roles`, bans
`ban_members`, kicks `manage_members`, invitations `create_invites`,
invitation revocations the invitation's issuer or `manage_members`, request
decisions `approve_members`/`reject_members`, `community_updated` the owner, and `message_deleted` the
message author or `manage_messages`.

### List community channels

```http
GET /communities/{communityId}/channels
```

Query: `limit` (1..100, default 50) and `cursor` (the `nextCursor` of the
previous page). Text channels come first, then voice, each ordered by channel
id ascending. Pass `nextCursor` as `cursor` to read the next page; it is null
on the last page. A malformed cursor, or one from another list, returns 400
(code 400110).

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
  ],
  "nextCursor": null
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

Query: `limit` (1..100, default 50) and `cursor` (the `nextCursor` of the
previous page). Roles are ordered by role id ascending; `memberRoles` is
returned in full on every page. Pass `nextCursor` as `cursor` to read the next
page; it is null on the last page. A malformed cursor, or one from another
list, returns 400 (code 400110).

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
  ],
  "nextCursor": null
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
  "moderationLog": {
    "createdAt": 1773848829055,
    "mutation": { "...": "SignedPublicMutation" }
  },
  "operation": {
    "createdAt": 1773848829055,
    "identitySignature": "<identity signature>",
    "parents": ["<frontier>"],
    "mutation": { "...": "SignedPublicMutation" }
  }
}
```

Member role replacement body:

```json
{
  "roleIds": ["<roleId>"],
  "moderationLog": {
    "createdAt": 1773848829055,
    "mutation": { "...": "SignedPublicMutation" }
  },
  "operation": {
    "createdAt": 1773848829055,
    "identitySignature": "<identity signature>",
    "parents": ["<frontier>"],
    "mutation": { "...": "SignedPublicMutation" }
  }
}
```

`DELETE` role, channel, ban and member kick routes take the same
`moderationLog` and `operation` fields as their only body. A role creation signs `role_created` with
the derived `roleId`; the other routes sign the action in the table above.

Implemented:

- require signed request auth
- require owner or `manage_roles` for role creation/update/deletion and member
  role assignment
- keep `everyone` implicit for every member; clients should not assign it
  manually
- the roles and assignments are folded from the signed operations

### Create channel

```http
POST /communities/{communityId}/channels
```

Request:

```json
{
  "name": "general",
  "type": "text",
  "moderationLog": {
    "createdAt": 1773848829055,
    "mutation": { "...": "SignedPublicMutation" }
  },
  "operation": {
    "createdAt": 1773848829055,
    "identitySignature": "<identity signature>",
    "parents": ["<frontier>"],
    "mutation": { "...": "SignedPublicMutation" }
  }
}
```

`type` is `text` or `voice`; any other value is refused with `400`. The signed
`channel_created` operation carries the same `type` in its `args`.

Implemented:

- require signed request auth from the community owner or a member with
  `manage_channels`
- create text or voice channel metadata in the community, according to `type`
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
  "moderationLog": {
    "createdAt": 1773848829055,
    "mutation": { "...": "SignedPublicMutation" }
  },
  "operation": {
    "createdAt": 1773848829055,
    "identitySignature": "<identity signature>",
    "parents": ["<frontier>"],
    "mutation": { "...": "SignedPublicMutation" }
  }
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
  "moderationLog": {
    "createdAt": 1773848829055,
    "mutation": { "...": "SignedPublicMutation" }
  },
  "operation": {
    "createdAt": 1773848829055,
    "identitySignature": "<identity signature>",
    "parents": ["<frontier>"],
    "mutation": { "...": "SignedPublicMutation" }
  }
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
"identitySignature", "parents", "mutation" } }`, signing `channel_deleted`.

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

Community metadata changes are published as WebSocket domain events. Each event is
routed to connected identities by its identity attributes, such as `memberIds`.

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
  (also emitted for kick, leave and for the ban of a current member)
- `communities.v1.membership_request.was_created`: `request`, `requestId`,
  `identityId`, `creatorIdentityId`
- `communities.v1.membership_request.was_accepted`: same request payload after
  state changes to `accepted`
- `communities.v1.membership_request.was_declined`: same request payload after
  state changes to `declined`
- `communities.v1.channel.message.was_pinned`
- `communities.v1.channel.message.was_unpinned`

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
  attachment bytes must be encrypted by the client and uploaded first as a
  private blob (`POST /private-blobs`, then `PUT /private-blobs/{blobId}`)
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
GET /communities/{communityId}/channels/{channelId}/messages?limit=50&cursor=<cursor>
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
  "nextCursor": "<cursor>"
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
  ]
}
```

Implemented:

- require signed request auth from a community member
- require the member to be able to view the text channel
- return messages whose `replyToMessageId` points to the requested root message
- order replies from oldest to newest

### Community channel drafts

```http
GET /community-drafts
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

Query: `limit` (1..100, default 50) and `cursor` (the `nextCursor` of the
previous page). Drafts are ordered by `updatedAt` descending. Pass
`nextCursor` as `cursor` to read the next page; it is null on the last page.
A malformed cursor, or one from another list, returns 400 (code 400110).

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
  ],
  "nextCursor": null
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

Query: `limit` (1..100, default 50) and `cursor` (the `nextCursor` of the
previous page). Pins are ordered newest first. Pass `nextCursor` as `cursor`
to read the next page; it is null on the last page. A malformed cursor, or one
from another list, returns 400 (code 400110).

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
  ],
  "nextCursor": null
}
```

Implemented:

- require signed request auth
- listing pins requires channel visibility
- pinning and unpinning requires `manage_messages`
- pins are OrbitDB replicated metadata; message payload documents are not rewritten
- pinning validates that the target channel message exists

### Community MLS records

```http
GET /communities/{communityId}/mls/records?groupId=&kind=&afterEpoch=
POST /communities/{communityId}/mls/records
```

Transport for the MLS group encryption of private communities (see the UI
repository's `docs/mls-group-encryption.md`). The node stores opaque, signed,
immutable records and never parses `payload`; clients run MLS. One group exists
per community (`groupId` = community id) and one per restricted channel
(`groupId` = `<communityId>:<channelId>`).

POST body: `{ groupId, kind, payload, createdAt, epoch?, recipientIdentityId?,
mutation }`. `kind` is `key_package`, `commit` or `welcome`; `payload` is
base64, at most 262144 characters. `commit` and `welcome` require `epoch`;
`welcome` requires `recipientIdentityId`; `key_package` carries neither. The
record id is content-bound: `base64url(sha256(canonicalize({epoch, groupId,
kind, payload, recipientIdentityId})))`, and the signed `mutation` targets store
`mlsRecords`.
Publishing the same record twice is a no-op. An empty `recipientIdentityId` is
omitted from the record id like an absent one.

`@haskou/pigeon-swarm-crypto` owns the derivation (`CommitmentId.mlsRecord`) and
ships byte-exact vectors, invalid cases included, in
`vectors/commitment-ids.json`; the `MLSRecordIdVectors` unit spec runs them
through the node.

The proof record id is `community:<communityId>:mls:<recordId>`, and the proof is a
`put` (records cannot be deleted). `payloadDigest` covers the stored document
`{ authorIdentityId, communityId, createdAt, epoch?, groupId, id, kind, payload,
recipientIdentityId?, scopeType: "community_mls" }` where `id` is the full
`community:<communityId>:mls:<recordId>`.

GET returns `{ communityId, groupId, records: [{ recordId, communityId, groupId,
kind, payload, authorIdentityId, createdAt, epoch?, recipientIdentityId? }] }`
ordered by epoch. A `welcome` is only returned to its recipient.

Implemented:

- require signed request auth
- the author must be a current, non-banned member; for a channel group they must
  also be able to view the channel
- a `welcome` recipient must be a member (and see the channel for a channel group)
- receivers re-run the same checks on replicated records, so a peer cannot write
  around the API
- no endpoint deletes or rewrites a record; the community-wide rotation on
  removal is done by clients publishing a new `commit`

### Search public channel messages

```http
GET /communities/{communityId}/channels/{channelId}/messages?query=pigeon&limit=20
```

Search is the channel message list filtered by `query`. The request is signed
as `GET /communities/{communityId}/channels/{channelId}/messages`; query string
values are not part of the signed path.

Implemented:

- require signed request auth from a community member
- require the member to be able to view the text channel
- only work for `visibility: "public"` communities
- search `plaintextPayload`; private encrypted messages are not searchable by
  the backend
- return the same `CommunityChannelMessagesResource` shape as the normal list,
  with no `polls`; `cursor` is ignored
- `limit` accepts 1 to 50 (default 20)

### Search public community messages

```http
GET /communities/{communityId}/messages?query=pigeon&limit=20
```

Community messages are listed per channel, so this collection is read only
through a search: `query` is required, and a request without it is refused with
`400` (code `400100`). The request is signed as
`GET /communities/{communityId}/messages`; query string values are not part of
the signed path.

Implemented:

- require signed request auth from a community member
- only work for `visibility: "public"` communities
- search `plaintextPayload` across all text channels visible to the
  authenticated member
- exclude hidden channels the member cannot see through roles
- return message resources with their real `channelId`, so frontend can jump
  to the right channel/message
- private encrypted messages are not searchable by the backend
- `limit` accepts 1 to 50 (default 20)

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
- include `poll` timeline items scoped to the same community text channel.
  Poll `id`s are channel message ids in the timeline.
- do not include call lifecycle system items; community voice channels expose
  active presence through calls/channel state instead of the text timeline
- support `limit` from 1 to 100
- when `cursor` is provided, return messages older than the position it encodes; a cursor is opaque (not a capability), is bound to this channel only, and a foreign or malformed one returns 400 (code 400110)
- return `nextCursor` (null when the page is empty); pass it back as `cursor` for the next older page

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
  "mutation": {
    "...": "client-signed removal proof for the `messages` record"
  },
  "moderationLog": { "createdAt": 1773848829055, "mutation": { "...": "..." } }
}
```

`mutation` is the signed tombstone of the message record. `moderationLog` is
the signed `message_deleted` entry (see _Signed moderation log entries_) with
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
GET /notifications?limit=20&cursor=<cursor>
```

Implemented:

- require signed request auth
- return notifications where the authenticated identity is the recipient
- support `limit` (1..100, default 50) and an opaque `cursor`; responds `{ "results": [...], "nextCursor": "<cursor or null>" }`
- can include backend-created `missed_call` notifications for conversation
  calls
- hold back pending group invitations beyond two caps. A
  `group_conversation_invitation` is pending while its recipient has signed no
  `accepted` or `declined` state for it (a read mark keeps it pending). Pending
  group invitations are taken in ascending record id order, the order record
  admission uses: at most `NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_PAIR`
  (default 4) per inviter, then at most
  `NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_RECIPIENT` (default 100) in
  total. A held-back letter stays stored and replicated, is never deleted and
  can still be updated by id; it is only left out of the listing. The selection
  depends only on the records the node holds, so nodes holding the same records
  list the same letters. Accepting or declining a listed letter lists the next
  held-back one. The inviter is not told. Answered group invitations and every
  other notification type are listed as before
- apply the caps before pagination: `limit` and `cursor` page over the listed
  notifications only, newest record id first. `nextCursor` is the id of the
  last notification on a full page, and `null` otherwise. A malformed cursor,
  or one from another list, returns `400` with code `400110`

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

A `group_conversation_invitation` names no conversation: the conversation id
travels only inside the seal (`encryptedConversationKey`), and the node does
not learn the group roster. The body carries no `conversationId`; a group
invitation that sends one is rejected with `400` and code `400070`. In
`GET /notifications` its payload is
`{encryptedConversationKey, inviterIdentityId, nonce, recipientIdentityId}`.
The body:

```json
{
  "type": "group_conversation_invitation",
  "inviterIdentityId": "<aliceIdentityId>",
  "recipientIdentityId": "<bobIdentityId>",
  "encryptedConversationKey": "<sealedForBob>",
  "nonce": "<random 16-128 chars>",
  "mutation": { "...": "SignedPublicMutation" }
}
```

A community invitation uses `communityId` and carries no key: the invitee
obtains the group key by joining the community's MLS group, and a node rejects
a `community_invitation` that includes `encryptedKey`:

```json
{
  "type": "community_invitation",
  "communityId": "<communityId>",
  "inviterIdentityId": "<aliceIdentityId>",
  "recipientIdentityId": "<bobIdentityId>",
  "nonce": "<random 16-128 chars>",
  "mutation": { "...": "SignedPublicMutation" }
}
```

Byte-exact contract (vectors in
[`@haskou/pigeon-swarm-crypto/vectors/notification.json`](https://www.npmjs.com/package/@haskou/pigeon-swarm-crypto),
checked by `NotificationVectors.spec.ts`):

- notification id: `"invitation:" + hex(sha256(utf8(canonicalize({inviterIdentityId, nonce, recipientIdentityId, subjectId}))))`,
  where `subjectId` is the one-to-one conversation id or the community id. A
  group invitation has no subject: its id is
  `"invitation:" + hex(sha256(utf8(canonicalize({inviterIdentityId, nonce, recipientIdentityId}))))`.
  The node derives the id; a client never sends it. `@haskou/pigeon-swarm-crypto`
  owns the derivation (`CommitmentId.invitation`) and `vectors/commitment-ids.json`;
  the `NotificationIdVectors` unit spec runs them against the node.
- signed payload (RFC 8785 canonical JSON): `{encryptedKey?, id, inviterIdentityId, nonce, recipientIdentityId, scopeType: "notification_invitation", subjectId, type}`
  for conversation and community invitations, and
  `{encryptedKey, id, inviterIdentityId, nonce, recipientIdentityId, scopeType: "notification_invitation", type}`
  for group invitations. A group record that carries `subjectId` is refused.
  `encryptedKey` is the value of `encryptedConversationKey`; it is required for
  conversation and group invitations and must be absent for community ones.
- `mutation`: a `put` proof with `store: "notifications"`, `recordId` = the
  notification id, `predecessor: null`, `sequence: 0`, `payloadDigest` =
  `base64url(sha256(utf8(canonicalize(payload))))`, signed with the shared
  `pigeon:public-mutation:v2\n` signing content; the author is the inviter.
- admission (every node, on replication too): the inviter must be the proof
  author; for one-to-one conversation invitations both inviter and recipient
  must be participants in the signed conversation state; for community
  invitations the inviter must be allowed to create invites in the signed
  community state. Group invitations get no participant check: the roster lives
  in MLS (D15). The signature, the invitation quota below, the per-minute rate
  cap and the pending-letter listing caps still bound them.

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
  notification records per identity per minute, enforced on the write path of
  the local node (`429`, code `429020`). A per-minute window cannot be enforced
  by the replication gate, because notification records carry no signed time
  and nodes that receive the same records at different moments would admit
  different ones
- replication quota: the gate bounds what it keeps per author instead. It
  admits at most `NOTIFICATIONS_MAX_INVITATIONS_PER_IDENTITY` (default 10000)
  invitations per inviter and `NOTIFICATIONS_MAX_STATES_PER_IDENTITY` (default 30000) state records per recipient. The budget is deterministic: the genuine
  records of one author sort by id and the first ones that fit are admitted, so
  the verdict depends only on the stored records, never on arrival order. Only
  records whose proof verifies for their own payload count, so a forged record
  cannot use up another identity's quota. A validly signed record that the
  policy refuses for another reason still counts against its author. A
  malicious replica can therefore still publish up to the quota for every
  identity it controls, and identity creation is not yet bounded (see
  haskou/pigeon-swarm-node#384); the quota only caps what any single identity
  can make an honest node retain
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
- same write-path rate cap as creation, counted per recipient, and the state
  records of one recipient count against the replication quota above

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
GET /notification-settings
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

- community text channel messages
- invitation notifications
- missed-call notifications
- incoming conversation calls

When the recipient presence is `busy`, backend suppresses pushes for message
and call categories. Invitation notifications are still delivered. Notification
settings can additionally suppress push delivery by conversation, community or
community channel.

The node sends no push for one-to-one or group conversation messages: they
travel sealed through opaque mailboxes, so the node cannot tell a message from
other mailbox traffic. Read state is device-local, so the node also cannot clear
a notification another device already showed; each device closes its own
notifications when it reads the conversation.

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

### Payload contract

Every Web Push body is a UTF-8 JSON object padded to exactly 1024 bytes, so the
ciphertext length does not reveal the notification type. Fields:

- `type`: `message`, `call` or `notification`
- `title`, `body`: fixed display text (no message, sender or party names)
- `tag`: group key the service worker uses to replace or close notifications
- `padding`: filler the client ignores

Payloads never carry conversation, message, community, channel, call,
notification, identity or scope identifiers. A group key is
`<kind>:<sha256 digest of the identifiers, first 128 bits>`, so the same
conversation always yields the same key without exposing its id. A payload that
cannot be padded to 1024 bytes is not sent; the delivery fails and is logged.

Example decrypted by the browser:

```json
{
  "body": "You have a new community message.",
  "padding": "xxxxxxxx",
  "tag": "community:<digest>",
  "title": "New community message",
  "type": "message"
}
```

### What push providers and relays can observe

Bodies are encrypted to each browser subscription (`aes128gcm`); the provider
cannot read them. The node does not add TTL or urgency, so provider defaults
apply. For each send, the push provider (FCM, Mozilla autopush or Apple) can
observe:

- the subscription endpoint URL, which is stable per browser and therefore
  links every push to one subscription;
- the time and frequency of pushes to that endpoint, which reveals when a user
  receives messages, calls or invitations;
- the node's source address and the VAPID public key and `mailto:` subject,
  which identify the deployment operator;
- the encrypted body size, which is the same for every push.

The provider cannot observe the payload fields listed above, sender or
recipient identities, conversation or call identifiers, or whether a push was
suppressed by busy presence or notification settings (suppressed pushes are
never sent). Anyone operating a relay between the node and the provider sees
the same metadata as the provider.

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

Push delivery failures are logged as one JSON line with `message`, `endpointHost`,
`statusCode`, `error` and `shouldDeleteSubscription`. The full endpoint URL,
payload bodies, identities and subscription keys are never logged.

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
`POST /ipfs/contents`, then store the returned CID in sticker metadata. The
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

Returns `201 Created` with `Location: /stickers/packs/{packId}`.

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
GET /stickers/library
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
PUT /stickers/packs/{packId}/stickers/{stickerId}/usage
```

`usage` is a mark on the sticker, like `favorite`: putting it again records a newer
use. Requires signed HTTP headers. The sticker must exist. Returns the updated
authenticated identity sticker library with the sticker moved to the front of
`recentStickers`. The list is capped at 10 entries.

Body: `{ "usedAt": <ms>, "mutation": SignedPublicMutation (recent put) }`.

## Polls API

Polls are interactive timeline items in a community text channel. Group
conversation polls are end-to-end encrypted MLS records in the group mailbox and
never reach this API. `timelineMutation` is required.

Community text channel polls are also registered as channel message ids and
appear in the community channel messages timeline.

Community channel poll resources include `"type": "poll"` and are also
returned inside the `messages` array of
`GET /communities/{communityId}/channels/{channelId}/messages`.

Poll events are emitted through websocket as domain events:

- `polls.v1.poll.was_created`
- `polls.v1.vote.was_cast`
- `polls.v1.vote.was_removed`
- `polls.v1.poll.was_closed`

Community poll events are scoped by community/channel and do not expose the
member list.

### Create poll

```http
POST /polls
```

Returns `201 Created` with `Location: /polls/{pollId}`.

Requires signed HTTP headers. Polls are public replicated records (store
`polls`), so the client signs the mutation: the body also carries `pollId`
(client-chosen id, the record id), `createdAt` (epoch ms) and `mutation`
(`SignedPublicMutation`, `put`, signer = creator). The signed payload is the
record without `proof`: `allowsMultipleVotes`, `createdAt`, `creatorIdentityId`,
`expiresAt` (omitted when none), `id` (= `pollId`), `options` (`{id,text}`),
`question`, `scopeType: "poll"` and the scope fields (`communityId` +
`channelId`; a record carrying `conversationId` is rejected).

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

Rules:

- community channel polls require membership, channel visibility and
  `create_polls`
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
PATCH /polls/{pollId}
```

Requires signed HTTP headers and access to the poll scope. Closed or expired
polls reject new votes. Body `{ "status": "closed", "createdAt", "mutation" }`;
`closed` is the only status a poll can be set to, and any other value is refused
with `400`; the close is the
record `poll-close:<pollId>` (`scopeType: "poll_close"`, signer = closer, who
must be the creator or manage polls in the channel). Signed payload: scope
fields, `closedByIdentityId`, `createdAt`, `id`, `pollId`, `scopeType`. Ballots
with `createdAt` after the earliest close are ignored.

## Private operation authorization

Create a protected scope with `POST /private-authorization/scopes`. The signed request must come from the current node owner; that identity is recorded as the scope owner and
must own the submitted private community projection. The body
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
`duplicate` or `pending`; `accepted` and `duplicate` return `200`, `pending` returns `202`. Pending means the signature and freshness proof were
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
different signer all return the same generic `401`. The response contains
`compromisedCredentials`, `epoch`, `identityId` and `revision`. The
`compromisedCredentials` array lists the compromise caps in effect, sorted
ascending by credential, each with its `compromisedSince` revision; it is empty
when no device is capped. The checkpoint and the caps are read in two steps on
the node, so a client that combines a revision from one read with caps from the
other can build a recovery that admission refuses; it must re-read both before
signing. The authorized-device list is a
separate owner-only endpoint (below). Restricting the endpoint to the identity owner avoids
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

Every device or recovery proof, on these reads as on the sealed-secret routes,
must carry an `X-Timestamp` within 30 seconds of the node clock and is accepted
once: the node remembers each accepted proof signature for its 60 second
validity window, keyed by the raw bytes of the signing key, and refuses a second
request with the same signature, including one that names the same key in
another encoding, with `401` code `401020`. A device credential that is not the
one canonical encoding of an Ed25519 key is refused the same way. A proof takes
its replay slot only once the device is authorized or the key is the recovery
authority, so a key that was never authorized records nothing. A client never
resends a captured or earlier request: it signs each read and write with a new
timestamp. Like the identity replay guard, the record is in-memory and per
node, so within the 60 second window a proof can be accepted once more on
another node, or once more on the same node after a restart.

List the currently authorized device credentials with:

```http
GET /identity-devices/{percent-encoded identityId}/devices
```

It has exactly the authentication of the checkpoint read: the stable identity
signing key must match the requested identity and exactly one complete device
or recovery proof is required, so no other participant can read the inventory.
The response is `{ credentials, epoch, identityId, revision }`, where
`credentials` holds the normalized public credentials authorized at the
current head. It carries no labels, commitments, revoked credentials or
revocation history; a client keeps its own device names. Failures are the same
generic `401`, and `409` when the checkpoint is not available on this node.

Read the signed transitions the requesting key may verify with:

```http
GET /identity-devices/{percent-encoded identityId}/transitions?after=<revision>
```

Authentication matches the checkpoint read (the stable identity signing key
must match the requested identity and exactly one complete device or recovery
proof is required) with one difference: the device credential does not have to
be authorized at the head. A device that was just removed proves possession of
its key and reads the transitions up to its removal, so it can verify the
removal itself instead of trusting a node's `401`. The recovery authority and
a device some replayed state authorized take a replay slot, so a replayed read
of theirs is refused. Any other key is still checked for its signature and
freshness but takes no slot: it only reads the public recovery lineage
described below, so a key that was never authorized cannot fill the guard.
Authentication runs before the query is parsed, and every authentication
failure is the same generic `401` (`401020`).

The response is `{ concurrentRecoveries, identityId, recoveries, transitions }`.
Every entry is a stored transition in exactly the primitives
`POST /identity-devices/{identityId}/transitions` accepted, including `proofOfPossession`
and `signature`; the node never re-signs or rewrites one and serves only
records its replay accepted. `recoveries` is the recovery lineage of the
replay base (oldest first, empty before the first recovery),
`concurrentRecoveries` holds the recoveries that lost that checkpoint, at its
revision or an earlier one, and still carry a cap it lacks (with the lost
recoveries they recovered from), and
`transitions` is the accepted history from that base in replay order. The
recovery authority reads all three lists. A device authorized in some replayed
state reads both recovery lists and the transitions whose `previousRevision` is
at most the revision of the last state that authorizes it, so a revoked device
sees the group that removed it and nothing signed afterwards. Any other device
reads the two recovery lists only. No head revision, epoch, network id or
device list is returned; the client derives them by replaying what it verifies
from the genesis.

`after` (optional, default `0`) keeps only entries whose `revision` is greater
than it. It must be a non-negative decimal safe integer without leading zeros;
anything else returns `400` (`400050`). It is outside the signed canonical
payload and can only narrow the response, so it serves incremental sync only.
A client deciding whether it was removed fetches without `after`, verifies
every entry with the shared replay rules and wipes only on positive signed
evidence: a recovery in its own epoch targeting another credential, or a
replayed revision group above its verified revision that removes its
credential. Absence, a `401`, a `409`, a timeout or a suspended document is
never evidence of removal. `409` means the checkpoint is not available on this
node. Byte-exact served bodies and removal verdicts are in
[`tests/fixtures/device-authorization-transition-log-vectors.json`](../tests/fixtures/device-authorization-transition-log-vectors.json),
checked by the `DeviceAuthorizationTransitionLogVectors` unit spec. The design
and its single-node threat model are in
[`docs/design/device-authorization-transition-log.md`](design/device-authorization-transition-log.md).

Submit an enrollment, revocation or recovery operation to:

```http
POST /identity-devices/{identityId}/transitions
```

The path `identityId` must equal the transition's `identityId`; a mismatch is
refused with `400` (code `400090`) before the transition is read further.

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
{
  "domain": "pigeon:device-authorization:proof-of-possession:v2",
  "transition": {
    "authorCredential": "<public credential>",
    "authorizedAt": 1770000000000,
    "epoch": "genesis",
    "identityId": "<identity id>",
    "operation": "enroll",
    "operationId": "<uuid>",
    "pairingExpiration": 1770000060000,
    "pairingId": "<uuid>",
    "previousRevision": 0,
    "revision": 1,
    "targetCredential": "<public credential>",
    "targetCredentialCommitment": "<lowercase SHA-256 hex>"
  }
}
```

After inserting the resulting target signature, the author signature preimage
is:

```json
{
  "domain": "pigeon:device-authorization:transition:v3",
  "proofOfPossession": "<target signature>",
  "transition": {
    "authorCredential": "<public credential>",
    "authorizedAt": 1770000000000,
    "epoch": "genesis",
    "identityId": "<identity id>",
    "operation": "enroll",
    "operationId": "<uuid>",
    "pairingExpiration": 1770000060000,
    "pairingId": "<uuid>",
    "previousRevision": 0,
    "revision": 1,
    "targetCredential": "<public credential>",
    "targetCredentialCommitment": "<lowercase SHA-256 hex>"
  }
}
```

Revocation omits `authorizedAt`, `pairingExpiration`, `pairingId` and
`proofOfPossession`, and may add `compromisedSince` (a revision no greater than
`previousRevision`, signed with the transition): the target is then revoked as
compromised and any record it signs claiming that revision or a later one is
refused, even inside the interval where it was authorized. Omit it to retire
the device. Recovery also omits `authorCredential`; its target proof
uses the proof envelope above, and the recovery authority signs the transition
envelope. Credentials and signatures use their API string representation
without decoding or normalization. Byte-exact vectors for enrollment,
revocation (plain and compromised) and recovery (with and without
`compromisedCredentials`) are in
`@haskou/pigeon-swarm-crypto/vectors/device-authorization-transition.json`,
checked by the `DeviceAuthorizationTransitionVectors` unit spec.

A recovery may carry `compromisedCredentials`, a list of one to 32
`{compromisedSince, credential}` entries strictly ascending by `credential`,
each with `compromisedSince` no greater than `previousRevision`. The list must
equal the caps in effect on the current head (same credentials and revisions),
otherwise the recovery is refused as an invalid transition. Omit the field when
no cap is in effect: an empty list is refused, and a recovery without the field
is accepted only when no cap is in effect. The list is covered by the target
proof and the recovery authority signature. In the signed envelope
`compromisedCredentials` follows `authorizedAt` and precedes `compromisedSince`,
and each entry writes `compromisedSince` before `credential`. A carried cap
refuses the credential's records claiming that revision or a later one, and
enrolling the same key again does not lift it, so the list only narrows what is
accepted.

The endpoint is unauthenticated until signatures are verified, so each node
rate limits it before any lookup or lock: 20 submissions per identity and 300
per node per minute. Excess requests return `429` with code `429030`.

The response has the same shape as the checkpoint read: the identity identifier,
current recovery epoch, deterministic current revision and the
`compromisedCredentials` in effect after the transition. The authorized-device
list is only served by the owner-only `GET /identity-devices/{identityId}/devices`.
Replayed operation or pairing identifiers, stale predecessors, wrong recovery
epochs, pairing authorizations signed after their declared expiry, substituted
identities or credentials, revoked authors and unrelated recovery authorities
return `409`. Replicas accept an otherwise valid fully signed enrollment after
an offline partition. A complete artifact signed by both devices is
authorization, rather than an unsigned bearer offer; transport delay does not
invalidate it. The author must refuse to create that final signature after the
pairing deadline. The endpoint never returns local vault envelopes or secret
recovery material.

A device retiring itself (a revocation whose `authorCredential` equals its
`targetCredential`, without `compromisedSince` or `compromisedCredentials`) may
add `sealedSecrets` to hand over a fresh sealed secret generation to the devices
that remain; see [Hand-over at retirement](#hand-over-at-retirement). The body
limit is 1 MB. On any other transition the field returns `400` with code
`400030` and nothing is applied.

### Device sealed secrets

Each new generation carries one sealed payload per authorized device (for
example a fresh mailbox root and keychain key). The node requires entries for
exactly the authorized devices, so a revoked device gets nothing from a
generation published after its revocation. Both routes use device proof only,
checked against the current authorization head: `X-Timestamp`,
`X-Device-Credential` and `X-Device-Signature`. The identity signature
(`X-Identity-Id`, `X-Signature`) and `X-Recovery-Signature` are not accepted.
`X-Timestamp` must be within 30 seconds of the node clock, and each device
signature is accepted once (see _Identity device authorization_): a replayed request
returns `401` code `401020`.

Publish a generation with:

```http
PUT /identity-devices/{percent-encoded identityId}/sealed-secrets
X-Timestamp: <millisecondsSinceEpoch>
X-Device-Credential: <device credential>
X-Device-Signature: <signature>
```

The publisher is the device named by `X-Device-Credential`. The body is:

```json
{
  "generation": 3,
  "authorizationRevision": 2,
  "entries": [
    {
      "recipientCredential": "<device credential>",
      "sealedSecret": "v2.x25519-hkdf-sha256-aes-256-gcm.…",
      "signature": "<base64 publisher signature over the preimage>"
    }
  ]
}
```

`generation` is an integer of at least 1. `entries` holds 1 to 128 items.
`sealedSecret` is 1 to 4096 characters from `A-Za-z0-9+/=.-`. The node stores
it without decrypting or inspecting it.

The node checks, in order:

1. Freshness and device proof against the head: `401`.
2. Replay guard on the request signature: `401`.
3. Body shape and limits, and no duplicate `recipientCredential` values: `400`.
4. `authorizationRevision` equals the head revision: `409`.
5. `recipientCredential` values are exactly the authorized device credentials at
   the head: none missing, revoked or unknown: `409`.
6. Every entry signature verifies under the publisher credential: `409`.
7. `generation` is strictly greater than the stored generation: `409`.

Success returns `200` with `{ identityId, generation, authorizationRevision }`.

Each entry signature covers this preimage, serialized with `JSON.stringify`
with keys in exactly this (alphabetical) order. Every credential and the
identity id is the body-only base64 form, without the PEM header and footer:

```json
{
  "authorizationRevision": 2,
  "generation": 3,
  "identityId": "<identity id>",
  "publisherCredential": "<device credential>",
  "purpose": "pigeon:device-sealed-secret:v1",
  "recipientCredential": "<device credential>",
  "sealedSecret": "v2.x25519-hkdf-sha256-aes-256-gcm.…"
}
```

Read the caller's own entry of the stored generation with:

```http
GET /identity-devices/{percent-encoded identityId}/sealed-secrets
X-Timestamp: <millisecondsSinceEpoch>
X-Device-Credential: <device credential>
X-Device-Signature: <signature>
```

Freshness, device proof and the one-use rule are checked as for `PUT`, so a
replayed read returns `401` code `401020`, and a revoked or unknown credential
returns `401`. No stored bundle, or
no entry for the caller, returns `404`. A device added after the last publish
has no entry until the owner republishes.

Success returns `200`:

```json
{
  "identityId": "<identity id>",
  "generation": 3,
  "authorizationRevision": 2,
  "publisherCredential": "<device credential>",
  "recipientCredential": "<device credential>",
  "sealedSecret": "v2.x25519-hkdf-sha256-aes-256-gcm.…",
  "signature": "<base64 publisher signature over the preimage>"
}
```

The response never includes other devices' entries, the authorized-device list,
head commitments or decrypted material. Recipients verify `signature` against
`publisherCredential` and the preimage above; the node is not trusted for that.

Byte-exact vectors for the entry preimage, its Ed25519 signature, credential
normalization and accepted or rejected bundles are in
`@haskou/pigeon-swarm-crypto/vectors/device-sealed-secret.json`,
checked by the `DeviceSealedSecretVectors` unit spec against the domain code.
`tests/e2e/real-transport/device-sealed-secret-bundle.ts`
(`yarn test:e2e:real-transport:sealed-secret-bundle`) rebuilds the preimages
and signatures with `node:crypto` only, publishes the vector identity on a real
node and submits the vector bundle over HTTP. The node accepts it and returns
the vector signature from `GET`. The fixture's rejected bundles and a flipped
signature byte get `409` with code `InvalidDeviceSealedSecretSignatureError`,
and a republished generation gets `DeviceSealedSecretGenerationStaleError`.
Sealed secrets are node-local, so there is no second-node assertion.

#### Hand-over at retirement

A remaining device need not be online when another device forgets itself. The
retiring device therefore publishes the next generation together with its own
revocation, on `POST /identity-devices/{identityId}/transitions`:

```json
{
  "...": "the signed self-revocation transition fields",
  "sealedSecrets": {
    "generation": 4,
    "entries": [
      {
        "recipientCredential": "<remaining device credential>",
        "sealedSecret": "v2.x25519-hkdf-sha256-aes-256-gcm.…",
        "signature": "<base64 retiring device signature over the preimage>"
      }
    ]
  }
}
```

`generation` and `entries` follow the same limits as `PUT`. The hand-over has no
`authorizationRevision` or publisher of its own: the node takes the
transition's `revision` and `authorCredential`, and each entry signature covers
the same preimage with those values. The publisher is therefore the credential
revoked at `authorizationRevision`; a client that checks the publisher's
membership checks it at `authorizationRevision - 1`.

Before anything is applied the node checks, in order:

1. The transition retires its author and the author is the publisher: `400`.
2. The publisher is authorized at the head: `409`.
3. The retirement leaves at least one device: `409`.
4. `recipientCredential` values are exactly the credentials that remain after
   the retirement, at the transition's `revision`: `409`.
5. Every entry signature verifies under the retiring credential: `409`.
6. `generation` is strictly greater than the stored generation: `409`.

The transition is then applied as usual. When the applied head is exactly the
one the hand-over was sealed for, the generation replaces the stored one and the
response adds `"sealedSecrets": { "authorizationRevision", "generation" }`.
When a concurrent transition or publish wins the race, the retirement still
applies but the field is absent: the client must not treat the new secret as
delivered, and the remaining devices rotate on their next unlock as before.

A retiring device that hands over a generation can still decrypt it until it
discards it, exactly as with any secret it already held; the hand-over only
guarantees that the old generation and the retired device's own entry stop
being served the moment the retirement applies.

## Node-to-Node Flow

Client realtime does not replace PubSub. The intended flow is:

```text
Client A -> Node A: POST /communities/{id}/channels/{channelId}/messages
Node A -> IPFS: store immutable encrypted message document
Node A -> OrbitDB: index replicated metadata
Node A -> DomainEventPublisher: publish accepted domain event
Node A -> PubSub: announce channel message
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

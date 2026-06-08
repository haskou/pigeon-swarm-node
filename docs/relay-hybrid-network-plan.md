# Relay And Hybrid Network Plan

## Context

Pigeon Swarm currently mixes several concepts that should remain separate:

- Application identities (`IdentityId`) identify users and may be private or unpublished.
- Node identifiers (`NodeId`) are internal UUIDs and are not cryptographic identities.
- libp2p peer identifiers (`peerId`) are cryptographic network identities.
- Private IPFS networks use PSK/pnet and should remain the fast path for private network peers.
- Public/fallback connectivity should not require an application owner identity.
- A node should expose at most one relay server. Discovery records may be
  published per private network, but they point to the same node-scoped relay
  server.

The relay architecture must therefore be based primarily on libp2p peer identity, not application identity.

## Current Implementation Status

Implemented in this branch:

- `PIGEON_RELAY_ENABLED=true` starts one public libp2p relay-capable node for
  the backend node.
- `PIGEON_RELAY_AUTO_ENABLE=true` lets a publicly reachable node start relay
  mode when every known signed relay record has expired.
- Helia's public relay service is used when available; the relay runtime keeps
  relay service setup idempotent to avoid registering duplicate libp2p relay
  protocols.
- The public/fallback libp2p runtime bootstraps from
  `PIGEON_BOOTSTRAP_RELAY_MULTIADDRS`.
- Leaf nodes announce public or relayed multiaddrs on
  `pigeon-swarm.public-relay.peers.v1`.
- Public relay nodes subscribe to that peer-announcement topic so leaf nodes can
  discover and dial one another after bootstrapping to the relay.
- Relay-capable nodes publish signed relay records on
  `pigeon-swarm.public-relays.v1`.
- Relay-capable nodes publish encrypted private-network relay directory
  documents to public IPFS and publish deterministic time-windowed IPNS records
  pointing to those documents. The IPNS keys and encryption key are derived from
  the private network key with separated HMAC contexts, so only nodes that know
  that private network key can derive the IPNS names and decrypt the documents.
- Peers validate relay records with the advertised libp2p public key, verify
  that the public key maps to the advertised `peerId`, reject expired records,
  persist active records in MongoDB and dial the advertised relay multiaddrs.
- Active relay records are rehydrated at startup and used for new public
  runtime dials before waiting for fresh announcements.
- Private-network domain events are published both through the direct private
  pnet topic and through an encrypted public fallback GossipSub topic derived
  from the private network key.
- Private IPFS content can be fetched over
  `/pigeon-swarm/ipfs-content/1.0.0`; request and response payloads are
  encrypted with the private network key and imported only when the resulting
  CID matches the requested CID.
- `yarn test:e2e:real-transport:relay-fallback` verifies one public relay and
  two separate peer processes exchanging a private fallback event and private
  IPFS bytes through that relay path.

Still future work:

- Deterministic relay election to avoid multiple auto-enabled public nodes
  taking over at the same time. Current auto mode is conservative and
  availability-first.
- Admin controls for accepting, rejecting, or banning relay/peer records.

## Goals

- Allow nodes behind NAT to participate by using reachable relay nodes.
- Let any node enable or disable relay capability with simple configuration.
- Discover relay candidates without a central hardcoded list.
- Avoid trusting unsigned or spoofed relay announcements.
- Keep private PSK networks private.
- Prepare for a future public fallback transport without redesigning the whole storage layer.
- Keep debug endpoints useful without exposing private owners, private network membership, secrets, or sensitive local topology.

## Non-Goals

- Do not replace private IPFS/PSK.
- Do not use Gossipsub as a large block transport.
- Do not require every node to publish an application owner identity.
- Do not trust `ownerId` as relay authority.
- Do not merge public fallback and private PSK traffic into one libp2p instance.
- Do not publish private network ids in public relay records in the first implementation.
- Do not expose owner display names in network debug endpoints.
- Do not create relay instances per private network.

## Node Modes And User-Facing Configuration

The product-facing configuration should stay simple. Users should not need to
understand libp2p topology names to run a node.

Expose relay as an explicit capability:

```env
PIGEON_LIBP2P_PORT=4001
PIGEON_RELAY_ENABLED=false
PIGEON_RELAY_AUTO_ENABLE=false
PIGEON_RELAY_PORT=4011
PIGEON_PUBLIC_HOST=
PIGEON_RELAY_DISCOVERY_ENABLED=true
```

Derive internal node state from runtime facts:

- `leaf`: relay disabled and no public dialable address is available.
- `reachable`: relay disabled but the node has a public dialable address.
- `relay`: relay enabled and the node has a public dialable relay address.

`reachable` should be a diagnostic/runtime classification, not a required user
setting.

Relay is node-scoped:

- `PIGEON_RELAY_ENABLED=true` starts at most one relay server for the node.
- The relay server is part of the public/fallback connectivity layer.
- The relay server is not scoped to a private network.
- Private networks may use the relay for connectivity/fallback. The relay
  server itself remains node-scoped, while discovery records are scoped by the
  private network key so unrelated networks cannot discover each other's relay
  records.

### Address Generation

For local listen addresses, only require ports from the user:

```txt
/ip4/0.0.0.0/tcp/<PIGEON_LIBP2P_PORT>
/ip4/0.0.0.0/tcp/<PIGEON_RELAY_PORT>
```

For public announce addresses, require `PIGEON_PUBLIC_HOST` when the node should
be dialable from outside LAN:

```txt
/dns4/<PIGEON_PUBLIC_HOST>/tcp/<PIGEON_LIBP2P_PORT>/p2p/<peerId>
/dns4/<PIGEON_PUBLIC_HOST>/tcp/<PIGEON_RELAY_PORT>/p2p/<peerId>
```

If `PIGEON_PUBLIC_HOST` is empty:

- do not publish public relay records in production;
- allow local/LAN diagnostics to show listen addresses;
- optionally use observed addresses later, but do not rely on them as the first
  implementation.

The libp2p peer id comes from the local libp2p private key:

```ts
libp2p.peerId.toString()
```

The backend can expose the generated listen and announce multiaddrs through a
debug/admin endpoint.

### Runtime Classification

### Leaf Node

A leaf node:

- does not accept inbound libp2p connections;
- does not run a relay server;
- discovers relay nodes;
- dials private or fallback peers through relays when needed.

This should be the default for users behind NAT.

### Reachable Node

A reachable node:

- listens on public/dialable libp2p multiaddrs;
- accepts direct inbound connections;
- does not relay traffic for other nodes.

This is useful for users or servers with reachable ports who do not want relay load.

### Relay Node

A relay node:

- listens on public/dialable libp2p multiaddrs;
- enables circuit relay server mode;
- publishes signed relay records;
- periodically refreshes relay records;
- exposes health/debug information.

Relay nodes are infrastructure-capable nodes, but they do not need an application owner.

## Proposed Configuration

Prefer the simplified configuration above. The more explicit multiaddr-based
configuration below can remain an advanced override for operators who need full
control.

```env
# Main libp2p/private IPFS listen config.
PIGEON_LIBP2P_LISTEN_MULTIADDRS=/ip4/0.0.0.0/tcp/4001
PIGEON_LIBP2P_ANNOUNCE_MULTIADDRS=/dns4/node.example.com/tcp/4001

# Relay server config, used only when PIGEON_RELAY_ENABLED=true.
PIGEON_RELAY_ENABLED=true
PIGEON_RELAY_LISTEN_MULTIADDRS=/ip4/0.0.0.0/tcp/4011
PIGEON_RELAY_ANNOUNCE_MULTIADDRS=/dns4/relay.example.com/tcp/4011

# Public discovery/fallback config.
PIGEON_PUBLIC_LIBP2P_ENABLED=true
PIGEON_PUBLIC_RELAY_DISCOVERY_ENABLED=true
PIGEON_RELAY_RECORD_TTL_SECONDS=300
```

Avoid `host:port` fields for libp2p addresses. Store and publish full multiaddrs.

Example:

```txt
/dns4/relay.example.com/tcp/4011/p2p/12D3Koo...
```

## Express Port

Do not reuse the Express HTTP port for libp2p relay.

Reasons:

- libp2p expects dialable multiaddrs and transport negotiation.
- HTTP reverse proxying does not automatically provide libp2p relay semantics.
- Sharing ports makes debugging and deployment harder.
- A dedicated relay port is clearer for firewall and devops configuration.

Express can expose debug/admin endpoints, but the libp2p relay should listen on its own transport port.

## Relay Changes And Runtime Restarts

Relay discovery should be dynamic and must not restart private IPFS or private
Gossipsub every time a remote relay appears, disappears, or changes health.

Public relays are not injected into private `pnet` IPFS instances. A private
libp2p node with a PSK protects every connection during upgrade, including a
connection to a relay. Therefore a public relay that does not know the PSK
cannot be used directly by that private instance. The public relay path belongs
to the public/fallback libp2p runtime.

There are two different kinds of changes:

### Remote Relay Set Changes

Examples:

- a new relay record appears;
- a relay healthcheck fails;
- a relay record expires;
- a better relay becomes available.

These should not restart IPFS or Gossipsub.

Expected behavior:

- update an in-memory/persisted relay registry;
- use the updated relay set for new dials;
- keep existing healthy connections where possible;
- emit debug logs/events for observability.

### Local Transport Configuration Changes

Examples:

- `PIGEON_LIBP2P_PORT` changes;
- `PIGEON_RELAY_PORT` changes;
- `PIGEON_RELAY_ENABLED` changes;
- listen/announce multiaddrs change;
- relay server mode is enabled or disabled.

These may require restarting the affected libp2p instance.

Expected behavior:

- private IPFS/PSK should not restart because a remote relay changes;
- public fallback libp2p should not restart because a remote relay changes;
- only local listener/relay-server configuration changes should require restart;
- startup logs should explain which addresses are listened and announced.

## Debug Endpoint Direction

A debug endpoint should make generated addresses and relay state visible:

```json
{
  "peerId": "12D3Koo...",
  "listenAddresses": [
    "/ip4/0.0.0.0/tcp/4011"
  ],
  "advertisedAddresses": [
    "/dns4/pigeon-swarm.com/tcp/4011/p2p/12D3Koo..."
  ],
  "relayEnabled": true,
  "relayAdvertised": true,
  "nodeConnectionClassification": "relay",
  "debugReason": "PIGEON_PUBLIC_HOST configured and relay server enabled"
}
```

This endpoint must be safe by default:

- no application owner ids;
- no owner display names;
- no private identity metadata;
- no private network ids;
- no PSK/network keys;
- no full private topology;
- no sensitive local filesystem/storage paths;
- no relay records that failed signature validation unless clearly marked and
  sanitized.

If deeper diagnostics are needed, expose them behind an explicit admin-only
surface later. The first debug endpoint should help answer connectivity
questions without leaking social or private-network information.

## Relay Record

Relay discovery should use signed relay records.

```json
{
  "version": 1,
  "nodeId": "725a495b-369a-4abd-aa7c-da5eb513f4d6",
  "peerId": "12D3Koo...",
  "role": "relay",
  "multiaddrs": [
    "/dns4/relay.example.com/tcp/4011/p2p/12D3Koo..."
  ],
  "issuedAt": 1780000000000,
  "expiresAt": 1780000300000,
  "signature": "base64-signature"
}
```

### Required Fields

- `version`
- `peerId`
- `role`
- `multiaddrs`
- `issuedAt`
- `expiresAt`
- `signature`

### Optional Fields

- `nodeId`: useful for app-level diagnostics, but not a trust anchor.

Do not include `networkIds` or `ownerId` in public relay records. They are not
required for relay discovery and can leak private membership or identity
information.

For private-network discovery, publish an encrypted directory document per
private network through public IPFS and point to it with deterministic
time-windowed IPNS:

```json
{
  "version": 1,
  "updatedAt": 1770000000000,
  "encryptedRelayRecords": [
    {
      "version": 2,
      "encryptedRelayRecord": {
        "algorithm": "aes-256-gcm",
        "iv": "<base64url>",
        "authTag": "<base64url>",
        "ciphertext": "<base64url>"
      }
    }
  ]
}
```

The IPNS names are derived from the private network key, a short time window,
and a dedicated HMAC context. The document does not include `networkId`, PSK,
private key, owner id, identity metadata, relay peer id, or relay multiaddrs in
plaintext. A node that does not know the private network key cannot derive the
IPNS names and cannot decrypt the relay records if it finds a document by other
means. The rolling window prevents stale public routing caches from pinning
discovery to one obsolete static IPNS record.

## Relay Record Signature

The relay record must be signed by the libp2p node key.

The signature proves:

- the announcing peer controls the private key behind `peerId`;
- the peer authorized the listed multiaddrs;
- the record was not modified after signing.

The signature does not prove:

- the node belongs to a specific user;
- the relay is trustworthy;
- the relay is currently healthy;
- the relay belongs to a private network.

Application identity signatures are optional metadata, not required for relay discovery.
They should not be part of public relay records until there is a clear privacy
and authorization story.

## Relay Record Validation

A node should only treat a relay as usable after all checks pass:

- Record schema is valid.
- `expiresAt` is in the future.
- `issuedAt` is not unreasonably far in the future.
- `role === "relay"`.
- `peerId` is valid.
- Every multiaddr is valid.
- Every multiaddr ends with `/p2p/<peerId>` or otherwise resolves to the same peer.
- Multiaddrs are public/dialable unless running in local/dev mode.
- Multiaddrs do not point to localhost/private IP ranges in production.
- Signature verifies against `peerId`.
- Healthcheck can dial the relay and verify relay capability.

Until healthcheck passes, classify it as `claimedRelay`, not `verifiedRelay`.

## Relay Discovery

Relay nodes should publish signed relay records to a public discovery layer.

Possible storage mechanisms:

- deterministic time-windowed IPNS records pointing to encrypted public IPFS
  directory documents;
- public IPFS routing records;
- public DHT records;
- a public Gossipsub topic for relay announcements;
- a static bootstrap list as a fallback.

The system should not rely on one single mechanism. A practical first version can use:

1. configured bootstrap relay multiaddrs;
2. private-network relay directory records resolved through deterministic
   time-windowed IPNS with the private network key;
3. public relay records learned through pubsub after at least one public peer is
   connected;
4. healthchecked local cache.

## Relay Health

Each node keeps local relay health state:

```ts
type RelayHealth = {
  peerId: string
  multiaddrs: string[]
  status: 'claimed' | 'verified' | 'unhealthy' | 'expired'
  lastCheckedAt?: number
  lastSuccessfulDialAt?: number
  failureCount: number
  latencyMs?: number
  debugReason?: string
}
```

Healthcheck should verify:

- dial succeeds;
- peer id matches;
- relay protocol is supported;
- observed latency is acceptable;
- record is not expired.

Avoid automatic leadership elections at first. Let multiple relays coexist and let clients choose healthy ones.

## Relay Takeover

Do not implement hard leader election initially.

Preferred behavior:

- relay nodes publish short-lived records;
- records expire naturally;
- clients keep a healthy relay set;
- if few or no verified relays exist, configured relay-capable nodes may start publishing themselves;
- clients fail over to another verified relay.
- a node publishes at most one active relay record for its public relay server.

This avoids flapping and split-brain behavior.

## Private Versus Fallback Connectivity

Private and fallback connectivity should be explicit.

```txt
privateLibp2p:
  - PSK/pnet enabled
  - used by private Helia/IPFS
  - fast path

publicLibp2p:
  - no PSK
  - used for discovery, rendezvous, relay, fallback streams, public gossip
  - all application data encrypted/authenticated at application level
```

A single libp2p instance should not be treated as both public and private when pnet is enabled.

The first fallback implemented for this model is private-network event gossip
over the public runtime, plus encrypted CID fetch streams:

- direct private IPFS pub/sub still publishes to
  `pigeon-swarm.networks.<networkId>.<context>.<version>.announcements`;
- public fallback pub/sub publishes the same encrypted payload to
  `pigeon-swarm.private-relay.<context>.<version>.<hmac>`;
- `<hmac>` is derived from the private network key and routing key;
- the topic does not contain the private `networkId`;
- the payload remains AES-GCM encrypted by `PubSubNetworkMessageCodec`;
- consumers deduplicate by `event_id` when both direct and fallback paths
  deliver the same event.
- content fetch uses `/pigeon-swarm/ipfs-content/1.0.0` over public libp2p;
- fetch requests and responses are encrypted with the private network key;
- relays and unrelated public peers do not see `networkId`, PSK, plaintext CID
  or plaintext bytes;
- received bytes/JSON are imported locally and accepted only if the resulting
  CID exactly matches the requested CID.

## Data Flow

### Fast Path

1. Node finds private network peers.
2. Private IPFS retrieves blocks directly.
3. Gossipsub sync events stay inside the private network.

### Fallback Path

1. Node cannot retrieve content through private IPFS.
2. Node discovers verified relay or public peer.
3. Node opens an authenticated public libp2p stream.
4. Node requests encrypted bytes or encrypted JSON by CID.
5. Node imports the response into the local private network and validates the
   resulting CID.
6. Node stores valid bytes in local private blockstore.
7. Application receives content through the same content abstraction.

## Block Transport

Do not send large blocks through Gossipsub.

Use Gossipsub for:

- relay announcements;
- presence/wakeup;
- “I have CID”;
- “I need CID”;
- sync hints;
- small metadata events.

Use a libp2p stream protocol for block transfer:

```txt
/pigeon/block-sync/1.0.0
```

The protocol should:

- authenticate peers;
- encrypt requests/responses if using public transport;
- validate requested CIDs;
- rate limit;
- enforce size limits;
- avoid leaking private network membership where possible.

## Peer Debug Endpoint Direction

The current peers endpoint is application-heartbeat based, not live libp2p state.

Keep the existing endpoint stable and add a debug endpoint later:

```http
GET /peers/debug
```

Possible response:

```ts
type PeerConnectionView = {
  peerId: string
  nodeId?: string

  connectionType: 'private' | 'fallback' | 'both' | 'unknown'
  connectionSource: Array<
    | 'private-ipfs'
    | 'public-libp2p'
    | 'gossipsub'
    | 'rendezvous'
    | 'bootstrap'
    | 'relay'
    | 'mdns'
    | 'unknown'
  >

  connected: boolean
  addresses: string[]
  protocols?: string[]

  lastSeenAt?: string
  lastConnectedAt?: string
  latencyMs?: number

  isPrivateNetworkPeer: boolean
  isFallbackPeer: boolean
  isRelayConnection: boolean

  debugReason?: string
}
```

Sensitive fields must not be included in the default debug response:

- no `ownerId`;
- no `ownerDisplayName`;
- no claimed owner;
- no verified owner;
- no private network ids;
- no identity profile metadata.

If owner diagnostics are ever needed, add a separate explicit admin-only endpoint
after implementing verified node-owner binding.

## Required Internal Registry

Add a `ConnectionRegistry` or `PeerRegistry` later.

It should track:

- `peerId`;
- connection source;
- sanitized network classification;
- private/public/fallback classification;
- relay status;
- dial/health state;
- claimed node id;
- claimed owner internally, if observed;
- verified owner internally, if a future handshake supports it;
- last connected/seen timestamps;
- addresses and protocols.

This registry should be updated at:

- discovery events;
- dial attempts;
- connection open/close;
- relay record validation;
- node heartbeat processing;
- optional signed handshake completion.

## Security Considerations

- A relay record signed by peerId proves peer control, not human trust.
- `nodeId` is not cryptographic.
- `ownerId` is optional and may be private.
- `ownerId` should not be included in public relay records or default debug responses.
- Private network ids should not be included in public relay records or default debug responses.
- A relay can observe transport metadata even if payloads are encrypted.
- Public fallback must assume the transport is hostile.
- CIDs are not secrets.
- Blocks should be encrypted before CID generation when content is private.
- Relay records need TTL and replay protection.
- Healthcheck prevents accepting syntactically valid but useless relays.
- Rate limits are needed for relay abuse.
- Allowlist/denylist may be needed for relay peers.

## Implementation Phases

### Phase 1: Observability

- Keep `DEBUG_NETWORK=true` diagnostics.
- Add `/peers/debug` or `/node/network/debug` read-only endpoint with sanitized
  non-sensitive data only.
- Show live libp2p peers separately from heartbeat peers.
- Show private/public/fallback classification without exposing private network ids.
- Show whether relay is enabled, advertised, and healthchecked.
- Show generated listen and advertise multiaddrs for the local node.

### Phase 2: libp2p Signature Spike

- Verify the persisted libp2p key can sign relay records.
- Verify relay records can be validated from `peerId`.
- Verify `peerId` remains stable across restarts.
- Keep this independent from application identities.

### Phase 3: Simple Relay Configuration

- Add `PIGEON_RELAY_ENABLED`.
- Add port-based listen config.
- Add optional `PIGEON_PUBLIC_HOST`.
- Generate listen and advertise multiaddrs internally.
- Validate config at startup.
- Document devops requirements.

### Phase 4: Relay Server

- Enable one relay server per node only when `PIGEON_RELAY_ENABLED=true`.
- Listen on dedicated libp2p relay multiaddr.
- Do not reuse Express port.
- Add local health endpoint/debug state.

### Phase 5: Signed Relay Records

- Define relay record schema.
- Sign with libp2p node key.
- Publish with short TTL.
- Validate records before storing.
- Store claimed and verified relay states separately.
- Keep relay servers node-scoped, and publish private-network discovery
  envelopes that point to those node-scoped relay records.
- Do not include `ownerId` or private `networkIds`.

### Phase 6: Relay Discovery And Health

- Load configured bootstrap relays.
- Discover relay records.
- Healthcheck candidates.
- Maintain healthy relay set.
- Expire stale records.

### Phase 7: Public Fallback libp2p

- Add public libp2p instance without PSK.
- Use it for relay/rendezvous/fallback streams.
- Keep private Helia/libp2p unchanged.

### Phase 8: Hybrid Content Gateway

- Introduce `HybridContentGateway`.
- Try local/private storage first.
- Use fallback public stream if private retrieval fails.
- Validate bytes against CID.
- Store valid blocks locally.

## Open Questions

- Do we need a relay allowlist for production?
- Should relay health be exposed publicly or only admin/debug?
- Should nodes prefer direct reachable peers before relay?
- How many relays should a leaf keep warm?
- What rate limits are acceptable for relay/block sync?
- Do we want optional owner verification later via node authorization certificates?

# OrbitDB Private Sync Spike

## Decision

Proceed with OrbitDB as the replicated application storage candidate for the
next phase.

The spike proves that OrbitDB `events`, `documents` and `keyvalue` stores can
replicate over the private IPFS relay path when the nodes share the private PSK
network and open deterministic stores for that network.

## Validated Shape

Each private network can own deterministic OrbitDB stores:

```txt
private-network/<networkId>/events/domain-events
private-network/<networkId>/documents/identities
private-network/<networkId>/documents/keychains
private-network/<networkId>/documents/communities
private-network/<networkId>/documents/messages
private-network/<networkId>/documents/notifications
private-network/<networkId>/documents/requests
private-network/<networkId>/keyvalue/heads
```

Nodes do not need to exchange OrbitDB database addresses through gossip. They
can derive the same addresses from the private network id, store name, store
type and access controller configuration.

## Test Evidence

The real-transport E2E test uses:

- separate local folders;
- one private PSK network;
- one relay-capable node;
- two replicated OrbitDB nodes over `/p2p-circuit`;
- one unauthorized writer node for access-control verification.

Command:

```bash
yarn test:e2e:real-transport:orbitdb-spike
```

Validated behavior:

- private IPFS pubsub works over relay-limited connections;
- OrbitDB `events` store replicates domain event envelopes;
- OrbitDB `documents` stores replicate JSON projections;
- OrbitDB `keyvalue` store replicates heads/read markers;
- deterministic store names resolve to the same OrbitDB addresses on both
  replicated nodes;
- write access rejects an OrbitDB identity outside the configured writer list;
- restart and catch-up rebuilds projections from the replicated event log;
- query patterns are viable for:
  - latest identity by id;
  - latest keychain by identity id;
  - message timeline and edit state;
  - read marker lookup;
  - notifications by identity;
  - invites and membership requests by community and identity;
- replicated events can drive the same WebSocket projection names that local
  domain events use.

## Required Runtime Fixes Found By The Spike

### Gossipsub On Relay-Limited Connections

`@libp2p/gossipsub` supports relay-limited connections, but it must be created
with:

```ts
runOnLimitedConnection: true
```

Without this, private IPFS pubsub does not deliver over `/p2p-circuit`, so
OrbitDB sync cannot discover peers.

### OrbitDB Block And Heads Sync On Relay-Limited Connections

OrbitDB 4.0.0 uses `ipfs.blockstore.get(cid)` without passing connected peer
providers. In relay-limited private networks this can ask the relay or the
wrong peer and abort even when the real provider has the block.

OrbitDB sync also calls `libp2p.dialProtocol(peerId, protocol)` for heads sync.
On relay-limited private connections this may try to create a fresh circuit
connection instead of opening a stream over the existing connection.

The branch carries a reproducible postinstall patch that:

- passes connected peers as `providers` to OrbitDB `IPFSBlockStorage.get`;
- registers OrbitDB heads handlers with `runOnLimitedConnection: true`;
- opens OrbitDB heads streams through an existing connection when available.

These patches should be treated as adapter compatibility work for the current
dependency versions, not as domain behavior.

## Constraints For Phase 2A

- IPFS still owns binary/content transport by CID.
- OrbitDB should own replicated application indexes, heads and read models.
- Gossip should remain a wake-up/realtime signal, not the primary replicated
  database transport.
- MongoDB must not remain a parallel replicated source of truth. If kept during
  migration, it should be a local compatibility projection with a documented
  removal path.
- The backend must publish equivalent local WebSocket/domain projections when a
  replicated OrbitDB event is applied.

## Rejected During The Spike

- Opening remote OrbitDB stores by fetching manifests from another peer as the
  default bootstrap path. Deterministic store names are simpler and avoid an
  unnecessary manifest discovery problem.
- Reusing the same libp2p instance to simulate a second OrbitDB writer. That
  registers duplicate `/orbitdb/heads/<address>` handlers and is not a valid
  multi-node test.

# Relay recovery acceptance

The private relay mesh must recover useful traffic, not merely report connected
peers. Run `yarn test:e2e:real-transport:private-relay-mesh` from the backend
repository. This scenario is included in `test:e2e:real-transport:ci`.

## Topology and fault matrix

Four independent public DHT bootstrap nodes and three private relay processes
listen on ephemeral loopback TCP ports. Each relay has its own disposable IPFS,
OrbitDB and local database directories. Only the public bootstrap addresses and
the shared test network configuration are supplied to the processes. Private
relay addresses are discovered by the production relay directory.

| Phase | Fault or transition | Required evidence |
| --- | --- | --- |
| Staggered startup | A starts before B; B starts its directory with its public libp2p transport stopped | No pre-discovery pubsub delivery; restoring B's public transport allows A/B to connect |
| New publisher | C joins only after A/B exchange traffic | All three private pairs connect without restarting A/B discovery or injecting C's private address |
| Repeated partitions | Both C links are closed, twice | Fresh signalling and full OrbitDB documents arrive after each recovery |
| Public outage and initiator failure | All public libp2p transports stop; the lexicographically first private peer rejects outbound directory dials; both its links close | Public peer counts remain zero, the rejected-dial counter increases, and the other peers recover both private paths using cached records |
| Process restart | C exits completely and reopens the same test storage in a new process | Same private peer ID, different PID, full mesh and new traffic after restart |

Signalling uses `CallSignalSentEvent`, `PubSubTopicResolver` and
`PubSubNetworkMessageCodec` from production. Each transmission carries a fresh
signal ID on the real calls topic and must decrypt to the exact serialized event
on the remote relay. A clear envelope fails the sender guard. This verifies
signalling transport; it does not exercise browser call state, ICE, TURN or media.
OrbitDB checks compare the complete received document, including the unique run
identifier, with the original. The receiver opens after the write so an empty
replica cannot accidentally pass.

## Bounds and lifecycle checks

The local matrix uses a 2-second discovery interval, 4-second connected refresh,
2-second publication interval, 1-second public-peer wait and 10-minute record
TTL. Each wait is bounded by 120 seconds by default. Cached mesh reconnection, signalling and replication in
the combined public-outage/failed-initiator phase must finish within 90 seconds.
The production fallback dial window remains 45 seconds. That window is time
until another peer becomes eligible to dial, not a promise that a connection or
message is delivered within 45 seconds. Phase output reports elapsed recovery
including the subsequent signalling and replication checks.

The unit suite (`yarn test:unit --runInBand tests/unit/shared/infrastructure/network/relay`) separately checks:

- 20 simultaneous discovery requests share one in-flight pass; another pass can
  start after settlement;
- repeated publication of the same peer replaces its cached record; expiry
  removes its envelope, known-publisher entry and fallback observation;
- initial retry backoff starts at 1 second and is capped by the discovery
  interval;
- stopped or superseded lifecycle callbacks cannot schedule another retry;
- inbound reconnection resets the 45-second fallback window;
- cached private recovery proceeds before waiting for public peers.

Expiry uses a controlled clock so stale records can be tested exactly at their
boundary. The real matrix deliberately keeps records valid throughout recovery.
The cache check covers ordinary repeated publications and expired peers; it is
not an admission-control or malicious-publisher memory-exhaustion guarantee.

## What this establishes

This is a reproducible local TCP acceptance test for backend relay recovery,
encrypted call-event delivery and OrbitDB replication. It does not establish
connectivity across external NAT/CGNAT, firewall behavior, browser media quality,
or privacy against a member holding the shared network key. Those require the
separate deployment, call and privacy acceptance work.

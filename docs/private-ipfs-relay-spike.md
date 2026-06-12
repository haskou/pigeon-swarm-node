# Spike: Private IPFS Relay

Date: 2026-06-09.

## Objective

Verify that a node can fetch private IPFS content by CID from another node in the
same private PSK network, including the case where traffic goes through a
circuit relay.

This spike is about IPFS block transport only. It does not solve the replicated
application index/head layer that tells nodes which CIDs exist.

## Final Result

Private IPFS block transport is validated in the clean branch.

The reproducible E2E test starts three isolated Helia/IPFS runtimes, each with
its own storage folder:

- a private PSK relay;
- a private PSK provider;
- a private PSK requester.

Provider and requester reserve explicit circuit addresses through the relay:

```text
<relayMultiaddr>/p2p-circuit
```

The requester dials the provider circuit multiaddr and fetches content by CID
through private IPFS/Bitswap.

Validated payloads:

- `64 KiB`;
- `1 MiB + 1 byte`, which forces UnixFS multiblock traversal.

Verification command:

```bash
yarn test:e2e:real-transport:private-ipfs-relay
```

Result:

```text
PASS
```

## Implemented Fixes

### PSK Relay Per Private Network

A public, non-PSK relay cannot carry private PSK IPFS traffic. A relay that
serves a private IPFS network must participate in that same PSK network.

The backend now supports a private relay port range:

```dotenv
PIGEON_PRIVATE_RELAY_PORT_START=4100
PIGEON_PRIVATE_RELAY_PORT_END=4199
PIGEON_RELAY_DATA_LIMIT_BYTES=67108864
PIGEON_PUBLIC_HOST=relay.example.com
```

When the range is configured, each private network gets a stable relay port from
the range and starts its own circuit-relay server.

### Bitswap On Limited Connections

`@helia/bitswap` does not preserve all limited-connection options needed for
`/p2p-circuit` traffic in this version. A reproducible `postinstall` patch keeps
Bitswap usable over circuit relay.

The patch applies these changes:

- `libp2p.handle()` receives `runOnLimitedConnection`;
- Bitswap protocol topology receives `notifyOnLimitedConnection`;
- queued Bitswap sends keep `runOnLimitedConnection`;
- internal Bitswap dials keep `runOnLimitedConnection`;
- an existing connection dispatches the internal `peer:connected` event before
  returning, so the wantlist knows the peer is usable.

### UnixFS Multiblock Reads

Single-block content transferred after the limited-connection Bitswap patch, but
UnixFS multiblock content still failed over relay.

Observed failure:

```text
ConnectionClosedError: Remote closed connection during opening
```

The failure appeared when UnixFS loaded sibling child blocks in parallel over a
relay connection. One child block could arrive while another stream failed and
the session then treated the provider as not having the missing block.

For limited connections, backend now reads UnixFS child blocks sequentially:

```text
blockReadConcurrency = 1
```

This is applied only for IPFS runtimes configured as relay/limited-connection
participants.

## Failed Hypotheses

### "The CID Does Not Exist"

Rejected. Production could serve the reference root CID and raw leaf CID over
HTTP. The issue was transport, not missing content.

### "PSK Alone Provides Discovery And Reachability"

Rejected. The same PSK filters which peers can connect, but it does not make a
node behind NAT reachable and does not guarantee Bitswap can transfer blocks.

### "A Public Relay Without PSK Can Carry Private PSK IPFS"

Rejected. Private PSK peers cannot directly use a non-PSK relay for private IPFS
traffic. The relay must participate in the private network or the design needs a
different application-level proxy.

### "Removing Explicit Helia Sessions Fixes Bitswap"

Rejected. Removing `blockstore.createSession(...)` did not fix block transfer.
The final passing path uses a Helia session plus the limited-connection and
UnixFS concurrency fixes.

### "Gossip Can Replace IPFS Block Transport"

Rejected for content. Gossip can announce small events or heads, but private
content bytes must move through private IPFS. The remaining sync problem is the
application index/head layer, not the CID byte transfer path.

## Operational Notes

- Expose the whole private relay port range in Docker/firewall when a node may
  relay multiple private networks.
- Keep `PIGEON_RELAY_DATA_LIMIT_BYTES` above realistic media sizes. The current
  default is `64 MiB`.
- CID fetch timeout remains capped at `10s` while locating/fetching remote
  content.
- The private IPFS relay E2E is intentionally separate from regular API tests
  because it starts real libp2p/Helia runtimes.

## Remaining Work Outside This Spike

IPFS can fetch bytes once the requester knows a CID. It does not answer which
CIDs, heads, messages, keychains, notifications or read markers should exist.

That remaining replicated index/state problem belongs to the next plan phase:
validate OrbitDB first, and only build manual Mongo/event-log repair sync if
OrbitDB is rejected with measured reasons.

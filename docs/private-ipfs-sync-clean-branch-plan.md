# Private IPFS And OrbitDB Clean Branch Plan

This is the current plan.

Related documents:

- PSK relay spike findings:
  [private-ipfs-relay-spike.md](./private-ipfs-relay-spike.md)
- Obsolete relay plan redirect:
  [relay-hybrid-network-plan.md](./relay-hybrid-network-plan.md)

## Objective

Rebuild the current network synchronization work in a clean branch from `main`.
Keep the useful behavior that was validated, remove experimental noise, and
avoid carrying a long history of spike commits and redundant tests.

The target result is:

- private IPFS content can be fetched by CID across nodes;
- private network connectivity works behind NAT through PSK-compatible relays;
- OrbitDB is validated as the primary replicated database candidate;
- manual database sync is implemented only if the OrbitDB spike fails;
- the implementation is small enough to review and operate.

## Explicit Non-Goals

- Do not ship `tmp/` spikes or exploratory scripts.
- Do not ship tests that only prove discarded hypotheses.
- Do not use gossip as the primary large IPFS block transport.
- Do not make public, non-PSK relays carry private PSK traffic.
- Do not keep debug logs at `info` when they are only useful during diagnosis.
- Do not add strange debug-only endpoints or feature-flagged public contracts for
  internal diagnosis.
- Do not push every local commit. Push only when the clean branch is complete
  enough to open the final PR, to avoid wasting GitHub Actions minutes.
- Do not implement manual Mongo/gossip/pull synchronization before validating
  OrbitDB. If OrbitDB works, that sync layer should not exist.
- Do not keep MongoDB as replicated application storage by inertia. Keep it only
  as a temporary compatibility/fallback layer while OrbitDB proves it covers the
  real query and permission requirements.

## Branch Rules

1. Use one clean branch from updated `main`.
2. Do not push intermediate commits.
3. Do not open the PR until every selected phase is implemented and verified.
4. Keep `.env.local`, generated IPFS folders, logs, and `tmp/` out of git.
5. Open one PR with a squash-friendly title.

## Phase 1: Private IPFS Relay Foundation

Goal: restore and clean up only the production behavior required for private IPFS
fetches across nodes.

Before implementing, preserve the existing PSK/relay spike findings in
[private-ipfs-relay-spike.md](./private-ipfs-relay-spike.md). The temporary
scripts and generated data stay out of git, but the verified conclusions must
remain available so the same hypotheses are not tested again later.

Document at least:

- a relay without the private network PSK cannot serve private PSK peers;
- a PSK relay can establish `/p2p-circuit` paths for peers with the same PSK;
- both provider and requester need relay reservations for Bitswap traffic;
- generic `/p2p-circuit` listen addresses were unreliable compared with
  explicit `<relayMultiaddr>/p2p-circuit` reservations;
- Helia/Bitswap limited connections require `runOnLimitedConnection` to survive
  the internal send queue path;
- the default circuit relay data limit is too small for real media and must be
  raised/configured;
- session/provider-aware fetch succeeded for small payloads and `1 MiB`
  payloads through the PSK relay.

### Private Relay Model

The previous assumption that one public relay can serve every private network is
wrong for private IPFS traffic. A private IPFS network uses a PSK. A relay that
does not have that PSK cannot carry those protected connections.

The clean implementation must run one private relay runtime per private network.
Each private relay:

- uses the PSK for exactly one private network;
- listens on one port from a configured range;
- publishes a private relay record encrypted/discoverable only by peers that
  know that private network key;
- signs the record with the private libp2p peer key;
- allows peers to reserve `/p2p-circuit` addresses through that network relay.

### Port Range

Use a range instead of a single relay port:

```env
PIGEON_PRIVATE_RELAY_PORT_START=4100
PIGEON_PRIVATE_RELAY_PORT_END=4199
```

Rules:

- a reachable node assigns one port from the range per private network;
- if the range has fewer available ports than private networks, startup must log
  a clear warning and mark the affected network relay as unavailable;
- the same network should receive a stable port when possible, so restarts do
  not churn records unnecessarily;
- Docker/deployments must expose the whole range when the node is expected to
  relay multiple private networks;
- leaf nodes do not need inbound ports.

`PIGEON_LIBP2P_PORT` remains the direct private IPFS/libp2p port for the node.
The private relay range is for per-network circuit relay servers.

### Relay Records

Private relay records must advertise the PSK-protected private IPFS relay, not a
clear public relay.

Records must include:

- relay/private IPFS peer id;
- dialable relay multiaddrs;
- private IPFS multiaddrs when useful;
- issued/expiry timestamps;
- signature;
- version.

Records must not expose:

- private network key;
- application identity private keys;
- application owner identity;
- private network membership lists;
- frontend user metadata.

Records should be cached locally as fallback data, but cache data is advisory.
Fresh signed records win over stale ones.

### IPFS Fetch Behavior

CID fetch must prefer private IPFS/Bitswap over the private network. Gossip or
custom encrypted content transfer may exist only as fallback and must emit a
warning when used.

Constraints:

- IPFS CID lookup/fetch timeout must not exceed `10s`;
- fetch must use provider-aware sessions when a known peer/provider is available;
- circuit-relay limited connections must be supported;
- relay transfer limits must be large enough for real media, configurable, and
  documented;
- a same-CID request must return from the first successful network/provider
  instead of waiting for all networks.

The current validated Bitswap issue is that the installed Helia/Bitswap version
does not propagate `runOnLimitedConnection` correctly inside one internal queue
path. The clean branch should either:

- patch it reproducibly during install; or
- upgrade to a version that contains the fix, after verifying behavior with the
  private relay E2E.

Suggested commits:

```txt
docs(network): 📝 Record private relay spike findings
fix(ipfs): 🐛 Fetch private content through PSK relays
feat(network): ✨ Run one private relay per network
```

Acceptance:

- private relay E2E passes with two isolated IPFS folders;
- a CID hosted by a remote private-network peer works without waiting for
  database sync;
- the E2E covers a small CID and a CID larger than the default circuit-relay
  `128 KiB` limit;
- IPFS lookup/fetch timeout is capped at `10s`;
- fallback/gossip content transfer logs a warning if used.

## Phase 2: OrbitDB Spike

Goal: decide whether OrbitDB can replace MongoDB as replicated application
storage before implementing any manual sync layer.

OrbitDB is the preferred candidate because it already provides the store types
this project needs:

- `events` for immutable domain event logs;
- `documents` for JSON projections/read models;
- `keyvalue` for heads, cursors, settings and small lookup tables;
- `keyvalue-indexed` when Level-backed indexed key-value access is useful.

The target shape is one OrbitDB namespace per private network:

```txt
private-network/<networkId>/events/domain-events
private-network/<networkId>/documents/identities
private-network/<networkId>/documents/keychains
private-network/<networkId>/documents/communities
private-network/<networkId>/documents/messages
private-network/<networkId>/documents/notifications
private-network/<networkId>/keyvalue/heads
private-network/<networkId>/keyvalue/sync-state
```

The spike must verify:

- two isolated nodes with separate local folders;
- one private PSK network;
- relay-assisted connectivity;
- `events` replication for domain events;
- `documents` replication for JSON read models;
- `keyvalue` replication for heads/cursors;
- write access control scoped to the private network;
- message create/edit/read-marker flows;
- community invite or membership-request flow;
- restart and catch-up behavior;
- query viability for current API patterns:
  - latest identity/keychain by id;
  - channel/conversation message timeline;
  - unread/read marker lookup;
  - notifications by identity;
  - invites/membership requests by community and identity.

Suggested commit:

```txt
spike(db): 🧪 Validate OrbitDB replicated stores
```

Acceptance:

- OrbitDB spike proves replicated `events`, `documents` and `keyvalue` stores
  across two isolated nodes on the same private relay path;
- OrbitDB-originated domain events create/update document/keyvalue projections
  and emit the equivalent WebSocket projections;
- there is a written decision:
  - proceed with OrbitDB storage; or
  - reject OrbitDB for specific measured reasons.

## Phase 3A: OrbitDB Path

Run this phase only if Phase 2 succeeds.

Goal: move replicated application state to OrbitDB stores and avoid building a
manual Mongo/gossip/pull sync layer.

Rules:

- OrbitDB `events` is the replicated domain event log;
- OrbitDB `documents` stores replicated JSON read models;
- OrbitDB `keyvalue` stores heads, cursors, settings and small lookup tables;
- MongoDB is removed from replicated application state or kept only for
  documented temporary compatibility gaps;
- local runtime state remains local and does not need replication.

The clean branch must verify that these are represented in OrbitDB events and
projected into the relevant document/keyvalue stores:

- identities;
- keychains;
- communities;
- community messages and reactions;
- conversation messages and reactions;
- read receipts / read markers;
- notifications;
- community invites;
- membership requests;
- IPFS replication metadata.

Whether an event originates from local HTTP, OrbitDB replication, or repair
logic, the backend must process it through the same application path:

- validate and deserialize the event contract;
- apply the corresponding idempotent consumer/use case;
- create or update the required OrbitDB document/keyvalue projections;
- publish the equivalent local domain event or WebSocket projection so connected
  frontend clients see the same realtime behavior as on the origin node.

The frontend must not need to know whether an update came from local HTTP,
OrbitDB replication, private GossipSub, relay-assisted GossipSub, or repair
logic.

Suggested commits:

```txt
feat(db): ✨ Store replicated state in OrbitDB
fix(sync): 🐛 Project replicated events to websocket clients
```

Acceptance:

- read markers, notifications and invites are synchronized across nodes through
  OrbitDB replication;
- OrbitDB-replicated domain events create/update document/keyvalue projections
  and emit equivalent WebSocket projections;
- current API reads can be served from OrbitDB-backed read models or explicitly
  documented temporary compatibility adapters;
- MongoDB is not a parallel source of truth for replicated data.

## Phase 3B: Manual Sync Fallback

Run this phase only if Phase 2 fails.

Goal: use MongoDB event logs plus pull-based repair sync as fallback. Do not
build this before OrbitDB has been rejected with measured reasons.

Fallback model:

- MongoDB stores a durable `domain_events` collection;
- gossip is only a lightweight wake-up/head-announcement channel;
- bulk synchronization happens through pull/catch-up by cursor;
- MongoDB projections are rebuilt locally from events;
- repair sync runs when a private network becomes usable, not just at process
  startup.

Repair sync triggers:

- a private IPFS network connects to a relay;
- a private IPFS network gets its first connected peer after being empty;
- a new private relay record is discovered and successfully dialed;
- a network transitions from not-ready to ready;
- a new network is added locally.

Repair sync priority:

1. identities;
2. keychains;
3. communities and channels metadata;
4. invites and membership requests;
5. read markers and notifications;
6. conversations metadata;
7. community messages/reactions;
8. conversation messages/reactions;
9. IPFS replication metadata.

Repeated repair sync must be debounced per network. It should run after useful
connectivity changes, not spam every scheduler tick.

Suggested commit:

```txt
fix(sync): 🐛 Repair replicated state by event cursor
```

Acceptance:

- fallback decision references the failed OrbitDB criteria;
- gossip does not carry bulk database synchronization;
- pull/catch-up is cursor-based and idempotent;
- read markers, notifications and invites are synchronized across nodes.

## Phase 4: Runtime And Bootstrap Refactor

Goal: clean up application composition after the chosen data path is clear.

`index.ts` must stop constructing application behavior directly with many
manual `new` calls.

Target shape:

- app runtimes live under app-level `runtimes/` folders;
- consumers are discovered/composed from app-level consumer modules;
- schedulers are discovered/composed from app-level scheduler modules;
- bootstrap wires runtimes, consumers, schedulers, logs, HTTP and DI only;
- use cases are invoked by routes, consumers, schedulers or runtimes, not by
  `index.ts` directly.

`PublicRelayRuntime` should not live as a shared infrastructure god object. Move
runtime orchestration to the app layer. Keep only genuinely reusable adapters in
shared infrastructure.

Suggested commit:

```txt
refactor(runtime): ♻️ Move network runtimes out of bootstrap
```

## Phase 5: Infrastructure Naming Cleanup

In infrastructure code, if a method is a getter, name it as a getter.

Examples:

- `getRelayDataLimitBytes()`
- `getPrivateNetworkPeerPrivateKey()`
- `getRelayDebugState()`

This is allowed even if excessive getters are a design smell in domain code. The
domain model should still expose behavior, but infrastructure adapters often
need explicit read methods for external systems, configuration and diagnostics.

## Phase 6: Observability

Do not add extra public debug endpoints behind flags unless there is a concrete
product/admin use case. Prefer enriching existing node/peer/status resources with
safe fields that are useful for normal operation.

Safe fields for existing resources:

- local peer id;
- network id only where already authorized/expected;
- relay enabled/disabled;
- relay advertised/not advertised;
- number of discovered relay records;
- number of connected peers;
- sanitized multiaddr counts;
- timeout/fallback status;
- last sync summary.

Do not expose by default:

- full multiaddrs;
- cached relay records;
- relay discovery errors;
- per-peer protocol details.

If any of those are truly needed, gate them behind existing admin/owner
authorization, not a generic debug flag that changes public API shape.

Logs:

- `info`: runtime started, relay advertised, sync summary when something was
  actually applied, degraded/fallback state changes;
- `warn`: IPFS fallback content transfer, relay range exhausted, invalid signed
  records, sync repeatedly failing;
- `debug`: DHT misses, discovery polling, per-record skips, per-peer attempts,
  scheduler ticks. These logs must stay out of `info`.

## Phase 7: Tests

Keep small tests that protect production behavior:

- OrbitDB store replication with:
  - two isolated nodes;
  - separate folders;
  - one private PSK network;
  - relay-assisted connectivity;
  - `events` domain log replication;
  - `documents` JSON projection replication;
  - `keyvalue` head/cursor replication;
  - restart and catch-up;
- relay record signing and verification;
- relay record registry parsing, fallback and expiration;
- private relay directory encryption/discovery;
- node/network debug view models;
- Bitswap over PSK circuit relay with:
  - two isolated nodes;
  - separate folders;
  - one private network relay;
  - small CID;
  - CID larger than the default circuit-relay `128 KiB` limit;
  - hard timeout below CI limits.

Add sync tests for the selected path:

- read receipts/read markers;
- notifications;
- community invites;
- membership requests.

Do not keep:

- tests that run full app startup repeatedly just to prove a networking guess;
- tests that depend on public internet routing;
- tests that sleep for long periods;
- broad E2E batteries without explicit timeout limits.

Suggested commits:

```txt
test(network): ✅ Cover private relay and storage replication
```

## Phase 8: Documentation

Update:

- `docs/INSTALLATION.md`
- `docs/p2p-communication.md`
- `docs/relay-hybrid-network-plan.md` or replace it with the final topology
  document if it conflicts with this plan.

Documentation must explain:

- one reachable port per reachable libp2p instance;
- one private relay per private network;
- relay port range envs;
- leaf vs reachable vs relay-capable behavior;
- why public non-PSK relays cannot carry private PSK traffic;
- how OrbitDB stores map to application data:
  - `events` for domain event logs;
  - `documents` for replicated JSON read models;
  - `keyvalue` for heads, cursors and settings;
- how relay records are signed and scoped;
- how to verify peers;
- how to verify CID fetch;
- how to interpret fallback warnings;
- max `10s` IPFS fetch timeout.

Suggested commit:

```txt
docs(network): 📝 Document private IPFS and OrbitDB topology
```

## Final Acceptance Criteria

- `yarn lint` passes.
- `yarn build` passes.
- Focused relay unit tests pass.
- Focused storage replication tests pass.
- Private relay E2E passes with two isolated IPFS folders.
- Fetching a CID hosted by a remote private-network peer works without waiting
  for database sync.
- OrbitDB path is implemented, or manual sync fallback is implemented only after
  a documented failed OrbitDB spike.
- Read markers, notifications and invites are synchronized across nodes through
  the selected path.
- Replicated domain events create/update projections and emit equivalent
  WebSocket projections.
- Logs at `info` are not spammy.
- PR contains only production code, useful tests and docs.

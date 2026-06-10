# Private IPFS And OrbitDB Clean Branch Plan

This is the current plan.

Related documents:

- PSK relay spike findings:
  [private-ipfs-relay-spike.md](./private-ipfs-relay-spike.md)
- OrbitDB private sync spike findings:
  [orbitdb-private-sync-spike.md](./orbitdb-private-sync-spike.md)

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

## Completed Baseline In This Branch

- CI jobs have a `30` minute timeout so failing real-transport checks cannot run
  indefinitely.
- Private IPFS block transport is validated through a PSK circuit relay. A node
  that knows a CID can fetch its bytes from another private-network node through
  IPFS/Bitswap.
- The private IPFS relay spike was reduced to final evidence and negative
  findings, not implementation noise.
- OrbitDB was validated as the replicated application storage candidate for
  private-network `events`, `documents` and `keyvalue` stores.
- Private IPFS pubsub and OrbitDB sync require relay-limited connection support
  when stores replicate over `/p2p-circuit`.

The remaining plan starts after block transport. IPFS moves bytes once a CID is
known; it does not provide the replicated application index/head layer.

## Explicit Non-Goals

- Do not ship `tmp/` spikes or exploratory scripts.
- Do not ship tests that only prove discarded hypotheses.
- Do not use gossip as the primary large IPFS block transport.
- Do not use gossip to replicate IPFS bytes. Gossip may announce that a head or
  CID changed, but the content behind that CID must move through private IPFS.
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

## Completed Phase 1: OrbitDB Spike

Decision: proceed with OrbitDB as the replicated application storage candidate.

The detailed evidence is in
[orbitdb-private-sync-spike.md](./orbitdb-private-sync-spike.md).

Goal: decide whether OrbitDB can replace MongoDB as replicated application
storage before implementing any manual sync layer. This has been validated for
the spike scope.

The completed private IPFS relay phase already proves the content path: if a
node knows a CID, it can fetch the bytes through private IPFS over a PSK relay.
The remaining problem is not block transport; it is the replicated
index/event/head layer that tells nodes which CIDs and projections exist.

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

The spike verified:

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
- deterministic store names generate the same OrbitDB addresses on both nodes;
- private IPFS pubsub works on relay-limited connections when gossipsub is
  configured for limited connections;
- OrbitDB heads sync works on relay-limited connections with the compatibility
  patch documented in the spike findings.

Suggested commit:

```txt
spike(db): 🧪 Validate OrbitDB replicated stores
```

Acceptance evidence:

- OrbitDB spike proves replicated `events`, `documents` and `keyvalue` stores
  across two isolated nodes on the same private relay path;
- OrbitDB-originated domain events create/update document/keyvalue projections
  and emit the equivalent WebSocket projections;
- written decision: proceed with OrbitDB storage.

## Phase 2A: OrbitDB Path

Selected next phase.

Goal: move replicated application state to OrbitDB stores and avoid building a
manual Mongo/gossip/pull sync layer.

Rules:

- OrbitDB `events` is the replicated domain event log;
- OrbitDB `documents` stores replicated JSON read models;
- OrbitDB `keyvalue` stores heads, cursors, settings and small lookup tables;
- MongoDB must be removed from replicated application state. Do not add new
  Mongo fallback paths to keep the old storage model alive;
- any already existing Mongo-backed API path must be treated as code to replace
  with an OrbitDB-backed repository/query service, not as a compatibility layer
  to maintain;
- durable product state that must be shared across nodes belongs in synchronized
  OrbitDB stores;
- state that is genuinely node-local may remain local and unsynchronized when
  this plan classifies it that way. Environment/configuration-provider values
  are runtime configuration and must not be copied into a database.

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
- content replication metadata.

Community invite link state is represented by replicated domain events:

- `communities.v1.invite.was_created`
- `communities.v1.invite.was_accepted`

Those events project into the shared `requests` document store with
`kind: community_invite`, so invite creation and usage counts are not only
local document writes.

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
- current API reads for replicated state are served from OrbitDB-backed read
  models;
- MongoDB is not a parallel source of truth for replicated data.

## Phase 2A.1: Full MongoDB Replacement

Goal: remove MongoDB from the product entirely. Phase 2A moves the first
replicated state slice to OrbitDB. Phase 2A.1 finishes the storage migration by
replacing every remaining Mongo-backed repository with either synchronized
OrbitDB-backed state or an embedded node-local repository, depending on the
classification below. Then MongoDB can be removed from dependencies, docker and
installation docs.

This phase exists because replacing MongoDB must not keep an external database
service around. Shared product state synchronizes through OrbitDB. Explicitly
local state is stored through one embedded node-local database adapter shared by
all local repositories. Prefer a NoSQL/key-value embedded database; SQLite is
acceptable only if it is chosen as the single local database for the whole
phase. Do not mix several local databases, and do not use raw-file JSON
persistence.
Environment/configuration-provider values are read directly at runtime and are
not persisted to OrbitDB or any other database.

Rules:

- no production API path may depend on MongoDB;
- no domain/application repository may have a MongoDB implementation;
- no route, consumer, scheduler, runtime or application service may instantiate
  storage directly;
- keep using domain repositories and DI contracts; do not introduce generic
  OrbitDB stores into application/domain code;
- durable product state that must be shared across nodes uses synchronized
  OrbitDB repositories and domain events;
- durable local state is allowed when the state is explicitly node-local,
  device-local, private draft/cache state, or technical TTL/idempotency state;
- durable local state must use an embedded node-local repository that does not
  require dockerizing another service. Choose exactly one local database adapter
  for the phase, for example LMDB, LevelDB, SQLite, or local non-network
  OrbitDB. Prefer NoSQL/key-value over SQL, but do not mix multiple local
  databases. Every option must stay behind the proper domain/application
  repository contract;
- durable node-local bootstrap/configuration state is allowed to remain local
  and unsynchronized when managed by the application: node owner and local
  network definitions;
- node-local capabilities may remain local and unsynchronized. Push
  subscriptions are node capabilities: each node may or may not support push
  notifications, and subscriptions registered on one node are not synchronized
  to other nodes;
- durable local exceptions use a node-local configuration/capability repository,
  backed by the single selected embedded local database adapter. They must not
  use MongoDB, raw-file persistence, or any external database service;
- environment/configuration-provider values are not database state. Bind/public
  addresses, relay port ranges, debug flags, bootstrap hints and similar
  operator-provided values stay in env/configuration providers and must not be
  written to OrbitDB;
- every other durable local exception must be documented in this phase before
  implementation;
- technical caches, nonces and rate limits may be persistent local state when
  that improves behavior across restarts. They remain unsynchronized unless a
  concrete distributed abuse-control/product requirement is added;
- bootstrap configuration required to discover/open networks may come from
  environment variables, configuration providers, or APIs, but it must not
  become an unsynchronized application database;
- delete MongoDB only after all usages are gone from source, tests,
  dependencies, docker and docs.

Remaining Mongo-backed areas to replace:

- node metadata, local networks and peer cache;
- call state and call history;
- identity presence;
- notification settings;
- push subscriptions and push delivery diagnostics;
- polls and poll votes;
- sticker packs, user sticker library, favorites and recent stickers;
- conversation pins and drafts;
- community channel pins and drafts;
- community moderation logs;
- content replication status summary;
- processed-domain-event/idempotency guard;
- link preview cache and rate limiter;
- HTTP auth nonce storage;
- node network data cleanup paths that currently delete Mongo collections.

Durability and replication classification:

- node owner and application-managed local network definitions are local durable
  bootstrap/configuration. They are node-owned, unsynchronized and not product
  state shared with peers. Store them through a node-local configuration
  repository;
- environment/configuration-provider values are not database state. Bind/public
  addresses, relay port ranges, debug flags, bootstrap hints and
  operator-controlled settings stay in env/configuration providers and are not
  persisted;
- peer cache is persistent local runtime observation. It should be updated from
  libp2p/relay discovery/current connections and stored in an embedded
  node-local repository. If a future peer record is required for other nodes to
  discover/connect, model that as an explicit synchronized relay/peer record,
  not as a local peer cache;
- call state and call history are product state and should use synchronized
  OrbitDB repositories. Realtime call signaling remains ephemeral transport
  state and should not be persisted as history;
- identity presence is synchronized current state with expiration/TTL semantics.
  It should not become durable history. Offline is derived when heartbeat/current
  presence expires;
- notification settings are user-visible product state and should use
  synchronized OrbitDB repositories;
- push subscriptions and push delivery diagnostics are local durable node
  capability state. They are not synchronized because each node may or may not
  provide push notifications. Store them through an embedded node-local
  capability repository;
- polls and poll votes are product state and should use synchronized OrbitDB
  repositories;
- sticker packs, sticker metadata, user sticker libraries, favorites and recent
  stickers are product/user-visible state and should use synchronized OrbitDB
  repositories. Sticker binary assets continue to live in IPFS;
- conversation pins and community channel pins are product state and should use
  synchronized OrbitDB repositories;
- drafts are persistent private user state and are not synchronized. Store them
  through an embedded node-local repository;
- community moderation logs are product state and should use synchronized
  OrbitDB repositories;
- content replication metadata is synchronized product/runtime policy state.
  Replication status summaries are persistent local derived views and should be
  stored in an embedded node-local repository or recomputed from OrbitDB/runtime
  state;
- processed-domain-event/idempotency state is persistent local technical state.
  It should be stored in an embedded node-local repository unless the projector
  can derive idempotency safely from replicated event ids alone;
- link preview cache and rate limiter state are persistent local technical
  state. Cache entries and rate-limit windows should use an embedded node-local
  repository unless a concrete distributed abuse-control requirement is added;
- HTTP auth nonce storage is persistent local technical TTL state and should use
  an embedded node-local repository;
- node network data cleanup must delete network-scoped OrbitDB/IPFS state. It
  must not depend on Mongo collection cleanup once this phase is complete.

Implementation order:

1. Replace technical local repositories first: auth nonce, processed events,
   link preview cache/rate limiter, peer cache and replication status summary,
   using an embedded node-local repository.
2. Replace node metadata: keep node owner and application-managed local network
   definitions as local durable bootstrap/configuration; keep
   environment/configuration-provider values out of every database; then move
   peer/product-visible network state to synchronized OrbitDB or keep it in the
   local peer cache if it is only runtime observation.
3. Replace user/session state: keep push subscriptions as local durable node
   capability state; keep drafts as persistent local private state; move
   presence to synchronized current-state repositories with TTL/expiration
   semantics; move notification settings to synchronized OrbitDB repositories.
4. Replace feature state: calls, polls, stickers, pins, drafts and moderation
   logs.
5. Remove MongoDB infrastructure, package dependency, environment variables,
   docker service and installation references.
6. Regenerate/update diagrams and docs so MongoDB is not presented as a runtime
   dependency.

Acceptance:

- `rg "Mongo|mongodb|MONGO_URL" src tests config docker-compose.yml Dockerfile
  package.json docs` has no production MongoDB dependency left, except explicit
  historical notes if intentionally kept;
- `package.json` and lockfile no longer include the `mongodb` dependency;
- Docker and installation docs no longer require a MongoDB service;
- no replacement local persistence requires Docker or an external database
  service;
- the storage stack has only two persistence technologies: synchronized OrbitDB
  for shared product state and one selected embedded local database for
  unsynchronized local state;
- all previous Mongo-backed API behavior is preserved or deliberately
  reclassified with a documented product decision;
- every durable unsynchronized local repository is explicitly classified as
  node configuration, node capability, private user draft/cache state, runtime
  cache, TTL state, idempotency guard, or derived summary;
- product state that must be shared across nodes is synchronized through
  OrbitDB;
- environment/configuration-provider values are read at runtime and are not
  persisted to OrbitDB or any replacement database;
- APIs that need durable application state either operate against synchronized
  OrbitDB stores or return a clear not-ready/error state until the relevant
  network/store exists;
- replicated data still syncs through OrbitDB and emits equivalent websocket
  projections;
- deleting a network cleans the relevant network-scoped OrbitDB/IPFS state
  without touching identities or data that belong to other networks;
- `yarn lint`, `yarn build`, `yarn test:unit`, `yarn test:api`,
  `yarn test:consumer`, focused OrbitDB tests and real-transport OrbitDB/IPFS
  tests pass.

Suggested commits:

```txt
refactor(db): ♻️ Replace Mongo stores with embedded repositories
refactor(db): ♻️ Remove MongoDB runtime dependency
docs(db): 📝 Document MongoDB-free storage
```


## Phase 4: Infrastructure Naming Cleanup

In infrastructure code, if a method is a getter, name it as a getter.

Examples:

- `getRelayDataLimitBytes()`
- `getPrivateNetworkPeerPrivateKey()`
- `getRelayDebugState()`

This is allowed even if excessive getters are a design smell in domain code. The
domain model should still expose behavior, but infrastructure adapters often
need explicit read methods for external systems, configuration and diagnostics.

## Phase 5: Observability

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

## Phase 6: Tests

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

## Phase 7: Documentation

Update:

- `docs/INSTALLATION.md`
- `docs/p2p-communication.md`
- the final topology document if this plan becomes implementation guidance.

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

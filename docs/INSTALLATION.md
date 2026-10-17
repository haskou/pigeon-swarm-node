# Installation and Environment Variables

This document explains how to run `pigeon-swarm-node` locally and how
environment variables are interpreted.

For the complete self-hosted app image that composes frontend and backend, use
[`haskou/pigeon-swarm`](https://github.com/haskou/pigeon-swarm). This repository
is the backend node source; the standalone frontend source lives in
[`haskou/pigeon-swarm-ui`](https://github.com/haskou/pigeon-swarm-ui).

## Quick Start

1. Install dependencies (if you don't use docker):

```bash
yarn
```

2. Create a `.env` file in the project root (example):

```dotenv
NODE_ENV=development
API_PORT=3000
ROUTE_PREFIX=/api
IPFS_STORAGE_PATH=./ipfs_storage
TRANSPORT_DSN=in-memory
SERVICE_NAME=pigeon-swarm
```

3. Start the app with `yarn local` or `docker compose up`

## Startup Failures

If initialization fails (for example an invalid environment value, an `API_PORT` already in use by another process, which logs `API server could not listen on port <port>`, or an unwritable `IPFS_STORAGE_PATH`), the node logs `Application error`, stops the services it already started on a best-effort basis (at most 10 seconds), and exits with status `1`. Container restart policies such as Docker `on-failure` act on that status. Fix the reported error before starting the node again.

## Resetting the Node Owner

The node owner is the identity that claimed the node with `PUT /node/owner`. If its key is lost, no one can sign as the owner again, so the node operator hands the node to a new owner on the host:

1. Pick the new owner: an identity whose key you hold. You need its identity id, the base64 public key without the PEM header and footer. It must differ from the current owner.
2. Stop the node. The command opens the local database at `PIGEON_LOCAL_DB_PATH`, which a running node keeps locked; while the node runs it prints `Owner reset failed: The local database at <path> is in use by another process, such as a running node.`, changes nothing and exits with status `1`.
3. From a checkout, run `yarn build` once, then `yarn node:reset-owner <new owner identity id>` with the same `PIGEON_LOCAL_DB_PATH` as the node. In a container built from the `final` target, run it in a one-off container with the node's volumes and environment. With the bundled `docker-compose.yml`, stop the backend and run `docker compose run --rm backend sh -c "yarn build && yarn node:reset-owner <new owner identity id>"`.
4. Start the node. The new owner already owns it: only that identity can sign owner requests, and a `PUT /node/owner` from any other identity is refused. The node is never unclaimed, so there is no window in which someone else could claim it. Registration is `open` again, so if the node was `codes` or `closed`, the new owner sets the mode again with `PUT /node/registration` right after the start.

The command refuses, changes nothing and exits with status `1` when the new owner is missing, is not an identity id, or already owns the node, and when no node has run on the local database yet. Otherwise it installs the new owner, clears only the old owner's settings and prints each one it cleared:

- the previous node owner;
- the registration mode, back to `open`, and every registration code;
- the node's own block list and whether it is published;
- every adopted block source, with its pending and approved entries;
- the local block exceptions.

It keeps the node id, networks, relay configuration, identities, content and keys. It also keeps the highest list version accepted from each block publisher: that is anti-rollback state, not an owner setting, and holds only public publisher ids and version numbers, so if the new owner adopts the same publisher again an older or captured list of it still cannot be replayed to lift blocks. It needs no confirmation flag: naming the new owner is the confirmation. Check the id before running it: a valid id whose key nobody holds leaves the node with an owner no one can sign as, and the reset has to be run again.

To start over instead, stop the node and delete the `PIGEON_LOCAL_DB_PATH` folder. The node then starts with a new node id and no owner, networks, relay configuration or other local data, while the IPFS peer key under `IPFS_STORAGE_PATH` survives. Such a node is unclaimed, like a new installation: claim it with `PUT /node/owner` before anyone else can reach the API.

## Frontend Static Assets

The backend can serve static files from the root `public/` directory. This is
where a built frontend can be placed when packaging a single deployable app.

`public/` is intentionally ignored by git in this repository. Treat it as a
runtime/build artifact, not backend source. For local backend development it can
be empty; API routes and Swagger still work normally. For combined frontend +
backend deployments, prefer the Docker Compose/image repository:
[`haskou/pigeon-swarm`](https://github.com/haskou/pigeon-swarm).

If `ROUTE_PREFIX` is configured, HTTP requests under that prefix go to the API.
Other paths can be served from `public/` so browser refreshes and direct frontend
routes resolve to the bundled frontend.

Files served from `public/`, including the `index.html` fallback, carry
`Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`
(no other site can frame the client), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer` and
`Permissions-Policy: camera=(self), microphone=(self), display-capture=(self), geolocation=()`.
The client's own Content Security Policy is a meta tag in `index.html`, where
`frame-ancestors` has no effect. API responses do not get these headers. A
reverse proxy in front of the node should keep them.

## Core Variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | `local` | No | Runtime mode. `test` shortens the default IPFS content timeout to 500 ms and turns off the public relay record registry unless `PIGEON_PUBLIC_RELAY_RECORDS_PATH` is set. |
| `API_PORT` | `8080` | No | HTTP port for API server. |
| `API_TRUST_PROXY` | `false` | No | How the node reads a client's address for `request.ip`. The mailbox creation limit, the identity admission limit (`IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE`) and the signed-request replay guard's per-address cap on its stranger share all key on it. `false` uses the socket address and ignores `X-Forwarded-For`. `loopback`, or a hop count such as `1` behind one reverse proxy, trusts the forwarded address. When it is set, make `API_PORT` reachable only through that proxy (bind it to loopback or firewall it): with a hop count, any client that reaches the node directly sets `X-Forwarded-For` itself and escapes every per-address limit; with `loopback`, any process on the same host can. `true` is refused at boot, so clients cannot pick their own key. |
| `ROUTE_PREFIX` | unset (no prefix) | No | Route prefix for API endpoints, for example `/api`. |
| `CONTAINER_BUILD` | `false` | No | Source runs only: autowires DI from TypeScript sources. Compiled builds (`dist/`) cannot read sources, so they ignore it and load the committed `config/container/services.yaml`. Regenerate that file with `CONTAINER_BUILD=true`; `tests/unit/config/ServicesYamlGeneration.spec.ts` fails when the committed file no longer matches a fresh generation. |
| `PIGEON_LOCAL_DB_PATH` | `<project root>/local_storage` | No | Local embedded storage folder. |

## Logging Variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `LOG_LEVEL` | App internal default | No | Log level (`error`, `warn`, `info`, etc.). |
| `LOG_URL` | `logs` | No | Log folder under the project root; file is `<SERVICE_NAME or service>.log`. |
| `SERVICE_NAME` | unset | Recommended | Service name used in logs and message bus metadata. |

Content-retrieval diagnostics are not configured through the environment. The
node owner opens a diagnostics session with explicit consent through
`PUT /node/diagnostics` (see [API](api.md)). The session records for 1 to 60
minutes, keeps at most 1000 redacted lines in memory only, and is discarded 60
minutes after it closes, on `DELETE /node/diagnostics`, or on restart. Lines are
never written to the log file. CIDs, provider and sender IDs are replaced by
digests keyed with a secret generated at process start, so the export holds no
raw identifiers and can be shared.

## Message Bus Variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `TRANSPORT_DSN` | `in-memory` | Recommended | Message bus transport. Must start with `in-memory` or `libp2p-gossipsub`. |

## PWA Web Push Variables

Web Push requires VAPID keys. Without them, `GET /push/vapid-public-key`
returns `"enabled": false`, browsers must not call
`pushManager.subscribe`, and backend will not send outbound push notifications.

Generate one key pair per deployment:

```bash
npx web-push generate-vapid-keys
```

Configure the generated values:

```dotenv
PUSH_VAPID_PUBLIC_KEY=<generatedPublicKey>
PUSH_VAPID_PRIVATE_KEY=<generatedPrivateKey>
PUSH_VAPID_SUBJECT=mailto:admin@example.com
```

`PUSH_VAPID_SUBJECT` identifies the service operator to push providers. Use a
real contact email for production.

After changing these values, restart the backend process. In Docker, rebuild or
reinstall dependencies so the runtime contains the `web-push` package:

```bash
docker compose build --no-cache backend
docker compose up -d backend
```

Verify the runtime:

```bash
curl http://localhost:8080/push/vapid-public-key
docker compose exec backend node -e "console.log(require.resolve('web-push'))"
```

The API should return `enabled: true` and the Node command should print the
installed `web-push` module path.

## Calls, Rate Limit and Quota Variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `CALLS_ICE_TRANSPORT_POLICY` | `all` | No | ICE transport policy returned to clients. |
| `CALLS_MAX_DURATION_MS` | `43200000` | No | Maximum call duration (12 hours). |
| `CALLS_RECORD_RATE_LIMIT_PER_MINUTE` | `30` | No | Call record rate limit per minute, charged only for records about to be stored; excess returns `429` with code `429021`. |
| `CALLS_SIGNAL_RATE_LIMIT_PER_MINUTE` | `120` | No | Signal rate limit per call and sender per minute; excess returns `429` with code `429010`. |
| `CALLS_TURN_CREDENTIAL_TTL_SECONDS` | `3600` | No | Lifetime of issued TURN credentials, in seconds. |
| `CALLS_TURN_DISCOVERY_ENABLED` | `true` | No | Enables node-to-node TURN relay discovery. |
| `CALLS_TURN_RECORD_TTL_MS` | `600000` | No | Lifetime of published TURN relay records (ten minutes). Invalid values use the default. |
| `CALLS_TURN_PUBLICATION_INTERVAL_MS` | half of `CALLS_TURN_RECORD_TTL_MS` | No | Interval between TURN relay record publications (five minutes at the default TTL). |
| `CALLS_TURN_TRANSPORTS` | `udp,tcp` | No | Comma-separated TURN transports. |
| `CALLS_TURN_SHARED_SECRET` | unset | For TURN credential issuance | Shared secret matching the TURN servers; see the TURN/coturn setup section below. |
| `IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE` | `30` | No | Identity publications per minute; excess returns `429` with code `429040`. |
| `IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE` | `0` | No | Identity admissions per network per minute; excess returns `429` with code `429041`. |
| `IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE` | `30` | No | Identity admissions per client address per minute on `POST /identities` and `PUT /identities/{identityId}`; excess returns `429` with code `429042`. `0` disables. |
| `NODE_REGISTRATION_CODE_MAX_USES` | `100` | No | Highest `maxUses` the node owner may give a registration code; a larger one returns `400` with code `400070`. Positive integer, otherwise the default. |
| `NODE_REGISTRATION_CODE_MAX_TTL_DAYS` | `30` | No | Furthest ahead, in days, a registration code may expire; a later `expiresAt` returns `400` with code `400070`. Positive integer, otherwise the default. |
| `NOTIFICATIONS_RECORD_RATE_LIMIT_PER_MINUTE` | `30` | No | Notification record writes per minute. |
| `NOTIFICATIONS_MAX_INVITATIONS_PER_IDENTITY` | `10000` | No | Maximum stored invitations per identity. |
| `NOTIFICATIONS_MAX_STATES_PER_IDENTITY` | `30000` | No | Maximum stored notification states per identity. |
| `NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_PAIR` | `4` | No | Maximum pending group invitations listed per (inviter, recipient) pair; extra ones are held back, not deleted. Positive integer, otherwise the default. |
| `NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_RECIPIENT` | `100` | No | Maximum pending group invitations listed per recipient after the per-pair cap; extra ones are held back, not deleted. Positive integer, otherwise the default. |
| `CONTENT_REPLICATION_MAX_RECORDS_PER_IDENTITY` | `10000` | No | Maximum replicated content records per identity. |
| `CONTENT_REPLICATION_QUOTA_BYTES` | `1073741824` | No | Replicated content byte quota (1 GiB). |
| `CONTENT_REPLICATION_NETWORK_BUDGET_BYTES` | `34359738368` | No | Content bytes replication maintenance schedules per network across all owners (32 GiB), shared fairly by owner; responsible replicas beyond it are deferred. A value that is not a positive integer, or is above 2⁵³−1, falls back to the default. |
| `LINK_PREVIEW_RATE_LIMIT_PER_MINUTE` | `30` | No | Link preview requests per minute. |
| `NODE_BLOCK_LIST_BODY_TIMEOUT_MS` | `120000` | No | Longest time `PUT /node/blocks` waits for the whole body once the owner's headers are verified. A slower body gets `408` and frees the single upload slot. Raise it for owners uploading large lists over slow links. |
| `NODE_BLOCK_LIST_MAX_BYTES` | `67108864` | No | Largest node block list body accepted by `PUT /node/blocks` (64 MiB, about 500k ids). The body is read only after the owner's signed headers are verified, and reading stops with `413` as soon as it is larger. The same limit applies to each download of an adopted block source, which stops reading as soon as it is exceeded. Bounds parsing memory and CPU, not stored entries: no list has an entry cap. |
| `NODE_BLOCK_SOURCE_FETCH_INTERVAL_MS` | `3600000` | No | How often each adopted block source is fetched again (1 hour). |
| `NODE_BLOCK_SOURCE_FETCH_TIMEOUT_MS` | `60000` | No | Total time one block source download may take, from connecting to the last byte (60 seconds). A slower download keeps the last valid version. |

## IPFS Variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `IPFS_STORAGE_PATH` | `./ipfs_storage` | Recommended | Base folder used by IPFS registry and local node metadata. |
| `MAILBOX_APPEND_RATE_PER_MINUTE` | `120` | No | Envelopes one mailbox may receive per minute, kept across restarts (`0` disables). Duplicate envelopes are not charged. |
| `MAILBOX_CREATE_RATE_LIMIT_PER_MINUTE` | `30` | No | Mailbox creations one client address may make per minute, keyed by the address `API_TRUST_PROXY` resolves (IPv6 per /64). In memory, reset on restart; `0` disables. |
| `MAILBOX_MAX_BYTES` | `8388608` | No | Pending ciphertext bytes per mailbox (8 MiB). A full mailbox refuses new envelopes. |
| `MAILBOX_MAX_COUNT` | `10000` | No | Mailboxes this node will hold. Past half full, creation needs more proof of work (16 to 20 bits); at the limit, an empty mailbox unread for 7 days may be evicted to make room. |
| `MAILBOX_MAX_ENVELOPES` | `1000` | No | Pending envelopes per mailbox. |
| `MAILBOX_MAX_READERS` | `129` | No | Read capabilities a mailbox may hold, at least 1: the root reader plus one per device. The default admits every device an identity may hold (128). A silent reader holds envelopes until retention expires them; revoke it to free them. |
| `MAILBOX_RETENTION_MS` | `1209600000` | No | Age at which envelopes expire and an unread mailbox is deleted (14 days). |
| `PRIVATE_BLOB_MAX_BYTES` | `52428800` | No | Largest single private blob (50 MiB). |
| `PRIVATE_BLOB_QUOTA_BYTES_PER_OWNER` | `524288000` | No | Live reserved bytes one identity may hold on this node (500 MiB). |
| `PRIVATE_BLOB_QUOTA_BYTES_TOTAL` | `10737418240` | No | Live reserved bytes across all owners on this node (10 GiB). |
| `PRIVATE_BLOB_RETENTION_MS` | `1209600000` | No | How long a completed private blob is kept (14 days). Never less than `MAILBOX_RETENTION_MS`; a lower value is raised to it. |
| `PRIVATE_BLOB_STORAGE_PATH` | `./private_blobs` | No | Local folder for private blob bytes. Never replicated: back it up together with `PIGEON_LOCAL_DB_PATH` (see [private blob store design](design/private-blob-store.md)). |
| `PRIVATE_BLOB_UPLOAD_WINDOW_MS` | `3600000` | No | How long a reservation waits for its upload before it is cleaned up (1 hour). |
| `REALTIME_ALLOWED_ORIGINS` | empty | No | Comma-separated browser origins (for example `https://chat.example.com`) allowed to open the realtime WebSocket. Empty means no Origin restriction. Requests without an `Origin` header (non-browser clients) are never refused by this setting; they still need a valid ticket. Refused upgrades get `403`. |
| `PIGEON_RELAY_RECORD_TTL_MS` | `7200000` | No | Private relay record lifetime. Defaults to 2 hours. |
| `PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS` | `60000` | No | Fallback interval for requesting a private relay record over gossipsub. The initial request is immediate. |
| `PIGEON_RELAY_RECORD_PUBLIC_PEER_WAIT_MS` | `8000` | No | Maximum time to wait for public IPFS peers before publishing or requesting private relay records. Values above 10 seconds are capped. |
| `PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS` | `3600000` | No | How often private relay nodes refresh their public relay record publication after the initial publish. |
| `PIGEON_PRIVATE_RELAY_DIAL_TIMEOUT_MS` | `15000` | No | Maximum time to wait when dialing a discovered private relay multiaddr before logging the failure and retrying later. |
| `PIGEON_RELAY_DATA_LIMIT_BYTES` | `67108864` | No | Per-reservation circuit relay data limit. The default is `64 MiB`, raised above libp2p's small default so media CIDs can move through relay. |
| `IPFS_CONTENT_TIMEOUT_MS` | `2500` (`500` when `NODE_ENV=test`) | No | Time budget for locating and fetching remote IPFS content. Values are capped at `5000`. |
| `PIGEON_IPFS_ROUTING_RECORD_TIMEOUT_MS` | `15000` | No | Timeout for IPFS routing record lookups. |
| `PIGEON_RELAY_DIRECTORY_ROUTING_TIMEOUT_MS` | `15000` | No | Timeout for relay directory routing lookups. |
| `PIGEON_RELAY_RECORD_CONNECTED_DISCOVERY_INTERVAL_MS` | `300000` | No | Relay record discovery interval while connected. |
| `PIGEON_PRIVATE_RELAY_CONNECTED_DISCOVERY_INTERVAL_MS` | `300000` | No | Private relay discovery interval while connected. |
| `PIGEON_PRIVATE_RELAY_CONNECTION_GRACE_MS` | `60000` | No | Grace period for private relay connections. |
| `PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS` | `3600` | No | Private relay record refresh interval, in seconds. |
| `PIGEON_PUBLIC_BOOTSTRAP_ENABLED` | `true` | No | Enables public libp2p bootstrap peers. |
| `PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS` | libp2p default `dnsaddr` bootstrap list | No | Public bootstrap multiaddrs. |
| `PIGEON_PUBLIC_RELAY_RECORDS_PATH` | `${IPFS_STORAGE_PATH}/publicRelayRecords.json` | No | Public relay record registry file. Setting it enables the registry even when `NODE_ENV=test`. |
| `PIGEON_STORED_RELAY_FALLBACK_MS` | `604800000` | No | Stored relay fallback window in milliseconds (7 days). |
| `PIGEON_TURN_RUNTIME_CONFIG_PATH` | `./var/cache/calls-turn-runtime.conf` | No | Generated TURN runtime configuration file. |
| `PUBSUB_TOPIC_PREFIX` | `pigeon-swarm` | No | Prefix for pubsub topic names. |

### Private blob storage in Docker

The `final` image runs as the unprivileged `node` user (uid 1000). Its build
creates `private_blobs`, `local_storage`, `ipfs_storage`, `logs`, `var/log` and
`var/cache` and changes ownership of the data folders to `node`. The `local`
image has no `USER` instruction, and `docker-compose.yml` builds that stage, so
the compose backend runs as root.

- `docker-compose.yml` bind-mounts the checkout at `/var/www` and masks
  `/var/www/var` with an anonymous volume, so the host `var` folder is not used
  by the container. If you run the `final` image with host bind mounts for the
  data folders, create them and give them to uid 1000 before the first start:

  ```bash
  mkdir -p private_blobs local_storage ipfs_storage logs
  sudo chown -R 1000:1000 private_blobs local_storage ipfs_storage logs
  ```

- Data written by an image built before PR #420 (commit `93371dd4`) is
  root-owned. Run the same `chown -R 1000:1000` once before starting the new
  image.

To back up private blobs, stop the node and copy `private_blobs` and
`local_storage` together. Restore semantics are in the
[private blob store design](design/private-blob-store.md).

Private networks and relay ownership settings are no longer configured through
environment variables.

They must be added through the node relay configuration API and are persisted in
local node metadata.

### Private IPFS relay range

Private IPFS networks use a PSK. A relay that does not know that PSK cannot
carry private IPFS traffic, so the backend starts one circuit-relay server per
private network when a relay port range is configured.

Example:

```http
PUT /node/relay-configuration
```

```json
{
  "publicHost": "relay.example.com",
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

Operational rules:

- expose the whole configured port range in Docker/firewall when the node should
  relay more than one private network;
- each private network gets a stable port from the range;
- nodes with `privateRelay.enabled` and `privateRelay.publicationEnabled`
  publish an encrypted private relay record through a private-network-scoped
  gossipsub topic;
- a node requesting that topic receives the current encrypted relay record from
  an active relay over gossipsub; a synthetic CID may be announced and queried
  in the public DHT only to locate the provider peer and has no block payload;
- the relay topic suffix and encrypted payload are derived from the private
  network key, so nodes outside the private network cannot read the relay
  multiaddrs;
- nodes without `privateRelay.enabled` do not start relay servers; they can
  discover private relay records when `privateRelay.discoveryEnabled` is true,
  and can always use `manualRelayMultiaddrs` as an explicit fallback;
- CID fetch over IPFS is bounded by `IPFS_CONTENT_TIMEOUT_MS` (default `2500` ms, capped at `5000` ms) while locating and fetching remote content;
- the public relay-record connection runs DHT, gossipsub and circuit-relay
  transport without HTTP/Bitswap block brokers or persistent block stores, so
  public wantlists cannot turn it into a content cache;
- Helia/Bitswap is patched during install so private relay limited connections
  can transfer blocks through `/p2p-circuit`.

### Calls TURN/coturn setup

Calls use WebRTC ICE, not the libp2p/IPFS circuit relay. The backend does not
embed a TURN server. The `haskou/pigeon-swarm` image runs coturn inside the app
container by default (`PIGEON_TURN_MODE=embedded`). Its opt-in `external-turn`
Compose profile runs coturn as a sidecar sharing the backend network namespace.

The same host-level port range can be reused operationally when the protocols do
not collide. The existing private IPFS relay range is TCP. TURN media relay
ports should usually reuse that numeric range over UDP in coturn, while the TURN
listening port is configured with `callsRelay.port` in
`PUT /node/relay-configuration`.

Example:

```dotenv
CALLS_TURN_SHARED_SECRET=<private-random-secret-from-your-secret-manager>
```

Replace the placeholder with a private random secret. Provision it
through your secret manager or a protected environment file; do not commit it,
print it in logs or pass it in command-line arguments.

Missing, blank and known public shared secrets leave TURN unconfigured: the node
issues no temporary TURN credentials and publishes no local relay records, and it
still starts. Configure each backend issuer and its
advertised coturn server with the same private value and restart both. Rotate
the secret on coturn itself: changing only the backend cannot revoke
credentials accepted by a server using the old key.
Explicit static credentials remain available for locally configured TURN URLs
only; they are not reused for discovered relays.

```http
PUT /node/relay-configuration
```

```json
{
  "publicHost": "relay.example.com",
  "callsRelay": {
    "port": 4101
  },
  "privateRelay": {
    "enabled": true,
    "portStart": 4102,
    "portEnd": 4199
  }
}
```

The backend writes this persisted configuration atomically to
`PIGEON_TURN_RUNTIME_CONFIG_PATH` (default `./var/cache/calls-turn-runtime.conf`). The `haskou/pigeon-swarm` launcher reads `/run/pigeon/calls-turn-runtime.conf` and runs coturn on `callsRelay.port`, reusing the private relay range over UDP.
Publish the configured host range over TCP for IPFS and UDP for TURN; no TURN port, media
range, URL, or ICE policy environment variables are required.

The node-to-node discovery protocol is documented in
[Calls TURN Relay Discovery](calls-turn-relay-discovery.md). Set
`CALLS_TURN_DISCOVERY_ENABLED=false` to disable it.

The ICE endpoint prefers the node's own configured calls relay. A leaf node
without one uses TURN URLs only from the signed record belonging to a circuit
relay to which it is currently connected. Every issuer needs a private
`CALLS_TURN_SHARED_SECRET` matching the TURN servers whose URLs it returns.
The current distributed issuance pool uses one shared private value. Independent
TURN servers do not need matching secrets merely to relay media to each other.

The `haskou/pigeon-swarm` coturn launcher reads `callsRelay.port` and the
persisted private relay range from the runtime configuration file. The router and firewall must still
expose the listener over UDP/TCP and the media range over UDP without
translation. Clients inside the relay's LAN also need NAT loopback or split DNS.
The endpoint uses `iceTransportPolicy=all` by default.

- UnixFS child blocks are read sequentially on limited relay connections to avoid
  parallel stream-open failures over `/p2p-circuit`.

### Dependency compatibility patches

`yarn` runs four idempotent compatibility patches from `postinstall`. They
modify installed dependency files. The network-store shutdown adapter also uses
the OrbitDB replication-cancellation operation installed by its patch.

| Script | Dependency behavior corrected | Why it remains enabled |
| --- | --- | --- |
| `patch-helia-bitswap-limited-connections.js` | Makes Bitswap reuse an existing circuit connection and allow its queues, dials and topology notifications on limited relay connections. | A private node must be able to exchange UnixFS blocks through `/p2p-circuit` without opening a second stream that the relay rejects. |
| `patch-orbitdb-limited-connections.js` | Lets OrbitDB fetch blocks from already-connected peers, exchange heads through limited relay connections, cancel replication reads separately from local writes, and frame every head sent on the heads-sync stream with a 4-byte big-endian length prefix. | Replication must work through circuit relays, and network reconfiguration must preserve accepted local writes while cancelling stalled remote joins. Upstream `@orbitdb/core` 4.0.0 writes heads unframed, so a stream that coalesces or splits chunks fails with `CBOR decode error: too many terminals`. |
| `patch-libp2p-kad-dht-routing-table.js` | Replaces recursive Kademlia routing-table traversal with an iterative traversal that ignores already-visited buckets. | Public IPFS still uses Kademlia for content routing. The patch prevents a malformed or cyclic routing table from monopolizing the Node main thread. Private IPFS and private-relay discovery do not run Kademlia. |
| `patch-libp2p-progress-dispatch.js` | Deduplicates each progress event across the complete graph of joined libp2p queue jobs. | `@libp2p/utils@7.2.4` prevents direct re-entry into one job, but branching Kademlia dial graphs can still deliver one event exponentially and monopolize the Node main thread. The workaround extends the upstream fix from [libp2p/js-libp2p#3485](https://github.com/libp2p/js-libp2p/pull/3485) until the full graph case is fixed upstream. |

The scripts intentionally fail when an upstream dependency changes its source
shape without already containing the expected correction. Treat that failure as
a dependency-review signal: inspect the new implementation, update the patch
and its test, or remove the patch only after verifying that upstream has fixed
the behavior. Do not bypass the failure by making the script silently succeed.

During network replacement, synchronization stops first and the log cancels only
reads belonging to remote joins. Local append reads and block persistence retain
their normal storage signal. OrbitDB then drains the database and log queues
before closing storage. The cancelled log is retired; reopening creates a fresh
replication controller.

`yarn test:integration:network-reconfiguration` exercises real OrbitDB databases
and on-disk Level indexes with a controlled IPFS blockstore. It covers a missing
ancestor, a local write queued behind an incoming sync operation, and a local
block write already in progress. Each scenario reopens the same network stores
and checks both the existing and newly accepted document. This is a shutdown
and persistence regression, not a public NAT or media-connectivity test.

The framed heads protocol is served at `/orbitdb/heads-framed/<address>`.
A frame larger than 16 MiB, or a stream that ends inside a frame, is rejected
and surfaces as a sync `error` event. Nodes running the unframed protocol do
not exchange heads with nodes running this one, so all nodes of a network must
be upgraded together. `yarn test:integration:orbitdb-heads-framing` feeds two
heads to a receiver as a single chunk and asserts both decode without errors.

### Important note about `IPFS_STORAGE_PATH=memory`

`memory` is supported at Helia connection level only when the exact connection option is `storageLocation: 'memory'`.

In the current app flow, `IPFSNetworkRegistry` composes per-network storage as:

- `${IPFS_STORAGE_PATH}/${networkName}`

Because of this, setting `IPFS_STORAGE_PATH=memory` does not activate Helia in-memory mode end-to-end. It is treated as a filesystem folder named `memory`.

`IPFSNetworkRegistry` persists only Helia/libp2p runtime data such as
`shared-peer-private-key.pb` under the storage path. Node metadata and
configured network metadata are stored in the local embedded database.

Practical recommendation:

- Use a real filesystem path in app/runtime environments.
- Use explicit `storageLocation: 'memory'` only in isolated tests or direct connection creation flows.

## Example `.env`

```dotenv
NODE_ENV=development
API_PORT=3000
ROUTE_PREFIX=/api
IPFS_STORAGE_PATH=./ipfs_storage
TRANSPORT_DSN=in-memory
SERVICE_NAME=pigeon-swarm
PUSH_VAPID_PUBLIC_KEY=<generatedPublicKey>
PUSH_VAPID_PRIVATE_KEY=<generatedPrivateKey>
PUSH_VAPID_SUBJECT=mailto:admin@example.com
```

Use `TRANSPORT_DSN=libp2p-gossipsub://` to publish and subscribe through the
standalone libp2p/gossipsub runtime. This runtime is separate from IPFS content
storage.

## Application log privacy

HTTP access logs record the request method and response status alongside the logger timestamp and severity. They exclude URLs, query parameters, headers, cookies, request bodies and response bodies. Private identifiers and bearer capabilities must not be added to access-log messages.

When a domain-event consumer rejects a gossiped event, the node drops the event and logs `Dropped pubsub event: event=<event name> consumer=<consumer queue> error=<error class>`, one line per rejecting consumer; a payload that cannot be decoded (malformed JSON or cleartext on a private network) logs `Dropped pubsub event: event=<event name> stage=decode error=<error class>`. The event name and consumer queue are static code constants. Other pubsub subscribers log only `IPFS pubsub handler failed: error=<error class>` or `PubSub handler failed`, depending on the transport. Publish failures in the shared pubsub transport log only `PubSub publish failed`. Topics, network ids, payload fields and exception text are omitted because topics embed the network id, and exception text can contain identifiers or decrypted message fragments. Subsequent messages continue to be processed. A keychain publication whose keychain is not resolvable yet is not a subscriber failure: its consumers log one debug line without identifiers and complete.

The WebSocket event hub does not log successful registrations, domain-event delivery or recipient fanout, even at debug level. Handler failures retain a fixed operation label and severity, without identity, conversation, channel, event payload, exception text or stack trace. An event whose consumer rejects is withheld from WebSocket clients, and that rejection does not stop delivery of other events. Heartbeats and signal acknowledgements continue after a handler rejection.

Node diagnostics name a caught error only by its class, as `error=<error class>`. Exception messages and stack traces are never logged, because they can carry identity ids, record keys, IPNS names, content identifiers or payload fragments. A failing local domain-event consumer logs `Local domain event handler failed: event=<event name> consumer=<consumer queue> error=<error class>`, a consumer that rejects an event on the in-memory transport logs `Dropped in-memory event: event=<event name> consumer=<consumer queue> error=<error class>`, and a failing scheduled job logs `Error on <process name>: error=<error class>`. A replicated head that a mutation gate rejects logs only `Rejected unauthenticated replicated head`, and a block deletion that cannot traverse a block's links logs only `Skipped IPFS DAG traversal for block deletion`. Call ids, document ids, replicated record and head keys, IPNS names and content identifiers are not logged with these failures. The only exception is a fatal startup failure, which logs its stack trace once before the process exits.

Network diagnostics omit private network ids and names, relay topics, the network-key fingerprint and lookup key, and remote peer ids and addresses. They keep the local peer id, the node's own relay listen and announce addresses, fixed reasons, and counts such as connected peers, providers and relay addresses.

These safeguards apply to newly generated HTTP access logs, the pubsub failure paths described above, the WebSocket event hub, network diagnostics and caught-error diagnostics. They do not remove existing logs or cover every application component: HTTP handler errors that reach the framework's unhandled-error path are logged by `@haskou/ddd-kernel` with their message and, at debug level, their stack. Error categories and timestamps remain observable; the hub still receives routing identities and event content in memory. Reverse-proxy logs, ambient browser cookies and IPFS traffic correlation require separate controls. Log minimization does not conceal the social graph from the selected node operator.

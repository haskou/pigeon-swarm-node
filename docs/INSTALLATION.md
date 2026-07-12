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

## Core Variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` behavior in several modules | No | Runtime mode. Affects error/log verbosity. |
| `API_PORT` | App internal default | No | HTTP port for API server. |
| `ROUTE_PREFIX` | App internal default | No | Route prefix for API endpoints. |
| `CONTAINER_BUILD` | unset | No | Used during DI/container build logic. |

## Logging Variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `LOG_LEVEL` | App internal default | No | Log level (`error`, `warn`, `info`, etc.). |
| `LOG_URL` | unset | No | External logging endpoint, if configured. |
| `SERVICE_NAME` | unset | Recommended | Service name used in logs and message bus metadata. |

## Message Bus Variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `TRANSPORT_DSN` | `in-memory://` fallback in code paths | Recommended | Transport DSN (`in-memory://` or `libp2p-gossipsub://`). |

## PWA Web Push Variables

Web Push requires VAPID keys. Without them, `GET /push/vapid-public-key`
returns `{ "enabled": false, "publicKey": null }`, browsers must not call
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
curl http://localhost:8080/api/push/vapid-public-key
docker compose exec backend node -e "console.log(require.resolve('web-push'))"
```

The API should return `enabled: true` and the Node command should print the
installed `web-push` module path.

## IPFS Variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `IPFS_STORAGE_PATH` | `./ipfs_storage` | Recommended | Base folder used by IPFS registry and local node metadata. |
| `PIGEON_RELAY_RECORD_TTL_MS` | `7200000` | No | Private relay record lifetime. Defaults to 2 hours. |
| `PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS` | `60000` | No | Fallback interval for requesting a private relay record over gossipsub. The initial request is immediate. |
| `PIGEON_RELAY_RECORD_PUBLIC_PEER_WAIT_MS` | `8000` | No | Maximum time to wait for public IPFS peers before publishing or requesting private relay records. Values above 10 seconds are capped. |
| `PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS` | `3600000` | No | How often private relay nodes refresh their public relay record publication after the initial publish. |
| `PIGEON_PRIVATE_RELAY_DIAL_TIMEOUT_MS` | `15000` | No | Maximum time to wait when dialing a discovered private relay multiaddr before logging the failure and retrying later. |
| `PIGEON_RELAY_DATA_LIMIT_BYTES` | `67108864` | No | Per-reservation circuit relay data limit. The default is `64 MiB`, raised above libp2p's small default so media CIDs can move through relay. |

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
  an active relay without querying the public DHT;
- the relay topic suffix and encrypted payload are derived from the private
  network key, so nodes outside the private network cannot read the relay
  multiaddrs;
- nodes without `privateRelay.enabled` do not start relay servers; they can
  discover private relay records when `privateRelay.discoveryEnabled` is true,
  and can always use `manualRelayMultiaddrs` as an explicit fallback;
- CID fetch over IPFS is capped at `10s` while locating/fetching remote content;
- Helia/Bitswap is patched during install so private relay limited connections
  can transfer blocks through `/p2p-circuit`.

### Calls TURN/coturn setup

Calls use WebRTC ICE, not the libp2p/IPFS circuit relay. The backend does not
embed a TURN server; run coturn or an equivalent TURN service separately and let
the backend advertise its reachable URLs.

The same host-level port range can be reused operationally when the protocols do
not collide. The existing private IPFS relay range is TCP. TURN media relay
ports should usually reuse that numeric range over UDP in coturn, while the TURN
listening port is configured with `callsRelay.port` in
`PUT /node/relay-configuration`.

Example:

```dotenv
CALLS_TURN_SHARED_SECRET=shared-coturn-rest-secret
CALLS_TURN_TRANSPORTS=udp,tcp
```

```http
PUT /node/relay-configuration
```

```json
{
  "publicHost": "relay.example.com",
  "callsRelay": {
    "port": 3478
  }
}
```

Coturn must be configured with the same REST secret and a relay media range that
matches the opened UDP range, for example:

```text
use-auth-secret
static-auth-secret=shared-coturn-rest-secret
realm=relay.example.com
listening-port=3478
min-port=4100
max-port=4199
```

Expose the TURN listening port over UDP/TCP and the relay media range over UDP
on the coturn service. Do not map those UDP ports to the backend container unless
coturn is actually running there.

The node-to-node discovery protocol is documented in
[Calls TURN Relay Discovery](calls-turn-relay-discovery.md). Set
`CALLS_TURN_DISCOVERY_ENABLED=false` to disable it.

- UnixFS child blocks are read sequentially on limited relay connections to avoid
  parallel stream-open failures over `/p2p-circuit`.

### Dependency compatibility patches

`yarn` runs three idempotent compatibility patches from `postinstall`. They
modify installed dependency files only; application source remains independent
of those implementation details.

| Script | Dependency behavior corrected | Why it remains enabled |
| --- | --- | --- |
| `patch-helia-bitswap-limited-connections.js` | Makes Bitswap reuse an existing circuit connection and allow its queues, dials and topology notifications on limited relay connections. | A private node must be able to exchange UnixFS blocks through `/p2p-circuit` without opening a second stream that the relay rejects. |
| `patch-orbitdb-limited-connections.js` | Lets OrbitDB fetch blocks from already-connected peers and exchange heads through limited relay connections. | OrbitDB replication must work for nodes that can only reach each other through a circuit relay. |
| `patch-libp2p-kad-dht-routing-table.js` | Replaces recursive Kademlia routing-table traversal with an iterative traversal that ignores already-visited buckets. | Public IPFS still uses Kademlia for content routing. The patch prevents a malformed or cyclic routing table from monopolizing the Node main thread. Private IPFS and private-relay discovery do not run Kademlia. |

The scripts intentionally fail when an upstream dependency changes its source
shape without already containing the expected correction. Treat that failure as
a dependency-review signal: inspect the new implementation, update the patch
and its test, or remove the patch only after verifying that upstream has fixed
the behavior. Do not bypass the failure by making the script silently succeed.

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

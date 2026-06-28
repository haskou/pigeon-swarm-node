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
| `PIGEON_RELAY_ENABLED` | unset | No | Optional private relay toggle. Leave unset or set `true` to allow relay startup when a port range exists. Set `false` to force-disable private relay startup. |
| `PIGEON_PRIVATE_RELAY_PORT_START` | unset | No | First TCP port in the private PSK circuit-relay range. When unset, private networks do not start relay servers. |
| `PIGEON_PRIVATE_RELAY_PORT_END` | unset | No | Last TCP port in the private PSK circuit-relay range. Must be greater than or equal to `PIGEON_PRIVATE_RELAY_PORT_START`. |
| `PIGEON_PRIVATE_RELAY_BOOTSTRAP_MULTIADDRS` | unset | No | Optional fallback. Comma- or newline-separated private relay multiaddrs to dial when public relay record discovery has not found a relay yet. Each value must be a full libp2p multiaddr, including `/p2p/<peerId>`. |
| `PIGEON_RELAY_RECORD_TTL_MS` | `600000` | No | Private relay record lifetime. Defaults to 10 minutes. |
| `PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS` | `15000` | No | How often private networks refresh public relay record discovery. |
| `PIGEON_RELAY_RECORD_PUBLIC_PEER_WAIT_MS` | `8000` | No | Maximum time to wait for public IPFS peers before publishing or discovering private relay records. Values above 10 seconds are capped. |
| `PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS` | `PIGEON_RELAY_RECORD_TTL_MS / 2` | No | How often relay nodes refresh their public relay record publication after the initial publish. |
| `PIGEON_PRIVATE_RELAY_DIAL_TIMEOUT_MS` | `15000` | No | Maximum time to wait when dialing a discovered private relay multiaddr before logging the failure and retrying later. |
| `PIGEON_RELAY_DATA_LIMIT_BYTES` | `67108864` | No | Per-reservation circuit relay data limit. The default is `64 MiB`, raised above libp2p's small default so media CIDs can move through relay. |
| `PIGEON_PUBLIC_HOST` | unset | Required for public relay advertising | Public DNS name used in announced private relay multiaddrs when the node is reachable from other hosts. |

Private networks are no longer configured through environment variables.

They must be added through application methods/use cases (for example, node network management flows) and are persisted in storage metadata.

### Private IPFS relay range

Private IPFS networks use a PSK. A relay that does not know that PSK cannot
carry private IPFS traffic, so the backend starts one circuit-relay server per
private network when a relay port range is configured.

Example:

```dotenv
PIGEON_PRIVATE_RELAY_PORT_START=4100
PIGEON_PRIVATE_RELAY_PORT_END=4199
PIGEON_RELAY_ENABLED=true
PIGEON_RELAY_DATA_LIMIT_BYTES=67108864
PIGEON_PUBLIC_HOST=relay.example.com
```

Leaf node bootstrap example:

```dotenv
PIGEON_PRIVATE_RELAY_BOOTSTRAP_MULTIADDRS=/dns4/relay.example.com/tcp/4100/p2p/12D3KooWRelayPeerId
```

Operational rules:

- expose the whole configured port range in Docker/firewall when the node should
  relay more than one private network;
- each private network gets a stable port from the range;
- nodes with a relay range publish an encrypted private relay record through the
  public IPFS routing layer for each private network;
- the relay record lookup key and encrypted payload are derived from the private
  network key, so nodes outside the private network cannot read the relay
  multiaddrs;
- nodes without the range do not start relay servers; they discover private
  relay records automatically and may also use
  `PIGEON_PRIVATE_RELAY_BOOTSTRAP_MULTIADDRS` as an explicit fallback;
- CID fetch over IPFS is capped at `10s` while locating/fetching remote content;
- Helia/Bitswap is patched during install so private relay limited connections
  can transfer blocks through `/p2p-circuit`.

### Calls TURN relay discovery

Calls use WebRTC ICE, not the libp2p/IPFS circuit relay. The backend does not
embed a TURN server; run coturn or an equivalent TURN service separately and let
the backend advertise its reachable URLs.

The same host-level port range can be reused operationally when the protocols do
not collide. The existing private IPFS relay range is TCP. TURN media relay
ports should usually reuse that numeric range over UDP in coturn, while the TURN
listening port is configured separately with `CALLS_TURN_PORT`.

Example:

```dotenv
PIGEON_PUBLIC_HOST=relay.example.com
PIGEON_PRIVATE_RELAY_PORT_START=4100
PIGEON_PRIVATE_RELAY_PORT_END=4199

CALLS_TURN_SHARED_SECRET=shared-coturn-rest-secret
CALLS_TURN_PORT=3478
CALLS_TURN_PUBLIC_HOST=relay.example.com
CALLS_TURN_TRANSPORTS=udp,tcp
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

When a public IPFS network is registered, nodes with `CALLS_TURN_SHARED_SECRET`
and at least one local TURN URL publish signed call relay records on the public
pubsub network. Other nodes cache active records and include their TURN URLs in
`GET /calls/ice-servers`, using temporary credentials generated from the same
shared secret. Set `CALLS_TURN_DISCOVERY_ENABLED=false` to disable this behavior.
- UnixFS child blocks are read sequentially on limited relay connections to avoid
  parallel stream-open failures over `/p2p-circuit`.

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

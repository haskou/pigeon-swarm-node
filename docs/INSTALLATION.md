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
| `TRANSPORT_DSN` | `in-memory://` fallback in code paths | Recommended | Transport DSN (`amqp://...`, `in-memory...` or `libp2p-gossipsub://`). |
| `TRANSPORT_MAX_RETRIES` | Adapter default | No | Retry count for AMQP operations. |
| `TRANSPORT_RETRY_DELAY` | Adapter default | No | Delay between retries (ms). |

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
| `PIGEON_LIBP2P_PORT` | `4001` | No | Main libp2p listen port used by IPFS/libp2p runtimes. |
| `PIGEON_RELAY_ENABLED` | `false` | No | Starts one public relay server for this node when `true`. The relay is node-scoped, not network-scoped. |
| `PIGEON_RELAY_PORT` | `4011` | No | Dedicated public relay listen port. Do not reuse the HTTP/Express port. |
| `PIGEON_PUBLIC_HOST` | unset | Required for advertised public relay nodes | Public DNS name or IP used to build dialable relay multiaddrs. |
| `PIGEON_RELAY_DISCOVERY_ENABLED` | `true` | No | Enables relay discovery/diagnostics feature flags. |
| `PIGEON_RELAY_RECORD_TTL_SECONDS` | `300` | No | TTL used when building signed public relay records. |
| `PIGEON_BOOTSTRAP_RELAY_MULTIADDRS` | unset | No | Comma-separated public relay multiaddrs used as bootstrap peers. |

Private networks are no longer configured through environment variables.

They must be added through application methods/use cases (for example, node network management flows) and are persisted in storage metadata.

### Public Relay Configuration

Relays are public/fallback connectivity infrastructure. They do not carry
application owner identity, private network ids, PSK values, private network
keys or identity metadata in their public debug payloads.

A relay-capable node should expose a dedicated libp2p relay port:

```dotenv
PIGEON_RELAY_ENABLED=true
PIGEON_RELAY_PORT=4011
PIGEON_PUBLIC_HOST=relay.example.com
```

The generated public relay multiaddr has this shape:

```txt
/dns4/relay.example.com/tcp/4011/p2p/<peerId>
```

or, when `PIGEON_PUBLIC_HOST` is an IPv4 address:

```txt
/ip4/203.0.113.7/tcp/4011/p2p/<peerId>
```

Leaf nodes can use known relays by configuring:

```dotenv
PIGEON_BOOTSTRAP_RELAY_MULTIADDRS=/dns4/relay.example.com/tcp/4011/p2p/<peerId>
```

Use multiple relays as a comma-separated list.

`PIGEON_BOOTSTRAP_RELAY_MULTIADDRS` is used by the public/fallback libp2p
GossipSub runtime. It is intentionally not injected into private IPFS/pnet
instances, because a PSK-protected libp2p node cannot dial a public relay that
does not know that PSK.

Private-network domain events are also published through the public fallback
GossipSub runtime when `TRANSPORT_DSN=libp2p-gossipsub://` and private networks
exist. The fallback topic is derived from the private network key with HMAC and
does not include the private `networkId`; the payload remains encrypted with the
same private network key used by direct private-network pub/sub. This lets relay
nodes move gossip without learning the private network id or payload.

Leaf nodes announce their public/relayed libp2p multiaddrs on a public
GossipSub peer-discovery topic. Relay nodes subscribe to that public topic so
leaf nodes bootstrapped to the same relay can discover and dial one another.
Only public `peerId` and public multiaddrs are announced there; private network
ids, PSK values, private keys, application owner identity and identity metadata
are not included.

Relay-capable nodes also publish signed public relay records on
`pigeon-swarm.public-relays.v1`. Each record includes the relay `peerId`, public
libp2p key, public relay multiaddr, issue time and expiry time. Peers verify the
signature and that the public key matches the advertised `peerId` before storing
or dialing the relay. Valid relay records are persisted in MongoDB until they
expire, then rehydrated at startup so a node can reuse previously discovered
relays without waiting for a fresh announcement.

When direct private IPFS retrieval fails, the backend can also request content
over the public fallback libp2p runtime with protocol
`/pigeon-swarm/ipfs-content/1.0.0`. Requests and responses are encrypted with
the private network key before being written to the public stream, so relay
nodes do not see the requested CID, network id, PSK or payload. Received content
is imported into the local private network and accepted only when the resulting
CID exactly matches the requested CID.

Docker deployments must publish both the main libp2p port and the relay port
when those features are enabled:

```yaml
ports:
  - "4001:4001"
  - "4011:4011"
```

The focused real-transport smoke test for this path is:

```bash
yarn test:e2e:real-transport:relay-fallback
```

It starts one public relay process and two peer processes, then verifies both
encrypted private fallback GossipSub and encrypted private IPFS content fetches
through the public relay path.

`GET /node/network/debug` returns sanitized runtime diagnostics so operators can
check whether relay mode is enabled, running, advertised and bootstrapped. It
does not expose relay signatures, owner ids, private network ids, PSK values or
private topology.

Important limitation: a public relay must not require the private network PSK.
Private PSK networks remain private. IPFS private-network connections still use
their own pnet/PSK path; public relay/fallback connectivity is used by the
public GossipSub fallback layer and application-level CID fetch streams.

### Important note about `IPFS_STORAGE_PATH=memory`

`memory` is supported at Helia connection level only when the exact connection option is `storageLocation: 'memory'`.

In the current app flow, `IPFSNetworkRegistry` composes per-network storage as:

- `${IPFS_STORAGE_PATH}/${networkName}`

Because of this, setting `IPFS_STORAGE_PATH=memory` does not activate Helia in-memory mode end-to-end. It is treated as a filesystem folder named `memory`.

`IPFSNetworkRegistry` persists only Helia/libp2p runtime data such as
`shared-peer-private-key.pb` under the storage path. Node metadata and
configured network metadata are stored in MongoDB.

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
PIGEON_LIBP2P_PORT=4001
PIGEON_RELAY_ENABLED=false
PIGEON_RELAY_PORT=4011
PIGEON_PUBLIC_HOST=
PIGEON_RELAY_DISCOVERY_ENABLED=true
PIGEON_RELAY_RECORD_TTL_SECONDS=300
PIGEON_BOOTSTRAP_RELAY_MULTIADDRS=
PUSH_VAPID_PUBLIC_KEY=<generatedPublicKey>
PUSH_VAPID_PRIVATE_KEY=<generatedPrivateKey>
PUSH_VAPID_SUBJECT=mailto:admin@example.com
```

Use `TRANSPORT_DSN=libp2p-gossipsub://` to publish and subscribe through the
standalone libp2p/gossipsub runtime. This runtime is separate from IPFS content
storage.

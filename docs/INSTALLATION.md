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
IPFS_LIBP2P_LISTEN_PORT_RANGE=4001-4010
IPFS_LIBP2P_LISTEN_MULTIADDRS=/ip4/0.0.0.0/tcp/{port}
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
| `IPFS_LIBP2P_LISTEN_PORT_RANGE` | unset | Recommended for multi-node deployments | TCP port range assigned to local Helia/libp2p runtimes. One port is consumed per configured node network. |
| `IPFS_LIBP2P_LISTEN_MULTIADDRS` | Helia defaults | Recommended for multi-node deployments | Comma/space-separated listen multiaddr templates. Use `{port}` with `IPFS_LIBP2P_LISTEN_PORT_RANGE`, for example `/ip4/0.0.0.0/tcp/{port}`. |
| `IPFS_LIBP2P_ANNOUNCE_MULTIADDRS` | Helia defaults | Recommended when other hosts must dial this node | Comma/space-separated public/LAN dialable multiaddr templates announced in node heartbeat metadata. Use `{port}` with the configured range. |

Private networks are no longer configured through environment variables.

They must be added through application methods/use cases (for example, node network management flows) and are persisted in storage metadata.

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

### Dialable IPFS ports

Each configured node network runs its own Helia/libp2p runtime. Because of
that, a node with a public network and one private network needs two libp2p TCP
ports, a node with three networks needs three ports, and so on.

For Docker/local deployments, expose a generous range and let the backend assign
ports in registration order:

```dotenv
IPFS_LIBP2P_LISTEN_PORT_RANGE=4001-4010
IPFS_LIBP2P_LISTEN_MULTIADDRS=/ip4/0.0.0.0/tcp/{port}
```

`docker-compose.yml` exposes `4001-4010/tcp` for this reason. If the node must
be reachable from another machine, the host/router/firewall must also allow the
same TCP range.

When running multiple backend nodes on the same host, give each node a
non-overlapping `IPFS_LIBP2P_LISTEN_PORT_RANGE`, for example `4001-4010` for the
first node and `4011-4020` for the second one.

When the node is behind Docker, Helia may otherwise announce container-only
addresses. Set `IPFS_LIBP2P_ANNOUNCE_MULTIADDRS` to a host that remote nodes can
actually dial:

```dotenv
# LAN example
IPFS_LIBP2P_ANNOUNCE_MULTIADDRS=/ip4/192.168.1.30/tcp/{port}

# DNS/public example
IPFS_LIBP2P_ANNOUNCE_MULTIADDRS=/dns4/pigeon.example.com/tcp/{port}
```

The backend replaces `{port}` with the per-network port and publishes the final
multiaddrs in `nodes.v1.node.heartbeat.was_sent`. Remote nodes only try those
addresses for networks they also have registered locally.

## Example `.env`

```dotenv
NODE_ENV=development
API_PORT=3000
ROUTE_PREFIX=/api
IPFS_STORAGE_PATH=./ipfs_storage
IPFS_LIBP2P_LISTEN_PORT_RANGE=4001-4010
IPFS_LIBP2P_LISTEN_MULTIADDRS=/ip4/0.0.0.0/tcp/{port}
# IPFS_LIBP2P_ANNOUNCE_MULTIADDRS=/dns4/pigeon.example.com/tcp/{port}
TRANSPORT_DSN=in-memory
SERVICE_NAME=pigeon-swarm
PUSH_VAPID_PUBLIC_KEY=<generatedPublicKey>
PUSH_VAPID_PRIVATE_KEY=<generatedPrivateKey>
PUSH_VAPID_SUBJECT=mailto:admin@example.com
```

Use `TRANSPORT_DSN=libp2p-gossipsub://` to publish and subscribe through the
standalone libp2p/gossipsub runtime. This runtime is separate from IPFS content
storage.

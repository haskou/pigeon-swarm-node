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

<p align="center">
  <img src="./docs/logo.png" alt="pigeon-swarm logo">
  <br>
  <a href="https://github.com/haskou/pigeon-swarm-node/actions/workflows/ci.yaml">
    <img src="https://github.com/haskou/pigeon-swarm-node/actions/workflows/ci.yaml/badge.svg" alt="Node.js CI">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg" alt="License: PolyForm Noncommercial 1.0.0">
  </a>
  <a href="https://renovatebot.com/">
    <img src="https://img.shields.io/badge/renovate-enabled-brightgreen.svg" alt="Renovate">
  </a>
</p>

# pigeon-swarm-node

`pigeon-swarm-node` is the backend node for Pigeon Swarm, a peer-to-peer
communication platform designed to be hard to censor, hard to capture, and easy
to self-host.

There is no central server that owns the graph, no platform account that can be
switched off from the outside, and no single database holding every message
hostage. Each node exposes a local HTTP/WebSocket API, stores local state,
publishes content to IPFS networks, and exchanges domain events with other
nodes through libp2p GossipSub.

Think of it as a self-hosted chat and community node with a little BitTorrent
energy, a little modern community-chat shape, and a stubborn preference for
user-owned keys.

## Why pigeons?

Carrier pigeons are low-tech, decentralized message delivery with excellent
branding. They do not need a corporate inbox, a central timeline, or a blessed
server to know where they are going. The name is partly a joke, partly a design
reminder: messages should move through the swarm without asking permission from
one big place.

The goal is not anonymity magic or a promise that nothing can ever be blocked.
The goal is a practical architecture where communities can run their own nodes,
share networks deliberately, keep private material client-side, and continue
communicating even when individual nodes disappear.

## Networks and communities

Pigeon Swarm separates node-level access from community-level access.

Networks define which nodes can discover, connect, and exchange events with each
other. A public network can be discovered and joined openly. A private network
requires permission before outside nodes can connect, so unknown nodes cannot
simply appear and participate.

Communities define the social spaces that users interact with inside those
networks. A public community can be visible and accessible to users in the
network. A private community can restrict who can see it, join it, or participate
in its channels and conversations.

In short: networks control node access, while communities control user and
content access. This keeps infrastructure boundaries separate from social
boundaries, because mixing both into one permission model is how software slowly
turns into soup.

## Architecture

The backend is organized around bounded contexts:

* `identities`: public identity documents, profiles and network membership.
* `keychains`: encrypted client keychain publications.
* `conversations`: one-to-one conversation state and encrypted drafts; group
  rosters live in MLS on the clients.
* `communities`: public/private communities, members, roles, channels and
  channel messages.
* `notifications`: invitation notifications and recipient actions.
* `calls`: call lifecycle and WebRTC signalling events.
* `nodes`: local node metadata, ownership, networks, peers and sync.
* `presence`: ephemeral identity connection state.
* `push-notifications`: Web Push subscriptions and outbound delivery.
* `notification-settings`: per-scope mute and notification preferences.
* `stickers`: sticker packs, sticker assets and user sticker state.
* `polls`: polls, votes and poll lifecycle for conversations and communities.
* `content-replication`: local replica policy, claims and replication summaries.
* `mailboxes`: node-local opaque ciphertext envelope queues.
* `identity-devices`: device authorization.
* `public-mutations`: signed public mutation records.
* `private-blobs`: node-local client-encrypted blobs.
* `private-authorization`: protected scope and operation authorization.
* `shared`: common value objects plus IPFS, OrbitDB, local embedded storage,
  message bus, HTTP, WebSocket and dependency-injection infrastructure.

The backend does not receive user identity private keys, passwords, or decrypted
conversation/community keys. It holds node-level keys: its libp2p peer key and
private-network keys. Clients generate identity material, encrypt local secrets,
sign domain payloads, and publish encrypted keychain updates.

## API Surface

Primary API documentation:

* [HTTP API](./docs/api.md)
* [Relay recovery acceptance](./docs/relay-recovery-acceptance.md)
* [Aggregated OpenAPI spec](./src/apps/apis/open-api.yaml)
* Served at `GET /swagger/open-api.yaml` (prefixed by `ROUTE_PREFIX` when set)

When the server is running, Swagger UI is available at `GET /swagger`, or at `GET <ROUTE_PREFIX>/swagger` when `ROUTE_PREFIX` is set:

```http
GET /swagger
```

## Development

Install dependencies:

```bash
yarn
```

Create a local `.env` from the documented configuration (`docker compose` reads `.env.local` instead) and choose how nodes
exchange events:

* `TRANSPORT_DSN=in-memory` for local tests and single-node development.
* `TRANSPORT_DSN=libp2p-gossipsub` for node-to-node gossip event exchange.

See [docs/INSTALLATION.md](./docs/INSTALLATION.md) for the full environment
setup.

Common commands:

```bash
yarn lint
yarn build
yarn test
yarn test:unit
yarn test:api
yarn test:consumer
yarn typecheck
yarn test:scheduler
```

Jest needs Node 24.22.0 or later; CI pins it in `.github/actions/setup-workspace`.
Earlier Node 24 releases ship a V8 whose Sparkplug baseline compiler can make a
garbage collection crash a jest worker with SIGSEGV in an unrelated suite
([nodejs/node#62393](https://github.com/nodejs/node/issues/62393)); 24.22.0
carries the fix. `tests/unit/config/JestRuntime.spec.ts` fails on an older
runtime.

Docker helpers are available through the `Makefile`:

```bash
make build
make start
make stop
make test
make logs
make build-no-cache
make shell
make lint
make logs-backend
make init
```

This repository contains the backend node source. The full self-hosted
application image and Docker Compose setup that bundles frontend and backend
lives in [`haskou/pigeon-swarm`](https://github.com/haskou/pigeon-swarm).
The standalone frontend source lives in
[`haskou/pigeon-swarm-ui`](https://github.com/haskou/pigeon-swarm-ui).

The backend can serve static frontend assets from `public/`. That directory is
ignored in this source repository because it is a build/deployment artifact:
place the frontend build output there only in local runtime images or release
packaging, not as backend source.

## Runtime Dependencies

The node expects:

* OrbitDB for replicated state and local embedded storage for node-local state.
* IPFS network configuration for content publication and retrieval.
* Libp2p GossipSub transport for node-to-node event propagation.
* Signed HTTP requests and ticket-authenticated WebSocket connections from clients.

For local development, the repository includes Docker Compose configuration and
test-friendly in-memory network helpers.

## Security Model

Clients are responsible for:

* generating identity keypairs;
* keeping passwords and private keys local;
* encrypting keychains before publication;
* encrypting private attachments before IPFS upload;
* signing HTTP requests and domain payloads.

The backend is responsible for:

* verifying signed HTTP/WebSocket requests;
* validating domain invariants;
* storing opaque encrypted payloads;
* routing WebSocket events only to related identities (pub/sub gossip is per
  network, not per identity; see the presence rules in `docs/api.md`);
* syncing public domain metadata across configured networks.

## Project Status

This is active development software. APIs are becoming more stable, but schema
and domain contracts may still change as conversations, communities, calls and
sync behavior mature.

## License

Pigeon Swarm is licensed under the PolyForm Noncommercial License 1.0.0.
Commercial use requires a separate commercial license from the author.

See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

## Disclaimer

Pigeon Swarm is not affiliated with, endorsed by, or sponsored by Discord Inc.
Discord is a trademark of Discord Inc.

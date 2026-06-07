<p align="center">
  <img src="./docs/logo.png" alt="pigeon-swarm logo">
  <br>
  <a href="https://github.com/haskou/pigeon-swarm-node/actions/workflows/ci.yaml">
    <img src="https://github.com/haskou/pigeon-swarm-node/actions/workflows/ci.yaml/badge.svg" alt="Node.js CI">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg" alt="License: PolyForm Noncommercial 1.0.0">
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
* `conversations`: one-to-one and group chat state.
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
* `ipfs-replication`: local replica policy, claims and replication summaries.
* `shared`: common value objects plus IPFS, MongoDB, message bus, HTTP,
  WebSocket and dependency-injection infrastructure.

The backend does not receive private keys, passwords, or decrypted
conversation/community keys. Clients generate identity material, encrypt local
secrets, sign domain payloads, and publish encrypted keychain updates.

## API Surface

Primary API documentation:

* [HTTP API](./docs/api.md)
* [Aggregated OpenAPI spec](./src/apps/apis/open-api.yaml)

When the server is running, Swagger UI is available at:

```http
GET /swagger
```

## Development

Install dependencies:

```bash
yarn
```

Create a local `.env` from the documented configuration and choose how nodes
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
```

Docker helpers are available through the `Makefile`:

```bash
make build
make start
make stop
make test
make logs
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

For multi-node IPFS content exchange, expose the Helia/libp2p TCP port range in
addition to the HTTP API port. The default Docker Compose setup publishes
`4001-4010/tcp`; configure `IPFS_LIBP2P_ANNOUNCE_MULTIADDRS` when other hosts
must dial this node from LAN or the public Internet. See
[docs/INSTALLATION.md](./docs/INSTALLATION.md#dialable-ipfs-ports).

## Runtime Dependencies

The node expects:

* MongoDB for local persistent state.
* IPFS network configuration for content publication and retrieval.
* Dialable Helia/libp2p TCP ports when other nodes must fetch IPFS CIDs from
  this node directly.
* Libp2p GossipSub transport for node-to-node event propagation.
* Signed HTTP/WebSocket requests from clients.

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
* routing events only to related identities;
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

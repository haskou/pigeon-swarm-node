<p align="center">
  <img src="./docs/logo.png" alt="pigeon-swarm logo">
</p>

# pigeon-swarm-node

`pigeon-swarm-node` is the backend node for a Discord-ish, peer-to-peer
communication platform designed to be hard to censor, hard to capture, and easy
to self-host.

There is no central server that owns the graph, no platform account that can be
switched off from the outside, and no single database holding every message
hostage. Each node exposes a local HTTP/WebSocket API, stores local state,
publishes content to IPFS networks, and exchanges domain events with other
nodes through libp2p GossipSub.

Think of it as a self-hosted chat and community node with a little BitTorrent
energy, a little Discord shape, and a stubborn preference for user-owned keys.

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

## Capabilities

- Local identity publishing and profile updates, including handles, avatar and
  banner CIDs.
- Client-owned encrypted keychains for conversations and communities.
- One-to-one and group conversations with encrypted messages, replies,
  attachments and deletion tombstones.
- Private communities with owners, members, text channels and encrypted channel
  messages.
- Actionable notifications for conversation, group conversation and community
  invitations.
- Public and private IPFS uploads for profile media and encrypted attachments.
- Node ownership, network management, peer heartbeats and startup
  synchronization.
- WebSocket delivery for routed domain events.
- Realtime call signalling for one-to-one, group and community channel calls.

## Architecture

The backend is organized around bounded contexts:

- `identities`: public identity documents, profiles and network membership.
- `keychains`: encrypted client keychain publications.
- `conversations`: one-to-one and group chat state.
- `communities`: private communities, members, channels and channel messages.
- `notifications`: invitation notifications and recipient actions.
- `calls`: call lifecycle and WebRTC signalling events.
- `nodes`: local node metadata, ownership, networks, peers and sync.
- `shared`: IPFS, MongoDB, message bus, HTTP, WebSocket and common value
  objects.

The backend does not receive private keys or decrypted conversation/community
keys. Clients generate identity material, encrypt local secrets, sign domain
payloads and publish encrypted keychain updates.

## API Surface

Primary API documentation:

- [HTTP API](./docs/api.md)
- [PubSub sync protocol](./docs/pubsub-sync-protocol.md)
- [Aggregated OpenAPI spec](./src/apps/apis/open-api.yaml)

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

- `TRANSPORT_DSN=in-memory` for local tests and single-node development.
- `TRANSPORT_DSN=libp2p-gossipsub` for node-to-node gossip event exchange.

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
make log
```

## Runtime Dependencies

The node expects:

- MongoDB for local persistent state.
- IPFS network configuration for content publication and retrieval.
- Libp2p GossipSub transport for node-to-node event propagation.
- Signed HTTP/WebSocket requests from clients.

For local development, the repository includes Docker Compose configuration and
test-friendly in-memory network helpers.

## Security Model

Clients are responsible for:

- generating identity keypairs;
- keeping passwords and private keys local;
- encrypting keychains before publication;
- encrypting private attachments before IPFS upload;
- signing HTTP requests and domain payloads.

The backend is responsible for:

- verifying signed HTTP/WebSocket requests;
- validating domain invariants;
- storing opaque encrypted payloads;
- routing events only to related identities;
- syncing public domain metadata across configured networks.

## Project Status

This is active development software. APIs are becoming more stable, but schema
and domain contracts may still change as conversations, communities, calls and
sync behavior mature.

## License

Pigeon Swarm is licensed under the PolyForm Noncommercial License 1.0.0.
Commercial use requires a separate commercial license from the author.

# Pigeon Swarm Use Cases

This document describes the target use cases for nodes, networks, identities
and simple 1to1 conversations.

## Architectural Rule

Domain concepts stay simple:

- `Node` represents a local runtime.
- `Network` represents a connectivity scope.
- `Identity` represents the signed user identity.
- `Conversation` represents a chat between identities.
- `MessageEvent` represents an immutable signed chat event owned by
  `Conversation`.

MongoDB, IPFS, DHT and PubSub are infrastructure mechanisms. Repositories and
application services may use them internally, but domain objects and domain
ports should not expose concepts such as heads, blob stores or index rows.

## Concepts

**Node**

A node is a standalone runtime. It has a stable `NodeId`, belongs to one or more
networks, and may have a local owner identity. A node can serve one or more
local users and can keep replicated data for remote users.

**Network**

A network is a connectivity scope. It can be public or private. Private
networks have a key. Identities declare the networks where they can be found.

**Identity**

An identity represents a user-level cryptographic identity. Its id is derived
from its public key. The identity itself carries version metadata such as
`version` and `previousCid` so that different immutable copies can be validated
and ordered. The repository returns `Identity`, not an infrastructure-specific
version object.

**MessageEvent**

A message event is an immutable signed event in a conversation. A sent message,
an edit and a delete are all message events. Edits and deletes point to a
previous event instead of mutating it. Message events are dependent entities:
they are created, accepted, projected and persisted through the `Conversation`
aggregate boundary.

**Local Database**

MongoDB is the node-local query and metadata store. It stores CIDs, validation
state, sync state and lookup metadata, but those structures are infrastructure
documents, not domain concepts.

**IPFS / Helia**

IPFS stores immutable identity documents, message event documents, media,
attachments and large snapshots by CID.

**PubSub**

PubSub announces identity CIDs and message event CIDs quickly between connected
peers.

**DHT**

DHT helps a node discover candidate identity CIDs or peer hints when local
state is missing or stale.

## UC-001: Load Local Node

**Goal**

Load the current runtime identity of the node and its configured networks.

**Main flow**

1. The client opens the node API or UI.
2. The application loads local node metadata.
3. The node repository returns `NodeId`, configured networks and optional
   owner identity id.
4. If an owner exists, the application asks `IdentityRepository` for that
   identity.
5. The repository may use MongoDB, DHT and IPFS internally to resolve the
   current valid identity.
6. The application returns node and identity state to the client.

**Result**

The node is ready to serve requests with known local networks and owner state.

## UC-002: Create Identity

**Goal**

Create a new signed user identity bound to at least one network.

**Main flow**

1. The user enters a profile name and password.
2. The application generates a key pair.
3. The private key is encrypted with the password.
4. The identity id is derived from the public key.
5. The `Identity` is created with `version = 1`.
6. The canonical identity payload is signed.
7. `IdentityRepository.save` persists and publishes the identity.
8. The repository stores the immutable identity document in IPFS.
9. The repository stores local lookup metadata in MongoDB.
10. The repository announces or exposes the CID through PubSub/DHT.
11. The local node metadata stores the identity as owner if requested.

**Result**

A new identity exists locally and can be discovered by peers.

## UC-003: Update Identity

**Goal**

Update profile or network hints without losing verifiability.

**Main flow**

1. The user updates profile or networks.
2. The application loads the current `Identity`.
3. The domain creates the next `Identity` state with a higher `version` and
   `previousCid`.
4. The new identity payload is signed.
5. `IdentityRepository.save` stores the immutable document in IPFS.
6. The repository updates local metadata in MongoDB.
7. The repository announces or exposes the new CID through PubSub/DHT.

**Result**

Peers can validate the new current identity without trusting the publishing
node.

## UC-004: Resolve Identity

**Goal**

Find the current accepted information for a remote identity.

**Main flow**

1. The application asks `IdentityRepository.findById(identityId)`.
2. The repository checks local MongoDB metadata for known candidate CIDs.
3. If local state is missing or stale, the repository asks DHT/peers for
   candidate CIDs.
4. The repository fetches missing identity documents from IPFS.
5. The repository maps documents to `Identity` objects.
6. `IdentityResolutionDomainService` validates signatures, identity id,
   version and previous CID chain.
7. The service chooses the current valid `Identity`.
8. The repository stores validation metadata locally.

**Result**

The application receives a validated `Identity`.

## UC-005: Create 1to1 Conversation

**Goal**

Create a direct conversation between two identities.

**Main flow**

1. The user starts a chat with a remote identity.
2. The application resolves both identities through `IdentityRepository`.
3. The domain creates a deterministic `ConversationId` from both identity ids.
4. `ConversationRepository.save` stores the conversation locally.
5. The node subscribes to the conversation PubSub topic.

**Result**

The conversation can receive and send signed encrypted events.

## UC-006: Send 1to1 Message

**Goal**

Send an encrypted message to one remote identity.

**Main flow**

1. The user writes a message.
2. The application loads the conversation and participant identities.
3. The payload is encrypted for the participants.
4. The `Conversation` aggregate creates and records a signed `MessageSent`
   event.
5. `ConversationRepository.save` persists the updated aggregate.
6. The repository stores immutable event documents in IPFS internally.
7. The repository stores local lookup metadata in MongoDB internally.
8. The application publishes `conversation.pullDomainEvents()` through the
   existing `DomainEventPublisher`.
9. The configured Helia PubSub message-bus adapter announces the event to
   peers.

**Result**

Peers can fetch the immutable event by CID and validate it, while application
code deals with `Conversation` as the aggregate root.

## UC-007: Receive 1to1 Message

**Goal**

Process a message announced by another peer.

**Main flow**

1. The node receives a remote message announcement.
2. The application passes it to `MessageReceiver`.
3. `ConversationRepository` loads the target conversation and checks if the
   event is already known.
4. If missing, the repository fetches the event document from IPFS.
5. The repository maps the document to a `MessageEvent`.
6. The `Conversation` aggregate accepts the event only after hash, signature,
   author identity and participant rules pass.
7. `ConversationRepository.save` stores local lookup metadata.
8. The event becomes available through normal reads.

**Result**

The message becomes available in local conversation reads.

## UC-008: Read Latest 1to1 Messages

**Goal**

Return the latest messages in a conversation.

**Main flow**

1. The client requests the latest messages.
2. The application loads the `Conversation` through `ConversationRepository`.
3. The repository uses local MongoDB metadata and IPFS documents internally to
   reconstitute the aggregate.
4. The application reads the conversation's dependent `MessageEvent` objects.
5. Events are decrypted when keys are available.
6. `ConversationProjectionDomainService` applies edits and deletes.
7. The latest visible messages are returned.

**Result**

The user sees a stable view backed by immutable events.

## UC-009: Edit Message

**Goal**

Edit a previously sent message without mutating the original event.

**Main flow**

1. The author submits an edit.
2. The application loads the `Conversation`.
3. The `Conversation` aggregate creates a signed `MessageEdited` event
   targeting the original `MessageSent` event id.
4. `ConversationRepository.save` persists the aggregate through IPFS and local
   metadata.
5. The application publishes `conversation.pullDomainEvents()` through the
   existing `DomainEventPublisher`.
6. Conversation projection shows the latest valid edit.

**Result**

The original event remains immutable and the current view changes by projection.

## UC-010: Delete Message

**Goal**

Hide a message from the distributed conversation view without mutating history.

**Main flow**

1. The actor requests message deletion.
2. The application loads the `Conversation`.
3. The `Conversation` aggregate creates a signed `MessageDeleted` event
   targeting the original event id.
4. `ConversationRepository.save` persists the aggregate.
5. The application publishes `conversation.pullDomainEvents()` through the
   existing `DomainEventPublisher`.
6. Conversation projection replaces the message content with a tombstone.

**Result**

Honest nodes stop showing the message content. Physical deletion cannot be
guaranteed in a P2P network once a peer has replicated the encrypted blob.

## UC-011: Recover Missing Events

**Goal**

Catch up after being offline or after missing PubSub messages.

**Main flow**

1. The sync engine asks peers for known event ids or recent CIDs.
2. Peers respond with event ids and CIDs unknown to the local node.
3. `ConversationRepository` fetches missing event documents from IPFS while
   reconstituting the conversation.
4. The `Conversation` aggregate validates and merges dependent events.
5. The repository updates local metadata and sync cursors.

**Result**

The node converges without requiring PubSub to be perfectly reliable.

# Node owner registration control and blocking (optional)

Status: design for issue #384, decisions confirmed by the owner. Built:
registration control (delivery step 1), local blocking (slice 2), sharing
(slice 3) and the host owner reset `yarn node:reset-owner` (slice 4). The
price-based
admission model stays the default, and every node stays open unless its owner
changes that. A node owner gets two optional, local tools:

1. **Registration control.** Decide whether new identities may be **created**
   through this node. It never gates existing identities or login.
2. **Blocking.** Stop this node from serving chosen identities and from talking
   to chosen nodes. Optionally publish the block list so other node owners can
   adopt it.

There is no network admin, no allowlist of admitted identities, no replicated
admission state and no cross-node consensus.

## Problem

Any key that pays the admission proof can create an identity through any node
(`identity-authentication.md` (f)). The proof is priced from the load each node
counts per network (`IdentityAdmissionPricingDomainService.ts:9-15`, #518), and
each node can cap admissions per network
(`IdentityNetworkAdmissionRateLimiter.ts:8-13`). An operator who runs a node for
a known group still cannot say "nobody creates accounts here except people I
invited", and has no way to stop serving an abusive identity or talking to a
misbehaving node. The operator already exists in the code as the **node
owner**.

## Goals and non-goals

- Default unchanged: a node that never touches these settings behaves exactly
  as today, and so does every client.
- Both tools are decided by the node owner and act on this node only.
- The proof of work, the #518 pricing, the per-node limits, identity validity
  and every replicated record format stay as they are.
- Nothing is deleted automatically. Blocking and registration control only stop
  new work; unblocking restores it.
- Non-goal: deciding who takes part in a network. An identity created through
  another node replicates to this node and may use it unless it is blocked.
  Registration control removes this node as an entry point for new accounts. It
  does not bound minting network-wide.
- Non-goal: hiding records. Replicated records of a blocked identity stay
  stored, replicated and readable, because the conversations and communities of
  this node's users contain them. Hiding someone from one user is a client-side
  block.

## The node owner

Both tools reuse the existing node owner unchanged:

- **Definition.** `Node` holds an optional `owner: IdentityId`
  (`src/contexts/nodes/domain/Node.ts:34`), with `hasOwner` and `isOwnedBy`
  (`Node.ts:107-113`). It is stored in the local embedded database, in the
  `node_metadata` document with the node id, networks and relay configuration
  (`LocalNodeMetadataRepository.ts:15-16,59-83`). It is never replicated.
- **Authentication.** Owner-only routes extend `NodeOwnerRouteSupport`
  (`src/apps/apis/nodes-api/routes/NodeOwnerRouteSupport.ts:17-53`). The request
  is verified by `SignedHttpRequestAuthenticator` (signature, freshness, replay;
  `SignedHttpRequestAuthenticator.ts:29-36`), and the caller must be the owner,
  else `403010`. `X-Identity-Id` is the identity's public key, so the owner is
  verified without any lookup.
- **Rotation.** `PUT /node/owner` (`PutNodeOwnerRoute.ts:24-39`) through
  `Node.assignOwner` (`Node.ts:78-90`). Once the node is claimed, only the
  current owner can name the next one.
- **Unclaimed nodes.** Both tools need an owner and use the strict owner check
  (`assertOwnerCanManageNode`). An unclaimed node is open and blocks nobody.
- **Concurrent owner writes.** Every change to `node_metadata` (owner,
  registration mode, relay configuration, networks, owner reset) goes through
  `NodeRepository.updateLocalNode` (or `updateStoppedLocalNode` for host
  commands). It loads the latest node, applies the change and saves it inside
  one section per local database (`EmbeddedLocalDatabase.exclusively`), so two
  concurrent writes never revert each other. Generating the metadata of a new
  node runs in the same section, so concurrent first loads keep one node id.

### Owner loss and reset

There is no key-based recovery protocol. Control of the host is ownership: an
operator who lost the owner key, or whose key was stolen, resets the owner from
the host while the node is stopped.

- **Owner reset command.** `yarn node:reset-owner <new owner identity id>`
  hands the node to the identity the operator names and clears only the
  settings of this design: registration mode (back to `open`), registration
  codes, own blocks, adopted sources with their pending and approved entries,
  local exceptions and the publication setting. The new owner is written in the
  same metadata write that drops the old one, so the node is never unclaimed
  and no other identity can claim it. The command refuses, before opening the
  database, a missing or invalid identity id, and refuses the current owner.
  Networks, mailboxes, private blobs, the node id and the libp2p peer key stay.
  So do the version floors of adopted publishers (the highest version this
  node ever accepted from each one): they are anti-rollback state, not owner
  settings, and they hold only public publisher ids and version numbers.
  Clearing them would let a stale or captured old list of a publisher roll
  blocks back once the new owner adopts it again.
  The command opens the same local database, whose lock (`level`,
  `EmbeddedLocalDatabase.ts:3`) makes it fail while the node is running.
- **Full reset.** Delete the local database folder, `PIGEON_LOCAL_DB_PATH`
  (default `<project root>/local_storage`; `EmbeddedLocalDatabase.ts:48-49`).
  This clears the same settings and everything else kept locally: configured
  networks and their keys, relay configuration, mailboxes, private blob
  records, push subscriptions and rate-limit counters. Next start, the node
  creates new metadata with a new random node id
  (`LocalNodeMetadataMapper.ts:23-27`). The libp2p peer key lives under
  `IPFS_STORAGE_PATH` (`IPFSNetworkRegistry.ts:254-299`), so the peer id
  survives unless that folder is deleted too.
- After a full reset the node is unclaimed; the operator claims it again with
  `PUT /node/owner` (`PutNodeOwnerRoute.ts:32` lets the first signed caller
  claim an unclaimed node) before anyone else can reach the API.

## Registration control

### Modes

`Node` gains `NodeRegistrationMode`:

- `open` (default): as today.
- `codes`: a new identity can be created only with a registration code, which
  the owner hands out as a registration link.
- `closed`: nobody can create an identity through this node, the owner
  included. The owner switches to `codes` to invite someone.

Owner-only creation (the owner submits each newcomer's record) is not built:
an owner who wants it issues a single-use link and uses it at once.

In every mode the proof of work and the #518 pricing apply unchanged. A code
only grants the right to try. It never lowers the price, because the identity
replicates to every node of its networks and one node cannot vouch for it to
the others.

### What counts as creation

`POST /identities` publishes both new identities and new versions of existing
ones. A version with no previous reference is a genesis
(`IdentityPublisher.ts:28-41`, `Identity.ts:146-147`). Registration control
applies when this node does not hold that identity yet, whatever the version:
a later version whose genesis was published elsewhere and is reachable over
IPFS would otherwise bring a new identity onto a closed node. An identity that
already replicated here is a republish, not a creation, so its updates, network
additions, device transitions, login and every other route are never gated.

### Registration codes

- `POST /node/registration-codes` (owner-signed) takes
  `{ "maxUses": 1, "expiresAt": <ms> }` and returns
  `{ "id", "code", "maxUses", "expiresAt" }`. The code appears only in this
  response.
  - `maxUses` defaults to `1`. Multi-use codes suit an invite link shared with
    a group, at a higher cost if leaked.
  - `expiresAt` is required and at most `NODE_REGISTRATION_CODE_MAX_TTL_DAYS`
    (default `30`) ahead. `maxUses` is at most
    `NODE_REGISTRATION_CODE_MAX_USES` (default `100`).
- The code is 32 random bytes, base64url. The node stores only its SHA-256,
  `maxUses`, the uses left and `expiresAt`, in a local collection with its own
  repository.
- `GET /node/registration-codes` (owner-signed) lists codes by id with uses
  left and expiry, never the code. `DELETE /node/registration-codes/{id}`
  revokes one. Expired codes are dropped; used-up codes are hidden and kept
  until they expire, so a use given back by a failed creation is not lost.
- **Uses are counted on this node only.** That is safe because the code only
  gates creation through this node. No other node checks it, and the identity
  record does not carry it, so no replica has to agree on the remaining uses.
  Replicated community invites need that agreement (`api.md`, "Create community
  invite link token"); registration codes do not.

### Registration link

The owner's client builds the link; the node needs no UI address:

```text
https://<ui-origin>/register#node=<encodeURIComponent(node endpoint)>&code=<code>
```

- `node` is the node endpoint the owner's client uses, in the form the UI
  already accepts (`ClientNodeEndpoint.normalize` in pigeon-swarm-ui: HTTPS, or
  HTTP on loopback, without credentials, query or fragment).
- The code travels in the fragment, so it never reaches the UI host's logs or
  a `Referer` header. The UI removes the fragment from the address bar as soon
  as it reads it, as it does for community invites.
- Opening the link selects that node and starts identity creation with the
  code already filled in: no node URL to type, no code to copy. If the browser
  already has an identity on another node, the UI asks before switching.
- The owner's UI shows the link and a QR code of it.

### Enforcement

- The newcomer's client sends `X-Registration-Code` with `POST /identities`.
  The record format does not change.
- **Order in `POST /identities`** (`PostIdentityRoute.ts:46-48`): the per-address
  limiter first, so codes cannot be guessed fast; then the registration check;
  then the publish limiter and the network admission limiter. Refused attempts
  therefore never consume the shared limits honest users depend on.
- A code use is reserved atomically before publishing and released if
  publishing fails, so a failed proof never burns a use. Reserve and release
  run in one section per local database (`EmbeddedLocalDatabase.exclusively`),
  so concurrent requests on any number of repository handles cannot spend more
  than `maxUses`.
- Requests that create the same identity run one after the other on the node
  (`IdentityCreationQueue`): the first creates it and spends one use, the next
  ones find the identity already stored and spend none.
- Refusal: `403` with new code `403011`, message "Identity creation on this
  node is closed" or "needs a valid registration code". One code for missing,
  unknown, expired and used-up codes, so a caller learns nothing about which
  codes exist.
- `PUT /node/registration` (owner-signed) sets the mode. `GET /node` (public)
  returns `registration: { mode }`, so a client knows before creating a key
  whether it needs a link.

## Blocking

A block names either an **identity** or a **node**. A node is named by its
libp2p peer id: one per node, shared by all its networks
(`IPFSNetworkRegistry.ts:233-299`), and shown by `GET /peers`. The `NodeId` in
`GET /node` is a random UUID the node reports about itself, which a connection
cannot prove, so it is not used.

### What an identity block does on this node

While the identity is blocked, this node:

- refuses every request authenticated as it, reads included, with `403` and new
  code `403012` "Identity is blocked on this node". The check runs right after
  `SignedHttpRequestAuthenticator` verifies the signature, in one place, so no
  route can forget it;
- refuses records it authored that are submitted through this node's API
  without a request signature (`POST /identities` with its id,
  `POST /identity-devices/transitions`, record-signed conversation routes).
  `POST /identities` skips the check only for a record whose content id this
  node already stores locally for that identity; a copy fetchable from a peer
  does not count. A replay of the public record from `GET /identities/:id` then
  gets the usual answer and cannot reveal the block, while any other record,
  a fork at an equal or older version included, is refused. For an id that is
  blocked here but not held here, anyone holding that id's public record (from
  another node, say) can submit it and learn that this node blocks it; this is
  accepted, because the id is not served here;
- closes its open realtime connections when the block takes effect, and refuses
  new realtime tickets;
- sends no push notifications to its subscriptions;
- refuses new private blob reservations by it;
- excludes its content registrations from this node's replication budget
  (`ContentReplicationBudgetAllocator.ts:16-138`). They come out with
  `withinLocalBudget: false`, which the maintainer already skips
  (`ContentReplicationMaintainer.ts:57`), so this node neither fetches nor
  announces its content. Other owners share the budget it no longer uses.

### What a node block does on this node

While the node is blocked, this node:

- refuses every libp2p connection with that peer id, inbound and outbound, on
  every network, through the existing connection gater
  (`HeliaIPFSParser.ts:115-128`);
- closes its open connections when the block takes effect;
- as a result, exchanges no gossip, OrbitDB replication or bitswap blocks with
  it, neither fetching from it nor announcing to it, and relays no traffic for
  it when this node is a relay.

The gater today reads a process-wide list loaded from a `blockedPeers.json` file
in each network folder (`HeliaIPFSParser.ts:17,97-181`), written by
`HeliaIPFS.blockPeer` (`HeliaIPFS.ts:1397-1408`), which nothing calls. The
implementation replaces that with the block policy below and removes the file
handling, including its skip in `PrivateNetworkRelayRecordDirectory.ts:221`.

### What a block never does

- It never deletes anything: not records, content bytes already held (the
  maintainer never removes a replica's bytes, `ContentReplicationMaintainer.ts:15`),
  private blobs, push subscriptions, mailboxes or the identity.
- It never hides or refuses replicated records. An identity block leaves its
  records stored, replicated, served to other users and counted by #518. A node
  block stops only the exchange with that peer: records that came from it stay,
  and the same records still arrive through other peers.
- It never touches mailboxes. Mailbox operations are anonymous capabilities
  (`opaque-mailboxes.md`), so the node cannot tell whose mailbox it is. Other
  bearer-capability routes, such as downloading an existing private blob, are
  likewise unaffected.
- An identity block never blocks a node and a node block never blocks an
  identity; users whose home is a blocked node can still use this node.
- It never affects other nodes, unless their owners adopt this list.
- It never applies to this node itself: the owner's identity and this node's
  own peer id are ignored if listed.

Unblocking restores everything above at once; nothing has to be rebuilt.

A node block stops a known misbehaving peer, not a determined one: an operator
can generate a new peer key. Likewise an identity block does not stop the same
person from paying for a new identity elsewhere.

### Block list format

The owner's client keeps the whole list, identities and nodes, as one document
signed by the owner identity:

```jsonc
{
  "type": "pigeon-node-block-list",
  "ownerIdentityId": "<owner identityId>",
  "version": 7, // strictly increasing
  "issuedAt": 1770000000000, // metadata only
  "blockedIdentityIds": ["<identityId>", "..."], // sorted, unique
  "blockedNodePeerIds": ["<libp2p peer id>", "..."], // sorted, unique
  "identitySignature": "<ed25519 by the owner identity key over \"pigeon:node-block-list:v1\\n\" + canonical JSON without this field>",
}
```

- One document keeps signing, versioning, publishing and adopting to a single
  path for both kinds.
- `PUT /node/blocks` (owner-signed request) stores a document whose signer is
  the current owner and whose version is higher than the stored one.
  `GET /node/blocks` (owner-signed) returns it. Adding or removing one entry is
  a new version written by the client.
- Size: there is no entry cap on this node's own list; the owner decides how
  many identities and nodes to block. `NODE_BLOCK_LIST_MAX_BYTES` (default
  64 MiB, about 500k Ed25519 PEM ids at ~120 B each) bounds the bytes read for
  one document. It defends a node against a hostile peer exhausting its
  memory and CPU while parsing, not against database growth. For
  `PUT /node/blocks` it is the request body limit, and a non-owner
  `X-Identity-Id` or a stale timestamp is rejected before any body byte is
  buffered. For adopted lists it is the streamed download limit.
- The document carries no reasons. A published list must not become a place
  for accusations or personal data; any note stays in the owner's client.
- The identity id is the public key, so anyone can verify the document from
  `ownerIdentityId` alone, without trusting the node that serves it.

### Sharing blocks (opt-in on both sides)

- **Publishing.** The owner turns on publication with owner-signed
  `PUT /node/blocks/publication { "published": true }`. The node then serves
  public `GET /node/blocks/published`: the body is exactly the signed content,
  the RFC 8785 canonical JSON of the stored document without
  `identitySignature`, and the signature travels in the `X-Identity-Signature`
  response header. It is off by default, because a published list reveals
  whom this owner blocked.
- **Adopting.** Another node's owner adds a source with owner-signed
  `PUT /node/block-sources/{ownerIdentityId} { "origin": "https://..." }`. That
  node periodically fetches `GET {origin}/node/blocks/published`, reading at
  most `NODE_BLOCK_LIST_MAX_BYTES` while streaming, and judges the response in
  this order, recording the first failure as the fetch outcome:
  1. the header signature verifies against the **pinned** `ownerIdentityId`
     over `"pigeon:node-block-list:v1\n"` + the raw body bytes, before any
     byte is parsed (`invalid-signature`, also for a missing or malformed
     header);
  2. the bytes parse as a valid block list and are already in canonical
     form, so the signed bytes and the kept document cannot differ
     (`invalid-document`);
  3. the document names the pinned identity as its owner (`wrong-signer`);
  4. the version is higher than any this node ever accepted from that
     publisher, even before the source was removed or the owner settings were
     reset, so a served old version cannot roll blocks back (`not-newer`).

  An unreachable source or an invalid response keeps the last valid version.
  Verifying first means an unauthenticated server never reaches the JSON
  parser with bytes the pinned publisher did not sign.
  Floors only rise and no API lowers them. Whoever holds the publisher key
  can therefore publish a huge version and freeze that publisher on every
  subscriber; that key could already publish any list, so subscribers that
  stop trusting it remove the source. Only deleting the local database clears
  the floors, and with them this rollback protection.
  Outbound requests go through the shared public-address guard also used for
  link previews (`src/shared/infrastructure/http/public-url/PublicUrlGuard.ts`).

- **Review queue (default).** Entries a source adds are **pending**: they have
  no effect until this node's owner approves them. The owner approves all
  pending entries of a source with one action, or picks entries one by one.
  Auto-apply would let a publisher silently block this node's users or cut it
  off from its peers, so it is not the default.
- **Auto-apply (opt-in per source).** The owner may turn on `autoApply` for a
  source they fully trust; entries added by lists fetched from then on take
  effect on fetch. Turning it on approves nothing already pending.
- **Removals** by a source take effect on fetch in both modes: they only lift
  blocks. An owner who wants to keep such a block adds the entry to their own
  list.
- **Local exceptions.** The owner keeps a list of identities and peer ids that
  adopted lists never block, in either mode. Their own list is unaffected.
- **Effect.** This node blocks the union of its own list and, per source,
  the approved entries still present in its latest version (all of them with
  `autoApply`), minus local exceptions, the owner's identity and this node's
  peer id. Removing a source removes its effect at once.
- **No consensus.** Lists are never gossiped or merged into shared state. Each
  node decides whose lists to trust, one owner identity at a time.
- **Publisher owner change.** After a rotation or reset, the publisher's new
  documents are signed by another identity. Their signature does not verify
  against the pinned identity, so subscribers record `invalid-signature` and
  keep the last valid version until their owner pins the new identity. A new
  owner therefore cannot silently take over other nodes' block decisions.
- **Local owner change.** This node's stored list survives an owner change: it
  still blocks what the previous owner blocked, and only the new owner can
  replace it, with a version higher than the stored one. The current owner is
  never blocked, even if an old list names them.

## Interaction with existing limits

- **Proof of work and #518:** unchanged in every mode. Registration codes add a
  gate and never lower the price.
- **Per-node limits:** unchanged. Registration refusals happen before the
  publish limiter and the network admission limiter.
- **#557 budget:** registration control does not affect it. Blocked identities
  are left out of this node's allocation, as described above. Responsibility
  (`ContentReplicationStatusFinder`) is unchanged: for a blocked identity's
  content this node behaves like a node with an exhausted budget, which the
  network already handles.

## What other nodes see

- `GET /node` shows the registration mode.
- `GET /node/blocks/published` exists only when the owner publishes.
- A blocked node sees its connections refused.
- Nothing else: no heartbeat field, no replicated record, no protocol change.

## Failure modes

| Failure                               | Effect                                                                  | Recovery                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Registration link leaked              | Up to its uses left can create identities until it expires              | Owner revokes the code; blocks identities created with it                          |
| Owner offline                         | No new codes, blocks or approvals; everything already set keeps working | None needed                                                                        |
| Owner key lost or stolen              | Settings frozen, or changed by the thief                                | `yarn node:reset-owner <new owner identity id>`                                    |
| Full reset                            | As an owner reset, plus networks, mailboxes and node id gone            | Claim, rejoin networks, restore the settings                                       |
| Adopted source unreachable            | Last valid version stays in effect                                      | None needed; diagnostics show when it was last fetched                             |
| Adopted source adds bad entries       | Pending only; with `autoApply`, this node blocks them                   | Do not approve, or add local exceptions, or remove the source; nothing was deleted |
| Publisher's owner changes             | Subscribers keep the old list and reject the new signer                 | Subscriber owner pins the new identity if they trust it                            |
| Blocked identity uses other nodes     | Works as before; its records still reach this node's users              | Users block it in their clients; other owners adopt the list                       |
| Blocked node rotates its peer key     | It connects again under a new peer id                                   | Block the new peer id                                                              |
| Identities created through open nodes | They can use this node                                                  | Blocking; registration control only removes this node as an entry point            |

## Usability

- **Default unchanged.** Open nodes and their users see no new step, field or
  latency.
- **Owner.** In node settings:
  - registration mode with one sentence explaining each;
  - create a registration link (uses, expiry), copy it or show its QR code, see
    the uses left and revoke it;
  - block or unblock an identity by id or handle, and a node from the peers
    list;
  - publish the list on or off; add or remove sources, toggle `autoApply`, see
    each source's last fetch and approve its pending entries with one action;
  - manage local exceptions.
- **Newcomer.** Opening a registration link selects the node and starts
  creation with the code filled in. Without a link, the client reads
  `registration.mode` from `GET /node`:
  - `codes`: it explains that this node needs a registration link from its
    owner;
  - `closed`: it explains that the node takes no new accounts and lets the user
    choose another node;
  - `403011` shows the same messages.
- **Blocked user.** `403012` shows "This node no longer serves your identity"
  and offers another node. Their data stays in the network.

## Implementation slices

Red-first, each a complete cutover of its part. Endpoint changes update
`docs/api.md`, the nodes-api and identities-api swagger and `open-api.yaml`;
new variables go to `INSTALLATION.md`.

1. **Registration control.** `NodeRegistrationMode`, the registration code
   collection, the check in `POST /identities`, `/node/registration`,
   `/node/registration-codes` and `GET /node`.
2. **Local blocking.** The signed block list value objects, `PUT`/`GET
/node/blocks`, one `NodeBlockPolicy` and every enforcement point above,
   including the connection gater cutover and the inventory of record-signed
   write routes.
3. **Sharing.** Publication, sources, the fetcher with verification, the review
   queue, `autoApply`, local exceptions and diagnostics.
4. **Owner reset.** `yarn node:reset-owner <new owner identity id>` and
   `INSTALLATION.md`.
5. **UI** (haskou/pigeon-swarm-ui): registration link flow, owner settings,
   newcomer and blocked states.

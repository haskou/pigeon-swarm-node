# Node owner registration control and blocking (optional)

Status: design for issue #384. Owner decision: the price-based admission model
stays the default, and every node stays open unless its owner changes that. A
node owner gets two optional, local tools:

1. **Registration control.** Decide whether new identities may be **created**
   through this node. It never gates existing identities or login.
2. **Blocking.** Stop this node from acting for chosen identities. Optionally,
   publish the block list so other node owners can adopt it.

There is no network admin, no allowlist of admitted identities, no replicated
admission state and no cross-node consensus.

## Problem

Any key that pays the admission proof can create an identity through any node
(`identity-authentication.md` (f)). The proof is priced from the load each node
counts per network (`IdentityAdmissionPricingDomainService.ts:9-15`, #518), and
each node can cap admissions per network
(`IdentityNetworkAdmissionRateLimiter.ts:8-13`). An operator who runs a node for
a known group still cannot say "nobody creates accounts here except people I
invited", and has no way to stop serving an abusive identity. The operator
already exists in the code as the **node owner**.

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

### Owner loss and reset

There is no key-based recovery protocol. Control of the host is ownership: an
operator who lost the owner key, or whose key was stolen, resets the owner by
deleting local state while the node is stopped.

- **Full reset.** Delete the local database folder, `PIGEON_LOCAL_DB_PATH`
  (default `<project root>/local_storage`; `EmbeddedLocalDatabase.ts:48-49`).
  Next start, the node creates new metadata with a new random node id
  (`LocalNodeMetadataMapper.ts:23-27`). This also drops everything else kept
  locally: configured networks and their keys, relay configuration, mailboxes,
  private blob records, push subscriptions and rate-limit counters.
- **Owner reset.** A host-side command, run while the node is stopped, deletes
  only the owner and the owner-scoped settings of this design (see open
  questions).
- Either reset also resets the registration mode to `open` and deletes
  registration codes, blocks, adopted block sources and the publication setting.
- After a reset the node is unclaimed. Today the first signed caller claims it
  and may name any identity (`PutNodeOwnerRoute.ts:32`), so the operator claims
  it before exposing the API again.

## Registration control

### What counts as creation

`POST /identities` publishes both new identities and new versions of existing
ones. A version with no previous reference is a genesis
(`IdentityPublisher.ts:28-41`, `Identity.ts:146-147`). Registration control
applies only when the body is a genesis **and** this node does not hold that
identity yet. A genesis that already replicated here is a republish, not a
creation. Updates, network additions, device transitions, login and every
other route are never gated.

### Options evaluated

| Option                                                                              | Security                                                                                 | Usability                                                                                     | Cost                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| A. Owner-only creation: the genesis must arrive in an owner-signed request          | Strongest; no secret to leak                                                             | Poor: the newcomer must hand the record to the owner, who submits it while online             | One check; client hand-off flow                           |
| B. Registration codes: the owner issues single-use codes; the newcomer presents one | Strong: a leaked code admits at most its uses before it expires; the owner can revoke it | Good: a link or QR code, and the newcomer registers alone                                     | Small local collection, three owner endpoints, one header |
| C. Closed: no new identities through this node; PoW unchanged everywhere            | Strongest, and simplest                                                                  | Only for nodes whose users already exist; newcomers register elsewhere and then use this node | One check                                                 |

**Recommendation: ship `open` (default), `codes` (B) and `closed` (C); do not
build A.** B covers what A offers: the owner can issue a code and use it at once.
In every mode the proof of work and the #518 pricing apply unchanged. A code
only grants the right to try. It never lowers the price, because the identity
replicates to every node of its networks and one node cannot vouch for it to
the others.

### Shape

- `Node` gains `NodeRegistrationMode` (`open | codes | closed`), stored in
  `node_metadata` and recorded with a domain event like the relay
  configuration. It is set by owner-signed `PUT /node/registration`.
- `GET /node` (public) returns `registration: { mode }`, so a client knows
  before creating a key whether to ask for a code.
- Codes live in their own local collection with their own repository:
  - `POST /node/registration-codes` (owner-signed) takes `{ expiresAt, uses }`
    and returns `{ code }` once. The code is a random 256-bit value; the node
    stores only its SHA-256, the expiry and the remaining uses.
  - `GET /node/registration-codes` lists them by id without the code;
    `DELETE /node/registration-codes/{id}` revokes one.
- The newcomer sends `X-Registration-Code` with `POST /identities`. The record
  format does not change.
- **Order in `POST /identities`** (`PostIdentityRoute.ts:46-48`): the per-address
  limiter first, so codes cannot be guessed fast; then the registration check;
  then the publish limiter and the network admission limiter. Refused attempts
  therefore never consume the shared limits honest users depend on. A code use
  is reserved atomically before publishing and released if publishing fails,
  so a failed proof never burns a code and two concurrent requests cannot both
  spend the last use.
- Refusal: `403` with new code `403011`, "Identity creation on this node needs
  a valid registration code" or "is closed". One code for missing, unknown,
  expired and used codes, so a caller learns nothing about which codes exist.

## Blocking

### What a block does on this node

For a blocked identity, while it is blocked, this node:

- refuses every request authenticated as it, reads included, with `403` and new
  code `403012` "Identity is blocked on this node". The check runs right after
  `SignedHttpRequestAuthenticator` verifies the signature, in one place, so no
  route can forget it;
- refuses records it authored that are submitted through this node's API
  without a request signature (`POST /identities` with its id,
  `POST /identity-devices/transitions`, record-signed conversation routes);
- closes its open realtime connections when the block takes effect, and refuses
  new realtime tickets;
- sends no push notifications to its subscriptions;
- refuses new private blob reservations by it;
- excludes its content registrations from this node's replication budget
  (`ContentReplicationBudgetAllocator.ts:16-138`). They come out with
  `withinLocalBudget: false`, which the maintainer already skips
  (`ContentReplicationMaintainer.ts:57`), so this node neither fetches nor
  announces its content. Other owners share the budget it no longer uses.

### What a block never does

- It never deletes anything: not records, content bytes already held (the
  maintainer never removes a replica's bytes, `ContentReplicationMaintainer.ts:15`),
  private blobs, push subscriptions, mailboxes or the identity.
- It never hides or refuses the identity's replicated records. They are still
  stored, replicated, served to other users and counted by #518.
- It never touches mailboxes. Mailbox operations are anonymous capabilities
  (`opaque-mailboxes.md`), so the node cannot tell whose mailbox it is. Other
  bearer-capability routes, such as downloading an existing private blob, are
  likewise unaffected.
- It never affects other nodes, unless their owners adopt this list.
- It never applies to the node's own owner. A block entry for the owner is
  ignored.

Unblocking restores everything above at once; nothing has to be rebuilt.

### Block list format

The owner's client keeps the whole list as one document signed by the owner
identity:

```jsonc
{
  "type": "pigeon-node-block-list",
  "ownerIdentityId": "<owner identityId>",
  "version": 7, // strictly increasing
  "issuedAt": 1770000000000, // metadata only
  "blockedIdentityIds": ["<identityId>", "..."], // sorted, unique
  "identitySignature": "<ed25519 by the owner identity key over \"pigeon:node-block-list:v1\\n\" + canonical JSON without this field>",
}
```

- `PUT /node/blocks` (owner-signed request) stores a document whose signer is
  the current owner and whose version is higher than the stored one.
  `GET /node/blocks` (owner-signed) returns it. Adding or removing one identity
  is a new version written by the client.
- The document carries no reasons. A published list must not become a place
  for accusations or personal data; any note stays in the owner's client.
- The identity id is the public key, so anyone can verify the document from
  `ownerIdentityId` alone, without trusting the node that serves it.

### Sharing blocks (opt-in on both sides)

- **Publishing.** The owner turns on publication with owner-signed
  `PUT /node/blocks/publication { "published": true }`. The node then serves
  the stored document verbatim at public `GET /node/blocks/published`. It is
  off by default, because a published list reveals whom this owner blocked.
- **Adopting.** Another node's owner adds a source with owner-signed
  `PUT /node/block-sources/{ownerIdentityId} { "origin": "https://..." }`. That
  node periodically fetches `GET {origin}/node/blocks/published` and keeps the
  response only if:
  - the signature verifies against the **pinned** `ownerIdentityId`;
  - the version is higher than the last one kept, so a served old version
    cannot roll blocks back;
  - it fits the size limit.

  An unreachable source or an invalid response keeps the last valid version.
  Outbound requests reuse the private-address guard used for link previews
  (`LinkPreviewUrlGuard.ts`).

- **Effect.** This node blocks the union of its own list and every adopted
  list, never its own owner. Removing a source removes its effect at once.
- **No consensus.** Lists are never gossiped or merged into shared state. Each
  node decides whose lists to trust, one owner identity at a time.
- **Publisher owner change.** After a rotation or reset, the publisher's new
  documents are signed by another identity. Subscribers reject them and keep
  the last valid version until their owner pins the new identity. A new owner
  therefore cannot silently take over other nodes' block decisions.

## Interaction with existing limits

- **Proof of work and #518:** unchanged in every mode. Registration codes add a
  gate and never lower the price.
- **Per-node limits:** unchanged. Registration refusals happen before the
  publish limiter and the network admission limiter.
- **#557 budget:** registration control does not affect it. Blocked owners are
  left out of this node's allocation, as described above. Responsibility
  (`ContentReplicationStatusFinder`) is unchanged: for a blocked owner's
  content this node behaves like a node with an exhausted budget, which the
  network already handles.

## What other nodes see

- `GET /node` shows the registration mode.
- `GET /node/blocks/published` exists only when the owner publishes.
- Nothing else: no heartbeat field, no replicated record, no protocol change.

## Failure modes

| Failure                               | Effect                                                          | Recovery                                                                              |
| ------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Registration code leaked              | Up to its remaining uses can create identities until it expires | Owner revokes it; blocks identities created with it                                   |
| Owner offline                         | No new codes or blocks; everything already set keeps working    | None needed                                                                           |
| Owner key lost or stolen              | Settings frozen, or changed by the thief                        | Host-side owner reset, then claim again before exposing the API                       |
| Node reset                            | Registration open, blocks and sources gone, node unclaimed      | Claim, then restore the settings; a published list must be re-signed by the new owner |
| Adopted source unreachable            | Last valid version stays in effect                              | None needed; diagnostics show when it was last fetched                                |
| Adopted source publishes a bad list   | This node blocks whoever that list names                        | Remove the source; the effect ends at once and nothing was deleted                    |
| Publisher's owner changes             | Subscribers keep the old list and reject the new signer         | Subscriber owner pins the new identity if they trust it                               |
| Blocked identity uses other nodes     | Works as before; its records still reach this node's users      | Users block it in their clients; other owners adopt the list                          |
| Identities created through open nodes | They can use this node                                          | Blocking; registration control only removes this node as an entry point               |

## Usability

- **Default unchanged.** Open nodes and their users see no new step, field or
  latency.
- **Owner.** In node settings:
  - registration mode with one sentence explaining each;
  - create a code as a link or QR, see the remaining uses and revoke it;
  - block or unblock by identity id or handle;
  - publish the list on or off, add or remove sources, and see each source's
    last fetch.
- **Newcomer.** The client reads `registration.mode` from `GET /node`:
  - `codes`: it asks for the code, or takes it from the link;
  - `closed`: it explains that the node takes no new accounts and lets the user
    choose another node;
  - `403011` shows the same messages.
- **Blocked user.** `403012` shows "This node no longer serves your identity"
  and offers another node. Their data stays in the network.

## Implementation slices (after this design merges)

Red-first, each a complete cutover of its part. Endpoint changes update
`docs/api.md`, the nodes-api and identities-api swagger and `open-api.yaml`.

1. **Registration control.** `NodeRegistrationMode`, the registration code
   collection, the check in `POST /identities`, `/node/registration` and
   `/node/registration-codes`, and `GET /node`.
2. **Local blocking.** The signed block list value objects, `PUT`/`GET
/node/blocks`, one `NodeBlockPolicy` and every enforcement point above.
   This includes the inventory of record-signed write routes.
3. **Sharing.** Publication, sources, the fetcher with verification, and
   diagnostics.
4. **Owner reset.** The host-side command and `INSTALLATION.md`.
5. **UI** (haskou/pigeon-swarm-ui): owner settings, newcomer and blocked
   states.

## Open questions (owner decisions needed)

1. **Registration modes.** Recommendation: `open`, `codes` and `closed`, with
   no owner-only creation (option A). B covers A's use case with far better
   usability.
2. **Code limits.** Recommendation: single use by default; the owner may allow
   more uses and choose the expiry, up to a maximum the slice makes
   configurable. The question is whether multi-use codes are wanted at all.
   They suit a club invite link, and a leak costs more.
3. **Sharing transport.** Recommendation: the subscriber pulls the signed
   document from the publisher node's origin. It needs no protocol change and
   no replicated state. Alternatives: a replicated collection of signed lists,
   which reaches nodes without HTTP access to each other but adds shared
   state; or manual import of the document, which needs no network access but
   goes stale.
4. **Applying adopted updates.** Recommendation: apply new versions
   automatically (subscribing means trusting that owner), plus a local
   exception list so an owner can keep one identity unblocked without dropping
   the whole source. The alternative is a review queue the owner approves; it
   is safer but slow, and ignored lists go stale.
5. **List size limit.** A bound is needed for storage and for fetched
   responses. Recommendation: 10 000 identities per document, for both a
   node's own list and each adopted list.
6. **Owner reset mechanism.** Recommendation: a host-side command that clears
   only the owner and this design's settings, besides documenting full
   deletion of the local database folder. Full deletion also loses mailboxes,
   networks and the node id, which is too costly for a lost key. The
   alternative is documenting full deletion only.

# Owner-approved node admission (optional)

Status: design for issue #384. Owner decision: the price-based admission model
stays the default. A node owner can switch **their own node** to a mode where
the node serves, stores and replicates only identities the owner approved. The
mode is optional, per node and off by default. There is no network admin and no
cross-node admission state.

## Problem

Any key that pays the admission proof can join a network and use any node of
it (`identity-authentication.md` (f)). The price is bounded network-wide (#518),
and the bytes a flood can make a node fetch are bounded per network (#557).
Minting itself is not bounded, and a node operator who runs a node for a known
group (a family, a company, a club) has no way to say "this node is for these
people". The operator already exists in the code as the **node owner**; this
design gives the owner that switch.

## Goals and non-goals

- A node is either **open** (today, the default, no change for anyone) or
  **owner-approved**: it acts for an identity only when that identity is the
  node owner or is on the owner's admitted list.
- The decision is local to the node. It needs no replicated record, no
  consensus and no handover log. Other nodes and networks are unaffected.
- Identity validity, the proof of work, record formats and the replicated
  stores do not change.
- Non-goal: deciding who takes part in a network. An identity refused by one
  node can still use any open node of the same network, and its records still
  replicate to every node, this one included.
- Non-goal: hiding public network data. Unauthenticated reads (`GET /node`,
  `GET /identities/{identityId}`, public IPFS content) stay as today; the same
  data is available from every other node.
- Non-goal: several owners. A node has one owner today; this design keeps it.

## Who decides: the existing node owner

The node owner is the node admin. This design reuses it unchanged:

- **Definition.** `Node` holds an optional `owner: IdentityId`
  (`src/contexts/nodes/domain/Node.ts:34`), exposed by `hasOwner` and
  `isOwnedBy` (`Node.ts:107-113`) and persisted in the local embedded database
  (`LocalNodeMetadataRepository.ts`, namespace `node_metadata`). It is not
  replicated and other nodes never decide anything with it.
- **Authentication.** Owner-only routes extend `NodeOwnerRouteSupport`
  (`src/apps/apis/nodes-api/routes/NodeOwnerRouteSupport.ts:17-53`): the request
  is verified by `SignedHttpRequestAuthenticator` (signature, freshness, replay)
  and must come from `node.isOwnedBy(...)`, else `403010`
  (`AuthenticatedIdentityIsNotNodeOwnerError`). The signature is checked against
  the identity's public key carried in `X-Identity-Id`
  (`SignedHttpRequestVerifier.ts:50-77`), so the owner is bound to the node by
  that key alone.
- **Rotation.** `PUT /node/owner` (`PutNodeOwnerRoute.ts:24-39`) through
  `Node.assignOwner` (`Node.ts:78-90`): once claimed, only the current owner can
  name the next one. The admitted list belongs to the node and survives an
  owner change; the new owner is admitted as owner, and the previous owner stays
  admitted only if they are on the list.
- **Recovery.** Ownership follows the owner identity's key: whatever recovers
  that identity on a new device recovers the ownership. If the key is lost or
  stolen, no reset path exists today (see open questions).
- **Unclaimed nodes.** Owner-approved mode needs an owner. Enabling it uses the
  strict owner check (`assertOwnerCanManageNode`, not the `WhenClaimed`
  variant), so an unclaimed node is always open. Pre-existing residual: before
  the first claim, any signed caller can claim the node and name any identity
  (`PutNodeOwnerRoute.ts:32`). Operators should claim a node before exposing it.

## Configuration

The setting lives on the node, beside the relay configuration, and is changed
the same way: owner-signed API calls persisted in the local database. No
environment variable.

```http
PUT /node/admission                       (owner-signed)
{ "mode": "owner_approved" }              // or "open"

PUT    /node/admission/identities/{identityId}   (owner-signed) → 204
DELETE /node/admission/identities/{identityId}   (owner-signed) → 204
GET    /node/admission                           (owner-signed)
→ { "mode": "owner_approved", "identities": ["<identityId>", "..."] }
```

- A node that never calls these is `open` and behaves exactly as today.
- `GET /node` (public) gains `admission: { mode }` so a client knows before
  signing in that the node needs approval. The admitted list is never public
  and never leaves the node.
- Adding an identity id that has not been published yet is allowed. The id is
  the public key, which the client creates before publishing, so the owner can
  admit a newcomer first.
- The owner is always admitted and cannot be removed from the list (there is
  nothing to remove; the check is `isOwnedBy || listed`).

Domain shape: a `NodeAdmissionMode` value object (`open | owner_approved`) on
`Node`, recorded with a domain event like the relay configuration; the admitted
identities in their own local collection with their own repository, because the
list can be long; one domain service, `NodeAdmissionPolicy.isAdmitted(identityId)`,
used by every enforcement point below.

## What "not admitted" means on this node

Only on this node, only while its mode is `owner_approved`.

### Serving (API)

The rule: a node acts **for** an identity only if that identity is admitted.
Acting for an identity is anything the identity authenticates to:

- **Signed requests.** Every route that calls `SignedHttpRequestAuthenticator`
  (calls, communities, conversations, content registration and upload, keychains,
  link previews, notifications, polls, presence, private authorization, private
  blob reservations, push subscriptions, realtime tickets, stickers, identity
  updates) refuses a non-admitted identity with `403` and a new code, `403011`
  "Identity is not admitted on this node". The check runs after signature,
  freshness and replay checks, in one place, so no route can forget it.
  `authenticate` is synchronous today; the slice makes the admitted variant
  asynchronous.
- **Record-signed writes without a request signature** (`POST /identities`,
  `POST /identity-devices/transitions` and any write route that authorizes by
  the record's own proof) check the record's author identity the same way.
- **Live connections.** Removing an identity, or switching the mode on, closes
  its open realtime connections; new tickets are refused.
- **Capability routes.** Bearer-token routes follow the request that issued the
  capability: `PUT /private-blobs/{blobId}` needs a reservation, which a
  non-admitted identity cannot get. Mailbox envelopes (`POST
/mailboxes/{id}/envelopes`) stay open, so anyone can still reach an admitted
  user. Mailbox creation is an open question.

Effect for people outside the list: their own node keeps working for them, and
they can still message, call and share with admitted users through it. Private
attachments they send keep their sender-home replica; only the extra replica
on this node is refused, which `private-blob-store.md` (D3) already tolerates.

### Storing and replicating small records (OrbitDB)

Unchanged. The node still holds the network stores and admits records with the
existing gates. Admitted users' conversations, communities and calls contain
records written by identities on other nodes; filtering stores by author would
break them, and per-node filters would make nodes disagree on replicated state.
The existing per-identity caps and #518 still bound this.

### Replicating content (#557)

- `ContentReplicationBudgetAllocator` shares the per-network budget max-min fairly
  by owner (`ContentReplicationBudgetAllocator.ts:16-133`). In owner-approved
  mode only admitted owners enter the allocation. Non-admitted owners'
  registrations come out with `withinLocalBudget: false`, which the maintainer
  already skips (`ContentReplicationMaintainer.ts:57`), so this node never
  fetches or announces their bytes, and admitted owners share the whole budget.
  The budget value and the per-identity quota do not change.
- Removing an identity stops new fetches and announcements of its content.
  Bytes already held stay, as today: the maintainer never removes a replica's
  bytes (`ContentReplicationMaintainer.ts:15`). See open questions.
- Responsibility (`ContentReplicationStatusFinder`) is computed from active
  peers. Other nodes cannot know this node's list, so they still count it as
  responsible. For a non-admitted owner, this node then behaves exactly like a
  node whose budget is exhausted, which the network already handles. See open
  questions.

### Admission observation (#518)

Unchanged: it observes network records, which every node still verifies and
stores.

## What other nodes see

Nothing new. No heartbeat field, no replicated record, no protocol change. They
see this node not fetching or announcing some content, as with an exhausted
budget, and their users get `403011` if they call this node directly. The mode
is visible only through this node's own `GET /node`.

## Failure modes

| Failure                                    | Effect                                                                        | Recovery                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| Owner offline                              | Newcomers cannot be admitted; admitted users are unaffected                   | None needed                                          |
| Owner identity key lost                    | The list and the mode can no longer be changed; the node keeps enforcing them | None today (see open questions)                      |
| Owner identity key stolen                  | The attacker can change the list and the mode, or take ownership              | None today (see open questions)                      |
| Mode switched on with existing users       | Every identity except the owner is refused until listed                       | Owner adds them; the UI warns before switching       |
| Mode switched off                          | The node is open again; nothing was deleted                                   | The list stays stored and unused                     |
| Identity removed while connected           | Its realtime connections close; its next request gets `403011`                | Owner adds it again                                  |
| Non-admitted owner's content counted on us | One fewer real replica for that content                                       | Same as budget exhaustion; other nodes still hold it |
| Flood of identities calling this node      | Refused after one signature check per request; no state is created            | None needed                                          |

## Usability

- **Default unchanged.** Open nodes get no new step, latency or screen.
- **Owner.** One toggle and one list in node settings: add by identity id or by
  handle lookup (identities are public), remove, and a warning before
  switching the mode on that lists what will stop working.
- **Newcomer.** The client reads `admission.mode` from `GET /node`. On an
  owner-approved node it creates the key, shows the identity id to share with
  the owner, and publishes once admitted. Any `403011` shows "This node only
  serves people its owner approved" instead of a generic error.

## Implementation slices (after this design merges)

Red-first, each a complete cutover of its part. Endpoint changes update
`docs/api.md`, the nodes-api swagger and `open-api.yaml`. The mode must not
ship without enforcement, so slices 1 and 2 land together.

1. **Setting.** `NodeAdmissionMode`, the admitted-identity collection and
   repository, `NodeAdmissionPolicy`, the `/node/admission` endpoints, `GET /node`.
2. **Enforcement.** The admitted authenticator used by every signed route, the
   record-author check on record-signed writes, closing realtime connections,
   and the allocator filter. Includes the route inventory.
3. **UI** (haskou/pigeon-swarm-ui): owner settings and the newcomer state.

## Open questions (owner decisions needed)

1. **Mailbox creation.** `PUT /mailboxes/{mailboxId}` is anonymous by design
   (`opaque-mailboxes.md`), so the node cannot tell who creates a mailbox, and
   strangers can fill an owner-approved node with mailboxes paid only by proof
   of work. Recommendation: on owner-approved nodes, require the creation
   request to be signed by an admitted identity, checked and not stored, and
   keep envelope posting open. This lets the owner see which admitted identity
   creates a mailbox at creation time. The alternative is to leave creation as
   today.
2. **Content held for a removed identity.** Recommendation: keep it (stop
   fetching and announcing only), as the maintainer has no removal path and a
   removed identity may be added back. The alternative is to unpin it to
   reclaim space.
3. **Responsibility of owner-approved nodes.** Recommendation: leave
   responsibility unchanged and decline like an exhausted budget, with no new
   protocol. The alternative is to advertise the mode in the heartbeat, so
   peers stop counting such a node for content it may decline. That adds an
   unsigned heartbeat field, and a network made only of owner-approved nodes
   would then have no responsible node at all.
4. **Join requests.** Recommendation: none. The newcomer shares the identity id
   out of band, and the owner adds it. A request endpoint would be a write
   surface open to non-admitted identities and would need its own cap.
5. **Turning the mode on.** Recommendation: the list starts empty and the UI
   warns. The alternative is to seed it with identities this node already
   serves (push subscriptions, content registrations), which is less work for
   the owner but may admit people the owner never chose.
6. **Lost or stolen owner key.** No owner reset exists today, and this mode
   makes the owner key more valuable. Recommendation: a separate issue for a
   host-side reset (whoever controls the host already controls the node), not
   part of these slices.

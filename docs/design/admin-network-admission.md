# Admin-approved network admission (optional)

Status: design for issue #384. Owner decision: the price-based admission
model stays the default, and an operator can opt a network into a mode where a
network admin approves new identities. The mode is never mandatory.

## Problem

Today any key that pays the admission proof can join any network
(`identity-authentication.md` (f)). The price is bounded network-wide (#518), and
the replicated bytes a flood can make a node fetch are bounded per network
(#557). Minting itself is not bounded: "only an admission authority could do
that" (`identity-authentication.md`, remaining non-goals). Some networks are
closed groups (a family, a company, a club) whose operators know every member
and prefer a gatekeeper over a price. Nothing in the code can express one
today. `NetworkId` is a random UUID, `Network` is `{ id, name, key? }` held in
each node's local database, and the only "owner" is the node owner, who
governs one node, not a network.

## Goals and non-goals

- A network either stays **open** (today, the default, no change at all for
  its users) or becomes **admin**: an identity takes part in it only once the
  network admin approved it.
- The admin is a key every node verifies from signed, replicated records, not
  a node operator's word. The admin can be handed over and survives device
  loss.
- Validity of identity records and the proof of work do not change. No
  existing record format changes.
- Non-goal: hiding who is a member. Identities are public records, and so are
  approvals.
- Non-goal: protecting a network from its own admin. An admin can refuse
  anyone and revoke anyone. That is the point of the mode, and the operator
  opts into it.

## Configuration

The mode is a property of each network on each node, not an environment
variable: a node hosts several networks, and networks are already configured
through the node API and persisted in the local database
(`INSTALLATION.md`, private networks).

```jsonc
// POST /node/networks (and a new owner-signed PUT /node/networks/{networkId}/admission)
{
  "id": "<networkId>",
  "name": "family",
  "key": "<optionalPrivateNetworkKey>",
  "admission": {
    "mode": "admin", // "open" when omitted
    "authorityIdentityId": "<identityId>", // the genesis admin
  },
}
```

- Omitted `admission` means `open`. A node that never sets it behaves exactly as
  today.
- Changing it is restricted like other network changes: owner-signed once the
  node is claimed.
- `GET /node/networks` returns `admission` for every network to anyone. It
  holds no secret, and clients need it to show the right state.
- The node heartbeat (`nodes.v1.node.heartbeat.was_sent`, which already lists
  `networks` with `id`, `name` and `type`) gains the admission mode and the
  genesis authority. Diagnostics can then show nodes of one network that
  disagree (see Failure modes).

Every node of an admin network must be configured with the same genesis
authority, the same way every node of a private network must share its key.
The authority travels out of band with the network id (and key).

## Who the admin is

The admin is a Pigeon **identity**, not a bare key. That reuses machinery that
already exists and is already verified on every node:

- **Signed and verifiable.** Admin actions are operations signed exactly like
  community operations (`pubsub-sync-protocol.md`, Community signed
  operations): an `identitySignature` by the admin identity key plus a
  `PublicMutationProof` by one of its authorized devices at a claimed
  authorization revision. Any node or client verifies them without trusting a
  node.
- **Device rotation and loss.** The admin adds and removes devices with the
  existing device authorization chain. A lost device is revoked, a stolen one
  is capped with `compromisedSince` (#386), and a lost device set is replaced
  through the identity's recovery authority. Approvals signed by a revoked
  device before its revocation stay valid. Those signed by a capped device
  from its cap on are void (`causal-device-authorization.md`).
- **Handover (rotation of the admin itself).** The current admin signs an
  `authority_handed_over` operation that names the next admin identity. From
  that operation on in the ledger, only the new admin's operations count.
- **Genesis.** The first admin is the configured `authorityIdentityId`. The
  configuration only names the root. Every later admin is derived from signed
  handovers, so operators configure the authority once, not again on each
  rotation.

## Approval ledger (record format)

Each admin network gets one new collection, `networkAdmissionOperations`, in
that network's stores. Like `communityOperations`, the network has no state
document. Its admission state is the deterministic fold of immutable signed
operations:

```jsonc
{
  "id": "network-admission:<networkId>:op:<digest>",
  "scopeType": "network_admission_operation",
  "networkId": "<networkId>",
  "authorIdentityId": "<current admin identityId>",
  "action": "identity_approved" | "identity_revoked" | "authority_handed_over",
  "args": { "identityId": "<subject>" } | { "authorityIdentityId": "<next admin>" },
  "parents": ["<digest>", "..."],   // sorted ledger frontier the admin had seen, ≤ 64; [] for the first op
  "createdAt": 1770000000000,       // metadata only, never decides anything
  "identitySignature": "<ed25519 over \"pigeon:network-admission-operation:v1\\n\" + id>",
  "mutation": { /* PublicMutationProof v2, put, sequence 0, signed by an admin device */ }
}
```

- `digest` is the base64url SHA-256 of the canonical payload without `id` and
  `identitySignature`, as for community operations.
- **Gate.** The new policy admits an operation only when its signature and
  device proof verify, it names this store's network, and its author is the
  admin in the fold of its `parents`. Admission depends on the operation's
  causal past, not on what the node holds when it evaluates the operation. An
  operation with an unknown parent is demoted and readmitted like a community
  operation. No one but the admin can write to the ledger.
- **Fold.** An identity is _approved_ on the network when its latest decision
  in the ledger is `identity_approved`. Decisions about one identity are
  ordered causally. Concurrent decisions (two admin devices, a partition) fail
  closed: `identity_revoked` wins. Concurrent handovers resolve to the one with
  the lowest digest, so every node converges on one admin.
- The fold depends only on the set of operations and the configured genesis.
  Arrival order, replay and partition healing yield the same state on every
  node configured alike.

## How replication treats unapproved identities

The identity record itself is unchanged and still replicates. The gate checks
validity (signature, proof of work, at most 32 networks) as today. The identity
record naming an admin network **is** the request to join, and the admin sees
it without any further step from the newcomer.

On an admin network, a node treats an identity that is not approved there as
if it did not name that network:

- **API.** Authenticated requests that act on that network (creating
  conversations, communities, calls, polls, notifications, content
  registrations; joining with an invite) get `403` with a dedicated code
  meaning "not admitted on this network". Creating or updating the identity
  itself still works, so a newcomer can register and wait.
- **Replicated records.** Records whose author is not approved on the record's
  network are not projected, returned, counted or acted upon. This follows the
  network binding rule in `api.md`, which ignores a copy of a record found in
  another network's store. Filtering happens at read time, not at the write
  gate. Readmission gives up after about 72 s, so a gate refusal would be final
  for a record that arrived before its author's approval and would diverge
  nodes. A read-time filter makes approval take effect on every record already
  held, and revocation takes effect the same way.
- **Discovery.** Identity lookups scoped to the network (members, presence
  targets, handle search through that network) list only approved identities.
  The admin's pending view lists the rest.
- **Proof of work** is still required and priced as today. Admin mode adds a
  gate and does not replace the price, so a flood of pending identities costs
  the same as now and stays bounded by #518.

## Interaction with #557 and with invites

- **Replication budget (#557).** `ContentReplicationBudgetAllocator` shares
  `CONTENT_REPLICATION_NETWORK_BUDGET_BYTES` max-min fairly by owner. On an
  admin network only approved owners enter the allocation, so unapproved
  identities receive no bytes and cannot dilute honest owners' shares. The
  budget, its default and the per-identity quota do not change. A revoked
  owner's registrations stop being fetched or provided. As today, bytes already
  held are not removed.
- **Admission observation (#518)** keeps counting fresh identity records,
  pending ones included, because they still cost every node verification and
  storage.
- **Community invites** do not grant network admission. An invite redeemed by
  an identity that is not approved on the community's network is refused with
  the "not admitted" code. Otherwise every member holding an invite would act
  as an admin.
- **Admission invites** (admin-signed tokens that let a newcomer in without the
  admin online) are not part of this design. They would need the same
  possession proof that community invites still lack (#550), and their use
  limits would not converge (see `pubsub-sync-protocol.md` on `maxUses`). See
  open questions.

## Failure modes

| Failure                                        | Effect                                                                                                                         | Recovery                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Admin offline                                  | Newcomers wait; members are unaffected                                                                                         | None needed; approvals apply on arrival                                                                                             |
| Admin device lost or stolen                    | The stolen device can approve or revoke until it is capped                                                                     | Revoke with `compromisedSince`: decisions it signed from the cap on are void on every node                                          |
| Admin identity key or recovery authority lost  | No further decisions or handover possible                                                                                      | Out of band: every operator configures a new genesis authority                                                                      |
| Admin identity key compromised                 | The attacker can approve, revoke and hand over                                                                                 | Out of band, as above; the ledger of the old genesis is abandoned                                                                   |
| Nodes configured differently (mode or genesis) | Each node is self-consistent, but they disagree on who takes part; open nodes serve unapproved identities to their own clients | Heartbeat shows the mismatch; operators align. An admin node never projects an unapproved author's records, whatever its peers hold |
| Approval arrives after a member's records      | Those records are hidden until the approval replicates                                                                         | Read-time filter: no loss                                                                                                           |
| Partition with concurrent approve and revoke   | Revoke wins after heal                                                                                                         | Admin approves again                                                                                                                |
| Mode switched on for an existing network       | Every existing member is unapproved until approved                                                                             | The admin client approves the existing members (see open questions)                                                                 |
| Mode switched off                              | Every record becomes visible again (nothing was dropped)                                                                       | Ledger stays stored and is ignored                                                                                                  |
| Flood of unapproved identities writing records | Their small records are stored (bounded per identity, not in aggregate) but never projected; their content is never fetched    | Residual, see open questions                                                                                                        |

## Usability

- **Default unchanged.** Open networks get no new field, step, latency or
  screen. Nothing is enabled by default.
- **Newcomer.** Creating an identity on an admin network succeeds. The client
  reads `admission.mode` from the node and shows "waiting for approval by
  <admin handle>" instead of failing. `GET
/networks/{networkId}/admission/identities/{identityId}` answers
  `approved | pending | revoked`, and the client refreshes when the approval
  replicates.
- **Admin.** A pending list (identities naming the network with no decision)
  plus approve and revoke actions. The admin client signs the operations, and
  `GET /networks/{networkId}/admission/operations` serves the signed ledger
  verbatim so any client can verify it.
- **Operator.** One setting per network (mode plus genesis admin) and one
  mismatch indicator in diagnostics.

## Implementation slices (after this design merges)

Each slice is red-first and a complete cutover of its part. Endpoint changes
update `docs/api.md`, the swagger files and `open-api.yaml`, and the new
collection updates `pubsub-sync-protocol.md`.

1. **Network setting.** `NetworkAdmission` value objects on `Network`, API
   fields, persistence and heartbeat. No enforcement yet. An admin network with
   no ledger code yet behaves as open, and slice 3 does not ship separately
   from slice 2.
2. **Ledger.** Operation, fold (`NetworkAdmissionLedger`), mutation policy and
   gate, readmission, the `GET`/`POST .../admission/operations` and status
   endpoints.
3. **Enforcement.** One domain service ("is this identity admitted on this
   network") consulted by the API authorization of network-scoped routes, the
   network-scoped read projections and the content replication allocator. No
   central membership check exists today, so this slice includes the call-site
   inventory.
4. **UI** (haskou/pigeon-swarm-ui): pending state, admin pending list, approve
   and revoke.

## Open questions (owner decisions needed)

1. **Scope.** Is admin mode per network (proposed), or should it be per node?
2. **Binding the genesis admin.** Operator configuration on every node
   (proposed; can be enabled on existing networks), or a network id derived
   from the admin identity and a nonce, as `CommunityId.derive` does? The second
   is self-certifying and cannot be misconfigured, but works only for new
   networks.
3. **One admin or several.** A single admin with handover (proposed), or an
   admin set? If a set, does any one member decide, or is a threshold needed?
4. **Revocation scope.** Retroactive: hide every record of the revoked identity
   on that network (proposed; convergent without new record fields). Or only
   records after the revocation? That needs every network record to carry the
   ledger frontier it was signed at, which changes every record format.
5. **Unapproved records at the gate.** Store and filter at read time
   (proposed; reversible and lossless), or refuse at the gate to bound storage?
   Refusing loses records that arrive before their author's approval.
6. **Handles.** Should handle ownership on an admin network rank only approved
   identities? Today ownership is computed across all valid identities.
7. **Turning the mode on for an existing network.** Should existing members be
   approved one operation each by the admin client, or should the first
   operation carry a list of grandfathered identities? If a list, what is its
   size limit?
8. **Admission invites.** Are admin-signed invite tokens wanted at all? If so,
   with what expiry and use limit? They wait on the #550 possession proof.
9. **Pending list visibility.** Admin-signed requests only (proposed), or
   public like identities?
10. **Error code and endpoint names.** The new `403` code value and the final
    paths follow the existing numbering; confirm before slice 2.
11. **Aggregate bound on pending identities.** Should an admin network cap the
    number of pending identities, or their records, it stores? If so, at what
    value?

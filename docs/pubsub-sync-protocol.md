# Pub/sub synchronization protocol

## Identity publications

`identities.v1.identity.was_created` and
`identities.v1.identity.was_updated` include the exact
`externalIdentifier` CID produced by the signed publication. Consumers fetch
and validate that candidate directly against the event aggregate identity and
its previous-version chain. They must not resolve the event through a DHT
routing record: OrbitDB metadata is the canonical discovery index.

The remaining attributes describe the published identity metadata:
`deviceCredentialCommitment`, `handle`, `networkIds`,
`previousExternalIdentifier`, `recoveryAuthority`, and `version`. Consumers use
the commitment and recovery authority only after validating the exact signed
identity candidate referenced by `externalIdentifier`; event attributes do not
replace that signature-chain validation.

Identity and keychain metadata documents are the canonical replicated state.
They are not duplicated in the optimized `heads` store. Each node projects the
documents into its local head cache after a successful local write, as replicated
updates arrive, and when a store is hydrated. This keeps lookups by identity id,
handle, keychain owner, and historical keychain CID available without a second
OrbitDB write path. Projection hydration yields to the Node.js event loop after
each bounded batch; it does not rescan documents on HTTP reads or write repaired
heads back into OrbitDB.

## Private relay records

Private relay records use two gossipsub topics derived from the private network
key: `pigeon-swarm.private-relay-records.v1.<scope>` for encrypted records and
the same topic with `.request` appended for record requests. A node subscribes
to the record topic, publishes an empty request payload, and an active relay
replies on the record topic with its current encrypted record.

The request and reply are node-to-node transport messages. They have no
frontend consumer and never use IPNS or public IPFS content blocks. Relay
providers may announce a synthetic CID in the public Kademlia DHT so another
node can locate and connect to them; the CID is a discovery key without a block
payload. The encrypted relay record itself remains on the scoped gossipsub
topic.

The public relay-record connection has no HTTP or Bitswap block brokers and
uses ephemeral blockstore/datastore instances. It still provides Kademlia,
gossipsub and circuit-relay transport. IPFS blocks transferred through a
private `/p2p-circuit` stream are exchanged by its endpoint nodes and are not
retained by the public relay.

## Call relay records

`pigeon-swarm.call-relays.v1` carries versioned signed TURN advertisements:

- Version 1 retains the peer signature and pool HMAC. It can be published on the public network; peer identity, public key, TURN URLs and issuance/expiry timestamps are public metadata. Issuers in a v1 pool require the same private TURN secret.
- Version 2 is published and accepted only within private networks. It uses the peer signature with `poolSignature: ""` and no shared pool HMAC. The private network still reveals relay topology to its members. Public-network v2 records are ignored. Older backends reject v2 records and cannot use this path until upgraded.

Publishers advertise at most the first eight distinct configured TURN URLs; the same bounded list is used by the v2 issuer. Neither version includes master secrets or client credentials. Receivers reject invalid signatures, empty/non-TURN URL lists, more than eight URLs, records larger than 8192 bytes and expired records. `issuedAt` and `expiresAt` are safe integer Unix milliseconds with `0 <= issuedAt < expiresAt`. Only a strictly newer issuance replaces the stored record for a peer, including when its expiry is earlier. The ICE endpoint selects currently connected circuit relays; v2 URLs are never passed to the legacy local-secret issuer.

Publishers normalize `CALLS_TURN_RECORD_TTL_MS` before signing: it must be a positive whole number producing a safe integer expiry. Invalid values use ten minutes, with a five-minute publication interval unless configured otherwise.

V2 credential exchange uses `/pigeon-swarm/turn-credentials/2.0.0` on an existing encrypted libp2p connection in a shared private network. Opening the stream requests credentials without a body. The owner verifies that the connection is encrypted and open, the private network is still registered and local TURN issuance is configured. Private-network access authorizes issuance; no per-conversation membership proof is claimed.

The response starts with a four-byte unsigned big-endian body length, followed by a UTF-8 JSON body. The reader completes as soon as the declared body arrives, without relying on stream closure; zero, oversized and incomplete frames are rejected. The JSON body contains exactly `urls`, `username` and `credential`. The username is `<expiryUnix>:<opaquePeerSubject>`, with a ten-minute lifetime; the password uses the owner's coturn secret. JSON bodies are bounded to 8192 bytes (8196 including the length prefix), eight previously advertised URLs and a five-second exchange. No exchange payload is published through gossip, replicated or logged. Clients choose at most three relays and cache until thirty seconds before expiry while checking current eligibility and advertisement issuance; newer owner records invalidate cached credentials. Owners enforce ten requests per peer and one hundred globally per minute. See [independent TURN deployments](federated-turn.md) for privacy limits, rotation and executable validation.

## Identity presence leases

`presence.v1.identity_presence.was_updated` replicates ephemeral presence over
the domain-event pub/sub transport. It is never persisted in OrbitDB or IPFS.

Each event identifies the lease owner with `ownerNodeId`. Nodes keep leases by
`(identityId, ownerNodeId)`, ignore an older snapshot only within that same
pair, and select the newest connected lease when serving presence reads.
Every authenticated client heartbeat publishes a fresh snapshot, even when the
derived status has not changed.

Only the owner node may publish the transition of its lease to `disconnected`.
Other nodes derive that transition in their local in-memory copy after the
heartbeat timeout. This prevents one node from expiring a still-active lease
owned by another node.

Selected status and custom message use `preferenceUpdatedAt`, which changes only
when the user updates those preferences. Reads merge the newest preference into
the selected live lease. A later heartbeat with an older preference therefore
cannot override `busy`, `invisible`, or a custom message selected on another
node.

The event attributes are:

```json
{
  "identityId": "<identityId>",
  "ownerNodeId": "550e8400-e29b-41d4-a716-446655440001",
  "preferenceUpdatedAt": 1770000000000,
  "selectedStatus": "available",
  "status": "available",
  "customMessage": "Building the swarm",
  "lastHeartbeatAt": 1770000000000,
  "lastRenewedAt": 1770000000000,
  "lastActivityAt": 1770000000000,
  "updatedAt": 1770000000000,
  "networkIds": ["<networkId>"]
}
```

`customMessage`, `lastHeartbeatAt`, `lastActivityAt`, and `networkIds` may be
absent. `identityId`, `ownerNodeId`, `preferenceUpdatedAt`, `selectedStatus`,
`status`, and `updatedAt` are required.

## Durable call state convergence

Conversation call snapshots in the private network's OrbitDB `calls` store merge each
participant independently. A later snapshot for one participant cannot overwrite
another participant's newer join or departure. Participant revisions use the
latest join, leave, decline or missed timestamp. Equal timestamps use a stable
status order: left, missed, declined, joined, then ringing. Ended and missed calls remain
terminal when active snapshots arrive later; ended takes precedence over missed.

A fresh call projection replays the store's causal log history, including earlier
snapshots hidden by the document index. Incremental replay stops at previously
processed heads. Each new subscriber receives its own initial history, and
initialization waits for that subscriber to finish processing it. Missing log
ancestors fail initialization instead of presenting partial call state as ready.
Each history replay stages its changes until completion, retaining the previous
complete query state in the meantime. Failed replays discard only their own
staged changes and restore the previous traversal frontier so a retry can read
the same entries again. Overlapping successful replays remain visible.

When merging recovers state missing from an incoming snapshot, the existing
coalescing call writer persists the combined document to the same network store.
Repairs are scheduled after replay completes; identical merged snapshots and
gossip-only projection updates do not schedule another repair. Reopening the store
therefore retains the recovered participant state. No additional pubsub event or
heartbeat field is introduced by this repair.

Community voice documents retain only session lifecycle and scope. Participant
arrays are empty, and creator/ender identities are omitted. Runtime participation
is hydrated from unexpired in-memory leases. Community participant fields
are stripped before projection and canonical repair; replaying old history cannot
restore a participation grant. This rewrites current documents, not immutable
blocks or copies already held by peers.

## Call participant leases

`calls.v1.participant_lease.was_updated` replicates ephemeral call membership
connectivity without writing heartbeat timestamps to OrbitDB. Leases are keyed
by `(callId, participantIdentityId, ownerNodeId)`, allowing a direct call to be
created on one node while another participant joins and renews from a different
node.

Every heartbeat publishes a connected snapshot. After the timeout, all nodes
remove their stale local copy, but only the owner publishes the disconnected
snapshot. Conversation documents retain lifecycle and participant history;
community documents retain lifecycle only. Neither stores heartbeat timestamps.

Community participation expires sixty seconds after the last real join or
heartbeat (`lastRenewedAt`), independent of timeout transition timestamps.
An explicit departure sets `leftAt` and invalidates that owner's participation
immediately. A heartbeat cannot undo a departure, even when another node still
holds a grant for the same identity; re-entry requires an explicit join. Losing
runtime state on restart requires explicit re-entry on that serving node. A fresh
lease from another owner restores remote presence only; it does not authorize
heartbeat on the restarted node. A conversation heartbeat can recreate its runtime lease from
persisted joined state.

Incoming leases older than sixty seconds or more than five seconds ahead of the
local clock are rejected, including after tombstone cleanup. Equal-time explicit
leave wins over timeout and connected updates. Routing participant lists are
replaced on renewal rather than accumulated. Nodes must keep their clocks in sync.
These are retention and freshness checks, not protection against a malicious
network member forging new lease events.

```json
{
  "callId": "550e8400-e29b-41d4-a716-446655440010",
  "connectionChanged": true,
  "mediaConnectionsChanged": true,
  "participantsChanged": true,
  "mediaConnections": [
    {
      "localCandidateType": "relay",
      "protocol": "udp",
      "relayProtocol": "udp",
      "relayUrl": "turn:relay.example:3478?transport=udp",
      "remoteCandidateType": "relay",
      "remoteIdentityId": "<remoteIdentityId>",
      "state": "connected"
    }
  ],
  "participantIdentityId": "<identityId>",
  "participantIds": ["<creatorIdentityId>", "<participantIdentityId>"],
  "ownerNodeId": "550e8400-e29b-41d4-a716-446655440012",
  "networkId": "550e8400-e29b-41d4-a716-446655440011",
  "lastHeartbeatAt": 1770000000000,
  "lastRenewedAt": 1770000000000,
  "status": "connected"
}
```

Media connection reports are replaced on every participant heartbeat. They
describe the selected ICE path observed by the browser for each remote
participant. Reports remain node-to-node only; browser live snapshots omit
ICE diagnostics, lease ownership and heartbeat timestamps. Only presence
changes trigger browser snapshots. Reports are cleared when the lease
disconnects and are never persisted in OrbitDB/IPFS.

## Call signal delivery

`calls.v1.signal.sent` carries ephemeral WebRTC offers, answers and ICE
candidates. Every node subscribes to the event so a recipient connected to a
different node receives it immediately. The event is routed only through the
call network selected by `networkId`; it is never persisted in OrbitDB or IPFS.

The sender node retains a bounded in-memory delivery until the recipient
acknowledges it or its 20-second TTL expires. It republishes the signal after
1, 2, 4 and 8 seconds. Every attempt has a new domain event id but retains the
same `signalId`, allowing recipients to acknowledge duplicates without
applying SDP or ICE twice.

Signal event attributes are:

```json
{
  "attempt": 1,
  "callId": "<callId>",
  "expiresAt": 1770000020000,
  "networkId": "<networkId>",
  "ownerNodeId": "<nodeId>",
  "participantIds": ["<senderIdentityId>", "<recipientIdentityId>"],
  "payload": {},
  "recipientIdentityId": "<recipientIdentityId>",
  "senderIdentityId": "<senderIdentityId>",
  "sentAt": 1770000000000,
  "signalId": "<signalId>",
  "signalType": "offer"
}
```

After successfully applying the signal, the recipient sends
`{"type":"call_signal_ack","signalId":"<signalId>"}` through its
authenticated WebSocket. Its node verifies that the authenticated identity is
the intended recipient and publishes `calls.v1.signal.acknowledged`:

```json
{
  "acknowledgedAt": 1770000000500,
  "callId": "<callId>",
  "networkId": "<networkId>",
  "ownerNodeId": "<senderNodeId>",
  "recipientIdentityId": "<recipientIdentityId>",
  "senderIdentityId": "<senderIdentityId>",
  "signalId": "<signalId>"
}
```

Acknowledgements are internal node-to-node events and are not forwarded to
frontend WebSockets. If an acknowledgement is lost, the next signal retry
causes the frontend to acknowledge the same `signalId` again.

## Community signed operations

A community has no replicated document. Its state is the deterministic fold of
client-signed operations stored in the `communityOperations` collection of the
private-network OrbitDB stores, so nothing a peer replicates can state a role, a
ban, a membership, a setting or a deletion that no authorized member signed. The
`Community` aggregate, the API projections and the local head caches are derived
from verified operations and are never accepted from the network. Legacy community
documents, `replicaState` metadata and the replica merger are gone: there is no
unsigned or snapshot fallback. This change does not introduce a second transport, a
public discovery topic, or a new recipient set.

An operation is an immutable record `{ id, scopeType: "community_operation",
communityId, networkId, authorIdentityId, action, args, parents, createdAt }`.
Its id is `community:<communityId>:op:<digest>`, where the digest is the base64url
SHA-256 of the canonical payload without `id`. It carries a create-only
`PublicMutationProof` (`put`, sequence 0, no predecessor) signed by the device of
the author. `parents` are the sorted digests of the operations the author had seen
(the `frontier` of `GET /communities/{id}/frontier`, at most 64): a non-genesis operation
names at least one parent and the genesis `community_created` none. The genesis
carries the `nonce` from which `communityId = CommunityId.derive(networkId, owner,
nonce)` is computed, so the id is bound to its creator. Actions are
`community_created`, `community_updated`, `channel_created`, `channel_renamed`,
`channel_deleted`, `channel_permissions_updated`, `role_created`, `role_updated`,
`role_deleted`, `member_roles_updated`, `member_joined`, `member_left`,
`member_kicked`, `member_banned` and `member_unbanned`. `createdAt` is metadata,
except that channel and role ids are derived from `(communityId, author,
createdAt)`.

Admission: every node checks an operation on write, on replicated read and on head
hydration. `PublicMutationVerifier` checks the signature, the device in the
identity's current device authorization head, and the binding of id, scope and
author to the payload digest. `CommunityOperationMutationPolicy` then applies the
operation to the state of its causal past in a per-community ledger and refuses it
when the author lacked the permission at that point of history. A
`member_joined` needs evidence: `added` requires manage-members, `approval`
requires approve-members, `automatic` requires auto-join, and self-join methods
require author == member. Methods `approval`, `invitation` and `invite_link` carry
a `reference` that must resolve to signed `requests` records: an accepted
`community_membership_request` of the right type for the member, or a
`community_invite` plus the `community_invite_use` record of the member. An
operation with an unknown parent or unreplicated evidence is not stored; its head
is demoted and re-admitted after 2 s, 10 s and 60 s.

Limits: a member that holds a valid device can sign as many operations as it likes,
and every replica stores and folds all of them, so growth is bounded by two rules
that depend only on the signed record and its causal past, never on the clock or the
arrival order (`CommunityOperationLimits`):

- `args` is at most 4096 bytes of JSON (`MAX_ARGUMENT_BYTES`). An operation above it
  is not an operation: it is refused wherever a record is read (`write`, replicated
  read, head hydration) and the client gets `CommunityOperationLimitExceededError`.
  The `parents` bound stays 64 digests.
- An identity other than the founder (the genesis author, trusted by construction and the one that approves every member) signs at most 1000 operations per community (`MAX_OPERATIONS_PER_AUTHOR`).
  The ledger refuses an operation when its causal past already holds 1000 of its
  author's operations, and the fold skips every operation of an author ordered after
  that author's 1000th (see *Community operation fold*). Operations of other branches
  that the author signed concurrently are invisible to admission, so the fold is the
  rule that decides; admission is only the cheap early refusal.

Operations are never pruned: any honest operation can name any stored one as parent,
and a node that forgot it would reject the children. There is no snapshot or
compaction, so a community stores at most 1000 operations per member that ever
signed in it (genesis author included), each at most about 4 KiB plus the parents
and proof; operations skipped by the fold still occupy that space. Banning or
kicking a member does not remove what it signed, and a member that leaves and
rejoins keeps its count.

Replication: operations travel as one index head per community
(`community-operation-index:<communityId>`) holding the operation records by id.
Replicas author operations concurrently, so two heads of one community never
supersede each other. The registry merges them as the union of their operations
sorted by id, which makes every replica publish the same head, and heads only grow.
The client writes through the endpoint of each action, sending the signed
`operation` (`createdAt`, `parents` and the `mutation` proof); the server rebuilds
the operation from the path, the actor and the other body fields, so the signature
verifies only if the client signed exactly that operation.

### Community operation fold

State is `CommunityStateFold.fold(operations)`. Operations whose parents are all
known are applied in a total order (parents first; the lowest digest first among
concurrent operations), and each one is authorized again against the state it
applies to. An operation that is no longer permitted there is skipped, for example
a role grant by a member that a concurrent operation ordered earlier banned. The
order uses no wall clock, so every replica folds the same set of operations into the
same state; the order-independence property test shuffles random causal graphs.

Conflict rules:

- Operations on different fields, roles, channels or members do not conflict; all of
  them apply.
- Concurrent operations on the same field apply in the total order, so the same
  operation wins on every replica.
- A ban, kick or leave ordered before a concurrent operation of the removed member
  makes that operation unauthorized and it is skipped. Ordered after it, the
  operation stays applied.
- The last member leaving deletes the community. The fold then skips every later
  operation, so nothing revives it. There is no `deleted`, `deletedAt` or
  `updatedAt` in the replicated record that could win instead.
- An operation that names a parent no node has seen is not part of any state until
  the parent arrives.
- An operation ordered after the 1000th operation of its author in the community is
  skipped, permitted or not, so a flooding member only wastes its own quota; the
  other authors' operations keep applying. The order is the same total order, so the
  skipped set is identical on every replica whatever the arrival order.

### Trust boundaries

The signed operation is the only source of community state: a replicated head or
document is never read as a community. `moderationLogs` stay a separate audit
trail with their own signature, written by the same request. Device authorization
and the `requests` records that justify a join are evaluated against the current
heads when the operation is admitted, so an operation whose evidence has not
replicated yet is re-admitted later (see the limits above). The stores still
reveal community metadata to their readers; this work neither establishes E2EE nor
hides the social graph from an authorized or compromised node. Protected and
private communities keep their local repository and never enter this path.

### Verification

`yarn test:integration:forged-community-operations` uses three real private
Helia/OrbitDB instances with separate peer identities, directories and registries,
in one process. A malicious node writes forged records straight into the replicated
stores: a future-dated tombstone, role grants and a ban by a member without the
permission, a self-join without evidence, a record copied into another community, a
swapped proof and a replayed operation. Every replica ignores them and keeps
serving the signed state. The fixture then partitions the replicas, authors three
concurrent operations, reconnects them and compares the complete folded community
and frontier on every replica with the expected fold. It restarts one replica with a
fresh registry and catches it up, applies a signed tombstone (the last member
leaving) and rejects a later revival, and rejects operations of a revoked device.
Fixtures own and remove their temporary data. The check runs in `test:ci`; unit
regressions additionally cover the fold, the causal ledger, the admission policy and
the repository. Loopback transport does not validate external NAT traversal or
calls.

## Other signed public mutations

Signed public mutations (pins, reactions and the other governed collections):

- Each `pins`/`reactions` document carries a `proof` (`PublicMutationProof`): version,
  `operationId`, `kind` (`put`|`delete`), `store`, `recordId`, `payloadDigest`,
  `predecessor`, `sequence`, `author { identityId, deviceCredential }` and an
  Ed25519 signature by the device. `payloadDigest` covers the document without
  `proof`, so ids, scope (community/channel/message) and author are bound.
- Community and conversation reaction events carry the proof as `mutationProof`;
  consumers pass it to the repository, which re-verifies it. Conversation records
  use `scopeType: "conversation"`; the author must be a participant of the roster folded from the signed `conversationOperations`.
  Policies are looked up by collection and `scopeType`, so a record whose scope
  type has no policy in a governed collection is rejected.
- `notificationSettings` documents (public scopes only) are governed the same way
  with `scopeType: "notification_settings"`; the author must be the settings
  owner (`identityId`) and the record id is `<identityId>:<scopeKey>`.
- `requests` documents are governed with three scope types.
  `community_invite` (author = `creatorIdentityId`; id = token =
  `base64url(sha256(JSON([communityId, creatorIdentityId, nonce])))`, immutable),
  `community_invite_use` (author = the acceptor, id
  `invite-use:<token>:<identityId>`; the use count is the number of use records,
  so `maxUses` can overshoot while nodes are partitioned) and
  `community_membership_request` (id derived from community, type, creator,
  identity and `createdAt`; creator and identity are immutable, the status moves
  from `pending` to `accepted`/`declined` by the authorised party: invitee,
  creator, moderator/owner or the requester). Heads are index wrappers under
  collection `requests`; community deletion writes no unsigned tombstones.
- `messages` documents are governed with scope types `community_channel`
  (record id `community:<community>:<channel>:<message>:<author>`; an edit is
  a higher-sequence put, a delete is a `delete` tombstone signed by the author
  or a moderator) and `conversation` (one immutable record per sent, edited,
  deleted or poll event, id = message id). Node-authored system and call
  messages are not part of this path.
- `polls` documents are governed with three scope types: `poll` (author =
  `creatorIdentityId`, id = client-chosen poll id, immutable), `poll_vote`
  (author = voter, id `poll-vote:<pollId>:<voterIdentityId>`, replaced by a
  higher sequence, removed by a signed tombstone) and `poll_close` (author =
  `closedByIdentityId`, id `poll-close:<pollId>`). Authors must be allowed in
  the community channel or be participants of the group conversation. Readers
  assemble the poll from its records and ignore ballots dated after the earliest
  close. Heads are index wrappers under collection `polls`.
- `stickerPacks` and `stickerUserLibraries` documents are governed too. Packs use
  `scopeType: "sticker_pack"` (author = `ownerIdentityId`, record id = pack id,
  whole-pack document). The library is three independent record kinds with
  `scopeType` `sticker_favorite`, `sticker_saved_pack` and `sticker_recent`
  (author = `identityId`, ids `favorite:<identityId>:<packId>:<stickerId>`,
  `saved:<identityId>:<packId>`, `recent:<identityId>:<packId>:<stickerId>`);
  favorites and saved packs are removed by signed tombstones. Their heads
  (`sticker-pack:<id>`, `sticker-user-library:<identityId>`) are index wrappers
  checked on admission; flat unsigned heads are no longer read.
- `moderationLogs` documents are governed with `scopeType:
  "community_moderation_log"`: author = `actorIdentityId` (the moderator), id =
  first 24 hex of `sha256(JSON([communityId, actor, action, target.type,
  target.id, createdAt]))`, immutable (tombstones are always rejected; the
  unsigned per-community tombstones on community deletion are gone). Admission
  checks the derived id and that the actor holds the permission for the action
  in the current community (channels, roles, bans, invites, request decisions,
  owner for profile updates, message author or manage messages for message
  deletions). Heads are index wrappers under collection `moderationLogs`.
- Every node verifies on write, on replicated read, on head hydration and on the
  persisted head cache: signature, scope binding, the device in the identity's
  current device authorization head, and the community permission (pin needs
  manage messages; reaction needs channel access). Records that fail are ignored
  and logged by collection only.
- Winner rule, independent of wall clocks: higher `sequence`, then lower proof
  digest. A tombstone (`removed: true`) must be a signed `delete`; a `put` must not
  be removed. `removed`, `deletedAt` or `updatedAt` alone never win. A signed record
  outranks an unsigned one; unsigned records are rejected.
- Index heads are unsigned wrappers: a head that lost records after admission is
  demoted to `updatedAt: 0` and cannot replace an admitted head.
- The unsigned reaction cascade tombstones on channel/community deletion are gone;
  the node cannot sign on behalf of users.
- Limits: device authorization is checked against the current head (historical
  revisions are not evaluated), and so are community permissions, so records of
  a member who later lost the permission stop being admitted. A head rejected
  because the community has not replicated yet is re-admitted after 2 s, 10 s
  and 60 s. Authorization lookups are coalesced for 1 s per batch.

### Replicated store audit

Every store below lives in the private network's OrbitDB under an
`IPFSAccessController({ write: ['*'] })`, so **any member of the network can
append to any store**. Replicated content is trusted only after a node-side
admission policy accepts it. The audit lists the writer, the policy that
protects the collection and what a malicious peer can still do.

| Store | Writer | Policy | Status |
| --- | --- | --- | --- |
| `communityOperations` | `OrbitDBCommunityRepository` | `CommunityOperationGate`, see [Community signed operations](#community-signed-operations) | Signed (#316) |
| `messages`, `pins`, `reactions`, `requests`, `polls`, `stickerPacks`, `stickerUserLibraries`, `moderationLogs` | the community, conversation, poll, sticker and moderation repositories | `PublicMutationGate`, see [Other signed public mutations](#other-signed-public-mutations) | Signed |
| `notificationSettings` | `OrbitDBNotificationScopeSettingsRepository` | `PublicMutationGate` (`notification_settings`, #349) | Signed |
| `keychains` | `OrbitDBKeychainMetadataIndex` | `OrbitDBKeychainMutationGate`, see [Keychains](#keychains) | Self-authenticating (this change) |
| `identities` (identity metadata) | `OrbitDBIdentityMetadataIndex` | identity-key signature plus canonical CID, see [Identities](#identities-and-device-authorization) | Self-authenticating, residuals listed |
| `identities` (device authorization) | `OrbitDBDeviceAuthorizationRepository` | history replayed from the pinned genesis, see [Identity device authorization convergence](#identity-device-authorization-convergence) | Replay-validated, residual listed |
| `calls` | `OrbitDBCallDocumentReplicator` | none | Unsigned, deferred |
| `contentReplication` | `OrbitDBContentReplicationRepository` | `ContentReplicationMutationPolicy` through `PublicMutationGate`; owner-signed per `(networkId, cid)`, 1 GiB and 10000 records per identity per network (#372) | Signed |
| `notifications` | `OrbitDBNotificationRepository` | `NotificationInvitationMutationPolicy` and `NotificationStateMutationPolicy` through `PublicMutationGate`, plus `OrbitDBNotificationHeadMutationGate` for `notification:` heads (#371) | Signed |
| `conversationOperations` | `OrbitDBConversationRepository` | `ConversationOperationMutationPolicy` through `PublicMutationGate`; roster folded from the signed operations (#370) | Signed |

#### Keychains

A keychain is already signed by its owner identity key
(`KeychainSignatureDomainService`), but nodes used to trust the replicated
metadata without checking it, so a forged high-version document or head shadowed
the real keychain. `OrbitDBKeychainMutationGate` governs the `keychains`
collection and the `keychain:` and `keychain-cid:` head keys:

- the record id equals its `cid`, it is not a tombstone (`deleted` is rejected),
  and the owner signature over the keychain verifies against `ownerIdentityId`;
- the version shape is consistent: a first version has no `previousCid`, every
  later version has one;
- `cid` is the canonical json/sha256 CID of the keychain document
  (`IpfsKeychainMapper.toDocument`), so a CID cannot be attached to different
  content than the one it names;
- a head is cached only under `keychain:<ownerIdentityId of the record>` or
  `keychain-cid:<cid of the record>`, and only if the record itself passes the
  checks, so a valid record cannot be planted under a victim's key.

Head keys used to bypass record admission because heads and their derived
aliases are cached outside the document path. `OrbitDBMutationGate` therefore
has `governsHead`/`acceptsHead`, and the registry filters every derived head key
through them on replicated updates, head hydration, readmission, the persisted
head cache and reads. `PublicMutationGate` returns `false` from `governsHead`
because its heads are index wrappers checked per record.
Gates accumulate with `OrbitDBReplicatedStateRegistry.addMutationGate`: the
registry composes them in `CompositeOrbitDBMutationGate`, and a record is admitted
only when every gate that governs it accepts. `PublicMutationGateInitializer` and
`KeychainMutationGateInitializer` each register their own gate.

No request contract changes: the keychain endpoints already carry the signature.
A malicious peer can still flood the store with validly signed junk of its own
identity, and keychains it signs itself for its own identity remain valid.

`yarn test:integration:forged-keychains` runs four real private Helia/OrbitDB
nodes (two with the gate, one malicious without it, one ungated control). It
checks that a valid keychain and its successor replicate, that the ungated
control surfaces the forgeries (bad signature, wrong CID, foreign key planted
under a victim head) and that the gated nodes never serve them.

#### Identities and device authorization

- Identity records are self-authenticating: the embedded identity is verified
  against its key and the record `cid` must be the canonical CID of the
  content, so a forged record cannot shadow another identity.
- Device authorization history is replayed from the pinned genesis
  (`OrbitDBDeviceAuthorizationDocumentValidator`/`DocumentMerger`), not trusted
  as replicated. Residual: there is no trusted genesis for an identity the node
  has never seen, so the first valid-looking history is accepted.
- Residuals of the identity metadata that this change does not remove:
  reference-only records without an embedded identity are accepted as
  non-canonical candidates; `receivedAt` is chosen by the sender; remote
  `deleted: true` tombstones are ignored when projecting;
  an attacker can register a handle first with a valid identity of its own and
  can flood the store. Requiring a `PublicMutationProof` signed by a device key
  would be circular, because the device authorization it would be checked
  against is itself part of the identity data.

#### Deferred: node-authored collections

The design that authenticates these four stores (user-signed records per
store, derived state instead of replicated state, record shapes, admission,
migration and the node-trust model that the design avoids) is in
[`docs/design/node-written-collections.md`](design/node-written-collections.md)
(#361). The behavior below is current until each slice lands.

`calls` and `contentReplication` are written by the node with no user key to sign them, and they are
not forced into the signed path. A malicious peer can currently do the
following, and each needs a node-identity trust model (which node keys are
trusted for a network) that is a product decision, because `NodeId` is an
unsigned UUID and the shared libp2p peer key is not bound to an identity:

- `calls`: a forged ringing conversation call makes holders create missed-call
  notifications and push; a forged active channel call blocks `CallStarter`;
  `sessionEpoch` poisoning, forged `ended` and flooding.
- `contentReplication`: now owner-signed and gated (#372). There is no local-only head index for this collection: reads and staleness checks go through the registry's gated store query, which re-admits records on read; forged heads, claims, `withdrawnAt` and content types never reach a gated node. No replica claims or pubsub replication events remain.

Conversation metadata is no longer unsigned: the roster is the fold of client-signed
`conversationOperations` (gate policy `ConversationOperationMutationPolicy`), there
is no pubsub conversation announce, and the participant index is rebuilt locally
from the folded state, never replicated.

Notifications are no longer unsigned (#371). An invitation is a `notification_invitation`
record signed by the inviter, admitted only when the signed conversation or community
state allows the inviter (and, for conversations, the recipient); its id is derived
from inviter, recipient, subject and nonce. Accept, decline and read are
`notification_state` records signed by the recipient, one record per state, with
terminal states absorbing. Heads are `notification:<recordId>` and must match the
record id; `notification-recipient-index:<id>` heads are refused and the recipient list
is rebuilt locally. Missed-call notifications are derived on each node from its own
call state, stored in a local database and never replicated. The 30 records per
minute per identity cap is enforced on the write path.

Protected and private communities stay on the local repository and never enter
the public path.

## Protected control frame delivery

Private authorization frames are excluded from shared PubSub, public IPFS,
DHT records and global OrbitDB indexes. A sender obtains a recipient-generated
freshness challenge inside the participant-encrypted channel, then delivers the
signed operation, signed proof and optional control transition as one encrypted
recipient frame. The decrypted-frame consumer invokes the same acceptance use
case as HTTP.

The recipient acknowledges only `accepted` and `duplicate`. It leaves `pending`
unacknowledged so the sender can recover missing causal operations and retry
with a new one-use challenge. A future operation is bounded by 128 normalized operations or one MiB per
scope. Retention and rejoin deadlines belong to the opaque mailbox transport;
elapsed time cannot authorize an operation or cause fallback to an older
checkpoint or the public replication path.

Version 1 accepts only `membership.propose`, `membership.commit` and
`device.revoke`. There is no private-format fallback or dual write.
Public communities continue to use their public replication path.

## Identity device authorization convergence

Device authorization transitions are not published on shared PubSub. OrbitDB
replicates their signed history only through the identity's configured private
networks. Every replica rebuilds the checkpoint from the identity-pinned genesis
and runs the same credential, proof-of-possession, causal revision and recovery
authority checks before accepting a transition. Invalid and duplicate records
cannot change the materialized checkpoint.

OrbitDB stores the verified genesis checkpoint, signed public transition history
and current materialized checkpoint in the identity's private networks. It never
stores passwords, password derivation metadata, protected device roots, device
unlock factors or recovery secrets. Operation and pairing UUIDs remain as replay
tombstones. Their retention is required for replay safety and reveals that a
control transition occurred to readers of the private network; it does not expose
the paired device's local root or unlock material. Replicas reject non-canonical
records, unknown unsigned fields, transition records above 16 KiB and more than
128 concurrent siblings from one predecessor, 256 post-checkpoint records and
1 MiB of aggregate post-checkpoint history before parsing or verifying them.
An authority-signed recovery becomes a new verified checkpoint and discards the
older transition history, so those limits bound replay work without imposing a
lifetime operation limit. Public-network heads are rejected. An identity whose
networks are all public keeps its authorization only in the node's local
database: nothing is published or replicated, so a device catalog never reaches
a public network, and such an identity does not converge across nodes.

The public identity publication binds an independent genesis device credential
and its commitment under the identity signature. The node does not derive that
credential from the identity key.

Concurrent valid transitions from the same predecessor are resolved independently
of arrival time. Recovery transitions form the highest-precedence class; without
recovery, all sibling revocations are applied together before any enrollment;
otherwise every valid sibling enrollment is folded into one checkpoint. Branch
length never grants precedence, so a compromised credential cannot restore itself
by appending enrollment descendants after another device revokes it. Concurrent
recovery equivocation uses the lowest operation UUID, with the canonical signed
record as the final tie-break. Each replica replays the same signed candidates
from the pinned genesis checkpoint and therefore selects the same authorization
state after exchanging heads. Both devices sign the pairing
identifier, authorization time and expiration, and the target client must refuse
to complete an offer after that expiration. Replicas validate that signed interval but do not
compare it with their receipt clock: a fully signed enrollment may arrive after an
offline partition and must replay identically everywhere. Pairing and operation
identifiers remain permanent replay tombstones. Signed time never grants authority
or wins a conflict. A transition authored from a losing branch is rechecked against
the selected checkpoint before it can affect later revisions.

## Live call projection boundary

Conversation lifecycle documents retain merge tombstones; runtime leases stay
in memory (five-second timeout, sixty-second disconnected retention). WebSocket
clients do not receive these raw documents or lease attributes. They receive
`callId`, `liveCallRevision` and a minimal `liveCall` projection, filtered by
current conversation/community/channel access at delivery time. Browser event
aggregate IDs identify the call, never the composite participant/owner lease. The revision
is local to the connected server; clients reset tracking after reconnect.
Signal delivery retains only recipient/sender, signal payload/type/id, attempt
and expiry timing; it omits the historical participant list and owning-node ID.

Projection changes emit local snapshot notifications after OrbitDB state is
merged. Applying a remote lease compares the local before/after connection
state so an unchanged owner heartbeat can restore a locally expired peer.
These notifications are not replicated domain events and do not amplify gossip.
Local expiry of a remote lease likewise updates only local sockets. Unchanged
heartbeats and media-only changes do not trigger roster delivery.

Explicitly ending a community call retires its session; the next session starts
a new roster. Merely leaving does not globally terminate a channel: a local
roster can lag behind a concurrent remote join. Community participant tombstones
are bounded runtime state and are not written to the reusable session document.
Existing replicated history and copies held by peers cannot be made confidential
retroactively. Current peers still observe transient participation gossip and
session scope; this protocol does not provide traffic-analysis resistance or
hide participation from an actively logging node.

Community call documents carry a positive `sessionEpoch` for new sessions.
Concurrent starts derive one UUID from the private network, community, channel
and epoch; they do not select a random ID independently. Start/reuse decisions
use one scope-history snapshot. After explicit termination the next epoch is
one greater than the largest known epoch, independent of clock order. A replica missing newer history may select an
older epoch, which remains subject to its replicated termination; this is not
consensus or automatic reconciliation of duplicate sessions. The epoch
stays in node-to-node records and is not added to the browser live contract.

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

A restarted node can miss blocks that only its peers serve, and OrbitDB gives up
on a block after 30 seconds. Such a block timeout (`TimeoutError`,
`LoadBlockFailedError`, `Failed to load block`, `Want was aborted`) while a
private network registers its replicated state, or while a projection subscribes
to a document store, does not abort startup. The node logs a warning, still
starts synchronizing the network, and recovers through the head exchange: the
first peer `join` reconciles the head cache and the document projections again,
and a deferred subscriber is bootstrapped again on the store's next `update` or
`join`. Any other registration or subscription error still fails startup.
`yarn test:e2e:real-transport:restart-missing-block` proves the subscriber path
with two real private nodes.

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

`<scope>` is the base64url of `PrivateNetworkKeys.relayLookupKey` from
`@haskou/pigeon-swarm-crypto`, which also derives the record key and the
synthetic DHT key. Records are sealed with
`PrivateNetworkRelayRecordEnvelope`: the library validates the exact record
fields, and a node drops an envelope that fails to open. Private relay records
carry no signature: only members holding the network seed can seal them, and
the node checks record expiry before using a relay.

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

Publishers normalize `CALLS_TURN_RECORD_TTL_MS` before signing: it must be a positive whole number producing a safe integer expiry. Invalid values use ten minutes, with a publication interval of half the record TTL unless configured otherwise (five minutes at the default ten-minute TTL).

V2 credential exchange uses `/pigeon-swarm/turn-credentials/2.0.0` on an existing encrypted libp2p connection in a shared private network. Opening the stream requests credentials without a body. The owner verifies that the connection is encrypted and open, the private network is still registered and local TURN issuance is configured. Private-network access authorizes issuance; no per-conversation membership proof is claimed.

The response starts with a four-byte unsigned big-endian body length, followed by a UTF-8 JSON body. The reader completes as soon as the declared body arrives, without relying on stream closure; zero, oversized and incomplete frames are rejected. The JSON body contains exactly `urls`, `username` and `credential`. The username is `<expiryUnix>:<opaquePeerSubject>`, with a ten-minute lifetime; the password uses the owner's coturn secret. JSON bodies are bounded to 8192 bytes (8196 including the length prefix), eight previously advertised URLs and a five-second exchange. No exchange payload is published through gossip, replicated or logged. Clients choose at most three relays and cache until thirty seconds before expiry while checking current eligibility and advertisement issuance; newer owner records invalidate cached credentials. Owners enforce ten requests per peer and one hundred globally per minute. See [independent TURN deployments](federated-turn.md) for privacy limits, rotation and executable validation.

## Identity presence leases

Identity presence never travels over node gossip. There is no presence topic,
no `presence.v1.identity_presence.was_updated` announcement and no consumer for
one: a node does not learn which identities are connected to other nodes, and a
node unrelated to an identity never receives its status or heartbeat
timing.

The node serving an identity's authenticated WebSocket keeps one in-memory
lease for it, derived from that connection's heartbeats. The lease is never
persisted in OrbitDB or IPFS, carries no node id or network id, and is exposed
only through that node's HTTP presence reads and to that identity's own
WebSocket connections (see `docs/api.md`). HTTP reads are open in full to
identities that share a one-to-one conversation or a community with it; group
co-membership grants nothing, so a group roster never decides who learns an
identity's presence or receives its `identities.v1.identity.was_updated`
events. Presence for contacts served by other nodes is the client's job:
clients exchange it encrypted end to end over their private channels, so nodes
only relay ciphertext.

## Conversation messages

No conversation message travels over node gossip. Messages, edits, deletions,
reactions, pins and history of one-to-one and group conversations travel only
through opaque mailboxes, sealed by the clients. Nodes publish no message, read
or reaction events for conversations and keep no read markers: read state is
device-local on each client.

## Durable call state convergence

Calls are a signed event log (#373), not replicated documents. The `calls` store
holds three kinds of records, each signed by the user it speaks for and admitted by
`PublicMutationGate`: `call_start` (`call:<callId>`, signed by the creator),
`call_participant` (`call-participant:<callId>:<identityId>`, signed by the
participant, one record per call and identity with a rising `sequence`) and
`call_end` (`call-end:<callId>`, signed by the ender). The call id derives from
creator and nonce, so nobody can claim another identity's call. The byte-exact
contract is in [the calls API](api.md#signed-call-events).

Every node folds the admitted records into the call (`OrbitDBCallFold`): participant
and end events apply sorted by claimed time and record id, never by arrival order, and
an event that does not apply to the state reached so far is inert. The same records
therefore fold to the same call on every node in any arrival order. A call still
active after `CALLS_MAX_DURATION_MS` (default 12 hours) is derived as ended.
Timeouts and `missed` are local state derived from the signed start and are never
replicated. `CallTimeoutScheduler` writes nothing replicated.

Concurrent community starts for one voice channel are all admitted; every node keeps
the one with the lowest start `payloadDigest` and treats the others as superseded.
A superseded call reads as ended and names the winning call in `supersededByCallId`,
derived on every node from the same admitted starts and exposed in the browser
`liveCall` snapshot so its participants join the winner.
A community start carries a `sessionEpoch` that may exceed the highest epoch already
admitted for the channel by one at most, so a forged huge epoch is refused.

A fresh call projection replays the store's causal log history, including earlier
records hidden by the document index. Incremental replay stops at previously
processed heads. Initialization waits for the initial history, and missing log
ancestors fail initialization instead of presenting partial call state as ready.
Failed replays discard only their own staged changes and restore the previous
traversal frontier so a retry can read the same entries again.

Community and group calls persist no participant records. A signed join or
leave of such a call is verified against the admission rules and then
discarded: it is neither written to OrbitDB nor replicated. Its freshness rests
on the signed request and the record clock bound, not on a stored sequence.
Their participation is runtime lease state, and the roster is the lease set.

A group call (`group_capability` scope) names no member anywhere in the `calls`
store. Its `call_start` carries an empty `participantIds` and only the SHA-256
`capabilityHash` of a capability the members derive from the MLS exporter of
the group epoch; nodes admit it when its creator belongs to the record's
network. A node admits a join from whoever presents the capability over HTTP,
so no node learns the group's roster from a call record. Only the creator's
`call_end` ends it.

Heads for `call:`, `call-participant:` and `call-end:` records are not replicated:
records reach other nodes through the gated `calls` store and its history replay
only, so there is no head gate for calls.

## Call participant leases

`calls.v1.participant_lease.was_updated` replicates ephemeral call membership
connectivity without writing heartbeat timestamps to OrbitDB. Leases are keyed
by `(callId, participantIdentityId, ownerNodeId)`, allowing a direct call to be
created on one node while another participant joins and renews from a different
node.

Every heartbeat publishes a connected snapshot. After the timeout, all nodes
remove their stale local copy, but only the owner publishes the disconnected
snapshot. Conversation documents retain lifecycle and participant history;
community and group documents retain lifecycle only. Neither stores heartbeat
timestamps.

Community and group participation expires sixty seconds after the last real join or
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

## Call event visibility

Call records and call gossip reach every member of the network that carries
them, whether or not that member takes part in the call. Gossip topics are per
network, not per call or conversation. Subscriptions are not authenticated, so
the topic is not a relationship boundary. Receivers do not filter by
participation, and nodes do not republish call events.

Members of a network can observe:

- `call_start` records: call id, creator, nonce, network id, `startedAt`, the
  scope (a conversation id; a community id, channel id and `sessionEpoch`; or a
  group call's `capabilityHash`) and, for conversation calls, the participant
  identity ids. A group call start names no member and no group.
- `call_participant` records of conversation calls: the participant identity
  id, state and signed time. Community and group joins and leaves are verified
  and not stored or replicated.
- `call_end` records: the call id and the identity that ended the call.
- Lease events (`calls.v1.participant_lease.was_updated`) for conversation,
  community and group calls: the connected roster in `participantIds` and
  `participantIdentityId`, heartbeat timestamps, and the relay URL and candidate
  types of each media connection. Leases are not stored. For a group call this
  reveals who is connected to a call id, not which group it belongs to.
- Signal events (`calls.v1.signal.sent`): sender and recipient identity ids,
  sender device credential, `signalId`, `signalType`, `scopeType`, the clock
  fields, the sealed entries and the `signature`. The node treats the sealed
  entries and the signature as opaque: it does not open or verify them.
- Signal acknowledgements (`calls.v1.signal.acknowledged`): the signal id and
  both identity ids.

Public-network events are plain JSON. Private-network events are sealed with
`PrivateNetworkPubSubEnvelope` from `@haskou/pigeon-swarm-crypto`: AES-256-GCM
under a key derived from the network key, with the network id and topic bound
as associated data, so every admitted node can read them and an envelope moved
to another network or topic fails to open.

The libp2p swarm PSK (`PrivateNetworkKeys.swarmKey`), the pubsub key and the
relay lookup and record keys all come from the same library derivations.
Nodes that derive these values differently cannot connect, read events or find
relays, so changing a derivation is a coordinated cutover of every node in the
network with no mixed-version window.

Local WebSocket clients receive a call event only when this node's authorization
check places them in the call's audience. Lifecycle events are attested by this
node before they reach clients. Signal acknowledgements are never forwarded to
clients.

Narrowing these observers to a call's participants requires per-call topics or
encrypted payloads. That is a protocol change, not an adapter filter, so the
relationship-scoping part of #291 remains a documented residual risk.

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

A recipient refuses and does not register a received signal whose `expiresAt` has
passed, whose `createdAt` is more than 5 seconds ahead of its clock, or whose
`sentAt` lies outside `createdAt - 5 s <= sentAt <= min(expiresAt, now + 5 s)`; the
refusal is logged at debug level. A node never registers a received delivery whose
`ownerNodeId` is its own node id: the owner keeps only the delivery its own send
and retry path saved, so a copied signal republished by another member cannot
replace the owner's schedule or stop its retries. A retry supersedes only the
registered delivery with the same route (`callId`, `ownerNodeId`, `networkId` and
the ordered `participantIds`), and only with a strictly greater `attempt` and
non-decreasing `sentAt` and `nextRetryAt`. A delivery on another route, or one
whose clock values run backwards, never replaces the stored one.

These bounds assume node clocks agree to within the 5-second skew; a node whose
clock drifts further refuses valid signals for most of their 20-second lifetime.
Run NTP (or an equivalent time sync) on every node.

Signal event attributes are:

```json
{
  "attempt": 1,
  "callId": "<callId>",
  "createdAt": 1770000000000,
  "expiresAt": 1770000020000,
  "networkId": "<networkId>",
  "ownerNodeId": "<nodeId>",
  "participantIds": ["<senderIdentityId>", "<recipientIdentityId>"],
  "recipientIdentityId": "<recipientIdentityId>",
  "scopeType": "conversation",
  "sealedEntries": [
    {
      "envelope": "<envelope>",
      "recipientDeviceCredential": "<deviceCredential>"
    }
  ],
  "senderDeviceCredential": "<deviceCredential>",
  "senderIdentityId": "<senderIdentityId>",
  "sentAt": 1770000000000,
  "signalId": "<signalId>",
  "signalType": "offer",
  "signature": "<signature>"
}
```

The signature covers the bytes `pigeon:call-signal:v1` and a newline, followed by
RFC 8785 canonical JSON of every field except `signature`. No field that changes
the meaning of the signal, including `callId`, the identities, `signalType`,
`scopeType`, `sealedEntries`, `createdAt` and `expiresAt`, can be altered after
signing. The node does not verify the signature; the recipient UI does.

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
communityId, networkId, authorIdentityId, action, args, parents, createdAt,
identitySignature }`. Its id is `community:<communityId>:op:<digest>`, where the
digest is the base64url SHA-256 of the canonical payload without `id` and without
`identitySignature`. `identitySignature` is the ed25519 signature of the author's
identity key (the root MLS leaf credentials use) over
`"pigeon:community-operation:v1\n" + id`, so any member verifies the author of
every operation without trusting a node (`GET /communities/{id}/operations` serves
them verbatim). It carries a create-only `PublicMutationProof` (`put`, sequence 0,
no predecessor) signed by the device of the author over the whole record. `parents`
are the sorted digests of the operations the author had seen
(the `frontier` of `GET /communities/{id}/frontier`, at most 64): a non-genesis operation
names at least one parent and the genesis `community_created` none. The genesis
carries the `nonce` from which `communityId = CommunityId.derive(networkId, owner,
nonce)` is computed, so the id is bound to its creator. Actions are
`community_created`, `community_updated`, `channel_created`, `channel_renamed`,
`channel_deleted`, `channel_permissions_updated`, `role_created`, `role_updated`,
`role_deleted`, `member_roles_updated`, `member_joined`, `member_left`,
`member_kicked`, `member_banned`, `member_unbanned`, `invitation_created` and
`invitation_revoked`. `createdAt` is metadata,
except that channel and role ids are derived from `(communityId, author,
createdAt)`.

Admission: every node checks an operation on write, on replicated read and on head
hydration. `PublicMutationVerifier` checks the signature, the device in the
identity's device authorization chain at the revision the proof claims (see
[Causal device authorization](#causal-device-authorization)), and the binding of id, scope and
author to the payload digest. `CommunityOperationMutationPolicy` verifies the
`identitySignature` (an operation without a valid one is refused, with no unsigned
fallback), then applies the
operation to the state of its causal past in a per-community ledger and refuses it
when the author lacked the permission at that point of history. A
`member_joined` needs evidence: `added` requires manage-members, `approval`
requires approve-members, `automatic` requires auto-join, and self-join methods
require author == member. `approval` carries a `reference` that must resolve to
the accepted `community_membership_request` of the member in the signed
`requests` records. Method `invitation` is signed by the admitter, a member
with manage-members, and carries `{identityId, invitationId, possession,
consent}`: the digest of an `invitation_created` operation in its causal past, a
possession proof signed by that invitation's key and a consent proof signed by
the joiner's identity key. The ledger refuses it unless the invitation is live
in its causal past (not revoked, its issuer's `create_invites` not cut,
`maxUses` not reached), `createdAt` lies within the invitation's window, the
joiner is not banned, a member or already admitted under it, and the joiner is
the `invitee` when one is named. It reads no `requests` record, so admission
depends only on operations and every replica stores the same set whatever the
arrival order. `invitation_created` (args `expiresAt`, `invitationKey`,
`maxUses`, `invitee?`) needs create-invites; its id is the operation digest and
the secret behind `invitationKey` never leaves the joiner's client.
`invitation_revoked` (arg `invitationId`) is signed by the issuer or a member
with manage-members, is permanent and never evicts anyone. Every identity id in
an operation, author and arguments, must be canonical
(`IdentityId.isCanonicalKey()`), so equal strings mean equal keys.

The fold applies an authority cut graph to invitations and admissions: a kick,
ban, leave or role change that cuts a member's permission voids the member's
operations that are concurrent with it and that need that permission, unless the
cut itself is void. Concurrency is judged on the causal graph, cuts are grouped
into strongly connected components and visited in topological order, so every
replica decides alike. Revocations and bans are never voided. The ledger never
voids an operation; the fold does, over the stored set.

A joiner asks for admission with a `community_invitation_claim` record in the
`requests` store (`scopeType: "community_invitation_claim"`, id
`invitation-claim:<invitationId>:<identityId>`, author the joiner, signed
`frontier`). It is write-once: the policy refuses a claim whose content differs
from one its joiner already signed under the same id, and ignores stored
records under that id that the joiner did not sign.
It carries the possession and consent proofs, which name one joiner, and no
authority; no join references it. A node stores it only when `identityId` is
canonical, the invitation is in the community folded at the claim's frontier
and live there, the proofs verify, and the joiner is neither banned nor a
member. Like every `requests` record it replicates to all nodes of the network,
so an operator learns who asked to join which community. Admissions can overshoot
`maxUses` by one `maxUses` per mutually concurrent branch; this accepted residual
is never repaired and evicts nobody. An admission counts toward the operation
quota of its admitter, its author, like every operation.
An operation with an unknown parent or unreplicated evidence is not stored; its head
is held, not cached, until the evidence replicates (see
[readmission](#readmission-of-rejected-records)).

Limits: a member that holds a valid device can sign as many operations as it likes,
and every replica stores and folds all of them, so growth is bounded by two rules
that depend only on the signed record and its causal past, never on the clock or the
arrival order (`CommunityOperationLimits`):

- `args` is at most 4096 bytes of JSON (`MAX_ARGUMENT_BYTES`) and nests at most 63
  levels below itself (`MAX_ARGUMENT_DEPTH`; `args` is depth 1 of the operation, whose
  digest refuses any value deeper than 64, see `payloadDigest` in `docs/api.md`). An
  operation above either is not an operation: it is refused wherever a record is read (`write`, replicated
  read, head hydration) and the client gets `CommunityOperationLimitExceededError`.
  The `parents` bound stays 64 digests.
- An identity other than the founder (the genesis author, trusted by construction and the one that approves every member) signs at most 1000 operations per community (`MAX_OPERATIONS_PER_AUTHOR`).
  The ledger refuses an operation when its causal past already holds 1000 of its
  author's operations, and the fold skips every operation of an author ordered after
  that author's 1000th (see _Community operation fold_). Operations of other branches
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
- Some operations carry a whole value built on the state their author saw: the
  profile (`community_updated`), the roles of one member (`member_roles_updated`),
  the roles that see a channel (`channel_permissions_updated`) and a role
  (`role_updated`). When one is concurrent with operations ordered before it, the
  fold rebases it (`CommunityOperationRebase`) from the state of its parents onto
  the state it applies to: a single value (name, description, avatar, banner, a
  setting the operation sets, a role name) takes the operation's value only if its
  author changed it, and a set (role ids, visible role ids, role permissions) keeps
  the current entries minus the ones the author removed plus the ones the author
  added. Concurrent changes to different fields or entries therefore all survive,
  and the rebased operation is still authorized against the state it applies to.
  An empty visible role list opens a channel to everyone, so a rebase never empties
  it: when concurrent restrictions would remove every role (`[R1, R2]` restricted
  to `[R1]` and to `[R2]`), the operation applies as signed and the one ordered
  last wins, as for a single value.
- Concurrent changes to the same single value apply in the total order, so the
  same operation wins on every replica.
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

### Causal device authorization

Issue #362. `PublicMutationProof` is version 2: the signed `author` carries
`authorizationRevision`, the revision of the author's device-authorization chain
that the device observed when it signed, and the signing content is
`pigeon:public-mutation:v2\n` + canonical body. The version 1 proof and its
domain are rejected; there is no legacy path. `PublicMutationVerifier` asks
`DeviceAuthorizationTimeline.isAuthorizedAt(device, revision)`, a pure function
of the proof and the replayed chain: the device is accepted iff the revision is
not above the replicated head, not below the replay base (genesis or latest
recovery checkpoint) and the greatest chain state at or below it contains the
device. Consequences, identical on every node and independent of arrival order,
wall clock and restarts:

- a record signed while the device was authorized stays valid after the device
  is revoked, however late it is delivered (partition heal, resync, restart);
- a revoked device cannot claim the revocation revision or later: the
  revocation transition is the frontier, no separate field exists;
- a revision above the local head is not yet verifiable: the record is refused
  and the head re-admitted once the chain replicates (see
  [readmission](#readmission-of-rejected-records));
- payload timestamps never take part, so a fake `createdAt` does not help.

Chosen bound: the whole interval in which the device was authorized
(`N < revocation revision`), no wall-clock grace window, because a window would
make the verdict depend on when a node first saw the record. Recovery discards
the pre-checkpoint chain, so earlier records of pre-recovery devices become
unverifiable. The recovery carries the compromise caps in effect as
`compromisedCredentials`, so a capped device stays refused after the checkpoint.
Threat model, rejected alternatives, the restart behaviour and the open residuals
of carried caps are in `docs/design/causal-device-authorization.md`.

Fail closed (#742): an authorization that cannot be read is never read as absent.
When the identity repository cannot settle the identity's genesis (not ready), or the
replicated store has not settled the head key, or its local copy cannot be read, every
read of the authorization (`has`, `require*`, `findCompromisedSince`), every transition
(`compareAndApply`, which never saves a genesis-only document over a head it could
not read) and the admission of a device sealing record fail with `503020`
(`ReplicatedStateNotReadyError`). "No authorization", "no head" and "no compromise
caps" are answered only after a complete read of a settled store.

Residual: community **operations** are evaluated against the state folded from
their causal past, but the permissions of channel messages, pins, reactions,
membership requests and polls are evaluated against the community
state folded at admission, not at a causal frontier. A later demotion can
therefore still make a node refuse such a record that another node admitted
earlier.

### Trust boundaries

The signed operation is the only source of community state: a replicated head or
document is never read as a community. `moderationLogs` stay a separate audit
trail with their own signature, written by the same request. The `requests` records
that justify a join are evaluated against the current heads when the operation is
admitted, and its signing device against the authorization chain at the claimed
revision, so an operation whose evidence or claimed authorization revision has
not replicated yet is re-admitted later (see the limits above). The stores still
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
the repository. `yarn test:integration:concurrent-community-changes` runs two real
Helia/OrbitDB replicas over loopback, partitions them, authors concurrent profile,
role, channel-visibility and ban changes in both total orders, reconnects them and
asserts that both replicas converge on a state keeping every independent change.
Loopback transport does not validate external NAT traversal or calls.

## Community state announcements

Peers joining every OrbitDB store only proves participation. To report content
equality, every node announces, every 10 seconds and for each network it has
observed, `nodes.v1.community_state.was_announced`:

- aggregate id: the announcing libp2p peer id of that network
- `networkId`: routes the announcement inside that network, so private-network
  announcements are encrypted like any other private event
- `digest`: SHA-256 (base64url) of the sorted `[communityId, sorted frontier]`
  pairs of every community of the network, deleted ones included. Frontiers are
  content hashes of the operation DAG, so equal digests mean equal folded state

The digest never reveals payloads, topics, community ids or counts to observers
that do not already hold the same state, and the event is never delivered to
WebSocket clients. For each observed network a receiver keeps at most 256 peer
digests, drops those older than 35 seconds, and compares them with its own
digest to derive `communityState` in the
[network synchronization status](api.md#get-active-peers).
Announcements are periodic and idempotent, so they bypass the durable consumer
idempotency store; recording each delivery would grow the local database
without bound.

Trust boundary: the announcing peer id is claimed, not authenticated. The
pub/sub layer hands consumers only the decoded payload, never the signing
gossipsub peer, so the claim cannot be bound to the sender. A network member
can therefore spoof another peer's state. The announcement is status-only: it
feeds this diagnostic and never touches replicated data, admission or routing.
Nodes on older versions never announce and stay `unknown`, which keeps the
network `syncing`. `network_synchronization_status` is reported for the whole
node, not per private network.

## Other signed public mutations

Signed public mutations (pins, reactions and the other governed collections):

- Each `pins`/`reactions` document carries a `proof` (`PublicMutationProof`): version,
  `operationId`, `kind` (`put`|`delete`), `store`, `recordId`, `payloadDigest`,
  `predecessor`, `sequence`, `author { identityId, deviceCredential,
authorizationRevision }` and an
  Ed25519 signature by the device. `payloadDigest` covers the document without
  `proof`, so ids, scope (community/channel/message) and author are bound.
- Community reaction events carry the proof as `mutationProof`; consumers pass
  it to the repository, which re-verifies it. `messages`, `pins` and `reactions`
  hold community channel records only; a record scoped to a conversation has no
  policy and is rejected.
  Policies are looked up by collection and `scopeType`, so a record whose scope
  type has no policy in a governed collection is rejected.
- `notificationSettings` documents (public scopes only) are governed the same way
  with `scopeType: "notification_settings"`; the author must be the settings
  owner (`identityId`) and the record id is `<identityId>:<scopeKey>`.
- `requests` documents are governed with scope type
  `community_membership_request` (id derived from community, creator, identity
  and `createdAt` with type `request`; creator and identity are immutable, the
  status moves from `pending` to `accepted`/`declined` by the authorised party:
  moderator/owner or the requester). Heads are index wrappers under collection
  `requests`; community deletion writes no unsigned tombstones.
- `mlsRecords` documents are governed with scope type `community_mls`
  (record id `community:<community>:mls:<recordId>` where `recordId` is
  `base64url(sha256(canonicalize({epoch, groupId, kind, payload,
recipientIdentityId})))`, so a peer cannot claim an id for content it did not
  write). Records are immutable: a `removed` marker or a `delete` proof is
  rejected. The author must be a current member of the community, and for a
  channel group (`<community>:<channel>`) able to view the channel; a `welcome`
  recipient must be a member too. `payload` is opaque base64 (at most 262144
  characters); the node never parses it. Heads are index wrappers under
  collection `mlsRecords`, keyed `community-mls-index:<community>`.
- `messages` documents are governed with scope type `community_channel`
  (record id `community:<community>:<channel>:<message>:<author>`; an edit is
  a higher-sequence put, a delete is a `delete` tombstone signed by the author
  or a moderator). Node-authored system and call messages are not part of this
  path.
- `polls` documents are governed with three scope types: `poll` (author =
  `creatorIdentityId`, id = client-chosen poll id, immutable), `poll_vote`
  (author = voter, id `poll-vote:<pollId>:<voterIdentityId>`, replaced by a
  higher sequence, removed by a signed tombstone) and `poll_close` (author =
  `closedByIdentityId`, id `poll-close:<pollId>`). Authors must be allowed in
  the community channel; a record carrying `conversationId` is rejected. Readers
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
  in the current community (channels, roles, bans, kicks with manage members,
  invitations, request decisions, owner for profile updates, message author or
  manage messages for message deletions). Heads are index wrappers under collection `moderationLogs`.
- Every node verifies on write, on replicated read, on head hydration and on the
  persisted head cache: signature, scope binding, the device in the identity's
  device authorization chain at the claimed revision, and the community permission (pin needs
  manage messages; reaction needs channel access). Records that fail are ignored
  and logged by collection only.
- Winner rule, independent of wall clocks: higher `sequence`, then lower proof
  digest. A tombstone (`removed: true`) must be a signed `delete`; a `put` must not
  be removed. `removed`, `deletedAt` or `updatedAt` alone never win. A signed record
  outranks an unsigned one; unsigned records are rejected.
- Index heads are unsigned wrappers: a head with records the gate does not admit is
  held, not cached. The cache keeps the last verified head until the held one is
  admitted or superseded.
- The unsigned reaction cascade tombstones on channel/community deletion are gone;
  the node cannot sign on behalf of users.
- Limits: device authorization is evaluated at the revision the proof claims
  ([Causal device authorization](#causal-device-authorization)), but community
  permissions of these records (pin, reaction, moderation log, request,
  poll, channel message) are still evaluated against the community state folded
  at admission, not at a causal frontier, so records of a member who later lost
  the permission stop being admitted. A head held
  because the community has not replicated yet is re-admitted when it does
  (see below). Authorization lookups are coalesced for 1 s per batch.

#### Readmission of pending records

A replicated document the gate leaves pending is offered to the gate again: 2 s, 10 s and
60 s after it was first held, and in between, at most once every 2 s, whenever the node
admits new replicated state (an admitted document or a newly cached head, including a
local projection such as the identity metadata of an admitted identity). The second
trigger matters because the record usually rests on exactly that state: on a slow node
a joiner's identity can replicate after the community head that lists its join, and
the head would otherwise wait for the next retry.

A refusal is intrinsic: the record can never be valid whatever this node learns later.
A failure that depends on state the node does not hold yet is pending, never refused.
That covers a community or conversation that is not local yet, a frontier whose
operations have not arrived, an identity or device revision that has not replicated,
and a node that is not ready. It applies to community operations, pins, reactions,
channel messages, membership requests, invitation claims, moderation log records, MLS
records, poll scopes and call records (start and participant) alike. A pending record
of a subject that never arrives is dropped with its held copy after 15 minutes.

A head with a pending record is held, not cached. It is offered again the same way.
A held copy is a candidate a peer offered; it never makes a subject unavailable while
a verified head exists for it. A key is verified, per network, by a head that was
admitted in full with gated records kept under a key its gate accepts (or by the
node writing it itself, which settles it in every hosted network); a trivial, empty,
refused or ungoverned head never verifies a key. Reads, the community list and saves
use that head and ignore the held candidates. Error code 503020 answers only for a
subject with no verified head and a held copy: the node has not proven any head of
it yet, for instance a stored head right after a restart. A read of such a subject
never serves the admitted part of a held head. A key restored from the node's own
head cache ends its wait only when that own copy is admitted, expires, or a full
rescan of its network clears it: a head a peer offers under the key, in the same
network or in another, neither verifies it nor supersedes the copy.

A record the gate refuses never becomes valid, so it is dropped and never offered again.
A head that carries one is delivered demoted, with `updatedAt` 0, and is not held.

- The gate decides every offer in full; a readmitted record is one the gate accepts
  now. Readmission never widens what is admitted.
- A held head is delivered only once every record in it is admitted: a partial head is
  never delivered. Delivering an admitted head drops the held copies of its key that it
  supersedes (those not newer than it); a newer copy stays held.
- At most 256 pending documents per store wait in its readmission at once, and 256
  more queue behind them in arrival order. A pending document past both bounds is
  dropped and the store is overflowed: until its queue drains and its documents are
  projected again in full, `isDocumentPendingAdmission` answers `503020` for the
  documents the store dropped and remembers (up to 1024 subjects per store). A
  document dropped past that bound is not remembered: it waits for nothing and is
  offered again by the rescan, so a flood never makes a document it did not drop
  wait. A failed rescan is retried every 60 s. A head with a pending record is held
  under its network's bounds: at most 256 held head keys per network are offered at
  once, and 256 more queue behind them in arrival order. A head past both bounds, or
  a copy past the 8 a key holds, is dropped and the network is overflowed. The flag
  is per network, gates no read by itself, and clears as soon as the network's held
  heads fit again (fewer than 256 keys, no key at its 8 copies) and its heads were
  rescanned without dropping again; it does not wait for the network to drain. What
  a read waits on is the key: a read of a head key that the overflowed network
  dropped answers `503020` (never missing, never partial) while it has no verified
  head. A key this node restored from its own head cache is always remembered (it is
  bounded by the persisted heads); any other key up to 1024 per network, and past
  that it is not remembered, so a peer that plants more keys than that delays no
  read of any other key. A key nobody dropped or holds, and a key with a verified
  head, are read as usual. Holds, drops, cool-downs and the verified and restored
  keys are kept per network and key. A read takes the key alone and sums the
  networks: a key restored from the own cache waits on its own network alone, and
  nothing another network offers ends that wait; any other key waits while a
  network holds or dropped a copy of it unsettled and no network has verified it.
  So a genuinely admitted head with gated records under such a key in network B
  ungates a key that network A only holds from a peer (it never gates a key with a
  verified head, and never a restored one). The verified keys are peer-driven, so
  they are bounded to 8192 per network and evicted oldest first, never a restored
  own key; a peer that admits more distinct keys than that can evict an honest
  verified key, which then waits again only if a copy of it is held. Unregistering a
  network clears its verified and restored keys and its expiries. Only the count of
  dropped heads is logged. A held head is
  offered again on every 60 s retry, with one retry timer for the node, so offers
  never stack. A flood in one store never takes the place of another store's
  records, and one network's held heads never take another's places.
- A held head waits under its key and its value. A copy received again is not held
  twice; a different value under the same key waits beside it, and at most 8 copies
  per key wait. A key that is full keeps the copies it holds, so junk copies cannot
  evict a copy held earlier; a copy past the 8 overflows the network (see above) and is
  offered again from the store when room is back. Copies are not ranked by the
  `updatedAt` they claim before they are admitted.
- A wake offers the pending records one after the other, and at most one wake runs at a
  time; one offer per record runs at a time. Neither a wake nor the backoff waits more
  than 5 s for an offer it started, nor at all for one already running, so an offer that
  never resolves stalls neither the later wakes nor the retirement of its record.
- New state never extends a record's wait: its offers fall inside the same window of
  72 s (at most 87 s when offers stall), and then the rejection is final. A held head
  has no final rejection: once its backoff retires it is offered again every 60 s, for
  as long as the node runs.
- A held copy has one offer chain: its backoff, then the 60 s retry once the backoff
  retires. The retry adds a copy only while no copy of its head key has an offer pending,
  so it never starts a second chain beside one that waits. A copy received again is not
  held twice when its value has a digest; a value without one is held as a new copy on
  each receipt, at most 8 per key, each with its own chain.
- A held copy that never proves out is held for 15 minutes and then dropped. The
  expiry is remembered per network and head key (up to 1024 pairs), not per copy: the
  key is not held again in that network for 15 minutes whatever digests arrive, and
  after 3 expiries it is never held again while remembered, so a peer cannot keep a
  subject waiting by renewing the hold with fresh copies; the same key in another
  network has its own record. Consequence: after the third expiry a genuine head
  offered later under that key in that network is not held either, so a read of it
  no longer answers `503020` while it proves out: it reads as missing until it is
  admitted, or until the key is forgotten (LRU of 1024) or the node restarts.
  Until then a held copy makes only a subject with no
  verified head answer `503020` on a read of that subject. It never delays the
  community list: the list (`GET /communities`, and the discoverable list) waits only
  for a head this node restored from its own persisted head cache at start and has not
  verified yet, whether it is held or was dropped for want of room; no state a peer
  can drive (planted keys, held copies, the overflow of a network) gates a list, so a
  flood of planted keys leaves it served. A community the node learns from a peer
  while running is listed once its head is admitted. Residual: a planted key that was
  also persisted (it needed a head the gate admitted) gates the list for at most 15
  minutes after a restart; a genuine head that needs more than 15 minutes of
  replication reads as missing until a peer offers it again after the cool-down. Held
  and dropped copies are logged as counts with the prefix `Peer-induced hold`; a
  pending record is logged as a count, at most once a minute, and a node that is still
  opening answers `503020` and logs `node starting` instead. A head whose evidence
  check fails on an IPFS error is not cached, held or retried: the key is dropped with
  a warning until a peer offers it again. A key is not marked verified by a head the
  gate refused, by one that carried nothing to check, or by one under a key its gate
  rejects.
- A wake is not scoped to the network or store that admitted the state: the
  state a record rests on often lives elsewhere (a community operation rests on
  an identity and a device authorization).
- The 2 s wake delay outlasts the 1 s authorization lookup cache, so an offer sees
  the state that woke it. Worst case per scope: 256 records offered about 39
  times each (3 retries and a wake every 2 s for 72 s); a head offer runs the
  gate once per gated record it carries.
- A membership-request lookup by identity answers `503020` while a request head under
  that identity's index that this node restored from its own head cache is held, as
  the community list does, so a request is not reported missing while it waits. A
  head a peer plants under the identity's key never makes it wait.
- A read can ask whether a document waits for readmission, by store and id
  (`isDocumentPendingAdmission`), to tell "not admitted yet" from "missing". A
  call endpoint answers a call whose start waits as `503020` not ready instead
  of `CallNotFoundError`, so a call survives the seconds after a node restart in
  which its records are replayed before the authorization they rest on loads.
  The start may be admitted before a participant's own record, so a heartbeat,
  end or signal the call refuses with `CallParticipantNotFoundError` answers
  `503020` instead while that identity's record of the call waits; it asks only
  after the refusal, so a waiting record never blocks a participant the call
  accepts. Asking never admits the record. A waiting document is counted under
  its id but never merged by it, so a forged document with the id of a
  legitimate one waits beside it; at worst it turns `CallNotFoundError` or
  `CallParticipantNotFoundError` into `503020` for that id, within the bound and
  window above.
- A subscriber whose history replay cannot load a block in time is retried on
  the store's next head update. Until every such replay of the store succeeds,
  for at most 60 s after the first one was deferred
  (`isSubscriberBootstrapDeferred`), a call endpoint answers a call or
  participant it cannot find as `503020` instead of `CallNotFoundError` or
  `CallParticipantNotFoundError`. The cause is local block availability, and the
  bound keeps a block no peer serves from holding reads off.
- Keychain lookups (`GET /keychains/{identityId}` and the keychain publication
  consumers) answer `503020` while the node is not ready: startup has not
  finished, or the replicated state is not open, for example no network is
  registered yet, a store still awaits replay, or a subscriber bootstrap is
  deferred (as above). A keychain is not reported missing in that state. The
  consumers complete as for a miss, as described below.

### Replicated store audit

Every store below lives in the private network's OrbitDB under an
`IPFSAccessController({ write: ['*'] })`, so **any member of the network can
append to any store**. Replicated content is trusted only after a node-side
admission policy accepts it. The audit lists the writer, the policy that
protects the collection and what a malicious peer can still do.

| Store                                                                                                                        | Writer                                                   | Policy                                                                                                                                                                                 | Status                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `communityOperations`                                                                                                        | `OrbitDBCommunityRepository`                             | `CommunityOperationGate`, see [Community signed operations](#community-signed-operations)                                                                                              | Signed (#316)                                                               |
| `messages`, `mlsRecords`, `pins`, `reactions`, `requests`, `polls`, `stickerPacks`, `stickerUserLibraries`, `moderationLogs` | the community, poll, sticker and moderation repositories | `PublicMutationGate`, see [Other signed public mutations](#other-signed-public-mutations)                                                                                              | Signed                                                                      |
| `notificationSettings`                                                                                                       | `OrbitDBNotificationScopeSettingsRepository`             | `PublicMutationGate` (`notification_settings`, #349)                                                                                                                                   | Signed                                                                      |
| `keychains`                                                                                                                  | `OrbitDBKeychainMetadataIndex`                           | `OrbitDBKeychainMutationGate`, see [Keychains](#keychains)                                                                                                                             | Self-authenticating (this change)                                           |
| `identities` (identity metadata)                                                                                             | `OrbitDBIdentityMetadataIndex`                           | identity-key signature plus canonical CID, see [Identities](#identities-and-device-authorization)                                                                                      | Self-authenticating (#361), see [design](design/identity-authentication.md) |
| `identities` (device authorization)                                                                                          | `OrbitDBDeviceAuthorizationRepository`                   | history replayed from the pinned genesis, see [Identity device authorization convergence](#identity-device-authorization-convergence)                                                  | Replay-validated from a self-certified genesis (#361)                       |
| `calls`                                                                                                                      | `OrbitDBCallRepository`                                  | `CallStartMutationPolicy`, `CallParticipantMutationPolicy` and `CallEndMutationPolicy` through `PublicMutationGate` (#373)                                                             | Signed                                                                      |
| `contentReplication`                                                                                                         | `OrbitDBContentReplicationRepository`                    | `ContentReplicationMutationPolicy` through `PublicMutationGate`; owner-signed per `(networkId, cid)`, 1 GiB and 10000 records per identity per network (#372)                          | Signed                                                                      |
| `notifications`                                                                                                              | `OrbitDBNotificationRepository`                          | `NotificationInvitationMutationPolicy` and `NotificationStateMutationPolicy` through `PublicMutationGate`, plus `OrbitDBNotificationHeadMutationGate` for `notification:` heads (#371) | Signed                                                                      |
| `conversationOperations`                                                                                                     | `OrbitDBConversationRepository`                          | `ConversationOperationMutationPolicy` through `PublicMutationGate`; roster folded from the signed operations (#370)                                                                    | Signed                                                                      |

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
only when every gate that governs it returns `accepted`: `refused` drops it, `pending`
holds it. `PublicMutationGateInitializer` and `KeychainMutationGateInitializer` each
register their own gate.

No request contract changes: the keychain endpoints already carry the signature.
A malicious peer can still flood the store with validly signed junk of its own
identity, and keychains it signs itself for its own identity remain valid.

Keychain publication events (`keychains.v1.keychain.was_published`) carry only
the owner identity. The register and synchronize consumers resolve the keychain
through `CurrentKeychainFinder`, the lookup that also serves `GetKeychainRoute`:
local replicated metadata first, then the routing records. When the lookup
reports `KeychainNotFoundError` because the replicated document or routing
record has not arrived yet, or `ReplicatedStateNotReadyError` (`503020`)
because the replicated state is still replaying after a restart, the consumer
completes without an error and logs one debug line without identifiers. The
event is not retried. The keychain is recorded when the replicated document is
projected into the metadata index or by a later lookup, and the WebSocket
fanout of the event still runs. Other lookup errors still fail the handler.

`yarn test:integration:forged-keychains` runs four real private Helia/OrbitDB
nodes (two with the gate, one malicious without it, one ungated control). It
checks that a valid keychain and its successor replicate, that the ungated
control surfaces the forgeries (bad signature, wrong CID, foreign key planted
under a victim head) and that the gated nodes never serve them.

#### Identities and device authorization

`OrbitDBIdentityMutationGate` governs the whole `identities` collection and the
`identity:` and `identity-handle:` head keys. Design and limits:
[Identity authentication](design/identity-authentication.md).

- An identity record is admitted only when it embeds the identity, the
  embedded identity verifies against its own id (the identity id is the public
  key), `id` equals `cid`, `cid` is the canonical CID of the identity document
  and every redundant field (`identityId`, `handle`, `networkIds`, `version`,
  `previousCid`) repeats the signed value. Reference-only records, `receivedAt`,
  `deleted` and unknown keys are rejected; a record is at most 64 KiB and an
  identity names at most 32 networks.
- Head keys are bound to the signed identity: `identity:<id>` and
  `identity-handle:<handle>` accept only a record whose signed id or handle
  produces that key, so a valid record cannot be planted under a victim's key.
- Ordering is `version` descending, then `cid` ascending. Nothing sender
  chosen takes part, and no replicated tombstone exists.
- A handle belongs to the identity with the smallest `(claimedAt, identityId)`
  among identities whose latest version claims it. `claimedAt` is the minimum
  signed `timestamp` of that identity's retained versions claiming the handle.
  The result does not depend on arrival order, and claimants are never evicted,
  because an eviction would make the owner depend on history. A node keeps at
  most 64 versions per identity, and `POST /identities` and
  `PUT /identities/{identityId}` are capped at
  `IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE` (default 30) per identity per minute
  (`429`, code `429040`). The per-network admission cap
  (`IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE`, default off, `429041`)
  is local to each node and is not replicated.
- The per-source admission cap (`IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE`, default 30, `429`, code `429042`) is also local to each node, keyed by client address, and is not replicated.
- Device authorization history is replayed from a genesis derived from the
  verified identity chain, so an identity the node has never seen has a trusted
  genesis too (see [Identity device authorization convergence](#identity-device-authorization-convergence)).
  A `device-authorization:` head whose genesis the node cannot verify yet (the
  identity is not known, for instance right after a restart) is refused rather
  than cached; once the genesis is verified the head is merged again from the
  persisted heads history (`OrbitDBReplicatedStateRegistry.rehydrateHead`), so
  no history is lost and no forged head is ever served.
- Not solved: the signer chooses the timestamp, so the holder of an identity
  key can backdate a claim; many valid identities cannot be prevented without
  an admission authority; the identity id remains the authoritative reference
  and a handle is only a claim; the identity-key holder can fork its own genesis.
  Requiring a `PublicMutationProof` would be circular, because the device
  authorization it is checked against is part of the identity data.

#### Deferred: node-authored collections

The design that authenticates these four stores (user-signed records per
store, derived state instead of replicated state, record shapes, admission,
migration and the node-trust model that the design avoids) is in
[`docs/design/node-written-collections.md`](design/node-written-collections.md)
(#361). The behavior below is current until each slice lands.

`contentReplication` was written by the node with no user key to sign it and was not forced into the signed path. A malicious peer can currently do the
following, and each needs a node-identity trust model (which node keys are
trusted for a network) that is a product decision, because `NodeId` is an
unsigned UUID and the shared libp2p peer key is not bound to an identity:

- `contentReplication`: now owner-signed and gated (#372). There is no local-only head index for this collection: reads and staleness checks go through the registry's gated store query, which re-admits records on read; forged heads, claims, `withdrawnAt` and content types never reach a gated node. No replica claims or pubsub replication events remain.

Conversation metadata is no longer unsigned: the roster is the fold of client-signed
`conversationOperations` (gate policy `ConversationOperationMutationPolicy`), there
is no pubsub conversation announce, and the participant index is rebuilt locally
from the folded state, never replicated. Only one-to-one conversations live in this
store: group rosters live in MLS (D15), so a group `conversation_created` record
or a `member_added`, `member_removed`, `member_left`, `admin_promoted` or
`admin_demoted` record from an older node is refused by the gate, and a node that
holds one anyway folds it into no conversation. A 1:1 log holds only geneses,
which have no parents: a record with parents is refused, and the fold keeps the
genesis with the lowest digest.

Notifications are no longer unsigned (#371). An invitation is a `notification_invitation`
record signed by the inviter. A community or one-to-one conversation invitation is
admitted only when the signed community or conversation state allows the inviter (and,
for conversations, the recipient); its id is derived from inviter, recipient, subject
and nonce. A `group_conversation_invitation` names no subject and gets no participant
check, because the group roster lives in MLS: its id is derived from inviter, recipient
and nonce, the conversation id travels only inside the seal, and a group record that
carries `subjectId` is refused. Accept, decline and read are
`notification_state` records signed by the recipient, one record per state, with
terminal states absorbing. Heads are `notification:<recordId>` and must match the
record id; `notification-recipient-index:<id>` heads are refused and the recipient list
is rebuilt locally. Missed-call notifications are derived on each node from its own
call state, stored in a local database and never replicated. The 30 records per
minute per identity cap is enforced on the write path of the local node. The gate
bounds what it keeps per author deterministically: the genuine invitations of one
inviter (`NOTIFICATIONS_MAX_INVITATIONS_PER_IDENTITY`, default 10000) and the
genuine states of one recipient (`NOTIFICATIONS_MAX_STATES_PER_IDENTITY`, default 30000) sort by id and only the first ones that fit are admitted, whatever order
they arrived in. A malicious replica can still publish up to the quota for each
identity it controls. Listing does not change replication: pending group invitations
beyond `NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_PAIR` (default 4) per
(inviter, recipient) or `NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_RECIPIENT`
(default 100) per recipient, in ascending record id order, are admitted and replicated
as usual and only held back from `GET /notifications`, identically on every node that
holds the same records.

Calls are no longer unsigned (#373); see [Durable call state convergence](#durable-call-state-convergence).
Gossiped `calls.v1.*` lifecycle events (`call.started`, `participant.joined|left|declined|missed`,
`call.ended`, `call.missed`) are only claims. The receiving node
(`WebSocketEventHub.publishFromNetwork` and `SendPushNotificationWhenCallStarted`) hands each
claim to `CallEventAttestor`, which rebuilds the event from its own admitted call state
(`CallEventAttestation`) and publishes only that rebuilt event: the call must exist, still be
active for `started`, be ended for `ended`, and the participant state must match for
`participant.*` and `call.missed`. A claim that arrives before its record waits up to 5 seconds
(at most 256 waiters) for the projection, then is dropped. So a forged ringing call creates no
missed-call notification, no push and no WebSocket event on a gated node, a forged active
channel call does not block `CallStarter`, and `calls.v1.signal.sent`, leases and snapshots are
unchanged. The call write path is capped at `CALLS_RECORD_RATE_LIMIT_PER_MINUTE` (default 30)
records per identity per minute (`429`, code `429021`), charged only for a record about to be
stored.

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
older transition history, except the compromise caps in effect, which it carries
as `compromisedCredentials` (at most 32). Those limits bound replay work without
imposing a
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
the selected checkpoint before it can affect later revisions. When healed
replicas hold different recovery checkpoints, the merge keeps the one at the
highest revision (the lowest canonical form among equals) and keeps every lost
recovery, at any revision, that carries a compromise cap the kept one lacks, with
the lost recoveries it recovered from, in `checkpoint.concurrent` (at most 128).
A heal therefore never drops a cap that only a losing partition's recovery carried.

## Device sealing records

A device publishes one daily sealing record per UTC day through `PUT
/identity-devices/{identityId}/sealing-records`. The signed record
`{deviceCredential, identityId, sealingPublicKey, utcDay}` (signing prefix
`pigeon:device-sealing-record:v1`, at most 1024 bytes) is stored as a head under
the `device-sealing-record:` registry prefix and replicated like other heads.
Every node admits it only when the credential is authorized at the
authorization head, the day is today or yesterday in UTC and the device
signature verifies; the merger keeps one key per (identity, device, day) and
refuses a different key for the same triple. The public `GET
/identity-devices/{identityId}/sealing-view` serves the keys for UTC days D and
D-1 only. Senders verify it against the signed transitions read from `GET
/identity-devices/{identityId}/transitions`, which every identity the node
serves may read (a signer it does not serve gets `403014`): the full signed
history of an identity is therefore disclosed to every identity in the
replicated index the node holds, which is any published identity, not only the
users of the node; the registration mode is the access control, by design: the
history is not narrowed to shared communities or conversations. The public view
discloses the device credentials and the device count to anyone who reaches the
node. That anonymous disclosure is flagged for security review, not by design.
Reads are limited per client address, then per target and per node, and a view
is cached for five seconds.

A node prunes the sealing records it holds right after start and then every
hour: every `device-sealing-record:` head whose UTC day (the last key segment)
is neither today nor yesterday is forgotten from the in-memory head caches and
from the node's persisted head cache, including a persisted row the merger
refused at restore. Pruning is scoped to the sealing prefix and never touches
another prefix. The replicated OrbitDB log is append-only and shared, so a node
cannot remove those log entries: a rebuild replays them, and the merger refuses
every record outside the two-day window before it parses the authorization.

On a cold reconciliation a node replays the heads log newest first, so a
sealing record can reach its merger before the authorization head it is judged
against. The same happens live while that authorization head is held. The
merger then answers not ready instead of refusing: the registry defers the
key, logs no rejection, and offers every deferred head to its merger again
once a reconciliation finishes or a held key stops waiting (one log pass per
hosted network; past 4096 deferred keys, every mergeable head). Until then the
sealing view of that identity answers `503020`, and the head cache is not
marked warm, so a restart reconciles again instead of restoring a cache
without the record. A settled read of a head that is absent while any network
is still reconciling also answers not ready, never absent. While a head is
deferred, or being settled and not merged yet by that settle, a head read or
settled read of it answers not ready instead of its older cached copy; a
sealing record whose authorization head is deferred is therefore deferred too,
not refused. A settle repeats its log pass, at most four times, while each pass
merges a head no earlier pass merged, so a record replayed before its
authorization in the same pass is merged once that authorization is.

## Live call projection boundary

Conversation lifecycle documents retain merge tombstones; runtime leases stay
in memory (five-second timeout, sixty-second disconnected retention). WebSocket
clients do not receive these raw documents or lease attributes. They receive
`callId`, `liveCallRevision` and a minimal `liveCall` projection, filtered by
current conversation/community/channel access at delivery time. Browser event
aggregate IDs identify the call, never the composite participant/owner lease. The revision
is local to the connected server; clients reset tracking after reconnect.
Signal delivery retains the signed wire object (identity ids, device credential,
signal type and id, sealed entries, signature and clock fields), the attempt and
the expiry timing; it omits the historical participant list and owning-node ID.

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

Community call starts carry a positive signed `sessionEpoch`. Concurrent starts for the
same channel are all admitted and resolved by the lowest start `payloadDigest` on every
node; the superseded start is inert and its browser snapshot names the winner in
`supersededByCallId`. The epoch is bounded at one above the highest
epoch already admitted for the channel. The epoch stays in node-to-node records and is
not added to the browser live contract.

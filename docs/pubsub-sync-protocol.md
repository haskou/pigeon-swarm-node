# Pub/sub synchronization protocol

## Identity publications

`identities.v1.identity.was_created` and
`identities.v1.identity.was_updated` include the exact
`externalIdentifier` CID produced by the signed publication. Consumers fetch
and validate that candidate directly against the event aggregate identity and
its previous-version chain. They must not resolve the event through a DHT
routing record: OrbitDB metadata is the canonical discovery index.

The remaining attributes describe the published identity metadata:
`handle`, `networkIds`, `previousExternalIdentifier`, and `version`.

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
is hydrated from unexpired in-memory leases. Legacy community participant fields
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
replaced on renewal rather than accumulated. Nodes must keep their clocks in sync. Legacy connected events use their heartbeat
time as the renewal time; legacy disconnected events without `lastRenewedAt`
cannot restore a participation grant.
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


## Community replica convergence

Community documents carry optional `replicaState: { version: 1, entries }` metadata.
Entries are keyed by the canonical JSON encoding of `[field, elementId]`; scalar
profile fields use an empty element ID. Each entry carries a safe integer revision,
a removal marker and its value. The existing community document and member-index
heads carry this state on the same private-network OrbitDB stores. This change does
not introduce a second transport, a public discovery topic, or a new recipient set.

A repository-loaded aggregate retains its own baseline. A save derives changes
against that baseline, increments only changed registers, and then combines the
locally authored state with the latest replica. Unseen changes do not become causal
predecessors of a local edit. Reusing an aggregate for another save preserves its
local view and only its observed/authored revisions as the next baseline, so remote
additions are not mistaken for removals and an unrelated save cannot promote an
unseen revocation into the next local grant's causal history.
Existing aggregates must be loaded through the repository before being updated.
Message, edition, reaction and deletion consumers preserve their existing
event-snapshot validation semantics, including delayed events. Persistence uses the
repository-loaded current community when present; an event snapshot bootstraps only
an absent community and does not replace an existing one. Authenticating historical
membership and permissions requires the operation authorization work in #288; an
event snapshot alone is not evidence of authority.

Conflict rules:

- Different profile fields and different collection elements combine independently.
  The same scalar, role or channel uses the higher element revision, then canonical
  value ordering for equal revisions. Simultaneous edits to different properties of
  the **same role or channel** are a conflict; they do not merge property by property.
- Member additions are independent. Removal wins an equal-revision membership
  conflict; readmission requires observing the removed register before adding again.
  Each admission has a distinct token. Role assignments remain bound to the admission
  observed or authored by their editor and cannot transfer to an unseen readmission.
- Concurrent equal-revision role assignments for the same admission intersect their
  role sets. Higher revisions replace earlier assignments. References to missing
  members or roles are excluded from the materialized view.
- Bans have their own registers and suppress membership and assignments while active.
  Removing a ban exposes the membership register again; it does not create a new
  admission. Removing membership and removing a ban are separate operations.
- Role and channel removal is terminal for that UUID, including against a later stale
  rename. Recreating one requires a new UUID. Channel visibility references to deleted
  roles are removed; an empty visibility list remains empty.
- Community deletion is terminal between versioned documents. Timestamps remain
  informational and never decide element conflicts. Community ID, network, owner and
  creation time must match before two documents can combine.

The same merge runs before head-cache and member-index replacement. During cold
hydration and head reconciliation, the registry replays reachable head-log ancestors
for registered community keys: the key-value index alone hides overwritten values.
It persists a combined head when that content differs from the current persisted
head. Reconciliation uses the source network's cached head, and every community
head write is scoped to its destination network. A local member-index query may
combine communities from several networks, but each persisted index contains only
communities belonging to that network. This does not erase previously replicated
or IPFS history. Replay yields between batches and fails if an ancestor is missing;
it does not mark an incomplete reconstruction as warm. Historical replay is proportional to the
reachable log, and tombstones remain stored. Safe checkpointing and coordinated
compaction are future work; deleting these markers is unsafe.

### Upgrade and trust boundaries

Old snapshots remain readable. The first edited snapshot gains version 1 metadata;
thereafter an unversioned snapshot cannot replace versioned state. Unversioned pairs
retain deterministic whole-document selection and do not gain concurrency guarantees.
Upgrade all writers in a private network together before resuming writes. A rolling
mixed-version deployment is **not** a supported concurrent-write configuration: late
legacy changes, including legacy deletion, are ignored after migration. Preserve the
existing stores when upgrading; no destructive migration is performed automatically.

Structural validation rejects unsupported versions, malformed paths, invalid revision
counters and incompatible register values. It is not authentication. A node with write
access can still forge plausible values or revisions. Deterministic conflict resolution
does not prove who authorized a grant, ban, deletion or profile change. Durable
operation authorization and revocation enforcement remain tracked in
[haskou/pigeon-swarm-node#288](https://github.com/haskou/pigeon-swarm-node/issues/288).
The current stores still reveal community metadata to their readers; this work neither
establishes E2EE nor hides the social graph from an authorized or compromised node.

### Verification

`yarn test:integration:community-convergence` uses three real private Helia/OrbitDB
instances with separate peer identities, directories and registries, in one process.
It partitions store synchronization and closes connections, authors independent
changes, reconnects peers, delays a third replica, checks explicit removal against a
stale edit, verifies a fresh persisted marker crosses a repeated reconnection, and
reopens a store with a fresh registry. Assertions compare complete community content
and member-index results. A fourth instance uses a separate private network and key
while sharing the backend registry. The fixture checks every reachable member-index
log entry for foreign-network content and reconstructs both networks from persisted
stores, preserving combined local queries without cross-network writes. Fixtures own
and remove their temporary data. The check runs
in `test:ci`; unit regressions additionally exercise three-write permutations, stale
grants, role/channel deletion, legacy replay and malformed metadata. Loopback transport
does not validate external NAT traversal or calls.

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
one greater than the largest known epoch, independent of clock order. Existing
active legacy IDs remain usable. A replica missing newer history may select an
older epoch, which remains subject to its replicated termination; this is not
consensus or automatic reconciliation of legacy duplicate sessions. The epoch
stays in node-to-node records and is not added to the browser live contract.

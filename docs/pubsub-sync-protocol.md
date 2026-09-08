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
  "lastActivityAt": 1770000000000,
  "updatedAt": 1770000000000,
  "networkIds": ["<networkId>"]
}
```

`customMessage`, `lastHeartbeatAt`, `lastActivityAt`, and `networkIds` may be
absent. `identityId`, `ownerNodeId`, `preferenceUpdatedAt`, `selectedStatus`,
`status`, and `updatedAt` are required.

## Durable call state convergence

Call snapshots in the private network's OrbitDB `calls` store merge each
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

## Call participant leases

`calls.v1.participant_lease.was_updated` replicates ephemeral call membership
connectivity without writing heartbeat timestamps to OrbitDB. Leases are keyed
by `(callId, participantIdentityId, ownerNodeId)`, allowing a direct call to be
created on one node while another participant joins and renews from a different
node.

Every heartbeat publishes a connected snapshot. After the timeout, all nodes
remove their stale local copy, but only the owner publishes the disconnected
snapshot. Durable call documents retain call lifecycle and participant history;
they contain no heartbeat timestamp.

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
  "status": "connected"
}
```

Media connection reports are replaced on every participant heartbeat. They
describe the selected ICE path observed by the browser for each remote
participant. A report change is forwarded to participant WebSockets; identical
heartbeat snapshots remain node-to-node only. Reports are cleared when the
lease disconnects and are never persisted in OrbitDB/IPFS.

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

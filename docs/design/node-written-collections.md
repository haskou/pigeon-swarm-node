# Authenticating the node-written replicated collections

Status: design, no product code. Tracks issue #361. Follows the replicated
store audit in [`docs/pubsub-sync-protocol.md`](../pubsub-sync-protocol.md#replicated-store-audit)
(#367).

Four replicated stores are still written by the node and accepted by every peer
without any signature (`write: '*'`):

| Store | Writer | Head keys |
| --- | --- | --- |
| `conversations` (metadata) | `OrbitDBConversationRepository`, `OrbitDBConversationIndex` | `conversation:<id>`, `conversation-participant-index:<identityId>` |
| `calls` | `OrbitDBCallDocumentReplicator` | none (document log) |
| `notifications` | `OrbitDBNotificationRepository` | `notification:<id>`, `notification-recipient-index:<identityId>` |
| `contentReplication` (heads and replica claims) | `OrbitDBContentReplicationRepository`, `OrbitDBContentReplicaClaimRepository` | `content-replication:<cid>`, `content-replica-claim:<cid>:<networkId>:<nodeId>` |

The audit deferred them because "no user key signs them" and a node-identity
trust model is a product decision. This document does not accept that premise:
for the three stores that carry user intent, a user device key *can* sign, and
for the fourth the replicated state should not exist. A node-trust model is
specified (see [Node trust](#node-trust-only-if-unavoidable)) but the
recommended design does not need it.

## Principles

1. **Ask who the real actor is.** Every record exists because a user did
   something (created a conversation, started a call, sent an invitation,
   uploaded content). The user's device key signs that intent with the existing
   `PublicMutationProof`. The node is a relay and validator, not an author.
2. **Do not replicate what can be derived.** State that is a pure function of
   signed records (call status, missed calls, participant indexes, replica
   counts) is computed locally and never put on the wire. Derived state cannot
   be forged by a peer.
3. **Reuse the existing gates.** `PublicMutationGate` policies per
   `collection`/`scopeType`, `PublicMutationVerifier` (binding, device
   signature, device authorization), `OrbitDBMutationGate` head gating, and the
   registry's fixpoint readmission of rejected records. No second convention.
4. **Ids bind to the author.** A record id is derived from the author and a
   nonce (or from the participant set for 1:1), and the policy recomputes it.
   Otherwise a lower `payloadDigest` ground by an attacker would win the
   `winsOver` tie-break for somebody else's id.
5. **No node-chosen time as an ordering input.** `updatedAt`/`receivedAt` chosen
   by the sender are what makes `OrbitDBHeadIndex` freshness forgeable today.
   Ordering comes from `PublicMutationProof.sequence` and the digest tie-break,
   or from a deterministic function of the signed record set.
6. **Clean cutover.** No production data, no legacy: old unsigned documents and
   head keys are dropped, old document fields removed, every caller migrated.
   No shims, no dual read paths.

## Machinery being reused (verified in code)

- `PublicMutationProof` (`src/contexts/public-mutations/domain/PublicMutationProof.ts`):
  `{version, operationId, kind, store, recordId, predecessor, sequence,
  payloadDigest, author{identityId, deviceCredential}, signature}`; signing
  content is `pigeon:public-mutation:v1\n` + canonical body; `winsOver` is
  higher `sequence`, then lower digest.
- `PublicMutationGate` takes `PublicMutationPolicy[]` keyed by
  `collection\nscopeType`. A policy supplies `expectationOf(record)`
  (`authorIdentityId`, `recordId`, `store`) and `assertPermitted(record,
  authorIdentityId, isDeletion)`; `PublicMutationRecordShape` fixes the field
  set. `ConversationMessageReactionMutationPolicy` is the template (derives the
  id from fields, rejects mismatch, looks up conversation metadata through a
  `ShortLivedLookup`, checks `hasParticipant`).
- `OrbitDBMutationGate.governs/accepts/governsHead/acceptsHead`, composed via
  `OrbitDBReplicatedStateRegistry.addMutationGate`. The registry re-evaluates
  rejected records in a loop until no progress (`OrbitDBReplicatedStateRegistry`
  lines ~255-266), so in-batch dependency order between records is handled.
  Cross-batch ordering is an acknowledged risk, listed per slice below.
- `OrbitDBHeadIndex` merges with `PublicMutationRecord.replaces` when proofs are
  present and falls back to `max(deletedAt, receivedAt, updatedAt, createdAt)`
  otherwise. The fallback is the forgeable path; after these slices no gated
  collection reaches it.
- Device authorization is evaluated at the current device-authorization head,
  not the causal revision (#362). Every slice below inherits that residual and
  is not blocked by it, but should adopt the #362 fix when it lands.

## Slice 1: conversation metadata

### Threat today

- `OrbitDBConversationDocument` is `{createdAt, id, lastEventId?,
  lastEventType?, name?, networkId, participantIds[], receivedAt?, type,
  updatedAt?}`: no creator, no signature.
- `OrbitDBConversationMapper.toDocument` stamps `updatedAt: Date.now()` on every
  save, and every message save rewrites the document.
  `OrbitDBConversationIndex.shouldReplace` compares
  `max(updatedAt, receivedAt, createdAt)`, so a document with a higher
  `updatedAt` replaces the real one: add the attacker to `participantIds`,
  remove real members, forge `conversation-participant-index:<id>`.
- `RegisterConversationWhenAnnounced` registers a conversation announced over
  pubsub with no signature check when no metadata exists.
- This is the authority root: `CallScopeResolver`, `CallAccessAuthorizer`, and
  the message, pin and reaction policies call `findMetadataById` +
  `hasParticipant`. Forged metadata therefore grants read/write authority over
  messages, pins, reactions and calls of the victim conversation.
- Membership is immutable today: only `GroupConversationCreator` and
  `OneToOneConversationCreator` mutate participants; there is no add/remove
  participant use case.

### Mechanism

A **user-signed, immutable creation record** replaces the unsigned document.
No node trust.

- Collection `conversations`, new policy `scopeType: 'conversation_record'`.
- One record per conversation, `recordId == conversationId`, `kind: put`,
  `sequence: 0`, `predecessor: null`. Deletions and sequence > 0 are rejected
  (membership is immutable; if participant changes are added later they become
  a version chain with the same gate).
- The author is the creator (`authorIdentityId == creatorIdentityId`).

### Record shape and canonical signing

```jsonc
{
  "id": "group:<hash> | one-to-one:<hash>",
  "type": "group | one-to-one",
  "networkId": "<networkId>",
  "creatorIdentityId": "<identityId>",
  "participantIds": ["<identityId>", "..."],   // sorted, unique, includes the creator
  "name": "<optional, groups only>",
  "nonce": "<base64url, groups only>",
  "createdAt": 1770000000000,                  // creator-claimed, informational only
  "mutation": { /* PublicMutationProof, canonical per #316 */ }
}
```

Canonicalization and signature are exactly `PublicMutationRecord.withProof`:
`payloadDigest = sha256(canonicalize(record without proof))`, device signature
over `pigeon:public-mutation:v1\n` + canonical proof body. Removed fields:
`updatedAt`, `receivedAt`, `lastEventId`, `lastEventType` (they become
local-only, derived from the message store; they never travel).

Id binding (policy recomputes it, rejects on mismatch):

- group: `group:` + base64url(sha256(`creatorIdentityId` `:` `nonce`))[0..22).
  The id includes the creator, so a record by another author cannot claim it.
  Replaces random `ShortId`.
- one-to-one: `ConversationId.deterministic(a, b, networkId)` over the two
  `participantIds` (already `one-to-one:` + sha256 of the sorted
  `a:b:networkId`). The author must be `a` or `b`.

### Admission policy (`assertPermitted`)

1. Shape valid; `id` recomputes; `creatorIdentityId == author`.
2. `participantIds` unique, creator included; one-to-one has exactly two; group
   has `>= 2`; size cap (reuse the existing group member cap).
3. `networkId` is a network of the creator identity (`identity.getNetworkIds()`).
   Participants need not be known locally (they may live on other nodes).
4. `name` bounded by the existing name value object.

Head gating: `conversation:<id>` heads carry the signed record and are governed
via `governsHead/acceptsHead` (head key must equal `conversation:<record.id>`
and the record must pass the checks), as the keychain gate does. The
`conversation-participant-index:<identityId>` head is **not replicated**: each
node rebuilds the participant index locally from admitted records, so it
cannot be forged or shadowed. `RegisterConversationWhenAnnounced` is removed
(the pubsub announce no longer creates metadata; the replicated record is the
only source).

### Order and convergence

Immutable, content-addressed id: all nodes converge on the same record
regardless of arrival order. Two records for one id can only come from the same
creator (id includes the creator); the lower digest wins by `winsOver`, and the
creator only hurts themselves. Message/pin/reaction/call policies depend on the
conversation record; a message arriving before its conversation is rejected and
re-evaluated by the registry loop within a batch. Cross-batch risk: a message
batch admitted before the conversation record is dropped; the test below covers
the order and the implementation must either requeue or hydrate the conversation
first (the existing message path has the same dependency today).

### UI/API contract changes

- `POST /conversations` gains a required `mutation: SignedPublicMutation`
  produced by the client device key (as `POST .../messages` already does).
  The node holds no user key, so the client must sign. The signed HTTP
  headers continue to authenticate the request only.
- Group ids are no longer random `ShortId`. The client must know the final id
  before signing, so the client generates the `nonce` and sends it with the
  signed record; the node only validates it.
- Response shape unchanged. Update `docs/api.md` ("Create a conversation"),
  both swagger files, and `docs/pubsub-sync-protocol.md` (audit table, the
  `conversations` row becomes signed, new "Conversation records" section).

### Tests required

- Unit: policy accept; reject wrong author, id mismatch, creator not in
  participants, wrong participant count, foreign network, `sequence > 0`,
  deletion, extra fields; deterministic 1:1 recomputation; group id includes
  creator.
- Unit: `findByParticipant` and participant index derive only from admitted
  records; forged `updatedAt` cannot replace.
- Unit/integration: message, pin, reaction and `CallAccessAuthorizer`
  decisions use the signed record; a forged conversation grants nothing.
- Real transport e2e `forged-conversations` in the style of `forged-keychains`:
  honest gated nodes, one malicious ungated node, one ungated control. Forgeries:
  higher-`updatedAt` replacement adding the attacker, removed members, foreign
  head key planted under a victim head, forged participant index, forged pubsub
  announce. Gated nodes never serve them; valid creation replicates.
- Cucumber: create group/1:1 with and without `mutation`.

### Migration

Drop the `conversations` store contents and the participant-index head keys;
messages in old conversations become unreachable without a record. No data
migration (no production data). Remove `updatedAt`/`receivedAt`/`lastEvent*`
from the document, mapper, `OrbitDBConversationIndex.shouldReplace` and
`RegisterConversationWhenAnnounced`.

## Slice 2: notifications

### Threat today

- `OrbitDBNotificationDocument = {createdAt, id, payload, recipientIdentityId,
  state, status, type}`; payload is a conversation invitation
  (`encryptedConversationKey`, `inviterIdentityId`, `inviterSignature`,
  `recipientIdentityId`), a community invitation, or a missed call
  (`callId`, `callerIdentityId`, `networkId`, `recipientIdentityId`).
- `OrbitDBNotificationRepository.save` writes the document and the heads
  `notification:<id>` and `notification-recipient-index:<recipientIdentityId>`
  through `OrbitDBHeadIndex` with no gate. A peer can forge notifications for any
  recipient, including fake invitations carrying an attacker-chosen
  `encryptedConversationKey`, overwrite or hide the recipient index, flip
  `state`, and flood. Invitations also trigger push
  (`SendPushNotificationWhenNotificationCreated`).
- `inviterSignature` is stored but never verified (grep finds it only in
  payload types, message builders and documents).

### Mechanism

Split by actor:

- **Invitations (conversation and community):** the actor is the inviter.
  Replicated as a user-signed record by the inviter's device (`PublicMutationProof`).
- **Recipient state (accepted/declined/read):** the actor is the recipient.
  A separate recipient-signed record `notification-state:<notificationId>`
  (sequence chain, higher sequence wins).
- **Missed-call notifications:** nobody can sign them; they are a pure function
  of a signed call that timed out. They are **no longer replicated**; each node
  derives them locally from admitted call records (slice 4). The deterministic
  id `missed-call:<callId>:<recipientIdentityId>` already dedupes across nodes.
  Until slice 4 lands they are still produced by `CallTimeoutScheduler` but are
  written to the local repository only (no `notifications` collection write, no
  head), which removes the forged-notification and forged-recipient-index paths
  for that type immediately.

### Record shape and canonical signing

Invitation (`collection: notifications`, `scopeType: notification_invitation`):

```jsonc
{
  "id": "invitation:<hash(inviterIdentityId:recipientIdentityId:subjectId:nonce)>",
  "type": "conversation_invitation | group_conversation_invitation | community_invitation",
  "inviterIdentityId": "<identityId>",
  "recipientIdentityId": "<identityId>",
  "subjectId": "<conversationId | communityId>",
  "encryptedKey": "<encryptedConversationKey | encryptedCommunityKey>",
  "nonce": "<base64url>",
  "mutation": { /* PublicMutationProof, author == inviter */ }
}
```

State record (`scopeType: notification_state`): `{id: 'notification-state:<id>',
notificationId, recipientIdentityId, state: 'pending|accepted|declined', read,
mutation}` with author == recipient.

`createdAt` is dropped (ordering is `sequence`). The existing `inviterSignature`
field is redundant with the device-signed proof and is removed from the payload
(coordinate with the UI, which may verify it today).

### Admission policy

- Invitation: author == `inviterIdentityId`; id recomputes; conversation
  invitation requires an admitted conversation record (slice 1) where the
  inviter and the recipient are both in `participantIds`; community invitation
  requires the inviter to hold the invite permission in the community state
  (existing community authority) for `subjectId`; `encryptedKey` bounded by the
  existing value object; recipient is a syntactically valid identity id.
- State: author == `recipientIdentityId` of the invitation it references; the
  invitation exists and is admitted; `accepted`/`declined` are terminal (no
  transitions out), `read` is monotonic.
- Heads: `notification:<id>` governed like the conversation head; the
  `notification-recipient-index:<identityId>` head is not replicated and is
  rebuilt locally from admitted records.

### Order and convergence

Invitation is immutable (one record per id). State is per-notification LWW by
`sequence` then lower digest, with terminal states absorbing, so concurrent
accept/decline by the same recipient converges deterministically (decline vs
accept: lower digest among equal sequence; the recipient is the only writer).

### UI/API contract changes

- `POST /notifications` replaces `inviterSignature` with `mutation:
  SignedPublicMutation` (the client signs the record above and must know the
  final id, so it supplies `nonce`).
- `PATCH /notifications/{id}` gains `mutation` signed by the recipient.
- `missed_call` notifications: read/state are local to the node the user reads
  from (not shared across the user's nodes). `GET /notifications` shape
  unchanged. Update `docs/api.md` (notification section), swagger and
  `docs/pubsub-sync-protocol.md`.

### Tests required

- Unit: policies (accept; wrong author, id mismatch, inviter not in the
  conversation, recipient not in the conversation, forged `encryptedKey` under a
  different inviter, state by non-recipient, state out of terminal, unknown
  notification).
- Unit: push consumer only fires for admitted notifications; missed-call is not
  written to the collection.
- Real transport e2e `forged-notifications`: forged invitation with attacker
  key, forged state flip, forged recipient index head, flood are never served by
  gated nodes; a valid invitation and its accept replicate.
- Cucumber for `POST /notifications` and `PATCH /notifications/{id}` with and
  without `mutation`.

### Migration

Drop `notifications` collection content and the heads. Remove
`inviterSignature`, `createdAt`, recipient-index head writes from the document
and repository. Missed-call notifications move to the local repository.

## Slice 3: content replication

### Threat today

- `OrbitDBContentReplicationDocument = {cid, contentType?, context,
  createdAt, filename?, id, networkIds[], ownerIdentityId?, priority,
  sizeBytes, updatedAt}`; `OrbitDBContentReplicaClaimDocument = {cid,
  claimedAt, id, kind, networkId, nodeId, updatedAt?, withdrawnAt?}`.
  `RegisterContentReplicationWhenRegistered` and
  `RegisterContentReplicaClaimWhenClaimed` write whatever the event carries.
- `ContentReplicationMaintainer.maintainResponsibleReplica` calls
  `findBytesInNetwork`/`findJSONInNetwork` without `maxBytes` (the IPFS layer
  supports an optional `maxBytes`, `IPFS.getBytes(cid, maxBytes?)`, unused here)
  and then `provideInNetwork` + claims. A forged head makes every honest node
  fetch, pin and advertise an arbitrary CID of any size (the 50 MiB upload cap
  in `maxContentSizeBytes` only applies to local uploads). Flooding exhausts
  disk.
- Claims are used by `ContentReplicationPolicy.canReleaseLocalReplica`: forged
  claims make honest nodes release their local replica believing responsible
  nodes hold it (data loss), forged `withdrawnAt` removes real claims.
- `contentType`/`filename` are replicated and served by `ContentGetter` as
  `Content-Type` and `Content-Disposition`: a peer can overwrite a public
  upload's content type (e.g. `text/html`).
- `NodeId` (UUID, unsigned) is the unit of responsibility (`activeNodeIdsByNetwork`
  comes from unsigned heartbeats), so forged heartbeats also skew
  responsibility. Heartbeats are pubsub events, not a replicated store; this is
  recorded as a residual, not changed here.

### Mechanism

Three separate concerns, three outcomes:

1. **Intent to replicate a CID (head): user-signed.** The actor is the uploader
   (`ownerIdentityId`). Records are signed by the uploader's device key.
2. **Replica claims: stop replicating them.** A claim is a statement by a node.
   Signing it needs node trust. The only consumer is the optional "release the
   extra replica" optimisation, which does not justify a node-trust model.
   Claims, `releaseLocalReplica`, and the `knownReplicas` counters are removed.
3. **Content type and filename: stop replicating them.** They are not bound to
   the CID. The node serving public bytes derives the type by sniffing magic
   bytes against an allowlist (`image/png`, `image/jpeg`, `image/gif`,
   `image/webp`, `image/avif`, `application/pdf`, `audio/*`/`video/*` container
   signatures) and otherwise serves `application/octet-stream` with
   `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
   The uploading node may keep the claimed type/filename in its *local* store
   for its own responses only.

All fetches, local and replicated, are bounded: `maxBytes = min(declared
sizeBytes, maxContentSizeBytes)`, and the received size must not exceed the
declared size.

### Record shape and canonical signing

`collection: contentReplication`, `scopeType: content_replication`, one record
per `(networkId, cid)`:

```jsonc
{
  "id": "content:<networkId>:<cid>",
  "cid": "<cid>",
  "networkId": "<networkId>",
  "context": "ipfs_public_upload | ipfs_private_upload",
  "sizeBytes": 215040,
  "ownerIdentityId": "<identityId>",
  "mutation": { /* PublicMutationProof, author == ownerIdentityId */ }
}
```

Removed: `contentType`, `filename`, `priority` (constant `NORMAL`), `createdAt`,
`updatedAt`, `networkIds[]` (one record per network), the claim document
entirely. Deletion (`kind: delete`) by the owner removes the replication intent.
`content-replica-claim:*` heads are removed.

### Admission policy

- id recomputes; author == `ownerIdentityId`; `networkId` is a network of the
  owner identity; `context` is one of the two known values; `sizeBytes` is an
  integer in `[1, maxContentSizeBytes]`.
- Per-identity, per-network quota: the sum of `sizeBytes` of the owner's live
  records (derived locally) must stay within a configurable quota; records over
  quota are rejected. This bounds abuse by a registered identity (without it a
  valid identity can still pin cheaply).
- Head gate: `content-replication:<cid>` is a local-only derived index. It is
  rebuilt from admitted records and not replicated.

### Order and convergence

Per record id: `sequence` then lower digest; delete is a higher-sequence record.
The set of CIDs to hold is a pure function of the admitted records, so nodes
converge without coordination. Responsibility stays a deterministic function of
`networkId`, `cid`, and the node set. The recommended policy is safe without
claims: a responsible node fetches (bounded) and provides; nobody releases a
replica because of another node's statement. With `<= 5` active nodes everyone
holds everything as today. The uploader always keeps its own copy. Storage on
non-responsible uploaders is the price; it is bounded by the per-identity quota.

### UI/API contract changes

- Upload endpoints (`POST /ipfs/public`, `POST /ipfs/{networkId}`) no longer
  announce replication. Replication registration is a second request,
  `PUT /ipfs/replication/{cid}` (or equivalent) with `{networkId, context,
  sizeBytes, mutation}` after the client has the CID. For public uploads of an
  unpublished identity (avatar before the identity is published, which the
  API explicitly supports) the client registers after publishing the identity;
  until then the content lives on the uploading node only.
- `GET /ipfs/{cid}`: `Content-Type`/`Content-Disposition` become the sniffed
  type or `application/octet-stream` + `attachment`; clients that need the
  original filename get it from signed records, not from this endpoint.
- `GET /ipfs/replication/status`: `releasableCount` and known-replica fields
  are removed. Update `docs/api.md`, swagger and `docs/pubsub-sync-protocol.md`.

### Tests required

- Unit: policy (accept; wrong author, id mismatch, foreign network, `sizeBytes`
  0/over cap/non-integer, over quota, forged delete by non-owner).
- Unit: `ContentReplicationMaintainer` passes `maxBytes` to
  `findBytesInNetwork`/`findJSONInNetwork`; an oversized stream aborts with
  `IPFSContentTooLargeError`; no claim path exists.
- Unit: content-type sniffing and header selection.
- Real transport e2e `forged-content-replication`: forged head for an arbitrary
  CID, forged claim, forged `withdrawnAt`, content-type overwrite never reach
  gated nodes and never cause a fetch; a valid signed record triggers a bounded
  fetch.
- Cucumber/API for the registration endpoint.

### Migration

Drop the `contentReplication` store (documents, heads and claims). Remove the
claim repository, document, mapper, `ContentReplicaClaimRegistrar`,
`RegisterContentReplicaClaimWhenClaimed`, `ContentReplicationWasClaimedEvent`,
`releaseLocalReplica`, and the publish-time announce. CIDs already uploaded
must be re-registered by their owners (no production data).

Quick win, independent of the signed registration: the `maxBytes` bound can ship
first as its own commit inside this slice because it closes the arbitrary-size
fetch without any client change.

## Slice 4: calls

### Threat today

- `OrbitDBCallDocument` is `{id, createdAt, creatorIdentityId?, endedAt?,
  endedByIdentityId?, networkId, participantIds[], participants[{identityId,
  status, joinedAt, leftAt, declinedAt, missedAt}], scope{type, conversationId,
  communityId, channelId}, status, sessionEpoch?, updatedAt?}`, written through
  `registry.putDocument('calls', …, [networkId])` and registered on remote
  nodes from `CallStartedEvent` attributes (`RegisterCallWhenStarted`) with no
  signature.
- `CallTimeoutScheduler` (every 5 s, 60 s ringing timeout) marks ringing
  participants as missed and creates `Notification.missedCall` per participant
  (saved and published, with push). A forged ringing conversation call makes
  every holder emit missed-call notifications and push for the victim.
- A forged active channel call makes `CallStarter` join it instead of creating
  one, blocking real calls; `OrbitDBCallDocumentMerger` takes the max
  `sessionEpoch` (poisoning) and treats ended/missed as terminal (forged
  `ended`); flooding.
- Calls are started over signed HTTP; no `PublicMutationProof` is carried.

### Mechanism

A **user-signed event log**. The call state is derived locally from the admitted
events (no replicated mutable state).

- Call start: `scopeType: call_start`, one record per call, author == caller.
- Participant events: `scopeType: call_participant`, one record per
  `(callId, identityId)` with a `sequence` chain whose payload `state` is
  `joined | left | declined`.
- Call end: `scopeType: call_end`, one record per call, signed by the creator
  (or, for conversation calls, derivable: all participants left or declined).
- **Derived (never replicated):** `status`, `endedAt` for the derived end,
  `missed`, `sessionEpoch` resolution, participant list/state, the call
  indexes, missed-call notifications.
- Ephemeral leases and signals stay unreplicated, as `pubsub-sync-protocol.md`
  already states.

Community voice calls store no participants; the start record carries the
`communityId`/`channelId` scope and admission uses the community channel access
check (`CallAccessAuthorizer` against the signed community state), not a
participant list.

### Record shape and canonical signing

```jsonc
// call_start: id = call:<hash(creatorIdentityId:nonce)>
{ "id": "call:<hash>", "callId": "<same>", "nonce": "<base64url>",
  "creatorIdentityId": "<identityId>", "networkId": "<networkId>",
  "scope": { "type": "conversation", "conversationId": "<id>" }
          | { "type": "community_channel", "communityId": "<id>", "channelId": "<id>" },
  "participantIds": ["<identityId>", "..."],      // conversation scope only
  "sessionEpoch": 1,                               // community channel only
  "startedAt": 1770000000000,                      // creator-claimed
  "mutation": { /* author == creatorIdentityId */ } }

// call_participant: id = call-participant:<callId>:<identityId>
{ "id": "...", "callId": "<id>", "identityId": "<identityId>",
  "state": "joined | left | declined", "at": 1770000000000, "mutation": { /* author == identityId */ } }

// call_end: id = call-end:<callId>
{ "id": "...", "callId": "<id>", "endedByIdentityId": "<identityId>",
  "at": 1770000000000, "mutation": { /* author == endedByIdentityId */ } }
```

`at`/`startedAt` are author-claimed and informational: they can only mislead
about the author's own actions. No node-chosen `updatedAt`/`receivedAt`.

### Admission policy

- `call_start`: id recomputes; author == creator; conversation scope requires an
  admitted conversation record (slice 1) where the creator is a participant and
  `participantIds` equals the record's `participantIds` (one-to-one: exactly the
  two); community scope requires channel access of the creator and no
  `participantIds`; `sessionEpoch` bounded to `known max + 1`; at most one
  active call per community channel, resolved deterministically (lowest
  `payloadDigest` among active starts, see below).
- `call_participant`: the call exists; author == `identityId`; `identityId` in
  `participantIds` (conversation) or has channel access (community); state
  transitions are monotone per identity (a declined or left stays so unless
  `sequence` increases with a rejoin where the call is still active).
- `call_end`: author is the creator, or any participant of a conversation call;
  the call exists.
- Per-identity flood bound: at most one non-ended call started by an identity
  per scope (derived check), and a record-rate cap per identity per minute on
  the gate.

### Order and convergence

- Per record id: `winsOver` (sequence, then lower digest).
- Call status is a pure function of the set of admitted records: `ended` if a
  `call_end` exists or (conversation scope) every participant's last state is
  `left`/`declined` after at least one `joined`; otherwise `active`; `missed` is
  derived from local time (see the stale-call decision). Two nodes with the same
  record set derive the same status; timing-based `missed` is local and never
  replicated, so node disagreement is harmless.
- Concurrent community channel starts: the call with the lowest
  `(payloadDigest)` among active starts in that channel wins; losers' joiners
  follow the winner. A member can grind a lower digest but can only affect
  channels they already have access to.
- Dependency ordering (call before its participant records, conversation record
  before the call): same rejected-until-dependency loop as slice 1.

### UI/API contract changes

- `POST /calls` gains `mutation` (call_start); `POST
  /calls/{callId}/participants` and `DELETE /calls/{callId}/participants/me`
  carry `mutation` (call_participant); `DELETE /calls/{callId}` carries
  `mutation` (call_end). The client generates `nonce`, signs, and the node only
  validates and stores. Heartbeat and signal endpoints are unchanged
  (ephemeral).
- A node can no longer write a participant's `left` for a crashed client. A
  graceful exit signs `left`; a crash is handled by the lease expiring locally
  (the node hides the call from its users) plus the maximum call duration
  cutoff (owner decision below). `GET /calls` and `/calls/history` keep the
  same shape.
- Missed-call push and notifications are derived from admitted call_start
  records only.
- Update `docs/api.md`, swagger and `docs/pubsub-sync-protocol.md`.

### Tests required

- Unit: each policy (accept and every reject above); status derivation from
  event sets (all permutations of arrival order produce the same status);
  deterministic community-call winner; `sessionEpoch` bound.
- Unit: `CallTimeoutScheduler` produces missed derived state only for admitted
  calls and no replicated write.
- Unit: `CallStarter` is not blocked by a call that fails admission.
- Real transport e2e `forged-calls`: forged ringing call (no missed
  notification/push on gated nodes), forged active channel call, forged ended,
  `sessionEpoch` poisoning, flood. The existing call-history and call-privacy
  scripts keep passing.
- Cucumber for each call endpoint with and without `mutation`.

### Migration

Drop the `calls` collection. Remove `OrbitDBCallDocument`,
`OrbitDBCallDocumentMerger`'s status/epoch merge, `RegisterCallWhenStarted`
replica registration, and the timeout scheduler's replicated notification write.
Active calls at the time of cutover are lost.

## Node trust (only if unavoidable)

The recommended design does not need node signatures: slices 1-4 are signed by
user devices or removed. Node trust becomes necessary only if the owner decides
to keep node-attested state (replica claims, or sybil-resistant active-node
counting for distributed replication; forged heartbeats are the open instance).
The model below is complete so that decision can be made, not scheduled.

### Current state (verified)

- `NodeId` is `UUID.generate()` (`src/contexts/shared/domain/value-objects/NodeId.ts`),
  persisted in local node metadata (`LocalNodeMetadataRepository.loadLocalNodeId`).
  It is unsigned and self-declared; heartbeats carrying it are unsigned pubsub
  events (`NodeHeartbeatWasSent`, attributes `networks`, `owner`).
- The libp2p/Helia peer key authenticates a transport connection but is not bound
  to `NodeId` or to any identity.
- A node already has an `owner` identity (`NodeOwnerAssigner`). A private network
  is defined by a symmetric `NetworkKey` shared by all members (a pre-shared
  key); a public network has no key. There is no network owner or network
  allowlist.

### Creation and binding

- Each node generates an Ed25519 **node key** at first start, stored beside the
  local node metadata. `NodeId` becomes `base64url(sha256(nodePublicKey))`
  (a cutover: the UUID is dropped; the key is the identity).
- A **`NodeBinding`** is a `PublicMutationProof`-signed record
  (`collection: nodes`, `scopeType: node_binding`, id `node:<networkId>:<nodeId>`)
  whose author is a user identity authorized in that network, payload
  `{nodeId, nodePublicKey, networkId, ownerIdentityId}`. The node signs its own
  statements (claims, heartbeats) with the node key; a statement is trusted only
  if a valid binding for that `nodeId` exists on that network and has not been
  revoked.

### Trust establishment per network (options)

| Option | How | Pros | Cons |
| --- | --- | --- | --- |
| A. User-signed binding (recommended) | The node owner (an existing identity) signs the binding with their device key; trust follows the user's own device authorization chain. | No new trust anchor, per-user accountability, reuses the gate. | Public network: anyone can bind a node (accountable and quota-able, not sybil-proof). |
| B. Owner-signed allowlist | A network owner identity signs the list of admitted node keys. | Strong for closed networks. | Needs a network owner/genesis that does not exist today. |
| C. TOFU | Pin the first key seen per `nodeId`. | No setup. | A forger who announces first wins; no revocation story. Rejected. |
| D. Network-key membership | Node key must be accompanied by an HMAC under the private network key. | Reuses the PSK. | Every member can mint attestations for any key; coarse revocation (rotate the PSK). |

Recommendation: A for every network type, with B as optional hardening for
private networks if the owner introduces a network owner. Public networks get
accountability, not sybil resistance, so node-attested counts must never be a
security input there.

### Revocation and rotation

- **Revocation:** the binding author (or the node owner identity) writes a
  `kind: delete` record for `node:<networkId>:<nodeId>`; statements signed by
  that node key and dated after the deletion's `sequence` are rejected. Revoking
  the author's device in the device-authorization chain also invalidates the
  binding at admission time (subject to #362: the check is at the current head).
- **Rotation:** generate a new node key, which yields a new `nodeId`, and write a
  new binding; the old binding is deleted by the same author. There is no
  in-place key rotation because the id derives from the key.
- **Compromise:** revoke the binding; stored statements by the old key keep
  their record ids and are re-evaluated at readmission (registry readmission
  already re-runs the gates).

## Ranking by security value per effort

| Rank | Slice | Value | Effort | Why this order |
| --- | --- | --- | --- | --- |
| 1 | Conversation metadata | Very high: it is the authority root for messages, pins, reactions and calls; forging it is a takeover | Medium: one policy, id derivation, `mutation` on `POST /conversations`, head gate | Everything else depends on admitted conversation records |
| 2 | Notifications | High: fake invitation with an attacker key breaks confidentiality; forged push | Small-medium: two policies, verify the already-stored signature intent, missed-call becomes local | Depends only on slice 1 |
| 3 | Content replication | Medium-high: arbitrary fetch and pin (disk/bandwidth), data-loss via claims, content-type overwrite | Small for `maxBytes` and claim removal, medium for signed registration | The `maxBytes` commit is the cheapest protection in the whole issue |
| 4 | Calls | Medium-high: forged ringing/push, channel blocking, epoch poisoning | Large: new event log, derived state machine, three endpoints, client changes | Needs slice 1; largest rewrite |

Suggested order of work inside the issue: slice 1; slice 3's `maxBytes` commit;
slice 2; slice 3 remainder; slice 4.

## Owner decisions

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Conversation membership authority: creator-signed only, or each participant co-signs an acceptance | Creator-signed, immutable membership. Acceptance requires a new participant-state feature that does not exist; revisit when add/remove participant is designed |
| D2 | Accept the client contract change that user actions carry a client-device-signed `mutation` (conversation creation, call start/join/leave/end, notification create/update, content replication registration) | Yes: it is the only way to authenticate without node trust, and messages already work this way |
| D3 | Accept new id formats derived from creator and nonce (group, call, invitation) | Yes: needed so a lower-digest forger cannot claim another author's id; clean cutover |
| D4 | Missed-call notifications become local, derived, and not shared across a user's nodes | Yes: the alternative needs node trust |
| D5 | Invitation accept/decline state: recipient-signed replicated record, or local only | Recipient-signed record (multi-node users keep state; small policy) |
| D6 | Call liveness on crash: graceful `left` is signed by the client; crashed calls end by lease expiry locally plus a maximum call duration | 12 h maximum duration, configurable |
| D7 | Keep node-attested replica claims and release of extra replicas, or remove them | Remove; no node-trust model is introduced and the cost is storage on non-responsible uploaders |
| D8 | Stop replicating content type and filename; serve sniffed allowlisted type or `application/octet-stream` attachment | Yes |
| D9 | Numeric limits: per-identity-per-network replication quota, group member cap, call/notification rate caps | Quota 1 GiB per identity per network, keep the existing group cap, 30 records/minute/identity for call and notification records; all configurable |
| D10 | Whether to replicate invitations at all vs private control-frame delivery only | Keep replication of signed invitations (offline recipients need them) |
| D11 | Whether to build a node-trust model now | No; if D7 flips or distributed replication needs sybil-resistant counts, implement option A with `NodeBinding` |
| D12 | Public uploads of an unpublished identity: register replication only after the identity is published | Yes: until then the content stays only on the uploading node |

## Cross-cutting

- Gates register through `registry.addMutationGate` (one initializer per slice,
  as `KeychainMutationGateInitializer` does). Heads and derived aliases pass
  through `governsHead/acceptsHead` for every key that carries a replicated
  record; derived indexes are rebuilt locally and not replicated.
- Every slice adds a `test:integration:forged-*` real-transport script to
  `test:ci` and the real-transport workflow, modelled on
  `forged-keychains`: gated honest nodes, an ungated malicious node, an ungated
  control that proves each forgery would work.
- Every slice updates `docs/pubsub-sync-protocol.md` (the audit table row
  becomes "Signed", the "Deferred: node-authored collections" section shrinks to
  what remains), `docs/api.md` and both swagger files when an endpoint changes.
- Residuals that stay: a registered identity can flood the stores with valid
  junk of its own (bounded by the rate and quota caps above); device
  authorization is evaluated at the current head, not the causal revision
  (#362); author-claimed times are informational only.

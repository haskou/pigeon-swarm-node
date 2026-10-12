# Group delivery through per-member mailboxes

Refs [#289](https://github.com/haskou/pigeon-swarm-node/issues/289).

Status: design for the group part of #289. Nothing in this document is implemented.
Group conversations need MLS, which is not built. UI `docs/mls-group-encryption.md`
marks group conversations out of scope and tracks them under UI
[#174](https://github.com/haskou/pigeon-swarm-ui/issues/174). This document extends
the 1:1 contract in `docs/design/opaque-mailboxes.md` and leaves history to
`docs/design/own-copy-and-history-backfill.md`.

## Problem

Group conversations are still on the legacy path:

- Every group message is an OrbitDB document replicated to every node.
  `authorId`, `conversationId`, `createdAt`, `previousMessageIds`, `scopeType` and
  `type` are in clear. Only `encryptedPayload` is ciphertext
  (`src/contexts/conversations/infrastructure/orbitdb/documents/OrbitDBConversationMessageDocument.ts`).
- Membership is a plaintext roster. `Conversation.participantIds` is a plain list
  (`src/contexts/conversations/domain/Conversation.ts`).
- A group has one symmetric key, created once (`createGroupConversationKeyEntry` in
  UI `src/contexts/conversations/infrastructure/http/PigeonConversationCommandsApi.ts`).
  It is sealed to each invitee. `removeMember` signs `member_removed` and deletes
  the roster entry, but does not rotate the key. Replication still gives the removed
  member's node every new ciphertext, so removal revokes nothing.
- Group conversations do not use MLS. MLS in the UI is confined to
  `src/contexts/communities/infrastructure/mls/`.

1:1 mailboxes already give opaque, capability-based delivery (`opaque-mailboxes.md`).
Group delivery needs three things 1:1 does not have: a routing unit per member that
does not need a conversation-to-member table on the node, revocation on removal,
and one encryption per message with N appends for the copies.

## Goals and non-goals

Goals:

- The node stores per-member opaque inboxes and ciphertext only. No mailbox state
  maps a group to its members (`opaque-mailboxes.md` L47-48 and L28-29).
- A removed member cannot derive inbox ids, post tokens or envelope keys for any
  generation after its removal.
- One MLS encryption per message. The N copies carry the same MLS message bytes.
- Offline delivery within the 14-day retention window, at-least-once, deduplicated
  on the message id. Failures reach the sender. Nothing is dropped silently.
- The node cannot read sender identity, group id or message type from mailbox data.

Non-goals (stated so nobody claims them):

- Hiding the group roster from the node. The roster stays on legacy and is plaintext
  there. This does not meet the no-plaintext-participant-list goal for groups until
  decision D15 is resolved.
- Hiding IP addresses, connection timing or the shape of fan-out bursts.
- Giving a joiner history from before it joined. MLS gives no past epoch secrets to
  a joiner.
- Backfilling legacy group messages into MLS.
- Protecting against a member who leaks plaintext.

## Model

### Terms

| Term | Meaning |
| --- | --- |
| member | identity `Y` in group `G`, present in the MLS tree through its device leaves (D19) |
| slot `s_Y` | 32 random bytes chosen by `Y` when it joins. Carried in `Y`'s MLS leaf extension, so current members learn it and no one else does. Not derived from any identity |
| generation `k` | a 32-byte secret `gen_k`. It changes on every removal commit (D3) |
| inbox `I(Y,k)` | `Y`'s mailbox for generation `k` |

### Derivation

```text
gen_0          = MLS-Exporter(epoch at group creation, "pigeon/group-mailbox/gen/v1", 32)
gen_{k+1}      = MLS-Exporter(epoch of removal commit k+1, "pigeon/group-mailbox/gen/v1", 32)

mailboxId(Y,k) = HKDF(gen_k, "pigeon/group-mailbox/id/v1",       s_Y)           // 32 bytes
postToken(Y,k) = HKDF(gen_k, "pigeon/group-mailbox/post/v1",     s_Y)           // append capability
envelopeKey(Y,k) = HKDF(gen_k, "pigeon/group-mailbox/envelope/v1", s_Y)         // outer AEAD (D5)
readToken(Y,k) = HKDF(rootKey_Y, "pigeon/mailbox/read/v1" || mailboxId(Y,k))    // owner only
```

- The MLS exporter is RFC 9420 section 8.5. `[INFERENCE]` The UI MLS library's exporter
  API has not been checked.
- `mailboxId`, `postToken` and `envelopeKey` depend on `gen_k` and the random slot. They
  never depend on an identity or a group id. A server or outsider cannot link an
  inbox to an identity or a group. Any member can compute every inbox id and post
  token of the generation, because every member knows every slot.
- `readToken` derives from the owner's root key, as in 1:1 (`opaque-mailboxes.md` L66).
  No member other than the owner can read, ack or delete an inbox.
- The post token is per member inbox, because the slot scopes it. This matches the UI
  rule that group inboxes need a per-member token and must not reuse the 1:1
  derivation from a shared group secret (`docs/opaque-mailboxes-client.md` in the UI
  repo, "Groups" paragraph). The shared part is the generation secret, which only
  members hold.
- The server stores `SHA-256(postToken)` and `SHA-256(readToken)`, as today
  (`opaque-mailboxes.md` L64-65).

### Why not identity-derived ids

If `mailboxId` were a function of the identity id, anyone holding the identity records
the node already keeps (the signed identity payload and the legacy roster) could
compute and link the inbox. The random slot removes that link.

## Membership

### Create and join (add)

1. The creator makes the MLS group, `gen_0`, its own slot, and inbox `I(creator,0)`.
   The inbox is created with a PUT and creation proof of work (see Costs).
2. Each invitee is added by an MLS Add in a commit. The Welcome is sealed to the
   invitee's key package. It travels in the legacy `group_conversation_invitation`
   notification together with `gen_k` (D8).
3. The joiner reads `gen_k` and the slots from the Welcome, then creates
   `I(joiner,k)`.
4. Existing members do not rotate on add (D4). Each member posts to the joiner's
   inbox once it knows the id, from the commit. Until the joiner creates its inbox the
   node returns 404, and the sender keeps the message in its durable queue (D9).
5. The joiner gets no history from before the join.

### Remove and leave

Removal of Carol at generation `k`:

1. The committer (Alice) commits a Remove for Carol. The group moves to epoch `e'`,
   and Alice derives `gen_{k+1}` from `e'`.
2. The commit is appended to `I(Y,k)` for every remaining member `Y`, not to Carol.
   Alice's own inbox receives it too, for her other devices.
3. Each remaining member, after applying the commit, derives `gen_{k+1}`, creates
   `I(Y,k+1)`, and switches its sends to generation `k+1`.
4. Each remaining member keeps reading `I(Y,k)` for a drain window `D` of 24 hours
   (D11), then DELETEs it.
5. Carol never receives the commit, so she has no `gen_{k+1}`. She cannot compute any
   id, post token or envelope key of the new generation. Her access to new traffic
   ends.

Leave: the leaver sends a self-removal proposal, and a remaining member commits it.
The rest of the flow is the same.

Device removal: a device is an MLS leaf (D19), so removing it is a removal commit and
runs the same flow. A revoked device keeps the identity root key. This is reported in
issue #289 comments (2026-10-12T16:22) and is not re-checked in code here:
`GET /keychains/{id}` does not check device revocation. So a revoked device can
derive `readToken(Y,k)` from `rootKey_Y` and from the `gen_k` it held, and can read
`I(Y,k)` until `Y` deletes it. Rotation stops it from finding `I(Y,k+1)` and from
posting to the new generation, and that is the effective revocation. The owner should
also remove the revoked device's reader entry with
`DELETE /mailboxes/{id}/readers/{readTokenHash}`. This only helps if the reader hash
is device-bound `[INFERENCE]`.

### Commit ordering

Two removals raced by two members produce two commits for one epoch. MLS admits one,
and the other must rebase onto the new epoch. Ordering uses the roster: each roster
op for add or remove carries the epoch it applies to, and members apply only the next
epoch (D7). `[INFERENCE]` Current legacy roster ops carry no epoch field. The format
must change, and that change is part of the legacy roster work, not new node storage.

### Offline members

A member offline across a removal still owns `I(Y,k)`, so it reads the commit on
return, applies it, and then creates `I(Y,k+1)`. Its inbox keeps envelopes until it
acknowledges them, or until the node expires it after 14 days without a read.

A busy group can fill that inbox. At 200 messages a day, 1000 envelopes last about
5 days. After that, appends get 429 or 409 and the senders' queues grow. Senders show
"delivery blocked" for that member. The design does not remove members automatically.
A member that is away for more than 14 days loses its inbox and must be re-added
(D13).

## Write tokens and fan-out

- **Per-member post token.** `postToken(Y,k)` scopes writes to one inbox. Any member can
  compute it, so any member of the generation can append to any inbox. The node cannot
  tell which member wrote. The author is inside the MLS ciphertext.
- **Authorship is checked by the reader.** MLS authenticates the sender of every
  record. Readers MUST verify the MLS sender for every record type, including edit,
  delete and reaction, before applying it. In the 1:1 own-copy path the peer can forge
  edit and delete records (`own-copy-and-history-backfill.md` L33). The group path must
  not repeat that gap.
- **Per-sender tokens rejected for v1.** They need a writer registry on the node (which
  hashes may write to which inbox) and N x N registrations per group. That is a node
  change and a new group-membership table, which the goals exclude.
- **Fan-out.** For a message from Alice, append the same MLS bytes to `I(Y,k)` for each
  member `Y` other than Alice, and to Alice's own `I(Alice,k)`, so her other devices
  read it as readers of that inbox. That is N appends, where N counts all members
  including the sender. Each append has its own `envelopeId`, random per (message,
  inbox) and reused on retry (D5).
- **Commits use the same path** (D6). The node keeps no per-group record store.
- **No batch endpoint.** The operations table (`opaque-mailboxes.md` L78-87) has one
  append per request. A message to N members is N HTTP requests.

## Envelope

```text
envelope = {
  envelopeId: 16 random bytes                     // per (message, inbox), reused on retry
  body:       nonce (12 random bytes)              // per copy
           || AEAD_envelopeKey(Y,k)(
                plaintext = MLS message bytes || random filler to the size bucket,
                AAD       = mailboxId(Y,k))
}
```

- The MLS message bytes are the payload. The sender produces them once per message,
  and the mailbox layer never decodes or re-encodes them. They are the same bytes in
  every copy.
- The outer AEAD (D5) is applied per copy with a random nonce. Two reasons:
  - An MLS PrivateMessage keeps `group_id` and `epoch` in clear in its header (RFC 9420
    section 6.3). `[INFERENCE]` Verify against the UI library's wire format. Carried bare,
    they would be a stable conversation identifier stored on the node, against
    `opaque-mailboxes.md` L28.
  - The N copies would otherwise be linkable: the same prefix appears in N inboxes.
- The filler pads the plaintext to the same buckets as 1:1, from
  `MailboxPolicy.SIZE_BUCKETS` (1 KiB, 4 KiB, 16 KiB, 64 KiB). Sizes are bucketed,
  not exact.
- The plaintext cap is `MailboxEnvelopeCipher.MAX_PLAINTEXT_BYTES` (65504, as stated in own-copy L47; UI-side, not re-checked here).
  Large content goes to private blobs (#290). The envelope carries only a reference
  (D18).

Decision for Main: D5 differs from a literal reading of "MLS ciphertext carried
unchanged as the envelope payload". The MLS bytes stay unchanged inside the envelope.
The literal alternative, with no outer layer, is option B in the decisions table.

## Costs

N = group members including the sender. Values are from code unless marked.

| Quantity | Value | Source |
| --- | --- | --- |
| Members on the mailbox path | up to 256 | `MAX_GROUP_PARTICIPANTS` (`src/contexts/conversations/domain/operations/ConversationOperationLimits.ts`) |
| Appends per message | N | fan-out above |
| Upload per message | N x bucket; at N = 256 and 4 KiB, about 1 MiB | `MailboxPolicy.SIZE_BUCKETS` |
| Download per member per message | one bucket, 4 KiB for typical text | one inbox read |
| Appends per inbox | 120 per minute | `MAILBOX_APPEND_RATE_PER_MINUTE` |
| Group message ceiling | about 120 messages per minute, because every message lands in every inbox | derived |
| Queue depth per inbox | 1000 envelopes; past that, 429 or 409, never a silent drop | `MAILBOX_MAX_ENVELOPES`, `opaque-mailboxes.md` L113-114 |
| Fill time, offline member at 200 messages a day | about 5 days | derived |
| Retention | 14 days after last read; ack deletes at once | `MAILBOX_RETENTION_MS`, `opaque-mailboxes.md` L119-121 |
| Inboxes per member per group | 1, plus one per removal until the old one is deleted | derived |
| Creation proof of work | 16 bits, rising to 20 as the node fills | `opaque-mailboxes.md` L116 |
| Creation rate | 30 per minute per client | `MAILBOX_CREATE_RATE_LIMIT_PER_MINUTE` |
| Inbox count on a node | `MAILBOX_MAX_COUNT` 10000, shared with 1:1 mailboxes; idle empty mailboxes evicted after 7 days at the limit | `MailboxPolicy` |

- **Join:** the joiner makes one PUT. No existing member creates an inbox on add.
- **Removal:** commit fan-out is N - 1 appends. Each remaining member makes one PUT
  with creation proof of work, so N - 1 PUTs in total, one per client.
- **Peak inboxes during drain:** about 2N per group, for `D` after each removal.
- **Node capacity:** a user in 20 groups uses 20 inboxes on its home node, plus 1:1
  pairs. At 10000 inboxes that is a few hundred users per node, before old generations.
  `[INFERENCE]` This needs measurement (D20).
- **Message ceiling:** a group sending more than about 120 messages per minute is
  throttled on every inbox. Raising the limit needs a node change, so measure first
  (D17).

## History and backfill

- A joiner gets no MLS epoch secrets from before the join. Mailbox envelopes are deleted
  on full acknowledgement and expire after 14 days (`own-copy-and-history-backfill.md`
  L13). After 14 days the mailbox holds no group history for anyone.
- Group history lives in clients. Pre-cutover messages stay in the legacy OrbitDB log.
- The legacy group log becomes read-only at cutover (D14). Old group messages are not
  re-encrypted into MLS.
- A new device of an existing member gets no backfill from mailboxes, as with 1:1. The
  choice follows the own-copy document: the pairing export (its option 1) or the legacy
  read until retirement (its D2 and D3). The pairing export must cover group records
  too. This document does not decide that.
- The client keeps past epoch secrets for the drain window `D` (D10), so messages posted
  before a commit still decrypt after it. A message that cannot be decrypted after the
  window is shown as undecryptable. It is not dropped silently. A sender learns of
  failure only while the message is still in its queue.

## Stays on legacy

| Item | Why it stays | Node sees in clear |
| --- | --- | --- |
| Identity publication with `mailboxHome` | discovery of home nodes; parsed as the `IdentityMailboxHome` value object (`src/contexts/identities/domain/value-objects/IdentityMailboxHome.ts`: http or https URL, at most 255 characters) | identity id, home node |
| Roster ops `member_added`, `member_removed` | commit ordering (D7) and the roster itself (D15) | group id, member identity ids, timing |
| Invitation notifications `group_conversation_invitation` | carries the Welcome and `gen_k` (D8) | recipient identity, conversation id, type |
| Legacy group message log | read-only after cutover | all current fields in clear |
| Legacy group key | readable history only; new groups do not create it | keychain entry |
| Private blobs (#290) | large attachments; retention `max(PRIVATE_BLOB_RETENTION_MS, MAILBOX_RETENTION_MS)` (`own-copy-and-history-backfill.md` L56, #446) | blob ids |
| Own copy and pairing export | own devices and history | per own-copy document |
| MLS key packages | existing path; location not checked here `[INFERENCE]` | key package |

Discovery: a sender reads each member's `mailboxHome` from its signed identity payload.
It derives inbox ids from `gen_k` and the slots. No group directory is needed. A member
may be homed on another node. Cross-node delivery is an open gap in the #289 comments,
and the group path inherits it. The UI router falls back to the local node
(`PigeonApiGateway.ts:326`). `[INFERENCE]` Cross-node group delivery is not checked.

## Metadata leakage

| Signal | Legacy group today | With group mailboxes |
| --- | --- | --- |
| Conversation id per message | in clear (`conversationId`) | not in mailbox data; still in roster and invitations |
| Sender identity per message | in clear (`authorId`) | not in mailbox data; inside MLS |
| Message type and scope | in clear (`type`, `scopeType`) | not in mailbox data |
| Who is in the group | plaintext roster | still plaintext (D15) |
| Group size | from roster | from roster; also from fan-out burst |
| Message timing per group | per message | per inbox append burst; N appends from one client reveal one fan-out |
| Membership change | roster op | roster op plus rotation burst: N - 1 PUTs from N - 1 clients |
| Inbox linkage across generations | n/a | none; ids change per generation and carry no identity |
| Copy linkage across inboxes | n/a | none with D5 option A; prefix match with option B |
| Sizes | exact | bucketed |
| 404, 409, 429 responses | n/a | reveal an inbox's absence or fill |
| IP address and timing | visible | visible (non-goal) |

The design removes message-level metadata: conversation id, sender, type, and per-message
participants. Group-level metadata stays. The roster is the largest remaining leak. It
is the reason the no-plaintext-participant-list goal is not met for groups.

## Decisions

| # | Decision | Recommended default | Alternative and reason against |
| --- | --- | --- | --- |
| D1 | Routing unit | one inbox per (member identity, generation); devices are readers | per device: N x devices appends and PUTs |
| D2 | Inbox id and post token | HKDF over `gen_k` and random slot `s_Y`; read token root-derived per owner | identity-derived id: linkable from identity records the node already keeps |
| D3 | When the generation advances | every removal commit: member removed, member left, device removed | rotate on add too: N - 1 PUTs per add with no secrecy gain; per-sender writer sets: node writer registry, N x N registrations |
| D4 | Add | no rotation on add; joiner gets `gen_k` in its Welcome | rotate on add: see D3 |
| D5 | Envelope payload | MLS bytes unchanged inside a per-copy AEAD with random nonce, AAD `mailboxId` | option B, no outer layer: `group_id` and `epoch` readable in clear, copies linkable by prefix. Needs Main sign-off |
| D6 | Commit path | commits fan out through inboxes, like messages | node commit log: reveals group timing and needs a new table |
| D7 | Commit ordering | roster op carries the epoch it applies to; members apply only the next epoch | node commit log or delivery service: a new store. Needs roster op format change `[INFERENCE]` |
| D8 | Invitation | legacy `group_conversation_invitation` carrying Welcome and `gen_k` | welcome inbox per identity: later; the node still sees the recipient identity |
| D9 | Sender delivery | durable outbound queue; backoff on 404, 409, 429; re-encrypt under the current epoch if the generation changed; expire after 14 days and report failure | silent drop, as 1:1 does on 404 (`own-copy-and-history-backfill.md` L23): rejected |
| D10 | Past epoch secrets | keep them for the drain window `D` | drop them: loses messages posted before a commit |
| D11 | Old inbox deletion | owner DELETEs `I(Y,k)` 24 hours after applying the commit; 14-day idle expiry is the backstop | immediate delete: loses in-flight messages |
| D12 | Removed-member spam | accepted; bounded by 120 per minute and the 1000-envelope cap; MLS rejects unknown senders on read | node-side writer sets: see D3 |
| D13 | Joiner history | none before join | sealed export from a member: later, as part of the pairing export |
| D14 | Existing groups at cutover | legacy writes stop for groups moved to MLS; legacy history is read-only; users re-create groups | in-place migration of legacy keys: no re-encryption of old content. Product sign-off pending |
| D15 | Roster | stays plaintext in this phase; the goal is not met for groups | encrypt roster ops (`node-written-collections.md` slice 1, planned, not built), or remove the roster from the node. Needs an owner decision |
| D16 | Group size cap | 256 on the mailbox path (`MAX_GROUP_PARTICIPANTS`) | raise: upload grows linearly with N |
| D17 | Message rate | 120 per minute per group, the inbox append limit | raise the limit: needs a node change; measure first |
| D18 | Large payloads | private blobs (#290); the envelope carries a reference only | envelopes up to 65504 bytes: N x cost per copy |
| D19 | MLS leaf granularity | device leaves, so device revocation is a removal commit | identity leaves: device revocation needs a separate rotation path |
| D20 | Capacity | measure inbox count and append load on staging before cutover | none; a required measurement, not a choice |

## Implementation plan

Not part of this PR.

1. Group MLS in UI (#174): leaves carry the slot extension; the generation is derived
   from the exporter; the Welcome carries `gen_k`. This is the prerequisite.
2. UI: a derivation module for `mailboxId`, `postToken`, `envelopeKey` and `readToken`,
   with test vectors for each HKDF label.
3. UI: send and receive for group conversations through the mailbox path; durable
   outbound queue (D9); past epoch secrets (D10); MLS sender check on every record.
4. Node: no new endpoint expected `[INFERENCE]`. Check during implementation that the
   existing create, append, read, ack and readers routes cover the flow.
5. Staging: N = 256, the 120-per-minute ceiling, offline-member fill, inbox counts per
   node (D20).
6. Cutover (D14): per-group flag. Legacy writes stop for MLS groups; legacy reads stay.
7. Retire the legacy group write path after the pairing export covers group records
   (own-copy D2).

## Verification

- This PR changes one file: `docs/design/group-mailboxes.md`. No code or tests changed.
  CI is the gate.
- Checked by reading the sources listed under References.
- Not verified: MLS exporter and leaf extension support in the UI library; the RFC 9420
  header claim behind D5; proof-of-work timing at 16 and 20 bits; capacity at N = 256
  and inbox counts (D20); cross-node group delivery; the roster op epoch field (D7);
  where MLS key packages live.

## References

- `docs/design/opaque-mailboxes.md`, the 1:1 contract this document extends
- `docs/design/own-copy-and-history-backfill.md`
- `docs/design/node-written-collections.md`, roster plan, not built
- `src/contexts/mailboxes/domain/MailboxPolicy.ts`
- `src/contexts/conversations/domain/operations/ConversationOperationLimits.ts`
- `src/contexts/conversations/domain/Conversation.ts`
- `src/contexts/conversations/infrastructure/orbitdb/documents/OrbitDBConversationMessageDocument.ts`
- `src/contexts/identities/domain/value-objects/IdentityMailboxHome.ts`
- UI (origin/main): `docs/opaque-mailboxes-client.md`, `docs/mls-group-encryption.md`,
  `src/contexts/conversations/infrastructure/http/PigeonConversationCommandsApi.ts`
- Issue #289 comments, 2026-10-12T15:07, T16:22 and T16:31

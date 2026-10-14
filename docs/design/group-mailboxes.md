# Group delivery through per-member mailboxes

Refs [#289](https://github.com/haskou/pigeon-swarm-node/issues/289).

Status: implemented. Every non-community group conversation runs on per-member
mailboxes with MLS. The client is in pigeon-swarm-ui `src/contexts/groupMailboxes/`
(UI `docs/opaque-mailboxes-client.md`, "Group mailbox key schedule" and "Group
conversation cutover"; UI `docs/mls-group-encryption.md`). The node adds no route
for it. This document extends the 1:1 contract in `docs/design/opaque-mailboxes.md`
and leaves history to `docs/design/own-copy-and-history-backfill.md`.

## Problem

A group conversation needs private delivery with real removal:

- Data replicated as OrbitDB documents reaches every node, with author,
  conversation and timing in clear. Group messages must not travel that way.
- Membership is a roster on the node. `Conversation.participantIds` is a plain list
  (`src/contexts/conversations/domain/Conversation.ts`).
- One symmetric key per group, sealed to each invitee, revokes nothing on removal:
  the removed member keeps the key. Removal needs a key change.

1:1 mailboxes give opaque, capability-based delivery (`opaque-mailboxes.md`).
Group delivery needs three things 1:1 does not have: a routing unit per member that
does not need a conversation-to-member table on the node, revocation on removal,
and one encryption per message with N appends for the copies.

The node has no group message, read marker or unread route. Read state and unread
counts are computed in the client. The node sends no push notification for group
mailbox envelopes and no push to clear one.

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

- Hiding the group roster from the node. The roster stays in the signed conversation
  operation log and is plaintext there. This does not meet the
  no-plaintext-participant-list goal for groups (D15).
- Hiding IP addresses, connection timing or the shape of fan-out bursts.
- Giving a joiner history from before it joined. MLS gives no past epoch secrets to
  a joiner.
- Unread counts or push from the node. Read state is device-local in the client.
- Protecting against a member who leaks plaintext.

## Model

### Terms

| Term | Meaning |
| --- | --- |
| member | identity `Y` in group `G`, present in the MLS tree through its device leaves (D19) |
| slot `s_Y` | 32 bytes derived from `gen_k` and `Y`'s identity id (D2). Every member of generation `k` can compute it from the roster; no one without `gen_k` can |
| generation `k` | a 32-byte secret `gen_k`. It changes on every commit that adds or removes a leaf (D3) |
| inbox `I(Y,k)` | `Y`'s mailbox for generation `k` |

### Derivation

```text
gen_0          = MLS-Exporter(epoch at group creation, "pigeon/group-mailbox/gen/v1", "", 32)
gen_{k+1}      = MLS-Exporter(epoch after removal commit k+1, "pigeon/group-mailbox/gen/v1", "", 32)

s_Y           = HKDF(gen_k, "pigeon/group-mailbox/slot/v1" || utf8(identityId_Y)) // 32 bytes

mailboxId(Y,k) = HKDF(gen_k, "pigeon/group-mailbox/id/v1",       s_Y)           // 32 bytes
postToken(Y,k) = HKDF(gen_k, "pigeon/group-mailbox/post/v1",     s_Y)           // append capability
envelopeKey(Y,k) = HKDF(gen_k, "pigeon/group-mailbox/envelope/v1", s_Y)         // outer AEAD (D5)
readToken(Y,k) = HKDF(rootKey_Y, "pigeon/mailbox/read/v1" || mailboxId(Y,k))    // owner only
```

- The MLS exporter is RFC 9420 section 8.5, with an empty context. The UI uses the
  `ts-mls` exporter through `MlsGroup.exportSecret`. HKDF is SHA-256 with an empty
  salt; `info` is the label followed by the slot or the identity id.
- The generation advances after any commit that changes the tree's leaves: member
  added, removed or left, device added or removed. Self-updates keep `gen_k`. The
  UI stores a digest of each generation's leaves and advances whenever the tree
  differs, so it never relies on the last commit alone.
- `mailboxId`, `postToken` and `envelopeKey` depend on `gen_k` and the slot. Without
  `gen_k` they cannot be computed from an identity or a group id, so a server or
  outsider cannot link an inbox to an identity or a group. Any member can compute
  every inbox id and post token of the generation, because every member can derive
  every slot.
- `readToken` derives from the owner's root key, as in 1:1 (`opaque-mailboxes.md` L66).
  No member other than the owner can read, ack or delete an inbox.
- The post token is per member inbox, because the slot scopes it. This matches the UI
  rule that group inboxes need a per-member token and must not reuse the 1:1
  derivation from a shared group secret (`docs/opaque-mailboxes-client.md` in the UI
  repo, "Groups" paragraph). The shared part is the generation secret, which only
  members hold.
- The server stores `SHA-256(postToken)` and `SHA-256(readToken)`, as today
  (`opaque-mailboxes.md` L64-65).

### Why the slot is derived

If `mailboxId` were a function of the identity id alone, anyone holding the identity
records the node already keeps (the signed identity payload and the roster)
could compute and link the inbox. The slot mixes in `gen_k`, which only members of the
generation hold, so the node and outsiders still cannot link an inbox to an identity.
A random slot carried in an MLS leaf extension was considered and dropped: it needs a
custom leaf extension, and a derived slot gives the same unlinkability.

A slot is per identity, not per device. All devices of `Y` read the same inbox (D1).

## Membership

### Create and join (add)

1. The creator makes the MLS group, `gen_0`, and inbox `I(creator,0)`. The inbox is
   created with a PUT and creation proof of work (see Costs).
2. The inviter asks the invitee for a key package and gets it back as sealed control
   letters (see Control traffic).
3. Each invitee is added by an MLS Add in a commit, which advances the generation to
   `k`. The inviter sends the joiner `{welcome, k}` as a sealed control letter
   (D8). The joiner exports `gen_k` itself from the epoch
   the Welcome puts it in, so `gen_k` never travels and an inviter cannot hand it a
   generation the other members do not use. `k` is public; a wrong `k` only
   mislabels it. Each Welcome opens once per device.
4. The joiner derives the slots from `gen_k` and the roster, then creates
   `I(joiner,k)`.
5. The add commit is appended to `I(Y,k-1)` of every existing member. After
   applying it, each derives `gen_k`, creates `I(Y,k)` and posts there (D4). Until
   a member has created its inbox the node returns 404, and the sender keeps the
   message in its durable queue (D9).
6. The joiner gets no history from before the join.

### Remove and leave

Removal of Carol at generation `k`:

1. The committer (Alice) commits a Remove for Carol. The group moves to epoch `e'`,
   and Alice derives `gen_{k+1}` from `e'`.
2. The commit is appended to `I(Y,k)` for every remaining member `Y`, not to Carol.
   Alice's own inbox receives it too, for her other devices. A commit that MLS does
   not accept is rejected, including a commit for an epoch the member already left
   whose sender data does not open under that retained epoch.
3. Each remaining member, after applying the commit, derives `gen_{k+1}`, creates
   `I(Y,k+1)`, and switches its sends to generation `k+1`.
4. Each remaining member keeps reading `I(Y,k)` for a drain window `D` of 6 hours
   (D11), then DELETEs it. A member that has not processed the commit yet still
   encrypts in the old epoch, so Carol can read what it sends until it catches up.
   Once a member has applied the removal, it rejects messages whose sender leaf is
   no longer in the tree, including late messages from Carol.
5. Carol never receives the commit, so she has no `gen_{k+1}`. She cannot compute any
   id, post token or envelope key of the new generation. Her access to new traffic
   ends.

Leave and removal both start from the roster. The member with the lowest identity
id among those still in both the roster and the MLS group commits every removal,
then every add, on its next sync, so members never race each other's commits.
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

Two removals raced by two members produce two commits for one epoch. The UI MLS
wrapper (`MlsGroup`, shared with communities) admits the commit with the lowest id,
`SHA-256` of the commit bytes, and keeps the previous epoch state to switch when a
lower one arrives later. The generation log then rewinds to that epoch and recomputes
`gen_{k+1}`. The roster op carries no epoch and is not used for ordering (D7).

### Control traffic

No control message travels in clear and none uses a new node route.

| Record | Path | Protection |
| --- | --- | --- |
| Key package request and response | signed, sealed `group_conversation_invitation` notification to the peer | sealed to the recipient; not shown in the notification list |
| Welcome `{welcome, k}` | signed, sealed `group_conversation_invitation` notification to the joiner | sealed to the recipient; the Welcome is also sealed to the key package |
| Commit (add, remove, update) | `I(Y,k)` of every member, in the delivery generation | D5 per-copy AEAD around the MLS bytes |
| Application message | `I(Y,k)` of every member, in the current generation | D5 per-copy AEAD around one MLS ciphertext |

A removal commit is delivered in generation `k`: the remaining members learn
`gen_{k+1}` only by applying it.

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
| Inboxes per member per group | 1, plus one per membership change until the old one is deleted | derived |
| Creation proof of work | 16 bits, rising to 20 as the node fills | `opaque-mailboxes.md` L116 |
| Creation rate | 30 per minute per client | `MAILBOX_CREATE_RATE_LIMIT_PER_MINUTE` |
| Inbox count on a node | `MAILBOX_MAX_COUNT` 10000, shared with 1:1 mailboxes; idle empty mailboxes evicted after 7 days at the limit | `MailboxPolicy` |

- **Join:** commit fan-out is N - 1 appends. The joiner and every existing member each
  make one PUT with creation proof of work, so N PUTs in total, one per client. This
  is the cost of never sending `gen_k` (D4).
- **Removal:** commit fan-out is N - 1 appends. Each remaining member makes one PUT
  with creation proof of work, so N - 1 PUTs in total, one per client.
- **Peak inboxes during drain:** about 2N per group, for `D` after each membership
  change.
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
- Group history lives in clients. The node holds no group message log.
- A new device of an existing member gets no backfill from mailboxes, as with 1:1. As in
  the own-copy document (D2 and D3, resolved), the pairing export is the only backfill
  source and it must cover group records too. With no authorized device online, older
  group history is lost.
- The client keeps past epoch secrets for the drain window `D` (D10), so messages posted
  before a commit still decrypt after it. A message that cannot be decrypted after the
  window is shown as undecryptable. It is not dropped silently. A sender learns of
  failure only while the message is still in its queue.

## Stays on the replicated path

| Item | Why it stays | Node sees in clear |
| --- | --- | --- |
| Identity publication with `mailboxHome` | discovery of home nodes; parsed as the `IdentityMailboxHome` value object (`src/contexts/identities/domain/value-objects/IdentityMailboxHome.ts`: http or https URL, at most 255 characters) | identity id, home node |
| Roster ops `member_added`, `member_removed` | the roster itself (D15); members check MLS leaves against it | group id, member identity ids, timing |
| Invitation notifications `group_conversation_invitation` | tells the invitee a conversation exists; also carries sealed control letters (key package request and response, `{welcome, k}`) (D8) | recipient identity, conversation id, type, timing |
| Private blobs (#290) | large attachments; retention `max(PRIVATE_BLOB_RETENTION_MS, MAILBOX_RETENTION_MS)` (`own-copy-and-history-backfill.md` L56, #446) | blob ids |
| Own copy and pairing export | own devices and history | per own-copy document |
| MLS key packages | not stored on the node for group conversations; exchanged as sealed control letters | sender, recipient, conversation id and timing of the notification |

Discovery: a sender reads each member's `mailboxHome` from its signed identity payload.
It derives inbox ids from `gen_k` and the slots. No group directory is needed. A member
may be homed on another node. Cross-node delivery is an open gap in the #289 comments,
and the group path inherits it. The UI router falls back to the local node
(`PigeonApiGateway.ts:326`). `[INFERENCE]` Cross-node group delivery is not checked.

## Metadata leakage

| Signal | With group mailboxes |
| --- | --- |
| Conversation id per message | not in mailbox data; in roster and invitations |
| Sender identity per message | not in mailbox data; inside MLS |
| Message type and scope | not in mailbox data |
| Who is in the group | plaintext roster (D15) |
| Group size | from roster; also from fan-out burst |
| Message timing per group | per inbox append burst; N appends from one client reveal one fan-out |
| Membership change | roster op plus rotation burst: N - 1 PUTs from N - 1 clients |
| Inbox linkage across generations | none; ids change per generation and carry no identity |
| Copy linkage across inboxes | none with D5 option A; prefix match with option B |
| Sizes | bucketed |
| 404, 409, 429 responses | reveal an inbox's absence or fill |
| IP address and timing | visible (non-goal) |

The design removes message-level metadata: conversation id, sender, type, and per-message
participants. Group-level metadata stays. The roster is the largest remaining leak. It
is the reason the no-plaintext-participant-list goal is not met for groups.

## Decisions

| # | Decision | Recommended default | Alternative and reason against |
| --- | --- | --- | --- |
| D1 | Routing unit | one inbox per (member identity, generation); devices are readers | per device: N x devices appends and PUTs |
| D2 | Inbox id and post token | HKDF over `gen_k` and the slot `s_Y = HKDF(gen_k, label ‖ identityId)`; read token root-derived per owner | identity-only id: linkable from identity records the node already keeps; random slot in a leaf extension: needs a custom MLS extension for the same unlinkability |
| D3 | When the generation advances | every commit that adds or removes a leaf: member added, removed or left, device added or removed | rotate on removal only: the inviter must send `gen_k` to the joiner, so a malicious inviter can put it on a generation the others do not use; per-sender writer sets: node writer registry, N x N registrations |
| D4 | Add | rotate on add; the joiner exports `gen_k` from its Welcome epoch and gets only `k` | no rotation, `gen_k` in the Welcome control record: see D3 |
| D5 | Envelope payload | MLS bytes unchanged inside a per-copy AEAD with random nonce, AAD `mailboxId` | option B, no outer layer: `group_id` and `epoch` readable in clear, copies linkable by prefix. Needs Main sign-off |
| D6 | Commit path | commits fan out through inboxes, like messages | node commit log: reveals group timing and needs a new table |
| D7 | Commit ordering | lowest commit id per epoch, as in the community MLS path; the client keeps the previous epoch to switch | roster op carrying the epoch: needs a roster format change; node commit log: a new store |
| D8 | Invitation | key package exchange and `{welcome, k}` as sealed control letters in signed `group_conversation_invitation` notifications | over the inviter's 1:1 mailbox: needs a 1:1 inbox between every inviter and joiner |
| D9 | Sender delivery | durable outbound queue; backoff on 404, 409, 429; re-encrypt under the current epoch if the generation changed; expire after 14 days and report failure | silent drop, as 1:1 does on 404 (`own-copy-and-history-backfill.md` L23): rejected |
| D10 | Past epoch secrets | keep them for the drain window `D` | drop them: loses messages posted before a commit |
| D11 | Old inbox deletion | owner DELETEs `I(Y,k)` 6 hours after applying the commit; 14-day idle expiry is the backstop | immediate delete: loses in-flight messages; 24 hours: a longer window for spam from a removed member |
| D12 | Removed-member spam | accepted; bounded by 120 per minute and the 1000-envelope cap; MLS rejects unknown senders on read | node-side writer sets: see D3 |
| D13 | Joiner history | none before join | sealed export from a member: later, as part of the pairing export |
| D14 | Existing groups | groups run only on mailboxes; the node keeps no group message log and the client does not migrate older group data; such groups are re-created | per-group flag: rejected (one delivery path) |
| D15 | Roster | stays plaintext in the signed conversation operation log; the goal is not met for groups | encrypt roster ops, or remove the roster from the node. Needs an owner decision |
| D16 | Group size cap | 256 on the mailbox path (`MAX_GROUP_PARTICIPANTS`) | raise: upload grows linearly with N |
| D17 | Message rate | 120 per minute per group, the inbox append limit | raise the limit: needs a node change; measure first |
| D18 | Large payloads | private blobs (#290); the envelope carries a reference only | envelopes up to 65504 bytes: N x cost per copy |
| D19 | MLS leaf granularity | device leaves, so device revocation is a removal commit | identity leaves: device revocation needs a separate rotation path |
| D20 | Capacity | measure inbox count and append load on staging | none; a required measurement, not a choice |

## Implementation

1. UI group MLS (#174): one MLS group per conversation (`GroupMailboxMlsEngine`);
   `gen_k` from the exporter after each add or removal; the slot derived from `gen_k`
   and the identity id.
2. UI derivation (`GroupMailboxKeySchedule`) for the slot, `mailboxId`, `postToken`,
   `envelopeKey` and `readToken`, with test vectors for each HKDF label.
3. UI control letters (`GroupMailboxControl`), send and receive through the mailbox
   path (`GroupMailboxOutbox`, `GroupMailboxInboxSync`), durable outbound queue (D9),
   past generations (D10), MLS sender check on every record.
4. Node: no group-specific endpoint. The mailbox routes cover the flow:
   `PUT /mailboxes/{id}`, `POST /mailboxes/{id}/envelopes`,
   `GET /mailboxes/{id}/envelopes`, `POST /mailboxes/{id}/ack`, the reader routes,
   and `DELETE /mailboxes/{id}` for D11. The node keeps the roster in the signed
   conversation operation log and has no group message routes.

Open in the UI: background unread counts, thread reply counts and the outbox UI of
group conversations; abandoning a locally persisted commit (#380); authenticated
MLS credentials (#375); sealing MLS state with the device root (#376).

## Verification

- UI: `GroupMailboxKeySchedule.spec.ts` checks the derivation vectors (`yarn test:crypto`).
- Node: the mailbox routes in `src/apps/apis/mailboxes-api/routes/` and
  `test:e2e:real-transport:mailbox-two-node`.
- Not verified: the RFC 9420 header claim behind D5; proof-of-work timing at 16 and 20
  bits; capacity at N = 256 and inbox counts (D20); cross-node group delivery.

## References

- `docs/design/opaque-mailboxes.md`, the 1:1 contract this document extends
- `docs/design/own-copy-and-history-backfill.md`
- `src/contexts/mailboxes/domain/MailboxPolicy.ts`
- `src/contexts/conversations/domain/operations/ConversationOperationLimits.ts`
- `src/contexts/conversations/domain/Conversation.ts`
- `src/contexts/identities/domain/value-objects/IdentityMailboxHome.ts`
- UI (origin/main): `docs/opaque-mailboxes-client.md`, `docs/mls-group-encryption.md`,
  `src/contexts/groupMailboxes/`
- Issue #289 comments, 2026-10-12T15:07, T16:22 and T16:31

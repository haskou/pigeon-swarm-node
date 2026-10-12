# Opaque mailboxes for private message delivery

Status: design for [#289](https://github.com/haskou/pigeon-swarm-node/issues/289), partly implemented.
Implemented: the domain, local storage, HTTP API, the content-free realtime hint,
the adaptive creation proof of work with idle eviction at capacity, the per-mailbox
append rate limit, the creation client key with `API_TRUST_PROXY`, and a two-node
real-transport proof. The UI client (key schedule, send/receive, cursor recovery)
is merged in pigeon-swarm-ui #252 and #257. Open: mailbox key rotation,
direct-message wiring (#258), wrapper integration, and retiring the replicated
collections. It is the contract that the
implementation PRs, and [#290](https://github.com/haskou/pigeon-swarm-node/issues/290)
(private blobs), build on.

## Problem

Conversations and messages are replicated as OrbitDB documents to every node in
a network. Any node therefore learns who talks to whom, when, and how much.
Protected private scopes already refuse the public repositories
(`docs/private-operation-authorization.md`), but ordinary private content has no
transport yet. This design supplies it.

## Goals and non-goals

Goals:

- the server stores only ciphertext envelopes and an opaque, unlinkable mailbox
  identifier;
- no identity, conversation ID, private CID or participant list is stored or
  derivable from stored data;
- offline delivery within a bounded retention window, at-least-once with
  client-side deduplication;
- bounded storage without a global user identifier;
- nothing is published to DHT, public IPFS stores or the pubsub topics that are
  used for public state.

Non-goals (stated so nobody claims them):

- hiding IP addresses, connection timing and envelope sizes from the node that
  serves the mailbox;
- protecting against a recipient or author who leaks plaintext;
- long-term history. History belongs to the client; the server is a queue.

## Model

A **mailbox** is a queue owned by one receiving *relationship direction*:
`A → B` and `B → A` are different mailboxes. For groups, each member has one
mailbox per group; the sender fans out one envelope per member mailbox. There is
no mailbox per group, so no table maps a conversation to its members.

### Identifiers

For each direction the two endpoints derive a shared secret `S` inside the
encrypted channel that already exists (the MLS group or the pairwise
introduction). Then:

```text
mailboxId   = HKDF(S, "pigeon/mailbox/id/v1",   epoch)    // 32 bytes, base64url
postToken   = HKDF(S, "pigeon/mailbox/post/v1", epoch)    // capability to append
readToken   = HKDF(rootKey, "pigeon/mailbox/read/v1" || mailboxId)  // capability to read/ack/delete
```

- `mailboxId` and `postToken` are derived from `S`, which the server never sees,
  so they cannot be linked to identities, conversation IDs or CIDs.
- The server stores `SHA-256(postToken)` and `SHA-256(readToken)` only; it
  verifies presented tokens against the hashes.
- `readToken` is derived from the identity's user root key, not from `S`: HKDF-SHA256 with no salt over the 32-byte root key, info `"pigeon/mailbox/read/v1" || mailboxId`. The mailbox id changes with `epoch`, so the read token does too. The derivation lets a device that lost its local storage recover an inbox it created, because the root key is restored on every authorized device. The peer never holds the root key, so it cannot read, ack or delete the inbox. Trade-off: whoever holds the root key and the mailbox id of an inbox can derive its read token, so compromise of the root key exposes every inbox whose id is known. A random read token exposed only its own inbox.
- `epoch` rotates mailboxes. The recipient announces the next epoch inside an
  encrypted envelope; the sender switches after the announcement and the old
  mailbox is drained and deleted. Rotation limits how long a leaked capability
  is useful and breaks long-term correlation of the queue.

### Operations

All requests are unsigned by identities. Authorization is the capability alone,
carried in an `Authorization: Bearer` header, never in the URL, so it stays out
of access logs.

| Operation | Capability | Effect |
| --- | --- | --- |
| `PUT /mailboxes/{mailboxId}` | recipient supplies `postTokenHash`, `readTokenHash`, `creationNonce` | creates the queue; `creationNonce` is a proof of work bound to the id and both hashes, 16 leading zero bits rising to 20 as the node fills (see Limits); idempotent for identical hashes and nonce |
| `POST /mailboxes/{mailboxId}/envelopes` | `postToken` | appends an envelope, returns its server cursor |
| `GET /mailboxes/{mailboxId}/envelopes?after=<cursor>&limit=N` | `readToken` | pages pending envelopes in cursor order |
| `POST /mailboxes/{mailboxId}/ack` | `readToken` | body `{ upTo: cursor }`; deletes envelopes up to the cursor |
| `DELETE /mailboxes/{mailboxId}` | `readToken` | deletes queue and envelopes |

Realtime: a connected recipient subscribes with the `readToken` over the
existing WebSocket and receives `mailbox_envelope` hints that contain only the
`mailboxId` and cursor. The hint carries no plaintext and no identity.

### Envelope

```text
{ envelopeId: 16 random bytes, body: ciphertext, padding }
```

- `envelopeId` is chosen by the sender and is the deduplication key: appending
  the same `envelopeId` to the same mailbox twice returns the first cursor and
  stores nothing new. The client also deduplicates on decrypted message ID, so
  redelivery never creates a duplicate message.
- `cursor` is unique per mailbox id across its lifetimes. The node stores one number, the highest cursor any removed mailbox reached, and a recreated mailbox starts above it, so no cursor a client still holds can match a new envelope. That number is the only disclosure: a new mailbox's first cursor reveals an upper bound on how many envelopes the largest removed mailbox on this node ever accepted, with no identity or time.
- Bodies are padded to size buckets (for example 1 KiB, 4 KiB, 16 KiB, 64 KiB) to
  reduce size correlation. This reduces, and does not eliminate, it.
- Sender identity, conversation ID and message type exist only inside `body`.

## Limits, retention and cleanup

All limits are environment-configurable with safe defaults and enforced without
any user identifier:

- maximum envelope size and maximum envelopes per mailbox (queue depth); append
  past the limit fails with `429`/`409`, never drops older envelopes silently;
- maximum bytes per mailbox and maximum mailbox count per node;
- creation difficulty by fill: 16 leading zero bits while the node holds at most half of `MAILBOX_MAX_COUNT`, rising in four steps above half capacity to 20 bits at the limit (`MailboxCreationDifficulty`). A short proof, or a replay checked against the current difficulty, is refused with `400` and the bits it needs. The check is stateless and runs before any lookup, so an unproven request learns nothing about which ids exist;
- at the count limit, creation evicts the least recently read mailboxes that are empty and unread for 7 days (`MailboxPolicy.EVICTION_IDLE_MS`), all or nothing; with too few such mailboxes it is refused with `429`;
- per-client fixed-window cap on creation, keyed by the socket address (or the forwarded address behind a proxy named by `API_TRUST_PROXY`; IPv6 per /64), plus a per-mailbox append rate;
- retention window (default 14 days). A background scheduler deletes expired
  envelopes and idle mailboxes; a mailbox with no read for the window is deleted;
- acknowledgement deletes immediately.

The creation window lives in memory and resets on restart; remote addresses are
never written to disk. The restart residual is bounded by `MAILBOX_MAX_COUNT`,
which is persisted. Without `API_TRUST_PROXY`, every client behind a reverse
proxy shares the proxy's address and one window. `true` is refused, so no client
can choose its own key.

Storage is a local embedded database (the same `EmbeddedLocalDatabase` used for
private authorization), never OrbitDB, never IPFS. Writes are batched so a crash
yields either the old or the new queue state. On restart the scheduler resumes
expiry from stored deadlines, so there is no unbounded growth and no silent loss:
an envelope is either stored with a cursor or the append call fails.

Backups: managed copies live only in the local database directory. Deleting a
mailbox removes the rows; copies held in filesystem snapshots or operator backups
are outside the node's control and are documented as such.

## Availability replication (not yet implemented)

By default a mailbox lives on the recipient's home node only. A recipient may
name additional *availability servers* explicitly; the `PUT` is then repeated on
each, with the same hashes. Senders append to every listed server and the
recipient reads from all, deduplicating by `envelopeId`. Nothing is replicated to
servers the recipient did not choose, and there is no gossip of mailbox state.

## Group fan-out (not yet implemented)

The sender holds one `(mailboxId, postToken)` per member, delivered inside the
group's encrypted channel. Sending is N appends. This costs O(N) requests but
means no server holds a conversation-to-recipient table. Large groups may batch
appends to one availability server in a single request; the server still sees
independent mailboxes.

## Open limitation: devices of one identity share one inbox

Every device of an identity derives the same read token for a mailbox id, so
they share one inbox: one cursor and one acknowledgement. `POST /mailboxes/{mailboxId}/ack`
deletes every envelope up to `upTo` for all devices, so a device that acknowledges
before another device has read those envelopes hides them from that device. The
node keeps one `readTokenHash` per mailbox and cannot tell devices apart, so this
is not solved on the server. Creation is idempotent across devices because they
present identical hashes. Fixing it needs either per-device read capabilities or
per-device mailboxes; neither is designed yet.

## Observable metadata (documented residual leakage)

A node serving a mailbox can observe:

- the IP address and timing of appends and reads;
- envelope size bucket and arrival rate per mailbox;
- that two requests used the same `mailboxId`, hence a stable pseudonymous
  relationship until rotation;
- when a recipient is online (reads and WebSocket subscriptions).

It cannot observe identities, participant lists, conversation IDs or plaintext.
Network-level protection (Tor, mixnets, relays) is out of scope.

## Interaction with other issues

- Private authorization (`docs/private-operation-authorization.md`) decides who
  may act; this document only moves the resulting ciphertext.
- #290 private blobs reuse the same capability pattern and quota model; the blob
  descriptor (CID-free locator, key, name) travels inside an envelope.
- #291: presence, signalling and receipts must also stop using identity-addressed
  fan-out; ephemeral state stays in memory and never enters mailboxes.

## Implementation plan

1. Domain and storage: `Mailbox` aggregate, capability hashing, quotas, expiry
   scheduler, local database repository, with unit tests for every limit and for
   crash atomicity.
2. HTTP API and OpenAPI/Swagger/`docs/api.md`; WebSocket `mailbox_envelope` hint (done).
3. Real-transport test proving mailbox records and envelopes never reach DHT,
   public IPFS or pubsub, and that an offline recipient receives pending
   envelopes after reconnect.
4. UI: key schedule, send/receive and cursor recovery (done in pigeon-swarm-ui #252 and #257). Open: rotation; direct-message wiring (#258); removal of the OrbitDB conversation path for protected scopes.
5. Wrapper: end-to-end two-node proof, then retire the replicated conversation
   collections.

Each step is a separate PR. #289 stays open until the acceptance criteria have
direct test evidence.

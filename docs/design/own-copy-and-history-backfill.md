# Own copy and device-history backfill

Refs haskou/pigeon-swarm-node#289. No node code changes: both slices are client work on top of the existing mailbox routes.

Status:

- (a) Own copy: client slice implemented on `feat/289-own-copy-sync` in pigeon-swarm-ui (`886be304`, `157460ce`, tests `118188b5`). No node change needed.
- (b) Backfill for new or restored devices: decided. The pairing export is the only backfill source, implemented in pigeon-swarm-ui #350 (`DirectMessageHistoryTransfer`). One-to-one history has no other source: there is no legacy history read and no backfill from the node.

## Problem

- Direct records (sent, edited, deleted, reaction, pin) are appended only to the peer's inbox. The sender's other devices never receive them, so they diverge. Read receipts already go to the sender's own inbox, so only own devices read them.
- Envelopes are deleted on full acknowledgement and expire after `MAILBOX_RETENTION_MS` (14 days by default). A new device or a restored device therefore gets no history from the mailbox.

## (a) Own copy

### Behaviour

- After the peer copy, the sender appends the same record bytes to its own self-inbox: the inbox the peer writes into (the inbox for `keysFor(me)`), where read receipts also go.
- The record is built once. Delete, reaction, and pin records carry a generated id, so building twice would send two different records.
- The own copy is silent. It runs after the peer copy and runs even when the peer copy fails. The returned result is the peer copy's.
- Own devices read the self-inbox like any other inbox. A record whose id this device appended as an own copy is acknowledged and not applied, because this device already shows it. The skip set is keyed by identity and record id and holds the 512 most recent entries, in memory only.
- The self-inbox exists only after some device of this identity has opened it. Before that the own copy returns 404 and is dropped silently.
- Node: no change. Create, append, read, and acknowledge already cover this.

### Capacity

Per mailbox the node holds at most `MAILBOX_MAX_ENVELOPES` (1000) envelopes and `MAILBOX_MAX_BYTES` (8 MiB). Each own copy adds one envelope and the same bytes to the self-inbox that the peer also writes into. Envelopes are removed only when every reader acknowledges them. A silent device therefore holds its share for up to 14 days, and a full inbox returns 409 to the peer's sends as well as to the own copy. Own copies roughly double the load on this inbox. No mitigation is included in slice (a); see D4.

### Trust

- The peer holds the conversation secret. It can post into this identity's self-inbox, though it cannot read, acknowledge, or delete it. This already holds for the peer's messages and read receipts.
- In the client paths read for this doc, the authorship check covers read receipts only. Edit and delete records are not checked against the message's author. So the peer can post an edit, delete, or reaction whose author is this identity, and this identity's other devices would show it. Own copies do not add a writer, but they widen the set of records a forged author could affect.
- Recommended hardening (decision D1): derive a post capability for an own-copy inbox from the identity root key, with a new HKDF label, and use a separate mailbox id. Only this identity's devices could then write to it. This is a wire change, so it ships as a clean cutover in which all devices read the new inbox.

### Residuals

- After a reload, the skip set is empty. Own records that were appended but not yet read are applied again. The reaction and pin clocks reset on reload, and edit and delete records carry no clock. A replay can override a later local change only when that change never reached the mailbox.
- Own copies expire with peer copies after 14 days. A device that does not read within that time misses them. Backfill is in (b).

## (b) Device-history backfill

### Options

1. **Pairing export (chosen).** An authorized device that holds the conversation streams its local history to the enrolling device.
2. **Legacy history as the backfill source (rejected).** One-to-one conversations no longer use the replicated conversation message log, so there is no legacy history to read.
3. **Own-inbox snapshot (rejected).** Write a conversation snapshot into the own inbox. The inbox is deleted on full acknowledgement, expires after 14 days, and each envelope is capped at `MailboxEnvelopeCipher.MAX_PLAINTEXT_BYTES` (65504). A snapshot is therefore not durable, and it cannot serve as a restore source.
4. **No backfill.** Applies only when no authorized device is online to export; see below.

### Pairing export design

- **Trigger:** enrollment of a new device by an authorized device, through the existing causal device authorization flow.
- **Source:** an authorized device that is online and holds the conversation. It exports from its local timeline, not from the mailbox, so it includes messages whose mailbox envelopes were already acknowledged or expired.
- **Transport:** a transfer inbox created by the source. Its read and post capabilities derive from a fresh transfer secret, which the pairing payload carries. The new device is the only reader. This reuses the existing create, append, read, and acknowledge routes and their limits, so no node change is expected. The transfer inbox is deleted when fully acknowledged or after 14 days.
- **Payload:** ordered chunks, each sealed with the existing envelope cipher and at most `MAX_PLAINTEXT_BYTES`. The new device acknowledges each chunk, which makes the transfer resumable. Records are deduplicated by id. Reactions use the reaction clock, and pins use `createdAt` last-writer-wins.
- **Attachments:** references and download tokens are carried. Blob retention is `max(PRIVATE_BLOB_RETENTION_MS, MAILBOX_RETENTION_MS)` (`PrivateBlobPolicy`, #446). Both default to 14 days, so attachments older than that are unavailable and the timeline shows them as expired.
- **Trust:** the node sees only ciphertext and capability hashes. The transfer secret travels in the pairing payload, which is already user-to-user.
- **MLS:** not touched. The export is a separate sealed channel.

### Restore without an online device

After a restore with no authorized device online, the pairing export has no source. The restored device starts with the envelopes still held in its inboxes (at most 14 days) and loses older one-to-one history. This loss is accepted: there is no legacy history read and no node-side backfill.

## Decisions

| #   | Decision                                                                                                                              | Outcome                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| D1  | Own-copy inbox: keep the shared self-inbox (shipped, additive), or add a root-derived own-copy inbox that only own devices can write. | Slice (a) ships on the shared self-inbox. A root-derived inbox, if adopted, ships as a clean cutover. |
| D2  | Backfill: pairing export, or legacy history.                                                                                          | Resolved: pairing export only (pigeon-swarm-ui #350). No legacy history path.                         |
| D3  | Restore without an online device: accept loss, or keep a legacy history read.                                                         | Resolved: accept loss of history older than the mailbox retention. No legacy read and no backfill.    |
| D4  | Self-inbox capacity: measure only, or reserve capacity for own copies.                                                                | Measure the fill in staging. No node change now.                                                      |

## Verification

- Slice (a): own-copy cases in `DirectMessageMailbox.spec.ts` in pigeon-swarm-ui (`yarn test:crypto`). Covers convergence on a second device for sent, edited, deleted, reaction, and pin records, and that a sending device does not re-apply its own copy.
- Pairing export: `DirectMessageHistoryTransfer` specs in pigeon-swarm-ui (#350).
- No node tests change.

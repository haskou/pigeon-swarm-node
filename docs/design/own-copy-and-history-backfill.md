# Own copy and device-history backfill

Refs haskou/pigeon-swarm-node#289. Design only: no node code changes.

Status:

- (a) Own copy: client slice implemented on `feat/289-own-copy-sync` in pigeon-swarm-ui (`886be304`, `157460ce`, tests `118188b5`). No node change needed.
- (b) Backfill for new or restored devices: decision pending. This doc recommends an option.

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

Per mailbox the node holds at most `MAILBOX_MAX_ENVELOPES` (1000) envelopes and `MAILBOX_MAX_BYTES` (8 MiB). Each own copy adds one envelope and the same bytes to the self-inbox that the peer also writes into. Envelopes are removed only when every reader acknowledges them. A silent device therefore holds its share for up to 14 days, and a full inbox returns 409 to the peer's sends as well as to the own copy. Own copies roughly double the load on this inbox. Measure the fill before the legacy path is retired. No mitigation is included in slice (a).

### Trust

- The peer holds the conversation secret. It can post into this identity's self-inbox, though it cannot read, acknowledge, or delete it. This already holds for the peer's messages and read receipts.
- In the client paths read for this doc, the authorship check covers read receipts only. Edit and delete records are not checked against the message's author. So the peer can post an edit, delete, or reaction whose author is this identity, and this identity's other devices would show it. Own copies do not add a writer, but they widen the set of records a forged author could affect.
- Recommended hardening (decision D1): derive a post capability for an own-copy inbox from the identity root key, with a new HKDF label, and use a separate mailbox id. Only this identity's devices could then write to it. This is a wire change, so it needs a cutover in which all devices read the new inbox. Sequence it before legacy retirement.

### Residuals

- After a reload, the skip set is empty. Own records that were appended but not yet read are applied again. The reaction and pin clocks reset on reload, and edit and delete records carry no clock. A replay can override a later local change only when that change never reached the mailbox.
- Own copies expire with peer copies after 14 days. A device that does not read within that time misses them. Backfill is in (b).

## (b) Device-history backfill

### Options

1. **Pairing export (recommended direction).** An authorized device that holds the conversation streams its local history to the enrolling device.
2. **Keep legacy history as the backfill source (current).** New devices read history from the legacy endpoint. It depends on legacy, so it blocks retirement (see the client doc's retirement list).
3. **Own-inbox snapshot (rejected).** Write a conversation snapshot into the own inbox. The inbox is deleted on full acknowledgement, expires after 14 days, and each envelope is capped at `MailboxEnvelopeCipher.MAX_PLAINTEXT_BYTES` (65504). A snapshot is therefore not durable, and it cannot serve as a restore source.
4. **No backfill (documented loss).** A new device starts empty. Acceptable only if option 2 stays available for restore.

### Pairing export design

- **Trigger:** enrollment of a new device by an authorized device, through the existing causal device authorization flow.
- **Source:** an authorized device that is online and holds the conversation. It exports from its local timeline, not from the mailbox, so it includes messages that never had a mailbox copy (oversized or attachment-heavy messages on the legacy path).
- **Transport:** a transfer inbox created by the source. Its read and post capabilities derive from a fresh transfer secret, which the pairing payload carries. The new device is the only reader. This reuses the existing create, append, read, and acknowledge routes and their limits, so no node change is expected. The transfer inbox is deleted when fully acknowledged or after 14 days.
- **Payload:** ordered chunks, each sealed with the existing envelope cipher and at most `MAX_PLAINTEXT_BYTES`. The new device acknowledges each chunk, which makes the transfer resumable. Records are deduplicated by id. Reactions use the reaction clock, and pins use `createdAt` last-writer-wins.
- **Attachments:** references and download tokens are carried. Blob retention is `max(PRIVATE_BLOB_RETENTION_MS, MAILBOX_RETENTION_MS)` (`PrivateBlobPolicy`, #446). Both default to 14 days, so attachments older than that are unavailable and the timeline shows them as expired.
- **Trust:** the node sees only ciphertext and capability hashes. The transfer secret travels in the pairing payload, which is already user-to-user.
- **MLS:** not touched. The export is a separate sealed channel.

### Restore without an online device

After a restore with no authorized device online, the pairing export has no source. Two options:

- Keep the legacy history endpoint as the restore source until retirement (recommended).
- Accept loss of mailbox-only history after legacy retirement.

## Decisions

| #   | Decision                                                                                                                              | Recommendation                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| D1  | Own-copy inbox: keep the shared self-inbox (shipped, additive), or add a root-derived own-copy inbox that only own devices can write. | Ship slice (a) now. Add the root-derived inbox before legacy retirement, as a cutover.                                    |
| D2  | Backfill: pairing export, or legacy history only.                                                                                     | Keep legacy history as the backfill source now. Build the pairing export (this doc) as the path to retire legacy history. |
| D3  | Restore without an online device after retirement: accept loss, or keep the legacy history read.                                      | Keep the legacy history read for restore.                                                                                 |
| D4  | Self-inbox capacity: measure only, or reserve capacity for own copies.                                                                | Measure the fill in staging before retirement. No node change now.                                                        |

## Verification

- Slice (a): own-copy cases in `DirectMessageMailbox.spec.ts` in pigeon-swarm-ui (`yarn test:crypto`). Covers convergence on a second device for sent, edited, deleted, reaction, and pin records, and that a sending device does not re-apply its own copy.
- No node tests change. This doc has no code.

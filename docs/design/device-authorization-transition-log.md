# Serving the signed device-authorization transition log

Status: implemented by issue #513 (unblocks UI #334, #379 and #384). Builds on
`causal-device-authorization.md`; it adds no new key, signature or trust.

## Problem

A removed device must erase its local secrets (keychain, mailbox roots,
sealed generations), and it must not erase them because a node told it to. The
node is not trusted: any single node could claim "you were revoked" to make a
device destroy its data, or claim nothing to keep a removed device's data
alive.

Before this change a device had no way to tell the two apart.
`GET /identity-devices/{identityId}` and `/devices` require a device that is
authorized at the head, so a revoked device gets the same generic `401` as a
network or clock failure. Even an answer would only be the node's own claim
about the head, and that claim is unsigned. The signed transitions that
produced the head exist on every node (`causal-device-authorization.md`), but
no endpoint served them.

## Mechanism

### Endpoint

```http
GET /identity-devices/{percent-encoded identityId}/transitions?cursor=<revision>&limit=<n>
```

`200` returns:

```json
{
  "concurrentRecoveries": [],
  "identityId": "<identity id>",
  "recoveries": [],
  "transitions": []
}
```

Every entry is a transition in exactly the primitives
`POST /identity-devices/{identityId}/transitions` accepts and the node stores, including
the `proofOfPossession` and `signature` strings. The node never re-signs,
summarizes or rewrites an entry. A stored record only enters the replay when
its canonical serialization equals that of the parsed transition
(`OrbitDBDeviceAuthorizationReplayer.transitionFromRecord`), so the served
primitives equal the stored signed record field for field.

- `recoveries` is the recovery lineage of the node's replay base, oldest first
  (`checkpoint.lineage` followed by `checkpoint.transition`). It is empty
  before the first recovery.
- `concurrentRecoveries` holds the recoveries that lost the checkpoint and
  still hold (`checkpoint.concurrent`), at any revision up to the
  checkpoint's: each one carrying a cap the checkpoint does not carry at least
  as tight, and the lost recoveries such a one recovered from. Their carried
  caps still hold, so a client needs them to replay the same base.
- `transitions` is the history the replay accepted from that base, in replay
  order: revision groups ascending, each group in the shared tie-break order,
  equivalent duplicates compacted. Records the replay rejected are never
  served.
- `cursor` (optional, default `0`) keeps only entries whose `revision` is
  greater than it. It must be a non-negative decimal safe integer without
  leading zeros; `limit` is an integer from 1 to 100. Anything else returns
  `400` with code `400050`. `nextCursor` (string or `null`) pages the log.

An overflowed (suspended) document serves its frontier, the highest witness
source. The suspension itself is a node-local state that no key signed, so it
is never served as, or treated as, a removal.

No head revision, epoch, network id or authorized-device list is returned: a
client derives all of them by replaying what it verifies, and the inventory
stays behind `/devices`.

### Authentication

A caller this node serves. The normal signed HTTP headers (`X-Identity-Id`,
`X-Timestamp`, `X-Signature`), fresh, signed by an identity in the replicated index the node holds or
whose node it owns; the signer does not have to be the path identity, and no
device or recovery proof header is read. Any self-generated key can sign, so a
signer the node does not serve gets `403` (`403014`) and nothing is read; an
anonymous request gets the generic `401`. The read is rate limited per client
address (60 per minute, IPv6 per /64; behind a reverse proxy `API_TRUST_PROXY` is required, or every client shares one bucket), per served requester keyed on its canonical id (60
per minute) and per node (3000 per minute), code `429030`.

This is the only authorization change of #698 stage 2: `GET
/identity-devices/{identityId}` and `/devices` stay owner-only with a device or
recovery proof.

### Disclosure

The node serves `log.disclose().page(cursor, limit)`: the whole log, paged by
whole revision groups ascending (at most `limit` transitions, the first group
always included). `recoveries`, `concurrentRecoveries` and `transitions` hold only entries above
`cursor`, and every entry counts toward `limit`. `nextCursor` is the revision of the last served group, or `null` when
the log is exhausted. `cursor` (default `0`) and `limit` (default 50, maximum 100) are part of the signed request target, so a relay cannot change them.
Any other query key, including the retired `after`, returns `400` (`400050`).

Disclosure by design: every identity this node serves learns the full signed
history of any identity the node holds: authorization times, compromise marks
and compromised credentials, pairing ids and expirations, operation ids,
epochs and the credentials of added, removed and recovered devices. This is an
explicit design position: a sender must replay the log to verify the sealing
view of a recipient it has never met. The scope is NOT "the users of one
node": `holds()` reads the replicated identity index, so any identity
published on the network counts, and where registration is `open` (or `codes`
with a code) one cheap registration is enough. The registration mode is the
control. The history is not narrowed to shared communities or conversations:
any served caller can read it, because a first-contact sender replays it to
verify a sealing view. The entries carry no `sealedSecrets` and no head
revision beyond what they state.

## Client verification algorithm

Trusted inputs, all held by the device:

- the genesis: identity version 1 binds the initial device credential and the
  recovery authority (`DeviceAuthorization.genesis(identityId, networkIds,
initialCredential, recoveryAuthority)`);
- its own credential `C`;
- its local epoch `E` and verified revision `L`: the `epoch` and `revision` of
  the transition that enrolled it (or `fromRecovery(operationId)` and the
  revision of the recovery that targeted it), advanced whenever it verifies a
  later head that still authorizes it.

To decide whether it was removed:

1. Fetch from cursor `0` and follow `nextCursor`. A cursor is for incremental sync from a locally
   verified state; it must never be the basis of a wipe.
2. Replay `recoveries` and `concurrentRecoveries` from the genesis with the
   shared lineage rules: each recovery verifies its proof of possession and the
   recovery authority signature, chains from the previous one and is in its
   epoch; each concurrent recovery, by ascending revision, is at most the last
   recovery's revision and applies to the one replayed state in its epoch (the
   genesis, a recovery or an earlier concurrent recovery), whose own epoch no
   replayed state has yet. Any failure means the body proves nothing.
3. Replay `transitions` from that base with the shared policy (identity, epoch,
   exact predecessor, next revision, authorized author signature, proof of
   possession, then the per-group checkpoint rule: a recovery first, then
   concurrent revocations, otherwise concurrent enrollments). Every served
   transition must be accepted; otherwise the body proves nothing.
4. Wipe only on **positive evidence**, either:
   - a recovery in `recoveries` whose `epoch` is `E` and whose
     `targetCredential` is not `C`: the recovery authority ended the epoch `C`
     belongs to. `concurrentRecoveries` lost the checkpoint and never count; or
   - a replayed revision group above `L` whose preceding state authorizes `C`
     and whose resulting state does not. Only a revocation targeting `C` or a
     recovery removes a credential, and the shared group rule already settles
     concurrent siblings (a recovery wins, an all-revoked group keeps its
     lowest credential).
5. Never wipe on absence. "`C` is not authorized at the replayed head" is
   forgeable by omission: withholding `C`'s enrollment produces exactly that.
   A `401`, `409`, timeout, empty body or suspension is not evidence either.

The byte-exact reads and verdicts in
[`tests/fixtures/device-authorization-transition-log-vectors.json`](../../tests/fixtures/device-authorization-transition-log-vectors.json)
pin both the served bodies and this decision, including a withheld revocation,
a stale removal and a revocation signed by an unauthorized key.

## Threat model

A single malicious node holds every stored record and can serve any bytes.

### What it cannot forge

- **A transition.** The author or recovery authority signature covers the
  identity, epoch, operation id, exact predecessor and next revision,
  operation, target credential and commitment, and any `compromisedSince` or
  carried caps; enrollment and recovery also carry the target's proof of
  possession. Changing any field, re-targeting a genuine revocation at `C`,
  moving it to another identity or epoch, or minting one breaks a signature.
- **An author.** A revocation only counts when its author is authorized in the
  state the client replays. A key the node controls, or one revoked earlier in
  the chain, signs nothing the client accepts.
- **A recovery.** Only the recovery authority signs one; its public key comes
  from identity version 1, not from this response.
- **The trust base.** The genesis is derived from identity version 1 on the
  client. The response carries no head, epoch or inventory to trust.

### What it can do

- **Withhold, truncate or serve a stale chain.** The client then lacks
  positive evidence and keeps its data (fail safe). The node denies the
  auto-wipe, not the removal: other nodes still refuse the removed key's
  records, and the client can ask another node.
- **Omit concurrent siblings.** When two authorized devices signed conflicting
  transitions at the same revision, the shared rule keeps the lowest credential
  if every credential would be revoked. Hiding the sibling can turn that
  survival into a removal of `C`, but only when an authorized device genuinely
  signed `C`'s revocation.
- **Choose among genuine competing recoveries.** Recoveries at different
  revisions of the same epoch resolve by highest revision, then canonical
  encoding, and every lost recovery is only concurrent.
  Serving a lineage that ends in a recovery not targeting `C`, while hiding a
  later one that does, shows a reset the recovery authority genuinely signed.
- **Serve a genuine removal from a partition that later healed differently.**
  The same class: some key authorized at that point signed it.
- **Observe who asks.** The identity, the device key and the timing, as for
  every other authenticated read.

In every case a wipe needs a signature from a key that had the power to remove
`C`; the node only chooses which of several genuinely signed intents `C` sees.

## Residuals

- Every identity the node serves learns the whole transition history of any
  identity (target credentials, operation ids, revisions, carried caps, the
  count and order of device additions and removals). Entries carry no secrets
  or network ids. A signer the node does not serve is refused (`403014`). The
  anonymous sealing view separately discloses device credentials and the device
  count. The served-caller history is disclosed by design (see Disclosure); the
  anonymous view is flagged for security review.
- A stolen authorized device key can sign a genuine revocation of `C` and make
  it wipe. That is within the power the key already has: it could revoke `C`
  on every node.
- A recovery that is not on `C`'s epoch lineage (a stale or foreign reset) is
  ignored, and a removal at or below `L` is treated as stale. Both fail safe.
- The head read used for authentication and the log read are two lock
  acquisitions. That is harmless: the recovery authority never changes, and
  the disclosure is computed from one consistent log.
- A single node can suppress the auto-wipe indefinitely; liveness needs more
  than one node, which the client controls.

## Verification

- `DeviceAuthorizationTransitionLog` unit spec: the whole log and the paging
  by whole revision groups with `nextCursor`.
- `OrbitDBDeviceAuthorizationReplayer` unit spec: the accepted history in
  replay order without rejected records, the checkpoint lineage and concurrent
  recoveries, and the frontier of an overflowed document.
- Repository, finder and request authenticator unit specs, including a valid
  but unauthorized device proof, and the `GetDeviceAuthorizationTransitionLogRequest`
  spec for every refused `cursor`, `limit` and `after` shape (leading zeros, signs, exponents,
  unsafe integers, repeated or nested query values).
- `DeviceAuthorizationTransitionLogVectors` unit spec: every read and verdict
  of the shared vectors, signatures verified.
- `DeviceAuthorizationRoute.feature`: a signed identity reads
  the log, `cursor` and `limit`
  page, an invalid `cursor`, `limit` or `after` returns `400050`, a served identity reads, a signed
  identity the node does not serve returns `403014` and an anonymous request
  returns `401`.

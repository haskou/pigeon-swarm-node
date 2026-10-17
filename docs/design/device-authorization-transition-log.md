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
GET /identity-devices/{percent-encoded identityId}/transitions?after=<revision>
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
`POST /identity-devices/transitions` accepts and the node stores, including
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
- `after` (optional, default `0`) keeps only entries whose `revision` is
  greater than it, in all three lists. It must be a non-negative decimal safe
  integer without leading zeros; anything else returns `400` with code
  `400050`.

An overflowed (suspended) document serves its frontier, the highest witness
source. The suspension itself is a node-local state that no key signed, so it
is never served as, or treated as, a removal.

No head revision, epoch, network id or authorized-device list is returned: a
client derives all of them by replaying what it verifies, and the inventory
stays behind `/devices`.

### Authentication

Authentication runs before the query is parsed, so a caller that fails it
always gets the generic `401` (`401020`):

1. The normal signed HTTP headers (`X-Identity-Id`, `X-Timestamp`,
   `X-Signature`), fresh, signed by the identity named in the path.
2. Exactly one complete proof over the same canonical payload:
   `X-Device-Credential` + `X-Device-Signature`, or `X-Recovery-Signature`
   checked against the identity's recovery authority.

Unlike the checkpoint read, the device credential does **not** have to be
authorized at the head. A device that was just removed must be able to read
its removal. The device signature still proves possession of the key, so the
node discloses to that key and nothing else.

Every proof must be fresh, but only the recovery authority and a device some
replayed state authorized (`log.records(reader)`) take a slot in the replay
guard, so a replayed proof of theirs is refused. A key in no replayed state
takes no slot and reads only the public recovery lineage, so a key that was
never authorized cannot fill the guard.

### Disclosure

The node builds a `DeviceAuthorizationTransitionLog` (the lists above plus
every replayed state from the base to the head) and serves only
`log.disclosedTo(reader).after(after)`:

| Reader | Disclosed |
| --- | --- |
| Recovery authority of the identity | every list |
| Device `C` authorized in some replayed state | `recoveries`, `concurrentRecoveries` and the transitions whose `previousRevision` is at most `R_C`, the revision of the last state that authorizes `C` |
| Device in no replayed state | `recoveries` and `concurrentRecoveries` only |

So a device authorized at the head reads everything, a revoked device reads up
to and including the revision group that removed it and nothing signed after
it, and a device that was enrolled before the latest recovery (whose states the
checkpoint discarded) reads the recovery that ended its epoch. The node cannot
tell such a device from a key it never saw, so both get the recovery lineage.

Unauthenticated callers and other identities get the generic `401` and learn
nothing; the existing catalog already requires the identity signature plus an
authorized device proof.

`after` is outside the signed canonical payload (the path excludes the query),
so a relay can change it. That only narrows what the authenticated reader is
entitled to; it never widens a disclosure.

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

1. Fetch without `after`. `after` is for incremental sync from a locally
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

- A caller holding the identity key and any self-generated key learns the
  recovery lineage: target credentials, operation ids, revisions and carried
  caps. Recoveries carry no secrets or network ids, and that caller already
  holds the identity key.
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

- `DeviceAuthorizationTransitionLog` unit spec: full disclosure to the recovery
  authority, the cut at a revoked device's removal group, the recovery lineage
  for an unknown device, nothing to an unrelated authority, and `after`.
- `OrbitDBDeviceAuthorizationReplayer` unit spec: the accepted history in
  replay order without rejected records, the checkpoint lineage and concurrent
  recoveries, and the frontier of an overflowed document.
- Repository, finder and request authenticator unit specs, including a valid
  but unauthorized device proof, and the `GetDeviceAuthorizationTransitionLogRequest`
  spec for every refused `after` shape (leading zeros, signs, exponents,
  unsafe integers, repeated or nested query values).
- `DeviceAuthorizationTransitionLogVectors` unit spec: every read and verdict
  of the shared vectors, signatures verified.
- `DeviceAuthorizationRoute.feature`: the owner and the recovery authority read
  the whole log, a revoked device reads up to its removal, `after` narrows, an
  invalid `after` returns `400050`, and unsigned or foreign requests return
  `401020`.

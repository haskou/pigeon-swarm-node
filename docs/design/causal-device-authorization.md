# Evaluating device authorization at the causal revision

Status: implemented by issue #362 (part of #361). Follows #357 (communities),
#374 (conversations), #378 (notifications), #379 (calls) and #377 (content
replication).

## Problem

Every signed public record is accepted by `PublicMutationGate`, which calls
`PublicMutationVerifier.verify`. That verifier asked one question: *is the
signing device in the identity's **current** device-authorization head?*
(`DeviceAuthorizationRepository.find` returns only the head). The verdict is
recomputed whenever a record is admitted or read, so:

- revoking a device retroactively invalidated every record it signed while it
  was legitimately authorized;
- a record signed while authorized and delivered after the revocation (late
  delivery, a partition that heals, a node that syncs from scratch) was
  rejected;
- two nodes that happened to evaluate the same record at different moments of
  the replication of the authorization document could disagree.

## What is already causal (verified in code)

| Check | Evaluated against | Causal? |
| --- | --- | --- |
| Community operation permission (`CommunityOperationLedger.admit`) | `CommunityStateFold` of `closureOf(parents)`; unknown parents are refused | yes |
| Conversation operation permission (`ConversationOperationLedger.admit`) | `ConversationStateFold` of `closureOf(parents)`; unknown parents are refused | yes |
| Device authorization of **every** signed record, operations included | the current head of the author's identity | **no** |
| Community / conversation permission of non-operation records (channel messages, moderation log, invites, polls, pins, reactions) | the current folded community or conversation state | no, evaluated at admission (see [Residuals](#residuals)) |

Operation ledgers are in memory; after a restart they are rebuilt by the
registry replaying the stored records, whatever the order. Unknown parents are
refused and retried, so the rebuild converges.

## Mechanism

### The signed revision

`PublicMutationProof` is bumped to `version: 2`, domain
`pigeon:public-mutation:v2\n`, and the signed `author` object gains
`authorizationRevision`: the revision of the device-authorization chain of the
author's identity **that the signing device observed when it signed** (the
`revision` returned by `GET /identity-devices/authorization`).

```jsonc
"author": {
  "authorizationRevision": 3,        // non-negative safe integer
  "deviceCredential": "<device public key>",
  "identityId": "<identityId>"
}
```

The revision is inside the signed body, so it cannot be changed without the
device key, and it is part of the proof digest (`winsOver` tie-break,
predecessor links).

### The verdict

The authorization chain of an identity is a deterministic replay of its signed
transitions (`OrbitDBDeviceAuthorizationReplayer`). Replaying it yields an
ascending list of states `S_b < ... < S_h` (`b` is the genesis or the latest
recovery checkpoint, `h` the head). The new
`DeviceAuthorizationTimeline` answers one question:

> A device is authorized at claimed revision `N` iff `b <= N <= h` and the
> state with the greatest revision `<= N` contains the device.

Consequences:

- **Late delivery is honoured.** A record signed at `N` while the device was in
  `S_N` stays valid after the device is revoked at `R > N`, on every node, in
  any arrival order, after a restart.
- **Revocation supersedes.** Every state `>= R` lacks the device, so a proof
  claiming `N >= R` is rejected. The revoker's own later records claim
  revisions `>= R`; they are the supersession of the revoked chain. A device
  that is revoked cannot claim `N >= R` without being refused, and it cannot
  *obtain* a signed higher revision because only authorized devices can apply
  transitions.
- **Unknown revisions fail closed.** `N > h` means the verifying node has not
  yet replicated that part of the chain; the record is refused and retried by
  the registry exactly as a record from a not-yet-replicated device always was.
  `N < b` cannot be checked (see recovery below) and is refused.
- **Deterministic.** The verdict is a pure function of `(proof, authorization
  chain)`. It does not depend on wall-clock time, arrival order or the moment of
  evaluation. The chain itself already converges (`OrbitDBDeviceAuthorizationReplayer`
  resolves concurrent transitions recovery > revocation > enrolment).

### Concurrent transitions

Two transitions on the same previous revision `k` produce one merged state at
`k + 1`. A device enrolled on either branch is in that merged state, so a proof
signed on a branch at `k + 1` is valid after the merge. A device revoked
concurrently with a record signed at `k` stays valid for that record (the
revocation lands at `k + 1`).

### Recovery

Recovery replaces the credential set and starts a new epoch; the replay base `b`
becomes the checkpoint. The history before the checkpoint is not retained
(bounded storage), therefore proofs claiming `N < b` are refused. Recovery is a
total-compromise reset: records signed by pre-recovery devices stop being
verifiable. This is unchanged from today (they were rejected against the new
head) and is a residual below.

## Threat model

Attacker `A` holds the key of a device `D` that was revoked at revision `R`
(the revocation was applied by an authorized device and replicated). `A` wants
to publish records as the identity.

1. **Present-day forgery.** `A` signs with the current head revision `h >= R`.
   The device is absent from every state `>= R`: refused.
2. **Backdating with a fake `createdAt` / old payload timestamps.** Timestamps
   inside the payload are not inputs to authorization at all. Only the signed
   `authorizationRevision` is. `A` cannot make a record valid by lying about
   time.
3. **Backdating with an old revision `N < R`.** The proof is accepted, because
   at `N` the device really was authorized. This is the *bound* of late delivery
   and it is deliberate: from a node's point of view such a proof is
   indistinguishable from a legitimate record that was signed before the
   revocation and delivered late (the requirement of this issue). It is limited
   by construction:
   - `N` must lie in the interval during which `D` was legitimately authorized,
     `[enrolled(D), R)`. Nothing signed by `D` can claim a right the identity
     did not grant `D` at `N`.
   - The set of records an attacker can mint is bounded by the same per-record
     gates as before (proof sequence/predecessor, per-author quotas of
     operations #365, rate caps, payload binding). A record that carries a
     causal position (community and conversation operations) is additionally
     evaluated against the folded state of its parents, so a stale operation
     cannot do anything the author could not do at that point of history.
   - Any record the attacker mints for an old revision is a *new* record; it
     cannot overwrite a newer legitimate record, because `winsOver` orders by
     `sequence` first and the legitimate authors have moved on.
4. **Re-enrolling the revoked key.** Requires an authorized device to sign a
   new enrolment (a new revision, `>= R`). Out of scope for the key thief.
5. **Claiming a future revision.** `N > h` is unknown to every node and refused
   (no node can verify it; a later head that reaches `N` makes the record valid
   only if the device is actually in that state).
6. **Recovery after total compromise.** Recovery makes every pre-recovery
   revision unverifiable (`N < b`): a thief cannot backdate at all after a
   recovery.

### Chosen bound and why

The bound of late delivery is **the whole authorized interval of the device,
up to the revision before its revocation (`N < R`), with no wall-clock or
first-seen window**.

Alternatives considered and rejected:

- *Wall-clock grace window after revocation* (accept records first seen within
  T of the revocation). The verdict would depend on when a node first saw the
  record, so nodes that sync later reject what earlier nodes accepted: no
  convergence, and an offline-then-heal scenario (the one this issue demands to
  work) would fail past T.
- *Trust `createdAt`*. Chosen by the signer, forgeable by the thief.
- *Revoker-chosen frontier in the revocation record*. The revocation transition
  already is that frontier: it has revision `R`, and every proof claiming
  `N >= R` is refused. A separate field would duplicate it and add a place where
  honest clients could disagree with it.
- *Rejecting everything not claiming the head*. Breaks late delivery, which is
  the issue.

Why the interval is the right limit: the only unforgeable ordering the system
has is the signed transition chain. A stolen key cannot be prevented from
signing records claiming a revision at which it was valid, but the *revoker*
has full control of the cut-off: revoking is exactly what ends the interval,
and the revoker does not need a separate message. Anything tighter (rejecting
`N` close to `R`) would also reject honest late records.

Residual damage of the accepted case is reduced to what an authorized device
could already have done before the revocation. Operators who need to cut that
too use recovery (hard cut, case 6).

## Persistence and restart

No new persisted state. The timeline is derived from the existing
`device-authorization:<identityId>` document (genesis or checkpoint + the
transition history, 256 records at most). `OrbitDBDeviceAuthorizationRepository
.findTimeline` replays it; the verifier caches the result for one second like
before. The `overflow` document (history over the shape limits, which
suspends the identity until recovery) yields a timeline with no credentials, so
every proof is refused: fail closed, as with the old head check.

After a restart the document is read back and the same timeline is produced; the
registry replays stored records through the gate again, and the verdict for each
record is the same as before the restart. Operation ledgers are rebuilt by that
replay as described above.

## Contract change

Clients (the UI) must put `author.authorizationRevision` in every proof and use
`pigeon:public-mutation:v2\n` as signing domain with `version: 2`. The revision
to use is the `revision` of the identity's current checkpoint
(`GET /identity-devices/authorization`), read before signing. Byte-exact
signing vectors are published in `tests/fixtures/*-vectors.json` and
`docs/api.md#public-mutation-proof`.

There is no legacy path: version 1 proofs are rejected by the strict decoder.

## Residuals

- **Backdating a scoped record's frontier.** Non-operation community and
  conversation records carry a signed `frontier` in their proof, and their
  permission is judged against the scope folded at that frontier. A member
  removed later can still sign a record that claims an older frontier, which no
  node can tell apart from honest late delivery without a trusted clock. It is
  the same family as the compromised-device window tracked in #386.
- **Recovery** discards the pre-checkpoint chain, so earlier records of
  pre-recovery devices become unverifiable. Carrying a compact credential
  interval summary through checkpoints would keep them valid; it is not done
  because it changes the replicated authorization document shape.
- **Backdating inside the authorized interval** (threat 3) cannot be bounded
  further without a trusted clock.

## Verification

- Unit: `DeviceAuthorizationTimeline`, `OrbitDBDeviceAuthorizationRepository`
  timeline (replay, restart), `DeviceAuthorizationPublicMutationAuthorization`
  (late delivery, backdating at and after the revocation, not-yet-enrolled,
  unreached revision then healed, shuffled state order),
  `PublicMutationVerifier` (version and revision decoding, tampered revision),
  `CommunityOperationLedger` (demotion racing a moderation action across a
  partition, shuffled arrival), registry re-admission of a head whose claimed
  revision is not replicated yet, and the byte-exact vectors in
  `tests/fixtures/*-vectors.json`.
- Real transport: `yarn test:integration:causal-device-authorization` (two real
  private Helia/OrbitDB replicas: partitioned authorization history, healing,
  late delivery, backdating, unreplicated revision and a restart; in `test:ci`).
  The existing `forged-*`, `two-real-node-gossipsub` and call scripts keep
  covering the admission gates end to end.

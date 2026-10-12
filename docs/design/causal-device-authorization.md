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

Compromise caps are the one exception that survives the checkpoint. A recovery
carries the caps in effect as `compromisedCredentials` (see Compromise
frontier), so a credential capped before the checkpoint stays refused after it,
including when the same key is enrolled again on a post-recovery device. Caps
only refuse: a carried cap never restores validity to a pre-recovery record.

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
every proof is refused: fail closed, as with the old head check. Its compromise
caps are derived from the witness sources the document keeps
(`overflow.sources`), not from its frontier, so a recovery built over an
overflowed timeline carries the same caps as the replayed chain.

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

## Compromise frontier (#386)

A revocation may carry `compromisedSince`, a revision no greater than its own
`previousRevision`, covered by the author signature. It means "treat this
device as stolen from that revision on": the timeline refuses any record the
target signs while claiming `compromisedSince` or a later revision, even though
the device was authorized there. Omitting it is a plain retirement and keeps
the previous behaviour, so no existing signature or document changes.

- Choice over alternatives: a revoker-chosen frontier `inside` the revocation
  was rejected earlier because it duplicated the revocation revision; the
  explicit cap differs because it may be *lower* than the revocation revision,
  which is exactly the stolen-key window. A separate document or a wall-clock
  window would need new replicated state or a trusted clock.
- The cap is derived from accepted revocations during replay (minimum across
  concurrent revocations of the same credential) and held by the timeline, so
  restart and partition healing recompute it from the same history.
- Authority: the same as any revocation (an authorized device). A thief that
  already holds an authorized key could also revoke other devices, so this adds
  no new power.
- A credential capped this way stays capped while the replayed history holds the
  revocation: enrolling the same key again within that history does not lift
  it. Use a fresh key. A recovery carries the caps in effect as
  `compromisedCredentials` (see Recovery), so the cap also survives the
  checkpoint, and re-enrolling the key on a post-recovery device does not lift it.

## Local domain events (#460)

Device authorization transitions record domain events on the aggregate, and the
repository returns them with the applied state. The events are local-only: they
are not published, not replicated and not pushed over WebSocket.

| Transition                       | Event                                                                  |
| -------------------------------- | ---------------------------------------------------------------------- |
| `enroll`, `enrollConcurrently`   | `identity_devices.v1.device_authorization.credential_enrolled`         |
| `revoke`, `revokeConcurrently`   | `identity_devices.v1.device_authorization.credential_revoked`          |
| `revoke` with `compromisedSince` | also `identity_devices.v1.device_authorization.credential_compromised` |
| `recover`, `recoverAt`           | `identity_devices.v1.device_authorization.recovered`                   |

Hydration, replay and `requireRecoveryAt` record nothing. Replay discards the
intermediate states it rebuilds, so only the events of the applied transition
reach the caller.

## Residuals

- **Backdating a scoped record's frontier.** Non-operation community and
  conversation records carry a signed `frontier` in their proof, and their
  permission is judged against the scope folded at that frontier. A member
  removed later can still sign a record that claims an older frontier, which no
  node can tell apart from honest late delivery without a trusted clock. It is
  the same family as the compromised-device window tracked in #386.
- **Recovery is the explicit hard cut.** It discards the pre-checkpoint chain,
  so records signed by pre-recovery devices become unverifiable and are
  refused. This fails closed on purpose: recovery is what an owner does after
  losing every device, and a carried-over interval summary would keep a
  possibly stolen credential valid for old revisions and change the replicated
  document shape. Anything that must outlive a recovery has to be re-signed by
  a post-recovery device.
- **Backdating inside the authorized interval** (threat 3) cannot be bounded
  by time. For a device revoked as compromised it is bounded by the owner's
  compromise frontier (below); a plain retirement keeps the whole interval.
- **Carried caps depend on the authorizing device's view.** A recovery must
  carry exactly the caps the admitting node has in effect. An authorizing device
  that has not received a capping revocation builds a recovery without it: a
  node holding that revocation refuses the recovery, while a node lacking it
  accepts it, and the cap is then lost on that node because the pre-checkpoint
  revocation is discarded with the chain. The nodes disagree about that recovery.
- **A fresh replica cannot check the first recovery's caps.** The checkpoint
  check compares a recovery's carried caps only with caps carried by earlier
  recoveries of its lineage. Before the first recovery there are none, and a
  fresh replica no longer holds the pre-recovery revocations, so it accepts the
  carried list as written.
- **Concurrent recoveries at one revision are not settled by their caps.** The
  lowest operation UUID wins the tie-break (pubsub protocol). The replayed state
  merges the caps of every retained candidate at that revision, keeping the
  minimum per credential, so a losing candidate's caps may still apply. No test
  covers that interaction; it is an open point.
- **More than 32 capped credentials fails closed.** A recovery that would carry
  more is refused, and nothing is trimmed.
- **The caps are read in two steps.** The checkpoint and the caps come from
  separate reads on the node. A client that combines a revision from one read
  with caps from the other can build a recovery that admission refuses. This
  fails closed; the client has to re-read both before signing.

## Verification

- Unit: `DeviceAuthorizationTimeline` (compromise cap), `DeviceAuthorizationTransition` (shape, canonical order and bound of carried caps, signature coverage), `OrbitDBDeviceAuthorizationRepository`
  timeline (replay, restart, caps carried across a recovery and refused when a carried cap is dropped, invented or replicated without it, overflowed timeline caps derived from witness sources), `DeviceAuthorizationPublicMutationAuthorization`
  (late delivery, backdating at and after the revocation, not-yet-enrolled,
  unreached revision then healed, shuffled state order),
  `PublicMutationVerifier` (version and revision decoding, tampered revision),
  `CommunityOperationLedger` (demotion racing a moderation action across a
  partition, shuffled arrival), registry re-admission of a head whose claimed
  revision is not replicated yet, and the byte-exact vectors in
  `tests/fixtures/*-vectors.json`.
- Real transport: `yarn test:integration:causal-device-authorization` (two real
  private Helia/OrbitDB replicas: partitioned authorization history, healing,
  late delivery, backdating, unreplicated revision and a restart; then a recovery
  checkpoint at revision 7 carrying the stolen tablet's compromise cap, verified on the author, a healed, a restarted and a
  fresh replica: the pre-recovery owner, phone, stolen tablet and watch are
  refused, and the recovered device is accepted only at its checkpoint revision;
  in `test:ci`).
  The existing `forged-*`, `two-real-node-gossipsub` and call scripts keep
  covering the admission gates end to end.

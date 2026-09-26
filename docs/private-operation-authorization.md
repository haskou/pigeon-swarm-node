# Private operation authorization

## Status

This document defines the authorization boundary for version 1 private control
operations. It is an implementation contract. It does not claim that the
protection is active until the described tests and release gates pass.

The design follows the private-data architecture and wire contracts in
`haskou/pigeon-swarm`. Cryptographic parsing and signature verification are
provided by `@haskou/pigeon-swarm-crypto`; this application must not implement a
second canonical JSON or signature format.

## Goals

- Make the signed operation, verified authorization checkpoint and domain state
  the only inputs that can authorize a private state transition.
- Apply the same domain behavior to operations submitted by the attached client
  and operations received from another participant.
- Reject forged authorship, stale or incompatible policy, replay, wrong scope,
  invalid causal history and revoked credentials before visible state changes.
- Recover valid out-of-order operations after missing authenticated state arrives,
  without accepting an operation twice.
- Persist acceptance and its resulting private projection atomically and recover
  deterministically after a crash.
- Keep private identifiers, keys, policy, roster and payloads out of public IPFS,
  DHT records, shared pubsub, public logs and global indexes.

## Non-goals

- This boundary does not make a participant-owned node safe after its process or
  local storage is compromised. Every participant independently verifies remote
  input and no node vouches for another node.
- It does not provide opaque mailbox delivery, browser vault storage, device
  enrollment, total-loss recovery or traffic-analysis resistance. Those features
  consume this authorization boundary separately.
- It does not authorize ordinary messages, reactions, receipts, presence or call
  signaling in the node. Version 1 node integration accepts only private control
  operations. Private content remains unavailable through this path rather than
  falling back to legacy replication.
- It does not preserve existing private OrbitDB data. A protected scope starts
  from a newly verified genesis.

## Current vulnerability

`OrbitDBCommunityRepository` replicates a complete mutable community document.
Replica selection and merge preserve convergence, but an OrbitDB writer signature
only identifies a node writer. It does not prove which participant authorized a
membership acceptance, ban or administrator grant. Hydrating the merged document
also bypasses the methods and validators on the `Community` aggregate.

For a protected private scope, an OrbitDB community snapshot is therefore never
an authority or recovery input. The accepted signed operation ledger is the
authority. Read models are projections of that ledger and may be discarded and
rebuilt.

## Trust boundary

Each participant runtime owns one local copy of the authorization state and
performs the complete validation pipeline. It trusts only:

1. a locally created genesis, or a genesis verified against an owner key and
   scope pinned through an authenticated invitation or contact channel;
2. the last checkpoint it previously committed locally;
3. cryptographic results calculated from the exact received bytes; and
4. domain state obtained by replaying its own accepted ledger.

The sender, another node, an OrbitDB document, a network membership key and a
fresh HTTP signature are not trust anchors. A checkpoint included by the sender
is ignored. A valid signature proves possession of one admitted key; permission
still depends on the locally verified checkpoint and the domain aggregate.

## Bounded contexts and ownership

The new `private-authorization` context owns the protected scope state machine.
Its `PrivateAuthorizationScope` aggregate owns:

- the pinned scope identifier and genesis hash;
- the current verified authorization checkpoint;
- the accepted control-operation frontier;
- the set of unresolved causal dependencies;
- the active, frozen or rejoin-required lifecycle state; and
- the rule that one operation identifier has one immutable digest.

The context uses value objects for scope, operation, checkpoint, revision, head,
device key and operation digest. The aggregate receives authenticated domain
values; it does not parse JSON, call cryptographic libraries or access Level.

The communities context continues to own membership, bans, roles and their
permissions. A small anticorruption mapper translates an accepted private control
operation into an existing community application message. It never mutates a
`Community` directly and it does not duplicate community permission rules.

The application layer owns the transaction boundary through a
`PrivateOperationUnitOfWork`. Infrastructure implements cryptography, strict wire
decoding, Level persistence and transport adapters. HTTP routes and remote frame
consumers only construct boundary messages and invoke the same use case.

## Supported control operations

The node accepts these signed operation kinds from the version 1 private-operation
contract:

- `membership.propose` records a proposed admission, removal, ban or role change
  against an exact checkpoint. It changes no visible authority.
- `membership.commit` references a previously accepted proposal and the verified
  control transition that makes it effective. The resulting authorization policy
  and community mutation must describe the same devices and authority change.
- `device.revoke` records the device revoked by the corresponding verified control
  transition. It cannot independently change MLS or policy state.

Admission, removal and ban must remove or add the exact affected credentials in
the MLS transition and authorization policy. An administrator grant or removal
must produce the corresponding change in `authorityKeys`. The community mutation
is committed only after those cross-context facts agree.

All other operation kinds are rejected by this node boundary. They are not stored
for later permissive replay. Future participant-side handlers may support them
under the same signed envelope without weakening this control path.

The implementation publishes closed JSON schemas for both supported payloads.
A proposal contains exactly a random `proposalId`, its `parentHeadHash` and one
tagged change. Admission binds one identity to its expected signing credential;
removal and ban identify an existing member; a role change contains the target
member and complete resulting role identifiers. A commit contains exactly the
proposal operation ID, resulting head hash, hash of the exact MLS control bytes
and the same tagged change. `device.revoke` contains the target admitted device
key and resulting head hash. Unknown fields, change tags or partial role patches
are rejected. The commit must reproduce the proposal intent byte-for-byte after
canonical normalization; a control transition cannot smuggle another domain
change behind an approved proposal.

## Initial identity binding

The current identity model has one Ed25519 signing credential shared by that
identity's clients. For newly created protected scopes, version 1 binds an
`authorDeviceKey` to an existing `IdentityId` only when the raw 32-byte Ed25519
key extracted from the independently verified identity SPKI is an exact match.
The operation's own key field is never sufficient evidence for this binding.

This is an explicit single-credential compatibility boundary, not a device model.
Malformed, non-Ed25519 or non-canonical identity keys fail closed. There is no
lookup fallback and no acceptance based on a claimed identity in the payload.
Independent per-device credentials will replace this binding through an admitted,
scope-private credential record; the signed operation envelope and authorization
pipeline remain unchanged.

## Validation pipeline

The accept use case performs the following steps in order. A failure stops before
any visible or durable acceptance change.

1. Bound the encrypted frame and strict JSON input before expensive work.
2. Load the locally trusted scope and reject an unknown, frozen or legacy scope.
3. Parse the closed version 1 envelope and calculate its digest from the exact
   canonical signed form.
4. If the operation identifier already exists, return success only when its stored
   digest is identical. A different digest freezes the scope as an equivocation.
5. Require exact scope equality and a supported control kind.
6. Resolve the expected author key from the local checkpoint and identity binding,
   then call `PrivateOperationSignature.verify` with that expected key.
7. Require the operation authorization revision to equal the locally accepted
   checkpoint revision. A future revision enters the bounded pending queue; an old
   revision is rejected after the newer checkpoint is observed.
8. Require every causal predecessor to be accepted with the same scope. Missing
   predecessors enter the bounded pending queue.
9. For a sensitive outbound or newly received batch, verify the outstanding
   challenge, batch commitment, exact checkpoint and one-use freshness proof. The
   proof is invalid after ten seconds measured from the local monotonic challenge
   start. Wall-clock timestamps never grant authority.
10. For a control transition, authenticate its binding against the current local
    checkpoint, process MLS on a temporary state copy, compare the complete
    resulting leaf credentials with the candidate policy, and verify the resulting
    context. Candidate administrators never authorize their own admission.
11. Ask `PrivateAuthorizationScope` to validate revocation, proposal/commit
    linkage, exact successor coordinates and conflict rules.
12. Translate the authorized intent and invoke the existing `Community` behavior.
    A domain rejection is an authorization rejection; it is never overwritten by
    a remote snapshot or a special remote rule.
13. Atomically persist the accepted operation receipt, checkpoint and MLS state
    when changed, private community projection, replay marker and projection
    outbox record.
14. Publish domain events only after commit. Redelivery reads the replay marker
    and cannot execute the aggregate behavior again.

Signature validation is intentionally before MLS processing, while cheap size,
version and scope checks precede signature work. Error responses expose a stable
code only and do not distinguish unknown scope, key, member or policy to an
unauthenticated caller.

## Genesis and control transitions

Genesis is verified with `PrivateGenesisSignature.verify` using the independently
pinned owner key, expected scope and hash of the verified initial MLS context.
Genesis, initial MLS state and the first local projection commit in one Level
batch before the scope can send or accept operations. A second genesis for the
same scope is a conflict, even when validly self-signed.

Control transitions use the two-stage `PrivateControlSignature` API:

1. authenticate the binding against the locally stored checkpoint and hash of the
   exact MLS control bytes;
2. apply MLS to a temporary immutable session;
3. compare the complete resulting device and credential set with `policy.devices`;
4. verify the final MLS context hash; and
5. commit the candidate checkpoint and MLS state with compare-and-swap against the
   checkpoint loaded at the start of the use case.

The previous policy quorum and previous sequencer are required even when the
candidate replaces them. The sequencer reserves one child head per parent in the
same durable database before releasing a signature. A restarted sequencer resumes
that reservation and cannot choose a different child.

## Persistence and crash recovery

The existing `EmbeddedLocalDatabase` must gain an infrastructure-only atomic batch
primitive. `PrivateOperationUnitOfWork` uses it behind a per-scope exclusive lock.
Level's process lock prevents two processes from opening the same database; the
per-scope lock and expected-checkpoint comparison prevent concurrent commands in
one process from overwriting each other.

One acceptance batch contains:

- the immutable operation receipt: operation ID, canonical digest, kind, revision
  and causal IDs, plus the normalized private control mutation required for
  deterministic replay;
- the accepted checkpoint and protected MLS state when changed;
- the updated private community projection;
- the replay marker; and
- an outbox item for post-commit domain-event publication.

Only control metadata required for recovery is stored. Message bodies and other
ordinary private application payloads cannot enter this ledger. The signed wire
envelope is not retained after validation. The projection and normalized control
mutation contain the private roster and roles needed by that participant runtime,
but never enter a global index or an unencrypted backup.

A crash before the batch commits leaves every record unchanged. A crash after the
batch commits may delay event publication, but the outbox resumes and the replay
marker prevents another domain transition. The private outbox targets only the
attached participant client; it never publishes these events to shared pubsub or
a network-wide broker. Projection corruption is repaired by replaying normalized
accepted control mutations and protected control material from the latest verified
snapshot; a projection can never overwrite the ledger.

## Ordering, replay and conflicts

Pending operations are keyed by scope and operation digest. The queue stores at
most 128 frames or 1 MiB per scope, whichever is reached first. Pending input is
not acknowledged as application success. Recovery requests missing authenticated
control frames and causal predecessors with bounded backoff for at most five
minutes. The seven-day protocol recovery window then requires an authorized
rejoin or history transfer; it never silently applies or discards an orphan.

When a dependency or checkpoint arrives, pending operations are retried in a
deterministic topological order: authorization revision, causal depth, then
operation ID bytes. An operation is committed once. Cycles, a reused identifier
with another digest, two valid children of one checkpoint or two different valid
genesis records freeze the scope and surface a conflict. Automatic last-write-wins,
wall-clock arbitration and leader election are forbidden.

## Revocation under partitions

A removal or device revocation becomes effective when its verified control head
is committed locally. From that point, operations signed by the removed credential
at the old revision are rejected or quarantined as historical recovery material;
their claimed timestamp cannot make them current. Operations already committed
before the new head remain part of history.

A participant that has not observed the new head may temporarily accept an
operation valid under its last verified checkpoint. Freshness proofs reduce that
window for outbound batches but cannot make a partitioned authority omniscient.
After synchronization, incompatible accepted children freeze the scope rather
than being merged. A removed participant can retain old plaintext and old epoch
keys; the guarantee is exclusion from newly accepted epochs after the new head is
observed, not retrospective erasure.

If the current head, required sequencer reservation or required quorum cannot be
proven, sensitive operations stay pending. Recovery uses the same authorized keys
and state. It does not elect another sequencer, accept a recovery-key bypass or
restore a stale backup as current authority.

## Ingress and egress

Attached-client HTTP submission and decrypted remote-frame delivery are adapters
to one `AcceptPrivateOperation` use case. Neither adapter passes a trusted author
identity. The use case derives authorship from the verified envelope and local
binding.

The HTTP contract accepts the protected frame, an outstanding freshness exchange
reference and any required authenticated control material. It does not accept an
unsigned community mutation. The remote adapter receives a frame only after the
participant-specific encrypted transport has authenticated and decrypted it. A
private network pubsub topic and OrbitDB are not substitutes for that transport.

Local UI actions first construct and sign the same version 1 envelope, then use the
same acceptance path. This prevents a local endpoint from bypassing rules that a
remote operation must satisfy.

## Legacy and public data policy

Protected private scopes are created with a new random scope identifier and
verified genesis. There is no migration of old private OrbitDB documents and no
dual-write period. Existing private state is deliberately discarded or exported
by an explicit client workflow outside this boundary.

Once a community is marked as a protected private scope:

- reads come from the local private projection;
- writes require a verified version 1 operation;
- private OrbitDB documents, member indexes and heads are ignored and never
  published; and
- an unavailable new path fails closed.

Explicitly public community publications remain a separate feature and may use a
public replication adapter. Public state can never be imported as the authority
for a protected private scope, even when identifiers collide.

## Audit and observability

Security failures emit only a fixed event name, stable reason category and local
opaque correlation ID. Logs, metrics and traces must not contain scope IDs,
operation IDs, identity IDs, device keys, policy, signatures, causal links,
payloads, MLS bytes or submitted exceptions. Supported categories are bounded,
for example `invalid_format`, `invalid_proof`, `stale_state`, `replay_conflict`,
`missing_dependency`, `domain_rejected` and `scope_frozen`.

Success logs are unnecessary. Counters are process-local and aggregate only by
reason category. Debug mode does not weaken redaction. Tests inject malicious
values into every rejected field and assert that captured logs and errors contain
none of them.

## Verification strategy

Implementation follows test-driven development. Each behavior starts with a
failing test at the narrowest owning boundary.

### Domain tests

- genesis can be pinned once and only once;
- revisions, parents and causal predecessors are exact;
- supported control kinds cannot bypass proposal/commit rules;
- replay is idempotent only for the same digest;
- revocation and administrator changes take effect at the committed head;
- conflicting children freeze the scope; and
- queue limits and deterministic retry order are enforced.

### Application and adapter tests

- local and remote ingress invoke the same use case and community behavior;
- a node cannot attribute acceptance, ban or administrator grant to a different
  identity key;
- tampered JSON, signature, scope, revision, head, MLS bytes, policy, credential
  set, causal links, freshness proof and version fail before mutation;
- an attacker-supplied checkpoint or author key is ignored;
- legacy and unsupported operation kinds fail closed;
- errors and logs remain redacted; and
- a domain permission rejection leaves no accepted receipt.

### Persistence and restart tests

- fault injection at every batch boundary yields either the complete old state or
  the complete new state;
- redelivery after commit does not execute the community transition twice;
- outbox publication resumes after restart;
- pending operations recover after dependencies arrive, including after restart;
- stale compare-and-swap loses and re-evaluates instead of overwriting; and
- a sequencer cannot sign another child after restart.

### Real transport acceptance

A three-participant test uses real cryptography and transport adapters. It covers
valid out-of-order delivery, duplicate delivery, delayed control transition,
partition during revocation, malicious writer forgery, incompatible heads and
restart. Every participant must converge on the same accepted control ledger and
community projection after the partition heals, or all honest participants must
freeze on the same detectable conflict. The test also asserts that no private
operation or projection appears in public IPFS, DHT, OrbitDB or shared pubsub.

## Release gates

- `@haskou/pigeon-swarm-crypto` is updated to the release containing private
  operation, genesis, control and MLS lifecycle APIs.
- The crypto package provides the strict canonical freshness-request and
  freshness-proof signer/verifier used here; the node does not implement another
  canonicalizer or accept a generic signature over loosely parsed JSON.
- Targeted domain, application, persistence, API and real-transport tests pass.
- Lint, type checking and the complete relevant regression suite pass.
- The API and any transport contract documentation match the implemented shapes.
- Review confirms that protected private scopes have no legacy or OrbitDB fallback.
- Security review is performed against the exact final commit.

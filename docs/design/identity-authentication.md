# Identity authentication

Status: implemented by the residual work of issue #361. Follows #362 (causal
device authorization) and the keychain gate.

## Problem

The replicated `identities` OrbitDB store sits under
`IPFSAccessController({ write: ['*'] })`, so any network member can append to
it, and stores index documents by `id`. Before this change:

1. reference-only records (no embedded identity) were accepted as non-canonical
   candidates;
2. `receivedAt` was chosen by the sender and decided freshness;
3. remote `deleted: true` tombstones were ignored, and a local
   `deleteByExternalIdentifier` existed;
4. a peer could squat a handle or flood the store with valid identities, and
   identity metadata used `id: identityId`, so a peer could overwrite any
   identity's slot;
5. an identity the node had never seen had no trusted genesis for device
   authorization.

The identity id is the identity's public key and version 1 is signed by it, so
an identity is self-certifying. The gate below makes the store accept nothing
else.

## Mechanism

### (a) `OrbitDBIdentityMutationGate`

It governs the whole `identities` collection (no other document is written
there) and the `identity:` and `identity-handle:` head prefixes. A record is
admitted only when:

- its keys are within `cid`, `handle`, `id`, `identity`, `identityId`,
  `networkIds`, `previousCid`, `version`; `deleted` and `receivedAt` are absent;
  it is at most 64 KiB;
- the embedded `identity` is present and `Identity.fromPrimitives` succeeds,
  which verifies the signature against the identity id;
- `id === cid` and `cid` is the canonical CID of
  `IpfsIdentityMapper.toDocument(identity)`;
- `identityId`, `handle`, `networkIds`, `version` and `previousCid` equal the
  signed values, and the identity names at most 32 networks.

`acceptsHead` requires the key to equal the key derived from the signed
identity, so a valid record cannot be planted under another identity's or
handle's head. Metadata projections derive everything from the embedded
identity. `OrbitDBIdentityMetadataIndex`, `IpfsIdentityRepository` and
`IdentityMetadataRecord` no longer have reference-only candidates. Fetching a
candidate by CID stays: content addressing plus the constructor signature check
make it self-verifying.

Documents are written with `id: cid`, where `cid` is the canonical CID of the
signed content. A record can occupy a slot only if its content hashes to that
CID, which makes it the very same record, so a forged record cannot shadow an
honest one and two versions never overwrite each other.

### (b) No sender-chosen freshness

`receivedAt` is removed from documents, records, sorts and the gate rejects it.
The total order is `version` descending, then `cid` ascending.

### (c) No tombstones

`deleteByExternalIdentifier`, the `deleted` flag and the tombstone branches are
removed; the gate rejects `deleted`. Identity history is append-only; a peer
cannot hide a version and a node cannot diverge by honouring a tombstone.

### (d) Handle uniqueness

`IdentityHandleOwnershipDomainService` ranks the claimants of a handle. Among
identities whose **latest** version claims the handle, the owner has the smallest
`(claimedAt, identityId)`, where `claimedAt` is the minimum signed `timestamp`
among that identity's retained versions claiming it, and ties break by the
lowest identity id (plain `<` comparison). An identity holds only its latest
version's handle, so versions cannot accumulate handles, and changing handle
releases the old one. `OrbitDBIdentityMetadataIndex.findByHandle` and
`IpfsIdentityRepository.findCandidateByHandle`, remote candidates included,
return only the owner's latest candidate.

### (e) Genesis for device authorization

The pinned genesis of the device authorization history is derived from the
verified identity chain (version 1 is signed by the identity key), so a node that
has never seen the identity no longer trusts the first valid-looking history.
The chain is walked back through `previousIdentityExternalIdentifier`; among
valid forked version-1 candidates the earliest signed timestamp wins, then the
lowest CID. This lives in `OrbitDBDeviceAuthorizationRouting`. The vestigial
write of device authorization documents into the `identities` store is removed,
so the identity gate governs the whole collection.

## Order and convergence

Every decision depends only on the set of admitted records: gate admission is a
pure function of the record, ordering is `(version desc, cid asc)` and handle
ownership is `(claimedAt, identityId)`. Any arrival order, replay or partition
heal yields the same owner and the same latest identity.

## Bounds

| Bound | Value |
| --- | --- |
| Record size | 64 KiB |
| Networks per identity | 32 |
| Retained versions per identity | 64 (`MAX_CANDIDATES_PER_IDENTITY`) |
| Remote handle candidates | 32 |
| Publications per identity per minute | `IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE`, default 30, `429` code `429040` |

Claimants of a handle are deliberately not capped: evicting a lower ranked
claimant would make the owner depend on the order of past events (a node that
evicted one and a node that never saw it would disagree once the better ranked
claimants moved away). Lookup cost grows linearly with the valid identities
claiming that handle, which is the sybil non-goal below.

## Tests

- `OrbitDBIdentityMutationGate.spec.ts`: forged, reference-only, tampered,
  mismatched redundant fields, oversize, planted heads.
- `IdentityHandleOwnershipDomainService.spec.ts` and
  `OrbitDBIdentityMetadataIndex.spec.ts`: earliest wins, tie-break, every
  projection order converges, caps.
- `IdentityPublishRateLimiter.spec.ts`.
- `yarn test:integration:forged-identities` (real-transport e2e).

## Remaining non-goals

- The signer chooses the timestamp, so the holder of an identity key can
  backdate a claim.
- Minting many valid identities (sybil) cannot be prevented without an
  admission authority. The caps only bound the cost to honest nodes.
- A handle is a claim, not an authority: the identity id (public key) remains
  the authoritative reference.
- The identity-key holder can equivocate on its own genesis; a peer without the
  key cannot.

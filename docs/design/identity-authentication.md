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
  signed values, and the identity names at most 32 networks;
- the identity carries a valid admission proof (see below).

The rules are decided by `IdentityRecordAdmissionDomainService`; the gate
parses the record, computes its canonical CID, and binds each head key to the
identity it names.

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

The merger refuses a `device-authorization:` head while the genesis is not
verified (the identity has not been seen, e.g. just after a restart). The
refusal is not a loss: the heads store keeps the entries, and the repository
reads a missing head through `OrbitDBReplicatedStateRegistry.rehydrateHead`,
which merges the persisted history of that key once the genesis is known.

### (f) Admission proof (cost of minting identities)

Every identity carries a signed `admissionNonce`: the crypto library's v2
identity-admission proof of work (`ProofOfWork.identityAdmission`, domain
`pigeon-identity-admission:v2`, length-prefixed preimage over the identity id and
the sorted network ids, canonical decimal nonce). Its SHA-256 must
start with 16 zero bits (`IdentityAdmissionProof.DIFFICULTY_BITS`, a protocol
constant so every node verifies the same proof; not configurable). The proof is stateless,
so every node checks it from the record alone: the gate rejects records without
it and `IdentityCandidateValidationDomainService` rejects whole chains
containing one. It binds the work to the identity key and to the networks, so
it cannot be moved to another key or reused to join another network; changing
the network set requires mining again.

Residual risk: this raises the CPU cost per minted identity (about 2^16
SHA-256 hashes, well under a second on a laptop) but cannot stop a motivated
attacker with GPUs or many machines, and gives no per-network aggregate cap.
All nodes of a network must run the same difficulty, otherwise they disagree on
which identities are valid. Identities published before this change have no
nonce and are no longer valid.

Per-source limit (API only): `POST /identities` and `PUT /identities/{identityId}`
charge each client address against `IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE`
(default 30, `429` code `429042`) before authentication, so one source's flood
cannot spend the identity or network counters. The count is in memory and local
to the node, and it is keyed by address, not by network.

Load-adaptive difficulty: `IdentityPublisher` asks more of the proof while a
network is busy. For each network an identity enters (all networks of a
genesis, only the added ones of an update), `LocalIdentityAdmissionLoadRepository`
counts the admissions into it in a fixed 60 s window, keyed by network id only.
Up to `IdentityAdmissionDifficulty.FREE_ADMISSIONS_PER_WINDOW` (60) the floor of
16 bits applies; beyond that one bit is added per doubling of the count (60: 17,
120: 18, 240: 19, 480 and above: 20, `MAX_BITS`), and the hardest network sets
the requirement. A proof below it gets `400` with `requiredDifficultyBits`, so
the client mines again. A published version is charged after it is saved;
rejected or failed publications charge nothing. Updates that keep their
networks reuse their proof and are never asked for more. Normal use pays no
extra latency: at fewer than 60 new admissions per minute into a network, the
requirement stays at the floor. This is admission policy, not a validity rule:
the gate and chain validation still check every record at 16 bits, so validity
converges while each node prices its own API.

Network-wide load: the count includes admissions other nodes accepted, so every
node prices from the rate of the whole network, not only its own API.
`OrbitDBIdentityAdmissionObservationProjection` hands each identity version
replicating in to `IdentityAdmissionObserver`, which charges the networks the
version enters that this node hosts when it is fresh (signed within
`IdentityAdmissionDifficulty.FRESHNESS_HORIZON_MS`, 10 minutes, of this node's
clock), its cid is the canonical one for its content, and its proof meets what
this node currently asks. Stale records are skipped on their signed time before
any signature or cid work, so replaying history or bootstrapping a store costs
nothing; forged cid copies of one version cannot be counted twice, and
underpaid floods cannot raise honest prices. Networks the node does not host
are never counted, so listing up to 32 foreign networks in one record inflates
nothing here. The repository counts each identity once per network: it keeps a
sighting per `(network, identityId)` for twice the horizon, the longest any
version can stay fresh, so re-signing an identity, an update whose previous
version is not retained here, a version admitted locally and then replicated
back, or one seen again after a restart is not counted again. A network stops
counting at `SATURATING_ADMISSIONS_PER_WINDOW` (480), the first load that asks
the 20-bit cap, so counters and sightings stay bounded at 480 per hosted network
per window. Expired sightings and windows are pruned at most once per window,
and at most 1024 records wait for the serialized writer; beyond that, sightings
are dropped uncounted. Backdating does not dodge observation cheaply: the API
asks the 20-bit maximum of any admission signed outside the horizon that enters
a network. Updates that enter no network keep the floor whatever their
timestamp.

## Order and convergence

Every decision depends only on the set of admitted records: gate admission is a
pure function of the record, ordering is `(version desc, cid asc)` and handle
ownership is `(claimedAt, identityId)`. Any arrival order, replay or partition
heal yields the same owner and the same latest identity.

## Bounds

| Bound                                                 | Value                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Record size                                           | 64 KiB                                                                                                               |
| Networks per identity                                 | 32                                                                                                                   |
| Retained versions per identity                        | 64 (`MAX_CANDIDATES_PER_IDENTITY`)                                                                                   |
| Remote handle candidates                              | 32                                                                                                                   |
| Publications per identity per minute                  | `IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE`, default 30, `429` code `429040`                                          |
| Admissions per network per minute on this node        | `IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE`, default 0 (off), `429` code `429041`                           |
| Admissions per client address per minute on this node | `IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE`, default 30, `429` code `429042`                                 |
| Admission proof asked through this node's API         | 16 bits up to 60 admissions per network per minute, +1 bit per doubling, max 20; `400` with `requiredDifficultyBits` |
| Admission freshness horizon                           | 10 minutes either side of this node's clock; outside it the API asks 20 bits and observers never count it            |

The protocol admission cost is a fixed constant. Difficulty derived from
observed load or record counts would not converge as a validity rule, because
nodes see different record subsets; that is why load only raises what a node
asks through its own API (above) and never what it accepts over replication. A
network-wide admission cap is not enforced either: 16-bit proofs are cheap to
produce, so a convergent cap turns a sybil flood into a registration outage for
everyone (DoS amplification). Counting observed admissions bounds the
network-wide rate by price instead: every node raises its price as the whole
network admits more, so a flood spread over many nodes or addresses gets dearer
everywhere and nobody is refused. The per-node network quota is off by default for
the same reason: it lets a flood at one node block registrations there for the
window, where adaptive difficulty only makes them dearer. Measured proof cost
(Node `sha256`, mean nonce about 66k): 16 bits median 41 ms (p90 157 ms, max
438 ms); 18 bits median 187 ms; 20 bits median 836 ms. Headless Chromium at 16
bits: median 0.8 s at 1x CPU, 3.5 s at 4x. Raising the constant makes honest
clients, including mobile, pay the cost on every identity, and it does not
address GPU-scale attackers.

Memory-hard proofs (scrypt, argon2) are rejected as well. Verification costs
as much as one minting attempt, and every node verifies every replicated record
(the gate) and re-verifies chains of up to 256 versions on read. Measured on an
Apple M-series laptop, Node 24, one evaluation: one SHA-256 is about 1.4 µs;
`scrypt` (r=8, p=1) takes 2 ms at 1 MiB, 11 ms at 4 MiB, 23 ms at 8 MiB, 47 ms
at 16 MiB and 134 ms at 32 MiB. A 16 MiB proof is about 33,000 SHA-256
verifications, so each bogus record a cheap signer replicates would cost every
node about 47 ms, and a 256-version chain read about 12 s. Browser clients pay
more per attempt (pure JavaScript in V8: `scrypt` 26 ms at 4 MiB and 69 ms at
16 MiB; `argon2id` t=1 33 ms at 4 MiB and 140 ms at 16 MiB), several times more
on mobile. Any memory size that slows GPUs meaningfully hands that verification
cost to every honest node.

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
- `IdentityRecordAdmissionDomainService.spec.ts`,
  `IdentityRoutingDomainService.spec.ts` and
  `IdentityVersionPrecedenceDomainService.spec.ts`: the admission, routing
  eligibility and newest-version rules the gate, republish and metadata lookup
  delegate to.
- `IdentityAdmissionProof.spec.ts`, plus gate and chain validation specs that
  reject a missing proof or one that does not cover the networks.
- `IdentityPublishRateLimiter.spec.ts`.
- `IdentityAdmissionSourceRateLimiter.spec.ts` and `ClientRateWindows.spec.ts`;
  the per-source POST and PUT scenarios in `PostIdentityRoute.feature`.
- `IdentityAdmissionDifficulty.spec.ts`, `LocalIdentityAdmissionLoadRepository.spec.ts`
  and `IdentityPublisher.spec.ts` (raised requirement, charging after save,
  network-keeping updates exempt); the busy-network POST scenarios in
  `PostIdentityRoute.feature`.
- `IdentityAdmissionPricingDomainService.spec.ts`, `IdentityAdmissionObserver.spec.ts`
  and `OrbitDBIdentityAdmissionObservationProjection.spec.ts`: observed
  admissions are counted once, only when fresh, canonical and paid; the stale
  POST scenario in `PostIdentityRoute.feature`.
- `yarn test:integration:forged-identities` and
  `yarn test:e2e:real-transport:identity-admission-load` (real-transport e2e).

## Remaining non-goals

- The signer chooses the timestamp, so the holder of an identity key can
  backdate a claim.
- Minting many valid identities (sybil) is made costly by the admission proof
  but not prevented; only an admission authority could do that. Optional
  per-node registration control and blocking by the node owner are designed in
  `node-owner-registration-and-blocking.md` (not built). The caps bound
  the cost to honest nodes: replicated content, which each identity may claim
  up to its per-network quota, is bounded on every node by a per-network
  budget shared fairly by owner (`CONTENT_REPLICATION_NETWORK_BUDGET_BYTES`).
  That budget limits new fetches only, never removes bytes already held, and
  does not bound the number of registration records each identity may
  replicate, nor the per-author notification records.
- GPU-scale minting is slowed by a constant factor, not stopped. Adaptive
  difficulty and the per-source limit bind only the HTTP routes of each node.
  The network-wide count makes admissions through every honest node's API
  dearer as the whole network admits more, but an attacker publishing through
  their own node, or straight into replication, still pays only the 16-bit
  floor: their records stay valid, observers merely do not count the ones that
  paid less than they ask or are signed outside the horizon, so such a flood
  does not raise honest prices either. Observed load is advisory: there is no
  validity-level cap, and no convergent network-wide bound on minting exists
  without an admission authority.
- A flood that pays the current price raises the price for honest clients of
  that network on every node that sees it, up to 20 bits (about 0.8 s on a
  laptop, several seconds on mobile). This is the intended trade: dearer, never
  refused.
- Observation is eventual. A partition delays it, a node that joins sees the
  fresh admissions of the last horizon at once, and losing the local database
  can count an identity seen in the last horizon once more. An update whose
  previous version this node does not retain is charged for every hosted
  network it lists, once per identity and network within the sighting
  retention.
- An identity counts again on a network once its 20-minute sighting expires, so
  re-signing it keeps adding one count per network every 20 minutes. Holding a
  network at the 20-bit cap this way still takes about 480 × 20 mined
  identities.
- Counting covers every network the node hosts, so a member of one network can
  raise the price of another network both are hosted with, but only by paying
  that network's current price per count.
- Sightings beyond 1024 waiting records are dropped uncounted, so a large
  replication burst under-counts.
- The API path still counts the networks it is asked to admit, hosted or not.
  Those counts cost the full price per network and are bounded by the
  per-source limit, the saturation cap and pruning.
- A handle is a claim, not an authority: the identity id (public key) remains
  the authoritative reference.
- The identity-key holder can equivocate on its own genesis; a peer without the
  key cannot.

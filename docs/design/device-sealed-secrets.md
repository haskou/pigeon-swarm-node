# Device sealed secrets

Status: proposed for #289 (UI finding from UI #286).

## Problem

Device revocation in the causal authorization model
(`causal-device-authorization.md`) removes a credential from the authorized
set, but the revoked device keeps everything it received at pairing:

- `identityKeyPair`, delivered in `DevicePairingCompletionMaterialResource`;
- `masterKey`, from which the mailbox root read token is derived
  (`opaque-mailboxes.md`).

Two gaps follow:

1. `GET /keychains/{id}` is authenticated by the identity signature only, so a
   revoked device holding `identityKeyPair` still reads the keychain. Device
   proof is not checked against the authorization head.
2. Mailbox root rotation cannot cut off a revoked device. The new root must
   reach the remaining devices through a channel the revoked device cannot
   open. Today the root is derived from `masterKey`, which the revoked device
   holds, so no such channel exists.

## Mechanism

Per-device sealed secrets. The owner publishes, for one generation, one
sealed blob per authorized device credential. Each blob is sealed to that
device's public credential and signed by the publishing device. The node
stores the generation and serves each device only its own blob, and only if
the device is still authorized at the current head.

Nothing new is needed in cryptography. `PublicKey.encrypt` of
`@haskou/pigeon-swarm-crypto` (already a dependency) seals to an Ed25519
device credential through X25519 with HKDF-SHA256 and AES-256-GCM
(`v2.x25519-hkdf-sha256-aes-256-gcm.<eph>.<iv>.<ct>.<tag>`). The recipient
opens it with `KeyPair.decrypt` using the device key it already holds.

The sealed payload is opaque to the node. The UI decides what it contains, for
example a fresh random mailbox root and a fresh keychain key. The node never
decrypts, logs or inspects it.

Why the revoked device is cut off: a new generation carries no entry for it,
so the new secrets are never sealed to it, and `GET` refuses it at the head
check.

Why this and not identity-key rotation: identity keys cannot rotate in place
(`identityId` is the identity public key), so a fresh identity would be
required (see "Identity key compromise"). Per-device sealing gives the
revocation property with the authorization model that already exists.

## Storage

Node-local embedded database only (`EmbeddedLocalDatabase`), not OrbitDB.
Like mailbox state (`LocalMailboxRepository`), the bundle is a node-local
operational record, not replicated history.

- One document per identity, id = `identityId`.
- A replacement succeeds only if the new `generation` is strictly greater than
  the stored one. The check and the write run under a per-identity in-process
  queue, so concurrent publishes cannot both win.
- The node keeps no history. A stale or duplicated generation is rejected.

Decision for the reviewer: replicated storage (OrbitDB) would let every node
serve the bundle, at the cost of a second replicated-state surface. This design
recommends node-local storage, matching the mailbox trust model.

## Signed entries

Each entry is signed by the publishing device over this preimage, serialized
with `JSON.stringify` in exactly this key order:

```
{"purpose":"pigeon:device-sealed-secret:v1",
 "identityId":<identityId>,
 "generation":<generation>,
 "authorizationRevision":<authorizationRevision>,
 "publisherCredential":<publisher credential>,
 "recipientCredential":<recipient credential>,
 "sealedSecret":<sealedSecret>}
```

The signature lets a recipient verify that the owner's authorized device
produced the entry, without trusting the node. It also binds the entry to
the generation and the revision it was made for, so the node cannot splice
entries across generations or identities.

## Endpoints

Both endpoints use device proof only: `X-Timestamp`, `X-Device-Credential` and
`X-Device-Signature`, verified by `DeviceAuthorizationRequestAuthenticator`
against the current head. The identity signature is not used, because a
revoked device holds `identityKeyPair` and an identity-signed check would add
no protection. Recovery proof (`X-Recovery-Signature`) is rejected on these
routes. Recovery has its own flow.

Both routes check that `X-Timestamp` is within ±30 s (the shared
`SignedRequestReplayGuard.MAX_CLOCK_SKEW_MS`). `PUT` also consumes the
request signature in the replay guard. `GET` is safe and not replay-guarded.
Existing device-proof routes are unchanged, to avoid friction.

### `PUT /identity-devices/{identityId}/sealed-secrets`

Publishes one generation. The publisher is the device named by
`X-Device-Credential`.

Body:

```json
{
  "generation": 3,
  "authorizationRevision": 2,
  "entries": [
    {
      "recipientCredential": "<device credential>",
      "sealedSecret": "v2.x25519-hkdf-sha256-aes-256-gcm.…",
      "signature": "<base64 publisher signature over the preimage>"
    }
  ]
}
```

Checks, in order:

1. Freshness and device proof against the current head. Failure: `401`.
2. Replay guard on the request signature. Failure: `401`.
3. Body shape, limits: `generation` integer ≥ 1; `entries` 1..128; no duplicate
   `recipientCredential`; `sealedSecret` 1..4096 characters from
   `[A-Za-z0-9+/=.-]`; `signature` a non-empty string. Failure: `400`
   (`InvalidDeviceSealedSecretBundleError`).
4. `authorizationRevision` equals the head revision. Failure: `409`
   (`DeviceSealedSecretRevisionMismatchError`).
5. Recipients are exactly the head's authorized credentials: none missing, none
   revoked or unknown. Failure: `409`
   (`DeviceSealedSecretRecipientsMismatchError`).
6. Every entry signature verifies under the publisher credential. Failure:
   `409` (`InvalidDeviceSealedSecretSignatureError`).
7. `generation` is strictly greater than the stored generation. Failure: `409`
   (`DeviceSealedSecretGenerationStaleError`).

Success: `200` with
`{ identityId, generation, authorizationRevision }`.

### `GET /identity-devices/{identityId}/sealed-secrets`

Returns the caller's own entry of the stored generation.

1. Freshness and device proof against the current head. A revoked or unknown
   credential gets `401`.
2. No stored bundle, or no entry for the caller: `404`
   (`DeviceSealedSecretNotFoundError`). A device added after the last publish
   has no entry until the owner republishes.

Success: `200` with
`{ identityId, generation, authorizationRevision, publisherCredential,
recipientCredential, sealedSecret, signature }`.

The response never includes other devices' entries, the authorized-device
list, the head commitments, or any decrypted material.

## Residual races and staleness

- A transition can land between the head read in step 1 and the store in
  step 7. A revoked device is still refused on `GET` by the head check, so
  this is safe. A device enrolled in the gap gets `404` until republish.
- After a revocation, remaining devices keep reading the previous generation.
  That is intentional and is what makes the change zero-friction. The revoked
  device was already a recipient of that generation and holds its secrets. The
  revocation fix comes from the new generation, which the owner must publish.
  The node cannot force that.

## What a compromised device can still do

A device that is revoked, or compromised with a copied `masterKey` and
`identityKeyPair`, is limited as follows.

After this change:

- It cannot read a generation it was not a recipient of, and cannot read any
  generation after revocation. `GET` refuses it at the head check, and new
  generations are not sealed to it.
- It keeps every secret it already received. That covers previous mailbox
  roots, previous keychain keys and any `masterKey`-derived material. Only
  the UI rotating those secrets and re-encrypting content removes that
  access. This PR does not do it.

Not fixed by this PR, because they are identity-signed:

- `GET /keychains/{id}` is identity-signed only. A holder of `identityKeyPair`
  reads keychain versions with no head check. The gap in the finding stands
  until the decision below is taken.
- `POST /keychains` and `PUT /identities/{id}` are identity-signed only. A
  holder of `identityKeyPair` can publish keychain versions, which other
  devices verify against the identity public key, and can change identity
  publication data, including `mailboxHome` and the network list.
- A copied `identityKeyPair` cannot sign device transitions. Those are signed by
  authorized devices or the recovery authority, so device authorization itself
  stays intact.

Identity-key full rotation: does not exist in the node today. `identityId`
equals the identity public key, and `previousIdentityExternalIdentifier`
chains publication versions only. The genesis commitment and recovery
authority are pinned. A compromised identity key therefore means a new
identity (new `identityId`, new handle, re-establishing contacts). It cannot
be rotated in place.

## Recommended decisions (not in this PR)

1. Stop delivering `identityKeyPair` to enrolled devices. If it is not
   delivered, a revoked device cannot sign identity-scoped writes after
   revocation. Requires a pairing change in the UI.
2. Require device proof on `GET /keychains/{id}` and on identity-signed
   writes (`POST /keychains`, `PUT /identities/{id}`), checked against the head.
   This closes the finding fully. Recommended as a follow-up PR once the UI
   sends device proof on those calls.
3. Keep node storage node-local (this PR).
4. Document that a new identity is the only identity-key rotation path today.

## UI follow-up contract

1. On each new generation, the publisher (an authorized device) seals a fresh
   random payload per credential in the head, using
   `PublicKey.encrypt(payload)` on `DeviceCredential` (the head credential
   string). The payload carries the new mailbox root and the new keychain key,
   not anything derived from `masterKey`.
2. Sign each entry over the preimage above with the publisher device key. Send
   `PUT /identity-devices/{identityId}/sealed-secrets` with the current
   `authorizationRevision` from the checkpoint. On `409` revision mismatch,
   refetch the checkpoint and rebuild.
3. A remaining device fetches `GET /identity-devices/{identityId}/sealed-secrets`
   with device proof, verifies the entry signature against
   `publisherCredential` and the preimage, and keeps the highest generation it
   has seen. It opens the sealed payload with `KeyPair.decrypt`.
4. After revocation, the owner publishes the next generation, then runs the
   mailbox readers procedure (`opaque-mailboxes.md`), and rotates the keychain
   key and re-encrypts keychain content.
5. Never log the sealed payload, the decrypted payload, topics or addresses.

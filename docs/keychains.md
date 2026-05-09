# Keychains

Last updated: 2026-05-09.

Keychains are the encrypted, portable user secret store. They are required
before conversations can be truly usable, because a conversation is not only
metadata between two identities: it also needs client-owned encrypted key
material for future messages.

## Principles

- Nodes are not trusted with plaintext secrets.
- Passwords are never sent to nodes as the final design.
- The client unlocks/decrypts keychain data locally.
- Nodes may store, index, pin, announce and synchronize encrypted keychain
  documents.
- Keychain documents are immutable, versioned, signed and content-addressed.
- MongoDB stores local metadata and lookup indexes, not plaintext keychain
  content.
- IPFS/Helia stores encrypted keychain documents.
- DHT/PubSub can announce latest candidate external identifiers.

## Domain Shape

Create a new bounded context:

```text
src/contexts/keychains/
```

Suggested domain objects:

- `Keychain`
  - aggregate root
  - owned by `IdentityId`
  - has `version`
  - has `previousKeychainExternalIdentifier`
  - has `encryptedPayload`
  - has `signature`
- `EncryptedKeychainPayload`
  - opaque ciphertext for the node
- `KeychainExternalIdentifier`
  - infrastructure-facing reference name at the domain edge, same idea as
    `IdentityExternalIdentifier`
- `KeychainVersion`
- `KeychainCandidateValidationDomainService`
- `KeychainSignatureDomainService`

The node must validate owner, version chain and signature. It must not inspect
the decrypted payload.

## Encrypted Payload

The plaintext payload is client-side only. A possible shape after decryption:

```json
{
  "contacts": [
    {
      "identityId": "...",
      "alias": "@hasko"
    }
  ],
  "conversationKeys": [
    {
      "conversationId": "one-to-one:...",
      "participants": ["...", "..."],
      "key": "..."
    }
  ],
  "devices": [
    {
      "deviceId": "...",
      "publicKey": "..."
    }
  ]
}
```

This payload is not a server contract. The server contract is the encrypted
document around it.

## API Direction

The server should not receive the keychain password. The API should use signed
requests:

```http
POST /keychains/current
X-Identity-Id: <identityId>
X-Timestamp: <timestamp>
X-Nonce: <nonce>
X-Signature: <signature>
Content-Type: application/json
```

Body:

```json
{
  "version": 1,
  "previousKeychainExternalIdentifier": null,
  "encryptedPayload": "...",
  "signature": "..."
}
```

The request signature authenticates the HTTP operation. The keychain signature
authenticates the immutable keychain document.

## Conversation Creation

`POST /conversations/1to1` should happen after the client has created a
conversation key locally and published a keychain version containing it.

Request:

```http
POST /conversations/1to1
X-Identity-Id: <ownerIdentityId>
X-Timestamp: <timestamp>
X-Nonce: <nonce>
X-Signature: <signature>
Content-Type: application/json
```

Body:

```json
{
  "participantIdentityId": "...",
  "keychainExternalIdentifier": "..."
}
```

The node creates conversation metadata only after it can validate:

- request signature
- owner identity
- participant identity format/existence when available
- keychain candidate belongs to the owner identity
- keychain candidate version/signature chain

## First PR Scope

Implement the minimal keychain foundation:

1. Domain aggregate and value objects.
2. Keychain signed document mapper for IPFS.
3. MongoDB metadata repository.
4. Repository save/find candidates by owner identity.
5. Validation service for owner/version/signature chain.
6. Unit tests for domain, mapper, repository and validation.
7. Update docs/API plan for signed request auth.

Do not implement conversation creation in the first keychain PR.

## Later PRs

- Signed HTTP request verifier middleware/service.
- `PUT /keychains/current`.
- `GET /keychains/current`.
- `POST /conversations/1to1` using `participantIdentityId` and
  `keychainExternalIdentifier`.
- Message send/read endpoints using encrypted payloads.

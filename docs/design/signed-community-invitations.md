# Signed community invitations

Status: proposed, not implemented. Design for #545 and #550, tied to #543 and
#541, and for the client fold in haskou/pigeon-swarm-ui#433. It replaces
invite-link tokens and direct invitation requests with one signed invitation
operation in a single cutover. Invitations issued before the cutover are
invalid.

## Problem

Verified on node `origin/main` 4ac225d6 and UI `origin/main` dc951247.

- **The bearer token is public data.** An invite link is the token
  `CommitmentId.communityInviteToken([communityId, creatorIdentityId, nonce,
maxUses, expiresAt])`. The `community_invite` record in the replicated
  `requests` store uses the token as its id and lists every field it commits
  to. Every `community_invite_use` record carries the token. As a result,
  every node of the network and anyone who replicates its `requests` store
  can read every live token and join with it (#550). The create response
  returns the token, and the preview and accept endpoints take it as a path
  parameter. The UI puts it in the link path (`/invite/community/<token>`),
  so the UI host's access logs, browser history and `Referer` headers see it.
- **The operations endpoint does not leak the token.**
  `GET /communities/{communityId}/operations` returns the stored operations
  verbatim to any member. An `invite_link` join carries only
  `CommunityInviteReference.of(token)`, a domain-separated SHA-256 of the
  token, and the policy refuses a raw token as a reference
  (`CommunityOperationMutationPolicy.isReferenceOf`). The UI writes the same
  reference, not the token, into the `invite_link_created` moderation-log
  target. On `origin/main`, the claim that members read tokens through this
  endpoint does not hold. The real leak is the replicated `requests` records
  above, and those reach every node operator, not only members.
- **The same endpoint does expose moderators.** `member_banned` and
  `member_kicked` operations name the moderator as their author, and every
  member can read them. The moderation log limits that information to
  `manage_members`. The swagger description of the endpoint already says
  that hiding the author needs a protocol change.
- **The same endpoint scans the whole community.** Every page request reads
  and sorts every operation record id of the community
  (`OrbitDBCommunityRepository.findOperations`). It decodes only the page.
- **Replicas do not enforce the limits.**
  - Only the accepting node's API checks `maxUses`. The policy's own comment
    explains why: concurrent joins have no single order, and a cap on the
    folded history would let a token holder evict members with a backdated
    join.
  - Expiry is checked against the `createdAt` that the joiner chose.
  - Join references are checked against the `requests` store when the
    operation is admitted (`assertJoinReference`). They are not checked in
    the fold.
  - The UI fold (`CommunityAuthority.JOIN_METHODS`) accepts a self-signed
    `invitation` or `invite_link` join whatever its reference (#433).
- **Invitations cannot be revoked** (#545).
- **Direct invitations have the same gaps.** A direct invitation is a pending
  `community_membership_request` of type `invitation`, created by a
  `create_invites` holder and judged against the current state. The invitee
  accepts it and then self-joins with method `invitation`, referencing it.

## Goals

1. Any member whose roles grant `create_invites` can issue an invitation.
   The issuer signs it, and it carries `maxUses` and an optional `expiresAt`.
2. Every replica and every client fold checks each join made through an
   invitation for:
   - the issuer's signature;
   - the issuer's `create_invites` at the invitation's position;
   - that the issuer kept that authority up to the join;
   - revocation;
   - expiry;
   - the use count;
   - the joiner's consent;
   - possession of the link.

   All of these are decided from signed operations alone.

3. The issuer or an admin can revoke an invitation. The revocation is
   replicated and enforced when joins are admitted.
4. The link secret is never in any replicated record, any API request or
   response, any node log or the UI host's logs. A node only ever sees a
   public key and proofs of possession (#550).
5. No invitation rule evicts an admitted member.
6. The link stays a single copy-paste link.

Non-goals:

- hiding the moderator of a ban or kick;
- the operations endpoint's scan;
- join requests (`approval`);
- direct adds (`added`);
- auto-join (`automatic`).

## Overview

1. The issuer's client generates a 32-byte secret, derives an Ed25519
   invitation key from it, and signs an `invitation_created` operation that
   carries the public key, `maxUses` and `expiresAt`.
2. The link is `https://<ui-origin>/invite/community#c=<communityId>&k=<secret>`.
3. The joiner's client derives the key from the link and previews the
   invitation by its public key. It then signs a claim containing:
   - a possession proof, signed by the invitation key;
   - a consent proof, signed by the joiner's identity key.

   The joiner's node stores the claim, which carries no authority.

4. The client of an online member holding `manage_members` (an _admitter_)
   sees the claim and checks it. It then signs the
   `member_joined{method: 'invitation'}` operation that embeds both proofs,
   and commits the MLS add right away. Only a manager may commit an MLS add
   (UI `docs/mls-group-encryption.md`, "Who commits"), so a joiner already
   needed a manager online before they could read anything.
5. Every replica's ledger and every client fold judges the admission against
   the community folded from the admission's causal past.

The admitter is what makes the limits enforceable. A link holder who is not a
manager never chooses where a join sits in the history, so they cannot
backdate past a revocation, an expiry or earlier uses. A manager can already
add anyone with `added`, so admitting gives a manager no new power.

## Data model

### `invitation_created` operation

The author must be a member whose roles grant `create_invites`. The ledger
checks this against the community folded at the operation's parents, and the
fold checks it again against the linear state, as for every operation.

| Argument        | Type    | Rule                                                                                                                                                   |
| --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invitationKey` | string  | Link invitations only. Raw Ed25519 public key in canonical base64url (43 characters). Refused unless strict crypto decoding accepts it as a valid key. |
| `invitee`       | string  | Direct invitations only. The one identity id that may be admitted.                                                                                     |
| `maxUses`       | integer | `>= 1`; must be `1` when `invitee` is set.                                                                                                             |
| `expiresAt`     | integer | Optional. Unix milliseconds, greater than the operation's `createdAt`.                                                                                 |

- Exactly one of `invitationKey` and `invitee` is present.
- The **invitation id** is the operation digest (`getHash()`), the
  `<digest>` in `community:<communityId>:op:<digest>`.
- The issuer's identity signature over the operation id
  (`CommunityOperationSignature`) commits to every argument, so it is the
  invitation's signature. The operation's `PublicMutationProof` binds it to a
  device that is authorized at its `authorizationRevision`.
- An `invitation_created` whose `invitationKey` equals the key of an
  invitation in its causal past is refused.

### `invitation_revoked` operation

- The only argument is `invitationId`.
- The invitation must be in the revocation's causal past.
- The author must be one of:
  - the invitation's issuer, while a member;
  - a member whose roles grant `manage_members` at the revocation's parents.
- Revocation is permanent. A second revocation of the same invitation is
  refused.

### `member_joined` with method `invitation`

| Argument       | Rule                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `identityId`   | The joiner.                                                                                                            |
| `method`       | `'invitation'`. The methods `invite_link` and the self-signed `invitation` are removed.                                |
| `invitationId` | Digest of an `invitation_created` operation in the join's causal past.                                                 |
| `possession`   | Required for link invitations and absent for direct invitations. Signed by the invitation key (see [Proofs](#proofs)). |
| `consent`      | Always required. Signed by the joiner's identity key.                                                                  |

The author is the admitter: a member whose roles grant `manage_members`. The
joiner does not sign this operation; its consent is the embedded proof. The
arguments are two ids and two signatures, well within
`CommunityOperationLimits.MAX_ARGUMENT_BYTES`.

### `community_invitation_claim` record

This record lives in the `requests` store, with `requiresFrontier: true`.

- Fields: `communityId`, `id`, `identityId`, `invitationId`, `consent`,
  `possession?`.
- The id is `invitation-claim:<invitationId>:<identityId>`.
- The author is `identityId`, signed by one of its devices.

It asks for admission and carries no authority. Joins never reference it, so
no admission depends on which records a node holds. A node stores a claim
only when all of these hold:

- the invitation is in the community folded at the claim's frontier;
- the proofs verify;
- the invitation is live at that frontier (see
  [Admission](#admission-algorithm));
- the joiner is neither banned nor a member at that frontier.

The claim does not check expiry, because there is no deterministic clock to
check it against. Expiry is enforced at admission.

## Link format

`https://<ui-origin>/invite/community#c=<communityId>&k=<secret>`

- `secret` is 32 bytes from the crypto CSPRNG, encoded as canonical base64url
  (43 characters).
- Both values sit in the fragment, which browsers never send to the UI host.
  The UI reads the fragment once and removes it from the address bar
  (`history.replaceState`). It keeps the secret in session-scoped storage
  only until the claim is signed, which may happen after sign-in or identity
  creation.
- The node never receives the secret. The preview uses the derived public
  key, and the claim carries signatures.
- `communityId` scopes the key lookup. It reveals nothing to anyone who does
  not already hold the secret.

## Proofs

Both proofs sign the same canonical body,
`CanonicalJson({communityId, identityId, invitationId, networkId})`, under
different domains:

| Proof        | Preimage                                                 | Signing key                              | Verified against                 |
| ------------ | -------------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| `possession` | `pigeon:community-invitation-possession:v1\n` + the body | invitation key (derived from the secret) | the invitation's `invitationKey` |
| `consent`    | `pigeon:community-invitation-consent:v1\n` + the body    | the joiner's identity key                | `identityId`                     |

- Signatures are Ed25519 with strict verification (`PublicKey.isValidSignature`)
  and canonical base64url encoding (86 characters).
- A possession proof read from an operation can admit only the same identity,
  under the same invitation, community and network. It cannot be replayed
  for anyone else, and one identity counts once per invitation.
- The two domains keep a consent signature from being read as any other
  statement made with the identity key, which also signs operations and
  records. The invitation key never signs anything except possession.
- The proofs sign fields, not the admission operation, because the joiner
  signs before the admitter has chosen the position.

### Cryptography: what exists and what is missing

The following exist in `@haskou/pigeon-swarm-crypto` 7.0.0 and are reused:

- `PrivateKey.fromSeed`;
- `PublicKey.fromRaw` and `PublicKey.isValidSignature` (strict);
- `CanonicalJson`;
- `StateDigest`;
- `CommunityOperationSignature`;
- `PublicMutationSignature`.

7.0.0 has no domain-separated derivation from a secret to an Ed25519 key:
`hkdfSha256` and `CanonicalBase64Url` are internal. It also has no
invitation proof classes. Proposed crypto change, a major version (8.0.0),
because it removes the token helpers:

1. `CommunityInvitationKey`:
   - `generate()` returns `{secret, key}`;
   - `fromSecret(secret)` strictly decodes 32 canonical base64url bytes and
     sets
     `seed = HKDF-SHA256(ikm = secret, salt = empty, info = "pigeon:community-invitation-key:v1", L = 32)`,
     then derives the key with `PrivateKey.fromSeed(seed)`;
   - `publicKey()` returns the canonical base64url raw key;
   - `parsePublicKey(text)` validates strictly.
2. `CommunityInvitationPossession` and `CommunityInvitationConsent`. Each
   provides `contentOf(fields)`, `sign(fields, key)` and
   `verify(fields, signature, publicKeyOrIdentityId)`, using the domains
   above.
3. Removal of `CommitmentId.communityInviteToken` and
   `CommunityInviteReference`.
4. Vectors that the node and UI specs both consume:
   - secret → seed → public key;
   - fields → each preimage → each signature.

   Negative vectors cover a non-canonical secret, a small-order or
   non-canonical key, a signature under the other domain, and a swapped
   identity, invitation or network.

## Admission algorithm

Definitions:

- `closure(O)` is the set of `O`'s parents and all their ancestors.
- `past(O)` is the community folded from `closure(O)`. The ledger already
  judges every operation against it.
- An operation `D` **cuts** the issuing authority of `X` when `X` is a member
  with `create_invites` in `past(D)` and is not one once `D` is applied to
  `past(D)`. Examples are a kick, a ban, `X` leaving, a role update or
  deletion, and a change to `X`'s roles. This is decided once, from `D` and
  its causal past, so every replica decides it the same way.

Invitation `I` is **live** in a set of operations `S` when all of these hold:

1. `I` is in `S`, and its author held `create_invites` in `past(I)`.
2. No `invitation_revoked` of `I` is in `S`.
3. No operation in `S` outside `closure(I)` cuts the issuer of `I`. Once the
   issuer loses `create_invites` or membership after issuing, or
   concurrently with issuing, the invitation is dead for every later
   admission. That stays true even if the issuer is promoted again.
4. `uses(I, S) < maxUses`. Here `uses(I, S)` is the number of distinct
   joiners that have an admission under `I` in `S` that is valid by these
   rules at its own causal past. Admissions that the linear fold later skips
   still count, which errs on the side of fewer uses.

An admission `A` (`member_joined`, method `invitation`) is **valid** when all
of these hold:

1. `A`'s author holds `manage_members` in `past(A)`.
2. `invitationId` names an `invitation_created` of the same community that
   is live in `closure(A)`.
3. For a direct invitation, `identityId` equals `invitee` and `possession` is
   absent. For a link invitation, `possession` verifies against
   `invitationKey`.
4. `consent` verifies against `identityId`.
5. `closure(A)` holds no valid admission of `identityId` under the same
   invitation. Each identity can use an invitation once, even after leaving
   or being kicked.
6. If `expiresAt` is set, `A.createdAt <= expiresAt`.
7. `identityId` is neither banned nor a member in `past(A)`.

Where each check runs:

- **Node ledger** (`CommunityOperationLedger.admit`): it refuses an invalid
  admission, so the admission is never stored. `assertJoinReference` and its
  `requests` store queries are removed, so admission depends only on
  operations.
- **Fold, node and client**: rules 1 and 7 are checked again against the
  linear state, as for every operation, so a joiner banned concurrently stays
  out. Rules 2 to 6 are facts of `A`'s causal past and are never re-evaluated
  against the linear state, so a revocation, other uses or the passage of
  time can never skip an admission that was valid at its position. There is
  no eviction rule. The client fold evaluates rules 2 to 6 itself, so a
  malicious node cannot serve a forged admission (#433).
- **Admitter's client**: it admits a claim only if the claim is valid at its
  own current frontier and `now <= expiresAt`. It signs with
  `parents = current frontier` and `createdAt = now`, then commits the MLS
  add. Two admitters may admit the same joiner concurrently; the identity
  counts once, and the fold skips the second join because the joiner is
  already a member.

The fold already folds `closureOf(parents)` for whole-value rebases
(`baseOf`, `pasts`), and the ledger caches states of the past. The
implementation reuses both. Rules 2 to 5 need only ancestry tests on a few
operations plus the cut set of each operation, which is computed at
admission. An admission does not need a full fold of its past.

## Revocation

- The issuer, or a member with `manage_members`, signs
  `invitation_revoked{invitationId}`. These are the same people who may
  admit, or decline to admit, under the invitation.
- Once a revocation is in an admission's causal past, every replica and
  client fold refuses that admission.
- A node refuses claims whose frontier contains the revocation.
- Admissions that came before the revocation or concurrently with it stand.
- An honest admitter's client never admits under an invitation whose
  revocation it holds.
- The UI lists the community's invitations from the operations: issuer,
  uses, expiry and whether each is live. The issuer and managers see a
  revoke action.

## Usage counting and the guarantee

These statements hold for honest admitters:

1. **Causally ordered admissions are exact.** If every admission under `I`
   has the earlier ones in its causal past, at most `maxUses` identities
   ever join under `I`. Connected admitters always build on their full
   frontier, so they are causally ordered.
2. **Concurrent admissions can overshoot, and nothing is evicted.** This
   happens during a partition, or between admitting devices that have not
   synced. Each admission sees fewer than `maxUses` uses in its own past, so
   `k` mutually concurrent branches admit at most `k * maxUses` identities.
   An exact limit would need either a total order (consensus) or an eviction
   rule. #550 rules out eviction, and eviction would also undo honest joins
   and churn MLS after every heal.
3. **Revocation holds** for every admission that has the revocation in its
   past.
4. **Expiry follows the admitter's clock**, through the signed `createdAt`.
5. **A link holder who is not a manager cannot:**
   - exceed the limit;
   - bypass revocation or expiry;
   - choose a position in the history;
   - evict anyone;
   - enroll an identity without that identity's consent.

   The most they can do is submit one claim per identity and invitation, and
   join while the invitation is live.

6. **A malicious manager can ignore any of these limits.** They can already
   add anyone with `added`, so this is no new power.

## Backdating (#543) and compromise caps (#541)

- **Invitations and their uses stop being scoped records.** The "invites"
  entry in the scoped-record row of `causal-device-authorization.md` goes
  away. A claim carries no authority, so #543's backdating of scoped-record
  frontiers no longer applies to invitations.
- **The issuer side is bounded without eviction.** An issuer who is removed
  or demoted can still sign an `invitation_created` whose parents predate the
  removal. Rule 3 of liveness makes that invitation dead for every admission
  whose past contains the removal, which includes every honest admitter's
  admission once the removal reaches it.
- **The admitter side is not bounded by this design.** A manager who is
  removed or demoted later can sign an admission whose parents predate the
  removal. The linear fold orders it before the removal and applies it. The
  same holds today for `added` and for every operation of a removed member:
  operations have the same backdating problem as #543's scoped records.
  - The bound would be "a cut wins over concurrent acts": an operation by
    `X` that needs a permission is void if a concurrent operation cuts that
    permission.
  - That rule voids the removed authority's own concurrent acts, whatever
    the digest order. It is an eviction of those acts, decided by whoever
    made the cut.
  - It applies to every operation that needs a permission, not just to
    invitations, so #543 should decide it. This design takes whatever #543
    decides and adds no special case.
- **Device compromise (#541).**
  - The device proofs of issuers, admitters and revokers are judged at their
    `authorizationRevision`, subject to compromise caps (causal device
    authorization).
  - Until #541 is fixed, a cap that a recovery dropped on some nodes lets a
    stolen device's backdated invitation, admission or revocation pass on
    those nodes and fail elsewhere, so replicas can disagree about
    membership.
  - This design adds no device-level rule. It inherits the #541 guarantee
    once #541 is fixed.
  - The client fold verifies identity signatures. The node checks device
    proofs, as it already does.

## What the operations endpoint exposes after the change

`GET /communities/{communityId}/operations` still returns the operations
verbatim to every member:

| Operation                        | Visible to every member                                                   |
| -------------------------------- | ------------------------------------------------------------------------- |
| `invitation_created`             | issuer, `invitationKey` or `invitee`, `maxUses`, `expiresAt`, `createdAt` |
| `member_joined` (`invitation`)   | admitter, joiner, `invitationId`, `possession`, `consent`                 |
| `invitation_revoked`             | revoker, `invitationId`                                                   |
| `member_banned`, `member_kicked` | moderator (unchanged)                                                     |

- No secret or bearer token appears in any operation, record, response or
  log.
- The public key and the proofs let members verify joins. They cannot be
  used to claim the invitation.
- **New disclosure to members:** members learn who issued which invitation,
  who admitted whom and who revoked. Direct invitations also reveal the
  invitee, which today only nodes see, through the `requests` store. The
  client fold must verify these authors' permissions, so hiding them needs a
  protocol change, as it does for kicks.
- The endpoint's scan is unchanged. Preview, claim listing and the
  invitations-for-me lookup use indexes and never scan.

## Threats

| Threat                                                    | Actor                                   | Outcome                                                                           | Mechanism                                                                               |
| --------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Read the link secret from replicated data, an API or logs | node operator, member, network observer | prevented                                                                         | only the public key and proofs leave the joiner's client; the secret is in the fragment |
| Read the secret from the UI host or `Referer`             | UI host operator                        | prevented                                                                         | browsers do not send fragments; the UI removes the fragment from the address bar        |
| Join without the link                                     | outsider                                | prevented                                                                         | possession proof                                                                        |
| Replay a possession proof for another identity            | anyone who reads operations or claims   | prevented                                                                         | the proof binds identity, invitation, community and network                             |
| Enroll an identity without its consent                    | link holder                             | prevented                                                                         | consent proof                                                                           |
| Join after revocation or expiry, or exceed `maxUses`      | link holder                             | prevented                                                                         | the admitter chooses position and `createdAt`; the checks run at the admission's past   |
| Overshoot `maxUses` through concurrent admissions         | honest admitters across a partition     | possible, at most `k * maxUses`                                                   | stated limit; no eviction                                                               |
| Evict a member with a backdated join                      | link holder                             | prevented                                                                         | link holders sign no operations; there is no eviction rule                              |
| Forge an invitation                                       | member without `create_invites`         | prevented                                                                         | permission checked at `past(I)` and in the fold                                         |
| Backdate an invitation after removal or demotion          | former issuer                           | refused once the removal is in the admission's past                               | liveness rule 3                                                                         |
| Backdate an admission after removal or demotion           | former manager                          | **not prevented**                                                                 | residual, same as `added` today; #543                                                   |
| Issue, admit or revoke with a stolen device               | device thief                            | bounded by `compromisedSince`; replicas can diverge until #541                    | causal device authorization; #541                                                       |
| Serve forged or over-limit admissions to a client         | malicious node                          | prevented                                                                         | the client fold verifies proofs and rules 2 to 6                                        |
| Ignore limits or revocation                               | malicious manager                       | not prevented, no new power                                                       | `added` already exists                                                                  |
| Flood claims                                              | link holder with many identities        | bounded by the cost of creating identities; one claim per identity and invitation | residual                                                                                |
| Publish a weak (small-order) invitation key               | malicious issuer                        | refused                                                                           | strict key decoding; an issuer could publish the secret anyway                          |
| Link leaked by its holder (chat, screenshot)              | whoever sees the link                   | can join while the invitation is live                                             | revocation, expiry and `maxUses`; inherent to bearer links                              |

## Changes at implementation

The node changes (#545, #550) come in red-first slices. Each slice is a
complete cutover.

- **Operations and policies.**
  - Add `invitation_created` and `invitation_revoked`, and `member_joined`
    with method `invitation`, with the rules above in the applier, the
    ledger and the fold.
  - Add the `community_invitation_claim` policy.
  - Remove the `invite_link` method and the old self-signed `invitation`
    method.
  - Remove `assertJoinReference`, the `community_invite` and
    `community_invite_use` scopes, `CommunityInvite*`, the `invitation` type
    of membership request, and `CommunityInviteToken`.
  - Rename the moderation action `invite_link_created` to
    `invitation_created`, add `invitation_revoked`, and make both target the
    invitation id.
- **Endpoints.**
  - Add:
    - `POST /communities/{communityId}/invitations`: a signed
      `invitation_created`; link and direct invitations.
    - `GET /communities/{communityId}/invitations`: members only.
    - `GET /communities/{communityId}/invitation-keys/{invitationKey}`: the
      unsigned preview.
    - `POST /communities/{communityId}/invitations/{invitationId}/claims`.
    - `GET /communities/{communityId}/invitation-claims`: `manage_members`
      only.
    - `POST /communities/{communityId}/invitations/{invitationId}/admissions`.
    - `POST /communities/{communityId}/invitations/{invitationId}/revocation`.
    - `GET /communities/invitations`: direct invitations addressed to the
      caller.
  - Remove:
    - `POST /communities/{communityId}/invites`;
    - `GET /communities/invites/{inviteToken}`;
    - `POST /communities/invites/{inviteToken}/accept`;
    - `POST /communities/{communityId}/members`.
- **Docs.** Update:
  - `docs/api.md`;
  - `docs/pubsub-sync-protocol.md`, for the operations and the claim scope;
  - the swagger description;
  - the invites line of `node-owner-registration-and-blocking.md`;
  - the table row and the #543 residual of `causal-device-authorization.md`.
- **Tests.**
  - Unit specs for every rule and negative case.
  - Shared crypto vectors.
  - A forged-operations integration test.
  - Real-transport end-to-end tests for backdating, partition and heal,
    revocation, and restart.
- **Privacy.** No log line contains a secret, key, invitation id, identity
  id, community id or address.

## UI changes (#433)

- **`CommunityAuthority`.** `JOIN_METHODS` drops `invite_link`. The
  `invitation` method becomes `{permission: 'manage_members', selfJoin:
false}`, and `mayJoin` applies rules 2 to 6 at the join's causal past,
  using the same vectors as the node.
- **`CommunityOperationFold`.** Add the new operations, the cut sets, and the
  evaluation at each admission's causal past (a port of the node's `pasts`).
- **Creating a link.** Generate the secret, sign `invitation_created`, and
  build the fragment link. The secret is never sent.
- **Opening a link.** Parse and strip the fragment, preview by key, sign the
  claim, then wait for admission and the MLS welcome. The UI shows that it is
  waiting for a community manager.
- **Admitter.** A manager's client admits pending claims automatically, in
  the same loop that reconciles MLS adds.
- **Invitation list and revocation.** Add both for issuers and managers.
- **Direct invitations.** Notifications come from `GET
/communities/invitations`, and accepting one signs a consent-only claim.
- **Moderation log.** Entries name the invitation id.
- **Removed code.** Remove `CommitmentId.communityInviteToken`,
  `CommunityInviteReference` and the `/invite/community/<token>` route, and
  update to crypto 8.0.0.
- **Docs.** Update `docs/mls-group-encryption.md` where it names who adds
  newcomers.

## Cutover

- Every invitation issued before the cutover is invalid. Nodes refuse its
  scopes and methods.
- The ledger replays stored operations on every start. A stored
  `member_joined` with the removed methods would therefore be refused, and
  so would every descendant, because one of its ancestors is never admitted.
- The cutover therefore resets community state on the network rather than
  keeping a path that accepts the old methods. The same follows from the
  strict decoder refusing version 1 public-mutation proofs
  (`causal-device-authorization.md`).

## Residuals

- A removed or demoted manager can backdate admissions (#543). This is the
  same as for `added` and every other operation.
- Concurrent admissions overshoot `maxUses` by at most a factor of the
  number of concurrent branches, and are never repaired.
- Expiry follows the admitter's clock.
- Stolen-device acts can split replicas until #541 is fixed.
- Members see the issuer, admitter, revoker and invitee of invitations.
- A joiner needs an online manager. Today a joiner already needs one for the
  MLS welcome, but now the joiner does not appear in the member list until a
  manager admits them.
- Every admission counts toward its admitter's per-author operation quota
  (`MAX_OPERATIONS_PER_AUTHOR`, 1000). The founder is exempt.
- Claims cannot be withdrawn, and joiners who create many identities can
  flood claims.
- The operations endpoint still scans the whole community per page, and
  `member_banned` and `member_kicked` still name the moderator.

## Open questions

1. Admitter permission: `manage_members` only, as recommended so that one
   online party also commits the MLS add, or also `create_invites` or
   `approve_members`.
2. Revoker set: the issuer and `manage_members`, as proposed and following
   "issuer or an admin". #550 says "creator or `create_invites` holders",
   which would let any issuer revoke anyone's invitations.
3. Direct invitations: keep them as an invitation with an `invitee`
   argument, which members can see, or drop them in favour of single-use
   links sent privately.
4. Whether `expiresAt` should be required, with a maximum lifetime.
5. The crypto 8.0.0 changes above: the key derivation, the proof classes,
   the removals and the vectors.
6. Whether #543 adopts "a cut wins over concurrent acts" for all operations.
7. Confirmation that the cutover resets community state.

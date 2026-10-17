# Signed community invitations

Status: proposed, not implemented. Design for #545 and #550, tied to #543 and
#541, and for the client fold in haskou/pigeon-swarm-ui#433. It replaces
invite-link tokens and direct invitation requests with one signed invitation
link in a single cutover. Invitations issued before the cutover are invalid.

## Problem

Verified on node `origin/main` 4ac225d6 and UI `origin/main` dc951247.

- **The bearer token is in replicated records.** An invite link is the token
  `CommitmentId.communityInviteToken([communityId, creator, nonce, maxUses, expiresAt])`.
  - The `community_invite` record in the replicated `requests` store uses the
    token as its id and lists every field it commits to.
  - Every `community_invite_use` record carries the token.

  So every node of the network, and anyone who replicates its `requests`
  store, can read every live token and join with it (#550). The create
  response also returns the token, and the preview and accept endpoints take
  it as a path parameter. The UI puts it in the link path
  (`/invite/community/<token>`), so the UI host's access logs, browser history
  and `Referer` headers see it.

- **The operations endpoint does not leak the token.**
  `GET /communities/{communityId}/operations` returns the stored operations
  verbatim to any member. An `invite_link` join carries only
  `CommunityInviteReference.of(token)`, a domain-separated SHA-256 of the
  token, and the policy refuses a raw token as a reference
  (`CommunityOperationMutationPolicy.isReferenceOf`). The UI writes the same
  reference, not the token, into the `invite_link_created` moderation-log
  target. The real leak is the replicated `requests` records above, and those
  reach every node operator, not only members.
- **The same endpoint exposes moderators.** `member_banned` and
  `member_kicked` operations name the moderator as their author, and every
  member can read them. The moderation log limits that information to
  `manage_members`.
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
   The issuer signs it. It carries `maxUses`, at most 100, and an expiry of at
   most 30 days, and it can be bound to one identity.
2. Every replica and every client fold checks each join made through an
   invitation for:
   - the issuer's signature;
   - the issuer's `create_invites` at the invitation's position;
   - that the issuer kept that authority up to the join;
   - revocation;
   - expiry;
   - the use count;
   - the joiner's consent;
   - possession of the link;
   - canonical identity ids.

   All of these are decided from signed operations alone.

3. The issuer, or a member whose roles grant `manage_members`, can revoke an
   invitation. Revocation is replicated and enforced when joins are admitted.
   Other `create_invites` holders cannot revoke invitations they did not
   issue.
4. **No replicated record holds the link secret, or anything that lets
   someone claim the invitation.** That covers:
   - operations;
   - `requests` store records;
   - MLS records.

   The secret also never reaches any API request or response, any node log or
   the UI host's logs. A node only ever sees a public key and proofs bound to
   one joiner (#550).

5. Usage limits, revocation and expiry never evict an admitted member. The
   only rule that can undo an admission is the authority cut of #543 (see
   [Authority cuts](#authority-cuts-543)).
6. One mechanism, and the link stays a single copy-paste link. Single-use
   links, optionally bound to one identity, replace direct invitations.

Non-goals:

- the operations endpoint's scan;
- join requests (`approval`);
- direct adds (`added`);
- auto-join (`automatic`).

## Overview

1. The issuer's client generates a 32-byte secret and derives an Ed25519
   invitation key from it. It then signs an `invitation_created` operation
   that carries the public key, `maxUses` and `expiresAt`.
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

### Canonical identity ids

The node's `IdentityId.isEqual` compares encodings, and the communities rules
compare identity ids that way. `PublicKey.isValidSignature` decodes keys
leniently, so a signature by one key also verifies under re-encoded aliases
of that key (`tests/unit/mothers/IdentityIdMother.ts`, `aliases()`). Without
a check, a banned identity could join under an alias, and one identity could
use an invitation once per alias.

- Every identity id in a community operation must be canonical
  (`IdentityId.isCanonicalKey()`): its author and every identity argument, in
  every operation type. The ledger refuses an operation that names a
  non-canonical id, and every fold, node and client, skips it.
- The claim policy refuses a claim whose `identityId` is not canonical.
- The proof classes decode keys strictly, so a consent checked against an
  alias fails on its own.

With every compared id canonical, equal strings mean equal keys. The ban,
membership, one-use-per-identity and distinct-joiner rules therefore compare
keys.

### `invitation_created` operation

The author must be a member whose roles grant `create_invites`. The ledger
checks this against the community folded at the operation's parents, and the
fold checks it again against the linear state, as for every operation.

| Argument        | Type    | Rule                                                                                                                                                       |
| --------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invitationKey` | string  | Raw Ed25519 public key in canonical base64url (43 characters). Refused unless strict crypto decoding accepts it as a valid key that is not of small order. |
| `maxUses`       | integer | `1 <= maxUses <= 100` (`MAX_INVITATION_USES`). Exactly 1 when `invitee` is set.                                                                            |
| `expiresAt`     | integer | Unix milliseconds. Required: `createdAt < expiresAt <= createdAt + 30 days` (2 592 000 000 ms).                                                            |
| `invitee`       | string  | Optional. A canonical identity id. Only that identity can join through the invitation.                                                                     |

- The **invitation id** is the operation digest (`getHash()`), the
  `<digest>` in `community:<communityId>:op:<digest>`.
- The issuer's identity signature over the operation id
  (`CommunityOperationSignature`) commits to every argument, so it is the
  invitation's signature. The operation's `PublicMutationProof` binds it to a
  device that is authorized at its `authorizationRevision`.
- An `invitation_created` whose `invitationKey` equals the key of an
  invitation in its causal past is refused.
- `createdAt` is chosen by the issuer, and nothing checks it against a clock.
  - Backdating it only shortens the invitation's life.
  - Forward-dating it delays the window: no admission may predate the
    invitation (admission rule 6), and the window still lasts at most 30
    days.

  The window also closes as soon as the issuer loses `create_invites` (see
  liveness rule 3). An issuer therefore gains nothing that it could not get by
  issuing the invitation later.

- The UI proposes 7 days and lets the issuer pick up to 30, and up to 100
  uses. It can bind a single-use link to a contact.

### `invitation_revoked` operation

- The only argument is `invitationId`.
- The invitation must be in the revocation's causal past.
- The author must be one of:
  - the invitation's issuer, while a member;
  - a member whose roles grant `manage_members` at the revocation's parents.

  No other `create_invites` holder can revoke the invitation, so issuers
  cannot revoke each other's invitations to grief.

- Revocation is permanent. A second revocation of the same invitation is
  refused.

### `member_joined` with method `invitation`

| Argument       | Rule                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| `identityId`   | The joiner.                                                                             |
| `method`       | `'invitation'`. The methods `invite_link` and the self-signed `invitation` are removed. |
| `invitationId` | Digest of an `invitation_created` operation in the join's causal past.                  |
| `possession`   | Signed by the invitation key (see [Proofs](#proofs)).                                   |
| `consent`      | Signed by the joiner's identity key.                                                    |

The author is the admitter: a member whose roles grant `manage_members`. The
joiner does not sign this operation; its consent is the embedded proof.

- The admission counts toward the joiner's operation quota
  (`MAX_OPERATIONS_PER_AUTHOR`), not the admitter's. It is the joiner's join,
  made with the joiner's consent, as a self-join is today. Link holders
  therefore cannot spend a manager's quota, however many identities they
  create. Every other operation still counts toward its author, and the
  founder stays exempt.
- The arguments are about 400 bytes as `MAX_ARGUMENT_BYTES` measures them
  (`JSON.stringify`), well under its 4 096.

### `community_invitation_claim` record

This record lives in the `requests` store, with `requiresFrontier: true`.

- Fields: `communityId`, `id`, `identityId`, `invitationId`, `possession`,
  `consent`.
- The id is `invitation-claim:<invitationId>:<identityId>`.
- The author is `identityId`, signed by one of its devices.

It asks for admission and carries no authority. Joins never reference it, so
no admission depends on which records a node holds. Its proofs name one
joiner, so a node operator who reads it can admit nobody else. A node stores
a claim only when all of these hold:

- `identityId` is canonical, and is the invitation's `invitee` when the
  invitation names one;
- the invitation is in the community folded at the claim's frontier;
- the proofs verify;
- the invitation is live at that frontier (see
  [Admission](#admission-algorithm));
- the joiner is neither banned nor a member at that frontier.

The claim does not check expiry, because there is no deterministic clock to
check it against. Expiry is enforced at admission.

A claim is written once: the policy refuses another write to the same id.
The proofs do not depend on the frontier, so a claim signed again at another
frontier could change nothing.

A claim names its joiner, its invitation and its community, and the
`requests` store replicates it to every node of the network. Every node
operator therefore learns who asked to join which community (see
[Residuals](#residuals)).

## Link format

`https://<ui-origin>/invite/community#c=<communityId>&k=<secret>`

- `secret` is 32 bytes from the crypto CSPRNG, encoded as canonical base64url
  (43 characters).
- Both values sit in the fragment, which browsers never send to the UI host.
  The UI reads the fragment once and removes it from the address bar
  (`history.replaceState`). It keeps the secret in session-scoped storage
  only until the claim is signed, which may happen after sign-in or identity
  creation.
- The node never receives the secret. The preview sends the derived public
  key in a header (see [Preview](#preview)), and the claim carries
  signatures.
- `communityId` scopes the key lookup. It reveals nothing to anyone who does
  not already hold the secret.

## Preview

`GET /communities/{communityId}/invitation-preview` is unsigned, so a joiner
can preview before signing in or creating an identity.

- The client sends the derived key as `Authorization: Bearer <invitationKey>`,
  never in the URL, as mailbox and call capabilities do
  (`MailboxRouteSupport.bearerToken`, `CallRouteSupport.capability`). The key
  is not secret: members and node operators read it in `invitation_created`.
  The header keeps it, and with it the invitation, out of URLs and access
  logs. The node never logs the `Authorization` header.
- The node finds the invitation through an index of invitation keys. An
  unknown key, or an invitation that is not live at the node's frontier or
  has expired by the node's clock, gets the same `404` as an unknown
  community.
- The response holds only `communityId`, `networkId`, `communityName`,
  `communityAvatar`, `communityBanner`, `invitationId` and `expiresAt`. The
  joiner needs `networkId` and `invitationId` to sign its proofs.
- It holds no issuer, invitee, use count, member, peer id or address, and
  nothing that is not already in the community's operations.
- Members read every invitation key in the operations, so they can preview
  any invitation. They already see all of its fields.

## Proofs

Both proofs sign the same canonical body,
`CanonicalJson({communityId, identityId, invitationId, networkId})`, under
different domains:

| Proof        | Preimage                                                 | Signing key                              | Verified against                 |
| ------------ | -------------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| `possession` | `pigeon:community-invitation-possession:v1\n` + the body | invitation key (derived from the secret) | the invitation's `invitationKey` |
| `consent`    | `pigeon:community-invitation-consent:v1\n` + the body    | the joiner's identity key                | `identityId`                     |

- Signatures are Ed25519. A signature must be 86 characters of unpadded
  base64url that decode to 64 bytes and encode back to the same string, and
  verification refuses `S >= L` (RFC 8032). `PublicKey.isValidSignature` is
  not enough: it decodes with `Buffer.from(signature, 'base64')`, which
  accepts both alphabets, padding and stray characters.
- Keys decode strictly. `invitationKey` must be a canonical key that is not
  of small order, and `identityId` must be canonical (see
  [Canonical identity ids](#canonical-identity-ids)).
- No rule keys on signature bytes: uses count identities, and claims are
  keyed by invitation and identity. Another valid encoding of a proof, if one
  existed, would admit nobody new.
- A possession proof read from an operation or a claim can admit only the
  same identity, under the same invitation, community and network. It cannot
  be replayed for anyone else, and one identity counts once per invitation.
- The two domains keep a consent signature from being read as any other
  statement made with the identity key, which also signs operations and
  records. The invitation key never signs anything except possession.
- The proofs sign fields, not the admission operation, because the joiner
  signs before the admitter has chosen the position.

### Cryptography

`@haskou/pigeon-swarm-crypto` 8.0.0 is a breaking release with no
compatibility readers. It reuses these 7.0.0 primitives:

- `PrivateKey.fromSeed`;
- the strict key decoding behind `PublicKey.fromRaw`
  (`publicKeyToStrictBytes`);
- `CanonicalJson`;
- `CommunityOperationSignature`;
- `PublicMutationSignature`.

It adds:

1. `CommunityInvitationKey`:
   - `generate()` returns `{secret, key}`;
   - `fromSecret(secret)` strictly decodes 32 canonical base64url bytes and
     sets
     `seed = HKDF-SHA256(ikm = secret, salt = empty, info = "pigeon:community-invitation-key:v1", L = 32)`,
     then derives the key with `PrivateKey.fromSeed(seed)`;
   - `publicKey()` returns the canonical base64url raw key;
   - `parsePublicKey(text)` validates strictly and refuses small-order keys.
2. `CommunityInvitationPossession` and `CommunityInvitationConsent`. Each
   provides `contentOf(fields)`, `sign(fields, key)` and
   `verify(fields, signature, publicKeyOrIdentityId)`, using the domains
   above. `verify` decodes the signature and the key strictly (see
   [Proofs](#proofs)) and never calls `PublicKey.isValidSignature`.
3. Vectors that the node and UI specs both consume:
   - secret → seed → public key;
   - fields → each preimage → each signature.

   Negative vectors cover:
   - a non-canonical secret;
   - a small-order or non-canonical invitation key;
   - an alias of the joiner's identity id;
   - a signature in the standard alphabet, with padding, with a stray
     character, of the wrong length, or with `S >= L`;
   - a signature under the other domain;
   - a swapped identity, invitation or network.

It removes `CommitmentId.communityInviteToken` and `CommunityInviteReference`.

## Admission algorithm

Definitions:

- `closure(O)` is the set of `O`'s parents and all their ancestors.
- `past(O)` is the community folded from `closure(O)`. The ledger already
  judges every operation against it.
- An operation `D` **cuts** permission `P` of member `X` when `X` holds `P`
  in `past(D)` and does not once `D` is applied to `past(D)`. Membership
  counts as a permission. Examples are a kick, a ban, `X` leaving, a role
  update or deletion, and a change to `X`'s roles. This is decided once, from
  `D` and its causal past, so every replica decides it the same way.

Invitation `I` is **live** in a set of operations `S` when all of these hold:

1. `I` is in `S`, and its author held `create_invites` in `past(I)`.
2. No `invitation_revoked` of `I` is in `S`.
3. No cut outside `closure(I)` that stands in `S` (see
   [Standing cuts](#standing-cuts)) cuts `create_invites` of the issuer of
   `I`. Once the issuer loses `create_invites` or membership after issuing,
   or concurrently with issuing, the invitation is dead for every later
   admission. That stays true even if the issuer is promoted again.
4. `uses(I, S) < maxUses`. Here `uses(I, S)` is the number of distinct
   joiners that have an admission under `I` in `S` that is valid by these
   rules at its own causal past. Admissions that the fold later skips or
   voids still count, which errs on the side of fewer uses.
5. The issuer of `I` holds `create_invites` in the community folded from
   `S`. A ban that cuts nothing in the cut graph still applies to the folded
   state (see [Retroactive reach](#retroactive-reach)), so this rule stops a
   banned issuer's invitations once the ban is in an admission's causal past.

An admission `A` (`member_joined`, method `invitation`) is **valid** when all
of these hold:

1. `A`'s author holds `manage_members` in `past(A)`.
2. `invitationId` names an `invitation_created` of the same community that
   is live in `closure(A)`.
3. `possession` verifies against `invitationKey`.
4. `identityId` is canonical, and `consent` verifies against it.
5. `closure(A)` holds no valid admission of `identityId` under the same
   invitation. Each identity can use an invitation once, even after leaving
   or being kicked.
6. `I.createdAt <= A.createdAt <= I.expiresAt`.
7. `identityId` is neither banned nor a member in `past(A)`.
8. If `I` names an `invitee`, `identityId` is that invitee.

Where each check runs:

- **Node ledger** (`CommunityOperationLedger.admit`): it refuses an invalid
  admission, so the admission is never stored. The ledger judges only the
  causal past, so every replica stores the same operations whatever order
  they arrive in. `assertJoinReference` and its `requests` store queries are
  removed, so admission depends only on operations.
- **Fold, node and client**:
  - Rules 1 and 7 are checked again against the linear state, as for every
    operation, so a joiner banned concurrently stays out.
  - Rules 2 to 6 and 8 are facts of `A`'s causal past and are never
    re-evaluated against the linear state. A revocation, other uses or the
    passage of time can therefore never skip an admission that was valid at
    its position.
  - The fold applies the [authority cut](#authority-cuts-543) to the
    invitation and to the admission.
  - The client fold evaluates all of this itself, so a malicious node cannot
    serve a forged admission (#433).
- **Admitter's client**: it admits a claim only if the claim is valid at its
  own current frontier and `I.createdAt <= now <= I.expiresAt`. It signs with
  `parents = current frontier` and `createdAt = now`, then commits the MLS
  add. Two admitters may admit the same joiner concurrently; the identity
  counts once, and the fold skips the second join because the joiner is
  already a member.

The fold already folds `closureOf(parents)` for whole-value rebases
(`baseOf`, `pasts`), and the ledger caches states of the past. The
implementation reuses both. The checks need only ancestry tests on a few
operations plus the cut set of each operation, which is computed when the
operation is admitted. An admission does not need a full fold of its past.

## Authority cuts (#543)

The fold applies one rule to every operation whose author needs a permission
or membership, not only to invitations. Bans and revocations are the
exceptions: the rule never removes them (see
[Retroactive reach](#retroactive-reach) and
[For invitations](#for-invitations)).

### Void operations

- Two operations are **concurrent** when neither is in the other's closure.
- A **cut** is an operation that cuts a permission of a member (see
  [Admission algorithm](#admission-algorithm)): a kick, a ban, a leave or a
  role change.
- An operation `O` by `X` that needs permission `P` is **void** in a set `S`
  when a cut that stands in `S` reaches `O` and cuts `P` of `X`.
- A standing cut `C` **reaches** `O` when they are concurrent. If `C` lies in
  a cycle of the cut graph (see [Standing cuts](#standing-cuts)), `C` also
  never reaches an operation in the closure of an operation that `C`'s author
  signed without `C` in its closure. A cycle cut never voids what its author
  built on.
- A void operation changes nothing in the folded state, and **it cuts
  nothing**. Operations that depended on it are re-authorized linearly as
  usual. For example, a joiner whose admission is void is not a member, so
  their operations are skipped.
- The ledger never voids an operation, because that depends on operations
  outside its causal past. The fold applies the rule over the stored set. A
  replica that has not yet received a cut applies `O` until the cut arrives.
  Where the ledger counts cuts inside a causal past (liveness rule 3), it
  counts only the cuts that stand in that past.

### Standing cuts

Whether a cut is void depends on other cuts, which may themselves be void.
The fold decides it in a fixed order, so every replica decides it the same
way:

1. Build a graph over the cuts in `S`, with an edge from `D` to `E` when `D`
   and `E` are concurrent and `D` cuts the permission that `E` needs of its
   author.
2. Group the cuts into strongly connected components, and visit the
   components in topological order.
3. A cut is void when a standing cut in an earlier component reaches it and
   cuts the permission it needs. Every other cut stands. Cuts in the same
   component never void each other.

A cycle is a component of more than one cut. Edges ignore the bound on
reach, so the components never depend on it.

So:

- **A removed member cannot undo its removal.** Its backdated cuts are
  concurrent with its removal, which reaches them, so they are void and cut
  nothing. The one exception is a cut of its remover, which forms a cycle
  with the removal and whose reach is bounded (see
  [Retroactive reach](#retroactive-reach)).
- **Mutual cuts all stand.** When manager `A` kicks `X` and `X` kicks `A`
  concurrently, both lose `manage_members`, and each kick voids the acts of
  the other that it reaches. No replica can tell which kick came first.
  Letting both fall would keep `X`, together with every other cut it made. A
  third manager or the founder restores whoever should stay.
- **The founder's cuts can never be answered.** The founder holds every
  permission by ownership, and can be neither kicked, banned nor made to
  leave while others remain (`Community.ts`). No cut reaches the founder's
  cuts.

The fold indexes cuts by the member they cut. Step 1 compares each cut only
with the cuts that cut its author, and the void rule tests each operation
only against the standing cuts that cut its author, so no step compares all
pairs. The graph, its components and the standing cuts are cached per
frontier, as `pasts` is. The graph changes only when a cut arrives. The reach
of a cycle cut also changes when its author signs, so the fold re-checks that
author's cycles then.

### Retroactive reach

A cut sits where its author places it. A cutter that chooses old parents
makes its cut concurrent with every act of the cut member since those
parents. Outside a cycle, the cut voids all of them. This reach is
retroactive by design:

- Every member who can cut someone has it, that is every holder of
  `manage_members` or `manage_roles`.
- A member also cuts itself by leaving. A `create_invites` holder that leaves
  with old parents voids its own invitations since then, and the admissions
  under them, although it could not kick those joiners.
- Without the cut, a backdated operation already takes effect where the
  fold's linear order places it among the operations it is concurrent with.
  The cut replaces that order with one rule.

**A removed manager's answer is bounded.** A removed manager can cut its
remover with old parents. That cut forms a cycle with its removal, so both
stand. Its cut never reaches what it built on, so it voids only the remover's
acts since the removed manager's own latest operations. A manager active
until its removal voids little. One that had signed nothing for a long time
reaches far back (see [Residuals](#residuals)).

The bound applies to both cuts of the cycle. The removal spares a backdated
act of the removed manager only when one of the remover's own devices built
on that act before receiving the removal.

The bound still voids. If cycle cuts voided nothing, a removed manager could
keep its backdated invitations and admissions by answering its removal with a
cut of its remover, because nothing would void them.

**Bans fail closed.** The cut rule never removes a ban from the folded state,
so cutting a moderator never readmits a member it banned. The linear fold
alone decides bans, as today. A ban that a standing cut reaches still cuts
nothing in the graph, so a removed moderator's backdated bans void nobody's
acts. A backdated ban of the remover forms a cycle with the removal, so it
stands like any cycle cut, with the same bounded reach.

The price is that a removed moderator can still ban by backdating, as it can
today. A ban with parents from before its removal becomes ready early in the
linear order, and its author can choose `createdAt` until the ban's digest
sorts it before the removal (`CommunityStateFold.orderOf`), so the ban
applies. This works against any identity, the remover included. A manager's
unban is the remedy. Without a total order, an honest ban made during a
partition looks exactly like a backdated one, so voiding backdated bans would
also void honest bans and readmit those members.

### For invitations

- An invitation whose issuer's `create_invites` is cut by a standing cut that
  reaches it is void, and so is every admission under it.
- An admission whose admitter's `manage_members` is cut by a standing cut
  that reaches it is void.
- A removed or demoted member's backdated invitation or admission is
  concurrent with the removal, so it is void on every replica once the
  removal arrives, unless the removal lies in a cycle and one of the
  remover's devices built on it (see [Retroactive reach](#retroactive-reach)).
  When the removal is already in the operation's causal past, the ledger
  refuses the operation outright (admission rule 1 and liveness rule 3).
- **Revocations are never void.** A revocation only closes an invitation.
  Voiding it would reopen a link that an authorized member closed. A revoker
  needs its authority only at the revocation's parents. A removed issuer or
  manager can therefore still revoke, with parents from before its removal,
  any invitation it could revoke there. That closes links and evicts nobody,
  and the issuer or a manager can issue a new link.
- The ledger's refusals stand. An operation the ledger refused at its causal
  past is never stored, so a later cut cannot revive it.

A void admission removes a member, also when the admission was honest and was
made during a partition in which the admitter or the issuer was demoted. Only
a member who can cut triggers this: a `manage_members` or `manage_roles`
holder, who could remove the joiner directly anyway, or a removed manager
answering its removal, whose cut reaches only the remover's acts it had not
built on. A member who leaves the fold loses their MLS leaves, as on any
removal (UI `docs/mls-group-encryption.md`, "Who commits", Remove).

Slice 2 builds the cut graph and voids invitations and admissions with it.
#543's own change voids every other operation that needs a permission
(channels, roles, kicks, `added`) with the same graph, never bans. Until
then, the linear fold alone decides those operations.

## Revocation

- The issuer, or a member with `manage_members`, signs
  `invitation_revoked{invitationId}`.
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
2. **Concurrent admissions can overshoot, and the overshoot is not
   repaired.** This happens during a partition, or between admitting devices
   that have not synced. Each admission sees fewer than `maxUses` uses in its
   own past, so `k` mutually concurrent branches admit at most `k * maxUses`
   identities, with `maxUses` at most 100. An exact limit would need either a
   total order (consensus) or eviction by use count. #550 rules out eviction,
   and eviction would also undo honest joins and churn MLS after every heal.
3. **Revocation holds** for every admission that has the revocation in its
   past.
4. **Expiry follows the admitter's clock**, through the signed `createdAt`,
   and never exceeds 30 days after the invitation's `createdAt`.
5. **A link holder who is not a manager cannot:**
   - exceed the limit;
   - bypass revocation or expiry;
   - choose a position in the history;
   - evict anyone;
   - enroll an identity without that identity's consent;
   - spend a manager's operation quota;
   - join through a link bound to another identity.

   The most they can do is submit one claim per identity and invitation, and
   join while the invitation is live.

6. **A removed or demoted issuer or admitter cannot invite or admit by
   backdating.** Its invitations and admissions are void everywhere once the
   removal is known. Three kinds of backdated act still take effect (see
   [Authority cuts](#authority-cuts-543)):
   - revocations, which close links and evict nobody;
   - bans, where the linear order places them, until a manager unbans;
   - a cut of its remover, which voids only the remover's acts that the
     removed member had not built on.
7. **A malicious manager can ignore any of these limits** while it is a
   manager. It can already add anyone with `added`, so this is no new power.

## Device compromise (#541)

- The device proofs of issuers, admitters and revokers are judged at their
  `authorizationRevision`, subject to compromise caps (causal device
  authorization).
- Until #541 is fixed, a cap that a recovery dropped on some nodes lets a
  stolen device's backdated invitation, admission or revocation pass on those
  nodes and fail elsewhere, so replicas can disagree about membership.
- This design adds no device-level rule. It inherits the #541 guarantee once
  #541 is fixed.
- The client fold verifies identity signatures. The node checks device
  proofs, as it already does.

## What the operations endpoint exposes

`GET /communities/{communityId}/operations` returns the operations verbatim
to every member:

| Operation                        | Visible to every member                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `invitation_created`             | issuer, `invitationKey`, `maxUses`, `expiresAt`, `createdAt`, `invitee` |
| `member_joined` (`invitation`)   | admitter, joiner, `invitationId`, `possession`, `consent`               |
| `invitation_revoked`             | revoker, `invitationId`                                                 |
| `member_banned`, `member_kicked` | moderator                                                               |

- No secret, bearer token or anything that lets someone claim an invitation
  appears in any operation, record, response or log.
- The public key and the proofs let members verify joins. They cannot be
  used to claim the invitation.
- **Moderator, admitter and revoker names stay visible to every member.**
  Every member's client fold verifies that the author of each operation holds
  the permission the operation needs (#433), so the author must be readable
  by everyone who folds. Showing these names only to `manage_members` would
  need a separate protocol, such as a moderation key shared by managers or
  anonymous credentials. It is a [residual](#residuals) of this design.
- The endpoint's scan is unchanged. Preview and claim listing use indexes and
  never scan.

## Threats

| Threat                                                                               | Actor                                   | Outcome                                                                                                                               | Mechanism                                                                                         |
| ------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Read the link secret from replicated records, an API or logs                         | node operator, member, network observer | prevented                                                                                                                             | only the public key and joiner-bound proofs leave the joiner's client                             |
| Read the secret from the UI host or `Referer`                                        | UI host operator                        | prevented                                                                                                                             | browsers do not send fragments; the UI removes the fragment from the address bar                  |
| Link preview requests to invitations in access logs                                  | proxy or node operator                  | prevented; the key itself is public to members and node operators                                                                     | the key travels in a header, never in a URL; the node never logs `Authorization`                  |
| Use a token from records stored before the cutover                                   | node operator                           | grants nothing                                                                                                                        | the cutover refuses every old scope and join method                                               |
| Join without the link                                                                | outsider                                | prevented                                                                                                                             | possession proof                                                                                  |
| Replay a possession proof for another identity                                       | anyone who reads operations or claims   | prevented                                                                                                                             | the proof binds identity, invitation, community and network                                       |
| Join under an alias id while banned, or use an invitation twice                      | banned identity, member, malicious node | prevented                                                                                                                             | canonical ids in every operation and claim; strict key decoding                                   |
| Join through a link bound to another identity                                        | link holder                             | prevented                                                                                                                             | `invitee`, checked by the claim policy, the ledger and every fold                                 |
| Enroll an identity without its consent                                               | link holder                             | prevented                                                                                                                             | consent proof                                                                                     |
| Join after revocation or expiry, or exceed `maxUses`                                 | link holder                             | prevented                                                                                                                             | the admitter chooses position and `createdAt`; the checks run at the admission's past             |
| Spend a manager's operation quota through claims                                     | link holder with many identities        | prevented                                                                                                                             | admissions count toward their joiner                                                              |
| Extend an invitation's life                                                          | issuer                                  | at most 30 days from its `createdAt`; ends when the issuer loses `create_invites`                                                     | expiry bound, admission rule 6, liveness rules 3 and 5                                            |
| Overshoot `maxUses` through concurrent admissions                                    | honest admitters across a partition     | possible, at most `k * maxUses` with `maxUses <= 100`                                                                                 | stated limit; no eviction by use count                                                            |
| Evict a member with a backdated join                                                 | link holder                             | prevented                                                                                                                             | link holders sign no operations; use count and revocation never evict                             |
| Forge an invitation                                                                  | member without `create_invites`         | prevented                                                                                                                             | permission checked at `past(I)` and in the fold                                                   |
| Revoke another issuer's invitation                                                   | `create_invites` holder                 | prevented                                                                                                                             | only the issuer and `manage_members` holders revoke                                               |
| Backdate an invitation, admission or cut of a third member after removal or demotion | former issuer or manager                | void once the removal is known                                                                                                        | authority cut; void operations cut nothing; ledger refusal when the removal is in the causal past |
| Answer a removal with a backdated cut of the remover                                 | removed manager                         | both lose the permission; voids only the remover's acts since the removed manager's latest operations; impossible against the founder | cycle cuts stand with bounded reach ([residual](#residuals))                                      |
| Revoke with parents from before a removal                                            | former issuer or manager                | closes invitations it could revoke before the removal; evicts nobody                                                                  | revocations are never void ([residual](#residuals))                                               |
| Ban by backdating after removal                                                      | former moderator                        | possible against any identity, the remover included, until a manager unbans                                                           | bans fail closed; the linear order decides them ([residual](#residuals))                          |
| Readmit a banned member by cutting its moderator                                     | member who can cut                      | prevented                                                                                                                             | bans fail closed; the cut rule never removes a ban                                                |
| Admit under a banned issuer's invitation                                             | manager                                 | refused once the ban is in the admission's causal past                                                                                | liveness rule 5                                                                                   |
| Present another encoding of a proof                                                  | anyone                                  | refused                                                                                                                               | strict signature decoding; no rule keys on signature bytes                                        |
| Issue, admit or revoke with a stolen device                                          | device thief                            | bounded by `compromisedSince`; replicas can diverge until #541                                                                        | causal device authorization; #541                                                                 |
| Serve forged, aliased or over-limit admissions to a client                           | malicious node                          | prevented                                                                                                                             | the client fold checks canonical ids, the proofs and the admission rules                          |
| Ignore limits or revocation                                                          | malicious manager                       | not prevented, no new power                                                                                                           | `added` already exists                                                                            |
| Flood claims                                                                         | link holder with many identities        | bounded by the cost of creating identities; one claim per identity and invitation                                                     | [residual](#residuals)                                                                            |
| Learn which identity asks to join which community                                    | node operator                           | possible                                                                                                                              | claims replicate through the `requests` store ([residual](#residuals))                            |
| Publish a weak (small-order) invitation key                                          | malicious issuer                        | refused                                                                                                                               | strict key decoding; an issuer could publish the secret anyway                                    |
| Link leaked by its holder (chat, screenshot)                                         | whoever sees the link                   | can join while the invitation is live, unless it names an `invitee`                                                                   | revocation, expiry of at most 30 days, `maxUses`, `invitee`; inherent to bearer links             |

## Changes at implementation

Each slice is a complete cutover, red tests first. The slices land in this
order because each one depends on the one before it:

1. **Crypto 8.0.0** (`@haskou/pigeon-swarm-crypto`, `feat/` branch released
   through `releases`):
   - `CommunityInvitationKey`, `CommunityInvitationPossession` and
     `CommunityInvitationConsent`, with strict signature and key decoding;
   - the vectors, negative ones included;
   - removal of `CommitmentId.communityInviteToken` and
     `CommunityInviteReference`.
2. **Node** (#545, #550, invitation part of #543).
   - Operations:
     - add `invitation_created` (with `MAX_INVITATION_USES` and `invitee`),
       `invitation_revoked`, and `member_joined` with method `invitation`,
       with the rules above in the applier, the ledger and the fold;
     - refuse non-canonical identity ids in every community operation, in the
       ledger and the fold;
     - count each invitation admission toward its joiner's quota;
     - add the cut graph to the fold, cached per frontier, and void
       invitations and admissions with it;
     - add the write-once `community_invitation_claim` policy.
   - Removals:
     - the `invite_link` method and the old self-signed `invitation` method;
     - `assertJoinReference`;
     - the `community_invite` and `community_invite_use` scopes and
       `CommunityInvite*`;
     - the `invitation` type of membership request, and direct invitations;
     - `CommunityInviteToken`.
   - Moderation log: rename `invite_link_created` to `invitation_created`, add
     `invitation_revoked`, and make both target the invitation id.
   - Endpoints to add:
     - `POST /communities/{communityId}/invitations`: a signed
       `invitation_created`;
     - `GET /communities/{communityId}/invitations`: members only;
     - `GET /communities/{communityId}/invitation-preview`: unsigned, with
       the key in the `Authorization` header (see [Preview](#preview));
     - `POST /communities/{communityId}/invitations/{invitationId}/claims`;
     - `GET /communities/{communityId}/invitation-claims`: `manage_members`
       only;
     - `POST /communities/{communityId}/invitations/{invitationId}/admissions`;
     - `POST /communities/{communityId}/invitations/{invitationId}/revocation`.
   - Endpoints to remove:
     - `POST /communities/{communityId}/invites`;
     - `GET /communities/invites/{inviteToken}`;
     - `POST /communities/invites/{inviteToken}/accept`;
     - `POST /communities/{communityId}/members` (direct invitation).
   - Docs to update:
     - `docs/api.md`;
     - `docs/pubsub-sync-protocol.md`, for the operations, canonical ids, the
       authority cut and the claim scope;
     - the swagger;
     - the invites line of `node-owner-registration-and-blocking.md`;
     - the table row and the #543 residual of `causal-device-authorization.md`.
   - Tests:
     - unit specs for every rule and negative case, including alias ids for
       a joiner, a banned member and a repeated use, a `maxUses` above 100,
       an `invitee` mismatch, and the quota of a joiner and of an admitter;
     - the cut graph: mutual cuts and their bounded reach, a removed
       member's backdated cuts and bans, the founder's cuts, a banned
       issuer's invitations, and a revocation after removal;
     - the crypto vectors;
     - a forged-operations integration test;
     - real-transport end-to-end tests for backdating, partition and heal,
       revocation, and restart.
3. **UI** (#433), described below.

No log line contains a secret, a key, an invitation id, an identity id, a
community id or an address. The node never logs the `Authorization` header.

## UI changes (#433)

- **`CommunityAuthority`.** `JOIN_METHODS` drops `invite_link`. The
  `invitation` method requires `manage_members` and is no longer a self-join
  (`selfJoin: false`). `mayJoin` applies the admission rules at the join's
  causal past, using the same vectors as the node. Every operation that
  names a non-canonical identity id is skipped, using the crypto's strict key
  decoding.
- **`CommunityOperationFold`.** Add the new operations, the cut sets, the
  evaluation at each admission's causal past (a port of the node's `pasts`),
  the cut graph and the voiding of invitations and admissions. An admission
  counts toward its joiner's quota.
- **Creating a link.** Generate the secret and sign `invitation_created`.
  The expiry defaults to 7 days, and the issuer can pick up to 30 days and up
  to 100 uses. The issuer can bind a single-use link to a contact
  (`invitee`). Then build the fragment link. The secret is never sent.
- **Opening a link.** Parse and strip the fragment, preview with the key in
  the `Authorization` header, sign the claim, then wait for admission and the
  MLS welcome. The UI shows that it is waiting for a community manager.
- **Admitter.** A manager's client admits pending claims automatically, in
  the same loop that reconciles MLS adds. It skips every claim that is not
  valid at its own frontier, including claims with non-canonical ids.
- **Invitation list and revocation.** The list is shown to issuers and
  managers. Each issuer can revoke their own invitations, and managers can
  revoke any invitation.
- **Direct invitations.** Remove the direct invitation flow: the invitation
  type in `MembershipRequestCard`, `workspaceNotificationState` and
  `PigeonCommunitiesApi`. A single-use link, optionally bound to a contact,
  replaces it.
- **Moderation log.** Entries name the invitation id.
- **Removed code.** Remove `CommitmentId.communityInviteToken`,
  `CommunityInviteReference` and the `/invite/community/<token>` route, and
  update to crypto 8.0.0.
- **Docs.** Update `docs/mls-group-encryption.md` where it names who adds
  newcomers.

## Cutover

- Every invitation issued before the cutover is invalid. Nodes refuse its
  scopes and methods, and refuse direct invitation requests.
- The ledger replays stored operations on every start. A stored
  `member_joined` with a removed method is therefore refused, and so is every
  descendant, because one of its ancestors is never admitted.
- Community state on the network resets. No path accepts the old methods.
- Old `requests` records may stay in existing stores until they are
  discarded. The tokens in them grant nothing.

## Residuals

- Members see the issuer, admitter, revoker and invitee of every invitation,
  and the moderator of every ban and kick, because every client fold must
  verify authors.
- Every node operator of the network reads the claims in the `requests`
  store, so it learns which identity asked to join which community, through
  which invitation.
- Concurrent admissions overshoot `maxUses` by at most a factor of the number
  of concurrent branches, and the overshoot is never repaired.
- Cuts outside a cycle reach back as far as their author chooses, and void
  every act of the cut member they reach, including honest admissions made
  during a partition. A member that leaves with old parents voids its own
  invitations and the admissions under them.
- A removed manager can answer its remover with a cut, and both lose the
  permission. Its cut voids the remover's acts since the removed manager's
  own latest operations, so a manager that had signed nothing for a long time
  reaches far back. Only the founder's cuts cannot be answered.
- When a removed manager answers its removal, the removal spares a backdated
  act of the removed manager that one of the remover's devices built on
  before receiving the removal. A malicious node serving that device can
  arrange that order.
- A removed moderator can ban any identity, its remover included, by
  backdating, as today. A manager's unban is the remedy.
- The `invitee` of a bound link tells every member which identity the issuer
  invited, before that identity joins and even if it never does.
- A removed issuer or manager can still revoke, with parents from before its
  removal, any invitation it could revoke there.
- Expiry follows the admitter's clock.
- Stolen-device acts can split replicas until #541 is fixed.
- A joiner needs an online manager. Today a joiner already needs one for the
  MLS welcome, but now the joiner does not appear in the member list until a
  manager admits them.
- A `create_invites` holder can make managers' clients admit up to 100
  joiners per invitation it issues, with identities it creates. Revoking its
  invitations or removing its `create_invites` stops this (liveness rule 3).
- Claims cannot be withdrawn, and joiners who create many identities can
  flood claims.
- The operations endpoint still scans the whole community per page.

# Group roster in MLS (D15)

Status: design. Owner decision: the node must not hold the group conversation roster
in plaintext (D15 in [`group-mailboxes.md`](group-mailboxes.md)). Today the roster is
the fold of signed `conversationOperations` and stays plaintext on every node.

This document says what the node stops knowing, what each node control is replaced by,
how the threats compare with today, and in which slices the cutover lands. Every slice
is a complete cutover of one feature. No slice runs the old and the new path side by
side, and there is no migration: groups are re-created, as for D14.

## What the node knows today

`Conversation.participantIds`, `creatorId`, `adminIds` and the group `name` come from the
fold in `OrbitDBConversationRepository` (`ConversationRoster.ts`,
`ConversationOperationApplier.ts`). These nodes read the fold:

| Consumer                      | Code                                                                                                                                                                                                         | What the roster gives it                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Roster ops                    | `POST /conversations` (group branch), `POST /conversations/{id}/members`, `DELETE .../members/me`, `DELETE .../members/{identityId}`, `PUT`/`DELETE .../admins/{identityId}`; `ConversationRoster.ts:40-160` | add, remove, leave, promote and demote rules; `MAX_GROUP_PARTICIPANTS`                                          |
| List and frontier             | `GET /conversations`, `GET /conversations/{id}/frontier`; `findByParticipant`                                                                                                                                | the groups of a viewer; the participant gate                                                                    |
| Drafts                        | was `PUT`/`DELETE /conversations/{id}/draft` with `ConversationDraftAccess.ts`; since slice 2 `/conversations/me/drafts/{draftKey}`                                                                          | the participant gate, now nothing: drafts are owner-only under opaque keys                                      |
| Control letters               | `group_conversation_invitation`; `NotificationInvitationMutationPolicy.ts`; since slice 6 without `subjectId`                                                                                                | inviter and recipient had to be participants, now nothing: signature and quotas only                            |
| Polls                         | `group_conversation` scope; `PollScopeAuthorizer.ts:84-102`, `PollMutationScopeAccess.ts:84-93`                                                                                                              | audience and the participant gate. The question, the options and each identity's vote are plaintext on the node |
| Calls                         | `CallScopeResolver.ts:39-48`, `CallAccessAuthorizer.ts:18-26`, `CallStartMutationPolicy.ts:80-131`, `ConversationCallEventRealtimeMapper.ts`                                                                 | call scope, `participantIds` in call documents and events                                                       |
| Typing                        | `WebSocketClientMessageHandler.ts:86-110`, `WebSocketEventHub.ts:264-295`; since slice 3 direct conversations only                                                                                           | relay recipients, now none for a group: its typing is an MLS record                                             |
| Presence and identity updates | `WebSocketClientMessageHandler.ts:163-200`, `GetPresenceRoute.ts:37-95`; since slice 4 one-to-one conversations and communities only                                                                         | who may see whose presence, now nothing for a group: co-membership grants no presence                           |

The UI also reads the roster: `GroupConversationRoster` pages `GET /conversations/`, and
`GroupMailboxRoster` judges MLS commits (`allowsCommit`), welcomes (`mayWelcome`) and
which identities get leaves (reconcile).

## Target

The roster lives in the MLS group. The node keeps mailboxes, sealed control letters and
nothing that names a group or its members.

### Roster extension

A private-use GroupContext extension (RFC 9420 section 13.3 range `0xF000`-`0xFFFF`)
carries `{version, conversationId, creatorId, adminIds, memberIds, name}`. Every member
of epoch `n` holds the same value: the GroupContext is part of the key schedule, so two
members that disagree on it cannot share epoch `n`. Every key package lists the
extension type in `capabilities.extensions`; ts-mls 1.6.4 rejects an Add or a join whose
leaf does not (`extensionsSupportedByCapabilities` in `clientState.js` and
`createCommit.js`).

### Roster operations

Every roster change is a `GroupContextExtensions` (GCE) proposal inside a commit. A
receiver judges the commit by the roster of the epoch the commit applies to, with the
rules the node enforces today (`ConversationRoster.ts:40-160`):

| Operation       | Commit                                                                                                                       | Rule (judged on the epoch's roster)                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| create          | `createGroup` with the extension; `conversationId` = `group:` + base64url(sha256(JSON{creatorIdentityId, networkId, nonce})) | committer's identity is `creatorId`; 1 to `MAX_GROUP_PARTICIPANTS` members; `adminIds` is a subset of `memberIds`                    |
| add             | GCE(roster + Y), plus Add of Y's leaves when a key package is at hand                                                        | committer is creator or admin; Y not a member; size cap                                                                              |
| remove          | GCE(roster - X) and Remove of all of X's leaves in the same commit                                                           | creator or admin; X is not the creator; only the creator removes an admin                                                            |
| leave           | GCE(roster - self): self leaves `memberIds` and, when self is an admin, `adminIds` in the same GCE                           | any member but the creator; an admin leaves without a prior demote. The lead committer removes the leaves on its next sync, as today |
| promote, demote | GCE with the new `adminIds`                                                                                                  | creator only; the target is a member; the creator is never in `adminIds`                                                             |
| leaf changes    | Add or Remove without GCE (reconcile, device add, revoke)                                                                    | as today: leaves must match roster identities and verified devices (#375, #441)                                                      |

Default deny. A receiver computes the diff between the epoch's roster and the roster in
the GCE, field by field (`version`, `conversationId`, `creatorId`, `adminIds`,
`memberIds`, `name`). The commit is valid only if the diff is exactly one operation of
the table above, with its rule satisfied:

- `version` and `conversationId` never change after create, and `creatorId` never
  changes.
- `memberIds` changes by exactly one identity (add, remove, leave) or not at all.
- `adminIds` changes by exactly one identity (promote, demote), or loses the departing
  identity when an admin is removed or leaves, or not at all. A remove or leave of an
  admin that keeps it in `adminIds` is rejected, so `adminIds` stays a subset of
  `memberIds` in every epoch, as create requires and the welcome checks expect.
- `name` never changes: nobody may rename a group, as today (the node has no rename
  operation). A rename needs its own operation and rule in a later design.
- A commit with more than one GCE proposal, an unknown `version`, or an unknown field is
  rejected.
- The Add and Remove proposals in the same commit match the operation: a remove removes
  exactly all of X's leaves; an add adds only Y's leaves; a GCE-only commit adds or
  removes no leaf except the leaves of an identity that left.

Committer identity. "Committer is creator/admin" means the identity of the committer's
leaf, verified as for any leaf: the leaf credential's device key must chain to the
identity through the device chain (#375, #441). The identity id in the credential name
alone counts for nothing; a commit whose committer leaf does not verify is rejected,
whatever operation it carries.

Each check is a pure function of epoch `n`'s state, which all members of epoch `n` share,
so honest members reach the same verdict. Remove and roster change are one commit, so the
removal gap of today (roster op landed, leaf still present) is gone for removals. A
leave keeps it until the lead committer removes the leaves, as today, and the outbox
keeps holding sends meanwhile.

Every commit advances the generation `gen_k`, including a GCE-only commit (D3 change).
Today the generation changes only when a leaf changes, which breaks the epoch to
generation mapping for a commit that changes the roster alone.

### Same-epoch race

D7 picks the lowest commit id per epoch and only counts commits that pass the checks
above. When two valid commits compete for the same epoch, a priority rule runs first and
the commit id only breaks ties inside the same priority:

1. Removals are judged first. A commit that removes the committer of a competing commit
   beats that commit. If both commits remove each other's committer, the commit whose
   committer may remove the other wins (the creator beats an admin; an admin never
   removes the creator).
2. Otherwise a commit by the creator beats a commit by any other member.
3. Otherwise the lowest commit id wins (D7).

Why the commit id is not enough. In the community MLS path the record id is
`base64url(sha256(canonicalize({epoch, groupId, kind, payload, recipientIdentityId})))`
([`api.md`](../api.md), MLS records), and the committer controls `payload` (fresh path
secrets, the signature nonce, padding). If the group mailbox path derives commit ids the
same way, which D7 implies ("as in the community MLS path") but `group-mailboxes.md` does
not specify, then a committer can grind candidate commits until one has a low id, and a
removed admin could win the race against its own removal. This is a conditional: the
group inbox record id derivation is not fixed in a design doc yet, and the slice that
lands this rule must state it. The priority rule above removes the dependence either way.

Residual: a member that was offline while the race was decided can, on reconnect, see
the losing branch first and adopt it. The client keeps the previous epoch (D7) and
switches when the winning commit arrives, but a member offline for longer than the
retention window may never see the winner and stays on a stale branch. The stale hint
below marks it.

### Joiners and the welcome

A joiner reads the roster from the welcome's GroupContext. Today it can also check the
welcomer against the node roster, so a removed admin that kept an old epoch cannot
welcome anyone. Without the node roster, a removed admin can commit Add(J) from its last
epoch and welcome J into a fork that the real group never sees, and it can add a second
identity S that it controls in the same or a later commit of that fork.

Checks on the welcome. J rejects the welcome, and sends nothing, unless:

- the extension type is present in the GroupContext and in `capabilities.extensions` of
  every leaf;
- `version` is a known version;
- `conversationId` has the form `group:` + base64url of 32 bytes;
- J's identity is in `memberIds`, and J's leaf in the tree is J's own key package;
- `memberIds` has 1 to `MAX_GROUP_PARTICIPANTS` entries, `creatorId` is in `memberIds`,
  and `adminIds` is a subset of `memberIds` without `creatorId`;
- every leaf verifies through the device chain to an identity in `memberIds`;
- the welcomer's leaf verifies the same way, and the welcomer is the creator or an admin
  in the welcome's roster;
- when J holds an invitation letter for this group, `conversationId` matches the one in
  the letter.

Confirmation. A joined group is unconfirmed until J receives, in an epoch at or after the
join, a valid commit or application message from a leaf of a confirming identity. A
confirming identity is one of:

- (a) the conversation creator, where the creator's leaf verifies through the creator's
  device chain (#375, #441) and the creator's identity is known to J from outside the
  welcome (see below); or
- (b) an identity that J already pins as a contact before the welcome arrives and that is
  not the welcomer.

In both cases the confirming identity must not have been added in the welcome's own epoch
or by the commit that produced it. An identity added by the same commit as J is
exactly what a sybil S looks like, so it never confirms. Any other identity (a member J
does not know, or one the welcomer added) never confirms, whatever it sends.

Creator shortcut. When the welcomer is the creator, the group is confirmed at once,
because the creator cannot be removed and so cannot be on a stale fork. The shortcut and
rule (a) need the creator's identity from a source the welcomer does not write: J's
verified invitation context (the signed key package request letter, whose signer J
verifies, or a contact entry). It never comes from `creatorId` in the welcome's roster,
which the welcomer writes.

Liveness. When neither a creator leaf nor a pinned contact other than the welcomer
exists in the group, J stays unconfirmed. The UI shows the group as "not yet verified"
and explains that no known member has confirmed it. J can leave it or wait; there is no
timeout that confirms it.

Nothing is sent. An unconfirmed group emits no MLS output of any kind:

- no application messages, read receipts, typing records, reactions, pins, poll records
  or call records;
- no commits: no update-path or self-update commits, no reconcile or device-add commits,
  no roster commits;
- no proposals;
- no own-identity welcomes to J's other devices (D19).

The outbox holds what the user writes and sends it after confirmation, re-encrypted under
the then current epoch (D9). The only output allowed while unconfirmed is what the
confirmation wait itself needs: fetching the group inboxes. That is a read, not an MLS
record.

### Control letters

`group_conversation_invitation` keeps sealed letters (key package request and response,
`{welcome, k}`), but the node stops checking that inviter and recipient are participants,
and the letter stops naming the conversation in clear: `subjectId` is dropped and the
conversation id travels inside the seal. Admission keeps the signature check and the
per-inviter quota (`GenuineRecordQuota`, `NOTIFICATIONS_MAX_INVITATIONS_PER_IDENTITY`,
default 10 000 retained, plus the local per-minute write cap).

Recipient caps. Without `subjectId` a stranger can fill a recipient's pending
invitations, and one inviter's quota (10 000) is far above any per-recipient bound. A
letter is pending while the recipient has signed no `accepted` or `declined` state record
for it (`PATCH /notifications/{notificationId}`). Of the pending group invitation letters
addressed to one recipient, the node lists at most:

- 4 per (inviter, recipient) pair
  (`NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_PAIR`), enough for two invitations in
  flight (a key package request and a `{welcome, k}` letter each);
- 100 per recipient in total
  (`NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_RECIPIENT`).

Both caps take the pending letters in ascending record id order, the order admission
already uses (`GenuineRecordQuota`), first per pair and then per recipient. A letter
beyond either cap is held back: the node keeps it like any admitted letter but does not
list it. The caps never delete a letter, and compaction does not treat held-back letters
differently from listed ones. Storage stays bounded by admission, which is unchanged:
signature check and per-inviter quota (10 000 retained letters per inviter). The listed
set is a function of the letters and state records a node holds, not of their arrival
time or of when a node compacts, so every node that holds the same records lists the
same letters. A state record ends its letter's pending state on every node, and the
next held-back letter by record id is listed in its place. An inviter whose letter is
held back is not told; it sees no answer, as for a recipient that ignores an invitation.

Handled letters. The client signs an `accepted` or `declined` state record for every
group invitation letter it handles, so that handled letters never occupy a slot:

- `accepted` for a key package request it answers, by the user or by the contact
  auto-answer below, and for a `{welcome, k}` or key package response letter it
  consumes;
- `declined` for a request the user declines, a letter whose welcome fails the checks
  above, and a letter it drops as a duplicate (letter dedupe below).

Without this rule an honest inviter with letters in flight to the same recipient would
fill its own 4 slots with letters the recipient already handled and hold back its next
letter.

Residual (suppression): one inviter holds at most 4 of the 100 slots, so filling a
recipient's slots needs at least 25 identities. Record ids are content-bound sha256
values that the sender can grind by re-sealing, so such a set can place its letters
ahead of letters from honest inviters. Declining does not end the attack: each attacker
identity may hold up to 10 000 admitted letters, and after every decline a further
letter, ground to sort low, takes the freed slot. The suppression lasts as long as the
attackers keep sending. While it lasts the recipient can neither see nor recover the
honest letters held back behind theirs; the node keeps them, and they are listed only
once the attackers' letters are handled and no new ones sort ahead. Invitations from
contacts over 1:1 conversations and community invitations are not affected.

Letter dedupe. The client deduplicates by the sealed content: after opening a letter it
keys it by `(sender identity, conversationId, letter kind, key package reference or
welcome epoch)`, all taken from inside the seal, and drops a letter whose key it already
holds. The node still deduplicates byte-identical letters by record id.

Auto-answer. A joiner answers a key package request on its own only when the requester is
a contact. The answer creates only a pending membership: when the welcome arrives the
group is unconfirmed, the confirmation rule above applies unchanged, and the UI shows the
group as "not yet verified" until it is confirmed. Being a contact makes the requester
eligible for rule (b) only when it is not the welcomer, so a contact that welcomes J does
not confirm its own welcome. Otherwise the request shows as a group invitation to
accept, as a community invitation does today.

### Other node consumers

| Consumer                      | Replacement                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List and frontier             | the client lists groups from its MLS state; a new device gets them through own-identity welcomes (D19), which an unconfirmed group never sends. The frontier exists for node-side group records, which are gone once polls move                                                                                                  |
| Drafts                        | group drafts are stored under an opaque key, HMAC(owner draft key, conversation id), with owner-only access and no participant gate                                                                                                                                                                                              |
| Polls                         | MLS records over the group mailbox, like pins and reactions. Close is creator-only, a vote replaces the voter's earlier vote, and every member checks both on receipt                                                                                                                                                            |
| Typing                        | an ephemeral MLS record over the group mailbox, sent at most once per 10 seconds per member, counted against the inbox append limit (D17)                                                                                                                                                                                        |
| Presence and identity updates | group co-membership stops granting presence and identity update fan-out; a member announces its own identity update to its groups as an MLS record over the group mailbox. Contacts, 1:1 conversations and communities still grant both                                                                                          |
| Calls                         | a group call is scoped by an opaque call id and a join capability. The starter derives the capability from the MLS exporter of the current epoch and posts `{callId, capability}` as an MLS record. The node stores a hash of the capability and admits leases and signals that present it. Calls stop carrying `participantIds` |

## What is lost and what replaces it

| Lost with the node roster                                                                                       | Replacement                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node-enforced add and remove authorisation: the node refuses an op that breaks a rule before anyone sees it     | each member judges each commit by the roster agreed in the MLS transcript, default deny on the roster diff, committer verified through the device chain. A malicious member can post rejected commits into inboxes; honest members drop them, and the post rate is bounded by the inbox append limit                                                                       |
| Node-side order of roster ops (the op log decides who acted first)                                              | the same-epoch priority rule (removals first, then the creator, then the lowest commit id). Residual: an offline member can adopt a stale branch on reconnect                                                                                                                                                                                                              |
| Server-side membership checks on list, frontier, drafts, control letters, polls, calls, typing and presence     | list, polls and typing move inside the MLS group; drafts use opaque keys; calls use a capability bound to the epoch; control letters keep the signature and per-inviter quota, add per-pair and per-recipient caps on listed pending letters (by record id, held-back letters kept), and, for non-contacts, ask the recipient first; presence stops flowing through groups |
| Plaintext `subjectId` on letters, used to group and dedupe them                                                 | dedupe by the sealed key `(sender, conversationId, kind, key package reference or welcome epoch)` after opening                                                                                                                                                                                                                                                            |
| Delivery fan-out by participant id (typing relay, call events, identity updates)                                | fan-out to inboxes whose ids derive from `gen_k` (already the case for messages and commits); call events reach capability holders                                                                                                                                                                                                                                         |
| Abuse controls and quotas per group: `MAX_GROUP_PARTICIPANTS`, per-author op limits, the roster gate on letters | members enforce the size cap in the roster check and the joiner checks it on the welcome; inbox append limits and mailbox capacity bound traffic per inbox; the letter quota is per inviter and the pending caps per (inviter, recipient) and per recipient; the node no longer stores group ops, so group creation costs it nothing                                       |
| An independent roster for welcome checks                                                                        | the welcome checks and the confirmation rule (creator verified from outside the welcome, or a pinned contact other than the welcomer, never an identity added with J). A group with neither stays "not yet verified"                                                                                                                                                       |
| Group discovery after losing every device                                                                       | none. A member re-adds the identity; a new device of a known identity is added by a sibling device (D19)                                                                                                                                                                                                                                                                   |

## Threat comparison

| Threat                                                                       | Today                                                                              | Target                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node or outsider learns who is in a group, the admins, the creator, the name | yes: plaintext fold on every node                                                  | no. The node sees mailboxes keyed by `gen_k`, letter recipients and timing                                                                                                                                                                                                                             |
| Node learns group size                                                       | from the roster and the fan-out burst                                              | from the fan-out burst only                                                                                                                                                                                                                                                                            |
| Node learns poll questions, options and votes per identity                   | yes                                                                                | no                                                                                                                                                                                                                                                                                                     |
| Node learns who is in a group call                                           | yes: `participantIds`                                                              | it sees connections that present the capability. Residual: signed lease requests still name the identity that holds a lease, until leases stop being signed by identity                                                                                                                                |
| Malicious node delays a removal by withholding the roster op                 | possible: the removed member keeps its leaves until the lead committer sees the op | not possible: the roster change and the leaf removal are one commit. Withholding the commit envelope stalls everyone equally, as today                                                                                                                                                                 |
| Malicious member adds or removes against the rules                           | refused by the node and by members                                                 | refused by members: default deny on the roster diff, committer verified through the device chain; the commit never becomes an epoch                                                                                                                                                                    |
| Member forges creator or admin rights through the credential name            | not possible: the node checks the signed op's identity                             | not possible: the committer leaf must verify through the device chain                                                                                                                                                                                                                                  |
| Removed or demoted member races its own removal in the same epoch            | the node orders the ops                                                            | the removal wins by the priority rule, whatever the commit ids. Residual: a member offline during the race can adopt the losing branch on reconnect until it sees the winner                                                                                                                           |
| Members disagree on the roster                                               | possible across fetch times (frontier race, removal gap)                           | not possible within an epoch; across branches only as the residual above                                                                                                                                                                                                                               |
| Removed admin welcomes a new member into a stale fork                        | refused: the joiner checks the node roster                                         | possible, contained: the fork stays unconfirmed because only the verified creator or a pinned contact other than the welcomer confirms, never a sybil added with J; an unconfirmed group emits no MLS output at all. Residual: J sees a "not yet verified" group                                       |
| Contact auto-answers a key package request into a fork                       | not applicable                                                                     | the answer yields a pending, unconfirmed membership only                                                                                                                                                                                                                                               |
| Stranger sends sealed letters                                                | anyone who first adds the recipient to a group, which needs no consent             | anyone, within the per-inviter quota; at most 4 pending letters per (inviter, recipient) and 100 per recipient are listed, by record id on every node, and the rest are held back, not deleted; non-contacts need the recipient's acceptance before a key package goes out                             |
| Strangers suppress a recipient's group invitations                           | not possible: no per-recipient cap                                                 | residual: 25 or more identities, grinding record ids, can keep a recipient's 100 listed slots full for as long as they keep sending; declining does not stop it, because a new ground letter refills each freed slot. The recipient can neither see nor recover the honest letters held back meanwhile |
| Spam into a group                                                            | bounded by the roster gate and inbox limits                                        | bounded by inbox limits; inbox ids are unknown to non-members                                                                                                                                                                                                                                          |
| Removed member that was offline past retention                               | sees the roster op                                                                 | sees a group that stays quiet. Residual: the UI marks a group without a new generation for longer than the retention window as stale; that is a hint, not a proof                                                                                                                                      |

Conclusion: the target is at least as safe as today for every threat in the table except
the stale-fork welcome and the stale branch after an offline race, which the
confirmation rule and the priority rule contain, and the three residuals named in the
table (identity-signed call leases, the stale hint, invitation suppression by 25 or more
identities). With these rules the design is safe to implement.

## Slices

Each slice is a node and UI pair that cuts one feature over completely. The UI change
merges first because the new client no longer calls the removed node surface. The node
change merges next. The UI then bumps `.github/node-sha` (and `.github/wrapper-sha`)
and merges when `real-node-e2e` is green.

1. Polls in groups become MLS records over the group mailbox; the node drops the
   `group_conversation` poll scope.
2. Group drafts move to opaque keys. This slice adds a node surface instead of removing
   one, so the order flips: the node merges first, and the UI, pinned to the node merge
   commit, merges when `real-node-e2e` is green.
3. Typing in groups becomes an MLS record; the node stops relaying group typing. Either
   order is safe, as no client sends group typing to the relay once it has the record;
   the UI merges first, so no group loses its typing indicator in between.
4. Presence and identity updates stop flowing through group co-membership: the node
   reads only one-to-one conversations and communities for presence reads and
   `identities.v1.identity.was_updated` fan-out, and a member announces its own
   identity update to its groups as an MLS record over the group mailbox. The UI
   merges first, so no group misses an identity update in between.
5. Group calls use the capability scope: the start names no member, carries the
   SHA-256 of the capability and the creator's network, and every request that
   addresses the call presents the capability as a bearer token; joins and leaves
   are not stored and the roster is the lease set, as for community calls. The
   node refuses conversation calls on group conversations. No client offers group
   calls (the UI hides the call action for groups and ends any group call it
   sees), so nothing breaks in between: the node merges first and the UI then
   accepts the scope, pinned to the node merge commit.
6. Final cutover: the roster extension and GCE roster ops with default deny and the
   device-chain committer check, the same-epoch priority rule (and the group inbox
   commit id derivation, stated), the welcome checks, the confirmation rule with the
   no-output rule for unconfirmed groups and the "not yet verified" UI state, local
   group list, roster-free control letters with the per-pair and per-recipient pending
   caps (held back, not deleted), a signed state record for every handled letter, and
   sealed-key dedupe; the node deletes group conversations (group branch of
   `POST /conversations`, group rows in the list, member and admin routes, group
   frontier, group ops in `conversationOperations`, the participant check on
   `group_conversation_invitation`).

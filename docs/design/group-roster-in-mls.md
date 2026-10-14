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

| Consumer | Code | What the roster gives it |
| --- | --- | --- |
| Roster ops | `POST /conversations` (group branch), `POST /conversations/{id}/members`, `DELETE .../members/me`, `DELETE .../members/{identityId}`, `PUT`/`DELETE .../admins/{identityId}`; `ConversationRoster.ts:40-160` | add, remove, leave, promote and demote rules; `MAX_GROUP_PARTICIPANTS` |
| List and frontier | `GET /conversations`, `GET /conversations/{id}/frontier`; `findByParticipant` | the groups of a viewer; the participant gate |
| Drafts | `PUT`/`GET`/`DELETE /conversations/{id}/draft`; `ConversationDraftAccess.ts` | the participant gate |
| Control letters | `group_conversation_invitation`; `NotificationInvitationMutationPolicy.ts:63-196` | inviter and recipient must both be participants |
| Polls | `group_conversation` scope; `PollScopeAuthorizer.ts:84-102`, `PollMutationScopeAccess.ts:84-93` | audience and the participant gate. The question, the options and each identity's vote are plaintext on the node |
| Calls | `CallScopeResolver.ts:39-48`, `CallAccessAuthorizer.ts:18-26`, `CallStartMutationPolicy.ts:80-131`, `ConversationCallEventRealtimeMapper.ts` | call scope, `participantIds` in call documents and events |
| Typing | `WebSocketClientMessageHandler.ts:86-105`, `WebSocketEventHub.ts:264-295` | relay recipients |
| Presence and identity updates | `WebSocketClientMessageHandler.ts:161-176`, `GetPresenceRoute.ts:37-95` | who may see whose presence |

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

Every roster change is a `GroupContextExtensions` proposal inside a commit. A receiver
judges the commit by the roster of the epoch the commit applies to, with the rules the
node enforces today (`ConversationRoster.ts:40-160`):

| Operation | Commit | Rule (judged on the epoch's roster) |
| --- | --- | --- |
| create | `createGroup` with the extension; `conversationId` = `group:` + base64url(sha256(JSON{creatorIdentityId, networkId, nonce})) | committer's identity is `creatorId`; 1 to `MAX_GROUP_PARTICIPANTS` members |
| add | GCE(roster + Y), plus Add of Y's leaves when a key package is at hand | committer is creator or admin; Y not a member; size cap |
| remove | GCE(roster - X) and Remove of all of X's leaves in the same commit | creator or admin; X is not the creator; only the creator removes an admin |
| leave | GCE(roster - self) | any member but the creator. The lead committer removes the leaves on its next sync, as today |
| promote, demote | GCE with the new `adminIds` | creator only |
| leaf changes | Add or Remove without GCE (reconcile, device add, revoke) | as today: leaves must match roster identities and verified devices (#375, #441) |

Each check is a pure function of epoch `n`'s state, which all members of epoch `n` share,
so honest members reach the same verdict. D7 ordering (lowest commit id per epoch) only
counts commits that pass the check. Remove and roster change are one commit, so the
removal gap of today (roster op landed, leaf still present) is gone for removals. A
leave keeps it until the lead committer removes the leaves, as today, and the outbox
keeps holding sends meanwhile.

Every commit advances the generation `gen_k`, including a GCE-only commit (D3 change).
Today the generation changes only when a leaf changes, which breaks the epoch to
generation mapping for a commit that changes the roster alone.

### Joiners and the welcome

A joiner reads the roster from the welcome's GroupContext. Today it can also check the
welcomer against the node roster, so a removed admin that kept an old epoch cannot
welcome anyone. Without the node roster, a removed admin can commit Add(J) from its last
epoch and welcome J into a fork that the real group never sees. Members of the real
group cannot be pulled into the fork (their epoch has moved on), and J's messages reach
only the fork's other leaves, which belong to clients that no longer read it except the
removed admin. Mitigation, required in the final slice: a joined group is unconfirmed
until J receives a commit or an application message from a leaf of an identity other
than the welcomer in an epoch at or after the join. Until then the UI shows the group as
waiting and the composer refuses to send. In a group of the welcomer and J only, the
welcomer is the creator (the only identity that cannot be removed), so the fork cannot
arise there and the group is confirmed at once.

### Control letters

`group_conversation_invitation` keeps sealed letters (key package request and response,
`{welcome, k}`), but the node stops checking that inviter and recipient are participants,
and the letter stops naming the conversation in clear: `subjectId` is dropped and the
conversation id travels inside the seal. Admission keeps the signature check and the
per-inviter quota (`GenuineRecordQuota`, `NOTIFICATIONS_MAX_INVITATIONS_PER_IDENTITY`,
default 10 000 retained, plus the local per-minute write cap). A joiner answers a key
package request on its own only when the requester is a contact. Otherwise the request
shows as a group invitation to accept, as a community invitation does today.

### Other node consumers

| Consumer | Replacement |
| --- | --- |
| List and frontier | the client lists groups from its MLS state; a new device gets them through own-identity welcomes (D19). The frontier exists for node-side group records, which are gone once polls move |
| Drafts | group drafts are stored under an opaque key, HMAC(owner draft key, conversation id), with owner-only access and no participant gate |
| Polls | MLS records over the group mailbox, like pins and reactions. Close is creator-only, a vote replaces the voter's earlier vote, and every member checks both on receipt |
| Typing | an ephemeral MLS record over the group mailbox, sent at most once per 10 seconds per member, counted against the inbox append limit (D17) |
| Presence and identity updates | group co-membership stops granting presence. Contacts, 1:1 conversations and communities still do |
| Calls | a group call is scoped by an opaque call id and a join capability. The starter derives the capability from the MLS exporter of the current epoch and posts `{callId, capability}` as an MLS record. The node stores a hash of the capability and admits leases and signals that present it. Calls stop carrying `participantIds` |

## What is lost and what replaces it

| Lost with the node roster | Replacement |
| --- | --- |
| Node-enforced add and remove authorisation: the node refuses an op that breaks a rule before anyone sees it | each member judges each commit by the roster agreed in the MLS transcript. A malicious member can post rejected commits into inboxes; honest members drop them, and the post rate is bounded by the inbox append limit |
| Server-side membership checks on list, frontier, drafts, control letters, polls, calls, typing and presence | list, polls and typing move inside the MLS group; drafts use opaque keys; calls use a capability bound to the epoch; control letters keep the signature and quota checks and, for non-contacts, ask the recipient first; presence stops flowing through groups |
| Delivery fan-out by participant id (typing relay, call events, identity updates) | fan-out to inboxes whose ids derive from `gen_k` (already the case for messages and commits); call events reach capability holders |
| Abuse controls and quotas per group: `MAX_GROUP_PARTICIPANTS`, per-author op limits, the roster gate on letters | members enforce the size cap in the roster check; inbox append limits and mailbox capacity bound traffic per inbox; the letter quota is per inviter; the node no longer stores group ops, so group creation costs it nothing |
| An independent roster for welcome checks | the confirmation rule above |
| Group discovery after losing every device | none. A member re-adds the identity; a new device of a known identity is added by a sibling device (D19) |

## Threat comparison

| Threat | Today | Target |
| --- | --- | --- |
| Node or outsider learns who is in a group, the admins, the creator, the name | yes: plaintext fold on every node | no. The node sees mailboxes keyed by `gen_k`, letter recipients and timing |
| Node learns group size | from the roster and the fan-out burst | from the fan-out burst only |
| Node learns poll questions, options and votes per identity | yes | no |
| Node learns who is in a group call | yes: `participantIds` | it sees connections that present the capability. Signed requests still name the identity that holds a lease, which is a residual until leases stop being signed by identity |
| Malicious node delays a removal by withholding the roster op | possible: the removed member keeps its leaves until the lead committer sees the op | not possible: the roster change and the leaf removal are one commit. Withholding the commit envelope stalls everyone equally, as today |
| Malicious member adds or removes against the rules | refused by the node and by members | refused by members; the commit never becomes an epoch |
| Members disagree on the roster | possible across fetch times (frontier race, removal gap) | not possible within an epoch |
| Removed admin welcomes a new member into a stale fork | refused: the joiner checks the node roster | possible, contained by the confirmation rule: nothing is sent until a third identity confirms |
| Stranger sends sealed letters | anyone who first adds the recipient to a group, which needs no consent | anyone, within the per-inviter quota; non-contacts need the recipient's acceptance before a key package goes out |
| Spam into a group | bounded by the roster gate and inbox limits | bounded by inbox limits; inbox ids are unknown to non-members |
| Removed member that was offline past retention | sees the roster op | sees a group that stays quiet; the UI marks a group without a new generation for longer than the retention window as stale |

Conclusion: the target is at least as safe as today for every threat in the table except
the stale-fork welcome, which the confirmation rule contains. With that rule the design
is safe to implement.

## Slices

Each slice is a node and UI pair that cuts one feature over completely. The UI change
merges first because the new client no longer calls the removed node surface. The node
change merges next. The UI then bumps `.github/node-sha` (and `.github/wrapper-sha`)
and merges when `real-node-e2e` is green.

1. Polls in groups become MLS records over the group mailbox; the node drops the
   `group_conversation` poll scope.
2. Group drafts move to opaque keys.
3. Typing in groups becomes an MLS record; the node stops relaying group typing.
4. Presence and identity updates stop flowing through group co-membership.
5. Group calls use the capability scope.
6. Final cutover: the roster extension and GCE roster ops, local group list, the
   confirmation rule, roster-free control letters; the node deletes group
   conversations (group branch of `POST /conversations`, group rows in the list, member
   and admin routes, group frontier and drafts, group ops in `conversationOperations`,
   the participant check on `group_conversation_invitation`).

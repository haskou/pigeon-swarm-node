# Frontend Realtime WebSocket

Last updated: 2026-05-12.

This document describes how browser clients connect to the node realtime stream.

## Endpoint

```http
GET /ws
```

Local development URL:

```ts
const socketUrl = 'ws://localhost:8080/ws';
```

If the node is served with `ROUTE_PREFIX`, include that prefix in both the URL
and the signed path. For example, with `ROUTE_PREFIX=/api`, use `/api/ws`.

## Authentication

The browser `WebSocket` constructor cannot send custom headers, so the frontend
must authenticate with signed query parameters:

```text
identityId=<identityId>
timestamp=<timestamp>
nonce=<nonce>
signature=<signature>
```

Every query parameter must be encoded with `encodeURIComponent`.

The signature uses the same canonical request payload as the signed HTTP API:

```ts
{
  bodyHash: sha256(JSON.stringify({})),
  method: 'GET',
  nonce,
  path: '/ws',
  timestamp,
}
```

Important details:

- `path` is the WebSocket path without query string.
- `method` is always `GET`.
- `bodyHash` is the SHA-256 hex digest of `JSON.stringify({})`.
- `timestamp` must be fresh, within the same tolerance as signed HTTP requests.
- `nonce` can only be used once per identity in the current node process.
- `identityId` is the normalized public identity id without PEM headers,
  footers or newlines. It is not URL encoded inside the signed payload.
- `signature` is generated with the identity private key unlocked locally.

## Browser Example

```ts
import { createHash } from 'crypto';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function connectRealtime(session: Session): Promise<WebSocket> {
  const path = '/ws';
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const canonicalPayload = {
    bodyHash: sha256(JSON.stringify({})),
    method: 'GET',
    nonce,
    path,
    timestamp,
  };
  const signature = await session.encryptedKeyPair.sign(
    JSON.stringify(canonicalPayload),
    session.password,
  );
  const query = new URLSearchParams({
    identityId: session.identity.id,
    nonce,
    signature: signature.toString(),
    timestamp,
  });

  return new WebSocket(`ws://localhost:8080${path}?${query.toString()}`);
}
```

If the frontend uses Web Crypto instead of Node `crypto`, the `bodyHash` value
must still be the same lowercase SHA-256 hex digest.

## Connection Ack

After a successful connection, the node sends:

```json
{
  "type": "connection_ack",
  "identityId": "<identityId>"
}
```

`identityId` is always returned normalized, for example
`MCowBQYDK2VwAyEA...=`, never as a PEM block. The node also stores WebSocket
connections under this normalized value and compares recipients byte-for-byte
against event attributes such as `participantIds`, `recipientIdentityId` and
`ownerIdentityId`.

If the signature is invalid, stale or replayed, the upgrade is rejected with
`401 Unauthorized`.

## Heartbeat

After `connection_ack`, the frontend should keep identity presence fresh with:

```json
{
  "active": true,
  "type": "identity_heartbeat"
}
```

The node answers on the same socket:

```json
{
  "type": "heartbeat_ack",
  "identityId": "<identityId>",
  "timestamp": 1770000000000
}
```

Rules:

- send every 10 seconds while the socket is open
- send `active: true` when the user has interacted with the client since the
  previous heartbeat; otherwise omit it or send `false`
- do not sign heartbeat messages
- do not rotate nonce/timestamp for heartbeat messages
- the WebSocket handshake already authenticates the identity; the heartbeat is
  bound to that authenticated connection
- if no heartbeat is received for roughly 20 seconds, backend marks the
  identity as `disconnected`
- if heartbeat continues but no activity is seen for 5 minutes, backend derives
  `away`
- reconnect with a fresh signed WebSocket URL if no `heartbeat_ack` arrives
  within 2 intervals
- backend ignores unknown or malformed client messages

## Typing Indicators

Typing indicators are ephemeral WebSocket messages. They are not stored in
MongoDB, published to IPFS, or replayed after reconnect.

For one-to-one or group conversations, frontend sends:

```json
{
  "type": "typing",
  "scope": "conversation",
  "conversationId": "<conversationId>",
  "active": true
}
```

For community text channels, frontend sends:

```json
{
  "type": "typing",
  "scope": "community_channel",
  "communityId": "<communityId>",
  "channelId": "<channelId>",
  "active": true
}
```

Backend ignores any client-sent `identityId`. The sender identity is always the
identity authenticated by the WebSocket handshake.

Conversation typing is relayed only when the connected identity is a
participant of the conversation. Community channel typing is relayed only when
the connected identity is a community member and the channel is a text channel.
The sender identity is excluded from recipients.

Conversation typing message delivered to other participants:

```json
{
  "type": "typing",
  "scope": "conversation",
  "conversationId": "<conversationId>",
  "identityId": "<senderIdentityId>",
  "active": true,
  "timestamp": 1770000000000
}
```

Community text channel typing message delivered to other members:

```json
{
  "type": "typing",
  "scope": "community_channel",
  "communityId": "<communityId>",
  "channelId": "<channelId>",
  "identityId": "<senderIdentityId>",
  "active": true,
  "timestamp": 1770000000000
}
```

Frontend should throttle `active: true` messages, for example every 2-3 seconds
while the user keeps typing, send `active: false` when the input is sent,
cleared, blurred, or the user changes chat, and expire local typing indicators
after roughly 5 seconds without renewal.

## Event Envelope

Realtime domain events are delivered as:

```json
{
  "type": "domain_event",
  "event": {
    "aggregate_id": "<aggregateId>",
    "attributes": {},
    "causation_id": "<eventId>",
    "correlation_id": "<eventId>",
    "event_id": "<eventId>",
    "occurred_on": 1770000000000,
    "type": "<domain.event.name>"
  }
}
```

Frontend should switch on `event.type`.

## Delivered Events

| Event `type` | `aggregate_id` | Required attributes | Recipients | Recommended action |
| --- | --- | --- | --- | --- |
| `conversations.v1.conversation.was_created` | Conversation id | `networkId`, `participantIds` | Identities in `participantIds` | Refetch conversation list. |
| `conversations.v1.message.was_sent` | Conversation id | `messageId`, `authorId`, `networkId`, `participantIds` | Identities in `participantIds` | Fetch `GET /conversations/{conversationId}/messages/{messageId}` and reconcile optimistic sends by `messageId`. |
| `conversations.v1.message.was_edited` | Conversation id | `messageId`, `targetMessageId`, `networkId`, `participantIds` | Identities in `participantIds` | Fetch the edited message by `messageId`, then update the target projection. |
| `conversations.v1.message.was_deleted` | Conversation id | `messageId`, `targetMessageId`, `networkId`, `participantIds` | Identities in `participantIds` | Fetch the deletion tombstone by `messageId` or remove the target from the visible list. |
| `conversations.v1.messages.were_read` | Conversation id | `messageId`, `readerIdentityId`, `networkId`, `participantIds` | Identities in `participantIds` | Refresh conversation list or clear unread indicators for `readerIdentityId` up to `messageId`. |
| `conversations.v1.message.reaction.was_added` | Conversation id | `messageId`, `authorId`, `emoji`, `createdAt`, `networkId`, `participantIds` | Identities in `participantIds` | Add or refetch reactions for the affected message. `GET /conversations/{conversationId}/messages/{messageId}` returns the full message with reactions. |
| `conversations.v1.message.reaction.was_removed` | Conversation id | `messageId`, `authorId`, `emoji`, `createdAt`, `networkId`, `participantIds` | Identities in `participantIds` | Remove that author/emoji reaction locally or refetch the affected message. |
| `calls.v1.call.started` | Call id | `callId`, `networkId`, `scope`, `participantIds`, `creatorIdentityId`, `status` | Identities in `participantIds` | Fetch `GET /calls/{callId}` or add the call from event attributes. |
| `calls.v1.participant.joined` | Call id | `callId`, `networkId`, `scope`, `participantIds`, `joinedIdentityId`, `status` | Identities in `participantIds` | Fetch `GET /calls/{callId}` and update participant UI. |
| `calls.v1.participant.left` | Call id | `callId`, `networkId`, `scope`, `participantIds`, `leftIdentityId`, `status` | Identities in `participantIds` | Fetch `GET /calls/{callId}` or remove the identity from active participant UI. |
| `calls.v1.participant.declined` | Call id | `callId`, `networkId`, `scope`, `participantIds`, `declinedIdentityId`, `status` | Identities in `participantIds` | Fetch `GET /calls/{callId}` and show the participant as declined. |
| `calls.v1.participant.missed` | Call id | `callId`, `networkId`, `scope`, `participantIds`, `missedIdentityId`, `status` | Identities in `participantIds` | Fetch `GET /calls/{callId}` and show the participant as missed. |
| `calls.v1.call.ended` | Call id | `callId`, `networkId`, `scope`, `participantIds`, `endedByIdentityId`, `status` | Identities in `participantIds` | Mark the call ended and close local media/signalling state. |
| `calls.v1.call.missed` | Call id | `callId`, `networkId`, `scope`, `participantIds`, `missedIdentityIds`, `status` | Identities in `participantIds` | Mark the call missed and close local ringing/signalling state. |
| `calls.v1.signal.sent` | Call id | `callId`, `networkId`, `scope`, `participantIds`, `senderIdentityId`, `recipientIdentityId`, `signalType`, `payload` | `recipientIdentityId` only | Pass `payload` to the local WebRTC peer connection. |
| `conversations.v1.call.event.was_recorded` | Conversation id | `message` | Conversation participants | Insert or update the `call_event` system item in the conversation timeline. |
| `communities.v1.channel.was_created` | Community id | `communityId`, `networkId`, `memberIds`, `channel` | Community `memberIds` | Insert the text or voice channel in local community state. |
| `communities.v1.channel.was_renamed` | Community id | `communityId`, `networkId`, `memberIds`, `channelId`, `name` | Community `memberIds` | Update the channel name in local community state. |
| `communities.v1.channel.was_deleted` | Community id | `communityId`, `networkId`, `memberIds`, `channelId` | Community `memberIds` | Remove the channel locally and choose another active channel if needed. |
| `communities.v1.community.was_updated` | Community id | `communityId`, `networkId`, `memberIds`, `community` | Community `memberIds` | Replace the local community metadata with `community`. |
| `communities.v1.member.was_added` | Community id | `communityId`, `networkId`, `memberIds`, `identityId`, `community` | Community `memberIds` | Update the member list or replace the local community with `community`. |
| `communities.v1.member.was_left` | Community id | `communityId`, `networkId`, `memberIds`, `identityId`, `community` | Community `memberIds` | Remove the identity from the local member list or replace the local community with `community`. |
| `communities.v1.channel.message.reaction.was_added` | Community id | `communityId`, `channelId`, `messageId`, `authorIdentityId`, `emoji`, `createdAt`, `networkId`, `memberIds` | Community `memberIds` | Add or refetch reactions for the affected channel message. `GET /communities/{communityId}/channels/{channelId}/messages` returns messages with `reactions`. |
| `communities.v1.channel.message.reaction.was_removed` | Community id | `communityId`, `channelId`, `messageId`, `authorIdentityId`, `emoji`, `createdAt`, `networkId`, `memberIds` | Community `memberIds` | Remove that author/emoji reaction locally or refetch the channel messages. |
| `notifications.v1.notification.was_created` | Notification id | `recipientIdentityId`, `type` | `recipientIdentityId` | Refetch notifications. |
| `notifications.v1.notification.was_accepted` | Notification id | `recipientIdentityId` | `recipientIdentityId` | Refetch notifications and related conversation/keychain state. |
| `notifications.v1.notification.was_declined` | Notification id | `recipientIdentityId` | `recipientIdentityId` | Refetch notifications. |
| `identities.v1.identity.was_created` | Identity id | `networkIds` | Identity aggregate id | Refetch the affected identity. |
| `identities.v1.identity.was_updated` | Identity id | `networkIds` | Identity aggregate id | Refetch the affected identity/profile. |
| `keychains.v1.keychain.was_published` | Owner identity id | none | Owner identity id | Refetch current keychain if it belongs to the session identity. |
| `nodes.v1.node.heartbeat.was_sent` | Node id | `owner`, `networks` | All authenticated clients on the local node | Refetch `GET /peers`. |
| `nodes.v1.node.network.was_added` | Node id | implementation-specific node metadata | All authenticated clients on the local node | Refetch `GET /node/networks` and `GET /peers`. |
| `nodes.v1.node.network.was_removed` | Node id | `networkId` | All authenticated clients on the local node | Refetch `GET /node/networks` and `GET /peers`; local data for that network is no longer available. |
| `presence.v1.identity_presence.was_updated` | Identity id | `identityId`, `status`, `customMessage`, `lastHeartbeatAt`, `lastActivityAt`, `updatedAt`, `networkIds` | `identityId` | Update cached presence for that identity or refetch `GET /presence/{identityId}`. |

Sync events such as `*.sync_requested` and `*.sync_available` are node-to-node
coordination hints. They can pass through the same event envelope when produced
locally, but frontend clients should treat them as internal and prefer the
recommended refetch actions above.

Voice channels are presence rooms, not conversation calls. Community channel
call lifecycle events update the active call/channel presence UI only; they do
not create `call_event` timeline items and they do not produce missed-call
notifications.

## Routing Guarantees

The node does not broadcast every domain event to every connected client.

Delivered to the connected identity:

- `identities.*` events for that identity.
- `keychains.*` events for that keychain owner.
- `notifications.*` events where the identity is `recipientIdentityId`.
- `conversations.*` events where the identity is in `participantIds`.
- `communities.*` events where the identity is in `memberIds`.
- `calls.*` lifecycle events where the identity is in `participantIds`.
- `calls.v1.signal.sent` only when the identity is `recipientIdentityId`.
- `presence.*` events for that identity.

Delivered to all authenticated clients connected to the local node:

- `nodes.*` events, such as heartbeat and peer updates.

Dropped:

- non-node events that do not include enough identity information to route
  safely.
- events whose recipient attributes use a different identity representation
  than the normalized id acknowledged by the WebSocket connection.

## Recommended Frontend Reactions

| Event type prefix | Recommended action |
| --- | --- |
| `identities.` | Refetch the current identity or the affected identity view. |
| `keychains.` | Refetch current keychain if the event belongs to the session identity. |
| `notifications.` | Refetch notifications. |
| `conversations.v1.conversation.` | Refetch conversation list. |
| `conversations.v1.message.` | Fetch the announced message with `GET /conversations/{conversationId}/messages/{messageId}`. |
| `conversations.v1.messages.` | Refresh conversation unread counters. |
| `communities.v1.channel.` | Apply the metadata delta locally or refetch `GET /communities/{communityId}`. |
| `communities.v1.community.` | Replace or refetch the community metadata. |
| `communities.v1.member.` | Update member state or refetch the community metadata. |
| `calls.v1.call.` | Fetch `GET /calls/{callId}` unless the event already has enough data for the current view. |
| `calls.v1.participant.` | Fetch `GET /calls/{callId}` and update active participant UI. |
| `calls.v1.signal.` | If `recipientIdentityId` is the current identity, feed `payload` into the local WebRTC peer connection. |
| `nodes.` | Refetch `GET /peers/`. |
| `presence.` | Update identity presence in local caches or refetch `GET /presence/{identityId}`. |

For conversation message events, `event.aggregate_id` is the conversation id.
For sent-message events, `event.attributes.messageId` is the message id and
`event.attributes.authorId` is the author identity id. Clients can ignore or
reconcile optimistic messages from the current identity by comparing `authorId`
and `messageId`.

For reaction events, `event.aggregate_id` is the conversation id,
`event.attributes.messageId` is the target message id,
`event.attributes.authorId` is the reacting identity id and
`event.attributes.emoji` is the added/removed emoji. Reactions are stored in
MongoDB only and are included in message HTTP resources under `reactions`.

When a reply points to a message that is not loaded, use:

```http
GET /conversations/{conversationId}/messages/{messageId}/around?before=20&after=20
```

The response is:

```json
{
  "messages": [],
  "previousCursor": "<messageBeforeWindowOrNull>",
  "nextCursor": "<messageAfterWindowOrNull>"
}
```

For call events, `event.aggregate_id` is the call id. Calls are signalling only:
the backend stores active call state and routes lifecycle/signalling events, but
browser clients still own microphone/camera capture, peer connection creation,
SDP offers/answers and ICE candidate handling.

For community metadata events, `event.aggregate_id` is the community id. The
event is routed to every connected identity listed in `event.attributes.memberIds`.

For presence events, `event.aggregate_id` is the identity id whose presence
changed. `invisible` is only visible to the same identity; other identities
receive/read that identity as `disconnected`.

## Reconnect Strategy

Minimum recommended behavior:

- reconnect after `close`
- create a new `timestamp`, `nonce` and `signature` for every reconnect
- use exponential backoff with jitter
- after reconnect, refetch the views that may have changed while offline:
  notifications, conversations, latest open conversation messages and peers

The node does not currently implement client-side event acknowledgements or
resume cursors.

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
| `notifications.v1.notification.was_created` | Notification id | `recipientIdentityId`, `type` | `recipientIdentityId` | Refetch notifications. |
| `notifications.v1.notification.was_accepted` | Notification id | `recipientIdentityId` | `recipientIdentityId` | Refetch notifications and related conversation/keychain state. |
| `notifications.v1.notification.was_declined` | Notification id | `recipientIdentityId` | `recipientIdentityId` | Refetch notifications. |
| `identities.v1.identity.was_created` | Identity id | `networkIds` | Identity aggregate id | Refetch the affected identity. |
| `identities.v1.identity.was_updated` | Identity id | `networkIds` | Identity aggregate id | Refetch the affected identity/profile. |
| `keychains.v1.keychain.was_published` | Owner identity id | none | Owner identity id | Refetch current keychain if it belongs to the session identity. |
| `nodes.v1.node.heartbeat.was_sent` | Node id | `owner`, `networks` | All authenticated clients on the local node | Refetch `GET /peers`. |
| `nodes.v1.node.network.was_added` | Node id | implementation-specific node metadata | All authenticated clients on the local node | Refetch `GET /node/networks` and `GET /peers`. |

Sync events such as `*.sync_requested` and `*.sync_available` are node-to-node
coordination hints. They can pass through the same event envelope when produced
locally, but frontend clients should treat them as internal and prefer the
recommended refetch actions above.

## Routing Guarantees

The node does not broadcast every domain event to every connected client.

Delivered to the connected identity:

- `identities.*` events for that identity.
- `keychains.*` events for that keychain owner.
- `notifications.*` events where the identity is `recipientIdentityId`.
- `conversations.*` events where the identity is in `participantIds`.

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
| `nodes.` | Refetch `GET /peers/`. |

For conversation message events, `event.aggregate_id` is the conversation id.
For sent-message events, `event.attributes.messageId` is the message id and
`event.attributes.authorId` is the author identity id. Clients can ignore or
reconcile optimistic messages from the current identity by comparing `authorId`
and `messageId`.

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

## Reconnect Strategy

Minimum recommended behavior:

- reconnect after `close`
- create a new `timestamp`, `nonce` and `signature` for every reconnect
- use exponential backoff with jitter
- after reconnect, refetch the views that may have changed while offline:
  notifications, conversations, latest open conversation messages and peers

The node does not currently implement client-side event acknowledgements or
resume cursors.

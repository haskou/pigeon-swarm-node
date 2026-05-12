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
- `identityId` is the public identity id, not URL encoded inside the payload.
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

## Recommended Frontend Reactions

| Event type prefix | Recommended action |
| --- | --- |
| `identities.` | Refetch the current identity or the affected identity view. |
| `keychains.` | Refetch current keychain if the event belongs to the session identity. |
| `notifications.` | Refetch notifications. |
| `conversations.v1.conversation.` | Refetch conversation list. |
| `conversations.v1.message.` | Refetch latest messages for `event.aggregate_id`. |
| `nodes.` | Refetch `GET /peers/`. |

For conversation message events, `event.aggregate_id` is the conversation id.

## Reconnect Strategy

Minimum recommended behavior:

- reconnect after `close`
- create a new `timestamp`, `nonce` and `signature` for every reconnect
- use exponential backoff with jitter
- after reconnect, refetch the views that may have changed while offline:
  notifications, conversations, latest open conversation messages and peers

The node does not currently implement client-side event acknowledgements or
resume cursors.

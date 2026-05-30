# Frontend PWA Push Notifications

Last updated: 2026-05-18.

This document describes how the PWA registers browser Web Push subscriptions
with the node.

## Backend Contract

Get the VAPID public key:

```http
GET /push/vapid-public-key
```

```json
{
  "enabled": true,
  "publicKey": "<base64urlPublicKey>"
}
```

If `enabled` is `false`, do not call `pushManager.subscribe`. Backend only
reports push as enabled when both public and private VAPID keys are configured,
even though it only returns the public key to clients.

Backend operators generate VAPID keys once per deployment:

```bash
npx web-push generate-vapid-keys
```

They must configure:

```dotenv
PUSH_VAPID_PUBLIC_KEY=<generatedPublicKey>
PUSH_VAPID_PRIVATE_KEY=<generatedPrivateKey>
PUSH_VAPID_SUBJECT=mailto:admin@example.com
```

If production returns `enabled: false`, frontend should treat push as disabled
and report a backend configuration issue. If production returns `enabled: true`
but delivery still fails, use `POST /push/test` to inspect the push provider
status.

Register the browser subscription after login/session restore:

```http
PUT /push/subscriptions
```

This endpoint is signed with the normal HTTP signature headers. The signed body
is exactly the JSON sent to the backend.

```json
{
  "endpoint": "https://push.service/send/...",
  "expirationTime": null,
  "keys": {
    "p256dh": "<browserP256dhKey>",
    "auth": "<browserAuthSecret>"
  }
}
```

Remove the subscription on logout, permission reset, or explicit opt-out:

```http
DELETE /push/subscriptions
```

Send the same body shape used for registration.

Debug a concrete subscription:

```http
POST /push/test
```

Signed with the normal HTTP signature headers. Send `{}` to test every
subscription for the authenticated identity, or pass a concrete endpoint to
target one iOS/WebKit subscription:

```json
{
  "endpoint": "https://web.push.apple.com/..."
}
```

Backend responds with provider diagnostics:

```json
{
  "deliveries": [
    {
      "endpoint": "https://web.push.apple.com/...",
      "endpointHost": "web.push.apple.com",
      "delivered": false,
      "statusCode": 403,
      "body": "<provider error body>",
      "error": "<provider error>",
      "removed": false
    }
  ]
}
```

`removed` is `true` when the push provider returned `404` or `410` and backend
removed the stale subscription.

## Frontend Flow

1. Register the service worker.
2. Ask notification permission from a user gesture.
3. Fetch `GET /push/vapid-public-key`.
4. Subscribe with `registration.pushManager.subscribe`.
5. Send `subscription.toJSON()` to `PUT /push/subscriptions`.
6. Repeat registration after login/session restore because browsers can rotate
   subscriptions.
7. On logout, call `DELETE /push/subscriptions` if a subscription exists.

## Push Payload

Backend sends generic payloads. Message content remains encrypted in normal
conversation/community APIs.

```json
{
  "type": "message",
  "title": "New message",
  "body": "You have a new message.",
  "tag": "conversation:<conversationId>",
  "data": {
    "conversationId": "<conversationId>",
    "messageId": "<messageId>"
  }
}
```

Possible `type` values:

- `message`
- `notification`
- `call`

Service worker should call `self.registration.showNotification(title, ...)` and
handle `notificationclick` by focusing/opening the app and routing using
`payload.data`.

## Busy Presence

When the identity presence is `busy`, backend suppresses push notifications for
message and call categories. Invitation notifications are still delivered.

Frontend should still avoid local sounds while busy, matching the existing
presence behavior.

## Service Worker Cache

Backend serves `/sw.js` with `Cache-Control: no-store` when the service worker
file exists in `public/`, so browser clients should not get stuck on an old
service worker during push debugging.

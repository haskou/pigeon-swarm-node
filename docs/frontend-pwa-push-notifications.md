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

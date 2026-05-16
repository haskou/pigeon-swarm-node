# Frontend Community Invite Links

Community invite links are bearer invites. Anyone with a valid invite token and
the key material in the URL fragment can join the community.

The backend only stores and validates the invite token. It never receives the
community key.

## Create Invite

The community owner creates a token:

```http
POST /communities/{communityId}/invites
```

Signed as usual with the owner's identity.

Optional body:

```json
{
  "expiresAt": 1770000000000,
  "maxUses": 1
}
```

Response:

```json
{
  "inviteToken": "<inviteToken>",
  "communityId": "<communityId>",
  "expiresAt": 1770000000000,
  "maxUses": 1
}
```

Build the browser link with key material after `#`:

```text
https://app.example/invite/community/<inviteToken>#communityKey=<wrappedCommunityKey>
```

The fragment is not sent to the backend.

## Accept Invite

When the user opens the link:

1. Read `inviteToken` from the path.
2. Read `communityKey` from the fragment.
3. If there is no local identity, create one first.
4. Call:

```http
POST /communities/invites/{inviteToken}/accept
```

Signed with the accepting identity.

Response is the updated `CommunityResource`.

After a successful response:

1. Import the community key from the fragment into the local keychain.
2. Publish the updated keychain.
3. Open the joined community.

## Security Notes

- Treat the full invite URL as secret.
- The backend does not know whether the key material is valid.
- Default `maxUses` is `1`.
- Expired or exhausted tokens return `409`.
- If the identity is already a member, accepting is idempotent for membership,
  but still consumes an invite use.

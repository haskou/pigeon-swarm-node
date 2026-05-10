# Pigeon Swarm Action Plan

Last updated: 2026-05-10.

Keep this file short. Completed slices should move into Git history, API docs
and tests instead of staying here as long-form notes.

## Current Slice: Node Ownership And Networks

- [x] Load local node metadata from MongoDB when the API process starts.
- [x] Expose `GET /node` with node id and owner.
- [x] Expose `GET /node/networks` with local node networks.
- [x] Expose `POST /node/networks`.
- [x] Allow network additions before the node is owned.
- [x] Require the current owner signature before adding networks after claim.
- [x] Expose `PUT /node/owner` for claiming and owner transfer.
- [x] Allow only the current owner to change the owner.
- [x] Document the node API in OpenAPI and `docs/api.md`.
- [x] Cover the flow with API Cucumber tests.

## Next Slices

- Conversation invitations/notifications:
  - create a notification/invitation context for conversation membership offers
  - publish `new_conversation` invitations for invitees
  - include encrypted conversation-key envelopes per invitee
  - let invitees accept or decline before joining
  - store read state as conversation membership state, not keychain data
- Conversation remote validation:
  - validate remote message candidates before caching
  - reject candidates with invalid signatures, authors, targets or payload policy
  - publish conversation announcements through `DomainEventPublisher`
  - add PubSub consumer coverage for sent-message announcements
- Keychain consumers:
  - register published keychain candidates from PubSub
  - synchronize keychain updates from PubSub
- Client realtime:
  - expose WebSocket subscriptions behind node-side validation
  - recover missed events through HTTP pagination or sync

## Verification

```bash
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test
```

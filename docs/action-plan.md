# Pigeon Swarm Action Plan

Last updated: 2026-05-11.

Keep this file short. Completed slices should move into Git history, API docs
and tests instead of staying here as long-form notes.

## Current Slice: Conversation Message Deletion

Goal: let users delete their own conversation messages and synchronize the
deletion across nodes.

Status:

- [x] Create signed `deleted` message tombstones.
- [x] Expose `DELETE /conversations/{conversationId}/messages/{messageId}`.
- [x] Publish deletion events through the existing consumer bus.
- [x] Invalidate deleted message metadata locally.
- [x] Remove deleted message blocks from local IPFS blockstores when present.
- [ ] Validate deletion synchronization with two real nodes.

## Next Slice 1: Node Network Management

Goal: let node owners fully manage local IPFS networks.

Steps:

1. Add `DELETE /node/networks/{networkId}` or equivalent route.
2. Require owner signed request once the node is owned.
3. Remove the network from MongoDB.
4. Synchronize the runtime IPFS network registry after removal.
5. Add API Cucumber coverage and OpenAPI/docs.

## Next Slice 2: Conversation Remote Validation

Goal: make node-to-node conversation synchronization trustworthy.

Steps:

1. Validate remote message candidates before caching:
   - message signature
   - author belongs to the conversation
   - message type is allowed
   - edit/delete target exists and is valid
   - payload policy matches the conversation type
2. Return empty/not found when all remote candidates are invalid.
3. Add end-to-end validation with two nodes.

## Next Slice 3: Client Realtime

Goal: expose chat updates to clients without leaking node-to-node PubSub as the
client contract.

Steps:

1. Implement WebSocket subscriptions for authenticated clients.
2. Emit WebSocket events only after domain validation and persistence.
3. Filter subscriptions by authenticated identity and known conversations.
4. Recover missed events through HTTP pagination or sync.

Tests:

- Cucumber: client sends an encrypted 1to1 message and another connected client
  receives it by WebSocket.
- Cucumber: unauthorized conversation subscription is rejected.
- Cucumber: reconnect recovers missed events through HTTP pagination or sync.

## Later Slices

- Private attachments:
  - validate the frontend attachment flow with real 1to1 messages
  - document the encrypted attachment payload expected inside `encryptedPayload`
- Node peer heartbeats:
  - validate the flow with two real nodes running on separate networks
- Posts:
  - publish encrypted or public post payloads through IPFS
  - model author, visibility, attachments and timeline reads
  - reuse identity handles and IPFS media references
- Conversation invitations/notifications:
  - keep invitation notifications actionable
  - include encrypted conversation-key envelopes per invitee
  - let invitees accept or decline before joining
- Identity profile polish:
  - decide whether handles need reservation/conflict policies across nodes
  - add profile search/listing if product flow needs discovery beyond exact
    handle lookup

## Verification

```bash
PATH=/home/hasko/.nvm/versions/node/v24.15.0/bin:$PATH yarn test
```

# Pub/sub synchronization protocol

## Identity presence leases

`presence.v2.identity_presence.was_updated` replicates ephemeral presence over
the domain-event pub/sub transport. It is never persisted in OrbitDB or IPFS.

Each event identifies the lease owner with `ownerNodeId`. Nodes keep leases by
`(identityId, ownerNodeId)`, ignore an older snapshot only within that same
pair, and select the newest connected lease when serving presence reads.
Every authenticated client heartbeat publishes a fresh snapshot, even when the
derived status has not changed.

Only the owner node may publish the transition of its lease to `disconnected`.
Other nodes derive that transition in their local in-memory copy after the
heartbeat timeout. This prevents one node from expiring a still-active lease
owned by another node.

Selected status and custom message use `preferenceUpdatedAt`, which changes only
when the user updates those preferences. Reads merge the newest preference into
the selected live lease. A later heartbeat with an older preference therefore
cannot override `busy`, `invisible`, or a custom message selected on another
node.

The event attributes are:

```json
{
  "identityId": "<identityId>",
  "ownerNodeId": "550e8400-e29b-41d4-a716-446655440001",
  "preferenceUpdatedAt": 1770000000000,
  "selectedStatus": "available",
  "status": "available",
  "customMessage": "Building the swarm",
  "lastHeartbeatAt": 1770000000000,
  "lastActivityAt": 1770000000000,
  "updatedAt": 1770000000000,
  "networkIds": ["<networkId>"]
}
```

`customMessage`, `lastHeartbeatAt`, `lastActivityAt`, and `networkIds` may be
absent. `identityId`, `ownerNodeId`, `preferenceUpdatedAt`, `selectedStatus`,
`status`, and `updatedAt` are required.

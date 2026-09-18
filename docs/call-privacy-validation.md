# Live call privacy validation

Run these checks against matching backend and UI revisions. The fixtures create disposable identities, communities and a private network on two local nodes. They disable public bootstrap and relay discovery, and remove their own node data when finished.

## Authenticated HTTP and WebSocket integration

```sh
yarn test:integration:call-privacy
```

This exercises real signatures, HTTP authorization, persistent WebSocket connections and node-to-node replication. It checks minimal live snapshots, concurrent participation changes, lease expiration and recovery, reconnects, and denial after community membership is revoked. It is included in `test:ci`.

## Browser integration across both projects

The UI checkout must have its normal dependencies and a Playwright Chromium browser already available. This command does not install either.

```sh
PIGEON_TEST_UI_ROOT=/absolute/path/to/pigeon-swarm-ui   yarn test:integration:call-privacy:browser
```

The fixture starts two backend nodes on ports 19380 and 19381 and two Vite instances on ports 19780 and 19781. Keep these ports free. It registers users through the UI and verifies visible membership changes on both screens, including leave and rejoin. During twelve seconds of stable membership it requires continuing empty HTTP 204 heartbeats and no additional full-call GET requests. It also inspects WebSocket snapshots for unnecessary historical fields.

Both commands must run separately because they use the same backend ports. `PIGEON_TEST_SOURCE_ROOT` can select another backend checkout when the fixture is run from a separate worktree.

These checks establish presence, authorization and synchronization behavior. They do not establish public NAT reachability, ICE negotiation or bidirectional audio. Existing immutable OrbitDB/IPFS copies are not erased by filtering live responses; see [the synchronization contract](pubsub-sync-protocol.md).

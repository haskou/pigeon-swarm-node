# OrbitDB read model performance plan

## Problem

HTTP reads are still too slow in several endpoints after moving replicated state to OrbitDB.

The recurring symptom is not isolated to one route. Different endpoints show the same pattern:

- `GET /identities/:id`
- `GET /keychains/:identityId`
- `GET /communities`
- `GET /communities/:communityId/channels`
- `GET /communities/:communityId/channels/:channelId/messages`
- `GET /conversations`
- `GET /conversations/:conversationId/pins`
- `GET /notifications`
- `GET /presence`
- `GET /ipfs/:cid`

The root cause is that some repositories still use OrbitDB as if it were MongoDB. OrbitDB replicated documents are useful as replicated state, but `queryDocuments(...)` is not an indexed Mongo query. In many cases it scans documents and filters in memory. A route with `limit=1` can still be slow if the repository scans all documents before slicing the result.

There is a second class of slowness around IPFS cold reads. If content is not local, the first request may depend on peers and network fetches. That must be bounded by a short timeout, and it must not leak into BBDD-only endpoints.

## Goals

- Stop fixing one curl at a time.
- Make slow read paths visible from logs.
- Remove full OrbitDB scans from normal HTTP request paths.
- Serve hot HTTP reads from local read models / heads / indexes.
- Keep frontend contracts unchanged.
- Keep DDD boundaries intact.
- Keep OrbitDB as replicated state, not as a query engine.
- Keep IPFS lookups bounded by a maximum timeout of 10 seconds.

Expected targets:

- Simple local reads: under 100-200 ms.
- Normal list endpoints: under 300-500 ms.
- First cold repair/hydration: allowed once, logged clearly.
- Remote IPFS fetch: bounded by timeout and never used for BBDD metadata reads unless that endpoint explicitly serves IPFS content.

## Non-goals

- Do not introduce a global cache to hide the issue.
- Do not increase timeouts to make tests pass.
- Do not change frontend contracts.
- Do not move infrastructure documents into domain.
- Do not make routes aware of OrbitDB, IPFS, indexes, or repair logic.
- Do not add generic repositories that replace real domain repository contracts.
- Do not add local-only state for replicated domain data.

## Design Principles

- OrbitDB is the replicated source of truth for networked state.
- HTTP routes read through repositories/use cases, not directly from OrbitDB.
- Repositories must expose domain/application concepts, not infrastructure document shapes.
- Hot read paths must use explicit read models or indexes keyed by the access pattern.
- Full scans are allowed only in controlled repair, startup, sync, or fallback paths.
- Every index must be updated by:
  - local writes;
  - replicated events/documents;
  - startup/background repair for existing data.
- Every fallback scan must be observable.

## Phase 1: Instrument OrbitDB Reads

Add structured logging around `OrbitDBReplicatedStateRegistry.queryDocuments`.

The log should include:

- logical repository or caller name;
- OrbitDB repository/index name;
- duration in milliseconds;
- scanned document count;
- returned document count;
- whether the call happened during an HTTP request;
- request method and path when available;
- whether the scan is a normal read, startup repair, background repair, or fallback hydration.

Rules:

- If `queryDocuments` runs inside an HTTP request and takes more than 100 ms, log `warn`.
- If `queryDocuments` runs outside HTTP during repair/sync and takes more than 1 second, log `info` or `warn` depending on whether it blocks readiness.
- Logs must be actionable. They should identify the repository/access pattern that needs an index.

Acceptance criteria:

- A slow request tells us which repository scanned documents.
- We no longer need to discover slow endpoints by manually pasting repeated curls.
- Logs are not noisy at `info` during normal operation.

## Phase 2: Audit Current Read Paths

Search every use of:

- `queryDocuments`
- `queryHeads`
- `getBytes`
- `getJSON`
- `getBytesFromNetworks`
- `getJSONFromNetworks`

Classify each use:

- Allowed: startup repair, background repair, sync, migration, bounded diagnostic endpoint.
- Suspicious: repository method called by a route.
- Forbidden: `findById`, latest lookup, paginated list, or `limit=1` implemented through a full scan.
- IPFS cold path: BBDD metadata endpoint that reaches IPFS unnecessarily.

Produce a short matrix:

```text
route -> use case -> repository -> slow operation -> planned index
```

Acceptance criteria:

- Every slow route has a concrete repository-level cause.
- Every repository scan is either justified or scheduled for replacement.

## Phase 3: Critical Identity And Keychain Read Models

Read models:

- latest identity by identity id;
- latest identity by handle/name when applicable;
- latest keychain by identity id.

Rules:

- `GET /identities/:id` must not fetch IPFS bytes before checking local JSON/head state.
- `GET /keychains/:identityId` must not scan all keychains.
- If a latest head exists, return it directly.
- If the latest head is missing, hydrate once from replicated state, write the head, and return.

Acceptance criteria:

- Repeated identity and keychain reads do not call `queryDocuments`.
- First hydration is logged as fallback, not as a normal read.
- Tests cover latest-version behavior so stale identity/keychain data is not returned.

## Phase 4: Community Read Models

Read models:

- community by id;
- communities by member id;
- discoverable communities;
- community channels by community id;
- channel by id;
- deleted/tombstoned community/channel state.

Rules:

- `GET /communities` must read from `communitiesByMember`.
- `GET /communities/:communityId/channels` must read from `channelsByCommunity`.
- Creating, updating, deleting, joining, leaving, or accepting membership must update the relevant indexes.
- Replicated community events must update the same indexes.

Acceptance criteria:

- Listing communities does not scan all communities.
- Listing channels does not scan all community documents.
- Creating a channel is visible immediately in the next channels read.
- Leaving a community and deleting empty communities updates indexes.
- Tests cover local writes and replicated events.

## Phase 5: Message Read Models

Read models:

- messages by conversation id;
- message by id;
- messages by community id + channel id;
- community channel message by id;
- thread messages by parent message id;
- latest message per scope;
- deleted/tombstoned messages.

Rules:

- `limit=1` must use an index ordered by creation time, not scan all messages.
- Deleted thread roots must prevent returning their thread in channel summaries.
- Edited messages must update the indexed message document/head.
- Poll messages must be indexed as messages with extra poll state, not as a separate timeline.

Acceptance criteria:

- `GET /communities/:communityId/channels/:channelId/messages?limit=1` does not scan all channel messages.
- `GET /conversations/:conversationId/messages?limit=1` does not scan all conversation messages.
- Thread message reads do not scan the whole message repository.
- Tests cover create, edit, delete, thread, and poll-message flows.

## Phase 6: Secondary Read Models

Read models:

- pins by scope;
- reactions by message id;
- polls by message id/scope;
- read markers by identity + scope;
- notifications by recipient;
- unread notifications by recipient;
- presence by identity id;
- drafts by identity + scope.

Rules:

- Pins, reactions, polls, notifications, presence, and drafts must not scan global replicated state during route handling.
- Presence must stay ephemeral/replicated according to its existing contract, but reads must be keyed by identity id.
- Drafts are persistent but non-replicated, so they belong in the local persistence layer, not replicated network state.
- Push subscriptions are node-local and must not be replicated.

Acceptance criteria:

- `GET /notifications?limit=30` does not scan all notifications.
- `GET /presence?identityIds=...` reads by identity ids.
- `GET /conversations/:id/pins` and equivalent community pins read by scope.
- Tests cover indexes and absence/null-object behavior.

## Phase 7: Startup And Background Repair

Repair order must prioritize what the user needs to see first:

1. identities;
2. keychains;
3. communities;
4. community channels;
5. conversations;
6. latest messages;
7. pins, read markers, notifications, presence;
8. historical messages, reactions, polls.

Rules:

- Startup must not block on complete history when critical read models are ready.
- Heavy repair should run in background.
- If a repository is not ready, routes should return a clear retryable 503 only when the data genuinely cannot be served safely.
- A first/only node must not loop errors forever while waiting for peers that do not exist.

Acceptance criteria:

- Fresh node with empty local state becomes usable as soon as critical read models are ready.
- A node that later connects to a peer repairs indexes after replicated data arrives.
- Logs distinguish "not ready", "repairing", "ready", and "fallback hydrated".

## Phase 8: Architecture Guardrails

Add a lightweight regression check.

Options:

- static script that lists `queryDocuments` usages in repository methods;
- unit tests asserting second reads do not call `queryDocuments`;
- instrumentation test for selected hot endpoints;
- eslint-style warning later if useful.

Initial rule:

- `queryDocuments` is forbidden in normal request-path repository methods unless the method name and log scope explicitly mark it as repair/fallback.

Acceptance criteria:

- A new scan-heavy repository method is visible in CI or review.
- Future endpoints do not reintroduce the same latency pattern.

## Phase 9: Documentation

Document the repository pattern for OrbitDB:

- replicated documents/events are source state;
- indexes/read models serve HTTP;
- repairers can scan;
- routes/use cases cannot depend on scan behavior;
- IPFS is for content, not query-time metadata lookups;
- timeouts and fallback behavior.

Docs to update:

- `docs/orbitdb-private-sync-spike.md` only if the sync model changes;
- `docs/api.md` only if a public contract changes;
- internal architecture docs or `AGENTS.md` only if adding a permanent rule.

## Verification

Run the smallest targeted tests first:

```bash
yarn test --runInBand <targeted repository tests>
```

Then run:

```bash
yarn lint
yarn build
yarn test
```

For performance verification, measure at least:

- `GET /identities/:id`
- `GET /keychains/:identityId`
- `GET /communities`
- `GET /communities/:communityId/channels`
- `GET /communities/:communityId/channels/:channelId/messages?limit=1`
- `GET /conversations?limit=30`
- `GET /notifications?limit=30`
- `GET /presence?identityIds=...`

Expected result:

- hot repeated calls should be sub-second;
- no hot repeated call should trigger a warning from `queryDocuments`;
- first cold hydration should be clearly logged and should not repeat endlessly.

## Implementation Order

1. Add OrbitDB read instrumentation.
2. Audit all `queryDocuments` and IPFS metadata reads.
3. Fix identities/keychains read models.
4. Fix communities/channels read models.
5. Fix conversation/community message read models.
6. Fix pins/reactions/polls/read markers.
7. Fix notifications/presence/drafts.
8. Add startup/background repair ordering.
9. Add architecture guardrails.
10. Update docs and final verification.

## Frontend Impact

No frontend contract changes are expected.

Possible observable changes:

- Some endpoints may briefly return retryable `503` while replicated state is opening or repairing.
- Hot repeated reads should become significantly faster.
- First access after joining/opening a network may still be slower while the node hydrates local read models.

Frontend should already treat retryable `503` as a temporary backend-not-ready state where applicable.

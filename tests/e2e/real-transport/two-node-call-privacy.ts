import { CommunityModerationLogDetails } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogDetails';
import { CommunityModerationLogEntry } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogEntry';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { rm } from 'node:fs/promises';
import WebSocket from 'ws';

import { signCommunityOperation } from '../../support/signCommunityOperation';
import {
  addPrivateNetwork,
  buildNodeRuntime,
  IdentityFixture,
  NETWORK_ID,
  NodeRuntime,
  publishIdentity,
  request,
  signHeaders,
  signRequest,
  startNode,
  stopNode,
  waitFor,
} from './two-real-node-gossipsub';

type LiveCall = {
  id: string;
  status: string;
  participants: Array<{
    identityId: string;
    connected: boolean;
    status: string;
  }>;
  participantIds: string[];
};
type Frame = {
  type: string;
  event?: {
    type: string;
    attributes: {
      callId?: string;
      liveCallRevision?: number;
      liveCall?: LiveCall;
    };
  };
};
type Peers = {
  networkSynchronization: {
    networks: Array<{ id: string; state: string }>;
  };
};
const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function minimal(call: LiveCall): void {
  assert.ok(!('creatorIdentityId' in call));
  assert.ok(!('createdAt' in call));
  assert.deepEqual(
    [...call.participantIds].sort(),
    call.participants.map((p) => p.identityId).sort(),
  );
  for (const participant of call.participants) {
    for (const field of [
      'joinedAt',
      'leftAt',
      'declinedAt',
      'missedAt',
      'lastHeartbeatAt',
    ])
      assert.ok(!(field in participant), `Unexpected ${field}`);
    assert.notEqual(participant.status, 'left');
    assert.ok(
      !('mediaConnections' in participant),
      'Unexpected mediaConnections',
    );
  }
}

async function socket(
  node: NodeRuntime,
  identity: IdentityFixture,
): Promise<{ ws: WebSocket; frames: Frame[] }> {
  const timestamp = String(Date.now());
  const query = new URLSearchParams({
    identityId: identity.id,
    signature: signRequest(identity.keyPair, 'GET', '/ws', timestamp, {}),
    timestamp,
  });
  const ws = new WebSocket(
    `${node.baseUrl.replace('http:', 'ws:')}/ws?${query}`,
  );
  const frames: Frame[] = [];
  ws.on('message', (data) => frames.push(JSON.parse(data.toString()) as Frame));
  await waitFor(
    () => frames.some((frame) => frame.type === 'connection_ack'),
    'authenticated websocket',
  );

  return { frames, ws };
}

async function heartbeat(
  node: NodeRuntime,
  identity: IdentityFixture,
  callId: string,
): Promise<void> {
  const endpoint = `/calls/${callId}/participants/me/heartbeat`;
  const body: { mediaConnections: unknown[] } = { mediaConnections: [] };
  const response = await fetch(`${node.baseUrl}${endpoint}`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...signHeaders(identity, 'POST', endpoint, body),
    },
    method: 'POST',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 204, 'Heartbeat must return no live snapshot');
  assert.equal(await response.text(), '');
}

async function startIsolatedNodes(
  nodes: NodeRuntime[],
  key: string,
): Promise<void> {
  const configurations = nodes.map((_, index) => ({
    callsRelay: { port: 19501 + index },
    manualRelayMultiaddrs: [] as string[],
    privateRelay: {
      discoveryEnabled: false,
      enabled: true,
      portEnd: 19409 + index * 10,
      portStart: 19400 + index * 10,
      publicationEnabled: false,
    },
    publicHost: '127.0.0.1',
    publicNetwork: { enabled: false },
  }));
  for (const [index, node] of nodes.entries()) {
    await startNode(node);
    await request(
      node,
      'PUT',
      '/node/relay-configuration/',
      configurations[index],
    );
    await addPrivateNetwork(node, key);
  }
  await waitFor(
    () =>
      nodes.every((node) =>
        /Started private network "two-real-node-e2e" with Peer ID: ([A-Za-z0-9]+)/.test(
          node.stdout.join(''),
        ),
      ),
    'private network listeners',
  );
  const ports = nodes.map(
    (node) =>
      node.stdout
        .join('')
        .match(
          /Private IPFS relay server enabled:.*listenAddresses="\/ip4\/0.0.0.0\/tcp\/(\d+)"/,
        )?.[1],
  );
  assert.ok(ports.every(Boolean));
  const peers = nodes.map(
    (node) =>
      node.stdout
        .join('')
        .match(
          /Started private network "two-real-node-e2e" with Peer ID: ([A-Za-z0-9]+)/,
        )?.[1],
  );
  assert.ok(peers.every(Boolean));
  for (const [index, node] of nodes.entries()) {
    configurations[index].manualRelayMultiaddrs = [
      `/ip4/127.0.0.1/tcp/${ports[1 - index]}/p2p/${peers[1 - index]}`,
    ];
    await request(
      node,
      'PUT',
      '/node/relay-configuration/',
      configurations[index],
    );
    await stopNode(node);
    await startNode(node);
  }
  await waitFor(
    async () =>
      (
        await Promise.all(
          nodes.map((node) => request<Peers>(node, 'GET', '/peers/')),
        )
      ).every((peers) =>
        peers.networkSynchronization.networks.some(
          (network) =>
            network.id === NETWORK_ID && network.state === 'converged',
        ),
      ),
    'private network synchronization',
  );
  console.log('Fixture ready: two isolated private nodes');
}

async function main(): Promise<void> {
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  const suffix = `${process.pid}-${Date.now()}`;
  const nodes = [
    buildNodeRuntime(`privacy-a-${suffix}`, 19380),
    buildNodeRuntime(`privacy-b-${suffix}`, 19381),
  ];
  const sockets: WebSocket[] = [];
  const key = generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString();
  try {
    await startIsolatedNodes(nodes, key);
    const identities = await Promise.all(
      nodes.map((node, index) =>
        publishIdentity(node, `Privacy ${index}`, `privacy-${index}-${suffix}`),
      ),
    );
    await Promise.all(
      nodes.map((node, index) =>
        waitFor(async () => {
          try {
            await request(
              node,
              'GET',
              `/identities/${encodeURIComponent(identities[1 - index].id)}`,
            );

            return true;
          } catch {
            return false;
          }
        }, 'remote identity replication'),
      ),
    );
    console.log('Fixture identities replicated');
    const communityNonce = 'call-privacy-integration';
    const communityId = CommunityId.derive(
      NETWORK_ID,
      identities[0].id,
      communityNonce,
    ).valueOf();
    const genesis = signCommunityOperation({
      action: 'community_created',
      args: {
        autoJoinEnabled: true,
        description: 'Disposable integration fixture',
        discoverable: true,
        name: 'Call privacy integration',
        nonce: communityNonce,
        visibility: 'private',
      },
      communityId,
      createdAt: Date.now(),
      networkId: NETWORK_ID,
      parents: [],
      signer: identities[0],
    });
    const community = await request<{ id: string }>(
      nodes[0],
      'POST',
      '/communities/',
      {
        autoJoinEnabled: true,
        description: 'Disposable integration fixture',
        discoverable: true,
        name: 'Call privacy integration',
        networkId: NETWORK_ID,
        nonce: communityNonce,
        operation: genesis.body,
        visibility: 'private',
      },
      identities[0],
    );
    assert.equal(community.id, communityId);
    const channelCreatedAt = Date.now();
    const channelEntry = CommunityModerationLogEntry.create(
      new CommunityId(community.id),
      new IdentityId(identities[0].id),
      CommunityModerationAction.CHANNEL_CREATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.CHANNEL,
        CommunityChannelId.derive(
          community.id,
          identities[0].id,
          channelCreatedAt,
        ),
      ),
      new CommunityModerationLogDetails({ name: 'voice', type: 'voice' }),
      new Timestamp(channelCreatedAt),
    );
    const channelLogPayload = {
      ...channelEntry.toPrimitives(),
      scopeType: 'community_moderation_log',
    };
    const channelLogBody = {
      author: {
        deviceCredential: identities[0].deviceCredential,
        identityId: identities[0].id,
      },
      kind: 'put',
      operationId: 'call-privacy-channel-log'.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(channelLogPayload),
      predecessor: null as string | null,
      recordId: channelLogPayload.id,
      sequence: 0,
      store: 'moderationLogs',
      version: 1,
    } as const;
    const channelOperation = signCommunityOperation({
      action: 'channel_created',
      args: {
        channelId: CommunityChannelId.derive(
          community.id,
          identities[0].id,
          channelCreatedAt,
        ).valueOf(),
        name: 'voice',
        type: 'voice',
      },
      communityId: community.id,
      createdAt: channelCreatedAt,
      networkId: NETWORK_ID,
      parents: [genesis.operation.getHash()],
      signer: identities[0],
    });
    const channel = await request<{ id: string }>(
      nodes[0],
      'POST',
      `/communities/${community.id}/channels/voice`,
      {
        moderationLog: {
          createdAt: channelCreatedAt,
          mutation: PublicMutationProof.signed(
            channelLogBody,
            identities[0].deviceKeyPair.sign(
              PublicMutationProof.signingContentOf(channelLogBody),
            ),
          ).toPrimitives(),
        },
        name: 'voice',
        operation: channelOperation.body,
      },
      identities[0],
    );
    const requesterId = identities[1].id;
    const joinCreatedAt = Date.now();
    const joinAcceptedAt = joinCreatedAt + 1;
    const joinRecord = {
      communityId: community.id,
      createdAt: joinCreatedAt,
      creatorIdentityId: requesterId,
      id: CommunityRequestId.derive(
        community.id,
        'request',
        requesterId,
        requesterId,
        joinCreatedAt,
      ).valueOf(),
      identityId: requesterId,
      scopeType: 'community_membership_request',
      status: 'pending',
      type: 'request',
      updatedAt: joinCreatedAt,
    };
    const signJoin = (
      payload: Record<string, unknown>,
      sequence: number,
    ): Record<string, unknown> => {
      const body = {
        author: {
          deviceCredential: identities[1].deviceCredential,
          identityId: requesterId,
        },
        kind: 'put',
        operationId: `call-privacy-join-${sequence}`.padEnd(22, '0'),
        payloadDigest: PublicMutationProof.digestOf(payload),
        predecessor:
          sequence === 0 ? null : PublicMutationProof.digestOf(joinRecord),
        recordId: joinRecord.id,
        sequence,
        store: 'requests',
        version: 1,
      } as const;

      return PublicMutationProof.signed(
        body,
        identities[1].deviceKeyPair.sign(
          PublicMutationProof.signingContentOf(body),
        ),
      ).toPrimitives() as unknown as Record<string, unknown>;
    };
    await waitFor(async () => {
      try {
        const replicated = await request<{ frontier: string[] }>(
          nodes[1],
          'GET',
          `/communities/${community.id}`,
          undefined,
          identities[1],
        );
        const joinOperation = signCommunityOperation({
          action: 'member_joined',
          args: { identityId: requesterId, method: 'automatic' },
          communityId: community.id,
          createdAt: joinAcceptedAt,
          networkId: NETWORK_ID,
          parents: replicated.frontier,
          signer: identities[1],
        });

        await request(
          nodes[1],
          'POST',
          `/communities/${community.id}/join-requests`,
          {
            acceptedAt: joinAcceptedAt,
            acceptedMutation: signJoin(
              { ...joinRecord, status: 'accepted', updatedAt: joinAcceptedAt },
              1,
            ),
            createdAt: joinCreatedAt,
            mutation: signJoin(joinRecord, 0),
            operation: joinOperation.body,
          },
          identities[1],
        );

        return true;
      } catch {
        return false;
      }
    }, 'community replication');
    const scope = {
      channelId: channel.id,
      communityId: community.id,
      scopeType: 'community_channel',
    };
    await waitFor(async () => {
      const replicated = await request<{
        voiceChannels: Array<{ id: string }>;
      }>(
        nodes[1],
        'GET',
        `/communities/${community.id}`,
        undefined,
        identities[1],
      );

      return replicated.voiceChannels.some(
        (candidate) => candidate.id === channel.id,
      );
    }, 'voice channel replication');
    const streams = await Promise.all(
      nodes.map((node, index) => socket(node, identities[index])),
    );
    sockets.push(...streams.map((stream) => stream.ws));
    const started = await Promise.all(
      nodes.map((node, index) =>
        request<LiveCall>(node, 'POST', '/calls/', scope, identities[index]),
      ),
    );
    assert.equal(
      started[0].id,
      started[1].id,
      'Concurrent fresh starts must select one channel session',
    );
    let callId = started[0].id;
    const converge = async (expected: string[]): Promise<void> => {
      await waitFor(async () => {
        const snapshots = await Promise.all(
          nodes.map((node, index) =>
            request<LiveCall>(
              node,
              'GET',
              `/calls/${callId}`,
              undefined,
              identities[index],
            ),
          ),
        );
        snapshots.forEach(minimal);

        return snapshots.every(
          (snapshot) =>
            JSON.stringify(
              snapshot.participants
                .filter((p) => p.connected)
                .map((p) => p.identityId)
                .sort(),
            ) === JSON.stringify([...expected].sort()),
        );
      }, 'two-node live membership convergence');
    };
    await converge(identities.map((identity) => identity.id));
    for (let cycle = 0; cycle < 2; cycle++) {
      await Promise.all(
        nodes.map((node, index) =>
          request(
            node,
            'DELETE',
            `/calls/${callId}/participants/me`,
            undefined,
            identities[index],
          ),
        ),
      );
      await converge([]);
      await Promise.all(
        nodes.map((node, index) =>
          request(node, 'POST', '/calls/', scope, identities[index]),
        ),
      );
      await converge(identities.map((identity) => identity.id));
    }
    for (let count = 0; count < 3; count++) {
      await Promise.all(
        nodes.map((node, index) => heartbeat(node, identities[index], callId)),
      );
      await pause(1000);
    }
    await waitFor(
      () =>
        streams.every((stream) =>
          stream.frames.some(
            (frame) => frame.event?.attributes.liveCall?.id === callId,
          ),
        ),
      'live snapshots on both sockets',
    );
    for (const stream of streams) {
      let revision = -1;
      for (const frame of stream.frames) {
        if (!frame.event?.attributes.liveCall) continue;
        minimal(frame.event.attributes.liveCall);
        assert.deepEqual(Object.keys(frame.event.attributes).sort(), [
          'callId',
          'liveCall',
          'liveCallRevision',
        ]);
        assert.ok(
          Number.isSafeInteger(frame.event.attributes.liveCallRevision),
        );
        assert.ok(
          frame.event.attributes.liveCallRevision! > revision,
          'Server live revisions must increase',
        );
        revision = frame.event.attributes.liveCallRevision!;
      }
    }
    await converge([]);
    await Promise.all(
      nodes.map((node, index) => heartbeat(node, identities[index], callId)),
    );
    await converge(identities.map((identity) => identity.id));
    const previousCallId = callId;
    await request(
      nodes[0],
      'DELETE',
      `/calls/${callId}`,
      undefined,
      identities[0],
    );
    await waitFor(async () => {
      const ended = await request<LiveCall>(
        nodes[1],
        'GET',
        `/calls/${callId}`,
        undefined,
        identities[1],
      );

      return ended.status === 'ended';
    }, 'explicit session termination replication');
    const restarted = await Promise.all(
      nodes.map((node, index) =>
        request<LiveCall>(node, 'POST', '/calls/', scope, identities[index]),
      ),
    );
    assert.equal(
      restarted[0].id,
      restarted[1].id,
      'Concurrent restarts must select the same next session',
    );
    assert.notEqual(
      restarted[0].id,
      previousCallId,
      'An ended session must not be resurrected',
    );
    callId = restarted[0].id;
    await converge(identities.map((identity) => identity.id));
    streams[0].ws.close();
    const reconnected = await socket(nodes[0], identities[0]);
    sockets.push(reconnected.ws);
    minimal(
      await request<LiveCall>(
        nodes[0],
        'GET',
        `/calls/${callId}`,
        undefined,
        identities[0],
      ),
    );
    const beforeLeave = await request<{ frontier: string[] }>(
      nodes[1],
      'GET',
      `/communities/${community.id}`,
      undefined,
      identities[1],
    );
    await request(
      nodes[1],
      'DELETE',
      `/communities/${community.id}/members/me`,
      {
        operation: signCommunityOperation({
          action: 'member_left',
          args: { identityId: identities[1].id },
          communityId: community.id,
          createdAt: Date.now(),
          networkId: NETWORK_ID,
          parents: beforeLeave.frontier,
          signer: identities[1],
        }).body,
      },
      identities[1],
    );
    await waitFor(async () => {
      const responses = await Promise.all(
        nodes.map(async (node) => {
          const endpoint = `/calls/${callId}`;

          return fetch(`${node.baseUrl}${endpoint}`, {
            headers: signHeaders(identities[1], 'GET', endpoint, {}),
            signal: AbortSignal.timeout(10000),
          });
        }),
      );

      return responses.every(
        (response) => response.status >= 400 && response.status < 500,
      );
    }, 'revoked access on both nodes');
    await pause(1000);
    const frameBoundary = streams[1].frames.length;
    await request(
      nodes[0],
      'DELETE',
      `/calls/${callId}/participants/me`,
      undefined,
      identities[0],
    );
    await request(nodes[0], 'POST', '/calls/', scope, identities[0]);
    await pause(3000);
    assert.equal(
      streams[1].ws.readyState,
      WebSocket.OPEN,
      'Revocation must be tested on the existing socket',
    );
    assert.ok(
      !streams[1].frames
        .slice(frameBoundary)
        .some(
          (frame) =>
            frame.event?.attributes.callId === callId ||
            frame.event?.attributes.liveCall?.id === callId,
        ),
      'Revoked socket received future call state',
    );
    console.log(
      'PASS: real two-node signed HTTP and websocket call privacy, simultaneous rejoin, reconnect, heartbeat and current membership revocation',
    );
  } finally {
    sockets.forEach((ws) => ws.terminate());
    await Promise.all(nodes.map(stopNode));
    await Promise.all(
      nodes.map((node) =>
        rm(node.ipfsPath.replace(/[/]ipfs$/, ''), {
          force: true,
          recursive: true,
        }),
      ),
    );
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { startIsolatedNodes };

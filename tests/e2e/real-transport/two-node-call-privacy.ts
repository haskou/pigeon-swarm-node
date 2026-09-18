import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { rm } from 'node:fs/promises';
import WebSocket from 'ws';

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
  participants: Array<{
    identityId: string;
    connected: boolean;
    status: string;
    mediaConnections: unknown[];
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
    assert.deepEqual(participant.mediaConnections, []);
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
    publicHost: '127.0.0.1',
    callsRelay: { port: 19501 + index },
    privateRelay: {
      enabled: true,
      portStart: 19400 + index * 10,
      portEnd: 19409 + index * 10,
      publicationEnabled: false,
      discoveryEnabled: false,
    },
    publicNetwork: { enabled: false },
    manualRelayMultiaddrs: [] as string[],
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
      },
      identities[0],
    );
    const channel = await request<{ id: string }>(
      nodes[0],
      'POST',
      `/communities/${community.id}/channels/voice`,
      { name: 'voice' },
      identities[0],
    );
    await waitFor(async () => {
      try {
        await request(
          nodes[1],
          'POST',
          `/communities/${community.id}/join-requests`,
          {},
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
    let call: LiveCall | undefined;
    await waitFor(async () => {
      try {
        call = await request<LiveCall>(
          nodes[0],
          'POST',
          '/calls/',
          scope,
          identities[0],
        );

        return true;
      } catch {
        return false;
      }
    }, 'community membership replication');
    assert.ok(call);
    const callId = call.id;
    const streams = await Promise.all(
      nodes.map((node, index) => socket(node, identities[index])),
    );
    sockets.push(...streams.map((stream) => stream.ws));
    await waitFor(async () => {
      try {
        await request(nodes[1], 'POST', '/calls/', scope, identities[1]);

        return true;
      } catch {
        return false;
      }
    }, 'remote call join');
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
    await request(
      nodes[1],
      'DELETE',
      `/communities/${community.id}/members/me`,
      undefined,
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

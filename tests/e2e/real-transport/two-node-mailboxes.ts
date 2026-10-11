import { MailboxCreationProof } from '@app/contexts/mailboxes/domain/MailboxCreationProof';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';

import type { NodeRuntime } from './two-real-node-gossipsub';

import { teardownAndExit } from './RealTransportTeardown';
import {
  NETWORK_ID,
  addPrivateNetwork,
  buildNodeRuntime,
  generateNetworkKey,
  request,
  startNode,
  stopNode,
  waitFor,
} from './two-real-node-gossipsub';

const NODE_A_PORT = 19210;
const NODE_B_PORT = 19211;

type Mailbox = {
  id: string;
  postToken: string;
  postTokenHash: string;
  readToken: string;
  readTokenHash: string;
};

type Envelope = { body: string; envelopeId: string };

type Page = {
  envelopes: Array<Envelope & { cursor: number }>;
  hasMore: boolean;
};

type PeersResponse = {
  networkSynchronization: {
    networks: Array<{ connectedPeerIds: string[]; id: string }>;
  };
};

function newMailbox(): Mailbox {
  const postToken = randomBytes(32).toString('base64url');
  const readToken = randomBytes(32).toString('base64url');

  return {
    id: randomBytes(32).toString('base64url'),
    postToken,
    postTokenHash: createHash('sha256').update(postToken).digest('hex'),
    readToken,
    readTokenHash: createHash('sha256').update(readToken).digest('hex'),
  };
}

function newEnvelope(): Envelope {
  return {
    body: randomBytes(1024).toString('base64url'),
    envelopeId: randomBytes(16).toString('base64url'),
  };
}

async function putMailbox(
  node: NodeRuntime,
  mailbox: Mailbox,
  withProof: boolean,
): Promise<number> {
  const response = await fetch(`${node.baseUrl}/mailboxes/${mailbox.id}`, {
    body: JSON.stringify({
      creationNonce: withProof
        ? MailboxCreationProof.mine(
            mailbox.id,
            mailbox.postTokenHash,
            mailbox.readTokenHash,
          )
        : undefined,
      postTokenHash: mailbox.postTokenHash,
      readTokenHash: mailbox.readTokenHash,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  });

  return response.status;
}

async function postEnvelope(
  node: NodeRuntime,
  mailbox: Mailbox,
  envelope: Envelope,
  expectedStatus: number,
): Promise<number> {
  const response = await fetch(
    `${node.baseUrl}/mailboxes/${mailbox.id}/envelopes`,
    {
      body: JSON.stringify(envelope),
      headers: {
        authorization: `Bearer ${mailbox.postToken}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    },
  );

  assert.equal(
    response.status,
    expectedStatus,
    `envelope POST to ${node.name} returned ${response.status}`,
  );

  const { cursor } = (await response.json()) as { cursor: number };

  return cursor;
}

async function readPage(
  node: NodeRuntime,
  mailbox: Mailbox,
  after: number,
): Promise<Page> {
  const response = await fetch(
    `${node.baseUrl}/mailboxes/${mailbox.id}/envelopes?after=${after}&limit=10`,
    { headers: { authorization: `Bearer ${mailbox.readToken}` } },
  );

  assert.equal(
    response.status,
    200,
    `envelope read from ${node.name} returned ${response.status}`,
  );

  return (await response.json()) as Page;
}

async function acknowledge(
  node: NodeRuntime,
  mailbox: Mailbox,
  upTo: number,
): Promise<void> {
  const response = await fetch(`${node.baseUrl}/mailboxes/${mailbox.id}/ack`, {
    body: JSON.stringify({ upTo }),
    headers: {
      authorization: `Bearer ${mailbox.readToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });

  assert.equal(
    response.status,
    204,
    `ack on ${node.name} returned ${response.status}`,
  );
}

/**
 * Peers are only "connected" once the libp2p transport has linked them on the
 * private network; the mailbox proof is meaningless over an unlinked pair.
 */
async function waitForPeers(node: NodeRuntime): Promise<void> {
  await waitFor(async () => {
    const peers = await request<PeersResponse>(node, 'GET', '/peers/');

    return peers.networkSynchronization.networks.some(
      (network) =>
        network.id === NETWORK_ID && network.connectedPeerIds.length > 0,
    );
  }, `${node.name} to connect to its peer on the private network`);
}

async function verify(nodeA: NodeRuntime, nodeB: NodeRuntime): Promise<void> {
  const mailbox = newMailbox();

  assert.equal(
    await putMailbox(nodeA, mailbox, false),
    400,
    'a mailbox without proof of work must be refused',
  );
  assert.equal(await putMailbox(nodeA, mailbox, true), 201);
  assert.equal(await putMailbox(nodeA, mailbox, true), 200);
  assert.equal(await putMailbox(nodeB, mailbox, true), 201);

  // The sender delivers to node A; a repeated envelope keeps its first cursor.
  const delivered = newEnvelope();

  assert.equal(await postEnvelope(nodeA, mailbox, delivered, 201), 1);
  assert.equal(await postEnvelope(nodeA, mailbox, delivered, 200), 1);

  // The recipient retrieves it from node A and acknowledges it.
  assert.deepEqual(await readPage(nodeA, mailbox, 0), {
    envelopes: [{ ...delivered, cursor: 1 }],
    hasMore: false,
  });
  await acknowledge(nodeA, mailbox, 1);
  assert.deepEqual((await readPage(nodeA, mailbox, 0)).envelopes, []);

  // Node B serves the same mailbox from its own queue.
  const onB = newEnvelope();

  assert.equal(await postEnvelope(nodeB, mailbox, onB, 201), 1);
  assert.deepEqual(await readPage(nodeB, mailbox, 0), {
    envelopes: [{ ...onB, cursor: 1 }],
    hasMore: false,
  });
  await acknowledge(nodeB, mailbox, 1);
  assert.deepEqual((await readPage(nodeB, mailbox, 0)).envelopes, []);

  // An unacknowledged envelope on node A survives a restart and can still be
  // read and acknowledged.
  const pending = newEnvelope();
  const pendingCursor = await postEnvelope(nodeA, mailbox, pending, 201);

  assert.ok(
    pendingCursor > 1,
    'the cursor must advance past the acknowledged envelope',
  );
  await stopNode(nodeA);
  await startNode(nodeA);
  await waitForPeers(nodeA);
  assert.deepEqual(await readPage(nodeA, mailbox, 0), {
    envelopes: [{ ...pending, cursor: pendingCursor }],
    hasMore: false,
  });
  await acknowledge(nodeA, mailbox, pendingCursor);
  assert.deepEqual((await readPage(nodeA, mailbox, 0)).envelopes, []);

  // Mailboxes are not replicated: one created only on node A is unknown on B.
  const onlyOnA = newMailbox();

  assert.equal(await putMailbox(nodeA, onlyOnA, true), 201);

  const unknown = await fetch(
    `${nodeB.baseUrl}/mailboxes/${onlyOnA.id}/envelopes?after=0&limit=10`,
    { headers: { authorization: `Bearer ${onlyOnA.readToken}` } },
  );

  assert.equal(
    unknown.status,
    404,
    'node B must not know a mailbox created only on node A',
  );
}

async function main(): Promise<void> {
  const networkKey = generateNetworkKey();
  const nodeA = buildNodeRuntime('mailbox-two-node-a', NODE_A_PORT);
  const nodeB = buildNodeRuntime('mailbox-two-node-b', NODE_B_PORT);

  try {
    await startNode(nodeA);
    await addPrivateNetwork(nodeA, networkKey);
    await startNode(nodeB);
    await addPrivateNetwork(nodeB, networkKey);
    await waitForPeers(nodeA);
    await waitForPeers(nodeB);

    await verify(nodeA, nodeB);
    console.log('two-node mailboxes: passed');
  } catch (error) {
    console.error(
      `two-node mailboxes: failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }

  // Both node directories sit under the harness fixture root.
  await teardownAndExit(
    [
      { helia: { stop: () => stopNode(nodeA) }, name: nodeA.name },
      { helia: { stop: () => stopNode(nodeB) }, name: nodeB.name },
    ],
    path.dirname(path.dirname(nodeA.localDbPath)),
  );
}

void main();

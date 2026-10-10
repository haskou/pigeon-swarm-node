import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import WebSocket from 'ws';

import type { NodeRuntime } from './two-real-node-gossipsub';

import { teardownAndExit } from './RealTransportTeardown';
import {
  buildNodeRuntime,
  signRequest,
  startNode,
  stopNode,
  waitFor,
} from './two-real-node-gossipsub';

const NODE_PORT = 19190;
const HINT_GRACE_MS = 1500;

type ServerMessage = { type: string; [key: string]: unknown };

type Socket = { messages: ServerMessage[]; ws: WebSocket };

async function openSocket(node: NodeRuntime, label: string): Promise<Socket> {
  const keyPair = await KeyPair.generate();
  const identityId = new IdentityId(keyPair.toPrimitives().publicKey).valueOf();
  const timestamp = String(Date.now());
  const query = new URLSearchParams({
    identityId,
    signature: signRequest(keyPair, 'GET', '/ws', timestamp, {}),
    timestamp,
  });
  const ws = new WebSocket(
    `ws://127.0.0.1:${node.port}/ws?${query.toString()}`,
  );
  const socket: Socket = { messages: [], ws };

  ws.on('message', (data) => {
    socket.messages.push(JSON.parse(data.toString()) as ServerMessage);
  });

  await waitFor(
    () => socket.messages.some((message) => message.type === 'connection_ack'),
    `${label} socket to acknowledge its connection`,
  );

  return socket;
}

function hintsOf(socket: Socket): ServerMessage[] {
  return socket.messages.filter(
    (message) => message.type === 'mailbox_envelope',
  );
}

async function postEnvelope(
  node: NodeRuntime,
  mailboxId: string,
  postToken: string,
): Promise<number> {
  const response = await fetch(
    `${node.baseUrl}/mailboxes/${mailboxId}/envelopes`,
    {
      body: JSON.stringify({
        body: randomBytes(1024).toString('base64url'),
        envelopeId: randomBytes(16).toString('base64url'),
      }),
      headers: {
        authorization: `Bearer ${postToken}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    },
  );

  assert.ok(
    response.status === 201 || response.status === 200,
    `envelope POST returned ${response.status}`,
  );

  const { cursor } = (await response.json()) as { cursor: number };

  return cursor;
}

async function verify(node: NodeRuntime): Promise<void> {
  const mailboxId = randomBytes(32).toString('base64url');
  const postToken = randomBytes(32).toString('base64url');
  const readToken = randomBytes(32).toString('base64url');
  const put = await fetch(`${node.baseUrl}/mailboxes/${mailboxId}`, {
    body: JSON.stringify({
      postTokenHash: createHash('sha256').update(postToken).digest('hex'),
      readTokenHash: createHash('sha256').update(readToken).digest('hex'),
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  });

  assert.ok(put.ok, `mailbox PUT returned ${put.status}`);

  const subscriber = await openSocket(node, 'subscriber');
  const unsubscribed = await openSocket(node, 'unsubscribed');
  const wrongCapability = await openSocket(node, 'wrong-capability');

  // Rejected negative: subscribes with the post capability instead of the read one.
  wrongCapability.ws.send(
    JSON.stringify({
      mailboxId,
      readToken: postToken,
      type: 'mailbox_subscribe',
    }),
  );
  subscriber.ws.send(
    JSON.stringify({ mailboxId, readToken, type: 'mailbox_subscribe' }),
  );

  // The design has no subscription ack, so post until the hint arrives.
  const postedCursors = new Set<number>();

  await waitFor(async () => {
    postedCursors.add(await postEnvelope(node, mailboxId, postToken));

    return hintsOf(subscriber).length > 0;
  }, 'subscriber to receive a mailbox_envelope hint');

  for (let index = 0; index < 2; index += 1) {
    postedCursors.add(await postEnvelope(node, mailboxId, postToken));
  }

  const { promise, resolve } = Promise.withResolvers<void>();

  setTimeout(resolve, HINT_GRACE_MS);
  await promise;

  const hints = hintsOf(subscriber);

  assert.ok(hints.length >= 1, 'subscriber received no hint');

  for (const hint of hints) {
    assert.deepEqual(Object.keys(hint).sort(), ['cursor', 'mailboxId', 'type']);
    assert.equal(hint.type, 'mailbox_envelope');
    assert.equal(hint.mailboxId, mailboxId);
    assert.ok(postedCursors.has(hint.cursor as number), 'unknown hint cursor');
  }

  assert.equal(
    hintsOf(unsubscribed).length,
    0,
    'unsubscribed socket received a hint',
  );
  assert.equal(
    hintsOf(wrongCapability).length,
    0,
    'wrong-capability socket received a hint',
  );

  for (const socket of [subscriber, unsubscribed, wrongCapability]) {
    socket.ws.close();
  }
}

async function main(): Promise<void> {
  const node = buildNodeRuntime('mailbox-realtime', NODE_PORT);

  try {
    await startNode(node);
    await verify(node);
    console.log('mailbox realtime hint: passed');
  } catch (error) {
    console.error(
      `mailbox realtime hint: failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }

  await teardownAndExit(
    [{ helia: { stop: () => stopNode(node) }, name: node.name }],
    path.dirname(node.localDbPath),
  );
}

void main();

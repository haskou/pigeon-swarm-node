import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
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

const NODE_PORT = 19200;
const PROTOCOL_VERSION = 'pigeon-realtime.v1';
const TICKETS_PATH = '/realtime/v1/tickets';
const TICKET_WS_PATH = '/realtime/v1';
const SIGNED_WS_PATH = '/ws';

type ServerMessage = { type: string; [key: string]: unknown };

type Attempt =
  | { status: number }
  | { messages: ServerMessage[]; protocol: string; ws: WebSocket };

async function issueTicket(node: NodeRuntime): Promise<string> {
  const keyPair = await KeyPair.generate();
  const identityId = new IdentityId(keyPair.toPrimitives().publicKey).valueOf();
  const timestamp = String(Date.now());
  const response = await fetch(`${node.baseUrl}${TICKETS_PATH}`, {
    headers: {
      'x-identity-id': identityId,
      'x-signature': signRequest(keyPair, 'POST', TICKETS_PATH, timestamp, {}),
      'x-timestamp': timestamp,
    },
    method: 'POST',
  });

  assert.equal(response.status, 201, `ticket POST returned ${response.status}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const { expiresAt, ticket } = (await response.json()) as {
    expiresAt: number;
    ticket: string;
  };

  assert.match(ticket, /^[A-Za-z0-9_-]{43}$/, 'ticket is not base64url');
  assert.ok(expiresAt > Date.now(), 'ticket expiry is not in the future');

  return ticket;
}

function connect(
  node: NodeRuntime,
  target: string,
  protocols: string[],
): Promise<Attempt> {
  const { promise, resolve } = Promise.withResolvers<Attempt>();
  const messages: ServerMessage[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${node.port}${target}`, protocols);

  ws.on('message', (data) => {
    messages.push(JSON.parse(data.toString()) as ServerMessage);
  });
  ws.on('open', () => {
    resolve({ messages, protocol: ws.protocol, ws });
  });
  ws.on('unexpected-response', (_request, response) => {
    resolve({ status: response.statusCode ?? 0 });
    response.destroy();
  });
  ws.on('error', () => undefined);

  return promise;
}

async function verify(node: NodeRuntime): Promise<void> {
  const ticket = await issueTicket(node);
  const protocols = [PROTOCOL_VERSION, `ticket.${ticket}`];
  const attempt = await connect(node, TICKET_WS_PATH, protocols);

  assert.ok(!('status' in attempt), 'ticket upgrade was refused');
  assert.equal(attempt.protocol, PROTOCOL_VERSION);

  await waitFor(
    () => attempt.messages.some((message) => message.type === 'connection_ack'),
    'ticket socket to acknowledge its connection',
  );
  attempt.ws.close();

  const replay = await connect(node, TICKET_WS_PATH, protocols);

  assert.ok('status' in replay, 'replayed ticket was accepted');
  assert.equal(replay.status, 401, 'replayed ticket was not refused with 401');

  const signedPathAttempt = await connect(node, SIGNED_WS_PATH, [
    PROTOCOL_VERSION,
    `ticket.${await issueTicket(node)}`,
  ]);

  assert.ok(
    'status' in signedPathAttempt,
    'ticket authenticated the signed /ws path',
  );
  assert.equal(signedPathAttempt.status, 401);
}

async function main(): Promise<void> {
  const node = buildNodeRuntime('realtime-ticket', NODE_PORT);

  try {
    await startNode(node);
    await verify(node);
    console.log('realtime ticket upgrade: passed');
  } catch (error) {
    console.error(
      `realtime ticket upgrade: failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }

  await teardownAndExit(
    [{ helia: { stop: () => stopNode(node) }, name: node.name }],
    path.dirname(node.localDbPath),
  );
}

void main();

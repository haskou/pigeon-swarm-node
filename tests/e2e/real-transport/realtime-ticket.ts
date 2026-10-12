import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import WebSocket from 'ws';

import type { NodeRuntime } from './two-real-node-gossipsub';

import { teardownAndExit } from './RealTransportTeardown';
import {
  issueRealtimeTicket,
  REALTIME_PROTOCOL_VERSION,
  REALTIME_WS_PATH,
  ticketProtocols,
} from './RealtimeTicketClient';
import {
  buildNodeRuntime,
  signRequest,
  startNode,
  stopNode,
  waitFor,
} from './two-real-node-gossipsub';

const NODE_PORT = 19200;
const LEGACY_WS_PATH = '/ws';

type ServerMessage = { type: string; [key: string]: unknown };

type Attempt =
  | { status: number }
  | { messages: ServerMessage[]; protocol: string; ws: WebSocket };

function signedQuery(keyPair: KeyPair, requestPath: string): string {
  const timestamp = String(Date.now());

  return new URLSearchParams({
    identityId: new IdentityId(keyPair.toPrimitives().publicKey).valueOf(),
    signature: signRequest(keyPair, 'GET', requestPath, timestamp, {}),
    timestamp,
  }).toString();
}

function connect(
  node: NodeRuntime,
  target: string,
  protocols: string[],
  headers: Record<string, string> = {},
): Promise<Attempt> {
  const { promise, resolve } = Promise.withResolvers<Attempt>();
  const messages: ServerMessage[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${node.port}${target}`, protocols, {
    headers,
  });

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
  const ticket = await issueRealtimeTicket(node, await KeyPair.generate());
  const attempt = await connect(
    node,
    REALTIME_WS_PATH,
    ticketProtocols(ticket),
  );

  assert.ok(!('status' in attempt), 'ticket upgrade was refused');
  assert.equal(attempt.protocol, REALTIME_PROTOCOL_VERSION);

  await waitFor(
    () => attempt.messages.some((message) => message.type === 'connection_ack'),
    'ticket socket to acknowledge its connection',
  );
  attempt.ws.close();

  const replay = await connect(
    node,
    REALTIME_WS_PATH,
    ticketProtocols(ticket),
  );

  assert.ok('status' in replay, 'replayed ticket was accepted');
  assert.equal(replay.status, 401, 'replayed ticket was not refused with 401');

  const retired = await connect(
    node,
    LEGACY_WS_PATH,
    ticketProtocols(await issueRealtimeTicket(node, await KeyPair.generate())),
  );

  assert.ok('status' in retired, 'ticket authenticated the retired /ws path');
  assert.equal(retired.status, 404, 'retired /ws path was not refused with 404');

  const keyPair = await KeyPair.generate();
  const legacyQuery = await connect(
    node,
    `${LEGACY_WS_PATH}?${signedQuery(keyPair, LEGACY_WS_PATH)}`,
    [],
  );

  assert.ok('status' in legacyQuery, 'signed query authenticated /ws');
  assert.equal(
    legacyQuery.status,
    404,
    'signed query on /ws was not refused with 404',
  );

  const realtimeQuery = await connect(
    node,
    `${REALTIME_WS_PATH}?${signedQuery(keyPair, REALTIME_WS_PATH)}`,
    [REALTIME_PROTOCOL_VERSION],
  );

  assert.ok(
    'status' in realtimeQuery,
    'signed query authenticated /realtime/v1 without a ticket',
  );
  assert.equal(
    realtimeQuery.status,
    401,
    'signed query on /realtime/v1 was not refused with 401',
  );

  const ambientCookie = await connect(
    node,
    REALTIME_WS_PATH,
    [REALTIME_PROTOCOL_VERSION],
    { Cookie: 'session=abc; identityId=victim' },
  );

  assert.ok(
    'status' in ambientCookie,
    'ambient cookie authenticated /realtime/v1 without a ticket',
  );
  assert.equal(
    ambientCookie.status,
    401,
    'ambient cookie on /realtime/v1 was not refused with 401',
  );
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

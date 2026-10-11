import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import type { KeyPair } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

import type { NodeRuntime } from './two-real-node-gossipsub';

export const REALTIME_PROTOCOL_VERSION = 'pigeon-realtime.v1';
export const REALTIME_WS_PATH = '/realtime/v1';
const TICKETS_PATH = '/realtime/v1/tickets';

export function ticketProtocols(ticket: string): string[] {
  return [REALTIME_PROTOCOL_VERSION, `ticket.${ticket}`];
}

export async function issueRealtimeTicket(
  node: NodeRuntime,
  keyPair: KeyPair,
): Promise<string> {
  const identityId = new IdentityId(keyPair.toPrimitives().publicKey).valueOf();
  const timestamp = String(Date.now());
  const payload = new SignedHttpRequestVerifier().getCanonicalPayload(
    'POST',
    TICKETS_PATH,
    timestamp,
    {},
  );
  const response = await fetch(`${node.baseUrl}${TICKETS_PATH}`, {
    headers: {
      'x-identity-id': identityId,
      'x-signature': keyPair.sign(JSON.stringify(payload)).valueOf(),
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

export function connectRealtimeSocket(
  node: NodeRuntime,
  ticket: string,
): WebSocket {
  return new WebSocket(
    `ws://127.0.0.1:${node.port}${REALTIME_WS_PATH}`,
    ticketProtocols(ticket),
  );
}

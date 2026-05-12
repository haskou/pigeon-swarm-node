import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { WebSocketConnectionAuthenticator } from '@app/shared/infrastructure/websocket/WebSocketConnectionAuthenticator';
import { KeyPair } from '@haskou/value-objects';
import { randomUUID } from 'crypto';
import { IncomingMessage } from 'http';

describe('WebSocketConnectionAuthenticator', () => {
  const websocketPath = '/ws';
  let authenticator: WebSocketConnectionAuthenticator;

  beforeEach(() => {
    authenticator = new WebSocketConnectionAuthenticator();
  });

  it('authenticates browser websocket requests signed through query params', async () => {
    const keyPair = await KeyPair.generate();
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const signature = signWebSocketRequest(
      keyPair,
      websocketPath,
      timestamp,
      nonce,
    );
    const request = buildQueryRequest(
      identityId,
      timestamp,
      nonce,
      signature,
    );

    const authenticatedIdentityId = authenticator.authenticate(
      request,
      websocketPath,
    );

    expect(authenticatedIdentityId.toString()).toBe(identityId.toString());
  });

  it('rejects reused websocket nonces', async () => {
    const keyPair = await KeyPair.generate();
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const signature = signWebSocketRequest(
      keyPair,
      websocketPath,
      timestamp,
      nonce,
    );
    const request = buildQueryRequest(
      identityId,
      timestamp,
      nonce,
      signature,
    );

    authenticator.authenticate(request, websocketPath);

    expect(() => authenticator.authenticate(request, websocketPath)).toThrow(
      'Invalid signed request.',
    );
  });

  it('rejects signatures built for a different path', async () => {
    const keyPair = await KeyPair.generate();
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const signature = signWebSocketRequest(
      keyPair,
      '/wrong-path',
      timestamp,
      nonce,
    );
    const request = buildQueryRequest(
      identityId,
      timestamp,
      nonce,
      signature,
    );

    expect(() => authenticator.authenticate(request, websocketPath)).toThrow(
      'Invalid signed request.',
    );
  });
});

function signWebSocketRequest(
  keyPair: KeyPair,
  path: string,
  timestamp: string,
  nonce: string,
): string {
  const signedRequestPayload = new SignedHttpRequestVerifier().getCanonicalPayload(
    'GET',
    path,
    timestamp,
    nonce,
    {},
  );

  return keyPair.sign(JSON.stringify(signedRequestPayload)).valueOf();
}

function buildQueryRequest(
  identityId: IdentityId,
  timestamp: string,
  nonce: string,
  signature: string,
): IncomingMessage {
  const query = new URLSearchParams({
    identityId: identityId.toString(),
    nonce,
    signature,
    timestamp,
  });

  return {
    headers: {},
    url: `/ws?${query.toString()}`,
  } as IncomingMessage;
}

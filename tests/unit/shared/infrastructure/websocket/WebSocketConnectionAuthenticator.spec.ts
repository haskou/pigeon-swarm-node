import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { WebSocketConnectionAuthenticator } from '@app/shared/infrastructure/websocket/WebSocketConnectionAuthenticator';
import { KeyPair } from '@haskou/value-objects';
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
    const signature = signWebSocketRequest(keyPair, websocketPath, timestamp);
    const request = buildQueryRequest(identityId, timestamp, signature);

    const authenticatedIdentityId = authenticator.authenticate(
      request,
      websocketPath,
    );

    expect(authenticatedIdentityId.toString()).toBe(identityId.toString());
  });

  it('rejects signatures built for a different path', async () => {
    const keyPair = await KeyPair.generate();
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const timestamp = String(Date.now());
    const signature = signWebSocketRequest(keyPair, '/wrong-path', timestamp);
    const request = buildQueryRequest(identityId, timestamp, signature);

    expect(() => authenticator.authenticate(request, websocketPath)).toThrow(
      'Invalid signed request.',
    );
  });

  it('rejects websocket requests outside the 30 second timestamp window', async () => {
    const keyPair = await KeyPair.generate();
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const timestamp = String(Date.now() - 31_000);
    const signature = signWebSocketRequest(keyPair, websocketPath, timestamp);
    const request = buildQueryRequest(identityId, timestamp, signature);

    expect(() => authenticator.authenticate(request, websocketPath)).toThrow(
      'Invalid signed request.',
    );
  });
});

function signWebSocketRequest(
  keyPair: KeyPair,
  path: string,
  timestamp: string,
): string {
  const signedRequestPayload = new SignedHttpRequestVerifier().getCanonicalPayload(
    'GET',
    path,
    timestamp,
    {},
  );

  return keyPair.sign(JSON.stringify(signedRequestPayload)).valueOf();
}

function buildQueryRequest(
  identityId: IdentityId,
  timestamp: string,
  signature: string,
): IncomingMessage {
  const query = new URLSearchParams({
    identityId: identityId.toString(),
    signature,
    timestamp,
  });

  return {
    headers: {},
    url: `/ws?${query.toString()}`,
  } as IncomingMessage;
}

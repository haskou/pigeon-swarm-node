import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Request } from 'express';

async function buildSignedRequest(
  method: string,
  body: unknown,
): Promise<Request> {
  const keyPair = await KeyPair.generate();
  const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
  const timestamp = String(Date.now());
  const payload = new SignedHttpRequestVerifier().getCanonicalPayload(
    method,
    '/resource',
    timestamp,
    body,
  );
  const headers: Record<string, string> = {
    'x-identity-id': identityId.toString(),
    'x-signature': keyPair.sign(JSON.stringify(payload)).valueOf(),
    'x-timestamp': timestamp,
  };

  return {
    body,
    header: (name: string) => headers[name.toLowerCase()],
    method,
    path: '/resource',
  } as unknown as Request;
}

describe('SignedHttpRequestAuthenticator', () => {
  const authenticator = new SignedHttpRequestAuthenticator();

  it('rejects a replayed state-changing request', async () => {
    const request = await buildSignedRequest('POST', { value: 1 });

    authenticator.authenticate(request);

    expect(() => authenticator.authenticate(request)).toThrow(
      'Invalid signed request.',
    );
  });

  it('allows identical safe requests inside the same millisecond', async () => {
    const request = await buildSignedRequest('GET', {});

    authenticator.authenticate(request);

    expect(() => authenticator.authenticate(request)).not.toThrow();
  });
});

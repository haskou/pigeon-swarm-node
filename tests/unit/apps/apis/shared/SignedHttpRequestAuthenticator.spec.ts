import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  KeyPair,
  SignedHttpRequestBody,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import { Request } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';

async function buildSignedRequest(
  method: string,
  body: unknown,
): Promise<Request> {
  const keyPair = await KeyPair.generate();
  const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
  const timestamp = String(Date.now());
  const payload = SignedHttpRequestSignature.signingContent({
    body: body as SignedHttpRequestBody,
    method,
    path: '/resource',
    timestamp: Number(timestamp),
  });
  const headers: Record<string, string> = {
    'x-identity-id': identityId.toString(),
    'x-signature': keyPair.sign(payload).valueOf(),
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
  let blockPolicy: MockProxy<NodeBlockPolicy>;
  let authenticator: SignedHttpRequestAuthenticator;

  beforeEach(() => {
    blockPolicy = mock<NodeBlockPolicy>();
    blockPolicy.isIdentityBlocked.mockResolvedValue(false);
    authenticator = new SignedHttpRequestAuthenticator(blockPolicy);
  });

  it('rejects a replayed state-changing request', async () => {
    const request = await buildSignedRequest('POST', { value: 1 });

    await authenticator.authenticate(request);

    await expect(authenticator.authenticate(request)).rejects.toThrow(
      'Invalid signed request.',
    );
  });

  it('allows identical safe requests inside the same millisecond', async () => {
    const request = await buildSignedRequest('GET', {});

    await authenticator.authenticate(request);

    await expect(authenticator.authenticate(request)).resolves.toBeDefined();
  });

  it('refuses an identity blocked on this node with 403012', async () => {
    blockPolicy.isIdentityBlocked.mockResolvedValue(true);

    await expect(
      authenticator.authenticate(await buildSignedRequest('GET', {})),
    ).rejects.toMatchObject({
      code: 403012,
      httpCode: 403,
      message: 'Identity is blocked on this node.',
    });
  });
});

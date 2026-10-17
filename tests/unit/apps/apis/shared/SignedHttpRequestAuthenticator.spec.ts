import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { signedRequestReplayGuard } from '@app/apps/apis/shared/SignedRequestReplayGuard';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import {
  KeyPair,
  SignedHttpRequestBody,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import { Request } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';
import { SignatureMother } from '../../../mothers/SignatureMother';

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

function withHeader(request: Request, header: string, value: string): Request {
  return {
    ...request,
    header: (name: string) =>
      name.toLowerCase() === header ? value : request.header(name),
  } as unknown as Request;
}

describe('SignedHttpRequestAuthenticator', () => {
  let blockPolicy: MockProxy<NodeBlockPolicy>;
  let identityRepository: MockProxy<IdentityRepository>;
  let authenticator: SignedHttpRequestAuthenticator;

  beforeEach(() => {
    blockPolicy = mock<NodeBlockPolicy>();
    blockPolicy.isIdentityBlocked.mockResolvedValue(false);
    identityRepository = mock<IdentityRepository>();
    identityRepository.holds.mockResolvedValue(true);
    authenticator = new SignedHttpRequestAuthenticator(
      blockPolicy,
      identityRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects a replayed state-changing request', async () => {
    const request = await buildSignedRequest('POST', { value: 1 });

    await authenticator.authenticate(request);

    await expect(authenticator.authenticate(request)).rejects.toThrow(
      'Invalid signed request.',
    );
  });

  it('rejects a replay that re-encodes the signature without changing its bytes', async () => {
    const request = await buildSignedRequest('POST', { value: 1 });
    const reencoded = SignatureMother.reencoded(
      String(request.header('x-signature')),
    );

    await authenticator.authenticate(request);

    await expect(
      authenticator.authenticate(withHeader(request, 'x-signature', reencoded)),
    ).rejects.toThrow('Invalid signed request.');
  });

  it.each(IdentityIdMother.aliases())(
    'rejects a replay that names the signer by %s',
    async (_encoding, aliasOf: (of: IdentityId) => IdentityId) => {
      const request = await buildSignedRequest('POST', { value: 1 });
      const alias = aliasOf(
        new IdentityId(String(request.header('x-identity-id'))),
      );

      await authenticator.authenticate(request);

      await expect(
        authenticator.authenticate(
          withHeader(request, 'x-identity-id', alias.valueOf()),
        ),
      ).rejects.toThrow('Invalid signed request.');
    },
  );

  it('allows identical safe requests inside the same millisecond', async () => {
    const request = await buildSignedRequest('GET', {});

    await authenticator.authenticate(request);

    await expect(authenticator.authenticate(request)).resolves.toBeDefined();
  });

  it('records a state-changing request from an identity this node holds in the shared slots', async () => {
    const accept = jest.spyOn(signedRequestReplayGuard, 'accept');
    const acceptFromStranger = jest.spyOn(
      signedRequestReplayGuard,
      'acceptFromStranger',
    );
    const request = await buildSignedRequest('POST', { value: 1 });

    const identityId = await authenticator.authenticate(request);

    expect(identityRepository.holds).toHaveBeenCalledWith(identityId);
    expect(accept).toHaveBeenCalledTimes(1);
    expect(acceptFromStranger).not.toHaveBeenCalled();
  });

  it('records a state-changing request from an identity this node does not hold in the stranger share', async () => {
    identityRepository.holds.mockResolvedValue(false);
    const accept = jest.spyOn(signedRequestReplayGuard, 'accept');
    const acceptFromStranger = jest.spyOn(
      signedRequestReplayGuard,
      'acceptFromStranger',
    );

    await authenticator.authenticate(
      await buildSignedRequest('POST', { value: 1 }),
    );

    expect(acceptFromStranger).toHaveBeenCalledTimes(1);
    expect(accept).not.toHaveBeenCalled();
  });

  it('refuses a stranger once strangers fill their share but still admits a held identity', async () => {
    identityRepository.holds.mockResolvedValue(false);
    jest
      .spyOn(signedRequestReplayGuard, 'acceptFromStranger')
      .mockReturnValue(false);

    await expect(
      authenticator.authenticate(
        await buildSignedRequest('POST', { value: 1 }),
      ),
    ).rejects.toThrow('Invalid signed request.');

    identityRepository.holds.mockResolvedValue(true);

    await expect(
      authenticator.authenticate(
        await buildSignedRequest('POST', { value: 1 }),
      ),
    ).resolves.toBeDefined();
  });

  it('records a state-changing request in the stranger share while replicated state is not open', async () => {
    identityRepository.holds.mockRejectedValue(
      new ReplicatedStateNotReadyError(),
    );
    const acceptFromStranger = jest.spyOn(
      signedRequestReplayGuard,
      'acceptFromStranger',
    );

    await authenticator.authenticate(
      await buildSignedRequest('POST', { value: 1 }),
    );

    expect(acceptFromStranger).toHaveBeenCalledTimes(1);
  });

  it('records nothing when looking the identity up fails otherwise', async () => {
    identityRepository.holds.mockRejectedValue(new Error('index failure'));
    const accept = jest.spyOn(signedRequestReplayGuard, 'accept');
    const acceptFromStranger = jest.spyOn(
      signedRequestReplayGuard,
      'acceptFromStranger',
    );

    await expect(
      authenticator.authenticate(
        await buildSignedRequest('POST', { value: 1 }),
      ),
    ).rejects.toThrow('index failure');
    expect(accept).not.toHaveBeenCalled();
    expect(acceptFromStranger).not.toHaveBeenCalled();
  });

  it('looks up no identity for a safe request', async () => {
    await authenticator.authenticate(await buildSignedRequest('GET', {}));

    expect(identityRepository.holds).not.toHaveBeenCalled();
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

  it.each(IdentityIdMother.aliases())(
    'refuses a blocked identity that names its key by %s with 401020',
    async (_encoding, aliasOf: (of: IdentityId) => IdentityId) => {
      const request = await buildSignedRequest('GET', {});
      const blocked = new IdentityId(String(request.header('x-identity-id')));

      blockPolicy.isIdentityBlocked.mockImplementation(
        (identityId: IdentityId) =>
          Promise.resolve(identityId.isEqual(blocked)),
      );

      await expect(
        authenticator.authenticate(
          withHeader(request, 'x-identity-id', aliasOf(blocked).valueOf()),
        ),
      ).rejects.toMatchObject({ code: 401020, httpCode: 401 });
    },
  );

  it.each(IdentityIdMother.forged())(
    'refuses to check the block list for an id with %s with 400080',
    async (_case, forged: IdentityId) => {
      await expect(
        authenticator.assertIsNotBlocked(forged),
      ).rejects.toMatchObject({ code: 400080, httpCode: 400 });
      expect(blockPolicy.isIdentityBlocked).not.toHaveBeenCalled();
    },
  );
});

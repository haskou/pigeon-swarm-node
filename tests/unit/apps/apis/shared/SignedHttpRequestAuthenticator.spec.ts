import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import {
  SignedRequestReplayGuard,
  signedRequestReplayGuard,
} from '@app/apps/apis/shared/SignedRequestReplayGuard';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import {
  KeyPair,
  Signature,
  SignedHttpRequestBody,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import { Request } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';
import { SignatureMother } from '../../../mothers/SignatureMother';

const CLIENT_ADDRESS = '203.0.113.7';
const SIGNATURE_BYTES = 64;
const SLOTS_PER_SIGNER = 1_000;
const STRANGER_SIGNERS = 10;
const STRANGER_SLOTS_PER_SOURCE = 250;
const HELD_SIGNERS = 100;
const FLOOD_ADDRESS = '198.51.100.9';

const signatureOf = (index: number): Signature => {
  const bytes = Buffer.alloc(SIGNATURE_BYTES);
  bytes.writeUInt32BE(index);

  return Signature.fromBuffer(bytes);
};

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
    ip: CLIENT_ADDRESS,
    method,
    originalUrl: '/resource',
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
  let nodes: MockProxy<NodeRepository>;
  let authenticator: SignedHttpRequestAuthenticator;

  beforeEach(() => {
    blockPolicy = mock<NodeBlockPolicy>();
    blockPolicy.isIdentityBlocked.mockResolvedValue(false);
    identityRepository = mock<IdentityRepository>();
    identityRepository.holds.mockResolvedValue(true);
    nodes = mock<NodeRepository>();
    nodes.isLocalNodeOwnedBy.mockResolvedValue(false);
    authenticator = new SignedHttpRequestAuthenticator(
      blockPolicy,
      identityRepository,
      nodes,
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

  it('charges a state-changing request to the client address it arrived from', async () => {
    const accept = jest.spyOn(signedRequestReplayGuard, 'accept');

    await authenticator.authenticate(
      await buildSignedRequest('POST', { value: 1 }),
    );

    expect(accept).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      CLIENT_ADDRESS,
    );
  });

  it('charges a state-changing request with no client address to unknown', async () => {
    const accept = jest.spyOn(signedRequestReplayGuard, 'accept');
    const request = await buildSignedRequest('POST', { value: 1 });

    await authenticator.authenticate({
      ...request,
      ip: undefined,
    } as unknown as Request);

    expect(accept).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'unknown',
    );
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

    expect(acceptFromStranger).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      CLIENT_ADDRESS,
    );
    expect(accept).not.toHaveBeenCalled();
  });

  it('records a state-changing request from the node owner it does not hold in the shared slots', async () => {
    identityRepository.holds.mockResolvedValue(false);
    nodes.isLocalNodeOwnedBy.mockResolvedValue(true);
    const accept = jest.spyOn(signedRequestReplayGuard, 'accept');
    const acceptFromStranger = jest.spyOn(
      signedRequestReplayGuard,
      'acceptFromStranger',
    );

    const identityId = await authenticator.authenticate(
      await buildSignedRequest('POST', { value: 1 }),
    );

    expect(nodes.isLocalNodeOwnedBy).toHaveBeenCalledWith(identityId);
    expect(accept).toHaveBeenCalledTimes(1);
    expect(acceptFromStranger).not.toHaveBeenCalled();
  });

  it('admits the node owner it does not hold while strangers flood their share', async () => {
    const guard = new SignedRequestReplayGuard();
    jest
      .spyOn(signedRequestReplayGuard, 'accept')
      .mockImplementation((signer, signature, clientAddress) =>
        guard.accept(signer, signature, clientAddress),
      );
    jest
      .spyOn(signedRequestReplayGuard, 'acceptFromStranger')
      .mockImplementation((signer, signature, clientAddress) =>
        guard.acceptFromStranger(signer, signature, clientAddress),
      );
    const strangers = await Promise.all(
      Array.from(
        { length: STRANGER_SIGNERS },
        async () =>
          new IdentityId((await KeyPair.generate()).toPrimitives().publicKey),
      ),
    );
    strangers.forEach((stranger, signer) =>
      Array.from({ length: SLOTS_PER_SIGNER }).forEach((_, index) =>
        guard.acceptFromStranger(
          stranger,
          signatureOf(index),
          `198.51.${signer}.${Math.floor(index / STRANGER_SLOTS_PER_SOURCE)}`,
        ),
      ),
    );
    identityRepository.holds.mockResolvedValue(false);
    const stranger = await buildSignedRequest('POST', { value: 1 });
    const owner = await buildSignedRequest('POST', { value: 1 });
    nodes.isLocalNodeOwnedBy.mockImplementation((identityId) =>
      Promise.resolve(
        identityId.isEqual(
          new IdentityId(String(owner.header('x-identity-id'))),
        ),
      ),
    );

    await expect(authenticator.authenticate(stranger)).rejects.toThrow(
      'Invalid signed request.',
    );
    await expect(authenticator.authenticate(owner)).resolves.toBeDefined();
  });

  it('admits a held identity while held identities of one address flood the guard', async () => {
    const guard = new SignedRequestReplayGuard();
    jest
      .spyOn(signedRequestReplayGuard, 'accept')
      .mockImplementation((signer, signature, clientAddress) =>
        guard.accept(signer, signature, clientAddress),
      );
    const heldSigners = await Promise.all(
      Array.from(
        { length: HELD_SIGNERS },
        async () =>
          new IdentityId((await KeyPair.generate()).toPrimitives().publicKey),
      ),
    );
    heldSigners.forEach((held) =>
      Array.from({ length: SLOTS_PER_SIGNER }).forEach((_, index) =>
        guard.accept(held, signatureOf(index), FLOOD_ADDRESS),
      ),
    );

    await expect(
      authenticator.authenticate(
        await buildSignedRequest('POST', { value: 1 }),
      ),
    ).resolves.toBeDefined();
  });

  it('records the node owner it does not hold in the shared slots while replicated state is not open', async () => {
    identityRepository.holds.mockRejectedValue(
      new ReplicatedStateNotReadyError(),
    );
    nodes.isLocalNodeOwnedBy.mockResolvedValue(true);
    const accept = jest.spyOn(signedRequestReplayGuard, 'accept');

    await authenticator.authenticate(
      await buildSignedRequest('POST', { value: 1 }),
    );

    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('does not look the node owner up for an identity this node holds', async () => {
    await authenticator.authenticate(
      await buildSignedRequest('POST', { value: 1 }),
    );

    expect(nodes.isLocalNodeOwnedBy).not.toHaveBeenCalled();
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
    expect(nodes.isLocalNodeOwnedBy).not.toHaveBeenCalled();
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

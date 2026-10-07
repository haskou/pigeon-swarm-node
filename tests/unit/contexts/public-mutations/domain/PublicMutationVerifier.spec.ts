import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationBodyPrimitives } from '@app/contexts/public-mutations/domain/PublicMutationBodyPrimitives';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationAuthorAuthorization } from '@app/contexts/public-mutations/domain/services/PublicMutationAuthorAuthorization';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

describe('PublicMutationVerifier', () => {
  let device: KeyPair;
  const payload: Record<string, unknown> = {
    authorIdentityId: 'author',
    messageId: 'message',
  };
  const body = (
    overrides: Partial<PublicMutationBodyPrimitives> = {},
  ): PublicMutationBodyPrimitives => ({
    author: {
      authorizationRevision: 0,
      deviceCredential: device.toPrimitives().publicKey,
      identityId: 'author',
    },
    kind: 'delete',
    operationId: 'AAAAAAAAAAAAAAAAAAAAAA',
    payloadDigest: PublicMutationProof.digestOf(payload),
    predecessor: PublicMutationProof.digestOf({ previous: true }),
    recordId: 'reaction-1',
    sequence: 1,
    store: 'reactions',
    version: 2,
    ...overrides,
  });
  const sign = (value: PublicMutationBodyPrimitives): PublicMutationProof =>
    PublicMutationProof.signed(
      value,
      device.sign(PublicMutationProof.signingContentOf(value)),
    );
  const authorization = mock<PublicMutationAuthorAuthorization>();
  const verifier = new PublicMutationVerifier(authorization);
  const expectation = {
    authorIdentityId: 'author',
    payload,
    recordId: 'reaction-1',
    store: 'reactions',
  };

  beforeEach(async () => {
    device = await KeyPair.generate();
    authorization.isAuthorized.mockResolvedValue(true);
  });

  it('accepts a signed mutation of an authorized device', async () => {
    await expect(
      verifier.verify(sign(body()), expectation),
    ).resolves.toBeUndefined();
  });

  const scopes = (): Array<[string, typeof expectation]> => [
    ['another record', { ...expectation, recordId: 'reaction-2' }],
    ['another store', { ...expectation, store: 'pins' }],
    ['another payload', { ...expectation, payload: { ...payload, x: 1 } }],
    ['another author', { ...expectation, authorIdentityId: 'mallory' }],
  ];

  it('rejects a proof replayed for another record, store, payload or author', async () => {
    for (const [, other] of scopes()) {
      await expect(verifier.verify(sign(body()), other)).rejects.toThrow(
        InvalidPublicMutationError,
      );
    }
  });

  it('rejects a body tampered after signing (forged future tombstone)', async () => {
    const proof = sign(body({ kind: 'put' }));
    const forged = PublicMutationProof.fromPrimitives({
      ...proof.toPrimitives(),
      kind: 'delete',
    });

    await expect(verifier.verify(forged, expectation)).rejects.toThrow(
      InvalidPublicMutationError,
    );
  });

  it('rejects a proof signed by a key that is not the declared device', async () => {
    const other = await KeyPair.generate();
    const value = body();
    const forged = PublicMutationProof.signed(
      value,
      other.sign(PublicMutationProof.signingContentOf(value)),
    );

    await expect(verifier.verify(forged, expectation)).rejects.toThrow(
      InvalidPublicMutationError,
    );
  });

  it('hands the signed authorization revision to the authorization check', async () => {
    await verifier.verify(
      sign(
        body({
          author: {
            authorizationRevision: 7,
            deviceCredential: device.toPrimitives().publicKey,
            identityId: 'author',
          },
        }),
      ),
      expectation,
    );

    expect(authorization.isAuthorized).toHaveBeenLastCalledWith(
      expect.objectContaining({ authorizationRevision: 7 }),
    );
  });

  it('rejects a proof whose authorization revision was changed after signing', async () => {
    const proof = sign(body());
    const forged = PublicMutationProof.fromPrimitives({
      ...proof.toPrimitives(),
      author: { ...proof.toPrimitives().author, authorizationRevision: 5 },
    });

    await expect(verifier.verify(forged, expectation)).rejects.toThrow(
      InvalidPublicMutationError,
    );
  });

  it('rejects revoked or unknown devices', async () => {
    authorization.isAuthorized.mockResolvedValue(false);

    await expect(verifier.verify(sign(body()), expectation)).rejects.toThrow(
      InvalidPublicMutationError,
    );
  });

  it('rejects unsupported versions, extra fields and inconsistent causality', () => {
    const valid = sign(body()).toPrimitives();

    for (const version of [1, 3]) {
      expect(() =>
        PublicMutationProof.fromPrimitives({ ...valid, version } as never),
      ).toThrow(InvalidPublicMutationError);
    }
    for (const authorizationRevision of [-1, 1.5, '1', undefined]) {
      expect(() =>
        PublicMutationProof.fromPrimitives({
          ...valid,
          author: { ...valid.author, authorizationRevision },
        } as never),
      ).toThrow(InvalidPublicMutationError);
    }
    const { authorizationRevision: _revision, ...unbound } = valid.author;

    expect(() =>
      PublicMutationProof.fromPrimitives({
        ...valid,
        author: unbound,
      } as never),
    ).toThrow(InvalidPublicMutationError);
    expect(() =>
      PublicMutationProof.fromPrimitives({ ...valid, deletedAt: 1 }),
    ).toThrow(InvalidPublicMutationError);
    expect(() =>
      PublicMutationProof.fromPrimitives({ ...valid, predecessor: null }),
    ).toThrow(InvalidPublicMutationError);
  });

  it('orders concurrent mutations by causal data, never by a clock', () => {
    const first = sign(body({ sequence: 1 }));
    const later = sign(
      body({
        kind: 'put',
        operationId: 'BBBBBBBBBBBBBBBBBBBBBB',
        sequence: 2,
      }),
    );

    expect(later.winsOver(first)).toBe(true);
    expect(first.winsOver(later)).toBe(false);
    expect(first.winsOver(first)).toBe(false);
  });
});

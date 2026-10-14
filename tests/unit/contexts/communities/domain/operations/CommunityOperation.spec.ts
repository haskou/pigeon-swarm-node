import { InvalidCommunityOperationError } from '@app/contexts/communities/domain/errors/InvalidCommunityOperationError';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';

import {
  alice,
  genesis,
  identitySignatureOf,
  join,
  mallory,
  owner,
} from './CommunityOperationFixtures';

describe(CommunityOperation.name, () => {
  it('signs the record id under the community operation context', () => {
    const created = genesis();

    expect(CommunityOperation.identitySigningContentOf(created.getId())).toBe(
      `pigeon:community-operation:v1\n${created.getId()}`,
    );
    expect(() => created.assertIdentitySigned()).not.toThrow();
  });

  it('keeps the identity signature out of the digest and the record id', () => {
    const created = genesis();
    const resigned = CommunityOperation.fromPrimitives({
      ...created.toPrimitives(),
      identitySignature: identitySignatureOf(mallory, created.getId()),
    });

    expect(resigned.getHash()).toBe(created.getHash());
    expect(resigned.getId()).toBe(created.getId());
  });

  it('stores the identity signature with the operation', () => {
    const created = genesis();

    expect(created.toPrimitives().identitySignature).toBe(
      identitySignatureOf(owner, created.getId()),
    );
  });

  it.each([
    ['another identity', () => identitySignatureOf(mallory, genesis().getId())],
    [
      'another operation id',
      () => identitySignatureOf(owner, join([genesis()], alice).getId()),
    ],
  ])('rejects a signature by %s', (_name, signatureOf) => {
    const forged = CommunityOperation.fromPrimitives({
      ...genesis().toPrimitives(),
      identitySignature: signatureOf(),
    });

    expect(() => forged.assertIdentitySigned()).toThrow(
      InvalidCommunityOperationError,
    );
  });

  it.each([
    ['a missing', undefined],
    ['a malformed', 'not-a-signature'],
  ])('rejects %s identity signature', (_name, identitySignature) => {
    expect(() =>
      CommunityOperation.fromPrimitives({
        ...genesis().toPrimitives(),
        identitySignature: identitySignature as string,
      }),
    ).toThrow(InvalidCommunityOperationError);
  });
});

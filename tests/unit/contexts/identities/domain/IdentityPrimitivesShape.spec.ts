import { IdentityPrimitivesShape } from '@app/contexts/identities/domain/IdentityPrimitivesShape';

import { IdentityMother } from '../../../mothers/IdentityMother';

describe('IdentityPrimitivesShape', () => {
  const primitives = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(new IdentityMother().build().toPrimitives()));

  it('accepts the stored primitives of a valid identity', () => {
    expect(IdentityPrimitivesShape.isIdentityPrimitives(primitives())).toBe(
      true,
    );
  });

  it.each([
    ['a profile that carries only its name', { profile: { name: 'John' } }],
    [
      'a profile with empty or null optional text',
      {
        profile: {
          banner: '',
          biography: null,
          handle: '',
          name: 'John',
          picture: null,
        },
      },
    ],
    [
      'an absent previous identifier',
      { previousIdentityExternalIdentifier: undefined },
    ],
    [
      'a null previous identifier',
      { previousIdentityExternalIdentifier: null },
    ],
  ])('accepts %s', (_label, change) => {
    expect(
      IdentityPrimitivesShape.isIdentityPrimitives({
        ...primitives(),
        ...change,
      }),
    ).toBe(true);
  });

  it('rejects values that are not records', () => {
    expect(IdentityPrimitivesShape.isIdentityPrimitives(undefined)).toBe(false);
    expect(IdentityPrimitivesShape.isIdentityPrimitives(null)).toBe(false);
    expect(IdentityPrimitivesShape.isIdentityPrimitives(['identity'])).toBe(
      false,
    );
  });

  it.each([
    ['a missing profile', { profile: undefined }],
    ['a profile without a name', { profile: { biography: 'Bio' } }],
    ['a non-text profile handle', { profile: { handle: 1, name: 'John' } }],
    ['a null admission nonce', { admissionNonce: null }],
    ['a null mailbox home', { mailboxHome: null }],
    ['networks that are not a list', { networks: 'network' }],
    ['a network that is not text', { networks: [1] }],
    ['a non-numeric version', { version: '1' }],
    ['a null signature', { signature: null }],
    [
      'a non-text previous identifier',
      { previousIdentityExternalIdentifier: 1 },
    ],
    ['a missing recovery authority', { recoveryAuthority: undefined }],
  ])('rejects %s', (_label, change) => {
    expect(
      IdentityPrimitivesShape.isIdentityPrimitives({
        ...primitives(),
        ...change,
      }),
    ).toBe(false);
  });
});

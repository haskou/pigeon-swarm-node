import { IpfsIdentityDocumentShape } from '@app/contexts/identities/infrastructure/ipfs/documents/IpfsIdentityDocumentShape';
import IpfsIdentityMapper from '@app/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IpfsIdentityDocumentShape', () => {
  const document = (): Record<string, unknown> =>
    JSON.parse(
      JSON.stringify(
        new IpfsIdentityMapper().toDocument(new IdentityMother().build()),
      ),
    );

  it('accepts a document after it has been stored and read back', () => {
    expect(IpfsIdentityDocumentShape.isIpfsIdentityDocument(document())).toBe(
      true,
    );
  });

  it.each([
    ['an absent previous CID', { previousCid: undefined }],
    ['a null previous CID', { previousCid: null }],
    [
      'a profile with empty or null optional text',
      { profile: { biography: null, name: 'John', picture: '' } },
    ],
  ])('accepts %s', (_label, change) => {
    expect(
      IpfsIdentityDocumentShape.isIpfsIdentityDocument({
        ...document(),
        ...change,
      }),
    ).toBe(true);
  });

  it('rejects values that are not records', () => {
    expect(IpfsIdentityDocumentShape.isIpfsIdentityDocument(undefined)).toBe(
      false,
    );
    expect(IpfsIdentityDocumentShape.isIpfsIdentityDocument(null)).toBe(false);
    expect(IpfsIdentityDocumentShape.isIpfsIdentityDocument('cid')).toBe(false);
  });

  it.each([
    ['a missing identifier', { _id: undefined }],
    ['a null admission nonce', { admissionNonce: null }],
    ['a null mailbox home', { mailboxHome: null }],
    ['networks that are not a list', { networks: 'network' }],
    ['a profile without a name', { profile: { biography: 'Bio' } }],
    ['a textual timestamp', { timestamp: '1' }],
    ['a non-text previous CID', { previousCid: 1 }],
    ['a null signature', { signature: null }],
  ])('rejects %s', (_label, change) => {
    expect(
      IpfsIdentityDocumentShape.isIpfsIdentityDocument({
        ...document(),
        ...change,
      }),
    ).toBe(false);
  });
});

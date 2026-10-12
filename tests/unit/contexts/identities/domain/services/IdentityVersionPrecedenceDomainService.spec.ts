import IdentityVersionPrecedenceDomainService from '@app/contexts/identities/domain/services/IdentityVersionPrecedenceDomainService';

describe('IdentityVersionPrecedenceDomainService', () => {
  const service = new IdentityVersionPrecedenceDomainService();

  it('should order documents newest version first and break ties by cid', () => {
    const documents = [
      { cid: 'bafy-b', identityId: 'alice', version: 1 },
      { cid: 'bafy-c', identityId: 'alice', version: 3 },
      { cid: 'bafy-a', identityId: 'alice', version: 1 },
    ];

    expect(service.newestFirst(documents).map((d) => d.cid)).toEqual([
      'bafy-c',
      'bafy-a',
      'bafy-b',
    ]);
  });

  it('should collapse repeated identity and cid pairs', () => {
    const documents = [
      { cid: 'bafy-a', identityId: 'alice', version: 1 },
      { cid: 'bafy-a', identityId: 'alice', version: 1 },
    ];

    expect(service.newestFirst(documents)).toHaveLength(1);
  });

  it('should keep only the newest document per identity', () => {
    const documents = [
      { cid: 'bafy-old', identityId: 'alice', version: 1 },
      { cid: 'bafy-new', identityId: 'alice', version: 2 },
      { cid: 'bafy-bob', identityId: 'bob', version: 1 },
    ];

    expect(service.latestPerIdentity(documents).map((d) => d.cid)).toEqual([
      'bafy-new',
      'bafy-bob',
    ]);
  });
});

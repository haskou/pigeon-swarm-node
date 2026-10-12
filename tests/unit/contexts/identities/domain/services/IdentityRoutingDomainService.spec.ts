import IdentityRoutingDomainService from '@app/contexts/identities/domain/services/IdentityRoutingDomainService';

describe('IdentityRoutingDomainService', () => {
  const service = new IdentityRoutingDomainService();

  it('should name each declared network once, narrowed to the requested one', () => {
    const documents = [
      { networkIds: ['net-a', 'net-b'] },
      { networkIds: ['net-b', 'net-c'] },
    ];

    expect(service.networksToCheck(documents)).toEqual([
      'net-a',
      'net-b',
      'net-c',
    ]);
    expect(service.networksToCheck(documents, 'net-b')).toEqual(['net-b']);
  });

  it('should treat an empty requested network as no filter', () => {
    expect(service.networksToCheck([{ networkIds: ['net-a'] }], '')).toEqual([
      'net-a',
    ]);
  });

  it('should republish only on declared, connected and requested networks', () => {
    const document = { networkIds: ['net-a', 'net-b', 'net-a'] };

    expect(
      service.republishNetworkIds(document, new Set(['net-a', 'net-c'])),
    ).toEqual(['net-a']);
    expect(
      service.republishNetworkIds(
        document,
        new Set(['net-a', 'net-b']),
        'net-b',
      ),
    ).toEqual(['net-b']);
  });

  it('should not republish a document without declared networks', () => {
    expect(service.republishNetworkIds({}, new Set(['net-a']))).toEqual([]);
  });
});

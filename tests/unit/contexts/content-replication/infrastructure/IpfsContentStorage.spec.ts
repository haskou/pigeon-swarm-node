import IpfsContentStorage from '@app/contexts/content-replication/infrastructure/ipfs/IpfsContentStorage';
import { ReplicatedContentNotFoundError } from '@app/contexts/content-replication/domain/errors/ReplicatedContentNotFoundError';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { mock, MockProxy } from 'jest-mock-extended';

describe('IpfsContentStorage', () => {
  const cid = 'bafybeih4ozkrybcar3anjkx5srvn3lv6rcc4ige7urcu5ea73cfanhfyxu';
  const networkId = '550e8400-e29b-41d4-a716-446655440001';
  let ipfs: MockProxy<IPFS>;
  let storage: IpfsContentStorage;

  beforeEach(() => {
    ipfs = mock<IPFS>();
    storage = new IpfsContentStorage(ipfs);
  });

  it('provides content in a network when the CID exists locally', async () => {
    ipfs.stat.mockResolvedValue(true);

    await storage.provideInNetwork(new ContentId(cid), new NetworkId(networkId));

    expect(ipfs.stat).toHaveBeenCalledWith(expect.anything(), true, [networkId]);
    expect(ipfs.provideContentFromNetwork).toHaveBeenCalledTimes(1);
    expect(ipfs.provideContentFromNetwork.mock.calls[0][0].valueOf()).toBe(cid);
    expect(ipfs.provideContentFromNetwork.mock.calls[0][1]).toBe(networkId);
  });

  it('does not provide content when the CID is missing locally', async () => {
    ipfs.stat.mockResolvedValue(false);

    await expect(
      storage.provideInNetwork(new ContentId(cid), new NetworkId(networkId)),
    ).rejects.toThrow(ReplicatedContentNotFoundError);
    expect(ipfs.provideContentFromNetwork).not.toHaveBeenCalled();
  });
});

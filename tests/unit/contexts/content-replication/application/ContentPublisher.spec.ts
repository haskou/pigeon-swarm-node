import ContentReplicationRegistrar from '@app/contexts/content-replication/application/register-content/ContentReplicationRegistrar';
import ContentPublisher from '@app/contexts/content-replication/application/publish-content/ContentPublisher';
import { ContentPublishMessage } from '@app/contexts/content-replication/application/publish-content/messages/ContentPublishMessage';
import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { mock, MockProxy } from 'jest-mock-extended';

describe('ContentPublisher', () => {
  const identityId =
    'MCowBQYDK2VwAyEApAwGtBC3JZkif9nhnXVZ7WG+cHIqmAgRfjnHdxr67u0=';
  const firstNetworkId = '550e8400-e29b-41d4-a716-446655440001';
  const secondNetworkId = '550e8400-e29b-41d4-a716-446655440002';
  let ipfs: MockProxy<IPFS>;
  let identityRepository: MockProxy<IdentityRepository>;
  let nodeRepository: MockProxy<NodeRepository>;
  let registrar: MockProxy<ContentReplicationRegistrar>;
  let publisher: ContentPublisher;

  beforeEach(() => {
    ipfs = mock<IPFS>();
    identityRepository = mock<IdentityRepository>();
    nodeRepository = mock<NodeRepository>();
    registrar = mock<ContentReplicationRegistrar>();
    publisher = new ContentPublisher(
      ipfs,
      nodeRepository,
      registrar,
      identityRepository,
    );
    const identity = mock<Identity>();

    identity.getNetworkIds.mockReturnValue([
      new NetworkId(firstNetworkId),
      new NetworkId(secondNetworkId),
    ]);
    identityRepository.findById.mockResolvedValue(identity);
    ipfs.addBytesToNetworksReturningFirst.mockResolvedValue({
      cid: new IPFSId('bafy-public'),
      completedNetworkIds: Promise.resolve([secondNetworkId]),
      networkId: secondNetworkId,
    });
    nodeRepository.loadLocalNodeId.mockResolvedValue(
      new NodeId('550e8400-e29b-41d4-a716-446655440010'),
    );
  });

  it('returns public content without waiting for replication registration side effects', async () => {
    registrar.register.mockReturnValue(new Promise<never>(() => undefined));

    const result = await Promise.race([
      publisher
        .publishPublic(
          new ContentPublishMessage({
            body: Buffer.from('content'),
            contentType: 'image/webp',
            filename: 'image.webp',
            ownerIdentityId: identityId,
          }),
        )
        .then((content) => content.cid),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('timeout'), 25);
      }),
    ]);

    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(result).toBe('bafy-public');
    expect(ipfs.addBytesToNetworksReturningFirst).toHaveBeenCalledWith(
      Buffer.from('content'),
      [firstNetworkId, secondNetworkId],
    );
    expect(registrar.register).toHaveBeenCalledWith(
      expect.objectContaining({
        cid: 'bafy-public',
        deferSideEffects: true,
        localReplicaNetworkIds: [secondNetworkId],
        networkIds: [firstNetworkId, secondNetworkId],
      }),
    );
  });

  it('registers additional local replica claims when owner network uploads complete', async () => {
    ipfs.addBytesToNetworksReturningFirst.mockResolvedValue({
      cid: new IPFSId('bafy-public'),
      completedNetworkIds: Promise.resolve([firstNetworkId, secondNetworkId]),
      networkId: secondNetworkId,
    });
    registrar.register.mockResolvedValue(undefined);

    await publisher.publishPublic(
      new ContentPublishMessage({
        body: Buffer.from('content'),
        contentType: 'image/webp',
        filename: 'image.webp',
        ownerIdentityId: identityId,
      }),
    );
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(registrar.register).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        localReplicaNetworkIds: [secondNetworkId],
      }),
    );
    expect(registrar.register).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        localReplicaNetworkIds: [firstNetworkId],
      }),
    );
  });
});

import ReplicatedContentStorage from '@app/contexts/content-replication/application/content-storage/ReplicatedContentStorage';
import ContentReplicationRegistrar from '@app/contexts/content-replication/application/register-content/ContentReplicationRegistrar';
import ContentPublisher from '@app/contexts/content-replication/application/publish-content/ContentPublisher';
import { ContentPublishMessage } from '@app/contexts/content-replication/application/publish-content/messages/ContentPublishMessage';
import { PrivateContentPublishMessage } from '@app/contexts/content-replication/application/publish-content/messages/PrivateContentPublishMessage';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { mock, MockProxy } from 'jest-mock-extended';

describe('ContentPublisher', () => {
  const identityId =
    'MCowBQYDK2VwAyEApAwGtBC3JZkif9nhnXVZ7WG+cHIqmAgRfjnHdxr67u0=';
  const firstNetworkId = '550e8400-e29b-41d4-a716-446655440001';
  const secondNetworkId = '550e8400-e29b-41d4-a716-446655440002';
  let contentStorage: MockProxy<ReplicatedContentStorage>;
  let identityRepository: MockProxy<IdentityRepository>;
  let nodeRepository: MockProxy<NodeRepository>;
  let registrar: MockProxy<ContentReplicationRegistrar>;
  let publisher: ContentPublisher;

  beforeEach(() => {
    contentStorage = mock<ReplicatedContentStorage>();
    identityRepository = mock<IdentityRepository>();
    nodeRepository = mock<NodeRepository>();
    registrar = mock<ContentReplicationRegistrar>();
    publisher = new ContentPublisher(
      contentStorage,
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
    contentStorage.publishBytesToNetworks.mockResolvedValue({
      contentId: new ContentId('bafy-public'),
      completedNetworkIds: Promise.resolve([new NetworkId(secondNetworkId)]),
      networkId: new NetworkId(secondNetworkId),
    });
    contentStorage.publishDocumentToNetwork.mockResolvedValue(
      new ContentId('bafy-private'),
    );
    nodeRepository.loadLocalNodeId.mockResolvedValue(
      new NodeId('550e8400-e29b-41d4-a716-446655440010'),
    );
  });

  it('returns public content without waiting for remaining network uploads', async () => {
    contentStorage.publishBytesToNetworks.mockResolvedValue({
      contentId: new ContentId('bafy-public'),
      completedNetworkIds: new Promise<never>(() => undefined),
      networkId: new NetworkId(secondNetworkId),
    });
    registrar.register.mockResolvedValue(undefined);

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
    expect(contentStorage.publishBytesToNetworks).toHaveBeenCalledWith(
      Buffer.from('content'),
      [new NetworkId(firstNetworkId), new NetworkId(secondNetworkId)],
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
    contentStorage.publishBytesToNetworks.mockResolvedValue({
      contentId: new ContentId('bafy-public'),
      completedNetworkIds: Promise.resolve([
        new NetworkId(firstNetworkId),
        new NetworkId(secondNetworkId),
      ]),
      networkId: new NetworkId(secondNetworkId),
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

  it('publishes private content only to the selected network', async () => {
    await publisher.publishPrivate(
      new PrivateContentPublishMessage({
        body: Buffer.from('encrypted-content'),
        contentType: 'application/octet-stream',
        filename: 'encrypted.bin',
        networkId: firstNetworkId,
        ownerIdentityId: identityId,
      }),
    );

    expect(contentStorage.publishDocumentToNetwork).toHaveBeenCalledWith(
      {
        contentType: 'application/octet-stream',
        encrypted: true,
        encryptedData: Buffer.from('encrypted-content').toString('base64'),
        filename: 'encrypted.bin',
        size: 17,
        uploadedAt: expect.any(Number),
        uploadedByIdentityId: identityId,
      },
      new NetworkId(firstNetworkId),
    );
    expect(contentStorage.publishDocument).not.toHaveBeenCalled();
    expect(registrar.register).toHaveBeenCalledWith(
      expect.objectContaining({
        cid: 'bafy-private',
        localReplicaNetworkIds: [firstNetworkId],
        networkIds: [firstNetworkId],
      }),
    );
  });
});

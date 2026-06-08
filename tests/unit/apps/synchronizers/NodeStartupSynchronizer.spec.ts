import NodeStartupSynchronizer from '@app/apps/synchronizers/NodeStartupSynchronizer';
import NodeStartupSyncPolicy from '@app/apps/synchronizers/NodeStartupSyncPolicy';
import NodeStartupSyncReadiness from '@app/apps/synchronizers/NodeStartupSyncReadiness';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunitySyncRequestedEvent } from '@app/contexts/communities/domain/events/CommunitySyncRequestedEvent';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import { ConversationSyncRequestedEvent } from '@app/contexts/conversations/domain/events/ConversationSyncRequestedEvent';
import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import { IdentityNetworkSyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentityNetworkSyncRequestedEvent';
import { IdentitySyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentitySyncRequestedEvent';
import MongoIdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import { KeychainSyncRequestedEvent } from '@app/contexts/keychains/domain/events/KeychainSyncRequestedEvent';
import MongoKeychainMetadataRepository from '@app/contexts/keychains/infrastructure/mongo/MongoKeychainMetadataRepository';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { Network } from '@app/contexts/nodes/domain/Network';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NetworkName } from '@app/contexts/nodes/domain/value-objects/NetworkName';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { PrimitiveOf } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodeStartupSynchronizer', () => {
  const nodeId = '550e8400-e29b-41d4-a716-446655440010';

  let conversationRepository: MockProxy<MongoConversationRepository>;
  let communityRepository: MockProxy<MongoCommunityRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let identityMetadataRepository: MockProxy<MongoIdentityMetadataRepository>;
  let keychainMetadataRepository: MockProxy<MongoKeychainMetadataRepository>;
  let nodeLoader: MockProxy<NodeLoader>;
  let readiness: MockProxy<NodeStartupSyncReadiness>;
  let synchronizer: NodeStartupSynchronizer;

  beforeEach(() => {
    conversationRepository = mock<MongoConversationRepository>();
    communityRepository = mock<MongoCommunityRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    identityMetadataRepository = mock<MongoIdentityMetadataRepository>();
    keychainMetadataRepository = mock<MongoKeychainMetadataRepository>();
    nodeLoader = mock<NodeLoader>();
    readiness = mock<NodeStartupSyncReadiness>();
    readiness.prepare.mockResolvedValue([
      {
        networkId: '123e4567-e89b-12d3-a456-426614174000',
        peerCount: 2,
        ready: true,
      },
    ]);
    readiness.inspect.mockResolvedValue([
      {
        networkId: '123e4567-e89b-12d3-a456-426614174000',
        peerCount: 2,
        ready: true,
      },
    ]);
    nodeLoader.loadNode.mockResolvedValue(
      new Node(
        new NodeId(nodeId),
        new Map([
          [
            new NetworkId('123e4567-e89b-12d3-a456-426614174000'),
            new Network(
              new NetworkId('123e4567-e89b-12d3-a456-426614174000'),
              new NetworkName('public'),
            ),
          ],
        ]),
      ),
    );
    synchronizer = new NodeStartupSynchronizer({
      communityRepository,
      conversationRepository,
      eventPublisher,
      identityMetadataRepository,
      keychainMetadataRepository,
      nodeLoader,
      readiness,
    });
  });

  it('should prepare and publish scoped startup sync requests', async () => {
    identityMetadataRepository.findAll.mockResolvedValue([
      {
        _id: 'identity-1-v1',
        cid: 'bafyidentity1v1',
        identityId: 'identity-1',
        networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
      {
        _id: 'identity-1-v2',
        cid: 'bafyidentity1v2',
        identityId: 'identity-1',
        networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
        previousCid: 'bafyidentity1v1',
        receivedAt: 2,
        version: 2,
      },
    ]);
    keychainMetadataRepository.findAll.mockResolvedValue([
      {
        _id: 'keychain-1',
        cid: 'bafykeychain1',
        ownerIdentityId: 'identity-1',
        previousCid: undefined,
        receivedAt: 1,
        version: 3,
      },
    ]);
    conversationRepository.findConversationSyncScopes.mockResolvedValue([
      {
        conversationId: 'one-to-one:conversation',
        networkId: '123e4567-e89b-12d3-a456-426614174000',
      },
    ]);
    communityRepository.findAll.mockResolvedValue([]);

    const result = await synchronizer.synchronize();
    const publishedEvents = eventPublisher.publish.mock.calls[0][0];

    expect(readiness.prepare).toHaveBeenCalledTimes(1);
    expect(readiness.prepare).toHaveBeenCalledWith([
      '123e4567-e89b-12d3-a456-426614174000',
    ]);
    expect(result).toMatchObject({
      communityRequests: 0,
      connectedPeerCount: 2,
      conversationRequests: 1,
      identityNetworkRequests: 1,
      identityRequests: 1,
      keychainRequests: 1,
      networkReadiness: [
        {
          networkId: '123e4567-e89b-12d3-a456-426614174000',
          peerCount: 2,
          ready: true,
        },
      ],
      networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
      publishedEvents: 4,
      readyNetworkIds: ['123e4567-e89b-12d3-a456-426614174000'],
      requesterNodeId: nodeId,
      totalRequests: 4,
      unreadyNetworkIds: [],
    });
    expect(publishedEvents).toEqual([
      expect.any(IdentityNetworkSyncRequestedEvent),
      expect.any(IdentitySyncRequestedEvent),
      expect.any(KeychainSyncRequestedEvent),
      expect.any(ConversationSyncRequestedEvent),
    ]);
    expect(publishedEvents[0].attributes).toMatchObject({
      networkId: '123e4567-e89b-12d3-a456-426614174000',
      requesterNodeId: nodeId,
      requestId: result.requestId,
    });
    expect(publishedEvents[1].attributes).toMatchObject({
      identityId: 'identity-1',
      knownVersion: 2,
      requesterNodeId: nodeId,
      requestId: result.requestId,
    });
    expect(publishedEvents[2].attributes).toMatchObject({
      knownVersion: 3,
      ownerIdentityId: 'identity-1',
      requesterNodeId: nodeId,
      requestId: result.requestId,
    });
    expect(publishedEvents[3].attributes).toMatchObject({
      conversationId: 'one-to-one:conversation',
      networkId: '123e4567-e89b-12d3-a456-426614174000',
      requesterNodeId: nodeId,
      requestId: result.requestId,
    });
  });

  it('should synchronize only networks that are ready', async () => {
    nodeLoader.loadNode.mockResolvedValue(
      new Node(
        new NodeId(nodeId),
        new Map([
          [
            new NetworkId('123e4567-e89b-12d3-a456-426614174000'),
            new Network(
              new NetworkId('123e4567-e89b-12d3-a456-426614174000'),
              new NetworkName('public'),
            ),
          ],
          [
            new NetworkId('123e4567-e89b-12d3-a456-426614174001'),
            new Network(
              new NetworkId('123e4567-e89b-12d3-a456-426614174001'),
              new NetworkName('private'),
            ),
          ],
        ]),
      ),
    );
    readiness.prepare.mockResolvedValue([
      {
        networkId: '123e4567-e89b-12d3-a456-426614174000',
        peerCount: 1,
        ready: true,
      },
      {
        networkId: '123e4567-e89b-12d3-a456-426614174001',
        peerCount: 0,
        ready: false,
      },
    ]);
    identityMetadataRepository.findAll.mockResolvedValue([]);
    keychainMetadataRepository.findAll.mockResolvedValue([]);
    conversationRepository.findConversationSyncScopes.mockResolvedValue([
      {
        conversationId: 'one-to-one:ready',
        networkId: '123e4567-e89b-12d3-a456-426614174000',
      },
      {
        conversationId: 'one-to-one:not-ready',
        networkId: '123e4567-e89b-12d3-a456-426614174001',
      },
    ]);
    communityRepository.findAll.mockResolvedValue([]);

    const result = await synchronizer.synchronize();
    const publishedEvents = eventPublisher.publish.mock.calls[0][0];

    expect(result).toMatchObject({
      connectedPeerCount: 1,
      conversationRequests: 1,
      identityNetworkRequests: 1,
      readyNetworkIds: ['123e4567-e89b-12d3-a456-426614174000'],
      totalRequests: 2,
      unreadyNetworkIds: ['123e4567-e89b-12d3-a456-426614174001'],
    });
    expect(publishedEvents).toEqual([
      expect.any(IdentityNetworkSyncRequestedEvent),
      expect.any(ConversationSyncRequestedEvent),
    ]);
    expect(publishedEvents[0].attributes).toMatchObject({
      networkId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(publishedEvents[1].attributes).toMatchObject({
      conversationId: 'one-to-one:ready',
      networkId: '123e4567-e89b-12d3-a456-426614174000',
    });
  });

  it('should publish community startup sync requests', async () => {
    const communityPrimitives: PrimitiveOf<Community> = {
      autoJoinEnabled: false,
      avatar: undefined,
      bannedMemberIds: [],
      banner: undefined,
      createdAt: 1,
      description: 'Community description',
      discoverable: true,
      id: '550e8400-e29b-41d4-a716-446655440020',
      memberIds: [],
      memberRoles: [],
      name: 'Community',
      networkId: '123e4567-e89b-12d3-a456-426614174000',
      ownerIdentityId: 'identity-1',
      roles: [
        {
          builtIn: true,
          id: 'everyone',
          name: 'everyone',
          permissions: [
            'attach_files',
            'connect_voice',
            'embed_links',
            'send_messages',
            'send_stickers',
            'view_channels',
          ],
        },
      ],
      textChannels: [],
      visibility: 'private',
      voiceChannels: [],
    };

    identityMetadataRepository.findAll.mockResolvedValue([]);
    keychainMetadataRepository.findAll.mockResolvedValue([]);
    conversationRepository.findConversationSyncScopes.mockResolvedValue([]);
    communityRepository.findAll.mockResolvedValue([
      {
        toPrimitives: () => communityPrimitives,
      },
    ] as never);

    const result = await synchronizer.synchronize();
    const publishedEvents = eventPublisher.publish.mock.calls[0][0];

    expect(result).toMatchObject({
      communityRequests: 1,
      connectedPeerCount: 2,
      conversationRequests: 0,
      identityNetworkRequests: 1,
      identityRequests: 0,
      keychainRequests: 0,
      networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
      publishedEvents: 2,
      requesterNodeId: nodeId,
      totalRequests: 2,
    });
    expect(publishedEvents).toEqual([
      expect.any(IdentityNetworkSyncRequestedEvent),
      expect.any(CommunitySyncRequestedEvent),
    ]);
    expect(publishedEvents[0].attributes).toMatchObject({
      networkId: '123e4567-e89b-12d3-a456-426614174000',
      requesterNodeId: nodeId,
      requestId: result.requestId,
    });
    expect(publishedEvents[1].attributes).toMatchObject({
      communityId: '550e8400-e29b-41d4-a716-446655440020',
      networkId: '123e4567-e89b-12d3-a456-426614174000',
      requesterNodeId: nodeId,
      requestId: result.requestId,
    });
  });

  it('should cap startup sync fanout deterministically', async () => {
    identityMetadataRepository.findAll.mockResolvedValue([
      {
        _id: 'identity-1-v1',
        cid: 'bafyidentity1v1',
        identityId: 'identity-1',
        networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
      {
        _id: 'identity-2-v1',
        cid: 'bafyidentity2v1',
        identityId: 'identity-2',
        networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
    ]);
    keychainMetadataRepository.findAll.mockResolvedValue([
      {
        _id: 'keychain-1',
        cid: 'bafykeychain1',
        ownerIdentityId: 'identity-1',
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
      {
        _id: 'keychain-2',
        cid: 'bafykeychain2',
        ownerIdentityId: 'identity-2',
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
    ]);
    conversationRepository.findConversationSyncScopes.mockResolvedValue([
      {
        conversationId: 'one-to-one:first',
        networkId: '123e4567-e89b-12d3-a456-426614174000',
      },
      {
        conversationId: 'one-to-one:second',
        networkId: '123e4567-e89b-12d3-a456-426614174000',
      },
    ]);
    communityRepository.findAll.mockResolvedValue([]);
    synchronizer = new NodeStartupSynchronizer({
      communityRepository,
      conversationRepository,
      eventPublisher,
      identityMetadataRepository,
      keychainMetadataRepository,
      nodeLoader,
      policy: new NodeStartupSyncPolicy({
        maxCommunityRequests: 1,
        maxConversationRequests: 1,
        maxIdentityRequests: 1,
        maxKeychainRequests: 1,
        maxTotalRequests: 3,
      }),
      readiness,
    });

    const result = await synchronizer.synchronize();
    const publishedEvents = eventPublisher.publish.mock.calls[0][0];

    expect(result).toMatchObject({
      conversationRequests: 1,
      identityNetworkRequests: 1,
      identityRequests: 1,
      keychainRequests: 1,
      omittedRequests: 4,
      publishedEvents: 3,
      totalRequests: 3,
    });
    expect(publishedEvents).toEqual([
      expect.any(IdentityNetworkSyncRequestedEvent),
      expect.any(IdentitySyncRequestedEvent),
      expect.any(KeychainSyncRequestedEvent),
    ]);
  });

  it('should rotate capped startup sync batches across retries', async () => {
    identityMetadataRepository.findAll.mockResolvedValue([
      {
        _id: 'identity-1-v1',
        cid: 'bafyidentity1v1',
        identityId: 'identity-1',
        networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
      {
        _id: 'identity-2-v1',
        cid: 'bafyidentity2v1',
        identityId: 'identity-2',
        networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
    ]);
    keychainMetadataRepository.findAll.mockResolvedValue([]);
    conversationRepository.findConversationSyncScopes.mockResolvedValue([
      {
        conversationId: 'one-to-one:first',
        networkId: '123e4567-e89b-12d3-a456-426614174000',
      },
      {
        conversationId: 'one-to-one:second',
        networkId: '123e4567-e89b-12d3-a456-426614174000',
      },
    ]);
    communityRepository.findAll.mockResolvedValue([]);
    synchronizer = new NodeStartupSynchronizer({
      communityRepository,
      conversationRepository,
      eventPublisher,
      identityMetadataRepository,
      keychainMetadataRepository,
      nodeLoader,
      policy: new NodeStartupSyncPolicy({
        maxCommunityRequests: 1,
        maxConversationRequests: 1,
        maxIdentityRequests: 1,
        maxKeychainRequests: 1,
        maxTotalRequests: 10,
      }),
      readiness,
    });

    await synchronizer.synchronize();
    await synchronizer.synchronize();

    const secondAttemptEvents = eventPublisher.publish.mock.calls[1][0];

    expect(secondAttemptEvents[1].attributes).toMatchObject({
      identityId: 'identity-2',
    });
    expect(secondAttemptEvents[2].attributes).toMatchObject({
      conversationId: 'one-to-one:second',
    });
  });

  it('should not synchronize again while networks remain unready', async () => {
    readiness.prepare.mockResolvedValue([
      {
        networkId: '123e4567-e89b-12d3-a456-426614174000',
        peerCount: 0,
        ready: false,
      },
    ]);
    readiness.inspect.mockResolvedValue([
      {
        networkId: '123e4567-e89b-12d3-a456-426614174000',
        peerCount: 0,
        ready: false,
      },
    ]);
    identityMetadataRepository.findAll.mockResolvedValue([]);
    keychainMetadataRepository.findAll.mockResolvedValue([]);
    conversationRepository.findConversationSyncScopes.mockResolvedValue([]);
    communityRepository.findAll.mockResolvedValue([]);

    await synchronizer.synchronize();
    await synchronizer.synchronizeWhenNetworkBecomesReady();

    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('should synchronize again when a network becomes ready', async () => {
    readiness.prepare
      .mockResolvedValueOnce([
        {
          networkId: '123e4567-e89b-12d3-a456-426614174000',
          peerCount: 0,
          ready: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          networkId: '123e4567-e89b-12d3-a456-426614174000',
          peerCount: 1,
          ready: true,
        },
      ]);
    readiness.inspect.mockResolvedValue([
      {
        networkId: '123e4567-e89b-12d3-a456-426614174000',
        peerCount: 1,
        ready: true,
      },
    ]);
    identityMetadataRepository.findAll.mockResolvedValue([]);
    keychainMetadataRepository.findAll.mockResolvedValue([]);
    conversationRepository.findConversationSyncScopes.mockResolvedValue([]);
    communityRepository.findAll.mockResolvedValue([]);

    await synchronizer.synchronize();
    await synchronizer.synchronizeWhenNetworkBecomesReady();

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish.mock.calls[0][0]).toEqual([
      expect.any(IdentityNetworkSyncRequestedEvent),
    ]);
  });
});

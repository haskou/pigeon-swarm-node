import NodeStartupSynchronizer from '@app/apps/synchronizers/NodeStartupSynchronizer';
import NodeStartupSyncPlanner from '@app/apps/synchronizers/NodeStartupSyncPlanner';
import NodeStartupSyncPolicy from '@app/apps/synchronizers/NodeStartupSyncPolicy';
import NodeStartupSyncReadiness from '@app/apps/synchronizers/NodeStartupSyncReadiness';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunitySyncRequestedEvent } from '@app/contexts/communities/domain/events/CommunitySyncRequestedEvent';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { ConversationSyncRequestedEvent } from '@app/contexts/conversations/domain/events/ConversationSyncRequestedEvent';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { IdentityNetworkSyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentityNetworkSyncRequestedEvent';
import { IdentitySyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentitySyncRequestedEvent';
import IdentityMetadataRepository from '@app/contexts/identities/domain/repositories/IdentityMetadataRepository';
import { KeychainSyncRequestedEvent } from '@app/contexts/keychains/domain/events/KeychainSyncRequestedEvent';
import KeychainMetadataRepository from '@app/contexts/keychains/domain/repositories/KeychainMetadataRepository';
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

  let conversationRepository: MockProxy<ConversationRepository>;
  let communityRepository: MockProxy<CommunityRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let identityMetadataRepository: MockProxy<IdentityMetadataRepository>;
  let keychainMetadataRepository: MockProxy<KeychainMetadataRepository>;
  let nodeLoader: MockProxy<NodeLoader>;
  let readiness: MockProxy<NodeStartupSyncReadiness>;
  let synchronizer: NodeStartupSynchronizer;

  beforeEach(() => {
    conversationRepository = mock<ConversationRepository>();
    communityRepository = mock<CommunityRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    identityMetadataRepository = mock<IdentityMetadataRepository>();
    keychainMetadataRepository = mock<KeychainMetadataRepository>();
    nodeLoader = mock<NodeLoader>();
    readiness = mock<NodeStartupSyncReadiness>();
    readiness.prepare.mockResolvedValue(2);
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
    synchronizer = new NodeStartupSynchronizer(
      readiness,
      new NodeStartupSyncPlanner(
        communityRepository,
        conversationRepository,
        identityMetadataRepository,
        keychainMetadataRepository,
        nodeLoader,
        new NodeStartupSyncPolicy(),
      ),
      eventPublisher,
    );
  });

  it('should prepare and publish scoped startup sync requests', async () => {
    identityMetadataRepository.findAll.mockResolvedValue([
      {
        cid: 'bafyidentity1v1',
        identityId: 'identity-1',
        networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
      {
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
    communityRepository.findSyncable.mockResolvedValue([]);

    const result = await synchronizer.synchronize();
    const publishedEvents = eventPublisher.publish.mock.calls[0][0];

    expect(readiness.prepare).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      communityRequests: 0,
      connectedPeerCount: 2,
      conversationRequests: 1,
      identityNetworkRequests: 1,
      identityRequests: 1,
      keychainRequests: 1,
      networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
      publishedEvents: 4,
      requesterNodeId: nodeId,
      totalRequests: 4,
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
    communityRepository.findSyncable.mockResolvedValue([
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
        cid: 'bafyidentity1v1',
        identityId: 'identity-1',
        networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
      {
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
        cid: 'bafykeychain1',
        ownerIdentityId: 'identity-1',
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
      {
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
    communityRepository.findSyncable.mockResolvedValue([]);
    synchronizer = new NodeStartupSynchronizer(
      readiness,
      new NodeStartupSyncPlanner(
        communityRepository,
        conversationRepository,
        identityMetadataRepository,
        keychainMetadataRepository,
        nodeLoader,
        NodeStartupSyncPolicy.fromOptions({
          maxCommunityRequests: 1,
          maxConversationRequests: 1,
          maxIdentityRequests: 1,
          maxKeychainRequests: 1,
          maxTotalRequests: 3,
        }),
      ),
      eventPublisher,
    );

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
        cid: 'bafyidentity1v1',
        identityId: 'identity-1',
        networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
      {
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
    communityRepository.findSyncable.mockResolvedValue([]);
    synchronizer = new NodeStartupSynchronizer(
      readiness,
      new NodeStartupSyncPlanner(
        communityRepository,
        conversationRepository,
        identityMetadataRepository,
        keychainMetadataRepository,
        nodeLoader,
        NodeStartupSyncPolicy.fromOptions({
          maxCommunityRequests: 1,
          maxConversationRequests: 1,
          maxIdentityRequests: 1,
          maxKeychainRequests: 1,
          maxTotalRequests: 10,
        }),
      ),
      eventPublisher,
    );

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
});

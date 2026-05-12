import NodeStartupSynchronizer from '@app/apps/synchronizers/NodeStartupSynchronizer';
import { ConversationSyncRequestedEvent } from '@app/contexts/conversations/domain/events/ConversationSyncRequestedEvent';
import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import { IdentitySyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentitySyncRequestedEvent';
import MongoIdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import { KeychainSyncRequestedEvent } from '@app/contexts/keychains/domain/events/KeychainSyncRequestedEvent';
import MongoKeychainMetadataRepository from '@app/contexts/keychains/infrastructure/mongo/MongoKeychainMetadataRepository';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import { Network } from '@app/contexts/nodes/domain/Network';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NetworkName } from '@app/contexts/nodes/domain/value-objects/NetworkName';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodeStartupSynchronizer', () => {
  const nodeId = '550e8400-e29b-41d4-a716-446655440010';

  let conversationRepository: MockProxy<MongoConversationRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let heartbeatSender: MockProxy<NodeHeartbeatSender>;
  let identityMetadataRepository: MockProxy<MongoIdentityMetadataRepository>;
  let keychainMetadataRepository: MockProxy<MongoKeychainMetadataRepository>;
  let nodeLoader: MockProxy<NodeLoader>;
  let synchronizer: NodeStartupSynchronizer;

  beforeEach(() => {
    conversationRepository = mock<MongoConversationRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    heartbeatSender = mock<NodeHeartbeatSender>();
    identityMetadataRepository = mock<MongoIdentityMetadataRepository>();
    keychainMetadataRepository = mock<MongoKeychainMetadataRepository>();
    nodeLoader = mock<NodeLoader>();
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
      nodeLoader,
      heartbeatSender,
      identityMetadataRepository,
      keychainMetadataRepository,
      conversationRepository,
      eventPublisher,
    );
  });

  it('should send heartbeat and publish scoped startup sync requests', async () => {
    identityMetadataRepository.findAll.mockResolvedValue([
      {
        _id: 'identity-1-v1',
        cid: 'bafyidentity1v1',
        identityId: 'identity-1',
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
      {
        _id: 'identity-1-v2',
        cid: 'bafyidentity1v2',
        identityId: 'identity-1',
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
    conversationRepository.findConversationIdsWithMessages.mockResolvedValue([
      'one-to-one:conversation',
    ]);

    const result = await synchronizer.synchronize();
    const publishedEvents = eventPublisher.publish.mock.calls[0][0];

    expect(heartbeatSender.send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      conversationRequests: 1,
      identityRequests: 1,
      keychainRequests: 1,
    });
    expect(publishedEvents).toEqual([
      expect.any(IdentitySyncRequestedEvent),
      expect.any(KeychainSyncRequestedEvent),
      expect.any(ConversationSyncRequestedEvent),
    ]);
    expect(publishedEvents[0].attributes).toMatchObject({
      identityId: 'identity-1',
      knownVersion: 2,
      requesterNodeId: nodeId,
      requestId: result.requestId,
    });
    expect(publishedEvents[1].attributes).toMatchObject({
      knownVersion: 3,
      ownerIdentityId: 'identity-1',
      requesterNodeId: nodeId,
      requestId: result.requestId,
    });
    expect(publishedEvents[2].attributes).toMatchObject({
      conversationId: 'one-to-one:conversation',
      requesterNodeId: nodeId,
      requestId: result.requestId,
    });
  });
});

import { ConversationSyncRequestedEvent } from '@app/contexts/conversations/domain/events/ConversationSyncRequestedEvent';
import { ConversationSyncScope } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import { IdentitySyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentitySyncRequestedEvent';
import IdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import { KeychainSyncRequestedEvent } from '@app/contexts/keychains/domain/events/KeychainSyncRequestedEvent';
import KeychainMetadataRepository from '@app/contexts/keychains/infrastructure/mongo/MongoKeychainMetadataRepository';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { UUID } from '@haskou/value-objects';

type LatestVersionByResource = Map<string, number>;

export interface NodeStartupSyncResult {
  conversationRequests: number;
  identityRequests: number;
  keychainRequests: number;
  requestId: string;
}

export default class NodeStartupSynchronizer {
  constructor(
    private readonly nodeLoader: NodeLoader,
    private readonly heartbeatSender: NodeHeartbeatSender,
    private readonly identityMetadataRepository: IdentityMetadataRepository,
    private readonly keychainMetadataRepository: KeychainMetadataRepository,
    private readonly conversationRepository: MongoConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  private getLatestVersions<T extends { version: number }>(
    documents: T[],
    getResourceId: (document: T) => string,
  ): LatestVersionByResource {
    const versions: LatestVersionByResource = new Map();

    for (const document of documents) {
      const resourceId = getResourceId(document);
      const currentVersion = versions.get(resourceId) || 0;

      versions.set(resourceId, Math.max(currentVersion, document.version));
    }

    return versions;
  }

  private identityRequests(
    requestId: string,
    requesterNodeId: string,
    versions: LatestVersionByResource,
  ): DomainEvent[] {
    return [...versions.entries()].map(
      ([identityId, knownVersion]) =>
        new IdentitySyncRequestedEvent(identityId, {
          identityId,
          knownVersion,
          requesterNodeId,
          requestId,
        }),
    );
  }

  private keychainRequests(
    requestId: string,
    requesterNodeId: string,
    versions: LatestVersionByResource,
  ): DomainEvent[] {
    return [...versions.entries()].map(
      ([ownerIdentityId, knownVersion]) =>
        new KeychainSyncRequestedEvent(ownerIdentityId, {
          knownVersion,
          ownerIdentityId,
          requesterNodeId,
          requestId,
        }),
    );
  }

  private conversationRequests(
    requestId: string,
    requesterNodeId: string,
    conversationScopes: ConversationSyncScope[],
  ): DomainEvent[] {
    return conversationScopes.map(
      (scope) =>
        new ConversationSyncRequestedEvent(scope.conversationId, {
          conversationId: scope.conversationId,
          networkId: scope.networkId,
          requesterNodeId,
          requestId,
        }),
    );
  }

  public async synchronize(): Promise<NodeStartupSyncResult> {
    const requestId = UUID.generate().toString();
    const node = await this.nodeLoader.loadNode();
    const requesterNodeId = node.toPrimitives().id;

    await this.heartbeatSender.send();

    const [identityMetadata, keychainMetadata, conversationScopes] =
      await Promise.all([
        this.identityMetadataRepository.findAll(),
        this.keychainMetadataRepository.findAll(),
        this.conversationRepository.findConversationSyncScopes(),
      ]);
    const identityVersions = this.getLatestVersions(
      identityMetadata,
      (document) => document.identityId,
    );
    const keychainVersions = this.getLatestVersions(
      keychainMetadata,
      (document) => document.ownerIdentityId,
    );
    const events = [
      ...this.identityRequests(requestId, requesterNodeId, identityVersions),
      ...this.keychainRequests(requestId, requesterNodeId, keychainVersions),
      ...this.conversationRequests(
        requestId,
        requesterNodeId,
        conversationScopes,
      ),
    ];

    if (events.length > 0) {
      await this.eventPublisher.publish(events);
    }

    return {
      conversationRequests: conversationScopes.length,
      identityRequests: identityVersions.size,
      keychainRequests: keychainVersions.size,
      requestId,
    };
  }
}

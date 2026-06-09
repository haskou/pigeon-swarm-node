import { CommunitySyncRequestedEvent } from '@app/contexts/communities/domain/events/CommunitySyncRequestedEvent';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import { ConversationSyncRequestedEvent } from '@app/contexts/conversations/domain/events/ConversationSyncRequestedEvent';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationSyncScope } from '@app/contexts/conversations/domain/repositories/types/ConversationSyncScope';
import { IdentityNetworkSyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentityNetworkSyncRequestedEvent';
import { IdentitySyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentitySyncRequestedEvent';
import IdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import { KeychainSyncRequestedEvent } from '@app/contexts/keychains/domain/events/KeychainSyncRequestedEvent';
import KeychainMetadataRepository from '@app/contexts/keychains/infrastructure/mongo/MongoKeychainMetadataRepository';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { UUID } from '@haskou/value-objects';

import type NodeStartupSyncReadiness from './NodeStartupSyncReadiness';

import { LatestVersionByResource } from './LatestVersionByResource';
import { NodeStartupSynchronizerDependencies } from './NodeStartupSynchronizerDependencies';
import NodeStartupSyncPolicy from './NodeStartupSyncPolicy';

export interface NodeStartupSyncResult {
  communityRequests: number;
  connectedPeerCount: number;
  conversationRequests: number;
  identityNetworkRequests: number;
  identityRequests: number;
  keychainRequests: number;
  networkIds: string[];
  omittedRequests: number;
  publishedEvents: number;
  requestId: string;
  requesterNodeId: string;
  totalRequests: number;
}

export default class NodeStartupSynchronizer {
  private readonly communityRepository: MongoCommunityRepository;
  private readonly conversationRepository: ConversationRepository;
  private readonly eventPublisher: DomainEventPublisher;
  private readonly identityMetadataRepository: IdentityMetadataRepository;
  private readonly keychainMetadataRepository: KeychainMetadataRepository;
  private readonly nodeLoader: NodeLoader;
  private readonly policy: NodeStartupSyncPolicy;
  private readonly readiness: NodeStartupSyncReadiness;
  private syncAttempt = 0;

  constructor(dependencies: NodeStartupSynchronizerDependencies) {
    this.communityRepository = dependencies.communityRepository;
    this.conversationRepository = dependencies.conversationRepository;
    this.eventPublisher = dependencies.eventPublisher;
    this.identityMetadataRepository = dependencies.identityMetadataRepository;
    this.keychainMetadataRepository = dependencies.keychainMetadataRepository;
    this.nodeLoader = dependencies.nodeLoader;
    this.policy =
      dependencies.policy ?? NodeStartupSyncPolicy.fromEnvironment();
    this.readiness = dependencies.readiness;
  }

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

  private identityNetworkRequests(
    requestId: string,
    requesterNodeId: string,
    networkIds: string[],
  ): DomainEvent[] {
    return networkIds.map(
      (networkId) =>
        new IdentityNetworkSyncRequestedEvent(networkId, {
          networkId,
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

  private async communityRequests(
    requestId: string,
    requesterNodeId: string,
  ): Promise<DomainEvent[]> {
    const communities = await this.communityRepository.findAll();

    return communities.map((community) => {
      const primitives = community.toPrimitives();

      return new CommunitySyncRequestedEvent(primitives.id, {
        communityId: primitives.id,
        networkId: primitives.networkId,
        requesterNodeId,
        requestId,
      });
    });
  }

  public async synchronize(): Promise<NodeStartupSyncResult> {
    const syncAttempt = this.syncAttempt;

    this.syncAttempt += 1;

    const requestId = UUID.generate().toString();
    const node = await this.nodeLoader.loadNode();
    const nodePrimitives = node.toPrimitives();
    const requesterNodeId = nodePrimitives.id;
    const networkIds = Object.keys(nodePrimitives.networks);

    const connectedPeerCount = await this.readiness.prepare();

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
    const limitedIdentityVersions = new Map(
      this.policy.limitIdentities([...identityVersions.entries()], syncAttempt),
    );
    const limitedKeychainVersions = new Map(
      this.policy.limitKeychains([...keychainVersions.entries()], syncAttempt),
    );
    const limitedConversationScopes = this.policy.limitConversations(
      conversationScopes,
      syncAttempt,
    );
    const communityRequests = await this.communityRequests(
      requestId,
      requesterNodeId,
    );
    const limitedCommunityRequests = this.policy.limitCommunities(
      communityRequests,
      syncAttempt,
    );
    const rawPlannedRequests =
      networkIds.length +
      identityVersions.size +
      keychainVersions.size +
      conversationScopes.length +
      communityRequests.length;
    const plannedEvents = [
      ...this.identityNetworkRequests(requestId, requesterNodeId, networkIds),
      ...this.identityRequests(
        requestId,
        requesterNodeId,
        limitedIdentityVersions,
      ),
      ...this.keychainRequests(
        requestId,
        requesterNodeId,
        limitedKeychainVersions,
      ),
      ...this.conversationRequests(
        requestId,
        requesterNodeId,
        limitedConversationScopes,
      ),
      ...limitedCommunityRequests,
    ];
    const events = this.policy.limitTotal(plannedEvents);

    const totalRequests = events.length;

    if (totalRequests > 0) {
      await this.eventPublisher.publish(events);
    }

    return {
      communityRequests: limitedCommunityRequests.length,
      connectedPeerCount,
      conversationRequests: limitedConversationScopes.length,
      identityNetworkRequests: networkIds.length,
      identityRequests: limitedIdentityVersions.size,
      keychainRequests: limitedKeychainVersions.size,
      networkIds,
      omittedRequests: rawPlannedRequests - events.length,
      publishedEvents: totalRequests,
      requesterNodeId,
      requestId,
      totalRequests,
    };
  }

  public scheduleRetries(
    delaysMs: number[] = [5000, 15000, 30000, 60000],
  ): void {
    for (const delayMs of delaysMs) {
      const timer = setTimeout(() => {
        void this.synchronize().catch((): void => undefined);
      }, delayMs);

      timer.unref?.();
    }
  }
}

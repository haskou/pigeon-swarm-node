import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import { ContentReplicaClaim } from '../../domain/ContentReplicaClaim';
import { ContentReplication } from '../../domain/ContentReplication';
import { ContentReplicationWasClaimedEvent } from '../../domain/events/ContentReplicationWasClaimedEvent';
import { ContentReplicationWasRegisteredEvent } from '../../domain/events/ContentReplicationWasRegisteredEvent';
import ContentReplicaClaimRepository from '../../domain/repositories/ContentReplicaClaimRepository';
import ContentReplicationRepository from '../../domain/repositories/ContentReplicationRepository';
import { ContentFilename } from '../../domain/value-objects/ContentFilename';
import { ContentReplicationContext } from '../../domain/value-objects/ContentReplicationContext';
import { ContentReplicationMetadata } from '../../domain/value-objects/ContentReplicationMetadata';
import { ContentReplicationPriority } from '../../domain/value-objects/ContentReplicationPriority';
import { ContentSize } from '../../domain/value-objects/ContentSize';
import { ContentType } from '../../domain/value-objects/ContentType';
import ContentReplicationSummaryRefresher from '../refresh-status-summary/ContentReplicationSummaryRefresher';

export default class ContentReplicationRegistrar {
  constructor(
    private readonly repository: ContentReplicationRepository,
    private readonly claimRepository: ContentReplicaClaimRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly summaryRefresher?: ContentReplicationSummaryRefresher,
  ) {}

  private async claimLocalReplicas(
    cid: IPFSId,
    networkIds: string[],
    nodeId: string,
  ): Promise<ContentReplicaClaim[]> {
    const claimedAt = Timestamp.now();
    const claims = networkIds.map((networkId) =>
      ContentReplicaClaim.create(
        cid,
        new NetworkId(networkId),
        new NodeId(nodeId),
        claimedAt,
      ),
    );

    for (const claim of claims) {
      await this.claimRepository.save(claim);
    }

    return claims;
  }

  private async publishClaimEvents(
    claims: ContentReplicaClaim[],
  ): Promise<void> {
    await this.eventPublisher.publish(
      claims.map((claim) => {
        const primitives = claim.toPrimitives();

        return new ContentReplicationWasClaimedEvent(primitives.cid, {
          cid: primitives.cid,
          claimedAt: primitives.claimedAt,
          networkId: primitives.networkId,
          nodeId: primitives.nodeId,
        });
      }),
    );
  }

  private async runPostRegistrationSideEffects(
    content: ContentReplication,
    claims: ContentReplicaClaim[],
  ): Promise<void> {
    await this.publishRegistration(content);
    await this.publishClaimEvents(claims);
    await this.summaryRefresher?.refresh();
  }

  private runDeferredPostRegistrationSideEffects(
    content: ContentReplication,
    claims: ContentReplicaClaim[],
  ): void {
    this.runPostRegistrationSideEffects(content, claims).catch(
      (error: unknown): void => {
        void error;
      },
    );
  }

  private async publishRegistration(
    content: ContentReplication,
  ): Promise<void> {
    const primitives = content.toPrimitives();

    await this.eventPublisher.publish(
      primitives.networkIds.map(
        (networkId) =>
          new ContentReplicationWasRegisteredEvent(primitives.cid, {
            cid: primitives.cid,
            contentType: primitives.contentType,
            context: primitives.context,
            createdAt: primitives.createdAt,
            filename: primitives.filename,
            networkIds: [networkId],
            ownerIdentityId: primitives.ownerIdentityId,
            priority: primitives.priority,
            sizeBytes: primitives.sizeBytes,
            updatedAt: primitives.updatedAt,
          }),
      ),
    );
  }

  private updateExistingContent(
    content: ContentReplication,
    networkIds: NetworkId[],
    metadata: ContentReplicationMetadata,
  ): ContentReplication {
    content.addNetworkIds(networkIds);
    content.updateMetadata(metadata);
    content.touch();

    return content;
  }

  private createContent(params: {
    cid: IPFSId;
    context: string;
    metadata: ContentReplicationMetadata;
    networkIds: NetworkId[];
    ownerIdentityId?: string;
    priority?: ContentReplicationPriority;
  }): ContentReplication {
    return ContentReplication.create(
      params.cid,
      new ContentReplicationContext(params.context),
      params.networkIds,
      params.metadata,
      params.ownerIdentityId
        ? new IdentityId(params.ownerIdentityId)
        : undefined,
      params.priority ?? ContentReplicationPriority.NORMAL,
    );
  }

  private async completeRegistration(params: {
    cid: IPFSId;
    content: ContentReplication;
    deferSideEffects?: boolean;
    localNodeId: string;
    localReplicaNetworkIds?: string[];
    networkIds: string[];
  }): Promise<void> {
    const claims = await this.claimLocalReplicas(
      params.cid,
      params.localReplicaNetworkIds ?? params.networkIds,
      params.localNodeId,
    );

    if (params.deferSideEffects) {
      this.runDeferredPostRegistrationSideEffects(params.content, claims);

      return;
    }

    await this.runPostRegistrationSideEffects(params.content, claims);
  }

  public async register(params: {
    cid: string;
    contentType?: string;
    context: string;
    deferSideEffects?: boolean;
    filename?: string;
    localReplicaNetworkIds?: string[];
    localNodeId: string;
    networkIds: string[];
    ownerIdentityId?: string;
    priority?: ContentReplicationPriority;
    sizeBytes: number;
  }): Promise<ContentReplication> {
    const cid = new IPFSId(params.cid);
    const existing = await this.repository.findByCid(cid);
    const networkIds = params.networkIds.map(
      (networkId) => new NetworkId(networkId),
    );
    const metadata = ContentReplicationMetadata.create(
      new ContentSize(params.sizeBytes),
      params.contentType
        ? new ContentType(params.contentType)
        : ContentType.DEFAULT,
      params.filename ? new ContentFilename(params.filename) : undefined,
    );
    const content = existing
      ? this.updateExistingContent(existing, networkIds, metadata)
      : this.createContent({
          cid,
          context: params.context,
          metadata,
          networkIds,
          ownerIdentityId: params.ownerIdentityId,
          priority: params.priority,
        });

    await this.repository.save(content);
    await this.completeRegistration({
      cid,
      content,
      deferSideEffects: params.deferSideEffects,
      localNodeId: params.localNodeId,
      localReplicaNetworkIds: params.localReplicaNetworkIds,
      networkIds: params.networkIds,
    });

    return content;
  }
}

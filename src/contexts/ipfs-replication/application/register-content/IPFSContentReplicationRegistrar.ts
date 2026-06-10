import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import { IPFSContentReplicationWasClaimedEvent } from '../../domain/events/IPFSContentReplicationWasClaimedEvent';
import { IPFSContentReplicationWasRegisteredEvent } from '../../domain/events/IPFSContentReplicationWasRegisteredEvent';
import { IPFSContentReplicaClaim } from '../../domain/IPFSContentReplicaClaim';
import { IPFSContentReplication } from '../../domain/IPFSContentReplication';
import IPFSContentReplicaClaimRepository from '../../domain/repositories/IPFSContentReplicaClaimRepository';
import IPFSContentReplicationRepository from '../../domain/repositories/IPFSContentReplicationRepository';
import { IPFSContentFilename } from '../../domain/value-objects/IPFSContentFilename';
import { IPFSContentReplicationContext } from '../../domain/value-objects/IPFSContentReplicationContext';
import { IPFSContentReplicationMetadata } from '../../domain/value-objects/IPFSContentReplicationMetadata';
import { IPFSContentReplicationPriority } from '../../domain/value-objects/IPFSContentReplicationPriority';
import { IPFSContentSize } from '../../domain/value-objects/IPFSContentSize';
import { IPFSContentType } from '../../domain/value-objects/IPFSContentType';
import IPFSReplicationStatusSummaryRefresher from '../refresh-status-summary/IPFSReplicationStatusSummaryRefresher';

export default class IPFSContentReplicationRegistrar {
  constructor(
    private readonly repository: IPFSContentReplicationRepository,
    private readonly claimRepository: IPFSContentReplicaClaimRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly summaryRefresher?: IPFSReplicationStatusSummaryRefresher,
  ) {}

  private async claimLocalReplicas(
    cid: IPFSId,
    networkIds: string[],
    nodeId: string,
  ): Promise<void> {
    const claimedAt = Timestamp.now();
    const claims = networkIds.map((networkId) =>
      IPFSContentReplicaClaim.create(
        cid,
        new NetworkId(networkId),
        new NodeId(nodeId),
        claimedAt,
      ),
    );

    for (const claim of claims) {
      await this.claimRepository.save(claim);
    }

    await this.eventPublisher.publish(
      claims.map((claim) => {
        const primitives = claim.toPrimitives();

        return new IPFSContentReplicationWasClaimedEvent(primitives.cid, {
          cid: primitives.cid,
          claimedAt: primitives.claimedAt,
          networkId: primitives.networkId,
          nodeId: primitives.nodeId,
        });
      }),
    );
  }

  private async publishRegistration(
    content: IPFSContentReplication,
  ): Promise<void> {
    const primitives = content.toPrimitives();

    await this.eventPublisher.publish(
      primitives.networkIds.map(
        (networkId) =>
          new IPFSContentReplicationWasRegisteredEvent(primitives.cid, {
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

  public async register(params: {
    cid: string;
    contentType?: string;
    context: string;
    filename?: string;
    localNodeId: string;
    networkIds: string[];
    ownerIdentityId?: string;
    priority?: IPFSContentReplicationPriority;
    sizeBytes: number;
  }): Promise<IPFSContentReplication> {
    const cid = new IPFSId(params.cid);
    const existing = await this.repository.findByCid(cid);
    const networkIds = params.networkIds.map(
      (networkId) => new NetworkId(networkId),
    );
    const metadata = IPFSContentReplicationMetadata.create(
      new IPFSContentSize(params.sizeBytes),
      params.contentType
        ? new IPFSContentType(params.contentType)
        : IPFSContentType.DEFAULT,
      params.filename ? new IPFSContentFilename(params.filename) : undefined,
    );

    if (existing) {
      existing.addNetworkIds(networkIds);
      existing.updateMetadata(metadata);
      existing.touch();
      await this.repository.save(existing);
      await this.publishRegistration(existing);
      await this.claimLocalReplicas(cid, params.networkIds, params.localNodeId);
      await this.summaryRefresher?.refresh();

      return existing;
    }

    const content = IPFSContentReplication.create(
      cid,
      new IPFSContentReplicationContext(params.context),
      networkIds,
      metadata,
      params.ownerIdentityId
        ? new IdentityId(params.ownerIdentityId)
        : undefined,
      params.priority ?? IPFSContentReplicationPriority.NORMAL,
    );

    await this.repository.save(content);
    await this.publishRegistration(content);
    await this.claimLocalReplicas(cid, params.networkIds, params.localNodeId);
    await this.summaryRefresher?.refresh();

    return content;
  }
}

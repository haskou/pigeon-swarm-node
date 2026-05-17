import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import { IPFSContentReplicationWasClaimedEvent } from '../../domain/events/IPFSContentReplicationWasClaimedEvent';
import { IPFSContentReplicaClaim } from '../../domain/IPFSContentReplicaClaim';
import { IPFSContentReplication } from '../../domain/IPFSContentReplication';
import { IPFSContentReplicaClaimRepository } from '../../domain/repositories/IPFSContentReplicaClaimRepository';
import { IPFSContentReplicationRepository } from '../../domain/repositories/IPFSContentReplicationRepository';
import { IPFSContentReplicationContext } from '../../domain/value-objects/IPFSContentReplicationContext';
import { IPFSContentReplicationPriority } from '../../domain/value-objects/IPFSContentReplicationPriority';
import { IPFSContentSize } from '../../domain/value-objects/IPFSContentSize';

export default class IPFSContentReplicationRegistrar {
  constructor(
    private readonly repository: IPFSContentReplicationRepository,
    private readonly claimRepository: IPFSContentReplicaClaimRepository,
    private readonly eventPublisher: DomainEventPublisher,
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

  public async register(params: {
    cid: string;
    context: string;
    localNodeId: string;
    networkIds: string[];
    ownerIdentityId?: string;
    priority?: IPFSContentReplicationPriority;
    sizeBytes: number;
  }): Promise<IPFSContentReplication> {
    const cid = new IPFSId(params.cid);
    const existing = await this.repository.findByCid(cid);

    if (existing) {
      existing.touch();
      await this.repository.save(existing);
      await this.claimLocalReplicas(cid, params.networkIds, params.localNodeId);

      return existing;
    }

    const content = IPFSContentReplication.create(
      cid,
      new IPFSContentReplicationContext(params.context),
      params.networkIds.map((networkId) => new NetworkId(networkId)),
      new IPFSContentSize(params.sizeBytes),
      params.ownerIdentityId
        ? new IdentityId(params.ownerIdentityId)
        : undefined,
      params.priority ?? IPFSContentReplicationPriority.NORMAL,
    );

    await this.repository.save(content);
    await this.claimLocalReplicas(cid, params.networkIds, params.localNodeId);

    return content;
  }
}

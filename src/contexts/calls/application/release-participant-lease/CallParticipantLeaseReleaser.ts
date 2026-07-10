import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Call } from '../../domain/Call';
import { CallParticipantLease } from '../../domain/CallParticipantLease';
import CallParticipantLeaseRepository from '../../domain/repositories/CallParticipantLeaseRepository';

export default class CallParticipantLeaseReleaser {
  constructor(
    private readonly repository: CallParticipantLeaseRepository,
    private readonly nodeRepository: NodeRepository,
  ) {}

  public async release(
    call: Call,
    participantIdentityId: IdentityId,
  ): Promise<CallParticipantLease[]> {
    const nodeId = await this.nodeRepository.loadLocalNodeId();
    const leases = await this.repository.findByCallIds([call.getId()]);
    const ownedLeases = leases.filter((lease) =>
      lease.belongsTo(participantIdentityId, nodeId),
    );
    const released: CallParticipantLease[] = [];

    for (const lease of ownedLeases) {
      if (!lease.disconnect()) {
        continue;
      }

      await this.repository.save(lease);
      released.push(lease);
    }

    return released;
  }
}

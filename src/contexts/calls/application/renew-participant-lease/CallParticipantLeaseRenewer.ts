import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';

import { IdentityId } from '../../../shared/domain/value-objects/IdentityId';
import { Call } from '../../domain/Call';
import { CallParticipantLease } from '../../domain/CallParticipantLease';
import { CallParticipantMediaConnection } from '../../domain/CallParticipantMediaConnection';
import CallParticipantLeaseRepository from '../../domain/repositories/CallParticipantLeaseRepository';

export default class CallParticipantLeaseRenewer {
  constructor(
    private readonly repository: CallParticipantLeaseRepository,
    private readonly nodeRepository: NodeRepository,
  ) {}

  public async renew(
    call: Call,
    participantIdentityId: IdentityId,
    mediaConnections: CallParticipantMediaConnection[] = [],
  ): Promise<CallParticipantLease> {
    const nodeId = await this.nodeRepository.loadLocalNodeId();
    const leases = await this.repository.findByCallIds([call.getId()]);
    const existing = leases.find((lease) =>
      lease.belongsTo(participantIdentityId, nodeId),
    );
    const lease =
      existing ??
      CallParticipantLease.connect(
        call.getId(),
        participantIdentityId,
        nodeId,
        call.getNetworkId(),
        call.getParticipantIds(),
        mediaConnections,
      );

    if (existing) {
      lease.renew(call.getParticipantIds(), mediaConnections);
    }

    await this.repository.save(lease);

    return lease;
  }
}

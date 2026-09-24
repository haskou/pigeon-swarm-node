import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { Timestamp } from '@haskou/value-objects';

import { IdentityId } from '../../../shared/domain/value-objects/IdentityId';
import { Call } from '../../domain/Call';
import { CallParticipantLease } from '../../domain/CallParticipantLease';
import { CallParticipantMediaConnection } from '../../domain/CallParticipantMediaConnection';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
import CallParticipantLeaseRepository from '../../domain/repositories/CallParticipantLeaseRepository';

export default class CallParticipantLeaseRenewer {
  constructor(
    private readonly repository: CallParticipantLeaseRepository,
    private readonly nodeRepository: NodeRepository,
  ) {}

  private nextHeartbeatAt(lease: CallParticipantLease): Timestamp {
    const now = Timestamp.now();
    const previous = lease.getLastHeartbeatAt();

    return now.isAfter(previous) ? now : previous.addMilliseconds(1);
  }

  private async update(
    call: Call,
    participantIdentityId: IdentityId,
    mediaConnections: CallParticipantMediaConnection[],
    requireParticipation: boolean,
  ): Promise<CallParticipantLease> {
    const nodeId = await this.nodeRepository.loadLocalNodeId();
    const leases = await this.repository.findByCallIds([call.getId()]);
    const existing = leases.find((lease) =>
      lease.belongsTo(participantIdentityId, nodeId),
    );

    if (requireParticipation && !existing?.hasParticipationGrant())
      throw new CallNotFoundError();
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
      lease.renew(
        call.getParticipantIds(),
        mediaConnections,
        this.nextHeartbeatAt(existing),
      );
    }

    if (requireParticipation) {
      if (!(await this.repository.renewIfParticipating(lease)))
        throw new CallNotFoundError();
    } else {
      await this.repository.save(lease);
    }

    return lease;
  }

  public renew(
    call: Call,
    participantIdentityId: IdentityId,
    mediaConnections: CallParticipantMediaConnection[] = [],
  ): Promise<CallParticipantLease> {
    return this.update(call, participantIdentityId, mediaConnections, false);
  }

  public renewExisting(
    call: Call,
    participantIdentityId: IdentityId,
    mediaConnections: CallParticipantMediaConnection[] = [],
  ): Promise<CallParticipantLease> {
    return this.update(call, participantIdentityId, mediaConnections, true);
  }
}

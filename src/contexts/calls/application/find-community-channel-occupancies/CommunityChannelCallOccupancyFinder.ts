import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';

import { Call } from '../../domain/Call';
import { CallParticipantLease } from '../../domain/CallParticipantLease';
import CallParticipantLeaseRepository from '../../domain/repositories/CallParticipantLeaseRepository';
import CallRepository from '../../domain/repositories/CallRepository';
import { CommunityChannelCallOccupancy } from './CommunityChannelCallOccupancy';

export default class CommunityChannelCallOccupancyFinder {
  constructor(
    private readonly callRepository: CallRepository,
    private readonly leaseRepository: CallParticipantLeaseRepository,
  ) {}

  private addCallOccupancy(
    occupancies: CommunityChannelCallOccupancy[],
    call: Call,
    leases: CallParticipantLease[],
  ): void {
    const channelId = call.getCommunityChannelId();

    if (!channelId) {
      return;
    }

    const occupancy = this.findOrCreateOccupancy(occupancies, channelId);

    leases
      .filter((lease) => lease.isConnected())
      .filter((lease) => lease.belongsToCall(call.getId()))
      .map((lease) => lease.getParticipantIdentityId())
      .filter((identityId) => call.hasJoinedParticipant(identityId))
      .forEach((identityId) => occupancy.addConnectedIdentity(identityId));
  }

  private findOrCreateOccupancy(
    occupancies: CommunityChannelCallOccupancy[],
    channelId: CommunityChannelId,
  ): CommunityChannelCallOccupancy {
    const current = occupancies.find((occupancy) =>
      occupancy.belongsTo(channelId),
    );

    if (current) {
      return current;
    }

    const occupancy = new CommunityChannelCallOccupancy(channelId);

    occupancies.push(occupancy);

    return occupancy;
  }

  public async find(
    communityId: CommunityId,
  ): Promise<CommunityChannelCallOccupancy[]> {
    const calls = await this.callRepository.findActiveByCommunity(communityId);
    const leases = await this.leaseRepository.findByCallIds(
      calls.map((call) => call.getId()),
    );
    const occupancies: CommunityChannelCallOccupancy[] = [];

    calls.forEach((call) => this.addCallOccupancy(occupancies, call, leases));

    return occupancies;
  }
}

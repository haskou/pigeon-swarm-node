import CommunityChannelCallOccupancyFinder from '@app/contexts/calls/application/find-community-channel-occupancies/CommunityChannelCallOccupancyFinder';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import CallParticipantLeaseRepository from '@app/contexts/calls/domain/repositories/CallParticipantLeaseRepository';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { mock } from 'jest-mock-extended';

describe('CommunityChannelCallOccupancyFinder', () => {
  const communityId = new CommunityId('community');
  const channelId = new CommunityChannelId('voice-channel');
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440011');
  const nodeId = new NodeId('550e8400-e29b-41d4-a716-446655440012');

  it('includes a joined participant while its lease is connected', async () => {
    const call = activeCommunityCall();
    const lease = connectedLease(call);
    const finder = occupancyFinder([call], [lease]);

    const [occupancy] = await finder.find(communityId);

    expect(occupancy.belongsTo(channelId)).toBe(true);
    expect(
      occupancy
        .getConnectedIdentityIds()
        .some((candidate) => candidate.isEqual(identityId)),
    ).toBe(true);
  });

  it('excludes a joined participant after its lease disconnects', async () => {
    const call = activeCommunityCall();
    const lease = connectedLease(call);
    lease.disconnect();
    const finder = occupancyFinder([call], [lease]);

    const [occupancy] = await finder.find(communityId);

    expect(occupancy.getConnectedIdentityIds()).toHaveLength(0);
  });

  it('excludes a joined participant when no live lease remains', async () => {
    const call = activeCommunityCall();
    const finder = occupancyFinder([call], []);

    const [occupancy] = await finder.find(communityId);

    expect(occupancy.getConnectedIdentityIds()).toHaveLength(0);
  });

  it('excludes a participant that left while an older lease remains connected', async () => {
    const call = activeCommunityCall();
    const lease = connectedLease(call);
    call.leave(identityId);
    const finder = occupancyFinder([call], [lease]);

    const [occupancy] = await finder.find(communityId);

    expect(occupancy.getConnectedIdentityIds()).toHaveLength(0);
  });

  it('ignores connected leases belonging to another call', async () => {
    const call = activeCommunityCall();
    const otherCall = activeCommunityCall();
    const finder = occupancyFinder([call], [connectedLease(otherCall)]);

    const [occupancy] = await finder.find(communityId);

    expect(occupancy.getConnectedIdentityIds()).toHaveLength(0);
  });

  function activeCommunityCall(): Call {
    return Call.start(
      identityId,
      networkId,
      CallScope.communityChannel(communityId, channelId),
      [],
    );
  }

  function connectedLease(call: Call): CallParticipantLease {
    return CallParticipantLease.connect(
      call.getId(),
      identityId,
      nodeId,
      networkId,
      call.getParticipantIds(),
    );
  }

  function occupancyFinder(
    calls: Call[],
    leases: CallParticipantLease[],
  ): CommunityChannelCallOccupancyFinder {
    const callRepository = mock<CallRepository>();
    const leaseRepository = mock<CallParticipantLeaseRepository>();
    callRepository.findActiveByCommunity.mockResolvedValue(calls);
    leaseRepository.findByCallIds.mockResolvedValue(leases);

    return new CommunityChannelCallOccupancyFinder(
      callRepository,
      leaseRepository,
    );
  }
});

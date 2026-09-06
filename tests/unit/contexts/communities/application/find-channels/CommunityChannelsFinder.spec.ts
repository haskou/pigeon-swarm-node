import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import CallParticipantLeaseRepository from '@app/contexts/calls/domain/repositories/CallParticipantLeaseRepository';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import CommunityChannelsFinder from '@app/contexts/communities/application/find-channels/CommunityChannelsFinder';
import { CommunityChannelsFindMessage } from '@app/contexts/communities/application/find-channels/messages/CommunityChannelsFindMessage';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityProfile } from '@app/contexts/communities/domain/entities/profile/CommunityProfile';
import { CommunitySettings } from '@app/contexts/communities/domain/entities/profile/CommunitySettings';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { CommunityChannelName } from '@app/contexts/communities/domain/value-objects/CommunityChannelName';
import { CommunityDescription } from '@app/contexts/communities/domain/value-objects/CommunityDescription';
import { CommunityName } from '@app/contexts/communities/domain/value-objects/CommunityName';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { mock } from 'jest-mock-extended';

describe('CommunityChannelsFinder voice presence', () => {
  const owner = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const member = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440011');
  const nodeId = new NodeId('550e8400-e29b-41d4-a716-446655440012');

  function fixture() {
    const community = Community.create(
      owner,
      networkId,
      new CommunityProfile(
        new CommunityName('Community'),
        new CommunityDescription('Private community'),
      ),
      CommunitySettings.create(true),
    );
    const channel = community.addVoiceChannel(
      owner,
      new CommunityChannelName('Voice'),
    );
    const calls = mock<CallRepository>();
    const leases = mock<CallParticipantLeaseRepository>();
    const communities = mock<CommunityFinder>();
    const messages = mock<CommunityChannelMessageRepository>();
    communities.findById.mockResolvedValue(community);
    messages.findThreadSummariesByChannel.mockResolvedValue(new Map());
    leases.findByCallIds.mockResolvedValue([]);
    const finder = new CommunityChannelsFinder(
      calls,
      communities,
      messages,
      leases,
    );
    const createCall = (): Call =>
      Call.start(
        owner,
        networkId,
        CallScope.communityChannel(community.getId(), channel.getId()),
        [owner, member],
      );
    const connect = (
      call: Call,
      identityId: IdentityId,
    ): CallParticipantLease =>
      CallParticipantLease.connect(
        call.getId(),
        identityId,
        nodeId,
        networkId,
        call.getParticipantIds(),
      );
    const find = async (): Promise<string[]> => {
      const result = await finder.find(
        new CommunityChannelsFindMessage(
          community.getId().valueOf(),
          owner.valueOf(),
        ),
      );
      return (
        result
          .getConnectedIdentityIdsByChannelId()
          .get(channel.getId().valueOf()) ?? []
      );
    };
    return { calls, leases, createCall, connect, find };
  }

  it('does not report a persisted joined participant without a connection lease', async () => {
    const { calls, createCall, find } = fixture();
    calls.findActiveByCommunity.mockResolvedValue([createCall()]);
    expect(await find()).toEqual([]);
  });

  it('does not report a joined participant whose lease disconnected', async () => {
    const { calls, leases, createCall, connect, find } = fixture();
    const call = createCall();
    const lease = connect(call, owner);
    lease.disconnect();
    calls.findActiveByCommunity.mockResolvedValue([call]);
    leases.findByCallIds.mockResolvedValue([lease]);
    expect(await find()).toEqual([]);
  });

  it('reports a joined participant with a connected lease', async () => {
    const { calls, leases, createCall, connect, find } = fixture();
    const call = createCall();
    calls.findActiveByCommunity.mockResolvedValue([call]);
    leases.findByCallIds.mockResolvedValue([connect(call, owner)]);
    expect(await find()).toEqual([owner.valueOf()]);
  });

  it('does not use a connected lease belonging to another call', async () => {
    const { calls, leases, createCall, connect, find } = fixture();
    calls.findActiveByCommunity.mockResolvedValue([createCall()]);
    leases.findByCallIds.mockResolvedValue([connect(createCall(), owner)]);
    expect(await find()).toEqual([]);
  });

  it('reports a participant once while another node still has a connected lease', async () => {
    const { calls, leases, createCall, connect, find } = fixture();
    const call = createCall();
    const disconnected = connect(call, owner);
    disconnected.disconnect();
    const connected = CallParticipantLease.connect(
      call.getId(),
      owner,
      new NodeId('550e8400-e29b-41d4-a716-446655440013'),
      networkId,
      call.getParticipantIds(),
    );
    calls.findActiveByCommunity.mockResolvedValue([call]);
    leases.findByCallIds.mockResolvedValue([disconnected, connected]);
    expect(await find()).toEqual([owner.valueOf()]);
  });

  it('merges connected participants across calls in one channel without duplicates', async () => {
    const { calls, leases, createCall, connect, find } = fixture();
    const firstCall = createCall();
    firstCall.join(member);
    const secondCall = createCall();
    calls.findActiveByCommunity.mockResolvedValue([firstCall, secondCall]);
    leases.findByCallIds.mockResolvedValue([
      connect(firstCall, owner),
      connect(firstCall, member),
      connect(secondCall, owner),
    ]);
    expect((await find()).sort()).toEqual(
      [owner.valueOf(), member.valueOf()].sort(),
    );
  });
});

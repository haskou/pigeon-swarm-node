import CallParticipantLeaseRepository from '@app/contexts/calls/domain/repositories/CallParticipantLeaseRepository';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';

import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import { CommunityChannelId } from '../../domain/value-objects/CommunityChannelId';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityChannelsDetails } from './CommunityChannelsDetails';
import { CommunityChannelsFindMessage } from './messages/CommunityChannelsFindMessage';

export default class CommunityChannelsFinder {
  private static readonly THREAD_SUMMARY_LIMIT_PER_CHANNEL = 2;

  constructor(
    private readonly callRepository: CallRepository,
    private readonly communityFinder: CommunityFinder,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly participantLeaseRepository: CallParticipantLeaseRepository,
  ) {}

  private async findConnectedIdentityIdsByChannelId(
    message: CommunityChannelsFindMessage,
  ): Promise<Map<string, string[]>> {
    const calls = await this.callRepository.findActiveByCommunity(
      message.communityId,
    );
    const leases = await this.participantLeaseRepository.findByCallIds(
      calls.map((call) => call.getId()),
    );
    const connectedIdentityIdsByChannelId = new Map<string, string[]>();

    for (const call of calls) {
      const channelId = call.getCommunityChannelId();

      if (!channelId) {
        continue;
      }

      connectedIdentityIdsByChannelId.set(
        channelId.valueOf(),
        Array.from(
          new Set([
            ...(connectedIdentityIdsByChannelId.get(channelId.valueOf()) ?? []),
            ...call
              .getJoinedParticipantIds()
              .filter((participantId) =>
                leases.some(
                  (lease) =>
                    lease.belongsToCall(call.getId()) &&
                    lease.belongsTo(participantId) &&
                    lease.isConnected(),
                ),
              )
              .map((participantId) => participantId.valueOf()),
          ]),
        ),
      );
    }

    return connectedIdentityIdsByChannelId;
  }

  public async find(
    message: CommunityChannelsFindMessage,
  ): Promise<CommunityChannelsDetails> {
    const community = await this.communityFinder.findById(message.communityId);

    community.viewAsMember(message.actorIdentityId);
    const visibleTextChannelIds = community
      .visibleChannelsFor(message.actorIdentityId)
      .textChannels.map((channel) => new CommunityChannelId(channel.id));
    const [connectedIdentityIdsByChannelId, threadSummariesByChannelId] =
      await Promise.all([
        this.findConnectedIdentityIdsByChannelId(message),
        this.messageRepository.findThreadSummariesByChannel(
          message.communityId,
          visibleTextChannelIds,
          CommunityChannelsFinder.THREAD_SUMMARY_LIMIT_PER_CHANNEL,
        ),
      ]);

    return new CommunityChannelsDetails(
      community,
      message.actorIdentityId,
      connectedIdentityIdsByChannelId,
      threadSummariesByChannelId,
    );
  }
}

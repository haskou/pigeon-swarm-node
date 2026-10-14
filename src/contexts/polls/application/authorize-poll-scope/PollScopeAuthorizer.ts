import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Poll } from '../../domain/Poll';
import { PollAudience } from '../../domain/PollAudience';
import { PollScope } from '../../domain/PollScope';
import { CommunityChannelPollScopeAuthorizeMessage } from './messages/CommunityChannelPollScopeAuthorizeMessage';
import { PollScopeResolution } from './PollScopeResolution';

export default class PollScopeAuthorizer {
  constructor(private readonly communityRepository: CommunityRepository) {}

  private async authorizeCommunityChannel(
    message: CommunityChannelPollScopeAuthorizeMessage,
    action: 'create' | 'vote',
  ): Promise<PollScopeResolution> {
    const community = await this.communityRepository.requireById(
      message.communityId,
    );

    if (action === 'create') {
      community.authorizeTextChannelPollCreation(
        message.actorIdentityId,
        message.channelId,
      );
    } else {
      community.authorizeTextChannelPollVote(
        message.actorIdentityId,
        message.channelId,
      );
    }

    return new PollScopeResolution(
      PollAudience.communityChannel(),
      PollScope.communityChannel(message.communityId, message.channelId),
    );
  }

  private authorizePollScope(
    actorIdentityId: IdentityId,
    poll: Poll,
    action: 'create' | 'vote',
  ): Promise<PollScopeResolution> {
    const scope = poll.getScope();

    return this.authorizeCommunityChannel(
      new CommunityChannelPollScopeAuthorizeMessage(
        actorIdentityId.valueOf(),
        scope.getCommunityId().valueOf(),
        scope.getChannelId().valueOf(),
      ),
      action,
    );
  }

  public authorizeCommunityChannelCreation(
    message: CommunityChannelPollScopeAuthorizeMessage,
  ): Promise<PollScopeResolution> {
    return this.authorizeCommunityChannel(message, 'create');
  }

  public authorizeCommunityChannelVote(
    message: CommunityChannelPollScopeAuthorizeMessage,
  ): Promise<PollScopeResolution> {
    return this.authorizeCommunityChannel(message, 'vote');
  }

  public authorizePollManagement(
    actorIdentityId: IdentityId,
    poll: Poll,
  ): Promise<PollScopeResolution> {
    return this.authorizePollScope(actorIdentityId, poll, 'create');
  }

  public authorizePollVote(
    actorIdentityId: IdentityId,
    poll: Poll,
  ): Promise<PollScopeResolution> {
    return this.authorizePollScope(actorIdentityId, poll, 'vote');
  }
}

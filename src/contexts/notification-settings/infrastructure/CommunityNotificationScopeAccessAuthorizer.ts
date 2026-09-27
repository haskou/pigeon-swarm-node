import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import NotificationScopeAccessAuthorizer from '../domain/services/NotificationScopeAccessAuthorizer';
import { NotificationSettingScope } from '../domain/value-objects/NotificationSettingScope';

export default class CommunityNotificationScopeAccessAuthorizer extends NotificationScopeAccessAuthorizer {
  public constructor(
    private readonly communityRepository: CommunityRepository,
  ) {
    super();
  }

  public async authorize(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<void> {
    const communityId = scope.getCommunityId();

    assert(communityId, new CommunityNotFoundError());
    const community = await this.communityRepository.findById(communityId);
    assert(community, new CommunityNotFoundError());
    const channelId = scope.getChannelId();

    if (channelId) {
      community.viewChannel(identityId, channelId);

      return;
    }

    community.viewAsMember(identityId);
  }
}

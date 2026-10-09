import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from './Community';
import { InvalidMLSRecordError } from './errors/InvalidMLSRecordError';
import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityId } from './value-objects/CommunityId';

/**
 * A community has one MLS group (`groupId` = community id) and one more per
 * restricted channel (`communityId:channelId`). Only members who may see the
 * channel can write to, or be addressed in, its group.
 */
export class MLSGroupAccess {
  public static assert(
    community: Community,
    groupId: string,
    author: IdentityId,
    recipient?: IdentityId,
  ): void {
    const [communityId, channelId, ...rest] = groupId.split(':');

    if (
      !community.getId().isEqual(new CommunityId(communityId)) ||
      rest.length > 0
    ) {
      throw new InvalidMLSRecordError();
    }

    for (const identity of [author, recipient]) {
      if (!identity) continue;
      community.viewAsMember(identity);

      if (channelId !== undefined) {
        community.viewChannel(identity, new CommunityChannelId(channelId));
      }
    }
  }
}

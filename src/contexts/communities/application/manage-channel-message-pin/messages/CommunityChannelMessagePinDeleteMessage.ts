import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelMessagePinDeleteMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly messageId: CommunityChannelMessageId;

  constructor(
    actorIdentityId: string,
    communityId: string,
    channelId: string,
    messageId: string,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.channelId = new CommunityChannelId(channelId);
    this.messageId = new CommunityChannelMessageId(messageId);
  }
}

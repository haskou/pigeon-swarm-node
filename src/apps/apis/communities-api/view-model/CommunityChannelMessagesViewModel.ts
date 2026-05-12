import { CommunityChannelMessage } from '@app/contexts/communities/domain/CommunityChannelMessage';

import { CommunityChannelMessagesResource } from '../resources/CommunityChannelMessagesResource';
import { CommunityChannelMessageViewModel } from './CommunityChannelMessageViewModel';

export class CommunityChannelMessagesViewModel {
  constructor(
    private readonly communityId: string,
    private readonly channelId: string,
    private readonly messages: CommunityChannelMessage[],
  ) {}

  public toResource(): CommunityChannelMessagesResource {
    const messageResources = this.messages.map((message) =>
      new CommunityChannelMessageViewModel(message).toResource(),
    );
    const firstMessage = messageResources.at(0);

    return {
      channelId: this.channelId,
      communityId: this.communityId,
      messages: messageResources,
      nextBeforeMessageId: firstMessage?.id,
    };
  }
}

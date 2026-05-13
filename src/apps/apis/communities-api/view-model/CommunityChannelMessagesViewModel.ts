import { CommunityChannelMessage } from '@app/contexts/communities/domain/CommunityChannelMessage';

import { CommunityChannelCallEventResource } from '../resources/CommunityChannelCallEventResource';
import {
  CommunityChannelMessagesResource,
  CommunityChannelTimelineItemResource,
} from '../resources/CommunityChannelMessagesResource';
import { CommunityChannelMessageViewModel } from './CommunityChannelMessageViewModel';

export class CommunityChannelMessagesViewModel {
  constructor(
    private readonly communityId: string,
    private readonly channelId: string,
    private readonly messages: CommunityChannelMessage[],
    private readonly callEvents: CommunityChannelCallEventResource[] = [],
  ) {}

  public toResource(): CommunityChannelMessagesResource {
    const messageResources = this.messages.map((message) =>
      new CommunityChannelMessageViewModel(message).toResource(),
    );
    const firstMessage = messageResources.at(0);
    const timeline: CommunityChannelTimelineItemResource[] = [
      ...messageResources,
      ...this.callEvents,
    ].sort((first, second) => first.createdAt - second.createdAt);

    return {
      channelId: this.channelId,
      communityId: this.communityId,
      messages: timeline,
      nextBeforeMessageId: firstMessage?.id,
    };
  }
}

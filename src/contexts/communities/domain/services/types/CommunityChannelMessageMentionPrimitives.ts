import { CommunityChannelMessage } from '../../entities/messages/CommunityChannelMessage';

export type CommunityChannelMessageMentionPrimitives = ReturnType<
  CommunityChannelMessage['toPrimitives']
>['mentions'];

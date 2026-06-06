import { CommunityChannelMessage } from '../../CommunityChannelMessage';

export type CommunityChannelMessageMentionPrimitives = ReturnType<
  CommunityChannelMessage['toPrimitives']
>['mentions'];

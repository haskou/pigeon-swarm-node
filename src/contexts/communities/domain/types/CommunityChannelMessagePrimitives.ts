import { CommunityChannelMessage } from '../CommunityChannelMessage';

export type CommunityChannelMessagePrimitives = ReturnType<
  CommunityChannelMessage['toPrimitives']
>;

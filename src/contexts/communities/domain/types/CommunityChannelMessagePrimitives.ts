import { CommunityChannelMessage } from '../entities/messages/CommunityChannelMessage';

export type CommunityChannelMessagePrimitives = ReturnType<
  CommunityChannelMessage['toPrimitives']
>;

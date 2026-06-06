import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';

export type CommunitySyncData = {
  community: Community | undefined;
  messages: CommunityChannelMessage[];
  reactions: CommunityChannelMessageReaction[];
};

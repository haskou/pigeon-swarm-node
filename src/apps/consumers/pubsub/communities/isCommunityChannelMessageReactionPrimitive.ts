import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';

const communityChannelMessageReactionPrimitiveKeys = [
  'authorIdentityId',
  'channelId',
  'communityId',
  'createdAt',
  'emoji',
  'messageId',
  'mutationProof',
];

export function isCommunityChannelMessageReactionPrimitive(
  reaction: unknown,
): reaction is ReturnType<CommunityChannelMessageReaction['toPrimitives']> & {
  mutationProof: unknown;
} {
  return (
    typeof reaction === 'object' &&
    reaction !== null &&
    communityChannelMessageReactionPrimitiveKeys.every((key) => key in reaction)
  );
}

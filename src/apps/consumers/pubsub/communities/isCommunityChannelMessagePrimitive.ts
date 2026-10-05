import { CommunityChannelMessageCandidate } from './CommunityChannelMessageCandidate';

const communityChannelMessagePrimitiveKeys = [
  'authorIdentityId',
  'channelId',
  'communityId',
  'createdAt',
  'encryptedPayload',
  'id',
  'type',
];

export function isCommunityChannelMessagePrimitive(
  message: unknown,
): message is CommunityChannelMessageCandidate {
  return (
    typeof message === 'object' &&
    message !== null &&
    communityChannelMessagePrimitiveKeys.every((key) => key in message)
  );
}

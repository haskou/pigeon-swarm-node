import { CommunityChannelMessagePrimitives } from '@app/contexts/communities/domain/CommunityChannelMessage';

const communityChannelMessagePrimitiveKeys = [
  'attachmentExternalIdentifiers',
  'authorIdentityId',
  'channelId',
  'communityId',
  'createdAt',
  'encryptedPayload',
  'id',
  'signature',
  'type',
];

export function isCommunityChannelMessagePrimitive(
  message: unknown,
): message is CommunityChannelMessagePrimitives {
  return (
    typeof message === 'object' &&
    message !== null &&
    communityChannelMessagePrimitiveKeys.every((key) => key in message)
  );
}

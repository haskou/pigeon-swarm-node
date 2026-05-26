import { Community } from '@app/contexts/communities/domain/Community';
import { PrimitiveOf } from '@haskou/value-objects';

const communityPrimitiveKeys = [
  'autoJoinEnabled',
  'createdAt',
  'description',
  'id',
  'memberIds',
  'name',
  'networkId',
  'ownerIdentityId',
  'textChannels',
  'visibility',
];

export function isCommunityPrimitive(
  community: unknown,
): community is PrimitiveOf<Community> {
  return (
    typeof community === 'object' &&
    community !== null &&
    communityPrimitiveKeys.every((key) => key in community)
  );
}

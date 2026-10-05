import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export const owner = new IdentityId(
  'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
);
export const alice = new IdentityId(
  'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
);
export const mallory = new IdentityId(
  'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
);
export const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
export const nonce = 'genesis-nonce';
export const communityId = CommunityId.derive(
  networkId.valueOf(),
  owner.valueOf(),
  nonce,
);

export function operation(
  action: CommunityOperationAction,
  author: IdentityId,
  args: Record<string, unknown>,
  parents: CommunityOperation[],
  createdAt = 1,
): CommunityOperation {
  return CommunityOperation.create({
    action,
    args,
    authorIdentityId: author,
    communityId,
    createdAt,
    networkId,
    parents: parents.map((parent) => parent.getHash()),
  });
}

export function genesis(autoJoinEnabled = false): CommunityOperation {
  return operation(
    CommunityOperationAction.COMMUNITY_CREATED,
    owner,
    {
      autoJoinEnabled,
      description: 'A community',
      discoverable: true,
      name: 'Community',
      nonce,
      visibility: 'public',
    },
    [],
  );
}

export function join(
  parents: CommunityOperation[],
  member: IdentityId,
  author = owner,
): CommunityOperation {
  return operation(
    CommunityOperationAction.MEMBER_JOINED,
    author,
    { identityId: member.valueOf(), method: 'added' },
    parents,
  );
}

export function ban(
  parents: CommunityOperation[],
  member: IdentityId,
  author = owner,
): CommunityOperation {
  return operation(
    CommunityOperationAction.MEMBER_BANNED,
    author,
    { identityId: member.valueOf() },
    parents,
  );
}
